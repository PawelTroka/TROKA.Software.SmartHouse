import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createWalkNavigation} from '../src/house-walk.js';
import {getSiteProfile} from '../src/sites.js';
import {createStateModel} from '../src/state.js';
import {applyPlanExterior} from '../src/plan-exterior.js';
import {getHouseFloorPlan} from '../src/house-model.js';
import {stairTreads} from '../src/stair-surfaces.js';
import {DESIGN_STYLES} from '../src/design-styles.js';
import {terraceGroundReference,terrainAt} from '../src/geometry.js';
import {terraceStairs} from '../src/layout.js';
import {garageLayout,garageVehiclePose} from '../src/garage-ramp.js';

const source=JSON.parse(fs.readFileSync(new URL('../data/site-data.json',import.meta.url)));
const defaults=createStateModel(getSiteProfile(source.site.id,source)).DEFAULTS;
const build=extra=>{
  const settings={...defaults,designStyle:'hidden-bali',basementGarageEnabled:true,firstFloorRise:3.05,atticRise:5.75,hstOpen:1,...extra};
  const data=applyPlanExterior(source,settings);return{walk:createWalkNavigation(data,settings),data,settings};
};
const world=(walk,x,z,y)=>{const p=walk.frame.toSite(x,z,y);return[p[0],p[2],p[1]];};
const local=(walk,p)=>walk.frame.toLocal(p.position[0],p.position[2],p.position[1]);
function go(walk,position,x,z){
  const target=world(walk,x,z,0),n=Math.ceil(Math.hypot(target[0]-position.position[0],target[2]-position.position[2])/.035);
  const delta=[(target[0]-position.position[0])/n,0,(target[2]-position.position[2])/n];
  let p=position;for(let i=0;i<n;i++)p=walk.move(p.position,delta,{eyeHeight:p.eyeHeight});
  return p;
}
const near=(a,b,tol=.045)=>assert.ok(Math.abs(a-b)<=tol,`${a} differs from ${b}`);
function at(walk,x,z,floor){const y=walk.plans[floor].elevation+1.57;const p=walk.locate(world(walk,x,z,y),{maxDistance:.245});assert.ok(p,`${floor} start ${x},${z} must be walkable`);return p;}
function reached(walk,p,x,z,floor){const q=local(walk,p);near(q[0],x);near(q[1],z);near(q[2]-p.eyeHeight,walk.plans[floor].elevation);}

test('one continuous walk connects living room, first floor, attic and lowered cellar in both directions',()=>{
  const {walk}=build();let p=at(walk,5.20,3.90,'ground');
  for(const [x,z]of [[5.20,5.75],[5.20,8.50],[6.44,8.50],[6.44,5.75]])p=go(walk,p,x,z);
  reached(walk,p,6.44,5.75,'first');
  // Pass the retained west flue, take the clear side aisle to the attic foot.
  for(const [x,z]of [[4.90,5.75],[4.90,6.10],[4.60,6.10],[4.60,8.62],[5.65,8.62],[5.65,5.80]])p=go(walk,p,x,z);
  reached(walk,p,5.65,5.80,'attic');
  for(const [x,z]of [[5.65,8.62],[4.60,8.62],[4.60,6.10],[4.90,6.10],[4.90,5.75],[6.44,5.75],[6.44,8.50],[5.20,8.50],[5.20,5.75],[6.44,5.75],[6.44,8.20],[6.05,8.45],[5.55,8.45]])p=go(walk,p,x,z);
  reached(walk,p,5.55,8.45,'basement');
  for(const [x,z]of [[6.05,8.45],[6.44,8.20],[6.44,5.75]])p=go(walk,p,x,z);
  reached(walk,p,6.44,5.75,'ground');
});

test('landing guards block physical side entry while free exploration still crosses without collision scans',()=>{
  const {walk}=build(),height=walk.plans.attic.elevation+1.57;
  const beside=world(walk,5.15,6.60,height);
  assert.equal(walk.locate(beside,{maxDistance:.02}),null,'The walker body intersects the visible west attic guard');
  assert.match(walk.getDiagnostics().lastBlocking,/^landing-guard-attic-/);
  const start=at(walk,4.90,6.60,'attic'),physical=go(walk,start,5.65,6.60);
  assert.ok(local(walk,physical)[0]<5.05,'Physical walking passed through the landing balustrade');
  const scans=walk.getDiagnostics().collisionChecks,target=world(walk,5.65,6.60,height);
  const free=walk.moveFree(start.position,[target[0]-start.position[0],0,target[2]-start.position[2]],{floorHint:'attic'});
  near(local(walk,free)[0],5.65,1e-7);near(local(walk,free)[1],6.60,1e-7);
  assert.equal(free.blocked,false);assert.equal(walk.getDiagnostics().collisionChecks,scans);
});

test('the visible HST opening is traversable and closed or stacked panels block passage',()=>{
  const open=build(),closed=build({hstOpen:0});
  let p=at(open.walk,8.0,.70,'ground');p=go(open.walk,p,8.0,-1.20);
  near(local(open.walk,p)[1],-1.20);assert.equal(p.floor,'ground');
  let shut=at(closed.walk,8.0,.70,'ground');shut=go(closed.walk,shut,8.0,-1.20);
  assert.ok(local(closed.walk,shut)[1]>.30,'a closed pane must stop the walker');
  let stacked=at(open.walk,1.7,.70,'ground');stacked=go(open.walk,stacked,1.7,-1.20);
  assert.ok(local(open.walk,stacked)[1]>.30,'the fixed left stack stays solid');
  const originalPlans=open.walk.plans,objectCount=open.walk.getDiagnostics().collisionObjects;
  open.walk.updateHst({hstOpen:0});
  let updated=at(open.walk,8.0,.70,'ground');updated=go(open.walk,updated,8.0,-1.20);
  assert.ok(local(open.walk,updated)[1]>.30,'A lightweight closure immediately blocks the same doorway');
  open.walk.updateHst({hstOpen:1});updated=go(open.walk,updated,8.0,-1.20);near(local(open.walk,updated)[1],-1.20);
  assert.equal(open.walk.plans,originalPlans,'Opening a door must not rebuild the furnished floor plans');
  assert.equal(open.walk.getDiagnostics().collisionObjects,objectCount);
});

test('terrace edges cannot teleport the camera down to the garden or up onto the balcony',()=>{
  const {walk}=build({canopyEnabled:true,terraceCoverType:'balcony',canopyWidth:10.77,canopyDepth:4});
  const p=walk.spawnFloor('first','master');assert.ok(p);
  const onTerrace=walk.spawnGarden();assert.ok(onTerrace);
  const q=local(walk,onTerrace),result=walk.move(onTerrace.position,[0,4,0]);
  near(local(walk,result)[2],q[2],1e-8);
  assert.deepEqual(walk.getDiagnostics().connections,['cellar-stair','main-stair','attic-stair']);
});

test('renovated stair endpoints follow edited floor heights and cut out matching floor openings',()=>{
  const {walk,data,settings}=build({firstFloorRise:3.25,atticRise:6.1,garageClearHeight:2.45});
  for(const floor of ['basement','ground','first']){
    const plan=getHouseFloorPlan({floor,settings,data});
    const stair=plan.stairs.find(s=>s.from===floor&&s.kind!=='exterior');
    const treads=stairTreads(stair,plan);near(plan.elevation+treads.at(-1).top,walk.plans[stair.to].elevation,1e-8);
    const landing=walk.plans[stair.to];assert.ok(landing.voids.some(h=>JSON.stringify(h)===JSON.stringify(stair.polygon)),`${stair.id} must meet a real opening`);
  }
});


test('all 22 renovations preserve the original entry width and can enter the main stair from the hall',()=>{
  for(const style of DESIGN_STYLES.filter(s=>s.id!=='current')){
    const {walk}=build({designStyle:style.id});
    const entry=walk.plans.ground.walls.find(w=>w.id==='street-facade').openings.find(o=>o.type==='door');
    near(entry.width,.95,1e-8);near(entry.offset,5.795,1e-8);
    let p=at(walk,5.20,8.50,'ground');p=go(walk,p,6.44,8.50);p=go(walk,p,6.44,5.75);
    reached(walk,p,6.44,5.75,'first');
  }
});

test('terrace walking uses the exact rendered tread heights and reaches garden grade in both directions',()=>{
  const {walk,data,settings}=build(),ref=terraceGroundReference(settings,data);
  const stairs=terraceStairs({...data.site.terrace,y:data.site.rearMidpoint[1]},settings.terraceDepth,ref.drop,settings,data);
  const x=stairs.x+stairs.width/2;
  for(let i=0;i<stairs.count;i++){
    const height=ref.groundZ+ref.drop*(stairs.count-i)/stairs.count;
    const p=walk.locate([x,height+1.57,stairs.y+(i+.5)*.29],{maxDistance:.01});
    assert.ok(p,`tread ${i} is supported`);near(p.position[1]-p.eyeHeight,height,1e-8);
  }
  let p=walk.spawnGarden([x,ref.floorZ+1.57,stairs.y-.15]);
  const start=p.position.slice(),distance=stairs.length+.60,n=100;
  for(let i=0;i<n;i++)p=walk.move(p.position,[0,0,distance/n]);
  assert.equal(p.floor,'garden');
  for(let i=0;i<n;i++)p=walk.move(p.position,[0,0,-distance/n]);
  p.position.forEach((v,i)=>near(v,start[i]));
});

test('garage walking obstacles follow the actual moving vehicle and leave its vacated bay clear',()=>{
  const {walk,data,settings}=build({garageProgress:0}),garage=garageLayout(settings,data,{terrainAt});
  const parked=garageVehiclePose(garage,1,false),centre=parked.localToWorld(garage.vehicle.wheelbase/2,0,0);
  const position=[centre[0],walk.frame.floorZ+walk.plans.basement.elevation+1.57,centre[1]];
  assert.ok(walk.locate(position,{maxDistance:.02}),'The main bay is clear while the moving car is outside');
  walk.updateVehicles({...settings,garageProgress:100});
  assert.equal(walk.locate(position,{maxDistance:.02}),null,'The parked body and mirrors block walking through the actual car');
  assert.equal(walk.getDiagnostics().lastBlocking,'vehicle-0');
  walk.updateVehicles({...settings,garageProgress:0});
  assert.ok(walk.locate(position,{maxDistance:.02}),'Leaving the bay removes its old vehicle obstacle');
});
