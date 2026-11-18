import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStateModel,STATE_VERSION} from '../src/state.js';
import {getSiteProfile} from '../src/sites.js';
import {NIGHT_DEFAULTS,nightLightingState} from '../src/night-lighting.js';

const previous={nightWindowActivity:35,nightPendantIntensity:65,nightHedgeIntensity:55};
const current={nightWindowActivity:70,nightPendantIntensity:80,nightHedgeIntensity:85};
const withoutChangedLights=state=>Object.fromEntries(Object.entries(state).filter(([key])=>!Object.hasOwn(current,key)));

for(const [id,file] of [['sternicza-11','site-data.json'],['korzeniowskiego-40','korzeniowskiego-40.json'],['nadmorska-17','nadmorska-17.json']]){
  const data=JSON.parse(readFileSync(new URL('../data/'+file,import.meta.url)));
  const model=createStateModel(getSiteProfile(id,data));
  // A v19 fixture must retain its published non-lighting defaults even after
  // a later release changes the fresh terrace, cover and garage proposal.
  const publishedDefaults=Object.freeze({...model.DEFAULTS,poolFreeboard:.02,garageSlabThickness:.25,firstFloorRise:3,atticRise:6,
    ...(id==='sternicza-11'?{terraceDepth:4.2,canopyDepth:4.2,canopyHeight:2.7,canopyEnabled:false,jacuzziOverflow:false}:{}),
    terraceCoverType:'canopy',...previous});

  test(id+': fresh designs and current sparse links use the brighter, busier evening defaults',()=>{
    assert.ok(STATE_VERSION>=20);
    for(const [key,value] of Object.entries(current)){
      assert.equal(NIGHT_DEFAULTS[key],value,key);
      assert.equal(model.FIELDS[key].value,value,key);
      assert.equal(model.DEFAULTS[key],value,key);
    }
    assert.equal(model.DEFAULTS.nightGardenIntensity,75);
    assert.equal(model.DEFAULTS.nightWindowIntensity,60);
    assert.deepEqual(model.sanitizeState(),model.DEFAULTS);
    assert.deepEqual(model.decodeState(`v=${STATE_VERSION}&site=${id}`),model.DEFAULTS);
    assert.deepEqual(model.decodeState(model.encodeState(model.DEFAULTS)),model.DEFAULTS);
  });

  test(id+': historical sparse saves and links keep their previous lighting levels when re-shared',()=>{
    const firstVersion=id==='sternicza-11'?1:6;
    for(let version=firstVersion;version<=19;version++){
      for(const restored of [model.decodeState(`v=${version}&site=${id}`),model.migrateSavedState({siteId:id},version)]){
        for(const [key,value] of Object.entries(previous))assert.equal(restored[key],value,`v${version} ${key}`);
        const shared=model.encodeState(restored),params=new URLSearchParams(shared);
        assert.equal(params.get('v'),String(STATE_VERSION));
        for(const [key,value] of Object.entries(previous))assert.equal(params.get(key),String(value),`v${version} explicitly retains ${key}`);
        assert.deepEqual(model.decodeState(shared),restored,`v${version} is stable after re-sharing`);
        assert.deepEqual(model.migrateSavedState(restored,STATE_VERSION),restored,`v${version} is stable after saving as the current version`);
        if(version===19)assert.deepEqual(withoutChangedLights(restored),withoutChangedLights(publishedDefaults),
          'The new lighting defaults do not move the previously published garden, observer or quotes');
      }
    }
  });

  test(id+': explicit v19 off states, zero dimmers and edited levels survive migration with the complete garden',()=>{
    const variants=[
      {nightGardenLights:false,nightWindowLights:false,nightPendantLights:false,nightHedgeLights:false,
        nightWindowActivity:0,nightPendantIntensity:0,nightHedgeIntensity:0},
      {nightGardenLights:true,nightWindowLights:true,nightPendantLights:false,nightHedgeLights:true,
        nightWindowActivity:47,nightPendantIntensity:23,nightHedgeIntensity:61},
      {...current,nightGardenLights:false,nightWindowLights:true,nightPendantLights:true,nightHedgeLights:false},
    ];
    for(const changes of variants){
      const saved=model.sanitizeState({...publishedDefaults,...changes,hedgeRear:5.1,hedgeLeft:3.7,hedgeRight:4.2,
        gardenRaise:.35,terraceDepth:4.5,floorHeight:1.9,preset:'first-street-standing',lookYaw:90,
        mode:'eye',sunMinutes:1320,costGardenLighting:24600,screeningTrees:[]});
      const shared=new URLSearchParams(model.encodeState(saved));
      shared.set('v','19');
      // Values equal to the new defaults were optional in v20; an old link
      // that explicitly chose them must still retain those exact choices.
      for(const [key,value] of Object.entries(saved))if(key.startsWith('night'))shared.set(key,String(value));
      for(const restored of [model.migrateSavedState(saved,19),model.decodeState(shared.toString())]){
        assert.deepEqual(restored,saved);
        assert.deepEqual(model.decodeState(model.encodeState(restored)),saved);
        const night=nightLightingState({enabled:true,elevation:-12},restored);
        if(!saved.nightGardenLights)for(const key of ['gardenStrength','pendantStrength','hedgeStrength'])assert.equal(night[key],0);
        if(!saved.nightWindowLights)assert.equal(night.windowStrength,0);
      }
    }
  });
}

test('rendering fallbacks use the same defaults as new designs and retain explicit zero brightness',()=>{
  const night={enabled:true,elevation:-12};
  const defaults=nightLightingState(night);
  assert.equal(defaults.gardenStrength,.75);assert.equal(defaults.pendantStrength,.8);
  assert.equal(defaults.hedgeStrength,.85);assert.equal(defaults.windowStrength,.6);assert.equal(defaults.windowActivity,.7);
  for(const bad of [undefined,NaN,Infinity,null,'bright']){
    const state=nightLightingState(night,Object.fromEntries(Object.keys(NIGHT_DEFAULTS).filter(key=>typeof NIGHT_DEFAULTS[key]==='number').map(key=>[key,bad])));
    assert.deepEqual(state,defaults);
  }
  const dark=nightLightingState(night,{nightGardenIntensity:0,nightPendantIntensity:0,nightHedgeIntensity:0,nightWindowIntensity:0,nightWindowActivity:0});
  for(const key of ['gardenStrength','pendantStrength','hedgeStrength','windowStrength','windowActivity'])assert.equal(dark[key],0);
});
