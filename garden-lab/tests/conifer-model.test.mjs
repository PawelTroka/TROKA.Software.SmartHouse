import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createScreeningTreeGroup} from '../src/scene-trees.js';

const material = new THREE.MeshBasicMaterial({vertexColors: true});
const materials = {bark: material, pine: material, spruce: material, deciduous: material, ghost: material};
const base = {id: 'specimen-1', x: 13.5, y: 32, groundZ: 3.4,
  crownBottomZ: 3.75, crownTopZ: 12.4, crownWidth: 4.5, crownDepth: 4.5,
  trunkTopZ: 9.7, trunkRadius: .225, rotation: 0,
  form: 'cone', evergreen: true, foliageActive: true, plantable: true, enabled: true};
const families = ['thuja', 'fir', 'spruce'];

function assertContained(group, v) {
  group.updateMatrixWorld(true);
  const angle = v.rotation * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  const height = v.crownTopZ - v.crownBottomZ;
  let checked = 0;
  group.traverse(mesh => {
    if (!mesh.userData.withinCrownEnvelope) return;
    const positions = mesh.geometry.getAttribute('position'), vertex = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
      const dx = vertex.x - v.x, dy = vertex.z - v.y;
      const localX = dx * c + dy * s, localDepth = -dx * s + dy * c;
      const radial = Math.hypot(localX / (v.crownWidth / 2), localDepth / (v.crownDepth / 2));
      const coneRadius = 1 - (vertex.y - v.crownBottomZ) / height;
      assert.ok(radial <= coneRadius + 1e-6, `${mesh.name} leaks beyond the analytical cone at ${vertex.y}: ${radial} > ${coneRadius}`);
      assert.ok(vertex.y >= v.crownBottomZ - 1e-6 && vertex.y <= v.crownTopZ + 1e-6,
        'Foliage and crown branches must leave the specified clear stem and height intact');
      checked++;
    }
  });
  assert.ok(checked > 1000, 'Inspect the actual merged botanical vertices, not only their centres');
}

test('thuja, fir and spruce detail fits the analytical cone after rotation and narrow crown edits', () => {
  for (const family of families) for (const svgMode of [false, true]) for (const dimensions of [
    {crownWidth: 4.5, crownDepth: 4.5, rotation: 0},
    {crownWidth: 7, crownDepth: 2.4, rotation: 37},
    {crownWidth: .3, crownDepth: .2, rotation: 91},
  ]) {
    const v = {...base, ...dimensions, type: {visualFamily: family}};
    assertContained(createScreeningTreeGroup(v, materials, svgMode), v);
  }
});

test('the three conifer families have distinct botanical geometry at identical analytical dimensions', () => {
  const crowns = families.map(visualFamily => createScreeningTreeGroup({...base, type: {visualFamily}}, materials));
  const positions = crowns.map(group => group.getObjectByName('conifer-foliage-fans').geometry.getAttribute('position').array);
  for (let i = 0; i < families.length; i++) {
    assert.equal(crowns[i].userData.visualFamily, families[i]);
    assert.ok(crowns[i].getObjectByName('conifer-foliage-fans').userData.fanCount > 100);
    for (let j = i + 1; j < families.length; j++) assert.notDeepEqual(positions[i], positions[j],
      'Changing species must change branch/fan structure, not only its label or colour');
  }
  const fir = createScreeningTreeGroup({...base, type: {visualFamily: 'fir', foliageColor: 0x73958c}}, materials);
  assert.equal(fir.getObjectByName('conifer-foliage-fans').material.color.getHex(), 0x73958c);
  assert.equal(material.color.getHex(), 0xffffff, 'Specimen colouring must not mutate shared scene materials');
});

test('conifers retain one ideal cone shadow and trunk shadow, with bounded foliage draw calls', () => {
  for (const family of families) {
    const v = {...base, crownWidth: 6, crownDepth: 2, rotation: 90, type: {visualFamily: family}};
    const group = createScreeningTreeGroup(v, materials);
    group.updateMatrixWorld(true);
    const crown = group.getObjectByName('crown-envelope');
    const bounds = new THREE.Box3().setFromObject(crown);
    for (const [actual, expected] of [[bounds.min.y, v.crownBottomZ], [bounds.max.y, v.crownTopZ],
      [bounds.min.x, v.x - 1], [bounds.max.x, v.x + 1], [bounds.min.z, v.y - 3], [bounds.max.z, v.y + 3]]) {
      assert.ok(Math.abs(actual - expected) < 1e-6, `Shadow envelope ${actual} does not match ${expected}`);
    }
    assert.equal(crown.castShadow, true);
    assert.equal(crown.visible, true);
    assert.equal(crown.material.colorWrite, false);
    assert.equal(crown.material.depthWrite, false);
    const foliage = group.getObjectByName('conifer-foliage-fans');
    assert.equal(foliage.castShadow, false, 'Botanical detail cannot change analytical shade credit');
    assert.equal(group.getObjectByName('conifer-branches').castShadow, false);
    let meshCount = 0;
    group.traverse(object => {if (object.isMesh) meshCount++;});
    assert.ok(meshCount <= 5, 'Hundreds of fans must not become hundreds of draw calls');
    assert.ok(foliage.geometry.getAttribute('position').count < 35000, 'Conifer detail must remain usable with a row of large trees');
    const trunkBounds = new THREE.Box3().setFromObject(group.getObjectByName('trunk-envelope'));
    assert.ok(Math.abs(trunkBounds.min.y - v.groundZ) < 1e-6);
    assert.ok(Math.abs(trunkBounds.max.y - v.trunkTopZ) < 1e-6);
  }
});

test('moving a conifer preserves its specimen, while SVG uses smaller geometry and no painted envelope', () => {
  for (const visualFamily of families) {
    const v = {...base, type: {visualFamily}};
    const crown = specimen => createScreeningTreeGroup(specimen, materials).getObjectByName('conifer-foliage-fans');
    const original = crown(v).geometry.getAttribute('position').array;
    assert.deepEqual(crown({...v, x: 2, y: 25, rotation: 67}).geometry.getAttribute('position').array, original);
    assert.notDeepEqual(crown({...v, id: 'specimen-2'}).geometry.getAttribute('position').array, original);
    const svg = createScreeningTreeGroup(v, materials, true);
    assert.ok(svg.getObjectByName('conifer-foliage-fans').geometry.getAttribute('position').count < original.length / 9);
    assert.equal(svg.getObjectByName('crown-envelope').visible, false);
    assert.equal(svg.getObjectByName('trunk-envelope').visible, false);
  }
});

test('invalid, disabled and foliage-off conifers cannot acquire foliage shadow credit', () => {
  for (const visualFamily of families) {
    const v = {...base, type: {visualFamily}};
    for (const state of [{plantable: false}, {enabled: false}]) {
      const group = createScreeningTreeGroup({...v, ...state}, materials);
      assert.equal(group.getObjectByName('crown-envelope').castShadow, false);
      assert.equal(group.getObjectByName('trunk-envelope').castShadow, false);
      assert.equal(group.getObjectByName('conifer-foliage-fans').material, materials.ghost);
    }
    const leafless = createScreeningTreeGroup({...v, foliageActive: false}, materials);
    assert.equal(leafless.getObjectByName('conifer-foliage-fans'), undefined);
    assert.equal(leafless.getObjectByName('crown-envelope'), undefined);
    assert.ok(leafless.getObjectByName('conifer-branches'));
  }
});
