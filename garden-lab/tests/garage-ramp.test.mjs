import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {terrainAt,pointInPolygon} from '../src/geometry.js';
import {GARAGE_DEFAULTS} from '../src/garage-options.js';
import {CYBERSTER_AWD,garageLayout,garagePlanFrame,garageProfileAt,garageVehiclePose,garageWheelContact} from '../src/garage-ramp.js';

const data=JSON.parse(fs.readFileSync(new URL('../data/site-data.json',import.meta.url),'utf8'));
const settings={...GARAGE_DEFAULTS,siteId:'sternicza-11',basementGarageEnabled:true,floorHeight:1.2};
const getLayout=patch=>garageLayout({...settings,...patch},data,{terrainAt});
const candidate=getLayout();
const near=(actual,expected,tolerance=1e-8)=>assert.ok(Math.abs(actual-expected)<=tolerance,
  actual+' should be within '+tolerance+' of '+expected);
const dot=(a,b)=>a.reduce((sum,value,i)=>sum+value*b[i],0);
const distance=(a,b)=>Math.hypot(...a.map((value,i)=>value-b[i]));
const road=(design,s)=>garageProfileAt({design},s);
const atRear=(layout,reverse,rearS)=>{
  const v=layout.vehicle,start=reverse?-v.rearOverhang-.3:-v.wheelbase-v.frontOverhang-.3;
  const end=reverse?layout.roomRearS-v.rearOverhang-.3:layout.roomRearS-v.wheelbase-v.frontOverhang-.3;
  return garageVehiclePose(layout,(rearS-start)/(end-start),reverse);
};

test('the optional garage derives its level from the assumed raised living floor and slab',()=>{
  near(candidate.livingFloorZ,data.site.floorReference.z+1.2);
  near(candidate.floorZ,candidate.livingFloorZ-.25-2.30);
  near(candidate.drop,terrainAt(...candidate.axis.start,data)-candidate.floorZ);
  assert.ok(candidate.drop>1.39&&candidate.drop<1.41);
  const lowered=getLayout({garageExtraDepth:.6});
  near(lowered.floorZ,candidate.floorZ-.6);
  near(lowered.drop,candidate.drop+.6);
  const noFill=getLayout({gardenRaise:1.4});
  assert.equal(noFill,candidate,'rear garden fill cannot alter the front driveway or its assessment');
  assert.equal(garageLayout({...settings,basementGarageEnabled:false},data).assessment,null);
  assert.equal(garagePlanFrame({...settings,siteId:'nadmorska-17'},data).supported,false);
});

test('the driveway uses the actual frontage and facade without cutting outside the cadastral plot',()=>{
  const f=garagePlanFrame(settings,data);
  assert.ok(f.frontRun>9.09&&f.frontRun<9.15);
  near(dot(f.axis.direction,f.axis.normal),0);
  near(Math.hypot(...f.axis.direction),1);
  for(const point of [...f.outerFootprint,...f.clearFootprint,...f.roomFootprint,...f.roomFloorFootprint,f.gate.a,f.gate.b]){
    assert.ok(pointInPolygon(point,data.site.boundary),'excavation and gate must remain inside the mapped parcel');
  }
  for(const point of f.roomFootprint)assert.ok(pointInPolygon(point,data.site.house.footprint));
  for(const point of [...f.entrancePoints,f.gate.a,f.gate.b])near(point[1],0,1e-8);
  const a=data.site.house.footprint[0],b=data.site.house.footprint[1],p=f.axis.end;
  near((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]),0,1e-7);
  near(f.insideRun,2);near(f.totalRun,f.frontRun+2);
  assert.ok(f.gate.width>=f.outerWidth+.399);
});

test('the proposed road profile is continuous in both height and gradient at every join',()=>{
  const d=candidate.design;
  for(const s of d.breaks){
    const left=road(d,s-1e-7),right=road(d,s+1e-7);
    near(left.z,right.z,1e-6);near(left.grade,right.grade,1e-6);
  }
  near(road(d,0).z,candidate.streetZ);
  near(road(d,d.totalRun).z,candidate.floorZ);
  near(road(d,-2).grade,0);near(road(d,d.totalRun+2).grade,0);
  assert.ok(d.peakGrade<=.25+1e-9);
  assert.ok(candidate.profile.some(p=>p.s===candidate.frontRun),'portal station must be sampled exactly');
  assert.ok(candidate.profile.some(p=>p.s===candidate.totalRun));
});

test('circular tyre contact uses the normal radius on either constant grade',()=>{
  for(const slope of [-.25,0,.25]){
    const design={pieces:[{lo:-Infinity,hi:Infinity,a:0,b:slope,c:2}]};
    for(const radius of [CYBERSTER_AWD.frontRadius,CYBERSTER_AWD.rearRadius]){
      const x=3,c=garageWheelContact(design,x,radius),q=Math.sqrt(1+slope*slope);
      near(c.z,2+slope*x+radius*q,1e-9);
      near(c.contactX,x+radius*slope/q,1e-9);
      near(Math.hypot(c.x-c.contactX,c.z-c.contactZ),radius,1e-9);
      near(c.z-c.contactZ,radius/q,1e-9);
    }
  }
});

test('both tyres stay tangent to crest and valley curves without penetrating their road envelope',()=>{
  const d=candidate.design;
  for(const s of [0,.8,d.topTransition/2,d.topTransition,d.valleyStart,d.valleyStart+d.bottomTransition/2,d.curvedRun]){
    for(const radius of [CYBERSTER_AWD.frontRadius,CYBERSTER_AWD.rearRadius]){
      const c=garageWheelContact(d,s,radius);
      near(Math.hypot(s-c.contactX,c.z-c.contactZ),radius,1e-8);
      near(c.contactZ,road(d,c.contactX).z,1e-10);
      for(let i=0;i<=60;i++){
        const dx=radius*(-1+2*i/60),lower=c.z-Math.sqrt(Math.max(0,radius*radius-dx*dx));
        assert.ok(lower>=road(d,s+dx).z-1e-8,'a circle supported at one point may not cut through the rest of the curve');
      }
    }
  }
});

test('forward and reverse poses preserve unequal-radius axle geometry and a rigid orthonormal frame',()=>{
  const v=candidate.vehicle;
  for(const reverse of [false,true])for(const progress of [0,.18,.37,.55,.72,1]){
    const pose=garageVehiclePose(candidate,progress,reverse);
    const a=[pose.rearAxle.x,pose.rearAxle.y,pose.rearAxle.z],b=[pose.frontAxle.x,pose.frontAxle.y,pose.frontAxle.z];
    near(distance(a,b),Math.hypot(v.wheelbase,v.frontRadius-v.rearRadius),1e-7);
    near(distance(pose.localToWorld(v.wheelbase,0,v.frontRadius-v.rearRadius),b),0,1e-7);
    near(distance(pose.localToWorld(0,0,0),a),0,1e-10);
    near(dot(pose.basis.forward,pose.basis.up),0,1e-9);
    for(const basis of Object.values(pose.basis))near(Math.hypot(...basis),1,1e-9);
    for(const wheel of pose.sideWheels){
      near(wheel.z,garageWheelContact(candidate.design,wheel.s,wheel.radius).z,1e-8);
    }
    assert.equal(pose.wheels.length,4);
    if(progress===0||progress===1){near(pose.minimumClearance,v.clearance,1e-7);near(pose.pitchRadians,0,1e-7);}
  }
});

test('the candidate clears the loaded flat underside with a guarded reserve in both orientations',()=>{
  const a=candidate.assessment;
  near(candidate.vehicle.clearance,.1056);
  near(a.requiredMargin,.03);near(a.numericalAllowance,.001);
  near(a.conservativeClearance,a.minimumClearance-a.numericalAllowance);
  assert.ok(a.conservativeClearance>.039&&a.conservativeClearance<.043);
  assert.ok(a.forward.minimumClearance>.04&&a.reverse.minimumClearance>.04);
  assert.equal(a.clearancePass,true);assert.equal(a.geometryPass,true);assert.equal(a.passes,true);
  assert.equal(a.status,'conditional-clearance');
  assert.equal(a.thresholdResolved,false);assert.equal(a.roadApproachSurveyed,false);
  assert.ok(a.warnings.some(w=>w.includes('30 mm edge is not included')));
  assert.ok(a.warnings.some(w=>w.includes('tyre radii are nominal')));
  assert.ok(a.forward.posesChecked>500&&a.reverse.posesChecked>500);
  assert.equal(a.posesChecked,a.forward.posesChecked+a.reverse.posesChecked);
});

test('the full-front-yard and deeper comparisons cannot silently raise the floor to produce a pass',()=>{
  const front=getLayout({garageInsideRun:0}),deep=getLayout({garageExtraDepth:.6});
  near(front.floorZ,candidate.floorZ);
  assert.ok(front.assessment.minimumClearance<.01);
  assert.equal(front.assessment.clearancePass,false);
  assert.equal(front.assessment.passes,false);
  near(deep.floorZ,candidate.floorZ-.6);
  assert.ok(deep.assessment.minimumClearance<0);
  assert.equal(deep.assessment.status,'contact');
  assert.equal(deep.assessment.passes,false);
});

test('portal headroom, a real door allowance and the covered parking bay are checked separately',()=>{
  const a=candidate.assessment;
  near(candidate.portal.bottomZ,road(candidate.design,candidate.frontRun).z);
  near(candidate.portal.topZ-candidate.portal.bottomZ,2.10);
  near(candidate.portal.assumedDoorClearHeight,2.10);
  assert.ok(candidate.portal.topZ<candidate.ceilingZ,'the model must leave an allowance below the soffit for the door');
  assert.ok(a.minCoveredHeadroom>2.25&&a.minCoveredHeadroom<2.26);
  assert.ok(a.parkingFlatLength>6.9);
  assert.equal(a.structuralHeadroomPass,true);assert.equal(a.widthBenchmarkPass,true);assert.equal(a.doorBenchmarkPass,true);
  for(const direction of [a.forward,a.reverse]){
    assert.ok(direction.portalPosesChecked>100&&direction.coveredPosesChecked>200);
    assert.ok(direction.minimumPortalClearance>.70);
    assert.ok(direction.minimumPortalClearance<direction.minimumSoffitClearance);
    near(direction.minimumOverheadClearance,Math.min(direction.minimumPortalClearance,direction.minimumSoffitClearance));
  }
  assert.equal(a.portalPosesChecked,a.forward.portalPosesChecked+a.reverse.portalPosesChecked);
  const low=getLayout({garageClearHeight:2.2});
  assert.equal(low.assessment.structuralHeadroomPass,false,'an indoor slope can violate headroom despite a 2.20 m flat-floor ceiling');
  assert.equal(low.assessment.geometryPass,false);
  const narrow=getLayout({garageRampWidth:2.8});
  assert.equal(narrow.assessment.widthBenchmarkPass,false);
  assert.equal(narrow.assessment.geometryPass,false);
});

test('fixed-pose Euclidean minima agree with an independent dense road-to-segment distance calculation',()=>{
  const distanceToSegment=(point,a,b)=>{
    const dx=b.s-a.s,dz=b.z-a.z,t=Math.max(0,Math.min(1,((point.s-a.s)*dx+(point.z-a.z)*dz)/(dx*dx+dz*dz)));
    return Math.hypot(point.s-(a.s+t*dx),point.z-(a.z+t*dz));
  };
  for(const reverse of [false,true]){
    const result=reverse?candidate.assessment.reverse:candidate.assessment.forward;
    for(const rearS of [result.criticalRearS,candidate.design.valleyStart]){
      const pose=atRear(candidate,reverse,rearS),[a,b]=pose.underbody;
      const lo=Math.min(a.s,b.s)-.3,hi=Math.max(a.s,b.s)+.3;
      let sampled=Infinity;
      for(let s=lo;s<=hi;s+=.0005)sampled=Math.min(sampled,distanceToSegment({s,z:road(candidate.design,s).z},a,b));
      assert.ok(pose.minimumClearance<=sampled+1e-7);
      assert.ok(sampled-pose.minimumClearance<.0005,'reported distance must match an independent geometric calculation');
    }
  }
});

test('the refined full sweep covers dense previews and identifies a reproducible limiting pose',()=>{
  const a=candidate.assessment;
  for(const reverse of [false,true]){
    const assessment=reverse?a.reverse:a.forward;
    const critical=garageVehiclePose(candidate,assessment.criticalProgress,reverse);
    near(critical.minimumClearance,assessment.minimumClearance,1e-8);
    let previewMinimum=Infinity;
    for(let i=0;i<=700;i++)previewMinimum=Math.min(previewMinimum,garageVehiclePose(candidate,i/700,reverse).minimumClearance);
    assert.ok(assessment.minimumClearance<=previewMinimum+2e-5);
  }
});

test('assessment caching survives building wrappers but invalidates actual terrain and car changes',()=>{
  const baseline=getLayout();
  const wrapper={...data,buildings:[]};
  assert.equal(garageLayout({...settings,garageProgress:91,garageReverse:true,sunHour:21},wrapper,{terrainAt}),baseline);
  const lowerCar=getLayout({garageClearanceMm:95});
  assert.notEqual(lowerCar,baseline);
  assert.ok(lowerCar.assessment.minimumClearance<baseline.assessment.minimumClearance-.009);
  const alteredTerrain={...data,terrain:{...data.terrain}};
  const newTerrainLayout=garageLayout(settings,alteredTerrain,{terrainAt});
  assert.notEqual(newTerrainLayout,baseline);
  near(newTerrainLayout.assessment.minimumClearance,baseline.assessment.minimumClearance,1e-8);
});
