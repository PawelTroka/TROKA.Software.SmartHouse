import {nightLightingState} from './night-lighting.js?v=1.17.0';

const $=id=>document.getElementById(id);

/** UI describes the visual scenario, without implying measured occupancy/lux. */
export function renderNightReadouts(sun,settings){
  const light=nightLightingState(sun,settings);
  const active=light.activation>.001;
  const phase=!settings.sunEnabled?'Neutral daylight':!active?'Daylight':light.activation<.99?'Dusk':'After dark';
  $('night-summary').textContent=`${phase} · ${active&&(light.gardenStrength>0||(light.windowStrength>0&&light.windowActivity>0))?'lights on':'lights off'}`;
  $('nightGardenLights').checked=settings.nightGardenLights;
  $('nightWindowLights').checked=settings.nightWindowLights;
  $('night-status').textContent=!settings.sunEnabled
    ?'Preview night enables the sun clock and moves to 23:30 on the selected date.'
    :!active?'Lights are off in daylight. Preview night moves to 23:30; the time slider lets you explore the transition at dusk.'
    :`${phase}: garden brightness ${settings.nightGardenLights?Math.round(settings.nightGardenIntensity):0}%. Neighbouring windows: ${settings.nightWindowLights?`about ${Math.round(settings.nightWindowActivity)}% active, at ${Math.round(settings.nightWindowIntensity)}% brightness`:'off'}. The same windows stay selected when you change viewpoint.`;
  for(const key of ['nightGardenIntensity','nightWindowActivity','nightWindowIntensity']){
    const disabled=key==='nightGardenIntensity'?!settings.nightGardenLights:!settings.nightWindowLights;
    $(key).disabled=disabled;$(`${key}-value`).disabled=disabled;
    $(key).closest('.field').classList.toggle('night-field-disabled',disabled);
  }
  $('viewport').dataset.nightActivation=light.activation.toFixed(3);
  $('viewport').dataset.nightGarden=light.gardenStrength.toFixed(3);
  $('viewport').dataset.nightWindows=light.windowStrength.toFixed(3);
  $('preview-night').setAttribute('aria-pressed',String(active));
  return light;
}
