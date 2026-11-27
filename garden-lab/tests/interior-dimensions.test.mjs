import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {interiorDimensions,interiorRoomMetrics,interiorDimensionContext} from '../src/interior-dimensions.js';
import {createInteriorDimensionOverlay} from '../src/scene-interior-dimensions.js';
import {getHouseFloorPlan,houseModelFrame} from '../src/house-model.js';
import {drawInteriorPlan} from '../src/interior-plan-view.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const settings={designStyle:'modern-minimal',floorHeight:1.2,firstFloorRise:3.05,atticRise:5.75,basementGarageEnabled:true,garageClearHeight:2.3,
  officeCoworking:true,officeGuestBedOpen:true,gymBenchParked:true,hstOpen:1,balconyOpen:1};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const rect=(x,z,w,d)=>[[x,z],[x+w,z],[x+w,z+d],[x,z+d]];
const plainPlan={floor:'ground',elevation:0,clearHeight:2.75,envelope:{outline:rect(0,0,4,4)},
  rooms:[{id:'test',label:'Test room',polygon:rect(0,0,4,4)}],walls:[],fixtures:[],stairs:[],voids:[]};

test('room areas exclude actual slab voids and irregular extents are not presented as a clear rectangle',()=>{
  const p={...plainPlan,rooms:[{id:'l',label:'Hall',polygon:[[0,0],[4,0],[4,2],[2,2],[2,4],[0,4]]}],voids:[rect(.5,.5,1,1)]};
  const metric=interiorRoomMetrics(p,p.rooms[0]);
  near(metric.area,11);near(metric.polygonArea,12);near(metric.width,4);near(metric.depth,4);
  assert.equal(metric.maximumExtents,true);
  const record=interiorDimensions(p)[0];assert.match(record.title,/11.00 m²/);assert.match(record.text,/4.00 × 4.00 m max/);
  const attic={...p,floor:'attic',clearHeight:3};assert.equal(interiorRoomMetrics(attic,p.rooms[0]).clearHeight,null);
  assert.doesNotMatch(interiorDimensions(attic)[0].text,/h 3.00/);
});

test('every furnished storey exposes current numeric footprints and openings without inventing equipment heights',()=>{
  for(const style of ['current','modern-minimal','hidden-bali'])for(const floor of ['basement','ground','first','attic']){
    const plan=getHouseFloorPlan({floor,settings:{...settings,designStyle:style},data}),records=interiorDimensions(plan);
    assert.equal(records.filter(r=>r.kind==='room').length,plan.rooms.length);
    assert.equal(new Set(records.map(r=>r.id)).size,records.length);
    for(const record of records){
      assert.equal(record.floor,floor);assert.ok(record.anchor.every(Number.isFinite));
      if(record.kind==='fixture'){
        const f=plan.fixtures.find(f=>f.id===record.feature);near(record.metrics.width,f.width);near(record.metrics.depth,f.depth);
        assert.equal('height' in record.metrics,Number.isFinite(f.height));
      }
      if(record.kind==='opening')assert.ok(record.metrics.width>0&&record.metrics.height>0);
    }
    assert.equal(interiorDimensions(plan,{showDimensions:false}).length,0);
    assert.equal(interiorDimensions(plan,{showFurniture:false}).some(r=>r.kind==='fixture'),false);
  }
  const first=getHouseFloorPlan({floor:'first',settings,data}),guest=interiorDimensions(first).find(r=>r.feature==='guest2-bed');
  near(guest.metrics.width,2.10);near(guest.metrics.depth,1.48);near(guest.metrics.mattress.width,1.4);near(guest.metrics.mattress.length,2);
  assert.match(guest.description,/mattress 1.40 × 2.00 m/);
});

test('an opening label follows the actual edited aperture and the floor level; rotation does not change furniture lengths',()=>{
  const plan={...plainPlan,elevation:3.6,clearHeight:2.4,walls:[{id:'side',a:[0,0],b:[0,4],thickness:.3,height:2.4,
    openings:[{type:'window',offset:.6,width:2.3,sill:.8,height:2,roomId:'test'}]}],
    fixtures:[{id:'desk',kind:'desk',roomId:'test',x:2,z:2,width:2.6,depth:.7,rotation:Math.PI/2}]};
  const records=interiorDimensions(plan),opening=records.find(r=>r.kind==='opening'),desk=records.find(r=>r.kind==='fixture');
  near(opening.metrics.width,2.3);near(opening.metrics.height,1.6);near(opening.metrics.sill,.8);
  near(opening.anchor[1],3.6+.8+1.6*.72);
  near(new THREE.Vector3(...desk.lines[0][0]).distanceTo(new THREE.Vector3(...desk.lines[0][1])),2.6);
  const raised=interiorDimensions({...plan,elevation:4.1}).find(r=>r.kind==='opening');near(raised.anchor[1]-opening.anchor[1],.5);
});

test('occupied-storey resolution hides outside and inter-floor viewpoints while retaining the actual room',()=>{
  const first={...plainPlan,floor:'first',elevation:3.05};
  assert.equal(interiorDimensionContext([plainPlan,first],[2,1.6,2],{requireInside:true}).floor,'ground');
  assert.equal(interiorDimensionContext([plainPlan,first],[2,4.6,2],{requireInside:true}).floor,'first');
  assert.equal(interiorDimensionContext([plainPlan,first],[6,1.6,2],{requireInside:true}),null);
  assert.equal(interiorDimensionContext([plainPlan,first],[2,2.86,2],{requireInside:true}).floor,'ground');
  assert.equal(interiorDimensionContext([plainPlan,first],[2,10,2],{requireInside:true}),null);
});

function fakeDocument(){
  const createElement=()=>({style:{},dataset:{},children:[],attributes:{},hidden:false,classList:{toggle(){}},
    append(...nodes){this.children.push(...nodes);},remove(){this.removed=true;},setAttribute(k,v){this.attributes[k]=v;},getAttribute(k){return this.attributes[k];}});
  return {createElement};
}

test('labels obey real occlusion, hidden cutaway parents and the shared house coordinate frame',()=>{
  const previous=globalThis.document;globalThis.document=fakeDocument();
  try{
    const scene=new THREE.Scene(),root=new THREE.Group();scene.add(root);
    const wall=new THREE.Mesh(new THREE.BoxGeometry(4,3,.15),new THREE.MeshBasicMaterial());wall.position.set(2,1.5,4.2);root.add(wall);
    const container=document.createElement('div'),overlay=createInteriorDimensionOverlay(container,scene,()=>[root]);
    const camera=new THREE.PerspectiveCamera(60,1.5,.05,100);camera.position.set(2,1.6,7);camera.lookAt(2,1.08,2);camera.updateMatrixWorld();
    overlay.update([plainPlan]);overlay.render(camera,900,600,{mode:'room'});assert.equal(overlay.getDiagnostics().visible,0);
    root.visible=false;overlay.invalidate();overlay.render(camera,900,600,{mode:'room'});assert.equal(overlay.getDiagnostics().visible,1);
    root.visible=true;wall.material.transparent=true;wall.material.opacity=.2;overlay.update([plainPlan]);overlay.render(camera,900,600,{mode:'room'});assert.equal(overlay.getDiagnostics().visible,1);
    overlay.update([plainPlan],{enabled:false});overlay.render(camera,900,600,{mode:'room'});assert.equal(overlay.getDiagnostics().visible,0);
    overlay.dispose();wall.geometry.dispose();wall.material.dispose();
    const frame=houseModelFrame(data,settings),shared=createInteriorDimensionOverlay(container,scene,()=>[],{shared:true});
    shared.update([plainPlan],{frame});
    const world=frame.toSite(2,3.8,1.6),target=frame.toSite(2,2,1.08);camera.position.set(world[0],world[2],world[1]);camera.lookAt(target[0],target[2],target[1]);camera.updateMatrixWorld();
    shared.render(camera,900,600,{mode:'walk'});assert.equal(shared.getDiagnostics().visible,1);
    shared.render(camera,900,600,{mode:'orbit'});assert.equal(shared.getDiagnostics().visible,0);
    shared.render(camera,900,600,{mode:'walk'});assert.equal(shared.getDiagnostics().visible,1);
    const p=shared.group.children[0].geometry.attributes.position.array,expected=frame.toSite(0,0,.055);
    near(p[0],Math.fround(expected[0]));near(p[1],Math.fround(expected[2]));near(p[2],Math.fround(expected[1]));shared.dispose();
  }finally{globalThis.document=previous;}
});

test('floor plan exposes each room footprint and area and the dimension toggle removes its annotations',()=>{
  const plan=getHouseFloorPlan({floor:'first',settings,data}),host={innerHTML:''};drawInteriorPlan(host,plan);
  for(const room of plan.rooms)assert.ok(host.innerHTML.includes(`data-iw-room-dimensions="${room.id}"`));
  assert.match(host.innerHTML,/1.28 × 1.30 m/);
  drawInteriorPlan(host,plan,{showDimensions:false});assert.doesNotMatch(host.innerHTML,/data-iw-room-dimensions=/);assert.doesNotMatch(host.innerHTML,/class="iw-dimension"/);
});
