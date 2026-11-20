// Same camera and saved design before/after; screenshots are from the real app.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const baseline=process.env.RENDER_BASELINE?path.resolve(process.env.RENDER_BASELINE):null;
const output=path.join(root,'test-results','realism');await mkdir(output,{recursive:true});
const report={checks:[],screenshots:[],scenes:[],errors:[]};
const check=message=>{report.checks.push(message);console.log('REALISM_CHECK '+message);};
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'};
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost'),before=url.pathname.startsWith('/baseline/');
    const directory=before?baseline:path.join(root,'public');if(!directory)throw Error('No baseline');
    const pathname=decodeURIComponent(url.pathname.replace(/^\/(?:baseline|current)/,''));
    const file=path.resolve(directory,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
    if(!file.startsWith(directory+path.sep))throw Error('Invalid path');
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(await readFile(file));
  }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
let browser,page;
const diagnostics=()=>page.locator('#render-diagnostics').evaluate(el=>({...el.dataset}));
const screenshot=async name=>{
  await page.locator('#scene-host').scrollIntoViewIfNeeded();
  if(!name.startsWith('before-'))await page.waitForFunction(()=>{const d=document.querySelector('#render-diagnostics').dataset;
    return d.interacting==='false'&&d.surfaceAssetsLoaded===d.surfaceAssetsRequested;});
  await page.locator('#scene-host').screenshot({path:path.join(output,name+'.png'),animations:'disabled'});report.screenshots.push(name+'.png');
};
async function waitForAssets(){
  await page.waitForFunction(async()=>{
    const version=document.querySelector('meta[name="application-version"]').content;
    const module=await import(new URL('src/material-assets.js?v='+version,document.baseURI).href);
    const status=module.surfaceAssetDiagnostics();return status.loaded===status.requested&&status.requested>0;
  },null,{timeout:90000});
  const status=await page.evaluate(async()=>{const version=document.querySelector('meta[name="application-version"]').content;const m=await import(new URL('src/material-assets.js?v='+version,document.baseURI).href);return m.surfaceAssetDiagnostics();});
  assert.deepEqual(status.failed,[]);return status;
}
async function open(style,before=false,extra=''){
  await page.goto(base+(before?'/baseline/':'/current/')+'?site=sternicza-11#v=28&site=sternicza-11&designStyle='+style+'&styleHouseFinish=true&showDimensions=false&renderQuality=high'+extra,{waitUntil:'networkidle'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:90000});
  // The app intentionally opens an active garage study at the front entrance.
  // The comparison needs the rear garden overview shown in the user's request.
  if(!extra.includes('mode=eye'))await page.locator('button[data-mode="orbit"]').click();
  await page.locator('#scene-host').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>Number(document.querySelector('#render-diagnostics')?.dataset.frames)>0);
  if(!before){await waitForAssets();await page.waitForFunction(()=>document.querySelector('#render-diagnostics')?.dataset.contactShading==='true');}
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:1540,height:1100},deviceScaleFactor:1.5,reducedMotion:'reduce',acceptDownloads:true});
  page=await context.newPage();page.setDefaultTimeout(45000);
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  if(baseline){
    await open('hidden-bali',true);await screenshot('before-bali-overview');
    await page.locator('[data-mode="eye"]').click();await page.locator('[data-preset="terrace"]').click();await screenshot('before-bali-terrace');
    await open('hidden-bali',true,'&mode=eye&preset=garden&lookYaw=180&lookPitch=0&fov=60');await screenshot('before-bali-garden-house');
  }
  for(const style of ['hidden-bali','coastal','modern-minimal']){
    await open(style);await screenshot('after-'+style+'-overview');
    const stats=await diagnostics();assert.equal(stats.garageVehicles,'2');assert.equal(stats.contactShading,'true');
    report.scenes.push({style,...stats,assets:await waitForAssets()});
    if(style==='hidden-bali'){
      await page.locator('[data-mode="eye"]').click();await page.locator('[data-preset="terrace"]').click();await screenshot('after-bali-terrace');
      await page.locator('[data-preset="pool"]').click();await screenshot('after-bali-pool');
      report.pool=await diagnostics();assert.equal(report.pool.poolReflections,'true','Swimming-eye reflection must be active');
      await open('hidden-bali',false,'&mode=eye&preset=garden&lookYaw=180&lookPitch=0&fov=60');await screenshot('after-bali-garden-house');
    }
  }
  check('Bali, Coastal and Modern render photographic materials, contact shading and both cars');

  // Eco and a small-screen viewport must remain functional without the HDR/AO pass.
  await page.locator('.studio-details').evaluate(el=>el.open=true);
  await page.locator('#renderQuality').selectOption('eco');await page.locator('#scene-host').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('#render-diagnostics')?.dataset.contactShading==='false');
  assert.ok(Number((await diagnostics()).triangles)>1000);check('Eco renders the same design with its less expensive pipeline');
  await page.setViewportSize({width:390,height:844});await page.locator('#scene-host').scrollIntoViewIfNeeded();
  await screenshot('after-modern-mobile');assert.equal((await diagnostics()).contactShading,'false');
  check('Mobile renders successfully without desktop contact-shading buffers');

  await page.setViewportSize({width:1540,height:1100});
  await open('hidden-bali');await page.locator('#interior-open').click();
  const host=page.locator('#interior-host');await host.waitFor({state:'visible'});
  await host.locator('[data-iw="floor"]').selectOption('ground');
  await host.locator('[data-iw="room"]').selectOption('lounge');
  await host.locator('button[data-view="room"]').click();
  await page.waitForFunction(()=>document.querySelector('#interior-host')?.getInteriorDiagnostics?.().scene?.frames>0);
  await waitForAssets();
  await page.waitForFunction(()=>document.querySelector('#interior-host')?.getInteriorDiagnostics?.().scene?.contactShading);
  await host.locator('[data-iw="canvas"] canvas').screenshot({path:path.join(output,'after-bali-interior.png')});report.screenshots.push('after-bali-interior.png');
  report.interior=await host.evaluate(el=>el.getInteriorDiagnostics());
  check('Interior receives the same photographic surfaces and contact shading');
  assert.deepEqual(report.errors,[],'Browser/shader errors');
}catch(error){report.failure=error.stack;try{await page?.screenshot({path:path.join(output,'failure.png')});}catch{};throw error;}
finally{await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser?.close();await new Promise(r=>server.close(r));}
