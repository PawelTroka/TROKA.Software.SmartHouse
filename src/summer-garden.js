/** Versioned, reproducible garden proposals. Historical layouts remain literal.
 * Coordinates are mapped local metres, with x increasing toward PCK3/east.
 */
import {getTreeType} from './tree-catalog.js?v=1.34.0';

export const SUMMER_POOL=Object.freeze({x:3.25,y:25,width:8,length:3.5});
export const SUMMER_FIREPIT=Object.freeze([12.65,29.5]);
export const summerGardenEnabled=(settings={},data)=>settings.summerPoolLayout===true&&
  (data?.site?.id||settings.siteId||'sternicza-11')==='sternicza-11'&&
  !settings.pavilionEnabled&&(settings.gardenProgram||'').startsWith('spa');

/** Seasonal pool position is independent of finish styles. Only movable
 * garden furniture and planting borders differ between those styles. */
export function summerGardenFurniture(settings={},pool=SUMMER_POOL){
  const sides=Math.max(1,Math.min(3,Math.round(Number(settings.poolSunbedSides)||3)));
  const p=pool;
  const rows=[
    {side:'south',positions:[[p.x+1.15,p.y+p.length+1],[p.x+2.25,p.y+p.length+1],[p.x+4.65,p.y+p.length+1],[p.x+5.75,p.y+p.length+1]]},
    {side:'east',positions:[[p.x+p.width+1,p.y+.12],[p.x+p.width+2.10,p.y+.12]]},
    {side:'west',positions:[[p.x-1.85,p.y+.12]]},
  ].slice(0,sides);
  return {loungers:rows.flatMap(r=>r.positions),loungerSides:rows.map(r=>r.side),
    dining:{x:9.35,y:33.2,width:2.85,length:3.2},
    path:[[6,22.85],[11.65,27.65],[9.25,31.65],[5.8,32.5]],
    kitchen:{x:2.4,y:32.7,width:2.5,length:.72},
    beds:[{x:1.35,y:28.5,width:.62,length:4.6},{x:17.35,y:33.9,width:1.2,length:2.5}]};
}

// Filled by the bounded boundary-placement study. Every species uses its own
// catalogue dimensions and independently scored edge positions.
export const BOUNDARY_TREE_POSITIONS=Object.freeze({
  'thuja-excelsa-9m':Object.freeze([[16,36],[18,36],[17,28]].map(Object.freeze)),
  'white-fir-9m':Object.freeze([[17,36],[17,28],[14,36]].map(Object.freeze)),
  'norway-spruce-9-10m':Object.freeze([[16,36],[17,28],[18,35]].map(Object.freeze)),
  'thuja-brabant-6-7m':Object.freeze([[19,36],[15,36],[17,36]].map(Object.freeze)),
  'serbian-spruce-7m':Object.freeze([[16,36],[17,28],[18,35]].map(Object.freeze)),
  'austrian-pine-debruyn-8-9m':Object.freeze([[15,36],[17,28],[18,35]].map(Object.freeze)),
  'nordmann-fir-11m':Object.freeze([[17,28],[17,25],[17.5,35]].map(Object.freeze)),
  'austrian-pine-medium':Object.freeze([[17,36],[14,36],[17,27]].map(Object.freeze)),
  'austrian-pine-large':Object.freeze([[17,36],[17,28],[14,36]].map(Object.freeze)),
  'austrian-pine-xl':Object.freeze([[17,28],[14,36],[18,35]].map(Object.freeze)),
  'austrian-pine-tall':Object.freeze([[18,35],[14,36],[18,28]].map(Object.freeze)),
  'serbian-spruce':Object.freeze([[19,36],[15,36],[17,36]].map(Object.freeze)),
  'broad-hornbeam':Object.freeze([[15,36],[17,28],[18,36]].map(Object.freeze)),
  'pleached-hornbeam':Object.freeze([[16,36],[18,35],[14,36]].map(Object.freeze))
});

export function optimizedScreeningTrees(typeId='austrian-pine-tall',previous=[]){
  const type=getTreeType(typeId),positions=BOUNDARY_TREE_POSITIONS[typeId];
  if(!type||!positions)return null;
  return positions.map(([x,y],i)=>({id:previous[i]?.id||`pine-${i+1}`,typeId,
    ...type.dimensions,x,y,rotation:0,enabled:true,unitPrice:0}));
}
