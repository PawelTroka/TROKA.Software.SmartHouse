import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nightLightingState,NIGHT_DEFAULTS} from '../src/night-lighting.js';
import {createStateModel,STATE_VERSION} from '../src/state.js';
import {getSiteProfile} from '../src/sites.js';

const additions=['nightPendantLights','nightHedgeLights','nightPendantIntensity','nightHedgeIntensity'];
const previousPendantDefaults={nightPendantLights:true,nightHedgeLights:true,nightPendantIntensity:65,nightHedgeIntensity:55};
const withoutAdditions=state=>Object.fromEntries(Object.entries(state).filter(([key])=>!additions.includes(key)));
const night={enabled:true,elevation:-12};
const values={...NIGHT_DEFAULTS,sunEnabled:true};

for(const [id,file] of [['sternicza-11','site-data.json'],['korzeniowskiego-40','korzeniowskiego-40.json'],['nadmorska-17','nadmorska-17.json']]){
  const data=JSON.parse(readFileSync(new URL('../data/'+file,import.meta.url)));
  const model=createStateModel(getSiteProfile(id,data));
  const publishedDefaults=Object.freeze({...model.DEFAULTS,poolFreeboard:.02,
    ...(id==='sternicza-11'?{terraceDepth:4.2,canopyDepth:4.2,canopyHeight:2.7,canopyEnabled:false,jacuzziOverflow:false}:{}),
    terraceCoverType:'canopy',nightWindowActivity:35,...previousPendantDefaults});
  test(id+': existing version-19 saved and shared designs retain their published pendant defaults without moving the design',()=>{
    const original=model.sanitizeState({...publishedDefaults,hedgeRear:5.1,hedgeLeft:3.7,gardenRaise:.35,
      terraceDepth:4.5,floorHeight:1.9,preset:'first-street-standing',lookYaw:90,nightGardenLights:false,
      nightGardenIntensity:28,nightWindowIntensity:42,nightWindowActivity:35});
    const previousSaved=withoutAdditions(original);
    const previousShare=new URLSearchParams(model.encodeState(original));
    previousShare.set('v','19');
    for(const key of additions)previousShare.delete(key);
    for(const upgraded of [model.migrateSavedState(previousSaved,19),model.decodeState(previousShare.toString())]){
      assert.deepEqual(withoutAdditions(upgraded),previousSaved,'Planting, levels, viewpoint, budget and existing lighting must stay unchanged');
      for(const key of additions)assert.equal(upgraded[key],previousPendantDefaults[key],key);
      assert.equal(nightLightingState(night,upgraded).pendantStrength,0,'An existing off master stays off');
      assert.equal(nightLightingState(night,upgraded).hedgeStrength,0);
    }
    assert.equal(new URLSearchParams(model.encodeState(original)).get('v'),String(STATE_VERSION),
      'Re-sharing uses the current schema while the v19 design stays readable');
  });
  test(id+': pendant switches and dimmers survive saving, sharing and hedge scenarios independently',()=>{
    for(const changes of [
      {nightPendantLights:false,nightHedgeLights:true,nightPendantIntensity:0,nightHedgeIntensity:37},
      {nightPendantLights:true,nightHedgeLights:false,nightPendantIntensity:82,nightHedgeIntensity:0},
      {nightGardenLights:false,nightPendantLights:false,nightHedgeLights:false,nightPendantIntensity:19,nightHedgeIntensity:23},
    ]){
      const state=model.sanitizeState({...model.DEFAULTS,...changes});
      assert.deepEqual(model.decodeState(model.encodeState(state)),state);
      assert.deepEqual(model.migrateSavedState(state,STATE_VERSION),state);
      const hedges=model.scenarioState('tall',state);
      for(const key of [...additions,'nightGardenLights'])assert.equal(hedges[key],state[key],key);
    }
    const bounded=model.sanitizeState({...model.DEFAULTS,nightPendantIntensity:-5,nightHedgeIntensity:120,
      nightPendantLights:'false',nightHedgeLights:0});
    assert.equal(bounded.nightPendantIntensity,0);assert.equal(bounded.nightHedgeIntensity,100);
    assert.equal(bounded.nightPendantLights,true);assert.equal(bounded.nightHedgeLights,true);
  });
}

test('pendants and hedge lanterns have independent dimmers while the garden switch controls all three groups',()=>{
  const full=nightLightingState(night,values);
  assert.equal(full.gardenStrength,.75);assert.equal(full.pendantStrength,.8);assert.equal(full.hedgeStrength,.85);
  const accentsOff=nightLightingState(night,{...values,nightGardenIntensity:0});
  assert.equal(accentsOff.gardenStrength,0);assert.equal(accentsOff.pendantStrength,.8);assert.equal(accentsOff.hedgeStrength,.85);
  const pendantsOff=nightLightingState(night,{...values,nightPendantLights:false});
  assert.equal(pendantsOff.pendantStrength,0);assert.equal(pendantsOff.hedgeStrength,.85);assert.equal(pendantsOff.gardenStrength,.75);
  const hedgeOff=nightLightingState(night,{...values,nightHedgeLights:false});
  assert.equal(hedgeOff.hedgeStrength,0);assert.equal(hedgeOff.pendantStrength,.8);assert.equal(hedgeOff.gardenStrength,.75);
  const gardenOff=nightLightingState(night,{...values,nightGardenLights:false});
  for(const key of ['gardenStrength','pendantStrength','hedgeStrength'])assert.equal(gardenOff[key],0,key);
  assert.equal(gardenOff.windowStrength,.6,'The garden master never changes neighbouring windows');
  const windowsOff=nightLightingState(night,{...values,nightWindowLights:false});
  assert.equal(windowsOff.windowStrength,0);assert.equal(windowsOff.pendantStrength,.8);assert.equal(windowsOff.hedgeStrength,.85);
});

test('both hanging-light groups follow twilight and keep malformed dimmers finite',()=>{
  for(const [solar,settings] of [[{enabled:true,elevation:15},values],[night,{...values,sunEnabled:false}],
    [{enabled:false,elevation:-12},values],[{enabled:true,elevation:NaN},values]]){
    const light=nightLightingState(solar,settings);
    assert.equal(light.pendantStrength,0);assert.equal(light.hedgeStrength,0);
  }
  const dusk=nightLightingState({enabled:true,elevation:-2.5},values);
  assert.equal(dusk.activation,.5);assert.equal(dusk.pendantStrength,.4);assert.equal(dusk.hedgeStrength,.425);
  for(const bad of [-999,999,NaN,Infinity,null,'bright']){
    const light=nightLightingState(night,{...values,nightPendantIntensity:bad,nightHedgeIntensity:bad});
    for(const key of ['pendantStrength','hedgeStrength'])assert.ok(Number.isFinite(light[key])&&light[key]>=0&&light[key]<=1,key);
  }
  assert.equal(nightLightingState(night,{...values,nightPendantIntensity:0}).pendantStrength,0);
  assert.equal(nightLightingState(night,{...values,nightHedgeIntensity:0}).hedgeStrength,0);
});
