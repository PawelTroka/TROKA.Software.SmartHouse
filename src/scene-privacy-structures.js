import * as THREE from '../vendor/three.module.js';
import {toWorld} from './orientation.js?v=1.21.0';

/** Draw the same finite members and panels used by the ray calculations.
 * The model supplies foliage only when dense coverage is explicitly selected;
 * the renderer never fills an open pergola with an invisible solid wall. */
export function createPrivacyStructureGroup(structures, materials) {
  const group=new THREE.Group();
  group.name='privacy-structures';
  for(const primitive of structures?.boxes||[]) {
    const {x0,x1,y0,y1,z0,z1}=primitive;
    if(![x0,x1,y0,y1,z0,z1].every(Number.isFinite)||x1<=x0||y1<=y0||z1<=z0)continue;
    const material=primitive.part==='foliage' ? materials.hedge
      : primitive.part==='screen' ? materials.linen
      : primitive.part==='post' ? materials.metal
      : materials.wood;
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(x1-x0,z1-z0,y1-y0),material);
    mesh.name=`privacy-${primitive.id}`;
    mesh.position.set(...toWorld((x0+x1)/2,(y0+y1)/2,(z0+z1)/2));
    mesh.castShadow=primitive.opaque!==false;
    mesh.receiveShadow=true;
    mesh.userData.privacyStructure={id:primitive.id,group:primitive.group,part:primitive.part};
    group.add(mesh);
  }
  return group;
}
