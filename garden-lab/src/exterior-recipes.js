// Architectural and furniture recipes shared by all interior/exterior renderers.
// Pure data: importing style choices never creates a WebGL renderer or loads images.
const spec=(wall,roof,wood,paving,fabric,metal,coverage,dining,guard)=>Object.freeze({wall,roof,wood,paving,fabric,metal,coverage,dining,guard});
export const EXTERIOR_SURFACES=Object.freeze({
  'organic-modern':spec('limewash','standing-seam','oak','travertine','boucle','bronze','mineral-base','oval-six','glass'),
  'hidden-bali':spec('sand-render','slate','teak','teak','woven','bronze','upper-and-piers','resort-banquette','vertical-timber'),
  'mediterranean-villa':spec('limewash','terracotta-roof','oak','terracotta','linen','painted-steel','mineral-base','round-four','steel-pickets'),
  'modern-minimal':spec('smooth-render','standing-seam','ash','porcelain','canvas','anodized','all-panels','long-six','glass'),
  scandinavian:spec('weatherboard','standing-seam','ash','ash','linen','painted-steel','upper-and-piers','long-six','vertical-timber'),
  japandi:spec('sand-render','slate','walnut','limestone','woven','blackened-steel','piers','low-banquette','vertical-timber'),
  'organic-scandinavian':spec('limewash','standing-seam','ash','ash','boucle','painted-steel','upper','oval-six','horizontal-timber'),
  'organic-japandi':spec('clay-render','slate','walnut','travertine','boucle','bronze','piers','oval-six','vertical-timber'),
  'space-age':spec('smooth-render','zinc','silvered-wood','terrazzo','vinyl','chrome','all-panels','round-four','glass'),
  'party-club':spec('charred-wood','standing-seam','charred-wood','basalt','velvet','blackened-steel','upper-and-piers','club-banquette','glass'),
  'baltic-dune':spec('sand-render','zinc','silvered-wood','silvered-wood','canvas','anodized','upper','long-six','horizontal-timber'),
  'gdansk-brick':spec('clinker','terracotta-roof','oak','clinker','canvas','blackened-steel','masonry-piers','long-six','steel-pickets'),
  'danish-midcentury':spec('limewash','standing-seam','teak','limestone','linen','bronze','upper','oval-six','vertical-timber'),
  'finnish-sauna':spec('charred-wood','standing-seam','cedar','cedar','linen','blackened-steel','upper-and-piers','low-banquette','horizontal-timber'),
  'riviera-deco':spec('smooth-render','zinc','walnut','terrazzo','velvet','brass','all-panels','club-banquette','deco-metal'),
  'arts-and-crafts':spec('sand-render','slate','oak','clinker','woven','bronze','piers','long-six','vertical-timber'),
  'palm-springs':spec('smooth-render','standing-seam','ash','terrazzo','canvas','painted-steel','all-panels','round-four','deco-metal'),
  'desert-modern':spec('clay-render','zinc','walnut','sandstone','canvas','bronze','mineral-base','low-banquette','glass'),
  'alpine-lodge':spec('sand-render','slate','cedar','cedar','woven','blackened-steel','upper-and-piers','long-six','horizontal-timber'),
  'industrial-loft':spec('board-concrete','standing-seam','reclaimed-wood','board-concrete','canvas','blackened-steel','all-panels','long-six','steel-pickets'),
});
export const getExteriorSurfaceSpec=style=>EXTERIOR_SURFACES[typeof style==='string'?style:style?.id]??null;

export function getBalconyGuardRecipe(style){
  const form=getExteriorSurfaceSpec(style)?.guard??'original';
  return Object.freeze({form,spacing:form==='vertical-timber'?.16:form==='steel-pickets'?.12:.32,
    railWidth:form.includes('timber')?.052:.024,keepClearGlass:true});
}
