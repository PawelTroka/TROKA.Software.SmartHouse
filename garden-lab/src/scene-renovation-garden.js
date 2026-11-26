import * as THREE from '../vendor/three.module.js';
import {gardenGroundAt} from './geometry.js?v=1.34.0';
import {createStyledDeck,createStyledResortPiece} from './scene-style-details.js?v=1.34.0';
import {finishDeckBox} from './scene-static-details.js?v=1.34.0';

/** The low landscape furnishings use the same fitted rectangles as the plan.
 * Planting is ornamental; it never creates an analytical privacy barrier. */
export function createRenovationGardenDetails(furniture,style,settings,data,materials,{svgMode=false}={}){
  const group=new THREE.Group();group.name='renovation-garden-details';
  const r=furniture.resort;if(!r?.scheme)return group;
  const m=materials,height=(x,y)=>gardenGroundAt(x,y,settings,data);
  const box=(x,y,z,w,l,h,material)=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,l),material);
    mesh.position.set(x+w/2,z+h/2,y+l/2);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
  };
  for(const p of r.pads||[]){
    const z=height(p.x+p.width/2,p.y+p.length/2),mesh=box(p.x,p.y,z-.02,p.width,p.length,.055,m.stone);
    mesh.name=p.id;finishDeckBox(mesh,m.deck,style,p.x,p.y);
    group.add(createStyledDeck(style,{...p,z:z+.037},{svgMode}));
  }
  if(r.kitchen){const p=r.kitchen;group.add(createStyledResortPiece(style,m,{...p,z:height(p.x+p.width/2,p.y+p.length/2)},{svgMode}));}
  for(const bed of r.beds||[]){
    const {x,y,width:w,length:l,plant}=bed,z=height(x+w/2,y+l/2),edge=.045;
    box(x,y,z+.015,w,l,.035,m.wood);
    for(const [bx,by,bw,bl]of [[x,y,w,edge],[x,y+l-edge,w,edge],[x,y,edge,l],[x+w-edge,y,edge,l]])box(bx,by,z+.015,bw,bl,.10,m.stoneLight);
    const positions=[],colors=[],blade=(points,colour)=>{for(const tri of [[0,1,2],[0,2,3]])for(const j of tri){positions.push(...points[j]);colors.push(...colour);}};
    const count=Math.min(svgMode?12:65,Math.max(8,Math.round(w*l*11))),grassy=plant==='grass'||plant==='soft';
    const tint=new THREE.Color(style.palette.accent).lerp(new THREE.Color('#668048'),.78);
    for(let i=0;i<count;i++){
      const u=((i*.61803398875)%1),v=((i*.41421356237)%1),cx=x+.12+u*Math.max(.01,w-.24),cy=y+.12+v*Math.max(.01,l-.24),base=height(cx,cy)+.055;
      const n=svgMode?5:grassy?11:7;
      for(let j=0;j<n;j++){
        const angle=j*2.39996+i*.37,reach=grassy?.12:.16,h=grassy?.32+(i%4)*.065:.23+(i%3)*.09;
        const dx=Math.cos(angle),dy=Math.sin(angle),bw=grassy?.012:.045;
        const color=tint.clone().multiplyScalar(.74+(j%4)*.085).toArray();
        // Two bent blade sections carry real silhouette and soft normal detail.
        const a=[cx-dy*bw,base,cy+dx*bw],b=[cx+dy*bw,base,cy-dx*bw];
        const c=[cx+dx*reach*.48+dy*bw*.7,base+h*.64,cy+dy*reach*.48-dx*bw*.7],d=[cx+dx*reach*.48-dy*bw*.7,base+h*.64,cy+dy*reach*.48+dx*bw*.7];
        blade([a,b,c,d],color);
        blade([d,c,[cx+dx*reach,base+h,cy+dy*reach],[cx+dx*reach-.001,base+h,cy+dy*reach]],color);
      }
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
    const leaf=new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.95});leaf.userData.transient=true;
    const mesh=new THREE.Mesh(geometry,leaf);mesh.name=bed.id;mesh.receiveShadow=true;mesh.castShadow=!svgMode;group.add(mesh);
  }
  group.userData={scheme:r.scheme,kitchen:Boolean(r.kitchen),beds:r.beds?.length||0,pads:r.pads?.length||0};return group;
}
