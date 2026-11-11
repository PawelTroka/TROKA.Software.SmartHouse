import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { COST_DEFAULTS, estimateCosts, gardenQuantities, thujaUnitPrice } from '../src/costs.js';

const actual = JSON.parse(fs.readFileSync(new URL('../data/site-data.json', import.meta.url), 'utf8'));
const near = (a, b, eps = 1e-7) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const rectangle = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
function simpleSite() {
  return {
    coordinates: { localOriginEN: [0, 0], xUnitEN: [1, 0], yUnitEN: [0, 1] },
    terrain: { originEN: [0, 0], cellSize: 100, columns: 2, rows: 2, elevations: [0, 0, 0, 0] },
    site: {
      boundary: rectangle(0, 0, 20, 38), boundaryNames: ['street', 'east-rear', 'rear', 'west-rear'],
      rearMidpoint: [10, 18], floorReference: { z: 0 },
      house: { footprint: rectangle(5, 9, 10, 9) },
      terrace: { x: 6, y: 18, width: 8, depth: 4 },
      pool: { x: 8, y: 25, width: 4, length: 8 },
      garage: { footprint: rectangle(14, 22, 4, 5) },
    },
  };
}
const design = { hedgeRear: 2.5, hedgeLeft: 2.5, hedgeRight: 2.5, hedgeInset: 1, terraceDepth: 4, removeGarage: true };

test('independent hedge heights price only each respective side and count no front hedge', () => {
  const a = estimateCosts({ ...design, costSpacing: 1 }, simpleSite());
  const b = estimateCosts({ ...design, costSpacing: 1, hedgeRear: 4 }, simpleSite());
  assert.deepEqual(a.hedges.sides.map(s => [s.side, s.length, s.count]), [['rear', 18, 18], ['left', 19, 19], ['right', 19, 19]]);
  assert.equal(a.hedges.count, 56);
  assert.equal(a.hedges.lines.delivery, COST_DEFAULTS.costHedgeDelivery);
  assert.ok(b.hedges.sides[0].plants.low > a.hedges.sides[0].plants.low);
  assert.deepEqual(b.hedges.sides.slice(1), a.hedges.sides.slice(1));
});

test('no hedge planting and no added soil produces exactly zero cost, including allowances', () => {
  const e = estimateCosts({ ...design, hedgeRear: 0, hedgeLeft: 0, hedgeRight: 0, gardenRaise: 0, bedRaise: .5 }, simpleSite());
  assert.equal(e.hedges.count, 0);
  assert.equal(e.earthworks.bedArea, 0);
  assert.equal(e.earthworks.compactedVolume, 0);
  assert.deepEqual(e.total, { low: 0, high: 0 });
  assert.equal(e.status, 'none');
});

test('retaining existing hedges can exclude procurement independently of screening heights', () => {
  const e = estimateCosts({ ...design, buyNewThujas: false, hedgeRear: 12 }, simpleSite());
  assert.equal(e.hedges.count, 0);
  assert.deepEqual(e.hedges.total, { low: 0, high: 0 });
  assert.equal(e.status, 'none');
  assert.ok(e.earthworks.bedArea > 0);
});

test('rear fill excludes the front, house, terrace, pool and optionally the retained garage', () => {
  const data = simpleSite();
  const removed = gardenQuantities(design, data);
  const retained = gardenQuantities({ ...design, removeGarage: false }, data);
  near(removed.rearGrossArea, 400);
  near(removed.automaticArea, 400 - 32 - 32);
  near(retained.automaticArea, 400 - 32 - 32 - 20);
  near(gardenQuantities({ ...design, terraceDepth: 6 }, data).automaticArea, 400 - 48 - 32);
});

test('overlapping excluded footprints are subtracted only once', () => {
  const data = simpleSite();
  data.site.pool = { x: 8, y: 19, width: 3, length: 2 }; // entirely under terrace
  near(gardenQuantities(design, data).automaticArea, 400 - 32);
});

test('a half-metre raise partitions topsoil inside the total fill and applies loose factor once', () => {
  const e = estimateCosts({ ...design, gardenRaise: .5, costLooseFactor: 1.2, costTopsoilDepth: .15 }, simpleSite()).earthworks;
  near(e.area, 336);
  near(e.gardenVolume, 168);
  near(e.topsoilVolume, 50.4);
  near(e.bulkFillVolume, 117.6);
  near(e.compactedVolume, e.topsoilVolume + e.bulkFillVolume);
  near(e.looseVolume, 201.6);
  near(e.lines.fillMaterial, e.looseFillVolume * COST_DEFAULTS.costFillRate);
  near(e.lines.topsoilMaterial, e.looseTopsoilVolume * COST_DEFAULTS.costTopsoilRate);
});

test('bed corners and topsoil over combined garden-plus-bed raises are not double-counted', () => {
  const settings = { ...design, costBedWidth: 2, gardenRaise: .5, bedRaise: .5, costTopsoilDepth: .15 };
  const e = estimateCosts(settings, simpleSite()).earthworks;
  near(e.bedArea, 110); // finite strips: 36 + 38 + 38 - 1 - 1
  near(e.bedVolume, 55);
  near(e.compactedVolume, 168 + 55);
  near(e.topsoilVolume, 336 * .15); // one topsoil cap per area, not one per fill layer
});

test('bed-only raise and shallow fill keep all topsoil within the selected added depth', () => {
  const data = simpleSite();
  const bed = estimateCosts({ ...design, costBedWidth: 2, bedRaise: .1, costTopsoilDepth: .2 }, data).earthworks;
  near(bed.compactedVolume, 11);
  near(bed.topsoilVolume, 11);
  near(bed.bulkFillVolume, 0);
  const garden = estimateCosts({ ...design, gardenRaise: .05, costTopsoilDepth: .2 }, data).earthworks;
  near(garden.compactedVolume, 336 * .05);
  near(garden.topsoilVolume, garden.compactedVolume);
  near(garden.bulkFillVolume, 0);
});

test('cost-only area override changes fill quantities and caps at mapped rear area', () => {
  const data = simpleSite();
  const e = estimateCosts({ ...design, costAreaOverride: 100, gardenRaise: .5 }, data).earthworks;
  near(e.automaticArea, 336); near(e.area, 100); near(e.gardenVolume, 50);
  const capped = estimateCosts({ ...design, costAreaOverride: 900, gardenRaise: .5 }, data);
  near(capped.earthworks.area, 400);
  assert.ok(capped.notes.some(s => s.includes('capped')));
});

test('special-order stock never receives an invented extrapolated price and custom quotes restore totals', () => {
  assert.equal(thujaUnitPrice(4).status, 'estimate');
  assert.equal(thujaUnitPrice(4.1).status, 'quote-required');
  assert.equal(thujaUnitPrice(15).low, null);
  const unknown = estimateCosts({ ...design, hedgeRear: 6, gardenRaise: .5 }, simpleSite());
  assert.equal(unknown.hedges.total, null); assert.equal(unknown.total, null);
  assert.ok(unknown.knownSubtotal.low > unknown.earthworks.total.low);
  const quoted = estimateCosts({ ...design, hedgeRear: 6, costTreePriceRear: 3500, costPriceFactor: 200 }, simpleSite());
  assert.equal(quoted.hedges.sides[0].unit.low, 3500); // custom price is not silently multiplied
  assert.equal(quoted.hedges.sides[1].unit.low, 360);
  assert.equal(quoted.status, 'estimate'); assert.ok(quoted.total.low > 0);
});

test('contingency is applied once to the high total, never the whole total twice', () => {
  const settings = { ...design, gardenRaise: .5, costTreePriceRear: 200, costTreePriceLeft: 200, costTreePriceRight: 200, costContingency: 25 };
  const e = estimateCosts(settings, simpleSite());
  near(e.total.high, e.total.low * 1.25);
  near(e.total.low, e.hedges.total.low + e.earthworks.total.low);
  near(e.total.high, e.hedges.total.high + e.earthworks.total.high);
});

test('mapped plot quantities are consistent with the geometry and materially below full-plot fill', () => {
  const e = estimateCosts({ ...design, terraceDepth: 4.2, hedgeInset: .5, gardenRaise: .5 }, actual).earthworks;
  near(e.automaticArea, 338.6942927042236);
  near(e.gardenVolume, 169.3471463521118);
  near(e.looseVolume, 203.21657562253412);
  assert.ok(e.rearGrossArea < actual.site.area);
});

test('haulage scales with loose volume and rounds separate material loads independently', () => {
  const e = estimateCosts({ ...design, gardenRaise: .5, costTruckCapacity: 10, costSoilDelivery: 500 }, simpleSite()).earthworks;
  assert.equal(e.fillLoads, 15); assert.equal(e.topsoilLoads, 7); assert.equal(e.loads, 22);
  assert.equal(e.lines.transport, 11000);
  const bigger = estimateCosts({ ...design, gardenRaise: 1, costTruckCapacity: 10, costSoilDelivery: 500 }, simpleSite()).earthworks;
  assert.ok(bigger.loads > e.loads);
  const noHaulage = estimateCosts({ ...design, gardenRaise: .5, costSoilDelivery: 0 }, simpleSite()).earthworks;
  assert.equal(noHaulage.lines.transport, 0); // delivered-inclusive supplier quote can use zero
});
