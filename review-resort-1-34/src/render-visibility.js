/** Scroll/layout changes can queue several entries for the same canvas before
 * one observer callback runs. Only the newest state controls whether to draw. */
export function latestIntersectionEntry(entries,target){
  let latest=null;
  for(const entry of entries){
    if(entry.target===target&&(!latest||entry.time>=latest.time))latest=entry;
  }
  return latest;
}
