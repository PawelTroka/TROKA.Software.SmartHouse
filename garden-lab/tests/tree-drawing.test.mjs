import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {crownSliceInterval, treeSectionMarkup, treePlanMarkup} from '../src/tree-drawing.js';
import {createScreeningTreeGroup} from '../src/scene-trees.js';

const tree = {id:'tree-1',type:{label:'Broad pine'},x:10,y:20,height:7,crownBase:3,crownWidth:6,crownDepth:2,rotation:0,
  groundZ:2,crownBottomZ:5,crownTopZ:9,trunkTopZ:7,trunkRadius:.12,form:'ellipsoid',foliageActive:true,evergreen:true,plantable:true,enabled:true};
const near = (actual, expected) => assert.ok(Math.abs(actual-expected)<1e-6, `${actual} != ${expected}`);
const nearPair = (actual, expected) => actual.forEach((value,i) => near(value,expected[i]));

test('section is an actual finite crown cut, not a flattened off-plane tree',()=>{
  nearPair(crownSliceInterval(tree,[0,20],[1,0],7),[7,13]);
  assert.equal(crownSliceInterval(tree,[0,22],[1,0],7),null,'Plane beyond depth misses crown');
  assert.equal(crownSliceInterval(tree,[0,20],[1,0],4.99),null,'No foliage below the clear stem');
  const top = crownSliceInterval(tree,[0,20],[1,0],9);near(top[0],10);near(top[1],10);
  const rotated = crownSliceInterval({...tree,rotation:90},[0,20],[1,0],7);near(rotated[0],9);near(rotated[1],11);
});

test('spruce tapers and pleached panel keeps its finite rectangular cross-section',()=>{
  const cone={...tree,form:'cone'};
  nearPair(crownSliceInterval(cone,[0,20],[1,0],5),[7,13]);
  nearPair(crownSliceInterval(cone,[0,20],[1,0],7),[8.5,11.5]);
  nearPair(crownSliceInterval({...tree,form:'panel'},[0,20],[1,0],8.9),[7,13]);
});

test('SVG has independent tree selection and does not render an off-plane section crown',()=>{
  const frame={X:x=>x,Y:y=>y,scale:1};
  const plan=treePlanMarkup([tree],{...frame,interactive:true,selectedTreeId:'tree-1'});
  assert.match(plan,/data-screening-tree="tree-1"/);
  assert.match(plan,/aria-pressed="true"/);
  assert.match(plan,/role="button"/);
  const section={...frame,origin:[0,22],direction:[1,0],minS:0,maxS:30};
  assert.equal(treeSectionMarkup([tree],section),'');
  const winter=treeSectionMarkup([{...tree,foliageActive:false}],{...section,origin:[0,20]});
  assert.match(winter,/no foliage screening/);assert.match(winter,/stroke-dasharray/);
});

test('3D crown keeps the shared model height, clear stem and rotation',()=>{
  const material=new THREE.MeshBasicMaterial();
  const materials={bark:material,pine:material,spruce:material,deciduous:material,ghost:material};
  for(const form of ['ellipsoid','cone','panel']){
    const v={...tree,form,rotation:90};
    const group=createScreeningTreeGroup(v,materials);
    const crown=group.getObjectByName('crown-envelope');
    assert.ok(crown);group.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(crown);
    near(bounds.min.y,5);near(bounds.max.y,9);
    near(bounds.min.x,9);near(bounds.max.x,11);
    near(bounds.min.z,17);near(bounds.max.z,23);
    assert.equal(crown.castShadow,true);
    const winter=createScreeningTreeGroup({...v,foliageActive:false},materials);
    assert.equal(winter.getObjectByName('crown-envelope'),undefined);
    const invalid=createScreeningTreeGroup({...v,plantable:false},materials);
    assert.equal(invalid.getObjectByName('crown-envelope').castShadow,false);
  }
});
