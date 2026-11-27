// Reproducible, real WebGL baseline/candidate walking traces on one CI browser.
// Camera entry, movement, labels and fullscreen use public UI/Share controls.
// RAF and Long Task observers are instrumentation only; no private app hooks.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {frameTimeSummary} from '../src/frame-performance.js';

assert.notEqual(process.env.SITES_MANAGED_LINUX_CONTAINER,'1','Run real WebGL performance evidence in GitHub Actions; use the approved preview in the managed workspace.');
assert.ok(process.env.BASELINE_DIR,'BASELINE_DIR must name the built 66c096a garden-lab checkout.');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),baselineRoot=path.resolve(process.env.BASELINE_DIR);
const output=path.join(root,'test-results','walk-performance');await mkdir(output,{recursive:true});
const baselineState=await import(pathToFileURL(path.join(baselineRoot,'src/state.js')).href);
const baselineVersion=JSON.parse(await readFile(path.join(baselineRoot,'package.json'),'utf8')).version;
const candidateVersion=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version;
const fixture=baselineState.sanitizeState({...baselineState.DEFAULTS,designStyle:'scandinavian',styleHouseFinish:true,sceneMotion:false,renderQuality:'auto',
  showDimensions:true,showRays:false,showLabels:false,existingVegetation:true,sunEnabled:true,sunDate:'2026-06-21',sunMinutes:780,
  mode:'orbit',interiorEnabled:false,walkNavigation:'free'});
const hash=baselineState.encodeState(fixture),duration=Math.max(6000,Math.min(20000,Number(process.env.BENCHMARK_DURATION_MS)||8000));
const minimumSamples=32,warmupLimitMs=30000,captureLimitMs=60000,shuttleHalfWidthM=.35;
const report={status:'running',baseline:{commit:'66c096a',version:baselineVersion},candidate:{version:candidateVersion},
  method:'Same Chromium process and software GPU; public Share fixture, room entry, fullscreen and continuous public walking keys. A lateral shuttle follows the same bounded strip using observed walking positions. Warmup requires elapsed time, delivered frames and a stable observed buffer, subject to a recorded time cap. Each measured RAF/Long Task trace requires minimum elapsed time and delivered samples, with a 60-second cap. No mocked rendering or private app state.',
  limitations:['CI uses SwiftShader on a shared CPU host, not the user’s GPU; absolute FPS must not be generalized to user hardware.',
    'RAF delivery measures observed navigation cadence, not isolated GPU timer-query time. Public frame counts and changing walking poses verify active rendering.',
    'The candidate legacy comparison freezes the old living-room composition and disables equipment labels. The new kitchen remains present, so complete geometry equality is not claimed.',
    'Warmup may reach its time cap before the buffer settles; its actual completion and every measured buffer are recorded. Idle images restore the selected full detail.',
    'One trace per scenario and route is directional shared-host evidence. At the minimum sample count, the 1% low is the worst single delivered interval, not a statistically stable tail estimate.',
    'The shuttle reverses on public position feedback, so dispatch latency can overshoot its target bounds; observed route offsets are retained for comparison.',
    'A time-capped control below the minimum sample count is explicitly sample-limited: no percentile, 1% low or percentage speedup is inferred from it. Adequate candidates must exceed the control qualification rate for a directional throughput comparison.',
    'Renderer throughput uses the public published-frame counter over the complete observed window. Counter publication is periodic; this is an observed finite-window rate, not a confidence interval or input-to-photon measurement.'],
  fixture,viewport:{width:1280,height:800,deviceScaleFactor:1},durationMs:duration,
  capturePolicy:{minimumSamples,warmupMinimumMs:4000,warmupLimitMs,captureLimitMs,stableBufferMinimumFrames:12,stableBufferMinimumMs:1500,shuttleHalfWidthM,discardedInitialIntervals:0,regressionEnforced:process.env.ENFORCE_PERFORMANCE_REGRESSION==='1'},
  host:{platform:os.platform(),release:os.release(),arch:os.arch(),cpuModel:os.cpus()[0]?.model,logicalCpus:os.cpus().length,totalMemoryGB:os.totalmem()/1024**3,node:process.version},
  runs:[],comparisons:[],errors:[],failures:[]};
const servers=[];let browser;
const save=()=>writeFile(path.join(output,'browser-report.json'),JSON.stringify(report,null,2));
async function serve(directory){
  const publicDir=path.join(directory,'public'),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
  await readFile(path.join(publicDir,'index.html'));
  const server=createServer(async(req,res)=>{try{
    const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(publicDir,'.'+(name.endsWith('/')?name+'index.html':name));
    if(!file.startsWith(publicDir+path.sep))throw new Error('Invalid path');
    const content=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(content);
  }catch{res.writeHead(404);res.end();}});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});servers.push(server);return 'http://127.0.0.1:'+server.address().port;
}
async function settled(page,floor){
  await page.locator('#scene-host').scrollIntoViewIfNeeded();
  await page.waitForFunction(floor=>{const d=document.querySelector('#render-diagnostics')?.dataset,c=document.querySelector('#scene-host canvas');
    return d?.renderer==='webgl'&&d.renderedStyle==='scandinavian'&&d.drawEnabled==='true'&&d.interacting==='false'&&d.renderPending==='false'&&
      Number(d.frames)>0&&Number(d.triangles)>0&&(!floor||c?.dataset.walkFloor===floor)&&
      Number(d.surfaceAssetsRequested)>0&&d.surfaceAssetsLoaded===d.surfaceAssetsRequested&&Number(d.surfaceAssetsFailed)===0;
  },floor,{timeout:120000});
}
async function info(page){return page.locator('#render-diagnostics').evaluate(node=>{const data={...node.dataset};
  for(const key of ['performanceTiming','adaptiveQuality','sceneOptimization','interiorDimensions','equipmentLabels','mirrors','livingCinema','luxuryKitchen'])try{data[key]=JSON.parse(data[key]||'null');}catch{}
  const c=document.querySelector('#scene-host canvas');data.pose={floor:c?.dataset.walkFloor,position:c?.dataset.walkPosition?.split(',').map(Number),yaw:Number(c?.dataset.walkYaw),pitch:Number(c?.dataset.walkPitch),fov:Number(c?.dataset.walkFov)};
  data.viewport={width:c?.clientWidth,height:c?.clientHeight,bufferWidth:c?.width,bufferHeight:c?.height};return data;
});}
async function enterLiving(page){
  await page.locator('#interior-open').click();const host=page.locator('#interior-host');await host.waitFor({state:'visible'});
  const field=id=>host.locator(`[data-iw="${id}"]`);
  await host.locator('[data-view="plan"]').click();await field('floor').selectOption('ground');await field('room').selectOption('lounge');
  await host.locator('[data-view="room"]').click();await settled(page,'ground');
}
function continuousShuttle(page,pose){
  const angle=Math.PI+pose.yaw*Math.PI/180,axis=[-Math.cos(angle),0,-Math.sin(angle)];let held=null;
  return {
    async step(position){
      const offset=position?.length===3?position.reduce((sum,value,i)=>sum+(value-pose.position[i])*axis[i],0):0;
      const next=!held?'a':held==='a'&&offset>=shuttleHalfWidthM?'d':held==='d'&&offset<=-shuttleHalfWidthM?'a':held;
      if(next!==held){
        // Press the new direction before releasing the old one: the app never
        // sees an empty held-key set and cannot restore its idle render target.
        await page.keyboard.down(next);if(held)await page.keyboard.up(held);held=next;
      }
    },
    async stop(){await page.keyboard.up('a');await page.keyboard.up('d');held=null;},
    offset(position){return position?.length===3?position.reduce((sum,value,i)=>sum+(value-pose.position[i])*axis[i],0):null;},
  };
}
async function snapshotTrace(page,{stop=false}={}){
  return page.evaluate(stop=>{const t=window.__navigationTrace;if(!t)return null;
    if(stop){t.active=false;cancelAnimationFrame(t.handle);for(const e of t.observer?.takeRecords()||[])t.longTasks.push({start:e.startTime,duration:e.duration});t.observer?.disconnect();}
    const result={frames:t.frames,longTasks:t.longTasks,elapsedMs:performance.now()-t.start,initialRenderedFrames:t.initialRenderedFrames,
      finalRenderedFrames:Number(document.querySelector('#render-diagnostics')?.dataset.frames)||0};
    if(stop)delete window.__navigationTrace;return result;
  },stop);
}
async function traceNavigation(page,shuttle,{minimumMs,maximumMs,requireStableBuffer=false,onCheckpoint}){
  await page.evaluate(()=>{
    const trace={frames:[],longTasks:[],active:true,handle:0,start:performance.now(),observer:null,
      initialRenderedFrames:Number(document.querySelector('#render-diagnostics')?.dataset.frames)||0,bufferKey:'',bufferStart:0,bufferFrames:0};window.__navigationTrace=trace;
    try{trace.observer=new PerformanceObserver(list=>{for(const e of list.getEntries())trace.longTasks.push({start:e.startTime,duration:e.duration});});trace.observer.observe({type:'longtask',buffered:false});}catch{}
    let last=0;
    const frame=now=>{if(!trace.active)return;const c=document.querySelector('#scene-host canvas'),key=c?.width+'×'+c?.height;
      if(key!==trace.bufferKey){trace.bufferKey=key;trace.bufferStart=now;trace.bufferFrames=0;}trace.bufferFrames++;
      if(last)trace.frames.push({ms:now-last,t:now-trace.start,position:c?.dataset.walkPosition,renderedFrames:Number(document.querySelector('#render-diagnostics')?.dataset.frames),bufferWidth:c?.width,bufferHeight:c?.height});
      last=now;trace.handle=requestAnimationFrame(frame);
    };trace.handle=requestAnimationFrame(frame);
  });
  let progress=null,checkpointAt=Date.now()+5000,metMinimum=false;
  try{
    while(true){
      await page.waitForTimeout(150);
      progress=await page.evaluate(()=>{const t=window.__navigationTrace,c=document.querySelector('#scene-host canvas'),now=performance.now();return {
        elapsedMs:now-t.start,samples:t.frames.length,renderedFrames:(Number(document.querySelector('#render-diagnostics')?.dataset.frames)||0)-t.initialRenderedFrames,
        stableBufferFrames:t.bufferFrames,stableBufferMs:now-t.bufferStart,buffer:t.bufferKey,position:c?.dataset.walkPosition?.split(',').map(Number)};});
      await shuttle.step(progress.position);
      metMinimum=progress.elapsedMs>=minimumMs&&progress.samples>=minimumSamples&&progress.renderedFrames>=minimumSamples&&
        (!requireStableBuffer||(progress.stableBufferFrames>=12&&progress.stableBufferMs>=1500));
      if(metMinimum||progress.elapsedMs>=maximumMs)break;
      if(Date.now()>=checkpointAt){await onCheckpoint?.(await snapshotTrace(page));checkpointAt=Date.now()+5000;}
    }
  }finally{
    // Preserve raw evidence even when driving/polling fails. The surrounding
    // run is saved before any frame-count, pose, settling or screenshot gate.
    const partial=await snapshotTrace(page);if(partial)await onCheckpoint?.(partial);
  }
  const trace=await snapshotTrace(page,{stop:true});
  return {...trace,completion:{metMinimum,reason:metMinimum?'minimums-met':'time-cap',minimumMs,maximumMs,minimumSamples,requireStableBuffer,...progress}};
}
function traceSummary(trace,shuttle){
  const summary=frameTimeSummary(trace.frames.map(f=>f.ms)),uniquePoses=new Set(trace.frames.map(f=>f.position).filter(Boolean)),buffers=new Map();
  const renderedFrames=Math.max(0,(trace.finalRenderedFrames??trace.frames.at(-1)?.renderedFrames??trace.initialRenderedFrames)-trace.initialRenderedFrames);
  const sampleAdequate=summary.samples>=minimumSamples&&renderedFrames>=minimumSamples&&trace.completion?.metMinimum===true;
  // Keep every raw interval and stall, but do not turn a handful of completed
  // intervals into a percentile/1%-low performance claim.
  if(!sampleAdequate)for(const key of ['p50','p95','p99','onePercentLowFps'])summary[key]=null;
  const offsets=trace.frames.map(frame=>shuttle.offset(frame.position?.split(',').map(Number))).filter(Number.isFinite);
  for(const frame of trace.frames){const key=frame.bufferWidth+'×'+frame.bufferHeight;if(!buffers.has(key))buffers.set(key,{width:frame.bufferWidth,height:frame.bufferHeight,pixels:frame.bufferWidth*frame.bufferHeight,frames:0});buffers.get(key).frames++;}
  return {summary,sampleAdequate,motionBuffers:[...buffers.values()].sort((a,b)=>b.frames-a.frames),uniquePoses:uniquePoses.size,
    rendererThroughput:{frames:renderedFrames,elapsedMs:trace.elapsedMs,framesPerSecond:trace.elapsedMs>0?renderedFrames*1000/trace.elapsedMs:0,source:'public-rendered-frame-counter'},
    actualAverageFps:sampleAdequate&&summary.mean?1000/summary.mean:null,routeOffsetsM:offsets.length?{minimum:Math.min(...offsets),maximum:Math.max(...offsets)}:null,
    longTasks:{count:trace.longTasks.length,totalMs:trace.longTasks.reduce((s,e)=>s+e.duration,0),maxMs:Math.max(0,...trace.longTasks.map(e=>e.duration))}};
}
async function capture(page,caseId,route){
  const before=await info(page);assert.equal(before.pose.fov,70);assert.equal(await page.locator('#showDimensions').isChecked(),true);
  await page.locator('#scene-host canvas').focus();
  const run={case:caseId,route,status:'running',before},shuttle=continuousShuttle(page,before.pose);report.runs.push(run);await save();
  try{
    await shuttle.step(before.pose.position);
    run.warmup=await traceNavigation(page,shuttle,{minimumMs:4000,maximumMs:warmupLimitMs,requireStableBuffer:true,onCheckpoint:async trace=>{run.warmup=trace;await save();}});
    await save();
    run.trace=await traceNavigation(page,shuttle,{minimumMs:duration,maximumMs:captureLimitMs,onCheckpoint:async trace=>{run.trace=trace;Object.assign(run,traceSummary(trace,shuttle));await save();}});
    Object.assign(run,traceSummary(run.trace,shuttle));await save();
    run.duringMotion=await info(page);
  }catch(error){run.status='failed';run.failure=error.message;throw error;}
  finally{await snapshotTrace(page,{stop:true});await shuttle.stop();await save();}
  try{
    const control=caseId==='baseline-1.39';
    const activePoses=new Set([...run.warmup.frames,...run.trace.frames].map(frame=>frame.position).filter(Boolean));
    run.navigationVerified=(control?activePoses.size:run.uniquePoses)>=3&&run.rendererThroughput.frames>0;
    assert.ok(run.navigationVerified,`${caseId}/${route}: real rendered navigation could not be verified`);
    if(!run.sampleAdequate){
      run.sampleLimitation=`${captureLimitMs} ms cap reached before ${minimumSamples} RAF and rendered frames (${run.summary.samples} RAF / ${run.rendererThroughput.frames} rendered)`;
      if(control)run.status='sample-limited-control';
      else{run.status='failed';run.failure=run.sampleLimitation;report.failures.push({case:caseId,route,stage:'sample-adequacy',message:run.failure});}
    }else run.status='passed';
    await settled(page,route==='living'?'ground':'garden');run.after=await info(page);await save();
    const name=caseId+'-'+route+'.png';await page.locator('#scene-host').screenshot({path:path.join(output,name),scale:'css',animations:'disabled'});run.screenshot=name;
  }catch(error){run.status='failed';run.failure=error.message;throw error;}
  finally{await save();}
  console.log('WALK_PERFORMANCE '+JSON.stringify({case:caseId,route,status:run.status,sampleAdequate:run.sampleAdequate,...run.summary,rendererThroughput:run.rendererThroughput,motionBuffers:run.motionBuffers,routeOffsetsM:run.routeOffsetsM,warmup:run.warmup.completion,capture:run.trace.completion,idleBuffer:run.after.viewport,adaptive:run.after.adaptiveQuality}));
}
function compareRuns(route,baseline,candidate,current){
  const complete=[baseline,candidate,current].every(run=>run?.summary&&run.before?.pose&&run.rendererThroughput);
  if(!complete)return {route,status:'incomplete',regression:{enforced:report.capturePolicy.regressionEnforced,legacyPass:false,currentPass:false},reason:'One or more routes failed before usable navigation evidence was captured.'};
  const adequateControl=baseline.sampleAdequate&&baseline.navigationVerified;
  const limitedControl=baseline.status==='sample-limited-control'&&baseline.navigationVerified&&
    baseline.trace.completion.reason==='time-cap'&&baseline.rendererThroughput.frames<minimumSamples;
  const candidates=[candidate,current],adequateCandidates=candidates.map(run=>run.sampleAdequate&&run.navigationVerified);
  const comparableTails=adequateControl&&adequateCandidates.every(Boolean);
  const p95LimitMs=adequateControl?baseline.summary.p95*1.15+5:null;
  // When the old control cannot deliver even 32 renderer frames in a minute,
  // its four-or-five intervals cannot define a useful p95 gate. Require each
  // adequately sampled candidate to beat the higher rate the control would
  // have needed to qualify, rather than comparing against its sparse p95.
  // This establishes observed direction only, not a statistical speedup bound.
  const throughputFloorFps=limitedControl?minimumSamples*1000/baseline.rendererThroughput.elapsedMs:null;
  const passes=candidates.map((run,i)=>Boolean(adequateCandidates[i]&&(adequateControl?run.summary.p95<=p95LimitMs:
    limitedControl?run.rendererThroughput.framesPerSecond>throughputFloorFps:false)));
  return {route,status:adequateControl?'sample-adequate-comparison':limitedControl?'sample-limited-control-directional-comparison':'unusable-control',
    baseline:baseline.summary,candidateLegacy:candidate.summary,candidateCurrent:current.summary,
    sampleAdequacy:{baseline:baseline.sampleAdequate,candidateLegacy:candidate.sampleAdequate,candidateCurrent:current.sampleAdequate},
    meanFrameTimeReductionPercent:comparableTails?100*(1-candidate.summary.mean/baseline.summary.mean):null,
    p95ReductionPercent:comparableTails?100*(1-candidate.summary.p95/baseline.summary.p95):null,
    onePercentLowFpsChangePercent:comparableTails?100*(candidate.summary.onePercentLowFps/baseline.summary.onePercentLowFps-1):null,
    initialPoseDeltaM:Math.hypot(...candidate.before.pose.position.map((v,i)=>v-baseline.before.pose.position[i])),
    initialYawDelta:Math.abs(candidate.before.pose.yaw-baseline.before.pose.yaw),
    baselineMotionBuffers:baseline.motionBuffers,candidateMotionBuffers:candidate.motionBuffers,currentMotionBuffers:current.motionBuffers,
    routeOffsetsM:{baseline:baseline.routeOffsetsM,candidateLegacy:candidate.routeOffsetsM,candidateCurrent:current.routeOffsetsM},
    observedRendererThroughput:{baseline:baseline.rendererThroughput,candidateLegacy:candidate.rendererThroughput,candidateCurrent:current.rendererThroughput},
    regression:{enforced:report.capturePolicy.regressionEnforced,method:adequateControl?'paired-p95':limitedControl?'control-qualification-throughput':'unavailable',
      p95LimitMs,throughputFloorFps,legacyPass:passes[0],currentPass:passes[1],
      interpretation:limitedControl?'Adequate candidates exceed the renderer rate needed for the time-capped control to qualify; directional evidence only.':null}};
}
try{
  const baseline=await serve(baselineRoot),candidate=await serve(root);
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-dev-shm-usage']});
  report.host.chromium=browser.version();
  for(const scenario of [{id:'baseline-1.39',url:baseline,layout:'legacy',equipment:false},{id:'candidate-legacy',url:candidate,layout:'legacy',equipment:false},{id:'candidate-current',url:candidate,layout:'right-media',equipment:true}]){
    const context=await browser.newContext({viewport:{width:report.viewport.width,height:report.viewport.height},deviceScaleFactor:1,reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(120000);
    page.on('pageerror',error=>report.errors.push({case:scenario.id,message:error.message}));
    const params=new URLSearchParams(hash);params.set('livingCinemaLayout',scenario.layout);params.set('showEquipmentLabels',String(scenario.equipment));
    let ready=false;
    try{
      for(const route of ['living','garden']){
        try{
          if(!ready){
            await page.goto(scenario.url+'/?site=sternicza-11#'+params,{waitUntil:'domcontentloaded'});await page.locator('#loading').waitFor({state:'hidden'});await settled(page);ready=true;
            if(!report.host.webgl)report.host.webgl=await page.locator('#scene-host canvas').evaluate(canvas=>{const gl=canvas.getContext('webgl2')||canvas.getContext('webgl'),ext=gl?.getExtension('WEBGL_debug_renderer_info');return {renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl?.getParameter(gl.RENDERER),vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):gl?.getParameter(gl.VENDOR)};});
          }
          if(route==='living')await enterLiving(page);
          else{await page.locator('#walk-location').selectOption('garden');await page.locator('#walk-start').click();await settled(page,'garden');}
          if(await page.locator('#viewer-fullscreen').getAttribute('aria-pressed')!=='true')await page.locator('#viewer-fullscreen').click();await settled(page,route==='living'?'ground':'garden');
          await capture(page,scenario.id,route);
        }catch(error){
          let run=report.runs.find(run=>run.case===scenario.id&&run.route===route);
          if(!run){run={case:scenario.id,route};report.runs.push(run);}run.status='failed';run.failure=error.message;
          report.failures.push({case:scenario.id,route,stage:run.trace?'capture-or-review':'setup',message:error.message});
          await save();console.error('WALK_ROUTE_FAILED '+JSON.stringify({case:scenario.id,route,message:error.message}));
          // A failed route must not prevent independent evidence from being
          // collected. Reload before the next route if navigation/setup broke.
          ready=false;
        }
      }
    }finally{await context.close();}
  }
  for(const route of ['living','garden']){
    const baseline=report.runs.find(r=>r.case==='baseline-1.39'&&r.route===route),candidate=report.runs.find(r=>r.case==='candidate-legacy'&&r.route===route),current=report.runs.find(r=>r.case==='candidate-current'&&r.route===route);
    const comparison=compareRuns(route,baseline,candidate,current);
    report.comparisons.push(comparison);await save();
    if(!(comparison.initialPoseDeltaM<.03&&comparison.initialYawDelta<.1))report.failures.push({case:'comparison',route,stage:'fixture',message:'Legacy baseline/candidate camera fixtures are missing or do not match.'});
    if(comparison.regression.enforced&&!(comparison.regression.legacyPass&&comparison.regression.currentPass))report.failures.push({case:'comparison',route,stage:'regression',message:`Candidate legacy/current failed ${comparison.regression.method||'unavailable'} acceptance; inspect sample adequacy and observed rates.`});
  }
  report.controlStatus=report.runs.filter(run=>run.case==='baseline-1.39').every(run=>run.status==='passed')?'sample-adequate':
    report.runs.some(run=>run.case==='baseline-1.39'&&run.status==='failed')?'failed':'sample-limited';
  await save();
  assert.deepEqual(report.errors,[]);assert.equal(report.failures.length,0,`${report.failures.length} walking acceptance failures; all scenario/routes were attempted and retained in browser-report.json`);report.status='passed';
}catch(error){report.status='failed';report.failure={message:error.message,stack:error.stack};process.exitCode=1;console.error(error);}
finally{await save();await browser?.close();await Promise.all(servers.map(server=>new Promise(resolve=>server.close(resolve))));}
