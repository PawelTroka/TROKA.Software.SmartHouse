import test from 'node:test';
import assert from 'node:assert/strict';
import {createStateModel,STATE_VERSION} from '../src/state.js';
import {getSiteProfile} from '../src/sites.js';
import {sanitizeInteriorState} from '../src/interior-state.js';
import {equipmentLabelRecords} from '../src/scene-equipment-labels.js';

const model=createStateModel(getSiteProfile('sternicza-11'));
test('new living-room choices and independent equipment labels survive sharing',()=>{
  assert.equal(STATE_VERSION,36);
  assert.equal(model.DEFAULTS.livingCinemaLayout,'right-media');
  assert.equal(model.DEFAULTS.showEquipmentLabels,true);
  for(const layout of ['right-media','left-media','garden-salon','crosswall-media','legacy']){
    const state=model.sanitizeState({...model.DEFAULTS,designStyle:'scandinavian',livingCinemaLayout:layout,showEquipmentLabels:false,showDimensions:true});
    const restored=model.decodeState(model.encodeState(state));
    assert.equal(restored.livingCinemaLayout,layout);assert.equal(restored.showEquipmentLabels,false);assert.equal(restored.showDimensions,true);
  }
});
test('older links and comparisons retain their living arrangement, while only active migration adopts A',()=>{
  const old=model.decodeState('#v=35&site=sternicza-11&designStyle=scandinavian');
  assert.equal(old.livingCinemaLayout,'legacy');assert.equal(old.showEquipmentLabels,false);
  const input={siteId:'sternicza-11',designStyle:'scandinavian',poolX:14.9,showDimensions:false,pedestrianGateOpen:true};
  const archived=model.migrateSavedState(input,35),active=model.migrateSavedState(input,35,{adoptCinemaKitchen:true});
  assert.equal(archived.livingCinemaLayout,'legacy');assert.equal(active.livingCinemaLayout,'right-media');assert.equal(active.showEquipmentLabels,true);
  for(const key of ['poolX','showDimensions','pedestrianGateOpen','screeningTrees'])assert.deepEqual(active[key],archived[key]);
  const chosen=model.migrateSavedState({...input,livingCinemaLayout:'garden-salon',showEquipmentLabels:false},35,{adoptCinemaKitchen:true});
  assert.equal(chosen.livingCinemaLayout,'garden-salon');assert.equal(chosen.showEquipmentLabels,false);
});
test('invalid layout and label values cannot enter persisted interior state',()=>{
  const state=sanitizeInteriorState({livingCinemaLayout:'unknown',showEquipmentLabels:'false'});
  assert.equal(state.livingCinemaLayout,'right-media');assert.equal(state.showEquipmentLabels,true);
});
test('hidden appliance identification anchors are on the accessible front face and correct storey',()=>{
  const fixture={id:'dw',x:1,z:2,width:.65,depth:.60,front:[1,0],equipmentLabel:{title:'Dishwasher',detail:'60 cm · concealed',anchorHeight:.62}};
  const records=equipmentLabelRecords({floor:'first',elevation:3.05,fixtures:[fixture]});
  assert.equal(records.length,1);assert.equal(records[0].title,'Dishwasher');
  assert.ok(records[0].anchor[0]>1+.65/2);assert.equal(records[0].anchor[2],2);assert.equal(records[0].anchor[1],3.67);
  const explicit=equipmentLabelRecords({floor:'ground',elevation:0,fixtures:[{...fixture,equipmentLabel:{...fixture.equipmentLabel,anchor:[2,.8,3]}}]});
  assert.deepEqual(explicit[0].anchor,[2,.8,3]);
});
