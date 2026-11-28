import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {luxuryKitchenFixtures,luxuryKitchenSummary,KITCHEN_APPLIANCE_REFERENCES} from '../src/luxury-kitchen.js';
import {getInteriorPlan} from '../src/interior-plan.js';
import {getHouseFloorPlan} from '../src/house-model.js';
import {getDesignStyle} from '../src/design-styles.js';
import {getInteriorStyleRecipe} from '../src/interior-style-recipes.js';
import {furnishInterior} from '../src/interior-furniture.js';
import {batchGroup,modelTools} from '../src/interior-geometry.js';

const near=(a,b,tol=1e-5)=>assert.ok(Math.abs(a-b)<tol,`${a} differs from ${b}`);
function renderKitchen(styleId='warm-minimal',options={}){
  const plan=getInteriorPlan({styleId,...options}),fixtures=plan.fixtures.filter(f=>f.roomId==='front-kitchen'||f.heroMirror);
  const roles='wood oak frame steel bronze stone ceramic cabinet painted trim fabric linen duvet accent lacquer glow blackGlass dark paper glass'.split(' ');
  const m=Object.fromEntries(roles.map(key=>[key,new THREE.MeshStandardMaterial()])),root=new THREE.Group(),tools=modelTools();
  furnishInterior(root,{...plan,fixtures},tools,{m,style:getDesignStyle(styleId),interiorRecipe:getInteriorStyleRecipe(styleId)});
  root.updateMatrixWorld(true);
  return {root,plan,fixtures,object:id=>root.children.find(n=>n.userData.fixtureId===id),dispose(){
    root.traverse(n=>{if(n.geometry&&!n.geometry.userData.sharedPrimitive)n.geometry.dispose();if(n.material?.userData.ownedHeroMirrorFallback)n.material.dispose();});
    tools.dispose();Object.values(m).forEach(material=>material.dispose());
  }};
}
const hit=(object,point,direction)=>new THREE.Raycaster(new THREE.Vector3(...point),new THREE.Vector3(...direction),0,10).intersectObject(object,true)[0];
const clearSpan=(object,point,axis)=>{
  const direction=[0,0,0];direction[axis]=1;
  const a=hit(object,point,direction),b=hit(object,point,direction.map(v=>-v));
  assert.ok(a&&b,'aperture has two actual enclosing surfaces');return a.point.getComponent(axis)-b.point.getComponent(axis);
};

test('two real 600 mm dishwasher niches fit the wet run without narrowing its 1010 mm sink base',()=>{
  const summary=luxuryKitchenSummary(),modules=summary.modules.filter(m=>m.run==='sink');
  near(modules.reduce((sum,m)=>sum+m.width,0),2.25);
  const model=renderKitchen();
  try{
    const host=model.object('west-counter');
    for(const z of [6.07,7.68]){
      near(clearSpan(host,[.75,.50,z],2),.600);
      assert.ok(hit(host,[1.40,.50,z],[-1,0,0]).point.x<.40,'an appliance niche is obstructed by a drawer front');
      const top=hit(host,[.75,.50,z],[0,1,0]);near(top.point.y,.881,2e-4);
      assert.ok(top.point.y>=KITCHEN_APPLIANCE_REFERENCES.dishwasher.height);
    }
    near(clearSpan(host,[.75,.50,6.875],2),1.010-.036);
    const a=model.fixtures.find(f=>f.id==='kitchen-dishwasher-1'),fridge=model.fixtures.find(f=>f.id==='kitchen-fridge');
    const installedFront=a.x+a.width/2,openEnd=installedFront+a.operatingDepth-a.productDimensions.depth;
    const aisle=fridge.x-fridge.width/2-openEnd;
    near(aisle,summary.clearances.openDishwasherAisle);assert.ok(aisle>1.95,'open dishwasher leaves a usable working aisle');
  }finally{model.dispose();}
  const slim=renderKitchen('warm-minimal',{secondaryDishwasherWidth:.45});
  try{near(clearSpan(slim.object('west-counter'),[.75,.50,7.605],2),.450);near(luxuryKitchenSummary({secondaryDishwasherWidth:.45}).modules.filter(m=>m.run==='sink').reduce((sum,m)=>sum+m.width,0),2.25);}
  finally{slim.dispose();}
});

test('the appliance tower has correct clear openings and the four-door fridge stays inside its reserved bay',()=>{
  const model=renderKitchen('scandinavian');
  try{
    const tower=model.object('east-counter');
    near(clearSpan(tower,[4.0,.90,7.24],2),.564);
    near(clearSpan(tower,[4.0,.90,7.24],1),.5925);
    near(clearSpan(tower,[4.0,1.40,7.24],1),.451);
    for(const [id,y] of [['kitchen-steam-oven',.85],['kitchen-speed-oven',1.43]]){
      const appliance=model.object(id),first=hit(appliance,[3.2,y,7.24],[1,0,0]);
      assert.ok(first&&first.point.x<3.80,'a visible oven is hidden behind the pantry front');
    }
    const fridge=model.fixtures.find(f=>f.id==='kitchen-fridge'),bounds=new THREE.Box3().setFromObject(model.object(fridge.id));
    near(bounds.max.z-bounds.min.z,.905,2e-4);near(bounds.max.y,1.830,2e-4);
    assert.ok(bounds.max.x<=fridge.x+fridge.width/2,'fridge body uses its rear allowance without entering the wall');
    assert.ok(bounds.min.z>=fridge.z-fridge.depth/2&&bounds.max.z<=fridge.z+fridge.depth/2);
    near((.560*(.090-4*.003))*1e4,luxuryKitchenSummary().clearances.wineVentFreeAreaCm2);
    assert.ok(luxuryKitchenSummary().clearances.wineVentFreeAreaCm2>=KITCHEN_APPLIANCE_REFERENCES.wineCooler.minimumVentAreaCm2);
  }finally{model.dispose();}
});

test('both workstation bowls are recessed through the matching cut-out without cutting cabinet sides',()=>{
  const model=renderKitchen('hidden-bali');
  try{
    const sink=model.fixtures.find(f=>f.id==='kitchen-sink'),host=model.object('west-counter'),body=model.object(sink.id);
    const innerWidth=sink.bowlWidths[0]+sink.bowlWidths[1]+.014;
    const centres=[-innerWidth/2+sink.bowlWidths[0]/2,innerWidth/2-sink.bowlWidths[1]/2];
    for(const x of centres){
      const point=[sink.x,2,sink.z-x],counterHit=hit(host,point,[0,-1,0]),bowlHit=hit(body,point,[0,-1,0]);
      assert.ok(!counterHit||counterHit.point.y<.20,'solid worktop or carcass fills a bowl');
      assert.ok(bowlHit&&bowlHit.point.y>.70&&bowlHit.point.y<.76,'bowl bottom is not 200 mm below the rim');
    }
    const baseCenter=6.875,clearHalf=(1.010-.036)/2;
    assert.ok(sink.z+sink.worktopOpening.width/2<baseCenter+clearHalf);
    assert.ok(sink.z-sink.worktopOpening.width/2>baseCenter-clearHalf);
    const window=model.plan.walls.find(w=>w.id==='left-facade').openings.find(o=>o.roomId==='front-kitchen');
    near(window.width,2.30);assert.ok(!model.fixtures.some(f=>['kitchen-sink-header','kitchen-corner-storage','kitchen-sink-side-storage'].includes(f.id)));
  }finally{model.dispose();}
});

test('all hidden kitchen assignments are labelled and the mirror faces the hall after architecture batching',()=>{
  const fixtures=luxuryKitchenFixtures(),labels=fixtures.filter(f=>f.equipmentLabel);
  for(const id of ['kitchen-dishwasher-1','kitchen-dishwasher-2','kitchen-nutrition-pantry','kitchen-cutlery-drawers','kitchen-corner-pullout','kitchen-spice-pullout']){
    assert.ok(labels.some(f=>f.id===id),'missing concealed equipment label: '+id);
  }
  const model=renderKitchen();
  try{
    const mirror=model.root.getObjectByName('kitchen-hall-selfie-mirror-surface');assert.ok(mirror?.isMesh);
    const direction=mirror.getWorldDirection(new THREE.Vector3());near(direction.x,1);near(direction.y,0);near(direction.z,0);
    const bounds=new THREE.Box3().setFromObject(mirror);
    assert.ok(bounds.min.x>4.59&&bounds.max.x<4.65,'the mirror is on the hall face, not inside the kitchen wall');
    assert.ok(bounds.min.z>5.93&&bounds.max.z<8.65,'the mirror avoids the flue and entrance');
    near(bounds.max.z-bounds.min.z,2.538);near(bounds.max.y-bounds.min.y,2.328);
    batchGroup(model.root);model.root.updateMatrixWorld(true);
    assert.equal(model.root.getObjectByName(mirror.name),mirror,'reflection surface survives static batching');
    near(mirror.getWorldDirection(new THREE.Vector3()).x,1);
  }finally{model.dispose();}
  const current=getHouseFloorPlan({settings:{designStyle:'current'}});
  assert.ok(!current.fixtures.some(f=>f.heroMirror||f.kind==='dishwasher'),'Current comparison retains the archived fittings');
});
