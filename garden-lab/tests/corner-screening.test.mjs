import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStateModel} from '../src/state.js';
import {getSiteProfile} from '../src/sites.js';
import {getScreeningLayouts,STERNICZA_CORNER_TREES,STERNICZA_EDGE_TREES} from '../src/screening-layouts.js';
import {estimateScreeningTreeCosts} from '../src/costs.js';
import {screeningTreeVolumes} from '../src/screening-trees.js';
import {analyzeVisibility,observerForPreset} from '../src/geometry.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const recorded=JSON.parse(readFileSync(new URL('../docs/corner-screening-comparison.json',import.meta.url)));
const selected=recorded.layouts.find(layout=>layout.name==='Rear-left cluster with 3 m minimum trunk spacing');
const previous=recorded.layouts.find(layout=>layout.name==='Previous v1.8 balanced default');
const layouts=getScreeningLayouts('sternicza-11','spa-edge');
const corner=layouts.find(layout=>layout.id==='default');
const balanced=layouts.find(layout=>layout.id==='balanced-views');
const model=createStateModel(getSiteProfile('sternicza-11',data));
const base={...recorded.settings,screeningTrees:[]};
const visible=(observer,trees)=>analyzeVisibility(observer,{...base,screeningTrees:trees},data).byBlock.find(block=>block.id===recorded.target.id);
const close=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<1e-8,`${label}: ${actual} versus ${expected}`);

test('fresh Sternicza uses the measured rear-left grove and retains its catalog plant subtotal',()=>{
  assert.equal(recorded.target.id,'building-9');
  assert.deepEqual(corner.trees,STERNICZA_CORNER_TREES);
  assert.deepEqual(corner.trees,selected.trees);
  assert.equal(model.DEFAULTS.gardenProgram,'spa-edge');
  assert.deepEqual(model.sanitizeState().screeningTrees,corner.trees);
  for(const [key,value] of Object.entries(corner.settings))assert.equal(model.DEFAULTS[key],value,key);

  const costs=estimateScreeningTreeCosts({...base,screeningTrees:corner.trees});
  assert.equal(costs.count,3);
  assert.equal(costs.plantQuoteCount,0);
  assert.equal(selected.plantPLN,179700);
  assert.deepEqual(costs.lines.plants,{low:179700,high:179700});
  assert.ok(costs.rows.every(row=>row.unit.source==='published-stock'&&row.unit.stockMatch));
  assert.equal(costs.total,null,'Plant prices do not imply that unquoted installation and logistics are included');
});

test('three 9.5 m crowns form a compact overlapping grove with valid trunk and boundary positions',()=>{
  assert.deepEqual(corner.trees.map(tree=>[tree.x,tree.y]),[[13.1,34.45],[14.35,31],[17.6,34.5]]);
  for(const tree of corner.trees){
    assert.equal(tree.typeId,'austrian-pine-tall');
    assert.equal(tree.height,9.5);
    assert.equal(tree.crownBase,2.5);
    assert.equal(tree.crownWidth,5);
    assert.equal(tree.crownDepth,5);
  }
  const xs=corner.trees.map(tree=>tree.x),ys=corner.trees.map(tree=>tree.y);
  close(Math.max(...xs)-Math.min(...xs),4.5,'Trunk group width');
  close(Math.max(...ys)-Math.min(...ys),3.5,'Trunk group depth');
  const distances=corner.trees.flatMap((tree,index)=>corner.trees.slice(index+1).map(other=>Math.hypot(tree.x-other.x,tree.y-other.y)));
  assert.deepEqual(distances.map(distance=>Number(distance.toFixed(2))).sort((a,b)=>a-b),[3.67,4.5,4.78]);
  assert.ok(distances.every(distance=>distance>=3&&distance<5),'Trunks stay separated while all nominal 5 m crowns overlap');
  const volumes=screeningTreeVolumes({...base,screeningTrees:corner.trees},data);
  assert.equal(volumes.length,3);
  assert.ok(volumes.every(volume=>volume.plantable&&volume.crownInside));
  assert.ok(volumes.some(volume=>volume.warnings.some(warning=>warning.includes('overhangs'))),'Compact planting retains the explicit hardscape-overhang warning');
});

test('the full visibility engine reproduces all 17 recorded PCK3 viewpoints for the new default',()=>{
  assert.equal(recorded.observers.length,17);
  assert.equal(selected.views.length,17);
  for(const observer of recorded.observers){
    const measured=visible(observer,corner.trees),expected=selected.views.find(view=>view.id===observer.id);
    assert.ok(expected,`${observer.id} has a recorded result`);
    assert.equal(measured.visible,expected.visible,`${observer.id} visible points`);
    assert.equal(measured.total,expected.total,`${observer.id} total points`);
  }
  // Named views also use the application's live observer positions and levels,
  // so a stale report cannot hide a changed terrace, fill or jacuzzi viewpoint.
  const named={sofa:[213,420],standing:[225,420],terrace:[83,420],jacuzzi:[34,460],garden:[1,420],sauna:[0,460],firepit:[27,420]};
  for(const [preset,counts] of Object.entries(named)){
    const observer=observerForPreset(preset,{...base,eyeHeight:undefined},data),measured=visible(observer,corner.trees);
    assert.deepEqual([measured.visible,measured.total],counts,`${preset} live PCK3 viewpoint`);
  }
});

test('the previous balanced option stays distinct and exposes the corner layout sightline tradeoff',()=>{
  assert.deepEqual(balanced.trees,STERNICZA_EDGE_TREES);
  assert.deepEqual(balanced.trees,previous.trees);
  assert.notDeepEqual(corner.trees,balanced.trees);
  assert.deepEqual(balanced.settings,corner.settings,'Comparisons change tree placement without changing hedges, fill or spa geometry');
  assert.deepEqual(estimateScreeningTreeCosts({...base,screeningTrees:balanced.trees}).lines.plants,{low:179700,high:179700});
  for(const preset of ['jacuzzi','garden','sofa','standing']){
    const observer=observerForPreset(preset,{...base,eyeHeight:undefined},data);
    const current=visible(observer,corner.trees),prior=visible(observer,balanced.trees);
    assert.ok(current.visible>0,`${preset} must not be described as completely screened`);
    if(preset==='jacuzzi'||preset==='garden')assert.ok(current.visible<prior.visible,`${preset} improves in the rear-left grove`);
    else assert.ok(current.visible>prior.visible,`${preset} retains the measured loss of screening from moving trees rearward`);
  }
});
