import {PRIVACY_PRESETS,privacyPresetState,matchesPrivacyPreset} from './privacy-options.js?v=1.29.0';
import {analyzeVisibility,privacyStructures} from './geometry.js?v=1.29.0';

const $=id=>document.getElementById(id);
const fmt=(value,digits=1)=>Number.isFinite(value)?value.toFixed(digits):'—';
const pck=analysis=>analysis?.byBlock?.find(block=>/PCK\s*3/i.test(block.label));

/** Controls are intentionally independent of planting/layout presets. */
export function createPrivacyControls({getSettings,getData,getObserver,getAnalysis,onChange,onView,notify}){
  const section=$('privacy-structures');
  for(const button of document.querySelectorAll('[data-privacy-preset]')){
    button.addEventListener('click',()=>{
      const id=button.dataset.privacyPreset,current=getSettings();
      onChange(privacyPresetState(id,current));
      const preset=PRIVACY_PRESETS.find(item=>item.id===id);
      notify(preset?`${preset.label} applied · trees and garden layout retained`:'Privacy structures and terrace canopy switched off');
    });
  }
  for(const key of ['privacyPergolaEnabled','privacyPergolaFoliage','spaScreensEnabled']){
    $(key).addEventListener('change',event=>onChange({[key]:event.target.checked}));
  }
  for(const button of document.querySelectorAll('[data-privacy-view]')){
    button.addEventListener('click',()=>onView(button.dataset.privacyView));
  }
  $('privacy-edit').addEventListener('click',()=>{
    section.open=true;section.scrollIntoView({behavior:'smooth',block:'start'});
  });
  $('privacy-canopy-edit').addEventListener('click',()=>{
    $('canopyEnabled').scrollIntoView({behavior:'smooth',block:'center'});$('canopyEnabled').focus({preventScroll:true});
  });
  function sync(){
    const s=getSettings(),available=s.siteId==='sternicza-11';
    section.hidden=!available;$('privacy-shortcuts').hidden=!available;$('privacy-budget-assumptions').hidden=!available;
    if(!available)return;
    for(const key of ['privacyPergolaEnabled','privacyPergolaFoliage','spaScreensEnabled'])$(key).checked=s[key];
    $('privacy-pergola-settings').hidden=!s.privacyPergolaEnabled;
    $('privacy-screen-settings').hidden=!s.spaScreensEnabled;
    for(const button of document.querySelectorAll('[data-privacy-preset]'))button.setAttribute('aria-pressed',String(matchesPrivacyPreset(button.dataset.privacyPreset,s)));
    for(const button of document.querySelectorAll('[data-privacy-view]'))button.setAttribute('aria-pressed',String(button.dataset.privacyView===s.preset));
    const matched=PRIVACY_PRESETS.find(item=>matchesPrivacyPreset(item.id,s));
    $('privacy-preset-note').textContent=matched?.description||(!s.privacyPergolaEnabled&&!s.spaScreensEnabled&&!s.canopyEnabled?'Your current trees, hedges and garden layout. Choose an option to compare added screening.':'Custom combination · dimensions and planting can be adjusted below.');
    $('privacy-foliage-note').textContent=s.privacyPergolaFoliage
      ?'Ideal dense established planting on two sides. New climbers, gaps and winter leaf loss can leave more building visible. Switch off to see the bare frame.'
      :'Bare timber lattice: only posts, beams and individual slats block the model’s rays. Open gaps remain open.';
  }
  function render(){
    const s=getSettings(),data=getData();
    if(s.siteId!=='sternicza-11'||!data)return;
    const eye=getObserver(),current=pck(getAnalysis());
    const active=s.privacyPergolaEnabled||s.spaScreensEnabled||s.canopyEnabled;
    const baseline=active?pck(analyzeVisibility(eye,{...s,privacyPergolaEnabled:false,spaScreensEnabled:false,canopyEnabled:false},data)):current;
    const before=baseline?.blockedPercent,after=current?.blockedPercent,delta=after-before;
    $('privacy-result').dataset.before=fmt(before);$('privacy-result').dataset.after=fmt(after);
    $('privacy-before').textContent=`${fmt(before)}%`;$('privacy-after').textContent=`${fmt(after)}%`;
    $('privacy-gain').textContent=Number.isFinite(delta)?`${delta>=0?'+':''}${fmt(delta)} percentage points`:'No target samples';
    $('privacy-observer').textContent=`PCK3 · ${eye.label}`;
    $('privacy-comparison-note').textContent='Sampled building points blocked from this eye position. The baseline removes the pergola, spa screens and selected terrace cover, keeping the rest of your design. Check other viewpoints and Sun & shade.';
    const layout=privacyStructures(s,data),dimensions=[];
    if(s.privacyPergolaEnabled)dimensions.push(`Pergola ${fmt(s.privacyPergolaWidth)} × ${fmt(s.privacyPergolaDepth)} m · ${fmt(s.privacyPergolaHeight)} m above its lowest ground corner`);
    if(s.spaScreensEnabled)dimensions.push(`Spa screen ${fmt(s.spaScreenWidth)} m + ${fmt(s.spaScreenReturn)} m return · ${fmt(s.spaScreenHeight)} m above the terrace · ${fmt(s.spaScreenGap,2)} m beyond the tub`);
    if(s.canopyEnabled)dimensions.push(s.terraceCoverType==='balcony'?`Balcony ${fmt(s.canopyWidth)} × ${fmt(s.canopyDepth)} m · deck ${fmt(s.firstFloorRise)} m above the terrace`:`Canopy ${fmt(s.canopyWidth)} × ${fmt(s.canopyDepth)} m · ${fmt(s.canopyHeight)} m above the terrace`);
    $('privacy-size-summary').textContent=dimensions.join('. ')+(dimensions.length?'.':'No added privacy structures.');
    $('privacy-layout-warning').hidden=!layout.warnings.length;
    $('privacy-layout-warning').textContent=layout.warnings.join(' ');
  }
  return {sync,render};
}
