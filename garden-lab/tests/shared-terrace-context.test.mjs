import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {batchGardenBoxes} from '../src/scene-static-details.js';
import {cloneOwnedScene} from '../src/scene-house-model.js';

test('a shared terrace stays separate through garden batching and retains its tub aperture in drawing coordinates',()=>{
  const site=new THREE.Group(),terrace=new THREE.Group(),stone=new THREE.MeshStandardMaterial();
  terrace.name='shared-ground-terrace';site.add(terrace);
  const box=(group,x,z,width,depth,name='')=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,.2,depth),stone);
    mesh.position.set(x+width/2,1.1,z+depth/2);mesh.castShadow=mesh.receiveShadow=true;mesh.name=name;group.add(mesh);return mesh;
  };
  // Four measured deck pieces surround an open 2 x 2 m tub well.
  box(terrace,0,0,2,4);box(terrace,4,0,3,4);box(terrace,2,0,2,1);box(terrace,2,3,2,1);
  const seat=box(terrace,5,1,.8,2,'terrace-daybed');seat.position.y=1.5;
  for(let i=0;i<4;i++)box(site,8+i,10,.7,2);
  const bounds=new THREE.Box3().setFromObject(terrace,true);
  assert.equal(batchGardenBoxes(terrace),3);assert.equal(batchGardenBoxes(site),3);
  assert.equal(site.getObjectByName('shared-ground-terrace'),terrace);
  assert.equal(terrace.children.length,2,'Only the terrace slab batch and its furniture belong to the cutaway');
  const owned=cloneOwnedScene([terrace]);
  const frame=new THREE.Matrix4().compose(new THREE.Vector3(11,3,7),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.23),new THREE.Vector3(1,1,1));
  const inverse=frame.clone().invert();owned.root.applyMatrix4(inverse);owned.root.updateMatrixWorld(true);
  const rayAt=(x,z)=>new THREE.Raycaster(new THREE.Vector3(x,3,z).applyMatrix4(inverse),new THREE.Vector3(0,-1,0).transformDirection(inverse),0,5).intersectObject(owned.root,true);
  assert.ok(rayAt(1,2).length>0,'The terrace slab survives the drawing-to-site transform');
  assert.equal(rayAt(3,2).length,0,'Batching and context cloning must preserve the real tub opening');
  assert.ok(rayAt(5.3,1.5).length>0,'The actual terrace furniture accompanies its slab');
  assert.equal(rayAt(8.3,11).length,0,'Distant pool and garden furniture are excluded from this cutaway');
  owned.root.applyMatrix4(frame);owned.root.updateMatrixWorld(true);
  const clonedBounds=new THREE.Box3().setFromObject(owned.root,true);
  assert.ok(bounds.min.distanceTo(clonedBounds.min)<1e-6&&bounds.max.distanceTo(clonedBounds.max)<1e-6);
  let originalDisposed=false;stone.addEventListener('dispose',()=>originalDisposed=true);
  owned.dispose();assert.equal(originalDisposed,false,'Closing the interior must not dispose the exterior finish');
  site.traverse(o=>o.geometry?.dispose());stone.dispose();
});
