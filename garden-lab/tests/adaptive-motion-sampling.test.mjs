import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdaptiveMotionQuality} from '../src/frame-performance.js';
import {createGpuSubmissionPacer} from '../src/gpu-submission-pacer.js';

const submission=(frame,overrides={})=>({frame,tracked:true,active:true,quality:'auto',renderPath:'motion-target',
  motionQualityScale:.54,motionSamples:4,sceneBufferWidth:691,sceneBufferHeight:315,compacted:true,shadowUploadGuard:null,...overrides});
const blocked=(overrides={})=>({blocked:true,active:true,quality:'auto',enabled:true,pendingFrames:2,maxInFlight:2,oldestPendingMs:1000,...overrides});
function minimum(controller){
  for(const time of [0,900,1800])assert.equal(controller.pressure(time,1000),true);
  assert.equal(controller.scale,.54);
}
function qualify(controller,first=1,overrides={}){
  controller.submitted(submission(first,overrides));controller.submitted(submission(first+1,overrides));
}
function trigger(controller,start=10000){
  assert.equal(controller.samplingPressure(start,blocked()),false);
  assert.equal(controller.samplingPressure(start+899,blocked()),false);
  assert.equal(controller.samplingPressure(start+900,blocked()),true);
  assert.equal(controller.singleSample,true);
}

test('desired minimum scale cannot substitute for two actual tracked minimum-target submissions',()=>{
  const controller=createAdaptiveMotionQuality();minimum(controller);
  for(const now of [3000,10000,20000])assert.equal(controller.samplingPressure(now,blocked({oldestPendingMs:100000})),false);
  controller.submitted(submission(1,{motionQualityScale:.84,sceneBufferWidth:1075,sceneBufferHeight:490}));
  controller.submitted(submission(2,{motionQualityScale:.68,sceneBufferWidth:870,sceneBufferHeight:397}));
  assert.equal(controller.getDiagnostics().sampling.qualifyingSubmissions,0);
  assert.equal(controller.samplingPressure(30000,blocked()),false);
  controller.submitted(submission(3));assert.equal(controller.samplingPressure(40000,blocked()),false);
  controller.submitted(submission(4));trigger(controller,50000);
  const diagnostics=controller.getDiagnostics(),evidence=diagnostics.sampling.lastTrigger;
  assert.equal(diagnostics.level,3);assert.equal(diagnostics.changes,3,'Sampling does not rewrite the resolution-policy history');
  assert.equal(evidence.pressureMs,900);assert.deepEqual(evidence.qualifyingSubmissions.map(frame=>frame.frame),[3,4]);
  assert.ok(evidence.qualifyingSubmissions.every(frame=>frame.motionQualityScale===.54&&frame.motionSamples===4&&frame.sceneBufferWidth===691));
});

test('only ordinary Auto moving submissions qualify; unsupported, untracked and exceptional work resets the streak',()=>{
  for(const overrides of [
    {tracked:false},{active:false},{quality:'high'},{quality:'eco'},{renderPath:'ao-composer'},
    {renderPath:'direct'},{motionSamples:0},{motionSamples:1},{motionQualityScale:.68},
    {compacted:false},{shadowUploadGuard:'shadow-pass'},{shadowUploadGuard:'post-shadow-full-pass'},
    {sceneBufferWidth:0},{sceneBufferHeight:0},
  ]){
    const controller=createAdaptiveMotionQuality();minimum(controller);
    controller.submitted(submission(1));controller.submitted(submission(2,overrides));controller.submitted(submission(3));
    assert.equal(controller.getDiagnostics().sampling.qualifyingSubmissions,1,JSON.stringify(overrides));
    assert.equal(controller.samplingPressure(10000,blocked()),false);assert.equal(controller.samplingPressure(20000,blocked()),false);
    assert.equal(controller.singleSample,false,JSON.stringify(overrides));
  }
});

test('current target dimensions and sample count must agree across consecutive actual frame IDs',()=>{
  const controller=createAdaptiveMotionQuality();minimum(controller);
  controller.submitted(submission(4));controller.submitted(submission(6));
  assert.equal(controller.getDiagnostics().sampling.qualifyingSubmissions,1,'A skipped frame ID breaks attribution');
  controller.submitted(submission(7,{sceneBufferWidth:552,sceneBufferHeight:252}));
  assert.equal(controller.getDiagnostics().sampling.qualifyingSubmissions,1,'A surface resize cannot inherit an old allocation');
  controller.submitted(submission(8,{sceneBufferWidth:552,sceneBufferHeight:252,motionSamples:2}));
  assert.equal(controller.getDiagnostics().sampling.qualifyingSubmissions,1);
  controller.submitted(submission(9,{sceneBufferWidth:552,sceneBufferHeight:252,motionSamples:2}));
  assert.equal(controller.getDiagnostics().sampling.qualifyingSubmissions,2);
  trigger(controller);
  assert.ok(controller.getDiagnostics().sampling.lastTrigger.qualifyingSubmissions.every(frame=>frame.sceneBufferWidth===552&&frame.motionQualityScale===.54),
    'A device budget may make actual pixel ratio smaller than the applied .54 quality factor');
});

test('sampling requires fresh sustained full-queue pressure, and a free slot or mild interval restarts its clock',()=>{
  const controller=createAdaptiveMotionQuality();minimum(controller);qualify(controller);
  for(const overrides of [{blocked:false},{enabled:false},{pendingFrames:1},{maxInFlight:1},{oldestPendingMs:250},{oldestPendingMs:NaN}]){
    assert.equal(controller.samplingPressure(3000,blocked()),false);
    assert.equal(controller.samplingPressure(3899,blocked(overrides)),false);
    assert.equal(controller.samplingPressure(4000,blocked()),false,'Discontinuous pressure must start over');
    controller.samplingPressure(4001,blocked({blocked:false}));
  }
  trigger(controller,5000);
  assert.equal(controller.samplingPressure(100000,blocked()),false,'A latched gesture switches only once');
  assert.equal(controller.getDiagnostics().sampling.changes,1);
  controller.samplingPressure(100001,blocked({blocked:false}));
  assert.equal(controller.singleSample,true,'A recovered slot cannot cause quality pumping during the same gesture');
});

test('a viewport or device resize invalidates an eligible pair before another frame is admitted',()=>{
  for(const change of [{width:1200},{height:600},{scenePixelRatio:.432},{devicePixelRatio:2}]){
    const controller=createAdaptiveMotionQuality(),surface={width:1280,height:584,scenePixelRatio:.54,devicePixelRatio:1};
    minimum(controller);controller.surface(surface);qualify(controller);
    assert.equal(controller.samplingPressure(10000,blocked()),false);
    controller.surface({...surface,...change});
    assert.equal(controller.getDiagnostics().sampling.qualifyingSubmissions,0);
    assert.equal(controller.samplingPressure(20000,blocked()),false,'An old pair cannot activate after pending allocation changes');
    qualify(controller,3);trigger(controller,21000);
    controller.surface({...surface,...change});assert.equal(controller.singleSample,true,'An unchanged allocation keeps the gesture latch');
    controller.surface(surface);assert.equal(controller.singleSample,false,'A latched gesture must requalify a changed allocation');
  }
});

test('the sampling latch resets at rest and quality changes while learned resolution persists between gestures',()=>{
  const controller=createAdaptiveMotionQuality();minimum(controller);qualify(controller);trigger(controller);
  controller.rest();assert.equal(controller.singleSample,false);assert.equal(controller.scale,.54);
  assert.equal(controller.getDiagnostics().sampling.qualifyingSubmissions,0);
  assert.equal(controller.samplingPressure(20000,blocked()),false,'A quick stop/start cannot inherit old qualifying frames');
  qualify(controller,3);trigger(controller,21000);
  controller.sample(23000,0,false);assert.equal(controller.singleSample,false);
  qualify(controller,5);trigger(controller,24000);
  controller.samplingPressure(25000,blocked({quality:'high'}));assert.equal(controller.singleSample,false);
  qualify(controller,7);trigger(controller,26000);
  controller.reset();assert.equal(controller.singleSample,false);assert.equal(controller.scale,1);
  assert.equal(controller.getDiagnostics().sampling.changes,0);assert.equal(controller.getDiagnostics().sampling.lastTrigger,null);
});

test('explicit keep/single diagnostics never arm Auto sampling, and returned trigger evidence is immutable',()=>{
  for(const motionMsaaDiagnostic of ['keep','single']){
    const controller=createAdaptiveMotionQuality({motionMsaaDiagnostic});minimum(controller);qualify(controller);
    for(const now of [3000,10000])assert.equal(controller.samplingPressure(now,blocked()),false);
    assert.equal(controller.singleSample,false);assert.equal(controller.getDiagnostics().sampling.control,motionMsaaDiagnostic);
  }
  const controller=createAdaptiveMotionQuality({motionMsaaDiagnostic:'unknown'});minimum(controller);qualify(controller);trigger(controller);
  const snapshot=controller.getDiagnostics();snapshot.sampling.lastTrigger.qualifyingSubmissions[0].motionSamples=0;
  snapshot.sampling.lastTrigger.pressureMs=0;
  assert.equal(controller.getDiagnostics().sampling.lastTrigger.qualifyingSubmissions[0].motionSamples,4);
  assert.equal(controller.getDiagnostics().sampling.lastTrigger.pressureMs,900);
});

test('the real two-slot fence queue cannot attribute old larger-target work to the new minimum target',()=>{
  let now=0,frame=0;const handles=[];
  const gl={SYNC_GPU_COMMANDS_COMPLETE:1,ALREADY_SIGNALED:2,CONDITION_SATISFIED:3,TIMEOUT_EXPIRED:4,WAIT_FAILED:5,
    fenceSync(){const handle={signaled:false};handles.push(handle);return handle;},
    clientWaitSync(handle,flags,timeout){assert.equal(timeout,0);return handle.signaled?this.ALREADY_SIGNALED:this.TIMEOUT_EXPIRED;},
    deleteSync(){},flush(){}};
  const pacer=createGpuSubmissionPacer(gl,{now:()=>now}),controller=createAdaptiveMotionQuality();minimum(controller);
  function decision(){
    const admitted=pacer.canSubmit(),queue=pacer.getDiagnostics();
    return controller.samplingPressure(now,{...queue,blocked:!admitted,active:true,quality:'auto'});
  }
  function draw(scale){
    assert.equal(pacer.canSubmit(),true);controller.samplingPressure(now,{active:true,quality:'auto'});
    controller.submitted(submission(++frame,{tracked:pacer.submitted(),motionQualityScale:scale}));
  }
  draw(.84);draw(.68);now=20000;assert.equal(decision(),false);
  handles[0].signaled=true;draw(.54);now=30000;assert.equal(decision(),false);
  assert.equal(pacer.getDiagnostics().pendingFrames,2);assert.equal(controller.getDiagnostics().sampling.qualifyingSubmissions,1,
    'One old .68 frame still occupies the queue beside the first minimum frame');
  handles[1].signaled=true;draw(.54);now=40000;assert.equal(decision(),false);
  now=40899;assert.equal(decision(),false);now=40900;assert.equal(decision(),true);
  assert.deepEqual(controller.getDiagnostics().sampling.lastTrigger.qualifyingSubmissions.map(x=>x.frame),[3,4]);
  assert.equal(pacer.getDiagnostics().submittedFrames,4,'Pressure polls are not rendered frames');pacer.dispose();
});
