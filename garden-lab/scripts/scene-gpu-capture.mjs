import assert from 'node:assert/strict';

/** Capture the latest public scene submission only after its GPU fence completes.
 * Callers must first await the public model update for any debounced controls.
 * One absolute deadline covers scrolling, readiness, GPU polling and capture.
 */
function captureRemaining(deadline){
  const remaining=deadline-Date.now();
  assert.ok(remaining>0,'Scene capture exceeded its existing 120 s deadline');
  return remaining;
}
export async function waitSceneCaptureReady(page,deadline){
  // RAF can continue while the app deliberately defers GPU submission. Observe
  // actual completed CPU submissions, then drain that same public WebGL context
  // without a blocking GPU wait before attributing pixels to its latest frame.
  return await page.evaluate(async timeout=>{
    const started=performance.now(),deadline=started+timeout;
    const pause=async()=>{
      if(performance.now()>=deadline)throw new Error('Scene capture readiness exceeded its deadline');
      await new Promise(resolve=>setTimeout(resolve,25));
    };
    const read=()=>{
      const canvas=document.querySelector('#scene-host canvas'),data=canvas?.dataset;
      return {canvas,frame:Number(data?.renderedFrameCount),pending:data?.renderPending,
        width:canvas?.width,height:canvas?.height,path:data?.renderPath};
    };
    const valid=state=>state.canvas&&state.pending==='false'&&Number.isInteger(state.frame)&&state.frame>0;
    const same=(before,after)=>valid(after)&&before.canvas===after.canvas&&before.frame===after.frame&&
      before.width===after.width&&before.height===after.height&&before.path===after.path;
    let polls=0,restarts=0,fencePolls=0,fenceElapsedMs=0;
    while(performance.now()<deadline){
      const state=read();polls++;
      if(!valid(state)){await pause();continue;}
      const gl=state.canvas.getContext('webgl2');
      let outcome='webgl1-no-fence';
      if(gl){
        if(gl.isContextLost())throw new Error('Scene capture WebGL context was lost');
        const sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);
        if(!sync)throw new Error('Scene capture could not allocate its completion fence');
        const fenceStarted=performance.now();
        try{
          gl.flush();outcome='pending';
          while(performance.now()<deadline){
            const result=gl.clientWaitSync(sync,0,0);fencePolls++;
            if(result===gl.ALREADY_SIGNALED||result===gl.CONDITION_SATISFIED){outcome='signaled';break;}
            if(result===gl.WAIT_FAILED||gl.isContextLost())throw new Error('Scene capture completion fence failed');
            if(!same(state,read())){outcome='superseded';break;}
            await pause();
          }
          if(outcome==='pending')throw new Error('Scene capture completion fence exceeded its deadline');
        }finally{
          fenceElapsedMs+=performance.now()-fenceStarted;
          gl.deleteSync(sync);
        }
      }else{
        // WebGL1 has no public sync objects. Its non-paced renderer still must
        // have submitted the current frame and remain stable across this yield.
        await pause();
      }
      if(outcome==='superseded'||!same(state,read())){restarts++;continue;}
      return {frame:state.frame,pending:false,width:state.width,height:state.height,path:state.path,
        fence:outcome,polls,restarts,fencePolls,fenceElapsedMs,elapsedMs:performance.now()-started};
    }
    throw new Error('Scene capture readiness exceeded its deadline');
  },captureRemaining(deadline));
}
export async function captureSceneScreenshot(page,selector,options={}, {label='scene',deadline=Date.now()+120000,captures=[],onFailure}={}){
  const started=Date.now(),evidence={name:label,status:'waiting',deadlineMs:deadline-started,attempts:0};
  captures.push(evidence);
  try{
    const target=page.locator(selector);
    await target.scrollIntoViewIfNeeded({timeout:captureRemaining(deadline)});
    while(true){
      evidence.attempts++;
      evidence.readiness=await waitSceneCaptureReady(page,deadline);
      const buffer=await target.screenshot({...options,timeout:captureRemaining(deadline)});
      const after=await page.locator('#scene-host canvas').evaluate(canvas=>({
        frame:Number(canvas.dataset.renderedFrameCount),pending:canvas.dataset.renderPending,
        width:canvas.width,height:canvas.height,path:canvas.dataset.renderPath,
      }),null,{timeout:captureRemaining(deadline)});
      const ready=evidence.readiness;
      if(after.pending!=='false'||after.frame!==ready.frame||after.width!==ready.width||
        after.height!==ready.height||after.path!==ready.path){captureRemaining(deadline);continue;}
      captureRemaining(deadline);evidence.status='passed';evidence.elapsedMs=Date.now()-started;
      return buffer;
    }
  }catch(error){evidence.status='failed';evidence.elapsedMs=Date.now()-started;evidence.error=String(error);onFailure?.(evidence,error);throw error;}
}
