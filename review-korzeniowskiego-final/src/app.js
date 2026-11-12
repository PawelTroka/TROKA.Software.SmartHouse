import {createStateModel,STATE_VERSION} from './state.js?v=1.4.0';
import {SITE_OPTIONS,DEFAULT_SITE_ID,resolveSiteId,getSiteProfile} from './sites.js?v=1.4.0';
import {COST_FIELDS,COST_DEFAULTS,estimateCosts} from './costs.js?v=1.4.0';
import {buildingFields,getBuildingTargets,buildingAssumptions,applyBuildingOverrides} from './buildings.js?v=1.4.0';
import {renderBudget,renderPriceSources} from './budget-view.js?v=1.4.0';
import {observerForPreset,analyzeVisibility,terraceGroundReference} from './geometry.js?v=1.4.0';
import {renderPlan,renderSection} from './diagrams.js?v=1.4.0';
import {sunForSettings,sanitizeSolarDate} from './solar.js?v=1.4.0';
import {analyzeSunlight} from './shade.js?v=1.4.0';
import {renderSunReadouts,renderSunMap} from './sun-view.js?v=1.4.0';

const $=id=>document.getElementById(id);
const selectedSiteId=resolveSiteId(location.search,location.hash);
const siteOption=getSiteProfile(selectedSiteId);
let ready=false;
for(const option of SITE_OPTIONS){const node=document.createElement('option');node.value=option.id;node.textContent=option.label;$('site-select').append(node);}
$('site-select').value=selectedSiteId;
$('site-select').addEventListener('change',event=>{
  if(ready)persist();
  const url=new URL(location.href);url.searchParams.set('site',event.target.value);url.hash='';
  location.assign(url.href);
});
let baseData;
try{
  const response=await fetch(new URL(`../${siteOption.dataPath}`,import.meta.url));
  if(!response.ok)throw new Error(`Site data could not be loaded (${response.status})`);
  baseData=await response.json();
}catch(error){
  console.error(error);$('loading').replaceChildren();
  const heading=document.createElement('strong');heading.textContent=`${siteOption.label} could not load.`;
  const note=document.createElement('span');note.textContent='Refresh to retry, or choose another property above.';
  $('loading').append(heading,note);throw error;
}
const profile=getSiteProfile(selectedSiteId,baseData);
const canonicalURL=new URL(location.href);
if(canonicalURL.searchParams.get('site')!==profile.id){canonicalURL.searchParams.set('site',profile.id);history.replaceState(null,'',canonicalURL);}
const {FIELDS,DEFAULTS,sanitizeState,encodeState,decodeState,scenarioState,migrateSavedState,changeHedgeHeight}=createStateModel(profile);
const BUILDING_TARGETS=getBuildingTargets(baseData),BUILDING_FIELDS=buildingFields(baseData);
const storageKey=`garden-lab-${profile.id}-v${STATE_VERSION}`;
const safeRead=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
function readSaved(suffix=''){
  const current=safeRead(`${storageKey}${suffix}`,null);
  if(current&&typeof current==='object'&&!Array.isArray(current)&&current.siteId===profile.id)return migrateSavedState(current,STATE_VERSION);
  if(profile.id===DEFAULT_SITE_ID)for(const version of [5,4,3,2,1]){
    const saved=safeRead(`sternicza-garden-lab-v${version}${suffix}`,null);
    if(saved&&typeof saved==='object'&&!Array.isArray(saved))return migrateSavedState(saved,version);
  }
  return suffix?null:{...DEFAULTS};
}
let settings=/^#v=[123456](?:&|$)/.test(location.hash)?decodeState(location.hash):readSaved();
if(!profile.hasGarage)settings.removeGarage=true;
let data,scene,observer,analysis,costEstimate,updateTimer,toastTimer,lastSceneMode,sun,shade,sunPlayback;
let comparisonA=readSaved('-A'),comparisonB=null,showingA=false;
if(comparisonA)comparisonA=sanitizeState(comparisonA);
const fmt=(v,d=1)=>Number.isFinite(v)?v.toFixed(d):'—';
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3500);}
function persist(){try{localStorage.setItem(storageKey,JSON.stringify(settings));}catch{}}

const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderSiteDetails(){
  const site=baseData.site,t=site.terrace,pool=site.pool,esc=escapeHTML;
  const width=site.frontage??profile.bounds.maxX-profile.bounds.minX,depth=site.depth??profile.bounds.maxY-profile.bounds.minY;
  document.title=`${profile.label} · Garden Lab`;
  document.querySelector('meta[name="description"]').content=`Explore privacy, garden levels, seasonal sunlight and costs at ${profile.address}.`;
  document.documentElement.dataset.site=profile.id;
  $('property-name').textContent=profile.label.toUpperCase();
  $('plot-dimensions').textContent=`${fmt(width,1)} × ${fmt(depth,1)} m · ${fmt(site.area,0)} m² mapped plot`;
  $('hedge-orientation').textContent=`Looking from the house into the rear garden: left is ${profile.sideLabels.left}, right is ${profile.sideLabels.right}.`;
  $('site-orientation').innerHTML=`Looking from house to garden (${esc(profile.rearBearingLabel)}): <strong>left = ${esc(profile.sideLabels.left)}</strong> · <strong>right = ${esc(profile.sideLabels.right)}</strong>. Plans keep the street at the top.`;
  $('terrace-proposal').textContent=`Proposed ${fmt(t.width,1)} m wide terrace, with a 2.2 × 2.2 m built-in jacuzzi on the right when looking out.`;
  $('floor-assumption-note').textContent=`The initial living floor is assumed ${fmt(DEFAULTS.floorHeight,1)} m above the original garden reference. Adjust it to a measured level. Garden levels come from the terrain grid.`;
  $('removeGarage').closest('label').hidden=!profile.hasGarage;$('removeGarage').disabled=!profile.hasGarage;
  const highCount=(baseData.buildings||[]).reduce((n,b)=>n+(b.highFeatures?.length||0),0);
  const roofCount=[site.house,site.garage,...baseData.buildings].filter(Boolean).reduce((n,b)=>n+(b.roofPoints?.length||0),0);
  const formatSource=source=>{
    try{const url=new URL(source.url);if(!['https:','http:'].includes(url.protocol))return '';return `<li><a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${esc(source.title)} ↗</a>${source.details?`<small>${esc(source.details)}</small>`:''}</li>`;}catch{return '';}
  };
  $('about-content').innerHTML=`<h2>${esc(profile.label)}.<br>Measured context. Adjustable design.</h2>
    <p>A planning simulator for ${esc(profile.address)}. The site and surrounding buildings come from public mapping and elevation data; the renovation and planting are proposals.</p>
    <h3>What the model knows</h3><ul>
      <li>Mapped parcel area ${fmt(site.area,2)} m²; frontage ${fmt(width,2)} m; local depth ${fmt(depth,2)} m.</li>
      <li>Parcel${(site.parcels?.length||0)>1?'s':''}: ${esc((site.parcels||[]).join(', '))}. A cadastral outline does not verify ownership or a sale boundary.</li>
      ${Number.isFinite(site.frontSetback)?`<li>The mapped house starts approximately ${fmt(site.frontSetback,2)} m from the street-side parcel boundary. This is not a surveyed curb-to-wall distance.</li>`:''}
      <li>Main house${profile.hasGarage?' and detached garage':''}, ${baseData.buildings.length} surrounding building volumes and a ${fmt(baseData.terrain.cellSize,0)} m terrain grid. ${roofCount?`${roofCount.toLocaleString()} reduced roof points provide selected roof detail.`:'Roofs use the available building model heights.'}</li></ul>
    <h3>Design assumptions</h3><p>The initial living floor is <strong>assumed +${fmt(DEFAULTS.floorHeight,1)} m</strong> above the original near-house garden reference. This is editable, and is not a measured floor survey. The ${fmt(t.width,1)} m terrace, ${fmt(pool.width,1)} × ${fmt(pool.length,1)} m pool, jacuzzi, glazing, furniture and finishes illustrate a renovation proposal.</p>
    <p>The house and terrace floor stay fixed when the garden rises. New hedges move with added soil only when that option is enabled. The initial comparison uses 4 m hedges and +0.5 m garden fill. Terrain retains its mapped slope under a uniform addition; fill does not create a level slab. Available terrace and canopy controls are fitted to this property's proposal.</p>
    <h3>How screening is calculated</h3><p>Rays run from the selected eye position to sampled facade and roof points on ${BUILDING_TARGETS.length} target buildings. Finite hedge screens, the terrace canopy and approximate surrounding building volumes can intercept them. The percentage is the share of sampled points blocked from one observer, not visual-field area or a whole-garden guarantee. Target buildings are considered regardless of camera direction.</p>
    <p>Own-house walls, window openings and ornamental planting are not surveyed obstructions and do not improve the privacy score. ${highCount?'Optional unverified high roof returns are excluded by default and can be included as a sensitivity comparison.':''} Building height and distance adjustments are what-if scenarios; Reset restores the mapped source geometry.</p>
    <h3>Orientation</h3><p>The rear garden axis is ${fmt(profile.rearBearing,2)}° true (${esc(profile.rearBearingLabel)}). Looking from the house into the garden, left is ${esc(profile.sideLabels.left)} (${esc(profile.leftBearingLabel)}) and right is ${esc(profile.sideLabels.right)} (${esc(profile.rightBearingLabel)}). Plans keep the street at the top and show true north.</p>
    <h3>Sun and shade</h3><p>The sun uses ${fmt(profile.latitude,6)}° N, ${fmt(profile.longitude,6)}° E with NOAA/Meeus equations and Europe/Warsaw local time, including daylight saving. Grid north is corrected to true north. Date, time and sun path are saved with each scenario.</p>
    <p>The shade map traces rays from outdoor samples on a 1 m grid. It includes modeled house roofs, neighbouring buildings, opaque hedges, canopy and local terrain. Pool and jacuzzi water use their rendered elevations. Percentages describe direct-sun sample points at the selected moment; they are not daily sunlight hours or irradiance. Existing tree crowns, decorative planting, clouds, diffuse light and reflections are excluded. Night is distinguished from architectural shade.</p>
    <h3>Costs and saved designs</h3><p>Thuja counts follow each selected hedge length and planting spacing. Soil quantities exclude the proposed terrace, pool and any retained garage. Rates, supplier quotes, transport, drainage and retaining allowances are editable. This is a planning budget, not an engineered earthwork design. Each property keeps its own settings and scenario A. Shared links and exports include the property identity. Existing Sternicza links remain readable.</p>
    <h3>Dataset limitations</h3><ul>${(baseData.limitations||[]).map(note=>`<li>${esc(note)}</li>`).join('')}</ul>
    <h3>Primary data sources</h3><ul class="source-links">${(baseData.sources||[]).map(formatSource).join('')}<li><a href="https://gml.noaa.gov/grad/solcalc/calcdetails.html" target="_blank" rel="noopener noreferrer">NOAA · solar calculation method ↗</a></li></ul>
    <p class="field-note">Horizontal source: ${esc(baseData.coordinates.horizontalCRS)}. Height datum: ${esc(baseData.coordinates.verticalDatum)}. Mapped geometry and floor/design assumptions should be checked against measurements before a construction decision.</p>`;
}

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
  const hasHighFeatures=baseData.buildings.some(b=>(b.highFeatures?.length||0)>0);
  high.innerHTML='<span>Include tall unverified roof returns<small>Sensitivity check for uncertain rooftop features.</small></span><input id="includeHighFeatures" type="checkbox" role="switch">';
  high.hidden=!hasHighFeatures;
  $('assumption-controls').append(high);
  $('includeHighFeatures').disabled=!hasHighFeatures;
  $('building-select').closest('.building-assumptions').hidden=BUILDING_TARGETS.length===0;
}

function syncBuildingControls(){
  const selected=Number($('building-select').value);
  document.querySelectorAll('[data-building]').forEach(f=>f.hidden=Number(f.dataset.building)!==selected);
  if(!baseData)return;
  const assumptions=buildingAssumptions(baseData,settings),b=assumptions.find(x=>x.index===selected);
  if(b)$('building-baseline').innerHTML=`<div><span>Roof height above base</span><strong>${fmt(b.baselineHeight,2)} <small>→</small> ${fmt(b.height,2)} m</strong></div><div><span>House → building centre</span><strong>${fmt(b.baselineDistance,2)} <small>→</small> ${fmt(b.distance,2)} m</strong></div><small>Mapped baseline → current comparison</small>`;
  const active=assumptions.filter(x=>x.active);
  $('building-overrides-note').textContent=active.length?`${active.length} building${active.length===1?'':'s'} adjusted for this comparison. Reset restores the mapped data.`:'Using mapped buildings. No geometry overrides.';
  $('geometry-status').textContent=active.length?`What-if geometry · ${active.length} building${active.length===1?'':'s'} adjusted`:'Mapped terrain + building data';
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
  if(!data)return;
  const mode=settings.mode;
  const diagram=['plan','section','sun'].includes(mode);
  $('viewport').dataset.mode=mode;
  $('scene-host').hidden=diagram;
  $('plan-host').hidden=mode!=='plan';
  $('section-host').hidden=mode!=='section';
  $('sun-host').hidden=mode!=='sun';
  $('view-badge').hidden=diagram;
  $('reset-camera').hidden=diagram;
  const instructions={orbit:'Drag to orbit · scroll or pinch to zoom',eye:'Drag to look around · scroll or pinch to change field of view',plan:'Tap inside the plot to move your viewpoint',section:'One sampled line of sight · exact distances, exaggerated height if labeled',sun:'Gold = direct sun · green = modeled shade · 1 m sample grid'};
  $('view-instructions').textContent=instructions[mode];
  if(mode==='plan')renderPlan($('plan-host'),data,settings,observer,analysis,moveObserver);
  else if(mode==='section')renderSection($('section-host'),data,settings,observer,analysis);
  else if(mode==='sun'){if(sun&&shade)renderSunMap($('sun-host'),data,settings,sun,shade);}
  else if(scene){if(reset||lastSceneMode!==mode){scene.setView(mode,observer,settings);lastSceneMode=mode;}scene.resize();}
}

function updateSun(refreshMap=true){
  if(!data)return;
  sun=sunForSettings(settings,data);
  shade=analyzeSunlight(settings,data,sun);
  scene?.updateSun(sun,settings);
  renderSunReadouts(sun,shade,settings);
  if(refreshMap&&settings.mode==='sun')renderSunMap($('sun-host'),data,settings,sun,shade);
  $('viewport').dataset.sunElevation=String(sun.elevation);
  $('viewport').dataset.sunAzimuth=String(sun.azimuth);
  $('viewport').dataset.sunStatus=shade.status;
  persist();
}
function stopSunPlayback(){
  clearInterval(sunPlayback);sunPlayback=null;
  $('sun-play').textContent='▶ Play';$('sun-play').setAttribute('aria-pressed','false');$('sun-play').setAttribute('aria-label','Play through the day');
}
function changeSun(values){
  stopSunPlayback();settings=sanitizeState({...settings,...values});
  showingA=false;comparisonB=null;syncControls();updateSun();
}

function update(){
  if(!data)return;
  const started=performance.now();
  data=applyBuildingOverrides(baseData,settings);
  syncBuildingControls();
  observer=observerForPreset(settings.preset,settings,data);
  analysis=analyzeVisibility(observer,settings,data);
  scene?.update(settings,observer,analysis,data);
  costEstimate=estimateCosts(settings,data);
  renderBudget(costEstimate,settings,data);
  updateSun(false);
  showMode();
  $('view-badge-text').textContent=observer.label;
  $('observer-readout').textContent=`Eye ${fmt(observer.z-data.site.floorReference.z,2)} m above original garden reference · ${fmt(observer.eyeHeight,2)} m above ${observer.surface==='floor'?'floor':'local ground'}`;
  const pct=analysis.blockedPercent;
  $('blocked-percent').textContent=fmt(pct,1);
  $('coverage-bar').style.width=`${pct}%`;
  const complete=analysis.total>0&&analysis.visible===0;
  $('blocked-pill').textContent=!analysis.total?'No target samples':complete?'All sampled points':'Some views remain';
  $('blocked-pill').classList.toggle('complete',complete);
  $('sample-count').textContent=`${analysis.blocked.toLocaleString()} of ${analysis.total.toLocaleString()} sampled points blocked from this viewpoint.`;
  $('required-height').textContent=fmt(analysis.worstRequiredHedge.rear,1);
  $('required-caption').textContent=`${settings.raiseNewHedges?'Above new planting ground':'Above original ground'}. Without canopy; mapped surrounding buildings still screen some rays.`;
  $('hedge-basis').textContent=settings.raiseNewHedges?'Plant height is above the new planting ground (garden fill + extra bed height). Hedges are ideal continuous, opaque screens.':'Heights refer to original ground. Existing foliage stays fixed; adding soil reduces its exposed height. Screens are ideal and opaque.';
  const {drop}=terraceGroundReference(settings,data);
  $('terrace-drop').textContent=fmt(Math.abs(drop),2);
  $('drop-caption').textContent=drop>=0?'To ground on terrace centreline, 0.6 m beyond the edge.':'Garden is above terrace on its centreline, 0.6 m beyond the edge.';
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

renderSiteDetails();
buildFields();
ready=true;
if(window.matchMedia('(max-width:760px)').matches)$('building-details').open=false;
syncControls();
$('sun-date').addEventListener('change',e=>{if(e.target.validity.valid&&e.target.value)changeSun({sunDate:sanitizeSolarDate(e.target.value,settings.sunDate)});else e.target.value=settings.sunDate;});
$('sun-time').addEventListener('change',e=>{if(!/^\d\d:\d\d$/.test(e.target.value))return;const [h,m]=e.target.value.split(':').map(Number);changeSun({sunMinutes:h*60+m});});
$('sun-minutes').addEventListener('input',e=>changeSun({sunMinutes:Number(e.target.value)}));
$('sun-enabled').addEventListener('change',e=>changeSun({sunEnabled:e.target.checked}));
$('sun-path-visible').addEventListener('change',e=>changeSun({sunPathVisible:e.target.checked}));
document.querySelectorAll('[data-sun-season]').forEach(button=>button.addEventListener('click',()=>changeSun({sunDate:`${settings.sunDate.slice(0,4)}-${button.dataset.sunSeason}`})));
$('jump-solar-noon').addEventListener('click',()=>{if(sun)changeSun({sunMinutes:Math.round(sun.noonMinutes)});});
$('sun-play').addEventListener('click',()=>{
  if(sunPlayback){stopSunPlayback();return;}
  if(!data)return;
  settings.sunEnabled=true;if(settings.sunMinutes>=1439)settings.sunMinutes=0;
  showingA=false;comparisonB=null;syncControls();updateSun();
  $('sun-play').textContent='Ⅱ Pause';$('sun-play').setAttribute('aria-pressed','true');$('sun-play').setAttribute('aria-label','Pause time animation');
  sunPlayback=setInterval(()=>{settings.sunMinutes=Math.min(1439,settings.sunMinutes+15);updateSun();if(settings.sunMinutes>=1439)stopSunPlayback();},400);
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopSunPlayback();});
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
$('reset').addEventListener('click',()=>{stopSunPlayback();settings={...DEFAULTS};showingA=false;$('scenario').value='default';history.replaceState(null,'',location.pathname+location.search);syncControls();update();scene?.setView(settings.mode,observer,settings);toast('Default site and design settings restored');});
$('reset-camera').addEventListener('click',()=>{settings.lookYaw=0;settings.lookPitch=0;scene?.setView('orbit',observer,settings);scene?.setView(settings.mode,observer,settings);toast('View reset');});
$('save-a').addEventListener('click',()=>{stopSunPlayback();comparisonA={...settings};comparisonB=null;showingA=false;try{localStorage.setItem(`${storageKey}-A`,JSON.stringify(comparisonA));}catch{}syncControls();toast('Scenario A saved. Change a setting, then compare.');});
$('compare').addEventListener('click',()=>{stopSunPlayback();if(!comparisonA)return;if(!showingA){comparisonB={...settings};settings={...comparisonA,mode:settings.mode};showingA=true;}else{settings={...comparisonB,mode:settings.mode};showingA=false;}syncControls();update();toast(showingA?'Showing saved scenario A':'Back to scenario B');});
$('share').addEventListener('click',async()=>{
  stopSunPlayback();
  const url=new URL(location.href);url.searchParams.set('site',profile.id);url.hash=encodeState(settings);history.replaceState(null,'',url);
  try{await navigator.clipboard.writeText(url.href);toast('Link copied with your current settings');}
  catch{toast('Your settings are in the address bar. Copy the page URL to share.');}
});
$('export').addEventListener('click',()=>{
  stopSunPlayback();
  // A range input can still have a scheduled geometry/budget update. Export one
  // coherent snapshot of the latest settings and their derived calculations.
  clearTimeout(updateTimer);update();
  const content={schemaVersion:STATE_VERSION,project:`${profile.label} · Garden Lab`,siteId:profile.id,site:{address:profile.address,parcels:baseData.site.parcels,coordinates:baseData.coordinates,sources:baseData.sources,limitations:baseData.limitations},exportedAt:new Date().toISOString(),settings,costEstimate,solar:sun?{date:sun.date,requestedMinutes:sun.minutes,resolvedMinutes:sun.resolvedMinutes,utcISO:sun.utcISO,timeZone:sun.timeZone,latitude:sun.latitude,longitude:sun.longitude,timeNote:sun.timeNote,azimuth:sun.azimuth,elevation:sun.elevation,sunriseMinutes:sun.sunriseMinutes,sunsetMinutes:sun.sunsetMinutes}:null,sunlight:shade?{status:shade.status,cellSize:shade.cellSize,zones:shade.zones,method:shade.method,limitations:shade.limitations}:null,buildingAdjustments:baseData?buildingAssumptions(baseData,settings).filter(b=>b.active):[],summary:analysis?{observer,visible:analysis.visible,total:analysis.total,blockedPercent:analysis.blockedPercent,worstRequiredHedge:analysis.worstRequiredHedge}:null,note:'A sampled planning model, not a survey, sunlight-hours study or whole-property privacy guarantee.'};
  const url=URL.createObjectURL(new Blob([JSON.stringify(content,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`${profile.id}-scenario.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);toast('Scenario exported');
});
$('about-open').addEventListener('click',()=>$('about').showModal());
$('about-close').addEventListener('click',()=>$('about').close());
$('about').addEventListener('click',e=>{if(e.target===$('about')){const r=$('about').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('about').close();}});
window.addEventListener('hashchange',()=>{
  if(!/^#v=[123456](?:&|$)/.test(location.hash))return;
  const destination=resolveSiteId(location.search,location.hash);
  if(destination!==profile.id){const url=new URL(location.href);url.searchParams.set('site',destination);location.assign(url.href);return;}
  stopSunPlayback();settings=decodeState(location.hash);if(!profile.hasGarage)settings.removeGarage=true;showingA=false;syncControls();update();
});
window.addEventListener('resize',()=>{scene?.resize();if(data&&['plan','section','sun'].includes(settings.mode))showMode();});

try{
  data=applyBuildingOverrides(baseData,settings);
  fetch(new URL('../data/cost-sources.json',import.meta.url)).then(r=>{if(!r.ok)throw new Error('Price sources unavailable');return r.json();}).then(renderPriceSources).catch(()=>{$('price-date').textContent='Price references are also documented in the repository.';});
  try{
    const {createScene}=await import('./scene.js?v=1.4.0');
    scene=createScene($('scene-host'),data,{onPick:moveObserver,onCameraChange:angles=>{if(angles){if(Number.isFinite(angles.lookYaw))settings.lookYaw=angles.lookYaw;if(Number.isFinite(angles.lookPitch))settings.lookPitch=angles.lookPitch;}}});
    if(scene.rendererType==='svg'){$('sun-renderer-note').hidden=false;$('sun-renderer-note').textContent='This browser uses the lightweight 3D view. Open Sun & shade for calculated shadows; 3D cast shadows need WebGL.';}
    if(scene.available===false){settings.mode='plan';toast('3D is unavailable in this browser. Plan and sightline views still work.');}
  }catch(error){console.error('3D view unavailable',error);settings.mode='plan';toast('3D could not start. Plan and sightline views remain available.');}
  $('loading').hidden=true;syncControls();update();
}catch(error){
  console.error(error);$('loading').replaceChildren();const heading=document.createElement('strong');heading.textContent='The site model could not load.';const note=document.createElement('span');note.textContent='Refresh the page to retry. If running locally, serve the folder over HTTP.';$('loading').append(heading,note);
}
