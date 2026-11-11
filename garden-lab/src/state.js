import {COST_FIELDS,COST_DEFAULTS} from './costs.js?v=1.2.0';
import {BUILDING_FIELDS} from './buildings.js?v=1.2.0';

export const STATE_VERSION = 3;

export const FIELDS = Object.freeze({
  hedgeRear: {label:'Rear hedge',min:0,max:15,step:0.1,value:4,group:'hedge'},
  hedgeLeft: {label:'Left side hedge',min:0,max:15,step:0.1,value:4,group:'hedge'},
  hedgeRight: {label:'Right side hedge',min:0,max:15,step:0.1,value:4,group:'hedge'},
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
  solarTime: {label:'Local time in Gdańsk',min:0,max:1439,step:1,value:780,group:'solar',unit:'min'},
  ...COST_FIELDS,
  ...BUILDING_FIELDS,
});
export const PRESETS = Object.freeze(['sofa','standing','terrace','jacuzzi','garden','custom']);
export const MODES = Object.freeze(['orbit','eye','plan','section']);
export const DEFAULTS = Object.freeze({...COST_DEFAULTS,...Object.fromEntries(Object.entries(FIELDS).map(([k,v])=>[k,v.value])),preset:'sofa',mode:'orbit',raiseNewHedges:true,canopyEnabled:false,removeGarage:true,showRays:false,includeHighFeatures:false,linkedHedges:false,solarDate:'2026-06-21',shadowsEnabled:true,showSunPath:true});
// Earlier links omitted values relative to a different baseline. Keep that
// baseline explicit so changing today's defaults cannot change a saved design.
const LEGACY_DEFAULTS = Object.freeze({...DEFAULTS,hedgeRear:2.5,hedgeLeft:2.5,hedgeRight:2.5,gardenRaise:0});
const isStateRecord=input=>Boolean(input&&typeof input==='object'&&!Array.isArray(input));

export function isValidSolarDate(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const [year,month,day]=value.split('-').map(Number);
  if(year<2000||year>2100)return false;
  const date=new Date(Date.UTC(year,month-1,day));
  return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day;
}

function sanitizeWithDefaults(input,defaults) {
  const out={...defaults};
  if (!isStateRecord(input)) return out;
  for (const [key,f] of Object.entries(FIELDS)) {
    if (typeof input[key]==='number' && Number.isFinite(input[key])) out[key]=Math.max(f.min,Math.min(f.max,input[key]));
  }
  out.solarTime=Math.round(out.solarTime);
  for (const key of Object.keys(DEFAULTS).filter(k=>typeof DEFAULTS[k]==='boolean')) if(typeof input[key]==='boolean') out[key]=input[key];
  if(PRESETS.includes(input.preset))out.preset=input.preset;
  if(MODES.includes(input.mode))out.mode=input.mode;
  if(isValidSolarDate(input.solarDate))out.solarDate=input.solarDate;
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
  if(!['1','2',String(STATE_VERSION)].includes(p.get('v')))return {...DEFAULTS};
  for(const [key,val] of p){if(Object.hasOwn(FIELDS,key)){if(val.trim()!=='')s[key]=Number(val);}else if(typeof DEFAULTS[key]==='boolean'){if(val==='true'||val==='false')s[key]=val==='true';}else if(key==='preset'||key==='mode'||key==='solarDate')s[key]=val;}
  return sanitizeWithDefaults(s,p.get('v')===String(STATE_VERSION)?DEFAULTS:LEGACY_DEFAULTS);
}
export function scenarioState(name,current=DEFAULTS) {
  const s=sanitizeState({...current,hedgeRear:2.5,hedgeLeft:2.5,hedgeRight:2.5,gardenRaise:0,bedRaise:0,canopyEnabled:false,raiseNewHedges:true});
  if(name==='default')Object.assign(s,{hedgeRear:4,hedgeLeft:4,hedgeRight:4,gardenRaise:.5});
  if(name==='raised')Object.assign(s,{hedgeRear:4,hedgeLeft:4,hedgeRight:4,bedRaise:.5});
  if(name==='tall'||name==='canopy')Object.assign(s,{hedgeRear:6,hedgeLeft:6,hedgeRight:6});
  if(name==='canopy')Object.assign(s,{canopyEnabled:true,canopyHeight:2.7,canopyDepth:4.2,canopyWidth:8.5,fasciaDepth:.3});
  return s;
}

/** Restore saved designs against their original defaults, including partial saves. */
export function migrateSavedState(input,version=2) {
  if(!isStateRecord(input)||![1,2,STATE_VERSION].includes(version))return {...DEFAULTS};
  const next=sanitizeWithDefaults(input,version===STATE_VERSION?DEFAULTS:LEGACY_DEFAULTS);
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
