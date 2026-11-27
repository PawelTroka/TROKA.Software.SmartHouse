import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {getInteriorPlan} from '../src/interior-plan.js';
import {getHouseFloorPlan} from '../src/house-model.js';
import {getDesignStyle} from '../src/design-styles.js';
import {getInteriorStyleRecipe} from '../src/interior-style-recipes.js';
import {buildArchitecture,updateHstOpening,roofClearance} from '../src/interior-architecture.js';
import {modelTools,ringBounds} from '../src/interior-geometry.js';
import {hstPanelLayout,balconyPanelLayout,slidingPanelLayout} from '../src/hst-system.js';
import {stairLandingGuards} from '../src/stair-guards.js';

const near=(a,b,tol=1e-5)=>assert.ok(Math.abs(a-b)<tol,`${a} differs from ${b}`);
function build(plan,styleId='warm-minimal',state={}){
  const m=new Proxy({}, {get(target,key){return target[key]??=new THREE.MeshStandardMaterial({name:String(key),side:THREE.DoubleSide});}});
  const tools=modelTools(),a=buildArchitecture(plan,state,tools,{m,architecturalFloor:m.floor,style:getDesignStyle(styleId),interiorRecipe:getInteriorStyleRecipe(styleId)});
  a.updateVisibility('building',{x:0,z:0});a.root.updateMatrixWorld(true);
  return {a,m,dispose(){a.dispose();tools.dispose();Object.values(m).forEach(material=>material.dispose());}};
}
const visibleRay=(root,position,direction,far=1)=>new THREE.Raycaster(new THREE.Vector3(...position),new THREE.Vector3(...direction),0,far).intersectObject(root,true)
  .filter(hit=>{for(let node=hit.object;node;node=node.parent)if(!node.visible)return false;return true;});
const empty=(plan,extra={})=>({...plan,rooms:[],fixtures:[],outdoor:[],...extra});

test('exposed landing edges have actual guard geometry while each connecting stair mouth stays open',()=>{
  for(const floor of ['ground','first','attic']){
    const plan=empty(getHouseFloorPlan({floor,settings:{designStyle:'warm-minimal'}}),{cores:[]});
    const {a,m,dispose}=build(plan),y=plan.elevation;
    try{
      assert.ok(a.root.userData.stairLandingGuards.length,floor+' has no landing protection');
      if(floor==='first'){
        // Formerly entirely bare slab edge behind the main stair.
        for(const x of [6.15,6.45,6.75]){
          const hit=visibleRay(a.groups.base,[x,y+1.075,8.77],[0,0,-1],.3)[0];
          assert.ok(hit&&hit.object.material===m.oak,'first-floor rear void edge is still unguarded');near(hit.point.z,8.625,.003);
        }
        assert.ok(visibleRay(a.groups.base,[5.66,y+1.075,6.23],[1,0,0],.3).length,'open west landing edge under the high attic flight has no guard');
      }
      if(floor==='attic'){
        for(const [origin,direction] of [[[4.98,y+1.075,6.8],[1,0,0]],[[6.32,y+1.075,7.5],[-1,0,0]],[[5.65,y+1.075,8.72],[0,0,-1]]]){
          assert.ok(visibleRay(a.groups.base,origin,direction,.3).length,'attic opening has an exposed rim');
        }
      }
      const mouth=floor==='attic'?{x:5.65,z:5.95}:{x:6.44,z:6};
      assert.equal(visibleRay(a.groups.base,[mouth.x,y+.60,mouth.z-.10],[0,0,1],.20).length,0,floor+' arrival was bridged by a rail');
      if(floor==='ground')assert.equal(visibleRay(a.groups.base,[6.44,.60,8.72],[0,0,-1],.22).length,0,'main stair entry was bridged by a rail');
    }finally{dispose();}
  }
  assert.deepEqual(stairLandingGuards(getInteriorPlan({floor:'first',layout:'existing'})),[],'the historical drawing must not gain proposed guards');
});

test('both open sides of the renovated main flight have continuous physical handrails',()=>{
  const original=getHouseFloorPlan({settings:{designStyle:'warm-minimal'}}),flight=original.stairs.find(s=>s.id==='main-stair');
  const plan=empty(original,{walls:[],cores:[],voids:[],stairs:[flight]}),{a,m,dispose}=build(plan);
  try{
    const b=ringBounds(flight.polygon),railHeight=1.05+(flight.steps+1)*flight.rise/flight.steps/2;
    for(const [x,direction] of [[b.x0-.25,[1,0,0]],[b.x1+.25,[-1,0,0]]]){
      const hit=visibleRay(a.groups.stairs,[x,railHeight,b.z],direction,.4)[0];
      assert.ok(hit&&hit.object.material===m.oak,'a stair flight side is missing its timber handrail');
    }
  }finally{dispose();}
});

test('renovated chimney faces use the chosen finish on every floor while their surveyed brick cores remain intact',()=>{
  for(const styleId of ['warm-minimal','hidden-bali','industrial-loft'])for(const floor of ['basement','ground','first','attic']){
    const original=getInteriorPlan({floor,styleId}),core=original.cores.find(c=>c.id==='east-flue'),b=ringBounds(core.polygon);
    const plan=empty(original,{walls:[],stairs:[],voids:[],cores:[core]}),{a,m,dispose}=build(plan,styleId);
    const height=roofClearance(plan,b.z);
    try{
      assert.equal(a.root.userData.integratedFlues,true);
      for(const level of [.24,height*.5,height-.12])for(const [position,direction] of [
        [[b.x0-.3,plan.elevation+level,b.z],[1,0,0]],[[b.x1+.3,plan.elevation+level,b.z],[-1,0,0]],
        [[b.x,plan.elevation+level,b.z0-.3],[0,0,1]],[[b.x,plan.elevation+level,b.z1+.3],[0,0,-1]],
      ]){
        const hits=visibleRay(a.groups.sides.get('partition').full,position,direction,2);
        assert.ok(hits.length&&hits[0].object.material===m.wall,`${styleId}/${floor}: exposed masonry on a chimney face`);
        assert.ok(hits.some(hit=>hit.object.material===m.brick),`${styleId}/${floor}: the structural core was deleted`);
      }
      assert.deepEqual(core.polygon,getInteriorPlan({floor,layout:'existing'}).cores.find(c=>c.id===core.id).polygon,'renovation moved the retained flue');
    }finally{dispose();}
  }
  const historical=getInteriorPlan({floor:'first',layout:'existing'}),core=historical.cores[1],b=ringBounds(core.polygon);
  const {a,m,dispose}=build(empty(historical,{walls:[],stairs:[],voids:[],cores:[core]}),'current');
  try{assert.equal(a.root.userData.integratedFlues,false);assert.equal(visibleRay(a.root,[b.x,4,b.z0-.3],[0,0,1],1)[0].object.material,m.brick);}
  finally{dispose();}
});

test('terrace and upper sliders share a three-leaf mechanism with independent fractions and a two-thirds-open default',()=>{
  for(const type of ['hst','balcony-door']){
    const opening={type,offset:.25,width:2.1},layout=slidingPanelLayout(opening),control=type==='hst'?'hstOpen':'balconyOpen';
    assert.equal(layout.control,control);assert.equal(layout.panels.length,3);assert.equal(layout.open,1);
    near(layout.clear.width,(opening.width-2*layout.frameWidth)*2/3);
    const closed=slidingPanelLayout(opening,{[control]:0});near(closed.clear.width,0);
    for(let i=0;i<2;i++)near(closed.panels[i].hi,closed.panels[i+1].lo);
    const opposite=control==='hstOpen'?'balconyOpen':'hstOpen';
    assert.equal(slidingPanelLayout(opening,{[opposite]:0}).open,1,'one floor changed the other floor control');
  }
  assert.equal(balconyPanelLayout({offset:0,width:1.2},{balconyOpen:.4}).open,.4);
  assert.equal(hstPanelLayout({offset:0,width:9.97},{hstOpen:.6}).open,.6);
});

test('upper sliding glass actually closes the aperture, reopens into its side stack and preserves its buffers',()=>{
  const original=getHouseFloorPlan({floor:'first',settings:{designStyle:'warm-minimal'}});
  const walls=original.walls.filter(w=>w.openings.some(o=>o.type==='balcony-door'));
  const plan=empty(original,{walls,stairs:[],voids:[],cores:[]}),{a,dispose}=build(plan),leaves=[],buffers=[],doors=a.groups.sides.get('rear').full;
  doors.traverse(node=>{if(node.userData.hstLeaf)leaves.push(node);if(node.geometry)buffers.push([node.geometry,node.geometry.attributes.position.array.slice()]);});
  try{
    assert.equal(leaves.length,9);assert.ok(leaves.every(node=>node.userData.hstLeaf.control==='balconyOpen'));
    const fixed=leaves.filter(node=>node.userData.hstLeaf.index===0).map(node=>[node,node.position.clone()]);
    assert.equal(updateHstOpening(doors,{balconyOpen:0}),6);a.root.updateMatrixWorld(true);
    for(const wall of walls)for(const opening of wall.openings.filter(o=>o.type==='balcony-door')){
      for(const t of [.08,.25,.43,.62,.82,.94]){
        const x=wall.a[0]+opening.offset+opening.width*t;
        assert.ok(visibleRay(a.root,[x,plan.elevation+1,wall.a[1]+.4],[0,0,-1],.8).length,'closed upper glass leaves a walk-through hole');
      }
    }
    assert.equal(updateHstOpening(doors,{hstOpen:0}),0,'ground-only updates reset the upper doors');
    assert.equal(updateHstOpening(doors,{balconyOpen:1}),6);a.root.updateMatrixWorld(true);
    for(const wall of walls)for(const opening of wall.openings.filter(o=>o.type==='balcony-door')){
      const system=balconyPanelLayout(opening),x=wall.a[0]+(system.clear.lo+system.clear.hi)/2;
      assert.equal(visibleRay(a.root,[x,plan.elevation+1,wall.a[1]+.4],[0,0,-1],.8).length,0,'open upper door retains glass across the clear passage');
    }
    for(const [node,position] of fixed)assert.ok(node.position.distanceTo(position)<1e-10);
    for(const [geometry,positions] of buffers)assert.deepEqual(geometry.attributes.position.array,positions,'door movement rebuilt its geometry');
  }finally{dispose();}
});
