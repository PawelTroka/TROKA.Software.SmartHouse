/** Species-specific boundary screening with explicit garden-space constraints.
 * Run: node scripts/optimize-boundary-trees.mjs
 * Finite-candidate beam search; not a continuous/global optimum.
 */
import fs from 'node:fs';
import {resolve} from 'node:path';
import {ROOT,studyInput} from './garden-study-support.mjs';
import {gardenProgram} from '../src/garden-program.js';
import {rectCorners,terraceStairs} from '../src/layout.js';
import {gardenGroundAt,pointInPolygon,observerForPreset,terraceGroundReference} from '../src/geometry.js';
import {analyzeFacadeVisibility} from '../src/facade-visibility.js';
import {screeningTreeVolumes,createScreeningTree,treeRayIntersection} from '../src/screening-trees.js';
import {TREE_CATALOG} from '../src/tree-catalog.js';
import {STERNICZA_REFERENCE_POOL_TREES,STERNICZA_EXCELSA_TREES} from '../src/screening-layouts.js';
import {closestFootprints,closestBoundary} from '../src/dimensions.js';
const {data,settings,evidence}=studyInput({screeningTrees:[],poolSunbedSides:3});
const program=gardenProgram(settings,data),round=n=>Math.round(n*10000)/10000;
const baseViews=['sofa','standing','terrace','jacuzzi','pool','firepit','sauna'].map(id=>({id,
  weight:['sofa','standing','terrace','jacuzzi'].includes(id)?2:1,...observerForPreset(id,settings,data)}));
const sunbed=program.furniture.sunbeds[1],dining=program.furniture.dining;
for(const [id,r,eye]of [['poolside-loungers',sunbed,1.1],['dining',dining,1.2]]){
  const x=r.x+r.width/2,y=r.y+r.length/2;
  baseViews.push({id,weight:1,x,y,z:gardenGroundAt(x,y,settings,data)+eye});
}
const views=baseViews.map(view=>{const v=analyzeFacadeVisibility(view,'building-9',settings,data,{spacing:1});
 return {...view,total:v.total,blocked:v.total-v.visible,rays:v.rays.filter(r=>r.visible),words:Math.ceil(v.visible/32)};});
const terrace={...data.site.terrace,y:data.site.rearMidpoint[1],length:settings.terraceDepth};
const stairs=terraceStairs(terrace,settings.terraceDepth,terraceGroundReference(settings,data).drop,settings,data);
const obstacles=[data.site.house.footprint,rectCorners(terrace),rectCorners(stairs),
  rectCorners(program.pool,program.pool.coping),program.sauna.footprint,program.firepit.outerFootprint,
  rectCorners(program.coldPlunge,program.coldPlunge.pad),rectCorners(dining),
  ...program.furniture.sunbeds.map(b=>rectCorners(b)),
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
  for(let y=19.5;y<=36.5;y+=.5)for(let x=10.5;x<=19.25;x+=.5){
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
      // The owner's long left-edge pool and every optional sunbed are fixed.
      // Nearer-boundary placement preserves the open central garden while
      // facade coverage dominates; this objective does not optimise sunlight.
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
  proposal:'1.36 owner-selected long left-edge pool and central fire lounge; all three optional sunbed sides reserved, no outdoor kitchen.',
  constraints:'Trunks 1.1–3.7 m from east/rear boundary; 1 m from house, terrace, stairs, pool coping, fixed spa and all seven sunbed/dining footprints; maximum 1 m modeled crown overhang. Minimum spacing depends on catalogue width, bounded to 1.5–3 m.',
  limitations:'Finite beam/grid search, ideal dense crown volumes and assumed stock dimensions. Overhang requires agreement/maintenance; not a planting or legal clearance certification. Narrow and lower stock cannot match large pine screening.'},baselines,presets};
fs.writeFileSync(resolve(ROOT,'data/boundary-tree-search-1.36.json'),JSON.stringify(output,null,2)+'\n');
