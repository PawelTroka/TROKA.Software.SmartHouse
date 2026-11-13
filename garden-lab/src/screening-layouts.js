/**
 * Site-specific design starting points. Coordinates are local mapped metres.
 * This module contains data only; it does not choose positions at page load.
 */
import {getTreeType} from './tree-catalog.js?v=1.9.0';

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

export function getScreeningLayouts(siteId,program='spa-edge') {
  return siteId==='sternicza-11'?(program==='spa-edge'?edgeLayouts:program==='spa'?spaLayouts:layouts):Object.freeze([]);
}
