/**
 * Editable planning costs in PLN. Quantities follow the proposed rear garden
 * and selected street hedge, not the full property. Price anchors are dated supplier observations; labour,
 * logistics and uncertainty remain visible allowances, not contractor quotes.
 */
import { hedgeSegments, jacuzziBounds, canopyBounds, terraceGroundReference } from './geometry.js?v=1.11.0';
import { getTreeType } from './tree-catalog.js?v=1.11.0';
import { gardenProgram, poolBounds } from './garden-program.js?v=1.11.0';
import { GARDEN_PLANNING_RATES as RATES, GARDEN_BUDGET_REVIEWED_AT } from './garden-budget-catalog.js?v=1.11.0';
import { gardenFurniture, terraceStairs } from './layout.js?v=1.11.0';

const field = (label, value, min, max, step, unit, help = '') => ({
  label, value, min, max, step, unit, help, group: 'cost', input: 'number',
});
const treeField = (label, max, unit, help) => ({ ...field(label, 0, 0, max, 1, unit, help), group: 'cost-tree' });
export const COST_FIELDS = Object.freeze({
  costSpacing: field('Tree spacing', .8, .3, 2, .05, 'm', 'Centre-to-centre spacing; density and nursery crown width still need checking.'),
  costTreePriceRear: field('Rear: custom tree price', 0, 0, 100000, 10, 'PLN/tree', '0 uses published stock prices. Enter a supplier quote for taller trees.'),
  costTreePriceLeft: field('Left / east: custom tree price', 0, 0, 100000, 10, 'PLN/tree', '0 uses published stock prices.'),
  costTreePriceRight: field('Right / west: custom tree price', 0, 0, 100000, 10, 'PLN/tree', '0 uses published stock prices.'),
  costTreePriceFront: field('Front / street: custom tree price', 0, 0, 100000, 10, 'PLN/tree', '0 uses published stock prices. Access openings are excluded from the planted length.'),
  costPriceFactor: field('Tree price multiplier', 100, 10, 500, 5, '%', 'Applies to automatic supplier-price anchors; custom unit prices are used unchanged.'),
  costPlantingRate: field('Planting allowance', 75, 0, 5000, 5, 'PLN/tree', 'Editable labour allowance; large stock and lifting can cost more.'),
  costHedgeDelivery: field('Tree delivery allowance', 1000, 0, 50000, 100, 'PLN', 'One allowance for the whole hedge order, not one per side.'),
  costHedgeEquipment: field('Tree lifting / equipment', 0, 0, 100000, 500, 'PLN', 'Enter a lifting and access quote for large root balls; zero means not budgeted.'),
  costScreeningPlanting: treeField('Screening-tree planting', 50000, 'PLN/tree', 'Planting labour per enabled tree. 0 uses the planning range when enabled, otherwise needs a quote. Supply is separate.'),
  costScreeningAnchoring: treeField('Screening-tree anchoring', 20000, 'PLN/tree', 'Anchoring per enabled tree. 0 uses the planning range when enabled, otherwise needs a quote.'),
  costScreeningDelivery: treeField('Screening-tree delivery', 100000, 'PLN/order', 'One order allowance. 0 uses the planning range when enabled, otherwise needs a quote. No extra delivery on catalog pleached-only orders.'),
  costScreeningCrane: treeField('Screening-tree crane / unloading', 100000, 'PLN/order', 'One lifting/access allowance. 0 uses the planning range when enabled, otherwise needs a quote. Not automatically applied to pleached panels.'),
  costScreeningEstablishment: treeField('Screening-tree irrigation / establishment', 100000, 'PLN/order', 'Tree-specific establishment work, separate from permanent garden irrigation. 0 uses the planning range when enabled; not an annual maintenance budget.'),
  ...Object.fromEntries([
    ['costSpaPool','Swimming pool · installed'],['costSpaJacuzzi','Edge jacuzzi · installed'],
    ['costSpaSauna','Six-person sauna · installed'],['costSpaColdPlunge','Cold plunge · installed'],
    ['costSpaFirepit','Sunken fire lounge · installed'],
  ].map(([key,label])=>[key,{...field(label,0,0,2000000,100,'PLN','Complete installed quote override. 0 uses the planning range when enabled, otherwise needs a quote. Include equipment, excavation, foundations, local drainage, connections and installation.'),group:'cost-spa'}])),
  ...Object.fromEntries([
    ['costGardenTerrace','Raised terrace, finish and steps'],['costGardenPaving','Paths and dining paving'],
    ['costGardenFurniture','Dining set and loungers'],['costGardenPlanting','Ornamental planting'],
    ['costGardenLawn','Lawn finish'],['costGardenIrrigation','Permanent garden irrigation'],
    ['costGardenLighting','Landscape lighting'],['costGardenUtilities','Shared garden utilities'],
    ['costGardenDemolition','Detached garage removal'],['costGardenDesign','Garden design and coordination'],
    ['costGardenCanopy','Terrace canopy'],
  ].map(([key,label])=>[key,{...field(label,0,0,2000000,100,'PLN','Complete line quote override. 0 uses the itemised planning allowance when enabled, otherwise needs a quote for active work. Optional canopy / demolition apply only when selected.'),group:'cost-garden'}])),
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
  costUsePlanningAllowances: false,
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
  if (typeof settings.costUsePlanningAllowances === 'boolean') result.costUsePlanningAllowances = settings.costUsePlanningAllowances;
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
    settings.hedgeInset ?? 0, c.costBedWidth, ...['Rear', 'Left', 'Right', 'Front'].map(side => positive(settings[`hedge${side}`] ?? (side==='Front'?0:2.5)) > 0)]);
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
  // The street hedge remains on original front grade. It creates no raised
  // bed or rear-garden earthwork quantity, even when extra rear beds are on.
  const beds = segments.filter(s => s.height > 0 && s.side !== 'front').map(s => {
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
  const lengths = Object.fromEntries(['rear', 'left', 'right', 'front'].map(side => [side,
    sum(segments.filter(s => s.side === side).map(s => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1])))]));
  const frontSegmentLengths=segments.filter(s=>s.side==='front').map(s=>Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1]));
  const value = { rearGrossArea, excludedArea, automaticArea, bedArea, lengths, frontSegmentLengths };
  quantityCache.set(data.site, { signature, value });
  return value;
}

const scaledRange = (rates, quantity = 1) => range(rates[0] * quantity, rates[1] * quantity);
const quantityText = (value, unit) => `${value.toFixed(1)} ${unit}`;
function installedLine(c, key, estimate, basis, scope, referenceIds = [], label = COST_FIELDS[key].label) {
  const quoted = c[key] > 0;
  const cost = quoted ? range(c[key]) : c.costUsePlanningAllowances ? estimate : null;
  return { key, label, amount:c[key], quoted, cost, basis, scope, referenceIds,
    priceStatus:quoted ? 'user-quote' : cost ? 'planning-allowance' : 'quote-required' };
}
function installationGroup(enabled, rows, c, extra = {}) {
  const unquoted = rows.filter(row => row.cost === null);
  const knownBase = addRanges(rows.map(row => row.cost).filter(Boolean));
  const knownSubtotal = withContingency(knownBase,c.costContingency);
  return { enabled,rows,unquoted,knownBase,knownSubtotal,
    total:unquoted.length ? null : knownSubtotal,
    status:!enabled ? 'none' : unquoted.length ? 'quote-required' : 'estimate',
    planningEnabled:c.costUsePlanningAllowances,...extra };
}

export function estimateSpaCosts(settings,data) {
  const program=gardenProgram(settings,data),c=costSettings(settings),enabled=program.active;
  if(!enabled)return installationGroup(false,[],c);
  const tub=jacuzziBounds(settings,data),pool=poolBounds(settings,data),compact=['spa-compact','spa-screened'].includes(program.id);
  const rows=[
    installedLine(c,'costSpaPool',scaledRange(RATES.pool),`${pool.width.toFixed(1)} × ${pool.length.toFixed(1)} m water · 1 installed pool`,
      'Shell, filtration, heating, cover, excavation and disposal, base, coping, delivery, local connections and commissioning. 8 × 3 m catalog packages are a reference, not a quote for this 3.5 m pool.',['pool']),
    installedLine(c,'costSpaJacuzzi',scaledRange(tub.overflow?RATES.overflowJacuzzi:RATES.jacuzzi),`${tub.width.toFixed(2)} × ${tub.length.toFixed(2)} m · ${tub.overflow?'bespoke overflow concept':'7-seat factory-style spa'}`,
      tub.overflow?'Full custom overflow spa, structure, balance tank, hydraulics and installation allowance. No supplier quote; not a certified modification of Vienna Life.'
        :'Factory spa, reinforced support, recessed service chamber, local connections, delivery and commissioning. Removable terrace access is in the terrace line.',['jacuzzi'],tub.overflow?'Custom overflow jacuzzi · installed':'Seven-seat recessed jacuzzi · installed'),
    installedLine(c,'costSpaSauna',scaledRange(compact?RATES.sauna:RATES.legacyLargeSauna),`${program.sauna.width.toFixed(1)} × ${program.sauna.length.toFixed(1)} m external · 6 seated places`,
      'Cabin, heater, glazing, insulated base, access steps, delivery, local electrical connection and installation. Custom diagonal glazing needs its own offer.',['sauna']),
    installedLine(c,'costSpaColdPlunge',scaledRange(RATES.plunge),`${program.coldPlunge.width.toFixed(1)} × ${program.coldPlunge.length.toFixed(1)} m feature · 1 chiller`,
      'Plunge shell, chiller, pad, steps, local water/electric connections and installation. The catalog product is smaller; this is a custom-feature allowance.',['plunge']),
    installedLine(c,'costSpaFirepit',scaledRange(RATES.firepit),`${program.firepit.width.toFixed(1)} × ${program.firepit.length.toFixed(1)} m · ${program.firepit.depth.toFixed(2)} m sunken`,
      'Excavation and disposal, retaining structure, waterproofing, drainage, built-in seats and cushions, burner and fuel installation. Burner reference is net; the full planning range aims to include tax.',['fire']),
  ];
  return installationGroup(true,rows,c,{overflow:tub.overflow});
}

/** Finishes and enabling work; no plant supply, spa objects or bulk fill repeated. */
export function estimateGardenCosts(settings,data,quantities=gardenQuantities(settings,data)) {
  const c=costSettings(settings),program=gardenProgram(settings,data);
  const enabled=['spa-compact','spa-screened'].includes(program.id)||c.costUsePlanningAllowances||
    Object.entries(COST_FIELDS).some(([key,f])=>f.group==='cost-garden'&&c[key]>0);
  if(!enabled)return installationGroup(false,[],c,{quantities:{}});
  const terrace=data.site.terrace,tub=jacuzziBounds(settings,data);
  const terraceGross=positive(terrace.width)*positive(settings.terraceDepth??terrace.depth);
  const terraceNet=Math.max(0,terraceGross-tub.width*tub.length);
  const furniture=gardenFurniture(data,settings),dining=furniture.dining,path=furniture.path||[];
  const pathLength=sum(path.slice(1).map((point,i)=>Math.hypot(point[0]-path[i][0],point[1]-path[i][1])));
  const pavingArea=dining.width*dining.length+pathLength*1.15*.9;
  const rearY=data.site.rearMidpoint[1],rear=clipHalfPlane(openRing(data.site.boundary),p=>p[1]-rearY);
  const pool=poolBounds(settings,data),extra=[],baseExclusions=[data.site.house.footprint,
    rectangle(terrace.x,rearY,terrace.width,positive(settings.terraceDepth??terrace.depth))];
  if(pool){baseExclusions.push(rectangle(pool.x,pool.y,pool.width,pool.length));extra.push(rectangle(pool.x-pool.coping,pool.y-pool.coping,pool.width+2*pool.coping,pool.length+2*pool.coping));}
  if(settings.removeGarage===false&&data.site.garage?.footprint)baseExclusions.push(data.site.garage.footprint);
  if(program.active){
    for(const item of [program.sauna,program.firepit,program.coldPlunge])baseExclusions.push(item.footprint);
    extra.push(program.firepit.outerFootprint,...(program.sauna.entrySteps||[]).map(step=>step.footprint),
      ...(program.coldPlunge.steps||[]).map(step=>rectangle(step.x,step.y,step.width,step.length)));
  }
  const steps=terraceStairs(terrace,positive(settings.terraceDepth??terrace.depth),terraceGroundReference(settings,data).drop,settings,data);
  if(steps.length>0)extra.push(rectangle(steps.x,steps.y,steps.width,steps.length));
  // Finish estimates must not assign lawn/ornamentals to coping or access stairs
  // that already belong to object / terrace prices. Intersections count once.
  const additionalHardscape=Math.max(0,unionAreaInside(rear,[...baseExclusions,...extra])-quantities.excludedArea);
  const landscapeArea=Math.max(0,quantities.automaticArea-quantities.bedArea-pavingArea-additionalHardscape);
  const ornamentalArea=landscapeArea*.2,lawnArea=landscapeArea-ornamentalArea;
  // A one-metre planted-strip equivalent adds front-hedge drip distribution
  // to the existing irrigation allowance. This is not front lawn or fill.
  const frontIrrigationArea=quantities.lengths.front;
  const irrigatedArea=landscapeArea+quantities.bedArea+frontIrrigationArea,loungers=furniture.loungers.length;
  const garageArea=settings.removeGarage!==false&&data.site.garage?.footprint?polygonArea(data.site.garage.footprint):0;
  const canopy=canopyBounds(settings,data),canopyArea=settings.canopyEnabled?positive(canopy.x1-canopy.x0)*positive(canopy.y1-canopy.y0):0;
  const rows=[
    installedLine(c,'costGardenTerrace',addRanges([scaledRange(RATES.terracePerM2,terraceNet),scaledRange(RATES.terraceSteps)]),
      `${quantityText(terraceNet,'m² net')} × 1,000–1,700 PLN/m² + 8,000–15,000 steps`,
      'Raised terrace frame, waterproofing, finish, removable spa service hatches and garden steps. Jacuzzi support is in the spa line; house facade / doors are excluded.'),
    installedLine(c,'costGardenPaving',scaledRange(RATES.pavingPerM2,pavingArea),`${quantityText(pavingArea,'m²')} × 450–800 PLN/m²`,
      'Dining pad plus a 1.15 m path with 90% stone coverage. Finish and local sub-base; excludes pool coping, terrace, access stairs and spa foundations.'),
    installedLine(c,'costGardenFurniture',addRanges([scaledRange(RATES.diningSet),scaledRange(RATES.lounger,loungers),scaledRange(RATES.furnitureDelivery)]),
      `1 dining set (6 seats) + ${loungers} loungers + delivery / handling allowance`,
      'Movable furniture only. Built-in lounge seats/cushions are in the fire-lounge line. The named Cloveris benchmarks advertise free delivery; the generic range reserves 500–1,500 PLN for alternative delivery or placement assistance. Product references are not additional costs.',['furniture','lounger']),
    installedLine(c,'costGardenPlanting',scaledRange(RATES.plantingPerM2,ornamentalArea),`${quantityText(ornamentalArea,'m² assumed beds')} × 180–350 PLN/m²`,
      'Assume 20% of garden left after hedge beds and paving. Ornamental plants, mulch and planting labour; excludes thujas, specimen trees and added bulk topsoil.'),
    installedLine(c,'costGardenLawn',scaledRange(RATES.lawnPerM2,lawnArea),`${quantityText(lawnArea,'m²')} × 40–75 PLN/m²`,
      'Lawn finish and fine grading on prepared soil. No additional bulk fill or topsoil charged here.'),
    installedLine(c,'costGardenIrrigation',scaledRange(RATES.irrigationPerM2,irrigatedArea),`${quantityText(irrigatedArea,'m² irrigation basis')} × 35–65 PLN/m²${frontIrrigationArea>EPS?` · includes ${quantityText(frontIrrigationArea,'m² front-hedge strip')}`:''}`,
      'Permanent distribution, controls and installation for beds, hedges and lawn. Front hedge uses a provisional 1 m planted-strip width for drip irrigation only; no front lawn or fill. Specimen establishment visits / temporary root-ball watering are separate.'),
    installedLine(c,'costGardenLighting',scaledRange(RATES.lightFixture,12),'12 assumed fittings × 700–1,500 PLN installed',
      'Landscape fittings and local low-voltage wiring. Spa built-in lights belong to their object lines; the main supply is in shared utilities.'),
    installedLine(c,'costGardenUtilities',scaledRange(RATES.utilities),'1 shared garden supply / distribution allowance',
      'Shared garden electric and water feeds, distribution and drain connections only. Object-level hookups and garden-fill drainage are excluded here to avoid duplication.'),
    installedLine(c,'costGardenDesign',scaledRange(RATES.design),'1 garden design / technical coordination package',
      'Garden design, level coordination and structural / services coordination allowances, including the selected front hedge. House renovation, basement garage, new gates / fencing and main utility upgrades are outside this garden budget.'),
  ];
  if(garageArea>EPS)rows.push(installedLine(c,'costGardenDemolition',scaledRange(RATES.demolitionPerM2,garageArea),`${quantityText(garageArea,'m² garage footprint')} × 500–900 PLN/m²`,
    'Allowance for removal of the detached garage and its waste transport/disposal. Final demolition method and quantities require a site quote. No separate duplicate general-waste charge.'));
  if(canopyArea>EPS)rows.push(installedLine(c,'costGardenCanopy',scaledRange(RATES.canopyPerM2,canopyArea),`${quantityText(canopyArea,'m² canopy')} × 1,700–3,000 PLN/m²`,
    'Selected terrace canopy, supports and installation; not charged when the canopy is disabled.'));
  return installationGroup(true,rows,c,{quantities:{terraceGross,terraceNet,pavingArea,pathLength,additionalHardscape,ornamentalArea,lawnArea,irrigatedArea,frontIrrigationArea,garageArea,canopyArea,loungers}});
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

/** Enabled trees only. Optional planning services never fill missing plant prices. */
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
  const largeCount=rows.filter(row=>row.height>5).length,smallCount=count-largeCount;
  const autoServices={
    planting:addRanges([scaledRange(RATES.largeTreePlanting,largeCount),scaledRange(RATES.smallTreePlanting,smallCount)]),
    anchoring:addRanges([scaledRange(RATES.largeTreeAnchoring,largeCount),scaledRange(RATES.smallTreeAnchoring,smallCount)]),
    delivery:scaledRange(RATES.treeDelivery),equipment:scaledRange(RATES.treeCrane),
    establishment:largeCount?scaledRange(RATES.treeEstablishment):range(500,1500),
  };
  const serviceRows=serviceSpecs.map(([id,label,value,applicable])=>{
    const cost=!applicable?range():value>0?range(value):c.costUsePlanningAllowances?autoServices[id]:null;
    const basis=['planting','anchoring'].includes(id)?`${count} trees (${largeCount} above 5 m; ${smallCount} smaller)`:'One order';
    return {id,label,applicable,cost,basis,priceStatus:!applicable?'included-or-not-required':value>0?'user-quote':cost?'planning-allowance':'quote-required'};
  });
  const unquotedServices = serviceRows.filter(row=>row.priceStatus==='quote-required').map(({id,label})=>({id,label}));
  const lines = { plants: plantQuoteCount ? null : plantsKnown,
    ...Object.fromEntries(serviceRows.map(({id,cost})=>[id,cost?.low??0])) };
  const lineStatuses = Object.fromEntries(serviceRows.map(row=>[row.id,row.priceStatus==='user-quote'?'allowance':row.priceStatus]));
  const knownBase = addRanges([plantsKnown,...serviceRows.map(row=>row.cost).filter(Boolean)]);
  const unknown = plantQuoteCount > 0 || unquotedServices.length > 0;
  const knownSubtotal = withContingency(knownBase, c.costContingency);
  return { rows, count, plantsKnown, plantQuoteCount, lines, lineStatuses, serviceRows, unquotedServices,
    deliveryRequired, liftingRequired, allDeliveryIncluded: count > 0 && !deliveryRequired,
    knownBase, knownSubtotal, baseTotal: unknown ? null : knownBase,
    total: unknown ? null : knownSubtotal,
    status: unknown ? 'quote-required' : count ? 'estimate' : 'none' };
}

/** Main public API. All monetary amounts are PLN, all volumes cubic metres. */
export function estimateCosts(settings = {}, data) {
  const c = costSettings(settings), q = gardenQuantities(settings, data);
  const notes = [];
  const sides = ['rear', 'left', 'right',...(q.frontSegmentLengths.length?['front']:[])].map(side => {
    const suffix = side[0].toUpperCase() + side.slice(1);
    const height = positive(settings[`hedge${suffix}`] ?? (side==='front'?0:2.5)), length = q.lengths[side];
    // Each disconnected front span needs its own plant count. Never bridge
    // the pedestrian / vehicle openings to round down a combined order.
    const count = height > 0 && c.buyNewThujas ? side==='front'
      ?sum(q.frontSegmentLengths.map(length=>Math.ceil(Math.max(0,length-EPS)/c.costSpacing)))
      :Math.ceil(Math.max(0, length - EPS) / c.costSpacing) : 0;
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
  if(q.frontSegmentLengths.length)notes.push('Front / street thujas are counted separately on each planted span; proposed pedestrian and vehicle openings are excluded. The street hedge follows original ground, with no front-garden fill or raised-bed charge. New gates, fencing and driveway construction are excluded.');

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
  const garden=estimateGardenCosts(settings,data,q);
  if(spa.enabled)notes.push(c.costUsePlanningAllowances
    ?'Installed spa ranges are planning assumptions, supported by separate product references. They include each object’s foundations, local connections and commissioning. They are not supplier quotations for this site.'
    :'Spa structures use installed contractor allowances, not catalog estimates. Fill excludes sauna, sunken lounge and cold-plunge footprints. The fire lounge needs its own excavation, waterproofing and drainage design; pool and jacuzzi hydraulics, structural support and overflow collection are included only when quoted.');
  if(spa.unquoted.length)notes.push(`Spa items awaiting installed quotes: ${spa.unquoted.map(item=>item.label).join(', ')}. Zero is not a free installation.`);
  if(garden.unquoted.length)notes.push(`Garden works awaiting installed quotes: ${garden.unquoted.map(item=>item.label).join(', ')}. Turn on planning allowances for preliminary ranges or enter complete line quotes.`);
  if(garden.enabled)notes.push('Scope covers the rear garden and selected front hedge: terrace, spa programme, planting, site works and selected garage removal / canopy. Property purchase, house renovation, basement garage, front driveway, gates / fencing, operating bills and major utility-capacity upgrades are excluded.');
  if(garden.enabled)notes.push('No double charge for hedge/specimen supply, garden-fill drainage/retaining or spa foundations in garden finishes. Pool coping and built-in lounge seats belong to their spa lines. Terrace finish excludes the jacuzzi footprint. Ordinary paths and lawn need finish only, with bulk fill accounted separately.');
  if(c.costUsePlanningAllowances)notes.push('Planning rates are explicit design assumptions, not surveyed contractor rates. Ranges aim to include applicable tax, but published references retain their own gross/net/unspecified tax labels. No supplier has provided a site-specific offer; replace whole-line allowances with confirmed installed gross quotations.');
  if (screeningTrees.plantQuoteCount) notes.push('An edited screening tree is not supported by its catalog price reference. Enter a plant-only quote for that specimen; prices are not extrapolated to other dimensions.');
  if (screeningTrees.unquotedServices.length) notes.push(`Screening-tree services not yet budgeted: ${screeningTrees.unquotedServices.map(item => item.label.toLowerCase()).join(', ')}. Zero means unquoted; the known subtotal includes only priced items.`);
  if (screeningTrees.count) notes.push('Screening-tree prices describe purchased specimens, not mature sizes or guaranteed available stock. Only enabled trees are included. Catalog references were reviewed 12 November 2026; crown shape and density still need specimen confirmation.');
  if (screeningTrees.rows.some(row => row.typeId === 'serbian-spruce' || row.typeId === 'pleached-hornbeam')) notes.push('Serbian spruce and pleached hornbeam use displayed retail amounts whose VAT basis needs supplier confirmation. Enter final tax-inclusive quotes for purchasing.');
  // Combine unadjusted branches first; apply uncertainty once to the upper sum.
  const knownBase = addRanges([hedgeKnownBase, earthBase, screeningTrees.knownBase,spa.knownBase,garden.knownBase]);
  const knownSubtotal = withContingency(knownBase, c.costContingency);
  const unknown = hedgeUnknown || screeningTrees.status === 'quote-required' || spa.status==='quote-required' || garden.status==='quote-required';
  return {
    currency: 'PLN', basisDate: GARDEN_BUDGET_REVIEWED_AT, contingencyPercent: c.costContingency, planningEnabled:c.costUsePlanningAllowances,
    hedges: { sides, count, length, spacing: c.costSpacing, procurement: c.buyNewThujas,
      lines: hedgeLines, baseTotal: hedgeUnknown ? null : hedgeKnownBase,
      total: hedgeUnknown ? null : hedgeKnown, knownSubtotal: hedgeKnown,
      status: hedgeUnknown ? 'quote-required' : count > 0 ? 'estimate' : 'none' },
    earthworks: { ...q, area, isAreaOverride: c.costAreaOverride > 0, gardenVolume, bedVolume,
      compactedVolume, bulkFillVolume, topsoilVolume, looseFillVolume, looseTopsoilVolume,
      looseVolume: looseFillVolume + looseTopsoilVolume, looseFactor: c.costLooseFactor,
      loads, fillLoads, topsoilLoads, truckCapacity: c.costTruckCapacity,
      lines: earthLines, baseTotal: earthBase, total: earthTotal, status: hasEarthwork ? 'estimate' : 'none' },
    screeningTrees,spa,garden,
    total: unknown ? null : knownSubtotal, knownSubtotal,
    status: unknown ? 'quote-required' : count > 0 || hasEarthwork || screeningTrees.count > 0 || spa.enabled || garden.enabled ? 'estimate' : 'none', notes,
  };
}
