import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gardenProgram,poolBounds} from '../src/garden-program.js';
import {getScreeningLayouts,STERNICZA_POOL_END_TREES,STERNICZA_LEFT_EDGE_TREES} from '../src/screening-layouts.js';
import {screeningTreeVolumes,treeRayIntersection} from '../src/screening-trees.js';
import {analyzeVisibility,observerForPreset,pointInPolygon,jacuzziBounds,spaLevels,gardenGroundAt,terraceGroundReference} from '../src/geometry.js';
import {closestFootprints,closestBoundary,gardenDimensions} from '../src/dimensions.js';
import {rectCorners,terraceStairs,rectanglesOverlap} from '../src/layout.js';
import {analyzeSunlight} from '../src/shade.js';
import {sunForSettings} from '../src/solar.js';
const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const other=JSON.parse(readFileSync(new URL('../data/korzeniowskiego-40.json',import.meta.url)));
const study=JSON.parse(readFileSync(new URL('../docs/pool-end-screening-comparison.json',import.meta.url)));
const base=study.settings,state={...base,screeningTrees:STERNICZA_POOL_END_TREES};
const selected=study.layouts.find(l=>l.id==='selected'),previous=study.layouts.find(l=>l.id==='previous-v12');
const close=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-8,`${label}: ${a} versus ${b}`);

test('pool-end default is explicit, preserves the previous pool and keeps compact spa capacities',()=>{
 const fresh=getScreeningLayouts('sternicza-11').find(l=>l.id==='default');
 assert.equal(fresh.settings.gardenProgram,'spa-screened');assert.equal(fresh.settings.hedgeFront,4);
 assert.deepEqual(fresh.trees,STERNICZA_POOL_END_TREES);assert.deepEqual(fresh.trees,selected.trees);
 assert.deepEqual(fresh.trees.map(t=>[t.x,t.y]),[[13,34.1],[14.4,25.7],[17.6,34.9]]);
 assert.deepEqual(getScreeningLayouts('sternicza-11','spa-compact')[0].trees,STERNICZA_LEFT_EDGE_TREES);
 assert.deepEqual(getScreeningLayouts('korzeniowskiego-40','spa-screened'),[]);
 const p=poolBounds(base,data),old=poolBounds(study.previousSettings,data);
 assert.deepEqual([p.x,p.y,p.width,p.length],[15.7,19.5,3.5,7]);
 assert.deepEqual([old.x,old.y,old.width,old.length],[15.7,24.5,3.5,8]);
 const proposal=gardenProgram(base,data),prior=gardenProgram(study.previousSettings,data);
 assert.deepEqual(proposal.sauna,prior.sauna);assert.deepEqual(proposal.coldPlunge,prior.coldPlunge);
 assert.equal(proposal.sauna.seatCentres.length,6);assert.equal(jacuzziBounds(base,data).seatCentres.length,7);
 assert.equal(jacuzziBounds(base,data).width,2.3);assert.equal(jacuzziBounds(base,data).overflow,false);
 assert.equal(gardenProgram(base,other).active,false);
});

test('moved pool and nearest pine have real mapped gaps without occupying furniture or circulation',()=>{
 const p=gardenProgram(base,data),pool=p.pool,footprint=rectCorners(pool,pool.coping);
 assert.ok(footprint.every(q=>pointInPolygon(q,data.site.boundary)));
 const houseGap=closestFootprints(footprint,data.site.house.footprint).distance;
 close(houseGap,1.2313250129934108,'Pool coping to mapped house');assert.ok(houseGap>1.2);
 close(gardenDimensions(base,data).find(d=>d.id==='pool-house').value,houseGap,'Displayed pool-to-house gap');
 close(closestBoundary(footprint,data,'left').distance,.8241773887422581,'Pool east-side maintenance strip');
 for(const depth of [3,4.2,6]){
  const s={...base,terraceDepth:depth},terrace={...data.site.terrace,length:depth};
  const stairs=terraceStairs(data.site.terrace,depth,terraceGroundReference(s,data).drop,s,data);
  close(closestFootprints(footprint,rectCorners(terrace)).distance,1.5608323435792553,'Lateral terrace gap');
  assert.equal(rectanglesOverlap(pool,terrace,pool.coping),false);
  assert.equal(rectanglesOverlap(pool,stairs,pool.coping),false);
 }
 const nearest=STERNICZA_POOL_END_TREES.reduce((a,b)=>a.y<b.y?a:b);
 close(pool.y+pool.length-nearest.y,.8,'Pine is slightly before far water end');
 close(closestFootprints([[nearest.x,nearest.y]],footprint).distance,1.02,'Trunk to coping');
 assert.ok(selected.placement.every(p=>p.allowanceAccepted&&p.minimumGroundObstacleDistance>=1&&p.boundaryCentreDistance>=1));
 assert.ok(screeningTreeVolumes(state,data).every(v=>v.plantable&&v.crownInside));
 assert.ok(selected.pairDistances.every(d=>d.metres>=3));
 assert.equal(selected.pairDistances.filter(d=>d.metres<5).length,1,'Only the rear pair overlaps; do not claim one connected three-crown grove');
});

test('pool level keeps the full moved coping above uneven surveyed grade',()=>{
 const p=poolBounds(base,data),level=spaLevels(base,data).pool;
 for(let x=p.x-p.coping;x<=p.x+p.width+p.coping+.001;x+=.2)for(let y=p.y-p.coping;y<=p.y+p.length+p.coping+.001;y+=.2){
  assert.ok(level.copingTopZ>gardenGroundAt(x,y,base,data),'Coping must clear the moved uphill edge');
 }
 close(level.waterZ-level.bottomZ,1.4,'Water depth');
});

test('new PCK3 coverage reproduces all 19 occupied-view checks and improves the requested views',()=>{
 const expected={sofa:[41,420],standing:[42,420],terrace:[13,420],jacuzzi:[37,460],garden:[1,420],sauna:[0,460],firepit:[23,420]};
 assert.equal(study.observers.length,19);
 for(const observer of study.observers){
  const result=analyzeVisibility(observer,state,data).byBlock.find(b=>b.id==='building-9');
  const recorded=selected.views.find(v=>v.id===observer.id);
  assert.deepEqual([result.visible,result.total],[recorded.visible,recorded.total],observer.id);
 }
 for(const [preset,counts] of Object.entries(expected)){
  const observer=observerForPreset(preset,{...base,eyeHeight:undefined},data);
  const result=analyzeVisibility(observer,state,data).byBlock.find(b=>b.id==='building-9');
  assert.deepEqual([result.visible,result.total],counts,`${preset} live preset`);
  assert.ok(result.visible<=previous.views.find(v=>v.id===preset).visible,`${preset} must not lose default screening`);
 }
 const control=study.layouts.find(l=>l.id==='pool-and-front-only');
 for(const row of previous.views.filter(v=>v.comparable!==false)){
  assert.equal(control.views.find(v=>v.id===row.id).visible,row.visible,'Do not attribute rear PCK3 improvement to a front hedge or a water footprint');
 }
 const behind=study.layouts.find(l=>l.id==='directly-behind-end');
 for(const preset of ['sofa','standing','jacuzzi'])assert.ok(selected.views.find(v=>v.id===preset).visible<behind.views.find(v=>v.id===preset).visible);
 assert.ok(selected.views.find(v=>v.id==='new-pool-west-path').hiddenPercent<65,'The study must disclose the remaining pool-path exposure');
});

test('all new screening credit comes from crown intersections inside the parcel',()=>{
 const volumes=screeningTreeVolumes(state,data);
 for(const observer of study.observers){
  const rays=analyzeVisibility(observer,{...base,screeningTrees:[]},data).rays.filter(r=>r.blockId==='building-9');
  const visible=rays.filter(ray=>ray.visible&&!volumes.some(v=>{const hit=treeRayIntersection(ray.origin,ray.target,v);return hit&&pointInPolygon([hit.x,hit.y],data.site.boundary);})).length;
  assert.equal(visible,selected.views.find(v=>v.id===observer.id).visible,observer.id);
 }
});

test('the moved pool sun gains and added terrace shade use the same final tree geometry',()=>{
 for(const minutes of [720,900]){
  const s={...state,sunDate:'2026-06-21',sunMinutes:minutes};
  const measured=analyzeSunlight(s,data,sunForSettings(s,data)),recorded=selected.sunlight.find(v=>v.date===s.sunDate&&v.minutes===minutes);
  assert.deepEqual([measured.zones.pool.sunlit,measured.zones.pool.total],[recorded.zones.pool.sunlit,recorded.zones.pool.total]);
  assert.equal(measured.zones.terrace.sunlit,recorded.zones.terrace.sunlit);
 }
 const noon=selected.sunlight.find(v=>v.date==='2026-06-21'&&v.minutes===720);
 const afternoon=selected.sunlight.find(v=>v.date==='2026-06-21'&&v.minutes===900);
 assert.deepEqual([noon.zones.pool.sunlit,noon.zones.pool.total,noon.zones.terrace.sunlit],[16,24,25]);
 assert.deepEqual([afternoon.zones.pool.sunlit,afternoon.zones.pool.total],[8,24]);
});
