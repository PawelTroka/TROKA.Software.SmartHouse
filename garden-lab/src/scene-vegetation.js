import * as THREE from '../vendor/three.module.js';

const TAU = Math.PI * 2;
const atlasPixels = new Map();
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function seeded(id) {
  let seed = 2166136261;
  for (const c of String(id)) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619) >>> 0;
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

/** Original botanical atlas, not a photograph: opaque shaded needles at left,
 * individually cut-out branching sprays at right. Fine silhouettes come from
 * leaves, rather than the outer edge of an opaque textured ball. Pixels are
 * cached, but every material owns/disposes its own GPU texture. */
function foliageAtlas(family) {
  if (!atlasPixels.has(family)) {
    const size = 256, width = size * 2, pixels = new Uint8Array(width * size * 4);
    const random = seeded('foliage-atlas:' + family);
    const paint = (x, y, alpha, color) => {
      const ix = Math.floor(x), iy = Math.floor(y);
      if (ix < 0 || ix >= width || iy < 0 || iy >= size) return;
      const p = (iy * width + ix) * 4, a = clamp(alpha, 0, 1), old = pixels[p + 3] / 255;
      const total = a + old * (1 - a);
      if (total <= 0) return;
      for (let k = 0; k < 3; k++) pixels[p + k] = Math.round((color[k] * a + pixels[p + k] * old * (1 - a)) / total);
      pixels[p + 3] = Math.round(total * 255);
    };
    const stroke = (ax, ay, bx, by, radius, color) => {
      const dx = bx - ax, dy = by - ay, length2 = dx * dx + dy * dy;
      for (let y = Math.max(0, Math.floor(Math.min(ay, by) - radius - 1)); y <= Math.min(size - 1, Math.ceil(Math.max(ay, by) + radius + 1)); y++) {
        for (let x = Math.max(0, Math.floor(Math.min(ax, bx) - radius - 1)); x <= Math.min(width - 1, Math.ceil(Math.max(ax, bx) + radius + 1)); x++) {
          const t = length2 ? clamp(((x + .5 - ax) * dx + (y + .5 - ay) * dy) / length2, 0, 1) : 0;
          const d = Math.hypot(x + .5 - ax - dx * t, y + .5 - ay - dy * t);
          // Each leaflet tapers toward its tip, keeping a natural pointed edge.
          paint(x, y, clamp(radius * (1 - t * .52) + .7 - d, 0, 1), color);
        }
      }
    };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const n = random(), shade = 138 + n * 36 + Math.sin(x * .13 + y * .07) * 9;
      const p = (y * width + x) * 4;
      pixels.set([shade * .95, shade, shade * .87, 255], p);
    }
    // Opaque interior texture uses the same small needle scale as the cutouts.
    for (let i = 0; i < 2200; i++) {
      const x = random() * size, y = random() * size, a = random() * TAU;
      const length = 3 + random() * 10, shade = 105 + random() * 95;
      const endX = clamp(x + Math.cos(a) * length, 0, size - 2);
      stroke(x, y, endX, y + Math.sin(a) * length, .38 + random() * .5, [shade * .94, shade, shade * .83]);
    }
    const cx = size + size / 2;
    stroke(cx, 245, cx - 3, 14, 1.7, [121, 124, 93]);
    const needle = family === 'pine', tiers = needle ? 12 : 13;
    for (let tier = 0; tier < tiers; tier++) for (const side of [-1, 1]) {
      const t = (tier + .5) / tiers, stemY = 230 - t * 197;
      const reach = (needle ? 77 : 90) * Math.sin(Math.PI * (.13 + t * .8)) * (.9 + random() * .12);
      const bx = cx + side * reach, by = stemY - (needle ? 26 : 32) - t * 9;
      stroke(cx - t * 3, stemY, bx, by, 1.25, [139, 153, 116]);
      const leafCount = needle ? 10 : 8;
      for (let leaf = 0; leaf < leafCount; leaf++) {
        const u = (leaf + .5) / leafCount, x = cx + side * reach * u, y = stemY + (by - stemY) * u;
        const leafLength = (needle ? 21 : 13) * (1 - u * .35) * (.85 + random() * .3);
        const shade = 164 + random() * 58;
        for (const branchSide of [-1, 1]) {
          const tipX = x + side * leafLength * (branchSide > 0 ? .88 : .25);
          const tipY = y - leafLength * (branchSide > 0 ? .32 : .98);
          stroke(x, y, tipX, tipY, needle ? .78 : 2.0, [shade * .94, shade, shade * .82]);
          if (!needle) stroke(x + side * .7, y - 1, tipX - side * .7, tipY - .4, .5, [shade, Math.min(255, shade + 9), shade * .88]);
        }
      }
    }
    for (let i = 0; i < 7; i++) {
      const y = 43 - i * 4, length = 10 - i * .8;
      for (const side of [-1, 1]) stroke(cx - 3, y, cx - 3 + side * length * .45, y - length, needle ? .7 : 1.5, [201, 215, 176]);
    }
    // Leave a transparent gutter around the spray to stop neighbouring atlas
    // tiles leaking into alpha-tested edges under linear mip filtering.
    for (let y = 0; y < size; y++) for (let x = size; x < size + 5; x++) pixels[(y * width + x) * 4 + 3] = 0;
    atlasPixels.set(family, pixels);
  }
  const texture = new THREE.DataTexture(atlasPixels.get(family), 512, 256, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  texture.name = `original-${family}-foliage-atlas`;
  return texture;
}

export function createFoliageMaterial(base, family = 'thuja') {
  const material = base.clone(), map = foliageAtlas(family);
  material.map = map;
  // Opaque and cut-out parts share one draw call, write useful depth and work
  // with ordinary MSAA. There is no blended-card sorting or camera billboard.
  material.alphaTest = .33;
  material.alphaToCoverage = true;
  material.transparent = false;
  material.opacity = 1;
  material.depthWrite = true;
  material.side = THREE.DoubleSide;
  material.vertexColors = true;
  material.userData.transient = true;
  material.userData.botanicalCutouts = true;
  material.addEventListener('dispose', () => map.dispose());
  return material;
}

/** Four deterministic hedge specimens share a small number of instanced draw
 * calls. Each has a recessed continuous crown and hundreds of cut-out sprays.
 * No visible rectangular screen and no spherical crown clusters are needed.
 * The caller retains its existing ideal analytical/shadow screen separately. */
function hedgeSpecimen(variant, heightBand) {
  const random = seeded(`hedge:${variant}:${heightBand}`), phase = random() * TAU;
  const positions = [], normals = [], colors = [], uvs = [];
  const profile = y => y < .08 ? .74 + y * 2.5 : y < .77 ? .94 - y * .06 : Math.max(.025, .90 * ((1 - y) / .23) ** .40);
  const point = (y, a, extra = 0) => {
    const irregular = .92 + .045 * Math.sin(a * 5 + y * 31 + phase) + .035 * Math.cos(a * 9 - y * 19);
    const r = (profile(y) * irregular + extra);
    return [Math.cos(a) * r, y, Math.sin(a) * r];
  };
  const vertex = (p, normal, uv, shade) => {
    positions.push(...p); normals.push(...normal); uvs.push(...uv);
    colors.push(shade * .95, shade, shade * .89);
  };
  const triangle = (points, ns, tex, shades) => points.forEach((p, i) => vertex(p, ns[i], tex[i], shades[i]));
  const rings = 17, sides = 14;
  for (let row = 0; row < rings; row++) for (let side = 0; side < sides; side++) {
    const y0 = .006 + row / rings * .987, y1 = .006 + (row + 1) / rings * .987;
    const a0 = side / sides * TAU, a1 = (side + 1) / sides * TAU;
    const ps = [point(y0, a0), point(y0, a1), point(y1, a1), point(y1, a0)];
    const ns = [a0, a1, a1, a0].map(a => [Math.cos(a), .1, Math.sin(a)]);
    const shade = .61 + random() * .11;
    const tex = [[.006, .03], [.492, .03], [.492, .96], [.006, .96]];
    for (const indices of [[0, 2, 1], [0, 3, 2]]) triangle(indices.map(i => ps[i]), indices.map(i => ns[i]), indices.map(i => tex[i]), indices.map(i => shade + ps[i][1] * .08));
  }
  const levels = Math.max(10, Math.min(28, Math.round(heightBand / .27)));
  let sprays = 0;
  for (let tier = 0; tier < levels; tier++) {
    const y = .025 + tier / Math.max(1, levels - 1) * .94;
    const count = y > .88 ? 7 : 11;
    for (let twig = 0; twig < count; twig++) {
      const a = phase + tier * 2.399963 + twig / count * TAU + (random() - .5) * .16;
      const centre = point(y, a, -.055);
      const w = (.30 + random() * .16) * Math.max(.42, profile(y));
      const h = (.23 + random() * .14) / heightBand;
      const lean = .13 + random() * .17;
      const tangent = [-Math.sin(a), 0, Math.cos(a)];
      const radial = [Math.cos(a), 0, Math.sin(a)];
      const n = [radial[0], -.12, radial[2]];
      const corners = [[-.5, 0], [.5, 0], [.5, 1], [-.5, 1]].map(([u, v]) => {
        const py = Math.min(.998, centre[1] + v * h);
        const x = centre[0] + tangent[0] * u * w + radial[0] * v * lean;
        const z = centre[2] + tangent[2] * u * w + radial[2] * v * lean;
        const r = Math.hypot(x, z), limit = Math.min(1, profile(py) + .10);
        return [x * Math.min(1, limit / Math.max(.001, r)), py, z * Math.min(1, limit / Math.max(.001, r))];
      });
      const tex = [[.510, .985], [.990, .985], [.990, .015], [.510, .015]];
      const shade = .84 + random() * .16;
      for (const indices of [[0, 1, 2], [0, 2, 3]]) triangle(indices.map(i => corners[i]), indices.map(() => n), indices.map(i => tex[i]), indices.map(() => shade));
      sprays++;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData.sprayCount = sprays;
  return geometry;
}

export function createHedgeVegetation(segments, {
  groundAt, topAt, spacing = .65, material, svgMode = false,
} = {}) {
  const group = new THREE.Group();
  group.name = 'botanical-hedges';
  group.userData.analyticalScreen = false;
  group.userData.originalProceduralAsset = true;
  if (svgMode || !material || !groundAt || !topAt) return group;
  const buckets = new Map();
  let count = 0;
  for (const segment of segments) {
    const {a, b} = segment, dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    if (!Number.isFinite(length) || length < .01) continue;
    const tx = dx / length, ty = dy / length;
    const plants = Math.max(1, Math.ceil(length / clamp(Number(spacing) || .65, .45, 1.2)));
    for (let i = 0; i < plants; i++) {
      const t = (i + .5) / plants, x = a[0] + dx * t - ty * .14, y = a[1] + dy * t + tx * .14;
      const groundCentre = groundAt(x, y, segment), top = topAt(x, y, segment), height = top - groundCentre;
      if (!Number.isFinite(groundCentre) || !Number.isFinite(top) || height < .12) continue;
      const radius = Math.min(.65, .36 + height * .045);
      // Restrict both ends of every span, including drive and pedestrian gates.
      // Instance rotation follows the span so this bound is exact, not circular.
      const along = Math.min(radius, t * length * .98, (1 - t) * length * .98);
      const footprint = [-1, 1].flatMap(u => [-1, 1].map(v => [
        x + u * tx * along - v * ty * radius * .88,
        y + u * ty * along + v * tx * radius * .88,
      ]));
      const ground = Math.min(groundCentre, ...footprint.map(p => groundAt(...p, segment)));
      const safeTop = Math.min(top, ...footprint.map(p => topAt(...p, segment)));
      const h = safeTop - ground;
      if (!(h >= .12)) continue;
      const band = Math.max(2, Math.min(14, Math.ceil((height - 1e-6) / 2) * 2)), variant = i % 4;
      const key = `${band}:${variant}`, bucket = buckets.get(key) || {band, variant, plants: []};
      buckets.set(key, bucket);
      const matrix = new THREE.Matrix4().makeBasis(new THREE.Vector3(tx, 0, ty), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-ty, 0, tx));
      matrix.scale(new THREE.Vector3(along, h, radius * .88)); matrix.setPosition(x, ground, y);
      bucket.plants.push({matrix, shade: .90 + .09 * Math.sin((i + 1) * 2.399963 + a[0] * .7 + a[1] * .4) ** 2});
      count++;
    }
  }
  if (!count) return group;
  const foliageMaterial = createFoliageMaterial(material, 'thuja');
  foliageMaterial.color.set('#71845e');
  for (const {band, variant, plants} of buckets.values()) {
    const geometry = hedgeSpecimen(variant, band), mesh = new THREE.InstancedMesh(geometry, foliageMaterial, plants.length);
    mesh.name = `hedge-sprays-${band}-${variant}`;
    const color = new THREE.Color();
    plants.forEach(({matrix, shade}, i) => {mesh.setMatrixAt(i, matrix); color.setRGB(shade * .97, shade, shade * .94); mesh.setColorAt(i, color);});
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.userData.botanicalCutouts = true;
    mesh.userData.contactShading = false;
    mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    group.add(mesh);
  }
  group.userData.plantCount = count;
  group.userData.drawCalls = buckets.size;
  return group;
}
