const text=(tag,value,className)=>{const e=document.createElement(tag);e.textContent=value;if(className)e.className=className;return e;};

/** Render plain-text evidence from the shared physical checks, never HTML from
 * a source note. Only genuine geometric conflicts receive the red badge. */
export function renderDesignReview(report){
  const host=document.getElementById('design-checks'),items=document.getElementById('design-check-items');
  host.dataset.conflicts=String(report.conflictCount);host.dataset.verify=String(report.verifyCount);
  document.getElementById('design-check-count').textContent=report.conflictCount?`${report.conflictCount} ${report.conflictCount===1?'layout conflict':'layout conflicts'}`:'No detected layout intersections';
  document.getElementById('design-check-count').dataset.level=report.conflictCount?'conflict':'clear';
  document.getElementById('design-check-summary').textContent=`${report.verifyCount} ${report.verifyCount===1?'item needs':'items need'} measurement or specification. This check uses the objects and bounds represented in the model.`;
  const fragment=document.createDocumentFragment();
  for(const check of report.checks){
    const item=document.createElement('li');item.dataset.checkId=check.id;item.dataset.level=check.severity;
    item.append(text('span',check.severity==='conflict'?'Layout':check.severity==='verify'?'Verify':'Evidence','check-tag'),text('h4',check.title),text('p',check.detail));
    if(check.action)item.append(text('p',check.action,'check-action'));
    if(check.evidence)item.append(text('small',typeof check.evidence==='string'?check.evidence:JSON.stringify(check.evidence),'check-evidence'));
    fragment.append(item);
  }
  items.replaceChildren(fragment);
}
