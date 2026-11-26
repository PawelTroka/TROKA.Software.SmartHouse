import * as THREE from '../vendor/three.module.js';
import {toWorld} from './orientation.js?v=1.36.0';
import {createFoliageMaterial} from './scene-vegetation.js?v=1.36.0';

const point = (x, y, z) => new THREE.Vector3(...toWorld(x, y, z));

const TAU = Math.PI * 2;
function specimenRandom(id) {
  let seed = 2166136261;
  for (const letter of String(id)) seed = Math.imul(seed ^ letter.charCodeAt(0), 16777619) >>> 0;
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

// Merge the botanical detail into one foliage and one branch draw call. Positions
// remain crown-local until the completed mesh receives the specimen's rotation.
function geometryCollector(withColors = false, botanicalAtlas = false) {
  const positions = [], uvs = [], colors = [], indices = [];
  return {
    append(geometry, transform, tint, spray = false) {
      const p = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
      const offset = positions.length / 3;
      for (let i = 0; i < p.count; i++) {
        const original = [p.getX(i), p.getY(i), p.getZ(i)];
        positions.push(...transform(original));
        const u = uv?.getX(i) || 0, v = uv?.getY(i) || 0;
        uvs.push(botanicalAtlas ? (spray ? .510 + .480 * u : .006 + .486 * u) : u,
          botanicalAtlas ? (spray ? .985 - .970 * v : .03 + .93 * v) : v);
        if (withColors) colors.push(...tint(original));
      }
      if (geometry.index) for (const index of geometry.index.array) indices.push(offset + index);
      else for (let i = 0; i < p.count; i++) indices.push(offset + i);
    },
    finish() {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      if (withColors) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return geometry;
    },
  };
}

// Small curved compound fronds add needle-scale silhouette to every crown pad.
// The same material atlas shades the recessed mass and cuts out these sprays,
// keeping hundreds of twigs in one draw call rather than one mesh per leaf.
const sprayPlane = new THREE.PlaneGeometry(1, 1, 1, 2);
function leafSpray(collector, center, width, length, angle, inclination, project, shade) {
  const c = Math.cos(angle), s = Math.sin(angle), ci = Math.cos(inclination), si = Math.sin(inclination);
  collector.append(sprayPlane, ([x, y]) => {
    const along = y + .5, bend = Math.sin(along * Math.PI) * width * .12;
    return project([
      center[0] - s * x * width + c * (along * length * ci + bend),
      center[1] + along * length * si,
      center[2] + c * x * width + s * (along * length * ci + bend),
    ]);
  }, ([, y]) => {
    const tone = shade + .055 * (y + .5);
    return [tone * .96, tone, tone * .89];
  }, true);
}

/** The analytical crown remains an ideal, dense volume. Its unpainted mesh
 * casts the same ideal shadow as before; botanical detail never enlarges it. */
function shadowEnvelope(geometry, name, valid, svgMode) {
  // A closed volume's back faces keep its ground shadow while avoiding a dark
  // shell over the botanical meshes located just inside its front surface.
  const material = new THREE.MeshBasicMaterial({colorWrite: false, depthWrite: false, shadowSide: THREE.BackSide});
  material.userData.transient = true;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.userData.analyticalEnvelope = true;
  mesh.castShadow = valid;
  mesh.visible = !svgMode;
  return mesh;
}

function addPine(group, v, materials, svgMode, valid) {
  const height = v.crownTopZ - v.crownBottomZ;
  const radii = [v.crownWidth / 2, height / 2, v.crownDepth / 2];
  const centreZ = (v.crownBottomZ + v.crownTopZ) / 2;
  const random = specimenRandom(v.id), phase = random() * TAU;
  const frame = new THREE.Group();
  frame.name = 'pine-botanical-crown';
  frame.position.copy(point(v.x, v.y, centreZ));
  frame.rotation.y = -(v.rotation || 0) * Math.PI / 180;
  group.add(frame);

  // Clip vertices, not merely cluster centres. Thus a narrow, rotated or edited
  // crown cannot acquire extra visible screening outside its measured envelope.
  const inside = ([x, y, z]) => {
    const length = Math.hypot(x / radii[0], y / radii[1], z / radii[2]);
    const scale = length > .9995 ? .9995 / length : 1;
    return [x * scale, y * scale, z * scale];
  };
  const branches = geometryCollector();
  const branch = (start, end, radius, tipRadius = radius * .28) => {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
    const direction = b.clone().sub(a), length = direction.length();
    if (length < .01) return;
    const geometry = new THREE.CylinderGeometry(tipRadius, radius, length, svgMode ? 4 : 6, 1);
    const uv = geometry.getAttribute('uv');
    // Metres on the photographed two-metre bark scan. Cylinder UVs must stay
    // wrapped around the branch instead of later planar material projection.
    for (let i = 0; i < uv.count; i++) uv.setXY(i,uv.getX(i)*TAU*radius,uv.getY(i)*length);
    const matrix = new THREE.Matrix4().compose(a.add(b).multiplyScalar(.5),
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()), new THREE.Vector3(1, 1, 1));
    geometry.applyMatrix4(matrix);
    branches.append(geometry, inside);
    geometry.dispose();
  };
  const foliage = geometryCollector(true, !svgMode);
  const pad = new THREE.SphereGeometry(1, svgMode ? 6 : 10, svgMode ? 4 : 7);
  const needleTip = new THREE.SphereGeometry(1, 6, 4);
  let padCount = 0;
  const addPad = (center, size, angle, shade, tip = false) => {
    if (!v.foliageActive) return;
    padCount++;
    const cos = Math.cos(angle), sin = Math.sin(angle), detail = random() * 20;
    foliage.append(tip ? needleTip : pad, ([x, y, z]) => {
      // Deep inward notches and upturned, flattened branch fans interrupt the
      // smooth ball silhouette. Small tip fans replace each rounded outer pad.
      const ruffle = (svgMode ? .76 : .43) + .13 * Math.sin(x * 10 + y * 4 + detail) * Math.cos(z * 9 - y * 6)
        + .09 * Math.sin(z * 17 + x * 13 + detail);
      const u = x * size[0] * ruffle, w = z * size[2] * ruffle;
      return inside([(center[0] + u * cos - w * sin) * radii[0],
        (center[1] + ((y < 0 ? y * .68 : y * .85) + x * .24) * size[1] * ruffle) * radii[1],
        (center[2] + u * sin + w * cos) * radii[2]]);
    }, ([, y]) => {
      const tone = shade + .11 * (y * .5 + .5);
      return [tone * .96, tone, tone * .89];
    });
    if (!svgMode && valid) {
      const project = ([x, y, z]) => inside([x * radii[0], y * radii[1], z * radii[2]]);
      const sprays = tip ? 7 : 12;
      for (let twig = 0; twig < sprays; twig++) {
        const az = angle + twig / sprays * TAU + (random() - .5) * .22;
        const start = [center[0] + Math.cos(az) * size[0] * .28,
          center[1] + (random() - .5) * size[1] * .24,
          center[2] + Math.sin(az) * size[2] * .28];
        const reach = Math.max(size[0], size[2]) * (.72 + random() * .22);
        leafSpray(foliage, start, reach * .72, reach, az, .08 + random() * .36, project, shade + .05);
      }
    }
  };
  const levels = svgMode ? 6 : 9;
  for (let level = 0; level < levels; level++) {
    const y = -.86 + level / (levels - 1) * 1.72 + Math.sin(phase + level * 1.8) * .022;
    const reach = Math.sqrt(1 - y * y);
    const count = svgMode ? 6 : 8 + level % 2;
    const layerPhase = phase + level * 2.399963;
    // The central pads overlap the surrounding branch pads. Realistic needles
    // and stepped edges remain visible, with a dense interior suitable for a screen.
    addPad([Math.cos(layerPhase) * .04, y, Math.sin(layerPhase) * .04],
      [reach * .58, svgMode ? .27 : .23, reach * .58], layerPhase, .70 + random() * .09);
    for (let i = 0; i < count; i++) {
      const az = layerPhase + i * TAU / count + (random() - .5) * .19;
      const cos = Math.cos(az), sin = Math.sin(az);
      const reachFraction = .56 + random() * .16;
      const yJitter = (random() - .5) * .15;
      const center = [cos * reach * reachFraction, y + yJitter, sin * reach * reachFraction];
      const baseY = Math.max(-.96, y - .13);
      const joint = [cos * reach * .40 * radii[0], (y - .045) * radii[1], sin * reach * .40 * radii[2]];
      const end = [cos * reach * .87 * radii[0], (y + .035) * radii[1], sin * reach * .87 * radii[2]];
      const radius = Math.max(.012, (v.trunkRadius || .12) * (.27 - level / levels * .13));
      branch([0, baseY * radii[1], 0], joint, radius, radius * .64);
      branch(joint, end, radius * .64);
      addPad(center, [reach * (.44 + random() * .09), svgMode ? .21 : .12 + random() * .04, reach * (.27 + random() * .11)],
        az, .78 + random() * .13);
      if (!svgMode) {
        const fork = az + (i % 2 ? 1 : -1) * .35;
        const forkEnd = [Math.cos(fork) * reach * .85 * radii[0], (y + .08) * radii[1], Math.sin(fork) * reach * .85 * radii[2]];
        branch(joint, forkEnd, radius * .42);
        for(let shoot=0;shoot<3;shoot++){
          const tipAngle=fork+(shoot-1)*.17+(random()-.5)*.12;
          const tipReach=reach*(.79+random()*.13),tipY=y+yJitter+.045+(random()-.5)*.09;
          addPad([Math.cos(tipAngle)*tipReach,tipY,Math.sin(tipAngle)*tipReach],
            [reach*(.14+random()*.035),.065+random()*.035,reach*.115],tipAngle,.83+random()*.12,true);
        }
      }
    }
  }
  // Short, upright terminal growth avoids a flat cut at the top of the tree.
  addPad([0, .95, 0], [.22, .09, .22], phase, .92);
  addPad([0, -.95, 0], [.22, .075, .22], phase + 1, .80);
  pad.dispose();
  needleTip.dispose();
  const crownStemBottom = Math.max(-radii[1] * .94, (v.trunkTopZ ?? centreZ) - centreZ);
  branch([0, crownStemBottom, 0], [0, radii[1] * .94, 0], (v.trunkRadius || .12) * .44, .018);
  const branchMesh = new THREE.Mesh(branches.finish(), materials.bark);
  branchMesh.name = 'pine-branches';
  branchMesh.receiveShadow = true;
  branchMesh.userData.withinCrownEnvelope = true;
  frame.add(branchMesh);

  if (v.foliageActive) {
    const material = valid && !svgMode ? createFoliageMaterial(materials.pine, 'pine') : valid ? materials.pine : materials.ghost;
    const mesh = new THREE.Mesh(foliage.finish(), material);
    mesh.name = 'pine-needle-pads';
    mesh.receiveShadow = true;
    mesh.userData.withinCrownEnvelope = true;
    mesh.userData.padCount = padCount;
    mesh.userData.contactShading = false;
    frame.add(mesh);
    const envelopeGeometry = new THREE.SphereGeometry(1, svgMode ? 12 : 28, svgMode ? 8 : 18);
    envelopeGeometry.scale(...radii);
    const envelope = shadowEnvelope(envelopeGeometry, 'crown-envelope', valid, svgMode);
    frame.add(envelope);
  }

  const trunkTop = v.trunkTopZ ?? v.crownBottomZ + height * .48;
  const trunkHeight = trunkTop - v.groundZ, radius = v.trunkRadius || .12;
  const trunkGeometry = new THREE.CylinderGeometry(radius * .44, radius * .96, trunkHeight, svgMode ? 7 : 24, svgMode ? 3 : 18);
  const trunkPositions = trunkGeometry.getAttribute('position'), trunkUvs = trunkGeometry.getAttribute('uv');
  for (let i = 0; i < trunkPositions.count; i++) {
    const x = trunkPositions.getX(i), y = trunkPositions.getY(i), z = trunkPositions.getZ(i);
    const t=(y+trunkHeight/2)/trunkHeight,angle=Math.atan2(z,x);
    const furrow=.92+.035*Math.sin(angle*7+y*.8+phase)+.025*Math.sin(angle*13-y*1.7+phase);
    // Very gentle specimen-specific curvature and buttress ridges avoid the
    // straight furniture-pole trunk; all vertices remain in the same radius.
    const bend=Math.sin(t*Math.PI)*radius*.045;
    trunkPositions.setXYZ(i,x*furrow+Math.cos(phase)*bend,y,z*furrow+Math.sin(phase)*bend);
    trunkUvs.setXY(i,trunkUvs.getX(i)*TAU*radius,trunkUvs.getY(i)*trunkHeight);
  }
  trunkGeometry.computeVertexNormals();
  const trunk = new THREE.Mesh(trunkGeometry, materials.bark);
  trunk.name = 'pine-tapered-trunk';
  trunk.position.copy(point(v.x, v.y, v.groundZ + trunkHeight / 2));
  trunk.receiveShadow = true;
  group.add(trunk);
  const trunkEnvelope = shadowEnvelope(new THREE.CylinderGeometry(radius, radius, trunkHeight, svgMode ? 5 : 8), 'trunk-envelope', valid, svgMode);
  trunkEnvelope.position.copy(trunk.position);
  group.add(trunkEnvelope);
}

function coniferFamily(v) {
  if (['thuja', 'fir', 'spruce'].includes(v.type?.visualFamily)) return v.type.visualFamily;
  const name = v.type?.botanicalName || v.typeId || '';
  return /thuja/i.test(name) ? 'thuja' : /abies|fir/i.test(name) ? 'fir' : 'spruce';
}

/** Botanical fans decorate the SAME finite cone used by visibility and solar
 * rays. Horizontal fir tiers, hanging spruce sprays and upright thuja fans
 * remain illustrative: neither detail nor colour adds analytical opacity. */
function addConifer(group, v, materials, svgMode, valid) {
  const family = coniferFamily(v), height = v.crownTopZ - v.crownBottomZ;
  const rx = v.crownWidth / 2, rz = v.crownDepth / 2;
  const random = specimenRandom(`${v.id}:${family}`), phase = random() * TAU;
  const frame = new THREE.Group();
  frame.name = `${family}-botanical-crown`;
  frame.position.copy(point(v.x, v.y, v.crownBottomZ));
  frame.rotation.y = -(v.rotation || 0) * Math.PI / 180;
  frame.userData.visualFamily = family;
  group.userData.visualFamily = family;
  group.add(frame);

  // Clip actual vertices, including branch thickness, to the rotated elliptical
  // cone. Checking just fan centres can falsely enlarge a narrow edited tree.
  const inside = ([x, y, z]) => {
    const clippedY = Math.max(0, Math.min(height * .9998, y));
    const reach = Math.max(0, 1 - clippedY / height) * .9995;
    const radial = Math.hypot(x / rx, z / rz);
    const scale = radial > reach ? reach / radial : 1;
    return [x * scale, clippedY, z * scale];
  };
  const branches = geometryCollector(), foliage = geometryCollector(true, !svgMode);
  const branch = (start, end, radius) => {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
    const direction = b.clone().sub(a), length = direction.length();
    if (length < .01) return;
    const geometry = new THREE.CylinderGeometry(radius * .08, radius, length, svgMode ? 4 : 5);
    geometry.applyMatrix4(new THREE.Matrix4().compose(a.add(b).multiplyScalar(.5),
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()), new THREE.Vector3(1, 1, 1)));
    branches.append(geometry, inside);
    geometry.dispose();
  };
  const fan = new THREE.SphereGeometry(1, svgMode ? 5 : 6, 3);
  let fanCount = 0;
  const addFan = (center, size, angle, shade, sweep = 0) => {
    if (!v.foliageActive) return;
    fanCount++;
    const c = Math.cos(angle), s = Math.sin(angle), texturePhase = random() * TAU;
    foliage.append(fan, ([x, y, z]) => {
      const edge = (svgMode ? .83 : .41) + .10 * Math.sin(x * 12 + z * 8 + texturePhase)
        + .06 * Math.cos(y * 15 - z * 11 + texturePhase);
      const u = x * size[0] * edge, w = z * size[2] * edge;
      return inside([center[0] + u * c - w * s,
        center[1] + (y * size[1] + x * sweep) * edge,
        center[2] + u * s + w * c]);
    }, ([x, y]) => {
      const tone = shade + .12 * (y * .5 + .5) + .025 * x;
      return [tone * .96, tone, tone * (family === 'thuja' ? .86 : 1.03)];
    });
    if (!svgMode && valid) for (let twig = 0; twig < 6; twig++) {
      const az = angle + (twig - 2.5) * .43 + (random() - .5) * .18;
      const start = [center[0] + Math.cos(az) * size[0] * .24,
        center[1] - size[1] * .16, center[2] + Math.sin(az) * size[2] * .24];
      const length = family === 'thuja' ? Math.max(size[1] * 1.8, Math.min(size[0], size[2]) * .92)
        : Math.max(size[0], size[2]) * .95;
      const width = family === 'thuja' ? Math.min(size[0], size[2]) * .92 : length * .55;
      const incline = family === 'thuja' ? 1.02 + random() * .30 : family === 'fir' ? .12 + random() * .22 : -.14 + random() * .20;
      leafSpray(foliage, start, width, length, az, incline, inside, shade + .04);
    }
  };

  if (v.foliageActive) {
    // The recessed core stops holes through the middle without painting the
    // outer cone. All exposed edges come from individual botanical fans.
    const core = new THREE.ConeGeometry(1, height, svgMode ? 8 : 16, svgMode ? 6 : 18);
    foliage.append(core, ([x, y, z]) => {
      const altitude = y + height / 2;
      const angle = Math.atan2(z, x);
      const ruffle = .31 + .055 * Math.sin(altitude / height * 53 + angle * 3 + phase);
      return inside([x * rx * ruffle, altitude, z * rz * ruffle]);
    }, ([, y]) => {
      const tone = .57 + .12 * (y / height + .5);
      return [tone * .96, tone, tone];
    });
    core.dispose();
  }
  const levels = svgMode ? (family === 'thuja' ? 8 : 7) : family === 'thuja' ?
    Math.max(18,Math.min(28,Math.ceil(height/.35))) : family === 'fir' ?
      Math.max(15,Math.min(22,Math.ceil(height/.42))) : Math.max(18,Math.min(22,Math.ceil(height/.39)));
  for (let level = 0; level < levels; level++) {
    const fraction = .025 + level / (levels - 1) * .925;
    const reach = 1 - fraction, levelY = fraction * height;
    const count = svgMode ? 5 : family === 'thuja' ? 9 : 8;
    const layerPhase = phase + level * (family === 'fir' ? 1.0472 : 2.399963);
    for (let i = 0; i < count; i++) {
      const az = layerPhase + i * TAU / count + (random() - .5) * .13;
      const c = Math.cos(az), s = Math.sin(az);
      const radial = reach * (.60 + random() * .07);
      const jitter = (random() - .5) * height / levels * .42;
      const branchY = levelY + jitter;
      const center = [c * rx * radial, branchY, s * rz * radial];
      const base = [0, branchY + (family === 'spruce' ? .025 : -.012) * height, 0];
      const tipY = branchY + (family === 'spruce' ? -.018 : .008) * height;
      // Woody structure ends inside the fine outer sprays. Extending thick
      // cylinders to the crown edge leaves a row of exposed cut branch ends.
      // Shared per-branch variation keeps wood and foliage together and avoids
      // perfectly horizontal rings; the unchanged inside() clips every vertex.
      const tip = [c * rx * reach * .80, tipY, s * rz * reach * .80];
      branch(base, tip, Math.max(.009, (v.trunkRadius || .12) * reach * .16));
      const shade = .73 + random() * .18;
      if (family === 'thuja') {
        // Upright overlapping scale-leaf sprays, without the horizontal skirts
        // of spruce/fir. A second small outer fan gives the feathered edge.
        addFan(center, [rx * reach * .34, height / levels * .76, rz * reach * .24], az, shade, height / levels * .24);
        if (!svgMode) addFan([c * rx * reach * .85, branchY + height / levels * .17, s * rz * reach * .85],
          [rx * reach * .15, height / levels * .43, rz * reach * .12], az + .16, shade + .03, height / levels * .20);
      } else {
        // Fir branches form broad flat combs; spruce carries thinner hanging
        // sprays. Both have visible tiered edges and a single pointed leader.
        const thickness = height / levels * (family === 'fir' ? .24 : .32);
        const sweep = height / levels * (family === 'fir' ? .12 : -.35);
        addFan(center, [rx * reach * .48, thickness, rz * reach * (family === 'fir' ? .31 : .22)], az, shade, sweep);
        if (!svgMode) for (const side of [-1, 1]) {
          const tipAngle = az + side * (family === 'fir' ? .18 : .24);
          addFan([Math.cos(tipAngle) * rx * reach * .83, tipY, Math.sin(tipAngle) * rz * reach * .83],
            [rx * reach * .18, thickness * .65, rz * reach * .105], tipAngle, shade + .04, sweep * .45);
        }
      }
    }
  }
  addFan([0, height * .975, 0], [rx * .06, height * .025, rz * .06], phase, .93);
  fan.dispose();
  branch([0, 0, 0], [0, height * .992, 0], (v.trunkRadius || .12) * .45);
  const branchMesh = new THREE.Mesh(branches.finish(), materials.bark);
  branchMesh.name = 'conifer-branches';
  branchMesh.receiveShadow = true;
  branchMesh.userData.withinCrownEnvelope = true;
  frame.add(branchMesh);

  if (v.foliageActive) {
    const material = valid ? (!svgMode ? createFoliageMaterial(materials.spruce, family) : materials.spruce.clone()) : materials.ghost;
    if (valid) {
      material.color.set(v.type?.foliageColor ?? {thuja: 0x527447, fir: 0x4f705a, spruce: 0x3d6453}[family]);
      material.userData.transient = true;
    }
    const mesh = new THREE.Mesh(foliage.finish(), material);
    mesh.name = 'conifer-foliage-fans';
    mesh.receiveShadow = true;
    mesh.userData.withinCrownEnvelope = true;
    mesh.userData.fanCount = fanCount;
    mesh.userData.visualFamily = family;
    mesh.userData.contactShading = false;
    frame.add(mesh);
    const envelopeGeometry = new THREE.ConeGeometry(1, height, svgMode ? 12 : 24, 1);
    envelopeGeometry.scale(rx, 1, rz);
    envelopeGeometry.translate(0, height / 2, 0);
    frame.add(shadowEnvelope(envelopeGeometry, 'crown-envelope', valid, svgMode));
  }

  const trunkHeight = (v.trunkTopZ ?? v.crownBottomZ + height * .48) - v.groundZ;
  const radius = v.trunkRadius || .12;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(radius * .3, radius * .94, trunkHeight, svgMode ? 6 : 10), materials.bark);
  trunk.name = 'conifer-tapered-trunk';
  trunk.position.copy(point(v.x, v.y, v.groundZ + trunkHeight / 2));
  trunk.receiveShadow = true;
  group.add(trunk);
  const trunkEnvelope = shadowEnvelope(new THREE.CylinderGeometry(radius, radius, trunkHeight, svgMode ? 6 : 10), 'trunk-envelope', valid, svgMode);
  trunkEnvelope.position.copy(trunk.position);
  group.add(trunkEnvelope);
}

/** A measured envelope, with visible clear stem. Never stretch a full-height
 * foliage mesh over the clear space below a specimen's crown. */
export function createScreeningTreeGroup(v, materials, svgMode = false) {
  const group = new THREE.Group();
  group.name = `screening-tree-${v.id}`;
  group.userData.treeId = v.id;
  const valid = v.plantable !== false && v.enabled !== false;
  if (v.form === 'ellipsoid' && v.evergreen) {
    addPine(group, v, materials, svgMode, valid);
    return group;
  }
  if (v.form === 'cone' && v.evergreen) {
    addConifer(group, v, materials, svgMode, valid);
    return group;
  }
  const h = v.crownTopZ - v.crownBottomZ;
  const rotation = -(v.rotation || 0) * Math.PI / 180;
  const addBranch = (start, end, radius, numericTrunk = false) => {
    const a = point(...start), b = point(...end), delta = b.clone().sub(a);
    if (delta.length() < .01) return;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(numericTrunk ? radius : radius * .6, radius, delta.length(), svgMode ? 5 : 8), materials.bark);
    mesh.position.copy(a.add(b).multiplyScalar(.5));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    mesh.castShadow = valid && numericTrunk;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  const trunkTop = v.trunkTopZ ?? v.crownBottomZ + h * .48;
  addBranch([v.x, v.y, v.groundZ], [v.x, v.y, trunkTop], v.trunkRadius || .12, true);
  // Branches explain the support and winter silhouette. Their detailed shape
  // is illustrative; only the thin main trunk has numerical shade credit.
  const count = v.form === 'panel' ? 6 : svgMode ? 6 : 9;
  for (let i = 0; i < count; i++) {
    const az = (v.rotation || 0) * Math.PI / 180 + i * 2.399963;
    const fraction = .22 + (i % 3) * .23;
    const radial = v.form === 'cone' ? (1 - fraction) * .75 : .6;
    const panelOffset = (i % 2 ? 1 : -1) * v.crownWidth * .35;
    const x = v.form === 'panel' ? Math.cos(-rotation) * panelOffset : Math.cos(az) * v.crownWidth / 2 * radial;
    const y = v.form === 'panel' ? Math.sin(-rotation) * panelOffset : Math.sin(az) * v.crownDepth / 2 * radial;
    addBranch([v.x, v.y, Math.min(trunkTop, v.crownBottomZ + h * fraction * .65)], [v.x + x, v.y + y, v.crownBottomZ + h * fraction], Math.max(.022, (v.trunkRadius || .12) * .37));
  }
  if (v.foliageActive) {
    let geometry;
    if (v.form === 'panel') geometry = new THREE.BoxGeometry(v.crownWidth, h, v.crownDepth, 3, 3, 1);
    else if (v.form === 'cone') {
      geometry = new THREE.ConeGeometry(1, h, svgMode ? 10 : 24, svgMode ? 2 : 8);
      geometry.scale(v.crownWidth / 2, 1, v.crownDepth / 2);
    } else {
      geometry = new THREE.SphereGeometry(1, svgMode ? 12 : 28, svgMode ? 8 : 18);
      geometry.scale(v.crownWidth / 2, h / 2, v.crownDepth / 2);
    }
    // Colour variation gives a botanical texture without enlarging the crown
    // beyond the envelope used by privacy and sun calculations.
    const positions = geometry.getAttribute('position'), colors = [];
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      const tone = .78 + .22 * (Math.sin(x * 7.3 + y * 5.1) * Math.cos(z * 6.2 - y * 2.7) * .5 + .5);
      colors.push(tone, tone, tone);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const material = !valid ? materials.ghost : v.form === 'cone' ? materials.spruce : v.evergreen ? materials.pine : materials.deciduous;
    const crown = new THREE.Mesh(geometry, material);
    crown.name = 'crown-envelope';
    crown.position.copy(point(v.x, v.y, (v.crownTopZ + v.crownBottomZ) / 2));
    crown.rotation.y = rotation;
    crown.castShadow = valid;
    crown.receiveShadow = true;
    group.add(crown);
  }
  if (v.form === 'panel') {
    const c = Math.cos(-rotation), s = Math.sin(-rotation);
    for (const fraction of [.1, .5, .9]) {
      const z = v.crownBottomZ + h * fraction;
      addBranch([v.x - c * v.crownWidth / 2, v.y - s * v.crownWidth / 2, z], [v.x + c * v.crownWidth / 2, v.y + s * v.crownWidth / 2, z], .022);
    }
  }
  return group;
}
