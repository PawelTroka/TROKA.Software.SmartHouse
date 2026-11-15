/**
 * Browser regression for the Garden Lab night scene and upper-floor outlooks.
 * Runs against the build with real Chromium WebGL. All scenario changes use
 * visible controls; DOM readouts are the assertions, not private app state.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {UPPER_FLOOR_PRESETS} from '../src/viewpoints.js';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const publicRoot = path.join(project,'public');
const resultsRoot = path.join(project,'test-results');
const expectedVersion = JSON.parse(await readFile(path.join(project,'package.json'),'utf8')).version;
const report = {version:expectedVersion,checks:[],presets:[],screenshots:[]};
const pageErrors = [],consoleErrors = [];
await mkdir(resultsRoot,{recursive:true});

const contentTypes = {
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg',
  '.jpeg':'image/jpeg','.woff2':'font/woff2','.ico':'image/x-icon',
};
const server = createServer(async(req,res)=>{
  try {
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    const pathname = decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
    const file = path.resolve(publicRoot,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
    if(file!==publicRoot&&!file.startsWith(publicRoot+path.sep)){res.writeHead(403);res.end();return;}
    if(!(await stat(file)).isFile()){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':contentTypes[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(req.method==='HEAD'?undefined:await readFile(file));
  }catch(error){
    res.writeHead(error.code==='ENOENT'?404:500);
    res.end('Static test server: '+(error.code==='ENOENT'?'not found':'request failed'));
  }
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const baseURL = 'http://127.0.0.1:'+server.address().port;
let browser,page;
const check = label=>{report.checks.push(label);console.log('GARDEN_CHECK '+label);};

async function frames(){
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
async function waitReady(){
  await page.locator('#loading').waitFor({state:'hidden',timeout:60000});
  await page.locator('#scene-host canvas').waitFor({state:'visible',timeout:60000});
  await page.waitForFunction(()=>document.querySelector('#observer-readout')?.textContent.startsWith('Eye '));
  assert.equal(await page.locator('meta[name="application-version"]').getAttribute('content'),expectedVersion);
  assert.equal(await page.locator('#scene-host canvas').count(),1,'Real WebGL canvas is required; SVG fallback does not pass');
  await frames();
}
async function details(selector,open){
  const detail = page.locator(selector);
  if((await detail.getAttribute('open')!==null)!==open)await detail.locator('summary').first().click();
}
async function selectPreset(preset){
  const button = page.locator('[data-preset="'+preset.id+'"]');
  assert.equal(await button.getAttribute('aria-label'),preset.label);
  await button.click();
  await page.waitForFunction(label=>document.querySelector('#view-badge-text')?.textContent===label,preset.label);
  assert.equal(await button.getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#viewport').getAttribute('data-mode'),'eye');
  const eye = await page.locator('#observer-readout').innerText();
  assert.ok(eye.includes(preset.eyeHeight.toFixed(2)+' m above '),eye);
  assert.ok(eye.includes(preset.level==='first'?'first-floor level':'strych floor'),eye);
  const note = await page.locator('#upper-view-note').innerText();
  assert.ok(note.includes(preset.facing+' façade'),note);
  await frames();
  return {id:preset.id,eye,note};
}
async function lightState(){
  return await page.locator('#viewport').evaluate(node=>({
    activation:Number(node.dataset.nightActivation),garden:Number(node.dataset.nightGarden),
    pendants:Number(node.dataset.nightPendants),hedge:Number(node.dataset.nightHedge),
    windows:Number(node.dataset.nightWindows),mode:node.dataset.mode,
  }));
}
async function waitLight(key,test){
  await page.waitForFunction(({key,test})=>{
    const value=Number(document.querySelector('#viewport')?.dataset[key]);
    return test==='zero'?value===0:value>0;
  },{key,test});
}
async function setNumber(id,value){
  const field=page.locator('#'+id);
  await field.fill(String(value));
  await field.press('Tab');
  await frames();
  assert.equal(Number(await field.inputValue()),Number(value),'Number input did not retain '+id);
}
async function screenshot(name,log=true){
  await details('#sun-controls',false);
  await details('#night-adjustments',false);
  await page.locator('#viewport').scrollIntoViewIfNeeded();
  await frames();
  const buffer=await page.locator('#viewport').screenshot({
    path:path.join(resultsRoot,name+'.jpg'),type:'jpeg',quality:65,animations:'disabled',scale:'css',
  });
  report.screenshots.push(name+'.jpg');
  if(log)console.log('GARDEN_SCREENSHOT_B64 '+name+' image/jpeg '+buffer.toString('base64'));
  return buffer;
}


/** Read rendered PNGs, without accessing scene objects or private app state.
 * The blue-green pixel mask distinguishes water glow from warm path lights. */
async function waterGlowDifference(unlit,lit){
  return await page.evaluate(async({before,after})=>{
    const decode=async source=>{
      const picture=new Image();picture.src='data:image/png;base64,'+source;await picture.decode();
      const canvas=new OffscreenCanvas(picture.width,picture.height),context=canvas.getContext('2d');
      context.drawImage(picture,0,0);
      return {width:picture.width,height:picture.height,pixels:context.getImageData(0,0,picture.width,picture.height).data};
    };
    const off=await decode(before),on=await decode(after);
    if(off.width!==on.width||off.height!==on.height)throw new Error('Water comparison changed screenshot dimensions');
    let aquaPixels=0,brighterAquaPixels=0,brightnessGain=0;
    for(let i=0;i<on.pixels.length;i+=4){
      const [r,g,b]=on.pixels.subarray(i,i+3);
      if(g<=25||b<=20||g<r*1.15||b<r*1.12||g<b*.8||g>b*1.35)continue;
      aquaPixels++;
      const gain=(g+b-off.pixels[i+1]-off.pixels[i+2])/2;
      if(gain>2){brighterAquaPixels++;brightnessGain+=gain;}
    }
    return {width:on.width,height:on.height,aquaPixels,brighterAquaPixels,brightnessGain};
  },{before:unlit.toString('base64'),after:lit.toString('base64')});
}
/** The compared scene has fixed geometry, camera and window activity. Count
 * actual warm pixels brightened by a single pendant channel, not UI changes. */
async function warmLightDifference(unlit,lit){
  return await page.evaluate(async({before,after})=>{
    const decode=async source=>{
      const picture=new Image();picture.src='data:image/png;base64,'+source;await picture.decode();
      const canvas=new OffscreenCanvas(picture.width,picture.height),context=canvas.getContext('2d');
      context.drawImage(picture,0,0);
      return {width:picture.width,height:picture.height,pixels:context.getImageData(0,0,picture.width,picture.height).data};
    };
    const off=await decode(before),on=await decode(after);
    if(off.width!==on.width||off.height!==on.height)throw new Error('Pendant comparison changed screenshot dimensions');
    let changedPixels=0,warmBrightenedPixels=0,brightnessGain=0;
    for(let i=0;i<on.pixels.length;i+=4){
      const [r,g,b]=on.pixels.subarray(i,i+3),[r0,g0,b0]=off.pixels.subarray(i,i+3);
      if(Math.max(Math.abs(r-r0),Math.abs(g-g0),Math.abs(b-b0))>3)changedPixels++;
      const gain=(r+g+b-r0-g0-b0)/3;
      if(r>30&&g>15&&r>g*1.08&&g>b*1.08&&gain>2){warmBrightenedPixels++;brightnessGain+=gain;}
    }
    return {width:on.width,height:on.height,changedPixels,warmBrightenedPixels,brightnessGain};
  },{before:unlit.toString('base64'),after:lit.toString('base64')});
}
async function pngScreenshot(name){
  await details('#sun-controls',false);
  await details('#night-adjustments',false);
  await page.locator('#viewport').scrollIntoViewIfNeeded();
  await frames();
  await page.locator('#viewport').screenshot({path:path.join(resultsRoot,name+'.png'),type:'png',animations:'disabled',scale:'css'});
  report.screenshots.push(name+'.png');
}
async function chooseProperty(id){
  await Promise.all([
    page.waitForURL(url=>url.searchParams.get('site')===id&&!url.hash,{waitUntil:'domcontentloaded'}),
    page.locator('#site-select').selectOption(id),
  ]);
  await waitReady();
  assert.equal(await page.locator('#site-select').inputValue(),id);
  assert.equal(await page.locator('html').getAttribute('data-site'),id);
}
async function verifyPendantLighting(){
  await details('#night-adjustments',true);
  const original={
    garden:Number(await page.locator('#nightGardenIntensity-value').inputValue()),
    pendants:Number(await page.locator('#nightPendantIntensity-value').inputValue()),
    hedge:Number(await page.locator('#nightHedgeIntensity-value').inputValue()),
  };
  assert.equal(await page.locator('#nightPendantLights').isChecked(),true);
  assert.equal(await page.locator('#nightHedgeLights').isChecked(),true);
  assert.equal(original.pendants,65);assert.equal(original.hedge,55);
  await page.locator('#share').click();
  const designWithoutLighting=()=>Object.fromEntries([...new URLSearchParams(new URL(page.url()).hash.slice(1))]
    .filter(([key])=>!key.startsWith('night')).sort(([a],[b])=>a.localeCompare(b)));
  const originalDesign=designWithoutLighting();

  await setNumber('nightGardenIntensity-value',0);
  await waitLight('nightGarden','zero');
  await page.locator('#nightPendantLights').uncheck();
  await page.locator('#nightHedgeLights').uncheck();
  await waitLight('nightPendants','zero');await waitLight('nightHedge','zero');
  await frames();
  const noPendants=await page.locator('#scene-host').screenshot({type:'png',animations:'disabled',scale:'css'});

  await page.locator('#nightPendantLights').check();
  await waitLight('nightPendants','positive');
  await frames();
  const gardenOnly=await page.locator('#scene-host').screenshot({type:'png',animations:'disabled',scale:'css'});
  const pendantPixels=await warmLightDifference(noPendants,gardenOnly);
  assert.ok(pendantPixels.changedPixels>30&&pendantPixels.warmBrightenedPixels>12,
    'Garden pendants must visibly brighten warm scene pixels: '+JSON.stringify(pendantPixels));
  let lights=await lightState();
  assert.equal(lights.garden,0);assert.equal(lights.hedge,0);assert.ok(lights.windows>0);

  await page.locator('#nightPendantLights').uncheck();
  await waitLight('nightPendants','zero');
  await page.locator('#nightHedgeLights').check();
  await waitLight('nightHedge','positive');
  await frames();
  const hedgeOnly=await page.locator('#scene-host').screenshot({type:'png',animations:'disabled',scale:'css'});
  const hedgePixels=await warmLightDifference(noPendants,hedgeOnly);
  assert.ok(hedgePixels.changedPixels>30&&hedgePixels.warmBrightenedPixels>12,
    'Thuja-side lanterns must visibly brighten warm scene pixels: '+JSON.stringify(hedgePixels));
  lights=await lightState();
  assert.equal(lights.garden,0);assert.equal(lights.pendants,0);assert.ok(lights.windows>0);
  check('Garden pendants and thuja lanterns each brighten the actual WebGL scene independently of landscape accents');

  await page.locator('#nightPendantLights').check();
  await page.locator('#nightGardenLights').uncheck();
  for(const key of ['nightGarden','nightPendants','nightHedge'])await waitLight(key,'zero');
  assert.ok((await lightState()).windows>0,'Garden master must leave neighbouring windows independent');
  assert.equal(await page.locator('#nightPendantIntensity-value').isDisabled(),true);
  assert.equal(await page.locator('#nightHedgeIntensity-value').isDisabled(),true);
  await page.locator('#nightGardenLights').check();
  await waitLight('nightPendants','positive');await waitLight('nightHedge','positive');
  assert.equal((await lightState()).garden,0,'Restoring the master retains the zero accent dimmer');
  check('Garden master switches both hanging-light channels off while retaining their settings and neighbouring windows');

  await setNumber('nightPendantIntensity-value',27);
  await setNumber('nightHedgeIntensity-value',43);
  lights=await lightState();
  assert.ok(Math.abs(lights.pendants-.27)<.002&&Math.abs(lights.hedge-.43)<.002,JSON.stringify(lights));
  await page.locator('#nightHedgeLights').uncheck();
  await waitLight('nightHedge','zero');
  await page.locator('#share').click();
  const shared=new URLSearchParams(new URL(page.url()).hash.slice(1));
  assert.equal(shared.get('nightPendantIntensity'),'27');
  assert.equal(shared.get('nightHedgeIntensity'),'43');
  assert.equal(shared.get('nightHedgeLights'),'false');
  assert.deepEqual(designWithoutLighting(),originalDesign,'Lighting edits must preserve every non-lighting design setting, including specimen positions');
  await page.reload({waitUntil:'domcontentloaded',timeout:60000});
  await waitReady();
  await waitLight('nightPendants','positive');await waitLight('nightHedge','zero');
  assert.equal(await page.locator('#nightPendantLights').isChecked(),true);
  assert.equal(await page.locator('#nightHedgeLights').isChecked(),false);
  assert.equal(await page.locator('#nightGardenLights').isChecked(),true);
  assert.equal(Number(await page.locator('#nightGardenIntensity-value').inputValue()),0);
  assert.equal(Number(await page.locator('#nightPendantIntensity-value').inputValue()),27);
  assert.equal(Number(await page.locator('#nightHedgeIntensity-value').inputValue()),43);
  assert.equal(await page.locator('#sun-time').inputValue(),'23:30');
  assert.deepEqual(designWithoutLighting(),originalDesign);
  check('Pendant switches and dimmers survive Share and reload without changing the property or garden layout');

  await details('#night-adjustments',true);
  await page.locator('#nightHedgeLights').check();
  await setNumber('nightGardenIntensity-value',original.garden);
  await setNumber('nightPendantIntensity-value',original.pendants);
  await setNumber('nightHedgeIntensity-value',original.hedge);
  await waitLight('nightGarden','positive');await waitLight('nightPendants','positive');await waitLight('nightHedge','positive');
  report.nadmorska.pendantLighting={gardenPixels:pendantPixels,hedgePixels,restored:await lightState(),sharedReloadPassed:true};
  await pngScreenshot('nadmorska-pendants-night');
}
async function verifyNadmorska(){
  await page.setViewportSize({width:1430,height:1040});
  await frames();
  const options=await page.locator('#site-select option').evaluateAll(nodes=>nodes.map(node=>({id:node.value,label:node.textContent})));
  assert.deepEqual(options,[{id:'sternicza-11',label:'Sternicza 11'},{id:'korzeniowskiego-40',label:'Korzeniowskiego 40'},{id:'nadmorska-17',label:'Nadmorska 17'}]);
  check('The property selector exposes all three independently named properties');

  // Exercise the real selector, including clearing the prior Sternicza share
  // hash, before testing the third property. This also protects the older site.
  await chooseProperty('korzeniowskiego-40');
  assert.equal(Number(await page.locator('#floorHeight-value').inputValue()),1.7);
  assert.equal(await page.locator('#upper-floor-viewpoints [data-preset]').count(),8);
  await selectPreset(UPPER_FLOOR_PRESETS.find(p=>p.id==='first-garden-standing'));
  assert.ok((await page.locator('#observer-readout').innerText()).includes('6.35 m above original garden reference'));
  check('Switching to Korzeniowskiego preserves its own floor height and upstairs view');

  await chooseProperty('nadmorska-17');
  assert.equal(await page.locator('#property-name').innerText(),'NADMORSKA 17');
  assert.equal(Number(await page.locator('#floorHeight-value').inputValue()),1.5);
  assert.equal(Number(await page.locator('#gardenRaise-value').inputValue()),0);
  assert.equal(await page.locator('#upper-floor-viewpoints [data-preset]').count(),8);
  assert.match(await page.locator('#tree-count').innerText(),/^0\s*\/\s*12$/,'No Sternicza specimen trees may leak into Nadmorska');
  assert.match(await page.locator('#site-evidence-note').innerText(),/709\.29[\s\S]*800/);
  assert.match(await page.locator('#plot-dimensions').innerText(),/709 m² mapped plot/);
  const siteData=JSON.parse(await readFile(path.join(publicRoot,'data/nadmorska-17.json'),'utf8'));
  assert.doesNotMatch(siteData.roofEvidence||'',/INTERIM/i);
  assert.ok(siteData.site.house.roofPoints.length>30,'The browser build must contain the final LiDAR data');
  const roofCount=[siteData.site.house,siteData.site.garage,...siteData.buildings].filter(Boolean).reduce((total,b)=>total+(b.roofPoints?.length||0),0);
  await page.locator('#about-open').click();
  await page.locator('#about').waitFor({state:'visible'});
  const sourceText=await page.locator('#about-content').innerText();
  assert.match(sourceText,/709\.29 m²/);
  const roofReadout=sourceText.match(/([\d,.\s\u00a0]+) reduced roof points/);
  assert.ok(roofReadout,'Mapped-source panel must report the actual roof evidence');
  assert.equal(Number(roofReadout[1].replace(/\D/g,'')),roofCount);
  assert.ok(await page.locator('#about-content a[href*="DanePomiaroweLAZ"]').count()>0);
  assert.doesNotMatch(sourceText,/INTERIM|NaN|undefined/);
  await page.locator('#about-close').click();
  for(const id of ['observer-readout','terrace-drop','sun-elevation','sun-bearing','combined-cost','neighborhood-status'])
    assert.doesNotMatch(await page.locator('#'+id).innerText(),/NaN|Infinity|undefined|Calculating/,'Unresolved readout '+id);
  report.nadmorska={roofPoints:roofCount,surroundingBuildings:siteData.buildings.length,roofTopZ:siteData.site.house.roofTopZ};
  check('Nadmorska WebGL load uses its own plot, floor and final LiDAR roof evidence');

  await page.locator('#showDimensions').uncheck();
  await details('#sun-controls',false);
  const street={...UPPER_FLOOR_PRESETS.find(p=>p.id==='first-street-standing'),label:'First floor · bedroom / office · Nadmorska · standing'};
  report.nadmorska.street=await selectPreset(street);
  assert.ok((await page.locator('#observer-readout').innerText()).includes('6.15 m above original garden reference'));
  assert.equal(await page.locator('[data-look-yaw="90"]').getAttribute('aria-pressed'),'true');
  assert.match(await page.locator('[data-look-yaw="90"]').innerText(),/Nadmorska/);
  assert.equal(await page.locator('[data-look-yaw="180"]').getAttribute('aria-pressed'),'false');
  await page.locator('#share').click();
  const shared=new URLSearchParams(new URL(page.url()).hash.slice(1));
  assert.equal(shared.get('site'),'nadmorska-17');
  assert.equal(shared.get('preset'),'first-street-standing');
  assert.equal(Number(shared.get('lookYaw')),90,'Street view must look through the right facade, toward Nadmorska');
  check('Nadmorska first-floor street control points +90 degrees and shares that exact direction');

  await page.locator('#preview-night').click();
  await waitLight('nightActivation','positive');
  await waitLight('nightWindows','positive');
  await details('#night-adjustments',true);
  await setNumber('nightWindowActivity-value',0);
  const noWindows=await page.locator('#scene-host').screenshot({type:'png',animations:'disabled',scale:'css'});
  await setNumber('nightWindowActivity-value',100);
  const allWindows=await page.locator('#scene-host').screenshot({type:'png',animations:'disabled',scale:'css'});
  assert.ok(!noWindows.equals(allWindows),'Nadmorska across-street window activity must visibly change its WebGL scene');
  await setNumber('nightWindowActivity-value',35);
  await page.locator('#nightWindowLights').uncheck();
  await waitLight('nightWindows','zero');
  assert.ok((await lightState()).garden>0);
  await page.locator('#nightWindowLights').check();
  await waitLight('nightWindows','positive');
  report.nadmorska.windowActivityVisible=true;

  // A fixed overview includes both water bodies. The scene renders on demand,
  // so switching garden lights must change the pixels, not an animated clock.
  await details('#night-adjustments',false);
  await page.locator('[data-mode="orbit"]').click();
  await page.locator('#preview-day').click();
  await waitLight('nightActivation','zero');
  await pngScreenshot('nadmorska-day');
  await page.locator('#preview-night').click();
  await waitLight('nightGarden','positive');
  await details('#night-adjustments',true);
  // Keep the existing blue-green water test isolated from new warm pendants.
  await page.locator('#nightPendantLights').uncheck();
  await page.locator('#nightHedgeLights').uncheck();
  await page.locator('#nightGardenLights').uncheck();
  await waitLight('nightGarden','zero');
  assert.ok((await lightState()).windows>0,'Garden lights must not disable neighbouring windows');
  await frames();
  const unlitWater=await page.locator('#scene-host').screenshot({type:'png',animations:'disabled',scale:'css'});
  await page.locator('#nightGardenLights').check();
  await waitLight('nightGarden','positive');
  await frames();
  const litWater=await page.locator('#scene-host').screenshot({type:'png',animations:'disabled',scale:'css'});
  report.nadmorska.waterGlow=await waterGlowDifference(unlitWater,litWater);
  assert.ok(report.nadmorska.waterGlow.brighterAquaPixels>20,'The WebGL water glow must brighten visible blue-green pixels: '+JSON.stringify(report.nadmorska.waterGlow));
  assert.equal(await page.locator('#sun-time').inputValue(),'23:30');
  await page.locator('#nightPendantLights').check();
  await page.locator('#nightHedgeLights').check();
  await pngScreenshot('nadmorska-night');
  report.nadmorska.night=await lightState();
  check('Nadmorska window activity, independent light switches and visible WebGL water glow work after dark');

  await verifyPendantLighting();

  await page.locator('#preview-day').click();
  await waitLight('nightActivation','zero');
  await waitLight('nightPendants','zero');await waitLight('nightHedge','zero');
  await page.locator('#showDimensions').check();
  await page.locator('[data-mode="plan"]').click();
  await page.locator('#plan-host').waitFor({state:'visible'});
  await page.locator('#plan-host [data-map-scope="garden"]').click();
  await page.waitForFunction(()=>document.querySelector('#plan-host [data-map-scope="garden"]')?.getAttribute('aria-pressed')==='true'
    &&document.querySelector('#plan-host [data-dimension-record="plot-area"]')?.textContent.includes('709.29'));
  await frames();
  assert.equal(await page.locator('#plan-host [data-map-scope="garden"]').getAttribute('aria-pressed'),'true');
  const dimension=async id=>{
    const text=await page.locator('#plan-host [data-dimension-record="'+id+'"]').first().innerText();
    return Number.parseFloat(text.replace('≈ ',''));
  };
  assert.equal(await dimension('plot-area'),709.29);
  assert.equal(await dimension('pool-width'),3);
  assert.equal(await dimension('pool-length'),7);
  assert.equal(await dimension('entry-pedestrian'),1.2);
  assert.equal(await dimension('entry-vehicle'),4);
  const planText=await page.locator('#plan-host').innerText();
  assert.doesNotMatch(planText,/NaN|undefined|STERNICZA|PCK3/);
  await pngScreenshot('nadmorska-plan');
  check('Nadmorska whole-plot plan shows 709.29 square metres, pool sizes and both side access openings');

  await page.setViewportSize({width:390,height:844});
  await frames();
  await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth+2,null,{timeout:10000});
  report.nadmorska.mobile=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
  assert.ok(report.nadmorska.mobile.scrollWidth<=report.nadmorska.mobile.width+2,JSON.stringify(report.nadmorska.mobile));
  assert.equal(await page.locator('#site-select').inputValue(),'nadmorska-17');
  assert.equal(await page.locator('#upper-floor-viewpoints [data-preset]').count(),8);
  await pngScreenshot('nadmorska-mobile-plan');
  check('Nadmorska plot, property selector and eight upstairs controls fit a 390px mobile page');
}

try {
  browser=await chromium.launch({
    headless:true,
    executablePath:process.env.GARDEN_BROWSER_EXECUTABLE||undefined,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist','--disable-dev-shm-usage'],
  });
  const context=await browser.newContext({
    viewport:{width:1430,height:1040},deviceScaleFactor:1,reducedMotion:'reduce',
  });
  page=await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror',error=>pageErrors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  await page.goto(baseURL+'/?site=sternicza-11',{waitUntil:'domcontentloaded',timeout:60000});
  await waitReady();
  check('Built application loads with a real WebGL canvas');
  await page.locator('#showDimensions').uncheck();
  await details('#sun-controls',false);

  assert.equal(UPPER_FLOOR_PRESETS.length,8);
  for(const preset of UPPER_FLOOR_PRESETS)report.presets.push(await selectPreset(preset));
  check('All eight upper-floor presets enter eye mode with correct direction, posture and readout');

  const firstStanding=UPPER_FLOOR_PRESETS.find(p=>p.id==='first-garden-standing');
  const atticStreet=UPPER_FLOOR_PRESETS.find(p=>p.id==='attic-street-standing');
  const firstStreet=UPPER_FLOOR_PRESETS.find(p=>p.id==='first-street-standing');
  await selectPreset(firstStanding);
  await details('.upper-floor-assumptions',true);
  const firstOriginal=await page.locator('#firstFloorRise-value').inputValue();
  const atticOriginal=await page.locator('#atticRise-value').inputValue();
  await setNumber('firstFloorRise-value',3.25);
  await page.waitForFunction(()=>document.querySelector('#upper-view-note')?.textContent.includes('+3.25 m'));
  assert.ok((await page.locator('#observer-readout').innerText()).includes('6.10 m above original garden reference'));
  await selectPreset(atticStreet);
  await setNumber('atticRise-value',6.25);
  await page.waitForFunction(()=>document.querySelector('#upper-view-note')?.textContent.includes('+6.25 m'));
  assert.ok((await page.locator('#observer-readout').innerText()).includes('9.10 m above original garden reference'));
  await setNumber('firstFloorRise-value',firstOriginal);
  await setNumber('atticRise-value',atticOriginal);
  await details('.upper-floor-assumptions',false);
  check('Editable first and attic floor heights update the actual observer readout');

  await page.locator('#preview-night').click();
  await waitLight('nightActivation','positive');
  await waitLight('nightGarden','positive');
  await waitLight('nightWindows','positive');
  assert.equal(await page.locator('#sun-time').inputValue(),'23:30');
  report.night=await lightState();
  await details('#night-adjustments',true);
  await page.locator('#nightGardenLights').uncheck();
  await waitLight('nightGarden','zero');
  assert.ok((await lightState()).windows>0,'Garden switch must not disable neighbouring windows');
  assert.equal(await page.locator('#nightGardenIntensity-value').isDisabled(),true);
  await page.locator('#nightGardenLights').check();
  await waitLight('nightGarden','positive');
  await page.locator('#nightWindowLights').uncheck();
  await waitLight('nightWindows','zero');
  assert.ok((await lightState()).garden>0,'Window switch must not disable garden lighting');
  assert.equal(await page.locator('#nightWindowIntensity-value').isDisabled(),true);
  await page.locator('#nightWindowLights').check();
  await waitLight('nightWindows','positive');
  check('Night preview and both independent lighting switches work');

  const gardenOriginal=await page.locator('#nightGardenIntensity-value').inputValue();
  const windowOriginal=await page.locator('#nightWindowIntensity-value').inputValue();
  const activityOriginal=await page.locator('#nightWindowActivity-value').inputValue();
  await setNumber('nightGardenIntensity-value',25);
  const gardenLow=(await lightState()).garden;
  await setNumber('nightGardenIntensity-value',90);
  assert.ok((await lightState()).garden>gardenLow,'Garden dimmer must increase rendered-light strength');
  await setNumber('nightWindowIntensity-value',20);
  const windowLow=(await lightState()).windows;
  await setNumber('nightWindowIntensity-value',85);
  assert.ok((await lightState()).windows>windowLow,'Window dimmer must increase window-light strength');
  await setNumber('nightGardenIntensity-value',gardenOriginal);
  await setNumber('nightWindowIntensity-value',windowOriginal);

  await selectPreset(firstStreet);
  await setNumber('nightWindowActivity-value',0);
  assert.ok((await page.locator('#night-status').innerText()).includes('about 0% active'));
  await frames();
  const noWindows=await page.locator('#scene-host').screenshot({type:'png',animations:'disabled',scale:'css'});
  await setNumber('nightWindowActivity-value',100);
  assert.ok((await page.locator('#night-status').innerText()).includes('about 100% active'));
  await frames();
  const allWindows=await page.locator('#scene-host').screenshot({type:'png',animations:'disabled',scale:'css'});
  assert.ok(!noWindows.equals(allWindows),'Changing window activity must visibly change the rendered street scene');
  await setNumber('nightWindowActivity-value',activityOriginal);
  check('All three dimmers respond, including an actual rendered change from 0% to 100% active windows');

  await details('#night-adjustments',false);
  await selectPreset(firstStanding);
  const nightImage=await screenshot('first-floor-garden-night');
  await page.locator('#preview-day').click();
  await waitLight('nightActivation','zero');
  await waitLight('nightGarden','zero');
  await waitLight('nightWindows','zero');
  report.daylight=await lightState();
  await frames();
  const dayImage=await page.locator('#viewport').screenshot({type:'jpeg',quality:65,animations:'disabled',scale:'css'});
  assert.ok(!dayImage.equals(nightImage),'Daylight restoration must visibly change the rendered scene');
  check('Daylight restores the sun clock and turns simulated artificial lights off');

  await page.locator('#preview-night').click();
  await selectPreset(atticStreet);
  await waitLight('nightActivation','positive');
  await page.reload({waitUntil:'domcontentloaded',timeout:60000});
  await waitReady();
  await page.waitForFunction(()=>document.querySelector('#view-badge-text')?.textContent.includes('Second floor · strych · street · standing'));
  assert.equal(await page.locator('[data-preset="attic-street-standing"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#viewport').getAttribute('data-mode'),'eye');
  await waitLight('nightActivation','positive');
  assert.equal(await page.locator('#sun-time').inputValue(),'23:30');
  check('Upper-floor preset, eye mode and night time survive a normal page reload');

  await page.locator('#share').click();
  const share=new URL(page.url());
  assert.equal(new URLSearchParams(share.hash.slice(1)).get('preset'),'attic-street-standing');
  await page.reload({waitUntil:'domcontentloaded',timeout:60000});
  await waitReady();
  assert.equal(await page.locator('[data-preset="attic-street-standing"]').getAttribute('aria-pressed'),'true');
  await waitLight('nightActivation','positive');
  check('The visible Share view action creates a reloadable upper-floor night view');
  await screenshot('attic-street-night');

  await details('#sun-controls',false);
  await details('#night-adjustments',true);
  await details('.upper-floor-assumptions',true);
  await page.setViewportSize({width:390,height:844});
  await frames();
  report.mobile=await page.evaluate(()=>({
    width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
    overflowing:[...document.querySelectorAll('body *')].filter(node=>{
      const rect=node.getBoundingClientRect();
      return rect.width>0&&rect.right>innerWidth+2&&getComputedStyle(node).position!=='fixed';
    }).slice(0,12).map(node=>({tag:node.tagName,id:node.id,className:node.className?.toString().slice(0,90)})),
  }));
  assert.ok(report.mobile.scrollWidth<=report.mobile.width+2,JSON.stringify(report.mobile));
  assert.equal(await page.locator('#upper-floor-viewpoints [data-preset]').count(),8);
  await page.locator('#viewport').screenshot({
    path:path.join(resultsRoot,'mobile-night.jpg'),type:'jpeg',quality:65,animations:'disabled',scale:'css',
  });
  check('Mobile layout at 390px retains all eight upper viewpoints without horizontal page overflow');

  await verifyNadmorska();

  assert.deepEqual(pageErrors,[],'Unhandled JavaScript errors');
  assert.deepEqual(consoleErrors,[],'Browser console errors');
  check('No unhandled JavaScript or browser console errors');
  report.status='passed';
}catch(error){
  report.status='failed';
  report.error={message:error.message,stack:error.stack};
  process.exitCode=1;
  if(page){
    try{
      const failed=await page.screenshot({path:path.join(resultsRoot,'failure.jpg'),type:'jpeg',quality:60,scale:'css'});
      console.log('GARDEN_SCREENSHOT_B64 failure image/jpeg '+failed.toString('base64'));
    }catch(screenshotError){report.screenshotError=screenshotError.message;}
  }
  console.error(error);
}finally{
  report.pageErrors=pageErrors;
  report.consoleErrors=consoleErrors;
  await writeFile(path.join(resultsRoot,'browser-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log('GARDEN_BROWSER_REPORT '+JSON.stringify(report));
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
