import {ringBounds,wallPanels} from './interior-geometry.js?v=1.41.0';

export const LANDING_GUARD_HEIGHT=1.10;
const EPS=1e-7;

// Interval of an edge inside a wall-aligned rectangle. This keeps an existing
// solid wall or timber guard from acquiring a second, overlapping balustrade.
function coveredInterval(a,b,origin,axis,lo,hi,halfDepth){
  const normal=[-axis[1],axis[0]],project=(p,u)=>(p[0]-origin[0])*u[0]+(p[1]-origin[1])*u[1];
  let start=0,end=1;
  for(const [u,min,max] of [[axis,lo,hi],[normal,-halfDepth,halfDepth]]){
    const from=project(a,u),delta=project(b,u)-from;
    if(Math.abs(delta)<EPS){if(from<min-EPS||from>max+EPS)return null;continue;}
    const t0=(min-from)/delta,t1=(max-from)/delta;
    start=Math.max(start,Math.min(t0,t1));end=Math.min(end,Math.max(t0,t1));
    if(end-start<EPS)return null;
  }
  return [start,end];
}
function subtract(spans,cut){
  if(!cut)return spans;
  return spans.flatMap(([lo,hi])=>cut[1]<=lo+EPS||cut[0]>=hi-EPS?[[lo,hi]]:
    [[lo,Math.min(hi,cut[0])],[Math.max(lo,cut[1]),hi]].filter(([a,b])=>b-a>EPS));
}
function stairFrame(stair){
  const b=ringBounds(stair.polygon),direction=stair.direction||[0,-1],alongX=Math.abs(direction[0])>.5;
  return {b,direction,across:[-direction[1],direction[0]],length:alongX?b.width:b.depth,width:alongX?b.depth:b.width};
}

/** Guard every exposed slab-void edge, except the real entry/arrival end of a
 * connecting flight. The historical drawing remains an unaltered comparison. */
export function stairLandingGuards(plan){
  if(plan.layout!=='renovation')return [];
  const result=[];
  for(const [holeIndex,hole] of (plan.voids||[]).entries())for(let edgeIndex=0;edgeIndex<hole.length;edgeIndex++){
    const a=hole[edgeIndex],b=hole[(edgeIndex+1)%hole.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(length<.04)continue;
    let spans=[[0,1]];
    for(const wall of plan.walls||[]){
      const dx=wall.b[0]-wall.a[0],dz=wall.b[1]-wall.a[1],wallLength=Math.hypot(dx,dz);if(wallLength<EPS)continue;
      const axis=[dx/wallLength,dz/wallLength];
      for(const panel of wallPanels(wall,Math.min(wall.height??plan.clearHeight,LANDING_GUARD_HEIGHT))){
        if(panel.bottom>.08||panel.top<LANDING_GUARD_HEIGHT-.04)continue;
        spans=subtract(spans,coveredInterval(a,b,wall.a,axis,panel.left,panel.right,wall.thickness/2+.004));
      }
    }
    for(const stair of plan.stairs||[]){
      if(stair.kind==='exterior'||stair.kind==='hatch'||![stair.from,stair.to].includes(plan.floor))continue;
      const {b:bounds,direction,across,length:run,width}=stairFrame(stair),arrival=stair.to===plan.floor;
      const end=[bounds.x+direction[0]*run/2*(arrival?1:-1),bounds.z+direction[1]*run/2*(arrival?1:-1)];
      spans=subtract(spans,coveredInterval(a,b,end,across,-width/2,width/2,.028));
    }
    const point=t=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
    for(const [index,[lo,hi]] of spans.entries())if((hi-lo)*length>.045)result.push({
      id:`landing-guard-${plan.floor}-${holeIndex}-${edgeIndex}-${index}`,a:point(lo),b:point(hi),height:LANDING_GUARD_HEIGHT,
    });
  }
  return result;
}

/** A rising flight can cross an edge of the shared stairwell. Close the space
 * below its soffit without running a level handrail through the tread surface;
 * the flight's own two-sided balustrade protects the space above those treads. */
export function landingGuardTop(plan,x,z,height=LANDING_GUARD_HEIGHT){
  let top=height;
  for(const stair of plan.stairs||[]){
    if(stair.from!==plan.floor||stair.kind!=='flight')continue;
    const {b,direction,across,length,width}=stairFrame(stair),dx=x-b.x,dz=z-b.z;
    const side=dx*across[0]+dz*across[1],along=dx*direction[0]+dz*direction[1]+length/2;
    if(Math.abs(side)>width/2+.025||along<-.025||along>length+.025)continue;
    top=Math.min(top,Math.max(0,along/length*stair.rise-.065));
  }
  return top;
}
