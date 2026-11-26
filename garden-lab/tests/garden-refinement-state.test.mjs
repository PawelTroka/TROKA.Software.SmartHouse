import test from 'node:test';
import assert from 'node:assert/strict';
import {createStateModel,STATE_VERSION} from '../src/state.js';
import {getSiteProfile,resolveSiteId} from '../src/sites.js';
import {getTreeType} from '../src/tree-catalog.js';
import {LEGACY_SUMMER_TREE_POSITIONS,BOUNDARY_TREE_POSITIONS} from '../src/summer-garden.js';

const model=createStateModel(getSiteProfile('sternicza-11'));
const legacyTrees=(typeId='austrian-pine-tall')=>LEGACY_SUMMER_TREE_POSITIONS[typeId].map(([x,y],i)=>({
  id:`saved-tree-${i}`,typeId,...getTreeType(typeId).dimensions,x,y,
  rotation:i*7,enabled:true,unitPrice:i===0?61500:0,
}));
const proposal=(screeningTrees=legacyTrees(),extra={})=>model.sanitizeState({
  ...model.DEFAULTS,screeningTrees,summerPoolLayout:true,gardenProgram:'spa-pool-grove',poolSunbedSides:3,...extra,
});
const oldLink=state=>{const p=new URLSearchParams(model.encodeState(state));p.set('v','31');return p.toString();};

test('schema 32 starts with inward-facing sunbeds and resolves current links by property',()=>{
  assert.equal(STATE_VERSION,32);
  assert.equal(model.DEFAULTS.poolSunbedSides,1);
  assert.equal(resolveSiteId('?site=sternicza-11','#v=32&site=nadmorska-17'),'nadmorska-17');
  assert.deepEqual(model.decodeState(model.encodeState(model.DEFAULTS)),model.DEFAULTS);
});

test('old automatic species placements move with the left-edge pool while stock and identities remain',()=>{
  for(const typeId of Object.keys(LEGACY_SUMMER_TREE_POSITIONS)){
    const original=proposal(legacyTrees(typeId)),snapshot=structuredClone(original);
    for(const version of [30,31]){
      const next=model.migrateSavedState(original,version);
      assert.deepEqual(next.screeningTrees.map(t=>[t.x,t.y]),BOUNDARY_TREE_POSITIONS[typeId],typeId);
      for(let i=0;i<3;i++){
        const {x:ox,y:oy,...oldProperties}=original.screeningTrees[i];
        const {x:nx,y:ny,...newProperties}=next.screeningTrees[i];
        assert.deepEqual(newProperties,oldProperties,`${typeId} preserves tree ${i}`);
      }
      assert.equal(next.poolSunbedSides,3,'An explicitly saved comparison keeps its selected sides');
      assert.deepEqual(model.decodeState(model.encodeState(next)),next);
    }
    assert.deepEqual(original,snapshot,'Migration never mutates the old saved record');
  }
});

test('shared v31 preset trees migrate safely even when their stored order differs',()=>{
  const original=proposal(legacyTrees().reverse(),{poolSunbedSides:2});
  const next=model.decodeState(oldLink(original));
  assert.deepEqual(next.screeningTrees.map(t=>[t.x,t.y]),[...BOUNDARY_TREE_POSITIONS['austrian-pine-tall']].reverse());
  assert.deepEqual(next.screeningTrees.map(t=>t.id),original.screeningTrees.map(t=>t.id));
  assert.equal(next.poolSunbedSides,2);
});

test('only active older sessions adopt one sunbed row; explicit shared choices and current saves remain',()=>{
  const three=proposal();
  assert.equal(model.migrateSavedState(three,31,{adoptGardenRefinement:true}).poolSunbedSides,1);
  assert.equal(model.decodeState(oldLink(three)).poolSunbedSides,3);
  assert.equal(model.migrateSavedState(three,31).poolSunbedSides,3);
  const two=proposal(legacyTrees(),{poolSunbedSides:2});
  assert.equal(model.migrateSavedState(two,31,{adoptGardenRefinement:true}).poolSunbedSides,2);
  assert.deepEqual(model.migrateSavedState(three,STATE_VERSION,{adoptGardenRefinement:true}),three);
});

test('manual, partial, mixed and disabled-layout planting is not overwritten by preset migration',()=>{
  const moved=legacyTrees();moved[1].x-=.3;
  const mixed=legacyTrees();mixed[1].typeId='white-fir-9m';
  for(const trees of [moved,mixed,legacyTrees().slice(0,2),[]]){
    const original=proposal(trees),next=model.migrateSavedState(original,31,{adoptGardenRefinement:true});
    assert.deepEqual(next.screeningTrees,original.screeningTrees);
  }
  const archived=proposal(legacyTrees(),{summerPoolLayout:false});
  assert.deepEqual(model.migrateSavedState(archived,31,{adoptGardenRefinement:true}).screeningTrees,archived.screeningTrees);
  assert.equal(model.migrateSavedState(archived,31,{adoptGardenRefinement:true}).poolSunbedSides,3);
  const old=model.migrateSavedState(archived,29);
  assert.deepEqual(old.screeningTrees,archived.screeningTrees);
});

test('the garden refinement never changes the other two property models',()=>{
  for(const id of ['korzeniowskiego-40','nadmorska-17']){
    const other=createStateModel(getSiteProfile(id));
    const original=other.sanitizeState({...other.DEFAULTS,poolSunbedSides:3,summerPoolLayout:false});
    assert.deepEqual(other.migrateSavedState(original,31,{adoptGardenRefinement:true}),original);
  }
});
