/**
 * One resolved neighbouring-building envelope for the scene and local rays.
 * The immutable LoD1 record is provenance, not an additional opaque prism under
 * a resolved lower wing. Privacy target samples remain a separate input.
 */
import {visualNeighborRoof} from './observed-neighbor-roofs.js?v=1.39.0';
import {observedApartmentRoof} from './observed-apartment-roofs.js?v=1.39.0';

const cache=new WeakMap(),EPS=1e-8;
const point=p=>Array.isArray(p)?p:[p.x,p.y,p.z];
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const bounds=points=>({min:[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...points.map(p=>p[i])))});

/** No source mutation. Unknown buildings retain their explicit LoD1 fallback. */
export function contextBuildingEnvelope(building,data){
  if(!building||building.kind==='house'||building.kind==='garage'||building.id===data?.site?.house?.id||building.id===data?.site?.garage?.id)return null;
  const source=data?.neighborRoofObservations,previous=cache.get(building);
  if(previous&&previous.source===source)return previous.value;
  const detail=visualNeighborRoof(building,data)||observedApartmentRoof(building);
  if(!detail){cache.set(building,{source,value:null});return null;}
  const faces=[...detail.wallFaces,...detail.roofFaces];
  const value={...detail,id:building.id,label:building.label||building.id,type:'mesh',faces,bounds:bounds(faces.flat()),
    triangles:faces.map(([a,b,c])=>({a,e1:sub(b,a),e2:sub(c,a),bounds:bounds([a,b,c])}))};
  cache.set(building,{source,value});return value;
}

function boundsHit(origin,direction,bounds,minT,maxT){
  let enter=minT,exit=maxT;
  for(let i=0;i<3;i++){
    if(Math.abs(direction[i])<EPS){if(origin[i]<bounds.min[i]-EPS||origin[i]>bounds.max[i]+EPS)return false;continue;}
    const a=(bounds.min[i]-origin[i])/direction[i],b=(bounds.max[i]-origin[i])/direction[i];
    enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));
    if(enter>exit+EPS)return false;
  }
  return true;
}

/** Finite double-sided mesh hit, excluding the eye and target surface. */
export function contextEnvelopeIntersection(observer,target,envelope){
  const a=point(observer),b=point(target),direction=sub(b,a),minT=1e-5,maxT=1-1e-5;
  if(!boundsHit(a,direction,envelope.bounds,minT,maxT))return null;
  let nearest=maxT,hit=null;
  for(const triangle of envelope.triangles){
    if(!boundsHit(a,direction,triangle.bounds,minT,nearest))continue;
    const h=cross(direction,triangle.e2),det=dot(triangle.e1,h);
    if(Math.abs(det)<EPS)continue;
    const offset=sub(a,triangle.a),u=dot(offset,h)/det;
    if(u<-EPS||u>1+EPS)continue;
    const q=cross(offset,triangle.e1),v=dot(direction,q)/det;
    if(v<-EPS||u+v>1+EPS)continue;
    const t=dot(triangle.e2,q)/det;
    if(t<=minT||t>=nearest)continue;
    nearest=t;hit={t,x:a[0]+t*direction[0],y:a[1]+t*direction[1],z:a[2]+t*direction[2],buildingId:envelope.id};
  }
  return hit;
}
