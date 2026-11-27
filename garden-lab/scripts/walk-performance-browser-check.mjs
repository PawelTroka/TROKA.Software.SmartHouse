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
const report={status:'running',baseline:{commit:'66c096a',version:baselineVersion},candidate:{version:candidateVersion},
  method:'Same Chromium process and software GPU; public Share fixture, room entry, fullscreen and held walking keys. Four-second continuous warmup precedes each eight-second RAF/Long Task trace. No mocked rendering or private app state.',
  limitations:['CI uses SwiftShader on a shared CPU host, not the user’s GPU; absolute FPS must not be generalized to user hardware.',
    'RAF delivery measures observed navigation cadence, not isolated GPU timer-query time. Public frame counts and changing walking poses verify active rendering.',
    'The candidate legacy comparison freezes the old living-room composition and disables equipment labels. The new kitchen remains present, so complete geometry equality is not claimed.',
    'Adaptive resolution is warmed before capture and its delivered backing buffer is recorded. Idle images restore the selected full detail.'],
  fixture,viewport:{width:1280,height:800,deviceScaleFactor:1},durationMs:duration,
  host:{platform:os.platform(),release:os.release(),arch:os.arch(),cpuModel:os.cpus()[0]?.model,logicalCpus:os.cpus().length,totalMemoryGB:os.totalmem()/1024**3,node:process.version},
  runs:[],comparisons:[],errors:[]};
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
async function oscillate(page,ms){
  const end=Date.now()+ms;let direction='a';
  while(Date.now()<end){
    const held=Math.min(500,end-Date.now());if(held<=0)break;
    await page.keyboard.down(direction);await page.waitForTimeout(held);await page.keyboard.up(direction);direction=direction==='a'?'d':'a';
  }
}
async function capture(page,caseId,route){
  const before=await info(page);assert.equal(before.pose.fov,70);assert.equal(await page.locator('#showDimensions').isChecked(),true);
  await page.locator('#scene-host canvas').focus();
  // This warmup allows shaders, vertex uploads and the stable adaptive buffer
  // to settle under the same continuous-input workload as the measured trace.
  await oscillate(page,4000);
  await page.evaluate(()=>{
    const trace={frames:[],longTasks:[],active:true,handle:0,start:performance.now(),observer:null};window.__navigationTrace=trace;
    try{trace.observer=new PerformanceObserver(list=>{for(const e of list.getEntries())trace.longTasks.push({start:e.startTime,duration:e.duration});});trace.observer.observe({type:'longtask',buffered:false});}catch{}
    let last=0;
    const frame=now=>{if(!trace.active)return;if(last){const c=document.querySelector('#scene-host canvas');trace.frames.push({ms:now-last,t:now-trace.start,position:c?.dataset.walkPosition,renderedFrames:Number(document.querySelector('#render-diagnostics')?.dataset.frames),bufferWidth:c?.width,bufferHeight:c?.height});}last=now;trace.handle=requestAnimationFrame(frame);};
    trace.handle=requestAnimationFrame(frame);
  });
  await oscillate(page,duration);
  const trace=await page.evaluate(()=>{const t=window.__navigationTrace;t.active=false;cancelAnimationFrame(t.handle);t.observer?.disconnect();const result={frames:t.frames,longTasks:t.longTasks,elapsedMs:performance.now()-t.start};delete window.__navigationTrace;return result;});
  const duringMotion=await info(page);
  // One post-input publication proves that all navigation frames completed and
  // records the final timing statistics rather than a stale pending snapshot.
  await settled(page,route==='living'?'ground':'garden');const after=await info(page);
  const intervals=trace.frames.slice(2).map(f=>f.ms),summary=frameTimeSummary(intervals),uniquePoses=new Set(trace.frames.map(f=>f.position));
  const buffers=new Map();for(const frame of trace.frames.slice(2)){const key=frame.bufferWidth+'×'+frame.bufferHeight;if(!buffers.has(key))buffers.set(key,{width:frame.bufferWidth,height:frame.bufferHeight,pixels:frame.bufferWidth*frame.bufferHeight,frames:0});buffers.get(key).frames++;}
  const motionBuffers=[...buffers.values()].sort((a,b)=>b.frames-a.frames);
  assert.ok(summary.samples>=12,`${caseId}/${route}: insufficient delivered navigation frames`);
  assert.ok(uniquePoses.size>=3,`${caseId}/${route}: public walking positions did not change`);
  assert.ok(Number(after.frames)>Number(before.frames)+10,`${caseId}/${route}: real renderer did not produce navigation frames`);
  const name=caseId+'-'+route+'.png';await page.locator('#scene-host').screenshot({path:path.join(output,name),scale:'css',animations:'disabled'});
  const run={case:caseId,route,before,duringMotion,after,motionBuffers,summary,actualAverageFps:1000/summary.mean,longTasks:{count:trace.longTasks.length,totalMs:trace.longTasks.reduce((s,e)=>s+e.duration,0),maxMs:Math.max(0,...trace.longTasks.map(e=>e.duration))},uniquePoses:uniquePoses.size,screenshot:name,trace};
  report.runs.push(run);await save();console.log('WALK_PERFORMANCE '+JSON.stringify({case:caseId,route,...summary,motionBuffers,idleBuffer:after.viewport,adaptive:after.adaptiveQuality}));
}
try{
  const baseline=await serve(baselineRoot),candidate=await serve(root);
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-dev-shm-usage']});
  report.host.chromium=browser.version();
  for(const scenario of [{id:'baseline-1.39',url:baseline,layout:'legacy',equipment:false},{id:'candidate-legacy',url:candidate,layout:'legacy',equipment:false},{id:'candidate-current',url:candidate,layout:'right-media',equipment:true}]){
    const context=await browser.newContext({viewport:{width:report.viewport.width,height:report.viewport.height},deviceScaleFactor:1,reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(120000);
    page.on('pageerror',error=>report.errors.push({case:scenario.id,message:error.message}));
    const params=new URLSearchParams(hash);params.set('livingCinemaLayout',scenario.layout);params.set('showEquipmentLabels',String(scenario.equipment));
    await page.goto(scenario.url+'/?site=sternicza-11#'+params,{waitUntil:'domcontentloaded'});await page.locator('#loading').waitFor({state:'hidden'});await settled(page);
    if(!report.host.webgl)report.host.webgl=await page.locator('#scene-host canvas').evaluate(canvas=>{const gl=canvas.getContext('webgl2')||canvas.getContext('webgl'),ext=gl?.getExtension('WEBGL_debug_renderer_info');return {renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl?.getParameter(gl.RENDERER),vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):gl?.getParameter(gl.VENDOR)};});
    await enterLiving(page);
    if(await page.locator('#viewer-fullscreen').getAttribute('aria-pressed')!=='true')await page.locator('#viewer-fullscreen').click();await settled(page,'ground');
    await capture(page,scenario.id,'living');
    await page.locator('#walk-location').selectOption('garden');await page.locator('#walk-start').click();await settled(page,'garden');
    await capture(page,scenario.id,'garden');await context.close();
  }
  for(const route of ['living','garden']){
    const baseline=report.runs.find(r=>r.case==='baseline-1.39'&&r.route===route),candidate=report.runs.find(r=>r.case==='candidate-legacy'&&r.route===route),current=report.runs.find(r=>r.case==='candidate-current'&&r.route===route);
    const comparison={route,baseline:baseline.summary,candidateLegacy:candidate.summary,candidateCurrent:current.summary,
      meanFrameTimeReductionPercent:100*(1-candidate.summary.mean/baseline.summary.mean),p95ReductionPercent:100*(1-candidate.summary.p95/baseline.summary.p95),
      onePercentLowFpsChangePercent:100*(candidate.summary.onePercentLowFps/baseline.summary.onePercentLowFps-1),
      initialPoseDeltaM:Math.hypot(...candidate.before.pose.position.map((v,i)=>v-baseline.before.pose.position[i])),
      initialYawDelta:Math.abs(candidate.before.pose.yaw-baseline.before.pose.yaw)};
    comparison.baselineMotionBuffers=baseline.motionBuffers;comparison.candidateMotionBuffers=candidate.motionBuffers;comparison.currentMotionBuffers=current.motionBuffers;
    report.comparisons.push(comparison);
    assert.ok(comparison.initialPoseDeltaM<.03&&comparison.initialYawDelta<.1,`${route}: legacy baseline/candidate camera fixtures must match`);
    if(process.env.ENFORCE_PERFORMANCE_REGRESSION==='1')assert.ok(candidate.summary.p95<=baseline.summary.p95*1.15+5,`${route}: candidate p95 regressed beyond shared-host tolerance`);
  }
  assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure={message:error.message,stack:error.stack};process.exitCode=1;console.error(error);}
finally{await save();await browser?.close();await Promise.all(servers.map(server=>new Promise(resolve=>server.close(resolve))));}
