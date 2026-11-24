import {sampledRoofFaces} from './roof-mesh.js?v=1.33.0';
import {localRoofEnvelope,roofEdgeHeight} from './roof-envelope.js?v=1.33.0';
import {reconstructSteppedRoof,transformRoofPatches} from './observed-roof-patches.js?v=1.33.0';

const cache=new WeakMap();
const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const quantile=(sorted,fraction)=>{
  const at=(sorted.length-1)*fraction,index=Math.floor(at),weight=at-index;
  return sorted[index]*(1-weight)+sorted[Math.min(index+1,sorted.length-1)]*weight;
};
const openRing=ring=>ring?.length>1&&Math.hypot(ring[0][0]-ring.at(-1)[0],ring[0][1]-ring.at(-1)[1])<1e-7?ring.slice(0,-1):ring||[];

function segmentDistance(x,y,a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1],l2=dx*dx+dy*dy;
  const t=l2?Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/l2)):0;
  return {distance:Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy),t};
}
function insideOrBoundary(x,y,ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];
    if(segmentDistance(x,y,a,b).distance<.015)return true;
    if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}

/** Do not turn isolated wall returns, antennas or unclassified fixtures into
 * speculative roof peaks. Supported lower roof levels remain in the extract.
 * The complete unfiltered samples and maximum remain in the source JSON. */
export function filterNeighborRoofSamples(points,baseZ){
  const unique=new Map();
  for(const p of points||[]){
    if(!Array.isArray(p)||p.length<3||!p.slice(0,3).every(Number.isFinite)||p[2]<=baseZ+2)continue;
    const key=p[0].toFixed(3)+':'+p[1].toFixed(3);
    if(!unique.has(key)||unique.get(key)[2]<p[2])unique.set(key,p.slice(0,3));
  }
  const source=[...unique.values()];
  if(source.length<12)return {points:[],excludedCount:source.length,method:'insufficient samples'};
  const heights=source.map(p=>p[2]).sort((a,b)=>a-b),median=quantile(heights,.5);
  const dominantFlat=quantile(heights,.75)-quantile(heights,.25)<=.55&&heights.filter(z=>Math.abs(z-median)<.6).length/source.length>=.75;
  const retained=source.filter((p,index)=>{
    if(dominantFlat&&p[2]>median+.65)return false;
    const nearest=source.map((q,i)=>({p:q,i,d:Math.hypot(q[0]-p[0],q[1]-p[1])})).filter(q=>q.i!==index).sort((a,b)=>a.d-b.d).slice(0,8);
    const local=nearest.map(q=>q.p[2]).sort((a,b)=>a-b),support=nearest.filter(q=>q.d<2.3&&Math.abs(q.p[2]-p[2])<.65).length;
    return Math.abs(p[2]-quantile(local,.5))<=2||support>=3;
  });
  return {points:retained,excludedCount:source.length-retained.length,
    method:dominantFlat?'dominant flat roof; raised fixture returns omitted':'supported sloping and stepped roof surface'};
}

/** A source-supported roof and wall envelope from the optional measured extract.
 * The local wall top follows the same boundary vertices as the triangulated
 * roof, including gables and lower wings. A uniform median-height prism is not
 * retained underneath it. Rendering, local privacy and sunlight consume the same
 * envelope; source building fields and target samples are never rewritten. */
export function visualNeighborRoof(building,data){
  const source=data?.neighborRoofObservations;
  if(!building?.officialId||!source?.buildings)return null;
  const previous=cache.get(building);
  if(previous?.source===source)return previous.value;
  const observation=source.buildings.find(record=>record.officialId===building.officialId);
  const baseZ=finite(building.baseZ,NaN),ring=openRing(building.footprint).map(p=>p.slice(0,2));
  if(!observation||ring.length<3||!Number.isFinite(baseZ))return null;
  const dx=finite(building.adjustment?.dx),dy=finite(building.adjustment?.dy),scale=Math.max(.2,finite(building.adjustment?.scaleZ,1));
  const points=(observation.roofPoints||[]).filter(p=>Array.isArray(p)&&p.length>=3&&p.slice(0,3).every(Number.isFinite))
    .map(p=>[p[0]+dx,p[1]+dy,baseZ+(p[2]-baseZ)*scale])
    .filter(p=>insideOrBoundary(p[0],p[1],ring));
  // Filter in native elevations, so an exploratory height scaling cannot
  // change which source returns are classified as a rooftop fixture.
  const filtered=filterNeighborRoofSamples(points.map(p=>[p[0],p[1],baseZ+(p[2]-baseZ)/scale]),baseZ);
  if(filtered.points.length<12)return null;
  const roofPoints=filtered.points.map(p=>[p[0],p[1],baseZ+(p[2]-baseZ)*scale]);
  const signedArea=ring.reduce((sum,a,i)=>{const b=ring[(i+1)%ring.length];return sum+a[0]*b[1]-b[0]*a[1];},0);
  if(signedArea<0)ring.reverse();
  // The supported lower roofs at 4h are disconnected from the main gables.
  // A continuous height field wrongly draped dark roof triangles down their
  // several-metre wall steps. Keep this evidence-specific correction separate
  // from the shared triangulator and the immutable source building record.
  if(building.officialId==='ID-2261-26BC7443-6C90-FAF6-E053-CA2BA8C0FAE4'){
    const nativePoint=p=>[p[0]-dx,p[1]-dy,baseZ+(p[2]-baseZ)/scale];
    const nativeBuilding={footprint:ring.map(p=>[p[0]-dx,p[1]-dy]),baseZ};
    const reconstructed=reconstructSteppedRoof(nativeBuilding,points.map(nativePoint),roofPoints.map(nativePoint));
    if(reconstructed){
      const patched=transformRoofPatches(reconstructed,{dx,dy,scale,baseZ});
      const value={...patched,officialId:building.officialId,sourceId:observation.sourceId,acquired:observation.acquired,
        sampleCount:patched.roofPoints.length,excludedCount:points.length-patched.roofPoints.length,
        meaning:'4h source-supported separate roof patches. Step positions are estimated within recorded return gaps; low-extension plane fits and near-edge interpolation regularize the seam. Main roof samples and supported high returns remain. Reconstructed local visual/occlusion envelope, not surveyed roof topology.'};
      cache.set(building,{source,value});return value;
    }
  }
  const envelope=localRoofEnvelope({footprint:ring,baseZ,roofZ:building.roofZ,roofPoints});
  const zs=envelope.boundary.map(p=>p[2]),sorted=zs.slice().sort((a,b)=>a-b);
  const value={roofPoints,edgeZ:quantile(sorted,.5),wallTopZ:Math.min(...zs),
    edgePoints:envelope.boundary,wallFaces:envelope.wallFaces,edges:envelope.edges,
    roofFaces:sampledRoofFaces(envelope.ring,roofPoints,quantile(sorted,.5),envelope.boundary),
    minZ:Math.min(...roofPoints.map(p=>p[2]),...zs),maxZ:Math.max(...roofPoints.map(p=>p[2]),...zs),
    officialId:building.officialId,sourceId:observation.sourceId,acquired:observation.acquired,
    sampleCount:roofPoints.length,excludedCount:points.length-roofPoints.length,method:filtered.method,
    meaning:'Sparse 2024 class-6 roof returns with a locally interpolated wall/roof seam; reconstructed local visual/occlusion envelope, not surveyed roof topology. Isolated returns and raised fixtures on dominant flat roofs are omitted.'};
  cache.set(building,{source,value});return value;
}

/** Interpolate the roof-wall seam on the closest measured facade edge. */
export function visualNeighborWallHeightAt(roof,x,y){
  if(!roof?.edges?.length)return Infinity;
  let nearest=null;
  for(const edge of roof.edges){
    const hit=segmentDistance(x,y,edge.points[0],edge.points.at(-1));
    if(!nearest||hit.distance<nearest.distance)nearest={...hit,edge};
  }
  return roofEdgeHeight(nearest.edge,nearest.t);
}

/** Decorative bays must not float above a newly resolved lower roof wing. */
export function clipFacadeToVisualRoof(panes,roof){
  if(!roof)return panes;
  return panes.filter(pane=>[-.5,0,.5].every(side=>{
    const x=pane.x+pane.ny*pane.width*side,y=pane.y-pane.nx*pane.width*side;
    return pane.z+pane.height/2+.08<visualNeighborWallHeightAt(roof,x,y);
  }));
}
