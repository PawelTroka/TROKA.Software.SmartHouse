/** Terrace, balcony and two-car garage coverage in the public WebGL editor.
 * BASE_URL uses an existing server; otherwise serve the built public directory.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const resultRoot=path.join(project,'test-results','refinements');
const expectedVersion=JSON.parse(await readFile(path.join(project,'package.json'),'utf8')).version;
await mkdir(resultRoot,{recursive:true});
let server,browser,page,baseURL=process.env.BASE_URL?.replace(/\/$/,'');
const report={version:expectedVersion,checks:[],screenshots:[]},errors=[];
if(!baseURL){
  const root=path.join(project,'public'),types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.woff2':'font/woff2'};
  server=createServer(async(req,res)=>{
    try{
      const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname),file=path.resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
      if(!file.startsWith(root+path.sep)||!(await stat(file)).isFile()){res.writeHead(404);res.end();return;}
      res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(await readFile(file));
    }catch{res.writeHead(404);res.end();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  baseURL='http://127.0.0.1:'+server.address().port;
}
const check=label=>{report.checks.push(label);console.log('REFINEMENT_CHECK '+label);};
// A High/Automatic WebGL readback can exceed the ordinary UI-action deadline
// on software-rendered CI. Keep captures bounded without relaxing assertions.
const sceneCaptureTimeout=120000;
const frames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function ready(){
  await page.locator('#loading').waitFor({state:'hidden',timeout:60000});
  await page.locator('#scene-host canvas').waitFor({state:'visible',timeout:60000});
  await page.waitForFunction(()=>document.querySelector('#observer-readout')?.textContent.startsWith('Eye '));
  assert.equal(await page.locator('meta[name="application-version"]').getAttribute('content'),expectedVersion);
  await frames();
}
async function details(selector,open){
  const node=page.locator(selector);
  if((await node.getAttribute('open')!==null)!==open)await node.locator('summary').first().click();
}
async function number(id,value){
  const field=page.locator('#'+id);await field.fill(String(value));await field.press('Tab');await frames();
  assert.equal(Number(await field.inputValue()),value);
}
async function shot(name,selector='#viewport'){
  const node=page.locator(selector);await node.scrollIntoViewIfNeeded();await frames();
  const filename=name+'.png';await node.screenshot({path:path.join(resultRoot,filename),animations:'disabled',scale:'css',timeout:sceneCaptureTimeout});
  report.screenshots.push(filename);
}
async function sceneFrame(){
  await page.locator('#scene-host').scrollIntoViewIfNeeded();await frames();
  return page.locator('#scene-host').screenshot({type:'png',animations:'disabled',scale:'css',timeout:sceneCaptureTimeout});
}
async function changedPixels(before,after){
  return page.evaluate(async({before,after})=>{
    const decode=async data=>{const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();
      const canvas=new OffscreenCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
      return {width:image.width,height:image.height,data:ctx.getImageData(0,0,image.width,image.height).data};};
    const a=await decode(before),b=await decode(after);if(a.width!==b.width||a.height!==b.height)throw new Error('Scene dimensions changed during pixel comparison');
    let changed=0;for(let i=0;i<a.data.length;i+=4)if(Math.max(Math.abs(a.data[i]-b.data[i]),Math.abs(a.data[i+1]-b.data[i+1]),Math.abs(a.data[i+2]-b.data[i+2]))>12)changed++;
    return changed;
  },{before:before.toString('base64'),after:after.toString('base64')});
}
async function exported(){
  const pending=page.waitForEvent('download');await page.locator('#export').click();
  const download=await pending;return JSON.parse(await readFile(await download.path(),'utf8'));
}
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||process.env.GARDEN_BROWSER_EXECUTABLE||undefined,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:1430,height:1040},deviceScaleFactor:1,reducedMotion:'reduce',acceptDownloads:true});
  page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
  await page.goto(baseURL+'/?site=sternicza-11',{waitUntil:'domcontentloaded',timeout:60000});await ready();
  for(const [id,value] of [['terraceDepth-value',4],['canopyHeight-value',3],['canopyDepth-value',4]])assert.equal(Number(await page.locator('#'+id).inputValue()),value,id);
  for(const id of ['jacuzziOverflow','canopyEnabled'])assert.equal(await page.locator('#'+id).isChecked(),true,id);
  assert.equal(await page.locator('#terraceCoverType').inputValue(),'canopy');
  assert.equal(await page.locator('#viewport').getAttribute('data-terrace-cover'),'canopy');
  assert.equal(await page.locator('#basementGarageEnabled').isChecked(),true);
  assert.equal(await page.locator('#garage-parking-plan [data-car]').count(),2);
  await page.locator('#showDimensions').uncheck();await details('#sun-controls',false);await details('#night-adjustments',false);
  check('Fresh defaults retain the two-car proposal beside the 4 m terrace, infinity jacuzzi and 3 m high / 4 m deep canopy');

  await details('#basement-garage-controls',true);
  await page.locator('#basement-garage-controls [data-garage-preset="raised"]').click();
  await page.waitForFunction(()=>document.querySelector('#garage-result')?.dataset.status==='structure-conflict');
  assert.equal(Number(await page.locator('#garageSpaces-value').inputValue()),2);
  assert.equal(await page.locator('#garageSpaces-value').isEditable(),false);
  assert.equal(Number(await page.locator('#garageRampWidth-value').inputValue()),5.8);
  assert.match(await page.locator('#garage-door-opening').innerText(),/^5\.80 × 2\.10 m$/);
  assert.equal(await page.locator('#garage-parking-plan [data-car]').count(),2);
  assert.match(await page.locator('#garage-lateral-clearance').innerText(),/395 mm to walls · 790 mm between/);
  assert.match(await page.locator('#garage-parking-note').innerText(),/side stair[\s\S]*landing/);
  report.garage=await exported();
  const garage=report.garage.basementGarage;
  assert.equal(report.garage.settings.garageSpaces,2);assert.equal(garage.parking.spaces,2);
  assert.equal(garage.parking.laneOffsets.length,2);assert.ok(garage.parking.laneOffsets[0]<garage.parking.laneOffsets[1]);
  assert.ok(garage.assessment.conservativeClearance>=.03);
  assert.ok(garage.assessment.minCoveredHeadroom>=2.2);assert.ok(garage.assessment.minimumEntryLandingClearance>.85);
  assert.ok(garage.assessment.entryLandingPosesChecked>200);
  await page.locator('#garage-view').click();
  const enabled=await sceneFrame();await page.locator('#basementGarageEnabled').uncheck();const disabled=await sceneFrame();
  report.garagePixelDifference=await changedPixels(enabled,disabled);assert.ok(report.garagePixelDifference>200);
  await page.locator('#basementGarageEnabled').check();await page.waitForFunction(()=>document.querySelector('#garage-result')?.dataset.status==='structure-conflict');
  await page.locator('#garage-view').click();await shot('sternicza-two-car-front');
  await shot('sternicza-two-car-parking-plan','#garage-parking-plan');
  check('Two-car entrance, separated vehicle envelopes and the over-ramp landing appear in real WebGL and exported clearance checks');

  await number('garageRampWidth-value',3.2);
  await page.waitForFunction(()=>document.querySelector('#garage-result')?.dataset.status==='geometry-limit');
  assert.match(await page.locator('#garage-layout-warning').innerText(),/2 cars need 5\.42 m/);
  await number('garageRampWidth-value',5.8);await page.waitForFunction(()=>document.querySelector('#garage-result')?.dataset.status==='structure-conflict');
  check('A narrow two-car setting is explicitly rejected rather than shown as a valid fit');

  await page.locator('button[data-mode="orbit"]').click();const canopyFrame=await sceneFrame();
  await page.locator('#terraceCoverType').selectOption('balcony');
  await page.waitForFunction(()=>document.querySelector('#viewport')?.dataset.terraceCover==='balcony');
  assert.equal(await page.locator('[data-field="canopyHeight"]').isVisible(),false);
  assert.equal(await page.locator('[data-preset="balcony"]').isVisible(),true);
  assert.equal(await page.locator('#designStyle').inputValue(),'current');
  assert.match(await page.locator('#terrace-cover-summary').innerText(),/first-floor balcony[\s\S]*clear-glass guard[\s\S]*Current retains[\s\S]*choose a renovation style/);
  assert.equal(await page.locator('#terrace-cover-warning').isVisible(),true);
  assert.match(await page.locator('#terrace-cover-warning').innerText(),/no balcony access door[\s\S]*Choose a renovation style/);
  const balconyFrame=await sceneFrame();report.balconyPixelDifference=await changedPixels(canopyFrame,balconyFrame);assert.ok(report.balconyPixelDifference>150);
  await shot('sternicza-balcony-garden');await page.locator('[data-preset="balcony"]').click();
  await page.waitForFunction(()=>document.querySelector('#observer-readout')?.textContent.includes('above balcony deck'));
  const balconyExport=await exported();assert.equal(balconyExport.summary.observer.surface,'balcony');
  assert.equal(balconyExport.settings.terraceCoverType,'balcony');assert.equal(balconyExport.settings.canopyEnabled,true);
  assert.equal(balconyExport.terraceCover.access,null);assert.deepEqual(balconyExport.terraceCover.accesses,[]);
  assert.equal(balconyExport.terraceCover.accessFits,false);
  assert.ok(balconyExport.interiors.floors.first.walls.every(wall=>wall.openings.every(opening=>opening.type!=='balcony-door')));
  report.balcony={observer:balconyExport.summary.observer,summary:await page.locator('#terrace-cover-summary').innerText(),
    accesses:balconyExport.terraceCover.accesses,accessFits:balconyExport.terraceCover.accessFits};
  check('A manually selected guarded balcony replaces the canopy; Current truthfully has no house access until a renovation adds doors');

  await page.locator('[data-preset="pool"]').click();
  await page.waitForFunction(()=>document.querySelector('#observer-readout')?.textContent.includes('0.15 m above pool water'));
  assert.equal(await page.locator('#viewport').getAttribute('data-mode'),'eye');assert.equal(await page.locator('#eyeHeight-value').isDisabled(),true);
  await details('details:has(> #assumption-controls)',true);
  const lowPool=await sceneFrame();await number('poolEyeAboveWater-value',.25);
  await page.waitForFunction(()=>document.querySelector('#observer-readout')?.textContent.includes('0.25 m above pool water'));
  const highPool=await sceneFrame();report.poolPixelDifference=await changedPixels(lowPool,highPool);assert.ok(report.poolPixelDifference>30);
  await number('poolEyeAboveWater-value',.15);await shot('sternicza-pool-eye');
  const poolExport=await exported();report.pool=poolExport.summary.observer;
  assert.equal(report.pool.surface,'pool-water');assert.ok(Math.abs(report.pool.z-report.pool.waterZ-.15)<1e-8);
  check('Swimming view uses the actual pool water level and its editable eye offset visibly moves the camera');

  await page.locator('#share').click();await page.waitForFunction(()=>location.hash.includes('terraceCoverType=balcony'));
  const sharedURL=page.url(),hash=new URLSearchParams(new URL(sharedURL).hash.slice(1));
  assert.equal(hash.get('preset'),'pool');
  // Default parking dimensions are omitted from sparse share links. The
  // reloaded public controls and dimensioned plan must recover them exactly.
  await page.reload({waitUntil:'domcontentloaded'});await ready();
  assert.equal(await page.locator('#terraceCoverType').inputValue(),'balcony');assert.equal(await page.locator('#garage-parking-plan [data-car]').count(),2);
  assert.equal(await page.locator('#canopyEnabled').isChecked(),true);assert.equal(await page.locator('#basementGarageEnabled').isChecked(),true);
  assert.equal(Number(await page.locator('#garageSpaces-value').inputValue()),2);assert.equal(Number(await page.locator('#garageRampWidth-value').inputValue()),5.8);
  assert.equal(Number(await page.locator('#terraceDepth-value').inputValue()),4);assert.equal(await page.locator('#jacuzziOverflow').isChecked(),true);
  assert.match(await page.locator('#observer-readout').innerText(),/0\.15 m above pool water/);
  check('Balcony, pool viewpoint and two-car dimensions survive sharing and reload');

  await page.goto(baseURL+'/?site=sternicza-11#v=22&site=sternicza-11&basementGarageEnabled=true&garageRampWidth=3.2&mode=orbit',{waitUntil:'domcontentloaded'});await ready();
  await page.locator('#garage-parking-plan svg[data-spaces="2"]').waitFor({state:'attached'});
  assert.equal(Number(await page.locator('#garageSpaces-value').inputValue()),2);assert.equal(Number(await page.locator('#garageRampWidth-value').inputValue()),5.8);
  assert.equal(await page.locator('#garage-parking-plan [data-car]').count(),2);assert.equal(Number(await page.locator('#terraceDepth-value').inputValue()),4.2);
  assert.equal(await page.locator('#canopyEnabled').isChecked(),false);assert.equal(await page.locator('#jacuzziOverflow').isChecked(),false);
  check('A v22 garage link opens with two parking bays and 5.8 m width, retaining its original terrace and cover settings');

  await page.goto(sharedURL,{waitUntil:'domcontentloaded'});await ready();await page.setViewportSize({width:390,height:844});await frames();
  await page.waitForFunction(()=>Number(document.querySelector('#garageSpaces-value')?.value)===2&&document.querySelector('#terraceCoverType')?.value==='balcony');
  await page.locator('#garage-profile-card').scrollIntoViewIfNeeded();await frames();
  report.mobile=await page.evaluate(()=>({viewport:innerWidth,page:document.documentElement.scrollWidth,plan:document.querySelector('#garage-parking-plan svg').getBoundingClientRect().width,
    card:document.querySelector('#garage-profile-card').getBoundingClientRect().width}));
  assert.ok(report.mobile.page<=report.mobile.viewport+2,JSON.stringify(report.mobile));assert.ok(report.mobile.plan<=report.mobile.card);
  assert.equal(await page.locator('#scene-host canvas').count(),1);await shot('sternicza-mobile-garage','#garage-profile-card');
  await page.locator('#terraceCoverType').scrollIntoViewIfNeeded();await shot('sternicza-mobile-cover-controls','.control-section:has(#terraceCoverType)');
  check('The double-garage plan, result and cover controls fit a 390 px viewport without page overflow');
  assert.deepEqual(errors,[]);report.status='passed';
}catch(error){
  report.status='failed';report.error=error.stack||String(error);process.exitCode=1;
  if(page)try{await shot('failure');}catch{}
  console.error(report.error);
}finally{
  report.pageErrors=errors;await writeFile(path.join(resultRoot,'browser-report.json'),JSON.stringify(report,null,2));
  await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));
  console.log('REFINEMENT_RESULT '+JSON.stringify({status:report.status,checks:report.checks.length,screenshots:report.screenshots,report:path.join(resultRoot,'browser-report.json')}));
}
