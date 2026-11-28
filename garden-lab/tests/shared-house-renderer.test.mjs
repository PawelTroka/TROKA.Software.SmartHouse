import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {createStateModel} from '../src/state.js';
import {getSiteProfile} from '../src/sites.js';
import {applyPlanExterior} from '../src/plan-exterior.js';
import {getHouseFloorPlan} from '../src/house-model.js';
import {getInteriorPlan} from '../src/interior-plan.js';
import {getDesignStyle} from '../src/design-styles.js';
import {createSharedHouseModel,cloneOwnedScene} from '../src/scene-house-model.js';
import {interiorMaterials} from '../src/interior-materials.js';
import {buildArchitecture,updateHstOpening} from '../src/interior-architecture.js';
import {hstPanelLayout} from '../src/hst-system.js';
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
// Float32 storey-relative vertices lose a few micrometres when translated
// back to building datum; compare the rendered cloud at 0.1 mm resolution.
const pointKey=(x,y,z)=>[x,y,z].map(n=>Math.round(n*1e4)).join(',');
function vertices(root,elevation=0){const points=new Map();root.traverse(o=>{
  if(!o.isMesh)return;const p=o.geometry.attributes.position;
  for(let i=0;i<p.count;i++){const k=pointKey(p.getX(i),p.getY(i)+elevation,p.getZ(i));points.set(k,(points.get(k)||0)+1);}
});return points;}

test('renovated stairs align their openings while Current preserves the archived mismatch',()=>{
  for(const designStyle of ['current','hidden-bali'])for(const firstFloorRise of [2.70,3.05,3.50]){
    const options={...settings,firstFloorRise,designStyle},data=applyPlanExterior(source,options);
    const ground=getHouseFloorPlan({floor:'ground',settings:options,data}),first=getHouseFloorPlan({floor:'first',settings:options,data});
    const lower=ground.stairs.find(s=>s.id==='main-stair'),upper=first.stairs.find(s=>s.id==='main-stair');
    const layout=designStyle==='current'?'existing':'renovation',historical=getInteriorPlan({floor:'first',layout});
    assert.deepEqual(upper.polygon,lower.polygon);assert.deepEqual(upper.direction,lower.direction);assert.equal(upper.rise,firstFloorRise);
    assert.deepEqual(upper.sourcePolygon,historical.stairs.find(s=>s.id==='main-stair').polygon);
    assert.deepEqual(first.voids,historical.voids);
    if(designStyle==='current'){assert.notDeepEqual(upper.polygon,upper.sourcePolygon);assert.match(first.issues.find(x=>x.includes('shared main stair')),/alignment and headroom/);}
    else {assert.deepEqual(upper.polygon,upper.sourcePolygon);assert.match(first.issues.find(x=>x.includes('aligns the main floor opening')),/headroom/);}
  }
});

test('the exterior retains all interior furniture vertices and exactly one canonical main stair',()=>{
  const previous=globalThis.document;globalThis.document=canvasDocument();let assembled;
  try{
    const data=applyPlanExterior(source,settings);assembled=createSharedHouseModel(data,settings,{terrainAt});
    const stairs=assembled.root.getObjectByName('shared-house-stairs');
    assert.deepEqual(stairs.children.map(o=>o.userData.houseStairConnection.id).sort(),['attic-stair','cellar-stair','main-stair']);
    const canonical=vertices(stairs.getObjectByName('shared-stair-main-stair'));
    for(const floor of ['ground','first']){
      const plan=getHouseFloorPlan({floor,settings,data}),tools=modelTools(),finishes=interiorMaterials(settings.designStyle);
      const inside=buildArchitecture({...plan,stairs:plan.stairs.filter(s=>s.id==='main-stair')},{showOutdoor:false,showExterior:false},tools,finishes);
      try{
        const outside=assembled.root.getObjectByName('shared-house-floor-'+floor),expected=vertices(inside.groups.props),actual=vertices(outside);
        assert.ok(expected.size>1000,`${floor} furnishing should contain detailed geometry`);
        for(const [point,count]of expected)assert.ok((actual.get(point)||0)>=count,`${floor}: furniture point ${point} is absent from the exterior`);
        assert.equal(outside.userData.houseFloor,floor);
        assert.ok(outside.children.every(n=>(n.isMesh||n.userData.hstLeaf)&&n.visible),'Only full static batches and operable HST leaf batches remain');
        assert.deepEqual(vertices(inside.groups.stairs,plan.elevation),canonical,`${floor} must show the same physical connecting flight`);
        inside.updateVisibility('room',new THREE.Vector3(),{showStairs:false});assert.equal(inside.groups.stairs.visible,false);
        inside.updateVisibility('dollhouse',new THREE.Vector3(),{showStairs:true});assert.equal(inside.groups.stairs.visible,true);
      }finally{inside.dispose();finishes.dispose();tools.dispose();}
    }
    const context=cloneOwnedScene([assembled.root],o=>o.userData.houseFloor!=='first');
    assert.equal(context.root.getObjectByName('shared-house-floor-first'),undefined);
    const connections=[];context.root.traverse(o=>{if(o.userData.houseStairConnection)connections.push(o.userData.houseStairConnection.id);});
    assert.deepEqual(connections.sort(),['attic-stair','cellar-stair','main-stair']);context.dispose();
  }finally{assembled?.dispose();if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

test('the full house keeps the basement gym and technical fittings while leaving both vehicles to the garage renderer',()=>{
  const previous=globalThis.document;globalThis.document=canvasDocument();let assembled,inside,finishes,tools;
  try{
    const options={...settings,designStyle:'warm-minimal',basementGarageEnabled:true},data=applyPlanExterior(source,options);
    assembled=createSharedHouseModel(data,options,{terrainAt});
    const plan=getHouseFloorPlan({floor:'basement',settings:options,data});
    assert.equal(plan.fixtures.filter(f=>f.kind==='car').length,2);
    const propsOnly={...plan,fixtures:plan.fixtures.filter(f=>f.kind!=='car')};
    tools=modelTools();finishes=interiorMaterials(options.designStyle);
    inside=buildArchitecture(propsOnly,{showFurniture:true,showOutdoor:false,showExterior:false},tools,finishes);
    const actual=vertices(assembled.root.getObjectByName('shared-house-floor-basement')),expected=vertices(inside.groups.props);
    assert.ok(expected.size>1000,'The occupied cellar must contain the modeled exercise and plant equipment');
    for(const [point,count]of expected)assert.ok((actual.get(point)||0)>=count,'Basement fitting point '+point+' is absent from the whole-house model');
    const basementLights=assembled.root.getObjectByName('basement-task-lighting');
    assert.equal(basementLights.children.length,2);assert.ok(basementLights.children.every(light=>light.intensity>0&&!light.castShadow));
    const ground=getHouseFloorPlan({floor:'ground',settings:options,data}),first=getHouseFloorPlan({floor:'first',settings:options,data});
    const selectedLights=[...(ground.interiorLights||[]).filter(s=>['dining-pendant','lounge-reading-light'].includes(s.id)),
      ...(first.interiorLights||[]).filter(s=>s.id==='master-reading-light')].slice(0,3).map(s=>'task-light-'+s.id);
    assert.deepEqual(assembled.root.getObjectByName('interior-task-lighting').children.map(light=>light.name),selectedLights,
      'The whole-house lights must follow the selected furnishing plan; cinema has no freestanding reading lamp');
    // Neither placeholder car is left in the full-house props. Their upper
    // cabins would otherwise add vertices well inside the two parking bays.
    const vertexInsideCar=[];
    const floor=assembled.root.getObjectByName('shared-house-floor-basement');
    floor.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;
      for(let i=0;i<p.count;i++)if(p.getY(i)>.85&&p.getY(i)<1.35&&p.getZ(i)>1.40&&p.getZ(i)<4.10&&p.getX(i)>1&&p.getX(i)<5.50)vertexInsideCar.push(i);
    });
    assert.equal(vertexInsideCar.length,0,'Live garage vehicles must not acquire duplicate interior placeholder geometry');
  }finally{inside?.dispose();assembled?.dispose();finishes?.dispose();tools?.dispose();if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

test('HST updates move the actual pane batches without rebuilding the house or its fixed tracks',()=>{
  const previous=globalThis.document;globalThis.document=canvasDocument();let assembled,clone;
  try{
    const options={...settings,hstOpen:1},data=applyPlanExterior(source,options);
    assembled=createSharedHouseModel(data,options,{terrainAt});
    const floor=assembled.root.getObjectByName('shared-house-floor-ground'),leaves=[];
    floor.traverse(o=>{if(o.userData.hstLeaf)leaves.push(o);});
    assert.equal(leaves.length,3,'Both wall and whole-storey batching retain the three operable leaf assemblies');
    const geometries=geometryList(assembled.root),materials=materialList(assembled.root);
    const fixed=leaves.find(n=>n.userData.hstLeaf.index===0),fixedPosition=fixed.position.clone();
    const plan=getHouseFloorPlan({floor:'ground',settings:options,data}),wall=plan.walls.find(w=>w.openings.some(o=>o.type==='hst')),opening=wall.openings.find(o=>o.type==='hst');
    const buffers=[];floor.traverse(o=>{if(o.isMesh)buffers.push([o.geometry,o.geometry.attributes.position.array.slice()]);});
    for(const hstOpen of [0,.42,1]){
      assert.equal(updateHstOpening(assembled.root,{hstOpen}),2);
      assembled.root.updateMatrixWorld(true);const inverse=floor.matrixWorld.clone().invert(),expected=hstPanelLayout(opening,{hstOpen});
      for(const leaf of leaves){
        const bounds=new THREE.Box3(),point=new THREE.Vector3();
        leaf.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++)bounds.expandByPoint(point.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld).applyMatrix4(inverse));});
        const panel=expected.panels[leaf.userData.hstLeaf.index];
        assert.ok(Math.abs(bounds.min.x-wall.a[0]-panel.lo)<2e-6);assert.ok(Math.abs(bounds.max.x-wall.a[0]-panel.hi)<2e-6);
      }
      assert.ok(fixed.position.distanceTo(fixedPosition)<1e-9,'The stacked fixed leaf remains anchored');
      assert.deepEqual(geometryList(assembled.root),geometries);assert.deepEqual(materialList(assembled.root),materials);
      for(const [geometry,positions]of buffers)assert.deepEqual(geometry.attributes.position.array,positions,'Fixed structure and tracks retain their original vertex buffers');
    }
    clone=cloneOwnedScene([floor]);updateHstOpening(clone.root,{hstOpen:0});
    assert.equal(leaves.find(n=>n.userData.hstLeaf.index===2).userData.hstLeaf.centre,hstPanelLayout(opening,{hstOpen:1}).panels[2].centre,'Updating a context clone must not mutate the original leaf state');
  }finally{clone?.dispose();assembled?.dispose();if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
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

test('the shared exterior finish toggle removes cladding while preserving the selected real apertures and furnishings',()=>{
  const previous=globalThis.document;globalThis.document=canvasDocument();let styled,plain;
  try{
    const data=applyPlanExterior(source,settings);styled=createSharedHouseModel(data,settings,{terrainAt});
    plain=createSharedHouseModel(data,{...settings,styleHouseFinish:false},{terrainAt});
    assert.ok(styled.root.getObjectByName('house-renovation'));
    assert.equal(plain.root.getObjectByName('house-renovation'),undefined);
    assert.deepEqual(plain.layout.windows,styled.layout.windows,'The preview checkbox cannot restore a different wall-opening layout');
    const current=getDesignStyle('current').palette;
    assert.equal(plain.root.getObjectByName('shared-house-gables').material.color.getHex(),new THREE.Color(current.houseWall).getHex());
    assert.equal(plain.root.getObjectByName('house-measured-terracotta-roof').material.color.getHex(),new THREE.Color(current.houseRoof).getHex());
    for(const floor of ['ground','first'])assert.deepEqual(vertices(plain.root.getObjectByName('shared-house-floor-'+floor)),vertices(styled.root.getObjectByName('shared-house-floor-'+floor)));
  }finally{plain?.dispose();styled?.dispose();if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
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
