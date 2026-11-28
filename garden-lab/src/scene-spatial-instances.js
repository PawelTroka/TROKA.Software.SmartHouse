import * as THREE from '../vendor/three.module.js';
import {isGardenLightBoundaryOrderSafe} from './scene-light-boundary.js?v=1.41.0';

const vegetation=mesh=>mesh.isInstancedMesh&&mesh.count>1&&
  (mesh.name.startsWith('existing-canopies-')||mesh.name.startsWith('reconstructed-existing-tree-branches')||mesh.name.startsWith('hedge-sprays-'));
const visible=object=>{for(let node=object;node;node=node.parent)if(!node.visible)return false;return true;};
const botanical=material=>material?.userData.botanicalCutouts===true||material?.userData.existingCanopy===true;
function supported(mesh){
  // These static builders use matrix/color instance data, with no wind or
  // gl_InstanceID-dependent shader. Future morph/custom instance data needs
  // explicit preservation before it can join this optimization.
  return vegetation(mesh)&&!mesh.morphTexture&&!Object.values(mesh.geometry.morphAttributes||{}).some(a=>a.length)&&
    !Object.values(mesh.geometry.attributes).some(a=>a.isInstancedBufferAttribute||a.data?.isInstancedInterleavedBuffer)&&
    !(Array.isArray(mesh.material)?mesh.material:[mesh.material]).some(m=>m?.isShaderMaterial)&&!mesh.userData.requiresStableInstanceId;
}
function orderable(mesh){
  const material=mesh.material;
  // Only the static builders' ordinary opaque surface shader is reorderable.
  // Alpha-to-coverage still writes per-sample depth; it is not alpha blending.
  // The known plot-light wrapper is also safe: it derives coverage from the
  // transformed world position and never consumes an instance ID.
  return !Array.isArray(material)&&material?.isMeshStandardMaterial&&!material.isMeshPhysicalMaterial&&
    !material.transparent&&material.opacity===1&&material.depthTest&&material.depthWrite&&material.colorWrite&&
    [THREE.LessDepth,THREE.LessEqualDepth].includes(material.depthFunc)&&
    [THREE.NormalBlending,THREE.NoBlending].includes(material.blending)&&
    !material.stencilWrite&&!material.polygonOffset&&!material.wireframe&&!material.alphaHash&&
    (material.onBeforeCompile===THREE.Material.prototype.onBeforeCompile&&
      material.customProgramCacheKey===THREE.Material.prototype.customProgramCacheKey||isGardenLightBoundaryOrderSafe(material))&&
    mesh.onBeforeRender===THREE.Object3D.prototype.onBeforeRender&&mesh.onAfterRender===THREE.Object3D.prototype.onAfterRender;
}
function opaqueCoverageRedundant(mesh,material){
  // Pinned r160 defines OPAQUE only for NormalBlending + !transparent. Its
  // standard shader performs alpha-test discard first, then writes alpha=1.
  // Alpha-to-coverage therefore cannot remove any surviving MSAA sample.
  // Unlike ordering, this proof excludes NoBlending, Physical/transmission,
  // custom defines and every unverified shader/material/object render hook.
  const defines=material.defines;
  if(!defines||typeof defines!=='object'||defines.STANDARD!==''||Reflect.ownKeys(defines).length!==1)return false;
  for(const name in defines)if(name!=='STANDARD')return false;
  return material.constructor===THREE.MeshStandardMaterial&&botanical(material)&&material.alphaToCoverage===true&&
    material.blending===THREE.NormalBlending&&!(material.transmission>0)&&orderable(mesh)&&
    material.onBeforeRender===THREE.Material.prototype.onBeforeRender;
}

/** Keep the original material batches while culling individual instances.
 * prepare() changes only the rendered matrix/color prefix; restore() returns
 * the exact complete CPU model. The scene restores in finally after its moving
 * color pass. Shadow updates and other-camera passes see every instance.
 */
export function createVegetationInstanceCuller(){
  const entries=new Map(),coverageConsumers=new Set(),matrix=new THREE.Matrix4(),projection=new THREE.Matrix4(),cameraProjection=new THREE.Matrix4(),view=new THREE.Matrix4(),frustum=new THREE.Frustum(),sphere=new THREE.Sphere();
  let postShadowFullPass=false;
  let diagnostics={method:'instance-frustum-compaction',sourceBatches:0,nonemptyBatches:0,instances:0,visibleInstances:0,culledInstances:0,
    compacted:false,shadowUploadGuard:null,orderedBatches:0,orderedInstances:0,passes:0,opaqueOrder:'default',
    opaqueCoverageMaterials:0,opaqueCoverageMeshes:0,opaqueCoverageRestored:true,drawCallsAdded:0,geometryChanged:false,positionsChanged:false};
  function opaqueDepthOrder(a,b){
    // Keep explicit scene priorities, then let solid architecture establish
    // depth before expensive foliage. Material batching and every remaining
    // tie-break match Three r160's default opaque order. Registry membership
    // survives compaction down to a single visible instance; the material
    // tag also covers focal pines and boundary conifers outside that registry.
    if(a.groupOrder!==b.groupOrder)return a.groupOrder-b.groupOrder;
    if(a.renderOrder!==b.renderOrder)return a.renderOrder-b.renderOrder;
    const foliageA=(entries.has(a.object)||a.material.userData.botanicalCutouts===true)&&a.material.depthWrite&&a.material.depthTest&&!a.material.transparent;
    const foliageB=(entries.has(b.object)||b.material.userData.botanicalCutouts===true)&&b.material.depthWrite&&b.material.depthTest&&!b.material.transparent;
    if(foliageA!==foliageB)return Number(foliageA)-Number(foliageB);
    if(a.material.id!==b.material.id)return a.material.id-b.material.id;
    if(a.z!==b.z)return a.z-b.z;
    return a.id-b.id;
  }
  function withOpaqueDepthOrder(renderer,render,{enabled=false,optimizeOpaqueCoverage=true}={}){
    diagnostics.opaqueOrder=enabled?'architecture-before-vegetation':'default';
    diagnostics.opaqueCoverageMaterials=0;diagnostics.opaqueCoverageMeshes=0;diagnostics.opaqueCoverageRestored=true;
    if(!enabled)return render();
    // This scene owns its renderer and otherwise uses the default sorter.
    // Scope the override to one moving main pass: shadow/reflection/idle
    // renders must never inherit it, including after an exception.
    const changed=new Map();let completed=false;
    try{
      renderer.setOpaqueSort(opaqueDepthOrder);
      if(optimizeOpaqueCoverage){
        const materials=new Map();
        for(const mesh of coverageConsumers){
          for(const material of Array.isArray(mesh.material)?new Set(mesh.material):[mesh.material]){
            if(!botanical(material))continue;
            if(!materials.has(material))materials.set(material,{eligible:true,visibleMeshes:0});
            const usage=materials.get(material);
            // Shared state is safe only when every registered consumer is
            // eligible, including hidden consumers and material-array users.
            usage.eligible=usage.eligible&&opaqueCoverageRedundant(mesh,material);
            if(visible(mesh)&&material.visible&&(!mesh.isInstancedMesh||mesh.count>0))usage.visibleMeshes++;
          }
        }
        for(const [material,usage] of materials){
          if(!usage.eligible||!usage.visibleMeshes)continue;
          changed.set(material,material.alphaToCoverage);material.alphaToCoverage=false;
          diagnostics.opaqueCoverageMaterials++;diagnostics.opaqueCoverageMeshes+=usage.visibleMeshes;
        }
        diagnostics.opaqueCoverageRestored=changed.size===0;
      }
      const result=render();completed=true;return result;
    }finally{
      for(const [material,alphaToCoverage] of changed)material.alphaToCoverage=alphaToCoverage;
      diagnostics.opaqueCoverageRestored=true;
      // Retain counts for the completed pass, not a failed render attempt.
      // These are registered visible consumers, never a draw-call estimate.
      if(!completed){diagnostics.opaqueCoverageMaterials=0;diagnostics.opaqueCoverageMeshes=0;}
      renderer.setOpaqueSort(null);
    }
  }
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
    restore();const sources=new Set();coverageConsumers.clear();
    for(const root of roots.filter(Boolean))root.traverse(mesh=>{
      if(supported(mesh))sources.add(mesh);
      // Include focal botanical meshes outside the instance registry. The
      // scene supplies all existing-vegetation/design roots; evaluate hooks
      // at render time because the verified light wrapper is installed later.
      if(mesh.isMesh&&(Array.isArray(mesh.material)?mesh.material:[mesh.material]).some(botanical))coverageConsumers.add(mesh);
    });
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
      entries.set(mesh,{mesh,count,matrices,colors,colorSize,bounds,selected:[],depths:new Float64Array(count),compacted:false,repacked:false});
    }
    diagnostics={...diagnostics,sourceBatches:entries.size,instances:[...entries.values()].reduce((sum,e)=>sum+e.count,0)};
  }
  function prepare(camera,{enabled=true,shadowPassPending=false}={}){
    restore();camera.updateMatrixWorld(true);
    // Three r160 increments its render frame between the main object upload
    // and shadow rendering. A shadow upload is therefore cached under the
    // next main pass's frame number. Keep the original count and arrays for
    // that one pass, even when it starts a gesture: needsUpdate alone cannot
    // bypass WebGLObjects' once-per-frame instance upload cache. The normal
    // main render then advances the frame before any packed prefix is used.
    const shadowUploadGuard=shadowPassPending?'shadow-pass':postShadowFullPass?'post-shadow-full-pass':null;
    postShadowFullPass=Boolean(shadowPassPending);
    const cullingEnabled=Boolean(enabled&&!shadowUploadGuard);
    diagnostics={...diagnostics,nonemptyBatches:0,visibleInstances:0,culledInstances:0,compacted:cullingEnabled,shadowUploadGuard,orderedBatches:0,orderedInstances:0,passes:diagnostics.passes+1};
    cameraProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    for(const entry of entries.values()){
      const {mesh,count,matrices,colors,colorSize,bounds,selected:indices,depths}=entry;
      if(!visible(mesh))continue;
      if(!cullingEnabled){diagnostics.visibleInstances+=count;diagnostics.nonemptyBatches++;continue;}
      mesh.updateWorldMatrix(true,false);projection.multiplyMatrices(cameraProjection,mesh.matrixWorld);frustum.setFromProjectionMatrix(projection);
      indices.length=0;
      for(let i=0;i<count;i++){
        const offset=i*4;sphere.center.set(bounds[offset],bounds[offset+1],bounds[offset+2]);sphere.radius=bounds[offset+3];
        if(!frustum.intersectsSphere(sphere))continue;
        indices.push(i);
      }
      const selected=indices.length;
      if(selected>1&&orderable(mesh)){
        view.multiplyMatrices(camera.matrixWorldInverse,mesh.matrixWorld);const e=view.elements;
        for(const i of indices){const offset=i*4;depths[i]=-(e[2]*bounds[offset]+e[6]*bounds[offset+1]+e[10]*bounds[offset+2]+e[14]);}
        // Camera-space depth respects transformed batches and both viewing
        // directions. Equal keys keep canonical order; no instance is removed,
        // merged, recolored or moved. Leaf order inside each specimen is intact.
        indices.sort((a,b)=>depths[a]-depths[b]||a-b);
        if(indices.some((index,i)=>i>0&&index<indices[i-1])){
          diagnostics.orderedBatches++;diagnostics.orderedInstances+=selected;
        }
      }
      let repacked=false;
      for(let destination=0;destination<selected;destination++){
        const source=indices[destination];
        if(source!==destination){
          for(let axis=0;axis<16;axis++)mesh.instanceMatrix.array[destination*16+axis]=matrices[source*16+axis];
          if(colors)for(let axis=0;axis<colorSize;axis++)mesh.instanceColor.array[destination*colorSize+axis]=colors[source*colorSize+axis];
          repacked=true;
        }
      }
      // A completely visible batch may still be permuted. Its upload and
      // finally-restoration obligations are identical to a shortened prefix.
      if(selected<count||repacked){
        mesh.count=selected;entry.compacted=true;entry.repacked=repacked;
        if(repacked){mesh.instanceMatrix.needsUpdate=true;if(colors)mesh.instanceColor.needsUpdate=true;}
      }
      diagnostics.visibleInstances+=selected;diagnostics.culledInstances+=count-selected;if(selected)diagnostics.nonemptyBatches++;
    }
    return diagnostics;
  }
  return {setRoots,prepare,restore,withOpaqueDepthOrder,getDiagnostics:()=>({...diagnostics}),dispose(){restore();entries.clear();coverageConsumers.clear();}};
}
