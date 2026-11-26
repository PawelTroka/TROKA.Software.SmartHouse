/** Species-specific boundary screening with explicit garden-space constraints.
 * Run: node scripts/optimize-boundary-trees.mjs
 * Finite-candidate beam search; not a continuous/global optimum.
 */
import fs from 'node:fs';
import {resolve} from 'node:path';
import {ROOT,studyInput} from './garden-study-support.mjs';
import {gardenProgram} from '../src/garden-program.js';
import {rectCorners} from '../src/layout.js';
import {gardenGroundAt,pointInPolygon,observerForPreset} from '../src/geometry.js';
import {analyzeFacadeVisibility} from '../src/facade-visibility.js';
import {screeningTreeVolumes,createScreeningTree,treeRayIntersection} from '../src/screening-trees.js';
import {TREE_CATALOG} from '../src/tree-catalog.js';
import {STERNICZA_REFERENCE_POOL_TREES,STERNICZA_EXCELSA_TREES} from '../src/screening-layouts.js';
import {closestFootprints,closestBoundary} from '../src/dimensions.js';
const {data,settings,evidence}=studyInput({screeningTrees:[]});
const program=gardenProgram(settings,data),round=n=>Math.round(n*10000)/10000;
const baseViews=['sofa','standing','terrace','jacuzzi','pool','firepit','sauna'].map(id=>({id,
  weight:['sofa','standing','terrace','jacuzzi'].includes(id)?2:1,...observerForPreset(id,settings,data)}));
baseViews.push({id:'poolside-loungers',weight:1,x:7,y:30,z:gardenGroundAt(7,30,settings,data)+1.1});
baseViews.push({id:'dining',weight:1,x:10.8,y:34.7,z:gardenGroundAt(10.8,34.7,settings,data)+1.2});
const views=baseViews.map(view=>{const v=analyzeFacadeVisibility(view,'building-9',settings,data,{spacing:1});
 return {...view,total:v.total,blocked:v.total-v.visible,rays:v.rays.filter(r=>r.visible),words:Math.ceil(v.visible/32)};});
const obstacles=[rectCorners(program.pool,program.pool.coping),program.sauna.footprint,program.firepit.outerFootprint,
  rectCorners(program.coldPlunge,program.coldPlunge.pad),rectCorners(program.furniture.dining),rectCorners(program.furniture.kitchen),
  ...program.furniture.loungers.map(([x,y])=>rectCorners({x,y,width:.78,length:2})),
  ...program.coldPlunge.steps.map(s=>rectCorners(s)),...program.sauna.entrySteps.map(s=>s.footprint)];
const pop=v=>{v=v-((v>>>1)&0x55555555);v=(v&0x33333333)+((v>>>2)&0x33333333);return (((v+(v>>>4))&0x0f0f0f0f)*0x01010101)>>>24;};
const empty=()=>views.map(v=>new Uint32Array(v.words));
const union=(a,b)=>a.map((m,j)=>Uint32Array.from(m,(v,k)=>v|b[j][k]));
function score(masks){let sum=0,weight=0;const counts=[];
  masks.forEach((mask,j)=>{const count=views[j].blocked+mask.reduce((sum,b)=>sum+pop(b),0);counts.push(count);sum+=views[j].weight*count/views[j].total;weight+=views[j].weight;});
  return {coverage:sum/weight,counts};
}
function masksFor(volume){return views.map(v=>{const m=new Uint32Array(v.words);v.rays.forEach((ray,i)=>{if(treeRayIntersection(ray.origin,ray.target,volume))m[i>>>5]|=1<<(i&31);});return m;});}
const presets={};
for(const type of TREE_CATALOG){
  const candidates=[];
  // East edge and rear/east return only: central garden remains available.
  for(let y=23.5;y<=36.5;y+=.5)for(let x=11.5;x<=19.25;x+=.5){
    const point=[x,y],edge=Math.min(closestBoundary([point],data,'left').distance,closestBoundary([point],data,'rear').distance);
    if(edge<1.1||edge>3.7||!pointInPolygon(point,data.site.boundary))continue;
    if(obstacles.some(r=>pointInPolygon(point,r)||closestFootprints([point],r).distance<1))continue;
    const tree=createScreeningTree(type.id,{id:`candidate-${x}-${y}`,x,y});
    const volume=screeningTreeVolumes({...settings,screeningTrees:[tree]},data)[0];
    if(!volume.plantable)continue;
    // At most one metre of crown overhang, explicitly reported. Wider conifers
    // move inward; their dimensions are never shrunk to fit a pine position.
    const overhang=Math.max(0,type.dimensions.crownWidth/2-edge);
    if(overhang>1.0+1e-8)continue;
    const masks=masksFor(volume),coverage=score(masks).coverage;
    candidates.push({tree,edge,overhang,masks,coverage});
  }
  const minSpacing=Math.max(1.5,Math.min(3,type.dimensions.crownWidth*.55));
  let beam=[{group:[],masks:empty(),score:0}];
  for(let count=0;count<3;count++){
    const next=[],seen=new Set();
    for(const s of beam)for(const c of candidates){
      if(s.group.some(o=>Math.hypot(c.tree.x-o.tree.x,c.tree.y-o.tree.y)<minSpacing))continue;
      const group=[...s.group,c],key=group.map(x=>x.tree.id).sort().join('|');if(seen.has(key))continue;seen.add(key);
      const masks=union(s.masks,c.masks),coverage=score(masks).coverage;
      const gardenCost=group.reduce((a,c)=>a+c.edge,0)/group.length;
      // Shade-sensitive pool sits west of this edge band. Nearer-boundary
      // placement costs less central garden while facade coverage dominates.
      next.push({group,masks,coverage,score:coverage-.012*gardenCost});
    }
    beam=next.sort((a,b)=>b.score-a.score).slice(0,40);
  }
  const best=beam[0];if(!best)throw new Error(`No three-tree boundary layout for ${type.id}`);
  const trees=best.group.map((c,i)=>({...c.tree,id:`pine-${i+1}`})),result=score(best.masks);
  presets[type.id]={trees,weightedCoverage:round(result.coverage),candidateCount:candidates.length,minSpacing,
    boundaryDistances:best.group.map(c=>round(c.edge)),crownOverhang:best.group.map(c=>round(c.overhang)),
    views:views.map((v,i)=>({id:v.id,blocked:result.counts[i],total:v.total,percent:round(100*result.counts[i]/v.total)}))};
  console.log(type.id,JSON.stringify(trees.map(t=>[t.x,t.y])),round(result.coverage));
}
const sameStock=STERNICZA_REFERENCE_POOL_TREES.map(({x,y},i)=>createScreeningTree('austrian-pine-tall',{id:`pine-${i+1}`,x,y}));
const baselines=Object.fromEntries([['no-specimens',[]],['previous-excelsa',STERNICZA_EXCELSA_TREES],['same-stock-old-positions',sameStock],['original-pines',STERNICZA_REFERENCE_POOL_TREES]].map(([id,trees])=>{
  const masks=screeningTreeVolumes({...settings,screeningTrees:trees},data).reduce((m,v)=>union(m,masksFor(v)),empty()),s=score(masks);
  return[id,{weightedCoverage:round(s.coverage),views:views.map((v,i)=>({id:v.id,blocked:s.counts[i],total:v.total,percent:round(100*s.counts[i]/v.total)}))}];
}));
const output={method:{...evidence,target:'PCK3 / building-9',grid:.5,beamWidth:40,facadeGrid:1,
  objective:'Weighted PCK3 facade sample coverage minus 0.012 × average trunk distance from nearest east/rear boundary. House/terrace/jacuzzi weight 2; pool/fire/sauna/sunbeds/dining weight 1.',
  constraints:'Trunks 1.1–3.7 m from east/rear boundary; 1 m from pool coping/fixed spa/furniture footprints; maximum 1 m modeled crown overhang. Minimum spacing depends on catalogue width, bounded to 1.5–3 m.',
  limitations:'Finite beam/grid search, ideal dense crown volumes and assumed stock dimensions. Overhang requires agreement/maintenance; not a planting or legal clearance certification. Narrow and lower stock cannot match large pine screening.'},baselines,presets};
fs.writeFileSync(resolve(ROOT,'data/boundary-tree-search-1.34.json'),JSON.stringify(output,null,2)+'\n');
