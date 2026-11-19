import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {createStateModel} from '../src/state.js';
import {getSiteProfile} from '../src/sites.js';
import {applyPlanExterior} from '../src/plan-exterior.js';
import {getHouseFloorPlan} from '../src/house-model.js';
import {getInteriorPlan} from '../src/interior-plan.js';
import {createSharedHouseModel,cloneOwnedScene} from '../src/scene-house-model.js';
import {interiorMaterials} from '../src/interior-materials.js';
import {buildArchitecture} from '../src/interior-architecture.js';
import {modelTools} from '../src/interior-geometry.js';
import {terrainAt} from '../src/geometry.js';

const source=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const state=createStateModel(getSiteProfile(source.site.id,source));
const settings={...state.DEFAULTS,designStyle:'hidden-bali',interiorLayout:'renovation',styleHouseFinish:true,
  basementGarageEnabled:false,firstFloorRise:3.05,atticRise:5.75,terraceWidth:10.77,terraceDepth:4,
  canopyEnabled:true,terraceCoverType:'balcony',canopyWidth:10.77,canopyDepth:4,planExteriorApplied:true};

function canvasDocument(){const context=new Proxy({},{get:()=>()=>{}});return{createElement:()=>({width:0,height:0,getContext:()=>context})};}
function materialList(root){const set=new Set();root.traverse(o=>{for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])set.add(m);});return set;}
function geometryList(root){const set=new Set();root.traverse(o=>{if(o.geometry)set.add(o.geometry);});return set;}
const pointKey=(x,y,z)=>[x,y,z].map(n=>Math.round(n*1e5)).join(',');
function vertices(root,elevation=0){const points=new Map();root.traverse(o=>{
  if(!o.isMesh)return;const p=o.geometry.attributes.position;
  for(let i=0;i<p.count;i++){const k=pointKey(p.getX(i),p.getY(i)+elevation,p.getZ(i));points.set(k,(points.get(k)||0)+1);}
});return points;}

test('the canonical receiving stair keeps its archived void evidence and follows edited floor rise',()=>{
  for(const firstFloorRise of [2.70,3.05,3.50]){
    const options={...settings,firstFloorRise},data=applyPlanExterior(source,options);
    const ground=getHouseFloorPlan({floor:'ground',settings:options,data}),first=getHouseFloorPlan({floor:'first',settings:options,data});
    const lower=ground.stairs.find(s=>s.id==='main-stair'),upper=first.stairs.find(s=>s.id==='main-stair');
    const historical=getInteriorPlan({floor:'first',layout:'renovation'});
    assert.deepEqual(upper.polygon,lower.polygon);assert.deepEqual(upper.direction,lower.direction);assert.equal(upper.rise,firstFloorRise);
    assert.deepEqual(upper.sourcePolygon,historical.stairs.find(s=>s.id==='main-stair').polygon);
    assert.deepEqual(first.voids,historical.voids);assert.notDeepEqual(upper.polygon,upper.sourcePolygon);
    assert.match(first.issues.find(x=>x.includes('shared main stair')),/alignment and headroom/);
  }
});

test('the exterior retains all interior furniture vertices and exactly one canonical main stair',()=>{
  const previous=globalThis.document;globalThis.document=canvasDocument();let assembled;
  try{
    const data=applyPlanExterior(source,settings);assembled=createSharedHouseModel(data,settings,{terrainAt});
    const stairs=assembled.root.getObjectByName('shared-house-stairs');
    assert.deepEqual(stairs.children.map(o=>o.userData.houseStairConnection.id).sort(),['attic-hatch','cellar-stair','main-stair']);
    const canonical=vertices(stairs.getObjectByName('shared-stair-main-stair'));
    for(const floor of ['ground','first']){
      const plan=getHouseFloorPlan({floor,settings,data}),tools=modelTools(),finishes=interiorMaterials(settings.designStyle);
      const inside=buildArchitecture(plan,{showOutdoor:false,showExterior:false},tools,finishes);
      try{
        const outside=assembled.root.getObjectByName('shared-house-floor-'+floor),expected=vertices(inside.groups.props),actual=vertices(outside);
        assert.ok(expected.size>1000,`${floor} furnishing should contain detailed geometry`);
        for(const [point,count]of expected)assert.ok((actual.get(point)||0)>=count,`${floor}: furniture point ${point} is absent from the exterior`);
        assert.equal(outside.userData.houseFloor,floor);
        assert.ok(outside.children.every(n=>n.isMesh&&n.visible),'Only full, visible batched geometry remains');
        assert.deepEqual(vertices(inside.groups.stairs,plan.elevation),canonical,`${floor} must show the same physical connecting flight`);
        inside.updateVisibility('room',new THREE.Vector3(),{showStairs:false});assert.equal(inside.groups.stairs.visible,false);
        inside.updateVisibility('dollhouse',new THREE.Vector3(),{showStairs:true});assert.equal(inside.groups.stairs.visible,true);
      }finally{inside.dispose();finishes.dispose();tools.dispose();}
    }
    const context=cloneOwnedScene([assembled.root],o=>o.userData.houseFloor!=='first');
    assert.equal(context.root.getObjectByName('shared-house-floor-first'),undefined);
    const connections=[];context.root.traverse(o=>{if(o.userData.houseStairConnection)connections.push(o.userData.houseStairConnection.id);});
    assert.deepEqual(connections.sort(),['attic-hatch','cellar-stair','main-stair']);context.dispose();
  }finally{assembled?.dispose();if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

test('the historical entry retains landing wings at the top of both external stair flights',()=>{
  const previous=globalThis.document;globalThis.document=canvasDocument();let model;
  try{
    const current={...settings,designStyle:'current',interiorLayout:'existing',canopyEnabled:false},data=applyPlanExterior(source,current);
    model=createSharedHouseModel(data,current,{terrainAt});model.root.updateMatrixWorld(true);
    const ground=model.root.getObjectByName('shared-house-floor-ground');
    for(const x of [3.40,7.30]){
      const p=ground.localToWorld(new THREE.Vector3(x,.08,9.65)),ray=new THREE.Raycaster(p,new THREE.Vector3(0,-1,0),0,.15);
      assert.ok(ray.intersectObject(ground,true).length>0,`The entry landing wing at drawing x=${x} is absent`);
    }
  }finally{model?.dispose();if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

test('context clones omit only the active floor and own all GPU resources independently',()=>{
  const scene=new THREE.Group(),material=new THREE.MeshStandardMaterial(),texture=new THREE.Texture({width:4,height:4});
  material.map=texture;material.bumpMap=texture;const geometry=new THREE.BoxGeometry();
  for(const floor of ['ground','first']){
    const group=new THREE.Group();group.userData.houseFloor=floor;group.name=floor;
    const mesh=new THREE.Mesh(geometry,material);mesh.name=floor+'-furniture';group.add(mesh);scene.add(group);
  }
  const roof=new THREE.Mesh(geometry,material);roof.userData.houseRoof=true;roof.name='roof';scene.add(roof);
  const instances=new THREE.InstancedMesh(geometry,material,2);instances.name='garden-instances';
  instances.setMatrixAt(1,new THREE.Matrix4().makeTranslation(4,0,3));scene.add(instances);
  scene.add(new THREE.DirectionalLight());
  const owned=cloneOwnedScene([scene],o=>o.userData.houseFloor!=='ground'),clone=owned.root;
  assert.equal(clone.getObjectByName('ground'),undefined);assert.ok(clone.getObjectByName('first-furniture'));assert.ok(clone.getObjectByName('roof'));
  const copied=clone.getObjectByName('first-furniture'),copiedInstances=clone.getObjectByName('garden-instances');
  assert.notEqual(copied.geometry,geometry);assert.notEqual(copied.material,material);assert.notEqual(copied.material.map,texture);
  assert.equal(copied.material.map,copied.material.bumpMap,'Shared maps should be cloned once per context');
  assert.equal(copied.material.map.image,texture.image,'Pixel data can be shared without sharing GPU texture objects');
  assert.notEqual(copiedInstances.instanceMatrix,instances.instanceMatrix);
  assert.deepEqual([...copiedInstances.instanceMatrix.array],[...instances.instanceMatrix.array]);
  let lights=0;clone.traverse(o=>{if(o.isLight)lights++;});assert.equal(lights,0);
  const disposed=new Set(),originals=new Set();
  for(const item of [copied.geometry,copied.material,copied.material.map])item.addEventListener('dispose',()=>disposed.add(item));
  for(const item of [geometry,material,texture])item.addEventListener('dispose',()=>originals.add(item));
  owned.dispose();assert.equal(disposed.size,3);assert.equal(originals.size,0);
  const attic=cloneOwnedScene([scene],o=>o.userData.houseFloor!=='attic'&&!o.userData.houseRoof);assert.equal(attic.root.getObjectByName('roof'),undefined);attic.dispose();
  instances.dispose();geometry.dispose();material.dispose();texture.dispose();
});

test('assembled-house disposal releases full-floor batches, facade finishes and owned maps once',()=>{
  const previous=globalThis.document;globalThis.document=canvasDocument();let model;
  try{
    const data=applyPlanExterior(source,settings);model=createSharedHouseModel(data,settings,{terrainAt});
    const materials=materialList(model.root),geometries=geometryList(model.root),textures=new Set();
    for(const material of materials)for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
    const resources=[...materials,...geometries,...textures],counts=new Map();
    for(const resource of resources){counts.set(resource,0);resource.addEventListener('dispose',()=>counts.set(resource,counts.get(resource)+1));}
    model.dispose();model.dispose();
    for(const [resource,count]of counts)assert.equal(count,1,`${resource.type||'Texture'} must be disposed exactly once`);
    assert.ok(resources.length>100,'Verify a complete house, not an empty scene');
  }finally{model?.dispose();if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
