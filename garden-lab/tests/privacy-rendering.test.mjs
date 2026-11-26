import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {privacyStructures,canopySupportBounds,canopyIntersection,floorElevation,gardenGroundAt} from '../src/geometry.js';
import {createPrivacyStructureGroup} from '../src/scene-privacy-structures.js';
import {privacyPlanMarkup,privacySectionCuts,privacySectionMarkup} from '../src/diagrams.js';
import {prepareSunGeometry,firstSunBlocker} from '../src/shade.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const materials=Object.fromEntries(['wood','metal','linen','hedge'].map(name=>[name,new THREE.MeshBasicMaterial()]));
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-5,`${actual} differs from ${expected}`);
const settings={gardenProgram:'spa-pool-grove',gardenRaise:.5,floorHeight:1.2,terraceDepth:4.2,
  privacyPergolaEnabled:true,privacyPergolaX:10.5,privacyPergolaY:23.5,
  privacyPergolaWidth:5,privacyPergolaDepth:2,privacyPergolaHeight:4.5,
  spaScreensEnabled:true,spaScreenHeight:2.2,spaScreenWidth:3,spaScreenGap:.25,spaScreenReturn:1.5};

test('privacy rendering preserves every ray-model member extent and foliage choice',()=>{
  for(const foliage of [false,true]){
    const structures=privacyStructures({...settings,privacyPergolaFoliage:foliage},data);
    assert.ok(structures.boxes.length>0);
    const group=createPrivacyStructureGroup(structures,materials);
    assert.equal(group.children.length,structures.boxes.length);
    assert.equal(group.children.some(m=>m.userData.privacyStructure.part==='foliage'),foliage);
    for(const primitive of structures.boxes){
      const mesh=group.getObjectByName(`privacy-${primitive.id}`);
      assert.ok(mesh,`Missing rendered ${primitive.id}`);
      const bounds=new THREE.Box3().setFromObject(mesh);
      near(bounds.min.x,primitive.x0);near(bounds.max.x,primitive.x1);
      near(bounds.min.y,primitive.z0);near(bounds.max.y,primitive.z1);
      near(bounds.min.z,primitive.y0);near(bounds.max.z,primitive.y1);
      assert.equal(mesh.castShadow,true);
      if(primitive.part==='foliage')assert.equal(mesh.material,materials.hedge);
      if(primitive.part==='screen')assert.equal(mesh.material,materials.linen);
    }
  }
});

test('a section shows only privacy members actually crossed and clips their finite length',()=>{
  const structures={boxes:[{id:'panel',group:'spa-screen',part:'screen',label:'Spa screen',x0:3,x1:7,y0:5,y1:5.12,z0:4,z1:6.2}],footprints:[]};
  const cuts=privacySectionCuts(structures,[0,5.06],[1,0]);
  assert.equal(cuts.length,1);assert.deepEqual(cuts[0].interval,[3,7]);
  assert.equal(privacySectionCuts(structures,[0,5.5],[1,0]).length,0);
  const markup=privacySectionMarkup(cuts,{X:v=>v*10,Y:v=>100-v*10,scale:10,minS:4,maxS:6});
  assert.match(markup,/x="40"/);assert.match(markup,/width="20"/);
  assert.equal(privacySectionMarkup(cuts,{X:v=>v,Y:v=>v,scale:1,minS:8,maxS:9}),'');
  const plan=privacyPlanMarkup(structures,{X:v=>v,Y:v=>v,scale:1});
  assert.match(plan,/data-privacy-part="screen"/);assert.match(plan,/<title>Spa screen<\/title>/);
});

test('disabled privacy options leave all diagram and model renderers empty',()=>{
  const structures=privacyStructures({...settings,privacyPergolaEnabled:false,spaScreensEnabled:false},data);
  assert.equal(createPrivacyStructureGroup(structures,materials).children.length,0);
  assert.equal(privacyPlanMarkup(structures,{X:v=>v,Y:v=>v,scale:1}),'');
  assert.deepEqual(privacySectionCuts(structures,[0,0],[1,0]),[]);
});

test('extended cantilever canopies never reintroduce invisible posts in the sun model',()=>{
  const base={...settings,canopyEnabled:true,canopyWidth:8.5,canopyHeight:2.7,fasciaDepth:.5};
  for(const canopyDepth of [base.terraceDepth,base.terraceDepth+1]){
    const s={...base,canopyDepth},supports=canopySupportBounds(s,data);
    const shadePosts=prepareSunGeometry(s,data).occluders.filter(body=>body.id==='canopy-post');
    assert.deepEqual(supports,[]);assert.deepEqual(shadePosts,[]);
  }
});
