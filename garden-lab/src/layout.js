/** Shared metric layout helpers. All positions are local metres. */
import {gardenProgram,spaEnabled,poolBounds} from './garden-program.js?v=1.39.0';
import {resortGardenFurniture} from './resort-garden.js?v=1.39.0';
import {terraceGroundReference,privacyStructures} from './geometry.js?v=1.39.0';
import {footprintFit,overlapArea} from './footprint-fit.js?v=1.39.0';
import {summerGardenEnabled} from './summer-garden.js?v=1.39.0';
import {gardenPathNetwork} from './garden-paths.js?v=1.39.0';
export function boundsOf(points) {
  return {minX:Math.min(...points.map(p=>p[0])),maxX:Math.max(...points.map(p=>p[0])),
    minY:Math.min(...points.map(p=>p[1])),maxY:Math.max(...points.map(p=>p[1]))};
}
export function rectCorners(rect,padding=0) {
  const {x,y,width,length=rect.depth}=rect;
  return [[x-padding,y-padding],[x+width+padding,y-padding],
    [x+width+padding,y+length+padding],[x-padding,y+length+padding]];
}

/** Low furniture only: it illustrates the proposal and is excluded from sun rays. */
export function gardenFurniture(data,settings={}) {
  const base=baseGardenFurniture(data,settings);
  // Finish-only comparisons retain the physical furniture/path quantities.
  // Resort transforms and fit filtering belong to the optional garden layout.
  if(settings.styleGardenLayout===false)return withGardenPaths(base,data,settings);
  const result=resortGardenFurniture(base,settings,data);
  if(!result.resort)return withGardenPaths(result,data,settings);
  // The side selector controls actual individual sunbeds. The older two-seat
  // style recipe must not collapse the inward-facing row into one double bed.
  if(summerGardenEnabled(settings,data))result.resort.items=result.sunbeds.map(b=>({...b}));
  const t=data.site.terrace,rear=data.site.rearMidpoint[1],depth=Number(settings.terraceDepth)||t.depth;
  const stairs=terraceStairs({...t,y:rear},depth,terraceGroundReference(settings,data).drop,settings,data);
  const program=gardenProgram(settings,data),pool=poolBounds(settings,data);
  const obstacles=[data.site.house.footprint,rectCorners({x:t.x,y:rear,width:t.width,length:depth},.15)];
  if(stairs.count)obstacles.push(rectCorners(stairs,.15));
  if(pool)obstacles.push(rectCorners(pool,pool.coping+.12));
  if(program.active)obstacles.push(program.sauna.footprint,program.firepit.outerFootprint,rectCorners(program.coldPlunge,.24),
    ...(program.sauna.entrySteps||[]).map(s=>s.footprint),...(program.coldPlunge.steps||[]).map(s=>rectCorners(s,.12)));
  if(data.site.garage&&settings.removeGarage===false)obstacles.push(data.site.garage.footprint);
  const pavilion=privacyStructures(settings,data).pavilion;
  if(pavilion?.enabled)obstacles.push(pavilion.footprint,...(pavilion.footprints||[]).filter(f=>f.id!=='corner-pavilion').map(f=>rectCorners(f)));
  const fits=r=>footprintFit(rectCorners(r),data.site.boundary).location==='inside'&&!obstacles.some(p=>overlapArea(rectCorners(r,.04),p)>.00001);
  const items=result.resort.items.filter(fits);
  const path=result.path.filter(([x,y])=>fits({x,y,width:1.15,length:.9}));
  // A retained building or enlarged deck may consume a proposed furniture
  // zone. Omit that proposal consistently in both plan and rendered scene.
  const diningVisible=(!data.site.garage||settings.removeGarage!==false)&&fits(result.dining);
  const network=withGardenPaths({...result,diningVisible,resort:{...result.resort,items}},data,settings).pathNetwork;
  const proposal=program.renovation;
  let beds=[],pads=[];
  if(proposal){
    const furnishings=[...items,...(diningVisible?[result.dining]:[])];
    const clearOfFurniture=r=>!furnishings.some(f=>rectanglesOverlap(r,f,.20));
    const paths=path.map(([x,y])=>({x,y,width:1.15,length:.9}));
    beds=proposal.beds.filter(r=>fits(r)&&clearOfFurniture(r)&&
      !paths.some(p=>rectanglesOverlap(r,p,.12))&&
      !(network?.segments||[]).some(p=>overlapArea(rectCorners(r,.12),p.footprint)>1e-8)&&
      !(settings.screeningTrees||[]).some(t=>t.enabled!==false&&t.x>=r.x-1&&t.x<=r.x+r.width+1&&t.y>=r.y-1&&t.y<=r.y+r.length+1))
      .map((r,i)=>({...r,id:`garden-bed-${i+1}`,plant:result.resort.plant}));
    pads=items.filter(p=>['daybed','lounger','sofa'].includes(p.kind)).map((p,i)=>({
      id:`resting-pad-${i+1}`,x:p.x-.16,y:p.y-.16,width:p.width+.32,length:p.length+.32,
    })).filter(fits);
  }
  return {...result,path,diningVisible,pathNetwork:network,resort:{...result.resort,items,kitchen:null,beds,pads,scheme:proposal?.name||null}};
}
function withGardenPaths(furniture,data,settings){
  if(!summerGardenEnabled(settings,data))return furniture;
  const t=data.site.terrace,depth=Number(settings.terraceDepth)||t.depth,terrace={x:t.x,y:data.site.rearMidpoint[1],width:t.width,length:depth};
  const stairs=terraceStairs({...t,y:terrace.y},depth,terraceGroundReference(settings,data).drop,settings,data);
  return {...furniture,pathNetwork:gardenPathNetwork({program:gardenProgram(settings,data),stairs,terrace,
    dining:furniture.dining,items:furniture.resort?.items||furniture.sunbeds||[],boundary:data.site.boundary,trees:settings.screeningTrees||[]})};
}
function baseGardenFurniture(data,settings={}) {
  const program=gardenProgram(settings,data);
  if(program.active)return program.furniture;
  if(data.site.furniture)return data.site.furniture;
  if(data.site.id==='korzeniowskiego-40') {
    const p=data.site.pool,b=boundsOf(data.site.boundary);
    return {
      loungers:[[p.x+p.width+1.1,p.y+4.2],[p.x+p.width+2.15,p.y+4.2]],
      dining:{x:9.2,y:b.maxY-4.2,width:3.5,length:2.8},
      path:[],
    };
  }
  return {loungers:[[10.8,28],[10.8,30.5]],dining:{x:14.1,y:24.5,width:3.8,length:4.6},
    path:Array.from({length:9},(_,i)=>[3.2,23+i*1.45]).filter(([,y])=>y<35)};
}

/** The illustrated terrace steps follow the actual selected floor-to-ground drop. */
export function terraceStairs(terrace,depth,drop,settings={},data) {
  const count=drop>.1?Math.max(1,Math.ceil(drop/.18)):0;
  const spa=data&&spaEnabled(settings,data);
  const centered=spa&&settings.jacuzziCentered===true;
  // A central spa keeps the generous west-side route to the lawn open. The
  // shared stair rectangle drives walking, plan, mesh and solar obstruction.
  return {x:terrace.x+(terrace.stairOffset??(centered?.18:spa?3.6:1)),y:terrace.y+depth,
    width:terrace.stairWidth??(centered?2.2:3),length:count*.29,count,drop:Math.max(0,drop)};
}
export function rectanglesOverlap(a,b,gap=0) {
  return a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x
    &&a.y<b.y+(b.length??b.depth)+gap&&a.y+(a.length??a.depth)+gap>b.y;
}
