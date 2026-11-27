import assert from 'node:assert/strict';
import {houseModelFrame,getHouseFloorPlan} from '../src/house-model.js';
import {containsPoint,ringBounds} from '../src/interior-geometry.js';
import {GARAGE_DEFAULTS} from '../src/garage-options.js';
import {applyPlanExterior} from '../src/plan-exterior.js';
import {WALK_COMFORT} from '../src/walk-motion.js';

const VIEWS=Object.freeze([
  // A step into the living room keeps the connected sink end and concealed
  // chimney together in the fixed walking lens; the closer kitchen spawn
  // cuts the chimney out of the frame.
  Object.freeze({id:'kitchen-storage-connection',floor:'ground',room:'front-kitchen',x:3.15,z:3.5,eye:1.57,yaw:-2.89,pitch:-.05}),
  Object.freeze({id:'fitted-kitchen-corner',floor:'ground',room:'front-kitchen',x:2.55,z:6.35,eye:1.57,yaw:2.43,pitch:-.08}),
  Object.freeze({id:'open-stair-guard',floor:'ground',room:'hall',x:5.15,z:5.55,eye:1.57,yaw:Math.PI,pitch:-.18}),
  Object.freeze({id:'protected-upper-landing',floor:'first',room:'hall',roomSpawn:true,
    walkTo:[4.83,6.32],via:[[4.83,4.60]],aim:[6.32,7.36],pitch:-.22}),
  Object.freeze({id:'integrated-upstairs-chimney',floor:'first',room:'spa-bath',roomSpawn:true,
    walkTo:[8.55,6.32],aim:[7.47,5.03],pitch:-.08}),
  Object.freeze({id:'guest-1-double-desk-tv',floor:'first',room:'guest-1',roomSpawn:true,
    walkTo:[9.47,3.48],aim:[9.96,1.13],pitch:-.22}),
  Object.freeze({id:'guest-2-double-desk-tv',floor:'first',room:'guest-2',roomSpawn:true,
    walkTo:[.64,6.31],aim:[3.35,5.65],pitch:-.23}),
  Object.freeze({id:'guest-3-double-desk-tv',floor:'first',room:'guest-3',roomSpawn:true,
    walkTo:[.64,8.13],aim:[3.35,7.60],pitch:-.23}),
  Object.freeze({id:'office-two-workstations',floor:'first',room:'office',roomSpawn:true,
    walkTo:[7.64,3.43],aim:[4.99,1.85],pitch:-.20,options:{officeCoworking:true,officeGuestBedOpen:false}}),
  Object.freeze({id:'office-emergency-single',floor:'first',room:'office',roomSpawn:true,
    walkTo:[5.53,.68],aim:[7.46,2.58],pitch:-.20,options:{officeCoworking:true,officeGuestBedOpen:true}}),
  Object.freeze({id:'compact-gym-parked',floor:'basement',room:'basement-gym',roomSpawn:true,
    roomFraction:[.50,.93],aimRoomFraction:[.48,.24],pitch:-.18,options:{gymBenchParked:true}}),
  Object.freeze({id:'compact-gym-strength-position',floor:'basement',room:'basement-gym',roomSpawn:true,
    roomFraction:[.80,.90],aimRoomFraction:[.55,.25],pitch:-.20,options:{gymBenchParked:false}}),
  Object.freeze({id:'plant-laundry',floor:'basement',room:'basement-technical',roomSpawn:true,yaw:-1.95,pitch:-.16}),
]);
const degrees=radians=>radians*180/Math.PI;
const angleDifference=(target,current)=>((target-current+540)%360+360)%360-180;

/** Daylight evidence through the real room selector, arrangement switches,
 * Share URL, custom observer and WASD controls. No renderer handles or private
 * state. Upstairs poses use room entry plus normal walking: the custom observer
 * is supported by the ground floor and cannot position an upstairs camera.
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
  timeout=120000,maxDurationMs=600000,includePlan=false,restore=false,exportDesign=null,
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
  const walkTo=async(target,floor)=>{
    const position=frame.toSite(target[0],target[1]),tolerance=.15;
    let pulses=0,travel=0;
    for(;pulses<40;pulses++){
      const before=await pose(),dx=position[0]-before.position[0],dz=position[1]-before.position[2],distance=Math.hypot(dx,dz);
      if(distance<=tolerance)return {pulses,travel,error:distance};
      await turnTo(degrees(Math.atan2(-dx,dz)),0);
      await canvas().focus({timeout:remaining()});const afterFrame=await frameCount();
      // Short real key presses remain bounded even on software WebGL. Each
      // next pulse is based on the observed public camera position, so slow
      // CI frames cannot turn a wall-clock guess into an uncontrolled move.
      const duration=Math.min(900,Math.max(75,distance/WALK_COMFORT.speed*650));
      await page.keyboard.down('w');
      try{await page.waitForTimeout(Math.min(duration,remaining()));}finally{await page.keyboard.up('w');}
      await walking(floor,{timeout:remaining(),settled:true,afterFrame});
      const after=await pose();travel+=Math.hypot(after.position[0]-before.position[0],after.position[2]-before.position[2]);
    }
    assert.fail(`Normal WASD did not reach ${floor} viewpoint ${JSON.stringify(target)} after ${pulses} bounded moves`);
  };
  const assertExport=(exported,expected)=>{
    const first=exported.interiors.floors.first,ground=exported.interiors.floors.ground,basement=exported.interiors.floors.basement;
    for(const [key,value] of Object.entries(expected))assert.equal(exported.settings[key],value,'Exported '+key);
    for(let n=1;n<=3;n++){
      const room=first.fixtures.filter(f=>f.roomId===`guest-${n}`),bed=room.find(f=>f.id===`guest${n}-bed`);
      assert.equal(bed?.sleepingCapacity,2);assert.equal(bed.mattressWidth,1.40);assert.equal(bed.mattressLength,2);
      assert.ok(room.some(f=>f.kind==='desk'&&f.workstations===1),`Guest ${n} has no work desk`);
      assert.ok(room.some(f=>f.kind==='wallTv'&&f.viewFromId===bed.id),`Guest ${n} has no bed-facing TV`);
    }
    assert.ok(!ground.fixtures.some(f=>f.id==='kitchen-sink-header'),'The unwanted over-window cupboard remains in the export');
    const corner=ground.fixtures.find(f=>f.id==='kitchen-pantry-corner');
    assert.equal(corner?.kind,'storage');assert.ok(corner.height>2.5&&!corner.baseHeight,'The pantry corner still has an empty counter-height recess');
    const desk=first.fixtures.find(f=>f.id==='office-desk'),sleeper=first.fixtures.find(f=>f.id==='office-guest-bed');
    assert.equal(desk.workstations,exported.settings.officeCoworking?2:1);
    assert.equal(sleeper.open,exported.settings.officeGuestBedOpen);assert.equal(sleeper.sleepingCapacity,1);
    const gym=basement.fixtures.filter(f=>f.roomId==='basement-gym'),bench=gym.find(f=>f.id==='gym-bench');
    assert.equal(bench?.parked,exported.settings.gymBenchParked);
    for(const kind of ['cableTrainer','exerciseBike','exerciseBench','adjustableDumbbells','gymStorage','exerciseMat'])assert.ok(gym.some(f=>f.kind===kind),'Missing gym equipment: '+kind);
    return {options:{officeCoworking:exported.settings.officeCoworking,officeGuestBedOpen:exported.settings.officeGuestBedOpen,gymBenchParked:exported.settings.gymBenchParked},
      officeStations:desk.workstations,singleBedOpen:sleeper.open,benchParked:bench.parked,guestBeds:3,gymEquipment: gym.map(f=>f.id)};
  };

  assert.equal(await page.evaluate(()=>Boolean(document.body.dataset.modelFullscreen)),false,
    'Run open-living captures after the existing fullscreen roundtrip has exited');
  const restoreUrl=(await share()).href;
  const original={url:restoreUrl,style:await q('#designStyle').inputValue(),
    date:await q('#sun-date').inputValue(),time:await q('#sun-time').inputValue()};
  assert.equal(new URL(restoreUrl).searchParams.get('site'),'sternicza-11');
  const captureSettings={...GARAGE_DEFAULTS,designStyle:style,basementGarageEnabled:true,garageProgress:100,
    firstFloorRise:3.05,atticRise:5.75,officeCoworking:true,officeGuestBedOpen:false,gymBenchParked:true};
  await navigate(restoreUrl,{designStyle:style,interiorView:'plan',interiorEnabled:false,interiorFloor:'ground',
    ...captureSettings,interiorFurniture:true,interiorChanges:false,showDimensions:false,walkNavigation:'free',sceneMotion:false,mode:'orbit'});
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
  const report={style,daylight,original,restoreUrl,views:[],arrangements:[],plan:null,restored:false};
  for(const view of VIEWS){
    remaining();
    await openInteriors();
    assert.equal(await field('canvas').locator('canvas').count(),0,'Plan-only room selection must not create another WebGL context');
    if(await field('floor').inputValue()!==view.floor)await field('floor').selectOption(view.floor,{timeout:remaining()});
    await field('room').selectOption(view.room,{timeout:remaining()});
    assert.equal(await field('room').inputValue(),view.room);
    assert.equal(await field('style').inputValue(),style);
    if(view.id==='office-two-workstations'&&exportDesign){
      // Exercise the one-person option once before restoring the requested
      // coworking arrangement. Both choices are checked against public JSON.
      await field('officeCoworking').uncheck({timeout:remaining()});
      await field('close').click({timeout:remaining()});await q('#interior-host').waitFor({state:'hidden',timeout:remaining()});
      report.arrangements.push({id:'office-single-station',...assertExport(await exportDesign(),{officeCoworking:false})});
      await openInteriors();
    }
    for(const [key,value] of Object.entries(view.options||{})){
      await field(key).setChecked(value,{timeout:remaining()});assert.equal(await field(key).isChecked(),value);
      captureSettings[key]=value;
    }
    const plan=getHouseFloorPlan({floor:view.floor,settings:captureSettings,data:applyPlanExterior(data,captureSettings)});
    const room=plan.rooms.find(r=>r.id===view.room);assert.ok(room);
    const roomBounds=ringBounds(room.polygon),relative=([x,z])=>[roomBounds.x0+x*roomBounds.width,roomBounds.z0+z*roomBounds.depth];
    if(includePlan&&view.id==='kitchen-storage-connection'){
      await field('plan').locator('svg').waitFor({state:'visible',timeout:remaining()});
      report.plan=`ground-${style}-open-living-renovation-plan`;
      await shot(report.plan,'#interior-host');
    }
    if(view.id==='compact-gym-parked'){
      await field('plan').locator('svg').waitFor({state:'visible',timeout:remaining()});
      report.basementPlan=`basement-${style}-gym-technical-plan`;
      await shot(report.basementPlan,'#interior-host');
    }
    await field('enter').click({timeout:remaining()});
    const spawn=await walking(view.floor,{timeout:remaining(),settled:true});
    if(exportDesign&&(view.options||view.id==='kitchen-storage-connection'))report.arrangements.push({id:view.id,...assertExport(await exportDesign(),view.options||{})});
    const moves=[],target=view.walkTo||(view.roomFraction?relative(view.roomFraction):null);
    if(target)for(const waypoint of [...(view.via||[]),target])moves.push(await walkTo(waypoint,view.floor));
    const current=await pose(),actualLocal=frame.toLocal(current.position[0],current.position[2],current.position[1]);
    const local=view.roomSpawn?(target?[...target,plan.elevation+1.57]:actualLocal):[view.x,view.z,view.eye];
    const p=frame.toSite(...local);
    const aim=view.aim||(view.aimRoomFraction?relative(view.aimRoomFraction):null);
    const localYaw=aim?Math.atan2(aim[0]-actualLocal[0],-(aim[1]-actualLocal[1])):view.yaw;
    const origin=view.roomSpawn?actualLocal:local,start=frame.toSite(...origin);
    const end=frame.toSite(origin[0]+Math.sin(localYaw)*Math.cos(view.pitch),
      origin[1]-Math.cos(localYaw)*Math.cos(view.pitch),origin[2]+Math.sin(view.pitch));
    const yaw=degrees(Math.atan2(-(end[0]-start[0]),end[1]-start[1])),pitch=degrees(view.pitch);
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
    assert.ok(Math.hypot(actual.position[0]-p[0],actual.position[2]-p[1])<(target?.17:.015),'Public camera controls must retain the intended interior location');
    const eye=view.roomSpawn?1.57:view.eye,elevation=plan.elevation;
    assert.ok(Math.abs(actual.altitude-(frame.floorZ+elevation+eye))<.015,
      'The camera must be 1.57 m above its actual room floor');
    if(view.roomSpawn){
      assert.ok(containsPoint(room.polygon,...actualLocal.slice(0,2)),'The public walking viewpoint must lie inside its selected room');
    }
    await canvas().scrollIntoViewIfNeeded({timeout:remaining()});
    const name=`${view.floor}-${style}-${view.id}-daylight`;
    await shot(name,'#scene-host canvas');
    report.views.push({name,room:view.room,requestedLocal:view,requestedSite:{x:p[0],y:p[1],altitude:p[2],yaw,pitch},
      actual,spawn,moves,drags,customUrl});
  }
  if(restore){
    await page.goto(restoreUrl,{waitUntil:'domcontentloaded',timeout:remaining()});
    await page.waitForFunction(style=>document.querySelector('#designStyle')?.value===style,original.style,{timeout:remaining()});
    report.restored=true;
  }
  report.elapsedMs=Date.now()-started;
  return report;
}
