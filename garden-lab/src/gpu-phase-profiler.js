/** Optional, bounded diagnostics for the two motion-rendering phases.
 * Device timer queries are preferred. Fence fallbacks bracket observable
 * availability only; they never become isolated GPU-duration estimates.
 */
export function createGpuPhaseProfiler(gl,{enabled=false,onUpdate=null,now=()=>performance.now(),
  schedule=(callback,ms)=>setTimeout(callback,ms),cancel=handle=>clearTimeout(handle),
  maxSamples=32,retainedSamples=12,maxPending=2,pollIntervalMs=50,maximumPendingMs=60000}={}){
  const bounded=(value,fallback,min,max)=>Number.isFinite(value)?Math.max(min,Math.min(max,Math.floor(value))):fallback;
  const limits={maxSamples:bounded(maxSamples,32,1,32),retainedSamples:bounded(retainedSamples,12,1,12),
    maxPending:bounded(maxPending,2,1,2),pollIntervalMs:bounded(pollIntervalMs,50,10,100),maximumPendingMs:bounded(maximumPendingMs,60000,1,60000)};
  const pending=[],history=[],errors=[];
  let requested=enabled===true,active=requested,disposed=false,method='disabled',reason=null,extension=null,timer=null,current=null;
  let startedSamples=0,completedSamples=0,discardedSamples=0,skippedAttempts=0,peakPendingSamples=0,polls=0,disjointEvents=0;
  let timerQuerySupported=false,fenceSupported=false,timerUnsupportedReason=null;
  const errorText=error=>{errors.push(String(error).slice(0,240));if(errors.length>8)errors.shift();};
  if(requested){
    fenceSupported=!!gl&&['fenceSync','clientWaitSync','deleteSync','flush'].every(key=>typeof gl[key]==='function');
    try{
      extension=gl?.getExtension?.('EXT_disjoint_timer_query_webgl2')||null;
      const functions=['createQuery','beginQuery','endQuery','getQuery','getQueryParameter','deleteQuery','getParameter','flush'];
      timerQuerySupported=!!extension&&functions.every(key=>typeof gl[key]==='function')&&
        gl.getQuery(extension.TIME_ELAPSED_EXT,extension.QUERY_COUNTER_BITS_EXT)>0;
      if(timerQuerySupported)gl.getParameter(extension.GPU_DISJOINT_EXT);
      else timerUnsupportedReason=extension?'elapsed-timer-query-unavailable':'timer-extension-unavailable';
    }catch(error){timerQuerySupported=false;timerUnsupportedReason='timer-capability-query-failed';errorText(error);}
    method=timerQuerySupported?'ext-timer-query':fenceSupported?'fence-availability':'unavailable';
    if(method==='unavailable'){active=false;reason='timer-queries-and-fences-unavailable';}
  }
  const notify=()=>{try{onUpdate?.();}catch(error){errorText(error);}};
  function stopTimer(){if(timer!==null){cancel(timer);timer=null;}}
  function deleteResources(entry){
    if(entry.activeQuery){try{gl.endQuery(extension.TIME_ELAPSED_EXT);}catch(error){errorText(error);}entry.activeQuery=null;}
    for(const query of entry.queries){if(query.handle)try{gl.deleteQuery(query.handle);}catch(error){errorText(error);}query.handle=null;}
    for(const mark of entry.marks){if(mark.handle)try{gl.deleteSync(mark.handle);}catch(error){errorText(error);}mark.handle=null;}
  }
  function finish(entry,status,detail=null){
    deleteResources(entry);
    const index=pending.indexOf(entry);if(index>=0)pending.splice(index,1);
    if(current===entry)current=null;
    Object.assign(entry.record,{status,currentPhase:status,observedAtMs:now(),...(detail?{detail}:{} )});
    if(status==='completed')completedSamples++;else discardedSamples++;
    history.push(entry.record);if(history.length>limits.retainedSamples)history.shift();
    if(!pending.length)stopTimer();
  }
  function disable(nextReason,error){
    active=false;reason=nextReason;if(error)errorText(error);stopTimer();
    for(const entry of [...pending])finish(entry,'failed',nextReason);
    notify();
  }
  function beginQuery(entry,phase){
    const handle=gl.createQuery();if(!handle)throw new Error('Timer query allocation failed');
    const query={phase,handle,elapsedMs:null};entry.queries.push(query);
    gl.beginQuery(extension.TIME_ELAPSED_EXT,handle);entry.activeQuery=query;
  }
  function endQuery(entry){if(entry.activeQuery){gl.endQuery(extension.TIME_ELAPSED_EXT);entry.activeQuery=null;}}
  function fence(entry,label){
    const record={label,submittedAtMs:now(),lastUnsignaledAtMs:null,observedAtMs:null,observedPoll:null,status:'pending'};
    const handle=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);if(!handle)throw new Error('Phase fence allocation failed');
    entry.marks.push({handle,record});entry.record.marks.push(record);
  }
  function schedulePoll(){
    if(timer!==null||!active||disposed||!pending.length)return;
    timer=schedule(()=>{timer=null;poll();},limits.pollIntervalMs);
  }
  function invalidateDisjoint(){
    disjointEvents++;
    for(const entry of [...pending]){
      if(Object.keys(entry.record.phases).length)entry.record.invalidatedPhases=entry.record.phases;
      entry.record.phases={};finish(entry,'disjoint','GPU disjoint invalidated the timer interval');
    }
    notify();
  }
  function poll(){
    if(!active||disposed||!pending.length)return;
    polls++;let changed=false;
    try{
      if(gl.isContextLost?.()){disable('context-lost');return;}
      if(method==='ext-timer-query'&&gl.getParameter(extension.GPU_DISJOINT_EXT)){
        invalidateDisjoint();return;
      }
      const ready=[];
      for(const entry of [...pending]){
        if(!entry.finished)continue;
        if(now()-entry.record.startedAtMs>limits.maximumPendingMs){finish(entry,'timed-out','Phase availability exceeded the recorded cap');changed=true;continue;}
        if(method==='ext-timer-query'){
          for(const query of entry.queries){
            if(query.elapsedMs!==null||!gl.getQueryParameter(query.handle,gl.QUERY_RESULT_AVAILABLE))continue;
            const result=gl.getQueryParameter(query.handle,gl.QUERY_RESULT);
            if(!Number.isFinite(result)||result<0)throw new Error('Invalid elapsed timer result');
            query.elapsedMs=result/1e6;
            entry.record.phases[query.phase]={elapsedMs:query.elapsedMs,source:'ext-timer-query'};
            gl.deleteQuery(query.handle);query.handle=null;
          }
          if(entry.queries.length===2&&entry.queries.every(query=>query.elapsedMs!==null)){
            ready.push(entry);
          }
        }else{
          for(const mark of entry.marks){
            if(mark.record.status==='signaled')continue;
            const status=gl.clientWaitSync(mark.handle,0,0),observedAtMs=now();
            if(status===gl.ALREADY_SIGNALED||status===gl.CONDITION_SATISFIED){
              Object.assign(mark.record,{status:'signaled',observedAtMs,observedPoll:polls});
              gl.deleteSync(mark.handle);mark.handle=null;
            }else if(status===gl.TIMEOUT_EXPIRED)mark.record.lastUnsignaledAtMs=observedAtMs;
            else throw new Error(status===gl.WAIT_FAILED?'Phase fence wait failed':'Unexpected phase fence status');
          }
          if(entry.marks.length===3&&entry.marks.every(mark=>mark.record.status==='signaled')){
            const [start,scene,output]=entry.marks.map(mark=>mark.record);
            const gap=(a,b)=>({source:'fence-availability',availabilityGapBoundsMs:{
              lower:Math.max(0,(b.lastUnsignaledAtMs??b.submittedAtMs)-a.observedAtMs),
              upper:Math.max(0,b.observedAtMs-(a.lastUnsignaledAtMs??a.submittedAtMs))},
              inconclusive:a.observedPoll===b.observedPoll});
            entry.record.phases={scene:gap(start,scene),output:gap(scene,output)};
            entry.record.inconclusive=start.observedPoll===scene.observedPoll&&scene.observedPoll===output.observedPoll;
            finish(entry,'completed');changed=true;
          }
        }
      }
      if(method==='ext-timer-query'){
        // Availability/result reads can themselves expose a disjoint. Stage
        // all ready values until this second check so none is accepted early.
        if(gl.getParameter(extension.GPU_DISJOINT_EXT)){invalidateDisjoint();return;}
        for(const entry of ready){finish(entry,'completed');changed=true;}
      }
    }catch(error){disable('phase-observation-failed',error);return;}
    if(changed)notify();schedulePoll();
  }
  function beginFrame(metadata={}){
    if(!active||disposed)return null;
    poll();
    if(!active)return null;
    if(current||startedSamples>=limits.maxSamples||pending.length>=limits.maxPending){skippedAttempts++;return null;}
    try{
      if(gl.isContextLost?.()){disable('context-lost');return null;}
      // Never interfere with a query owned by another diagnostics consumer.
      if(method==='ext-timer-query'&&gl.getQuery(extension.TIME_ELAPSED_EXT,gl.CURRENT_QUERY)!==null){skippedAttempts++;return null;}
      const record={id:++startedSamples,status:'pending',currentPhase:'scene',metadata:{...metadata},startedAtMs:now(),sceneSubmittedAtMs:null,
        submittedAtMs:null,observedAtMs:null,phases:{},marks:[]};
      const entry={record,queries:[],marks:[],activeQuery:null,finished:false};pending.push(entry);current=entry;
      peakPendingSamples=Math.max(peakPendingSamples,pending.length);
      if(method==='ext-timer-query')beginQuery(entry,'scene');else fence(entry,'start');
      return entry;
    }catch(error){disable('phase-start-failed',error);return null;}
  }
  function sceneComplete(entry){
    if(!entry||!active||current!==entry)return;
    try{
      if(method==='ext-timer-query'){endQuery(entry);beginQuery(entry,'output');}else fence(entry,'scene');
      entry.record.sceneSubmittedAtMs=now();entry.record.currentPhase='output';
    }catch(error){disable('scene-phase-end-failed',error);}
  }
  function completeFrame(entry){
    if(!entry||!active||current!==entry)return;
    try{
      if(method==='ext-timer-query')endQuery(entry);else fence(entry,'output');
      entry.finished=true;entry.record.submittedAtMs=now();entry.record.currentPhase='submitted';current=null;
      gl.flush();schedulePoll();
    }catch(error){disable('output-phase-end-failed',error);}
  }
  function abortFrame(entry,error){
    if(!entry||!pending.includes(entry))return;
    finish(entry,'aborted',String(error?.message||error||'Rendering aborted'));notify();
  }
  function getDiagnostics(){
    return {requested,enabled:active&&!disposed,method,status:disposed?'disposed':!active?'disabled':
      startedSamples>=limits.maxSamples&&!pending.length?'complete':'collecting',reason,timerQuerySupported,timerUnsupportedReason,fenceSupported,
      ...limits,startedSamples,completedSamples,discardedSamples,skippedAttempts,peakPendingSamples,polls,disjointEvents,
      pending:pending.map(entry=>JSON.parse(JSON.stringify(entry.record))),samples:history.map(record=>JSON.parse(JSON.stringify(record))),errors:[...errors],
      interpretation:method==='ext-timer-query'?'Device-reported elapsed query intervals for the scene including MSAA resolve and final output. Results exclude earlier queued work; they are not CPU or presentation latency. Disjoint results are discarded.':
        'Bounds on differences in observable fence availability, including browser status caching and polling delay. They are not isolated GPU durations. Marks first observed together are inconclusive.'};
  }
  return {beginFrame,sceneComplete,completeFrame,abortFrame,poll,getDiagnostics,
    dispose(){if(disposed)return;disposed=true;active=false;reason='disposed';stopTimer();for(const entry of [...pending])finish(entry,'aborted','disposed');}};
}
