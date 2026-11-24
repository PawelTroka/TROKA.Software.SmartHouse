// Focused WebGL and editor regression for the optional corner-pavilion study.
// BASE_URL may target a review deployment; otherwise use the freshly built site.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {STATE_VERSION} from '../src/state.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const evidence=path.join(root,'test-results','pavilion');
await mkdir(evidence,{recursive:true});
const version=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version;
const SCENE_TIMEOUT=120000;
const report={version,checks:[],screenshots:[],errors:[],
  sceneEvidence:'Scene screenshots and pixel comparisons require real WebGL diagnostics. Plan, controls and mobile captures document the editor. These checks do not establish permitted height or construction feasibility.'};
const check=name=>{report.checks.push(name);console.log('PAVILION_CHECK '+name);};
let browser,page,server,base=process.env.BASE_URL?.replace(/\/$/,'');
const q=selector=>page.locator(selector);
const frames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const stats=()=>q('#render-diagnostics').evaluate(node=>Object.fromEntries(Object.entries(node.dataset).map(([key,value])=>
  [key,key==='renderer'?value:key==='motionActive'?value==='true':Number(value)])));
const viewContext=()=>page.evaluate(()=>({
  mode:document.getElementById('viewport').dataset.mode,
  badge:document.getElementById('view-badge-text').textContent,
  date:document.getElementById('sun-date').value,time:document.getElementById('sun-time').value,
  style:document.getElementById('designStyle').value,
}));

async function openDetails(selector){
  const details=q(selector);
  if(await details.getAttribute('open')===null)await details.locator(':scope > summary').click();
}
async function sceneVisible(afterFrame=null){
  await q('#scene-host').scrollIntoViewIfNeeded({timeout:SCENE_TIMEOUT});
  await page.waitForFunction(previous=>{
    const d=document.getElementById('render-diagnostics').dataset;
    return d.renderer==='webgl'&&Number(d.frames)>0&&(previous===null||Number(d.frames)>previous);
  },afterFrame,{timeout:SCENE_TIMEOUT});
  await page.waitForFunction(()=>{
    const d=document.getElementById('render-diagnostics').dataset;
    return Number(d.surfaceAssetsRequested)>0&&d.surfaceAssetsLoaded===d.surfaceAssetsRequested&&d.surfaceAssetsFailed==='0';
  },null,{timeout:SCENE_TIMEOUT});
  await frames();
}
async function renderedChange(action){
  const before=(await stats()).frames;
  await action();
  await sceneVisible(before);
}
async function ready(){
  await q('#loading').waitFor({state:'hidden',timeout:90000});
  await q('#scene-host canvas').waitFor({state:'visible',timeout:60000});
  assert.equal(await q('meta[name="application-version"]').getAttribute('content'),version);
  await sceneVisible();
  assert.ok((await stats()).triangles>0,'The scene must draw real geometry');
}
async function shot(name,selector){
  const filename=name+'.png',target=selector?q(selector):page;
  if(selector)await target.scrollIntoViewIfNeeded({timeout:SCENE_TIMEOUT});
  if(selector==='#scene-host canvas')assert.equal((await stats()).renderer,'webgl',name);
  if(name!=='failure')await page.waitForFunction(()=>{
    const toast=document.getElementById('toast');
    return !toast.classList.contains('visible')&&Number(getComputedStyle(toast).opacity)===0;
  });
  await frames();
  const image=await target.screenshot({path:path.join(evidence,filename),animations:'disabled',scale:'css',timeout:SCENE_TIMEOUT});
  report.screenshots.push(filename);return image;
}
async function exportDesign(){
  const pending=page.waitForEvent('download');
  await q('#export').click();
  return JSON.parse(await readFile(await (await pending).path(),'utf8'));
}
async function pixelChange(first,second){
  return page.evaluate(async images=>{
    const decode=async base64=>{
      const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();
      const canvas=new OffscreenCanvas(image.width,image.height),context=canvas.getContext('2d');
      context.drawImage(image,0,0);return context.getImageData(0,0,canvas.width,canvas.height);
    };
    const [a,b]=await Promise.all(images.map(decode));
    if(a.width!==b.width||a.height!==b.height)throw Error('Comparison viewport resized');
    let pixels=0;
    for(let i=0;i<a.data.length;i+=4)if(Math.max(Math.abs(a.data[i]-b.data[i]),Math.abs(a.data[i+1]-b.data[i+1]),Math.abs(a.data[i+2]-b.data[i+2]))>15)pixels++;
    return {pixels,fraction:pixels/(a.width*a.height)};
  },[first.toString('base64'),second.toString('base64')]);
}
const gardenSnapshot=exported=>({
  programme:exported.settings.gardenProgram,trees:exported.settings.screeningTrees,
  dimensions:exported.dimensions.filter(item=>['pool','jacuzzi','sauna','firepit','cold-plunge'].includes(item.feature)),
});
const pavilionSettings=exported=>Object.fromEntries(Object.entries(exported.settings).filter(([key])=>key.startsWith('pavilion')));
async function expectStudy(exported,expected){
  const p=exported.cornerPavilion;
  assert.equal(exported.settings.pavilionEnabled,true);assert.equal(p.enabled,true);
  for(const [key,value] of Object.entries(expected))assert.ok(Math.abs(p.dimensions[key]-value)<1e-6,key+': '+p.dimensions[key]);
  assert.equal(p.planning.status,'unverified');assert.equal(p.planning.draft.inForce,false);
  assert.ok(p.comparison&&p.comparison.before.total>0,'Selected eye must yield a PCK3 comparison');
  assert.equal(p.comparison.before.total,p.comparison.after.total);
  assert.ok(p.comparison.after.blocked>=p.comparison.before.blocked,'Adding construction must not remove existing screening');
  assert.equal(await q('#pavilion-before').textContent(),p.comparison.before.percent.toFixed(1)+'%');
  assert.equal(await q('#pavilion-after').textContent(),p.comparison.after.percent.toFixed(1)+'%');
  assert.equal(await q('#garden-program').inputValue(),'spa-pavilion');
  assert.ok(exported.privacyStructures.footprints.some(item=>item.id==='corner-pavilion'));
  assert.ok(exported.privacyStructures.footprints.some(item=>item.id==='pavilion-entry-landing'));
  const poolWidth=exported.dimensions.find(item=>item.id==='pool-width');
  assert.equal(poolWidth.a[0],2,'Pavilion pool should move to the west side');
  assert.equal(poolWidth.value,3.5);
}

try{
  if(!base){
    const publicDir=path.join(root,'public');
    const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'};
    server=createServer(async(req,res)=>{
      try{
        const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
        const file=path.resolve(publicDir,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
        if(!file.startsWith(publicDir+path.sep))throw Error('Invalid path');
        const content=await readFile(file);
        res.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream','Cache-Control':'no-store'});
        res.end(content);
      }catch{if(!res.headersSent)res.writeHead(404);res.end();}
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    base='http://127.0.0.1:'+server.address().port;
  }
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1,reducedMotion:'reduce',acceptDownloads:true});
  page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',error=>report.errors.push(error.message));
  const initial=new URLSearchParams({v:String(STATE_VERSION),site:'sternicza-11',mode:'orbit',renderQuality:'eco',sceneMotion:'false',
    sunEnabled:'true',sunDate:'2026-06-21',sunMinutes:'720',showDimensions:'false'});
  await page.goto(base+'/?site=sternicza-11#'+initial,{waitUntil:'domcontentloaded'});await ready();
  await renderedChange(()=>q('#designStyle').selectOption('beach-house'));
  // Fresh designs may start in the dedicated basement-ramp close-up. The rear
  // building is outside that view, even though the public mode is "orbit".
  // Reset through the real control before recording the fixed garden camera.
  await renderedChange(()=>q('#reset-camera').click());
  assert.equal((await viewContext()).mode,'orbit');
  assert.doesNotMatch((await viewContext()).badge,/basement garage/i);
  await openDetails('#corner-pavilion-panel');
  assert.equal(await q('#pavilionEnabled').isChecked(),false);
  assert.equal(await q('#pavilion-settings').isVisible(),false);
  const original=await exportDesign();assert.equal(original.cornerPavilion.enabled,false);
  const baseline=await shot('01-original-garden-orbit','#scene-host canvas');
  report.original={stats:await stats(),programme:original.settings.gardenProgram,view:await viewContext()};

  await renderedChange(()=>q('#pavilionEnabled').check());
  const rear=await exportDesign();await expectStudy(rear,{height:6.5,x:12.2,y:29,width:5,depth:5.8});
  assert.equal(await q('#pavilion-settings').isVisible(),true);
  assert.deepEqual(rear.settings.screeningTrees,original.settings.screeningTrees);
  assert.equal(rear.settings.gardenProgram,original.settings.gardenProgram);
  const rearFrame=await shot('02-rear-corner-6-5m-orbit','#scene-host canvas');
  report.enableDifference=await pixelChange(baseline,rearFrame);
  assert.ok(report.enableDifference.pixels>100,'Enabling the alternative did not change the rendered garden');
  report.rear=rear.cornerPavilion;
  check('The optional 6.5 m pavilion renders, moves the pool west, retains planting and agrees with its live PCK3 readout');

  const lowStats=await stats(),lowView=await viewContext();
  await renderedChange(()=>q('[data-pavilion-height="10"]').click());
  const high=await exportDesign();await expectStudy(high,{height:10,x:12.2,y:29});
  const highFrame=await shot('03-rear-corner-10m-orbit','#scene-host canvas');
  report.heightRendering={before:lowStats,after:await stats(),beforeView:lowView,afterView:await viewContext(),
    beforeRoof:rear.cornerPavilion.dimensions,afterRoof:high.cornerPavilion.dimensions,
    changedSettings:Object.keys(high.settings).filter(key=>JSON.stringify(high.settings[key])!==JSON.stringify(rear.settings[key])).sort()};
  assert.deepEqual(report.heightRendering.changedSettings,['pavilionHeight'],'Height comparison must change only the pavilion height');
  assert.deepEqual(report.heightRendering.afterView,lowView,'Height comparison must retain its garden camera, style and solar moment');
  report.heightDifference=await pixelChange(rearFrame,highFrame);
  assert.ok(report.heightDifference.pixels>100,'Height control did not change actual rendered geometry');
  assert.notEqual((await stats()).triangles,lowStats.triangles,'Storey change did not rebuild rendered construction');
  assert.ok(high.cornerPavilion.dimensions.roofZ>rear.cornerPavilion.dimensions.roofZ);
  check('Height presets rebuild actual WebGL geometry and update the modelled roof level and analysis');

  await renderedChange(()=>q('[data-pavilion-placement="near-garage"]').click());
  const moved=await exportDesign();await expectStudy(moved,{height:10,x:11.4,y:24.7,width:5.8,depth:5.2});
  const movedFrame=await shot('04-near-house-10m-orbit','#scene-host canvas');
  report.placementDifference=await pixelChange(highFrame,movedFrame);
  assert.ok(report.placementDifference.pixels>100,'Placement control did not move the actual rendered building');
  await renderedChange(async()=>{await q('#pavilionHeight-value').fill('8.2');await q('#pavilionHeight-value').press('Tab');});
  assert.equal(await q('#pavilionHeight').inputValue(),'8.2');
  const near=await exportDesign();await expectStudy(near,{height:8.2,x:11.4,y:24.7,width:5.8,depth:5.2});
  assert.equal(await q('[data-pavilion-placement="near-garage"]').getAttribute('aria-pressed'),'true');
  const nearFrame=await shot('04-near-house-8-2m-orbit','#scene-host canvas');
  report.numericHeightDifference=await pixelChange(movedFrame,nearFrame);
  assert.ok(report.numericHeightDifference.pixels>100,'Numeric height edit did not change the actual rendered building');
  report.near=near.cornerPavilion;
  await shot('05-pavilion-study-panel','#corner-pavilion-panel');
  await q('button[data-mode="plan"]').click();
  await q('#plan-host').waitFor({state:'visible'});
  assert.equal(await q('#plan-host [data-privacy-footprint="corner-pavilion"]').count(),1);
  assert.equal(await q('#plan-host [data-privacy-footprint="pavilion-entry-landing"]').count(),1);
  await shot('06-alternative-plan','#plan-host');
  await renderedChange(()=>q('[data-pavilion-view="sofa"]').click());
  assert.equal(await q('#viewport').getAttribute('data-mode'),'eye');
  assert.equal(await q('[data-pavilion-view="sofa"]').getAttribute('aria-pressed'),'true');
  await expectStudy(await exportDesign(),{height:8.2});
  await shot('07-living-room-eye','#scene-host canvas');
  check('Both placements, numeric height, plan footprint, entrance and living-room viewpoint stay in sync');

  await renderedChange(()=>q('button[data-mode="orbit"]').click());
  await renderedChange(()=>q('[data-studio-moment="evening"]').click());
  assert.ok(Number(await q('#viewport').getAttribute('data-night-garden'))>0);
  const lit=await shot('08-pavilion-garden-evening','#scene-host canvas');
  await openDetails('#night-adjustments');
  await renderedChange(()=>q('#nightGardenLights').uncheck());
  assert.equal(Number(await q('#viewport').getAttribute('data-night-garden')),0);
  const dark=await shot('09-garden-light-master-off','#scene-host canvas');
  report.nightDifference=await pixelChange(lit,dark);
  assert.ok(report.nightDifference.pixels>100,'Garden master switch did not affect the rendered evening');
  await renderedChange(()=>q('#nightGardenLights').check());
  await openDetails('#sun-controls');
  await renderedChange(async()=>{await q('#sun-time').fill('12:00');await q('#sun-time').press('Tab');});
  assert.equal(Number(await q('#viewport').getAttribute('data-night-garden')),0);
  check('Evening lights render, the garden master switch extinguishes them and daylight removes their glow');

  await q('#save-a').click();
  await renderedChange(()=>q('#pavilionEnabled').uncheck());
  const restored=await exportDesign();
  assert.equal(restored.cornerPavilion.enabled,false);
  assert.equal(await q('#pavilion-settings').isVisible(),false);
  assert.equal(await q('#garden-program').inputValue(),original.settings.gardenProgram);
  assert.deepEqual(gardenSnapshot(restored),gardenSnapshot(original));
  assert.ok(!restored.privacyStructures.footprints.some(item=>item.group==='pavilion'));
  // Hidden plan DOM is intentionally lazy; the exported footprints and the
  // active rendered scene are the current state while Orbit is selected.
  await shot('10-original-garden-restored','#scene-host canvas');
  report.restoredStats=await stats();
  await renderedChange(()=>q('#compare').click());
  const saved=await exportDesign();await expectStudy(saved,{height:8.2,x:11.4,y:24.7});
  assert.deepEqual(pavilionSettings(saved),pavilionSettings(near));
  await renderedChange(()=>q('#compare').click());
  assert.equal((await exportDesign()).cornerPavilion.enabled,false);
  await renderedChange(()=>q('#pavilionEnabled').check());
  await renderedChange(()=>q('#garden-program').selectOption(original.settings.gardenProgram));
  assert.equal(await q('#pavilionEnabled').isChecked(),false,'Choosing a garden programme must leave the pavilion alternative');
  assert.equal((await exportDesign()).cornerPavilion.enabled,false);
  check('Switching off restores original pool/spa dimensions and planting; Save A/B and the garden selector preserve or exit the alternative correctly');

  await renderedChange(()=>q('#pavilionEnabled').check());
  const beforeShare=await exportDesign();
  await q('#share').click();
  await page.waitForFunction(()=>location.hash.includes('pavilionEnabled=true')&&location.hash.includes('pavilionHeight=8.2'));
  const shared=page.url();
  await page.reload({waitUntil:'domcontentloaded'});await ready();
  assert.doesNotMatch((await viewContext()).badge,/basement garage/i,'A shared pavilion study must open at the garden');
  const sharedDesign=await exportDesign();
  assert.deepEqual(pavilionSettings(sharedDesign),pavilionSettings(beforeShare));
  assert.equal(sharedDesign.settings.designStyle,'beach-house');
  await page.evaluate(()=>history.replaceState(null,'',location.pathname+location.search));
  await page.reload({waitUntil:'domcontentloaded'});await ready();
  assert.doesNotMatch((await viewContext()).badge,/basement garage/i,'A saved pavilion study must open at the garden');
  assert.deepEqual(pavilionSettings(await exportDesign()),pavilionSettings(beforeShare));
  report.sharedHash=new URL(shared).hash;
  check('Shared URLs and a local saved-design reload retain pavilion dimensions, placement, height and Beach House style');

  report.mobile=[];
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});
    await openDetails('#corner-pavilion-panel');
    await q('#pavilionEnabled').scrollIntoViewIfNeeded();
    const size=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,
      controls:[...document.querySelectorAll('#corner-pavilion-panel input,#corner-pavilion-panel button')]
        .filter(node=>node.getClientRects().length).map(node=>({id:node.id||node.textContent.trim(),left:node.getBoundingClientRect().left,right:node.getBoundingClientRect().right}))}));
    assert.ok(size.width<=size.viewport+1,'Horizontal page overflow: '+JSON.stringify(size));
    assert.ok(size.controls.every(control=>control.left>=-1&&control.right<=size.viewport+1),'Pavilion control overflow: '+JSON.stringify(size));
    assert.equal(await q('#pavilionHeight-value').inputValue(),'8.2');
    await shot('11-mobile-'+width+'-pavilion','#corner-pavilion-panel');
    report.mobile.push(size);
  }
  check('Open pavilion controls fit 390 px and 320 px screens without horizontal overflow');
  assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){
  report.status='failed';report.error=error.stack||String(error);process.exitCode=1;console.error(report.error);
  if(page)try{await shot('failure');}catch{}
}finally{
  await writeFile(path.join(evidence,'browser-report.json'),JSON.stringify(report,null,2));
  await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));
  console.log('PAVILION_RESULT '+report.status);
}
