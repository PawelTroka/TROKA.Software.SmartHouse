/** Illustrative evening lighting. Intensities are relative visual controls,
 * not measured luminance, electrical wattage or a lighting-design calculation. */
export const NIGHT_DEFAULTS=Object.freeze({
  nightGardenLights:true,nightPendantLights:true,nightHedgeLights:true,nightWindowLights:true,
  nightGardenIntensity:75,nightPendantIntensity:80,nightHedgeIntensity:85,
  nightWindowActivity:70,nightWindowIntensity:60,
});

const clamp=value=>Math.max(0,Math.min(1,value));
const percentage=(value,fallback)=>clamp((typeof value==='number'&&Number.isFinite(value)?value:fallback)/100);

/** Civil twilight fade follows the selected location/date's solar elevation.
 * A fixed clock cut-off would incorrectly switch off long summer evenings. */
export function nightLightingState(solar,settings={}){
  const elevation=solar?.elevation;
  const enabled=settings.sunEnabled!==false&&solar?.enabled!==false&&Number.isFinite(elevation);
  const t=enabled?clamp((elevation+6)/7):1;
  const activation=enabled?1-t*t*(3-2*t):0;
  const gardenEnabled=settings.nightGardenLights!==false;
  return {
    activation,
    gardenStrength:activation*(gardenEnabled?percentage(settings.nightGardenIntensity,NIGHT_DEFAULTS.nightGardenIntensity):0),
    pendantStrength:activation*(gardenEnabled&&settings.nightPendantLights!==false?percentage(settings.nightPendantIntensity,NIGHT_DEFAULTS.nightPendantIntensity):0),
    hedgeStrength:activation*(gardenEnabled&&settings.nightHedgeLights!==false?percentage(settings.nightHedgeIntensity,NIGHT_DEFAULTS.nightHedgeIntensity):0),
    windowStrength:activation*(settings.nightWindowLights!==false?percentage(settings.nightWindowIntensity,NIGHT_DEFAULTS.nightWindowIntensity):0),
    windowActivity:percentage(settings.nightWindowActivity,NIGHT_DEFAULTS.nightWindowActivity),
  };
}

/** FNV-1a maps an illustrative opening to a repeatable threshold. Occupancy is
 * deliberately stable when time, camera or planting controls are changed. It
 * is not a claim about any real resident or their actual evening schedule. */
export function windowActivityThreshold(window={}){
  const key=[window.buildingId??'',window.side??0,window.floor??0,window.column??0].join('|');
  let hash=2166136261;
  for(let i=0;i<key.length;i++){hash^=key.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return (hash>>>0)/4294967296;
}

export function isWindowLit(window,activity){
  if(!Number.isFinite(activity)||activity<=0)return false;
  if(activity>=1)return true;
  return windowActivityThreshold(window)<activity;
}
