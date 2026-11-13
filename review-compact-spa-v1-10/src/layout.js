/** Shared metric layout helpers. All positions are local metres. */
import {gardenProgram,spaEnabled} from './garden-program.js?v=1.10.0';
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
  const program=gardenProgram(settings,data);
  if(program.active)return program.furniture;
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
  return {x:terrace.x+(spa?3.6:1),y:terrace.y+depth,width:3,length:count*.29,count,drop:Math.max(0,drop)};
}
export function rectanglesOverlap(a,b,gap=0) {
  return a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x
    &&a.y<b.y+(b.length??b.depth)+gap&&a.y+(a.length??a.depth)+gap>b.y;
}
