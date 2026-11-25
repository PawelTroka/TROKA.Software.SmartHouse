import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStateModel,STATE_VERSION} from '../src/state.js';
import {getSiteProfile,resolveSiteId} from '../src/sites.js';
import {DESIGN_STYLES} from '../src/design-styles.js';
import {applyPlanExterior,planRegistrationSummary} from '../src/plan-exterior.js';
import {houseAppearanceLayout} from '../src/house-appearance.js';
import {terraceCover} from '../src/geometry.js';
import {garageLayout} from '../src/garage-ramp.js';
import {garageClearanceResult} from '../src/garage-controls.js';
import {terrainAt} from '../src/geometry.js';
import {changePresentationSettings} from '../src/studio-state.js';
import {getHouseFloorPlan} from '../src/house-model.js';
const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const model=createStateModel(getSiteProfile('sternicza-11',data));

test('one whole-house style and each floor survive save/share with their linked exterior settings',()=>{
  for(const floor of ['basement','ground','first','attic'])for(const style of DESIGN_STYLES.map(s=>s.id)){
    const state=model.sanitizeState({...changePresentationSettings(model.DEFAULTS,{designStyle:style}),interiorEnabled:true,interiorFloor:floor,
      interiorView:'room',interiorRoomId:'master',interiorFurniture:false,interiorChanges:true});
    const roundtrip=model.decodeState(model.encodeState(state));
    assert.deepEqual(roundtrip,state);assert.deepEqual(model.migrateSavedState(state,STATE_VERSION),state);
    assert.equal(roundtrip.garageSpaces,2);assert.equal(roundtrip.interiorStyle,'follow');
    assert.equal(roundtrip.styleHouseFinish,style!=='current');assert.equal(roundtrip.planExteriorApplied,style!=='current');
    assert.equal(roundtrip.interiorLayout,style==='current'?'existing':'renovation');
    assert.equal(roundtrip.terraceCoverType,style==='current'?'canopy':'balcony');
  }
});
test('new drawing levels do not rewrite sparse historical designs',()=>{
  assert.equal(model.DEFAULTS.firstFloorRise,3.05);assert.equal(model.DEFAULTS.atticRise,5.75);assert.equal(model.DEFAULTS.garageSlabThickness,.30);
  for(const version of [18,22,23,24,25]){
    const old=model.decodeState(`v=${version}&site=sternicza-11&interiorEnabled=true&planExteriorApplied=true`);
    assert.equal(old.firstFloorRise,3);assert.equal(old.atticRise,6);assert.equal(old.garageSlabThickness,.25);
    assert.equal(old.interiorEnabled,false);assert.equal(old.planExteriorApplied,false);assert.equal(old.garageSpaces,2);
    assert.deepEqual(model.decodeState(model.encodeState(old)),old);
  }
});
test('short current-version style links adopt the shared decks and retain explicit user overrides',()=>{
  const state=model.decodeState(`v=${STATE_VERSION}&site=sternicza-11&designStyle=japandi&interiorEnabled=true`);
  assert.equal(state.interiorLayout,'renovation');assert.equal(state.canopyEnabled,true);assert.equal(state.terraceCoverType,'balcony');
  assert.equal(state.canopyWidth,10.77);assert.equal(state.terraceWidth,10.77);assert.equal(state.canopyDepth,4);assert.equal(state.terraceDepth,4);
  const altered=model.decodeState(`v=${STATE_VERSION}&site=sternicza-11&designStyle=japandi&canopyDepth=3.2&canopyEnabled=false`);
  assert.equal(altered.canopyDepth,3.2);assert.equal(altered.canopyEnabled,false);assert.equal(altered.terraceWidth,10.77);
  assert.deepEqual(model.decodeState(model.encodeState(altered)),altered);
});
test('interiors reject executable fields and remain unavailable on unsurveyed properties',()=>{
  const bad=model.sanitizeState({interiorEnabled:'true',interiorLayout:'demolish',interiorStyle:'<script>',interiorRoomId:'<svg onload=x>',interiorView:'unknown'});
  assert.equal(bad.interiorEnabled,false);assert.equal(bad.interiorRoomId,'');assert.equal(bad.interiorStyle,'follow');
  for(const siteId of ['korzeniowskiego-40','nadmorska-17']){
    const other=createStateModel(getSiteProfile(siteId));
    assert.equal(other.sanitizeState({interiorEnabled:true,planExteriorApplied:true}).interiorEnabled,false);
    assert.equal(other.sanitizeState({interiorEnabled:true,planExteriorApplied:true}).planExteriorApplied,false);
    assert.equal(resolveSiteId('?site=sternicza-11',`#v=26&site=${siteId}`),siteId);
  }
});
test('marked outdoor dimensions share the registered house and preserve its source survey',()=>{
  const settings=model.sanitizeState({...model.DEFAULTS,designStyle:'hidden-bali',planExteriorApplied:true,terraceWidth:10.77,terraceDepth:4,
    canopyEnabled:true,terraceCoverType:'balcony',canopyWidth:10.77,canopyDepth:4});
  const applied=applyPlanExterior(data,settings),cover=terraceCover(settings,applied),facade=houseAppearanceLayout(applied,settings);
  assert.equal(applied.site.house.sourceFootprint,data.site.house.footprint);assert.equal(applied.buildings,data.buildings);
  assert.equal(applied.site.terrace.width,10.77);assert.equal(data.site.terrace.width,8.5);
  assert.equal(applyPlanExterior(data,settings),applied,'Avoid rebuilding the world on unrelated interior updates');
  assert.equal(cover.deckArea,43.08);assert.equal(cover.depth,4);
  const doors=facade.windows.filter(w=>w.id.startsWith('rear-balcony-room-'));
  const first=getHouseFloorPlan({floor:'first',settings,data:applied}),ground=getHouseFloorPlan({floor:'ground',settings,data:applied});
  const planDoors=first.walls.find(w=>w.id==='balcony-facade').openings;
  assert.equal(doors.length,3);
  assert.deepEqual(doors.map(d=>[d.width,d.height,d.lo]),planDoors.map(d=>[d.width,d.height,d.offset]));
  assert.ok(doors.every(d=>d.width>1.2&&d.height>2.25),'The selected renovation enlarges actual apertures in both viewers');
  const planGarden=ground.walls.find(w=>w.id==='garden-hst').openings;
  assert.deepEqual(facade.rearBays.map(w=>[w.width,w.height,w.lo]),planGarden.map(w=>[w.width,w.height,w.offset]));
  assert.ok(doors[0].position[0]>doors[2].position[0],'Garden-up paper orientation reverses site horizontal coordinates');
  const registration=planRegistrationSummary(data);
  assert.ok(registration.mapped.mainWidth>11&&registration.mapped.mainWidth<11.02);
  assert.equal(registration.drawing.mainWidth,10.77);
});

test('v26 independent interior style migrates into one shared renovation and Current is truly original',()=>{
  const state=model.decodeState('v=26&site=sternicza-11&interiorEnabled=true&interiorStyle=hidden-bali&interiorFloor=first');
  assert.equal(state.designStyle,'hidden-bali');assert.equal(state.interiorStyle,'follow');assert.equal(state.interiorLayout,'renovation');
  assert.equal(state.canopyEnabled,true);assert.equal(state.canopyWidth,10.77);assert.equal(state.canopyDepth,4);
  const original=model.sanitizeState(changePresentationSettings(state,{designStyle:'current'}));
  assert.equal(original.interiorLayout,'existing');assert.equal(original.planExteriorApplied,false);assert.equal(original.canopyEnabled,false);
  assert.equal(getHouseFloorPlan({floor:'first',settings:original,data}).walls.flatMap(w=>w.openings).filter(o=>o.type==='balcony-door').length,0);
});
test('two-car ramp clearance is explicitly separated from new existing-structure conflicts',()=>{
  const settings={...model.DEFAULTS,basementGarageEnabled:true};
  const layout=garageLayout(settings,data,{terrainAt});
  assert.equal(layout.parking.spaces,2);assert.equal(layout.clearWidth,5.8);
  assert.ok(layout.documentedInterior.conflicts.some(item=>item.kind==='stair'));
  assert.ok(layout.documentedInterior.conflicts.some(item=>item.kind==='flue'));
  assert.equal(layout.documentedInterior.existingClearHeight,1.7);
  assert.ok(Math.abs(layout.documentedInterior.additionalLowering-.6)<1e-8);
  assert.equal(layout.assessment.structuralRouteClear,false);assert.equal(layout.assessment.conversionPass,false);
  if(layout.assessment.passes)assert.equal(garageClearanceResult(layout).status,'structure-conflict');
});
test('house-style and original-layout transitions retain the independently selected two-car proposal',()=>{
  for(const enabled of [true,false]){
    let state=model.sanitizeState({...model.DEFAULTS,basementGarageEnabled:enabled,interiorEnabled:true,interiorFloor:'basement',
      garageRampWidth:6.1,garageInsideRun:2.4,garageProgress:78,garageReverse:true});
    const before=Object.fromEntries(['basementGarageEnabled','garageSpaces','garageRampWidth','garageInsideRun','garageProgress','garageReverse']
      .map(key=>[key,state[key]]));
    for(const patch of [{interiorLayout:'renovation'},...DESIGN_STYLES.map(style=>({designStyle:style.id})),
      {interiorLayout:'existing'},{interiorLayout:'renovation'},{designStyle:'current'}]){
      state=model.sanitizeState(changePresentationSettings(state,patch));
      for(const [key,value] of Object.entries(before))assert.equal(state[key],value,`${JSON.stringify(patch)} preserves ${key}`);
      const basement=getHouseFloorPlan({floor:'basement',settings:state,data});
      assert.equal(basement.fixtures.filter(f=>f.kind==='car').length,enabled?2:0);
      assert.equal(basement.walls.some(w=>w.id==='garage-portal'),enabled);
      assert.deepEqual(model.decodeState(model.encodeState(state)),state);
    }
  }
});
