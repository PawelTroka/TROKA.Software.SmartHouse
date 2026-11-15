import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStateModel,PRESETS,STATE_VERSION} from '../src/state.js';
import {getSiteProfile,resolveSiteId} from '../src/sites.js';
import {poolBounds} from '../src/garden-program.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const profile=getSiteProfile('sternicza-11',data),model=createStateModel(profile);
const upperIds=['first-garden-seated','first-garden-standing','first-street-seated','first-street-standing',
  'attic-garden-seated','attic-garden-standing','attic-street-seated','attic-street-standing'];
const lighting={nightGardenLights:false,nightWindowLights:true,nightGardenIntensity:42,
  nightWindowIntensity:81,nightWindowActivity:58};

test('all eight upper-room viewpoints and night settings survive shared links and saved designs',()=>{
  for(const preset of upperIds){
    assert.ok(PRESETS.includes(preset),preset);
    const current=model.sanitizeState({...model.DEFAULTS,...lighting,preset,mode:'eye',firstFloorRise:3.2,atticRise:6.65,
      eyeHeight:preset.endsWith('seated')?1.2:1.65,lookYaw:preset.includes('street')?180:0,
      sunDate:'2026-11-15',sunMinutes:1410,sunEnabled:true});
    const encoded=model.encodeState(current);
    assert.equal(new URLSearchParams(encoded).get('v'),String(STATE_VERSION));
    assert.deepEqual(model.decodeState(encoded),current);
    assert.deepEqual(model.migrateSavedState(current,STATE_VERSION),current);
    assert.equal(resolveSiteId('?site=korzeniowskiego-40','#'+encoded),'sternicza-11');
  }
});

test('upper-storey defaults are editable assumptions above the living floor and preserve level order',()=>{
  assert.equal(model.DEFAULTS.firstFloorRise,3);assert.equal(model.DEFAULTS.atticRise,6);
  const edited=model.sanitizeState({floorHeight:1.55,firstFloorRise:3.6,atticRise:7.1});
  assert.equal(edited.floorHeight,1.55);assert.equal(edited.firstFloorRise,3.6);assert.equal(edited.atticRise,7.1);
  const crossing=model.sanitizeState({firstFloorRise:4.5,atticRise:4.5});
  assert.ok(crossing.atticRise>=crossing.firstFloorRise+.5,'The attic cannot sit at or below the first-floor level');
  for(const fields of [{firstFloorRise:-20,atticRise:90},{firstFloorRise:NaN,atticRise:Infinity},
    {firstFloorRise:'3.3',atticRise:null}]){
    const state=model.sanitizeState(fields);
    assert.ok(state.firstFloorRise>=2&&state.firstFloorRise<=4.5);
    assert.ok(state.atticRise>=4.5&&state.atticRise<=9);
    assert.ok(state.atticRise>=state.firstFloorRise+.5);
  }
});

test('night settings reject invalid types and clamp numerical percentages without changing solar or planting settings',()=>{
  const state=model.sanitizeState({...model.DEFAULTS,nightGardenLights:'false',nightWindowLights:0,
    nightGardenIntensity:-20,nightWindowIntensity:500,nightWindowActivity:NaN});
  assert.equal(state.nightGardenLights,true);assert.equal(state.nightWindowLights,true);
  assert.equal(state.nightGardenIntensity,0);assert.equal(state.nightWindowIntensity,100);
  assert.equal(state.nightWindowActivity,70);
  assert.deepEqual(state.screeningTrees,model.DEFAULTS.screeningTrees);
  assert.equal(state.sunDate,model.DEFAULTS.sunDate);assert.equal(state.sunMinutes,model.DEFAULTS.sunMinutes);
});

test('v18 designs retain existing custom trees, empty planting, layout, budget and viewpoint when night options are added',()=>{
  const tree={...model.DEFAULTS.screeningTrees[0],id:'my-excelsa',x:17.8,y:30.4,height:8.4,
    crownWidth:2.2,crownDepth:2.4,rotation:22,unitPrice:26500,enabled:false};
  for(const trees of [[],[tree]]){
    const saved={siteId:'sternicza-11',gardenProgram:'spa-pool-grove',screeningTrees:trees,hedgeFullPerimeter:true,
      hedgeFront:3.4,hedgeRear:4.1,costSpaPool:199000,costGardenLighting:18500,
      preset:'jacuzzi',eyeHeight:.85,lookYaw:37,lookPitch:4,mode:'eye',sunDate:'2026-06-21',sunMinutes:1080};
    const params=new URLSearchParams({v:'18',site:saved.siteId,
      ...Object.fromEntries(Object.entries(saved).filter(([key])=>!['siteId','screeningTrees'].includes(key))),
      screeningTrees:JSON.stringify(trees)});
    for(const restored of [model.decodeState(params.toString()),model.migrateSavedState(saved,18)]){
      for(const [key,value] of Object.entries(saved))assert.deepEqual(restored[key],value,key);
      assert.equal(restored.firstFloorRise,3);assert.equal(restored.atticRise,6);
      assert.equal(restored.nightGardenLights,true);assert.equal(restored.nightWindowLights,true);
      assert.deepEqual(model.decodeState(model.encodeState(restored)),restored);
      assert.equal(poolBounds(restored,data).length,8);
    }
  }
});

test('sparse v18 designs still load the published Excelsa layout and pool after the lighting release',()=>{
  for(const state of [model.decodeState('v=18&site=sternicza-11'),model.migrateSavedState({siteId:'sternicza-11'},18)]){
    assert.equal(state.gardenProgram,'spa-pool-grove');assert.equal(state.hedgeFullPerimeter,true);
    assert.deepEqual(state.screeningTrees.map(tree=>[tree.x,tree.y]),[[19.3,30.2],[13.8,35.8],[18.45,35.57]]);
    assert.ok(state.screeningTrees.every(tree=>tree.typeId==='thuja-excelsa-9m'&&tree.height===9&&tree.crownWidth===2));
    assert.equal(poolBounds(state,data).length,8);
  }
});

test('planting and hedge scenarios retain upper-floor calibration and the chosen evening atmosphere',()=>{
  const current=model.sanitizeState({...model.DEFAULTS,...lighting,preset:'attic-street-standing',mode:'eye',
    eyeHeight:1.65,lookYaw:180,firstFloorRise:3.15,atticRise:6.5,sunDate:'2026-10-21',sunMinutes:1285});
  for(const name of ['default','starter','raised','tall','canopy']){
    const next=model.scenarioState(name,current);
    for(const key of ['preset','mode','eyeHeight','lookYaw','firstFloorRise','atticRise','sunDate','sunMinutes',...Object.keys(lighting)])
      assert.equal(next[key],current[key],name+': '+key);
  }
});
