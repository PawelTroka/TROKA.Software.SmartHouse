import * as THREE from '../vendor/three.module.js';
import {interiorDimensionContext} from './interior-dimensions.js?v=1.41.0';
import {createDimensionOcclusionIndex} from './dimension-occlusion.js?v=1.41.0';

/** Identification is independent of measurement display. Anchors sit in front
 * of the actual joinery face, so a concealed appliance can still be found. */
export function equipmentLabelRecords(plan){
  if(!plan)return [];
  const records=[];
  for(const f of plan.fixtures||[]){
    const label=f.equipmentLabel;
    if(!label)continue;
    const front=f.front||[0,-1],reach=(Math.abs(front[0])*(f.width||0)+Math.abs(front[1])*(f.depth||0))/2+.055;
    const y=label.anchorHeight??((f.baseHeight||0)+Math.min(f.height||.9,1.7)*.6);
    const local=label.anchor||[f.x+front[0]*reach,y,f.z+front[1]*reach];
    records.push({id:f.id,title:label.title||f.id,detail:label.detail||'',floor:plan.floor,roomId:f.roomId||null,
      anchor:[local[0],(plan.elevation||0)+local[1],local[2]],priority:label.priority??0});
  }
  return records;
}

export function createEquipmentLabelOverlay(container,scene,getOccluderRoots,{shared=false}={}){
  const layer=document.createElement('div');layer.className='scene-dimension-layer equipment-label-layer';
  layer.setAttribute('aria-label','Integrated appliances and concealed storage');container.append(layer);
  const projected=new THREE.Vector3(),direction=new THREE.Vector3(),forward=new THREE.Vector3();
  let plans=[],labels=[],visible=[],frame=null,enabled=true,index=null,lastLayout=-Infinity,lastContext='',lastSignature='',context=null,layoutPasses=0;
  function hideAll(){for(const label of visible)label.element.hidden=true;visible=[];context=null;lastContext='';lastSignature='';}
  function invalidate(){lastLayout=-Infinity;lastSignature='';}
  function update(nextPlans,{enabled:show=true,showFurniture=true,frame:nextFrame=null}={}){
    hideAll();layer.replaceChildren();plans=(Array.isArray(nextPlans)?nextPlans:[nextPlans]).filter(Boolean);
    frame=nextFrame;enabled=show!==false&&showFurniture!==false;labels=[];
    if(enabled){
      index=createDimensionOcclusionIndex(getOccluderRoots().filter(Boolean));
      for(const record of plans.flatMap(equipmentLabelRecords)){
        const element=document.createElement('span');element.className='scene-dimension-label equipment-label';
        element.dataset.equipmentId=record.id;element.dataset.equipmentFloor=record.floor;
        element.setAttribute('aria-label',`${record.title}. ${record.detail}`);element.title=`${record.title}. ${record.detail}`;element.hidden=true;
        const title=document.createElement('strong'),detail=document.createElement('span');title.textContent=record.title;detail.textContent=record.detail;element.append(title,detail);layer.append(element);
        const p=frame?frame.toSite(record.anchor[0],record.anchor[2],record.anchor[1]):null;
        const position=p?new THREE.Vector3(p[0],p[2],p[1]):new THREE.Vector3(...record.anchor);
        labels.push({record,element,position,distance:0,x:0,y:0,w:Math.min(214,Math.max(record.title.length*5.5,Math.min(38,record.detail.length)*4.9)+18),h:record.detail.length>38?45:34});
      }
    }else index=null;
    invalidate();
  }
  function project(label,camera,width,height){
    projected.copy(label.position).project(camera);direction.copy(label.position).sub(camera.position);
    if(direction.dot(forward)<=0||projected.z>1||projected.z< -1||Math.abs(projected.x)>.98||Math.abs(projected.y)>.95)return false;
    label.x=(projected.x*.5+.5)*width;label.y=(-projected.y*.5+.5)*height;
    return label.x-label.w/2>6&&label.x+label.w/2<width-6&&label.y-label.h/2>8&&label.y+label.h/2<height-48;
  }
  function position(label){label.element.style.transform=`translate3d(${label.x.toFixed(1)}px,${label.y.toFixed(1)}px,0) translate(-50%,-50%)`;}
  function render(camera,width,height,{mode='dollhouse',floor,roomId,now=performance.now()}={}){
    if(!enabled||!width||!height||(shared&&!['walk','eye','room'].includes(mode))){hideAll();return;}
    camera.updateMatrixWorld(true);
    const p=frame?frame.toLocal(camera.position.x,camera.position.z,camera.position.y):null;
    context=interiorDimensionContext(plans,p?[p[0],p[2],p[1]]:camera.position.toArray(),{floor,roomId,requireInside:shared});
    if(!context){hideAll();return;}
    const contextKey=`${width}:${height}:${mode}:${context.floor}:${context.roomId}`;
    const signature=`${contextKey}:${camera.matrixWorld.elements.join(',')}:${camera.projectionMatrix.elements.join(',')}`;
    if(signature===lastSignature)return;
    const changed=signature!==lastSignature;lastSignature=signature;camera.getWorldDirection(forward);
    if(contextKey!==lastContext||now-lastLayout>=120){
      lastContext=contextKey;lastLayout=now;layoutPasses++;index?.refresh();
      for(const label of visible)label.element.hidden=true;visible=[];
      const close=['walk','eye','room'].includes(mode),limit=width<600?3:close?6:7;
      for(const label of labels)label.distance=label.position.distanceTo(camera.position);
      labels.sort((a,b)=>Number(b.record.roomId===context.roomId)-Number(a.record.roomId===context.roomId)||a.record.priority-b.record.priority||a.distance-b.distance);
      for(const label of labels){
        if(visible.length>=limit)break;
        if(label.record.floor!==context.floor||label.distance<(close ? .18 : .1)||label.distance>(close?6.8:18)||!project(label,camera,width,height))continue;
        if(visible.some(other=>Math.abs(label.x-other.x)<(label.w+other.w)/2+9&&Math.abs(label.y-other.y)<(label.h+other.h)/2+7))continue;
        direction.copy(label.position).sub(camera.position).normalize();
        if(index?.blocked(camera.position,direction,Math.max(.05,label.distance-.045)))continue;
        label.element.hidden=false;position(label);visible.push(label);
      }
    }else if(changed){
      // Only the few visible labels are projected at frame rate. Visibility
      // and collision layout stay bounded to ten updates per second.
      for(const label of visible){label.element.hidden=!project(label,camera,width,height);if(!label.element.hidden)position(label);}
    }
  }
  function dispose(){hideAll();labels=[];plans=[];index=null;layer.remove();}
  return {update,render,invalidate,dispose,getDiagnostics:()=>({enabled,total:labels.length,visible:visible.filter(label=>!label.element.hidden).length,floor:context?.floor||null,layoutPasses,occlusion:index?.getDiagnostics()||null})};
}
