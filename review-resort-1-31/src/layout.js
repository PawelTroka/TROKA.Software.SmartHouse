/** Shared metric layout helpers. All positions are local metres. */
import {gardenProgram,spaEnabled,poolBounds} from './garden-program.js?v=1.31.0';
import {resortGardenFurniture} from './resort-garden.js?v=1.31.0';
import {terraceGroundReference} from './geometry.js?v=1.31.0';
import {footprintFit,overlapArea} from './footprint-fit.js?v=1.31.0';
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
  const result=resortGardenFurniture(baseGardenFurniture(data,settings),settings,data);
  if(!result.resort)return result;
  const t=data.site.terrace,rear=data.site.rearMidpoint[1],depth=Number(settings.terraceDepth)||t.depth;
  const stairs=terraceStairs({...t,y:rear},depth,terraceGroundReference(settings,data).drop,settings,data);
  const program=gardenProgram(settings,data),pool=poolBounds(settings,data);
  const obstacles=[data.site.house.footprint,rectCorners({x:t.x,y:rear,width:t.width,length:depth},.15)];
  if(stairs.count)obstacles.push(rectCorners(stairs,.15));
  if(pool)obstacles.push(rectCorners(pool,pool.coping+.12));
  if(program.active)obstacles.push(program.sauna.footprint,program.firepit.outerFootprint,rectCorners(program.coldPlunge,.24),
    ...(program.sauna.entrySteps||[]).map(s=>s.footprint),...(program.coldPlunge.steps||[]).map(s=>rectCorners(s,.12)));
  if(data.site.garage&&settings.removeGarage===false)obstacles.push(data.site.garage.footprint);
  const fits=r=>footprintFit(rectCorners(r),data.site.boundary).location==='inside'&&!obstacles.some(p=>overlapArea(rectCorners(r,.04),p)>.00001);
  const items=result.resort.items.filter(fits);
  // A retained building or enlarged deck may consume a proposed furniture
  // zone. Omit that proposal consistently in both plan and rendered scene.
  const diningVisible=(!data.site.garage||settings.removeGarage!==false)&&fits(result.dining);
  return {...result,diningVisible,resort:{...result.resort,items}};
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
  return {x:terrace.x+(terrace.stairOffset??(spa?3.6:1)),y:terrace.y+depth,width:terrace.stairWidth??3,length:count*.29,count,drop:Math.max(0,drop)};
}
export function rectanglesOverlap(a,b,gap=0) {
  return a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x
    &&a.y<b.y+(b.length??b.depth)+gap&&a.y+(a.length??a.depth)+gap>b.y;
}
