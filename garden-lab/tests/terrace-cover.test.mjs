import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {BALCONY_ASSUMPTIONS,terraceCoverType,terraceCoverLayout,terraceCoverIntersection,terraceCoverViewpoint} from '../src/terrace-cover.js';
import {createTerraceCoverGroup} from '../src/scene-terrace-cover.js';
import {floorElevation,gardenGroundAt,jacuzziBounds} from '../src/geometry.js';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-5,`${actual} differs from ${expected}`);
const fixture={site:{id:'sternicza-11',terrace:{x:5,width:8.5,depth:4},rearMidpoint:[9.25,20],boundary:[[0,0],[30,0],[30,40],[0,40],[0,0]]}};
const base={canopyEnabled:true,terraceCoverType:'balcony',canopyWidth:8.5,canopyDepth:4,canopyHeight:3,firstFloorRise:3,terraceDepth:4};
const context={floorZ:10,groundAt:()=>8};
const make=(settings={},ctx={})=>terraceCoverLayout({...base,...settings},fixture,{...context,...ctx});
const materials=Object.fromEntries(['wood','metal','stoneLight'].map(name=>[name,new THREE.MeshBasicMaterial()]));
const overlaps=(a,b)=>a.x0<b.x1&&a.x1>b.x0&&a.y0<b.y1&&a.y1>b.y0;

test('one cover selector replaces the canopy and the existing off switch empties both modes',()=>{
  for(const terraceCoverType of ['canopy','balcony']){
    const layout=make({terraceCoverType});
    assert.equal(layout.enabled,true);
    assert.ok(layout.boxes.every(box=>box.type===terraceCoverType));
    assert.equal(layout.boxes.some(box=>box.part==='roof'),terraceCoverType==='canopy');
    assert.equal(layout.boxes.some(box=>box.part==='slab'),terraceCoverType==='balcony');
    const off=make({terraceCoverType,canopyEnabled:false});
    assert.equal(off.enabled,false);assert.equal(off.boxes.length,0);assert.equal(off.supports.length,0);
    assert.equal(terraceCoverViewpoint(off),null);
    assert.equal(createTerraceCoverGroup(off,materials).children.length,0);
  }
});

test('balcony is limited to Sternicza and old settings retain a canopy',()=>{
  assert.equal(terraceCoverType({canopyEnabled:true},fixture),'canopy');
  assert.equal(terraceCoverType({...base,terraceCoverType:'unknown'},fixture),'canopy');
  for(const id of ['nadmorska-17','korzeniowskiego-40']){
    const other={site:{...fixture.site,id}};
    assert.equal(terraceCoverType(base,other),'canopy');
    const layout=terraceCoverLayout(base,other,context);
    assert.equal(layout.boxes.some(box=>box.part==='slab'),false);
    assert.equal(terraceCoverViewpoint(layout),null);
  }
});

test('balcony deck and access follow the first floor, independently of canopy height or garden fill',()=>{
  const layout=make({canopyHeight:5.8});
  near(layout.deckTopZ,13);near(layout.access.z,13);near(layout.access.y,20);
  near(layout.deckThickness,.25);near(layout.deckArea,34);
  near(layout.clearBelow,2.75);near(layout.minimumCoveredHeight,2.51);
  const slab=layout.boxes.find(box=>box.part==='slab');
  near(slab.z0,12.75);near(slab.z1,13);
  const changed=make({firstFloorRise:3.4},{groundAt:()=>9});
  near(changed.deckTopZ,13.4);near(changed.access.z,13.4);
  near(changed.supports[0].z0,9);near(changed.supports[1].z0,10);near(changed.supports[2].z0,9);
  assert.equal(layout.access.proposed,true);
});

test('the balcony view stands on the usable deck and moves with the first-floor setting',()=>{
  const layout=make(),view=terraceCoverViewpoint(layout);
  assert.equal(view.preset,'balcony');assert.equal(view.surface,'balcony');
  near(view.groundZ,13);near(view.z,14.65);
  assert.ok(view.x>layout.bounds.x0&&view.x<layout.bounds.x1);
  assert.ok(view.y>layout.bounds.y0&&view.y<layout.bounds.y1);
  near(terraceCoverViewpoint(make({firstFloorRise:3.7}),1.2).z,14.9);
  assert.equal(terraceCoverViewpoint(make({terraceCoverType:'canopy'})),null);
});

test('the proposed guards have finite members and clear glazing gives no opaque privacy credit',()=>{
  const layout=make(),glass=layout.boxes.find(box=>box.id.includes('front-glass'));
  assert.ok(glass);assert.equal(glass.opaque,false);
  near(layout.guardHeight,BALCONY_ASSUMPTIONS.guardHeight);
  near(Math.max(...layout.boxes.filter(box=>box.part==='rail').map(box=>box.z1)),layout.deckTopZ+1.10);
  const x=(glass.x0+glass.x1)/2,y=(glass.y0+glass.y1)/2,z=layout.deckTopZ+.5;
  assert.equal(terraceCoverIntersection([x,y-.5,z],[x,y+.5,z],layout),null);
  const railZ=layout.deckTopZ+1.08;
  assert.equal(terraceCoverIntersection([x,y-.5,railZ],[x,y+.5,railZ],layout)?.part,'rail');
});

test('rays meet the actual balcony slab and posts without extending them into invisible screens',()=>{
  const layout=make(),x=(layout.bounds.x0+layout.bounds.x1)/2,y=layout.bounds.y0+1;
  assert.equal(terraceCoverIntersection([x,y,11],[x,y,15],layout)?.part,'slab');
  assert.equal(terraceCoverIntersection([layout.bounds.x1+2,y,11],[layout.bounds.x1+2,y,15],layout),null);
  const post=layout.supports[1],px=(post.x0+post.x1)/2,py=(post.y0+post.y1)/2,pz=(post.z0+post.z1)/2;
  assert.equal(terraceCoverIntersection([px,py-.5,pz],[px,py+.5,pz],layout)?.part,'post');
  assert.equal(terraceCoverIntersection([px+.5,py-.5,pz],[px+.5,py+.5,pz],layout),null);
  assert.equal(terraceCoverIntersection([x,y,11],[x,y,15],make({canopyEnabled:false})),null);
});

test('Sternicza balcony supports reach real ground, clear the spa service zone, and remain under the beam',()=>{
  const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
  const settings={...base,gardenProgram:'spa-pool-grove',gardenRaise:.5,floorHeight:1.2,jacuzziOverflow:true};
  const floorZ=floorElevation(settings,data),jacuzzi=jacuzziBounds(settings,data);
  const layout=terraceCoverLayout(settings,data,{floorZ,jacuzzi,groundAt:(x,y)=>gardenGroundAt(x,y,settings,data)});
  assert.equal(layout.supports.length,3);
  assert.deepEqual(layout.warnings,[]);
  assert.ok(layout.assumptions.some(text=>text.includes('jacuzzi service zone')));
  const beam=layout.boxes.find(box=>box.part==='beam');
  for(const [index,post]of layout.supports.entries()){
    assert.equal(overlaps(post,jacuzzi),false);assert.equal(overlaps(post,jacuzzi.serviceAccess),false);
    assert.ok(post.x0>=beam.x0-1e-8&&post.x1<=beam.x1+1e-8);
    near(post.z1,beam.z0);
    const x=(post.x0+post.x1)/2,y=(post.y0+post.y1)/2;
    near(post.z0,index===1?floorZ:gardenGroundAt(x,y,settings,data));
  }
});

test('an overextended or low balcony reports the concrete geometry conflict',()=>{
  const wide=make({canopyWidth:34});
  assert.ok(wide.warnings.some(text=>text.includes('outside the mapped plot')));
  const low=make({firstFloorRise:2.4});
  assert.ok(low.warnings.some(text=>text.includes('less than 2.20 m')));
  const post=make().supports[1];
  const collision=make({}, {jacuzzi:{x0:post.x0-.1,x1:post.x1+.1,y0:post.y0-.1,y1:post.y1+.1}});
  assert.ok(collision.warnings.some(text=>text.includes('overlaps the jacuzzi')));
});

test('rendered balcony and canopy members preserve exact analytical extents and glass casts no solid shadow',()=>{
  for(const terraceCoverType of ['canopy','balcony']){
    const layout=make({terraceCoverType}),group=createTerraceCoverGroup(layout,materials);
    assert.equal(group.children.length,layout.boxes.length);
    assert.equal(group.userData.terraceCoverType,terraceCoverType);
    for(const primitive of layout.boxes){
      const mesh=group.getObjectByName(primitive.id);
      assert.ok(mesh,`Missing rendered ${primitive.id}`);
      const bounds=new THREE.Box3().setFromObject(mesh);
      near(bounds.min.x,primitive.x0);near(bounds.max.x,primitive.x1);
      near(bounds.min.y,primitive.z0);near(bounds.max.y,primitive.z1);
      near(bounds.min.z,primitive.y0);near(bounds.max.z,primitive.y1);
      assert.equal(mesh.castShadow,primitive.opaque);assert.equal(mesh.receiveShadow,primitive.opaque);
      assert.equal(mesh.userData.terraceCover.opaque,primitive.opaque);
      if(primitive.part==='glass'){
        assert.equal(mesh.material.transparent,true);assert.equal(mesh.material.depthWrite,false);
        assert.equal(mesh.material.userData.transient,true);
        assert.ok(mesh.material.opacity<.25);
      }
    }
  }
});
