/**
 * Site-specific design starting points. Coordinates are local mapped metres.
 * This module contains data only; it does not choose positions at page load.
 */
import {getTreeType} from './tree-catalog.js?v=1.15.0';

const treesFrom = rows => Object.freeze(rows.map((row,index) => {
  const type=getTreeType(row.typeId);
  if(!type)throw new Error(`Unknown tree type in planting layout: ${row.typeId}`);
  return Object.freeze({id:`pine-${index+1}`,typeId:type.id,...type.dimensions,
    rotation:0,enabled:true,unitPrice:0,...row});
}));

// Checked across living-room, terrace, jacuzzi and garden viewpoints. Whole
// crowns remain inside the parcel and clear of fixed hardscape; the nearby rear
// crowns overlap, while stems stay clear of the proposed dining and loungers.
export const STERNICZA_STRATEGIC_TREES = treesFrom([
  {typeId:'austrian-pine-tall',x:16.1,y:29.6},
  {typeId:'austrian-pine-tall',x:12.2,y:32.6},
  {typeId:'austrian-pine-large',x:15.7,y:22.8},
]);
export const STERNICZA_THREE_TALL_TREES = treesFrom([
  {typeId:'austrian-pine-tall',x:16,y:30.3},
  {typeId:'austrian-pine-tall',x:12.2,y:32.6},
  {typeId:'austrian-pine-tall',x:16,y:24},
]);
export const STERNICZA_BUDGET_TREES = treesFrom([
  {typeId:'austrian-pine-tall',x:13.6,y:24.9},
  {typeId:'austrian-pine-large',x:11.3,y:32.9},
  {typeId:'austrian-pine-large',x:11.3,y:26.8},
]);

export const STERNICZA_LAYOUT_SETTINGS = Object.freeze({
  hedgeRear:4,hedgeLeft:4,hedgeRight:4,hedgeInset:.5,
  gardenRaise:.5,bedRaise:0,raiseNewHedges:true,
  terraceDepth:4.2,removeGarage:true,canopyEnabled:false,
});

const layouts = Object.freeze([
  Object.freeze({id:'default',label:'Strategic pines · 2 tall + 1 large · default',
    note:'Design starting point: two 9.5 m pines and one 5.5 m pine. Compare each viewpoint. Uses 4 m hedges, +0.5 m garden fill, a 4.2 m terrace and the garage removed.',
    settings:STERNICZA_LAYOUT_SETTINGS,trees:STERNICZA_STRATEGIC_TREES}),
  Object.freeze({id:'three-tall-pines',label:'Three 9.5 m pines · larger-stock comparison',
    note:'A larger-stock comparison, not a claim of the best value. Compare its view coverage, shade and plant budget with the strategic layout.',
    settings:STERNICZA_LAYOUT_SETTINGS,trees:STERNICZA_THREE_TALL_TREES}),
  Object.freeze({id:'budget-pines',label:'One tall + two smaller pines · lower-cost comparison',
    note:'One 9.5 m pine and two 5.5 m pines. Favors living-room sightlines but leaves more visible from the jacuzzi and garden. Compare each viewpoint and the plant budget.',
    settings:STERNICZA_LAYOUT_SETTINGS,trees:STERNICZA_BUDGET_TREES}),
  Object.freeze({id:'hedges-only',label:'4 m hedges + 0.5 m fill · no specimen trees',
    note:'A tree-free comparison with the same hedge, garden and terrace assumptions.',
    settings:STERNICZA_LAYOUT_SETTINGS,trees:Object.freeze([])}),
]);

// The east-pool spa programme needs different planting positions. Keep the
// previous arrays above for older shared designs and the explicit comparison.
const spaTrees = Object.freeze({
  default:treesFrom([
    {typeId:'austrian-pine-tall',x:17,y:35.3},
    {typeId:'austrian-pine-tall',x:13.3,y:35.3},
    {typeId:'austrian-pine-large',x:16.6,y:22.1},
  ]),
  'three-tall-pines':treesFrom([
    {typeId:'austrian-pine-tall',x:17,y:35.3},
    {typeId:'austrian-pine-tall',x:13.3,y:35.3},
    {typeId:'austrian-pine-tall',x:2.9,y:26.8},
  ]),
  'budget-pines':treesFrom([
    {typeId:'austrian-pine-tall',x:17,y:35.3},
    {typeId:'austrian-pine-large',x:12.7,y:35.7},
    {typeId:'austrian-pine-large',x:16.6,y:22.1},
  ]),
  'hedges-only':Object.freeze([]),
});
const spaLayouts=Object.freeze(layouts.map(layout=>Object.freeze({...layout,
  settings:Object.freeze({...layout.settings,gardenProgram:'spa'}),trees:spaTrees[layout.id],
  note:layout.id==='hedges-only'?'The spa layout with 4 m hedges and no specimen trees.'
    :'Trees positioned around the east pool and spa rooms. Compare the current sightlines and shade; the earlier west-pool screening figures do not apply.',
})));

// The edge-packed programme brings the third full-height crown forward into
// the soil beside the pool. Keep the historical spa arrays above unchanged.
// These catalog-sized crowns deliberately overhang some pool/spa hardscape;
// all trunks have a 1 m illustrative planting allowance and crowns stay inside
// the parcel. The fire bowl itself is outside all crown footprints. This is a
// design comparison, not a nursery root-ball or fire-clearance certification.
// See docs/edge-screening-comparison.md for every named and walkable check.
export const STERNICZA_EDGE_TREES=treesFrom([
  {typeId:'austrian-pine-tall',x:17.6,y:34.9},
  {typeId:'austrian-pine-tall',x:12.9,y:34.3},
  {typeId:'austrian-pine-tall',x:14.4,y:25.7},
]);
export const STERNICZA_EDGE_LIVING_TREES=treesFrom([
  {typeId:'austrian-pine-tall',x:13.9,y:27.3},
  {typeId:'austrian-pine-tall',x:12.5,y:33.4},
  {typeId:'austrian-pine-tall',x:15.2,y:23.2},
]);
// The requested compact grove sits at the far-left/east end of the pool.
// Preserve the published forward-tree arrangement above as a comparison.
// Three 5 m crowns overlap in plan; rearward planting improves the named
// jacuzzi/garden views but leaves more of PCK3 visible from the living room.
// See docs/corner-screening-comparison.md for the measured tradeoff.
export const STERNICZA_CORNER_TREES=treesFrom([
  {typeId:'austrian-pine-tall',x:13.1,y:34.45},
  {typeId:'austrian-pine-tall',x:14.35,y:31},
  {typeId:'austrian-pine-tall',x:17.6,y:34.5},
]);
const edgeSettings=Object.freeze({...STERNICZA_LAYOUT_SETTINGS,gardenProgram:'spa-edge'});
const edgeLayouts=Object.freeze([
  Object.freeze({id:'default',label:'Three 9.5 m pines · rear-left grove · default',
    note:'Three overlapping crowns in a compact group at the far-left/east end of the pool. Strong screening from the jacuzzi and named garden position, but approximately half the sampled PCK3 points remain visible from the living room. Compare Balanced views and Living-room priority. Crowns overhang pool edges; actual foliage has gaps.',
    settings:edgeSettings,trees:STERNICZA_CORNER_TREES}),
  Object.freeze({id:'balanced-views',label:'Three 9.5 m pines · balanced views · previous default',
    note:'Three full-height pines, including a forward crown beside the pool. Balances living-room, terrace, jacuzzi and garden views. Some PCK3 remains visible; inspect each view. Crowns overhang pool/spa edges and need individual planting and maintenance checks.',
    settings:edgeSettings,trees:STERNICZA_EDGE_TREES}),
  Object.freeze({id:'living-priority',label:'Three 9.5 m pines · living-room priority',
    note:'Prioritizes the living-room and terrace sightlines at the same plant cost. At the starting assumptions, the seated living-room samples are hidden and two standing-view sample rays remain. More of PCK3 is visible from the fire lounge and pool paths. Actual foliage has gaps.',
    settings:edgeSettings,trees:STERNICZA_EDGE_LIVING_TREES}),
  Object.freeze({id:'mixed-pines',label:'Two 9.5 m + one 5.5 m pine · lower plant cost',
    note:'Saves 43,000 PLN in catalog plant cost against three tall pines. Compared with Balanced views, more sampled PCK3 remains visible from the living room, jacuzzi and several garden positions. Delivery and installation are extra.',
    settings:edgeSettings,trees:treesFrom([
      {typeId:'austrian-pine-tall',x:14.4,y:26.4},
      {typeId:'austrian-pine-tall',x:13,y:33.8},
      {typeId:'austrian-pine-large',x:16.8,y:33.8},
    ])}),
  Object.freeze({id:'budget-pines',label:'One 9.5 m + two 5.5 m pines · budget comparison',
    note:'A lower plant-cost comparison that favors the main terrace and garden viewpoint but leaves substantially more exposure from dining, loungers and pool paths. Compare every occupied area.',
    settings:edgeSettings,trees:treesFrom([
      {typeId:'austrian-pine-tall',x:14.2,y:25.7},
      {typeId:'austrian-pine-large',x:13.3,y:33.1},
      {typeId:'austrian-pine-large',x:9.3,y:24.7},
    ])}),
  Object.freeze({id:'hedges-only',label:'4 m hedges + 0.5 m fill · no specimen trees',
    note:'The edge-packed spa with the same hedges, fill and terrace, without specimen trees.',
    settings:edgeSettings,trees:Object.freeze([])}),
]);

// Keep the requested rear-left grove compact while moving it slightly east.
// Pine 1 overlaps both other nominal crowns, preserving a connected canopy.
// The historical spa-edge arrays above remain literal and unchanged. The
// outer crown crosses the east boundary by about 0.29 m; its full volume is
// an explicit design assumption, not an approved planting right.
export const STERNICZA_LEFT_EDGE_TREES=treesFrom([
  {typeId:'austrian-pine-tall',x:13.3,y:34.5},
  {typeId:'austrian-pine-tall',x:14.35,y:31},
  {typeId:'austrian-pine-tall',x:18.1,y:34.5},
]);
export const STERNICZA_WIDER_LEFT_EDGE_TREES=treesFrom([
  {typeId:'austrian-pine-tall',x:13.5,y:35},
  {typeId:'austrian-pine-tall',x:14.4,y:30},
  {typeId:'austrian-pine-tall',x:19.3,y:33.8},
]);
const compactSettings=Object.freeze({...edgeSettings,gardenProgram:'spa-compact'});
const compactLayouts=Object.freeze([
  Object.freeze({id:'default',label:'Three 9.5 m pines · compact left-edge grove · default',
    note:'A compact connected grove at the rear-left/east pool end. The outer pine moves 0.50 m farther left and the rear inner pine 0.20 m left; the middle pine stays in place. Nominal crowns overlap through the rear inner pine. Tree 3\'s modeled crown extends approximately 0.29 m beyond the left boundary; full-crown screening assumes this overhang. Living-room screening improves only modestly: about half the sampled PCK3 points remain visible. Compare Wider left-edge, Balanced views and Living-room priority.',
    settings:compactSettings,trees:STERNICZA_LEFT_EDGE_TREES}),
  Object.freeze({id:'wider-left-edge',label:'Wider left-edge · stronger house screen',
    note:'Spreads the three pines across a 5.8 × 5.0 m trunk envelope and brings the middle crown forward. It hides more sampled PCK3 points from the house, but the 5 m crowns no longer overlap in plan. The outer crown extends approximately 1.49 m beyond the left boundary. This is a wider comparison, not the compact-grove default or a complete-concealment guarantee.',
    settings:compactSettings,trees:STERNICZA_WIDER_LEFT_EDGE_TREES}),
  Object.freeze({id:'contained-corner',label:'Three 9.5 m pines · contained corner · previous grove',
    note:'The previous corner group with all three modeled crowns inside the parcel. It retains stronger screening from the named jacuzzi and garden positions but leaves more of PCK3 visible from the living room. Crowns overhang parts of the pool; actual foliage has gaps.',
    settings:compactSettings,trees:STERNICZA_CORNER_TREES}),
  ...edgeLayouts.filter(layout=>layout.id!=='default').map(layout=>Object.freeze({...layout,settings:compactSettings})),
]);

// A forward pine sits beside the far corner of the moved 7 m pool. This is a
// deliberately staggered group, not the old compact triangle. The two rear
// crowns keep the garden and jacuzzi screen while the closer crown intercepts
// the higher living-room sightlines. Historical arrays above remain unchanged.
export const STERNICZA_POOL_END_TREES=treesFrom([
  {typeId:'austrian-pine-tall',x:13,y:34.1},
  {typeId:'austrian-pine-tall',x:14.4,y:25.7},
  {typeId:'austrian-pine-tall',x:17.6,y:34.9},
]);
const screenedSettings=Object.freeze({...compactSettings,gardenProgram:'spa-screened',hedgeFront:4});
const screenedLayouts=Object.freeze([
  Object.freeze({id:'default',label:'Three 9.5 m pines · pool-end screen · default',
    note:'The pool moves 5 m toward the house and shortens to 7 × 3.5 m. The nearest pine sits beside its far corner, 0.8 m toward the house from the water end, with a 1.02 m trunk-to-coping gap. Two pines remain in the rear-left/east area; all three modeled crowns fit inside the parcel. At the starting assumptions about 90% of living-room, 92% of jacuzzi, 95% of sunken-lounge and over 99% of named garden PCK3 samples are hidden; paths and dining can remain more exposed. Actual foliage has gaps.',
    settings:screenedSettings,trees:STERNICZA_POOL_END_TREES}),
  Object.freeze({id:'previous-compact-grove',label:'Previous compact grove · same moved pool',
    note:'The v1.10 pine positions on the moved 7 m pool plan, for a direct tree-position comparison. Select the previous compact spa garden layout to restore its original 8 m pool as well.',
    settings:screenedSettings,trees:STERNICZA_LEFT_EDGE_TREES}),
  ...compactLayouts.filter(layout=>layout.id!=='default').map(layout=>Object.freeze({...layout,settings:screenedSettings})),
]);

// The nearest trunk is explicitly 2.00 m from the centre trunk. All three
// nominal 5 m crowns overlap; the user-requested close spacing takes priority
// over the earlier forward-tree sightline optimisation. Preserve that older
// array and programme above so existing shared designs keep their geometry.
export const STERNICZA_TIGHT_GROVE_TREES=treesFrom([
  {typeId:'austrian-pine-tall',x:13,y:34.1},
  {typeId:'austrian-pine-tall',x:14.2,y:32.5},
  {typeId:'austrian-pine-tall',x:17.6,y:34.9},
]);
const groveSettings=Object.freeze({...screenedSettings,gardenProgram:'spa-grove'});
const groveLayouts=Object.freeze([
  Object.freeze({id:'default',label:'Close pine grove · default',
    note:'The nearest pine sits just 2.00 m from the centre pine, keeping all three overlapping crowns together at the far-left/east pool end. The 7 × 3.5 m pool ends 1.00 m before that trunk, with 1.42 m to the coping. All three modeled crowns fit inside the parcel. At the starting assumptions, about 41% of seated living-room, 40% of standing living-room, 85% of jacuzzi and over 99% of named garden PCK3 samples are hidden. Close planting needs nursery/root-ball confirmation; actual foliage has gaps.',
    settings:groveSettings,trees:STERNICZA_TIGHT_GROVE_TREES}),
  Object.freeze({id:'previous-spaced-pines',label:'Previous spaced pines · same pool',
    note:'The earlier pine positions on the close-grove pool plan, with the nearest pine 8.52 m from the centre pine. This offers stronger living-room screening, but the trees form a spaced arrangement. Choose the Previous spaced pines garden layout to restore the earlier pool position as well.',
    settings:groveSettings,trees:STERNICZA_POOL_END_TREES}),
  ...compactLayouts.filter(layout=>!['default','hedges-only'].includes(layout.id)).map(layout=>Object.freeze({...layout,settings:groveSettings})),
  Object.freeze({id:'hedges-only',label:'4 m front and garden hedges · no specimen trees',
    note:'The close-grove pool plan with the same front and garden hedges, fill and terrace, without specimen trees.',
    settings:groveSettings,trees:Object.freeze([])}),
]);

// The three crowns form a connected fan across PCK3's facade in the main
// occupied views. The forward crown needs the 6 m pool's released soil strip.
// Preserve every older array so saved designs retain their published meaning.
export const STERNICZA_ALIGNED_TREES=treesFrom([
  {typeId:'austrian-pine-tall',x:17,y:26.8},
  {typeId:'austrian-pine-tall',x:14.4,y:28.4},
  {typeId:'austrian-pine-tall',x:12.6,y:32.7},
]);
const alignedSettings=Object.freeze({...screenedSettings,gardenProgram:'spa-aligned',hedgeFullPerimeter:true});
const alignedLayouts=Object.freeze([
  Object.freeze({id:'default',label:'PCK3-aligned grove · default',
    note:'Three 9.5 m pines fan across PCK3, with the forward and centre trunks 3.05 m apart and overlapping crowns joining the rear tree. All three modeled crowns fit inside the parcel. The pool is 6 × 3.5 m, with 1.02 m from its far coping to the forward trunk. At the starting assumptions, the dense facade check finds about 99% of living-room, 94% of jacuzzi and 91% of named garden wall samples hidden. Some facade and roof areas remain visible, especially from the garden and sunken lounge. The rear trunk is 1.00 m from the fixed garden viewpoint. Four-metre thujas follow the full front, left, right and rear edges, with access openings. Actual foliage has gaps.',
    settings:alignedSettings,trees:STERNICZA_ALIGNED_TREES}),
  Object.freeze({id:'previous-close-grove',label:'Previous close rear grove · same 6 m pool',
    note:'The previous 2 m close-pair tree positions on the current pool and perimeter-hedge plan, for a direct planting comparison. Choose the previous close-grove garden layout to restore its 7 m pool as well.',
    settings:alignedSettings,trees:STERNICZA_TIGHT_GROVE_TREES}),
  ...groveLayouts.filter(layout=>!['default','hedges-only'].includes(layout.id)).map(layout=>Object.freeze({...layout,settings:alignedSettings})),
  Object.freeze({id:'hedges-only',label:'4 m full-perimeter thujas · no specimen trees',
    note:'The 6 m pool plan with the same full-perimeter thujas, fill and terrace, without specimen trees. Access openings remain clear.',
    settings:alignedSettings,trees:Object.freeze([])}),
]);

// Placement takes priority: every new-default trunk stays in the rear-left/
// east zone, with no separate forward tree in the central garden. The default
// uses the documented stock band's upper endpoints, not larger invented stock.
// Availability of three specimens at both endpoints still needs confirmation.
export const STERNICZA_REAR_CORNER_TREES=treesFrom([
  {typeId:'austrian-pine-tall',x:17.3,y:31,height:10,crownWidth:6,crownDepth:6},
  {typeId:'austrian-pine-tall',x:14.8,y:31.1,height:10,crownWidth:6,crownDepth:6},
  {typeId:'austrian-pine-tall',x:14.5,y:34.9,height:10,crownWidth:6,crownDepth:6},
]);
export const STERNICZA_CORNER_MIDPOINT_TREES=treesFrom([
  {typeId:'austrian-pine-tall',x:17.3,y:31},
  {typeId:'austrian-pine-tall',x:14.8,y:31.1},
  {typeId:'austrian-pine-tall',x:14.5,y:34.9},
]);
export const STERNICZA_COMPACT_REAR_CORNER_TREES=treesFrom([
  {typeId:'austrian-pine-tall',x:15.4,y:33.4},
  {typeId:'austrian-pine-tall',x:17.7,y:33.4},
  {typeId:'austrian-pine-tall',x:16.6,y:35.3},
]);
export const STERNICZA_FARTHER_LEFT_CORNER_TREES=treesFrom([
  {typeId:'austrian-pine-tall',x:16.7,y:32},
  {typeId:'austrian-pine-tall',x:19,y:32},
  {typeId:'austrian-pine-tall',x:17.9,y:33.9},
]);
const rearCornerSettings=Object.freeze({...alignedSettings,gardenProgram:'spa-corner'});
const rearCornerLayouts=Object.freeze([
  Object.freeze({id:'default',label:'Rear-left corner grove · default',
    note:'All three pines stay together in the rear-left/east corner, with no forward central-garden tree. The nearest pair is 2.50 m apart and all modeled crowns overlap and stay inside the parcel. This default assumes specimens at the upper end of the documented 9–10 m height / 4–6 m crown stock band: 10 m high with 6 m crowns. Actual stock and crown shape are unconfirmed; the 9.5 m / 5 m midpoint is a separate comparison at the same positions. The 179,700 PLN plant subtotal is a catalog reference, not a supplier quote. Dense PCK3 wall samples hidden are about 84% seated living room, 82% standing, 73% jacuzzi and 97% at the named garden point. Parts of the facade and roof remain visible. The 6 × 3.5 m pool, other spa features and 4 m full-perimeter thujas retain their existing geometry.',
    settings:rearCornerSettings,trees:STERNICZA_REAR_CORNER_TREES}),
  Object.freeze({id:'catalog-midpoint-corner',label:'Same corner grove · 9.5 m / 5 m stock',
    note:'The same rear-left/east trunk positions using the catalog-band midpoint dimensions, 9.5 m height and 5 m crown diameter. This preserves the corner grouping with less assumed crown size. All modeled crowns remain inside the parcel; some PCK3 facade and roof remains visible from the house and jacuzzi.',
    settings:rearCornerSettings,trees:STERNICZA_CORNER_MIDPOINT_TREES}),
  Object.freeze({id:'compact-rear-corner',label:'Tight rear-left triangle · 9.5 m stock',
    note:'A 2.3 × 1.9 m trunk triangle farther back in the same rear-left/east corner, with every pair 2.20–2.30 m apart. All 5 m crowns fit inside the parcel. This is closest to a small rear-corner clump, but leaves substantially more PCK3 visible from the living room and jacuzzi.',
    settings:rearCornerSettings,trees:STERNICZA_COMPACT_REAR_CORNER_TREES}),
  Object.freeze({id:'farther-left-corner',label:'Farther-left corner · boundary overhang',
    note:'The whole tight triangle shifts farther left/east while staying in the rear corner. Trunks remain at least 1.31 m inside the parcel, but the 5 m crowns extend about 1.19 m and 0.09 m beyond the east edge. Screening assumes those full crowns; this is not approved boundary overhang. Moving farther left does not fully hide PCK3 and reduces screening from the named garden point.',
    settings:rearCornerSettings,trees:STERNICZA_FARTHER_LEFT_CORNER_TREES}),
  Object.freeze({id:'previous-aligned-grove',label:'Previous v1.13 · forward screening arrangement',
    note:'The exact v1.13 tree positions and midpoint sizes, kept as an explicit comparison. They offer stronger house screening, but spread trees forward into the central garden. They are not the new corner-constrained default.',
    settings:rearCornerSettings,trees:STERNICZA_ALIGNED_TREES}),
  ...alignedLayouts.filter(layout=>!['default','hedges-only'].includes(layout.id)).map(layout=>Object.freeze({...layout,settings:rearCornerSettings})),
  Object.freeze({id:'hedges-only',label:'4 m full-perimeter thujas · no specimen trees',
    note:'The same 6 m pool, spa geometry, garden fill and front/left/right/rear thujas without specimen trees. Pedestrian and vehicle openings remain clear.',
    settings:rearCornerSettings,trees:Object.freeze([])}),
]);

// Reconstructed from the user's 14 November whole-plot reference, rather than
// generated by a sightline optimiser. Keep the 6 / 6 / 5 m crown footprints in
// that image and raise the third tree to the requested 10 m. The eastern crown
// and both rear crowns deliberately overhang the parcel; disclose that physical
// assumption instead of silently pulling the reference trees into the garden.
export const STERNICZA_REFERENCE_POOL_TREES=treesFrom([
  {typeId:'austrian-pine-tall',x:19.3,y:30.2,height:10,crownWidth:6,crownDepth:6},
  {typeId:'austrian-pine-tall',x:13.8,y:35.8,height:10,crownWidth:6,crownDepth:6},
  {typeId:'austrian-pine-tall',x:18.45,y:35.57,height:10,crownWidth:5,crownDepth:5},
]);
const poolGroveSettings=Object.freeze({...rearCornerSettings,gardenProgram:'spa-pool-grove'});
const poolGroveLayouts=Object.freeze([
  Object.freeze({id:'default',label:'Reference pines + pool beside grove · default',
    note:'Three 10 m Austrian pines follow the supplied whole-plot reference: one by the left/east boundary and two at the rear, with 6 / 6 / 5 m crowns. Tree 1 ↔ 3 is 5.44 m and tree 2 ↔ 3 is 4.66 m. The pool is 8 × 3.5 m, moved 6.8 m rearward and 1.18 m inward, with approximately 1 m from full coping to the nearest trunk centres. All trunks remain inside the plot, but the modeled crowns extend about 2.0 m east, 0.8 m rear and 0.6 m east respectively. These are reference-based concept positions; root balls, excavation, crown overhang and stock need confirmation. Full-perimeter 4 m thujas retain their access openings. PCK3 visibility is measured separately from each view; the layout does not guarantee complete concealment. Choose the Previous rear-left corner garden layout to restore the v1.14 pool and planting comparisons.',
    settings:poolGroveSettings,trees:STERNICZA_REFERENCE_POOL_TREES}),
  Object.freeze({id:'hedges-only',label:'4 m full-perimeter thujas · no specimen trees',
    note:'The same 8 m pool, spa geometry, garden fill and front/left/right/rear thujas without specimen trees. Pedestrian and vehicle openings remain clear. Choose the Previous rear-left corner garden layout to restore the v1.14 pool and planting comparisons.',
    settings:poolGroveSettings,trees:Object.freeze([])}),
]);

export function getScreeningLayouts(siteId,program='spa-pool-grove') {
  return siteId==='sternicza-11'?(program==='spa-pool-grove'?poolGroveLayouts:program==='spa-corner'?rearCornerLayouts:program==='spa-aligned'?alignedLayouts:program==='spa-grove'?groveLayouts:program==='spa-screened'?screenedLayouts:program==='spa-compact'?compactLayouts:program==='spa-edge'?edgeLayouts:program==='spa'?spaLayouts:layouts):Object.freeze([]);
}
