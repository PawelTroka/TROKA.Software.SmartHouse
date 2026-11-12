/**
 * Editable planning costs in PLN. Quantities follow the proposed rear garden,
 * not the full property. Price anchors are dated supplier observations; labour,
 * logistics and uncertainty remain visible allowances, not contractor quotes.
 */
import { hedgeSegments } from './geometry.js?v=1.7.0';
import { getTreeType } from './tree-catalog.js?v=1.7.0';
import { gardenProgram, poolBounds } from './garden-program.js?v=1.7.0';

const field = (label, value, min, max, step, unit, help = '') => ({
  label, value, min, max, step, unit, help, group: 'cost', input: 'number',
});
const treeField = (label, max, unit, help) => ({ ...field(label, 0, 0, max, 1, unit, help), group: 'cost-tree' });
export const COST_FIELDS = Object.freeze({
  costSpacing: field('Tree spacing', .8, .3, 2, .05, 'm', 'Centre-to-centre spacing; density and nursery crown width still need checking.'),
  costTreePriceRear: field('Rear: custom tree price', 0, 0, 100000, 10, 'PLN/tree', '0 uses published stock prices. Enter a supplier quote for taller trees.'),
  costTreePriceLeft: field('Left / east: custom tree price', 0, 0, 100000, 10, 'PLN/tree', '0 uses published stock prices.'),
  costTreePriceRight: field('Right / west: custom tree price', 0, 0, 100000, 10, 'PLN/tree', '0 uses published stock prices.'),
  costPriceFactor: field('Tree price multiplier', 100, 10, 500, 5, '%', 'Applies to automatic supplier-price anchors; custom unit prices are used unchanged.'),
  costPlantingRate: field('Planting allowance', 75, 0, 5000, 5, 'PLN/tree', 'Editable labour allowance; large stock and lifting can cost more.'),
  costHedgeDelivery: field('Tree delivery allowance', 1000, 0, 50000, 100, 'PLN', 'One allowance for the whole hedge order, not one per side.'),
  costHedgeEquipment: field('Tree lifting / equipment', 0, 0, 100000, 500, 'PLN', 'Enter a lifting and access quote for large root balls; zero means not budgeted.'),
  costScreeningPlanting: treeField('Screening-tree planting', 50000, 'PLN/tree', 'Supply prices exclude planting. 0 means unquoted; enter your allowance or contractor quote per enabled tree.'),
  costScreeningAnchoring: treeField('Screening-tree anchoring', 20000, 'PLN/tree', '0 means unquoted. Wyplatane lists a three-stake and tape kit at 149 PLN/tree; other specimens need an appropriate system and quote.'),
  costScreeningDelivery: treeField('Screening-tree delivery', 100000, 'PLN/order', 'One allowance for trees whose supplier price excludes delivery; 0 means unquoted. No delivery charge is added for a pleached-only order.'),
  costScreeningCrane: treeField('Screening-tree crane / unloading', 100000, 'PLN/order', 'One lifting/access allowance for large specimens; 0 means unquoted. Not automatically applied to pleached hornbeam panels.'),
  costScreeningEstablishment: treeField('Screening-tree irrigation / establishment', 100000, 'PLN/order', 'Editable allowance for establishment work across the tree order. 0 means unquoted; this is not an annual maintenance model.'),
  ...Object.fromEntries([
    ['costSpaPool','Swimming pool · installed'],['costSpaJacuzzi','Edge jacuzzi · installed'],
    ['costSpaSauna','Six-person sauna · installed'],['costSpaColdPlunge','Cold plunge · installed'],
    ['costSpaFirepit','Sunken fire lounge · installed'],
  ].map(([key,label])=>[key,{...field(label,0,0,2000000,100,'PLN','0 means unquoted. Include structure, equipment, excavation, drainage, connections and installation in the contractor allowance.'),group:'cost-spa'}])),
  costAreaOverride: field('Fill area override', 0, 0, 1000, 1, 'm²', '0 uses mapped rear area minus pool, terrace and retained structures. A positive value changes cost quantities only.'),
  costBedWidth: field('Raised hedge bed width', 1, .3, 3, .1, 'm', 'Width centred on the hedge line and clipped to the property; overlapping corners count once.'),
  costTopsoilDepth: field('Topsoil within added depth', .15, 0, .5, .05, 'm', 'Topsoil replaces part of the fill; it is not added above the selected raise.'),
  costLooseFactor: field('Loose delivery multiplier', 1.2, 1, 2, .05, '×', 'Allowance for loose delivered material versus finished in-place volume.'),
  costFillRate: field('Bulk fill material', 75, 0, 1000, 5, 'PLN/m³', 'Per loose delivered cubic metre, before the separate delivery allowance.'),
  costTopsoilRate: field('Topsoil material', 110, 0, 1000, 5, 'PLN/m³', 'Per loose cubic metre; quality and local supplier quotes vary.'),
  costEarthworkRate: field('Spreading / compaction', 50, 0, 1000, 5, 'PLN/m³', 'Per finished in-place cubic metre; editable planning allowance.'),
  costTruckCapacity: field('Soil truck capacity', 10, 2, 30, 1, 'm³/load', 'Loose cubic metres per delivery; editable assumption, subject to truck weight and site access.'),
  costSoilDelivery: field('Soil delivery per load', 500, 0, 10000, 50, 'PLN/load', 'Editable transport allowance. Bulk fill and topsoil loads are rounded up separately.'),
  costRetainingAllowance: field('Retaining edges allowance', 8000, 0, 200000, 500, 'PLN', 'Provisional allowance, not a retaining-wall design or quote.'),
  costDrainageAllowance: field('Drainage allowance', 3000, 0, 100000, 250, 'PLN', 'Provisional allowance; roof water and neighbouring levels need a site design.'),
  costAccessAllowance: field('Access / site preparation', 1500, 0, 100000, 250, 'PLN', 'Provisional allowance for access and preparation. Does not include garage demolition.'),
  costContingency: field('Budget uncertainty allowance', 20, 0, 100, 5, '%', 'Added to the upper estimate only; not a market confidence interval.'),
});
export const COST_DEFAULTS = Object.freeze({
  ...Object.fromEntries(Object.entries(COST_FIELDS).map(([k, f]) => [k, f.value])),
  buyNewThujas: true,
});

// Supplier observations (see data/cost-sources.json). No extrapolation above 4m.
// Bounds describe offered plant-height bands. Pricing uses the next suitable
// stock band, never a fabricated linear price per metre of tree height.
export const THUJA_PRICE_BANDS = Object.freeze([
  { maxHeight: .6, low: 7.49, high: 29 },
  { maxHeight: .8, low: 10, high: 10 },
  { maxHeight: 1, low: 20, high: 20 },
  { maxHeight: 1.2, low: 25, high: 48 },
  { maxHeight: 1.3, low: 30, high: 55 },
  { maxHeight: 1.4, low: 30, high: 60 },
  { maxHeight: 1.5, low: 40, high: 65 },
  { maxHeight: 1.6, low: 40, high: 75 },
  { maxHeight: 1.7, low: 85, high: 85 },
  { maxHeight: 1.8, low: 97, high: 97 },
  { maxHeight: 1.9, low: 105, high: 105 },
  { maxHeight: 2, low: 115, high: 115 },
  { maxHeight: 2.1, low: 135, high: 135 },
  { maxHeight: 2.2, low: 150, high: 150 },
  { maxHeight: 2.3, low: 160, high: 160 },
  { maxHeight: 2.4, low: 170, high: 170 },
  { maxHeight: 2.5, low: 180, high: 199 },
  { maxHeight: 2.7, low: 200, high: 200 },
  { maxHeight: 3, low: 250, high: 250 },
  { maxHeight: 3.5, low: 250, high: 250 },
  { maxHeight: 4, low: 300, high: 300 },
]);
const EPS = 1e-8;
const positive = v => Math.max(0, Number.isFinite(Number(v)) ? Number(v) : 0);
const sum = values => values.reduce((a, b) => a + b, 0);
const range = (low = 0, high = low) => ({ low, high });
const addRanges = values => range(sum(values.map(v => v.low)), sum(values.map(v => v.high)));
const withContingency = (value, percent) => range(value.low, value.high * (1 + percent / 100));
function costSettings(settings) {
  const result = { ...COST_DEFAULTS };
  for (const [key, f] of Object.entries(COST_FIELDS)) {
    const n = settings[key];
    if (typeof n === 'number' && Number.isFinite(n)) result[key] = Math.max(f.min, Math.min(f.max, n));
  }
  if (typeof settings.buyNewThujas === 'boolean') result.buyNewThujas = settings.buyNewThujas;
  return result;
}
function openRing(polygon) {
  if (!polygon?.length) return [];
  const points = polygon.map(p => [p[0], p[1]]);
  return Math.hypot(points[0][0] - points.at(-1)[0], points[0][1] - points.at(-1)[1]) < EPS ? points.slice(0, -1) : points;
}
function signedArea(polygon) {
  return polygon.reduce((s, a, i) => {
    const b = polygon[(i + 1) % polygon.length]; return s + a[0] * b[1] - b[0] * a[1];
  }, 0) / 2;
}
export function polygonArea(polygon) { return Math.abs(signedArea(openRing(polygon))); }
function clipHalfPlane(polygon, signedDistance) {
  if (!polygon.length) return [];
  const result = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const da = signedDistance(a), db = signedDistance(b), insideA = da >= -EPS, insideB = db >= -EPS;
    if (insideA) result.push(a);
    if (insideA !== insideB) {
      const t = da / (da - db);
      result.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return result;
}
/** Clip a subject polygon by a convex polygon. Works with either winding. */
function intersect(subject, clip) {
  let result = openRing(subject), edges = openRing(clip);
  const orientation = signedArea(edges) >= 0 ? 1 : -1;
  for (let i = 0; i < edges.length && result.length; i++) {
    const a = edges[i], b = edges[(i + 1) % edges.length];
    result = clipHalfPlane(result, p => orientation * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])));
  }
  return result;
}
function rectangle(x, y, width, depth) { return [[x, y], [x + width, y], [x + width, y + depth], [x, y + depth]]; }
/** Inclusion-exclusion prevents corners or overlapping exclusions counting twice. */
function unionAreaInside(region, polygons) {
  let total = 0;
  function visit(start, clipped, sign) {
    for (let i = start; i < polygons.length; i++) {
      const next = intersect(clipped, polygons[i]), area = polygonArea(next);
      if (area <= EPS) continue;
      total += sign * area;
      visit(i + 1, next, -sign);
    }
  }
  visit(0, region, 1);
  return Math.max(0, total);
}
const quantityCache = new WeakMap();
/** Areas on the mapped plan, before soil-depth and delivery multipliers. */
export function gardenQuantities(settings, data) {
  const c = costSettings(settings);
  const signature = JSON.stringify([settings.gardenProgram,settings.terraceDepth ?? 4.2, settings.removeGarage !== false,
    settings.hedgeInset ?? 0, c.costBedWidth, ...['Rear', 'Left', 'Right'].map(side => positive(settings[`hedge${side}`] ?? 2.5) > 0)]);
  // data.site survives building sensitivity overrides, so cost geometry is reused.
  const cached = quantityCache.get(data.site);
  if (cached?.signature === signature) return cached.value;
  const rearY = data.site.rearMidpoint[1];
  const rear = clipHalfPlane(openRing(data.site.boundary), p => p[1] - rearY);
  const t = data.site.terrace, pool = poolBounds(settings,data),program=gardenProgram(settings,data);
  const exclusions = [data.site.house.footprint,
    rectangle(t.x, rearY, t.width, positive(settings.terraceDepth ?? t.depth))];
  if(pool)exclusions.push(rectangle(pool.x, pool.y, pool.width, pool.length));
  if (settings.removeGarage === false && data.site.garage?.footprint) exclusions.push(data.site.garage.footprint);
  if(program.active)for(const item of [program.sauna,program.firepit,program.coldPlunge])exclusions.push(item.footprint);
  const rearGrossArea = polygonArea(rear), excludedArea = unionAreaInside(rear, exclusions);
  const automaticArea = Math.max(0, rearGrossArea - excludedArea);
  const segments = hedgeSegments(settings, data);
  const beds = segments.filter(s => s.height > 0).map(s => {
    const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], length = Math.hypot(dx, dy);
    const nx = -dy / length * c.costBedWidth / 2, ny = dx / length * c.costBedWidth / 2;
    return [[s.a[0] + nx, s.a[1] + ny], [s.b[0] + nx, s.b[1] + ny],
      [s.b[0] - nx, s.b[1] - ny], [s.a[0] - nx, s.a[1] - ny]];
  });
  // Union the bed rectangles, then subtract the portion also in an exclusion.
  let bedArea = unionAreaInside(rear, beds);
  function excludedBedArea(start, clipped, sign) {
    let area = 0;
    for (let i = start; i < exclusions.length; i++) {
      const next = intersect(clipped, exclusions[i]);
      if (polygonArea(next) <= EPS) continue;
      area += sign * unionAreaInside(next, beds);
      area += excludedBedArea(i + 1, next, -sign);
    }
    return area;
  }
  bedArea = Math.max(0, bedArea - excludedBedArea(0, rear, 1));
  const lengths = Object.fromEntries(['rear', 'left', 'right'].map(side => [side,
    sum(segments.filter(s => s.side === side).map(s => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1])))]));
  const value = { rearGrossArea, excludedArea, automaticArea, bedArea, lengths };
  quantityCache.set(data.site, { signature, value });
  return value;
}

export function estimateSpaCosts(settings,data) {
  const enabled=gardenProgram(settings,data).active,c=costSettings(settings);
  const rows=enabled?Object.entries(COST_FIELDS).filter(([,f])=>f.group==='cost-spa').map(([key,f])=>({key,label:f.label,amount:c[key],quoted:c[key]>0})):[];
  const knownBase=range(sum(rows.map(row=>row.amount))),unquoted=rows.filter(row=>!row.quoted);
  return {enabled,rows,unquoted,knownBase,knownSubtotal:withContingency(knownBase,c.costContingency),
    total:unquoted.length?null:withContingency(knownBase,c.costContingency),status:!enabled?'none':unquoted.length?'quote-required':'estimate'};
}

export function thujaUnitPrice(height, customPrice = 0, factor = 100) {
  if (height <= 0) return { ...range(), status: 'none', source: 'none' };
  if (customPrice > 0) return { ...range(customPrice), status: 'estimate', source: 'custom' };
  const band = THUJA_PRICE_BANDS.find(item => height <= item.maxHeight + EPS);
  if (!band) return { low: null, high: null, status: 'quote-required', source: 'unquoted' };
  return { ...range(band.low * factor / 100, band.high * factor / 100), status: 'estimate', source: 'published-stock', stockBandMaximum: band.maxHeight };
}

/**
 * A purchased specimen price applies only to the documented stock envelope.
 * Round-crown depth uses the quoted diameter band as a circular assumption.
 * Panel depth is unquoted: increasing it beyond the drawing default requires
 * a custom quote rather than silently buying a much larger crown. No extrapolation.
 */
export function screeningTreeUnitPrice(tree = {}) {
  const type = getTreeType(tree.typeId);
  if (!type) return { low: null, high: null, status: 'quote-required', source: 'unquoted', stockMatch: false, reason: 'Unknown tree type; choose a catalog specimen.' };
  const dimensions = Object.fromEntries(Object.entries(type.dimensions).map(([key, fallback]) =>
    [key, typeof tree[key] === 'number' && Number.isFinite(tree[key]) ? tree[key] : fallback]));
  const inBand = (value, band) => value >= band[0] - EPS && value <= band[1] + EPS;
  const mismatches = [];
  if (!inBand(dimensions.height, type.stock.height)) mismatches.push('height');
  if (!inBand(dimensions.crownWidth, type.stock.width)) mismatches.push('crown width');
  if (type.form !== 'panel' && !inBand(dimensions.crownDepth, type.stock.width)) mismatches.push('crown depth (assumed circular diameter)');
  const expandedPanelDepth = type.form === 'panel' && dimensions.crownDepth > type.dimensions.crownDepth + EPS;
  if (expandedPanelDepth) mismatches.push('panel depth');
  if (type.stock.crownBase && !inBand(dimensions.crownBase, type.stock.crownBase)) mismatches.push('clear-stem height');
  const stockMatch = mismatches.length === 0;
  const custom = positive(tree.unitPrice);
  if (custom > 0) return { ...range(custom), status: 'estimate', source: 'custom', stockMatch, reason: 'Your plant-only unit price; installation and logistics remain separate.' };
  if (!stockMatch) return { low: null, high: null, status: 'quote-required', source: 'unquoted', stockMatch,
    reason: `${expandedPanelDepth ? `The supplier does not specify panel depth. A crown deeper than the ${type.dimensions.crownDepth} m drawing assumption needs a custom quote. ` : ''}Edited ${mismatches.join(', ')} is not supported by this price reference. Enter a custom plant price; prices are not extrapolated to other sizes.` };
  return { ...range(type.pricePLN), status: 'estimate', source: 'published-stock', stockMatch,
    reason: type.priceNote };
}

/** Enabled screening trees only. Zero service allowances stay visibly unquoted. */
export function estimateScreeningTreeCosts(settings = {}) {
  const c = costSettings(settings);
  const trees = Array.isArray(settings.screeningTrees) ? settings.screeningTrees.filter(tree =>
    tree && typeof tree === 'object' && !Array.isArray(tree) && tree.enabled !== false) : [];
  const rows = trees.map((tree, index) => {
    const type = getTreeType(tree.typeId), unit = screeningTreeUnitPrice(tree);
    const height = tree.height ?? type?.dimensions.height;
    const crownWidth = tree.crownWidth ?? type?.dimensions.crownWidth;
    const crownDepth = tree.crownDepth ?? type?.dimensions.crownDepth;
    const expandedPanel = type?.form === 'panel' && (height > type.dimensions.height + EPS
      || crownWidth > type.dimensions.crownWidth + EPS || crownDepth > type.dimensions.crownDepth + EPS);
    return { id: tree.id || `tree-${index + 1}`, typeId: tree.typeId, label: type?.label || 'Unknown tree',
      height, crownWidth, crownDepth,
      unit, plants: unit.low === null ? null : range(unit.low, unit.high), status: unit.status,
      sourceUrl: type?.sourceUrl, sourceTitle: type?.sourceTitle, priceNote: type?.priceNote,
      taxNote: type?.taxNote, deliveryIncluded: type?.deliveryIncluded === true && unit.source === 'published-stock',
      liftingQuoteRequired: type?.liftingQuoteRequired !== false || expandedPanel };
  });
  const count = rows.length;
  const deliveryRequired = count > 0 && rows.some(row => !row.deliveryIncluded);
  const liftingRequired = count > 0 && rows.some(row => row.liftingQuoteRequired);
  const plantQuoteCount = rows.filter(row => row.unit.status === 'quote-required').length;
  const plantsKnown = addRanges(rows.map(row => row.plants).filter(Boolean));
  const serviceSpecs = [
    ['planting', 'Planting', count * c.costScreeningPlanting, count > 0],
    ['anchoring', 'Anchoring', count * c.costScreeningAnchoring, count > 0],
    ['delivery', 'Delivery', deliveryRequired ? c.costScreeningDelivery : 0, deliveryRequired],
    ['equipment', 'Crane / unloading', liftingRequired ? c.costScreeningCrane : 0, liftingRequired],
    ['establishment', 'Irrigation / establishment', count ? c.costScreeningEstablishment : 0, count > 0],
  ];
  const unquotedServices = serviceSpecs.filter(([, , value, applicable]) => applicable && value <= 0)
    .map(([id, label]) => ({ id, label }));
  const lines = { plants: plantQuoteCount ? null : plantsKnown,
    ...Object.fromEntries(serviceSpecs.map(([id, , value]) => [id, value])) };
  const lineStatuses = Object.fromEntries(serviceSpecs.map(([id, , value, applicable]) =>
    [id, !applicable ? 'included-or-not-required' : value > 0 ? 'allowance' : 'quote-required']));
  const knownBase = addRanges([plantsKnown, range(sum(serviceSpecs.map(([, , value]) => value)))]);
  const unknown = plantQuoteCount > 0 || unquotedServices.length > 0;
  const knownSubtotal = withContingency(knownBase, c.costContingency);
  return { rows, count, plantsKnown, plantQuoteCount, lines, lineStatuses, unquotedServices,
    deliveryRequired, liftingRequired, allDeliveryIncluded: count > 0 && !deliveryRequired,
    knownBase, knownSubtotal, baseTotal: unknown ? null : knownBase,
    total: unknown ? null : knownSubtotal,
    status: unknown ? 'quote-required' : count ? 'estimate' : 'none' };
}

/** Main public API. All monetary amounts are PLN, all volumes cubic metres. */
export function estimateCosts(settings = {}, data) {
  const c = costSettings(settings), q = gardenQuantities(settings, data);
  const notes = [];
  const sides = ['rear', 'left', 'right'].map(side => {
    const suffix = side[0].toUpperCase() + side.slice(1);
    const height = positive(settings[`hedge${suffix}`] ?? 2.5), length = q.lengths[side];
    const count = height > 0 && c.buyNewThujas ? Math.ceil(Math.max(0, length - EPS) / c.costSpacing) : 0;
    const unit = count > 0 ? thujaUnitPrice(height, c[`costTreePrice${suffix}`], c.costPriceFactor) : { ...range(), status: 'none', source: 'none' };
    return { side, height, length, count, unit, plants: unit.low === null ? null : range(count * unit.low, count * unit.high), planting: count * c.costPlantingRate, status: unit.status };
  });
  const count = sum(sides.map(s => s.count)), length = sum(sides.filter(s => s.height > 0).map(s => s.length));
  const hedgeUnknown = sides.some(s => s.status === 'quote-required');
  const plantsKnown = addRanges(sides.map(s => s.plants).filter(Boolean));
  const hedgeLines = {
    plants: hedgeUnknown ? null : plantsKnown,
    planting: sum(sides.map(s => s.planting)),
    delivery: count > 0 ? c.costHedgeDelivery : 0,
    equipment: count > 0 ? c.costHedgeEquipment : 0,
  };
  const hedgeKnownBase = addRanges([plantsKnown, range(hedgeLines.planting + hedgeLines.delivery + hedgeLines.equipment)]);
  const hedgeKnown = withContingency(hedgeKnownBase, c.costContingency);
  if (hedgeUnknown) notes.push('No published stock-price anchor above 4 m. Enter a custom PLN/tree price for every affected side; the known subtotal is incomplete.');
  if (count && sides.some(s => s.height > 4) && !c.costHedgeEquipment) notes.push('Large-tree lifting and access are not budgeted: equipment allowance is zero.');
  if (count) notes.push('Stock height does not guarantee an opaque hedge. Spacing and crown width must be checked with the nursery.');

  const requestedArea = c.costAreaOverride > 0 ? c.costAreaOverride : q.automaticArea;
  const area = Math.min(requestedArea, q.rearGrossArea);
  if (requestedArea > q.rearGrossArea + EPS) notes.push('Fill area override was capped to the mapped gross rear-garden area.');
  const gardenRaise = positive(settings.gardenRaise), bedRaise = positive(settings.bedRaise);
  const gardenVolume = area * gardenRaise, bedVolume = q.bedArea * bedRaise;
  const compactedVolume = gardenVolume + bedVolume;
  const overlap = gardenRaise > 0 ? Math.min(area, q.bedArea) : 0;
  const topsoilVolume = (area - overlap) * Math.min(gardenRaise, c.costTopsoilDepth)
    + overlap * Math.min(gardenRaise + bedRaise, c.costTopsoilDepth)
    + (q.bedArea - overlap) * Math.min(bedRaise, c.costTopsoilDepth);
  const bulkFillVolume = Math.max(0, compactedVolume - topsoilVolume);
  const looseFillVolume = bulkFillVolume * c.costLooseFactor;
  const looseTopsoilVolume = topsoilVolume * c.costLooseFactor;
  const hasEarthwork = compactedVolume > EPS;
  const fillLoads = looseFillVolume > EPS ? Math.ceil((looseFillVolume - EPS) / c.costTruckCapacity) : 0;
  const topsoilLoads = looseTopsoilVolume > EPS ? Math.ceil((looseTopsoilVolume - EPS) / c.costTruckCapacity) : 0;
  const loads = fillLoads + topsoilLoads;
  const earthLines = {
    fillMaterial: looseFillVolume * c.costFillRate,
    topsoilMaterial: looseTopsoilVolume * c.costTopsoilRate,
    spreading: compactedVolume * c.costEarthworkRate,
    transport: loads * c.costSoilDelivery,
    retaining: hasEarthwork ? c.costRetainingAllowance : 0,
    drainage: hasEarthwork ? c.costDrainageAllowance : 0,
    access: hasEarthwork ? c.costAccessAllowance : 0,
  };
  const earthBase = range(sum(Object.values(earthLines)));
  const earthTotal = withContingency(earthBase, c.costContingency);
  if (hasEarthwork) notes.push('Earthwork excludes garage demolition, excavated-pool soil reuse, topsoil stripping/disposal, new paving and professional design. Retaining, drainage, transport and access are editable allowances.');
  if (c.costAreaOverride > 0) notes.push('Area override changes cost quantities only. Bed overlap assumes the raised garden area includes the hedge beds up to the selected area.');
  const screeningTrees = estimateScreeningTreeCosts(settings);
  const spa=estimateSpaCosts(settings,data);
  if(spa.enabled)notes.push('Spa structures use installed contractor allowances, not catalog estimates. Fill excludes sauna, sunken lounge and cold-plunge footprints. The fire lounge needs its own excavation, waterproofing and drainage design; pool and jacuzzi hydraulics, structural support and overflow collection are included only when quoted.');
  if(spa.unquoted.length)notes.push(`Spa items awaiting installed quotes: ${spa.unquoted.map(item=>item.label).join(', ')}. Zero is not a free installation.`);
  if (screeningTrees.plantQuoteCount) notes.push('An edited screening tree is not supported by its catalog price reference. Enter a plant-only quote for that specimen; prices are not extrapolated to other dimensions.');
  if (screeningTrees.unquotedServices.length) notes.push(`Screening-tree services not yet budgeted: ${screeningTrees.unquotedServices.map(item => item.label.toLowerCase()).join(', ')}. Zero means unquoted; the known subtotal includes only priced items.`);
  if (screeningTrees.count) notes.push('Screening-tree prices describe purchased specimens, not mature sizes or guaranteed available stock. Only enabled trees are included. Catalog references were reviewed 12 November 2026; crown shape and density still need specimen confirmation.');
  if (screeningTrees.rows.some(row => row.typeId === 'serbian-spruce' || row.typeId === 'pleached-hornbeam')) notes.push('Serbian spruce and pleached hornbeam use displayed retail amounts whose VAT basis needs supplier confirmation. Enter final tax-inclusive quotes for purchasing.');
  // Combine unadjusted branches first; apply uncertainty once to the upper sum.
  const knownBase = addRanges([hedgeKnownBase, earthBase, screeningTrees.knownBase,spa.knownBase]);
  const knownSubtotal = withContingency(knownBase, c.costContingency);
  const unknown = hedgeUnknown || screeningTrees.status === 'quote-required' || spa.status==='quote-required';
  return {
    currency: 'PLN', basisDate: '2026-11-12', contingencyPercent: c.costContingency,
    hedges: { sides, count, length, spacing: c.costSpacing, procurement: c.buyNewThujas,
      lines: hedgeLines, baseTotal: hedgeUnknown ? null : hedgeKnownBase,
      total: hedgeUnknown ? null : hedgeKnown, knownSubtotal: hedgeKnown,
      status: hedgeUnknown ? 'quote-required' : count > 0 ? 'estimate' : 'none' },
    earthworks: { ...q, area, isAreaOverride: c.costAreaOverride > 0, gardenVolume, bedVolume,
      compactedVolume, bulkFillVolume, topsoilVolume, looseFillVolume, looseTopsoilVolume,
      looseVolume: looseFillVolume + looseTopsoilVolume, looseFactor: c.costLooseFactor,
      loads, fillLoads, topsoilLoads, truckCapacity: c.costTruckCapacity,
      lines: earthLines, baseTotal: earthBase, total: earthTotal, status: hasEarthwork ? 'estimate' : 'none' },
    screeningTrees,spa,
    total: unknown ? null : knownSubtotal, knownSubtotal,
    status: unknown ? 'quote-required' : count > 0 || hasEarthwork || screeningTrees.count > 0 || spa.enabled ? 'estimate' : 'none', notes,
  };
}
