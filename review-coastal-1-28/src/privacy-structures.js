/**
 * Finite garden-architecture primitives shared by privacy, sunlight and drawing.
 * x/y are local metres; z is absolute elevation. Empty trellis gaps stay open.
 * Dense foliage is an explicit ideal established-planting comparison, never an
 * assumption that newly planted climbers provide an opaque wall immediately.
 */
import {PRIVACY_DEFAULTS} from './privacy-options.js?v=1.28.0';
export {PRIVACY_DEFAULTS} from './privacy-options.js?v=1.28.0';
const EPS=1e-8;
const number=(value,fallback)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const limit=(value,fallback,low,high)=>Math.max(low,Math.min(high,number(value,fallback)));
const point=value=>Array.isArray(value)?value:[value.x,value.y,value.z];

export const PRIVACY_GEOMETRY_KEYS=Object.freeze(Object.keys(PRIVACY_DEFAULTS));

/**
 * The supplied ground/floor references avoid a geometry-module import cycle.
 * `floorZ` is fixed to the living terrace; `groundAt(x,y)` follows proposed fill.
 * `jacuzzi` is the current finite tub footprint from geometry.jacuzziBounds().
 */
export function privacyStructureLayout(settings={},data,context){
  const siteId=data?.site?.id||settings.siteId||'sternicza-11';
  const result={enabled:false,boxes:[],footprints:[],warnings:[]};
  if(siteId!=='sternicza-11')return result;
  const s={...PRIVACY_DEFAULTS,...settings},ground=context.groundAt;
  const add=(id,group,part,label,x0,y0,x1,y1,z0,z1)=>{
    if(![x0,y0,x1,y1,z0,z1].every(Number.isFinite)||x1-x0<=EPS||y1-y0<=EPS||z1-z0<=EPS)return;
    result.boxes.push({id,group,part,label,x0,y0,x1,y1,z0,z1,opaque:true});
  };
  if(s.privacyPergolaEnabled===true){
    const x=limit(s.privacyPergolaX,PRIVACY_DEFAULTS.privacyPergolaX,.5,19.8),y=limit(s.privacyPergolaY,PRIVACY_DEFAULTS.privacyPergolaY,18.5,37);
    const width=limit(s.privacyPergolaWidth,PRIVACY_DEFAULTS.privacyPergolaWidth,1,8),length=limit(s.privacyPergolaDepth,PRIVACY_DEFAULTS.privacyPergolaDepth,1,5);
    const height=limit(s.privacyPergolaHeight,PRIVACY_DEFAULTS.privacyPergolaHeight,2.5,6),x1=x+width,y1=y+length;
    // Height is referenced to the lowest proposed ground at the four corners:
    // falling ground must not quietly make a nominal six-metre frame taller.
    const corners=[[x,y],[x1,y],[x1,y1],[x,y1]],grades=corners.map(([a,b])=>ground(a,b));
    const baseZ=Math.min(...grades),topZ=baseZ+height,post=.14,beam=.18;
    const group='pergola';
    result.footprints.push({id:'privacy-pergola',group,label:'Garden pergola',x,y,width,length,baseZ,topZ});
    corners.forEach(([a,b],i)=>add(`privacy-pergola-post-${i}`,group,'post','Garden pergola post',
      a-post/2,b-post/2,a+post/2,b+post/2,grades[i],topZ));
    for(const [name,yy]of[['front',y],['rear',y1]])add(`privacy-pergola-beam-${name}`,group,'beam','Garden pergola beam',
      x-post/2,yy-post/2,x1+post/2,yy+post/2,topZ-beam,topZ);
    for(const [name,xx]of[['west',x],['east',x1]])add(`privacy-pergola-beam-${name}`,group,'beam','Garden pergola beam',
      xx-post/2,y,xx+post/2,y1,topZ-beam,topZ);
    const rafters=Math.max(2,Math.ceil(width/.65));
    for(let i=1;i<rafters;i++){
      const xx=x+width*i/rafters;
      add(`privacy-pergola-rafter-${i}`,group,'beam','Open pergola roof beam',xx-.035,y,xx+.035,y1,topZ-.12,topZ);
    }
    const bottomZ=baseZ+.3,latticeTop=topZ-beam,slat=.035,thickness=.045;
    // Two plant-support faces; front and west remain open for garden access.
    const verticals=Math.max(2,Math.ceil(width/.45));
    for(let i=1;i<verticals;i++){
      const xx=x+width*i/verticals;
      add(`privacy-pergola-rear-lattice-${i}`,group,'lattice','Open pergola trellis',
        xx-slat/2,y1-thickness/2,xx+slat/2,y1+thickness/2,bottomZ,latticeTop);
    }
    const sideVerticals=Math.max(2,Math.ceil(length/.45));
    for(let i=1;i<sideVerticals;i++){
      const yy=y+length*i/sideVerticals;
      add(`privacy-pergola-east-lattice-${i}`,group,'lattice','Open pergola trellis',
        x1-thickness/2,yy-slat/2,x1+thickness/2,yy+slat/2,bottomZ,latticeTop);
    }
    const horizontals=Math.max(2,Math.ceil((latticeTop-bottomZ)/.5));
    for(let i=1;i<horizontals;i++){
      const zz=bottomZ+(latticeTop-bottomZ)*i/horizontals;
      add(`privacy-pergola-rear-cross-${i}`,group,'lattice','Open pergola trellis',
        x,y1-thickness/2,x1,y1+thickness/2,zz-slat/2,zz+slat/2);
      add(`privacy-pergola-east-cross-${i}`,group,'lattice','Open pergola trellis',
        x1-thickness/2,y,x1+thickness/2,y1,zz-slat/2,zz+slat/2);
    }
    if(s.privacyPergolaFoliage===true){
      add('privacy-pergola-rear-foliage',group,'foliage','Established pergola foliage · ideal dense cover',
        x,y1-.08,x1,y1+.08,bottomZ,latticeTop);
      add('privacy-pergola-east-foliage',group,'foliage','Established pergola foliage · ideal dense cover',
        x1-.08,y,x1+.08,y1,bottomZ,latticeTop);
    }
    if(Math.max(...grades)-baseZ>height-2.1)result.warnings.push('The pergola has less than 2.1 m headroom at its highest ground corner. Adjust its position or height.');
  }
  if(s.spaScreensEnabled===true&&context.jacuzzi){
    const tub=context.jacuzzi,height=limit(s.spaScreenHeight,PRIVACY_DEFAULTS.spaScreenHeight,1,3),width=limit(s.spaScreenWidth,PRIVACY_DEFAULTS.spaScreenWidth,1,5);
    const gap=limit(s.spaScreenGap,PRIVACY_DEFAULTS.spaScreenGap,.1,2),returnLength=limit(s.spaScreenReturn,PRIVACY_DEFAULTS.spaScreenReturn,0,3);
    const centre=(tub.x0+tub.x1)/2,x0=centre-width/2,x1=centre+width/2,y=tub.y1+gap;
    const baseZ=context.floorZ,topZ=baseZ+height,thickness=.07,group='spa-screen';
    add('privacy-spa-rear-screen',group,'screen','Spa rear screen',x0,y-thickness/2,x1,y+thickness/2,baseZ,topZ);
    result.footprints.push({id:'privacy-spa-rear-screen',group,label:'Spa rear screen',x:x0,y:y-thickness/2,width,length:thickness,baseZ,topZ});
    if(returnLength>EPS){
      add('privacy-spa-east-screen',group,'screen','Spa east return screen',x1-thickness/2,y-returnLength,x1+thickness/2,y,baseZ,topZ);
      result.footprints.push({id:'privacy-spa-east-screen',group,label:'Spa east return',x:x1-thickness/2,y:y-returnLength,width:thickness,length:returnLength,baseZ,topZ});
      if(x1-thickness/2<tub.x1&&x1+thickness/2>tub.x0&&y-returnLength<tub.y1)result.warnings.push('The spa return screen overlaps the jacuzzi. Increase screen width or reduce its return.');
    }
    const ends=[[x0,y],[x1,y],...(returnLength>EPS?[[x1,y-returnLength]]:[])];
    ends.forEach(([a,b],i)=>add(`privacy-spa-post-${i}`,group,'post','Spa screen support',
      a-.045,b-.045,a+.045,b+.045,Math.min(baseZ,ground(a,b)),topZ));
    // Keep the clear service width to the nearest physical support face, not
    // merely to the panel centreline used by the placement control.
    if(gap-.045<.6-EPS||returnLength>EPS&&x1-.045-tub.x1<.6-EPS)result.warnings.push('Spa screens enter the 0.6 m service zone. Use removable panels and retain maintenance access.');
  }
  result.enabled=result.boxes.length>0;
  return result;
}

/** Finite slab intersection; only the open observer-to-target segment counts. */
export function privacyBoxIntersection(observer,target,box){
  const a=point(observer),b=point(target),bounds=[[box.x0,box.x1],[box.y0,box.y1],[box.z0,box.z1]];
  let enter=-Infinity,exit=Infinity;
  for(let axis=0;axis<3;axis++){
    const delta=b[axis]-a[axis],[low,high]=bounds[axis];
    if(Math.abs(delta)<EPS){if(a[axis]<low-EPS||a[axis]>high+EPS)return null;continue;}
    const first=(low-a[axis])/delta,last=(high-a[axis])/delta;
    enter=Math.max(enter,Math.min(first,last));exit=Math.min(exit,Math.max(first,last));
    if(enter>exit+EPS)return null;
  }
  // An eye touching a support does not self-block on that surface. An eye
  // genuinely inside solid material is blocked at the exit, not at t=0.
  const t=enter>1e-5?enter:exit;
  if(!Number.isFinite(t)||t<=1e-5||t>=1-1e-5)return null;
  return {t,x:a[0]+(b[0]-a[0])*t,y:a[1]+(b[1]-a[1])*t,z:a[2]+(b[2]-a[2])*t,
    id:box.id,group:box.group,part:box.part,label:box.label};
}

export function firstPrivacyIntersection(observer,target,boxes=[]){
  let nearest=null;
  for(const box of boxes){
    if(box.opaque===false)continue;
    const hit=privacyBoxIntersection(observer,target,box);
    if(hit&&(!nearest||hit.t<nearest.t))nearest=hit;
  }
  return nearest;
}
