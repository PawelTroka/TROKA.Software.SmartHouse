import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStateModel,STATE_VERSION} from '../src/state.js';
import {getSiteProfile,resolveSiteId} from '../src/sites.js';
import {createScreeningTree,screeningTreeVolumes} from '../src/screening-trees.js';
import {getTreeType} from '../src/tree-catalog.js';

const sterniczaData=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const korzData=JSON.parse(readFileSync(new URL('../data/korzeniowskiego-40.json',import.meta.url)));
const sternicza=createStateModel(getSiteProfile('sternicza-11',sterniczaData));
const korz=createStateModel(getSiteProfile('korzeniowskiego-40',korzData));

test('fresh Sternicza starts with checked planting positions while Korzeniowskiego stays tree-free',()=>{
  assert.equal(STATE_VERSION,8);
  assert.ok(sternicza.DEFAULTS.screeningTrees.length>0,'Do not release a placeholder planting layout');
  assert.deepEqual(korz.DEFAULTS.screeningTrees,[]);
  assert.deepEqual(sternicza.sanitizeState().screeningTrees,sternicza.DEFAULTS.screeningTrees);
  assert.deepEqual(sternicza.sanitizeState({screeningTrees:[]}).screeningTrees,[]);
  const volumes=screeningTreeVolumes(sternicza.DEFAULTS,sterniczaData);
  assert.ok(volumes.every(volume=>volume.plantable),'Every default trunk must have a valid planting position');
  assert.ok(volumes.every(volume=>volume.crownInside),'Default crowns stay inside the property');
});

test('every pre-v8 omitted-tree link keeps its original tree-free meaning',()=>{
  for(const version of [1,2,3,4,5,6,7]){
    const shared=`v=${version}${version>=6?'&site=sternicza-11':''}`;
    const restored=sternicza.decodeState(shared);
    assert.deepEqual(restored.screeningTrees,[],`v${version} must not inherit new default pines`);
    assert.equal(restored.hedgeRear,version<=3?2.5:4);
    assert.equal(restored.gardenRaise,version<=3?0:.5);
  }
  assert.deepEqual(korz.decodeState('v=7&site=korzeniowskiego-40').screeningTrees,[]);
});

test('v7 shared trees and saved A retain independent geometry, quotes and seasonal settings for both properties',()=>{
  for(const model of [sternicza,korz]){
    const custom=createScreeningTree('broad-hornbeam',{id:'my-old-tree',x:14,y:26});
    Object.assign(custom,{crownWidth:3.2,crownDepth:2.4,rotation:37,unitPrice:24149,enabled:false});
    const saved={...model.DEFAULTS,screeningTrees:[custom],treeLeafMode:'leaf-off',hedgeLeft:2.8,hedgeRight:5.2,
      floorHeight:1.85,preset:'jacuzzi',sunDate:'2026-12-21',costScreeningPlanting:750};
    const migrated=model.migrateSavedState(saved,7);
    assert.deepEqual(migrated,saved);
    const link=new URLSearchParams({v:'7',site:model.DEFAULTS.siteId,screeningTrees:JSON.stringify([custom]),treeLeafMode:'leaf-off'});
    const restored=model.decodeState(link.toString());
    assert.deepEqual(restored.screeningTrees,[custom]);assert.equal(restored.treeLeafMode,'leaf-off');
    migrated.screeningTrees[0].height=12;
    assert.notEqual(saved.screeningTrees[0].height,12,'A migrated scenario cannot mutate the saved source');
    assert.deepEqual(model.migrateSavedState({...saved,screeningTrees:[]},7).screeningTrees,[]);
    const withoutTrees={...saved};delete withoutTrees.screeningTrees;
    assert.deepEqual(model.migrateSavedState(withoutTrees,7).screeningTrees,[]);
  }
});

test('v8 links explicitly retain an empty planting design and malformed trees never add default screening',()=>{
  for(const model of [sternicza,korz]){
    const clear={...model.DEFAULTS,screeningTrees:[]};
    const params=new URLSearchParams(model.encodeState(clear));
    assert.equal(params.get('v'),'8');assert.equal(params.get('screeningTrees'),'[]');
    assert.deepEqual(model.decodeState(params.toString()),clear);
    assert.equal(resolveSiteId('?site=unknown',`#${params}`),model.DEFAULTS.siteId);
    const normal=new URLSearchParams(model.encodeState(model.DEFAULTS));
    assert.deepEqual(JSON.parse(normal.get('screeningTrees')),model.DEFAULTS.screeningTrees);
    for(const bad of ['{bad','null','"oops"','x'.repeat(21000)]){
      params.set('screeningTrees',bad);
      assert.deepEqual(model.decodeState(params.toString()).screeningTrees,[]);
    }
  }
});

test('named planting layouts restore compatible garden assumptions while keeping the user comparison context',()=>{
  const current={...sternicza.DEFAULTS,hedgeRear:9,gardenRaise:.1,bedRaise:.3,terraceDepth:6,removeGarage:false,canopyEnabled:true,
    floorHeight:1.8,preset:'jacuzzi',lookYaw:21,sunDate:'2026-12-21',sunMinutes:904,costScreeningPlanting:1150,b9HeightDelta:2,b9DistanceDelta:3};
  for(const name of ['default','three-tall-pines','budget-pines','hedges-only']){
    const next=sternicza.scenarioState(name,current);
    for(const key of ['floorHeight','preset','lookYaw','sunDate','sunMinutes','costScreeningPlanting','b9HeightDelta','b9DistanceDelta'])assert.equal(next[key],current[key],`${name}: ${key}`);
    assert.equal(next.hedgeRear,4);assert.equal(next.gardenRaise,.5);assert.equal(next.bedRaise,0);
    assert.equal(next.terraceDepth,4.2);assert.equal(next.removeGarage,true);assert.equal(next.canopyEnabled,false);
    assert.ok(sternicza.matchesScenario(name,next));
  }
  const tall=sternicza.scenarioState('three-tall-pines',current);
  assert.equal(tall.screeningTrees.length,3);
  assert.ok(tall.screeningTrees.every(tree=>tree.typeId==='austrian-pine-tall'&&tree.height===9.5));
  const budget=sternicza.scenarioState('budget-pines',current);
  assert.equal(budget.screeningTrees.filter(tree=>tree.typeId==='austrian-pine-tall').length,1);
  assert.equal(budget.screeningTrees.filter(tree=>tree.typeId==='austrian-pine-large').length,2);
  assert.equal(budget.screeningTrees.reduce((sum,tree)=>sum+getTreeType(tree.typeId).pricePLN,0),93700);
  assert.ok(screeningTreeVolumes(budget,sterniczaData).every(volume=>volume.plantable&&volume.crownInside));
  assert.deepEqual(sternicza.scenarioState('hedges-only',current).screeningTrees,[]);
  const onlyHedges=sternicza.scenarioState('tall',current);
  assert.deepEqual(onlyHedges.screeningTrees,current.screeningTrees,'Existing hedge comparisons retain the tree design');
});

test('a default label follows actual tree geometry, ignores unit-price edits and never shares mutable tree arrays',()=>{
  const a=sternicza.scenarioState('default'),b=sternicza.scenarioState('default');
  assert.ok(a.screeningTrees.length);
  assert.ok(sternicza.matchesScenario('default',a));
  a.screeningTrees[0].unitPrice=60001;a.screeningTrees[0].id='renamed-tree';
  assert.ok(sternicza.matchesScenario('default',a),'A supplier quote or record ID is not a different planting geometry');
  a.screeningTrees[0].x+=.1;
  assert.equal(sternicza.matchesScenario('default',a),false);
  assert.notEqual(a.screeningTrees[0].x,b.screeningTrees[0].x);
  assert.deepEqual(b.screeningTrees,sternicza.DEFAULTS.screeningTrees);
});
