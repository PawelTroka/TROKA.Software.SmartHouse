import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStateModel,STATE_VERSION} from '../src/state.js';
import {getSiteProfile} from '../src/sites.js';
import {applyPlanExterior} from '../src/plan-exterior.js';
import {createWalkNavigation} from '../src/house-walk.js';
import {terrainAt,analyzeVisibility} from '../src/geometry.js';
import {prepareSunGeometry,firstSunBlocker} from '../src/shade.js';
import {estimateBoundaryFenceCosts,estimateCosts} from '../src/costs.js';
import {boundaryFenceLayout,firstBoundaryIntersection} from '../src/boundary-fence.js';

const read=name=>JSON.parse(readFileSync(new URL('../data/'+name,import.meta.url)));
const source=read('site-data.json'),model=createStateModel(getSiteProfile(source.site.id,source));
const build=extra=>{const settings={...model.DEFAULTS,designStyle:'warm-minimal',perimeterFenceEnabled:true,pedestrianGateOpen:true,garageGateOpen:true,
  garageProgress:100,screeningTrees:[],existingCanopyAnalysis:false,...extra};return{settings,data:applyPlanExterior(source,settings)};};
const close=(a,b,label='')=>assert.ok(Math.abs(a-b)<1e-7,`${label}: ${a} != ${b}`);

test('real house-and-garden physical walking crosses each open entry, while each closed gate stops only its own route',()=>{
  for(const options of [{pedestrianGateOpen:true,garageGateOpen:true},{pedestrianGateOpen:false,garageGateOpen:true},{pedestrianGateOpen:true,garageGateOpen:false}]){
    const {settings,data}=build(options),walk=createWalkNavigation(data,settings);
    for(const [x,key]of [[5,'pedestrianGateOpen'],[10.1,'garageGateOpen'],[13.5,'garageGateOpen']]){
      const start=walk.locate([x,terrainAt(x,1.7,data)+1.57,1.7]);assert.ok(start,'The approach starting point is walkable');
      const end=walk.move(start.position,[0,0,-1.62]);
      if(settings[key])close(end.position[2],.08,'Open gate permits crossing its actual fence line');
      else{assert.ok(end.position[2]>.4,'Closed leaf stops the body before the fence line');assert.match(walk.getDiagnostics().lastBlocking,/front-(pedestrian|vehicle)-opening/);}
      const free=walk.moveFree(start.position,[0,0,-1.62],{floorHint:start.floor});
      close(free.position[2],.08,'Free exploration remains unrestricted with either gate state');
    }
  }
});

test('registered shade and visibility geometry agrees on a real gate board and its adjacent open gap',()=>{
  const {settings,data}=build({pedestrianGateOpen:false,hedgeFront:0,hedgeLeft:0,hedgeRight:0,hedgeRear:0,canopyEnabled:false});
  const layout=boundaryFenceLayout(settings,data),members=layout.members.filter(m=>m.gateId==='front-pedestrian-opening'&&m.part==='infill').sort((a,b)=>a.baseZ-b.baseZ);
  const board=members[1],xy=[(board.a[0]+board.b[0])/2,(board.a[1]+board.b[1])/2];
  const boardZ=(board.bottomA+board.bottomB+board.topA+board.topB)/4,gapZ=(members[1].topZ+members[2].baseZ)/2;
  const sunGeometry=prepareSunGeometry(settings,data),ids=new Set(layout.members.map(m=>m.id)),occluders=sunGeometry.occluders.filter(o=>ids.has(o.id));
  assert.equal(occluders.length,layout.members.length,'Every detailed member is registered once for sunlight');
  for(const [z,blocked]of [[boardZ,true],[gapZ,false]]){
    const origin=[xy[0],xy[1]+.6,z],target=[xy[0],xy[1]-.6,z];
    const sight=firstBoundaryIntersection(origin,target,layout),shade=firstSunBlocker(origin,[0,-1,0],occluders);
    assert.equal(Boolean(sight),blocked);assert.equal(Boolean(shade),blocked);
    if(blocked)close(shade.distance,sight.t*1.2,'Sunlight uses the exact same sloping solid');
    const probe={...data,buildings:[{id:'gate-probe',label:'Gate probe',kind:'target',footprint:[[xy[0]-.1,-3.2],[xy[0]+.1,-3.2],[xy[0]+.1,-3],[xy[0]-.1,-3]],
      baseZ:0,roofZ:z+1,roofSampleCount:1,samples:[[xy[0],-3,z]],highFeatures:[]}]};
    const result=analyzeVisibility(origin,settings,probe);
    assert.equal(result.rays.length,1);assert.equal(result.rays[0].visible,!blocked);
    if(blocked)assert.equal(result.rays[0].blockedBy,'boundary-fence');
  }
  const opened=prepareSunGeometry({...settings,pedestrianGateOpen:true},data);
  assert.notEqual(opened,sunGeometry,'Gate state invalidates the shade geometry cache');
  assert.notDeepEqual(opened.occluders.filter(o=>o.id.startsWith('front-pedestrian-opening')).map(o=>o.bounds),
    sunGeometry.occluders.filter(o=>o.id.startsWith('front-pedestrian-opening')).map(o=>o.bounds));
});

test('fence and gates are one quote-only package, counted once even alongside a separate garage quote',()=>{
  const {settings,data}=build({costContingency:0,costBoundaryFenceQuote:0,costBasementGarageQuote:250000,costStyleUpgradeQuote:10000,costUsePlanningAllowances:true});
  const none=estimateBoundaryFenceCosts(settings,data);assert.equal(none.status,'quote-required');assert.equal(none.unquoted.length,1);
  assert.deepEqual(none.knownBase,{low:0,high:0});assert.equal(none.rows.length,1);assert.equal(none.rows[0].key,'costBoundaryFenceQuote');
  const base=estimateCosts(settings,data),quoted=estimateCosts({...settings,costBoundaryFenceQuote:88000},data);
  assert.equal(quoted.boundaryFence.rows.length,1);assert.deepEqual(quoted.boundaryFence.knownBase,{low:88000,high:88000});
  close(quoted.knownSubtotal.low-base.knownSubtotal.low,88000);close(quoted.knownSubtotal.high-base.knownSubtotal.high,88000);
  assert.deepEqual(quoted.basementGarage.knownBase,base.basementGarage.knownBase,'Changing the fence quote does not change the garage amount');
  const hidden=estimateCosts({...settings,perimeterFenceEnabled:false,costBoundaryFenceQuote:88000},data);
  const hiddenUnquoted=estimateCosts({...settings,perimeterFenceEnabled:false,costBoundaryFenceQuote:0},data);
  assert.equal(hidden.boundaryFence.enabled,false);assert.equal(hidden.boundaryFence.rows.length,0);
  assert.deepEqual(hidden.knownSubtotal,hiddenUnquoted.knownSubtotal,'A retained quote is excluded while its fence proposal is hidden');
  assert.equal(base.garden.quantities.gateFixtureCount,2);assert.equal(hidden.garden.quantities.gateFixtureCount,0);
  const shownLighting=base.garden.rows.find(r=>r.key==='costGardenLighting').cost;
  const hiddenLighting=hidden.garden.rows.find(r=>r.key==='costGardenLighting').cost;
  for(const bound of ['low','high'])close(base.knownSubtotal[bound]-hidden.knownSubtotal[bound],shownLighting[bound]-hiddenLighting[bound],
    'Only the two removed gate lights change the unquoted planning allowance');
});

test('fence visibility and independent gate states survive share links and saved designs, including explicit false',()=>{
  for(const flags of [{perimeterFenceEnabled:true,pedestrianGateOpen:false,garageGateOpen:true},
    {perimeterFenceEnabled:true,pedestrianGateOpen:true,garageGateOpen:false},
    {perimeterFenceEnabled:false,pedestrianGateOpen:false,garageGateOpen:false}]){
    const input=model.sanitizeState({...model.DEFAULTS,...flags,costBoundaryFenceQuote:76500});
    for(const restored of [model.decodeState(model.encodeState(input)),model.migrateSavedState(input,STATE_VERSION)]){
      for(const [key,value]of Object.entries(flags))assert.equal(restored[key],value,key);
      assert.equal(restored.costBoundaryFenceQuote,76500);
    }
  }
});

test('the Sternicza boundary proposal stays disabled for the other properties, even with imported enabled flags or quotes',()=>{
  for(const name of ['korzeniowskiego-40.json','nadmorska-17.json']){
    const data=read(name),m=createStateModel(getSiteProfile(data.site.id,data)),settings=m.sanitizeState({perimeterFenceEnabled:true,pedestrianGateOpen:false,garageGateOpen:false,costBoundaryFenceQuote:99000});
    assert.equal(m.DEFAULTS.perimeterFenceEnabled,false);assert.equal(settings.perimeterFenceEnabled,false);
    assert.equal(boundaryFenceLayout(settings,data).members.length,0);
    const cost=estimateBoundaryFenceCosts(settings,data);assert.equal(cost.status,'none');assert.equal(cost.rows.length,0);assert.deepEqual(cost.knownBase,{low:0,high:0});
  }
});
