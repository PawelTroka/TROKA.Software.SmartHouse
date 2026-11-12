import * as THREE from '../vendor/three.module.js';
import {toWorld} from './orientation.js?v=1.5.0';

const point = (x, y, z) => new THREE.Vector3(...toWorld(x, y, z));

/** A measured envelope, with visible clear stem. Never stretch a full-height
 * foliage mesh over the clear space below a specimen's crown. */
export function createScreeningTreeGroup(v, materials, svgMode = false) {
  const group = new THREE.Group();
  group.name = `screening-tree-${v.id}`;
  group.userData.treeId = v.id;
  const valid = v.plantable !== false && v.enabled !== false;
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
