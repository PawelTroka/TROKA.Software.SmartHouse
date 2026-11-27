import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {getInteriorPlan} from '../src/interior-plan.js';
import {INTERIOR_COMPOSITIONS} from '../src/interior-curation.js';
import {getHouseFloorPlan} from '../src/house-model.js';
import {getDesignStyle} from '../src/design-styles.js';
import {getInteriorStyleRecipe} from '../src/interior-style-recipes.js';
import {createStateModel} from '../src/state.js';
import {getSiteProfile} from '../src/sites.js';
import {applyPlanExterior} from '../src/plan-exterior.js';
import {furnishInterior} from '../src/interior-furniture.js';
import {containsPoint,modelTools,ringBounds,wallPanels} from '../src/interior-geometry.js';
import {createWalkNavigation} from '../src/house-walk.js';
import {createInteriorTaskLights} from '../src/interior-lighting.js';
import {drawInteriorPlan} from '../src/interior-plan-view.js';

const source=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const defaults=createStateModel(getSiteProfile(source.site.id,source)).DEFAULTS;
const near=(a,b,tol=1e-6)=>assert.ok(Math.abs(a-b)<tol,`${a} differs from ${b}`);
const setup=(extra={})=>{
  const settings={...defaults,designStyle:'warm-minimal',basementGarageEnabled:true,garageProgress:100,...extra};
  const data=applyPlanExterior(source,settings);
  return {settings,data,plan:getHouseFloorPlan({floor:'basement',settings,data})};
};
const fixtureBounds=f=>({x0:f.x-f.width/2,x1:f.x+f.width/2,z0:f.z-f.depth/2,z1:f.z+f.depth/2});
const overlaps=(a,b)=>Math.min(a.x1,b.x1)>Math.max(a.x0,b.x0)+1e-7&&Math.min(a.z1,b.z1)>Math.max(a.z0,b.z0)+1e-7;
function furnished(plan,styleId){
  const roles='wood oak frame steel bronze stone ceramic cabinet painted trim fabric linen duvet accent lacquer glow blackGlass rubber dark slate cane pot rug'.split(' ');
  const m=Object.fromEntries(roles.map(key=>[key,new THREE.MeshStandardMaterial()])),root=new THREE.Group(),tools=modelTools();
  furnishInterior(root,plan,tools,{m,style:getDesignStyle(styleId),interiorRecipe:getInteriorStyleRecipe(styleId)});
  root.updateMatrixWorld(true);
  return {root,dispose(){root.traverse(n=>{if(n.geometry&&!n.geometry.userData.sharedPrimitive)n.geometry.dispose();});tools.dispose();Object.values(m).forEach(material=>material.dispose());}};
}

test('all renovated kitchens close the pantry corner while leaving the sink window entirely uncapped and the entry 1.18 m wide',()=>{
  for(const styleId of Object.keys(INTERIOR_COMPOSITIONS)){
    const plan=getHouseFloorPlan({settings:{designStyle:styleId}}),byId=id=>plan.fixtures.find(f=>f.id===id);
    const upper=plan.fixtures.filter(f=>f.ceilingFitted);
    assert.equal(upper.length,4,styleId);
    for(const f of upper){near((f.baseHeight||0)+f.height,2.70);near((f.baseHeight||0)+f.height+f.ceilingScribe,plan.clearHeight);}
    const cooking=fixtureBounds(byId('kitchen-wall-storage')),
      pantryCorner=fixtureBounds(byId('kitchen-pantry-corner')),pantry=fixtureBounds(byId('east-counter'));
    near(pantry.z1,pantryCorner.z0);near(pantryCorner.z1,cooking.z1);
    near(pantryCorner.x0-cooking.x1,.005);
    assert.equal(byId('kitchen-pantry-corner').kind,'storage');assert.ok(!byId('kitchen-pantry-corner').baseHeight);
    assert.equal(byId('kitchen-sink-header'),undefined,'the over-window cabinet was explicitly removed');
    assert.equal(byId('kitchen-corner-storage'),undefined,'the upper return beside the window was explicitly removed');
    assert.equal(byId('kitchen-sink-side-storage'),undefined,'the upper cabinet beside the window was explicitly removed');
    const window=plan.walls.find(w=>w.id==='left-facade').openings.find(o=>o.roomId==='front-kitchen');
    const windowStart=plan.walls.find(w=>w.id==='left-facade').a[1]+window.offset,windowEnd=windowStart+window.width;
    near(window.width,2.30);assert.ok(cooking.z0>windowEnd+.20,'the remaining cooking wall cabinet leaves the wider window reveal clear');
    near(byId('kitchen-fridge-top').baseHeight-byId('kitchen-fridge').height,.02);
    const island=byId('kitchen-island'),enclosure=ringBounds(plan.cores.find(c=>c.id==='west-flue').enclosure.polygon);
    near(enclosure.x0-island.x-island.width/2,1.18);near(island.width,2.20);
    const model=furnished({...plan,fixtures:upper},styleId);
    try{
      for(const f of upper){
        const object=model.root.children.find(o=>o.userData.fixtureId===f.id),box=new THREE.Box3().setFromObject(object);
        near(box.max.y,plan.clearHeight,2e-5);
        assert.ok(box.min.y>=(f.baseHeight||0)-1e-5,styleId+' upper front or handle hangs below its fitted cabinet');
      }
      // The screenshot showed an open alcove above the worktop beside the
      // tall pantry. Test that its actual middle-height front is now closed.
      const cornerObject=model.root.children.find(o=>o.userData.fixtureId==='kitchen-pantry-corner');
      for(const y of [1.03,1.20,1.43,2.30]){
        const ray=new THREE.Raycaster(new THREE.Vector3(3.25,y,8.17),new THREE.Vector3(1,0,0),0,1.1);
        const hit=ray.intersectObject(cornerObject,true)[0];assert.ok(hit,styleId+' still has an empty pantry-corner recess at '+y);
        assert.ok(hit.point.x<3.80,styleId+' corner front is recessed behind the adjoining pantry');
      }
      for(const y of [window.sill+window.height+.12,plan.clearHeight-.03]){
        const ray=new THREE.Raycaster(new THREE.Vector3(1.1,y,(windowStart+windowEnd)/2),new THREE.Vector3(-1,0,0),0,.8);
        assert.equal(ray.intersectObject(model.root,true).length,0,styleId+' still has cabinetry above the sink window');
      }
    }finally{model.dispose();}
  }
  const current=getHouseFloorPlan({settings:{designStyle:'current'}});
  assert.ok(current.fixtures.every(f=>!f.ceilingFitted),'Current preserves the archived kitchen');
});

test('ceiling-fitted storage follows edited floor levels without extending through a lower ceiling',()=>{
  for(const firstFloorRise of [2.70,3.05,3.40]){
    const plan=getHouseFloorPlan({settings:{designStyle:'warm-minimal',firstFloorRise}});
    for(const f of plan.fixtures.filter(f=>f.ceilingFitted))near((f.baseHeight||0)+f.height+f.ceilingScribe,plan.clearHeight);
    assert.ok(!plan.fixtures.some(f=>f.id==='kitchen-sink-header'),'the sink window stays uncapped at every ceiling height');
  }
});

test('the two basement rooms use only the measured remainder and preserve exact garage, stairs and flues in every renovation',()=>{
  const original=setup({designStyle:'current'}).plan;
  for(const designStyle of Object.keys(INTERIOR_COMPOSITIONS)){
    const {plan}=setup({designStyle});
    assert.deepEqual(plan.garage,original.garage);assert.deepEqual(plan.conflicts,original.conflicts);
    assert.deepEqual(plan.cores,original.cores);assert.deepEqual(plan.stairs.map(s=>s.polygon),original.stairs.map(s=>s.polygon));
    assert.deepEqual(plan.fixtures.filter(f=>f.kind==='car'),original.fixtures);
    assert.deepEqual(plan.walls.find(w=>w.id==='garage-portal'),original.walls.find(w=>w.id==='garage-portal'));
    const gym=plan.rooms.find(r=>r.id==='basement-gym'),technical=plan.rooms.find(r=>r.id==='basement-technical');
    near(gym.area,17.03);near(technical.area,11.19);near(ringBounds(gym.polygon).width,3.869973709312923);
    near(plan.clearHeight,2.30);near(plan.elevation,-2.60);
    assert.equal(plan.basementFitOut.originalClearHeight,1.70);assert.equal(plan.basementFitOut.loweringBeyondGarage,true);
    assert.ok(plan.issues.some(s=>s.includes('new slab beneath the side rooms')));
    const fittings=plan.fixtures.filter(f=>f.kind!=='car');
    for(const f of fittings){
      const b=fixtureBounds(f),room=ringBounds(plan.rooms.find(r=>r.id===f.roomId).polygon);
      assert.ok(b.x0>=room.x0-1e-7&&b.x1<=room.x1+1e-7&&b.z0>=room.z0-1e-7&&b.z1<=room.z1+1e-7,designStyle+': '+f.id+' leaves its room');
      assert.ok(b.x0>=plan.garage.x1+.20-1e-7,designStyle+': '+f.id+' enters a parking lane');
      assert.ok(!plan.cores.some(c=>overlaps(b,ringBounds(c.polygon))),f.id+' intersects a retained flue');
    }
    const solid=fittings.filter(f=>!f.wallMounted&&!f.hostId&&!f.nonBlocking);
    for(const [i,a]of solid.entries())for(const b of solid.slice(i+1))assert.ok(!overlaps(fixtureBounds(a),fixtureBounds(b)),a.id+' overlaps '+b.id);
    const host={innerHTML:''};drawInteriorPlan(host,plan,{showFurniture:true});
    assert.match(host.innerHTML,/Compact gym/);assert.match(host.innerHTML,/Technical room/);
  }
  assert.equal(original.basementFitOut,undefined);
  for(const designStyle of ['current','warm-minimal']){
    const cellar=setup({designStyle,basementGarageEnabled:false}).plan;
    near(cellar.elevation,-2);near(cellar.clearHeight,1.70);assert.equal(cellar.basementFitOut,undefined);
  }
});

// Square wall ends match the actual jamb geometry. A capsule approximation
// would wrongly reduce a 0.90 m opening in a 0.40 m wall to only 0.50 m.
function circulation(plan){
  const distanceRect=(x,z,b)=>Math.hypot(Math.max(b.x0-x,0,x-b.x1),Math.max(b.z0-z,0,z-b.z1));
  const distanceLine=(x,z,a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);};
  const distances=[];
  for(const w of plan.walls){
    const dx=w.b[0]-w.a[0],dz=w.b[1]-w.a[1],length=Math.hypot(dx,dz),ux=dx/length,uz=dz/length;
    for(const p of wallPanels(w,plan.clearHeight).filter(p=>p.bottom<.20))distances.push((x,z)=>distanceRect((x-w.a[0])*ux+(z-w.a[1])*uz,-(x-w.a[0])*uz+(z-w.a[1])*ux,{x0:p.left,x1:p.right,z0:-w.thickness/2,z1:w.thickness/2}));
    for(const o of w.openings.filter(o=>o.type==='door')){
      const end=o.hinge==='end',sign=end?-1:1,hinge=o.offset+(end?o.width-.047:.047),angle=-sign*(o.swing||1)*Math.PI/2,
        a=[w.a[0]+ux*hinge,w.a[1]+uz*hinge],along=sign*(o.width-.10)*Math.cos(angle),across=-sign*(o.width-.10)*Math.sin(angle),
        b=[a[0]+along*ux-across*uz,a[1]+along*uz+across*ux];
      distances.push((x,z)=>distanceLine(x,z,a,b)-.018);
    }
  }
  for(const f of plan.fixtures.filter(f=>!f.wallMounted&&!f.hostId&&!f.nonBlocking)){
    const b=fixtureBounds(f.kind==='car'?{...f,width:f.mirrorWidth}:f);distances.push((x,z)=>distanceRect(x,z,b));
  }
  for(const p of [...plan.cores.map(c=>c.polygon),...plan.stairs.filter(s=>s.from==='basement').map(s=>s.polygon)]){
    const b=ringBounds(p);distances.push((x,z)=>distanceRect(x,z,b));
  }
  const free=(x,z)=>containsPoint(plan.envelope.outline,x,z)&&distances.every(d=>d(x,z)>=.30-1e-7);
  const step=.03,nx=360,nz=301,seen=new Uint8Array(nx*nz),queue=[],start=[5.55,8.46],index=(x,z)=>Math.round(z/step)*nx+Math.round(x/step);
  assert.ok(free(...start),'0.60 m body has a clear stair-foot starting point');
  queue.push(index(...start));seen[queue[0]]=2;
  for(let i=0;i<queue.length;i++){
    const n=queue[i],x=n%nx,z=Math.floor(n/nx);
    for(const [a,b]of [[x-1,z],[x+1,z],[x,z-1],[x,z+1]]){
      if(a<0||b<0||a>=nx||b>=nz)continue;const next=b*nx+a;if(seen[next])continue;
      seen[next]=free(a*step,b*step)?2:1;if(seen[next]===2)queue.push(next);
    }
  }
  return point=>seen[index(...point)]===2;
}

test('a 0.60 m route reaches every new equipment approach from the retained stair with both mirrored car envelopes present',()=>{
  for(const gymBenchParked of [true,false]){
    const {plan}=setup({gymBenchParked}),reachable=circulation(plan),bench=plan.fixtures.find(f=>f.id==='gym-bench');
    assert.equal(bench.parked,gymBenchParked,'the selected bench position reaches the shared house plan');
    for(const f of plan.fixtures.filter(f=>f.approach))assert.ok(reachable(f.approach),f.id+' has no usable route with bench '+(gymBenchParked?'parked':'in use'));
    const mat=plan.fixtures.find(f=>f.activityZone);assert.ok(reachable([mat.x,mat.z]));
    const solid=plan.fixtures.filter(f=>f.kind!=='car'&&!f.wallMounted&&!f.hostId&&!f.nonBlocking);
    for(const [i,a]of solid.entries())for(const b of solid.slice(i+1))assert.ok(!overlaps(fixtureBounds(a),fixtureBounds(b)),a.id+' overlaps '+b.id);
  }
});

test('the real shared walking engine reaches both basement rooms around parked Cybersters and preserves free exploration',()=>{
  const {settings,data}=setup(),walk=createWalkNavigation(data,settings),floor=walk.plans.basement;
  const world=(x,z,y)=>{const p=walk.frame.toSite(x,z,y);return[p[0],p[2],p[1]];};
  let p=walk.locate(world(5.55,8.45,floor.elevation+1.57),{maxDistance:.245});assert.ok(p);
  const route=[[5.55,5.60],[9,5.60],[9,7.20],[9,5.60],[9,4.10],[8.40,3.45],[9,4.10],[9,5.60],[5.55,5.60],[5.55,8.45]];
  for(const [x,z]of route){
    const target=world(x,z,0),count=Math.ceil(Math.hypot(target[0]-p.position[0],target[2]-p.position[2])/.025),delta=[(target[0]-p.position[0])/count,0,(target[2]-p.position[2])/count];
    for(let i=0;i<count;i++)p=walk.move(p.position,delta,{eyeHeight:p.eyeHeight});
    const local=walk.frame.toLocal(p.position[0],p.position[2],p.position[1]);near(local[0],x,.025);near(local[1],z,.025);
    // The unchanged garage apron meets the stair-foot approach within 3 cm;
    // both occupied rooms must stay exactly on the lowered basement slab.
    near(local[2]-p.eyeHeight,floor.elevation,x>=7.08?1e-6:.035);
  }
  for(const id of ['basement-gym','basement-technical']){const spawn=walk.spawnFloor('basement',id);assert.equal(spawn.floor,'basement');assert.equal(spawn.roomId,id);}
  const freely=walk.locateFree(world(7.45,7.08,floor.elevation+1.57));assert.ok(freely,'the new plant remains explorable in unrestricted mode');
});

test('new equipment has finite detailed geometry inside its footprints and the low basement ceiling',()=>{
  const {plan}=setup(),fixtures=plan.fixtures.filter(f=>f.kind!=='car');
  for(const styleId of ['warm-minimal','hidden-bali','modern-minimal']){
    const model=furnished({...plan,fixtures},styleId);
    try{
      for(const f of fixtures){
        const object=model.root.children.find(o=>o.userData.fixtureId===f.id),b=new THREE.Box3().setFromObject(object);
        assert.ok(b.max.y<=plan.clearHeight+.001&&b.min.y>=-.001,f.id+' exceeds basement headroom');
        assert.ok(b.min.x>=f.x-f.width/2-.06&&b.max.x<=f.x+f.width/2+.06&&b.min.z>=f.z-f.depth/2-.06&&b.max.z<=f.z+f.depth/2+.06,f.id+' geometry exceeds its planned footprint');
        let meshes=0;object.traverse(o=>{if(o.isMesh){meshes++;for(const a of Object.values(o.geometry.attributes))assert.ok(Array.from(a.array).every(Number.isFinite),f.id+' has invalid geometry');}});
        assert.ok(meshes>0&&meshes<160,f.id+' geometry is missing or exceeds its bounded detail budget');
      }
    }finally{model.dispose();}
  }
});

test('occupied basement task lighting has two bounded sources and retains daytime illumination without shadows',()=>{
  const {plan}=setup(),lights=createInteriorTaskLights(plan.interiorLights,'#ffefdc',{limit:2});
  try{assert.equal(lights.count,2);lights.update(0);assert.equal(lights.root.visible,true);
    for(const light of lights.root.children){assert.ok(light.intensity>0);assert.ok(light.distance<=4.6);assert.equal(light.castShadow,false);}
    lights.update(1);for(const light of lights.root.children)near(light.intensity,5.5);
  }finally{lights.dispose();}
});
