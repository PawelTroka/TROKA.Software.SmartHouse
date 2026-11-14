import {STERNICZA_REFERENCE_POOL_TREES} from './screening-layouts.js?v=1.15.1';

export const PICTURED_TREES = STERNICZA_REFERENCE_POOL_TREES;
const geometryKeys=['typeId','x','y','height','crownBase','crownWidth','crownDepth','enabled'];
const sameGeometry=(a,b)=>geometryKeys.every(key=>typeof b[key]==='number'
  ?Number.isFinite(a?.[key])&&Math.abs(a[key]-b[key])<1e-6:a?.[key]===b[key]);

/** A geometry-only check: IDs, order and entered prices do not move a tree. */
export function matchesPicturedTrees(settings={}) {
  const trees=settings.screeningTrees||[];
  if(settings.siteId!=='sternicza-11'||trees.length!==PICTURED_TREES.length)return false;
  const remaining=[...trees];
  return PICTURED_TREES.every(reference=>{
    const index=remaining.findIndex(tree=>sameGeometry(tree,reference));
    if(index<0)return false;
    remaining.splice(index,1);return true;
  });
}

/** Apply only the pictured planting. Retain the current pool, hedge, eye and
 * budget settings; keep entered per-tree prices when the nursery type matches. */
export function applyPicturedTrees(settings={}) {
  if(settings.siteId!=='sternicza-11')return settings;
  const current=settings.screeningTrees||[];
  return {...settings,screeningTrees:PICTURED_TREES.map((reference,index)=>{
    const previous=current.find(tree=>tree.id===reference.id)||current[index];
    const unitPrice=previous?.typeId===reference.typeId&&Number.isFinite(previous.unitPrice)&&previous.unitPrice>0?previous.unitPrice:0;
    return {...reference,unitPrice};
  })};
}
