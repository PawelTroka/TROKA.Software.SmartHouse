import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import { toWorld, fromWorld, gazeDirection, toWorldTriangle, toWorldRoofTriangle } from '../src/orientation.js';
import { orientExtrudedSlab } from '../src/scene.js';
import { sampledRoofFaces } from '../src/shade.js';
import { sunForSettings } from '../src/solar.js';

const data = JSON.parse(readFileSync(new URL('../data/site-data.json', import.meta.url)));
const vec = p => new THREE.Vector3(...p);
const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const centre = ring => {
  const points = ring.length > 1 && Math.hypot(ring[0][0] - ring.at(-1)[0], ring[0][1] - ring.at(-1)[1]) < 1e-6 ? ring.slice(0, -1) : ring;
  return points.reduce((sum, p) => [sum[0] + p[0] / points.length, sum[1] + p[1] / points.length], [0, 0]);
};
function rearCamera(yaw = 0) {
  const camera = new THREE.PerspectiveCamera(65, 1.5, .1, 500);
  camera.position.copy(vec(toWorld(data.site.rearMidpoint[0], 17.5, 5)));
  camera.lookAt(camera.position.clone().add(vec(toWorld(...gazeDirection(yaw)))));
  camera.updateMatrixWorld();
  return camera;
}
function faceNormal(triangle) {
  const [a, b, c] = triangle.map(vec);
  return b.sub(a).cross(c.sub(a)).normalize();
}

test('rendered rear-view right agrees with the geographic EN basis, without mirroring source coordinates', () => {
  const { xUnitEN: x, yUnitEN: y } = data.coordinates;
  near(x[0] * y[1] - x[1] * y[0], -1);
  // An upright observer's right is the clockwise perpendicular to the rearward
  // geographic direction. This derives the expected side from the mapped basis.
  const rightEN = [y[1], -y[0]];
  const rightLocal = [rightEN[0] * x[0] + rightEN[1] * x[1], rightEN[0] * y[0] + rightEN[1] * y[1], 0];
  const camera = rearCamera(), forward = camera.getWorldDirection(new THREE.Vector3());
  const cameraRight = forward.cross(camera.up).normalize();
  near(cameraRight.dot(vec(toWorld(...rightLocal))), 1);
});

test('mapped garage and PCK 3 appear left while the west block appears right from the living room', () => {
  const camera = rearCamera();
  for (const [name, building, expectedSide] of [
    ['garage', data.site.garage, -1],
    ['PCK 3', data.buildings.find(b => b.index === 9), -1],
    ['west apartment block', data.buildings.find(b => b.index === 15), 1],
  ]) {
    const [x, y] = centre(building.footprint);
    const projected = vec(toWorld(x, y, building.roofZ)).project(camera);
    assert.equal(Math.sign(projected.x), expectedSide, name);
    assert.ok(projected.z > -1 && projected.z < 1, `${name} is in front of the camera`);
  }
});

test('positive eye yaw turns physically right and uses the same local direction as plan cones', () => {
  const camera = rearCamera(), initialRight = camera.getWorldDirection(new THREE.Vector3()).cross(camera.up).normalize();
  near(initialRight.dot(vec(toWorld(...gazeDirection(90)))), 1);
  near(initialRight.dot(vec(toWorld(...gazeDirection(-90)))), -1);
  const pitched = gazeDirection(30, 20);
  near(Math.hypot(...pitched), 1);
  near(pitched[2], Math.sin(20 * Math.PI / 180));
  assert.ok(pitched[0] < 0 && pitched[1] > 0);
});

test('world picking round-trips asymmetric mapped positions and absolute heights', () => {
  const points = [...data.site.boundary.map(p => [...p, 2.8]), [12.7, 25.3, 4.2], [-32.1, 48.6, 19.7]];
  for (const p of points) assert.deepEqual(fromWorld(...toWorld(...p)), p);
  const camera = rearCamera(), source = vec(toWorld(12.7, 25.3, 4.2));
  const projected = source.clone().project(camera), unprojected = projected.clone().unproject(camera);
  fromWorld(unprojected.x, unprojected.y, unprojected.z).forEach((value, i) => near(value, [12.7, 25.3, 4.2][i]));
});

test('overhead camera agrees with the street-at-top SVG plan and is not mirrored', () => {
  const camera = new THREE.PerspectiveCamera(36, 1, .1, 500);
  camera.position.copy(vec(toWorld(10, 24.001, 83)));
  camera.lookAt(vec(toWorld(10, 24, 2.5))); camera.updateMatrixWorld();
  const origin = vec(toWorld(10, 24, 2.5)).project(camera);
  const eastSide = vec(toWorld(14, 24, 2.5)).project(camera);
  const streetward = vec(toWorld(10, 20, 2.5)).project(camera);
  assert.ok(eastSide.x > origin.x, 'increasing mapped x is screen right in plan');
  assert.ok(streetward.y > origin.y, 'street is screen top (positive NDC y)');
});

test('terrain and measured roof triangles face upward after the handedness conversion', () => {
  near(faceNormal(toWorldTriangle([0, 0, 2], [1, 0, 2], [1, 1, 2])).y, 1);
  for (const building of [data.site.house, data.site.garage, data.buildings.find(b => b.index === 9)]) {
    const faces = sampledRoofFaces(building.footprint, building.roofPoints, building.roofZ);
    assert.ok(faces.length > 20);
    for (const face of faces) assert.ok(faceNormal(toWorldRoofTriangle(...face)).y > 0, `${building.label || building.id} roof points down`);
  }
  // Front facade normal must point toward the street, outside the building.
  assert.ok(faceNormal(toWorldTriangle([0, 0, 0], [1, 0, 0], [1, 0, 2])).z < 0);
});

test('rounded water and furniture extrusions retain positive depth, height and outward normals', () => {
  const width = 1.88, depth = 1.35, height = .015;
  const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(width, 0); shape.lineTo(width, depth); shape.lineTo(0, depth); shape.closePath();
  const geometry = orientExtrudedSlab(new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false }), height);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  [bounds.min.x, bounds.min.y, bounds.min.z].forEach(v => near(v, 0, 1e-6));
  near(bounds.max.x, width, 1e-6); near(bounds.max.y, height, 1e-6); near(bounds.max.z, depth, 1e-6);
  const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
  let top = 0, bottom = 0;
  for (let i = 0; i < positions.count; i++) {
    if (normals.getY(i) > .99) { near(positions.getY(i), height, 1e-6); top++; }
    if (normals.getY(i) < -.99) { near(positions.getY(i), 0, 1e-6); bottom++; }
  }
  assert.ok(top > 0 && bottom > 0); geometry.dispose();
});

test('morning sun is on the geographic left and afternoon sun on the right of the rear-facing view', () => {
  const camera = rearCamera(), right = camera.getWorldDirection(new THREE.Vector3()).cross(camera.up).normalize();
  const morning = sunForSettings({ sunDate: '2026-06-21', sunMinutes: 480 }, data);
  const afternoon = sunForSettings({ sunDate: '2026-06-21', sunMinutes: 960 }, data);
  assert.ok(right.dot(vec(toWorld(...morning.direction))) < 0);
  assert.ok(right.dot(vec(toWorld(...afternoon.direction))) > 0);
  for (const solar of [morning, afternoon]) {
    const world = vec(toWorld(...solar.direction));
    near(world.length(), 1); near(world.y, Math.sin(solar.elevation * Math.PI / 180));
    fromWorld(world.x, world.y, world.z).forEach((v, i) => near(v, solar.direction[i]));
  }
});
