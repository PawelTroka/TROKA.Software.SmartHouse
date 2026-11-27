import {analyzeVisibility,privacyStructures,pointInPolygon,terraceGroundReference} from './geometry.js?v=1.39.0';
import {pavilionRoofEnvelopeStudy} from './corner-pavilion.js?v=1.39.0';
import {firstPrivacyIntersection} from './privacy-structures.js?v=1.39.0';
import {closestBoundary,closestFootprints} from './dimensions.js?v=1.39.0';
import {footprintFit,overlapArea} from './footprint-fit.js?v=1.39.0';
import {rectCorners,terraceStairs} from './layout.js?v=1.39.0';
import {screeningTreeVolumes} from './screening-trees.js?v=1.39.0';
import {gardenProgram,poolBounds} from './garden-program.js?v=1.39.0';

export const PAVILION_PLANNING=Object.freeze({
  checked:'2026-11-24',status:'unverified',parcels:['226101_1.0034.400','226101_1.0034.401'],
  currentPlan:'No covering MPZP found in the queried official city layers; obtain a property-specific confirmation and any existing WZ decision.',
  draft:{zone:'649SW',height:12,coveragePercent:30,biologicallyActivePercent:50,inForce:false},
  source:'https://bip.brg.gda.pl/plan-ogolny-miasta-gdanska',
  note:'Draft general-plan parameters are not permission for this building. Its use, WZ route, siting, fire separation and neighbouring daylight require project review.',
});
const pct=(n,total)=>total?100*n/total:null;
const count=rays=>({total:rays.length,blocked:rays.filter(r=>!r.visible).length,
  percent:pct(rays.filter(r=>!r.visible).length,rays.length)});
const EPS=1e-6;
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const pointSegmentDistance=(p,a,b)=>{
  const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
  const t=length?clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length,0,1):0;
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
};

/** Exact horizontal section of the same cone / ellipsoid / panel used for
 * sightlines, at the largest section intersecting this construction volume.
 * A crown that only touches a wall is a maintenance warning, not a collision. */
function crownRelation(tree,box){
  const low=Math.max(box.z0,tree.crownBottomZ),high=Math.min(box.z1,tree.crownTopZ);
  if(high-low<=EPS)return 'clear';
  const [cx,cy,cz]=tree.crownCenter,[rx,ry,rz]=tree.crownRadii;
  const ring=rectCorners({x:box.x0,y:box.y0,width:box.x1-box.x0,length:box.y1-box.y0});
  if(tree.form==='panel'){
    if(overlapArea(tree.crownOutline,ring)>EPS)return 'overlap';
    return (closestFootprints(tree.crownOutline,ring)?.distance??Infinity)<=EPS?'contact':'clear';
  }
  const scale=tree.form==='cone'?(tree.crownTopZ-low)/(2*rz):Math.sqrt(Math.max(0,1-((clamp(cz,low,high)-cz)/rz)**2));
  if(scale<=EPS)return 'clear';
  const c=tree.rotationCos,s=tree.rotationSin;
  const normalized=ring.map(([x,y])=>[((x-cx)*c+(y-cy)*s)/(rx*scale),(-(x-cx)*s+(y-cy)*c)/(ry*scale)]);
  const distance=pointInPolygon([0,0],normalized)?0:Math.min(...normalized.map((a,i)=>pointSegmentDistance([0,0],a,normalized[(i+1)%normalized.length])));
  return distance<1-EPS?'overlap':distance<=1+EPS?'contact':'clear';
}

function fixedObstacles(settings,data,terrace,stairs){
  const program=gardenProgram(settings,data),pool=poolBounds(settings,data);
  const items=[{id:'house',label:'the house',ring:data.site.house.footprint},{id:'terrace',label:'the living terrace',ring:terrace}];
  if(stairs.count)items.push({id:'terrace-steps',label:'the terrace steps',ring:rectCorners(stairs)});
  if(settings.removeGarage===false&&data.site.garage)items.push({id:'garage',label:'the retained garage',ring:data.site.garage.footprint});
  if(pool)items.push({id:'pool',label:'the pool and coping',ring:rectCorners(pool,pool.coping)});
  if(program.active){
    items.push({id:'sauna',label:'the sauna',ring:program.sauna.footprint},
      {id:'firepit',label:'the fire lounge and coping',ring:program.firepit.outerFootprint},
      {id:'cold-plunge',label:'the cold-plunge pad',ring:rectCorners(program.coldPlunge,program.coldPlunge.pad)});
    for(const [i,step] of (program.sauna.entrySteps||[]).entries())items.push({id:'sauna-step-'+i,label:'the sauna entry steps',ring:step.footprint});
    for(const [i,step] of (program.coldPlunge.steps||[]).entries())items.push({id:'plunge-step-'+i,label:'the cold-plunge steps',ring:rectCorners(step)});
  }
  return items;
}

/** Same alternative garden and eye in both analyses; only pavilion construction
 * is omitted from the baseline. These are sample counts, never facade area. */
export function pavilionStudy(observer,settings,data,currentAnalysis){
  const structures=privacyStructures(settings,data),p=structures.pavilion;
  if(!p?.enabled)return {enabled:false,planning:PAVILION_PLANNING,warnings:p?.warnings||[]};
  const fit=footprintFit(p.footprint,data.site.boundary),warnings=[...structures.warnings],conflicts=[];
  const conflict=(id,message)=>{conflicts.push({id,message});warnings.push(message);};
  const t=data.site.terrace,rear=data.site.rearMidpoint[1],depth=settings.terraceDepth??t.depth;
  const terrace=rectCorners({...t,y:rear,length:depth});
  const stairs=terraceStairs({...t,y:rear},depth,terraceGroundReference(settings,data).drop,settings,data);
  const footprintFits=p.footprints.map(f=>({id:f.id,...footprintFit(rectCorners(f),data.site.boundary)}));
  const rings=p.footprints.map(f=>rectCorners(f)),obstacles=fixedObstacles(settings,data,terrace,stairs);
  if(footprintFits.some(f=>f.location!=='inside'))conflict('parcel','Pavilion construction or its entry extends outside the mapped parcel. Move or resize it before comparing screening.');
  for(const item of obstacles)if(rings.some(r=>overlapArea(r,item.ring)>EPS))conflict(item.id,`Pavilion construction or entry overlaps ${item.label}. Move or resize the building before comparing screening.`);
  if(!p.footprints.some(f=>f.id==='pavilion-entry-landing'))conflict('entry','The model has no resolved pavilion entry landing and steps. Review its floor level and access before comparing screening.');
  const trees=screeningTreeVolumes(settings,data).filter(v=>v.enabled!==false);
  const treeVolumes=[{x0:p.x,y0:p.y,x1:p.x+p.width,y1:p.y+p.length,z0:p.baseZ,z1:p.topZ},...p.boxes.filter(b=>b.part==='entry')];
  const treeConflicts=[];
  for(const tree of trees){
    const trunk=treeVolumes.some(b=>Math.min(b.z1,tree.trunkTopZ)-Math.max(b.z0,tree.groundZ)>EPS&&Math.hypot(tree.x-clamp(tree.x,b.x0,b.x1),tree.y-clamp(tree.y,b.y0,b.y1))<tree.trunkRadius-EPS);
    const relations=treeVolumes.map(b=>crownRelation(tree,b)),crown=relations.includes('overlap')?'overlap':relations.includes('contact')?'contact':'clear';
    if(trunk||crown!=='clear')treeConflicts.push({id:tree.id,trunk,crown});
    if(trunk)conflict('trunk-'+tree.id,`Proposed tree ${tree.id} has a trunk intersecting the pavilion or its entry. Reposition it before comparing screening.`);
    else if(crown==='overlap')conflict('crown-'+tree.id,`Proposed tree ${tree.id} has a modelled crown intersecting the pavilion or its entry. Reposition it or revise the planting dimensions before comparing screening.`);
    else if(crown==='contact')warnings.push(`Proposed tree ${tree.id} has a modelled crown touching the pavilion. Allow space for growth, pruning and building maintenance; the model does not check root clearance.`);
  }
  // A side approach may still be possible; do not mislabel a narrow straight
  // approach as an actual object collision or as compliant accessible entry.
  const approach=p.entry?rectCorners({x:p.entry.footprint[0][0],y:p.entry.outerY-1,width:p.entry.landingWidth,length:1}):null;
  const approachClear=Boolean(approach)&&footprintFit(approach,data.site.boundary).location==='inside'&&!obstacles.some(o=>overlapArea(approach,o.ring)>EPS);
  if(approach&&!approachClear)warnings.push('A 1 m straight approach beyond the bottom pavilion step is obstructed. A side approach or revised entry needs design before this access is considered resolved.');
  if(p.height>PAVILION_PLANNING.draft.height)warnings.push('This height exceeds the 12 m parameter in the current draft general plan. No height in this study is established as permitted.');
  const inside=pointInPolygon([observer.x,observer.y],p.footprint);
  if(inside)warnings.push('The selected eye is inside the pavilion footprint. Choose an outdoor viewpoint to compare screening.');
  const valid=!inside&&conflicts.length===0;
  const current=valid?(currentAnalysis||analyzeVisibility(observer,settings,data)):null;
  const target=current?.byBlock.find(b=>/PCK\s*3/i.test(b.label));
  const rays=target?current.rays.filter(r=>r.blockId===target.id):[];
  const roof=rays.filter(r=>r.kind==='roof'||r.kind==='high-feature');
  const envelope=valid?pavilionRoofEnvelopeStudy(observer,roof.map(r=>r.target),p):null;
  let comparison=null;
  if(valid&&rays.length){
    const baseline=analyzeVisibility(observer,settings,data,{excludePavilion:true});
    const before=baseline.rays.filter(r=>r.blockId===target.id),beforeRoof=before.filter(r=>r.kind==='roof'||r.kind==='high-feature');
    const own=rays.filter(r=>firstPrivacyIntersection(observer,r.target,p.boxes));
    const ownRoof=roof.filter(r=>firstPrivacyIntersection(observer,r.target,p.boxes));
    comparison={before:count(before),after:count(rays),roofBefore:count(beforeRoof),roofAfter:count(roof),
      pavilionOnly:{total:rays.length,blocked:own.length,percent:pct(own.length,rays.length)},
      pavilionRoofOnly:{total:roof.length,blocked:ownRoof.length,percent:pct(ownRoof.length,roof.length)}};
  }
  return {enabled:true,valid,observer:{label:observer.label,x:observer.x,y:observer.y,z:observer.z},
    dimensions:{x:p.x,y:p.y,width:p.width,depth:p.length,area:p.width*p.length,height:p.height,
      originalGroundZ:p.baseZ,roofZ:p.topZ,floorZ:p.floorZ,storeys:p.storeys.length,minimumHeadroom:p.minimumHeadroom,heightDatum:p.heightDatum},
    clearances:{boundary:closestBoundary(p.footprint,data)?.distance??null,rear:closestBoundary(p.footprint,data,'rear')?.distance??null,
      east:closestBoundary(p.footprint,data,'left')?.distance??null,house:closestFootprints(p.footprint,data.site.house.footprint)?.distance??null},
    fit,footprintFits,conflicts,treeConflicts,entryApproachClear:approachClear,comparison,envelope,warnings:[...new Set(warnings)],planning:PAVILION_PLANNING,
    method:'Unweighted PCK3 target-point sightlines from the selected eye. Baseline retains the alternative pool, spa layout, trees and other structures; it removes only pavilion construction. Glass stays transparent. The separate envelope calculation is an ideal geometric limit, not a legal or whole-building-screening guarantee.'};
}
