import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getScreeningLayouts,STERNICZA_LEFT_EDGE_TREES,STERNICZA_WIDER_LEFT_EDGE_TREES,STERNICZA_CORNER_TREES} from '../src/screening-layouts.js';
import {getTreeType} from '../src/tree-catalog.js';
import {screeningTreeVolumes,treeRayIntersection} from '../src/screening-trees.js';
import {analyzeVisibility,observerForPreset,pointInPolygon,jacuzziBounds} from '../src/geometry.js';
import {gardenProgram} from '../src/garden-program.js';
import {analyzeSunlight} from '../src/shade.js';
import {sunForSettings} from '../src/solar.js';
const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const study=JSON.parse(readFileSync(new URL('../docs/left-edge-screening-comparison.json',import.meta.url)));
const selected=study.layouts.find(l=>l.name==='Selected left-edge grove');
const contained=study.layouts.find(l=>l.name==='Contained corner comparison');
const wider=study.layouts.find(l=>l.name==='Wider left-edge comparison');
const compact=getScreeningLayouts('sternicza-11','spa-compact');
const fresh=compact.find(l=>l.id==='default');
const base={...study.settings,screeningTrees:[]};
const state={...base,screeningTrees:fresh.trees};
const visible=(observer,trees)=>analyzeVisibility(observer,{...base,screeningTrees:trees},data).byBlock.find(b=>b.id===study.target.id);
const close=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-8,`${label}: ${a} versus ${b}`);

test('compact spa defaults move the outer crown left while preserving published corner layouts',()=>{
 assert.deepEqual(getScreeningLayouts('sternicza-11'),compact);
 assert.deepEqual(fresh.trees,STERNICZA_LEFT_EDGE_TREES);
 assert.deepEqual(fresh.trees,selected.trees);
 assert.equal(fresh.settings.gardenProgram,'spa-compact');
 assert.deepEqual(fresh.trees.map(t=>[t.x,t.y]),[[13.3,34.5],[14.35,31],[18.1,34.5]]);
 assert.deepEqual(compact.find(l=>l.id==='wider-left-edge').trees,STERNICZA_WIDER_LEFT_EDGE_TREES);
 assert.deepEqual(STERNICZA_WIDER_LEFT_EDGE_TREES,wider.trees);
 assert.deepEqual(wider.trees.map(t=>[t.x,t.y]),[[13.5,35],[14.4,30],[19.3,33.8]]);
 assert.deepEqual(compact.find(l=>l.id==='contained-corner').trees,STERNICZA_CORNER_TREES);
 assert.deepEqual(contained.trees,STERNICZA_CORNER_TREES);
 assert.deepEqual(getScreeningLayouts('sternicza-11','spa-edge')[0].trees,STERNICZA_CORNER_TREES);
 assert.notDeepEqual(fresh.trees,STERNICZA_CORNER_TREES);
 assert.deepEqual(getScreeningLayouts('korzeniowskiego-40','spa-compact'),[]);
 for(const tree of fresh.trees){assert.equal(tree.height,9.5);assert.equal(tree.crownWidth,5);assert.equal(tree.crownDepth,5);assert.equal(tree.crownBase,2.5);}
 assert.equal(fresh.trees.reduce((sum,t)=>sum+getTreeType(t.typeId).pricePLN,0),179700);
});

test('left-edge default keeps a compact connected crown group and discloses its small overhang',()=>{
 const volumes=screeningTreeVolumes(state,data);
 assert.deepEqual(volumes.map(v=>v.plantable),[true,true,true]);
 assert.deepEqual(volumes.map(v=>v.crownInside),[true,true,false]);
 assert.ok(selected.placement.every(p=>p.allowanceAccepted&&p.boundaryCentreDistance>=1&&p.minimumHardscapeCentreDistance>=1));
 close(selected.placement[2].nominalCrownOverhang,.2872044698039211,'Outer crown overhang');
 assert.ok(volumes[2].warnings.some(w=>w.includes('beyond the property')));
 assert.match(fresh.note,/0\.29 m beyond the left boundary/);
 assert.ok(screeningTreeVolumes({...base,screeningTrees:contained.trees},data).every(v=>v.crownInside));
 close(selected.trunkBounds.width,4.8,'Group width');close(selected.trunkBounds.depth,3.5,'Group depth');
 assert.deepEqual(selected.pairDistances.map(p=>Number(p.metres.toFixed(2))),[3.65,4.8,5.13]);
 // Pine 1 joins both other crowns; the grove is connected without pretending
 // that every pair overlaps or that real foliage is an opaque wall.
 const overlaps=selected.pairDistances.filter(p=>p.metres<5);
 assert.deepEqual(overlaps.map(p=>[p.first,p.second]),[['pine-1','pine-2'],['pine-1','pine-3']]);
 assert.ok(fresh.trees.every(t=>t.y>=31),'No default tree is brought forward of the previous grove');
 assert.ok(wider.pairDistances.every(p=>p.metres>5),'The wider comparison explicitly loses crown overlap');
 // The 0.82 m strip along the pool cannot reserve 1 m on both sides of a trunk.
 assert.ok(study.geometry.poolEastCopingToBoundary<1);
 assert.ok(study.geometry.poolEastCopingToBoundary<2);
});

test('new compact geometry reproduces every reported PCK3 view and updates the jacuzzi observer',()=>{
 assert.equal(gardenProgram(base,data).id,'spa-compact');
 const tub=jacuzziBounds(base,data);assert.equal(tub.width,2.3);assert.equal(tub.length,2.3);assert.equal(tub.overflow,false);
 assert.equal(study.observers.length,17);
 for(const observer of study.observers){
  const measured=visible(observer,fresh.trees),expected=selected.views.find(v=>v.id===observer.id);
  assert.equal(measured.visible,expected.visible,`${observer.id} visible`);assert.equal(measured.total,expected.total,`${observer.id} total`);
 }
 const named={sofa:[202,420],standing:[216,420],terrace:[76,420],jacuzzi:[46,460],garden:[1,420],sauna:[0,460],firepit:[24,420]};
 for(const [preset,counts] of Object.entries(named)){
  const observer=observerForPreset(preset,{...base,eyeHeight:undefined},data),measured=visible(observer,fresh.trees);
  assert.deepEqual([measured.visible,measured.total],counts,`${preset} live position`);
 }
 for(const preset of ['sofa','standing','terrace']){
  const observer=observerForPreset(preset,{...base,eyeHeight:undefined},data);
  assert.ok(visible(observer,fresh.trees).visible<visible(observer,contained.trees).visible);
 }
 assert.ok(selected.views.find(v=>v.id==='jacuzzi').visible>contained.views.find(v=>v.id==='jacuzzi').visible);
 assert.equal(selected.views.find(v=>v.id==='garden').visible,contained.views.find(v=>v.id==='garden').visible);
 for(const observer of study.observers){
  const measured=visible(observer,wider.trees),expected=wider.views.find(v=>v.id===observer.id);
  assert.deepEqual([measured.visible,measured.total],[expected.visible,expected.total],`Wider comparison: ${observer.id}`);
 }
 for(const id of ['sofa','standing'])assert.ok(wider.views.find(v=>v.id===id).visible<selected.views.find(v=>v.id===id).visible);
});

test('the recorded outside-crown sensitivity does not hide its contribution to screening',()=>{
 const volumes=screeningTreeVolumes(state,data);
 for(const observer of study.observers){
  const rays=analyzeVisibility(observer,base,data).rays.filter(r=>r.blockId===study.target.id);
  const visibleInsideOnly=rays.filter(ray=>ray.visible&&!volumes.some(v=>{
   const hit=treeRayIntersection(ray.origin,ray.target,v);return hit&&pointInPolygon([hit.x,hit.y],data.site.boundary);
  })).length;
  assert.equal(visibleInsideOnly,selected.views.find(v=>v.id===observer.id).visibleWithoutOutsideEntryCredit,observer.id);
 }
 assert.equal(selected.views.find(v=>v.id==='sofa').visibleWithoutOutsideEntryCredit,202);
 assert.equal(selected.views.find(v=>v.id==='standing').visibleWithoutOutsideEntryCredit,216);
 assert.ok(selected.views.every(v=>v.visibleWithoutOutsideEntryCredit===v.visible));
});

test('the left-edge placement preserves the reported pool-sunlight tradeoff',()=>{
 for(const minutes of [720,900]){
  const s={...state,sunDate:'2026-06-21',sunMinutes:minutes};
  const measured=analyzeSunlight(s,data,sunForSettings(s,data));
  const recorded=selected.sunlight.find(v=>v.date===s.sunDate&&v.minutes===minutes);
  assert.equal(measured.zones.pool.sunlit,recorded.zones.pool.sunlit);
  assert.equal(measured.zones.pool.total,recorded.zones.pool.total);
  assert.equal(measured.zones.terrace.sunlit,recorded.zones.terrace.sunlit);
 }
 assert.equal(selected.sunlight.find(v=>v.date==='2026-06-21'&&v.minutes===720).zones.pool.sunlit,11);
 assert.equal(selected.sunlight.find(v=>v.date==='2026-06-21'&&v.minutes===900).zones.pool.sunlit,1);
});
