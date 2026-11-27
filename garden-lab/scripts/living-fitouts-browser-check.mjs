// Bounded, parallel real-WebGL evidence for the requested living fit-outs.
// The main interior suite separately covers styles, continuous WASD and mobile.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {captureOpenLivingViews,LIVING_FITOUT_GROUPS} from './open-living-browser-helpers.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const group=process.env.LIVING_FITOUT_GROUP||'architecture';
assert.ok(Object.hasOwn(LIVING_FITOUT_GROUPS,group),'Unknown LIVING_FITOUT_GROUP: '+group);
const output=path.join(root,'test-results','living-fitouts-'+group);
await mkdir(output,{recursive:true});
const version=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version;
const SCENE_TIMEOUT=120000,CAPTURE_BUDGET=600000;
const report={version,group,status:'running',checks:[],views:[],arrangements:[],screenshots:[],sceneCaptures:[],errors:[],
  expectedViews:LIVING_FITOUT_GROUPS[group],
  sceneEvidence:'Actual WebGL canvas screenshots reached through public room selectors, arrangement switches, keyboard walking controls and drag look.'};
const writeReport=()=>writeFile(path.join(output,'browser-report.json'),JSON.stringify(report,null,2));
const check=label=>{report.checks.push(label);console.log('LIVING_FITOUT_CHECK '+label);};
let browser,server,page,base=process.env.BASE_URL?.replace(/\/$/,'');
const q=selector=>page.locator(selector);
const walkSnapshot=()=>page.evaluate(()=>({
  walk:{...document.querySelector('#scene-host canvas')?.dataset},
  render:{...document.querySelector('#render-diagnostics')?.dataset},
}));
async function walking(floor,{timeout=SCENE_TIMEOUT,settled=false,afterFrame=null}={}){
  await q('#interior-host').waitFor({state:'hidden',timeout});
  await page.waitForFunction(({floor,settled,afterFrame})=>{
    const c=document.querySelector('#scene-host canvas'),d=document.querySelector('#render-diagnostics')?.dataset;
    const target=Number(c?.dataset.walkPosition?.split(',')[1]),altitude=Number(c?.dataset.walkAltitude);
    const heightReady=!settled||(c?.dataset.walkFloating==='false'&&Number.isFinite(target)&&Number.isFinite(altitude)&&Math.abs(altitude-target)<=.002&&d?.interacting==='false');
    return c?.dataset.walkFloor===floor&&c.dataset.walkPosition&&d?.renderer==='webgl'&&d.drawEnabled==='true'&&d.renderPending==='false'&&heightReady&&
      (afterFrame===null||Number(d.frames)>afterFrame)&&Number(d.triangles)>0&&Number(d.surfaceAssetsRequested)>0&&d.surfaceAssetsLoaded===d.surfaceAssetsRequested&&Number(d.surfaceAssetsFailed)===0;
  },{floor,settled,afterFrame},{timeout});
  assert.equal(await q('#viewer .mode-tabs button[data-mode="walk"]').getAttribute('aria-pressed'),'true');
  assert.equal(await q('#walk-location').inputValue(),floor);
  assert.match(await q('#scene-host canvas').getAttribute('aria-label'),/WASD or arrows/);
  return q('#scene-host canvas').evaluate(c=>({floor:c.dataset.walkFloor,position:c.dataset.walkPosition.split(',').map(Number)}));
}
async function openInteriors({timeout=SCENE_TIMEOUT}={}){
  await q('#interior-open').click({timeout});
  await page.waitForFunction(()=>{
    const host=document.querySelector('#interior-host');
    return host&&!host.hidden&&host.getInteriorDiagnostics?.().visible&&host.dataset.view==='plan'&&Boolean(host.querySelector('[data-iw="plan"] svg'));
  },undefined,{timeout});
}
async function exportDesign({timeout=SCENE_TIMEOUT}={}){
  const pending=page.waitForEvent('download',{timeout});
  await q('#export').click({timeout});
  return JSON.parse(await readFile(await (await pending).path(),'utf8'));
}
async function shot(name,selector,{timeout=SCENE_TIMEOUT}={}){
  const target=selector?q(selector):page,file=name+'.png';
  if(selector)await target.scrollIntoViewIfNeeded({timeout});
  if(name!=='failure')await page.waitForFunction(()=>{
    const toast=document.querySelector('#toast');
    return !toast||(!toast.classList.contains('visible')&&Number(getComputedStyle(toast).opacity)===0);
  },undefined,{timeout});
  let scene=null;
  if(selector==='#scene-host canvas'){
    scene=await page.evaluate(()=>{
      const c=document.querySelector('#scene-host canvas'),d=document.querySelector('#render-diagnostics').dataset,b=c.getBoundingClientRect();
      return {renderer:d.renderer,frames:Number(d.frames),triangles:Number(d.triangles),drawEnabled:d.drawEnabled,renderPending:d.renderPending,
        style:d.renderedStyle,floor:c.dataset.walkFloor,position:c.dataset.walkPosition,fov:Number(c.dataset.walkFov),
        loaded:Number(d.surfaceAssetsLoaded),requested:Number(d.surfaceAssetsRequested),failed:Number(d.surfaceAssetsFailed),
        cssWidth:b.width,cssHeight:b.height,bufferWidth:c.width,bufferHeight:c.height};
    });
    assert.equal(scene.renderer,'webgl');assert.equal(scene.drawEnabled,'true');assert.equal(scene.renderPending,'false');
    assert.ok(scene.frames>0&&scene.triangles>0&&scene.requested>0);assert.equal(scene.loaded,scene.requested);assert.equal(scene.failed,0);
  }
  const png=await target.screenshot({path:path.join(output,file),scale:'css',animations:'disabled',timeout});
  report.screenshots.push(file);
  if(scene)report.sceneCaptures.push({file,...scene,pngWidth:png.readUInt32BE(16),pngHeight:png.readUInt32BE(20)});
}

try{
  if(!base){
    const publicDir=path.join(root,'public'),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'};
    server=createServer(async(req,res)=>{
      try{
        const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
        const file=path.resolve(publicDir,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
        if(!file.startsWith(publicDir+path.sep))throw new Error('Invalid path');
        const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
      }catch{res.writeHead(404);res.end();}
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    base='http://127.0.0.1:'+server.address().port;
  }
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:1240,height:868},deviceScaleFactor:1,reducedMotion:'reduce',acceptDownloads:true});
  page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',error=>report.errors.push(error.message));
  await page.goto(base+'/?site=sternicza-11',{waitUntil:'domcontentloaded',timeout:SCENE_TIMEOUT});
  await q('#loading').waitFor({state:'hidden',timeout:SCENE_TIMEOUT});
  assert.equal(await q('meta[name="application-version"]').getAttribute('content'),version);
  await q('#scene-host canvas').waitFor({state:'visible',timeout:SCENE_TIMEOUT});
  await q('#scene-host').scrollIntoViewIfNeeded({timeout:SCENE_TIMEOUT});
  await page.waitForFunction(()=>{
    const d=document.querySelector('#render-diagnostics')?.dataset;
    return d?.renderer==='webgl'&&d.drawEnabled==='true'&&d.renderPending==='false'&&Number(d.frames)>0&&Number(d.triangles)>0&&
      Number(d.surfaceAssetsRequested)>0&&d.surfaceAssetsLoaded===d.surfaceAssetsRequested&&Number(d.surfaceAssetsFailed)===0;
  },undefined,{timeout:SCENE_TIMEOUT});
  check('Fresh Sternicza page renders the public WebGL model with all requested surface assets');
  // The normal style control performs first-time renovation adoption, including
  // the linked drawing-based exterior, decks and openings. Start every isolated
  // group through that same public transition before the helper shares it.
  await q('#designStyle').selectOption('warm-minimal',{timeout:SCENE_TIMEOUT});
  await q('#scene-host').scrollIntoViewIfNeeded({timeout:SCENE_TIMEOUT});
  await page.waitForFunction(()=>{
    const d=document.querySelector('#render-diagnostics')?.dataset;
    return document.querySelector('#designStyle')?.value==='warm-minimal'&&d?.renderedStyle==='warm-minimal'&&
      d.renderer==='webgl'&&d.drawEnabled==='true'&&d.renderPending==='false'&&Number(d.frames)>0&&Number(d.triangles)>0&&
      Number(d.surfaceAssetsRequested)>0&&d.surfaceAssetsLoaded===d.surfaceAssetsRequested&&Number(d.surfaceAssetsFailed)===0;
  },undefined,{timeout:SCENE_TIMEOUT});
  check('The public style selector adopts and finishes rendering the Warm Minimal renovation before capture');
  let completed=0;
  const captures=await captureOpenLivingViews(page,{group,shot,walking,openInteriors,exportDesign,timeout:SCENE_TIMEOUT,maxDurationMs:CAPTURE_BUDGET,
    onProgress:async progress=>{
      Object.assign(report,{views:progress.views,arrangements:progress.arrangements,daylight:progress.daylight,style:progress.style,
        expectedViews:progress.expectedViews,elapsedMs:progress.elapsedMs||0,setup:{original:progress.original,restoreUrl:progress.restoreUrl},basementPlan:progress.basementPlan||null});
      for(const view of progress.views.slice(completed))check('Rendered '+view.requestedLocal.id+' through public controls at the verified floor, room and camera position');
      completed=progress.views.length;await writeReport();
    }});
  assert.deepEqual(captures.views.map(view=>view.requestedLocal.id),[...LIVING_FITOUT_GROUPS[group]],'Every requested view in this group must be rendered');
  assert.equal(report.sceneCaptures.length,LIVING_FITOUT_GROUPS[group].length);
  assert.ok(captures.arrangements.length>0,'Public exports must verify the requested fit-outs and arrangement controls');
  assert.ok(captures.elapsedMs<=CAPTURE_BUDGET,'The capture group must remain within its 600 second budget');
  check('Every selected fit-out view passed its public export, fixed-lens, floor, room, position and settled-WebGL checks');
  assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){
  report.status='failed';report.error=error.stack||String(error);process.exitCode=1;console.error(report.error);
  if(page){
    try{report.failureState=await walkSnapshot();}catch(diagnosticError){report.failureStateError=String(diagnosticError);}
    try{await shot('failure');}catch{}
  }
}finally{
  await writeReport();await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));
  console.log('LIVING_FITOUT_RESULT '+group+' '+report.status);
}
