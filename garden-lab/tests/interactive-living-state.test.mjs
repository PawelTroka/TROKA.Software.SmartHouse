import test from 'node:test';
import assert from 'node:assert/strict';
import {createStateModel,STATE_VERSION} from '../src/state.js';
import {getSiteProfile,resolveSiteId} from '../src/sites.js';
import {changePresentationSettings} from '../src/studio-state.js';
import {houseModelKey} from '../src/house-model.js';
import {LEGACY_SUMMER_TREE_POSITIONS,restoreCloseGrovePreset} from '../src/summer-garden.js';

const model=createStateModel(getSiteProfile('sternicza-11'));
const oldTrees=()=>model.DEFAULTS.screeningTrees.map((tree,i)=>({...tree,id:'owner-tree-'+i,
  x:LEGACY_SUMMER_TREE_POSITIONS['austrian-pine-tall'][i][0],y:LEGACY_SUMMER_TREE_POSITIONS['austrian-pine-tall'][i][1],unitPrice:41000+i,rotation:13*i}));

test('fresh house starts with closed gates, open stacking doors, parked covers and a shared office',()=>{
  assert.equal(STATE_VERSION,36);
  const s=model.sanitizeState();
  for(const key of ['pedestrianGateOpen','garageGateOpen','jacuzziCoverClosed','coldPlungeCoverClosed','officeGuestBedOpen'])assert.equal(s[key],false,key);
  for(const key of ['officeCoworking','gymBenchParked','rearCornerPool'])assert.equal(s[key],true,key);
  assert.equal(s.hstOpen,1);assert.equal(s.balconyOpen,1);
  assert.equal(resolveSiteId('?site=nadmorska-17','#v=34&site=sternicza-11'),'sternicza-11');
});

test('independent door, cover, gate, office and gym choices survive save/share and finish changes',()=>{
  for(const state of [
    {hstOpen:0,balconyOpen:1,jacuzziCoverClosed:true,coldPlungeCoverClosed:false,pedestrianGateOpen:true,garageGateOpen:false,officeCoworking:false,officeGuestBedOpen:true,gymBenchParked:false},
    {hstOpen:.38,balconyOpen:.71,jacuzziCoverClosed:false,coldPlungeCoverClosed:true,pedestrianGateOpen:false,garageGateOpen:true,officeCoworking:true,officeGuestBedOpen:false,gymBenchParked:true},
  ]){
    const saved=model.sanitizeState({...model.DEFAULTS,...state});
    assert.deepEqual(model.decodeState(model.encodeState(saved)),saved);
    assert.deepEqual(model.migrateSavedState(saved,STATE_VERSION,{adoptInteractiveLiving:true}),saved);
    for(const style of ['nordic-minimal','hidden-bali','current']){
      const next=model.sanitizeState(changePresentationSettings(saved,{designStyle:style}));
      for(const [key,value]of Object.entries(state))assert.equal(next[key],value,style+' preserves '+key);
    }
  }
  assert.equal(model.sanitizeState({hstOpen:2,balconyOpen:-3}).hstOpen,1);
  assert.equal(model.sanitizeState({hstOpen:2,balconyOpen:-3}).balconyOpen,0);
  assert.equal(model.sanitizeState({jacuzziCoverClosed:'true'}).jacuzziCoverClosed,false);
});

test('only active old sessions adopt the requested corner grove, rearward pool and closed gates',()=>{
  const old=model.sanitizeState({...model.DEFAULTS,screeningTrees:oldTrees(),rearCornerPool:false,pedestrianGateOpen:true,garageGateOpen:true});
  const archive=model.migrateSavedState(old,33);
  assert.deepEqual(archive.screeningTrees,old.screeningTrees);
  assert.equal(archive.rearCornerPool,false);assert.equal(archive.pedestrianGateOpen,true);assert.equal(archive.garageGateOpen,true);
  const adopted=model.migrateSavedState(old,33,{adoptInteractiveLiving:true});
  assert.deepEqual(adopted.screeningTrees,restoreCloseGrovePreset(old.screeningTrees));
  assert.equal(adopted.rearCornerPool,true);assert.equal(adopted.pedestrianGateOpen,false);assert.equal(adopted.garageGateOpen,false);
  const moved=structuredClone(old);moved.screeningTrees[0].x-=.15;
  assert.deepEqual(model.migrateSavedState(moved,33,{adoptInteractiveLiving:true}).screeningTrees,moved.screeningTrees);
  assert.deepEqual(old.screeningTrees,oldTrees(),'Migration never edits the original saved record');
  const sparse=model.decodeState('v=33&site=sternicza-11');
  assert.equal(sparse.rearCornerPool,false);assert.equal(sparse.pedestrianGateOpen,true);
  assert.deepEqual(sparse.screeningTrees.map(t=>[t.x,t.y]),LEGACY_SUMMER_TREE_POSITIONS['austrian-pine-tall']);
});

test('house fit-out and door changes invalidate both viewers while garden-only choices do not rebuild the house plan',()=>{
  const key=houseModelKey(model.DEFAULTS);
  for(const patch of [{officeCoworking:false},{officeGuestBedOpen:true},{gymBenchParked:false},{hstOpen:0},{balconyOpen:0}])assert.notEqual(houseModelKey({...model.DEFAULTS,...patch}),key);
  assert.equal(houseModelKey({...model.DEFAULTS,jacuzziCoverClosed:true,pedestrianGateOpen:true}),key);
});
