import test from 'node:test';
import assert from 'node:assert/strict';
import {STATE_VERSION,DEFAULTS,FIELDS,sanitizeState,encodeState,decodeState,scenarioState,migrateLegacyState,migrateSavedState,isValidSolarDate,changeHedgeHeight} from '../src/state.js';
import {COST_FIELDS} from '../src/costs.js';
import {BUILDING_FIELDS} from '../src/buildings.js';
test('share links preserve fill, fixed floors, independent hedge heights and observer settings',()=>{
 const state={...DEFAULTS,hedgeRear:6,hedgeLeft:4,hedgeRight:2.5,gardenRaise:.5,bedRaise:.25,floorHeight:1.2,raiseNewHedges:false,preset:'custom',observerX:7.2,observerY:28,mode:'section',canopyEnabled:true,fasciaDepth:.35};
 const decoded=decodeState(encodeState(state));
 for(const key of Object.keys(state))assert.ok(typeof state[key]==='number'?Math.abs(decoded[key]-state[key])<.0001:decoded[key]===state[key],key);
});
test('untrusted URL fields cannot introduce invalid numerical or executable settings',()=>{
 const s=decodeState('#v=1&hedgeRear=Infinity&gardenRaise=-20&canopyWidth=1000&preset=%3Cscript%3E&mode=other&removeGarage=false');
 assert.equal(s.hedgeRear,2.5);assert.equal(s.gardenRaise,0);assert.equal(s.canopyWidth,11);assert.equal(s.preset,'sofa');assert.equal(s.mode,'orbit');assert.equal(s.removeGarage,false);
 assert.equal(Object.hasOwn(s,'v'),false);assert.deepEqual(sanitizeState(null),DEFAULTS);
});
test('scenario presets never silently change house floor elevation or viewpoint',()=>{
 const s=scenarioState('raised',{...DEFAULTS,floorHeight:1.65,preset:'jacuzzi',eyeHeight:.7});
 assert.equal(s.floorHeight,1.65);assert.equal(s.preset,'jacuzzi');assert.equal(s.bedRaise,.5);assert.equal(s.gardenRaise,0);assert.equal(s.hedgeRear,4);
});

test('each hedge edits independently by default, including after choosing a preset',()=>{
 const original={...DEFAULTS,hedgeRear:2.5,hedgeLeft:3,hedgeRight:4};
 assert.equal(DEFAULTS.linkedHedges,false);
 for(const key of ['hedgeRear','hedgeLeft','hedgeRight']){
  const next=changeHedgeHeight(original,key,5.5);
  assert.equal(next[key],5.5);
  for(const other of ['hedgeRear','hedgeLeft','hedgeRight'].filter(k=>k!==key))assert.equal(next[other],original[other]);
 }
 assert.equal(original.hedgeRear,2.5,'Editing must not mutate a saved A scenario');
 for(const name of ['default','starter','raised','tall','canopy']){
  const preset=scenarioState(name,DEFAULTS);
  assert.equal(preset.linkedHedges,false);
  const changed=changeHedgeHeight(preset,'hedgeLeft',1.5);
  assert.equal(changed.hedgeRear,preset.hedgeRear);
  assert.equal(changed.hedgeRight,preset.hedgeRight);
 }
});

test('explicitly linked editing changes all three sides and preserves bounded values',()=>{
 const linked=changeHedgeHeight({...DEFAULTS,linkedHedges:true},'hedgeRight',20);
 assert.equal(linked.hedgeRear,15);assert.equal(linked.hedgeLeft,15);assert.equal(linked.hedgeRight,15);
 assert.equal(linked.linkedHedges,true);
 assert.equal(scenarioState('raised',linked).linkedHedges,true,'User-selected linking remains an editing preference');
});

test('legacy saved settings keep the design but discard the old automatically linked default',()=>{
 const old={hedgeRear:6,hedgeLeft:4,hedgeRight:3,linkedHedges:true,gardenRaise:.5,canopyEnabled:true,floorHeight:1.35};
 const next=migrateLegacyState(old);
 for(const key of ['hedgeRear','hedgeLeft','hedgeRight','gardenRaise','canopyEnabled','floorHeight'])assert.equal(next[key],old[key]);
 assert.equal(next.linkedHedges,false);assert.equal(old.linkedHedges,true);
 assert.equal(next.buyNewThujas,true);
 assert.equal(next.b9HeightDelta,0);
 const legacyUrl=decodeState('#v=1&hedgeRear=6&hedgeLeft=4&hedgeRight=3');
 assert.equal(legacyUrl.linkedHedges,false);
 assert.equal(legacyUrl.hedgeLeft,4);
});

test('v3 links preserve every editable cost and building assumption with comparison settings',()=>{
 const state={...DEFAULTS,linkedHedges:true,buyNewThujas:false,raiseNewHedges:false,includeHighFeatures:true};
 for(const [key,f] of Object.entries({...COST_FIELDS,...BUILDING_FIELDS}))state[key]=Math.round((f.min+(f.max-f.min)*.37)*100)/100;
 const encoded=encodeState(state),restored=decodeState(`#${encoded}`);
 assert.ok(encoded.startsWith('v=3&'));
 for(const key of Object.keys({...COST_FIELDS,...BUILDING_FIELDS})){
  assert.ok(key in FIELDS);
  assert.equal(restored[key],state[key],key);
 }
 for(const key of ['linkedHedges','buyNewThujas','raiseNewHedges','includeHighFeatures'])assert.equal(restored[key],state[key],key);
});

test('old sparse links keep the original baseline while new links use the requested defaults',()=>{
 assert.equal(STATE_VERSION,3);
 for(const version of [1,2]){
  const legacy=decodeState(`#v=${version}`);
  for(const key of ['hedgeRear','hedgeLeft','hedgeRight'])assert.equal(legacy[key],2.5,key);
  assert.equal(legacy.gardenRaise,0);
  const explicit=decodeState(`#v=${version}&hedgeRear=4&gardenRaise=0.5&floorHeight=1.7`);
  assert.equal(explicit.hedgeRear,4);assert.equal(explicit.hedgeLeft,2.5);assert.equal(explicit.hedgeRight,2.5);
  assert.equal(explicit.gardenRaise,.5);assert.equal(explicit.floorHeight,1.7);
  assert.equal(decodeState(`#v=${version}&hedgeRear=NaN`).hedgeRear,2.5);
 }
 const fresh=decodeState('#v=3');
 for(const key of ['hedgeRear','hedgeLeft','hedgeRight'])assert.equal(fresh[key],4,key);
 assert.equal(fresh.gardenRaise,.5);assert.equal(fresh.bedRaise,0);assert.equal(fresh.floorHeight,1.2);
 assert.equal(encodeState(DEFAULTS),'v=3');
 assert.deepEqual(decodeState('#v=99&hedgeRear=12'),DEFAULTS);
 assert.deepEqual(decodeState(null),DEFAULTS);
});

test('saved v2 designs preserve explicit choices and partial old saves have legacy defaults',()=>{
 const old={hedgeRear:6,hedgeLeft:3,gardenRaise:0,linkedHedges:true,floorHeight:1.4,preset:'garden'};
 const restored=migrateSavedState(old,2);
 for(const key of Object.keys(old))assert.equal(restored[key],old[key],key);
 assert.equal(restored.hedgeRight,2.5);
 assert.equal(migrateSavedState({},2).gardenRaise,0);
 assert.equal(migrateSavedState({},3).gardenRaise,.5);
 assert.equal(migrateSavedState(old,1).linkedHedges,false);
 assert.deepEqual(migrateSavedState(null,2),DEFAULTS);
 assert.deepEqual(migrateSavedState(old,99),DEFAULTS);
 assert.equal(old.linkedHedges,true,'Migration must not mutate saved comparison A');
 // Re-sharing an old default design must write its old values explicitly in v3.
 const reshared=encodeState(decodeState('#v=2'));
 assert.match(reshared,/hedgeRear=2.5/);assert.match(reshared,/gardenRaise=0(?:&|$)/);
 assert.equal(decodeState(reshared).gardenRaise,0);
});

test('date and local minute survive links, saved state and scenario switches',()=>{
 const selected={...DEFAULTS,solarDate:'2028-02-29',solarTime:407,shadowsEnabled:false,showSunPath:false};
 const decoded=decodeState(encodeState(selected));
 for(const key of ['solarDate','solarTime','shadowsEnabled','showSunPath'])assert.equal(decoded[key],selected[key],key);
 assert.equal(migrateSavedState(selected,3).solarDate,'2028-02-29');
 const comparison=scenarioState('default',{...selected,floorHeight:1.8,preset:'jacuzzi',eyeHeight:.7});
 assert.equal(comparison.hedgeRear,4);assert.equal(comparison.gardenRaise,.5);assert.equal(comparison.bedRaise,0);
 for(const key of ['solarDate','solarTime','shadowsEnabled','showSunPath'])assert.equal(comparison[key],selected[key],key);
 assert.equal(comparison.floorHeight,1.8);assert.equal(comparison.preset,'jacuzzi');assert.equal(comparison.eyeHeight,.7);
 assert.equal(scenarioState('starter',comparison).gardenRaise,0);
});

test('solar dates reject overflow and malformed dates without browser-timezone coercion',()=>{
 for(const value of ['2000-02-29','2024-02-29','2100-12-31'])assert.equal(isValidSolarDate(value),true,value);
 for(const value of ['2026-02-29','2100-02-29','2026-04-31','1999-12-31','2101-01-01','2026-00-10','2026-13-01','2026-6-21','2026-06-21T12:00:00Z',' 2026-06-21',null,20260621]){
  assert.equal(isValidSolarDate(value),false,String(value));
  assert.equal(sanitizeState({solarDate:value}).solarDate,DEFAULTS.solarDate);
 }
 assert.equal(decodeState('#v=3&solarDate=2026-02-30').solarDate,DEFAULTS.solarDate);
 assert.equal(sanitizeState({solarTime:Infinity}).solarTime,780);
 assert.equal(sanitizeState({solarTime:-5}).solarTime,0);
 assert.equal(sanitizeState({solarTime:2000}).solarTime,1439);
 assert.equal(sanitizeState({solarTime:719.6}).solarTime,720);
 const malformed=decodeState('#v=3&solarTime=&shadowsEnabled=maybe&showSunPath=0');
 assert.equal(malformed.solarTime,780);assert.equal(malformed.shadowsEnabled,true);assert.equal(malformed.showSunPath,true);
});

test('malformed boolean URL values leave defaults intact instead of silently disabling options',()=>{
 const result=decodeState('#v=2&buyNewThujas=garbage&raiseNewHedges=&removeGarage=0&linkedHedges=yes&canopyEnabled=false');
 for(const key of ['buyNewThujas','raiseNewHedges','removeGarage','linkedHedges'])assert.equal(result[key],DEFAULTS[key],key);
 assert.equal(result.canopyEnabled,false);
 const valid=decodeState('#v=2&buyNewThujas=false&raiseNewHedges=false&linkedHedges=true');
 assert.equal(valid.buyNewThujas,false);assert.equal(valid.raiseNewHedges,false);assert.equal(valid.linkedHedges,true);
 const sanitized=sanitizeState({buyNewThujas:'false',b9HeightDelta:Infinity,costFillRate:-1,b15DistanceDelta:-100});
 assert.equal(sanitized.buyNewThujas,true);assert.equal(sanitized.b9HeightDelta,0);assert.equal(sanitized.costFillRate,0);assert.equal(sanitized.b15DistanceDelta,-15);
});
