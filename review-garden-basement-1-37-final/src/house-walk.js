import {getHouseFloorPlan,houseModelFrame} from './house-model.js?v=1.37.0';
import {containsPoint,wallPanels,ringBounds} from './interior-geometry.js?v=1.37.0';
import {roomPose,walkGeometry} from './interior-navigation.js?v=1.37.0';
import {stairTreads} from './stair-surfaces.js?v=1.37.0';
import {hstPanelLayout,balconyPanelLayout} from './hst-system.js?v=1.37.0';
import {gardenGroundAt,terrainAt,terraceGroundReference,jacuzziBounds,spaLevels,pointInPolygon} from './geometry.js?v=1.37.0';
import {terraceStairs} from './layout.js?v=1.37.0';
import {gardenProgram,poolBounds} from './garden-program.js?v=1.37.0';
import {garageLayout,garageVehiclePose} from './garage-ramp.js?v=1.37.0';
import {houseAppearanceLayout} from './house-appearance.js?v=1.37.0';
import {entranceAccessLayout} from './entrance-access.js?v=1.37.0';
import {boundaryFenceLayout} from './boundary-fence.js?v=1.37.0';

const EPS=1e-6,RADIUS=.16,MAX_STEP=.245;
const rectangle=(x0,z0,x1,z1)=>[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
const inside=(polygon,x,z)=>pointInPolygon([x,z],polygon);
function distanceToSegment(x,z,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz,t=l?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/l)):0;return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);}
const nearPolygon=(polygon,x,z,r=RADIUS)=>inside(polygon,x,z)||polygon.some((a,i)=>distanceToSegment(x,z,a,polygon[(i+1)%polygon.length])<r);
const inRect=(x,z,r,pad=0)=>x>=r.x-pad&&x<=r.x+r.width+pad&&z>=r.y-pad&&z<=r.y+(r.length??r.depth)+pad;
const footprint=r=>r.footprint||rectangle(r.x,r.y,r.x+r.width,r.y+(r.length??r.depth));

/** The same world coordinates as the renderer: [site x, elevation, site y].
 * locate/move retain physical collision and exact stair constraints.
 * locateFree/moveFree follow those same floors and terrain without barriers;
 * explicit floating movement can explore above, below and beyond the site. */
export function createWalkNavigation(data,settings={}){
  const frame=houseModelFrame(data,settings);
  const supported=!!frame&&(data.site.id||settings.siteId)==='sternicza-11';
  const plans=supported?Object.fromEntries(['basement','ground','first','attic'].map(floor=>[floor,getHouseFloorPlan({floor,settings,data})])):{};
  const surfaces=[],solids=[],treads=[],hstOpenings=[],ceilingHoles=new Map();
  let lastBlocking=null,freeMoves=0,physicalMoves=0,collisionChecks=0;
  const toLocal=(position)=>frame?frame.toLocal(position[0],position[2],position[1]):[position[0],position[2],position[1]];
  const toWorld=(x,z,y)=>{if(!frame)return[x,y,z];const p=frame.toSite(x,z,y);return[p[0],p[2],p[1]];};
  const localRing=ring=>frame?ring.map(p=>frame.toLocal(p[0],p[1]).slice(0,2)):ring;
  const relativeHeight=z=>z-(frame?.floorZ||0);
  for(const plan of Object.values(plans)){
    surfaces.push({id:plan.floor,floor:plan.floor,polygon:plan.envelope.outline,holes:plan.voids||[],height:plan.elevation,plan});
    for(const outdoor of plan.outdoor||[])surfaces.push({id:outdoor.id,floor:plan.floor,polygon:outdoor.polygon,height:plan.elevation,outdoor:true});
    ceilingHoles.set(plan.floor,(plan.stairs||[]).filter(s=>s.from===plan.floor).map(s=>s.polygon));
    for(const wall of plan.walls){
      const dx=wall.b[0]-wall.a[0],dz=wall.b[1]-wall.a[1],length=Math.hypot(dx,dz);if(!length)continue;
      const at=t=>[wall.a[0]+dx*t/length,wall.a[1]+dz*t/length];
      for(const p of wallPanels(wall,wall.height??plan.clearHeight))solids.push({a:at(p.left),b:at(p.right),radius:wall.thickness/2,bottom:plan.elevation+p.bottom,top:plan.elevation+p.top,id:wall.id});
      for(const o of wall.openings||[]){
        const bottom=plan.elevation+(o.sill||0),top=bottom+o.height;
        if(o.type==='window')solids.push({a:at(o.offset),b:at(o.offset+o.width),radius:.02,bottom,top,id:'glass-'+wall.id});
        else if(o.type==='hst'||o.type==='balcony-door'){
          const parts=o.type==='hst'?hstPanelLayout(o,settings):balconyPanelLayout(o);
          if(o.type==='hst')hstOpenings.push({opening:o,at,bottom,top,id:'glass-'+wall.id});
          for(const p of parts.blocked)solids.push({a:at(p.lo),b:at(p.hi),radius:.035,bottom,top,id:'glass-'+wall.id,hst:o.type==='hst'});
        }else if(o.type==='door'){
          const end=o.hinge==='end',sign=end?-1:1,hinge=o.offset+(end?o.width-.047:.047),angle=-sign*(o.swing||1)*Math.PI/2;
          const a=at(hinge),along=sign*(o.width-.10)*Math.cos(angle),across=-sign*(o.width-.10)*Math.sin(angle);
          solids.push({a,b:[a[0]+along*dx/length-across*dz/length,a[1]+along*dz/length+across*dx/length],radius:.018,bottom,top,id:'leaf-'+wall.id});
        }
      }
    }
    for(const core of plan.cores||[])solids.push({polygon:core.enclosure?.polygon||core.polygon,bottom:plan.elevation,top:plan.elevation+plan.clearHeight,id:core.id});
    for(const f of plan.fixtures||[]){
      if(f.hostId||f.nonBlocking||f.wallMounted||(f.kind==='car'&&settings.basementGarageEnabled))continue;
      // Chairs belong to the table footprint and are included in its envelope.
      const chair=f.kind==='diningTable'?.46:0,c=Math.cos(f.rotation||0),s=Math.sin(f.rotation||0);
      const polygon=rectangle(-f.width/2,-f.depth/2-chair,f.width/2,f.depth/2+chair).map(([x,z])=>[f.x+x*c+z*s,f.z-x*s+z*c]);
      solids.push({polygon,bottom:plan.elevation,top:plan.elevation+(f.height||(['storage','wardrobe','fridge','bookcase'].includes(f.kind)?2:.85)),furniture:true,id:f.id});
    }
    for(const stair of (plan.stairs||[]).filter(s=>s.kind!=='exterior'&&s.from===plan.floor)){
      for(const t of stairTreads(stair,plan)){
        const tread={...t,height:plan.elevation+t.top,floor:stair.to,lowerFloor:stair.from,stair:true};treads.push(tread);surfaces.push(tread);
      }
    }
  }
  const ground=(x,y)=>gardenGroundAt(x,y,settings,data);
  function updateHst(next=settings){
    for(let i=solids.length-1;i>=0;i--)if(solids[i].hst)solids.splice(i,1);
    for(const {opening,at,bottom,top,id}of hstOpenings){
      for(const p of hstPanelLayout(opening,next).blocked)solids.push({a:at(p.lo),b:at(p.hi),radius:.035,bottom,top,id,hst:true});
    }
  }
  const terrace=data.site.terrace,ref=terraceGroundReference(settings,data);
  const terraceFlight=terraceStairs({...terrace,y:data.site.rearMidpoint[1]},Number(settings.terraceDepth)||terrace.depth,ref.drop,settings,data);
  function siteSurface(id,polygon,height,extra={}){surfaces.push({id,polygon:localRing(polygon),height:relativeHeight(height),floor:'garden',outdoor:true,...extra});}
  // The first rendered tread is flush with the terrace; subsequent treads
  // descend evenly, with the final riser meeting the sampled garden grade.
  for(let i=0;i<terraceFlight.count;i++){
    const step=terraceFlight.length/terraceFlight.count;
    siteSurface('terrace-step-'+i,rectangle(terraceFlight.x,terraceFlight.y+i*step,terraceFlight.x+terraceFlight.width,terraceFlight.y+(i+1)*step),ref.floorZ-ref.drop*i/terraceFlight.count,{stair:true,lowerFloor:'garden',floor:'ground'});
  }
  const garage=supported?garageLayout(settings,data,{terrainAt}):null;
  function updateVehicles(next=settings){
    for(let i=solids.length-1;i>=0;i--)if(solids[i].vehicle)solids.splice(i,1);
    if(!garage?.enabled)return;
    const progress=Math.max(0,Math.min(1,Number(next.garageProgress??40)/100));
    const poses=[garageVehiclePose(garage,progress,next.garageReverse===true),...(garage.parking?.spaces===2?[garageVehiclePose(garage,1,false,garage.parking.parkedLaneOffset)]:[])];
    for(const [i,pose]of poses.entries()){
      const v=garage.vehicle,vertices=[];
      for(const u of [-v.rearOverhang,v.wheelbase+v.frontOverhang])for(const side of [-1,1])for(const h of [v.clearance-v.rearRadius,v.height-v.rearRadius]){
        const p=pose.localToWorld(u,side*v.mirrorWidth/2,h);vertices.push(frame.toLocal(...p));
      }
      solids.push({id:'vehicle-'+i,vehicle:true,polygon:rectangle(Math.min(...vertices.map(p=>p[0])),Math.min(...vertices.map(p=>p[1])),Math.max(...vertices.map(p=>p[0])),Math.max(...vertices.map(p=>p[1]))),bottom:Math.min(...vertices.map(p=>p[2])),top:Math.max(...vertices.map(p=>p[2]))});
    }
  }
  updateVehicles();
  // Fence bays and gate leaves are physical barriers only in Respect walls &
  // steps. Free exploration continues to use the same unrestricted surfaces.
  for(const member of boundaryFenceLayout(settings,data).solids)solids.push({
    id:member.id,polygon:localRing(member.footprint),bottom:relativeHeight(member.baseZ),top:relativeHeight(member.topZ),outdoor:true,
  });
  const house=supported?houseAppearanceLayout(data,settings,{garageLayout:garage}):null;
  const entrance=house?.supported?entranceAccessLayout(house,{groundAt:(x,y)=>terrainAt(x,y,data)}):null;
  for(const step of entrance?.stairs?.steps||[])siteSurface(step.id,step.footprint,step.topZ,{stair:true,floor:'ground'});
  if(house?.entryAccess?.landing?.footprint)siteSurface('entrance-landing',house.entryAccess.landing.footprint,house.floorZ,{floor:'ground'});
  const program=gardenProgram(settings,data),levels=spaLevels(settings,data),pool=poolBounds(settings,data),tub=jacuzziBounds(settings,data);
  const outdoorBlocks=[];
  if(pool)outdoorBlocks.push({id:'pool',polygon:localRing(footprint(pool))});
  outdoorBlocks.push({id:'terrace-jacuzzi',polygon:localRing(rectangle(tub.x0,tub.y0,tub.x1,tub.y1))});
  if(program.active){
    if(program.coldPlunge)outdoorBlocks.push({id:'cold-plunge',polygon:localRing(footprint(program.coldPlunge))});
    if(program.coldPlunge?.sunken)siteSurface('cold-plunge-flush-surround',footprint(program.coldPlunge.surroundBounds),levels.coldPlunge.padTopZ,
      {holes:[localRing(footprint(program.coldPlunge.waterBounds))]});
    const fire=program.firepit;
    if(fire&&levels.firepit){
      siteSurface('fire-lounge',footprint(fire),levels.firepit.floorZ);
      for(const [i,step]of (levels.firepit.steps||[]).entries())siteSurface('fire-step-'+i,footprint(step),step.topZ,{stair:true});
    }
    if(program.sauna)outdoorBlocks.push({id:'sauna',polygon:localRing(program.sauna.footprint)});
  }
  if(data.site.garage&&settings.removeGarage===false)outdoorBlocks.push({id:'retained-garage',polygon:localRing(data.site.garage.footprint)});
  for(const tree of settings.screeningTrees||[])if(tree.enabled!==false){const p=frame?frame.toLocal(tree.x,tree.y):[tree.x,tree.y];solids.push({a:p,b:p,radius:.22,bottom:-Infinity,top:Infinity,id:'tree-'+tree.id,outdoor:true});}
  // A cheap bounds rejection avoids polygon work on other wings and flights.
  for(const surface of surfaces)surface.bounds=ringBounds(surface.polygon);
  const waters=[];
  const water=(id,polygon,waterZ,aboveWater,floor='garden')=>waters.push({id,polygon:localRing(polygon),waterZ,aboveWater,floor,outdoor:true,swimming:true});
  if(pool&&levels.pool)water('pool-water',footprint(pool),levels.pool.waterZ,.25);
  const wb=tub.waterBounds;
  water('jacuzzi-water',rectangle(wb.x0,wb.y0,wb.x1,wb.y1),tub.waterZ,.35,'ground');
  if(program.active&&program.coldPlunge&&levels.coldPlunge)water('cold-plunge-water',footprint(program.coldPlunge.waterBounds),levels.coldPlunge.waterZ,.32);
  function surfaceCandidates(x,z,unrestricted=false){
    const result=surfaces.filter(s=>x>=s.bounds.x0&&x<=s.bounds.x1&&z>=s.bounds.z0&&z<=s.bounds.z1&&inside(s.polygon,x,z)&&!(s.holes||[]).some(h=>inside(h,x,z)));
    const world=toWorld(x,z,0),site=[world[0],world[2]];
    const onPlot=inside(data.site.boundary,...site);
    const inHouse=supported&&inside(plans.ground.envelope.outline,x,z);
    const inRamp=garage?.enabled&&inside(garage.clearFootprint,...site);
    if(inRamp){
      const along=(site[0]-garage.axis.start[0])*garage.axis.direction[0]+(site[1]-garage.axis.start[1])*garage.axis.direction[1];
      if(along>=0&&along<=garage.totalRun+.005){
        const p=garage.design.pieces.find(p=>along>=p.lo-EPS&&along<=p.hi+EPS)||garage.design.pieces.at(-1);
        result.push({id:'garage-ramp',floor:'basement',outdoor:true,height:relativeHeight(p.a*along*along+p.b*along+p.c)});
      }
    }
    const inFire=program.active&&program.firepit&&inRect(...site,program.firepit);
    if((onPlot||unrestricted)&&!inHouse&&!inRamp&&!inFire)result.push({id:'garden',floor:'garden',outdoor:true,height:relativeHeight(ground(...site))});
    return result;
  }
  function clearAt(x,z,surface,eyeHeight,showFurniture=true){
    collisionChecks++;
    const feet=surface.height,head=feet+eyeHeight+.11;
    const solid=solids.find(o=>(showFurniture||!o.furniture)&&o.top>feet+.05&&o.bottom<head&&
      (o.polygon?nearPolygon(o.polygon,x,z):distanceToSegment(x,z,o.a,o.b)<RADIUS+o.radius));
    if(solid){lastBlocking=solid.id;return false;}
    const outdoor=surface.outdoor||surface.floor==='garden';
    if(outdoor&&outdoorBlocks.some(o=>nearPolygon(o.polygon,x,z))){lastBlocking='outdoor-object';return false;}
    // Floors, ceilings and the underside of the stacked flights are solid.
    for(const plan of Object.values(plans)){
      if(!inside(plan.envelope.outline,x,z))continue;
      const holes=plan.voids||[];
      if(plan.elevation>feet+.06&&plan.elevation-(plan.slabThickness||.20)<head&&!holes.some(h=>inside(h,x,z))){lastBlocking=plan.floor+'-slab';return false;}
      const ceiling=plan.elevation+plan.clearHeight;
      if(plan.floor==='attic'){
        if(feet>=plan.elevation-.05){const roof=plan.roof.ridgeElevation-Math.abs(z-plan.roof.ridgeZ)*Math.tan(plan.roof.pitchDeg*Math.PI/180);if(head>roof-.025){lastBlocking='roof';return false;}}
      }else if(ceiling>feet+.06&&ceiling<head&&!(ceilingHoles.get(plan.floor)||[]).some(h=>inside(h,x,z))){lastBlocking=plan.floor+'-ceiling';return false;}
    }
    for(const t of treads)if(t.height>feet+.06&&t.height-t.thickness<head&&inside(t.polygon,x,z)){lastBlocking=t.id+'-underside';return false;}
    return true;
  }
  function metadata(position,surface,eyeHeight){
    const p=toLocal(position),floor=surface?.stair&&p[2]-eyeHeight<(plans[surface.floor]?.elevation??Infinity)-.10?surface.lowerFloor||surface.floor:surface?.floor||'garden';
    const room=plans[floor]?.rooms.find(r=>inside(r.polygon,p[0],p[1]));
    return{position:position.slice(),floor,roomId:room?.id||null,eyeHeight,surface:surface?.id||null,stair:!!surface?.stair};
  }
  function locate(position,{eyeHeight=1.57,showFurniture=true,maxDistance=Infinity}={}){
    const p=toLocal(position),feet=p[2]-eyeHeight;
    const candidates=surfaceCandidates(p[0],p[1]).filter(s=>Math.abs(s.height-feet)<=maxDistance&&clearAt(p[0],p[1],s,eyeHeight,showFurniture)).sort((a,b)=>Math.abs(a.height-feet)-Math.abs(b.height-feet));
    const surface=candidates[0];return surface?metadata(toWorld(p[0],p[1],surface.height+eyeHeight),surface,eyeHeight):null;
  }
  function move(position,delta,{eyeHeight=1.57,showFurniture=true}={}){
    physicalMoves++;
    let current=locate(position,{eyeHeight,showFurniture,maxDistance:.32});
    if(!current)return{position:position.slice(),floor:null,roomId:null,eyeHeight,blocked:true};
    const d=Math.hypot(delta[0],delta[2]),count=Math.max(1,Math.ceil(d/.045)),step=[delta[0]/count,0,delta[2]/count];
    const accept=world=>{
      const old=toLocal(current.position),p=toLocal(world),feet=old[2]-eyeHeight;
      const candidates=surfaceCandidates(p[0],p[1]).filter(s=>s.height-feet<=MAX_STEP+EPS&&feet-s.height<=MAX_STEP+EPS).sort((a,b)=>b.height-a.height);
      for(const surface of candidates){if(!clearAt(p[0],p[1],surface,eyeHeight,showFurniture))continue;current=metadata(toWorld(p[0],p[1],surface.height+eyeHeight),surface,eyeHeight);return true;}
      return false;
    };
    for(let i=0;i<count;i++){
      const next=current.position.slice();next[0]+=step[0];next[2]+=step[2];
      if(!accept(next)){
        const x=current.position.slice();x[0]+=step[0];accept(x);
        const z=current.position.slice();z[2]+=step[2];accept(z);
      }
    }
    return{...current,blocked:d>EPS&&Math.hypot(current.position[0]-position[0],current.position[2]-position[2])<EPS};
  }
  function freeSurface(position,{eyeHeight=1.57,floorHint}={}){
    const p=toLocal(position),feet=p[2]-eyeHeight,candidates=surfaceCandidates(p[0],p[1],true);
    const nearest=list=>list.sort((a,b)=>Math.abs(a.height-feet)-Math.abs(b.height-feet))[0];
    // A tread within a normal step is intentional stair travel. Distant
    // flights above the head must never pull a ground-floor walker upstairs.
    const tread=nearest(candidates.filter(s=>s.stair&&Math.abs(s.height-feet)<=MAX_STEP+EPS));
    const sameFloor=nearest(candidates.filter(s=>!s.stair&&floorHint&&s.floor===floorHint&&s.id!=='garden'));
    const entry=floorHint==='garden'&&nearest(candidates.filter(s=>!s.stair&&s.floor==='ground'));
    const below=nearest(candidates.filter(s=>s.height<=feet+MAX_STEP+EPS));
    let surface=tread||sameFloor||entry||(floorHint&&below)||nearest(candidates);
    if(!surface){const world=toWorld(p[0],p[1],0);surface={id:'garden',floor:'garden',outdoor:true,height:relativeHeight(ground(world[0],world[2]))};}
    const water=waters.find(w=>inside(w.polygon,p[0],p[1])&&surface.height<=relativeHeight(w.waterZ)+.6);
    if(water)surface={...water,height:relativeHeight(water.waterZ+water.aboveWater-eyeHeight)};
    return surface;
  }
  function locateFree(position,{eyeHeight=1.57,floorHint,floating=false}={}){
    const surface=freeSurface(position,{eyeHeight,floorHint:floating?undefined:floorHint}),p=toLocal(position);
    const result=metadata(floating?position:toWorld(p[0],p[1],surface.height+eyeHeight),surface,eyeHeight);
    return{...result,navigation:'free',floating,swimming:!floating&&!!surface.swimming,
      waterEyeHeight:!floating&&surface.swimming?surface.aboveWater:null,blocked:false};
  }
  function moveFree(position,delta,{eyeHeight=1.57,floorHint,floating=false}={}){
    freeMoves++;
    if(floating)return locateFree(position.map((v,i)=>v+(delta[i]||0)),{eyeHeight,floorHint,floating:true});
    // Larger accessible-button steps also encounter each tread in order.
    // Ordinary frames only do one support lookup and zero collision checks.
    const count=Math.max(1,Math.ceil(Math.hypot(delta[0],delta[2])/.18));
    let result={position,floor:floorHint};
    for(let i=0;i<count;i++)result=locateFree([result.position[0]+delta[0]/count,result.position[1],result.position[2]+delta[2]/count],{eyeHeight,floorHint:result.floor});
    return result;
  }
  function spawnFloor(floor='ground',roomId){
    const plan=plans[floor];if(!plan)return null;
    const room=plan.rooms.find(r=>r.id===roomId)||plan.rooms[0],clear=walkGeometry(plan);
    let pose;
    try{pose=roomPose(plan,room,clear,true);}catch{return null;}
    const eyeHeight=Math.min(1.57,plan.clearHeight-.13),initial=toWorld(pose.x,pose.z,plan.elevation+eyeHeight);
    let located=locate(initial,{eyeHeight,maxDistance:.02});
    if(!located){
      const b=ringBounds(room.polygon);
      for(let x=b.x0+.2;x<b.x1&&!located;x+=.11)for(let z=b.z0+.2;z<b.z1&&!located;z+=.11){
        if(!containsPoint(room.polygon,x,z))continue;located=locate(toWorld(x,z,plan.elevation+eyeHeight),{eyeHeight,maxDistance:.02});if(located)pose={...pose,x,z};
      }
    }
    if(!located)return null;
    const directionLocal=[Math.sin(pose.yaw)*Math.cos(pose.pitch),Math.sin(pose.pitch),-Math.cos(pose.yaw)*Math.cos(pose.pitch)];
    const end=toWorld(pose.x+directionLocal[0],pose.z+directionLocal[2],plan.elevation+eyeHeight+directionLocal[1]);
    return{...located,direction:end.map((v,i)=>v-located.position[i])};
  }
  function spawnGarden(position,{eyeHeight=1.57}={}){
    const wanted=position||[terrace.x+terrace.width*.85,ref.floorZ+eyeHeight,data.site.rearMidpoint[1]+1];
    const direct=locate(wanted,{eyeHeight});if(direct)return direct;
    for(let distance=.25;distance<=7;distance+=.25)for(let i=0;i<24;i++){
      const a=i*Math.PI/12,p=[wanted[0]+Math.cos(a)*distance,wanted[1],wanted[2]+Math.sin(a)*distance],result=locate(p,{eyeHeight});if(result)return result;
    }
    return null;
  }
  return{supported,plans,frame,locate,move,locateFree,moveFree,spawnFloor,spawnGarden,updateVehicles,updateHst,
    getDiagnostics:()=>({lastBlocking,floors:Object.keys(plans),connections:[...new Set(treads.map(t=>t.stairId))],treads:treads.length,surfaces:surfaces.length,collisionObjects:solids.length,stairsAreSharedGeometry:true,freeMoves,physicalMoves,collisionChecks})};
}
