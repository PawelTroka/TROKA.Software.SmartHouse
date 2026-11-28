/** Place sampled ground colours in their native East/North grid. This affects
 * only appearance; all surface elevations continue to come from the DTM. */
export function contextGroundUV(x,y,coordinates,boundsEN){
  const {localOriginEN:o,xUnitEN:ux,yUnitEN:uy}=coordinates;
  const e=o[0]+x*ux[0]+y*uy[0],n=o[1]+x*ux[1]+y*uy[1];
  return [(e-boundsEN[0][0])/(boundsEN[1][0]-boundsEN[0][0]),
    (n-boundsEN[0][1])/(boundsEN[1][1]-boundsEN[0][1])];
}

export function projectContextGroundUVs(geometry,source){
  const position=geometry.attributes.position,uv=geometry.attributes.uv;
  for(let i=0;i<position.count;i++){
    // Three.js world = (local x, elevation, local y).
    const value=contextGroundUV(position.getX(i),position.getZ(i),source.coordinates,source.boundsEN);
    uv.setXY(i,value[0],value[1]);
  }
  uv.needsUpdate=true;
  return geometry;
}
