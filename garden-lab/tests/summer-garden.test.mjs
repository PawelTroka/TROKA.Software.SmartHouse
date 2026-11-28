import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {DEFAULTS,createStateModel} from '../src/state.js';
import {getSiteProfile} from '../src/sites.js';
import {getScreeningLayouts} from '../src/screening-layouts.js';
import {getTreeType,TREE_CATALOG} from '../src/tree-catalog.js';
import {replaceTreeSpecies} from '../src/tree-selection.js';
import {SUMMER_POOL,SUMMER_POOL_V137,summerGardenFurniture,optimizedScreeningTrees,CURRENT_SUMMER_TREE_POSITIONS,CLOSE_GROVE_TREE_POSITIONS,BOUNDARY_PINE_TREE_POSITIONS,LEGACY_SUMMER_TREE_POSITIONS,V136_SUMMER_TREE_POSITIONS,restoreCloseGrovePreset,restoreBoundaryPinePreset} from '../src/summer-garden.js';
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

test('fresh Sternicza fits a shorter left-edge pool around the restored planting',()=>{
  assert.equal(DEFAULTS.summerPoolLayout,true);assert.equal(DEFAULTS.poolSunbedSides,2);
  assert.ok(DEFAULTS.screeningTrees.every(t=>t.typeId==='austrian-pine-tall'));
  assert.deepEqual(DEFAULTS.screeningTrees,optimizedScreeningTrees());
  for(const style of DESIGN_STYLES){
    const p=poolBounds({...DEFAULTS,designStyle:style.id},data);
    assert.deepEqual([p.x,p.y,p.width,p.length],[15.5,24.5,3.2,6.5]);
  }
  const old=poolBounds({...DEFAULTS,summerPoolLayout:false,designStyle:'current'},data);
  assert.deepEqual([old.x,old.y,old.width,old.length],[14.52,26.3,3.5,8]);
  assert.equal(getScreeningLayouts('sternicza-11','spa-pool-grove')[0].trees[0].typeId,'thuja-excelsa-9m');
  assert.equal(getScreeningLayouts('sternicza-11','spa-pool-grove',DEFAULTS)[0].trees[0].typeId,'austrian-pine-tall');
  assert.equal(getScreeningLayouts('sternicza-11','spa-pool-grove',DEFAULTS)[0].settings.poolSunbedSides,2);
});

test('left-edge pool clears the actual rendered hedge and the fire lounge centres the rear garden',()=>{
  const p=poolBounds(DEFAULTS,data),programme=gardenProgram(DEFAULTS,data),tub=jacuzziBounds(DEFAULTS,data);
  const gap=closestBoundary(rectCorners(p,p.coping),data,'left').distance;
  assert.ok(gap>=1.3&&gap<=1.4,'The coping hugs the left edge with the hedge retained');
  const material=new THREE.MeshStandardMaterial();
  const hedge=createHedgeVegetation(hedgeSegments(DEFAULTS,data).filter(s=>s.side==='left'),{
    groundAt:(x,y,s)=>hedgeGroundAt(x,y,s.side,DEFAULTS,data,s.groundZone),
    topAt:(x,y,s)=>hedgeTopAt(x,y,s.side,DEFAULTS,data,s.groundZone),material,
  });
  try{
    const b=new THREE.Box3().setFromObject(hedge);
    const foliageGap=b.min.x-(p.x+p.width+p.coping);
    assert.ok(foliageGap>.20&&foliageGap<.30,'Rendered foliage leaves a narrow clear edge beside the coping');
  }finally{hedge.traverse(o=>o.geometry?.dispose());material.dispose();}
  assert.ok(Math.abs(programme.firepit.anchor[0]-(tub.x0+tub.x1)/2)<.01,'The fire and jacuzzi share the house axis');
  const rearY=Math.max(...data.site.boundary.map(p=>p[1]));
  const gardenCentreY=(data.site.rearMidpoint[1]+DEFAULTS.terraceDepth+rearY)/2;
  assert.ok(Math.abs(programme.firepit.anchor[1]-gardenCentreY)<.25,'The fire lounge sits centrally between terrace and rear boundary');
});

test('explicit last-release pool compatibility keeps its furniture and rear tree pocket together',()=>{
  const old={...DEFAULTS,rearCornerPool:false,privateGardenSeating:false,poolSunbedSides:3},p=poolBounds(old,data),f=summerGardenFurniture(old);
  assert.deepEqual([p.x,p.y,p.width,p.length],Object.values(SUMMER_POOL_V137));
  assert.deepEqual(f.sunbeds.map(b=>[b.x,b.y]),[[13.05,23.35],[14.15,23.35],[16.1,18.45],[14.45,27.75]]);
  assert.deepEqual(gardenProgram(old,data).furniture.sunbeds,f.sunbeds,'Rendered program and furniture use the same chosen pool');
  for(const bed of f.sunbeds)assert.equal(overlapArea(rectCorners(bed),rectCorners(p,p.coping)),0);
  const current=poolBounds({...old,rearCornerPool:undefined},data);
  assert.deepEqual([current.x,current.y,current.width,current.length],Object.values(SUMMER_POOL));
});

test('left-edge pool and all optional sunbed sides keep the stair route, spa rooms and parcel clear',()=>{
  const p=poolBounds(DEFAULTS,data),programme=gardenProgram(DEFAULTS,data);
  const stairs=terraceStairs(data.site.terrace,DEFAULTS.terraceDepth,terraceGroundReference(DEFAULTS,data).drop,DEFAULTS,data);
  assert.ok(closestFootprints(rectCorners(p,p.coping),rectCorners(stairs)).distance>=1,
    'At least one metre remains between the bottom stair and pool coping');
  const broad={...DEFAULTS,terraceWidth:10.77,canopyWidth:10.77},broadData=applyPlanExterior(source,broad);
  const broadStairs=terraceStairs(broadData.site.terrace,broad.terraceDepth,terraceGroundReference(broad,broadData).drop,broad,broadData);
  const broadTerrace={...broadData.site.terrace,length:broad.terraceDepth};
  assert.ok(closestFootprints(rectCorners(p,p.coping),rectCorners(broadTerrace)).distance>.20,'The coping remains clear of the full-width terrace');
  const nearPine=DEFAULTS.screeningTrees.find(t=>t.id==='pine-2');
  assert.ok(closestFootprints([[nearPine.x,nearPine.y]],rectCorners(p,p.coping)).distance>=1,'The boundary-side pine keeps its trunk soil clearance');
  assert.ok(closestFootprints(rectCorners(p,p.coping),rectCorners(broadStairs)).distance>=1,
    'The full-width renovated deck also retains the one-metre exit route');
  assert.equal(footprintFit(rectCorners(p,p.coping),data.site.boundary).location,'inside');
  const obstacles=[rectCorners(stairs),programme.sauna.footprint,programme.firepit.outerFootprint,
    rectCorners(programme.coldPlunge,.24),...programme.coldPlunge.steps.map(s=>rectCorners(s))];
  for(let sides=1;sides<=3;sides++){
    const f=summerGardenFurniture({poolSunbedSides:sides});assert.deepEqual(f.loungerSides,['garden']);
    assert.equal(f.sunbeds.length,[2,3,4][sides-1]);
    assert.deepEqual(f.loungers,f.sunbeds.map(b=>[b.x,b.y]));
    for(const r of f.sunbeds){
      assert.equal(footprintFit(rectCorners(r,1),data.site.boundary).location,'inside');
      assert.equal(overlapArea(rectCorners(r),rectCorners(p,p.coping)),0);
      assert.ok(obstacles.every(o=>overlapArea(rectCorners(r,.1),o)<1e-8));
      assert.ok(r.x+r.width<p.x+p.width,'No sunbed is trapped between the water and boundary hedge');
    }
    assert.ok(f.sunbeds.every(b=>b.back==='north'&&b.width===.78&&b.length===2&&b.x+b.width<p.x-p.coping),
      'The narrow primary chaises run parallel to the long pool edge on its garden side');
    const last=f.sunbeds[1];
    assert.ok(closestFootprints(rectCorners(last),programme.firepit.outerFootprint).distance>=1,
      'An open approach remains between the sunbed row and central fire lounge');
  }
});

test('every renovation style keeps the current right-hand garden free of seating and preserves the pool row and paths',()=>{
  for(const style of DESIGN_STYLES.filter(s=>s.id!=='current'))for(const sides of [1,2,3]){
    const s={...DEFAULTS,designStyle:style.id,poolSunbedSides:sides},f=gardenFurniture(data,s);
    assert.equal(f.resort.items.filter(i=>i.kind==='lounger'||i.kind==='daybed').length,[2,3,4][sides-1],style.id);
    assert.equal(f.dining,null,`${style.id} has no right-hand dining zone`);
    assert.equal(f.diningVisible,false);
    assert.equal(f.resort.kitchen,null,`${style.id} has no outdoor kitchen`);
    assert.equal(gardenProgram(s,data).renovation.kitchen,undefined);
    const programme=gardenProgram(s,data);
    const fixed=[rectCorners(programme.pool,programme.pool.coping),programme.firepit.outerFootprint,
      programme.sauna.footprint,rectCorners(programme.coldPlunge,programme.coldPlunge.pad),
      ...programme.sauna.entrySteps.map(st=>st.footprint),...programme.coldPlunge.steps.map(st=>rectCorners(st))];
    const pieces=[...f.resort.items,...f.path.map(([x,y])=>({x,y,width:1.15,length:.9})),...f.resort.beds];
    for(const piece of pieces){
      assert.equal(footprintFit(rectCorners(piece),data.site.boundary).location,'inside',style.id);
      assert.ok(fixed.every(o=>overlapArea(rectCorners(piece),o)<1e-7),style.id+' keeps the spa approaches clear');
    }
    for(let i=0;i<pieces.length;i++)for(const other of pieces.slice(i+1))
      assert.ok(overlapArea(rectCorners(pieces[i]),rectCorners(other))<1e-7,style.id+' keeps furnishing and paths separate');
  }
});

test('new species presets clear the rear pool and species changes preserve customized planting',()=>{
  const original=optimizedScreeningTrees();original[0].x=8;original[0].y=24;original[0].unitPrice=61000;
  const snapshot=structuredClone(original);
  for(const type of TREE_CATALOG){
    const changed=replaceTreeSpecies(original,type.id,null,{siteId:'sternicza-11',optimized:true});
    assert.deepEqual(changed.map(t=>[t.x,t.y]),original.map(t=>[t.x,t.y]),`${type.id} keeps custom positions`);
    assert.deepEqual(changed.map(t=>t.id),original.map(t=>t.id));
    assert.ok(changed.every(t=>t.typeId===type.id&&t.unitPrice===0&&t.height===getTreeType(type.id).dimensions.height));
    const preset=optimizedScreeningTrees(type.id);
    assert.deepEqual(preset.map(t=>[t.x,t.y]),CURRENT_SUMMER_TREE_POSITIONS[type.id]);
    const chosen=replaceTreeSpecies(optimizedScreeningTrees(),type.id,null,{siteId:'sternicza-11',optimized:true});
    assert.deepEqual(chosen.map(t=>[t.x,t.y]),CURRENT_SUMMER_TREE_POSITIONS[type.id],'Explicit species changes still switch an unedited preset');
  }
  assert.deepEqual(original,snapshot,'Species presets never mutate a saved garden');
  const one=replaceTreeSpecies(original,'white-fir-9m',original[0].id,{siteId:'sternicza-11',optimized:true});
  assert.equal(one[0].x,8,'Individual edits keep manual placement');
  const nordmann=optimizedScreeningTrees('nordmann-fir-11m');
  assert.ok(screeningTreeVolumes({...DEFAULTS,screeningTrees:nordmann},data).every(t=>t.plantable),'An explicitly selected new preset keeps every trunk clear of the moved pool');
});

test('close-grove adoption recognizes only the complete known pine triplets and preserves specimen identity',()=>{
  assert.deepEqual(optimizedScreeningTrees().map(t=>[t.x,t.y]),BOUNDARY_PINE_TREE_POSITIONS);
  assert.ok(Math.abs(Math.hypot(13-14.2,34.1-32.5)-2)<1e-8,'The historical close pair remains exactly 2 m apart');
  for(const preset of [LEGACY_SUMMER_TREE_POSITIONS,V136_SUMMER_TREE_POSITIONS]){
    const trees=preset['austrian-pine-tall'].map(([x,y],i)=>({...optimizedScreeningTrees()[i],id:`owned-${i}`,x,y,height:9+i/10,unitPrice:60000+i})).reverse();
    const snapshot=structuredClone(trees),restored=restoreCloseGrovePreset(trees);
    assert.deepEqual(restored.map(t=>[t.x,t.y]).sort(),[...CLOSE_GROVE_TREE_POSITIONS].sort());
    restored.forEach((tree,i)=>{const {x,y,...attributes}=tree,{x:oldX,y:oldY,...original}=trees[i];assert.deepEqual(attributes,original);});
    assert.deepEqual(trees,snapshot);
    trees[1].x+=.01;assert.equal(restoreCloseGrovePreset(trees),null,'Even a small manual move keeps the whole custom garden literal');
    assert.equal(restoreCloseGrovePreset(snapshot.slice(0,2)),null);
  }
  assert.equal(restoreCloseGrovePreset(optimizedScreeningTrees()),null,'The restored grove is not repeatedly migrated');
});

test('current sunbeds share a head line and foot line while archived arrangements remain literal',()=>{
  for(const poolSunbedSides of [1,2,3]){
    const furniture=summerGardenFurniture({poolSunbedSides}),beds=furniture.sunbeds;
    assert.deepEqual(furniture.loungerSides,['garden']);
    assert.equal(beds.length,poolSunbedSides+1);
    assert.equal(furniture.dining,null);
    assert.ok(beds.every(b=>b.y===24&&b.back==='north'&&b.width===.78&&b.length===2),
      'Neighbours lie side by side with matching head and foot positions');
    for(let i=1;i<beds.length;i++)assert.ok(Math.abs(beds[i].x-beds[i-1].x-beds[i-1].width-.32)<1e-8,
      'Every pair has the same 32 cm gap');
    assert.ok(Math.abs(beds.at(-1).x+beds.at(-1).width-14.93)<1e-8,'The poolward edge stays fixed');
  }
  const archived=summerGardenFurniture({poolSunbedSides:2,privateGardenSeating:false,edgeAlignedSunbeds:false});
  assert.deepEqual(archived.sunbeds.map(b=>[b.x,b.y]),[[13.05,28.05],[14.15,28.05],[16.1,23.15]],'Archived 1.38 geometry remains literal');
  assert.ok(archived.dining,'Historical dining remains available in its original design');
  const previous=summerGardenFurniture({privateGardenSeating:false});
  assert.deepEqual(previous.sunbeds.map(b=>[b.x,b.y]),[[SUMMER_POOL.x-1.38,24],[SUMMER_POOL.x-1.38,27.4],[16.1,23.15]],'Archived 1.40 compact L remains literal');
});

test('boundary-pine adoption moves only the recognized nearest specimen and leaves manual planting authoritative',()=>{
  const trees=CLOSE_GROVE_TREE_POSITIONS.map(([x,y],i)=>({...optimizedScreeningTrees()[i],id:`owned-${i}`,x,y,height:9+i/10,unitPrice:60000+i})).reverse();
  const snapshot=structuredClone(trees),restored=restoreBoundaryPinePreset(trees);
  assert.deepEqual(restored.filter((t,i)=>t.x!==trees[i].x||t.y!==trees[i].y).map(t=>[t.id,t.x,t.y]),[['owned-1',19.3,32.25]]);
  restored.forEach((tree,i)=>{const {x,y,...attributes}=tree,{x:oldX,y:oldY,...original}=trees[i];assert.deepEqual(attributes,original);});
  assert.deepEqual(trees,snapshot);
  trees[0].x+=.01;assert.equal(restoreBoundaryPinePreset(trees),null,'A one-centimetre manual edit prevents automatic movement');
  assert.equal(restoreBoundaryPinePreset(snapshot.slice(0,2)),null);
  assert.equal(restoreBoundaryPinePreset(snapshot.map((t,i)=>i===1?{...t,typeId:'white-fir-9m'}:t)),null);
  assert.equal(restoreBoundaryPinePreset(restored),null,'Adoption is idempotent');
  const pine=optimizedScreeningTrees()[1],p=poolBounds(DEFAULTS,data),volume=screeningTreeVolumes({...DEFAULTS,screeningTrees:[pine]},data)[0];
  assert.ok(volume.plantable);
  assert.ok(closestBoundary([[pine.x,pine.y]],data,'left').distance>1);
  assert.ok(closestBoundary([[pine.x,pine.y]],data,'left').distance<1.02);
  assert.ok(closestFootprints([[pine.x,pine.y]],rectCorners(p,p.coping)).distance>=1);
  assert.equal(volume.crownInside,false,'The honest crown-overhang warning remains visible');
});

test('other properties do not acquire the Sternicza pool or species defaults',()=>{
  for(const id of ['korzeniowskiego-40','nadmorska-17']){
    const d=JSON.parse(readFileSync(new URL(`../data/${id}.json`,import.meta.url)));
    const model=createStateModel(getSiteProfile(id,d)),p=poolBounds({...model.DEFAULTS,summerPoolLayout:true},d);
    assert.equal(p.x,d.site.pool.x);assert.equal(p.y,d.site.pool.y);
    assert.equal(model.DEFAULTS.screeningTrees.length,0);
  }
});
