import * as THREE from '../vendor/three.module.js';
import {toWorld} from './orientation.js?v=1.25.0';
import {facadePoint} from './house-appearance.js?v=1.25.0';
import {houseRenovationParts,summarizeHouseRenovation} from './house-renovation.js?v=1.25.0';

const flatSvgDetails=new Set(['brick','stone','panels','soldier-lintel','shutter-louvre']);

/** A single mesh for the shallow, solid facade fittings, including their returns. */
export function addHouseRenovation(parent,layout,style,{svgMode=false}={}){
  const parts=houseRenovationParts(layout,style);
  if(!parts.length)return null;
  const positions=[],colors=[];
  for(const part of parts){
    const {lo,hi,bottom,top,depth,finish,tone}=part,edge=layout.edges[part.edgeIndex];
    const corner=(x,z,offset)=>toWorld(...facadePoint(edge,x,z,offset));
    const rectangle=offset=>[corner(lo,bottom,offset),corner(hi,bottom,offset),corner(hi,top,offset),corner(lo,top,offset)];
    const front=rectangle(depth),back=rectangle(.008);
    const color=new THREE.Color(style.palette[finish]).multiplyScalar(tone??1);
    const flip=-edge.direction[1]*edge.outward[0]+edge.direction[0]*edge.outward[1]<0;
    const quad=(a,b,c,d)=>{
      for(const p of (flip?[a,c,b,a,d,c]:[a,b,c,a,c,d])){
        positions.push(...p);colors.push(color.r,color.g,color.b);
      }
    };
    quad(...front);
    // The vector fallback keeps the projecting face of small masonry units.
    // Their shared backing still supplies the perimeter returns.
    if(svgMode&&flatSvgDetails.has(part.kind))continue;
    for(let i=0;i<4;i++){
      const j=(i+1)%4;
      quad(front[j],front[i],back[i],back[j]);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.computeVertexNormals();
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.78});
  material.userData.transient=true;
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='house-renovation';
  mesh.userData=summarizeHouseRenovation(parts,style);
  mesh.receiveShadow=true;
  parent.add(mesh);
  return mesh;
}
