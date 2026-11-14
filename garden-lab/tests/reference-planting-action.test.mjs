import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,decodeState,encodeState} from '../src/state.js';
import {PICTURED_TREES,matchesPicturedTrees,applyPicturedTrees} from '../src/reference-planting.js';

test('applying the pictured trees preserves pool, hedge, eye, budget and matching specimen prices',()=>{
  const current={...DEFAULTS,gardenProgram:'spa-pool-grove',hedgeRear:3.4,hedgeFront:3.2,hedgeFullPerimeter:true,
    gardenRaise:.35,preset:'jacuzzi',eyeHeight:1.3,sunMinutes:998,costSpaPool:185000,
    screeningTrees:DEFAULTS.screeningTrees.map((tree,index)=>({...tree,x:tree.x-1,height:9.5,unitPrice:42000+index*1000}))};
  const before=structuredClone(current),next=applyPicturedTrees(current);
  assert.equal(matchesPicturedTrees(current),false);
  assert.equal(matchesPicturedTrees(next),true);
  assert.deepEqual(next.screeningTrees.map(tree=>[tree.x,tree.y,tree.height]),[[19.3,30.2,10],[13.8,35.8,10],[18.45,35.57,10]]);
  assert.deepEqual(next.screeningTrees.map(tree=>tree.unitPrice),[42000,43000,44000]);
  for(const key of Object.keys(current).filter(key=>key!=='screeningTrees'))assert.deepEqual(next[key],before[key],key);
  assert.deepEqual(current,before,'Applying the picture must not mutate a saved scenario');
  assert.notEqual(next.screeningTrees[0],PICTURED_TREES[0],'The editable state must not reuse frozen reference records');
  assert.deepEqual(decodeState(encodeState(next)),next,'The corrected shared link must reload the pictured geometry and quotes');
});

test('the status checks visible geometry, independently of IDs, ordering and quote amounts',()=>{
  assert.equal(matchesPicturedTrees(DEFAULTS),true);
  const same={...DEFAULTS,screeningTrees:[...DEFAULTS.screeningTrees].reverse().map((tree,index)=>({...tree,id:`custom-${index}`,unitPrice:12345,rotation:45}))};
  assert.equal(matchesPicturedTrees(same),true,'Rotating a circular crown does not change the pictured footprint');
  for(const change of [{x:19.31},{height:9.5},{crownWidth:5.5},{crownBase:3},{enabled:false}])
    assert.equal(matchesPicturedTrees({...DEFAULTS,screeningTrees:DEFAULTS.screeningTrees.map((tree,index)=>index?tree:{...tree,...change})}),false);
  assert.equal(matchesPicturedTrees({...DEFAULTS,screeningTrees:[]}),false);
  assert.equal(matchesPicturedTrees({...DEFAULTS,screeningTrees:[...DEFAULTS.screeningTrees,{...DEFAULTS.screeningTrees[0],id:'fourth'}]}),false);
});

test('the explicit planting action works on historical designs without changing their pool or another property',()=>{
  const old=decodeState('#v=16&site=sternicza-11&gardenProgram=spa-corner&hedgeRear=3.7&costSpaPool=190000');
  assert.equal(matchesPicturedTrees(old),false);
  const corrected=applyPicturedTrees(old);
  assert.equal(matchesPicturedTrees(corrected),true);
  assert.equal(corrected.gardenProgram,'spa-corner');assert.equal(corrected.hedgeRear,3.7);assert.equal(corrected.costSpaPool,190000);
  assert.equal(decodeState(encodeState(corrected)).gardenProgram,'spa-corner');
  const other={...DEFAULTS,siteId:'korzeniowskiego-40'};
  assert.equal(applyPicturedTrees(other),other);assert.equal(matchesPicturedTrees(other),false);
});
