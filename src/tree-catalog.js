/**
 * Purchased specimen sizes and observed Polish nursery prices, 12 November 2026.
 * These are budget anchors, not reservations, installed quotes or mature sizes.
 * Crown bases and depths are modelling assumptions unless explicitly documented.
 */
const observedAt = '2026-11-12';
const pineSource = 'https://galeriaogrodowa.pl/produkt/sosna-czarna-pinus-nigra/';
const grossCatalog = 'Gross retail catalog plant price, including VAT; individual offer and availability required. Transport, unloading and planting extra.';
const evergreenNote = 'Evergreen, but real branches and foliage have gaps. The crown envelope is an optimistic geometric screen, not guaranteed opaque coverage.';
const roundAssumption = 'Crown base is an editable visual assumption, not a supplier measurement. Depth initially equals the listed diameter; confirm the actual crown in both directions.';
const deciduousNote = 'Deciduous. Leaf-on coverage is seasonal; winter screening through retained dry leaves and bare branches is partial and is not credited as an opaque crown.';
const entry = item => Object.freeze({
  observedAt, deliveryIncluded: false, liftingQuoteRequired: true,
  ...item,
  dimensions: Object.freeze(item.dimensions),
  stock: Object.freeze(Object.fromEntries(Object.entries(item.stock).map(([key, value]) =>
    [key, Array.isArray(value) ? Object.freeze(value) : value]))),
});

export const TREE_CATALOG = Object.freeze([
  entry({
    id: 'austrian-pine-medium', label: 'Austrian pine · broad 4.25 m', botanicalName: 'Pinus nigra',
    form: 'ellipsoid', evergreen: true,
    dimensions: { height: 4.25, crownBase: 1, crownWidth: 3.5, crownDepth: 3.5 },
    stock: { height: [4, 4.5], width: [3, 4] }, pricePLN: 13500,
    sourceUrl: pineSource, sourceTitle: 'Galeria Ogrodowa · Austrian pine specimens',
    priceNote: grossCatalog, taxNote: 'VAT included under supplier sales terms.',
    stockNote: 'Purchased specimen 4–4.5 m tall, 3–4 m diameter; transplanted seven times. Model uses range midpoints.',
    dimensionNote: roundAssumption, seasonNote: evergreenNote,
    suitabilityNote: 'Full sun and well-drained soil; RHS H7. Can develop a much larger crown with age.',
  }),
  entry({
    id: 'austrian-pine-large', label: 'Austrian pine · broad 5.5 m', botanicalName: 'Pinus nigra',
    form: 'ellipsoid', evergreen: true,
    dimensions: { height: 5.5, crownBase: 1.3, crownWidth: 3.5, crownDepth: 3.5 },
    stock: { height: [5, 6], width: [3, 4] }, pricePLN: 16900,
    sourceUrl: pineSource, sourceTitle: 'Galeria Ogrodowa · Austrian pine specimens',
    priceNote: grossCatalog, taxNote: 'VAT included under supplier sales terms.',
    stockNote: 'Purchased specimen 5–6 m tall, 3–4 m diameter; transplanted seven times. Model uses range midpoints.',
    dimensionNote: roundAssumption, seasonNote: evergreenNote,
    suitabilityNote: 'Full sun and well-drained soil; RHS H7. Broad evergreen option for a targeted sightline.',
  }),
  entry({
    id: 'austrian-pine-xl', label: 'Austrian pine · broad 6.5 m', botanicalName: 'Pinus nigra',
    form: 'ellipsoid', evergreen: true,
    dimensions: { height: 6.5, crownBase: 1.6, crownWidth: 5, crownDepth: 5 },
    stock: { height: [6, 7], width: [4, 6] }, pricePLN: 44900,
    sourceUrl: pineSource, sourceTitle: 'Galeria Ogrodowa · Austrian pine specimens',
    priceNote: grossCatalog, taxNote: 'VAT included under supplier sales terms.',
    stockNote: 'Purchased specimen 6–7 m tall, 4–6 m diameter; transplanted eight times. Model uses range midpoints.',
    dimensionNote: roundAssumption, seasonNote: evergreenNote,
    suitabilityNote: 'Full sun and well-drained soil; RHS H7. Delivery, root-ball handling and access require an individual quote.',
  }),
  entry({
    id: 'austrian-pine-tall', label: 'Austrian pine · very tall 9.5 m', botanicalName: 'Pinus nigra',
    form: 'ellipsoid', evergreen: true,
    dimensions: { height: 9.5, crownBase: 2.5, crownWidth: 5, crownDepth: 5 },
    stock: { height: [9, 10], width: [4, 6] }, pricePLN: 59900,
    sourceUrl: pineSource, sourceTitle: 'Galeria Ogrodowa · Austrian pine specimens',
    priceNote: grossCatalog, taxNote: 'VAT included under supplier sales terms.',
    stockNote: 'Purchased specimen 9–10 m tall, 4–6 m diameter; transplanted eight times. Model uses range midpoints.',
    dimensionNote: roundAssumption, seasonNote: evergreenNote,
    suitabilityNote: 'Full sun and well-drained soil; RHS H7. Exceptionally large specimen: confirm root-ball handling, machinery and access with the supplier.',
  }),
  entry({
    id: 'serbian-spruce', label: 'Serbian spruce · narrow 6 m', botanicalName: 'Picea omorika',
    form: 'cone', evergreen: true,
    dimensions: { height: 6, crownBase: .35, crownWidth: 1.75, crownDepth: 1.75 },
    stock: { height: [6, 6], width: [1.75, 1.75] }, pricePLN: 4950,
    sourceUrl: 'https://drzewkafischer.pl/solitaire/100/show', sourceTitle: 'Fischer nursery · Serbian spruce specimen',
    priceNote: 'Displayed price for one 6 m × 1.75 m specimen; availability and VAT basis need confirmation. Delivery, unloading and planting extra.',
    taxNote: 'VAT basis not stated on the inspected specimen page.',
    stockNote: 'A catalogued specimen 6 m tall and 1.75 m wide. Multiple matching trees at this price are not guaranteed.',
    dimensionNote: roundAssumption, seasonNote: evergreenNote,
    suitabilityNote: 'Full sun, moist well-drained soil; RHS H7. Shelter from cold drying winds. Narrow, tapered crown suits a small group.',
  }),
  entry({
    id: 'broad-hornbeam', label: 'Hornbeam · summer crown 6 m', botanicalName: 'Carpinus betulus',
    form: 'ellipsoid', evergreen: false,
    dimensions: { height: 6, crownBase: 1.8, crownWidth: 2.5, crownDepth: 2.5 },
    stock: { height: [5, 7], width: [2, 3] }, pricePLN: 11300,
    sourceUrl: 'https://galeriaogrodowa.pl/produkt/grab-pospolity-carpinus-betulus/',
    sourceTitle: 'Galeria Ogrodowa · hornbeam specimens',
    priceNote: grossCatalog, taxNote: 'VAT included under supplier sales terms.',
    stockNote: 'Purchased specimen 5–7 m tall, 2–3 m diameter; trunk circumference 30–35 cm, transplanted five times. Model uses range midpoints.',
    dimensionNote: roundAssumption, seasonNote: deciduousNote,
    suitabilityNote: 'Sun or partial shade, moist well-drained soil; RHS H7. Seasonal broad crown, not year-round opaque screening.',
  }),
  entry({
    id: 'pleached-hornbeam', label: 'Pleached hornbeam · 3.7 m panel', botanicalName: 'Carpinus betulus',
    form: 'panel', evergreen: false,
    dimensions: { height: 3.7, crownBase: 2.2, crownWidth: 1.5, crownDepth: .4 },
    stock: { height: [3.7, 3.7], width: [1.5, 1.5], crownBase: [2.2, 2.2] }, pricePLN: 2190,
    sourceUrl: 'https://wyplatane.pl/products/horizon-carpinus', sourceTitle: 'Wyplatane · Horizon Grab Grande',
    deliveryIncluded: true, liftingQuoteRequired: false,
    priceNote: 'Displayed Grande plant price includes nationwide delivery. Planting extra; optional three stakes and tape 149 PLN/tree. VAT basis not separately confirmed.',
    taxNote: 'Displayed retail PLN; VAT wording not located on the inspected product page.',
    stockNote: '2.2 m clear stem plus a 1.5 m high × 1.5 m wide panel; total about 3.7 m. Trunk circumference 16–18 cm.',
    dimensionNote: 'Stem and panel height/width are supplier specifications. The 0.4 m panel depth is an editable drawing assumption, not quoted stock depth. A deeper crown requires a custom specimen price.',
    seasonNote: deciduousNote,
    suitabilityNote: 'Sun or partial shade; RHS H7. Flat canopy above a hedge, with partial screening and visible gaps in winter.',
  }),
]);

const TYPES_BY_ID = new Map(TREE_CATALOG.map(type => [type.id, type]));
export function getTreeType(id) { return TYPES_BY_ID.get(id) || null; }

/** Describe the edited specimen, while catalog entries retain their stock midpoint. */
export function screeningTreeLabel(tree) {
  const type=getTreeType(tree?.typeId),height=Number(tree?.height??type?.dimensions.height);
  const name=(type?.label||'Tree').split(' · ')[0];
  return Number.isFinite(height)?`${name} · ${Number(height.toFixed(2))} m tall`:name;
}
