import {ringBounds} from './interior-geometry.js?v=1.38.0';

/** Exact horizontal tread polygons used by both drawing and walking. This is
 * a visualization of the retained/proposed stair, not a headroom certificate. */
export function stairTreads(stair,plan) {
  const b=ringBounds(stair.polygon),dir=stair.direction||[0,-1];
  const alongX=Math.abs(dir[0])>.5,length=alongX?b.width:b.depth,width=alongX?b.depth:b.width;
  const theta=Math.atan2(dir[0],dir[1]),c=Math.cos(theta),s=Math.sin(theta);
  const map=([x,z])=>[b.x+c*x+s*z,b.z-s*x+c*z];
  const steps=stair.steps||(stair.kind==='hatch'?12:12),rise=stair.rise||2;
  const up=plan.floor===stair.from;
  const offset=plan.garage&&stair.id==='cellar-stair'&&plan.layout!=='renovation'?-2-plan.elevation:0;
  const base=(up?0:-rise)+offset;
  const winders=stair.kind==='winder'?4:0,straight=steps-winders;
  const corner=winders?Math.min(width,length*.4):0,run=(length-corner)/straight,riser=rise/steps;
  const result=[];
  for(let i=0;i<straight;i++){
    const z0=-length/2+i*run,z1=z0+run;
    result.push({id:`${stair.id}-${i}`,stairId:stair.id,index:i,from:stair.from,to:stair.to,
      polygon:[[-width/2,z0],[width/2,z0],[width/2,z1],[-width/2,z1]].map(map),
      top:base+(i+1)*riser,riser,thickness:.048});
  }
  if(winders){
    const pivot=[width/2,length/2-corner];
    const rim=angle=>{const dx=-Math.cos(angle),dz=Math.sin(angle),r=Math.min(width/Math.max(.00001,-dx),corner/Math.max(.00001,dz));return[pivot[0]+r*dx,pivot[1]+r*dz];};
    for(let i=0;i<winders;i++){
      const a=i*Math.PI/(2*winders),b=(i+1)*Math.PI/(2*winders),cut=Math.atan2(corner,width);
      result.push({id:`${stair.id}-${straight+i}`,stairId:stair.id,index:straight+i,from:stair.from,to:stair.to,
        polygon:[pivot,rim(a),...(a<cut&&b>cut?[[-width/2,length/2]]:[]),rim(b)].map(map),
        top:base+(straight+i+1)*riser,riser,thickness:.048});
    }
  }
  return result;
}
