/**
 * Upper-room outlooks are concept window-plane viewpoints. The house footprint
 * is mapped; window positions and floor-to-floor rises have not been surveyed.
 * Keep this catalogue shared by state, controls, and the numerical observer.
 */
export const UPPER_FLOOR_PRESETS = Object.freeze([
  ...['first', 'attic'].flatMap(level => ['garden', 'street'].flatMap(facing =>
    ['seated', 'standing'].map(posture => Object.freeze({
      id: `${level}-${facing}-${posture}`,
      label: `${level === 'first' ? 'First floor · bedroom / office' : 'Second floor · strych'} · ${facing} · ${posture}`,
      level,
      floorLevel: level === 'first' ? 1 : 2,
      facing,
      posture,
      eyeHeight: posture === 'seated' ? 1.2 : 1.65,
      defaultLookYaw: facing === 'garden' ? 0 : 180,
      defaultLookPitch: -6,
    }))))
]);

function streetWindowFrame(data) {
  const street=data?.site?.streetView||{};
  const axis=street.axis==='x'||street.facade==='left'||street.facade==='right'?'x':'y';
  const side=street.side==='max'||street.facade==='left'||street.facade==='rear'?'max':'min';
  const outward=side==='max'?1:-1;
  const inferredYaw=axis==='x'?(outward<0?90:-90):(outward<0?180:0);
  const yaw=Number.isFinite(street.lookYaw)?street.lookYaw:Number.isFinite(street.yaw)?street.yaw:inferredYaw;
  return {axis,side,outward,yaw,label:street.label};
}

/** Corner properties can face a street through a side facade. Catalogue IDs
 * stay stable for existing shares; only the active property's view is resolved. */
export function upperFloorPreset(id,data) {
  const preset=UPPER_FLOOR_PRESETS.find(preset=>preset.id===id);
  if(!preset)return preset;
  const label=data?.site?.id==='nadmorska-17'&&preset.level==='attic'
    ?preset.label.replace('Second floor · strych','Tower level · concept'):preset.label;
  if(preset.facing!=='street'||!data?.site?.streetView)
    return label===preset.label?preset:Object.freeze({...preset,label});
  const street=streetWindowFrame(data);
  return Object.freeze({...preset,defaultLookYaw:street.yaw,
    label:street.label?label.replace(' · street · ',` · ${street.label} · `):label});
}

/**
 * Intersect the centreline with the actual house footprint instead of its
 * bounding rectangle: the second property has a stepped, rotated frontage.
 * A 25 cm outward clearance avoids unmodelled opaque room walls and decorative
 * window panes. Rendering and visibility analysis use this same position.
 */
export function upperFloorWindowPosition(facing, data) {
  const ring = data.site.house.footprint;
  const frame=facing==='street'?streetWindowFrame(data):{axis:'y',side:'max',outward:1};
  const along=frame.axis==='x'?0:1,cross=1-along;
  const crossCoordinates=ring.map(point=>point[cross]);
  const centre=(Math.min(...crossCoordinates)+Math.max(...crossCoordinates))/2;
  const intersections=[];
  for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],delta=b[cross]-a[cross];
    if(Math.abs(delta)<1e-9){
      if(Math.abs(centre-a[cross])<1e-9)intersections.push(a[along],b[along]);
      continue;
    }
    const t=(centre-a[cross])/delta;
    if(t>=0&&t<=1)intersections.push(a[along]+t*(b[along]-a[along]));
  }
  if(!intersections.length)throw new Error('Upper-floor views require a valid mapped house footprint.');
  const facade=frame.side==='min'?Math.min(...intersections):Math.max(...intersections);
  const facadeOffset=.25,position=[],facadePosition=[];
  position[along]=facade+frame.outward*facadeOffset;position[cross]=centre;
  facadePosition[along]=facade;facadePosition[cross]=centre;
  return {x:position[0],y:position[1],facadePosition:{x:facadePosition[0],y:facadePosition[1]},facadeOffset};
}
