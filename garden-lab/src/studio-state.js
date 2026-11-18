/** A style includes a restrained house renovation by default. The house can be
 * opted out of a proposal; Current always returns to its original exterior.
 * A quote belongs to that exact scope, and undo restores the previous quote. */
export function changePresentationSettings(current,patch){
  const next={...current,...patch};
  if(next.designStyle==='current')next.styleHouseFinish=false;
  else if(patch.designStyle!==undefined&&patch.designStyle!==current.designStyle&&patch.styleHouseFinish===undefined)next.styleHouseFinish=true;
  if(next.designStyle!==current.designStyle||next.styleHouseFinish!==current.styleHouseFinish)next.costStyleUpgradeQuote=0;
  return next;
}
