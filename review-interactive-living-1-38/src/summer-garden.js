/** Versioned, reproducible garden proposals. Historical layouts remain literal.
 * Coordinates are mapped local metres, with x increasing toward PCK3/east.
 */
import {getTreeType} from './tree-catalog.js?v=1.38.0';

// The current proposal follows the owner's left-edge pool preference. The
// earlier transverse summer-sun study remains a separate historical record;
// this arrangement is not claimed to be its sunlight optimum.
export const SUMMER_POOL=Object.freeze({x:15.50,y:24.5,width:3.2,length:6.5});
export const SUMMER_POOL_V137=Object.freeze({x:15.50,y:19.8,width:3.2,length:6.5});
export const summerPoolBounds=(settings={})=>settings.rearCornerPool===false?SUMMER_POOL_V137:SUMMER_POOL;
export const SUMMER_FIREPIT=Object.freeze([7.409167656420745,27.75]);
export const summerGardenEnabled=(settings={},data)=>settings.summerPoolLayout===true&&
  (data?.site?.id||settings.siteId||'sternicza-11')==='sternicza-11'&&
  !settings.pavilionEnabled&&(settings.gardenProgram||'').startsWith('spa');

/** The left-edge pool position is independent of finish styles. Only movable
 * garden furniture and planting borders differ between those styles. */
export function summerGardenFurniture(settings={},pool=summerPoolBounds(settings)){
  const sides=Math.max(1,Math.min(3,Math.round(Number(settings.poolSunbedSides)||1)));
  const p=pool;
  const bed=(x,y,width=.78,length=2,back='north')=>({x,y,width,length,back});
  const rows=[
    // Narrow chaises run parallel to the long pool edge. Keep their entire
    // envelope beyond the full-width terrace and the route behind their feet.
    {side:'garden',beds:[-2.45,-1.35].map(dx=>bed(p.x+dx,p.y+3.55))},
    {side:'front',beds:[bed(p.x+.60,p.y-1.35,2,.78,'east')]},
    // Keep the optional rear chaise beside the compact grove's free soil
    // pocket; the nearest trunk remains to its garden-facing side.
    {side:'rear',beds:[settings.rearCornerPool===false?bed(p.x-1.05,p.y+p.length+1.45,2,.78,'west'):bed(p.x+.40,p.y+p.length+.65,2,.78,'west')]},
  ].slice(0,sides);
  const sunbeds=rows.flatMap(r=>r.beds).map((b,i)=>({...b,id:`garden-sunbed-${i+1}`,kind:'lounger'}));
  return {loungers:sunbeds.map(b=>[b.x,b.y]),sunbeds,loungerSides:rows.map(r=>r.side),
    dining:{x:1.85,y:25.8,width:3.8,length:3.4},
    path:[],
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
export const V136_SUMMER_TREE_POSITIONS=Object.freeze({
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

// The owner's original planting is authoritative. Pool and path proposals
// fit around these positions; selecting a finish never edits specimen trees.
export const BOUNDARY_TREE_POSITIONS=LEGACY_SUMMER_TREE_POSITIONS;

// Exact v1.12 close-grove coordinates, restored at the owner's request. Keep
// historical exports literal: archived links must not silently acquire a new
// planting. New species choices move only stems that the new pool would cover.
export const CLOSE_GROVE_TREE_POSITIONS=Object.freeze([[13,34.1],[14.2,32.5],[17.6,34.9]].map(Object.freeze));
export const CURRENT_SUMMER_TREE_POSITIONS=Object.freeze(Object.fromEntries(Object.entries(LEGACY_SUMMER_TREE_POSITIONS).map(([typeId,positions])=>{
  if(typeId==='austrian-pine-tall')return [typeId,CLOSE_GROVE_TREE_POSITIONS];
  let moved=0;
  return [typeId,Object.freeze(positions.map(([x,y])=>{
    const p=SUMMER_POOL,conflict=x>p.x-.53&&x<p.x+p.width+.53&&y>p.y-.53&&y<p.y+p.length+.53;
    return conflict?CLOSE_GROVE_TREE_POSITIONS[[1,0,2][moved++]]:Object.freeze([x,y]);
  }))];
})));

function presetIndices(trees,positions){
  if(!Array.isArray(trees)||trees.length!==3)return null;
  const typeId=trees[0]?.typeId,old=positions[typeId];
  if(!old||trees.some(t=>t?.typeId!==typeId))return null;
  const indices=trees.map(t=>old.findIndex(([x,y])=>Math.abs(t.x-x)<1e-6&&Math.abs(t.y-y)<1e-6));
  if(indices.some(i=>i<0)||new Set(indices).size!==3)return null;
  return indices;
}
export const isSummerTreePreset=trees=>presetIndices(trees,CURRENT_SUMMER_TREE_POSITIONS)!==null||presetIndices(trees,BOUNDARY_TREE_POSITIONS)!==null;

/** Undo only a complete known 1.36 automatic relocation. Custom positions,
 * partial planting, stock dimensions, identities and quotes remain untouched. */
export function restoreSummerTreePreset(trees){
  const indices=presetIndices(trees,V136_SUMMER_TREE_POSITIONS);
  if(!indices)return null;
  const next=BOUNDARY_TREE_POSITIONS[trees[0].typeId];
  return trees.map((tree,i)=>({...tree,x:next[indices[i]][0],y:next[indices[i]][1]}));
}

/** Opt-in active-session adoption only. Match a complete known automatic tall
 * pine triplet, then preserve identities, dimensions, prices and record order.
 * Each tree retains its near/inner/outer role within the restored close grove. */
export function restoreCloseGrovePreset(trees){
  if(trees?.[0]?.typeId!=='austrian-pine-tall')return null;
  for(const [positions,roles] of [[LEGACY_SUMMER_TREE_POSITIONS,[2,0,1]],[V136_SUMMER_TREE_POSITIONS,[1,2,0]]]){
    const indices=presetIndices(trees,positions);if(!indices)continue;
    return trees.map((tree,i)=>{const [x,y]=CLOSE_GROVE_TREE_POSITIONS[roles[indices[i]]];return {...tree,x,y};});
  }
  return null;
}

export function optimizedScreeningTrees(typeId='austrian-pine-tall',previous=[]){
  const type=getTreeType(typeId),positions=CURRENT_SUMMER_TREE_POSITIONS[typeId];
  if(!type||!positions)return null;
  return positions.map(([x,y],i)=>({id:previous[i]?.id||`pine-${i+1}`,typeId,
    ...type.dimensions,x,y,rotation:0,enabled:true,unitPrice:0}));
}
