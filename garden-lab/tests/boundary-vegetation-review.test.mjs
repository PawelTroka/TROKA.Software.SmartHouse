import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {DEFAULTS} from '../src/state.js';
import {hedgeSegments,hedgeGroundAt,hedgeTopAt} from '../src/geometry.js';
import {boundaryFenceLayout} from '../src/boundary-fence.js';
import {createHedgeVegetation} from '../src/scene-vegetation.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const material=new THREE.MeshStandardMaterial({color:'#87986b'});
const settings={...DEFAULTS,designStyle:'warm-minimal'};
const segments=hedgeSegments(settings,data);
const options={material,spacing:settings.costSpacing,
  groundAt:(x,y,s)=>hedgeGroundAt(x,y,s.side,settings,data,s.groundZone),
  topAt:(x,y,s)=>hedgeTopAt(x,y,s.side,settings,data,s.groundZone)};
const matrices=group=>group.children.flatMap(mesh=>Array.from({length:mesh.count},(_,i)=>
  Array.from(mesh.instanceMatrix.array.slice(i*16,i*16+16)).join(','))).sort();
const dispose=group=>{const materials=new Set();group.traverse(o=>{o.geometry?.dispose();if(o.material)materials.add(o.material);});for(const m of materials)m.dispose();};

test('fence pruning preserves every planted instance while exposing the fixed front and parked gate leaves',()=>{
  const fence=boundaryFenceLayout(settings,data),before=createHedgeVegetation(segments,options),after=createHedgeVegetation(segments,{...options,fence});
  try{
    assert.deepEqual(matrices(after),matrices(before),'No stem centre, planted height or instance transform can move');
    assert.equal(after.userData.plantCount,before.userData.plantCount);
    assert.ok(after.userData.drawCalls<=before.userData.drawCalls*3,'Pruned variants remain instanced in a bounded number of batches');
    const fixedInside=fence.inset+Math.max(.075,fence.style.pier/2+.009)+.025;
    const garage=fence.gates.find(g=>g.kind==='garage'),parked=garage.leaves.map(l=>({left:Math.min(l.a[0],l.b[0]),right:Math.max(l.a[0],l.b[0]),inside:l.a[1]+.075}));
    let frontVertices=0,prunedVertices=0;
    const matrix=new THREE.Matrix4(),vertex=new THREE.Vector3(),centre=new THREE.Vector3();
    for(const mesh of after.children){
      assert.equal(mesh.castShadow,false,'The analytical hedge continues to own privacy and shadow coverage');
      if(mesh.geometry.userData.outwardTrim!==undefined)prunedVertices+=mesh.geometry.attributes.position.count;
      for(let i=0;i<mesh.count;i++){
        mesh.getMatrixAt(i,matrix);centre.setFromMatrixPosition(matrix);
        if(Math.abs(centre.z-(settings.hedgeInset+.14))>.001)continue;
        const p=mesh.geometry.attributes.position;
        for(let j=0;j<p.count;j++){
          vertex.fromBufferAttribute(p,j).applyMatrix4(matrix);frontVertices++;
          assert.ok(vertex.z>=fixedInside-1e-6,'Actual foliage triangles stay inside the fence piers plus the gap');
          for(const leaf of parked)if(vertex.x>leaf.left&&vertex.x<leaf.right)
            assert.ok(vertex.z>=leaf.inside-1e-6,'Open telescoping leaves remain in front of the pruned hedge face');
          for(const gate of fence.gates)assert.ok(vertex.x<=gate.a[0]+1e-6||vertex.x>=gate.b[0]-1e-6,'The original gate gaps remain clear');
        }
      }
    }
    assert.ok(frontVertices>10000&&prunedVertices>10000,'Inspect the actual cut-out foliage triangles');
  }finally{dispose(before);dispose(after);}
});

test('a disabled fence leaves the original hedge assets and batching unchanged',()=>{
  const a=createHedgeVegetation(segments,options),b=createHedgeVegetation(segments,{...options,fence:boundaryFenceLayout({...settings,perimeterFenceEnabled:false},data)});
  try{
    assert.equal(a.children.length,b.children.length);
    for(let i=0;i<a.children.length;i++){
      assert.deepEqual(a.children[i].instanceMatrix.array,b.children[i].instanceMatrix.array);
      for(const key of ['position','normal','color','uv'])assert.deepEqual(a.children[i].geometry.attributes[key].array,b.children[i].geometry.attributes[key].array);
    }
  }finally{dispose(a);dispose(b);}
});
