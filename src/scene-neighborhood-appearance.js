import * as THREE from '../vendor/three.module.js';
import {toWorld} from './orientation.js?v=1.37.0';
import {neighborhoodAppearanceLayout} from './neighborhood-appearance.js?v=1.37.0';

const transient=material=>{material.userData.transient=true;return material;};

/** Batches are shared across all observed buildings. Source masses remain the
 * occluders; these decorative panels do not acquire analytical shadow credit. */
export function createNeighborhoodAppearanceGroup(buildings,data,{origin=data?.site?.rearMidpoint||[10,18],svgMode=false}={}){
  const layout=neighborhoodAppearanceLayout(buildings,data,{origin,distanceLimit:svgMode?105:175});
  const group=new THREE.Group();group.name='observed-neighborhood-appearance';
  group.userData.appearanceProfiles=layout.profiles;
  group.userData.balconyCounts=layout.balconies.reduce((counts,balcony)=>{
    const key=`${balcony.buildingId}:${balcony.facadeDirection}:${balcony.type}`;
    counts[key]=(counts[key]||0)+1;return counts;
  },{});
  group.userData.evidence='User-supplied oblique imagery; facade geometry and colours are visual estimates.';
  const renderMaterial=parameters=>transient(svgMode?new THREE.MeshBasicMaterial({...parameters}):new THREE.MeshStandardMaterial({roughness:.88,metalness:0,...parameters}));
  const paint=renderMaterial({color:'#ffffff'}),metal=renderMaterial({color:'#62675f'}),slab=renderMaterial({color:'#bfc0b4'});

  function batch(items,material,plane,name){
    if(!items.length)return;
    const prototype=plane?new THREE.PlaneGeometry(1,1):new THREE.BoxGeometry(1,1,1);
    const dummy=new THREE.Object3D(),color=new THREE.Color();
    if(svgMode){
      // SVGRenderer does not render InstancedMesh. Merge transformed vertices
      // into one geometry and retain the same source-aligned visual layout.
      const primitive=prototype.toNonIndexed(),position=primitive.getAttribute('position'),normal=primitive.getAttribute('normal');
      const vertices=[],normals=[],colors=[],point=new THREE.Vector3(),direction=new THREE.Vector3(),normalMatrix=new THREE.Matrix3();
      for(const item of items){
        transform(dummy,item);normalMatrix.getNormalMatrix(dummy.matrix);
        color.set(item.color||'#ffffff');
        for(let i=0;i<position.count;i++){
          point.fromBufferAttribute(position,i).applyMatrix4(dummy.matrix);vertices.push(point.x,point.y,point.z);
          direction.fromBufferAttribute(normal,i).applyNormalMatrix(normalMatrix);normals.push(direction.x,direction.y,direction.z);
          colors.push(color.r,color.g,color.b);
        }
      }
      primitive.dispose();prototype.dispose();
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
      geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
      geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
      const m=material.clone();m.vertexColors=true;m.userData.transient=true;
      const mesh=new THREE.Mesh(geometry,m);mesh.name=name;group.add(mesh);return;
    }
    const mesh=new THREE.InstancedMesh(prototype,material,items.length);
    mesh.name=name;mesh.receiveShadow=true;mesh.castShadow=false;
    items.forEach((item,i)=>{
      transform(dummy,item);mesh.setMatrixAt(i,dummy.matrix);
      if(item.color)mesh.setColorAt(i,color.set(item.color));
    });
    mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    group.add(mesh);
  }
  function transform(dummy,item){
    dummy.position.set(...toWorld(item.x+item.nx*(item.offset||0),item.y+item.ny*(item.offset||0),item.z));
    dummy.rotation.set(0,item.angle,0);dummy.scale.set(item.width,item.height,item.depth||1);dummy.updateMatrix();
  }

  batch(layout.panels,paint,true,'observed-facade-colour-fields');
  batch(layout.parapets,paint,false,'observed-roof-edge-coping');
  batch(layout.doors,paint,true,'observed-apartment-entry-doors');
  batch(layout.entryCanopies,paint,false,'observed-entry-canopies');
  const slabs=[],fronts=[],rails=[],returns=[];
  for(const balcony of layout.balconies){
    if(balcony.type==='recessed'){
      // The reference shows a guard within the facade opening, not a projecting
      // slab. The dark aperture is in the existing shared colour-field batch.
      fronts.push({...balcony,z:balcony.balconyFloorZ+balcony.railHeight/2,width:balcony.width-.08,
        height:balcony.railHeight,depth:.045,offset:.075});
      rails.push({...balcony,z:balcony.balconyFloorZ+balcony.railHeight+.03,width:balcony.width,
        height:.035,depth:.035,offset:.095,color:null});
      continue;
    }
    const base={...balcony,z:balcony.slabZ,width:balcony.width,height:.12,depth:balcony.depth,offset:balcony.depth/2,color:null};
    slabs.push(base);
    fronts.push({...balcony,z:balcony.slabZ+.12+balcony.railHeight/2,width:balcony.width-.08,height:balcony.railHeight,depth:.045,offset:balcony.depth-.04});
    rails.push({...balcony,z:balcony.slabZ+.12+balcony.railHeight+.03,width:balcony.width,height:.035,depth:.035,offset:balcony.depth-.02,color:null});
    for(const sign of [-1,1]){
      const shift=sign*(balcony.width/2-.035),x=balcony.x+balcony.ny*shift,y=balcony.y-balcony.nx*shift;
      returns.push({...balcony,x,y,z:balcony.slabZ+.12+balcony.railHeight/2,width:.045,height:balcony.railHeight,depth:balcony.depth-.1,offset:balcony.depth/2});
      rails.push({...balcony,x,y,z:balcony.slabZ+.12+balcony.railHeight+.03,width:.035,height:.035,depth:balcony.depth,offset:balcony.depth/2,color:null});
    }
  }
  batch(slabs,slab,false,'observed-balcony-slabs');
  batch(fronts,paint,false,'observed-balcony-colour-fronts');
  batch(returns,paint,false,'observed-balcony-side-panels');
  batch(rails,metal,false,'observed-balcony-rails');
  // Empty materials are not attached to a mesh and cannot be found by the
  // parent's resource disposer. Dispose them here when their batches are empty.
  const used=new Set();group.traverse(object=>{if(object.material)used.add(object.material);});
  for(const material of [paint,metal,slab])if(!used.has(material))material.dispose();
  return group;
}
