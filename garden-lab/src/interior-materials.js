import * as THREE from '../vendor/three.module.js';
import {applyPhotographicSurface} from './material-assets.js?v=1.29.0';
import {exteriorSurfacePixels} from './exterior-materials.js?v=1.29.0';
import {getDesignStyle} from './design-styles.js?v=1.29.0';
import {getInteriorStyleRecipe} from './interior-style-recipes.js?v=1.29.0';

const mix=(a,b,t)=>new THREE.Color(a).lerp(new THREE.Color(b),t);
function pattern(width,height,draw,repeatX=1,repeatY=1) {
  const c=document.createElement('canvas');c.width=width;c.height=height;
  const ctx=c.getContext('2d');let seed=301;
  function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
  draw(ctx,random);
  const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(repeatX,repeatY);map.anisotropy=4;return map;
}
function planks(kind='boards') {
  const bleached=kind==='bleached-boards',rows=bleached?6:kind==='wide-boards'?5:kind==='narrow-boards'?14:kind==='weathered-boards'?7:8;
  return pattern(512,256,(ctx,rnd)=>{
    ctx.fillStyle='#dad5ca';ctx.fillRect(0,0,512,256);
    for(let row=0;row<rows;row++) {
      const origin=(row*73)%256-256, y=row*256/rows,step=256/rows;
      for(let x=origin;x<512;x+=256) {
        const shade=Math.floor((bleached?236:216)+rnd()*(bleached?15:31));
        ctx.fillStyle=`rgb(${shade},${shade-2},${shade-5})`;ctx.fillRect(x,y,256,step);
        ctx.save();ctx.beginPath();ctx.rect(x,y,256,step);ctx.clip();
        for(let line=0;line<39;line++) {
          const yy=y+rnd()*step,bend=rnd()*5-2.5;
          ctx.beginPath();ctx.moveTo(x,yy);ctx.bezierCurveTo(x+65,yy+bend*2,x+131,yy-bend*3,x+256,yy+bend);
          ctx.strokeStyle=`rgba(67,49,28,${bleached?.012+rnd()*.055:.025+rnd()*.105})`;ctx.lineWidth=.4+rnd()*.8;ctx.stroke();
        }
        ctx.restore();ctx.fillStyle='rgba(58,43,29,.31)';ctx.fillRect(x,y,256,1.15);ctx.fillRect(x,y,1,step);
      }
    }
  },1/2.8,1/1.4);
}
function parquet(deco=false) {
  return pattern(256,256,(ctx,rnd)=>{
    ctx.fillStyle='#b9ad96';ctx.fillRect(0,0,256,256);ctx.save();ctx.translate(128,128);ctx.rotate(Math.PI/4);
    const step=32,length=96;
    for(let row=-8;row<8;row++)for(let col=-8;col<8;col++){
      const x=col*length+row*step,y=row*step-col*step,shade=198+Math.floor(rnd()*50);
      ctx.fillStyle=`rgb(${shade},${shade-3},${shade-8})`;
      ctx.fillRect(x,y,length-1.6,step-1.6);ctx.fillRect(x+length,y,step-1.6,length-1.6);
      ctx.strokeStyle='rgba(67,46,24,.10)';ctx.lineWidth=.6;
      for(let g=0;g<6;g++){ctx.beginPath();ctx.moveTo(x,y+4+g*4);ctx.lineTo(x+length-2,y+3+g*4);ctx.stroke();}
    }
    ctx.restore();if(deco){ctx.strokeStyle='#817967';ctx.lineWidth=2;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(128,8+i*8);ctx.lineTo(248-i*8,128);ctx.lineTo(128,248-i*8);ctx.lineTo(8+i*8,128);ctx.closePath();ctx.stroke();}}
  },1/1.2,1/1.2);
}
function materialSurface(kind) {
  return pattern(256,256,(ctx,rnd)=>{
    ctx.fillStyle='#e9e6dd';ctx.fillRect(0,0,256,256);
    const noise=['smooth','resin','eggshell'].includes(kind)?500:3500;
    for(let i=0;i<noise;i++){const v=90+Math.floor(rnd()*120);ctx.fillStyle=`rgba(${v},${v},${v},${.025+rnd()*.12})`;ctx.fillRect(rnd()*256,rnd()*256,.6+rnd()*2.4,.6+rnd()*2.4);}
    if(['tile','zellige','mosaic','terracotta','clinker','slab','slate','honed-stone','sandstone','travertine','encaustic'].includes(kind)){
      const tile=kind==='zellige'||kind==='mosaic'?32:kind==='clinker'?64:kind==='terracotta'||kind==='encaustic'?64:128;
      for(let y=0;y<256;y+=tile)for(let x=-tile;x<256;x+=tile){
        const shift=['clinker','slate','sandstone','travertine'].includes(kind)?(y/tile%2)*tile/2:0,variation=kind==='zellige'?40:kind==='terracotta'?34:16,v=222+Math.floor(rnd()*variation);
        ctx.fillStyle=`rgba(${v},${v-2},${v-6},.6)`;ctx.fillRect(x+shift+1.2,y+1.2,tile-2.4,tile-2.4);ctx.strokeStyle=kind==='mosaic'?'#adaba4':'#c5bdae';ctx.lineWidth=kind==='slab'?1:1.7;ctx.strokeRect(x+shift,y,tile,tile);
        if(kind==='zellige'){ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=1;ctx.strokeRect(x+shift+3,y+3,tile-6,tile-6);}
        if(kind==='encaustic'){ctx.strokeStyle='#8f887a';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x+shift+tile/2,y+tile/2,tile*.26,0,Math.PI*2);ctx.stroke();for(let a=0;a<4;a++){ctx.beginPath();ctx.moveTo(x+shift+tile/2,y+tile/2);ctx.lineTo(x+shift+tile/2+Math.cos(a*Math.PI/2)*tile*.39,y+tile/2+Math.sin(a*Math.PI/2)*tile*.39);ctx.stroke();}}
      }
    }
    if(kind==='terrazzo')for(let i=0;i<410;i++){
      const x=rnd()*256,y=rnd()*256,r=1+rnd()*5;ctx.fillStyle=['#a5a29a','#c2b7a2','#d0c4b5','#878a84','#f9f7ee'][i%5];ctx.beginPath();ctx.moveTo(x-r,y);ctx.lineTo(x+r*.7,y-r*.5);ctx.lineTo(x+r,y+r*.7);ctx.lineTo(x-r*.4,y+r);ctx.closePath();ctx.fill();
    }
    if(kind==='marble')for(let i=0;i<17;i++){
      const x=rnd()*256;ctx.beginPath();ctx.moveTo(x,-12);ctx.bezierCurveTo(x-70,95,x+80,163,x+45,268);ctx.strokeStyle=`rgba(97,102,102,${.09+rnd()*.20})`;ctx.lineWidth=.3+rnd()*2;ctx.stroke();
    }
    if(kind==='riverstone')for(let row=-1;row<8;row++)for(let col=-1;col<8;col++){
      const x=col*38+(row%2)*17+rnd()*5,y=row*38+rnd()*5,r=12+rnd()*5,v=170+Math.floor(rnd()*65);ctx.fillStyle=`rgb(${v},${v+1},${v-2})`;ctx.beginPath();ctx.ellipse(x,y,r,r*.70,rnd()*3,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#f0eadc';ctx.lineWidth=2;ctx.stroke();
    }
    if(kind==='penny-tile'){
      ctx.fillStyle='#bfc8c5';ctx.fillRect(0,0,256,256);
      const pitch=32;
      for(let row=-1;row<10;row++)for(let col=-1;col<9;col++){
        const x=col*pitch+(row%2)*pitch/2,y=row*pitch*Math.sqrt(3)/2,v=237+Math.floor(rnd()*16);
        ctx.fillStyle=`rgb(${v},${v+1},${v})`;ctx.beginPath();ctx.arc(x,y,14.3,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle='rgba(255,255,255,.65)';ctx.lineWidth=1.1;ctx.beginPath();ctx.arc(x,y,12.5,Math.PI,Math.PI*1.8);ctx.stroke();
      }
    }
    if(['limewash','clay','stucco','microcement','concrete'].includes(kind))for(let i=0;i<36;i++){
      const x=rnd()*256,y=rnd()*256;ctx.fillStyle=i%2?'rgba(255,255,255,.035)':'rgba(75,62,49,.027)';ctx.beginPath();ctx.ellipse(x,y,12+rnd()*31,3+rnd()*14,rnd()*3,0,Math.PI*2);ctx.fill();
    }
    if(['travertine','sandstone','clay','slate'].includes(kind))for(let i=0;i<28;i++){const y=rnd()*256;ctx.strokeStyle='rgba(91,78,60,.09)';ctx.lineWidth=.4+rnd()*2;ctx.beginPath();ctx.moveTo(0,y);ctx.bezierCurveTo(72,y+6,155,y-4,256,y+2);ctx.stroke();}
  },kind==='riverstone'?1/.8:kind==='marble'?1/1.8:1,kind==='riverstone'?1/.8:kind==='marble'?1/1.8:1);
}
function upholstery(kind) {
  if(kind==='linen'||kind==='woven'||kind==='canvas')return weave(kind==='canvas');
  return pattern(128,128,(ctx,rnd)=>{
    ctx.fillStyle='#e9e7e1';ctx.fillRect(0,0,128,128);
    if(kind==='washed-linen'){
      for(let i=0;i<128;i+=2){const w=.45+rnd()*.9;ctx.fillStyle=`rgba(98,87,67,${.025+rnd()*.10})`;ctx.fillRect(i,0,w,128);ctx.fillRect(0,i,128,w*.75);}
      for(let i=0;i<52;i++){ctx.fillStyle='rgba(255,255,255,.26)';ctx.fillRect(rnd()*128,rnd()*128,.8+rnd(),3+rnd()*7);}
    }
    else if(kind==='velvet'){for(let i=0;i<128;i++){ctx.fillStyle=`rgba(78,74,70,${rnd()*.11})`;ctx.fillRect(i,0,.65,128);}}
    else if(kind==='leather'){for(let i=0;i<600;i++){const x=rnd()*128,y=rnd()*128;ctx.strokeStyle='rgba(80,73,67,.12)';ctx.lineWidth=.45;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+2+rnd()*4,y+1+rnd()*3);ctx.stroke();}}
    else for(let i=0;i<2300;i++){ctx.fillStyle=`rgba(73,68,58,${.04+rnd()*.13})`;ctx.beginPath();ctx.arc(rnd()*128,rnd()*128,kind==='boucle'?.6+rnd()*1.4:.4+rnd()*.9,0,Math.PI*2);ctx.fill();}
  },kind==='boucle'?3:2,kind==='boucle'?3:2);
}
function mineral(tile) {
  return pattern(256,256,(ctx,rnd)=>{
    ctx.fillStyle='#f5f4f0';ctx.fillRect(0,0,256,256);
    for(let i=0;i<7100;i++) {const n=40+Math.floor(rnd()*120);ctx.fillStyle=`rgba(${n},${n},${n},${.015+rnd()*.11})`;ctx.fillRect(rnd()*256,rnd()*256,.5+rnd()*2,.5+rnd()*2);}
    if(tile){ctx.fillStyle='#a9a8a0';ctx.fillRect(0,0,256,1.4);ctx.fillRect(0,0,1.4,256);}
  },tile?1/.58:1,tile?1/.58:1);
}
function brickPaving() {
  return pattern(256,128,(ctx,rnd)=>{
    ctx.fillStyle='#b6b0a4';ctx.fillRect(0,0,256,128);
    for(let row=0;row<2;row++)for(let col=-1;col<3;col++){
      const shade=Math.round(214+rnd()*30);ctx.fillStyle=`rgb(${shade},${shade-4},${shade-7})`;
      ctx.fillRect(col*128+(row%2)*64+2,row*64+2,124,60);
    }
  },1/.50,1/.24);
}
function weave(rug=false) {
  return pattern(128,128,(ctx,rnd)=>{
    ctx.fillStyle='#f4f0e5';ctx.fillRect(0,0,128,128);
    for(let i=0;i<128;i+=2){ctx.fillStyle=`rgba(77,66,49,${.07+rnd()*.16})`;ctx.fillRect(i,0,.75,128);ctx.fillRect(0,i,128,.65);}
    if(rug)for(let x=4;x<128;x+=16){ctx.fillStyle='rgba(95,75,49,.28)';ctx.fillRect(x,0,2,128);}
  },rug?1:2,rug?1:2);
}
function artwork(palette) {
  return pattern(160,200,(ctx)=>{
    ctx.fillStyle='#e9e1d1';ctx.fillRect(0,0,160,200);
    ctx.fillStyle=palette.accent;ctx.beginPath();ctx.arc(112,64,37,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=palette.frame;ctx.beginPath();ctx.moveTo(15,193);ctx.bezierCurveTo(70,125,19,75,97,37);ctx.bezierCurveTo(65,111,113,151,72,193);ctx.fill();
    ctx.fillStyle=palette.wood;ctx.beginPath();ctx.moveTo(94,194);ctx.bezierCurveTo(119,177,142,120,160,119);ctx.lineTo(160,194);ctx.fill();
    ctx.fillStyle='#eee8da';ctx.fillRect(0,194,160,6);
  });
}
export function interiorMaterials(styleId,{svgMode=false}={}) {
  const style=getDesignStyle(styleId), p=style.palette, current=style.id==='current', interiorRecipe=getInteriorStyleRecipe(style.id),maps=[];
  const map=t=>{maps.push(t);return t;};
  const coastal=style.id==='coastal';
  const woodMap=map(planks(coastal?'bleached-boards':'boards')),tileMap=map(current?mineral(true):materialSurface(interiorRecipe.wetFloor)),stoneMap=map(current?mineral(false):materialSurface(coastal?'quartz':['riviera-deco','party-club'].includes(style.id)?'marble':['hidden-bali','japandi'].includes(style.id)?'honed-stone':'travertine')),linen=map(current?weave():upholstery(interiorRecipe.upholstery));
  const timberFloors=['boards','wide-boards','dark-boards','pale-boards','bleached-boards','weathered-boards','narrow-boards','herringbone','dark-parquet','deco-parquet'];
  const parquetFloor=['herringbone','dark-parquet','deco-parquet'].includes(interiorRecipe.floor);
  const floorMap=current?woodMap:map(parquetFloor?parquet(interiorRecipe.floor==='deco-parquet'):timberFloors.includes(interiorRecipe.floor)?planks(interiorRecipe.floor):materialSurface(interiorRecipe.floor));
  const wallMap=current?null:interiorRecipe.wallSurface==='wood'?woodMap:map(materialSurface(interiorRecipe.wallSurface==='brick'?'clinker':interiorRecipe.wallSurface));
  const make=(color,roughness=.8,more={})=>new THREE.MeshStandardMaterial({color,roughness,...more});
  const physical=(color,roughness=.8,more={})=>new THREE.MeshPhysicalMaterial({color,roughness,...more});
  const fabricRoughness=interiorRecipe.upholstery==='leather'?.48:interiorRecipe.upholstery==='velvet'?.75:.95;
  const m={
    wall:make(current?'#e9e3d7':mix(p.houseWall,'#fff8e8',.36),.88,wallMap?{map:wallMap,bumpMap:wallMap,bumpScale:['clay','stucco','wood','brick'].includes(interiorRecipe.wallSurface)?.012:.004}:{}),ceiling:make('#f3eee4',.89,{side:THREE.DoubleSide}),cut:make('#474e48'),trim:make(current?'#eee8dd':mix(p.edge,'#fffaf0',.48)),
    wood:make(p.wood,.52,{map:woodMap,...(!current?{bumpMap:woodMap,bumpScale:.007}:{})}),oak:make(mix(p.wood,'#d8b98f',.38),.56,{map:woodMap,...(!current?{bumpMap:woodMap,bumpScale:.006}:{})}),
    boards:make(current?'#c9a47b':mix(p.wood,'#ddc3a0',interiorRecipe.floor==='dark-boards'?.11:.30),.69,{map:floorMap,...(!current?{bumpMap:floorMap,bumpScale:.006}:{})}),tiles:make(mix(p.surface,'#e7e3d7',.27),['zellige','marble','mosaic'].includes(interiorRecipe.wetFloor)?.27:.63,{map:tileMap,...(!current?{bumpMap:tileMap,bumpScale:interiorRecipe.wetFloor==='riverstone'?.018:.006}:{})}),
    stone:make(coastal?'#f1eee4':mix(p.edge,'#e6ded0',.27),coastal?.36:interiorRecipe.wetFloor==='marble'?.28:.58,{map:stoneMap,...(!current?{bumpMap:stoneMap,bumpScale:.004}:{})}),slate:make(mix(p.frame,'#a5aaa1',.34),.84,{map:tileMap}),
    frame:make(p.frame,.48,{metalness:.15}),dark:make('#303938',.4),blackGlass:make('#182628',.17,{metalness:.42}),steel:make('#bcbab0',.27,{metalness:.73}),bronze:make('#a18356',.32,{metalness:.62}),
    cabinet:make(current?'#9b9d87':mix(p.accent,p.edge,.4),interiorRecipe.cabinet==='gloss'?.20:.51),fabric:physical(p.fabric,fabricRoughness,{map:linen,...(!current?{bumpMap:linen,bumpScale:interiorRecipe.upholstery==='boucle'?.012:.004}:{})}),accent:physical(p.accent,fabricRoughness,{map:linen,...(!current?{bumpMap:linen,bumpScale:.004}:{})}),
    linen:physical('#f5ecdb',.93,{map:linen}),duvet:physical(mix(p.fabric,p.accent,.21),.92,{map:linen}),rug:make(mix(p.edge,p.accent,.15),.99,{map:map(weave(true))}),
    painted:make('#f5f4eb',.58,coastal?{map:wallMap,bumpMap:wallMap,bumpScale:.002}:{}),lampShade:make('#f4eddb',.92,{map:linen,side:THREE.DoubleSide,emissive:'#e8dec7',emissiveIntensity:.08}),
    ceramic:physical('#fcf9eb',.2,{metalness:0,clearcoat:.22,clearcoatRoughness:.12}),water:make('#a8c6bf',.12,{metalness:.17}),glass:physical('#eef8f7',.06,{transparent:true,opacity:.14,depthWrite:false,metalness:0,ior:1.5,reflectivity:.5,side:THREE.DoubleSide}),
    leaf:make('#52694c',.8),leafLight:make('#829573',.76),pot:make(mix(p.accent,'#ca9378',.43),.8),paper:make('#e5dcc4'),art:make('#ffffff',.8,{map:map(artwork(p))}),
    glow:make(p.light,.5,{emissive:p.light,emissiveIntensity:.55}),addition:make('#539a80'),removed:make('#c35844'),
    concrete:make('#aca99d',.94,{map:stoneMap}),brick:make('#aa8169',.93,{map:tileMap}),plinth:make('#5b635b',.88),
    brickFloor:make('#a36d4f',.96,{map:map(brickPaving())}),earth:make('#74634e',1,{map:stoneMap}),
    cane:make(mix(p.wood,'#dcc099',.40),.82,{map:linen,bumpMap:linen,bumpScale:.008}),lacquer:physical(p.accent,.22,{metalness:0,clearcoat:.85,clearcoatRoughness:.10}),
    spaWater:make('#83cbd1',.11,{metalness:.03,transparent:true,opacity:.58,depthWrite:false}),spaGlow:make('#7bdde9',.3,{emissive:'#45d7ed',emissiveIntensity:.85}),bubbles:make('#d9ffff',.12,{transparent:true,opacity:.73,depthWrite:false}),
  };
  if(!current&&!timberFloors.includes(interiorRecipe.floor))m.floor=make(mix(p.surface,'#e8e0d2',.12),['resin','terrazzo'].includes(interiorRecipe.floor)?.35:.77,{map:floorMap,bumpMap:floorMap,bumpScale:interiorRecipe.floor==='terracotta'?.012:.004});
  // Diffuse colour is paint/grain/stain, not height. Replace the former sRGB
  // colour-as-bump shortcut with independent linear microsurface channels.
  const channelCache=new Map();
  const channels=(kind,source,scale=.22)=>{
    const repeat=source?.repeat?.toArray()||[1,1],key=kind+'/'+repeat.join('/');
    if(!channelCache.has(key)){
      const pixels=exteriorSurfacePixels(kind,128,{seams:false}),entry={};
      for(const [name,data] of [['normalMap',pixels.normals],['roughnessMap',pixels.roughness]]){
        const texture=new THREE.DataTexture(data,pixels.size,pixels.size,THREE.RGBAFormat);
        texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.minFilter=THREE.LinearMipmapLinearFilter;
        texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=true;texture.colorSpace=THREE.NoColorSpace;
        texture.repeat.set(...repeat);texture.needsUpdate=true;entry[name]=map(texture);
      }
      channelCache.set(key,entry);
    }
    return {...channelCache.get(key),normalScale:new THREE.Vector2(scale,scale),bumpMap:null};
  };
  for(const material of Object.values(m))if(material.bumpMap){
    Object.assign(material,channels(material===m.fabric||material===m.accent?interiorRecipe.upholstery==='boucle'?'boucle':'linen':
      [m.wood,m.oak,m.boards,m.cane].includes(material)?'oak':'smooth-render',material.map));
  }
  const photographic=(material,asset,options={})=>{
    if(svgMode)return;
    const owned=applyPhotographicSurface(material,asset,options);if(owned)maps.push(...owned);
  };
  for(const material of [m.wood,m.oak])photographic(material,'wood',{normalStrength:.45});
  const cloth=['linen','woven','canvas','washed-linen','fine'].includes(interiorRecipe.upholstery);
  for(const material of [m.fabric,m.accent,m.linen,m.duvet]){
    material.sheen=interiorRecipe.upholstery==='leather'?0:interiorRecipe.upholstery==='velvet'?.65:.35;
    material.sheenColor.copy(material.color);material.sheenRoughness=.8;
    if(cloth)photographic(material,'linen',{normalStrength:.40});
  }
  if(!['wood','brick'].includes(interiorRecipe.wallSurface))photographic(m.wall,'plaster',{
    normalStrength:['plain','smooth','eggshell'].includes(interiorRecipe.wallSurface)?.09:.27});
  photographic(m.ceiling,'plaster',{normalStrength:.06});
  if(timberFloors.includes(interiorRecipe.floor)&&!parquetFloor){
    const scale=interiorRecipe.floor==='wide-boards'?.72:interiorRecipe.floor==='narrow-boards'?1.55:1;
    photographic(m.boards,'floor',{normalStrength:.35,repeat:[.5*scale,.5*scale]});
  }
  if(['marble','honed-stone','travertine'].includes(interiorRecipe.wetFloor))photographic(m.tiles,'stone',{normalStrength:.35});
  const architecturalFloor=m.floor||m.boards;
  return {m,style,interiorRecipe,architecturalFloor,dispose(){for(const mat of new Set(Object.values(m)))mat.dispose();for(const t of new Set(maps))t.dispose();}};
}

/** Low-frequency sky and two bright panels provide soft reflections on brass,
 * glass and sanitaryware without a network HDRI or a dynamic reflection pass. */
export function interiorEnvironment(renderer) {
  const texture=pattern(256,128,(ctx)=>{
    const g=ctx.createLinearGradient(0,0,0,128);g.addColorStop(0,'#a8c3cd');g.addColorStop(.48,'#f3f3e8');g.addColorStop(.66,'#d3c4ab');g.addColorStop(1,'#918378');ctx.fillStyle=g;ctx.fillRect(0,0,256,128);
    ctx.fillStyle='#fff9e5';ctx.fillRect(47,34,52,26);ctx.fillStyle='#f5f0df';ctx.fillRect(165,39,29,22);
  });
  texture.mapping=THREE.EquirectangularReflectionMapping;
  const generator=new THREE.PMREMGenerator(renderer), target=generator.fromEquirectangular(texture);generator.dispose();texture.dispose();
  // A distant, deliberately non-site-specific horizon outside the windows.
  const sky=pattern(768,256,(ctx)=>{
    const air=ctx.createLinearGradient(0,0,0,256);air.addColorStop(0,'#8aafc3');air.addColorStop(.38,'#c4dbe0');air.addColorStop(.49,'#e8e8d7');air.addColorStop(.54,'#c1c8af');air.addColorStop(1,'#aca58f');ctx.fillStyle=air;ctx.fillRect(0,0,768,256);
    for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(0,256);for(let x=0;x<=768;x+=2){const t=x*Math.PI*2/768;ctx.lineTo(x,128+i*1.8-Math.sin(t*4+i*2)*1.6-Math.cos(t*13+i)*1.2-Math.cos(t*57+i)*.5);}ctx.lineTo(768,256);ctx.closePath();ctx.fillStyle=['#bdcbbd','#b2bfa9','#a8b59c'][i];ctx.fill();}
  });sky.mapping=THREE.EquirectangularReflectionMapping;
  return{env:target.texture,sky,dispose(){target.dispose();sky.dispose();}};
}
