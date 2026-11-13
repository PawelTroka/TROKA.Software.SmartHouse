import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStateModel,STATE_VERSION} from '../src/state.js';
import {getSiteProfile,resolveSiteId} from '../src/sites.js';
import {gardenProgram,poolBounds} from '../src/garden-program.js';
import {frontHedgeLayout,hedgeSegments,observerForPreset} from '../src/geometry.js';
import {getScreeningLayouts} from '../src/screening-layouts.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const model=createStateModel(getSiteProfile('sternicza-11',data));
const oldCoordinates=[[13.3,34.5],[14.35,31],[18.1,34.5]];
const v13Coordinates=[[13,34.1],[14.4,25.7],[17.6,34.9]];
const groveCoordinates=[[13,34.1],[14.2,32.5],[17.6,34.9]];

test('fresh street screening shares its independent height, quote and street-facing viewpoint',()=>{
  assert.equal(STATE_VERSION,16);
  assert.equal(model.DEFAULTS.gardenProgram,getScreeningLayouts('sternicza-11').find(layout=>layout.id==='default').settings.gardenProgram);
  assert.equal(model.DEFAULTS.hedgeFront,4);
  assert.equal(model.DEFAULTS.linkedHedges,false);
  const design={...model.DEFAULTS,hedgeFront:3.2,costTreePriceFront:325,preset:'front',eyeHeight:1.65,lookYaw:180,mode:'eye'};
  assert.deepEqual(model.decodeState(model.encodeState(design)),design);
  assert.deepEqual(model.migrateSavedState(design,STATE_VERSION),design);
  assert.equal(resolveSiteId('?site=korzeniowskiego-40',`#${model.encodeState(design)}`),'sternicza-11');
  const observer=observerForPreset('front',design,data);
  assert.equal(observer.defaultLookYaw,180);
  assert.ok(observer.y<data.site.frontSetback,'Street view is in the front garden');
  const edited=model.changeHedgeHeight(design,'hedgeFront',2.7);
  assert.equal(edited.hedgeFront,2.7);
  for(const key of ['hedgeRear','hedgeLeft','hedgeRight'])assert.equal(edited[key],design[key]);
  const linked=model.changeHedgeHeight({...design,linkedHedges:true},'hedgeLeft',3.4);
  for(const key of ['hedgeRear','hedgeLeft','hedgeRight','hedgeFront'])assert.equal(linked[key],3.4);
});

test('every published pre-v13 design keeps its original unplanted frontage',()=>{
  for(let version=1;version<=12;version++){
    const restored=model.decodeState(`v=${version}${version>=6?'&site=sternicza-11':''}`);
    assert.equal(restored.hedgeFront,0,`v${version}`);
    assert.equal(frontHedgeLayout(restored,data).length,0);
    assert.equal(hedgeSegments(restored,data).filter(h=>h.side==='front').length,0);
    const saved=model.migrateSavedState({siteId:'sternicza-11',hedgeLeft:3.1,costTreePriceLeft:370},version);
    assert.equal(saved.hedgeFront,0,`saved v${version}`);
  }
});

test('sparse v12 links preserve pool, trees, compact sauna and complete budget after the new default',()=>{
  for(const old of [model.decodeState('v=12&site=sternicza-11'),model.migrateSavedState({siteId:'sternicza-11'},12)]){
    assert.equal(old.gardenProgram,'spa-compact');
    assert.equal(old.hedgeFront,0);
    assert.equal(old.costUsePlanningAllowances,true);
    assert.equal(old.jacuzziOverflow,false);
    assert.equal(old.showDimensions,true);
    assert.deepEqual(old.screeningTrees.map(t=>[t.x,t.y]),oldCoordinates);
    const pool=poolBounds(old,data),program=gardenProgram(old,data);
    assert.deepEqual([pool.x,pool.y,pool.width,pool.length],[15.7,24.5,3.5,8]);
    assert.deepEqual([program.sauna.width,program.sauna.length],[3,2.4]);
    assert.deepEqual(model.decodeState(model.encodeState(old)),old);
  }
});

test('published sparse v14 designs retain the close rear grove and shorter side hedges',()=>{
  for(const fresh of [model.decodeState('v=14&site=sternicza-11'),model.migrateSavedState({siteId:'sternicza-11'},14)]){
    assert.equal(fresh.gardenProgram,'spa-grove');
    assert.equal(fresh.hedgeFront,4);
    assert.equal(fresh.hedgeFullPerimeter,false);
    assert.deepEqual(fresh.screeningTrees.map(t=>[t.x,t.y]),groveCoordinates);
    const pool=poolBounds(fresh,data);
    assert.deepEqual([pool.x,pool.y,pool.width,pool.length],[15.7,24.5,3.5,7]);
    assert.deepEqual(model.decodeState(model.encodeState(fresh)),fresh);
  }
});

test('sparse v13 links and saves freeze the published forward pine and moved seven-metre pool',()=>{
  const profile=getSiteProfile('sternicza-11',data);
  const changedTrees=model.DEFAULTS.screeningTrees.map((tree,index)=>({...tree,x:15+index,y:34}));
  const future=createStateModel({...profile,defaults:{...profile.defaults,screeningTrees:changedTrees,
    hedgeFront:2.2,showDimensions:false,costUsePlanningAllowances:false,jacuzziOverflow:true}});
  for(const old of [future.decodeState('v=13&site=sternicza-11'),future.migrateSavedState({siteId:'sternicza-11'},13)]){
    assert.equal(old.gardenProgram,'spa-screened');assert.equal(old.hedgeFront,4);
    assert.equal(old.showDimensions,true);assert.equal(old.costUsePlanningAllowances,true);
    assert.equal(old.jacuzziOverflow,false);
    assert.deepEqual(old.screeningTrees.map(t=>[t.x,t.y]),v13Coordinates);
    assert.ok(old.screeningTrees.every(t=>t.height===9.5&&t.crownBase===2.5&&t.crownWidth===5&&t.crownDepth===5));
    const pool=poolBounds(old,data),program=gardenProgram(old,data);
    assert.deepEqual([pool.x,pool.y,pool.width,pool.length],[15.7,19.5,3.5,7]);
    assert.deepEqual([program.sauna.width,program.sauna.length],[3,2.4]);
    assert.deepEqual(future.decodeState(future.encodeState(old)),old);
    old.screeningTrees[1].x=1;
    assert.deepEqual(future.decodeState('v=13&site=sternicza-11').screeningTrees.map(t=>[t.x,t.y]),v13Coordinates,
      'Editing a restored design cannot change the frozen v13 baseline');
  }
  assert.equal(future.decodeState('v=16&site=sternicza-11').hedgeFront,2.2);
  assert.deepEqual(future.decodeState('v=16&site=sternicza-11').screeningTrees,changedTrees);
});

test('explicit v13 custom trees and an empty tree list retain their positions, quotes and frontage',()=>{
  const custom={...model.DEFAULTS.screeningTrees[1],id:'my-pine',x:16.2,y:30.4,rotation:27,unitPrice:61500,enabled:false};
  for(const trees of [[],[custom]]){
    const saved={siteId:'sternicza-11',gardenProgram:'spa-screened',screeningTrees:trees,
      hedgeFront:3.1,costTreePriceFront:345,showDimensions:false,costUsePlanningAllowances:false,
      preset:'front',lookYaw:180,costGardenLighting:11500};
    const params=new URLSearchParams({v:'13',site:saved.siteId,
      ...Object.fromEntries(Object.entries(saved).filter(([key])=>!['siteId','screeningTrees'].includes(key))),
      screeningTrees:JSON.stringify(trees)});
    for(const restored of [model.decodeState(params.toString()),model.migrateSavedState(saved,13)]){
      for(const [key,value] of Object.entries(saved))assert.deepEqual(restored[key],value,key);
      assert.deepEqual(model.decodeState(model.encodeState(restored)),restored);
    }
  }
});

test('old version numbers cannot silently select the new grove programme',()=>{
  for(const [version,expected] of [[8,'classic'],[9,'spa'],[10,'spa-edge'],[11,'spa-edge'],[12,'spa-compact'],[13,'spa-screened']]){
    assert.equal(model.decodeState(`v=${version}&site=sternicza-11&gardenProgram=spa-grove`).gardenProgram,expected);
    assert.equal(model.migrateSavedState({siteId:'sternicza-11',gardenProgram:'spa-grove'},version).gardenProgram,expected);
  }
});

test('the new frontage does not leak into the other property or require planting when switched off',()=>{
  const otherData=JSON.parse(readFileSync(new URL('../data/korzeniowskiego-40.json',import.meta.url)));
  const other=createStateModel(getSiteProfile('korzeniowskiego-40',otherData));
  const sanitized=other.sanitizeState({hedgeFront:4,preset:'front',gardenProgram:'spa-grove'});
  assert.equal(sanitized.hedgeFront,0);assert.equal(sanitized.preset,'garden');assert.equal(sanitized.gardenProgram,'classic');
  assert.equal(other.changeHedgeHeight({...other.DEFAULTS,linkedHedges:true},'hedgeRear',5).hedgeFront,0);
  const noFront=model.sanitizeState({...model.DEFAULTS,hedgeFront:0});
  assert.equal(frontHedgeLayout(noFront,data).length,0);
  assert.equal(model.decodeState(model.encodeState(noFront)).hedgeFront,0);
});
