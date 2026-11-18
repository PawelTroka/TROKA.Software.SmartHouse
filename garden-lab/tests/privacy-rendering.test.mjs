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

test('extended canopy supports reach garden ground while on-deck posts retain the terrace datum',()=>{
  const base={...settings,canopyEnabled:true,canopyWidth:8.5,canopyHeight:2.7,fasciaDepth:.5};
  const floor=floorElevation(base,data);
  for(const canopyDepth of [base.terraceDepth,base.terraceDepth+1]){
    const s={...base,canopyDepth},supports=canopySupportBounds(s,data);
    const shadePosts=prepareSunGeometry(s,data).occluders.filter(body=>body.id==='canopy-post');
    assert.equal(supports.length,2);assert.equal(shadePosts.length,2);
    for(const [i,p]of supports.entries()){
      const x=(p.x0+p.x1)/2,y=(p.y0+p.y1)/2;
      const deck=data.site.terrace;
      const overDeck=p.x0>=deck.x&&p.x1<=deck.x+deck.width&&p.y0>=deck.y&&p.y1<=deck.y+s.terraceDepth;
      const expectedBase=overDeck?floor:gardenGroundAt(x,y,s,data);
      near(p.z0,expectedBase);near(shadePosts[i].base,expectedBase);near(shadePosts[i].top,p.z1);
      near(shadePosts[i].bounds.min[0],p.x0);near(shadePosts[i].bounds.max[0],p.x1);
      near(shadePosts[i].bounds.min[1],p.y0);near(shadePosts[i].bounds.max[1],p.y1);
      if(canopyDepth>base.terraceDepth){
        assert.ok(p.z0<floor-.1,'The overhanging roof requires longer supports below deck level');
        const eye=[x,p.y0-.2,(p.z0+floor)/2];
        assert.equal(firstSunBlocker(eye,[0,1,0],shadePosts)?.id,'canopy-post','Sunlight must see the grounded lower support');
        assert.equal(canopyIntersection(eye,[x,p.y1+.2,eye[2]],s,data)?.id,p.id,'The real post intersects the sightline at the same elevation');
        const beside=[p.x1+.01,eye[1],eye[2]];
        assert.equal(canopyIntersection(beside,[beside[0],p.y1+.2,beside[2]],s,data),null,'Space beside the post stays open');
      }
    }
  }
});
