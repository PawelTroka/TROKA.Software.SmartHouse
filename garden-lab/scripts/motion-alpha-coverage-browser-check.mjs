// Same-head visual control for the motion-only opaque alpha-coverage scope.
// No private scene mutation, performance gate, or baseline browser render.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {captureSceneScreenshot,waitSceneCaptureReady} from './scene-gpu-capture.mjs';

assert.notEqual(process.env.SITES_MANAGED_LINUX_CONTAINER,'1','Run real WebGL pixel checks in GitHub Actions, not the managed workspace.');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'test-results','motion-alpha-coverage');await mkdir(output,{recursive:true});
const setupLimitMs=120000,motionLimitMs=120000,captureLimitMs=120000,idleLimitMs=120000;
const pollIntervalMs=150,minimumScale=.54,minimumStableDraws=4,pixelThreshold=15,maximumChangedFraction=.001;
const report={status:'running',head:process.env.GITHUB_SHA||null,route:'living',
  method:'Two fresh contexts of the same build and Share fixture. A keeps motion alpha coverage; B uses the default optimization. Real zero-displacement held-pointer events request moving frames without changing the public camera. Each case requires four actual compacted minimum-scale submissions before fenced captures.',
  acceptance:'A/A must be identical decoded RGBA on distinct actual submissions. A/B uses the existing strict changed-pixel fraction < .001 with a 15-code-value per-channel tolerance; exact RGBA differences are also reported. Both cases must restore the original idle pipeline and material state.',
  limitations:['This is a fixed-camera visual regression, not a walking performance result or speedup claim.',
    'The public camera position is reported to millimetres and yaw/pitch to four decimal places; unchanged zero-displacement input and decoded pixels provide additional evidence.',
    'GPU capture fences establish completion of preceding context work; they are not isolated GPU-duration measurements.'],
  viewport:{width:1280,height:800,deviceScaleFactor:1},
  policy:{setupLimitMs,motionLimitMs,captureLimitMs,idleLimitMs,pollIntervalMs,minimumScale,minimumStableDraws,
    expectedMotionTarget:{width:691,height:315,samples:4},pixelThreshold,maximumChangedFraction,
    maximumCaseStagesMs:setupLimitMs+motionLimitMs+captureLimitMs+idleLimitMs},
  host:{platform:os.platform(),release:os.release(),arch:os.arch(),cpuModel:os.cpus()[0]?.model,
    logicalCpus:os.cpus().length,totalMemoryGB:os.totalmem()/1024**3,node:process.version},
  cases:[],comparisons:{},failures:[]};
let browser,server,fixtureHash;
const captures=new Map();
const save=()=>writeFile(path.join(output,'browser-report.json'),JSON.stringify(report,null,2));
function remaining(deadline){const ms=deadline-Date.now();assert.ok(ms>0,'Motion alpha-coverage check exceeded its stage deadline');return ms;}
function failed(record,stage,error){
  record.status='failed';record.failures.push({stage,message:error.message,stack:error.stack});
  report.failures.push({case:record.id,stage,message:error.message});
  console.error('MOTION_ALPHA_COVERAGE_FAILED '+JSON.stringify({case:record.id,stage,message:error.message}));
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
      motionActive:d.motionActive==='true',motionSupported:(c.motionSupported??d.motionSupported)==='true',
      canvas:{width:canvas.width,height:canvas.height,cssWidth:bounds.width,cssHeight:bounds.height},
      scene:{width:number(c.sceneBufferWidth),height:number(c.sceneBufferHeight),pixelRatio:number(c.scenePixelRatio),
        path:c.renderPath,motionSamples:number(c.motionSamples),canvasSamples:number(c.canvasSamples)},
      pose:{mode:viewport.dataset.mode,floor:c.walkFloor,position:position(c.walkPosition),renderedPosition:position(c.renderedWalkPosition),
        yaw:number(c.walkYaw),pitch:number(c.walkPitch),fov:number(c.walkFov),altitude:number(c.walkAltitude),
        navigation:c.walkNavigation,floating:c.walkFloating,swimming:c.walkSwimming},
      lights:Object.fromEntries(['nightActivation','nightGarden','nightPendants','nightHedge','nightWindows'].map(key=>[key,viewport.dataset[key]??null])),
      sunTime:document.querySelector('#sun-time')?.value,shareHash:location.hash,
      sceneOptimization:json('sceneOptimization'),gpuSubmission:json('gpuSubmission'),adaptiveQuality:json('adaptiveQuality'),
      livingCinema:json('livingCinema'),equipmentLabels:json('equipmentLabels'),
      fullscreen:document.body.dataset.modelFullscreen||null,focused:document.hasFocus(),visibility:document.visibilityState};
  },null,{timeout:remaining(deadline)});
}
function assertSceneUnchanged(snapshot,before){
  assert.deepEqual(snapshot.pose,before.pose,'Zero-displacement input changed the public live/rendered camera');
  assert.deepEqual(snapshot.canvas,before.canvas,'The fixed display canvas changed size');
  assert.deepEqual(snapshot.lights,before.lights,'The comparison changed the scene lighting');
  assert.equal(snapshot.sunTime,before.sunTime);assert.equal(snapshot.shareHash,before.shareHash);
  assert.equal(snapshot.renderedStyle,before.renderedStyle);assert.equal(snapshot.motionActive,false);
  assert.equal(snapshot.fullscreen,before.fullscreen);assert.equal(snapshot.visibility,'visible');
}
function isMinimumTarget(snapshot){
  return snapshot.motionSupported&&snapshot.interacting&&snapshot.scene.path==='motion-target'&&
    snapshot.scene.pixelRatio===minimumScale&&snapshot.scene.width===691&&snapshot.scene.height===315&&
    snapshot.scene.motionSamples===4;
}
function isStableMinimumFrame(snapshot){
  const v=snapshot.sceneOptimization?.vegetation;
  return Number.isInteger(snapshot.frames)&&snapshot.frames>0&&snapshot.summaryFrames===snapshot.frames&&
    isMinimumTarget(snapshot)&&v?.compacted===true&&v.shadowUploadGuard===null;
}
function assertCoverage(snapshot,optimized){
  const v=snapshot.sceneOptimization?.vegetation;
  assert.ok(Number.isInteger(v?.opaqueCoverageMaterials),'Actual per-pass opaque coverage count is missing');
  assert.ok(optimized?v.opaqueCoverageMaterials>0:v.opaqueCoverageMaterials===0,
    'The completed frame did not use the requested alpha-coverage scope: '+JSON.stringify(v));
  assert.equal(v.opaqueCoverageRestored,true,'Scoped material alpha coverage was not restored after rendering');
}
function assertMotion(snapshot,before,optimized){
  assertSceneUnchanged(snapshot,before);assert.ok(isStableMinimumFrame(snapshot),'Capture requires an actual compacted .54 motion target with four MSAA samples');
  assert.equal(snapshot.renderPending,'false');assertCoverage(snapshot,optimized);
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
async function requestIdenticalFrame(page,record,point,deadline){
  const ready=await waitSceneCaptureReady(page,deadline);assert.equal(ready.fence,'signaled');
  // Summary diagnostics are throttled to one second. A fresh on-demand draw
  // after this quiet interval publishes the actual scope for the captured frame.
  await page.waitForTimeout(Math.min(1050,remaining(deadline)));remaining(deadline);
  record.inputEvents.push({type:'same-coordinate-pointermove',point,atMs:Date.now()});
  await page.mouse.move(point.x,point.y);
  await page.waitForFunction(frame=>Number(document.querySelector('#scene-host canvas')?.dataset.renderedFrameCount)>frame,
    ready.frame,{timeout:remaining(deadline),polling:50});
}
async function runCase(base,id,optimized){
  const record={id,optimized,status:'running',stages:{},observations:[],inputEvents:[],sceneCaptures:[],images:{},pageErrors:[],consoleErrors:[],failures:[]};
  report.cases.push(record);await save();
  let context,page,held=false,before,point,stage='setup';
  try{
    let started=Date.now(),deadline=started+setupLimitMs;record.stages.setup={status:'running',maximumMs:setupLimitMs};
    context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1,reducedMotion:'reduce'});
    page=await context.newPage();page.setDefaultTimeout(setupLimitMs);
    page.on('pageerror',error=>record.pageErrors.push(error.message));page.on('console',message=>{if(message.type()==='error')record.consoleErrors.push(message.text());});
    record.url=base+'/?site=sternicza-11'+(optimized?'':'&motionAlphaCoverage=keep')+'#'+fixtureHash;
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
    before=record.before=await info(page,deadline);assert.equal(before.motionSupported,true);
    assert.equal(before.pose.mode,'walk');assert.equal(before.pose.floor,'ground');assert.equal(before.pose.fov,70);
    assert.equal(before.canvas.width,1280);assert.equal(before.canvas.height,584);assert.equal(before.scene.path,'ao-composer');
    assert.equal(before.motionActive,false);assertCoverage(before,false);
    assert.equal(await page.locator('#showDimensions').isChecked(),true);
    assert.equal(await page.locator('#viewer-fullscreen').getAttribute('aria-pressed'),'true');
    if(report.cases[0].before){
      assertSceneUnchanged(before,report.cases[0].before);
      assert.deepEqual(before.livingCinema,report.cases[0].before.livingCinema,'The two pages must use the same living-room composition');
    }
    record.webgl=await page.locator('#scene-host canvas').evaluate(canvas=>{
      const gl=canvas.getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');
      return {renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
        vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),version:gl.getParameter(gl.VERSION),
        shadingLanguageVersion:gl.getParameter(gl.SHADING_LANGUAGE_VERSION),canvasSamples:gl.getParameter(gl.SAMPLES)};
    },null,{timeout:remaining(deadline)});
    await imageCapture(page,record,id+'-idle-before',deadline);
    record.stages.setup={...record.stages.setup,status:'passed',elapsedMs:Date.now()-started};await save();

    stage='motion';started=Date.now();deadline=started+motionLimitMs;
    record.stages.motion={status:'running',maximumMs:motionLimitMs,requiredActualDraws:minimumStableDraws,stableFrames:[]};
    const bounds=await page.locator('#scene-host canvas').boundingBox();assert.ok(bounds&&bounds.width>0&&bounds.height>0);
    point={x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2};record.pointerPoint=point;
    assert.equal(await page.locator('#scene-host canvas').evaluate((canvas,point)=>document.elementFromPoint(point.x,point.y)===canvas,
      point,{timeout:remaining(deadline)}),true,'The held-pointer target must hit the actual scene canvas');
    await page.mouse.move(point.x,point.y);held=true;await page.mouse.down({button:'left'});
    record.inputEvents.push({type:'pointerdown',point,atMs:Date.now()});
    let lastFrame=before.frames,lastObservation=0,moves=0;
    while(record.stages.motion.stableFrames.length<minimumStableDraws){
      remaining(deadline);await page.mouse.move(point.x,point.y);moves++;
      await page.waitForTimeout(Math.min(pollIntervalMs,remaining(deadline)));
      const snapshot=await info(page,deadline);assertSceneUnchanged(snapshot,before);
      if(snapshot.frames!==lastFrame||Date.now()-lastObservation>=1000){
        record.observations.push({elapsedMs:Date.now()-started,...snapshot});lastObservation=Date.now();
      }
      if(snapshot.frames!==lastFrame){
        lastFrame=snapshot.frames;
        if(isStableMinimumFrame(snapshot)){
          assertCoverage(snapshot,optimized);record.stages.motion.stableFrames.push(snapshot.frames);
        }else if(!isMinimumTarget(snapshot)||snapshot.summaryFrames===snapshot.frames){
          // An intermediate draw whose one-second summary has not published
          // cannot qualify, but it also cannot erase already verified draws.
          record.stages.motion.stableFrames=[];
        }
        await save();
      }
    }
    record.stages.motion={...record.stages.motion,status:'passed',elapsedMs:Date.now()-started,sameCoordinateMoveEvents:moves};await save();

    stage='capture';started=Date.now();deadline=started+captureLimitMs;
    record.stages.capture={status:'running',maximumMs:captureLimitMs};
    for(const name of optimized?['optimized-b']:['control-a1','control-a2']){
      await requestIdenticalFrame(page,record,point,deadline);
      const result=await imageCapture(page,record,name,deadline);assertMotion(result.snapshot,before,optimized);
      if(!optimized&&name==='control-a2'){
        const first=record.images['control-a1'].snapshot;assert.ok(result.snapshot.frames>first.frames,'A/A must compare distinct actual submissions');
        assert.deepEqual(result.snapshot.scene,first.scene);
        report.comparisons.aa=await pixelDifference(page,captures.get('control-a1'),result.buffer,deadline);
        assert.equal(report.comparisons.aa.exactRGBA,true,'The unchanged control is not deterministic at the identical camera');
      }
      if(optimized&&captures.has('control-a1')){
        const first=report.cases[0].images['control-a1'].snapshot;
        assertSceneUnchanged(result.snapshot,first);assert.deepEqual(result.snapshot.scene,first.scene,'A/B scene targets or multisampling differ');
        report.comparisons.ab=await pixelDifference(page,captures.get('control-a1'),result.buffer,deadline);
        assert.ok(report.comparisons.ab.fraction<maximumChangedFraction,'Opaque coverage changed too many pixels: '+JSON.stringify(report.comparisons.ab));
      }
    }
    record.stages.capture={...record.stages.capture,status:'passed',elapsedMs:Date.now()-started};record.status='passed';await save();
  }catch(error){failed(record,stage,error);if(record.stages[stage]?.status==='running')record.stages[stage].status='failed';}
  finally{
    if(page){
      stage='idle-restoration';const started=Date.now(),deadline=started+idleLimitMs;
      record.stages.restoration={status:'running',maximumMs:idleLimitMs};
      try{
        if(held){await page.mouse.up({button:'left'});held=false;record.inputEvents.push({type:'pointerup',point,atMs:Date.now()});}
        if(before){
          await settled(page,deadline,'ground');record.restorationReadiness=await waitSceneCaptureReady(page,deadline);
          assert.equal(record.restorationReadiness.fence,'signaled');
          const after=record.after=await info(page,deadline);assertSceneUnchanged(after,before);
          assert.equal(after.interacting,false);assert.deepEqual(after.scene,before.scene,'The original idle pipeline was not restored');
          assert.equal(after.sceneOptimization?.vegetation?.compacted,false);assertCoverage(after,false);
          const restored=await imageCapture(page,record,id+'-idle-restored',deadline);
          if(captures.has(id+'-idle-before')){
            record.idlePixels=await pixelDifference(page,captures.get(id+'-idle-before'),restored.buffer,deadline);
            assert.ok(record.idlePixels.fraction<maximumChangedFraction,'Idle pixels did not restore: '+JSON.stringify(record.idlePixels));
          }
          record.stages.restoration.status='passed';
        }else record.stages.restoration={status:'unavailable',reason:'Setup did not establish the initial public idle state'};
        assert.deepEqual(record.pageErrors,[],'The comparison page reported an application error');
      }catch(error){record.stages.restoration.status='failed';failed(record,stage,error);}
      record.stages.restoration.elapsedMs=Date.now()-started;await save();
    }
    if(context)await context.close();
  }
}

try{
  assert.ok(process.env.BASELINE_DIR,'BASELINE_DIR must name the unchanged 66c096a garden-lab checkout for the shared public fixture.');
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
  await runCase(base,'control',false);await runCase(base,'optimized',true);
  assert.ok(report.cases.every(record=>record.status==='passed'),'Both complete control/optimized cases must pass');
  assert.equal(report.comparisons.aa?.exactRGBA,true,'A/A determinism evidence is required');
  assert.ok(report.comparisons.ab?.fraction<maximumChangedFraction,'A/B fidelity evidence is required');
  report.status='passed';
}catch(error){report.status='failed';report.failures.push({stage:'overall',message:error.message,stack:error.stack});process.exitCode=1;console.error(error.stack);}
finally{
  await save();if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));
  console.log('MOTION_ALPHA_COVERAGE_RESULT '+JSON.stringify({status:report.status,aa:report.comparisons.aa,ab:report.comparisons.ab,report:path.join(output,'browser-report.json')}));
}
