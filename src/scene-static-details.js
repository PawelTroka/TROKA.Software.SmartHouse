import * as THREE from '../vendor/three.module.js';
import {applyExteriorSurface} from './exterior-materials.js?v=1.30.0';

// Only the garden builder's unnamed, fixed, single-material boxes participate.
// Named targets, glass sorting, vehicles, selectable terrain and fixture groups
// retain their original identity. Small spatial batches limit culling overhead.
export function batchGardenBoxes(group) {
  const cells = new Map();
  for (const mesh of group.children) {
    if (!mesh.visible || mesh.name || mesh.geometry?.type !== 'BoxGeometry' ||
        !mesh.isMesh || mesh.isInstancedMesh || Array.isArray(mesh.material) || mesh.material.transparent) continue;
    const key = [mesh.material.id, mesh.castShadow, mesh.receiveShadow, mesh.renderOrder,
      Math.floor(mesh.position.x / 8), Math.floor(mesh.position.z / 8)].join('/');
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(mesh);
  }
  let saved = 0;
  for (const meshes of cells.values()) {
    if (meshes.length < 3) continue;
    const positions=[], normals=[], uvs=[], indices=[];
    for (const mesh of meshes) {
      mesh.updateMatrix();
      const geometry = mesh.geometry;
      // These BoxGeometries are allocated per object by the garden builder.
      geometry.applyMatrix4(mesh.matrix);
      const offset = positions.length / 3;
      positions.push(...geometry.attributes.position.array);
      normals.push(...geometry.attributes.normal.array);
      uvs.push(...geometry.attributes.uv.array);
      for (const index of geometry.index.array) indices.push(offset+index);
      group.remove(mesh); geometry.dispose();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    geometry.setIndex(indices);
    const first = meshes[0], batch = new THREE.Mesh(geometry,first.material);
    batch.name = 'garden-fixed-boxes'; batch.castShadow = first.castShadow;
    batch.receiveShadow = first.receiveShadow; batch.renderOrder = first.renderOrder;
    group.add(batch); saved += meshes.length - 1;
  }
  return saved;
}

// Style materials belong to a single design generation. Original textures stay
// shared; each proposed finish releases its owned maps when the material dies.
export function proposedMaterials(base, style, {svgMode=false} = {}) {
  if (style.id === 'current') return base;
  const materials = {...base}, p = style.palette;
  for (const [key, source, color] of [
    ['stone','stone',p.surface], ['stoneLight','stoneLight',p.edge],
    ['wood','wood',p.wood], ['woodLight','woodLight',p.wood], ['metal','metal',p.frame],
    ['linen','linen',p.fabric], ['fabricAccent','linen',p.accent], ['styleAccent','metal',p.accent], ['styleLight','linen',p.light],
    ['wall','wall',p.houseWall], ['roof','roof',p.houseRoof], ['plinth','plinth',p.houseFrame]
  ]) {
    const material = base[source].clone();
    material.color.set(color);
    if (key === 'woodLight') material.color.lerp(new THREE.Color('#f4e5c9'),.16);
    applyExteriorSurface(material,style,key==='fabricAccent'?'fabric':key,{svgMode});
    materials[key] = material;
  }
  materials.deck=(['boards','cross-boards'].includes(style.recipe.paving)?base.wood:base.stone).clone();
  materials.deck.color.set(p.surface);applyExteriorSurface(materials.deck,style,'deck',{svgMode});
  return materials;
}

export function disposeProposedMaterials(materials, base) {
  const shared=new Set(Object.values(base));
  for(const material of new Set(Object.values(materials))){
    if(!shared.has(material))material.dispose();
  }
}

// Both tubs and rectangular pools use one metric ripple field, irrespective of
// local extrusion UVs, the dimensions of a box or the selected property.
export function projectWaterUVs(group, ...materials) {
  group.updateMatrixWorld(true);
  const p = new THREE.Vector3(), n = new THREE.Vector3(), basis = new THREE.Matrix3();
  group.traverse(mesh => {
    if (!materials.includes(mesh.material)) return;
    const {position,normal,uv} = mesh.geometry.attributes;
    if (!uv || !normal) return;
    basis.getNormalMatrix(mesh.matrixWorld);
    for (let i=0; i<position.count; i++) {
      p.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
      n.fromBufferAttribute(normal,i).applyMatrix3(basis);
      if (Math.abs(n.y) >= Math.max(Math.abs(n.x),Math.abs(n.z))) uv.setXY(i,p.x/2,p.z/2);
      else uv.setXY(i,Math.abs(n.x)>Math.abs(n.z)?p.z/2:p.x/2,p.y/2);
    }
    uv.needsUpdate = true;
  });
}

// Keep the measured slab intact. A separate top-face material gives timber
// concepts board grain while the skirt stays mineral. Two contiguous groups
// avoid submitting all six faces separately.
export function finishDeckBox(mesh, material, style, originX, originY) {
  if (!mesh || !material) return;
  const g=mesh.geometry, top=g.groups.find(face=>face.materialIndex===2);
  const all=Array.from(g.index.array), topIndices=all.splice(top.start,top.count);
  g.setIndex([...all,...topIndices]);
  g.clearGroups(); g.addGroup(0,all.length,0); g.addGroup(all.length,top.count,1);
  mesh.material=[mesh.material,material];
  const {position,uv}=g.attributes, [boardLength,boardWidth]=style.recipe.module;
  const cross=style.recipe.paving==='cross-boards';
  const timber=style.recipe.paving==='boards'||cross;
  for(const i of new Set(topIndices)){
    const x=position.getX(i)+mesh.position.x-originX;
    const y=position.getZ(i)+mesh.position.z-originY;
    const along=(cross?y:x)/boardLength,across=(cross?x:y)/(8*boardWidth);
    // Procedural timber grain runs along texture V, matching the long board
    // direction in the physical paving bond for either board orientation.
    uv.setXY(i,timber?across:along,timber?along:across);
  }
  uv.needsUpdate=true;
}
