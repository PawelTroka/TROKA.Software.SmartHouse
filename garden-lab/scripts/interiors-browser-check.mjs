// Exercise the same controls, persisted settings and real 3D canvas used on Pages.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {getInteriorPlan} from '../src/interior-plan.js';
import {checkFullscreenRoundtrip,checkFullscreenFallback,checkFullscreenHandoff} from './fullscreen-browser-helpers.mjs';
import {captureOpenLivingViews} from './open-living-browser-helpers.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'test-results','interiors');
await mkdir(output,{recursive:true});
const version=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version;
const report={version,checks:[],screenshots:[],plans:[],styles:[],errors:[]};
const check=label=>{report.checks.push(label);console.log('INTERIOR_CHECK '+label);};
let browser,server,page,base=process.env.BASE_URL?.replace(/\/$/,'');
const q=selector=>page.locator(selector);
const field=id=>q(`#interior-host [data-iw="${id}"]`);
const info=()=>q('#interior-host').evaluate(host=>host.getInteriorDiagnostics());
// Re-entering the studio creates a fresh WebGL context. Its first software
// frame can exceed the ordinary 20-second UI-action deadline on CI.
const sceneStartupTimeout=120000;
const ready=(timeout=20000)=>page.waitForFunction(()=>document.querySelector('#interior-host:not([hidden])')?.getInteriorDiagnostics?.().visible,undefined,{timeout});
async function chooseLayout(layout){await q(`#interior-host button[data-layout="${layout}"]`).click();}
async function chooseView(view){
  await rendered(null,null,{timeout:sceneStartupTimeout});
  const button=q(`#interior-host button[data-view="${view}"]`);
  if(view!=='room'&&await button.getAttribute('aria-pressed')==='true')return;
  await button.click({timeout:view==='dollhouse'?sceneStartupTimeout:20000});
}
async function rendered(style,view,{timeout=30000}={}){
  await page.waitForFunction(({style,view})=>{
    const host=document.querySelector('#interior-host'),d=host?.getInteriorDiagnostics?.(),s=d?.scene;
    const requestedView=view||host?.querySelector('button[data-view][aria-pressed="true"]')?.dataset.view;
    if(requestedView==='plan')return d?.visible&&host.dataset.view==='plan'&&Boolean(host.querySelector('[data-iw="plan"] svg'));
    const assets=s?.surfaceAssets;
    return s?.available&&s.visible&&s.styleId===(style||host.dataset.style)&&s.view===requestedView&&s.floor===host.dataset.floor&&s.layout===host.dataset.layout&&s.frames>0&&!s.framePending&&!s.interacting&&s.triangles>0&&
      assets?.requested>0&&assets.loaded===assets.requested&&assets.failed.length===0;
  },{style,view},{timeout});
  return (await info()).scene;
}
async function shot(name,selector){
  const node=selector?q(selector):page;
  const file=name+'.png';
  await node.screenshot({path:path.join(output,file),scale:'css',animations:'disabled',timeout:sceneStartupTimeout});
  report.screenshots.push(file);
}
async function cameraFrame(){return field('canvas').locator('canvas').screenshot({scale:'css',animations:'disabled',timeout:sceneStartupTimeout});}
const walkCanvas=()=>q('#scene-host canvas');
const walkSnapshot=()=>page.evaluate(()=>({
  walk:{...document.querySelector('#scene-host canvas')?.dataset},
  render:{...document.querySelector('#render-diagnostics')?.dataset},
}));
async function walking(floor,{timeout=30000,settled=false,afterFrame=null}={}){
  await q('#interior-host').waitFor({state:'hidden'});
  await page.waitForFunction(({floor,settled,afterFrame})=>{
    const canvas=document.querySelector('#scene-host canvas'),d=document.querySelector('#render-diagnostics')?.dataset;
    const target=Number(canvas?.dataset.walkPosition?.split(',')[1]),altitude=Number(canvas?.dataset.walkAltitude);
    const heightReady=!settled||(canvas?.dataset.walkFloating==='false'&&Number.isFinite(target)&&Number.isFinite(altitude)&&Math.abs(altitude-target)<=.002&&d?.interacting==='false');
    return canvas?.dataset.walkFloor===floor&&canvas.dataset.walkPosition&&d?.drawEnabled==='true'&&d.renderPending==='false'&&heightReady&&
      (afterFrame===null||Number(d.frames)>afterFrame)&&Number(d.triangles)>0&&Number(d.surfaceAssetsRequested)>0&&d.surfaceAssetsLoaded===d.surfaceAssetsRequested&&Number(d.surfaceAssetsFailed)===0;
  },{floor,settled,afterFrame},{timeout});
  assert.equal(await q('#viewer .mode-tabs button[data-mode="walk"]').getAttribute('aria-pressed'),'true');
  assert.equal(await q('#walk-location').inputValue(),floor);
  assert.match(await walkCanvas().getAttribute('aria-label'),/WASD or arrows/);
  return walkCanvas().evaluate(canvas=>({floor:canvas.dataset.walkFloor,position:canvas.dataset.walkPosition.split(',').map(Number)}));
}
async function openInteriors(){
  await q('#interior-open').click({timeout:sceneStartupTimeout});await ready(sceneStartupTimeout);
  await rendered(null,null,{timeout:sceneStartupTimeout});
}
async function stepWithKeys(){
  let distance=0;
  for(const key of ['a','ArrowUp','d','ArrowDown']){
    const before=(await walkCanvas().getAttribute('data-walk-position')).split(',').map(Number);
    await walkCanvas().focus();await page.keyboard.down(key);await page.waitForTimeout(280);await page.keyboard.up(key);
    const after=(await walkCanvas().getAttribute('data-walk-position')).split(',').map(Number);
    distance+=Math.hypot(after[0]-before[0],after[2]-before[2]);
  }
  assert.ok(distance>.08,`WASD / arrow input moved only ${distance} m`);return distance;
}
async function pixels(a,b){
  return page.evaluate(async pair=>{
    const decode=async str=>{const img=new Image();img.src='data:image/png;base64,'+str;await img.decode();const c=new OffscreenCanvas(img.width,img.height),ctx=c.getContext('2d');ctx.drawImage(img,0,0);return ctx.getImageData(0,0,c.width,c.height);};
    const [a,b]=await Promise.all(pair.map(decode));
    if(a.width!==b.width||a.height!==b.height)throw new Error('Interior camera frame resized');
    let changed=0;for(let i=0;i<a.data.length;i+=4)if(Math.max(Math.abs(a.data[i]-b.data[i]),Math.abs(a.data[i+1]-b.data[i+1]),Math.abs(a.data[i+2]-b.data[i+2]))>15)changed++;
    return {changed,fraction:changed/(a.width*a.height)};
  },[a.toString('base64'),b.toString('base64')]);
}
async function exportDesign(){const pending=page.waitForEvent('download');await q('#export').click();return JSON.parse(await readFile(await (await pending).path(),'utf8'));}
function polygonArea(points){return Math.abs(points.reduce((sum,p,i)=>{const next=points[(i+1)%points.length];return sum+p[0]*next[1]-next[0]*p[1];},0))/2;}
function assertBalconyShared(exported,depth){
  const plan=exported.interiors.floors.first,deck=plan.outdoor.find(p=>p.kind==='balcony'),cover=exported.terraceCover;
  assert.ok(deck,'The first-floor plan must contain the actual exterior balcony');assert.equal(deck.depth,depth);
  assert.equal(cover.type,'balcony');assert.equal(cover.enabled,true);assert.equal(cover.accessFits,true);
  assert.ok(Math.abs(polygonArea(deck.polygon)-cover.area)<1e-6,'Interior/exterior deck areas must agree');
  assert.ok(Math.abs(cover.bounds.y1-cover.bounds.y0-depth)<1e-6);assert.ok(Math.abs(cover.bounds.x1-cover.bounds.x0-10.77)<1e-6);
  const doors=plan.walls.flatMap(w=>w.openings).filter(o=>o.type==='balcony-door');assert.equal(doors.length,3);assert.equal(cover.accesses.length,3);
}
async function appState(){return q('#interior-host').evaluate(h=>{
  const get=id=>h.querySelector(`[data-iw="${id}"]`);
  return {floor:get('floor').value,layout:h.querySelector('button[data-layout][aria-pressed="true"]').dataset.layout,
    requestedView:h.querySelector('button[data-view][aria-pressed="true"]').dataset.view,room:get('room').value,
    style:get('style').value,furniture:get('furniture').checked,changes:get('changes').checked};
});}
try{
  if(!base){
    const publicDir=path.join(root,'public'),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'};
    server=createServer(async(req,res)=>{
      try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(publicDir,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
        if(!file.startsWith(publicDir+path.sep))throw new Error('Invalid path');
        const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
      }catch{res.writeHead(404);res.end();}
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    base='http://127.0.0.1:'+server.address().port;
  }
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-dev-shm-usage']});
  const ctx=await browser.newContext({viewport:{width:1240,height:868},deviceScaleFactor:1,reducedMotion:'reduce',acceptDownloads:true});
  page=await ctx.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(base+'/?site=sternicza-11#v=27&site=sternicza-11&mode=plan&interiorEnabled=true&interiorView=plan',{waitUntil:'domcontentloaded'});
  await ready();assert.equal(await q('meta[name="application-version"]').getAttribute('content'),version);
  assert.equal(await q('#workspace').evaluate(node=>node.inert),true,'Hidden garden controls must not intercept keyboard navigation');
  assert.equal(await field('canvas').locator('canvas').count(),0);
  assert.equal(await page.evaluate(()=>performance.getEntriesByType('resource').some(e=>new URL(e.name).pathname.endsWith('/scene-interior.js'))),false);
  check('Opening a shared floor plan creates no interior WebGL context or renderer import');

  const planFullscreen={target:'#interior-host',button:'#interior-host [data-iw="fullscreen"]',surface:'#interior-host [data-iw="plan"] svg',settle:()=>rendered(null,'plan',{timeout:sceneStartupTimeout})};
  report.fullscreen={plan:await checkFullscreenRoundtrip(page,{...planFullscreen,expectedMode:'native'}),fallback:await checkFullscreenFallback(page,planFullscreen)};
  assert.equal(await field('canvas').locator('canvas').count(),0);
  assert.equal(await page.evaluate(()=>performance.getEntriesByType('resource').some(e=>new URL(e.name).pathname.endsWith('/scene-interior.js'))),false);
  check('Fullscreen and the unsupported-API fallback expand the existing floor plan, preserve lazy rendering, and restore its size and focus on Escape');

  await field('floor').selectOption('basement');
  assert.equal(await field('garage').isChecked(),true,'Sparse garage-era links restore the requested two-car proposal');
  for(const id of ['coastal','current','coastal']){
    await field('style').selectOption(id);
    assert.equal(await field('garage').isChecked(),true);
    assert.equal(await field('plan').locator('[data-iw-fixture^="car-"]').count(),2);
    await chooseLayout('existing');
    assert.equal((await appState()).layout,'existing','The layout buttons describe the dwelling, independently of the garage');
    assert.equal(await field('garage').isChecked(),true,'Original drawings must never remove the garage proposal');
    assert.equal(await field('plan').locator('[data-iw-fixture^="car-"]').count(),2);
  }
  await field('floor').selectOption('ground');assert.equal(await field('garage').isVisible(),true);
  await field('garage').uncheck();
  check('Coastal, Current and Original drawings retain two cars; the independent garage switch remains available on every floor');

  for(const layout of ['existing','renovation']){
    await chooseLayout(layout);
    assert.equal((await appState()).style,layout==='existing'?'current':'hidden-bali');
    if(layout==='renovation')await field('changes').check();
    for(const floor of ['ground','first','basement','attic']){
      await field('floor').selectOption(floor);
      const plan=field('plan'),zones=await plan.locator('[data-iw-room]').count();
      assert.ok(zones>0);assert.equal(await field('room').locator('option').count(),zones);
      assert.equal(await field('schedule').locator('tr').count(),zones);
      assert.match(await plan.textContent(),/10\.77 m/);assert.match(await plan.textContent(),/9\.00 m/);
      if(['ground','first'].includes(floor)){assert.ok(await plan.locator('.iw-door path').count()>0);assert.ok(await plan.locator('.iw-glazing').count()>0);}
      if(layout==='existing')assert.equal(await plan.locator('.iw-wall-removed').count(),0);
      if(layout==='renovation'&&floor==='first'){
        assert.ok(await plan.locator('.iw-wall-new').count()>0);assert.ok(await plan.locator('.iw-wall-removed').count()>0);
        assert.deepEqual((await field('room').locator('option').evaluateAll(nodes=>nodes.map(n=>n.value))).sort(),['master','office','guest-1','hall','guest-2','guest-3','wardrobe','spa-bath','sauna'].sort());
        await shot('first-floor-renovation-plan');
      }
      if(layout==='renovation'&&floor==='basement'){
        assert.equal(await field('garage').isChecked(),false);assert.equal(await field('conflict').isVisible(),false);
        await field('garage').check();
        assert.ok(await field('conflict').isVisible());assert.ok(await plan.locator('.iw-conflict').count()>=2);
        await shot('basement-conversion-conflicts');
        await field('garage').uncheck();assert.equal(await field('conflict').isVisible(),false);
      }
      if(floor==='attic')assert.ok(await plan.locator('.iw-headroom').count()>=3);
      report.plans.push({layout,floor,zones});
    }
  }
  check('Original and renovated plans expose schedules, openings and headroom; the explicit shared two-car switch reveals retained garage conflicts');
  await field('floor').selectOption('ground');
  await field('plan').locator('[data-iw-room="lounge"][role="button"]').focus();await page.keyboard.press('Enter');assert.equal(await field('room').inputValue(),'lounge');
  await field('zoom-in').click();assert.equal(await field('drawing').getAttribute('data-zoomed'),'true');await field('zoom-fit').click();
  await field('changes').uncheck();await field('style').selectOption('current');await chooseView('dollhouse');
  await rendered('current','dollhouse');
  report.models=[];
  for(const layout of ['existing','renovation']){
    await chooseLayout(layout);
    for(const floor of ['ground','first','basement','attic']){
      await field('floor').selectOption(floor);
      const model=await rendered(layout==='existing'?'current':'hidden-bali','dollhouse');
      assert.equal(model.layout,layout);assert.equal(model.floor,floor);
      assert.ok(model.wallCount>0&&model.meshes>0&&model.drawCalls>0);
      assert.equal(model.contextSource,'shared-site-model');
      report.models.push({floor,layout,meshes:model.meshes,triangles:model.triangles});
    }
  }
  check('Current renders the original dwelling and chosen styles render its renovation on all four floors using the actual shared site context');
  await field('floor').selectOption('ground');await field('style').selectOption('current');
  const original=await rendered('current','dollhouse'),originalFrame=await cameraFrame();assert.equal(original.layout,'existing');assert.deepEqual(original.renovationFeatures,[]);
  await field('style').selectOption('hidden-bali');await field('room').selectOption('lounge');
  const ref=await rendered('hidden-bali','dollhouse');assert.ok(ref.drawCalls>0&&ref.furnitureCount>0);assert.equal(ref.layout,'renovation');
  assert.equal(await field('apply-exterior').isDisabled(),true,'The marked terrace/balcony must be linked automatically');
  const ids=await field('style').locator('option').evaluateAll(nodes=>nodes.map(n=>n.value).filter(v=>v!=='follow'));
  assert.equal(new Set(ids).size,35);assert.ok(ids.includes('coastal'));assert.ok(ids.includes('beach-house'));
  const geometryCounts=new Set(),featureSets=new Set();
  for(const id of ids.filter(id=>id!=='current')){
    await field('style').selectOption(id);const s=await rendered(id,'dollhouse');
    assert.equal(s.floor,ref.floor);assert.equal(s.layout,ref.layout);assert.equal(s.wallCount,ref.wallCount);
    const expectedPlan=getInteriorPlan({floor:s.floor,layout:s.layout,styleId:id});
    assert.equal(s.furnitureCount,expectedPlan.fixtures.length,`${id}: rendered furniture must match its own curated plan`);
    assert.equal(s.renovationFeatures.length,3);assert.equal(s.contextSource,'shared-site-model');
    geometryCounts.add(s.triangles);featureSets.add(JSON.stringify(s.renovationFeatures));
    const item={id,meshes:s.meshes,triangles:s.triangles,furnitureCount:s.furnitureCount,expectedFurnitureCount:expectedPlan.fixtures.length,features:s.renovationFeatures};
    if(['japandi','space-age','hidden-bali','coastal','beach-house','nordic-minimal','warm-minimal','organic-limestone','bali-stone'].includes(id)){
      item.difference=await pixels(originalFrame,await cameraFrame());assert.ok(item.difference.changed>150,JSON.stringify(item));
      await shot('ground-'+id+'-dollhouse');
    }
    report.styles.push(item);
  }
  assert.ok(geometryCounts.size>=11,`Styles changed only ${geometryCounts.size} actual triangle counts`);assert.equal(featureSets.size,34);
  const major=report.styles.filter(s=>['hidden-bali','japandi','space-age','coastal'].includes(s.id));assert.equal(new Set(major.map(s=>s.triangles)).size,4);
  assert.notEqual(report.styles.find(s=>s.id==='coastal').triangles,report.styles.find(s=>s.id==='baltic-dune').triangles,'Coastal is a distinct physical interior, not another name for Baltic Dune');
  for(const id of ['coastal','baltic-dune'])assert.notEqual(report.styles.find(s=>s.id==='beach-house').triangles,report.styles.find(s=>s.id===id).triangles,'Beach House has its own physical furniture and composition');
  await field('style').selectOption('current');await rendered('current','dollhouse');
  report.restoration=await pixels(originalFrame,await cameraFrame());assert.ok(report.restoration.fraction<.004,JSON.stringify(report.restoration));
  check('All 34 renovations have physical features and varied rendered geometry; Beach House, Coastal and Baltic Dune are distinct, and Current restores the original layout/image');
  await field('furniture').uncheck();assert.equal((await rendered('current','dollhouse')).furnitureCount,0);await field('furniture').check();
  await field('style').selectOption('beach-house');await field('floor').selectOption('ground');await field('room').selectOption('lounge');
  report.fullscreen.handoff=await checkFullscreenHandoff(page,{fromButton:'#interior-host [data-iw="fullscreen"]',nextTarget:'#viewer',action:()=>field('enter').click(),settle:({afterFrame=null}={})=>walking('ground',{timeout:sceneStartupTimeout,settled:true,afterFrame})});
  const beach=await walking('ground');
  assert.match(await q('#walk-status').textContent(),/Living room/);
  assert.equal(await q('#workspace').evaluate(node=>node.inert),false);
  assert.equal(await field('canvas').locator('canvas').count(),0,'The room handoff releases the separate interior WebGL context');
  await shot('ground-beach-house-living-walk','#scene-host canvas');
  report.walking={ground:beach,keyboardDistance:await stepWithKeys()};
  check('Room entry opens the full house-and-garden walker, releases the room renderer and responds to WASD and arrow keys');
  await walking('ground',{timeout:sceneStartupTimeout,settled:true});
  report.fullscreen.walk=await checkFullscreenRoundtrip(page,{settle:({afterFrame})=>walking('ground',{timeout:sceneStartupTimeout,settled:true,afterFrame}),onExpanded:()=>shot('desktop-fullscreen-walk','#viewer')});
  check('Interior-to-walking handoff keeps fullscreen; desktop entry and Escape retain the same camera, lens, canvas and keyboard walking mode');
  await openInteriors();await chooseView('dollhouse');await rendered('beach-house','dollhouse');
  await field('style').selectOption('japandi');await field('floor').selectOption('first');await field('room').selectOption('master');
  await field('enter').click();const eye=await walking('first');assert.match(await q('#walk-status').textContent(),/Main bedroom|Master|Bedroom/i);
  assert.ok(eye.position[1]>beach.position[1]+2.5);
  await shot('first-floor-master-eye-level');
  await openInteriors();await field('room').selectOption('spa-bath');await chooseView('room');const spa=await walking('first');
  assert.notDeepEqual(spa.position,eye.position);await shot('first-floor-hydromassage-bath-walk','#scene-host canvas');
  await openInteriors();await chooseView('dollhouse');await rendered('japandi','dollhouse');await shot('first-floor-japandi-dollhouse');
  await field('floor').selectOption('ground');await field('room').selectOption('bathroom');await chooseView('room');
  await walking('ground');assert.match(await q('#walk-status').textContent(),/bathroom/i);await shot('ground-soaking-bath-eye-level');
  for(const floor of ['basement','attic','first','ground','garden']){
    await q('#walk-location').selectOption(floor);await q('#walk-start').click();
    report.walking[floor]=await walking(floor);
  }
  assert.ok(report.walking.attic.position[1]>report.walking.first.position[1]+2.4);
  assert.ok(report.walking.basement.position[1]<report.walking.ground.position[1]-1.5);
  check('The walking location control reaches basement, living floor, first floor, attic and garden in the same visible scene');

  assert.equal(await q('#walkNavigation').inputValue(),'free');
  assert.equal(await walkCanvas().getAttribute('data-walk-navigation'),'free');
  assert.equal(Number(await walkCanvas().getAttribute('data-walk-fov')),70);
  const beforeRise=Number(await walkCanvas().getAttribute('data-walk-altitude'));
  report.walking.comfort={beforeRise,beforeHeightControls:await walkSnapshot()};
  await walkCanvas().focus();await page.keyboard.down('e');
  try{await page.waitForFunction(before=>{
    const d=document.querySelector('#scene-host canvas')?.dataset;
    return d?.walkFloating==='true'&&Number(d.walkAltitude)>before+.03;
  },beforeRise,{timeout:30000});}finally{await page.keyboard.up('e');}
  const raised=Number(await walkCanvas().getAttribute('data-walk-altitude'));
  report.walking.comfort.raised=raised;
  await page.keyboard.down('q');
  try{await page.waitForFunction(before=>Number(document.querySelector('#scene-host canvas')?.dataset.walkAltitude)<before-.03,raised,{timeout:30000});}
  finally{await page.keyboard.up('q');}
  const beforeGround=await walkSnapshot();report.walking.comfort.beforeGround=beforeGround;
  await page.keyboard.press('r');
  await page.waitForFunction(()=>document.querySelector('#scene-host canvas')?.dataset.walkFloating==='false');
  // The comfortable controller caps each advance at 56 ms. Under SwiftShader,
  // the several frames needed to settle even a small height offset can take
  // longer than 30 seconds. Keep its real camera/idle checks and give only this
  // transition the existing software-render deadline used for fresh scenes.
  await walking('garden',{timeout:sceneStartupTimeout,settled:true,afterFrame:Number(beforeGround.render.frames)});
  report.walking.comfort.grounded=await walkSnapshot();
  const lookBefore=await walkCanvas().evaluate(c=>({yaw:Number(c.dataset.walkYaw),pitch:Number(c.dataset.walkPitch)}));
  const viewBox=await walkCanvas().boundingBox();assert.ok(viewBox);
  const dragX=viewBox.x+viewBox.width/2,dragY=viewBox.y+viewBox.height/2;
  await page.mouse.move(dragX,dragY);await page.mouse.down();await page.mouse.move(dragX+40,dragY-20,{steps:4});await page.mouse.up();
  const lookAfter=await walkCanvas().evaluate(c=>({yaw:Number(c.dataset.walkYaw),pitch:Number(c.dataset.walkPitch)}));
  assert.ok(Math.abs((lookAfter.yaw-lookBefore.yaw)-40*.0043*180/Math.PI)<.02,'Right drag must use the original interior direction and sensitivity');
  assert.ok(Math.abs((lookAfter.pitch-lookBefore.pitch)-20*.0043*180/Math.PI)<.02,'Upward drag must look up with the original interior sensitivity');
  await page.mouse.wheel(0,200);
  assert.equal(Number(await walkCanvas().getAttribute('data-walk-fov')),70,'Walking lens stays fixed during scrolling');
  await q('#walkNavigation').selectOption('physical');
  assert.equal(await walkCanvas().getAttribute('data-walk-navigation'),'physical');
  assert.equal(await q('.walk-elevation-pad').isVisible(),false);
  await q('#walkNavigation').selectOption('free');
  assert.equal(await walkCanvas().getAttribute('data-walk-navigation'),'free');
  assert.equal(await q('.walk-elevation-pad').isVisible(),true);
  Object.assign(report.walking.comfort,{lookBefore,lookAfter,fov:70});
  check('Free exploration is the default; E/Q change height, R follows ground, drag matches the original interior controller, the lens stays fixed, and physical mode remains optional');

  await openInteriors();await field('floor').selectOption('first');await field('room').selectOption('office');await chooseView('dollhouse');
  const office=await rendered('japandi','dollhouse'),parked=office.frames,background=await q('#render-diagnostics').getAttribute('data-frames');
  await page.waitForTimeout(240);assert.equal((await info()).scene.frames,parked);assert.equal(await q('#render-diagnostics').getAttribute('data-frames'),background);
  check('Returning to the dollhouse preserves the selected floor, releases walking input and leaves both renderers idle');
  await field('changes').check();await field('room').selectOption('master');await field('furniture').uncheck();
  const saved=await appState();await q('#save-a').click();await chooseLayout('existing');await q('#compare').click();assert.deepEqual(await appState(),saved);
  await q('#compare').click();assert.equal((await appState()).layout,'existing');await q('#compare').click();assert.deepEqual(await appState(),saved);
  await q('#share').click();await page.waitForFunction(()=>location.hash.includes('interiorRoomId=master')&&location.hash.includes('designStyle=japandi'));
  const shared=page.url();await page.reload({waitUntil:'domcontentloaded'});await ready(sceneStartupTimeout);assert.deepEqual(await appState(),saved);
  await page.evaluate(()=>history.replaceState(null,'',location.pathname+location.search));await page.reload({waitUntil:'domcontentloaded'});await ready(sceneStartupTimeout);assert.deepEqual(await appState(),saved);
  check('Save A, return to B, shared links and local reload preserve the whole-house style and interior navigation settings');
  assert.equal(await field('apply-exterior').isDisabled(),true);
  await field('close').click();await q('#interior-host').waitFor({state:'hidden'});assert.equal(await field('canvas').locator('canvas').count(),0);
  assert.equal(await q('#workspace').evaluate(node=>node.inert),false,'Returning to the garden restores its controls');
  const exported=await exportDesign();
  for(const [key,value] of Object.entries({planExteriorApplied:true,firstFloorRise:3.05,terraceDepth:4,canopyDepth:4,terraceWidth:10.77,canopyWidth:10.77,designStyle:'japandi',interiorStyle:'follow',interiorRoomId:'master'}))assert.equal(exported.settings[key],value,key);
  assertBalconyShared(exported,4);
  const ground=exported.interiors.floors.ground.fixtures,upper=exported.interiors.floors.first.fixtures,find=(items,kind)=>items.filter(f=>f.kind===kind);
  assert.equal(find(ground,'tub').length,1);assert.equal(find(ground,'tub')[0].variant,'soaking');assert.equal(find(ground,'hotTub').length,0);
  assert.equal(find(ground,'basin').length,1);assert.equal(find(ground,'basin')[0].basins,2);assert.equal(find(ground,'bidet').length,1);assert.equal(find(ground,'toilet').length,1);assert.equal(find(ground,'shower').length,1);
  assert.equal(find(upper,'hotTub').length,0);assert.equal(find(upper,'tub').length,1);assert.equal(find(upper,'bidet').length,0);
  const hydroBath=find(upper,'tub')[0];for(const key of ['jets','hydromassage'])assert.equal(hydroBath[key],true);assert.equal(hydroBath.lights,false);assert.equal(hydroBath.variant,'whirlpool');assert.equal(hydroBath.width,.90);assert.equal(hydroBath.depth,1.80);assert.equal(hydroBath.height,.62);
  assert.equal(find(upper,'basin').length,1);assert.equal(find(upper,'basin')[0].basins,1);assert.equal(find(upper,'shower')[0].heads,2);assert.equal(find(upper,'toilet').length,1);
  report.bathrooms={ground:ground.filter(f=>f.roomId==='bathroom').map(f=>f.kind),first:upper.filter(f=>f.roomId==='spa-bath').map(f=>f.kind)};
  check('Exports contain the ground soaking bath and a compact 0.90 × 1.80 m upstairs hydromassage bath; both views share the 4 m balcony and all 3 doors');
  await q('#canopyDepth-value').fill('3.2');await q('#canopyDepth-value').press('Tab');
  const edited=await exportDesign();assertBalconyShared(edited,3.2);
  await openInteriors();assert.equal(await field('apply-exterior').isDisabled(),false);
  await chooseView('dollhouse');const changed=await rendered('japandi','dollhouse');assert.equal(changed.contextSource,'shared-site-model');
  await field('apply-exterior').click();assert.equal(await field('apply-exterior').isDisabled(),true);
  await field('close').click();await q('#interior-host').waitFor({state:'hidden'});assertBalconyShared(await exportDesign(),4);
  check('Changing balcony depth outdoors updates the actual interior plan; restoring marked decks updates both views together');

  report.openLiving=await captureOpenLivingViews(page,{shot,walking,openInteriors,timeout:sceneStartupTimeout});
  check('Daylight ceiling-fitted kitchen storage, concealed chimney, open stair guard, compact gym and plant/laundry captured through public room and camera controls');

  await page.setViewportSize({width:390,height:844});await page.goto(shared,{waitUntil:'domcontentloaded'});await ready(sceneStartupTimeout);
  await chooseView('plan');await field('floor').selectOption('ground');await field('settings').click();
  await field('style').selectOption('hidden-bali');await field('furniture').check();await field('hide-settings').click();await field('room').selectOption('lounge');
  assert.equal(await field('floor').inputValue(),'ground');assert.equal((await appState()).style,'hidden-bali');
  const size=await page.evaluate(()=>({screen:innerWidth,width:document.documentElement.scrollWidth,drawing:Math.round(document.querySelector('.iw-drawing').getBoundingClientRect().height),host:document.querySelector('#interior-host').getBoundingClientRect().bottom,height:innerHeight}));
  assert.ok(size.width<=size.screen+1&&size.drawing>260&&size.host<=size.height+1,JSON.stringify(size));report.mobile=size;
  report.fullscreen.mobilePlan=await checkFullscreenRoundtrip(page,{...planFullscreen,onExpanded:async()=>{
    await field('settings').click();
    const first=q('#interior-host button').first();await first.focus();await page.keyboard.press('Shift+Tab');
    assert.equal(await first.evaluate(node=>node===document.activeElement),false,'Backward Tab must move off the first control');
    assert.equal(await field('inspector').evaluate(node=>node.contains(document.activeElement)),true,'Backward Tab wraps to a visible inspector control');
    assert.equal(await page.evaluate(()=>getComputedStyle(document.activeElement).visibility),'visible','Backward Tab must skip the hidden mobile drawing controls');
    await field('hide-settings').click();await shot('mobile-fullscreen-plan','#interior-host');
  }});
  await shot('mobile-floor-plan');await chooseView('dollhouse');await rendered('hidden-bali','dollhouse');await shot('mobile-dollhouse');
  await chooseView('room');await walking('ground');
  const pad=q('#scene-host .walk-pad');assert.equal(await pad.isVisible(),true);assert.equal(await pad.locator('button').count(),4);
  let padDistance=0;
  for(const label of ['Walk forward','Step left','Step back','Step right']){
    const button=pad.getByRole('button',{name:label,exact:true}),bounds=await button.boundingBox();assert.ok(bounds);
    assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390&&bounds.height>=40,'Walk controls must fit the narrow screen with usable touch targets');
    const before=(await walkCanvas().getAttribute('data-walk-position')).split(',').map(Number);
    await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down();await page.waitForTimeout(350);await page.mouse.up();
    const after=(await walkCanvas().getAttribute('data-walk-position')).split(',').map(Number);padDistance+=Math.hypot(after[0]-before[0],after[2]-before[2]);
  }
  assert.ok(padDistance>.08,`On-screen walking controls moved only ${padDistance} m`);report.mobile.padDistance=padDistance;

  const elevation=q('#scene-host .walk-elevation-pad');assert.equal(await elevation.isVisible(),true);
  assert.equal(await elevation.locator('button').count(),3);
  for(const direction of ['up','down']){
    const button=elevation.locator(`[data-walk-elevation="${direction}"]`),bounds=await button.boundingBox();assert.ok(bounds);
    assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390&&bounds.height>=40,'Elevation controls must fit the mobile screen');
    const before=Number(await walkCanvas().getAttribute('data-walk-altitude'));
    await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down();
    try{await page.waitForFunction(({before,direction})=>{
      const d=document.querySelector('#scene-host canvas')?.dataset,delta=Number(d?.walkAltitude)-before;
      return d?.walkFloating==='true'&&(direction==='up'?delta>.02:delta<-.02);
    },{before,direction},{timeout:30000});}finally{await page.mouse.up();}
  }
  await elevation.locator('[data-walk-elevation="follow"]').click();
  assert.equal(await walkCanvas().getAttribute('data-walk-floating'),'false');
  assert.equal(await elevation.locator('[data-walk-elevation="follow"]').getAttribute('aria-pressed'),'true');
  await shot('mobile-house-garden-walk');
  await walking('ground',{timeout:sceneStartupTimeout,settled:true});
  report.fullscreen.mobileWalk=await checkFullscreenRoundtrip(page,{settle:({afterFrame})=>walking('ground',{timeout:sceneStartupTimeout,settled:true,afterFrame}),onExpanded:async()=>{
    for(const selector of ['#viewer-fullscreen','#walk-location','#walkNavigation','#scene-host .walk-pad button','#scene-host .walk-elevation-pad button']){
      for(const node of await q(selector).all()){
        const bounds=await node.boundingBox();assert.ok(bounds,`${selector} is visible in mobile fullscreen`);
        assert.ok(bounds.x>=-1&&bounds.y>=-1&&bounds.x+bounds.width<=391&&bounds.y+bounds.height<=845,`${selector} fits inside mobile fullscreen: ${JSON.stringify(bounds)}`);
      }
    }
    await shot('mobile-fullscreen-walk','#viewer');
  }});
  check('390 px plan, dollhouse and unified walk fit the viewport; all four direction buttons and the rise, lower and ground-following controls are reachable and move the camera');
  check('Mobile fullscreen keeps the model, location/navigation selectors and all seven walking controls inside the screen, with visible keyboard focus and a stable camera');
  assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){
  report.status='failed';report.error=error.stack||String(error);process.exitCode=1;console.error(report.error);
  if(page){
    try{report.failureState=await walkSnapshot();}catch(diagnosticError){report.failureStateError=String(diagnosticError);}
    try{await shot('failure');}catch{}
  }
}
finally{await writeFile(path.join(output,'browser-report.json'),JSON.stringify(report,null,2));await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));console.log('INTERIOR_RESULT '+report.status);}
