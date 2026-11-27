import { DESIGN_STYLES, getDesignStyle } from './design-styles.js?v=1.37.0';
import { getInteriorPlan, INTERIOR_CHANGES } from './interior-plan.js?v=1.37.0';
import { drawInteriorPlan, correspondingRoom } from './interior-plan-view.js?v=1.37.0';
import {getHouseFloorPlan,houseModelKey} from './house-model.js?v=1.37.0';
import {getInteriorStyleRecipe} from './interior-style-recipes.js?v=1.37.0';

const FLOORS = {ground:'Ground floor', first:'First floor', basement:'Basement', attic:'Attic'};
const VIEWS = {dollhouse:'Dollhouse', plan:'Floor plan', room:'Eye level'};
const icons = {
  back:'<path d="m10 5-5 5 5 5M5 10h12"/>',
  dollhouse:'<path d="m10 2 7.5 4.2v8L10 18.5l-7.5-4.3v-8L10 2Z M2.5 6.2 10 10.5l7.5-4.3 M10 10.5v8"/>',
  plan:'<path d="M2.7 3h14.6v14H2.7z M9.8 3v5.4m0 2.9V17m0-7.4h3m2.2 0h2.2"/>',
  room:'<path d="M1.5 10S4.8 4.7 10 4.7s8.5 5.3 8.5 5.3-3.3 5.3-8.5 5.3S1.5 10 1.5 10Z"/><circle cx="10" cy="10" r="2.3"/>',
  settings:'<path d="M3 6h5m4 0h5M3 14h9m4 0h1"/><circle cx="10" cy="6" r="2"/><circle cx="14" cy="14" r="2"/>',
  reset:'<path d="M3 8a7 7 0 1 1 .7 6 M3 3v5h5"/>',
  notes:'<path d="M4 2.5h8l4 4V17.5H4z M12 2.5v4h4 M7 10h6m-6 3h5"/>',
  enter:'<path d="M3 10h13m-5-5 5 5-5 5"/>',
  close:'<path d="m5 5 10 10M15 5 5 15"/>',
  layers:'<path d="m10 2.8 7 4-7 4-7-4 7-4Zm-7 7.3 7 4 7-4m-14 3.5 7 4 7-4"/>',
};
const icon = name => `<svg aria-hidden="true" focusable="false" viewBox="0 0 20 20">${icons[name]}</svg>`;
const options = entries => Object.entries(entries).map(([id,label]) => `<option value="${id}">${label}</option>`).join('');
const area = (n, digits = 1) => Number.isFinite(n) ? `${n.toFixed(digits)} m²` : '—';
const floorNote = {ground:'Living spaces & garden access', first:'Bedrooms & private spaces', basement:'Cellars & street access', attic:'Roof volume'};
const roomNumber = i => String(i+1).padStart(2,'0');

function setOptions(select, items) {
  select.replaceChildren(...items.map(([id,label]) => new Option(label,id)));
}
function setList(host, entries) {
  host.replaceChildren(...entries.map(entry => {const li = document.createElement('li'); li.textContent = entry; return li;}));
}
function numberCell(text, tag = 'td') {
  const cell = document.createElement(tag); cell.textContent = text; return cell;
}

export function createInteriorWorkspace(container, {settings:initial = {}, onChange, onClose, onStatus,onWalk,getData,getExteriorContext,getContextKey} = {}) {
  container.classList.add('iw-workspace');
  container.setAttribute('aria-label','Sternicza 11 interior studio');
  if(!container.classList.contains('is-model-fullscreen'))container.setAttribute('role','region');
  container.tabIndex = -1;
  container.hidden = true;
  container.innerHTML = `
    <header class="iw-header">
      <div class="iw-identity"><button type="button" data-iw="close" class="iw-back">${icon('back')}<span>Garden</span></button><div><span class="iw-caption">Sternicza 11</span><h2 tabindex="-1" data-iw="title">Interior studio</h2></div></div>
      <div class="iw-header-actions"><div class="iw-layout" role="group" aria-label="Drawing layout"><button type="button" data-layout="existing">Original drawings</button><button type="button" data-layout="renovation">Your renovation</button></div>
      <button type="button" data-iw="settings" class="iw-tool iw-mobile-button" aria-controls="iw-inspector" aria-expanded="false" title="Materials, room schedule and drawing notes">${icon('settings')}<span>Settings</span></button>
      <button type="button" data-iw="fullscreen" class="iw-tool iw-fullscreen model-fullscreen-button" aria-pressed="false" aria-label="Enter fullscreen" title="Make this model fullscreen"><svg aria-hidden="true" focusable="false" viewBox="0 0 20 20"><path class="fullscreen-expand-icon" d="M7 3H3v4m10-4h4v4M3 13v4h4m10-4v4h-4"/><path class="fullscreen-collapse-icon" d="M3 7h4V3m6 0v4h4M7 17v-4H3m14 0h-4v4"/></svg><span data-fullscreen-label>Fullscreen</span></button></div>
    </header>
    <div class="iw-body">
      <aside id="iw-inspector" data-iw="inspector" class="iw-inspector" aria-label="Interior settings and room schedule">
        <div class="iw-mobile-heading"><h3>Interior settings</h3><button data-iw="hide-settings" type="button" class="iw-icon-button" aria-label="Close interior settings">${icon('close')}</button></div>
        <section class="iw-inspector-block"><div class="iw-field-heading"><label for="iw-style">Whole-house style</label><div class="iw-swatches" data-iw="swatches" aria-hidden="true"></div></div>
          <select id="iw-style" data-iw="style"></select><p class="iw-field-help" data-iw="finish-note"></p>
          <div class="iw-switches"><label class="iw-switch"><span>Furniture &amp; fittings</span><input type="checkbox" role="switch" data-iw="furniture"></label>
          <label class="iw-switch" data-iw="changes-wrap"><span>Highlight wall changes</span><input type="checkbox" role="switch" data-iw="changes"></label></div>
        </section>
        <section class="iw-inspector-block"><div class="iw-section-heading"><h3>Room schedule</h3><span data-iw="count"></span></div>
          <table class="iw-schedule"><thead><tr><th scope="col">Room</th><th scope="col"><abbr title="Area printed on the original drawing">Drawing</abbr></th><th scope="col"><abbr title="Approximate area of the reconstructed room polygon">Model</abbr></th></tr></thead><tbody data-iw="schedule"></tbody></table>
          <p class="iw-field-help">Model areas are approximate. Drawing areas in m² appear where an original room matches.</p>
        </section>
        <section class="iw-inspector-block iw-notes"><details data-iw="notes"><summary>${icon('notes')}<span>Drawing notes</span></summary>
          <div class="iw-note-body"><h4>Original drawings</h4><p>The main block measures 10.77 × 9.00 m, with a projecting bay. The cellar is marked 1.70 m high. The ground and first floors are marked 2.75 m and 2.70 m.</p>
          <p>The archived sheets predate later alterations. Room outlines and door swings are reconstructed. The garage elevations depict a separate outbuilding.</p>
          <h4 data-iw="changes-title">Marked renovation</h4><ul data-iw="change-list"></ul>
          <h4 data-iw="issue-title">Items to verify</h4><ul data-iw="issue-list"></ul>
          <h4 data-iw="source-title">Drawing references</h4><ul data-iw="source-list"></ul>
          <h4>Budget scope</h4><p>Interior furniture, finishes, partition changes and structural work need separate quotes. The garden estimate excludes these items.</p></div>
        </details></section>
        <section class="iw-inspector-block iw-garden-link" data-iw="exterior-wrap"><h3>One house, inside &amp; outside</h3><p class="iw-field-help">The windows, furniture, terrace and balcony share the garden model. Changes to deck size or floor levels appear in both views.</p><button type="button" data-iw="apply-exterior" class="iw-outlined">Restore marked 4 m decks ${icon('enter')}</button></section>
        <section class="iw-inspector-block" data-iw="garage-wrap"><h3>Two-car garage</h3><label class="iw-switch"><span>Keep the two-car proposal</span><input type="checkbox" role="switch" data-iw="garage"></label><p class="iw-field-help">Shared with the garden and retained when you switch house styles or compare the original house. Turn it off to view the archived cellar. Existing stair and flue conflicts remain visible.</p></section>
      </aside>
      <section class="iw-stage" aria-label="Interior viewer">
        <div class="iw-toolbar"><div class="iw-floor-field"><label for="iw-floor">Floor</label><div class="iw-floor-row">${icon('layers')}<select id="iw-floor" data-iw="floor">${options(FLOORS)}</select></div></div>
          <div class="iw-views" role="group" aria-label="Interior view">${Object.entries(VIEWS).map(([v,label]) => `<button type="button" data-view="${v}">${icon(v)}<span>${label}</span></button>`).join('')}</div></div>
        <div class="iw-drawing" data-iw="drawing"><div class="iw-canvas" data-iw="canvas" hidden></div><div class="iw-plan" data-iw="plan"></div>
          <div class="iw-stage-meta" data-iw="level"></div><button data-iw="conflict" class="iw-conflict-readout" hidden type="button"></button><button class="iw-home iw-icon-button" type="button" data-iw="home" title="Reset camera" aria-label="Reset interior camera">${icon('reset')}</button>
          <div class="iw-plan-tools" data-iw="plan-tools" role="group" aria-label="Floor plan zoom"><button type="button" data-iw="zoom-out" aria-label="Zoom out">−</button><button type="button" data-iw="zoom-fit" aria-label="Fit floor plan">Fit</button><button type="button" data-iw="zoom-in" aria-label="Zoom in">+</button></div>
          <div class="iw-legend" data-iw="legend" aria-label="Wall changes" hidden><span>Retained</span><span>New</span><span>Removed</span></div>
          <div class="iw-status" role="status" data-iw="status" hidden><span data-iw="status-text"></span><button type="button" data-iw="retry" hidden>Retry 3D</button></div>
        </div>
        <div class="iw-room-bar"><div class="iw-room-field"><label for="iw-room">Selected room</label><select id="iw-room" data-iw="room"></select></div><div class="iw-room-area" data-iw="areas"></div>
          <button class="iw-enter" type="button" data-iw="enter">Enter room ${icon('enter')}</button></div>
        <footer class="iw-stage-foot"><span data-iw="instructions"></span><button type="button" data-iw="show-notes">Drawing notes ${icon('notes')}</button></footer>
      </section>
    </div>`;
  const q = key => container.querySelector(`[data-iw="${key}"]`);
  const styleOptions = DESIGN_STYLES.map(s => [s.id,s.id === 'current' ? 'Current house · no renovation' : s.label]);
  setOptions(q('style'),styleOptions);
  const abort = new AbortController(), events = {signal:abort.signal};
  let state = initial, visible = false, disposed = false, inspectorOpen = false;
  let plan, planKey = '', schedulePlan, drawnPlan = '', lastSceneKey = '', renderedView = 'plan';
  let room, style, scene, sceneLoad, sceneError = '', generation = 0;
  let returnFocus, drawnRevision = 0, walkHandoffPending=false;
  let planBounds, centre, zoom = 1, pan, suppressClick = false;
  function positionPlan() {
    if (!planBounds) return;
    const [x,z,width,depth] = planBounds, w = width/zoom, d = depth/zoom;
    if (!centre) centre = [x+width/2,z+depth/2];
    centre[0] = Math.min(x+width-w/2, Math.max(x+w/2,centre[0]));
    centre[1] = Math.min(z+depth-d/2, Math.max(z+d/2,centre[1]));
    q('plan').querySelector('svg')?.setAttribute('viewBox',[centre[0]-w/2,centre[1]-d/2,w,d].join(' '));
    q('drawing').dataset.zoomed = String(zoom > 1);
    q('zoom-out').disabled = zoom <= 1; q('zoom-in').disabled = zoom >= 3;
  }
  const listeners = (node,name,fn) => node.addEventListener(name,fn,events);
  const patch = fields => onChange?.(fields);
  const mobile = () => window.matchMedia('(max-width: 800px)').matches;

  function showInspector(open, focusControl = true) {
    inspectorOpen = open;
    container.classList.toggle('iw-inspector-open',open);
    q('settings').setAttribute('aria-expanded',String(open));
    q('inspector').toggleAttribute('inert',mobile() && !open);
    if (focusControl && mobile()) (open ? q('hide-settings') : q('settings')).focus();
  }

  function setStatus(text, retry = false) {
    q('status').hidden = !text;
    q('status-text').textContent = text;
    q('retry').hidden = !retry;
  }

  function sceneFailure(message) {
    sceneError = String(message || '3D renderer unavailable');
    releaseScene();
    if (visible) {
      renderStage();
      onStatus?.('The 3D view is unavailable. The interactive floor plan is open.');
    }
  }

  function releaseScene() {
    generation++;
    const previous = scene;
    scene = null; sceneLoad = null; lastSceneKey = '';
    previous?.dispose();
    q('canvas').replaceChildren();
  }

  function loadScene() {
    if (scene || sceneLoad || sceneError) return;
    const token = generation;
    sceneLoad = import('./scene-interior.js?v=1.37.0').then(({createInteriorScene}) => {
      if (token !== generation || !visible || state.interiorView === 'plan') return;
      const viewer = createInteriorScene(q('canvas'),{
        getExteriorContext,
        onRoomSelect:id => patch({interiorRoomId:id}),
        onError:message => queueMicrotask(() => {if (token === generation) sceneFailure(message);}),
      });
      if (!viewer || viewer.getDiagnostics?.().available === false) {viewer?.dispose(); throw new Error('3D renderer unavailable');}
      scene = viewer;
      renderStage();
    }).catch(error => {if (token === generation && visible) sceneFailure(error.message);})
      .finally(() => {if (token === generation) sceneLoad = null;});
  }

  function drawPlan() {
    const key = [planKey,room?.id,style.id,state.interiorFurniture !== false,state.interiorChanges === true].join('|');
    if (key !== drawnPlan) {
      const focusRoom = document.activeElement?.closest?.('[data-iw-room]')?.dataset.iwRoom;
      planBounds = drawInteriorPlan(q('plan'),plan,{roomId:room?.id,showFurniture:state.interiorFurniture !== false,showChanges:state.interiorChanges === true && plan.layout === 'renovation',palette:style.palette});
      positionPlan(); drawnPlan = key; drawnRevision++;
      if (focusRoom) [...q('plan').querySelectorAll('[data-iw-room]')].find(el => el.dataset.iwRoom === focusRoom)?.focus({preventScroll:true});
    }
  }

  function renderStage() {
    if (!visible || !plan) return;
    const view = state.interiorView || 'dollhouse';
    if(view==='room'&&onWalk){
      if(!walkHandoffPending){walkHandoffPending=true;queueMicrotask(()=>{walkHandoffPending=false;if(visible&&!disposed)onWalk({floor:plan.floor,roomId:room?.id});});}
      return;
    }
    const actual3d = view !== 'plan' && Boolean(scene) && !sceneError;
    renderedView = actual3d ? view : 'plan';
    q('canvas').hidden = view === 'plan' || Boolean(sceneError);
    q('plan').hidden = actual3d;
    q('home').hidden = !actual3d;
    q('plan-tools').hidden = actual3d;
    q('drawing').dataset.renderedView = renderedView;
    Object.assign(container.dataset,{floor:plan.floor,layout:plan.layout,style:style.id,room:room?.id || '',view:renderedView});
    q('legend').hidden = !(state.interiorChanges && plan.layout === 'renovation');
    q('instructions').textContent = renderedView === 'plan' ? 'Select a numbered room to inspect its area.' : renderedView === 'room' ? 'Drag to look around. WASD or the arrows walk through the house and garden; the stairs connect every level.' : 'Drag to orbit. Scroll or pinch to zoom. Select a room to inspect it.';
    if (!actual3d) drawPlan();
    if (view === 'plan') {
      scene?.setVisible(false); lastSceneKey = '';
      setStatus(''); return;
    }
    if (sceneError) {setStatus('3D is unavailable on this device. Showing the floor plan.',true); return;}
    if (!scene) {setStatus('Opening the 3D view…'); loadScene(); return;}
    const contextKey=getContextKey?.()||'';
    const key = [planKey,style.id,view,room?.id,state.interiorFurniture !== false,!!state.interiorChanges,contextKey,state.renderQuality].join('|');
    try {
      if (lastSceneKey !== key) {
        scene.setVisible(true);
        scene.update(plan,{styleId:style.id,view,roomId:room?.id,showFurniture:state.interiorFurniture !== false,showChanges:!!state.interiorChanges && plan.layout === 'renovation',showCeiling:view === 'room',contextKey,quality:state.renderQuality});
        scene.resize(); lastSceneKey = key;
      }
      setStatus('');
    } catch (error) {sceneFailure(error.message);}
  }

  function syncPlan() {
    const floor = state.interiorFloor || 'ground';
    const key = floor+'|'+houseModelKey(state);
    if (key !== planKey) {
      plan = getHouseFloorPlan({floor,settings:state,data:getData?.()});
      planKey = key; centre = null; zoom = 1;
    }
    room = plan.rooms.find(r => r.id === state.interiorRoomId) || plan.rooms[0];
    style = getDesignStyle(state.designStyle);
  }

  function syncSchedule() {
    if (schedulePlan !== plan) {
      schedulePlan = plan;
      setOptions(q('room'),plan.rooms.map((r,i) => [r.id,`${roomNumber(i)}  ${r.label}`]));
      q('schedule').replaceChildren(...plan.rooms.map((r,i) => {
        const tr = document.createElement('tr'), name = document.createElement('th'), btn = document.createElement('button');
        name.scope = 'row'; btn.type = 'button'; btn.dataset.scheduleRoom = r.id;
        const num = document.createElement('span'); num.textContent = roomNumber(i); num.setAttribute('aria-hidden','true');
        btn.append(num,document.createTextNode(r.label)); name.append(btn);
        tr.append(name,numberCell(Number.isFinite(r.sourceArea) ? r.sourceArea.toFixed(2) : '—'),numberCell(r.area.toFixed(1)));
        return tr;
      }));
      q('count').textContent = `${plan.rooms.length} spaces`;
      const changes = plan.layout === 'renovation' ? INTERIOR_CHANGES[plan.floor] || [] : [];
      setList(q('change-list'),changes); q('changes-title').hidden = !changes.length;
      setList(q('issue-list'),plan.issues || []); q('issue-title').hidden = !plan.issues?.length;
      setList(q('source-list'),plan.sources || []); q('source-title').hidden = !plan.sources?.length;
    }
    q('room').value = room?.id || '';
    q('room').disabled = !room;
    for (const btn of q('schedule').querySelectorAll('button')) {
      const selected = btn.dataset.scheduleRoom === room?.id;
      btn.setAttribute('aria-pressed',String(selected)); btn.closest('tr').classList.toggle('is-selected',selected);
    }
    q('areas').replaceChildren();
    if (room) {
      for (const [label,val] of [['Model ≈',area(room.area)],['Drawing',area(room.sourceArea,2)]]) {
        const item = document.createElement('div'), title = document.createElement('span'), value = document.createElement('strong');
        title.textContent = label; value.textContent = val; item.append(title,value); q('areas').append(item);
      }
    }
  }

  function update(next) {
    state = next || state;
    if (!visible || disposed) return;
    syncPlan(); syncSchedule();
    const view = state.interiorView || 'dollhouse', isRenovation = plan.layout === 'renovation';
    const houseLayout=(state.designStyle||'current')==='current'?'existing':'renovation';
    for (const btn of container.querySelectorAll('[data-layout]')) btn.setAttribute('aria-pressed',String(btn.dataset.layout === houseLayout));
    for (const btn of container.querySelectorAll('[data-view]')) btn.setAttribute('aria-pressed',String(btn.dataset.view === view));
    q('floor').value = plan.floor;
    q('style').value = state.designStyle || 'current';
    q('furniture').checked = state.interiorFurniture !== false;
    q('changes').checked = !!state.interiorChanges;
    q('changes-wrap').hidden = !isRenovation;
    const recipe=getInteriorStyleRecipe(style.id);
    q('finish-note').textContent = style.id==='current'
      ?`Original house layout and finishes.${state.basementGarageEnabled?' The two-car garage proposal remains selected.':''} Select a style to renovate the house and garden together.`
      :recipe.features.join(' · ')+'. Applied inside and outside.';
    q('swatches').replaceChildren(...style.swatches.map(hex => {const dot = document.createElement('i'); dot.style.backgroundColor = hex; return dot;}));
    q('exterior-wrap').hidden = !isRenovation || !['ground','first'].includes(plan.floor);
    const applied = state.terraceCoverType === 'balcony' && state.canopyEnabled && state.planExteriorApplied && state.firstFloorRise === 3.05 && state.terraceDepth === 4 && state.terraceWidth === 10.77 && state.canopyDepth === 4 && state.canopyWidth === 10.77;
    q('apply-exterior').disabled = applied;
    q('apply-exterior').innerHTML = applied ? 'Marked decks shared with garden' : `Restore marked 4 m decks ${icon('enter')}`;
    q('garage-wrap').hidden=false;q('garage').checked=!!state.basementGarageEnabled;
    const heightLabel = plan.floor === 'attic' ? 'to ridge' : 'clear height';
    q('drawing').dataset.conflicts = String(plan.conflicts.length);
    q('level').textContent = Number.isFinite(plan.clearHeight) ? `${plan.clearHeight.toFixed(2)} m ${heightLabel}` : floorNote[plan.floor];
    q('conflict').hidden = !plan.conflicts.length;
    if (plan.conflicts.length) q('conflict').textContent = `${plan.conflicts.length} retained obstructions · Details`;
    q('enter').hidden = view === 'room' || !room;
    renderStage();
  }

  listeners(q('plan'),'pointerdown',event => {
    suppressClick = false;
    if (zoom <= 1 || event.button !== 0 || !event.isPrimary) return;
    const transform = q('plan').querySelector('svg')?.getScreenCTM();
    if (transform) pan = {id:event.pointerId,x:event.clientX,y:event.clientY,centre:[...centre],scale:transform.a};
  });
  listeners(q('plan'),'pointermove',event => {
    if (pan?.id !== event.pointerId) return;
    const dx = event.clientX-pan.x, dy = event.clientY-pan.y;
    if (!suppressClick && Math.hypot(dx,dy) < 5) return;
    suppressClick = true;
    q('plan').setPointerCapture(event.pointerId);
    centre = [pan.centre[0]-dx/pan.scale,pan.centre[1]-dy/pan.scale];
    positionPlan();
  });
  for (const name of ['pointerup','pointercancel','pointerleave']) listeners(q('plan'),name,event => {
    if (pan?.id === event.pointerId) pan = null;
  });
  listeners(container,'click',event => {
    if (suppressClick && q('plan').contains(event.target)) {suppressClick = false; return;}
    const target = event.target.closest('button,[data-iw-room]');
    if (!target || !container.contains(target)) return;
    if (target.dataset.layout) {
      const layout = target.dataset.layout;
      const houseLayout=(state.designStyle||'current')==='current'?'existing':'renovation';
      if (layout === houseLayout) return;
      const next = getHouseFloorPlan({floor:plan.floor,settings:{...state,designStyle:layout==='existing'?'current':state.designStyle==='current'?'hidden-bali':state.designStyle},data:getData?.()});
      patch({interiorLayout:layout,interiorRoomId:correspondingRoom(room,next.rooms)?.id || ''});
      return;
    }
    if (target.dataset.view) {if(target.dataset.view==='room'&&onWalk)onWalk({floor:plan.floor,roomId:room?.id});else patch({interiorView:target.dataset.view}); return;}
    const selected = target.dataset.iwRoom || target.dataset.scheduleRoom;
    if (selected) {patch({interiorRoomId:selected}); if (target.dataset.scheduleRoom && mobile()) showInspector(false); return;}
    switch (target.dataset.iw) {
      case 'close': onClose?.(); break;
      case 'settings': showInspector(!inspectorOpen); break;
      case 'hide-settings': showInspector(false); break;
      case 'enter': if(onWalk)onWalk({floor:plan.floor,roomId:room?.id});else patch({interiorView:'room',interiorRoomId:room?.id || ''}); break;
      case 'home': scene?.home(); break;
      case 'zoom-in': zoom = Math.min(3,zoom+.5); positionPlan(); break;
      case 'zoom-out': zoom = Math.max(1,zoom-.5); positionPlan(); break;
      case 'zoom-fit': centre = null; zoom = 1; positionPlan(); break;
      case 'retry': sceneError = ''; renderStage(); break;
      case 'conflict':
      case 'show-notes':
        showInspector(true,false); q('notes').open = true;
        q('notes').querySelector('summary').focus({preventScroll:true}); q('notes').scrollIntoView({block:'nearest'}); break;
      case 'apply-exterior':
        patch({planExteriorApplied:true,firstFloorRise:3.05,terraceCoverType:'balcony',canopyEnabled:true,canopyDepth:4,canopyWidth:10.77,terraceDepth:4,terraceWidth:10.77});
        onStatus?.('Both views now use the marked 4 m terrace and balcony.'); break;
    }
  });
  listeners(container,'change', event => {
    const {iw} = event.target.dataset, {value,checked} = event.target;
    if (iw === 'floor') patch({interiorFloor:value,interiorRoomId:''});
    if (iw === 'style') patch({designStyle:value});
    if (iw === 'garage') patch({basementGarageEnabled:checked});
    if (iw === 'room') patch({interiorRoomId:value});
    if (iw === 'furniture') patch({interiorFurniture:checked});
    if (iw === 'changes') patch({interiorChanges:checked});
  });
  listeners(container,'keydown',event => {
    const target = event.target.closest('[data-iw-room]');
    if (target && (event.key === 'Enter' || event.key === ' ')) {event.preventDefault(); patch({interiorRoomId:target.dataset.iwRoom});}
    if (event.key === 'Escape' && inspectorOpen && mobile()) {showInspector(false); event.stopPropagation();}
  });
  const mq = window.matchMedia('(max-width: 800px)');
  listeners(mq,'change',() => {if (visible) {showInspector(false,false); scene?.resize();}});
  function setVisible(value) {
    if (disposed || visible === !!value) return;
    visible = !!value;
    if (visible) {
      returnFocus = document.activeElement;
      container.hidden = false; showInspector(false,false); update(state);
      q('title').focus({preventScroll:true});
    } else {
      const restore = container.contains(document.activeElement);
      container.hidden = true; showInspector(false,false); releaseScene(); sceneError = '';
      if (restore && returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
    }
  }
  function dispose() {
    if (disposed) return;
    setVisible(false); disposed = true; abort.abort(); delete container.getInteriorDiagnostics; container.replaceChildren();
  }
  const getDiagnostics = () => ({visible,renderedView,sceneError,drawnRevision,floor:plan?.floor,layout:plan?.layout,roomId:room?.id,styleId:style?.id,scene:scene?.getDiagnostics() || null});
  container.getInteriorDiagnostics = getDiagnostics;
  return {update,setVisible,dispose,getDiagnostics,resize(){scene?.resize();positionPlan();}};
}
