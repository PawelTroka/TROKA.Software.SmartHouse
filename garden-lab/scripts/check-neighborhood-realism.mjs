/** Public WebGL/UI acceptance for measured neighbours and the sea-height tool.
 * CI serves the freshly built public/ tree. BASE_URL can target a review build.
 * Screenshots are real browser output; no synthetic renderer is substituted.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {STATE_VERSION} from '../src/state.js';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(project,'test-results','neighborhood-realism');
const version=JSON.parse(await readFile(path.join(project,'package.json'),'utf8')).version;
const source=JSON.parse(await readFile(path.join(project,'data/sternicza-surrounding-nature.json'),'utf8'));
const expectedCanopies=490;
assert.equal(source.canopies.length,expectedCanopies,'Update the acceptance baseline when the measured canopy extract intentionally changes');
await mkdir(output,{recursive:true});
let server,browser,page,baseURL=process.env.BASE_URL?.replace(/\/$/,'');
const report={version,startedAt:new Date().toISOString(),expectedCanopies,checks:[],screenshots:[],pageErrors:[],consoleErrors:[],failedRequests:[],sourceResponses:{}};

if(!baseURL){
  const root=path.join(project,'public');
  const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
  server=createServer(async(req,res)=>{
    try{
      const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
      const file=path.resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
      if(!file.startsWith(root+path.sep)||!(await stat(file)).isFile())throw new Error('Not a public file');
      res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
      res.end(await readFile(file));
    }catch{res.writeHead(404);res.end();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  baseURL='http://127.0.0.1:'+server.address().port;
}

const el=selector=>page.locator(selector);
const frames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const check=label=>{report.checks.push(label);console.log('NEIGHBORHOOD_CHECK '+label);};
const diagnostics=()=>el('#render-diagnostics').evaluate(node=>({...node.dataset}));

async function sceneReady(){
  await el('#scene-host').scrollIntoViewIfNeeded();
  await el('#scene-host canvas').waitFor({state:'visible',timeout:90000});
  await page.waitForFunction(()=>{
    const d=document.querySelector('#render-diagnostics')?.dataset;
    return d?.renderer==='webgl'&&Number(d.frames)>0&&d.interacting==='false'&&
      Number(d.surfaceAssetsRequested)>0&&d.surfaceAssetsLoaded===d.surfaceAssetsRequested&&d.surfaceAssetsFailed==='0';
  },null,{timeout:120000});
  await frames();
}

async function ready(){
  await el('#loading').waitFor({state:'hidden',timeout:120000});
  assert.equal(await el('meta[name="application-version"]').getAttribute('content'),version);
  await page.waitForFunction(()=>document.querySelector('#observer-readout')?.textContent.startsWith('Eye '));
  await sceneReady();
}

async function capture(name,selector='#scene-host'){
  const node=el(selector);await node.scrollIntoViewIfNeeded();
  if(selector==='#scene-host')await sceneReady();else await frames();
  const filename=name+'.png';
  const pixels=await node.screenshot({path:path.join(output,filename),animations:'disabled',scale:'css',timeout:120000});
  report.screenshots.push(filename);return pixels;
}

async function changedPixels(before,after){
  return page.evaluate(async({before,after})=>{
    const decode=async data=>{
      const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();
      const canvas=new OffscreenCanvas(image.width,image.height),context=canvas.getContext('2d');context.drawImage(image,0,0);
      return {width:image.width,height:image.height,data:context.getImageData(0,0,image.width,image.height).data};
    };
    const a=await decode(before),b=await decode(after);
    if(a.width!==b.width||a.height!==b.height)throw new Error('The camera canvas changed size during a foliage comparison');
    let changed=0;
    for(let i=0;i<a.data.length;i+=4)if(Math.max(Math.abs(a.data[i]-b.data[i]),Math.abs(a.data[i+1]-b.data[i+1]),Math.abs(a.data[i+2]-b.data[i+2]))>12)changed++;
    return changed;
  },{before:before.toString('base64'),after:after.toString('base64')});
}

async function neighborhoodStatus(pattern){
  await page.waitForFunction(source=>new RegExp(source).test(document.querySelector('#existing-nature-status')?.textContent||''),pattern);
  await sceneReady();
}

async function mobileBounds(selector){
  return el(selector).evaluate(node=>{
    const box=node.getBoundingClientRect();
    return {viewport:innerWidth,page:document.documentElement.scrollWidth,left:box.left,right:box.right,width:box.width,
      overflowingChildren:[...node.querySelectorAll('select,svg,input[type="range"]')].filter(child=>{
        const r=child.getBoundingClientRect();return r.width>0&&(r.left<-.5||r.right>innerWidth+1);
      }).map(child=>child.tagName+':'+(child.id||child.className.baseVal||child.className||''))};
  });
}

try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||process.env.GARDEN_BROWSER_EXECUTABLE||undefined,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1,reducedMotion:'reduce'});
  page=await context.newPage();page.setDefaultTimeout(45000);
  page.on('pageerror',error=>report.pageErrors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(message.text());});
  page.on('requestfailed',request=>report.failedRequests.push({url:request.url(),reason:request.failure()?.errorText}));
  page.on('response',response=>{
    const filename=new URL(response.url()).pathname.split('/').at(-1);
    if(['sternicza-surrounding-nature.json','sternicza-neighbor-roofs.json','sternicza-sea-corridor.json'].includes(filename))report.sourceResponses[filename]=response.status();
  });
  const initialHash=new URLSearchParams({v:String(STATE_VERSION),site:'sternicza-11',mode:'orbit',renderQuality:'eco',sceneMotion:'false',showDimensions:'false',basementGarageEnabled:'false',existingVegetation:'true',existingCanopyAnalysis:'true',existingLeafMode:'summer'});
  await page.goto(baseURL+'/?site=sternicza-11#'+initialHash,{waitUntil:'domcontentloaded',timeout:90000});await ready();
  await el('button[data-mode="orbit"]').click();await sceneReady();
  assert.equal(await el('#neighborhood-controls').isVisible(),true);
  assert.equal(await el('#neighborhood-tree-count').innerText(),`${expectedCanopies} measured canopy groups`);
  assert.equal(await el('#existingVegetation').isChecked(),true);
  assert.equal(await el('#existingCanopyAnalysis').isChecked(),true);
  assert.equal(await el('#existingLeafMode').inputValue(),'summer');
  await neighborhoodStatus(`^${expectedCanopies} leafy crowns shown`);
  report.initialDiagnostics=await diagnostics();
  const facadeCounts=JSON.parse(report.initialDiagnostics.contextFacades||'{}');
  const balconyCounts=JSON.parse(report.initialDiagnostics.contextBalconies||'{}');
  const envelopes=JSON.parse(report.initialDiagnostics.contextEnvelopes||'{}');
  for(const floor of [0,1,2])assert.equal(facadeCounts[`building-8:front:${floor}`],3,'Segmented front must render its observed bays once');
  for(const floor of [0,1])assert.equal(facadeCounts[`building-2:rear:${floor}`],3,'9a grouped garden openings must reach the window batch');
  assert.equal(facadeCounts['building-3:rear:0'],1);
  assert.equal(facadeCounts['building-3:rear:1'],2);
  assert.equal(balconyCounts['building-2:rear:projecting'],2);
  assert.equal(balconyCounts['building-3:rear:recessed'],1);
  for(const id of ['building-9','building-15','building-29']){
    assert.equal(envelopes[id]?.features.pyramid,1,'PCK central rooflight must be a separate rendered feature');
    assert.equal(envelopes[id]?.features.chimney,6,'All six observed chimney stacks must reach the scene');
  }
  assert.equal(Object.keys(envelopes).length,12,'Nine measured house roofs and three PCK roofs use resolved scene envelopes');
  report.correctedBuildingGeometry={facadeCounts,balconyCounts,envelopes};
  check('Corrected house openings, balconies and all twelve resolved roof envelopes reach the active WebGL scene');
  const summer=await capture('sternicza-neighborhood-leaf-on');
  check('Sternicza loads real WebGL, photographic assets, 490 measured canopy groups and all neighbourhood controls');

  await el('#existingLeafMode').selectOption('winter');await neighborhoodStatus('^0 leafy crowns shown');
  const winter=await capture('sternicza-neighborhood-leaf-off');
  report.summerWinterChangedPixels=await changedPixels(summer,winter);
  assert.ok(report.summerWinterChangedPixels>200,'Leaf-off must visibly remove the measured foliage from the actual WebGL scene');
  await el('#existingVegetation').uncheck();await neighborhoodStatus('Existing canopies hidden and excluded');
  assert.equal(await el('#existingCanopyAnalysis').isDisabled(),true);
  const hidden=await capture('sternicza-neighborhood-hidden');
  report.summerHiddenChangedPixels=await changedPixels(summer,hidden);
  assert.ok(report.summerHiddenChangedPixels>200,'Hiding existing vegetation must change the actual rendered scene');
  await el('#existingVegetation').check();await el('#existingLeafMode').selectOption('summer');
  await neighborhoodStatus(`^${expectedCanopies} leafy crowns shown`);
  assert.equal(await el('#existingCanopyAnalysis').isEnabled(),true);
  await el('#existingCanopyAnalysis').uncheck();await neighborhoodStatus('excluded from numerical privacy and shade');
  await el('#existingCanopyAnalysis').check();await neighborhoodStatus('included in privacy and shade');
  check('Leaf-on, leaf-off, hidden and numerical-canopy controls update the public scene and readouts');

  const studio=el('.studio-details');
  if(await studio.getAttribute('open')===null)await studio.locator('summary').first().click();
  await el('#renderQuality').selectOption('high');await sceneReady();
  await page.waitForFunction(()=>document.querySelector('#render-quality-status')?.textContent.startsWith('High detail'));
  await capture('sternicza-neighborhood-high-detail');report.highDetailDiagnostics=await diagnostics();
  await el('#renderQuality').selectOption('eco');await sceneReady();
  await studio.locator('summary').first().click();
  check('High-detail neighbourhood screenshot comes from the active WebGL renderer');

  const sea=el('#sea-view-panel');await sea.locator('.sea-profile-svg').waitFor({state:'attached',timeout:90000});
  await sea.scrollIntoViewIfNeeded();
  assert.equal(await sea.isVisible(),true);
  assert.equal(await sea.locator('[data-sea-control="observerId"] option').count(),4);
  assert.ok(await sea.locator('[data-sea-control="profileId"] option').count()>40);
  assert.equal(await sea.locator('[data-sea-control="mode"]').inputValue(),'water');
  assert.equal(await sea.locator('.sea-status').getAttribute('data-status'),'blocked');
  assert.match(await sea.locator('.sea-primary strong').innerText(),/^~\d+ m$/);
  const mapBefore=await sea.locator('.sea-map-svg').getAttribute('aria-label');
  await sea.locator('[data-sea-control="observerId"]').selectOption('front');
  assert.equal(await sea.locator('[data-sea-control="observerId"]').inputValue(),'front');
  await sea.locator('[data-sea-control="profileId"]').selectOption('b0');
  assert.equal(await sea.locator('[data-sea-control="profileId"]').inputValue(),'b0');
  const mapAfter=await sea.locator('.sea-map-svg').getAttribute('aria-label');
  assert.notEqual(mapBefore,mapAfter,'A different bearing must change the north-up map description');
  await sea.locator('[data-sea-control="profileId"]').selectOption('best');
  await sea.locator('.sea-reveal').click();
  assert.equal(await sea.locator('.sea-status').getAttribute('data-status'),'clear');
  const rayBefore=await sea.locator('.sea-profile-svg path').last().getAttribute('d');
  const slider=sea.locator('#sea-eye-height');await slider.focus();await slider.press('Home');
  assert.equal(await sea.locator('.sea-status').getAttribute('data-status'),'blocked');
  assert.match(await sea.locator('.sea-height output').innerText(),/0\.5 m/);
  const rayAfter=await sea.locator('.sea-profile-svg path').last().getAttribute('d');
  assert.notEqual(rayBefore,rayAfter,'The height input must redraw the actual sightline while keyboard interaction is active');
  await sea.locator('[data-sea-control="mode"]').selectOption('horizon');
  assert.match(await sea.locator('.sea-explanation').innerText(),/geometric horizon/);
  await sea.locator('[data-sea-control="clearanceM"]').selectOption('2');
  assert.equal(await sea.locator('[data-sea-control="clearanceM"]').inputValue(),'2');
  await sea.locator('[data-sea-control="mode"]').selectOption('water');
  await sea.locator('.sea-reveal').click();
  assert.equal(await sea.locator('.sea-status').getAttribute('data-status'),'clear');
  report.seaReadout={threshold:await sea.locator('.sea-primary').innerText(),status:await sea.locator('.sea-status').innerText(),height:await sea.locator('.sea-height output').innerText()};
  await capture('sternicza-sea-height-desktop','#sea-view-panel');
  check('Sea observer, bearing, horizon/water mode, clearance, clearing-height preset and keyboard height input update the map/profile/status');

  await page.setViewportSize({width:390,height:844});await frames();
  await capture('sternicza-neighborhood-mobile','#neighborhood-controls');
  report.mobileNeighborhood=await mobileBounds('#neighborhood-controls');
  await capture('sternicza-sea-height-mobile','#sea-view-panel');
  report.mobileSea=await mobileBounds('#sea-view-panel');
  for(const bounds of [report.mobileNeighborhood,report.mobileSea]){
    assert.ok(bounds.page<=bounds.viewport+2,JSON.stringify(bounds));
    assert.ok(bounds.right<=bounds.viewport+2&&bounds.left>=-1,JSON.stringify(bounds));
    assert.deepEqual(bounds.overflowingChildren,[]);
  }
  check('Neighbourhood controls, sea selectors and both SVG diagrams fit 390 px without page or child overflow');

  await page.setViewportSize({width:1280,height:900});
  const otherHash=new URLSearchParams({v:String(STATE_VERSION),site:'nadmorska-17',mode:'orbit',renderQuality:'eco',sceneMotion:'false',showDimensions:'false'});
  await page.goto(baseURL+'/?site=nadmorska-17#'+otherHash,{waitUntil:'domcontentloaded',timeout:90000});await ready();
  assert.equal(await el('#site-select').inputValue(),'nadmorska-17');
  assert.equal(await el('#neighborhood-controls').isVisible(),false);
  assert.equal(await el('#sea-view-panel').isVisible(),false);
  check('Sternicza-only nature and sea tools stay hidden on Nadmorska 17 while its WebGL scene remains available');

  for(const file of ['sternicza-surrounding-nature.json','sternicza-neighbor-roofs.json','sternicza-sea-corridor.json'])assert.equal(report.sourceResponses[file],200,file);
  assert.deepEqual(report.pageErrors,[]);
  assert.deepEqual(report.consoleErrors,[]);
  report.status='passed';
}catch(error){
  report.status='failed';report.error=error.stack||String(error);process.exitCode=1;console.error(report.error);
  if(page)try{await page.screenshot({path:path.join(output,'failure.png'),animations:'disabled',timeout:15000});report.screenshots.push('failure.png');}catch{}
}finally{
  report.finishedAt=new Date().toISOString();
  await writeFile(path.join(output,'browser-report.json'),JSON.stringify(report,null,2));
  await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));
  console.log('NEIGHBORHOOD_RESULT '+JSON.stringify({status:report.status,checks:report.checks.length,screenshots:report.screenshots,report:path.join(output,'browser-report.json')}));
}
