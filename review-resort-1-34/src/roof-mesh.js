/** Pure sampled roof triangulation shared by rendering and local ray geometry. */
import {constrainRoofEdges} from './roof-envelope.js?v=1.34.0';
const EPS=1e-8;
const openRing=ring=>ring?.length>1&&Math.hypot(ring[0][0]-ring.at(-1)[0],ring[0][1]-ring.at(-1)[1])<EPS?ring.slice(0,-1):(ring||[]).slice();
function pointInPolygon(point,ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];
    const dx=b[0]-a[0],dy=b[1]-a[1],px=point[0]-a[0],py=point[1]-a[1];
    if(dx*dx+dy*dy>EPS*EPS&&Math.abs(dx*py-dy*px)<EPS&&px*dx+py*dy>=-EPS&&px*dx+py*dy<=dx*dx+dy*dy+EPS)return true;
    if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}

// Same planar Delaunay construction as the rendered sampled apartment roofs.
// Kept pure: no WebGL/DOM requirement for the shade map or numerical tests.
const localRoofFaceCache=new WeakMap();
export function sampledRoofFaces(ring,samples,edgeZ,edgePoints=null) {
  const cached=edgePoints&&localRoofFaceCache.get(edgePoints);
  if(cached&&cached.ring===ring&&cached.samples===samples&&cached.edgeZ===edgeZ)return cached.faces;
  const unique=new Map();
  [...samples,...(edgePoints||openRing(ring).map(p=>[...p,edgeZ]))].forEach(p=>{
    const key=`${p[0].toFixed(3)}:${p[1].toFixed(3)}`;
    if(!unique.has(key)||unique.get(key)[2]<p[2])unique.set(key,p);
  });
  // A local envelope supplies shared wall/roof seam vertices. At coincident
  // plan coordinates they take precedence so no vertical cracks are introduced.
  if(edgePoints)for(const p of edgePoints)unique.set(`${p[0].toFixed(3)}:${p[1].toFixed(3)}`,p);
  const points=[...unique.values()],count=points.length;
  if(count<3)return [];
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys),span=Math.max(x1-x0,y1-y0)*8,cx=(x0+x1)/2,cy=(y0+y1)/2;
  points.push([cx-span,cy-span,edgeZ],[cx,cy+span,edgeZ],[cx+span,cy-span,edgeZ]);
  const triangle=(a,b,c)=>{
    const p=points[a],q=points[b],r=points[c],d=2*(p[0]*(q[1]-r[1])+q[0]*(r[1]-p[1])+r[0]*(p[1]-q[1]));
    if(Math.abs(d)<1e-10)return null;
    const p2=p[0]**2+p[1]**2,q2=q[0]**2+q[1]**2,r2=r[0]**2+r[1]**2;
    const x=(p2*(q[1]-r[1])+q2*(r[1]-p[1])+r2*(p[1]-q[1]))/d,y=(p2*(r[0]-q[0])+q2*(p[0]-r[0])+r2*(q[0]-p[0]))/d;
    return {a,b,c,x,y,r2:(x-p[0])**2+(y-p[1])**2};
  };
  let triangles=[triangle(count,count+1,count+2)];
  for(let i=0;i<count;i++){
    const p=points[i],edges=new Map(),kept=[];
    for(const t of triangles){
      if((p[0]-t.x)**2+(p[1]-t.y)**2<=t.r2+1e-8){
        for(const [a,b]of[[t.a,t.b],[t.b,t.c],[t.c,t.a]]){const key=a<b?`${a}:${b}`:`${b}:${a}`;if(edges.has(key))edges.delete(key);else edges.set(key,[a,b]);}
      }else kept.push(t);
    }
    for(const [a,b]of edges.values()){const t=triangle(a,b,i);if(t)kept.push(t);}
    triangles=kept;
  }
  let indices=triangles.filter(t=>t.a<count&&t.b<count&&t.c<count).map(t=>[t.a,t.b,t.c]);
  if(edgePoints)indices=constrainRoofEdges(indices,points.slice(0,count),edgePoints);
  const faces=indices.filter(([a,b,c])=>pointInPolygon([(points[a][0]+points[b][0]+points[c][0])/3,(points[a][1]+points[b][1]+points[c][1])/3],ring)).map(t=>t.map(i=>points[i]));
  if(edgePoints)localRoofFaceCache.set(edgePoints,{ring,samples,edgeZ,faces});
  return faces;
}

