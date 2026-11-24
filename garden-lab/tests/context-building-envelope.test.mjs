import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {contextBuildingEnvelope,contextEnvelopeIntersection} from '../src/context-building-envelope.js';
import {observedApartmentRoof} from '../src/observed-apartment-roofs.js';
import {visualNeighborRoof} from '../src/observed-neighbor-roofs.js';
import {buildingIntersection} from '../src/geometry.js';
import {prepareSunGeometry,firstSunBlocker,analyzeSunlight} from '../src/shade.js';
import {analyzeFacadeVisibility} from '../src/facade-visibility.js';
import {createContextRoofFeatures} from '../src/scene-context-roof.js';
import {toWorld,toWorldRoofTriangle} from '../src/orientation.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
data.neighborRoofObservations=JSON.parse(readFileSync(new URL('../data/sternicza-neighbor-roofs.json',import.meta.url)));
const settings={hedgeRear:0,hedgeLeft:0,hedgeRight:0,hedgeFront:0,floorHeight:0,gardenRaise:0,bedRaise:0,
  canopyEnabled:false,removeGarage:true,screeningTrees:[],sunEnabled:true};
const building=id=>data.buildings.find(b=>b.id===id);
const near=(a,b,epsilon=1e-7)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
const area=ring=>Math.abs(ring.reduce((s,p,i)=>s+p[0]*ring[(i+1)%ring.length][1]-p[1]*ring[(i+1)%ring.length][0],0))/2;
const subtract=(a,b)=>a.map((x,i)=>x-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const triangleKey=face=>face.map(p=>p.map(v=>v.toFixed(4)).join(',')).sort().join('|');

test('all twelve resolved neighbours use exactly one common roof/wall mesh without changing source records',()=>{
  const before=JSON.stringify(data),sun=prepareSunGeometry(settings,data);
  const ids=[...data.neighborRoofObservations.buildings.map(b=>b.buildingId),'building-9','building-15','building-29'];
  for(const id of ids){
    const source=building(id),envelope=contextBuildingEnvelope(source,data),occluders=sun.occluders.filter(o=>o.id===id||o.id===`${id}-roof`);
    assert.equal(occluders.length,1,`${id}: no leftover uniform prism or duplicate sampled roof`);
    assert.equal(occluders[0].type,'mesh');
    assert.deepEqual(occluders[0].faces,envelope.faces);
    near(envelope.bounds.max[2],envelope.maxZ);
    near(envelope.bounds.min[2],source.baseZ);
    if(!envelope.features){
      const visual=visualNeighborRoof(source,data);
      assert.deepEqual(envelope.roofFaces,visual.roofFaces);
      assert.deepEqual(envelope.wallFaces,visual.wallFaces);
      near(envelope.roofFaces.reduce((s,f)=>s+area(f),0),area(source.footprint),1e-6);
    }
    assert.equal(envelope.acquired,'2024-10-01');
  }
  near(contextBuildingEnvelope(building('building-4'),data).maxZ-building('building-4').baseZ,13.82);
  assert.equal(JSON.stringify(data),before,'Provenance, official IDs, roof/facade targets and the separate high features are immutable');
});

test('4h rays clear its low extension but hit its measured high gable in privacy and direct sun',()=>{
  const source=building('building-4'),envelope=contextBuildingEnvelope(source,data);
  const lowA=[-20,27.5,8],lowB=[5,27.5,8],highA=[-20,35,14.5],highB=[5,35,14.5];
  assert.ok(buildingIntersection(lowA,lowB,source),'The old median prism produced a phantom upper wing');
  assert.equal(buildingIntersection(lowA,lowB,source,data),null);
  assert.equal(firstSunBlocker(lowA,subtract(lowB,lowA),[envelope]),null);
  assert.equal(buildingIntersection(highA,highB,source),null,'The old prism missed the high gable');
  const privacy=buildingIntersection(highA,highB,source,data),sun=firstSunBlocker(highA,subtract(highB,highA),[envelope]);
  assert.equal(privacy.buildingId,source.id);assert.equal(sun.id,source.id);
  near(privacy.x,sun.point[0]);near(privacy.y,sun.point[1]);near(privacy.z,sun.point[2]);
  near(privacy.t*Math.hypot(...subtract(highB,highA)),sun.distance);
});

test('resolved finite rays handle vertical roofs, wall endpoints, short segments and above-roof clearance',()=>{
  const source=building('building-4'),envelope=contextBuildingEnvelope(source,data);
  const apex=[.202,34.974,16.28];
  assert.equal(contextEnvelopeIntersection([apex[0],apex[1],20],apex,envelope),null,'A target surface endpoint is not its own blocker');
  const vertical=contextEnvelopeIntersection([apex[0],apex[1],20],[apex[0],apex[1],10],envelope);
  near(vertical.z,apex[2]);
  assert.equal(contextEnvelopeIntersection(apex,[apex[0],apex[1],20],envelope),null,'An eye surface endpoint is excluded');
  assert.equal(contextEnvelopeIntersection([-20,35,14.5],[-15,35,14.5],envelope),null,'A hit beyond a finite target is excluded');
  assert.equal(contextEnvelopeIntersection([-20,35,17],[5,35,17],envelope),null);
  assert.equal(contextEnvelopeIntersection([-30,35,5],[-30,35,20],envelope),null,'Outside vertical rays do not hit an infinite roof');
  assert.equal(contextEnvelopeIntersection([-3,27.5,8],[-3,27.5,15],envelope),null,'The space above a lower wing is open');
  assert.ok(contextEnvelopeIntersection([-3,27.5,4],[-3,27.5,8],envelope),'The low wing still retains its physical mass');
});

function sunFixture(y,z){
  return {coordinates:{localOriginEN:[0,0],xUnitEN:[1,0],yUnitEN:[0,1]},
    terrain:{originEN:[-32,0],cellSize:1,columns:80,rows:80,elevations:Array(6400).fill(z)},
    site:{boundary:[[-21,y],[-19,y],[-19,y+1],[-21,y+1],[-21,y]],boundaryNames:['street','east-rear','rear','west-rear'],
      rearMidpoint:[-20,y-1],floorReference:{z},house:null,garage:null,terrace:{x:-40,y:y-1,width:1,depth:1}},
    buildings:[building('building-4')],neighborRoofObservations:data.neighborRoofObservations};
}

test('scalar sunlight totals respond to lower-wing clearance and high-gable occlusion',()=>{
  const sun={direction:[1,0,.01],isDaylight:true,elevation:Math.atan(.01)*180/Math.PI};
  for(const [y,z,resolvedPercent,oldPercent] of [[27,8,100,0],[34,14.5,0,100]]){
    const fixture=sunFixture(y,z),resolved=analyzeSunlight(settings,fixture,sun);
    const legacy=analyzeSunlight(settings,{...fixture,neighborRoofObservations:undefined},sun);
    assert.equal(resolved.zones.garden.total,2);
    assert.equal(resolved.zones.garden.percent,resolvedPercent);
    assert.equal(legacy.zones.garden.percent,oldPercent);
    assert.equal(resolved.cells.filter(c=>c.sunlit).length,resolved.zones.garden.sunlit);
  }
});

test('PCK roofs have a flat deck, a bounded central pyramid and six independent vertical chimney boxes',()=>{
  for(const id of ['building-9','building-15','building-29']){
    const b=building(id),roof=observedApartmentRoof(b),pyramid=roof.features.find(f=>f.kind==='pyramid'),chimneys=roof.features.filter(f=>f.kind==='chimney');
    assert.equal(chimneys.length,6,id);assert.equal(pyramid.roofFaces.length,4);
    near(roof.surfaceFaces.reduce((s,f)=>s+area(f),0),area(b.footprint),1e-6);
    assert.ok(roof.surfaceFaces.flat().every(p=>p[2]===b.roofZ),'Deck remains flat between the discrete features');
    assert.ok(pyramid.footprint.every(p=>p[0]>Math.min(...b.footprint.map(q=>q[0]))&&p[0]<Math.max(...b.footprint.map(q=>q[0]))));
    for(const chimney of chimneys){
      assert.equal(chimney.wallFaces.length,8);assert.equal(chimney.roofFaces.length,2);
      assert.ok(chimney.wallFaces.every(face=>area(face)<1e-9),'A chimney is not a sloping mound');
      assert.ok(chimney.roofFaces.flat().every(p=>p[2]===chimney.topZ));
      assert.ok(chimney.sourcePointCount>0);assert.equal(chimney.planExtentEstimated,true);
    }
    near(roof.maxZ,Math.max(...b.roofPoints.map(p=>p[2])));
    assert.match(roof.meaning,/not surveyed/);assert.match(roof.meaning,/unknown cross-section/);
  }
  const b=building('building-9'),roof=observedApartmentRoof(b);
  assert.ok(Math.max(...b.highFeatures.map(p=>p[2]))>roof.maxZ+6,'Optional unverified tall targets are not introduced into the default roof');
  assert.equal(roof.maxZ,23.43);
});

test('PCK fixture reconstruction is invariant to ring start, winding and collinear subdivisions',()=>{
  for(const id of ['building-9','building-15','building-29']){
    const b=building(id),ring=b.footprint.slice(0,-1),expected=observedApartmentRoof(b);
    const subdivided=ring.flatMap((p,i)=>[p,p.map((v,j)=>(v+ring[(i+1)%ring.length][j])/2)]);
    for(const footprint of [ring.slice().reverse(),[...ring.slice(2),...ring.slice(0,2)],subdivided]){
      const actual=observedApartmentRoof({...b,footprint:[...footprint,footprint[0]]});
      assert.ok(actual);assert.deepEqual(actual.roofFaces,expected.roofFaces);assert.deepEqual(actual.wallFaces,expected.wallFaces);
    }
  }
});

test('resolved roofs and privacy intersections follow translation and vertical sensitivity scaling once',()=>{
  const dx=3.2,dy=-4.7,scaleZ=1.17;
  for(const id of ['building-4','building-9','building-15','building-29']){
    const b=building(id),transform=p=>[p[0]+dx,p[1]+dy,b.baseZ+(p[2]-b.baseZ)*scaleZ];
    const moved={...b,footprint:b.footprint.map(p=>[p[0]+dx,p[1]+dy]),roofZ:b.baseZ+(b.roofZ-b.baseZ)*scaleZ,
      roofPoints:b.roofPoints?.map(transform),adjustment:{dx,dy,scaleZ}};
    const original=contextBuildingEnvelope(b,data),actual=contextBuildingEnvelope(moved,data);
    assert.equal(actual.faces.length,original.faces.length);
    actual.faces.flat().forEach((p,i)=>transform(original.faces.flat()[i]).forEach((v,axis)=>near(p[axis],v,1e-6)));
    const a=[-20,35,14.5],target=[5,35,14.5];
    if(id==='building-4')near(contextEnvelopeIntersection(transform(a),transform(target),actual).t,contextEnvelopeIntersection(a,target,original).t);
  }
});

test('rendered PCK feature triangles are the same supported physics surfaces with correct roof/wall normals',()=>{
  const roof=observedApartmentRoof(building('building-9')),material=new THREE.MeshStandardMaterial();
  const group=createContextRoofFeatures(roof,material),actual=[];
  group.traverse(object=>{
    if(!object.isMesh)return;
    const position=object.geometry.getAttribute('position');
    for(let i=0;i<position.count;i+=3)actual.push(triangleKey([0,1,2].map(j=>[position.getX(i+j),position.getY(i+j),position.getZ(i+j)])));
  });
  const expected=roof.features.flatMap(f=>[...f.wallFaces,...f.roofFaces]).map(face=>triangleKey(face.map(p=>toWorld(...p))));
  assert.deepEqual(actual.sort(),expected.sort());
  for(const feature of roof.features){
    const center=feature.footprint.reduce((p,q)=>[p[0]+q[0]/4,p[1]+q[1]/4],[0,0]);
    for(const face of feature.wallFaces){
      const normal=cross(subtract(face[1],face[0]),subtract(face[2],face[0])),mid=face.reduce((p,q)=>p.map((v,i)=>v+q[i]/3),[0,0,0]);
      assert.ok(normal[0]*(mid[0]-center[0])+normal[1]*(mid[1]-center[1])>0,'Wall normals point outward');
    }
    for(const face of feature.roofFaces){
      const [a,b,c]=toWorldRoofTriangle(...face),normal=cross(subtract(b,a),subtract(c,a));
      assert.ok(normal[1]>0,'Rendered deck, pyramid and caps face upward');
    }
  }
  group.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});material.dispose();
});

function onTriangle(p,[a,b,c]){
  const u=subtract(b,a),v=subtract(c,a),w=subtract(p,a),normal=cross(u,v);
  if(Math.abs(dot(normal,w))>1e-6*Math.hypot(...normal))return false;
  const uu=dot(u,u),uv=dot(u,v),vv=dot(v,v),wu=dot(w,u),wv=dot(w,v),det=uu*vv-uv*uv;
  if(Math.abs(det)<1e-12)return false;
  const s=(wu*vv-wv*uv)/det,t=(wv*uu-wu*uv)/det;
  return s>=-1e-7&&t>=-1e-7&&s+t<=1+1e-7;
}

test('dense facade inspection samples resolved low wings and high gables without floating targets',()=>{
  const b=building('building-4'),envelope=contextBuildingEnvelope(b,data);
  const result=analyzeFacadeVisibility([-25,24,12],b.id,settings,{...data,buildings:[b]},{spacing:.75});
  assert.equal(result.status,'ok');assert.ok(result.total>0);
  assert.ok(result.rays.some(ray=>ray.target[2]>b.roofZ),'The inspector includes the supported high gable wall');
  assert.ok(result.rays.every(ray=>envelope.wallFaces.some(face=>onTriangle(ray.target,face))),
    'Each facade target lies on an actual resolved wall or vertical roof step');
});
