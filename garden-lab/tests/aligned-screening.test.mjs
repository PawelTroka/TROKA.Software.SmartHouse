import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gardenProgram,poolBounds} from '../src/garden-program.js';
import {getScreeningLayouts,STERNICZA_ALIGNED_TREES,STERNICZA_TIGHT_GROVE_TREES} from '../src/screening-layouts.js';
import {screeningTreeVolumes,treeRayIntersection} from '../src/screening-trees.js';
import {analyzeVisibility,observerForPreset,pointInPolygon,jacuzziBounds,terraceGroundReference} from '../src/geometry.js';
import {closestFootprints,closestBoundary} from '../src/dimensions.js';
import {rectCorners,terraceStairs} from '../src/layout.js';
import {analyzeSunlight} from '../src/shade.js';
import {sunForSettings} from '../src/solar.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const base={siteId:'sternicza-11',gardenProgram:'spa-aligned',hedgeRear:4,hedgeLeft:4,hedgeRight:4,hedgeFront:4,hedgeFullPerimeter:true,
 hedgeInset:.5,gardenRaise:.5,bedRaise:0,raiseNewHedges:true,terraceDepth:4.2,floorHeight:1.2,
 removeGarage:true,canopyEnabled:false,includeHighFeatures:false,jacuzziOverflow:false,
 treeLeafMode:'auto',sunDate:'2026-06-21',sunMinutes:720,sunEnabled:true};
const state={...base,screeningTrees:STERNICZA_ALIGNED_TREES};
const close=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<1e-8,`${label}: ${actual} versus ${expected}`);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

function obstacles(s){
 const p=gardenProgram(s,data),terrace={...data.site.terrace,length:s.terraceDepth};
 const stairs=terraceStairs(terrace,s.terraceDepth,terraceGroundReference(s,data).drop,s,data);
 return [data.site.house.footprint,rectCorners(terrace),rectCorners(p.pool,p.pool.coping),rectCorners(stairs),p.sauna.footprint,
  ...p.sauna.entrySteps.map(step=>step.footprint),p.firepit.outerFootprint,rectCorners(p.coldPlunge,p.coldPlunge.pad),
  ...p.coldPlunge.steps.map(step=>rectCorners(step)),rectCorners(p.furniture.dining),
  ...p.furniture.loungers.map(([x,y])=>rectCorners({x,y,width:.78,length:2})),
  ...p.furniture.path.map(([x,y])=>rectCorners({x,y,width:1.15,length:.9}))];
}

test('the facade-aligned default has a 6 m pool while historical pool and planting geometry remain explicit',()=>{
 const fresh=getScreeningLayouts('sternicza-11')[0],previous=getScreeningLayouts('sternicza-11','spa-grove')[0];
 assert.equal(fresh.label,'PCK3-aligned grove · default');
 assert.equal(fresh.settings.gardenProgram,'spa-aligned');assert.equal(fresh.settings.hedgeFullPerimeter,true);
 assert.deepEqual(fresh.trees,STERNICZA_ALIGNED_TREES);
 assert.deepEqual(fresh.trees.map(t=>[t.x,t.y]),[[17.5,26.8],[14.85,28.4],[12.05,32.35]]);
 assert.deepEqual(previous.trees,STERNICZA_TIGHT_GROVE_TREES);
 for(const [program,expected] of [['spa-aligned',[15.7,19.5,3.5,6]],['spa-grove',[15.7,24.5,3.5,7]],['spa-screened',[15.7,19.5,3.5,7]],['spa-compact',[15.7,24.5,3.5,8]]]){
  const p=poolBounds({...base,gardenProgram:program},data);assert.deepEqual([p.x,p.y,p.width,p.length],expected,program);
 }
 const proposal=gardenProgram(base,data),prior=gardenProgram({...base,gardenProgram:'spa-grove'},data);
 for(const key of ['sauna','firepit','coldPlunge','furniture'])assert.deepEqual(proposal[key],prior[key],key);
 assert.equal(proposal.sauna.seatCentres.length,6);assert.equal(jacuzziBounds(base,data).seatCentres.length,7);
 assert.deepEqual(getScreeningLayouts('korzeniowskiego-40','spa-aligned'),[]);
});

test('the forward and centre pines stay close with a connected crown chain and real parcel and coping clearances',()=>{
 const [forward,centre,rear]=STERNICZA_ALIGNED_TREES;
 close(distance(forward,centre),Math.hypot(2.65,1.6),'Forward-to-centre spacing');
 assert.ok(distance(forward,centre)<3.1);
 assert.ok(distance(centre,rear)<5,'Centre crown connects to the rear crown');
 assert.ok(distance(forward,rear)>5,'Do not describe all three crown pairs as overlapping');
 const volumes=screeningTreeVolumes(state,data),rings=obstacles(base);
 assert.ok(volumes.every(v=>v.plantable&&v.crownInside));
 for(const v of volumes){
  assert.ok(closestBoundary([[v.x,v.y]],data).distance>=v.crownWidth/2);
  for(const ring of rings)assert.ok(!pointInPolygon([v.x,v.y],ring)&&closestFootprints([[v.x,v.y]],ring).distance>=1-1e-8);
 }
 const pool=poolBounds(base,data),footprint=rectCorners(pool,pool.coping);
 assert.ok(footprint.every(point=>pointInPolygon(point,data.site.boundary)));
 close(closestFootprints([[forward.x,forward.y]],footprint).distance,1.02,'Forward trunk to pool coping');
 close(forward.y-pool.y-pool.length,1.3,'Forward trunk beyond far water edge');
 close(closestFootprints(footprint,data.site.house.footprint).distance,1.2313250129934108,'Pool coping to mapped house');
 close(closestBoundary(footprint,data,'left').distance,.8248018735929649,'Pool coping to left boundary');
});

test('the main views hide every PCK3 facade sample and report the remaining roof and lounge exposure separately',()=>{
 const expected={sofa:[7,420,0,7],standing:[12,420,0,12],terrace:[0,420,0,0],jacuzzi:[0,460,0,0],garden:[0,420,0,0],sauna:[0,460,0,0],firepit:[200,420,17,183]};
 const volumes=screeningTreeVolumes(state,data);
 for(const [preset,counts] of Object.entries(expected)){
  const observer=observerForPreset(preset,{...base,eyeHeight:undefined},data),analysis=analyzeVisibility(observer,state,data);
  const rays=analysis.rays.filter(r=>r.blockId==='building-9'),visible=rays.filter(r=>r.visible);
  assert.deepEqual([visible.length,rays.length,visible.filter(r=>r.kind==='facade').length,visible.filter(r=>r.kind==='roof').length],counts,preset);
  const baseline=analyzeVisibility(observer,{...base,screeningTrees:[]},data).rays.filter(r=>r.blockId==='building-9');
  const visibleWithInsideCredit=baseline.filter(ray=>ray.visible&&!volumes.some(volume=>{
   const hit=treeRayIntersection(ray.origin,ray.target,volume);return hit&&pointInPolygon([hit.x,hit.y],data.site.boundary);
  })).length;
  assert.equal(visibleWithInsideCredit,visible.length,`${preset}: no screening credit outside the parcel`);
 }
});

test('the shorter pool and perimeter planting retain their actual selected-time sunlight tradeoff',()=>{
 for(const [minutes,poolSun,terraceSun] of [[720,7,31],[900,5,32]]){
  const s={...state,sunMinutes:minutes},sun=analyzeSunlight(s,data,sunForSettings(s,data));
  assert.deepEqual([sun.zones.pool.sunlit,sun.zones.pool.total],[poolSun,21]);
  assert.deepEqual([sun.zones.terrace.sunlit,sun.zones.terrace.total],[terraceSun,32]);
  assert.deepEqual([sun.zones.jacuzzi.sunlit,sun.zones.jacuzzi.total],[4,4]);
 }
});
