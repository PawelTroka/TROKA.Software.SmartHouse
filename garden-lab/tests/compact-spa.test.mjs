import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {gardenProgram,spaEnabled} from '../src/garden-program.js';
import {gardenGroundAt,floorElevation,jacuzziBounds,observerForPreset,pointInPolygon,
  saunaIntersection,segmentIntersection,spaLevels,spaSurfaceAt,terraceGroundReference} from '../src/geometry.js';
import {rectCorners,rectanglesOverlap,terraceStairs} from '../src/layout.js';
import {prepareSunGeometry,sunlightAtPoint} from '../src/shade.js';
import {designTerrainCutouts} from '../src/scene.js';
import {createSpaAmenityGroup} from '../src/scene-spa.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const other=JSON.parse(readFileSync(new URL('../data/korzeniowskiego-40.json',import.meta.url)));
const settings={siteId:'sternicza-11',gardenProgram:'spa-compact',gardenRaise:.5,floorHeight:1.2,
  terraceDepth:4.2,removeGarage:true,jacuzziOverflow:false,canopyEnabled:false,
  hedgeRear:4,hedgeLeft:4,hedgeRight:4,hedgeInset:.5,screeningTrees:[]};
const near=(a,b,epsilon=1e-7)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
const containsRect=(point,r)=>point[0]>=r.x-1e-8&&point[0]<=r.x+r.width+1e-8
  &&point[1]>=r.y-1e-8&&point[1]<=r.y+r.length+1e-8;
const rectangleFromBounds=r=>({x:r.x0,y:r.y0,width:r.x1-r.x0,length:r.y1-r.y0});
const meshBounds=object=>{assert.ok(object);object.updateWorldMatrix(true,true);return new THREE.Box3().setFromObject(object);};
const material=new THREE.MeshBasicMaterial(),glass=new THREE.MeshBasicMaterial({transparent:true,opacity:.13});
const materials=Object.fromEntries(['stone','stoneLight','wood','woodLight','metal','basin','linen','waterLight',
  'plinth','treeBark','gold','spaGlow','fireGlow'].map(k=>[k,material]));
materials.glass=glass;

test('compact programme reduces the sauna and keeps the published edge layout intact',()=>{
  const p=gardenProgram(settings,data),old=gardenProgram({...settings,gardenProgram:'spa-edge'},data);
  assert.equal(p.id,'spa-compact');assert.ok(spaEnabled(settings,data));
  assert.deepEqual([p.sauna.width,p.sauna.length,p.sauna.height,p.sauna.seats],[3,2.4,2.3,6]);
  assert.deepEqual([old.sauna.width,old.sauna.length,old.sauna.height],[4.2,4.1,2.65]);
  near(p.sauna.x,old.sauna.x);near(p.sauna.y+p.sauna.length,old.sauna.y+old.sauna.length);
  assert.deepEqual([p.sauna.x,p.sauna.y],[1.35,34.65]);
  for(const key of ['pool','firepit','coldPlunge','furniture'])assert.deepEqual(p[key],old[key],`${key} stays in place`);
  const historical=jacuzziBounds({...settings,gardenProgram:'spa-edge',jacuzziOverflow:false},data);
  assert.equal(historical.width,2.2);assert.equal(historical.length,2.2);assert.equal(historical.infinity,true);
  near(historical.waterZ,historical.z-.035);assert.equal(historical.serviceAccess,null);
  assert.equal(gardenProgram(settings,other).active,false,'The second property must not acquire the Sternicza programme');
  assert.equal(jacuzziBounds(settings,other).seats,null);
});

test('six distinct sauna places fit the actual upper benches without heater or seat collisions',()=>{
  const s=gardenProgram(settings,data).sauna;
  assert.equal(s.seatCentres.length,6);
  assert.equal(new Set(s.seatCentres.map(p=>p.join(','))).size,6,'The L corner cannot count as two seats');
  const seatPlaces=s.seatCentres.map(([x,y])=>({x:x-.3,y:y-.3,width:.6,length:.6}));
  for(const [i,place] of seatPlaces.entries()){
    assert.ok(s.benches.some(bench=>rectCorners(place).every(p=>containsRect(p,bench))),`Seat ${i+1} has a complete 0.6 m bench place`);
    for(const point of rectCorners(place))assert.ok(pointInPolygon(point,s.footprint));
    assert.equal(rectanglesOverlap(place,s.heater),false,`Seat ${i+1} intersects the heater`);
    for(const next of seatPlaces.slice(i+1))assert.equal(rectanglesOverlap(place,next),false,'Seating places cannot overlap');
  }
  for(const bench of [...s.benches,...s.lowerBenches]){
    for(const point of rectCorners(bench))assert.ok(pointInPolygon(point,s.footprint));
    assert.equal(rectanglesOverlap(bench,s.heater),false,'A bench cannot run through the heater');
  }
  for(const point of rectCorners(s.heater))assert.ok(pointInPolygon(point,s.footprint));
  // These assertions verify conceptual geometry, not manufacturer-specific
  // heater clearances or a certified six-person bench specification.
});

test('the compact corner footprint and access fit the parcel and every seat looks inward through glass',()=>{
  const p=gardenProgram(settings,data),levels=spaLevels(settings,data),s=p.sauna,t=jacuzziBounds(settings,data);
  for(const ring of [s.footprint,...s.entrySteps.map(step=>step.footprint)]){
    for(let i=0;i<ring.length-1;i++)for(let n=0;n<=10;n++){
      const f=n/10,a=ring[i],b=ring[i+1];
      assert.ok(pointInPolygon([a[0]+f*(b[0]-a[0]),a[1]+f*(b[1]-a[1])],data.site.boundary));
    }
  }
  for(const object of [p.pool,p.firepit,p.coldPlunge,...p.coldPlunge.steps])assert.equal(rectanglesOverlap(s,object),false);
  const targets=[
    [p.pool.x+p.pool.width/2,p.pool.y+p.pool.length/2,levels.pool.waterZ],
    [9.6,21,t.z],[(t.x0+t.x1)/2,(t.y0+t.y1)/2,t.waterZ],
    [10.2,24.3,gardenGroundAt(10.2,24.3,settings,data)+1],
  ];
  for(const [x,y] of s.seatCentres){
    const eye={x,y,z:levels.sauna.floorZ+1.6};
    for(const target of targets){
      assert.equal(saunaIntersection(eye,target,settings,data),null,'The intended garden ray must clear opaque walls');
      const pane=s.glazing.find(g=>{
        const hit=segmentIntersection([x,y],target,g.a,g.b);
        if(!hit)return false;
        const z=eye.z+hit.t*(target[2]-eye.z);
        return z>=levels.sauna.floorZ+g.bottom&&z<=levels.sauna.floorZ+g.top;
      });
      assert.ok(pane,'The ray must actually exit through glazing, not an accidental wall or roof gap');
    }
  }
  const eye=observerForPreset('sauna',settings,data);
  assert.ok(s.seatCentres.some(([x,y])=>Math.hypot(x-eye.x,y-eye.y)<1e-8));
  near(eye.z,levels.sauna.floorZ+1.6);assert.ok(eye.defaultLookYaw<-90);
  assert.equal(saunaIntersection(eye,[0,eye.y,eye.z],settings,data)?.part,'wall');
  assert.equal(saunaIntersection(eye,[eye.x,eye.y,eye.z+8],settings,data)?.part,'roof');
});

test('seven-seat sealed jacuzzi stays on the outer terrace edge with a separate 0.6 m access envelope',()=>{
  const deck=data.site.terrace;
  for(const depth of [3,4.2,6]){
    const state={...settings,terraceDepth:depth},t=jacuzziBounds(state,data);
    assert.equal(t.width,2.3);assert.equal(t.length,2.3);assert.equal(t.seats,7);
    assert.equal(t.infinity,false);assert.equal(t.overflow,false);near(t.waterZ,t.z-.115);
    near(t.y1,data.site.rearMidpoint[1]+depth);near(t.x0,deck.x+.15);
    assert.ok(t.y0>=deck.y&&t.x1<=deck.x+deck.width);
    const access=t.serviceAccess;
    near(access.clearance,.6);
    for(const [a,b] of [[t.x0,access.x0],[access.x1,t.x1],[t.y0,access.y0],[access.y1,t.y1]])near(a-b,.6);
    near(access.x1-access.x0,3.5);near(access.y1-access.y0,3.5);
    for(const point of rectCorners(rectangleFromBounds(access)))assert.ok(pointInPolygon(point,data.site.boundary));
    assert.ok(t.waterBounds.x0>t.x0&&t.waterBounds.x1<t.x1&&t.waterBounds.y0>t.y0&&t.waterBounds.y1<t.y1);
    assert.equal(t.seatCentres.length,7);assert.equal(new Set(t.seatCentres.map(p=>p.join(','))).size,7);
    const seats=t.seatCentres.map(([x,y])=>({x:x-.23,y:y-.23,width:.46,length:.46}));
    for(const [i,seat] of seats.entries()){
      for(const point of rectCorners(seat))assert.ok(containsRect(point,rectangleFromBounds(t)));
      for(const next of seats.slice(i+1))assert.equal(rectanglesOverlap(seat,next),false);
    }
    const stairs=terraceStairs(deck,depth,terraceGroundReference(state,data).drop,state,data);
    assert.ok(stairs.x>access.x1,'A dry stair route remains outside the technical-access envelope');
    const eye=observerForPreset('jacuzzi',state,data);
    near(eye.x,(t.x0+t.x1)/2);near(eye.y,(t.y0+t.y1)/2);near(eye.z,t.z+.7);
  }
  assert.equal(jacuzziBounds({...settings,jacuzziOverflow:undefined},data).overflow,false,'An omitted option must also be sealed');
});

test('overflow changes shared water levels and invalidates cached sunlight geometry in both directions',()=>{
  // The same data identity deliberately exercises the WeakMap cache. A fresh
  // fixture for each mode would miss stale water heights after using the toggle.
  const sealed=jacuzziBounds(settings,data);let previousGeometry;
  for(const overflow of [false,true,false]){
    const state={...settings,jacuzziOverflow:overflow},t=jacuzziBounds(state,data),g=prepareSunGeometry(state,data);
    assert.equal(t.overflow,overflow);near(t.waterZ,t.z-(overflow?.035:.115));
    for(const key of ['x0','x1','y0','y1','width','length','bottomZ','z'])near(t[key],sealed[key]);
    if(previousGeometry)assert.notEqual(g,previousGeometry,'The water option must rebuild cached sun receivers');
    previousGeometry=g;
    const water=g.cells.filter(cell=>cell.zone==='jacuzzi');assert.ok(water.length>0);
    for(const cell of water)near(cell.z,t.waterZ);
    const receiver=[(t.x0+t.x1)/2,(t.y0+t.y1)/2,t.waterZ];
    assert.equal(sunlightAtPoint(receiver,state,data,{isDaylight:true,direction:[0,0,1]},g).sunlit,true,
      'Neither a solid terrace slab nor unexcavated soil may fill the recessed tub');
    const hole=designTerrainCutouts(state,data).find(h=>Math.abs(h.x0-t.x0)<1e-8&&Math.abs(h.y0-t.y0)<1e-8);
    assert.ok(hole);for(const key of ['x0','x1','y0','y1'])near(hole[key],t[key]);
    assert.ok(hole.x0>t.serviceAccess.x0&&hole.x1<t.serviceAccess.x1,'Technical-access space is not additional excavated water');
  }
  near(jacuzziBounds({...settings,jacuzziOverflow:true},data).waterZ-sealed.waterZ,.08);
});

test('compact pads and entry treads retain mapped slope while fill lowers the terrace drop',()=>{
  const p=gardenProgram(settings,data),z=spaLevels(settings,data),raised={...settings,gardenRaise:.8},rz=spaLevels(raised,data);
  for(const [object,level,pad,top] of [[p.sauna,z.sauna,0,z.sauna.floorZ],
    [p.coldPlunge,z.coldPlunge,p.coldPlunge.pad,z.coldPlunge.baseZ+.02],
    [p.pool,z.pool,p.pool.coping,z.pool.copingTopZ]]){
    for(let i=0;i<=23;i++)for(let j=0;j<=29;j++){
      const x=object.x-pad+(object.width+2*pad)*i/23,y=object.y-pad+(object.length+2*pad)*j/29;
      if(object===p.sauna&&!pointInPolygon([x,y],object.footprint))continue;
      const ground=gardenGroundAt(x,y,settings,data);
      assert.ok(top>ground+.015,'Level finishes must not be buried in the uphill grade');
      assert.ok((level.padBaseZ??level.copingBaseZ)<ground-.05,'The pad skirt must meet the downhill grade');
    }
  }
  for(const key of ['pool','sauna','firepit','coldPlunge'])near(rz[key].groundZ-z[key].groundZ,.3);
  for(const key of ['sauna','firepit'])near(rz[key].floorZ-z[key].floorZ,.3);
  near(z.sauna.roofZ-z.sauna.floorZ,2.3);near(z.firepit.rimZ-z.firepit.floorZ,.6);
  near(z.coldPlunge.waterZ-z.coldPlunge.bottomZ,1.1);near(z.pool.waterZ-z.pool.bottomZ,1.4);
  near(terraceGroundReference(raised,data).drop,terraceGroundReference(settings,data).drop-.3);
  near(jacuzziBounds(raised,data).z,jacuzziBounds(settings,data).z);
  near(jacuzziBounds(raised,data).waterZ,jacuzziBounds(settings,data).waterZ);
  const higherFloor={...settings,floorHeight:1.7};
  near(floorElevation(higherFloor,data)-floorElevation(settings,data),.5);
  near(jacuzziBounds(higherFloor,data).z-jacuzziBounds(settings,data).z,.5);
  near(spaLevels(higherFloor,data).sauna.floorZ,z.sauna.floorZ);
  for(const [key,steps,finish,surface] of [
    ['sauna',z.sauna.entrySteps,z.sauna.floorZ,'sauna-entry'],
    ['coldPlunge',z.coldPlunge.steps,z.coldPlunge.rimZ,'plunge-entry']]){
    const level=z[key];assert.ok(level.entryRiser>0&&level.entryRiser<=.18);
    let previous=level.entryGroundZ;
    for(const step of steps){
      near(step.topZ-previous,level.entryRiser);previous=step.topZ;assert.ok(step.topZ>step.baseZ);
      const ring=step.footprint?.slice(0,-1)||rectCorners(step),x=ring.reduce((sum,p)=>sum+p[0],0)/ring.length,y=ring.reduce((sum,p)=>sum+p[1],0)/ring.length;
      near(spaSurfaceAt(x,y,settings,data).groundZ,step.topZ);
      const eye=observerForPreset('custom',{...settings,observerX:x,observerY:y,eyeHeight:1.65},data);
      assert.equal(eye.surface,surface);near(eye.z,step.topZ+1.65);
    }
    near(finish-previous,level.entryRiser);near(rz[key].entryRiser,level.entryRiser);
  }
});

test('both amenity renderers use compact roof, bench, glazing and approach levels',()=>{
  const p=gardenProgram(settings,data),z=spaLevels(settings,data);
  for(const svg of [false,true]){
    const group=createSpaAmenityGroup(p,z,materials,svg);
    near(meshBounds(group.getObjectByName('sauna-roof')).max.y,z.sauna.roofZ,1e-6);
    for(const [i,bench] of [...p.sauna.benches,...p.sauna.lowerBenches].entries()){
      const bounds=meshBounds(group.getObjectByName(`sauna-bench-${i}`));
      near(bounds.max.y,z.sauna.floorZ+bench.height,1e-6);
      near(bounds.max.x-bounds.min.x,bench.width,1e-6);near(bounds.max.z-bounds.min.z,bench.length,1e-6);
    }
    for(const [i,pane] of p.sauna.glazing.entries()){
      const mesh=group.getObjectByName(`sauna-glazing-${i}`),bounds=meshBounds(mesh);
      near(bounds.min.y,z.sauna.floorZ+pane.bottom,1e-6);near(bounds.max.y,z.sauna.floorZ+pane.top,1e-6);
      assert.equal(mesh.material,glass);assert.equal(mesh.castShadow,false);
    }
    for(const [i,step] of z.sauna.entrySteps.entries()){
      const bounds=meshBounds(group.getObjectByName(`sauna-entry-step-${i}`));
      near(bounds.min.y,step.baseZ,1e-6);near(bounds.max.y,step.topZ,1e-6);
    }
    const heater=meshBounds(group.getObjectByName('sauna-electric-heater'));
    for(let i=0;i<p.sauna.benches.length+p.sauna.lowerBenches.length;i++){
      assert.equal(heater.intersectsBox(meshBounds(group.getObjectByName(`sauna-bench-${i}`))),false);
    }
  }
});
