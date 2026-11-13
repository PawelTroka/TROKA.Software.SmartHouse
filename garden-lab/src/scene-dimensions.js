import * as THREE from '../vendor/three.module.js';
import {toWorld} from './orientation.js?v=1.13.0';

const point=p=>new THREE.Vector3(...toWorld(...p));
const same=(a,b)=>a.every((v,i)=>Math.abs(v-b[i])<1e-8);

/** Thin world-space geometry; its depth test stops lines showing through walls. */
export function createDimensionGroup(records){
  const group=new THREE.Group();group.name='proposal-dimensions';
  group.userData.dimensionOverlay=true;
  const material=new THREE.LineBasicMaterial({color:'#d5cba8',transparent:true,opacity:.5,
    depthTest:true,depthWrite:false,toneMapped:false,fog:false});
  material.userData.transient=true;
  for(const record of records){
    const a=point(record.lineA),b=point(record.lineB),delta=b.clone().sub(a),vertices=[a,b];
    const vertical=Math.abs(delta.y)>Math.hypot(delta.x,delta.z);
    const normal=vertical?new THREE.Vector3(1,0,0):new THREE.Vector3(-delta.z,0,delta.x).normalize();
    const tick=normal.multiplyScalar(.09);
    vertices.push(a.clone().sub(tick),a.clone().add(tick),b.clone().sub(tick),b.clone().add(tick));
    if(!same(record.a,record.lineA)||!same(record.b,record.lineB))vertices.push(point(record.a),a,point(record.b),b);
    const line=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(vertices),material);
    line.name=record.id;line.renderOrder=3;line.userData.dimensionId=record.id;
    group.add(line);
  }
  return group;
}

/**
 * Screen-space lettering stays small at every zoom. Labels use an actual mesh
 * ray test, so an unseen feature never prints its dimensions through a wall.
 * This also works with the SVG renderer, where canvas-texture sprites do not.
 */
export function createDimensionOverlay(container,scene,getOccluderRoots){
  let group=new THREE.Group(),labels=[],occluders=[];
  let lastCameraSignature='';
  const layer=document.createElement('div');layer.className='scene-dimension-layer';
  layer.setAttribute('aria-label','Approximate proposal dimensions in metres');
  container.append(layer);scene.add(group);
  const projected=new THREE.Vector3(),direction=new THREE.Vector3(),forward=new THREE.Vector3(),raycaster=new THREE.Raycaster();

  function clear(){
    const materials=new Set();
    group.traverse(o=>{o.geometry?.dispose();if(o.material)materials.add(o.material);});
    materials.forEach(m=>m.dispose());scene.remove(group);
    labels.forEach(l=>l.element.remove());labels=[];
  }
  function update(records){
    clear();group=createDimensionGroup(records);scene.add(group);
    lastCameraSignature='';
    occluders=[];
    for(const root of getOccluderRoots())root.traverse(object=>{
      // Thuja clusters, window trims, jets and low shrubs are decorations.
      // Their continuous hedge/building bodies already provide the occlusion;
      // testing thousands of individual instances would multiply each label ray.
      if(!object.isMesh||object.isInstancedMesh||!object.visible)return;
      const materials=Array.isArray(object.material)?object.material:[object.material];
      if(!materials.some(m=>m&&(!m.transparent||m.opacity>=.85)))return;
      occluders.push(object);
    });
    labels=records.filter(record=>record.sceneText!==null).sort((a,b)=>a.priority-b.priority).map(record=>{
      const element=document.createElement('span');element.className='scene-dimension-label';
      element.textContent=record.sceneText||record.text;
      element.dataset.dimension=record.id;
      element.setAttribute('aria-label',`${record.description||record.id}: ${record.text}${record.datum?`, ${record.datum}`:''}`);
      element.title=element.getAttribute('aria-label');layer.append(element);
      return {element,record,position:point(record.anchor)};
    });
  }
  function render(camera,width,height,mode='orbit'){
    const signature=`${width}:${height}:${mode}:${camera.matrixWorld.elements.join(',')}:${camera.projectionMatrix.elements.join(',')}`;
    if(signature===lastCameraSignature)return;
    lastCameraSignature=signature;
    camera.getWorldDirection(forward);
    const occupied=[];
    for(const label of labels){
      projected.copy(label.position).project(camera);
      direction.copy(label.position).sub(camera.position);
      const distance=direction.length();
      let hidden=distance<.25||direction.dot(forward)<0||projected.z>1||projected.z< -1||Math.abs(projected.x)>1.02||Math.abs(projected.y)>1.02;
      const x=(projected.x*.5+.5)*width,y=(-projected.y*.5+.5)*height;
      const textWidth=(label.record.sceneText||label.record.text).length*5.2+10;
      // Preserve essential clearances first. A close eye view may show more
      // detail, while competing labels on the far side defer to the plan.
      const box={x:x-textWidth/2,y:y-9,w:textWidth,h:15};
      if(!hidden&&occupied.some(r=>box.x<r.x+r.w+4&&box.x+box.w+4>r.x&&box.y<r.y+r.h+3&&box.y+box.h+3>r.y))hidden=true;
      if(!hidden){
        raycaster.set(camera.position,direction.normalize());raycaster.near=.04;raycaster.far=Math.max(.05,distance-.16);
        const hits=raycaster.intersectObjects(occluders,false);
        hidden=hits.some(hit=>hit.object.visible&&(!hit.object.material?.transparent||hit.object.material.opacity>=.85));
      }
      label.element.hidden=hidden;
      if(!hidden){
        occupied.push(box);label.element.style.left=`${x}px`;label.element.style.top=`${y}px`;
        label.element.classList.toggle('dimension-eye',mode==='eye');
      }
    }
  }
  function dispose(){clear();layer.remove();}
  return {update,render,dispose,get group(){return group;}};
}
