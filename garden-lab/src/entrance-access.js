/** Shared front-entry stairs and their gate-to-bottom approach, in site metres.
 * Feed the filtered house appearance layout: inactive garage frame proposals
 * must never select the side-return stair. All dimensions remain proposals. */
import {facadePoint} from './house-appearance.js?v=1.23.0';

const EPS=1e-7;
const num=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
const rectangle=(x,y,width,length)=>[[x,y],[x+width,y],[x+width,y+length],[x,y+length]];
const same=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<EPS;

export function entranceAccessLayout(house,{groundAt=()=>house?.baseZ||0,gate}={}){
  if(!house?.supported)return {enabled:false,stairs:null,route:[],paving:[]};
  const {door,front,floorZ}=house,access=house.entryAccess;
  const returning=Boolean(access?.proposed&&access.landing),type=returning?'return':'front';
  const width=returning?num(access.stairs?.width,1):1.7,tread=returning?num(access.stairs?.tread,.32):.31;
  const maxRiser=returning?num(access.stairs?.maxRiser,.18):.18;
  const topZ=returning?num(access.landing.topZ,floorZ):floorZ;
  const y0=returning?Math.min(...access.landing.footprint.map(p=>p[1])):0;
  const xEnd=returning?num(access.stairs?.landingX,7.4):0;
  const bottomFor=count=>returning?[xEnd-count*tread,y0+width/2]:facadePoint(front,door.centre,0,count*tread).slice(0,2);
  const outward=returning?[-1,0]:front.outward;
  let count=1,groundZ=groundAt(...bottomFor(1));
  // The foot moves with the riser count; resolve it against its actual grade.
  for(let i=0;i<8;i++){
    const next=Math.max(count,Math.max(1,Math.ceil(Math.max(.025,topZ-groundZ)/maxRiser)));
    const bottom=bottomFor(next);groundZ=groundAt(bottom[0]+outward[0]*.06,bottom[1]+outward[1]*.06);
    if(next===count&&topZ-groundZ<=count*maxRiser+EPS)break;
    count=next;
  }
  const bottom=bottomFor(count),rise=Math.max(.025,topZ-groundZ),steps=[];
  for(let i=0;i<count;i++){
    const far=(count-i)*tread,near=far-tread;
    const footprint=returning?rectangle(bottom[0]+i*tread,y0,tread,width):[
      facadePoint(front,door.centre-width/2,0,far).slice(0,2),facadePoint(front,door.centre+width/2,0,far).slice(0,2),
      facadePoint(front,door.centre+width/2,0,near).slice(0,2),facadePoint(front,door.centre-width/2,0,near).slice(0,2),
    ];
    steps.push({id:`house-${type}-step-${i}`,footprint,baseZ:groundZ,topZ:groundZ+rise*(i+1)/count});
  }
  const railEdges=returning?[
    {a:[bottom[0],y0-.025],b:[xEnd,y0-.025]},
    {a:[bottom[0],y0+width+.025],b:[xEnd,y0+width+.025]},
  ]:[-1,1].map(side=>({
    a:facadePoint(front,door.centre+side*width/2,0,count*tread).slice(0,2),
    b:facadePoint(front,door.centre+side*width/2,0,0).slice(0,2),
  }));
  const stairs={type,width,tread,count,maxRiser,riser:rise/count,groundZ,topZ:groundZ+rise,bottom,outward,
    steps,railEdges,footprint:returning?rectangle(bottom[0],y0,count*tread,width):[steps[0].footprint[0],steps[0].footprint[1],steps.at(-1).footprint[2],steps.at(-1).footprint[3]]};
  if(!gate)return {enabled:true,stairs,route:[],paving:[]};
  const pathWidth=Math.min(1.2,num(gate.width,1.2)),half=pathWidth/2;
  const gateCentre=[(gate.a[0]+gate.b[0])/2,(gate.a[1]+gate.b[1])/2];
  const start=[gateCentre[0],Math.max(.04,gateCentre[1]-.35)];
  let route;
  if(returning){
    // Move sideways before reaching the stair, then approach its west foot.
    // The vertical leg's east edge ends exactly at the first riser, avoiding
    // both handrails and a mid-flight approach as the living floor changes.
    const approachX=bottom[0]-half,turnY=Math.max(start[1],y0-half-.35);
    route=[start,[start[0],turnY],[approachX,turnY],[approachX,bottom[1]],bottom];
  }else{
    const approachY=bottom[1]-half;
    route=[start,[start[0],approachY],[bottom[0],approachY],bottom];
  }
  route=route.filter((p,i)=>i===0||!same(p,route[i-1]));
  const paving=[],addPad=(x,y,width,length,kind='run')=>{
    if(width<EPS||length<EPS)return;
    paving.push({x,y,width,length,z:groundAt(x+width/2,y+length/2)+.015,thickness:.035,kind});
  };
  for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],horizontal=Math.abs(b[0]-a[0])>EPS;
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]),count=Math.max(1,Math.ceil(length/.5));
    for(let j=0;j<count;j++){
      const p=[a[0]+(b[0]-a[0])*j/count,a[1]+(b[1]-a[1])*j/count],q=[a[0]+(b[0]-a[0])*(j+1)/count,a[1]+(b[1]-a[1])*(j+1)/count];
      if(horizontal)addPad(Math.min(p[0],q[0]),p[1]-half,Math.abs(q[0]-p[0]),pathWidth);
      else addPad(p[0]-half,Math.min(p[1],q[1]),pathWidth,Math.abs(q[1]-p[1]));
    }
    if(i<route.length-1)addPad(b[0]-half,b[1]-half,pathWidth,pathWidth,'turn');
  }
  return {enabled:true,stairs,route,paving,pathWidth,gateCentre};
}
