// Exercise the same controls, persisted settings and real 3D canvas used on Pages.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

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
const ready=()=>page.waitForFunction(()=>document.querySelector('#interior-host:not([hidden])')?.getInteriorDiagnostics?.().visible);
async function chooseLayout(layout){await q(`#interior-host button[data-layout="${layout}"]`).click();}
async function chooseView(view){await q(`#interior-host button[data-view="${view}"]`).click();}
async function rendered(style,view){
  await page.waitForFunction(({style,view})=>{
    const d=document.querySelector('#interior-host')?.getInteriorDiagnostics?.(), s=d?.scene;
    return s?.available&&s.visible&&s.styleId===style&&s.view===view&&s.frames>0&&!s.framePending&&s.triangles>0;
  },{style,view},{timeout:30000});
  return (await info()).scene;
}
async function shot(name,selector){
  const node=selector?q(selector):page;
  const file=name+'.png';
  await node.screenshot({path:path.join(output,file),scale:'css',animations:'disabled'});
  report.screenshots.push(file);
}
async function cameraFrame(){return field('canvas').locator('canvas').screenshot({scale:'css',animations:'disabled'});}
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
  await page.goto(base+'/?site=sternicza-11#v=26&site=sternicza-11&mode=plan&interiorEnabled=true&interiorView=plan',{waitUntil:'domcontentloaded'});
  await ready();assert.equal(await q('meta[name="application-version"]').getAttribute('content'),version);
  assert.equal(await q('#workspace').evaluate(node=>node.inert),true,'Hidden garden controls must not intercept keyboard navigation');
  assert.equal(await field('canvas').locator('canvas').count(),0);
  assert.equal(await page.evaluate(()=>performance.getEntriesByType('resource').some(e=>new URL(e.name).pathname.endsWith('/scene-interior.js'))),false);
  check('Opening a shared floor plan creates no interior WebGL context or renderer import');

  for(const layout of ['existing','renovation']){
    await chooseLayout(layout);
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
        assert.ok(await field('conflict').isVisible());assert.ok(await plan.locator('.iw-conflict').count()>=2);
        await shot('basement-conversion-conflicts');
      }
      if(floor==='attic')assert.ok(await plan.locator('.iw-headroom').count()>=3);
      report.plans.push({layout,floor,zones});
    }
  }
  check('Eight floor/layout combinations expose their room schedules, dimensions, openings, wall changes, attic headroom and retained garage conflicts');
  await field('floor').selectOption('ground');
  await q('[data-iw-room="lounge"]').focus();await page.keyboard.press('Enter');assert.equal(await field('room').inputValue(),'lounge');
  await field('zoom-in').click();assert.equal(await field('drawing').getAttribute('data-zoomed'),'true');await field('zoom-fit').click();
  await field('changes').uncheck();await field('style').selectOption('current');await chooseView('dollhouse');
  await rendered('current','dollhouse');
  report.models=[];
  for(const layout of ['existing','renovation']){
    await chooseLayout(layout);
    for(const floor of ['ground','first','basement','attic']){
      await field('floor').selectOption(floor);
      const model=await rendered('current','dollhouse');
      assert.equal(model.layout,layout);assert.equal(model.floor,floor);
      assert.ok(model.wallCount>0&&model.meshes>0&&model.drawCalls>0);
      report.models.push({floor,layout,meshes:model.meshes,triangles:model.triangles});
    }
  }
  check('Both layouts on all four floors render actual dollhouse geometry');
  await field('floor').selectOption('ground');await field('room').selectOption('lounge');
  const ref=await rendered('current','dollhouse'),refFrame=await cameraFrame();assert.ok(ref.drawCalls>0&&ref.furnitureCount>0);
  const ids=await field('style').locator('option').evaluateAll(nodes=>nodes.map(n=>n.value).filter(v=>v!=='follow'));
  assert.equal(new Set(ids).size,21);
  for(const id of ids.filter(id=>id!=='current')){
    await field('style').selectOption(id);const s=await rendered(id,'dollhouse');
    assert.equal(s.floor,ref.floor);assert.equal(s.layout,ref.layout);assert.equal(s.wallCount,ref.wallCount);assert.equal(s.furnitureCount,ref.furnitureCount);
    const item={id,triangles:s.triangles};
    if(['japandi','space-age','hidden-bali'].includes(id)){
      item.difference=await pixels(refFrame,await cameraFrame());assert.ok(item.difference.changed>150,JSON.stringify(item));
      if(id==='japandi')await shot('ground-japandi-dollhouse');
    }
    report.styles.push(item);
  }
  await field('style').selectOption('current');await rendered('current','dollhouse');
  report.restoration=await pixels(refFrame,await cameraFrame());assert.ok(report.restoration.fraction<.004,JSON.stringify(report.restoration));
  check('21 styles render with stable room structure. Three styled frames change pixels and the neutral finish restores the reference image');
  await field('furniture').uncheck();assert.equal((await rendered('current','dollhouse')).furnitureCount,0);await field('furniture').check();
  await field('floor').selectOption('first');await field('room').selectOption('master');await field('style').selectOption('japandi');
  await field('enter').click();const eye=await rendered('japandi','room');assert.equal(eye.roomId,'master');assert.ok(eye.eyeHeight>1.1&&eye.eyeHeight<2.1);
  await shot('first-floor-master-eye-level');
  await field('room').selectOption('office');const office=await rendered('japandi','room');assert.equal(office.roomId,'office');assert.notDeepEqual(office.camera,eye.camera);
  const parked=office.frames,background=await q('#render-diagnostics').getAttribute('data-frames');
  await page.waitForTimeout(240);assert.equal((await info()).scene.frames,parked);assert.equal(await q('#render-diagnostics').getAttribute('data-frames'),background);
  check('Room entry and room changes move the camera, furniture toggles affect rendered content and both renderers stop when idle');
  await field('changes').check();await field('room').selectOption('master');await field('furniture').uncheck();
  const saved=await appState();await q('#save-a').click();await chooseLayout('existing');await q('#compare').click();assert.deepEqual(await appState(),saved);
  await q('#compare').click();assert.equal((await appState()).layout,'existing');await q('#compare').click();assert.deepEqual(await appState(),saved);
  await q('#share').click();await page.waitForFunction(()=>location.hash.includes('interiorRoomId=master')&&location.hash.includes('interiorStyle=japandi'));
  const shared=page.url();await page.reload({waitUntil:'domcontentloaded'});await ready();assert.deepEqual(await appState(),saved);
  await page.evaluate(()=>history.replaceState(null,'',location.pathname+location.search));await page.reload({waitUntil:'domcontentloaded'});await ready();assert.deepEqual(await appState(),saved);
  check('Save A, return to B, shared links and local reload preserve independent interior settings');
  await field('apply-exterior').click();assert.equal(await field('apply-exterior').isDisabled(),true);
  await field('close').click();await q('#interior-host').waitFor({state:'hidden'});assert.equal(await field('canvas').locator('canvas').count(),0);
  assert.equal(await q('#workspace').evaluate(node=>node.inert),false,'Returning to the garden restores its controls');
  const exported=await exportDesign();
  for(const [key,value] of Object.entries({planExteriorApplied:true,firstFloorRise:3.05,terraceDepth:4,canopyDepth:4,terraceWidth:10.77,canopyWidth:10.77,interiorStyle:'japandi',interiorRoomId:'master'}))assert.equal(exported.settings[key],value,key);
  const doors=exported.interiors.selected.walls.flatMap(w=>w.openings).filter(o=>o.type==='balcony-door');assert.equal(doors.length,3);
  assert.equal(exported.terraceCover.type,'balcony');assert.equal(exported.terraceCover.accessFits,true);
  check('Applying the marked garden connection exports the full-width terrace and balcony, the shared upper deck and its three access doors');

  await page.setViewportSize({width:390,height:844});await page.goto(shared,{waitUntil:'domcontentloaded'});await ready();
  await chooseView('plan');await field('floor').selectOption('ground');await field('settings').click();
  await field('style').selectOption('hidden-bali');await field('furniture').check();await field('hide-settings').click();
  assert.equal(await field('floor').inputValue(),'ground');assert.equal((await appState()).style,'hidden-bali');
  const size=await page.evaluate(()=>({screen:innerWidth,width:document.documentElement.scrollWidth,drawing:Math.round(document.querySelector('.iw-drawing').getBoundingClientRect().height),host:document.querySelector('#interior-host').getBoundingClientRect().bottom,height:innerHeight}));
  assert.ok(size.width<=size.screen+1&&size.drawing>260&&size.host<=size.height+1,JSON.stringify(size));report.mobile=size;
  await shot('mobile-floor-plan');await chooseView('dollhouse');await rendered('hidden-bali','dollhouse');await shot('mobile-dollhouse');
  await field('close').click();await q('#interior-host').waitFor({state:'hidden'});
  check('390 px mobile controls, room inspector and both plan and WebGL views fit the viewport');
  assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.error=error.stack||String(error);process.exitCode=1;console.error(report.error);if(page)try{await shot('failure');}catch{}}
finally{await writeFile(path.join(output,'browser-report.json'),JSON.stringify(report,null,2));await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));console.log('INTERIOR_RESULT '+report.status);}
