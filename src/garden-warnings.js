const destinationNames={terrace:'terrace',pool:'pool',firepit:'fire lounge',sauna:'sauna',plunge:'cold plunge',dining:'dining area'};

/** Render actual route failures alongside the existing spa layout warnings.
 * A missing landscaped route does not imply that free walking is blocked. */
export function renderGardenLayoutWarning(element,existingWarnings=[],network){
  const warnings=existingWarnings.slice(),blocked=network?.blocked||[];
  const disconnected=(network?.connections||[]).filter(c=>c.id!=='terrace'&&c.connected===false);
  if(blocked.length){
    const retainedTree=blocked.some(segment=>segment.reason==='retained-tree');
    const otherFeature=blocked.some(segment=>segment.reason!=='retained-tree');
    const obstacles=retainedTree?(otherFeature?'retained trees and the existing layout':'retained trees'):'the existing layout';
    warnings.push(`${blocked.length} proposed path ${blocked.length===1?'segment cannot':'segments cannot'} fit around ${obstacles}.`);
  }
  if(disconnected.length)warnings.push(`No continuous landscaped path from the terrace to: ${disconnected.map(c=>destinationNames[c.id]||c.id).join(', ')}.`);
  if(blocked.length||disconnected.length)warnings.push('Check the route in Plan; your tree positions are unchanged.');
  element.hidden=warnings.length===0;
  element.textContent=warnings.join(' ');
  return warnings;
}
