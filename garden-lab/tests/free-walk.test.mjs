import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createWalkNavigation} from '../src/house-walk.js';
import {getSiteProfile} from '../src/sites.js';
import {createStateModel} from '../src/state.js';
import {applyPlanExterior} from '../src/plan-exterior.js';
import {gardenGroundAt,jacuzziBounds,spaLevels,terraceGroundReference} from '../src/geometry.js';
import {poolBounds} from '../src/garden-program.js';
import {terraceStairs} from '../src/layout.js';

const source=JSON.parse(fs.readFileSync(new URL('../data/site-data.json',import.meta.url)));
const defaults=createStateModel(getSiteProfile(source.site.id,source)).DEFAULTS;
const near=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<tol,`${a} differs from ${b}`);
const build=extra=>{
  const settings={...defaults,designStyle:'hidden-bali',basementGarageEnabled:true,firstFloorRise:3.05,atticRise:5.75,hstOpen:0,walkNavigation:'free',...extra};
  const data=applyPlanExterior(source,settings);return{walk:createWalkNavigation(data,settings),data,settings};
};
const world=(walk,x,z,y)=>{const p=walk.frame.toSite(x,z,y);return[p[0],p[2],p[1]];};
const local=(walk,p)=>walk.frame.toLocal(p.position[0],p.position[2],p.position[1]);
function goWorld(walk,pose,target){
  const n=Math.max(1,Math.ceil(Math.hypot(target[0]-pose.position[0],target[2]-pose.position[2])/.04));
  const delta=[(target[0]-pose.position[0])/n,0,(target[2]-pose.position[2])/n];
  for(let i=0;i<n;i++)pose=walk.moveFree(pose.position,delta,{eyeHeight:pose.eyeHeight,floorHint:pose.floor,floating:pose.floating});
  near(pose.position[0],target[0]);near(pose.position[2],target[2]);return pose;
}
const go=(walk,pose,x,z)=>goWorld(walk,pose,world(walk,x,z,0));

test('free exploration crosses closed glass, fixtures and the parcel edge without collision scans',()=>{
  const {walk,data,settings}=build();
  let pose=walk.locateFree(world(walk,8,.70,1.57),{floorHint:'ground'});
  const before=walk.getDiagnostics().collisionChecks;
  pose=go(walk,pose,8,-1.2);near(local(walk,pose)[1],-1.2);assert.equal(pose.blocked,false);
  pose=go(walk,pose,2,1.5);near(local(walk,pose)[2]-pose.eyeHeight,0);
  const outside=[Math.max(...data.site.boundary.map(p=>p[0]))+8,0,Math.max(...data.site.boundary.map(p=>p[1]))+6];
  pose=goWorld(walk,pose,outside);
  near(pose.position[1],gardenGroundAt(outside[0],outside[2],settings,data)+pose.eyeHeight);
  assert.equal(pose.floor,'garden');assert.equal(walk.getDiagnostics().collisionChecks,before);
  assert.ok(walk.getDiagnostics().freeMoves>0);
});

test('free exploration uses the same connected stair flights and never chooses the floor above a room',()=>{
  const {walk}=build();let pose=walk.locateFree(world(walk,5.20,3.90,1.57),{floorHint:'ground'});
  for(const [x,z]of [[5.20,5.75],[5.20,8.50],[6.44,8.50],[6.44,5.75]])pose=go(walk,pose,x,z);
  near(local(walk,pose)[2]-pose.eyeHeight,walk.plans.first.elevation);assert.equal(pose.floor,'first');
  for(const [x,z]of [[4.90,5.75],[4.90,6.10],[4.60,6.10],[4.60,8.62],[5.65,8.62],[5.65,5.80]])pose=go(walk,pose,x,z);
  near(local(walk,pose)[2]-pose.eyeHeight,walk.plans.attic.elevation);assert.equal(pose.floor,'attic');
  for(const floor of ['basement','ground','first','attic']){
    let p=walk.locateFree(world(walk,2,2,walk.plans[floor].elevation+1.57),{floorHint:floor});
    p=go(walk,p,3,3);near(local(walk,p)[2]-p.eyeHeight,walk.plans[floor].elevation);
  }
});

test('an inherited seated upper-floor viewpoint stays upstairs while an explicit garden start stays outside',()=>{
  const {walk,data,settings}=build({canopyEnabled:true,terraceCoverType:'balcony',canopyWidth:10.77,canopyDepth:4});
  // Existing eye presets can be seated, lower than the walking eye height.
  // Inheriting their location must choose the nearest support, not ground.
  const observer=world(walk,2,-1.2,walk.plans.first.elevation+1.20);
  const inherited=walk.locateFree(observer);
  assert.equal(inherited.floor,'first');near(local(walk,inherited)[2]-inherited.eyeHeight,walk.plans.first.elevation);
  const x=data.site.terrace.x+data.site.terrace.width*.85,y=data.site.rearMidpoint[1]+settings.terraceDepth+1.8;
  const explicit=walk.locateFree([x,gardenGroundAt(x,y,settings,data)+1.57,y],{floorHint:'garden'});
  assert.equal(explicit.floor,'garden');near(explicit.position[1],gardenGroundAt(x,y,settings,data)+1.57);
});

test('terrace edges and front/back grade changes are traversable in both directions beneath the balcony',()=>{
  const {walk,data,settings}=build({canopyEnabled:true,terraceCoverType:'balcony',canopyWidth:10.77,canopyDepth:4,gardenRaise:.6});
  const terrace=data.site.terrace,ref=terraceGroundReference(settings,data);
  const stairs=terraceStairs({...terrace,y:data.site.rearMidpoint[1]},settings.terraceDepth,ref.drop,settings,data);
  const x=[.25,.5,.75].map(f=>terrace.x+f*terrace.width).find(x=>x<stairs.x-.3||x>stairs.x+stairs.width+.3);
  assert.ok(Number.isFinite(x),'test path must avoid the terrace stairs');
  const y=data.site.rearMidpoint[1]+settings.terraceDepth;
  let pose=walk.locateFree([x,ref.floorZ+1.57,y-.12],{floorHint:'ground'});
  near(pose.position[1],ref.floorZ+1.57);
  pose=goWorld(walk,pose,[x,0,y+.5]);assert.equal(pose.floor,'garden');
  near(pose.position[1],gardenGroundAt(x,y+.5,settings,data)+1.57);
  pose=goWorld(walk,pose,[x,0,y-.12]);near(pose.position[1],ref.floorZ+1.57);assert.equal(pose.floor,'ground');
  const sideX=Math.min(...data.site.house.footprint.map(p=>p[0]))-.6,rear=data.site.rearMidpoint[1];
  pose=walk.locateFree([sideX,gardenGroundAt(sideX,rear-.1,settings,data)+1.57,rear-.1],{floorHint:'garden'});
  pose=goWorld(walk,pose,[sideX,0,rear+.1]);near(pose.position[1],gardenGroundAt(sideX,rear+.1,settings,data)+1.57);
  pose=goWorld(walk,pose,[sideX,0,rear-.1]);near(pose.position[1],gardenGroundAt(sideX,rear-.1,settings,data)+1.57);
});

test('entering the pool and jacuzzi lowers the eye to water level and exiting restores standing height',()=>{
  const {walk,data,settings}=build({canopyEnabled:true,terraceCoverType:'balcony',canopyWidth:10.77,canopyDepth:4}),pool=poolBounds(settings,data),levels=spaLevels(settings,data),tub=jacuzziBounds(settings,data);
  let pose=walk.locateFree([pool.x-.4,levels.pool.groundZ+1.57,pool.y+pool.length/2],{floorHint:'garden'});
  pose=goWorld(walk,pose,[pool.x+pool.width/2,0,pool.y+pool.length/2]);
  assert.equal(pose.swimming,true);assert.equal(pose.surface,'pool-water');near(pose.position[1],levels.pool.waterZ+.25);
  pose=goWorld(walk,pose,[pool.x+pool.width+.4,0,pool.y+pool.length/2]);
  assert.equal(pose.swimming,false);near(pose.position[1],gardenGroundAt(pose.position[0],pose.position[2],settings,data)+1.57);
  pose=walk.locateFree([(tub.x0+tub.x1)/2,tub.z+1.57,(tub.y0+tub.y1)/2],{floorHint:'ground'});
  assert.equal(pose.swimming,true);assert.equal(pose.surface,'jacuzzi-water');near(pose.position[1],tub.waterZ+.35);
  pose=goWorld(walk,pose,[tub.x0-.4,0,(tub.y0+tub.y1)/2]);
  assert.equal(pose.swimming,false);near(pose.position[1],tub.z+1.57);
  const above=walk.locateFree([(tub.x0+tub.x1)/2,walk.frame.floorZ+walk.plans.first.elevation+1.57,(tub.y0+tub.y1)/2],{floorHint:'first'});
  assert.equal(above.swimming,false,'the tub must not pull the balcony camera down');
});

test('explicit height controls cross floors freely and keep altitude until follow-ground is requested',()=>{
  const {walk}=build();let pose=walk.locateFree(world(walk,2,2,1.57),{floorHint:'ground'});
  const start=pose.position.slice();
  pose=walk.moveFree(pose.position,[0,12,0],{eyeHeight:pose.eyeHeight,floating:true});
  near(pose.position[1],start[1]+12);assert.equal(pose.floating,true);assert.equal(pose.swimming,false);
  pose=go(walk,pose,3,3);near(pose.position[1],start[1]+12);
  pose=walk.moveFree(pose.position,[0,-11.8,0],{eyeHeight:pose.eyeHeight,floating:true});
  near(pose.position[1],start[1]+.2);
  pose=walk.locateFree(pose.position,{eyeHeight:pose.eyeHeight});
  near(local(walk,pose)[2]-pose.eyeHeight,0);assert.equal(pose.floating,false);
});
