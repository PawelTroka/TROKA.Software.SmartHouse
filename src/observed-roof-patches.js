import {sampledRoofFaces} from './roof-mesh.js?v=1.39.0';

const EPS=1e-7;
const openRing=ring=>Math.hypot(ring[0][0]-ring.at(-1)[0],ring[0][1]-ring.at(-1)[1])<EPS?ring.slice(0,-1):ring.slice();
const area=ring=>Math.abs(ring.reduce((sum,a,i)=>{const b=ring[(i+1)%ring.length];return sum+a[0]*b[1]-a[1]*b[0];},0))/2;
const pointKey=p=>p.slice(0,2).map(v=>v.toFixed(6)).join(':');
const edgeKey=(a,b)=>[pointKey(a),pointKey(b)].sort().join('|');

/** Least-squares plane, centred before solving to avoid coordinate cancellation.
 * Fits describe the retained measurements; they never supply an arbitrary peak. */
export function fitObservedRoofPlane(points){
  if(points.length<4)return null;
  const center=points.reduce((c,p)=>c.map((v,i)=>v+p[i]/points.length),[0,0,0]);
  let xx=0,yy=0,xy=0,xz=0,yz=0;
  for(const p of points){const x=p[0]-center[0],y=p[1]-center[1],z=p[2]-center[2];xx+=x*x;yy+=y*y;xy+=x*y;xz+=x*z;yz+=y*z;}
  const determinant=xx*yy-xy*xy;if(Math.abs(determinant)<1e-8)return null;
  const a=(xz*yy-yz*xy)/determinant,b=(yz*xx-xz*xy)/determinant,c=center[2]-a*center[0]-b*center[1];
  const residuals=points.map(p=>Math.abs(a*p[0]+b*p[1]+c-p[2]));
  return {a,b,c,rmse:Math.sqrt(residuals.reduce((sum,r)=>sum+r*r,0)/points.length),maxResidual:Math.max(...residuals),sampleCount:points.length};
}
const onPlane=(plane,x,y)=>plane.a*x+plane.b*y+plane.c;

function clip(ring,axis,value,keepLow){
  const result=[];
  for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],insideA=keepLow?a[axis]<=value+EPS:a[axis]>=value-EPS,insideB=keepLow?b[axis]<=value+EPS:b[axis]>=value-EPS;
    if(insideA)result.push(a.slice());
    if(insideA!==insideB){const t=(value-a[axis])/(b[axis]-a[axis]),p=a.map((v,k)=>v+(b[k]-v)*t);p[axis]=value;result.push(p);}
  }
  return result.filter((p,i)=>!i||Math.hypot(p[0]-result[i-1][0],p[1]-result[i-1][1])>EPS);
}

function components(points){
  const unseen=new Set(points),groups=[];
  while(unseen.size){
    const seed=unseen.values().next().value,group=[seed];unseen.delete(seed);
    for(let i=0;i<group.length;i++)for(const p of unseen)
      if(Math.hypot(p[0]-group[i][0],p[1]-group[i][1])<3.5){group.push(p);unseen.delete(p);}
    groups.push(group);
  }
  return groups;
}

function segmentCoordinates(p,a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(length*length);
  return {t,distance:Math.abs(dx*(p[1]-a[1])-dy*(p[0]-a[0]))/length};
}

function cornerHeight(p,points,plane){
  if(plane)return onPlane(plane,...p);
  const nearest=points.map(q=>({p:q,d:Math.hypot(q[0]-p[0],q[1]-p[1])})).sort((a,b)=>a.d-b.d);
  // An eave measurement at a mapped corner wins over a distant higher plane.
  if(nearest[0].d<.5)return nearest[0].p[2];
  const fit=fitObservedRoofPlane(nearest.slice(0,6).map(q=>q.p));
  if(fit&&fit.rmse<.15&&fit.maxResidual<.3&&Math.hypot(fit.a,fit.b)<2)
    return Math.max(Math.min(...nearest.slice(0,6).map(q=>q.p[2]))-.75,
      Math.min(Math.max(...nearest.slice(0,6).map(q=>q.p[2]))+.75,onPlane(fit,...p)));
  return nearest[0].p[2];
}

function patchEnvelope(ring,points,plane){
  const corners=ring.map(p=>[...p,cornerHeight(p,points,plane)]),edges=[],boundary=[];
  for(let i=0;i<ring.length;i++){
    const a=corners[i],b=corners[(i+1)%ring.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const nearby=points.map(p=>({p,...segmentCoordinates(p,a,b)}))
      .filter(q=>q.t>EPS&&q.t<1-EPS&&q.distance<=.8).sort((p,q)=>p.t-q.t);
    const support=[];
    for(const candidate of nearby){
      const previous=support.at(-1);
      // Prefer the return nearest the wall when several cells cover one short
      // edge interval; otherwise an interior slope can lower a measured gable.
      if(previous&&(candidate.t-previous.t)*length<.35){if(candidate.distance<previous.distance)support[support.length-1]=candidate;}
      else support.push(candidate);
    }
    const knots=[{t:0,z:a[2]},...support.map(q=>({t:q.t,z:q.p[2]})),{t:1,z:b[2]}];
    const heightAt=t=>{
      if(plane)return onPlane(plane,a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t);
      let j=1;while(j<knots.length-1&&knots[j].t<t)j++;
      const left=knots[j-1],right=knots[j],fraction=(t-left.t)/(right.t-left.t);
      return left.z+(right.z-left.z)*fraction;
    };
    // Uniform subedges preserve roofEdgeHeight's interpolation contract. Both
    // sides of an internal step use the same subdivisions in reverse order.
    const count=Math.max(1,Math.ceil(length/.5)),edgePoints=[];
    for(let j=0;j<=count;j++){
      const t=j/count;edgePoints.push(j===0?a:j===count?b:[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,heightAt(t)]);
    }
    const edge={index:i,length,points:edgePoints};edges.push(edge);boundary.push(...edgePoints.slice(0,-1));
  }
  return {edges,boundary};
}

/** Targeted 4h reconstruction. The caller gates the official building identity.
 * Two separated low clusters are accepted only when the source supports a
 * planar extension and a narrow, non-overlapping spatial gap to the main roof.
 * All classification happens in native coordinates before exploratory scaling. */
export function reconstructSteppedRoof(building,rawPoints,filteredPoints){
  const ring=openRing(building.footprint);
  if(rawPoints.length<60||ring.length<4)return null;
  const heights=rawPoints.map(p=>p[2]).sort((a,b)=>a-b);
  let gap=null;
  for(let i=8;i<Math.floor(heights.length*.3);i++){
    const size=heights[i+1]-heights[i];if(!gap||size>gap.size)gap={size,cut:(heights[i]+heights[i+1])/2};
  }
  if(!gap||gap.size<.6)return null;
  const low=rawPoints.filter(p=>p[2]<gap.cut),groups=components(low);
  if(groups.length!==2||groups.some(group=>group.length<8))return null;
  const averageX=group=>group.reduce((sum,p)=>sum+p[0],0)/group.length;
  groups.sort((a,b)=>averageX(a)-averageX(b));
  const [west,front]=groups,mainRaw=rawPoints.filter(p=>p[2]>=gap.cut);
  const westPlane=fitObservedRoofPlane(west),frontPlane=fitObservedRoofPlane(front);
  if([westPlane,frontPlane].some(plane=>!plane||plane.rmse>.15||plane.maxResidual>.3))return null;
  const xBracket=[Math.max(...west.map(p=>p[0])),Math.min(...mainRaw.map(p=>p[0]))];
  const yBracket=[Math.max(...front.map(p=>p[1])),Math.min(...mainRaw.map(p=>p[1]))];
  if([xBracket,yBracket].some(([a,b])=>b-a<=0||b-a>1.5))return null;
  const xCut=(xBracket[0]+xBracket[1])/2,yCut=(yBracket[0]+yBracket[1])/2;
  const main=filteredPoints.filter(p=>p[2]>=gap.cut).map(p=>p.slice());
  // The generic neighbour filter discarded 4h's measured rear-east eave by
  // comparing it with a nearby raised gable. Retain a raw main-roof return at
  // an actual footprint corner; interior low outliers remain filtered.
  for(const p of mainRaw)if(ring.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<.5)&&!main.some(q=>pointKey(q)===pointKey(p)))main.push(p.slice());
  const definitions=[
    {id:'west-lower',ring:clip(ring,0,xCut,true),points:west,plane:westPlane},
    {id:'front-lower',ring:clip(clip(ring,0,xCut,false),1,yCut,true),points:front,plane:frontPlane},
    {id:'main',ring:clip(clip(ring,0,xCut,false),1,yCut,false),points:main,plane:null}
  ];
  if(definitions.some(patch=>patch.ring.length<3)||Math.abs(definitions.reduce((sum,patch)=>sum+area(patch.ring),0)-area(ring))>1e-6)return null;
  const patches=definitions.map(patch=>{
    const envelope=patchEnvelope(patch.ring,patch.points,patch.plane);
    const edgeZ=envelope.boundary.reduce((sum,p)=>sum+p[2],0)/envelope.boundary.length;
    const roofFaces=sampledRoofFaces(patch.ring,patch.points,edgeZ,envelope.boundary);
    return {...patch,edgePoints:envelope.boundary,edges:envelope.edges,roofFaces};
  });
  const allEdges=new Map();
  for(const patch of patches)for(const edge of patch.edges){
    const key=edgeKey(edge.points[0],edge.points.at(-1));if(!allEdges.has(key))allEdges.set(key,[]);allEdges.get(key).push({patch:patch.id,edge});
  }
  const edges=[],wallFaces=[],wallSegments=[],stepFaces=[],steps=[];
  for(const matches of allEdges.values()){
    if(matches.length===1){
      const edge=matches[0].edge;edges.push(edge);
      for(let i=0;i<edge.points.length-1;i++){
        wallSegments.push([edge.points[i],edge.points[i+1]]);
      }
      continue;
    }
    if(matches.length!==2)return null;
    const mean=edge=>edge.points.reduce((sum,p)=>sum+p[2],0)/edge.points.length;
    matches.sort((a,b)=>mean(b.edge)-mean(a.edge));
    const [higher,lower]=matches,upper=higher.edge.points,lowerPoints=lower.edge.points.slice().reverse();
    if(upper.length!==lowerPoints.length||upper.some((p,i)=>Math.hypot(p[0]-lowerPoints[i][0],p[1]-lowerPoints[i][1])>1e-6||p[2]<=lowerPoints[i][2]))return null;
    const faces=[];
    for(let i=0;i<upper.length-1;i++){
      const a=lowerPoints[i],b=lowerPoints[i+1],c=upper[i+1],d=upper[i];faces.push([a,b,c],[a,c,d]);
    }
    stepFaces.push(...faces);
    steps.push({higherPatch:higher.patch,lowerPatch:lower.patch,upper,lower:lowerPoints,faces});
  }
  if(steps.length!==2)return null;
  // A lower eave meeting a taller exterior wall creates an additional vertex
  // on that wall's vertical edge. Preserve it on both surfaces to avoid a
  // geometrically closed but topologically unmatched T-junction.
  const verticalBreaks=new Map();
  for(const step of steps)for(const i of [0,step.upper.length-1]){
    const key=pointKey(step.upper[i]);if(!verticalBreaks.has(key))verticalBreaks.set(key,[]);
    verticalBreaks.get(key).push(step.lower[i][2],step.upper[i][2]);
  }
  for(const [a,b] of wallSegments){
    const a0=[a[0],a[1],building.baseZ],b0=[b[0],b[1],building.baseZ];
    const breaks=p=>[...new Set(verticalBreaks.get(pointKey(p))||[])].filter(z=>z>building.baseZ+EPS&&z<p[2]-EPS).sort((x,y)=>x-y).map(z=>[p[0],p[1],z]);
    const aBreaks=breaks(a),bBreaks=breaks(b);
    if(!aBreaks.length&&!bBreaks.length){wallFaces.push([a0,b0,b],[a0,b,a]);continue;}
    const perimeter=[a0,b0,...bBreaks,b,a,...aBreaks.reverse()];
    const center=perimeter.reduce((sum,p)=>sum.map((v,i)=>v+p[i]/perimeter.length),[0,0,0]);
    for(let i=0;i<perimeter.length;i++)wallFaces.push([center,perimeter[i],perimeter[(i+1)%perimeter.length]]);
  }
  wallFaces.push(...stepFaces);
  const edgePoints=edges.flatMap(edge=>edge.points),roofPoints=patches.flatMap(patch=>patch.points),roofFaces=patches.flatMap(patch=>patch.roofFaces);
  return {patches,steps,edges,edgePoints,roofPoints,roofFaces,wallFaces,stepFaces,
    edgeZ:edgePoints.reduce((sum,p)=>sum+p[2],0)/edgePoints.length,wallTopZ:Math.min(...edgePoints.map(p=>p[2])),
    minZ:Math.min(...roofPoints.map(p=>p[2]),...edgePoints.map(p=>p[2])),maxZ:Math.max(...roofPoints.map(p=>p[2]),...edgePoints.map(p=>p[2])),
    splitEvidence:{heightGap:gap.size,heightCut:gap.cut,westBracket:xBracket,frontBracket:yBracket,westStepX:xCut,frontStepY:yCut},
    method:'three supported roof patches; measured edge profiles and vertical wall transitions'};
}

/** Apply the same translation and vertical scale as the parent building only
 * after patch classification, fits and triangulation have been completed. */
export function transformRoofPatches(roof,{dx=0,dy=0,scale=1,baseZ}){
  const elevation=z=>baseZ+(z-baseZ)*scale,point=p=>[p[0]+dx,p[1]+dy,elevation(p[2])];
  const face=f=>f.map(point),edge=e=>({...e,points:e.points.map(point)});
  return {...roof,roofPoints:roof.roofPoints.map(point),roofFaces:roof.roofFaces.map(face),wallFaces:roof.wallFaces.map(face),stepFaces:roof.stepFaces.map(face),
    edges:roof.edges.map(edge),edgePoints:roof.edgePoints.map(point),
    edgeZ:elevation(roof.edgeZ),wallTopZ:elevation(roof.wallTopZ),minZ:elevation(roof.minZ),maxZ:elevation(roof.maxZ),
    patches:roof.patches.map(({plane,...patch})=>({...patch,nativePlane:plane,ring:patch.ring.map(p=>[p[0]+dx,p[1]+dy]),points:patch.points.map(point),edgePoints:patch.edgePoints.map(point),edges:patch.edges.map(edge),roofFaces:patch.roofFaces.map(face)})),
    steps:roof.steps.map(step=>({...step,upper:step.upper.map(point),lower:step.lower.map(point),faces:step.faces.map(face)})),
    nativeSplitEvidence:roof.splitEvidence,splitEvidence:{...roof.splitEvidence,heightGap:roof.splitEvidence.heightGap*scale,heightCut:elevation(roof.splitEvidence.heightCut),westBracket:roof.splitEvidence.westBracket.map(x=>x+dx),frontBracket:roof.splitEvidence.frontBracket.map(y=>y+dy),westStepX:roof.splitEvidence.westStepX+dx,frontStepY:roof.splitEvidence.frontStepY+dy}};
}
