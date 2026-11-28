import test from 'node:test';
import assert from 'node:assert/strict';
import {createStateModel,STATE_VERSION} from '../src/state.js';
import {getSiteProfile,resolveSiteId} from '../src/sites.js';

const model=createStateModel(getSiteProfile('sternicza-11'));
const withoutFeedback=state=>Object.fromEntries(Object.entries(state)
  .filter(([key])=>!['privateGardenSeating','bathroomPrivacyGlazing'].includes(key)));

test('new Sternicza designs adopt private seating and bathroom glazing without moving the chosen garden',()=>{
  assert.equal(STATE_VERSION,37);
  assert.equal(model.DEFAULTS.privateGardenSeating,true);
  assert.equal(model.DEFAULTS.bathroomPrivacyGlazing,true);
  assert.equal(model.DEFAULTS.poolSunbedSides,2,'The default retains three actual sunbeds');
  assert.deepEqual(model.decodeState(model.encodeState(model.DEFAULTS)),model.DEFAULTS);
  assert.equal(resolveSiteId('?site=nadmorska-17','#v=37&site=sternicza-11'),'sternicza-11');
});

test('archived links retain the previous seating and clear bathroom, while active adoption changes only the two refinements',()=>{
  const saved=model.sanitizeState({...model.DEFAULTS,privateGardenSeating:false,bathroomPrivacyGlazing:false,
    poolSunbedSides:3,designStyle:'scandinavian',livingCinemaLayout:'left-media',showEquipmentLabels:false,
    hedgeLeft:5.3,nightGardenIntensity:27,showDimensions:false});
  const snapshot=structuredClone(saved);
  for(const version of [35,36]){
    const archive=model.migrateSavedState(saved,version);
    const active=model.migrateSavedState(saved,version,{adoptPrivacyFeedback:true});
    assert.equal(archive.privateGardenSeating,false);assert.equal(archive.bathroomPrivacyGlazing,false);
    assert.equal(active.privateGardenSeating,true);assert.equal(active.bathroomPrivacyGlazing,true);
    assert.deepEqual(withoutFeedback(active),withoutFeedback(archive),`v${version} keeps all other choices`);
    const shared=model.decodeState(`v=${version}&site=sternicza-11&privateGardenSeating=true&bathroomPrivacyGlazing=true`);
    assert.equal(shared.privateGardenSeating,false);assert.equal(shared.bathroomPrivacyGlazing,false);
    assert.deepEqual(model.decodeState(model.encodeState(archive)),archive);
    assert.deepEqual(model.decodeState(model.encodeState(active)),active);
  }
  assert.deepEqual(saved,snapshot,'Adopting an active design does not mutate saved comparison A');
});

test('current independent choices survive saving and sharing without being adopted a second time',()=>{
  for(const privateGardenSeating of [false,true])for(const bathroomPrivacyGlazing of [false,true]){
    const state=model.sanitizeState({...model.DEFAULTS,privateGardenSeating,bathroomPrivacyGlazing,
      poolSunbedSides:1,designStyle:'hidden-bali'});
    const share=model.encodeState(state);
    assert.deepEqual(model.decodeState(share),state);
    assert.deepEqual(model.migrateSavedState(state,37,{adoptPrivacyFeedback:true}),state);
    if(!privateGardenSeating)assert.equal(new URLSearchParams(share).get('privateGardenSeating'),'false');
    if(!bathroomPrivacyGlazing)assert.equal(new URLSearchParams(share).get('bathroomPrivacyGlazing'),'false');
  }
});

test('the Sternicza privacy refinement cannot alter the other properties',()=>{
  for(const siteId of ['nadmorska-17','korzeniowskiego-40']){
    const other=createStateModel(getSiteProfile(siteId));
    assert.equal(other.DEFAULTS.privateGardenSeating,false);assert.equal(other.DEFAULTS.bathroomPrivacyGlazing,false);
    const injected={...other.DEFAULTS,privateGardenSeating:true,bathroomPrivacyGlazing:true};
    for(const restored of [other.sanitizeState(injected),other.decodeState(`v=37&site=${siteId}&privateGardenSeating=true&bathroomPrivacyGlazing=true`),
      other.migrateSavedState(injected,36,{adoptPrivacyFeedback:true})]){
      assert.equal(restored.privateGardenSeating,false);assert.equal(restored.bathroomPrivacyGlazing,false);
    }
  }
});
