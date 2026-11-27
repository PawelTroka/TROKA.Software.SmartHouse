import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {getInteriorPlan} from '../src/interior-plan.js';
import {INTERIOR_COMPOSITIONS} from '../src/interior-curation.js';
import {guestAndOfficeFixtures,GYM_EQUIPMENT_REFERENCES} from '../src/living-fitouts.js';
import {getDesignStyle} from '../src/design-styles.js';
import {getInteriorStyleRecipe} from '../src/interior-style-recipes.js';
import {furnishInterior} from '../src/interior-furniture.js';
import {modelTools,ringBounds} from '../src/interior-geometry.js';
import {walkGeometry} from '../src/interior-navigation.js';
import {drawInteriorPlan} from '../src/interior-plan-view.js';
import {createWalkNavigation} from '../src/house-walk.js';
import {createStateModel} from '../src/state.js';
import {getSiteProfile} from '../src/sites.js';
import {applyPlanExterior} from '../src/plan-exterior.js';

const near=(a,b,tolerance=1e-5)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} differs from ${b}`);
const byId=(plan,id)=>plan.fixtures.find(f=>f.id===id);
const rooms=new Set(['guest-1','guest-2','guest-3','office']);
function furnished(plan,styleId){
  const keys='wall ceiling cut trim wood oak boards tiles stone slate frame dark blackGlass steel bronze cabinet fabric accent linen duvet rug ceramic water glass leaf leafLight pot paper art glow addition removed concrete brick plinth brickFloor earth cane lacquer spaWater spaGlow bubbles floor painted lampShade rubber';
  const m=Object.fromEntries(keys.split(' ').map(key=>[key,new THREE.MeshStandardMaterial()])),root=new THREE.Group(),tools=modelTools();
  furnishInterior(root,plan,tools,{m,style:getDesignStyle(styleId),interiorRecipe:getInteriorStyleRecipe(styleId)});root.updateMatrixWorld(true);
  return {root,dispose(){root.traverse(n=>{if(n.geometry&&!n.geometry.userData.sharedPrimitive)n.geometry.dispose();});tools.dispose();Object.values(m).forEach(v=>v.dispose());}};
}
function fixtureAncestor(node){while(node&&!node.userData.fixtureId)node=node.parent;return node?.userData.fixtureId;}

test('every guest receives a physically double-sized mattress, lift-up storage, laptop desk and a bed-facing wall TV in every finish',()=>{
  for(const styleId of Object.keys(INTERIOR_COMPOSITIONS)){
    const plan=getInteriorPlan({floor:'first',styleId}),model=furnished({...plan,fixtures:plan.fixtures.filter(f=>rooms.has(f.roomId))},styleId);
    try{
      for(const n of [1,2,3]){
        const bed=byId(plan,`guest${n}-bed`),desk=byId(plan,`guest${n}-desk`),tv=byId(plan,`guest${n}-tv`),room=ringBounds(plan.rooms.find(r=>r.id===bed.roomId).polygon);
        near(bed.mattressWidth,1.40);near(bed.mattressLength,2);assert.equal(bed.sleepingCapacity,2);
        assert.equal(bed.storageAccess,'lift-up');assert.equal(desk.computer,'laptop');assert.equal(tv.wallMounted,true);
        const mattress=model.root.getObjectByName(bed.id+'-mattress'),size=new THREE.Box3().setFromObject(mattress).getSize(new THREE.Vector3());
        assert.ok(mattress,'actual mattress geometry is present');
        near(Math.min(size.x,size.z),1.40,.003);near(Math.max(size.x,size.z),2,.003);
        const bedObject=model.root.children.find(o=>o.userData.fixtureId===bed.id),body=new THREE.Box3().setFromObject(bedObject);
        assert.ok(body.min.x>=room.x0-.003&&body.max.x<=room.x1+.003&&body.min.z>=room.z0-.003&&body.max.z<=room.z1+.003,styleId+' '+bed.id+' extends into its walls');
        if(n===2)assert.ok(body.max.y<.80,styleId+' guest II headboard covers its window');
        const eye=new THREE.Vector3(bed.x+bed.headboard[0]*.72,.95,bed.z+bed.headboard[1]*.72),target=new THREE.Vector3(tv.x,tv.mountHeight,tv.z),direction=target.clone().sub(eye).normalize();
        const ray=new THREE.Raycaster(eye,direction,0,eye.distanceTo(target)+.03),hit=ray.intersectObject(model.root,true)[0];
        assert.equal(fixtureAncestor(hit?.object),tv.id,styleId+' '+tv.id+' is hidden behind furniture or faces away from the pillows');
        const screen=model.root.getObjectByName(tv.id+'-screen'),normal=new THREE.Vector3(0,0,1).transformDirection(screen.matrixWorld),towardBed=eye.clone().sub(target).normalize();
        assert.ok(normal.dot(towardBed)>.94,styleId+' '+tv.id+' needs an articulated bed-facing angle');
      }
    }finally{model.dispose();}
  }
});

test('the office toggles actual computer stations and a real emergency single, while preserving its full-length desk',()=>{
  for(const officeCoworking of [false,true])for(const officeGuestBedOpen of [false,true]){
    const plan=getInteriorPlan({floor:'first',styleId:'warm-minimal',officeCoworking,officeGuestBedOpen}),fixtures=plan.fixtures.filter(f=>f.roomId==='office'),model=furnished({...plan,fixtures},'warm-minimal');
    try{
      const desk=byId(plan,'office-desk'),bed=byId(plan,'office-guest-bed'),chairs=fixtures.filter(f=>f.kind==='chair');
      near(desk.width,.70);near(desk.depth,2.60);assert.equal(desk.workstations,officeCoworking?2:1);assert.equal(chairs.length,desk.workstations);
      const stations=[];model.root.traverse(n=>{if(n.userData.role==='computer-station')stations.push(n);});assert.equal(stations.length,desk.workstations);
      const mattress=model.root.getObjectByName(bed.id+'-mattress');
      if(officeGuestBedOpen){
        assert.ok(mattress);const size=new THREE.Box3().setFromObject(mattress).getSize(new THREE.Vector3());near(size.x,.90,.003);near(size.z,2,.003);assert.equal(bed.sleepingCapacity,1);
      }else assert.equal(mattress,undefined,'closed mode is the sofa, not permanently exposed bedding');
      const clear=walkGeometry(plan);
      const route=[[5.62,4.4],[5.62,3.5],[6.48,3.5],[6.48,.75],[7.33,.75],[7.33,.45]];
      for(let i=1;i<route.length;i++){
        const a=route[i-1],b=route[i],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.025);
        for(let j=0;j<=steps;j++)assert.ok(clear(a[0]+(b[0]-a[0])*j/steps,a[1]+(b[1]-a[1])*j/steps,true,.30),'0.60m hall-to-office-to-balcony route is blocked in a selected mode');
      }
      for(const chair of chairs){const approach=[chair.x+chair.width/2+.35,chair.z];assert.ok(clear(...approach,true,.30),'each coworker can reach their chair');}
      const host={innerHTML:''};drawInteriorPlan(host,plan,{showFurniture:true});assert.match(host.innerHTML,/260 cm desk/);
    }finally{model.dispose();}
  }
});

test('shared office and guest layouts cannot be rearranged into collisions by a finish recipe',()=>{
  const defaults=guestAndOfficeFixtures();
  for(const styleId of Object.keys(INTERIOR_COMPOSITIONS)){
    const plan=getInteriorPlan({floor:'first',styleId});
    for(const fixture of defaults)assert.deepEqual(byId(plan,fixture.id),fixture,styleId+' changed a measured guest/office fit-out');
    assert.equal(plan.furnishingConcept.office,'shared-desk');
    for(const id of ['guest-2','guest-3'])assert.match(plan.rooms.find(r=>r.id===id).fitOutNote,/foot access only/);
  }
});

test('the real walking engine reaches the guest desk and crosses both furnished rooms through the clear part of their upper sliders',()=>{
  const source=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url))),defaults=createStateModel(getSiteProfile(source.site.id,source)).DEFAULTS;
  for(const officeGuestBedOpen of [false,true]){
    const settings={...defaults,designStyle:'warm-minimal',officeCoworking:true,officeGuestBedOpen,balconyOpen:1,canopyEnabled:true,terraceCoverType:'balcony',canopyWidth:10.77},
      data=applyPlanExterior(source,settings),walk=createWalkNavigation(data,settings),floor=walk.plans.first;
    const world=(x,z,y)=>{const p=walk.frame.toSite(x,z,y);return[p[0],p[2],p[1]];};
    const routes=[
      [[8.56,4.4],[8.56,2.75],[8.56,1.22],[8.94,1.22],[8.56,1.22],[8.56,.70],[9.44,.70],[9.44,-.40]],
      [[5.62,4.4],[5.62,3.5],[6.48,3.5],[6.48,.75],[6.80,.75],[6.80,-.40]],
    ];
    for(const route of routes){
      let pose=walk.locate(world(...route[0],floor.elevation+1.57),{maxDistance:.02});assert.ok(pose,'hall route starts at its intended location');
      for(const [x,z]of route.slice(1)){
        const target=world(x,z,0),steps=Math.ceil(Math.hypot(target[0]-pose.position[0],target[2]-pose.position[2])/.025),delta=[(target[0]-pose.position[0])/steps,0,(target[2]-pose.position[2])/steps];
        for(let i=0;i<steps;i++)pose=walk.move(pose.position,delta,{eyeHeight:pose.eyeHeight});
        const local=walk.frame.toLocal(pose.position[0],pose.position[2],pose.position[1]);near(local[0],x,.025);near(local[1],z,.025);
      }
    }
  }
});

test('gym reference dimensions remain real manufacturer sizes rather than scaled decoration',()=>{
  const plan=getInteriorPlan({floor:'basement',styleId:'warm-minimal',garageVariant:'two-car'});
  assert.ok(plan.basementFitOut,'default garage geometry leaves the measured gym');
  for(const [id,key]of [['gym-trainer','trainer'],['gym-bike','bike'],['gym-bench','bench'],['gym-weights','dumbbells']]){
    const fixture=byId(plan,id),reference=GYM_EQUIPMENT_REFERENCES[key],turn=Math.abs(fixture.front[0])>.5;
    assert.ok((turn?fixture.depth:fixture.width)>=reference.width,'width was reduced to squeeze in '+key);
    assert.ok((turn?fixture.width:fixture.depth)>=reference.depth,'length was reduced to squeeze in '+key);
    if(reference.height)assert.ok(fixture.height>=reference.height,'height was reduced to squeeze in '+key);
    assert.match(reference.url,/^https:\/\/(?:www\.)?(?:repfitness|wahoofitness)\.com\//);
  }
  near(GYM_EQUIPMENT_REFERENCES.trainer.height,2.08534);near(GYM_EQUIPMENT_REFERENCES.bike.depth,1.53);
  assert.ok(plan.clearHeight-byId(plan,'gym-trainer').height>=.19);
  assert.ok(plan.issues.some(note=>note.includes('Pull-up extensions')));
});
