/**
 * Site-specific privacy geometry. All distances are metres. Plan coordinates are
 * local x/y; z is absolute PL-EVRF2007-NH elevation. No render-library dependency.
 * Samples and ideal opaque screens are a design study, not a site survey.
 */
import {screeningTreeVolumes,firstTreeIntersection} from './screening-trees.js?v=1.12.0';
import {gardenProgram,spaEnabled,poolBounds} from './garden-program.js?v=1.12.0';
import {terraceStairs,rectanglesOverlap} from './layout.js?v=1.12.0';

export const DEFAULT_SETTINGS = Object.freeze({
  hedgeRear: 2.5, hedgeLeft: 2.5, hedgeRight: 2.5, hedgeFront: 0, hedgeInset: 0,
  gardenRaise: 0, bedRaise: 0, raiseNewHedges: true,
  floorHeight: 1.2, removeGarage: true,
  canopyEnabled: false, canopyDepth: 4.2, canopyHeight: 2.7,
  canopyWidth: 8.5, fasciaDepth: 0.3, terraceDepth: 4.2,
  includeHighFeatures: false,
  screeningTrees: Object.freeze([]), treeLeafMode: 'auto',
});

const EPS = 1e-8;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const number = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const point3 = p => Array.isArray(p) ? p : [p.x, p.y, p.z];
const settingsWithDefaults = s => ({ ...DEFAULT_SETTINGS, ...s });

/** Native-grid bilinear interpolation. Outside the supplied crop, clamp to edge. */
export function terrainAt(x, y, data) {
  const { localOriginEN: o, xUnitEN: ux, yUnitEN: uy } = data.coordinates;
  const t = data.terrain;
  const e = o[0] + x * ux[0] + y * uy[0];
  const n = o[1] + x * ux[1] + y * uy[1];
  const gx = clamp((e - t.originEN[0]) / t.cellSize, 0, t.columns - 1);
  const gy = clamp((n - t.originEN[1]) / t.cellSize, 0, t.rows - 1);
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const x1 = Math.min(x0 + 1, t.columns - 1), y1 = Math.min(y0 + 1, t.rows - 1);
  const fx = gx - x0, fy = gy - y0;
  const z = (i, j) => t.elevations[j * t.columns + i];
  return (1 - fy) * ((1 - fx) * z(x0, y0) + fx * z(x1, y0))
    + fy * ((1 - fx) * z(x0, y1) + fx * z(x1, y1));
}

/** Includes the boundary, useful for fill and observer-surface assignment. */
export function pointInPolygon(p, polygon) {
  let inside = false;
  const count = polygon.length - (samePoint(polygon[0], polygon.at(-1)) ? 1 : 0);
  for (let i = 0, j = count - 1; i < count; j = i++) {
    const a = polygon[j], b = polygon[i], edge = sub(b, a), ap = sub(p, a);
    if (Math.abs(cross(edge, ap)) < EPS && ap[0] * edge[0] + ap[1] * edge[1] >= -EPS
      && ap[0] * edge[0] + ap[1] * edge[1] <= edge[0] ** 2 + edge[1] ** 2 + EPS) return true;
    if ((a[1] > p[1]) !== (b[1] > p[1])
      && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function samePoint(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]) < EPS; }

/** Existing terrain plus proposed fill, only within the rear garden. */
export function gardenGroundAt(x, y, settings, data) {
  const fill = y >= data.site.rearMidpoint[1] - EPS && pointInPolygon([x, y], data.site.boundary)
    ? number(settings.gardenRaise) : 0;
  return terrainAt(x, y, data) + fill;
}

export function floorElevation(settings, data) {
  return data.site.floorReference.z + number(settings.floorHeight, 1.2);
}

/** Sample the actual mapped grade across a flat polygon pad, not just its centre. */
function padGradeRange(footprint,settings,data){
  const xs=footprint.map(p=>p[0]),ys=footprint.map(p=>p[1]);
  const x0=Math.min(...xs),y0=Math.min(...ys),w=Math.max(...xs)-x0,l=Math.max(...ys)-y0;
  const nx=Math.max(1,Math.ceil(w/.25)),ny=Math.max(1,Math.ceil(l/.25));
  const grades=footprint.map(p=>gardenGroundAt(...p,settings,data));
  for(let ix=0;ix<=nx;ix++)for(let iy=0;iy<=ny;iy++){
    const p=[x0+w*ix/nx,y0+l*iy/ny];
    if(pointInPolygon(p,footprint))grades.push(gardenGroundAt(...p,settings,data));
  }
  return {low:Math.min(...grades),high:Math.max(...grades)};
}
const footprintOf=r=>r.footprint||[[r.x,r.y],[r.x+r.width,r.y],[r.x+r.width,r.y+r.length],[r.x,r.y+r.length],[r.x,r.y]];

/** Even risers from the outer approach grade to the destination surface. */
function entryStepLevels(steps,finishZ,settings,data){
  const front=footprintOf(steps[0]),a=front[0],b=front[1];
  const approachZ=Math.max(...[a,b,[(a[0]+b[0])/2,(a[1]+b[1])/2]].map(p=>gardenGroundAt(...p,settings,data)));
  const riser=(finishZ-approachZ)/(steps.length+1);
  return {approachZ,riser,steps:steps.map((step,i)=>({...step,
    baseZ:padGradeRange(footprintOf(step),settings,data).low-.08,
    topZ:approachZ+(i+1)*riser}))};
}

/** Flat proposed pads use explicit references; they do not flatten the garden. */
export function spaLevels(settings={},data){
  const program=gardenProgram(settings,data),p=poolBounds(settings,data);
  let poolGround=p?gardenGroundAt(p.x+p.width/2,p.y+p.length/2,settings,data):null,poolLow=poolGround;
  if(program.active&&p){
    // The moved pool crosses sloping, locally uneven ground. Sample the whole
    // outer coping footprint, including its edges; a centre or four-corner
    // reference can bury its uphill edge in the measured terrain. The level
    // rim and its stone skirt do not flatten or raise the rest of the garden.
    const margin=p.coping,x0=p.x-margin,y0=p.y-margin,w=p.width+2*margin,l=p.length+2*margin;
    const nx=Math.ceil(w/.25),ny=Math.ceil(l/.25),grades=[];
    for(let ix=0;ix<=nx;ix++)for(let iy=0;iy<=ny;iy++)grades.push(gardenGroundAt(x0+w*ix/nx,y0+l*iy/ny,settings,data));
    poolGround=Math.max(...grades);poolLow=Math.min(...grades);
  }
  const result={active:program.active,pool:p?{groundZ:poolGround,waterZ:poolGround+p.waterOffset,
    bottomZ:poolGround+p.waterOffset-p.waterDepth,copingTopZ:poolGround+.075,
    copingBaseZ:program.active?poolLow-.08:poolGround-.045}:null,sauna:null,firepit:null,coldPlunge:null};
  if(!program.active)return result;
  const edge=['spa-edge','spa-compact','spa-screened','spa-grove'].includes(program.id);
  const highest=r=>Math.max(...r.footprint.map(q=>gardenGroundAt(q[0],q[1],settings,data)));
  const sa=program.sauna,sr=edge?padGradeRange(sa.footprint,settings,data):null,sg=sr?.high??highest(sa),sf=sg+sa.floorOffset;
  result.sauna={groundZ:sg,floorZ:sf,roofZ:sf+sa.height};
  if(edge){
    const entry=entryStepLevels(sa.entrySteps,sf,settings,data);
    Object.assign(result.sauna,{padBaseZ:sr.low-.08,entrySteps:entry.steps,entryGroundZ:entry.approachZ,entryRiser:entry.riser});
  }
  const f=program.firepit,fg=highest(f),ff=fg-f.depth;
  result.firepit={groundZ:fg,floorZ:ff,rimZ:fg,
    steps:f.steps.map(step=>({...step,topZ:fg-step.depth})),seatZ:ff+f.seatHeight};
  const c=program.coldPlunge,cp=c.pad??.18;
  const cr=edge?padGradeRange(footprintOf({x:c.x-cp,y:c.y-cp,width:c.width+2*cp,length:c.length+2*cp}),settings,data):null;
  const cg=cr?.high??highest(c),cw=cg+c.waterOffset;
  result.coldPlunge={groundZ:cg,baseZ:cg,rimZ:cg+c.height,waterZ:cw,bottomZ:cw-c.waterDepth,
    steps:edge?[]:c.steps.map(step=>({...step,topZ:cg+step.height}))};
  if(edge){
    const entry=entryStepLevels(c.steps,result.coldPlunge.rimZ,settings,data);
    Object.assign(result.coldPlunge,{padBaseZ:cr.low-.08,steps:entry.steps,entryGroundZ:entry.approachZ,entryRiser:entry.riser});
  }
  return result;
}

/** Only the pavilion's opaque construction; glazing never becomes a solid wall. */
export function saunaOpaqueFaces(settings={},data){
  const program=gardenProgram(settings,data);if(!program.active)return [];
  const sauna=program.sauna,levels=spaLevels(settings,data).sauna,faces=[];
  for(const [i,wall] of sauna.walls.entries()){
    const low=levels.floorZ+wall.bottom,high=levels.floorZ+wall.top;
    faces.push({id:`sauna-wall-${i}`,label:'Sauna wall',part:'wall',vertices:[
      [...wall.a,low],[...wall.b,low],[...wall.b,high],[...wall.a,high]]});
  }
  const ring=sauna.footprint.slice(0,-1),roofBottom=levels.roofZ-.10,padBottom=levels.padBaseZ??levels.groundZ-.6;
  for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length];
    faces.push({id:`sauna-roof-edge-${i}`,label:'Sauna roof edge',part:'wall',vertices:[
      [...a,roofBottom],[...b,roofBottom],[...b,levels.roofZ],[...a,levels.roofZ]]});
    faces.push({id:`sauna-pad-edge-${i}`,label:'Sauna raised pad',part:'wall',vertices:[
      [...a,padBottom],[...b,padBottom],[...b,levels.floorZ],[...a,levels.floorZ]]});
  }
  faces.push({id:'sauna-roof',label:'Sauna roof',part:'roof',vertices:ring.map(p=>[...p,levels.roofZ])});
  faces.push({id:'sauna-roof-underside',label:'Sauna roof underside',part:'roof',vertices:ring.map(p=>[...p,roofBottom])});
  faces.push({id:'sauna-floor',label:'Sauna floor',part:'floor',vertices:ring.map(p=>[...p,levels.floorZ])});
  return faces;
}

/** Construction conflicts are surfaced instead of claiming every slider fits. */
export function spaLayoutWarnings(settings={},data){
  const program=gardenProgram(settings,data);if(!program.active)return [];
  const warnings=[];
  if(['spa-edge','spa-compact','spa-screened','spa-grove'].includes(program.id))warnings.push('Near-boundary positions show conceptual clearances only. The sauna footprint and siting require project approval.');
  if(['spa-edge','spa-compact','spa-screened','spa-grove'].includes(program.id)&&number(settings.bedRaise)>0){
    // The illustrated hedge beds taper inward over 0.85m, as in the sunlight
    // receiver/terrain model. Close-set structures need a retaining detail if
    // that added soil reaches above their finished pad or coping.
    const segments=hedgeSegments(settings,data),levels=spaLevels(settings,data);
    const bedTop=(x,y)=>{
      let rise=0;
      for(const {a,b,side} of segments){
        if(side==='front')continue;
        const dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy;
        const t=((x-a[0])*dx+(y-a[1])*dy)/length2;
        if(t<0||t>1)continue;
        const inward=(-dy*(x-a[0])+dx*(y-a[1]))/Math.sqrt(length2);
        if(inward>=0&&inward<.85)rise=Math.max(rise,number(settings.bedRaise)*(1-inward/.85));
      }
      return gardenGroundAt(x,y,settings,data)+rise;
    };
    const expanded=(r,pad)=>footprintOf({x:r.x-pad,y:r.y-pad,width:r.width+2*pad,length:r.length+2*pad});
    const checks=[['pool coping',expanded(program.pool,program.pool.coping),levels.pool.copingTopZ],
      ['sauna floor',program.sauna.footprint,levels.sauna.floorZ],
      ['cold-plunge pad',expanded(program.coldPlunge,program.coldPlunge.pad),levels.coldPlunge.baseZ+.02]];
    const conflicts=checks.filter(([,ring,top])=>ring.slice(0,-1).some((a,i)=>{
      const b=ring[i+1],count=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.25));
      for(let j=0;j<=count;j++)if(bedTop(a[0]+(b[0]-a[0])*j/count,a[1]+(b[1]-a[1])*j/count)>top+.005)return true;
      return false;
    })).map(([label])=>label);
    if(conflicts.length)warnings.push(`Raised hedge beds reach above the ${conflicts.join(', ')}. Adjust bed height or hedge inset, or detail retaining edges and finished levels.`);
  }
  const stairs=terraceStairs(data.site.terrace,number(settings.terraceDepth,4.2),terraceGroundReference(settings,data).drop,settings,data);
  if(stairs.count&&rectanglesOverlap(stairs,program.firepit,.25))warnings.push('The terrace stair run reaches the sunken lounge. Reduce the terrace depth or floor height, or redesign the steps before building.');
  if(settings.removeGarage===false&&data.site.garage)warnings.push('This pool position occupies part of the existing garage site. The spa layout requires removal of the detached garage.');
  return warnings;
}

const withinRect=(x,y,r)=>x>=r.x-EPS&&x<=r.x+r.width+EPS&&y>=r.y-EPS&&y<=r.y+r.length+EPS;
/** Supporting surface for custom eyes and receiver samples inside the sunken room. */
export function spaSurfaceAt(x,y,settings={},data){
  const program=gardenProgram(settings,data);if(!program.active)return null;
  const levels=spaLevels(settings,data);
  if(pointInPolygon([x,y],program.sauna.footprint))return {surface:'sauna',groundZ:levels.sauna.floorZ};
  const saunaStep=levels.sauna.entrySteps?.find(step=>pointInPolygon([x,y],step.footprint));
  if(saunaStep)return {surface:'sauna-entry',groundZ:saunaStep.topZ};
  if(['spa-edge','spa-compact','spa-screened','spa-grove'].includes(program.id)){
    const plungeStep=levels.coldPlunge.steps.find(step=>withinRect(x,y,step));
    if(plungeStep)return {surface:'plunge-entry',groundZ:plungeStep.topZ};
  }
  if(withinRect(x,y,program.firepit)){
    const step=levels.firepit.steps.find(r=>withinRect(x,y,r));
    return {surface:'firepit',groundZ:step?step.topZ:levels.firepit.floorZ};
  }
  return null;
}

/** Shared grade sample used by the illustrated steps and both terrace readouts. */
export function terraceGroundReference(settings = {}, data) {
  const terrace = data.site.terrace;
  const depth = number(settings.terraceDepth, terrace.depth);
  const x = terrace.x + terrace.width / 2;
  const offset = 0.6, y = number(terrace.y, data.site.rearMidpoint[1]) + depth + offset;
  const floorZ = floorElevation(settings, data), groundZ = gardenGroundAt(x, y, settings, data);
  return { x, y, offset, floorZ, groundZ, drop: floorZ - groundZ };
}

/** Right means looking from the house into the garden: the low-x edge. */
export function jacuzziBounds(settings = {}, data) {
  const compact=['spa-compact','spa-screened','spa-grove'].includes(settings.gardenProgram)&&spaEnabled(settings,data);
  const depth = number(settings.terraceDepth, 4.2), size = compact?2.3:2.2;
  const spa=spaEnabled(settings,data);
  const infinity=spa&&(!compact||settings.jacuzziOverflow===true);
  const x0 = data.site.terrace.x + 0.15;
  const y0 = data.site.rearMidpoint[1] + (spa?depth-size:Math.min(1.45,Math.max(0.15,depth-size-.15)));
  const x1=x0+size,y1=y0+size,z=floorElevation(settings,data),waterOffset=infinity?-.035:-.115;
  const bottomZ=z-(compact?.78:.68);
  return {x0,x1,y0,y1,width:size,length:size,z,infinity,overflow:infinity,waterOffset,waterZ:z+waterOffset,bottomZ,
    externalHeight:compact?.9:.74,seats:compact?7:null,
    seatCentres:compact?[[.45,.45],[1.15,.32],[1.85,.45],[1.98,1.15],[1.85,1.85],[.45,1.85],[.32,1.15]].map(([x,y])=>[x0+x,y0+y]):null,
    serviceAccess:compact?{clearance:.6,x0:x0-.6,x1:x1+.6,y0:y0-.6,y1:y1+.6,datum:'Required technical access; removable deck and garden-side service access, not extra water area.'}:null,
    waterBounds:{x0:x0+.16,x1:x1-.16,y0:y0+.16,y1:y1-(infinity?.07:.16)}};
}

/** Eye-height override is deliberate: UI should set the preset's initial value. */
export function observerForPreset(preset = 'sofa', settings = {}, data) {
  const s = settingsWithDefaults(settings), [mx, rearY] = data.site.rearMidpoint;
  const depth = number(s.terraceDepth, 4.2), width = data.site.terrace.width;
  const tub = jacuzziBounds(s, data);
  const sofa = data.site.observers?.sofa || [mx, rearY - 2.5];
  const program=gardenProgram(s,data),levels=program.active?spaLevels(s,data):null;
  const garden = program.active?[11.8,32.1]:(data.site.observers?.garden || [mx, 30]);
  const terraceCentre = data.site.terrace.x + width / 2;
  const values = {
    sofa: [...sofa, 1.2, 'Living room · seated', 'floor'],
    standing: [...sofa, 1.65, 'Living room · standing', 'floor'],
    terrace: [terraceCentre, rearY + Math.max(0.5, depth - 1), 1.65, 'Living terrace', 'floor'],
    jacuzzi: [(tub.x0 + tub.x1) / 2, (tub.y0 + tub.y1) / 2, 0.7, 'Jacuzzi · seated', 'floor'],
    garden: [...garden, 1.65, 'Garden · standing', 'garden'],
    custom: [number(s.observerX, garden[0]), number(s.observerY, garden[1]), 1.65, 'Custom viewpoint', 'auto'],
  };
  if((data.site.id||settings.siteId||'sternicza-11')==='sternicza-11'){
    const houseX=data.site.house.footprint.map(p=>p[0]),frontY=Math.min(...data.site.house.footprint.map(p=>p[1]));
    values.front=[(Math.min(...houseX)+Math.max(...houseX))/2,Math.max(2,frontY*.55),1.65,'Front garden · street view','garden'];
  }
  if(program.active){
    const sa=program.sauna.viewpoint,fp=program.firepit.viewpoint;
    values.sauna=[sa.x,sa.y,sa.eyeHeight,'Sauna · seated','sauna'];
    values.firepit=[fp.x,fp.y,fp.eyeHeight,'Fire lounge · seated','firepit'];
  }
  let [x, y, defaultEye, label, surface] = values[preset] || values.custom;
  if (surface === 'auto') {
    const onTerrace = x >= data.site.terrace.x && x <= data.site.terrace.x + width && y >= rearY && y <= rearY + depth;
    surface = onTerrace || pointInPolygon([x, y], data.site.house.footprint) ? 'floor' : spaSurfaceAt(x,y,s,data)?.surface||'garden';
  }
  const eyeHeight = number(settings.eyeHeight, defaultEye);
  const groundZ = surface==='floor'?floorElevation(s,data):surface==='sauna'?levels.sauna.floorZ:
    ['firepit','sauna-entry','plunge-entry'].includes(surface)?spaSurfaceAt(x,y,s,data).groundZ:gardenGroundAt(x,y,s,data);
  const target=program.active&&(preset==='sauna'||preset==='firepit')?program[preset==='sauna'?'sauna':'firepit'].viewpoint.lookAt:null;
  const defaultLookYaw=preset==='front'?180:target?Math.atan2(-(target[0]-x),target[1]-y)*180/Math.PI:0;
  return {x,y,z:groundZ+eyeHeight,preset,label,eyeHeight,groundZ,surface,defaultLookYaw,defaultLookPitch:0};
}

/** Intersection of finite plan segment AB with CD, returning AB fraction t. */
export function segmentIntersection(a, b, c, d) {
  const r = sub(b, a), v = sub(d, c), den = cross(r, v);
  if (Math.abs(den) < EPS) return null;
  const ca = sub(c, a), t = cross(ca, v) / den, u = cross(ca, r) / den;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  return { t: clamp(t, 0, 1), u: clamp(u, 0, 1), x: a[0] + t * r[0], y: a[1] + t * r[1] };
}

function infiniteLineIntersection(a, r, b, v) {
  const den = cross(r, v);
  if (Math.abs(den) < EPS) return null;
  const t = cross(sub(b, a), v) / den;
  return [a[0] + t * r[0], a[1] + t * r[1]];
}

/** Inward offset of the convex mapped site boundary; no intermediate screen. */
function insetBoundary(boundary, inset) {
  const p = samePoint(boundary[0], boundary.at(-1)) ? boundary.slice(0, -1) : boundary.slice();
  const lines = p.map((a, i) => {
    const b = p[(i + 1) % p.length], v = sub(b, a), len = Math.hypot(...v);
    return { a: [a[0] - v[1] * inset / len, a[1] + v[0] * inset / len], v };
  });
  const result = lines.map((line, i) => {
    const prev = lines[(i + lines.length - 1) % lines.length];
    return infiniteLineIntersection(prev.a, prev.v, line.a, line.v) || line.a;
  });
  return [...result, result[0]];
}

/** Front planting follows existing street-side grade; rear earthworks stop at the house. */
export function hedgeGroundAt(x,y,side,settings={},data){
  return terrainAt(x,y,data)+(side==='front'?0:number(settings.gardenRaise)+number(settings.bedRaise));
}

export function hedgeTopAt(x, y, side, settings, data) {
  const s = settingsWithDefaults(settings);
  const h = number(s[`hedge${side[0].toUpperCase()}${side.slice(1)}`]);
  const original = terrainAt(x, y, data);
  return (s.raiseNewHedges?hedgeGroundAt(x,y,side,s,data):original)+Math.max(0,h);
}

/**
 * Proposed street planting, with explicit access gaps. The mapped source has
 * no gate survey: pedestrian access follows the existing illustrated west
 * approach centred at x=2.30m; the
 * vehicle opening meets the east-side passage beside the house. No gate leaf
 * receives opaque-screen credit. This proposal applies only to Sternicza 11.
 */
export function frontHedgeLayout(settings={},data){
  const empty={segments:[],openings:[],length:0,assumption:''};
  if((data.site.id||settings.siteId||'sternicza-11')!=='sternicza-11'||number(settings.hedgeFront)<=0)return empty;
  const boundary=insetBoundary(data.site.boundary,clamp(number(settings.hedgeInset),0,3));
  const index=data.site.boundaryNames.findIndex(name=>name==='street'||name==='front'||name.startsWith('front-'));
  if(index<0)return empty;
  const a=boundary[index],b=boundary[index+1],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
  if(length<8)return empty;
  const point=d=>[a[0]+dx*d/length,a[1]+dy*d/length];
  const projected=((2.3-a[0])*dx-a[1]*dy)/length;
  const pedestrianCentre=clamp(projected,.6+EPS,length-5.2);
  const gaps=[{id:'front-pedestrian-opening',label:'Pedestrian opening · proposed',start:pedestrianCentre-.6,end:pedestrianCentre+.6},
    {id:'front-vehicle-opening',label:'Vehicle opening · proposed',start:length-4,end:length}];
  const spans=[[0,gaps[0].start],[gaps[0].end,gaps[1].start]];
  return {segments:spans.filter(([start,end])=>end-start>EPS).map(([start,end],i)=>({id:`front-span-${i+1}`,a:point(start),b:point(end),length:end-start})),
    openings:gaps.map(g=>({id:g.id,label:g.label,a:point(g.start),b:point(g.end),width:g.end-g.start})),
    length:length-5.2,assumption:'Proposed 1.20 m pedestrian and 4.00 m vehicle openings; gate positions are not surveyed. Openings receive no privacy-screen credit. Front planting stays at existing grade.'};
}

/** Full segment fields are for rendering; ray tests interpolate the native DTM. */
export function hedgeSegments(settings = {}, data) {
  const s = settingsWithDefaults(settings);
  const p = insetBoundary(data.site.boundary, clamp(number(s.hedgeInset), 0, 3));
  const segments = [];
  for (let i = 0; i < p.length - 1; i++) {
    const name = data.site.boundaryNames[i];
    // New datasets name physical sides directly. Legacy Sternicza names were
    // geographic: east is left there, but west is left on the north-facing site.
    const physical = data.site.boundarySides?.[i] || name;
    const side = physical === 'rear' || physical.startsWith('rear-') ? 'rear'
      : physical === 'left' || physical.startsWith('left-') ? 'left'
      : physical === 'right' || physical.startsWith('right-') ? 'right'
      : name.startsWith('east') ? 'left' : name.startsWith('west') ? 'right' : null;
    if (!side) continue;
    let a = p[i], b = p[i + 1];
    const startY = data.site.rearMidpoint[1];
    if (side !== 'rear') {
      if (Math.max(a[1], b[1]) < startY) continue;
      if (a[1] < startY) { const t = (startY - a[1]) / (b[1] - a[1]); a = [a[0] + t * (b[0] - a[0]), startY]; }
      if (b[1] < startY) { const t = (startY - b[1]) / (a[1] - b[1]); b = [b[0] + t * (a[0] - b[0]), startY]; }
    }
    const height = Math.max(0, number(s[`hedge${side[0].toUpperCase()}${side.slice(1)}`]));
    const baseAt = p => hedgeGroundAt(...p,side,s,data);
    segments.push({ side, a, b, height, baseA: baseAt(a), baseB: baseAt(b),
      topA: hedgeTopAt(...a, side, s, data), topB: hedgeTopAt(...b, side, s, data) });
  }
  for(const span of frontHedgeLayout(s,data).segments){
    const {a,b}=span,side='front',height=Math.max(0,number(s.hedgeFront));
    segments.push({...span,side,height,baseA:hedgeGroundAt(...a,side,s,data),baseB:hedgeGroundAt(...b,side,s,data),
      topA:hedgeTopAt(...a,side,s,data),topB:hedgeTopAt(...b,side,s,data)});
  }
  return segments;
}

export function canopyBounds(settings = {}, data) {
  const s = settingsWithDefaults(settings), y0 = data.site.rearMidpoint[1];
  const mx = data.site.terrace.x + data.site.terrace.width / 2;
  const width = Math.max(0, number(s.canopyWidth, 8.5));
  const z = floorElevation(s, data) + number(s.canopyHeight, 2.7);
  return { x0: mx - width / 2, x1: mx + width / 2, y0,
    y1: y0 + Math.max(0, number(s.canopyDepth, 4.2)), z,
    fasciaBottomZ: z - Math.max(0, number(s.fasciaDepth, 0.3)) };
}

/** Finite roof plane and front/side fascia; no imaginary infinite canopy. */
export function canopyIntersection(observer, target, settings, data) {
  if (!settings.canopyEnabled) return null;
  const e = point3(observer), t = point3(target), c = canopyBounds(settings, data), hits = [];
  if (c.x1 - c.x0 <= EPS || c.y1 - c.y0 <= EPS) return null;
  const dz = t[2] - e[2];
  if (Math.abs(dz) > EPS) {
    const r = (c.z - e[2]) / dz;
    const x = e[0] + r * (t[0] - e[0]), y = e[1] + r * (t[1] - e[1]);
    if (r > EPS && r < 1 - EPS && x >= c.x0 - EPS && x <= c.x1 + EPS && y >= c.y0 - EPS && y <= c.y1 + EPS) {
      hits.push({ x, y, z: c.z, t: r, part: 'roof' });
    }
  }
  const edges = [[[c.x0, c.y0], [c.x0, c.y1], 'right-fascia'],
    [[c.x1, c.y0], [c.x1, c.y1], 'left-fascia'],
    [[c.x0, c.y1], [c.x1, c.y1], 'front-fascia']];
  for (const [a, b, part] of edges) {
    const hit = segmentIntersection(e, t, a, b);
    if (!hit || hit.t <= EPS || hit.t >= 1 - EPS) continue;
    const z = e[2] + hit.t * dz;
    if (z >= c.fasciaBottomZ - EPS && z <= c.z + EPS) hits.push({ ...hit, z, part });
  }
  return hits.sort((a, b) => a.t - b.t)[0] || null;
}

/** Exact required screen height on one ray, independent of whether it is built. */
export function screenOnRay(observer, target, settings, data, segments) {
  const e = point3(observer), b = point3(target), s = settingsWithDefaults(settings);
  const distance = Math.hypot(b[0] - e[0], b[1] - e[1]);
  const hits = [];
  for (const segment of segments || hedgeSegments(s, data)) {
    const hit = segmentIntersection(e, b, segment.a, segment.b);
    if (!hit || hit.t <= EPS || hit.t >= 1 - EPS) continue;
    const z = e[2] + hit.t * (b[2] - e[2]);
    const originalGround = terrainAt(hit.x, hit.y, data);
    const groundZ = hedgeGroundAt(hit.x,hit.y,segment.side,s,data);
    // New planting is measured above the new bed; retained top heights are
    // measured above the ORIGINAL terrain, so filling never lifts old foliage.
    const referenceGroundZ = s.raiseNewHedges ? groundZ : originalGround;
    const topZ = hedgeTopAt(hit.x, hit.y, segment.side, s, data);
    const raisedSoil = groundZ > originalGround + EPS && z <= groundZ + EPS && z >= originalGround - EPS;
    const foliage = segment.height > 0 && z <= topZ + EPS && z >= groundZ - EPS;
    hits.push({ ...hit, z, groundZ, originalGroundZ: originalGround, referenceGroundZ,
      topZ, height: Math.max(0, topZ - groundZ), requiredHeight: Math.max(0, z - referenceGroundZ),
      requiredExposedHeight: Math.max(0, z - groundZ), inputHeight: segment.height,
      side: segment.side, distance: distance * hit.t,
      blocked: raisedSoil || foliage, blockMaterial: raisedSoil ? 'raised-soil' : foliage ? 'foliage' : null });
  }
  return hits.sort((a, b) => a.t - b.t)[0] || null;
}

/** Finite LoD1 building prism; excludes the eye and the target endpoint. */
export function buildingIntersection(observer, target, building) {
  const e = point3(observer), b = point3(target), hits = [];
  const poly = building.footprint;
  for (let i = 0; i < poly.length - 1; i++) {
    const hit = segmentIntersection(e, b, poly[i], poly[i + 1]);
    if (!hit || hit.t <= 1e-5 || hit.t >= 1 - 1e-5) continue;
    const z = e[2] + hit.t * (b[2] - e[2]);
    if (z >= building.baseZ - EPS && z <= building.roofZ + EPS) hits.push({ ...hit, z, buildingId: building.id });
  }
  const dz = b[2] - e[2];
  if (Math.abs(dz) > EPS) {
    const r = (building.roofZ - e[2]) / dz;
    const x = e[0] + r * (b[0] - e[0]), y = e[1] + r * (b[1] - e[1]);
    if (r > 1e-5 && r < 1 - 1e-5 && pointInPolygon([x, y], poly)) hits.push({ t: r, x, y, z: building.roofZ, buildingId: building.id });
  }
  return hits.sort((a, b) => a.t - b.t)[0] || null;
}

/** Finite opaque sauna walls and roof; the panoramic glass stays transparent. */
export function saunaIntersection(observer,target,settings={},data,faces=saunaOpaqueFaces(settings,data)){
  const a=point3(observer),b=point3(target),hits=[];
  for(const face of faces){
    const p=face.vertices;
    if(face.part==='wall'){
      const hit=segmentIntersection(a,b,p[0],p[1]);
      if(!hit||hit.t<=1e-5||hit.t>=1-1e-5)continue;
      const z=a[2]+(b[2]-a[2])*hit.t,low=Math.min(...p.map(v=>v[2])),high=Math.max(...p.map(v=>v[2]));
      if(z>=low-EPS&&z<=high+EPS)hits.push({...hit,z,part:face.part,buildingId:'sauna',faceId:face.id});
    }else{
      const dz=b[2]-a[2];if(Math.abs(dz)<=EPS)continue;
      const t=(p[0][2]-a[2])/dz,x=a[0]+t*(b[0]-a[0]),y=a[1]+t*(b[1]-a[1]);
      if(t>1e-5&&t<1-1e-5&&pointInPolygon([x,y],p))hits.push({t,x,y,z:p[0][2],part:face.part,buildingId:'sauna',faceId:face.id});
    }
  }
  return hits.sort((a,b)=>a.t-b.t)[0]||null;
}

/**
 * Percent is an unweighted sampled-ray metric from ONE eye, not visible area.
 * Back-facing/LoD1 self-hidden facade samples are excluded from the denominator.
 */
export function analyzeVisibility(observer, settings = {}, data) {
  const s = settingsWithDefaults(settings), origin = point3(observer);
  const segments = hedgeSegments(s, data), rays = [], byBlock = [];
  const trees = screeningTreeVolumes(s, data);
  const saunaFaces=saunaOpaqueFaces(s,data);
  const targetBuildings = data.buildings.filter(b => b.kind === 'target');
  const blockers = data.buildings.filter(b => b.kind !== 'house');
  if (!s.removeGarage && data.site.garage) blockers.push(data.site.garage);
  const worstRequiredHedge = { rear: 0, left: 0, right: 0, front: 0, overall: 0 };
  const remainingRequiredHedge = { rear: 0, left: 0, right: 0, front: 0, overall: 0 };
  let criticalRay = null;
  for (const block of targetBuildings) {
    const blockRays = [], samples = s.includeHighFeatures ? [...block.samples, ...block.highFeatures] : block.samples;
    for (let i = 0; i < samples.length; i++) {
      const target = samples[i];
      // Filter only synthetic back facades. A median-height LoD1 prism cannot
      // safely self-occlude measured roof returns: real eaves can lie below
      // its artificial flat top, just centimetres inside the footprint.
      // Keeping every sampled roof return is intentionally conservative.
      const isFacade = i >= block.roofSampleCount && i < block.samples.length;
      if (isFacade && buildingIntersection(origin, target, block)) continue;
      const distance = Math.hypot(target[0] - origin[0], target[1] - origin[1]);
      if (distance < EPS) continue;
      const screen = screenOnRay(origin, target, s, data, segments);
      const canopy = canopyIntersection(origin, target, s, data);
      const tree = firstTreeIntersection(origin, target, trees);
      const sauna=saunaIntersection(origin,target,s,data,saunaFaces);
      let buildingHit = null;
      for (const other of blockers) {
        if (other.id === block.id) continue;
        const hit = buildingIntersection(origin, target, other);
        if (hit && (!buildingHit || hit.t < buildingHit.t)) buildingHit = hit;
      }
      const possible = [];
      if (screen?.blocked) possible.push({ t: screen.t, type: `hedge-${screen.side}`, hit: screen });
      if (canopy) possible.push({ t: canopy.t, type: 'canopy', hit: canopy });
      if (buildingHit) possible.push({ t: buildingHit.t, type: 'building', hit: buildingHit });
      if (tree) possible.push({ t: tree.t, type: 'screening-tree', hit: tree });
      if (sauna) possible.push({t:sauna.t,type:'sauna',hit:sauna});
      const first = possible.sort((a, b) => a.t - b.t)[0];
      const ray = { origin, target, blockId: block.id, blockLabel: block.label,
        kind: i < block.roofSampleCount ? 'roof' : i >= block.samples.length ? 'high-feature' : 'facade',
        visible: !first, blockedBy: first?.type || null, obstruction: first?.hit || null,
        screen, canopy, tree, sauna, distance };
      blockRays.push(ray); rays.push(ray);
      if (screen && !buildingHit) {
        worstRequiredHedge[screen.side] = Math.max(worstRequiredHedge[screen.side], screen.requiredHeight);
        if (screen.requiredHeight > worstRequiredHedge.overall) {
          worstRequiredHedge.overall = screen.requiredHeight; criticalRay = ray;
        }
        // Keep the hedge-alone benchmark above unchanged. This second value
        // only describes the rays still needing a hedge after canopy/trees.
        if (!canopy && !tree && !sauna) {
          remainingRequiredHedge[screen.side] = Math.max(remainingRequiredHedge[screen.side], screen.requiredHeight);
          remainingRequiredHedge.overall = Math.max(remainingRequiredHedge.overall, screen.requiredHeight);
        }
      }
    }
    const visible = blockRays.filter(r => r.visible).length;
    byBlock.push({ id: block.id, label: block.label, total: blockRays.length,
      visible, blocked: blockRays.length - visible,
      blockedPercent: blockRays.length ? 100 * (blockRays.length - visible) / blockRays.length : 100 });
  }
  const visible = rays.filter(r => r.visible).length, total = rays.length, blocked = total - visible;
  const reasons = {};
  for (const ray of rays) if (ray.blockedBy) reasons[ray.blockedBy] = (reasons[ray.blockedBy] || 0) + 1;
  return { observer, total, visible, blocked, blockedPercent: total ? 100 * blocked / total : 0,
    byBlock, worstRequiredHedge, remainingRequiredHedge, rays, criticalRay, reasons,
    method: 'Unweighted roof/facade sample rays from one eye; ideal opaque boundary screens and finite dense proposed crowns. Hedge-alone requirements ignore added trees/canopy. Not an area percentage or all-viewpoints/real-foliage guarantee.' };
}
