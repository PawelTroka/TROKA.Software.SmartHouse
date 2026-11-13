// Shared SVG representations of the same finite crown volumes used for rays.
// Site x/y are drawn directly: rotating a crown never mirrors the site.
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function treePlanMarkup(volumes, {X, Y, scale, selectedTreeId = '', interactive = false, labels = true, subtle = false}) {
  return volumes.map((v, index) => {
    const selected = v.id === selectedTreeId;
    const active = v.enabled !== false && v.foliageActive;
    const valid = v.plantable !== false;
    const color = !valid ? '#ac664e' : active ? '#41694d' : '#8a8067';
    const width = v.crownWidth * scale, depth = v.crownDepth * scale;
    const shape = v.form === 'panel'
      ? `<rect x="${-width / 2}" y="${-depth / 2}" width="${width}" height="${depth}" rx="1"/>`
      : `<ellipse rx="${width / 2}" ry="${depth / 2}"/>`;
    const description = `${v.type?.label || v.label || 'Screening tree'} ${index + 1}: ${v.height.toFixed(1)} m tall, ${v.crownWidth.toFixed(1)} m crown; ${!valid ? 'invalid planting position, excluded from screening' : active ? 'leafy crown' : 'no leafy crown screening'}`;
    return `<g data-screening-tree="${esc(v.id)}"${interactive ? ` tabindex="0" role="button" aria-pressed="${selected}" aria-label="${esc(description)}" style="cursor:pointer;outline:none"` : ''}>
      <title>${esc(description)}</title>
      <g transform="translate(${X(v.x)} ${Y(v.y)}) rotate(${v.rotation || 0})" fill="${color}" fill-opacity="${subtle ? .07 : active && valid ? .55 : .12}" stroke="${selected ? '#b9822d' : color}" stroke-width="${selected ? 3 : subtle ? 1.4 : 1.5}"${!active || !valid ? ' stroke-dasharray="4 3"' : ''}>${shape}</g>
      <circle cx="${X(v.x)}" cy="${Y(v.y)}" r="${selected ? 4 : 2.6}" fill="${selected ? '#b9822d' : '#6d5940'}" stroke="#fffdf4" stroke-width="1"/>
      ${labels ? `<text x="${X(v.x) + 6}" y="${Y(v.y) - 5}" fill="${selected ? '#8d601b' : color}" font-size="10" font-weight="700" paint-order="stroke" stroke="#fffdf4" stroke-width="3" stroke-linejoin="round">T${index + 1}</text>` : ''}
    </g>`;
  }).join('');
}

/** Horizontal interval through a crown at z on a vertical section plane.
 * Returns distance along the section, not a projection of an off-plane tree. */
export function crownSliceInterval(volume, origin, direction, z) {
  const v = volume, angle = (v.rotation || 0) * Math.PI / 180;
  const c = Math.cos(angle), s = Math.sin(angle);
  const dx = origin[0] - v.x, dy = origin[1] - v.y;
  const o = [c * dx + s * dy, -s * dx + c * dy];
  const d = [c * direction[0] + s * direction[1], -s * direction[0] + c * direction[1]];
  if (z < v.crownBottomZ - 1e-9 || z > v.crownTopZ + 1e-9) return null;
  const rx = v.crownWidth / 2, ry = v.crownDepth / 2;
  if (v.form === 'panel') {
    let entry = -Infinity, exit = Infinity;
    for (const [p, q, r] of [[o[0], d[0], rx], [o[1], d[1], ry]]) {
      if (Math.abs(q) < 1e-10) { if (Math.abs(p) > r) return null; }
      else { const a = (-r - p) / q, b = (r - p) / q; entry = Math.max(entry, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b)); }
    }
    return entry <= exit ? [entry, exit] : null;
  }
  const h = v.crownTopZ - v.crownBottomZ;
  const radialSquared = v.form === 'cone'
    ? (1 - (z - v.crownBottomZ) / h) ** 2
    : 1 - ((z - (v.crownTopZ + v.crownBottomZ) / 2) / (h / 2)) ** 2;
  const A = (d[0] / rx) ** 2 + (d[1] / ry) ** 2;
  const B = 2 * (o[0] * d[0] / rx ** 2 + o[1] * d[1] / ry ** 2);
  const C = (o[0] / rx) ** 2 + (o[1] / ry) ** 2 - radialSquared;
  const determinant = B * B - 4 * A * C;
  if (determinant < -1e-9 || A <= 0) return null;
  const root = Math.sqrt(Math.max(0, determinant));
  return [(-B - root) / (2 * A), (-B + root) / (2 * A)];
}

export function treeSectionMarkup(volumes, {origin, direction, minS, maxS, X, Y, scale}) {
  return volumes.filter(v => v.enabled !== false).map(v => {
    const samples = [];
    for (let i = 0; i <= 48; i++) {
      const z = v.crownBottomZ + (v.crownTopZ - v.crownBottomZ) * i / 48;
      const range = crownSliceInterval(v, origin, direction, z);
      if (range && range[1] >= minS && range[0] <= maxS) samples.push({z, a: Math.max(minS, range[0]), b: Math.min(maxS, range[1])});
    }
    if (samples.length < 2) return '';
    const points = [...samples.map(p => [X(p.a), Y(p.z)]), ...samples.slice().reverse().map(p => [X(p.b), Y(p.z)])];
    const active = v.foliageActive && v.plantable !== false;
    const colour = v.plantable === false ? '#ac664e' : '#54744c';
    const along = (v.x - origin[0]) * direction[0] + (v.y - origin[1]) * direction[1];
    const lateral = Math.abs((v.x - origin[0]) * direction[1] - (v.y - origin[1]) * direction[0]);
    const trunk = lateral <= v.trunkRadius && along >= minS && along <= maxS
      ? `<line x1="${X(along)}" x2="${X(along)}" y1="${Y(v.groundZ)}" y2="${Y(v.trunkTopZ ?? v.crownBottomZ)}" stroke="#80684b" stroke-width="${Math.max(1, v.trunkRadius * 2 * scale)}"/>` : '';
    return `<g><title>${esc(v.type?.label || 'Screening tree')} — crown cross-section${active ? '' : ', no foliage screening'}</title>${trunk}<polygon points="${points.map(p => p.join(',')).join(' ')}" fill="${colour}" fill-opacity="${active ? '.38' : '.04'}" stroke="${colour}" stroke-width="1.3"${active ? '' : ' stroke-dasharray="3 3"'}/></g>`;
  }).join('');
}
