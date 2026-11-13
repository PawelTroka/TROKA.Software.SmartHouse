import test from 'node:test';
import assert from 'node:assert/strict';
import {contextFacadePlacements} from '../src/scene.js';
import {pointInPolygon} from '../src/geometry.js';

const building={id:'across-street-house',index:5,kind:'context',baseZ:2.7,roofZ:9.2,
  footprint:[[2,-25],[14,-25],[14,-16],[2,-16],[2,-25]]};

test('nearby context houses receive aligned windows even when they are not privacy targets',()=>{
  for(const footprint of [building.footprint,[...building.footprint].reverse()]){
    const source={...building,footprint},before=structuredClone(source);
    const panes=contextFacadePlacements(source,[10,15]);
    assert.ok(panes.length>8);
    for(const pane of panes){
      assert.equal(pointInPolygon([pane.x+pane.nx*.1,pane.y+pane.ny*.1],footprint),false,
        'Illustrative windows must face outward for either ring winding');
      assert.ok(pane.z-pane.height/2>building.baseZ);
      assert.ok(pane.z+pane.height/2<building.roofZ);
      assert.ok(Math.abs(Math.hypot(pane.nx,pane.ny)-1)<1e-9);
    }
    assert.deepEqual(source,before,'Finishes cannot change mapped footprint or elevations');
  }
});

test('short and height-adjusted bodies keep openings within the exact source envelope',()=>{
  assert.equal(contextFacadePlacements({...building,roofZ:building.baseZ+2.2},[10,15]).length,0);
  const single=contextFacadePlacements({...building,roofZ:building.baseZ+3.3},[10,15]);
  assert.ok(single.length>0,'A one-storey house should not be an unwindowed block');
  assert.equal(new Set(single.map(p=>p.z)).size,1);
  const adjusted={...building,roofZ:building.baseZ+9.75,adjustment:{scaleZ:1.5}};
  for(const pane of contextFacadePlacements(adjusted,[10,15])){
    assert.ok(pane.z-pane.height/2>adjusted.baseZ);
    assert.ok(pane.z+pane.height/2<adjusted.roofZ);
  }
});

test('distant decoration is bounded while nearby façade detail stays available',()=>{
  assert.ok(contextFacadePlacements(building,[10,15]).some(p=>p.detailed));
  assert.ok(contextFacadePlacements(building,[10,100]).every(p=>!p.detailed));
  assert.equal(contextFacadePlacements(building,[10,300]).length,0);
});
