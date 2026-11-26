import * as THREE from '../vendor/three.module.js';
import {toWorld} from './orientation.js?v=1.35.0';

const validBox=b=>[b.x0,b.x1,b.y0,b.y1,b.z0,b.z1].every(Number.isFinite)
  &&b.x1>b.x0&&b.y1>b.y0&&b.z1>b.z0;

function finishFor(box,materials){
  if(box.part==='foundation'||box.part==='entry')return materials.stone||materials.wall||materials.wood;
  if(box.part==='roof')return materials.stoneLight||materials.stone||materials.wall||materials.wood;
  if(box.part==='slab')return materials.woodLight||materials.wood||materials.stone;
  if(box.part==='column')return /mullion|frame/.test(box.id)
    ?materials.metal||materials.wood:materials.woodLight||materials.wood||materials.metal;
  if(box.part==='wall'&&/rear|east/.test(box.id))return materials.wood||materials.wall;
  return materials.wall||materials.stoneLight||materials.wood;
}

/** One geometry per finish keeps the glazed pavilion inexpensive in both the
 * garden scene and its shared interior context. Metric UVs give the large solid
 * walls the same timber/stone scale as the rest of the selected renovation. */
function boxBatches(boxes,materialFor,{castShadow=true,part='construction'}={}){
  const batches=new Map();
  for(const box of boxes){
    if(!validBox(box))continue;
    const material=materialFor(box);
    if(!material)continue;
    if(!batches.has(material))batches.set(material,{positions:[],normals:[],uvs:[],members:[]});
    const batch=batches.get(material),start=batch.positions.length/3;
    const geometry=new THREE.BoxGeometry(box.x1-box.x0,box.z1-box.z0,box.y1-box.y0);
    geometry.translate(...toWorld((box.x0+box.x1)/2,(box.y0+box.y1)/2,(box.z0+box.z1)/2));
    const {position,normal}=geometry.attributes,index=geometry.index;
    for(let i=0;i<index.count;i++){
      const j=index.getX(i),x=position.getX(j),z=position.getY(j),y=position.getZ(j);
      const nx=normal.getX(j),nz=normal.getY(j),ny=normal.getZ(j);
      batch.positions.push(x,z,y);batch.normals.push(nx,nz,ny);
      batch.uvs.push((Math.abs(nz)>.5?x:Math.abs(nx)>.5?y:x)/2,(Math.abs(nz)>.5?y:z)/2);
    }
    geometry.dispose();
    batch.members.push({id:box.id,part:box.part,start,count:batch.positions.length/3-start,
      bounds:[box.x0,box.y0,box.z0,box.x1,box.y1,box.z1]});
  }
  return [...batches].map(([material,batch],index)=>{
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(batch.positions,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(batch.normals,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(batch.uvs,2));
    geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,material);
    mesh.name=`corner-pavilion-${part}-${index}`;
    mesh.castShadow=castShadow;mesh.receiveShadow=castShadow;
    mesh.userData.cornerPavilion={part,opaque:castShadow,analytical:castShadow,members:batch.members};
    return mesh;
  });
}

function glazingMesh(glazing,material){
  const positions=[],uvs=[],ids=[];
  for(const pane of glazing||[]){
    const v=pane.vertices;
    if(!Array.isArray(v)||v.length!==4||v.some(p=>p.length<3||!p.every(Number.isFinite)))continue;
    const width=Math.hypot(v[1][0]-v[0][0],v[1][1]-v[0][1]);
    const height=Math.max(...v.map(p=>p[2]))-Math.min(...v.map(p=>p[2]));
    if(width<=0||height<=0)continue;
    // Double-sided clear panes remain zero-thickness visual surfaces. They
    // neither cast shadows nor turn into an opaque panel in the ray model.
    for(const i of [0,2,1,0,3,2])positions.push(...toWorld(...v[i]));
    uvs.push(0,0,1,1,1,0,0,0,0,1,1,1);ids.push(pane.id);
  }
  if(!positions.length)return null;
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.computeVertexNormals();geometry.computeBoundingSphere();
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='corner-pavilion-clear-glazing';mesh.castShadow=false;mesh.receiveShadow=false;
  mesh.userData.cornerPavilion={part:'glazing',opaque:false,analytical:false,ids};
  return mesh;
}

/** The same walls, columns, floors and roof feed appearance and analysis.
 * Only the shallow interior light fitting is decorative; its existing garden
 * circuit material changes with dusk and the garden-light switch. No extra
 * light or shadow map is allocated, and shared style materials stay shared. */
export function createCornerPavilionGroup(layout,materials){
  const group=new THREE.Group();group.name='corner-pavilion';
  if(!layout?.enabled)return group;
  group.userData.cornerPavilion={height:layout.height,storeys:layout.storeys?.length??0,
    footprint:layout.footprint,scope:'Exterior building study; internal circulation and room planning are not resolved.'};
  for(const mesh of boxBatches((layout.boxes||[]).filter(b=>b.opaque!==false),b=>finishFor(b,materials)))group.add(mesh);
  if(layout.glazing?.length){
    let glass=materials.glass;
    if(!glass){
      glass=new THREE.MeshStandardMaterial({color:'#94c6c3',transparent:true,opacity:.13,
        roughness:.15,side:THREE.DoubleSide,depthWrite:false});
      glass.userData.transient=true;
    }
    const mesh=glazingMesh(layout.glazing,glass);
    if(mesh)group.add(mesh);else if(!materials.glass)glass.dispose();
  }
  if(materials.spaGlow&&layout.width>1.5&&layout.length>1.5){
    const coves=(layout.storeys||[]).filter(s=>Number.isFinite(s.ceilingZ)&&s.ceilingZ>s.floorZ+2)
      .map(s=>({id:`pavilion-cove-${s.index}`,part:'light-fitting',x0:layout.x+.55,x1:layout.x+layout.width-.55,
        y0:layout.y+layout.length-.31,y1:layout.y+layout.length-.285,z0:s.ceilingZ-.055,z1:s.ceilingZ-.025}));
    for(const mesh of boxBatches(coves,()=>materials.spaGlow,{castShadow:false,part:'interior-cove'}))group.add(mesh);
  }
  return group;
}
