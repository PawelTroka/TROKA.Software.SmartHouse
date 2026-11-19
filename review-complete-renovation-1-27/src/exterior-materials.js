import * as THREE from '../vendor/three.module.js';

// Finish specifications describe construction, grain and reflectance. They are
// independent of palette colours and keep the original/current materials intact.
import {getExteriorSurfaceSpec} from './exterior-recipes.js?v=1.26.0';
export {EXTERIOR_SURFACES,getExteriorSurfaceSpec,getBalconyGuardRecipe} from './exterior-recipes.js?v=1.26.0';
const woodTypes=new Set(['oak','ash','walnut','teak','cedar','silvered-wood','charred-wood','reclaimed-wood','weatherboard']);
const fabricTypes=new Set(['linen','woven','boucle','canvas','velvet','vinyl']);
const metalTypes=new Set(['bronze','brass','anodized','chrome','painted-steel','blackened-steel','zinc','standing-seam']);
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const fract=v=>v-Math.floor(v);
const hash=(x,y)=>fract(Math.sin(x*127.1+y*311.7+17.13)*43758.5453);
const wave=(u,v)=>Math.sin(u*2*Math.PI)*Math.cos(v*2*Math.PI);

/** Deterministic, bounded, periodic material maps; default dimensions are 128px.
 * Map units are projected by the mesh UVs. The finish name describes a proposed
 * material, not a photographed manufacturer product or a cost allowance. */
export function exteriorSurfacePixels(kind,size=128,{seams=true}={}){
  size=Math.max(16,Math.min(256,Math.round(size)));
  const height=new Float32Array(size*size),color=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size,v=y/size,i=y*size+x;
    const grit=wave(u*23+wave(u*3,v*2)*.12,v*19)*.045+wave(u*43,v*31)*.025;
    let h=.5,tone=.93,warm=0;
    if(woodTypes.has(kind)){
      const plank=Math.floor(u*5),seam=Math.min(fract(u*5),1-fract(u*5));
      const grain=Math.sin((u*49+wave(u*3,v*2)*.30+wave(u*7,v)*.12)*Math.PI*2);
      const fine=Math.sin((u*113+wave(u*4,v*3)*.16)*Math.PI*2);
      const dark=kind==='charred-wood',weathered=['silvered-wood','reclaimed-wood','weatherboard'].includes(kind);
      h=.55+grain*.045+fine*.025+grit*(dark?1.5:.45)-(seams&&seam<.045?.19:0);
      tone=.84+grain*.055+fine*.025+(seams?(hash(plank,3)-.5)*.11:0)-(seams&&seam<.035?.24:0);
      if(weathered)tone+=wave(u*7,v*17)*.045;
      if(dark){h+=Math.max(0,Math.sin(u*83*Math.PI*2+Math.sin(v*8*Math.PI*2)))*.07;tone=.78+(tone-.78)*.55;}
      warm=kind==='teak'||kind==='cedar'?.035:kind==='silvered-wood'?-.015:.014;
    }else if(fabricTypes.has(kind)){
      const scale=kind==='woven'?16:kind==='boucle'?23:kind==='canvas'?39:kind==='velvet'?48:64;
      const warp=Math.cos(u*scale*Math.PI*2),weft=Math.cos(v*scale*Math.PI*2);
      h=.50+(warp+weft)*(kind==='woven'?.09:kind==='boucle'?.045:.025);
      tone=.94+(warp+weft)*(kind==='woven'?.035:.013)+grit*.25;
      if(kind==='boucle'){const loops=wave(u*13+wave(u*7,v*5)*.2,v*17);h+=loops*.07;tone+=loops*.035;}
      if(kind==='vinyl'){h=.5+grit*.18;tone=.96+grit*.12;}
      if(kind==='velvet'){h=.5+grit*.25;tone=.91+wave(u*5,v*3)*.04;}
    }else if(['terracotta','clinker','terracotta-roof','slate'].includes(kind)){
      const nx=kind==='clinker'?5:kind==='terracotta'?3:7,ny=kind==='terracotta'?3:kind==='clinker'?10:6;
      const row=Math.floor(v*ny),pu=fract(u*nx+(kind==='terracotta'?0:row%2*.5)),pv=fract(v*ny);
      const seam=seams&&(pu<.035||pv<.055);const tile=seams?hash(Math.floor(u*nx+row%2*.5),row):.5;
      h=seam?.22:.56+grit*.8;tone=seam?.72:.88+tile*.10+grit*.4;warm=kind==='slate'?0:.03;
      if(kind==='terracotta-roof'){h+=Math.sin(pu*Math.PI)*.18;tone+=Math.sin(pu*Math.PI)*.06;}
      if(kind==='slate'){h+=wave(u*31,v*19)*.04;tone+=wave(u*7,v*13)*.05;}
    }else if(kind==='terrazzo'){
      const a=hash(Math.floor(u*47),Math.floor(v*47)),chip=a>.80;
      h=.5+grit*.15;tone=chip?.70+hash(Math.floor(u*47),4)*.2:.96+grit*.15;warm=chip?(a-.9)*.2:0;
    }else if(kind==='board-concrete'){
      const seam=Math.min(fract(v*5),1-fract(v*5)),tie=Math.hypot(fract(u*4)-.5,fract(v*5)-.5);
      h=.5+grit*.8-(seam<.03?.10:0)-(tie<.045?.13:0);tone=.90+wave(u*3,v*7)*.03+grit*.6-(tie<.04?.10:0);
    }else if(metalTypes.has(kind)){
      h=.5+wave(u*61,v)*.006;tone=.94+wave(u*57,v)*.015;
      if(kind==='standing-seam'){const seam=Math.min(fract(u*5),1-fract(u*5));h+=seam<.045?.23:0;tone-=seam<.025?.17:0;}
    }else{
      const coarse=wave(u*3+wave(u,v*2)*.2,v*5)*.055+wave(u*7,v*11)*.025;
      const smooth=kind==='smooth-render'||kind==='porcelain';
      h=.5+grit*(smooth?.18:kind==='sand-render'?1.8:.8)+coarse*(kind==='limewash'?.25:.8);
      tone=.94+grit*.3+coarse*(kind==='limewash'?1.1:.35);
      if(['travertine','sandstone','limestone','basalt'].includes(kind)){
        const strata=Math.sin((v*9+wave(u*2,v*3)*.35)*Math.PI*2);
        h+=strata*(kind==='travertine'?.08:.025);tone+=strata*(kind==='travertine'?.045:.022);
        if(kind==='travertine'&&hash(Math.floor(u*91),Math.floor(v*75))>.975){h-=.12;tone-=.07;}
      }
      if(kind==='clay-render')tone+=wave(u*2,v*3)*.055;
    }
    height[i]=clamp(h);color.set([clamp(tone+warm),clamp(tone),clamp(tone-warm)].map(n=>Math.round(n*255)).concat(255),i*4);
  }
  const normals=new Uint8Array(size*size*4),relief=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=y*size+x,h=height[i],dx=height[y*size+(x+1)%size]-height[y*size+(x-1+size)%size],dy=height[((y+1)%size)*size+x]-height[((y-1+size)%size)*size+x],length=Math.hypot(dx*1.5,dy*1.5,1);
    normals.set([-dx*1.5,-dy*1.5,1].map(n=>Math.round((n/length*.5+.5)*255)).concat(255),i*4);
    const q=Math.round(h*255);relief.set([q,q,q,255],i*4);
  }
  return {size,color,normals,relief};
}

function dataTexture(bytes,size,color=false){
  const texture=new THREE.DataTexture(bytes,size,size,THREE.RGBAFormat);
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=true;
  texture.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;texture.needsUpdate=true;
  return texture;
}
const owned=new WeakMap();
function own(material,textures){
  const previous=owned.get(material);if(previous)for(const texture of previous)texture.dispose();
  else material.addEventListener('dispose',()=>{for(const texture of owned.get(material)||[])texture.dispose();owned.delete(material);});
  owned.set(material,textures);
}
export function exteriorFinishForRole(style,role){
  const s=getExteriorSurfaceSpec(style);if(!s)return null;
  if(['wood','woodLight','timber','door'].includes(role))return s.wood;
  if(['linen','fabric','upholstery'].includes(role))return s.fabric;
  if(['wall','plaster'].includes(role))return s.wall;
  if(role==='roof')return s.roof;
  if(role==='deck')return s.paving;
  if(['metal','frame','houseFrame','rail','hstFrame','styleAccent'].includes(role))return s.metal;
  if(['stone','stoneLight','surface','edge','plinth','brick','floor'].includes(role))return ['clinker','terracotta','terrazzo','basalt'].includes(s.paving)?s.paving:woodTypes.has(s.paving)?'limestone':s.paving;
  return 'smooth-render';
}

/** Mutate an already-owned material, preserving its colour and transparency.
 * All generated maps are released on material.dispose(), including replacements. */
export function applyExteriorSurface(material,style,role,{svgMode=false,seams=role!=='deck'}={}){
  const finish=exteriorFinishForRole(style,role);if(!finish||!material)return material;
  const metal=metalTypes.has(finish),fabric=fabricTypes.has(finish),polished=['porcelain','terrazzo','vinyl'].includes(finish);
  material.roughness=finish==='chrome'?.20:finish==='brass'?.29:finish==='anodized'?.34:metal?.46:polished?.34:fabric?.91:woodTypes.has(finish)?.64:.86;
  material.metalness=finish==='chrome'?.88:['brass','bronze','zinc','standing-seam','anodized'].includes(finish)?.62:finish==='blackened-steel'?.45:0;
  if(!svgMode){
    // The terrace renderer supplies metre-registered paving/board joints. Its
    // colour map must not paint a second, contradictory grid over that bond.
    const {size,color,normals}=exteriorSurfacePixels(finish,128,{seams}),map=dataTexture(color,size,true),normal=dataTexture(normals,size);
    own(material,[map,normal]);material.map=map;material.normalMap=normal;
    material.bumpMap=null;material.roughnessMap=null;material.normalScale=new THREE.Vector2(metal?.24:fabric?.28:.60,metal?.24:fabric?.28:.60);
  }
  material.userData.exteriorFinish=finish;material.userData.exteriorRole=role;material.needsUpdate=true;
  return material;
}

