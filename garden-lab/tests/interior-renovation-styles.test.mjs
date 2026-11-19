import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from '../vendor/three.module.js';
import {DESIGN_STYLES,getDesignStyle} from '../src/design-styles.js';
import {INTERIOR_RENOVATION_RECIPES,getInteriorStyleRecipe} from '../src/interior-style-recipes.js';
import {furnishInterior} from '../src/interior-furniture.js';
import {buildArchitecture,interiorWallFeatures} from '../src/interior-architecture.js';
import {getInteriorPlan} from '../src/interior-plan.js';
import {modelTools,wallPanels} from '../src/interior-geometry.js';

// Every material is intentionally the SAME colour. Geometry assertions below
// therefore cannot pass merely because the style palette has changed.
function finishes(id){
  const keys='wall ceiling cut trim wood oak boards tiles stone slate frame dark blackGlass steel bronze cabinet fabric accent linen duvet rug ceramic water glass leaf leafLight pot paper art glow addition removed concrete brick plinth brickFloor earth cane lacquer spaWater spaGlow bubbles floor';
  const m=Object.fromEntries(keys.split(' ').map(key=>[key,new THREE.MeshStandardMaterial({color:'#808080'})]));
  return {m,style:getDesignStyle(id),interiorRecipe:getInteriorStyleRecipe(id),architecturalFloor:m.boards,dispose(){Object.values(m).forEach(v=>v.dispose());}};
}
function fixture(kind,width,depth,extra={}){return {id:kind,kind,x:0,z:0,width,depth,...extra};}
function furniture(id,fixtures){const root=new THREE.Group(),tools=modelTools(),f=finishes(id);furnishInterior(root,{fixtures},tools,f);root.updateMatrixWorld(true);return {root,dispose(){root.traverse(n=>{if(n.geometry&&!n.geometry.userData.sharedPrimitive)n.geometry.dispose();});tools.dispose();f.dispose();}};}
function shapeDigest(root){const hash=createHash('sha256');root.traverse(n=>{if(!n.isMesh)return;hash.update(Buffer.from(n.geometry.attributes.position.array.buffer));hash.update(Buffer.from(new Float64Array(n.matrixWorld.elements).buffer));});return hash.digest('hex');}

test('all 20 renovation choices have physical recipes and geometry independent of colour',()=>{
  assert.deepEqual(INTERIOR_RENOVATION_RECIPES.map(r=>r.id),DESIGN_STYLES.map(r=>r.id));
  assert.deepEqual(getInteriorStyleRecipe('current').features,[]);
  const shapes=new Map();
  for(const style of DESIGN_STYLES.filter(s=>s.id!=='current')){
    const recipe=getInteriorStyleRecipe(style.id);assert.equal(recipe.features.length,3);
    const f=furniture(style.id,[fixture('sofa',2.20,.88),fixture('bed',1.8,2.1,{x:4,headboard:[0,-1]}),fixture('diningTable',2.4,1.04,{x:8}),fixture('kitchen',2.1,.60,{x:12,front:[0,1]}),fixture('wardrobe',1.4,.60,{x:16,front:[0,1]})]);
    const digest=shapeDigest(f.root);assert.ok(!shapes.has(digest),`${style.id} duplicated geometry of ${shapes.get(digest)}`);shapes.set(digest,style.id);f.dispose();
  }
  assert.equal(shapes.size,20);
});

test('style furniture and explicit orientations retain the measured world footprints',()=>{
  for(const style of ['hidden-bali','japandi','space-age','mediterranean-villa','industrial-loft','riviera-deco'])for(const f of [
    fixture('bed',2.1,.9,{headboard:[1,0],headboardMaxHeight:.72}),fixture('wardrobe',.55,2.20,{front:[-1,0]}),
    fixture('desk',.64,1.25,{front:[1,0]}),fixture('chair',.48,.48,{front:[0,-1]}),fixture('sofa',3.0,2.8,{shape:'U',front:[1,0]}),
    fixture('basin',.56,1.50,{front:[1,0],basins:2}),fixture('wc',.46,.68,{front:[0,-1]}),fixture('bidet',.42,.66,{front:[0,-1]}),
    fixture('hotTub',2.05,1.80,{front:[0,1],height:.86,jets:true,lights:true,hydromassage:true}),
  ]){
    const result=furniture(style,[f]),box=new THREE.Box3().setFromObject(result.root),epsilon=.065;
    assert.ok(box.min.x>=-f.width/2-epsilon&&box.max.x<=f.width/2+epsilon,`${style} ${f.kind} width ${box.min.x}..${box.max.x}`);
    assert.ok(box.min.z>=-f.depth/2-epsilon&&box.max.z<=f.depth/2+epsilon,`${style} ${f.kind} depth ${box.min.z}..${box.max.z}`);
    if(f.headboardMaxHeight)assert.ok(box.max.y<=f.headboardMaxHeight+.01,`${style} headboard blocks window: ${box.max.y}`);
    result.dispose();
  }
});

test('ground vanity has two actual basin bowls and north-wall shower plumbing respects a west entrance',()=>{
  const basin=furniture('hidden-bali',[fixture('basin',.56,1.50,{front:[1,0],basins:2})]);let bowls=0;basin.root.traverse(n=>{if(n.geometry?.type==='LatheGeometry')bowls++;});assert.equal(bowls,2);basin.dispose();
  const shower=furniture('japandi',[fixture('shower',1.30,1.36,{front:[-1,0],headWall:[0,-1],heads:1})]);
  const high=[];shower.root.traverse(n=>{if(!n.isMesh)return;const p=new THREE.Vector3();n.getWorldPosition(p);if(p.y>1.8)high.push(p);});
  assert.ok(high.length>=2);assert.ok(high.every(p=>p.z<-.20),'Rain head/arm must stay on the north side instead of crossing the side window');shower.dispose();
});

test('room feature panels are confined to solid wall segments and never cover apertures',()=>{
  for(const floor of ['ground','first']){
    const plan=getInteriorPlan({floor,layout:'renovation'}),features=interiorWallFeatures(plan);assert.ok(features.size>=3);
    for(const [id,items]of features){const wall=plan.walls.find(w=>w.id===id),solid=wallPanels(wall,wall.height??plan.clearHeight);for(const f of items)assert.ok(solid.some(p=>p.bottom===0&&p.left<=f.left&&p.right>=f.right&&p.top>=f.height),`${floor} ${f.roomId} crosses an opening`);}
  }
});

test('whole-building view exposes full walls and ceilings with shared exterior skin and no duplicated access',()=>{
  const plan=getInteriorPlan({floor:'ground',layout:'renovation'}),tools=modelTools(),f=finishes('hidden-bali'),outside=new THREE.MeshStandardMaterial({color:'#bbbbbb'});f.exteriorWall=outside;
  const model=buildArchitecture(plan,{showOutdoor:false,showExterior:false},tools,f);model.updateVisibility('building',{x:0,z:0});
  assert.equal(model.groups.ceiling.visible,true);for(const pair of model.groups.sides.values()){assert.equal(pair.full.visible,true);assert.equal(pair.cut.visible,false);}
  let skin=0;model.root.traverse(n=>{if(n.material===outside)skin++;});assert.ok(skin>0);
  const box=new THREE.Box3().setFromObject(model.groups.base);assert.ok(box.min.y<=-(plan.slabThickness??.30)+.01);
  model.dispose();tools.dispose();f.dispose();outside.dispose();
});
