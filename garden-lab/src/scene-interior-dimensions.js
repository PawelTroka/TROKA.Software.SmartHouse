import * as THREE from '../vendor/three.module.js';
import {interiorDimensions,interiorDimensionContext} from './interior-dimensions.js?v=1.39.0';

const opaque=material=>(Array.isArray(material)?material:[material]).some(m=>m&&(!m.transparent||m.opacity>=.85));
function visibleAncestors(object){for(let node=object;node;node=node.parent)if(!node.visible)return false;return true;}

/** Labels share one small geometry group. They only appear on the occupied
 * storey, resolve real mesh occlusion, and yield space to the nearest room.
 * Passing a house frame maps the exact same records into the garden renderer.
 */
export function createInteriorDimensionOverlay(container,scene,getOccluderRoots,{shared=false}={}){
  const group=new THREE.Group();group.name='interior-dimensions';group.userData.dimensionOverlay=true;scene.add(group);
  const material=new THREE.LineBasicMaterial({color:'#9a9f86',transparent:true,opacity:.40,depthTest:true,depthWrite:false,toneMapped:false,fog:false});
  const layer=document.createElement('div');layer.className='scene-dimension-layer interior-dimension-layer';
  layer.setAttribute('aria-label','Approximate interior model dimensions in metres and square metres');container.append(layer);
  const note=document.createElement('span');note.className='interior-dimension-note';note.textContent='Approx. model dimensions · m / m²';note.hidden=true;layer.append(note);
  let plans=[],labels=[],occluders=[],houseFrame=null,enabled=true,lastSignature='',visibleCount=0,activeContext=null;
  const projected=new THREE.Vector3(),forward=new THREE.Vector3(),direction=new THREE.Vector3(),raycaster=new THREE.Raycaster();
  const toWorld=p=>{
    if(!houseFrame)return new THREE.Vector3(...p);
    const [x,z,y]=houseFrame.toSite(p[0],p[2],p[1]);return new THREE.Vector3(x,y,z);
  };
  const toLocal=p=>{
    if(!houseFrame)return p.toArray();
    const [x,z,y]=houseFrame.toLocal(p.x,p.z,p.y);return [x,y,z];
  };
  function invalidate(){lastSignature='';}
  function clear(){
    for(const label of labels){label.element.remove();label.line.geometry.dispose();group.remove(label.line);}
    labels=[];visibleCount=0;note.hidden=true;
  }
  function update(nextPlans,{enabled:show=true,showFurniture=true,frame=null}={}){
    clear();plans=(Array.isArray(nextPlans)?nextPlans:[nextPlans]).filter(Boolean);houseFrame=frame;enabled=show!==false;
    occluders=[];
    for(const root of getOccluderRoots().filter(Boolean)){
      root.updateWorldMatrix(true,true);
      root.traverse(object=>{if(object.isMesh&&!object.isInstancedMesh&&opaque(object.material))occluders.push(object);});
    }
    for(const record of enabled?plans.flatMap(plan=>interiorDimensions(plan,{showFurniture})):[]){
      const element=document.createElement('span');element.className='scene-dimension-label interior-dimension-label';
      element.dataset.interiorDimension=record.id;element.dataset.dimensionKind=record.kind;element.dataset.dimensionFloor=record.floor;
      element.setAttribute('aria-label',record.description+' '+record.datum);element.title=element.getAttribute('aria-label');element.hidden=true;
      const title=document.createElement('strong');title.textContent=record.title;
      const measure=document.createElement('span');measure.textContent=record.text;element.append(title,measure);layer.append(element);
      const vertices=[];
      for(const pair of record.lines){
        const [a,b]=pair.map(toWorld),delta=b.clone().sub(a),normal=new THREE.Vector3(-delta.z,0,delta.x).normalize().multiplyScalar(.045);
        vertices.push(a,b,a.clone().sub(normal),a.clone().add(normal),b.clone().sub(normal),b.clone().add(normal));
      }
      const line=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(vertices),material);
      line.name=record.id;line.visible=false;line.renderOrder=3;group.add(line);
      labels.push({record,element,line,positions:(record.anchors||[record.anchor]).map(toWorld)});
    }
    invalidate();
  }
  function hideAll(){for(const label of labels){label.element.hidden=true;label.line.visible=false;}visibleCount=0;note.hidden=true;activeContext=null;invalidate();}
  function render(camera,width,height,{mode='dollhouse',floor,roomId}={}){
    if(!enabled||!width||!height||(shared&&!['walk','eye','room'].includes(mode))){hideAll();return;}
    camera.updateMatrixWorld(true);
    const local=toLocal(camera.position),context=interiorDimensionContext(plans,local,{floor,roomId,requireInside:shared});
    if(!context){hideAll();return;}
    const signature=`${width}:${height}:${mode}:${context.floor}:${context.roomId}:${camera.matrixWorld.elements.join(',')}:${camera.projectionMatrix.elements.join(',')}`;
    if(lastSignature===signature)return;
    lastSignature=signature;activeContext=context;camera.getWorldDirection(forward);visibleCount=0;
    const occupied=[],close=['walk','eye','room'].includes(mode),limit=width<600?(close?6:7):(close?10:14);
    // Hiding a parent cutaway also removes its meshes from label occlusion.
    const visibleOccluders=occluders.filter(visibleAncestors);
    const candidates=labels.map(label=>{
      const position=label.positions.reduce((near,p)=>p.distanceToSquared(camera.position)<near.distanceToSquared(camera.position)?p:near);
      const sameRoom=context.roomId&&label.record.roomIds.includes(context.roomId);
      return {...label,position,distance:position.distanceTo(camera.position),sameRoom};
    }).sort((a,b)=>Number(b.sameRoom)-Number(a.sameRoom)||a.record.priority-b.record.priority||a.distance-b.distance);
    for(const label of candidates){
      const {record,position,distance}=label;
      projected.copy(position).project(camera);direction.copy(position).sub(camera.position);
      let hidden=record.floor!==context.floor||distance<.23||direction.dot(forward)<0||projected.z>1||projected.z< -1||Math.abs(projected.x)>.98||Math.abs(projected.y)>.96||visibleCount>=limit;
      // The wide dollhouse gives each room one summary. Zooming closer reveals
      // fittings and apertures, while eye level retains the useful nearby detail.
      if(!close&&record.kind!=='room'&&distance>12)hidden=true;
      if(close&&distance>(record.kind==='room'?9:7))hidden=true;
      const x=(projected.x*.5+.5)*width,y=(-projected.y*.5+.5)*height;
      const textWidth=Math.max(record.title.length*5.5,record.text.length*5.1)+14,box={x:x-textWidth/2,y:y-17,w:textWidth,h:32};
      if(box.x<5||box.x+box.w>width-5||box.y<10||box.y+box.h>height-52)hidden=true;
      if(!hidden&&occupied.some(r=>box.x<r.x+r.w+8&&box.x+box.w+8>r.x&&box.y<r.y+r.h+6&&box.y+box.h+6>r.y))hidden=true;
      if(!hidden){
        raycaster.set(camera.position,direction.normalize());raycaster.near=.035;raycaster.far=Math.max(.05,distance-.10);
        hidden=raycaster.intersectObjects(visibleOccluders,false).length>0;
      }
      label.element.hidden=hidden;label.line.visible=!hidden;
      if(!hidden){
        occupied.push(box);visibleCount++;label.element.style.left=`${x}px`;label.element.style.top=`${y}px`;
        label.element.classList.toggle('dimension-eye',close);
      }
    }
    note.hidden=visibleCount===0;
  }
  function dispose(){clear();material.dispose();group.removeFromParent();layer.remove();}
  return {update,render,invalidate,dispose,get group(){return group;},getDiagnostics(){return {enabled,total:labels.length,visible:visibleCount,floor:activeContext?.floor||null,roomId:activeContext?.roomId||null};}};
}
