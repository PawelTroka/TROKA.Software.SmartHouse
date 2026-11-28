import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {DESIGN_STYLES} from '../src/design-styles.js';
import {getHouseFloorPlan} from '../src/house-model.js';
import {interiorMaterials} from '../src/interior-materials.js';
import {buildArchitecture} from '../src/interior-architecture.js';
import {modelTools,ringBounds} from '../src/interior-geometry.js';

const near=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<tol,`${a} differs from ${b}`);
const styles=DESIGN_STYLES.filter(s=>s.renovation).map(s=>s.id);
const apertures=plan=>plan.walls.filter(w=>w.exterior).flatMap(w=>w.openings
  .filter(o=>['front-kitchen','bathroom','spa-bath','sauna'].includes(o.roomId)).map(o=>({wall:w,opening:o})));

test('every renovation gives the sauna one real clear view aperture without changing Current',()=>{
  for(const designStyle of styles){
    const plan=getHouseFloorPlan({floor:'first',settings:{designStyle}}),room=plan.rooms.find(r=>r.id==='sauna'),bounds=ringBounds(room.polygon);
    const windows=apertures(plan).filter(({opening:o})=>o.roomId==='sauna');
    assert.equal(windows.length,1,designStyle);
    const {wall,opening:o}=windows[0],start=wall.a[1]+o.offset,end=start+o.width;
    assert.equal(wall.id,'right-facade');near(o.width,.96);near(o.height,1.30);near(o.sill,1.05);
    assert.equal(o.glazing,'clear');assert.equal(o.operation,'picture');assert.equal(o.panes,1);assert.equal(o.transoms,0);
    assert.ok(start>=bounds.z0+.10&&end<=bounds.z1-.10,'The sauna window leaves both partition junctions intact');
    assert.ok(o.sill>.57+.40,'The heater envelope finishes below the sill');
    const bath=windows[0].wall.openings.find(o=>o.roomId==='spa-bath');
    assert.ok(o.offset+o.width+.20<bath.offset,'The sauna and bathroom retain a separate solid pier');
  }
  for(const floor of ['ground','first']){
    const current=getHouseFloorPlan({floor,settings:{designStyle:'current'}});
    assert.ok(current.walls.flatMap(w=>w.openings).every(o=>!['indoor-sauna','kitchen-sink'].includes(o.service)));
    assert.ok(!current.architectureProposal,'Current remains the archived aperture layout');
  }
});

test('bathroom privacy closes the street aperture and keeps the side view in every renovation style',()=>{
  for(const designStyle of styles){
    const plan=getHouseFloorPlan({floor:'ground',settings:{designStyle}});
    const windows=apertures(plan).filter(({opening:o})=>o.roomId==='bathroom');
    assert.equal(windows.length,1,designStyle);
    const {wall,opening:o}=windows[0];assert.equal(wall.id,'right-facade');
    assert.equal(o.glazing,'reflective-privacy');assert.equal(o.privacy,true);
    assert.equal(o.privacyCondition,'outside-brighter-than-inside');assert.equal(o.nightPrivacyGuaranteed,false);
    assert.equal(o.outlook,'side-garden');assert.equal(o.panes,1);assert.equal(o.transoms,0);
    assert.ok(plan.walls.find(w=>w.id==='street-facade').openings.every(o=>o.type!=='window'));
    const archived=getHouseFloorPlan({floor:'ground',settings:{designStyle,bathroomPrivacyGlazing:false}});
    const oldWindows=apertures(archived).filter(({opening:o})=>o.roomId==='bathroom');
    assert.equal(oldWindows.length,2);assert.ok(oldWindows.every(({opening:o})=>o.glazing==='clear'&&!o.privacy));
  }
  const current=getHouseFloorPlan({floor:'ground',settings:{designStyle:'current',bathroomPrivacyGlazing:true}});
  assert.equal(current.walls.find(w=>w.id==='street-facade').openings.filter(o=>o.type==='window').length,2);
});

test('actual kitchen, bathroom and sauna meshes preserve views out and orient privacy reflection outside',()=>{
  const previous=globalThis.document,context=new Proxy({},{get:()=>()=>{}});
  globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>context})};
  try{
    for(const designStyle of ['scandinavian','modern-minimal','hidden-bali'])for(const floor of ['ground','first']){
      const plan=getHouseFloorPlan({floor,settings:{designStyle}}),tools=modelTools(),finishes=interiorMaterials(designStyle);
      const model=buildArchitecture(plan,{showFurniture:true,showStairs:true},tools,finishes);
      try{
        model.updateVisibility('building',{x:5,z:4});model.root.updateMatrixWorld(true);
        assert.ok(finishes.m.glass.transparent&&finishes.m.glass.opacity<=.15&&finishes.m.glass.roughness<=.08);
        assert.ok(finishes.m.privacyGlass.opacity>finishes.m.glass.opacity+.5,'Clear glass is materially different from the former opaque privacy pane');
        const outside=finishes.m.reflectivePrivacyExterior,inside=finishes.m.reflectivePrivacyInterior;
        assert.ok(outside.transparent&&outside.opacity<1&&outside.metalness>.8&&outside.roughness<.1);
        assert.ok(inside.transparent&&inside.opacity<=.2&&inside.side===THREE.FrontSide);
        assert.equal(outside.userData.nightPrivacyGuaranteed,false);
        const visible=[];model.root.traverseVisible(o=>{if(o.isMesh)visible.push(o);});
        for(const {wall,opening:o}of apertures(plan)){
          const dx=wall.b[0]-wall.a[0],dz=wall.b[1]-wall.a[1],length=Math.hypot(dx,dz),ux=dx/length,uz=dz/length;
          const outward=wall.id==='left-facade'?[-1,0]:wall.id==='right-facade'?[1,0]:[0,1];
          for(const along of [.22,.50,.78])for(const vertical of [.35,.70]){
            const d=o.offset+o.width*along,x=wall.a[0]+ux*d,z=wall.a[1]+uz*d,y=plan.elevation+o.sill+o.height*vertical;
            const ray=new THREE.Raycaster(new THREE.Vector3(x-outward[0]*.42,y,z-outward[1]*.42),new THREE.Vector3(outward[0],0,outward[1]),0,.67);
            const hits=ray.intersectObjects(visible,false);
            const expected=o.glazing==='reflective-privacy'?inside:finishes.m.glass;
            assert.ok(hits.some(hit=>hit.object.material===expected),`${designStyle}/${floor}/${o.roomId} lacks real glazing`);
            const opaque=hits.filter(hit=>{const m=hit.object.material;return !m.transparent||m.opacity>.2;});
            assert.equal(opaque.length,0,`${designStyle}/${floor}/${o.roomId} is blocked by opaque geometry at ${along}, ${vertical}`);
            if(o.glazing==='reflective-privacy'){
              const reverse=new THREE.Raycaster(new THREE.Vector3(x+outward[0]*.42,y,z+outward[1]*.42),new THREE.Vector3(-outward[0],0,-outward[1]),0,.67);
              const exteriorHits=reverse.intersectObjects(visible,false);
              assert.ok(exteriorHits.some(hit=>hit.object.material===outside),'The exterior must show reflective glazing');
              assert.ok(exteriorHits.every(hit=>hit.object.material!==inside),'The tinted inner face must not draw outside');
            }
          }
        }
        if(floor==='ground'){
          const street=new THREE.Raycaster(new THREE.Vector3(8.36,plan.elevation+1.65,9.15),new THREE.Vector3(0,0,-1),0,.70);
          const hits=street.intersectObjects(visible,false);
          assert.ok(hits.some(hit=>!hit.object.material.transparent),'The removed street window must be a solid wall');
          assert.ok(hits.every(hit=>hit.object.material!==finishes.m.glass),'The closed opening must have no residual clear pane');
        }
      }finally{model.dispose();tools.dispose();finishes.dispose();}
    }
  }finally{globalThis.document=previous;}
});
