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
async function verifyPhotographicUpload(){
  // Force a real placeholder upload before the photograph finishes loading.
  // A decoded image count cannot detect a stale immutable GPU allocation.
  const result=await page.evaluate(async()=>{
    const THREE=await import(new URL('vendor/three.module.js',document.baseURI).href);
    const version=document.querySelector('meta[name="application-version"]').content;
    const assets=await import(new URL('src/material-assets.js?v='+version+'&upload-check',document.baseURI).href);
    const maps=assets.createPhotographicMaps('grass',{repeat:[1,1]}),clone=maps.map.clone();
    const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=1;
    const geometry=new THREE.PlaneGeometry(2,2),material=new THREE.MeshBasicMaterial({map:maps.map,toneMapped:false});
    scene.add(new THREE.Mesh(geometry,material));
    const renderers=[0,1].map(()=>new THREE.WebGLRenderer({antialias:false}));
    const targets=renderers.map(()=>new THREE.WebGLRenderTarget(64,64));
    const sample=(renderer,index)=>{
      material.map=index?clone:maps.map;material.needsUpdate=true;
      renderer.setRenderTarget(targets[index]);renderer.render(scene,camera);
      const pixels=new Uint8Array(64*64*4);renderer.readRenderTargetPixels(targets[index],0,0,64,64,pixels);
      let sum=0,sum2=0,min=255,max=0;
      for(let i=0;i<pixels.length;i+=4){const v=(pixels[i]+pixels[i+1]+pixels[i+2])/3;sum+=v;sum2+=v*v;min=Math.min(min,v);max=Math.max(max,v);}
      const mean=sum/(64*64);return {range:max-min,deviation:Math.sqrt(Math.max(0,sum2/(64*64)-mean*mean)),glError:renderer.getContext().getError()};
    };
    try{
      const before=renderers.map(sample);
      await new Promise((resolve,reject)=>{
        let stop;
        const timeout=setTimeout(()=>{stop?.();reject(Error('Photographic upload check timed out'));},30000);
        const ready=()=>{const d=assets.surfaceAssetDiagnostics();if(d.failed.length){clearTimeout(timeout);stop?.();reject(Error(d.failed.join(',')));}
          else if(d.requested===3&&d.loaded===3){clearTimeout(timeout);stop?.();resolve();}};
        stop=assets.onSurfaceAssetsChanged(ready);ready();
      });
      return {before,after:renderers.map(sample),imageSize:[maps.map.image.width,maps.map.image.height]};
    }finally{
      geometry.dispose();material.dispose();for(const texture of [...Object.values(maps),clone])texture.dispose();
      targets.forEach(target=>target.dispose());renderers.forEach(renderer=>{renderer.dispose();renderer.forceContextLoss();});
    }
  });
  for(const sample of result.before){assert.ok(sample.range<2,'Placeholder must be uniform before image loading');assert.equal(sample.glError,0);}
  for(const sample of result.after){assert.equal(sample.glError,0,'Photographic image must upload without GPU allocation errors');
    assert.ok(sample.range>30&&sample.deviation>5,'Photographic detail must reach both renderers, including an early clone');}
  assert.deepEqual(result.imageSize,[1024,1024]);report.photographicUpload=result;
  check('A photograph replaces the rendered placeholder in two independent GPU contexts and an early clone');
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

  await page.locator('#garage-view').click();await screenshot('after-modern-two-car-garage');
  assert.equal((await diagnostics()).garageVehicles,'2');
  await verifyPhotographicUpload();

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
