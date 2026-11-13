/**
 * Bounded, reproducible placement study for the rear-left corner cluster in the Sternicza spa.
 * Existing v1.6 study is intentionally retained in search-pck3-layouts.mjs.
 * Run: node scripts/search-corner-pck3-layouts.mjs [output.json]
 * The ray fractions below are samples of an opaque geometric crown model,
 * not facade-area percentages or a foliage/whole-garden privacy guarantee.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=process.argv[2]||resolve(ROOT,'docs/corner-screening-comparison.json');
const {DEFAULTS}=await import(`${ROOT}/src/state.js`);
const {analyzeVisibility,observerForPreset,pointInPolygon,terraceGroundReference}=await import(`${ROOT}/src/geometry.js`);
const {createScreeningTree,screeningTreeVolumes,treeRayIntersection}=await import(`${ROOT}/src/screening-trees.js`);
const {getTreeType}=await import(`${ROOT}/src/tree-catalog.js`);
const {getScreeningLayouts}=await import(`${ROOT}/src/screening-layouts.js`);
const {terraceStairs,rectCorners}=await import(`${ROOT}/src/layout.js`);
const {gardenProgram}=await import(`${ROOT}/src/garden-program.js`);
const {analyzeSunlight}=await import(`${ROOT}/src/shade.js`);
const {sunForSettings}=await import(`${ROOT}/src/solar.js`);
const data=JSON.parse(fs.readFileSync(`${ROOT}/data/site-data.json`));
const settings={...DEFAULTS,gardenProgram:'spa-edge',screeningTrees:[],hedgeRear:4,hedgeLeft:4,hedgeRight:4,hedgeInset:.5,gardenRaise:.5,bedRaise:0,raiseNewHedges:true,terraceDepth:4.2,floorHeight:1.2,removeGarage:true,canopyEnabled:false,includeHighFeatures:false};
const program=gardenProgram(settings,data);
if(program.id!=='spa-edge')throw new Error('This study needs the explicit spa-edge garden program.');
const round=n=>Math.round(n*100)/100;
const primary=['sofa','standing','terrace','jacuzzi','garden','sauna','firepit'];
const observers=primary.map(p=>({id:p,weight:['sofa','standing','terrace','jacuzzi'].includes(p)?3:p==='garden'?2:1,...observerForPreset(p,{...settings,eyeHeight:undefined},data)}));
for(const [id,x,y,eye] of [
  ['terrace-left-seated',12.8,20.4,1.2],['terrace-left-standing',12.8,21.3,1.65],['terrace-right-standing',8,21.3,1.65],
  ['loungers-seated',12.7,23.7,1],['dining-seated',5.4,25.5,1.2],['right-garden-path',6.6,30,1.65],
  ['pool-west-path',14.1,29,1.65],['pool-rear-path',17.8,33.5,1.65],
  ['rear-centre-path',10.6,36,1.65],['cold-plunge-seated',7.7,36.2,1.1],
])observers.push({id,weight:1,...observerForPreset('custom',{...settings,observerX:x,observerY:y,eyeHeight:eye},data)});
const views=observers.map(observer=>{
 const rays=analyzeVisibility(observer,settings,data).rays.filter(r=>r.blockId==='building-9');
 return {...observer,rays:rays.filter(r=>r.visible),total:rays.length,blocked:rays.filter(r=>!r.visible).length,words:Math.ceil(rays.filter(r=>r.visible).length/32)};
});
console.log('Baseline',views.map(v=>`${v.id}: ${v.rays.length}/${v.total}`).join('; '));
const distSeg=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],n=dx*dx+dy*dy,t=n?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/n)):0;return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dy*t);};
const edgeDistance=(p,ring)=>Math.min(...ring.map((a,i)=>distSeg(p,a,ring[(i+1)%ring.length])));
const terrace={...data.site.terrace,depth:settings.terraceDepth};
const stairs=terraceStairs(terrace,settings.terraceDepth,terraceGroundReference(settings,data).drop,settings,data);
const hardscape=[data.site.house.footprint,rectCorners(terrace),rectCorners(program.pool,program.pool.coping),rectCorners(stairs),program.sauna.footprint,...(program.sauna.entrySteps||[]).map(step=>step.footprint),program.firepit.outerFootprint||program.firepit.footprint,rectCorners(program.coldPlunge,program.coldPlunge.pad??.18),...program.coldPlunge.steps.map(step=>rectCorners(step))];
const furniture=[rectCorners(program.furniture.dining),...program.furniture.loungers.map(([x,y])=>rectCorners({x,y,width:.78,length:2}))];
const pathRings=program.furniture.path.map(([x,y])=>rectCorners({x,y,width:1.15,length:.9}));
const allGround=[...hardscape,...furniture,...pathRings];
function foliageContainsObserver(v,o){
 const z=(o.z-v.crownCenter[2])/v.crownRadii[2];
 if(Math.abs(z)>=1)return false;
 return (o.x-v.x)**2/v.crownRadii[0]**2+(o.y-v.y)**2/v.crownRadii[1]**2+z*z<1;
}
// A 1 m radius around the trunk is a design allowance for planting/root-ball
// access. It is not a claim about a supplier's root-ball specification.
function acceptable(v,strict=false){
 if(v.x<11.5||v.x>18.5||v.y<31||v.y>36)return false;
 if(!v.plantable||!v.crownInside)return false;
 const p=[v.x,v.y],r=v.crownWidth/2;
 if(edgeDistance(p,data.site.boundary)<r+.15)return false;
 if(allGround.some(ring=>pointInPolygon(p,ring)||edgeDistance(p,ring)<1))return false;
 if(observers.some(o=>Math.hypot(v.x-o.x,v.y-o.y)<1||foliageContainsObserver(v,o)))return false;
 if(strict&&hardscape.some(ring=>edgeDistance(p,ring)<r+.15))return false;
 return true;
}
function maskFor(v){return views.map(view=>{
 const mask=new Uint32Array(view.words);
 view.rays.forEach((ray,i)=>{if(treeRayIntersection(ray.origin,ray.target,v))mask[i>>>5]|=1<<(i&31);});return mask;
});}
const pop=v=>{v=v-((v>>>1)&0x55555555);v=(v&0x33333333)+((v>>>2)&0x33333333);return (((v+(v>>>4))&0x0f0f0f0f)*0x01010101)>>>24;};
const emptyMasks=()=>views.map(v=>new Uint32Array(v.words));
function evaluateMask(mask){
 let score=0,totalWeight=0,minPrimary=1,primarySum=0,stressSum=0,minStress=1,criticalMinimum=1,criticalSum=0;
 const hidden=mask.map((m,j)=>{let count=views[j].blocked;for(const bits of m)count+=pop(bits);const fraction=count/views[j].total;score+=views[j].weight*fraction;totalWeight+=views[j].weight;if(j<4){criticalMinimum=Math.min(criticalMinimum,fraction);criticalSum+=fraction;}if(j<primary.length){minPrimary=Math.min(minPrimary,fraction);primarySum+=fraction;}else {stressSum+=fraction;minStress=Math.min(minStress,fraction);}return count;});
 return {score:score/totalWeight,minPrimary,primaryMean:primarySum/primary.length,stressMean:stressSum/(views.length-primary.length),minStress,criticalMinimum,criticalMean:criticalSum/4,hidden};
}
const union=(a,b)=>a.map((m,j)=>Uint32Array.from(m,(value,k)=>value|b[j][k]));
let minimumSpacing=3;
const compatible=(a,b)=>{const d=Math.hypot(a.tree.x-b.tree.x,a.tree.y-b.tree.y);return d>=minimumSpacing&&d<=6;};
const candidateByType={},typeIds=['austrian-pine-tall'];
for(const typeId of typeIds){
 const candidates=[],begin=performance.now();let index=0;
 for(let y=31;y<=36;y+=.25)for(let x=11.5;x<=18.5;x+=.25){
  const tree=createScreeningTree(typeId,{id:`candidate-${typeId}-${index++}`,x,y}),v=screeningTreeVolumes({...settings,screeningTrees:[tree]},data)[0];
  if(!acceptable(v))continue;
  const masks=maskFor(v);candidates.push({tree,masks,strict:acceptable(v,true),...evaluateMask(masks)});
 }
 candidateByType[typeId]=candidates;console.log('Candidates',typeId,candidates.length,'strict',candidates.filter(c=>c.strict).length,'ms',round(performance.now()-begin));
}
const weightedSort=(a,b)=>b.score-a.score||b.minPrimary-a.minPrimary;
const balancedSort=(a,b)=>(b.score+b.minPrimary*.15+b.minStress*.05)-(a.score+a.minPrimary*.15+a.minStress*.05);
const livingPrioritySort=(a,b)=>(b.criticalMean*.7+b.criticalMinimum*.2+b.score*.1)-(a.criticalMean*.7+a.criticalMinimum*.2+a.score*.1);
function stateFor(trees){
 const group=trees.map(tree=>({tree,masks:maskFor(screeningTreeVolumes({...settings,screeningTrees:[tree]},data)[0])}));
 const masks=group.reduce((mask,c)=>union(mask,c.masks),emptyMasks());return {group,masks,...evaluateMask(masks)};
}
function beam(types,{sort=balancedSort,strict=false,width=64}={}){
 let states=[stateFor([])];
 for(const type of types){
  const next=[],seen=new Set();
  for(const state of states)for(const c of candidateByType[type]){
   if(strict&&!c.strict||state.group.some(other=>!compatible(other,c)))continue;
   const group=[...state.group,c],key=group.map(c=>c.tree.id).sort().join('|');if(seen.has(key))continue;seen.add(key);
   const masks=union(state.masks,c.masks);next.push({group,masks,...evaluateMask(masks)});
  }
  states=next.sort(sort).slice(0,width);if(!states.length)return null;
 }
 let best=states[0];
 for(let pass=0;pass<3;pass++){
  let improved=false;
  for(let index=0;index<types.length;index++){
   const remainder=best.group.filter((_,i)=>i!==index),mask=remainder.reduce((m,c)=>union(m,c.masks),emptyMasks());
   for(const c of candidateByType[best.group[index].tree.typeId]){
    if(strict&&!c.strict||remainder.some(other=>!compatible(other,c)))continue;
    const group=best.group.slice();group[index]=c;const masks=union(mask,c.masks),next={group,masks,...evaluateMask(masks)};
    if(sort(next,best)<-1e-12){best=next;improved=true;}
   }
  }
  if(!improved)break;
 }
 for(let pass=0;pass<2;pass++)for(let index=0;index<best.group.length;index++){
  const centre=best.group[index],remainder=best.group.filter((_,i)=>i!==index),mask=remainder.reduce((m,c)=>union(m,c.masks),emptyMasks());
  for(let dy=-.4;dy<=.4001;dy+=.1)for(let dx=-.4;dx<=.4001;dx+=.1){
   const tree={...centre.tree,x:round(centre.tree.x+dx),y:round(centre.tree.y+dy)},v=screeningTreeVolumes({...settings,screeningTrees:[tree]},data)[0];if(!acceptable(v,strict))continue;
   const c={tree};if(remainder.some(other=>!compatible(other,c)))continue;c.masks=maskFor(v);
   const group=best.group.slice();group[index]=c;const masks=union(mask,c.masks),next={group,masks,...evaluateMask(masks)};
   if(sort(next,best)<-1e-12)best=next;
  }
 }
 return best;
}
const layouts=[];
function summarize(name,state){
 if(!state)return null;
 const trees=state.group.map((c,i)=>({...c.tree,id:`pine-${i+1}`}));
 const volumes=screeningTreeVolumes({...settings,screeningTrees:trees},data);
 const result={name,plantPLN:trees.reduce((s,t)=>s+getTreeType(t.typeId).pricePLN,0),trees,weightedCoverage:state.score,primaryMean:state.primaryMean,primaryMinimum:state.minPrimary,criticalMean:state.criticalMean,criticalMinimum:state.criticalMinimum,stressMean:state.stressMean,stressMinimum:state.minStress,
  views:views.map((view,i)=>({id:view.id,visible:view.total-state.hidden[i],total:view.total,blocked:state.hidden[i],coverage:state.hidden[i]/view.total})),
  placement:volumes.map(v=>({id:v.id,plantable:v.plantable,crownInside:v.crownInside,studyAccepted:acceptable(v),minimumHardscapeCentreDistance:Math.min(...allGround.map(r=>pointInPolygon([v.x,v.y],r)?0:edgeDistance([v.x,v.y],r))),warnings:v.warnings}))};
 layouts.push(result);
 console.log('Layout',name,'PLN',result.plantPLN,'weighted',round(state.score*100),'primary min',round(state.minPrimary*100),trees.map(t=>[t.typeId,t.x,t.y]),result.views.map(v=>`${v.id}:${v.visible}/${v.total}`).join(' '));
 return result;
}
// The existing default is captured by literal coordinates so this study does
// not change meaning when the application's default is updated later.
const tallRows=rows=>rows.map(([x,y],i)=>createScreeningTree('austrian-pine-tall',{id:`pine-${i+1}`,x,y}));
const previous=tallRows([[17.6,34.9],[12.9,34.3],[14.4,25.7]]);
const living=tallRows([[13.9,27.3],[12.5,33.4],[15.2,23.2]]);
const allCornerMask=candidateByType['austrian-pine-tall'].reduce((mask,c)=>union(mask,c.masks),emptyMasks());
const optimisticCorner=evaluateMask(allCornerMask);
console.log('UNLIMITED corner crown union',views.map((v,i)=>`${v.id}:${v.total-optimisticCorner.hidden[i]}/${v.total}`).join('; '));
const wanted=[0,1,3,4];
function cornerScore(state){const rates=wanted.map(i=>state.hidden[i]/views[i].total);return rates.reduce((a,b)=>a+b,0)/rates.length*.6+Math.min(...rates)*.3+state.score*.1;}
const cornerSort=(a,b)=>cornerScore(b)-cornerScore(a)||b.minPrimary-a.minPrimary;
summarize('Hedges and spa buildings only',stateFor([]));
summarize('Previous v1.8 balanced default',stateFor(previous));
summarize('Previous living-room priority',stateFor(living));
summarize('Literal compact rear-left triangle',stateFor(tallRows([[12.2,34],[14.9,35.5],[17.6,34]])));
let tripleCount=0;const cand=candidateByType['austrian-pine-tall'];for(let i=0;i<cand.length;i++)for(let j=i+1;j<cand.length;j++)if(compatible(cand[i],cand[j]))for(let k=j+1;k<cand.length;k++)if(compatible(cand[i],cand[k])&&compatible(cand[j],cand[k]))tripleCount++;console.log('Compatible 3 m triples',tripleCount);
const types=['austrian-pine-tall','austrian-pine-tall','austrian-pine-tall'];
summarize('Rear-left cluster with 3 m minimum trunk spacing',beam(types,{sort:cornerSort}));
minimumSpacing=2.5;
summarize('Rear-left cluster with 2.5 m minimum trunk spacing',beam(types,{sort:cornerSort}));
minimumSpacing=3;
for(const layout of layouts){
 for(let i=0;i<observers.length;i++){
  const exact=analyzeVisibility(observers[i],{...settings,screeningTrees:layout.trees},data).byBlock.find(b=>b.id==='building-9');
  if(exact.visible!==layout.views[i].visible||exact.total!==layout.views[i].total)throw new Error(`Mask/analyzer discrepancy: ${layout.name}, ${observers[i].id}`);
 }
 if(!layout.trees.length||['Previous v1.8 balanced default','Rear-left cluster with 3 m minimum trunk spacing','Literal compact rear-left triangle'].includes(layout.name)){
  layout.sunlight=[];
  for(const [date,minutes] of [['2026-03-21',720],['2026-06-21',540],['2026-06-21',720],['2026-06-21',900],['2026-09-21',720]]){
   const solarSettings={...settings,screeningTrees:layout.trees,sunDate:date,sunMinutes:minutes};
   const sun=analyzeSunlight(solarSettings,data,sunForSettings(solarSettings,data));
   layout.sunlight.push({date,minutes,timeZone:'Europe/Warsaw',zones:Object.fromEntries(Object.entries(sun.zones).map(([key,v])=>[key,{sunlit:v.sunlit,total:v.total,percent:round(v.percent)}]))});
  }
 }
}
const diagnosticCandidates=[...candidateByType['austrian-pine-tall']];
for(const layout of layouts.filter(l=>l.name.startsWith('Rear-left cluster')))for(const tree of layout.trees){
 const volume=screeningTreeVolumes({...settings,screeningTrees:[tree]},data)[0];
 if(acceptable(volume)&&!diagnosticCandidates.some(c=>c.tree.x===tree.x&&c.tree.y===tree.y))diagnosticCandidates.push({tree,masks:maskFor(volume)});
}
const diagnosticUnion=evaluateMask(diagnosticCandidates.reduce((mask,c)=>union(mask,c.masks),emptyMasks()));
const result={target:{id:'building-9',label:'PCK3'},settings,observers:observers.map(({id,x,y,z,eyeHeight,surface,weight})=>({id,x,y,z,eyeHeight,surface,weight})),
 method:{region:{minX:11.5,maxX:18.5,minY:31,maxY:36},grid:.25,refinement:.1,beamWidth:64,passes:3,maxGroupDiameter:6,minimumTreeSpacing:'3 m; separate 2.5 m dense sensitivity',boundaryAllowance:'Modeled crown plus 0.15 m stays inside parcel',rootSpaceAllowance:'1 m centre-to-hardscape, furniture and stepping stone clearance; conceptual, not actual root-ball dimensions',objective:'0.6 mean plus 0.3 minimum coverage among sofa, standing living-room, jacuzzi and garden, plus 0.1 earlier weighted 17-position score.',verification:'All reported counts independently checked against full analyzeVisibility.',caveat:'Dense ideal catalog-sized crown volumes. Not a global optimum, future growth forecast or guaranteed opaque foliage.'},
 optimisticCornerUnion:{candidateCount:diagnosticCandidates.length,description:'Union of every accepted 0.25 m grid crown plus all reported refined corner positions, ignoring mutual spacing and the three-tree limit. This is a sampled-region feasibility diagnostic, not a realizable planting or continuous upper bound.',views:views.map((v,i)=>({id:v.id,visible:v.total-diagnosticUnion.hidden[i],total:v.total}))},layouts};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log('Saved',output);
