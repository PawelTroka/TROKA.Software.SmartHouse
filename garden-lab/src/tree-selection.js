import {getTreeType} from './tree-catalog.js?v=1.41.0';
import {optimizedScreeningTrees,isSummerTreePreset} from './summer-garden.js?v=1.41.0';

/** Keep individual and custom placements. An explicitly requested all-species
 * preset can adopt that species' earlier positions while the triplet is unedited.
 * Old specimen quotes cannot price new stock, so dimensions and prices reset. */
export function replaceTreeSpecies(trees, typeId, selectedId = null, {siteId,optimized=false}={}) {
  const type = getTreeType(typeId);
  if (!type) throw new RangeError('Unknown screening tree type.');
  if(optimized&&siteId==='sternicza-11'&&selectedId===null&&isSummerTreePreset(trees)){
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
