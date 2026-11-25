/** One style owns the house renovation, its furnishings and the garden finishes.
 * Independent garden dimensions survive style switches; first adoption installs
 * the user's marked terrace/balcony once. Undo restores the complete prior state. */
export function changePresentationSettings(current,patch){
  const next={...current,...patch};
  if(patch.interiorStyle && patch.interiorStyle!=='follow')next.designStyle=patch.interiorStyle;
  if(patch.interiorLayout==='existing'||patch.styleHouseFinish===false)next.designStyle='current';
  if(patch.interiorLayout==='renovation'&&next.designStyle==='current')next.designStyle='hidden-bali';
  const proposed=next.designStyle&&next.designStyle!=='current';
  if(proposed&&next.designStyle!==current.designStyle&&!Object.hasOwn(patch,'styleGardenLayout'))next.styleGardenLayout=true;
  next.styleHouseFinish=Boolean(proposed);next.interiorStyle='follow';
  next.interiorLayout=proposed?'renovation':'existing';
  const sternicza=!next.siteId||next.siteId==='sternicza-11';
  if(proposed&&sternicza&&!current.planExteriorApplied){
    Object.assign(next,{planExteriorApplied:true,terraceCoverType:'balcony',canopyEnabled:true,
      canopyDepth:4,canopyWidth:10.77,terraceDepth:4,terraceWidth:10.77});
  }else if(!proposed&&current.planExteriorApplied){
    next.planExteriorApplied=false;next.canopyEnabled=false;
  }
  if(next.designStyle!==current.designStyle||next.styleHouseFinish!==current.styleHouseFinish||next.styleGardenLayout!==current.styleGardenLayout)next.costStyleUpgradeQuote=0;
  return next;
}
