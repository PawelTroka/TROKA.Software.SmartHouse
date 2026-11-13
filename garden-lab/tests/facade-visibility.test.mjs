import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeFacadeVisibility} from '../src/facade-visibility.js';
import {analyzeVisibility,observerForPreset} from '../src/geometry.js';
import {applyBuildingOverrides} from '../src/buildings.js?v=1.13.0';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
// Freeze the rejected candidate: its sparse facade samples said zero exposed
// points, although the finer grid finds the window-sized opening seen in 3D.
const settings={siteId:'sternicza-11',gardenProgram:'spa-aligned',hedgeRear:4,hedgeLeft:4,hedgeRight:4,hedgeFront:4,
  hedgeFullPerimeter:true,hedgeInset:.5,gardenRaise:.5,bedRaise:0,raiseNewHedges:true,terraceDepth:4.2,
  floorHeight:1.2,removeGarage:true,canopyEnabled:false,includeHighFeatures:false,jacuzziOverflow:false,
  treeLeafMode:'auto',sunDate:'2026-06-21',sunMinutes:720,
  screeningTrees:[[17.5,26.8],[14.85,28.4],[12.05,32.35]].map(([x,y],i)=>({id:`pine-${i+1}`,
    typeId:'austrian-pine-tall',x,y,height:9.5,crownBase:2.5,crownWidth:5,crownDepth:5,rotation:0,enabled:true,unitPrice:0}))};
const observer=(preset,s=settings,d=data)=>observerForPreset(preset,{...s,eyeHeight:undefined},d);

test('dense facade checks detect the exposed opening missed by the original zero-visible facade samples',()=>{
  for(const [preset,visible,total] of [['sofa',30,5214],['standing',46,5214],['jacuzzi',152,9702],['garden',0,5214]]){
    const eye=observer(preset),coarse=analyzeVisibility(eye,settings,data);
    const oldFacade=coarse.rays.filter(ray=>ray.blockId==='building-9'&&ray.kind==='facade');
    assert.equal(oldFacade.filter(ray=>ray.visible).length,0,preset);
    const result=analyzeFacadeVisibility(eye,'building-9',settings,data);
    assert.deepEqual([result.visible,result.total],[visible,total],preset);
    assert.equal(result.spacing,.25);assert.equal(result.generatedSamples,19338);assert.equal(result.status,'ok');
    assert.ok(result.rays.every(ray=>ray.kind==='facade'&&ray.blockId==='building-9'));
    assert.ok(result.total<result.generatedSamples,'Self-hidden/back-facing walls stay out of the denominator');
    assert.match(result.method,/Roof points remain a separate check/);
  }
});

test('the facade grid covers the upper wall band, excludes roof features and leaves source samples unchanged',()=>{
  const target=data.buildings.find(b=>b.id==='building-9'),before=JSON.stringify(target),stateBefore=JSON.stringify(settings);
  const result=analyzeFacadeVisibility(observer('jacuzzi'),'building-9',{...settings,includeHighFeatures:true},data);
  const heights=result.rays.map(ray=>ray.target[2]);
  assert.equal(Math.min(...heights),target.baseZ+.125);
  assert.ok(Math.max(...heights)<target.roofZ&&target.roofZ-Math.max(...heights)<=.25,'The last grid row reaches the top wall band');
  assert.equal(result.visible,152,'The wall-only check never mixes thin roof features into its result');
  assert.equal(JSON.stringify(target),before);assert.equal(JSON.stringify(settings),stateBefore);
  assert.equal(analyzeVisibility(observer('jacuzzi'),settings,data).byBlock.find(b=>b.id==='building-9').total,460,'The main engine retains its original denominator');
});

test('other analyzed buildings stay as contextual blockers and own-house exclusion remains the shared convention',()=>{
  const target=data.buildings.find(b=>b.id==='building-9');
  const empty={...data,buildings:[target]},s={...settings,gardenProgram:'classic',hedgeRear:0,hedgeLeft:0,hedgeRight:0,hedgeFront:0,gardenRaise:0,screeningTrees:[]};
  const eye=observer('sofa',s,empty),baseline=analyzeFacadeVisibility(eye,target.id,s,empty,{spacing:1});
  assert.equal(baseline.visible,baseline.total);
  const blocker={id:'test-target-blocker',index:900,kind:'target',label:'Contextual test screen',baseZ:-10,roofZ:100,
    footprint:[[-10,30],[60,30],[60,31],[-10,31],[-10,30]],samples:[[25,30,10]],roofSampleCount:0,highFeatures:[]};
  const blocked=analyzeFacadeVisibility(eye,target.id,s,{...empty,buildings:[target,blocker]},{spacing:1});
  assert.equal(blocked.total,baseline.total);assert.equal(blocked.visible,0);assert.equal(blocked.reasons.building,blocked.total);
  assert.deepEqual(blocked.byBlock.map(b=>b.id),[target.id],'The contextual blocker is not counted as another target');
  const ownHouse=analyzeFacadeVisibility(eye,target.id,s,{...empty,buildings:[target,{...blocker,kind:'house'}]},{spacing:1});
  assert.equal(ownHouse.visible,baseline.visible,'The supplemental metric must not silently add a new own-house occluder');
});

test('canopy, hedges and sauna walls keep their existing intersection behavior in the dense check',()=>{
  const s={...settings,screeningTrees:[],canopyEnabled:true,canopyDepth:6,canopyWidth:11,canopyHeight:2.7,fasciaDepth:.3};
  const sofa=analyzeFacadeVisibility(observer('sofa',s),'building-9',s,data,{spacing:1});
  assert.ok(sofa.reasons.canopy>0);assert.ok(sofa.reasons['hedge-rear']>0);assert.ok(sofa.reasons['hedge-left']>0);
  const sauna=analyzeFacadeVisibility(observer('sauna',s),'building-9',s,data,{spacing:1});
  assert.ok(sauna.reasons.sauna>0);
});

test('height and distance sensitivity transforms are applied once before generating the facade grid',()=>{
  const s={...settings,b9HeightDelta:3,b9DistanceDelta:5},adjusted=applyBuildingOverrides(data,s);
  const eye=observer('jacuzzi',s),a=analyzeFacadeVisibility(eye,'building-9',s,data,{spacing:1});
  const b=analyzeFacadeVisibility(eye,'building-9',s,adjusted,{spacing:1});
  assert.deepEqual([a.visible,a.total,a.generatedSamples],[b.visible,b.total,b.generatedSamples]);
  assert.deepEqual(a.rays.map(r=>r.target),b.rays.map(r=>r.target));
  const target=adjusted.buildings.find(b=>b.id==='building-9'),original=data.buildings.find(b=>b.id==='building-9');
  assert.ok(Math.max(...a.rays.map(r=>r.target[2]))>original.roofZ,'New upper wall points follow the increased height');
  assert.ok(a.rays.every(r=>r.target[2]>=target.baseZ&&r.target[2]<target.roofZ));
});

test('missing or invalid walls produce an unavailable result, while requested grid spacing is bounded',()=>{
  const eye=observer('sofa');
  for(const [spacing,expected] of [[undefined,.25],[0,.25],[-1,.25],[NaN,.25],[Infinity,.25],['.5',.25],[.01,.25],[.5,.5],[100,2]]){
    const result=analyzeFacadeVisibility(eye,'missing-target',settings,data,{spacing});
    assert.equal(result.status,'unavailable');assert.equal(result.total,0);assert.equal(result.visible,0);
    assert.equal(result.blockedPercent,null,'No samples cannot be described as complete screening');assert.equal(result.spacing,expected);
  }
  const invalid={...data,buildings:data.buildings.map(b=>b.id==='building-9'?{...b,roofZ:b.baseZ}:b)};
  assert.equal(analyzeFacadeVisibility(eye,'building-9',settings,invalid).status,'unavailable');
});
