import {COST_FIELDS,COST_DEFAULTS} from './costs.js?v=1.9.0';
import {BUILDING_FIELDS,buildingFields} from './buildings.js?v=1.9.0';
import {DEFAULT_SITE_ID,getSiteProfile} from './sites.js?v=1.9.0';
import {SOLAR_DEFAULTS,sanitizeSolarDate} from './solar.js?v=1.9.0';
import {sanitizeScreeningTrees,TREE_LEAF_MODES} from './screening-trees.js?v=1.9.0';
import {getScreeningLayouts} from './screening-layouts.js?v=1.9.0';

export const STATE_VERSION = 11;

// A sparse v10 link meant the published balanced arrangement. Keep the full
// purchased-tree snapshot independent of future presets and catalog defaults.
const V10_STERNICZA_TREES=Object.freeze([[17.6,34.9],[12.9,34.3],[14.4,25.7]].map(([x,y],index)=>Object.freeze({
  id:`pine-${index+1}`,typeId:'austrian-pine-tall',height:9.5,crownBase:2.5,crownWidth:5,crownDepth:5,
  rotation:0,enabled:true,unitPrice:0,x,y,
})));

const BASE_FIELDS = Object.freeze({
  hedgeRear: {label:'Rear hedge',min:0,max:15,step:0.1,value:4,group:'hedge'},
  hedgeLeft: {label:'Left hedge · east',min:0,max:15,step:0.1,value:4,group:'hedge'},
  hedgeRight: {label:'Right hedge · west',min:0,max:15,step:0.1,value:4,group:'hedge'},
  gardenRaise: {label:'Raise the whole rear garden',min:0,max:1,step:0.05,value:0.5,group:'terrain'},
  bedRaise: {label:'Extra height under the hedges',min:0,max:1,step:0.05,value:0,group:'terrain'},
  terraceDepth: {label:'Terrace depth',min:3,max:6,step:0.1,value:4.2,group:'terrace'},
  canopyDepth: {label:'Canopy projection',min:1,max:6,step:0.1,value:4.2,group:'canopy'},
  canopyHeight: {label:'Canopy underside above terrace',min:2.1,max:3.5,step:0.05,value:2.7,group:'canopy'},
  fasciaDepth: {label:'Front & side fascia drop',min:0,max:1,step:0.05,value:0.3,group:'canopy'},
  canopyWidth: {label:'Canopy width',min:4,max:11,step:0.1,value:8.5,group:'canopy'},
  floorHeight: {label:'Living floor above original garden',min:0,max:2.5,step:0.05,value:1.2,group:'assumption'},
  eyeHeight: {label:'Eye above supporting floor / ground',min:0.4,max:2,step:0.05,value:1.2,group:'assumption'},
  hedgeInset: {label:'Hedge screen inset from boundary',min:0,max:1.5,step:0.05,value:0.5,group:'assumption'},
  observerX: {label:'Observer across the plot (x)',min:0.5,max:19.8,step:0.1,value:9.6091676564,group:'assumption'},
  observerY: {label:'Observer from front boundary (y)',min:0.5,max:37,step:0.1,value:30,group:'assumption'},
  lookYaw: {label:'Look direction',min:-180,max:180,step:1,value:0,group:'look',unit:'°'},
  lookPitch: {label:'Look up / down',min:-60,max:60,step:1,value:0,group:'look',unit:'°'},
  sunMinutes: {label:'Time of day in Warsaw',min:0,max:1439,step:1,value:SOLAR_DEFAULTS.sunMinutes,group:'solar'},
  ...COST_FIELDS,
  ...BUILDING_FIELDS,
});
export const PRESETS = Object.freeze(['sofa','standing','terrace','jacuzzi','garden','sauna','firepit','custom']);
export const MODES = Object.freeze(['orbit','eye','plan','section','sun']);
const isStateRecord=input=>Boolean(input&&typeof input==='object'&&!Array.isArray(input));
const SUPPORTED_VERSIONS=Object.freeze([1,2,3,4,5,6,7,8,9,10,11]);

/** A property's fields, defaults and saved designs share one explicit site identity. */
export function createStateModel(profile=getSiteProfile(DEFAULT_SITE_ID)) {
  const siteId=profile.id;
  const fields={...BASE_FIELDS};
  for(const key of Object.keys(BUILDING_FIELDS))delete fields[key];
  Object.assign(fields,buildingFields(profile.buildingTargets));
  for(const [key,override] of Object.entries(profile.fieldOverrides||{}))if(fields[key])fields[key]={...fields[key],...override};
  for(const [key,value] of Object.entries(profile.defaults||{}))if(fields[key])fields[key]={...fields[key],value};
  const FIELDS=Object.freeze(Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,Object.freeze(value)])));
  const DEFAULTS=Object.freeze({...COST_DEFAULTS,...SOLAR_DEFAULTS,...Object.fromEntries(Object.entries(FIELDS).map(([k,v])=>[k,v.value])),
    preset:'sofa',mode:'orbit',raiseNewHedges:true,canopyEnabled:false,removeGarage:true,showRays:false,showDimensions:true,includeHighFeatures:false,
    linkedHedges:false,sunPathVisible:false,screeningTrees:Object.freeze([]),treeLeafMode:'auto',gardenProgram:'classic',...profile.defaults,siteId});
  const V10_DEFAULTS=Object.freeze({...DEFAULTS,showDimensions:true,gardenProgram:siteId===DEFAULT_SITE_ID?'spa-edge':'classic',
    screeningTrees:siteId===DEFAULT_SITE_ID?V10_STERNICZA_TREES:Object.freeze([])});
  // Versions 4–7 started without specimen trees. Their omitted field must never
  // acquire the new planting design; v7 still preserves explicitly stored trees.
  const V9_DEFAULTS=Object.freeze({...V10_DEFAULTS,showDimensions:false,gardenProgram:siteId===DEFAULT_SITE_ID?'spa':'classic',
    screeningTrees:getScreeningLayouts(siteId,'spa').find(item=>item.id==='default')?.trees||Object.freeze([])});
  const V8_DEFAULTS=Object.freeze({...V9_DEFAULTS,gardenProgram:'classic',
    screeningTrees:getScreeningLayouts(siteId,'classic').find(item=>item.id==='default')?.trees||Object.freeze([])});
  const V7_DEFAULTS=Object.freeze({...V8_DEFAULTS,screeningTrees:Object.freeze([]),treeLeafMode:'auto'});
  const LEGACY_DEFAULTS=Object.freeze({...V7_DEFAULTS,hedgeRear:2.5,hedgeLeft:2.5,hedgeRight:2.5,gardenRaise:0});
  function sanitizeWithDefaults(input,defaults) {
    const out={...defaults,screeningTrees:sanitizeScreeningTrees(defaults.screeningTrees,profile.bounds)};
    if(!isStateRecord(input)||(input.siteId!==undefined&&input.siteId!==siteId))return out;
    for(const [key,f] of Object.entries(FIELDS)) {
      if(typeof input[key]==='number'&&Number.isFinite(input[key]))out[key]=Math.max(f.min,Math.min(f.max,input[key]));
    }
    out.sunMinutes=Math.round(out.sunMinutes);
    out.sunDate=sanitizeSolarDate(input.sunDate,defaults.sunDate);
    for(const key of Object.keys(DEFAULTS).filter(k=>typeof DEFAULTS[k]==='boolean'))if(typeof input[key]==='boolean')out[key]=input[key];
    if(PRESETS.includes(input.preset))out.preset=input.preset;
    if(['spa-edge','spa','classic'].includes(input.gardenProgram))out.gardenProgram=input.gardenProgram;
    if(siteId!==DEFAULT_SITE_ID)out.gardenProgram='classic';
    if(['spa-edge','spa'].includes(out.gardenProgram))out.removeGarage=true;
    else if(['sauna','firepit'].includes(out.preset)){out.preset='garden';out.eyeHeight=1.65;}
    if(MODES.includes(input.mode))out.mode=input.mode;
    if(Object.hasOwn(input,'screeningTrees'))out.screeningTrees=sanitizeScreeningTrees(input.screeningTrees,profile.bounds);
    if(TREE_LEAF_MODES.includes(input.treeLeafMode))out.treeLeafMode=input.treeLeafMode;
    return out;
  }
  function sanitizeState(input={}) {return sanitizeWithDefaults(input,DEFAULTS);}
  function restoreVersionedState(input,version) {
    if(version<6&&siteId!==DEFAULT_SITE_ID)return sanitizeState();
    const restoredInput=version<=8?{...input,gardenProgram:'classic'}:version===9&&input.gardenProgram==='spa-edge'?{...input,gardenProgram:'spa'}:input;
    const next=sanitizeWithDefaults(restoredInput,version<=3?LEGACY_DEFAULTS:version<=7?V7_DEFAULTS:version===8?V8_DEFAULTS:version===9?V9_DEFAULTS:version===10?V10_DEFAULTS:DEFAULTS);
    if(version<7){next.screeningTrees=[];next.treeLeafMode='auto';}
    if(version<5){
      [next.hedgeLeft,next.hedgeRight]=[next.hedgeRight,next.hedgeLeft];
      [next.costTreePriceLeft,next.costTreePriceRight]=[next.costTreePriceRight,next.costTreePriceLeft];
      next.lookYaw=next.lookYaw===0?0:-next.lookYaw;
    }
    return next;
  }
  function encodeState(state) {
    const s=sanitizeState(state),p=new URLSearchParams({v:String(STATE_VERSION),site:siteId});
    for(const [key,val] of Object.entries(s)){
      // Explicit [] matters now that one property's fresh default contains trees.
      // Always serialise the actual layout, including default trees, so shared
      // designs remain stable if a later release changes the starting layout.
      if(key==='screeningTrees'){p.set(key,JSON.stringify(val));continue;}
      if(key==='gardenProgram'){p.set(key,val);continue;}
      if(key!=='siteId'&&val!==DEFAULTS[key])p.set(key,typeof val==='number'?String(Math.round(val*10000)/10000):String(val));
    }
    return p.toString();
  }
  function decodeState(hash) {
    if(typeof hash!=='string')return sanitizeState();
    const p=new URLSearchParams(hash.replace(/^#/,'')),s={};
    const version=Number(p.get('v'));
    if(!SUPPORTED_VERSIONS.includes(version))return sanitizeState();
    if(version>=6&&p.get('site')!==siteId)return sanitizeState();
    if(version<6&&(siteId!==DEFAULT_SITE_ID||(p.has('site')&&p.get('site')!==DEFAULT_SITE_ID)))return sanitizeState();
    for(const [key,val] of p){
      if(Object.hasOwn(FIELDS,key)){if(val.trim()!=='')s[key]=Number(val);}
      else if(typeof DEFAULTS[key]==='boolean'){if(val==='true'||val==='false')s[key]=val==='true';}
      else if(key==='preset'||key==='mode'||key==='sunDate'||key==='treeLeafMode'||key==='gardenProgram')s[key]=val;
      else if(key==='screeningTrees'&&version>=7){
        s[key]=[];
        if(val.length<=20000)try{s[key]=JSON.parse(val);}catch{ /* Malformed trees never add default screens. */ }
      }
    }
    return restoreVersionedState(s,version);
  }
  function scenarioState(name,current=DEFAULTS) {
    const layout=getScreeningLayouts(siteId,current.gardenProgram).find(item=>item.id===name);
    if(layout)return sanitizeState({...current,...layout.settings,screeningTrees:layout.trees});
    const s=sanitizeState({...current,hedgeRear:2.5,hedgeLeft:2.5,hedgeRight:2.5,gardenRaise:0,bedRaise:0,canopyEnabled:false,raiseNewHedges:true});
    if(name==='default')Object.assign(s,{hedgeRear:DEFAULTS.hedgeRear,hedgeLeft:DEFAULTS.hedgeLeft,hedgeRight:DEFAULTS.hedgeRight,gardenRaise:DEFAULTS.gardenRaise});
    if(name==='raised')Object.assign(s,{hedgeRear:4,hedgeLeft:4,hedgeRight:4,bedRaise:.5});
    if(name==='tall'||name==='canopy')Object.assign(s,{hedgeRear:6,hedgeLeft:6,hedgeRight:6});
    if(name==='canopy')Object.assign(s,{canopyEnabled:true,canopyHeight:DEFAULTS.canopyHeight,canopyDepth:DEFAULTS.canopyDepth,canopyWidth:DEFAULTS.canopyWidth,fasciaDepth:DEFAULTS.fasciaDepth});
    return s;
  }
  function matchesScenario(name,current) {
    const state=sanitizeState(current),layout=getScreeningLayouts(siteId,state.gardenProgram).find(item=>item.id===name);
    if(!profile.screeningLayouts?.length&&state.screeningTrees.length)return false;
    const candidate=scenarioState(name,state);
    const keys=layout?Object.keys(layout.settings):['hedgeRear','hedgeLeft','hedgeRight','gardenRaise','bedRaise','canopyEnabled','raiseNewHedges'];
    if(!keys.every(key=>candidate[key]===state[key]))return false;
    if(state.canopyEnabled&&!['canopyDepth','canopyHeight','canopyWidth','fasciaDepth'].every(key=>candidate[key]===state[key]))return false;
    if(layout){
      const geometry=trees=>JSON.stringify(trees.map(tree=>[tree.typeId,tree.x,tree.y,tree.height,tree.crownBase,tree.crownWidth,tree.crownDepth,tree.rotation,tree.enabled].map(value=>typeof value==='number'?Math.round(value*10000)/10000:value)).map(row=>JSON.stringify(row)).sort());
      return geometry(candidate.screeningTrees)===geometry(state.screeningTrees);
    }
    return true;
  }
  function migrateSavedState(input,version=3) {
    if(!isStateRecord(input)||!SUPPORTED_VERSIONS.includes(version))return sanitizeState();
    if(version>=6&&input.siteId!==siteId)return sanitizeState();
    if(input.siteId!==undefined&&input.siteId!==siteId)return sanitizeState();
    const next=restoreVersionedState(input,version);
    if(version===1)next.linkedHedges=false;
    return next;
  }
  function changeHedgeHeight(state,key,value) {
    const keys=['hedgeRear','hedgeLeft','hedgeRight'];
    if(!keys.includes(key))return sanitizeState(state);
    const next=sanitizeState({...state,[key]:value});
    if(next.linkedHedges)for(const side of keys)next[side]=next[key];
    return next;
  }
  return Object.freeze({STATE_VERSION,FIELDS,DEFAULTS,sanitizeState,encodeState,decodeState,scenarioState,matchesScenario,migrateSavedState,changeHedgeHeight,
    migrateLegacyState:input=>migrateSavedState(input,1)});
}

// Existing callers and old links keep the exact Sternicza settings and migration.
const sternicza=createStateModel();
export const {FIELDS,DEFAULTS,sanitizeState,encodeState,decodeState,scenarioState,matchesScenario,migrateSavedState,changeHedgeHeight,migrateLegacyState}=sternicza;
