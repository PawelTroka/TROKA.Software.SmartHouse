import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {DESIGN_STYLES,getDesignStyle} from '../src/design-styles.js';
import {getSiteProfile} from '../src/sites.js';
import {createStateModel} from '../src/state.js';
import {terrainAt} from '../src/geometry.js';
import {garageLayout} from '../src/garage-ramp.js';
import {houseAppearanceLayout,facadePoint} from '../src/house-appearance.js';
import {mappedHouseFacadeLayout} from '../src/mapped-house-facades.js';
import {roofEdgeHeight} from '../src/roof-envelope.js';
import {photoRoofEdgeHeight} from '../src/house-roof.js';
import {houseRenovationParts,houseRenovationSummary} from '../src/house-renovation.js';
import {addHouseRenovation} from '../src/scene-house-renovation.js';
import {createPhotoHouseGroup} from '../src/scene-house.js';
import {toWorld} from '../src/orientation.js';

const styles=DESIGN_STYLES.filter(s=>s.renovation);
const sites=['site-data','korzeniowskiego-40','nadmorska-17'].map(id=>{
  const data=JSON.parse(readFileSync(new URL('../data/'+id+'.json',import.meta.url)));
  const model=createStateModel(getSiteProfile(data.site.id,data));
  return {data,model};
});
const makeLayout=(data,settings)=>data.site.id&&data.site.id!=='sternicza-11'?mappedHouseFacadeLayout(data,settings):
  houseAppearanceLayout(data,settings,{garageLayout:garageLayout(settings,data,{terrainAt})});
const near=(a,b,tolerance=2e-5)=>assert.ok(Math.abs(a-b)<tolerance,`${a} differs from ${b}`);

function checkClearance(parts,layout){
  const openings=[...layout.windows,layout.atticWindow,layout.portal,layout.door].filter(Boolean);
  for(const p of parts){
    const edge=layout.edges[p.edgeIndex],roof=edge.roofEdge;
    assert.ok(p.lo>=0&&p.hi<=edge.length&&p.hi>p.lo&&p.top>p.bottom&&p.bottom>=Math.max(layout.baseZ,edge.baseZ??layout.baseZ));
    assert.ok(p.depth>0&&p.depth<=.14);
    // Test both part ends and every roof break that their span crosses.
    const heightAt=d=>Math.min(edge.topZ??Infinity,roof?(roof.fractions?photoRoofEdgeHeight(roof,d):roofEdgeHeight(roof,d/edge.length)):Infinity);
    const samples=[p.lo,p.hi,...(roof?.points??[]).map((_,i)=>edge.length*(roof.fractions?.[i]??i/(roof.points.length-1))).filter(d=>d>p.lo&&d<p.hi)];
    assert.ok(samples.every(d=>p.top<heightAt(d)));
    for(const w of openings.filter(w=>w.edgeIndex===edge.index)){
      assert.ok(p.hi<=w.lo||p.lo>=w.hi||p.top<=w.z||p.bottom>=w.z+w.height,`${p.kind} overlaps ${w.id??'garage portal'}`);
    }
  }
}

test('each style fits all three facades and changes the shape of physical fittings',()=>{
  assert.equal(styles.length,20);
  for(const {data,model} of sites){
    const settings=model.DEFAULTS,layout=makeLayout(data,settings),fingerprints=new Set();
    for(const style of styles){
      const parts=houseRenovationParts(layout,style);
      checkClearance(parts,layout);
      // Deliberately omit colors, material names and style IDs from this comparison.
      fingerprints.add(JSON.stringify(parts.map(p=>[p.edgeIndex,p.lo,p.hi,p.bottom,p.top,p.depth])));
      const summary=houseRenovationSummary(data,{...settings,styleHouseFinish:true},style);
      assert.equal(summary.partCount,parts.length);
      assert.ok(summary.accentBayCount>=1&&summary.claddingAreaM2>1,style.id);
      assert.ok(summary.trimmedOpeningCount>=10&&parts.length<4500,style.id);
      if(style.id==='hidden-bali')assert.ok(summary.claddingAreaM2>24,'The resort renovation wraps actual wall fields, rather than three small samples');
    }
    assert.equal(fingerprints.size,20,'Every style has a different geometric treatment');
  }
});

test('plan-derived storey edges retain their vertical limits and keep actual door routes open',()=>{
  const edge=(index,baseZ,topZ)=>({index,a:[0,0],b:[8,0],length:8,direction:[1,0],outward:[0,-1],baseZ,topZ});
  const edges=[edge(0,0,2.75),edge(1,3.05,5.75)];
  const layout={baseZ:0,floorZ:0,firstFloorZ:3.05,edges,front:edges[0],rear:edges[1],
    windows:[
      {id:'ground-window',kind:'window',edgeIndex:0,lo:2,hi:3.2,z:.8,height:1.5},
      {id:'upstairs-window',kind:'window',edgeIndex:1,lo:2,hi:3.2,z:3.85,height:1.5},
      {id:'actual-balcony-door',kind:'balcony-door',edgeIndex:1,lo:5.2,hi:6.4,z:3.05,height:2.2},
    ],door:{id:'actual-entrance',kind:'door',edgeIndex:0,lo:5.4,hi:6.3,centre:5.85,z:0,height:2.1}};
  for(const style of styles){
    const parts=houseRenovationParts(layout,style);
    checkClearance(parts,layout);
    assert.ok(parts.some(p=>p.edgeIndex===0)&&parts.some(p=>p.edgeIndex===1),style.id);
    assert.ok(parts.every(p=>p.bottom>=edges[p.edgeIndex].baseZ&&p.top<=edges[p.edgeIndex].topZ));
  }
});

test('extreme floor heights, balcony thresholds, entry landings and wide portal stay clear',()=>{
  for(const {data,model} of sites){
    for(const floorHeight of [model.FIELDS.floorHeight.min,model.FIELDS.floorHeight.max]){
      const settings={...model.DEFAULTS,floorHeight,
        firstFloorRise:floorHeight===0?model.FIELDS.firstFloorRise.min:model.FIELDS.firstFloorRise.max,
        basementGarageEnabled:true,garageRampWidth:6,canopyEnabled:true,terraceCoverType:'balcony'};
      const layout=makeLayout(data,settings);
      for(const style of styles){
        const parts=houseRenovationParts(layout,style);
        checkClearance(parts,layout);
        if(!layout.entryAccess?.landing) continue;
        const edge=layout.front,door=layout.door;
        const distances=layout.entryAccess.landing.footprint.map(([x,y])=>(x-edge.a[0])*edge.direction[0]+(y-edge.a[1])*edge.direction[1]);
        for(const p of parts.filter(p=>p.edgeIndex===edge.index)){
          assert.ok(p.hi<=Math.min(...distances)||p.lo>=Math.max(...distances)||p.bottom>=door.z+door.height||p.top<=layout.baseZ);
        }
      }
    }
  }
});

test('batched solids project outwards, have front-facing normals, and render in vector fallback',()=>{
  for(const {data,model} of sites){
    const layout=makeLayout(data,model.DEFAULTS),style=getDesignStyle('gdansk-brick');
    const parts=houseRenovationParts(layout,style);
    const parent=new THREE.Group(),mesh=addHouseRenovation(parent,layout,style);
    const position=mesh.geometry.attributes.position,normal=mesh.geometry.attributes.normal;
    assert.equal(parent.children.length,1);
    assert.equal(position.count,parts.length*30); // front plus four returns per solid
    assert.ok(mesh.material.every(m=>m.userData.transient&&m.vertexColors&&m.map&&m.normalMap));
    assert.ok(mesh.geometry.groups.length<=6,'Facade finishes are batched, never one draw per board');
    const ordered=[...new Set(parts.map(p=>p.finish))].flatMap(finish=>parts.filter(p=>p.finish===finish));
    for(const [i,p] of ordered.entries()){
      const edge=layout.edges[p.edgeIndex],j=i*30;
      near(normal.getX(j),edge.outward[0],1e-4);near(normal.getY(j),0);near(normal.getZ(j),edge.outward[1],1e-4);
      for(let k=j;k<j+30;k++){
        const x=position.getX(k)-edge.a[0],y=position.getZ(k)-edge.a[1],z=position.getY(k);
        const d=x*edge.direction[0]+y*edge.direction[1],offset=x*edge.outward[0]+y*edge.outward[1];
        assert.ok(d>=p.lo-2e-5&&d<=p.hi+2e-5&&z>=p.bottom-2e-5&&z<=p.top+2e-5);
        near(offset,k<j+6?p.depth:(offset>.0081?p.depth:.008));
      }
    }
    const svg=addHouseRenovation(new THREE.Group(),layout,style,{svgMode:true});
    assert.ok(svg.geometry.attributes.position.count<position.count);
    assert.deepEqual(svg.userData,mesh.userData);
    for(const m of [mesh,svg]){m.geometry.dispose();for(const material of m.material)material.dispose();}
  }
});

test('actual house mesh leaves the two-car aperture open across its full width and height',()=>{
  const {data,model}=sites[0],settings={...model.DEFAULTS,basementGarageEnabled:true};
  const layout=makeLayout(data,settings),edge=layout.front,portal=layout.portal;
  assert.ok(portal?.width>=5.8);
  const style=getDesignStyle('mediterranean-villa'),group=new THREE.Group();
  const mesh=addHouseRenovation(group,layout,style);
  const inward=new THREE.Vector3(-edge.outward[0],0,-edge.outward[1]);
  for(const f of [.005,.25,.5,.75,.995])for(const h of [.005,.5,.995]){
    const sample=facadePoint(edge,portal.lo+f*portal.width,portal.z+h*portal.height,.22);
    const origin=new THREE.Vector3(...toWorld(...sample));
    assert.equal(new THREE.Raycaster(origin,inward,0,.25).intersectObject(mesh).length,0);
  }
  mesh.geometry.dispose();for(const material of mesh.material)material.dispose();
});

test('current and disabled house treatments restore original surfaces and add no objects',()=>{
  const {data,model}=sites[0],base=model.DEFAULTS;
  const original=createPhotoHouseGroup(data,base,{terrainAt});
  const originalPalette=original.children.map(m=>[m.name,m.material?.color?.getHex(),m.geometry?.attributes.position.count]);
  const cases=[
    [{...base,designStyle:'current',styleHouseFinish:true},{}],
    [{...base,designStyle:'hidden-bali',styleHouseFinish:false},{}],
    [{...base,designStyle:'hidden-bali',styleHouseFinish:true},{style:null}],
  ];
  for(const [settings,options] of cases){
    const restored=createPhotoHouseGroup(data,settings,{terrainAt,...options});
    assert.equal(restored.getObjectByName('house-renovation'),undefined);
    assert.deepEqual(restored.children.map(m=>[m.name,m.material?.color?.getHex(),m.geometry?.attributes.position.count]),originalPalette);
  }
  const styled=createPhotoHouseGroup(data,{...base,designStyle:'hidden-bali',styleHouseFinish:true},{terrainAt});
  assert.ok(styled.getObjectByName('house-renovation'));
  assert.notEqual(styled.getObjectByName('house-wall-0-plaster').material.color.getHex(),original.getObjectByName('house-wall-0-plaster').material.color.getHex());
  for(const name of ['house-measured-terracotta-roof','house-wall-0-plaster','front-living-west-glass','house-entrance-door']){
    assert.deepEqual(styled.getObjectByName(name).geometry.attributes.position.array,original.getObjectByName(name).geometry.attributes.position.array);
  }
});
