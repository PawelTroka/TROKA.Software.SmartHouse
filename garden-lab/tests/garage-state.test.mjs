import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStateModel,STATE_VERSION} from '../src/state.js';
import {getSiteProfile,resolveSiteId,SITE_OPTIONS} from '../src/sites.js';
import {GARAGE_FIELDS,GARAGE_DEFAULTS,GARAGE_PRESETS,garagePresetState,matchesGaragePreset,createGarageLayoutCache} from '../src/garage-options.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const garageKeys=Object.keys(GARAGE_DEFAULTS);
const withoutGarage=state=>Object.fromEntries(Object.entries(state).filter(([key])=>!garageKeys.includes(key)));
const models=SITE_OPTIONS.map(site=>{
  const data=JSON.parse(readFileSync(new URL('../'+site.dataPath,import.meta.url)));
  return {site,data,model:createStateModel(getSiteProfile(site.id,data))};
});

test('schema 22 keeps the basement off in every fresh property and resolves its share identity',()=>{
  assert.equal(STATE_VERSION,22);
  for(const {site,model} of models){
    assert.equal(model.DEFAULTS.basementGarageEnabled,false,site.id);
    assert.equal(model.sanitizeState().basementGarageEnabled,false,site.id);
    assert.deepEqual(model.decodeState(model.encodeState(model.DEFAULTS)),model.DEFAULTS);
    assert.equal(resolveSiteId('?site=sternicza-11',`#v=22&site=${site.id}`),site.id);
  }
});
test('v22 shares and saves retain garage dimensions, preview, explicit zeros and quote independently',()=>{
  const {model}=models[0];
  const dimensions=Object.fromEntries(Object.entries(GARAGE_FIELDS).map(([key,field])=>
    [key,Math.round((field.min+(field.max-field.min)*.37)*100)/100]));
  for(const patch of [
    {...dimensions,basementGarageEnabled:true,garageReverse:true,costBasementGarageQuote:438000},
    {...dimensions,basementGarageEnabled:false,garageReverse:false,garageExtraDepth:0,garageInsideRun:0,garageReserveMm:0,garageProgress:0,costBasementGarageQuote:0},
  ]){
    const state=model.sanitizeState({...model.DEFAULTS,...patch,floorHeight:1.55,gardenRaise:.35,
      privacyPergolaEnabled:true,spaScreensEnabled:true,nightHedgeIntensity:92,nightWindowActivity:79,sunMinutes:1410});
    assert.equal(state.costBasementGarageQuote,patch.costBasementGarageQuote);
    for(const restored of [model.decodeState(model.encodeState(state)),model.migrateSavedState(clone(state),22)]){
      assert.deepEqual(restored,state);
      assert.deepEqual(model.decodeState(model.encodeState(restored)),state,'Repeated share stays stable');
    }
    const saved=clone(state);model.sanitizeState(state).screeningTrees[0].x+=1;
    assert.deepEqual(state,saved,'Editing scenario B cannot mutate A');
  }
});
test('every v1–21 design keeps the basement absent despite unknown garage settings',()=>{
  for(const {site,model} of models){
    for(let version=site.id==='sternicza-11'?1:6;version<22;version++){
      const old={siteId:site.id,hedgeRear:4.7,gardenRaise:.35,floorHeight:1.6,
        canopyEnabled:true,nightGardenLights:false,nightWindowActivity:61,sunDate:'2028-09-20',sunMinutes:1337,
        privacyPergolaEnabled:true,privacyPergolaFoliage:true,spaScreensEnabled:true};
      const baseline=model.migrateSavedState(old,version);
      const injected={...old,basementGarageEnabled:true,garageClearHeight:2.95,garageSlabThickness:.44,
        garageExtraDepth:.9,garageInsideRun:2.9,garageReserveMm:1,garageProgress:99,garageReverse:true};
      const shared=new URLSearchParams({v:String(version),site:site.id,...Object.fromEntries(Object.entries(injected).filter(([key])=>key!=='siteId').map(([key,value])=>[key,String(value)]))});
      for(const restored of [model.migrateSavedState(injected,version),model.decodeState(shared.toString())]){
        for(const [key,value] of Object.entries(GARAGE_DEFAULTS))assert.equal(restored[key],value,`${site.id} v${version} ${key}`);
        assert.deepEqual(withoutGarage(restored),withoutGarage(baseline),`${site.id} v${version} retains the old design`);
      }
    }
  }
});
test('the basement cannot activate on Korzeniowskiego or Nadmorska through controls, links or saves',()=>{
  for(const {site,model} of models.slice(1)){
    const edited={...model.DEFAULTS,basementGarageEnabled:true,garageReverse:true,garageProgress:76};
    for(const restored of [model.sanitizeState(edited),model.migrateSavedState(edited,22),model.decodeState(`v=22&site=${site.id}&basementGarageEnabled=true`)]){
      assert.equal(restored.basementGarageEnabled,false,site.id);
    }
    for(const id of [...GARAGE_PRESETS.map(item=>item.id),'none']){
      assert.deepEqual(garagePresetState(id,model.DEFAULTS),model.DEFAULTS);
      assert.equal(matchesGaragePreset(id,model.DEFAULTS),false);
    }
  }
});
test('garage presets retain floor level, vehicle allowances, garden, lighting, quotes and view',()=>{
  const {model}=models[0];
  const current=model.sanitizeState({...model.DEFAULTS,floorHeight:1.7,garageClearanceMm:99.5,garageReserveMm:44,
    garageProgress:65,garageReverse:true,costBasementGarageQuote:512000,nightWindowActivity:82,
    privacyPergolaEnabled:true,preset:'attic-street-standing',mode:'eye',sunDate:'2028-10-17'});
  const preserve=['floorHeight','garageClearanceMm','garageReserveMm','garageProgress','garageReverse',
    'costBasementGarageQuote','nightWindowActivity','privacyPergolaEnabled','screeningTrees','gardenProgram','preset','mode','sunDate'];
  const original=clone(current);
  for(const id of [...GARAGE_PRESETS.map(item=>item.id),'none']){
    const selected=garagePresetState(id,current);
    for(const key of preserve)assert.deepEqual(selected[key],current[key],`${id} preserves ${key}`);
    assert.equal(matchesGaragePreset(id,selected),true,id);
    assert.deepEqual(model.decodeState(model.encodeState(selected)),selected);
  }
  assert.deepEqual(current,original);
  assert.deepEqual(garagePresetState('unknown',current),current);
  const raised=garagePresetState('raised',current),front=garagePresetState('forecourt',current),deep=garagePresetState('deeper',current);
  assert.equal(raised.garageClearHeight,2.3);assert.equal(raised.garageInsideRun,2);
  assert.deepEqual(front,{...raised,garageInsideRun:0});
  assert.deepEqual(deep,{...raised,garageExtraDepth:.6});
});
test('garage settings bound edits and reject nonfinite numbers without coercing switches',()=>{
  const {model}=models[0];
  for(const [key,field] of Object.entries(GARAGE_FIELDS)){
    assert.equal(model.sanitizeState({[key]:field.min-999})[key],field.min,key);
    assert.equal(model.sanitizeState({[key]:field.max+999})[key],field.max,key);
    for(const value of [NaN,Infinity,-Infinity,'3',null])assert.equal(model.sanitizeState({[key]:value})[key],field.value,key);
  }
  assert.equal(model.sanitizeState({basementGarageEnabled:'true'}).basementGarageEnabled,false);
  assert.equal(model.sanitizeState({garageReverse:1}).garageReverse,false);
});
test('sun, lights, trees, view and car-preview edits reuse the complete garage assessment',()=>{
  const {data,model}=models[0];let evaluations=0;
  const cached=createGarageLayoutCache(()=>({calculation:++evaluations}));
  const initial={...model.DEFAULTS,basementGarageEnabled:true},first=cached(initial,data);
  for(const patch of [{sunMinutes:1390},{nightWindowActivity:95},{screeningTrees:[]},{mode:'plan'},
    {garageProgress:85},{garageReverse:true},{privacyPergolaEnabled:true},{costBasementGarageQuote:375000}]){
    assert.equal(cached({...initial,...patch},data),first);
  }
  assert.equal(evaluations,1);
  for(const key of ['floorHeight','garageClearHeight','garageSlabThickness','garageExtraDepth','garageInsideRun',
    'garageBottomApron','garageMaxGrade','garageRampWidth','garageClearanceMm','garageReserveMm']){
    const previous=evaluations;cached({...initial,[key]:initial[key]+.01},data);
    assert.equal(evaluations,previous+1,key+' changes the assessment');
  }
  const previous=evaluations;cached(initial,{...data,terrain:{...data.terrain}});
  assert.equal(evaluations,previous+1,'A changed terrain model must be evaluated again');
});
