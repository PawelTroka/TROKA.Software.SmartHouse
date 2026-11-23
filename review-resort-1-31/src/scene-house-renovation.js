import * as THREE from '../vendor/three.module.js';
import {toWorld} from './orientation.js?v=1.31.0';
import {facadePoint} from './house-appearance.js?v=1.31.0';
import {houseRenovationParts,summarizeHouseRenovation} from './house-renovation.js?v=1.31.0';
import {applyExteriorSurface} from './exterior-materials.js?v=1.31.0';

const flatSvgDetails=new Set(['brick','stone','panels','soldier-lintel','shutter-louvre']);

/** A single mesh for the shallow, solid facade fittings, including their returns. */
export function addHouseRenovation(parent,layout,style,{svgMode=false}={}){
  const parts=houseRenovationParts(layout,style);
  if(!parts.length)return null;
  const positions=[],colors=[],uvs=[],materials=[],groups=[];
  const finishes=[...new Set(parts.map(p=>p.finish))];
  for(const finishName of finishes){
    const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.78});
    material.userData.transient=true;applyExteriorSurface(material,style,finishName,{svgMode,seams:false});
    const materialIndex=materials.push(material)-1,start=positions.length/3;
    for(const part of parts.filter(p=>p.finish===finishName)){
    const {lo,hi,bottom,top,depth,finish,tone}=part,edge=layout.edges[part.edgeIndex];
    const corner=(x,z,offset)=>toWorld(...facadePoint(edge,x,z,offset));
    const rectangle=offset=>[corner(lo,bottom,offset),corner(hi,bottom,offset),corner(hi,top,offset),corner(lo,top,offset)];
    const front=rectangle(depth),back=rectangle(.008);
    const color=new THREE.Color(style.palette[finish]).multiplyScalar(tone??1);
    const flip=-edge.direction[1]*edge.outward[0]+edge.direction[0]*edge.outward[1]<0;
    const quad=(a,b,c,d)=>{
      for(const p of (flip?[a,c,b,a,d,c]:[a,b,c,a,c,d])){
        positions.push(...p);colors.push(color.r,color.g,color.b);
        // World-metric UVs keep material grain at a consistent scale across
        // separate piers, courses and facade edges instead of stretching each
        // tiny board to a complete image tile.
        const along=((p[0]-edge.a[0])*edge.direction[0]+(p[2]-edge.a[1])*edge.direction[1])/1.5,height=p[1]/2;
        uvs.push(part.kind.startsWith('lap-')?height:along,part.kind.startsWith('lap-')?along:height);
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
    groups.push({start,count:positions.length/3-start,materialIndex});
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  for(const group of groups)geometry.addGroup(group.start,group.count,group.materialIndex);
  geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,materials);
  mesh.name='house-renovation';
  mesh.userData=summarizeHouseRenovation(parts,style);
  mesh.receiveShadow=true;
  parent.add(mesh);
  return mesh;
}
