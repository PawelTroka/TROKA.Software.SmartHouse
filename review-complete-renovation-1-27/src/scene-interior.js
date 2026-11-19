import * as THREE from '../vendor/three.module.js';
import {OrbitControls} from '../vendor/OrbitControls.js?v=1.26.0';
import {buildArchitecture} from './interior-architecture.js?v=1.26.0';
import {containsPoint,modelTools,ringBounds} from './interior-geometry.js?v=1.26.0';
import {interiorEnvironment,interiorMaterials} from './interior-materials.js?v=1.26.0';
import {roomPose,walkGeometry} from './interior-navigation.js?v=1.26.0';
import {renderBudget} from './render-quality.js?v=1.26.0';

const walkKeys=new Map([['KeyW','forward'],['ArrowUp','forward'],['KeyS','back'],['ArrowDown','back'],['KeyA','left'],['ArrowLeft','left'],['KeyD','right'],['ArrowRight','right']]);
const DEFAULTS={view:'dollhouse',styleId:'current',roomId:null,showChanges:false,showFurniture:true,showCeiling:true};
export function createInteriorScene(container,callbacks={}) {
  let renderer;
  try {renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});} catch(error){
    const message='WebGL is unavailable. The floor plan remains available.';callbacks.onError?.(message);
    return {update(){},dispose(){},resize(){},home(){},setVisible(){},getDiagnostics:()=>({available:false,error:message})};
  }
  const canvas=renderer.domElement;canvas.setAttribute('aria-label','Interactive three-dimensional house interior');canvas.setAttribute('role','region');canvas.tabIndex=0;canvas.dataset.interiorRenderer='webgl';
  Object.assign(canvas.style,{display:'block',width:'100%',height:'100%',touchAction:'none',outlineOffset:'-3px'});container.append(canvas);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
  const world=new THREE.Scene(),env=interiorEnvironment(renderer);world.environment=env.env;
  const camera=new THREE.PerspectiveCamera(35,1,.035,140),orbit=new OrbitControls(camera,canvas);
  orbit.enableDamping=true;orbit.dampingFactor=.13;orbit.minPolarAngle=.06;orbit.maxPolarAngle=Math.PI*.475;orbit.minDistance=4.2;orbit.maxDistance=57;
  const sky=new THREE.HemisphereLight(0xf8fbff,0xa8997f,1.05);world.add(sky);
  const sun=new THREE.DirectionalLight(0xffeed2,2.35);sun.castShadow=true;sun.shadow.camera.near=.1;sun.shadow.camera.far=47;Object.assign(sun.shadow.camera,{left:-12,right:12,top:12,bottom:-12});sun.shadow.bias=-.00020;sun.shadow.normalBias=.014;world.add(sun,sun.target);
  const fill=new THREE.DirectionalLight(0xd5e6ed,.60);fill.position.set(0,7,12);world.add(fill);
  const lamp=new THREE.PointLight(0xffd39a,0,8,2);world.add(lamp);
  const shadowMat=new THREE.ShadowMaterial({opacity:.145,depthWrite:false}),shadow=new THREE.Mesh(new THREE.PlaneGeometry(130,130),shadowMat);shadow.rotation.x=-Math.PI/2;shadow.receiveShadow=true;world.add(shadow);
  const abort=new AbortController(),listen=(node,e,fn,options={})=>node.addEventListener(e,fn,{...options,signal:abort.signal});
  let plan,state={...DEFAULTS},model,finishes,clear,context,contextKey='',raf=0,visible=true,disposed=false,dirtyShadow=true,lastTime=0;
  let yaw=0,pitch=0,eye=1.57,down=null,drag=null,drawn=0,meshCount=0,activeStyle='',sizeW=0,sizeH=0;
  const keys=new Set(),ray=new THREE.Raycaster(),floorPlane=new THREE.Plane(new THREE.Vector3(0,1,0));
  const tools=modelTools();
  const pad=document.createElement('div');pad.setAttribute('aria-label','Walk controls');pad.dataset.interiorWalkControls='';
  Object.assign(pad.style,{position:'absolute',bottom:'15px',right:'12px',display:'none',gridTemplateColumns:'repeat(3,35px)',gap:'3px',zIndex:'2'});
  for(const [dir,label,glyph,col,row] of [['forward','Walk forward','↑',2,1],['left','Step left','←',1,2],['back','Step back','↓',2,2],['right','Step right','→',3,2]]){
    const b=document.createElement('button');b.type='button';b.setAttribute('aria-label',label);b.title=label;b.textContent=glyph;
    Object.assign(b.style,{gridColumn:String(col),gridRow:String(row),height:'34px',minHeight:0,padding:0,background:'#f8f7efd9',border:'1px solid #59645b61',borderRadius:'7px',color:'#29392d',fontSize:'17px',touchAction:'none',cursor:'pointer'});
    listen(b,'pointerdown',e=>{if(e.button!==0)return;e.preventDefault();b.setPointerCapture(e.pointerId);keys.add(dir);request();});listen(b,'pointerup',()=>keys.delete(dir));listen(b,'lostpointercapture',()=>keys.delete(dir));
    listen(b,'click',e=>{if(e.detail===0&&plan&&state.view==='room'){move(dir==='right'?1:dir==='left'?-1:0,dir==='forward'?1:dir==='back'?-1:0,.24);request();}});pad.append(b);
  }
  container.append(pad);
  function request(){if(!raf&&!disposed&&visible&&plan)raf=requestAnimationFrame(frame);}
  function orient(){camera.rotation.order='YXZ';camera.rotation.y=-yaw;camera.rotation.x=pitch;camera.rotation.z=0;}
  function move(right,forward,distance){
    const norm=Math.hypot(right,forward);if(!norm)return;
    const dx=(Math.cos(yaw)*right+Math.sin(yaw)*forward)/norm*distance,dz=(Math.sin(yaw)*right-Math.cos(yaw)*forward)/norm*distance;
    // Independent axes slide along walls. Small substeps prevent crossing thin partitions at low frame rates.
    const n=Math.max(1,Math.ceil(distance/.07));for(let i=0;i<n;i++){
      if(clear(camera.position.x+dx/n,camera.position.z,state.showFurniture))camera.position.x+=dx/n;
      if(clear(camera.position.x,camera.position.z+dz/n,state.showFurniture))camera.position.z+=dz/n;
    }
  }
  function frame(now){
    raf=0;if(disposed||!visible||!model)return;
    const dt=Math.max(0,Math.min(.056,(now-lastTime)/1000||0));lastTime=now;
    const walking=state.view==='room'&&keys.size>0;
    if(walking)move(Number(keys.has('right'))-Number(keys.has('left')),Number(keys.has('forward'))-Number(keys.has('back')),dt*1.68);
    if(orbit.enabled)orbit.update();
    if(model.updateVisibility(state.view,camera.position,state))dirtyShadow=true;
    if(dirtyShadow){renderer.shadowMap.needsUpdate=true;dirtyShadow=false;}
    renderer.render(world,camera);drawn++;
    if(walking)request();
  }
  function fitDollhouse(){
    const p=[...plan.envelope.outline,...(plan.outdoor||[]).flatMap(s=>s.polygon)],b=ringBounds(p),center=new THREE.Vector3(b.x,plan.elevation+.46,b.z);
    camera.fov=34;camera.updateProjectionMatrix();orbit.target.copy(center);
    const dir=new THREE.Vector3(.46,.94,1.02).normalize(),right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),dir).normalize(),up=new THREE.Vector3().crossVectors(dir,right).normalize();
    const tan=Math.tan(THREE.MathUtils.degToRad(camera.fov*.5));let distance=5;
    for(const [x,z] of p)for(const y of [-.45,plan.clearHeight]){
      const v=new THREE.Vector3(x,plan.elevation+y,z).sub(center),toward=v.dot(dir);
      distance=Math.max(distance,toward+Math.abs(v.dot(right))/(tan*camera.aspect),toward+Math.abs(v.dot(up))/tan);
    }
    camera.position.copy(center).addScaledVector(dir,distance*1.075);orbit.update();
  }
  function home(){
    if(!plan||!model)return;keys.clear();
    if(state.view==='room'){
      const room=plan.rooms.find(r=>r.id===state.roomId)||plan.rooms[0],pose=roomPose(plan,room,clear,state.showFurniture);
      yaw=pose.yaw;pitch=pose.pitch;eye=pose.eye;camera.position.set(pose.x,plan.elevation+eye,pose.z);camera.fov=70;camera.updateProjectionMatrix();orient();
      const b=ringBounds(room.polygon);lamp.position.set(b.x,plan.elevation+Math.min(plan.clearHeight-.17,2.23),b.z);lamp.intensity=plan.floor==='basement'?9:6;
    }else{fitDollhouse();lamp.intensity=0;}
    dirtyShadow=true;request();
  }
  function resize(){
    if(disposed)return;const rect=container.getBoundingClientRect(),w=Math.round(rect.width),h=Math.round(rect.height);if(!w||!h)return;
    if(w===sizeW&&h===sizeH)return;const oldAspect=camera.aspect;sizeW=w;sizeH=h;
    const budget=renderBudget('auto',w,h,window.devicePixelRatio||1,{memoryGB:navigator.deviceMemory,maxTextureSize:renderer.capabilities.maxTextureSize});renderer.setPixelRatio(budget.pixelRatio);renderer.setSize(w,h,false);
    const shadowSize=Math.min(1536,budget.shadowSize);if(sun.shadow.mapSize.width!==shadowSize){sun.shadow.mapSize.set(shadowSize,shadowSize);sun.shadow.map?.dispose();sun.shadow.map=null;dirtyShadow=true;}
    camera.aspect=w/h;camera.updateProjectionMatrix();if(plan&&state.view==='dollhouse'&&Math.abs(oldAspect-camera.aspect)>.13)fitDollhouse();request();
  }
  function update(nextPlan,options={}){
    if(disposed)return;const old=state,changedPlan=plan!==nextPlan;plan=nextPlan;state={...DEFAULTS,...options};
    const changedModel=changedPlan||old.styleId!==state.styleId||old.showChanges!==state.showChanges;
    if(changedModel){model?.dispose();if(!finishes||activeStyle!==state.styleId){finishes?.dispose();finishes=interiorMaterials(state.styleId);activeStyle=state.styleId;}
      model=buildArchitecture(plan,{...state,showOutdoor:!callbacks.getExteriorContext,showExterior:!callbacks.getExteriorContext},tools,finishes);world.add(model.root);clear=walkGeometry(plan);meshCount=0;model.root.traverse(o=>{if(o.isMesh)meshCount++;});
      sun.target.position.set(plan.envelope.width/2,plan.elevation,3);sun.position.copy(sun.target.position).add(new THREE.Vector3(-7.5,12,-6.5));
      const lowest=Math.min(-.24,...(plan.stairs||[]).filter(s=>s.to===plan.floor).map(s=>-s.rise));shadow.position.set(plan.envelope.width/2,plan.elevation+lowest-.075,plan.envelope.depth/2);dirtyShadow=true;
    }
    const nextContextKey=[state.contextKey,plan.floor,state.view==='room'?'room':'dollhouse'].join('|');
    if(callbacks.getExteriorContext&&contextKey!==nextContextKey){context?.dispose();context=callbacks.getExteriorContext(plan.floor,state.view);contextKey=nextContextKey;if(context)world.add(context.root);dirtyShadow=true;}
    if(context?.lighting){const l=context.lighting;sun.color.setHex(l.sunColor);sun.intensity=l.sunIntensity;sky.color.setHex(l.skyColor);sky.groundColor.setHex(l.groundColor);sky.intensity=l.ambientIntensity;
      sun.position.copy(sun.target.position).add(new THREE.Vector3(...l.sunDirection).multiplyScalar(20));}
    orbit.enabled=state.view!=='room';const room=!orbit.enabled;world.background=new THREE.Color(room&&context?.lighting?context.lighting.background:'#e5e6dc');world.backgroundBlurriness=0;shadow.visible=!room;pad.style.display=room?'grid':'none';
    canvas.style.cursor=room?'crosshair':'grab';resize();
    if(changedPlan||old.view!==state.view||(room&&old.roomId!==state.roomId))home();
    else if(old.showFurniture!==state.showFurniture||old.showCeiling!==state.showCeiling)dirtyShadow=true;
    request();
  }
  orbit.addEventListener('change',()=>{if(orbit.enabled)request();});
  listen(canvas,'pointerdown',e=>{if(e.button!==0)return;canvas.focus({preventScroll:true});down={x:e.clientX,y:e.clientY,id:e.pointerId};if(state.view==='room'){drag={...down};canvas.setPointerCapture(e.pointerId);} });
  listen(canvas,'pointermove',e=>{if(!drag||e.pointerId!==drag.id||state.view!=='room')return;yaw+=(e.clientX-drag.x)*.0043;pitch=THREE.MathUtils.clamp(pitch-(e.clientY-drag.y)*.0043,-1.24,1.24);drag.x=e.clientX;drag.y=e.clientY;orient();request();});
  listen(canvas,'pointerup',e=>{
    if(!down||e.pointerId!==down.id)return;const clicked=Math.hypot(e.clientX-down.x,e.clientY-down.y)<5;down=drag=null;
    if(!clicked||!plan||state.view!=='dollhouse')return;
    const rect=canvas.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2(2*(e.clientX-rect.left)/rect.width-1,1-2*(e.clientY-rect.top)/rect.height),camera);floorPlane.constant=-plan.elevation-.01;
    const point=new THREE.Vector3();if(ray.ray.intersectPlane(floorPlane,point)){const room=plan.rooms.find(r=>containsPoint(r.polygon,point.x,point.z));if(room)callbacks.onRoomSelect?.(room.id);}
  });
  listen(canvas,'pointercancel',()=>{down=drag=null;});listen(canvas,'keydown',e=>{const k=walkKeys.get(e.code);if(!k||state.view!=='room')return;e.preventDefault();keys.add(k);request();});
  listen(canvas,'keyup',e=>keys.delete(walkKeys.get(e.code)));listen(canvas,'blur',()=>keys.clear());listen(window,'blur',()=>{keys.clear();down=drag=null;});
  listen(canvas,'webglcontextlost',e=>{e.preventDefault();if(!disposed)callbacks.onError?.('The 3D graphics context was interrupted.');});
  const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(resize):null;observer?.observe(container);listen(window,'resize',resize);
  function setVisible(value){visible=!!value;if(visible){resize();request();}else{keys.clear();drag=down=null;cancelAnimationFrame(raf);raf=0;lastTime=0;}}
  return {update,home,resize,setVisible,getDiagnostics(){return {available:!disposed,visible,view:state.view,styleId:state.styleId,roomId:state.roomId,floor:plan?.floor,layout:plan?.layout,wallCount:plan?.walls.length||0,furnitureCount:state.showFurniture?plan?.fixtures.length||0:0,meshes:meshCount,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,frames:drawn,framePending:!!raf,camera:camera.position.toArray(),eyeHeight:eye,contextSource:context?.source||null,contextKey,renovationFeatures:finishes?.interiorRecipe?.features||[]};},
    dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(raf);abort.abort();observer?.disconnect();orbit.dispose();model?.dispose();context?.dispose();finishes?.dispose();tools.dispose();env.dispose();shadow.geometry.dispose();shadowMat.dispose();sun.shadow.dispose();renderer.dispose();renderer.forceContextLoss();canvas.remove();pad.remove();}
  };
}
