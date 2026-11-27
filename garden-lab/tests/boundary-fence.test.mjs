import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {DEFAULTS} from '../src/state.js';
import {DESIGN_STYLES,getDesignStyle} from '../src/design-styles.js';
import {frontHedgeLayout,gardenGroundAt,pointInPolygon} from '../src/geometry.js';
import {boundaryFenceLayout,boundaryMemberFaces,boundaryPlanMarkup,firstBoundaryIntersection} from '../src/boundary-fence.js';
import {createBoundaryFenceGroup} from '../src/scene-boundary-fence.js';
import {applyExteriorSurface} from '../src/exterior-materials.js';
import {houseAppearanceLayout} from '../src/house-appearance.js';
import {addHouseRenovation} from '../src/scene-house-renovation.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const settings={...DEFAULTS,designStyle:'warm-minimal',perimeterFenceEnabled:true,pedestrianGateOpen:true,garageGateOpen:true};
const close=(a,b,message='')=>assert.ok(Math.abs(a-b)<1e-7,`${message}: ${a} != ${b}`);
const mid=m=>[(m.a[0]+m.b[0])/2,(m.a[1]+m.b[1])/2];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const distanceToSegment=(p,a,b)=>{const d=[b[0]-a[0],b[1]-a[1]],l=dot(d,d),t=Math.max(0,Math.min(1,dot([p[0]-a[0],p[1]-a[1]],d)/l));return Math.hypot(p[0]-a[0]-t*d[0],p[1]-a[1]-t*d[1]);};
const bodyClear=(p,solids,radius=.16)=>solids.every(s=>!pointInPolygon(p,s.footprint)&&s.footprint.every((a,i)=>distanceToSegment(p,a,s.footprint[(i+1)%s.footprint.length])>=radius-1e-7));

test('boundary uses every mapped parcel edge, is entirely inside it, and retains the two measured proposal openings',()=>{
  const l=boundaryFenceLayout(settings,data),prior=frontHedgeLayout(settings,data);
  assert.equal(l.enabled,true);assert.equal(l.height,2.2);
  assert.deepEqual(new Set(l.segments.map(s=>s.edgeIndex)),new Set(data.site.boundaryNames.map((_,i)=>i)));
  assert.equal(l.gates.length,2);close(l.quantities.pedestrianGateWidth,1.2);close(l.quantities.garageGateWidth,6.6);
  for(const gate of l.gates){const original=prior.openings.find(g=>g.id===gate.id);
    close(gate.width,original.width);close((gate.a[0]+gate.b[0])/2,(original.a[0]+original.b[0])/2,'Gate stays aligned with the existing approach');
    assert.equal(gate.clearWidth,gate.width);
  }
  for(const m of l.members)assert.ok(m.footprint.every(p=>pointInPolygon(p,data.site.boundary)),`${m.id} must remain inside the parcel`);
  close(l.quantities.fenceLength,l.segments.reduce((sum,s)=>sum+s.length,0),'Fence quantities exclude the gate openings');
});

test('open gates preserve a full pedestrian path and both garage lanes, with the telescopic leaves parked alongside',()=>{
  const l=boundaryFenceLayout(settings,data);
  for(const gate of l.gates){
    assert.equal(gate.open,true);
    for(let station=.17;station<gate.width-.17;station+=.10)for(const y of [-.15,.0,.22,.48,.80,1.20,1.70]){
      const x=gate.a[0]+station;assert.ok(bodyClear([x,y],l.solids),`${gate.kind} approach blocked at ${x}/${y}`);
    }
    if(gate.kind==='garage'){
      assert.equal(gate.leaves.length,2);assert.ok(gate.mechanism.includes('telescopic'));
      for(const leaf of gate.leaves)assert.ok(Math.min(leaf.a[0],leaf.b[0])>gate.b[0], 'Park both leaves completely outside the ramp opening');
    }
  }
  for(const [x,id]of [[5,'pedestrian'],[11.78767,'garage']]){
    const z=gardenGroundAt(x,.22,settings,data)+1.2;
    assert.equal(firstBoundaryIntersection([x,1.7,z],[x,-1,z],l),null,`${id} gate opening must remain transparent when open`);
  }
});

test('each gate can close independently, blocks a physical body, and casts only its real members into the ray model',()=>{
  for(const key of ['pedestrianGateOpen','garageGateOpen']){
    const l=boundaryFenceLayout({...settings,[key]:false},data),kind=key==='pedestrianGateOpen'?'pedestrian':'garage',g=l.gates.find(g=>g.kind===kind);
    assert.equal(g.open,false);assert.equal(l.gates.find(gate=>gate!==g).open,true);
    const centre=mid(g);assert.equal(bodyClear(centre,l.solids),false);
    const leafMember=l.members.find(m=>m.gateId===g.id&&m.part==='infill'),p=mid(leafMember),z=(leafMember.bottomA+leafMember.bottomB+leafMember.topA+leafMember.topB)/4;
    assert.ok(firstBoundaryIntersection([p[0],p[1]+.6,z],[p[0],p[1]-.6,z],l), 'A real gate board intercepts a crossing ray');
    // Select a gap between the horizontal boards, away from the stiles and frame.
    const boards=l.members.filter(m=>m.gateId===g.id&&m.part==='infill'&&m.id.includes('leaf-1')).sort((a,b)=>a.baseZ-b.baseZ);
    const gapZ=(boards[2].topZ+boards[3].baseZ)/2,point=mid(boards[2]);
    assert.equal(firstBoundaryIntersection([point[0],point[1]+.6,gapZ],[point[0],point[1]-.6,gapZ],l),null,'An actual infill gap must not become an opaque gate envelope');
  }
});

test('2.20 m piers and the same grade-following prisms reach the renderer and sunlight meshes',()=>{
  const l=boundaryFenceLayout({...settings,gardenRaise:.7},data);
  for(const p of l.posts){
    close(p.topA-p.bottomA,2.2);close(p.topB-p.bottomB,2.2);
    const c=mid(p);close(p.baseZ,gardenGroundAt(...c,{...settings,gardenRaise:.7},data),'Pier sits on its own finished grade');
  }
  assert.ok(l.posts.some(p=>mid(p)[1]<data.site.rearMidpoint[1]));
  assert.ok(l.posts.some(p=>mid(p)[1]>data.site.rearMidpoint[1]));
  const m=l.members.find(m=>Math.abs(m.bottomB-m.bottomA)>.001&&m.part==='fence-plinth');
  assert.ok(m,'Fixture should contain real sloping terrain');
  const faces=boundaryMemberFaces(m);assert.equal(faces.length,12);
  assert.ok(faces.flat().some(p=>p[2]===m.bottomA));assert.ok(faces.flat().some(p=>p[2]===m.bottomB));
  for(const face of faces)assert.ok(face.every(p=>p.every(Number.isFinite)));
});

test('all 34 renovation styles coordinate gates with their infill and have distinguishable material or construction recipes',()=>{
  const signatures=new Set(),patterns=new Set();
  for(const style of DESIGN_STYLES.filter(s=>s.id!=='current')){
    const l=boundaryFenceLayout({...settings,designStyle:style.id},data);
    assert.equal(l.style.id,style.id);assert.ok(l.style.infillName.length>5);patterns.add(l.style.pattern);
    signatures.add(JSON.stringify([l.style.pattern,l.style.width,l.style.pitch,l.style.plinth,l.style.pier,l.style.palette]));
    for(const gate of l.gates){const infill=l.members.filter(m=>m.gateId===gate.id&&m.part==='infill');assert.ok(infill.length);assert.ok(infill.every(m=>m.material===l.style.material));}
    for(const m of l.members)assert.ok(m.footprint.every(p=>pointInPolygon(p,data.site.boundary)),`${style.id} ${m.id} leaves the plot`);
  }
  assert.equal(signatures.size,34);assert.ok(patterns.size>=4);
});

test('every style remains visibly open through the complete infill bay, including its low base and frames',()=>{
  for(const style of DESIGN_STYLES){
    const l=boundaryFenceLayout({...settings,designStyle:style.id},data),bay=l.blocks.find(b=>b.id.includes('-bay-'));
    const base=bay.members.find(m=>m.part==='fence-plinth'),n=40;let clear=0;
    assert.ok(base,'Bay has its shared low plinth');
    for(let x=0;x<n;x++)for(let z=0;z<n;z++){
      const t=(x+.5)/n,p=[base.a[0]+(base.b[0]-base.a[0])*t,base.a[1]+(base.b[1]-base.a[1])*t],height=base.bottomA+(base.bottomB-base.bottomA)*t+2.2*(z+.5)/n;
      const a=[p[0]-base.v[0]*.25,p[1]-base.v[1]*.25,height],b=[p[0]+base.v[0]*.25,p[1]+base.v[1]*.25,height];
      if(!firstBoundaryIntersection(a,b,{enabled:true,blocks:[bay]}))clear++;
    }
    assert.ok(clear/(n*n)>=.40,`${style.id}: ${(clear/(n*n)*100).toFixed(1)}% clear bay area`);
  }
});

test('changing style or opening gates never mutates the planted trees, mapped data or supplied settings',()=>{
  const source=JSON.stringify(data),state=JSON.stringify(settings);
  for(const style of DESIGN_STYLES)boundaryFenceLayout({...settings,designStyle:style.id,pedestrianGateOpen:false},data);
  assert.equal(JSON.stringify(data),source);assert.equal(JSON.stringify(settings),state);
  for(const config of [{...settings,perimeterFenceEnabled:false},{...settings,perimeterFenceEnabled:undefined}]){
    const l=boundaryFenceLayout(config,data);assert.equal(l.enabled,false);assert.equal(l.members.length,0);assert.equal(l.gates.length,0);
  }
  assert.equal(boundaryFenceLayout(settings,{...data,site:{...data.site,id:'korzeniowskiego-40'}}).enabled,false);
});

test('renderer batches the complete fence into at most eight finish meshes without losing openings or metric heights',()=>{
  const l=boundaryFenceLayout(settings,data),material=new THREE.MeshStandardMaterial({color:'#888888'}),materials=Object.fromEntries(['wood','metal','stone','stoneLight','wall'].map(k=>[k,material]));
  const group=createBoundaryFenceGroup(l,materials),meshes=group.children.filter(o=>o.isMesh);
  assert.ok(meshes.length>0&&meshes.length<=8);
  assert.ok(l.quantities.fenceLength>100&&l.posts.length>40,'Use the complete mapped fence, not a simplified test fixture');
  assert.equal(meshes.reduce((sum,m)=>sum+m.geometry.attributes.position.count/3,0),l.members.length*12);
  const bounds=new THREE.Box3().setFromObject(group);
  assert.ok(Math.abs(bounds.max.y-Math.max(...l.members.map(m=>m.topZ)))<1e-6,'Rendered highest point matches layout elevations within Float32 precision');
  assert.equal(group.userData.gateStates.filter(g=>g.open).length,2);
  for(const m of meshes)m.geometry.dispose();material.dispose();
});

test('Nordic Blackwood fence uses the actual charred house finish while retaining its geometry and other finishes',()=>{
  const style=getDesignStyle('nordic-blackwood'),s={...settings,designStyle:style.id},layout=boundaryFenceLayout(s,data);
  const wood=new THREE.MeshStandardMaterial({color:style.palette.wood});applyExteriorSurface(wood,style,'wood',{seams:false});
  const other=new THREE.MeshStandardMaterial({color:'#888888'}),materials={wood,metal:other,stone:other,stoneLight:other,wall:other};
  const fence=createBoundaryFenceGroup(layout,materials),house=addHouseRenovation(new THREE.Group(),houseAppearanceLayout(data,s),style);
  const warm=createBoundaryFenceGroup(boundaryFenceLayout(settings,data),materials);
  try{
    const timber=fence.getObjectByName('boundary-fence-wood'),finish=timber.material;
    const cladding=house.material.find(m=>m.userData.exteriorRole==='houseWall'&&m.userData.exteriorFinish==='charred-wood');
    assert.ok(cladding,'Compare against the material assigned by the actual house renderer');
    assert.notEqual(finish,wood);assert.equal(wood.userData.exteriorFinish,'cedar');
    assert.equal(finish.userData.exteriorFinish,'charred-wood');assert.equal(finish.userData.exteriorRole,'houseWall');
    assert.notDeepEqual(finish.color.toArray(),wood.color.toArray(),'The gate must not retain the warm cedar joinery colour');
    assert.deepEqual(finish.color.toArray(),cladding.color.toArray());
    for(const key of ['roughness','metalness'])assert.equal(finish[key],cladding[key]);
    assert.deepEqual(finish.normalScale.toArray(),cladding.normalScale.toArray());
    for(const key of ['map','normalMap','roughnessMap']){
      assert.ok(finish[key]&&cladding[key]);assert.deepEqual(finish[key].image.data,cladding[key].image.data,'Use the same calibrated seam-free surface');
    }
    assert.equal(finish.userData.woodGrainAxis,cladding.userData.woodGrainAxis);
    assert.equal(timber.geometry.userData.architecturalMetricUVs,true,'Keep the grain aligned with each vertical batten');
    const expected=new Float32Array(layout.members.filter(m=>m.material==='wood').flatMap(m=>boundaryMemberFaces(m).flatMap(face=>[0,2,1].flatMap(i=>[face[i][0],face[i][2],face[i][1]]))));
    assert.deepEqual(timber.geometry.attributes.position.array,expected,'Changing the finish cannot change a gate, pier or infill vertex');
    for(const mesh of fence.children.filter(m=>m!==timber))assert.equal(mesh.material,other,'The other boundary finishes remain unchanged');
    assert.equal(warm.getObjectByName('boundary-fence-wood').material,wood,'Other styles still use their supplied timber finish');
  }finally{
    for(const group of [fence,warm])for(const mesh of group.children){mesh.geometry.dispose();if(mesh.material!==wood&&mesh.material!==other)mesh.material.dispose();}
    house.geometry.dispose();for(const material of house.material)material.dispose();wood.dispose();other.dispose();
  }
});

test('plan overlay exposes the same two gates and their independent state',()=>{
  const l=boundaryFenceLayout({...settings,pedestrianGateOpen:false},data),markup=boundaryPlanMarkup(l,{X:x=>x*10,Y:y=>y*10,scale:10,labels:true});
  assert.match(markup,/Pedestrian gate · closed · 1\.20 m/);assert.match(markup,/Garage ramp gate · open · 6\.60 m/);
  assert.match(markup,/2\.2 metre perimeter fence/);assert.match(markup,/Garage gate 6\.60 m/);
});
