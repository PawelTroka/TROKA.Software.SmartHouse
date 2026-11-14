import test from 'node:test';
import assert from 'node:assert/strict';
import {replaceTreeSpecies,applyTreeEdit} from '../src/tree-selection.js';
import {getTreeType} from '../src/tree-catalog.js';
import {screeningTreeUnitPrice} from '../src/costs.js';

test('species comparison keeps placement and inclusion while dropping the old specimen quote',()=>{
  const original=Object.freeze([
    Object.freeze({id:'first',typeId:'austrian-pine-tall',x:19.3,y:30.2,height:10,crownBase:2.5,crownWidth:6,crownDepth:5,rotation:27,enabled:true,unitPrice:61000}),
    Object.freeze({id:'second',typeId:'austrian-pine-tall',x:13.8,y:35.8,height:10,crownBase:2.5,crownWidth:6,crownDepth:6,rotation:0,enabled:false,unitPrice:60000}),
  ]);
  const one=replaceTreeSpecies(original,'thuja-excelsa-9m','first');
  assert.deepEqual([one[0].x,one[0].y,one[0].rotation,one[0].enabled],[19.3,30.2,27,true]);
  assert.equal(one[0].height,9);assert.equal(one[0].crownWidth,2);assert.equal(one[0].unitPrice,0);
  assert.deepEqual(one[1],original[1]);assert.notEqual(one[1],original[1]);
  const all=replaceTreeSpecies(original,'white-fir-9m');
  assert.ok(all.every(tree=>tree.typeId==='white-fir-9m'&&tree.unitPrice===0));
  assert.deepEqual(all.map(tree=>[tree.id,tree.x,tree.y,tree.enabled]),original.map(tree=>[tree.id,tree.x,tree.y,tree.enabled]));
  assert.equal(all[1].crownWidth,getTreeType('white-fir-9m').dimensions.crownWidth);
  assert.equal(original[0].unitPrice,61000);
  assert.throws(()=>replaceTreeSpecies(original,'unknown'),RangeError);
});

test('resizing clears a specimen quote and restores the quote gate; moving does not',()=>{
  const tree=Object.freeze({id:'quoted',typeId:'thuja-excelsa-9m',x:19.3,y:30.2,...getTreeType('thuja-excelsa-9m').dimensions,rotation:0,enabled:true,unitPrice:9500});
  for(const key of ['height','crownBase','crownWidth','crownDepth'])
    assert.equal(applyTreeEdit(tree,{[key]:tree[key]+1}).unitPrice,0,key);
  const wide=applyTreeEdit(tree,{crownWidth:6});
  assert.equal(screeningTreeUnitPrice(wide).status,'quote-required');
  assert.equal(applyTreeEdit(tree,{height:tree.height}).unitPrice,9500,'No size change preserves the quote');
  assert.equal(applyTreeEdit(tree,{x:17,y:33,rotation:45,enabled:false}).unitPrice,9500);
  assert.equal(applyTreeEdit(wide,{unitPrice:18000}).unitPrice,18000,'A new explicit quote can price edited dimensions');
  assert.equal(tree.crownWidth,2);assert.equal(tree.unitPrice,9500);
});
