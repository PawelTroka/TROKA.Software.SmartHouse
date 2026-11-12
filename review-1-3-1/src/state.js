import {COST_FIELDS,COST_DEFAULTS} from './costs.js?v=1.3.1';
import {BUILDING_FIELDS} from './buildings.js?v=1.3.1';
import {SOLAR_DEFAULTS,sanitizeSolarDate} from './solar.js?v=1.3.1';

export const STATE_VERSION = 5;

export const FIELDS = Object.freeze({
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
export const PRESETS = Object.freeze(['sofa','standing','terrace','jacuzzi','garden','custom']);
export const MODES = Object.freeze(['orbit','eye','plan','section','sun']);
export const DEFAULTS = Object.freeze({...COST_DEFAULTS,...SOLAR_DEFAULTS,...Object.fromEntries(Object.entries(FIELDS).map(([k,v])=>[k,v.value])),preset:'sofa',mode:'orbit',raiseNewHedges:true,canopyEnabled:false,removeGarage:true,showRays:false,includeHighFeatures:false,linkedHedges:false,sunPathVisible:false});
// Versions 1–3 omitted values relative to the original 2.5 m / no-fill design.
// Changing new defaults must not reinterpret those already-published links.
const LEGACY_DEFAULTS = Object.freeze({...DEFAULTS,hedgeRear:2.5,hedgeLeft:2.5,hedgeRight:2.5,gardenRaise:0});
const SUPPORTED_VERSIONS = Object.freeze([1,2,3,4,5]);
const isStateRecord=input=>Boolean(input&&typeof input==='object'&&!Array.isArray(input));

/**
 * Before v5, side names described the map rather than a person looking out of
 * the house. Resolve old omitted defaults first, then preserve each geographic
 * hedge installation and its quote under the corrected east-left/west-right
 * names. Positive yaw now turns physically right; coordinates remain unchanged.
 */
function restoreVersionedState(input,version) {
  const next=sanitizeWithDefaults(input,version<=3?LEGACY_DEFAULTS:DEFAULTS);
  if(version<5){
    [next.hedgeLeft,next.hedgeRight]=[next.hedgeRight,next.hedgeLeft];
    [next.costTreePriceLeft,next.costTreePriceRight]=[next.costTreePriceRight,next.costTreePriceLeft];
    next.lookYaw=next.lookYaw===0?0:-next.lookYaw;
  }
  return next;
}

function sanitizeWithDefaults(input,defaults) {
  const out={...defaults};
  if (!isStateRecord(input)) return out;
  for (const [key,f] of Object.entries(FIELDS)) {
    if (typeof input[key]==='number' && Number.isFinite(input[key])) out[key]=Math.max(f.min,Math.min(f.max,input[key]));
  }
  out.sunMinutes=Math.round(out.sunMinutes);
  out.sunDate=sanitizeSolarDate(input.sunDate,defaults.sunDate);
  for (const key of Object.keys(DEFAULTS).filter(k=>typeof DEFAULTS[k]==='boolean')) if(typeof input[key]==='boolean') out[key]=input[key];
  if(PRESETS.includes(input.preset))out.preset=input.preset;
  if(MODES.includes(input.mode))out.mode=input.mode;
  return out;
}
export function sanitizeState(input={}) {
  return sanitizeWithDefaults(input,DEFAULTS);
}
export function encodeState(state) {
  const s=sanitizeState(state),p=new URLSearchParams({v:String(STATE_VERSION)});
  for(const [key,val] of Object.entries(s)) if(val!==DEFAULTS[key])p.set(key,typeof val==='number'?String(Math.round(val*10000)/10000):String(val));
  return p.toString();
}
export function decodeState(hash) {
  if(typeof hash!=='string')return {...DEFAULTS};
  const p=new URLSearchParams(hash.replace(/^#/,'')),s={};
  if(!SUPPORTED_VERSIONS.map(String).includes(p.get('v')))return {...DEFAULTS};
  for(const [key,val] of p){if(Object.hasOwn(FIELDS,key)){if(val.trim()!=='')s[key]=Number(val);}else if(typeof DEFAULTS[key]==='boolean'){if(val==='true'||val==='false')s[key]=val==='true';}else if(key==='preset'||key==='mode'||key==='sunDate')s[key]=val;}
  return restoreVersionedState(s,Number(p.get('v')));
}
export function scenarioState(name,current=DEFAULTS) {
  const s=sanitizeState({...current,hedgeRear:2.5,hedgeLeft:2.5,hedgeRight:2.5,gardenRaise:0,bedRaise:0,canopyEnabled:false,raiseNewHedges:true});
  if(name==='default')Object.assign(s,{hedgeRear:4,hedgeLeft:4,hedgeRight:4,gardenRaise:.5});
  if(name==='raised')Object.assign(s,{hedgeRear:4,hedgeLeft:4,hedgeRight:4,bedRaise:.5});
  if(name==='tall'||name==='canopy')Object.assign(s,{hedgeRear:6,hedgeLeft:6,hedgeRight:6});
  if(name==='canopy')Object.assign(s,{canopyEnabled:true,canopyHeight:2.7,canopyDepth:4.2,canopyWidth:8.5,fasciaDepth:.3});
  return s;
}

/** Restore partial or full saved designs against their original defaults. */
export function migrateSavedState(input,version=3) {
  if(!isStateRecord(input)||!SUPPORTED_VERSIONS.includes(version))return {...DEFAULTS};
  const next=restoreVersionedState(input,version);
  if(version===1)next.linkedHedges=false;
  return next;
}

/** Upgrade saved v1 preferences without preserving its automatically enabled linking. */
export function migrateLegacyState(input) {
  return migrateSavedState(input,1);
}

/** One control changes one side unless the user explicitly enables linked editing. */
export function changeHedgeHeight(state,key,value) {
  const keys=['hedgeRear','hedgeLeft','hedgeRight'];
  if(!keys.includes(key))return sanitizeState(state);
  const next=sanitizeState({...state,[key]:value});
  if(next.linkedHedges)for(const side of keys)next[side]=next[key];
  return next;
}
