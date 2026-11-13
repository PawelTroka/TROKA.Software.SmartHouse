/**
 * Reproducible left/east pine-alignment study for the compact Sternicza spa.
 * Run: node scripts/search-left-edge-pck3-layouts.mjs [output.json]
 * Dense crown target-ray samples are not facade-area or real-foliage guarantees.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=process.argv[2]||resolve(ROOT,'docs/left-edge-screening-comparison.json');
const {analyzeVisibility,observerForPreset,pointInPolygon,terraceGroundReference,jacuzziBounds}=await import(`${ROOT}/src/geometry.js`);
const {createScreeningTree,screeningTreeVolumes,treeRayIntersection}=await import(`${ROOT}/src/screening-trees.js`);
const {getTreeType}=await import(`${ROOT}/src/tree-catalog.js`);
const {terraceStairs,rectCorners}=await import(`${ROOT}/src/layout.js`);
const {gardenProgram}=await import(`${ROOT}/src/garden-program.js`);
const {analyzeSunlight}=await import(`${ROOT}/src/shade.js`);
const {sunForSettings}=await import(`${ROOT}/src/solar.js`);
const data=JSON.parse(fs.readFileSync(`${ROOT}/data/site-data.json`));
// Explicit geometry settings keep this comparison independent of later defaults.
const settings={siteId:'sternicza-11',gardenProgram:'spa-compact',screeningTrees:[],
 hedgeRear:4,hedgeLeft:4,hedgeRight:4,hedgeInset:.5,gardenRaise:.5,bedRaise:0,raiseNewHedges:true,
 terraceDepth:4.2,floorHeight:1.2,removeGarage:true,canopyEnabled:false,includeHighFeatures:false,jacuzziOverflow:false,
 treeLeafMode:'auto',sunDate:'2026-06-21',sunMinutes:720,sunEnabled:true};
const program=gardenProgram(settings,data);
if(program.id!=='spa-compact')throw new Error('This study requires the compact spa geometry.');
const round=n=>Math.round(n*100)/100;
const primary=['sofa','standing','terrace','jacuzzi','garden','sauna','firepit'];
const observers=primary.map(p=>({id:p,weight:['sofa','standing','terrace','jacuzzi'].includes(p)?3:p==='garden'?2:1,
 ...observerForPreset(p,{...settings,eyeHeight:undefined},data)}));
for(const [id,x,y,eye] of [
 ['terrace-left-seated',12.8,20.4,1.2],['terrace-left-standing',12.8,21.3,1.65],['terrace-right-standing',8,21.3,1.65],
 ['loungers-seated',12.7,23.7,1],['dining-seated',5.4,25.5,1.2],['right-garden-path',6.6,30,1.65],
 ['pool-west-path',14.1,29,1.65],['pool-rear-path',17.8,33.5,1.65],
 ['rear-centre-path',10.6,36,1.65],['cold-plunge-seated',7.7,36.2,1.1],
])observers.push({id,weight:1,...observerForPreset('custom',{...settings,observerX:x,observerY:y,eyeHeight:eye},data)});
const views=observers.map(observer=>{
 const rays=analyzeVisibility(observer,settings,data).rays.filter(r=>r.blockId==='building-9');
 const visible=rays.filter(r=>r.visible);
 return {...observer,rays:visible,total:rays.length,blocked:rays.length-visible.length,words:Math.ceil(visible.length/32)};
});
const distSeg=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],n=dx*dx+dy*dy,t=n?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/n)):0;return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dy*t);};
const edgeDistance=(p,ring)=>Math.min(...ring.map((a,i)=>distSeg(p,a,ring[(i+1)%ring.length])));
const terrace={...data.site.terrace,depth:settings.terraceDepth};
const stairs=terraceStairs(terrace,settings.terraceDepth,terraceGroundReference(settings,data).drop,settings,data);
const hardscape=[data.site.house.footprint,rectCorners(terrace),rectCorners(program.pool,program.pool.coping),rectCorners(stairs),
 program.sauna.footprint,...(program.sauna.entrySteps||[]).map(step=>step.footprint),program.firepit.outerFootprint||program.firepit.footprint,
 rectCorners(program.coldPlunge,program.coldPlunge.pad??.18),...program.coldPlunge.steps.map(step=>rectCorners(step))];
const furniture=[rectCorners(program.furniture.dining),...program.furniture.loungers.map(([x,y])=>rectCorners({x,y,width:.78,length:2}))];
const pathRings=program.furniture.path.map(([x,y])=>rectCorners({x,y,width:1.15,length:.9}));
const allGround=[...hardscape,...furniture,...pathRings];
const insideCrown=(v,o)=>(o.x-v.x)**2/v.crownRadii[0]**2+(o.y-v.y)**2/v.crownRadii[1]**2+(o.z-v.crownCenter[2])**2/v.crownRadii[2]**2<1;
const region={minX:13.5,maxX:19.3,minY:29,maxY:37.1};
function placement(v){
 const p=[v.x,v.y],boundaryCentreDistance=edgeDistance(p,data.site.boundary);
 const minimumHardscapeCentreDistance=Math.min(...allGround.map(r=>pointInPolygon(p,r)?0:edgeDistance(p,r)));
 const observerClear=observers.every(o=>Math.hypot(v.x-o.x,v.y-o.y)>=1&&!insideCrown(v,o));
 const allowanceAccepted=v.plantable&&boundaryCentreDistance>=1&&minimumHardscapeCentreDistance>=1&&observerClear;
 return {plantable:v.plantable,crownInside:v.crownInside,boundaryCentreDistance,minimumHardscapeCentreDistance,
   observerClear,allowanceAccepted,searchAccepted:allowanceAccepted&&v.x>=region.minX&&v.x<=region.maxX&&v.y>=region.minY&&v.y<=region.maxY,
   nominalCrownOverhang:Math.max(0,v.crownWidth/2-boundaryCentreDistance),warnings:v.warnings};
}
const maskFor=(v,insideOnly=false)=>views.map(view=>{
 const mask=new Uint32Array(view.words);
 view.rays.forEach((ray,i)=>{const hit=treeRayIntersection(ray.origin,ray.target,v);if(hit&&(!insideOnly||pointInPolygon([hit.x,hit.y],data.site.boundary)))mask[i>>>5]|=1<<(i&31);});return mask;
});
const pop=v=>{v=v-((v>>>1)&0x55555555);v=(v&0x33333333)+((v>>>2)&0x33333333);return (((v+(v>>>4))&0x0f0f0f0f)*0x01010101)>>>24;};
const emptyMasks=()=>views.map(v=>new Uint32Array(v.words));
const union=(a,b)=>a.map((m,j)=>Uint32Array.from(m,(value,k)=>value|b[j][k]));
function evaluateMask(mask){
 let weighted=0,weight=0;
 const hidden=mask.map((m,j)=>{let count=views[j].blocked;for(const bits of m)count+=pop(bits);weighted+=views[j].weight*count/views[j].total;weight+=views[j].weight;return count;});
 const requested=[0,1,3,4].map(i=>hidden[i]/views[i].total);
 const score=.6*requested.reduce((s,v)=>s+v,0)/requested.length+.3*Math.min(...requested)+.1*weighted/weight;
 return {score,hidden,weightedCoverage:weighted/weight};
}
function stateFor(trees){
 const group=trees.map(tree=>({tree,masks:maskFor(screeningTreeVolumes({...settings,screeningTrees:[tree]},data)[0])}));
 const masks=group.reduce((m,c)=>union(m,c.masks),emptyMasks());return {group,masks,...evaluateMask(masks)};
}
const compatible=(a,b)=>{const d=Math.hypot(a.tree.x-b.tree.x,a.tree.y-b.tree.y);return d>=3&&d<=7;};
const sort=(a,b)=>b.score-a.score;
const candidates=[];
for(let y=region.minY;y<=region.maxY;y+=.25)for(let x=region.minX;x<=region.maxX;x+=.25){
 const tree=createScreeningTree('austrian-pine-tall',{id:`candidate-${round(x)}-${round(y)}`,x,y}),v=screeningTreeVolumes({...settings,screeningTrees:[tree]},data)[0];
 if(!placement(v).searchAccepted)continue;
 const masks=maskFor(v);candidates.push({tree,masks,...evaluateMask(masks)});
}
function search(){
 let states=[stateFor([])];
 for(let count=0;count<3;count++){
  const next=[],seen=new Set();
  for(const state of states)for(const c of candidates){
   if(state.group.some(other=>!compatible(other,c)))continue;
   const group=[...state.group,c],key=group.map(c=>c.tree.id).sort().join('|');if(seen.has(key))continue;seen.add(key);
   const masks=union(state.masks,c.masks);next.push({group,masks,...evaluateMask(masks)});
  }
  states=next.sort(sort).slice(0,64);
 }
 let best=states[0];
 for(let pass=0;pass<3;pass++)for(let index=0;index<3;index++){
  const remainder=best.group.filter((_,i)=>i!==index),mask=remainder.reduce((m,c)=>union(m,c.masks),emptyMasks());
  for(const c of candidates){
   if(remainder.some(other=>!compatible(other,c)))continue;
   const group=best.group.slice();group[index]=c;const masks=union(mask,c.masks),next={group,masks,...evaluateMask(masks)};
   if(sort(next,best)<-1e-12)best=next;
  }
 }
 for(let pass=0;pass<2;pass++)for(let index=0;index<3;index++){
  const centre=best.group[index],remainder=best.group.filter((_,i)=>i!==index),mask=remainder.reduce((m,c)=>union(m,c.masks),emptyMasks());
  for(let dy=-.4;dy<=.4001;dy+=.1)for(let dx=-.4;dx<=.4001;dx+=.1){
   const tree={...centre.tree,x:round(centre.tree.x+dx),y:round(centre.tree.y+dy)},v=screeningTreeVolumes({...settings,screeningTrees:[tree]},data)[0];
   if(!placement(v).searchAccepted)continue;
   const c={tree};if(remainder.some(other=>!compatible(other,c)))continue;c.masks=maskFor(v);
   const group=best.group.slice();group[index]=c;const masks=union(mask,c.masks),next={group,masks,...evaluateMask(masks)};
   if(sort(next,best)<-1e-12)best=next;
  }
 }
 return best;
}
const tallRows=rows=>rows.map(([x,y],i)=>createScreeningTree('austrian-pine-tall',{id:`pine-${i+1}`,x,y}));
const layouts=[];
function summarize(name,trees,{sunlight=false}={}){
 const state=stateFor(trees),volumes=screeningTreeVolumes({...settings,screeningTrees:trees},data);
 const insideMask=volumes.reduce((m,v)=>union(m,maskFor(v,true)),emptyMasks()),inside=evaluateMask(insideMask);
 const bounds=trees.length?{width:Math.max(...trees.map(t=>t.x))-Math.min(...trees.map(t=>t.x)),depth:Math.max(...trees.map(t=>t.y))-Math.min(...trees.map(t=>t.y))}:null;
 const result={name,plantPLN:trees.reduce((s,t)=>s+getTreeType(t.typeId).pricePLN,0),trees,
   trunkBounds:bounds,crownEnvelope:bounds?{width:bounds.width+5,depth:bounds.depth+5}:null,
   pairDistances:trees.flatMap((t,i)=>trees.slice(i+1).map(o=>({first:t.id,second:o.id,metres:Math.hypot(t.x-o.x,t.y-o.y)}))),
   score:state.score,weightedCoverage:state.weightedCoverage,
   views:views.map((v,i)=>({id:v.id,visible:v.total-state.hidden[i],total:v.total,blocked:state.hidden[i],coverage:state.hidden[i]/v.total,
     visibleWithoutOutsideEntryCredit:v.total-inside.hidden[i]})),
   placement:volumes.map(v=>({id:v.id,...placement(v)})),
   livingAngularChecks:views.slice(0,2).map(view=>({id:view.id,
    maximumUnscreenedTargetElevation:Math.max(...view.rays.map(ray=>Math.atan2(ray.target[2]-view.z,Math.hypot(ray.target[0]-view.x,ray.target[1]-view.y))*180/Math.PI)),
    maximumCrownElevations:volumes.map(v=>{const D=Math.hypot(v.x-view.x,v.y-view.y),Z=v.crownCenter[2]-view.z,a=v.crownRadii[0],b=v.crownRadii[2];
      const tangentSlope=(D*Z+Math.sqrt(D*D*b*b+Z*Z*a*a-a*a*b*b))/(D*D-a*a);
      return {id:v.id,degrees:Math.atan(tangentSlope)*180/Math.PI};})}))};
 for(let i=0;i<observers.length;i++){
   const exact=analyzeVisibility(observers[i],{...settings,screeningTrees:trees},data).byBlock.find(b=>b.id==='building-9');
   if(exact.visible!==result.views[i].visible||exact.total!==result.views[i].total)throw new Error(`Mask/engine discrepancy: ${name}/${observers[i].id}`);
 }
 if(sunlight){result.sunlight=[];for(const [date,minutes] of [['2026-03-21',720],['2026-06-21',540],['2026-06-21',720],['2026-06-21',900],['2026-09-21',720]]){
  const solarSettings={...settings,screeningTrees:trees,sunDate:date,sunMinutes:minutes};
  const sun=analyzeSunlight(solarSettings,data,sunForSettings(solarSettings,data));
  result.sunlight.push({date,minutes,timeZone:'Europe/Warsaw',zones:Object.fromEntries(Object.entries(sun.zones).map(([k,v])=>[k,{sunlit:v.sunlit,total:v.total,percent:round(v.percent)}]))});
 }}
 layouts.push(result);console.log(name,trees.map(t=>[t.x,t.y]),result.views.slice(0,7).map(v=>`${v.id}:${v.visible}/${v.total}`).join(' '));return result;
}
summarize('Hedges and compact spa only',[],{sunlight:true});
summarize('Contained corner comparison',tallRows([[13.1,34.45],[14.35,31],[17.6,34.5]]),{sunlight:true});
summarize('Selected left-edge grove',tallRows([[13.3,34.5],[14.35,31],[18.1,34.5]]),{sunlight:true});
summarize('Wider left-edge comparison',tallRows([[13.5,35],[14.4,30],[19.3,33.8]]),{sunlight:true});
summarize('All three farther east in rear corner',tallRows([[15.2,34],[18.7,34.2],[17,36.5]]),{sunlight:true});
summarize('Balanced views comparison',tallRows([[17.6,34.9],[12.9,34.3],[14.4,25.7]]));
summarize('Living-room priority comparison',tallRows([[13.9,27.3],[12.5,33.4],[15.2,23.2]]));
const best=search();summarize('Bounded search result',best.group.map((c,i)=>({...c.tree,id:`pine-${i+1}`})));
const selected=layouts.find(l=>l.name==='Selected left-edge grove');
if(selected.placement.some(p=>!p.allowanceAccepted))throw new Error('Selected grove fails a documented planting/observer allowance.');
const diagnosticCandidates=[...candidates];
for(const l of layouts.filter(l=>['Selected left-edge grove','Wider left-edge comparison','Bounded search result'].includes(l.name)))for(const tree of l.trees){
 if(!diagnosticCandidates.some(c=>c.tree.x===tree.x&&c.tree.y===tree.y))diagnosticCandidates.push({tree,masks:maskFor(screeningTreeVolumes({...settings,screeningTrees:[tree]},data)[0])});
}
const optimistic=evaluateMask(diagnosticCandidates.reduce((m,c)=>union(m,c.masks),emptyMasks()));
const pool=program.pool,east=data.site.boundary.slice(1,4);
const poolEastX=pool.x+pool.width+pool.coping;
const narrowStripAtMidpoint=Math.min(...east.slice(0,-1).map((a,i)=>distSeg([poolEastX,pool.y+pool.length/2],a,east[i+1])));
const result={observedAt:'2026-11-13',target:{id:'building-9',label:'PCK3'},settings,
 geometry:{pool,jacuzzi:jacuzziBounds(settings,data),sauna:{x:program.sauna.x,y:program.sauna.y,width:program.sauna.width,length:program.sauna.length,height:program.sauna.height},
   poolEastCopingToBoundary:narrowStripAtMidpoint},
 observers:observers.map(({id,x,y,z,eyeHeight,surface,weight})=>({id,x,y,z,eyeHeight,surface,weight})),
 method:{region,grid:.25,refinement:.1,beamWidth:64,coordinatePasses:3,minimumTreeSpacing:3,maxGroupDiameter:7,
   candidateCount:candidates.length,rootSpaceAllowance:'At least 1 m from trunk centre to parcel boundary and modeled ground obstacles, furniture and stepping stones; illustrative allowance, not an actual nursery root-ball measurement.',
   crownRule:'Full 5 m nominal crowns may cross the parcel edge. Their complete volumes receive screening/shade credit; the selected outer crown overhang is explicitly disclosed.',
   objective:'0.6 mean + 0.3 minimum among seated living room, standing living room, jacuzzi and garden, plus 0.1 weighted coverage of 17 views.',
   outsideCreditSensitivity:'Also count only intersections whose first tree entry lies inside the parcel. This diagnoses dependence on outside crown volume; it is not a pruning specification.',
   selectedRounding:'The compact default is an intentional mild adjustment of the published grove: outer pine +0.50 m east, rear inner pine +0.20 m east/+0.05 m rear, middle pine unchanged. Connected overlapping crowns and rear grouping take priority over the search visibility score. The wider search-derived arrangement remains a separately named comparison. Every reported ray is recomputed.',
   verification:'Every reported visibility count checked against the complete analyzeVisibility engine.',
   caveat:'Bounded comparison of dense ideal crown shapes. No claim of a global optimum or complete real-world screening.'},
 optimisticUnion:{candidateCount:diagnosticCandidates.length,description:'Union of all accepted grid/refined crowns ignoring spacing and tree count. A sampled-region diagnostic, not a feasible design or continuous upper bound.',
   views:views.map((v,i)=>({id:v.id,visible:v.total-optimistic.hidden[i],total:v.total}))},layouts};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log('Saved',output);
