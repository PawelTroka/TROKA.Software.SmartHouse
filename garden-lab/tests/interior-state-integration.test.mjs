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
const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const model=createStateModel(getSiteProfile('sternicza-11',data));

test('interior layouts, every finish and each floor survive save/share without changing walls or exterior settings',()=>{
  for(const layout of ['existing','renovation'])for(const floor of ['basement','ground','first','attic'])for(const style of ['follow',...DESIGN_STYLES.map(s=>s.id)]){
    const state=model.sanitizeState({...model.DEFAULTS,interiorEnabled:true,interiorLayout:layout,interiorFloor:floor,
      interiorStyle:style,interiorView:'room',interiorRoomId:'master-bedroom',interiorFurniture:false,interiorChanges:true});
    const roundtrip=model.decodeState(model.encodeState(state));
    assert.deepEqual(roundtrip,state);assert.deepEqual(model.migrateSavedState(state,STATE_VERSION),state);
    assert.equal(roundtrip.terraceCoverType,'canopy');assert.equal(roundtrip.garageSpaces,2);
    assert.equal(roundtrip.styleHouseFinish,false);assert.equal(roundtrip.planExteriorApplied,false);
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
test('applying marked outdoor dimensions retains mapped buildings and aligns three balcony doors with the source rooms',()=>{
  const settings=model.sanitizeState({...model.DEFAULTS,planExteriorApplied:true,terraceWidth:10.77,terraceDepth:4,
    canopyEnabled:true,terraceCoverType:'balcony',canopyWidth:10.77,canopyDepth:4});
  const applied=applyPlanExterior(data,settings),cover=terraceCover(settings,applied),facade=houseAppearanceLayout(applied,settings);
  assert.equal(applied.site.house,data.site.house);assert.equal(applied.buildings,data.buildings);
  assert.equal(applied.site.terrace.width,10.77);assert.equal(data.site.terrace.width,8.5);
  assert.equal(applyPlanExterior(data,settings),applied,'Avoid rebuilding the world on unrelated interior updates');
  assert.equal(cover.deckArea,43.08);assert.equal(cover.depth,4);
  const doors=facade.windows.filter(w=>w.id.startsWith('rear-balcony-room-'));
  assert.equal(doors.length,3);assert.ok(doors.every(d=>d.width===1.2&&d.height===2.25));
  assert.equal(facade.rearBays.length,1);assert.equal(facade.rearBays[0].width,9.97);
  assert.ok(doors[0].position[0]>doors[2].position[0],'Garden-up paper orientation reverses site horizontal coordinates');
  const registration=planRegistrationSummary(data);
  assert.ok(registration.mapped.mainWidth>11&&registration.mapped.mainWidth<11.02);
  assert.equal(registration.drawing.mainWidth,10.77);
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
