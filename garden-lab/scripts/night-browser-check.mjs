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

try {
  browser=await chromium.launch({
    headless:true,
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
