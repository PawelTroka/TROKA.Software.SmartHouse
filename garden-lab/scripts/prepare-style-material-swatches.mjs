// Offline colour-accurate catalogue previews. No browser per-pixel work.
// Production material constructors supply the pigment and actual map treatment.
import {readFileSync,writeFileSync,mkdirSync,readdirSync,unlinkSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import * as THREE from '../vendor/three.module.js';
import {DESIGN_STYLES,getDesignStyle} from '../src/design-styles.js';
import {getStyleMaterialSamples,MATERIAL_ASSETS} from '../src/material-catalogue.js';
import {interiorMaterials} from '../src/interior-materials.js';
import {applyExteriorSurface} from '../src/exterior-materials.js';
const root=new URL('../',import.meta.url),version=JSON.parse(readFileSync(new URL('package.json',root))).version;
const photos=await import(new URL(`src/material-assets.js?v=${version}`,root));
const folder=new URL('assets/materials/style-swatches/',root);
const linear=Float64Array.from({length:256},(_,i)=>{const n=i/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});
const srgb=n=>n<=.0031308?n*12.92:1.055*n**(1/2.4)-.055;
const encode=n=>Math.round(255*srgb(Math.max(0,Math.min(1,n))));
const roles=['wall','wood','floor','fabric'];

function canvasDocument(){
  return {createElementNS(){},createElement(){return {width:0,height:0,getContext(){
    return new Proxy({createLinearGradient(){return {addColorStop(){}};},getImageData(){return {data:new Uint8ClampedArray(4)};}},
      {get(target,key){return key in target?target[key]:()=>{};}});
  }};}};
}

function currentExteriorPigments(){
  // Current is constructed locally in scene.js rather than from the proposal
  // palette. Read those exact baseline literals; fail if that contract changes.
  const source=readFileSync(new URL('src/scene.js',root),'utf8'),result={};
  for(const [role,name,textured] of [['wall','wall',false],['wood','wood',true],['floor','stone',true],['fabric','linen',false]]){
    const pattern=new RegExp(`standard\\('${name}',\\s*${textured?"textures\\s*\\?\\s*":""}'(#[0-9a-fA-F]+)'`);
    const match=source.match(pattern);if(!match)throw new Error('Cannot resolve Current pigment: '+role);result[role]=match[1];
  }
  return result;
}

/** Capture the actual final colour/map from the production render materials.
 * The canvas stub only suppresses unrelated generated canvases and image IO;
 * it never supplies the photographic pixels used by the swatch generator. */
export function captureStyleMaterials(styleOrId,{interior=false}={}){
  const style=getDesignStyle(typeof styleOrId==='string'?styleOrId:styleOrId.id);
  const oldDocument=globalThis.document,oldLoad=THREE.ImageLoader.prototype.load;
  globalThis.document=canvasDocument();THREE.ImageLoader.prototype.load=()=>({});
  const materials=[],geometries=[];let bundle;
  try{
    const refs=getStyleMaterialSamples(style,{interior,calibrated:false});
    if(interior){
      bundle=interiorMaterials(style.id);materials.push(bundle.m.wall,bundle.m.wood,bundle.architecturalFloor,bundle.m.fabric);
      const group=new THREE.Group();for(const material of materials){const geo=new THREE.BoxGeometry();geometries.push(geo);group.add(new THREE.Mesh(geo,material));}
      photos.projectArchitecturalMaterialUVs(group);
    }else{
      const current=style.id==='current'?currentExteriorPigments():null;
      for(const [i,role] of roles.entries()){
        const color=current?.[role]||style.palette[{wall:'houseWall',wood:'wood',floor:'surface',fabric:'fabric'}[role]];
        const material=new THREE.MeshStandardMaterial({color});materials.push(material);
        if(current)photos.applyPhotographicSurface(material,refs[i].asset);
        else applyExteriorSurface(material,style,{wall:'wall',wood:'wood',floor:'deck',fabric:'linen'}[role]);
      }
    }
    return materials.map((material,index)=>{
      const ref=refs[index],map=material.map,photo=map?.userData.materialAsset;
      const common={style:style.id,scope:interior?'interior':'exterior',role:roles[index],asset:ref.asset,
        pigment:material.color.toArray(),basePigment:material.userData.photographicTint?.base||material.color.toArray()};
      if(photo){
        const [key,spec]=Object.entries(MATERIAL_ASSETS).find(([,spec])=>spec.id===photo.id);
        return {...common,asset:key,sourceId:photo.id,sourceFile:spec.files.diffuse,meters:spec.meters,
          colorMode:map.record.key.endsWith('#natural')?'natural':'palette'};
      }
      if(map?.image?.data)return {...common,sourceId:'procedural:'+ref.finish,colorMode:'procedural',meters:[1,1],
        width:map.image.width,height:map.image.height,pixels:new Uint8Array(map.image.data)};
      throw new Error(`Unresolved production sample ${style.id}/${roles[index]}`);
    });
  }finally{
    for(const geometry of geometries)geometry.dispose();
    if(bundle)bundle.dispose();else for(const material of materials){for(const key of ['map','normalMap','roughnessMap'])material[key]?.dispose();material.dispose();}
    THREE.ImageLoader.prototype.load=oldLoad;if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;
  }
}

export function calibratedSamplePixel(rgb8,descriptor){
  const rgb=rgb8.map(value=>linear[value]);
  const map=descriptor.colorMode==='procedural'?rgb:photos.photographicReflectance(rgb,MATERIAL_ASSETS[descriptor.asset],[0,0,0],descriptor.colorMode);
  // Match the renderer's sRGB 8-bit canvas upload before pigment multiplication.
  return map.map((value,i)=>encode(linear[encode(value)]*descriptor.pigment[i]));
}

function python(code,args=[],input){
  const result=spawnSync('python',['-c',code,...args],{input,maxBuffer:64*1024*1024});
  if(result.status!==0)throw new Error(result.stderr.toString());return result.stdout;
}

export function generateStyleMaterialSwatches(){
  mkdirSync(folder,{recursive:true});const normalized=new Map(),sources=new Map(),lookup={},records=[],unique=new Map();
  const decode=file=>{
    if(!sources.has(file)){
      const bytes=python('from PIL import Image\nimport sys,struct\nim=Image.open(sys.argv[1]).convert("RGBA")\nsys.stdout.buffer.write(struct.pack("<II",*im.size)+im.tobytes())',[fileURLToPath(new URL('assets/materials/'+file,root))]);
      sources.set(file,{width:bytes.readUInt32LE(0),height:bytes.readUInt32LE(4),pixels:bytes.subarray(8)});
    }
    return sources.get(file);
  };
  for(const style of DESIGN_STYLES)for(const interior of [false,true])for(const descriptor of captureStyleMaterials(style,{interior})){
    const key=`${descriptor.style}/${descriptor.scope}/${descriptor.role}`;
    const source=descriptor.sourceFile?decode(descriptor.sourceFile):descriptor;
    const sourceKey=(descriptor.sourceFile||descriptor.sourceId)+'/'+descriptor.colorMode;
    if(!normalized.has(sourceKey)){
      const data=new Float32Array(source.width*source.height*3),rgb=[0,0,0],reflectance=[0,0,0];
      for(let i=0,j=0;i<source.pixels.length;i+=4,j+=3){
        for(let c=0;c<3;c++)rgb[c]=linear[source.pixels[i+c]];
        const sample=descriptor.colorMode==='procedural'?rgb:photos.photographicReflectance(rgb,MATERIAL_ASSETS[descriptor.asset],reflectance,descriptor.colorMode);
        for(let c=0;c<3;c++)data[j+c]=linear[encode(sample[c])];
      }
      normalized.set(sourceKey,[{data,width:source.width,height:source.height}]);
    }
    const levels=normalized.get(sourceKey),size=256,output=Buffer.alloc(size*size*3);
    const span={wall:.8,wood:.4,floor:1.2,fabric:.18}[descriptor.role];
    const du=source.width*span/descriptor.meters[0]/size,dv=source.height*span/descriptor.meters[1]/size;
    const lod=Math.max(0,Math.log2(Math.max(du,dv))),lo=Math.floor(lod),fraction=lod-lo;
    while(levels.length<=lo+1){
      const previous=levels.at(-1),width=Math.max(1,Math.floor(previous.width/2)),height=Math.max(1,Math.floor(previous.height/2)),data=new Float32Array(width*height*3);
      for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++){
        let total=0;for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++)total+=previous.data[(((y*2+yy)%previous.height)*previous.width+(x*2+xx)%previous.width)*3+c];
        data[(y*width+x)*3+c]=total/4;
      }
      levels.push({width,height,data});
    }
    const sample=(level,x,y,c)=>{
      const u=(x+.5)*level.width*span/descriptor.meters[0]/size,v=(y+.5)*level.height*span/descriptor.meters[1]/size;
      const x0=Math.floor(u)%level.width,y0=Math.floor(v)%level.height,x1=(x0+1)%level.width,y1=(y0+1)%level.height,fu=u-Math.floor(u),fv=v-Math.floor(v),pixels=level.data;
      const top=pixels[(y0*level.width+x0)*3+c]*(1-fu)+pixels[(y0*level.width+x1)*3+c]*fu;
      const bottom=pixels[(y1*level.width+x0)*3+c]*(1-fu)+pixels[(y1*level.width+x1)*3+c]*fu;
      return top*(1-fv)+bottom*fv;
    };
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      for(let c=0;c<3;c++){
        const value=sample(levels[lo],x,y,c)*(1-fraction)+sample(levels[lo+1],x,y,c)*fraction;
        output[(y*size+x)*3+c]=encode(value*descriptor.pigment[c]);
      }
    }
    const signature=createHash('sha256').update('jpeg86-444-v1').update(output).digest('hex').slice(0,20),file=signature+'_swatch.jpg';
    if(!unique.has(file)){
      const target=fileURLToPath(new URL(file,folder));
      const stats=JSON.parse(python('from PIL import Image,ImageStat\nimport sys,json\nim=Image.frombytes("RGB",(256,256),sys.stdin.buffer.read())\nim.save(sys.argv[1],quality=86,optimize=True,subsampling=0)\ns=ImageStat.Stat(Image.open(sys.argv[1]))\nprint(json.dumps({"meanSrgb":s.mean,"stdSrgb":s.stddev}))',[target],output));
      const bytes=readFileSync(target);unique.set(file,{file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),...stats});
    }
    const {pixels:omit,...description}=descriptor;
    const entry={...description,key,viewMeters:span,...unique.get(file)};records.push(entry);
    lookup[key]={file,colorMode:descriptor.colorMode,pigment:descriptor.pigment};
  }
  const manifest={version:1,method:'Production material pigment + production photographicReflectance in linear light; source texture quantization reproduced before pigment multiplication. Unlit albedo, no invented lighting.',
    sampleCount:records.length,uniqueFiles:unique.size,totalBytes:[...unique.values()].reduce((sum,r)=>sum+r.bytes,0),samples:records};
  writeFileSync(new URL('manifest.json',folder),JSON.stringify(manifest,null,2)+'\n');
  for(const file of readdirSync(folder))if(file.endsWith('_swatch.jpg')&&!unique.has(file))unlinkSync(new URL(file,folder));
  writeFileSync(new URL('src/style-material-swatches.js',root),'// Generated by scripts/prepare-style-material-swatches.mjs; production-calibrated albedo.\nexport const STYLE_MATERIAL_SWATCHES=Object.freeze('+JSON.stringify(lookup)+');\n');
  console.log(JSON.stringify({sampleCount:manifest.sampleCount,uniqueFiles:manifest.uniqueFiles,totalBytes:manifest.totalBytes}));
  return manifest;
}

if(process.argv[1]===fileURLToPath(import.meta.url))generateStyleMaterialSwatches();
