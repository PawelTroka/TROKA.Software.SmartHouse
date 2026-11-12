import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  terrainAt, gardenGroundAt, observerForPreset, screenOnRay,
  canopyIntersection, canopyBounds, hedgeSegments, analyzeVisibility, jacuzziBounds,
  buildingIntersection, segmentIntersection,
} from '../src/geometry.js';

const data = JSON.parse(fs.readFileSync(new URL('../data/site-data.json', import.meta.url), 'utf8'));
const near = (actual, expected, tolerance = 1e-8) => assert.ok(
  Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);
const eye = data.benchmark.observer;
const target = data.benchmark.target;

test('official native terrain crop reproduces the audited critical PCK 3 ray', () => {
  const hit = screenOnRay(eye, target, {}, data);
  near(hit.requiredHeight, 13.71324233162445);
  near(hit.x, 18.749971821958454);
  near(hit.y, 37.908002858552166);
  near(hit.distance, 24.18671451293819);
  near(hit.t, 0.7193814656771889);
  near(hit.groundZ, 2.9239285761982);
  assert.equal(hit.side, 'rear');
  assert.equal(hit.blocked, false);
});

test('the assumed floor is tied to original near-house ground, never the fill slider', () => {
  const a = observerForPreset('sofa', {}, data);
  const b = observerForPreset('sofa', { gardenRaise: 0.5 }, data);
  near(a.z, eye[2]); near(b.z, a.z);
  const before = screenOnRay(a, target, {}, data);
  const after = screenOnRay(b, target, { gardenRaise: 0.5 }, data);
  near(after.requiredHeight, before.requiredHeight - 0.5);
  near(after.topZ, before.topZ + 0.5);
});

test('raising garden and newly planted hedge together saves r times fill from a garden eye', () => {
  const beforeEye = observerForPreset('garden', {}, data);
  const afterEye = observerForPreset('garden', { gardenRaise: 0.5 }, data);
  near(afterEye.z, beforeEye.z + 0.5);
  const before = screenOnRay(beforeEye, target, {}, data);
  const after = screenOnRay(afterEye, target, { gardenRaise: 0.5 }, data);
  near(after.requiredHeight, before.requiredHeight - 0.5 * before.t);
  // This must not accidentally cancel entirely, or give the full half-metre.
  assert.ok(after.requiredHeight < before.requiredHeight);
  assert.ok(after.requiredHeight > before.requiredHeight - 0.5);
});

test('raising only hedge planting beds gives the full benefit without lifting the observer', () => {
  const a = observerForPreset('garden', {}, data);
  const b = observerForPreset('garden', { bedRaise: 0.5 }, data);
  near(a.z, b.z);
  const before = screenOnRay(a, target, {}, data);
  const after = screenOnRay(b, target, { bedRaise: 0.5 }, data);
  near(after.requiredHeight, before.requiredHeight - 0.5);
});

test('adding soil never raises retained hedge foliage', () => {
  const before = screenOnRay(eye, target, { raiseNewHedges: false }, data);
  const after = screenOnRay(eye, target, { raiseNewHedges: false, gardenRaise: 0.5, bedRaise: 0.2 }, data);
  near(after.topZ, before.topZ);
  near(after.requiredHeight, before.requiredHeight);
  near(after.height, before.height - 0.7);
  const gardenBefore = observerForPreset('garden', {}, data);
  const gardenAfter = observerForPreset('garden', { gardenRaise: 0.5 }, data);
  const a = screenOnRay(gardenBefore, target, { raiseNewHedges: false }, data);
  const b = screenOnRay(gardenAfter, target, { raiseNewHedges: false, gardenRaise: 0.5 }, data);
  near(b.requiredHeight, a.requiredHeight + 0.5 * (1 - a.t));
});

test('rear garden fill does not silently raise the front garden or surrounding land', () => {
  near(gardenGroundAt(10, 4, { gardenRaise: 0.5 }, data), terrainAt(10, 4, data));
  near(gardenGroundAt(24, 30, { gardenRaise: 0.5 }, data), terrainAt(24, 30, data));
  near(gardenGroundAt(10, 30, { gardenRaise: 0.5 }, data), terrainAt(10, 30, data) + 0.5);
});

test('screen inset is geometric and there is no intermediate garden wall', () => {
  const onBoundary = screenOnRay(eye, target, {}, data);
  const inset = screenOnRay(eye, target, { hedgeInset: 0.5 }, data);
  assert.ok(inset.distance < onBoundary.distance);
  assert.ok(inset.requiredHeight < onBoundary.requiredHeight);
  const segments = hedgeSegments({ hedgeInset: 0.5 }, data);
  assert.ok(segments.every(s => ['rear', 'left', 'right'].includes(s.side)));
  assert.ok(segments.filter(s => s.side === 'rear').every(s => Math.min(s.a[1], s.b[1]) > 37));
  assert.ok(segments.filter(s => s.side !== 'rear').every(s => Math.min(s.a[1], s.b[1]) >= data.site.rearMidpoint[1] - 1e-8));
});

test('finite canopy catches a central upper ray but cannot cover a sideways ray outside its footprint', () => {
  const s = { canopyEnabled: true, canopyWidth: 8.5, canopyDepth: 4.2, canopyHeight: 2.7, fasciaDepth: 0.3 };
  assert.equal(canopyIntersection(eye, [eye[0], 48, 21], s, data)?.part, 'roof');
  assert.equal(canopyIntersection(eye, [90, 48, 21], s, data), null);
  assert.equal(canopyIntersection(eye, [eye[0], 48, 21], { ...s, canopyEnabled: false }, data), null);
  assert.equal(canopyIntersection(eye, [eye[0], 48, 21], { ...s, canopyDepth: 0 }, data), null);
});

test('a front fascia closes only its own finite vertical band', () => {
  const s = { canopyEnabled: true, fasciaDepth: 0.3 };
  const c = canopyBounds(s, data);
  const r = (c.y1 - eye[1]) / (48 - eye[1]);
  const facadeTargetZ = eye[2] + ((c.z - 0.15) - eye[2]) / r;
  assert.equal(canopyIntersection(eye, [eye[0], 48, facadeTargetZ], s, data)?.part, 'front-fascia');
  assert.equal(canopyIntersection(eye, [eye[0], 48, facadeTargetZ], { ...s, fasciaDepth: 0 }, data), null);
});

test('side fascia is tested independently of the front edge', () => {
  const s = { canopyEnabled: true, fasciaDepth: 0.3 };
  const c = canopyBounds(s, data), targetX = 40, targetY = 48;
  const r = (c.x1 - eye[0]) / (targetX - eye[0]);
  const targetZ = eye[2] + ((c.z - 0.15) - eye[2]) / r;
  assert.equal(canopyIntersection(eye, [targetX, targetY, targetZ], s, data)?.part, 'left-fascia');
});

test('finite segment and building intersections reject extensions and endpoint self hits', () => {
  assert.equal(segmentIntersection([0, 0], [1, 0], [2, -1], [2, 1]), null);
  assert.equal(segmentIntersection([0, 0], [2, 0], [0, 1], [2, 1]), null);
  const b = { id: 'test', footprint: [[2, -1], [4, -1], [4, 1], [2, 1], [2, -1]], baseZ: 0, roofZ: 3 };
  assert.ok(buildingIntersection([0, 0, 1], [8, 0, 1], b));
  assert.equal(buildingIntersection([0, 0, 5], [8, 0, 5], b), null);
  assert.equal(buildingIntersection([0, 0, 1], [2, 0, 1], b), null);
});

test('presets preserve intended surface heights, including a seated jacuzzi eye', () => {
  near(observerForPreset('standing', {}, data).eyeHeight, 1.65);
  near(observerForPreset('jacuzzi', {}, data).eyeHeight, 0.7);
  near(observerForPreset('garden', { eyeHeight: 1.8 }, data).eyeHeight, 1.8);
  assert.equal(observerForPreset('custom', { observerX: 10, observerY: 21 }, data).surface, 'floor');
  assert.equal(observerForPreset('custom', { observerX: 10, observerY: 30 }, data).surface, 'garden');
  for (const depth of [3, 4.2, 6]) {
    const s = { terraceDepth: depth }, b = jacuzziBounds(s, data), observer = observerForPreset('jacuzzi', s, data);
    near(observer.x, (b.x0 + b.x1) / 2); near(observer.y, (b.y0 + b.y1) / 2);
    assert.ok(b.y1 < data.site.rearMidpoint[1] + depth);
  }
});

test('raised planting soil cannot create a transparent gap below the hedge', () => {
  const lowEye = [eye[0], eye[1], 3.5], lowTarget = [target[0], target[1], 3.5];
  const hit = screenOnRay(lowEye, lowTarget, { bedRaise: 1, hedgeRear: 0 }, data);
  assert.equal(hit.blocked, true);
  assert.equal(hit.blockMaterial, 'raised-soil');
});

test('whole-model coverage stays internally consistent and taller ideal hedges cannot reveal rays', () => {
  const observer = observerForPreset('sofa', {}, data);
  const a = analyzeVisibility(observer, {}, data);
  const b = analyzeVisibility(observer, { hedgeRear: 6, hedgeLeft: 6, hedgeRight: 6 }, data);
  assert.equal(a.total, a.visible + a.blocked);
  assert.equal(a.total, a.byBlock.reduce((sum, b) => sum + b.total, 0));
  assert.equal(a.total, b.total);
  assert.ok(b.visible <= a.visible);
  near(a.criticalRay.screen.requiredHeight, data.benchmark.requiredHedgeHeight, 1e-7);
  assert.ok(a.byBlock.every(b => b.total > 0));
});

test('a median roof prism never discards the audited garden eave return', () => {
  const o = observerForPreset('garden', {}, data);
  const a = analyzeVisibility(o, {}, data);
  const sampledTarget = [27.20516027422093, 42.98737505814171, 19.48];
  const ray = a.rays.find(r => r.blockId === 'building-9' && Math.hypot(
    r.target[0] - sampledTarget[0], r.target[1] - sampledTarget[1], r.target[2] - sampledTarget[2]) < 1e-7);
  assert.ok(ray, 'Measured near-edge roof point must remain in the candidate set');
  near(ray.screen.requiredHeight, 10.493335044032477, 1e-7);
});

test('removing the garage cannot improve screening and adding canopy cannot reveal rays', () => {
  const observer = observerForPreset('sofa', {}, data);
  const retained = analyzeVisibility(observer, { removeGarage: false }, data);
  const removed = analyzeVisibility(observer, { removeGarage: true }, data);
  const canopy = analyzeVisibility(observer, { removeGarage: true, canopyEnabled: true }, data);
  assert.equal(retained.total, removed.total);
  assert.ok(removed.visible >= retained.visible);
  assert.ok(canopy.visible <= removed.visible);
});

test('thin high features are optional and do not get mislabeled as the main building roof', () => {
  const observer = observerForPreset('sofa', {}, data);
  const a = analyzeVisibility(observer, {}, data);
  const b = analyzeVisibility(observer, { includeHighFeatures: true }, data);
  assert.ok(b.total > a.total);
  assert.ok(b.rays.some(r => r.kind === 'high-feature'));
  assert.ok(b.worstRequiredHedge.overall > a.worstRequiredHedge.overall);
});
