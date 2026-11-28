import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {waitSceneCaptureReady,captureSceneScreenshot} from '../scripts/scene-gpu-capture.mjs';

// Run the serializable page callback against a public canvas and sync-object
// double. No app internals, browser installation, or local WebGL are required.
function fixture(){
  let now=0;
  const calls={yields:0,created:0,deleted:0,flushed:0,waits:0,screenshots:0};
  const canvas={dataset:{renderedFrameCount:'3',renderPending:'false',renderPath:'direct'},width:100,height:70};
  const control={canvas,onYield:()=>{},onWait:()=>2,onScreenshot:()=>{},lost:false,noFence:false,webgl1:false};
  const gl={SYNC_GPU_COMMANDS_COMPLETE:9,ALREADY_SIGNALED:1,CONDITION_SATISFIED:2,TIMEOUT_EXPIRED:3,WAIT_FAILED:4,
    isContextLost:()=>control.lost,
    fenceSync:()=>{calls.created++;return control.noFence?null:{id:calls.created};},
    flush:()=>calls.flushed++,
    clientWaitSync:(sync,flags,timeout)=>{
      assert.equal(flags,0);assert.equal(timeout,0,'Capture fences must never block the JS event loop');
      return control.onWait(++calls.waits,sync);
    },
    deleteSync:()=>calls.deleted++};
  canvas.getContext=type=>{assert.equal(type,'webgl2');return control.webgl1?null:gl;};
  const browser={performance:{now:()=>now},document:{querySelector:()=>control.canvas},
    setTimeout:callback=>{now+=25;control.onYield(++calls.yields);queueMicrotask(callback);}};
  const page={
    evaluate:async(fn,arg)=>vm.runInNewContext('('+fn.toString()+')(argument)',{...browser,argument:arg}),
    locator:()=>({
      scrollIntoViewIfNeeded:async()=>{},
      screenshot:async options=>{
        assert.ok(options.timeout>0&&options.timeout<=1000);
        calls.screenshots++;control.onScreenshot(calls.screenshots);
        return Buffer.from(String(calls.screenshots));
      },
      evaluate:async fn=>fn(control.canvas),
    }),
  };
  return {page,canvas,control,calls};
}

test('capture readiness waits for an actual submission and a signaled completion fence',async()=>{
  const {page,canvas,control,calls}=fixture();
  canvas.dataset.renderPending='true';canvas.dataset.renderedFrameCount='2';
  control.onYield=n=>{if(n===1){canvas.dataset.renderPending='false';canvas.dataset.renderedFrameCount='3';}};
  control.onWait=n=>n<3?3:2;
  const ready=await waitSceneCaptureReady(page,Date.now()+1000);
  assert.equal(ready.frame,3);assert.equal(ready.fence,'signaled');assert.equal(ready.fencePolls,3);
  assert.equal(calls.created,1);assert.equal(calls.deleted,1);assert.equal(calls.flushed,1);
});

test('a superseding render discards its fence and waits for the new actual frame',async()=>{
  const {page,canvas,control,calls}=fixture();
  control.onWait=(n,sync)=>{
    if(sync.id===1){canvas.dataset.renderedFrameCount='4';canvas.dataset.renderPending='true';return 3;}
    return 1;
  };
  control.onYield=()=>{canvas.dataset.renderPending='false';};
  const ready=await waitSceneCaptureReady(page,Date.now()+1000);
  assert.equal(ready.frame,4);assert.equal(ready.restarts,1);
  assert.equal(calls.created,2);assert.equal(calls.deleted,2);
});

test('WebGL1 records a stable actual-frame fallback without creating sync objects',async()=>{
  const {page,control,calls}=fixture();control.webgl1=true;
  const ready=await waitSceneCaptureReady(page,Date.now()+1000);
  assert.equal(ready.fence,'webgl1-no-fence');assert.equal(ready.frame,3);
  assert.equal(calls.created,0);assert.equal(calls.deleted,0);
});

test('a failed nonblocking wait deletes its allocated sync',async()=>{
  const {page,control,calls}=fixture();control.onWait=()=>4;
  await assert.rejects(waitSceneCaptureReady(page,Date.now()+1000),/completion fence failed/);
  assert.equal(calls.created,1);assert.equal(calls.deleted,1);
});

test('deadline expiry deletes an unsignaled sync',async()=>{
  const {page,control,calls}=fixture();control.onWait=()=>3;
  await assert.rejects(waitSceneCaptureReady(page,Date.now()+1000),/deadline/);
  assert.equal(calls.created,1);assert.equal(calls.deleted,1);
});

test('context loss cannot be reported as captured readiness',async()=>{
  const {page,control,calls}=fixture();control.lost=true;
  await assert.rejects(waitSceneCaptureReady(page,Date.now()+1000),/context was lost/);
  assert.equal(calls.created,0);assert.equal(calls.deleted,0);
});

test('failed fence allocation is explicit',async()=>{
  const {page,control,calls}=fixture();control.noFence=true;
  await assert.rejects(waitSceneCaptureReady(page,Date.now()+1000),/allocate/);
  assert.equal(calls.created,1);assert.equal(calls.deleted,0);
});

test('a frame change during PNG capture retries inside the shared deadline and records the final frame',async()=>{
  const {page,canvas,control,calls}=fixture(),captures=[];
  control.onScreenshot=n=>{if(n===1)canvas.dataset.renderedFrameCount='4';};
  const image=await captureSceneScreenshot(page,'#scene-host canvas',{type:'png'},
    {label:'superseded-screenshot',deadline:Date.now()+1000,captures});
  assert.equal(image.toString(),'2');assert.equal(captures.length,1);
  assert.equal(captures[0].attempts,2);assert.equal(captures[0].readiness.frame,4);
  assert.equal(captures[0].status,'passed');assert.equal(calls.created,2);assert.equal(calls.deleted,2);
});
