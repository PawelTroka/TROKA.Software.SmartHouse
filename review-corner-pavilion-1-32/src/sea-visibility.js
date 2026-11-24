/**
 * Sightlines to the Gulf of Gdańsk in an absolute height datum.
 * This module has no renderer or DOM dependency. Missing surface coverage
 * always produces an incomplete result, even when the known skyline clears.
 */
export const EARTH_RADIUS_M = 6371000;
export const SEA_MODES = Object.freeze([
  Object.freeze({id:'water',label:'Water 1 km beyond the shore'}),
  Object.freeze({id:'horizon',label:'Distant sea / geometric horizon'}),
]);
const finite = (v,fallback=0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const roundHeight = v => Number.isFinite(v) ? Math.ceil(v*10)/10 : null;

/** Height required at the observer for a finite water target. Curvature is
 * expressed as the spherical bulge above the chord joining the endpoints.
 * d and D are ground distances; heights share one absolute vertical datum. */
export function requiredEyeForWater(topZ,distance,targetDistance,seaZ=0,radius=EARTH_RADIUS_M){
  if(![topZ,distance,targetDistance,seaZ].every(Number.isFinite)||distance<0||targetDistance<=distance||radius<=0)return Infinity;
  const fraction=distance/targetDistance;
  const bulge=Number.isFinite(radius)?distance*(targetDistance-distance)/(2*radius):0;
  return (topZ-fraction*seaZ+bulge)/(1-fraction);
}

/** For a ray tangent to the sea, h at distance d satisfies
 * (sqrt(h)-d/sqrt(2R))² >= obstacle height above sea level.
 * This is a first-order spherical model with NO assumed refraction. */
export function requiredEyeForHorizon(topZ,distance,seaZ=0,radius=EARTH_RADIUS_M){
  if(![topZ,distance,seaZ].every(Number.isFinite)||distance<0||radius<=0)return Infinity;
  const term=Number.isFinite(radius)?distance/Math.sqrt(2*radius):0;
  return seaZ+(Math.sqrt(Math.max(0,topZ-seaZ))+term)**2;
}

/** Height of the selected ray relative to the same sea-level surface datum. */
export function seaRayHeight(eyeZ,distance,{mode='water',targetDistance,seaZ=0,radius=EARTH_RADIUS_M}={}){
  if(mode==='horizon'){
    const h=eyeZ-seaZ;
    if(h<0)return NaN;
    const horizonDistance=Number.isFinite(radius)?Math.sqrt(2*radius*h):Infinity;
    if(distance>horizonDistance+1e-8)return NaN;
    return seaZ+(Math.sqrt(h)-(Number.isFinite(radius)?distance/Math.sqrt(2*radius):0))**2;
  }
  if(!Number.isFinite(targetDistance)||targetDistance<=0)return NaN;
  const t=distance/targetDistance,bulge=Number.isFinite(radius)?distance*(targetDistance-distance)/(2*radius):0;
  return eyeZ*(1-t)+seaZ*t-bulge;
}

function blockerAt(profile,index,corridor){
  const run=(profile.buildingRuns||[]).find(([a,b])=>index>=a&&index<=b);
  const building=run?corridor.buildings?.[run[2]]:null;
  const kind=profile.surfaceKind?.[index];
  return {kind:building?'building':kind==='0'?'terrain':'surface',
    label:building?.label|| (kind==='0'?'Ground / dune surface':'Tree canopy or other recorded surface'),
    buildingId:building?.id||null};
}

export function evaluateSeaProfile(corridor,observer,profile,options={}){
  const mode=options.mode==='horizon'?'horizon':'water';
  const seaZ=finite(corridor.seaLevelZ),radius=finite(corridor.model?.earthRadiusM,EARTH_RADIUS_M);
  const clearanceM=Math.max(0,Math.min(10,finite(options.clearanceM,1)));
  const heightAboveGround=Math.max(0,finite(options.heightAboveGround,10));
  const eyeZ=observer.groundZ+heightAboveGround,step=finite(profile.stepM,1);
  const targetDistance=profile.waterDistanceM;
  // The finite water target must itself lie before the geometric horizon;
  // checking only land would miss the curvature of the intervening sea.
  let minimum=mode==='water'?seaZ+targetDistance**2/(2*radius):seaZ,control=null,missing=0,minMargin=Infinity;
  const required=(z,d)=>mode==='horizon'?requiredEyeForHorizon(z,d,seaZ,radius):requiredEyeForWater(z,d,targetDistance,seaZ,radius);
  // A sea horizon must fall beyond the actual shore, not in front of land.
  if(mode==='horizon')minimum=requiredEyeForHorizon(seaZ,profile.shoreDistanceM,seaZ,radius);
  for(let i=0;i<(profile.surfaceZ?.length||0);i++){
    const top=profile.surfaceZ[i];
    if(!Number.isFinite(top)){missing++;continue;}
    // Maxima represent a bin. Its far edge is conservative for blockers
    // above the target sea level, avoiding an optimistic near-edge test.
    const distance=Math.min((i+1)*step,profile.shoreDistanceM);
    const requiredZ=required(top+clearanceM,distance);
    const rayZ=seaRayHeight(eyeZ,distance,{mode,targetDistance,seaZ,radius});
    minMargin=Math.min(minMargin,Number.isFinite(rayZ)?rayZ-top-clearanceM:-Infinity);
    if(requiredZ>minimum){minimum=requiredZ;control={index:i,distanceM:distance,topZ:top,clearanceZ:top+clearanceM,requiredZ,...blockerAt(profile,i,corridor)};}
  }
  const sampledReach=(profile.surfaceZ?.length||0)*step;
  const corridorComplete=missing===0&&sampledReach>=profile.shoreDistanceM&&profile.shoreDistanceM>0&&profile.waterSegmentVerified===true&&Number.isFinite(observer.groundZ)&&Number.isFinite(minimum);
  const horizonAtThreshold=Math.sqrt(2*radius*Math.max(0,minimum-seaZ));
  const nextLand=Number.isFinite(profile.nextLandDistanceM)?profile.nextLandDistanceM:Infinity;
  const horizonCovered=mode!=='horizon'||nextLand>horizonAtThreshold;
  const coverageComplete=corridorComplete&&horizonCovered;
  const horizonDistanceM=eyeZ>=seaZ?Math.sqrt(2*radius*(eyeZ-seaZ)):0;
  const currentHorizonCovered=mode!=='horizon'||nextLand>horizonDistanceM;
  const currentViewComplete=coverageComplete&&currentHorizonCovered;
  const knownRequiredHeight=Math.max(0,minimum-observer.groundZ);
  const clearsKnown=eyeZ>=minimum-1e-8;
  const status=currentViewComplete?(clearsKnown?'clear':'blocked'):'incomplete';
  return {observer,profile,mode,clearanceM,heightAboveGround,eyeZ,seaZ,radius,targetDistance,
    requiredAbsoluteZ:coverageComplete?minimum:null,
    requiredHeightM:coverageComplete?knownRequiredHeight:null,
    roundedRequiredHeightM:coverageComplete?roundHeight(knownRequiredHeight):null,
    knownLowerBoundM:knownRequiredHeight,control,coverageComplete,missingCount:missing,
    clearsKnown,visible:currentViewComplete&&clearsKnown,status,minMargin,horizonCovered,currentViewComplete,currentHorizonCovered,
    horizonDistanceM,nextLandDistanceM:nextLand,
    bearingTrue:((profile.bearingGrid+finite(corridor.coordinates?.gridConvergenceDegrees))%360+360)%360};
}

export function evaluateSeaView(corridor,options={}){
  if(!corridor?.observers?.length)return null;
  const observer=corridor.observers.find(o=>o.id===options.observerId)||corridor.observers[0];
  const evaluated=observer.profiles.map(p=>evaluateSeaProfile(corridor,observer,p,options));
  const best=evaluated.filter(r=>r.coverageComplete).sort((a,b)=>a.requiredHeightM-b.requiredHeightM||a.profile.bearingGrid-b.profile.bearingGrid)[0]||null;
  const selected=options.profileId==='best'||!options.profileId?best||evaluated[0]:evaluated.find(r=>r.profile.id===options.profileId)||best||evaluated[0];
  return {...selected,best,evaluated,completeBearingCount:evaluated.filter(r=>r.coverageComplete).length,totalBearingCount:evaluated.length};
}

export function seaCameraPose(result){
  if(!result?.observer||!result?.profile)return null;
  const [x,y]=result.observer.xy,[dx,dy]=result.profile.directionXY;
  const distance=120;
  const z=seaRayHeight(result.eyeZ,distance,{mode:result.mode,targetDistance:result.targetDistance,seaZ:result.seaZ,radius:result.radius});
  return {eye:[x,y,result.eyeZ],target:[x+dx*distance,y+dy*distance,Number.isFinite(z)?z:result.seaZ],
    source:'sea-neighbourhood-preview',note:'Neighbourhood camera only; use the complete measured profile for sea visibility.',
    heightAboveGround:result.heightAboveGround,bearingTrue:result.bearingTrue};
}

/** Compact, reproducible export. Never serialize result.observer/evaluated:
 * they intentionally reference the retained source profiles for rendering. */
export function seaViewSummary(corridor,result,state={}){
  if(!result)return null;
  const r=result;
  return {schemaVersion:1,siteId:corridor.siteId,surfaceDate:corridor.surfaceDate,
    horizontalCRS:corridor.horizontalCRS,verticalDatum:corridor.verticalDatum,
    settings:{...state},
    observer:{id:r.observer.id,label:r.observer.label,xy:[...r.observer.xy],originalGroundZ:r.observer.groundZ},
    target:{mode:r.mode,bearingTrueDegrees:r.bearingTrue,shoreDistanceM:r.profile.shoreDistanceM,
      waterDistanceM:r.mode==='water'?r.targetDistance:null,horizonDistanceM:r.mode==='horizon'?r.horizonDistanceM:null,
      nextLandDistanceM:Number.isFinite(r.nextLandDistanceM)?r.nextLandDistanceM:null},
    current:{eyeHeightAboveOriginalGroundM:r.heightAboveGround,eyeAbsoluteZ:r.eyeZ,status:r.status,
      visible:r.visible,viewCoverageComplete:r.currentViewComplete},
    threshold:{eyeHeightAboveOriginalGroundM:r.requiredHeightM,eyeAbsoluteZ:r.requiredAbsoluteZ,
      knownLowerBoundM:r.knownLowerBoundM,clearanceM:r.clearanceM,coverageComplete:r.coverageComplete},
    controllingObstruction:r.control?{...r.control}:null,
    bestTested:r.best?{bearingTrueDegrees:r.best.bearingTrue,eyeHeightAboveOriginalGroundM:r.best.requiredHeightM}:null,
    testedDirections:{complete:r.completeBearingCount??null,total:r.totalBearingCount??null},
    assumptions:{seaLevelZ:r.seaZ,earthRadiusM:r.radius,refractionCoefficient:0,sourceResolutionM:corridor.model?.sourceResolutionM,
      aggregation:corridor.model?.aggregation,designChanges:corridor.model?.designChanges},
    sources:(corridor.sources||[]).map(s=>({id:s.id,label:s.label,url:s.url,sha256:s.sha256})),
    limitations:[...(corridor.limitations||[])]};
}
