/** Bound submitted main-frame bundles without blocking camera/input work.
 * Call canSubmit() before any frame GPU work, then submitted() only after a
 * real main render. Idle restoration participates in the same queue. Fences
 * measure observed queue completion, not isolated GPU execution duration.
 */
export function createGpuSubmissionPacer(gl,{maxInFlight=2,now=()=>performance.now()}={}){
  const limit=maxInFlight===1?1:2,capacity=64,queue=[],history=[],errors=[];
  const supported=Boolean(gl&&['fenceSync','clientWaitSync','deleteSync','flush'].every(name=>typeof gl[name]==='function'));
  let enabled=supported,disposed=false,reason=supported?null:'webgl2-fences-unavailable';
  let attempts=0,submittedFrames=0,fencedFrames=0,completedFrames=0,deferredAttempts=0,abandonedFences=0,untrackedFrames=0,polls=0,peakPendingFrames=0;
  let lastObservedAtMs=null,lastCompletionAtMs=null;
  const recordError=error=>{errors.push(String(error).slice(0,240));if(errors.length>8)errors.shift();};
  function disable(nextReason,error){
    enabled=false;reason=nextReason;if(error)recordError(error);
    abandonedFences+=queue.length;
    for(const entry of queue)try{gl.deleteSync(entry.sync);}catch(error){recordError(error);}
    queue.length=0;
  }
  function poll(){
    if(disposed||!enabled)return;
    try{
      if(gl.isContextLost?.()){disable('context-lost');return;}
      while(queue.length){
        const entry=queue[0],status=gl.clientWaitSync(entry.sync,0,0),observedAtMs=now();
        polls++;lastObservedAtMs=observedAtMs;
        if(status===gl.ALREADY_SIGNALED||status===gl.CONDITION_SATISFIED){
          queue.shift();completedFrames++;
          history.push({frame:entry.frame,queueDepthAtSubmission:entry.depth,submittedAtMs:entry.submittedAtMs,observedCompletedAtMs:observedAtMs,
            completionLatencyLowerMs:Math.max(0,(entry.lastUnsignaledAtMs??entry.submittedAtMs)-entry.submittedAtMs),
            completionLatencyUpperMs:Math.max(0,observedAtMs-entry.submittedAtMs),
            observedCompletionGapMs:lastCompletionAtMs===null?null:Math.max(0,observedAtMs-lastCompletionAtMs)});
          if(history.length>capacity)history.shift();lastCompletionAtMs=observedAtMs;
          try{gl.deleteSync(entry.sync);}catch(error){disable('fence-delete-failed',error);return;}
        }else if(status===gl.TIMEOUT_EXPIRED){entry.lastUnsignaledAtMs=observedAtMs;return;}
        else{disable(status===gl.WAIT_FAILED?'fence-wait-failed':'unexpected-fence-status');return;}
      }
    }catch(error){disable('fence-poll-failed',error);}
  }
  function canSubmit(){
    if(disposed)return false;
    attempts++;poll();
    if(enabled&&queue.length>=limit){deferredAttempts++;return false;}
    return true;
  }
  function submitted(){
    if(disposed)return false;
    submittedFrames++;
    if(!enabled){untrackedFrames++;return false;}
    // A misuse is visible and stops creation of unbounded sync objects. The
    // caller has already drawn, so this cannot undo or hide that submission.
    if(queue.length>=limit){untrackedFrames++;disable('submission-without-available-slot');return false;}
    try{
      if(gl.isContextLost?.()){untrackedFrames++;disable('context-lost');return false;}
      const submittedAtMs=now(),sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);
      if(!sync){untrackedFrames++;disable('fence-allocation-failed');return false;}
      queue.push({sync,frame:submittedFrames,depth:queue.length+1,submittedAtMs,lastUnsignaledAtMs:null});
      fencedFrames++;peakPendingFrames=Math.max(peakPendingFrames,queue.length);
      gl.flush();return true;
    }catch(error){untrackedFrames++;disable('fence-submit-failed',error);return false;}
  }
  function getDiagnostics(){
    const count=history.length,lower=history.reduce((sum,x)=>sum+x.completionLatencyLowerMs,0),upper=history.reduce((sum,x)=>sum+x.completionLatencyUpperMs,0);
    return {scope:'main-render-submission-queue',supported,enabled:enabled&&!disposed,reason,disposed,maxInFlight:limit,
      attempts,submittedFrames,fencedFrames,completedFrames,deferredAttempts,pendingFrames:queue.length,peakPendingFrames,abandonedFences,untrackedFrames,polls,
      lastObservedAtMs,oldestPendingMs:queue.length?Math.max(0,now()-queue[0].submittedAtMs):0,
      completionLatencyBoundsMs:{samples:count,capacity,meanLower:count?lower/count:null,meanUpper:count?upper/count:null,
        maxUpper:count?Math.max(...history.map(x=>x.completionLatencyUpperMs)):null},
      recentCompletions:history.slice(-8).map(entry=>({...entry})),errors:[...errors],
      interpretation:'Bounds bracket observable fence availability, including queueing, browser status caching and polling delay; they are not isolated GPU durations or presentation times. Pending counts unretired handles, which may complete before the next observation.'};
  }
  return {canSubmit,submitted,poll,getDiagnostics,dispose(){if(disposed)return;disable('disposed');disposed=true;}};
}
