import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {architecturalRenderBudget,contributesToContactShading,createArchitecturalRenderer} from '../src/architectural-renderer.js';

test('contact shading has bounded quality and switches off while navigating or on constrained devices',()=>{
  const high=architecturalRenderBudget('high',1600,1000);
  const auto=architecturalRenderBudget('auto',1600,1000);
  assert.ok(high.enabled&&auto.enabled&&high.samples>auto.samples);
  assert.ok(high.aoScale<=1&&auto.aoScale<high.aoScale);
  for(const [q,w,options] of [['eco',1600,{}],['auto',390,{}],['auto',1600,{memoryGB:4}],['auto',1600,{interacting:true}]])
    assert.equal(architecturalRenderBudget(q,w,900,options).enabled,false);
});

test('glass, cutout leaves and analytical screens never occlude as solid rectangles',()=>{
  const geometry=new THREE.BoxGeometry(),material=new THREE.MeshStandardMaterial(),mesh=new THREE.Mesh(geometry,material);
  assert.equal(contributesToContactShading(mesh),true);
  for(const [key,value] of [['transparent',true],['alphaTest',.33],['depthWrite',false],['colorWrite',false]]){
    const previous=material[key];material[key]=value;assert.equal(contributesToContactShading(mesh),false,key);material[key]=previous;
  }
  mesh.userData.contactShading=false;assert.equal(contributesToContactShading(mesh),false);
  assert.equal(contributesToContactShading(new THREE.Line(geometry)),false);
  geometry.dispose();material.dispose();
});

test('unsupported WebGL retains the direct renderer and accurate scene diagnostics',()=>{
  let calls=0;const renderer={capabilities:{isWebGL2:false},info:{render:{calls:17,triangles:642}},render(){calls++;}};
  const presentation=createArchitecturalRenderer(renderer,{},{});
  presentation.resize(1200,800,1,'high');presentation.render();
  assert.equal(calls,1);assert.equal(presentation.getDiagnostics().contactShading,false);
  assert.deepEqual(presentation.sceneInfo,renderer.info.render);
  presentation.dispose();presentation.render();assert.equal(calls,1);
});

function motionRenderer(scene,{webgl2=true,float=true,maxSamples=4,colorSamples=[4,2],depthSamples=[4,2]}={}){
  const state={target:null,face:0,mip:0,clearColor:new THREE.Color('#123456'),clearAlpha:.35,draws:[],clears:[],queries:0,throwAt:null};
  const gl={RENDERBUFFER:1,RGBA16F:2,DEPTH_COMPONENT24:3,SAMPLES:4,
    getParameter(name){assert.equal(name,this.SAMPLES);state.queries++;return 4;},
    getInternalformatParameter(target,format,name){assert.equal(target,this.RENDERBUFFER);assert.equal(name,this.SAMPLES);return new Int32Array(format===this.RGBA16F?colorSamples:depthSamples);}};
  const renderer={capabilities:{isWebGL2:webgl2,maxSamples},extensions:{has:()=>float},domElement:{width:1280,height:584},
    autoClear:true,autoClearColor:true,autoClearDepth:true,autoClearStencil:true,
    toneMapping:THREE.AgXToneMapping,toneMappingExposure:1.05,outputColorSpace:THREE.SRGBColorSpace,
    info:{render:{}},getContext:()=>gl,getRenderTarget:()=>state.target,getActiveCubeFace:()=>state.face,getActiveMipmapLevel:()=>state.mip,
    setRenderTarget(target,face=0,mip=0){state.target=target;state.face=face;state.mip=mip;},
    getClearColor:target=>target.copy(state.clearColor),getClearAlpha:()=>state.clearAlpha,
    setClearColor(color,alpha=state.clearAlpha){state.clearColor.set(color);state.clearAlpha=alpha;},
    getPixelRatio:()=>1,getDrawingBufferSize:target=>target.set(1280,584),clear(){state.clears.push(state.target);},
    render(object,camera){
      const stage=object===scene?'scene':'output';state.draws.push({stage,target:state.target,object,camera,autoClear:this.autoClear});
      if(state.throwAt===stage){renderer.setClearColor('#abcdef',.9);throw new Error(stage+' draw failed');}
      this.info.render=stage==='scene'?{calls:501,triangles:825968}:{calls:1,triangles:1};
    }};
  return {renderer,state};
}

test('motion renders into a cached two-sample HDR target at the scene scale without resizing the canvas',()=>{
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),{renderer,state}=motionRenderer(scene);
  const presentation=createArchitecturalRenderer(renderer,scene,camera);
  assert.equal(presentation.motionSupported,true);assert.equal(state.queries,1);
  presentation.resize(1280,584,.84,'auto',{interacting:true});presentation.render();
  const target=state.draws[0].target,output=state.draws[1].object.material;
  assert.equal(target.width,1075);assert.equal(target.height,490);assert.equal(target.samples,2);assert.equal(target.texture.type,THREE.HalfFloatType);
  assert.equal(state.draws[0].object,scene);assert.equal(state.draws[1].target,null);
  assert.equal(output.uniforms.tDiffuse.value,target.texture);assert.equal(output.uniforms.toneMappingExposure.value,1.05);
  assert.equal(output.depthTest,false);assert.equal(output.depthWrite,false);
  assert.equal(state.draws[1].autoClear,false,'The final full-display triangle needs no prior clear');
  assert.deepEqual(state.clears,[target],'The HDR scene retains its explicit color/depth clear');
  assert.equal(renderer.autoClear,true,'The display-only override is restored');
  assert.ok('AGX_TONE_MAPPING' in output.defines&&'SRGB_TRANSFER' in output.defines,'Existing OutputPass applies the idle HDR output transform');
  assert.deepEqual(presentation.sceneInfo,{calls:501,triangles:825968},'The output triangle cannot replace scene statistics');
  assert.deepEqual(presentation.getDiagnostics(),{contactShading:false,contactShadingSupported:true,aoWidth:0,aoHeight:0,msaaSamples:0,toneMapping:'AgX',
    renderPath:'motion-target',sceneBufferWidth:1075,sceneBufferHeight:490,scenePixelRatio:.84,motionSupported:true,motionUnsupportedReason:null,motionSamples:2,motionRequestedSamples:2,canvasSamples:4});
  let targetDisposals=0,outputDisposals=0;target.addEventListener('dispose',()=>targetDisposals++);output.addEventListener('dispose',()=>outputDisposals++);
  presentation.resize(1280,584,.84,'high',{interacting:true});presentation.render();
  assert.equal(state.draws[2].target,target);assert.equal(state.draws[3].object.material,output);assert.equal(targetDisposals,0);
  presentation.resize(1280,584,.68,'auto',{interacting:true});presentation.render();
  assert.equal(state.draws[4].target,target);assert.equal(target.width,870);assert.equal(target.height,397);assert.equal(targetDisposals,1);
  assert.deepEqual(renderer.domElement,{width:1280,height:584},'Only the caller may resize the display canvas');
  presentation.resize(1280,584,1,'eco',{interacting:false});presentation.render();
  assert.equal(state.draws.at(-1).target,null);assert.equal(state.draws.at(-1).object,scene);
  assert.equal(presentation.getDiagnostics().renderPath,'direct');assert.equal(presentation.getDiagnostics().sceneBufferWidth,1280);
  presentation.resize(1280,584,.68,'eco',{interacting:true});presentation.render();
  assert.equal(state.draws.at(-2).target,target,'Eco motion reuses the supported target; its direct idle path stays unchanged');
  assert.equal(state.queries,1,'Default-canvas samples are queried once, not during moving draws');
  presentation.dispose();presentation.dispose();assert.equal(targetDisposals,2);assert.equal(outputDisposals,1);
});

test('motion output restores target, cube face, mip, clearing and colors after either draw fails',()=>{
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),{renderer,state}=motionRenderer(scene);
  const presentation=createArchitecturalRenderer(renderer,scene,camera),previousTarget=new THREE.WebGLRenderTarget(16,16);
  presentation.resize(1280,584,.84,'auto',{interacting:true});
  for(const throwAt of [null,'scene','output']){
    renderer.setRenderTarget(previousTarget,3,2);renderer.autoClear=false;renderer.setClearColor('#123456',.35);state.throwAt=throwAt;
    if(throwAt)assert.throws(()=>presentation.render(),new RegExp(throwAt+' draw failed'));else presentation.render();
    assert.equal(state.target,previousTarget);assert.equal(state.face,3);assert.equal(state.mip,2);assert.equal(renderer.autoClear,false);
    assert.equal(state.clearColor.getHexString(),'123456');assert.equal(state.clearAlpha,.35);
  }
  presentation.dispose();previousTarget.dispose();
});

test('motion target capability rejects unavailable or mismatched float multisampling and leaves dollhouse unchanged',()=>{
  for(const options of [{webgl2:false},{float:false},{maxSamples:1},{colorSamples:[]},{colorSamples:[4],depthSamples:[4,2]},{interior:true}]){
    const scene=new THREE.Scene(),{renderer,state}=motionRenderer(scene,options),presentation=createArchitecturalRenderer(renderer,scene,new THREE.PerspectiveCamera(),options);
    assert.equal(presentation.motionSupported,false,JSON.stringify(options));
    assert.equal(typeof presentation.getDiagnostics().motionUnsupportedReason,'string');
    presentation.resize(390,700,.8,'auto',{interacting:true});presentation.render();
    assert.equal(presentation.getDiagnostics().renderPath,'direct');assert.equal(state.draws.length,1);assert.equal(state.draws[0].target,null);presentation.dispose();
  }
  const scene=new THREE.Scene(),{renderer}=motionRenderer(scene,{colorSamples:[4],depthSamples:[4]});
  const rounded=createArchitecturalRenderer(renderer,scene,new THREE.PerspectiveCamera());
  assert.equal(rounded.motionSupported,true,'Both attachments may round requested2 to the same supported count');
  rounded.resize(390,700,1,'auto',{interacting:true});
  assert.equal(rounded.getDiagnostics().motionSamples,4);assert.equal(rounded.getDiagnostics().motionRequestedSamples,2);rounded.dispose();
});
