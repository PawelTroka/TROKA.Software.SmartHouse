/** Optional Sternicza basement concept. Dimensions remain design assumptions. */
export const GARAGE_FIELDS=Object.freeze({
  garageClearHeight:{label:'Base clear height under slab',min:2,max:3,step:.05,value:2.3,group:'garage-level'},
  garageSlabThickness:{label:'Living-floor slab allowance',min:.1,max:.5,step:.01,value:.30,group:'garage-level'},
  garageExtraDepth:{label:'Extra basement lowering',min:0,max:1,step:.05,value:0,group:'garage-level'},
  garageSpaces:{label:'Required parking spaces',min:2,max:2,step:1,value:2,group:'garage-ramp',unit:'cars',
    help:'The basement needs two cars side by side. Adjust the clear width below to check the fit.'},
  garageRampWidth:{label:'Ramp and garage clear width',min:2.8,max:6.4,step:.1,value:5.8,group:'garage-ramp'},
  garageInsideRun:{label:'Ramp continuation inside house',min:0,max:3,step:.1,value:2,group:'garage-ramp',unit:'m'},
  garageBottomApron:{label:'Flat apron at ramp foot',min:.2,max:1.5,step:.1,value:.4,group:'garage-ramp'},
  garageMaxGrade:{label:'Peak gradient limit to compare',min:10,max:30,step:1,value:25,group:'garage-ramp',unit:'%'},
  garageClearanceMm:{label:'Lowest car underside above level road',min:70,max:160,step:.1,value:105.6,group:'garage-car',unit:'mm'},
  garageReserveMm:{label:'Desired underside clearance reserve',min:0,max:60,step:1,value:30,group:'garage-car',unit:'mm'},
  garageProgress:{label:'Car position along the ramp',min:0,max:100,step:1,value:40,group:'garage-preview',unit:'%'},
});
export const GARAGE_DEFAULTS=Object.freeze({
  ...Object.fromEntries(Object.entries(GARAGE_FIELDS).map(([key,field])=>[key,field.value])),
  basementGarageEnabled:false,garageReverse:false,
});
// Read capacity before clamping so an explicitly narrow two-car study keeps
// its actual width and still fails the same clearance check.
export function upgradeSingleCarGarage(settings){
  if(settings.garageSpaces!==1)return settings;
  const width=Number.isFinite(settings.garageRampWidth)?settings.garageRampWidth:GARAGE_DEFAULTS.garageRampWidth;
  return {...settings,garageSpaces:GARAGE_DEFAULTS.garageSpaces,
    garageRampWidth:Math.max(width,GARAGE_DEFAULTS.garageRampWidth),costBasementGarageQuote:0};
}
// Presets retain measured floor levels, vehicle assumptions, garden and quotes.
const design=Object.fromEntries(Object.entries(GARAGE_FIELDS)
  .filter(([,field])=>['garage-level','garage-ramp'].includes(field.group)).map(([key,field])=>[key,field.value]));
export const GARAGE_PRESETS=Object.freeze([
  Object.freeze({id:'raised',label:'Raised basement',description:'Two cars side by side, a 5.8 m clear entrance, and 2 m of ramp inside the raised house.',patch:Object.freeze({...design})}),
  Object.freeze({id:'forecourt',label:'Front yard only',description:'Fit the whole descent and its transitions before the house wall.',patch:Object.freeze({...design,garageInsideRun:0})}),
  Object.freeze({id:'deeper',label:'0.6 m deeper',description:'Compare a deeper floor with the same front-yard approach.',patch:Object.freeze({...design,garageExtraDepth:.6})}),
]);
export function garagePresetState(id,current){
  if(current.siteId!=='sternicza-11')return {...current};
  current=upgradeSingleCarGarage(current);
  if(id==='none')return {...current,basementGarageEnabled:false};
  const preset=GARAGE_PRESETS.find(item=>item.id===id);
  return preset?{...current,...preset.patch,basementGarageEnabled:true}:{...current};
}
export function matchesGaragePreset(id,current){
  if(current.siteId!=='sternicza-11')return false;
  if(id==='none')return !current.basementGarageEnabled;
  const preset=GARAGE_PRESETS.find(item=>item.id===id);
  return Boolean(preset&&current.basementGarageEnabled&&Object.entries(preset.patch).every(([key,value])=>current[key]===value));
}
/** Preview moves and sunlight cannot change the full-drive assessment. */
export const GARAGE_GEOMETRY_KEYS=Object.freeze(['siteId','basementGarageEnabled','floorHeight',
  ...Object.keys(GARAGE_FIELDS).filter(key=>key!=='garageProgress')]);
export function garageGeometryKey(settings){
  return JSON.stringify(GARAGE_GEOMETRY_KEYS.map(key=>settings[key]));
}
/** Reuse the assessment across unrelated scene and sidebar updates. */
export function createGarageLayoutCache(evaluate){
  let previousKey,previousSite,previousTerrain,previousTerrainAt,previousLayout;
  return (settings,data,options)=>{
    const key=garageGeometryKey(settings);
    if(key!==previousKey||data?.site!==previousSite||data?.terrain!==previousTerrain||options?.terrainAt!==previousTerrainAt){
      previousLayout=evaluate(settings,data,options);
      previousKey=key;previousSite=data?.site;previousTerrain=data?.terrain;previousTerrainAt=options?.terrainAt;
    }
    return previousLayout;
  };
}
