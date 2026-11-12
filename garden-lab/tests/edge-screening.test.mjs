import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getScreeningLayouts,STERNICZA_EDGE_TREES} from '../src/screening-layouts.js';
import {getTreeType} from '../src/tree-catalog.js';
import {gardenProgram} from '../src/garden-program.js';
import {screeningTreeVolumes} from '../src/screening-trees.js';
import {analyzeVisibility,observerForPreset,pointInPolygon,terraceGroundReference} from '../src/geometry.js';
import {rectCorners,terraceStairs} from '../src/layout.js';
const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const recorded=JSON.parse(readFileSync(new URL('../docs/edge-screening-comparison.json',import.meta.url)));
const layouts=getScreeningLayouts('sternicza-11','spa-edge');
const base={...recorded.settings,screeningTrees:[]};
const p=gardenProgram(base,data);
const terrace={...data.site.terrace,depth:base.terraceDepth};
const stairs=terraceStairs(terrace,base.terraceDepth,terraceGroundReference(base,data).drop,base,data);
const obstacles=[data.site.house.footprint,rectCorners(terrace),rectCorners(stairs),rectCorners(p.pool,p.pool.coping),p.sauna.footprint,...(p.sauna.entrySteps||[]).map(step=>step.footprint),p.firepit.outerFootprint||p.firepit.footprint,rectCorners(p.coldPlunge,p.coldPlunge.pad??.18),...p.coldPlunge.steps.map(s=>rectCorners(s)),rectCorners(p.furniture.dining),...p.furniture.loungers.map(([x,y])=>rectCorners({x,y,width:.78,length:2})),...p.furniture.path.map(([x,y])=>rectCorners({x,y,width:1.15,length:.9}))];
const distance=(point,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],n=dx*dx+dy*dy,t=n?Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/n)):0;return Math.hypot(point[0]-a[0]-dx*t,point[1]-a[1]-dy*t);};
const ringDistance=(point,ring)=>Math.min(...ring.map((a,i)=>distance(point,a,ring[(i+1)%ring.length])));
const visible=(observer,trees)=>analyzeVisibility(observer,{...base,screeningTrees:trees},data).byBlock.find(b=>b.id==='building-9');

test('edge design restores three catalog-size tall pines including the forward third crown',()=>{
 assert.deepEqual(getScreeningLayouts('sternicza-11'),layouts);
 assert.deepEqual(layouts.map(l=>l.id),['default','living-priority','mixed-pines','budget-pines','hedges-only']);
 assert.deepEqual(layouts[0].trees,STERNICZA_EDGE_TREES);
 assert.equal(STERNICZA_EDGE_TREES.length,3);
 for(const tree of STERNICZA_EDGE_TREES){
  assert.equal(tree.typeId,'austrian-pine-tall');
  for(const [key,value] of Object.entries(getTreeType(tree.typeId).dimensions))assert.equal(tree[key],value,`${tree.id} retains catalog ${key}`);
 }
 assert.deepEqual([STERNICZA_EDGE_TREES[2].x,STERNICZA_EDGE_TREES[2].y],[14.4,25.7]);
 assert.equal(STERNICZA_EDGE_TREES.reduce((sum,t)=>sum+getTreeType(t.typeId).pricePLN,0),179700);
 assert.equal(layouts.find(l=>l.id==='mixed-pines').trees.reduce((sum,t)=>sum+getTreeType(t.typeId).pricePLN,0),136700);
 assert.deepEqual(getScreeningLayouts('korzeniowskiego-40','spa-edge'),[]);
});

test('edge presets reserve actual soil around trunks and keep all modeled crowns inside the plot',()=>{
 for(const layout of layouts){
  const volumes=screeningTreeVolumes({...base,screeningTrees:layout.trees},data);
  for(const v of volumes){
   assert.ok(v.plantable,`${layout.id}/${v.id} has a valid trunk location`);
   assert.ok(v.crownInside,`${layout.id}/${v.id} crown remains inside plot`);
   assert.ok(ringDistance([v.x,v.y],data.site.boundary)>=v.crownWidth/2+.15-1e-8);
   for(const ring of obstacles){
    assert.ok(!pointInPolygon([v.x,v.y],ring));
    assert.ok(ringDistance([v.x,v.y],ring)>=1-1e-8,`${layout.id}/${v.id} has a 1 m concept planting allowance`);
   }
   const bowl=rectCorners(p.firepit.table);
   assert.ok(ringDistance([v.x,v.y],bowl)>v.crownWidth/2,`${layout.id}/${v.id} crown is not over the fire bowl`);
   for(const o of recorded.observers){
    assert.ok(Math.hypot(o.x-v.x,o.y-v.y)>=1-1e-8,`${layout.id}/${v.id} does not place a trunk on ${o.id}`);
    const q=(o.x-v.x)**2/v.crownRadii[0]**2+(o.y-v.y)**2/v.crownRadii[1]**2+(o.z-v.crownCenter[2])**2/v.crownRadii[2]**2;
    assert.ok(q>=1,`${layout.id}/${v.id} does not engulf ${o.id} in opaque foliage`);
   }
  }
 }
 // Screening needs intentional crown overhang here; do not silently claim the
 // default is clear of all hardscape merely because its trunks are plantable.
 assert.ok(screeningTreeVolumes({...base,screeningTrees:layouts[0].trees},data).some(v=>v.warnings.some(w=>w.includes('overhangs'))));
});

test('balanced edge pines improve the main views and retain honest side-garden residuals',()=>{
 const old=getScreeningLayouts('sternicza-11','spa')[0].trees;
 const expected={sofa:41,standing:44,terrace:20,jacuzzi:44,garden:2,sauna:0,firepit:17};
 for(const [preset,count] of Object.entries(expected)){
  const observer=observerForPreset(preset,{...base,eyeHeight:undefined},data),after=visible(observer,layouts[0].trees);
  assert.equal(after.visible,count,`${preset} PCK3 visible sample count`);
  if(['sofa','standing','terrace','jacuzzi'].includes(preset))assert.ok(after.visible<visible(observer,old).visible,`${preset} improves compared with behind-pool planting`);
 }
 for(const id of ['dining-seated','right-garden-path','pool-west-path','pool-rear-path','rear-centre-path']){
  const o=recorded.observers.find(o=>o.id===id);
  assert.ok(visible(o,layouts[0].trees).visible>0,`${id} must not be described as fully screened`);
 }
 const samePositionSmall=layouts[0].trees.map((t,i)=>i===2?{...t,typeId:'austrian-pine-large',...getTreeType('austrian-pine-large').dimensions}:t);
 const standing=observerForPreset('standing',{...base,eyeHeight:undefined},data);
 assert.equal(visible(standing,samePositionSmall).visible,304,'Forward 5.5 m crown leaves the high house sightlines exposed');
});

test('living-priority comparison exposes its tradeoff instead of treating it as all-view screening',()=>{
 const trees=layouts.find(l=>l.id==='living-priority').trees;
 assert.equal(visible(observerForPreset('sofa',{...base,eyeHeight:undefined},data),trees).visible,0);
 assert.equal(visible(observerForPreset('standing',{...base,eyeHeight:undefined},data),trees).visible,2);
 assert.equal(visible(observerForPreset('terrace',{...base,eyeHeight:undefined},data),trees).visible,2);
 assert.equal(visible(observerForPreset('jacuzzi',{...base,eyeHeight:undefined},data),trees).visible,3);
 const poolWalk=recorded.observers.find(o=>o.id==='pool-west-path');
 assert.equal(visible(poolWalk,trees).visible,369);
 assert.ok(visible(poolWalk,trees).visible>visible(poolWalk,layouts[0].trees).visible);
});

test('recorded study counts are reproduced by the complete visibility engine from every checked viewpoint',()=>{
 const selected=recorded.layouts.find(l=>l.name==='Three tall pines, screened layout');
 const deployed=layouts[0].trees.map(t=>[t.typeId,t.x,t.y]).sort();
 assert.deepEqual(selected.trees.map(t=>[t.typeId,t.x,t.y]).sort(),deployed);
 for(const observer of recorded.observers){
  const measured=visible(observer,layouts[0].trees),expected=selected.views.find(v=>v.id===observer.id);
  assert.equal(measured.visible,expected.visible,observer.id);
  assert.equal(measured.total,expected.total,observer.id);
 }
});
