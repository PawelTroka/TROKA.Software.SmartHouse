import test from 'node:test';
import assert from 'node:assert/strict';
import {createStateModel,STATE_VERSION,DEFAULTS,FIELDS,MODES,sanitizeState,encodeState,decodeState,scenarioState,migrateLegacyState,migrateSavedState,changeHedgeHeight} from '../src/state.js';
import {COST_FIELDS} from '../src/costs.js';
import {BUILDING_FIELDS} from '../src/buildings.js';
import {getSiteProfile} from '../src/sites.js';
test('share links preserve fill, fixed floors, independent hedge heights and observer settings',()=>{
 const state={...DEFAULTS,hedgeRear:6,hedgeLeft:4,hedgeRight:2.5,gardenRaise:.5,bedRaise:.25,floorHeight:1.2,raiseNewHedges:false,preset:'custom',observerX:7.2,observerY:28,mode:'section',canopyEnabled:true,fasciaDepth:.35};
 const decoded=decodeState(encodeState(state));
 for(const key of Object.keys(state)){
  if(typeof state[key]==='number')assert.ok(Math.abs(decoded[key]-state[key])<.0001,key);
  else assert.deepEqual(decoded[key],state[key],key);
 }
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
 for(const key of ['hedgeRear','gardenRaise','canopyEnabled','floorHeight'])assert.equal(next[key],old[key]);
 assert.equal(next.hedgeLeft,3);assert.equal(next.hedgeRight,4);
 assert.equal(next.linkedHedges,false);assert.equal(old.linkedHedges,true);
 assert.equal(next.buyNewThujas,true);
 assert.equal(next.b9HeightDelta,0);
 const legacyUrl=decodeState('#v=1&hedgeRear=6&hedgeLeft=4&hedgeRight=3');
 assert.equal(legacyUrl.linkedHedges,false);
 assert.equal(legacyUrl.hedgeLeft,3);
 assert.equal(decodeState('#v=1&linkedHedges=true').linkedHedges,true,'An explicit link preference is not the old automatic storage default');
});

test('current links preserve every editable cost and building assumption with comparison settings',()=>{
 const state={...DEFAULTS,linkedHedges:true,buyNewThujas:false,raiseNewHedges:false,includeHighFeatures:true};
 for(const [key,f] of Object.entries({...COST_FIELDS,...BUILDING_FIELDS}))state[key]=Math.round((f.min+(f.max-f.min)*.37)*100)/100;
 const encoded=encodeState(state),restored=decodeState(`#${encoded}`);
 assert.ok(encoded.startsWith(`v=${STATE_VERSION}&site=sternicza-11&`));
 for(const key of Object.keys({...COST_FIELDS,...BUILDING_FIELDS})){
  assert.ok(key in FIELDS);
  assert.equal(restored[key],state[key],key);
 }
 for(const key of ['linkedHedges','buyNewThujas','raiseNewHedges','includeHighFeatures'])assert.equal(restored[key],state[key],key);
});

test('solar settings round-trip with the design, costs, buildings and independent hedges',()=>{
 const state={...DEFAULTS,mode:'sun',sunDate:'2026-12-21',sunMinutes:962,sunEnabled:false,sunPathVisible:true,hedgeRear:6,hedgeLeft:3.5,hedgeRight:2.5,gardenRaise:.35,costFillRate:90,b9HeightDelta:2};
 const encoded=encodeState(state),restored=decodeState(`#${encoded}`);
 assert.ok(encoded.startsWith(`v=${STATE_VERSION}&site=sternicza-11&`));
 assert.ok(MODES.includes('sun'));
 assert.equal(FIELDS.sunMinutes.group,'solar');
 for(const key of ['mode','sunDate','sunMinutes','sunEnabled','sunPathVisible','hedgeRear','hedgeLeft','hedgeRight','gardenRaise','costFillRate','b9HeightDelta'])assert.equal(restored[key],state[key],key);
 const changed=changeHedgeHeight(restored,'hedgeLeft',4.5);
 assert.equal(changed.hedgeLeft,4.5);assert.equal(changed.hedgeRear,6);assert.equal(changed.hedgeRight,2.5);
 for(const key of ['sunDate','sunMinutes','sunEnabled','sunPathVisible'])assert.equal(changed[key],state[key],key);
});

test('solar date and minute validation prevents malformed shared scenarios',()=>{
 for(const date of ['2026-02-29','2026-04-31','1999-12-31','2101-01-01','2026-06-21<script>','',null])assert.equal(sanitizeState({sunDate:date}).sunDate,DEFAULTS.sunDate,String(date));
 assert.equal(sanitizeState({sunDate:'2028-02-29'}).sunDate,'2028-02-29');
 assert.equal(sanitizeState({sunDate:'2100-12-31'}).sunDate,'2100-12-31');
 assert.equal(decodeState('#v=3&sunDate=2026-02-30&sunMinutes=NaN&sunEnabled=no&sunPathVisible=1').sunDate,DEFAULTS.sunDate);
 for(const value of ['NaN','Infinity','-Infinity',''])assert.equal(decodeState(`#v=3&sunMinutes=${value}`).sunMinutes,DEFAULTS.sunMinutes,value);
 assert.equal(decodeState('#v=3&sunMinutes=-30').sunMinutes,0);
 assert.equal(decodeState('#v=3&sunMinutes=1500').sunMinutes,1439);
 assert.equal(sanitizeState({sunMinutes:720.8}).sunMinutes,721);
 assert.equal(sanitizeState({sunMinutes:'720'}).sunMinutes,DEFAULTS.sunMinutes);
 assert.equal(sanitizeState({sunEnabled:'false',sunPathVisible:'true'}).sunEnabled,true);
 assert.equal(sanitizeState({sunEnabled:'false',sunPathVisible:'true'}).sunPathVisible,false);
});

test('v1 and v2 links preserve legacy assumptions and adopt stable solar defaults',()=>{
 for(const version of [1,2]){
  const restored=decodeState(`#v=${version}&hedgeRear=6&hedgeLeft=4&hedgeRight=3&gardenRaise=0.5&costFillRate=85&b9HeightDelta=1.5&linkedHedges=false&mode=section`);
  for(const [key,value] of Object.entries({hedgeRear:6,hedgeLeft:3,hedgeRight:4,gardenRaise:.5,costFillRate:85,b9HeightDelta:1.5,linkedHedges:false,mode:'section'}))assert.equal(restored[key],value,`v${version} ${key}`);
  for(const key of ['sunDate','sunMinutes','sunEnabled','sunPathVisible'])assert.equal(restored[key],DEFAULTS[key],`v${version} ${key}`);
 }
 const defaultLink=new URLSearchParams(encodeState(DEFAULTS));
 assert.equal(defaultLink.get('v'),String(STATE_VERSION));assert.equal(defaultLink.get('site'),'sternicza-11');
 assert.deepEqual(JSON.parse(defaultLink.get('screeningTrees')),DEFAULTS.screeningTrees);
 assert.deepEqual(decodeState('#v=6&hedgeRear=10&sunDate=2026-12-21'),DEFAULTS);
});

test('hedge scenarios preserve the selected sun date and time',()=>{
 const current={...DEFAULTS,sunDate:'2026-09-22',sunMinutes:1080,sunEnabled:false,sunPathVisible:true,mode:'sun'};
 for(const name of ['default','starter','raised','tall','canopy']){
  const next=scenarioState(name,current);
  for(const key of ['sunDate','sunMinutes','sunEnabled','sunPathVisible','mode'])assert.equal(next[key],current[key],`${name} ${key}`);
 }
});

test('v1–v3 sparse links preserve their original garden instead of adopting new defaults',()=>{
 assert.equal(STATE_VERSION,14);
 for(const version of [1,2,3]){
  const legacy=decodeState(`#v=${version}`);
  for(const key of ['hedgeRear','hedgeLeft','hedgeRight'])assert.equal(legacy[key],2.5,`v${version} ${key}`);
  assert.equal(legacy.gardenRaise,0);assert.equal(legacy.bedRaise,0);
  const explicit=decodeState(`#v=${version}&hedgeRear=4&gardenRaise=0.5&floorHeight=1.7`);
  assert.equal(explicit.hedgeRear,4);assert.equal(explicit.hedgeLeft,2.5);assert.equal(explicit.hedgeRight,2.5);
  assert.equal(explicit.gardenRaise,.5);assert.equal(explicit.floorHeight,1.7);
  assert.equal(decodeState(`#v=${version}&hedgeRear=NaN`).hedgeRear,2.5);
 }
 const published=decodeState('#v=3&mode=sun&sunDate=2026-12-21&sunMinutes=962&sunPathVisible=true&sunEnabled=false');
 assert.equal(published.hedgeRear,2.5);assert.equal(published.gardenRaise,0);
 assert.equal(published.mode,'sun');assert.equal(published.sunDate,'2026-12-21');assert.equal(published.sunMinutes,962);
 assert.equal(published.sunPathVisible,true);assert.equal(published.sunEnabled,false);
 for(const version of [4,5]){
  const fresh=decodeState(`#v=${version}`);
  for(const key of ['hedgeRear','hedgeLeft','hedgeRight'])assert.equal(fresh[key],4,`v${version} ${key}`);
  assert.equal(fresh.gardenRaise,.5);assert.equal(fresh.bedRaise,0);assert.equal(fresh.floorHeight,1.2);
 }
 assert.deepEqual(decodeState(null),DEFAULTS);
 // Re-sharing a published v3 design must encode the old baseline explicitly.
 const reshared=encodeState(published);
 assert.match(reshared,/hedgeRear=2.5/);assert.match(reshared,/gardenRaise=0(?:&|$)/);
 assert.deepEqual(decodeState(reshared),published);
});

test('saved v2/v3 designs retain old defaults and explicit solar settings during migration',()=>{
 const old={hedgeRear:6,hedgeLeft:3,gardenRaise:0,linkedHedges:true,floorHeight:1.4,preset:'garden',mode:'sun',sunDate:'2028-02-29',sunMinutes:407,sunEnabled:false,sunPathVisible:true};
 for(const version of [2,3]){
  const restored=migrateSavedState(old,version);
  for(const key of Object.keys(old).filter(key=>key!=='hedgeLeft'))assert.equal(restored[key],old[key],`v${version} ${key}`);
  assert.equal(restored.hedgeRight,3);assert.equal(restored.hedgeLeft,2.5);
  assert.equal(migrateSavedState({},version).gardenRaise,0);
 }
 assert.equal(migrateSavedState({},4).gardenRaise,.5);
 assert.equal(migrateSavedState(old,1).linkedHedges,false);
 assert.deepEqual(migrateSavedState(null,3),DEFAULTS);
 assert.deepEqual(migrateSavedState(old,99),DEFAULTS);
 assert.equal(old.linkedHedges,true,'Migration must not mutate saved comparison A');
 const next=scenarioState('default',old);
 assert.equal(next.hedgeRear,4);assert.equal(next.hedgeLeft,4);assert.equal(next.hedgeRight,4);assert.equal(next.gardenRaise,.5);assert.equal(next.bedRaise,0);
 for(const key of ['floorHeight','preset','mode','sunDate','sunMinutes','sunEnabled','sunPathVisible'])assert.equal(next[key],old[key],key);
 assert.equal(scenarioState('starter',next).gardenRaise,0);
});

test('v1–v4 orientation migration preserves geographic hedges, custom quotes and look bearing',()=>{
 const old={hedgeRear:6,hedgeLeft:2,hedgeRight:7,costTreePriceLeft:120,costTreePriceRight:930,lookYaw:37,lookPitch:-8,observerX:14,observerY:29,linkedHedges:true};
 const inputCopy={...old};
 for(const version of [1,2,3,4]){
  const url=new URLSearchParams({v:String(version),...old});
  const fromUrl=decodeState(`#${url}`),fromStorage=migrateSavedState(old,version);
  for(const restored of [fromUrl,fromStorage]){
   assert.equal(restored.hedgeLeft,7,`v${version}: the old east/right hedge stays east`);
   assert.equal(restored.hedgeRight,2,`v${version}: the old west/left hedge stays west`);
   assert.equal(restored.costTreePriceLeft,930);assert.equal(restored.costTreePriceRight,120);
   assert.equal(restored.lookYaw,-37);assert.equal(restored.lookPitch,-8);
   assert.equal(restored.observerX,14);assert.equal(restored.observerY,29);
   assert.equal(restored.hedgeRear,6);
   assert.deepEqual(decodeState(encodeState(restored)),restored,'Re-sharing migrates exactly once');
   assert.deepEqual(migrateSavedState(restored,5),restored,'Current stored comparisons do not swap a second time');
  }
  assert.equal(fromUrl.linkedHedges,true);
  assert.equal(fromStorage.linkedHedges,version!==1);
 }
 assert.deepEqual(old,inputCopy,'Migration does not mutate a saved comparison');
});

test('sparse legacy side values migrate after resolving the version-specific omitted defaults',()=>{
 for(const version of [1,2,3,4]){
  const initialHeight=version<=3?2.5:4,initialRaise=version<=3?0:.5;
  for(const restored of [
   decodeState(`#v=${version}&hedgeLeft=6&costTreePriceRight=875&lookYaw=-42`),
   migrateSavedState({hedgeLeft:6,costTreePriceRight:875,lookYaw:-42},version),
  ]){
   assert.equal(restored.hedgeLeft,initialHeight);
   assert.equal(restored.hedgeRight,6);
   assert.equal(restored.hedgeRear,initialHeight);
   assert.equal(restored.gardenRaise,initialRaise);
   assert.equal(restored.costTreePriceLeft,875);assert.equal(restored.costTreePriceRight,0);
   assert.equal(restored.lookYaw,42);
  }
  const bounded=decodeState(`#v=${version}&hedgeLeft=99&hedgeRight=NaN&costTreePriceLeft=-20&costTreePriceRight=Infinity&lookYaw=999`);
  assert.equal(bounded.hedgeLeft,initialHeight);assert.equal(bounded.hedgeRight,15);
  assert.equal(bounded.costTreePriceLeft,0);assert.equal(bounded.costTreePriceRight,0);
  assert.equal(bounded.lookYaw,-180);
 }
});

test('v5 physical side labels and state retain left/east and right/west without migration',()=>{
 assert.equal(FIELDS.hedgeLeft.label,'Left hedge · east');
 assert.equal(FIELDS.hedgeRight.label,'Right hedge · west');
 const current={...DEFAULTS,hedgeFront:0,gardenProgram:'classic',screeningTrees:[],hedgeLeft:3,hedgeRight:8,costTreePriceLeft:300,costTreePriceRight:850,lookYaw:25};
 assert.deepEqual(decodeState(encodeState(current)),current);
 assert.deepEqual(migrateSavedState(current,5),current);
 assert.equal(decodeState('#v=5&hedgeLeft=3').hedgeRight,4);
 assert.equal(decodeState('#v=5&lookYaw=25').lookYaw,25);
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

test('v14 explicitly shares the chosen garden programme and never restores omitted trees into an empty design',()=>{
 assert.equal(DEFAULTS.gardenProgram,'spa-grove');
 for(const gardenProgram of ['spa-grove','spa-screened','spa-compact','spa-edge','spa','classic']){
  const input={...DEFAULTS,gardenProgram,screeningTrees:[],removeGarage:gardenProgram!=='classic',costSpaSauna:85400};
  const params=new URLSearchParams(encodeState(input));
  assert.equal(params.get('v'),String(STATE_VERSION));
  assert.equal(params.get('gardenProgram'),gardenProgram,'The programme must remain explicit even when it matches fresh defaults');
  assert.equal(params.get('screeningTrees'),'[]');
  assert.deepEqual(decodeState(params.toString()),input);
  assert.deepEqual(migrateSavedState(input,STATE_VERSION),input);
 }
 assert.equal(sanitizeState({gardenProgram:'<script>'}).gardenProgram,'spa-grove');
});

test('spa viewpoint and garage invariants survive URL and saved-state sanitization',()=>{
 for(const preset of ['sauna','firepit']){
  const spa=sanitizeState({...DEFAULTS,gardenProgram:'spa',preset,removeGarage:false,eyeHeight:1.1});
  assert.equal(spa.preset,preset);assert.equal(spa.eyeHeight,1.1);
  assert.equal(spa.removeGarage,true,'The converted spa space cannot simultaneously retain the former garage');
  const classic=sanitizeState({...spa,gardenProgram:'classic',removeGarage:false});
  assert.equal(classic.removeGarage,false);
  assert.equal(classic.preset,'garden','A removed spa room must not leave the observer on a nonexistent floor');
  assert.equal(classic.eyeHeight,1.65);
  const fromOldLink=decodeState(`v=8&site=sternicza-11&gardenProgram=spa&preset=${preset}&removeGarage=false`);
  assert.equal(fromOldLink.gardenProgram,'classic');assert.equal(fromOldLink.preset,'garden');
  assert.equal(fromOldLink.removeGarage,false,'Historical garages are not removed by the new programme default');
 }
});

test('installed spa allowances are editable finite amounts and round-trip independently',()=>{
 const quotes={costSpaPool:243000,costSpaJacuzzi:71600,costSpaSauna:85400,costSpaColdPlunge:22300,costSpaFirepit:52000};
 const input={...DEFAULTS,...quotes};
 const decoded=decodeState(encodeState(input));
 for(const [key,amount] of Object.entries(quotes)){
  assert.equal(FIELDS[key].group,'cost-spa');assert.equal(decoded[key],amount);
  assert.equal(sanitizeState({[key]:-1})[key],0);
  assert.equal(sanitizeState({[key]:Infinity})[key],0);
  assert.equal(sanitizeState({[key]:'1000'})[key],0);
  assert.equal(sanitizeState({[key]:3000000})[key],2000000);
 }
 assert.equal(sanitizeState({...input,costSpaSauna:0}).costSpaPool,quotes.costSpaPool,'Clearing one quote must not change another');
});

test('v9 saves keep the previous spa, planting positions and uncluttered view',()=>{
 const previous=decodeState('v=9&site=sternicza-11');
 assert.equal(previous.gardenProgram,'spa');
 assert.equal(previous.showDimensions,false);
 assert.deepEqual(previous.screeningTrees.map(tree=>[tree.x,tree.y,tree.height]),[[17,35.3,9.5],[13.3,35.3,9.5],[16.6,22.1,5.5]]);
 assert.equal(decodeState('v=9&site=sternicza-11&gardenProgram=spa-edge').gardenProgram,'spa','Old versions cannot select geometry they never encoded');
 const customised={siteId:'sternicza-11',gardenProgram:'spa',screeningTrees:[],hedgeLeft:3.2,hedgeRight:5.1,costSpaSauna:72500};
 const saved=migrateSavedState(customised,9);
 for(const [key,value] of Object.entries(customised))assert.deepEqual(saved[key],value,key);
 assert.equal(saved.showDimensions,false);
 assert.deepEqual(decodeState(encodeState(saved)),saved,'Re-sharing preserves the previous geometry and display');
});

test('sparse v10 links and saves retain the published balanced pines when fresh defaults change',()=>{
 const profile=getSiteProfile('sternicza-11');
 const futureTrees=DEFAULTS.screeningTrees.map((tree,index)=>({...tree,x:15+index,y:34.8}));
 const future=createStateModel({...profile,defaults:{...profile.defaults,screeningTrees:futureTrees,showDimensions:false}});
 const expected=[[17.6,34.9],[12.9,34.3],[14.4,25.7]];
 for(const old of [future.decodeState('v=10&site=sternicza-11'),future.migrateSavedState({siteId:'sternicza-11'},10)]){
  assert.equal(old.gardenProgram,'spa-edge');assert.equal(old.showDimensions,true);
  assert.deepEqual(old.screeningTrees.map(t=>[t.x,t.y]),expected);
  old.screeningTrees.forEach((t,index)=>{
   assert.equal(t.id,`pine-${index+1}`);assert.equal(t.typeId,'austrian-pine-tall');
   assert.equal(t.height,9.5);assert.equal(t.crownBase,2.5);assert.equal(t.crownWidth,5);assert.equal(t.crownDepth,5);
   assert.equal(t.rotation,0);assert.equal(t.enabled,true);assert.equal(t.unitPrice,0);
  });
  assert.deepEqual(future.decodeState(future.encodeState(old)),old,'Re-sharing writes the historical trees explicitly');
  old.screeningTrees[0].x=0;
  assert.deepEqual(future.decodeState('v=10&site=sternicza-11').screeningTrees.map(t=>[t.x,t.y]),expected,'Restored objects do not mutate the frozen v10 baseline');
 }
 assert.deepEqual(future.decodeState('v=14&site=sternicza-11').screeningTrees,futureTrees);
 assert.equal(future.decodeState('v=14&site=sternicza-11').showDimensions,false);
});

test('explicit v10 empty or custom trees, geometry and quotes migrate without moving the design',()=>{
 const custom={...decodeState('v=10&site=sternicza-11').screeningTrees[1],id:'my-pine',x:15.4,y:34.7,rotation:28,unitPrice:61000,enabled:false};
 for(const trees of [[],[custom]]){
  const saved={siteId:'sternicza-11',gardenProgram:'spa-edge',screeningTrees:trees,showDimensions:false,
   hedgeLeft:2.8,hedgeRight:5.2,preset:'jacuzzi',costScreeningPlanting:1500,costSpaSauna:82400};
  const params=new URLSearchParams({v:'10',site:saved.siteId,...Object.fromEntries(Object.entries(saved).filter(([key])=>!['siteId','screeningTrees'].includes(key))),screeningTrees:JSON.stringify(trees)});
  for(const old of [decodeState(params.toString()),migrateSavedState(saved,10)]){
   for(const [key,value] of Object.entries(saved))assert.deepEqual(old[key],value,key);
   assert.deepEqual(decodeState(encodeState(old)),old);
  }
 }
 for(const bad of ['{bad','null','"oops"']){
  const params=new URLSearchParams({v:'10',site:'sternicza-11',screeningTrees:bad});
  assert.deepEqual(decodeState(params.toString()).screeningTrees,[],'Malformed explicit trees cannot add default screening');
 }
 const korz=createStateModel(getSiteProfile('korzeniowskiego-40'));
 for(const version of [10,11]){
  const state=korz.decodeState(`v=${version}&site=korzeniowskiego-40`);
  assert.equal(state.gardenProgram,'classic');assert.deepEqual(state.screeningTrees,[]);assert.equal(state.showDimensions,true);
 }
});

test('dimension visibility is independent, shared and absent from historical defaults',()=>{
 assert.equal(DEFAULTS.showDimensions,true);
 for(const version of [1,2,3,4,5,6,7,8,9]){
  assert.equal(decodeState(`v=${version}${version>=6?'&site=sternicza-11':''}`).showDimensions,false,`v${version}`);
 }
 for(const showDimensions of [true,false]){
  const original={...DEFAULTS,showDimensions,showRays:!showDimensions};
  assert.deepEqual(decodeState(encodeState(original)),original);
  assert.equal(scenarioState('default',original).showDimensions,showDimensions);
  assert.equal(changeHedgeHeight(original,'hedgeLeft',2.8).showDimensions,showDimensions);
 }
 assert.equal(sanitizeState({showDimensions:'false'}).showDimensions,true);
});

test('sparse v11 designs keep the previous corner trees, large spa and quote-only budget',()=>{
 const expected=[[13.1,34.45],[14.35,31],[17.6,34.5]];
 const futureTrees=DEFAULTS.screeningTrees.map((tree,index)=>({...tree,x:16+index,y:34}));
 const profile=getSiteProfile('sternicza-11');
 const future=createStateModel({...profile,defaults:{...profile.defaults,screeningTrees:futureTrees,showDimensions:false}});
 for(const old of [future.decodeState('v=11&site=sternicza-11'),future.migrateSavedState({siteId:'sternicza-11'},11)]){
  assert.equal(old.gardenProgram,'spa-edge');assert.equal(old.showDimensions,true);
  assert.equal(old.costUsePlanningAllowances,false);assert.equal(old.jacuzziOverflow,false);
  assert.deepEqual(old.screeningTrees.map(t=>[t.x,t.y]),expected);
  assert.ok(old.screeningTrees.every(t=>t.height===9.5&&t.crownWidth===5));
  assert.deepEqual(future.decodeState(future.encodeState(old)),old,'Sharing a historical design explicitly retains its scope');
 }
 assert.equal(decodeState('v=11&site=sternicza-11&gardenProgram=spa-compact').gardenProgram,'spa-edge');
 const custom={siteId:'sternicza-11',gardenProgram:'spa-edge',screeningTrees:[],costSpaSauna:75400,hedgeLeft:3.2};
 const restored=migrateSavedState(custom,11);
 for(const [key,value] of Object.entries(custom))assert.deepEqual(restored[key],value,key);
 assert.equal(restored.costUsePlanningAllowances,false);
});

test('current shares preserve whole-garden quotes and optional overflow independently without changing old baselines',()=>{
 assert.equal(DEFAULTS.costUsePlanningAllowances,true);assert.equal(DEFAULTS.jacuzziOverflow,false);
 for(const costUsePlanningAllowances of [false,true])for(const jacuzziOverflow of [false,true]){
  const custom={...DEFAULTS,costUsePlanningAllowances,jacuzziOverflow,costGardenLighting:21700,costGardenTerrace:73800};
  assert.deepEqual(decodeState(encodeState(custom)),custom);
  assert.deepEqual(migrateSavedState(custom,STATE_VERSION),custom);
  const compared=scenarioState('contained-corner',custom);
  for(const key of ['costUsePlanningAllowances','jacuzziOverflow','costGardenLighting','costGardenTerrace'])assert.equal(compared[key],custom[key],key);
 }
 const korz=createStateModel(getSiteProfile('korzeniowskiego-40'));
 assert.equal(korz.DEFAULTS.costUsePlanningAllowances,false);
 assert.equal(korz.decodeState('v=12&site=korzeniowskiego-40&gardenProgram=spa-compact').gardenProgram,'classic');
 assert.equal(sanitizeState({jacuzziOverflow:'true'}).jacuzziOverflow,false);
});
