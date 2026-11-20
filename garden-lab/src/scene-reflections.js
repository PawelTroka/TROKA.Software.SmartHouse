import * as THREE from '../vendor/three.module.js';

// Reflection-camera / oblique-near-plane construction follows Three.js r160's
// Reflector (MIT; the license is retained in ../vendor/THREE-LICENSE.txt):
// https://github.com/mrdoob/three.js/blob/r160/examples/jsm/objects/Reflector.js
// This implementation keeps the existing physical water material and renders
// only on demand; it does not replace the pool with an opaque mirror shader.

const UP = new THREE.Vector3(0, 1, 0);
const CACHE_KEY = 'garden-planar-pool-v2';

export function poolReflectionBudget(quality, width, height, {
  visible = true, interacting = false, maxTextureSize = 2048,
} = {}) {
  const enabled = quality === 'high' && visible && !interacting && width >= 320 && height >= 160;
  const limit = Math.min(1024, Math.max(128, maxTextureSize));
  const scale = Math.min(.65, limit / Math.max(1, width, height), Math.sqrt(650000 / Math.max(1, width * height)));
  return {enabled, width:Math.max(1, Math.floor(width * scale)), height:Math.max(1, Math.floor(height * scale))};
}

/** Mirror an ordinary perspective camera across a horizontal water surface.
 * Texture projection uses the ordinary reflected camera; only the render
 * camera's near plane is skewed to clip objects underneath the actual water. */
export function updatePoolReflectionCamera(source, waterY, virtual, textureMatrix, clipBias = .002) {
  source.updateMatrixWorld(true);
  const position = new THREE.Vector3().setFromMatrixPosition(source.matrixWorld);
  if (!source.isPerspectiveCamera || !Number.isFinite(waterY) || position.y <= waterY + .005) return false;
  const rotation = new THREE.Matrix4().extractRotation(source.matrixWorld);
  const forward = new THREE.Vector3(0, 0, -1).applyMatrix4(rotation);
  const target = position.clone().add(forward);
  virtual.position.copy(position); virtual.position.y = 2 * waterY - position.y;
  target.y = 2 * waterY - target.y;
  virtual.up.set(0, 1, 0).applyMatrix4(rotation).reflect(UP);
  virtual.lookAt(target);
  virtual.near = source.near; virtual.far = source.far;
  virtual.layers.mask = source.layers.mask;
  virtual.updateMatrixWorld(true);
  virtual.projectionMatrix.copy(source.projectionMatrix);
  textureMatrix.set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1)
    .multiply(virtual.projectionMatrix).multiply(virtual.matrixWorldInverse);
  const plane = new THREE.Plane(UP.clone(), -waterY).applyMatrix4(virtual.matrixWorldInverse);
  const clip = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
  const p = virtual.projectionMatrix.elements;
  const q = new THREE.Vector4((Math.sign(clip.x) + p[8]) / p[0], (Math.sign(clip.y) + p[9]) / p[5], -1, (1 + p[10]) / p[14]);
  const denominator = clip.dot(q);
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-8) return false;
  clip.multiplyScalar(2 / denominator);
  p[2] = clip.x; p[6] = clip.y; p[10] = clip.z + 1 - clipBias; p[14] = clip.w;
  virtual.projectionMatrixInverse.copy(virtual.projectionMatrix).invert();
  return true;
}

function replaceRequired(source, token, replacement) {
  if (!source.includes(token)) throw new Error(`Pool reflection shader is missing ${token}`);
  return source.replace(token, replacement);
}

export function installPoolReflectionMaterial(material, uniforms) {
  if (!material?.isMeshStandardMaterial) return;
  const previousCompile = material.onBeforeCompile, previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = function(shader, renderer) {
    previousCompile.call(this, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = replaceRequired(shader.vertexShader, '#include <common>', `#include <common>
uniform mat4 poolReflectionMatrix;
varying vec4 vPoolReflectionPosition;
varying float vPoolWorldHeight;`);
    shader.vertexShader = replaceRequired(shader.vertexShader, '#include <worldpos_vertex>', `#include <worldpos_vertex>
vec4 poolWorldVertex = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
  poolWorldVertex = batchingMatrix * poolWorldVertex;
#endif
#ifdef USE_INSTANCING
  poolWorldVertex = instanceMatrix * poolWorldVertex;
#endif
poolWorldVertex = modelMatrix * poolWorldVertex;
vPoolReflectionPosition = poolReflectionMatrix * poolWorldVertex;
vPoolWorldHeight = poolWorldVertex.y;`);
    shader.fragmentShader = replaceRequired(shader.fragmentShader, '#include <common>', `#include <common>
uniform sampler2D poolReflectionTexture;
uniform float poolReflectionEnabled;
uniform float poolReflectionHeight;
uniform vec2 poolReflectionTexel;
varying vec4 vPoolReflectionPosition;
varying float vPoolWorldHeight;`);
    shader.fragmentShader = replaceRequired(shader.fragmentShader, '#include <opaque_fragment>', `
// Replace the distant environment with the actual scene at this plane. The
// surface becomes opaque at grazing angles: multiplying every reflected ray
// by a constant alpha would leave the basin visible through a near-mirror.
// Compose in premultiplied linear light, then return to ordinary alpha for the
// existing transparent material. Normal incidence still reveals the basin.
if ( poolReflectionEnabled > 0.5 && vPoolReflectionPosition.w > 0.0 ) {
  vec2 reflectionUv = vPoolReflectionPosition.xy / vPoolReflectionPosition.w;
  vec3 planeNormal = inverseTransformDirection( nonPerturbedNormal, viewMatrix );
  float topFace = smoothstep( 0.95, 0.999, abs( planeNormal.y ) ) *
    ( 1.0 - smoothstep( 0.002, 0.008, abs( vPoolWorldHeight - poolReflectionHeight ) ) );
  float edge = min( min( reflectionUv.x, reflectionUv.y ), min( 1.0 - reflectionUv.x, 1.0 - reflectionUv.y ) );
  float coverage = topFace * smoothstep( 0.0, 0.012, edge );
  vec2 ripple = vec2( normal.x - nonPerturbedNormal.x, -( normal.y - nonPerturbedNormal.y ) ) * 0.018;
  vec2 sampleUv = clamp( reflectionUv + ripple, vec2(0.002), vec2(0.998) );
  vec2 blur = poolReflectionTexel * ( 0.6 + roughnessFactor * 3.0 );
  vec3 reflectedScene = texture2D( poolReflectionTexture, sampleUv ).rgb * 0.4;
  reflectedScene += texture2D( poolReflectionTexture, sampleUv + vec2( blur.x, 0.0 ) ).rgb * 0.15;
  reflectedScene += texture2D( poolReflectionTexture, sampleUv - vec2( blur.x, 0.0 ) ).rgb * 0.15;
  reflectedScene += texture2D( poolReflectionTexture, sampleUv + vec2( 0.0, blur.y ) ).rgb * 0.15;
  reflectedScene += texture2D( poolReflectionTexture, sampleUv - vec2( 0.0, blur.y ) ).rgb * 0.15;
  float facing = saturate( dot( normal, normalize( vViewPosition ) ) );
  float fresnel = 0.02037 + 0.97963 * pow( 1.0 - facing, 5.0 );
  float reflectedOpacity = coverage * fresnel;
  float waterOpacity = diffuseColor.a;
  float composedOpacity = waterOpacity + ( 1.0 - waterOpacity ) * reflectedOpacity;
  vec3 sunGlints = coverage * reflectedLight.directSpecular;
  vec3 waterBody = max( vec3(0.0), outgoingLight - coverage * reflectedLight.indirectSpecular - sunGlints );
  outgoingLight = ( waterBody * waterOpacity * ( 1.0 - reflectedOpacity ) +
    sunGlints * waterOpacity + reflectedScene * reflectedOpacity ) / max( composedOpacity, 0.0001 );
  diffuseColor.a = composedOpacity;
}
#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = function() {
    const key = previousKey === THREE.Material.prototype.customProgramCacheKey ? previousCompile.toString() : previousKey.call(this);
    return `${key}|${CACHE_KEY}`;
  };
  material.needsUpdate = true;
}

function ancestorVisible(object) {
  for (let node = object; node; node = node.parent) if (!node.visible) return false;
  return true;
}

export function createPoolReflections(renderer, scene, camera, {
  sky = null, exclude = [], waterMaterials = [],
} = {}) {
  const supported = Boolean(renderer.capabilities?.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float'));
  const virtual = new THREE.PerspectiveCamera(), textureMatrix = new THREE.Matrix4();
  const surfaceBox = new THREE.Box3(), projection = new THREE.Matrix4(), frustum = new THREE.Frustum();
  const patched = new WeakSet(), water = new Set(waterMaterials);
  const uniforms = {
    poolReflectionTexture:{value:null}, poolReflectionMatrix:{value:textureMatrix},
    poolReflectionEnabled:{value:0}, poolReflectionHeight:{value:0}, poolReflectionTexel:{value:new THREE.Vector2(1,1)},
  };
  let surface = null, target = null, disposed = false, rendering = false, frames = 0;
  let dirty = 0, lastSignature = '', lastInfo = null;
  function setSurface(next) {
    if (next === surface) return;
    surface = next?.isMesh && !Array.isArray(next.material) ? next : null;
    uniforms.poolReflectionEnabled.value = 0;
    dirty++;
    if (surface) {
      water.add(surface.material);
      surface.userData.contactShading = false;
      if (!patched.has(surface.material)) {installPoolReflectionMaterial(surface.material, uniforms); patched.add(surface.material);}
    }
  }
  function render({quality = 'auto', width = 1, height = 1, visible = true, interacting = false, revision = ''} = {}) {
    if (disposed || rendering) return false;
    const budget = poolReflectionBudget(quality, width, height, {visible,interacting,maxTextureSize:renderer.capabilities.maxTextureSize});
    if (!supported || !budget.enabled || !surface || !ancestorVisible(surface)) {
      uniforms.poolReflectionEnabled.value = 0;
      return false;
    }
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projection);
    if (!frustum.intersectsObject(surface)) {uniforms.poolReflectionEnabled.value=0; return false;}
    surfaceBox.setFromObject(surface);
    const waterY = surfaceBox.max.y;
    if (!updatePoolReflectionCamera(camera, waterY, virtual, textureMatrix)) {uniforms.poolReflectionEnabled.value=0; return false;}
    const signature = [dirty,revision,waterY,budget.width,budget.height,...camera.matrixWorld.elements,...camera.projectionMatrix.elements].join(',');
    if (signature === lastSignature && target) {uniforms.poolReflectionEnabled.value=1; return false;}
    if (!target) {
      target = new THREE.WebGLRenderTarget(budget.width,budget.height,{type:THREE.HalfFloatType,depthBuffer:true,stencilBuffer:false});
      target.texture.name = 'pool-real-scene-reflection';
      target.texture.colorSpace = THREE.LinearSRGBColorSpace;
      target.texture.generateMipmaps = false;
      uniforms.poolReflectionTexture.value = target.texture;
    } else if (target.width !== budget.width || target.height !== budget.height) target.setSize(budget.width,budget.height);
    uniforms.poolReflectionTexel.value.set(1/budget.width,1/budget.height);
    uniforms.poolReflectionHeight.value = waterY;
    const hidden = new Map(), hide = object => {if(object&&!hidden.has(object)){hidden.set(object,object.visible);object.visible=false;}};
    for (const object of exclude) hide(object);
    scene.traverse(object => {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (object === surface || materials.some(m => water.has(m)) || object.userData.excludeFromReflection ||
        object.isLine || object.isPoints || object.isSprite) hide(object);
    });
    const previousTarget = renderer.getRenderTarget(), cubeFace = renderer.getActiveCubeFace(), mipLevel = renderer.getActiveMipmapLevel();
    const viewport = renderer.getViewport(new THREE.Vector4()), scissor = renderer.getScissor(new THREE.Vector4());
    const scissorTest = renderer.getScissorTest(), xrEnabled = renderer.xr.enabled;
    const shadowAuto = renderer.shadowMap.autoUpdate, skyPosition = sky?.position.clone();
    rendering = true;
    uniforms.poolReflectionEnabled.value = 0;
    try {
      renderer.xr.enabled = false;
      renderer.shadowMap.autoUpdate = false;
      // A pending geometry/solar shadow update is consumed here once. The main
      // render then reuses it; camera/wave-only updates never regenerate it.
      if (sky) {sky.position.copy(virtual.position);sky.updateMatrixWorld(true);}
      renderer.setRenderTarget(target);
      renderer.setScissorTest(false);
      renderer.state.buffers.depth.setMask(true);
      if (!renderer.autoClear) renderer.clear();
      renderer.render(scene,virtual);
      lastInfo = {...renderer.info.render};
      lastSignature = signature;
      frames++;
      uniforms.poolReflectionEnabled.value = 1;
      return true;
    } finally {
      renderer.xr.enabled = xrEnabled;
      renderer.shadowMap.autoUpdate = shadowAuto;
      renderer.setRenderTarget(previousTarget,cubeFace,mipLevel);
      renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);
      if (sky) {sky.position.copy(skyPosition);sky.updateMatrixWorld(true);}
      for (const [object, wasVisible] of hidden) object.visible = wasVisible;
      rendering = false;
    }
  }
  return {
    setSurface, render, invalidate(){dirty++;},
    getDiagnostics:()=>({poolReflections:uniforms.poolReflectionEnabled.value>0,poolReflectionSupported:supported,
      poolReflectionFrames:frames,poolReflectionWidth:target?.width||0,poolReflectionHeight:target?.height||0,
      poolReflectionCalls:lastInfo?.calls||0}),
    dispose(){if(disposed)return;disposed=true;uniforms.poolReflectionEnabled.value=0;uniforms.poolReflectionTexture.value=null;target?.dispose();surface=null;},
  };
}
