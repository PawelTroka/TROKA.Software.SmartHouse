/**
 * Sternicza's photo-informed roof envelope, shared by rendering and sunlight.
 *
 * Two main planes were fitted to the supplied 2024 roof returns after excluding
 * the two high chimney clusters. RMS fit errors are 0.0372 m / 0.0222 m. The
 * lowest return is part-way down a slope, so it must not be imposed as a flat
 * eave on every facade. The exact mapped footprint remains the roof boundary.
 *
 * The photograph clearly places a secondary gable on the street-facing door
 * elevation, to the viewer's right (lower site x). A restrained front gable
 * therefore overrides a limited part of the clean front-plane LiDAR evidence.
 * The 12.62 m secondary ridge, widths and slopes are photo-informed estimates,
 * not surveyed dimensions. Report its residuals separately: the source-plane
 * fit error must not be represented as the error of this locally altered roof.
 * Chimney caps use the actual two high-return clusters (13.34 m / 13.13 m).
 */
import {architecturalRoofEnvelope} from './architectural-roof.js?v=1.33.0';
const cache=new WeakMap(),EPS=1e-8;
const openRing=ring=>ring?.length>1&&Math.hypot(ring[0][0]-ring.at(-1)[0],ring[0][1]-ring.at(-1)[1])<EPS?ring.slice(0,-1):ring||[];
const value=(plane,p)=>plane[0]*p[0]+plane[1]*p[1]+plane[2];
const planarArea=ring=>Math.abs(ring.reduce((sum,p,i)=>sum+p[0]*ring[(i+1)%ring.length][1]-ring[(i+1)%ring.length][0]*p[1],0))/2;
const facesOfPrism=(ring,bottom,top)=>{
  const faces=[];
  for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length];faces.push([[...a,bottom],[...b,bottom],[...b,top]],[[...a,bottom],[...b,top],[...a,top]]);
  }
  for(let i=1;i<ring.length-1;i++)faces.push([[...ring[0],top],[...ring[i],top],[...ring[i+1],top]]);
  return faces;
};
function clip(ring,line,positive){
  const result=[];
  for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],da=value(line,a)*(positive?1:-1),db=value(line,b)*(positive?1:-1);
    if(da>=-EPS)result.push(a);
    if((da>EPS&&db<-EPS)||(da<-EPS&&db>EPS)){const t=da/(da-db);result.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
  }
  return result.filter((p,i)=>i===0||Math.hypot(p[0]-result[i-1][0],p[1]-result[i-1][1])>EPS);
}

export function sterniczaRoofEnvelope(house){
  if(cache.has(house))return cache.get(house);
  if(house.architecturalModel){const envelope=architecturalRoofEnvelope(house);cache.set(house,envelope);return envelope;}
  const ring=openRing(house.footprint).map(p=>p.slice(0,2));
  const mainFront=[.00929205,.55661563,5.85086242],mainRear=[-.0114799946,-.576041893,20.0356836];
  const crossCentre=6.7,crossRidge=12.62,crossSlope=.68;
  const crossLeft=[crossSlope,0,crossRidge-crossSlope*crossCentre],crossRight=[-crossSlope,0,crossRidge+crossSlope*crossCentre];
  // Capping the secondary roof at the rear main plane joins its ridge into the
  // main ridge, and prevents any invented cross-gable on the garden elevation.
  const planes=[mainFront,mainRear,crossLeft,crossRight];
  const choose=p=>{
    const main=value(mainFront,p)<=value(mainRear,p)?mainFront:mainRear;
    const cross=[crossLeft,crossRight,mainRear].reduce((a,b)=>value(a,p)<=value(b,p)?a:b);
    return value(main,p)>=value(cross,p)?main:cross;
  };
  const heightAt=(x,y)=>value(choose([x,y]),[x,y]);
  const sourceHeightAt=(x,y)=>Math.min(value(mainFront,[x,y]),value(mainRear,[x,y]));
  const lines=[];
  for(let i=0;i<planes.length;i++)for(let j=i+1;j<planes.length;j++)lines.push(planes[i].map((a,k)=>a-planes[j][k]));
  let pieces=[ring];
  for(const line of lines)pieces=pieces.flatMap(piece=>[clip(piece,line,true),clip(piece,line,false)].filter(p=>p.length>=3&&planarArea(p)>1e-8));
  const surfaceFaces=[];
  for(const piece of pieces){
    const centroid=piece.reduce((p,q)=>[p[0]+q[0]/piece.length,p[1]+q[1]/piece.length],[0,0]),plane=choose(centroid);
    const vertices=piece.map(p=>[...p,value(plane,p)]);
    for(let i=1;i<vertices.length-1;i++)surfaceFaces.push([vertices[0],vertices[i],vertices[i+1]]);
  }
  const edges=[],boundary=[],wallFaces=[];
  for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]),fractions=[0,1];
    for(const line of lines){const da=value(line,a),db=value(line,b);if(da*db<-EPS){const t=da/(da-db);if(t>EPS&&t<1-EPS)fractions.push(t);}}
    const unique=[...new Set(fractions.map(t=>t.toFixed(12)))].map(Number).sort((a,b)=>a-b);
    const points=unique.map(t=>{const p=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];return [...p,heightAt(...p)];});
    edges.push({index:i,length,points,fractions:unique});boundary.push(...points.slice(0,-1));
    for(let j=0;j<points.length-1;j++){
      const p=points[j],q=points[j+1],p0=[p[0],p[1],house.baseZ],q0=[q[0],q[1],house.baseZ];wallFaces.push([p0,q0,q],[p0,q,p]);
    }
  }
  const chimneys=[{id:'west',x0:7.66,y0:11.42,width:1.03,depth:.52,topZ:13.34},{id:'east',x0:10.78,y0:10.91,width:.58,depth:.55,topZ:13.13}].map(c=>{
    const footprint=[[c.x0,c.y0],[c.x0+c.width,c.y0],[c.x0+c.width,c.y0+c.depth],[c.x0,c.y0+c.depth]];
    const baseZ=Math.min(...footprint.map(p=>heightAt(...p)))-.025;
    return {...c,footprint,baseZ,faces:facesOfPrism(footprint,baseZ,c.topZ)};
  });
  const sourceSamples=(house.roofPoints||[]).map(p=>Array.isArray(p)?p:[p.x,p.y,p.z]);
  const frontSamples=sourceSamples.filter(p=>p[1]<12&&p[2]<12.95),rearSamples=sourceSamples.filter(p=>p[1]>12.5);
  const overriddenSamples=frontSamples.filter(p=>heightAt(p[0],p[1])-sourceHeightAt(p[0],p[1])>.01);
  const rms=points=>Math.sqrt(points.reduce((sum,p)=>sum+(heightAt(p[0],p[1])-p[2])**2,0)/Math.max(1,points.length));
  const override={facade:'street-front',viewerSide:'right',siteSide:'lower-x',centreX:crossCentre,ridgeZ:crossRidge,
    affectedSourceSampleCount:overriddenSamples.length,
    maximumSourceSampleRaiseM:Math.max(0,...overriddenSamples.map(p=>heightAt(p[0],p[1])-sourceHeightAt(p[0],p[1]))),
    renderedFrontSampleRmsM:rms(frontSamples),renderedRearSampleRmsM:rms(rearSamples)};
  const envelope={ring,planes,edges,boundary,wallFaces,surfaceFaces,chimneys,
    roofFaces:[...surfaceFaces,...chimneys.flatMap(c=>c.faces)],heightAt,sourceHeightAt,
    eavesZ:Math.min(...boundary.map(p=>p[2])),ridgeZ:Math.max(...surfaceFaces.flat().map(p=>p[2])),topZ:13.34,
    provenance:{main:'Two planes fitted to source roof returns; exact mapped footprint retained.',
      frontFitRmsM:.037159,rearFitRmsM:.022220,
      crossGable:'The photo establishes a street-front cross-gable on the viewer-right / lower-x side. Its fitted size overrides local LiDAR evidence; front residuals below include that explicit conflict.',
      photoOverride:override,chimneys:'Two high-return clusters retain source maximum elevations.'}};
  cache.set(house,envelope);return envelope;
}

/** Interpolate the (non-uniformly spaced) vertices of one gabled wall top. */
export function photoRoofEdgeHeight(edge,distance){
  const fraction=Math.max(0,Math.min(1,distance/edge.length));
  for(let i=0;i<edge.fractions.length-1;i++)if(fraction<=edge.fractions[i+1]+EPS){
    const t=(fraction-edge.fractions[i])/(edge.fractions[i+1]-edge.fractions[i]);return edge.points[i][2]*(1-t)+edge.points[i+1][2]*t;
  }
  return edge.points.at(-1)[2];
}
