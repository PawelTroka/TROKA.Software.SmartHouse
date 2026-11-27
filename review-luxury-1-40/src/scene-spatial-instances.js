import * as THREE from '../vendor/three.module.js';

const vegetation=mesh=>mesh.isInstancedMesh&&mesh.count>1&&
  (mesh.name.startsWith('existing-canopies-')||mesh.name.startsWith('reconstructed-existing-tree-branches')||mesh.name.startsWith('hedge-sprays-'));
const visible=object=>{for(let node=object;node;node=node.parent)if(!node.visible)return false;return true;};
function supported(mesh){
  // These static builders use matrix/color instance data, with no wind or
  // gl_InstanceID-dependent shader. Future morph/custom instance data needs
  // explicit preservation before it can join this optimization.
  return vegetation(mesh)&&!mesh.morphTexture&&!Object.values(mesh.geometry.morphAttributes||{}).some(a=>a.length)&&
    !Object.values(mesh.geometry.attributes).some(a=>a.isInstancedBufferAttribute||a.data?.isInstancedInterleavedBuffer)&&
    !(Array.isArray(mesh.material)?mesh.material:[mesh.material]).some(m=>m?.isShaderMaterial)&&!mesh.userData.requiresStableInstanceId;
}

/** Keep the original material batches while culling individual instances.
 * prepare() changes only the rendered matrix/color prefix; restore() returns
 * the exact complete CPU model. The scene restores in finally after its moving
 * color pass. Shadow updates and other-camera passes see every instance.
 */
export function createVegetationInstanceCuller(){
  const entries=new Map(),matrix=new THREE.Matrix4(),projection=new THREE.Matrix4(),cameraProjection=new THREE.Matrix4(),frustum=new THREE.Frustum(),sphere=new THREE.Sphere();
  let diagnostics={method:'instance-frustum-compaction',sourceBatches:0,nonemptyBatches:0,instances:0,visibleInstances:0,culledInstances:0,
    compacted:false,passes:0,drawCallsAdded:0,geometryChanged:false,positionsChanged:false};
  function restoreEntry(entry){
    if(!entry.compacted)return;
    const {mesh}=entry;mesh.count=entry.count;
    if(entry.repacked){
      mesh.instanceMatrix.array.set(entry.matrices);mesh.instanceMatrix.needsUpdate=true;
      if(entry.colors){mesh.instanceColor.array.set(entry.colors);mesh.instanceColor.needsUpdate=true;}
    }
    entry.compacted=false;entry.repacked=false;
  }
  function restore(){for(const entry of entries.values())restoreEntry(entry);}
  function setRoots(roots=[]){
    restore();const sources=new Set();
    for(const root of roots.filter(Boolean))root.traverse(mesh=>{if(supported(mesh))sources.add(mesh);});
    for(const [mesh,entry] of entries)if(!sources.has(mesh)){restoreEntry(entry);entries.delete(mesh);}
    for(const mesh of sources){
      if(entries.has(mesh))continue;
      const count=mesh.count,matrices=mesh.instanceMatrix.array.slice(0,count*16),colorSize=mesh.instanceColor?.itemSize||0;
      const colors=mesh.instanceColor?.array.slice(0,count*colorSize)||null,bounds=new Float64Array(count*4);
      if(!mesh.geometry.boundingSphere)mesh.geometry.computeBoundingSphere();
      // Keep the whole-batch bound conservative for every compacted view and
      // for the next full shadow/reflection pass.
      if(!mesh.boundingSphere)mesh.computeBoundingSphere();
      for(let i=0;i<count;i++){
        matrix.fromArray(matrices,i*16);sphere.copy(mesh.geometry.boundingSphere).applyMatrix4(matrix);
        const offset=i*4;bounds[offset]=sphere.center.x;bounds[offset+1]=sphere.center.y;bounds[offset+2]=sphere.center.z;
        bounds[offset+3]=sphere.radius+Math.max(1e-5,sphere.radius*1e-5);
      }
      entries.set(mesh,{mesh,count,matrices,colors,colorSize,bounds,compacted:false,repacked:false});
    }
    diagnostics={...diagnostics,sourceBatches:entries.size,instances:[...entries.values()].reduce((sum,e)=>sum+e.count,0)};
  }
  function prepare(camera,{enabled=true}={}){
    restore();camera.updateMatrixWorld(true);
    diagnostics={...diagnostics,nonemptyBatches:0,visibleInstances:0,culledInstances:0,compacted:enabled,passes:diagnostics.passes+1};
    cameraProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    for(const entry of entries.values()){
      const {mesh,count,matrices,colors,colorSize,bounds}=entry;
      if(!visible(mesh))continue;
      if(!enabled){diagnostics.visibleInstances+=count;diagnostics.nonemptyBatches++;continue;}
      mesh.updateWorldMatrix(true,false);projection.multiplyMatrices(cameraProjection,mesh.matrixWorld);frustum.setFromProjectionMatrix(projection);
      let selected=0,repacked=false;
      for(let i=0;i<count;i++){
        const offset=i*4;sphere.center.set(bounds[offset],bounds[offset+1],bounds[offset+2]);sphere.radius=bounds[offset+3];
        if(!frustum.intersectsSphere(sphere))continue;
        if(i!==selected){
          for(let axis=0;axis<16;axis++)mesh.instanceMatrix.array[selected*16+axis]=matrices[i*16+axis];
          if(colors)for(let axis=0;axis<colorSize;axis++)mesh.instanceColor.array[selected*colorSize+axis]=colors[i*colorSize+axis];
          repacked=true;
        }
        selected++;
      }
      if(selected<count){
        mesh.count=selected;entry.compacted=true;entry.repacked=repacked;
        if(repacked){mesh.instanceMatrix.needsUpdate=true;if(colors)mesh.instanceColor.needsUpdate=true;}
      }
      diagnostics.visibleInstances+=selected;diagnostics.culledInstances+=count-selected;if(selected)diagnostics.nonemptyBatches++;
    }
    return diagnostics;
  }
  return {setRoots,prepare,restore,getDiagnostics:()=>({...diagnostics}),dispose(){restore();entries.clear();}};
}
