/**
 * Site-specific design starting points. Coordinates are local mapped metres.
 * This module contains data only; it does not choose positions at page load.
 */
import {getTreeType} from './tree-catalog.js?v=1.7.0';

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

export function getScreeningLayouts(siteId,program='spa') {
  return siteId==='sternicza-11'?(program==='spa'?spaLayouts:layouts):Object.freeze([]);
}
