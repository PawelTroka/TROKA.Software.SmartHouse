import {
  terrainAt,
  gardenGroundAt,
  terraceGroundReference,
  hedgeSegments,
  canopyBounds,
  jacuzziBounds,
} from './geometry.js?v=1.5.0';
import {gazeDirection} from './orientation.js?v=1.5.0';
import {localSunDirection} from './solar.js?v=1.5.0';
import {getSiteProfile} from './sites.js?v=1.5.0';
import {screeningTreeVolumes} from './screening-trees.js?v=1.5.0';
import {treePlanMarkup, treeSectionMarkup} from './tree-drawing.js?v=1.5.0';

const C = {
  paper: '#f5f3ec', ink: '#24382e', muted: '#6c766c', line: '#d6dbd0',
  land: '#e3e9da', hedge: '#4b7151', hedgeDark: '#31513a', stone: '#e5dac6',
  roof: '#797f78', water: '#6faeae', waterLight: '#b5d5cf', target: '#c8a89a',
  targetStroke: '#a7816f', context: '#deddd5', ray: '#b55d42', clear: '#3b785a',
  observer: '#e3a958', existing: '#91988b', soil: '#c0ae8c',
};
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
const number = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const fmt = (v, digits = 1) => Number.isFinite(v) ? v.toFixed(digits) : '—';
const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) &&
        point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function centroid(polygon) {
  const p = polygon.length > 2 && distance(polygon[0], polygon.at(-1)) < 1e-6 ? polygon.slice(0, -1) : polygon;
  return p.reduce((s, v) => [s[0] + v[0] / p.length, s[1] + v[1] / p.length], [0, 0]);
}

function footprintBounds(polygon) {
  return {
    minX: Math.min(...polygon.map(p => p[0])), maxX: Math.max(...polygon.map(p => p[0])),
    minY: Math.min(...polygon.map(p => p[1])), maxY: Math.max(...polygon.map(p => p[1])),
  };
}

function criticalRay(data, analysis) {
  const rays = analysis?.rays || [];
  const legacySite = !data.site.id || data.site.id === 'sternicza-11';
  const nearest = legacySite ? data.buildings.find(b => /PCK\s*3/i.test(b.label)) : null;
  const candidates = rays.filter(r => r.screen && (!nearest || r.blockId === nearest.id) && r.kind !== 'facade');
  if (candidates.length) {
    const meaningful = candidates.filter(r => r.blockedBy !== 'building');
    return (meaningful.length ? meaningful : candidates).reduce((best, r) =>
      !best || r.screen.requiredHeight > best.screen.requiredHeight ? r : best, null);
  }
  return analysis?.criticalRay || rays.filter(r => r.screen).reduce((best, r) =>
    !best || r.screen.requiredHeight > best.screen.requiredHeight ? r : best, null);
}

export function planLayout(scope, data, container) {
  const plot = getSiteProfile(data.site.id || 'sternicza-11', data).bounds;
  let bounds = {minX: plot.minX - 3.5, maxX: plot.maxX + 4.2, minY: plot.minY - 4.2, maxY: plot.maxY + 4.2};
  if (scope === 'context') {
    const points = [...data.site.boundary, ...data.buildings.filter(b => b.kind === 'target').flatMap(b => b.footprint)];
    bounds = {
      minX: Math.min(...points.map(p => p[0])) - 6,
      maxX: Math.max(...points.map(p => p[0])) + 6,
      minY: Math.min(...points.map(p => p[1])) - 8,
      maxY: Math.max(...points.map(p => p[1])) + 8,
    };
  }
  // Match the available panel instead of shrinking a thousand-pixel drawing.
  // Coordinates still share one metres-to-pixels factor in both directions.
  const W = Math.max(360, Math.min(960, container.clientWidth || 720));
  const H = Math.max(230, (container.clientHeight || 480) - (W < 500 ? 96 : 78));
  const padding = W < 500 ? 28 : 34;
  const scale = Math.min((W - padding * 2) / (bounds.maxX - bounds.minX), (H - padding * 2) / (bounds.maxY - bounds.minY));
  const left = (W - scale * (bounds.maxX - bounds.minX)) / 2;
  const top = (H - scale * (bounds.maxY - bounds.minY)) / 2;
  return {
    W, H, scale, bounds,
    X: x => left + (x - bounds.minX) * scale,
    Y: y => top + (y - bounds.minY) * scale,
    world: (x, y) => [bounds.minX + (x - left) / scale, bounds.minY + (y - top) / scale],
  };
}

/** Render an interactive, metrically scaled plan. Source coordinates remain unmodified. */
export function renderPlan(container, data, settings, observer, analysis, onPick, options = {}) {
  const scope = container.dataset.mapScope === 'context' ? 'context' : 'garden';
  const l = planLayout(scope, data, container), {X, Y, scale, W, H} = l;
  const treeVolumes = screeningTreeVolumes(settings, data);
  const trees = treePlanMarkup(treeVolumes, {X, Y, scale, selectedTreeId: options.selectedTreeId, interactive: true});
  const site = data.site;
  const profile = getSiteProfile(site.id || 'sternicza-11', data), plot = profile.bounds;
  const middleX = (plot.minX + plot.maxX) / 2;
  const frontage = number(site.frontage, plot.maxX - plot.minX);
  const depth = number(site.depth, plot.maxY - plot.minY);
  const house = footprintBounds(site.house.footprint);
  const setback = number(site.frontSetback, house.minY - plot.minY);
  const rearY = site.rearMidpoint[1];
  const terrace = {...site.terrace, depth: number(settings.terraceDepth, site.terrace.depth)};
  const pool = site.pool;
  const ray = criticalRay(data, analysis);
  const polys = points => points.map(p => `${X(p[0]).toFixed(2)},${Y(p[1]).toFixed(2)}`).join(' ');
  const rect = (x, y, w, h, attributes = '') => `<rect x="${X(x)}" y="${Y(y)}" width="${w * scale}" height="${h * scale}" ${attributes}/>`;
  const label = (text, x, y, opts = '') => `<text x="${X(x)}" y="${Y(y)}" text-anchor="middle" ${opts}>${esc(text)}</text>`;
  const mapped = data.buildings.filter(b => b.footprint?.length && b.kind !== 'house' && b.kind !== 'garage');
  const nearby = mapped.map(b => {
    if (b.id === site.house.id || b.id === site.garage?.id) return '';
    const c = centroid(b.footprint), isTarget = b.kind === 'target';
    return `<polygon points="${polys(b.footprint)}" fill="${isTarget ? C.target : C.context}" stroke="${isTarget ? C.targetStroke : '#c3c7be'}" stroke-width="1.2"/>` +
      (scope === 'context' && isTarget ? label(b.label.replace(' apartment block',' block').replace(' continuation',' cont.'), c[0], c[1], `font-size="${W < 500 ? 10 : 12}" fill="${C.ink}" font-weight="600"`) : '');
  }).join('');

  const hedges = hedgeSegments(settings, data).filter(h => h.height > 0 && (h.topA > h.baseA || h.topB > h.baseB)).map(h =>
    `<line x1="${X(h.a[0])}" y1="${Y(h.a[1])}" x2="${X(h.b[0])}" y2="${Y(h.b[1])}" stroke="${C.hedge}" stroke-width="${Math.max(scope === 'garden' ? 4 : 2, scale * .65)}" stroke-linecap="square"/>`
  ).join('');
  const detail = scope === 'garden';
  const compact = scale < 10;
  const {drop:terraceDrop} = terraceGroundReference(settings,data);
  const jacuzzi = jacuzziBounds(settings, data);
  const jacuzziX = jacuzzi?.x0, jacuzziY = jacuzzi?.y0;
  const canopy = settings.canopyEnabled ? canopyBounds(settings, data) : null;
  const yaw = number(settings.lookYaw);
  const coneRadius = detail ? 4.5 : 7;
  const coneHalf = 32;
  const cone = [
    [observer.x, observer.y],
    ...[yaw - coneHalf, yaw + coneHalf].map(angle => {
      const direction = gazeDirection(angle);
      return [observer.x + direction[0] * coneRadius, observer.y + direction[1] * coneRadius];
    }),
  ];
  const north = localSunDirection(0, 0, data), compassX = W - 34, compassY = 48;
  const compass = `<g aria-label="True north"><circle cx="${compassX}" cy="${compassY}" r="23" fill="#fffdf5" fill-opacity=".94" stroke="${C.line}"/><line x1="${compassX}" y1="${compassY}" x2="${compassX + north[0] * 18}" y2="${compassY + north[1] * 18}" stroke="${C.ink}" stroke-width="2"/><text x="${compassX + north[0] * 31}" y="${compassY + north[1] * 31 + 3}" text-anchor="middle" font-size="11" font-weight="700">N</text></g>`;
  const dimensions = detail ? `
    <line x1="${X(plot.minX)}" y1="${Y(plot.minY - 1.1)}" x2="${X(plot.minX + frontage)}" y2="${Y(plot.minY - 1.1)}" stroke="${C.muted}" marker-start="url(#plan-tick)" marker-end="url(#plan-tick)"/>
    <text x="${X(plot.minX + frontage / 2)}" y="${Y(plot.minY - 1.1) - 5}" text-anchor="middle" font-size="${compact ? 10 : 12}" fill="${C.muted}">${fmt(frontage, 2)} m ${compact ? '' : 'mapped '}frontage</text>
    <line x1="${X(plot.minX - 1.6)}" y1="${Y(plot.minY)}" x2="${X(plot.minX - 1.6)}" y2="${Y(plot.minY + depth)}" stroke="${C.muted}" marker-start="url(#plan-tick)" marker-end="url(#plan-tick)"/>
    <text transform="translate(${X(plot.minX - 1.6) - 7} ${Y(plot.minY + depth / 2)}) rotate(-90)" text-anchor="middle" font-size="${compact ? 10 : 12}" fill="${C.muted}">${fmt(depth, 2)} m mapped depth</text>
    <line x1="${X(plot.minX + 2.5)}" y1="${Y(plot.minY)}" x2="${X(plot.minX + 2.5)}" y2="${Y(plot.minY + setback)}" stroke="${C.muted}" stroke-dasharray="3 4"/>
    <text transform="translate(${X(plot.minX + 1.9)} ${Y(plot.minY + setback / 2)}) rotate(-90)" text-anchor="middle" font-size="${compact ? 10 : 12}" fill="${C.muted}">${fmt(setback)} m</text>` : '';
  const roofDetail = detail ? `
    <path d="M${X((house.minX + house.maxX) / 2)} ${Y(house.minY)} L${X((house.minX + house.maxX) / 2)} ${Y(house.maxY)}" stroke="#f2eee5" stroke-width="1.2" opacity=".65"/>
    ${label(compact ? 'House' : 'MAIN HOUSE', (house.minX + house.maxX) / 2, house.minY + 3.1, `font-size="${compact ? 11 : 14}" font-weight="650" fill="#fffdf6"`)}
    ${!compact ? label('mapped footprint', (house.minX + house.maxX) / 2, house.minY + 4.4, 'font-size="11" fill="#e7ede6"') : ''}` : label('House', ...centroid(site.house.footprint), 'font-size="10" fill="#fffdf6"');
  const garage = site.garage && !settings.removeGarage ? `<polygon points="${polys(site.garage.footprint)}" fill="#a7a393" stroke="#8b8a7b"/>${detail ? label(compact ? 'Garage' : 'EXISTING GARAGE', ...centroid(site.garage.footprint), 'font-size="10" fill="#fffdf6"') : ''}` : '';
  const rays = ray ? `<line x1="${X(observer.x)}" y1="${Y(observer.y)}" x2="${X(ray.target[0])}" y2="${Y(ray.target[1])}" stroke="${ray.visible ? C.ray : C.clear}" stroke-width="2" stroke-dasharray="6 5" opacity=".9"/>` +
    (ray.screen ? `<circle cx="${X(ray.screen.x)}" cy="${Y(ray.screen.y)}" r="5" fill="${C.paper}" stroke="${ray.visible ? C.ray : C.clear}" stroke-width="2"/>` : '') : '';
  const sideY = rearY + Math.max(1.5, (plot.maxY - rearY) * .3);
  const scalebar = detail ? 5 : 20;
  const xScale = 38, yScale = H - 32;
  const svg = `
    <svg class="diagram-plan-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;min-height:0;display:block;touch-action:manipulation;${options.placingTree ? 'cursor:crosshair;' : ''}" tabindex="0" role="group" aria-roledescription="interactive site plan" aria-label="${esc(`Mapped site plan for ${profile.label}. Click the plot to place ${options.placingTree ? 'the selected tree' : 'a viewpoint'}. Arrow keys move ${options.placingTree ? 'the selected tree' : 'the viewpoint'} by half a metre. Top is the street side, bottom is the rear garden toward ${profile.rearBearingLabel}.`)}">
      <title>${esc(profile.label)} — mapped plot and proposed garden</title>
      <desc>Plot approximately ${fmt(frontage, 2)} by ${fmt(depth, 2)} metres. House begins approximately ${fmt(setback)} metres from the street-side parcel boundary. Proposed terrace, jacuzzi and pool are design assumptions. Green lines show hedge screen planes. Dashed line is one sampled sightline.</desc>
      <defs><clipPath id="plan-clip"><rect width="${W}" height="${H}"/></clipPath><marker id="plan-tick" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M4 0V8" stroke="${C.muted}"/></marker></defs>
      <rect width="${W}" height="${H}" fill="${C.paper}"/>
      <g clip-path="url(#plan-clip)" font-family="Inter,system-ui,sans-serif" font-size="14" fill="${C.ink}">
        ${rect(l.bounds.minX - 5, plot.minY - 6, l.bounds.maxX - l.bounds.minX + 10, 5.8, `fill="#dfdfd6"`)}
        ${nearby}
        <polygon points="${polys(site.boundary)}" fill="${C.land}" stroke="${C.muted}" stroke-width="1.4" stroke-dasharray="4 3"/>
        <polygon points="${polys(site.house.footprint)}" fill="${C.roof}" stroke="#696f69"/>
        ${roofDetail}
        ${rect(terrace.x, rearY, terrace.width, terrace.depth, `fill="${C.stone}" stroke="#c9bda5" stroke-width="1.2"`)}
        ${rect(terrace.x, rearY + terrace.depth, terrace.width, .42, 'fill="#d2c5ad"')}
        ${jacuzzi ? rect(jacuzziX, jacuzziY, jacuzzi.x1 - jacuzzi.x0, jacuzzi.y1 - jacuzzi.y0, `rx="2" fill="${C.waterLight}" stroke="#f8f4e9" stroke-width="${detail ? 2 : 1}"`) : ''}
        ${detail ? label(compact ? 'Terrace' : 'TERRACE', terrace.x + terrace.width - 2.7, rearY + 2.45, `font-size="${compact ? 9 : 12}" fill="#746c59"`) : ''}
        ${detail && !compact ? label(fmt(terrace.width) + ' × ' + fmt(terrace.depth) + ' m', terrace.x + terrace.width - 2.7, rearY + Math.min(3.4, terrace.depth - .4), 'font-size="10" fill="#746c59"') : ''}
        ${pool ? rect(pool.x, pool.y, pool.width, pool.length, `rx="2" fill="${C.water}" stroke="#eae5d7" stroke-width="${detail ? 3 : 1.5}"`) : ''}
        ${detail && pool ? `<line x1="${X(pool.x + .35)}" y1="${Y(pool.y + .6)}" x2="${X(pool.x + pool.width - .35)}" y2="${Y(pool.y + .6)}" stroke="#c7dfd9" stroke-width="2"/>` : ''}
        ${detail && pool ? `<text transform="translate(${X(pool.x + pool.width / 2)} ${Y(pool.y + pool.length / 2)}) rotate(-90)" text-anchor="middle" font-size="${compact ? 10 : 12}" fill="#f5fffb">${compact ? 'Pool' : `POOL ${fmt(pool.width)} × ${fmt(pool.length)} m`}</text>` : ''}
        ${garage}
        ${hedges}
        ${canopy ? rect(canopy.x0, canopy.y0, canopy.x1 - canopy.x0, canopy.y1 - canopy.y0, 'fill="none" stroke="#967a52" stroke-width="2" stroke-dasharray="6 4"') : ''}
        <polygon points="${polys(cone)}" fill="${C.observer}" opacity=".18"/>
        ${rays}
        ${trees}
        <circle cx="${X(observer.x)}" cy="${Y(observer.y)}" r="${detail ? 6 : 4}" fill="${C.observer}" stroke="#fffdf5" stroke-width="2"/>
        <circle cx="${X(observer.x)}" cy="${Y(observer.y)}" r="2" fill="${C.ink}"/>
        ${detail ? compact ? `<text x="${X(observer.x) + 9}" y="${Y(observer.y) + 3}" font-size="9" fill="${C.ink}">View</text>` : `<rect x="${X(observer.x) - 58}" y="${Y(observer.y) - 30}" width="116" height="19" rx="9" fill="#fffdf5" fill-opacity=".94"/><text x="${X(observer.x)}" y="${Y(observer.y) - 17}" text-anchor="middle" font-size="10" fill="${C.ink}">${esc(observer.label || 'Viewpoint')}</text>` : ''}
        ${dimensions}
        ${label(`${profile.streetLabel} · ${detail ? 'STREET / ' : ''}${profile.frontBearingLabel}`, middleX, plot.minY - 3.4, `font-size="${compact ? 9 : 11}" fill="#5f685e"`)}
        ${detail ? label(`REAR GARDEN / ${profile.rearBearingLabel} ↓`, middleX, plot.maxY + 2.3, `font-size="${compact ? 9 : 11}" fill="#5f685e"`) : ''}
        ${detail ? label(`RIGHT · ${profile.sideLabels.right.toUpperCase()}`, plot.minX + 2.6, sideY, 'font-size="9" fill="#31513a"') + label(`LEFT · ${profile.sideLabels.left.toUpperCase()}`, plot.maxX - 2.6, sideY, 'font-size="9" fill="#31513a"') : ''}
        ${compass}
        <path d="M${xScale} ${yScale - 6}v6h${scalebar * scale}v-6" fill="none" stroke="${C.ink}" stroke-width="2"/>
        <text x="${xScale + scalebar * scale / 2}" y="${yScale - 10}" text-anchor="middle" font-size="11">${scalebar} m</text>
      </g>
    </svg>`;

  container.innerHTML = `
    <div class="diagram-toolbar" style="display:flex;flex:0 0 auto;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:7px">
      <p style="margin:0;font-size:11px;color:${options.placingTree ? '#9b6922' : C.muted}">${options.placingTree ? 'Tap bare garden ground to place the selected tree.' : detail ? `Tap the plot to move your viewpoint.${treeVolumes.length ? ' Tap a tree to select it.' : ''}` : 'Mapped footprints and sampled roof heights.'}</p>
      <div style="display:flex;gap:5px" aria-label="Plan extent">
        <button type="button" data-map-scope="garden" aria-pressed="${scope === 'garden'}" class="diagram-scope-button" style="border:1px solid ${C.line};border-radius:999px;padding:8px 12px;background:${scope === 'garden' ? C.ink : 'transparent'};color:${scope === 'garden' ? '#fff' : C.ink};font:inherit;font-size:12px;cursor:pointer">Garden</button>
        <button type="button" data-map-scope="context" aria-pressed="${scope === 'context'}" class="diagram-scope-button" style="border:1px solid ${C.line};border-radius:999px;padding:8px 12px;background:${scope === 'context' ? C.ink : 'transparent'};color:${scope === 'context' ? '#fff' : C.ink};font:inherit;font-size:12px;cursor:pointer">Neighbourhood</button>
      </div>
    </div>
    <div style="flex:1;min-height:0;display:flex;overflow:hidden;border:1px solid ${C.line};border-radius:12px;background:${C.paper}">${svg}</div>
    <div style="display:flex;flex:0 0 auto;gap:9px;flex-wrap:wrap;margin-top:6px;color:${C.muted};font-size:10px;line-height:1.4">
      <span><b style="color:${C.hedge}">━</b> Hedge</span><span><b style="color:${C.ray}">┄</b> Sightline</span><span><b style="color:${C.targetStroke}">■</b> Privacy targets</span><span>Left / right: from house toward rear garden ↓</span>
      ${treeVolumes.length ? '<span><b style="color:#41694d">◯</b> Tree crowns · dashed = no foliage credit / invalid</span>' : ''}
      ${detail ? `<span title="Ground on terrace centreline, 0.6 m beyond the outer edge.">${terraceDrop>=0?'Terrace drop':'Garden above terrace'} <b>${fmt(Math.abs(terraceDrop), 2)} m</b> · centreline, 0.6 m beyond edge</span>` : ''}
    </div>`;

  for (const button of container.querySelectorAll('[data-map-scope]')) button.onclick = () => {
    container.dataset.mapScope = button.dataset.mapScope;
    renderPlan(container, data, settings, observer, analysis, onPick, options);
  };
  const node = container.querySelector('svg');
  for (const tree of container.querySelectorAll('[data-screening-tree]')) {
    const select = event => {
      if (options.placingTree || typeof options.onTreePick !== 'function') return;
      event.preventDefault(); event.stopPropagation();
      options.onTreePick(tree.dataset.screeningTree);
    };
    tree.addEventListener('click', select);
    tree.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') select(event); });
  }
  node.addEventListener('click', event => {
    const callback = options.placingTree ? options.onTreePlace : onPick;
    if (typeof callback !== 'function') return;
    const matrix = node.getScreenCTM();
    if (!matrix) return;
    const p = node.createSVGPoint(); p.x = event.clientX; p.y = event.clientY;
    const q = p.matrixTransform(matrix.inverse());
    const xy = l.world(q.x, q.y);
    if (pointInPolygon(xy, site.boundary)) callback({x: Math.round(xy[0] * 100) / 100, y: Math.round(xy[1] * 100) / 100});
  });
  node.addEventListener('keydown', event => {
    const offsets = {ArrowLeft: [-.5, 0], ArrowRight: [.5, 0], ArrowUp: [0, -.5], ArrowDown: [0, .5]};
    const offset = offsets[event.key];
    const callback = options.placingTree ? options.onTreePlace : onPick;
    if (!offset || typeof callback !== 'function') return;
    event.preventDefault();
    const moving = options.placingTree ? treeVolumes.find(v => v.id === options.selectedTreeId) : observer;
    if (!moving) return;
    const xy = [moving.x + offset[0], moving.y + offset[1]];
    if (pointInPolygon(xy, site.boundary)) callback({x: xy[0], y: xy[1]});
  });
  return {ray, svg: node};
}

function rayRectangleInterval(origin, direction, box) {
  let entry = -Infinity, exit = Infinity;
  for (const [o, d, min, max] of [
    [origin[0], direction[0], box.x0, box.x1],
    [origin[1], direction[1], box.y0, box.y1],
  ]) {
    if (Math.abs(d) < 1e-10) { if (o < min || o > max) return null; }
    else {
      const a = (min - o) / d, b = (max - o) / d;
      entry = Math.max(entry, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
      if (entry > exit) return null;
    }
  }
  return [entry, exit];
}

function firstPolygonExit(origin, direction, polygon) {
  const intersections = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const sx = b[0] - a[0], sy = b[1] - a[1];
    const den = direction[0] * sy - direction[1] * sx;
    if (Math.abs(den) < 1e-9) continue;
    const ax = a[0] - origin[0], ay = a[1] - origin[1];
    const t = (ax * sy - ay * sx) / den;
    const u = (ax * direction[1] - ay * direction[0]) / den;
    if (t > 1e-8 && u >= 0 && u <= 1) intersections.push(t);
  }
  return intersections.length ? Math.min(...intersections) : null;
}

/** Equal-scale section along one actual sampled ray, not a whole-garden promise. */
export function renderSection(container, data, settings, observer, analysis, measuredFrame = null) {
  const ray = criticalRay(data, analysis);
  if (!ray) {
    container.innerHTML = `<p style="padding:24px;line-height:1.6;color:${C.muted}">No sampled roof ray crosses a modeled hedge from this point. Choose a viewpoint within the garden to inspect a section.</p>`;
    return {ray: null};
  }
  const target = ray.target;
  const D = Math.hypot(target[0] - observer.x, target[1] - observer.y);
  if (!(D > 0)) return {ray: null};
  const direction = [(target[0] - observer.x) / D, (target[1] - observer.y) / D];
  const origin = [observer.x, observer.y];
  const treeVolumes = screeningTreeVolumes(settings, data);
  const xy = s => [observer.x + s * direction[0], observer.y + s * direction[1]];
  const reference = data.site.floorReference.z;
  const screen = ray.screen;
  const floorZ = reference + number(settings.floorHeight, 1.2);
  const minS = -2.5, maxS = D + 3.2;
  const sampleCount = Math.max(50, Math.ceil((maxS - minS) * 2));
  const samples = Array.from({length: sampleCount + 1}, (_, i) => {
    const s = minS + i / sampleCount * (maxS - minS), p = xy(s);
    return {s, existing: terrainAt(p[0], p[1], data), proposed: gardenGroundAt(p[0], p[1], settings, data)};
  });
  const roof = settings.canopyEnabled ? canopyBounds(settings, data) : null;
  const minimumZ = Math.min(...samples.map(p => Math.min(p.existing, p.proposed)), screen?.groundZ ?? Infinity) - 1;
  const maximumZ = Math.max(target[2], observer.z, screen?.topZ ?? -Infinity, roof?.z ?? -Infinity, ...treeVolumes.filter(v => v.enabled !== false).map(v => v.crownTopZ)) + 3.4;
  // Use the flex panel's actual pixel frame, not the world's aspect ratio, for
  // the viewBox. A second layout pass below measures it after the short header
  // and readouts are laid out. World metres still use one scale in both axes,
  // but a 12px label now remains 12px on screen even on a wide, shallow panel.
  const W = measuredFrame?.width || Math.max(300, (container.clientWidth || 960) - 32);
  const H = measuredFrame?.height || Math.max(180, (container.clientHeight || 480) - 150);
  const compact = W < 560;
  const left = compact ? 28 : 48, right = compact ? 18 : 30, top = compact ? 20 : 26, bottom = compact ? 52 : 62;
  const plotWidth = Math.max(1, W - left - right), plotHeight = Math.max(1, H - top - bottom);
  const scale = Math.min(plotWidth / (maxS - minS), plotHeight / (maximumZ - minimumZ));
  const xOffset = left + (plotWidth - (maxS - minS) * scale) / 2;
  const yOffset = top + (plotHeight - (maximumZ - minimumZ) * scale) / 2;
  const X = s => xOffset + (s - minS) * scale;
  const Y = z => yOffset + (maximumZ - z) * scale;
  const baseline = Y(minimumZ);
  const profilePath = key => samples.map((p, i) => `${i ? 'L' : 'M'}${X(p.s).toFixed(2)},${Y(p[key]).toFixed(2)}`).join(' ');
  const fillPath = `${profilePath('proposed')} L${X(maxS)},${baseline} L${X(minS)},${baseline} Z`;
  const existingPath = profilePath('existing');
  const block = data.buildings.find(b => b.id === ray.blockId);
  const sampleType = ray.kind === 'high-feature' ? 'high-feature return' : 'roof point';
  const blockerLabel = ray.blockedBy === 'screening-tree' ? 'screening tree' : ray.blockedBy === 'canopy' ? 'canopy' : ray.blockedBy === 'building' ? 'mapped building' : 'hedge';
  const outcome = `This sampled ${sampleType} is ${ray.visible ? 'exposed' : `hidden by the ${blockerLabel}`}`;
  const treesSvg = treeSectionMarkup(treeVolumes, {origin, direction, minS, maxS, X, Y, scale});
  const statusColor = ray.visible ? C.ray : C.clear;
  const topOfScreen = screen ? (screen.topZ ?? screen.groundZ + screen.height) : null;
  // Both displayed heights share today's planting base. For retained foliage,
  // the control and solver additionally track the original-ground reference.
  const need = screen ? screen.requiredExposedHeight ?? Math.max(0, screen.z - screen.groundZ) : null;
  let canopySvg = '';
  if (roof) {
    const interval = rayRectangleInterval(origin, direction, roof);
    if (interval && interval[1] > minS && interval[0] < maxS) {
      const start = Math.max(minS, interval[0]), end = Math.min(maxS, interval[1]);
      const fascia = [interval[0], interval[1]].filter(s => s >= minS && s <= maxS).map(s => {
        const p = xy(s);
        if (Math.abs(p[1] - roof.y0) < 1e-5) return ''; // no front-house fascia
        return `<line x1="${X(s)}" y1="${Y(roof.z)}" x2="${X(s)}" y2="${Y(roof.fasciaBottomZ)}" stroke="#987e58" stroke-width="5"/>`;
      }).join('');
      canopySvg = `<rect x="${X(start)}" y="${Y(roof.z + .14)}" width="${(end - start) * scale}" height="${.14 * scale}" fill="#987e58"/>${fascia}
        <text x="${X((start + end) / 2)}" y="${Y(roof.z + .55)}" text-anchor="middle" font-size="${compact ? 10 : 12}" fill="#7b664b">${compact ? 'canopy' : 'canopy on this ray'}</text>`;
    }
  }
  const insideHouse = pointInPolygon(origin, data.site.house.footprint);
  const houseExit = insideHouse ? firstPolygonExit(origin, direction, data.site.house.footprint) : null;
  const houseFloor = insideHouse && houseExit !== null ? `<rect x="${X(minS)}" y="${Y(floorZ)}" width="${(houseExit - minS) * scale}" height="${.18 * scale}" fill="#bdab8d"/>
    <line x1="${X(houseExit)}" y1="${Y(floorZ)}" x2="${X(houseExit)}" y2="${Y(terrainAt(...xy(houseExit), data))}" stroke="#bdab8d" stroke-width="2"/>` : '';
  const t = data.site.terrace;
  const terraceInterval = rayRectangleInterval(origin, direction, {x0:t.x,x1:t.x+t.width,y0:t.y,y1:t.y+number(settings.terraceDepth,t.depth)});
  let terraceFloor = '';
  if (terraceInterval && terraceInterval[1] > minS && terraceInterval[0] < maxS) {
    const a = Math.max(minS, terraceInterval[0]), b = Math.min(maxS, terraceInterval[1]);
    const ground = gardenGroundAt(...xy(b), settings, data);
    terraceFloor = `<rect x="${X(a)}" y="${Y(floorZ)}" width="${(b-a)*scale}" height="${.18*scale}" fill="#bdab8d"/>
      <line x1="${X(b)}" y1="${Y(floorZ)}" x2="${X(b)}" y2="${Y(ground)}" stroke="#bdab8d" stroke-width="2"/>`;
  }
  const eyeGround = observer.z - number(observer.eyeHeight, settings.eyeHeight || 1.65);
  const person = `<line x1="${X(0)}" y1="${Y(eyeGround + .12)}" x2="${X(0)}" y2="${Y(observer.z - .2)}" stroke="${C.ink}" stroke-width="3"/>
    <circle cx="${X(0)}" cy="${Y(observer.z)}" r="5" fill="${C.observer}" stroke="${C.ink}" stroke-width="1.5"/>
    <text x="${X(0)}" y="${Y(observer.z + (compact ? 1.15 : .7))}" font-size="${compact ? 11 : 12}" text-anchor="middle" fill="${C.ink}">eye ${fmt(observer.z - reference, 2)} m</text>`;
  const targetGround = terrainAt(target[0], target[1], data);
  const buildingMark = `<line x1="${X(D)}" y1="${Y(targetGround)}" x2="${X(D)}" y2="${Y(target[2])}" stroke="${C.targetStroke}" stroke-width="3"/>
    <circle cx="${X(D)}" cy="${Y(target[2])}" r="5" fill="${statusColor}" stroke="#fffdf5" stroke-width="2"/>
    <text x="${X(D) - 8}" y="${Y(target[2]) - 21}" text-anchor="end" font-size="14" font-weight="650" fill="${C.ink}">${esc(block?.label || 'Apartment block')}</text>
    <text x="${X(D) - 8}" y="${Y(target[2]) - 5}" text-anchor="end" font-size="11" fill="${C.muted}">${ray.kind === 'high-feature' ? 'unverified high object' : 'sampled roof'} +${fmt(target[2] - reference, 2)} m</text>`;
  const screenSvg = screen ? `
    <rect x="${X(screen.distance) - .32 * scale}" y="${Y(topOfScreen)}" width="${.64 * scale}" height="${Math.max(0, topOfScreen - screen.groundZ) * scale}" fill="${C.hedge}" rx="${Math.min(4, .15 * scale)}"/>
    <line x1="${X(screen.distance)}" y1="${Y(screen.groundZ)}" x2="${X(screen.distance)}" y2="${Y(topOfScreen)}" stroke="${C.hedgeDark}" stroke-width="1"/>
    ${need > screen.height + .02 ? `<line x1="${X(screen.distance)}" y1="${Y(topOfScreen)}" x2="${X(screen.distance)}" y2="${Y(screen.z)}" stroke="${C.hedge}" stroke-width="2" stroke-dasharray="5 4"/>` : ''}
    <circle cx="${X(screen.distance)}" cy="${Y(screen.z)}" r="4.5" fill="${C.paper}" stroke="${statusColor}" stroke-width="2"/>
    <text x="${X(screen.distance) - 7}" y="${Y(topOfScreen) - 12}" font-size="13" text-anchor="end" fill="${C.hedgeDark}" font-weight="650">${esc(screen.side)} hedge ${fmt(screen.height, 2)} m</text>
    ${need > screen.height + .5 ? `<text x="${X(screen.distance) - 7}" y="${Y(screen.z) - 13}" text-anchor="end" font-size="12" fill="${C.ray}">${fmt(need, 2)} m ${compact ? 'needed' : 'hedge-only height'}</text>` : ''}
  ` : '';
  const step = D > 70 ? 20 : D > 40 ? 10 : 5;
  const grid = [];
  for (let s = 0; s <= D; s += step) {
    grid.push(`<line x1="${X(s)}" y1="${yOffset + 12}" x2="${X(s)}" y2="${baseline}" stroke="${C.line}" stroke-width=".7" opacity=".7"/>
      <text x="${X(s)}" y="${baseline + 18}" text-anchor="middle" font-size="${compact ? 10 : 11}" fill="${C.muted}">${s} m</text>`);
  }
  const dimY = baseline + (compact ? 36 : 42);
  const dimension = screen ? `<path d="M${X(0)} ${dimY - 4}v8m0-4H${X(screen.distance)}m0-4v8" fill="none" stroke="${C.muted}"/>
    <rect x="${(X(0) + X(screen.distance)) / 2 - 69}" y="${dimY - 10}" width="138" height="20" rx="10" fill="${C.paper}"/>
    <text x="${(X(0) + X(screen.distance)) / 2}" y="${dimY + 4}" text-anchor="middle" font-size="${compact ? 10 : 11}" fill="${C.muted}">eye → hedge ${fmt(screen.distance, 2)} m</text>` : '';

  container.innerHTML = `
    <div style="display:flex;flex:0 0 auto;flex-direction:column;gap:3px;margin:0 0 7px">
      <span style="display:inline-flex;align-items:center;gap:6px;color:${statusColor};font-size:12px;font-weight:650"><span style="width:6px;height:6px;border-radius:50%;background:${statusColor}"></span>${ray.visible ? 'Sample exposed' : 'Sample hidden by ' + blockerLabel} · ${esc(block?.label || 'apartment')}</span>
      <span style="font-size:10px;color:${C.muted}">One sightline · equal horizontal and vertical scale</span>
    </div>
    <div data-section-frame style="flex:1;min-height:0;display:flex;border:1px solid ${C.line};border-radius:12px;overflow:hidden;background:${C.paper}">
      <svg class="diagram-section-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;min-height:0;display:block" role="img" aria-label="Sightline section from ${esc(observer.label || 'viewpoint')} to a roof point of ${esc(block?.label || 'an apartment block')}. ${esc(outcome)}.">
        <title>One roof sightline — true distance and height scale</title>
        <desc>The existing terrain comes from the 2024 terrain model. Raised garden levels and planting beds follow the current settings. Dotted green extension shows the hedge-only height needed for this sampled ray, even if another object already blocks it. Heights are relative to the original ground reference beside the house.</desc>
        <rect width="${W}" height="${H}" fill="${C.paper}"/>
        <g font-family="Inter,system-ui,sans-serif">
          ${grid.join('')}
          <path d="${fillPath}" fill="${C.land}"/>
          <path d="${profilePath('proposed')}" fill="none" stroke="${C.hedgeDark}" stroke-width="1.5"/>
          <path d="${existingPath}" fill="none" stroke="${C.existing}" stroke-width="1.2" stroke-dasharray="3 4"/>
          ${screen && screen.groundZ > gardenGroundAt(screen.x, screen.y, settings, data) + .01 ? `<rect x="${X(screen.distance) - .48 * scale}" y="${Y(screen.groundZ)}" width="${.96 * scale}" height="${(screen.groundZ - gardenGroundAt(screen.x, screen.y, settings, data)) * scale}" fill="${C.soil}"/>` : ''}
          ${houseFloor}${terraceFloor}
          ${canopySvg}
          ${treesSvg}
          ${screenSvg}
          ${buildingMark}
          <line x1="${X(0)}" y1="${Y(observer.z)}" x2="${X(D)}" y2="${Y(target[2])}" stroke="${statusColor}" stroke-width="2" stroke-dasharray="${ray.visible ? 'none' : '6 4'}"/>
          ${person}
          ${dimension}
        </g>
      </svg>
    </div>
    <div style="display:grid;flex:0 0 auto;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:8px;font-size:10px;color:${C.muted}">
      <div>Screen above soil<strong style="display:block;color:${C.ink};font-size:${compact ? 17 : 20}px;margin-top:3px">${screen ? fmt(screen.height, 2) + ' m' : '—'}</strong></div>
      <div>Hedge-only target<strong style="display:block;color:${C.ink};font-size:${compact ? 17 : 20}px;margin-top:3px">${need !== null ? fmt(need, 2) + ' m' : '—'}</strong></div>
      <div>Eye to sample<strong style="display:block;color:${C.ink};font-size:${compact ? 17 : 20}px;margin-top:3px">${fmt(D, 2)} m</strong></div>
    </div>
    <p style="flex:0 0 auto;margin:7px 0 0;font-size:10.5px;color:${C.muted};line-height:1.35">Solid/dotted ground: proposed/existing. Crown shapes are cuts through this section. The hedge-only target excludes canopy and tree screening and applies to this ray.</p>`;
  const frame = container.querySelector('[data-section-frame]');
  if (!measuredFrame && frame?.clientWidth > 0 && frame?.clientHeight > 0) {
    return renderSection(container, data, settings, observer, analysis, {
      width: frame.clientWidth,
      height: frame.clientHeight,
    });
  }
  return {ray, svg: container.querySelector('svg')};
}
