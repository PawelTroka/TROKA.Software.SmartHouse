import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {DEFAULTS,createStateModel} from '../src/state.js';
import {getSiteProfile} from '../src/sites.js';
import {getScreeningLayouts} from '../src/screening-layouts.js';
import {getTreeType,TREE_CATALOG} from '../src/tree-catalog.js';
import {replaceTreeSpecies} from '../src/tree-selection.js';
import {SUMMER_POOL,summerGardenFurniture,optimizedScreeningTrees} from '../src/summer-garden.js';
import {gardenProgram,poolBounds} from '../src/garden-program.js';
import {gardenFurniture,terraceStairs,rectCorners,rectanglesOverlap} from '../src/layout.js';
import {footprintFit,overlapArea} from '../src/footprint-fit.js';
import {terraceGroundReference,jacuzziBounds,hedgeSegments,hedgeGroundAt,hedgeTopAt} from '../src/geometry.js';
import {createHedgeVegetation} from '../src/scene-vegetation.js';
import {screeningTreeVolumes} from '../src/screening-trees.js';
import {closestFootprints,closestBoundary} from '../src/dimensions.js';
import {DESIGN_STYLES} from '../src/design-styles.js';
import {applyPlanExterior} from '../src/plan-exterior.js';
import {applyBuildingOverrides} from '../src/buildings.js';
const source=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const data=applyPlanExterior(applyBuildingOverrides(source,DEFAULTS),DEFAULTS);

test('fresh Sternicza has the long left-edge pool and inward-facing sunbeds, with old layouts still explicit',()=>{
  assert.equal(DEFAULTS.summerPoolLayout,true);assert.equal(DEFAULTS.poolSunbedSides,1);
  assert.ok(DEFAULTS.screeningTrees.every(t=>t.typeId==='austrian-pine-tall'));
  assert.deepEqual(DEFAULTS.screeningTrees,optimizedScreeningTrees());
  for(const style of DESIGN_STYLES){
    const p=poolBounds({...DEFAULTS,designStyle:style.id},data);
    assert.deepEqual([p.x,p.y,p.width,p.length],[SUMMER_POOL.x,SUMMER_POOL.y,3.5,8]);
  }
  const old=poolBounds({...DEFAULTS,summerPoolLayout:false,designStyle:'current'},data);
  assert.deepEqual([old.x,old.y,old.width,old.length],[14.52,26.3,3.5,8]);
  assert.equal(getScreeningLayouts('sternicza-11','spa-pool-grove')[0].trees[0].typeId,'thuja-excelsa-9m');
  assert.equal(getScreeningLayouts('sternicza-11','spa-pool-grove',DEFAULTS)[0].trees[0].typeId,'austrian-pine-tall');
  assert.equal(getScreeningLayouts('sternicza-11','spa-pool-grove',DEFAULTS)[0].settings.poolSunbedSides,1);
});

test('left-edge pool clears the actual rendered hedge and the fire lounge centres the rear garden',()=>{
  const p=poolBounds(DEFAULTS,data),programme=gardenProgram(DEFAULTS,data),tub=jacuzziBounds(DEFAULTS,data);
  const gap=closestBoundary(rectCorners(p,p.coping),data,'left').distance;
  assert.ok(gap>=1.4&&gap<=1.45,'The coping hugs the left edge with the hedge retained');
  const material=new THREE.MeshStandardMaterial();
  const hedge=createHedgeVegetation(hedgeSegments(DEFAULTS,data).filter(s=>s.side==='left'),{
    groundAt:(x,y,s)=>hedgeGroundAt(x,y,s.side,DEFAULTS,data,s.groundZone),
    topAt:(x,y,s)=>hedgeTopAt(x,y,s.side,DEFAULTS,data,s.groundZone),material,
  });
  try{
    const b=new THREE.Box3().setFromObject(hedge);
    const foliageGap=b.min.x-(p.x+p.width+p.coping);
    assert.ok(foliageGap>.25&&foliageGap<.40,'Rendered foliage leaves a narrow clear edge beside the coping');
  }finally{hedge.traverse(o=>o.geometry?.dispose());material.dispose();}
  assert.ok(Math.abs(programme.firepit.anchor[0]-(tub.x0+tub.x1)/2)<.01,'The fire and jacuzzi share the house axis');
  const rearY=Math.max(...data.site.boundary.map(p=>p[1]));
  const gardenCentreY=(data.site.rearMidpoint[1]+DEFAULTS.terraceDepth+rearY)/2;
  assert.ok(Math.abs(programme.firepit.anchor[1]-gardenCentreY)<.25,'The fire lounge sits centrally between terrace and rear boundary');
});

test('left-edge pool and all optional sunbed sides keep the stair route, spa rooms and parcel clear',()=>{
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
    assert.equal(f.sunbeds.length,[3,5,7][sides-1]);
    assert.deepEqual(f.loungers,f.sunbeds.map(b=>[b.x,b.y]));
    for(const r of f.sunbeds){
      assert.equal(footprintFit(rectCorners(r,1),data.site.boundary).location,'inside');
      assert.equal(overlapArea(rectCorners(r),rectCorners(p,p.coping)),0);
      assert.ok(obstacles.every(o=>overlapArea(rectCorners(r,.1),o)<1e-8));
      assert.ok(r.x+r.width<p.x+p.width,'No sunbed is trapped between the water and boundary hedge');
    }
    assert.ok(f.sunbeds.slice(0,3).every(b=>b.back==='east'&&b.x+b.width<p.x-p.coping),
      'The primary row faces west into the open garden from the inward long pool edge');
    const last=f.sunbeds[2];
    assert.ok(closestFootprints(rectCorners(last),programme.firepit.outerFootprint).distance>=1,
      'An open approach remains between the sunbed row and central fire lounge');
  }
});

test('every renovation style retains selected sunbeds and dining without outdoor kitchens or blocked paths',()=>{
  for(const style of DESIGN_STYLES.filter(s=>s.id!=='current'))for(const sides of [1,2,3]){
    const s={...DEFAULTS,designStyle:style.id,poolSunbedSides:sides},f=gardenFurniture(data,s);
    assert.equal(f.resort.items.filter(i=>i.kind==='lounger'||i.kind==='daybed').length,[3,5,7][sides-1],style.id);
    assert.equal(f.diningVisible,true,`${style.id} dining is fitted`);
    assert.equal(f.resort.kitchen,null,`${style.id} has no outdoor kitchen`);
    assert.equal(gardenProgram(s,data).renovation.kitchen,undefined);
    for(const item of f.resort.items)assert.ok(!rectanglesOverlap(item,f.dining,.04));
    const programme=gardenProgram(s,data);
    const fixed=[rectCorners(programme.pool,programme.pool.coping),programme.firepit.outerFootprint,
      programme.sauna.footprint,rectCorners(programme.coldPlunge,programme.coldPlunge.pad),
      ...programme.sauna.entrySteps.map(st=>st.footprint),...programme.coldPlunge.steps.map(st=>rectCorners(st))];
    const pieces=[...f.resort.items,f.dining,...f.path.map(([x,y])=>({x,y,width:1.15,length:.9})),...f.resort.beds];
    for(const piece of pieces){
      assert.equal(footprintFit(rectCorners(piece),data.site.boundary).location,'inside',style.id);
      assert.ok(fixed.every(o=>overlapArea(rectCorners(piece),o)<1e-7),style.id+' keeps the spa approaches clear');
    }
    for(let i=0;i<pieces.length;i++)for(const other of pieces.slice(i+1))
      assert.ok(overlapArea(rectCorners(pieces[i]),rectCorners(other))<1e-7,style.id+' keeps furnishing and paths separate');
  }
});

test('one species change installs its own calculated boundary positions and valid stock dimensions',()=>{
  const original=optimizedScreeningTrees();original[0].x=8;original[0].y=24;original[0].unitPrice=61000;
  const snapshot=structuredClone(original);
  const programme=gardenProgram({...DEFAULTS,poolSunbedSides:3},data);
  const reserved=[rectCorners(programme.pool,programme.pool.coping),programme.firepit.outerFootprint,
    programme.sauna.footprint,rectCorners(programme.coldPlunge,programme.coldPlunge.pad),
    rectCorners(programme.furniture.dining),...programme.furniture.sunbeds.map(b=>rectCorners(b)),
    ...programme.sauna.entrySteps.map(st=>st.footprint),...programme.coldPlunge.steps.map(st=>rectCorners(st))];
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
      assert.ok(reserved.every(r=>closestFootprints(p,r).distance>=1-1e-7),`${type.id} leaves one metre around fixed features and every optional sunbed`);
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
