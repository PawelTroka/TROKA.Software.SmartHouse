import {STERNICZA_REFERENCE_POOL_TREES,STERNICZA_EXCELSA_TREES} from './screening-layouts.js?v=1.32.1';

export const PICTURED_TREES = STERNICZA_REFERENCE_POOL_TREES;
export const EXCELSA_TREES = STERNICZA_EXCELSA_TREES;
const geometryKeys=['typeId','x','y','height','crownBase','crownWidth','crownDepth','enabled'];
const sameGeometry=(a,b)=>geometryKeys.every(key=>typeof b[key]==='number'
  ?Number.isFinite(a?.[key])&&Math.abs(a[key]-b[key])<1e-6:a?.[key]===b[key]);

/** A geometry-only check: IDs, order and entered prices do not move a tree. */
function matchesPlanting(settings, planting) {
  const trees=settings.screeningTrees||[];
  if(settings.siteId!=='sternicza-11'||trees.length!==planting.length)return false;
  const remaining=[...trees];
  return planting.every(reference=>{
    const index=remaining.findIndex(tree=>sameGeometry(tree,reference));
    if(index<0)return false;
    remaining.splice(index,1);return true;
  });
}

export function matchesPicturedTrees(settings={}) { return matchesPlanting(settings,PICTURED_TREES); }
export function matchesExcelsaTrees(settings={}) { return matchesPlanting(settings,EXCELSA_TREES); }

/** Apply only the pictured planting. Retain the current pool, hedge, eye and
 * budget settings; keep entered per-tree prices when the nursery type matches. */
function applyPlanting(settings, planting) {
  if(settings.siteId!=='sternicza-11')return settings;
  const current=settings.screeningTrees||[];
  return {...settings,screeningTrees:planting.map((reference,index)=>{
    const previous=current.find(tree=>tree.id===reference.id)||current[index];
    const unitPrice=previous?.typeId===reference.typeId&&Number.isFinite(previous.unitPrice)&&previous.unitPrice>0?previous.unitPrice:0;
    return {...reference,unitPrice};
  })};
}

export function applyPicturedTrees(settings={}) { return applyPlanting(settings,PICTURED_TREES); }
export function applyExcelsaTrees(settings={}) { return applyPlanting(settings,EXCELSA_TREES); }
