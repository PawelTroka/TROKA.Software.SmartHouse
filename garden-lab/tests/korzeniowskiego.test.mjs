import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {getSiteProfile} from '../src/sites.js';
import {createStateModel} from '../src/state.js';
import {toWorld,gazeDirection} from '../src/orientation.js';
import {gardenGroundAt,floorElevation,observerForPreset,jacuzziBounds,canopyBounds,
  pointInPolygon,hedgeSegments,analyzeVisibility} from '../src/geometry.js';
import {polygonArea,gardenQuantities,estimateCosts} from '../src/costs.js';
import {budgetSideLabels} from '../src/budget-view.js';
import {prepareSunGeometry,analyzeSunlight,firstSunBlocker,sampledRoofFaces} from '../src/shade.js';
import {sunForSettings,localSunDirection} from '../src/solar.js';
import {rectCorners,gardenFurniture,terraceStairs,rectanglesOverlap} from '../src/layout.js';
import {localRoofEnvelope} from '../src/roof-envelope.js';

const data=JSON.parse(readFileSync(new URL('../data/korzeniowskiego-40.json',import.meta.url)));
const sternicza=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const profile=getSiteProfile('korzeniowskiego-40',data),model=createStateModel(profile),settings=model.DEFAULTS;
const near=(a,b,tolerance=1e-6,label='')=>assert.ok(Math.abs(a-b)<=tolerance,`${label}: ${a} != ${b} ±${tolerance}`);
const vec=p=>new THREE.Vector3(...p);

// Independent official source fixtures, copied before the dataset was built.
// ULDK EPSG:2180 E,N, parcel 226101_1.0034.160:
// https://uldk.gugik.gov.pl/?request=GetParcelById&id=226101_1.0034.160&result=geom_wkt&srid=2180
const parcelEN=[
  [476011.639376694,727136.480656316],
  [476006.635997230,727138.870429869],
  [475997.345019806,727143.379956774],
  [475984.796864783,727116.982309508],
  [475998.683007155,727109.489125105],
];
const sourceOrigin=parcelEN[4],frontVector=parcelEN[3].map((v,i)=>v-sourceOrigin[i]);
const sourceFrontage=Math.hypot(...frontVector),sourceX=frontVector.map(v=>v/sourceFrontage);
const sourceY=[sourceX[1],-sourceX[0]];
const sourceEN=([x,y])=>sourceOrigin.map((v,i)=>v+x*sourceX[i]+y*sourceY[i]);
const sourceLocal=([e,n])=>[sourceX[0]*(e-sourceOrigin[0])+sourceX[1]*(n-sourceOrigin[1]),
  sourceY[0]*(e-sourceOrigin[0])+sourceY[1]*(n-sourceOrigin[1])];
const dataEN=([x,y])=>data.coordinates.localOriginEN.map((v,i)=>v+x*data.coordinates.xUnitEN[i]+y*data.coordinates.yUnitEN[i]);

// Angle winding uses the original national-grid parcel, independently of the
// application's local point-in-polygon test. The rear contains a small kink.
function insideSourceParcel(local){
  const p=sourceEN(local);
  const vectors=parcelEN.map(q=>[q[0]-p[0],q[1]-p[1]]);
  const angle=vectors.reduce((sum,a,i)=>{
    const b=vectors[(i+1)%vectors.length];
    return sum+Math.atan2(a[0]*b[1]-a[1]*b[0],a[0]*b[0]+a[1]*b[1]);
  },0);
  return Math.abs(angle)>Math.PI;
}
function assertInside(rect,label,padding=0){
  for(const p of rectCorners(rect,padding))assert.ok(insideSourceParcel(p),`${label} outside parcel at ${p}`);
}
function rearCamera(){
  const eye=observerForPreset('sofa',settings,data),camera=new THREE.PerspectiveCamera(65,1.5,.1,500);
  camera.position.copy(vec(toWorld(eye.x,eye.y,eye.z)));
  camera.lookAt(camera.position.clone().add(vec(toWorld(...gazeDirection(0)))));
  camera.updateMatrixWorld();
  return camera;
}

// Ground-ring vertices and independent ring-average landmarks from CityGML
// 2261_N-34-50-c-d-1-1.gml in the official 2024 archive:
// https://opendata.geoportal.gov.pl/InneDane/Budynki3D/LOD1/2024/22/2261.zip
const id=suffix=>`ID-2261-26BC7443-${suffix}-FAF6-E053-CA2BA8C0FAE4`;
const anchors=[
  {id:id('1A46'),role:'house',vertex:[475995.4,727130.35]},
  {id:id('6679'),role:'east',vertex:[476005.02,727113.16]},
  {id:id('196A'),role:'west',vertex:[475980.98,727137.09]},
  {id:id('2550'),role:'rear-east',vertex:[476018.58,727161.12],centre:[476020.38,727155.2475]},
  {id:id('1B11'),role:'rear-west',vertex:[476000.49,727170.2],centre:[476002.33,727164.1466666666]},
];

test('Korzeniowskiego parcel reconstructs its official ULDK coordinates and mapped area',()=>{
  assert.deepEqual(data.site.parcels,['226101_1.0034.160']);
  for(const [i,axis] of [data.coordinates.xUnitEN,data.coordinates.yUnitEN].entries())
    axis.forEach((v,j)=>near(v,[sourceX,sourceY][i][j],1e-10));
  const actual=data.site.boundary.slice(0,-1).map(dataEN);
  assert.equal(actual.length,parcelEN.length);
  for(const p of parcelEN)assert.ok(actual.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<1e-6),`Missing official vertex ${p}`);
  const shifted=parcelEN.map(p=>p.map((v,i)=>v-sourceOrigin[i]));
  const area=Math.abs(shifted.reduce((sum,p,i)=>{
    const q=shifted[(i+1)%shifted.length];return sum+p[0]*q[1]-p[1]*q[0];
  },0))/2;
  near(polygonArea(data.site.boundary),area,1e-6);
  near(data.site.area,area,.005,'Published rounded mapped area');
  near(area,467.72,.005);
  near(data.site.frontage,sourceFrontage,1e-6);
  near(data.site.frontSetback,5.49214204,1e-6);
  assert.ok(data.site.area<data.site.advertisedArea,'The 480 m² advert does not stretch the mapped boundary');
  assert.ok(data.site.depth<30&&data.site.frontage<16,'No inherited 20 × 38 m Sternicza plot');
});

test('mapped house and neighbouring targets match independent CityGML anchors and LiDAR roofs',()=>{
  const buildings=[data.site.house,...data.buildings],oldTargets=sternicza.buildings.filter(b=>b.kind==='target');
  for(const anchor of anchors){
    const b=buildings.find(item=>item.officialId===anchor.id);
    assert.ok(b,`${anchor.role} official building is present`);
    assert.ok(b.footprint.map(dataEN).some(p=>Math.hypot(p[0]-anchor.vertex[0],p[1]-anchor.vertex[1])<1e-5),`${anchor.role} footprint came from the independent source`);
    assert.ok(b.roofPoints.length>30,`${anchor.role} has measured roof returns`);
    assert.ok(b.roofTopZ>b.roofZ,`${anchor.role} retains its sampled ridge above the LoD1 median`);
    for(const p of b.roofPoints)assert.ok(p.every(Number.isFinite));
  }
  const targets=data.buildings.filter(b=>b.kind==='target');
  assert.equal(targets.length,5);
  assert.ok(targets.every(b=>!oldTargets.some(old=>old.officialId===b.officialId)),'Sternicza apartment targets were not copied');
  assert.ok(targets.every(b=>!/(PCK|Sternicza)/i.test(b.label)));
  assert.notDeepEqual(data.terrain.originEN,sternicza.terrain.originEN);
  for(const p of parcelEN){
    assert.ok(p[0]>=data.terrain.originEN[0]&&p[0]<=data.terrain.originEN[0]+(data.terrain.columns-1)*data.terrain.cellSize);
    assert.ok(p[1]>=data.terrain.originEN[1]&&p[1]<=data.terrain.originEN[1]+(data.terrain.rows-1)*data.terrain.cellSize);
  }
});

test('a low porch return stays local while the main rear facade and its shadow retain their full height',()=>{
  const h=data.site.house,envelope=localRoofEnvelope(h);
  // The original source has a 6.40 m return at the front projection. The
  // independent rear-edge returns start above 11 m; one cannot set all eaves.
  const low=[3.58733018,6.89429084,6.4];
  assert.ok(h.roofPoints.some(p=>p.every((v,i)=>Math.abs(v-low[i])<1e-8)));
  assert.ok(envelope.edges[0].points.every(p=>p[2]>10.7),'Main rear facade is not lowered to the porch roof');
  assert.ok(envelope.edges[5].points.every(p=>p[2]<8),'The lower side projection is not filled up to the main roof');
  const faces=sampledRoofFaces(envelope.ring,envelope.samples,envelope.fallback,envelope.boundary);
  assert.ok(faces.flat().some(p=>p.every((v,i)=>Math.abs(v-low[i])<1e-8)),'Low measured return remains in the roof mesh');
  const pointKey=p=>p.map(v=>v.toFixed(6)).join(':'),edgeKey=(a,b)=>[pointKey(a),pointKey(b)].sort().join('|'),roofEdges=new Set();
  for(const triangle of faces)for(let i=0;i<3;i++)roofEdges.add(edgeKey(triangle[i],triangle[(i+1)%3]));
  for(let i=0;i<envelope.boundary.length;i++)
    assert.ok(roofEdges.has(edgeKey(envelope.boundary[i],envelope.boundary[(i+1)%envelope.boundary.length])),'Every variable-height wall segment meets the roof without a crack');
  near(faces.reduce((area,triangle)=>area+polygonArea(triangle),0),polygonArea(h.footprint),1e-6,'Constrained roof covers the concave footprint without gaps or overlaps');
  const geometry=prepareSunGeometry(settings,data),house=geometry.occluders.filter(o=>/^house(?:-|$)/.test(o.id));
  const ray=(edgeIndex,z)=>{
    const a=envelope.ring[edgeIndex],b=envelope.ring[(edgeIndex+1)%envelope.ring.length];
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]),outward=[(b[1]-a[1])/length,-(b[0]-a[0])/length];
    const origin=[(a[0]+b[0])/2+.3*outward[0],(a[1]+b[1])/2+.3*outward[1],z];
    return firstSunBlocker(origin,[-outward[0],-outward[1],0],house);
  };
  const rear=ray(0,10.5),lower=ray(5,7.2),aboveProjection=ray(5,9);
  assert.equal(rear.id,'house');near(rear.distance,.3,1e-7,'Full-height main rear wall');
  assert.equal(lower.id,'house');near(lower.distance,.3,1e-7,'Low projection wall');
  assert.ok(!aboveProjection||aboveProjection.distance>.6,'There is no invented high wall above the low projection');
  const raised=prepareSunGeometry({...settings,floorHeight:2.5,gardenRaise:0},data);
  assert.deepEqual(raised.occluders.filter(o=>/^house(?:-|$)/.test(o.id)),house,'Floor and fill controls cannot move the source roof envelope');
});

test('north-facing living-room view puts official east landmarks on the right and west on the left',()=>{
  const camera=rearCamera(),right=camera.getWorldDirection(new THREE.Vector3()).cross(camera.up).normalize();
  const rightEN=[sourceY[1],-sourceY[0]];
  const rightLocal=[rightEN[0]*sourceX[0]+rightEN[1]*sourceX[1],rightEN[0]*sourceY[0]+rightEN[1]*sourceY[1],0];
  near(right.dot(vec(toWorld(...rightLocal))),1);
  assert.ok(rightEN[0]>0,'Physical right points east');
  assert.deepEqual(profile.sideLabels,{left:'west',right:'east'});
  near(profile.rearBearing,28.051220910948,.00001,'Independent EPSG:2180 bearing plus PROJ convergence');
  for(const [role,side]of [['rear-east',1],['rear-west',-1]]){
    const anchor=anchors.find(a=>a.role===role),local=sourceLocal(anchor.centre);
    const projected=vec(toWorld(...local,12)).project(camera);
    assert.equal(Math.sign(projected.x),side,`${role} must not be mirrored`);
    assert.ok(projected.z>-1&&projected.z<1,`${role} is in front of the rear-facing camera`);
  }
});

test('actual proposal, coping and preset viewpoints fit the mapped plot at both terrace limits',()=>{
  const {terrace,pool,house}=data.site;
  near(terrace.y,data.site.rearMidpoint[1],1e-10,'One shared terrace origin');
  assertInside(pool,'Pool coping',.28);
  assertInside(gardenFurniture(data).dining,'Dining area');
  for(const depth of [model.FIELDS.terraceDepth.min,settings.terraceDepth,model.FIELDS.terraceDepth.max]){
    const state={...settings,terraceDepth:depth,canopyDepth:depth,canopyWidth:terrace.width};
    const deck={...terrace,length:depth},tub=jacuzziBounds(state,data),canopy=canopyBounds(state,data);
    assertInside(deck,`Deck ${depth} m`);
    assertInside({x:tub.x0,y:tub.y0,width:tub.width,length:tub.length},'Jacuzzi rim',.015);
    assert.ok(tub.x0-.015>=deck.x&&tub.x1+.015<=deck.x+deck.width&&tub.y0-.015>=deck.y&&tub.y1+.015<=deck.y+depth,'Jacuzzi rim stays on deck');
    assert.ok(!rectanglesOverlap(deck,{x:pool.x-.28,y:pool.y-.28,width:pool.width+.56,length:pool.length+.56}),'Deck does not collide with pool coping');
    near(canopy.x0,terrace.x);near(canopy.x1,terrace.x+terrace.width);
    assert.ok(house.footprint.every(p=>p[1]<=deck.y+1e-8),'Deck starts beyond the existing house');
    for(const preset of ['sofa','standing','terrace','jacuzzi','garden']){
      const eye=observerForPreset(preset,state,data);
      assert.ok(insideSourceParcel([eye.x,eye.y]),preset);
      if(['sofa','standing'].includes(preset))assert.ok(pointInPolygon([eye.x,eye.y],house.footprint));
      else assert.ok(!pointInPolygon([eye.x,eye.y],house.footprint));
      if(['terrace','jacuzzi'].includes(preset))assert.ok(eye.x>=deck.x&&eye.x<=deck.x+deck.width&&eye.y>=deck.y&&eye.y<=deck.y+depth);
      near(eye.z-eye.groundZ,eye.eyeHeight);
    }
  }
});

test('steps follow the full floor drop, stay on the plot and detect the previously missed lounger collision',()=>{
  const t=data.site.terrace,p=data.site.pool,f=gardenFurniture(data);
  // This exact setting previously passed a fixed rear+depth+2 metre filter,
  // leaving both loungers embedded in the long flight of terrace steps.
  const state={...settings,terraceDepth:5,floorHeight:2.5,gardenRaise:0};
  const ground=gardenGroundAt(t.x+t.width/2,t.y+5+.6,state,data),drop=floorElevation(state,data)-ground;
  const stairs=terraceStairs(t,5,drop);
  assert.equal(stairs.count,15);near(stairs.length,4.35);
  assert.ok(stairs.drop/stairs.count<=.18&&stairs.drop/stairs.count>0);
  for(const [x,y]of f.loungers)assert.ok(rectanglesOverlap({x,y,width:.78,length:2},stairs,.15),'Collision now detected for renderer to hide the lounger');
  for(const depth of [3,4.2,5,6])for(const floorHeight of [1.7,2.5])for(const gardenRaise of [0,.5]){
    const s={...settings,terraceDepth:depth,floorHeight,gardenRaise};
    const z=gardenGroundAt(t.x+t.width/2,t.y+depth+.6,s,data);
    const steps=terraceStairs(t,depth,floorElevation(s,data)-z);
    assertInside(steps,`Steps depth ${depth}/floor ${floorHeight}/fill ${gardenRaise}`);
    assert.ok(!rectanglesOverlap(steps,{x:p.x-.28,y:p.y-.28,width:p.width+.56,length:p.length+.56}),'Steps avoid pool coping');
    assert.ok(!rectanglesOverlap(steps,f.dining),'Steps avoid dining area');
  }
  assert.equal(terraceStairs(t,4.2,-.2).count,0,'No inverted steps when selected garden is above the floor');
});

test('west and east hedge quantities and independent unit-price overrides follow physical sides',()=>{
  const state={...settings,costTreePriceLeft:111,costTreePriceRight:777};
  const result=estimateCosts(state,data),bySide=Object.fromEntries(result.hedges.sides.map(s=>[s.side,s]));
  assert.deepEqual(budgetSideLabels(data),{rear:'Rear',left:'Left / west',right:'Right / east'});
  assert.deepEqual(['rear','left','right'].map(k=>bySide[k].count),[19,15,16]);
  assert.equal(bySide.left.plants.low,15*111);assert.equal(bySide.right.plants.low,16*777);
  const changed=estimateCosts({...state,costTreePriceLeft:333,hedgeLeft:3},data);
  assert.deepEqual(changed.hedges.sides.find(s=>s.side==='right'),bySide.right,'Changing west price/height leaves east untouched');
  const segments=hedgeSegments(state,data),houseEN=dataEN(data.site.rearMidpoint);
  for(const edge of segments.filter(s=>s.side!=='rear')){
    const en=sourceEN([(edge.a[0]+edge.b[0])/2,(edge.a[1]+edge.b[1])/2]);
    assert.equal(Math.sign(en[0]-houseEN[0]),edge.side==='right'?1:-1,`${edge.side} geographic longitude direction`);
  }
  const q=gardenQuantities(state,data);
  near(q.rearGrossArea,197.880715874,.000001,'Mapped rear area');
  near(q.automaticArea,q.rearGrossArea-7.5*4.2-2.2*8.5,.000001,'Only nonoverlapping deck and pool removed');
  near(result.earthworks.gardenVolume,q.automaticArea*.5,.000001,'Half-metre fill uses the actual rear footprint');
});

test('null garage is accepted by visibility, sun receivers and pricing without dropping neighbour index 1',()=>{
  assert.equal(data.site.garage,null);
  const kept={...settings,removeGarage:false},removed={...settings,removeGarage:true};
  const eye=observerForPreset('sofa',settings,data);
  const a=analyzeVisibility(eye,kept,data),b=analyzeVisibility(eye,removed,data);
  assert.ok(a.total>100&&a.byBlock.length===5);
  assert.deepEqual(a,b,'A nonexistent garage cannot change privacy');
  assert.ok(a.byBlock.some(item=>item.id==='building-1'&&item.total>0),'East neighbour index 1 is not mistaken for an old garage');
  assert.deepEqual(estimateCosts(kept,data),estimateCosts(removed,data));
  const sun=sunForSettings(settings,data),shadeA=analyzeSunlight(kept,data,sun),shadeB=analyzeSunlight(removed,data,sun);
  assert.deepEqual(shadeA,shadeB,'A nonexistent garage cannot change sunlight');
  for(const [name,zone]of Object.entries(shadeA.zones))assert.ok(zone.total>0&&Number.isFinite(zone.percent),name);
  const geometry=prepareSunGeometry(settings,data);
  assert.ok(geometry.occluders.some(o=>o.id==='building-1'));
  assert.ok(!geometry.occluders.some(o=>o.id==='garage'));
  for(const cell of geometry.cells)assert.ok(insideSourceParcel([cell.x,cell.y])&&!pointInPolygon([cell.x,cell.y],data.site.house.footprint));
});

test('true-north solar rays use the official frame and a north-facing garden has east morning/right, west evening/left',()=>{
  // Independent PROJ meridian convergence at this property, not Sternicza's.
  const convergence=-.3007876511494531,rad=Math.PI/180;
  const trueNorthGrid=[Math.sin(-convergence*rad),Math.cos(-convergence*rad)];
  const north=localSunDirection(0,0,data);
  near(north[0],trueNorthGrid[0]*sourceX[0]+trueNorthGrid[1]*sourceX[1]);
  near(north[1],trueNorthGrid[0]*sourceY[0]+trueNorthGrid[1]*sourceY[1]);
  const camera=rearCamera(),right=camera.getWorldDirection(new THREE.Vector3()).cross(camera.up).normalize();
  for(const [minutes,expectedSide]of [[480,1],[960,-1]]){
    const sun=sunForSettings({...settings,sunDate:'2026-06-21',sunMinutes:minutes},data);
    assert.equal(Math.sign(right.dot(vec(toWorld(...sun.direction)))),expectedSide);
    near(sun.latitude,54.407571032050505,1e-9);near(sun.longitude,18.630110079187588,1e-9);
    near(sun.gridConvergenceDegrees,convergence,1e-9);
  }
  // A noon sun due south is behind this house. Trace an independently chosen
  // low winter ray from the terrace: the real house casts the first shadow.
  const clear={...settings,hedgeRear:0,hedgeLeft:0,hedgeRight:0,canopyEnabled:false,gardenRaise:0};
  const geometry=prepareSunGeometry(clear,data),receiver=[10,20,floorElevation(clear,data)+.02];
  const direction=localSunDirection(180,12,data);
  assert.ok(direction[1]<0,'Noon solar rays travel from north garden toward street/house');
  const hit=firstSunBlocker(receiver,direction,geometry.occluders);
  assert.ok(hit&&/^house/.test(hit.id),`Expected house shadow, got ${hit?.id}`);
});
