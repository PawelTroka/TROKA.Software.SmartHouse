/** A small, connected landscape route in mapped metres. Tree positions are
 * inputs, never outputs. The same polygons drive drawing, meshes and budget. */
import {footprintFit,overlapArea,footprintArea} from './footprint-fit.js?v=1.40.0';

const distance=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
const rectangle=r=>[[r.x,r.y],[r.x+r.width,r.y],[r.x+r.width,r.y+r.length],[r.x,r.y+r.length]];
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
export function pathStrip(a,b,width,start=0,end=1){
  const length=distance(a,b),n=[-(b[1]-a[1])/length*width/2,(b[0]-a[0])/length*width/2],p=mix(a,b,start),q=mix(a,b,end);
  return [[p[0]+n[0],p[1]+n[1]],[q[0]+n[0],q[1]+n[1]],[q[0]-n[0],q[1]-n[1]],[p[0]-n[0],p[1]-n[1]]];
}
const segmentDistance=(p,a,b)=>{
  const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));
  return distance(p,[a[0]+dx*t,a[1]+dy*t]);
};
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
const sub=(a,b)=>a.map((v,i)=>v-b[i]);

/** Exact area of overlapping simple path polygons, by scanline integration.
 * Joining segments are counted once rather than inflating paving quantities. */
export function pathUnionArea(polygons){
  const rings=polygons.filter(p=>p.length>=3),edges=rings.flatMap(r=>r.map((a,i)=>({a,b:r[(i+1)%r.length]})));
  const cuts=edges.map(e=>e.a[1]);
  for(let i=0;i<edges.length;i++)for(const other of edges.slice(i+1)){
    const e=edges[i],d=sub(e.b,e.a),v=sub(other.b,other.a),den=cross(d,v);
    if(Math.abs(den)<1e-9)continue;
    const diff=sub(other.a,e.a),t=cross(diff,v)/den,u=cross(diff,d)/den;
    if(t>0&&t<1&&u>0&&u<1)cuts.push(e.a[1]+d[1]*t);
  }
  cuts.sort((a,b)=>a-b);let area=0;
  for(let i=1;i<cuts.length;i++){
    const dy=cuts[i]-cuts[i-1];if(dy<1e-9)continue;
    const y=(cuts[i]+cuts[i-1])/2,intervals=[];
    for(const ring of rings){
      const xs=[];
      for(let j=0;j<ring.length;j++){
        const a=ring[j],b=ring[(j+1)%ring.length];
        if((a[1]>y)!==(b[1]>y))xs.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));
      }
      xs.sort((a,b)=>a-b);for(let j=0;j<xs.length;j+=2)intervals.push([xs[j],xs[j+1]]);
    }
    intervals.sort((a,b)=>a[0]-b[0]);let left=null,right=null,width=0;
    for(const [a,b]of intervals){if(left===null){left=a;right=b;}else if(a<=right)right=Math.max(right,b);else{width+=right-left;left=a;right=b;}}
    area+=(width+(left===null?0:right-left))*dy;
  }
  return area;
}

export function gardenPathNetwork({program,stairs,terrace,dining,items=[],boundary,trees=[]}){
  const {pool,firepit,sauna,coldPlunge}=program;
  const width=.82,borderWidth=.06,outerWidth=width+2*borderWidth;
  const stairEnd=[stairs.x+stairs.width/2,stairs.y+stairs.length];
  const hubY=Math.max(stairEnd[1]+.58,terrace.y+terrace.length+.85);
  // Reach the near end of the rearward pool in front of the central fire
  // lounge. A route to its far end would cut through that sunken room.
  const mainX=6.65,fireX=firepit.anchor[0],poolY=Math.min(pool.y+pool.length-.30,firepit.y-1.05);
  const firstStep=sauna.entrySteps?.[0]?.footprint;
  const saunaEntry=firstStep?mix(firstStep[0],firstStep[1],.5):mix(sauna.door.a,sauna.door.b,.5);
  const nodes={
    terrace:stairEnd,landing:[stairEnd[0],hubY],junction:[mainX,hubY],
    diningTurn:[dining.x+dining.width/2,hubY],dining:[dining.x+dining.width/2,dining.y],
    fireTurn:[fireX,hubY],poolTurn:[fireX,poolY+.15],firepit:[fireX,firepit.y],
    pool:[pool.x-pool.coping,poolY],spaTurn:[mainX,33.4],
    saunaTurn:[saunaEntry[0]+.70,saunaEntry[1]-.70],sauna:saunaEntry,
    plungeTurn:[coldPlunge.anchor[0],33.4],plunge:[coldPlunge.anchor[0],coldPlunge.y-coldPlunge.pad],
  };
  const links=[['terrace','landing'],['landing','junction'],['landing','diningTurn'],['diningTurn','dining'],
    ['junction','fireTurn'],['fireTurn','poolTurn'],['poolTurn','firepit'],['poolTurn','pool'],
    ['junction','spaTurn'],['spaTurn','saunaTurn'],['saunaTurn','sauna'],['spaTurn','plungeTurn'],['plungeTurn','plunge']];
  const fixed=[{id:'terrace',ring:rectangle(terrace)},{id:'pool',ring:rectangle({x:pool.x-pool.coping,y:pool.y-pool.coping,width:pool.width+2*pool.coping,length:pool.length+2*pool.coping})},
    {id:'firepit',ring:firepit.outerFootprint},{id:'sauna',ring:sauna.footprint},{id:'plunge',ring:rectangle(coldPlunge.surroundBounds)},
    {id:'dining',ring:rectangle(dining)},...items.map(r=>({id:r.id,ring:rectangle(r)}))];
  const enabledTrees=trees.filter(t=>t.enabled!==false);
  const segments=[],blocked=[],seen=new Set();
  const fits=(a,b,ends)=>{
    const polygon=pathStrip(a,b,outerWidth);
    if(footprintFit(polygon,boundary).location!=='inside')return false;
    if(enabledTrees.some(t=>segmentDistance([t.x,t.y],a,b)<.75+outerWidth/2))return false;
    return fixed.every(o=>overlapArea(polygon,o.ring)<(ends.includes(o.id)?.01:1e-7));
  };
  for(const [from,to]of links){
    const a=nodes[from],b=nodes[to],length=distance(a,b);if(length<.025)continue;
    const key=[a.join(','),b.join(',')].sort().join(':');if(seen.has(key))continue;seen.add(key);
    let points=[a,b];
    if(!fits(a,b,[from,to])){
      // A custom tree may obstruct a proposed route. Try a modest dog-leg
      // around it without relocating anything or crossing another feature.
      const blocker=enabledTrees.find(t=>segmentDistance([t.x,t.y],a,b)<.75+outerWidth/2);
      let detour=null;
      if(blocker){
        const normal=[-(b[1]-a[1])/length,(b[0]-a[0])/length];
        for(const side of [1,-1]){
          const middle=[blocker.x+normal[0]*side*1.65,blocker.y+normal[1]*side*1.65];
          if(fits(a,middle,[from])&&fits(middle,b,[to])){detour=middle;break;}
        }
      }
      if(detour)points=[a,detour,b];else{blocked.push({from,to,reason:blocker?'retained-tree':'existing-feature'});continue;}
    }
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],length=distance(a,b),id=`garden-path-${from}-${to}${points.length>2?'-'+i:''}`;
      segments.push({id,from,to,a,b,length,width,outerWidth,footprint:pathStrip(a,b,outerWidth),surface:pathStrip(a,b,width)});
    }
  }
  const pavers=[],borders=[];
  for(const s of segments){
    const count=Math.max(1,Math.ceil(s.length/.88)),unit=s.length/count,gap=.065;
    for(let i=0;i<count;i++){
      const footprint=pathStrip(s.a,s.b,width-.08,(i*unit+gap/2)/s.length,((i+1)*unit-gap/2)/s.length);
      if(pavers.some(p=>overlapArea(p.footprint,footprint)>.004))continue;
      pavers.push({id:`${s.id}-stone-${i+1}`,footprint});
    }
    const dx=(s.b[0]-s.a[0])/s.length,dy=(s.b[1]-s.a[1])/s.length;
    for(const side of [-1,1]){
      const offset=(width+borderWidth)/2*side,a=[s.a[0]-dy*offset,s.a[1]+dx*offset],b=[s.b[0]-dy*offset,s.b[1]+dx*offset];
      borders.push({id:`${s.id}-border-${side}`,footprint:pathStrip(a,b,borderWidth)});
    }
  }
  const lightAnchors=[['terrace',nodes.landing[0]-.72,nodes.landing[1]],['dining',dining.x+dining.width+.32,dining.y+.42],
    ['firepit',fireX-.73,firepit.y-.70],['pool',pool.x-1.85,poolY+.82],
    ['spa-route',mainX-.72,30.9],['sauna',nodes.saunaTurn[0]-.50,nodes.saunaTurn[1]-.48],
    ['plunge',coldPlunge.anchor[0]+.72,coldPlunge.y-.60]];
  const lights=lightAnchors.filter(([,x,y])=>enabledTrees.every(t=>distance([x,y],[t.x,t.y])>.75)&&
    footprintFit(rectangle({x:x-.1,y:y-.1,width:.2,length:.2}),boundary).location==='inside'&&
    fixed.every(o=>overlapArea(rectangle({x:x-.1,y:y-.1,width:.2,length:.2}),o.ring)<1e-8))
    .map(([destination,x,y],i)=>({id:`garden-route-light-${i+1}`,destination,x,y,target:destination==='pool'?[pool.x-.9,poolY]:destination==='plunge'?[coldPlunge.anchor[0],coldPlunge.y-.6]:
      destination==='sauna'?nodes.saunaTurn:destination==='dining'?[mainX,dining.y+.42]:destination==='firepit'?[fireX,firepit.y-.70]:destination==='spa-route'?[mainX,30.9]:nodes.landing}));
  const planting=[{id:'path-planting-west',x:5.55,y:30.05,width:.48,length:1.65},{id:'path-planting-spa',x:8.48,y:33.75,width:.52,length:1.20}]
    .filter(r=>fixed.every(o=>overlapArea(rectangle(r),o.ring)<1e-8)&&enabledTrees.every(t=>distance([r.x+r.width/2,r.y+r.length/2],[t.x,t.y])>1));
  const vertices=[],adjacency=[];
  const vertex=point=>{let index=vertices.findIndex(p=>distance(p,point)<.03);if(index<0){index=vertices.length;vertices.push(point);adjacency.push([]);}return index;};
  for(const s of segments){const a=vertex(s.a),b=vertex(s.b);adjacency[a].push(b);adjacency[b].push(a);}
  const start=vertex(nodes.terrace),visited=new Set([start]),queue=[start];
  for(let i=0;i<queue.length;i++)for(const next of adjacency[queue[i]])if(!visited.has(next)){visited.add(next);queue.push(next);}
  const pathLength=segments.reduce((n,s)=>n+s.length,0),surfaceArea=pathUnionArea(segments.map(s=>s.footprint)),pavedArea=pavers.reduce((n,p)=>n+footprintArea(p.footprint),0);
  const stoneArea=pathUnionArea([...pavers,...borders].map(p=>p.footprint)),borderArea=Math.max(0,stoneArea-pavedArea);
  return {id:'connected-spa-garden',width,borderWidth,segments,pavers,borders,lights,planting,pathLength,surfaceArea,pavedArea,
    borderArea,stoneArea,gravelArea:Math.max(0,surfaceArea-stoneArea),fixtureCount:lights.length,blocked,
    connections:['terrace','pool','firepit','sauna','plunge','dining'].map(id=>({id,point:nodes[id],connected:visited.has(vertex(nodes[id]))}))};
}
