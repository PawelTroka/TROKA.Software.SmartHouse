import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from '../vendor/three.module.js';
import {DESIGN_STYLES,getDesignStyle} from '../src/design-styles.js';
import {EXTERIOR_SURFACES,getExteriorSurfaceSpec,getBalconyGuardRecipe} from '../src/exterior-recipes.js';
import {exteriorSurfacePixels,applyExteriorSurface} from '../src/exterior-materials.js';
import {proposedMaterials,disposeProposedMaterials} from '../src/scene-static-details.js';
import {createStyledDining} from '../src/scene-style-details.js';
import {createTerraceCoverGroup} from '../src/scene-terrace-cover.js';
import {terraceCoverLayout,terraceCoverIntersection} from '../src/terrace-cover.js';

const digest=values=>createHash('sha256').update(values).digest('hex');
const styles=DESIGN_STYLES.filter(s=>s.id!=='current');
const base=()=>Object.fromEntries(['stone','stoneLight','wood','woodLight','metal','linen','wall','roof','plinth'].map(role=>[role,new THREE.MeshStandardMaterial()]));

test('all twenty renovations have coherent construction and furnishing specifications independent of colour',()=>{
  assert.equal(Object.keys(EXTERIOR_SURFACES).length,20);
  assert.equal(new Set(styles.map(s=>JSON.stringify(s.construction))).size,20);
  assert.equal(getExteriorSurfaceSpec('current'),null);
  for(const style of styles){
    assert.ok(Object.isFrozen(style.construction));
    for(const key of ['wall','roof','wood','paving','fabric','metal','coverage','dining','guard'])assert.ok(style.construction[key],style.id+' '+key);
    assert.ok(getBalconyGuardRecipe(style).keepClearGlass);
  }
  assert.equal(getBalconyGuardRecipe('current').form,'original');
});

test('proposed finishes contain distinct physical relief and deterministic colour pixels, with bounded texture memory',()=>{
  const types=['teak','silvered-wood','charred-wood','clinker','terracotta','terracotta-roof','slate','board-concrete','standing-seam','terrazzo','limewash','woven','boucle','linen'];
  const maps=types.map(type=>exteriorSurfacePixels(type));
  assert.equal(new Set(maps.map(m=>digest(m.color))).size,types.length);
  assert.ok(new Set(maps.map(m=>digest(m.normals))).size>=12);
  for(const [i,m]of maps.entries()){
    assert.equal(m.size,128);assert.equal(m.color.length,128*128*4);
    assert.equal(digest(m.color),digest(exteriorSurfacePixels(types[i]).color));
    assert.ok(new Set(Array.from(m.relief).filter((_,j)=>j%4===0)).size>2,types[i]+' has visible relief, with polished materials deliberately flatter');
  }
});

test('renovation textures and reflectance change and every owned map is disposed when current is restored',()=>{
  const neutral=base(),style=getDesignStyle('hidden-bali');
  assert.equal(proposedMaterials(neutral,getDesignStyle('current')),neutral);
  const materials=proposedMaterials(neutral,style),textures=new Set();
  for(const role of ['wall','roof','wood','linen','deck','metal']){
    const m=materials[role];assert.ok(m.map&&m.normalMap);
    assert.equal(m.map.colorSpace,THREE.SRGBColorSpace);assert.equal(m.normalMap.colorSpace,THREE.NoColorSpace);
    assert.notEqual(m.map,neutral[role]?.map);
  }
  assert.ok(materials.metal.metalness>.3&&materials.linen.metalness===0);
  for(const m of Object.values(materials))for(const key of ['map','normalMap'])if(m[key])textures.add(m[key]);
  const disposed=new Set();for(const t of textures)t.addEventListener('dispose',()=>disposed.add(t));
  disposeProposedMaterials(materials,neutral);
  assert.equal(disposed.size,textures.size);
  assert.equal(proposedMaterials(neutral,getDesignStyle('current')),neutral);
  assert.equal(neutral.wall.map,null);
  const original=new THREE.MeshStandardMaterial({color:'#887766'}),color=original.color.getHex();
  applyExteriorSurface(original,'current','wall');assert.equal(original.map,null);assert.equal(original.color.getHex(),color);
  for(const m of Object.values(neutral))m.dispose();original.dispose();
});

test('outdoor dining actually changes between round tables, six-place tables and banquette arrangements',()=>{
  const m={...base(),styleAccent:new THREE.MeshStandardMaterial()},compositions=new Set(),geometries=new Set();
  for(const style of styles){
    const group=createStyledDining(style,m,{x:0,y:0,z:0,width:3.5,length:2.8});
    compositions.add(group.userData.composition);
    const hash=createHash('sha256');group.traverse(mesh=>{if(mesh.geometry)hash.update(Buffer.from(mesh.geometry.attributes.position.array.buffer));});geometries.add(hash.digest('hex'));
    assert.equal(group.userData.seats,style.construction.dining==='round-four'?4:6);
    const bounds=new THREE.Box3().setFromObject(group);
    assert.ok(bounds.min.x>=-1e-5&&bounds.max.x<=3.5+1e-5&&bounds.min.z>=-1e-5&&bounds.max.z<=2.8+1e-5);
    group.traverse(mesh=>mesh.geometry?.dispose());
  }
  assert.equal(compositions.size,6);assert.ok(geometries.size>=16,'Differences must exist in the vertices, not just materials');
  for(const material of Object.values(m))material.dispose();
});

test('balcony styles change guard geometry while retaining the same clear panels and structural analytical boxes',()=>{
  const fixture={site:{id:'sternicza-11',terrace:{x:5,width:10.77,depth:4},rearMidpoint:[10.385,20]}};
  const layout=terraceCoverLayout({canopyEnabled:true,terraceCoverType:'balcony',canopyWidth:10.77,canopyDepth:4,firstFloorRise:3.05,terraceDepth:4},fixture,{floorZ:10});
  const snapshot=JSON.stringify(layout.boxes),m=base(),shapes=new Set();
  for(const style of [getDesignStyle('current'),...styles]){
    const group=createTerraceCoverGroup(layout,m,false,style),infill=group.getObjectByName('balcony-style-infill');
    assert.equal(group.children.length,layout.boxes.length+(infill?1:0));
    assert.equal(JSON.stringify(layout.boxes),snapshot,'Appearance never mutates the shade/privacy model');
    for(const primitive of layout.boxes){
      const mesh=group.getObjectByName(primitive.id),b=new THREE.Box3().setFromObject(mesh);
      assert.ok(Math.abs(b.min.x-primitive.x0)<1e-5&&Math.abs(b.max.x-primitive.x1)<1e-5);
      assert.ok(Math.abs(b.min.y-primitive.z0)<1e-5&&Math.abs(b.max.y-primitive.z1)<1e-5);
      assert.ok(Math.abs(b.min.z-primitive.y0)<1e-5&&Math.abs(b.max.z-primitive.y1)<1e-5);
      assert.equal(mesh.castShadow,primitive.opaque);
      if(primitive.part==='glass')assert.ok(mesh.material.transparent&&mesh.material.opacity<.25);
    }
    if(infill){
      const b=new THREE.Box3().setFromObject(infill),g=infill.geometry;
      assert.ok(b.min.x>=layout.bounds.x0&&b.max.x<=layout.bounds.x1&&b.min.z>=layout.bounds.y0&&b.max.z<=layout.bounds.y1);
      assert.ok(b.min.y>=layout.deckTopZ+.07&&b.max.y<=layout.deckTopZ+layout.guardHeight);
      assert.equal(infill.castShadow,false);assert.equal(infill.userData.terraceCover.analytical,false);
      assert.ok(infill.material===m.wood||infill.material===m.metal,'No redundant guard finish material is allocated');
      assert.ok(g.attributes.position.count<40000,'All decorative infill is one bounded mesh');
      shapes.add(digest(Buffer.from(g.attributes.position.array.buffer)));
    }else assert.ok(['original','glass'].includes(getBalconyGuardRecipe(style).form));
    const pane=layout.boxes.find(p=>p.part==='glass'),x=(pane.x0+pane.x1)/2,y=(pane.y0+pane.y1)/2,z=(pane.z0+pane.z1)/2;
    assert.equal(terraceCoverIntersection([x,y-.5,z],[x,y+.5,z],layout),null);
    const owned=new Set();group.traverse(mesh=>{mesh.geometry?.dispose();if(mesh.material?.userData.transient)owned.add(mesh.material);});
    for(const material of owned)material.dispose();
  }
  assert.equal(shapes.size,4,'Vertical timber, fine pickets, horizontal timber and Deco have different vertices');
  for(const material of Object.values(m))material.dispose();
});
