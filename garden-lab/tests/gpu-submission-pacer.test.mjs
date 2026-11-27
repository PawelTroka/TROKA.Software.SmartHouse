import test from 'node:test';
import assert from 'node:assert/strict';
import {createGpuSubmissionPacer} from '../src/gpu-submission-pacer.js';

function fixture(){
  const state={time:0,next:0,deleted:[],flushed:0,waits:[],statuses:new Map(),lost:false,allocate:null,flushError:null,pollError:null};
  const gl={SYNC_GPU_COMMANDS_COMPLETE:1,ALREADY_SIGNALED:2,CONDITION_SATISFIED:3,TIMEOUT_EXPIRED:4,WAIT_FAILED:5,
    fenceSync(condition,flags){assert.equal(condition,1);assert.equal(flags,0);if(state.allocate==='null')return null;if(state.allocate==='throw')throw new Error('allocation');const sync={id:++state.next};state.statuses.set(sync.id,4);return sync;},
    clientWaitSync(sync,flags,timeout){assert.equal(flags,0);assert.equal(timeout,0);state.waits.push(sync.id);if(state.pollError)throw state.pollError;return state.statuses.get(sync.id);},
    deleteSync(sync){state.deleted.push(sync.id);},flush(){state.flushed++;if(state.flushError)throw state.flushError;},isContextLost:()=>state.lost};
  return {state,gl,pacer:createGpuSubmissionPacer(gl,{now:()=>state.time})};
}

test('only two actual main submissions may be outstanding while arbitrary camera ticks are deferred',()=>{
  const {state,gl,pacer}=fixture();
  assert.equal(pacer.canSubmit(),true);assert.equal(pacer.submitted(),true);state.time=16;
  assert.equal(pacer.canSubmit(),true);assert.equal(pacer.submitted(),true);
  for(let i=0;i<100;i++){state.time+=16;assert.equal(pacer.canSubmit(),false);}
  let d=pacer.getDiagnostics();assert.equal(d.submittedFrames,2);assert.equal(d.completedFrames,0);assert.equal(d.deferredAttempts,100);assert.equal(d.pendingFrames,2);assert.equal(d.peakPendingFrames,2);assert.equal(state.next,2);
  state.statuses.set(1,gl.CONDITION_SATISFIED);state.time+=16;assert.equal(pacer.canSubmit(),true);assert.equal(pacer.submitted(),true);
  d=pacer.getDiagnostics();assert.equal(d.submittedFrames,3);assert.equal(d.completedFrames,1);assert.equal(d.pendingFrames,2);assert.equal(d.peakPendingFrames,2);
  assert.deepEqual(state.deleted,[1]);assert.equal(state.flushed,3);pacer.dispose();assert.deepEqual(state.deleted,[1,2,3]);
});

test('FIFO fence observations retain queue depth and conservative completion bounds without inventing GPU time',()=>{
  const {state,gl,pacer}=fixture();pacer.canSubmit();pacer.submitted();state.time=10;pacer.canSubmit();pacer.submitted();
  state.time=20;assert.equal(pacer.canSubmit(),false);
  state.statuses.set(1,gl.ALREADY_SIGNALED);state.time=30;pacer.poll();
  state.statuses.set(2,gl.CONDITION_SATISFIED);state.time=50;pacer.poll();
  const d=pacer.getDiagnostics();assert.equal(d.completedFrames,2);assert.equal(d.pendingFrames,0);
  assert.deepEqual(d.recentCompletions.map(x=>[x.queueDepthAtSubmission,x.completionLatencyLowerMs,x.completionLatencyUpperMs]),[[1,20,30],[2,20,40]]);
  assert.equal(d.completionLatencyBoundsMs.meanLower,20);assert.equal(d.completionLatencyBoundsMs.meanUpper,35);assert.match(d.interpretation,/not isolated GPU durations/);pacer.dispose();
});

test('idle restoration shares the same queue and cannot bypass pending moving submissions',()=>{
  const {state,gl,pacer}=fixture();pacer.canSubmit();pacer.submitted();pacer.canSubmit();pacer.submitted();
  assert.equal(pacer.canSubmit(),false,'An idle restore request must wait just like a moving request');
  state.statuses.set(1,gl.CONDITION_SATISFIED);assert.equal(pacer.canSubmit(),true);pacer.submitted();
  assert.equal(pacer.getDiagnostics().pendingFrames,2);assert.equal(pacer.getDiagnostics().submittedFrames,3);pacer.dispose();
});

test('unavailable, lost and failed fences explicitly fall back without waiting or blocking rendering forever',()=>{
  const absent=createGpuSubmissionPacer(null);assert.equal(absent.canSubmit(),true);absent.submitted();
  assert.equal(absent.getDiagnostics().enabled,false);assert.equal(absent.getDiagnostics().untrackedFrames,1);absent.dispose();
  for(const failure of ['lost','wait','poll','allocation-null','allocation-throw','flush']){
    const {state,gl,pacer}=fixture();pacer.canSubmit();pacer.submitted();
    if(failure==='lost')state.lost=true;
    else if(failure==='wait')state.statuses.set(1,gl.WAIT_FAILED);
    else if(failure==='poll')state.pollError=new Error('poll');
    else if(failure.startsWith('allocation'))state.allocate=failure.endsWith('null')?'null':'throw';
    else state.flushError=new Error('flush');
    assert.doesNotThrow(()=>{if(['lost','wait','poll'].includes(failure))pacer.poll();else{pacer.canSubmit();pacer.submitted();}});
    const d=pacer.getDiagnostics();assert.equal(d.enabled,false,failure);assert.equal(d.pendingFrames,0,failure);assert.ok(d.reason);assert.equal(pacer.canSubmit(),true,failure);
    assert.equal(state.deleted.length,state.next,'Every allocated pending handle is deleted on failure');pacer.dispose();
  }
});

test('completion history and error fallback remain bounded and disposal is idempotent',()=>{
  const {state,gl,pacer}=fixture();
  for(let i=0;i<200;i++){assert.equal(pacer.canSubmit(),true);pacer.submitted();state.time+=10;state.statuses.set(state.next,gl.CONDITION_SATISFIED);pacer.poll();}
  const d=pacer.getDiagnostics();assert.equal(d.submittedFrames,200);assert.equal(d.completedFrames,200);assert.equal(d.completionLatencyBoundsMs.samples,64);assert.equal(d.recentCompletions.length,8);
  pacer.canSubmit();pacer.submitted();pacer.dispose();pacer.dispose();assert.equal(state.deleted.length,201);assert.equal(pacer.canSubmit(),false);
  const broken=fixture();broken.pacer.submitted();broken.pacer.submitted();broken.pacer.submitted();
  assert.equal(broken.state.next,2);assert.equal(broken.pacer.getDiagnostics().reason,'submission-without-available-slot');broken.pacer.dispose();
});
