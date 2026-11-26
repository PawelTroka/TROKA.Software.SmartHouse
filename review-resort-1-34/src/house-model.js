/** Shared architectural coordinates. All renderers consume these same plans.
 * The drawing is registered without scaling to the middle of the surveyed
 * street wall. The source survey remains attached for provenance/comparison. */
import {getInteriorPlan,INTERIOR_DIMENSIONS} from './interior-plan.js?v=1.34.0';
import {garagePlanFrame} from './garage-ramp.js?v=1.34.0';
import {renovatePlanOpenings} from './renovation-architecture.js?v=1.34.0';
const num=(n,f)=>Number.isFinite(Number(n))?Number(n):f;
export function houseModelFrame(data,settings={}){
  const house=data?.site?.house,source=house?.sourceFootprint||house?.footprint;
  if(!source?.length)return null;
  const ring=source.slice(0,-1),edges=ring.map((a,i)=>({a,b:ring[(i+1)%ring.length]}));
  const front=edges.reduce((a,b)=>a.a[1]+a.b[1]<b.a[1]+b.b[1]?a:b);
  let [a,b]=[front.a,front.b];if(a[0]>b[0])[a,b]=[b,a];
  const length=Math.hypot(b[0]-a[0],b[1]-a[1]),ex=[(b[0]-a[0])/length,(b[1]-a[1])/length],ey=[-ex[1],ex[0]];
  const middle=[(a[0]+b[0])/2,(a[1]+b[1])/2];
  const origin=[middle[0]+ey[0]*9+ex[0]*5.385,middle[1]+ey[1]*9+ex[1]*5.385];
  const floorZ=num(data.site.floorReference?.z,0)+num(settings.floorHeight,1.2);
  const toSite=(x,z,elevation=0)=>[origin[0]-ex[0]*x-ey[0]*z,origin[1]-ex[1]*x-ey[1]*z,floorZ+elevation];
  const toLocal=(x,y,elevation=floorZ)=>{const dx=x-origin[0],dy=y-origin[1];return[-dx*ex[0]-dy*ex[1],-dx*ey[0]-dy*ey[1],elevation-floorZ];};
  return{origin,ex,ey,floorZ,rotationY:Math.PI-Math.atan2(ex[1],ex[0]),toSite,toLocal};
}
export function houseModelKey(settings={}){
  return JSON.stringify(['designStyle','interiorLayout','floorHeight','firstFloorRise','atticRise','basementGarageEnabled',
    'garageClearHeight','garageExtraDepth','garageSlabThickness','garageInsideRun','garageRampWidth','garageBottomApron',
    'terraceWidth','terraceDepth','hstOpen','canopyEnabled','terraceCoverType','canopyDepth','canopyWidth'].map(k=>settings[k]));
}
export function getHouseFloorPlan({floor='ground',settings={},data}={}){
  const layout=settings.designStyle&&settings.designStyle!=='current'?'renovation':'existing';
  const converted=floor==='basement'&&settings.basementGarageEnabled===true;
  const garageFrame=converted&&data?garagePlanFrame(settings,data):null;
  // The garage is an independently selected engineering study, in both views.
  const plan=getInteriorPlan({floor,layout:converted?'renovation':layout,styleId:settings.designStyle||'current',garageVariant:converted?'two-car':'cellar',garageSettings:{...settings,...(garageFrame?.architecturalGarageBounds?{architecturalGarageBounds:garageFrame.architecturalGarageBounds}:{})}});
  const first=num(settings.firstFloorRise,3.05),attic=num(settings.atticRise,5.75);
  const basement=settings.basementGarageEnabled===true?-(num(settings.garageClearHeight,2.3)+num(settings.garageExtraDepth,0)+num(settings.garageSlabThickness,.25)):-2;
  const levels={ground:0,first,attic,basement:floor==='basement'?plan.elevation:basement};
  const previous=plan.clearHeight;
  if(floor==='ground')plan.clearHeight=Math.max(.05,first-.30);
  if(floor==='first')plan.clearHeight=Math.max(.05,attic-first);
  if(['ground','first'].includes(floor)&&plan.clearHeight<2.3)plan.issues.unshift('The edited floor levels leave only '+plan.clearHeight.toFixed(2)+' m of clear room height. Furniture and use need reconsideration; the model does not increase the available space.');
  plan.elevation=levels[floor];plan.slabThickness=floor==='first'?.30:.20;
  plan.walls=plan.walls.map(w=>{const height=Math.abs(w.height-previous)<.001?plan.clearHeight:w.height;
    return{...w,height,openings:w.openings.filter(o=>(o.sill||0)<height).map(o=>({...o,height:Math.min(o.height,height-(o.sill||0))}))};});
  if(converted)plan.walls=plan.walls.map(w=>w.id==='garage-portal'?{...w,openings:w.openings.map(o=>({...o,height:plan.clearHeight}))}:w);
  const canonicalMain=floor==='first'?getInteriorPlan({floor:'ground',layout}).stairs.find(s=>s.id==='main-stair'):null;
  plan.stairs=plan.stairs.map(s=>({
    ...s,
    ...(s.id==='main-stair'?{geometryOwner:'ground',...(canonicalMain?{
      sourcePolygon:s.polygon.map(p=>p.slice()),polygon:canonicalMain.polygon.map(p=>p.slice()),
      direction:canonicalMain.direction.slice(),steps:canonicalMain.steps,
    }:{})}:{}),
    rise:s.from==='ground'&&s.to==='first'?first:s.to==='attic'?attic-first:s.id==='cellar-stair'&&layout==='renovation'?-basement:s.rise,
  }));
  if(canonicalMain)plan.issues.push(layout==='renovation'?'The renovation aligns the main floor opening with the stair footprint and adds a compact attic stair. Survey stair pitch, landings, structure and headroom before detailed design.':'The shared main stair uses the ground-plan footprint on both floors. The archived first-floor opening remains in its drawn position; the differing outlines need a measured alignment and headroom check.');
  if(settings.basementGarageEnabled){plan.stairs=plan.stairs.filter(s=>s.kind!=='exterior');plan.outdoor=plan.outdoor.filter(p=>p.kind!=='landing');}
  plan.roof={...plan.roof,ridgeElevation:attic+3,chimneyElevation:attic+3.85};
  const frame=houseModelFrame(data,settings);
  if(frame){
    const t=data.site.terrace,center=t.x+t.width/2,y0=frame.toSite(5.385,0)[1];
    const platform=(kind,width,depth)=>({id:kind,label:kind==='balcony'?'Shared garden balcony':'Shared garden terrace',kind,depth,
      polygon:[[center-width/2,y0],[center+width/2,y0],[center+width/2,y0+depth],[center-width/2,y0+depth]].map(p=>frame.toLocal(...p).slice(0,2))});
    plan.outdoor=plan.outdoor.filter(p=>p.kind!=='terrace'&&p.kind!=='balcony');
    if(floor==='ground')plan.outdoor.push(platform('terrace',num(settings.terraceWidth,t.width),num(settings.terraceDepth,t.depth)));
    if(floor==='first'&&settings.canopyEnabled&&settings.terraceCoverType==='balcony')plan.outdoor.push(platform('balcony',num(settings.canopyWidth,10.77),num(settings.canopyDepth,4)));
  }
  plan.modelSource='shared-house';
  return renovatePlanOpenings(plan,{styleId:settings.designStyle||'current',hstOpen:settings.hstOpen});
}

/** Storey-specific facades. The same aperture dimensions cut the 3D walls and
 * locate viewpoints, balcony doors, and renovation cladding. */
export function sharedHouseFacades(data,settings={}){
  const frame=houseModelFrame(data,settings),edges=[],windows=[];let door=null,portal=null,architectureProposal=null;
  if(!frame)return null;
  for(const floor of ['basement','ground','first']){
    const plan=getHouseFloorPlan({floor,settings,data});
    architectureProposal=plan.architectureProposal||architectureProposal;
    for(const wall of plan.walls.filter(w=>w.exterior)){
      const dx=wall.b[0]-wall.a[0],dz=wall.b[1]-wall.a[1],length=Math.hypot(dx,dz),axis=[dx/length,dz/length];
      let outward=[axis[1],-axis[0]],mid=[(wall.a[0]+wall.b[0])/2,(wall.a[1]+wall.b[1])/2];
      if(outward[0]*(mid[0]-5.385)+outward[1]*(mid[1]-4.5)<0)outward=outward.map(x=>-x);
      const a=frame.toSite(wall.a[0]+outward[0]*wall.thickness/2,wall.a[1]+outward[1]*wall.thickness/2).slice(0,2);
      const b=frame.toSite(wall.b[0]+outward[0]*wall.thickness/2,wall.b[1]+outward[1]*wall.thickness/2).slice(0,2);
      const direction=[(b[0]-a[0])/length,(b[1]-a[1])/length];
      const outer=[-frame.ex[0]*outward[0]-frame.ey[0]*outward[1],-frame.ex[1]*outward[0]-frame.ey[1]*outward[1]];
      const baseZ=frame.floorZ+plan.elevation,topZ=baseZ+wall.height,index=edges.length;
      const edge={index,id:`${floor}-${wall.id}`,floor,a,b,length,direction,outward:outer,baseZ,topZ,
        roofEdge:{index,length,points:[[...a,topZ],[...b,topZ]],fractions:[0,1]}};
      edges.push(edge);
      for(const [i,o]of wall.openings.entries()){
        const centre=o.offset+o.width/2,z=baseZ+(o.sill||0),position=[a[0]+direction[0]*centre,a[1]+direction[1]*centre,z];
        const id=o.type==='hst'?`rear-hst-${i}`:o.type==='balcony-door'?`rear-balcony-room-${i}`:`${floor}-${wall.id}-${i}`;
        const record={id,edgeIndex:index,centre,width:o.width,z,height:o.height,source:o.source||(plan.layout==='renovation'?'annotated-plan-renovation':'archived-plan'),
          panes:o.panes??(o.type==='hst'?4:2),level:floor==='ground'?'living':floor,kind:o.type,position,outward:outer.slice(),lo:o.offset,hi:o.offset+o.width,
          ...(o.architectureStyle?{architectureStyle:o.architectureStyle,transoms:o.transoms,frameWidth:o.frameWidth,glazing:o.glazing,operation:o.operation,privacy:o.privacy,roomId:o.roomId}:{} )};
        if(o.type==='garage-door')portal=record;
        else if(floor==='ground'&&o.type==='door'&&wall.id==='street-facade')door=record;
        else if(['window','hst','balcony-door'].includes(o.type))windows.push(record);
      }
    }
  }
  const front=edges.find(e=>e.id==='ground-street-facade'),rear=edges.find(e=>e.floor==='ground'&&/garden/.test(e.id));
  return{frame,edges,windows,front,rear,door,portal,rearBays:windows.filter(w=>w.kind==='hst'),balconyDoor:windows.find(w=>w.kind==='balcony-door')||null,
    ...(architectureProposal?{architectureProposal}:{})};
}
