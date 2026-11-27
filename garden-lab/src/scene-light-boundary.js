import * as THREE from '../vendor/three.module.js';

const MAX_VERTICES=32;
const ACTIVE_LOCAL_LIGHTS='#if ( NUM_POINT_LIGHTS > 0 ) || ( NUM_SPOT_LIGHTS > 0 )';
const CACHE_VERSION='garden-local-light-boundary-v1';
const instanceOrderSafeHooks=new WeakMap();

// This wrapper only derives light coverage from the transformed world point.
// Permit instance reordering only for the exact pair installed over Three's
// unmodified hooks; a later shader/cache override invalidates the allowance.
export function isGardenLightBoundaryOrderSafe(material){
  const hooks=instanceOrderSafeHooks.get(material);
  return !!hooks&&material.onBeforeCompile===hooks.compile&&material.customProgramCacheKey===hooks.cacheKey;
}

function normalizedBoundary(boundary){
  if(!Array.isArray(boundary)||boundary.some(p=>!Array.isArray(p)||p.length<2||!p.slice(0,2).every(Number.isFinite)))
    throw new TypeError('Garden lighting needs a finite mapped plot boundary');
  const points=boundary.map(p=>[p[0],p[1]]);
  if(points.length>1&&Math.hypot(points[0][0]-points.at(-1)[0],points[0][1]-points.at(-1)[1])<1e-6)points.pop();
  if(points.length<3||points.length>MAX_VERTICES)throw new RangeError(`Garden lighting requires 3–${MAX_VERTICES} boundary vertices`);
  const area=points.reduce((sum,a,i)=>{const b=points[(i+1)%points.length];return sum+a[0]*b[1]-b[0]*a[1];},0);
  if(Math.abs(area)<1e-6)throw new RangeError('Garden lighting needs a non-degenerate plot boundary');
  return points;
}

function replaceRequired(source,token,replacement){
  if(!source.includes(token))throw new Error(`Garden light boundary shader is missing ${token}`);
  return source.replace(token,replacement);
}

function fragmentBoundary(vertexCount){
  return `${ACTIVE_LOCAL_LIGHTS}
varying vec2 vGardenLightWorldXZ;
uniform vec2 gardenLightBoundary[${vertexCount}];
uniform vec4 gardenLightBounds;
float gardenPlotLightMask( vec2 p ) {
  if ( any( lessThan( p, gardenLightBounds.xy ) ) || any( greaterThan( p, gardenLightBounds.zw ) ) ) return 0.0;
  bool inside = false;
  vec2 a = gardenLightBoundary[${vertexCount-1}];
  for ( int i = 0; i < ${vertexCount}; i ++ ) {
    vec2 b = gardenLightBoundary[i];
    if ( ( a.y > p.y ) != ( b.y > p.y ) ) {
      float crossingX = a.x + ( p.y - a.y ) * ( b.x - a.x ) / ( b.y - a.y );
      if ( p.x < crossingX ) inside = !inside;
    }
    a = b;
  }
  return inside ? 1.0 : 0.0;
}
#endif`;
}

const worldPosition=`${ACTIVE_LOCAL_LIGHTS}
vec4 gardenLightWorldPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
  gardenLightWorldPosition = batchingMatrix * gardenLightWorldPosition;
#endif
#ifdef USE_INSTANCING
  gardenLightWorldPosition = instanceMatrix * gardenLightWorldPosition;
#endif
vGardenLightWorldXZ = ( modelMatrix * gardenLightWorldPosition ).xz;
#endif`;

function localLightChunk(){
  let chunk=THREE.ShaderChunk.lights_fragment_begin;
  for(const kind of ['Point','Spot']){
    const source=`get${kind}LightInfo( ${kind.toLowerCase()}Light, geometryPosition, directLight );`;
    chunk=replaceRequired(chunk,source,`${source}
    directLight.color *= gardenLocalLightCoverage;
    directLight.visible = directLight.visible && ( gardenLocalLightCoverage > 0.0 );`);
  }
  return `${ACTIVE_LOCAL_LIGHTS}
float gardenLocalLightCoverage = gardenPlotLightMask( vGardenLightWorldXZ );
#endif
${chunk}`;
}

/** Keep proposed garden point/spot illumination inside the mapped plot.
 * This is an explicit visual boundary, not a physical hedge-shadow simulation.
 * Sun, ambient/environment light and emissive window overlays are untouched.
 * Shared uniforms and one polygon evaluation per lit fragment avoid a shadow
 * map per lantern. The actual polygon length is compiled, bounded at 32.
 */
export function createGardenLightBoundary(boundary){
  const installed=new WeakMap();
  const uniforms={gardenLightBoundary:{value:[]},gardenLightBounds:{value:new THREE.Vector4()}};
  let points=[],signature='';
  function setBoundary(nextBoundary){
    const next=normalizedBoundary(nextBoundary),nextSignature=JSON.stringify(next);
    if(nextSignature===signature)return;
    signature=nextSignature;points=next;
    uniforms.gardenLightBoundary.value=points.map(p=>new THREE.Vector2(...p));
    uniforms.gardenLightBounds.value.set(Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),
      Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1])));
  }
  setBoundary(boundary);

  function installMaterial(material){
    if(!material?.isMeshStandardMaterial)return;
    const previous=installed.get(material);
    if(previous){
      if(previous.vertexCount!==points.length){previous.vertexCount=points.length;material.needsUpdate=true;}
      return;
    }
    const previousCompile=material.onBeforeCompile,previousCacheKey=material.customProgramCacheKey;
    material.onBeforeCompile=function(shader,renderer){
      previousCompile.call(this,shader,renderer);
      Object.assign(shader.uniforms,uniforms);
      shader.vertexShader=replaceRequired(shader.vertexShader,'#include <common>',
        `#include <common>\n${ACTIVE_LOCAL_LIGHTS}\nvarying vec2 vGardenLightWorldXZ;\n#endif`);
      shader.vertexShader=replaceRequired(shader.vertexShader,'#include <worldpos_vertex>',
        `#include <worldpos_vertex>\n${worldPosition}`);
      shader.fragmentShader=replaceRequired(shader.fragmentShader,'#include <common>',
        `#include <common>\n${fragmentBoundary(points.length)}`);
      shader.fragmentShader=replaceRequired(shader.fragmentShader,'#include <lights_fragment_begin>',localLightChunk());
    };
    material.customProgramCacheKey=function(){
      // Three's default cache key reads the current hook. Retain the original
      // hook identity instead; a caller's custom dynamic key still runs.
      const previousKey=previousCacheKey===THREE.Material.prototype.customProgramCacheKey
        ?previousCompile.toString():previousCacheKey.call(this);
      return `${previousKey}|${CACHE_VERSION}:${points.length}`;
    };
    if(previousCompile===THREE.Material.prototype.onBeforeCompile&&previousCacheKey===THREE.Material.prototype.customProgramCacheKey)
      instanceOrderSafeHooks.set(material,{compile:material.onBeforeCompile,cacheKey:material.customProgramCacheKey});
    installed.set(material,{vertexCount:points.length});
    material.needsUpdate=true;
  }

  function install(root){
    root.traverse(object=>{
      for(const material of Array.isArray(object.material)?object.material:[object.material])installMaterial(material);
    });
  }
  return {install,setBoundary,get vertexCount(){return points.length;}};
}
