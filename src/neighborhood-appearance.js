import {neighborhoodAppearanceData} from './neighborhood-appearance-data.js?v=1.39.0';
import {visualNeighborRoof,clipFacadeToVisualRoof} from './observed-neighbor-roofs.js?v=1.39.0';

const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const openRing=ring=>ring?.length>1&&Math.hypot(ring[0][0]-ring.at(-1)[0],ring[0][1]-ring.at(-1)[1])<1e-7?ring.slice(0,-1):ring||[];
const profiles=new Map(neighborhoodAppearanceData.profiles.map(profile=>[profile.officialId,profile]));

export {neighborhoodAppearanceData};

/** Official identity, rather than a local integer ID, gates this Sternicza evidence. */
export function observedBuildingAppearance(building){
  return profiles.get(building?.officialId)||null;
}

export function appearanceFacadeEdges(building){
  const ring=openRing(building?.footprint);
  if(ring.length<3)return [];
  const winding=Math.sign(ring.reduce((area,a,i)=>{const b=ring[(i+1)%ring.length];return area+a[0]*b[1]-b[0]*a[1];},0))||1;
  return ring.map((a,side)=>{
    const b=ring[(side+1)%ring.length],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
    const nx=winding*dy/length,ny=-winding*dx/length;
    // Orient local facade u along the plane's +X basis. Reversing a footprint
    // ring must not mirror the observed asymmetric balcony/window pattern.
    const forward=dx*ny-dy*nx>=0;
    return {a:forward?a:b,b:forward?b:a,side,length,nx,ny,angle:Math.atan2(nx,ny),
      direction:Math.abs(nx)>Math.abs(ny)?nx>0?'east':'west':ny>0?'rear':'front'};
  }).filter(edge=>Number.isFinite(edge.nx)&&edge.length>1e-6);
}

const dot=(p,x,y)=>p[0]*x+p[1]*y;
const samePoint=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-6;

/** Cadastral vertices can subdivide one straight wall. Keep the source edges
 * for blank-wall evidence, but do not restart a bay pattern at every vertex. */
function facadeRuns(edges){
  const unused=new Set(edges),runs=[];
  const parallel=(a,b)=>a.direction===b.direction&&a.nx*b.nx+a.ny*b.ny>Math.cos(Math.PI/180);
  const flat=segments=>{
    const a=segments[0].a,b=segments.at(-1).b,dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
    return length>1e-6&&segments.every(edge=>[edge.a,edge.b].every(p=>Math.abs((p[0]-a[0])*dy-(p[1]-a[1])*dx)/length<.05));
  };
  while(unused.size){
    const seed=unused.values().next().value,segments=[seed];unused.delete(seed);
    for(let changed=true;changed;){
      changed=false;
      for(const edge of unused){
        if(samePoint(edge.b,segments[0].a)&&parallel(edge,segments[0])&&flat([edge,...segments])){
          segments.unshift(edge);unused.delete(edge);changed=true;break;
        }
        if(samePoint(segments.at(-1).b,edge.a)&&parallel(segments.at(-1),edge)&&flat([...segments,edge])){
          segments.push(edge);unused.delete(edge);changed=true;break;
        }
      }
    }
    const a=segments[0].a,b=segments.at(-1).b,dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
    const nx=-dy/length,ny=dx/length;
    runs.push({a,b,length,nx,ny,angle:Math.atan2(nx,ny),direction:seed.direction,segments});
  }
  return runs;
}

/** One observed profile describes a whole facing elevation, including parallel
 * walls separated by a setback. Its u-coordinate spans that elevation once;
 * openings are subsequently projected back onto their actual wall segments. */
export function appearanceFacadeElevations(building){
  const runs=facadeRuns(appearanceFacadeEdges(building)),result=[];
  for(const direction of ['front','rear','east','west']){
    const candidates=runs.filter(run=>run.direction===direction);
    if(!candidates.length)continue;
    const dominant=candidates.slice().sort((a,b)=>b.length-a.length||a.a[0]-b.a[0]||a.a[1]-b.a[1])[0];
    const members=candidates.filter(run=>run.nx*dominant.nx+run.ny*dominant.ny>Math.cos(3*Math.PI/180));
    const nx=dominant.nx,ny=dominant.ny,tx=ny,ty=-nx;
    const values=members.flatMap(run=>[dot(run.a,tx,ty),dot(run.b,tx,ty)]),start=Math.min(...values),end=Math.max(...values);
    result.push({direction,nx,ny,tx,ty,start,end,length:end-start,members,profiled:true});
    // Angled returns sharing a compass sector are not the same facade plane.
    for(const run of candidates.filter(run=>!members.includes(run))){
      const tx=run.ny,ty=-run.nx,start=dot(run.a,tx,ty),end=dot(run.b,tx,ty);
      result.push({direction,nx:run.nx,ny:run.ny,tx,ty,start,end,length:end-start,members:[run],profiled:false});
    }
  }
  return result;
}

function facadeLocation(facade,u){
  const coordinate=facade.start+facade.length*u,candidates=[];
  for(const member of facade.members){
    const start=dot(member.a,facade.tx,facade.ty),end=dot(member.b,facade.tx,facade.ty);
    if(coordinate<start-1e-7||coordinate>end+1e-7)continue;
    for(const edge of member.segments){
      const a=dot(edge.a,facade.tx,facade.ty),b=dot(edge.b,facade.tx,facade.ty);
      if(coordinate<a-1e-7||coordinate>b+1e-7)continue;
      const t=Math.max(0,Math.min(1,(coordinate-a)/(b-a))),x=edge.a[0]+(edge.b[0]-edge.a[0])*t,y=edge.a[1]+(edge.b[1]-edge.a[1])*t;
      candidates.push({edge,member,t,x,y,start,end,coordinate,depth:x*facade.nx+y*facade.ny});
    }
  }
  // At an overlapping projection, the outer wall hides an inner recess wall.
  return candidates.sort((a,b)=>b.depth-a.depth||a.start-b.start)[0]||null;
}

export function isRecordedBlankFacade(edge,building,observation){
  if(!observation||observation.officialId!==building.officialId)return false;
  const dx=finite(building.adjustment?.dx),dy=finite(building.adjustment?.dy);
  return (observation.windowlessEdges||[]).some(recorded=>{
    if(!Array.isArray(recorded.a)||!Array.isArray(recorded.b))return false;
    const vx=recorded.b[0]-recorded.a[0],vy=recorded.b[1]-recorded.a[1],length=Math.hypot(vx,vy);
    if(length<1e-8)return false;
    return [edge.a,edge.b].every(p=>{
      const x=p[0]-dx-recorded.a[0],y=p[1]-dy-recorded.a[1],along=(x*vx+y*vy)/length;
      return Math.abs(x*vy-y*vx)/length<1e-6&&along>=-1e-6&&along<=length+1e-6;
    });
  });
}

function blankAtOpening(location,facade,width,building,observation){
  return location.member.segments.some(edge=>{
    if(!isRecordedBlankFacade(edge,building,observation))return false;
    const a=dot(edge.a,facade.tx,facade.ty),b=dot(edge.b,facade.tx,facade.ty);
    return location.coordinate+width/2>a+1e-7&&location.coordinate-width/2<b-1e-7;
  });
}

function geometryContext(building,origin){
  const ring=openRing(building.footprint),base=finite(building.baseZ,NaN),roof=finite(building.roofZ,NaN);
  if(ring.length<3||!Number.isFinite(base)||!Number.isFinite(roof)||roof<=base)return null;
  const center=ring.reduce((sum,p)=>[sum[0]+p[0]/ring.length,sum[1]+p[1]/ring.length],[0,0]);
  return {ring,base,roof,height:roof-base,scale:Math.max(.2,finite(building.adjustment?.scaleZ,1)),
    distance:Math.hypot(center[0]-origin[0],center[1]-origin[1])};
}

function windowOnEdge(building,edge,t,z,width,height,floor,column,distance){
  return {buildingId:building.id??building.officialId,side:edge.side,floor,column,
    x:edge.a[0]+(edge.b[0]-edge.a[0])*t,y:edge.a[1]+(edge.b[1]-edge.a[1])*t,z,
    nx:edge.nx,ny:edge.ny,angle:edge.angle,width,height,detailed:distance<105,
    shade:Math.abs(finite(building.index)*13+floor*7+column+edge.side*3)%7};
}

function windowOnFacade(building,facade,t,z,width,height,floor,column,distance,blank){
  const location=facadeLocation(facade,t);
  if(!location)return null;
  // A window may cross an artificial collinear vertex, but not a real setback.
  const memberClearance=2*Math.min(location.coordinate-location.start,location.end-location.coordinate)-.08;
  width=Math.min(width,memberClearance);
  if(width<.2||blankAtOpening(location,facade,width,building,blank))return null;
  const pane=windowOnEdge(building,location.edge,location.t,z,width,height,floor,column,distance);
  pane.facadeDirection=facade.direction;pane.facadeLength=facade.length;pane.facadeU=t;
  pane.facadeClearance=memberClearance;
  return pane;
}

function bayWidthLimit(bays,column,length){
  const t=bays[column],left=bays.filter(u=>u<t),right=bays.filter(u=>u>t);
  return Math.max(.2,Math.min(2*t,2*(1-t),left.length?t-Math.max(...left):Infinity,right.length?Math.min(...right)-t:Infinity)*length-.1);
}

function balconyAt(facade,column,floor){
  if(Array.isArray(facade.balconies))return facade.balconies.find(item=>item.column===column&&(item.floors||[]).includes(floor))||null;
  return floor>=finite(facade.balconyStartFloor,1)&&(facade.balconyBays||[]).includes(column)?{}:null;
}

/** Null leaves an unobserved building on the existing generic renderer. For a
 * partially observed house, only its observed elevation replaces generic bays.
 * The same panes continue into the existing day/night window batches. */
export function observedFacadePlacements(building,origin,distanceLimit=160,blankWallObservation=null){
  const profile=observedBuildingAppearance(building);
  if(!profile||!Object.keys(profile.facades||{}).length)return null;
  const context=geometryContext(building,origin);
  if(!context||context.distance>distanceLimit)return [];
  const {base,roof,scale,distance}=context,windows=[];
  const floors=Math.min(24,Math.max(0,finite(profile.floorCount,Math.floor(((roof-base)/scale-2.695)/2.9)+1)));
  const rise=finite(profile.floorRise,2.9),firstWindow=finite(profile.firstWindowHeight,1.9),windowHeight=finite(profile.windowHeight,1.35);
  for(const elevation of appearanceFacadeElevations(building)){
    if(elevation.length<1.85)continue;
    const facade=elevation.profiled?profile.facades[elevation.direction]:null;
    const interpreted=facade&&Array.isArray(facade.bays);
    const count=Math.min(40,Math.max(1,Math.floor(elevation.length/3.5)));
    const bays=interpreted?facade.bays:Array.from({length:count},(_,i)=>(i+.5)/count);
    for(let floor=0;floor<floors;floor++)for(let column=0;column<bays.length;column++){
      if(interpreted&&(facade.rowBays?.[floor]&&!facade.rowBays[floor].includes(column)||
        facade.omitWindows?.some(opening=>opening.floor===floor&&opening.column===column)))continue;
      const t=bays[column],stair=interpreted&&column===facade.stairBay;
      const balcony=interpreted&&balconyAt(facade,column,floor);
      const openingHeight=interpreted?finite(facade.bayHeights?.[column],windowHeight):windowHeight;
      const height=(balcony?finite(balcony.openingHeight,2.10):stair?openingHeight*.82:openingHeight)*scale;
      const rowZ=base+floor*rise*scale,floorZ=rowZ+finite(profile.firstFloorHeight)*scale;
      const centerHeight=interpreted?finite(facade.bayCenterHeights?.[column],firstWindow):firstWindow;
      const z=balcony?floorZ+.1*scale+height/2:rowZ+centerHeight*scale;
      const width=Math.min(stair?.68:interpreted?finite(facade.bayWidths?.[column],profile.windowWidth):finite(profile.windowWidth,1.1),bayWidthLimit(bays,column,elevation.length));
      if(z+height/2+.12*scale>=roof||z-height/2-.12*scale<=base)continue;
      const pane=windowOnFacade(building,elevation,t,z,width,height,floor,column,distance,blankWallObservation);
      if(!pane)continue;
      pane.appearanceEvidence=interpreted?'user-reference-estimate':'illustrative';
      if(interpreted&&Number.isInteger(facade.bayMullions?.[column]))pane.mullions=Math.max(0,Math.min(6,facade.bayMullions[column]));
      if(balcony){pane.balcony=true;pane.balconyFloorZ=floorZ;pane.balconySpec=balcony;pane.facadeBayCount=bays.length;}
      windows.push(pane);
    }
    // Basement slots are separate evidence, never an extra residential floor.
    // Only elevations where the small openings can be read receive this row.
    const basement=interpreted&&facade.basementWindows;
    if(basement)for(const [column,t] of basement.bays.entries()){
      const z=base+basement.centerHeight*scale,height=basement.height*scale;
      if(z-height/2<=base||z+height/2>=roof)continue;
      const pane=windowOnFacade(building,elevation,t,z,basement.width,height,-1,column,distance,blankWallObservation);
      if(!pane)continue;
      pane.appearanceEvidence='user-reference-estimate';pane.basement=true;windows.push(pane);
    }
  }
  return windows;
}

const facadeRect=(edge,u0,u1,z0,z1,color,extra={})=>({x:edge.a[0]+(edge.b[0]-edge.a[0])*(u0+u1)/2,
  y:edge.a[1]+(edge.b[1]-edge.a[1])*(u0+u1)/2,z:(z0+z1)/2,width:edge.length*(u1-u0),height:z1-z0,
  nx:edge.nx,ny:edge.ny,angle:edge.angle,color,...extra});

function elevationRects(elevation,u0,u1,z0,z1,color,extra){
  const low=elevation.start+u0*elevation.length,high=elevation.start+u1*elevation.length,rects=[];
  for(const member of elevation.members)for(const edge of member.segments){
    const a=dot(edge.a,elevation.tx,elevation.ty),b=dot(edge.b,elevation.tx,elevation.ty),start=Math.max(low,a),end=Math.min(high,b);
    if(end-start>.01)rects.push(facadeRect(edge,(start-a)/(b-a),(end-a)/(b-a),z0,z1,color,extra));
  }
  return rects;
}

/** Finish-only panels and balcony batches never mutate an analytical building. */
export function neighborhoodAppearanceLayout(buildings,data,{origin=data?.site?.rearMidpoint||[10,18],distanceLimit=175}={}){
  const result={panels:[],balconies:[],doors:[],entryCanopies:[],parapets:[],profiles:[]};
  for(const building of buildings||[]){
    const profile=observedBuildingAppearance(building),context=profile&&geometryContext(building,origin);
    if(!context||context.distance>distanceLimit)continue;
    const {base,roof,height,scale}=context,blank=data?.facadeOverrides?.[building.id],measuredRoof=visualNeighborRoof(building,data);
    result.profiles.push({buildingId:building.id,officialId:building.officialId,name:profile.observedName,confidence:profile.confidence});
    for(const elevation of appearanceFacadeElevations(building)){
      const facade=elevation.profiled?profile.facades[elevation.direction]:null;
      // The body itself supplies a measured-roof house's facade colour. A flat
      // rectangular colour overlay would otherwise protrude through a gable.
      if(facade&&!measuredRoof){
        result.panels.push(...elevationRects(elevation,0,1,base+.025,roof-.025,facade.color||profile.facadeColor,{offset:.009}));
        for(const [layer,panel] of (facade.panels||[]).entries())
          result.panels.push(...elevationRects(elevation,panel.u0,panel.u1,base+height*panel.z0,base+height*panel.z1,panel.color,{offset:.014+layer*.002}));
      }
      result.panels.push(...elevationRects(elevation,0,1,base+.01,base+Math.min(.38*scale,height*.1),'#8d9085',{offset:.019}));
      // The cap is placed below the mapped top. No invented extra skyline height.
      if(!measuredRoof)result.parapets.push(...elevationRects(elevation,0,1,roof-.14*scale,roof,'#7b7d73',{depth:.14,offset:.025}));
      if(!facade?.entrance)continue;
      const entranceU=finite(facade.entranceU,.5),entranceWidth=finite(facade.entranceWidth,1.35);
      const entranceTop=base+finite(facade.entranceTopHeight,2.15)*scale;
      const entranceBottom=base+finite(facade.entranceBottomHeight,.08)*scale;
      const pane=windowOnFacade(building,elevation,entranceU,(entranceBottom+entranceTop)/2,entranceWidth,entranceTop-entranceBottom,0,0,context.distance,blank);
      if(!pane)continue;
      const center={...pane,color:'#565c55',offset:.025};
      result.doors.push(center);
      if(facade.entranceCanopy!==false)
        result.entryCanopies.push({...center,z:entranceTop+.23*scale,width:2.5,height:.16,depth:1.1,offset:.5,color:'#a9aca4'});
    }
    for(const pane of clipFacadeToVisualRoof(observedFacadePlacements(building,origin,distanceLimit,blank)||[],measuredRoof)){
      if(!pane.balcony)continue;
      const facade=profile.facades[pane.facadeDirection],spec=pane.balconySpec||{};
      const width=Math.min(finite(spec.width,Math.min(2.04,pane.facadeLength/pane.facadeBayCount*.86)),pane.facadeClearance);
      const type=spec.type==='recessed'?'recessed':'projecting';
      result.balconies.push({...pane,width,depth:finite(spec.depth,.9),type,
        slabZ:pane.balconyFloorZ-.06*scale,railHeight:finite(spec.railHeight,.83)*scale,color:spec.color||facade.balconyColor||'#c9c7b6'});
      if(type==='recessed'){
        // A flush, shaded aperture communicates a loggia without inventing a
        // projecting floor. Its unmeasured interior depth is not an occluder.
        result.panels.push({...pane,width,height:pane.height+.1*scale,z:pane.balconyFloorZ+(pane.height+.1*scale)/2,
          offset:.021,color:'#41453f'});
      }
    }
  }
  return result;
}
