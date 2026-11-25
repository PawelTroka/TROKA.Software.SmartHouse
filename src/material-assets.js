import * as THREE from '../vendor/three.module.js';
import {MATERIAL_ASSETS} from './material-asset-data.js?v=1.33.0';
export {MATERIAL_ASSETS};

// Original 1K PBR files from Poly Haven, vendored for offline/self-hosted use.
// See assets/materials/manifest.json for source URLs, authors, exact hashes and
// measured dimensions. These are representative finishes, not site photographs.
const sources=new Map(),listeners=new Set(),deferredSurfaces=new WeakMap();
const MAX_IDLE_BYTES=48*1024*1024;
let sourceClock=0,totalRequests=0;
const canLoad=()=>typeof document!=='undefined'&&typeof document.createElementNS==='function';
const srgb=x=>x<=.0031308?12.92*x:1.055*Math.pow(x,1/2.4)-.055;
const linearBytes=Float64Array.from({length:256},(_,i)=>{
  const c=i/255;return c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);
});
const neutralReflectance=.8;
const luminance=rgb=>.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];

/** Keep the measured grain, pores and grass/soil variation in linear light.
 * The material supplies its authored average pigment instead of multiplying
 * that pigment by a second brown/blue scan. Only highlights have a soft shoulder;
 * dark photographic detail is not raised to a pale minimum. Residual chroma
 * preserves natural per-pixel variation without inheriting a scan's base dye.
 * A bounded map and a bounded calibrated pigment keep diffuse reflectance <=1.
 */
export function photographicReflectance(rgb,name,out=[0,0,0],colorMode){
  const spec=typeof name==='string'?MATERIAL_ASSETS[name]:name;
  if((colorMode||spec.colorMode)==='natural'){
    for(let c=0;c<3;c++)out[c]=Math.max(0,Math.min(1,rgb[c]));
    return out;
  }
  const relativeLuminance=luminance(rgb)/luminance(spec.mean);
  const value=neutralReflectance*Math.pow(Math.max(0,relativeLuminance),spec.contrast);
  for(let c=0;c<3;c++){
    const chroma=relativeLuminance>1e-10?rgb[c]/spec.mean[c]/relativeLuminance:1;
    const reflectance=Math.max(0,value*(1+spec.chroma*(chroma-1)));
    out[c]=reflectance<=neutralReflectance?reflectance:
      neutralReflectance+(1-neutralReflectance)*(1-Math.exp(-(reflectance-neutralReflectance)/(1-neutralReflectance)));
  }
  return out;
}
export function onSurfaceAssetsChanged(callback){listeners.add(callback);return()=>listeners.delete(callback);}
const notify=()=>{for(const listener of listeners)listener();};
export function surfaceAssetDiagnostics(){
  return {requested:sources.size,loaded:[...sources.values()].filter(r=>r.loaded).length,
    failed:[...sources.values()].filter(r=>r.failed).map(r=>r.file),
    liveTextures:[...sources.values()].reduce((sum,r)=>sum+r.handles.size,0),
    decodedBytes:[...sources.values()].reduce((sum,r)=>sum+r.bytes,0),
    idleBytes:[...sources.values()].reduce((sum,r)=>sum+(r.handles.size?0:r.bytes),0),totalRequests};
}

function trimIdleSources(){
  const idle=[...sources.values()].filter(r=>!r.handles.size&&(r.loaded||r.failed)).sort((a,b)=>a.used-b.used);
  let bytes=idle.reduce((sum,r)=>sum+r.bytes,0);
  while(bytes>MAX_IDLE_BYTES&&idle.length){
    const record=idle.shift();sources.delete(record.key);bytes-=record.bytes;
  }
}

function getSource(asset,channel,colorMode){
  const file=asset.files[channel],mode=channel==='diffuse'?colorMode:'data',key=file+'#'+mode;
  if(sources.has(key)){const record=sources.get(key);record.used=++sourceClock;return record;}
  // WebGL2 allocates immutable storage on the first upload. In Three r160 a
  // later needsUpdate updates its contents; it does not resize that storage.
  // A 1px placeholder therefore leaves a flat texture when the photo arrives.
  // Allocate the verified final dimensions before either renderer can upload.
  const c=document.createElement('canvas');[c.width,c.height]=asset.pixels;
  const ctx=c.getContext('2d');
  const color=channel==='diffuse'?(mode==='natural'?asset.mean.map(c=>Math.round(srgb(c)*255)):[231,231,231]):
    channel==='nor_gl'?[128,128,255]:[220,220,220];
  ctx.fillStyle=`rgb(${color.join(',')})`;ctx.fillRect(0,0,c.width,c.height);
  const record={source:new THREE.Source(c),handles:new Set(),file,key,used:++sourceClock,
    bytes:c.width*c.height*4,loaded:false,failed:false};
  sources.set(key,record);totalRequests++;trimIdleSources();
  new THREE.ImageLoader().load(new URL(`../assets/materials/${file}`,import.meta.url).href,image=>{
    if(image.width!==asset.pixels[0]||image.height!==asset.pixels[1]){
      record.failed=true;trimIdleSources();notify();return;
    }
    if(channel==='diffuse'&&mode!=='natural'){
      // White-balance the photograph around its measured mean, retaining dark
      // texture detail and restrained natural colour variation for the palette.
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
      const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
      const pixels=context.getImageData(0,0,canvas.width,canvas.height);
      const rgb=[0,0,0],reflectance=[0,0,0];
      for(let i=0;i<pixels.data.length;i+=4){
        for(let c=0;c<3;c++)rgb[c]=linearBytes[pixels.data[i+c]];
        photographicReflectance(rgb,asset,reflectance,mode);
        for(let c=0;c<3;c++)pixels.data[i+c]=Math.round(srgb(reflectance[c])*255);
      }
      context.putImageData(pixels,0,0);record.source.data=canvas;
    }else record.source.data=image;
    record.loaded=true;
    // Texture clones in the second renderer share the Source but have their own
    // upload version. Mark every live clone, not only the first requesting map.
    for(const texture of record.handles)texture.needsUpdate=true;
    trimIdleSources();notify();
  },undefined,()=>{record.failed=true;trimIdleSources();notify();});
  return record;
}

class AssetTexture extends THREE.Texture{
  constructor(record){
    super();this.record=record;
    if(record){this.source=record.source;record.handles.add(this);}
  }
  clone(){const texture=new AssetTexture(this.record);texture.copy(this);return texture;}
  dispose(){
    this.record?.handles.delete(this);super.dispose();this.record=null;
    // Disposed materials can remain in debug/renderer bookkeeping. They must
    // not pin a decoded bitmap after their live clones and cache release it.
    this.source=new THREE.Source(null);trimIdleSources();
  }
}

/** Three owned handles, sharing immutable decoded source images across renderers.
 * A DOM-free geometry/test run makes no Image objects or network requests. */
export function createPhotographicMaps(name,{repeat,anisotropy=8,rotation=0,colorMode}={}){
  const spec=MATERIAL_ASSETS[name];
  if(!spec||!canLoad())return null;
  const maps={};
  for(const [key,channel] of [['map','diffuse'],['normalMap','nor_gl'],['roughnessMap','rough']]){
    const texture=new AssetTexture(getSource(spec,channel,colorMode||spec.colorMode));
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
    texture.generateMipmaps=true;texture.colorSpace=key==='map'?THREE.SRGBColorSpace:THREE.NoColorSpace;
    texture.anisotropy=Math.max(1,Math.min(8,anisotropy));
    texture.repeat.set(...(repeat||spec.meters.map(v=>1/v)));
    texture.rotation=rotation;
    texture.userData.materialAsset={id:spec.id,channel,license:'CC0-1.0',meters:[...spec.meters]};
    texture.needsUpdate=true;maps[key]=texture;
  }
  return maps;
}

/** A sample at the scan's measured mean maps to 0.8 in linear light.
 * Cap diffuse pigment reflectance at 0.8, so even the brightest photo sample
 * remains below one after the selected palette is applied. Metallic surfaces
 * do not use this calibration. Normal and roughness maps remain untouched. */
export function calibratePhotographicTint(material,name,{colorMode}={}){
  const spec=MATERIAL_ASSETS[name];if(!spec)return;
  const previous=material.userData.photographicTint;
  const base=material.color.clone();
  if(previous&&material.color.toArray().every((v,i)=>Math.abs(v-previous.scaled[i])<1e-9))base.fromArray(previous.base);
  if((colorMode||spec.colorMode)==='natural')material.color.setRGB(1,1,1);
  else material.color.setRGB(Math.min(neutralReflectance,base.r)/neutralReflectance,
    Math.min(neutralReflectance,base.g)/neutralReflectance,Math.min(neutralReflectance,base.b)/neutralReflectance);
  material.userData.photographicTint={base:base.toArray(),scaled:material.color.toArray()};
}

/** Caller owns the returned maps and must dispose them with the material. */
export function applyPhotographicSurface(material,name,{tint=true,normalStrength=.5,roughness=1,repeat,metric=true,anisotropy=8,rotation=0,colorMode}={}){
  const maps=createPhotographicMaps(name,{repeat,anisotropy,rotation,colorMode});if(!maps)return null;
  Object.assign(material,maps);material.bumpMap=null;material.roughness=roughness;
  material.normalScale=new THREE.Vector2(normalStrength,normalStrength);
  if(tint)calibratePhotographicTint(material,name,{colorMode});
  material.userData.photographicSurface=MATERIAL_ASSETS[name].id;
  material.userData.metricTexture=metric;
  material.needsUpdate=true;return Object.values(maps);
}

/** Interior material dictionaries contain optional furniture finishes. Load
 * only materials found on the built model, not every unused dictionary slot. */
export function deferPhotographicSurface(material,name,options,onCreated){
  if(!MATERIAL_ASSETS[name]||!canLoad())return false;
  deferredSurfaces.set(material,{name,options,onCreated});
  material.userData.metricTexture=options.metric!==false;
  material.addEventListener('dispose',()=>deferredSurfaces.delete(material),{once:true});
  return true;
}

function activateSurface(material){
  const pending=deferredSurfaces.get(material);if(!pending)return;
  deferredSurfaces.delete(material);
  const maps=applyPhotographicSurface(material,pending.name,pending.options);
  if(maps)pending.onCreated(maps);
}

/** Project only registered finishes; preserve artwork, existing paving bonds,
 * water ripples, vegetation UVs and diagrams. Dimensions come from the actual
 * transformed geometry so the same linen weave is the same size on every seat.
 * This changes UVs only: no model vertices, footprint or screening calculation. */
export function projectArchitecturalMaterialUVs(root){
  root.updateMatrixWorld(true);
  const p=new THREE.Vector3(),n=new THREE.Vector3(),normalMatrix=new THREE.Matrix3();
  const grain=new THREE.Vector3(),crossGrain=new THREE.Vector3();
  let changed=0;
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    for(const material of materials)if(material)activateSurface(material);
    if(mesh.isInstancedMesh||!mesh.geometry?.attributes.position||!mesh.geometry.attributes.normal)return;
    if(!materials.some(m=>m?.userData.metricTexture))return;
    let geometry=mesh.geometry;
    if(geometry.userData.architecturalMetricUVs)return;
    if(geometry.userData.sharedPrimitive){geometry=geometry.clone();geometry.userData={...geometry.userData};delete geometry.userData.sharedPrimitive;mesh.geometry=geometry;}
    const {position,normal}=geometry.attributes;
    if(!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(position.count*2),2));
    const uv=geometry.attributes.uv;
    let woodAxes;
    if(materials.some(m=>m?.userData.woodGrainAxis)){
      geometry.computeBoundingBox();const span=geometry.boundingBox.getSize(new THREE.Vector3());
      woodAxes=[0,1,2].map(axis=>{
        const direction=new THREE.Vector3().setFromMatrixColumn(mesh.matrixWorld,axis);
        const length=direction.length()*span.getComponent(axis);direction.normalize();return {direction,length};
      });
    }
    const groups=Array.isArray(mesh.material)?geometry.groups:[{start:0,count:geometry.index?.count??position.count,materialIndex:0}];
    normalMatrix.getNormalMatrix(mesh.matrixWorld);
    for(const range of groups){
      if(!materials[range.materialIndex]?.userData.metricTexture)continue;
      for(let j=range.start;j<range.start+range.count;j++){
        const i=geometry.index?geometry.index.getX(j):j;
        p.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
        n.fromBufferAttribute(normal,i).applyNormalMatrix(normalMatrix);
        const grainAxis=materials[range.materialIndex]?.userData.woodGrainAxis;
        if(grainAxis&&woodAxes){
          // Furniture posts and rails share a finish, but their wood fibres
          // must follow each actual member rather than a global horizontal axis.
          const axis=woodAxes.reduce((best,a)=>{
            const score=a.length*(1-Math.abs(a.direction.dot(n)));
            return score>best.score?{...a,score}:best;
          },{score:-1});
          grain.copy(axis.direction).addScaledVector(n,-axis.direction.dot(n)).normalize();
          crossGrain.crossVectors(grain,n).normalize();
          uv.setXY(i,grainAxis==='u'?p.dot(grain):p.dot(crossGrain),grainAxis==='u'?p.dot(crossGrain):p.dot(grain));
        }else if(Math.abs(n.y)>=Math.max(Math.abs(n.x),Math.abs(n.z)))uv.setXY(i,p.x,p.z);
        else if(Math.abs(n.x)>Math.abs(n.z))uv.setXY(i,p.z,p.y);
        else uv.setXY(i,p.x,p.y);
      }
    }
    uv.needsUpdate=true;geometry.userData.architecturalMetricUVs=true;changed++;
  });
  return changed;
}
