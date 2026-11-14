import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TREE_CATALOG, getTreeType } from '../src/tree-catalog.js';
import { estimateCosts, estimateScreeningTreeCosts, screeningTreeUnitPrice } from '../src/costs.js';

const sources = JSON.parse(fs.readFileSync(new URL('../data/tree-sources.json', import.meta.url), 'utf8'));
const site = JSON.parse(fs.readFileSync(new URL('../data/site-data.json', import.meta.url), 'utf8'));
const specimen = (typeId, overrides = {}) => ({ typeId, ...getTreeType(typeId).dimensions, enabled: true, ...overrides });
const unknownWidthIds = ['norway-spruce-9-10m', 'thuja-brabant-6-7m', 'austrian-pine-debruyn-8-9m'];

test('Excelsa is the first add-picker option and three published specimens keep their plant budget', () => {
  assert.equal(TREE_CATALOG[0].id, 'thuja-excelsa-9m');
  const budget = estimateScreeningTreeCosts({ screeningTrees: [0, 1, 2].map(i => specimen('thuja-excelsa-9m', { id: `test-${i}` })) });
  assert.equal(budget.lines.plants.low, 28500);
  assert.equal(budget.plantQuoteCount, 0);
  assert.equal(budget.total, null, 'Catalog plant prices must not masquerade as a full installation quote.');
  assert.ok(budget.rows.every(row => row.unit.source === 'published-stock'));
  assert.ok(budget.rows.every(row => row.taxBasis === 'unspecified'));
});

test('height-only listings never manufacture verified crown widths or matching stock', () => {
  const observations = sources.sources.flatMap(source => source.observations || []);
  for (const id of unknownWidthIds) {
    const type = getTreeType(id), observation = observations.find(row => row.typeId === id);
    assert.equal(type.stock.width, undefined);
    assert.equal(observation.widthM, undefined);
    assert.equal(observation.diameterM, undefined);
    assert.equal(type.dimensions.crownWidth, observation.assumedCrownWidthM);
    const price = screeningTreeUnitPrice(specimen(id));
    assert.equal(price.status, 'estimate');
    assert.equal(price.source, 'catalog-assumption');
    assert.equal(price.stockMatch, false);
    assert.equal(price.low, type.pricePLN);
    assert.match(price.reason, /model assumptions, not verified stock dimensions/);
  }
});

test('expanding unquoted crowns cannot buy a larger screen at the height-only catalog price', () => {
  for (const id of unknownWidthIds) {
    const type = getTreeType(id);
    for (const change of [
      { crownWidth: type.dimensions.crownWidth + .1 },
      { crownDepth: type.dimensions.crownDepth + .1 },
      { height: type.stock.height[1] + .1 },
      { height: type.stock.height[0] - .1 },
    ]) {
      const price = screeningTreeUnitPrice(specimen(id, change));
      assert.equal(price.status, 'quote-required', `${id}: ${JSON.stringify(change)}`);
      assert.equal(price.low, null);
      assert.equal(price.stockMatch, false);
    }
    const smaller = screeningTreeUnitPrice(specimen(id, { crownWidth: 1, crownDepth: 1 }));
    assert.equal(smaller.source, 'catalog-assumption');
    assert.equal(smaller.low, type.pricePLN, 'A smaller model crown must not invent a supplier discount.');
    assert.equal(smaller.stockMatch, false);
    const custom = screeningTreeUnitPrice(specimen(id, { crownWidth: 8, crownDepth: 8, unitPrice: 50000 }));
    assert.equal(custom.source, 'custom');
    assert.equal(custom.low, 50000);
    assert.equal(custom.stockMatch, false);
  }
});

test('known-width alternative specimens reject enlarged crowns and keep single-specimen limitations', () => {
  for (const id of ['thuja-excelsa-9m', 'white-fir-9m', 'serbian-spruce-7m', 'nordmann-fir-11m']) {
    const type = getTreeType(id);
    assert.equal(screeningTreeUnitPrice(specimen(id)).stockMatch, true);
    assert.equal(screeningTreeUnitPrice(specimen(id, { crownWidth: type.dimensions.crownWidth + .1 })).status, 'quote-required');
    assert.equal(screeningTreeUnitPrice(specimen(id, { crownDepth: type.dimensions.crownDepth + .1 })).status, 'quote-required');
    assert.match(type.stockNote, /matching|multiples/);
    assert.equal(type.observedAt, '2026-11-14');
    assert.equal(type.taxBasis, 'unspecified');
  }
});

test('euro conversions retain the source currency and explicit fixed planning rate', () => {
  for (const id of ['norway-spruce-9-10m', 'austrian-pine-debruyn-8-9m']) {
    const type = getTreeType(id);
    assert.equal(type.exchangeRatePLNPerEUR, 4.3);
    assert.equal(type.pricePLN, Math.round(type.sourcePriceEUR * type.exchangeRatePLNPerEUR * 100) / 100);
    assert.match(type.exchangeRateNote, /not a live exchange rate/);
    assert.equal(type.taxBasis, 'included');
  }
});

test('net Markflor prices remain labelled net and a custom quote does not inherit the catalog tax basis', () => {
  const settings = { screeningTrees: [specimen('thuja-brabant-6-7m')], hedgeRear: 0, hedgeLeft: 0,
    hedgeRight: 0, gardenRaise: 0, bedRaise: 0, costContingency: 0 };
  const result = estimateCosts(settings, site);
  assert.equal(result.screeningTrees.lines.plants.low, 2800);
  assert.equal(result.screeningTrees.rows[0].taxBasis, 'net');
  assert.ok(result.notes.some(note => /NET, excluding VAT/.test(note)));
  const quoted = estimateScreeningTreeCosts({ screeningTrees: [specimen('thuja-brabant-6-7m', { unitPrice: 3024 })] });
  assert.equal(quoted.rows[0].taxBasis, 'unspecified');
  assert.match(quoted.rows[0].taxNote, /Your plant-only quote/);
  assert.doesNotMatch(quoted.rows[0].taxNote, /supplier explicitly labels/);
});
