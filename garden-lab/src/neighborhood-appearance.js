import {neighborhoodAppearanceData} from './neighborhood-appearance-data.js?v=1.31.0&rev=20261123-reference';
import {visualNeighborRoof} from './observed-neighbor-roofs.js?v=1.31.0&rev=20261124-resort';

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
  }).filter(edge=>Number.isFinite(edge.nx)&&edge.length>.1);
}

export function isRecordedBlankFacade(edge,building,observation){
  if(!observation||observation.officialId!==building.officialId)return false;
  const dx=finite(building.adjustment?.dx),dy=finite(building.adjustment?.dy);
  const matches=(p,q)=>Array.isArray(q)&&Math.hypot(p[0]-dx-q[0],p[1]-dy-q[1])<1e-6;
  return (observation.windowlessEdges||[]).some(recorded=>(matches(edge.a,recorded.a)&&matches(edge.b,recorded.b))||(matches(edge.a,recorded.b)&&matches(edge.b,recorded.a)));
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

/** Null leaves an unobserved building on the existing generic renderer. For a
 * partially observed house, only its observed elevation replaces generic bays.
 * The same panes continue into the existing day/night window batches. */
export function observedFacadePlacements(building,origin,distanceLimit=160,blankWallObservation=null){
  const profile=observedBuildingAppearance(building);
  if(!profile||!Object.keys(profile.facades||{}).length)return null;
  const context=geometryContext(building,origin);
  if(!context||context.distance>distanceLimit)return [];
  const {base,roof,scale,distance}=context,windows=[];
  for(const edge of appearanceFacadeEdges(building)){
    if(edge.length<1.85||isRecordedBlankFacade(edge,building,blankWallObservation))continue;
    const facade=profile.facades[edge.direction];
    // Concave house wings should not repeat a full front elevation on a tiny return.
    const interpreted=facade&&edge.length>=5.5;
    const count=Math.min(40,Math.max(1,Math.floor(edge.length/3.5)));
    const bays=interpreted?facade.bays:Array.from({length:count},(_,i)=>(i+.5)/count);
    const floors=interpreted?profile.floorCount:Math.min(24,Math.max(0,Math.floor(((roof-base)/scale-2.695)/2.9)+1));
    const windowHeight=(interpreted?profile.windowHeight:1.35)*scale;
    for(let floor=0;floor<floors;floor++)for(let column=0;column<bays.length;column++){
      if(interpreted&&(facade.rowBays?.[floor]&&!facade.rowBays[floor].includes(column)||
        facade.omitWindows?.some(opening=>opening.floor===floor&&opening.column===column)))continue;
      const t=bays[column],stair=interpreted&&column===facade.stairBay;
      const balcony=interpreted&&floor>=finite(facade.balconyStartFloor,1)&&(facade.balconyBays||[]).includes(column);
      const height=balcony?2.10*scale:stair?windowHeight*.82:windowHeight;
      const rowZ=base+floor*(interpreted?profile.floorRise:2.9)*scale;
      const floorZ=rowZ+(interpreted?finite(profile.firstFloorHeight):0)*scale;
      const z=balcony?floorZ+1.15*scale:rowZ+(interpreted?profile.firstWindowHeight:1.9)*scale;
      const width=Math.min(stair?.68:interpreted?finite(facade.bayWidths?.[column],profile.windowWidth):1.1,edge.length/bays.length*.55);
      if(z+height/2+.12*scale>=roof||z-height/2-.12*scale<=base)continue;
      const pane=windowOnEdge(building,edge,t,z,width,height,floor,column,distance);
      pane.appearanceEvidence=interpreted?'user-reference-estimate':'illustrative';
      if(balcony){pane.balcony=true;pane.balconyFloorZ=floorZ;}
      windows.push(pane);
    }
    // Basement slots are separate evidence, never an extra residential floor.
    // Only elevations where the small openings can be read receive this row.
    const basement=interpreted&&facade.basementWindows;
    if(basement)for(const [column,t] of basement.bays.entries()){
      const z=base+basement.centerHeight*scale,height=basement.height*scale;
      if(z-height/2<=base||z+height/2>=roof)continue;
      const pane=windowOnEdge(building,edge,t,z,basement.width,height,-1,column,distance);
      pane.appearanceEvidence='user-reference-estimate';pane.basement=true;windows.push(pane);
    }
  }
  return windows;
}

const facadeRect=(edge,u0,u1,z0,z1,color,extra={})=>({x:edge.a[0]+(edge.b[0]-edge.a[0])*(u0+u1)/2,
  y:edge.a[1]+(edge.b[1]-edge.a[1])*(u0+u1)/2,z:(z0+z1)/2,width:edge.length*(u1-u0),height:z1-z0,
  nx:edge.nx,ny:edge.ny,angle:edge.angle,color,...extra});

/** Finish-only panels and balcony batches never mutate an analytical building. */
export function neighborhoodAppearanceLayout(buildings,data,{origin=data?.site?.rearMidpoint||[10,18],distanceLimit=175}={}){
  const result={panels:[],balconies:[],doors:[],entryCanopies:[],parapets:[],profiles:[]};
  for(const building of buildings||[]){
    const profile=observedBuildingAppearance(building),context=profile&&geometryContext(building,origin);
    if(!context||context.distance>distanceLimit)continue;
    const {base,roof,height,scale}=context,blank=data?.facadeOverrides?.[building.id],measuredRoof=visualNeighborRoof(building,data);
    result.profiles.push({buildingId:building.id,officialId:building.officialId,name:profile.observedName,confidence:profile.confidence});
    for(const edge of appearanceFacadeEdges(building)){
      if(edge.length<.25)continue;
      const facade=profile.facades[edge.direction];
      // The body itself supplies a measured-roof house's facade colour. A flat
      // rectangular colour overlay would otherwise protrude through a gable.
      if(facade&&!measuredRoof){
        result.panels.push(facadeRect(edge,0,1,base+.025,roof-.025,facade.color||profile.facadeColor,{offset:.009}));
        for(const [layer,panel] of (facade.panels||[]).entries())
          result.panels.push(facadeRect(edge,panel.u0,panel.u1,base+height*panel.z0,base+height*panel.z1,panel.color,{offset:.014+layer*.002}));
      }
      result.panels.push(facadeRect(edge,0,1,base+.01,base+Math.min(.38*scale,height*.1),'#8d9085',{offset:.019}));
      // The cap is placed below the mapped top. No invented extra skyline height.
      if(!measuredRoof)result.parapets.push(facadeRect(edge,0,1,roof-.14*scale,roof,'#7b7d73',{depth:.14,offset:.025}));
      if(!facade||!facade.entrance||isRecordedBlankFacade(edge,building,blank)||edge.length<5.5)continue;
      const entranceU=finite(facade.entranceU,.5),entranceWidth=finite(facade.entranceWidth,1.35);
      const entranceTop=base+finite(facade.entranceTopHeight,2.15)*scale;
      const center=facadeRect(edge,entranceU-entranceWidth/edge.length/2,entranceU+entranceWidth/edge.length/2,
        base+finite(facade.entranceBottomHeight,.08)*scale,entranceTop,'#565c55',{offset:.025});
      result.doors.push(center);
      if(facade.entranceCanopy!==false)
        result.entryCanopies.push({...center,z:entranceTop+.23*scale,width:2.5,height:.16,depth:1.1,offset:.5,color:'#a9aca4'});
    }
    for(const pane of observedFacadePlacements(building,origin,distanceLimit,blank)||[]){
      if(!pane.balcony)continue;
      const edge=appearanceFacadeEdges(building).find(edge=>edge.side===pane.side),facade=profile.facades[edge.direction];
      result.balconies.push({...pane,width:Math.min(2.04,edge.length/facade.bays.length*.86),depth:.9,
        slabZ:pane.balconyFloorZ-.06*scale,railHeight:.83*scale,color:facade.balconyColor||'#c9c7b6'});
    }
  }
  return result;
}
