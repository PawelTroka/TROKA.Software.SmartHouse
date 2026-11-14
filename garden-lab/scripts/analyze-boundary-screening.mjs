/** Reproducible concept comparisons; not surveyed specimens or construction designs. */
import {readFileSync} from 'node:fs';
import {DEFAULTS} from '../src/state.js';
import {observerForPreset,analyzeVisibility,gardenGroundAt} from '../src/geometry.js';
import {analyzeFacadeVisibility} from '../src/facade-visibility.js';
import {screeningTreeVolumes,treeRayIntersection} from '../src/screening-trees.js';
import {closestFootprints,closestBoundary} from '../src/dimensions.js';
import {gardenProgram} from '../src/garden-program.js';
import {rectCorners} from '../src/layout.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const settings={...DEFAULTS,gardenProgram:'spa-pool-grove',canopyEnabled:false,eyeHeight:undefined};
const presets=['sofa','standing','terrace','jacuzzi','garden','sauna','firepit'];
const views=presets.map(id=>({id,observer:observerForPreset(id,settings,data)}));
for(const [id,x,y,eye] of [['dining-standing',5.5,26.1,1.65],['dining-seated',5.5,26.1,1.1]])
 views.push({id,observer:{x,y,z:gardenGroundAt(x,y,settings,data)+eye}});
const reference=settings.screeningTrees;
const check=(s,view,target='building-9')=>{
 const facade=analyzeFacadeVisibility(view.observer,target,s,data);
 const roof=analyzeVisibility(view.observer,s,data).rays.filter(r=>r.blockId===target&&r.kind==='roof');
 return {facade,roof};
};
const summarize=(s)=>views.map(view=>{
 const {facade,roof}=check(s,view);
 return {view:view.id,exposed:facade.visible,total:facade.total,hiddenPercent:100*(1-facade.visible/facade.total),
  roofExposed:roof.filter(r=>r.visible).length,roofTotal:roof.length};
});
const boundary=views.map(view=>{
 const {facade,roof}=check({...settings,screeningTrees:[]},view);
 const exposed=[...facade.rays,...roof].filter(r=>r.visible&&r.screen);
 return {view:view.id,observer:view.observer,unblockedRays:exposed.length,
  leftRequired:Math.max(0,...exposed.filter(r=>r.screen.side==='left').map(r=>r.screen.requiredHeight)),
  rearRequired:Math.max(0,...exposed.filter(r=>r.screen.side==='rear').map(r=>r.screen.requiredHeight)),
  eastExitY:exposed.filter(r=>r.screen.side==='left').length?[
   Math.min(...exposed.filter(r=>r.screen.side==='left').map(r=>r.screen.y)),
   Math.max(...exposed.filter(r=>r.screen.side==='left').map(r=>r.screen.y))]:null};
});
const current=views.map(view=>({...view,...check(settings,view)}));
const rays=current.map(v=>[...v.facade.rays,...v.roof].filter(r=>r.visible));
const pool=gardenProgram(settings,data).pool,coping=rectCorners(pool,pool.coping);
const candidates=[];
// Additional trunks stay within the eastern 3.3 m strip; the reference trees
// remain untouched. Keep at least 1.5 m trunk-centre to the plot/hardscape and
// 2.8 m between trunk centres. This is still a concept, not root-ball approval.
const candidatePositions=[];
for(let x=17;x<=18.8+1e-8;x+=.3)for(let y=20.5;y<=26+1e-8;y+=.3)candidatePositions.push([x,y]);
for(let x=9.8;x<=18.8+1e-8;x+=.3)for(let y=35.2;y<=36.5+1e-8;y+=.3)candidatePositions.push([x,y]);
for(const [x,y] of candidatePositions){
 const tree={...reference[0],id:'edge-extra',x:Number(x.toFixed(2)),y:Number(y.toFixed(2))};
 const v=screeningTreeVolumes({...settings,screeningTrees:[tree]},data)[0];
 if(!v?.plantable||closestBoundary([[tree.x,tree.y]],data).distance<1.5
  ||closestFootprints([[tree.x,tree.y]],coping).distance<1.5
  ||closestFootprints([[tree.x,tree.y]],data.site.house.footprint).distance<1.5
  ||reference.some(t=>Math.hypot(t.x-tree.x,t.y-tree.y)<2.8))continue;
 candidates.push({tree,volume:v,hits:rays.map(rs=>rs.map(r=>Boolean(treeRayIntersection(r.origin,r.target,v))))});
}
function score(items){
 const fractions=rays.map((rs,i)=>rs.filter((_,j)=>!items.some(item=>item.hits[i][j])).length/(current[i].facade.total+current[i].roof.length));
 return Math.max(...fractions)+fractions.reduce((a,b)=>a+b,0)/100;
}
candidates.sort((a,b)=>score([a])-score([b]));
const bestOne=candidates[0];let bestPair=null,pairScore=Infinity;
for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){
 const a=candidates[i],b=candidates[j];if(Math.hypot(a.tree.x-b.tree.x,a.tree.y-b.tree.y)<2.8)continue;
 const s=score([a,b]);if(s<pairScore){pairScore=s;bestPair=[a,b];}
}
const cases=[['reference',settings],['reference-plus-terrace-roof',{...settings,canopyEnabled:true}],
 ['reference-plus-roof-0.6m-fascia',{...settings,canopyEnabled:true,fasciaDepth:.6}],
 ['reference-height-11m-only',{...settings,screeningTrees:reference.map(t=>({...t,height:11}))}],
 ['reference-height-12m-only',{...settings,screeningTrees:reference.map(t=>({...t,height:12}))}],
 ['same-positions-10m-by-8m-crowns',{...settings,screeningTrees:reference.map(t=>({...t,height:10,crownWidth:8,crownDepth:8}))}],
 ['same-positions-11m-by-8m-crowns',{...settings,screeningTrees:reference.map(t=>({...t,height:11,crownWidth:8,crownDepth:8}))}]];
if(bestOne)cases.push(['reference-plus-one-east-strip-pine',{...settings,screeningTrees:[...reference,{...bestOne.tree,id:'edge-extra-1'}]}]);
if(bestPair)cases.push(['reference-plus-two-east-strip-pines',{...settings,screeningTrees:[...reference,...bestPair.map((c,i)=>({...c.tree,id:'edge-extra-'+(i+1)}))]}]);
const output={method:'Existing mapped geometry, 4 m perimeter hedge at 0.5 m inset, +0.5 m garden fill. Exact analytic crown envelopes, 0.25 m facade grid, original roof samples. Additional trees confined to east strip; search ranks worst remaining wall+roof ray fraction, then total fraction. No real-foliage guarantee.',
 boundary,candidateCount:candidates.length,
 cases:cases.map(([id,s])=>({id,trees:s.screeningTrees.map(t=>({x:t.x,y:t.y,height:t.height,width:t.crownWidth,depth:t.crownDepth})),
  canopy:s.canopyEnabled,fasciaDepth:s.fasciaDepth,results:summarize(s)}))};
console.log(JSON.stringify(output,null,2));
