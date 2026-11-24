import {containsPoint,ringBounds,wallPanels} from './interior-geometry.js?v=1.31.1';
import {atticHeadroomAt} from './interior-plan.js?v=1.31.1';

const RADIUS=.16;
function distanceToSegment(x,z,a,b) {
  const dx=b[0]-a[0],dz=b[1]-a[1],len=dx*dx+dz*dz;
  const t=len?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/len)):0;
  return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);
}
export function walkGeometry(plan) {
  const solids=[];
  for(const w of plan.walls){const dx=w.b[0]-w.a[0],dz=w.b[1]-w.a[1],l=Math.hypot(dx,dz);if(!l)continue;
    // Windows have a solid sill. Doorways are open across their clear span.
    for(const p of wallPanels(w,Math.min(w.height??plan.clearHeight,1.5)).filter(p=>p.bottom<.2)){
      const at=t=>[w.a[0]+dx*t/l,w.a[1]+dz*t/l];solids.push({a:at(p.left),b:at(p.right),r:w.thickness/2});}
    // Actual hinge and swing of the leaf rendered in the 3D room.
    for(const o of w.openings||[]){if(o.type!=='door'||o.width<=.12)continue;
      const end=o.hinge==='end',sign=end?-1:1,hinge=o.offset+(end?o.width-.047:.047),t=-sign*(o.swing||1)*Math.PI/2;
      const a=[w.a[0]+dx*hinge/l,w.a[1]+dz*hinge/l],along=sign*(o.width-.10)*Math.cos(t),across=-sign*(o.width-.10)*Math.sin(t);
      solids.push({a,b:[a[0]+along*dx/l-across*dz/l,a[1]+along*dz/l+across*dx/l],r:.018,leaf:true});
    }
  }
  const obstructions=[...(plan.voids||[]),...(plan.cores||[]).map(c=>c.polygon),...(plan.stairs||[]).filter(s=>s.from===plan.floor&&s.kind!=='hatch').map(s=>s.polygon)];
  const outers=[plan.envelope.outline,...(plan.outdoor||[]).map(s=>s.polygon)];
  function clear(x,z,withFurniture=true,r=RADIUS){
    if(!outers.some(ring=>containsPoint(ring,x,z))||obstructions.some(ring=>containsPoint(ring,x,z)))return false;
    if(plan.floor==='attic'&&atticHeadroomAt(z)<1.69)return false;
    if(solids.some(s=>distanceToSegment(x,z,s.a,s.b)<r+s.r))return false;
    for(const polygon of obstructions)for(let i=0;i<polygon.length;i++)if(distanceToSegment(x,z,polygon[i],polygon[(i+1)%polygon.length])<r)return false;
    if(withFurniture)for(const f of plan.fixtures||[]){if(f.hostId||f.nonBlocking||f.wallMounted)continue;
      const dx=x-f.x,dz=z-f.z,a=f.rotation||0,c=Math.cos(a),s=Math.sin(a),lx=dx*c-dz*s,lz=dx*s+dz*c;
      if(Math.abs(lx)<f.width/2+r&&Math.abs(lz)<f.depth/2+r)return false;
      if(f.kind==='diningTable'&&Math.abs(lx)<f.width/2+.08&&Math.abs(lz)<f.depth/2+.49+r)return false;
    }
    return true;
  }
  clear.sight=(x,z)=>!solids.some(s=>distanceToSegment(x,z,s.a,s.b)<s.r+.075);
  clear.doorDistance=(x,z)=>Math.min(3,...solids.filter(s=>s.leaf).map(s=>distanceToSegment(x,z,s.a,s.b)));
  return clear;
}
/** Choose an eye point inside the chosen (possibly concave) room, outside
 * fixtures and stair wells. Aim across its furniture rather than into a wall. */
export function roomPose(plan,room,clear,showFurniture=true) {
  const b=ringBounds(room.polygon),fixture=(plan.fixtures||[]).filter(f=>f.roomId===room.id&&!f.nonBlocking&&!f.hostId&&!f.wallMounted).sort((a,b)=>b.width*b.depth-a.width*a.depth)[0];
  const focus=fixture&&showFurniture?[fixture.x*.58+b.x*.42,fixture.z*.58+b.z*.42]:[b.x,b.z];
  let best=null,score=-Infinity;const samples=20;
  for(let i=0;i<samples;i++)for(let j=0;j<samples;j++){
    const x=b.x0+(i+.5)*b.width/samples,z=b.z0+(j+.5)*b.depth/samples;
    if(!containsPoint(room.polygon,x,z)||!clear(x,z,showFurniture))continue;
    const wallSpace=Math.min(x-b.x0,b.x1-x,z-b.z0,b.z1-z);if(wallSpace<.14)continue;
    const distance=Math.hypot(x-focus[0],z-focus[1]);
    const aimX=(focus[0]-x)/Math.max(distance,.01),aimZ=(focus[1]-z)/Math.max(distance,.01);
    let blocked=0;for(const t of [.2,.48,.78])for(const offset of [-.24,0,.24]){if(clear.sight&&!clear.sight(x+t*aimX-offset*aimZ,z+t*aimZ+offset*aimX))blocked++;}
    const leafClearance=Math.min(.92,clear.doorDistance?.(x,z)??.92);
    const value=distance+.12*(z-b.z0)+Math.min(.45,wallSpace)*.45-blocked*.9+leafClearance*2.3;
    if(value>score){score=value;best=[x,z];}
  }
  if(!best){for(let x=b.x0+.02;x<b.x1&&!best;x+=.025)for(let z=b.z0+.02;z<b.z1;z+=.025){
    if(containsPoint(room.polygon,x,z)&&clear(x,z,showFurniture)){best=[x,z];break;}
  }}
  if(!best)throw new RangeError(`There is no clear eye-level position in ${room.label}.`);
  const eye=Math.min(1.57,plan.clearHeight-.22),distance=Math.hypot(focus[0]-best[0],focus[1]-best[1]);
  return {x:best[0],z:best[1],eye,yaw:Math.atan2(focus[0]-best[0],best[1]-focus[1]),pitch:-Math.atan2(eye-(fixture?.kind==='car'?.75:1.01),Math.max(distance,.9))};
}
