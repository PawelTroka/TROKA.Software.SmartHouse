import {footprintFit} from './footprint-fit.js?v=1.37.0';
import {facadePoint,houseAppearanceLayout} from './house-appearance.js?v=1.37.0';
/**
 * One finite terrace-cover model for drawing, shade and sightlines. Dimensions
 * are proposals, in local metres; z is absolute elevation. A balcony replaces
 * the canopy and its finished floor follows the first-floor datum.
 */
export const TERRACE_COVER_DEFAULTS=Object.freeze({terraceCoverType:'canopy'});
export const TERRACE_COVER_TYPES=Object.freeze(['canopy','balcony']);
export const TERRACE_COVER_GEOMETRY_KEYS=Object.freeze(['terraceCoverType','firstFloorRise']);
export const BALCONY_ASSUMPTIONS=Object.freeze({deckThickness:.25,guardHeight:1.10,
  columnWidth:.18,beamDepth:.24,beamWidth:.24,guardPostWidth:.045,glassThickness:.014});

const EPS=1e-8;
const number=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
const point=value=>Array.isArray(value)?value:[value.x,value.y,value.z];
const corners=box=>[[box.x0,box.y0],[box.x1,box.y0],[box.x1,box.y1],[box.x0,box.y1]];
const overlaps=(a,b)=>a.x0<b.x1-EPS&&a.x1>b.x0+EPS&&a.y0<b.y1-EPS&&a.y1>b.y0+EPS;

// Use exactly the apertures admitted by the rendered facade's roof check.
// The cache is independent of deck width so adjusting a support or narrowing
// the balcony rechecks the landing under the same door openings.
const doorCache=new WeakMap();
function linkedBalconyDoors(settings,data){
  const house=data.site.house;
  if(!house?.footprint||!data.site.floorReference)return [];
  const key=[settings.designStyle,settings.interiorLayout,settings.floorHeight,settings.firstFloorRise,settings.atticRise,data.site.floorReference.z,
    data.site.terrace.x+data.site.terrace.width/2].join('|');
  const prior=doorCache.get(house);
  if(prior?.key===key)return prior.doors;
  const facade=houseAppearanceLayout(data,settings);
  const names=['Master bedroom','Main office','Guest bedroom I'];
  const registered=Boolean(house.architecturalModel);
  const doors=facade.windows.filter(w=>w.kind==='balcony-door'&&w.height>=1.90&&
    (registered?w.level==='first':w.source==='annotated-plan-renovation')).map(w=>{
    const index=Number(w.id.split('-').at(-1)),edge=facade.edges[w.edgeIndex];
    const a=facadePoint(edge,w.lo,w.z).slice(0,2),b=facadePoint(edge,w.hi,w.z).slice(0,2);
    return {id:w.id,label:names[index],x:w.position[0],y:w.position[1],z:w.z,width:w.width,
      height:w.height,a,b,proposed:true};
  });
  doorCache.set(house,{key,doors});
  return doors;
}

export function terraceCoverType(settings={},data){
  const siteId=data?.site?.id||settings.siteId||'sternicza-11';
  return siteId==='sternicza-11'&&settings.terraceCoverType==='balcony'?'balcony':'canopy';
}

/** Context avoids importing geometry.js back into itself. Pass the exact floor
 * and ground references and optional jacuzzi bounds, including serviceAccess.
 * Glass is visible but has opaque:false: it gives no opaque-screen credit.
 */
export function terraceCoverLayout(settings={},data,context={}){
  const type=terraceCoverType(settings,data),floorZ=number(context.floorZ,NaN),terrace=data?.site?.terrace;
  const registered=Boolean(data?.site?.house?.architecturalModel);
  const originalRegistered=registered&&(!settings.designStyle||settings.designStyle==='current');
  const result={type,enabled:false,boxes:[],supports:[],footprints:[],warnings:[],assumptions:[],floorZ,
    bounds:null,access:null,accesses:[],viewpoint:null,deckArea:0,clearBelow:0};
  if(!terrace||!Number.isFinite(floorZ))return result;
  const x=(terrace.x||0)+terrace.width/2,y0=data.site.rearMidpoint[1];
  const width=Math.max(0,number(settings.canopyWidth,8.5)),depth=Math.max(0,number(settings.canopyDepth,4));
  const x0=x-width/2,x1=x+width/2,y1=y0+depth;
  const rise=type==='balcony'?Math.max(.25,number(settings.firstFloorRise,3)):Math.max(0,number(settings.canopyHeight,3));
  const topZ=floorZ+rise,slab=type==='balcony'?BALCONY_ASSUMPTIONS.deckThickness:.15;
  const fascia=type==='balcony'?slab:Math.max(0,number(settings.fasciaDepth,.3));
  result.bounds={x0,x1,y0,y1,z:topZ,fasciaBottomZ:topZ-fascia};
  Object.assign(result,{width,depth,topZ,deckTopZ:type==='balcony'?topZ:null,
    undersideZ:type==='balcony'?topZ-slab:topZ,clearBelow:rise-(type==='balcony'?slab:fascia),deckArea:width*depth});
  if(settings.canopyEnabled!==true||width<=EPS||depth<=EPS)return result;
  result.enabled=true;
  const add=(id,part,label,a,b,c,d,z0,z1,opaque=true)=>{
    if(![a,b,c,d,z0,z1].every(Number.isFinite)||c-a<=EPS||d-b<=EPS||z1-z0<=EPS)return null;
    const box={id:`cover-${type}-${id}`,group:'terrace-cover',type,part,label,x0:a,y0:b,x1:c,y1:d,z0,z1,opaque};
    result.boxes.push(box);return box;
  };
  const deck={x0:terrace.x,x1:terrace.x+terrace.width,y0,y1:y0+Math.max(0,number(settings.terraceDepth,terrace.depth))};
  const grade=(a,b)=>number(context.groundAt?.(a,b),floorZ);
  const supportBase=box=>corners(box).every(p=>p[0]>=deck.x0-EPS&&p[0]<=deck.x1+EPS&&p[1]>=deck.y0-EPS&&p[1]<=deck.y1+EPS)
    ?floorZ:grade((box.x0+box.x1)/2,(box.y0+box.y1)/2);
  const support=(id,a,b,c,d,endZ)=>{
    const box={x0:a,y0:b,x1:c,y1:d},base=supportBase(box);
    const primitive=add(id,'post',type==='balcony'?'Balcony support':'Canopy support',a,b,c,d,base,Math.max(base+.1,endZ));
    if(primitive)result.supports.push(primitive);
    return primitive;
  };
  if(type==='canopy'){
    add('roof','roof','Terrace canopy roof',x0,y0,x1,y1,topZ,topZ+.15);
    if(fascia>EPS){
      add('front-fascia','fascia','Canopy front fascia',x0,y1-.075,x1,y1+.075,topZ-fascia,topZ);
      add('right-fascia','fascia','Canopy right fascia',x0,y0,x0+.13,y1,topZ-fascia,topZ);
      add('left-fascia','fascia','Canopy left fascia',x1-.13,y0,x1,y1,topZ-fascia,topZ);
    }
    result.supportSystem='cantilever';
    result.assumptions.push('Column-free cantilever canopy concept. The house connection, backspan and structure need an engineer; no freestanding columns are modelled.');
    result.assumptions.push('The canopy is a roof proposal, without an occupiable floor or guardrail. Its height is measured above the living terrace.');
  }else{
    const a=BALCONY_ASSUMPTIONS,deckBottom=topZ-a.deckThickness,beamBottom=deckBottom;
    add('slab','slab','Cantilever balcony deck',x0,y0,x1,y1,deckBottom,topZ);
    result.supportSystem='cantilever';
    const railHalf=a.guardPostWidth/2,railTop=topZ+a.guardHeight;
    const edges=[['front',[x0+.035,y1-.035],[x1-.035,y1-.035]],
      ['right',[x0+.035,y0+.035],[x0+.035,y1-.035]],
      ['left',[x1-.035,y0+.035],[x1-.035,y1-.035]]];
    const railPostKeys=new Set();
    for(const [edge,start,end]of edges){
      const horizontal=Math.abs(end[0]-start[0])>EPS,length=Math.hypot(end[0]-start[0],end[1]-start[1]);
      const intervals=Math.max(1,Math.ceil(length/1.2));
      add(`${edge}-rail`,'rail','Balcony top rail',Math.min(start[0],end[0])-railHalf,Math.min(start[1],end[1])-railHalf,
        Math.max(start[0],end[0])+railHalf,Math.max(start[1],end[1])+railHalf,railTop-a.guardPostWidth,railTop);
      for(let i=0;i<=intervals;i++){
        const px=start[0]+(end[0]-start[0])*i/intervals,py=start[1]+(end[1]-start[1])*i/intervals;
        const key=`${px.toFixed(5)}:${py.toFixed(5)}`;
        if(!railPostKeys.has(key))add(`${edge}-rail-post-${i}`,'rail-post','Balcony guard post',px-railHalf,py-railHalf,px+railHalf,py+railHalf,topZ,railTop);
        railPostKeys.add(key);
        if(i<intervals){
          const qx=start[0]+(end[0]-start[0])*(i+1)/intervals,qy=start[1]+(end[1]-start[1])*(i+1)/intervals;
          const glassHalf=a.glassThickness/2;
          add(`${edge}-glass-${i}`,'glass','Clear balcony guard glazing',
            horizontal?px+railHalf:px-glassHalf,horizontal?py-glassHalf:py+railHalf,
            horizontal?qx-railHalf:qx+glassHalf,horizontal?qy+glassHalf:qy-railHalf,
            topZ+.08,railTop-.065,false);
        }
      }
    }
    if(registered||settings.planExteriorApplied===true){
      result.accesses=linkedBalconyDoors(settings,data).map(door=>{
        // The surveyed facade is rotated slightly relative to the level
        // rectangular deck. Both jambs must lie over its width at the seam.
        const fitsDeck=[door.a,door.b].every(([x,y])=>x>=x0-EPS&&x<=x1+EPS&&Math.abs(y-y0)<.05)
          &&Math.abs(door.z-topZ)<.02;
        return {...door,fitsDeck};
      });
      result.access=result.accesses.find(door=>door.id==='rear-balcony-room-1')??result.accesses[0]??null;
      result.accessFits=result.accesses.length===3&&result.accesses.every(door=>door.fitsDeck);
      if(originalRegistered&&!result.accesses.length)result.warnings.push(
        'Current retains the original first-floor windows, with no balcony access door. Choose a renovation style to add the three balcony doors before treating this deck as accessible.');
      else if(result.accesses.length<3)result.warnings.push(
        `Only ${result.accesses.length} of the three marked balcony doors fit below the mapped roof at this floor level.`);
      const unsupported=result.accesses.filter(door=>!door.fitsDeck).map(door=>door.label);
      if(unsupported.length)result.warnings.push(
        `The balcony deck does not meet the full doorway at ${unsupported.join(', ')}. Widen or reposition the deck before using these accesses.`);
    }else{
      result.access={x,y:y0,z:topZ,width:Math.min(1.6,Math.max(.8,width-.4)),height:2.1,proposed:true};
      result.accesses=[result.access];
    }
    result.viewpoint={x,y:y1-Math.min(.65,depth*.35),groundZ:topZ,z:topZ+1.65,eyeHeight:1.65,
      preset:'balcony',surface:'balcony',label:'Balcony · standing',defaultLookYaw:0,defaultLookPitch:-8};
    result.guardHeight=a.guardHeight;result.deckThickness=a.deckThickness;
    result.minimumCoveredHeight=beamBottom-floorZ;
    result.assumptions.push('The balcony replaces the canopy. Its finished deck follows the editable first-floor level, as a column-free cantilever concept with an illustrative 0.25 m deck and 1.10 m guardrail. The section thickness is not a structural design.',
      originalRegistered?'Current preserves the archived first-floor windows. The proposed deck has no modelled house access; choose a renovation style to add the three marked doors. Its structure, foundations, waterproofing, drainage and guards require project design.':
        registered||settings.planExteriorApplied?'The three marked garden-facing door openings, structure, foundations, waterproofing, drainage and guards require project design.':'A new garden-facing first-floor access door, structure, foundations, waterproofing, drainage and guard details require project design; the dimensions are not an engineered approval.',
      'Guard glazing is treated as clear: it gives no opaque privacy or shade credit. Only the actual slab and guard rails are counted; there are no support columns or downstand front beam.');
    if(width<2||depth<1.5)result.warnings.push('The selected balcony is narrow or shallow. Check a usable door landing and circulation before treating it as an occupiable layout.');
    if(beamBottom-floorZ<2.2)result.warnings.push('The proposed balcony underside leaves less than 2.20 m above the terrace. Check the floor level and structure.');
  }
  result.footprints.push({id:`terrace-${type}`,group:'terrace-cover',type,label:type==='balcony'?'First-floor balcony':'Terrace canopy',
    x:x0,y:y0,width,length:depth,baseZ:result.undersideZ,topZ,area:width*depth});
  if(data.site.boundary?.length&&result.boxes.some(box=>footprintFit(corners(box),data.site.boundary).location!=='inside'))
    result.warnings.push('A terrace-cover deck, beam or support extends outside the mapped plot. Reduce its dimensions or revise the support positions.');
  const tub=context.jacuzzi;
  if(tub&&result.supports.some(box=>overlaps(box,tub)))result.warnings.push('A terrace-cover support overlaps the jacuzzi. Revise the support positions or cover dimensions.');
  if(tub?.serviceAccess&&result.supports.some(box=>overlaps(box,tub.serviceAccess)))
    result.warnings.push('A terrace-cover support enters the jacuzzi service zone. Keep technical access clear or revise the support positions.');
  return result;
}

/** Exact ray/box intersections; transparent guard panels are omitted. */
export function terraceCoverIntersection(observer,target,layout){
  if(!layout?.enabled)return null;
  const a=point(observer),b=point(target);let nearest=null;
  for(const box of layout.boxes){
    if(box.opaque===false)continue;
    let enter=-Infinity,exit=Infinity,miss=false;
    for(const [axis,low,high]of [[0,box.x0,box.x1],[1,box.y0,box.y1],[2,box.z0,box.z1]]){
      const delta=b[axis]-a[axis];
      if(Math.abs(delta)<EPS){if(a[axis]<low-EPS||a[axis]>high+EPS){miss=true;break;}continue;}
      const first=(low-a[axis])/delta,last=(high-a[axis])/delta;
      enter=Math.max(enter,Math.min(first,last));exit=Math.min(exit,Math.max(first,last));
      if(enter>exit+EPS){miss=true;break;}
    }
    const t=enter>1e-5?enter:exit;
    if(miss||!Number.isFinite(t)||t<=1e-5||t>=1-1e-5)continue;
    if(!nearest||t<nearest.t)nearest={t,x:a[0]+(b[0]-a[0])*t,y:a[1]+(b[1]-a[1])*t,z:a[2]+(b[2]-a[2])*t,
      id:box.id,type:layout.type,part:box.part,label:box.label};
  }
  return nearest;
}

export function terraceCoverViewpoint(layout,eyeHeight=1.65){
  if(!layout?.enabled||layout.type!=='balcony'||!layout.viewpoint)return null;
  const height=Math.max(.2,number(eyeHeight,1.65));
  return {...layout.viewpoint,eyeHeight:height,z:layout.deckTopZ+height};
}
