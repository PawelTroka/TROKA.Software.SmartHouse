import {FIELDS,DEFAULTS,STATE_VERSION,sanitizeState,encodeState,decodeState,scenarioState,migrateSavedState,migrateLegacyState,changeHedgeHeight} from './state.js?v=1.2.0';
import {COST_FIELDS,COST_DEFAULTS,estimateCosts} from './costs.js?v=1.2.0';
import {BUILDING_FIELDS,BUILDING_TARGETS,buildingAssumptions,applyBuildingOverrides} from './buildings.js?v=1.2.0';
import {renderBudget,renderPriceSources} from './budget-view.js?v=1.2.0';
import {observerForPreset,analyzeVisibility,floorElevation,gardenGroundAt} from './geometry.js';
import {renderPlan,renderSection} from './diagrams.js';
import {getSolarState,analyzeSunlight,dailySunlight} from './solar.js?v=1.2.0';
import {createSolarView} from './solar-view.js?v=1.2.0';

const $=id=>document.getElementById(id);
const storageKey='sternicza-garden-lab-v3';
const previousStorageKey='sternicza-garden-lab-v2';
const legacyStorageKey='sternicza-garden-lab-v1';
const safeRead=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
function readSaved(suffix=''){
  const saved=safeRead(`${storageKey}${suffix}`,null);if(saved)return sanitizeState(saved);
  const previous=safeRead(`${previousStorageKey}${suffix}`,null);if(previous)return migrateSavedState(previous,2);
  const legacy=safeRead(`${legacyStorageKey}${suffix}`,null);if(legacy)return migrateLegacyState(legacy);
  return suffix?null:{...DEFAULTS};
}
let settings=/^#v=/.test(location.hash)?decodeState(location.hash):readSaved();
let baseData,data,scene,observer,analysis,costEstimate,updateTimer,toastTimer,lastSceneMode;
let comparisonA=readSaved('-A'),comparisonB=null,showingA=false;
if(comparisonA)comparisonA=sanitizeState(comparisonA);
let solar,sunlight,solarTimeline,solarTimelineKey='',solarUpdateTimer;
const solarGeometryKeys=['hedgeRear','hedgeLeft','hedgeRight','hedgeInset','gardenRaise','bedRaise','raiseNewHedges','floorHeight','removeGarage','canopyEnabled','canopyDepth','canopyHeight','canopyWidth','fasciaDepth','terraceDepth','includeHighFeatures',...Object.keys(BUILDING_FIELDS)];
const solarView=createSolarView({onChange:patch=>{
  settings=sanitizeState({...settings,...patch});showingA=false;comparisonB=null;
  clearTimeout(solarUpdateTimer);solarUpdateTimer=setTimeout(()=>{refreshSolar();scene?.updateSolar?.(settings,solar);persist();syncControls();},30);
}});
const fmt=(v,d=1)=>Number.isFinite(v)?v.toFixed(d):'—';
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3500);}
function persist(){try{localStorage.setItem(storageKey,JSON.stringify(settings));}catch{}}

function buildFields(){
  const costHeadings={costSpacing:'Thujas & planting',costAreaOverride:'Soil quantities',costFillRate:'Materials & transport',costRetainingAllowance:'Site allowances'};
  for(const [key,f] of Object.entries(FIELDS)){
    if(f.group==='look'||f.group==='solar')continue;
    const host=$(`${f.group}-controls`),field=document.createElement('div');
    field.className=f.group==='cost'?'field cost-field':'field';field.dataset.field=key;
    if(f.group==='building')field.dataset.building=key.match(/^b(\d+)/)[1];
    const unit=f.unit||'m',spokenUnit=unit==='m'?'metres':unit;
    if(costHeadings[key]){const h=document.createElement('h4');h.textContent=costHeadings[key];host.append(h);}
    if(f.group==='cost'){
      field.innerHTML=`<label for="${key}">${f.label}</label><div class="cost-input"><input id="${key}" type="number" min="${f.min}" max="${f.max}" step="${f.step}" aria-label="${f.label} in ${spokenUnit}"><span>${unit}</span></div>${f.help?`<p class="field-note">${f.help}</p>`:''}`;
    }else{
      field.innerHTML=`<div class="field-top"><label for="${key}">${f.label}</label><span class="value-input"><input id="${key}-value" type="number" min="${f.min}" max="${f.max}" step="${f.step}" aria-label="${f.label} in ${spokenUnit}"><span>${unit}</span></span></div><input id="${key}" type="range" min="${f.min}" max="${f.max}" step="${f.step}"><div class="range-labels"><span>${f.min} ${unit}</span><span>${f.max} ${unit}</span></div>`;
    }
    host.append(field);
    const change=value=>{
      if(value==='')return;
      const n=Number(value);if(!Number.isFinite(n))return;
      settings[key]=Math.max(f.min,Math.min(f.max,n));
      if(['hedgeRear','hedgeLeft','hedgeRight'].includes(key))settings=changeHedgeHeight(settings,key,settings[key]);
      if(key==='observerX'||key==='observerY')settings.preset='custom';
      if(showingA){showingA=false;comparisonB=null;}
      $('scenario').value='custom';syncControls();scheduleUpdate();
    };
    $(key).addEventListener('input',e=>change(e.target.value));
    if(f.group==='cost')$(key).addEventListener('change',()=>{syncControls();});
    if($(`${key}-value`)){
      $(`${key}-value`).addEventListener('input',e=>change(e.target.value));
      $(`${key}-value`).addEventListener('change',e=>change(e.target.value));
      $(`${key}-value`).addEventListener('keydown',e=>{if(e.key==='Enter')e.target.blur();});
    }
  }
  for(const b of BUILDING_TARGETS){const option=document.createElement('option');option.value=b.index;option.textContent=b.label;$('building-select').append(option);}
  const high=document.createElement('label');high.className='switch-row';
  high.innerHTML='<span>Include tall unverified roof returns<small>Sensitivity check for the thin feature near PCK 3.</small></span><input id="includeHighFeatures" type="checkbox" role="switch">';
  $('assumption-controls').append(high);
}

function syncBuildingControls(){
  const selected=Number($('building-select').value);
  document.querySelectorAll('[data-building]').forEach(f=>f.hidden=Number(f.dataset.building)!==selected);
  if(!baseData)return;
  const assumptions=buildingAssumptions(baseData,settings),b=assumptions.find(x=>x.index===selected);
  if(b)$('building-baseline').innerHTML=`<div><span>Roof height above base</span><strong>${fmt(b.baselineHeight,2)} <small>→</small> ${fmt(b.height,2)} m</strong></div><div><span>House → building centre</span><strong>${fmt(b.baselineDistance,2)} <small>→</small> ${fmt(b.distance,2)} m</strong></div><small>Mapped baseline → current comparison</small>`;
  const active=assumptions.filter(x=>x.active);
  $('building-overrides-note').textContent=active.length?`${active.length} building${active.length===1?'':'s'} adjusted for this comparison. Reset restores the mapped data.`:'Using mapped buildings. No geometry overrides.';
  $('geometry-status').textContent=active.length?`What-if geometry · ${active.length} building${active.length===1?'':'s'} adjusted`:'2024 terrain + building data';
  $('geometry-status').classList.toggle('what-if',active.length>0);
  $('reset-building').disabled=!b?.active;
  $('reset-buildings').disabled=!active.length;
}

function syncControls(){
  for(const [key,f] of Object.entries(FIELDS)){
    if(!$(key))continue;
    if(f.group!=='cost'||document.activeElement!==$(key))$(key).value=settings[key];
    $(key).style.setProperty('--progress',`${100*(settings[key]-f.min)/(f.max-f.min)}%`);
    if($(`${key}-value`)&&document.activeElement!==$(`${key}-value`))$(`${key}-value`).value=fmt(settings[key],f.step<.1?2:1);
  }
  for(const key of ['raiseNewHedges','canopyEnabled','removeGarage','showRays','includeHighFeatures','buyNewThujas'])$(key).checked=settings[key];
  $('canopy-controls').hidden=!settings.canopyEnabled;
  document.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.preset===settings.preset)));
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===settings.mode)));
  $('link-hedges').checked=settings.linkedHedges;
  syncBuildingControls();
  $('compare').disabled=!comparisonA;
  $('compare-mobile').disabled=!comparisonA;
  $('compare').textContent=showingA?'Return to B':'Compare A/B';
  $('compare-mobile').textContent=showingA?'Return to B':'Compare A/B';
  $('comparison-status').textContent=showingA?'Viewing saved A':'Live configuration';
  const scenarioKeys=['hedgeRear','hedgeLeft','hedgeRight','gardenRaise','bedRaise','canopyEnabled','raiseNewHedges'];
  $('scenario').value=['default','starter','raised','tall','canopy'].find(name=>{
    const candidate=scenarioState(name,DEFAULTS);
    return scenarioKeys.every(k=>candidate[k]===settings[k])&&(!settings.canopyEnabled||['canopyDepth','canopyHeight','canopyWidth','fasciaDepth'].every(k=>candidate[k]===settings[k]));
  })||'custom';
}

function moveObserver({x,y}){
  settings=sanitizeState({...settings,observerX:x,observerY:y,preset:'custom',eyeHeight:1.65});
  showingA=false;syncControls();update();
}

function showMode(reset=false){
  const mode=settings.mode;
  $('viewport').dataset.mode=mode;
  $('scene-host').hidden=mode==='plan'||mode==='section';
  $('plan-host').hidden=mode!=='plan';
  $('section-host').hidden=mode!=='section';
  $('view-badge').hidden=mode==='plan'||mode==='section';
  $('reset-camera').hidden=mode==='plan'||mode==='section';
  const instructions={orbit:'Drag to orbit · scroll or pinch to zoom',eye:'Drag to look around · scroll or pinch to change field of view',plan:'Tap inside the plot to move your viewpoint',section:'One sampled line of sight · exact distances, exaggerated height if labeled'};
  $('view-instructions').textContent=instructions[mode];
  if(mode==='plan')renderPlan($('plan-host'),data,settings,observer,analysis,moveObserver);
  else if(mode==='section')renderSection($('section-host'),data,settings,observer,analysis);
  else if(scene){if(reset||lastSceneMode!==mode){scene.setView(mode,observer,settings);lastSceneMode=mode;}scene.resize();}
}

function update(){
  if(!data)return;
  const started=performance.now();
  data=applyBuildingOverrides(baseData,settings);
  syncBuildingControls();
  observer=observerForPreset(settings.preset,settings,data);
  analysis=analyzeVisibility(observer,settings,data);
  refreshSolar();
  scene?.update(settings,observer,analysis,data,solar);
  costEstimate=estimateCosts(settings,data);
  renderBudget(costEstimate,settings);
  showMode();
  $('view-badge-text').textContent=observer.label;
  $('observer-readout').textContent=`Eye ${fmt(observer.z-data.site.floorReference.z,2)} m above original garden reference · ${fmt(observer.eyeHeight,2)} m above ${observer.surface==='floor'?'floor':'local ground'}`;
  const pct=analysis.blockedPercent;
  $('blocked-percent').textContent=fmt(pct,1);
  $('coverage-bar').style.width=`${pct}%`;
  const complete=analysis.visible===0;
  $('blocked-pill').textContent=complete?'All sampled points':'Some views remain';
  $('blocked-pill').classList.toggle('complete',complete);
  $('sample-count').textContent=`${analysis.blocked.toLocaleString()} of ${analysis.total.toLocaleString()} sampled points blocked from this viewpoint.`;
  $('required-height').textContent=fmt(analysis.worstRequiredHedge.rear,1);
  $('required-caption').textContent=`${settings.raiseNewHedges?'Above new planting ground':'Above original ground'}. Without canopy; mapped surrounding buildings still screen some rays.`;
  $('hedge-basis').textContent=settings.raiseNewHedges?'Plant height is above the new planting ground (garden fill + extra bed height). Hedges are ideal continuous, opaque screens.':'Heights refer to original ground. Existing foliage stays fixed; adding soil reduces its exposed height. Screens are ideal and opaque.';
  const [mx,rearY]=data.site.rearMidpoint;
  const drop=floorElevation(settings,data)-gardenGroundAt(mx,rearY+settings.terraceDepth+.1,settings,data);
  $('terrace-drop').textContent=fmt(Math.abs(drop),2);
  $('drop-caption').textContent=drop>=0?'Vertical drop at the terrace edge.':'Garden is above the terrace at this edge.';
  const rows=$('building-rows');rows.replaceChildren();
  for(const block of analysis.byBlock){
    const row=document.createElement('div');row.className='building-row';
    const dot=document.createElement('i');dot.className=`dot ${block.visible===0?'blocked':''}`;
    const label=document.createElement('span');label.textContent=block.label;
    const count=document.createElement('span');count.textContent=`${block.visible} / ${block.total}`;
    row.append(dot,label,count);rows.append(row);
  }
  if(!settings.raiseNewHedges)$('fill-insight').textContent='Existing hedge tops stay at their original elevation. Raising the garden lifts a standing observer, but does not lift the foliage.';
  else if(settings.gardenRaise>0)$('fill-insight').textContent=`The garden rises ${fmt(settings.gardenRaise,2)} m; new hedge tops rise ${fmt(settings.gardenRaise+settings.bedRaise,2)} m including the extra beds. The house and terrace stay fixed. A garden observer rises with the ground.`;
  else if(settings.bedRaise>0)$('fill-insight').textContent=`Only the planting beds rise ${fmt(settings.bedRaise,2)} m. The same hedge reaches ${fmt(settings.bedRaise,2)} m higher while your viewpoint stays fixed.`;
  else $('fill-insight').textContent='Try +0.50 m of garden fill, then compare it with +0.50 m under just the hedges. The floor of the house stays fixed.';
  $('viewport').dataset.calculationMs=String(Math.round(performance.now()-started));
  $('viewport').dataset.visible=String(analysis.visible);
  $('viewport').dataset.samples=String(analysis.total);
  persist();
}
function scheduleUpdate(){clearTimeout(updateTimer);updateTimer=setTimeout(update,65);}

function refreshSolar(){
  if(!data)return;
  solar=getSolarState(settings.solarDate,settings.solarTime,data);
  sunlight=analyzeSunlight(solar,settings,data);
  const key=JSON.stringify([settings.solarDate,...solarGeometryKeys.map(k=>settings[k])]);
  if(key!==solarTimelineKey){solarTimelineKey=key;solarTimeline=dailySunlight(settings.solarDate,settings,data,30);}
  solarView.render(settings,solar,sunlight,solarTimeline);
}

buildFields();
if(window.matchMedia('(max-width:760px)').matches)$('building-details').open=false;
syncControls();
$('save-a-mobile').addEventListener('click',()=>$('save-a').click());
$('compare-mobile').addEventListener('click',()=>$('compare').click());
document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{
  settings.preset=b.dataset.preset;
  settings.eyeHeight=settings.preset==='sofa'?1.2:settings.preset==='jacuzzi'?.7:1.65;
  settings.lookYaw=0;settings.lookPitch=0;showingA=false;
  if(settings.preset==='custom')settings.mode='plan';
  syncControls();update();
}));
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{settings.mode=b.dataset.mode;syncControls();showMode(true);persist();}));
for(const key of ['raiseNewHedges','canopyEnabled','removeGarage','showRays','includeHighFeatures','buyNewThujas'])$(key).addEventListener('change',e=>{settings[key]=e.target.checked;showingA=false;$('scenario').value='custom';syncControls();update();});
$('link-hedges').addEventListener('change',e=>{settings.linkedHedges=e.target.checked;showingA=false;syncControls();persist();toast(settings.linkedHedges?'Linked: the next hedge edit will move all three sides.':'Hedge sliders now move independently.');});
$('building-select').addEventListener('change',syncBuildingControls);
$('reset-building').addEventListener('click',()=>{const b=BUILDING_TARGETS.find(x=>x.index===Number($('building-select').value));if(b){settings[b.heightKey]=0;settings[b.distanceKey]=0;showingA=false;syncControls();update();}});
$('reset-buildings').addEventListener('click',()=>{for(const key of Object.keys(BUILDING_FIELDS))settings[key]=0;showingA=false;syncControls();update();});
$('reset-costs').addEventListener('click',()=>{Object.assign(settings,COST_DEFAULTS);showingA=false;syncControls();update();toast('Cost assumptions restored; garden design unchanged.');});
$('edit-budget').addEventListener('click',e=>{e.preventDefault();$('budget-assumptions').open=true;$('budget-assumptions').scrollIntoView({behavior:'smooth',block:'start'});});
$('scenario').addEventListener('change',e=>{if(e.target.value!=='custom'){settings=scenarioState(e.target.value,settings);showingA=false;syncControls();update();}});
$('reset').addEventListener('click',()=>{solarView.pause();settings={...DEFAULTS};showingA=false;$('scenario').value='default';history.replaceState(null,'',location.pathname+location.search);syncControls();update();scene?.setView(settings.mode,observer,settings);toast('Defaults restored: 4 m hedges and +0.5 m garden');});
$('reset-camera').addEventListener('click',()=>{settings.lookYaw=0;settings.lookPitch=0;scene?.setView('orbit',observer,settings);scene?.setView(settings.mode,observer,settings);toast('View reset');});
$('save-a').addEventListener('click',()=>{comparisonA={...settings};comparisonB=null;showingA=false;try{localStorage.setItem(`${storageKey}-A`,JSON.stringify(comparisonA));}catch{}syncControls();toast('Scenario A saved. Change a setting, then compare.');});
$('compare').addEventListener('click',()=>{if(!comparisonA)return;solarView.pause();if(!showingA){comparisonB={...settings};settings={...comparisonA,mode:settings.mode};showingA=true;}else{settings={...comparisonB,mode:settings.mode};showingA=false;}syncControls();update();toast(showingA?'Showing saved scenario A':'Back to scenario B');});
$('share').addEventListener('click',async()=>{
  solarView.pause();
  const url=new URL(location.href);url.hash=encodeState(settings);history.replaceState(null,'',url);
  try{await navigator.clipboard.writeText(url.href);toast('Link copied with your current settings');}
  catch{toast('Your settings are in the address bar. Copy the page URL to share.');}
});
$('export').addEventListener('click',()=>{
  solarView.pause();refreshSolar();
  const content={schemaVersion:STATE_VERSION,project:'Sternicza Garden Lab',exportedAt:new Date().toISOString(),settings,costEstimate,solar,sunlight,solarTimeline,buildingAdjustments:baseData?buildingAssumptions(baseData,settings).filter(b=>b.active):[],summary:analysis?{observer,visible:analysis.visible,total:analysis.total,blockedPercent:analysis.blockedPercent,worstRequiredHedge:analysis.worstRequiredHedge}:null,note:'A sampled planning model, not a survey or a whole-property privacy guarantee. Solar clock: Europe/Warsaw. Direct-sun checks use ideal hedges and conservative roof envelopes; clouds and unmeasured trees are excluded.'};
  const url=URL.createObjectURL(new Blob([JSON.stringify(content,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='sternicza-scenario.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);toast('Scenario exported');
});
$('about-open').addEventListener('click',()=>$('about').showModal());
$('about-close').addEventListener('click',()=>$('about').close());
$('about').addEventListener('click',e=>{if(e.target===$('about')){const r=$('about').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('about').close();}});
window.addEventListener('hashchange',()=>{solarView.pause();settings=decodeState(location.hash);showingA=false;syncControls();update();});
window.addEventListener('resize',()=>{scene?.resize();if(data&&(settings.mode==='plan'||settings.mode==='section'))showMode();});

try{
  const response=await fetch(new URL('../data/site-data.json',import.meta.url));
  if(!response.ok)throw new Error(`Site data could not be loaded (${response.status})`);
  baseData=await response.json();data=applyBuildingOverrides(baseData,settings);
  fetch(new URL('../data/cost-sources.json',import.meta.url)).then(r=>{if(!r.ok)throw new Error('Price sources unavailable');return r.json();}).then(renderPriceSources).catch(()=>{$('price-date').textContent='Price references are also documented in the repository.';});
  try{
    const {createScene}=await import('./scene.js?v=1.2.0');
    scene=createScene($('scene-host'),data,{onPick:moveObserver,onCameraChange:angles=>{if(angles){if(Number.isFinite(angles.lookYaw))settings.lookYaw=angles.lookYaw;if(Number.isFinite(angles.lookPitch))settings.lookPitch=angles.lookPitch;}}});
    solarView.setRenderer(scene.rendererType);
    if(scene.available===false){settings.mode='plan';toast('3D is unavailable in this browser. Plan and sightline views still work.');}
  }catch(error){console.error('3D view unavailable',error);settings.mode='plan';solarView.setRenderer(null);toast('3D could not start. Plan and sightline views remain available.');}
  $('loading').hidden=true;syncControls();update();
}catch(error){
  console.error(error);$('loading').replaceChildren();const heading=document.createElement('strong');heading.textContent='The site model could not load.';const note=document.createElement('span');note.textContent='Refresh the page to retry. If running locally, serve the folder over HTTP.';$('loading').append(heading,note);
}
