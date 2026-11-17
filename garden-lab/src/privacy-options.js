/** Explicit optional design alternatives; none is a statement of planning approval. */
export const PRIVACY_FIELDS=Object.freeze({
  privacyPergolaHeight:{label:'Pergola height above garden',min:2.5,max:6,step:.1,value:5,group:'privacy-pergola'},
  privacyPergolaWidth:{label:'Pergola width',min:1,max:8,step:.1,value:5,group:'privacy-pergola'},
  privacyPergolaDepth:{label:'Pergola depth',min:1,max:5,step:.1,value:2,group:'privacy-pergola'},
  privacyPergolaX:{label:'Pergola near corner · across plot',min:.5,max:19.8,step:.1,value:10.5,group:'privacy-pergola'},
  privacyPergolaY:{label:'Pergola near corner · from street',min:18.5,max:37,step:.1,value:23.5,group:'privacy-pergola'},
  spaScreenHeight:{label:'Screen height above terrace',min:1,max:3,step:.05,value:2.2,group:'privacy-screen'},
  spaScreenWidth:{label:'Main screen width',min:1,max:5,step:.1,value:3.6,group:'privacy-screen'},
  spaScreenReturn:{label:'Side return length',min:0,max:3,step:.1,value:1.5,group:'privacy-screen'},
  spaScreenGap:{label:'Gap beyond jacuzzi edge',min:.1,max:2,step:.05,value:.65,group:'privacy-screen'},
});

export const PRIVACY_DEFAULTS=Object.freeze({
  ...Object.fromEntries(Object.entries(PRIVACY_FIELDS).map(([key,field])=>[key,field.value])),
  privacyPergolaEnabled:false,privacyPergolaFoliage:false,spaScreensEnabled:false,
});

export const PRIVACY_PRESETS=Object.freeze([
  {id:'spa',label:'Spa canopy + screens',description:'Opaque roof and an L-shaped screen near the jacuzzi.',
    patch:{privacyPergolaEnabled:false,privacyPergolaFoliage:false,spaScreensEnabled:true,spaScreenHeight:2.2,spaScreenWidth:3.6,spaScreenReturn:1.5,spaScreenGap:.65,canopyEnabled:true,canopyHeight:2.7,canopyWidth:8.5,fasciaDepth:.5}},
  {id:'pergola',label:'Planted pergola',description:'A 5 m internal pergola with ideal dense established planting.',
    patch:{...PRIVACY_DEFAULTS,privacyPergolaEnabled:true,privacyPergolaFoliage:true,canopyEnabled:false}},
  {id:'layered',label:'Combine both',description:'Planted pergola plus roof and local spa screens.',
    patch:{...PRIVACY_DEFAULTS,privacyPergolaEnabled:true,privacyPergolaFoliage:true,spaScreensEnabled:true,canopyEnabled:true,canopyHeight:2.7,canopyWidth:8.5,fasciaDepth:.5}},
]);

/** Keep the user's garden, trees, eye position, levels, prices and date intact. */
export function privacyPresetState(id,current){
  if(current.siteId!=='sternicza-11')return {...current};
  if(id==='none')return {...current,privacyPergolaEnabled:false,privacyPergolaFoliage:false,spaScreensEnabled:false,canopyEnabled:false};
  const preset=PRIVACY_PRESETS.find(item=>item.id===id);
  if(!preset||current.siteId!=='sternicza-11')return {...current};
  return {...current,...preset.patch,...(preset.patch.canopyEnabled?{canopyDepth:Math.min(6,Math.max(1,(current.terraceDepth||4.2)+1))}:{})};
}

export function matchesPrivacyPreset(id,current){
  if(current.siteId!=='sternicza-11')return false;
  if(id==='none')return !current.privacyPergolaEnabled&&!current.spaScreensEnabled&&!current.canopyEnabled;
  const preset=PRIVACY_PRESETS.find(item=>item.id===id);
  if(!preset||current.siteId!=='sternicza-11')return false;
  const candidate=privacyPresetState(id,current);
  return Object.keys(preset.patch).every(key=>candidate[key]===current[key])&&(!preset.patch.canopyEnabled||candidate.canopyDepth===current.canopyDepth);
}
