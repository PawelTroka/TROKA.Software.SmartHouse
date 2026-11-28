import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
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
  const state={target:null,face:0,mip:0,clearColor:new THREE.Color('#123456'),clearAlpha:.35,draws:[],clears:[],clearOptions:[],queries:0,throwAt:null};
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
    getPixelRatio:()=>1,getSize:target=>target.set(1280,584),getDrawingBufferSize:target=>target.set(1280,584),clear(...options){state.clears.push(state.target);state.clearOptions.push(options);},
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
    renderPath:'motion-target',sceneBufferWidth:1075,sceneBufferHeight:490,scenePixelRatio:.84,motionSupported:true,motionUnsupportedReason:null,motionSamples:2,motionRequestedSamples:2,
    motionStorageSamples:2,motionMsaaDiagnostic:null,canvasSamples:4,motionDepthResolveSkipped:false});
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

test('the actual r160 resolver skips only unused motion depth copies and reapplies its flag after resize',async()=>{
  const vendor=await readFile(new URL('../vendor/three.module.js',import.meta.url),'utf8');
  const start=vendor.indexOf('\tfunction updateMultisampleRenderTarget( renderTarget ) {');
  const end=vendor.indexOf('\n\tfunction getRenderTargetSamples(',start);
  assert.ok(start>=0&&end>start,'This integration is explicitly pinned to the installed r160 resolver');
  const scene=new THREE.Scene(),{renderer,state}=motionRenderer(scene),records=new WeakMap(),watched=new WeakSet(),blits=[],invalidations=[];
  const properties={get(target){
    if(!records.has(target))records.set(target,{__webglFramebuffer:{resolved:target},__webglMultisampledFramebuffer:{multisampled:target}});
    if(!watched.has(target)){watched.add(target);target.addEventListener('dispose',()=>records.delete(target));}
    return records.get(target);
  }};
  renderer.properties=properties;
  const gl={COLOR_BUFFER_BIT:0x4000,DEPTH_BUFFER_BIT:0x100,STENCIL_BUFFER_BIT:0x400,READ_FRAMEBUFFER:0x8ca8,DRAW_FRAMEBUFFER:0x8ca9,
    COLOR_ATTACHMENT0:0x8ce0,DEPTH_ATTACHMENT:0x8d00,DEPTH_STENCIL_ATTACHMENT:0x821a,NEAREST:0x2600,
    blitFramebuffer(...args){blits.push(args);},invalidateFramebuffer(...args){invalidations.push(args);}};
  const resolve=Function('_gl','isWebGL2','useMultisampledRTT','properties','state','supportsInvalidateFramebuffer',
    vendor.slice(start,end)+'\nreturn updateMultisampleRenderTarget;')(gl,true,()=>false,properties,{bindFramebuffer(){}},true);
  const ordinary=new THREE.WebGLRenderTarget(16,16,{samples:2});resolve(ordinary);
  assert.equal(blits.at(-1)[8],gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT,'Unmodified targets retain their normal color/depth resolve');
  const draw=renderer.render.bind(renderer);
  renderer.render=(object,camera)=>{draw(object,camera);if(object===scene&&state.target)resolve(state.target);};
  const presentation=createArchitecturalRenderer(renderer,scene,new THREE.PerspectiveCamera());
  for(const scale of [.84,.54,.68]){
    presentation.resize(1280,584,scale,'auto',{interacting:true});presentation.render();
    const target=state.draws.at(-2).target;
    assert.equal(target.depthBuffer,true,'MSAA scene drawing still has its depth attachment');
    assert.equal(target.stencilBuffer,false);assert.equal(target.depthTexture,null);
    assert.deepEqual(state.clearOptions.at(-1),[true,true,true],'Every new scene clears depth before drawing');
    assert.equal(properties.get(target).__ignoreDepthValues,true,'Resize disposal must not lose the resolve-only flag');
    assert.equal(blits.at(-1)[8],gl.COLOR_BUFFER_BIT);
    assert.deepEqual(blits.at(-1).slice(0,8),[0,0,target.width,target.height,0,0,target.width,target.height]);
    assert.ok(invalidations.some(([binding,attachments])=>binding===gl.READ_FRAMEBUFFER&&attachments.length===1&&attachments[0]===gl.DEPTH_ATTACHMENT));
    assert.equal(presentation.getDiagnostics().motionDepthResolveSkipped,true);
    assert.equal(state.draws.at(-1).object.material.uniforms.tDiffuse.value,target.texture,'Output still consumes the resolved HDR color');
  }
  renderer.autoClearDepth=false;presentation.render();
  assert.equal(blits.at(-1)[8],gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT,'A pass without an explicit depth clear retains its normal resolve');
  assert.equal(presentation.getDiagnostics().motionDepthResolveSkipped,false);
  renderer.autoClearDepth=true;
  assert.equal(properties.get(ordinary).__ignoreDepthValues,undefined,'Other target consumers remain untouched');
  const count=blits.length;presentation.resize(1280,584,1,'eco',{interacting:false});presentation.render();
  assert.equal(blits.length,count);assert.equal(presentation.getDiagnostics().motionDepthResolveSkipped,false);
  presentation.dispose();ordinary.dispose();

  const single=createArchitecturalRenderer(renderer,scene,new THREE.PerspectiveCamera(),{motionMsaaDiagnostic:'single'});
  for(const scale of [.84,.54]){
    const invalidationCount=invalidations.length;
    single.resize(1280,584,scale,'auto',{interacting:true});single.render();
    const target=state.draws.at(-2).target;
    assert.equal(target.samples,0);assert.equal(target.depthBuffer,true);assert.equal(target.texture.type,THREE.HalfFloatType);
    assert.equal(properties.get(target).__ignoreDepthValues,false,'A single-sample target cannot advertise a discarded MSAA depth resolve');
    assert.equal(blits.length,count,'The actual pinned resolver submits no blit for samples=0');
    assert.equal(invalidations.length,invalidationCount,'No single-sample scene depth is discarded before its use');
    assert.equal(single.getDiagnostics().motionDepthResolveSkipped,false);
  }
  single.dispose();
});

test('motion output restores target, cube face, mip, clearing and colors after either draw fails',()=>{
  for(const motionMsaaDiagnostic of [null,'single']){
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),{renderer,state}=motionRenderer(scene);
    const presentation=createArchitecturalRenderer(renderer,scene,camera,{motionMsaaDiagnostic}),previousTarget=new THREE.WebGLRenderTarget(16,16);
    presentation.resize(1280,584,.84,'auto',{interacting:true});
    for(const throwAt of [null,'scene','output']){
      renderer.setRenderTarget(previousTarget,3,2);renderer.autoClear=false;renderer.setClearColor('#123456',.35);state.throwAt=throwAt;
      if(throwAt)assert.throws(()=>presentation.render(),new RegExp(throwAt+' draw failed'));else presentation.render();
      assert.equal(state.target,previousTarget);assert.equal(state.face,3);assert.equal(state.mip,2);assert.equal(renderer.autoClear,false);
      assert.equal(state.clearColor.getHexString(),'123456');assert.equal(state.clearAlpha,.35);
    }
    presentation.dispose();previousTarget.dispose();
  }
});

test('single-sample motion is an explicit diagnostic with unchanged HDR output, caching, canvas and idle path',()=>{
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),results=[];
  for(const motionMsaaDiagnostic of [undefined,'invalid','single']){
    const {renderer,state}=motionRenderer(scene,{colorSamples:[4],depthSamples:[4]}),presentation=createArchitecturalRenderer(renderer,scene,camera,{motionMsaaDiagnostic});
    assert.equal(presentation.motionSupported,true);
    presentation.resize(1280,584,.54,'auto',{interacting:true});presentation.render();
    const target=state.draws[0].target,output=state.draws[1].object.material,diagnostics=presentation.getDiagnostics(),single=motionMsaaDiagnostic==='single';
    assert.equal(target.samples,single?0:2);assert.equal(diagnostics.motionSamples,single?0:4);assert.equal(diagnostics.motionRequestedSamples,single?0:2);
    assert.equal(diagnostics.motionStorageSamples,single?1:4);assert.equal(diagnostics.motionMsaaDiagnostic,single?'single':null);
    assert.equal(target.depthBuffer,true);assert.equal(target.stencilBuffer,false);assert.equal(target.depthTexture,null);
    assert.equal(target.texture.type,THREE.HalfFloatType);assert.equal(target.width,691);assert.equal(target.height,315);
    assert.equal(output.uniforms.tDiffuse.value,target.texture);assert.equal(output.uniforms.toneMappingExposure.value,1.05);
    results.push({defines:{...output.defines},outputColorSpace:renderer.outputColorSpace,toneMapping:renderer.toneMapping,
      sceneInfo:{...presentation.sceneInfo},depthTest:output.depthTest,depthWrite:output.depthWrite,clearOptions:state.clearOptions[0]});
    let targetDisposals=0,outputDisposals=0;target.addEventListener('dispose',()=>targetDisposals++);output.addEventListener('dispose',()=>outputDisposals++);
    presentation.resize(1280,584,.54,'auto',{interacting:true});presentation.render();
    assert.equal(state.draws.at(-2).target,target);assert.equal(state.draws.at(-1).object.material,output);assert.equal(targetDisposals,0);
    presentation.resize(1280,584,.68,'auto',{interacting:true});presentation.render();
    assert.equal(state.draws.at(-2).target,target);assert.equal(target.samples,single?0:2);assert.equal(targetDisposals,1);
    presentation.resize(1280,584,1,'eco',{interacting:false});presentation.render();
    assert.equal(state.draws.at(-1).object,scene);assert.equal(state.draws.at(-1).target,null);assert.equal(presentation.getDiagnostics().renderPath,'direct');
    assert.equal(presentation.getDiagnostics().motionStorageSamples,0);assert.equal(presentation.getDiagnostics().motionSamples,0);
    assert.deepEqual(renderer.domElement,{width:1280,height:584});assert.equal(state.queries,1);
    presentation.resize(1280,584,1,'auto',{interacting:false});
    assert.equal(presentation.getDiagnostics().renderPath,'ao-composer');assert.equal(presentation.getDiagnostics().contactShading,true);
    assert.equal(presentation.getDiagnostics().msaaSamples,2,'The original idle AO/composer sample configuration is unchanged');
    assert.equal(presentation.getDiagnostics().motionStorageSamples,0);assert.equal(presentation.getDiagnostics().motionSamples,0);
    presentation.dispose();presentation.dispose();assert.equal(targetDisposals,2);assert.equal(outputDisposals,1);
  }
  assert.deepEqual(results[1],results[0],'An unknown diagnostic value does not opt in');
  assert.deepEqual(results[2],results[0],'Sampling storage is the only diagnostic rendering difference');
});

test('motion target capability rejects unavailable or mismatched float multisampling and leaves dollhouse unchanged',()=>{
  for(const options of [{webgl2:false},{float:false},{maxSamples:1},{colorSamples:[]},{colorSamples:[4],depthSamples:[4,2]},{interior:true}]){
    for(const motionMsaaDiagnostic of [null,'single']){
    const scene=new THREE.Scene(),{renderer,state}=motionRenderer(scene,options),presentation=createArchitecturalRenderer(renderer,scene,new THREE.PerspectiveCamera(),{...options,motionMsaaDiagnostic});
    assert.equal(presentation.motionSupported,false,JSON.stringify(options));
    assert.equal(typeof presentation.getDiagnostics().motionUnsupportedReason,'string');
    presentation.resize(390,700,.8,'auto',{interacting:true});presentation.render();
    assert.equal(presentation.getDiagnostics().renderPath,'direct');assert.equal(state.draws.length,1);assert.equal(state.draws[0].target,null);presentation.dispose();
    }
  }
  const scene=new THREE.Scene(),{renderer}=motionRenderer(scene,{colorSamples:[4],depthSamples:[4]});
  const rounded=createArchitecturalRenderer(renderer,scene,new THREE.PerspectiveCamera());
  assert.equal(rounded.motionSupported,true,'Both attachments may round requested2 to the same supported count');
  rounded.resize(390,700,1,'auto',{interacting:true});
  assert.equal(rounded.getDiagnostics().motionSamples,4);assert.equal(rounded.getDiagnostics().motionRequestedSamples,2);rounded.dispose();
});

test('optional phase marks surround the scene/resolve and output with the exact next public frame metadata',()=>{
  for(const motionMsaaDiagnostic of [null,'single']){
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),{renderer}=motionRenderer(scene);
  const events=[],fences=[],deleted=[],gl=renderer.getContext(),draw=renderer.render.bind(renderer);
  Object.assign(gl,{SYNC_GPU_COMMANDS_COMPLETE:10,TIMEOUT_EXPIRED:11,
    fenceSync(){const handle={id:fences.length+1};fences.push(handle);events.push('fence-'+handle.id);return handle;},
    clientWaitSync(handle,flags,timeout){assert.equal(timeout,0);return this.TIMEOUT_EXPIRED;},deleteSync:handle=>deleted.push(handle),flush:()=>events.push('flush')});
  renderer.domElement.dataset={renderedFrameCount:'17'};
  renderer.render=(object,...args)=>{events.push(object===scene?'scene-and-resolve':'output');draw(object,...args);
    if(object===scene)Object.assign(renderer.info.render,{points:0,lines:317,frame:35});};
  const presentation=createArchitecturalRenderer(renderer,scene,camera,{gpuPhaseDiagnostics:true,motionMsaaDiagnostic});
  presentation.resize(1280,584,.54,'auto',{interacting:true});presentation.render();
  assert.deepEqual(events,['fence-1','scene-and-resolve','fence-2','output','fence-3','flush']);
  const sample=presentation.getDiagnostics().gpuPhases.pending[0];
  assert.deepEqual(sample.metadata,{renderPath:'motion-target',sceneBufferWidth:691,sceneBufferHeight:315,scenePixelRatio:.54,
    motionSamples:motionMsaaDiagnostic==='single'?0:2,motionRequestedSamples:motionMsaaDiagnostic==='single'?0:2,
    motionStorageSamples:motionMsaaDiagnostic==='single'?1:2,motionMsaaDiagnostic,
    sceneColorType:THREE.HalfFloatType,sceneColorSpace:THREE.NoColorSpace,outputColorSpace:THREE.SRGBColorSpace,toneMapping:THREE.AgXToneMapping,toneMappingExposure:1.05,
    canvasWidth:1280,canvasHeight:584,motionDepthResolveSkipped:false,expectedPublicFrame:18,cameraPosition:[0,0,0],cameraQuaternion:[0,0,0,1],
    sceneInfo:{calls:501,triangles:825968,points:0,lines:317,rendererFrame:35}});
  assert.deepEqual(presentation.sceneInfo,{calls:501,triangles:825968,points:0,lines:317,frame:35});
  presentation.dispose();assert.equal(deleted.length,3);assert.equal(new Set(deleted).size,3);
  }
});

test('a scene or output error aborts optional phase evidence and still restores the renderer',()=>{
  for(const throwAt of ['scene','output']){
    const scene=new THREE.Scene(),{renderer,state}=motionRenderer(scene),gl=renderer.getContext(),created=[],deleted=[];
    Object.assign(gl,{SYNC_GPU_COMMANDS_COMPLETE:10,TIMEOUT_EXPIRED:11,
      fenceSync(){const handle={};created.push(handle);return handle;},clientWaitSync(){return this.TIMEOUT_EXPIRED;},
      deleteSync:handle=>deleted.push(handle),flush(){}});
    const presentation=createArchitecturalRenderer(renderer,scene,new THREE.PerspectiveCamera(),{gpuPhaseDiagnostics:true});
    presentation.resize(1280,584,.54,'auto',{interacting:true});state.throwAt=throwAt;
    assert.throws(()=>presentation.render(),new RegExp(throwAt+' draw failed'));
    const diagnostics=presentation.getDiagnostics().gpuPhases;
    assert.equal(diagnostics.pending.length,0);assert.equal(diagnostics.samples[0].status,'aborted');assert.equal(diagnostics.completedSamples,0);
    assert.equal(state.target,null);assert.equal(renderer.autoClear,true);assert.equal(state.clearColor.getHexString(),'123456');
    presentation.dispose();assert.equal(deleted.length,created.length);assert.equal(new Set(deleted).size,created.length);
  }
});
