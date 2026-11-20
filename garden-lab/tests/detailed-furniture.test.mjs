import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {beveledBoxGeometry,cushionGeometry,cushionPipingGeometry,wovenPanelGeometry} from '../src/detailed-geometry.js';
import {createStyledLounger,createStyledDining} from '../src/scene-style-details.js';
import {getDesignStyle} from '../src/design-styles.js';

function validSurface(g){
  for(const attribute of Object.values(g.attributes))assert.ok(Array.from(attribute.array).every(Number.isFinite));
  const p=g.attributes.position,n=g.attributes.normal,a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),normal=new THREE.Vector3();
  const at=i=>g.index?g.index.getX(i):i;
  for(let i=0;i<(g.index?.count??p.count);i+=3){
    const ia=at(i),ib=at(i+1),ic=at(i+2);
    a.fromBufferAttribute(p,ia);b.fromBufferAttribute(p,ib).sub(a);c.fromBufferAttribute(p,ic).sub(a);b.cross(c);
    assert.ok(b.lengthSq()>1e-20,'No degenerate triangles at seams or poles');
    normal.fromBufferAttribute(n,ia).add(new THREE.Vector3().fromBufferAttribute(n,ib)).add(new THREE.Vector3().fromBufferAttribute(n,ic));
    assert.ok(b.dot(normal)>0,'Winding and shading normals agree');
  }
}
function inside(g,w,h,d){
  g.computeBoundingBox();const b=g.boundingBox;
  for(const [axis,size]of [['x',w],['y',h],['z',d]]){
    assert.ok(b.min[axis]>=-size/2-1e-6,axis+' lower envelope');assert.ok(b.max[axis]<=size/2+1e-6,axis+' upper envelope');
  }
}

test('metre edge radii keep long tabletops and small timber rails within their original solids',()=>{
  for(const dims of [[2.4,.045,.93],[.045,.65,.055],[.7,.25,2.0]]){
    const g=beveledBoxGeometry(...dims,{radius:.003,segments:2});
    inside(g,...dims);validSurface(g);
    assert.ok(g.attributes.position.count<400,'Detail budget is independent of member length');g.dispose();
  }
});

test('seat, back and side upholstery is closed, smoothly shaded, deterministic and bounded with its welt',()=>{
  const dims=[.81,.17,.74];
  for(const axis of ['x','y','z']){
    const g=cushionGeometry(...dims,{axis}),seam=cushionPipingGeometry(...dims,{axis});
    inside(g,...dims);inside(seam,...dims);validSurface(g);validSurface(seam);
    const same=cushionGeometry(...dims,{axis});assert.deepEqual(g.attributes.position.array,same.attributes.position.array);
    const material=new THREE.MeshBasicMaterial(),mesh=new THREE.Mesh(g,material);
    for(const direction of [new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)]){
      const ray=new THREE.Raycaster(direction.clone().multiplyScalar(2),direction.clone().negate());
      assert.ok(ray.intersectObject(mesh).length>0,'All outward sides of the cushion are visible');
    }
    assert.ok((g.index.count+seam.index.count)/3<1800,'A sewn cushion uses a bounded triangle budget');
    g.dispose();seam.dispose();same.dispose();material.dispose();
  }
});

test('woven panels contain real holes and front/back reeds without changing the measured panel bounds',()=>{
  const g=wovenPanelGeometry(.8,.4,{pitch:.04}),material=new THREE.MeshBasicMaterial(),mesh=new THREE.Mesh(g,material);
  inside(g,.8,.4,.007);validSurface(g);
  const hit=(x,y,sign)=>new THREE.Raycaster(new THREE.Vector3(x,y,sign),new THREE.Vector3(0,0,-sign)).intersectObject(mesh);
  assert.equal(hit(0,0,1).length,0,'The opening remains transparent without an alpha texture');
  for(const sign of [-1,1])assert.ok(hit(.02,0,sign).length>0,'Reeds exist on both sides');
  g.dispose();material.dispose();
});

test('Bali, Coastal and Modern furniture retain their distinct forms and batch the new textile finish',()=>{
  const roles=['metal','wood','woodLight','stone','stoneLight','linen','styleAccent','fabricAccent'];
  const m=Object.fromEntries(roles.map(role=>[role,new THREE.MeshStandardMaterial()]));
  const signatures=[];
  for(const id of ['hidden-bali','coastal','modern-minimal']){
    const r={x:0,y:0,z:0,width:.78,length:2},group=createStyledLounger(getDesignStyle(id),m,r);
    const b=new THREE.Box3().setFromObject(group);
    assert.ok(b.min.x>=-1e-6&&b.max.x<=r.width+1e-6&&b.min.z>=-1e-6&&b.max.z<=r.length+1e-6);
    assert.ok(group.children.length<=6,'Surface detail does not multiply draws per component');
    signatures.push(group.children.reduce((sum,n)=>sum+n.geometry.attributes.position.count,0));
    if(id==='coastal')assert.ok(group.children.some(n=>n.material===m.fabricAccent),'Coastal pillows use a fabric finish');
    const dining=createStyledDining(getDesignStyle(id),m,{...r,width:3.5,length:2.8});
    assert.equal(dining.userData.seats,6);
    for(const root of [group,dining])root.traverse(n=>n.geometry?.dispose());
  }
  assert.equal(new Set(signatures).size,3);Object.values(m).forEach(material=>material.dispose());
});
