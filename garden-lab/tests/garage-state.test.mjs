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

test('schema 32 starts Sternicza with the two-car proposal and leaves other properties unchanged',()=>{
  assert.equal(STATE_VERSION,32);
  for(const {site,model} of models){
    assert.equal(model.DEFAULTS.basementGarageEnabled,site.id==='sternicza-11',site.id);
    assert.equal(model.sanitizeState().basementGarageEnabled,site.id==='sternicza-11',site.id);
    assert.deepEqual(model.decodeState(model.encodeState(model.DEFAULTS)),model.DEFAULTS);
    assert.equal(resolveSiteId('?site=sternicza-11',`#v=${STATE_VERSION}&site=${site.id}`),site.id);
  }
});
test('current shares and saves retain garage dimensions, preview, explicit zeros and quote independently',()=>{
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
    for(const restored of [model.decodeState(model.encodeState(state)),model.migrateSavedState(clone(state),STATE_VERSION)]){
      assert.deepEqual(restored,state);
      assert.deepEqual(model.decodeState(model.encodeState(restored)),state,'Repeated share stays stable');
    }
    assert.equal(new URLSearchParams(model.encodeState(state)).get('basementGarageEnabled'),String(patch.basementGarageEnabled),
      'Every share carries the actual garage choice, including the default');
    const saved=clone(state);model.sanitizeState(state).screeningTrees[0].x+=1;
    assert.deepEqual(state,saved,'Editing scenario B cannot mutate A');
  }
});
test('garage-era sparse links adopt two cars while explicit off links and saved comparisons remain off',()=>{
  const {model}=models[0];
  for(let version=22;version<=STATE_VERSION;version++){
    const sparse=model.decodeState(`v=${version}&site=sternicza-11`);
    assert.equal(sparse.basementGarageEnabled,true,`v${version} omitted garage`);
    assert.equal(sparse.garageSpaces,2);assert.equal(sparse.garageRampWidth,5.8);
    const off=model.decodeState(`v=${version}&site=sternicza-11&basementGarageEnabled=false`);
    assert.equal(off.basementGarageEnabled,false,`v${version} explicit link off`);
    assert.equal(model.migrateSavedState({siteId:'sternicza-11',basementGarageEnabled:false},version).basementGarageEnabled,false,
      `v${version} saved comparison off`);
    assert.deepEqual(model.decodeState(model.encodeState(off)),off);
  }
});
test('only active legacy Sternicza sessions receive the one-time missing-garage repair',()=>{
  const {model}=models[0];
  const saved={...model.DEFAULTS,basementGarageEnabled:false,garageRampWidth:6.1,garageClearHeight:2.55,
    garageInsideRun:2.4,garageProgress:73,garageReverse:true,costBasementGarageQuote:438000,
    terraceDepth:4.8,hedgeRear:5.4,nightWindowActivity:51};
  const before=clone(saved);
  for(const version of [23,24,25,26,27]){
    const repaired=model.migrateSavedState(saved,version,{restoreCurrentGarageProposal:true});
    assert.equal(repaired.basementGarageEnabled,true,`v${version} current session repaired`);
    assert.equal(repaired.garageSpaces,2);
    for(const key of ['garageRampWidth','garageClearHeight','garageInsideRun','garageProgress','garageReverse',
      'costBasementGarageQuote','terraceDepth','hedgeRear','nightWindowActivity'])assert.equal(repaired[key],saved[key],`${version} ${key}`);
    assert.equal(model.migrateSavedState(saved,version).basementGarageEnabled,false,'Archived comparison A stays off');
    const optedOut={...repaired,basementGarageEnabled:false};
    assert.equal(model.migrateSavedState(optedOut,STATE_VERSION,{restoreCurrentGarageProposal:true}).basementGarageEnabled,false,
      'The new storage key makes later off choices authoritative');
    assert.deepEqual(model.decodeState(model.encodeState(optedOut)),optedOut);
  }
  assert.equal(model.migrateSavedState({siteId:'sternicza-11',basementGarageEnabled:false},22,{restoreCurrentGarageProposal:true}).basementGarageEnabled,true);
  assert.equal(model.migrateSavedState(saved,21,{restoreCurrentGarageProposal:true}).basementGarageEnabled,false);
  for(const {site,model:other} of models.slice(1))assert.equal(other.migrateSavedState({...other.DEFAULTS,basementGarageEnabled:false},27,
    {restoreCurrentGarageProposal:true}).basementGarageEnabled,false,site.id);
  assert.deepEqual(saved,before,'Migration does not mutate the archived source');
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
        for(const [key,value] of Object.entries({...GARAGE_DEFAULTS,garageSlabThickness:.25,garageSpaces:model.DEFAULTS.garageSpaces,garageRampWidth:model.DEFAULTS.garageRampWidth}))assert.equal(restored[key],value,`${site.id} v${version} ${key}`);
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
test('single-car links and locally saved designs restore two spaces and retire only the garage quote',()=>{
  const {model,site}=models[0];
  for(const version of [22,23,24,25])for(const [width,expectedWidth] of [[3.2,5.8],[6.2,6.2]]){
    for(const enabled of [true,false]){
      const original={siteId:site.id,garageRampWidth:width,basementGarageEnabled:enabled,
        costBasementGarageQuote:400000,costGardenLighting:4500,terraceDepth:4.7,nightWindowActivity:51};
      // v22 implicitly had one space. Later encoders wrote a capacity override.
      if(version>=23)original.garageSpaces=1;
      const hash=new URLSearchParams({v:version,site:site.id,...original});
      const saved=clone(original);
      for(const restored of [model.migrateSavedState(saved,version),model.decodeState(hash.toString())]){
        assert.equal(restored.garageSpaces,2);
        assert.equal(restored.garageRampWidth,expectedWidth);
        assert.equal(restored.costBasementGarageQuote,0);
        assert.equal(restored.basementGarageEnabled,enabled);
        for(const key of ['costGardenLighting','terraceDepth','nightWindowActivity'])assert.equal(restored[key],original[key]);
        assert.deepEqual(model.decodeState(model.encodeState(restored)),restored);
      }
      assert.deepEqual(saved,original);
    }
  }
  const raw={...model.DEFAULTS,garageSpaces:1,garageRampWidth:3.2,costBasementGarageQuote:400000};
  for(const id of ['none','raised']){
    const selected=garagePresetState(id,raw);
    assert.equal(selected.garageSpaces,2);
    assert.equal(selected.garageRampWidth,5.8);
    assert.equal(selected.costBasementGarageQuote,0);
    assert.equal(selected.basementGarageEnabled,id==='raised');
  }
});
test('a deliberately narrow two-car design retains its width and quote in shares and saved copies',()=>{
  const {model,site}=models[0];
  for(const version of [23,24,25]){
    const saved={siteId:site.id,basementGarageEnabled:true,garageSpaces:2,garageRampWidth:3.2,costBasementGarageQuote:351000};
    const hash=new URLSearchParams({v:version,site:site.id,...saved});
    for(const restored of [model.sanitizeState(saved),model.migrateSavedState(saved,version),model.decodeState(hash.toString())]){
      for(const [key,value] of Object.entries(saved))assert.equal(restored[key],value);
    }
    hash.delete('garageSpaces'); // Two is already the sparse default in v23 and later.
    assert.equal(model.decodeState(hash.toString()).garageRampWidth,3.2);
  }
  assert.equal(model.FIELDS.garageSpaces.min,2);
  assert.equal(model.FIELDS.garageSpaces.max,2);
  assert.equal(model.FIELDS.garageInsideRun.unit,'m');
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
  assert.equal(model.sanitizeState({basementGarageEnabled:'false'}).basementGarageEnabled,true);
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
