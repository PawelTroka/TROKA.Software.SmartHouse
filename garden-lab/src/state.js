export const FIELDS = Object.freeze({
  hedgeRear: {label:'Rear hedge',min:0,max:15,step:0.1,value:2.5,group:'hedge'},
  hedgeLeft: {label:'Left side hedge',min:0,max:15,step:0.1,value:2.5,group:'hedge'},
  hedgeRight: {label:'Right side hedge',min:0,max:15,step:0.1,value:2.5,group:'hedge'},
  gardenRaise: {label:'Raise the whole rear garden',min:0,max:1,step:0.05,value:0,group:'terrain'},
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
});
export const PRESETS = Object.freeze(['sofa','standing','terrace','jacuzzi','garden','custom']);
export const MODES = Object.freeze(['orbit','eye','plan','section']);
export const DEFAULTS = Object.freeze({...Object.fromEntries(Object.entries(FIELDS).map(([k,v])=>[k,v.value])),preset:'sofa',mode:'orbit',raiseNewHedges:true,canopyEnabled:false,removeGarage:true,showRays:false,includeHighFeatures:false,linkedHedges:true});
export function sanitizeState(input={}) {
  const out={...DEFAULTS};
  if (!input || typeof input!=='object' || Array.isArray(input)) return out;
  for (const [key,f] of Object.entries(FIELDS)) {
    if (typeof input[key]==='number' && Number.isFinite(input[key])) out[key]=Math.max(f.min,Math.min(f.max,input[key]));
  }
  for (const key of ['raiseNewHedges','canopyEnabled','removeGarage','showRays','includeHighFeatures','linkedHedges']) if(typeof input[key]==='boolean') out[key]=input[key];
  if(PRESETS.includes(input.preset))out.preset=input.preset;
  if(MODES.includes(input.mode))out.mode=input.mode;
  return out;
}
export function encodeState(state) {
  const s=sanitizeState(state),p=new URLSearchParams({v:'1'});
  for(const [key,val] of Object.entries(s)) if(val!==DEFAULTS[key])p.set(key,typeof val==='number'?String(Math.round(val*10000)/10000):String(val));
  return p.toString();
}
export function decodeState(hash) {
  const p=new URLSearchParams(hash.replace(/^#/,'')),s={};
  if(p.get('v')!=='1')return {...DEFAULTS};
  for(const [key,val] of p){if(key in FIELDS)s[key]=Number(val);else if(typeof DEFAULTS[key]==='boolean')s[key]=val==='true';else if(key==='preset'||key==='mode')s[key]=val;}
  return sanitizeState(s);
}
export function scenarioState(name,current=DEFAULTS) {
  const s=sanitizeState({...current,hedgeRear:2.5,hedgeLeft:2.5,hedgeRight:2.5,gardenRaise:0,bedRaise:0,canopyEnabled:false,raiseNewHedges:true,linkedHedges:true});
  if(name==='raised')Object.assign(s,{hedgeRear:4,hedgeLeft:4,hedgeRight:4,bedRaise:.5});
  if(name==='tall'||name==='canopy')Object.assign(s,{hedgeRear:6,hedgeLeft:6,hedgeRight:6});
  if(name==='canopy')Object.assign(s,{canopyEnabled:true,canopyHeight:2.7,canopyDepth:4.2,canopyWidth:8.5,fasciaDepth:.3});
  return s;
}
