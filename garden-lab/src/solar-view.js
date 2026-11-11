// Presentation and interactions only; astronomical and obstruction calculations
// live in solar.js. The selected clock is always local Europe/Warsaw time.
const $ = id => document.getElementById(id);
const clock = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(Math.round(minutes % 60)).padStart(2, '0')}`;
const dateLabel = value => new Intl.DateTimeFormat('en-GB', {day:'numeric', month:'long', year:'numeric', timeZone:'UTC'}).format(new Date(`${value}T12:00:00Z`));
const statusLabels = {sun:'Direct sun', shade:'Shaded', 'roof-envelope':'Possible roof shade', night:'Sun below horizon', invalid:'Choose a valid time'};

export function createSolarView({onChange}) {
  let playing = false, timer, current = null, lastTimeline = null;
  $('sun-controls').innerHTML = `
    <div class="sun-control-top">
      <div class="sun-heading"><span aria-hidden="true">☀</span><strong>Sun & shade</strong></div>
      <label class="sun-date-label"><span class="sr-only">Simulation date</span><input id="solar-date" type="date" min="2000-01-01" max="2100-12-31" aria-label="Simulation date"></label>
      <label class="sun-clock-label"><span class="sr-only">Time in Gdańsk</span><input id="solar-clock" type="time" step="60" aria-label="Time in Gdańsk"></label>
      <span id="sun-zone" class="sun-zone">Warsaw time</span>
    </div>
    <div class="sun-scrubber"><button id="sun-play" type="button" aria-label="Play the day" aria-pressed="false" title="Play the day">▶</button><input id="solarTime" type="range" min="0" max="1439" step="1" aria-label="Time of day in Gdańsk"><output id="sun-time-output" for="solarTime">13:00</output></div>
    <div class="sun-ticks" aria-hidden="true"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>
    <div class="sun-control-bottom"><div class="season-buttons" role="group" aria-label="Compare seasons"><button type="button" data-sun-season="03-20">March</button><button type="button" data-sun-season="06-21">June</button><button type="button" data-sun-season="09-22">September</button><button type="button" data-sun-season="12-21">December</button></div><div class="sun-toggles"><label><input id="shadowsEnabled" type="checkbox">3D shadows</label><label><input id="showSunPath" type="checkbox">Sun path</label></div></div>`;
  $('sun-results').innerHTML = `
    <div class="sun-result-heading"><div><span class="eyebrow">DAYLIGHT AT YOUR GARDEN</span><h3 id="sun-result-title">A day in Gdańsk</h3></div><span id="sun-position" class="sun-position">Calculating…</span></div>
    <div class="sun-events"><span>Sunrise <strong id="sunrise">—</strong></span><span>Sunset <strong id="sunset">—</strong></span><span>Daylight <strong id="daylight-length">—</strong></span></div>
    <p id="sun-warning" class="sun-warning" role="status" hidden></p>
    <div id="sun-points" class="sun-points" aria-live="polite"></div>
    <details id="sun-day-details"><summary>Compare sun through the day <span aria-hidden="true">⌄</span></summary><div class="sun-timeline-scroll"><div id="sun-timeline" class="sun-timeline"></div></div><div class="sun-legend"><span><i class="sun-key direct"></i>Direct sun</span><span><i class="sun-key shade"></i>Shade</span><span><i class="sun-key uncertain"></i>Possible roof shade</span><span><i class="sun-key night"></i>Night</span></div><p class="field-note">Each cell is a 30-minute sample at the named point. Tap a cell to move the sun. A point does not represent the whole terrace, pool or garden.</p></details>
    <p id="sun-renderer-note" class="sun-warning" hidden>3D shadows need WebGL. The sun-position and surface-point calculations still work in this browser.</p>
    <p class="sun-method">Clear-sky geometry, not a weather forecast. Solid hedges and conservative roof heights are used for the point checks; detailed 3D shadows can differ near roof edges. Existing trees, foliage gaps and isolated unverified roof features are excluded. Sunrise and sunset use an unobstructed horizon.</p>`;

  function pause() { playing=false; clearInterval(timer); $('sun-play').textContent='▶'; $('sun-play').setAttribute('aria-pressed','false'); $('sun-play').setAttribute('aria-label','Play the day'); }
  function change(patch, stop=true) { if(stop) pause(); onChange(patch); }
  $('solar-date').addEventListener('change', e => { if(e.target.value && e.target.validity.valid) change({solarDate:e.target.value}); });
  $('solar-clock').addEventListener('change', e => { const m=/^(\d{2}):(\d{2})$/.exec(e.target.value); if(m && e.target.validity.valid) change({solarTime:Number(m[1])*60+Number(m[2])}); });
  $('solarTime').addEventListener('input', e => change({solarTime:Number(e.target.value)}));
  for(const key of ['shadowsEnabled','showSunPath']) $(key).addEventListener('change', e => change({[key]:e.target.checked}, false));
  document.querySelectorAll('[data-sun-season]').forEach(b => b.addEventListener('click', () => {if(current) change({solarDate:`${current.solarDate.slice(0,4)}-${b.dataset.sunSeason}`});}));
  $('sun-play').addEventListener('click', () => {
    if(playing) {pause(); return;}
    playing=true; $('sun-play').textContent='Ⅱ'; $('sun-play').setAttribute('aria-pressed','true'); $('sun-play').setAttribute('aria-label','Pause the day');
    timer=setInterval(() => { if(current) change({solarTime:(current.solarTime+15)%1440},false); },450);
  });
  $('sun-timeline').addEventListener('click', e => {const button=e.target.closest('[data-sun-minute]'); if(button) change({solarTime:Number(button.dataset.sunMinute)});});
  document.addEventListener('visibilitychange', () => {if(document.hidden) pause();});

  function eventLabel(event) {
    if(event == null) return '—';
    if(typeof event === 'number') return clock(Math.round(event));
    if(typeof event === 'string') return event;
    return event.timeLabel || event.label || (Number.isFinite(event.minutes) ? clock(Math.round(event.minutes)) : '—');
  }
  function describe(p={}) {
    const status=p.status || (p.sunlit ? 'sun' : 'shade');
    const label=statusLabels[status] || 'Unknown';
    return {status,label,detail:p.blockedBy ? `${status==='roof-envelope'?'Roof envelope: ':'Blocked by '}${p.blockedBy}` : status==='sun'?'Unobstructed at this point':status==='night'?'Sun below the horizon':''};
  }
  function renderTimeline(timeline) {
    if(timeline===lastTimeline) return;
    lastTimeline=timeline;
    const host=$('sun-timeline'); host.replaceChildren();
    if(!timeline?.rows?.length) return;
    const rows=timeline.rows, points=rows.find(r=>r.points?.length)?.points || [];
    host.style.setProperty('--sun-cells', rows.length);
    const header=document.createElement('div');header.className='sun-time-row';
    const label=document.createElement('span');label.textContent='Local time';header.append(label);
    rows.forEach((row,i)=>{const cell=document.createElement('span');cell.textContent=i%4===0?clock(row.minutes):'';header.append(cell);});host.append(header);
    for(const point of points) {
      const line=document.createElement('div');line.className='sun-time-row';
      const name=document.createElement('span');name.className='sun-row-label';name.textContent=point.label;line.append(name);
      for(const row of rows) {
        const p=row.points.find(v=>v.id===point.id), d=describe(p);
        const button=document.createElement('button');button.type='button';button.className=`sun-cell ${d.status}`;button.dataset.sunMinute=row.minutes;
        const text=`${point.label}, ${clock(row.minutes)}: ${d.label}${d.detail?`, ${d.detail}`:''}`;button.title=text;button.setAttribute('aria-label',text);line.append(button);
      }
      host.append(line);
    }
  }
  function render(settings, solar, sunlight, timeline) {
    current=settings;
    $('solar-date').value=settings.solarDate;
    $('solar-clock').value=clock(settings.solarTime);
    $('solarTime').value=settings.solarTime;
    $('solarTime').setAttribute('aria-valuetext',`${clock(settings.solarTime)} in Gdańsk`);
    $('solarTime').style.setProperty('--progress',`${settings.solarTime/1439*100}%`);
    $('sun-time-output').textContent=clock(settings.solarTime);
    for(const key of ['shadowsEnabled','showSunPath']) $(key).checked=settings[key];
    document.querySelectorAll('[data-sun-season]').forEach(b=>b.setAttribute('aria-pressed',String(settings.solarDate.endsWith(b.dataset.sunSeason))));
    $('sun-zone').textContent=solar?.offsetMinutes===120?'Gdańsk · CEST':'Gdańsk · CET';
    $('sun-result-title').textContent=`${dateLabel(settings.solarDate)} · ${solar?.timeLabel||`${clock(settings.solarTime)} Warsaw`}`;
    $('sun-position').textContent=solar?.valid?`${solar.daylight?'Sun':'Below horizon'} · ${solar.elevationDeg.toFixed(1)}° high · ${solar.azimuthDeg.toFixed(0)}° azimuth`:'Local clock time unavailable';
    $('sunrise').textContent=eventLabel(solar?.sunrise); $('sunset').textContent=eventLabel(solar?.sunset);
    const minutes=Math.round((solar?.daylightHours||0)*60);$('daylight-length').textContent=solar?.valid?`${Math.floor(minutes/60)} h ${String(minutes%60).padStart(2,'0')} min`:'—';
    $('sun-warning').hidden=!solar?.warning; $('sun-warning').textContent=solar?.warning||'';
    const host=$('sun-points');host.replaceChildren();
    for(const point of sunlight?.points||[]) {const d=describe(point),card=document.createElement('div');card.className=`sun-point ${d.status}`;const name=document.createElement('span');name.textContent=point.label;const value=document.createElement('strong');value.textContent=d.label;const note=document.createElement('small');note.textContent=d.detail;card.append(name,value,note);host.append(card);}
    renderTimeline(timeline);
    document.querySelectorAll('[data-sun-minute]').forEach(b=>{const selected=Math.abs(Number(b.dataset.sunMinute)-settings.solarTime)<(timeline?.stepMinutes||30)/2;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
    $('sun-results').dataset.solarDate=settings.solarDate; $('sun-results').dataset.solarTime=settings.solarTime;
    $('sun-results').dataset.sunElevation=solar?.valid?String(solar.elevationDeg):'';
    $('sun-results').dataset.sunAzimuth=solar?.valid?String(solar.azimuthDeg):'';
    $('sun-results').dataset.sunStatuses=(sunlight?.points||[]).map(p=>`${p.id}:${p.status}`).join(',');
  }
  return {render,pause,setRenderer:type=>{$('sun-renderer-note').hidden=type==='webgl';}};
}
