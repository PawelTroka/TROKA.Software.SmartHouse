import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,FIELDS,sanitizeState,encodeState,decodeState,scenarioState,migrateLegacyState,changeHedgeHeight} from '../src/state.js';
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
 for(const name of ['starter','raised','tall','canopy']){
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

test('v2 links preserve every editable cost and building assumption with comparison settings',()=>{
 const state={...DEFAULTS,linkedHedges:true,buyNewThujas:false,raiseNewHedges:false,includeHighFeatures:true};
 for(const [key,f] of Object.entries({...COST_FIELDS,...BUILDING_FIELDS}))state[key]=Math.round((f.min+(f.max-f.min)*.37)*100)/100;
 const encoded=encodeState(state),restored=decodeState(`#${encoded}`);
 assert.ok(encoded.startsWith('v=2&'));
 for(const key of Object.keys({...COST_FIELDS,...BUILDING_FIELDS})){
  assert.ok(key in FIELDS);
  assert.equal(restored[key],state[key],key);
 }
 for(const key of ['linkedHedges','buyNewThujas','raiseNewHedges','includeHighFeatures'])assert.equal(restored[key],state[key],key);
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
