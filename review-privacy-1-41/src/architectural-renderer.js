import * as THREE from '../vendor/three.module.js';
import {EffectComposer} from '../vendor/addons/postprocessing/EffectComposer.js';
import {RenderPass} from '../vendor/addons/postprocessing/RenderPass.js';
import {GTAOPass} from '../vendor/addons/postprocessing/GTAOPass.js';
import {OutputPass} from '../vendor/addons/postprocessing/OutputPass.js';
import {createGpuPhaseProfiler} from './gpu-phase-profiler.js?v=1.41.0';

/** Contact shading is a presentation effect, in metres. It never changes the
 * analytical sun/privacy geometry. Small screens and Eco retain direct idle
 * rendering; the more expensive pass runs only when the scene needs a frame. */
export function architecturalRenderBudget(quality,width,height,{interacting=false,memoryGB=8}={}){
  const enabled=quality!=='eco'&&width>=600&&!(memoryGB>0&&memoryGB<=4)&&!interacting;
  return {enabled,aoScale:quality==='high'?.7:.5,samples:quality==='high'?24:12,
    denoiseSamples:quality==='high'?16:8,msaaSamples:quality==='high'?4:2};
}

/** Glass, water, helper lines and invisible analytical screens do not form an
 * opaque surface in the normal/depth prepass. Hiding them here, rather than
 * altering their material, also preserves shared interior/exterior resources. */
export function contributesToContactShading(object){
  if(!object.isMesh||object.userData.contactShading===false)return false;
  const materials=Array.isArray(object.material)?object.material:[object.material];
  return materials.length>0&&materials.every(m=>m&&m.visible!==false&&m.colorWrite!==false&&
    m.depthWrite!==false&&!m.transparent&&!(m.alphaTest>0)&&!m.alphaMap&&!m.isShaderMaterial&&!m.isShadowMaterial);
}

class ArchitecturalAO extends GTAOPass{
  overrideVisibility(){
    this.scene.traverse(object=>{
      this._visibilityCache.set(object,object.visible);
      if(object.isMesh||object.isPoints||object.isLine||object.isSprite)
        object.visible=object.visible&&contributesToContactShading(object);
    });
  }
  renderOverride(renderer,...args){
    const previous=this.scene.overrideMaterial;
    try{super.renderOverride(renderer,...args);}
    finally{this.scene.overrideMaterial=previous;this.restoreVisibility();}
  }
  restoreVisibility(){
    for(const [object,visible] of this._visibilityCache)object.visible=visible;
    this._visibilityCache.clear();
  }
  // The r160 vendor pass leaves these two materials out of its disposer.
  dispose(){super.dispose();this.gtaoMaterial.dispose();this.blendMaterial.dispose();}
}

export function createArchitecturalRenderer(renderer,scene,camera,{interior=false,gpuPhaseDiagnostics=false,onGpuPhaseUpdate=null,motionMsaaDiagnostic=null}={}){
  const supported=renderer.capabilities.isWebGL2&&renderer.extensions.has('EXT_color_buffer_float');
  // r160 samples=0 uses one color/depth storage sample and no MSAA resolve.
  // Requesting 1 could round up to 4. Explicit diagnostics take precedence;
  // the caller may otherwise request Auto's measured minimum-scale fallback.
  const samplingControl=['keep','single'].includes(motionMsaaDiagnostic)?motionMsaaDiagnostic:null,motionTargets=new Map();
  // The main scene has an opaque canvas and a separately sized display buffer.
  // The transparent interior/dollhouse renderer keeps its existing pipeline.
  const gl=renderer.getContext?.();let motionSupported=false,motionSampleCount=0;
  const gpuPhases=gpuPhaseDiagnostics===true&&!interior?createGpuPhaseProfiler(gl,{enabled:true,onUpdate:onGpuPhaseUpdate}):null;
  let motionUnsupportedReason=interior?'interior-renderer':!renderer.capabilities.isWebGL2?'webgl2-unavailable':
    !supported?'float-color-buffer-unavailable':!(renderer.capabilities.maxSamples>=2)?'multisampling-unavailable':
      !gl?.getInternalformatParameter?'format-sample-query-unavailable':null;
  if(!interior&&supported&&renderer.capabilities.maxSamples>=2&&gl?.getInternalformatParameter){
    // Float multisampling is optional even with EXT_color_buffer_float. GL
    // rounds a request up to the next supported count for each attachment;
    // color and the r160 default depth format must resolve to the same count.
    const samplesFor=format=>Math.min(...Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,format,gl.SAMPLES)||[])
      .filter(samples=>samples>=2&&samples<=renderer.capabilities.maxSamples));
    try{const colorSamples=samplesFor(gl.RGBA16F),depthSamples=samplesFor(gl.DEPTH_COMPONENT24);
      motionSupported=Number.isFinite(colorSamples)&&colorSamples===depthSamples;
      if(motionSupported)motionSampleCount=colorSamples;
      else motionUnsupportedReason=!Number.isFinite(colorSamples)?'float-multisampling-unavailable':
        !Number.isFinite(depthSamples)?'depth-multisampling-unavailable':'float-depth-sample-mismatch';
    }catch{motionUnsupportedReason='format-sample-query-failed';}
  }
  const drawingSize=new THREE.Vector2(),savedClearColor=new THREE.Color();
  let canvasSamples=null;
  // SAMPLES describes the currently bound framebuffer. Query the default
  // framebuffer once at construction, never infer it from composer settings.
  if(renderer.getRenderTarget?.()===null){
    if(gl?.getParameter)canvasSamples=gl.getParameter(gl.SAMPLES);
  }
  let composer=null,ao=null,colorPass=null,output=null,enabled=false,width=0,height=0,ratio=0,
    lastSamples=0,lastAOSamples=0,sceneInfo=null,disposed=false,
    motionTarget=null,motionColorPass=null,motionOutput=null,motionEnabled=false,motionDepthResolveSkipped=false,sceneWidth=0,sceneHeight=0,sceneRatio=1,
    motionQualityScale=1,motionSamplingMode='idle',motionSamplingReason=null;
  function initialise(){
    if(composer||!supported)return;
    const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType});
    composer=new EffectComposer(renderer,target);
    colorPass=new RenderPass(scene,camera);
    const draw=colorPass.render.bind(colorPass);
    colorPass.render=(...args)=>{draw(...args);sceneInfo={...renderer.info.render};};
    ao=new ArchitecturalAO(scene,camera,1,1,undefined,
      // Seats and table tops are 0.4–0.8 m above the floor. A smaller radius
      // never reaches their ground contact and leaves the furniture floating.
      {radius:interior?.9:1.0,distanceExponent:1.35,thickness:interior?.9:1.25,
        distanceFallOff:.7,scale:1.1,samples:12,screenSpaceRadius:false},
      {radius:4,depthPhi:2,normalPhi:4,samples:8});
    ao.blendIntensity=interior?.9:.82;
    ao.normalMaterial.side=THREE.DoubleSide;
    output=new OutputPass();
    composer.addPass(colorPass);composer.addPass(ao);composer.addPass(output);
  }
  function resize(w,h,pixelRatio=1,quality='auto',options={}){
    if(disposed)return;
    sceneWidth=w;sceneHeight=h;sceneRatio=pixelRatio;
    const budget=architecturalRenderBudget(quality,w,h,options);
    enabled=Boolean(supported&&budget.enabled);
    motionEnabled=Boolean(motionSupported&&options.interacting);
    motionQualityScale=motionEnabled&&Number.isFinite(options.motionScale)?options.motionScale:1;
    motionSamplingMode='idle';motionSamplingReason=null;
    if(motionEnabled){
      const mw=Math.max(1,Math.floor(w*pixelRatio)),mh=Math.max(1,Math.floor(h*pixelRatio));
      const adaptiveSingle=!samplingControl&&quality==='auto'&&options.motionSingleSample===true&&motionQualityScale===.54;
      const single=samplingControl==='single'||adaptiveSingle,requestedSamples=single?0:2;
      motionSamplingMode=single?(adaptiveSingle?'adaptive-single':'forced-single'):'multisample';
      motionSamplingReason=adaptiveSingle?'minimum-scale-gpu-pressure':samplingControl?'diagnostic-'+samplingControl:null;
      motionTarget=motionTargets.get(requestedSamples);
      if(!motionTarget){
        motionTarget=new THREE.WebGLRenderTarget(mw,mh,{type:THREE.HalfFloatType,samples:requestedSamples});
        motionTarget.texture.name=single?'ArchitecturalMotion.single-color':'ArchitecturalMotion.color';
        motionTargets.set(requestedSamples,motionTarget);
      }else if(motionTarget.width!==mw||motionTarget.height!==mh)motionTarget.setSize(mw,mh);
      if(!motionColorPass){
        motionColorPass=new RenderPass(scene,camera);
        motionOutput=new OutputPass();motionOutput.renderToScreen=true;
        // The final triangle replaces the whole opaque display image. Nothing
        // consumes its depth, and an old display depth value must not reject it.
        motionOutput.material.depthTest=false;motionOutput.material.depthWrite=false;
      }
      return;
    }
    if(!enabled)return;
    initialise();
    const samples=Math.min(budget.msaaSamples,renderer.capabilities.maxSamples||0);
    if(samples!==lastSamples){
      for(const target of [composer.renderTarget1,composer.renderTarget2]){target.samples=samples;target.dispose();}
      lastSamples=samples;
    }
    if(w!==width||h!==height||pixelRatio!==ratio){
      width=w;height=h;ratio=pixelRatio;
      composer.setPixelRatio(pixelRatio);composer.setSize(w,h);
    }
    const aw=Math.max(1,Math.round(w*pixelRatio*budget.aoScale));
    const ah=Math.max(1,Math.round(h*pixelRatio*budget.aoScale));
    if(ao.width!==aw||ao.height!==ah)ao.setSize(aw,ah);
    if(lastAOSamples!==budget.samples){
      ao.updateGtaoMaterial({samples:budget.samples});
      ao.updatePdMaterial({samples:budget.denoiseSamples});lastAOSamples=budget.samples;
    }
  }
  function renderMotion(){
    const previousTarget=renderer.getRenderTarget(),previousFace=renderer.getActiveCubeFace(),previousMip=renderer.getActiveMipmapLevel();
    const previousAutoClear=renderer.autoClear,previousAlpha=renderer.getClearAlpha();renderer.getClearColor(savedClearColor);
    // The pinned r160 resolver exposes this per-target flag for WebXR. Our
    // dedicated motion target also needs only resolved color: OutputPass never
    // samples depth, and the next RenderPass clears its multisampled depth.
    // Retain that attachment for all scene depth tests, but discard it before
    // the color resolve instead of copying an unused full-size depth buffer.
    // setSize() disposes renderer properties, so reapply before every render.
    motionDepthResolveSkipped=motionTarget.samples>0&&!!renderer.properties?.get&&motionTarget.depthBuffer===true&&!motionTarget.depthTexture&&!motionTarget.stencilBuffer&&
      motionColorPass.clear===true&&renderer.autoClearDepth===true;
    if(renderer.properties?.get)renderer.properties.get(motionTarget).__ignoreDepthValues=motionDepthResolveSkipped;
    let profile=null;
    if(gpuPhases){
      const published=Number(renderer.domElement?.dataset?.renderedFrameCount);
      profile=gpuPhases.beginFrame({renderPath:'motion-target',sceneBufferWidth:motionTarget.width,sceneBufferHeight:motionTarget.height,
        scenePixelRatio:sceneRatio,motionQualityScale,motionSamples:motionTarget.samples===0?0:motionSampleCount,motionRequestedSamples:motionTarget.samples,
        motionStorageSamples:motionTarget.samples===0?1:motionSampleCount,motionMsaaDiagnostic:samplingControl,motionSamplingMode,motionSamplingReason,
        sceneColorType:motionTarget.texture.type,sceneColorSpace:motionTarget.texture.colorSpace,outputColorSpace:renderer.outputColorSpace,
        toneMapping:renderer.toneMapping,toneMappingExposure:renderer.toneMappingExposure,
        canvasWidth:renderer.domElement?.width,canvasHeight:renderer.domElement?.height,
        motionDepthResolveSkipped,
        expectedPublicFrame:Number.isFinite(published)?published+1:null,cameraPosition:camera.position?.toArray(),cameraQuaternion:camera.quaternion?.toArray()});
    }
    try{
      // r160 resolves a multisampled target at the end of renderer.render(). Its
      // ordinary offscreen scene shader writes linear HDR; OutputPass applies
      // the existing AgX/exposure/sRGB transform exactly once, as at idle.
      motionColorPass.render(renderer,null,motionTarget);
      sceneInfo={...renderer.info.render};
      gpuPhases?.sceneComplete(profile,sceneInfo);
      // Keep the HDR scene clear above, but avoid clearing the multisampled
      // display color/depth immediately before overwriting every color pixel.
      renderer.autoClear=false;
      motionOutput.render(renderer,null,motionTarget);
      gpuPhases?.completeFrame(profile);
    }catch(error){
      gpuPhases?.abortFrame(profile,error);throw error;
    }finally{
      // RenderPass's normal restoration does not run if a draw throws.
      renderer.autoClear=previousAutoClear;
      renderer.setClearColor(savedClearColor,previousAlpha);
      renderer.setRenderTarget(previousTarget,previousFace,previousMip);
    }
  }
  function getDiagnostics(){
    let sceneBufferWidth,sceneBufferHeight,scenePixelRatio=sceneRatio,renderPath;
    if(motionEnabled&&motionTarget){
      renderPath='motion-target';sceneBufferWidth=motionTarget.width;sceneBufferHeight=motionTarget.height;
    }else if(enabled&&composer){
      renderPath='ao-composer';sceneBufferWidth=Math.floor(composer.readBuffer.width);sceneBufferHeight=Math.floor(composer.readBuffer.height);
    }else{
      renderPath='direct';
      if(renderer.getDrawingBufferSize)renderer.getDrawingBufferSize(drawingSize);
      else drawingSize.set(renderer.domElement?.width??Math.floor(sceneWidth*sceneRatio),renderer.domElement?.height??Math.floor(sceneHeight*sceneRatio));
      sceneBufferWidth=drawingSize.x;sceneBufferHeight=drawingSize.y;scenePixelRatio=renderer.getPixelRatio?.()??sceneRatio;
    }
    return {contactShading:enabled,contactShadingSupported:supported,
      aoWidth:enabled?ao?.width||0:0,aoHeight:enabled?ao?.height||0:0,
      msaaSamples:enabled?lastSamples:0,toneMapping:'AgX',renderPath,sceneBufferWidth,sceneBufferHeight,scenePixelRatio,
      motionSupported,motionUnsupportedReason,
      // GL rounds requested MSAA samples up to a supported count. Zero means
      // no MSAA; that target still has one color/depth storage sample.
      // Both counts are independent of the default display canvas's samples.
      motionSamples:motionEnabled&&motionTarget?.samples>0?motionSampleCount:0,motionRequestedSamples:motionEnabled?motionTarget?.samples||0:0,
      motionStorageSamples:motionEnabled?(motionTarget?.samples===0?1:motionSampleCount):0,motionMsaaDiagnostic:samplingControl,
      motionQualityScale,motionSamplingMode,motionSamplingReason,canvasSamples,
      motionDepthResolveSkipped:motionEnabled&&motionTarget?.samples>0&&motionDepthResolveSkipped,
      ...(gpuPhases?{gpuPhases:gpuPhases.getDiagnostics()}:{} )};
  }
  return {
    resize,
    render(){
      if(disposed)return;
      if(motionEnabled&&motionTarget)renderMotion();
      else if(enabled&&composer)composer.render(0);
      else{renderer.render(scene,camera);sceneInfo={...renderer.info.render};}
    },
    get motionSupported(){return motionSupported;},
    get sceneInfo(){return sceneInfo;},
    getDiagnostics,
    dispose(){if(disposed)return;disposed=true;gpuPhases?.dispose();ao?.dispose();output?.dispose();composer?.dispose();
      for(const target of motionTargets.values())target.dispose();motionTargets.clear();motionColorPass?.dispose();motionOutput?.dispose();}
  };
}
