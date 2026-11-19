import * as THREE from '../vendor/three.module.js';
import {getDesignStyle} from './design-styles.js?v=1.26.0';

const mix=(a,b,t)=>new THREE.Color(a).lerp(new THREE.Color(b),t);
function pattern(width,height,draw,repeatX=1,repeatY=1) {
  const c=document.createElement('canvas');c.width=width;c.height=height;
  const ctx=c.getContext('2d');let seed=301;
  function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
  draw(ctx,random);
  const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(repeatX,repeatY);map.anisotropy=4;return map;
}
function planks() {
  return pattern(512,256,(ctx,rnd)=>{
    ctx.fillStyle='#dad5ca';ctx.fillRect(0,0,512,256);
    for(let row=0;row<8;row++) {
      const origin=(row*73)%256-256, y=row*32;
      for(let x=origin;x<512;x+=256) {
        const shade=Math.floor(216+rnd()*31);
        ctx.fillStyle=`rgb(${shade},${shade-2},${shade-5})`;ctx.fillRect(x,y,256,32);
        ctx.save();ctx.beginPath();ctx.rect(x,y,256,32);ctx.clip();
        for(let line=0;line<39;line++) {
          const yy=y+rnd()*32,bend=rnd()*5-2.5;
          ctx.beginPath();ctx.moveTo(x,yy);ctx.bezierCurveTo(x+65,yy+bend*2,x+131,yy-bend*3,x+256,yy+bend);
          ctx.strokeStyle=`rgba(67,49,28,${.025+rnd()*.105})`;ctx.lineWidth=.4+rnd()*.8;ctx.stroke();
        }
        ctx.restore();ctx.fillStyle='rgba(58,43,29,.31)';ctx.fillRect(x,y,256,1.15);ctx.fillRect(x,y,1,32);
      }
    }
  },1/2.8,1/1.4);
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
export function interiorMaterials(styleId) {
  const style=getDesignStyle(styleId), p=style.palette, current=style.id==='current', maps=[];
  const map=t=>{maps.push(t);return t;};
  const woodMap=map(planks()),tileMap=map(mineral(true)), stoneMap=map(mineral(false)), linen=map(weave());
  const make=(color,roughness=.8,more={})=>new THREE.MeshStandardMaterial({color,roughness,...more});
  const m={
    wall:make(current?'#e9e3d7':mix(p.houseWall,'#fff8e8',.36)),ceiling:make('#f3eee4',.89,{side:THREE.DoubleSide}),cut:make('#474e48'),trim:make(current?'#eee8dd':mix(p.edge,'#fffaf0',.48)),
    wood:make(p.wood,.52,{map:woodMap}),oak:make(mix(p.wood,'#d8b98f',.38),.56,{map:woodMap}),
    boards:make(current?'#c9a47b':mix(p.wood,'#ddc3a0',.36),.72,{map:woodMap}),tiles:make(mix(p.surface,'#e7e3d7',.27),.6,{map:tileMap}),
    stone:make(mix(p.edge,'#e6ded0',.27),.58,{map:stoneMap}),slate:make(mix(p.frame,'#a5aaa1',.34),.84,{map:tileMap}),
    frame:make(p.frame,.48,{metalness:.15}),dark:make('#303938',.4),blackGlass:make('#182628',.17,{metalness:.42}),steel:make('#bcbab0',.27,{metalness:.73}),bronze:make('#a18356',.32,{metalness:.62}),
    cabinet:make(current?'#9b9d87':mix(p.accent,p.edge,.4),.51),fabric:make(p.fabric,.96,{map:linen}),accent:make(p.accent,.91,{map:linen}),
    linen:make('#f5ecdb',.93,{map:linen}),duvet:make(mix(p.fabric,p.accent,.21),.92,{map:linen}),rug:make(mix(p.edge,p.accent,.15),.99,{map:map(weave(true))}),
    ceramic:make('#fcf9eb',.2,{metalness:.035}),water:make('#a8c6bf',.12,{metalness:.17}),glass:make('#accac4',.11,{transparent:true,opacity:.19,depthWrite:false,metalness:.11,side:THREE.DoubleSide}),
    leaf:make('#52694c',.8),leafLight:make('#829573',.76),pot:make(mix(p.accent,'#ca9378',.43),.8),paper:make('#e5dcc4'),art:make('#ffffff',.8,{map:map(artwork(p))}),
    glow:make(p.light,.5,{emissive:p.light,emissiveIntensity:.55}),addition:make('#539a80'),removed:make('#c35844'),
    concrete:make('#aca99d',.94,{map:stoneMap}),brick:make('#aa8169',.93,{map:tileMap}),plinth:make('#5b635b',.88),
    brickFloor:make('#a36d4f',.96,{map:map(brickPaving())}),earth:make('#74634e',1,{map:stoneMap}),
  };
  const stoneFloors=['modern-minimal','space-age','party-club','industrial-loft','mediterranean-villa','desert-modern','riviera-deco','palm-springs'];
  const architecturalFloor=stoneFloors.includes(style.id)?m.tiles:m.boards;
  return {m,style,architecturalFloor,dispose(){for(const mat of Object.values(m))mat.dispose();for(const t of maps)t.dispose();}};
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
