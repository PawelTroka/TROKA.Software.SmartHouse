/**
 * Proposal dimensions in the same local metre frame as the rendered geometry.
 * Clearances are between finished footprints and the actual mapped parcel
 * segments. These are concept-model values, not surveyed construction setbacks.
 */
import {gardenProgram, poolBounds} from './garden-program.js?v=1.8.0';
import {gardenGroundAt, floorElevation, terraceGroundReference, jacuzziBounds, spaLevels, hedgeSegments} from './geometry.js?v=1.8.0';
import {screeningTreeVolumes} from './screening-trees.js?v=1.8.0';

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
  return nearest;
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
    const bottomZ=tub.z-.68;
    addVertical('jacuzzi-water-depth','jacuzzi','waterDepth',[tub.x1-.25,tub.y1-.25],bottomZ,tub.waterZ,{description:'Jacuzzi modeled water depth',datum:'water surface to tub floor',
      sceneText:null,planText:`water ${formatDimension(tub.waterZ-bottomZ)}`,planAnchor:[tub.x0+tub.width/2,tub.y0+tub.length*.72]});
  }

  const pool=poolBounds(settings,data);
  if(pool){
    addRect('pool','Pool water footprint',pool,levels.pool.copingTopZ+.12,{lengthSide:'left'});
    addVertical('pool-water-depth','pool','waterDepth',[pool.x+pool.width*.65,pool.y+pool.length*.7],levels.pool.bottomZ,levels.pool.waterZ,{description:'Pool water depth',datum:'water surface to pool floor',
      anchor:[pool.x+pool.width*.65,pool.y+pool.length*.7,levels.pool.waterZ+.15],planText:`water ${formatDimension(pool.waterDepth)}`,sceneText:`water ${formatDimension(pool.waterDepth)}`,priority:3});
    addGap('pool-boundary','pool',closestBoundary(rect(pool,pool.coping),data,program.active?'left':null),'Pool outer coping to mapped parcel boundary');
  }

  if(program.active){
    const {sauna:s,firepit:f,coldPlunge:c}=program;
    addRect('sauna','Sauna maximum outer footprint',s,levels.sauna.floorZ+.08,{widthSide:'rear',lengthSide:'right'});
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
  }

  // One height reference for each independently controlled hedge, not every
  // short source segment. Midpoints keep those references away from corners.
  for(const side of ['rear','left','right']){
    const candidates=hedgeSegments(settings,data).filter(h=>h.side===side&&h.height>0);
    const h=candidates.sort((a,b)=>distance(b.a,b.b)-distance(a.a,a.b))[0];
    if(!h)continue;
    const p=midpoint(h.a,h.b),base=(h.baseA+h.baseB)/2,top=(h.topA+h.topB)/2;
    addVertical(`hedge-${side}-height`,`hedge-${side}`,'height',p,base,top,{description:`${side} hedge exposed height`,datum:'current planting soil to hedge top',
      sceneText:`${side} hedge ${formatDimension(top-base,{digits:1})}`,planText:`${side} h ${formatDimension(top-base,{digits:1})}`,
      planAnchor:[p[0]+(side==='left'?-1.5:side==='right'?1.5:0),p[1]+(side==='rear'?-.65:0)],priority:3});
  }
  for(const [i,tree] of screeningTreeVolumes(settings,data).filter(v=>v.enabled!==false).entries()){
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
  }
  return result;
}

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** Exact lines stay fixed; text may shift a few pixels to avoid other labels. */
export function dimensionPlanMarkup(records,{X,Y,scale}){
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
