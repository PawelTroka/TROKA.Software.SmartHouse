import {getTreeType} from './tree-catalog.js?v=1.34.0';
import {optimizedScreeningTrees} from './summer-garden.js?v=1.34.0';

/** Compare nursery stock at the same positions. A quote for the old specimen
 * cannot price a different species, so dimensions and plant price reset together. */
export function replaceTreeSpecies(trees, typeId, selectedId = null, {siteId,optimized=false}={}) {
  const type = getTreeType(typeId);
  if (!type) throw new RangeError('Unknown screening tree type.');
  if(optimized&&siteId==='sternicza-11'&&selectedId===null&&trees.length===3){
    const placed=optimizedScreeningTrees(typeId,trees);
    if(placed)return placed.map((tree,i)=>({...tree,enabled:trees[i].enabled!==false}));
  }
  return trees.map(tree => selectedId !== null && tree.id !== selectedId
    ? {...tree}
    : {...tree, typeId, ...type.dimensions, unitPrice: 0});
}

/** A price entered for one specimen must be re-entered after changing its size. */
export function applyTreeEdit(tree, patch) {
  const resized=['height','crownBase','crownWidth','crownDepth'].some(key=>
    Object.hasOwn(patch,key)&&patch[key]!==tree[key]);
  return {...tree,...patch,...(resized&&!Object.hasOwn(patch,'unitPrice')?{unitPrice:0}:{})};
}

export function treeTaxLabel(type) {
  return type?.taxBasis === 'net' ? 'net · VAT extra'
    : type?.taxBasis === 'included' ? 'VAT included'
    : 'VAT basis to confirm';
}
