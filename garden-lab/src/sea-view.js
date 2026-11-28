import {evaluateSeaView,seaCameraPose,seaRayHeight,seaViewSummary,SEA_MODES} from './sea-visibility.js?v=1.41.0';
import {DEFAULT_SETTINGS,floorElevation} from './geometry.js?v=1.41.0';
import {sterniczaRoofEnvelope} from './house-roof.js?v=1.41.0';

const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const metres=n=>Number.isFinite(n)?`${n.toFixed(1)} m`:'Unknown';
const approximate=n=>Number.isFinite(n)?`~${Math.round(n)} m`:'Unknown';
const bearing=n=>`${Math.round(n)%360}°`;
const colors={terrain:'#bcae84',building:'#a38b7d',surface:'#6d8c64',water:'#9fced3',clear:'#15767d',blocked:'#b96540'};
const statusText=r=>r.status==='clear'?'Sea clears the recorded skyline':r.status==='blocked'?'The recorded skyline blocks this view':r.currentHorizonCovered===false?'At this height, the horizon reaches another coastline':'Full sightline not verified';

/** Height references at the selected horizontal position, not accessible
 * viewing platforms. roofTopZ contains chimney returns, so it must not be
 * presented as the roof ridge. Keep the existing reconstructed roof and the
 * editable floor datum shared with the rest of the simulator. */
export function seaHeightPresets(data,settings={},observer){
  const eyeHeight=1.65,groundZ=observer?.groundZ;
  const firstRise=Number.isFinite(Number(settings.firstFloorRise))?Number(settings.firstFloorRise):DEFAULT_SETTINGS.firstFloorRise;
  const firstFloorZ=Number.isFinite(data?.site?.floorReference?.z)?floorElevation(settings,data)+firstRise:null;
  const ridgeZ=data?.site?.house?.footprint?.length?sterniczaRoofEnvelope(data.site.house).ridgeZ:null;
  const aboveGround=z=>Number.isFinite(z)&&Number.isFinite(groundZ)?z+eyeHeight-groundZ:null;
  return {standing:eyeHeight,firstFloor:aboveGround(firstFloorZ),aboveRoofRidge:aboveGround(ridgeZ)};
}

export function seaProfileMarkup(result){
  const {profile,observer,control}=result;
  const W=1050,H=310,pad={left:52,right:23,top:24,bottom:45};
  const maxDistance=result.mode==='water'?profile.waterDistanceM:profile.shoreDistanceM+450;
  const known=profile.surfaceZ.filter(Number.isFinite);
  const maxZ=Math.max(35,result.eyeZ+5,...known)+1;
  const X=d=>pad.left+d/maxDistance*(W-pad.left-pad.right);
  const Y=z=>H-pad.bottom-z/maxZ*(H-pad.top-pad.bottom);
  const step=profile.stepM||1,base=Y(0),shoreX=X(profile.shoreDistanceM);
  const groundPoints=profile.groundZ.map((z,i)=>Number.isFinite(z)?`${X(i*step)},${Y(z)}`:null).filter(Boolean);
  const ground=groundPoints.length?`<polygon points="${X(0)},${base} ${groundPoints.join(' ')} ${shoreX},${base}" fill="${colors.terrain}"/>`:'';
  const blocks=profile.surfaceZ.map((z,i)=>{
    const x=X(i*step),width=Math.max(.6,X(Math.min((i+1)*step,profile.shoreDistanceM))-x);
    if(!Number.isFinite(z))return `<rect x="${x}" y="${pad.top}" width="${width}" height="${base-pad.top}" fill="#b67f51" fill-opacity=".32"/>`;
    const kind=profile.surfaceKind[i]==='1'?'building':profile.surfaceKind[i]==='0'?'terrain':'surface';
    return `<rect x="${x}" y="${Y(z)}" width="${width+.2}" height="${Math.max(0,base-Y(z))}" fill="${colors[kind]}"/>`;
  }).join('');
  const ray=[];
  for(let i=0;i<=100;i++){
    const d=i/100*maxDistance,z=seaRayHeight(result.eyeZ,d,{mode:result.mode,targetDistance:result.targetDistance,seaZ:result.seaZ,radius:result.radius});
    if(Number.isFinite(z))ray.push(`${ray.length?'L':'M'}${X(d).toFixed(2)},${Y(z).toFixed(2)}`);
  }
  const rayColor=result.status==='clear'?colors.clear:colors.blocked;
  const hTicks=[];
  for(let z=0;z<=maxZ;z+=maxZ>75?20:10)hTicks.push(`<line x1="${pad.left}" x2="${W-pad.right}" y1="${Y(z)}" y2="${Y(z)}" stroke="#a7b6b1" stroke-opacity=".25"/><text x="${pad.left-9}" y="${Y(z)+4}" text-anchor="end">${z}</text>`);
  const dTicks=[];
  for(let d=0;d<=maxDistance;d+=maxDistance>1300?250:200)dTicks.push(`<text x="${X(d)}" y="${H-pad.bottom+20}" text-anchor="middle">${d}</text>`);
  const controlMarkup=control?`<line x1="${X(control.distanceM)}" x2="${X(control.distanceM)}" y1="${Y(control.topZ)}" y2="${pad.top+10}" stroke="#6d4e35" stroke-dasharray="3 4"/><circle cx="${X(control.distanceM)}" cy="${Y(control.topZ)}" r="4" fill="#fff" stroke="#6d4e35" stroke-width="2"/><text x="${Math.max(pad.left+10,Math.min(W-170,X(control.distanceM)+8))}" y="${pad.top+5}" class="sea-profile-label">Controlling obstruction · ${Math.round(control.distanceM)} m</text>`:'';
  return `<svg class="sea-profile-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Measured land-to-sea profile. ${escape(result.status)} at ${result.heightAboveGround.toFixed(1)} metres above local ground. ${escape(control?.label||'No known controlling obstruction')}. Horizontal scale is distance in metres; vertical scale is absolute elevation in metres, exaggerated."><rect width="${W}" height="${H}" fill="#f3f7f5" rx="12"/><rect x="${shoreX}" y="${base-1}" width="${W-pad.right-shoreX}" height="12" fill="${colors.water}"/>${hTicks.join('')}${ground}${blocks}<path d="${ray.join(' ')}" fill="none" stroke="${rayColor}" stroke-width="2.5"/><circle cx="${X(0)}" cy="${Y(result.eyeZ)}" r="5" fill="${rayColor}" stroke="#fff" stroke-width="2"/>${controlMarkup}<text x="${Math.min(W-pad.right-80,shoreX+8)}" y="${base-10}" class="sea-profile-label">Gulf of Gdańsk</text>${dTicks.join('')}<text x="${W/2}" y="${H-7}" text-anchor="middle">Distance from observer (m) · vertical scale exaggerated</text><text x="13" y="${pad.top}" class="sea-profile-label">m</text><text x="13" y="${pad.top+15}" class="sea-profile-label">ASL</text></svg>`;
}

export function seaMapMarkup(corridor,result){
  const frame=corridor.coordinates,origin=frame.localOriginEN,ux=frame.xUnitEN,uy=frame.yUnitEN;
  const en=p=>[origin[0]+p[0]*ux[0]+p[1]*uy[0],origin[1]+p[0]*ux[1]+p[1]*uy[1]];
  const start=en(result.observer.xy),shore=en(result.profile.shoreXY);
  const center=[(start[0]+shore[0])/2,(start[1]+shore[1])/2];
  const span=Math.max(700,Math.abs(shore[0]-start[0])+250,Math.abs(shore[1]-start[1])+250);
  const W=390,H=340,scale=(H-34)/span,xe=center[0]-(W-34)/scale/2,yn=center[1]+span/2;
  const XY=p=>[17+(p[0]-xe)*scale,17+(yn-p[1])*scale];
  const points=ring=>ring.map(p=>XY(en(p)).map(v=>v.toFixed(2)).join(',')).join(' ');
  const [sx,sy]=XY(start),[tx,ty]=XY(shore);
  const water=corridor.shoreline.map(ring=>{
    const es=ring.map(en),ends=[es.at(-1),es[0]];
    return `<polygon points="${points(ring)} ${XY([ends[0][0],yn+span]).join(',')} ${XY([ends[1][0],yn+span]).join(',')}" fill="#cce2e5"/>`;
  }).join('');
  const buildings=(corridor.buildings||[]).map(b=>`<polygon points="${points(b.footprint)}" fill="#bcb5a8" stroke="#a9a293" stroke-width=".35"/>`).join('');
  const coast=corridor.shoreline.map(ring=>`<polyline points="${points(ring)}" fill="none" stroke="#588d94" stroke-width="1.7"/>`).join('');
  const control=result.control;
  let point='';
  if(control){
    const p=en(result.observer.xy.map((v,i)=>v+result.profile.directionXY[i]*control.distanceM)),[x,y]=XY(p);
    point=`<circle cx="${x}" cy="${y}" r="4" fill="#a06543" stroke="#fff" stroke-width="1.5"/>`;
  }
  return `<svg class="sea-map-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="North-up map from Sternicza 11 to the official maritime shoreline. Selected bearing ${bearing(result.bearingTrue)}. Brown point marks the controlling obstruction."><defs><clipPath id="sea-map-frame"><rect x="1" y="1" width="${W-2}" height="${H-2}" rx="12"/></clipPath></defs><g clip-path="url(#sea-map-frame)"><rect width="${W}" height="${H}" fill="#eaf0e6"/>${water}${buildings}${coast}<polygon points="${points(corridor.plotBoundary)}" fill="#f3dfa5" stroke="#917f46" stroke-width="1.5"/><line x1="${sx}" y1="${sy}" x2="${tx}" y2="${ty}" stroke="#1b7279" stroke-width="2"/><circle cx="${sx}" cy="${sy}" r="4.5" fill="#1b7279" stroke="#fff" stroke-width="2"/><circle cx="${tx}" cy="${ty}" r="4" fill="#f7ffff" stroke="#1b7279" stroke-width="2"/>${point}<text x="${Math.min(W-108,Math.max(15,sx+9))}" y="${Math.min(H-25,sy+18)}" class="sea-map-label">Sternicza 11</text><g transform="translate(${W-27} 22)"><path d="M0 23V0M-4 7L0 0L4 7" fill="none" stroke="#416761" stroke-width="1.7"/><text x="0" y="-7" text-anchor="middle" class="sea-map-label">N</text></g><path d="M18 ${H-24}v5h${100*scale}v-5" fill="none" stroke="#526b60" stroke-width="2"/><text x="${18+50*scale}" y="${H-6}" text-anchor="middle">100 m</text></g></svg>`;
}

/** Self-contained mount; parent owns when the tab is visible and which site
 * is selected. Camera callbacks explicitly preview the local neighbourhood. */
export function mountSeaView(container,{data,corridor,settings={},onCamera=null}={}){
  let state={observerId:'house',profileId:'best',heightAboveGround:12,mode:'water',clearanceM:1};
  const storageKey='garden-lab:sternicza-11:sea-view:v1';
  try{
    const stored=JSON.parse(localStorage.getItem(storageKey)||'null');
    if(stored&&typeof stored==='object'){
      if(['house','front','terrace','garden'].includes(stored.observerId))state.observerId=stored.observerId;
      if(typeof stored.profileId==='string'&&/^(best|b-?\d{1,3})$/.test(stored.profileId))state.profileId=stored.profileId;
      if(Number.isFinite(stored.heightAboveGround))state.heightAboveGround=Math.min(80,Math.max(.5,stored.heightAboveGround));
      if(['water','horizon'].includes(stored.mode))state.mode=stored.mode;
      if([0,.5,1,2,3,5].includes(stored.clearanceM))state.clearanceM=stored.clearanceM;
    }
  }catch{/* Private browsing or corrupt storage does not prevent analysis. */}
  const persist=()=>{try{localStorage.setItem(storageKey,JSON.stringify(state));}catch{}};
  let disposed=false,current=null;
  container.classList.add('sea-view');
  function render(){
    if(disposed)return;
    if(!corridor||data?.site?.id&&data.site.id!=='sternicza-11'){
      current=null;
      container.innerHTML='<section class="sea-empty"><h2>Sea-view analysis</h2><p>Measured sea corridors are available for Sternicza 11. Select that property to explore the skyline.</p></section>';return;
    }
    const selectedObserver=corridor.observers?.find(o=>o.id===state.observerId)||corridor.observers?.[0];
    if(selectedObserver){state.observerId=selectedObserver.id;if(state.profileId!=='best'&&!selectedObserver.profiles.some(p=>p.id===state.profileId))state.profileId='best';}
    current=evaluateSeaView(corridor,state);
    if(!current){container.innerHTML='<p>No measured sea corridor is available.</p>';return;}
    const r=current,control=r.control,observer=r.observer;
    const threshold=r.requiredHeightM,atHeight=Number.isFinite(threshold)?Math.ceil(threshold*2)/2:null;
    const status=statusText(r);
    const best=r.best;
    const presets=seaHeightPresets(data,settings,observer);
    const sourceLinks=(corridor.sources||[]).map(s=>`<li><a href="${escape(s.url)}" target="_blank" rel="noopener">${escape(s.label)}</a></li>`).join('');
    container.innerHTML=`<section class="sea-tool"><header class="sea-heading"><p class="sea-eyebrow">Sternicza 11 · measured surroundings</p><h2>How high until you can see the sea?</h2><p>Raise the observer above the recorded buildings and tree canopy. The sea is beyond the front of the property; each direction follows the full land corridor to the mapped shore.</p></header>
      <div class="sea-controls"><label>Observer location<select data-sea-control="observerId">${corridor.observers.map(o=>`<option value="${o.id}" ${state.observerId===o.id?'selected':''}>${escape(o.label)}</option>`).join('')}</select></label><label>What would you like to see?<select data-sea-control="mode">${SEA_MODES.map(m=>`<option value="${m.id}" ${state.mode===m.id?'selected':''}>${escape(m.label)}</option>`).join('')}</select></label><label>Direction<select data-sea-control="profileId"><option value="best" ${state.profileId==='best'?'selected':''}>Best of the sampled directions${best?` · ${bearing(best.bearingTrue)}`:''}</option>${r.evaluated.map(e=>`<option value="${e.profile.id}" ${state.profileId===e.profile.id?'selected':''}>${bearing(e.bearingTrue)} · ${e.coverageComplete?approximate(e.requiredHeightM):'incomplete corridor'}</option>`).join('')}</select></label></div>
      <div class="sea-overview"><div class="sea-main"><div class="sea-stats"><div class="sea-stat sea-primary"><span>Required eye height above original ground</span><strong>${approximate(threshold)}</strong><small>${Number.isFinite(threshold)?`${metres(r.requiredAbsoluteZ)} absolute elevation`:`Known lower bound ${approximate(r.knownLowerBoundM)}`}</small></div><div class="sea-stat"><span>Selected direction</span><strong>${bearing(r.bearingTrue)}</strong><small>${Math.round(r.profile.shoreDistanceM)} m to mapped shoreline</small></div><div class="sea-stat"><span>Controlling obstruction</span><strong class="sea-blocker">${escape(control?.kind==='building'?'Building':control?.kind==='terrain'?'Ground / dune':'Canopy / surface')}</strong><small>${control?`${Math.round(control.distanceM)} m away · ${metres(control.topZ)} ASL`:'No recorded obstruction'}</small></div></div>
      <div class="sea-height"><div class="sea-height-top"><label for="sea-eye-height">Observer eye height above original ground</label><output for="sea-eye-height">${metres(state.heightAboveGround)}</output></div><input id="sea-eye-height" data-sea-control="heightAboveGround" type="range" min="0.5" max="80" step="0.01" value="${state.heightAboveGround}" aria-valuetext="${metres(state.heightAboveGround)} above local ground"/><div class="sea-preset-buttons"><button data-sea-height="${presets.standing}">Standing</button>${Number.isFinite(presets.firstFloor)?`<button data-sea-height="${presets.firstFloor.toFixed(2)}">First-floor eye height</button>`:''}${Number.isFinite(presets.aboveRoofRidge)?`<button data-sea-height="${presets.aboveRoofRidge.toFixed(2)}">Above roof ridge · hypothetical</button>`:''}${Number.isFinite(atHeight)?`<button class="sea-reveal" data-sea-height="${atHeight}">Go to clearing height · ${metres(atHeight)}</button>`:''}</div><p class="sea-preset-note">Floor and roof presets place the eye 1.65 m above the selected floor or reconstructed ridge, at the chosen location. The roof preset is a height comparison, not an accessible viewpoint.</p></div>
      <p class="sea-status" data-status="${r.status}" role="status"><span>${r.status==='clear'?'✓':r.status==='blocked'?'↗':'?'}</span>${escape(status)}</p><p class="sea-explanation">${state.mode==='water'?'This tests a point on the water 1 km beyond the shoreline. Seeing closer water requires a steeper downward view.':'This tests the first distant water near the geometric horizon, a narrower view than seeing water just beyond the beach.'} ${control?`${escape(control.label)} controls this direction.`:''}</p>
      <label class="sea-clearance">Allowance above recorded surfaces <select data-sea-control="clearanceM">${[0,.5,1,2,3,5].map(n=>`<option value="${n}" ${state.clearanceM===n?'selected':''}>${n} m</option>`).join('')}</select></label>
      ${onCamera?'<button class="sea-preview" data-sea-camera>Preview this height in the neighbourhood</button><small class="sea-preview-note">The 3D preview covers the nearby neighbourhood. The complete profile below determines sea visibility.</small>':''}</div><div class="sea-map"><h3>Route to the sea</h3>${seaMapMarkup(corridor,r)}<p>${r.completeBearingCount} complete corridors tested · 2° bearing spacing</p></div></div>
      <div class="sea-profile"><div class="sea-profile-top"><h3>Measured skyline and sightline</h3><div class="sea-legend"><span><i style="background:${colors.building}"></i>Building</span><span><i style="background:${colors.surface}"></i>Canopy / other surface</span><span><i style="background:${colors.terrain}"></i>Ground</span><span><i style="background:${colors.water}"></i>Sea</span></div></div>${seaProfileMarkup(r)}</div>
      <details class="sea-method"><summary>Sources, dates and how to read this estimate</summary><div class="sea-method-content"><p><strong>Recorded landscape: 1 October 2024.</strong> The calculation uses the original GUGiK 0.5 m surface model, including buildings and tree tops, with 1 m ground elevations and the official PRG maritime boundary. The height result is an estimate for the sampled direction, not a survey of today's skyline.</p><p>Each 1 m profile bin retains every native 0.5 m cell touching its bounding rectangle, so a narrow high cell at a grid corner cannot fall between samples. This slightly widens the 1 m corridor conservatively. Missing land samples or a second land crossing before the water target prevent a clear result. The best direction is the best of the discrete tested bearings, not a guarantee of the lowest height in every possible direction.</p><p>All elevations use PL-EVRF2007-NH; eye height is relative to the original ground at the selected point. Sea level is assumed to be 0 m. Earth curvature is included; atmospheric refraction, weather, waves, foliage gaps and changes after acquisition are excluded. The allowance is a planning margin, not a statistical error bound. Proposed planting and renovation edits are not included in this historical surface profile.</p><p>The local shoreline is a legal boundary from PRG (local object version 2018), not a real-time waterline. The wider Gulf coastline is also checked before any horizon result. The map's LoD1 footprints identify buildings; the surface model supplies their actual recorded skyline. Tree species cannot be determined from a surface height.</p><ul>${sourceLinks}</ul></div></details></section>`;
  }
  function control(event){
    const target=event.target.closest('[data-sea-control]');if(!target||!container.contains(target))return;
    const key=target.dataset.seaControl;
    state[key]=['heightAboveGround','clearanceM'].includes(key)?Number(target.value):target.value;
    if(key==='observerId')state.profileId='best';
    persist();
    // Updating the range without replacing its active input preserves a drag.
    if(event.type==='input'&&key==='heightAboveGround'){
      current=evaluateSeaView(corridor,state);
      const savedFocus=target;
      const profile=container.querySelector('.sea-profile-svg');
      if(profile)profile.outerHTML=seaProfileMarkup(current);
      container.querySelector('.sea-height output').textContent=metres(state.heightAboveGround);
      savedFocus.setAttribute('aria-valuetext',`${metres(state.heightAboveGround)} above local ground`);
      const status=container.querySelector('.sea-status');
      status.dataset.status=current.status;status.textContent=`${current.status==='clear'?'✓':current.status==='blocked'?'↗':'?'} ${statusText(current)}`;
      return;
    }
    render();
    container.querySelector(`[data-sea-control="${key}"]`)?.focus({preventScroll:true});
  }
  function click(event){
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-sea-height')){state.heightAboveGround=Math.min(80,Math.max(.5,Number(button.dataset.seaHeight)));persist();render();}
    if(button.hasAttribute('data-sea-camera'))onCamera?.(seaCameraPose(current),current);
  }
  container.addEventListener('input',control);container.addEventListener('change',control);container.addEventListener('click',click);render();
  return {update(next={}){if('data'in next)data=next.data;if('corridor'in next)corridor=next.corridor;if('settings'in next)settings=next.settings;render();},getResult:()=>current,getState:()=>({...state}),exportSummary:()=>seaViewSummary(corridor,current,state),destroy(){disposed=true;current=null;container.removeEventListener('input',control);container.removeEventListener('change',control);container.removeEventListener('click',click);container.innerHTML='';}};
}
