/** Conceptual architectural alterations within the retained building envelope.
 * These opening records cut the actual walls in both views. Measurements of the
 * original footprint, roof, floors and stairs are never edited by a style.
 */
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const finite=(x,f=0)=>Number.isFinite(Number(x))?Number(x):f;
const EPS=1e-7;
const directionSign=([x,y])=>Math.abs(x)>=Math.abs(y)?(x<0?-1:1):(y<0?-1:1);
const recipe=(id,description,width,height,sill,shift,panes,transoms,frameWidth,gardenBays,gardenPanels,pier,reveal,header,operation,doorWidth=1.06)=>Object.freeze({
  id,description,width,height,sill,shift,panes,transoms,frameWidth,gardenBays,gardenPanels,pier,reveal,header,operation,doorWidth,
  gardenHeight:Math.min(2.5,height+.25),doorHeight:Math.min(2.35,height+.2),privacySill:1.5,
});
export const RENOVATION_ARCHITECTURES=Object.freeze({
  'organic-modern':recipe('organic-modern','Broad picture windows, low stone sills and deep mineral reveals around the full-width HST.',2.65,2.02,.36,.08,1,0,.055,2,3,.38,.24,.19,'picture'),
  'hidden-bali':recipe('hidden-bali','Tall teak-framed windows and deep timber reveals framing the continuous garden HST.',2.48,2.28,.13,-.12,2,0,.065,2,3,.42,.32,.38,'sliding',1.14),
  'mediterranean-villa':recipe('mediterranean-villa','Tall divided French windows, deep plaster jambs and shaded stone heads beside the continuous garden HST.',1.82,2.18,.33,.04,2,2,.075,3,2,.52,.29,.22,'french',1.12),
  'modern-minimal':recipe('modern-minimal','Large low-sill picture windows and one broad sliding garden opening with fine aluminium frames.',3.08,2.32,.14,.13,1,0,.035,1,3,.24,.16,.12,'picture',1.18),
  'scandinavian':recipe('scandinavian','Generous paired casements with a clear upper light and warm timber framing around the garden HST.',1.96,1.92,.55,-.08,2,1,.067,3,2,.34,.19,.16,'casement'),
  'japandi':recipe('japandi','Asymmetric horizontal glazing and quiet timber reveals around the full-width garden HST.',2.42,1.78,.64,.19,2,0,.045,2,2,.46,.27,.23,'sliding',1.10),
  'organic-scandinavian':recipe('organic-scandinavian','Tall three-part timber windows, low garden sills and broad softly shaded openings.',2.34,2.12,.36,-.13,3,0,.062,2,3,.30,.23,.20,'casement',1.08),
  'organic-japandi':recipe('organic-japandi','Offset picture windows and generous mineral reveals around the full-width garden HST.',2.82,1.94,.45,-.19,1,0,.052,2,2,.56,.34,.27,'picture',1.16),
  'space-age':recipe('space-age','Wide three-light ribbon windows and a continuous garden slider inside deep metallic portal frames.',2.72,1.63,.76,.16,3,0,.06,1,4,.28,.28,.24,'ribbon',1.20),
  'party-club':recipe('party-club','Tall wide glazing, thin dark dividers and one stacking garden opening beneath a deep continuous shade.',3.28,2.39,.10,-.07,3,0,.04,1,6,.22,.22,.40,'stacking',1.18),
  'baltic-dune':recipe('baltic-dune','Low horizontal three-light windows and silvered timber reveals around the continuous garden HST.',2.88,1.68,.72,.11,3,0,.058,2,3,.40,.25,.31,'ribbon'),
  'beach-house':recipe('beach-house','Broad low-sill timber glazing and a full-width three-panel HST connecting the living room to the terrace.',2.74,2.24,.14,.06,3,0,.064,2,4,.28,.22,.34,'stacking',1.12),
  coastal:recipe('coastal','Paired divided-light French windows and deep white projecting casings around the garden HST.',2.08,2.07,.42,-.04,2,2,.083,3,2,.44,.25,.23,'french',1.10),
  'gdansk-brick':recipe('gdansk-brick','Narrow tall steel-divided windows and deep brick reveals around the full-width garden HST.',1.48,2.29,.26,.09,2,3,.047,3,2,.64,.30,.18,'steel-grid',1.02),
  'danish-midcentury':recipe('danish-midcentury','Long three-part timber picture windows, higher sills and a wide garden slider beneath a strong horizontal head.',3.02,1.71,.68,-.15,3,0,.068,1,4,.30,.21,.33,'ribbon',1.13),
  'finnish-sauna':recipe('finnish-sauna','Quiet square picture windows, protected high bathroom lights and deep cedar reveals around the garden HST.',1.72,1.76,.67,.03,1,0,.071,2,2,.62,.35,.28,'picture',1.04),
  'riviera-deco':recipe('riviera-deco','Tall three-part windows, high transoms and stepped projecting heads above the garden HST.',2.28,2.22,.29,-.10,3,1,.062,3,3,.48,.31,.29,'deco-grid',1.16),
  'arts-and-crafts':recipe('arts-and-crafts','Broad paired timber casements with upper divided lights and crafted timber reveals around the garden HST.',2.18,1.98,.51,.07,2,2,.089,3,2,.60,.29,.26,'casement',1.08),
  'palm-springs':recipe('palm-springs','Very broad low-sill picture windows and one open garden frontage under long protective sun heads.',3.36,2.08,.24,.17,1,0,.045,1,4,.26,.20,.39,'picture',1.20),
  'desert-modern':recipe('desert-modern','Deep-set horizontal picture windows, raised shaded sills and a monumental reveal around the garden HST.',2.92,1.82,.62,-.17,1,0,.055,2,2,.70,.40,.36,'picture',1.14),
  'alpine-lodge':recipe('alpine-lodge','Large paired timber windows with upper lights and sheltered timber reveals around the garden HST.',2.12,2.11,.43,.02,2,1,.09,3,2,.58,.34,.32,'french',1.10),
  'industrial-loft':recipe('industrial-loft','Tall workshop glazing in fine steel grids and a full-width minimalist garden HST.',2.76,2.26,.20,-.06,3,3,.041,2,4,.36,.20,.25,'steel-grid',1.15),
});
export const getRenovationArchitecture=id=>RENOVATION_ARCHITECTURES[typeof id==='string'?id:id?.id]||null;

export function styleOpeningDetails(opening,styleId){
  const r=getRenovationArchitecture(styleId);if(!r)return {};
  const kind=opening.type||opening.kind,access=['hst','balcony-door'].includes(kind);
  if(kind==='hst')return {panes:3,transoms:0,frameWidth:.028,operation:'left-stacking',glazing:'clear',
    architectureStyle:r.id,source:'full-width-three-track-proposal'};
  const operation=kind==='door'?'hinged':access&&['picture','ribbon'].includes(r.operation)?'sliding':access&&r.operation==='casement'?'french':r.operation;
  return {panes:access?r.gardenPanels:r.panes,transoms:access&&['sliding','stacking','picture','ribbon'].includes(r.operation)?0:r.transoms,
    frameWidth:r.frameWidth,operation,glazing:opening.privacy?'privacy':'clear',
    architectureStyle:r.id,source:'style-renovation-proposal'};
}

function roomIntervals(plan,wall){
  const dx=wall.b[0]-wall.a[0],dy=wall.b[1]-wall.a[1],length=Math.hypot(dx,dy),ux=dx/length,uy=dy/length;
  const along=p=>(p[0]-wall.a[0])*ux+(p[1]-wall.a[1])*uy,away=p=>Math.abs((p[0]-wall.a[0])*uy-(p[1]-wall.a[1])*ux);
  const result=[];
  for(const room of plan.rooms||[])for(let i=0;i<room.polygon.length;i++){
    const a=room.polygon[i],b=room.polygon[(i+1)%room.polygon.length];
    if(Math.max(away(a),away(b))>finite(wall.thickness,.3)/2+.16)continue;
    const lo=Math.max(0,Math.min(along(a),along(b))),hi=Math.min(length,Math.max(along(a),along(b)));
    if(hi-lo>.45)result.push({lo,hi,roomId:room.id,kind:room.kind});
  }
  return result;
}

function openingBounds(openings,index,length,room){
  const o=openings[index],centre=o.offset+o.width/2;
  let lo=.22,hi=length-.22;
  for(const [i,other]of openings.entries()){
    if(i===index)continue;
    const c=other.offset+other.width/2;
    // Preserve a physical pier beside every existing access aperture.
    const guard=['door','passage','garage-door'].includes(other.type);
    if(c<centre)lo=Math.max(lo,guard?other.offset+other.width+.16:(c+centre)/2+.12);
    else if(c>centre)hi=Math.min(hi,guard?other.offset-.16:(c+centre)/2-.12);
  }
  if(room){lo=Math.max(lo,room.lo+.10);hi=Math.min(hi,room.hi-.10);}
  return {lo,hi};
}

function retainPartitionJunctions(plan,wall,bounds,centre){
  const dx=wall.b[0]-wall.a[0],dy=wall.b[1]-wall.a[1],length=Math.hypot(dx,dy),ux=dx/length,uy=dy/length;
  const signed=p=>(p[0]-wall.a[0])*uy-(p[1]-wall.a[1])*ux;
  let {lo,hi}=bounds;
  for(const other of plan.walls){
    if(other===wall||other.exterior)continue;
    const ox=other.b[0]-other.a[0],oy=other.b[1]-other.a[1],ol=Math.hypot(ox,oy),cross=Math.abs((ox*uy-oy*ux)/ol);
    if(cross<.1)continue;
    const a=signed(other.a),b=signed(other.b);
    if(a*b>0&&Math.min(Math.abs(a),Math.abs(b))>wall.thickness/2+.01)continue;
    const t=clamp(a/(a-b),0,1),p=[other.a[0]+ox*t,other.a[1]+oy*t],at=(p[0]-wall.a[0])*ux+(p[1]-wall.a[1])*uy;
    if(at<=0||at>=length)continue;
    const half=(other.thickness/2+.04)/cross;
    if(at<centre)lo=Math.max(lo,at+half);else hi=Math.min(hi,at-half);
  }
  return {lo,hi};
}

// Keep real wall space behind TVs, mirrors and tall joinery. The footprint test
// uses the physical face of this wall, so a wardrobe on an interior partition
// cannot accidentally suppress a window on the exterior across the room.
function fixtureWallIntervals(plan,wall){
  const dx=wall.b[0]-wall.a[0],dy=wall.b[1]-wall.a[1],length=Math.hypot(dx,dy),ux=dx/length,uy=dy/length,result=[];
  for(const f of plan.fixtures||[]){
    const tall=['wardrobe','fridge','bookcase'].includes(f.kind),mounted=f.wallMounted||f.kind==='tv';
    if(!tall&&!mounted&&!(f.kind==='bed'&&f.headboardMaxHeight))continue;
    const angle=finite(f.rotation),c=Math.cos(angle),s=Math.sin(angle),corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>[
      f.x+c*x*f.width/2-s*y*f.depth/2,f.z+s*x*f.width/2+c*y*f.depth/2]);
    const distances=corners.map(p=>(p[0]-wall.a[0])*uy-(p[1]-wall.a[1])*ux);
    const away=Math.min(...distances)<=0&&Math.max(...distances)>=0?0:Math.min(...distances.map(Math.abs));
    if(away>wall.thickness/2+.13)continue;
    const along=corners.map(p=>(p[0]-wall.a[0])*ux+(p[1]-wall.a[1])*uy),lo=Math.max(0,Math.min(...along)),hi=Math.min(length,Math.max(...along));
    if(hi-lo<.04)continue;
    const centre=finite(f.mountHeight,f.kind==='tv'?1.13:1.5),height=finite(f.height,f.kind==='tv'?Math.min(.84,f.depth*.51):.8);
    result.push({id:f.id,lo,hi,bottom:tall||f.kind==='bed'?0:centre-height/2,top:tall?finite(f.height,2.1):f.kind==='bed'?f.headboardMaxHeight:centre+height/2,lowHeadboard:f.kind==='bed'});
  }
  return result;
}

function clearFixtureSpan(bounds,guards,bottom,top,centre){
  let spans=[bounds];
  for(const guard of guards){
    if(guard.lowHeadboard||bottom>=guard.top+.08||top<=guard.bottom-.08)continue;
    spans=spans.flatMap(span=>{
      if(guard.hi+.12<=span.lo||guard.lo-.12>=span.hi)return [span];
      return [{lo:span.lo,hi:Math.min(span.hi,guard.lo-.12)},{lo:Math.max(span.lo,guard.hi+.12),hi:span.hi}].filter(s=>s.hi-s.lo>=.35);
    });
  }
  return spans.sort((a,b)=>{
    const distance=s=>Math.max(s.lo-centre,centre-s.hi,0);
    return distance(a)-distance(b)||(b.hi-b.lo)-(a.hi-a.lo);
  })[0];
}

/** Wall openings remain the single source for wall cutouts, glazing and views. */
export function renovatePlanOpenings(plan,{styleId='current'}={}){
  const r=getRenovationArchitecture(styleId);
  if(!r){
    if(!plan.architectureProposal)return plan;
    const {architectureProposal,...original}=plan;
    return {...original,walls:plan.walls.map(w=>{
      if(!w.architectureSourceOpenings)return w;
      const {architectureSourceOpenings,...wall}=w;
      return {...wall,openings:architectureSourceOpenings.map(o=>({...o}))};
    })};
  }
  if(plan.architectureProposal?.styleId===r.id)return plan;
  if(!['ground','first'].includes(plan.floor))return plan;
  const walls=plan.walls.map(wall=>{
    if(!wall.exterior)return wall;
    const source=wall.architectureSourceOpenings||wall.openings,length=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]);
    const rooms=roomIntervals(plan,wall),fixtures=fixtureWallIntervals(plan,wall),openings=[],sign=directionSign([wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]]);
    for(const [i,o]of source.entries()){
      if(o.type==='hst'){
        // Continuous opening with slim end jambs; all renovation styles share
        // the user's three-track HST. Structural capacity is not inferred.
        const offset=.03,end=length-.03,height=Math.min(2.5,wall.height-.18);
        if(height<.5)continue;
        openings.push({...o,...styleOpeningDetails(o,r.id),offset,width:end-offset,sill:0,height,proposalBay:0});
        continue;
      }
      if(o.type==='door'){
        // The surveyed street entry stays aligned with its landing. A nearby
        // open foyer passage must not shrink the usable entrance aperture.
        openings.push({...o,...styleOpeningDetails(o,r.id),offset:o.offset,width:o.width,
          sill:0,height:Math.min(Math.max(o.height,r.doorHeight),wall.height-.18)});
        continue;
      }
      if(!['window','balcony-door','door'].includes(o.type)){openings.push({...o});continue;}
      const centre=o.offset+o.width/2,room=rooms.filter(room=>centre>=room.lo-EPS&&centre<=room.hi+EPS).sort((a,b)=>(a.hi-a.lo)-(b.hi-b.lo))[0];
      let bounds=retainPartitionJunctions(plan,wall,openingBounds(source,i,length,room),centre);const privacy=['bathroom','sauna'].includes(room?.kind);
      const access=o.type!=='window',entry=o.type==='door';
      const headboardSill=Math.max(0,...fixtures.filter(f=>f.lowHeadboard&&f.lo<bounds.hi&&f.hi>bounds.lo).map(f=>f.top+.08));
      const sill=access?0:privacy?r.privacySill:room?.kind==='kitchen'?Math.max(1,r.sill):Math.max(r.sill,headboardSill);
      const height=Math.min(entry?r.doorHeight:access?r.gardenHeight:privacy?.68:r.height,wall.height-sill-.18);
      if(height<.35)continue;
      if(!entry)bounds=clearFixtureSpan(bounds,fixtures,sill,sill+height,centre);
      if(!bounds)continue;
      const width=Math.min(entry?r.doorWidth:privacy?Math.min(1.1,r.width*.5):o.type==='balcony-door'?Math.min(2.45,r.width):r.width,
        entry?Math.max(0,Math.min(centre-bounds.lo,bounds.hi-centre)*2):bounds.hi-bounds.lo);
      if(width<.35)continue;
      // Keep the existing entry tied to its landing; other windows may shift
      // inside their own room, never through a retained interior partition.
      const rank=source.filter(other=>sign*(other.offset+other.width/2-centre)<-EPS).length;
      const target=centre+(entry?0:r.shift*(rank%2?-1:1)*sign);
      const offset=clamp(target-width/2,bounds.lo,bounds.hi-width);
      openings.push({...o,...styleOpeningDetails({...o,privacy},r.id),offset,width,sill,height,privacy,roomId:room?.roomId,
        ...(privacy?{panes:1,transoms:0,operation:'clerestory'}:{})});
    }
    return {...wall,openings,architectureSourceOpenings:source.map(o=>({...o}))};
  });
  return {...plan,walls,architectureProposal:{styleId:r.id,description:r.description,conceptual:true,retained:'Footprint, roof, floor levels, stairs and interior partitions'}};
}

export function facadeRoofHeight(edge,distance){
  const roof=edge.roofEdge;
  if(!roof?.points?.length)return finite(edge.topZ,Infinity);
  const u=clamp(distance/edge.length,0,1),fractions=roof.fractions||roof.points.map((_,i)=>i/(roof.points.length-1));
  for(let i=0;i<fractions.length-1;i++)if(u<=fractions[i+1]+EPS){
    const t=clamp((u-fractions[i])/(fractions[i+1]-fractions[i]||1),0,1);
    return Math.min(finite(edge.topZ,Infinity),roof.points[i][2]+(roof.points[i+1][2]-roof.points[i][2])*t);
  }
  return Math.min(finite(edge.topZ,Infinity),roof.points.at(-1)[2]);
}
export function minimumFacadeRoof(edge,lo,hi){
  let min=Math.min(facadeRoofHeight(edge,lo),facadeRoofHeight(edge,hi));
  const roof=edge.roofEdge;
  for(let i=0;i<(roof?.points?.length||0);i++){
    const d=edge.length*(roof.fractions?.[i]??i/(roof.points.length-1));
    if(d>lo&&d<hi)min=Math.min(min,roof.points[i][2]);
  }
  return min;
}

/** Equivalent opening proposals for photo-only and mapped house envelopes. */
export function renovateFacadeOpenings(layout,{styleId='current',atticFloorZ}={}){
  const r=getRenovationArchitecture(styleId);
  if(!r){
    if(!layout?.architectureSourceWindows)return layout;
    if(layout.architectureSourceLayout)return layout.architectureSourceLayout;
    const {architectureSourceWindows,architectureSourceDoor,architectureProposal,...original}=layout;
    return {...original,windows:architectureSourceWindows,door:architectureSourceDoor,
      rearBays:architectureSourceWindows.filter(w=>w.kind==='hst'),balconyDoor:architectureSourceWindows.find(w=>w.kind==='balcony-door')||null};
  }
  if(!layout?.edges?.length||layout.architectureProposal?.styleId===r.id)return layout;
  const original=layout.architectureSourceWindows||layout.windows,windows=[],handledAccess=new Set();
  const firstFloor=finite(layout.firstFloorZ,layout.floorZ+3),atticFloor=finite(atticFloorZ,layout.floorZ+6);
  const ceiling=level=>level===0?firstFloor-.30:level===1?atticFloor:layout.floorZ+(level+1)*3-.30;
  const openingHeight=(edge,lo,hi,z,level,desired)=>Math.min(desired,minimumFacadeRoof(edge,lo,hi)-z-.20,ceiling(level)-z-.18);
  const sourceDoor=Object.hasOwn(layout,'architectureSourceDoor')?layout.architectureSourceDoor:layout.door;
  let door=sourceDoor;
  if(sourceDoor){
    const edge=layout.edges[sourceDoor.edgeIndex],centre=(sourceDoor.lo+sourceDoor.hi)/2;
    let half=Math.min(centre-.22,edge.length-.22-centre);
    for(const other of original.filter(w=>w.edgeIndex===edge.index&&w.z<sourceDoor.z+sourceDoor.height&&w.z+w.height>sourceDoor.z))
      half=Math.min(half,other.hi<=centre?centre-other.hi-.16:other.lo>=centre?other.lo-centre-.16:half);
    const width=Math.min(r.doorWidth,half*2),lo=centre-width/2,hi=centre+width/2;
    const height=openingHeight(edge,lo,hi,sourceDoor.z,0,r.doorHeight);
    if(width>=.7&&height>=.35)door={...sourceDoor,...styleOpeningDetails({kind:'door'},r.id),width,lo,hi,centre,height};
  }
  for(const [i,w]of original.entries()){
    const edge=layout.edges[w.edgeIndex];if(!edge)continue;
    if(w.level==='basement'||w.z<layout.floorZ-.25){windows.push({...w});continue;}
    const access=['hst','balcony-door'].includes(w.kind),centre=(w.lo+w.hi)/2;
    const level=w.level==='first'?1:Math.max(0,Math.round((w.z-layout.floorZ-(access?0:.6))/3));
    const floor=level===1?firstFloor:layout.floorZ+level*3;
    if(w.kind==='hst'){
      const key=edge.index+':'+level;if(handledAccess.has(key))continue;handledAccess.add(key);
      const band=original.filter(o=>o.kind==='hst'&&o.edgeIndex===edge.index&&Math.abs(o.z-w.z)<.2);
      const lo=.03,hi=edge.length-.03,z=Math.max(w.z,floor);
      const height=openingHeight(edge,lo,hi,z,level,2.5);
      if(hi-lo>.5&&height>.5)windows.push({...w,...styleOpeningDetails(w,r.id),id:band[0].id,
        lo,hi,width:hi-lo,centre:(lo+hi)/2,z,height,proposalBay:0,
        position:[edge.a[0]+edge.direction[0]*(lo+hi)/2,edge.a[1]+edge.direction[1]*(lo+hi)/2,z],outward:edge.outward.slice()});
      continue;
    }
    const peers=original.filter(other=>other!==w&&other.edgeIndex===w.edgeIndex&&Math.abs(other.z-w.z)<1.1);
    const guards=[door,layout.portal].filter(other=>other&&other.edgeIndex===w.edgeIndex&&w.z<other.z+other.height&&w.z+w.height>other.z);
    let low=.22,high=edge.length-.22;
    for(const other of peers){const c=(other.lo+other.hi)/2;if(c<centre)low=Math.max(low,(centre+c)/2+.12);else high=Math.min(high,(centre+c)/2-.12);}
    for(const other of guards){if((other.lo+other.hi)/2<centre)low=Math.max(low,other.hi+.16);else high=Math.min(high,other.lo-.16);}
    const desired=w.kind==='hst'?high-low:w.kind==='balcony-door'?Math.min(2.45,r.width):r.width;
    const width=Math.min(desired,high-low);if(width<.35)continue;
    const sign=directionSign(edge.direction),rank=peers.filter(o=>sign*((o.lo+o.hi)/2-centre)<-EPS).length;
    const lo=clamp(centre+(access?0:r.shift*(rank%2?-1:1)*sign)-width/2,low,high-width),hi=lo+width;
    const z=access?Math.max(w.z,floor):floor+r.sill,height=openingHeight(edge,lo,hi,z,level,access?r.gardenHeight:r.height);
    if(height<.35)continue;
    windows.push({...w,...styleOpeningDetails(w,r.id),lo,hi,width,centre:(lo+hi)/2,z,height,
      position:[edge.a[0]+edge.direction[0]*(lo+hi)/2,edge.a[1]+edge.direction[1]*(lo+hi)/2,z],outward:edge.outward.slice()});
  }
  return {...layout,windows,door,rearBays:windows.filter(w=>w.kind==='hst'),balconyDoor:windows.find(w=>w.kind==='balcony-door')||null,
    architectureSourceWindows:original.map(w=>({...w})),architectureSourceDoor:sourceDoor,
    architectureSourceLayout:layout.architectureSourceLayout||layout,
    architectureProposal:{styleId:r.id,description:r.description,conceptual:true}};
}

/** Solid wall polygons, in along-wall distance / absolute height coordinates.
 * Aperture cuts are real voids, including ordinary mapped-house windows. Roof
 * knots split the cells before clipping, so no panel crosses a lower eave.
 */
export function facadeSolidPanels(layout,edge){
  const apertures=[...(layout.windows||[]),layout.door,layout.portal].filter(w=>w&&w.edgeIndex===edge.index&&w.hi>w.lo&&w.height>0);
  const base=finite(edge.baseZ,layout.baseZ),roof=edge.roofEdge;
  const top=Number.isFinite(edge.topZ)?edge.topZ:Math.max(...(roof?.points||[]).map(p=>p[2]));
  if(!(top>base))return [];
  const knots=(roof?.points||[]).map((_,i)=>edge.length*(roof.fractions?.[i]??i/(roof.points.length-1)));
  const xs=[...new Set([0,edge.length,...knots,...apertures.flatMap(w=>[w.lo,w.hi])].filter(x=>x>=0&&x<=edge.length))].sort((a,b)=>a-b);
  const plinth=finite(layout.plinthTopZ,layout.floorZ),zs=[...new Set([base,top,plinth,...apertures.flatMap(w=>[w.z,w.z+w.height])].filter(z=>z>=base&&z<=top))].sort((a,b)=>a-b),result=[];
  for(let i=0;i<xs.length-1;i++)for(let j=0;j<zs.length-1;j++){
    const lo=xs[i],hi=xs[i+1],bottom=zs[j],upper=zs[j+1],x=(lo+hi)/2,z=(bottom+upper)/2;
    if(hi-lo<EPS||upper-bottom<EPS||apertures.some(w=>x>w.lo-EPS&&x<w.hi+EPS&&z>w.z-EPS&&z<w.z+w.height+EPS))continue;
    const aTop=facadeRoofHeight(edge,lo),bTop=facadeRoofHeight(edge,hi),height=t=>aTop+(bTop-aTop)*(t-lo)/(hi-lo);
    const ring=[[lo,bottom],[hi,bottom],[hi,upper],[lo,upper]],vertices=[];
    for(let k=0;k<ring.length;k++){
      const a=ring[k],b=ring[(k+1)%ring.length],da=height(a[0])-a[1],db=height(b[0])-b[1];
      if(da>=-EPS)vertices.push(a);
      if(da*db<-EPS*EPS){const t=da/(da-db);vertices.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
    }
    const area=Math.abs(vertices.reduce((sum,a,i)=>{const b=vertices[(i+1)%vertices.length];return sum+a[0]*b[1]-b[0]*a[1];},0))/2;
    if(vertices.length>=3&&area>EPS)result.push({vertices,kind:upper<=plinth+EPS?'plinth':'wall',edgeIndex:edge.index});
  }
  return result;
}

/** Deeper physical portal/reveal elements accompany the enlarged apertures. */
export function renovationArchitecturalParts(layout,styleId){
  const r=getRenovationArchitecture(styleId);if(!r||!layout?.architectureProposal)return [];
  const parts=[],guards=[...layout.windows,layout.door,layout.portal,layout.atticWindow].filter(Boolean),openings=guards.filter(w=>w!==layout.portal&&w!==layout.atticWindow&&w.level!=='basement');
  for(const w of openings){
    const edge=layout.edges[w.edgeIndex];if(!edge)continue;
    const finish=['hidden-bali','scandinavian','japandi','organic-scandinavian','organic-japandi','beach-house','danish-midcentury','finnish-sauna','arts-and-crafts','alpine-lodge'].includes(r.id)?'wood':'houseFrame';
    const put=(kind,lo,hi,bottom,top,depth)=>{
      if(lo<.10||hi>edge.length-.10||bottom<Math.max(layout.baseZ,edge.baseZ??layout.baseZ)+.03||top>minimumFacadeRoof(edge,lo,hi)-.09)return;
      if(guards.some(o=>o!==w&&o.edgeIndex===w.edgeIndex&&hi>o.lo-.03&&lo<o.hi+.03&&top>o.z-.03&&bottom<o.z+o.height+.03))return;
      parts.push({kind,lo,hi,bottom,top,depth,finish,openingId:w.id,edgeIndex:edge.index});
    };
    const gap=.035,jamb=.10;
    const bottom=Math.max(w.z,finite(edge.baseZ,layout.baseZ)+.04);
    put('architectural-reveal',w.lo-gap-jamb,w.lo-gap,bottom,w.z+w.height,r.reveal);
    put('architectural-reveal',w.hi+gap,w.hi+gap+jamb,bottom,w.z+w.height,r.reveal);
    put('solar-header',w.lo-.14,w.hi+.14,w.z+w.height+.035,w.z+w.height+.145,r.header);
  }
  return parts;
}
