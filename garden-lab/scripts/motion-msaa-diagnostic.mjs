// Opt-in same-host motion MSAA diagnostic. Normal app defaults and all
// walking/fidelity acceptance gates remain unchanged.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {captureSceneScreenshot,waitSceneCaptureReady} from './scene-gpu-capture.mjs';
import {motionDiagnosticUrl,expectedDiagnosticSampling,diagnosticSamplingMatches} from './motion-diagnostic-controls.mjs';

assert.notEqual(process.env.SITES_MANAGED_LINUX_CONTAINER,'1','Run real WebGL diagnostics in GitHub Actions, not the managed workspace.');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'test-results','motion-msaa-diagnostic');await mkdir(output,{recursive:true});
const setupLimitMs=120000,motionLimitMs=120000,measurementLimitMs=120000,idleLimitMs=120000,pairAnalysisLimitMs=30000;
const pollIntervalMs=150,minimumScale=.54,minimumCompletedSamples=4,pixelThreshold=15,materialImprovementFraction=.20,variableRangeFraction=.20;
const report={status:'running',testedMergeCommit:process.env.GITHUB_SHA||null,route:'living',
  method:'Fresh same-host contexts compare the explicitly pinned motionMsaa=keep four-sample target with motionMsaa=single. Both use gpuPhaseProfile=1, the same public current living Share fixture, zero-displacement held-pointer input, minimum .54 scale, fixed canvas and identical camera/geometry/color/light state.',
  acceptance:'Diagnostic acquisition and restoration only. Motion pixel differences are a reported quality tradeoff, never an equivalence or FPS acceptance gate. Existing walking and visual acceptance criteria are unchanged.',
  limitations:['WebGL target samples=0 means no MSAA and one storage sample, not zero color/depth samples.',
    'Raw timer-query values are retained separately because previous device-reported intervals have disagreed with independent completion evidence.',
    'The repeat decision uses observable completion availability for isolated actual frames after a signaled preceding-work fence. It includes CPU submission, browser status caching and polling; it is not isolated GPU time or a walking frame rate.',
    'The initial control→single pair may be repeated once in reverse order for a material apparent improvement or ambiguous variation. This is bounded diagnostic evidence, not a statistical performance claim.',
    'Shared CI SwiftShader results do not represent the user GPU.'],
  viewport:{width:1280,height:800,deviceScaleFactor:1},
  policy:{setupLimitMs,motionLimitMs,measurementLimitMs,idleLimitMs,pairAnalysisLimitMs,pollIntervalMs,minimumScale,minimumCompletedSamples,
    materialImprovementFraction,variableRangeFraction,maximumPairs:2,maximumCases:4,
    maximumStageBudgetMs:4*(setupLimitMs+motionLimitMs+measurementLimitMs+idleLimitMs)+2*pairAnalysisLimitMs,
    target:{width:691,height:315,controlMsaa:4,controlStorage:4,singleMsaa:0,singleStorage:1}},
  host:{platform:os.platform(),release:os.release(),arch:os.arch(),cpuModel:os.cpus()[0]?.model,
    logicalCpus:os.cpus().length,totalMemoryGB:os.totalmem()/1024**3,node:process.version},
  cases:[],pairs:[],failures:[]};
let browser,server,fixtureHash,referenceMotion=null;
const captures=new Map();
const save=()=>writeFile(path.join(output,'browser-report.json'),JSON.stringify(report,null,2));
function remaining(deadline){const ms=deadline-Date.now();assert.ok(ms>0,'Motion MSAA diagnostic exceeded its stage deadline');return ms;}
function failed(record,stage,error){
  record.status='failed';record.failures.push({stage,message:error.message,stack:error.stack});
  report.failures.push({case:record.id,stage,message:error.message});
  console.error('MOTION_MSAA_FAILED '+JSON.stringify({case:record.id,stage,message:error.message}));
}
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
async function settled(page,deadline,floor){
  await page.locator('#scene-host').scrollIntoViewIfNeeded({timeout:remaining(deadline)});
  await page.waitForFunction(floor=>{
    const d=document.querySelector('#render-diagnostics')?.dataset,c=document.querySelector('#scene-host canvas');
    return d?.renderer==='webgl'&&d.renderedStyle==='scandinavian'&&d.drawEnabled==='true'&&d.interacting==='false'&&
      c?.dataset.renderPending==='false'&&Number(c.dataset.renderedFrameCount)>0&&Number(d.triangles)>0&&
      (!floor||c.dataset.walkFloor===floor)&&Number(d.surfaceAssetsRequested)>0&&
      d.surfaceAssetsLoaded===d.surfaceAssetsRequested&&Number(d.surfaceAssetsFailed)===0;
  },floor,{timeout:remaining(deadline)});
}
async function info(page,deadline){
  return page.locator('#scene-host canvas').evaluate(canvas=>{
    const d=document.querySelector('#render-diagnostics').dataset,c=canvas.dataset,viewport=document.querySelector('#viewport');
    const number=value=>value==null||value===''||!Number.isFinite(Number(value))?null:Number(value);
    const position=value=>value?value.split(',').map(Number):null;
    const json=key=>{try{return JSON.parse(d[key]||'null');}catch{return {parseError:true,raw:d[key]};}};
    const bounds=canvas.getBoundingClientRect();
    return {observedAtMs:performance.now(),frames:number(c.renderedFrameCount),summaryFrames:number(d.frames),
      renderer:d.renderer,renderedStyle:d.renderedStyle,interacting:d.interacting==='true',renderPending:c.renderPending,
      toneMapping:d.toneMapping,calls:number(d.calls),triangles:number(d.triangles),
      motionActive:d.motionActive==='true',motionSupported:(c.motionSupported??d.motionSupported)==='true',
      canvas:{width:canvas.width,height:canvas.height,cssWidth:bounds.width,cssHeight:bounds.height},
      scene:{width:number(c.sceneBufferWidth),height:number(c.sceneBufferHeight),pixelRatio:number(c.scenePixelRatio),
        path:c.renderPath,motionSamples:number(c.motionSamples),motionStorageSamples:number(c.motionStorageSamples),
        motionMsaaDiagnostic:c.motionMsaaDiagnostic||null,canvasSamples:number(c.canvasSamples)},
      pose:{mode:viewport.dataset.mode,floor:c.walkFloor,position:position(c.walkPosition),renderedPosition:position(c.renderedWalkPosition),
        yaw:number(c.walkYaw),pitch:number(c.walkPitch),fov:number(c.walkFov),altitude:number(c.walkAltitude),
        navigation:c.walkNavigation,floating:c.walkFloating,swimming:c.walkSwimming},
      lights:Object.fromEntries(['nightActivation','nightGarden','nightPendants','nightHedge','nightWindows'].map(key=>[key,viewport.dataset[key]??null])),
      sunTime:document.querySelector('#sun-time')?.value,shareHash:location.hash,
      sceneOptimization:json('sceneOptimization'),gpuSubmission:json('gpuSubmission'),gpuPhases:json('gpuPhases'),adaptiveQuality:json('adaptiveQuality'),
      livingCinema:json('livingCinema'),equipmentLabels:json('equipmentLabels'),
      fullscreen:document.body.dataset.modelFullscreen||null,focused:document.hasFocus(),visibility:document.visibilityState};
  },null,{timeout:remaining(deadline)});
}
function assertSceneUnchanged(snapshot,before){
  assert.deepEqual(snapshot.pose,before.pose,'Zero-displacement input changed the public live/rendered camera');
  assert.deepEqual(snapshot.canvas,before.canvas,'The fixed display canvas changed size');
  assert.deepEqual(snapshot.lights,before.lights,'The comparison changed the scene lighting');
  assert.equal(snapshot.sunTime,before.sunTime);assert.equal(snapshot.shareHash,before.shareHash);
  assert.equal(snapshot.renderedStyle,before.renderedStyle);assert.equal(snapshot.toneMapping,before.toneMapping);assert.equal(snapshot.motionActive,false);
  assert.equal(snapshot.fullscreen,before.fullscreen);assert.equal(snapshot.visibility,'visible');
}
async function pixelDifference(page,a,b,deadline){
  remaining(deadline);
  const result=await page.evaluate(async({images,threshold,timeout})=>{
    const decode=async source=>{
      const image=new Image();image.src='data:image/png;base64,'+source;
      let timer;
      try{await Promise.race([image.decode(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('PNG decode exceeded its stage deadline')),timeout);})]);}
      finally{clearTimeout(timer);}
      const canvas=new OffscreenCanvas(image.width,image.height),context=canvas.getContext('2d');context.drawImage(image,0,0);
      return {width:image.width,height:image.height,data:context.getImageData(0,0,image.width,image.height).data};
    };
    const [a,b]=await Promise.all(images.map(decode));
    if(a.width!==b.width||a.height!==b.height)throw new Error('Comparison PNG dimensions differ; resizing or cropping is forbidden');
    let exactChangedPixels=0,changedPixels=0,changedChannels=0,maximumChannelDifference=0,totalAbsoluteChannelDifference=0;
    let minX=a.width,minY=a.height,maxX=-1,maxY=-1;
    for(let i=0;i<a.data.length;i+=4){
      let max=0;for(let channel=0;channel<4;channel++){
        const difference=Math.abs(a.data[i+channel]-b.data[i+channel]);
        if(difference)changedChannels++;max=Math.max(max,difference);totalAbsoluteChannelDifference+=difference;
      }
      maximumChannelDifference=Math.max(maximumChannelDifference,max);
      if(max){exactChangedPixels++;const pixel=i/4,x=pixel%a.width,y=Math.floor(pixel/a.width);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
      if(max>threshold)changedPixels++;
    }
    const pixels=a.width*a.height;
    return {width:a.width,height:a.height,pixels,threshold,exactChangedPixels,exactChangedFraction:exactChangedPixels/pixels,
      changedPixels,fraction:changedPixels/pixels,changedChannels,maximumChannelDifference,
      meanAbsoluteChannelDifference:totalAbsoluteChannelDifference/(pixels*4),
      exactDifferenceBounds:exactChangedPixels?[minX,minY,maxX,maxY]:null,exactRGBA:exactChangedPixels===0};
  },{images:[a.toString('base64'),b.toString('base64')],threshold:pixelThreshold,timeout:remaining(deadline)});
  remaining(deadline);return result;
}
async function imageCapture(page,record,name,deadline){
  const filename=name+'.png',before=await info(page,deadline);
  const buffer=await captureSceneScreenshot(page,'#scene-host canvas',{
    path:path.join(output,filename),type:'png',animations:'disabled',scale:'css',
  },{label:name,deadline,captures:record.sceneCaptures});
  const evidence=record.sceneCaptures.at(-1),after=await info(page,deadline);
  assert.equal(evidence.readiness.fence,'signaled','A motion comparison requires a completed public WebGL2 fence');
  assert.equal(after.frames,evidence.readiness.frame,'The actual draw changed after its PNG capture');
  assert.equal(after.renderPending,'false');assert.deepEqual(after.pose,before.pose);
  const dimensions={width:buffer.readUInt32BE(16),height:buffer.readUInt32BE(20)};
  assert.deepEqual(dimensions,{width:after.canvas.cssWidth,height:after.canvas.cssHeight},'PNG dimensions must exactly match the fixed CSS canvas');
  record.images[name]={filename,sha256:createHash('sha256').update(buffer).digest('hex'),dimensions,snapshot:after};
  captures.set(name,buffer);await save();return {buffer,snapshot:after};
}

function expectedMode(mode){
  assert.ok(mode==='control'||mode==='single','Unknown MSAA diagnostic case');
  return expectedDiagnosticSampling(mode==='control'?'keep':'single');
}
function isMinimumTarget(snapshot,mode){
  const expected=expectedMode(mode),v=snapshot.sceneOptimization?.vegetation;
  return Number.isInteger(snapshot.frames)&&snapshot.frames>0&&snapshot.summaryFrames===snapshot.frames&&
    snapshot.motionSupported&&snapshot.interacting&&snapshot.scene.path==='motion-target'&&
    snapshot.scene.pixelRatio===minimumScale&&snapshot.scene.width===691&&snapshot.scene.height===315&&
    diagnosticSamplingMatches(snapshot.scene,expected.label)&&v?.compacted===true&&v.shadowUploadGuard===null;
}
function assertMotion(snapshot,before,mode){
  assertSceneUnchanged(snapshot,before);assert.ok(isMinimumTarget(snapshot,mode),'A completed compacted minimum-scale frame with the requested MSAA/storage count is required');
  assert.equal(snapshot.renderPending,'false');
  const v=snapshot.sceneOptimization.vegetation;
  assert.ok(v.opaqueCoverageMaterials>0);assert.equal(v.opaqueCoverageRestored,true);
}
function retain(record,snapshot,elapsedMs,force=false){
  for(const sample of [...(snapshot.gpuPhases?.pending||[]),...(snapshot.gpuPhases?.samples||[])])record.sampleMap.set(sample.id,sample);
  record.phaseSamples=[...record.sampleMap.values()].sort((a,b)=>a.id-b.id);record.latest=snapshot;
  const last=record.observations.at(-1);
  if(force||!last||last.frames!==snapshot.frames||elapsedMs-last.elapsedMs>=1000){
    const p=snapshot.gpuPhases;
    record.observations.push({elapsedMs,observedAtMs:snapshot.observedAtMs,frames:snapshot.frames,summaryFrames:snapshot.summaryFrames,
      pose:snapshot.pose,scene:snapshot.scene,canvas:snapshot.canvas,calls:snapshot.calls,triangles:snapshot.triangles,
      sceneOptimization:snapshot.sceneOptimization,adaptiveQuality:snapshot.adaptiveQuality,gpuSubmission:snapshot.gpuSubmission,
      gpuPhaseState:p?{requested:p.requested,enabled:p.enabled,status:p.status,method:p.method,startedSamples:p.startedSamples,
        completedSamples:p.completedSamples,discardedSamples:p.discardedSamples,maxSamples:p.maxSamples,pending:p.pending.map(s=>s.id),errors:p.errors}:null});
  }
}
function eligibleSample(sample,frame,before,mode){
  const m=sample?.metadata||{},expected=expectedMode(mode);
  return sample?.status==='completed'&&sample.phases?.scene&&sample.phases?.output&&
    Number.isInteger(frame)&&m.expectedPublicFrame===frame&&m.renderPath==='motion-target'&&m.scenePixelRatio===minimumScale&&
    m.sceneBufferWidth===691&&m.sceneBufferHeight===315&&diagnosticSamplingMatches(m,expected.label)&&
    m.motionRequestedSamples===(mode==='single'?0:2)&&m.motionDepthResolveSkipped===(mode!=='single')&&
    m.canvasWidth===before.canvas.width&&m.canvasHeight===before.canvas.height&&
    sample.marks?.length===3&&['start','scene','output'].every(label=>sample.marks.some(mark=>mark.label===label&&mark.status==='signaled'));
}
function invariantProfile(sample,snapshot){
  const m=sample.metadata,sceneInfo=m.sceneInfo||{},v=snapshot.sceneOptimization.vegetation;
  for(const key of ['calls','triangles','points','lines'])assert.ok(Number.isFinite(sceneInfo[key]),'Actual profiled geometry field is missing: '+key);
  assert.ok(sceneInfo.calls>0&&sceneInfo.triangles>0,'The profiled scene must contain actual rendered geometry');
  for(const key of ['sceneColorType','toneMapping','toneMappingExposure'])assert.ok(Number.isFinite(m[key]),'Actual profiled color field is missing: '+key);
  for(const key of ['sceneColorSpace','outputColorSpace'])assert.equal(typeof m[key],'string','Actual profiled color field is missing: '+key);
  assert.ok(m.cameraPosition?.length===3&&m.cameraQuaternion?.length===4&&
    m.cameraPosition.every(Number.isFinite)&&m.cameraQuaternion.every(Number.isFinite),'Actual profiled camera transform is required');
  assert.equal(sceneInfo.calls,snapshot.calls);assert.equal(sceneInfo.triangles,snapshot.triangles);
  return {cameraPosition:m.cameraPosition,cameraQuaternion:m.cameraQuaternion,
    sceneInfo:Object.fromEntries(['calls','triangles','points','lines'].map(key=>[key,sceneInfo[key]])),
    color:Object.fromEntries(['sceneColorType','sceneColorSpace','outputColorSpace','toneMapping','toneMappingExposure'].map(key=>[key,m[key]])),
    canvas:snapshot.canvas,sceneTarget:{width:m.sceneBufferWidth,height:m.sceneBufferHeight,pixelRatio:m.scenePixelRatio},
    pose:snapshot.pose,lights:snapshot.lights,sunTime:snapshot.sunTime,shareHash:snapshot.shareHash,
    vegetation:Object.fromEntries(['sourceBatches','instances','visibleInstances','culledInstances','orderedBatches','orderedInstances',
      'opaqueCoverageMaterials','opaqueCoverageMeshes','geometryChanged','positionsChanged'].map(key=>[key,v[key]]))};
}
function completionAvailability(sample){
  const output=sample.marks.find(mark=>mark.label==='output');
  assert.equal(output.status,'signaled');assert.ok(Number.isFinite(output.observedAtMs));
  const lower=Math.max(0,(output.lastUnsignaledAtMs??output.submittedAtMs)-sample.startedAtMs);
  const upper=output.observedAtMs-sample.startedAtMs;
  assert.ok(Number.isFinite(lower)&&Number.isFinite(upper)&&upper>=lower&&upper>0,'Invalid actual-frame availability interval');
  return {source:'profile-output-fence-after-isolated-frame',lower,upper,
    interpretation:'Wall-time bounds on observable output-fence availability from actual phase start, after a separate preceding-work drain; includes CPU submission, browser status caching and polling.'};
}
const median=values=>{const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;};
function availabilitySummary(measurements){
  const bounds=measurements.map(m=>m.completionAvailability),midpoints=bounds.map(b=>(b.lower+b.upper)/2);
  const lower=median(bounds.map(b=>b.lower)),upper=median(bounds.map(b=>b.upper)),midpoint=median(midpoints);
  const minimum=Math.min(...bounds.map(b=>b.lower)),maximum=Math.max(...bounds.map(b=>b.upper));
  return {samples:bounds.length,medianLowerMs:lower,medianUpperMs:upper,medianMidpointMs:midpoint,
    observedRangeMs:{lower:minimum,upper:maximum},relativeRange:(maximum-minimum)/midpoint};
}
function pairDecision(control,single){
  if(control.status!=='passed'||single.status!=='passed'||control.measurements.length<minimumCompletedSamples||single.measurements.length<minimumCompletedSamples)
    return {repeat:false,reason:'incomplete-first-pair',interpretation:'A setup/qualification failure cannot be replaced by a performance conclusion.'};
  const a=availabilitySummary(control.measurements),b=availabilitySummary(single.measurements);
  const apparentReduction=1-b.medianMidpointMs/a.medianMidpointMs;
  const bounds={lower:a.medianLowerMs>0?1-b.medianUpperMs/a.medianLowerMs:null,upper:1-b.medianLowerMs/a.medianUpperMs};
  const overlap=a.medianLowerMs<=b.medianUpperMs&&b.medianLowerMs<=a.medianUpperMs;
  const variable=a.relativeRange>=variableRangeFraction||b.relativeRange>=variableRangeFraction||bounds.lower===null;
  const material=apparentReduction>materialImprovementFraction;
  return {control:a,single:b,apparentReductionFraction:apparentReduction,apparentReductionBounds:bounds,
    overlappingMedianBounds:overlap,variableWithinCase:variable,repeat:material||overlap||variable,
    reason:material?'material-apparent-improvement':overlap||variable?'ambiguous-observed-variation':'no-material-improvement-and-separated-observations',
    interpretation:'Diagnostic comparison of isolated frame availability only; not a GPU-duration, equivalence, or walking-FPS claim.'};
}
async function isolateFrame(page,record,point,before,deadline){
  const preceding=await waitSceneCaptureReady(page,deadline);assert.equal(preceding.fence,'signaled');
  await page.waitForTimeout(Math.min(1050,remaining(deadline)));remaining(deadline);
  const quiet=await info(page,deadline);retain(record,quiet,Date.now()-record.startedAtMs,true);
  assert.equal(quiet.frames,preceding.frame,'The fixed camera submitted an unexpected frame during its quiet interval');
  assertMotion(quiet,before,record.mode);
  assert.ok(quiet.gpuPhases?.requested&&quiet.gpuPhases?.enabled&&quiet.gpuPhases.startedSamples<quiet.gpuPhases.maxSamples,
    'The bounded profiler exhausted its samples before an isolated frame could be measured');
  const requestAtBrowserMs=await page.evaluate(()=>performance.now());
  record.inputEvents.push({type:'same-coordinate-isolated-frame',point,atMs:Date.now(),requestAtBrowserMs});
  await page.mouse.move(point.x,point.y);
  await page.waitForFunction(frame=>Number(document.querySelector('#scene-host canvas')?.dataset.renderedFrameCount)>frame,
    preceding.frame,{timeout:remaining(deadline),polling:25});
  const submitted=await info(page,deadline);retain(record,submitted,Date.now()-record.startedAtMs,true);
  assert.equal(submitted.frames,preceding.frame+1,'An isolated measurement must contain exactly one actual new frame');
  const readiness=await waitSceneCaptureReady(page,deadline);assert.equal(readiness.fence,'signaled');
  let latest,sample;
  while(true){
    latest=await info(page,deadline);retain(record,latest,Date.now()-record.startedAtMs,true);
    assert.equal(latest.frames,submitted.frames,'An isolated profiled frame was replaced before completion');
    sample=record.phaseSamples.find(s=>s.metadata?.expectedPublicFrame===submitted.frames);
    if(sample?.status==='completed')break;
    assert.ok(!sample||sample.status==='pending','The actual phase record failed: '+JSON.stringify(sample));
    assert.ok(latest.gpuPhases?.enabled&&latest.gpuPhases.status!=='complete','The actual draw lacks a completed profiler record');
    await page.waitForTimeout(Math.min(50,remaining(deadline)));
  }
  assert.ok(eligibleSample(sample,submitted.frames,before,record.mode),'Completed phase metadata does not match the isolated actual motion frame');
  assertMotion(latest,before,record.mode);
  assert.equal(readiness.frame,latest.frames);assert.equal(latest.renderPending,'false');
  const invariant=invariantProfile(sample,latest);
  if(referenceMotion)assert.deepEqual(invariant,referenceMotion,'MSAA comparison changed camera, geometry, color, light or target state');
  else referenceMotion=invariant;
  const result={frame:latest.frames,profileId:sample.id,requestAtBrowserMs,precedingReadiness:preceding,readiness,
    completionAvailability:completionAvailability(sample),sample,invariant,snapshot:latest};
  record.measurements.push(result);await save();return result;
}
async function runCase(base,id,mode){
  const record={id,mode,status:'running',startedAtMs:Date.now(),stages:{},observations:[],inputEvents:[],sceneCaptures:[],images:{},
    phaseSamples:[],measurements:[],pageErrors:[],consoleErrors:[],failures:[]};
  Object.defineProperty(record,'sampleMap',{value:new Map(),enumerable:false});report.cases.push(record);await save();
  let context,page,held=false,before,point,stage='setup';
  try{
    let started=Date.now(),deadline=started+setupLimitMs;record.stages.setup={status:'running',maximumMs:setupLimitMs};
    context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1,reducedMotion:'reduce'});
    page=await context.newPage();page.setDefaultTimeout(setupLimitMs);
    page.on('pageerror',error=>record.pageErrors.push(error.message));page.on('console',message=>{if(message.type()==='error')record.consoleErrors.push(message.text());});
    record.url=motionDiagnosticUrl(base,fixtureHash,{sampling:expectedMode(mode).label,profile:true});
    await page.goto(record.url,{waitUntil:'domcontentloaded',timeout:remaining(deadline)});
    await page.locator('#loading').waitFor({state:'hidden',timeout:remaining(deadline)});await settled(page,deadline);
    await page.locator('#interior-open').click({timeout:remaining(deadline)});const host=page.locator('#interior-host');
    await host.waitFor({state:'visible',timeout:remaining(deadline)});
    await host.locator('[data-view="plan"]').click({timeout:remaining(deadline)});
    await host.locator('[data-iw="floor"]').selectOption('ground',{timeout:remaining(deadline)});
    await host.locator('[data-iw="room"]').selectOption('lounge',{timeout:remaining(deadline)});
    await host.locator('[data-view="room"]').click({timeout:remaining(deadline)});await settled(page,deadline,'ground');
    if(await page.locator('#viewer-fullscreen').getAttribute('aria-pressed')!=='true')await page.locator('#viewer-fullscreen').click({timeout:remaining(deadline)});
    await settled(page,deadline,'ground');await page.locator('#scene-host canvas').focus({timeout:remaining(deadline)});
    record.initialReadiness=await waitSceneCaptureReady(page,deadline);assert.equal(record.initialReadiness.fence,'signaled');
    before=record.before=await info(page,deadline);retain(record,before,Date.now()-record.startedAtMs,true);
    assert.equal(before.motionSupported,true);assert.equal(before.gpuPhases?.requested,true);assert.equal(before.gpuPhases?.enabled,true);
    assert.equal(before.pose.mode,'walk');assert.equal(before.pose.floor,'ground');assert.equal(before.pose.fov,70);
    assert.equal(before.canvas.width,1280);assert.equal(before.canvas.height,584);assert.equal(before.scene.path,'ao-composer');
    assert.ok(diagnosticSamplingMatches(before.scene,expectedMode(mode).label,{idle:true}),'The requested diagnostic sampling mode must be explicit before motion');
    assert.equal(before.motionActive,false);
    assert.equal(await page.locator('#showDimensions').isChecked(),true);assert.equal(await page.locator('#viewer-fullscreen').getAttribute('aria-pressed'),'true');
    if(report.cases[0].before){assertSceneUnchanged(before,report.cases[0].before);assert.deepEqual(before.livingCinema,report.cases[0].before.livingCinema);}
    record.webgl=await page.locator('#scene-host canvas').evaluate(canvas=>{
      const gl=canvas.getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');
      return {renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
        vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),version:gl.getParameter(gl.VERSION),
        shadingLanguageVersion:gl.getParameter(gl.SHADING_LANGUAGE_VERSION),canvasSamples:gl.getParameter(gl.SAMPLES),
        timerQueryExtensionAvailable:Boolean(gl.getExtension('EXT_disjoint_timer_query_webgl2'))};
    },null,{timeout:remaining(deadline)});
    if(report.cases[0].webgl)assert.deepEqual(record.webgl,report.cases[0].webgl,'All cases must use the same public WebGL device/context capabilities');
    await imageCapture(page,record,id+'-idle-before',deadline);
    record.stages.setup={...record.stages.setup,status:'passed',elapsedMs:Date.now()-started};await save();

    stage='conditioning';started=Date.now();deadline=started+motionLimitMs;record.stages.conditioning={status:'running',maximumMs:motionLimitMs};
    const canvas=page.locator('#scene-host canvas'),bounds=await canvas.boundingBox();assert.ok(bounds&&bounds.width>0&&bounds.height>0);
    point={x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2};record.pointerPoint=point;
    assert.equal(await canvas.evaluate((canvas,point)=>document.elementFromPoint(point.x,point.y)===canvas,point,{timeout:remaining(deadline)}),true);
    await page.mouse.move(point.x,point.y);held=true;await page.mouse.down({button:'left'});
    record.inputEvents.push({type:'pointerdown',point,atMs:Date.now()});let moves=0,latest;
    while(true){
      remaining(deadline);await page.mouse.move(point.x,point.y);moves++;
      await page.waitForTimeout(Math.min(pollIntervalMs,remaining(deadline)));
      latest=await info(page,deadline);retain(record,latest,Date.now()-record.startedAtMs);assertSceneUnchanged(latest,before);
      assert.ok(latest.gpuPhases?.enabled,'The optional phase profiler became unavailable during conditioning');
      if(isMinimumTarget(latest,mode))break;
      assert.ok(latest.gpuPhases.startedSamples<latest.gpuPhases.maxSamples,'The profiler sample budget ended before the actual minimum target');
      await save();
    }
    record.stages.conditioning={...record.stages.conditioning,status:'passed',elapsedMs:Date.now()-started,sameCoordinateMoveEvents:moves,
      firstMinimumFrame:latest.frames,profilerStartedSamples:latest.gpuPhases.startedSamples};await save();

    stage='measurement';started=Date.now();deadline=started+measurementLimitMs;record.stages.measurement={status:'running',maximumMs:measurementLimitMs};
    while(record.measurements.length<minimumCompletedSamples)await isolateFrame(page,record,point,before,deadline);
    const uniqueFrames=new Set(record.measurements.map(m=>m.frame)),uniqueProfiles=new Set(record.measurements.map(m=>m.profileId));
    assert.equal(uniqueFrames.size,minimumCompletedSamples);assert.equal(uniqueProfiles.size,minimumCompletedSamples);
    const motion=await imageCapture(page,record,id+'-motion',deadline);assertMotion(motion.snapshot,before,mode);
    assert.equal(motion.snapshot.frames,record.measurements.at(-1).frame,'The PNG must show the last fully completed profiled frame');
    record.stages.measurement={...record.stages.measurement,status:'passed',elapsedMs:Date.now()-started,
      actualCompletedProfileFrames:[...uniqueFrames],profileIds:[...uniqueProfiles]};
    record.availability=availabilitySummary(record.measurements);record.status='passed';await save();
  }catch(error){failed(record,stage,error);if(record.stages[stage]?.status==='running')record.stages[stage].status='failed';}
  finally{
    if(page){
      stage='restoration';const started=Date.now(),deadline=started+idleLimitMs;record.stages.restoration={status:'running',maximumMs:idleLimitMs};
      try{
        if(held){await page.mouse.up({button:'left'});held=false;record.inputEvents.push({type:'pointerup',point,atMs:Date.now()});}
        if(before){
          await settled(page,deadline,'ground');record.restorationReadiness=await waitSceneCaptureReady(page,deadline);assert.equal(record.restorationReadiness.fence,'signaled');
          const after=record.after=await info(page,deadline);retain(record,after,Date.now()-record.startedAtMs,true);assertSceneUnchanged(after,before);
          assert.equal(after.interacting,false);assert.deepEqual(after.scene,before.scene,'The original idle pipeline/storage state was not restored');
          assert.equal(after.sceneOptimization?.vegetation?.compacted,false);assert.equal(after.sceneOptimization?.vegetation?.opaqueCoverageMaterials,0);
          assert.equal(after.sceneOptimization?.vegetation?.opaqueCoverageRestored,true);
          const restored=await imageCapture(page,record,id+'-idle-restored',deadline);
          if(captures.has(id+'-idle-before')){
            record.idlePixels=await pixelDifference(page,captures.get(id+'-idle-before'),restored.buffer,deadline);
            assert.equal(record.idlePixels.exactRGBA,true,'Idle restoration must be exact within the same context');
          }
          record.stages.restoration.status='passed';
        }else record.stages.restoration={status:'unavailable',reason:'Setup did not establish the initial public idle state'};
        assert.deepEqual(record.pageErrors,[],'The diagnostic page reported an application error');
        assert.deepEqual(record.consoleErrors,[],'The diagnostic page reported a renderer or console error');
      }catch(error){record.stages.restoration.status='failed';failed(record,stage,error);}
      record.stages.restoration.elapsedMs=Date.now()-started;await save();
    }
    if(context)await context.close();
  }
  return record;
}
async function analyzePair(control,single,index){
  const started=Date.now(),deadline=started+pairAnalysisLimitMs;
  const pair={index,caseOrder:index===1?[control.id,single.id]:[single.id,control.id],decision:pairDecision(control,single),
    motionPixels:{status:'unavailable'},interpretation:'Pixel differences are the measured cost in motion image quality. They do not pass or fail visual equivalence.'};
  report.pairs.push(pair);
  if(captures.has(control.id+'-motion')&&captures.has(single.id+'-motion')){
    const context=await browser.newContext();
    try{const page=await context.newPage();pair.motionPixels={status:'measured',...await pixelDifference(page,captures.get(control.id+'-motion'),captures.get(single.id+'-motion'),deadline)};}
    finally{await context.close();}
  }
  pair.elapsedMs=Date.now()-started;await save();return pair;
}
try{
  assert.ok(process.env.BASELINE_DIR,'BASELINE_DIR must name the unchanged 66c096a garden-lab checkout for the public fixture.');
  const baselineState=await import(pathToFileURL(path.join(path.resolve(process.env.BASELINE_DIR),'src/state.js')).href);
  report.version=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version;
  report.fixture=baselineState.sanitizeState({...baselineState.DEFAULTS,designStyle:'scandinavian',styleHouseFinish:true,sceneMotion:false,renderQuality:'auto',
    showDimensions:true,showRays:false,showLabels:false,existingVegetation:true,sunEnabled:true,sunDate:'2026-06-21',sunMinutes:780,
    mode:'orbit',interiorEnabled:false,walkNavigation:'free'});
  const params=new URLSearchParams(baselineState.encodeState(report.fixture));params.set('livingCinemaLayout','right-media');params.set('showEquipmentLabels','true');
  fixtureHash=params.toString();report.fixtureSource={commit:'66c096a94b6ada93e015a98bce07b4b3a643f933',candidateOverrides:{livingCinemaLayout:'right-media',showEquipmentLabels:true},shareHash:fixtureHash};
  const base=await serve();browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-dev-shm-usage']});
  report.host.chromium=browser.version();await save();
  const control=await runCase(base,'pair1-control','control'),single=await runCase(base,'pair1-single','single');
  const first=await analyzePair(control,single,1);
  report.repeat={performed:first.decision.repeat,reason:first.decision.reason,maximumAdditionalPairs:1};await save();
  if(first.decision.repeat){
    const reverseSingle=await runCase(base,'pair2-single','single'),reverseControl=await runCase(base,'pair2-control','control');
    const second=await analyzePair(reverseControl,reverseSingle,2);
    second.decision.furtherRepeatAllowed=false;
    report.repeat.reverseOrderObservedReductions=[first.decision.apparentReductionFraction,second.decision.apparentReductionFraction];
    report.repeat.interpretation='At most one reverse-order repeat was collected. Raw per-frame intervals and quality differences remain the evidence; no walking acceptance result is inferred.';
  }
  assert.ok(report.cases.every(record=>record.status==='passed'),'Every requested diagnostic context must complete its sample and idle-restoration requirements');
  assert.ok(report.pairs.every(pair=>pair.motionPixels.status==='measured'),'Each diagnostic pair must retain its actual motion pixel comparison');
  report.status='passed';
}catch(error){report.status='failed';report.failures.push({stage:'overall',message:error.message,stack:error.stack});process.exitCode=1;console.error(error.stack);}
finally{
  await save();if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));
  console.log('MOTION_MSAA_RESULT '+JSON.stringify({status:report.status,repeat:report.repeat,
    pairs:report.pairs.map(pair=>({index:pair.index,decision:pair.decision,motionPixels:pair.motionPixels})),report:path.join(output,'browser-report.json')}));
}
