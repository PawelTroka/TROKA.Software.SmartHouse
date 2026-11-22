import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountSeaView} from '../src/sea-view.js';

const corridor=JSON.parse(readFileSync(new URL('../data/sternicza-sea-corridor.json',import.meta.url),'utf8'));
const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url),'utf8'));

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
