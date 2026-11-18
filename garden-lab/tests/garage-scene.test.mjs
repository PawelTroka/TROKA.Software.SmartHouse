import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {terrainAt,pointInPolygon} from '../src/geometry.js';
import {toWorld,fromWorld,toWorldTriangle} from '../src/orientation.js';
import {garageLayout,garageVehiclePose,garageProfileAt} from '../src/garage-ramp.js';
import {GARAGE_DEFAULTS} from '../src/garage-options.js';
import {subtractConvexOpening,subtractGarageOpenings,garageTerrainCutouts,garageFacadePanels,
  createGarageGroup,createGarageAwarePaving} from '../src/scene-garage.js';
import {designTerrainCutouts} from '../src/scene.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const settings={...GARAGE_DEFAULTS,basementGarageEnabled:true,floorHeight:1.2,gardenProgram:'spa-pool-grove'};
const layout=garageLayout(settings,data,{terrainAt});
const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
const materials={stone:material,metal:material};
const near=(actual,expected,tolerance=2e-5)=>assert.ok(Math.abs(actual-expected)<=tolerance,actual+' differs from '+expected);
const polygonArea=points=>Math.abs(points.reduce((sum,p,i)=>{
  const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1];
},0)/2);
const area=pieces=>pieces.reduce((sum,piece)=>sum+polygonArea(piece),0);
const v3=point=>new THREE.Vector3(...toWorld(...point));
const station=(s,lateral,z)=>v3([...layout.at(s,lateral),z]);
const render=svgMode=>createGarageGroup(layout,materials,{svgMode,groundAt:(x,y)=>terrainAt(x,y,data)});
const bounds=object=>{object.updateWorldMatrix(true,true);return new THREE.Box3().setFromObject(object);};

test('exact excavation subtraction retains area around skew, touching and overlapping openings',()=>{
  const square=[[0,0],[10,0],[10,10],[0,10]],diamond=[[2,5],[5,2],[8,5],[5,8]];
  for(const opening of [diamond,[...diamond].reverse()])near(area(subtractConvexOpening(square,opening)),82,1e-9);
  near(area(subtractConvexOpening(square,[[-1,-1],[11,-1],[11,11],[-1,11]])),0,1e-9);
  near(area(subtractConvexOpening(square,[[4,-1],[6,-1],[6,5],[4,5]])),90,1e-9);
  near(area(subtractConvexOpening(square,[[10,0],[12,0],[12,10],[10,10]])),100,1e-9);
  near(area(subtractConvexOpening([[0,0],[10,0],[0,10]],[[0,0],[2,0],[2,2],[0,2]])),46,1e-9);
  const cuts=[[[2,2],[6,2],[6,8],[2,8]],[[4,4],[8,4],[8,9],[4,9]]];
  near(area(subtractGarageOpenings(square,cuts)),64,1e-9);
  for(const piece of subtractConvexOpening(square,diamond))assert.ok(polygonArea(piece)>0);
});

test('the optional ramp and indoor bay create real terrain openings only at Sternicza',()=>{
  const off={...settings,basementGarageEnabled:false},existing=designTerrainCutouts(off,data);
  assert.deepEqual(garageTerrainCutouts(garageLayout(off,data,{terrainAt})),[]);
  const openings=garageTerrainCutouts(layout);
  assert.equal(openings.length,2);
  assert.deepEqual(designTerrainCutouts(settings,data),[...existing,...openings]);
  for(const opening of openings)for(const p of opening.polygon)
    assert.ok(pointInPolygon(p,data.site.boundary),'Excavation must remain inside the mapped parcel');
  for(const id of ['nadmorska-17','korzeniowskiego-40']){
    const other={...data,site:{...data.site,id}};
    assert.deepEqual(garageTerrainCutouts(garageLayout(settings,other,{terrainAt})),[]);
    assert.equal(createGarageGroup(garageLayout(settings,other,{terrainAt}),materials).group.children.length,0);
  }
  const courtyard=[[0,0],[20,0],[20,20],[0,20]],remaining=subtractGarageOpenings(courtyard,openings);
  for(const s of [1,layout.axis.frontRun-.2,layout.axis.totalRun+.2,layout.roomRearS-.2]){
    const p=layout.at(s);
    assert.ok(remaining.every(piece=>!pointInPolygon(p,piece)),'Original ground must not seal station '+s);
  }
});

test('cutting the facade leaves a finite open portal while retaining its header and adjacent wall',()=>{
  const [a,b]=data.site.house.footprint,base=data.site.house.baseZ,top=data.site.house.roofZ;
  const facade=enabled=>{
    const panels=garageFacadePanels(a,b,base,top,{...layout,enabled}),g=new THREE.BufferGeometry();
    const triangles=panels.flatMap(([p,q,r,s])=>[toWorldTriangle(p,q,r),toWorldTriangle(p,r,s)]);
    g.setAttribute('position',new THREE.Float32BufferAttribute(triangles.flat(2),3));
    return new THREE.Mesh(g,material);
  };
  const active=facade(true),closed=facade(false);
  const hit=(mesh,lateral,z)=>{
    const origin=station(layout.axis.frontRun-1,lateral,z);
    const direction=new THREE.Vector3(layout.axis.direction[0],0,layout.axis.direction[1]);
    return new THREE.Raycaster(origin,direction,0,2).intersectObject(mesh).length;
  };
  const eye=Math.max(base+.15,layout.portal.bottomZ+.7);
  assert.ok(eye<layout.portal.topZ-.1);
  assert.equal(hit(active,0,eye),0,'The entrance cannot remain a closed house triangle');
  assert.ok(hit(closed,0,eye)>0,'The disabled design restores the original facade');
  assert.ok(hit(active,layout.clearWidth/2+.25,eye)>0);
  assert.ok(hit(active,0,layout.portal.topZ+.12)>0);
});

test('rendered basement has the actual soffit underside and door lintel in both renderers',()=>{
  for(const svgMode of [false,true]){
    const {group}=render(svgMode),ceiling=group.getObjectByName('garage-basement-ceiling');
    const origin=station(layout.axis.totalRun+.5,0,layout.floorZ+.5);
    const hits=new THREE.Raycaster(origin,new THREE.Vector3(0,1,0),0,5).intersectObject(ceiling);
    assert.ok(hits.length>0,'Ceiling must have a visible lower face');
    near(hits[0].point.y,layout.portal.ceilingZ);
    near(bounds(ceiling).min.y,layout.portal.ceilingZ);
    near(bounds(ceiling).max.y,layout.livingFloorZ);
    const lintel=group.getObjectByName('garage-portal-lintel');
    near(bounds(lintel).min.y,layout.portal.topZ);
    const floor=group.getObjectByName('garage-basement-parking-floor');
    near(bounds(floor).max.y,layout.floorZ);
  }
});

test('ramp vertices and both drainage grates follow the analytic road without artificial bumps',()=>{
  const {group}=render(false);
  for(const name of ['garage-ramp-surface','garage-entry-drain','garage-lower-drain']){
    const mesh=group.getObjectByName(name),position=mesh.geometry.getAttribute('position');
    assert.ok(position.count>=6);
    for(let i=0;i<position.count;i++){
      const [x,y,z]=fromWorld(position.getX(i),position.getY(i),position.getZ(i));
      const s=(x-layout.axis.start[0])*layout.axis.direction[0]+(y-layout.axis.start[1])*layout.axis.direction[1];
      near(z,garageProfileAt(layout,s).z);
    }
  }
  const entry=group.getObjectByName('garage-entry-drain').geometry.getAttribute('position');
  for(let i=0;i<entry.count;i++){
    const p=fromWorld(entry.getX(i),entry.getY(i),entry.getZ(i));
    const s=(p[0]-layout.axis.start[0])*layout.axis.direction[0]+(p[1]-layout.axis.start[1])*layout.axis.direction[1];
    assert.ok(s<layout.axis.frontRun,'An exterior trench must precede the facade');
  }
});

test('existing front paving is removed across the driveway instead of bridging the excavation',()=>{
  const paving=createGarageAwarePaving({x:4.1,y:1.7,width:10.9,length:1.1},3,.04,material,layout);
  const at=layout.at(2.2),ray=new THREE.Raycaster(v3([...at,10]),new THREE.Vector3(0,-1,0),0,20);
  assert.equal(ray.intersectObject(paving,true).length,0);
  const sideRay=new THREE.Raycaster(v3([6,2.2,10]),new THREE.Vector3(0,-1,0),0,20);
  assert.ok(sideRay.intersectObject(paving,true).length>0,'Paving outside the new driveway is retained');
});

test('Cyberster wheels share the physical axle pose and nominal radii throughout both directions',()=>{
  for(const svgMode of [false,true]){
    const rendered=render(svgMode);
    for(const reverse of [false,true])for(const progress of [0,.4,1]){
      const pose=garageVehiclePose(layout,progress,reverse);
      rendered.setVehiclePose(pose);rendered.group.updateMatrixWorld(true);
      for(const wheel of pose.wheels){
        const object=rendered.group.getObjectByName('garage-cyberster-wheel-'+wheel.axle+'-'+wheel.side);
        const actual=object.getWorldPosition(new THREE.Vector3()),expected=v3(wheel.center);
        near(actual.distanceTo(expected),0,1e-8);
        near(object.children[0].geometry.parameters.radiusTop,wheel.radius,1e-9);
      }
      for(const axle of ['front','rear']){
        const left=rendered.group.getObjectByName('garage-cyberster-wheel-'+axle+'--1').getWorldPosition(new THREE.Vector3());
        const right=rendered.group.getObjectByName('garage-cyberster-wheel-'+axle+'-1').getWorldPosition(new THREE.Vector3());
        const actual=left.add(right).multiplyScalar(.5),expected=pose[axle+'Axle'];
        near(actual.distanceTo(v3([expected.x,expected.y,expected.z])),0,1e-7);
      }
    }
  }
});

test('the concept car keeps the published envelope and shared conservative flat underside',()=>{
  const {group}=render(false),car=group.getObjectByName('garage-cyberster');
  const b=bounds(car),v=layout.vehicle,r=v.rearRadius;
  near(b.max.z-b.min.z,v.length);
  near(b.max.x-b.min.x,v.mirrorWidth);
  near(b.max.y+r,v.height);
  const body=car.getObjectByName('garage-cyberster-body').geometry.getAttribute('position');
  let lowest=Infinity;
  for(let i=0;i<body.count;i++)lowest=Math.min(lowest,body.getY(i));
  near(lowest+r,v.clearance);
  assert.equal(car.userData.vehicle.conceptShell,true);
});

test('both rendered cars occupy separate lanes inside the widened bay and one remains parked',()=>{
  const projectedBounds=object=>{
    const out={l0:Infinity,l1:-Infinity,s0:Infinity,s1:-Infinity};
    object.updateWorldMatrix(true,true);
    object.traverse(child=>{
      const attr=child.geometry?.getAttribute('position');if(!attr)return;
      for(let i=0;i<attr.count;i++){
        const world=new THREE.Vector3().fromBufferAttribute(attr,i).applyMatrix4(child.matrixWorld),p=fromWorld(world.x,world.y,world.z);
        const dx=p[0]-layout.axis.start[0],dy=p[1]-layout.axis.start[1],l=dx*layout.axis.normal[0]+dy*layout.axis.normal[1],s=dx*layout.axis.direction[0]+dy*layout.axis.direction[1];
        out.l0=Math.min(out.l0,l);out.l1=Math.max(out.l1,l);out.s0=Math.min(out.s0,s);out.s1=Math.max(out.s1,s);
      }
    });return out;
  };
  for(const svgMode of [false,true]){
    const rendered=render(svgMode),primary=rendered.group.getObjectByName('garage-cyberster'),second=rendered.group.getObjectByName('garage-second-car');
    assert.ok(primary&&second);assert.ok(rendered.group.getObjectByName('garage-bay-divider'));
    const parkedMatrix=second.matrix.toArray(),parked=projectedBounds(second);
    for(const reverse of [false,true])for(const progress of [0,.4,.8,1]){
      rendered.setVehiclePose(garageVehiclePose(layout,progress,reverse));rendered.group.updateMatrixWorld(true);
      const moving=projectedBounds(primary);
      assert.deepEqual(second.matrix.toArray(),parkedMatrix,'preview movement must leave the second car parked');
      near(moving.l0-parked.l1,layout.parking.betweenMirrors);
      for(const car of [moving,parked]){
        assert.ok(car.l0>=-layout.clearWidth/2+.3949);assert.ok(car.l1<=layout.clearWidth/2-.3949);
      }
      if(progress===1)for(const car of [moving,parked]){
        assert.ok(car.s0>=layout.design.curvedRun+.299);
        assert.ok(car.s1<=layout.roomRearS-.299);
      }
    }
  }
  const old=garageLayout({...settings,garageSpaces:1,garageRampWidth:3.2},data,{terrainAt});
  assert.ok(createGarageGroup(old,materials).group.getObjectByName('garage-second-car'));
});
