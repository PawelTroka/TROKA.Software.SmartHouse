import {PAVILION_PLACEMENTS} from './corner-pavilion.js?v=1.39.0';
import {pavilionStudy} from './pavilion-study.js?v=1.39.0';
import {STERNICZA_EXCELSA_TREES} from './screening-layouts.js?v=1.39.0';
const $=id=>document.getElementById(id);
const fmt=(n,d=1)=>Number.isFinite(n)?n.toFixed(d):'—';

export function createPavilionControls({getSettings,getData,getObserver,getAnalysis,onChange,onView,notify}){
  const section=$('corner-pavilion-panel');let wasEnabled=false;
  const plantingButton=document.createElement('button');plantingButton.type='button';
  plantingButton.className='button subtle';plantingButton.id='pavilion-compatible-planting';
  plantingButton.textContent='Use pavilion planting · Excelsa trio';
  plantingButton.title='Replace the three specimen trees with the narrower, previously checked 9 m Excelsa layout.';
  $('pavilion-warning').after(plantingButton);
  plantingButton.addEventListener('click',()=>{
    onChange({screeningTrees:STERNICZA_EXCELSA_TREES.map(t=>({...t}))});
    notify('Pavilion planting applied: three 9 m Excelsa in the compatible reference positions. The pool and building stay in place.');
  });
  $('pavilionEnabled').addEventListener('change',event=>{
    onChange({pavilionEnabled:event.target.checked});
    notify(event.target.checked?'Pavilion garden alternative applied · height is a study':'Pavilion off · previous pool and spa arrangement restored');
  });
  for(const button of section.querySelectorAll('[data-pavilion-placement]'))button.addEventListener('click',()=>{
    const placement=PAVILION_PLACEMENTS.find(p=>p.id===button.dataset.pavilionPlacement);
    if(placement){onChange({...placement.settings,pavilionEnabled:true});notify(placement.label+' · planning unconfirmed');}
  });
  for(const button of section.querySelectorAll('[data-pavilion-height]'))button.addEventListener('click',()=>onChange({pavilionHeight:Number(button.dataset.pavilionHeight)}));
  for(const button of section.querySelectorAll('[data-pavilion-view]'))button.addEventListener('click',()=>onView(button.dataset.pavilionView));
  $('pavilion-jump')?.addEventListener('click',()=>{section.open=true;});
  function sync(){
    const s=getSettings(),available=s.siteId==='sternicza-11';section.hidden=!available;
    const quote=document.querySelector('[data-field="costPavilionQuote"]');
    if(quote)quote.hidden=!available||!s.pavilionEnabled;
    $('pavilion-jump').hidden=!available;if(!available)return;
    $('pavilionEnabled').checked=s.pavilionEnabled;$('pavilion-settings').hidden=!s.pavilionEnabled;
    if(s.pavilionEnabled&&!wasEnabled)section.open=true;wasEnabled=s.pavilionEnabled;
    const placement=PAVILION_PLACEMENTS.find(p=>Object.entries(p.settings).every(([key,value])=>Math.abs(s[key]-value)<1e-6));
    $('pavilion-placement-note').textContent=placement?.description||'Custom placement. Review the boundary, terrace and spa clearances below.';
    for(const b of section.querySelectorAll('[data-pavilion-placement]'))b.setAttribute('aria-pressed',String(placement?.id===b.dataset.pavilionPlacement));
    for(const b of section.querySelectorAll('[data-pavilion-height]'))b.setAttribute('aria-pressed',String(Math.abs(s.pavilionHeight-Number(b.dataset.pavilionHeight))<1e-6));
    for(const b of section.querySelectorAll('[data-pavilion-view]'))b.setAttribute('aria-pressed',String(s.preset===b.dataset.pavilionView));
  }
  function summary(){return pavilionStudy(getObserver(),getSettings(),getData(),getAnalysis());}
  function render(){
    const s=getSettings();if(s.siteId!=='sternicza-11'||!s.pavilionEnabled)return;
    const report=summary(),c=report.comparison,d=report.dimensions,e=report.envelope;
    $('pavilion-observer').textContent='PCK3 · '+(report.observer?.label||'Selected viewpoint');
    $('pavilion-before').textContent=c?fmt(c.before.percent)+'%':'—';$('pavilion-after').textContent=c?fmt(c.after.percent)+'%':'—';
    $('pavilion-result').dataset.before=fmt(c?.before.percent);$('pavilion-result').dataset.after=fmt(c?.after.percent);
    $('pavilion-gain').textContent=c?`${fmt(c.after.percent-c.before.percent)} percentage points added by the pavilion`:'Resolve the layout warnings or choose a valid viewpoint to compare screening.';
    $('pavilion-roof-result').textContent=c?`Pavilion alone intercepts ${c.pavilionRoofOnly.blocked} of ${c.pavilionRoofOnly.total} tested PCK3 roof sightlines (${fmt(c.pavilionRoofOnly.percent)}%).`:'No valid roof comparison.';
    $('pavilion-envelope').textContent=e?.status==='ok'?(e.missed
      ?`${e.missed} of ${e.total} roof sightlines pass beside this footprint. Extra height alone cannot block them. For the intercepted rays, the ideal solid-envelope height is ${fmt(e.requiredHeightForIntercepted)} m above original ground.`
      :`This footprint crosses every tested roof sightline. The ideal solid-envelope reference is ${fmt(e.requiredHeightForAll)} m above original ground; actual wall and roof screening is shown above.`):'';
    $('pavilion-size').textContent=d?`${fmt(d.width)} × ${fmt(d.depth)} m · ${fmt(d.area)} m² footprint · ${fmt(d.height)} m roof height · ${d.storeys} modelled levels. Internal access and room design are unresolved.`:'';
    const gaps=report.clearances;
    $('pavilion-clearances').textContent=gaps?`Modelled wall gaps: rear boundary ${fmt(gaps.rear,2)} m · east boundary ${fmt(gaps.east,2)} m · house ${fmt(gaps.house,2)} m. These distances do not establish compliant siting, fire separation or daylight.`:'';
    const warnings=report.warnings||[];$('pavilion-warning').hidden=!warnings.length;$('pavilion-warning').textContent=warnings.join(' ');
    plantingButton.hidden=!(report.treeConflicts||[]).some(t=>t.trunk||t.crown==='overlap');
  }
  return {sync,render,exportSummary:summary};
}
