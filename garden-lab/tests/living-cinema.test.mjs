import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {LIVING_CINEMA_LAYOUTS,LIVING_CINEMA_SCREEN,livingCinemaLayout,livingCinemaDiagnostics} from '../src/living-cinema.js';
import {getInteriorPlan} from '../src/interior-plan.js';
import {getHouseFloorPlan,houseModelKey} from '../src/house-model.js';
import {walkGeometry} from '../src/interior-navigation.js';
import {drawInteriorPlan} from '../src/interior-plan-view.js';
import {coastalCeilingPanels,ceilingPanelsAroundDevices,interiorWallFeatures} from '../src/interior-architecture.js';
import {furnishInterior} from '../src/interior-furniture.js';
import {modelTools} from '../src/interior-geometry.js';
import {getDesignStyle} from '../src/design-styles.js';
import {getInteriorStyleRecipe} from '../src/interior-style-recipes.js';

const near=(a,b,e=1e-5)=>assert.ok(Math.abs(a-b)<=e,`${a} versus ${b}`);
const plan=(id,style='scandinavian',settings={})=>getHouseFloorPlan({settings:{designStyle:style,livingCinemaLayout:id,...settings}});
const box=f=>({x0:f.x-f.width/2,x1:f.x+f.width/2,z0:f.z-f.depth/2,z1:f.z+f.depth/2});
const overlaps=(a,b)=>a.x0<b.x1-1e-6&&a.x1>b.x0+1e-6&&a.z0<b.z1-1e-6&&a.z1>b.z0+1e-6;

test('A/B/D physically place seven ear-level channels, two subs and four overheads around the real listener',()=>{
  for(const layout of LIVING_CINEMA_LAYOUTS.filter(o=>o.hasCinema)){
    const c=livingCinemaLayout({layout:layout.id}),speakers=c.fixtures.filter(f=>f.kind==='cinemaSpeaker'),subs=c.fixtures.filter(f=>f.kind==='cinemaSub');
    assert.equal(speakers.filter(f=>f.layer==='ear-level').length,7);assert.equal(speakers.filter(f=>f.layer==='overhead').length,4);assert.equal(subs.length,2);
    assert.equal(new Set([...speakers,...subs].map(f=>f.channel)).size,13);assert.equal(c.audio.amplifiedChannels,11);
    const expected={FL:-25,FR:25,C:0,SL:-100,SR:100,SBL:-140,SBR:140};
    for(const f of speakers){
      const dx=f.x-c.listener.x,dz=f.z-c.listener.z,[fx,fz]=c.listener.forward;
      const along=dx*fx+dz*fz,across=-dx*fz+dz*fx,actual=Math.atan2(across,along)*180/Math.PI;
      near(actual,f.azimuthDegrees,4e-5);
      if(f.layer==='ear-level'){
        near(actual,expected[f.channel],4e-5);
        if(f.channel!=='C')near(f.mountHeight,c.listener.earHeight);
      }else{
        const angle=Math.atan2(f.mountHeight-c.listener.earHeight,along)*180/Math.PI;
        assert.ok(f.channel.startsWith('TF')?angle>=30&&angle<=55:angle>=125&&angle<=150,`${layout.id} ${f.channel}: ${angle}`);
        assert.ok(f.ceilingMounted&&f.wallMounted);near(f.mountHeight,2.728);
      }
    }
    assert.ok(Math.hypot(subs[0].x-subs[1].x,subs[0].z-subs[1].z)>3,'subs occupy distinct separated positions');
    assert.ok(c.screen.viewingDistance>2.2&&c.screen.viewingDistance<2.9);
    near(Math.hypot(LIVING_CINEMA_SCREEN.width,LIVING_CINEMA_SCREEN.height)/.0254,85,.0001);
  }
});

test('all four alternatives keep physical furniture and chair envelopes apart, a metre at the HST, and a walkable hall route',()=>{
  for(const {id} of LIVING_CINEMA_LAYOUTS){
    const p=plan(id),solid=p.livingCinema.fixtures.filter(f=>!f.wallMounted&&!f.nonBlocking),clear=walkGeometry(p);
    for(const f of solid){
      const b=box(f);assert.ok(b.x0>=.35-1e-6&&b.x1<=10.42+1e-6,id+' '+f.id+' outside room');
      assert.ok(b.z0>=1.35-1e-6&&b.z1<=4.85+1e-6,id+' '+f.id+' obstructs the HST strip or front passage');
    }
    for(let i=0;i<solid.length;i++)for(let j=i+1;j<solid.length;j++){
      const expand=f=>box({...f,depth:f.depth+(f.kind==='diningTable'?1:0)});
      assert.ok(!overlaps(expand(solid[i]),expand(solid[j])),id+' '+solid[i].id+' overlaps '+solid[j].id);
    }
    // Independent 0.60 m walking-disc checks include all actual walls, flues,
    // room furniture and stairs, not just the cinema's nominal rectangles.
    for(let z=.65;z<5.70;z+=.10)assert.ok(clear(5.4,z,true,.30),id+' blocks entry-to-garden route at '+z);
    for(let x=.75;x<10.03;x+=.10)assert.ok(clear(x,.85,true,.30),id+' blocks the garden-glazing walk lane at '+x);
    assert.equal(p.fixtures.find(f=>f.id==='table').seats,8);
  }
});

test('A and B swap the room programme and solid media bay; C and D retain both real side-window cutouts',()=>{
  for(const style of ['scandinavian','modern-minimal','hidden-bali'])for(const {id}of LIVING_CINEMA_LAYOUTS){
    const p=plan(id,style),wanted={left:id!=='left-media',right:id!=='right-media'};
    for(const side of ['left','right']){
      const wall=p.walls.find(w=>w.id===side+'-facade'),windows=wall.openings.filter(o=>wall.a[1]+o.offset+o.width/2<4.85);
      assert.equal(windows.length,wanted[side]?1:0,id+' '+side);
      if(wanted[side]){near(windows[0].width,3.10);near(windows[0].height,2.10);assert.equal(windows[0].glazing,'clear');assert.equal(windows[0].panes,1);}
    }
    const hst=p.walls.find(w=>w.id==='garden-hst').openings;assert.equal(hst.length,1);assert.equal(hst[0].type,'hst');assert.ok(hst[0].width>10);
    const lounge=p.rooms.find(r=>r.id==='lounge'),table=p.fixtures.find(f=>f.id==='table');
    assert.equal(lounge.polygon[0][0],id==='left-media'?.35:5.89);
    assert.ok(id==='left-media'?table.x>5.89:table.x<5.89);
  }
  const c=plan('garden-salon');assert.equal(c.livingCinema.hasCinema,false);assert.equal(c.livingCinema.listener,null);
  assert.ok(!c.fixtures.some(f=>f.roomId==='lounge'&&(f.channel||['tv','wallTv','cinemaConsole','cinemaPanel'].includes(f.kind))));
});

test('legacy archives stay unchanged and ceiling-mounted devices follow edited floor heights',()=>{
  const base=getInteriorPlan({styleId:'scandinavian'});
  assert.deepEqual(getInteriorPlan({styleId:'scandinavian',livingCinemaLayout:'legacy'}),base);
  assert.deepEqual(getInteriorPlan({styleId:'scandinavian',livingCinemaLayout:'unknown'}),base);
  assert.equal(getInteriorPlan({layout:'existing',livingCinemaLayout:'right-media'}).livingCinema,undefined);
  for(const firstFloorRise of [2.8,3.05,3.35]){
    const p=plan('right-media','scandinavian',{firstFloorRise});
    for(const f of p.fixtures.filter(f=>f.ceilingMounted))near(f.mountHeight,p.clearHeight-.022);
    const panel=p.fixtures.find(f=>f.kind==='cinemaPanel');assert.ok(panel.mountHeight+panel.height/2<p.clearHeight);
    assert.equal(p.issues.filter(s=>s.startsWith('The selected cinema reserves')).length,1);
  }
  assert.notEqual(houseModelKey({livingCinemaLayout:'right-media'}),houseModelKey({livingCinemaLayout:'left-media'}));
});

test('decorative ceiling boards and wall features leave the real cinema devices clear',()=>{
  for(const {id}of LIVING_CINEMA_LAYOUTS.filter(o=>o.hasCinema)){
    const p=plan(id,'coastal'),room=p.rooms.find(r=>r.id==='lounge'),devices=p.fixtures.filter(f=>f.ceilingMounted),panels=coastalCeilingPanels(room,p);
    assert.ok(panels.length>20);assert.ok(![...interiorWallFeatures(p).values()].flat().some(f=>f.roomId==='lounge'));
    const beams=devices.flatMap(f=>ceilingPanelsAroundDevices([{x:f.x,z:2.6,width:.10,depth:4.1}],p));
    for(const panel of [...panels,...beams])for(const f of devices){
      const distance=Math.hypot(Math.max(Math.abs(f.x-panel.x)-panel.width/2,0),Math.max(Math.abs(f.z-panel.z)-panel.depth/2,0));
      assert.ok(distance>=.14-1e-6,'ceiling finish conceals '+f.channel);
    }
  }
});

test('channel labels and serializable diagnostics describe the same selected geometry',()=>{
  for(const {id,hasCinema}of LIVING_CINEMA_LAYOUTS){
    const p=plan(id),d=livingCinemaDiagnostics(p),host={innerHTML:''};drawInteriorPlan(host,p);
    assert.equal(d.id,id);assert.equal(d.channels.length,hasCinema?13:0);
    assert.doesNotThrow(()=>JSON.stringify(d));
    if(hasCinema)for(const channel of d.channels){assert.ok(host.innerHTML.includes(`data-iw-fixture="${channel.id}"`));assert.ok(host.innerHTML.includes('>'+channel.channel+'</text>'));}
    assert.equal(p.fixtures.filter(f=>f.roomId==='lounge'&&f.equipmentLabel).length,hasCinema?2:0);
  }
});

test('rendered cinema devices fit their planned footprints and reuse supplied finish materials',()=>{
  const keys='wall ceiling cut trim wood oak boards tiles stone slate frame dark blackGlass steel bronze cabinet fabric accent linen duvet rug ceramic water glass leaf leafLight pot paper art glow addition removed concrete brick plinth brickFloor earth cane lacquer spaWater spaGlow bubbles floor painted lampShade';
  for(const styleId of ['scandinavian','modern-minimal','hidden-bali']){
    const m=Object.fromEntries(keys.split(' ').map(key=>[key,new THREE.MeshStandardMaterial({color:'#808080'})])),allowed=new Set(Object.values(m)),tools=modelTools(),finishes={m,style:getDesignStyle(styleId),interiorRecipe:getInteriorStyleRecipe(styleId)};
    try{for(const {id}of LIVING_CINEMA_LAYOUTS.filter(o=>o.hasCinema))for(const f of livingCinemaLayout({layout:id}).fixtures.filter(f=>f.kind.startsWith('cinema'))){
      const root=new THREE.Group();furnishInterior(root,{fixtures:[f]},tools,finishes);root.updateMatrixWorld(true);
      const b=new THREE.Box3().setFromObject(root,true),epsilon=.014;
      assert.ok(!b.isEmpty(),f.id+' has no actual model');
      assert.ok(b.min.x>=f.x-f.width/2-epsilon&&b.max.x<=f.x+f.width/2+epsilon,`${id} ${f.id} width: ${b.min.x}..${b.max.x}`);
      assert.ok(b.min.z>=f.z-f.depth/2-epsilon&&b.max.z<=f.z+f.depth/2+epsilon,`${id} ${f.id} depth: ${b.min.z}..${b.max.z}`);
      if(f.ceilingMounted)assert.ok(b.max.y<2.75&&b.min.y>2.70);
      root.traverse(n=>{if(n.isMesh)assert.ok(allowed.has(n.material),'device cloned or replaced a style material');});
      root.traverse(n=>{if(n.geometry&&!n.geometry.userData.sharedPrimitive)n.geometry.dispose();});
    }}finally{tools.dispose();Object.values(m).forEach(v=>v.dispose());}
  }
});
