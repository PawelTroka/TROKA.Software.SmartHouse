import {nightLightingState} from './night-lighting.js?v=1.41.0';

const $=id=>document.getElementById(id);

/** UI describes the visual scenario, without implying measured occupancy/lux. */
export function renderNightReadouts(sun,settings){
  const light=nightLightingState(sun,settings);
  const active=light.activation>.001;
  const phase=!settings.sunEnabled?'Neutral daylight':!active?'Daylight':light.activation<.99?'Dusk':'After dark';
  const gardenOn=light.gardenStrength>0||light.pendantStrength>0||light.hedgeStrength>0;
  $('night-summary').textContent=`${phase} · ${active&&(gardenOn||(light.windowStrength>0&&light.windowActivity>0))?'lights on':'lights off'}`;
  for(const key of ['nightGardenLights','nightPendantLights','nightHedgeLights','nightWindowLights'])$(key).checked=settings[key];
  for(const key of ['nightPendantLights','nightHedgeLights']){
    $(key).disabled=!settings.nightGardenLights;
    $(key).closest('.switch-row').classList.toggle('night-field-disabled',!settings.nightGardenLights);
  }
  const pendantLevel=settings.nightPendantLights?`${Math.round(settings.nightPendantIntensity)}%`:'off';
  const hedgeLevel=settings.nightHedgeLights?`${Math.round(settings.nightHedgeIntensity)}%`:'off';
  const gardenStatus=settings.nightGardenLights
    ?`landscape accents ${Math.round(settings.nightGardenIntensity)}%, pendants ${pendantLevel}, thuja lanterns ${hedgeLevel}`
    :'garden lighting off';
  $('night-status').textContent=!settings.sunEnabled
    ?'Preview night enables the sun clock and moves to 23:30 on the selected date.'
    :!active?'Lights are off in daylight. Preview night moves to 23:30; the time slider lets you explore the transition at dusk.'
    :`${phase}: ${gardenStatus}. Neighbouring windows: ${settings.nightWindowLights?`about ${Math.round(settings.nightWindowActivity)}% active, at ${Math.round(settings.nightWindowIntensity)}% brightness`:'off'}. The same windows stay selected when you change viewpoint.`;
  const dimmers={
    nightGardenIntensity:!settings.nightGardenLights,
    nightPendantIntensity:!settings.nightGardenLights||!settings.nightPendantLights,
    nightHedgeIntensity:!settings.nightGardenLights||!settings.nightHedgeLights,
    nightWindowActivity:!settings.nightWindowLights,
    nightWindowIntensity:!settings.nightWindowLights,
  };
  for(const [key,disabled] of Object.entries(dimmers)){
    $(key).disabled=disabled;$(`${key}-value`).disabled=disabled;
    $(key).closest('.field').classList.toggle('night-field-disabled',disabled);
  }
  $('viewport').dataset.nightActivation=light.activation.toFixed(3);
  $('viewport').dataset.nightGarden=light.gardenStrength.toFixed(3);
  $('viewport').dataset.nightPendants=light.pendantStrength.toFixed(3);
  $('viewport').dataset.nightHedge=light.hedgeStrength.toFixed(3);
  $('viewport').dataset.nightWindows=light.windowStrength.toFixed(3);
  $('preview-night').setAttribute('aria-pressed',String(active));
  return light;
}
