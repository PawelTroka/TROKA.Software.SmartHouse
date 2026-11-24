/**
 * PCK 1/3/5: the supplied oblique references show a flat deck, a central
 * pyramidal rooflight and six separate chimney stacks. The 2024 return clusters
 * support those locations, but a Delaunay skin across them invents broad dark
 * roof mounds. Reconstruct the observed forms independently of the flat deck.
 *
 * Fixture plan extents, the rooflight curb and frame spacing are estimates,
 * not surveyed dimensions. Feature tops never exceed their source clusters.
 * Unclassified high returns remain narrow individual fixtures at their measured
 * XY/Z, not a solid roof connecting them. The assumed 0.16 m fixture thickness
 * is deliberately recorded; their identity and cross-section are unresolved.
 * All raw samples, high-feature targets and source dates remain untouched.
 */
const IDS=new Set([
  'ID-2261-26BC7443-4548-FAF6-E053-CA2BA8C0FAE4',
  'ID-2261-26BC7443-422F-FAF6-E053-CA2BA8C0FAE4',
  'ID-2261-26BC7443-485F-FAF6-E053-CA2BA8C0FAE4',
]);
const cache=new WeakMap(),EPS=1e-8;
const openRing=ring=>Math.hypot(ring[0][0]-ring.at(-1)[0],ring[0][1]-ring.at(-1)[1])<EPS?ring.slice(0,-1):ring.slice();
function canonicalRing(footprint){
  let ring=openRing(footprint).map(p=>p.slice(0,2));
  // Source order is not orientation evidence. Collapse only truly collinear
  // subdivisions, keep counter-clockwise winding, and start at the west corner.
  ring=ring.filter((p,i)=>{
    const a=ring[(i+ring.length-1)%ring.length],b=ring[(i+1)%ring.length];
    return Math.abs((p[0]-a[0])*(b[1]-p[1])-(p[1]-a[1])*(b[0]-p[0]))>EPS;
  });
  if(ring.reduce((sum,p,i)=>sum+p[0]*ring[(i+1)%ring.length][1]-p[1]*ring[(i+1)%ring.length][0],0)<0)ring.reverse();
  const start=ring.reduce((best,p,i)=>p[0]<ring[best][0]-EPS||Math.abs(p[0]-ring[best][0])<EPS&&p[1]<ring[best][1]?i:best,0);
  return [...ring.slice(start),...ring.slice(0,start)];
}
const quantile=(values,q)=>{const s=values.slice().sort((a,b)=>a-b),p=(s.length-1)*q,i=Math.floor(p);return s[i]+(s[Math.min(i+1,s.length-1)]-s[i])*(p-i);};
const mean=values=>values.reduce((a,b)=>a+b,0)/values.length;
const wallFaces=(ring,base,top)=>ring.flatMap((a,i)=>{const b=ring[(i+1)%ring.length];return [[[...a,base],[...b,base],[...b,top]],[[...a,base],[...b,top],[...a,top]]];});
const capFaces=(ring,z)=>ring.slice(2).map((p,i)=>[[...ring[0],z],[...ring[i+1],z],[...p,z]]);

export function observedApartmentRoof(building){
  if(!IDS.has(building?.officialId)||!building.footprint?.length||!Array.isArray(building.roofPoints)||building.roofPoints.length<60
    ||!Number.isFinite(building.baseZ)||!Number.isFinite(building.roofZ)||building.roofZ<=building.baseZ)return null;
  if(cache.has(building))return cache.get(building);
  const scale=Number.isFinite(building.adjustment?.scaleZ)&&building.adjustment.scaleZ>0?building.adjustment.scaleZ:1;
  const dx=building.adjustment?.dx||0,dy=building.adjustment?.dy||0,baseZ=building.baseZ;
  // Classify in the native frame: sensitivity sliders only transform the result.
  const nativeZ=z=>baseZ+(z-baseZ)/scale,zWorld=z=>baseZ+(z-baseZ)*scale;
  const ring=canonicalRing(building.footprint).map(p=>[p[0]-dx,p[1]-dy]);
  if(ring.length!==4)return null;
  const origin=ring[0],u=[ring[1][0]-origin[0],ring[1][1]-origin[1]],v=[ring[3][0]-origin[0],ring[3][1]-origin[1]];
  const det=u[0]*v[1]-u[1]*v[0],width=Math.hypot(...u),depth=Math.hypot(...v);
  if(det<EPS)return null;
  const xy=(s,t)=>[origin[0]+u[0]*s+v[0]*t,origin[1]+u[1]*s+v[1]*t];
  const rectangle=(s0,t0,s1,t1)=>[xy(s0,t0),xy(s1,t0),xy(s1,t1),xy(s0,t1)];
  const points=building.roofPoints.filter(p=>Array.isArray(p)&&p.length>=3&&p.slice(0,3).every(Number.isFinite)).map(p=>{
    const x=p[0]-dx,y=p[1]-dy,rx=x-origin[0],ry=y-origin[1];
    return {x,y,z:nativeZ(p[2]),u:(rx*v[1]-ry*v[0])/det,v:(u[0]*ry-u[1]*rx)/det};
  });
  const deckZ=nativeZ(building.roofZ),features=[];
  const central=points.filter(p=>p.u>.39&&p.u<.615&&p.v>.32&&p.v<.67&&p.z>deckZ+.45);
  if(central.length<10)return null;
  const apexZ=Math.max(...central.map(p=>p.z)),apexSamples=central.filter(p=>p.z>=apexZ-.25);
  const apex=[...xy(mean(apexSamples.map(p=>p.u)),mean(apexSamples.map(p=>p.v))),apexZ];
  const pyramidRing=rectangle(Math.min(...central.map(p=>p.u))-.2/width,Math.min(...central.map(p=>p.v))-.2/depth,
    Math.max(...central.map(p=>p.u))+.2/width,Math.max(...central.map(p=>p.v))+.2/depth);
  const curbZ=deckZ+Math.max(.25,Math.min(.6,quantile(central.map(p=>p.z),.1)-deckZ-.25));
  const pyramidFaces=pyramidRing.map((a,i)=>[[...a,curbZ],[...pyramidRing[(i+1)%4],curbZ],apex]);
  const frameLines=[];
  for(let i=0;i<4;i++){
    const a=pyramidRing[i],b=pyramidRing[(i+1)%4];
    frameLines.push([[...a,curbZ],[...b,curbZ]]);
    for(const fraction of [0,.25,.5,.75])frameLines.push([[a[0]+(b[0]-a[0])*fraction,a[1]+(b[1]-a[1])*fraction,curbZ],apex]);
  }
  features.push({id:'central-rooflight',kind:'pyramid',footprint:pyramidRing,baseZ:deckZ,topZ:apexZ,
    wallFaces:wallFaces(pyramidRing,deckZ,curbZ),roofFaces:pyramidFaces,frameLines,
    sourcePointCount:central.length,planExtentEstimated:true});
  for(const [column,cu] of [.345,.66].entries())for(const [row,cv] of [.155,.49,.845].entries()){
    const cluster=points.filter(p=>Math.abs(p.u-cu)<.075&&Math.abs(p.v-cv)<.08&&p.z>deckZ+.65&&p.z<deckZ+2.15
      &&(row!==1||p.u<.39||p.u>.615));
    if(!cluster.length)continue;
    const us=cluster.map(p=>p.u),vs=cluster.map(p=>p.v),cx=mean(us),cy=mean(vs);
    const halfU=Math.max(.45/width,(Math.max(...us)-Math.min(...us))/2+.15/width);
    const halfV=Math.max(.35/depth,(Math.max(...vs)-Math.min(...vs))/2+.15/depth);
    const footprint=rectangle(cx-halfU,cy-halfV,cx+halfU,cy+halfV),topZ=Math.max(...cluster.map(p=>p.z));
    features.push({id:`chimney-${column}-${row}`,kind:'chimney',footprint,baseZ:deckZ,topZ,
      wallFaces:wallFaces(footprint,deckZ,topZ),roofFaces:capFaces(footprint,topZ),
      sourcePointCount:cluster.length,planExtentEstimated:true});
  }
  const high=points.filter(p=>p.z>deckZ+3.05&&!central.includes(p));
  high.forEach((p,index)=>{
    const footprint=rectangle(p.u-.08/width,p.v-.08/depth,p.u+.08/width,p.v+.08/depth);
    features.push({id:`unclassified-high-return-${index}`,kind:'high-fixture',footprint,baseZ:deckZ,topZ:p.z,
      wallFaces:wallFaces(footprint,deckZ,p.z),roofFaces:capFaces(footprint,p.z),
      sourcePointCount:1,planExtentEstimated:true,assumedThicknessM:.16});
  });
  const transform=p=>[p[0]+dx,p[1]+dy,zWorld(p[2])],transformFaces=faces=>faces.map(face=>face.map(transform));
  const transformedFeatures=features.map(f=>({...f,footprint:f.footprint.map(p=>[p[0]+dx,p[1]+dy]),
    baseZ:zWorld(f.baseZ),topZ:zWorld(f.topZ),wallFaces:transformFaces(f.wallFaces),roofFaces:transformFaces(f.roofFaces),
    frameLines:f.frameLines?.map(line=>line.map(transform))}));
  const surfaceFaces=transformFaces(capFaces(ring,deckZ));
  const edgePoints=ring.map(p=>transform([...p,deckZ]));
  const value={surfaceFaces,features:transformedFeatures,wallFaces:transformFaces(wallFaces(ring,baseZ,deckZ)),
    roofFaces:[...surfaceFaces,...transformedFeatures.flatMap(f=>[...f.wallFaces,...f.roofFaces])],
    roofPoints:building.roofPoints,edgePoints,edgeZ:building.roofZ,wallTopZ:building.roofZ,
    edges:edgePoints.map((p,i)=>({index:i,length:Math.hypot(p[0]-edgePoints[(i+1)%4][0],p[1]-edgePoints[(i+1)%4][1]),points:[p,edgePoints[(i+1)%4]]})),
    minZ:building.roofZ,maxZ:Math.max(...transformedFeatures.map(f=>f.topZ)),
    officialId:building.officialId,sourceId:'gugik-als-2024',acquired:'2024-10-01',
    sampleCount:points.length,method:'Reference-informed flat deck, central pyramid and six measured chimney clusters',
    meaning:'Estimated rooflight and chimney extents from sparse 2024 returns and supplied oblique references; not surveyed roof topology. Unclassified high returns retain measured coordinates and heights as 0.16 m fixtures of unknown cross-section. Source records and privacy targets are unchanged.'};
  cache.set(building,value);return value;
}
