/**
 * Direct sunlight on outdoor surfaces. Rays point FROM the receiver TO the sun.
 * Local axes and elevations match geometry.js (metres, absolute vertical datum).
 * One-metre sample fractions are a planning approximation, not solar irradiance.
 */
import { terrainAt, gardenGroundAt, floorElevation, hedgeSegments, hedgeTopAt, canopyBounds, jacuzziBounds, pointInPolygon } from './geometry.js?v=1.5.0';
import { localRoofEnvelope, constrainRoofEdges } from './roof-envelope.js?v=1.5.0';
import { screeningTreeVolumes, treeSunIntersection } from './screening-trees.js?v=1.5.0';

const EPS = 1e-8;
const RAY_OFFSET = .005;
// Receiving surfaces match the rendered water, before the 5 mm ray clearance.
const POOL_WATER_ABOVE_CENTRE_GROUND = .055;
const JACUZZI_WATER_ABOVE_FLOOR = -.115;
const JACUZZI_WATER_INSET = .16, JACUZZI_WATER_CORNER_RADIUS = .14;
const num = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const point = p => Array.isArray(p) ? p : [p.x, p.y, p.z];
const openRing = ring => ring?.length > 1 && Math.hypot(ring[0][0] - ring.at(-1)[0], ring[0][1] - ring.at(-1)[1]) < EPS ? ring.slice(0, -1) : (ring || []).slice();
const rectangle = (x0, y0, x1, y1) => [[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
const rectContains = (x,y,r) => x >= r.x0-EPS && x <= r.x1+EPS && y >= r.y0-EPS && y <= r.y1+EPS;
const roundedRectContains = (x,y,r,radius) => {
  if(!rectContains(x,y,r))return false;
  const dx=Math.max(r.x0+radius-x,0,x-(r.x1-radius)),dy=Math.max(r.y0+radius-y,0,y-(r.y1-radius));
  return dx*dx+dy*dy<=radius*radius+EPS;
};
const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub = (a,b) => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];

function bounds(points) {
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const p of points)for(let j=0;j<3;j++){min[j]=Math.min(min[j],p[j]);max[j]=Math.max(max[j],p[j]);}
  return {min,max};
}
function boundsHit(origin,direction,b) {
  let lo=0,hi=Infinity;
  for(let j=0;j<3;j++){
    if(Math.abs(direction[j])<EPS){if(origin[j]<b.min[j]-EPS||origin[j]>b.max[j]+EPS)return false;continue;}
    const t0=(b.min[j]-origin[j])/direction[j],t1=(b.max[j]-origin[j])/direction[j];
    lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));
    if(hi<lo-EPS)return false;
  }
  return hi>EPS;
}
function prism(id,label,ring,base,top) {
  const footprint=openRing(ring);
  if(footprint.length<3||!(top>base))return null;
  return {type:'prism',id,label,footprint,base,top,bounds:bounds(footprint.flatMap(p=>[[...p,base],[...p,top]]))};
}
function mesh(id,label,faces) {
  if(!faces.length)return null;
  return {type:'mesh',id,label,bounds:bounds(faces.flat()),triangles:faces.map(([a,b,c])=>({a,e1:sub(b,a),e2:sub(c,a),bounds:bounds([a,b,c])}))};
}
function prismHit(origin,direction,body) {
  const {footprint,base,top}=body;
  // Relevant for a sample inside a hypothetical moved building.
  if(origin[2]>base+EPS&&origin[2]<top-EPS&&pointInPolygon(origin,footprint))return EPS*2;
  let nearest=Infinity;
  if(Math.abs(direction[2])>EPS){
    for(const z of [base,top]){
      const t=(z-origin[2])/direction[2];
      if(t>EPS&&t<nearest&&pointInPolygon([origin[0]+t*direction[0],origin[1]+t*direction[1]],footprint))nearest=t;
    }
  }
  for(let i=0;i<footprint.length;i++){
    const a=footprint[i],b=footprint[(i+1)%footprint.length],vx=b[0]-a[0],vy=b[1]-a[1];
    const den=direction[0]*vy-direction[1]*vx;
    if(Math.abs(den)<EPS)continue;
    const ax=a[0]-origin[0],ay=a[1]-origin[1],t=(ax*vy-ay*vx)/den,u=(ax*direction[1]-ay*direction[0])/den;
    if(t<=EPS||t>=nearest||u<-EPS||u>1+EPS)continue;
    const z=origin[2]+t*direction[2];
    if(z>=base-EPS&&z<=top+EPS)nearest=t;
  }
  return Number.isFinite(nearest)?nearest:null;
}
function triangleHit(origin,direction,triangle) {
  if(!boundsHit(origin,direction,triangle.bounds))return null;
  const h=cross(direction,triangle.e2),a=dot(triangle.e1,h);
  if(Math.abs(a)<EPS)return null;
  const f=1/a,s=sub(origin,triangle.a),u=f*dot(s,h);
  if(u<-EPS||u>1+EPS)return null;
  const q=cross(s,triangle.e1),v=f*dot(direction,q);
  if(v<-EPS||u+v>1+EPS)return null;
  const t=f*dot(triangle.e2,q);
  return t>EPS?t:null;
}

/** First opaque obstruction along a normalized or non-normalized sun vector. */
export function firstSunBlocker(receiver,sunDirection,occluders) {
  const origin=point(receiver),length=Math.hypot(...sunDirection);
  if(!Number.isFinite(length)||length<EPS)return null;
  const direction=sunDirection.map(v=>v/length);
  let nearest=null;
  for(const object of occluders){
    if(!object||!boundsHit(origin,direction,object.bounds))continue;
    let t=null;
    if(object.type==='prism')t=prismHit(origin,direction,object);
    else for(const triangle of object.triangles){const hit=triangleHit(origin,direction,triangle);if(hit!==null&&(t===null||hit<t))t=hit;}
    if(t!==null&&(!nearest||t<nearest.distance))nearest={id:object.id,label:object.label,distance:t,point:origin.map((v,i)=>v+t*direction[i])};
  }
  return nearest;
}

/** Public simple prism constructor, also useful for independent geometric checks. */
export function sunPrism(id,footprint,baseZ,roofZ,label=id){return prism(id,label,footprint,baseZ,roofZ);}

function gableFaces(ring,eaves,ridge,axis='x') {
  const xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]),x0=Math.min(...xs)-.12,x1=Math.max(...xs)+.12,y0=Math.min(...ys)-.12,y1=Math.max(...ys)+.12;
  const a=[x0,y0,eaves],b=[x1,y0,eaves],c=[x1,y1,eaves],d=[x0,y1,eaves];
  if(axis==='x'){
    const e=[x0,(y0+y1)/2,ridge],f=[x1,(y0+y1)/2,ridge];
    return [[a,b,f],[a,f,e],[d,e,f],[d,f,c],[a,e,d],[b,c,f]];
  }
  const e=[(x0+x1)/2,y0,ridge],f=[(x0+x1)/2,y1,ridge];
  return [[a,d,f],[a,f,e],[e,f,c],[e,c,b],[a,e,b],[d,c,f]];
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

const contextOccluderCache=new WeakMap();
function makeOccluders(settings,data) {
  const objects=[],add=o=>{if(o)objects.push(o);};
  const site=data.site,house=site.house,garage=site.garage,floor=floorElevation(settings,data),rear=site.rearMidpoint[1];
  let context=contextOccluderCache.get(data);
  if(!context){
    context=[];
    for(const b of data.buildings||[]){
      if(b.id===house?.id||b.id===garage?.id||b.kind==='house'||b.kind==='garage')continue;
      const roof=Math.max(num(b.baseZ)+2,num(b.roofZ,num(b.baseZ)+7));
      const body=prism(b.id,b.label||b.id,b.footprint,num(b.baseZ),roof);if(body)context.push(body);
      const roofPoints=(b.roofPoints||[]).map(point).filter(p=>p.length>=3&&p.every(Number.isFinite));
      if(b.kind==='target'&&roofPoints.length>6){const roofMesh=mesh(`${b.id}-roof`,b.label||b.id,sampledRoofFaces(b.footprint,roofPoints,roof));if(roofMesh)context.push(roofMesh);}
    }
    contextOccluderCache.set(data,context);
  }
  objects.push(...context);
  const addMeasuredBuilding=(building,id,label,axis)=>{
    if(!building?.footprint?.length)return;
    const ring=openRing(building.footprint),returns=(building.roofPoints||[]).map(point).filter(p=>p.length>=3&&p.every(Number.isFinite));
    if(site.id==='korzeniowskiego-40'&&building===house&&returns.length>6){
      const envelope=localRoofEnvelope(building);
      add(mesh(id,label,envelope.wallFaces));
      add(mesh(`${id}-roof`,`${label} roof`,sampledRoofFaces(envelope.ring,envelope.samples,envelope.fallback,envelope.boundary)));
      return;
    }
    // Fixed source elevations, shared with the renderer. Changing a proposed
    // interior floor must never lift the existing building's shadow-casting roof.
    const sampled=returns.length>6,eaves=sampled?Math.min(...returns.map(p=>p[2])):num(building.roofZ,num(building.baseZ)+7);
    add(prism(id,label,ring,num(building.baseZ),eaves));
    add(mesh(`${id}-roof`,`${label} roof`,sampled?sampledRoofFaces(ring,returns,eaves)
      :gableFaces(ring,eaves,Math.max(eaves,num(building.roofTopZ,eaves)),axis)));
  };
  addMeasuredBuilding(house,'house','House','x');
  if(settings.removeGarage===false)addMeasuredBuilding(garage,'garage','Retained garage','y');
  const t=site.terrace,depth=num(settings.terraceDepth,t?.depth||4.2);
  if(t){
    const ground=gardenGroundAt(t.x+t.width/2,rear+depth/2,settings,data),base=Math.min(ground,floor-.15);
    const threshold=Math.max(0,num(t.thresholdDepth));
    if(threshold)add(prism('terrace-threshold','Terrace threshold',rectangle(t.x,rear-threshold,t.x+t.width,rear),base,floor));
    // The recessed tub is a real hole. A solid deck prism would enclose its
    // below-floor water receiver and incorrectly shade it even at solar zenith.
    const tub=jacuzziBounds(settings,data),x0=t.x,x1=t.x+t.width,y0=rear,y1=rear+depth;
    const hx0=Math.max(x0,tub.x0),hx1=Math.min(x1,tub.x1),hy0=Math.max(y0,tub.y0),hy1=Math.min(y1,tub.y1);
    const deckPieces=hx0<hx1&&hy0<hy1?[[x0,y0,hx0,y1],[hx1,y0,x1,y1],[hx0,y0,hx1,hy0],[hx0,hy1,hx1,y1]]:[[x0,y0,x1,y1]];
    for(const [a,b,c,d]of deckPieces)if(c-a>EPS&&d-b>EPS)add(prism('terrace-edge','Raised terrace',rectangle(a,b,c,d),base,floor));
  }
  const segments=hedgeSegments(settings,data);
  for(const segment of segments){
    const a=segment.a,b=segment.b,dx=b[0]-a[0],dy=b[1]-a[1],n=Math.max(1,Math.ceil(Math.hypot(dx,dy)/.75)),faces=[];
    for(let i=0;i<n;i++){
      const p=[a[0]+dx*i/n,a[1]+dy*i/n],q=[a[0]+dx*(i+1)/n,a[1]+dy*(i+1)/n];
      const baseP=terrainAt(...p,data),baseQ=terrainAt(...q,data);
      const soilP=baseP+num(settings.gardenRaise)+num(settings.bedRaise),soilQ=baseQ+num(settings.gardenRaise)+num(settings.bedRaise);
      // Filled beds remain opaque even when retained foliage ends below them.
      const topP=Math.max(soilP,segment.height>0?hedgeTopAt(...p,segment.side,settings,data):baseP),topQ=Math.max(soilQ,segment.height>0?hedgeTopAt(...q,segment.side,settings,data):baseQ);
      if(topP>baseP+EPS||topQ>baseQ+EPS)faces.push([[...p,baseP],[...q,baseQ],[...q,topQ]],[[...p,baseP],[...q,topQ],[...p,topP]]);
    }
    add(mesh(`hedge-${segment.side}`,`${segment.side[0].toUpperCase()+segment.side.slice(1)} hedge / bed`,faces));
  }
  if(settings.canopyEnabled){
    const c=canopyBounds(settings,data);
    add(prism('canopy-roof','Terrace canopy',rectangle(c.x0,c.y0,c.x1,c.y1),c.z,c.z+.15));
    const bottom=Math.min(c.z-.04,c.fasciaBottomZ);
    add(prism('canopy-front','Canopy front fascia',rectangle(c.x0,c.y1-.075,c.x1,c.y1+.075),bottom,c.z));
    add(prism('canopy-right','Canopy right fascia',rectangle(c.x0,c.y0,c.x0+.13,c.y1),bottom,c.z));
    add(prism('canopy-left','Canopy left fascia',rectangle(c.x1-.13,c.y0,c.x1,c.y1),bottom,c.z));
    for(const x of [c.x0+.08,c.x1-.18])add(prism('canopy-post','Canopy post',rectangle(x,c.y1-.18,x+.1,c.y1-.08),floor,Math.max(floor+.1,bottom)));
  }
  return objects;
}

function bedSurface(x,y,ground,settings,segments){
  const raise=Math.max(0,num(settings.bedRaise));
  if(!raise)return ground;
  let rise=0;
  for(const {a,b}of segments){
    const dx=b[0]-a[0],dy=b[1]-a[1],len2=dx*dx+dy*dy,t=((x-a[0])*dx+(y-a[1])*dy)/len2;
    if(t<0||t>1)continue;
    const inward=(-dy*(x-a[0])+dx*(y-a[1]))/Math.sqrt(len2);
    if(inward>=0&&inward<.85)rise=Math.max(rise,raise*(1-inward/.85));
  }
  return ground+rise;
}

function makeReceivers(settings,data,size=1){
  const {site}=data,ring=openRing(site.boundary),xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]),rear=site.rearMidpoint[1];
  const t=site.terrace,p=site.pool,terrace=t?{x0:t.x,y0:rear-Math.max(0,num(t.thresholdDepth)),x1:t.x+t.width,y1:rear+num(settings.terraceDepth,t.depth)}:null;
  const pool=p?{x0:p.x,y0:p.y,x1:p.x+p.width,y1:p.y+p.length}:null;
  const tub=t?jacuzziBounds(settings,data):null;
  const tubWater=tub?{x0:tub.x0+JACUZZI_WATER_INSET,x1:tub.x1-JACUZZI_WATER_INSET,y0:tub.y0+JACUZZI_WATER_INSET,y1:tub.y1-JACUZZI_WATER_INSET}:null;
  const poolZ=p?gardenGroundAt(p.x+p.width/2,p.y+p.length/2,settings,data)+POOL_WATER_ABOVE_CENTRE_GROUND:0;
  const floor=floorElevation(settings,data),segments=hedgeSegments(settings,data),cells=[];
  for(let y=Math.floor(Math.min(...ys)/size)*size+size/2;y<Math.max(...ys);y+=size){
    for(let x=Math.floor(Math.min(...xs)/size)*size+size/2;x<Math.max(...xs);x+=size){
      if(!pointInPolygon([x,y],ring)||site.house?.footprint&&pointInPolygon([x,y],site.house.footprint))continue;
      if(settings.removeGarage===false&&site.garage?.footprint&&pointInPolygon([x,y],site.garage.footprint))continue;
      const zone=tubWater&&roundedRectContains(x,y,tubWater,JACUZZI_WATER_CORNER_RADIUS)?'jacuzzi':terrace&&rectContains(x,y,terrace)?'terrace':pool&&rectContains(x,y,pool)?'pool':y>=rear?'garden':'front';
      const z=zone==='jacuzzi'?floor+JACUZZI_WATER_ABOVE_FLOOR:zone==='terrace'?floor:zone==='pool'?poolZ:bedSurface(x,y,gardenGroundAt(x,y,settings,data),settings,segments);
      cells.push({x,y,z,size,zone});
    }
  }
  return cells;
}

const geometryCache=new WeakMap();
const geometryKeys=['hedgeRear','hedgeLeft','hedgeRight','hedgeInset','gardenRaise','bedRaise','raiseNewHedges','floorHeight','removeGarage','terraceDepth','canopyEnabled','canopyDepth','canopyHeight','canopyWidth','fasciaDepth'];
/** Time changes reuse geometry; date/leaf mode and tree edits rebuild foliage. */
export function prepareSunGeometry(settings,data){
  const signature=JSON.stringify([...geometryKeys.map(k=>settings[k]),settings.screeningTrees||[],settings.treeLeafMode||'auto',settings.sunDate||'2026-06-21']);
  const cached=geometryCache.get(data);
  if(cached?.signature===signature)return cached.geometry;
  const pool=data.site.pool,tub=data.site.terrace?jacuzziBounds(settings,data):null;
  const terrain={maxZ:Math.max(...data.terrain.elevations)+Math.max(0,num(settings.gardenRaise))+Math.max(0,num(settings.bedRaise)),segments:hedgeSegments(settings,data),
    cutouts:[...(pool?[{x0:pool.x,x1:pool.x+pool.width,y0:pool.y,y1:pool.y+pool.length}]:[]),...(tub?[tub]:[])]};
  const geometry={occluders:makeOccluders(settings,data),trees:screeningTreeVolumes(settings,data),cells:makeReceivers(settings,data),cellSize:1,terrain};
  geometryCache.set(data,{signature,geometry});
  return geometry;
}

/** Local terrain only: bounded native DTM samples, never a clamped distant horizon. */
function terrainSunBlocker(origin,direction,settings,data,terrain,maxDistance=Infinity){
  if(!terrain||origin[2]>terrain.maxZ+EPS)return null;
  const horizontal=Math.hypot(direction[0],direction[1]);
  if(horizontal<EPS)return null;
  const c=data.coordinates,t=data.terrain;
  for(let horizontalDistance=.5;horizontalDistance<=180;horizontalDistance+=.5){
    const distance=horizontalDistance/horizontal;
    if(distance>=maxDistance)return null;
    const x=origin[0]+distance*direction[0],y=origin[1]+distance*direction[1],z=origin[2]+distance*direction[2];
    if(z>terrain.maxZ+EPS)return null;
    const e=c.localOriginEN[0]+x*c.xUnitEN[0]+y*c.yUnitEN[0],n=c.localOriginEN[1]+x*c.xUnitEN[1]+y*c.yUnitEN[1];
    const gx=(e-t.originEN[0])/t.cellSize,gy=(n-t.originEN[1])/t.cellSize;
    if(gx<0||gy<0||gx>t.columns-1||gy>t.rows-1)return null;
    // Both water bodies are excavations, not original DTM receiving surfaces.
    if(terrain.cutouts.some(r=>rectContains(x,y,r)))continue;
    const ground=bedSurface(x,y,gardenGroundAt(x,y,settings,data),settings,terrain.segments);
    if(z<ground-EPS)return {id:'terrain',label:'Local terrain / raised garden',distance,point:[x,y,z]};
  }
  return null;
}

/** Direct-beam visibility at an arbitrary outdoor receiver; no indoor claim. */
export function sunlightAtPoint(receiver,settings,data,sun,geometry=prepareSunGeometry(settings,data)){
  if(settings.sunEnabled===false)return {state:'disabled',sunlit:false,blocker:null};
  if(!sun?.isDaylight||!sun.direction||sun.direction[2]<=0)return {state:'night',sunlit:false,blocker:null};
  const origin=point(receiver).slice();origin[2]+=RAY_OFFSET;
  const length=Math.hypot(...sun.direction),direction=sun.direction.map(v=>v/length);
  if(!Number.isFinite(length)||length<EPS)return {state:'night',sunlit:false,blocker:null};
  const objectBlocker=firstSunBlocker(origin,direction,geometry.occluders);
  const treeBlocker=treeSunIntersection(origin,direction,geometry.trees);
  const nearest=treeBlocker&&(!objectBlocker||treeBlocker.distance<objectBlocker.distance)?treeBlocker:objectBlocker;
  const blocker=terrainSunBlocker(origin,direction,settings,data,geometry.terrain,nearest?.distance)||nearest;
  return {state:blocker?'shade':'sun',sunlit:!blocker,blocker};
}

/**
 * Returns full-plot outdoor samples, with rear-garden/terrace/pool/front totals.
 * Fractions describe direct geometric sun only. Night has percent:null rather
 * than being reported as architectural shade; weather is deliberately absent.
 */
export function analyzeSunlight(settings,data,sun){
  const geometry=prepareSunGeometry(settings,data),zones=Object.fromEntries(['garden','terrace','jacuzzi','pool','front'].map(k=>[k,{sunlit:0,shaded:0,total:0,percent:null}]));
  const daylight=settings.sunEnabled!==false&&sun?.isDaylight===true&&sun?.direction?.[2]>0;
  const status=settings.sunEnabled===false?'disabled':daylight?'daylight':'night';
  const cells=geometry.cells.map(cell=>{
    const result=sunlightAtPoint(cell,settings,data,sun,geometry),zone=zones[cell.zone];
    zone.total++;if(result.sunlit)zone.sunlit++;else if(daylight)zone.shaded++;
    return {...cell,sunlit:result.sunlit,state:result.state,blockedBy:result.blocker?.id||null,blockedLabel:result.blocker?.label||null,
      ...(result.blocker?.treeId?{treeId:result.blocker.treeId,treeTypeId:result.blocker.typeId}:{})};
  });
  for(const zone of Object.values(zones))zone.percent=daylight&&zone.total?zone.sunlit/zone.total*100:null;
  return {status,isDaylight:daylight,cells,zones,cellSize:geometry.cellSize,direction:sun?.direction||null,
    modelNote:'Direct sun at 1 m outdoor sample points, including local terrain sampled every 0.5 m along each ray and finite dense proposed tree crowns. Deciduous auto foliage is May–October, an approximate comparison assumption. Existing trees, decorative planting/furniture and distant terrain horizon are not included; no clouds or diffuse/reflected light.',
    method:'Direct-sun visibility at 1 m outdoor sample centres, using mapped building bodies and sampled roofs, fixed house/garage roof elevations, local terrain, opaque hedges, the proposed canopy and valid enabled screening trees with seasonal crown geometry. Pool and recessed jacuzzi water use matched surface heights and excavated openings.',
    limitations:'No weather, diffuse/reflected light, existing tree crowns, decorative planting/furniture/rims, isolated unverified high roof returns, or terrain beyond the supplied DTM. Samples approximate surface area; roof interpolation, missing-roof fallbacks and foliage permeability remain simplified.'};
}
