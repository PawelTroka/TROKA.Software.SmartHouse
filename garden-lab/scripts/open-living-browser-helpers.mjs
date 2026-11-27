import assert from 'node:assert/strict';
import {houseModelFrame,getHouseFloorPlan} from '../src/house-model.js';
import {containsPoint} from '../src/interior-geometry.js';
import {GARAGE_DEFAULTS} from '../src/garage-options.js';
import {applyPlanExterior} from '../src/plan-exterior.js';
import {WALK_COMFORT} from '../src/walk-motion.js';

const VIEWS=Object.freeze([
  // A step into the living room keeps the connected sink end and concealed
  // chimney together in the fixed walking lens; the closer kitchen spawn
  // cuts the chimney out of the frame.
  Object.freeze({id:'kitchen-storage-connection',floor:'ground',room:'front-kitchen',x:3.15,z:3.5,eye:1.57,yaw:-2.89,pitch:-.05}),
  Object.freeze({id:'open-stair-guard',floor:'ground',room:'hall',x:5.15,z:5.55,eye:1.57,yaw:Math.PI,pitch:-.18}),
  Object.freeze({id:'compact-gym',floor:'basement',room:'basement-gym',roomSpawn:true,yaw:-.50,pitch:-.18}),
  Object.freeze({id:'plant-laundry',floor:'basement',room:'basement-technical',roomSpawn:true,yaw:-1.95,pitch:-.16}),
]);
const degrees=radians=>radians*180/Math.PI;
const angleDifference=(target,current)=>((target-current+540)%360+360)%360-180;

/** Four daylight screenshots through the existing room selector, Share URL,
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
  timeout=120000,maxDurationMs=420000,includePlan=false,restore=false,
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
  const captureSettings={...GARAGE_DEFAULTS,designStyle:style,basementGarageEnabled:true,garageProgress:100};
  await navigate(restoreUrl,{designStyle:style,interiorView:'plan',interiorEnabled:false,interiorFloor:'ground',
    ...captureSettings,interiorFurniture:true,interiorChanges:false,walkNavigation:'free',sceneMotion:false,mode:'orbit'});
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
  captureSettings.floorHeight=floorHeight;
  const basementPlan=getHouseFloorPlan({floor:'basement',settings:captureSettings,data:applyPlanExterior(data,captureSettings)});
  assert.ok(basementPlan.basementFitOut,'The public source and selected garage proposal must contain both basement rooms');
  const report={style,daylight,original,restoreUrl,views:[],plan:null,restored:false};
  for(const view of VIEWS){
    remaining();
    await openInteriors();
    assert.equal(await field('canvas').locator('canvas').count(),0,'Plan-only room selection must not create another WebGL context');
    if(await field('floor').inputValue()!==view.floor)await field('floor').selectOption(view.floor,{timeout:remaining()});
    await field('room').selectOption(view.room,{timeout:remaining()});
    assert.equal(await field('room').inputValue(),view.room);
    assert.equal(await field('style').inputValue(),style);
    if(includePlan&&view.id==='kitchen-storage-connection'){
      await field('plan').locator('svg').waitFor({state:'visible',timeout:remaining()});
      report.plan=`ground-${style}-open-living-renovation-plan`;
      await shot(report.plan,'#interior-host');
    }
    if(view.id==='compact-gym'){
      await field('plan').locator('svg').waitFor({state:'visible',timeout:remaining()});
      report.basementPlan=`basement-${style}-gym-technical-plan`;
      await shot(report.basementPlan,'#interior-host');
    }
    await field('enter').click({timeout:remaining()});
    const spawn=await walking(view.floor,{timeout:remaining(),settled:true});
    const local=view.roomSpawn?frame.toLocal(spawn.position[0],spawn.position[2],spawn.position[1]):[view.x,view.z,view.eye];
    const p=frame.toSite(...local);
    const end=frame.toSite(local[0]+Math.sin(view.yaw)*Math.cos(view.pitch),
      local[1]-Math.cos(view.yaw)*Math.cos(view.pitch),local[2]+Math.sin(view.pitch));
    const yaw=degrees(Math.atan2(-(end[0]-p[0]),end[1]-p[1])),pitch=degrees(view.pitch);
    let customUrl=null;
    if(!view.roomSpawn){
      customUrl=await navigate(await share(),{mode:'eye',preset:'custom',observerX:p[0],observerY:p[1],
        eyeHeight:view.eye,fov:70,interiorEnabled:false,interiorView:'plan'});
      await waitMode('eye');
      const beforeWalk=await frameCount();
      await q('#viewer button[data-mode="walk"]').click({timeout:remaining()});
      await walking(view.floor,{timeout:remaining(),settled:true,afterFrame:beforeWalk});
    }
    const {drags,afterFrame}=await turnTo(yaw,pitch);
    await walking(view.floor,{timeout:remaining(),settled:true,afterFrame});
    const actual=await pose();
    assert.equal(actual.floor,view.floor);assert.equal(actual.navigation,'free');assert.equal(actual.fov,70);
    assert.ok(Math.hypot(actual.position[0]-p[0],actual.position[2]-p[1])<.015,'Public camera controls must retain the intended interior location');
    const eye=view.roomSpawn?1.57:view.eye,elevation=view.floor==='basement'?basementPlan.elevation:0;
    assert.ok(Math.abs(actual.altitude-(frame.floorZ+elevation+eye))<.015,
      'The camera must be 1.57 m above its actual room floor');
    if(view.roomSpawn){
      const room=basementPlan.rooms.find(r=>r.id===view.room);assert.ok(room);
      assert.ok(containsPoint(room.polygon,...local.slice(0,2)),'The public room spawn must lie inside the selected basement room');
    }
    await canvas().scrollIntoViewIfNeeded({timeout:remaining()});
    const name=`${view.floor}-${style}-${view.id}-daylight`;
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
