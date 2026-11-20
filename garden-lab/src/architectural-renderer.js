import * as THREE from '../vendor/three.module.js';
import {EffectComposer} from '../vendor/addons/postprocessing/EffectComposer.js';
import {RenderPass} from '../vendor/addons/postprocessing/RenderPass.js';
import {GTAOPass} from '../vendor/addons/postprocessing/GTAOPass.js';
import {OutputPass} from '../vendor/addons/postprocessing/OutputPass.js';

/** Contact shading is a presentation effect, in metres. It never changes the
 * analytical sun/privacy geometry. Small screens and Eco retain direct MSAA
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

export function createArchitecturalRenderer(renderer,scene,camera,{interior=false}={}){
  const supported=renderer.capabilities.isWebGL2&&renderer.extensions.has('EXT_color_buffer_float');
  let composer=null,ao=null,colorPass=null,output=null,enabled=false,width=0,height=0,ratio=0,
    lastSamples=0,lastAOSamples=0,sceneInfo=null,disposed=false;
  function initialise(){
    if(composer||!supported)return;
    const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType});
    composer=new EffectComposer(renderer,target);
    colorPass=new RenderPass(scene,camera);
    const draw=colorPass.render.bind(colorPass);
    colorPass.render=(...args)=>{draw(...args);sceneInfo={...renderer.info.render};};
    ao=new ArchitecturalAO(scene,camera,1,1,undefined,
      {radius:interior?.38:.52,distanceExponent:1.4,thickness:interior?.45:.8,
        distanceFallOff:.8,scale:1,samples:12,screenSpaceRadius:false},
      {radius:5,depthPhi:2,normalPhi:4,samples:8});
    ao.blendIntensity=interior?.48:.42;
    ao.normalMaterial.side=THREE.DoubleSide;
    output=new OutputPass();
    composer.addPass(colorPass);composer.addPass(ao);composer.addPass(output);
  }
  function resize(w,h,pixelRatio=1,quality='auto',options={}){
    if(disposed)return;
    const budget=architecturalRenderBudget(quality,w,h,options);
    enabled=Boolean(supported&&budget.enabled);
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
  return {
    resize,
    render(){
      if(disposed)return;
      if(enabled&&composer)composer.render(0);
      else{renderer.render(scene,camera);sceneInfo={...renderer.info.render};}
    },
    get sceneInfo(){return sceneInfo;},
    getDiagnostics:()=>({contactShading:enabled,contactShadingSupported:supported,
      aoWidth:enabled?ao?.width||0:0,aoHeight:enabled?ao?.height||0:0,
      msaaSamples:enabled?lastSamples:0,toneMapping:'AgX'}),
    dispose(){if(disposed)return;disposed=true;ao?.dispose();output?.dispose();composer?.dispose();}
  };
}
