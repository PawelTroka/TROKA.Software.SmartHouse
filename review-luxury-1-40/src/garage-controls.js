import {GARAGE_PRESETS,garagePresetState,matchesGaragePreset,createGarageLayoutCache} from './garage-options.js?v=1.40.0';
import {garageLayout,garageVehiclePose} from './garage-ramp.js?v=1.40.0';
import {terrainAt} from './geometry.js?v=1.40.0';

const $=id=>document.getElementById(id);
const fmt=(value,digits=1)=>Number.isFinite(value)?value.toFixed(digits):'—';
const mm=value=>Number.isFinite(value)?`${fmt(value*1000,1)} mm`:'—';
const finitePoints=points=>(points||[]).filter(point=>Number.isFinite(point.s)&&Number.isFinite(point.z));
const sourceRecord='./data/garage-sources.json';

/** Equal horizontal and vertical scales: do not visually flatten a crest. */
export function garageProfileSVG(layout,pose){
  const points=finitePoints(layout?.sideProfile?.length?layout.sideProfile:layout?.profile);
  if(!layout||!points.length)return '';
  const underside=finitePoints(pose?.underbody),roof=finitePoints(pose?.roof);
  const body=(pose?.bodyPolygon||[]).map(([u,h])=>{
    const world=pose.localToWorld(u,0,h);
    return {s:pose.rearS+(world[0]-pose.rearAxle.x)*layout.axis.direction[0]+(world[1]-pose.rearAxle.y)*layout.axis.direction[1],z:world[2]};
  }).filter(point=>Number.isFinite(point.s)&&Number.isFinite(point.z));
  const wheels=(pose?.sideWheels||[]).filter(wheel=>Number.isFinite(wheel.s)&&Number.isFinite(wheel.z)&&Number.isFinite(wheel.radius));
  const minS=Math.min(-4.8,...points.map(point=>point.s),...body.map(point=>point.s))-.4;
  const maxS=Math.max(layout.totalRun+5,...points.map(point=>point.s),...body.map(point=>point.s))+.4;
  const minZ=Math.min(layout.floorZ,...points.map(point=>point.z))-.8;
  const maxZ=Math.max(layout.livingFloorZ+1.15,...roof.map(point=>point.z+.5));
  const width=900,padding=43,scale=(width-padding*2)/(maxS-minS),height=78+(maxZ-minZ)*scale;
  const x=s=>padding+(s-minS)*scale,y=z=>36+(maxZ-z)*scale;
  const pair=point=>`${fmt(x(point.s),2)},${fmt(y(point.z),2)}`;
  const surface=points.map(pair).join(' ');
  const ground=`${fmt(x(points[0].s),2)},${fmt(y(minZ),2)} ${surface} ${fmt(x(points.at(-1).s),2)},${fmt(y(minZ),2)}`;
  const wallX=x(layout.frontRun),rightX=x(maxS),slabTop=y(layout.livingFloorZ),slabBottom=y(layout.ceilingZ);
  const dimensionY=height-26,frontStart=x(0),frontEnd=x(layout.frontRun);
  const contact=Number.isFinite(pose?.minimumClearance)&&pose.minimumClearance<0;
  const landing=layout.entryAccess?.landing;
  const landingSlab=landing?`<rect x="${x(landing.fromS)}" y="${y(landing.topZ)}" width="${x(landing.toS)-x(landing.fromS)}" height="${y(landing.soffitZ)-y(landing.topZ)}" fill="#b9c8b7" stroke="#627d68"/><text x="${x(landing.fromS)-7}" y="${y(landing.topZ)-12}" text-anchor="end" class="profile-small">Proposed entry landing</text>`:'';
  const car=body.length?`<polygon points="${body.map(pair).join(' ')}" fill="#4f8a76" fill-opacity=".24" stroke="#2c5848" stroke-width="1.5" stroke-dasharray="5 3"/>`:'';
  const tyres=wheels.map(wheel=>`<circle cx="${fmt(x(wheel.s),2)}" cy="${fmt(y(wheel.z),2)}" r="${fmt(wheel.radius*scale,2)}" fill="#343a35" stroke="#fffef9" stroke-width="1.6"/><circle cx="${fmt(x(wheel.s),2)}" cy="${fmt(y(wheel.z),2)}" r="${fmt(wheel.radius*scale*.48,2)}" fill="#cbd4ca"/>`).join('');
  const envelope=underside.length?`<polyline points="${underside.map(pair).join(' ')}" fill="none" stroke="${contact?'#bd543c':'#d29542'}" stroke-width="2.1" stroke-dasharray="4 3"/>`:'';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${fmt(height,2)}" role="img" aria-labelledby="garage-profile-title garage-profile-description" data-scale="equal" data-front-run="${fmt(layout.frontRun,3)}">
    <title id="garage-profile-title">Basement ramp side profile and MG Cyberster clearance envelope</title>
    <desc id="garage-profile-description">Equal-scale side section. The full front approach is ${fmt(layout.frontRun,2)} metres, with ${fmt(layout.drop,2)} metres descent from street to basement. The green box is the conservative car envelope; the orange dashed line is its underside. The car position is a preview; the results check both complete drives.</desc>
    <rect width="${width}" height="${fmt(height,2)}" fill="#fffef9"/>
    <polygon points="${ground}" fill="#e7e2d4"/>
    <line x1="${frontStart}" y1="${y(layout.streetZ)}" x2="${frontEnd}" y2="${y(layout.streetZ)}" stroke="#b9c8b7" stroke-dasharray="5 4"/>
    <rect x="${wallX}" y="${slabTop}" width="${rightX-wallX}" height="${Math.max(1,slabBottom-slabTop)}" fill="#d3d3c6" stroke="#a4ad9c"/>
    ${landingSlab}
    <line x1="${wallX}" y1="${y(maxZ-.15)}" x2="${wallX}" y2="${y(layout.portal?.topZ??layout.ceilingZ)}" stroke="#82957f" stroke-width="4"/>
    <polyline points="${surface}" fill="none" stroke="#657b65" stroke-width="3" stroke-linejoin="round"/>
    <line x1="${frontStart}" y1="${y(layout.streetZ)-12}" x2="${frontStart}" y2="${dimensionY-9}" stroke="#afbcaa" stroke-dasharray="3 4"/>
    <line x1="${frontEnd}" y1="${slabBottom+5}" x2="${frontEnd}" y2="${dimensionY-9}" stroke="#afbcaa" stroke-dasharray="3 4"/>
    ${car}${tyres}${envelope}
    <text x="${x(-3.8)}" y="${y(layout.streetZ)-16}" class="profile-label">Street approach</text>
    <text x="${wallX+12}" y="${slabTop-12}" class="profile-label">Living floor</text>
    <text x="${wallX+12}" y="${slabBottom+18}" class="profile-small">Slab underside</text>
    <text x="${rightX-8}" y="${y(layout.floorZ)+22}" text-anchor="end" class="profile-label">Basement floor</text>
    <line x1="${frontStart}" y1="${dimensionY}" x2="${frontEnd}" y2="${dimensionY}" stroke="#627d68"/>
    <path d="M${frontStart+5},${dimensionY-4}L${frontStart},${dimensionY}L${frontStart+5},${dimensionY+4}M${frontEnd-5},${dimensionY-4}L${frontEnd},${dimensionY}L${frontEnd-5},${dimensionY+4}" fill="none" stroke="#627d68"/>
    <text x="${(frontStart+frontEnd)/2}" y="${dimensionY-8}" text-anchor="middle" class="profile-dimension">${fmt(layout.frontRun,2)} m · full front yard</text>
    <text x="${padding}" y="${height-8}" class="profile-small">Equal scales · green box = conservative car envelope</text>
  </svg>`;
}
/** A dimensioned plan complements the side profile: both cars occupy separate
 * lanes and every width shown is the same width used by the scene and checks. */
export function garageParkingPlanSVG(layout){
  const parking=layout?.parking,v=layout?.vehicle;
  if(!layout?.enabled||!parking||!v||!Number.isFinite(layout.parkingFlatLength))return '';
  const length=layout.parkingFlatLength,clearWidth=layout.clearWidth,scale=Math.min(450/Math.max(length,1),330/clearWidth),left=70,top=48;
  const right=left+length*scale,bottom=top+clearWidth*scale,height=bottom+65;
  const y=lateral=>top+(lateral+clearWidth/2)*scale,carX=right-(v.length+.3)*scale;
  const cars=parking.laneOffsets.map((offset,i)=>{
    const centre=y(offset),bodyY=centre-v.width*scale/2,mirrorY=centre-v.mirrorWidth*scale/2;
    return `<g data-car="${i+1}" data-length="${v.length}" data-body-width="${v.width}" data-mirror-width="${v.mirrorWidth}">
      <rect x="${carX}" y="${mirrorY}" width="${v.length*scale}" height="${v.mirrorWidth*scale}" rx="8" fill="none" stroke="#718d7c" stroke-width="1.5" stroke-dasharray="5 3"/>
      <rect x="${carX}" y="${bodyY}" width="${v.length*scale}" height="${v.width*scale}" rx="13" fill="${i===parking.spaces-1?'#ead3cc':'#dce3dd'}" stroke="${i===parking.spaces-1?'#935342':'#60786b'}" stroke-width="1.5"/>
      <line x1="${right-.55*scale}" y1="${bodyY+9}" x2="${right-.55*scale}" y2="${bodyY+v.width*scale-9}" stroke="#60786b"/>
      <text x="${carX+v.length*scale/2}" y="${centre-15}" text-anchor="middle" class="profile-label">Car ${i+1} · Cyberster envelope</text>
      <text x="${carX+v.length*scale/2}" y="${centre+7}" text-anchor="middle" class="profile-small">4.535 × 1.913 m body</text>
      <text x="${carX+v.length*scale/2}" y="${centre+27}" text-anchor="middle" class="profile-small">2.110 m across mirrors</text></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" class="garage-parking-svg" viewBox="0 0 600 ${height}" role="img" aria-labelledby="garage-parking-title garage-parking-description" data-spaces="${parking.spaces}" data-width-pass="${parking.widthPass}">
    <title id="garage-parking-title">${parking.spaces}-car basement plan with closed-door vehicle dimensions</title>
    <desc id="garage-parking-description">The garage is ${fmt(clearWidth,2)} metres clear across, with ${fmt(length,2)} metres of flat covered parking. Each Cyberster envelope is 4.535 metres long, 1.913 metres wide, or 2.110 metres across its mirrors. The side mirror-to-wall gap is ${fmt(parking.mirrorWallClearance,3)} metres, with ${fmt(parking.betweenMirrors,3)} metres between mirror envelopes. Door opening and turning are not simulated.</desc>
    <rect width="600" height="${height}" fill="#fffef9"/>
    <text x="${left}" y="25" class="profile-label">Two cars side by side · doors closed</text>
    <rect x="${left}" y="${top}" width="${length*scale}" height="${clearWidth*scale}" fill="#edf0e7" stroke="#627d68" stroke-width="2"/>
    <line x1="${left}" y1="${y(0)}" x2="${right}" y2="${y(0)}" stroke="#8a9d8b" stroke-dasharray="5 5"/>
    ${cars}
    <line x1="${left-20}" y1="${top}" x2="${left-20}" y2="${bottom}" stroke="#627d68"/>
    <path d="M${left-25},${top}h10M${left-25},${bottom}h10" stroke="#627d68"/>
    <text x="${left-32}" y="${(top+bottom)/2}" text-anchor="middle" transform="rotate(-90 ${left-32} ${(top+bottom)/2})" class="profile-dimension">${fmt(clearWidth,2)} m clear</text>
    <line x1="${left}" y1="${bottom+24}" x2="${right}" y2="${bottom+24}" stroke="#627d68"/>
    <path d="M${left},${bottom+19}v10M${right},${bottom+19}v10" stroke="#627d68"/>
    <text x="${(left+right)/2}" y="${bottom+46}" text-anchor="middle" class="profile-dimension">${fmt(length,2)} m flat covered bay</text>
  </svg>`;
}
export function garageClearanceResult(layout){
  const a=layout?.assessment;
  if(!a||!Number.isFinite(a.minimumClearance))return {status:'unavailable',label:'Clearance result unavailable'};
  if(a.minimumClearance<0)return {status:'contact',label:'Modelled underside contact'};
  const conservative=Number.isFinite(a.conservativeClearance)?a.conservativeClearance:a.minimumClearance;
  if(conservative>=a.requiredMargin&&Number.isFinite(a.minCoveredHeadroom)&&a.minCoveredHeadroom<2.2)return {status:'headroom-shortfall',label:'Car reserve met · covered headroom below 2.2 m'};
  if(a.parkingWidthPass===false)return {status:'geometry-limit',label:`Garage too narrow for ${layout.parking?.spaces??2} cars with the selected allowances`};
  if(a.status==='geometry-limit')return {status:'geometry-limit',label:'Ramp geometry needs adjustment'};
  if(a.status==='reserve-shortfall'||conservative<a.requiredMargin)return {status:'reserve-shortfall',label:'Below the modelled clearance reserve'};
  if(layout.documentedInterior?.conflicts?.length)return {status:'structure-conflict',label:'Car reserve met · existing stairs / flues obstruct the route'};
  return {status:'reserve-met',label:'Modelled car-clearance reserve met'};
}
export function garageConfigurationWarnings(layout){
  const a=layout?.assessment;if(!a)return [];
  const warnings=[],clearance=Number.isFinite(a.conservativeClearance)?a.conservativeClearance:a.minimumClearance;
  if(a.minimumClearance<0)warnings.push('The conservative car underside intersects the ramp. Reduce the descent or provide more transition length.');
  else if(clearance<a.requiredMargin)warnings.push('The selected underside reserve is not achieved. Compare more transition length, a shallower floor or measured vehicle geometry.');
  if(a.minCoveredHeadroom<2.2)warnings.push(`Covered entrance headroom is ${fmt(a.minCoveredHeadroom,2)} m, below the former 2.2 m garage benchmark. Adjust the slab, floor or indoor ramp.`);
  if(a.widthBenchmarkPass===false||(Number.isFinite(layout.clearWidth)&&layout.clearWidth<3))warnings.push(`Ramp clear width is ${fmt(layout.clearWidth,2)} m, below the former 3 m access benchmark.`);
  if(a.doorBenchmarkPass===false||(Number.isFinite(layout.portal?.clearHeight)&&layout.portal.clearHeight<2))warnings.push(`The modelled doorway is only ${fmt(layout.portal?.clearHeight,2)} m high, below the former 2 m opening benchmark.`);
  if(a.gradeWithinLimit===false)warnings.push(`Peak gradient ${fmt(layout.design?.peakGrade*100,1)}% exceeds the selected ${fmt(layout.settings?.garageMaxGrade,0)}% limit. Add run or reduce the floor drop.`);
  else if(layout.design?.peakGrade>.25+1e-6)warnings.push(`Peak gradient ${fmt(layout.design.peakGrade*100,1)}% exceeds the former 25% individual-garage benchmark.`);
  if(a.parkingFits===false)warnings.push(`Only ${fmt(a.parkingFlatLength,2)} m of flat covered parking remains; the model needs the car length plus 0.30 m at each end.`);
  if(a.parkingWidthPass===false)warnings.push(`${layout.parking?.spaces??2} cars need ${fmt(layout.parking?.minimumWidth,2)} m clear width for the chosen mirror allowances; this layout has ${fmt(layout.clearWidth,2)} m. The car doors remain closed in this check.`);
  if(layout.drop<=0)warnings.push('The proposed floor is at or above street level. Adjust the floor/slab assumptions to model a descending basement ramp.');
  const overhead=a.minimumOverheadClearance-(a.numericalAllowance||0);
  if(overhead<0)warnings.push('The closed-car roof envelope meets the doorway or slab. Increase the opening/headroom or change the ramp profile.');
  else if(overhead<a.requiredMargin)warnings.push('The roof clearance at the doorway or slab is below the selected model reserve.');
  if(layout.documentedInterior?.conflicts?.length)warnings.push('The supplied basement plan places retained stair / flue structure across this two-car approach. Inspect Interiors → Basement → Your renovation. A structural redesign is required before this route can be considered usable.');
  return warnings;
}

/** Card and sidebar share saved state. Preview changes do not run a garden sweep. */
export function createGarageControls({getSettings,getData,onChange,onPreview,onView,notify}){
  const getLayout=createGarageLayoutCache(garageLayout),options={terrainAt};
  const layout=()=>getLayout(getSettings(),getData(),options);
  const section=$('basement-garage-controls');
  for(const button of document.querySelectorAll('[data-garage-preset]')){
    button.addEventListener('click',()=>{
      const id=button.dataset.garagePreset;
      onChange(garagePresetState(id,getSettings()),{focus:id!=='none'});
      const preset=GARAGE_PRESETS.find(item=>item.id===id);
      notify(preset?`${preset.label} selected · compare the full-drive clearance below`:'Basement garage switched off');
    });
  }
  $('basementGarageEnabled').addEventListener('change',event=>onChange({basementGarageEnabled:event.target.checked},{focus:event.target.checked}));
  $('garageProgress').addEventListener('input',event=>onPreview({garageProgress:Number(event.target.value)}));
  for(const button of document.querySelectorAll('[data-garage-reverse]'))button.addEventListener('click',()=>onPreview({garageReverse:button.dataset.garageReverse==='true'}));
  $('garage-view').addEventListener('click',onView);
  $('garage-edit').addEventListener('click',()=>{section.open=true;section.scrollIntoView({behavior:'smooth',block:'start'});});
  $('garage-edit-floor').addEventListener('click',()=>{
    const field=$('floorHeight'),details=field.closest('details');if(details)details.open=true;
    field.scrollIntoView({behavior:'smooth',block:'center'});field.focus({preventScroll:true});
  });
  function sync(){
    const settings=getSettings(),available=settings.siteId==='sternicza-11',enabled=available&&settings.basementGarageEnabled;
    section.hidden=!available;$('garage-profile-card').hidden=!available;
    if(!available)return;
    $('basementGarageEnabled').checked=enabled;
    $('garage-dimension-settings').hidden=!enabled;$('garage-profile-body').hidden=!enabled;$('garage-off-note').hidden=enabled;
    $('garage-view').disabled=!enabled;
    $('garage-model-assumption-details').hidden=!enabled;
    $('garage-profile-card').dataset.enabled=String(enabled);
    for(const button of document.querySelectorAll('[data-garage-preset]'))button.setAttribute('aria-pressed',String(matchesGaragePreset(button.dataset.garagePreset,settings)));
    for(const button of document.querySelectorAll('[data-garage-reverse]'))button.setAttribute('aria-pressed',String((button.dataset.garageReverse==='true')===settings.garageReverse));
    const preset=GARAGE_PRESETS.find(item=>matchesGaragePreset(item.id,settings));
    $('garage-preset-note').textContent=preset?.description||(enabled?'Custom basement comparison · review the profile and both driving directions.':'No basement excavation in the current design.');
    $('garage-progress-label').textContent=`${fmt(settings.garageProgress,0)}%`;
    $('garageProgress').value=settings.garageProgress;
  }
  function render(){
    const settings=getSettings();
    if(settings.siteId!=='sternicza-11'||!settings.basementGarageEnabled)return;
    const current=layout();if(!current?.assessment)return;
    const a=current.assessment,result=garageClearanceResult(current);
    const pose=garageVehiclePose(current,settings.garageProgress/100,settings.garageReverse);
    $('garage-profile').innerHTML=garageProfileSVG(current,pose);
    const parkingPlan=$('garage-parking-plan');if(parkingPlan)parkingPlan.innerHTML=garageParkingPlanSVG(current);
    $('garage-result').dataset.status=result.status;
    const allowance=a.numericalAllowance||0,conservative=Number.isFinite(a.conservativeClearance)?a.conservativeClearance:a.minimumClearance-allowance;
    $('garage-result').dataset.minimumClearance=String(conservative);
    $('garage-result').dataset.requiredMargin=String(a.requiredMargin);
    $('garage-result-status').textContent=result.label;
    const remainder=conservative-a.requiredMargin;
    $('garage-result-note').textContent=`${mm(conservative)} conservative minimum across both drives, including ${mm(allowance)} numerical allowance; ${mm(a.requiredMargin)} reserve requested. ${remainder>=0?`${mm(remainder)} remains beyond that reserve.`:`${mm(-remainder)} below that reserve.`}`;
    $('garage-front-run').textContent=`${fmt(current.frontRun,2)} m`;
    $('garage-floor-drop').textContent=`${fmt(current.drop,2)} m`;
    $('garage-peak-grade').textContent=`${fmt(current.design?.peakGrade*100,1)}%`;
    $('garage-headroom').textContent=Number.isFinite(a.minCoveredHeadroom)?`${fmt(a.minCoveredHeadroom,2)} m`:'—';
    $('garage-door-opening').textContent=`${fmt(current.portal?.width,2)} × ${fmt(current.portal?.clearHeight,2)} m`;
    $('garage-parking-length').textContent=`${fmt(a.parkingFlatLength,2)} m`;
    const capacity=$('garage-parking-capacity');if(capacity)capacity.textContent=`${current.parking.spaces} × ${fmt(current.parking.laneWidth,2)} m lanes`;
    const lateral=$('garage-lateral-clearance');if(lateral)lateral.textContent=`${fmt(current.parking.mirrorWallClearance*1000,0)} mm to walls · ${fmt(current.parking.betweenMirrors*1000,0)} mm between`;
    const parkingNote=$('garage-parking-note');if(parkingNote)parkingNote.textContent=`Both cars use the dimensioned Cyberster envelope with mirrors extended and doors closed. The body clears the wall by ${fmt(current.parking.bodyWallClearance*1000,0)} mm, with ${fmt(current.parking.betweenBodies*1000,0)} mm between bodies. Door movement and the turn from the street remain unmodelled.${current.entryAccess?` A proposed side stair keeps the front door in place; minimum closed-car roof clearance beneath its landing is ${mm(a.minimumEntryLandingClearance-allowance)} after the numerical allowance.`:''}`;
    $('garage-forward-clearance').textContent=mm(a.forward?.minimumClearance-allowance);
    $('garage-reverse-clearance').textContent=mm(a.reverse?.minimumClearance-allowance);
    $('garage-clearance-reserve').textContent=mm(a.requiredMargin);
    $('garage-level-summary').textContent=`Living floor ${fmt(current.livingFloorZ-current.streetZ,2)} m above street entry. Basement floor ${fmt(current.drop,2)} m below street entry, after ${fmt(settings.garageSlabThickness,2)} m slab + ${fmt(settings.garageClearHeight,2)} m base clear height${settings.garageExtraDepth>0?` + ${fmt(settings.garageExtraDepth,2)} m extra lowering`:''}. Historical cellar: −2.00 m from the living floor, 1.70 m clear. This proposal lowers it another ${fmt(current.documentedInterior?.additionalLowering,2)} m; street datum and present construction remain unverified.`;
    const direction=settings.garageReverse?'Reverse entry':'Forward entry';
    $('garage-current-pose').textContent=`${direction} preview in its own lane, beside the parked second car · ${mm(pose?.minimumClearance)} underside clearance here · pitch ${fmt(pose?.pitchDegrees??pose?.pitchRadians*180/Math.PI,1)}°. The minimum over the whole drive is shown below.`;
    const warnings=garageConfigurationWarnings(current);
    $('garage-layout-warning').hidden=!warnings.length;
    $('garage-layout-warning').textContent=warnings.join(' ');
    const assumptions=$('garage-model-assumptions');assumptions.replaceChildren();
    for(const note of a.warnings||[]){const item=document.createElement('li');item.textContent=note;assumptions.append(item);}
  }
  function exportSummary(){
    const settings=getSettings();
    if(settings.siteId!=='sternicza-11')return null;
    if(!settings.basementGarageEnabled)return {enabled:false,sources:sourceRecord};
    const current=layout();
    return {enabled:true,streetZ:current.streetZ,livingFloorZ:current.livingFloorZ,ceilingZ:current.ceilingZ,
      floorZ:current.floorZ,drop:current.drop,frontRun:current.frontRun,totalRun:current.totalRun,
      design:current.design,assessment:current.assessment,documentedInterior:current.documentedInterior,profile:current.profile,vehicle:current.vehicle,portal:current.portal,parking:current.parking,entryAccess:current.entryAccess,
      preview:{progress:settings.garageProgress/100,reverse:settings.garageReverse},sources:sourceRecord,
      note:'Conditional geometric comparison using an assumed flat underside and design reserve. Survey, structure, drainage, traction, local rules, headroom and door-opening envelopes remain separate checks.'};
  }
  return {sync,render,exportSummary};
}
