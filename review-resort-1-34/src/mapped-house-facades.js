// Inferred facade openings used by both the mapped-house renderer and style treatments.
import {localRoofEnvelope, roofEdgeHeight} from './roof-envelope.js?v=1.34.0';
import {renovateFacadeOpenings,getRenovationArchitecture,minimumFacadeRoof} from './renovation-architecture.js?v=1.34.0';

// A survey may subdivide one straight wall into several cadastral edges. The
// architectural rhythm belongs to the full elevation; tiny segments must not
// repeat the whole window pattern. Keep every original roof knot when merging.
function wholeFacadeEdges(source){
  const aligned=(a,b)=>Math.abs(a.direction[0]*b.direction[1]-a.direction[1]*b.direction[0])<1e-7&&a.direction[0]*b.direction[0]+a.direction[1]*b.direction[1]>1-1e-7;
  const start=source.findIndex((e,i)=>!aligned(source[(i+source.length-1)%source.length],e));
  if(start<0)return source;
  const groups=[];
  for(let i=0;i<source.length;i++){
    const edge=source[(start+i)%source.length],last=groups.at(-1);
    if(last&&aligned(last.at(-1),edge))last.push(edge);else groups.push([edge]);
  }
  return groups.map((group,index)=>{
    const first=group[0],last=group.at(-1),length=group.reduce((n,e)=>n+e.length,0),points=[],fractions=[];let distance=0;
    for(const edge of group){
      for(const [i,p]of edge.roofEdge.points.entries()){
        if(points.length&&i===0)continue;
        points.push(p);fractions.push((distance+edge.length*(edge.roofEdge.fractions?.[i]??i/(edge.roofEdge.points.length-1)))/length);
      }
      distance+=edge.length;
    }
    return {...first,index,b:last.b,length,sourceEdgeIndices:group.map(e=>e.index),roofEdge:{index,length,points,fractions}};
  });
}

export function mappedHouseFacadeLayout(data, settings, envelope=localRoofEnvelope(data.site.house)) {
  const {ring,base}=envelope;
  const floorZ=data.site.floorReference.z+(Number.isFinite(Number(settings.floorHeight))?Number(settings.floorHeight):1.7);
  const winding=Math.sign(ring.reduce((sum,a,i)=>{
    const b=ring[(i+1)%ring.length];
    return sum+a[0]*b[1]-b[0]*a[1];
  },0))||1;
  const sourceEdges=ring.map((a,index)=>{
    const b=ring[(index+1)%ring.length],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
    const direction=length?[dx/length,dy/length]:[0,0];
    return {index,a,b,length,direction,outward:[winding*direction[1],-winding*direction[0]],roofEdge:envelope.edges[index]};
  });
  const proposed=Boolean(getRenovationArchitecture(settings.designStyle));
  const edges=proposed?wholeFacadeEdges(sourceEdges):sourceEdges;
  const rearEdge=data.site.house.rearEdge||data.site.rearEdge;
  const distance=({a,b})=>rearEdge?Math.hypot(a[0]+b[0]-rearEdge[0][0]-rearEdge[1][0],a[1]+b[1]-rearEdge[0][1]-rearEdge[1][1]):-(a[1]+b[1]);
  const rear=edges.reduce((best,edge)=>distance(edge)<distance(best)?edge:best);
  const windows=[];
  for(const edge of edges){
    const {length,roofEdge,index}=edge;
    if(length<.0001) continue;
    const heights=roofEdge.points.map(p=>p[2]),maxEaves=Math.max(...heights);
    if(edge===rear){
      const dx=edge.b[0]-edge.a[0],t=data.site.terrace;
      const project=x=>Math.abs(dx)>.01?(x-edge.a[0])/dx:.5;
      const u=project(t.x+.08),v=project(t.x+t.width-.08);
      windows.push({id:'mapped-rear-hst',kind:'hst',edgeIndex:index,lo:length*Math.max(.05,Math.min(u,v)),hi:length*Math.min(.95,Math.max(u,v)),
        z:floorZ,height:Math.min(floorZ+2.65,Math.min(...heights)-.25)-floorZ});
    }
    const count=Math.max(1,Math.floor(length/3.1));
    for(let z=floorZ+(edge===rear?3.35:.5);length>=1.5&&z+1.5<maxEaves-.25;z+=3){
      for(let j=0;j<count;j++){
        const u=(j+.5)/count,half=Math.min(.72/length,.35/count);
        const lo=u-half-.06/length,hi=u+half+.06/length;
        const roofMin=proposed?minimumFacadeRoof(edge,lo*length,hi*length):Math.min(roofEdgeHeight(roofEdge,lo),roofEdgeHeight(roofEdge,hi),
          ...heights.filter((_,k)=>k/(heights.length-1)>lo&&k/(heights.length-1)<hi));
        if(z+1.56>=roofMin-.1) continue;
        // Store the outer frame edges. The existing glass is inset by 60 mm.
        windows.push({id:`mapped-window-${index}-${windows.length}`,kind:'window',edgeIndex:index,lo:lo*length,hi:hi*length,z:z-.06,height:1.62});
      }
    }
  }
  return renovateFacadeOpenings({edges,rear,windows,baseZ:base,floorZ},{styleId:settings.designStyle||'current'});
}
