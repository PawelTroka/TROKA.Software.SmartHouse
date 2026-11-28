// Real WebGL acceptance of the requested physical room alternatives, kitchen
// labels, mirror and saved configuration. This runner belongs in CI.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {houseModelFrame} from '../src/house-model.js';
import {WALK_COMFORT} from '../src/walk-motion.js';

assert.notEqual(process.env.SITES_MANAGED_LINUX_CONTAINER,'1','Run real-WebGL browser acceptance in GitHub Actions.');
const group=process.env.CINEMA_KITCHEN_GROUP||'all';
assert.ok(['all','layouts','kitchen'].includes(group),'Unknown cinema/kitchen group: '+group);
const runs=name=>group==='all'||group===name;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),output=path.join(root,'test-results','cinema-kitchen',group);
await mkdir(output,{recursive:true});
const version=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version,started=Date.now(),deadline=started+600000;
const remaining=()=>{assert.ok(Date.now()<deadline,'Cinema/kitchen acceptance exceeded ten minutes');return Math.max(1,Math.min(120000,deadline-Date.now()));};
const report={version,group,status:'running',checks:[],layouts:[],screenshots:[],views:[],errors:[]};
const save=()=>writeFile(path.join(output,'browser-report.json'),JSON.stringify({...report,elapsedMs:Date.now()-started},null,2));
const check=async text=>{report.checks.push(text);console.log('CINEMA_KITCHEN_CHECK '+text);await save();};
let browser,page,server,frame;
const q=selector=>page.locator(selector),field=name=>q(`#interior-host [data-iw="${name}"]`);
const pose=()=>q('#scene-host canvas').evaluate(c=>({floor:c.dataset.walkFloor,position:c.dataset.walkPosition?.split(',').map(Number),yaw:Number(c.dataset.walkYaw),pitch:Number(c.dataset.walkPitch)}));
async function sharedReady(){
  await q('#scene-host').scrollIntoViewIfNeeded({timeout:remaining()});
  await page.waitForFunction(()=>{const d=document.querySelector('#render-diagnostics')?.dataset;
    return d?.renderer==='webgl'&&d.renderedStyle==='scandinavian'&&d.drawEnabled==='true'&&d.renderPending==='false'&&d.interacting==='false'&&Number(d.triangles)>0&&Number(d.surfaceAssetsRequested)>0&&d.surfaceAssetsLoaded===d.surfaceAssetsRequested&&Number(d.surfaceAssetsFailed)===0;
  },null,{timeout:remaining()});
}
async function interiorReady(){
  await page.waitForFunction(()=>{const h=document.querySelector('#interior-host'),d=h?.getInteriorDiagnostics?.().scene;
    return h&&!h.hidden&&d?.available&&d.visible&&d.frames>0&&!d.framePending&&!d.interacting&&d.triangles>0&&d.surfaceAssets?.loaded===d.surfaceAssets?.requested&&d.surfaceAssets?.failed.length===0;
  },null,{timeout:remaining()});
}
async function exportDesign(){
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:remaining()}),q('#export').click({timeout:remaining()})]);
  return JSON.parse(await readFile(await download.path(),'utf8'));
}
async function changeLayout(id){
  if(await q('#home-controls').getAttribute('open')===null)await q('#home-controls > summary').click({timeout:remaining()});
  await q('#livingCinemaLayout').selectOption(id,{timeout:remaining()});
  await q('#home-controls > summary').click({timeout:remaining()});await sharedReady();
}
async function screenshot(name,selector){
  await q(selector).scrollIntoViewIfNeeded({timeout:remaining()});
  await q(selector).screenshot({path:path.join(output,name+'.png'),scale:'css',animations:'disabled',timeout:remaining()});
  report.screenshots.push(name+'.png');await save();
}
async function openInterior(room='lounge'){
  if(await q('#interior-host').isHidden())await q('#interior-open').click({timeout:remaining()});
  await q('#interior-host').waitFor({state:'visible',timeout:remaining()});
  if(await field('floor').inputValue()!=='ground')await field('floor').selectOption('ground',{timeout:remaining()});
  await q('#interior-host [data-view="plan"]').click({timeout:remaining()});
  await field('room').selectOption(room,{timeout:remaining()});
}
const degrees=r=>r*180/Math.PI,angleDifference=(a,b)=>((a-b+540)%360+360)%360-180;
async function turnTo(yaw,pitch=0){
  for(let i=0;i<8;i++){
    const p=await pose(),a=angleDifference(yaw,p.yaw),b=pitch-p.pitch;if(Math.abs(a)<.08&&Math.abs(b)<.08)return;
    const canvas=q('#scene-host canvas');await canvas.scrollIntoViewIfNeeded({timeout:remaining()});const box=await canvas.boundingBox();assert.ok(box);
    const gain=degrees(WALK_COMFORT.lookGain),dx=Math.max(-box.width*.55,Math.min(box.width*.55,a/gain)),dy=Math.max(-box.height*.35,Math.min(box.height*.35,-b/gain));
    const x=box.x+box.width/2-dx/2,y=box.y+box.height/2-dy/2;
    await page.mouse.move(x,y);await page.mouse.down();try{await page.mouse.move(x+dx,y+dy,{steps:1});}finally{await page.mouse.up();}
  }
  const p=await pose();assert.ok(Math.abs(angleDifference(yaw,p.yaw))<.1,'Public drag reaches the requested view');
}
async function walkTo(local){
  const target=frame.toSite(...local),forward=q('#scene-host .walk-pad').getByRole('button',{name:'Walk forward',exact:true});
  for(let i=0;i<32;i++){
    const p=await pose(),dx=target[0]-p.position[0],dz=target[1]-p.position[2];if(Math.hypot(dx,dz)<.16)return;
    await turnTo(degrees(Math.atan2(-dx,dz)));await forward.press('Enter',{timeout:remaining()});
    await page.waitForFunction(before=>{const p=document.querySelector('#scene-host canvas')?.dataset.walkPosition?.split(',').map(Number);return p&&Math.hypot(p[0]-before[0],p[2]-before[2])>.001;},p.position,{timeout:remaining(),polling:50});
  }
  assert.fail('Could not walk to '+local.join(','));
}
async function roomView(name,room,position,aim,pitch=-3){
  await openInterior(room);await q('#interior-host [data-view="room"]').click({timeout:remaining()});
  await q('#interior-host').waitFor({state:'hidden',timeout:remaining()});await sharedReady();
  await walkTo(position);const p=await pose(),target=frame.toSite(...aim);await turnTo(degrees(Math.atan2(-(target[0]-p.position[0]),target[1]-p.position[2])),pitch);
  await sharedReady();await screenshot(name,'#scene-host');
  const diagnostics=await q('#render-diagnostics').evaluate(el=>({...el.dataset}));
  report.views.push({name,pose:await pose(),equipmentLabels:JSON.parse(diagnostics.equipmentLabels||'null'),mirrors:JSON.parse(diagnostics.mirrors||'null')});await save();
}

try{
  const publicDir=path.join(root,'public'),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'};
  server=createServer(async(req,res)=>{try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(publicDir,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
    if(!file.startsWith(publicDir+path.sep))throw new Error('Invalid path');
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(await readFile(file));
  }catch{res.writeHead(404);res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1,reducedMotion:'reduce',acceptDownloads:true});
  page=await context.newPage();page.setDefaultTimeout(120000);page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/?site=sternicza-11#v=36&site=sternicza-11&designStyle=scandinavian&showDimensions=false&sceneMotion=false`,{waitUntil:'domcontentloaded',timeout:remaining()});
  await q('#loading').waitFor({state:'hidden',timeout:remaining()});await sharedReady();
  const initial=await exportDesign();assert.equal(initial.schemaVersion,36);assert.equal(initial.settings.livingCinemaLayout,'right-media');
  const ground=initial.interiors.floors.ground,fixtures=ground.fixtures,find=id=>fixtures.find(f=>f.id===id);
  assert.equal(fixtures.filter(f=>f.kind==='dishwasher').length,2);for(const f of fixtures.filter(f=>f.kind==='dishwasher'))assert.equal(f.productDimensions.nicheWidth,.6);
  assert.equal(find('kitchen-steam-oven').productDimensions.capacityLitres,67);assert.equal(find('kitchen-speed-oven').productDimensions.capacityLitres,43);
  assert.equal(find('kitchen-fridge').doorCount,4);assert.equal(find('kitchen-sink').basins,2);assert.equal(find('kitchen-nutrition-pantry').contents.length,4);
  assert.ok(find('kitchen-hall-selfie-mirror').height>=2.3);assert.ok(find('kitchen-wine-cooler').ventilationFreeAreaCm2>=430);
  assert.ok(!find('kitchen-sink-header')&&!find('kitchen-sink-side-storage')&&!find('kitchen-corner-storage'));
  const window=ground.walls.flatMap(w=>w.openings).find(o=>o.service==='kitchen-sink');assert.equal(window.width,2.3);
  const data=await page.request.get(new URL('./data/site-data.json',page.url()).href);frame=houseModelFrame(await data.json(),initial.settings);
  report.kitchen=ground.kitchenFitOut;report.planting=initial.settings.screeningTrees;
  await check('Two real 600 mm dishwasher niches, 67 L steam oven, separate microwave, four-door fridge, wine cooler, concealed pantry, workstation sink and giant mirror are exported from the drawn plan');

  // Independent CI groups keep every rendered check within the same ten-minute
  // budget; each starts from the verified fresh right-media configuration above.
  if(runs('layouts')){
    for(const id of ['right-media','left-media','garden-salon','crosswall-media']){
      await changeLayout(id);
      const design=await exportDesign(),plan=design.interiors.floors.ground,cinema=plan.livingCinema;
      assert.equal(design.settings.livingCinemaLayout,id);assert.equal(cinema.id,id);
      const channels=plan.fixtures.filter(f=>f.channel),tv=plan.fixtures.find(f=>f.id==='tv');
      assert.equal(channels.length,id==='garden-salon'?0:13);assert.equal(Boolean(tv),id!=='garden-salon');
      if(tv){assert.equal(tv.screenDiagonalInches,85);assert.equal(channels.filter(f=>f.layer==='overhead').length,4);assert.equal(channels.filter(f=>f.layer==='ear-level').length,7);}
      for(const [wall,enabled]of [['left-facade',id!=='left-media'],['right-facade',id!=='right-media']])assert.equal(plan.walls.find(w=>w.id===wall).openings.some(o=>o.service==='living-picture'),enabled);
      assert.deepEqual(design.settings.screeningTrees,initial.settings.screeningTrees);
      await openInterior();await q('#interior-host [data-view="dollhouse"]').click({timeout:remaining()});await interiorReady();
      const renderer=await q('#interior-host').evaluate(h=>h.getInteriorDiagnostics());report.layouts.push({id,cinema,renderer:renderer.scene});
      await screenshot('living-'+id,'#interior-host [data-iw="canvas"]');
      await q('#interior-host [data-view="plan"]').click({timeout:remaining()});
      await screenshot('plan-'+id,'#interior-host [data-iw="plan"]');
      await field('close').click({timeout:remaining()});await sharedReady();
    }
    await check('A/B swap furniture and solid/window sides, C removes all thirteen audio devices and screen, and D keeps both windows; every choice renders in WebGL and plan');
    await changeLayout('right-media');
    await roomView('living-cinema-screen-view','lounge',[7.58,2.75],[10.34,2.75],1);
  }
  if(runs('kitchen')){
    await roomView('kitchen-workstation-and-two-dishwashers','front-kitchen',[2.65,6.88],[.20,6.88],-10);
    const kitchenLabels=await q('#scene-host .equipment-label').evaluateAll(nodes=>nodes.filter(n=>!n.hidden).map(n=>n.textContent));
    assert.ok(kitchenLabels.some(text=>text.includes('Dishwasher')));report.kitchenLabels=kitchenLabels;
    await roomView('kitchen-tall-appliances-and-pantry','front-kitchen',[2.50,6.95],[4.1,7.35],-4);
    await roomView('hall-giant-mirror','hall',[5.82,7.18],[4.608,7.295],-3);
    const mirror=JSON.parse(await q('#render-diagnostics').getAttribute('data-mirrors')||'null');report.mirror=mirror;
    assert.equal(mirror?.count,1);assert.equal(mirror?.captured,true);assert.ok(mirror.frames>=1);assert.equal(mirror.updateMode,'settled-only');assert.equal(mirror.updatesWhileMoving,0);
    await check('Public room entry and walking expose the integrated kitchen, hidden equipment labels and the full-height reflecting wall');
  }

  if(runs('layouts')){
    await openInterior('front-kitchen');await q('#interior-host [data-view="dollhouse"]').click({timeout:remaining()});await interiorReady();
    await field('equipment').uncheck({timeout:remaining()});await interiorReady();
    await page.waitForFunction(()=>document.querySelector('#interior-host')?.getInteriorDiagnostics?.().scene?.equipmentLabels?.enabled===false,null,{timeout:remaining()});
    assert.equal(await field('dimensions').isChecked(),false);
    await field('equipment').check({timeout:remaining()});await field('cinema').selectOption('garden-salon',{timeout:remaining()});await interiorReady();
    await field('close').click({timeout:remaining()});await sharedReady();
    await q('#share').click({timeout:remaining()});const sharedURL=page.url();assert.equal(new URLSearchParams(new URL(sharedURL).hash.slice(1)).get('livingCinemaLayout'),'garden-salon');
    await page.reload({waitUntil:'domcontentloaded',timeout:remaining()});await q('#loading').waitFor({state:'hidden',timeout:remaining()});await sharedReady();
    const restored=await exportDesign();assert.equal(restored.settings.livingCinemaLayout,'garden-salon');assert.equal(restored.settings.showEquipmentLabels,true);assert.equal(restored.settings.showDimensions,false);
    await check('Layout selection and independent equipment-label setting survive Share and reload without moving any trees');
    await page.setViewportSize({width:390,height:844});
    await q('#home-controls > summary').click({timeout:remaining()});await q('#livingCinemaLayout').scrollIntoViewIfNeeded({timeout:remaining()});
    for(const id of ['livingCinemaLayout','showEquipmentLabels']){const b=await q('#'+id).boundingBox();assert.ok(b&&b.x>=0&&b.x+b.width<=390,id+' fits mobile');}
    await screenshot('mobile-living-layout-controls','#home-controls');
  }
  assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.error=error.stack||String(error);process.exitCode=1;console.error(report.error);
  if(page){try{report.failure={url:page.url(),diagnostics:await q('#render-diagnostics').evaluate(el=>({...el.dataset})),interior:await q('#interior-host').evaluate(h=>h.getInteriorDiagnostics?.())};await page.screenshot({path:path.join(output,'failure.png'),timeout:20000});report.screenshots.push('failure.png');}catch{}}
}finally{await save();await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));console.log('CINEMA_KITCHEN_RESULT '+report.status);}
