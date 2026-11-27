/** One metric boundary proposal shared by the plan, renderer, physical walk and rays.
 * Coordinates use site x/y and absolute elevation z. No planting is edited here. */
import {frontHedgeLayout,gardenGroundAt} from './geometry.js?v=1.37.0';
import {getDesignStyle} from './design-styles.js?v=1.37.0';

export const BOUNDARY_HEIGHT=2.2;
export const BOUNDARY_GEOMETRY_KEYS=Object.freeze(['perimeterFenceEnabled','pedestrianGateOpen','garageGateOpen']);
const EPS=1e-8,INSET=.22;
const lerp=(a,b,t)=>a+(b-a)*t;
const add=(a,b)=>[a[0]+b[0],a[1]+b[1]];
const at=(a,b,t)=>[lerp(a[0],b[0],t),lerp(a[1],b[1],t)];
const distance=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
const point3=p=>Array.isArray(p)?p:[p.x,p.y,p.z];
const round=n=>Math.round(n*1e6)/1e6;

// Pattern, material, batten width/pitch, low plinth, pier width and finish.
// The gate leaves repeat the selected panel infill, on slim structural frames.
const RECIPES=Object.freeze({
  current:['vertical','metal',.035,.13,.16,.15,'stone','Slim charcoal bars'],
  'organic-modern':['vertical','wood',.075,.115,.40,.27,'stone','Oak fins and travertine piers'],
  'hidden-bali':['paired','wood',.055,.18,.26,.28,'stone','Paired teak screens and stone piers'],
  'mediterranean-villa':['vertical','metal',.028,.145,.50,.29,'wall','Iron bars above a limewashed base'],
  'modern-minimal':['horizontal','metal',.105,.125,.18,.15,'metal','Horizontal aluminium blades'],
  scandinavian:['vertical','wood',.075,.115,.18,.16,'wood','Open pale timber battens'],
  japandi:['paired','wood',.045,.18,.25,.18,'wood','Paired walnut battens'],
  'organic-scandinavian':['horizontal','wood',.12,.145,.25,.24,'stone','Horizontal ash boards and mineral piers'],
  'organic-japandi':['paired','wood',.065,.22,.38,.26,'stone','Walnut pairs and warm stone'],
  'space-age':['vertical','metal',.075,.11,.16,.18,'metal','Silver fluted blades'],
  'party-club':['vertical','metal',.045,.075,.20,.18,'metal','Close graphite fins'],
  'baltic-dune':['horizontal','wood',.15,.185,.18,.18,'wood','Silvered broad timber boards'],
  coastal:['cross','wood',.07,.15,.18,.19,'wood','Painted boards with verandah braces'],
  'beach-house':['horizontal','wood',.19,.22,.18,.21,'wood','Wide bleached-oak boards'],
  'gdansk-brick':['vertical','metal',.038,.12,.60,.30,'stone','Clinker piers and dark vertical bars'],
  'danish-midcentury':['vertical','wood',.055,.115,.24,.20,'wood','Fine teak fins and limestone base'],
  'finnish-sauna':['horizontal','wood',.085,.105,.18,.18,'wood','Close cedar boards'],
  'riviera-deco':['paired','metal',.035,.17,.36,.27,'stone','Paired metal bars and stepped caps'],
  'arts-and-crafts':['cross','wood',.08,.16,.32,.26,'stone','Oak braces and masonry piers'],
  'palm-springs':['vertical','metal',.095,.15,.24,.24,'wall','Broad pale fins and rendered piers'],
  'desert-modern':['vertical','wood',.085,.13,.50,.29,'stone','Timber fins and earthen stone base'],
  'alpine-lodge':['cross','wood',.105,.18,.30,.25,'stone','Broad timber braces and stone'],
  'industrial-loft':['horizontal','metal',.13,.17,.32,.21,'stone','Black steel blades and concrete piers'],
  'nordic-minimal':['vertical','wood',.06,.105,.18,.15,'wood','Fine pale ash battens'],
  'nordic-blackwood':['vertical','wood',.07,.10,.18,.17,'wood','Charred vertical timber'],
  'warm-minimal':['horizontal','wood',.145,.17,.28,.23,'wall','Quiet oak bands and warm rendered piers'],
  'soft-minimal':['vertical','metal',.065,.105,.26,.22,'wall','Soft pale metal fins'],
  'belgian-minimal':['vertical','wood',.10,.145,.45,.30,'stone','Weathered oak and broad mineral piers'],
  'monolithic-white':['horizontal','metal',.14,.155,.30,.25,'wall','Fine white horizontal planes'],
  'glass-stone-modern':['vertical','metal',.035,.125,.32,.25,'stone','Slim dark bars and honed stone'],
  'sculptural-concrete':['vertical','metal',.09,.14,.45,.30,'wall','Broad concrete piers and metal fins'],
  'organic-limestone':['vertical','wood',.08,.12,.48,.29,'stone','Oak battens above limestone'],
  'japanese-minimal':['paired','wood',.04,.17,.22,.19,'wood','Fine paired cedar screens'],
  'bali-stone':['paired','wood',.06,.19,.48,.30,'stone','Teak pairs and deep stone piers'],
  'tropical-minimal':['vertical','wood',.07,.11,.24,.21,'wood','Slender tropical hardwood screens'],
});

export function boundaryStyle(styleOrId='current'){
  const style=typeof styleOrId==='object'?styleOrId:getDesignStyle(styleOrId);
  const [pattern,material,width,sourcePitch,sourcePlinth,pier,pierMaterial,infillName]=RECIPES[style.id]||RECIPES.current;
  // Keep the boundary visibly open; the independent hedges supply screening.
  // Retain the characteristic broad boards / paired battens, spacing them out
  // rather than substituting a nearly solid privacy panel in denser styles.
  const pitch=Math.max(sourcePitch,width/(pattern==='paired'?.16:pattern==='cross'?.26:.34));
  const plinth=Math.min(.36,sourcePlinth);
  return {id:style.id,label:style.label,pattern,material,width,pitch,plinth,pier,pierMaterial,infillName,
    palette:style.palette,lightInfill:['coastal','soft-minimal','monolithic-white','palm-springs','space-age'].includes(style.id),
    cap:style.id==='riviera-deco'?'stepped':'flat'};
}

function insetRing(source,inset){
  const ring=source.map(p=>[p[0],p[1]]);if(distance(ring[0],ring.at(-1))<EPS)ring.pop();
  const signed=ring.reduce((s,p,i)=>{const q=ring[(i+1)%ring.length];return s+p[0]*q[1]-q[0]*p[1];},0),sign=signed>0?1:-1;
  const lines=ring.map((a,i)=>{const b=ring[(i+1)%ring.length],l=distance(a,b),v=[(b[0]-a[0])/l,(b[1]-a[1])/l];return{a:[a[0]-v[1]*inset*sign,a[1]+v[0]*inset*sign],v};});
  return lines.map((line,i)=>{const prev=lines[(i+lines.length-1)%lines.length],den=prev.v[0]*line.v[1]-prev.v[1]*line.v[0];
    if(Math.abs(den)<EPS)return line.a;
    const d=[line.a[0]-prev.a[0],line.a[1]-prev.a[1]],t=(d[0]*line.v[1]-d[1]*line.v[0])/den;
    return[prev.a[0]+prev.v[0]*t,prev.a[1]+prev.v[1]*t];});
}

function member(id,a,b,thickness,bottomA,bottomB,topA,topB,extra={}){
  const length=distance(a,b),u=[(b[0]-a[0])/length,(b[1]-a[1])/length],v=[-u[1],u[0]],half=thickness/2;
  const footprint=[[a[0]-v[0]*half,a[1]-v[1]*half],[b[0]-v[0]*half,b[1]-v[1]*half],
    [b[0]+v[0]*half,b[1]+v[1]*half],[a[0]+v[0]*half,a[1]+v[1]*half]];
  return {id,label:'Boundary fence',a,b,thickness,length,bottomA,bottomB,topA,topB,footprint,
    baseZ:Math.min(bottomA,bottomB),topZ:Math.max(topA,topB),u,v,...extra};
}
function memberBounds(m){return {min:[Math.min(...m.footprint.map(p=>p[0])),Math.min(...m.footprint.map(p=>p[1])),m.baseZ],
  max:[Math.max(...m.footprint.map(p=>p[0])),Math.max(...m.footprint.map(p=>p[1])),m.topZ]};}
function blockBounds(members){return {min:[0,1,2].map(i=>Math.min(...members.map(m=>m.bounds.min[i]))),max:[0,1,2].map(i=>Math.max(...members.map(m=>m.bounds.max[i])))};}

/** Height remains 2.20 m above the finished ground at every pier. Panels follow
 * grade between piers. A discrete garden-fill step remains a discrete step. */
export function boundaryFenceLayout(settings={},data,{style:designStyle}={}){
  const style=boundaryStyle(designStyle||settings.designStyle),enabled=(data?.site?.id||settings.siteId)==='sternicza-11'&&settings.perimeterFenceEnabled===true;
  const result={enabled,height:BOUNDARY_HEIGHT,inset:INSET,style,segments:[],posts:[],gates:[],members:[],solids:[],blocks:[],fixtures:[],
    quantities:{fenceLength:0,postCount:0,pedestrianGateWidth:0,garageGateWidth:0,height:BOUNDARY_HEIGHT}};
  if(!enabled)return result;
  const ring=insetRing(data.site.boundary,INSET),frontIndex=data.site.boundaryNames.findIndex(n=>n==='street'||n==='front'||n.startsWith('front-'));
  const ground=(p,zone)=>gardenGroundAt(p[0],zone==='front'?Math.min(p[1],data.site.rearMidpoint[1]-1e-5):zone==='rear'?Math.max(p[1],data.site.rearMidpoint[1]+1e-5):p[1],settings,data);
  const openings=frontHedgeLayout({...settings,hedgeFront:Math.max(1,Number(settings.hedgeFront)||0)},data).openings;
  const emit=m=>{m.bounds=memberBounds(m);result.members.push(m);return m;};
  const physical=m=>result.solids.push({...m,physical:true});
  const postMap=new Map();
  const post=(p,u,zone,id,asJamb=false)=>{
    const key=p.map(round).join('/');if(postMap.has(key))return postMap.get(key);
    const size=style.pier,z=ground(p,zone),a=add(p,u.map(v=>-v*size/2)),b=add(p,u.map(v=>v*size/2));
    const m=emit(member(id,a,b,size,z,z,z+BOUNDARY_HEIGHT,z+BOUNDARY_HEIGHT,{part:asJamb?'gate-pier':'fence-pier',material:style.pierMaterial}));
    physical(m);result.posts.push(m);postMap.set(key,m);
    if(style.pierMaterial==='stone'||style.pierMaterial==='wall')emit(member(id+'-cap',a,b,size+.018,z+BOUNDARY_HEIGHT-.045,z+BOUNDARY_HEIGHT-.045,z+BOUNDARY_HEIGHT,z+BOUNDARY_HEIGHT,{part:'pier-cap',material:'stoneLight'}));
    return m;
  };
  const panel=(id,a,b,baseA,baseB,{gate=false,gateId=null}={})=>{
    const l=distance(a,b);if(l<.04)return;
    const start=result.members.length,base=gate?.055:style.plinth,frame=.045,top=BOUNDARY_HEIGHT;
    const put=(suffix,p,q,width,lowA,lowB,highA,highB,material,part)=>emit(member(id+'-'+suffix,p,q,width,lowA,lowB,highA,highB,{part,material,gateId}));
    const level=(p,t,h)=>lerp(baseA,baseB,t)+h;
    if(!gate&&base>.02)put('plinth',a,b,.15,baseA,baseB,baseA+base,baseB+base,'stone','fence-plinth');
    for(const [name,h]of [['lower',base+.035],['upper',top]])put(name+'-rail',a,b,.07,baseA+h-frame,baseB+h-frame,baseA+h,baseB+h,'metal','panel-frame');
    if(style.cap==='stepped')put('deco-cap',a,b,.09,baseA+top-.105,baseB+top-.105,baseA+top-.085,baseB+top-.085,'metal','panel-cap');
    const low=base+.075,high=top-frame-.012;
    if(style.pattern==='horizontal'){
      const count=Math.max(2,Math.floor((high-low)/style.pitch)),step=(high-low)/count;
      for(let i=0;i<count;i++){const h=low+(i+.5)*step,w=Math.min(style.width,step-.012);
        put('board-'+i,a,b,.055,baseA+h-w/2,baseB+h-w/2,baseA+h+w/2,baseB+h+w/2,style.material,'infill');}
    }else{
      const count=Math.max(1,Math.floor((l-.06)/style.pitch)),step=l/count;
      for(let i=0;i<count;i++)for(const offset of style.pattern==='paired'?[-.037,.037]:[0]){
        const c=(i+.5)*step+offset,w=Math.min(style.width,step*.7),left=Math.max(.015,c-w/2),right=Math.min(l-.015,c+w/2);
        if(right<=left)continue;const p=at(a,b,left/l),q=at(a,b,right/l);
        put('batten-'+i+'-'+offset,p,q,.055,level(p,left/l,low),level(q,right/l,low),level(p,left/l,high),level(q,right/l,high),style.material,'infill');
      }
      if(style.pattern==='cross')for(const sign of [0,1])put('brace-'+sign,a,b,.07,baseA+(sign?high-.055:low),baseB+(sign?low:high-.055),baseA+(sign?high:low+.055),baseB+(sign?low+.055:high),'wood','infill-brace');
    }
    if(gate){
      const u=[(b[0]-a[0])/l,(b[1]-a[1])/l];
      for(const [suffix,p]of [['start',a],['end',b]])put(suffix+'-stile',add(p,u.map(v=>-v*.025)),add(p,u.map(v=>v*.025)),.07,ground(p)+.055,ground(p)+.055,ground(p)+BOUNDARY_HEIGHT,ground(p)+BOUNDARY_HEIGHT,'metal','gate-frame');
      if(gateId==='front-pedestrian-opening')for(const face of [-1,1]){
        const c=at(a,b,.87),n=[-u[1],u[0]],p=add(c,n.map(v=>v*face*.07)),z=ground(c);
        put('pull-'+face,add(p,u.map(v=>-v*.018)),add(p,u.map(v=>v*.018)),.028,z+1.03,z+1.03,z+1.33,z+1.33,'metal','gate-handle');
      }
    }
    const batch=result.members.slice(start);result.blocks.push({id,label:gate?'Entrance gate':'Boundary fence',members:batch,bounds:blockBounds(batch)});
    physical(member(id+'-physical',a,b,.10,baseA,baseB,baseA+BOUNDARY_HEIGHT,baseB+BOUNDARY_HEIGHT,{part:gate?'gate-leaf':'fence-panel',gateId}));
  };
  let front=null;
  for(let edge=0;edge<ring.length;edge++){
    const a=ring[edge],b=ring[(edge+1)%ring.length],length=distance(a,b),u=[(b[0]-a[0])/length,(b[1]-a[1])/length];
    const atDistance=d=>add(a,u.map(v=>v*d));
    const gaps=edge===frontIndex?openings.map(o=>{const c=at(o.a,o.b,.5),station=(c[0]-a[0])*u[0]+(c[1]-a[1])*u[1];return{...o,start:station-o.width/2,end:station+o.width/2,a:atDistance(station-o.width/2),b:atDistance(station+o.width/2)};}).sort((p,q)=>p.start-q.start):[];
    if(edge===frontIndex)front={a,b,u,length,gaps};
    const spans=[];let cursor=0;for(const gap of gaps){if(gap.start>cursor)spans.push([cursor,gap.start]);cursor=gap.end;}if(cursor<length)spans.push([cursor,length]);
    for(const [index,[start,end]]of spans.entries()){
      const pa=atDistance(start),pb=atDistance(end),spanId=`boundary-${edge}-${index}`;
      result.segments.push({id:spanId,a:pa,b:pb,length:end-start,edgeIndex:edge,side:data.site.boundaryNames[edge]});
      result.quantities.fenceLength+=end-start;
      // Jambs sit wholly in the fixed fence span; its clear gate interval is unchanged.
      const from=start+(start>EPS?style.pier/2+.015:0),to=end-(end<length-EPS?style.pier/2+.015:0);
      if(to<=from)continue;
      const gradeStep=data.site.rearMidpoint[1],cuts=[from,to];
      if(Math.abs(b[1]-a[1])>EPS){const station=(gradeStep-a[1])/(b[1]-a[1])*length;if(station>from+EPS&&station<to-EPS)cuts.push(station);}
      cuts.sort((x,y)=>x-y);
      for(let piece=0;piece<cuts.length-1;piece++){
        // Two adjoining piers straddle the fill line, each based on its own
        // finished grade. A single shared pier would either float or exceed
        // the specified fence height on the lower side of this abrupt step.
        const lo=cuts[piece]+(piece>0?style.pier/2+.003:0),hi=cuts[piece+1]-(piece<cuts.length-2?style.pier/2+.003:0),count=Math.max(1,Math.ceil((hi-lo)/2.4));
        const zone=atDistance((lo+hi)/2)[1]<gradeStep?'front':'rear';
        for(let i=0;i<=count;i++){
          const d=lerp(lo,hi,i/count),p=atDistance(d);post(p,u,zone,`${spanId}-pier-${piece}-${i}`,start>EPS&&i===0||end<length-EPS&&i===count);
          if(i===count)continue;
          const next=atDistance(lerp(lo,hi,(i+1)/count));
          const p0=add(p,u.map(v=>v*style.pier/2)),p1=add(next,u.map(v=>-v*style.pier/2));
          if((p1[0]-p0[0])*u[0]+(p1[1]-p0[1])*u[1]>.04)panel(`${spanId}-bay-${piece}-${i}`,p0,p1,ground(p0,zone),ground(p1,zone));
        }
      }
    }
  }
  if(front)for(const gap of front.gaps){
    const pedestrian=gap.id==='front-pedestrian-opening',open=settings[pedestrian?'pedestrianGateOpen':'garageGateOpen']!==false,u=front.u,n=[-u[1],u[0]],width=gap.width;
    const gate={...gap,label:pedestrian?'Pedestrian gate':'Garage ramp gate',kind:pedestrian?'pedestrian':'garage',open,clearWidth:width,height:BOUNDARY_HEIGHT,leaves:[]};
    if(pedestrian){
      const hinge=add(gap.a,u.map(v=>-v*.065));
      const a=open?hinge:add(gap.a,u.map(v=>v*.035));
      const b=open?add(hinge,n.map(v=>v*(width-.07))):add(gap.b,u.map(v=>-v*.035));
      gate.leaves.push({a,b});gate.mechanism='Inward opening pedestrian leaf';
    }else{
      const rightRoom=front.length-gap.end,leftRoom=gap.start-Math.max(0,...front.gaps.filter(g=>g.end<gap.start).map(g=>g.end));
      const side=rightRoom>=leftRoom?1:-1,leafWidth=width/2+.035;
      gate.mechanism='Two-leaf telescopic sliding gate';gate.pocketSide=side>0?'east':'west';
      for(let i=0;i<2;i++){
        let a,b;
        if(open){const anchor=side>0?gap.b:gap.a,start=add(add(anchor,u.map(v=>v*side*.14)),n.map(v=>v*(.13+i*.09)));a=start;b=add(start,u.map(v=>v*side*leafWidth));}
        else{a=add(add(gap.a,u.map(v=>v*(i*width/2+.03))),n.map(v=>v*i*.09));b=add(a,u.map(v=>v*(width/2-.06)));}
        gate.leaves.push({a,b});
      }
      gate.pocketLength=leafWidth+.14;
    }
    for(const [i,leaf]of gate.leaves.entries())panel(`${gap.id}-leaf-${i+1}`,leaf.a,leaf.b,ground(leaf.a,'front'),ground(leaf.b,'front'),{gate:true,gateId:gap.id});
    result.gates.push(gate);result.quantities[pedestrian?'pedestrianGateWidth':'garageGateWidth']=width;
    const lampPier=add(pedestrian?gap.a:gap.b,u.map(v=>v*(pedestrian?-1:1)*(style.pier/2+.015)));
    const lamp=add(lampPier,n.map(v=>v*(style.pier/2+.012)));
    result.fixtures.push({id:pedestrian?'pedestrian-gate-entry-light':'garage-gate-entry-light',kind:'gate-pier-light',
      x:lamp[0],y:lamp[1],z:ground(lampPier,'front')+1.55});
  }
  const standalone=result.members.filter(m=>m.part.includes('pier'));
  for(const m of standalone)result.blocks.push({id:m.id,label:m.label,members:[m],bounds:m.bounds});
  result.quantities.postCount=result.posts.length;
  return result;
}

/** Exact triangles in site [x,y,z], also consumed by the sunlight mesh builder. */
export function boundaryMemberFaces(m){
  const p=m.footprint,b=[m.bottomA,m.bottomB,m.bottomB,m.bottomA],t=[m.topA,m.topB,m.topB,m.topA];
  const v=p.map((q,i)=>[...q,b[i]]).concat(p.map((q,i)=>[...q,t[i]]));
  return [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]].map(face=>face.map(i=>v[i]));
}

function clipLine(origin,delta,min,max,range){
  if(Math.abs(delta)<EPS)return origin>=min-EPS&&origin<=max+EPS;
  const a=(min-origin)/delta,b=(max-origin)/delta;range[0]=Math.max(range[0],Math.min(a,b));range[1]=Math.min(range[1],Math.max(a,b));return range[0]<=range[1]+EPS;
}
function boundsIntersect(a,b,bounds,limit=1){const range=[0,limit];for(let axis=0;axis<3;axis++)if(!clipLine(a[axis],b[axis]-a[axis],bounds.min[axis],bounds.max[axis],range))return false;return range[1]>EPS;}

export function firstBoundaryIntersection(observer,target,layout){
  if(!layout?.enabled)return null;
  const a=point3(observer),b=point3(target);let nearest=null;
  for(const block of layout.blocks){
    if(!boundsIntersect(a,b,block.bounds,nearest?.t??1))continue;
    for(const m of block.members){
      if(!boundsIntersect(a,b,m.bounds,nearest?.t??1))continue;
      const local=p=>{const dx=p[0]-m.a[0],dy=p[1]-m.a[1],along=dx*m.u[0]+dy*m.u[1];
        return[along,dx*m.v[0]+dy*m.v[1],p[2]-m.bottomA-(m.bottomB-m.bottomA)*along/m.length];};
      const p=local(a),q=local(b),range=[EPS,nearest?.t??1];
      if(!clipLine(p[0],q[0]-p[0],0,m.length,range)||!clipLine(p[1],q[1]-p[1],-m.thickness/2,m.thickness/2,range)||!clipLine(p[2],q[2]-p[2],0,m.topA-m.bottomA,range))continue;
      const t=range[0];if(t>=1-EPS||nearest&&t>=nearest.t)continue;
      nearest={t,id:m.id,label:m.gateId?'Entrance gate':'Boundary fence',point:a.map((v,i)=>lerp(v,b[i],t)),member:m};
    }
  }
  return nearest;
}

/** Small plan overlay; every visible leaf is the same leaf used in 3D and walk. */
export function boundaryPlanMarkup(layout,{X,Y,scale=1,labels=false}={}){
  if(!layout?.enabled)return '';
  const p=layout.style.palette,colour=layout.style.material==='wood'?p.wood:p.frame;
  const line=(a,b,width,stroke,extra='')=>`<line x1="${X(a[0])}" y1="${Y(a[1])}" x2="${X(b[0])}" y2="${Y(b[1])}" stroke="${stroke}" stroke-width="${width}" ${extra}/>`;
  return `<g class="boundary-fence-plan" aria-label="2.2 metre perimeter fence and entrance gates">${layout.segments.map(s=>line(s.a,s.b,Math.max(1.6,.09*scale),colour)).join('')}${layout.posts.map(m=>`<polygon points="${m.footprint.map(q=>`${X(q[0])},${Y(q[1])}`).join(' ')}" fill="${p.edge}" stroke="${p.frame}" stroke-width=".7"/>`).join('')}${layout.gates.map(g=>`<g aria-label="${g.label} · ${g.open?'open':'closed'} · ${g.width.toFixed(2)} m">${line(g.a,g.b,Math.max(.7,.025*scale),p.frame,'stroke-dasharray="3 3" opacity=".5"')}${g.leaves.map(l=>line(l.a,l.b,Math.max(2,.10*scale),colour)).join('')}${labels?`<text x="${X((g.a[0]+g.b[0])/2)}" y="${Y((g.a[1]+g.b[1])/2)-8}" text-anchor="middle" class="plan-label">${g.kind==='pedestrian'?'Gate':'Garage gate'} ${g.width.toFixed(2)} m</text>`:''}</g>`).join('')}</g>`;
}
