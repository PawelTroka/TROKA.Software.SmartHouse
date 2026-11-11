import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BUILDING_TARGETS, BUILDING_FIELDS, buildingAssumptions, applyBuildingOverrides, footprintCentroid } from '../src/buildings.js';
import { observerForPreset, screenOnRay, analyzeVisibility } from '../src/geometry.js';

const data = JSON.parse(fs.readFileSync(new URL('../data/site-data.json', import.meta.url), 'utf8'));
const block = (model, index = 9) => model.buildings.find(b => b.index === index);
const near = (actual, expected, tolerance = 1e-8) => assert.ok(
  Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);

test('zero building adjustments preserve the exact surveyed data and original identities', () => {
  assert.equal(BUILDING_TARGETS.length, 5);
  assert.equal(Object.keys(BUILDING_FIELDS).length, 10);
  assert.strictEqual(applyBuildingOverrides(data, {}), data);
  assert.strictEqual(applyBuildingOverrides(data, { b9HeightDelta: 0, b9DistanceDelta: 0 }), data);
  for (const value of buildingAssumptions(data)) {
    assert.equal(value.active, false);
    near(value.height, value.baselineHeight);
    near(value.distance, value.baselineDistance);
  }
});

test('footprint reference uses area centroid and ignores repeated closing vertex', () => {
  const shape = [[1, 2], [7, 2], [7, 6], [1, 6]];
  assert.deepEqual(footprintCentroid(shape), [4, 4]);
  assert.deepEqual(footprintCentroid([...shape, shape[0]]), [4, 4]);
});

test('height adjustment transforms all target heights coherently above the fixed base', () => {
  const before = JSON.stringify(data), original = block(data);
  const transformed = applyBuildingOverrides(data, { b9HeightDelta: 4 });
  const changed = block(transformed), scale = (original.roofTopZ - original.baseZ + 4) / (original.roofTopZ - original.baseZ);
  near(changed.roofTopZ, original.roofTopZ + 4);
  near(changed.roofZ, original.baseZ + (original.roofZ - original.baseZ) * scale);
  assert.equal(changed.baseZ, original.baseZ);
  assert.equal(changed.roofSampleCount, original.roofSampleCount);
  for (const field of ['samples', 'roofPoints', 'highFeatures']) {
    assert.equal(changed[field].length, original[field].length);
    changed[field].forEach((point, i) => {
      near(point[0], original[field][i][0]); near(point[1], original[field][i][1]);
      near(point[2], original.baseZ + (original[field][i][2] - original.baseZ) * scale);
    });
  }
  assert.equal(JSON.stringify(data), before);
  assert.strictEqual(block(transformed, 15), block(data, 15));
  assert.strictEqual(transformed.site, data.site);
  assert.strictEqual(transformed.terrain, data.terrain);
});

test('distance adjustment translates the full block radially with unchanged footprint and elevation', () => {
  const transformed = applyBuildingOverrides(data, { b9DistanceDelta: 12 });
  const original = block(data), changed = block(transformed), reference = data.site.rearMidpoint;
  const a = footprintCentroid(original.footprint), b = footprintCentroid(changed.footprint);
  near(Math.hypot(b[0] - reference[0], b[1] - reference[1]) - Math.hypot(a[0] - reference[0], a[1] - reference[1]), 12);
  near(Math.atan2(b[1] - reference[1], b[0] - reference[0]), Math.atan2(a[1] - reference[1], a[0] - reference[0]));
  const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const field of ['footprint', 'samples', 'roofPoints', 'highFeatures']) {
    changed[field].forEach((point, i) => {
      near(point[0], original[field][i][0] + dx); near(point[1], original[field][i][1] + dy);
      if (point.length > 2) near(point[2], original[field][i][2]);
    });
  }
  assert.equal(changed.baseZ, original.baseZ, 'Moving a block does not snap its base to another terrain elevation');
  assert.equal(changed.roofTopZ, original.roofTopZ);
});

test('cached scenarios do not accumulate changes and reset returns exact baseline', () => {
  const settings = { b9HeightDelta: 3, b9DistanceDelta: 7, b29HeightDelta: -2 };
  const first = applyBuildingOverrides(data, settings);
  assert.strictEqual(applyBuildingOverrides(data, { ...settings, hedgeRear: 6 }), first);
  assert.strictEqual(applyBuildingOverrides(first, settings), first);
  const next = applyBuildingOverrides(first, { b9HeightDelta: 5 });
  near(block(next).roofTopZ, block(data).roofTopZ + 5);
  assert.deepEqual(block(next).footprint, block(data).footprint);
  assert.strictEqual(block(next, 29), block(data, 29));
  assert.strictEqual(applyBuildingOverrides(next, {}), data);
});

test('independent targets and corrupt values are bounded before numerical use', () => {
  const settings = { b9HeightDelta: 999, b9DistanceDelta: -999, b15HeightDelta: -2, b29DistanceDelta: 4, b31HeightDelta: NaN, b53DistanceDelta: Infinity };
  const adjustments = buildingAssumptions(data, settings);
  assert.equal(adjustments.find(b => b.index === 9).heightDelta, 15);
  assert.equal(adjustments.find(b => b.index === 9).distanceDelta, -15);
  assert.equal(adjustments.find(b => b.index === 15).heightDelta, -2);
  assert.equal(adjustments.find(b => b.index === 29).distanceDelta, 4);
  assert.equal(adjustments.find(b => b.index === 31).heightDelta, 0);
  assert.equal(adjustments.find(b => b.index === 53).distanceDelta, 0);
  assert.deepEqual(applyBuildingOverrides(data, settings).buildingOverrides.map(b => b.index), [9, 15, 29]);
});

test('adjusted targets feed the sightline engine and higher or nearer PCK 3 needs more screening', () => {
  const observer = observerForPreset('sofa', {}, data);
  const original = block(data), sourceTarget = original.samples[0];
  const baseline = screenOnRay(observer, sourceTarget, {}, data);
  const higher = applyBuildingOverrides(data, { b9HeightDelta: 4 });
  const closer = applyBuildingOverrides(data, { b9DistanceDelta: -5 });
  const higherRay = screenOnRay(observer, block(higher).samples[0], {}, higher);
  const closerRay = screenOnRay(observer, block(closer).samples[0], {}, closer);
  assert.ok(higherRay.requiredHeight > baseline.requiredHeight);
  assert.ok(closerRay.requiredHeight > baseline.requiredHeight);
  const baselineAnalysis = analyzeVisibility(observer, { hedgeRear: 10, hedgeLeft: 10, hedgeRight: 10 }, data);
  const analysis = analyzeVisibility(observer, { hedgeRear: 10, hedgeLeft: 10, hedgeRight: 10 }, higher);
  assert.ok(analysis.rays.some(ray => ray.blockId === original.id && ray.target === block(higher).samples[0]));
  assert.notEqual(analysis.byBlock.find(b => b.id === original.id).visible, baselineAnalysis.byBlock.find(b => b.id === original.id).visible);
});
