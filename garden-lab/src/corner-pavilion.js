/**
 * A finite garden-building study, shared by drawing, privacy and sunlight.
 * Height is measured above the lowest ORIGINAL terrain corner. Raising garden
 * fill changes the pad and headroom, never the top of the proposed building.
 * These dimensions are design comparisons, not approved planning parameters.
 */
const EPS=1e-8;
const numeric=(value,fallback)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const limit=(value,field)=>Math.max(field.min,Math.min(field.max,numeric(value,field.value)));

export const PAVILION_FIELDS=Object.freeze({
  pavilionHeight:Object.freeze({label:'Pavilion roof above original ground · study',min:3,max:14,step:.1,value:6.5,group:'corner-pavilion',unit:'m',help:'Height above the lowest original terrain corner. This is an exploratory dimension, not a permitted height.'}),
  pavilionWidth:Object.freeze({label:'Pavilion width',min:3,max:8,step:.1,value:5,group:'corner-pavilion',unit:'m'}),
  pavilionDepth:Object.freeze({label:'Pavilion depth',min:3,max:8,step:.1,value:5.8,group:'corner-pavilion',unit:'m'}),
  pavilionX:Object.freeze({label:'Pavilion across plot · x',min:.5,max:19.8,step:.1,value:12.2,group:'corner-pavilion',unit:'m'}),
  pavilionY:Object.freeze({label:'Pavilion from street · y',min:18.5,max:37,step:.1,value:29,group:'corner-pavilion',unit:'m'}),
});
export const PAVILION_DEFAULTS=Object.freeze({pavilionEnabled:false,
  ...Object.fromEntries(Object.entries(PAVILION_FIELDS).map(([key,field])=>[key,field.value]))});
export const PAVILION_PLACEMENTS=Object.freeze([
  Object.freeze({id:'rear-east',label:'Rear/east corner · nearer PCK3',
    description:'A 5 × 5.8 m building beside the rear garden. Screens nearby resting places more effectively than the distant living-room view.',
    settings:Object.freeze({pavilionX:12.2,pavilionY:29,pavilionWidth:5,pavilionDepth:5.8})}),
  Object.freeze({id:'near-garage',label:'Near the former outdoor garage',
    description:'A 5.8 × 5.2 m building closer to the house. Covers more of PCK3 from the living room; does not screen a viewpoint behind it.',
    settings:Object.freeze({pavilionX:11.4,pavilionY:24.7,pavilionWidth:5.8,pavilionDepth:5.2})}),
]);

const rectangle=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]];
const inactive=()=>({enabled:false,boxes:[],glazing:[],storeys:[],footprints:[],warnings:[]});
export const pavilionAlternativeEnabled=(settings={},data)=>settings.pavilionEnabled===true
  &&(data?.site?.id||settings.siteId||'sternicza-11')==='sternicza-11';

/**
 * context.terrainAt(x,y) returns original mapped terrain; groundAt(x,y) returns
 * proposed grade. The caller supplies both to avoid a geometry import cycle.
 * Glazing is returned for drawing only and is never added to opaque boxes.
 */
export function cornerPavilionLayout(settings={},data,context={}){
  const result=inactive();
  if(!pavilionAlternativeEnabled(settings,data))return result;
  if(typeof context.terrainAt!=='function'||typeof context.groundAt!=='function'){
    result.warnings.push('Original and proposed terrain are required to place the pavilion.');return result;
  }
  const values=Object.fromEntries(Object.entries(PAVILION_FIELDS).map(([key,field])=>[key,limit(settings[key],field)]));
  const x=values.pavilionX,y=values.pavilionY,width=values.pavilionWidth,length=values.pavilionDepth,height=values.pavilionHeight;
  const x1=x+width,y1=y+length,footprint=rectangle(x,y,x1,y1),corners=footprint.slice(0,-1);
  const original=corners.map(p=>context.terrainAt(...p)),grade=[];
  const nx=Math.max(1,Math.ceil(width/.5)),ny=Math.max(1,Math.ceil(length/.5));
  for(let ix=0;ix<=nx;ix++)for(let iy=0;iy<=ny;iy++)grade.push(context.groundAt(x+width*ix/nx,y+length*iy/ny));
  if(![...original,...grade].every(Number.isFinite)){
    result.warnings.push('Pavilion terrain elevations are unavailable.');return result;
  }
  const baseZ=Math.min(...original),topZ=baseZ+height,groundLowZ=Math.min(...grade),groundHighZ=Math.max(...grade);
  const floorZ=groundHighZ+.12,foundationBaseZ=Math.min(baseZ,groundLowZ)-.12,roofThickness=.18,slabThickness=.16;
  const ceilingZ=topZ-roofThickness,clearSpan=ceilingZ-floorZ;
  Object.assign(result,{x,y,width,length,height,baseZ,floorZ,topZ,foundationBaseZ,
    bounds:{x0:x,y0:y,x1,y1,z0:foundationBaseZ,z1:topZ},footprint,
    originalGroundLowZ:baseZ,originalGroundHighZ:Math.max(...original),groundLowZ,groundHighZ,
    heightDatum:'Lowest original terrain corner; proposed fill does not raise the roof',
    originalGroundCorners:corners.map((p,i)=>({x:p[0],y:p[1],z:original[i]})),
  });
  if(clearSpan<.5){result.warnings.push('The proposed pad reaches the pavilion roof. Reduce garden fill or change the study dimensions.');return result;}
  const floorCount=Math.max(1,Math.min(4,Math.floor((clearSpan+slabThickness)/2.6))),storeyRise=clearSpan/floorCount;
  for(let i=0;i<floorCount;i++)result.storeys.push({index:i,floorZ:floorZ+i*storeyRise,
    ceilingZ:i===floorCount-1?ceilingZ:floorZ+(i+1)*storeyRise-slabThickness});
  const minimumHeadroom=Math.min(...result.storeys.map(f=>f.ceilingZ-f.floorZ));
  result.minimumHeadroom=minimumHeadroom;
  if(minimumHeadroom<2.4)result.warnings.push('The pavilion has less than 2.4 m clear internal height in this terrain/height study.');
  const add=(id,part,label,x0,y0,xx1,yy1,z0,z1,side)=>{
    if(xx1-x0<=EPS||yy1-y0<=EPS||z1-z0<=EPS)return;
    result.boxes.push({id:'pavilion-'+id,group:'pavilion',part,label,x0,y0,x1:xx1,y1:yy1,z0,z1,side,opaque:true});
  };
  const t=.22,pier=.42;
  add('foundation','foundation','Pavilion foundation',x,y,x1,y1,foundationBaseZ,floorZ);
  add('roof','roof','Pavilion roof',x,y,x1,y1,ceilingZ,topZ);
  add('rear-wall','wall','Pavilion rear opaque wall',x,y1-t,x1,y1,floorZ,ceilingZ,'rear');
  add('east-wall','wall','Pavilion outer opaque wall',x1-t,y,x1,y1-t,floorZ,ceilingZ,'east');
  for(const floor of result.storeys){
    const index=floor.index;
    if(index)add('floor-'+index+'-slab','slab','Pavilion upper-floor slab',x+t,y+t,x1-t,y1-t,floor.floorZ-slabThickness,floor.floorZ);
    const sill=floor.floorZ+.30,head=Math.max(sill+.2,floor.ceilingZ-.28);
    // The front faces the house, and the west face opens to the alternative
    // garden. End piers and sill/head bands leave genuine transparent openings.
    for(const side of ['front','west']){
      const start=side==='front'?x:y+t,end=side==='front'?x1-t:y1-t;
      const a=start+pier,b=end-pier,id=side+'-floor-'+index;
      const wall=(suffix,part,aa,bb,z0,z1)=>side==='front'
        ?add(id+'-'+suffix,part,'Pavilion '+side+' '+suffix,aa,y,bb,y+t,z0,z1,side)
        :add(id+'-'+suffix,part,'Pavilion '+side+' '+suffix,x,aa,x+t,bb,z0,z1,side);
      wall('near-pier','column',start,a,floor.floorZ,floor.ceilingZ);
      wall('far-pier','column',b,end,floor.floorZ,floor.ceilingZ);
      wall('head','wall',a,b,head,floor.ceilingZ);
      // The inter-storey rim is part of the facade, not an invisible full wall.
      if(index)wall('slab-edge','slab',start,end,floor.floorZ-slabThickness,floor.floorZ);
      const pane=(suffix,aa,bb,bottom,kind='window')=>{
        if(bb-aa<=EPS)return;
        const vertices=side==='front'?[[aa,y+t/2,bottom],[bb,y+t/2,bottom],[bb,y+t/2,head],[aa,y+t/2,head]]:
          [[x+t/2,bb,bottom],[x+t/2,aa,bottom],[x+t/2,aa,head],[x+t/2,bb,head]];
        result.glazing.push({id:'pavilion-'+id+'-'+suffix,side,storey:index,kind,vertices,bottomZ:bottom,topZ:head,opaque:false});
      };
      let windowStart=a;
      if(side==='front'&&index===0){
        // Keep the same entrance arrangement in both placements. The 0.5 m
        // glazed sidelight moves its landing beyond the Current terrace stair
        // while preserving a full 1 m approach below the lowest entry tread.
        const doorWidth=1.05,mullion=.06,doorStart=a+.5,doorEnd=doorStart+doorWidth;
        wall('door-sidelight-sill','wall',a,doorStart-mullion,floor.floorZ,sill);
        pane('door-sidelight',a,doorStart-mullion,sill);
        wall('door-left-mullion','column',doorStart-mullion,doorStart,floor.floorZ,head);
        pane('door',doorStart,doorEnd,floor.floorZ,'door');
        wall('door-mullion','column',doorEnd,doorEnd+mullion,floor.floorZ,head);
        windowStart=doorEnd+mullion;
        result.entry={side:'front',doorX0:doorStart,doorX1:doorEnd,doorY:y,doorWidth,thresholdZ:floor.floorZ};
      }
      wall('sill','wall',windowStart,b,floor.floorZ,sill);
      if(b-windowStart>2.4){
        const centre=(windowStart+b)/2;
        wall('window-mullion','column',centre-.03,centre+.03,sill,head);
        pane('window-0',windowStart,centre-.03,sill);pane('window-1',centre+.03,b,sill);
      }else pane('window',windowStart,b,sill);
    }
  }
  result.enabled=true;
  result.footprints.push({id:'corner-pavilion',group:'pavilion',label:'Corner pavilion · height study',x,y,width,length,baseZ,topZ});
  if(result.entry){
    const landingWidth=1.4,landingDepth=1.2,tread=.32;
    const centre=(result.entry.doorX0+result.entry.doorX1)/2,ax=centre-landingWidth/2,bx=centre+landingWidth/2,landingFront=y-landingDepth;
    let risers=1,approachZ=0;
    const approachAt=yy=>Math.max(...[ax,centre,bx].map(xx=>context.groundAt(xx,yy)));
    for(let i=0;i<4;i++){
      approachZ=approachAt(landingFront-(risers-1)*tread);
      risers=Math.max(1,Math.ceil((floorZ-approachZ)/.18));
    }
    const outerY=landingFront-(risers-1)*tread;
    approachZ=approachAt(outerY);
    const rise=(floorZ-approachZ)/risers;
    Object.assign(result.entry,{landingWidth,landingDepth,risers,riserHeight:rise,approachZ,outerY,
      footprint:rectangle(ax,outerY,bx,y)});
    if(!Number.isFinite(rise)||rise<-.02||rise>.181||risers>12){
      result.warnings.push('The pavilion entry needs a site-specific stair or ramp design for this terrain.');
    }else{
      const pad=(id,ya,yb,top,label)=>{
        const groundLow=Math.min(...[[ax,ya],[bx,ya],[ax,yb],[bx,yb]].map(p=>context.groundAt(...p)));
        add(id,'entry',label,ax,ya,bx,yb,Math.min(groundLow-.08,top-.12),top,'front');
        result.footprints.push({id:'pavilion-'+id,group:'pavilion',label,x:ax,y:ya,width:landingWidth,length:yb-ya,baseZ:groundLow-.08,topZ:top});
      };
      pad('entry-landing',landingFront,y,floorZ,'Pavilion entry landing');
      for(let i=1;i<risers;i++)pad('entry-step-'+i,outerY+(i-1)*tread,outerY+i*tread,approachZ+rise*i,'Pavilion entry step');
    }
  }
  return result;
}

/**
 * A separate plan-envelope diagnostic. It asks whether each target ray even
 * passes through the building footprint, and what an ideal solid flat-topped
 * volume would need. It does not replace the actual wall/glazing intersections.
 */
export function pavilionRoofEnvelopeStudy(observer,targets=[],layout){
  const eye=Array.isArray(observer)?observer:[observer.x,observer.y,observer.z];
  const result={status:'unavailable',total:0,intercepted:0,missed:0,planCoveragePercent:null,
    requiredHeightForIntercepted:null,requiredHeightForAll:null,
    method:'Plan interception of measured roof-point rays; ideal opaque envelope only. Actual glazing, roof and wall screening is reported separately.'};
  if(!layout?.enabled||!eye.every(Number.isFinite))return result;
  const {x,y,width,length,baseZ}=layout;
  if(eye[0]>=x-EPS&&eye[0]<=x+width+EPS&&eye[1]>=y-EPS&&eye[1]<=y+length+EPS){
    return {...result,status:'inside-footprint'};
  }
  const heights=[];
  for(const target of targets){
    if(!Array.isArray(target)||target.length<3||!target.slice(0,3).every(Number.isFinite))continue;
    result.total++;
    let enter=0,exit=1,hit=true;
    for(const [axis,low,high] of [[0,x,x+width],[1,y,y+length]]){
      const delta=target[axis]-eye[axis];
      if(Math.abs(delta)<EPS){if(eye[axis]<low-EPS||eye[axis]>high+EPS){hit=false;break;}continue;}
      const a=(low-eye[axis])/delta,b=(high-eye[axis])/delta;
      enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));
      if(enter>exit+EPS){hit=false;break;}
    }
    if(!hit||exit<=1e-5||enter>=1-1e-5){result.missed++;continue;}
    result.intercepted++;
    const t=target[2]>=eye[2]?Math.max(enter,0):Math.min(exit,1);
    heights.push(Math.max(0,eye[2]+t*(target[2]-eye[2])-baseZ));
  }
  if(!result.total)return result;
  result.status='ok';result.planCoveragePercent=100*result.intercepted/result.total;
  result.requiredHeightForIntercepted=heights.length?Math.max(...heights):null;
  result.requiredHeightForAll=result.missed?null:result.requiredHeightForIntercepted;
  return result;
}
