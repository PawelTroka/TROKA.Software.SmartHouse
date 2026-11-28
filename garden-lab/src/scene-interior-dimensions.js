import * as THREE from '../vendor/three.module.js';
import {interiorDimensions,interiorDimensionContext} from './interior-dimensions.js?v=1.41.0';
import {createDimensionOcclusionIndex} from './dimension-occlusion.js?v=1.41.0';

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
  let plans=[],labels=[],candidates=[],occlusion=null,houseFrame=null,enabled=true,lastSignature='',visibleCount=0,activeContext=null;
  let lastLayout=-Infinity,lastInteracting=false,layouts=0,projectionFrames=0;
  const projected=new THREE.Vector3(),forward=new THREE.Vector3(),direction=new THREE.Vector3();
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
    labels=[];candidates=[];visibleCount=0;note.hidden=true;
  }
  function update(nextPlans,{enabled:show=true,showFurniture=true,equipmentLabels=false,frame=null}={}){
    clear();plans=(Array.isArray(nextPlans)?nextPlans:[nextPlans]).filter(Boolean);houseFrame=frame;enabled=show!==false;
    occlusion=enabled?createDimensionOcclusionIndex(getOccluderRoots()):null;
    const identified=new Set(equipmentLabels?plans.flatMap(plan=>(plan.fixtures||[]).filter(f=>f.equipmentLabel).map(f=>f.id)):[]);
    for(const record of enabled?plans.flatMap(plan=>interiorDimensions(plan,{showFurniture})).filter(record=>record.kind!=='fixture'||!identified.has(record.feature)):[]){
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
      labels.push({record,element,line,positions:(record.anchors||[record.anchor]).map(toWorld),position:null,distance:0,sameRoom:false,shown:false});
    }
    candidates=labels.slice();invalidate();
  }
  function hideAll(){for(const label of labels){label.element.hidden=true;label.line.visible=false;label.shown=false;}visibleCount=0;note.hidden=true;activeContext=null;invalidate();}
  function projectVisible(camera,width,height){
    projectionFrames++;
    for(const label of labels)if(label.shown){
      projected.copy(label.position).project(camera);
      const hidden=projected.z< -1||projected.z>1||Math.abs(projected.x)>1||Math.abs(projected.y)>1;
      label.element.hidden=hidden;label.line.visible=!hidden;
      if(!hidden){label.element.style.left=`${(projected.x*.5+.5)*width}px`;label.element.style.top=`${(-projected.y*.5+.5)*height}px`;}
    }
  }
  function render(camera,width,height,{mode='dollhouse',floor,roomId,interacting=false,now=performance.now()}={}){
    if(!enabled||!width||!height||(shared&&!['walk','eye','room'].includes(mode))){hideAll();return;}
    camera.updateMatrixWorld(true);
    const local=toLocal(camera.position),context=interiorDimensionContext(plans,local,{floor,roomId,requireInside:shared});
    if(!context){hideAll();return;}
    const signature=`${width}:${height}:${mode}:${context.floor}:${context.roomId}:${camera.matrixWorld.elements.join(',')}:${camera.projectionMatrix.elements.join(',')}`;
    if(lastSignature===signature&&lastInteracting===interacting)return;
    // During a continuous walk only the already visible labels are projected
    // every frame. Exact visibility/layout is refreshed at most ten times/sec.
    if(interacting&&lastInteracting&&lastSignature&&now-lastLayout<100&&context.floor===activeContext?.floor&&context.roomId===activeContext?.roomId){projectVisible(camera,width,height);return;}
    lastLayout=now;lastInteracting=interacting;layouts++;
    lastSignature=signature;activeContext=context;camera.getWorldDirection(forward);visibleCount=0;
    const occupied=[],close=['walk','eye','room'].includes(mode),limit=width<600?(close?6:7):(close?10:14);
    occlusion?.refresh();
    for(const label of candidates){
      label.position=label.positions.reduce((near,p)=>p.distanceToSquared(camera.position)<near.distanceToSquared(camera.position)?p:near);
      label.sameRoom=context.roomId&&label.record.roomIds.includes(context.roomId);
      label.distance=label.position.distanceTo(camera.position);
    }
    candidates.sort((a,b)=>Number(b.sameRoom)-Number(a.sameRoom)||a.record.priority-b.record.priority||a.distance-b.distance);
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
        hidden=occlusion?.blocked(camera.position,direction.normalize(),Math.max(.05,distance-.10))||false;
      }
      label.shown=!hidden;label.element.hidden=hidden;label.line.visible=!hidden;
      if(!hidden){
        occupied.push(box);visibleCount++;label.element.style.left=`${x}px`;label.element.style.top=`${y}px`;
        label.element.classList.toggle('dimension-eye',close);
      }
    }
    note.hidden=visibleCount===0;
  }
  function dispose(){clear();material.dispose();group.removeFromParent();layer.remove();}
  return {update,render,invalidate,dispose,get group(){return group;},getDiagnostics(){return {enabled,total:labels.length,visible:visibleCount,floor:activeContext?.floor||null,roomId:activeContext?.roomId||null,layouts,projectionFrames,refreshIntervalMs:100,occlusion:occlusion?.getDiagnostics()||null};}};
}
