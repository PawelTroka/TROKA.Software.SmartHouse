import * as THREE from '../vendor/three.module.js';
import {toWorld} from './orientation.js?v=1.14.0';

const point = (x, y, z) => new THREE.Vector3(...toWorld(x, y, z));

const TAU = Math.PI * 2;
function specimenRandom(id) {
  let seed = 2166136261;
  for (const letter of String(id)) seed = Math.imul(seed ^ letter.charCodeAt(0), 16777619) >>> 0;
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

// Merge the botanical detail into one foliage and one branch draw call. Positions
// remain crown-local until the completed mesh receives the specimen's rotation.
function geometryCollector(withColors = false) {
  const positions = [], uvs = [], colors = [], indices = [];
  return {
    append(geometry, transform, tint) {
      const p = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
      const offset = positions.length / 3;
      for (let i = 0; i < p.count; i++) {
        const original = [p.getX(i), p.getY(i), p.getZ(i)];
        positions.push(...transform(original));
        uvs.push(uv?.getX(i) || 0, uv?.getY(i) || 0);
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

/** The analytical crown remains an ideal, dense ellipsoid. Its unpainted mesh
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
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * Math.max(.3, length / 1.8));
    const matrix = new THREE.Matrix4().compose(a.add(b).multiplyScalar(.5),
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()), new THREE.Vector3(1, 1, 1));
    geometry.applyMatrix4(matrix);
    branches.append(geometry, inside);
    geometry.dispose();
  };
  const foliage = geometryCollector(true);
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
      const ruffle = .76 + .14 * Math.sin(x * 10 + y * 4 + detail) * Math.cos(z * 9 - y * 6)
        + .09 * Math.sin(z * 17 + x * 13 + detail);
      const u = x * size[0] * ruffle, w = z * size[2] * ruffle;
      return inside([(center[0] + u * cos - w * sin) * radii[0],
        (center[1] + ((y < 0 ? y * .68 : y * .85) + x * .24) * size[1] * ruffle) * radii[1],
        (center[2] + u * sin + w * cos) * radii[2]]);
    }, ([, y]) => {
      const tone = shade + .11 * (y * .5 + .5);
      return [tone * .96, tone, tone * .89];
    });
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
    const mesh = new THREE.Mesh(foliage.finish(), valid ? materials.pine : materials.ghost);
    mesh.name = 'pine-needle-pads';
    mesh.receiveShadow = true;
    mesh.userData.withinCrownEnvelope = true;
    mesh.userData.padCount = padCount;
    frame.add(mesh);
    const envelopeGeometry = new THREE.SphereGeometry(1, svgMode ? 12 : 28, svgMode ? 8 : 18);
    envelopeGeometry.scale(...radii);
    const envelope = shadowEnvelope(envelopeGeometry, 'crown-envelope', valid, svgMode);
    frame.add(envelope);
  }

  const trunkTop = v.trunkTopZ ?? v.crownBottomZ + height * .48;
  const trunkHeight = trunkTop - v.groundZ, radius = v.trunkRadius || .12;
  const trunkGeometry = new THREE.CylinderGeometry(radius * .44, radius * .96, trunkHeight, svgMode ? 7 : 12, svgMode ? 3 : 9);
  const trunkPositions = trunkGeometry.getAttribute('position'), trunkUvs = trunkGeometry.getAttribute('uv');
  for (let i = 0; i < trunkPositions.count; i++) {
    const x = trunkPositions.getX(i), y = trunkPositions.getY(i), z = trunkPositions.getZ(i);
    const furrow = .97 + .025 * Math.sin(Math.atan2(z, x) * 7 + y * .8 + phase);
    trunkPositions.setXYZ(i, x * furrow, y, z * furrow);
    trunkUvs.setY(i, trunkUvs.getY(i) * Math.max(1, trunkHeight / 1.8));
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
