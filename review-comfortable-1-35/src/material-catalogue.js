// DOM-free material selection used by the scene and the comparison catalogue.
// These are representative renovation finishes, not photos of the existing house.
import {MATERIAL_ASSETS} from './material-asset-data.js?v=1.35.0';
import {getExteriorSurfaceSpec} from './exterior-recipes.js?v=1.35.0';
import {getInteriorStyleRecipe} from './interior-style-recipes.js?v=1.35.0';
import {getDesignStyle} from './design-styles.js?v=1.35.0';
import {STYLE_MATERIAL_SWATCHES} from './style-material-swatches.js?v=1.35.0';
import {MINIMAL_STYLE_DEFINITIONS} from './minimal-style-definitions.js?v=1.35.0';
export {MATERIAL_ASSETS};

const finish=(asset,label,options={})=>Object.freeze({asset,label,...options});
export const MATERIAL_FINISHES=Object.freeze({
  oak:finish('oak','Natural oak'), ash:finish('ash','Pale ash'), walnut:finish('walnut','Walnut',{colorMode:'palette'}),
  teak:finish('teak','Warm teak'), cedar:finish('cedar','Japanese cedar'),
  'whitewashed-oak':finish('oak','Whitewashed oak',{colorMode:'palette'}),
  'silvered-wood':finish('weathered-wood','Silvered timber'),
  'reclaimed-wood':finish('weathered-wood','Reclaimed timber'),
  weatherboard:finish('weathered-wood','Weathered timber boarding'),
  'charred-wood':finish('cedar','Charcoal-stained cedar',{colorMode:'palette',normalStrength:.75}),
  'painted-wood':finish('oak','Painted timber',{colorMode:'palette',normalStrength:.13}),
  'painted-weatherboard':finish('oak','Painted weatherboards',{colorMode:'palette',normalStrength:.12,proceduralBond:true}),
  'oak-floor':finish('oak-floor','Oiled oak floorboards'),
  parquet:finish('parquet','Herringbone parquet'),
  'sand-render':finish('plaster','Fine sand render',{colorMode:'palette',normalStrength:.45}),
  'smooth-render':finish('plaster-fine','Smooth mineral plaster',{colorMode:'palette',normalStrength:.15}),
  limewash:finish('plaster-fine','Limewashed plaster',{colorMode:'palette',normalStrength:.28}),
  'clay-render':finish('clay-plaster','Clay plaster',{colorMode:'palette',normalStrength:.4}),
  travertine:finish('travertine','Vein-cut travertine',{normalStrength:.45}),
  limestone:finish('limestone','Honed limestone',{normalStrength:.4}),
  sandstone:finish('sandstone','Sandstone',{colorMode:'palette',normalStrength:.5}),
  marble:finish('marble','Veined white marble',{normalStrength:.25}),
  porcelain:finish('porcelain','Porcelain paving',{normalStrength:.12}),
  concrete:finish('concrete','Smooth concrete',{normalStrength:.35}),
  microcement:finish('concrete','Trowelled microcement',{colorMode:'palette',normalStrength:.2}),
  'board-concrete':finish('board-concrete','Board-formed concrete',{normalStrength:.65}),
  terracotta:finish('terracotta','Terracotta tiles',{normalStrength:.6}),
  clinker:finish('brick','Fired clay brick',{normalStrength:.8}),
  terrazzo:finish('terrazzo','Mineral terrazzo',{colorMode:'palette',normalStrength:.3}),
  slate:finish('slate-roof','Overlapping slate roof',{normalStrength:.75}),
  'slate-floor':finish('slate-floor','Dark slate',{normalStrength:.45}),
  basalt:finish('slate-floor','Dark stone paving',{colorMode:'palette',normalStrength:.45}),
  'terracotta-roof':finish('terracotta-roof','Clay roof tiles',{normalStrength:.9}),
  linen:finish('linen','Linen weave',{colorMode:'palette',normalStrength:.5}),
  'washed-linen':finish('linen','Washed linen',{colorMode:'palette',normalStrength:.48}),
  woven:finish('linen','Woven linen',{colorMode:'palette',normalStrength:.65}),
  canvas:finish('linen','Canvas weave',{colorMode:'palette',normalStrength:.35}),
  fine:finish('linen','Fine woven upholstery',{colorMode:'palette',normalStrength:.25}),
  boucle:finish('boucle','Looped wool bouclé',{colorMode:'palette',normalStrength:.8}),
  wool:finish('wool','Woven wool',{colorMode:'palette',normalStrength:.65}),
  leather:finish('leather','Brown leather',{normalStrength:.45}),
  velvet:finish('velvet','Velour velvet',{colorMode:'palette',normalStrength:.2}),
  vinyl:finish('leather','Smooth coated upholstery',{colorMode:'palette',normalStrength:.08}),
});

/** `seams:false` uses a same-material, mortar-free sample where the geometry
 * already supplies plank/tile joints. No brick/terrazzo is replaced with marble. */
export function getMaterialForFinish(name,{seams=true}={}){
  const selection=MATERIAL_FINISHES[name];if(!selection)return null;
  const key=!seams&&MATERIAL_ASSETS[selection.asset+'-unit']?selection.asset+'-unit':selection.asset;
  const spec=MATERIAL_ASSETS[key];if(!spec)return null;
  return {...spec,...selection,asset:key,finish:name,
    url:new URL('../assets/materials/'+(spec.preview||spec.files.diffuse),import.meta.url).href,
    colorMode:selection.colorMode||spec.colorMode,
    normalStrength:selection.normalStrength??.5};
}

const timberFloors=new Set(['boards','wide-boards','dark-boards','pale-boards','bleached-boards','weathered-boards','narrow-boards']);
const parquetFloors=new Set(['herringbone','dark-parquet','deco-parquet']);
const interiorStoneByStyle=new Map(MINIMAL_STYLE_DEFINITIONS.map(style=>[style.id,style.interiorStone]));

export function getInteriorMaterialFinishes(styleId){
  const id=typeof styleId==='string'?styleId:styleId?.id;
  const recipe=getInteriorStyleRecipe(id),exterior=getExteriorSurfaceSpec(id);
  if(!exterior)return null;
  const floor=parquetFloors.has(recipe.floor)?'parquet':timberFloors.has(recipe.floor)?
    (recipe.floor==='narrow-boards'?'cedar':recipe.floor==='weathered-boards'?'silvered-wood':'oak-floor'):
    ({resin:'microcement'}[recipe.floor]||recipe.floor);
  const wall={plain:'smooth-render',smooth:'smooth-render',eggshell:'smooth-render',clay:'clay-render',
    stucco:'sand-render',wood:exterior.wood,brick:'clinker'}[recipe.wallSurface]||recipe.wallSurface;
  const wetFloor={'honed-stone':'limestone',slate:'slate-floor',slab:'porcelain',tile:'porcelain-tile'}[recipe.wetFloor]||recipe.wetFloor;
  const stone=interiorStoneByStyle.get(id)||(id==='coastal'?'limestone':['party-club','riviera-deco'].includes(id)?'marble':
    ['hidden-bali','japandi','beach-house'].includes(id)?'limestone':id==='desert-modern'?'sandstone':'travertine');
  return {wall,wood:exterior.wood,floor,wetFloor,stone,fabric:recipe.upholstery};
}

/** Four actual samples per style; optional `interior` gives indoor materials.
 * Stable plain records keep the catalogue independent from WebGL and image IO. */
export function getStyleMaterialSamples(styleOrId,{interior=false,calibrated=true}={}){
  const id=getDesignStyle(typeof styleOrId==='string'?styleOrId:styleOrId?.id).id;
  const exterior=getExteriorSurfaceSpec(id),inside=getInteriorMaterialFinishes(id);
  const decorate=sample=>{
    if(!calibrated)return sample;
    const preview=STYLE_MATERIAL_SWATCHES[`${id}/${interior?'interior':'exterior'}/${sample.role}`];
    if(!preview)throw new Error(`Missing calibrated material preview: ${id}/${sample.role}`);
    return {...sample,sourceUrl:sample.url,url:new URL('../assets/materials/style-swatches/'+preview.file,import.meta.url).href,
      calibrated:true,colorMode:preview.colorMode,pigment:preview.pigment};
  };
  if(!exterior)return [['wall','plaster'],['wood','wood'],['floor',interior?'floor':'stone'],['fabric','linen']].map(([role,key])=>{
    const spec=MATERIAL_ASSETS[key];return {role,finish:'current',asset:key,...spec,
      url:new URL('../assets/materials/'+(spec.preview||spec.files.diffuse),import.meta.url).href};
  }).map(decorate);
  const choices=interior?inside:{wall:exterior.wall,wood:exterior.wood,floor:exterior.paving,fabric:exterior.fabric};
  return ['wall','wood','floor','fabric'].map(role=>{
    const selection=getMaterialForFinish(choices[role],{seams:role!=='wood'&&!(role==='floor'&&!interior)});
    return {role,...selection,finish:choices[role],label:selection?.label||choices[role].replaceAll('-',' ')};
  }).map(decorate);
}
