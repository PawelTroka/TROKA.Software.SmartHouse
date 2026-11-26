import assert from 'node:assert/strict';
import {houseModelFrame} from '../src/house-model.js';
import {WALK_COMFORT} from '../src/walk-motion.js';

const VIEWS=Object.freeze([
  // A step into the living room keeps the connected sink end and concealed
  // chimney together in the fixed walking lens; the closer kitchen spawn
  // cuts the chimney out of the frame.
  Object.freeze({id:'kitchen-connection',room:'front-kitchen',x:3.15,z:3.5,eye:1.57,yaw:-2.89,pitch:-.15}),
  Object.freeze({id:'open-stair-guard',room:'hall',x:5.15,z:5.55,eye:1.57,yaw:Math.PI,pitch:-.18}),
]);
const degrees=radians=>radians*180/Math.PI;
const angleDifference=(target,current)=>((target-current+540)%360+360)%360-180;

/** Two daylight screenshots through the existing room selector, Share URL,
 * custom observer and walking controls. No renderer handles or private state.
 *
 * Call after the desktop exports, before the caller reloads its saved share
 * for mobile checks. Plan-only studio visits reuse the exterior WebGL context:
 * this helper never reloads the document or creates an interior 3D renderer.
 *
 * `shot(name,selector)`, `walking(floor,options)` and `openInteriors()` are the
 * existing interiors-browser-check helpers. The default leaves the last walk
 * visible; reload `restoreUrl` (or the caller's saved share) for later tests.
 */
export async function captureOpenLivingViews(page,{
  shot,walking,openInteriors,style='warm-minimal',date='2026-06-21',
  timeout=120000,maxDurationMs=240000,includePlan=false,restore=false,
}={}){
  assert.equal(typeof shot,'function');assert.equal(typeof walking,'function');assert.equal(typeof openInteriors,'function');
  const started=Date.now(),deadline=started+maxDurationMs;
  const remaining=()=>{
    const left=deadline-Date.now();
    assert.ok(left>0,`Open-living captures exceeded their ${maxDurationMs/1000}s budget`);
    return Math.max(1,Math.min(timeout,left));
  };
  const q=selector=>page.locator(selector);
  const field=id=>q(`#interior-host [data-iw="${id}"]`);
  const canvas=()=>q('#scene-host canvas');
  const frameCount=async()=>Number(await q('#render-diagnostics').getAttribute('data-frames'));
  const pose=()=>canvas().evaluate(node=>({
    position:node.dataset.walkPosition?.split(',').map(Number),
    altitude:Number(node.dataset.walkAltitude),yaw:Number(node.dataset.walkYaw),pitch:Number(node.dataset.walkPitch),
    floor:node.dataset.walkFloor,navigation:node.dataset.walkNavigation,fov:Number(node.dataset.walkFov),
  }));
  const share=async()=>{
    await q('#share').click({timeout:remaining()});
    const url=new URL(page.url());
    assert.ok(new URLSearchParams(url.hash.slice(1)).has('v'),'The real Share control must encode the current design');
    return url;
  };
  const navigate=async(base,patch)=>{
    const url=new URL(base),params=new URLSearchParams(url.hash.slice(1));
    for(const [key,value]of Object.entries(patch))params.set(key,String(value));
    url.hash=params.toString();
    // Same-document hash navigation invokes the app's normal shared-link
    // handler, retaining the live house canvas and its already loaded assets.
    await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:remaining()});
    return url.href;
  };
  const waitMode=async mode=>page.waitForFunction(({mode,style})=>
    document.querySelector('#viewport')?.dataset.mode===mode&&
    document.querySelector('#designStyle')?.value===style&&
    document.querySelector('#interior-host')?.hidden,
  {mode,style},{timeout:remaining()});
  const turnTo=async(targetYaw,targetPitch)=>{
    let drags=0,afterFrame=null;
    for(;drags<6;drags++){
      const current=await pose(),yaw=angleDifference(targetYaw,current.yaw),pitch=targetPitch-current.pitch;
      if(Math.abs(yaw)<.04&&Math.abs(pitch)<.04)break;
      await canvas().scrollIntoViewIfNeeded({timeout:remaining()});
      const b=await canvas().boundingBox();assert.ok(b&&b.width>160&&b.height>100,'A usable live walking canvas is required');
      const gain=degrees(WALK_COMFORT.lookGain),limitX=b.width*.55,limitY=b.height*.35;
      const dx=Math.max(-limitX,Math.min(limitX,yaw/gain));
      const dy=Math.max(-limitY,Math.min(limitY,-pitch/gain));
      const x=b.x+b.width/2-dx/2,y=b.y+b.height/2-dy/2;
      afterFrame=await frameCount();
      await page.mouse.move(x,y);await page.mouse.down();
      try{await page.mouse.move(x+dx,y+dy,{steps:1});}finally{await page.mouse.up();}
    }
    const result=await pose();
    assert.ok(Math.abs(angleDifference(targetYaw,result.yaw))<.05&&Math.abs(targetPitch-result.pitch)<.05,
      `Normal drag did not reach the requested view: ${JSON.stringify({targetYaw,targetPitch,result})}`);
    return {drags,afterFrame};
  };

  assert.equal(await page.evaluate(()=>Boolean(document.body.dataset.modelFullscreen)),false,
    'Run open-living captures after the existing fullscreen roundtrip has exited');
  const restoreUrl=(await share()).href;
  const original={url:restoreUrl,style:await q('#designStyle').inputValue(),
    date:await q('#sun-date').inputValue(),time:await q('#sun-time').inputValue()};
  assert.equal(new URL(restoreUrl).searchParams.get('site'),'sternicza-11');
  await navigate(restoreUrl,{designStyle:style,interiorView:'plan',interiorEnabled:false,interiorFloor:'ground',
    interiorFurniture:true,interiorChanges:false,walkNavigation:'free',sceneMotion:false,mode:'orbit'});
  await waitMode('orbit');
  if(await q('#sun-controls').getAttribute('open')===null)await q('#sun-controls > summary').click({timeout:remaining()});
  if(await q('#sun-date').inputValue()!==date){
    await q('#sun-date').fill(date,{timeout:remaining()});await q('#sun-date').press('Tab',{timeout:remaining()});
  }
  await q('#preview-day').click({timeout:remaining()});
  await page.waitForFunction(date=>document.querySelector('#sun-date')?.value===date&&
    document.querySelector('#sun-enabled')?.checked&&Number(document.querySelector('#viewport')?.dataset.sunElevation)>15,
  date,{timeout:remaining()});
  const daylight={date:await q('#sun-date').inputValue(),time:await q('#sun-time').inputValue(),
    elevation:Number(await q('#viewport').getAttribute('data-sun-elevation'))};
  const response=await page.request.get(new URL('./data/site-data.json',page.url()).href,{timeout:remaining()});
  assert.equal(response.ok(),true,'The public site source must load');
  const data=await response.json(),floorHeight=Number(await q('#floorHeight-value').inputValue());
  const frame=houseModelFrame(data,{floorHeight});assert.ok(frame);
  const report={style,daylight,original,restoreUrl,views:[],plan:null,restored:false};
  for(const view of VIEWS){
    remaining();
    await openInteriors();
    assert.equal(await field('canvas').locator('canvas').count(),0,'Plan-only room selection must not create another WebGL context');
    if(await field('floor').inputValue()!=='ground')await field('floor').selectOption('ground',{timeout:remaining()});
    await field('room').selectOption(view.room,{timeout:remaining()});
    assert.equal(await field('room').inputValue(),view.room);
    assert.equal(await field('style').inputValue(),style);
    if(includePlan&&view.id==='kitchen-connection'){
      await field('plan').locator('svg').waitFor({state:'visible',timeout:remaining()});
      report.plan=`ground-${style}-open-living-renovation-plan`;
      await shot(report.plan,'#interior-host');
    }
    await field('enter').click({timeout:remaining()});
    const spawn=await walking('ground',{timeout:remaining(),settled:true});
    const p=frame.toSite(view.x,view.z,view.eye);
    const end=frame.toSite(view.x+Math.sin(view.yaw)*Math.cos(view.pitch),
      view.z-Math.cos(view.yaw)*Math.cos(view.pitch),view.eye+Math.sin(view.pitch));
    const yaw=degrees(Math.atan2(-(end[0]-p[0]),end[1]-p[1])),pitch=degrees(view.pitch);
    const customUrl=await navigate(await share(),{mode:'eye',preset:'custom',observerX:p[0],observerY:p[1],
      eyeHeight:view.eye,fov:70,interiorEnabled:false,interiorView:'plan'});
    await waitMode('eye');
    const beforeWalk=await frameCount();
    await q('#viewer button[data-mode="walk"]').click({timeout:remaining()});
    await walking('ground',{timeout:remaining(),settled:true,afterFrame:beforeWalk});
    const {drags,afterFrame}=await turnTo(yaw,pitch);
    await walking('ground',{timeout:remaining(),settled:true,afterFrame});
    const actual=await pose();
    assert.equal(actual.floor,'ground');assert.equal(actual.navigation,'free');assert.equal(actual.fov,70);
    assert.ok(Math.hypot(actual.position[0]-p[0],actual.position[2]-p[1])<.015,'Public custom observer must reach the intended interior location');
    assert.ok(Math.abs(actual.altitude-(frame.floorZ+view.eye))<.015,
      'The camera must be 1.57 m above the living floor, rather than above the garden terrain');
    await canvas().scrollIntoViewIfNeeded({timeout:remaining()});
    const name=`ground-${style}-${view.id}-daylight`;
    await shot(name,'#scene-host canvas');
    report.views.push({name,room:view.room,requestedLocal:view,requestedSite:{x:p[0],y:p[1],altitude:p[2],yaw,pitch},
      actual,spawn,drags,customUrl});
  }
  if(restore){
    await page.goto(restoreUrl,{waitUntil:'domcontentloaded',timeout:remaining()});
    await page.waitForFunction(style=>document.querySelector('#designStyle')?.value===style,original.style,{timeout:remaining()});
    report.restored=true;
  }
  report.elapsedMs=Date.now()-started;
  return report;
}
