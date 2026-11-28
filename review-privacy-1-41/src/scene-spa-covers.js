import * as THREE from '../vendor/three.module.js';
import {spaCoverAtProgress} from './spa-covers.js?v=1.41.0';
import {toWorld} from './orientation.js?v=1.41.0';

function batchCoverParts(parent){
  const buckets=new Map();
  for(const mesh of parent.children.filter(o=>o.isMesh)){
    if(!buckets.has(mesh.material))buckets.set(mesh.material,[]);
    buckets.get(mesh.material).push(mesh);
  }
  for(const [material,parts] of buckets){
    const positions=[],normals=[],uv=[],indices=[];
    for(const mesh of parts){
      mesh.updateMatrix();const g=mesh.geometry;g.applyMatrix4(mesh.matrix);
      const p=g.attributes.position,n=g.attributes.normal,offset=positions.length/3;
      positions.push(...p.array);normals.push(...n.array);
      // Metres, not one stretched UV square per board: the material grain
      // keeps its scale on the shorter plunge and the larger jacuzzi lid.
      for(let i=0;i<p.count;i++){
        const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
        uv.push(...(Math.abs(n.getY(i))>.5?[x,z]:Math.abs(n.getX(i))>.5?[z,y]:[x,y]));
      }
      indices.push(...Array.from(g.index.array,index=>index+offset));
      parent.remove(mesh);g.dispose();
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);
    const mesh=new THREE.Mesh(geometry,material);mesh.name=parts[0].name+'-batch';
    mesh.userData.sourceParts=parts.map(p=>p.name);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);
  }
}

/** Named subgroups remain movable after normal garden batching. Materials are
 * supplied by the active renovation palette, so the cover matches its deck. */
export function createSpaCoverGroup(layout,materials,{svgMode=false}={}){
  const group=new THREE.Group();group.name=layout?.id||'spa-cover-disabled';
  if(!layout)return group;
  const box=(parent,name,x,y,z,width,length,height,material)=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,length),material);
    mesh.name=name;mesh.position.set(...toWorld(x+width/2,y+length/2,z+height/2));
    mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  };
  const surface=materials.deck||materials.woodLight||materials.wood;
  const frame=materials.metal||materials.stone;
  // The tracks and parked leaves are below the continuous surround. Leaving
  // their meshes out also keeps the SVG fallback clean and avoids underground
  // parts casting implausible shadows through the terrace.
  for(const panel of layout.panels){
    const moving=new THREE.Group();moving.name=panel.id;moving.userData.spaCoverPanel=true;
    moving.userData.referenceBaseZ=panel.closedTopZ-layout.panelThickness;
    group.add(moving);
    box(moving,panel.id+'-frame',0,panel.y,moving.userData.referenceBaseZ,panel.width,panel.length,layout.panelThickness-.009,frame);
    const inset=.028,joint=svgMode?.009:.006,count=Math.max(3,Math.ceil(panel.length/.17)),unit=(panel.length-2*inset)/count;
    for(let i=0;i<count;i++)box(moving,panel.id+'-slat-'+i,inset,panel.y+inset+i*unit,panel.closedTopZ-.009,
      panel.width-2*inset,unit-joint,.009,surface);
    batchCoverParts(moving);
    moving.traverse(mesh=>{
      if(!mesh.isMesh)return;
      mesh.userData.coverOriginalPositions=Array.from(mesh.geometry.attributes.position.array);
      mesh.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
      mesh.geometry.attributes.uv.setUsage(THREE.DynamicDrawUsage);
    });
  }
  group.userData.spaCover={layout,progress:layout.progress,closed:layout.closed,panelCount:layout.panels.length};
  setSpaCoverProgress(group,layout.progress);
  return group;
}

/** Progress is supplied by the scene's animation loop, avoiding a geometry or
 * materials rebuild for each animation frame. 0 = parked, 1 = covered. */
export function setSpaCoverProgress(group,progress){
  const previous=group?.userData?.spaCover;if(!previous)return null;
  const layout=spaCoverAtProgress(previous.layout,progress);
  for(const panel of layout.panels){
    const mesh=group.getObjectByName(panel.id);if(!mesh)continue;
    mesh.visible=panel.visible;
    mesh.position.x=panel.x;
    mesh.position.y=panel.baseZ-mesh.userData.referenceBaseZ;
    if(!panel.visible)continue;
    const bounds=panel.exposedBounds,x0=bounds.x-panel.x,x1=x0+bounds.width,z0=bounds.y,z1=z0+bounds.length;
    // Clip the small existing vertex buffers at the cassette mouth. The boards
    // and metre-scaled grain slide rigidly instead of shrinking as they stow.
    mesh.traverse(part=>{
      const original=part.userData.coverOriginalPositions;if(!original)return;
      const geometry=part.geometry,p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv;
      for(let i=0;i<p.count;i++){
        const x=Math.max(x0,Math.min(x1,original[i*3])),y=original[i*3+1],z=Math.max(z0,Math.min(z1,original[i*3+2]));
        p.setXYZ(i,x,y,z);
        if(Math.abs(n.getY(i))>.5)uv.setXY(i,x,z);
        else if(Math.abs(n.getX(i))>.5)uv.setXY(i,z,y);
        else uv.setXY(i,x,y);
      }
      p.needsUpdate=true;uv.needsUpdate=true;geometry.computeBoundingBox();geometry.computeBoundingSphere();
    });
  }
  group.userData.spaCover={...previous,layout,progress:layout.progress,closed:layout.progress===1};
  return layout;
}
