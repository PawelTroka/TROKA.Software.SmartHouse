import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TREE_CATALOG, getTreeType } from '../src/tree-catalog.js';
import { estimateCosts, estimateScreeningTreeCosts, screeningTreeUnitPrice } from '../src/costs.js';

const site = JSON.parse(fs.readFileSync(new URL('../data/site-data.json', import.meta.url), 'utf8'));
const sources = JSON.parse(fs.readFileSync(new URL('../data/tree-sources.json', import.meta.url), 'utf8'));
const near = (a, b, eps = 1e-7) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const tree = (typeId, overrides = {}) => ({
  id: `test-${typeId}`, typeId, ...getTreeType(typeId).dimensions,
  x: 8, y: 31, rotation: 0, enabled: true, unitPrice: 0, ...overrides,
});
const serviceQuotes = {
  costScreeningPlanting: 250, costScreeningAnchoring: 149,
  costScreeningDelivery: 1200, costScreeningCrane: 2000, costScreeningEstablishment: 600,
};
const noOtherWork = { hedgeRear: 0, hedgeLeft: 0, hedgeRight: 0, gardenRaise: 0, bedRaise: 0 };

test('catalog anchors match documented purchased sizes and dated primary-source observations', () => {
  assert.equal(sources.reviewedAt, '2026-11-12');
  const observations = sources.sources.flatMap(source => source.observations || []);
  assert.equal(TREE_CATALOG.length, 7);
  assert.equal(new Set(TREE_CATALOG.map(type => type.id)).size, TREE_CATALOG.length);
  for (const type of TREE_CATALOG) {
    const observation = observations.find(row => row.typeId === type.id);
    assert.ok(observation, `Missing source for ${type.id}`);
    assert.equal(type.pricePLN, observation.pricePLN);
    assert.deepEqual(type.stock.height, observation.heightM);
    assert.deepEqual(type.stock.width, observation.widthM || observation.diameterM || [observation.panelWidthM, observation.panelWidthM]);
    const assessed = screeningTreeUnitPrice(tree(type.id));
    assert.equal(assessed.status, 'estimate');
    assert.equal(assessed.low, observation.pricePLN);
    assert.match(type.dimensionNote, /assumption/);
  }
  assert.equal(getTreeType('austrian-pine-tall').pricePLN, 59900);
});

test('out-of-spec crown width or depth never receives the smaller catalog price', () => {
  for (const dimensions of [{ height: 8 }, { crownWidth: 8 }, { crownDepth: 8 }, { height: 3 }]) {
    const unit = screeningTreeUnitPrice(tree('austrian-pine-large', dimensions));
    assert.equal(unit.status, 'quote-required');
    assert.equal(unit.low, null);
    assert.equal(unit.stockMatch, false);
  }
  const validBand = screeningTreeUnitPrice(tree('austrian-pine-large', { height: 6, crownWidth: 4, crownDepth: 3 }));
  assert.equal(validBand.low, 16900);
});

test('custom plant quote covers an edited specimen without silent price-factor scaling', () => {
  const selected = tree('austrian-pine-large', { height: 8, crownWidth: 7, crownDepth: 7, unitPrice: 72500 });
  const result = estimateScreeningTreeCosts({ ...serviceQuotes, screeningTrees: [selected], costPriceFactor: 300, costContingency: 0 });
  assert.equal(result.rows[0].unit.source, 'custom');
  assert.equal(result.rows[0].unit.stockMatch, false);
  assert.equal(result.lines.plants.low, 72500);
  assert.equal(result.status, 'estimate');
  near(result.total.low, 72500 + 250 + 149 + 1200 + 2000 + 600);
});

test('panel price follows measured dimensions and never prices a much deeper crown at the small-panel reference', () => {
  assert.equal(screeningTreeUnitPrice(tree('pleached-hornbeam')).low, 2190);
  for (const crownDepth of [.45, .8, 16]) {
    const expanded = screeningTreeUnitPrice(tree('pleached-hornbeam', { crownDepth }));
    assert.equal(expanded.status, 'quote-required');
    assert.equal(expanded.low, null);
    assert.match(expanded.reason, /supplier does not specify panel depth/i);
  }
  const quoted = screeningTreeUnitPrice(tree('pleached-hornbeam', { crownDepth: .8, unitPrice: 4300 }));
  assert.equal(quoted.low, 4300);
  assert.equal(quoted.source, 'custom');
  assert.equal(screeningTreeUnitPrice(tree('pleached-hornbeam', { crownBase: 1 })).status, 'quote-required');
  assert.equal(screeningTreeUnitPrice(tree('pleached-hornbeam', { height: 5 })).status, 'quote-required');
});

test('zero service amounts cannot masquerade as a full installed-tree quotation', () => {
  const result = estimateScreeningTreeCosts({ screeningTrees: [tree('austrian-pine-medium')], costContingency: 20 });
  assert.equal(result.lines.plants.low, 13500);
  assert.equal(result.total, null);
  assert.equal(result.status, 'quote-required');
  assert.deepEqual(result.unquotedServices.map(item => item.id), ['planting', 'anchoring', 'delivery', 'equipment', 'establishment']);
  assert.deepEqual(result.knownSubtotal, { low: 13500, high: 16200 });
});

test('pleached-only order does not double-count included delivery or add automatic heavy lifting', () => {
  const trees = [tree('pleached-hornbeam', { id: 'panel-1' }), tree('pleached-hornbeam', { id: 'panel-2' })];
  const result = estimateScreeningTreeCosts({ ...serviceQuotes, screeningTrees: trees, costContingency: 0 });
  assert.equal(result.count, 2);
  assert.equal(result.lines.delivery, 0);
  assert.equal(result.lines.equipment, 0);
  assert.equal(result.allDeliveryIncluded, true);
  assert.equal(result.status, 'estimate');
  near(result.total.low, 2 * (2190 + 250 + 149) + 600);
  const unquoted = estimateScreeningTreeCosts({ screeningTrees: trees });
  assert.deepEqual(unquoted.unquotedServices.map(item => item.id), ['planting', 'anchoring', 'establishment']);
});

test('mixed order pays shared delivery and lifting once, with per-tree labour and anchoring', () => {
  const trees = [tree('pleached-hornbeam'), tree('serbian-spruce')];
  const result = estimateScreeningTreeCosts({ ...serviceQuotes, screeningTrees: trees, costContingency: 0 });
  assert.equal(result.lines.delivery, 1200);
  assert.equal(result.lines.equipment, 2000);
  assert.equal(result.lines.planting, 500);
  assert.equal(result.lines.anchoring, 298);
  assert.equal(result.lines.establishment, 600);
  near(result.total.low, 2190 + 4950 + 500 + 298 + 1200 + 2000 + 600);
});

test('custom panel plant quote does not inherit catalog delivery and an enlarged panel needs a handling allowance', () => {
  const custom = tree('pleached-hornbeam', { unitPrice: 2400 });
  const normal = estimateScreeningTreeCosts({ ...serviceQuotes, screeningTrees: [custom], costContingency: 0 });
  assert.equal(normal.lines.delivery, 1200);
  assert.equal(normal.allDeliveryIncluded, false);
  assert.equal(normal.lines.equipment, 0);
  const enlarged = estimateScreeningTreeCosts({ ...serviceQuotes, screeningTrees: [{ ...custom, crownDepth: 2 }], costContingency: 0 });
  assert.equal(enlarged.lines.equipment, 2000);
  near(enlarged.total.low, 2400 + 250 + 149 + 1200 + 2000 + 600);
  const missingHandling = estimateScreeningTreeCosts({ ...serviceQuotes, costScreeningCrane: 0,
    screeningTrees: [{ ...custom, height: 8 }] });
  assert.equal(missingHandling.total, null);
  assert.ok(missingHandling.unquotedServices.some(line => line.id === 'equipment'));
});

test('disabled trees have no supply or service cost and create no quote requirement', () => {
  const trees = [tree('austrian-pine-xl', { height: 30, enabled: false })];
  const result = estimateScreeningTreeCosts({ ...serviceQuotes, screeningTrees: trees });
  assert.equal(result.count, 0);
  assert.equal(result.status, 'none');
  assert.deepEqual(result.total, { low: 0, high: 0 });
  assert.deepEqual(result.unquotedServices, []);
  const combined = estimateCosts({ ...noOtherWork, screeningTrees: trees }, site);
  assert.equal(combined.status, 'none');
  assert.deepEqual(combined.total, { low: 0, high: 0 });
});

test('partial specimen quote retains only known plant costs and clearly marks the combined total incomplete', () => {
  const trees = [tree('serbian-spruce'), tree('austrian-pine-xl', { crownWidth: 9 })];
  const combined = estimateCosts({ ...noOtherWork, ...serviceQuotes, screeningTrees: trees, costContingency: 0 }, site);
  assert.equal(combined.total, null);
  assert.equal(combined.status, 'quote-required');
  assert.equal(combined.screeningTrees.plantQuoteCount, 1);
  assert.equal(combined.screeningTrees.lines.plants, null);
  assert.equal(combined.screeningTrees.plantsKnown.low, 4950);
  near(combined.knownSubtotal.low, 4950 + 500 + 298 + 1200 + 2000 + 600);
});

test('combined hedge, earthwork and tree totals receive contingency exactly once', () => {
  const combined = estimateCosts({ ...serviceQuotes, hedgeRear: 2.5, hedgeLeft: 2, hedgeRight: 3,
    gardenRaise: .5, bedRaise: .1, costContingency: 25,
    screeningTrees: [tree('serbian-spruce'), tree('austrian-pine-large')] }, site);
  assert.equal(combined.status, 'estimate');
  const branches = [combined.hedges, combined.earthworks, combined.screeningTrees];
  near(combined.total.low, branches.reduce((total, branch) => total + branch.baseTotal.low, 0));
  near(combined.total.high, branches.reduce((total, branch) => total + branch.baseTotal.high, 0) * 1.25);
  near(combined.total.high, branches.reduce((total, branch) => total + branch.total.high, 0));
});

test('no added trees preserves legacy hedge and earthwork figures even when new allowances are configured', () => {
  const settings = { hedgeRear: 2.5, hedgeLeft: 3, hedgeRight: 2, gardenRaise: .5, bedRaise: 0 };
  const legacy = estimateCosts(settings, site);
  const empty = estimateCosts({ ...settings, ...serviceQuotes, screeningTrees: [] }, site);
  assert.deepEqual(empty.hedges, legacy.hedges);
  assert.deepEqual(empty.earthworks, legacy.earthworks);
  assert.deepEqual(empty.total, legacy.total);
  assert.deepEqual(empty.knownSubtotal, legacy.knownSubtotal);
  assert.deepEqual(empty.notes, legacy.notes);
  assert.equal(empty.screeningTrees.status, 'none');
});
