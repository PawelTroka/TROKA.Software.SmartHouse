import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {getInteriorPlan} from '../src/interior-plan.js';
import {getDesignStyle} from '../src/design-styles.js';
import {getInteriorStyleRecipe} from '../src/interior-style-recipes.js';
import {INTERIOR_COMPOSITIONS} from '../src/interior-curation.js';
import {buildArchitecture} from '../src/interior-architecture.js';
import {modelTools} from '../src/interior-geometry.js';
import {walkGeometry} from '../src/interior-navigation.js';
import {drawInteriorPlan} from '../src/interior-plan-view.js';

function architecture(styleId){
  const original=getInteriorPlan({styleId}),plan={...original,rooms:[],fixtures:[],stairs:[],voids:[],outdoor:[],
    walls:original.walls.filter(w=>w.id==='stair-west'),cores:original.cores.filter(c=>c.id==='west-flue')};
  const m=new Proxy({}, {get(target,key){return target[key]??=new THREE.MeshStandardMaterial({name:String(key)});}});
  const tools=modelTools(),a=buildArchitecture(plan,{},tools,{m,architecturalFloor:m.floor,style:getDesignStyle(styleId),interiorRecipe:getInteriorStyleRecipe(styleId)});
  a.updateVisibility('building',{x:2,z:4});a.root.updateMatrixWorld(true);
  return {a,plan,m,dispose(){a.dispose();tools.dispose();Object.values(m).forEach(material=>material.dispose());}};
}
function ray(root,position,direction,far=10){
  return new THREE.Raycaster(new THREE.Vector3(...position),new THREE.Vector3(...direction),0,far).intersectObject(root,true)
    .filter(hit=>{for(let node=hit.object;node;node=node.parent)if(!node.visible)return false;return true;});
}

test('matching cabinet faces conceal the intact flue from the kitchen and living room in every renovation',()=>{
  for(const styleId of Object.keys(INTERIOR_COMPOSITIONS)){
    const {a,plan,m,dispose}=architecture(styleId),core=plan.cores[0];
    assert.deepEqual(core.polygon,[[4.18,4.91],[4.57,4.91],[4.57,5.85],[4.18,5.85]],styleId+' moved the retained masonry');
    for(const height of [.25,1.57,2.60]){
      const kitchen=ray(a.root,[3,height,5.39],[1,0,0],2),living=ray(a.root,[4.35,height,4],[0,0,1],2);
      assert.ok(kitchen.length&&living.length,styleId+' has a missing enclosure face');
      assert.ok(kitchen[0].point.x<3.80,styleId+' enclosure does not continue the refrigerator face');
      assert.ok(living[0].point.z<4.91,styleId+' masonry is exposed toward living');
      assert.notEqual(kitchen[0].object.material,m.brick);assert.notEqual(living[0].object.material,m.brick);
      assert.ok(kitchen.some(hit=>hit.object.material===m.brick),styleId+' deleted the underlying flue');
    }
    // Physical navigation includes the enclosure's service space and still
    // leaves a generous, usable entrance beside the shortened free end.
    const clear=walkGeometry(getInteriorPlan({styleId}));
    assert.equal(clear(3.95,5.40,false),false,styleId+' ignores the service enclosure in physical navigation');
    assert.equal(clear(3.15,5.325,true,.30),true,styleId+' blocks the widened entrance for a 0.60 m body');
    dispose();
  }
});

test('the stair-side screen is open at eye height, has spaced timber infill and leaves stair entry unbridged',()=>{
  const {a,plan,m,dispose}=architecture('warm-minimal'),guard=plan.walls[0];
  assert.equal(guard.form,'timber-screen');assert.equal(guard.height,1.10);
  assert.equal(guard.openings[0].width,1.13);
  let slatHits=0;
  for(let i=0;i<60;i++){
    const z=6.08+i*1.44/59;
    assert.equal(ray(a.root,[5.20,1.57,z],[1,0,0],1).length,0,'opaque surface remains above the low screen');
    const rail=ray(a.root,[5.20,1.075,z],[1,0,0],1);
    assert.ok(rail.length&&rail[0].object.material===m.oak,'handrail is not continuous');
    if(ray(a.root,[5.20,.55,z],[1,0,0],1).length)slatHits++;
  }
  assert.ok(slatHits>10&&slatHits<32,`expected see-through vertical infill, got ${slatHits}/60 blocked rays`);
  for(const height of [.55,1.075,1.57])assert.equal(ray(a.root,[5.20,height,8.15],[1,0,0],1).length,0,'screen bridges the stair entrance');
  const original=getInteriorPlan({layout:'existing'});
  assert.equal(original.walls.find(w=>w.id==='stair-west').height,2.75);
  assert.ok(original.cores.every(c=>!c.enclosure),'original drawing gained proposed cladding');
  dispose();
});

test('plan view shows the connected worktop, cabinet enclosure and open timber guard from shared geometry',()=>{
  const plan=getInteriorPlan({styleId:'warm-minimal'}),host={innerHTML:''};
  drawInteriorPlan(host,plan,{roomId:'front-kitchen',showFurniture:true});
  assert.match(host.innerHTML,/Retained flue behind matching removable cabinet panels/);
  assert.match(host.innerHTML,/Open timber stair guard/);
  assert.match(host.innerHTML,/Connected peninsula with wine cooler and assigned drawers/);
});
