import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  hedgeSegments, jacuzziBounds, observerForPreset, floorElevation,
  canopyBounds, canopyIntersection,
} from '../src/geometry.js';
import { estimateCosts } from '../src/costs.js';

const data = JSON.parse(fs.readFileSync(new URL('../data/site-data.json', import.meta.url), 'utf8'));
const near = (actual, expected, tolerance = 1e-8) => assert.ok(
  Math.abs(actual - expected) <= tolerance, `${actual} should equal ${expected}`);

// Derive physical right independently in the source East/North frame: rotate
// the house-to-garden heading clockwise. This does not use renderer axes or
// hedge side labels, which are precisely the conventions under regression.
function rightwardOffset([x, y]) {
  const { xUnitEN: ux, yUnitEN: forward } = data.coordinates;
  const [mx, my] = data.site.rearMidpoint;
  const east = (x - mx) * ux[0] + (y - my) * forward[0];
  const north = (x - mx) * ux[1] + (y - my) * forward[1];
  return east * forward[1] - north * forward[0];
}

// Independent boundary length from the cadastral vertices, with no inset.
// Ignore the transverse front/rear edges; clip the longitudinal edges to the
// rear garden and classify them by the geographic heading above.
function physicalBoundaryLength(side) {
  const boundary = data.site.boundary, rearY = data.site.rearMidpoint[1];
  let length = 0;
  for (let i = 0; i < boundary.length - 1; i++) {
    const a = boundary[i], b = boundary[i + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    if (Math.abs(dy) <= Math.abs(dx) || Math.max(a[1], b[1]) <= rearY) continue;
    const midpoint = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if ((rightwardOffset(midpoint) > 0 ? 'right' : 'left') !== side) continue;
    const rearFraction = Math.min(1, (Math.max(a[1], b[1]) - rearY) / Math.abs(dy));
    length += Math.hypot(dx, dy) * rearFraction;
  }
  return length;
}

test('left and right hedges follow the real house-to-garden heading at every inset', () => {
  for (const hedgeInset of [0, 0.5, 1.5]) {
    const settings = {
      hedgeRear: 3, hedgeLeft: 1, hedgeRight: 6, hedgeInset,
      gardenRaise: 0.5, bedRaise: 0.2, raiseNewHedges: true,
    };
    const segments = hedgeSegments(settings, data);
    for (const side of ['left', 'right']) {
      const selected = segments.filter(segment => segment.side === side);
      assert.ok(selected.length > 0);
      for (const segment of selected) {
        for (const endpoint of [segment.a, segment.b]) {
          const offset = rightwardOffset(endpoint);
          assert.ok(side === 'right' ? offset > 7 : offset < -7,
            `${side} hedge must lie on the physical ${side} looking out from the house`);
          assert.ok(side === 'left' ? endpoint[0] > data.site.rearMidpoint[0] : endpoint[0] < data.site.rearMidpoint[0]);
        }
        const expectedHeight = side === 'left' ? 1 : 6;
        assert.equal(segment.height, expectedHeight);
        near(segment.topA - segment.baseA, expectedHeight);
        near(segment.topB - segment.baseB, expectedHeight);
      }
    }
  }
});

test('side quantities and supplier quotes price the same geographic hedge boundaries', () => {
  const settings = {
    hedgeRear: 0, hedgeLeft: 1, hedgeRight: 6, hedgeInset: 0,
    gardenRaise: 0, bedRaise: 0, costSpacing: 0.5,
    costTreePriceLeft: 110, costTreePriceRight: 2600,
  };
  const estimate = estimateCosts(settings, data);
  const sides = Object.fromEntries(estimate.hedges.sides.map(side => [side.side, side]));
  for (const [side, height, quote] of [['left', 1, 110], ['right', 6, 2600]]) {
    const measuredLength = physicalBoundaryLength(side);
    near(sides[side].length, measuredLength);
    assert.equal(sides[side].height, height);
    assert.equal(sides[side].count, Math.ceil(measuredLength / settings.costSpacing));
    assert.equal(sides[side].unit.low, quote);
    assert.equal(sides[side].plants.low, sides[side].count * quote);
  }
  // The surveyed sides differ enough to require different counts at this spacing.
  // Equal or swapped quantities would otherwise be hidden by a symmetric plot.
  assert.equal(sides.left.count, 40);
  assert.equal(sides.right.count, 41);
  assert.equal(sides.rear.count, 0);
  const withoutLeft = estimateCosts({ ...settings, hedgeLeft: 0 }, data);
  assert.equal(withoutLeft.hedges.sides.find(side => side.side === 'left').count, 0);
  assert.deepEqual(withoutLeft.hedges.sides.find(side => side.side === 'right'), sides.right);
});

test('the built-in jacuzzi and its seated viewpoint stay on the physical right of the terrace', () => {
  const terrace = data.site.terrace, rearY = data.site.rearMidpoint[1];
  for (const terraceDepth of [3, 4.2, 6]) {
    for (const gardenRaise of [0, 0.5, 1]) {
      const settings = { terraceDepth, gardenRaise, floorHeight: 1.2, eyeHeight: 0.7 };
      const tub = jacuzziBounds(settings, data), observer = observerForPreset('jacuzzi', settings, data);
      assert.ok(rightwardOffset([tub.x0, tub.y0]) > 0);
      assert.ok(rightwardOffset([tub.x1, tub.y1]) > 0);
      near(tub.x0 - terrace.x, 0.15);
      near(tub.x1 - tub.x0, 2.2);
      near(tub.y1 - tub.y0, 2.2);
      assert.ok(tub.y0 >= rearY + 0.15 - 1e-8);
      assert.ok(tub.y1 <= rearY + terraceDepth - 0.15 + 1e-8);
      near(observer.x, (tub.x0 + tub.x1) / 2);
      near(observer.y, (tub.y0 + tub.y1) / 2);
      near(observer.z, floorElevation(settings, data) + 0.7);
      assert.equal(observer.surface, 'floor');
    }
  }
});

test('canopy fascia names use the same physical left/right convention as the hedges', () => {
  const settings = { canopyEnabled: true, canopyWidth: 8.5, canopyDepth: 4.2, canopyHeight: 2.7, fasciaDepth: 0.5 };
  const canopy = canopyBounds(settings, data);
  const observer = [(canopy.x0 + canopy.x1) / 2, (canopy.y0 + canopy.y1) / 2, canopy.z - 0.2];
  for (const targetX of [canopy.x0 - 2, canopy.x1 + 2]) {
    const target = [targetX, observer[1], observer[2]];
    const physicalSide = rightwardOffset(target) > 0 ? 'right' : 'left';
    assert.equal(canopyIntersection(observer, target, settings, data).part, `${physicalSide}-fascia`);
  }
});
