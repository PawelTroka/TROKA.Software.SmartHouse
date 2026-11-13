/** Dense wall-only check, separate from the mapped roof/facade sample metric. */
import {analyzeVisibility} from './geometry.js?v=1.13.0';
import {applyBuildingOverrides} from './buildings.js?v=1.13.0';

const DEFAULT_SPACING=.25,MIN_SPACING=.25,MAX_SPACING=2,MAX_POINTS=200000;
const normalizedSpacing=value=>typeof value==='number'&&Number.isFinite(value)&&value>0
  ?Math.min(MAX_SPACING,Math.max(MIN_SPACING,value)):DEFAULT_SPACING;
const method=spacing=>`Dense facade grid at ${spacing.toFixed(2)} m vertical spacing and at most ${spacing.toFixed(2)} m horizontally, from building base to modeled wall top. Back-facing and self-hidden wall points are excluded. Uses the same hedge, terrain-based planting, crown, canopy, sauna and mapped-building intersections as the main view. Roof points remain a separate check. Sample counts are not visible area or a guarantee of continuous real foliage.`;

/**
 * Sample mid-cells along every finite wall edge. The vertical origin matches
 * the independent facade audit: base + spacing/2, then fixed spacing to roofZ.
 * This catches gaps between the source dataset's sparse facade rows/columns.
 */
function facadeGrid(block,spacing){
  const ring=block.footprint,points=[];
  const closed=Math.hypot(ring[0][0]-ring.at(-1)[0],ring[0][1]-ring.at(-1)[1])<1e-8;
  for(let i=0;i<ring.length-(closed?1:0);i++){
    const a=ring[i],b=ring[(i+1)%ring.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const columns=Math.ceil(length/spacing);
    for(let j=0;j<columns;j++){
      const t=(j+.5)/columns;
      for(let z=block.baseZ+spacing/2;z<block.roofZ;z+=spacing){
        if(points.length>=MAX_POINTS)return null;
        points.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,z]);
      }
    }
  }
  return points;
}

/**
 * A supplemental facade-only result for one target and one observer. Source
 * geometry and the original analysis are not changed. Other target buildings
 * remain contextual blockers, rather than becoming extra measured targets.
 */
export function analyzeFacadeVisibility(observer,targetId,settings={},data,{spacing=DEFAULT_SPACING}={}){
  spacing=normalizedSpacing(spacing);
  data=applyBuildingOverrides(data,settings);
  const target=data.buildings.find(block=>block.id===targetId);
  const unavailable=reason=>({status:'unavailable',reason,targetId,label:target?.label||targetId,
    observer,spacing,total:0,visible:0,blocked:0,blockedPercent:null,generatedSamples:0,rays:[],byBlock:[],reasons:{},method:method(spacing)});
  if(!target||!Array.isArray(target.footprint)||target.footprint.length<3
    ||!Number.isFinite(target.baseZ)||!Number.isFinite(target.roofZ)||target.roofZ<=target.baseZ
    ||target.footprint.some(p=>!Array.isArray(p)||!Number.isFinite(p[0])||!Number.isFinite(p[1])))return unavailable('Target wall geometry is unavailable.');
  const samples=facadeGrid(target,spacing);
  if(!samples)return unavailable('The requested facade grid exceeds the bounded sample count.');
  const denseData={...data,buildings:data.buildings.map(block=>block.id===targetId
    ?{...block,kind:'target',samples,roofSampleCount:0,highFeatures:[]}
    :block.kind==='target'?{...block,kind:'context'}:block)};
  const result=analyzeVisibility(observer,{...settings,includeHighFeatures:false},denseData);
  return {...result,status:result.total?'ok':'unavailable',...(result.total?{}:{reason:'No facade samples face this observer.'}),
    targetId,label:target.label||targetId,spacing,generatedSamples:samples.length,
    blockedPercent:result.total?result.blockedPercent:null,method:method(spacing)};
}
