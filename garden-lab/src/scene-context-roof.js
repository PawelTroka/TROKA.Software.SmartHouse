/** Render the same discrete roof features used by local privacy and shade. */
import * as THREE from '../vendor/three.module.js';
import {toWorld,toWorldTriangle,toWorldRoofTriangle} from './orientation.js?v=1.38.0';

function geometry(faces,roof=false){
  const result=new THREE.BufferGeometry(),convert=roof?toWorldRoofTriangle:toWorldTriangle;
  result.setAttribute('position',new THREE.Float32BufferAttribute(faces.flatMap(face=>convert(...face).flat()),3));
  result.computeVertexNormals();return result;
}

export function createContextRoofFeatures(detail,roofMaterial){
  const group=new THREE.Group();group.name='context-resolved-roof-features';
  if(!detail?.features?.length)return group;
  const material=color=>{const m=roofMaterial.clone();m.color.set(color);m.userData.transient=true;return m;};
  const chimney=material('#dddcd0'),glass=material('#9daead'),metal=material('#8b9290');
  const add=(name,faces,mat,roof=false)=>{
    if(!faces.length)return;
    const mesh=new THREE.Mesh(geometry(faces,roof),mat);mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  };
  for(const feature of detail.features){
    add(`context-${feature.id}-walls`,feature.wallFaces,feature.kind==='high-fixture'?metal:chimney);
    add(`context-${feature.id}-roof`,feature.roofFaces,feature.kind==='pyramid'?glass:metal,true);
    if(feature.frameLines?.length){
      const lines=new THREE.BufferGeometry();
      lines.setAttribute('position',new THREE.Float32BufferAttribute(feature.frameLines.flatMap(line=>line.flatMap(p=>toWorld(...p))),3));
      const frame=new THREE.LineBasicMaterial({color:'#e0e3df'});frame.userData.transient=true;
      const mesh=new THREE.LineSegments(lines,frame);mesh.name='context-rooflight-frame';group.add(mesh);
    }
  }
  return group;
}
