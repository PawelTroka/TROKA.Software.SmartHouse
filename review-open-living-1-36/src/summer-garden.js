/** Versioned, reproducible garden proposals. Historical layouts remain literal.
 * Coordinates are mapped local metres, with x increasing toward PCK3/east.
 */
import {getTreeType} from './tree-catalog.js?v=1.36.0';

// The current proposal follows the owner's left-edge pool preference. The
// earlier transverse summer-sun study remains a separate historical record;
// this arrangement is not claimed to be its sunlight optimum.
export const SUMMER_POOL=Object.freeze({x:15.10,y:23.5,width:3.5,length:8});
export const SUMMER_FIREPIT=Object.freeze([7.409167656420745,27.75]);
export const summerGardenEnabled=(settings={},data)=>settings.summerPoolLayout===true&&
  (data?.site?.id||settings.siteId||'sternicza-11')==='sternicza-11'&&
  !settings.pavilionEnabled&&(settings.gardenProgram||'').startsWith('spa');

/** The left-edge pool position is independent of finish styles. Only movable
 * garden furniture and planting borders differ between those styles. */
export function summerGardenFurniture(settings={},pool=SUMMER_POOL){
  const sides=Math.max(1,Math.min(3,Math.round(Number(settings.poolSunbedSides)||1)));
  const p=pool;
  const bed=(x,y,width=.78,length=2,back='north')=>({x,y,width,length,back});
  const rows=[
    // Headrests sit beside the pool; the sunbeds face the open garden. The
    // central/rear part of this edge stays open beside the fire lounge.
    {side:'garden',beds:[.1,1.3,2.5].map(dy=>bed(p.x-2.6,p.y+dy,2,.78,'east'))},
    {side:'front',beds:[.15,1.25].map(dx=>bed(p.x+dx,p.y-2.8))},
    {side:'rear',beds:[.15,1.25].map(dx=>bed(p.x+dx,p.y+p.length+1,.78,2,'south'))},
  ].slice(0,sides);
  const sunbeds=rows.flatMap(r=>r.beds).map((b,i)=>({...b,id:`garden-sunbed-${i+1}`,kind:'lounger'}));
  return {loungers:sunbeds.map(b=>[b.x,b.y]),sunbeds,loungerSides:rows.map(r=>r.side),
    dining:{x:1.85,y:25.8,width:3.8,length:3.4},
    path:[[6.25,23.8],[6.25,25.3],[5.85,30.3],[5.3,32.1]],
    beds:[{x:1.35,y:29.7,width:.62,length:3.5},{x:10.4,y:34.3,width:2.8,length:.65}]};
}

// Filled by the bounded boundary-placement study. Every species uses its own
// catalogue dimensions and independently scored edge positions.
export const LEGACY_SUMMER_TREE_POSITIONS=Object.freeze({
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

// Updated by the constrained left-edge-pool screening study.
export const BOUNDARY_TREE_POSITIONS=Object.freeze({
  'thuja-excelsa-9m':Object.freeze([[19,33],[16,36],[18,36]].map(Object.freeze)),
  'white-fir-9m':Object.freeze([[19,33],[14,35],[17,36]].map(Object.freeze)),
  'norway-spruce-9-10m':Object.freeze([[19,33],[18,35],[14,35]].map(Object.freeze)),
  'thuja-brabant-6-7m':Object.freeze([[19,33],[19,36],[17,36]].map(Object.freeze)),
  'serbian-spruce-7m':Object.freeze([[19,33],[15,36],[18,35]].map(Object.freeze)),
  'austrian-pine-debruyn-8-9m':Object.freeze([[19,33],[17,36],[14,36]].map(Object.freeze)),
  'nordmann-fir-11m':Object.freeze([[11,35],[17,19.5],[14,34.5]].map(Object.freeze)),
  'austrian-pine-medium':Object.freeze([[19,33],[12,35],[16,36]].map(Object.freeze)),
  'austrian-pine-large':Object.freeze([[19,33],[14,35],[17,36]].map(Object.freeze)),
  'austrian-pine-xl':Object.freeze([[18,20],[18.5,33],[14,35]].map(Object.freeze)),
  'austrian-pine-tall':Object.freeze([[18,20],[18.5,33],[15,36]].map(Object.freeze)),
  'serbian-spruce':Object.freeze([[19,36],[19,33],[17,36]].map(Object.freeze)),
  'broad-hornbeam':Object.freeze([[19,33],[14,35],[17,36]].map(Object.freeze)),
  'pleached-hornbeam':Object.freeze([[19,33],[19,35],[11,35]].map(Object.freeze))
});

/** Move only a complete known species preset. Custom positions are never
 * inferred or overwritten, and all identities/dimensions/quotes stay intact. */
export function upgradeSummerTreePreset(trees){
  if(!Array.isArray(trees)||trees.length!==3)return null;
  const typeId=trees[0]?.typeId,old=LEGACY_SUMMER_TREE_POSITIONS[typeId],next=BOUNDARY_TREE_POSITIONS[typeId];
  if(!old||!next||trees.some(t=>t?.typeId!==typeId))return null;
  const indices=trees.map(t=>old.findIndex(([x,y])=>Math.abs(t.x-x)<1e-6&&Math.abs(t.y-y)<1e-6));
  if(indices.some(i=>i<0)||new Set(indices).size!==3)return null;
  return trees.map((tree,i)=>({...tree,x:next[indices[i]][0],y:next[indices[i]][1]}));
}

export function optimizedScreeningTrees(typeId='austrian-pine-tall',previous=[]){
  const type=getTreeType(typeId),positions=BOUNDARY_TREE_POSITIONS[typeId];
  if(!type||!positions)return null;
  return positions.map(([x,y],i)=>({id:previous[i]?.id||`pine-${i+1}`,typeId,
    ...type.dimensions,x,y,rotation:0,enabled:true,unitPrice:0}));
}
