import * as THREE from '../vendor/three.module.js';
import {toWorld} from './orientation.js?v=1.24.0';

/** The same finite boxes drive appearance, shade and privacy. Clear guard
 * glazing is translucent here and omitted from opaque analytical screens. */
export function createTerraceCoverGroup(layout,materials,svgMode=false){
  const group=new THREE.Group();group.name='terrace-cover';
  group.userData.terraceCoverType=layout?.type||'canopy';
  if(!layout?.enabled)return group;
  let glass;
  for(const primitive of layout.boxes){
    const {x0,x1,y0,y1,z0,z1,part}=primitive;
    if(![x0,x1,y0,y1,z0,z1].every(Number.isFinite)||x1<=x0||y1<=y0||z1<=z0)continue;
    let material;
    if(part==='glass'){
      glass??=new THREE.MeshBasicMaterial({color:0xa9c9c0,transparent:true,opacity:svgMode ? .12 : .18,side:THREE.DoubleSide,depthWrite:false});
      glass.userData.transient=true;
      material=glass;
    }else if(['post','rail-post','rail'].includes(part))material=materials.metal;
    else if(part==='fascia'||part==='beam')material=materials.wood||materials.metal;
    else material=materials.stoneLight||materials.stone||materials.linen;
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(x1-x0,z1-z0,y1-y0),material);
    mesh.name=primitive.id;mesh.position.set(...toWorld((x0+x1)/2,(y0+y1)/2,(z0+z1)/2));
    mesh.castShadow=primitive.opaque!==false;mesh.receiveShadow=primitive.opaque!==false;
    mesh.userData.terraceCover={id:primitive.id,type:layout.type,part,opaque:primitive.opaque!==false};
    group.add(mesh);
  }
  return group;
}
