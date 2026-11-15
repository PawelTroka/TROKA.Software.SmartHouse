/** Illustrative evening lighting. Intensities are relative visual controls,
 * not measured luminance, electrical wattage or a lighting-design calculation. */
export const NIGHT_DEFAULTS=Object.freeze({
  nightGardenLights:true,nightWindowLights:true,
  nightGardenIntensity:75,nightWindowActivity:35,nightWindowIntensity:60,
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
  return {
    activation,
    gardenStrength:activation*(settings.nightGardenLights!==false?percentage(settings.nightGardenIntensity,75):0),
    windowStrength:activation*(settings.nightWindowLights!==false?percentage(settings.nightWindowIntensity,60):0),
    windowActivity:percentage(settings.nightWindowActivity,35),
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
