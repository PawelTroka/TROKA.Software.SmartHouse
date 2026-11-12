import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createScreeningTree,sanitizeScreeningTrees,screeningTreeVolumes,treeRayIntersection,treeSunIntersection,
  firstTreeIntersection,treeFoliageActive,isPlantableTree,suggestTreePosition} from '../src/screening-trees.js';
import {TREE_CATALOG,getTreeType} from '../src/tree-catalog.js';
import {analyzeVisibility,observerForPreset,gardenGroundAt} from '../src/geometry.js';
import {sunlightAtPoint,prepareSunGeometry,analyzeSunlight} from '../src/shade.js';
import {createStateModel,DEFAULTS,STATE_VERSION,encodeState,decodeState,sanitizeState,migrateSavedState} from '../src/state.js';
import {getSiteProfile,resolveSiteId} from '../src/sites.js';

const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]];
const baseSettings={hedgeRear:0,hedgeLeft:0,hedgeRight:0,hedgeInset:0,gardenRaise:0,bedRaise:0,raiseNewHedges:true,
  floorHeight:1.2,terraceDepth:4,removeGarage:true,canopyEnabled:false,sunEnabled:true,sunDate:'2026-06-21',treeLeafMode:'auto',screeningTrees:[]};
function fixture(){return {
  coordinates:{localOriginEN:[0,0],xUnitEN:[1,0],yUnitEN:[0,1]},
  terrain:{originEN:[-10,-10],cellSize:1,columns:64,rows:64,elevations:Array(4096).fill(0)},
  site:{id:'sternicza-11',boundary:rect(0,0,20,38),boundaryNames:['street','east-rear','rear','west-rear'],rearMidpoint:[10,10],floorReference:{z:0},
    house:{id:'house',footprint:rect(6,2,8,8),baseZ:0,roofZ:8,roofTopZ:10},
    garage:{id:'garage',footprint:rect(15,25,3,5),baseZ:0,roofZ:4,roofTopZ:5},
    terrace:{x:6,y:10,width:8,depth:4},pool:{x:5,y:20,width:4,length:6}},
  buildings:[]};}
const tree=(type='austrian-pine-large',extra={})=>({...createScreeningTree(type,{id:'screen-1',x:12,y:20}),...extra});
const volume=(t,settings=baseSettings,data=fixture())=>screeningTreeVolumes({...settings,screeningTrees:[t]},data)[0];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} ≈ ${b}`);
const realData=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));

test('finite ellipsoid crowns screen their actual width and height but leave open space below',()=>{
  const v=volume(tree('austrian-pine-large',{height:8,crownBase:4,crownWidth:6,crownDepth:4}));
  const hit=treeRayIntersection([12,0,6],[12,40,6],v);
  near(hit.t,.45);near(hit.y,18);assert.equal(hit.part,'crown');assert.equal(hit.treeId,'screen-1');
  assert.equal(treeRayIntersection([13,0,2],[13,40,2],v),null,'The whole under-canopy column is not opaque');
  assert.equal(treeRayIntersection([15.1,0,6],[15.1,40,6],v),null,'A finite crown cannot become an infinite hedge');
  assert.equal(treeRayIntersection([12,0,6],[12,15,6],v),null,'A crown behind the target is not an obstruction');
  assert.equal(treeRayIntersection([12,0,9],[12,40,9],v),null,'No crown above the configured height');
  assert.equal(treeRayIntersection([12,0,2],[12,40,2],v)?.part,'trunk','Only the narrow trunk remains below foliage');
  assert.equal(firstTreeIntersection([12,0,6],[12,40,6],[v]).typeId,'austrian-pine-large');
});

test('panel and elliptical crown rotation change finite horizontal intersection',()=>{
  const p=tree('pleached-hornbeam',{height:8,crownBase:4,crownWidth:6,crownDepth:.4});
  const unrotated=volume(p),rotated=volume({...p,rotation:90});
  assert.ok(treeRayIntersection([14,0,6],[14,40,6],unrotated));
  assert.equal(treeRayIntersection([14,0,6],[14,40,6],rotated),null);
  near(treeRayIntersection([12,0,6],[12,40,6],rotated).y,17);
  const oval=tree('austrian-pine-large',{height:8,crownBase:4,crownWidth:6,crownDepth:1});
  assert.ok(treeRayIntersection([14,0,6],[14,40,6],volume(oval)));
  assert.equal(treeRayIntersection([14,0,6],[14,40,6],volume({...oval,rotation:90})),null);
  assert.equal(unrotated.corners.length,8);
});

test('spruce crowns taper to the top and have a finite bottom cap',()=>{
  const v=volume(tree('serbian-spruce',{height:8,crownBase:2,crownWidth:4,crownDepth:2}));
  assert.ok(treeRayIntersection([13.2,0,2.5],[13.2,40,2.5],v));
  assert.equal(treeRayIntersection([13.2,0,5],[13.2,40,5],v),null,'The cone is narrower halfway up');
  assert.equal(treeRayIntersection([12.3,0,7.5],[12.3,40,7.5],v),null,'No broad artificial top');
  assert.equal(treeRayIntersection([13,0,1],[13,40,1],v),null,'Foliage starts above crownBase');
  near(treeRayIntersection([13,20,0],[13,20,10],v).z,2);
});

test('new tree roots follow the actual soil and fill, never the extra hedge-bed slider',()=>{
  const data=fixture(),t=tree(),a=volume(t,baseSettings,data),b=volume(t,{...baseSettings,gardenRaise:.5,bedRaise:.8},data);
  near(b.groundZ,a.groundZ+.5);near(b.crownTopZ,a.crownTopZ+.5);
  near(b.groundZ,gardenGroundAt(t.x,t.y,{...baseSettings,gardenRaise:.5},data));
  near(volume(t,{...baseSettings,bedRaise:1},data).groundZ,a.groundZ);
  near(volume({...t,x:2,y:4},{...baseSettings,gardenRaise:1},data).groundZ,0,'Front soil does not rise');
});

test('invalid trunk positions do not count as privacy or shade despite a visible preview',()=>{
  const data=fixture();
  for(const [x,y,settings] of [[-.2,20,baseSettings],[10,6,baseSettings],[10,12,baseSettings],[7,22,baseSettings],[8,14.5,baseSettings],[16,27,{...baseSettings,removeGarage:false}]]){
    const t=tree('austrian-pine-xl',{x,y}),v=volume(t,settings,data);
    assert.equal(v.plantable,false,`${x},${y}`);assert.ok(v.warnings.length);
    assert.equal(treeRayIntersection([x,y-15,v.crownCenter[2]],[x,y+15,v.crownCenter[2]],v),null);
    assert.equal(treeSunIntersection([x,y,0],[0,0,1],[v]),null);
  }
  assert.equal(isPlantableTree(tree('austrian-pine-xl',{x:16,y:27}),baseSettings,data),true,'Removed garage returns plantable ground');
  const nearBoundary=volume(tree('austrian-pine-xl',{x:1,y:33}),baseSettings,data);
  assert.equal(nearBoundary.plantable,true);assert.equal(nearBoundary.crownInside,false);assert.ok(nearBoundary.warnings.some(w=>w.includes('extends beyond')));
  assert.equal(treeRayIntersection([12,0,4],[12,40,4],volume({...tree(),enabled:false})),null);
});

test('deciduous crowns use explicit or approximate seasonal foliage while evergreens stay active',()=>{
  const deciduous=getTreeType('broad-hornbeam'),pine=getTreeType('austrian-pine-large');
  for(const [month,expected] of [[1,false],[4,false],[5,true],[10,true],[11,false],[12,false]]){
    const settings={...baseSettings,sunDate:`2026-${String(month).padStart(2,'0')}-21`};
    assert.equal(treeFoliageActive(deciduous,settings),expected);assert.equal(treeFoliageActive(pine,settings),true);
  }
  assert.equal(treeFoliageActive(deciduous,{sunDate:'2026-12-21',treeLeafMode:'leaf-on'}),true);
  assert.equal(treeFoliageActive(deciduous,{sunDate:'2026-06-21',treeLeafMode:'leaf-off'}),false);
  const t=tree('broad-hornbeam',{height:8,crownBase:4,crownWidth:6,crownDepth:4});
  assert.ok(treeRayIntersection([13,0,6],[13,40,6],volume(t)));
  assert.equal(treeRayIntersection([13,0,6],[13,40,6],volume(t,{...baseSettings,sunDate:'2026-12-21'})),null);
});

test('sun and privacy use the same finite canopy, leafless trees lose crown shade, caches refresh',()=>{
  const data=fixture(),t=tree('broad-hornbeam',{height:8,crownBase:4,crownWidth:6,crownDepth:4});
  const summer={...baseSettings,screeningTrees:[t]},winter={...summer,sunDate:'2026-12-21'},sun={isDaylight:true,direction:[0,0,1]};
  const a=prepareSunGeometry(summer,data),b=prepareSunGeometry({...summer,sunMinutes:500},data);
  assert.equal(a,b,'Clock changes reuse unchanged crowns');
  assert.notEqual(a,prepareSunGeometry(winter,data));
  const summerHit=sunlightAtPoint([13,20,0],summer,data,sun);
  assert.equal(summerHit.blocker?.treeId,t.id);assert.equal(summerHit.blocker?.part,'crown');
  assert.equal(sunlightAtPoint([13,20,0],winter,data,sun).sunlit,true);
  assert.equal(sunlightAtPoint([15.1,20,0],summer,data,sun).sunlit,true);
  assert.equal(sunlightAtPoint([13,20,0],{...winter,treeLeafMode:'leaf-on'},data,sun).blocker?.treeId,t.id);
  const changed={...summer,screeningTrees:[{...t,x:17}]};
  assert.notEqual(prepareSunGeometry(changed,data),a);
  assert.equal(sunlightAtPoint([13,20,0],changed,data,sun).sunlit,true);
  const shadedCell=analyzeSunlight(summer,data,sun).cells.find(cell=>cell.treeId===t.id);
  assert.equal(shadedCell.blockedLabel,getTreeType(t.typeId).label);
});

test('tree contributions never change the audited hedge-alone requirement',()=>{
  const settings={...DEFAULTS,gardenProgram:'classic',hedgeRear:2.5,hedgeLeft:2.5,hedgeRight:2.5,screeningTrees:[]};
  const observer=observerForPreset('jacuzzi',settings,realData),before=analyzeVisibility(observer,settings,realData);
  const t=tree('austrian-pine-xl',{x:16,y:25,height:10,crownWidth:9,crownDepth:6});
  const after=analyzeVisibility(observer,{...settings,screeningTrees:[t]},realData);
  assert.deepEqual(after.worstRequiredHedge,before.worstRequiredHedge);
  assert.ok(after.blocked>=before.blocked);assert.ok(after.remainingRequiredHedge.overall<=before.remainingRequiredHedge.overall);
  assert.ok(after.rays.some(ray=>ray.blockedBy==='screening-tree'&&ray.obstruction.treeId===t.id));
  assert.deepEqual(analyzeVisibility(observer,{...settings,screeningTrees:[]},realData),before);
});

test('targeted placement adds screening from the selected eye without planting in hardscape',()=>{
  const data=fixture(),samples=Array.from({length:9},(_,i)=>[10+i*.5,45,9+(i%2)*.5]);
  data.buildings=[{id:'target',label:'Target',kind:'target',baseZ:0,roofZ:10,footprint:rect(9,45,6,5),samples,highFeatures:[],roofSampleCount:samples.length}];
  const observer={x:12,y:8,z:2},t=tree('austrian-pine-xl',{x:7,y:22});
  const suggestion=suggestTreePosition(t,observer,'target',baseSettings,data);
  assert.ok(suggestion.position);assert.ok(suggestion.added>0);assert.ok(isPlantableTree(suggestion.tree,baseSettings,data));
  assert.equal(suggestion.blockedAfter,suggestion.blockedBefore+suggestion.added);
  const current={...baseSettings,screeningTrees:[suggestion.tree]};
  const result=analyzeVisibility(observer,current,data).byBlock.find(b=>b.id==='target');
  assert.equal(result.blocked,suggestion.blockedAfter);
  const repeat=suggestTreePosition(suggestion.tree,observer,'target',current,data);
  assert.equal(repeat.blockedBefore,suggestion.blockedBefore,'Moving the same tree excludes it from baseline');
  const alreadyHidden={...baseSettings,hedgeRear:15};
  const zero=suggestTreePosition(t,observer,'target',alreadyHidden,data);
  assert.equal(zero.added,0);assert.ok(zero.position);assert.ok(isPlantableTree(zero.tree,alreadyHidden,data),'New add still needs a safe default when no gain is possible');
});

test('three sequential group suggestions keep separate stems even after all target rays are screened',()=>{
  const data=fixture(),settings={...baseSettings,hedgeRear:15,screeningTrees:[]};
  const samples=[[12,45,9],[12.5,45,9.5],[13,45,9]];
  data.buildings=[{id:'target',label:'Target',kind:'target',baseZ:0,roofZ:10,footprint:rect(9,45,6,5),samples,highFeatures:[],roofSampleCount:samples.length}];
  const observer={x:12,y:8,z:2};
  for(let i=0;i<3;i++) {
    const candidate=tree('serbian-spruce',{id:`group-${i+1}`,x:12,y:20});
    const suggestion=suggestTreePosition(candidate,observer,'target',settings,data);
    assert.ok(suggestion.position);assert.equal(suggestion.added,0);assert.ok(isPlantableTree(suggestion.tree,settings,data));
    for(const previous of settings.screeningTrees)assert.ok(Math.hypot(previous.x-suggestion.tree.x,previous.y-suggestion.tree.y)>=Math.max(.8,Math.min(previous.crownWidth,suggestion.tree.crownWidth)*.5));
    settings.screeningTrees.push(suggestion.tree);
  }
  assert.equal(new Set(settings.screeningTrees.map(t=>`${t.x},${t.y}`)).size,3);
  assert.ok(screeningTreeVolumes(settings,data).some(v=>v.warnings.some(message=>message.includes('crown overlaps'))),'Crowns may overlap despite safe separation of suggested centres');
});

test('state v9 preserves every independent tree and leaf mode, with deep copies and safe IDs',()=>{
  assert.equal(STATE_VERSION,9);
  assert.equal(tree().unitPrice,0,'Zero requests a catalog-based estimate; creating a tree must not invent a custom quote');
  assert.equal(sanitizeScreeningTrees([{...tree(),unitPrice:undefined}])[0].unitPrice,0);
  const input={...DEFAULTS,treeLeafMode:'leaf-off',screeningTrees:[tree(),tree('pleached-hornbeam',{id:'panel-2',x:15,y:33,rotation:48,unitPrice:3100,enabled:false})]};
  const restored=decodeState(encodeState(input));
  assert.deepEqual(restored.screeningTrees,input.screeningTrees);assert.equal(restored.treeLeafMode,'leaf-off');
  const clean=sanitizeState(input);
  clean.screeningTrees[0].height=13;
  assert.notEqual(input.screeningTrees[0].height,13);assert.notEqual(restored.screeningTrees[0].height,13);
  const b=sanitizeState(input);b.screeningTrees.push(tree('broad-hornbeam',{id:'third'}));
  assert.equal(input.screeningTrees.length,2);assert.equal(restored.screeningTrees.length,2);
  const bad=sanitizeScreeningTrees([tree('austrian-pine-large',{id:'<script>',height:Infinity,crownBase:50,crownWidth:100,crownDepth:-20,rotation:999,unitPrice:-1}),tree('austrian-pine-large',{id:'tree-1'}),{...tree(),typeId:'unknown'},{...tree(),x:NaN}]);
  assert.equal(bad.length,2);assert.match(bad[0].id,/^[A-Za-z][\w-]*$/);assert.notEqual(bad[0].id,bad[1].id);
  assert.equal(bad[0].height,getTreeType(bad[0].typeId).dimensions.height);assert.ok(bad[0].crownBase<=bad[0].height-.2);
  assert.equal(bad[0].crownWidth,16);assert.equal(bad[0].crownDepth,.2);assert.equal(bad[0].rotation,180);assert.equal(bad[0].unitPrice,0);
  assert.equal(sanitizeScreeningTrees(Array.from({length:50},()=>tree())).length,12);
  assert.deepEqual(decodeState('v=7&site=sternicza-11&screeningTrees=%7Bbad&treeLeafMode=broken').screeningTrees,[]);
  assert.throws(()=>createScreeningTree('unknown'),RangeError);
  assert.ok(TREE_CATALOG.every(type=>screeningTreeVolumes({...baseSettings,screeningTrees:[tree(type.id)]},fixture())[0]));
});

test('old links and v6 local saves keep both properties unchanged and never acquire trees',()=>{
  for(const version of [1,2,3,4,5,6]){
    const suffix=version>=6?'&site=sternicza-11':'';
    const restored=decodeState(`v=${version}${suffix}&hedgeRear=6&hedgeLeft=4&hedgeRight=3&treeLeafMode=leaf-off&screeningTrees=${encodeURIComponent(JSON.stringify([tree()]))}`);
    assert.equal(restored.hedgeRear,6);assert.deepEqual(restored.screeningTrees,[]);assert.equal(restored.treeLeafMode,'auto');
  }
  const data=JSON.parse(readFileSync(new URL('../data/korzeniowskiego-40.json',import.meta.url)));
  const model=createStateModel(getSiteProfile('korzeniowskiego-40',data));
  const saved={...model.DEFAULTS,hedgeLeft:7,hedgeRight:2.5,floorHeight:1.8,lookYaw:42,sunDate:'2026-12-21'};
  const restored=model.migrateSavedState(saved,6);
  assert.deepEqual(restored,saved);assert.deepEqual(restored.screeningTrees,[]);
  const next={...restored,screeningTrees:[tree('austrian-pine-medium',{x:14,y:26})]};
  const url=model.encodeState(next);
  assert.equal(resolveSiteId('',`#${url}`),'korzeniowskiego-40');assert.deepEqual(model.decodeState(url),next);
  assert.deepEqual(decodeState(url),DEFAULTS,'Cross-property trees cannot leak into a different site');
  assert.equal(migrateSavedState({...DEFAULTS,hedgeRear:9},6).hedgeRear,9);
});
