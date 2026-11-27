import * as THREE from '../vendor/three.module.js';
import {boundaryMemberFaces} from './boundary-fence.js?v=1.37.0';

/** Metric infill is merged by finish, including the shadow-casting slats.
 * Hundreds of repeat battens create a handful of draw calls, not one each. */
export function createBoundaryFenceGroup(layout,materials,{svgMode=false}={}){
  const group=new THREE.Group();group.name='proposed-boundary-fence';
  group.userData={enabled:layout.enabled,height:layout.height,styleId:layout.style.id,infillName:layout.style.infillName,memberCount:layout.members.length,
    gateStates:layout.gates.map(g=>({id:g.id,open:g.open,width:g.clearWidth})),quantities:layout.quantities};
  if(!layout.enabled)return group;
  const buckets=new Map();
  for(const m of layout.members){
    const key=m.material==='wood'||m.material==='metal'?m.material+(m.part==='infill'&&layout.style.lightInfill?'-light':''):m.material;
    if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(m);
  }
  for(const [key,members]of buckets){
    const source=key.replace('-light',''),base=materials[source]||materials.stone||materials.metal;
    let material=base;
    if(key.endsWith('-light')){material=base.clone();material.color.set(layout.style.palette.houseWall);material.userData.transient=true;}
    const positions=[],uvs=[];
    for(const m of members)for(const face of boundaryMemberFaces(m)){
      // Swap site depth/elevation and reverse winding to keep outward normals.
      for(const i of [0,2,1]){const p=face[i];positions.push(p[0],p[2],p[1]);
        const along=(p[0]-m.a[0])*m.u[0]+(p[1]-m.a[1])*m.u[1];uvs.push(along,p[2]-m.baseZ);}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,material);mesh.name='boundary-fence-'+key;mesh.castShadow=true;mesh.receiveShadow=true;
    if(svgMode)mesh.renderOrder=2;group.add(mesh);
  }
  return group;
}
