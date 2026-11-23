import test from 'node:test';
import assert from 'node:assert/strict';
import {getInteriorPlan} from '../src/interior-plan.js';
import {getHouseFloorPlan} from '../src/house-model.js';
import {DESIGN_STYLES} from '../src/design-styles.js';
import {INTERIOR_COMPOSITIONS} from '../src/interior-curation.js';
import {getInteriorStyleRecipe} from '../src/interior-style-recipes.js';
import {walkGeometry,roomPose} from '../src/interior-navigation.js';
import {createInteriorTaskLights} from '../src/interior-lighting.js';

test('each renovation has a distinct shared furnishing plan without moving architecture',()=>{
  const base=getInteriorPlan(),signatures=new Set();
  assert.deepEqual(Object.keys(INTERIOR_COMPOSITIONS),DESIGN_STYLES.filter(s=>s.id!=='current').map(s=>s.id));
  for(const styleId of Object.keys(INTERIOR_COMPOSITIONS)){
    const plan=getInteriorPlan({styleId}),shared=getHouseFloorPlan({settings:{designStyle:styleId}});
    assert.deepEqual(plan.fixtures,shared.fixtures,styleId+' must share interior/exterior furniture');
    for(const key of ['walls','rooms','stairs','cores','voids'])assert.deepEqual(plan[key],base[key],styleId+' moved '+key);
    assert.deepEqual(plan.fixtures.filter(f=>f.roomId==='bathroom'),base.fixtures.filter(f=>f.roomId==='bathroom'));
    assert.equal(plan.fixtures.find(f=>f.id==='sofa').shape,undefined,'new compositions replace the universal U sofa');
    signatures.add(JSON.stringify(plan.fixtures.filter(f=>['sofa','armchair','diningTable','ottoman'].includes(f.kind))));
    const blocking=plan.fixtures.filter(f=>!f.nonBlocking&&!f.hostId&&!f.wallMounted);
    assert.ok(blocking.filter(f=>['lounge','dining'].includes(f.roomId)).every(f=>f.z-f.depth/2-(f.kind==='diningTable'?.50:0)>=1.35-1e-8),styleId+' obstructs the 1 m glazing strip');
  }
  assert.equal(signatures.size,22);
  assert.deepEqual(getInteriorPlan({styleId:'current'}),base);
  assert.deepEqual(getInteriorPlan({styleId:'unknown'}),base);
  assert.deepEqual(getInteriorPlan({styleId:'beach-house',layout:'existing'}),getInteriorPlan({layout:'existing'}));
});

test('Beach House has its own furniture, joinery and lighting language',()=>{
  const beach=getInteriorStyleRecipe('beach-house');
  for(const id of ['coastal','baltic-dune'])for(const key of ['seating','chair','table','bed','wall','ceiling','pendant'])assert.notEqual(beach[key],getInteriorStyleRecipe(id)[key],id+' '+key);
  const plan=getInteriorPlan({styleId:'beach-house'});
  assert.ok(plan.fixtures.some(f=>f.id==='lounge-chaise'));
  assert.ok(plan.fixtures.some(f=>f.kind==='floorLamp'&&f.lamp==='rope'));
});

test('rugs and table-top accessories do not block walking or become the room focus',()=>{
  for(const styleId of ['beach-house','hidden-bali','modern-minimal','japandi']){
    const plan=getInteriorPlan({styleId}),clear=walkGeometry(plan),room=plan.rooms.find(r=>r.id==='lounge');
    const withoutDecor={...plan,fixtures:plan.fixtures.filter(f=>!f.nonBlocking&&!f.hostId&&!f.wallMounted)};
    assert.deepEqual(roomPose(plan,room,clear),roomPose(withoutDecor,room,walkGeometry(withoutDecor)));
    const rug=plan.fixtures.find(f=>f.kind==='rug');
    assert.equal(clear(rug.x,rug.z),walkGeometry(withoutDecor)(rug.x,rug.z));
  }
});

test('interior task lights have a fixed budget, bounded reach and obey the night strength',()=>{
  const plan=getInteriorPlan({styleId:'beach-house'}),lights=createInteriorTaskLights(plan.interiorLights,'#ffdeb1',{limit:8});
  assert.equal(lights.count,3);assert.ok(lights.root.children.every(l=>l.distance<=3.2&&!l.castShadow));
  lights.update(0);assert.equal(lights.root.visible,false);assert.ok(lights.root.children.every(l=>l.intensity===0));
  lights.update(.5);assert.equal(lights.root.visible,true);assert.ok(lights.root.children.every(l=>l.intensity===l.userData.taskIntensity*.5));
  lights.update(Infinity);assert.ok(lights.root.children.every(l=>l.intensity===0));lights.dispose();
});
