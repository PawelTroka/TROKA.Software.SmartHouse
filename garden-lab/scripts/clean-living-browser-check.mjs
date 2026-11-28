// Focused 1.39 evidence through the same public controls, Share links and
// diagnostics as the open-living and garden-living browser suites. Run in CI;
// the managed ChatGPT workspace uses its approved preview browser instead.
// CLEAN_LIVING_GROUP=garden|interiors selects an independent scenario with
// its own 600-second process budget. The default all retains the full sequence.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {houseModelFrame} from '../src/house-model.js';
import {WALK_COMFORT} from '../src/walk-motion.js';

assert.notEqual(process.env.SITES_MANAGED_LINUX_CONTAINER,'1','Use the approved managed preview; this real-WebGL runner belongs in GitHub Actions.');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const group=process.env.CLEAN_LIVING_GROUP||'all';
assert.ok(['all','garden','interiors'].includes(group),'CLEAN_LIVING_GROUP must be all, garden or interiors');
const selectedGroups=group==='all'?['garden','interiors']:[group];
const output=path.join(root,'test-results','clean-living',group);
await mkdir(output,{recursive:true});
const version=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version;
const STYLE='scandinavian',BUDGET=600000,SCENE_TIMEOUT=120000;
const started=Date.now(),deadline=started+BUDGET;
const remaining=()=>{const left=deadline-Date.now();assert.ok(left>0,`Clean-living ${group} evidence exceeded its 600 second budget`);return Math.max(1,Math.min(SCENE_TIMEOUT,left));};
const report={version,group,selectedGroups,completedGroups:[],style:STYLE,status:'running',checks:[],screenshots:[],sceneCaptures:[],views:[],errors:[],
  sceneEvidence:'Actual WebGL frames through public garden controls, Share URLs, interior room selectors, accessible walking and drag look. No private app state or camera control hooks.'};
const save=()=>writeFile(path.join(output,'browser-report.json'),JSON.stringify({...report,elapsedMs:Date.now()-started},null,2));
const check=async label=>{report.checks.push(label);console.log(`CLEAN_LIVING_CHECK [${group}] ${label}`);await save();};
let browser,server,page,frame,base=process.env.BASE_URL?.replace(/\/$/,'');
const q=selector=>page.locator(selector),field=id=>q(`#interior-host [data-iw="${id}"]`);
const near=(a,b,tol=1e-5)=>assert.ok(Math.abs(a-b)<tol,`${a} differs from ${b}`);
const degrees=r=>r*180/Math.PI,angleDifference=(a,b)=>((a-b+540)%360+360)%360-180;
const rawInfo=()=>q('#render-diagnostics').evaluate(node=>({...node.dataset}));
async function sceneInfo(){const d=await rawInfo();for(const key of ['spaCovers','interiorDimensions','coldPlunge'])d[key]=JSON.parse(d[key]||'null');return d;}
const pose=()=>q('#scene-host canvas').evaluate(c=>({floor:c.dataset.walkFloor,position:c.dataset.walkPosition?.split(',').map(Number),
  yaw:Number(c.dataset.walkYaw),pitch:Number(c.dataset.walkPitch),fov:Number(c.dataset.walkFov),navigation:c.dataset.walkNavigation}));
async function sceneReady(){
  await q('#scene-host').scrollIntoViewIfNeeded({timeout:remaining()});
  await page.waitForFunction(style=>{const d=document.querySelector('#render-diagnostics')?.dataset;
    return d?.renderer==='webgl'&&d.renderedStyle===style&&d.drawEnabled==='true'&&d.renderPending==='false'&&d.interacting==='false'&&
      Number(d.frames)>0&&Number(d.triangles)>0&&Number(d.surfaceAssetsRequested)>0&&d.surfaceAssetsLoaded===d.surfaceAssetsRequested&&Number(d.surfaceAssetsFailed)===0;
  },STYLE,{timeout:remaining()});
}
async function walking(floor){
  await q('#interior-host').waitFor({state:'hidden',timeout:remaining()});
  await page.waitForFunction(floor=>{const c=document.querySelector('#scene-host canvas'),d=document.querySelector('#render-diagnostics')?.dataset;
    const target=Number(c?.dataset.walkPosition?.split(',')[1]),altitude=Number(c?.dataset.walkAltitude);
    return c?.dataset.walkFloor===floor&&c.dataset.walkFloating==='false'&&c.dataset.walkNavigation==='free'&&
      Number.isFinite(target)&&Number.isFinite(altitude)&&Math.abs(target-altitude)<=.002&&d?.renderer==='webgl'&&d.drawEnabled==='true'&&d.renderPending==='false'&&d.interacting==='false'&&
      Number(d.triangles)>0&&Number(d.surfaceAssetsRequested)>0&&d.surfaceAssetsLoaded===d.surfaceAssetsRequested&&Number(d.surfaceAssetsFailed)===0;
  },floor,{timeout:remaining()});
  assert.equal(await q('#viewer button[data-mode="walk"]').getAttribute('aria-pressed'),'true');
  assert.equal((await pose()).fov,70);
}
async function exportDesign(){
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:remaining()}),q('#export').click({timeout:remaining()})]);
  return JSON.parse(await readFile(await download.path(),'utf8'));
}
async function sharePatch(patch){
  await q('#share').click({timeout:remaining()});const url=new URL(page.url()),params=new URLSearchParams(url.hash.slice(1));
  assert.ok(params.has('v'),'The public Share control must create a versioned design link');
  for(const [key,value]of Object.entries(patch))params.set(key,String(value));url.hash=params.toString();
  await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:remaining()});
}
async function homeControls(open){if((await q('#home-controls').getAttribute('open')!==null)!==open)await q('#home-controls > summary').click({timeout:remaining()});}
async function cover(key,closed){await homeControls(true);await q('#'+key).setChecked(closed,{timeout:remaining()});await homeControls(false);await sceneReady();}
function assertCovers(info,jacuzzi,coldPlunge){
  const state=info.spaCovers;assert.equal(state.jacuzzi,jacuzzi);assert.equal(state.coldPlunge,coldPlunge);assert.equal(state.moving,0);
  assert.equal(state.covers.length,2);
  for(const c of state.covers){
    const expected=c.id==='jacuzzi-cover'?jacuzzi:coldPlunge;
    assert.equal(c.storage,'concealed-side-cassette');assert.equal(c.parkingVisible,false);assert.ok(c.cassetteDepth>=.20);
    assert.equal(c.exposedPanels,expected?2:0);assert.equal(c.hiddenPanels,expected?0:2);
  }
}
async function shot(name,selector='#scene-host',kind='shared'){
  await q(selector).scrollIntoViewIfNeeded({timeout:remaining()});
  await page.waitForFunction(()=>{const t=document.querySelector('#toast');return !t||(!t.classList.contains('visible')&&Number(getComputedStyle(t).opacity)===0);},undefined,{timeout:remaining()});
  let scene=null;
  if(kind==='shared'){
    await sceneReady();const d=await sceneInfo();assert.equal(d.renderer,'webgl');
    scene={renderer:d.renderer,frames:Number(d.frames),triangles:Number(d.triangles),style:d.renderedStyle,
      surfaceAssets:{requested:Number(d.surfaceAssetsRequested),loaded:Number(d.surfaceAssetsLoaded),failed:Number(d.surfaceAssetsFailed)},
      spaCovers:d.spaCovers,dimensions:d.interiorDimensions,pose:await pose()};
  }else if(kind==='interior'){
    await page.waitForFunction(()=>{const h=document.querySelector('#interior-host'),s=h?.getInteriorDiagnostics?.().scene,a=s?.surfaceAssets;
      return h&&!h.hidden&&s?.available&&s.visible&&s.frames>0&&!s.framePending&&!s.interacting&&s.triangles>0&&a?.requested>0&&a.loaded===a.requested&&a.failed.length===0;
    },undefined,{timeout:remaining()});
    assert.equal(await field('canvas').locator('canvas').getAttribute('data-interior-renderer'),'webgl');
    const d=await q('#interior-host').evaluate(h=>h.getInteriorDiagnostics());scene={renderer:'webgl',...d.scene};
    assert.ok(scene.available&&scene.triangles>0&&scene.frames>0&&!scene.framePending);
  }
  const file=name+'.png',png=await q(selector).screenshot({path:path.join(output,file),scale:'css',animations:'disabled',timeout:remaining()});
  report.screenshots.push(file);if(scene)report.sceneCaptures.push({file,...scene,pngWidth:png.readUInt32BE(16),pngHeight:png.readUInt32BE(20)});
  await save();
}
async function openPlan(floor,room){
  await q('#interior-open').click({timeout:remaining()});
  await page.waitForFunction(()=>{const h=document.querySelector('#interior-host');return h&&!h.hidden&&h.getInteriorDiagnostics?.().visible;},undefined,{timeout:remaining()});
  if(await q('#interior-host button[data-view="plan"]').getAttribute('aria-pressed')!=='true')await q('#interior-host button[data-view="plan"]').click({timeout:remaining()});
  if(await field('floor').inputValue()!==floor)await field('floor').selectOption(floor,{timeout:remaining()});
  if(room)await field('room').selectOption(room,{timeout:remaining()});
  await field('plan').locator('svg').waitFor({state:'visible',timeout:remaining()});
  assert.equal(await field('style').inputValue(),STYLE);
}
async function turnTo(yaw,pitch){
  for(let n=0;n<7;n++){
    const p=await pose(),dxAngle=angleDifference(yaw,p.yaw),dyAngle=pitch-p.pitch;
    if(Math.abs(dxAngle)<.05&&Math.abs(dyAngle)<.05)return;
    const canvas=q('#scene-host canvas');await canvas.scrollIntoViewIfNeeded({timeout:remaining()});const b=await canvas.boundingBox();
    assert.ok(b&&b.width>160&&b.height>100);
    const gain=degrees(WALK_COMFORT.lookGain),dx=Math.max(-b.width*.55,Math.min(b.width*.55,dxAngle/gain)),dy=Math.max(-b.height*.35,Math.min(b.height*.35,-dyAngle/gain));
    const x=b.x+b.width/2-dx/2,y=b.y+b.height/2-dy/2;
    await page.mouse.move(x,y);await page.mouse.down();try{await page.mouse.move(x+dx,y+dy,{steps:1});}finally{await page.mouse.up();}
  }
  const p=await pose();assert.ok(Math.abs(angleDifference(yaw,p.yaw))<.05&&Math.abs(pitch-p.pitch)<.05,'Public drag must reach requested viewing direction');
}
async function walkTo(local,floor){
  const target=frame.toSite(local[0],local[1]),forward=q('#scene-host .walk-pad').getByRole('button',{name:'Walk forward',exact:true});
  const first=await pose(),initial=Math.hypot(target[0]-first.position[0],target[1]-first.position[2]),limit=Math.ceil(initial/.28)+2;
  for(let i=0;i<limit;i++){
    const p=await pose(),dx=target[0]-p.position[0],dz=target[1]-p.position[2],distance=Math.hypot(dx,dz);if(distance<=.15)return;
    await turnTo(degrees(Math.atan2(-dx,dz)),0);await forward.press('Enter',{timeout:remaining()});
    await page.waitForFunction(({floor,before})=>{const c=document.querySelector('#scene-host canvas'),p=c?.dataset.walkPosition?.split(',').map(Number);
      return c?.dataset.walkFloor===floor&&p?.length===3&&Math.hypot(p[0]-before[0],p[2]-before[2])>.001;
    },{floor,before:p.position},{timeout:remaining(),polling:50});
    const after=await pose();near(Math.hypot(after.position[0]-p.position[0],after.position[2]-p.position[2]),.28,.005);
  }
  assert.fail('Public walking could not reach '+JSON.stringify({floor,local}));
}
async function roomView({id,floor,room,position,aim,pitch=-.03}){
  await openPlan(floor,room);await q('#interior-host button[data-view="room"]').click({timeout:remaining()});await walking(floor);
  await walkTo(position,floor);const p=await pose(),local=frame.toLocal(p.position[0],p.position[2],p.position[1]);
  const target=frame.toSite(aim[0],aim[1]),yaw=degrees(Math.atan2(-(target[0]-p.position[0]),target[1]-p.position[2]));
  await turnTo(yaw,degrees(pitch));await walking(floor);await shot(id);
  report.views.push({id,floor,room,local,aim,pose:await pose()});await check('Rendered '+id+' from its public room entry and verified walking position');
}
async function dimensionState({enabled=true,floor,interior=false}={}){
  const host=interior?'#interior-host':'#scene-host';
  await page.waitForFunction(({enabled,floor,interior,host})=>{
    const d=interior?document.querySelector('#interior-host')?.getInteriorDiagnostics?.().scene?.interiorDimensions:
      JSON.parse(document.querySelector('#render-diagnostics')?.dataset.interiorDimensions||'null');
    const visible=[...document.querySelectorAll(host+' .interior-dimension-label')].filter(el=>!el.hidden);
    return d?.enabled===enabled&&(enabled?d.visible>0&&visible.length>0&&(!floor||d.floor===floor):d.visible===0&&visible.length===0);
  },{enabled,floor,interior,host},{timeout:remaining()});
  const visible=await q(host+' .interior-dimension-label').evaluateAll(nodes=>nodes.filter(n=>!n.hidden).map(n=>({id:n.dataset.interiorDimension,kind:n.dataset.dimensionKind,floor:n.dataset.dimensionFloor,text:n.textContent,title:n.title})));
  if(enabled){assert.ok(visible.length>0&&visible.length<=14);assert.ok(visible.every(v=>v.floor===floor));assert.ok(visible.every(v=>/m/.test(v.text)));}
  return visible;
}

try{
  if(!base){
    const publicDir=path.join(root,'public'),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'};
    server=createServer(async(req,res)=>{try{
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(publicDir,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
      if(!file.startsWith(publicDir+path.sep))throw new Error('Invalid path');
      const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
    }catch{res.writeHead(404);res.end();}});
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});base='http://127.0.0.1:'+server.address().port;
  }
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:1240,height:868},deviceScaleFactor:1,reducedMotion:'reduce',acceptDownloads:true});
  page=await context.newPage();page.setDefaultTimeout(SCENE_TIMEOUT);page.on('pageerror',e=>report.errors.push(e.message));await save();
  await page.goto(base+'/?site=sternicza-11',{waitUntil:'domcontentloaded',timeout:remaining()});
  await q('#loading').waitFor({state:'hidden',timeout:remaining()});assert.equal(await q('meta[name="application-version"]').getAttribute('content'),version);
  await q('#designStyle').selectOption(STYLE,{timeout:remaining()});await sceneReady();
  const initial=await exportDesign();assert.equal(initial.schemaVersion,37);assert.equal(initial.settings.poolSunbedSides,2);
  assert.deepEqual(initial.settings.screeningTrees.map(t=>[t.x,t.y]),[[13,34.1],[19.3,32.25],[17.6,34.9]]);
  const pool=initial.gardenLayout.pool,beds=initial.gardenLayout.sunbeds;
  near(pool.x,15.5);near(pool.y,24.5);near(pool.width,3.2);near(pool.length,6.5);assert.equal(beds.length,3);
  assert.deepEqual(beds.map(b=>b.poolEdge),['garden','garden','garden']);
  assert.deepEqual(beds.map(b=>b.x),[11.95,13.05,14.15]);
  for(const b of beds){assert.ok(b.length>b.width);assert.ok(b.x+b.width<pool.x);near(b.y,24);assert.equal(b.back,'north');}
  assert.equal(initial.gardenLayout.dining,null);assert.equal(initial.gardenLayout.diningVisible,false);
  assert.ok(initial.gardenLayout.pathNetwork.connections.every(c=>c.id!=='dining'&&c.connected));
  const ground=initial.interiors.floors.ground,first=initial.interiors.floors.first;
  for(const id of ['kitchen-sink-header','kitchen-corner-storage','kitchen-sink-side-storage'])assert.ok(!ground.fixtures.some(f=>f.id===id));
  assert.ok(ground.fixtures.some(f=>f.id==='kitchen-pantry-corner'));
  const sinkWindow=ground.walls.flatMap(w=>w.openings).find(o=>o.service==='kitchen-sink');near(sinkWindow.width,2.30);near(sinkWindow.height,1.46);
  for(const plan of [ground,first]){const windows=plan.walls.flatMap(w=>w.openings).filter(o=>['bathroom','spa-bath'].includes(o.roomId));
    assert.equal(windows.length,plan.floor==='ground'?1:2);
    for(const o of windows){assert.equal(o.glazing,plan.floor==='ground'?'reflective-privacy':'clear');assert.ok(o.width>=1.4);near(o.sill,.98);near(o.height,1.44);
      if(plan.floor==='ground'){assert.equal(o.privacyCondition,'outside-brighter-than-inside');assert.equal(o.nightPrivacyGuaranteed,false);}}
  }
  assert.ok(ground.walls.find(w=>w.id==='street-facade').openings.every(o=>o.type!=='window'));
  const sauna=first.walls.flatMap(w=>w.openings).find(o=>o.service==='indoor-sauna');near(sauna.width,.96);near(sauna.height,1.30);assert.equal(sauna.glazing,'clear');
  report.exported={schema:initial.schemaVersion,trees:initial.settings.screeningTrees,pool,sunbeds:beds,dining:initial.gardenLayout.dining,pathNetwork:initial.gardenLayout.pathNetwork,kitchenWindow:sinkWindow,saunaWindow:sauna};
  const response=await page.request.get(new URL('./data/site-data.json',page.url()).href,{timeout:remaining()});assert.ok(response.ok());frame=houseModelFrame(await response.json(),initial.settings);
  await check('Fresh Scandinavian defaults preserve two pines, restore only the boundary pine, align three chaises side by side, remove the right-hand dining zone and export the actual bathroom privacy apertures');
  if(selectedGroups.includes('garden')){
    await q('#viewer button[data-mode="plan"]').click({timeout:remaining()});await q('#plan-host svg').waitFor({state:'visible',timeout:remaining()});await shot('garden-two-edge-loungers-and-boundary-pine','#plan-host','plan');
    await q('#viewer button[data-mode="orbit"]').click({timeout:remaining()});await q('#showDimensions').uncheck({timeout:remaining()});
    if(await q('#sun-controls').getAttribute('open')===null)await q('#sun-controls > summary').click({timeout:remaining()});
    await q('#sun-date').fill('2026-06-21',{timeout:remaining()});await q('#sun-date').press('Tab',{timeout:remaining()});await q('#preview-day').click({timeout:remaining()});
    await q('[data-studio-inspect="garden"]').click({timeout:remaining()});await sceneReady();assertCovers(await sceneInfo(),0,0);await shot('garden-overview-covers-concealed');
    await q('[data-preset="jacuzzi"]').click({timeout:remaining()});await q('[data-look-yaw="0"]').click({timeout:remaining()});await sceneReady();
    const jacuzzi=await exportDesign();assert.equal(jacuzzi.settings.preset,'jacuzzi');near(jacuzzi.settings.eyeHeight,.70);report.jacuzziView={observer:jacuzzi.summary?.observer,summary:jacuzzi.summary};await shot('jacuzzi-seated-pck3-screening');
    await q('[data-studio-inspect="garden"]').click({timeout:remaining()});await cover('jacuzziCoverClosed',true);assertCovers(await sceneInfo(),1,0);
    await cover('coldPlungeCoverClosed',true);assertCovers(await sceneInfo(),1,1);await shot('garden-both-spa-covers-closed');
    await cover('jacuzziCoverClosed',false);assertCovers(await sceneInfo(),0,1);
    await cover('coldPlungeCoverClosed',false);assertCovers(await sceneInfo(),0,0);await shot('garden-both-spa-covers-retracted');
    await sharePatch({mode:'eye',preset:'custom',observerX:7.7,observerY:33.6,eyeHeight:1.25,lookYaw:0,lookPitch:-30,sceneMotion:false,interiorView:'plan',interiorEnabled:false,walkNavigation:'free'});
    await sceneReady();assertCovers(await sceneInfo(),0,0);await shot('cold-plunge-clear-flush-surround');
    await cover('coldPlungeCoverClosed',true);assertCovers(await sceneInfo(),0,1);await shot('cold-plunge-flush-cover-closed');
    await cover('coldPlungeCoverClosed',false);assertCovers(await sceneInfo(),0,0);
    await check('Both actual spa lids independently close and retract completely below their surrounds; seated jacuzzi and close plunge views are captured');
    report.completedGroups.push('garden');await save();
  }

  if(selectedGroups.includes('interiors')){
    // A separate interiors process must start from the same public shared
    // state reached by the garden scenario, without spending its budget on
    // garden screenshots, cover animations or the seated screening view.
    if(!selectedGroups.includes('garden')){
      await q('#showDimensions').uncheck({timeout:remaining()});
      if(await q('#sun-controls').getAttribute('open')===null)await q('#sun-controls > summary').click({timeout:remaining()});
      await q('#sun-date').fill('2026-06-21',{timeout:remaining()});await q('#sun-date').press('Tab',{timeout:remaining()});await q('#preview-day').click({timeout:remaining()});
      await sharePatch({mode:'eye',preset:'custom',observerX:7.7,observerY:33.6,eyeHeight:1.25,lookYaw:0,lookPitch:-30,sceneMotion:false,interiorView:'plan',interiorEnabled:false,walkNavigation:'free'});
      await sceneReady();assertCovers(await sceneInfo(),0,0);
    }
    await roomView({id:'kitchen-wide-clear-window',floor:'ground',room:'front-kitchen',position:[2.80,6.94],aim:[.175,6.94]});
    await q('#showDimensions').check({timeout:remaining()});await walking('ground');report.roomDimensions=await dimensionState({floor:'ground'});await shot('kitchen-room-dimensions');
    const before=await pose();await q('#scene-host .walk-pad').getByRole('button',{name:'Walk forward',exact:true}).press('Enter',{timeout:remaining()});
    await walking('ground');const after=await pose();near(Math.hypot(after.position[0]-before.position[0],after.position[2]-before.position[2]),.28,.005);
    report.walkDimensions=await dimensionState({floor:'ground'});await shot('kitchen-walking-dimensions');
    await q('#showDimensions').uncheck({timeout:remaining()});await sceneReady();await dimensionState({enabled:false});await shot('kitchen-dimensions-off');
    await check('Interior dimensions follow real room entry and walking, stay on the occupied floor, and disappear through the public Dimensions switch');
    await roomView({id:'ground-bathroom-reflective-privacy-window',floor:'ground',room:'bathroom',position:[8.70,6.45],aim:[10.595,6.45]});
    await roomView({id:'ground-bathroom-solid-street-wall',floor:'ground',room:'bathroom',position:[8.35,7.05],aim:[8.35,8.825]});
    await roomView({id:'upper-bathroom-clear-window',floor:'first',room:'spa-bath',position:[8.65,6.28],aim:[10.60,6.28]});
    await roomView({id:'indoor-sauna-picture-window',floor:'first',room:'sauna',position:[9.47,4.61],aim:[10.60,4.61]});
    await openPlan('ground','front-kitchen');await field('dimensions').check({timeout:remaining()});
    await q('#interior-host button[data-view="dollhouse"]').click({timeout:remaining()});
    await page.waitForFunction(()=>{const h=document.querySelector('#interior-host'),s=h?.getInteriorDiagnostics?.().scene,a=s?.surfaceAssets;
      return s?.available&&s.visible&&s.view==='dollhouse'&&s.floor==='ground'&&s.styleId==='scandinavian'&&s.frames>0&&!s.framePending&&!s.interacting&&s.triangles>0&&a?.requested>0&&a.loaded===a.requested&&a.failed.length===0;
    },undefined,{timeout:remaining()});
    report.cutawayDimensions=await dimensionState({floor:'ground',interior:true});assert.ok(report.cutawayDimensions.some(d=>d.kind==='room'&&/m²/.test(d.text)));
    await shot('ground-cutaway-room-and-furniture-dimensions','#interior-host [data-iw="canvas"]','interior');
    await field('dimensions').uncheck({timeout:remaining()});await dimensionState({enabled:false,interior:true});
    await shot('ground-cutaway-dimensions-off','#interior-host [data-iw="canvas"]','interior');
    await check('Cutaway room areas, dimensions and detail labels use the same master switch as walking and remain optional');
    report.completedGroups.push('interiors');await save();
  }
  assert.deepEqual(report.completedGroups,selectedGroups);
  assert.deepEqual(report.errors,[]);report.status='passed';assert.ok(Date.now()-started<BUDGET);
}catch(error){
  report.status='failed';report.error=error.stack||String(error);process.exitCode=1;console.error(report.error);
  if(page){try{report.failureState={diagnostics:await rawInfo(),url:page.url(),interior:await q('#interior-host').evaluate(h=>h.getInteriorDiagnostics?.())};}catch{}
    try{const file='failure.png';await page.screenshot({path:path.join(output,file),timeout:30000});report.screenshots.push(file);}catch{}}
}finally{
  await save();await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));console.log(`CLEAN_LIVING_RESULT ${report.status} group=${group}`);
}
