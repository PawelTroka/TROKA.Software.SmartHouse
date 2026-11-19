/**
 * Sternicza 11 appearance inferred from the user's street photograph.
 *
 * The cadastral footprint and measured roof evidence stay unchanged. Colours,
 * openings and architectural detail are approximate photo observations, not a
 * measured elevation survey. The unphotographed rear HST glazing / balcony door
 * are explicitly proposed alterations. Keep this file free of Three / DOM so
 * window viewpoints can use the same aperture coordinates as the renderer.
 */
import {getInteriorPlan} from './interior-plan.js?v=1.28.0';
import {sharedHouseFacades} from './house-model.js?v=1.28.0';
import {sterniczaRoofEnvelope,photoRoofEdgeHeight} from './house-roof.js?v=1.28.0';
const num=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
const xyz=p=>Array.isArray(p)?p:[p.x,p.y,p.z];
const openRing=ring=>ring?.length>1&&Math.hypot(ring[0][0]-ring.at(-1)[0],ring[0][1]-ring.at(-1)[1])<1e-8?ring.slice(0,-1):ring||[];
const EPS=1e-7;

export const HOUSE_APPEARANCE_NOTES=Object.freeze({
  source:'User-provided street photograph, November 2026; no public copy of the photograph is distributed.',
  observed:'Cream plaster, red-brown tiled pitched roof, brick raised basement, white paired window frames, brown entrance and dark metal stair rail.',
  assumptions:'Window dimensions, their position on the mapped walls and concealed elevations are photo-informed approximations. Fresh first-floor and attic levels follow the supplied archived section (+3.05 m and +5.75 m); edited and historical levels remain adjustable. The main roof planes fit source returns. A restrained street-front gable on the viewer-right side follows the photograph and explicitly overrides conflicting local roof returns; its dimensions and slopes are estimated.',
  proposed:'Rear living-room HST glazing, balcony access when selected, and the garage entrance / side-return entrance stair are renovation proposals. Applying the marked plans uses the broad rear HST and three first-floor room doors.',
});

export const photoHouseSupported=data=>Boolean(data?.site?.house?.footprint?.length>=4&&(!data.site.id||data.site.id==='sternicza-11'));

export function facadePoint(edge,distance,z,offset=0){
  return [edge.a[0]+edge.direction[0]*distance+edge.outward[0]*offset,
    edge.a[1]+edge.direction[1]*distance+edge.outward[1]*offset,z];
}

/** Pure aperture / entry description, in site x,y and absolute z metres. */
export function houseAppearanceLayout(data,settings={},options={}){
  if(!photoHouseSupported(data))return {supported:false,windows:[],edges:[]};
  if(data.site.house.architecturalModel){
    const shared=sharedHouseFacades(data,settings),roof=sterniczaRoofEnvelope(data.site.house),floorZ=shared.frame.floorZ;
    return{...shared,supported:true,ring:roof.ring,baseZ:data.site.house.baseZ,floorZ,firstFloorZ:floorZ+num(settings.firstFloorRise,3.05),
      plinthTopZ:floorZ-.045,atticWindow:null,entryAccess:options.garageLayout?.enabled?options.garageLayout.entryAccess:null,
      roof:{samples:[],eavesZ:roof.eavesZ,ridgeZ:roof.ridgeZ,shape:'registered-archived-plan',envelope:roof},
      notes:{...HOUSE_APPEARANCE_NOTES,assumptions:roof.provenance.main+' '+roof.provenance.crossGable,
        proposed:'One shared house model supplies the layout, furniture, facade apertures and balcony in both views.'}};
  }
  const house=data.site.house,ring=openRing(house.footprint).map(p=>p.slice(0,2)),roofEnvelope=sterniczaRoofEnvelope(house);
  const area=ring.reduce((sum,p,i)=>sum+p[0]*ring[(i+1)%ring.length][1]-ring[(i+1)%ring.length][0]*p[1],0);
  const edges=ring.map((a,i)=>{
    const b=ring[(i+1)%ring.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]),direction=[(b[0]-a[0])/length,(b[1]-a[1])/length];
    return {index:i,a,b,length,direction,outward:area>0?[direction[1],-direction[0]]:[-direction[1],direction[0]],roofEdge:roofEnvelope.edges[i]};
  });
  const front=edges.reduce((a,b)=>(a.a[1]+a.b[1])<(b.a[1]+b.b[1])?a:b);
  const rear=edges.reduce((a,b)=>(a.a[1]+a.b[1])>(b.a[1]+b.b[1])?a:b);
  const samples=(house.roofPoints||[]).map(xyz).filter(p=>p.length>=3&&p.slice(0,3).every(Number.isFinite)).map(p=>p.slice(0,3));
  const floorZ=data.site.floorReference.z+num(settings.floorHeight,1.2),firstFloorZ=floorZ+num(settings.firstFloorRise,3);
  const baseZ=num(house.baseZ,2.37),eavesZ=roofEnvelope.eavesZ;
  const garage=options.garageLayout,activeGarage=Boolean(garage?.supported!==false&&garage?.enabled);
  const windows=[];
  const addWindow=(id,edge,centre,width,z,height,{source='photo-inferred',panes=2,level='living',kind='window'}={})=>{
    const item={id,edgeIndex:edge.index,centre,width,z,height,source,panes,level,kind,
      position:facadePoint(edge,centre,z),outward:edge.outward.slice(),lo:centre-width/2,hi:centre+width/2};
    const roofMin=Math.min(photoRoofEdgeHeight(edge.roofEdge,item.lo),photoRoofEdgeHeight(edge.roofEdge,item.hi),
      ...edge.roofEdge.points.filter((_,i)=>edge.roofEdge.fractions[i]*edge.length>item.lo&&edge.roofEdge.fractions[i]*edge.length<item.hi).map(p=>p[2]));
    if(z+height<roofMin-.1&&item.lo>.1&&item.hi<edge.length-.1){windows.push(item);return item;}
    return null;
  };
  // Broad front windows and narrower paired windows on the two side elevations.
  // Only one side is visible in the photograph; the opposite repeats its rhythm.
  for(const [row,z]of [['living',floorZ+.62],['first',firstFloorZ+.62]]){
    addWindow(`front-${row}-west`,front,front.length*.22,1.86,z,1.72,{level:row});
    addWindow(`front-${row}-east`,front,front.length*.77,1.48,z,1.72,{level:row});
    for(const edge of edges.filter(edge=>edge!==front&&edge!==rear))for(const [i,t]of [.27,.73].entries())
      addWindow(`side-${edge.index}-${row}-${i}`,edge,edge.length*t,1.12,z,1.72,{level:row,source:edge.outward[0]>0?'photo-inferred':'concealed-side-assumption'});
  }
  for(const edge of edges.filter(edge=>edge!==rear))for(const [i,t]of [.27,.73].entries())
    if(floorZ-baseZ>.72)addWindow(`basement-${edge.index}-${i}`,edge,edge.length*t,.48,baseZ+.18,Math.min(.78,floorZ-baseZ-.36),{level:'basement',panes:1,source:edge===front?'front-basement-assumption':'photo-inferred'});
  const terrace=data.site.terrace,project=(edge,x)=>(x-edge.a[0])/edge.direction[0];
  const bayX0=terrace.x,bayX1=terrace.x+terrace.width,mid=(bayX0+bayX1)/2;
  const linkedPlans=settings.planExteriorApplied===true;
  const drawingX=x=>mid+10.77/2-x; // Plan has garden at top; site +x is the opposite horizontal direction.
  const sourceGlazing=linkedPlans?getInteriorPlan({floor:'ground',layout:'renovation'}).walls.find(w=>w.id==='garden-hst'):null;
  const rearBays=sourceGlazing?sourceGlazing.openings.map((o,i)=>addWindow(`rear-hst-${i}`,rear,
    project(rear,drawingX(sourceGlazing.a[0]+o.offset+o.width/2)),o.width,floorZ+.025,o.height,
    {source:'annotated-plan-renovation',panes:4,kind:'hst'})):
    [[bayX0,mid-.17],[mid+.17,bayX1]].map(([x0,x1],i)=>{
      const a=project(rear,x0),b=project(rear,x1);
      return addWindow(`rear-hst-${i}`,rear,(a+b)/2,Math.abs(b-a),floorZ+.025,2.65,{source:'renovation-proposal',panes:2,kind:'hst'});
    });
  const balcony=Boolean(settings.canopyEnabled&&settings.terraceCoverType==='balcony');
  let balconyDoor=null;
  if(linkedPlans&&balcony){
    const facade=getInteriorPlan({floor:'first',layout:'renovation'}).walls.find(w=>w.id==='balcony-facade');
    const doors=(facade?.openings||[]).map((o,i)=>addWindow(`rear-balcony-room-${i}`,rear,
      project(rear,drawingX(facade.a[0]+o.offset+o.width/2)),o.width,firstFloorZ,o.height,
      {level:'first',kind:'balcony-door',source:'annotated-plan-renovation'})).filter(Boolean);
    balconyDoor=doors[1]||doors[0]||null;
  }else{
    for(const [i,x]of [Math.min(...ring.map(p=>p[0]))+3.25,Math.min(...ring.map(p=>p[0]))+7.85].entries())
      addWindow(`rear-first-${i}`,rear,project(rear,x),1.6,firstFloorZ+.62,1.72,{level:'first',source:'unphotographed-rear-assumption'});
    if(balcony){
      const centre=project(rear,mid),width=1.6;
      for(let i=windows.length-1;i>=0;i--)if(windows[i].edgeIndex===rear.index&&windows[i].level==='first'&&windows[i].lo<centre+width/2+.12&&windows[i].hi>centre-width/2-.12)windows.splice(i,1);
      balconyDoor=addWindow('rear-balcony-access',rear,centre,width,firstFloorZ,2.15,{level:'first',kind:'balcony-door',source:'renovation-proposal'});
    }
  }
  const doorX=num(garage?.entryAccess?.doorCenter?.[0],9.16),doorDistance=project(front,doorX);
  const door={id:'front-entrance',edgeIndex:front.index,centre:doorDistance,width:1.12,z:floorZ,height:2.35,
    position:facadePoint(front,doorDistance,floorZ),source:'photo-inferred',lo:doorDistance-.56,hi:doorDistance+.56};
  const portal=activeGarage&&garage.portal?{
    edgeIndex:front.index,centre:(garage.portal.center[0]-front.a[0])*front.direction[0]+(garage.portal.center[1]-front.a[1])*front.direction[1],
    width:garage.portal.width,z:garage.portal.bottomZ,height:garage.portal.topZ-garage.portal.bottomZ,
  }:null;
  if(portal){
    portal.lo=portal.centre-portal.width/2;portal.hi=portal.centre+portal.width/2;
    for(let i=windows.length-1;i>=0;i--){const w=windows[i];if(w.edgeIndex===front.index&&w.lo<portal.hi+EPS&&w.hi>portal.lo-EPS&&w.z<portal.z+portal.height+EPS&&w.z+w.height>portal.z-EPS)windows.splice(i,1);}
  }
  const entryAccess=activeGarage&&garage.entryAccess?.proposed?garage.entryAccess:null;
  // Keep the side-gable glass and its bounding rectangle on the same roof peak.
  const side=edges.find(e=>e!==front&&e!==rear&&e.outward[0]>0);
  let atticWindow=null;
  if(side){
    const peak=side.roofEdge.points.reduce((a,b)=>a[2]>=b[2]?a:b);
    const centre=(peak[0]-side.a[0])*side.direction[0]+(peak[1]-side.a[1])*side.direction[1];
    atticWindow={id:'side-attic-triangle',edgeIndex:side.index,centre,lo:centre-.42,hi:centre+.42,z:peak[2]-1.18,height:.78};
  }
  return {supported:true,ring,edges,front,rear,windows,door,rearBays,balconyDoor,portal,entryAccess,atticWindow,
    baseZ,floorZ,firstFloorZ,plinthTopZ:floorZ-.045,
    roof:{samples,eavesZ,ridgeZ:roofEnvelope.ridgeZ,source:house.source,shape:'source-fitted-main-and-inferred-cross-gable',envelope:roofEnvelope},
    notes:HOUSE_APPEARANCE_NOTES};
}

/** Real rendered aperture anchor for the first-floor window-plane presets. */
export function houseWindowAnchor(facing,data,settings={},level='first'){
  const layout=houseAppearanceLayout(data,settings);
  if(!layout.supported||level!=='first')return null;
  const window=facing==='street'?layout.windows.find(w=>w.id==='front-first-west'||w.id==='first-street-left-0'):
    layout.balconyDoor||layout.windows.find(w=>w.id==='rear-first-0'||w.id==='first-garden-facade-0');
  if(!window)return null;
  const edge=layout.edges[window.edgeIndex],p=facadePoint(edge,window.centre,window.z),facadeOffset=.25;
  return {x:p[0]+edge.outward[0]*facadeOffset,y:p[1]+edge.outward[1]*facadeOffset,
    facadePosition:{x:p[0],y:p[1]},facadeOffset,windowId:window.id,source:window.source};
}
