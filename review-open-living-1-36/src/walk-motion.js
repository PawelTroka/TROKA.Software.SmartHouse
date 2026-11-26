// Shared by the room and whole-property cameras. These are the original room
// walk settings: a level horizon, no head bob, fixed lens and direct movement.
export const WALK_COMFORT=Object.freeze({
  speed:1.68,fastSpeed:2.7,fov:70,lookGain:.0043,maxPitch:1.24,
  maxFrameSeconds:.056,elevationResponse:10,maxElevationSpeed:2,
});

export function walkFrameSeconds(now,previous){
  return Math.max(0,Math.min(WALK_COMFORT.maxFrameSeconds,previous?(now-previous)/1000:1/60));
}

// Yaw zero looks along -Z; right is +X. World/site cameras convert their
// heading once at the boundary, rather than keeping a second input model.
export function walkDelta(right,forward,distance,yaw=0,vertical=0){
  const norm=Math.hypot(right,forward,vertical);
  if(!norm||!(distance>0))return[0,0,0];
  return[(Math.cos(yaw)*right+Math.sin(yaw)*forward)*distance/norm,vertical*distance/norm,
    (Math.sin(yaw)*right-Math.cos(yaw)*forward)*distance/norm];
}

export function walkLook(yaw,pitch,dx,dy){
  return{yaw:yaw+dx*WALK_COMFORT.lookGain,
    pitch:Math.max(-WALK_COMFORT.maxPitch,Math.min(WALK_COMFORT.maxPitch,pitch-dy*WALK_COMFORT.lookGain))};
}

// Exact integration of a speed-limited exponential approach. Dividing the
// same interval into 30, 60 or 144 frames gives the same camera height. Large
// grade changes descend gently; stair treads never jolt the camera vertically.
export function smoothWalkElevation(current,target,seconds){
  if(!(seconds>0)||current===target)return current;
  const {elevationResponse:rate,maxElevationSpeed:speed}=WALK_COMFORT;
  const error=target-current,distance=Math.abs(error),threshold=speed/rate;
  const linearTime=Math.max(0,(distance-threshold)/speed);
  const remaining=seconds<=linearTime?distance-speed*seconds:
    Math.min(distance,threshold)*Math.exp(-rate*(seconds-linearTime));
  return target-Math.sign(error)*remaining;
}
