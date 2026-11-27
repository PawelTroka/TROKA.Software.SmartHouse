import * as THREE from '../vendor/three.module.js';

/** A single instance buffer spanning the entire neighbourhood cannot be culled
 * behind the walking camera. Partition only static vegetation, preserving every
 * source matrix, colour, measured crown and material. Geometry remains shared.
 */
export function partitionVegetationInstances(root){
  const sources=[];root.traverse(mesh=>{
    if(mesh.isInstancedMesh&&!mesh.userData.spatialPartition&&mesh.count>1&&
      (mesh.name.startsWith('existing-canopies-')||mesh.name.startsWith('reconstructed-existing-tree-branches')||mesh.name.startsWith('hedge-sprays-')))sources.push(mesh);
  });
  const matrix=new THREE.Matrix4(),color=new THREE.Color();let partitions=0,instances=0,originalBatches=0;
  for(const source of sources){
    const cellSize=source.name.startsWith('hedge-')?6:32,cells=new Map();
    for(let i=0;i<source.count;i++){
      source.getMatrixAt(i,matrix);const e=matrix.elements,key=`${Math.floor(e[12]/cellSize)}:${Math.floor(e[14]/cellSize)}`;
      if(!cells.has(key))cells.set(key,[]);cells.get(key).push(i);
    }
    if(cells.size<2)continue;
    const parent=source.parent;if(!parent)continue;originalBatches++;instances+=source.count;let ordinal=0;
    for(const [key,ids] of cells){
      const mesh=new THREE.InstancedMesh(source.geometry,source.material,ids.length);
      mesh.name=source.name+(ordinal++?`:cell-${key}`:'');
      mesh.position.copy(source.position);mesh.quaternion.copy(source.quaternion);mesh.scale.copy(source.scale);mesh.updateMatrix();
      mesh.castShadow=source.castShadow;mesh.receiveShadow=source.receiveShadow;mesh.visible=source.visible;
      mesh.renderOrder=source.renderOrder;mesh.layers.mask=source.layers.mask;
      mesh.userData={...source.userData,spatialPartition:true,cellSize,cell:key};
      for(const [i,original] of ids.entries()){
        source.getMatrixAt(original,matrix);mesh.setMatrixAt(i,matrix);
        if(source.instanceColor){source.getColorAt(original,color);mesh.setColorAt(i,color);}
      }
      mesh.computeBoundingBox();mesh.computeBoundingSphere();parent.add(mesh);partitions++;
    }
    parent.remove(source);source.dispose();
  }
  return {sourceBatches:originalBatches,spatialBatches:partitions,instances,geometryChanged:false,positionsChanged:false};
}
