/**
 * Proposal dimensions in the same local metre frame as the rendered geometry.
 * Clearances are between finished footprints and the actual mapped parcel
 * segments. These are concept-model values, not surveyed construction setbacks.
 */
import {gardenProgram, poolBounds} from './garden-program.js?v=1.13.0';
import {gardenGroundAt, floorElevation, terraceGroundReference, jacuzziBounds, spaLevels, hedgeSegments, frontHedgeLayout} from './geometry.js?v=1.13.0';
import {screeningTreeVolumes} from './screening-trees.js?v=1.13.0';
import {applyBuildingOverrides,footprintCentroid} from './buildings.js?v=1.13.0';

const EPS=1e-9;
const finite=(v,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;
const distance=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
const openRing=ring=>ring.length>1&&distance(ring[0],ring.at(-1))<EPS?ring.slice(0,-1):ring.slice();
const edges=ring=>{const r=openRing(ring);return r.map((a,i)=>({a,b:r[(i+1)%r.length],index:i}));};
const rect=(r,pad=0)=>[[r.x-pad,r.y-pad],[r.x+r.width+pad,r.y-pad],[r.x+r.width+pad,r.y+r.length+pad],[r.x-pad,r.y+r.length+pad]];
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
const minus=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const midpoint=(a,b)=>a.map((v,i)=>(v+b[i])/2);
const pointOnSegment=(p,a,b)=>{
  const d=minus(b,a),length2=d[0]**2+d[1]**2;
  const t=length2?Math.max(0,Math.min(1,((p[0]-a[0])*d[0]+(p[1]-a[1])*d[1])/length2)):0;
  return [a[0]+d[0]*t,a[1]+d[1]*t];
};
const polygonArea=ring=>Math.abs(edges(ring).reduce((sum,{a,b})=>sum+a[0]*b[1]-b[0]*a[1],0))/2;
const inside=(point,ring)=>{
  let result=false;
  for(const {a,b} of edges(ring))if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])result=!result;
  return result;
};
const convexHull=ring=>{
  const sorted=openRing(ring).sort((a,b)=>a[0]-b[0]||a[1]-b[1]).filter((p,i,a)=>!i||distance(p,a[i-1])>EPS);
  if(sorted.length<3)return sorted;
  const half=points=>{const hull=[];for(const p of points){while(hull.length>1&&cross(minus(hull.at(-1),hull.at(-2)),minus(p,hull.at(-1)))<=EPS)hull.pop();hull.push(p);}return hull;};
  return [...half(sorted).slice(0,-1),...half(sorted.slice().reverse()).slice(0,-1)];
};

/** Exact closest points on two finite 2D segments, including crossing edges. */
export function closestSegments(a,b,c,d){
  const ab=minus(b,a),cd=minus(d,c),denom=cross(ab,cd);
  if(Math.abs(denom)>EPS){
    const ac=minus(c,a),t=cross(ac,cd)/denom,u=cross(ac,ab)/denom;
    if(t>=-EPS&&t<=1+EPS&&u>=-EPS&&u<=1+EPS){
      const p=[a[0]+t*ab[0],a[1]+t*ab[1]];return {a:p,b:p.slice(),distance:0};
    }
  }
  return [[a,pointOnSegment(a,c,d)],[b,pointOnSegment(b,c,d)],
    [pointOnSegment(c,a,b),c],[pointOnSegment(d,a,b),d]]
    .map(([p,q])=>({a:p.slice(),b:q.slice(),distance:distance(p,q)}))
    .reduce((best,item)=>item.distance<best.distance?item:best);
}

/** Shortest edge-to-edge horizontal gap; no centre/bounding-box approximation. */
export function closestFootprints(first,second){
  let nearest=null;
  for(const p of edges(first))for(const q of edges(second)){
    const candidate=closestSegments(p.a,p.b,q.a,q.b);
    if(!nearest||candidate.distance<nearest.distance)nearest={...candidate,firstEdge:p.index,secondEdge:q.index};
  }
  // A contained/overlapping feature has no free passage even when none of its
  // edges cross. Boundary setbacks deliberately use closestBoundary instead.
  if(nearest?.distance>EPS){
    const contained=openRing(first).find(p=>inside(p,second))||openRing(second).find(p=>inside(p,first));
    if(contained)return {...nearest,a:contained.slice(),b:contained.slice(),distance:0};
  }
  return nearest;
}

/** Minimum-area oriented envelope; spans are not individual wall lengths. */
export function footprintEnvelope(ring){
  let best=null;
  // A concave footprint can have a hull edge that is not an actual wall. The
  // minimum rectangle must test these bearings too, then report it as an envelope.
  for(const {a,b} of edges(convexHull(ring))){
    const length=distance(a,b);if(length<EPS)continue;
    let u=[(b[0]-a[0])/length,(b[1]-a[1])/length],v=[-u[1],u[0]];
    const projected=openRing(ring).map(p=>[p[0]*u[0]+p[1]*u[1],p[0]*v[0]+p[1]*v[1]]);
    let minU=Math.min(...projected.map(p=>p[0])),maxU=Math.max(...projected.map(p=>p[0])),minV=Math.min(...projected.map(p=>p[1])),maxV=Math.max(...projected.map(p=>p[1]));
    if(maxU-minU<maxV-minV){[u,v]=[v,u];[minU,maxU,minV,maxV]=[minV,maxV,minU,maxU];}
    const width=maxU-minU, lengthSpan=maxV-minV,area=width*lengthSpan;
    if(!best||area<best.area-EPS){
      const point=(x,y)=>[u[0]*x+v[0]*y,u[1]*x+v[1]*y];
      best={width,length:lengthSpan,area,u,v,corners:[point(minU,minV),point(maxU,minV),point(maxU,maxV),point(minU,maxV)],centre:point((minU+maxU)/2,(minV+maxV)/2)};
    }
  }
  return best;
}

/** Closest eight context footprints plus every named privacy target. */
export function nearbyDimensionBuildings(data){
  const list=(data.buildings||[]).filter(b=>b.footprint?.length>2&&b.id!==data.site.house.id&&b.id!==data.site.garage?.id)
    .map(block=>({block,gap:closestBoundary(block.footprint,data)})).filter(x=>x.gap).sort((a,b)=>a.gap.distance-b.gap.distance);
  const selected=new Set(list.slice(0,8).map(x=>x.block.id));
  return list.filter(x=>selected.has(x.block.id)||x.block.kind==='target').map(x=>x.block);
}

/** Extents choose annotations, never change the underlying numeric records. */
export function dimensionsForScope(records,scope='detail'){
  return records.filter(r=>scope==='context'?r.scope==='site'||r.scope==='context':scope==='garden'?r.scope!=='context':r.scope!=='site'&&r.scope!=='context');
}

function boundarySide(name,physical){
  const side=physical||name||'';
  if(side==='rear'||side.startsWith('rear-'))return 'rear';
  if(side==='left'||side.startsWith('left-'))return 'left';
  if(side==='right'||side.startsWith('right-'))return 'right';
  if((name||'').startsWith('east'))return 'left';
  if((name||'').startsWith('west'))return 'right';
  return side==='street'||side==='front'?'front':null;
}

/** A finished footprint to one physical parcel side, using its mapped vertices. */
export function closestBoundary(footprint,data,side=null){
  let nearest=null;
  for(const edge of edges(data.site.boundary)){
    if(side&&boundarySide(data.site.boundaryNames?.[edge.index],data.site.boundarySides?.[edge.index])!==side)continue;
    for(const objectEdge of edges(footprint)){
      const candidate=closestSegments(objectEdge.a,objectEdge.b,edge.a,edge.b);
      if(!nearest||candidate.distance<nearest.distance)nearest={...candidate,edge:edge.index,side};
    }
  }
  return nearest;
}

export const formatDimension=(value,{approximate=false,digits=2}={})=>`${approximate?'≈ ':''}${Number(value).toFixed(digits)} m`;

/**
 * a/b are the actual measured endpoints; lineA/lineB locate the annotation.
 * A plan note is used for vertical measures, which otherwise collapse to a dot.
 * Scene labels can combine footprint axes while all measurement lines remain.
 */
export function gardenDimensions(settings={},data){
  if(settings.showDimensions===false)return [];
  // Exports may pass the immutable source while the viewers pass adjusted data.
  // The override helper is idempotent, keeping both cases on the same geometry.
  data=applyBuildingOverrides(data,settings);
  const result=[],program=gardenProgram(settings,data),levels=spaLevels(settings,data);
  const ground=(x,y)=>gardenGroundAt(x,y,settings,data);
  const addHorizontal=(id,feature,kind,a,b,z,options={})=>{
    const offset=options.offset||[0,0],A=[...a,z],B=[...b,z];
    const lineA=[a[0]+offset[0],a[1]+offset[1],z],lineB=[b[0]+offset[0],b[1]+offset[1],z];
    const value=distance(a,b),text=formatDimension(value,{approximate:kind==='clearance'});
    result.push({id,feature,kind,value,a:A,b:B,lineA,lineB,anchor:[...midpoint(lineA,lineB).slice(0,2),z+.08],
      text,sceneText:text,planText:text,priority:kind==='clearance'?1:2,...options});
  };
  const addVertical=(id,feature,kind,xy,bottom,top,options={})=>{
    const value=Math.abs(top-bottom),text=formatDimension(value);
    const A=[...xy,bottom],B=[...xy,top];
    result.push({id,feature,kind,value,a:A,b:B,lineA:A,lineB:B,anchor:[...xy,(top+bottom)/2],
      text,sceneText:text,planText:text,planAnchor:xy,priority:2,...options});
  };
  const addGap=(id,feature,gap,label,options={})=>{
    if(!gap)return;
    // A level annotation above this particular sloping strip remains visible.
    const z=Math.max(...Array.from({length:9},(_,i)=>ground(gap.a[0]+(gap.b[0]-gap.a[0])*i/8,gap.a[1]+(gap.b[1]-gap.a[1])*i/8)))+.13;
    addHorizontal(id,feature,'clearance',gap.a,gap.b,z,{description:label,datum:'horizontal finished-edge gap',...options});
  };
  const addRect=(id,label,r,z,{widthSide='front',lengthSide='right'}={})=>{
    const y=widthSide==='rear'?r.y+r.length:r.y;
    const x=lengthSide==='left'?r.x:r.x+r.width;
    addHorizontal(`${id}-width`,id,'width',[r.x,y],[r.x+r.width,y],z,{offset:[0,widthSide==='rear'?.22:-.22],
      description:`${label} width`,sceneText:`${r.width.toFixed(2)} × ${r.length.toFixed(2)} m`,priority:1});
    addHorizontal(`${id}-length`,id,'length',[x,r.y],[x,r.y+r.length],z,{offset:[lengthSide==='left'?-.22:.22,0],description:`${label} length`,sceneText:null});
  };

  const t=data.site.terrace,floorZ=floorElevation(settings,data),depth=finite(settings.terraceDepth,t.depth);
  const terrace={x:t.x,y:finite(t.y,data.site.rearMidpoint[1]),width:t.width,length:depth};
  addRect('terrace','Terrace',terrace,floorZ+.11,{lengthSide:'right'});
  const ref=terraceGroundReference(settings,data);
  addVertical('terrace-drop','terrace','drop',[ref.x,ref.y],ref.groundZ,ref.floorZ,{description:'Terrace floor to proposed garden at the reference point',
    datum:'garden at terrace centreline, 0.60 m beyond deck',sceneText:`${formatDimension(ref.drop)} deck / garden`,
    planText:`deck ${ref.drop>=0?'+':'−'}${formatDimension(Math.abs(ref.drop))}`,planAnchor:[terrace.x+terrace.width*.7,terrace.y+terrace.length-.35],priority:1});

  const tub=jacuzziBounds(settings,data);
  if(tub){
    const r={x:tub.x0,y:tub.y0,width:tub.width,length:tub.length};
    addRect('jacuzzi','Jacuzzi outer rim',r,tub.z+.13,{widthSide:'rear',lengthSide:'left'});
    if(tub.seats)for(const record of result.filter(r=>r.feature==='jacuzzi'))Object.assign(record,{groupKey:'J',groupLabel:`Jacuzzi · ${tub.seats} seats · outer rim`});
    const bottomZ=Number.isFinite(tub.bottomZ)?tub.bottomZ:tub.z-.68;
    addVertical('jacuzzi-water-depth','jacuzzi','waterDepth',[tub.x1-.25,tub.y1-.25],bottomZ,tub.waterZ,{description:'Jacuzzi modeled water depth',datum:'water surface to tub floor',
      sceneText:null,planText:`water ${formatDimension(tub.waterZ-bottomZ)}`,planAnchor:[tub.x0+tub.width/2,tub.y0+tub.length*.72]});
    if(tub.serviceAccess){
      const access=tub.serviceAccess,service={x:access.x0,y:access.y0,width:access.x1-access.x0,length:access.y1-access.y0};
      addRect('jacuzzi-service','Jacuzzi technical access envelope',service,tub.z+.17);
      for(const record of result.filter(r=>r.feature==='jacuzzi-service'))Object.assign(record,{groupKey:'JS',groupLabel:'Jacuzzi · technical access envelope',datum:access.datum,sceneText:null});
      addHorizontal('jacuzzi-service-clearance','jacuzzi-service','clearance',[tub.x1,(tub.y0+tub.y1)/2],[access.x1,(tub.y0+tub.y1)/2],tub.z+.17,{
        description:'Jacuzzi technical service access beyond shell',datum:access.datum,sceneText:`spa access ${formatDimension(access.clearance)}`,priority:2});
    }
  }

  const pool=poolBounds(settings,data);
  if(pool){
    addRect('pool','Pool water footprint',pool,levels.pool.copingTopZ+.12,{lengthSide:'left'});
    addVertical('pool-water-depth','pool','waterDepth',[pool.x+pool.width*.65,pool.y+pool.length*.7],levels.pool.bottomZ,levels.pool.waterZ,{description:'Pool water depth',datum:'water surface to pool floor',
      anchor:[pool.x+pool.width*.65,pool.y+pool.length*.7,levels.pool.waterZ+.15],planText:`water ${formatDimension(pool.waterDepth)}`,sceneText:`water ${formatDimension(pool.waterDepth)}`,priority:3});
    addGap('pool-boundary','pool',closestBoundary(rect(pool,pool.coping),data,program.active?'left':null),'Pool outer coping to mapped parcel boundary');
    if(['spa-aligned','spa-grove','spa-screened'].includes(program.id))addGap('pool-house','circulation',closestFootprints(rect(pool,pool.coping),data.site.house.footprint),'Pool outer coping to house wall',{
      datum:'shortest horizontal outer coping to mapped house wall; conceptual clearance',priority:1,sceneText:null});
  }

  if(program.active){
    const {sauna:s,firepit:f,coldPlunge:c}=program;
    addRect('sauna','Sauna maximum outer footprint',s,levels.sauna.floorZ+.08,{widthSide:'rear',lengthSide:'right'});
    if(s.seats)for(const record of result.filter(r=>r.feature==='sauna'))Object.assign(record,{groupKey:'S',groupLabel:`Sauna · ${s.seats} seats · outer envelope`});
    addVertical('sauna-height','sauna','height',[s.x+s.width+.25,s.y+s.length-.3],levels.sauna.floorZ,levels.sauna.roofZ,{description:'Sauna external height',datum:'sauna floor to roof',
      planText:`h ${formatDimension(s.height)}`,sceneText:`h ${formatDimension(s.height)}`,planAnchor:[s.x+s.width*.42,s.y+s.length*.77]});
    if(Number.isFinite(levels.sauna.entryGroundZ)){
      const entry=midpoint(s.door.a,s.door.b),rise=levels.sauna.floorZ-levels.sauna.entryGroundZ;
      addVertical('sauna-entry-rise','sauna','rise',entry,levels.sauna.entryGroundZ,levels.sauna.floorZ,{description:'Sauna entry total rise',datum:'outer stair approach to sauna floor',
        planText:`entry +${formatDimension(rise)}`,sceneText:`entry +${formatDimension(rise)}`,planAnchor:[entry[0]+.6,entry[1]-.6],priority:3});
    }
    addGap('sauna-right-boundary','sauna',closestBoundary(s.footprint,data,'right'),'Sauna wall to mapped right parcel boundary');
    addGap('sauna-rear-boundary','sauna',closestBoundary(s.footprint,data,'rear'),'Sauna wall to mapped rear parcel boundary');

    const loungeEnvelope=f.outerFootprint||f.footprint,loungeBounds=f.outerBounds||f;
    addRect('firepit','Sunken lounge including outer coping',loungeBounds,levels.firepit.rimZ+.12,{widthSide:'front',lengthSide:'right'});
    for(const record of result.filter(r=>r.id==='firepit-width'||r.id==='firepit-length')){
      record.planText=`${record.text} outer`;
      if(record.sceneText)record.sceneText+=' incl. coping';
    }
    addVertical('firepit-drop','firepit','drop',[f.x+f.width-.25,f.y+f.length*.54],levels.firepit.floorZ,levels.firepit.rimZ,{description:'Sunken lounge floor drop',datum:'lounge rim to recessed floor',
      sceneText:`−${formatDimension(f.depth)}`,planText:`floor −${formatDimension(f.depth)}`,anchor:[f.x+f.width-.25,f.y+f.length*.54,levels.firepit.rimZ+.2],
      planAnchor:[f.x+f.width/2,f.y+f.length*.75],priority:2});

    addRect('cold-plunge','Cold plunge outer rim',c,levels.coldPlunge.rimZ+.12,{widthSide:'front',lengthSide:'right'});
    addVertical('cold-plunge-height','cold-plunge','height',[c.x-.18,c.y+.3],levels.coldPlunge.groundZ,levels.coldPlunge.rimZ,{description:'Cold plunge rim height',datum:'plunge pad reference to rim',
      sceneText:`rim +${formatDimension(c.height)}`,planText:`rim +${formatDimension(c.height)}`,planAnchor:[c.x+c.width/2,c.y+c.length+.7],priority:3});
    addVertical('cold-plunge-water-depth','cold-plunge','waterDepth',[c.x+c.width*.7,c.y+c.length*.6],levels.coldPlunge.bottomZ,levels.coldPlunge.waterZ,{description:'Cold plunge water depth',datum:'water surface to plunge floor',
      anchor:[c.x+c.width*.7,c.y+c.length*.6,levels.coldPlunge.rimZ+.15],planText:`water ${formatDimension(c.waterDepth)}`,sceneText:null,
      planAnchor:[c.x+c.width/2,c.y+c.length/2],priority:3});
    addGap('cold-plunge-boundary','cold-plunge',closestBoundary(rect(c,finite(c.pad,.18)),data,'rear'),'Cold plunge outer pad to mapped rear parcel boundary');
    if(Number.isFinite(levels.coldPlunge.entryGroundZ)){
      const first=levels.coldPlunge.steps[0],rise=levels.coldPlunge.rimZ-levels.coldPlunge.entryGroundZ;
      addVertical('cold-plunge-entry-rise','cold-plunge','rise',[first.x-.15,first.y],levels.coldPlunge.entryGroundZ,levels.coldPlunge.rimZ,{description:'Cold plunge approach total rise',datum:'outer stair approach to plunge rim',
        planText:`entry +${formatDimension(rise)}`,sceneText:null,priority:3});
    }

    addGap('terrace-lounge','circulation',closestFootprints(rect(terrace),loungeEnvelope),'Terrace edge to sunken lounge outer coping');
    addGap('pool-lounge','circulation',closestFootprints(rect(pool,pool.coping),loungeEnvelope),'Pool coping to sunken lounge outer coping');
    addGap('sauna-plunge','circulation',closestFootprints(s.footprint,rect(c,finite(c.pad,.18))),'Sauna wall to cold plunge outer pad');
    addGap('terrace-pool','circulation',closestFootprints(rect(terrace),rect(pool,pool.coping)),'Terrace edge to pool outer coping');
    addGap('sauna-pool','circulation',closestFootprints(s.footprint,rect(pool,pool.coping)),'Sauna wall to pool outer coping');
    addGap('plunge-pool','circulation',closestFootprints(rect(c,finite(c.pad,.18)),rect(pool,pool.coping)),'Cold plunge pad to pool outer coping');
    addGap('sauna-lounge','circulation',closestFootprints(s.footprint,loungeEnvelope),'Sauna wall to sunken lounge outer coping');
    addGap('terrace-sauna','circulation',closestFootprints(rect(terrace),s.footprint),'Terrace edge to sauna wall',{sceneText:null,priority:4});
    if(program.furniture?.dining){
      const dining=program.furniture.dining;
      addRect('dining','Dining platform',dining,ground(dining.x,dining.y)+.15);
      addGap('dining-lounge','circulation',closestFootprints(rect(dining),loungeEnvelope),'Dining platform to sunken lounge outer coping');
    }
  }

  // One height reference for each independently controlled hedge, not every
  // short source segment. Midpoints keep those references away from corners.
  for(const side of ['rear','left','right','front']){
    const candidates=hedgeSegments(settings,data).filter(h=>h.side===side&&h.height>0);
    const rearCandidates=candidates.filter(h=>h.groundZone!=='front');
    const h=(rearCandidates.length?rearCandidates:candidates).sort((a,b)=>distance(b.a,b.b)-distance(a.a,a.b))[0];
    if(!h)continue;
    const p=midpoint(h.a,h.b),base=(h.baseA+h.baseB)/2,top=(h.topA+h.topB)/2;
    if(top<=base+EPS)continue;
    addVertical(`hedge-${side}-height`,`hedge-${side}`,'height',p,base,top,{description:`${side} hedge exposed height`,datum:side==='front'?'existing front grade to hedge top; rear fill and hedge-bed raise excluded':'current planting soil to hedge top',
      sceneText:`${side} hedge ${formatDimension(top-base,{digits:1})}`,planText:`${side} h ${formatDimension(top-base,{digits:1})}`,
      planAnchor:[p[0]+(side==='left'?-1.5:side==='right'?1.5:0),p[1]+(side==='rear'?-.65:side==='front'?.65:0)],priority:3,
      ...(side==='front'?{scope:'site',groupType:'hedge'}:{})});
  }
  const front=frontHedgeLayout(settings,data);
  for(const [i,span] of front.segments.entries()){
    addHorizontal(`front-hedge-span-${i+1}`,'hedge-front','plantedLength',span.a,span.b,Math.max(ground(...span.a),ground(...span.b))+.15,{
      description:`Front thuja planted span ${i+1}`,datum:front.assumption,offset:[0,1],scope:'site',groupType:'hedge',
      sceneText:null,planText:`H4 · span ${i+1} ${formatDimension(span.length)}`,priority:3});
  }
  for(const [i,gap] of front.openings.entries()){
    addHorizontal(gap.id,gap.id,'width',gap.a,gap.b,Math.max(ground(...gap.a),ground(...gap.b))+.15,{
      description:gap.label,datum:'Proposed clear opening in the front hedge; no gate leaf or screen credit',offset:[0,1],scope:'site',
      groupKey:i?'VG':'PG',groupLabel:gap.label,groupType:'feature',sceneText:`${i?'vehicle':'pedestrian'} ${formatDimension(gap.width)}`,priority:2});
  }
  for(const [i,tree] of screeningTreeVolumes(settings,data).entries()){
    if(tree.enabled===false)continue;
    const cos=Math.cos(tree.rotationRadians),sin=Math.sin(tree.rotationRadians),z=tree.crownCenter[2];
    const local=(x,y)=>[tree.x+x*cos-y*sin,tree.y+x*sin+y*cos];
    addHorizontal(`${tree.id}-crown-width`,tree.id,'width',local(-tree.crownWidth/2,0),local(tree.crownWidth/2,0),z,{description:`Tree ${i+1} crown width`,
      planText:`crown ${formatDimension(tree.crownWidth,{digits:1})}`,sceneText:null,priority:4});
    addHorizontal(`${tree.id}-crown-depth`,tree.id,'length',local(0,-tree.crownDepth/2),local(0,tree.crownDepth/2),z,{description:`Tree ${i+1} crown depth`,
      planText:formatDimension(tree.crownDepth,{digits:1}),sceneText:null,priority:4});
    const p=local(tree.crownWidth/2+.2,0);
    addVertical(`${tree.id}-height`,tree.id,'height',p,tree.groundZ,tree.crownTopZ,{description:`Tree ${i+1} height`,datum:'local proposed soil to crown top',
      sceneText:`tree ${i+1} · ${formatDimension(tree.height,{digits:1})}`,planText:`tree ${i+1} h ${formatDimension(tree.height,{digits:1})}`,
      planAnchor:[tree.x,tree.y+.7],priority:3});
    addVertical(`${tree.id}-clear-stem`,tree.id,'clearStem',[tree.x,tree.y],tree.groundZ,tree.crownBottomZ,{description:`Tree ${i+1} clear stem below crown`,datum:'local proposed soil to crown base',sceneText:null,priority:4});
    addGap(`${tree.id}-boundary`,tree.id,closestBoundary([[tree.x,tree.y]],data),`Tree ${i+1} trunk centre to nearest plot edge`,{
      datum:'horizontal trunk-centre to mapped parcel line; crown overhang and root-ball space are separate',sceneText:`T${i+1} → edge ${formatDimension(closestBoundary([[tree.x,tree.y]],data).distance)}`,priority:3});
    if(pool)addGap(`${tree.id}-pool`,tree.id,closestFootprints([[tree.x,tree.y]],rect(pool,pool.coping)),`Tree ${i+1} trunk centre to pool coping`,{
      datum:'horizontal trunk-centre to outer pool coping; not a root clearance',sceneText:null,priority:4});
  }
  const trees=screeningTreeVolumes(settings,data).map((tree,index)=>({...tree,number:index+1})).filter(t=>t.enabled!==false);
  for(let i=0;i<trees.length;i++)for(let j=i+1;j<trees.length;j++){
    const a=trees[i],b=trees[j];
    addGap(`tree-spacing-${a.id}-${b.id}`,'tree-spacing',{a:[a.x,a.y],b:[b.x,b.y]},`Tree ${a.number} ↔ tree ${b.number} · trunk centres`,{
      datum:'horizontal trunk-centre spacing; crowns can overlap',sceneText:`T${a.number} ↔ T${b.number} ${formatDimension(Math.hypot(a.x-b.x,a.y-b.y))}`,priority:3});
  }

  // Parcel, main house and context measurements are kept in the same export as
  // garden objects. Plan extents select a readable subset for the drawing.
  const plot=data.site.boundary,points=openRing(plot),minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]));
  const plotZ=Math.max(...points.map(p=>ground(...p)))+.16,plotCentre=footprintCentroid(plot);
  const addArea=(id,feature,value,xy,z,options={})=>{
    const p=[...xy,z],text=`${value.toFixed(2)} m²`;
    result.push({id,feature,kind:'area',value,unit:'m²',a:p,b:p.slice(),lineA:p.slice(),lineB:p.slice(),anchor:p.slice(),planAnchor:xy,
      text,planText:text,sceneText:null,priority:5,...options});
  };
  addHorizontal('plot-width','plot','width',[minX,minY],[maxX,minY],plotZ,{offset:[0,-1.05],description:'Plot maximum width in local street-aligned coordinates',datum:'bounding span; individual parcel segments listed separately',sceneText:`plot ${formatDimension(maxX-minX)}`,scope:'site',priority:2});
  addHorizontal('plot-depth','plot','length',[minX,minY],[minX,maxY],plotZ,{offset:[-1.05,0],description:'Plot maximum depth in local street-aligned coordinates',datum:'bounding span; individual parcel segments listed separately',sceneText:`plot depth ${formatDimension(maxY-minY)}`,scope:'site',priority:2});
  addArea('plot-area','plot',polygonArea(plot),plotCentre,plotZ,{description:'Mapped parcel polygon area',datum:'shoelace area of the complete mapped boundary',scope:'site'});
  for(const edge of edges(plot)){
    const z=Math.max(ground(...edge.a),ground(...edge.b))+.16;
    addHorizontal(`plot-edge-${edge.index+1}`,`parcel-edge-${edge.index+1}`,'boundary',edge.a,edge.b,z,{description:`Parcel edge ${edge.index+1} · ${data.site.boundaryNames?.[edge.index]||'mapped segment'}`,
      datum:'actual finite cadastral boundary segment',groupKey:`E${edge.index+1}`,groupLabel:`Parcel edge ${edge.index+1} · ${data.site.boundaryNames?.[edge.index]||'mapped segment'}`,groupType:'site',sceneText:null,scope:'site',priority:4});
  }
  const addBuilding=(block,{feature=block.id,key=`B${block.index}`,scope='context'}={})=>{
    const box=footprintEnvelope(block.footprint);if(!box)return;
    const label=block.label||`Building ${block.index}`,shortLabel=block.kind==='target'?label:`Building ${block.index}`;
    const source=block.source||'mapped building model',adjusted=Boolean(block.adjustment);
    const heightBasis=adjusted?'adjusted sensitivity model':/median/i.test(source)?'LoD1 median roof':/LiDAR/i.test(source)?'LiDAR roof envelope':'model height assumption';
    const top=Math.max(finite(block.roofTopZ,block.roofZ),finite(block.roofZ)),base=finite(block.baseZ);
    const options={scope,groupKey:key,groupLabel:label,groupType:scope==='site'?'site':'building',source,heightBasis,adjusted,datum:`minimum-area oriented footprint envelope; ${source}${adjusted?'; adjusted sensitivity model':''}`};
    addHorizontal(`${feature}-width`,feature,'width',box.corners[0],box.corners[1],top+.18,{...options,description:`${label} footprint envelope long span`,
      sceneText:block.kind==='target'?`${shortLabel} ${box.width.toFixed(1)} × ${box.length.toFixed(1)} m`:null,priority:4});
    addHorizontal(`${feature}-length`,feature,'length',box.corners[1],box.corners[2],top+.18,{...options,description:`${label} footprint envelope short span`,sceneText:null,priority:4});
    const near=closestBoundary(block.footprint,data),p=near?.a||box.corners[0],direction=minus(p,box.centre),norm=Math.hypot(...direction)||1;
    const outside=[p[0]+direction[0]/norm*.28,p[1]+direction[1]/norm*.28];
    addVertical(`${feature}-roof-height`,feature,'height',outside,base,top,{...options,description:`${label} maximum modeled roof height above building base`,datum:`fixed building base to maximum roof envelope; ${heightBasis}; ${source}`,
      anchor:[...outside,top+.32],sceneText:`${scope==='site'?'House':shortLabel} h ${formatDimension(top-base,{digits:1})}`,planText:`roof h ${formatDimension(top-base)}`,priority:block.kind==='target'?2:4});
    addArea(`${feature}-footprint-area`,feature,polygonArea(block.footprint),box.centre,top+.2,{...options,description:`${label} actual footprint area`,datum:`polygon area, excluding empty parts of the enclosing rectangle; ${source}`});
    return {label,box,base,top};
  };
  const house=data.site.house;
  addBuilding(house,{feature:'house',key:'H',scope:'site'});
  for(const side of ['front','left','right','rear'])addGap(`house-${side}-boundary`,'house',closestBoundary(house.footprint,data,side),`House footprint → ${side} plot edge`,{
    scope:'site',datum:'shortest horizontal wall-footprint to mapped parcel segment',priority:side==='front'?1:3,sceneText:side==='front'?`front setback ${formatDimension(closestBoundary(house.footprint,data,side)?.distance||0)}`:null});
  for(const edge of edges(house.footprint))addHorizontal(`house-wall-${edge.index+1}`,'house','wall',edge.a,edge.b,finite(house.baseZ)+.18,{
    description:`House mapped wall segment ${edge.index+1}`,datum:'actual footprint edge; a mapped footprint can simplify facade recesses',scope:'site',sceneText:null,priority:5});
  if(data.site.garage&&!settings.removeGarage)addBuilding(data.site.garage,{feature:'garage',key:'GA',scope:'site'});
  for(const block of nearbyDimensionBuildings(data)){
    const b=addBuilding(block);if(!b)continue;
    addGap(`${block.id}-plot-gap`,block.id,closestBoundary(block.footprint,data),`${b.label} → nearest plot edge`,{scope:'context',groupKey:`BP${block.index}`,datum:'shortest horizontal mapped building-footprint to actual parcel segment; not distance from the viewer',priority:block.kind==='target'?2:4,
      sceneText:block.kind==='target'?`${b.label} ↔ plot ${formatDimension(closestBoundary(block.footprint,data).distance)}`:null});
    addGap(`${block.id}-house-gap`,block.id,closestFootprints(house.footprint,block.footprint),`House → ${b.label}`,{scope:'context',groupKey:`BH${block.index}`,datum:'shortest horizontal footprint-to-footprint gap',sceneText:null,priority:5});
  }
  for(const record of result)record.scope??='garden';
  return result;
}

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const featureNames={terrace:['D','Terrace'],jacuzzi:['J','Jacuzzi · outer rim'],pool:['P','Pool · water footprint'],
  sauna:['S','Sauna'],firepit:['F','Lounge · incl. coping'],'cold-plunge':['C','Cold plunge · outer rim'],
  dining:['DN','Dining platform'],plot:['PL','Plot · maximum local-axis spans'],house:['H','House · footprint envelope'],
  'hedge-rear':['H1','Rear hedge'],'hedge-left':['H2','Left hedge'],'hedge-right':['H3','Right hedge'],'hedge-front':['H4','Front thuja · two planted spans']};
const gapNames={
  'pool-boundary':'Pool coping → plot boundary','sauna-right-boundary':'Sauna → right boundary',
  'sauna-rear-boundary':'Sauna → rear boundary','cold-plunge-boundary':'Plunge pad → rear boundary',
  'terrace-lounge':'Terrace → lounge coping','pool-lounge':'Pool coping → lounge coping','sauna-plunge':'Sauna → plunge pad',
};

/** Group every record once; the key links quiet plan marks to readable numbers. */
export function dimensionScheduleGroups(records){
  const groups=[],features=new Map();
  for(const record of records){
    if(record.kind==='clearance')continue;
    let group=features.get(record.feature);
    if(!group){
      const treeNumber=/^Tree (\d+)/.exec(record.description||'')?.[1];
      const [key,label]=record.groupKey?[record.groupKey,record.groupLabel||record.feature]:featureNames[record.feature]||[treeNumber?`T${treeNumber}`:record.feature,treeNumber?`Tree ${treeNumber} · crown`:record.feature];
      group={key,label,feature:record.feature,records:[],type:record.groupType||(record.scope==='site'?'site':record.feature.startsWith('hedge-')?'hedge':treeNumber?'tree':'feature')};
      features.set(record.feature,group);groups.push(group);
    }
    group.records.push(record);
  }
  const gaps=records.filter(r=>r.kind==='clearance').map((record,i)=>({key:record.groupKey||`G${i+1}`,label:gapNames[record.id]||record.description,
    feature:record.feature,records:[record],type:'gap'}));
  return [...groups,...gaps];
}

/** All widths, depths, heights and clearances stay present, without a label cloud. */
export function dimensionScheduleMarkup(records){
  if(!records.length)return '';
  const groups=dimensionScheduleGroups(records);
  const value=r=>`<span data-dimension-record="${esc(r.id)}" title="${esc(r.description||r.id)}${r.datum?` · ${esc(r.datum)}`:''}">${esc(r.unit==='m²'?`${r.value.toFixed(2)} m²`:formatDimension(r.value,{approximate:r.kind==='clearance'}))}</span>`;
  const rows=type=>groups.filter(g=>type==='objects'?g.type==='feature':type==='planting'?g.type==='tree'||g.type==='hedge':g.type===type).map(g=>{
    const width=g.records.find(r=>r.kind==='width'),length=g.records.find(r=>r.kind==='length');
    const footprint=width&&length?`<span class="dimension-footprint"><span data-dimension-record="${esc(width.id)}" title="${esc(width.description)}">${width.value.toFixed(2)}</span> × <span data-dimension-record="${esc(length.id)}" title="${esc(length.description)}">${length.value.toFixed(2)}</span> m</span>`:'';
    const details=g.records.filter(r=>!footprint||(r!==width&&r!==length)).map(r=>{
      const prefix=r.id==='terrace-drop'&&r.b[2]<r.a[2]?'garden above deck ':r.kind==='height'?(g.feature==='cold-plunge'?'rim ':'h '):r.kind==='waterDepth'?'water ':r.kind==='drop'?'drop ':r.kind==='rise'?'entry rise ':r.kind==='clearStem'?'clear stem ':r.kind==='area'?'area ':r.kind==='wall'?`wall ${r.id.split('-').at(-1)} `:r.kind==='plantedLength'?`span ${r.id.split('-').at(-1)} `:'';
      return `<span class="dimension-detail">${prefix}${value(r)}</span>`;
    }).join('<span class="dimension-separator"> · </span>');
    return `<li data-dimension-group="${esc(g.key)}"><span class="dimension-key ${g.type==='gap'?'dimension-key-gap':''}">${esc(g.key)}</span><div><div class="dimension-row-heading"><strong>${esc(g.label)}</strong>${footprint}</div>${details?`<div class="dimension-row-values">${details}</div>`:''}</div></li>`;
  }).join('');
  const section=(title,type)=>{const html=rows(type);return html?`<section><h4>${title}</h4><ul${type==='gap'?' class="dimension-gap-list"':''}>${html}</ul></section>`:'';};
  return `<aside class="dimension-schedule" aria-label="Site and garden dimensions in metres"><header><strong>Dimensions</strong><span>Metres · model geometry</span></header>
    ${section('Plot & house · mapped geometry','site')}${section('Objects · width × length','objects')}
    ${section('Nearby buildings · oriented envelopes','building')}${section('Edge gaps & trunk-centre spacing','gap')}
    ${section('Planting · crown width × depth','planting')}
    <p>Keys match the fine lines in the drawing; every measurement remains listed if map labels overlap. Plot spans and building envelopes are bounding dimensions; wall and parcel segments use actual mapped edges. Gaps are shortest horizontal footprint distances. Tree gaps start at trunk centres. <b>h</b>: fixed building base, sauna floor or planting soil to top. Areas use actual polygons. Switch map extent for plot and nearby-building measurements.</p></aside>`;
}

function keyedPlanMarkup(records,{X,Y,scale,numericKeys=false,viewport=null}){
  const groups=dimensionScheduleGroups(records),lines=[],pins=[],occupied=[];
  const horizontal=records.filter(r=>Math.hypot(r.lineB[0]-r.lineA[0],r.lineB[1]-r.lineA[1])>1e-6);
  for(const r of horizontal){
    const a=[X(r.lineA[0]),Y(r.lineA[1])],b=[X(r.lineB[0]),Y(r.lineB[1])],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1,nx=-dy/len*2.3,ny=dx/len*2.3;
    lines.push(`<path data-dimension="${esc(r.id)}" d="M${a[0]},${a[1]}L${b[0]},${b[1]}M${a[0]-nx},${a[1]-ny}l${nx*2},${ny*2}M${b[0]-nx},${b[1]-ny}l${nx*2},${ny*2}"><title>${esc(r.description)}: ${esc(r.text)}</title></path>`);
  }
  // A single compact mark per object replaces several overlapping height and
  // size notes. Boundary gaps get their own small keys on the measured line.
  for(const group of groups.filter(g=>g.type!=='hedge'||g.feature==='hedge-front')){
    const r=group.records[0],width=group.records.find(v=>v.kind==='width'),length=group.records.find(v=>v.kind==='length');
    const pts=width&&length?[width.a,width.b,length.a,length.b]:[r.a,r.b];
    const p=[(Math.min(...pts.map(v=>v[0]))+Math.max(...pts.map(v=>v[0])))/2,(Math.min(...pts.map(v=>v[1]))+Math.max(...pts.map(v=>v[1])))/2];
    let label=group.key;
    if(numericKeys){
      const height=group.records.find(v=>v.kind==='height');
      if(group.type==='tree'&&height)label+=` h${height.value.toFixed(1)}m`;
      else if(width&&length)label+=` ${width.value.toFixed(1)}×${length.value.toFixed(1)}m`;
      else if(group.records.length===1)label+=` ${r.value.toFixed(1)}${r.unit==='m²'?'m²':'m'}`;
    }
    const origin=[X(p[0]),Y(p[1])],w=numericKeys?label.length*5.2+10:group.key.length>1?25:20,h=19;
    let chosen=null;
    const offsets=[[0,0]];
    for(let radius=1;radius<=6;radius++)for(const [dx,dy] of [[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[1,1],[-1,1],[1,-1]])offsets.push([dx*radius*22,dy*radius*20]);
    for(const offset of offsets){
      const q=[origin[0]+offset[0],origin[1]+offset[1]],box={x:q[0]-w/2,y:q[1]-h/2,w,h};
      if(viewport&&(box.x<5||box.y<5||box.x+box.w>viewport.width-5||box.y+box.h>viewport.height-5))continue;
      if(!occupied.some(a=>box.x<a.x+a.w+3&&box.x+box.w+3>a.x&&box.y<a.y+a.h+3&&box.y+box.h+3>a.y)){chosen=q;occupied.push(box);break;}
    }
    // All values stay in the adjacent schedule when a dense small map cannot
    // fit another label. Never print a number over an already occupied label.
    if(!chosen)continue;
    if(Math.hypot(chosen[0]-origin[0],chosen[1]-origin[1])>4)lines.push(`<path class="dimension-leader" d="M${origin[0]},${origin[1]}L${chosen[0]},${chosen[1]}"/>`);
    pins.push(`<g class="dimension-plan-key ${group.type==='gap'?'dimension-plan-key-gap':''}" data-dimension-key="${esc(group.key)}" data-dimension-label-width="${w}" transform="translate(${chosen[0]},${chosen[1]})"><title>${esc(group.label)} · ${group.records.map(v=>`${esc(v.description)} ${esc(v.text)}`).join('; ')}</title><rect x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" rx="5"/><text y="3.4" text-anchor="middle">${esc(label)}</text></g>`);
  }
  return records.length?`<g class="plan-dimensions plan-dimensions-keyed" pointer-events="none" aria-label="Dimension keys; values in the adjacent schedule"><g class="dimension-lines">${lines.join('')}</g>${pins.join('')}</g>`:'';
}

/** Exact lines stay fixed; text may shift a few pixels to avoid other labels. */
export function dimensionPlanMarkup(records,{X,Y,scale,keyed=false,numericKeys=false,viewport=null}){
  if(keyed)return keyedPlanMarkup(records,{X,Y,scale,numericKeys,viewport});
  const occupied=[],lines=[],labels=[];
  const fontSize=scale<8?8:9, textHeight=fontSize+3;
  const collides=box=>occupied.some(r=>box.x<r.x+r.w+2&&box.x+box.w+2>r.x&&box.y<r.y+r.h+1&&box.y+box.h+1>r.y);
  for(const r of [...records].sort((a,b)=>a.priority-b.priority)){
    const a=[X(r.lineA[0]),Y(r.lineA[1])],b=[X(r.lineB[0]),Y(r.lineB[1])];
    const vertical=r.planAnchor||Math.hypot(b[0]-a[0],b[1]-a[1])<1;
    const centre=vertical?[X((r.planAnchor||r.anchor)[0]),Y((r.planAnchor||r.anchor)[1])]:midpoint(a,b);
    const text=r.planText||r.text,w=text.length*fontSize*.52+5;
    const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy)||1,nx=-dy/length,ny=dx/length;
    if(!vertical){
      const tick=2.4;
      lines.push(`<g data-dimension="${esc(r.id)}"><title>${esc(r.description||r.id)}: ${esc(text)}</title><path d="M${a[0]},${a[1]}L${b[0]},${b[1]}M${a[0]-nx*tick},${a[1]-ny*tick}l${nx*tick*2},${ny*tick*2}M${b[0]-nx*tick},${b[1]-ny*tick}l${nx*tick*2},${ny*tick*2}"/>${r.a[0]!==r.lineA[0]||r.a[1]!==r.lineA[1]?`<path class="dimension-extension" d="M${X(r.a[0])},${Y(r.a[1])}L${a[0]},${a[1]}M${X(r.b[0])},${Y(r.b[1])}L${b[0]},${b[1]}"/>`:''}</g>`);
    }
    const choices=vertical?[[0,0],[0,-12],[0,12],[0,-24],[0,24],[w*.7,0],[-w*.7,0]]:
      [[nx*7,ny*7],[nx*-7,ny*-7],[nx*18,ny*18],[nx*-18,ny*-18],[0,-25],[0,25]];
    let box,chosen;
    for(const offset of choices){
      const candidate={x:centre[0]+offset[0]-w/2,y:centre[1]+offset[1]-textHeight/2,w,h:textHeight};
      if(!collides(candidate)){box=candidate;chosen=offset;break;}
    }
    box??={x:centre[0]-w/2,y:centre[1]+26,w,h:textHeight};chosen??=[0,26+textHeight/2];occupied.push(box);
    const cx=box.x+w/2,cy=box.y+textHeight/2;
    if(Math.hypot(...chosen)>13)lines.push(`<path class="dimension-leader" d="M${centre[0]},${centre[1]}L${cx},${cy}"/>`);
    labels.push(`<g data-dimension-label="${esc(r.id)}"><title>${esc(r.description||r.id)}${r.datum?` · ${esc(r.datum)}`:''}</title><text x="${cx}" y="${cy+fontSize*.34}" font-size="${fontSize}">${esc(text)}</text></g>`);
  }
  return records.length?`<g class="plan-dimensions" pointer-events="none" aria-label="Approximate proposal dimensions in metres"><g class="dimension-lines">${lines.join('')}</g><g class="dimension-text">${labels.join('')}</g></g>`:'';
}
