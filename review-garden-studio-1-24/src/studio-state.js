/** A quote belongs to a selected style and house-finish scope. Switching either
 * requires a fresh incremental quote; undo restores the previous design/quote. */
export function changePresentationSettings(current,patch){
  const next={...current,...patch};
  if(next.designStyle!==current.designStyle||next.styleHouseFinish!==current.styleHouseFinish)next.costStyleUpgradeQuote=0;
  return next;
}
