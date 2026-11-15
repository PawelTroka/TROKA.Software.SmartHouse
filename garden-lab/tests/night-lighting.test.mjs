import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nightLightingState,isWindowLit} from '../src/night-lighting.js';
import {contextFacadePlacements} from '../src/scene.js';
import {sunForSettings} from '../src/solar.js';
import {createGardenNightLighting} from '../src/scene-night-lights.js';
import {createStateModel} from '../src/state.js';
import {getSiteProfile} from '../src/sites.js';

const settings={sunEnabled:true,nightGardenLights:true,nightWindowLights:true,
  nightGardenIntensity:75,nightWindowActivity:35,nightWindowIntensity:60};
const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const stateAt=elevation=>nightLightingState({enabled:true,elevation},settings);

test('garden and neighbouring window lights stay off in daylight and reach separate dimmer settings after dark',()=>{
  for(const elevation of [1,12,63]){
    const state=stateAt(elevation);
    assert.equal(state.activation,0);
    assert.equal(state.gardenStrength,0);
    assert.equal(state.windowStrength,0);
  }
  for(const elevation of [-6,-20,-70]){
    const state=stateAt(elevation);
    assert.equal(state.activation,1);
    assert.equal(state.gardenStrength,.75);
    assert.equal(state.windowStrength,.6);
    assert.equal(state.windowActivity,.35);
  }
});

test('the twilight transition follows the calculated sun, is continuous and does not depend on arbitrary wall-clock hours',()=>{
  const descending=[1,.5,0,-1,-2,-3,-4,-5,-6].map(stateAt);
  descending.slice(1).forEach((state,index)=>assert.ok(state.activation>=descending[index].activation));
  assert.ok(stateAt(-2.5).activation>0&&stateAt(-2.5).activation<1);
  assert.ok(Math.abs(stateAt(-2.5).activation-stateAt(-2.5001).activation)<.001);
  const summer={...settings,sunDate:'2026-06-21',sunMinutes:20*60};
  const winter={...summer,sunDate:'2026-12-21'};
  const summerState=nightLightingState(sunForSettings(summer,data),summer);
  const winterState=nightLightingState(sunForSettings(winter,data),winter);
  assert.equal(summerState.activation,0,'20:00 in Gdańsk midsummer still has daylight');
  assert.equal(winterState.activation,1,'The same local time in winter is dark');
});

test('garden and window controls act independently and the neutral daytime mode disables simulated lights',()=>{
  const night={enabled:true,elevation:-14};
  const gardenOff=nightLightingState(night,{...settings,nightGardenLights:false});
  assert.equal(gardenOff.gardenStrength,0);assert.equal(gardenOff.windowStrength,.6);
  const windowsOff=nightLightingState(night,{...settings,nightWindowLights:false});
  assert.equal(windowsOff.windowStrength,0);assert.equal(windowsOff.gardenStrength,.75);
  for(const [solar,values] of [[night,{...settings,sunEnabled:false}],[{...night,enabled:false},settings]]){
    const state=nightLightingState(solar,values);
    assert.equal(state.activation,0);assert.equal(state.gardenStrength,0);assert.equal(state.windowStrength,0);
  }
  assert.equal(nightLightingState(night,{...settings,nightGardenIntensity:0}).gardenStrength,0);
  assert.equal(nightLightingState(night,{...settings,nightWindowIntensity:0}).windowStrength,0);
});

test('lighting calculations reject unavailable solar elevation and keep malformed dimmers bounded',()=>{
  for(const solar of [undefined,null,{}, {elevation:NaN},{elevation:Infinity},{elevation:'-12'}]){
    const state=nightLightingState(solar,settings);
    assert.equal(state.activation,0);
    assert.equal(state.gardenStrength,0);assert.equal(state.windowStrength,0);
  }
  for(const bad of [-100,170,NaN,Infinity,null,'bright']){
    const state=nightLightingState({enabled:true,elevation:-12},{...settings,
      nightGardenIntensity:bad,nightWindowActivity:bad,nightWindowIntensity:bad});
    for(const value of Object.values(state))assert.ok(Number.isFinite(value)&&value>=0&&value<=1);
  }
});

test('illustrative window occupancy is deterministic, varied and monotonic as activity increases',()=>{
  const windows=Array.from({length:384},(_,index)=>({buildingId:'building-'+Math.floor(index/48),
    side:Math.floor(index/12)%4,floor:Math.floor(index/4)%3,column:index%4}));
  const before=structuredClone(windows),lit=windows.filter(window=>isWindowLit(window,.35));
  assert.ok(lit.length>384*.15&&lit.length<384*.55,'A moderate activity level should not light all or none of the windows');
  assert.equal(windows.filter(window=>isWindowLit(window,0)).length,0);
  assert.equal(windows.filter(window=>isWindowLit(window,1)).length,windows.length);
  for(const window of windows){
    assert.equal(isWindowLit(window,.35),isWindowLit({...window,x:999,y:-45,z:70,shade:5},.35),
      'Changing camera-independent drawing coordinates does not reshuffle who appears active');
    if(isWindowLit(window,.1))assert.equal(isWindowLit(window,.35),true);
    if(isWindowLit(window,.35))assert.equal(isWindowLit(window,.8),true);
  }
  assert.deepEqual(windows,before);
  assert.deepEqual([...windows].reverse().filter(window=>isWindowLit(window,.35)).reverse(),lit);
});

test('100 percent window activity still cannot create openings on the recorded blank 4h garden elevation',()=>{
  const building=data.buildings.find(item=>item.id==='building-4');
  const panes=contextFacadePlacements(building,[10,28],160,data.facadeOverrides['building-4']);
  const lit=panes.filter(pane=>isWindowLit(pane,1));
  assert.ok(lit.length>0,'The other, unrecorded elevations retain illustrative windows');
  assert.equal(lit.filter(pane=>pane.nx>.99).length,0);
  for(const pane of panes){
    assert.equal(pane.buildingId,building.id);
    for(const key of ['side','floor','column'])assert.ok(Number.isInteger(pane[key]),key);
  }
});

test('across-street windows retain occupancy when their rendering detail changes with distance',()=>{
  const building={id:'across-street-house',index:5,kind:'context',baseZ:2.7,roofZ:9.2,
    footprint:[[2,-25],[14,-25],[14,-16],[2,-16],[2,-25]]};
  const near=contextFacadePlacements(building,[10,15]),far=contextFacadePlacements(building,[10,100]);
  const key=pane=>[pane.buildingId,pane.side,pane.floor,pane.column].join(':');
  assert.ok(near.some(pane=>pane.detailed));assert.ok(far.every(pane=>!pane.detailed));
  assert.equal(new Set(near.map(key)).size,near.length,'Every pane needs a distinct stable occupancy identity');
  assert.deepEqual(near.filter(pane=>isWindowLit(pane,.5)).map(key),far.filter(pane=>isWindowLit(pane,.5)).map(key));
});

test('proposed garden fixtures keep finite positions and a bounded GPU light count on both property layouts',()=>{
  const other=JSON.parse(readFileSync(new URL('../data/korzeniowskiego-40.json',import.meta.url)));
  for(const siteData of [data,other]){
    const model=createStateModel(getSiteProfile(siteData.site.id,siteData));
    const lighting=createGardenNightLighting(model.DEFAULTS,siteData);
    try{
      const lights=[];lighting.group.traverse(object=>{if(object.isLight)lights.push(object);});
      assert.ok(lights.length>0&&lights.length<=12,'The default design must not add an unbounded light per facade pane');
      assert.equal(lighting.lightCount,lights.length);
      assert.ok(lights.filter(light=>light.castShadow).length<=3,'Only the limited tree uplights acquire local shadow maps');
      for(const fixture of lighting.fixtures)for(const key of ['x','y','z'])assert.ok(Number.isFinite(fixture[key]),fixture.kind+'.'+key);
      for(const light of lights){
        assert.ok(light.position.toArray().every(Number.isFinite),light.name);
        if(light.target)assert.ok(light.target.position.toArray().every(Number.isFinite),light.name+' target');
      }
      lighting.apply(.75);
      assert.ok(lights.every(light=>light.visible&&light.intensity>0&&Number.isFinite(light.intensity)));
      lighting.apply(0);
      assert.ok(lights.every(light=>!light.visible&&light.intensity===0),'Turning garden lights off removes every real local light');
    }finally{lighting.dispose();}
  }
});
