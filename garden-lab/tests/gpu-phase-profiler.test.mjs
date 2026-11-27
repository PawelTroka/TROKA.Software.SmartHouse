import test from 'node:test';
import assert from 'node:assert/strict';
import {createGpuPhaseProfiler} from '../src/gpu-phase-profiler.js';

function fake({timers=true}={}){
  let time=0,next=0,current=null,disjoint=false,lost=false,updates=0;
  const scheduled=new Map(),queries=[],fences=[],deletedQueries=[],deletedFences=[],events=[];
  const extension={TIME_ELAPSED_EXT:10,QUERY_COUNTER_BITS_EXT:11,GPU_DISJOINT_EXT:12};
  const gl={CURRENT_QUERY:1,QUERY_RESULT_AVAILABLE:2,QUERY_RESULT:3,SYNC_GPU_COMMANDS_COMPLETE:4,
    ALREADY_SIGNALED:5,CONDITION_SATISFIED:6,TIMEOUT_EXPIRED:7,WAIT_FAILED:8,
    getExtension(){events.push('extension');return timers?extension:null;},
    getQuery(target,name){assert.equal(target,extension.TIME_ELAPSED_EXT);return name===extension.QUERY_COUNTER_BITS_EXT?64:current;},
    getParameter(name){assert.equal(name,extension.GPU_DISJOINT_EXT);const result=disjoint;disjoint=false;return result;},
    createQuery(){const q={id:queries.length+1,available:false,ns:0};queries.push(q);return q;},
    beginQuery(target,q){assert.equal(target,extension.TIME_ELAPSED_EXT);assert.equal(current,null);current=q;events.push('begin-'+q.id);},
    endQuery(target){assert.equal(target,extension.TIME_ELAPSED_EXT);assert.ok(current);events.push('end-'+current.id);current=null;},
    getQueryParameter(q,name){assert.ok(q);if(name===this.QUERY_RESULT_AVAILABLE)return q.available;assert.equal(q.available,true,'Never read a pending result');return q.ns;},
    deleteQuery(q){deletedQueries.push(q);},
    fenceSync(condition,flags){assert.equal(condition,this.SYNC_GPU_COMMANDS_COMPLETE);assert.equal(flags,0);const f={id:fences.length+1,at:Infinity};fences.push(f);return f;},
    clientWaitSync(f,flags,timeout){assert.equal(flags,0);assert.equal(timeout,0,'Never block on the GPU');return time>=f.at?this.CONDITION_SATISFIED:this.TIMEOUT_EXPIRED;},
    deleteSync(f){deletedFences.push(f);},flush(){events.push('flush');},isContextLost:()=>lost,
  };
  const options={enabled:true,now:()=>time,onUpdate:()=>updates++,schedule(fn,ms){const id=++next;scheduled.set(id,{fn,ms});return id;},cancel:id=>scheduled.delete(id)};
  return {gl,options,events,queries,fences,deletedQueries,deletedFences,scheduled,
    setTime:value=>{time=value;},setDisjoint:()=>{disjoint=true;},setLost:()=>{lost=true;},
    get current(){return current;},get updates(){return updates;},
    tick(value){time=value;const [id,entry]=scheduled.entries().next().value;scheduled.delete(id);entry.fn();},
  };
}
const render=(profiler,metadata={})=>{const frame=profiler.beginFrame(metadata);profiler.sceneComplete(frame);profiler.completeFrame(frame);return frame;};

test('default-off profiling never probes GL, allocates handles or schedules work',()=>{
  const f=fake(),p=createGpuPhaseProfiler(f.gl,{...f.options,enabled:false});
  assert.equal(p.beginFrame(),null);p.poll();p.sceneComplete(null);p.completeFrame(null);
  assert.deepEqual(f.events,[]);assert.equal(f.scheduled.size,0);assert.equal(p.getDiagnostics().requested,false);
  const updates=f.updates;p.getDiagnostics();p.getDiagnostics();assert.equal(f.updates,updates,'Reading diagnostics is pure');p.dispose();
});

test('two sequential timer intervals retain exact metadata and read results only after availability',()=>{
  const f=fake(),p=createGpuPhaseProfiler(f.gl,f.options),metadata={expectedPublicFrame:8,scenePixelRatio:.54,sceneBufferWidth:691,sceneBufferHeight:315};
  const frame=p.beginFrame(metadata);f.events.push('scene-and-msaa-resolve');p.sceneComplete(frame);f.events.push('output');p.completeFrame(frame);
  assert.deepEqual(f.events,['extension','begin-1','scene-and-msaa-resolve','end-1','begin-2','output','end-2','flush']);
  f.tick(50);assert.equal(p.getDiagnostics().completedSamples,0);assert.equal(f.scheduled.size,1);
  f.queries[0].available=true;f.queries[0].ns=3123456789;f.queries[1].available=true;f.queries[1].ns=123456789;
  f.tick(100);const d=p.getDiagnostics(),sample=d.samples[0];
  assert.equal(d.method,'ext-timer-query');assert.equal(d.completedSamples,1);assert.equal(sample.status,'completed');
  assert.deepEqual(sample.metadata,metadata);assert.equal(sample.phases.scene.elapsedMs,3123.456789);assert.equal(sample.phases.output.elapsedMs,123.456789);
  assert.equal(f.deletedQueries.length,2);assert.equal(f.scheduled.size,0);assert.equal(f.current,null);assert.equal(f.updates,1);
  sample.metadata.scenePixelRatio=10;assert.equal(p.getDiagnostics().samples[0].metadata.scenePixelRatio,.54);
  p.dispose();assert.equal(f.deletedQueries.length,2);
});

test('disjoint queries, aborted phases, context loss and observation failures release all resources',()=>{
  for(const failure of ['disjoint','abort-scene','abort-output','context-lost','result-error','null-query','flush-error']){
    const f=fake(),p=createGpuPhaseProfiler(f.gl,f.options);
    if(failure==='null-query')f.gl.createQuery=()=>null;
    const frame=p.beginFrame();
    if(failure==='abort-scene')p.abortFrame(frame,new Error('scene failed'));
    else if(frame){p.sceneComplete(frame);
      if(failure==='abort-output')p.abortFrame(frame,new Error('output failed'));
      else{if(failure==='flush-error')f.gl.flush=()=>{throw new Error('flush failed');};p.completeFrame(frame);}}
    if(failure==='disjoint')f.setDisjoint();
    if(failure==='context-lost')f.setLost();
    if(failure==='result-error')f.gl.getQueryParameter=()=>{throw new Error('query failed');};
    p.poll();p.dispose();
    assert.equal(f.current,null,failure);assert.equal(f.scheduled.size,0,failure);
    assert.equal(new Set(f.deletedQueries).size,f.queries.length,failure);assert.equal(f.deletedQueries.length,f.queries.length,failure);
    assert.equal(p.getDiagnostics().completedSamples,0,failure);
  }
});

test('a disjoint exposed while reading availability invalidates every staged and partial timer result',()=>{
  const f=fake(),p=createGpuPhaseProfiler(f.gl,f.options);render(p);render(p);
  for(const q of f.queries){q.available=true;q.ns=123e6;}
  const get=f.gl.getQueryParameter.bind(f.gl);
  f.gl.getQueryParameter=(query,name)=>{
    if(query===f.queries[2]&&name===f.gl.QUERY_RESULT_AVAILABLE)f.setDisjoint();
    return get(query,name);
  };
  f.tick(50);const d=p.getDiagnostics();
  assert.equal(d.completedSamples,0);assert.equal(d.disjointEvents,1);assert.equal(d.discardedSamples,2);
  assert.ok(d.samples.every(sample=>sample.status==='disjoint'&&Object.keys(sample.phases).length===0));
  assert.equal(f.deletedQueries.length,4);assert.equal(new Set(f.deletedQueries).size,4);assert.equal(f.scheduled.size,0);p.dispose();
});

test('fallback fences bracket observed phase availability and identify simultaneous observations as inconclusive',()=>{
  const f=fake({timers:false}),p=createGpuPhaseProfiler(f.gl,f.options);render(p,{expectedPublicFrame:2});
  f.fences[0].at=40;f.fences[1].at=140;f.fences[2].at=190;
  f.tick(50);f.tick(100);f.tick(150);f.tick(200);
  const d=p.getDiagnostics(),s=d.samples[0];assert.equal(d.method,'fence-availability');
  assert.deepEqual(s.phases.scene,{source:'fence-availability',availabilityGapBoundsMs:{lower:50,upper:150},inconclusive:false});
  assert.deepEqual(s.phases.output,{source:'fence-availability',availabilityGapBoundsMs:{lower:0,upper:100},inconclusive:false});
  assert.equal(s.inconclusive,false);assert.equal(f.deletedFences.length,3);assert.equal(f.scheduled.size,0);
  render(p);for(const x of f.fences.slice(3))x.at=210;f.tick(250);
  assert.equal(p.getDiagnostics().samples[1].inconclusive,true);
  assert.ok(Object.values(p.getDiagnostics().samples[1].phases).every(phase=>phase.inconclusive&&!('elapsedMs' in phase)));
  p.dispose();assert.equal(f.deletedFences.length,6);
});

test('a throwing initial disjoint capability query selects the available fence fallback',()=>{
  const f=fake();f.gl.getParameter=()=>{throw new Error('Initial disjoint query failed');};
  const p=createGpuPhaseProfiler(f.gl,f.options);render(p);
  const initial=p.getDiagnostics();assert.equal(initial.timerQuerySupported,false);
  assert.equal(initial.timerUnsupportedReason,'timer-capability-query-failed');
  assert.equal(initial.method,'fence-availability');assert.equal(initial.enabled,true);
  assert.equal(f.queries.length,0);assert.equal(f.fences.length,3);
  for(const fence of f.fences)fence.at=40;f.tick(50);
  assert.equal(p.getDiagnostics().completedSamples,1);assert.equal(f.deletedFences.length,3);
  assert.equal(f.scheduled.size,0);p.dispose();assert.equal(f.deletedFences.length,3);
});

test('pending work, lifetime samples, retained evidence and timers remain bounded',()=>{
  const f=fake(),p=createGpuPhaseProfiler(f.gl,{...f.options,maxSamples:4,retainedSamples:2});
  render(p);render(p);assert.equal(p.beginFrame(),null);assert.equal(p.getDiagnostics().pending.length,2);
  for(const q of f.queries){q.available=true;q.ns=1e6;}f.tick(50);
  render(p);render(p);for(const q of f.queries){q.available=true;q.ns=1e6;}f.tick(100);
  for(let i=0;i<20;i++)assert.equal(p.beginFrame(),null);
  const d=p.getDiagnostics();assert.equal(d.startedSamples,4);assert.equal(d.completedSamples,4);assert.equal(d.samples.length,2);
  assert.equal(d.peakPendingSamples,2);assert.equal(d.status,'complete');assert.equal(f.queries.length,8);assert.equal(f.deletedQueries.length,8);assert.equal(f.scheduled.size,0);
  p.dispose();
  const limits=createGpuPhaseProfiler(null,{maxSamples:NaN,maxPending:Infinity,maximumPendingMs:Infinity}).getDiagnostics();
  assert.equal(limits.maxSamples,32);assert.equal(limits.maxPending,2);assert.equal(limits.maximumPendingMs,60000);
});

test('fallback failures and time caps clean up while leaving the renderer free to continue',()=>{
  for(const failure of ['null-fence','wait-failed','poll-throw','context-lost','time-cap','dispose']){
    const f=fake({timers:false}),p=createGpuPhaseProfiler(f.gl,{...f.options,maximumPendingMs:100});
    if(failure==='null-fence')f.gl.fenceSync=()=>null;
    render(p);
    if(failure==='wait-failed')f.gl.clientWaitSync=()=>f.gl.WAIT_FAILED;
    if(failure==='poll-throw')f.gl.clientWaitSync=()=>{throw new Error('fence failed');};
    if(failure==='context-lost')f.setLost();
    if(failure==='time-cap')f.setTime(101);
    if(failure==='dispose')p.dispose();else p.poll();
    p.dispose();p.dispose();
    assert.equal(f.scheduled.size,0,failure);assert.equal(f.deletedFences.length,f.fences.length,failure);
    assert.equal(new Set(f.deletedFences).size,f.fences.length,failure);assert.equal(p.getDiagnostics().completedSamples,0,failure);
  }
});
