import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from '../vendor/three.module.js';
import {contextGroundUV,projectContextGroundUVs} from '../src/context-ground.js';

const source=JSON.parse(readFileSync(new URL('../data/sternicza-ground-colour.json',import.meta.url)));
test('measured ground colour preserves north-up source registration in the rotated site frame',()=>{
  const expected=[[0,1],[1,1],[1,0],[0,0]];
  source.cornersXY.forEach(([x,y],i)=>{
    const uv=contextGroundUV(x,y,source.coordinates,source.boundsEN);
    assert.ok(Math.abs(uv[0]-expected[i][0])<1e-8,`${source.cornerOrder[i]} u`);
    assert.ok(Math.abs(uv[1]-expected[i][1])<1e-8,`${source.cornerOrder[i]} v`);
  });
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(source.cornersXY.flatMap(([x,y])=>[x,12,y]),3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(8),2));
  projectContextGroundUVs(geometry,source);
  expected.forEach(([u,v],i)=>{
    assert.ok(Math.abs(geometry.attributes.uv.getX(i)-u)<1e-6);
    assert.ok(Math.abs(geometry.attributes.uv.getY(i)-v)<1e-6);
    assert.equal(geometry.attributes.position.getY(i),12,'Colour mapping must not change terrain elevations');
  });
  geometry.dispose();
});
test('ground texture matches its retained source checksum and distinguishes inferred fill',()=>{
  const bytes=readFileSync(new URL('../data/sternicza-ground-colour.png',import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),source.sha256);
  assert.equal(source.sourceClass,2);
  assert.equal(source.rowOrder,'north-to-south');
  assert.ok(source.visibleMeasuredCells>source.visibleNearestFilledCells*100);
  assert.ok(source.maximumNearestFillDistanceM<=4);
});
