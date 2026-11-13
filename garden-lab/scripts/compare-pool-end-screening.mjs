/** Reproducible pool-end comparison; coordinates and target rays use shared geometry. */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {analyzeVisibility,observerForPreset,pointInPolygon,terraceGroundReference,jacuzziBounds,spaLevels} from '../src/geometry.js';
import {createScreeningTree,screeningTreeVolumes,treeRayIntersection} from '../src/screening-trees.js';
import {getTreeType} from '../src/tree-catalog.js';
import {STERNICZA_POOL_END_TREES,STERNICZA_LEFT_EDGE_TREES,STERNICZA_EDGE_TREES} from '../src/screening-layouts.js';
import {terraceStairs,rectCorners} from '../src/layout.js';
import {gardenProgram} from '../src/garden-program.js';
import {closestFootprints,closestBoundary} from '../src/dimensions.js';
import {analyzeSunlight} from '../src/shade.js';
import {sunForSettings} from '../src/solar.js';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=process.argv[2]||resolve(ROOT,'docs/pool-end-screening-comparison.json');
const data=JSON.parse(fs.readFileSync(`${ROOT}/data/site-data.json`));
const settings={siteId:'sternicza-11',gardenProgram:'spa-screened',screeningTrees:[],
 hedgeRear:4,hedgeLeft:4,hedgeRight:4,hedgeFront:4,hedgeInset:.5,gardenRaise:.5,bedRaise:0,raiseNewHedges:true,
 terraceDepth:4.2,floorHeight:1.2,removeGarage:true,canopyEnabled:false,includeHighFeatures:false,jacuzziOverflow:false,
 treeLeafMode:'auto',sunDate:'2026-06-21',sunMinutes:720,sunEnabled:true};
const previousSettings={...settings,gardenProgram:'spa-compact',hedgeFront:0};
const program=gardenProgram(settings,data),previousProgram=gardenProgram(previousSettings,data);
const primary=['sofa','standing','terrace','jacuzzi','garden','sauna','firepit'];
const observers=primary.map(p=>({id:p,...observerForPreset(p,{...settings,eyeHeight:undefined},data)}));
for(const [id,x,y,eye] of [
 ['terrace-left-seated',12.8,20.4,1.2],['terrace-left-standing',12.8,21.3,1.65],['terrace-right-standing',8,21.3,1.65],
 ['loungers-seated',12.7,23.7,1],['dining-seated',5.4,25.5,1.2],['right-garden-path',6.6,30,1.65],
 ['former-pool-west-path',14.1,29,1.65],['rear-left-garden-path',17.8,33.5,1.65],
 ['rear-centre-path',10.6,36,1.65],['cold-plunge-seated',7.7,36.2,1.1],
 ['new-pool-west-path',14.8,23.5,1.65],['new-pool-far-end',17.8,27.5,1.65],
])observers.push({id,...observerForPreset('custom',{...settings,observerX:x,observerY:y,eyeHeight:eye},data)});
const distSeg=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],n=dx*dx+dy*dy,t=n?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/n)):0;return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dy*t);};
const edgeDistance=(p,ring)=>Math.min(...ring.map((a,i)=>distSeg(p,a,ring[(i+1)%ring.length])));
const insideCrown=(v,o)=>(o.x-v.x)**2/v.crownRadii[0]**2+(o.y-v.y)**2/v.crownRadii[1]**2+(o.z-v.crownCenter[2])**2/v.crownRadii[2]**2<1;
const round=n=>Math.round(n*100)/100;
function groundObstacles(s){
 const p=gardenProgram(s,data),terrace={...data.site.terrace,depth:s.terraceDepth};
 const stairs=terraceStairs(terrace,s.terraceDepth,terraceGroundReference(s,data).drop,s,data);
 return [data.site.house.footprint,rectCorners(terrace),rectCorners(p.pool,p.pool.coping),rectCorners(stairs),p.sauna.footprint,
 ...p.sauna.entrySteps.map(step=>step.footprint),p.firepit.outerFootprint,rectCorners(p.coldPlunge,p.coldPlunge.pad),
 ...p.coldPlunge.steps.map(step=>rectCorners(step)),rectCorners(p.furniture.dining),
 ...p.furniture.loungers.map(([x,y])=>rectCorners({x,y,width:.78,length:2})),
 ...p.furniture.path.map(([x,y])=>rectCorners({x,y,width:1.15,length:.9}))];
}
function placement(v,s){
 const p=[v.x,v.y],boundaryCentreDistance=edgeDistance(p,data.site.boundary);
 const minimumGroundObstacleDistance=Math.min(...groundObstacles(s).map(r=>pointInPolygon(p,r)?0:edgeDistance(p,r)));
 const observerClear=observers.every(o=>Math.hypot(v.x-o.x,v.y-o.y)>=1&&!insideCrown(v,o));
 const pool=gardenProgram(s,data).pool;
 return {id:v.id,plantable:v.plantable,crownInside:v.crownInside,boundaryCentreDistance,minimumGroundObstacleDistance,
  trunkToPoolCoping:closestFootprints([p],rectCorners(pool,pool.coping)).distance,observerClear,
  allowanceAccepted:v.plantable&&boundaryCentreDistance>=1&&minimumGroundObstacleDistance>=1&&observerClear,
  nominalCrownOverhang:Math.max(0,v.crownWidth/2-boundaryCentreDistance),warnings:v.warnings};
}
const makeTrees=rows=>rows.map(([x,y],i)=>createScreeningTree('austrian-pine-tall',{id:`pine-${i+1}`,x,y}));
const layouts=[];
function summarize(id,name,trees,s,{sunlight=false}={}){
 const actual={...s,screeningTrees:trees},volumes=screeningTreeVolumes(actual,data),base={...s,screeningTrees:[]};
 const views=observers.map((observer,i)=>{
  // The last two positions belong to the new pool circulation. Do not compare
  // them with a standing observer inside the previous 8 m water footprint.
  if(s.gardenProgram==='spa-compact'&&i>=17)return {id:observer.id,comparable:false,reason:'New pool circulation position; outside the previous 17-view comparison.'};
  const full=analyzeVisibility(observer,actual,data).byBlock.find(b=>b.id==='building-9');
  const rays=analyzeVisibility(observer,base,data).rays.filter(r=>r.blockId==='building-9');
  const insideVisible=rays.filter(ray=>ray.visible&&!volumes.some(v=>{const hit=treeRayIntersection(ray.origin,ray.target,v);return hit&&pointInPolygon([hit.x,hit.y],data.site.boundary);})).length;
  return {id:observer.id,visible:full.visible,total:full.total,hidden:full.total-full.visible,
   hiddenPercent:round(100*(full.total-full.visible)/full.total),visibleWithoutOutsideEntryCredit:insideVisible};
 });
 const result={id,name,gardenProgram:s.gardenProgram,hedgeFront:s.hedgeFront,plantPLN:trees.reduce((sum,t)=>sum+getTreeType(t.typeId).pricePLN,0),trees,
  pool:gardenProgram(s,data).pool,views,placement:volumes.map(v=>placement(v,s)),
  pairDistances:trees.flatMap((tree,i)=>trees.slice(i+1).map(other=>({first:tree.id,second:other.id,metres:Math.hypot(tree.x-other.x,tree.y-other.y)}))),
  trunkEnvelope:trees.length?{width:Math.max(...trees.map(t=>t.x))-Math.min(...trees.map(t=>t.x)),depth:Math.max(...trees.map(t=>t.y))-Math.min(...trees.map(t=>t.y))}:null};
 if(sunlight){result.sunlight=[];for(const [date,minutes] of [['2026-03-21',720],['2026-06-21',540],['2026-06-21',720],['2026-06-21',900],['2026-09-21',720]]){
  const solarSettings={...actual,sunDate:date,sunMinutes:minutes},sun=analyzeSunlight(solarSettings,data,sunForSettings(solarSettings,data));
  result.sunlight.push({date,minutes,timeZone:'Europe/Warsaw',zones:Object.fromEntries(Object.entries(sun.zones).map(([key,value])=>[key,{sunlit:value.sunlit,total:value.total,percent:round(value.percent)}]))});
 }}
 layouts.push(result);console.log(name,views.slice(0,7).map(v=>`${v.id}:${v.visible}/${v.total}`).join(' '));return result;
}
summarize('previous-v12','Previous compact grove and 8 m pool',STERNICZA_LEFT_EDGE_TREES,previousSettings,{sunlight:true});
summarize('pool-and-front-only','Moved 7 m pool and front hedge; previous pine positions',STERNICZA_LEFT_EDGE_TREES,settings);
summarize('nearest-only','Move nearest pine only; two rear pines unchanged',makeTrees([[13.3,34.5],[14.4,25.7],[18.1,34.5]]),settings);
summarize('directly-behind-end','Closest pine directly beyond far end',makeTrees([[13.3,34.5],[16.1,28.2],[18.1,34.5]]),settings);
summarize('historical-balanced','Historical balanced trees on moved pool',STERNICZA_EDGE_TREES,settings);
const selected=summarize('selected','Selected pool-end screen',STERNICZA_POOL_END_TREES,settings,{sunlight:true});
if(selected.placement.some(p=>!p.allowanceAccepted||!p.crownInside))throw new Error('Selected tree violates a documented planting allowance or crosses the parcel.');
if(selected.views.some(v=>v.visible!==v.visibleWithoutOutsideEntryCredit))throw new Error('Selected screening depends on crown volume outside the parcel.');
const pool=program.pool,previousPool=previousProgram.pool,terrace={...data.site.terrace,length:settings.terraceDepth};
const near=STERNICZA_POOL_END_TREES.reduce((a,b)=>a.y<b.y?a:b);
const result={observedAt:'2026-11-13',target:{id:'building-9',label:'PCK3'},settings,previousSettings,
 geometry:{pool,previousPool,poolMoveTowardHouse:previousPool.y-pool.y,poolShortening:previousPool.length-pool.length,
  waterArea:pool.width*pool.length,previousWaterArea:previousPool.width*previousPool.length,
  poolCopingToHouse:closestFootprints(rectCorners(pool,pool.coping),data.site.house.footprint),
  poolCopingToTerrace:closestFootprints(rectCorners(pool,pool.coping),rectCorners(terrace)),
  poolCopingToLeftBoundary:closestBoundary(rectCorners(pool,pool.coping),data,'left'),
  nearestTree:{id:near.id,x:near.x,y:near.y,offsetBeforeWaterEnd:pool.y+pool.length-near.y,trunkToCoping:selected.placement.find(p=>p.id===near.id).trunkToPoolCoping},
  jacuzzi:jacuzziBounds(settings,data),sauna:{x:program.sauna.x,y:program.sauna.y,width:program.sauna.width,length:program.sauna.length,height:program.sauna.height},
  poolLevels:spaLevels(settings,data).pool},
 observers:observers.map(({id,x,y,z,eyeHeight,surface})=>({id,x,y,z,eyeHeight,surface})),
 method:{views:'17 existing fixed-world viewpoints plus two checks beside the moved pool. The old pool comparison omits those two positions to avoid treating water as a standing path.',
  comparison:'Exact shared analyzeVisibility engine for every listed layout and viewpoint. The previous-pines control separates the tree-placement improvement from the front hedge and pool change.',
  placement:'At least 1 m from trunk centre to mapped parcel boundary, hardscape, furniture and stepping stones; at least 1 m from named observers, none inside a crown. Illustrative allowance, not a nursery root-ball measurement.',
  selection:'Move the closest pine beside the far pool corner and adjust the rear pair for the living room, jacuzzi, garden and sunken lounge. Compare a pine directly behind the end and the historical balanced positions. Keep the 7 m pool, the same 9.5 m stock and all crowns inside the parcel.',
  geometricTradeoff:'The nearest pine is 0.8 m before the far water end, not directly centred behind it. A pine directly behind the end leaves more of the tall PCK3 target visible from the raised living room.',
  shade:'Shared dense-crown and hedge geometry, Warsaw civil time. These samples describe geometric access to direct sunlight, not weather.',
  caveat:'Target sample counts are not facade area. Dense ideal crowns overstate real foliage opacity; no complete-screening or global-optimum claim.'},layouts};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log('Saved',output);
