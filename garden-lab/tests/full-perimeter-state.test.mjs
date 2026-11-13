import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStateModel,STATE_VERSION} from '../src/state.js';
import {getSiteProfile,resolveSiteId} from '../src/sites.js';
import {getScreeningLayouts} from '../src/screening-layouts.js';
import {hedgeSegments} from '../src/geometry.js';
import {poolBounds} from '../src/garden-program.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const profile=getSiteProfile('sternicza-11',data),model=createStateModel(profile);
const currentDefault=getScreeningLayouts('sternicza-11').find(layout=>layout.id==='default');
const v14Coordinates=[[13,34.1],[14.2,32.5],[17.6,34.9]];
const v15Coordinates=[[17,26.8],[14.4,28.4],[12.6,32.7]];

test('fresh v16 designs use the current planting layout and thujas on every plot side',()=>{
  assert.equal(STATE_VERSION,16);
  for(const fresh of [model.sanitizeState(),model.decodeState('v=16&site=sternicza-11'),model.migrateSavedState({siteId:'sternicza-11'},16)]){
    assert.equal(fresh.hedgeFullPerimeter,true);
    assert.equal(fresh.gardenProgram,currentDefault.settings.gardenProgram);
    assert.deepEqual(fresh.screeningTrees,currentDefault.trees);
    for(const key of ['hedgeFront','hedgeLeft','hedgeRight','hedgeRear'])assert.equal(fresh[key],4);
    const spans=hedgeSegments(fresh,data);
    for(const side of ['left','right'])assert.ok(spans.some(s=>s.side===side&&Math.min(s.a[1],s.b[1])<1),'Side hedges reach the street');
    assert.deepEqual(model.decodeState(model.encodeState(fresh)),fresh);
  }
  assert.equal(resolveSiteId('?site=korzeniowskiego-40','#v=16&site=sternicza-11'),'sternicza-11');
});

test('the full-perimeter choice is explicit in shares and survives independent edits and changing future defaults',()=>{
  for(const hedgeFullPerimeter of [false,true]){
    const original={...model.DEFAULTS,hedgeFullPerimeter,hedgeLeft:3.1,hedgeRight:5.2,hedgeFront:3.5,costTreePriceLeft:355,linkedHedges:false};
    const encoded=model.encodeState(original),params=new URLSearchParams(encoded);
    assert.equal(params.get('hedgeFullPerimeter'),String(hedgeFullPerimeter),'Even the default value must be explicit');
    assert.deepEqual(model.decodeState(encoded),original);
    assert.deepEqual(model.migrateSavedState(original,STATE_VERSION),original);
    assert.equal(model.changeHedgeHeight(original,'hedgeLeft',4.2).hedgeFullPerimeter,hedgeFullPerimeter);
    const future=createStateModel({...profile,defaults:{...profile.defaults,hedgeFullPerimeter:!hedgeFullPerimeter}});
    assert.deepEqual(future.decodeState(encoded),original,'Opening a shared design must not change its side-hedge extent');
  }
  for(const invalid of ['true',1,null,{}])assert.equal(model.sanitizeState({hedgeFullPerimeter:invalid}).hedgeFullPerimeter,true);
  assert.equal(model.decodeState('v=16&site=sternicza-11&hedgeFullPerimeter=0').hedgeFullPerimeter,true);
});

test('all v1–v14 links and saved designs keep their shorter side hedges, even with an unsupported new flag',()=>{
  for(let version=1;version<=14;version++){
    const identity=version>=6?'&site=sternicza-11':'';
    for(const suffix of ['','&hedgeFullPerimeter=true']){
      const restored=model.decodeState(`v=${version}${identity}${suffix}`);
      assert.equal(restored.hedgeFullPerimeter,false,`v${version} ${suffix}`);
      assert.ok(hedgeSegments(restored,data).filter(s=>['left','right'].includes(s.side)).every(s=>Math.min(s.a[1],s.b[1])>=data.site.rearMidpoint[1]-1e-8));
      assert.deepEqual(model.decodeState(model.encodeState(restored)),restored);
    }
    assert.equal(model.migrateSavedState({siteId:'sternicza-11',hedgeFullPerimeter:true},version).hedgeFullPerimeter,false);
  }
});

test('v14 defaults freeze the published close grove and seven-metre pool independently of new layouts',()=>{
  const futureTrees=model.DEFAULTS.screeningTrees.map((tree,index)=>({...tree,x:12+index,y:29}));
  const future=createStateModel({...profile,defaults:{...profile.defaults,gardenProgram:'spa-aligned',screeningTrees:futureTrees,
    hedgeFront:2.2,hedgeFullPerimeter:true,showDimensions:false,costUsePlanningAllowances:false,jacuzziOverflow:true}});
  for(const restored of [future.decodeState('v=14&site=sternicza-11'),future.migrateSavedState({siteId:'sternicza-11'},14)]){
    assert.equal(restored.gardenProgram,'spa-grove');assert.equal(restored.hedgeFullPerimeter,false);assert.equal(restored.hedgeFront,4);
    assert.deepEqual(restored.screeningTrees.map(t=>[t.x,t.y]),v14Coordinates);
    assert.ok(restored.screeningTrees.every(t=>t.typeId==='austrian-pine-tall'&&t.height===9.5&&t.crownBase===2.5&&t.crownWidth===5&&t.crownDepth===5));
    assert.equal(restored.showDimensions,true);assert.equal(restored.costUsePlanningAllowances,true);assert.equal(restored.jacuzziOverflow,false);
    const pool=poolBounds(restored,data);assert.deepEqual([pool.x,pool.y,pool.width,pool.length],[15.7,24.5,3.5,7]);
    assert.deepEqual(future.decodeState(future.encodeState(restored)),restored);
    restored.screeningTrees[0].x=1;
    assert.deepEqual(future.decodeState('v=14&site=sternicza-11').screeningTrees.map(t=>[t.x,t.y]),v14Coordinates);
  }
  assert.equal(future.decodeState('v=15&site=sternicza-11').gardenProgram,'spa-aligned');
  assert.deepEqual(future.decodeState('v=15&site=sternicza-11').screeningTrees.map(t=>[t.x,t.y]),v15Coordinates);
  assert.deepEqual(future.decodeState('v=16&site=sternicza-11').screeningTrees,futureTrees);
  for(const [version,expected] of [[8,'classic'],[9,'spa'],[10,'spa-edge'],[11,'spa-edge'],[12,'spa-compact'],[13,'spa-screened'],[14,'spa-grove']]){
    assert.equal(model.decodeState(`v=${version}&site=sternicza-11&gardenProgram=spa-aligned`).gardenProgram,expected);
  }
});

test('sparse v15 links and saves freeze the published aligned grove, midpoint stock and full perimeter',()=>{
  const futureTrees=model.DEFAULTS.screeningTrees.map((tree,index)=>({...tree,x:12+index,y:35,height:11,crownWidth:7,crownDepth:7}));
  const future=createStateModel({...profile,defaults:{...profile.defaults,gardenProgram:'spa-corner',screeningTrees:futureTrees,
    hedgeFront:2.2,hedgeFullPerimeter:false,showDimensions:false,costUsePlanningAllowances:false,jacuzziOverflow:true}});
  for(const restored of [future.decodeState('v=15&site=sternicza-11'),future.migrateSavedState({siteId:'sternicza-11'},15)]){
    assert.equal(restored.gardenProgram,'spa-aligned');assert.equal(restored.hedgeFullPerimeter,true);assert.equal(restored.hedgeFront,4);
    assert.deepEqual(restored.screeningTrees.map(t=>[t.x,t.y]),v15Coordinates);
    assert.ok(restored.screeningTrees.every(t=>t.typeId==='austrian-pine-tall'&&t.height===9.5&&t.crownBase===2.5&&t.crownWidth===5&&t.crownDepth===5));
    assert.equal(restored.showDimensions,true);assert.equal(restored.costUsePlanningAllowances,true);assert.equal(restored.jacuzziOverflow,false);
    const pool=poolBounds(restored,data);assert.deepEqual([pool.x,pool.y,pool.width,pool.length],[15.7,19.5,3.5,6]);
    assert.deepEqual(future.decodeState(future.encodeState(restored)),restored);
    restored.screeningTrees[0].x=1;
    assert.deepEqual(future.decodeState('v=15&site=sternicza-11').screeningTrees.map(t=>[t.x,t.y]),v15Coordinates);
  }
  assert.equal(future.decodeState('v=15&site=sternicza-11&gardenProgram=spa-corner').gardenProgram,'spa-aligned');
  assert.equal(future.migrateSavedState({siteId:'sternicza-11',gardenProgram:'spa-corner'},15).gardenProgram,'spa-aligned');
  assert.equal(future.decodeState('v=16&site=sternicza-11').gardenProgram,'spa-corner');
  assert.deepEqual(future.decodeState('v=16&site=sternicza-11').screeningTrees,futureTrees);
});

test('explicit custom v15 planting, empty trees, view bearing and quote overrides survive the new corner default',()=>{
  const custom={...model.decodeState('v=15&site=sternicza-11').screeningTrees[0],id:'custom-v15',x:16.1,y:29.8,height:10.4,
    crownWidth:5.4,crownDepth:4.8,rotation:23,unitPrice:61000,enabled:false};
  for(const trees of [[],[custom]]){
    const saved={siteId:'sternicza-11',gardenProgram:'spa-aligned',screeningTrees:trees,hedgeFullPerimeter:false,hedgeFront:3.4,
      costTreePriceFront:325,costGardenLighting:19500,costSpaPool:199000,preset:'front',eyeHeight:1.7,lookYaw:174,lookPitch:12,mode:'eye'};
    const params=new URLSearchParams({v:'15',site:saved.siteId,
      ...Object.fromEntries(Object.entries(saved).filter(([key])=>!['siteId','screeningTrees'].includes(key))),screeningTrees:JSON.stringify(trees)});
    for(const restored of [model.decodeState(params.toString()),model.migrateSavedState(saved,15)]){
      for(const[key,value]of Object.entries(saved))assert.deepEqual(restored[key],value,key);
      assert.deepEqual(model.decodeState(model.encodeState(restored)),restored);
    }
  }
});

test('custom v14 trees, empty planting, quote overrides and front heights are preserved without extending side hedges',()=>{
  const custom={...model.DEFAULTS.screeningTrees[0],id:'my-screen',x:16.3,y:28.6,height:10.5,crownWidth:5.6,rotation:31,unitPrice:59999,enabled:false};
  for(const trees of [[],[custom]]){
    const saved={siteId:'sternicza-11',gardenProgram:'spa-grove',screeningTrees:trees,hedgeFront:3.2,
      hedgeLeft:5.1,costTreePriceLeft:340,costSpaPool:185000,preset:'jacuzzi',eyeHeight:.9,lookYaw:42};
    const params=new URLSearchParams({v:'14',site:saved.siteId,
      ...Object.fromEntries(Object.entries(saved).filter(([key])=>!['siteId','screeningTrees'].includes(key))),screeningTrees:JSON.stringify(trees)});
    for(const restored of [model.decodeState(params.toString()),model.migrateSavedState(saved,14)]){
      for(const [key,value] of Object.entries(saved))assert.deepEqual(restored[key],value,key);
      assert.equal(restored.hedgeFullPerimeter,false);
      assert.deepEqual(model.decodeState(model.encodeState(restored)),restored);
    }
  }
});

test('Sternicza perimeter settings cannot change the other property',()=>{
  const otherData=JSON.parse(readFileSync(new URL('../data/korzeniowskiego-40.json',import.meta.url)));
  const other=createStateModel(getSiteProfile('korzeniowskiego-40',otherData));
  assert.equal(other.DEFAULTS.hedgeFullPerimeter,false);
  for(const restored of [other.sanitizeState({hedgeFullPerimeter:true,gardenProgram:'spa-aligned',hedgeFront:4}),
    other.decodeState('v=15&site=korzeniowskiego-40&hedgeFullPerimeter=true&gardenProgram=spa-aligned&hedgeFront=4')]){
    assert.equal(restored.hedgeFullPerimeter,false);assert.equal(restored.hedgeFront,0);assert.equal(restored.gardenProgram,'classic');
    assert.deepEqual(hedgeSegments(restored,otherData),hedgeSegments({...restored,hedgeFullPerimeter:false},otherData));
  }
});
