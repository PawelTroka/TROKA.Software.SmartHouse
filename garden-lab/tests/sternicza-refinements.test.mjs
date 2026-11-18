import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStateModel,STATE_VERSION} from '../src/state.js';
import {getSiteProfile,resolveSiteId} from '../src/sites.js';
import {observerForPreset,spaLevels,terraceCover,frontHedgeLayout,hedgeSegments} from '../src/geometry.js';
import {poolBounds} from '../src/garden-program.js';
import {privacyPresetState,matchesPrivacyPreset} from '../src/privacy-options.js';
import {prepareSunGeometry} from '../src/shade.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const model=createStateModel(getSiteProfile('sternicza-11',data)),fresh=model.DEFAULTS;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('fresh Sternicza defaults match the requested terrace, infinity spa, canopy and two-car option',()=>{
  assert.equal(STATE_VERSION,24);
  for(const [key,value]of Object.entries({terraceDepth:4,jacuzziOverflow:true,canopyEnabled:true,
    canopyHeight:3,canopyDepth:4,terraceCoverType:'canopy',garageSpaces:2,garageRampWidth:5.8,basementGarageEnabled:false})){
    assert.equal(fresh[key],value,key);
    if(model.FIELDS[key])assert.equal(model.FIELDS[key].value,value,key+' control');
  }
  assert.deepEqual(model.decodeState('v=23&site=sternicza-11'),{...fresh,poolFreeboard:.02});
  assert.equal(fresh.poolFreeboard,.10);
  assert.equal(resolveSiteId('?site=nadmorska-17','#v=23&site=sternicza-11'),'sternicza-11');
});

test('sparse v20–22 designs retain their published terrace and single-car geometry',()=>{
  for(const version of [20,21,22])for(const restored of [model.decodeState(`v=${version}&site=sternicza-11`),model.migrateSavedState({siteId:'sternicza-11'},version)]){
    for(const [key,value]of Object.entries({terraceDepth:4.2,jacuzziOverflow:false,canopyEnabled:false,
      canopyHeight:2.7,canopyDepth:4.2,terraceCoverType:'canopy',garageSpaces:1,garageRampWidth:3.2}))assert.equal(restored[key],value,`v${version} ${key}`);
    assert.deepEqual(model.decodeState(model.encodeState(restored)),restored);
  }
  const old=model.decodeState('v=22&site=sternicza-11&basementGarageEnabled=true&garageRampWidth=3.6&canopyEnabled=true&canopyHeight=2.9&terraceDepth=4.8&jacuzziOverflow=true');
  assert.equal(old.basementGarageEnabled,true);assert.equal(old.garageSpaces,1);assert.equal(old.garageRampWidth,3.6);
  assert.equal(old.canopyHeight,2.9);assert.equal(old.terraceDepth,4.8);assert.equal(old.jacuzziOverflow,true);
});

test('swimming eye follows actual pool water and its own adjustable height',()=>{
  for(const gardenRaise of [0,.5,.9]){
    const state={...fresh,gardenRaise,preset:'pool',poolEyeAboveWater:.15,eyeHeight:1.8};
    const pool=poolBounds(state,data),eye=observerForPreset('pool',state,data),water=spaLevels(state,data).pool.waterZ;
    assert.ok(eye.x>pool.x&&eye.x<pool.x+pool.width&&eye.y>pool.y&&eye.y<pool.y+pool.length);
    near(eye.groundZ,water);near(eye.z,water+.15);near(eye.eyeHeight,.15);assert.equal(eye.surface,'pool-water');
    near(observerForPreset('pool',{...state,poolEyeAboveWater:.28},data).z,water+.28);
    assert.deepEqual(model.decodeState(model.encodeState(state)),state);
  }
});

test('balcony choice, first-floor eye and independent canopy height survive saved links',()=>{
  const state=model.sanitizeState({...fresh,terraceCoverType:'balcony',preset:'balcony',mode:'eye',eyeHeight:1.65,firstFloorRise:3.2,canopyHeight:2.6,costBalconyQuote:210000});
  const cover=terraceCover(state,data),eye=observerForPreset('balcony',state,data);
  near(eye.groundZ,cover.deckTopZ);near(eye.z,cover.deckTopZ+1.65);near(cover.deckArea,34);
  near(cover.deckTopZ-cover.floorZ,3.2);
  assert.deepEqual(model.decodeState(model.encodeState(state)),state);
  assert.equal(model.sanitizeState({...state,canopyEnabled:false}).preset,'terrace');
  assert.equal(model.sanitizeState({...state,terraceCoverType:'canopy'}).preset,'terrace');
});

test('front planting is continuous except exactly two distinct access gaps',()=>{
  for(const basementGarageEnabled of [false,true]){
    const state={...fresh,basementGarageEnabled},front=frontHedgeLayout(state,data);
    assert.equal(front.openings.length,2);
    const [pedestrian,vehicle]=front.openings;
    near(pedestrian.width,1.2);near(vehicle.width,basementGarageEnabled?6.6:4);
    assert.ok(vehicle.a[0]>pedestrian.b[0]+.1,'A planted strip separates the two entrances');
    const pieces=[...front.segments,...front.openings].sort((a,b)=>a.a[0]-b.a[0]);
    for(let i=1;i<pieces.length;i++){near(pieces[i-1].b[0],pieces[i].a[0]);near(pieces[i-1].b[1],pieces[i].a[1]);}
    assert.equal(hedgeSegments(state,data).filter(s=>s.side==='front').length,front.segments.length);
    near(pedestrian.a[0]+pedestrian.width/2,basementGarageEnabled?5:9.16);
  }
});

test('other properties retain their established cover defaults and cannot select the Sternicza balcony',()=>{
  for(const id of ['korzeniowskiego-40','nadmorska-17']){
    const other=JSON.parse(readFileSync(new URL(`../data/${id}.json`,import.meta.url)));
    const local=createStateModel(getSiteProfile(id,other));
    assert.equal(local.DEFAULTS.canopyEnabled,false);assert.equal(local.DEFAULTS.jacuzziOverflow,false);
    assert.equal(local.DEFAULTS.garageRampWidth,3.2);assert.equal(local.DEFAULTS.garageSpaces,1);
    assert.equal(local.sanitizeState({terraceCoverType:'balcony',canopyEnabled:true}).terraceCoverType,'canopy');
  }
});

test('changing the basement entrance refreshes the shaded front hedge geometry',()=>{
  const before=prepareSunGeometry(fresh,data),garage={...fresh,basementGarageEnabled:true};
  const after=prepareSunGeometry(garage,data);
  assert.notEqual(before,after);
  assert.notEqual(prepareSunGeometry({...garage,garageRampWidth:6.2},data),after);
  assert.equal(prepareSunGeometry({...garage,garageRampWidth:6.2},data),prepareSunGeometry({...garage,garageRampWidth:6.2},data));
});

test('the named canopy scenario replaces a balcony rather than mislabelling it',()=>{
  const balcony={...fresh,terraceCoverType:'balcony'};
  const selected=model.scenarioState('canopy',balcony);
  assert.equal(selected.canopyEnabled,true);assert.equal(selected.terraceCoverType,'canopy');
  assert.equal(model.matchesScenario('canopy',{...selected,terraceCoverType:'balcony'}),false);
  for(const id of ['spa','layered']){const privacy=privacyPresetState(id,balcony);assert.equal(privacy.terraceCoverType,'canopy');assert.equal(matchesPrivacyPreset(id,{...privacy,terraceCoverType:'balcony'}),false);}
});
