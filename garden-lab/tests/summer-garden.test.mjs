import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEFAULTS,createStateModel} from '../src/state.js';
import {getSiteProfile} from '../src/sites.js';
import {getScreeningLayouts} from '../src/screening-layouts.js';
import {getTreeType,TREE_CATALOG} from '../src/tree-catalog.js';
import {replaceTreeSpecies} from '../src/tree-selection.js';
import {SUMMER_POOL,summerGardenFurniture,optimizedScreeningTrees} from '../src/summer-garden.js';
import {gardenProgram,poolBounds} from '../src/garden-program.js';
import {gardenFurniture,terraceStairs,rectCorners,rectanglesOverlap} from '../src/layout.js';
import {footprintFit,overlapArea} from '../src/footprint-fit.js';
import {terraceGroundReference} from '../src/geometry.js';
import {screeningTreeVolumes} from '../src/screening-trees.js';
import {closestFootprints,closestBoundary} from '../src/dimensions.js';
import {DESIGN_STYLES} from '../src/design-styles.js';
import {applyPlanExterior} from '../src/plan-exterior.js';
import {applyBuildingOverrides} from '../src/buildings.js';
const source=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const data=applyPlanExterior(applyBuildingOverrides(source,DEFAULTS),DEFAULTS);

test('fresh Sternicza has a common summer pool and Austrian pine defaults, with old layouts still explicit',()=>{
  assert.equal(DEFAULTS.summerPoolLayout,true);assert.equal(DEFAULTS.poolSunbedSides,3);
  assert.ok(DEFAULTS.screeningTrees.every(t=>t.typeId==='austrian-pine-tall'));
  assert.deepEqual(DEFAULTS.screeningTrees,optimizedScreeningTrees());
  for(const style of DESIGN_STYLES){
    const p=poolBounds({...DEFAULTS,designStyle:style.id},data);
    assert.deepEqual([p.x,p.y,p.width,p.length],[SUMMER_POOL.x,SUMMER_POOL.y,8,3.5]);
  }
  const old=poolBounds({...DEFAULTS,summerPoolLayout:false,designStyle:'current'},data);
  assert.deepEqual([old.x,old.y,old.width,old.length],[14.52,26.3,3.5,8]);
  assert.equal(getScreeningLayouts('sternicza-11','spa-pool-grove')[0].trees[0].typeId,'thuja-excelsa-9m');
  assert.equal(getScreeningLayouts('sternicza-11','spa-pool-grove',DEFAULTS)[0].trees[0].typeId,'austrian-pine-tall');
});

test('summer pool and three sunbed sides keep the stair route, spa rooms and parcel clear',()=>{
  const p=poolBounds(DEFAULTS,data),programme=gardenProgram(DEFAULTS,data);
  const stairs=terraceStairs(data.site.terrace,DEFAULTS.terraceDepth,terraceGroundReference(DEFAULTS,data).drop,DEFAULTS,data);
  assert.ok(closestFootprints(rectCorners(p,p.coping),rectCorners(stairs)).distance>=1,
    'At least one metre remains between the bottom stair and pool coping');
  const broad={...DEFAULTS,terraceWidth:10.77,canopyWidth:10.77},broadData=applyPlanExterior(source,broad);
  const broadStairs=terraceStairs(broadData.site.terrace,broad.terraceDepth,terraceGroundReference(broad,broadData).drop,broad,broadData);
  assert.ok(closestFootprints(rectCorners(p,p.coping),rectCorners(broadStairs)).distance>=1,
    'The full-width renovated deck also retains the one-metre exit route');
  assert.equal(footprintFit(rectCorners(p,p.coping),data.site.boundary).location,'inside');
  const obstacles=[rectCorners(stairs),programme.sauna.footprint,programme.firepit.outerFootprint,
    rectCorners(programme.coldPlunge,.24),...programme.coldPlunge.steps.map(s=>rectCorners(s))];
  for(let sides=1;sides<=3;sides++){
    const f=summerGardenFurniture({poolSunbedSides:sides});assert.equal(f.loungerSides.length,sides);
    assert.equal(f.loungers.length,[4,6,7][sides-1]);
    for(const [x,y]of f.loungers){
      const r={x,y,width:.78,length:2};
      assert.equal(footprintFit(rectCorners(r,1),data.site.boundary).location,'inside');
      assert.equal(overlapArea(rectCorners(r),rectCorners(p,p.coping)),0);
      assert.ok(obstacles.every(o=>overlapArea(rectCorners(r,.1),o)<1e-8));
    }
  }
});

test('every renovation style retains all selected sunbeds, dining and its outdoor kitchen',()=>{
  for(const style of DESIGN_STYLES.filter(s=>s.id!=='current'))for(const sides of [1,2,3]){
    const s={...DEFAULTS,designStyle:style.id,poolSunbedSides:sides},f=gardenFurniture(data,s);
    assert.equal(f.resort.items.filter(i=>i.kind==='lounger'||i.kind==='daybed').length,[4,6,7][sides-1],style.id);
    assert.equal(f.diningVisible,true,`${style.id} dining is fitted`);
    assert.ok(f.resort.kitchen,`${style.id} kitchen has a clear working front`);
    for(const item of f.resort.items)assert.ok(!rectanglesOverlap(item,f.dining,.04));
  }
});

test('one species change installs its own calculated boundary positions and valid stock dimensions',()=>{
  const original=optimizedScreeningTrees();original[0].x=8;original[0].y=24;original[0].unitPrice=61000;
  const snapshot=structuredClone(original);
  for(const type of TREE_CATALOG){
    const changed=replaceTreeSpecies(original,type.id,null,{siteId:'sternicza-11',optimized:true});
    assert.deepEqual(changed.map(t=>[t.x,t.y]),optimizedScreeningTrees(type.id).map(t=>[t.x,t.y]));
    assert.deepEqual(changed.map(t=>t.id),original.map(t=>t.id));
    assert.ok(changed.every(t=>t.typeId===type.id&&t.unitPrice===0&&t.height===getTreeType(type.id).dimensions.height));
    const volumes=screeningTreeVolumes({...DEFAULTS,screeningTrees:changed},data);
    assert.ok(volumes.every(v=>v.plantable),type.id);
    for(const tree of changed){
      const p=[[tree.x,tree.y]],distance=Math.min(closestBoundary(p,data,'left').distance,closestBoundary(p,data,'rear').distance);
      assert.ok(distance>=1.1&&distance<=3.7,`${type.id} stays in the boundary band`);
    }
  }
  assert.deepEqual(original,snapshot,'Species presets never mutate a saved garden');
  const one=replaceTreeSpecies(original,'white-fir-9m',original[0].id,{siteId:'sternicza-11',optimized:true});
  assert.equal(one[0].x,8,'Individual edits keep manual placement');
});

test('other properties do not acquire the Sternicza pool or species defaults',()=>{
  for(const id of ['korzeniowskiego-40','nadmorska-17']){
    const d=JSON.parse(readFileSync(new URL(`../data/${id}.json`,import.meta.url)));
    const model=createStateModel(getSiteProfile(id,d)),p=poolBounds({...model.DEFAULTS,summerPoolLayout:true},d);
    assert.equal(p.x,d.site.pool.x);assert.equal(p.y,d.site.pool.y);
    assert.equal(model.DEFAULTS.screeningTrees.length,0);
  }
});
