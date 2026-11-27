import * as THREE from '../vendor/three.module.js';

/** Reflector camera and oblique clipping follow the r160 Three.js Reflector
 * construction (MIT; ../vendor/THREE-LICENSE.txt). This view is captured once
 * after navigation settles; the cached image costs no second scene draw while
 * walking. The physical environment material remains the initial fallback. */
export function updateMirrorCamera(source,surface,virtual,textureMatrix){
  source.updateMatrixWorld(true);surface.updateWorldMatrix(true,false);
  const point=new THREE.Vector3().setFromMatrixPosition(surface.matrixWorld);
  const normal=new THREE.Vector3(...(surface.userData.mirrorLocalNormal||[0,0,1])).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(surface.matrixWorld));
  const position=new THREE.Vector3().setFromMatrixPosition(source.matrixWorld),distance=position.clone().sub(point).dot(normal);
  if(!source.isPerspectiveCamera||distance<=.015)return false;
  const rotation=new THREE.Matrix4().extractRotation(source.matrixWorld),forward=new THREE.Vector3(0,0,-1).applyMatrix4(rotation).reflect(normal);
  virtual.position.copy(position).addScaledVector(normal,-2*distance);
  virtual.up.set(0,1,0).applyMatrix4(rotation).reflect(normal);virtual.lookAt(virtual.position.clone().add(forward));
  virtual.near=source.near;virtual.far=source.far;virtual.layers.mask=source.layers.mask;virtual.updateMatrixWorld(true);
  virtual.projectionMatrix.copy(source.projectionMatrix);
  textureMatrix.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1).multiply(virtual.projectionMatrix).multiply(virtual.matrixWorldInverse);
  const plane=new THREE.Plane(normal,-normal.dot(point)).applyMatrix4(virtual.matrixWorldInverse);
  const clip=new THREE.Vector4(plane.normal.x,plane.normal.y,plane.normal.z,plane.constant),p=virtual.projectionMatrix.elements;
  const q=new THREE.Vector4((Math.sign(clip.x)+p[8])/p[0],(Math.sign(clip.y)+p[9])/p[5],-1,(1+p[10])/p[14]);
  if(Math.abs(clip.dot(q))<1e-8)return false;
  clip.multiplyScalar(2/clip.dot(q));p[2]=clip.x;p[6]=clip.y;p[10]=clip.z+1-.002;p[14]=clip.w;
  virtual.projectionMatrixInverse.copy(virtual.projectionMatrix).invert();return true;
}

export function installMirrorMaterial(material,uniforms){
  const before=material.onBeforeCompile,key=material.customProgramCacheKey;
  material.onBeforeCompile=function(shader,renderer){
    before.call(this,shader,renderer);Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform mat4 roomMirrorMatrix;\nvarying vec4 vRoomMirrorPosition;');
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvRoomMirrorPosition = roomMirrorMatrix * modelMatrix * vec4(transformed,1.0);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D roomMirrorTexture;\nuniform float roomMirrorEnabled;\nvarying vec4 vRoomMirrorPosition;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
if(roomMirrorEnabled > 0.5 && vRoomMirrorPosition.w > 0.0){
  vec2 mirrorUv=vRoomMirrorPosition.xy/vRoomMirrorPosition.w;
  float edge=min(min(mirrorUv.x,mirrorUv.y),min(1.0-mirrorUv.x,1.0-mirrorUv.y));
  outgoingLight=mix(outgoingLight,texture2D(roomMirrorTexture,clamp(mirrorUv,vec2(.001),vec2(.999))).rgb*.94,smoothstep(0.0,.008,edge));
}
#include <opaque_fragment>`);
  };
  material.customProgramCacheKey=function(){return (key===THREE.Material.prototype.customProgramCacheKey?before.toString():key.call(this))+'|cached-room-mirror-v1';};
  material.needsUpdate=true;
}

export function createMirrorReflections(renderer,scene,camera,{sky=null,exclude=[]}={}){
  const virtual=new THREE.PerspectiveCamera(),matrix=new THREE.Matrix4(),frustum=new THREE.Frustum(),projection=new THREE.Matrix4();
  const uniforms={roomMirrorTexture:{value:null},roomMirrorMatrix:{value:matrix},roomMirrorEnabled:{value:0}};
  let surface=null,original=null,patched=null,target=null,lastSignature='',revision=0,frames=0,rendering=false;
  function setSurface(next){
    if(surface===next)return;
    if(surface&&patched){surface.material=original;patched.dispose();if(original.userData.ownedHeroMirrorFallback)original.dispose();}
    surface=next?.isMesh&&!Array.isArray(next.material)?next:null;patched=null;original=null;uniforms.roomMirrorEnabled.value=0;lastSignature='';
    if(surface){original=surface.material;patched=original.clone();surface.material=patched;installMirrorMaterial(patched,uniforms);surface.userData.contactShading=false;}
  }
  function render({interacting=false,visible=true,quality='auto',width=1,height=1,revision:sceneRevision=''}={}){
    if(!surface||rendering||interacting||!visible||width<1||height<1)return false;
    for(let p=surface;p;p=p.parent)if(!p.visible)return false;
    scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
    projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(projection);
    if(!frustum.intersectsObject(surface))return false;
    const point=new THREE.Vector3().setFromMatrixPosition(surface.matrixWorld);if(camera.position.distanceToSquared(point)>256)return false;
    const signature=[revision,sceneRevision,quality,width,height,...camera.matrixWorld.elements,...camera.projectionMatrix.elements,...surface.matrixWorld.elements].join(',');
    if(signature===lastSignature)return false;
    if(!updateMirrorCamera(camera,surface,virtual,matrix))return false;
    const longest=quality==='high'?384:256,scale=longest/Math.max(width,height),w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
    if(!target){target=new THREE.WebGLRenderTarget(w,h,{type:renderer.extensions.has('EXT_color_buffer_float')?THREE.HalfFloatType:THREE.UnsignedByteType,depthBuffer:true,stencilBuffer:false});target.texture.name='cached-hall-mirror';target.texture.colorSpace=THREE.LinearSRGBColorSpace;uniforms.roomMirrorTexture.value=target.texture;}
    else if(target.width!==w||target.height!==h)target.setSize(w,h);
    const hidden=new Map(),hide=o=>{if(o&&!hidden.has(o)){hidden.set(o,o.visible);o.visible=false;}};
    hide(surface);for(const object of exclude)hide(object);
    scene.traverse(o=>{if(o.isLine||o.isPoints||o.isSprite||o.userData.heroMirror||o.userData.excludeFromReflection)hide(o);});
    const previous=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel();
    const viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4()),scissorTest=renderer.getScissorTest();
    const xr=renderer.xr.enabled,shadowAuto=renderer.shadowMap.autoUpdate,skyPosition=sky?.position.clone();rendering=true;
    try{
      renderer.xr.enabled=false;renderer.shadowMap.autoUpdate=false;
      if(sky){sky.position.copy(virtual.position);sky.updateMatrixWorld(true);}
      renderer.setRenderTarget(target);renderer.setScissorTest(false);renderer.state.buffers.depth.setMask(true);if(!renderer.autoClear)renderer.clear();
      renderer.render(scene,virtual);frames++;lastSignature=signature;uniforms.roomMirrorEnabled.value=1;return true;
    }finally{
      for(const [object,visible] of hidden)object.visible=visible;
      if(skyPosition){sky.position.copy(skyPosition);sky.updateMatrixWorld(true);}
      renderer.xr.enabled=xr;renderer.shadowMap.autoUpdate=shadowAuto;renderer.setRenderTarget(previous,face,mip);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);rendering=false;
    }
  }
  return {setSurface,render,invalidate(){revision++;},getDiagnostics:()=>({count:surface?1:0,captured:uniforms.roomMirrorEnabled.value===1,frames,width:target?.width||0,height:target?.height||0,updateMode:'settled-only',updatesWhileMoving:0}),
    dispose(){setSurface(null);target?.dispose();target=null;}};
}
