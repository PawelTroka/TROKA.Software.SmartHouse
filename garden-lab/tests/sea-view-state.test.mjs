import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountSeaView,seaHeightPresets} from '../src/sea-view.js';
import {observerForPreset} from '../src/geometry.js';
import {sterniczaRoofEnvelope} from '../src/house-roof.js';

const corridor=JSON.parse(readFileSync(new URL('../data/sternicza-sea-corridor.json',import.meta.url),'utf8'));
const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url),'utf8'));
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);

test('first-floor sea preset matches the standing room viewpoint and respects a zero floor offset',()=>{
  for(const settings of [{},{floorHeight:0},{floorHeight:1.6,firstFloorRise:3.25,gardenRaise:1}]){
    const roomEye=observerForPreset('first-street-standing',settings,data);
    for(const observer of corridor.observers){
      const presets=seaHeightPresets(data,settings,observer);
      near(presets.firstFloor+observer.groundZ,roomEye.z);
      near(presets.standing,1.65);
    }
  }
  const observer=corridor.observers[0];
  near(seaHeightPresets(data,{},observer).firstFloor-seaHeightPresets(data,{floorHeight:0},observer).firstFloor,1.2);
});

test('roof sea preset uses the reconstructed ridge rather than the highest chimney return',()=>{
  const roof=sterniczaRoofEnvelope(data.site.house),observer=corridor.observers[0];
  const presets=seaHeightPresets(data,{},observer);
  near(presets.aboveRoofRidge+observer.groundZ-1.65,roof.ridgeZ);
  assert.ok(data.site.house.roofTopZ-roof.ridgeZ>.5,'The retained highest return is a chimney cap, over half a metre above the ridge');
  near(presets.aboveRoofRidge,12.017853252794716);
  assert.deepEqual(seaHeightPresets({site:{}},{},observer),{standing:1.65,firstFloor:null,aboveRoofRidge:null});
});

test('persisted sea preferences survive site changes without exporting the previous site result',()=>{
  const oldStorage=globalThis.localStorage;
  const stored=new Map([['garden-lab:sternicza-11:sea-view:v1',JSON.stringify({observerId:'front',profileId:'b999',mode:'horizon',heightAboveGround:25,clearanceM:2})]]);
  globalThis.localStorage={getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)};
  // Render-only mount adapter: no browser globals or engine needed. This tests
  // lifecycle and exported state, not markup details or event implementation.
  const listeners=new Map();
  const container={innerHTML:'',classList:{add(){}},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  try{
    const view=mountSeaView(container,{data,corridor});
    assert.equal(view.getState().observerId,'front');assert.equal(view.getState().profileId,'best');
    assert.equal(view.getState().heightAboveGround,25);assert.equal(view.getResult().mode,'horizon');
    assert.ok(view.exportSummary());
    const copy=view.getState();copy.heightAboveGround=77;assert.equal(view.getState().heightAboveGround,25);
    view.update({data:{site:{id:'nadmorska-17'}}});
    assert.equal(view.getResult(),null);assert.equal(view.exportSummary(),null);
    assert.match(container.innerHTML,/available for Sternicza/);
    view.update({data});assert.equal(view.getState().heightAboveGround,25);
    assert.equal(view.getResult().observer.id,'front');assert.equal(view.exportSummary().siteId,'sternicza-11');
    view.destroy();assert.equal(view.getResult(),null);assert.equal(view.exportSummary(),null);assert.equal(listeners.size,0);
  }finally{if(oldStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=oldStorage;}
});
