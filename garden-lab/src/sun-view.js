import {hedgeSegments,canopyBounds,jacuzziBounds} from './geometry.js?v=1.5.0';
import {formatSolarTime,localSunDirection} from './solar.js?v=1.5.0';
import {getSiteProfile} from './sites.js?v=1.5.0';
import {screeningTreeVolumes} from './screening-trees.js?v=1.5.0';
import {treePlanMarkup} from './tree-drawing.js?v=1.5.0';

const $=id=>document.getElementById(id);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors={sun:'#e8c775',shade:'#789184',night:'#708091',disabled:'#dce2d6'};
export function compassPoint(azimuth){return ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(azimuth/22.5)%16];}

export function renderSunReadouts(sun,shade,settings){
  $('sun-date').value=settings.sunDate;
  $('sun-time').value=formatSolarTime(settings.sunMinutes);
  $('sun-minutes').value=settings.sunMinutes;
  $('sun-minutes').setAttribute('aria-valuetext',`${formatSolarTime(settings.sunMinutes)} Gdańsk local time`);
  $('sun-minutes').style.setProperty('--progress',`${settings.sunMinutes/1439*100}%`);
  $('sun-enabled').checked=settings.sunEnabled;
  $('sun-path-visible').checked=settings.sunPathVisible;
  $('sun-timezone').textContent=`Gdańsk local time · ${sun.timezoneLabel}`;
  $('sun-time-note').textContent=sun.timeNote||'';
  $('sun-time-note').hidden=!sun.timeNote;
  $('sun-clock-label').textContent=`${formatSolarTime(sun.resolvedMinutes)} · ${sun.isDaylight?'Sun above horizon':'Sun below horizon'}`;
  $('sun-summary').textContent=settings.sunEnabled?`${new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(`${sun.date}T12:00:00Z`))} · ${formatSolarTime(sun.resolvedMinutes)} · ${sun.isDaylight?`${sun.elevation.toFixed(1)}° elevation`:'Night'}`:'Neutral lighting';
  $('sun-elevation').textContent=`${sun.elevation.toFixed(1)}°`;
  $('sun-bearing').textContent=`${compassPoint(sun.azimuth)} · ${sun.azimuth.toFixed(0)}°`;
  $('sunrise-time').textContent=formatSolarTime(sun.sunriseMinutes);
  $('sunset-time').textContent=formatSolarTime(sun.sunsetMinutes);
  $('solar-noon-time').textContent=formatSolarTime(sun.noonMinutes);
  const dayMinutes=Math.round(sun.daylightMinutes);
  $('sun-daylength').textContent=`${Math.floor(dayMinutes/60)} h ${dayMinutes%60} min`;
  document.querySelectorAll('[data-sun-season]').forEach(b=>b.setAttribute('aria-pressed',String(settings.sunDate.slice(5)===b.dataset.sunSeason)));
  for(const zone of ['garden','terrace','jacuzzi','pool']){
    const result=shade.zones[zone],value=result.percent;
    $(`sunlit-${zone}`).textContent=Number.isFinite(value)?value>0&&value<1?'<1%':value>99&&value<100?'>99%':`${Math.round(value)}%`:'—';
    $(`sunlit-${zone}-bar`).style.width=Number.isFinite(value)?`${value}%`:'0%';
    $(`sunlit-${zone}-count`).textContent=shade.status==='night'?'Sun below horizon':shade.status==='disabled'?'Simulation off':result.total?`${result.sunlit} / ${result.total} points in direct sun`:'No outdoor sample points';
  }
  $('sun-analysis-note').textContent=shade.status==='night'?'The sun is below the horizon. There is no direct sunlight; this is different from shade cast by a building or hedge.':shade.status==='disabled'?'Enable real sunlight to calculate shade for the selected date and time.':'Direct sun at outdoor sample points, spaced 1 m apart. Includes mapped buildings and roofs, opaque hedges, canopy, local terrain and added screening trees. Leafy tree crowns are dense-volume approximations; existing unmapped trees and decorative plants are excluded.';
  $('sun-results').dataset.status=shade.status;
  const W=600,H=102,left=25,right=12,top=9,bottom=21;
  const X=m=>left+(W-left-right)*m/1440,Y=e=>top+(70-e)/85*(H-top-bottom);
  const path=sun.path.map((p,i)=>`${i?'L':'M'}${X(p.minutes).toFixed(2)},${Y(p.elevation).toFixed(2)}`).join(' ');
  const sunrise=Number.isFinite(sun.sunriseMinutes)?sun.sunriseMinutes:0,sunset=Number.isFinite(sun.sunsetMinutes)?sun.sunsetMinutes:1440;
  $('sun-day-chart').innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Sun elevation throughout ${escape(sun.date)} in Warsaw local time. Selected elevation ${sun.elevation.toFixed(1)} degrees."><defs><clipPath id="sun-chart-clip"><rect x="${left}" y="${top}" width="${W-left-right}" height="${H-top-bottom}"/></clipPath></defs><rect x="${left}" y="${top}" width="${W-left-right}" height="${H-top-bottom}" rx="5" fill="#edf0e9"/><rect x="${X(sunrise)}" y="${top}" width="${Math.max(0,X(sunset)-X(sunrise))}" height="${H-top-bottom}" fill="#f8efd6"/><line x1="${left}" x2="${W-right}" y1="${Y(0)}" y2="${Y(0)}" stroke="#9da89a" stroke-dasharray="3 3"/><g clip-path="url(#sun-chart-clip)"><path d="${path}" fill="none" stroke="#a98432" stroke-width="2.5"/><line x1="${X(sun.resolvedMinutes)}" x2="${X(sun.resolvedMinutes)}" y1="${top}" y2="${H-bottom}" stroke="#345f49" stroke-width="1.5"/><circle cx="${X(sun.resolvedMinutes)}" cy="${Y(sun.elevation)}" r="4" fill="#e4ae3f" stroke="#fffef9" stroke-width="2"/></g>${[0,6,12,18,24].map(h=>`<text x="${X(h*60)}" y="${H-5}" text-anchor="${h===0?'start':h===24?'end':'middle'}" fill="#6d7b6d" font-size="10">${String(h).padStart(2,'0')}:00</text>`).join('')}<text x="2" y="${Y(0)+3}" fill="#6d7b6d" font-size="10">0°</text><text x="2" y="${Y(60)+3}" fill="#6d7b6d" font-size="10">60°</text></svg>`;
}

export function sunMapBounds(scope,data,compact=false){
  const plot=getSiteProfile(data.site.id||'sternicza-11',data).bounds;
  if(scope==='context'){
    const points=[...data.site.boundary,...data.buildings.filter(b=>b.kind==='target'&&b.footprint?.length).flatMap(b=>b.footprint)];
    return {minX:Math.min(...points.map(p=>p[0]))-5,maxX:Math.max(...points.map(p=>p[0]))+5,minY:Math.min(...points.map(p=>p[1]))-6,maxY:Math.max(...points.map(p=>p[1]))+5};
  }
  return {minX:plot.minX-(compact?3:8),maxX:plot.maxX+(compact?3:8),minY:plot.minY-3,maxY:plot.maxY+4};
}

/** A metric plan of direct-sun samples, separate from the privacy sightline score. */
export function renderSunMap(container,data,settings,sun,shade){
  const scope=container.dataset.sunScope==='context'?'context':'garden';
  const W=Math.max(340,container.clientWidth||760),H=Math.max(310,(container.clientHeight||470)-75);
  const compact=W<520;
  const profile=getSiteProfile(data.site.id||'sternicza-11',data),plot=profile.bounds;
  const bounds=sunMapBounds(scope,data,compact);
  const pad=24,scale=Math.min((W-pad*2)/(bounds.maxX-bounds.minX),(H-pad*2)/(bounds.maxY-bounds.minY));
  const ox=(W-(bounds.maxX-bounds.minX)*scale)/2,oy=(H-(bounds.maxY-bounds.minY)*scale)/2;
  const X=x=>ox+(x-bounds.minX)*scale,Y=y=>oy+(y-bounds.minY)*scale;
  const poly=p=>p.map(v=>`${X(v[0]).toFixed(2)},${Y(v[1]).toFixed(2)}`).join(' ');
  const rect=(x,y,w,h,attrs)=>`<rect x="${X(x)}" y="${Y(y)}" width="${w*scale}" height="${h*scale}" ${attrs}/>`;
  const label=(text,x,y,size=11)=>`<text x="${X(x)}" y="${Y(y)}" text-anchor="middle" font-size="${size}" font-weight="600" fill="#294735" paint-order="stroke" stroke="#fffef9" stroke-width="3" stroke-linejoin="round">${escape(text)}</text>`;
  const centre=p=>p.reduce((a,v)=>[a[0]+v[0]/p.length,a[1]+v[1]/p.length],[0,0]);
  const {site}=data,t={...site.terrace,depth:settings.terraceDepth},p=site.pool,c=settings.canopyEnabled?canopyBounds(settings,data):null,j=jacuzziBounds(settings,data);
  const context=data.buildings.filter(b=>b.footprint?.length&&b.kind!=='house'&&b.kind!=='garage'&&b.id!==site.house.id&&b.id!==site.garage?.id).map(b=>{
    const bc=centre(b.footprint);
    return `<polygon points="${poly(b.footprint)}" fill="${b.kind==='target'?'#d0b7a7':'#dedfd5'}" stroke="#b7c0b3" stroke-width="1"/>${scope==='context'&&b.kind==='target'?label(b.label.replace(' apartment block','').replace(' continuation',''),bc[0],bc[1],compact?9:11):''}`;
  }).join('');
  const cellMarkup=shade.cells.map((cell,i)=>`<rect x="${X(cell.x-.5)}" y="${Y(cell.y-.5)}" width="${scale}" height="${scale}" fill="${colors[cell.state]||colors.disabled}" data-sun-cell="${i}"><title>${escape(`${cell.zone} · ${cell.state==='sun'?'Direct sun':cell.state==='shade'?`Shade from ${cell.blockedLabel||cell.blockedBy||'modeled geometry'}`:cell.state==='night'?'Sun below horizon':'Simulation off'}`)}</title></rect>`).join('');
  const hedges=hedgeSegments(settings,data).filter(h=>h.height>0).map(h=>`<line x1="${X(h.a[0])}" y1="${Y(h.a[1])}" x2="${X(h.b[0])}" y2="${Y(h.b[1])}" stroke="#31563f" stroke-width="${Math.max(2,.5*scale)}"/>`).join('');
  const trees=treePlanMarkup(screeningTreeVolumes(settings,data),{X,Y,scale,subtle:true,labels:scope==='garden'});
  const north=localSunDirection(0,0,data),cx=compact?W-42:W-61,cy=48,R=26;
  const azLen=Math.hypot(sun.direction[0],sun.direction[1])||1;
  const sx=cx+sun.direction[0]/azLen*R,sy=cy+sun.direction[1]/azLen*R;
  const compass=`<g><circle cx="${cx}" cy="${cy}" r="${R}" fill="#fffef9" fill-opacity=".95" stroke="#d9dfd2"/><line x1="${cx}" y1="${cy}" x2="${cx+north[0]*22}" y2="${cy+north[1]*22}" stroke="#365744" stroke-width="2"/><text x="${cx+north[0]*35}" y="${cy+north[1]*35+3}" text-anchor="middle" fill="#365744" font-size="11" font-weight="700">N</text><line x1="${cx}" y1="${cy}" x2="${sx}" y2="${sy}" stroke="#be8c27" stroke-width="2"/><circle cx="${sx}" cy="${sy}" r="5" fill="${sun.isDaylight?'#e5b347':'#778593'}" stroke="#fffef9" stroke-width="1.5"/><text x="${cx}" y="${cy+R+18}" text-anchor="middle" fill="#6d796c" font-size="10">${sun.isDaylight?'Toward sun':'Sun below horizon'}</text></g>`;
  const houseC=centre(site.house.footprint);
  const detail=scope==='garden';
  const canopy=c?rect(c.x0,c.y0,c.x1-c.x0,c.y1-c.y0,'fill="none" stroke="#6c5740" stroke-width="2" stroke-dasharray="5 3"'):'';
  const jacuzzi=j?rect(j.x0,j.y0,j.x1-j.x0,j.y1-j.y0,'fill="#76a8a7" fill-opacity=".4" stroke="#4b7775" stroke-width="1"'):'';
  const sideY=site.rearMidpoint[1]+Math.max(1.5,(plot.maxY-site.rearMidpoint[1])*.3);
  const poolFill=p?rect(p.x,p.y,p.width,p.length,'fill="#aed2ce"'):'';
  const poolOutline=p?rect(p.x,p.y,p.width,p.length,'fill="none" stroke="#437b80" stroke-width="1.5"'):'';
  const garage=site.garage&&!settings.removeGarage?`<polygon points="${poly(site.garage.footprint)}" fill="#babfb3" stroke="#7e8f7a"/>`:'';
  const labels=detail?`${label('TERRACE',t.x+t.width/2,t.y+t.depth/2,10)}${p?label('POOL',p.x+p.width/2,p.y+p.length/2,10):''}${label(profile.streetLabel,(plot.minX+plot.maxX)/2,plot.minY-1,10)}${label(`RIGHT · ${profile.sideLabels.right.toUpperCase()}`,plot.minX+2.6,sideY,9)}${label(`LEFT · ${profile.sideLabels.left.toUpperCase()}`,plot.maxX-2.6,sideY,9)}`:'';
  container.innerHTML=`<div class="sun-map-toolbar"><div class="map-scope" role="group" aria-label="Shade map extent"><button data-sun-scope="garden" aria-pressed="${detail}">Garden</button><button data-sun-scope="context" aria-pressed="${!detail}">Neighbourhood</button></div><span>${escape(formatSolarTime(sun.resolvedMinutes))} · ${sun.elevation.toFixed(1)}°</span></div><svg class="sun-map-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escape(`${shade.status} map for ${profile.label}, ${sun.date} at ${formatSolarTime(sun.resolvedMinutes)}. Gold cells receive direct sun; green cells are shaded.`)}"><defs><clipPath id="sun-plot-clip"><polygon points="${poly(site.boundary)}"/></clipPath></defs><rect width="${W}" height="${H}" fill="#f2f3eb"/>${context}<polygon points="${poly(site.boundary)}" fill="#e2e7d8" stroke="#78917a" stroke-width="1.6"/>${rect(t.x,t.y,t.width,t.depth,'fill="#e9e1d1"')}${poolFill}<g clip-path="url(#sun-plot-clip)">${cellMarkup}</g><polygon points="${poly(site.house.footprint)}" fill="#babfb3" stroke="#7e8f7a" stroke-width="1.3"/>${garage}${rect(t.x,t.y,t.width,t.depth,'fill="none" stroke="#a79a7f" stroke-width="1.3"')}${poolOutline}${hedges}<g pointer-events="none">${trees}</g>${canopy}${detail?jacuzzi:''}${label('HOUSE',houseC[0],houseC[1])}${labels}${compass}<g transform="translate(20 ${H-20})"><path d="M0 -4V0H${5*scale}V-4" fill="none" stroke="#5d735c" stroke-width="1.5"/><text x="${2.5*scale}" y="13" font-size="10" text-anchor="middle" fill="#5d735c">5 m</text></g></svg><div class="sun-map-legend"><span><i style="background:${colors.sun}"></i>Direct sun</span><span><i style="background:${colors.shade}"></i>Modeled shade</span>${shade.status==='night'?`<span><i style="background:${colors.night}"></i>Night</span>`:''}<span>Left / right: from house toward rear ↓</span>${settings.screeningTrees?.length?'<span>Tree crowns outlined · winter follows foliage mode</span>':''}<span class="sun-map-detail" id="sun-map-detail">${shade.status==='daylight'?'Tap a coloured cell to identify its blocker.':shade.status==='night'?'Sun below the horizon.':'Enable real sunlight to see shade.'}</span></div>`;
  container.querySelectorAll('[data-sun-scope]').forEach(button=>button.addEventListener('click',()=>{container.dataset.sunScope=button.dataset.sunScope;renderSunMap(container,data,settings,sun,shade);}));
  container.querySelector('svg').addEventListener('click',event=>{
    const target=event.target.closest('[data-sun-cell]');if(!target)return;
    const cell=shade.cells[Number(target.dataset.sunCell)];
    $('sun-map-detail').textContent=`${cell.zone[0].toUpperCase()+cell.zone.slice(1)} · ${cell.state==='sun'?'Direct sunlight':cell.state==='shade'?`Blocked by ${cell.blockedLabel||cell.blockedBy||'modeled geometry'}`:cell.state==='night'?'Sun below horizon':'Simulation off'}`;
  });
}
