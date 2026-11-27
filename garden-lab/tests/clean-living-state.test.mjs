import test from 'node:test';
import assert from 'node:assert/strict';
import {createStateModel,STATE_VERSION} from '../src/state.js';
import {getSiteProfile,resolveSiteId} from '../src/sites.js';
import {CLOSE_GROVE_TREE_POSITIONS,BOUNDARY_PINE_TREE_POSITIONS} from '../src/summer-garden.js';

const model=createStateModel(getSiteProfile('sternicza-11'));
const previous=()=>model.sanitizeState({...model.DEFAULTS,edgeAlignedSunbeds:false,poolSunbedSides:1,
  screeningTrees:model.DEFAULTS.screeningTrees.map((t,i)=>({...t,x:CLOSE_GROVE_TREE_POSITIONS[i][0],y:CLOSE_GROVE_TREE_POSITIONS[i][1],rotation:i*11,unitPrice:i*1000}))});

test('schema 35 starts with the requested L seating and corrected boundary pine',()=>{
  assert.equal(STATE_VERSION,35);assert.equal(model.DEFAULTS.edgeAlignedSunbeds,true);assert.equal(model.DEFAULTS.poolSunbedSides,2);
  assert.deepEqual(model.DEFAULTS.screeningTrees.map(t=>[t.x,t.y]),BOUNDARY_PINE_TREE_POSITIONS);
  assert.equal(resolveSiteId('?site=nadmorska-17','#v=35&site=sternicza-11'),'sternicza-11');
  assert.deepEqual(model.decodeState(model.encodeState(model.DEFAULTS)),model.DEFAULTS);
});

test('active 1.38 session adopts only the nearest pine correction while preserving all other attributes',()=>{
  const old=previous(),snapshot=structuredClone(old),next=model.migrateSavedState(old,34,{adoptCleanLiving:true});
  assert.equal(next.poolSunbedSides,2);assert.equal(next.edgeAlignedSunbeds,true);
  assert.deepEqual(next.screeningTrees[0],old.screeningTrees[0]);assert.deepEqual(next.screeningTrees[2],old.screeningTrees[2]);
  assert.deepEqual(next.screeningTrees[1],{...old.screeningTrees[1],x:19.3,y:32.25});
  assert.deepEqual(old,snapshot);
  assert.deepEqual(model.decodeState(model.encodeState(next)),next);
  assert.deepEqual(model.migrateSavedState(next,35,{adoptCleanLiving:true}),next,'Current saves are never moved again');
});

test('sparse 1.38 links and archived comparisons retain their literal trees and old seating layout',()=>{
  const shared=model.decodeState('v=34&site=sternicza-11');
  assert.deepEqual(shared.screeningTrees.map(t=>[t.x,t.y]),CLOSE_GROVE_TREE_POSITIONS);
  assert.equal(shared.edgeAlignedSunbeds,false);assert.equal(shared.poolSunbedSides,1);
  const old=previous();assert.deepEqual(model.migrateSavedState(old,34),old);
});

test('manual planting, deleted trees, disabled layout and other sites are not repositioned',()=>{
  for(const change of [s=>{s.screeningTrees[0].x+=.1;},s=>{s.screeningTrees.pop();},s=>{s.summerPoolLayout=false;}]){
    const old=previous();change(old);
    const next=model.migrateSavedState(old,34,{adoptCleanLiving:true});
    assert.deepEqual(next.screeningTrees,old.screeningTrees);
  }
  const three={...previous(),poolSunbedSides:3,showDimensions:false};
  const next=model.migrateSavedState(three,34,{adoptCleanLiving:true});
  assert.equal(next.poolSunbedSides,3);assert.equal(next.showDimensions,false);
  for(const id of ['nadmorska-17','korzeniowskiego-40']){
    const other=createStateModel(getSiteProfile(id)),old=other.sanitizeState({...other.DEFAULTS,edgeAlignedSunbeds:false,poolSunbedSides:1});
    assert.deepEqual(other.migrateSavedState(old,34,{adoptCleanLiving:true}),old);
  }
});
