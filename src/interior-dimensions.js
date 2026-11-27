/** Dimensions of the actual furnished floor plan, in architectural metres.
 * Points use Three's local [x, elevation, z] order. Areas exclude slab voids;
 * irregular rooms explicitly report maximum extents, never a clear rectangle.
 */
import {containsPoint,ringBounds,floorTriangles} from './interior-geometry.js?v=1.39.0';

const EPS=1e-7,number=n=>Number.isFinite(n),fmt=n=>n.toFixed(2),metres=(a,b)=>`${fmt(a)} × ${fmt(b)} m`;
const area=ring=>Math.abs(ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-q[0]*p[1];},0))/2;
const segmentDistance=(p,a,b)=>{
  const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz);
};
const edgeDistance=(p,ring)=>Math.min(...ring.map((a,i)=>segmentDistance(p,a,ring[(i+1)%ring.length])));
const inRoom=(p,room)=>containsPoint(room.polygon,...p)||edgeDistance(p,room.polygon)<EPS;
const shortRoom=room=>({'front-kitchen':'Kitchen',lounge:'Living room',office:'Office',sauna:'Indoor sauna',
  'guest-1':'Guest room I','guest-2':'Guest room II','guest-3':'Guest room III','basement-gym':'Gym',
  'basement-technical':'Technical room',attic:'Roof space'}[room.id]||room.label.split(' · ')[0].replace(/\s*\([^)]*\)/g,'').trim());
const fixtureNames={bed:'Bed',sofaBed:'Daybed',desk:'Desk',diningTable:'Dining table',sofa:'Sofa',armchair:'Armchair',
  kitchen:'Kitchen unit',counter:'Counter',console:'Console',fridge:'Fridge',storage:'Storage',wallCabinet:'Wall cabinet',
  wardrobe:'Wardrobe',bookcase:'Bookcase',worktop:'Worktop',tub:'Bath',hotTub:'Spa bath',shower:'Shower',basin:'Vanity',
  toilet:'WC',wc:'WC',bidet:'Bidet',sauna:'Sauna heater',bench:'Bench',exerciseBike:'Training bike',
  exerciseBench:'Adjustable bench',cableTrainer:'Cable station',adjustableDumbbells:'Dumbbell stand',gymStorage:'Gym storage',
  exerciseMat:'Activity floor',washer:'Washer',dryer:'Dryer',plantUnit:'Technical equipment',car:'Car envelope'};

/** Numeric values are retained at full precision; only presentation is rounded. */
export function interiorRoomMetrics(plan,room){
  const bounds=ringBounds(room.polygon),polygonArea=area(room.polygon);
  const floorArea=floorTriangles(room.polygon,plan.voids||[]).reduce((sum,triangle)=>sum+area(triangle),0);
  const rectangular=Math.abs(polygonArea-bounds.width*bounds.depth)<1e-5;
  return {width:bounds.width,depth:bounds.depth,area:floorArea,polygonArea,rectangular,
    maximumExtents:!rectangular,clearHeight:plan.floor==='attic'?null:plan.clearHeight,bounds};
}

// A label sits in this room's floor polygon, away from a stair opening. The
// sample with most free margin works for narrow and concave circulation too.
function roomAnchor(plan,room){
  const b=ringBounds(room.polygon),candidates=[[b.x,b.z]];
  for(let x=0;x<9;x++)for(let z=0;z<9;z++)candidates.push([b.x0+b.width*(x+.5)/9,b.z0+b.depth*(z+.5)/9]);
  let best=room.polygon[0],score=-Infinity;
  for(const p of candidates){
    if(!inRoom(p,room)||(plan.voids||[]).some(v=>containsPoint(v,...p)))continue;
    const d=Math.min(edgeDistance(p,room.polygon),...(plan.voids||[]).map(v=>edgeDistance(p,v)));
    const centreBias=Math.hypot(p[0]-b.x,p[1]-b.z)*.025;
    if(d-centreBias>score){score=d-centreBias;best=p;}
  }
  return [best[0],plan.elevation+Math.min(1.08,plan.clearHeight*.46),best[1]];
}

function fixtureHeight(f){
  // These defaults only place the label. They never appear as a dimension.
  if(number(f.mountHeight))return f.mountHeight+(f.screenHeight||f.height||.35)/2;
  if(number(f.height))return (f.baseHeight||0)+f.height;
  return ({bed:.65,sofaBed:.8,sofa:.95,armchair:.9,desk:1.08,diningTable:.80,counter:.94,kitchen:.94,
    console:.85,fridge:1.88,wardrobe:2.12,storage:2.12,wallCabinet:2.4,bookcase:1.7,tub:.70,shower:1.85,
    basin:.95,toilet:.73,wc:.73,bidet:.48,bench:.51,sauna:.60,washer:.88,dryer:.88,car:1.35}[f.kind]||.9);
}
const fixturePoint=(f,x,z,y)=>{
  const c=Math.cos(f.rotation||0),s=Math.sin(f.rotation||0);
  return [f.x+x*c+z*s,y,f.z-x*s+z*c];
};
function openingRooms(plan,wall,opening,mid,normal){
  if(opening.roomId&&plan.rooms.some(r=>r.id===opening.roomId))return [opening.roomId];
  const found=plan.rooms.filter(room=>[-1,1].some(sign=>inRoom([mid[0]+normal[0]*sign*(wall.thickness/2+.11),mid[1]+normal[1]*sign*(wall.thickness/2+.11)],room)));
  return found.map(room=>room.id);
}

export function interiorDimensions(plan,{showDimensions=true,showFurniture=true}={}){
  if(!plan||showDimensions===false)return [];
  const records=[],floor=plan.floor,elevation=plan.elevation||0;
  for(const room of plan.rooms){
    const metrics=interiorRoomMetrics(plan,room),b=metrics.bounds,anchor=roomAnchor(plan,room);
    const maximum=metrics.maximumExtents?' max':'',height=number(metrics.clearHeight)?` · h ${fmt(metrics.clearHeight)} m`:'';
    records.push({id:`interior-${floor}-room-${room.id}`,kind:'room',feature:room.id,floor,roomIds:[room.id],priority:0,
      title:`${shortRoom(room)} · ${fmt(metrics.area)} m²`,text:`${metres(metrics.width,metrics.depth)}${maximum}${height}`,
      description:`${room.label}: modeled floor area ${fmt(metrics.area)} square metres; ${metrics.maximumExtents?'maximum floor-plan extents':'floor-plan dimensions'} ${metres(metrics.width,metrics.depth)}${height}.`,
      metrics,anchor,lines:[[[b.x0,elevation+.055,b.z0],[b.x1,elevation+.055,b.z0]],[[b.x1,elevation+.055,b.z0],[b.x1,elevation+.055,b.z1]]],
      datum:'Concept model; floor area excludes slab openings. Open-plan room boundaries are functional zones.'});
  }
  if(showFurniture)for(const f of plan.fixtures||[]){
    if(!(f.width>0&&f.depth>0)||!fixtureNames[f.kind]||f.panelOnly)continue;
    const h=fixtureHeight(f),y=elevation+Math.min(h+.08,plan.clearHeight-.12);
    const height=number(f.height)?` · h ${fmt(f.height)} m`:'';
    const mattress=f.mattressWidth&&f.mattressLength?{width:f.mattressWidth,length:f.mattressLength}:null;
    let title=f.id==='kitchen-island'?'Peninsula':fixtureNames[f.kind];
    if(f.kind==='sofaBed'&&f.open)title='Single bed';
    const text=metres(f.width,f.depth)+height;
    records.push({id:`interior-${floor}-fixture-${f.id}`,kind:'fixture',feature:f.id,floor,roomIds:f.roomId?[f.roomId]:[],priority:2,
      title,text,description:`${f.label||title}: modeled footprint ${text}${mattress?`; mattress ${metres(mattress.width,mattress.length)}`:''}.`,
      metrics:{width:f.width,depth:f.depth,...(number(f.height)?{height:f.height}:{}),...(mattress?{mattress}:{})},
      anchor:fixturePoint(f,0,0,y),
      ...(h>plan.clearHeight-.21?{anchors:[[-f.width/2-.08,0],[f.width/2+.08,0],[0,-f.depth/2-.08],[0,f.depth/2+.08]].map(([x,z])=>fixturePoint(f,x,z,elevation+Math.min(h-.20,plan.clearHeight-.22)))}:{}),
      lines:[[fixturePoint(f,-f.width/2,f.depth/2,y-.04),fixturePoint(f,f.width/2,f.depth/2,y-.04)]],
      datum:'Furniture footprint; explicit heights follow the model. Mattress sizes are separate from the frame.'});
  }
  for(const wall of plan.walls||[]){
    const dx=wall.b[0]-wall.a[0],dz=wall.b[1]-wall.a[1],length=Math.hypot(dx,dz);
    if(length<EPS)continue;
    const axis=[dx/length,dz/length],normal=[-axis[1],axis[0]];
    for(const [index,o]of (wall.openings||[]).entries()){
      if(!['window','door','passage','hst','balcony-door','garage-door'].includes(o.type))continue;
      const lo=Math.max(0,o.offset),hi=Math.min(length,o.offset+o.width),sill=Math.max(0,o.sill||0),height=Math.min(o.height,wall.height-sill);
      if(hi-lo<EPS||height<EPS)continue;
      const mid=[wall.a[0]+axis[0]*(lo+hi)/2,wall.a[1]+axis[1]*(lo+hi)/2],roomIds=openingRooms(plan,wall,o,mid,normal);
      const labelY=elevation+sill+height*.72,clearance=wall.thickness/2+.075;
      const anchors=[-1,1].map(sign=>[mid[0]+normal[0]*sign*clearance,labelY,mid[1]+normal[1]*sign*clearance]);
      const title=({window:'Window',door:'Door',passage:'Opening',hst:'Terrace sliders','balcony-door':'Balcony sliders','garage-door':'Garage opening'})[o.type];
      records.push({id:`interior-${floor}-opening-${wall.id}-${index}`,kind:'opening',feature:`${wall.id}-${index}`,floor,roomIds,priority:1,
        title,text:metres(hi-lo,height),description:`${title}: modeled wall opening ${metres(hi-lo,height)}; sill ${fmt(sill)} m above this floor.`,
        metrics:{width:hi-lo,height,sill},anchor:[mid[0],labelY,mid[1]],anchors,
        lines:[[[wall.a[0]+axis[0]*lo,elevation+sill+.045,wall.a[1]+axis[1]*lo],[wall.a[0]+axis[0]*hi,elevation+sill+.045,wall.a[1]+axis[1]*hi]]],
        datum:'Wall aperture width × height; frame and open-leaf clearances are smaller.'});
    }
  }
  for(const stair of plan.stairs||[]){
    if(stair.kind==='exterior'||stair.kind==='hatch'||stair.from!==floor)continue;
    const b=ringBounds(stair.polygon),alongX=Math.abs(stair.direction?.[0]||0)>Math.abs(stair.direction?.[1]||0),width=alongX?b.depth:b.width;
    records.push({id:`interior-${floor}-stair-${stair.id}`,kind:'stair',feature:stair.id,floor,roomIds:[],priority:3,
      title:'Stair',text:`${fmt(width)} m wide · ${fmt(stair.rise)} m rise`,description:`${stair.label}: ${fmt(width)} m flight envelope, ${fmt(stair.rise)} m rise over ${stair.steps} steps.`,
      metrics:{width,run:alongX?b.width:b.depth,rise:stair.rise,steps:stair.steps},anchor:[b.x,elevation+stair.rise*.5+.16,b.z],lines:[],datum:'Flight envelope and floor-to-floor rise; not a measured stair design.'});
  }
  return records;
}

/** Resolve the occupied storey from actual camera height, including free walk. */
export function interiorDimensionContext(plans,point,{floor,roomId,requireInside=false}={}){
  const [x,y,z]=point,inside=plan=>containsPoint(plan.envelope.outline,x,z)&&y>=plan.elevation-.16&&y<=plan.elevation+plan.clearHeight+.18;
  let plan=requireInside?plans.find(inside):plans.find(p=>p.floor===floor)||plans[0];
  if(!plan)return null;
  const room=plan.rooms.find(r=>containsPoint(r.polygon,x,z))||(!requireInside?plan.rooms.find(r=>r.id===roomId):null);
  return {floor:plan.floor,roomId:room?.id||null,inside:inside(plan)};
}
