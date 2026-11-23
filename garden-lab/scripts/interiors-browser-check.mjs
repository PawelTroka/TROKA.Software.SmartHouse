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
    const host=document.querySelector('#interior-host'),d=host?.getInteriorDiagnostics?.(),s=d?.scene;
    const assets=s?.surfaceAssets;
    return s?.available&&s.visible&&s.styleId===style&&s.view===view&&s.floor===host.dataset.floor&&s.layout===host.dataset.layout&&s.frames>0&&!s.framePending&&!s.interacting&&s.triangles>0&&
      assets?.requested>0&&assets.loaded===assets.requested&&assets.failed.length===0;
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
  await q('[data-iw-room="lounge"]').focus();await page.keyboard.press('Enter');assert.equal(await field('room').inputValue(),'lounge');
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
  assert.equal(new Set(ids).size,23);assert.ok(ids.includes('coastal'));assert.ok(ids.includes('beach-house'));
  const geometryCounts=new Set(),featureSets=new Set();
  for(const id of ids.filter(id=>id!=='current')){
    await field('style').selectOption(id);const s=await rendered(id,'dollhouse');
    assert.equal(s.floor,ref.floor);assert.equal(s.layout,ref.layout);assert.equal(s.wallCount,ref.wallCount);assert.equal(s.furnitureCount,ref.furnitureCount);
    assert.equal(s.renovationFeatures.length,3);assert.equal(s.contextSource,'shared-site-model');
    geometryCounts.add(s.triangles);featureSets.add(JSON.stringify(s.renovationFeatures));
    const item={id,meshes:s.meshes,triangles:s.triangles,features:s.renovationFeatures};
    if(['japandi','space-age','hidden-bali','coastal','beach-house'].includes(id)){
      item.difference=await pixels(originalFrame,await cameraFrame());assert.ok(item.difference.changed>150,JSON.stringify(item));
      await shot('ground-'+id+'-dollhouse');
    }
    report.styles.push(item);
  }
  assert.ok(geometryCounts.size>=11,`Styles changed only ${geometryCounts.size} actual triangle counts`);assert.equal(featureSets.size,22);
  const major=report.styles.filter(s=>['hidden-bali','japandi','space-age','coastal'].includes(s.id));assert.equal(new Set(major.map(s=>s.triangles)).size,4);
  assert.notEqual(report.styles.find(s=>s.id==='coastal').triangles,report.styles.find(s=>s.id==='baltic-dune').triangles,'Coastal is a distinct physical interior, not another name for Baltic Dune');
  for(const id of ['coastal','baltic-dune'])assert.notEqual(report.styles.find(s=>s.id==='beach-house').triangles,report.styles.find(s=>s.id===id).triangles,'Beach House has its own physical furniture and composition');
  await field('style').selectOption('current');await rendered('current','dollhouse');
  report.restoration=await pixels(originalFrame,await cameraFrame());assert.ok(report.restoration.fraction<.004,JSON.stringify(report.restoration));
  check('All 22 renovations have physical features and varied rendered geometry; Beach House, Coastal and Baltic Dune are distinct, and Current restores the original layout/image');
  await field('furniture').uncheck();assert.equal((await rendered('current','dollhouse')).furnitureCount,0);await field('furniture').check();
  await field('style').selectOption('japandi');await field('floor').selectOption('first');await field('room').selectOption('master');
  await field('enter').click();const eye=await rendered('japandi','room');assert.equal(eye.roomId,'master');assert.ok(eye.eyeHeight>1.1&&eye.eyeHeight<2.1);
  assert.equal(eye.contextSource,'shared-site-model');
  await shot('first-floor-master-eye-level');
  await field('room').selectOption('spa-bath');const spa=await rendered('japandi','room');assert.equal(spa.roomId,'spa-bath');
  await shot('first-floor-hydro-spa-eye-level');
  await chooseView('dollhouse');await rendered('japandi','dollhouse');await shot('first-floor-japandi-dollhouse');
  await field('floor').selectOption('ground');await field('room').selectOption('bathroom');await chooseView('room');
  const bath=await rendered('japandi','room');assert.equal(bath.roomId,'bathroom');await shot('ground-soaking-bath-eye-level');
  await field('floor').selectOption('first');
  await field('room').selectOption('office');const office=await rendered('japandi','room');assert.equal(office.roomId,'office');assert.notDeepEqual(office.camera,eye.camera);
  const parked=office.frames,background=await q('#render-diagnostics').getAttribute('data-frames');
  await page.waitForTimeout(240);assert.equal((await info()).scene.frames,parked);assert.equal(await q('#render-diagnostics').getAttribute('data-frames'),background);
  check('Room entry and room changes move the camera, furniture toggles affect rendered content and both renderers stop when idle');
  await field('changes').check();await field('room').selectOption('master');await field('furniture').uncheck();
  const saved=await appState();await q('#save-a').click();await chooseLayout('existing');await q('#compare').click();assert.deepEqual(await appState(),saved);
  await q('#compare').click();assert.equal((await appState()).layout,'existing');await q('#compare').click();assert.deepEqual(await appState(),saved);
  await q('#share').click();await page.waitForFunction(()=>location.hash.includes('interiorRoomId=master')&&location.hash.includes('designStyle=japandi'));
  const shared=page.url();await page.reload({waitUntil:'domcontentloaded'});await ready();assert.deepEqual(await appState(),saved);
  await page.evaluate(()=>history.replaceState(null,'',location.pathname+location.search));await page.reload({waitUntil:'domcontentloaded'});await ready();assert.deepEqual(await appState(),saved);
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
  assert.equal(find(upper,'hotTub').length,1);assert.equal(find(upper,'tub').length,0);assert.equal(find(upper,'bidet').length,0);
  const hotTub=find(upper,'hotTub')[0];for(const key of ['jets','lights','hydromassage'])assert.equal(hotTub[key],true);assert.equal(hotTub.width,2.05);assert.equal(hotTub.depth,1.80);
  assert.equal(find(upper,'basin').length,1);assert.equal(find(upper,'basin')[0].basins,1);assert.equal(find(upper,'shower')[0].heads,2);assert.equal(find(upper,'toilet').length,1);
  report.bathrooms={ground:ground.filter(f=>f.roomId==='bathroom').map(f=>f.kind),first:upper.filter(f=>f.roomId==='spa-bath').map(f=>f.kind)};
  check('Exports contain the ground soaking tub/dual vanity/bidet and one upper hydro spa/single basin/two-person shower; both views share the 4 m balcony and all 3 doors');
  await q('#canopyDepth-value').fill('3.2');await q('#canopyDepth-value').press('Tab');
  const edited=await exportDesign();assertBalconyShared(edited,3.2);
  await q('#interior-open').click();await ready();assert.equal(await field('apply-exterior').isDisabled(),false);
  await chooseView('dollhouse');const changed=await rendered('japandi','dollhouse');assert.equal(changed.contextSource,'shared-site-model');
  await field('apply-exterior').click();assert.equal(await field('apply-exterior').isDisabled(),true);
  await field('close').click();await q('#interior-host').waitFor({state:'hidden'});assertBalconyShared(await exportDesign(),4);
  check('Changing balcony depth outdoors updates the actual interior plan; restoring marked decks updates both views together');

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
