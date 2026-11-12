/**
 * Proposed specimen trees: finite crowns shared by privacy, sunlight and views.
 * Coordinates and absolute elevations match geometry.js. Dense crowns are an
 * optimistic geometric assumption, not a measured guarantee of opaque foliage.
 */
import { TREE_CATALOG, getTreeType } from './tree-catalog.js?v=1.5.0';
import { gardenGroundAt, pointInPolygon, segmentIntersection, terraceGroundReference, analyzeVisibility } from './geometry.js?v=1.5.0';
import { terraceStairs, rectCorners, boundsOf } from './layout.js?v=1.5.0';

export const MAX_SCREENING_TREES = 12;
export const TREE_LEAF_MODES = Object.freeze(['auto','leaf-on','leaf-off']);
export const TREE_LIMITS = Object.freeze({height:[1,20],crownBase:[.1,19.8],crownWidth:[.3,16],crownDepth:[.2,16],rotation:[-180,180],unitPrice:[0,250000]});
const EPS = 1e-8;
const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
const finite = (v,fallback) => typeof v==='number'&&Number.isFinite(v)?v:fallback;
const point3 = p => Array.isArray(p)?p:[p.x,p.y,p.z];
const safeId = id => typeof id==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(id);
const knownType = id => TREE_CATALOG.some(type=>type.id===id);
const numeric = (tree,key,fallback) => clamp(finite(tree[key],fallback),...TREE_LIMITS[key]);
const localDirection = (v,c,s) => [v[0]*c+v[1]*s,-v[0]*s+v[1]*c,v[2]];

export function createScreeningTree(typeId,{id='tree-1',x=0,y=0}={}) {
  const type=getTreeType(typeId);
  if(!type||!knownType(typeId))throw new RangeError('Unknown screening tree type.');
  return {id:safeId(id)?id:'tree-1',typeId,x:finite(x,0),y:finite(y,0),...type.dimensions,
    rotation:0,enabled:true,unitPrice:0};
}

/** Deep copies whitelisted fields; malformed or unknown records never become screens. */
export function sanitizeScreeningTrees(input,bounds) {
  if(!Array.isArray(input))return [];
  const result=[],ids=new Set();
  for(const candidate of input.slice(0,MAX_SCREENING_TREES)) {
    if(!candidate||typeof candidate!=='object'||Array.isArray(candidate)||!knownType(candidate.typeId)
      ||!Number.isFinite(candidate.x)||!Number.isFinite(candidate.y))continue;
    const type=getTreeType(candidate.typeId),defaults=type.dimensions;
    let id=safeId(candidate.id)?candidate.id:`tree-${result.length+1}`;
    for(let index=1;ids.has(id);index++)id=`tree-${index}`;
    ids.add(id);
    const height=numeric(candidate,'height',defaults.height);
    result.push({id,typeId:type.id,
      x:clamp(candidate.x,finite(bounds?.minX,-1000),finite(bounds?.maxX,1000)),
      y:clamp(candidate.y,finite(bounds?.minY,-1000),finite(bounds?.maxY,1000)),
      height,crownBase:clamp(numeric(candidate,'crownBase',defaults.crownBase),.1,height-.2),
      crownWidth:numeric(candidate,'crownWidth',defaults.crownWidth),crownDepth:numeric(candidate,'crownDepth',defaults.crownDepth),
      rotation:numeric(candidate,'rotation',0),enabled:typeof candidate.enabled==='boolean'?candidate.enabled:true,
      unitPrice:numeric(candidate,'unitPrice',0)});
  }
  return result;
}

/** May–October is a comparison assumption, not a local phenology prediction. */
export function treeFoliageActive(type,settings={}) {
  if(type.evergreen)return true;
  if(settings.treeLeafMode==='leaf-on')return true;
  if(settings.treeLeafMode==='leaf-off')return false;
  const match=/^\d{4}-(\d{2})-\d{2}$/.exec(settings.sunDate||'2026-06-21');
  const month=match?Number(match[1]):6;
  return month>=5&&month<=10;
}

function groundObstacles(settings,data) {
  const {site}=data,items=[];
  if(site.house?.footprint)items.push({label:'the house',ring:site.house.footprint});
  if(settings.removeGarage===false&&site.garage?.footprint)items.push({label:'the retained garage',ring:site.garage.footprint});
  if(site.pool)items.push({label:'the pool',ring:rectCorners(site.pool)});
  if(site.terrace) {
    const terrace={...site.terrace,y:finite(site.terrace.y,site.rearMidpoint[1])},depth=finite(settings.terraceDepth,terrace.depth);
    items.push({label:'the terrace',ring:rectCorners({...terrace,depth})});
    if(terrace.thresholdDepth)items.push({label:'the terrace threshold',ring:rectCorners({...terrace,y:terrace.y-terrace.thresholdDepth,depth:terrace.thresholdDepth})});
    const stairs=terraceStairs(terrace,depth,terraceGroundReference(settings,data).drop);
    if(stairs.count)items.push({label:'the terrace stairs',ring:rectCorners(stairs)});
  }
  return items;
}

function pointSegmentDistance(p,a,b) {
  const dx=b[0]-a[0],dy=b[1]-a[1],len2=dx*dx+dy*dy;
  const t=len2?clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dy)/len2,0,1):0;
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}
function ringDistance(p,ring) {
  let nearest=Infinity;
  for(let i=0;i<ring.length;i++)nearest=Math.min(nearest,pointSegmentDistance(p,ring[i],ring[(i+1)%ring.length]));
  return nearest;
}

function crownOutline(tree,type) {
  const a=tree.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  const points=type.form==='panel'
    ?[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]]
    :Array.from({length:32},(_,i)=>[Math.cos(i*Math.PI/16)/2,Math.sin(i*Math.PI/16)/2]);
  return points.map(([u,v])=>{const x=u*tree.crownWidth,y=v*tree.crownDepth;return [tree.x+x*c-y*s,tree.y+x*s+y*c];});
}
function crownsOverlap(a,b) {
  const first=a.crownOutline,second=b.crownOutline;
  const fa=boundsOf(first),fb=boundsOf(second);
  if(fa.maxX<fb.minX||fb.maxX<fa.minX||fa.maxY<fb.minY||fb.maxY<fa.minY)return false;
  if(first.some(p=>pointInPolygon(p,second))||second.some(p=>pointInPolygon(p,first)))return true;
  return first.some((p,i)=>second.some((q,j)=>segmentIntersection(p,first[(i+1)%first.length],q,second[(j+1)%second.length])));
}
function addCrownOverlapWarnings(volumes) {
  for(const volume of volumes) {
    if(!volume.enabled||!volume.plantable)continue;
    const overlaps=volumes.filter(other=>other!==volume&&other.enabled&&other.plantable&&crownsOverlap(volume,other));
    if(overlaps.length)volume.warnings.push(`The crown overlaps ${overlaps.map(other=>`${other.label} (${other.id})`).join(', ')}. Check future growth, planting clearance and maintenance access; crown overlap does not guarantee dense foliage.`);
  }
  return volumes;
}
function placement(tree,type,settings,data,obstacles=groundObstacles(settings,data)) {
  const centre=[tree.x,tree.y],trunkRadius=clamp(tree.height*.025,.06,.25),warnings=[];
  let plantable=true;
  if(!pointInPolygon(centre,data.site.boundary)||ringDistance(centre,data.site.boundary)<trunkRadius) {
    plantable=false;warnings.push('Move the trunk fully inside the property. This position is excluded from privacy and shade.');
  }
  for(const obstacle of obstacles)if(pointInPolygon(centre,obstacle.ring)||ringDistance(centre,obstacle.ring)<trunkRadius+.15) {
    plantable=false;warnings.push(`The trunk overlaps ${obstacle.label}. Move it to soil; this position is excluded from privacy and shade.`);
  }
  const outline=crownOutline(tree,type),crownInside=outline.every(p=>pointInPolygon(p,data.site.boundary));
  if(!crownInside)warnings.push('The modeled crown extends beyond the property. Allow room for growth and discuss boundary clearance with the landscape designer.');
  if(plantable&&obstacles.some(o=>outline.some(p=>pointInPolygon(p,o.ring))))warnings.push('The crown overhangs a building, terrace, stairs or pool. Check clearance and maintenance access.');
  return {plantable,warnings,crownInside,crownOutline:outline,trunkRadius};
}

export function treePlacementWarnings(tree,settings,data) {
  const valid=sanitizeScreeningTrees([tree])[0];
  return valid?placement(valid,getTreeType(valid.typeId),settings,data).warnings:['Tree data is invalid and cannot block privacy or sunlight.'];
}
export function isPlantableTree(tree,settings,data) {
  const valid=sanitizeScreeningTrees([tree])[0];
  return Boolean(valid&&placement(valid,getTreeType(valid.typeId),settings,data).plantable);
}

function makeVolume(tree,settings,data,obstacles) {
  const type=getTreeType(tree.typeId),groundZ=gardenGroundAt(tree.x,tree.y,settings,data);
  const crownBottomZ=groundZ+tree.crownBase,crownTopZ=groundZ+tree.height;
  const a=tree.rotation*Math.PI/180;
  const volume={...tree,type,label:type.label,form:type.form,evergreen:type.evergreen,
    groundZ,crownBottomZ,crownTopZ,
    crownCenter:[tree.x,tree.y,(crownBottomZ+crownTopZ)/2],
    crownRadii:[tree.crownWidth/2,tree.crownDepth/2,(crownTopZ-crownBottomZ)/2],
    rotationRadians:a,rotationCos:Math.cos(a),rotationSin:Math.sin(a),
    trunkTopZ:groundZ+Math.max(tree.crownBase,tree.height*.7),
    foliageActive:treeFoliageActive(type,settings),...placement(tree,type,settings,data,obstacles)};
  if(type.form==='panel')volume.corners=volume.crownOutline.flatMap(p=>[[...p,crownBottomZ],[...p,crownTopZ]]);
  return volume;
}

/** Invalid centres are retained for warning/illustration, but intersections ignore them. */
export function screeningTreeVolumes(settings={},data) {
  const trees=sanitizeScreeningTrees(settings.screeningTrees);
  if(!trees.length)return [];
  const obstacles=groundObstacles(settings,data);
  return addCrownOverlapWarnings(trees.map(tree=>makeVolume(tree,settings,data,obstacles)));
}

function quadraticRoots(a,b,c) {
  if(Math.abs(a)<EPS)return Math.abs(b)<EPS?[]:[-c/b];
  const discriminant=b*b-4*a*c;
  if(discriminant<-EPS)return [];
  const root=Math.sqrt(Math.max(0,discriminant));
  return [(-b-root)/(2*a),(-b+root)/(2*a)].sort((x,y)=>x-y);
}
function firstAccepted(hits,maxT) {
  return hits.filter(t=>Number.isFinite(t)&&t>EPS&&t<maxT-EPS).sort((a,b)=>a-b)[0]??null;
}
function ellipsoidHit(origin,direction,radii,maxT) {
  const q=origin.map((v,i)=>v/radii[i]),d=direction.map((v,i)=>v/radii[i]);
  const inside=q.reduce((n,v)=>n+v*v,0)<1-EPS;
  if(inside)return EPS*2;
  return firstAccepted(quadraticRoots(d.reduce((n,v)=>n+v*v,0),2*q.reduce((n,v,i)=>n+v*d[i],0),q.reduce((n,v)=>n+v*v,0)-1),maxT);
}
function boxHit(origin,direction,radii,maxT) {
  let lo=0,hi=maxT;
  for(let i=0;i<3;i++) {
    if(Math.abs(direction[i])<EPS){if(Math.abs(origin[i])>radii[i]+EPS)return null;continue;}
    const a=(-radii[i]-origin[i])/direction[i],b=(radii[i]-origin[i])/direction[i];
    lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));
    if(hi<lo-EPS)return null;
  }
  return hi>EPS&&lo<maxT-EPS?Math.max(lo,EPS*2):null;
}
function coneHit(origin,direction,radii,maxT) {
  const h=radii[2]*2,x=origin[0]/radii[0],y=origin[1]/radii[1],q=(radii[2]-origin[2])/h;
  const dx=direction[0]/radii[0],dy=direction[1]/radii[1],dz=direction[2]/h;
  if(Math.abs(origin[2])<radii[2]-EPS&&x*x+y*y<q*q-EPS)return EPS*2;
  const hits=quadraticRoots(dx*dx+dy*dy-dz*dz,2*(x*dx+y*dy+q*dz),x*x+y*y-q*q)
    .filter(t=>Math.abs(origin[2]+t*direction[2])<=radii[2]+EPS);
  if(Math.abs(direction[2])>EPS) {
    const t=(-radii[2]-origin[2])/direction[2];
    if((x+t*dx)**2+(y+t*dy)**2<=1+EPS)hits.push(t);
  }
  return firstAccepted(hits,maxT);
}
function trunkHit(origin,direction,volume,maxT) {
  const x=origin[0]-volume.x,y=origin[1]-volume.y,z=origin[2];
  const [dx,dy,dz]=direction,r=volume.trunkRadius;
  if(x*x+y*y<r*r-EPS&&z>volume.groundZ+EPS&&z<volume.trunkTopZ-EPS)return EPS*2;
  const hits=quadraticRoots(dx*dx+dy*dy,2*(x*dx+y*dy),x*x+y*y-r*r)
    .filter(t=>z+t*dz>=volume.groundZ-EPS&&z+t*dz<=volume.trunkTopZ+EPS);
  if(Math.abs(dz)>EPS)for(const cap of [volume.groundZ,volume.trunkTopZ]) {
    const t=(cap-z)/dz;if((x+t*dx)**2+(y+t*dy)**2<=r*r+EPS)hits.push(t);
  }
  return firstAccepted(hits,maxT);
}
function intersectTree(origin,direction,volume,maxT) {
  if(!volume?.enabled||!volume.plantable)return null;
  const localOrigin=localDirection(origin.map((v,i)=>v-volume.crownCenter[i]),volume.rotationCos,volume.rotationSin);
  const localRay=localDirection(direction,volume.rotationCos,volume.rotationSin);
  const crown=volume.foliageActive?(volume.form==='panel'?boxHit:volume.form==='cone'?coneHit:ellipsoidHit)(localOrigin,localRay,volume.crownRadii,maxT):null;
  const trunk=trunkHit(origin,direction,volume,maxT);
  if(crown===null&&trunk===null)return null;
  const t=crown!==null&&(trunk===null||crown<=trunk)?crown:trunk,part=t===crown?'crown':'trunk';
  const p=origin.map((v,i)=>v+t*direction[i]);
  return {id:`screening-tree-${volume.id}`,treeId:volume.id,typeId:volume.typeId,type:'screening-tree',label:volume.label,
    t,part,x:p[0],y:p[1],z:p[2],point:p,distance:Math.hypot(...direction)*t};
}

/** Finite observer–target segment. A tree beyond the building never counts. */
export function treeRayIntersection(observer,target,volume) {
  const origin=point3(observer),end=point3(target),direction=end.map((v,i)=>v-origin[i]);
  if(!origin.every(Number.isFinite)||!direction.every(Number.isFinite)||Math.hypot(...direction)<EPS)return null;
  return intersectTree(origin,direction,volume,1);
}
export function firstTreeIntersection(observer,target,volumes=[]) {
  let nearest=null;
  for(const volume of volumes){const hit=treeRayIntersection(observer,target,volume);if(hit&&(!nearest||hit.t<nearest.t))nearest=hit;}
  return nearest;
}
/** Unbounded sun ray, normalized so returned distance is metres. */
export function treeSunIntersection(receiver,sunDirection,volumes=[]) {
  const origin=point3(receiver),length=Math.hypot(...sunDirection);
  if(!origin.every(Number.isFinite)||!Number.isFinite(length)||length<EPS)return null;
  const direction=sunDirection.map(v=>v/length);
  let nearest=null;
  for(const volume of volumes){const hit=intersectTree(origin,direction,volume,Infinity);if(hit&&(!nearest||hit.distance<nearest.distance))nearest=hit;}
  return nearest;
}

/**
 * Bounded search from the CURRENT eye, scoring newly hidden samples of ONE
 * target. Other enabled trees remain in the baseline. It is neither a global
 * landscape optimizer nor a guarantee for every viewpoint or real foliage.
 */
export function suggestTreePosition(input,observer,targetBuildingId,settings,data) {
  const tree=sanitizeScreeningTrees([input])[0];
  if(!tree)return {tree:null,position:null,blockedBefore:0,blockedAfter:0,added:0,total:0,warnings:['Choose a valid tree type first.']};
  const otherTrees=sanitizeScreeningTrees(settings.screeningTrees).filter(t=>t.id!==tree.id);
  const baseline=analyzeVisibility(observer,{...settings,screeningTrees:otherTrees},data);
  const rays=baseline.rays.filter(r=>r.blockId===targetBuildingId),visible=rays.filter(r=>r.visible);
  const blockedBefore=rays.length-visible.length;
  const bounds=boundsOf(data.site.boundary),obstacles=groundObstacles(settings,data);
  const rear=Math.max(bounds.minY,data.site.rearMidpoint[1]);
  // At most about 1,000 coarse positions, followed by a small local refinement.
  const step=Math.max(.7,Math.sqrt((bounds.maxX-bounds.minX)*(bounds.maxY-rear)/1000));
  let best=null;
  const tryPosition=(x,y)=>{
    if(x<bounds.minX+.2||x>bounds.maxX-.2||y<rear+.2||y>bounds.maxY-.2)return;
    const candidate={...tree,enabled:true,x:Math.round(x*100)/100,y:Math.round(y*100)/100};
    const volume=makeVolume(candidate,settings,data,obstacles);
    // Indicative design spacing, not a root-ball or arboricultural clearance.
    // Allow crowns to overlap, but never stack group suggestions on one stem.
    if(!volume.plantable||otherTrees.some(t=>t.enabled&&Math.hypot(t.x-candidate.x,t.y-candidate.y)<Math.max(.8,Math.min(candidate.crownWidth,t.crownWidth)*.5)))return;
    const added=visible.reduce((n,ray)=>n+(treeRayIntersection(ray.origin,ray.target,volume)?1:0),0);
    // Coverage first; for equal coverage prefer contained crowns and fewer
    // clashes, then the least movement from the user's chosen position.
    const movement=Math.hypot(x-tree.x,y-tree.y),penalty=(volume.crownInside?0:10)+volume.warnings.length;
    if(!best||added>best.added||(added===best.added&&(penalty<best.penalty||(penalty===best.penalty&&movement<best.movement))))best={tree:candidate,volume,added,penalty,movement};
  };
  tryPosition(tree.x,tree.y);
  for(let y=rear+.35;y<bounds.maxY-.2;y+=step)for(let x=bounds.minX+.35;x<bounds.maxX-.2;x+=step)tryPosition(x,y);
  if(best){const {x,y}=best.tree;for(let dy=-step;dy<=step+EPS;dy+=step/4)for(let dx=-step;dx<=step+EPS;dx+=step/4)tryPosition(x+dx,y+dy);}
  if(!best)return {tree,position:null,blockedBefore,blockedAfter:blockedBefore,added:0,total:rays.length,warnings:['No plantable position was found in the rear garden. Try a smaller tree or adjust the layout.']};
  addCrownOverlapWarnings([best.volume,...otherTrees.map(t=>makeVolume(t,settings,data,obstacles))]);
  const warnings=[...best.volume.warnings];
  if(!rays.length)warnings.push('The selected building has no sampled rays from this viewpoint. The suggestion only finds plantable soil.');
  else if(!visible.length)warnings.push('The selected building is already screened in the sampled model from this viewpoint.');
  if(!best.volume.foliageActive)warnings.push('The selected deciduous tree is leafless in this comparison; only its narrow trunk can screen rays.');
  if(visible.length&&!best.added)warnings.push('This tree size does not hide additional sampled points of the selected building from this eye. Try a taller or wider crown, or another viewpoint.');
  warnings.push('Suggestion uses the current viewpoint and dense modeled crowns; inspect other viewpoints and winter separately.');
  return {tree:best.tree,position:{x:best.tree.x,y:best.tree.y},blockedBefore,blockedAfter:blockedBefore+best.added,added:best.added,total:rays.length,warnings};
}
