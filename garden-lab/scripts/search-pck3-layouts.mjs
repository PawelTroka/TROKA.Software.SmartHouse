import fs from 'node:fs';
const ROOT=new URL('..',import.meta.url).pathname.replace(/\/$/,'');
const output=process.argv[2] || '/tmp/sternicza-screening-search.json';
const {DEFAULTS}=await import(`${ROOT}/src/state.js`);
const {analyzeVisibility,observerForPreset,gardenGroundAt,pointInPolygon,terraceGroundReference,jacuzziBounds}=await import(`${ROOT}/src/geometry.js`);
const {createScreeningTree,screeningTreeVolumes,treeRayIntersection}=await import(`${ROOT}/src/screening-trees.js`);
const {TREE_CATALOG,getTreeType}=await import(`${ROOT}/src/tree-catalog.js`);
const {terraceStairs,rectCorners}=await import(`${ROOT}/src/layout.js`);
const {analyzeSunlight}=await import(`${ROOT}/src/shade.js`);
const {sunForSettings}=await import(`${ROOT}/src/solar.js`);
const data=JSON.parse(fs.readFileSync(`${ROOT}/data/site-data.json`));
const settings={...DEFAULTS,screeningTrees:[],hedgeRear:4,hedgeLeft:4,hedgeRight:4,gardenRaise:.5,bedRaise:0,terraceDepth:4.2,floorHeight:1.2,removeGarage:true,canopyEnabled:false,includeHighFeatures:false};
const typeIds=['austrian-pine-medium','austrian-pine-large','austrian-pine-xl','austrian-pine-tall','serbian-spruce'];
const round=n=>Math.round(n*100)/100;
const primary=['sofa','standing','terrace','jacuzzi','garden'];
const observers=primary.map(p=>({id:p,weight:2,...observerForPreset(p,{...settings,eyeHeight:p==='sofa'?1.2:p==='jacuzzi'?.7:1.65},data)}));
for(const [id,x,y,eye] of [['terrace-left-seated',12.8,20.4,1.2],['terrace-left-standing',12.8,21.3,1.65],['terrace-right-standing',8,21.3,1.65],['garden-west-pool',3.2,27,1.65],['garden-west-rear',3.2,35.5,1.65],['garden-east-mid',15.5,28.5,1.65],['garden-east-rear',16.8,35,1.65],['garden-rear-centre',10.5,35.5,1.65]]){
  observers.push({id,weight:1,...observerForPreset('custom',{...settings,observerX:x,observerY:y,eyeHeight:eye},data)});
}
const views=observers.map(observer=>{
  const result=analyzeVisibility(observer,settings,data),rays=result.rays.filter(r=>r.blockId==='building-9');
  return {...observer,rays:rays.filter(r=>r.visible),total:rays.length,blocked:rays.filter(r=>!r.visible).length,words:Math.ceil(rays.filter(r=>r.visible).length/32)};
});
console.log('BASELINE',views.map(v=>({id:v.id,xy:[round(v.x),round(v.y)],visible:v.rays.length,total:v.total})));

const distSeg=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],n=dx*dx+dy*dy,t=n?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/n)):0;return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dy*t);};
const edgeDistance=(p,ring)=>Math.min(...ring.map((a,i)=>distSeg(p,a,ring[(i+1)%ring.length])));
const terrace={...data.site.terrace,depth:settings.terraceDepth};
const stairs=terraceStairs(terrace,settings.terraceDepth,terraceGroundReference(settings,data).drop);
const hardscape=[data.site.house.footprint,rectCorners(terrace),rectCorners(data.site.pool),rectCorners(stairs)];
function foliageContainsObserver(v,o){
  const z=(o.z-v.crownCenter[2])/v.crownRadii[2];
  if(Math.abs(z)>=1)return false;
  const radial=(o.x-v.x)**2/v.crownRadii[0]**2+(o.y-v.y)**2/v.crownRadii[1]**2;
  return v.form==='cone'?radial<((v.crownTopZ-o.z)/(v.crownTopZ-v.crownBottomZ))**2:radial+z*z<1;
}
function acceptable(v,strict=true){
  if(!v.plantable)return false;
  const furnishingRings=[rectCorners({x:14.1,y:24.5,width:3.8,length:4.6}),rectCorners({x:10.8,y:28,width:.78,length:2}),rectCorners({x:10.8,y:30.5,width:.78,length:2})];
  if(furnishingRings.some(ring=>pointInPolygon([v.x,v.y],ring)||edgeDistance([v.x,v.y],ring)<v.trunkRadius+.2))return false;
  if(observers.some(o=>Math.hypot(v.x-o.x,v.y-o.y)<.8||foliageContainsObserver(v,o)))return false;
  const p=[v.x,v.y],r=v.crownWidth/2;
  if(edgeDistance(p,data.site.boundary)<r+.15)return false;
  if(strict&&hardscape.some(ring=>pointInPolygon(p,ring)||edgeDistance(p,ring)<r+.15))return false;
  return true;
}
function maskFor(v){return views.map(view=>{
  const mask=new Uint32Array(view.words);
  view.rays.forEach((ray,i)=>{if(treeRayIntersection(ray.origin,ray.target,v))mask[i>>>5]|=1<<(i&31);});
  return mask;
});}
const pop=v=>{v=v-((v>>>1)&0x55555555);v=(v&0x33333333)+((v>>>2)&0x33333333);return (((v+(v>>>4))&0x0f0f0f0f)*0x01010101)>>>24;};
const emptyMasks=()=>views.map(v=>new Uint32Array(v.words));
function evaluateMask(mask){
  let score=0,totalWeight=0,minPrimary=1,primarySum=0,stressSum=0;
  const hidden=mask.map((m,j)=>{let count=views[j].blocked;for(const bits of m)count+=pop(bits);const fraction=count/views[j].total;score+=views[j].weight*fraction;totalWeight+=views[j].weight;if(j<5){minPrimary=Math.min(minPrimary,fraction);primarySum+=fraction;}else stressSum+=fraction;return count;});
  return {score:score/totalWeight,minPrimary,primaryMean:primarySum/5,stressMean:stressSum/8,hidden};
}
function union(a,b){return a.map((m,j)=>Uint32Array.from(m,(value,k)=>value|b[j][k]));}
function compatible(a,b){return Math.hypot(a.tree.x-b.tree.x,a.tree.y-b.tree.y)>=Math.max(1.4,Math.min(a.tree.crownWidth,b.tree.crownWidth)*.6);}
const candidates=[];let candidateIndex=0;
for(const typeId of typeIds){
  const begin=performance.now(),before=candidates.length;
  for(let y=18.5;y<=37.5;y+=.5)for(let x=.5;x<=20;x+=.5){
    const tree=createScreeningTree(typeId,{id:`candidate-${candidateIndex++}`,x,y}),v=screeningTreeVolumes({...settings,screeningTrees:[tree]},data)[0];
    if(!acceptable(v,true))continue;
    const masks=maskFor(v),quality=evaluateMask(masks);
    candidates.push({tree,masks,...quality});
  }
  console.log('CANDIDATES',typeId,candidates.length-before,'ms',round(performance.now()-begin));
}
const candidateByType=Object.fromEntries(typeIds.map(id=>[id,candidates.filter(c=>c.tree.typeId===id)]));
const weightedSort=(a,b)=>b.score-a.score||b.minPrimary-a.minPrimary;
const balancedSort=(a,b)=>(b.primaryMean*.65+b.stressMean*.35+b.minPrimary*.15)-(a.primaryMean*.65+a.stressMean*.35+a.minPrimary*.15);
function stateFor(group){const masks=group.reduce((mask,c)=>union(mask,c.masks),emptyMasks());return {group,masks,...evaluateMask(masks)};}
function beam(types,sort=weightedSort,width=20){
  let states=[stateFor([])];
  for(const type of types){
    const next=[],seen=new Set();
    for(const state of states)for(const c of candidateByType[type]){
      if(state.group.some(other=>!compatible(other,c)))continue;
      const group=[...state.group,c],key=group.map(c=>c.tree.id).sort().join('|');if(seen.has(key))continue;seen.add(key);
      const masks=union(state.masks,c.masks);next.push({group,masks,...evaluateMask(masks)});
    }
    states=next.sort(sort).slice(0,width);
    if(!states.length)return null;
  }
  // Coordinate descent can recover combinations missed by the small beam.
  let best=states[0];
  for(let pass=0;pass<3;pass++){
    let improved=false;
    for(let index=0;index<types.length;index++){
      const remainder=best.group.filter((_,i)=>i!==index),mask=remainder.reduce((m,c)=>union(m,c.masks),emptyMasks());
      for(const c of candidateByType[best.group[index].tree.typeId]){
        if(remainder.some(other=>!compatible(other,c)))continue;
        const group=best.group.slice();group[index]=c;const masks=union(mask,c.masks),next={group,masks,...evaluateMask(masks)};
        if(sort(next,best)<-1e-12){best=next;improved=true;}
      }
    }
    if(!improved)break;
  }
  return best;
}
function refine(state,sort=weightedSort){
  if(!state)return null;
  let best=state;
  for(let pass=0;pass<2;pass++)for(let index=0;index<best.group.length;index++){
    const centre=best.group[index],remainder=best.group.filter((_,i)=>i!==index),mask=remainder.reduce((m,c)=>union(m,c.masks),emptyMasks());
    for(let dy=-.4;dy<=.4001;dy+=.1)for(let dx=-.4;dx<=.4001;dx+=.1){
      if(!dx&&!dy)continue;
      const tree={...centre.tree,x:round(centre.tree.x+dx),y:round(centre.tree.y+dy)},v=screeningTreeVolumes({...settings,screeningTrees:[tree]},data)[0];
      if(!acceptable(v,true))continue;
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
  const trees=state.group.map((c,i)=>({...c.tree,id:`screen-${i+1}`}));
  const plantPLN=trees.reduce((s,t)=>s+getTreeType(t.typeId).pricePLN,0);
  const result={name,plantPLN,trees,weightedCoverage:state.score,primaryMean:state.primaryMean,primaryMinimum:state.minPrimary,stressMean:state.stressMean,
    views:views.map((view,i)=>({id:view.id,visible:view.total-state.hidden[i],total:view.total,blocked:state.hidden[i],coverage:state.hidden[i]/view.total})),
    warnings:screeningTreeVolumes({...settings,screeningTrees:trees},data).map(v=>({id:v.id,warnings:v.warnings})),settings:{hedgeRear:4,hedgeLeft:4,hedgeRight:4,gardenRaise:.5,bedRaise:0,terraceDepth:4.2,floorHeight:1.2,removeGarage:true,canopyEnabled:false}};
  console.log('LAYOUT',name,'PLN',plantPLN,'weighted',round(state.score*100),'primary',round(state.primaryMean*100),'stress',round(state.stressMean*100),trees.map(t=>[t.typeId,t.x,t.y]),result.views.map(v=>`${v.id}:${v.visible}/${v.total}`).join(' '));
  layouts.push(result);fs.writeFileSync(output,JSON.stringify({observers:observers.map(({id,x,y,z,eyeHeight,weight})=>({id,x,y,z,eyeHeight,weight})),settings,method:{grid:.5,refinement:.1,beamWidth:20,spacing:'max(1.4 m, half smaller crown width ×1.2)',clearance:'whole modeled crown +0.15m clear of parcel boundary and pool/deck/house/stairs',objective:'named views weight2, extra views weight1'},layouts},null,2));
  return result;
}
summarize('Baseline',stateFor([]));
for(const types of [['austrian-pine-tall','austrian-pine-tall','austrian-pine-large'],['austrian-pine-tall','austrian-pine-tall','austrian-pine-tall'],['austrian-pine-tall','austrian-pine-large','austrian-pine-large'],['austrian-pine-xl','austrian-pine-large','austrian-pine-large'],['austrian-pine-xl','austrian-pine-xl','austrian-pine-xl']])summarize(types.join(' + '),refine(beam(types)));
const selected=layouts;
for(const layout of selected){
  layout.shade=[];
  for(const date of ['2026-03-21','2026-06-21','2026-09-21'])for(const minutes of [720]){
    const s={...settings,screeningTrees:layout.trees,sunDate:date,sunMinutes:minutes},shade=analyzeSunlight(s,data,sunForSettings(s,data));
    layout.shade.push({date,minutes,zones:Object.fromEntries(Object.entries(shade.zones).map(([k,v])=>[k,{sunlit:v.sunlit,total:v.total,percent:round(v.percent)}]))});
  }
}
fs.writeFileSync(output,JSON.stringify({observers:observers.map(({id,x,y,z,eyeHeight,weight})=>({id,x,y,z,eyeHeight,weight})),settings,layouts},null,2));
console.log('FINISHED',layouts.length,'layouts');
