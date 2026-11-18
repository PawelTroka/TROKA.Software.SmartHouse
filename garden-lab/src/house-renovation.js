// Shallow, additive facade treatments in wall-local metres. The renderers use
// these same window and entry records for the underlying house.
import {houseAppearanceLayout,photoHouseSupported} from './house-appearance.js?v=1.25.0';
import {photoRoofEdgeHeight} from './house-roof.js?v=1.25.0';
import {mappedHouseFacadeLayout} from './mapped-house-facades.js?v=1.25.0';
import {roofEdgeHeight} from './roof-envelope.js?v=1.25.0';
import {garageLayout} from './garage-ramp.js?v=1.25.0';
import {terrainAt} from './geometry.js?v=1.25.0';
import {getDesignStyle} from './design-styles.js?v=1.25.0';

function minimumRoof(edge,lo,hi){
  const roof=edge.roofEdge;
  const height=d=>roof.fractions?photoRoofEdgeHeight(roof,d):roofEdgeHeight(roof,d/edge.length);
  let minimum=Math.min(height(lo),height(hi));
  for(let i=1;i<roof.points.length-1;i++){
    const d=edge.length*(roof.fractions?.[i]??i/(roof.points.length-1));
    if(d>lo&&d<hi)minimum=Math.min(minimum,roof.points[i][2]);
  }
  return minimum;
}

function openingGuards(layout,edge){
  const openings=[...layout.windows,layout.door,layout.portal,layout.atticWindow]
    .filter(w=>w&&w.edgeIndex===edge.index&&w.hi>w.lo&&w.height>0);
  const guards=openings.map(w=>({lo:w.lo,hi:w.hi,bottom:w.z,top:w.z+w.height}));
  if(layout.door?.edgeIndex===edge.index){
    const door=layout.door;
    const landing=layout.entryAccess?.landing?.footprint??[];
    const distances=landing.map(p=>(p[0]-edge.a[0])*edge.direction[0]+(p[1]-edge.a[1])*edge.direction[1]);
    // Include the landing/straight stair width alongside the front door.
    guards.push({lo:Math.min(door.centre-.95,...distances),hi:Math.max(door.centre+.95,...distances),
      bottom:layout.baseZ,top:door.z+door.height});
  }
  return guards;
}

function freeSpans(edge,bottom,top,guards,margin){
  let end=.22;
  const intervals=[];
  const obstacles=guards.filter(g=>top>g.bottom-margin&&bottom<g.top+margin)
    .sort((a,b)=>a.lo-b.lo);
  const limit=edge.length-.22;
  for(const g of obstacles){
    const left=Math.min(limit,g.lo-margin);
    if(left>end) intervals.push([end,left]);
    end=Math.max(end,g.hi+margin);
  }
  if(limit>end) intervals.push([end,limit]);
  return intervals;
}

function openingTrim(w,trim,shutters,place){
  const {lo,hi,z,height}=w,top=z+height;
  const jamb=['timber','crosshead','fine','steel','stepped'].includes(trim);
  const width=trim==='fine'?.057:.115;
  const timber=['timber','crosshead'].includes(trim);
  const finish=timber?'wood':['cap','soldier','shutters'].includes(trim)?'edge':'houseFrame';
  const put=(kind,a,b,c,d,depth,color=finish)=>place({kind,lo:a,hi:b,bottom:c,top:d,depth,finish:color,openingId:w.id});
  const gap=.025;
  if(jamb){
    put('window-jamb',lo-gap-width,lo-gap,z,top,.091);
    put('window-jamb',hi+gap,hi+gap+width,z,top,.091);
  }
  // Keep all thresholds flush, including the first-floor balcony access.
  if(w.kind==='hst'||w.kind==='balcony-door') return;
  const overhang=trim==='crosshead'?.23:width+.04;
  put('window-sill',lo-overhang,hi+overhang,z-gap-.075,z-gap,.14);
  if(trim==='soldier'){
    const n=Math.max(3,Math.round((hi-lo+.16)/.095)),pitch=(hi-lo+.16)/n;
    for(let i=0;i<n;i++) put('soldier-lintel',lo-.08+i*pitch,lo-.08+(i+1)*pitch-.008,top+gap,top+gap+.21,.085,'surface');
  }else{
    const height=trim==='crosshead'||trim==='cap'?.14:width;
    put('window-head',lo-overhang,hi+overhang,top+gap,top+gap+height,.106);
    if(trim==='stepped'||trim==='steel'){
      put('projecting-head-cap',lo-overhang-.07,hi+overhang+.07,top+gap+height,top+gap+height+.065,.135,trim==='stepped'?'accent':finish);
    }
  }
  if(trim==='shutters'&&shutters){
    const leaf=Math.min(.43,(hi-lo)*.26);
    for(const left of [lo-.105-leaf,hi+.105]){
      if(!put('shutter-back',left,left+leaf,z,top,.045,'houseFrame'))continue;
      for(let y=z+.07;y<top-.05;y+=.155)
        put('shutter-louvre',left+.028,left+leaf-.028,y,Math.min(y+.105,top-.035),.082,'houseFrame');
    }
  }
}

function cladding(bay,recipe,place){
  const {lo,hi,bottom,top,edgeIndex}=bay,{field,pitch}=recipe;
  const put=(kind,a,b,c,d,depth,finish,tone=1)=>place({
    kind,lo:a,hi:b,bottom:c,top:d,depth,finish,tone,bayId:`bay-${edgeIndex}`});
  const wood=['boards','battens','paired','lap'].includes(field);
  const finish=wood?'wood':field==='flutes'?'houseFrame':'surface';
  put('cladding-backing',lo,hi,bottom,top,.027,wood?'houseFrame':'edge');
  if(['battens','paired','boards','flutes'].includes(field)){
    const n=Math.max(2,Math.round((hi-lo)/pitch)),step=(hi-lo)/n;
    for(let i=0;i<n;i++){
      const x=lo+i*step;
      if(field==='paired'){
        put('paired-batten',x+.08*step,x+.27*step,bottom,top,.088,finish);
        put('paired-batten',x+.42*step,x+.61*step,bottom,top,.088,finish);
      }else{
        const fill=field==='boards'?.92:field==='flutes'?.66:.52;
        put(field,x+(1-fill)*step/2,x+(1+fill)*step/2,bottom,top,field==='boards'?.052:.094,finish);
      }
    }
    return;
  }
  const rows=Math.max(2,Math.round((top-bottom)/pitch)),rise=(top-bottom)/rows;
  for(let row=0;row<rows;row++){
    const z=bottom+row*rise;
    if(field==='lap'){
      put('lap-board',lo,hi,z+.007,z+rise-.007,.06,finish);
      put('lap-drip',lo,hi,z+.007,z+.035,.079,finish);
      continue;
    }
    const unit=pitch*(field==='panels'?1.7:field==='brick'?2.45:2.8);
    const shift=field==='panels'?0:row%2*unit/2;
    for(let x=lo-shift,i=0;x<hi;x+=unit,i++){
      const a=Math.max(x,lo)+.007,b=Math.min(x+unit,hi)-.007;
      if(b-a<.025)continue;
      put(field,a,b,z+.007,z+rise-.007,.055+.002*((i+row)%3),finish,[.91,1,.97,1.045][(row*3+i)%4]);
    }
  }
}

/** Every part lies outside apertures and below the roof seam on its own facade. */
export function houseRenovationParts(layout,style){
  if(!style?.renovation||!layout?.edges?.length)return [];
  const recipe=style.renovation,parts=[],bays=[];
  // Bound the number of full-height shutter assemblies. Give the garden facade first choice.
  const trimWindows=layout.windows.filter(w=>w.level!=='basement'&&w.hi>w.lo&&w.height>0);
  const shutterOrder=trimWindows.filter(w=>!['hst','balcony-door'].includes(w.kind))
    .sort((a,b)=>Number(b.edgeIndex===layout.rear.index)-Number(a.edgeIndex===layout.rear.index));
  const shutterIds=new Set(shutterOrder.slice(0,5).map(w=>w.id));
  for(const edge of layout.edges){
    if(edge.length<1.5)continue;
    const guards=openingGuards(layout,edge);
    const place=part=>{
      const {lo,hi,bottom,top}=part;
      if(lo<.105||hi>edge.length-.105||hi<=lo||top<=bottom||bottom<layout.baseZ+.035||top>minimumRoof(edge,lo,hi)-.09)return false;
      if(guards.some(g=>hi>g.lo-.015&&lo<g.hi+.015&&top>g.bottom-.015&&bottom<g.top+.015))return false;
      parts.push({...part,edgeIndex:edge.index});return true;
    };
    for(const w of trimWindows.filter(w=>w.edgeIndex===edge.index))
      openingTrim(w,recipe.trim,shutterIds.has(w.id),place);
    if(edge.length<2.6)continue;
    const blocked=[...guards,...parts.filter(p=>p.edgeIndex===edge.index)];
    // Shallow level stringcourses belong on long facades, with a break at every opening.
    for(let i=0;i<recipe.belt&&edge.length>=4;i++){
      const bottom=layout.floorZ+2.78+i*.10,top=bottom+(i===0?.068:.041);
      for(const [lo,hi] of freeSpans(edge,bottom,top,blocked,.05)){
        if(hi-lo>.40)place({kind:'stringcourse',lo,hi,bottom,top,depth:.076-i*.01,finish:i===0&&recipe.belt===1&&style.id!=='palm-springs'?'houseFrame':'accent'});
      }
    }
    // Select an uninterrupted patch of masonry between existing openings. On
    // mapped houses the unlocated street entrances keep their lower wall clear.
    const levels=[layout.floorZ+3.13];
    if(layout.door||edge===layout.rear)levels.push(layout.floorZ+.16);
    let best=null;
    for(const bottom of levels){
      const targetTop=bottom+2.50;
      for(const [left,right] of freeSpans(edge,bottom,targetTop,blocked,.105)){
        const width=Math.min(2.45,right-left);
        if(width<.59)continue;
        const lo=(left+right-width)/2,hi=lo+width;
        const top=Math.min(targetTop,minimumRoof(edge,lo,hi)-.22);
        if(top-bottom<1.12)continue;
        const score=width*(top-bottom);
        if(!best||score>best.score)best={edgeIndex:edge.index,lo,hi,bottom,top,score,place};
      }
    }
    if(best)bays.push({...best,score:best.score+(edge===layout.rear?5:0)});
  }
  for(const bay of bays.sort((a,b)=>b.score-a.score).slice(0,3))cladding(bay,recipe,bay.place);
  return parts;
}

export function summarizeHouseRenovation(parts,style){
  return {active:parts.length>0,styleId:style?.id??'current',description:style?.renovation?.description??'Original house finishes',
    partCount:parts.length,accentBayCount:new Set(parts.map(p=>p.bayId).filter(Boolean)).size,
    trimmedOpeningCount:new Set(parts.map(p=>p.openingId).filter(Boolean)).size,
    maxProjectionM:parts.reduce((max,p)=>Math.max(max,p.depth),0)};
}

export function houseRenovationSummary(data,settings,style=getDesignStyle(settings.designStyle)){
  if(!settings.styleHouseFinish||!style?.renovation)return summarizeHouseRenovation([],null);
  const layout=photoHouseSupported(data)?houseAppearanceLayout(data,settings,{garageLayout:garageLayout(settings,data,{terrainAt})}):
    mappedHouseFacadeLayout(data,settings);
  return summarizeHouseRenovation(houseRenovationParts(layout,style),style);
}
