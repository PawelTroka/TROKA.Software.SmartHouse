import * as THREE from '../vendor/three.module.js';
import {indexExactFoliageGeometry} from './foliage-vertex-index.js?v=1.41.0';

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
    const size = 512, width = size * 2, pixels = new Uint8Array(width * size * 4);
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
    // Match the interior and spray reflectance. Large dark capsules with pale
    // cards pasted over them are less convincing than similarly coloured,
    // overlapping branchlets whose separation comes from their actual normals.
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const n = random(), shade = 185 + n * 22 + Math.sin(x * .17 + y * .11) * 5;
      const p = (y * width + x) * 4;
      pixels.set([shade * .97, shade, shade * .91, 255], p);
    }
    for (let i = 0; i < 4200; i++) {
      const x = random() * size, y = random() * size, a = random() * TAU;
      const length = 5 + random() * 17, shade = 169 + random() * 43;
      stroke(x, y, clamp(x + Math.cos(a) * length, 0, size - 3), y + Math.sin(a) * length,
        .6 + random() * .8, [shade * .97, shade, shade * .90]);
    }
    const cx = size * 1.5, stemBottom = size * .955, stemTop = size * .065;
    const needle = family === 'pine' || family === 'spruce' || family === 'fir';
    const leafColour = shade => [shade * .97, shade, shade * .90];
    const blade = (x, y, angle, length, radius, shade) => {
      stroke(x, y, x + Math.cos(angle) * length, y + Math.sin(angle) * length,
        radius, leafColour(shade));
    };
    // Compound, asymmetrical three-order sprays. Several short scale-leaf fans
    // grow from each branchlet, rather than a single broad fern-shaped stamp.
    stroke(cx, stemBottom, cx - size * .025, stemTop, 2.1, leafColour(176));
    const tiers = needle ? 18 : 16;
    for (let tier = 0; tier < tiers; tier++) for (const side of [-1, 1]) {
      const t = (tier + .4 + random() * .2) / tiers;
      const stemY = stemBottom - t * (stemBottom - stemTop) * .95;
      const stemX = cx - size * .025 * t;
      const reach = size * (.32 + random() * .045) * Math.sin(Math.PI * (.08 + t * .86));
      const rise = size * (.07 + t * .045 + random() * .025);
      const bx = stemX + side * reach, by = stemY - rise;
      stroke(stemX, stemY, bx, by, 1.6, leafColour(183 + random() * 15));
      const shoots = needle ? 10 : 8;
      for (let shoot = 0; shoot < shoots; shoot++) {
        const u = (shoot + .55) / shoots;
        const x = stemX + (bx - stemX) * u, y = stemY + (by - stemY) * u;
        for (const branchSide of [-1, 1]) {
          const direction = Math.atan2(-rise, side * reach) + branchSide * (.56 + random() * .22);
          const branchLength = size * (.050 + random() * .025) * (1.08 - u * .37);
          const tx = x + Math.cos(direction) * branchLength, ty = y + Math.sin(direction) * branchLength;
          stroke(x, y, tx, ty, needle ? .8 : 1.15, leafColour(184 + random() * 17));
          const leaves = needle ? 6 : 5;
          for (let leaf = 0; leaf < leaves; leaf++) {
            const f = (leaf + .35) / leaves;
            const lx = x + (tx - x) * f, ly = y + (ty - y) * f;
            const leafLength = size * (needle ? .024 : .015) * (.75 + random() * .4);
            const shade = 190 + random() * 25;
            for (const k of [-1, 1]) blade(lx, ly, direction + k * (needle ? 1.0 : .62),
              leafLength * (1 - f * .25), needle ? .72 : 1.25, shade);
          }
          blade(tx,ty,direction,size*.015,needle?.7:1.3,202+random()*13);
        }
      }
    }
    for (let i = 0; i < 9; i++) {
      const y = stemTop + size * .10 - i * size * .011, length = size * (.03 - i * .0022);
      for (const side of [-1, 1]) blade(cx - size * .025, y,
        -Math.PI / 2 + side * .48, length, needle ? .8 : 1.2, 202 + random() * 13);
    }
    // Transparent padding prevents another atlas tile leaking into mip edges.
    for (let y = 0; y < size; y++) for (let x = size; x < size + 10; x++) pixels[(y * width + x) * 4 + 3] = 0;
    atlasPixels.set(family, pixels);
  }
  const texture = new THREE.DataTexture(atlasPixels.get(family), 1024, 512, THREE.RGBAFormat);
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
  // A clipped hedge carries branch tips over its full width almost to the top.
  // Individual rounded, full-height columns would produce an artificial picket
  // silhouette. The small tapered tip region and variation are specimen-local.
  const shoulder = .895 + variant * .011;
  const profile = y => y < .075 ? .76 + y * 2.3 : y < shoulder ? .94 :
    Math.max(.025, .94 * ((1 - y) / (1 - shoulder)) ** .55);
  const limitPoint = p => {
    const y = clamp(p[1],.003,.999), radius = Math.hypot(p[0],p[2]);
    const maxR = Math.min(.999,profile(y) + .025);
    const scale = Math.min(1,maxR / Math.max(radius,.0001));
    return [p[0] * scale,y,p[2] * scale];
  };
  const vertex = (p, normal, uv, shade) => {
    positions.push(...p); normals.push(...normal); uvs.push(...uv);
    colors.push(shade * .98, shade, shade * .94);
  };
  const triangle = (points, ns, tex, shades) => points.forEach((p, i) => vertex(p, ns[i], tex[i], shades[i]));
  // A narrow, rough core sits behind several layers of foliage. It never owns
  // the broad outer face, and cannot turn the hedge into a row of smooth tubes.
  const corePoint = (y,a) => {
    const irregular = .33 + .065 * Math.sin(a * 5 + y * 41 + phase) + .05 * Math.cos(a * 9 - y * 29);
    const r = profile(y) * irregular;
    return [Math.cos(a) * r,y,Math.sin(a) * r];
  };
  const rings = 10, sides = 10;
  for (let row=0;row<rings;row++)for(let side=0;side<sides;side++){
    const y0=.006+row/rings*.981,y1=.006+(row+1)/rings*.981;
    const a0=side/sides*TAU,a1=(side+1)/sides*TAU;
    const ps=[corePoint(y0,a0),corePoint(y0,a1),corePoint(y1,a1),corePoint(y1,a0)];
    const ns=[a0,a1,a1,a0].map(a=>[Math.cos(a),.14,Math.sin(a)]);
    const shade=.82+random()*.08, tex=[[.006,.03],[.492,.03],[.492,.96],[.006,.96]];
    for(const indices of [[0,2,1],[0,3,2]])triangle(indices.map(i=>ps[i]),indices.map(i=>ns[i]),indices.map(i=>tex[i]),indices.map(()=>shade));
  }
  // Each compound branch is folded along its spine. Two differently oriented
  // halves catch different light and reveal fine needle edges when seen obliquely.
  const levels = Math.max(12,Math.min(48,Math.round(heightBand/.19)));
  let sprays = 0;
  for (let tier=0;tier<levels;tier++) {
    const nominalY=.015+tier/Math.max(1,levels-1)*.96;
    const count=nominalY>.92?7:12;
    for(let layer=0;layer<2;layer++)for(let twig=0;twig<count;twig++){
      const y=clamp(nominalY+(random()-.5)*.13/heightBand,.005,.975);
      const a=phase+tier*2.399963+twig/count*TAU+layer*.31+(random()-.5)*.23;
      const radial=[Math.cos(a),0,Math.sin(a)],tangent=[-Math.sin(a),0,Math.cos(a)];
      const radialStart=(layer===0?.38:.68)*profile(y)+random()*.045;
      const center=[radial[0]*radialStart,y,radial[2]*radialStart];
      const w=(.48+random()*.24)*Math.max(.32,profile(y));
      const h=(.30+random()*.17)/heightBand;
      const reach=(layer===0?.34:.24)*(1-y*.15);
      const twist=(random()-.5)*.31;
      const shade=.84+random()*.16;
      const ps=[[-.5,0],[0,0],[.5,0],[-.5,1],[0,1],[.5,1]].map(([u,v])=>{
        const along=v*reach,fold=(1-Math.abs(u)*2)*(.035+v*.035);
        return limitPoint([center[0]+tangent[0]*(u*w+v*twist)+radial[0]*(along+fold),
          center[1]+v*h+(u*twist*.12/heightBand),
          center[2]+tangent[2]*(u*w+v*twist)+radial[2]*(along+fold)]);
      });
      const tex=[[.510,.985],[.750,.985],[.990,.985],[.510,.015],[.750,.015],[.990,.015]];
      for(const sourceIndices of [[0,4,1],[0,3,4],[1,5,2],[1,4,5]]){
        const indices=[...sourceIndices];
        const a=new THREE.Vector3(...ps[indices[0]]),b=new THREE.Vector3(...ps[indices[1]]),c=new THREE.Vector3(...ps[indices[2]]);
        const face=new THREE.Vector3().crossVectors(b.sub(a),c.sub(a));
        // Tangent × upward points inward. Use outward winding and normals
        // derived after envelope clipping; a supplied opposite normal is
        // flipped inward again by DoubleSide when viewed from outside.
        // Clipping the tip can reverse a small folded triangle, so orient
        // those triangles individually rather than assuming a flat quad.
        if(face.x*radial[0]+face.z*radial[2]<0){[indices[1],indices[2]]=[indices[2],indices[1]];face.negate();}
        const normal=face.normalize().toArray();
        triangle(indices.map(i=>ps[i]),indices.map(()=>normal),indices.map(i=>tex[i]),indices.map(i=>shade+(i>2?.025:0)));
      }
      sprays++;
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  geometry.userData.sprayCount=sprays;
  geometry.userData.recessedCoreRadius=.445;
  return geometry;
}

// Prune only the outside of a hedge specimen. Slice triangles at the local
// plane instead of flattening whole sprays into an opaque rectangular face.
// A small family of quantised cuts keeps the existing instance batching.
function clippedHedgeSpecimen(source, limit) {
  if (limit === null) return source;
  const names = Object.keys(source.attributes), values = Object.fromEntries(names.map(name => [name, []]));
  const point = index => Object.fromEntries(names.map(name => {
    const attribute = source.attributes[name];
    return [name, Array.from({length:attribute.itemSize}, (_, axis) => attribute.array[index * attribute.itemSize + axis])];
  }));
  const mix = (a,b,t) => Object.fromEntries(names.map(name => [name,a[name].map((v,i) => v + (b[name][i] - v) * t)]));
  const emit = vertex => names.forEach(name => values[name].push(...vertex[name]));
  for (let i = 0; i < source.attributes.position.count; i += 3) {
    const input = [point(i),point(i+1),point(i+2)], output = [];
    for (let j = 0; j < 3; j++) {
      const a=input[j],b=input[(j+1)%3],insideA=a.position[2]>=limit,insideB=b.position[2]>=limit;
      if (insideA) output.push(a);
      if (insideA !== insideB) output.push(mix(a,b,(limit-a.position[2])/(b.position[2]-a.position[2])));
    }
    for (let j = 1; j < output.length - 1; j++) [output[0],output[j],output[j+1]].forEach(emit);
  }
  const geometry = new THREE.BufferGeometry();
  names.forEach(name => geometry.setAttribute(name,new THREE.Float32BufferAttribute(values[name],source.attributes[name].itemSize)));
  geometry.userData={...source.userData,outwardTrim:limit};
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return geometry;
}

function fenceTrimPlanes(fence) {
  if (!fence?.enabled) return [];
  // Include pier caps and the parked sliding leaves, which sit slightly
  // farther inward than the fixed infill. Gate gaps themselves stay untouched.
  const clearance=Math.max(.075,(fence.style?.pier||.15)/2+.009)+.025;
  const inward=({a,b})=>{const length=Math.hypot(b[0]-a[0],b[1]-a[1]);return[-(b[1]-a[1])/length,(b[0]-a[0])/length];};
  return [...fence.segments.map(s=>({...s,inward:inward(s),clearance})),
    ...fence.gates.flatMap(g=>g.leaves.map(leaf=>({...leaf,inward:inward(g),clearance:.075})))];
}

function outwardTrimFor(planes,x,y,tx,ty,along,depth) {
  let cut=-Infinity;
  for (const {a,b,inward,clearance} of planes) {
    const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
    if (length<1e-6||-ty*inward[0]+tx*inward[1]<.999999||Math.abs((dx*tx+dy*ty)/length)<.999999) continue;
    const start=(a[0]-x)*tx+(a[1]-y)*ty,end=(b[0]-x)*tx+(b[1]-y)*ty;
    if (Math.min(start,end)>along||Math.max(start,end)<-along) continue;
    cut=Math.max(cut,(-(a[0]-x)*ty+(a[1]-y)*tx+clearance)/depth);
  }
  // At most sixteen cut depths per height/shape, with <=6 cm extra pruning.
  // No cut means the original vertex data is used unchanged.
  return cut<=-1?null:Math.min(1,Math.ceil(cut*8)/8);
}

export function createHedgeVegetation(segments, {
  groundAt, topAt, spacing = .65, material, svgMode = false, fence = null,
} = {}) {
  const group = new THREE.Group();
  group.name = 'botanical-hedges';
  group.userData.analyticalScreen = false;
  group.userData.originalProceduralAsset = true;
  if (svgMode || !material || !groundAt || !topAt) return group;
  const buckets = new Map(), trimPlanes = fenceTrimPlanes(fence);
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
      const topVariation = .974 + .026 * Math.sin((i + 1) * 1.754 + a[0] * .41 + a[1] * .23) ** 2;
      const widthVariation = .94 + .06 * Math.sin((i + 1) * 2.14 + a[0] * .28) ** 2;
      const trim=outwardTrimFor(trimPlanes,x,y,tx,ty,along*widthVariation,radius*.88*widthVariation);
      const key = `${band}:${variant}:${trim}`, bucket = buckets.get(key) || {band, variant, trim, plants: []};
      buckets.set(key, bucket);
      const matrix = new THREE.Matrix4().makeBasis(new THREE.Vector3(tx, 0, ty), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-ty, 0, tx));
      matrix.scale(new THREE.Vector3(along * widthVariation, h * topVariation, radius * .88 * widthVariation)); matrix.setPosition(x, ground, y);
      bucket.plants.push({matrix, shade: .90 + .09 * Math.sin((i + 1) * 2.399963 + a[0] * .7 + a[1] * .4) ** 2});
      count++;
    }
  }
  if (!count) return group;
  const foliageMaterial = createFoliageMaterial(material, 'thuja');
  foliageMaterial.color.set('#87986b');
  const specimens=new Map(), originalsUsed=new Set();
  for (const {band, variant, trim, plants} of buckets.values()) {
    const key=`${band}:${variant}`;
    if(!specimens.has(key))specimens.set(key,hedgeSpecimen(variant,band));
    const source=specimens.get(key),clipped=clippedHedgeSpecimen(source,trim);
    const geometry=indexExactFoliageGeometry(clipped);
    // Keep the canonical expanded source until every trim variant exists.
    // Indexing returns a separate geometry and never changes clipper input.
    if(geometry===source)originalsUsed.add(source);
    else if(clipped!==source&&geometry!==clipped)clipped.dispose();
    const mesh = new THREE.InstancedMesh(geometry, foliageMaterial, plants.length);
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
  for(const source of specimens.values())if(!originalsUsed.has(source))source.dispose();
  group.userData.plantCount = count;
  group.userData.drawCalls = buckets.size;
  group.userData.fenceTrimmed = trimPlanes.length > 0;
  return group;
}
