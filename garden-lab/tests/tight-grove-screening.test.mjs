import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gardenProgram,poolBounds} from '../src/garden-program.js';
import {getScreeningLayouts,STERNICZA_TIGHT_GROVE_TREES,STERNICZA_POOL_END_TREES} from '../src/screening-layouts.js';
import {screeningTreeVolumes,treeRayIntersection} from '../src/screening-trees.js';
import {analyzeVisibility,observerForPreset,pointInPolygon,jacuzziBounds,terraceGroundReference} from '../src/geometry.js';
import {closestFootprints,closestBoundary} from '../src/dimensions.js';
import {rectCorners,terraceStairs} from '../src/layout.js';
import {analyzeSunlight} from '../src/shade.js';
import {sunForSettings} from '../src/solar.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const base={siteId:'sternicza-11',gardenProgram:'spa-grove',hedgeRear:4,hedgeLeft:4,hedgeRight:4,hedgeFront:4,
 hedgeInset:.5,gardenRaise:.5,bedRaise:0,raiseNewHedges:true,terraceDepth:4.2,floorHeight:1.2,
 removeGarage:true,canopyEnabled:false,includeHighFeatures:false,jacuzziOverflow:false,
 treeLeafMode:'auto',sunDate:'2026-06-21',sunMinutes:720,sunEnabled:true};
const state={...base,screeningTrees:STERNICZA_TIGHT_GROVE_TREES};
const close=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<1e-8,`${label}: ${actual} versus ${expected}`);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const distanceToSegment=(p,a,b)=>{
 const dx=b[0]-a[0],dy=b[1]-a[1],n=dx*dx+dy*dy;
 const t=n?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/n)):0;
 return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dy*t);
};
const edgeDistance=(p,ring)=>Math.min(...ring.map((a,i)=>distanceToSegment(p,a,ring[(i+1)%ring.length])));

function obstacles(s){
 const p=gardenProgram(s,data),terrace={...data.site.terrace,length:s.terraceDepth};
 const stairs=terraceStairs(terrace,s.terraceDepth,terraceGroundReference(s,data).drop,s,data);
 return [data.site.house.footprint,rectCorners(terrace),rectCorners(p.pool,p.pool.coping),rectCorners(stairs),p.sauna.footprint,
  ...p.sauna.entrySteps.map(step=>step.footprint),p.firepit.outerFootprint,rectCorners(p.coldPlunge,p.coldPlunge.pad),
  ...p.coldPlunge.steps.map(step=>rectCorners(step)),rectCorners(p.furniture.dining),
  ...p.furniture.loungers.map(([x,y])=>rectCorners({x,y,width:.78,length:2})),
  ...p.furniture.path.map(([x,y])=>rectCorners({x,y,width:1.15,length:.9}))];
}

test('the fresh layout is a close grove while the spaced v1.11 layout retains its geometry',()=>{
 const fresh=getScreeningLayouts('sternicza-11').find(layout=>layout.id==='default');
 assert.equal(fresh.label,'Close pine grove · default');
 assert.equal(fresh.settings.gardenProgram,'spa-grove');assert.equal(fresh.settings.hedgeFront,4);
 assert.match(fresh.note,/2\.00 m/);assert.deepEqual(fresh.trees,STERNICZA_TIGHT_GROVE_TREES);
 assert.deepEqual(fresh.trees.map(t=>[t.x,t.y]),[[13,34.1],[14.2,32.5],[17.6,34.9]]);
 const previous=getScreeningLayouts('sternicza-11','spa-screened').find(layout=>layout.id==='default');
 assert.deepEqual(previous.trees,STERNICZA_POOL_END_TREES);
 assert.deepEqual(previous.trees.map(t=>[t.x,t.y]),[[13,34.1],[14.4,25.7],[17.6,34.9]]);
 const p=poolBounds(base,data),old=poolBounds(previous.settings,data);
 assert.deepEqual([p.x,p.y,p.width,p.length],[15.7,24.5,3.5,7]);
 assert.deepEqual([old.x,old.y,old.width,old.length],[15.7,19.5,3.5,7]);
 const proposal=gardenProgram(base,data),prior=gardenProgram(previous.settings,data);
 assert.equal(proposal.id,'spa-grove');
 for(const key of ['sauna','firepit','coldPlunge','furniture'])assert.deepEqual(proposal[key],prior[key],key);
 assert.equal(proposal.sauna.seatCentres.length,6);
 assert.deepEqual(jacuzziBounds(base,data),jacuzziBounds(previous.settings,data));
 assert.equal(jacuzziBounds(base,data).seatCentres.length,7);
 assert.deepEqual(getScreeningLayouts('korzeniowskiego-40','spa-grove'),[]);
 const comparison=getScreeningLayouts('sternicza-11').find(layout=>layout.id==='previous-spaced-pines');
 assert.deepEqual(comparison.settings,fresh.settings);assert.deepEqual(comparison.trees,previous.trees);
});

test('the nearest trunk is 2 m from the centre and all three crowns overlap inside the parcel',()=>{
 const [centre,nearest,outer]=STERNICZA_TIGHT_GROVE_TREES;
 close(distance(centre,nearest),2,'Requested nearest-to-centre spacing');
 close(distance(centre,outer),Math.hypot(4.6,.8),'Centre-to-outer spacing');
 close(distance(nearest,outer),Math.hypot(3.4,2.4),'Nearest-to-outer spacing');
 const volumes=screeningTreeVolumes(state,data);
 assert.equal(volumes.length,3);assert.ok(volumes.every(v=>v.plantable&&v.crownInside));
 for(let i=0;i<volumes.length;i++)for(let j=i+1;j<volumes.length;j++){
  assert.ok(distance(volumes[i],volumes[j])<(volumes[i].crownWidth+volumes[j].crownWidth)/2,'Every crown pair must overlap');
 }
 const hardscape=obstacles(base);
 for(const tree of volumes){
  const p=[tree.x,tree.y];
  assert.ok(edgeDistance(p,data.site.boundary)>=tree.crownWidth/2,'Nominal crown stays within parcel');
  assert.ok(hardscape.every(ring=>!pointInPolygon(p,ring)&&edgeDistance(p,ring)>=1),'Each trunk retains at least 1 m to fixed hardscape');
 }
 const pool=poolBounds(base,data),footprint=rectCorners(pool,pool.coping);
 assert.ok(footprint.every(point=>pointInPolygon(point,data.site.boundary)));
 close(nearest.y-(pool.y+pool.length),1,'Nearest trunk beyond far water end');
 close(closestFootprints([[nearest.x,nearest.y]],footprint).distance,Math.hypot(1.22,.72),'Nearest trunk to coping');
 assert.ok(closestFootprints(footprint,data.site.house.footprint).distance>6);
 assert.ok(closestBoundary(footprint,data,'left').distance>.8);
});

test('the compact grove reports its actual PCK3 coverage rather than the previous forward-tree result',()=>{
 const expected={sofa:[248,420],standing:[253,420],terrace:[111,420],jacuzzi:[69,460],garden:[1,420],sauna:[0,460],firepit:[23,420]};
 const volumes=screeningTreeVolumes(state,data);
 for(const [preset,counts] of Object.entries(expected)){
  const observer=observerForPreset(preset,{...base,eyeHeight:undefined},data);
  const result=analyzeVisibility(observer,state,data).byBlock.find(block=>block.id==='building-9');
  assert.deepEqual([result.visible,result.total],counts,preset);
  const rays=analyzeVisibility(observer,{...base,screeningTrees:[]},data).rays.filter(ray=>ray.blockId==='building-9');
  const visibleInside=rays.filter(ray=>ray.visible&&!volumes.some(volume=>{
   const hit=treeRayIntersection(ray.origin,ray.target,volume);
   return hit&&pointInPolygon([hit.x,hit.y],data.site.boundary);
  })).length;
  assert.equal(visibleInside,result.visible,`${preset}: no screening credit from outside the parcel`);
 }
});

test('the pool and terrace sunlight use the corrected close grove and 7 m water footprint',()=>{
 const sun=analyzeSunlight(state,data,sunForSettings(state,data));
 assert.deepEqual([sun.zones.pool.sunlit,sun.zones.pool.total],[14,24]);
 assert.deepEqual([sun.zones.terrace.sunlit,sun.zones.terrace.total],[32,32]);
 assert.deepEqual([sun.zones.jacuzzi.sunlit,sun.zones.jacuzzi.total],[4,4]);
});
