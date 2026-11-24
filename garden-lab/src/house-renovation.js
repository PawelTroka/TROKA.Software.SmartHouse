// Shallow, additive facade treatments in wall-local metres. The renderers use
// these same window and entry records for the underlying house.
import {houseAppearanceLayout,photoHouseSupported} from './house-appearance.js?v=1.32.0';
import {photoRoofEdgeHeight} from './house-roof.js?v=1.32.0';
import {mappedHouseFacadeLayout} from './mapped-house-facades.js?v=1.32.0';
import {roofEdgeHeight} from './roof-envelope.js?v=1.32.0';
import {garageLayout} from './garage-ramp.js?v=1.32.0';
import {terrainAt} from './geometry.js?v=1.32.0';
import {getDesignStyle} from './design-styles.js?v=1.32.0';
import {getExteriorSurfaceSpec} from './exterior-recipes.js?v=1.32.0';

function minimumRoof(edge,lo,hi){
  const roof=edge.roofEdge;
  if(!roof)return Number.isFinite(edge.topZ)?edge.topZ:Infinity;
  const height=d=>roof.fractions?photoRoofEdgeHeight(roof,d):roofEdgeHeight(roof,d/edge.length);
  let minimum=Math.min(height(lo),height(hi));
  for(let i=1;i<roof.points.length-1;i++){
    const d=edge.length*(roof.fractions?.[i]??i/(roof.points.length-1));
    if(d>lo&&d<hi)minimum=Math.min(minimum,roof.points[i][2]);
  }
  return Math.min(minimum,Number.isFinite(edge.topZ)?edge.topZ:Infinity);
}

// Keep the portion of a wall band beneath its own roof segment. Taking the
// lowest eave across an entire irregular facade would erase usable wall fields.
function roofSpans(edge,lo,hi,height){
  if(Number.isFinite(edge.topZ)&&height>edge.topZ)return [];
  const roof=edge.roofEdge;
  if(!roof)return [[lo,hi]];
  const spans=[];
  for(let i=0;i<roof.points.length-1;i++){
    const x0=edge.length*(roof.fractions?.[i]??i/(roof.points.length-1));
    const x1=edge.length*(roof.fractions?.[i+1]??(i+1)/(roof.points.length-1));
    let a=Math.max(lo,x0),b=Math.min(hi,x1);
    if(b<=a||x1<=x0)continue;
    const z0=roof.points[i][2],z1=roof.points[i+1][2],slope=(z1-z0)/(x1-x0);
    if(Math.abs(slope)<1e-8){if(z0<height)continue;}
    else{
      const crossing=x0+(height-z0)/slope;
      if(slope>0)a=Math.max(a,crossing);else b=Math.min(b,crossing);
    }
    if(b<=a)continue;
    const previous=spans.at(-1);
    if(previous&&Math.abs(previous[1]-a)<1e-7)previous[1]=b;
    else spans.push([a,b]);
  }
  return spans;
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
  const jamb=['timber','crosshead','fine','steel','stepped','coastal'].includes(trim);
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
  const overhang=trim==='crosshead'||trim==='coastal'?.23:width+.04;
  put('window-sill',lo-overhang,hi+overhang,z-gap-.075,z-gap,.14);
  if(trim==='soldier'){
    const n=Math.max(3,Math.round((hi-lo+.16)/.095)),pitch=(hi-lo+.16)/n;
    for(let i=0;i<n;i++) put('soldier-lintel',lo-.08+i*pitch,lo-.08+(i+1)*pitch-.008,top+gap,top+gap+.21,.085,'surface');
  }else{
    const height=['crosshead','cap','coastal'].includes(trim)?.14:width;
    put('window-head',lo-overhang,hi+overhang,top+gap,top+gap+height,.106);
    if(['stepped','steel','coastal'].includes(trim)){
      put('projecting-head-cap',lo-overhang-.07,hi+overhang+.07,top+gap+height,top+gap+height+.065,.135,trim==='stepped'?'accent':finish);
    }
  }
  if((trim==='shutters'||trim==='coastal')&&shutters){
    const leaf=Math.min(.43,(hi-lo)*.26);
    const offset=trim==='coastal'?gap+width+.04:.105;
    for(const left of [lo-offset-leaf,hi+offset]){
      if(!put('shutter-back',left,left+leaf,z,top,.045,'houseFrame'))continue;
      for(let y=z+.07;y<top-.05;y+=.155)
        put('shutter-louvre',left+.028,left+leaf-.028,y,Math.min(y+.105,top-.035),.082,'houseFrame');
    }
  }
}

function cladding(bay,recipe,place){
  const {lo,hi,bottom,top,edgeIndex}=bay,{field,pitch}=recipe;
  const put=(kind,a,b,c,d,depth,finish,tone=1)=>place({
    kind,lo:a,hi:b,bottom:c,top:d,depth,finish,tone,bayId:bay.id??`bay-${edgeIndex}`});
  const wood=['boards','battens','paired','lap','weatherboard'].includes(field);
  const finish=field==='weatherboard'?'houseWall':wood?'wood':field==='flutes'?'houseFrame':'surface';
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
  if(field==='weatherboard'){
    // Register the lap courses to one shared height grid over the whole house. Cutting
    // around a shutter or reveal must not squeeze the remaining boards into a
    // different pitch on the next strip of the same wall.
    const origin=bay.courseOrigin??0;
    for(let row=Math.floor((bottom-origin)/pitch);origin+row*pitch<top;row++){
      const z=origin+row*pitch,a=Math.max(bottom,z+.007),b=Math.min(top,z+pitch-.007);
      if(b-a>.012)put('weatherboard-course',lo,hi,a,b,.065,finish);
      const lipBottom=Math.max(bottom,z+.007),lipTop=Math.min(top,z+.035);
      if(lipTop-lipBottom>.006)put('weatherboard-drip',lo,hi,lipBottom,lipTop,.085,finish);
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
  const recipe=style.renovation,construction=getExteriorSurfaceSpec(style),parts=[],bays=[];
  // Bound the number of full-height shutter assemblies. Give the garden facade first choice.
  const trimWindows=layout.windows.filter(w=>w.level!=='basement'&&w.hi>w.lo&&w.height>0);
  const shutterOrder=trimWindows.filter(w=>!['hst','balcony-door'].includes(w.kind))
    .sort((a,b)=>Number(b.edgeIndex===layout.rear.index)-Number(a.edgeIndex===layout.rear.index));
  const shutterIds=new Set(shutterOrder.slice(0,14).map(w=>w.id));
  for(const edge of layout.edges){
    if(edge.length<1.5)continue;
    const guards=openingGuards(layout,edge);
    const place=part=>{
      const {lo,hi,bottom,top}=part;
      if(lo<.105||hi>edge.length-.105||hi<=lo||top<=bottom||bottom<Math.max(layout.baseZ,edge.baseZ??layout.baseZ)+.035||top>minimumRoof(edge,lo,hi)-.09)return false;
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
    // Renovations cover actual wall fields rather than three isolated samples.
    // Split at every reveal/trim height first, then clip every horizontal band
    // around openings. This preserves light and access through the whole facade.
    const upper=(layout.firstFloorZ??layout.floorZ+3.05)+.10;
    const lower=layout.floorZ+.16;
    const canUseLower=Boolean(layout.door||edge===layout.rear);
    const coverage=construction?.coverage??'piers';
    const fullFields=[];
    if(['upper','upper-and-piers','all-panels'].includes(coverage))fullFields.push([upper,upper+2.49]);
    if(coverage==='all-panels'&&canUseLower)fullFields.push([lower,lower+2.50]);
    if(['mineral-base','masonry-piers'].includes(coverage)&&canUseLower)fullFields.push([lower,lower+(coverage==='masonry-piers'?.91:.72)]);
    for(const [requestedBottom,requestedTop] of fullFields){
      const bottom=Math.max(requestedBottom,(edge.baseZ??layout.baseZ)+.04);
      const top=Math.min(requestedTop,Number.isFinite(edge.topZ)?edge.topZ-.18:Infinity);
      if(top-bottom<.15)continue;
      const roofCuts=edge.roofEdge?.points.map(p=>p[2]-.18)??[];
      const cuts=[...new Set([bottom,top,...blocked.flatMap(g=>[g.bottom-.055,g.top+.055]),...roofCuts].filter(z=>z>=bottom&&z<=top))].sort((a,b)=>a-b);
      for(let k=0;k<cuts.length-1;k++){
        const z0=cuts[k],z1=cuts[k+1];if(z1-z0<.055)continue;
        for(const [a,b]of freeSpans(edge,z0,z1,blocked,.06)){
          for(const [lo,hi]of roofSpans(edge,a,b,z1+.18)){
            if(hi-lo<.12)continue;
            bays.push({id:`field-${edge.index}-${k}`,edgeIndex:edge.index,lo,hi,bottom:z0,top:z1,place});
          }
        }
      }
    }
    // Piers use the remaining full-height solid bays. On mapped houses, an
    // unlocated street entrance still reserves its lower facade.
    const levels=['piers','masonry-piers','mineral-base'].includes(coverage)?[upper]:[];
    if(canUseLower&&['piers','upper-and-piers','masonry-piers'].includes(coverage))levels.push(lower);
    for(const level of levels){
      const bottom=Math.max(level,(edge.baseZ??layout.baseZ)+.04);
      const targetTop=level+2.50;
      if(targetTop<=bottom+.15)continue;
      for(const [left,right] of freeSpans(edge,bottom,targetTop,blocked,.105)){
        const width=Math.min(3.10,right-left);
        if(width<.59)continue;
        const lo=(left+right-width)/2,hi=lo+width;
        const top=Math.min(targetTop,minimumRoof(edge,lo,hi)-.22);
        if(top-bottom<1.12)continue;
        // The lower masonry base already covers the first 91 cm.
        const from=coverage==='masonry-piers'&&bottom===lower?lower+.95:bottom;
        if(top-from>.2)bays.push({id:`pier-${edge.index}-${lo.toFixed(3)}-${bottom.toFixed(3)}`,edgeIndex:edge.index,lo,hi,bottom:from,top,place});
      }
    }
    // Fine eaves caps and cornice shadows run across each available wall. They
    // remain inside the established 14 cm projection and never cover a pane.
    const eaveTop=minimumRoof(edge,.22,edge.length-.22)-.11;
    if(eaveTop>upper+1){
      const eaveDepth=recipe.trim==='crosshead'?.135:recipe.trim==='stepped'?.12:.075;
      for(const [lo,hi]of freeSpans(edge,eaveTop-.10,eaveTop,guards,.055))if(hi-lo>.25)
        place({kind:'eaves-finish',lo,hi,bottom:eaveTop-.10,top:eaveTop,depth:eaveDepth,finish:recipe.field==='weatherboard'?'houseFrame':['boards','battens','paired','lap'].includes(recipe.field)?'wood':'edge'});
    }
  }
  for(const bay of bays)cladding({...bay,courseOrigin:layout.floorZ},recipe,bay.place);
  return parts;
}

export function summarizeHouseRenovation(parts,style){
  return {active:parts.length>0,styleId:style?.id??'current',description:style?.renovation?.description??'Original house finishes',
    partCount:parts.length,accentBayCount:new Set(parts.map(p=>p.bayId).filter(Boolean)).size,
    trimmedOpeningCount:new Set(parts.map(p=>p.openingId).filter(Boolean)).size,
    claddingAreaM2:parts.filter(p=>p.kind==='cladding-backing').reduce((sum,p)=>sum+(p.hi-p.lo)*(p.top-p.bottom),0),
    maxProjectionM:parts.reduce((max,p)=>Math.max(max,p.depth),0),coverage:getExteriorSurfaceSpec(style)?.coverage??'none',
    surfaceSpecification:getExteriorSurfaceSpec(style)};
}

export function houseRenovationSummary(data,settings,style=getDesignStyle(settings.designStyle)){
  if(!settings.styleHouseFinish||!style?.renovation)return summarizeHouseRenovation([],null);
  const layout=photoHouseSupported(data)?houseAppearanceLayout(data,settings,{garageLayout:garageLayout(settings,data,{terrainAt})}):
    mappedHouseFacadeLayout(data,settings);
  return summarizeHouseRenovation(houseRenovationParts(layout,style),style);
}
