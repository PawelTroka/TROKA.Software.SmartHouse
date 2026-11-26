/** Metric receiving-surface probes for the reset garden orbit acceptance view.
 * Uses current fittings, rather than screen rectangles for a previous circuit.
 * Keep the camera formula aligned with scene.js setView('orbit'). No renderer,
 * DOM, browser automation or image processing is needed to prepare the probes.
 */
import * as THREE from '../vendor/three.module.js';
import {pendantLightingLayout} from '../src/pendant-layout.js';
import {gardenGroundAt} from '../src/geometry.js';
import {boundsOf} from '../src/layout.js';
import {toWorld} from '../src/orientation.js';

export function hedgeSurfaceProbes(settings,data,{width,height}){
  const plot=boundsOf(data.site.boundary),cx=(plot.minX+plot.maxX)/2;
  const cy=data.site.rearMidpoint[1]+(plot.maxY-data.site.rearMidpoint[1])*.3;
  const span=plot.maxY-plot.minY,z=data.site.floorReference.z;
  const camera=new THREE.PerspectiveCamera(48,width/height,.1,1000);
  camera.position.fromArray(toWorld(cx+span*.5,cy+span*.6,z+span*.8));
  camera.lookAt(...toWorld(cx,cy,z+1.5));camera.updateMatrixWorld();
  const project=p=>{const q=new THREE.Vector3(...toWorld(...p)).project(camera);return [(q.x+1)/2,(1-q.y)/2];};
  const projectedBounds=points=>{
    const screen=points.map(project);
    return [Math.min(...screen.map(p=>p[0])),Math.min(...screen.map(p=>p[1])),
      Math.max(...screen.map(p=>p[0])),Math.max(...screen.map(p=>p[1]))];
  };
  const viewDirection=[camera.position.x-cx,camera.position.z-cy];
  // The near-facing edges have exposed surface patches in this audited orbit.
  // Opposite edges may be hidden by the house or intervening hedge crowns.
  const visible=pendantLightingLayout(settings,data).hedge.filter(f=>f.inward[0]*viewDirection[0]+f.inward[1]*viewDirection[1]<0);
  const patches=[];
  for(const f of visible){
    const tangent=[-f.inward[1],f.inward[0]],p=f.boundaryPoint.map((v,i)=>v+f.inward[i]*.35);
    const base=gardenGroundAt(...p,settings,data);
    const foliage=[-.55,.55].flatMap(offset=>[.85,1.75].map(h=>[p[0]+tangent[0]*offset,p[1]+tangent[1]*offset,base+h]));
    const ground=[[-.6,-.6],[.6,-.6],[.6,.6],[-.6,.6]].map(([dx,dy])=>[
      f.x+dx,f.y+dy,gardenGroundAt(f.x+dx,f.y+dy,settings,data)+.03]);
    // Include shade, diffuser and halo in the exclusion envelope. Probes must
    // measure surrounding surfaces, never just an emissive fitting.
    const radius=Math.max(f.radius*1.5,.22),halfHeight=Math.max(f.height*.7,.22);
    const fittingBounds=projectedBounds([-radius,radius].flatMap(dx=>[-radius,radius].flatMap(dy=>[-halfHeight,halfHeight].map(dz=>[f.x+dx,f.y+dy,f.z+dz]))));
    for(const [surface,worldPolygon]of [['foliage',foliage],['ground',ground]]){
      const projected=projectedBounds(worldPolygon),bounds=projected.map(n=>Math.max(0,Math.min(1,n)));
      const fraction=(bounds[2]-bounds[0])*(bounds[3]-bounds[1])/((projected[2]-projected[0])*(projected[3]-projected[1]));
      if(bounds.some(n=>!Number.isFinite(n))||fraction<.8)throw new Error(f.id+' '+surface+' falls outside the acceptance view');
      // The axis-aligned pixel region may touch the projected shade at a
      // foreshortened corner. Pixel comparisons explicitly exclude its box.
      patches.push({id:`${f.id}-${surface}`,fixtureId:f.id,side:f.side,surface,bounds,worldPolygon,fittingBounds});
    }
  }
  return {fixtures:visible.map(f=>({id:f.id,side:f.side,x:f.x,y:f.y,z:f.z,boundaryPoint:f.boundaryPoint})),patches,
    projection:{width,height,position:camera.position.toArray(),target:toWorld(cx,cy,z+1.5),fov:48}};
}
