import {FIELDS,DEFAULTS,sanitizeState,encodeState,decodeState,scenarioState} from './state.js';
import {observerForPreset,analyzeVisibility,floorElevation,gardenGroundAt} from './geometry.js';
import {renderPlan,renderSection} from './diagrams.js';

const $=id=>document.getElementById(id);
const storageKey='sternicza-garden-lab-v1';
const safeRead=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
let settings=location.hash.startsWith('#v=1')?decodeState(location.hash):sanitizeState(safeRead(storageKey,DEFAULTS));
let data,scene,observer,analysis,updateTimer,toastTimer,lastSceneMode;
let comparisonA=safeRead(`${storageKey}-A`,null),comparisonB=null,showingA=false;
if(comparisonA)comparisonA=sanitizeState(comparisonA);
const fmt=(v,d=1)=>Number.isFinite(v)?v.toFixed(d):'—';
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3500);}
function persist(){try{localStorage.setItem(storageKey,JSON.stringify(settings));}catch{}}

function buildFields(){
  for(const [key,f] of Object.entries(FIELDS)){
    if(f.group==='look')continue;
    const host=$(`${f.group}-controls`),field=document.createElement('div');
    field.className='field';field.dataset.field=key;
    const digits=f.step<.1?2:1;
    field.innerHTML=`<div class="field-top"><label for="${key}">${f.label}</label><span class="value-input"><input id="${key}-value" type="number" min="${f.min}" max="${f.max}" step="${f.step}" aria-label="${f.label} in metres"><span>m</span></span></div><input id="${key}" type="range" min="${f.min}" max="${f.max}" step="${f.step}"><div class="range-labels"><span>${f.min} m</span><span>${f.max} m</span></div>`;
    host.append(field);
    const change=value=>{
      const n=Number(value);if(!Number.isFinite(n))return;
      settings[key]=Math.max(f.min,Math.min(f.max,n));
      if(key.startsWith('hedge')&&key!=='hedgeInset'&&settings.linkedHedges)settings.hedgeRear=settings.hedgeLeft=settings.hedgeRight=settings[key];
      if(key==='observerX'||key==='observerY')settings.preset='custom';
      if(showingA){showingA=false;comparisonB=null;}
      $('scenario').value='custom';syncControls();scheduleUpdate();
    };
    $(key).addEventListener('input',e=>change(e.target.value));
    $(`${key}-value`).addEventListener('input',e=>{if(e.target.value!=='')change(e.target.value);});
    $(`${key}-value`).addEventListener('change',e=>change(e.target.value));
    $(`${key}-value`).addEventListener('keydown',e=>{if(e.key==='Enter'){e.target.blur();}});
  }
  const high=document.createElement('label');high.className='switch-row';
  high.innerHTML='<span>Include tall unverified roof returns<small>Sensitivity check for the thin feature near PCK 3.</small></span><input id="includeHighFeatures" type="checkbox" role="switch">';
  $('assumption-controls').append(high);
}

function syncControls(){
  for(const [key,f] of Object.entries(FIELDS)){
    if(!$(key))continue;
    $(key).value=settings[key];
    $(key).style.setProperty('--progress',`${100*(settings[key]-f.min)/(f.max-f.min)}%`);
    if(document.activeElement!==$(`${key}-value`))$(`${key}-value`).value=fmt(settings[key],f.step<.1?2:1);
  }
  for(const key of ['raiseNewHedges','canopyEnabled','removeGarage','showRays','includeHighFeatures'])$(key).checked=settings[key];
  $('canopy-controls').hidden=!settings.canopyEnabled;
  document.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.preset===settings.preset)));
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===settings.mode)));
  $('link-hedges').setAttribute('aria-pressed',String(settings.linkedHedges));
  $('link-hedges').textContent=settings.linkedHedges?'Linked':'Separate';
  $('compare').disabled=!comparisonA;
  $('compare-mobile').disabled=!comparisonA;
  $('compare').textContent=showingA?'Return to B':'Compare A/B';
  $('compare-mobile').textContent=showingA?'Return to B':'Compare A/B';
  $('comparison-status').textContent=showingA?'Viewing saved A':'Live configuration';
  const scenarioKeys=['hedgeRear','hedgeLeft','hedgeRight','gardenRaise','bedRaise','canopyEnabled','raiseNewHedges'];
  $('scenario').value=['starter','raised','tall','canopy'].find(name=>{
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
  observer=observerForPreset(settings.preset,settings,data);
  analysis=analyzeVisibility(observer,settings,data);
  scene?.update(settings,observer,analysis);
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
for(const key of ['raiseNewHedges','canopyEnabled','removeGarage','showRays','includeHighFeatures'])$(key).addEventListener('change',e=>{settings[key]=e.target.checked;showingA=false;$('scenario').value='custom';syncControls();update();});
$('link-hedges').addEventListener('click',()=>{settings.linkedHedges=!settings.linkedHedges;if(settings.linkedHedges)settings.hedgeLeft=settings.hedgeRight=settings.hedgeRear;syncControls();update();});
$('scenario').addEventListener('change',e=>{if(e.target.value!=='custom'){settings=scenarioState(e.target.value,settings);showingA=false;syncControls();update();}});
$('reset').addEventListener('click',()=>{settings={...DEFAULTS};showingA=false;$('scenario').value='starter';history.replaceState(null,'',location.pathname+location.search);syncControls();update();scene?.setView(settings.mode,observer,settings);toast('Default site and design settings restored');});
$('reset-camera').addEventListener('click',()=>{settings.lookYaw=0;settings.lookPitch=0;scene?.setView('orbit',observer,settings);scene?.setView(settings.mode,observer,settings);toast('View reset');});
$('save-a').addEventListener('click',()=>{comparisonA={...settings};comparisonB=null;showingA=false;try{localStorage.setItem(`${storageKey}-A`,JSON.stringify(comparisonA));}catch{}syncControls();toast('Scenario A saved. Change a setting, then compare.');});
$('compare').addEventListener('click',()=>{if(!comparisonA)return;if(!showingA){comparisonB={...settings};settings={...comparisonA,mode:settings.mode};showingA=true;}else{settings={...comparisonB,mode:settings.mode};showingA=false;}syncControls();update();toast(showingA?'Showing saved scenario A':'Back to scenario B');});
$('share').addEventListener('click',async()=>{
  const url=new URL(location.href);url.hash=encodeState(settings);history.replaceState(null,'',url);
  try{await navigator.clipboard.writeText(url.href);toast('Link copied with your current settings');}
  catch{toast('Your settings are in the address bar. Copy the page URL to share.');}
});
$('export').addEventListener('click',()=>{
  const content={schemaVersion:1,project:'Sternicza Garden Lab',exportedAt:new Date().toISOString(),settings,summary:analysis?{observer,visible:analysis.visible,total:analysis.total,blockedPercent:analysis.blockedPercent,worstRequiredHedge:analysis.worstRequiredHedge}:null,note:'A sampled planning model, not a survey or a whole-property privacy guarantee.'};
  const url=URL.createObjectURL(new Blob([JSON.stringify(content,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='sternicza-scenario.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);toast('Scenario exported');
});
$('about-open').addEventListener('click',()=>$('about').showModal());
$('about-close').addEventListener('click',()=>$('about').close());
$('about').addEventListener('click',e=>{if(e.target===$('about')){const r=$('about').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('about').close();}});
window.addEventListener('hashchange',()=>{settings=decodeState(location.hash);showingA=false;syncControls();update();});
window.addEventListener('resize',()=>{scene?.resize();if(data&&(settings.mode==='plan'||settings.mode==='section'))showMode();});

try{
  const response=await fetch(new URL('../data/site-data.json',import.meta.url));
  if(!response.ok)throw new Error(`Site data could not be loaded (${response.status})`);
  data=await response.json();
  try{
    const {createScene}=await import('./scene.js');
    scene=createScene($('scene-host'),data,{onPick:moveObserver,onCameraChange:angles=>{if(angles){if(Number.isFinite(angles.lookYaw))settings.lookYaw=angles.lookYaw;if(Number.isFinite(angles.lookPitch))settings.lookPitch=angles.lookPitch;}}});
    if(scene.available===false){settings.mode='plan';toast('3D is unavailable in this browser. Plan and sightline views still work.');}
  }catch(error){console.error('3D view unavailable',error);settings.mode='plan';toast('3D could not start. Plan and sightline views remain available.');}
  $('loading').hidden=true;syncControls();update();
}catch(error){
  console.error(error);$('loading').replaceChildren();const heading=document.createElement('strong');heading.textContent='The site model could not load.';const note=document.createElement('span');note.textContent='Refresh the page to retry. If running locally, serve the folder over HTTP.';$('loading').append(heading,note);
}
