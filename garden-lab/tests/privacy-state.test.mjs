import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStateModel,STATE_VERSION} from '../src/state.js';
import {getSiteProfile,resolveSiteId,SITE_OPTIONS} from '../src/sites.js';
import {PRIVACY_FIELDS,PRIVACY_DEFAULTS,privacyPresetState,matchesPrivacyPreset} from '../src/privacy-options.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const profile=getSiteProfile('sternicza-11',data),model=createStateModel(profile);
const quoteKeys=['costPrivacyPergolaQuote','costSpaScreenQuote'];
const privacyKeys=[...Object.keys(PRIVACY_DEFAULTS),...quoteKeys];
const flags=['privacyPergolaEnabled','privacyPergolaFoliage','spaScreensEnabled'];
const clone=value=>JSON.parse(JSON.stringify(value));
const without=(state,keys)=>Object.fromEntries(Object.entries(state).filter(([key])=>!keys.includes(key)));
const dimensions=Object.fromEntries(Object.entries(PRIVACY_FIELDS).map(([key,field])=>
  [key,Math.round((field.min+(field.max-field.min)*.37)*100)/100]));
const custom=model.sanitizeState({...model.DEFAULTS,...dimensions,
  privacyPergolaEnabled:true,privacyPergolaFoliage:true,spaScreensEnabled:true,
  costPrivacyPergolaQuote:46000,costSpaScreenQuote:17500,costGardenCanopy:38500,
  costSpaPool:192000,costUsePlanningAllowances:false,
  canopyEnabled:true,canopyDepth:4.6,canopyHeight:2.85,canopyWidth:8.2,fasciaDepth:.25,
  gardenProgram:'spa-pool-grove',gardenRaise:.35,bedRaise:.15,floorHeight:1.45,terraceDepth:4.6,
  hedgeRear:3.8,hedgeLeft:4.1,hedgeRight:3.6,hedgeFront:3.2,linkedHedges:false,
  sunDate:'2028-04-17',sunMinutes:1037,sunEnabled:true,sunPathVisible:true,
  preset:'custom',observerX:7.3,observerY:27.6,eyeHeight:1.6,lookYaw:23,lookPitch:9,mode:'section',
  screeningTrees:model.DEFAULTS.screeningTrees.map((tree,index)=>({...tree,id:`kept-${index}`,
    x:tree.x-.1,y:tree.y-.2,rotation:17+index,unitPrice:61500+index*100,enabled:index!==1}))});

test('current shares and JSON save/reload retain every privacy dimension, switch and quote',()=>{
  assert.ok(STATE_VERSION>=21);
  for(const changes of [
    {privacyPergolaEnabled:true,privacyPergolaFoliage:true,spaScreensEnabled:true},
    {privacyPergolaEnabled:true,privacyPergolaFoliage:false,spaScreensEnabled:false},
    {privacyPergolaEnabled:false,privacyPergolaFoliage:false,spaScreensEnabled:true},
    {privacyPergolaEnabled:false,privacyPergolaFoliage:false,spaScreensEnabled:false},
  ]){
    const state={...custom,...changes},shared=model.encodeState(state),params=new URLSearchParams(shared);
    assert.equal(params.get('v'),String(STATE_VERSION));
    for(const key of [...Object.keys(PRIVACY_FIELDS),...quoteKeys]){
      assert.equal(Number(params.get(key)),state[key],key+' is present in the share');
    }
    for(const restored of [model.decodeState('#'+shared),model.migrateSavedState(clone(state),STATE_VERSION)]){
      assert.deepEqual(restored,state);
      assert.deepEqual(model.decodeState(model.encodeState(restored)),state,'Repeated sharing stays stable');
    }
    const comparison=model.sanitizeState(state),snapshot=clone(comparison);
    const edited=model.sanitizeState(state);
    edited.privacyPergolaHeight=5.8;edited.spaScreensEnabled=!edited.spaScreensEnabled;
    edited.costPrivacyPergolaQuote=65000;edited.screeningTrees[0].x+=.2;
    assert.deepEqual(comparison,snapshot,'Editing scenario B must not mutate the saved A copy');
  }
});

test('v20 sparse and custom designs never acquire privacy structures, even with unknown true flags',()=>{
  // The historical terrace and canopy predate the basement garage proposal.
  const historical={...custom,livingCinemaLayout:'legacy',showEquipmentLabels:false,poolSunbedSides:1,edgeAlignedSunbeds:false,pedestrianGateOpen:true,garageGateOpen:true,rearCornerPool:false,nightGardenIntensity:75,nightPendantIntensity:80,nightHedgeIntensity:85,sceneMotion:false,summerPoolLayout:false,jacuzziCentered:false,hstOpen:0,styleGardenLayout:false,basementGarageEnabled:false,poolFreeboard:.02,garageSlabThickness:.25,firstFloorRise:3,atticRise:6,jacuzziOverflow:false,terraceCoverType:'canopy'};
  const previous=without(historical,privacyKeys),original=clone(previous);
  const shared=new URLSearchParams(model.encodeState(historical));
  shared.set('v','20');
  // v20's encoder wrote this explicit on choice against its off default;
  // the current encoder may omit it against today's on default.
  shared.set('canopyEnabled',String(historical.canopyEnabled));
  for(const key of privacyKeys)shared.delete(key);
  for(const inject of [false,true]){
    const saved={...previous};
    if(inject)for(const key of flags){saved[key]=true;shared.set(key,'true');}
    for(const restored of [model.migrateSavedState(saved,20),model.decodeState(shared.toString())]){
      for(const key of flags)assert.equal(restored[key],false,key);
      assert.deepEqual(without(restored,privacyKeys),previous,'Keep trees, layout, levels, canopy, lighting, view and quotes');
      assert.deepEqual(model.decodeState(model.encodeState(restored)),restored);
    }
  }
  assert.deepEqual(previous,original,'Migration must not change the stored input');
  for(const restored of [model.decodeState('v=20&site=sternicza-11'),model.migrateSavedState({siteId:'sternicza-11'},20)]){
    for(const key of flags)assert.equal(restored[key],false,key);
    assert.deepEqual(restored.screeningTrees,model.decodeState('v=29&site=sternicza-11').screeningTrees);
  }
});

test('privacy alternatives preserve the current planting, layout, levels, solar date, quotes and view',()=>{
  const mutableKeys=[...Object.keys(PRIVACY_DEFAULTS),'canopyEnabled','canopyHeight','canopyDepth','canopyWidth','fasciaDepth'];
  const original=clone(custom);
  for(const id of ['spa','pergola','layered','none']){
    const selected=privacyPresetState(id,custom);
    assert.deepEqual(without(selected,mutableKeys),without(custom,mutableKeys),id);
    assert.equal(matchesPrivacyPreset(id,selected),true,id+' matches immediately after selecting');
    assert.deepEqual(model.decodeState(model.encodeState(selected)),selected,id+' survives sharing');
    assert.deepEqual(model.migrateSavedState(clone(selected),STATE_VERSION),selected,id+' survives saving');
  }
  assert.deepEqual(custom,original,'Selecting an option cannot mutate the live input or its trees');
  assert.deepEqual(privacyPresetState('unknown-option',custom),custom);
  assert.equal(matchesPrivacyPreset('unknown-option',custom),false);
});

test('privacy presets use the modeled 5 m pergola and local spa screen sizes with a capped canopy projection',()=>{
  const pergola=privacyPresetState('pergola',custom);
  assert.equal(pergola.privacyPergolaEnabled,true);assert.equal(pergola.privacyPergolaFoliage,true);
  assert.equal(pergola.privacyPergolaHeight,5);assert.equal(pergola.spaScreensEnabled,false);
  assert.equal(pergola.canopyEnabled,false);
  for(const id of ['spa','layered'])for(const [terraceDepth,expectedDepth] of [[3,4],[4.6,5.6],[6,6]]){
    const selected=privacyPresetState(id,{...custom,terraceDepth});
    assert.equal(selected.spaScreensEnabled,true);assert.equal(selected.canopyEnabled,true);
    assert.equal(selected.spaScreenWidth,3.6);assert.equal(selected.spaScreenGap,.65);
    assert.equal(selected.canopyDepth,expectedDepth);
    assert.equal(selected.terraceDepth,terraceDepth,'Choosing screening cannot resize the terrace');
    assert.equal(matchesPrivacyPreset(id,selected),true);
    assert.equal(matchesPrivacyPreset(id,{...selected,spaScreenWidth:3.7}),false);
  }
  const none=privacyPresetState('none',custom);
  assert.equal(none.privacyPergolaEnabled,false);assert.equal(none.spaScreensEnabled,false);assert.equal(none.canopyEnabled,false);
});

test('privacy switches and presets stay inactive on the other properties',()=>{
  for(const site of SITE_OPTIONS.filter(site=>site.id!=='sternicza-11')){
    const otherData=JSON.parse(readFileSync(new URL('../'+site.dataPath,import.meta.url)));
    const other=createStateModel(getSiteProfile(site.id,otherData));
    const current=other.sanitizeState({...other.DEFAULTS,canopyEnabled:true});
    const edited={...current,...Object.fromEntries(flags.map(key=>[key,true]))};
    const shared=new URLSearchParams({v:'21',site:site.id,...Object.fromEntries(flags.map(key=>[key,'true']))});
    for(const restored of [other.sanitizeState(edited),other.migrateSavedState(clone(edited),21),other.decodeState(shared.toString())]){
      for(const key of flags)assert.equal(restored[key],false,site.id+' '+key);
    }
    for(const id of ['spa','pergola','layered','none']){
      assert.deepEqual(privacyPresetState(id,current),current,site.id+' ignores '+id);
      assert.equal(matchesPrivacyPreset(id,current),false,site.id+' has no active privacy preset');
    }
  }
});

test('v21 shared hashes select their own property even when the query names another site',()=>{
  for(const site of SITE_OPTIONS){
    const other=SITE_OPTIONS.find(candidate=>candidate.id!==site.id);
    const hash='#v=21&site='+site.id;
    assert.equal(resolveSiteId('',hash),site.id);
    assert.equal(resolveSiteId('?site='+other.id,hash),site.id);
  }
  assert.equal(resolveSiteId('?site=nadmorska-17','#v=21&site=unknown'),'sternicza-11');
});
