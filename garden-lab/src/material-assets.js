import * as THREE from '../vendor/three.module.js';

// Original 1K PBR files from Poly Haven, vendored for offline/self-hosted use.
// See assets/materials/manifest.json for source URLs, authors, exact hashes and
// measured dimensions. These are representative finishes, not site photographs.
const asset=(id,meters,mean)=>Object.freeze({id,meters:Object.freeze(meters),mean:Object.freeze(mean)});
export const MATERIAL_ASSETS=Object.freeze({
  wood:asset('fine_grained_wood',[.600000024,.600000024],[.055045,.0302896,.0154847]),
  grass:asset('grass_ground',[2.50999999,2.50999999],[.1581314,.1190771,.0492145]),
  linen:asset('rough_linen',[.270708139,.271299988],[.2868386,.4099622,.6156103]),
  plaster:asset('white_stucco',[1.998062968,1.998064041],[.6801998,.6513028,.6294243]),
  stone:asset('marble_01',[1.5,1.5],[.4430806,.3379491,.1944884]),
  floor:asset('wood_floor_worn',[1.999999642,1.999999642],[.2533258,.0996638,.0288337]),
});
const sources=new Map(),listeners=new Set();
const canLoad=()=>typeof document!=='undefined'&&typeof document.createElementNS==='function';
const srgb=x=>x<=.0031308?12.92*x:1.055*Math.pow(x,1/2.4)-.055;
export function onSurfaceAssetsChanged(callback){listeners.add(callback);return()=>listeners.delete(callback);}
const notify=()=>{for(const listener of listeners)listener();};
export function surfaceAssetDiagnostics(){
  return {requested:sources.size,loaded:[...sources.values()].filter(r=>r.loaded).length,
    failed:[...sources.values()].filter(r=>r.failed).map(r=>r.file),
    liveTextures:[...sources.values()].reduce((sum,r)=>sum+r.handles.size,0)};
}

function getSource(asset,channel){
  const file=`${asset.id}_${channel}.jpg`;
  if(sources.has(file))return sources.get(file);
  const c=document.createElement('canvas');c.width=c.height=1;
  const ctx=c.getContext('2d');
  const color=channel==='diffuse'?[231,231,231]:
    channel==='nor_gl'?[128,128,255]:[220,220,220];
  ctx.fillStyle=`rgb(${color.join(',')})`;ctx.fillRect(0,0,1,1);
  const record={source:new THREE.Source(c),handles:new Set(),file,loaded:false,failed:false};
  sources.set(file,record);
  new THREE.ImageLoader().load(new URL(`../assets/materials/${file}`,import.meta.url).href,image=>{
    if(channel==='diffuse'){
      // Compress the photographed linear-light variation into a bounded neutral
      // reflectance field before applying the chosen palette. This preserves
      // pores/grain without multiplying two browns or overexposing pale cloth.
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
      const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
      const pixels=context.getImageData(0,0,canvas.width,canvas.height);
      for(let i=0;i<pixels.data.length;i+=4)for(let channel=0;channel<3;channel++){
        const c=pixels.data[i+channel]/255,linear=c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);
        const reflectance=.80+.17*Math.tanh((linear/asset.mean[channel]-1)*1.6);
        pixels.data[i+channel]=Math.round(srgb(reflectance)*255);
      }
      context.putImageData(pixels,0,0);record.source.data=canvas;
    }else record.source.data=image;
    record.loaded=true;
    // Texture clones in the second renderer share the Source but have their own
    // upload version. Mark every live clone, not only the first requesting map.
    for(const texture of record.handles)texture.needsUpdate=true;
    notify();
  },undefined,()=>{record.failed=true;notify();});
  return record;
}

class AssetTexture extends THREE.Texture{
  constructor(record){
    super();this.record=record;
    if(record){this.source=record.source;record.handles.add(this);}
  }
  clone(){const texture=new AssetTexture(this.record);texture.copy(this);return texture;}
  dispose(){this.record?.handles.delete(this);super.dispose();}
}

/** Three owned handles, sharing immutable decoded source images across renderers.
 * A DOM-free geometry/test run makes no Image objects or network requests. */
export function createPhotographicMaps(name,{repeat,anisotropy=8}={}){
  const spec=MATERIAL_ASSETS[name];
  if(!spec||!canLoad())return null;
  const maps={};
  for(const [key,channel] of [['map','diffuse'],['normalMap','nor_gl'],['roughnessMap','rough']]){
    const texture=new AssetTexture(getSource(spec,channel));
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
    texture.generateMipmaps=true;texture.colorSpace=key==='map'?THREE.SRGBColorSpace:THREE.NoColorSpace;
    texture.anisotropy=Math.max(1,Math.min(8,anisotropy));
    texture.repeat.set(...(repeat||spec.meters.map(v=>1/v)));
    texture.userData.materialAsset={id:spec.id,channel,license:'CC0-1.0',meters:[...spec.meters]};
    texture.needsUpdate=true;maps[key]=texture;
  }
  return maps;
}

/** The loaded diffuse scan has bounded variation around 0.8 in linear light.
 * Cap diffuse pigment reflectance at 0.8, so even the brightest photo sample
 * remains below one after the selected palette is applied. Metallic surfaces
 * do not use this calibration. Normal and roughness maps remain untouched. */
export function calibratePhotographicTint(material,name){
  const spec=MATERIAL_ASSETS[name];if(!spec)return;
  const previous=material.userData.photographicTint;
  const base=material.color.clone();
  if(previous&&material.color.toArray().every((v,i)=>Math.abs(v-previous.scaled[i])<1e-9))base.fromArray(previous.base);
  material.color.setRGB(Math.min(.8,base.r)/.8,Math.min(.8,base.g)/.8,Math.min(.8,base.b)/.8);
  material.userData.photographicTint={base:base.toArray(),scaled:material.color.toArray()};
}

/** Caller owns the returned maps and must dispose them with the material. */
export function applyPhotographicSurface(material,name,{tint=true,normalStrength=.5,roughness=1,repeat,metric=true,anisotropy=8}={}){
  const maps=createPhotographicMaps(name,{repeat,anisotropy});if(!maps)return null;
  Object.assign(material,maps);material.bumpMap=null;material.roughness=roughness;
  material.normalScale=new THREE.Vector2(normalStrength,normalStrength);
  if(tint)calibratePhotographicTint(material,name);
  material.userData.photographicSurface=MATERIAL_ASSETS[name].id;
  material.userData.metricTexture=metric;
  material.needsUpdate=true;return Object.values(maps);
}

/** Project only registered finishes; preserve artwork, existing paving bonds,
 * water ripples, vegetation UVs and diagrams. Dimensions come from the actual
 * transformed geometry so the same linen weave is the same size on every seat.
 * This changes UVs only: no model vertices, footprint or screening calculation. */
export function projectArchitecturalMaterialUVs(root){
  root.updateMatrixWorld(true);
  const p=new THREE.Vector3(),n=new THREE.Vector3(),normalMatrix=new THREE.Matrix3();
  let changed=0;
  root.traverse(mesh=>{
    if(!mesh.isMesh||mesh.isInstancedMesh||!mesh.geometry?.attributes.position||!mesh.geometry.attributes.normal)return;
    const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    if(!materials.some(m=>m?.userData.metricTexture))return;
    let geometry=mesh.geometry;
    if(geometry.userData.architecturalMetricUVs)return;
    if(geometry.userData.sharedPrimitive){geometry=geometry.clone();geometry.userData={...geometry.userData};delete geometry.userData.sharedPrimitive;mesh.geometry=geometry;}
    const {position,normal}=geometry.attributes;
    if(!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(position.count*2),2));
    const uv=geometry.attributes.uv;
    const groups=Array.isArray(mesh.material)?geometry.groups:[{start:0,count:geometry.index?.count??position.count,materialIndex:0}];
    normalMatrix.getNormalMatrix(mesh.matrixWorld);
    for(const range of groups){
      if(!materials[range.materialIndex]?.userData.metricTexture)continue;
      for(let j=range.start;j<range.start+range.count;j++){
        const i=geometry.index?geometry.index.getX(j):j;
        p.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
        n.fromBufferAttribute(normal,i).applyNormalMatrix(normalMatrix);
        if(Math.abs(n.y)>=Math.max(Math.abs(n.x),Math.abs(n.z)))uv.setXY(i,p.x,p.z);
        else if(Math.abs(n.x)>Math.abs(n.z))uv.setXY(i,p.z,p.y);
        else uv.setXY(i,p.x,p.y);
      }
    }
    uv.needsUpdate=true;geometry.userData.architecturalMetricUVs=true;changed++;
  });
  return changed;
}
