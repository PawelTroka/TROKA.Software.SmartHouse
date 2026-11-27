/** Quasi-static, two-axle ramp study. No surveyed basement/bumper/threshold
 * geometry is implied. The conservative underside is flat over the full car.
 * Site coordinates are [x,y,elevation]; longitudinal profile s runs inward.
 */
import {GARAGE_DEFAULTS,GARAGE_FIELDS,garageGeometryKey,upgradeSingleCarGarage} from './garage-options.js?v=1.36.0';

import {CYBERSTER_AWD} from './garage-vehicle.js?v=1.36.0';
import {getInteriorGarageConflicts} from './interior-plan.js?v=1.36.0';
export {CYBERSTER_AWD};
const cache=new WeakMap(),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const finite=(x,fallback)=>Number.isFinite(x)?x:fallback;
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0],sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const closed=points=>[...points,points[0]];
const ring=points=>points.length>1&&Math.hypot(...sub(points[0],points.at(-1)))<1e-7?points.slice(0,-1):points;
function options(settings={}){
  const out={...GARAGE_DEFAULTS,...upgradeSingleCarGarage(settings)};
  for(const [key,field] of Object.entries(GARAGE_FIELDS))out[key]=clamp(finite(out[key],field.value),field.min,field.max);
  return out;
}
function lineIntersection(p,d,a,b){
  const v=sub(b,a),den=cross(d,v);if(Math.abs(den)<1e-10)return null;
  return {s:cross(sub(a,p),v)/den,t:cross(sub(a,p),d)/den};
}

/** Cheap plan geometry; safe to call from hedge, diagram and cost code. */
export function garagePlanFrame(settings={},data){
  const supported=(data?.site?.id||settings.siteId||'sternicza-11')==='sternicza-11';
  if(!supported||!data?.site?.house?.footprint)return {supported:false,enabled:false};
  const s=options(settings),house=ring(data.site.house.cellarFootprint||data.site.house.footprint),boundary=ring(data.site.boundary);
  const streetIndex=Math.max(0,(data.site.boundaryNames||[]).findIndex(name=>name==='street'||name==='front'));
  const streetA=boundary[streetIndex],streetB=boundary[(streetIndex+1)%boundary.length];
  const frontIndex=house.reduce((best,a,i)=>(a[1]+house[(i+1)%house.length][1])/2<best.y
    ?{i,y:(a[1]+house[(i+1)%house.length][1])/2}:best,{i:0,y:Infinity}).i;
  const a=house[frontIndex],b=house[(frontIndex+1)%house.length],edge=sub(b,a),edgeLength=Math.hypot(...edge);
  const wallThickness=.2,clearWidth=s.garageRampWidth,outerWidth=clearWidth+2*wallThickness;
  const targetX=clamp(12,Math.min(a[0],b[0])+outerWidth/2+.3,Math.max(a[0],b[0])-outerWidth/2-.3);
  const t=clamp((targetX-a[0])/edge[0],0,1),portalPoint=[a[0]+edge[0]*t,a[1]+edge[1]*t];
  let direction=[-edge[1]/edgeLength,edge[0]/edgeLength];
  const centre=house.reduce((sum,p)=>[sum[0]+p[0]/house.length,sum[1]+p[1]/house.length],[0,0]);
  if(direction[0]*(centre[0]-portalPoint[0])+direction[1]*(centre[1]-portalPoint[1])<0)direction=direction.map(v=>-v);
  const normal=[-direction[1],direction[0]],hit=lineIntersection(portalPoint,direction,streetA,streetB);
  if(!hit||hit.s>=0||hit.t<0||hit.t>1)return {supported:true,enabled:false,error:'No straight connection to the mapped frontage'};
  const frontRun=-hit.s,start=portalPoint.map((v,i)=>v+direction[i]*hit.s);
  const at=(station,lateral=0)=>start.map((v,i)=>v+direction[i]*station+normal[i]*lateral);
  const backHits=house.map((p,i)=>lineIntersection(portalPoint,direction,p,house[(i+1)%house.length]))
    .filter(h=>h&&h.s>1e-5&&h.t>=-1e-7&&h.t<=1+1e-7);
  const houseDepth=Math.min(...backHits.map(h=>h.s));
  const insideRun=s.garageInsideRun,totalRun=frontRun+insideRun,roomRearS=frontRun+houseDepth-.3;
  // Each side starts on the actual frontage; a perpendicular rectangle would
  // cut a few millimetres into the street because the house is slightly skewed.
  const entrance=(lateral)=>{const p=at(0,lateral),h=lineIntersection(p,direction,streetA,streetB);return at(h?.s||0,lateral);};
  const footprint=(from,to,width,clipStreet=false)=>closed([
    clipStreet?entrance(-width/2):at(from,-width/2),at(to,-width/2),at(to,width/2),
    clipStreet?entrance(width/2):at(from,width/2),
  ]);
  const outerFootprint=footprint(0,totalRun,outerWidth,true),clearFootprint=footprint(0,totalRun,clearWidth,true);
  const spaces=s.garageSpaces,laneWidth=clearWidth/spaces,mirrorWidth=CYBERSTER_AWD.mirrorWidth,bodyWidth=CYBERSTER_AWD.width;
  // Equal-width, straight driving lanes. A parked second car never shares the
  // moving car's lane. These are closed-car envelopes, not door-opening areas.
  const laneOffsets=Array.from({length:spaces},(_,i)=>(i-(spaces-1)/2)*laneWidth);
  const parking={spaces,laneWidth,laneOffsets,movingLaneOffset:laneOffsets.at(-1),parkedLaneOffset:laneOffsets[0],
    mirrorWallClearance:(laneWidth-mirrorWidth)/2,bodyWallClearance:(laneWidth-bodyWidth)/2,
    betweenMirrors:laneWidth-mirrorWidth,betweenBodies:laneWidth-bodyWidth,
    wallAllowance:.3,betweenAllowance:.6,minimumWidth:spaces*(mirrorWidth+.6)};
  parking.widthPass=parking.mirrorWallClearance>=parking.wallAllowance-1e-8&&
    parking.betweenMirrors>=parking.betweenAllowance-1e-8;
  const frontY=x=>a[1]+(x-a[0])*edge[1]/edge[0],doorCenter=[9.16,frontY(9.16)];
  const westOuter=at(frontRun,outerWidth/2),requiresSideEntry=westOuter[0]<doorCenter[0]+1;
  let entryAccess=null;
  if(requiresSideEntry){
    const west=[7.40,frontY(7.40)],east=[9.84,frontY(9.84)],projection=1;
    const landingFootprint=closed([west,east,east.map((v,i)=>v-direction[i]*projection),west.map((v,i)=>v-direction[i]*projection)]);
    const lateral=point=>(point[0]-portalPoint[0])*normal[0]+(point[1]-portalPoint[1])*normal[1];
    entryAccess={proposed:true,doorCenter,landing:{footprint:landingFootprint,projection,thickness:.18,
      fromS:frontRun-projection,toS:frontRun,innerLateral:Math.min(lateral(west),lateral(east)),outerLateral:Math.max(lateral(west),lateral(east))},
      stairs:{landingX:7.40,tread:.32,maxRiser:.18,width:1,heading:'east'},pedestrianGateCenter:[5,streetA[1]]};
  }
  const gateWidth=outerWidth+.4,gate={a:entrance(-gateWidth/2),b:entrance(gateWidth/2),width:gateWidth};
  const cutout={x0:Math.min(...outerFootprint.map(p=>p[0])),y0:Math.min(...outerFootprint.map(p=>p[1])),
    x1:Math.max(...outerFootprint.map(p=>p[0])),y1:Math.max(...outerFootprint.map(p=>p[1]))};
  const registered=data.site.house.architecturalModel;
  const architecturalGarageBounds=registered?(()=>{
    const {origin,ex}=registered,localX=p=>-(p[0]-origin[0])*ex[0]-(p[1]-origin[1])*ex[1];
    const jambs=[localX(at(frontRun,-clearWidth/2)),localX(at(frontRun,clearWidth/2))];return{x0:Math.min(...jambs),x1:Math.max(...jambs)};
  })():null;
  return {supported:true,enabled:s.basementGarageEnabled===true,centerX:portalPoint[0],frontRun,facadeStation:frontRun,
    insideRun,totalRun,houseDepth,clearWidth,wallThickness,outerWidth,parking,entryAccess,gate,cutout,outerFootprint,clearFootprint,
    roomFootprint:footprint(frontRun,roomRearS,outerWidth),roomFloorFootprint:footprint(frontRun,roomRearS,clearWidth),roomRearS,
    entrancePoints:[entrance(-outerWidth/2),entrance(outerWidth/2)],
    axis:{start,end:portalPoint,direction,normal,frontRun,insideRun,totalRun},at,architecturalGarageBounds};
}

function makeDesign(totalRun,drop,bottomApron,topTransition,bottomTransition,streetZ=0){
  const curvedRun=totalRun-bottomApron,middle=Math.max(0,curvedRun-topTransition-bottomTransition);
  const signedGrade=drop/(middle+(topTransition+bottomTransition)/2),valleyStart=topTransition+middle;
  const valleyZ=streetZ-signedGrade*(topTransition/2+middle),floorZ=streetZ-drop;
  return {totalRun,drop,bottomApron,curvedRun,topTransition,bottomTransition,middle,signedGrade,peakGrade:Math.abs(signedGrade),streetZ,floorZ,valleyStart,
    pieces:[{lo:-Infinity,hi:0,a:0,b:0,c:streetZ},
      {lo:0,hi:topTransition,a:-signedGrade/(2*topTransition),b:0,c:streetZ},
      {lo:topTransition,hi:valleyStart,a:0,b:-signedGrade,c:streetZ+signedGrade*topTransition/2},
      {lo:valleyStart,hi:curvedRun,a:signedGrade/(2*bottomTransition),b:-signedGrade-signedGrade*valleyStart/bottomTransition,
        c:valleyZ+signedGrade*valleyStart+signedGrade*valleyStart*valleyStart/(2*bottomTransition)},
      {lo:curvedRun,hi:Infinity,a:0,b:0,c:floorZ}],breaks:[0,topTransition,valleyStart,curvedRun]};
}
function road(design,x){
  const p=design.pieces.find(p=>x<=p.hi)||design.pieces.at(-1);
  return {z:(p.a*x+p.b)*x+p.c,grade:2*p.a*x+p.b,curvature:2*p.a};
}
export function garageProfileAt(layout,station){return road(layout.design,station);}

/** Upper envelope of the road dilated by the circular tyre. The contact
 * coordinate solves x=u-r*f'(u)/sqrt(1+f'(u)^2), not z=f(x)+r.
 * These smooth design curves have radius well above the tyre radius.
 */
export function garageWheelContact(design,x,radius){
  let lo=x-radius,hi=x+radius,u=x;
  for(let i=0;i<20;i++){
    const p=road(design,u),q=Math.sqrt(1+p.grade*p.grade),f=u-radius*p.grade/q-x;
    if(Math.abs(f)<1e-11)break;
    if(f>0)hi=u;else lo=u;
    const derivative=1-radius*p.curvature/(q*q*q),next=u-f/derivative;
    u=next>lo&&next<hi?next:(lo+hi)/2;
  }
  const p=road(design,u),q=Math.sqrt(1+p.grade*p.grade);
  return {x,z:p.z+radius/q,contactX:u,contactZ:p.z,grade:p.grade,radius};
}
function axlePose(design,vehicle,rearS,reverse=false){
  const direction=reverse?-1:1,rear=garageWheelContact(design,rearS,vehicle.rearRadius),dr=vehicle.frontRadius-vehicle.rearRadius,W=vehicle.wheelbase;
  let theta=0,front;
  for(let i=0;i<12;i++){
    const st=Math.sin(theta),ct=Math.cos(theta),x=rearS+direction*(W*ct-dr*st),z=rear.z+W*st+dr*ct;
    front=garageWheelContact(design,x,vehicle.frontRadius);const residual=z-front.z;
    if(Math.abs(residual)<1e-10)break;
    theta-=residual/(W*ct-dr*st+direction*front.grade*(W*st+dr*ct));
  }
  const sin=Math.sin(theta),cos=Math.cos(theta);
  front=garageWheelContact(design,rearS+direction*(W*cos-dr*sin),vehicle.frontRadius);
  const at=(u,h)=>({s:rearS+direction*(u*cos-h*sin),z:rear.z+u*sin+h*cos});
  return {rearS,frontS:front.x,rear,front,theta,pitchRadians:theta,direction,at};
}
const polynomial=(coeff,x)=>coeff.reduce((sum,c)=>sum*x+c,0);
function quadraticRoots(a,b,c){
  if(Math.abs(a)<1e-15)return Math.abs(b)<1e-15?[]:[-c/b];
  const d=b*b-4*a*c;if(d<0)return [];
  const root=Math.sqrt(Math.max(0,d));return [(-b-root)/(2*a),(-b+root)/(2*a)];
}
function cubicRootsInInterval(coeff,lo,hi){
  const [a,b,c]=coeff,cuts=[lo,...quadraticRoots(3*a,2*b,c).filter(x=>x>lo&&x<hi),hi].sort((x,y)=>x-y),out=[];
  for(let i=0;i<cuts.length-1;i++){
    let left=cuts[i],right=cuts[i+1],fl=polynomial(coeff,left),fr=polynomial(coeff,right);
    if(Math.abs(fl)<1e-10)out.push(left);if(Math.abs(fr)<1e-10)out.push(right);
    if(fl*fr>=0)continue;
    for(let j=0;j<35;j++){const middle=(left+right)/2,fm=polynomial(coeff,middle);if(fl*fm<=0){right=middle;fr=fm;}else{left=middle;fl=fm;}}
    out.push((left+right)/2);
  }
  return out;
}
function nearestRoadPoint(design,point){
  const vertical=Math.abs(point.z-road(design,point.s).z),lo=point.s-vertical-1e-6,hi=point.s+vertical+1e-6;
  let best={distance:vertical,s:point.s,z:road(design,point.s).z};
  for(const p of design.pieces){
    const a=Math.max(lo,p.lo),b=Math.min(hi,p.hi);if(a>b)continue;
    const candidates=[a,b];
    if(Math.abs(p.a)<1e-15)candidates.push(clamp((point.s+p.b*(point.z-p.c))/(1+p.b*p.b),a,b));
    else candidates.push(...cubicRootsInInterval([2*p.a*p.a,3*p.a*p.b,p.b*p.b+2*p.a*(p.c-point.z)+1,p.b*(p.c-point.z)-point.s],a,b));
    for(const x of candidates){const z=(p.a*x+p.b)*x+p.c,distance=Math.hypot(x-point.s,z-point.z);if(distance<best.distance)best={distance,s:x,z};}
  }
  return best;
}

/** Exact line/parabola clearance for a fixed rigid pose. End-to-curve
 * minima use all stationary roots, while interior minima use parallel tangents.
 */
function undersideClearance(design,vehicle,pose,exact=true){
  const h=vehicle.clearance-vehicle.rearRadius,u0=-vehicle.rearOverhang,u1=vehicle.wheelbase+vehicle.frontOverhang;
  const A=pose.at(u0,h),B=pose.at(u1,h),lo=Math.min(A.s,B.s),hi=Math.max(A.s,B.s);
  const dx=B.s-A.s,dz=B.z-A.z,length2=dx*dx+dz*dz,m=dz/dx,b=A.z-m*A.s,normal=Math.sqrt(1+m*m);
  const candidates=[lo,hi,...design.breaks.filter(x=>x>=lo&&x<=hi)];
  for(const p of design.pieces)if(Math.abs(p.a)>1e-15){const x=(m-p.b)/(2*p.a);if(x>=p.lo&&x<=p.hi&&x>=lo&&x<=hi)candidates.push(x);}
  let vertical=Infinity,limitingS=lo;
  for(const x of candidates){const gap=m*x+b-road(design,x).z;if(gap<vertical){vertical=gap;limitingS=x;}}
  if(!exact||vertical<=0)return {clearance:vertical/normal,vertical,limitingS,bodyU:u0+(limitingS-A.s)/dx*(u1-u0)};
  let best={clearance:Infinity,vertical,limitingS,bodyU:u0};
  for(const [point,u] of [[A,u0],[B,u1]]){const near=nearestRoadPoint(design,point);if(near.distance<best.clearance)best={...best,clearance:near.distance,limitingS:near.s,bodyU:u};}
  for(const p of design.pieces){
    const xs=[p.lo,p.hi].filter(Number.isFinite);
    if(Math.abs(p.a)>1e-15){const x=(m-p.b)/(2*p.a);if(x>=p.lo&&x<=p.hi)xs.push(x);}
    for(const x of xs){const z=road(design,x).z,t=((x-A.s)*dx+(z-A.z)*dz)/length2;
      if(t<0||t>1)continue;const distance=(m*x+b-z)/normal;
      if(distance<best.clearance)best={...best,clearance:distance,limitingS:x,bodyU:u0+t*(u1-u0)};
    }
  }
  return best;
}
function travelRange(layout,reverse){
  const v=layout.vehicle;
  return reverse?[-v.rearOverhang-.3,layout.roomRearS-v.rearOverhang-.3]
    :[-v.wheelbase-v.frontOverhang-.3,layout.roomRearS-v.wheelbase-v.frontOverhang-.3];
}
function overheadClearances(layout,pose,laneOffset){
  const v=layout.vehicle,A=pose.at(-v.rearOverhang,v.height-v.rearRadius),B=pose.at(v.wheelbase+v.frontOverhang,v.height-v.rearRadius);
  const lo=Math.max(Math.min(A.s,B.s),layout.frontRun),hi=Math.min(Math.max(A.s,B.s),layout.roomRearS);
  const z=x=>A.z+(B.z-A.z)*(x-A.s)/(B.s-A.s);
  const soffit=lo>hi?Infinity:layout.ceilingZ-Math.max(z(lo),z(hi));
  const crossesDoor=Math.min(A.s,B.s)<=layout.frontRun&&Math.max(A.s,B.s)>=layout.frontRun;
  const doorTop=Math.min(layout.ceilingZ,road(layout.design,layout.frontRun).z+2.10);
  const portal=crossesDoor?doorTop-z(layout.frontRun):Infinity;
  const landing=layout.entryAccess?.landing;
  const lanes=Number.isFinite(laneOffset)?[laneOffset]:layout.parking?.laneOffsets||[0];
  let entryLanding=Infinity,entryLandingStation=null;
  if(landing&&lanes.some(offset=>offset+v.mirrorWidth/2>landing.innerLateral&&offset-v.mirrorWidth/2<landing.outerLateral)){
    const landingLo=Math.max(Math.min(A.s,B.s),landing.fromS),landingHi=Math.min(Math.max(A.s,B.s),landing.toS);
    if(landingLo<=landingHi){entryLandingStation=z(landingLo)>=z(landingHi)?landingLo:landingHi;entryLanding=landing.soffitZ-z(entryLandingStation);}
  }
  const candidates=[{element:'garage ceiling',clearance:soffit,station:lo<=hi?(z(lo)>=z(hi)?lo:hi):null},
    {element:'garage doorway',clearance:portal,station:crossesDoor?layout.frontRun:null},
    {element:'entry landing',clearance:entryLanding,station:entryLandingStation}];
  const limiting=candidates.reduce((a,b)=>a.clearance<=b.clearance?a:b);
  return {minimum:limiting.clearance,soffit,portal,entryLanding,entryLandingStation,limiting};
}
function overheadClearance(layout,pose,laneOffset){return overheadClearances(layout,pose,laneOffset).minimum;}
function goldenMinimum(fn,lo,hi,iterations=22){
  const ratio=(Math.sqrt(5)-1)/2;let x1=hi-ratio*(hi-lo),x2=lo+ratio*(hi-lo),y1=fn(x1),y2=fn(x2);
  for(let i=0;i<iterations;i++)if(y1<y2){hi=x2;x2=x1;y2=y1;x1=hi-ratio*(hi-lo);y1=fn(x1);}else{lo=x1;x1=x2;y1=y2;x2=lo+ratio*(hi-lo);y2=fn(x2);}
  return y1<y2?x1:x2;
}
function sweep(layout,reverse,{step=.035,exact=true,refine=true}={}){
  const [start,end]=travelRange(layout,reverse),count=Math.max(1,Math.ceil((end-start)/step)),samples=[];
  let minimumClearance=Infinity,minimumVerticalClearance=Infinity,minimumOverheadClearance=Infinity,minimumPortalClearance=Infinity,minimumSoffitClearance=Infinity,minimumEntryLandingClearance=Infinity,best=null,criticalOverhead=null,criticalEntryLanding=null,posesChecked=0,portalPosesChecked=0,coveredPosesChecked=0,entryLandingPosesChecked=0;
  const evaluate=rearS=>{
    const pose=axlePose(layout.design,layout.vehicle,rearS,reverse),clear=undersideClearance(layout.design,layout.vehicle,pose,exact);
    const overhead=overheadClearances(layout,pose);
    posesChecked++;minimumVerticalClearance=Math.min(minimumVerticalClearance,clear.vertical);
    if(overhead.minimum<minimumOverheadClearance){minimumOverheadClearance=overhead.minimum;criticalOverhead={rearS,station:overhead.limiting.station,element:overhead.limiting.element,reverse};}
    minimumPortalClearance=Math.min(minimumPortalClearance,overhead.portal);minimumSoffitClearance=Math.min(minimumSoffitClearance,overhead.soffit);
    if(overhead.entryLanding<minimumEntryLandingClearance){minimumEntryLandingClearance=overhead.entryLanding;criticalEntryLanding={rearS,station:overhead.entryLandingStation,reverse};}
    if(Number.isFinite(overhead.portal))portalPosesChecked++;if(Number.isFinite(overhead.soffit))coveredPosesChecked++;
    if(Number.isFinite(overhead.entryLanding))entryLandingPosesChecked++;
    if(clear.clearance<minimumClearance){minimumClearance=clear.clearance;best={rearS,clear,pose};}
    return clear.clearance;
  };
  for(let i=0;i<=count;i++){const x=start+(end-start)*i/count;samples.push({x,value:evaluate(x)});}
  if(refine)for(let i=1;i<samples.length-1;i++)if(samples[i].value<=samples[i-1].value&&samples[i].value<=samples[i+1].value
    &&(samples[i].value<samples[i-1].value-1e-8||samples[i].value<samples[i+1].value-1e-8)
    &&samples[i].value<minimumClearance+.004){const x=goldenMinimum(evaluate,samples[i-1].x,samples[i+1].x);evaluate(x);}
  const u=best.clear.bodyU,limitingPart=u<0?'rear-overhang':u>layout.vehicle.wheelbase?'front-overhang':'underbody';
  return {minimumClearance,minimumVerticalClearance,minimumOverheadClearance,minimumPortalClearance,minimumSoffitClearance,minimumEntryLandingClearance,criticalOverhead,criticalEntryLanding,portalPosesChecked,coveredPosesChecked,entryLandingPosesChecked,criticalRearS:best.rearS,
    criticalProgress:(best.rearS-start)/(end-start),limitingPart,limitingStation:best.clear.limitingS,posesChecked,step,reverse};
}
function optimizeDesign(base,settings){
  const run=base.totalRun-settings.garageBottomApron,drop=base.drop,limit=settings.garageMaxGrade/100,minCurve=.35;
  if(drop<=0||drop/(run-minCurve)>limit){
    const design=makeDesign(base.totalRun,drop,settings.garageBottomApron,minCurve,minCurve,base.streetZ);
    return {...design,optimization:{method:'minimum transitions; requested gradient is infeasible',evaluations:0}};
  }
  const largestTotal=Math.min(run,2*(run-drop/limit));
  let best=null,evaluations=0;
  const assess=(total,ratio)=>{
    if(total<2*minCurve||total>run+1e-9)return;
    const top=total*ratio,bottom=total-top;if(top<minCurve||bottom<minCurve)return;
    const design=makeDesign(base.totalRun,drop,settings.garageBottomApron,top,bottom,base.streetZ);
    if(design.peakGrade>limit+1e-9)return;
    const layout={...base,design},score=Math.min(sweep(layout,false,{step:.17,exact:false,refine:false}).minimumClearance,
      sweep(layout,true,{step:.17,exact:false,refine:false}).minimumClearance);evaluations++;
    if(!best||score>best.score)best={score,total,ratio,design};
  };
  assess(largestTotal,.5);
  for(const fraction of [.75,.85,.93,1])for(let i=0;i<=10;i++)assess(largestTotal*fraction,.22+i*.024);
  for(const [dt,dr] of [[.07,.024],[.025,.008]]){
    const centre=best;
    for(let i=-2;i<=2;i++)for(let j=-2;j<=2;j++)assess(clamp(centre.total+i*largestTotal*dt/2,2*minCurve,largestTotal),clamp(centre.ratio+j*dr/2,.15,.65));
  }
  return {...best.design,optimization:{method:'bounded parabolic-transition search; two orientations, refined final sweep',evaluations}};
}

export function garageLayout(settings={},data,{terrainAt}={}){
  const s=options(settings),frame=garagePlanFrame(s,data),vehicle={...CYBERSTER_AWD,clearance:s.garageClearanceMm/1000};
  if(!frame.supported||!frame.enabled)return {...frame,vehicle,car:vehicle,assessment:null};
  if(typeof terrainAt!=='function')throw new TypeError('garageLayout requires the original terrainAt(x,y,data) callback');
  const streetZ=terrainAt(...frame.axis.start,data),livingFloorZ=data.site.floorReference.z+finite(settings.floorHeight,1.2);
  const ceilingZ=livingFloorZ-s.garageSlabThickness,floorZ=ceilingZ-s.garageClearHeight-s.garageExtraDepth,drop=streetZ-floorZ;
  const key=garageGeometryKey(s)+'|'+[streetZ,livingFloorZ,frame.frontRun].join('|');
  // Building overrides wrap the same immutable site/terrain in a fresh data
  // object. Reuse the expensive sweep while those geometry inputs stay stable.
  let bucket=cache.get(data.site);
  if(!bucket||bucket.terrain!==data.terrain||bucket.coordinates!==data.coordinates||bucket.terrainAt!==terrainAt){
    bucket={terrain:data.terrain,coordinates:data.coordinates,terrainAt,entries:new Map()};cache.set(data.site,bucket);
  }
  const entries=bucket.entries;if(entries.has(key))return entries.get(key);
  const layout={...frame,vehicle,car:vehicle,settings:s,streetZ,livingFloorZ,ceilingZ,floorZ,drop};
  layout.documentedInterior={source:'IMG_8721.jpeg + IMG_8724.jpeg',existingFloorRelative:-2,existingClearHeight:1.70,existingSlab:.30,proposedFloorRelative:floorZ-livingFloorZ,additionalLowering:Math.max(0,livingFloorZ-floorZ-2),conflicts:getInteriorGarageConflicts({...s,architecturalGarageBounds:frame.architecturalGarageBounds})};
  if(frame.entryAccess)layout.entryAccess={...frame.entryAccess,landing:{...frame.entryAccess.landing,
    topZ:livingFloorZ,soffitZ:livingFloorZ-frame.entryAccess.landing.thickness}};
  layout.design=optimizeDesign(layout,s);
  const at=station=>{const xy=frame.at(station),p=road(layout.design,station);return {s:station,x:xy[0],y:xy[1],z:p.z,grade:p.grade,groundZ:terrainAt(...xy,data)};};
  const stations=[0,frame.frontRun,frame.totalRun,...layout.design.breaks];
  for(let x=0;x<frame.totalRun;x+=.12)stations.push(x);
  layout.profile=[...new Set(stations)].sort((a,b)=>a-b).map(at);
  layout.sideProfile=[at(-vehicle.length-.5),...layout.profile,at(frame.roomRearS)];
  const portalBottom=road(layout.design,frame.frontRun).z;
  layout.portal={center:frame.axis.end,a:frame.at(frame.frontRun,-frame.clearWidth/2),b:frame.at(frame.frontRun,frame.clearWidth/2),
    width:frame.clearWidth,bottomZ:portalBottom,topZ:Math.min(ceilingZ,portalBottom+2.10),ceilingZ,
    availableHeight:ceilingZ-portalBottom,clearHeight:Math.min(ceilingZ-portalBottom,2.10),assumedDoorClearHeight:2.10};
  const forward=sweep(layout,false),reverse=sweep(layout,true),minimumClearance=Math.min(forward.minimumClearance,reverse.minimumClearance);
  const requiredMargin=s.garageReserveMm/1000,numericalAllowance=.001,conservativeClearance=minimumClearance-numericalAllowance;
  const parkingFlatLength=frame.roomRearS-Math.max(frame.frontRun,layout.design.curvedRun);
  const entryLandingHeadroom=layout.entryAccess?layout.entryAccess.landing.soffitZ-Math.max(
    road(layout.design,layout.entryAccess.landing.fromS).z,road(layout.design,layout.entryAccess.landing.toS).z):Infinity;
  const minCoveredHeadroom=Math.min(ceilingZ-portalBottom,entryLandingHeadroom);
  const minimumOverheadClearance=Math.min(forward.minimumOverheadClearance,reverse.minimumOverheadClearance);
  const gradeWithinLimit=layout.design.peakGrade<=s.garageMaxGrade/100+1e-8,parkingFits=parkingFlatLength>=vehicle.length+.6,structuralHeadroomPass=minCoveredHeadroom>=2.2-1e-6;
  const widthBenchmarkPass=frame.clearWidth>=3-1e-8,doorBenchmarkPass=layout.portal.clearHeight>=2-1e-8,parkingWidthPass=frame.parking.widthPass;
  const warnings=['The supplied historical section shows a cellar floor at −2.00 m, 0.30 m ground-floor structure and 1.70 m clear height. Present conditions, foundations, drainage and vehicle bumper geometry still need measurement.',
    'The entire underside is conservatively flat at the selected level-road clearance, including both overhangs; tyre radii are nominal size geometry.',
    'Quasi-static rigid-body geometry excludes braking, suspension travel, tyre deflection, snow, ruts and construction tolerances.',
    'The road approach and crossing are assumed flush and level. The required drainage/containment threshold detail is unresolved; a 30 mm edge is not included.',
    'The 25% gradient, 3 m access width and 2.20 m structural headroom figures are transitional design benchmarks; project applicability needs confirmation.',
    'The 2.10 m door opening is an assumption without surveyed lintel or door-gear geometry; overhead checks use a conservative full-height closed-car envelope.',
    `The two-car plan uses two Cyberster envelopes, each 4.535 m long, 1.913 m wide at the body and 2.110 m across its mirrors. The comparison assumes closed doors. Door opening and street turning manoeuvres remain unverified.`,
    'Parking width is compared with a chosen 0.30 m mirror-to-wall allowance and, for two cars, 0.60 m between mirror envelopes. These are planning allowances, not a surveyed door-opening or accessibility assessment.'];
  if(layout.entryAccess)warnings.push('The wider ramp requires proposed side-return entry stairs and a 1.0 m cantilevered landing at the existing front door. Its 0.18 m slab underside is included in both driving sweeps; its structure has not been designed.');
  if(layout.documentedInterior.conflicts.length)warnings.push('The straight two-car approach conflicts with retained stairs / chimney structure in the supplied basement plan. The clearance sweep does not remove these obstructions or establish a viable conversion.');
  if(layout.documentedInterior.additionalLowering>0)warnings.push(`The proposed floor is ${layout.documentedInterior.additionalLowering.toFixed(2)} m below the documented cellar floor; foundation and structural design are unresolved.`);
  if(frame.insideRun>0)warnings.push('The bottom curve continues inside the existing house and requires structural and basement-layout design.');
  if(!structuralHeadroomPass)warnings.push('The raised indoor ramp locally leaves less than the 2.20 m structural headroom benchmark.');
  if(layout.design.peakGrade>.25+1e-6)warnings.push('The peak gradient exceeds the 25% individual-garage benchmark.');
  if(!parkingFits)warnings.push('The remaining covered flat bay does not fit the car with 0.30 m allowance at each end.');
  if(!widthBenchmarkPass)warnings.push('The selected clear width is below the 3 m access-roadway benchmark.');
  if(!parkingWidthPass)warnings.push(`The selected width does not leave the chosen lateral allowances for both closed-car envelopes.`);
  if(!doorBenchmarkPass)warnings.push('Available portal height is below the 2 m garage-door benchmark.');
  if(drop<=0)warnings.push('The proposed floor is at or above the street; this is not a descending basement ramp.');
  const clearancePass=conservativeClearance>=requiredMargin,geometryPass=gradeWithinLimit&&parkingFits&&structuralHeadroomPass&&widthBenchmarkPass&&parkingWidthPass&&doorBenchmarkPass&&drop>0&&minimumOverheadClearance>=requiredMargin+numericalAllowance;
  layout.assessment={forward,reverse,minimumClearance,minimumVerticalClearance:Math.min(forward.minimumVerticalClearance,reverse.minimumVerticalClearance),
    requiredMargin,numericalAllowance,conservativeClearance,reserveRemaining:minimumClearance-requiredMargin,passes:clearancePass&&geometryPass,
    assessmentScope:'Closed-car ramp geometry only; existing cellar structure is assessed separately.',structuralRouteClear:layout.documentedInterior.conflicts.length===0,conversionPass:clearancePass&&geometryPass&&layout.documentedInterior.conflicts.length===0,
    clearancePass,geometryPass,gradeWithinLimit,parkingFits,parkingWidthPass,structuralHeadroomPass,widthBenchmarkPass,doorBenchmarkPass,parkingFlatLength,minCoveredHeadroom,entryLandingHeadroom,minimumOverheadClearance,
    minimumEntryLandingClearance:Math.min(forward.minimumEntryLandingClearance,reverse.minimumEntryLandingClearance),
    criticalOverhead:forward.minimumOverheadClearance<=reverse.minimumOverheadClearance?forward.criticalOverhead:reverse.criticalOverhead,
    criticalEntryLanding:forward.minimumEntryLandingClearance<=reverse.minimumEntryLandingClearance?forward.criticalEntryLanding:reverse.criticalEntryLanding,
    posesChecked:forward.posesChecked+reverse.posesChecked,portalPosesChecked:forward.portalPosesChecked+reverse.portalPosesChecked,coveredPosesChecked:forward.coveredPosesChecked+reverse.coveredPosesChecked,
    entryLandingPosesChecked:forward.entryLandingPosesChecked+reverse.entryLandingPosesChecked,
    limitingDirection:forward.minimumClearance<=reverse.minimumClearance?'forward':'reverse',
    status:minimumClearance<0?'contact':!geometryPass?'geometry-limit':!clearancePass?'reserve-shortfall':'conditional-clearance',
    thresholdResolved:false,roadApproachSurveyed:false,warnings};
  layout.parkingFlatLength=parkingFlatLength;
  entries.set(key,layout);if(entries.size>12)entries.delete(entries.keys().next().value);return layout;
}

export function garageVehiclePose(layout,progress=.4,reverse=false,laneOffset=layout?.parking?.movingLaneOffset??0){
  if(!layout?.enabled||!layout.design)return null;
  const range=travelRange(layout,reverse),p=clamp(finite(progress,.4),0,1),rearS=range[0]+p*(range[1]-range[0]);
  const pose=axlePose(layout.design,layout.vehicle,rearS,reverse),v=layout.vehicle,axis=layout.axis.direction,n=layout.axis.normal;
  const cos=Math.cos(pose.theta),sin=Math.sin(pose.theta),direction=pose.direction;
  const lateralOffset=finite(laneOffset,layout.parking?.movingLaneOffset??0);
  const point=(station,z)=>{const xy=layout.at(station,lateralOffset);return {s:station,x:xy[0],y:xy[1],z};};
  const rearAxle=point(rearS,pose.rear.z),frontAxle=point(pose.frontS,pose.front.z),origin=[rearAxle.x,rearAxle.y,rearAxle.z];
  const basis={forward:[axis[0]*direction*cos,axis[1]*direction*cos,sin],up:[-axis[0]*direction*sin,-axis[1]*direction*sin,cos],lateral:[n[0]*direction,n[1]*direction,0]};
  const localToWorld=(u,lateral,h)=>origin.map((value,i)=>value+basis.forward[i]*u+basis.lateral[i]*lateral+basis.up[i]*h);
  const bodyPolygon=[[-v.rearOverhang,v.clearance-v.rearRadius],[v.wheelbase+v.frontOverhang,v.clearance-v.rearRadius],
    [v.wheelbase+v.frontOverhang,v.height-v.rearRadius],[-v.rearOverhang,v.height-v.rearRadius]];
  const sidePoint=([u,h])=>{const pt=pose.at(u,h);return point(pt.s,pt.z);};
  const underbody=bodyPolygon.slice(0,2).map(sidePoint),roof=[bodyPolygon[3],bodyPolygon[2]].map(sidePoint),wheels=[];
  for(const axle of ['rear','front'])for(const side of [-1,1]){const front=axle==='front';wheels.push({axle,side,
    center:localToWorld(front?v.wheelbase:0,side*(front?v.frontTrack:v.rearTrack)/2,front?v.frontRadius-v.rearRadius:0),
    radius:front?v.frontRadius:v.rearRadius,width:front?v.frontTyreWidth:v.rearTyreWidth});}
  const clear=undersideClearance(layout.design,v,pose,true);
  return {progress:p,reverse,laneOffset:lateralOffset,rearS,frontS:pose.frontS,rearAxle,frontAxle,axles:{rear:rearAxle,front:frontAxle},origin,basis,heading:basis.forward,
    localToWorld,bodyPolygon,underbody,roof,wheels,sideWheels:[{s:rearS,z:pose.rear.z,radius:v.rearRadius},{s:pose.frontS,z:pose.front.z,radius:v.frontRadius}],
    pitchRadians:pose.theta,pitchDegrees:pose.theta*180/Math.PI,minimumClearance:clear.clearance,minimumVerticalClearance:clear.vertical,
    minimumOverheadClearance:overheadClearance(layout,pose,lateralOffset),contact:clear.clearance<0,reserveSatisfied:clear.clearance>=layout.assessment.requiredMargin+layout.assessment.numericalAllowance};
}
