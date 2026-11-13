import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStateModel,STATE_VERSION} from '../src/state.js';
import {getSiteProfile,resolveSiteId} from '../src/sites.js';
import {createScreeningTree,screeningTreeVolumes} from '../src/screening-trees.js';
import {getTreeType} from '../src/tree-catalog.js';
import {getScreeningLayouts,STERNICZA_STRATEGIC_TREES} from '../src/screening-layouts.js';
import {gardenProgram,poolBounds} from '../src/garden-program.js';

const sterniczaData=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const korzData=JSON.parse(readFileSync(new URL('../data/korzeniowskiego-40.json',import.meta.url)));
const sternicza=createStateModel(getSiteProfile('sternicza-11',sterniczaData));
const korz=createStateModel(getSiteProfile('korzeniowskiego-40',korzData));

test('fresh Sternicza starts with checked planting positions while Korzeniowskiego stays tree-free',()=>{
  assert.equal(sternicza.DEFAULTS.gardenProgram,'spa-compact');
  assert.equal(korz.DEFAULTS.gardenProgram,'classic');
  assert.ok(sternicza.DEFAULTS.screeningTrees.length>0,'Do not release a placeholder planting layout');
  assert.deepEqual(korz.DEFAULTS.screeningTrees,[]);
  assert.deepEqual(sternicza.sanitizeState().screeningTrees,sternicza.DEFAULTS.screeningTrees);
  assert.deepEqual(sternicza.sanitizeState({screeningTrees:[]}).screeningTrees,[]);
  const volumes=screeningTreeVolumes(sternicza.DEFAULTS,sterniczaData);
  assert.ok(volumes.every(volume=>volume.plantable),'Every default trunk must have a valid planting position');
  assert.equal(volumes.filter(volume=>!volume.crownInside).length,1,'The farther-left comparison explicitly includes one overhanging crown');
  assert.match(getScreeningLayouts('sternicza-11')[0].note,/overhang/i,'The default must disclose the boundary condition');
});

test('every pre-v8 omitted-tree link keeps its original tree-free meaning',()=>{
  for(const version of [1,2,3,4,5,6,7]){
    const shared=`v=${version}${version>=6?'&site=sternicza-11':''}`;
    const restored=sternicza.decodeState(shared);
    assert.deepEqual(restored.screeningTrees,[],`v${version} must not inherit new default pines`);
    assert.equal(restored.hedgeRear,version<=3?2.5:4);
    assert.equal(restored.gardenRaise,version<=3?0:.5);
    assert.equal(restored.gardenProgram,'classic',`v${version} retains the original pool and garden`);
  }
  assert.deepEqual(korz.decodeState('v=7&site=korzeniowskiego-40').screeningTrees,[]);
});

test('v7 shared trees and saved A retain independent geometry, quotes and seasonal settings for both properties',()=>{
  for(const model of [sternicza,korz]){
    const custom=createScreeningTree('broad-hornbeam',{id:'my-old-tree',x:14,y:26});
    Object.assign(custom,{crownWidth:3.2,crownDepth:2.4,rotation:37,unitPrice:24149,enabled:false});
    const saved={...model.DEFAULTS,gardenProgram:'classic',screeningTrees:[custom],treeLeafMode:'leaf-off',hedgeLeft:2.8,hedgeRight:5.2,
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

test('current links explicitly retain an empty planting design and malformed trees never add default screening',()=>{
  for(const model of [sternicza,korz]){
    const clear={...model.DEFAULTS,screeningTrees:[]};
    const params=new URLSearchParams(model.encodeState(clear));
    assert.equal(params.get('v'),String(STATE_VERSION));assert.equal(params.get('screeningTrees'),'[]');
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

test('v8 omitted planting uses the original west-pool layout, while explicit empty and custom designs survive',()=>{
  const originalCoordinates=[[16.1,29.6],[12.2,32.6],[15.7,22.8]];
  assert.deepEqual(STERNICZA_STRATEGIC_TREES.map(tree=>[tree.x,tree.y]),originalCoordinates,'The published v8 default is frozen, independent of the v9 spa layout');
  for(const restored of [sternicza.decodeState('v=8&site=sternicza-11'),sternicza.migrateSavedState({siteId:'sternicza-11'},8)]){
    assert.equal(restored.gardenProgram,'classic');
    assert.deepEqual(restored.screeningTrees.map(tree=>[tree.x,tree.y]),originalCoordinates);
    const pool=poolBounds(restored,sterniczaData);
    assert.equal(pool.x,5.8);assert.equal(pool.y,25);
    assert.equal(gardenProgram(restored,sterniczaData).sauna,null);
    assert.deepEqual(sternicza.decodeState(sternicza.encodeState(restored)),restored,'A newly shared old design retains the old geometry');
  }
  const custom=createScreeningTree('broad-hornbeam',{id:'v8-custom',x:12.3,y:34.1,unitPrice:28700});
  for(const trees of [[],[custom]]){
    const params=new URLSearchParams({v:'8',site:'sternicza-11',gardenProgram:'spa',screeningTrees:JSON.stringify(trees)});
    const shared=sternicza.decodeState(params.toString());
    assert.equal(shared.gardenProgram,'classic','A pre-v9 link cannot opt into a programme it never encoded');
    assert.deepEqual(shared.screeningTrees,trees);
    assert.deepEqual(sternicza.migrateSavedState({siteId:'sternicza-11',screeningTrees:trees},8).screeningTrees,trees);
  }
});

test('each programme chooses its own planting layouts while preserving the comparison and installed quotes',()=>{
  const old=sternicza.decodeState('v=8&site=sternicza-11');
  const spa=sternicza.decodeState('v=9&site=sternicza-11');
  const edge=sternicza.DEFAULTS;
  assert.equal(spa.gardenProgram,'spa');
  assert.deepEqual(spa.screeningTrees.map(t=>[t.x,t.y,t.height]),[[17,35.3,9.5],[13.3,35.3,9.5],[16.6,22.1,5.5]],'The v9 spa retains its published planting');
  for(const current of [old,spa,edge])for(const layout of getScreeningLayouts('sternicza-11',current.gardenProgram)){
    const next=sternicza.scenarioState(layout.id,{...current,floorHeight:1.8,sunDate:'2026-12-21',costSpaSauna:85400});
    assert.equal(next.gardenProgram,current.gardenProgram);
    assert.deepEqual(next.screeningTrees,layout.trees);
    assert.equal(next.floorHeight,1.8);assert.equal(next.sunDate,'2026-12-21');assert.equal(next.costSpaSauna,85400);
    assert.ok(sternicza.matchesScenario(layout.id,next));
  }
  assert.notDeepEqual(sternicza.scenarioState('default',old).screeningTrees,sternicza.scenarioState('default',spa).screeningTrees);
  assert.notDeepEqual(sternicza.scenarioState('default',spa).screeningTrees,sternicza.scenarioState('default',edge).screeningTrees);
});

test('all spa planting presets leave tree trunks clear of the pool, spa rooms, dining and loungers',()=>{
  const distanceToRect=(tree,rect)=>Math.hypot(
    Math.max(rect.x-tree.x,0,tree.x-rect.x-rect.width),
    Math.max(rect.y-tree.y,0,tree.y-rect.y-rect.length));
  for(const layout of getScreeningLayouts('sternicza-11','spa')){
    const state=sternicza.scenarioState(layout.id,sternicza.decodeState('v=9&site=sternicza-11'));
    const program=gardenProgram(state,sterniczaData);
    const furniture=[program.furniture.dining,...program.furniture.loungers.map(([x,y])=>({x,y,width:.78,length:2}))];
    for(const tree of screeningTreeVolumes(state,sterniczaData)){
      assert.ok(tree.plantable,`${layout.id}: ${tree.id} is planted in soil`);
      assert.ok(tree.crownInside,`${layout.id}: ${tree.id} stays inside the parcel`);
      assert.ok(furniture.every(rect=>distanceToRect(tree,rect)>tree.trunkRadius+.15),`${layout.id}: ${tree.id} leaves dining and lounger footprints clear`);
      assert.equal(tree.warnings.some(message=>message.includes('crown overhangs')),false,`${layout.id}: crowns clear fixed hardscape`);
    }
  }
});

test('Korzeniowskiego ignores the Sternicza spa programme across fresh, historical and new shared designs',()=>{
  const pool=korzData.site.pool;
  for(const version of [6,7,8,9,10,11,12]){
    const settings=korz.decodeState(`v=${version}&site=korzeniowskiego-40&gardenProgram=spa&preset=sauna`);
    assert.equal(settings.gardenProgram,'classic');assert.equal(settings.preset,'garden');
    assert.deepEqual(settings.screeningTrees,[]);
    assert.equal(gardenProgram(settings,korzData).active,false);
    for(const key of ['x','y','width','length'])assert.equal(poolBounds(settings,korzData)[key],pool[key]);
  }
  assert.deepEqual(getScreeningLayouts('korzeniowskiego-40','spa'),[]);
  assert.deepEqual(getScreeningLayouts('korzeniowskiego-40','spa-edge'),[]);
  assert.equal(korz.sanitizeState({...korz.DEFAULTS,gardenProgram:'spa'}).gardenProgram,'classic');
  assert.equal(korz.sanitizeState({...korz.DEFAULTS,gardenProgram:'spa-edge'}).gardenProgram,'classic');
});

test('named planting layouts restore compatible garden assumptions while keeping the user comparison context',()=>{
  const current={...sternicza.DEFAULTS,hedgeRear:9,gardenRaise:.1,bedRaise:.3,terraceDepth:6,removeGarage:false,canopyEnabled:true,
    floorHeight:1.8,preset:'jacuzzi',lookYaw:21,sunDate:'2026-12-21',sunMinutes:904,costScreeningPlanting:1150,b9HeightDelta:2,b9DistanceDelta:3};
  for(const {id:name} of getScreeningLayouts('sternicza-11',current.gardenProgram)){
    const next=sternicza.scenarioState(name,current);
    for(const key of ['floorHeight','preset','lookYaw','sunDate','sunMinutes','costScreeningPlanting','b9HeightDelta','b9DistanceDelta'])assert.equal(next[key],current[key],`${name}: ${key}`);
    assert.equal(next.hedgeRear,4);assert.equal(next.gardenRaise,.5);assert.equal(next.bedRaise,0);
    assert.equal(next.terraceDepth,4.2);assert.equal(next.removeGarage,true);assert.equal(next.canopyEnabled,false);
    assert.ok(sternicza.matchesScenario(name,next));
  }
  const tall=sternicza.scenarioState('default',current);
  assert.equal(tall.screeningTrees.length,3);
  assert.ok(tall.screeningTrees.every(tree=>tree.typeId==='austrian-pine-tall'&&tree.height===9.5));
  const budget=sternicza.scenarioState('budget-pines',current);
  assert.equal(budget.screeningTrees.filter(tree=>tree.typeId==='austrian-pine-tall').length,1);
  assert.equal(budget.screeningTrees.filter(tree=>tree.typeId==='austrian-pine-large').length,2);
  assert.equal(budget.screeningTrees.reduce((sum,tree)=>sum+getTreeType(tree.typeId).pricePLN,0),93700);
  const standardBudget=sternicza.scenarioState('budget-pines',sternicza.DEFAULTS);
  assert.ok(screeningTreeVolumes(standardBudget,sterniczaData).every(volume=>volume.plantable&&volume.crownInside));
  assert.ok(screeningTreeVolumes(budget,sterniczaData).some(volume=>!volume.plantable&&volume.warnings.some(w=>w.includes('terrace stairs'))),'A higher edited floor extends stairs into one budget tree; the model must flag that collision');
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
