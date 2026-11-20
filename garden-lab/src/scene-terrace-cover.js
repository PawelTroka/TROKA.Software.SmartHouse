import * as THREE from '../vendor/three.module.js';
import {toWorld} from './orientation.js?v=1.29.0';
import {getBalconyGuardRecipe} from './exterior-recipes.js?v=1.29.0';

// Decorative infill stays within the guard envelope, with the original glass
// and structural rail/post boxes retained. It does not earn opaque-screen or
// shade credit. Batch all infill into one mesh and reuse the owned finish.
function addGuardInfill(group,layout,materials,recipe){
  if(['original','glass'].includes(recipe.form)||layout.type!=='balcony')return;
  const positions=[],normals=[],uvs=[];
  const append=(geometry)=>{
    const {position,normal,uv}=geometry.attributes,index=geometry.index;
    for(let i=0;i<(index?.count??position.count);i++){
      const j=index?index.getX(i):i;
      positions.push(position.getX(j),position.getY(j),position.getZ(j));
      normals.push(normal.getX(j),normal.getY(j),normal.getZ(j));
      uvs.push(uv?.getX(j)??0,uv?.getY(j)??0);
    }
    geometry.dispose();
  };
  for(const pane of layout.boxes.filter(p=>p.part==='glass')){
    const acrossX=pane.x1-pane.x0>pane.y1-pane.y0;
    const span=acrossX?pane.x1-pane.x0:pane.y1-pane.y0,height=pane.z1-pane.z0;
    if(span<.10||height<.16)continue;
    const centre=[(pane.x0+pane.x1)/2,(pane.y0+pane.y1)/2,(pane.z0+pane.z1)/2];
    const box=(along,z,width,h,depth=.027)=>{
      const g=new THREE.BoxGeometry(acrossX?width:depth,h,acrossX?depth:width);
      g.translate(...toWorld(centre[0]+(acrossX?along:0),centre[1]+(acrossX?0:along),z));append(g);
    };
    const rod=(u0,z0,u1,z1)=>{
      const a=new THREE.Vector3(...toWorld(centre[0]+(acrossX?u0:0),centre[1]+(acrossX?0:u0),z0));
      const b=new THREE.Vector3(...toWorld(centre[0]+(acrossX?u1:0),centre[1]+(acrossX?0:u1),z1));
      const vector=b.clone().sub(a),g=new THREE.CylinderGeometry(.008,.008,vector.length(),8);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),vector.normalize()));
      g.translate(...a.add(b).multiplyScalar(.5).toArray());append(g);
    };
    const timberBrace=(u0,z0,u1,z1)=>{
      const a=new THREE.Vector3(...toWorld(centre[0]+(acrossX?u0:0),centre[1]+(acrossX?0:u0),z0));
      const b=new THREE.Vector3(...toWorld(centre[0]+(acrossX?u1:0),centre[1]+(acrossX?0:u1),z1));
      const direction=b.clone().sub(a),length=direction.length();
      const normal=new THREE.Vector3(acrossX?0:1,0,acrossX?1:0);
      direction.normalize();const widthAxis=direction.clone().cross(normal);
      const g=new THREE.BoxGeometry(recipe.railWidth,length,.032);
      g.applyMatrix4(new THREE.Matrix4().makeBasis(widthAxis,direction,normal));
      g.translate(...a.add(b).multiplyScalar(.5).toArray());append(g);
    };
    if(recipe.form==='vertical-timber'||recipe.form==='steel-pickets'){
      const n=Math.max(1,Math.ceil(span/recipe.spacing)),width=recipe.form==='vertical-timber'?.038:.014;
      for(let i=1;i<n;i++)box(-span/2+i*span/n,centre[2],width,height-.04);
    }else if(recipe.form==='horizontal-timber'){
      for(let i=1;i<5;i++)box(0,pane.z0+height*i/5,span-.035,.045,.032);
    }else if(recipe.form==='cross-timber'){
      const left=-span/2+.065,right=span/2-.065,bottom=pane.z0+.075,top=pane.z1-.075;
      if(right>left&&top>bottom){timberBrace(left,bottom,right,top);timberBrace(left,top,right,bottom);}
    }else if(recipe.form==='deco-metal'){
      const n=Math.max(1,Math.floor(span/recipe.spacing)),pitch=span/n;
      for(let i=0;i<n;i++){
        const x=-span/2+(i+.5)*pitch,half=pitch*.34,bottom=pane.z0+.11,top=pane.z1-.11;
        rod(x-half,bottom,x,top);rod(x,top,x+half,bottom);rod(x-half,bottom,x+half,bottom);
      }
    }
  }
  if(!positions.length)return;
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  const mesh=new THREE.Mesh(geometry,recipe.form.includes('timber')?(materials.wood||materials.metal):materials.metal);
  mesh.name='balcony-style-infill';mesh.castShadow=false;mesh.receiveShadow=false;
  mesh.userData.terraceCover={type:layout.type,part:'decorative-infill',opaque:false,analytical:false,guardForm:recipe.form};
  group.add(mesh);
}

/** The same finite boxes drive appearance, shade and privacy. Clear guard
 * glazing is translucent here and omitted from opaque analytical screens. */
export function createTerraceCoverGroup(layout,materials,svgMode=false,style=null){
  const group=new THREE.Group();group.name='terrace-cover';
  group.userData.terraceCoverType=layout?.type||'canopy';
  if(!layout?.enabled)return group;
  const recipe=getBalconyGuardRecipe(style);
  group.userData.guardForm=layout.type==='balcony'?recipe.form:null;
  let glass;
  for(const primitive of layout.boxes){
    const {x0,x1,y0,y1,z0,z1,part}=primitive;
    if(![x0,x1,y0,y1,z0,z1].every(Number.isFinite)||x1<=x0||y1<=y0||z1<=z0)continue;
    let material;
    if(part==='glass'){
      glass??=new THREE.MeshBasicMaterial({color:0xa9c9c0,transparent:true,opacity:svgMode ? .12 : .18,side:THREE.DoubleSide,depthWrite:false});
      glass.userData.transient=true;
      material=glass;
    }else if(['rail-post','rail'].includes(part))material=recipe.form.includes('timber')?(materials.wood||materials.metal):materials.metal;
    else if(part==='post')material=materials.metal;
    else if(part==='fascia'||part==='beam')material=materials.wood||materials.metal;
    else material=materials.stoneLight||materials.stone||materials.linen;
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(x1-x0,z1-z0,y1-y0),material);
    mesh.name=primitive.id;mesh.position.set(...toWorld((x0+x1)/2,(y0+y1)/2,(z0+z1)/2));
    mesh.castShadow=primitive.opaque!==false;mesh.receiveShadow=primitive.opaque!==false;
    mesh.userData.terraceCover={id:primitive.id,type:layout.type,part,opaque:primitive.opaque!==false};
    group.add(mesh);
  }
  addGuardInfill(group,layout,materials,recipe);
  return group;
}
