// Real WebGL regression checks for the public editor. Use BASE_URL to exercise an
// existing deployment, otherwise serve the package's freshly built public tree.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const evidence=path.join(root,'test-results','studio');
await mkdir(evidence,{recursive:true});
const version=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version;
// Measured canopies can make SwiftShader frames slow. Extend only scene
// scrolling/capture; functional assertions and the CI job deadline stay bounded.
const SCENE_CAPTURE_TIMEOUT=120000;
const report={version,checks:[],screenshots:[],styles:[],errors:[],
  sceneEvidence:'Canvas screenshots and pixel comparisons require the public diagnostics to report WebGL. Editor and catalogue screenshots show the browser interface.'};
const check=name=>{report.checks.push(name);console.log('STUDIO_CHECK '+name);};
let page,server,browser,base=process.env.BASE_URL?.replace(/\/$/,'');
if(!base){
  const publicDir=path.join(root,'public');
  const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'};
  server=createServer(async(req,res)=>{
    try{
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      const file=path.resolve(publicDir,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
      if(!file.startsWith(publicDir+path.sep))throw Error('Invalid path');
      const data=await readFile(file);
      res.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream','Cache-Control':'no-store'});res.end(data);
    }catch{res.writeHead(404);res.end();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  base='http://127.0.0.1:'+server.address().port;
}
const el=selector=>page.locator(selector);
const waitFrames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const stats=()=>el('#render-diagnostics').evaluate(node=>Object.fromEntries(Object.entries(node.dataset).map(([k,v])=>
  [k,k==='renderer'?v:k==='motionActive'?v==='true':Number(v)])));
const sceneVisible=async()=>{
  await el('#scene-host').scrollIntoViewIfNeeded({timeout:SCENE_CAPTURE_TIMEOUT});
  await page.waitForFunction(()=>document.querySelector('#render-diagnostics').dataset.renderer==='webgl'&&
    Number(document.querySelector('#render-diagnostics').dataset.frames)>0);
  await page.waitForFunction(()=>{const d=document.querySelector('#render-diagnostics').dataset;
    return Number(d.surfaceAssetsRequested)>0&&d.surfaceAssetsLoaded===d.surfaceAssetsRequested&&d.surfaceAssetsFailed==='0';});
  await waitFrames();
};
async function ready(){
  await el('#loading').waitFor({state:'hidden',timeout:90000});
  await el('#scene-host canvas').waitFor({state:'visible',timeout:60000});
  assert.equal(await el('meta[name="application-version"]').getAttribute('content'),version);
  await sceneVisible();
}
async function style(id){
  await el('#designStyle').selectOption(id);
  await page.waitForFunction(value=>document.querySelector('#design-studio').dataset.style===value,id);
  await sceneVisible();
}
async function details(){
  const node=el('.studio-details');
  if(await node.getAttribute('open')===null)await node.locator(':scope > summary').click();
}
async function shot(name,selector){
  const filename=name+'.png',options={path:path.join(evidence,filename),animations:'disabled',scale:'css'};
  const sceneCapture=selector==='#scene-host canvas';
  if(sceneCapture)options.timeout=SCENE_CAPTURE_TIMEOUT;
  const target=selector?el(selector):page;
  if(selector)await target.scrollIntoViewIfNeeded(sceneCapture?{timeout:SCENE_CAPTURE_TIMEOUT}:{});
  if(selector==='#scene-host canvas')assert.equal((await stats()).renderer,'webgl',name);
  // Playwright captures overlays above the canvas, including a toast triggered
  // by the preceding download. Wait for both its class and opacity transition
  // so fixed-camera pixel differences measure the garden itself.
  if(name!=='failure')await page.waitForFunction(()=>{
    const toast=document.getElementById('toast');
    return !toast.classList.contains('visible') && Number(getComputedStyle(toast).opacity)===0;
  });
  await waitFrames();
  const image=await target.screenshot(options);report.screenshots.push(filename);return image;
}
async function exportDesign(){
  const result=page.waitForEvent('download');
  await el('#export').click();
  return JSON.parse(await readFile(await (await result).path(),'utf8'));
}
async function pixelChange(a,b){
  return page.evaluate(async bytes=>{
    const decode=async base64=>{
      const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();
      const canvas=new OffscreenCanvas(image.width,image.height),ctx=canvas.getContext('2d');
      ctx.drawImage(image,0,0);return ctx.getImageData(0,0,canvas.width,canvas.height);
    };
    const [a,b]=await Promise.all(bytes.map(decode));
    if(a.width!==b.width||a.height!==b.height)throw Error('Camera viewport resized');
    let pixels=0;for(let i=0;i<a.data.length;i+=4){
      if(Math.max(...[0,1,2].map(c=>Math.abs(a.data[i+c]-b.data[i+c])))>15)pixels++;
    }
    return {pixels,fraction:pixels/(a.width*a.height)};
  },[a.toString('base64'),b.toString('base64')]);
}
const expectMotion=active=>page.waitForFunction(value=>document.querySelector('#render-diagnostics').dataset.motionActive===String(value),active);
const cameraTime=()=>page.evaluate(()=>({
  mode:document.querySelector('#viewport').dataset.mode,preset:document.querySelector('#viewpoints [aria-pressed="true"]')?.dataset.preset,
  yaw:document.querySelector('[data-look-yaw][aria-pressed="true"]')?.dataset.lookYaw,
  date:document.querySelector('#sun-date').value,time:document.querySelector('#sun-time').value,
  observer:document.querySelector('#observer-readout').textContent,
}));
async function houseScope(active,afterFrame=null){
  await sceneVisible();
  assert.equal(await el('#styleHouseFinish').isChecked(),active);
  assert.equal(await el('#studio-house-scope').getAttribute('data-renovated'),String(active));
  // The controls update synchronously; performance counters are published only
  // after the next rendered frame. Scrolling an offscreen scene into view can
  // deliver its IntersectionObserver callback after sceneVisible's two rAFs.
  await page.waitForFunction(({active,afterFrame})=>{
    const d=document.querySelector('#render-diagnostics')?.dataset;if(!d)return false;
    const parts=Number(d.houseRenovationParts),projection=Number(d.houseRenovationProjection);
    return (afterFrame===null||Number(d.frames)>afterFrame)&&
      (active?parts>0&&projection>0&&projection<=.14:parts===0&&projection===0);
  },{active,afterFrame});
  const info=await stats();
  if(active){
    assert.ok(info.houseRenovationParts>0,'The rendered house has no renovation parts');
    assert.ok(info.houseRenovationProjection>0&&info.houseRenovationProjection<=.14,'Facade projection: '+info.houseRenovationProjection);
  }else{
    assert.equal(info.houseRenovationParts,0);
    assert.equal(info.houseRenovationProjection,0);
  }
  return info;
}
function canonicalScope(exported,id){
  const active=id!=='current';
  assert.equal(exported.settings.designStyle,id);
  assert.equal(exported.settings.styleHouseFinish,active);
  assert.equal(exported.settings.interiorLayout,active?'renovation':'existing');
  assert.equal(exported.settings.interiorStyle,'follow');
  assert.equal(exported.designPresentation.id,id);
  assert.equal(exported.designPresentation.houseFinishPreview,active);
  assert.equal(exported.costEstimate.style.houseRenovationIncluded,active);
  if(exported.siteId==='sternicza-11'){
    assert.equal(exported.interiors.selected.layout,active?'renovation':'existing');
    assert.equal(exported.settings.planExteriorApplied,active);
  }
}
const gardenSettings=settings=>Object.fromEntries(Object.entries(settings).filter(([key])=>
  /^(garden|hedge|bed|screeningTrees|treeLeafMode|pool|jacuzzi|privacyPergola|spaScreens|sauna|coldPlunge|firepit|removeGarage)/.test(key)));
// Compare complete renovation states at one fixed camera and solar moment.
// Turning renovation off now restores Current for the whole house and garden.
async function compareHouse(site,id){
  await details();
  await el('[data-preset="garden"]').click();
  await el('[data-look-yaw="180"]').click();
  const view=await cameraTime();
  assert.equal(view.mode,'eye');assert.equal(view.preset,'garden');assert.equal(view.yaw,'180');
  async function renderHouse(active){
    const previousFrame=(await stats()).frames;
    if(active)await style(id);else await el('#styleHouseFinish').uncheck();
    await sceneVisible();
    await page.waitForFunction(({active,previousFrame})=>{
      const data=document.querySelector('#render-diagnostics').dataset;
      return Number(data.frames)>previousFrame&&(Number(data.houseRenovationParts)>0)===active;
    },{active,previousFrame});
    assert.equal(await el('#designStyle').inputValue(),active?id:'current');assert.deepEqual(await cameraTime(),view);
    return houseScope(active);
  }
  const off=await renderHouse(false);
  const original=await shot(site+'-'+id+'-house-original','#scene-host canvas');
  const on=await renderHouse(true);
  const renovated=await shot(site+'-'+id+'-house-renovated','#scene-host canvas');
  const diff=await pixelChange(original,renovated);
  assert.ok(diff.pixels>100,site+' complete renovation comparison changed '+diff.pixels+' pixels');
  // A complete style replaces furniture as well as adding facade assemblies;
  // simpler replacement forms can reduce the total visible triangle count.
  assert.notEqual(on.triangles,off.triangles,site+' renovation did not change visible geometry: '+JSON.stringify({on,off}));
  assert.ok(on.houseRenovationParts>0&&off.houseRenovationParts===0,site+' facade renovation geometry was not applied: '+JSON.stringify({on,off}));
  (report.houseComparisons??=[]).push({site,id,view,diff,on,off});
}
async function settledInfo(){
  // Re-entering the viewport refreshes its public counters without changing
  // geometry. This also waits for the GPU to draw a complete frame on SwiftShader.
  await sceneVisible();
  await el('#scene-host canvas').screenshot({animations:'disabled',scale:'css',timeout:SCENE_CAPTURE_TIMEOUT});
  return stats();
}
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-dev-shm-usage']});
  const ctx=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1.5,reducedMotion:'reduce',acceptDownloads:true});
  page=await ctx.newPage();page.setDefaultTimeout(35000);page.on('pageerror',error=>report.errors.push(error.message));
  await page.goto(base+'/?site=sternicza-11',{waitUntil:'domcontentloaded'});await ready();
  const options=await el('#designStyle option').evaluateAll(nodes=>nodes.map(n=>n.value));
  assert.equal(new Set(options).size,23);assert.ok(options.includes('current'));assert.ok(options.includes('coastal'));assert.ok(options.includes('beach-house'));
  assert.equal(await el('#basementGarageEnabled').isChecked(),true);
  assert.equal((await settledInfo()).garageVehicles,2,'The fresh scene must contain two actual vehicles');
  await el('#style-open').click();assert.equal(await el('#style-search').evaluate(e=>e===document.activeElement),true);
  for(const query of ['Coastal','Hamptons','seaside']){
    await el('#style-search').fill(query);assert.equal(await el('[data-style-id="coastal"]').isVisible(),true,query);
  }
  await el('#style-search').fill('Beach House');assert.equal(await el('#style-grid button:visible').count(),1);assert.equal(await el('[data-style-id="beach-house"]').isVisible(),true);
  await el('#style-search').fill('Japandi');assert.equal(await el('#style-grid button:visible').count(),2);
  await el('#style-family').selectOption('Statement');assert.equal(await el('#style-empty').isVisible(),true);
  await el('#style-search').fill('');assert.equal(await el('#style-grid button:visible').count(),4);
  await page.keyboard.press('Escape');await el('#style-dialog').waitFor({state:'hidden'});
  assert.ok(await el('#style-open').evaluate(e=>e===document.activeElement));
  check('All 23 choices are accessible; Beach House has its own searchable entry, Coastal retains Hamptons and seaside aliases, and filtering/focus return work');

  await el('button[data-mode="orbit"]').click();await details();
  await el('#renderQuality').selectOption('eco');await sceneVisible();
  const eco=await settledInfo();
  assert.ok(eco.pixelRatio<=1.001&&eco.bufferWidth*eco.bufferHeight<=720000+4000&&eco.shadowSize<=1024&&eco.shadowSize>0,JSON.stringify(eco));
  await el('#renderQuality').selectOption('auto');await sceneVisible();
  const auto=await settledInfo();
  assert.ok(auto.pixelRatio<=1.751&&auto.bufferWidth*auto.bufferHeight<=2100000+4000&&auto.shadowSize<=2048&&auto.shadowSize>0,JSON.stringify(auto));
  report.quality={auto,eco};await el('#renderQuality').selectOption('eco');
  check('Automatic and Eco bound resolution and shadow texture size');

  if(await el('#showDimensions').isChecked())await el('#showDimensions').uncheck();
  await style('current');
  const firstOriginal=await exportDesign();canonicalScope(firstOriginal,'current');
  const firstOriginalFrame=await shot('sternicza-before-first-renovation','#scene-host canvas');
  await style('hidden-bali');
  const adopted=await exportDesign();canonicalScope(adopted,'hidden-bali');
  for(const [key,value]of Object.entries({canopyEnabled:true,terraceCoverType:'balcony',terraceWidth:10.77,canopyWidth:10.77,terraceDepth:4,canopyDepth:4}))assert.equal(adopted.settings[key],value,key);
  assert.equal(adopted.terraceCover.accesses.length,3);assert.equal(adopted.terraceCover.accessFits,true);
  assert.deepEqual(gardenSettings(adopted.settings),gardenSettings(firstOriginal.settings));
  await el('#studio-undo').click();await houseScope(false);
  const firstUndone=await exportDesign();canonicalScope(firstUndone,'current');
  assert.deepEqual(firstUndone.settings,firstOriginal.settings);
  report.firstAdoptionUndo=await pixelChange(firstOriginalFrame,await shot('sternicza-first-renovation-undone','#scene-host canvas'));
  assert.ok(report.firstAdoptionUndo.fraction<.001,JSON.stringify(report.firstAdoptionUndo));
  check('First style adoption installs the marked 4 m terrace, shared balcony and all three doors; Undo restores the complete original state');
  // Establish the neutral baseline after adopting the editable deck dimensions.
  // Current restores the house, while independent garden dimensions stay editable.
  await style('hidden-bali');await style('current');
  const before=await exportDesign();
  await sceneVisible();
  const original=await shot('sternicza-current','#scene-host canvas');
  const reference=await houseScope(false),selectedShots=new Map(),selectedInfo=new Map(),geometrySignatures=new Set();
  assert.equal(await el('#styleHouseFinish').isDisabled(),true);
  for(const id of options.filter(id=>id!=='current')){
    await style(id);
    const info=await houseScope(true);
    assert.equal(await el('#basementGarageEnabled').isChecked(),true,id+' must retain the garage');
    assert.equal(info.garageVehicles,2,id+' must retain both actual vehicle groups');
    geometrySignatures.add(info.houseRenovationParts);selectedInfo.set(id,info);
    if(['hidden-bali','space-age','mediterranean-villa','coastal','baltic-dune','beach-house','japandi'].includes(id)){
      const frame=await shot('sternicza-'+id,'#scene-host canvas');
      const diff=await pixelChange(original,frame);
      assert.ok(diff.pixels>100,id+' changed only '+diff.pixels+' canvas pixels');
      selectedShots.set(id,frame);report.styles.push({id,diff,stats:info});
    }else report.styles.push({id,stats:info});
  }
  for(const [a,b] of [['space-age','hidden-bali'],['mediterranean-villa','space-age'],['coastal','baltic-dune'],['beach-house','coastal'],['beach-house','baltic-dune']]){
    assert.ok((await pixelChange(selectedShots.get(a),selectedShots.get(b))).pixels>100,a+' and '+b+' look identical');
    assert.notEqual(selectedInfo.get(a).triangles,selectedInfo.get(b).triangles,a+' and '+b+' must change actual rendered geometry');
    assert.notEqual(selectedInfo.get(a).houseRenovationParts,selectedInfo.get(b).houseRenovationParts,a+' and '+b+' must use different physical facade assemblies');
  }
  assert.equal(geometrySignatures.size,22,'All 22 styles must change the rendered facade assemblies, not only their colours');
  await style('current');const reset=await houseScope(false);report.returnedResources={reference,reset};
  assert.equal(reset.garageVehicles,2,'Current preserves both garage vehicles');
  assert.equal(await el('#styleHouseFinish').isDisabled(),true);
  const restored=await shot('sternicza-current-restored','#scene-host canvas');
  report.currentRestoration=await pixelChange(original,restored);
  assert.ok(report.currentRestoration.fraction<.001,JSON.stringify(report.currentRestoration));
  assert.ok(reset.geometries<=reference.geometries+16&&reset.textures<=reference.textures+4,JSON.stringify(report.returnedResources));
  check('All 22 styles have distinct facade assemblies and retain both cars; Coastal differs from Baltic Dune and Current restores the neutral dwelling');

  await el('#style-open').click();await el('#style-search').fill('Bali');await el('[data-style-id="hidden-bali"]').focus();
  await page.keyboard.press('Enter');await el('#style-dialog').waitFor({state:'hidden'});
  assert.equal(await el('#designStyle').inputValue(),'hidden-bali');
  const baliHouse=await houseScope(true);
  const originalScope=await exportDesign();
  canonicalScope(originalScope,'hidden-bali');
  assert.equal(originalScope.designPresentation.id,'hidden-bali');assert.equal(originalScope.designPresentation.houseFinishPreview,true);
  assert.equal(originalScope.designPresentation.houseRenovation.partCount,baliHouse.houseRenovationParts);
  assert.equal(originalScope.designPresentation.houseRenovation.maxProjectionM,baliHouse.houseRenovationProjection);
  assert.equal(originalScope.costEstimate.style.houseRenovationIncluded,true);
  assert.deepEqual(originalScope.summary.observer,before.summary.observer);
  assert.deepEqual(gardenSettings(originalScope.settings),gardenSettings(before.settings));
  assert.equal(originalScope.terraceCover.type,'balcony');assert.equal(originalScope.terraceCover.accessFits,true);
  assert.equal(originalScope.costEstimate.style.unquoted.length,1);
  assert.equal(originalScope.costEstimate.style.knownBase.low,0);assert.equal(originalScope.costEstimate.style.knownBase.high,0);
  assert.ok(originalScope.designChecks.checks.length>0);
  const coverDepth=el('#canopyDepth-value');
  await coverDepth.waitFor({state:'visible'});
  await coverDepth.fill('3.6');await coverDepth.press('Tab');
  await style('japandi');const editedDeck=await exportDesign();canonicalScope(editedDeck,'japandi');
  assert.equal(editedDeck.settings.canopyDepth,3.6);assert.ok(Math.abs(editedDeck.terraceCover.bounds.y1-editedDeck.terraceCover.bounds.y0-3.6)<1e-7);
  assert.equal(editedDeck.settings.terraceDepth,4);
  await style('hidden-bali');assert.equal(Number(await coverDepth.inputValue()),3.6);
  await coverDepth.fill('4');await coverDepth.press('Tab');
  check('Switching between proposed styles preserves an independently edited balcony depth and the separate terrace depth');
  await compareHouse('sternicza-11','hidden-bali');
  await el('#styleHouseFinish').uncheck();
  await el('button[data-mode="orbit"]').click();
  await el('[data-preset="terrace"]').click();
  // The terrace preset selects the observer but preserves the active view.
  // Choose eye level explicitly to exercise camera preservation through history.
  assert.equal(await el('#viewport').getAttribute('data-mode'),'orbit');
  await el('button[data-mode="eye"]').click();
  await el('[data-studio-moment="golden"]').click();
  const viewpoint=await cameraTime();
  assert.equal(viewpoint.mode,'eye');assert.equal(viewpoint.preset,'terrace');
  const sunsetMinutes=originalScope.solar.sunsetMinutes;
  const goldenMinutes=Math.round(Math.max(0,Math.min(1439,sunsetMinutes-45)));
  const expectedTime=[Math.floor(goldenMinutes/60),goldenMinutes%60].map(n=>String(n).padStart(2,'0')).join(':');
  assert.equal(viewpoint.time,expectedTime);
  const beforeUndoFrame=(await stats()).frames;
  await el('#studio-undo').click();await houseScope(true,beforeUndoFrame);assert.deepEqual(await cameraTime(),viewpoint);
  await shot('sternicza-hidden-bali-terrace-golden-hour','#scene-host canvas');
  const beforeRedoFrame=(await stats()).frames;
  await el('#studio-redo').click();await houseScope(false,beforeRedoFrame);assert.deepEqual(await cameraTime(),viewpoint);
  report.goldenHourView=viewpoint;
  assert.equal(await el('#designStyle').inputValue(),'current');
  check('Keyboard selection applies a complete renovation. Undo and Redo of Current preserve the camera and golden-hour time');
  await el('#share').click();await page.waitForFunction(()=>location.hash.includes('renderQuality=eco'));
  const shared=new URLSearchParams(new URL(page.url()).hash.slice(1));
  assert.equal(shared.get('renderQuality'),'eco');assert.equal(shared.get('site'),'sternicza-11');
  assert.equal(shared.get('designStyle')??'current','current');
  await page.reload({waitUntil:'domcontentloaded'});await ready();await details();
  assert.equal(await el('#designStyle').inputValue(),'current');
  assert.equal(await el('#renderQuality').inputValue(),'eco');await houseScope(false);assert.deepEqual(await cameraTime(),viewpoint);
  const after=await exportDesign();canonicalScope(after,'current');
  assert.equal(after.designPresentation.houseRenovation.partCount,0);assert.equal(after.designPresentation.houseRenovation.active,false);
  assert.equal(after.settings.designStyle,'current');assert.equal(after.costEstimate.style.houseFinishPreview,false);
  // Reopen through local storage as well. A shared URL always takes precedence.
  await page.evaluate(()=>history.replaceState(null,'',location.pathname+location.search));
  await page.reload({waitUntil:'domcontentloaded'});await ready();await details();
  assert.equal(await el('#designStyle').inputValue(),'current');await houseScope(false);
  check('Restoring Current survives the share link, saved-design reload and JSON export without a hidden garden-only style');

  await style('hidden-bali');
  const assumptions=el('#budget-assumptions');
  if(await assumptions.getAttribute('open')===null)await assumptions.locator(':scope > summary').click();
  const quote=el('#costStyleUpgradeQuote');
  await quote.fill('20000');await quote.press('Tab');
  await page.waitForFunction(()=>document.querySelector('.cost-panel')?.dataset.styleKnownLow==='20000');
  await el('#styleHouseFinish').uncheck();assert.equal(Number(await quote.inputValue()),0);
  assert.equal(await el('#designStyle').inputValue(),'current');await houseScope(false);
  await el('#studio-undo').click();assert.equal(Number(await quote.inputValue()),20000);await houseScope(true);
  await style('space-age');
  await houseScope(true);
  assert.equal(Number(await quote.inputValue()),0);
  await el('#studio-undo').click();
  assert.equal(await el('#designStyle').inputValue(),'hidden-bali');
  assert.equal(Number(await quote.inputValue()),20000);
  await page.waitForFunction(()=>document.querySelector('.cost-panel')?.dataset.styleKnownLow==='20000');
  check('A 20,000 PLN renovation quote clears when Current or a different style is selected, and Undo restores its original scope');

  await el('#save-a').click();
  // A third, intermediate design distinguishes undoing the B edit from
  // incorrectly recording the temporarily displayed A as the previous edit.
  await style('space-age');await style('party-club');
  await el('#compare').click();assert.equal(await el('#designStyle').inputValue(),'hidden-bali');
  await el('#compare').click();assert.equal(await el('#designStyle').inputValue(),'party-club');
  await el('#studio-undo').click();assert.equal(await el('#designStyle').inputValue(),'space-age');
  assert.equal(Number(await quote.inputValue()),0);
  check('Save A and return to B preserve the intermediate real design as the Undo target');

  await el('[data-studio-moment="blue"]').click();await sceneVisible();
  await page.waitForFunction(()=>Number(document.querySelector('#viewport').dataset.nightActivation)>0);
  const blueView=await cameraTime(),nightState=()=>el('#viewport').evaluate(node=>({activation:Number(node.dataset.nightActivation),
    garden:Number(node.dataset.nightGarden),pendants:Number(node.dataset.nightPendants),hedge:Number(node.dataset.nightHedge),windows:Number(node.dataset.nightWindows)}));
  const blueBefore=await nightState();await style('hidden-bali');
  assert.deepEqual(await cameraTime(),blueView);assert.deepEqual(await nightState(),blueBefore);
  assert.ok(blueBefore.garden>0&&blueBefore.windows>0);
  await shot('sternicza-hidden-bali-blue-hour','#scene-host canvas');
  report.blueHour={view:blueView,lights:blueBefore};
  check('Blue-hour renovation switching preserves the real dusk activation, garden lights, neighbouring windows and camera');

  await style('beach-house');
  assert.ok(await el('#studio-living').isVisible());
  assert.match(await el('#studio-living-title').innerText(),/./);
  await el('[data-studio-moment="evening"]').click();await sceneVisible();
  await page.waitForFunction(()=>Number(document.querySelector('#viewport').dataset.nightActivation)>.5);
  await shot('sternicza-beach-house-evening','#scene-host canvas');
  report.beachEvening={view:await cameraTime(),lights:await nightState()};
  check('Beach House has a living guide and a one-click evening scene with active lighting');

  await el('button[data-mode="orbit"]').click();await sceneVisible();
  const shadowBefore=(await settledInfo()).shadowUpdates;
  await page.evaluate(()=>{
    document.querySelector('#sun-time').dispatchEvent(new Event('change',{bubbles:true}));
    document.querySelector('button[data-mode="orbit"]').click();window.dispatchEvent(new Event('resize'));
  });
  await sceneVisible();assert.equal((await settledInfo()).shadowUpdates,shadowBefore);
  check('Same solar time, orbit mode and viewport size do not refit the shadow camera');
  await el('#sceneMotion').check();await sceneVisible();await expectMotion(false);
  assert.equal(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),true);
  await page.emulateMedia({reducedMotion:'no-preference'});await sceneVisible();await expectMotion(true);
  await el('button[data-mode="plan"]').click();await expectMotion(false);
  await el('button[data-mode="orbit"]').click();await sceneVisible();await expectMotion(true);
  // Small viewport makes both ends of the workspace genuinely leave the scene.
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
  await page.waitForFunction(()=>{
    const rect=document.querySelector('#scene-host').getBoundingClientRect();
    return rect.bottom<=0||rect.top>=innerHeight;
  });
  await expectMotion(false);await sceneVisible();await expectMotion(true);
  // CDP executes the browser's page lifecycle, including visibilitychange.
  const cdp=await ctx.newCDPSession(page);
  await page.evaluate(()=>{
    window.__studioVisibilitySamples=[];
    document.addEventListener('visibilitychange',()=>window.__studioVisibilitySamples.push({hidden:document.hidden,motion:document.querySelector('#render-diagnostics').dataset.motionActive}));
  });
  await cdp.send('Page.setWebLifecycleState',{state:'frozen'});await cdp.send('Page.setWebLifecycleState',{state:'active'});
  await page.bringToFront();
  const lifecycle=await page.evaluate(()=>window.__studioVisibilitySamples);
  // Chrome's headless shell can freeze a foreground target without a visible →
  // hidden transition. Exercise the same DOM event deterministically in that case.
  if(!lifecycle.some(sample=>sample.hidden)){
    report.hiddenCheck='synthetic visibilitychange after headless foreground freeze';
    await page.evaluate(()=>{
      Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expectMotion(false);
    await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  }else{report.hiddenCheck='native browser visibilitychange';assert.ok(lifecycle.some(sample=>sample.hidden&&sample.motion==='false'));}
  await sceneVisible();await expectMotion(true);await el('#sceneMotion').uncheck();await expectMotion(false);
  report.visibilitySamples=lifecycle;check('Reduced motion, diagram/offscreen pauses and '+report.hiddenCheck);

  report.mobile=[];
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});await el('#style-open').click();
    assert.equal(await el('#style-grid button:visible').count(),23);
    const last=el('#style-grid button').last();await last.scrollIntoViewIfNeeded();
    assert.ok(await last.evaluate(e=>{const box=e.getBoundingClientRect();return box.bottom<=innerHeight+2&&box.top>=0;}));
    const measured=await page.evaluate(()=>({width:innerWidth,page:document.documentElement.scrollWidth,dialog:document.querySelector('#style-dialog').getBoundingClientRect().width,scroll:document.querySelector('#style-dialog').scrollWidth,client:document.querySelector('#style-dialog').clientWidth}));
    report.mobile.push(measured);assert.ok(measured.page<=width+2&&measured.dialog<=width+1&&measured.scroll<=measured.client+1,JSON.stringify(measured));
    await el('#style-search').scrollIntoViewIfNeeded();await shot('mobile-catalogue-'+width);
    await page.keyboard.press('Escape');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
  }
  check('390 px and 320 px editor and scrollable catalogue fit all 23 choices');
  await page.setViewportSize({width:1280,height:900});await page.emulateMedia({reducedMotion:'reduce'});
  for(const [site,id] of [['korzeniowskiego-40','organic-japandi'],['nadmorska-17','party-club']]){
    await page.goto(base+'/?site='+site,{waitUntil:'domcontentloaded'});await ready();
    await el('button[data-mode="orbit"]').click();await style('current');
    const originalProperty=await exportDesign();canonicalScope(originalProperty,'current');
    const ref=await el('#scene-host canvas').screenshot({scale:'css',timeout:SCENE_CAPTURE_TIMEOUT});
    await style(id);const frame=await shot(site+'-'+id,'#scene-host canvas');
    const diff=await pixelChange(ref,frame);assert.ok(diff.pixels>100,site+' pixels '+diff.pixels);
    const saved=await exportDesign();canonicalScope(saved,id);assert.equal(saved.siteId,site);assert.ok(saved.designChecks.checks.length>0);
    assert.deepEqual(saved.dimensions,originalProperty.dimensions,'Other properties retain their own garden geometry');
    assert.deepEqual(gardenSettings(saved.settings),gardenSettings(originalProperty.settings));
    assert.equal(saved.designPresentation.houseFinishPreview,true);
    assert.equal(saved.designPresentation.houseRenovation.partCount,(await stats()).houseRenovationParts);
    report.styles.push({site,id,diff,stats:await stats()});
    await compareHouse(site,id);
  }
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await shot('desktop-editor');
  check('Each mapped property renders a distinct renovation from its own garden viewpoint while retaining its own garden geometry');
  await page.goto(base+'/?site=sternicza-11#v=24&site=sternicza-11&designStyle=japandi',{waitUntil:'domcontentloaded'});await ready();
  assert.equal(await el('#designStyle').inputValue(),'japandi');await houseScope(true);
  check('An existing v24 styled link opens with its house renovation included');

  // Reproduce the reported loss in the previous release's active local save.
  // Only that last-used design is repaired; the archived comparison stays exact.
  const legacy=await exportDesign();
  await page.evaluate(({settings})=>{
    const prefix='garden-lab-sternicza-11-v';
    for(const key of Object.keys(localStorage))if(key.startsWith(prefix))localStorage.removeItem(key);
    const saved={...settings,basementGarageEnabled:false,garageSpaces:2};
    localStorage.setItem(prefix+'27',JSON.stringify(saved));
    localStorage.setItem(prefix+'27-A',JSON.stringify(saved));
    history.replaceState(null,'',location.pathname+'?site=sternicza-11');
  },legacy);
  await page.reload({waitUntil:'domcontentloaded'});await ready();
  assert.equal(await el('#basementGarageEnabled').isChecked(),true);
  assert.equal((await settledInfo()).garageVehicles,2);
  assert.equal(await page.evaluate(version=>JSON.parse(localStorage.getItem('garden-lab-sternicza-11-v'+version)).basementGarageEnabled,legacy.schemaVersion),true);
  await el('#compare').click();await sceneVisible();
  assert.equal(await el('#basementGarageEnabled').isChecked(),false,'Archived A must retain its original cellar comparison');
  assert.equal((await settledInfo()).garageVehicles,0);
  await el('#compare').click();await sceneVisible();assert.equal((await settledInfo()).garageVehicles,2);
  await page.reload({waitUntil:'domcontentloaded'});await ready();assert.equal((await settledInfo()).garageVehicles,2);
  check('The former active garage-off save is repaired once, while archived scenario A keeps its exact off choice');

  const garageSettings=el('#basement-garage-controls');
  if(await garageSettings.getAttribute('open')===null)await garageSettings.locator(':scope > summary').click();
  await el('#basementGarageEnabled').uncheck();
  for(const id of ['coastal','current']){await style(id);assert.equal((await settledInfo()).garageVehicles,0);}
  await el('#share').click();assert.equal(new URL(page.url()).hash.includes('basementGarageEnabled=false'),true);
  await page.reload({waitUntil:'domcontentloaded'});await ready();assert.equal((await settledInfo()).garageVehicles,0);
  await page.evaluate(()=>history.replaceState(null,'',location.pathname+location.search));
  await page.reload({waitUntil:'domcontentloaded'});await ready();assert.equal((await settledInfo()).garageVehicles,0);
  await page.goto(base+'/?site=sternicza-11#v=27&site=sternicza-11&basementGarageEnabled=false',{waitUntil:'domcontentloaded'});await ready();
  assert.equal((await settledInfo()).garageVehicles,0);
  check('A new explicit off choice survives style changes, sharing and normal reload; an explicit older off link is also preserved');

  await page.goto(base+'/?site=sternicza-11#v='+legacy.schemaVersion+'&site=sternicza-11&designStyle=coastal&basementGarageEnabled=true&showDimensions=false&renderQuality=eco',{waitUntil:'domcontentloaded'});await ready();
  await el('#garage-view').click();await sceneVisible();
  assert.equal((await settledInfo()).garageVehicles,2);
  const coastalGarage=await exportDesign();canonicalScope(coastalGarage,'coastal');
  assert.equal(coastalGarage.basementGarage.parking.spaces,2);
  assert.equal(coastalGarage.interiors.floors.basement.fixtures.filter(f=>f.kind==='car').length,2);
  await shot('sternicza-coastal-two-car-garage','#scene-host canvas');
  report.coastalGarage={vehicles:(await stats()).garageVehicles,parkingSpaces:2,style:coastalGarage.settings.designStyle};
  check('The final Coastal exterior renders two vehicles and exports the same two-car basement');
  assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){
  report.status='failed';report.error=error.stack||String(error);process.exitCode=1;
  if(page)try{report.sceneAtFailure=await el('#scene-host').evaluate(node=>({
    bounds:node.getBoundingClientRect().toJSON(),scroll:[scrollX,scrollY],visibility:document.visibilityState,
    diagnostics:{...document.querySelector('#render-diagnostics')?.dataset},
  }),null,{timeout:5000});}catch{}
  if(page)try{await shot('failure');}catch{}
  console.error(report.error);
}finally{
  await writeFile(path.join(evidence,'browser-report.json'),JSON.stringify(report,null,2));
  await browser?.close();if(server)await new Promise(r=>server.close(r));
  console.log('STUDIO_RESULT '+report.status+' ('+report.checks.length+' checks)');
}
