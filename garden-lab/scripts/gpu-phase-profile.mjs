// Candidate-only diagnostics, separate from every walking acceptance gate.
// BASELINE_DIR supplies the unchanged 1.39 Share fixture, never a second render.
// The opt-in app profiler records actual main motion scene/output submissions.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {waitSceneCaptureReady} from './scene-gpu-capture.mjs';

assert.notEqual(process.env.SITES_MANAGED_LINUX_CONTAINER,'1','Run real WebGL GPU profiles in GitHub Actions, not the managed workspace.');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'test-results','gpu-phase-profile');await mkdir(output,{recursive:true});
const setupLimitMs=120000,acquisitionLimitMs=120000,idleLimitMs=120000,pollIntervalMs=150;
const minimumCompletedSamples=4,minimumRenderedPoses=3,minimumScale=.54,shuttleHalfWidthM=.35;
const report={status:'running',case:'candidate-current',route:'living',
  method:'Opt-in GPU phase observations on actual main motion renders. The same 1.39 Share fixture, current living-room entry, fullscreen, and public-key lateral shuttle as the paired walking benchmark. Public DOM diagnostics only; no private app hooks.',
  acceptance:'Diagnostic acquisition only. This job does not replace, relax, or assert passing any walking performance gate, and makes no speedup claim.',
  limitations:[
    'SwiftShader on a shared CI host does not represent the user GPU.',
    'GPU timer-query durations are used only when the public profiler reports valid non-disjoint results.',
    'Fallback fence availability bounds include queueing, browser status caching and polling. Overlapping bounds can leave a phase inconclusive; they are not isolated GPU durations.',
    'Profiling adds queries or fences and polling. Its samples must not be substituted for the unchanged walking benchmark.',
    'The public draw counter counts actual CPU submissions, not RAF callbacks or displayed frames. Phase completion supplies separate GPU evidence.',
    'The shuttle follows public input positions and can overshoot its requested bounds while input is dispatched.',
  ],
  viewport:{width:1280,height:800,deviceScaleFactor:1},
  policy:{setupLimitMs,acquisitionLimitMs,idleLimitMs,pollIntervalMs,minimumCompletedSamples,minimumRenderedPoses,minimumScale,shuttleHalfWidthM},
  host:{platform:os.platform(),release:os.release(),arch:os.arch(),cpuModel:os.cpus()[0]?.model,logicalCpus:os.cpus().length,totalMemoryGB:os.totalmem()/1024**3,node:process.version},
  observations:[],drawObservations:[],inputEvents:[],phaseSamples:[],errors:[],failures:[]};
let server,browser,context,page,shuttle,stage='setup';
const phaseSamples=new Map();
const save=()=>writeFile(path.join(output,'browser-report.json'),JSON.stringify(report,null,2));
function remaining(deadline){const value=deadline-Date.now();assert.ok(value>0,'GPU phase profile exceeded its '+stage+' deadline');return value;}
async function serve(){
  const publicDir=path.join(root,'public'),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
  await readFile(path.join(publicDir,'index.html'));
  server=createServer(async(req,res)=>{try{
    const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(publicDir,'.'+(name.endsWith('/')?name+'index.html':name));
    if(!file.startsWith(publicDir+path.sep))throw new Error('Invalid path');
    const content=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(content);
  }catch{res.writeHead(404);res.end();}});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return 'http://127.0.0.1:'+server.address().port;
}
async function settled(deadline,floor){
  await page.locator('#scene-host').scrollIntoViewIfNeeded({timeout:remaining(deadline)});
  await page.waitForFunction(floor=>{
    const d=document.querySelector('#render-diagnostics')?.dataset,c=document.querySelector('#scene-host canvas');
    return d?.renderer==='webgl'&&d.renderedStyle==='scandinavian'&&d.drawEnabled==='true'&&d.interacting==='false'&&
      c?.dataset.renderPending==='false'&&Number(c.dataset.renderedFrameCount)>0&&Number(d.triangles)>0&&
      (!floor||c.dataset.walkFloor===floor)&&Number(d.surfaceAssetsRequested)>0&&
      d.surfaceAssetsLoaded===d.surfaceAssetsRequested&&Number(d.surfaceAssetsFailed)===0;
  },floor,{timeout:remaining(deadline)});
}
async function info(deadline){
  return page.locator('#render-diagnostics').evaluate(node=>{
    const data={...node.dataset},canvas=document.querySelector('#scene-host canvas'),live=canvas?.dataset||{};
    for(const key of ['gpuPhases','gpuSubmission','adaptiveQuality','performanceTiming','sceneOptimization','livingCinema','equipmentLabels']){
      try{data[key]=JSON.parse(data[key]||'null');}catch{data[key]={parseError:true,raw:data[key]};}
    }
    const position=value=>value?.split(',').map(Number);
    data.observedAtMs=performance.now();data.frames=Number(live.renderedFrameCount);data.frameSource='live-canvas-draw-counter';
    data.renderPending=live.renderPending;data.renderPath=live.renderPath??data.renderPath;
    for(const key of ['sceneBufferWidth','sceneBufferHeight','scenePixelRatio','motionSamples','canvasSamples'])data[key]=Number(live[key]??data[key]);
    data.canvasWidth=canvas?.width;data.canvasHeight=canvas?.height;
    data.viewport={width:canvas?.clientWidth,height:canvas?.clientHeight};
    data.pose={floor:live.walkFloor,position:position(live.walkPosition),yaw:Number(live.walkYaw),pitch:Number(live.walkPitch),fov:Number(live.walkFov)};
    data.renderedPose=position(live.renderedWalkPosition);
    data.motionSupported=(live.motionSupported??data.motionSupported)==='true';
    data.visibility={state:document.visibilityState,focused:document.hasFocus(),fullscreen:document.body.dataset.modelFullscreen||null,
      fullscreenPending:Boolean(document.body.dataset.fullscreenPending),fullscreenResizePending:Boolean(document.body.dataset.fullscreenResizePending)};
    return data;
  },null,{timeout:remaining(deadline)});
}
function retain(snapshot,elapsedMs){
  for(const sample of snapshot.gpuPhases?.samples||[])phaseSamples.set(sample.id,sample);
  report.phaseSamples=[...phaseSamples.values()].sort((a,b)=>a.id-b.id);
  report.latest=snapshot;
  const observation={elapsedMs,observedAtMs:snapshot.observedAtMs,frames:snapshot.frames,renderedPose:snapshot.renderedPose,
    livePosition:snapshot.pose.position,renderPath:snapshot.renderPath,scenePixelRatio:snapshot.scenePixelRatio,
    sceneBufferWidth:snapshot.sceneBufferWidth,sceneBufferHeight:snapshot.sceneBufferHeight,
    canvasWidth:snapshot.canvasWidth,canvasHeight:snapshot.canvasHeight,motionSamples:snapshot.motionSamples,canvasSamples:snapshot.canvasSamples,
    adaptiveQuality:snapshot.adaptiveQuality,gpuSubmission:snapshot.gpuSubmission,
    gpuPhaseState:snapshot.gpuPhases?{requested:snapshot.gpuPhases.requested,enabled:snapshot.gpuPhases.enabled,method:snapshot.gpuPhases.method,
      status:snapshot.gpuPhases.status,startedSamples:snapshot.gpuPhases.startedSamples,completedSamples:snapshot.gpuPhases.completedSamples,
      discardedSamples:snapshot.gpuPhases.discardedSamples,skippedAttempts:snapshot.gpuPhases.skippedAttempts,pending:snapshot.gpuPhases.pending,errors:snapshot.gpuPhases.errors}:null};
  report.observations.push(observation);
  if(report.drawObservations.at(-1)?.frames!==snapshot.frames)report.drawObservations.push(observation);
}
function completedStableSamples(samples,before,latest){
  const seenFrames=new Set(),width=Math.floor(before.viewport.width*minimumScale),height=Math.floor(before.viewport.height*minimumScale);
  return samples.filter(sample=>{
    const m=sample.metadata||{},frame=m.expectedPublicFrame;
    if(sample.status!=='completed'||!sample.phases?.scene||!sample.phases?.output||m.renderPath!=='motion-target'||
      m.scenePixelRatio!==minimumScale||m.sceneBufferWidth!==width||m.sceneBufferHeight!==height||
      m.canvasWidth!==before.canvasWidth||m.canvasHeight!==before.canvasHeight||
      !Number.isInteger(frame)||frame<=before.frames||frame>latest.frames||seenFrames.has(frame))return false;
    seenFrames.add(frame);return true;
  });
}
function continuousShuttle(pose,started){
  const angle=Math.PI+pose.yaw*Math.PI/180,axis=[-Math.cos(angle),0,-Math.sin(angle)];let held=null;
  const offset=position=>position?.length===3?position.reduce((sum,value,i)=>sum+(value-pose.position[i])*axis[i],0):0;
  const input=async(type,key)=>{const event={type,key,requestedAtMs:Date.now()-started,completedAtMs:null};report.inputEvents.push(event);
    await page.keyboard[type](key);event.completedAtMs=Date.now()-started;};
  return {
    async step(position){
      const current=offset(position),next=!held?'a':held==='a'&&current>=shuttleHalfWidthM?'d':held==='d'&&current<=-shuttleHalfWidthM?'a':held;
      // Preserve continuous navigation across reversals, matching the benchmark.
      if(next!==held){await input('down',next);if(held)await input('up',held);held=next;}
    },
    async stop(){await input('up','a');await input('up','d');held=null;},offset,
  };
}
async function acquire(){
  stage='acquisition';const started=Date.now(),deadline=started+acquisitionLimitMs;
  const before=report.before=await info(deadline);
  assert.ok(before.gpuPhases?.requested,'Opt-in public gpuPhases diagnostics are missing');
  assert.equal(before.motionSupported,true,'This motion-target diagnostic requires supported float multisampling');
  assert.ok(Number.isInteger(before.frames)&&before.frames>0,'An actual public draw counter is required');
  shuttle=continuousShuttle(before.pose,started);
  let latest=before,qualified=[],uniquePoses=0,checkpoint=Date.now()+3000,reason='interrupted';
  retain(before,0);
  report.acquisition={status:'running',startedAtMs:before.observedAtMs,maximumMs:acquisitionLimitMs,initialDraws:before.frames};await save();
  try{
    await shuttle.step(before.pose.position);
    while(Date.now()<deadline){
      await page.waitForTimeout(Math.min(pollIntervalMs,remaining(deadline)));
      if(Date.now()>=deadline)break;
      latest=await info(deadline);retain(latest,Date.now()-started);
      await shuttle.step(latest.pose.position);
      qualified=completedStableSamples(report.phaseSamples,before,latest);
      uniquePoses=new Set(qualified.map(sample=>JSON.stringify(sample.metadata.cameraPosition))).size;
      if(qualified.length>=minimumCompletedSamples&&uniquePoses>=minimumRenderedPoses){reason='minimum-collected';break;}
      if(latest.gpuPhases?.status==='disabled'||latest.gpuPhases?.status==='complete'){reason='profiler-'+latest.gpuPhases.status;break;}
      if(Date.now()>=checkpoint){await save();checkpoint=Date.now()+3000;}
    }
  }finally{
    if(Date.now()>=deadline&&reason==='interrupted')reason='time-cap';
    report.duringMotion=latest;
    report.acquisition={...report.acquisition,elapsedMs:Date.now()-started,finalDraws:latest.frames,
      actualDrawSubmissions:Math.max(0,latest.frames-before.frames),stableCompletedSampleIds:qualified.map(sample=>sample.id),
      completedStableSamples:qualified.length,distinctProfiledCameraPositions:uniquePoses,
      status:qualified.length>=minimumCompletedSamples&&uniquePoses>=minimumRenderedPoses?'minimum-collected':'inconclusive',reason,
      phaseMethods:[...new Set(qualified.flatMap(sample=>Object.values(sample.phases).map(phase=>phase.source)))],
      phaseEvidence:Object.fromEntries(['scene','output'].map(name=>{
        const phases=qualified.map(sample=>sample.phases[name]);
        return [name,{timerIntervals:phases.filter(phase=>phase.source==='ext-timer-query').length,
          separatelyObservedFenceBounds:phases.filter(phase=>phase.source==='fence-availability'&&!phase.inconclusive).length,
          inconclusiveFenceBounds:phases.filter(phase=>phase.source==='fence-availability'&&phase.inconclusive).length}];
      })),
      allFenceMarksObservedTogetherSamples:qualified.filter(sample=>sample.inconclusive===true).length,
      phaseEvidenceInterpretation:'Only timerIntervals are device elapsed durations. Separately observed fence bounds still include browser observation and polling; inconclusive fences cannot separate the phase costs.',
      routeOffsetsM:{minimum:Math.min(...report.observations.map(item=>shuttle.offset(item.livePosition))),
        maximum:Math.max(...report.observations.map(item=>shuttle.offset(item.livePosition)))}};
    await save();
  }
  assert.ok(qualified.length>=minimumCompletedSamples&&uniquePoses>=minimumRenderedPoses,
    `Inconclusive GPU profile: ${qualified.length} completed stable minimum-scale phase samples and ${uniquePoses} distinct profiled positions within ${acquisitionLimitMs} ms`);
}
try{
  assert.ok(process.env.BASELINE_DIR,'BASELINE_DIR must name the unchanged 66c096a garden-lab checkout for the shared fixture.');
  const baselineState=await import(pathToFileURL(path.join(path.resolve(process.env.BASELINE_DIR),'src/state.js')).href);
  report.version=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version;
  report.fixture=baselineState.sanitizeState({...baselineState.DEFAULTS,designStyle:'scandinavian',styleHouseFinish:true,sceneMotion:false,renderQuality:'auto',
    showDimensions:true,showRays:false,showLabels:false,existingVegetation:true,sunEnabled:true,sunDate:'2026-06-21',sunMinutes:780,
    mode:'orbit',interiorEnabled:false,walkNavigation:'free'});
  const params=new URLSearchParams(baselineState.encodeState(report.fixture));params.set('livingCinemaLayout','right-media');params.set('showEquipmentLabels','true');
  report.fixtureSource={commit:'66c096a94b6ada93e015a98bce07b4b3a643f933',candidateOverrides:{livingCinemaLayout:'right-media',showEquipmentLabels:true}};
  const base=await serve();browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-dev-shm-usage']});
  report.host.chromium=browser.version();
  context=await browser.newContext({viewport:{width:report.viewport.width,height:report.viewport.height},deviceScaleFactor:1,reducedMotion:'reduce'});
  page=await context.newPage();page.setDefaultTimeout(setupLimitMs);page.on('pageerror',error=>report.errors.push(error.message));
  const started=Date.now(),deadline=started+setupLimitMs;report.setup={status:'running',maximumMs:setupLimitMs};await save();
  await page.goto(base+'/?site=sternicza-11&gpuPhaseProfile=1#'+params,{waitUntil:'domcontentloaded',timeout:remaining(deadline)});
  await page.locator('#loading').waitFor({state:'hidden',timeout:remaining(deadline)});await settled(deadline);
  await page.locator('#interior-open').click({timeout:remaining(deadline)});const host=page.locator('#interior-host');
  await host.waitFor({state:'visible',timeout:remaining(deadline)});
  await host.locator('[data-view="plan"]').click({timeout:remaining(deadline)});
  await host.locator('[data-iw="floor"]').selectOption('ground',{timeout:remaining(deadline)});
  await host.locator('[data-iw="room"]').selectOption('lounge',{timeout:remaining(deadline)});
  await host.locator('[data-view="room"]').click({timeout:remaining(deadline)});await settled(deadline,'ground');
  if(await page.locator('#viewer-fullscreen').getAttribute('aria-pressed')!=='true')await page.locator('#viewer-fullscreen').click({timeout:remaining(deadline)});
  await settled(deadline,'ground');await page.locator('#scene-host canvas').focus({timeout:remaining(deadline)});
  const initStarted=Date.now();report.initialization={status:'waiting',maximumMs:remaining(deadline)};await save();
  report.initialization.readiness=await waitSceneCaptureReady(page,deadline);report.initialization.status='passed';report.initialization.elapsedMs=Date.now()-initStarted;
  report.host.webgl=await page.locator('#scene-host canvas').evaluate(canvas=>{
    const gl=canvas.getContext('webgl2'),ext=gl?.getExtension('WEBGL_debug_renderer_info');
    return {renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl?.getParameter(gl.RENDERER),
      vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):gl?.getParameter(gl.VENDOR),version:gl?.getParameter(gl.VERSION),
      shadingLanguageVersion:gl?.getParameter(gl.SHADING_LANGUAGE_VERSION),canvasSamples:gl?.getParameter(gl.SAMPLES),
      timerQueryExtensionAvailable:Boolean(gl?.getExtension('EXT_disjoint_timer_query_webgl2')),sampleCountContext:'candidate-idle-default-framebuffer'};
  },null,{timeout:remaining(deadline)});
  const fixtureInfo=await info(deadline);assert.equal(fixtureInfo.pose.fov,70);assert.equal(fixtureInfo.pose.floor,'ground');
  assert.equal(await page.locator('#showDimensions').isChecked(),true);assert.equal(await page.locator('#viewer-fullscreen').getAttribute('aria-pressed'),'true');
  report.setup={...report.setup,status:'passed',elapsedMs:Date.now()-started};await save();
  await acquire();report.status='passed';
}catch(error){
  report.status=stage==='acquisition'?'inconclusive':'failed';report.failures.push({stage,message:error.message,stack:error.stack});process.exitCode=1;
  if(report.setup?.status==='running')report.setup.status='failed';if(report.initialization?.status==='waiting')report.initialization.status='failed';
  console.error('GPU_PHASE_PROFILE_FAILED '+JSON.stringify({stage,message:error.message}));
}finally{
  if(page&&shuttle){
    stage='idle-restoration';const started=Date.now(),deadline=started+idleLimitMs;report.restoration={status:'running',maximumMs:idleLimitMs};
    try{
      await shuttle.stop();await settled(deadline,'ground');
      report.restoration.readiness=await waitSceneCaptureReady(page,deadline);report.after=await info(deadline);retain(report.after,null);
      const before=report.before,after=report.after;
      assert.equal(after.renderPath,before.renderPath,'Idle rendering path was not restored');
      assert.deepEqual([after.canvasWidth,after.canvasHeight],[before.canvasWidth,before.canvasHeight],'The display canvas changed size');
      assert.deepEqual([after.sceneBufferWidth,after.sceneBufferHeight,after.scenePixelRatio],
        [before.sceneBufferWidth,before.sceneBufferHeight,before.scenePixelRatio],'Idle scene resolution was not restored');
      assert.equal(after.sceneOptimization?.vegetation?.compacted,false,'Idle vegetation retained motion compaction');
      report.restoration.status='passed';
    }catch(error){report.restoration.status='failed';report.restoration.error=error.message;report.status='failed';report.failures.push({stage,message:error.message});process.exitCode=1;}
    finally{report.restoration.elapsedMs=Date.now()-started;}
  }
  if(report.errors.length){report.status='failed';process.exitCode=1;}
  await save();
  console.log('GPU_PHASE_PROFILE '+JSON.stringify({status:report.status,acquisition:report.acquisition,restoration:report.restoration,
    method:report.latest?.gpuPhases?.method,timerQuerySupported:report.latest?.gpuPhases?.timerQuerySupported,
    timerQueryExtensionAvailable:report.host.webgl?.timerQueryExtensionAvailable,errors:report.errors,failures:report.failures.map(({stage,message})=>({stage,message}))}));
  await context?.close();await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));
}
