/** Check shortlisted pool positions on horizontal water with the shared full
 * sun model, then compare the chosen and historical pool on all 92 summer days.
 */
import fs from 'node:fs';
import {resolve} from 'node:path';
import {ROOT,studyInput} from './garden-study-support.mjs';
import {prepareSunGeometry,sunlightAtPoint,sunPrism} from '../src/shade.js';
import {sunForSettings} from '../src/solar.js';
import {spaLevels,poolEdgeBoxes} from '../src/geometry.js';
import {poolBounds} from '../src/garden-program.js';
import {rectCorners} from '../src/layout.js';
import {SUMMER_POOL,optimizedScreeningTrees} from '../src/summer-garden.js';
import {STERNICZA_REFERENCE_POOL_TREES,STERNICZA_EXCELSA_TREES} from '../src/screening-layouts.js';
const {data,settings,evidence}=studyInput({screeningTrees:optimizedScreeningTrees('austrian-pine-tall')});
const round=n=>Math.round(n*10000)/10000;
function geometryFor(pool,state){
  const base=prepareSunGeometry(state,data);
  // Ask the same production level/edge functions for an arbitrary candidate.
  // Classic mode selects site.pool, while ground/fill and registered house stay
  // unchanged. It is used only for the candidate basin, not other occluders.
  const candidateData={...data,site:{...data.site,pool}};
  const candidateState={...state,gardenProgram:'classic',summerPoolLayout:false,styleGardenLayout:false,pavilionEnabled:false};
  const bounds=poolBounds(candidateState,candidateData),levels=spaLevels(candidateState,candidateData).pool;
  const waterZ=levels.waterZ;
  const geometry={...base,occluders:[...base.occluders.filter(o=>!/^pool-/.test(o.id)),
    ...poolEdgeBoxes(bounds,levels).map((b,i)=>sunPrism(`candidate-pool-${i}`,
      rectCorners({x:b.x0,y:b.y0,width:b.x1-b.x0,length:b.y1-b.y0}),b.z0,b.z1))],
    terrain:{...base.terrain,cutouts:[{x0:pool.x,y0:pool.y,x1:pool.x+pool.width,y1:pool.y+pool.length},...base.terrain.cutouts.slice(1)]}};
  const receivers=[];for(let ix=0;ix<8;ix++)for(let iy=0;iy<4;iy++)receivers.push([
    pool.x+(ix+.5)*pool.width/8,pool.y+(iy+.5)*pool.length/4,waterZ]);
  return {geometry,receivers,waterZ};
}
const study=JSON.parse(fs.readFileSync(resolve(ROOT,'data/summer-pool-search-1.34.json')));
const shortSuns=study.method.dates.flatMap(sunDate=>study.method.times.map(sunMinutes=>sunForSettings({...settings,sunDate,sunMinutes},data))).filter(s=>s.isDaylight);
function evaluate(pool,state,suns){
  const {geometry,receivers,waterZ}=geometryFor(pool,state),months={},days={};let lit=0,total=0;
  for(const sun of suns){
    let count=0;for(const receiver of receivers)if(sunlightAtPoint(receiver,state,data,sun,geometry).sunlit)count++;
    const m=sun.date.slice(0,7);months[m]??={lit:0,total:0};months[m].lit+=count;months[m].total+=receivers.length;
    days[sun.date]??={lit:0,total:0};days[sun.date].lit+=count;days[sun.date].total+=receivers.length;
    lit+=count;total+=receivers.length;
  }
  return {...pool,waterZ,sunlitRays:lit,sunlitFraction:round(lit/total),
    sunlitHoursPerDay:round(lit/receivers.length*.5/Object.keys(days).length),
    months:Object.fromEntries(Object.entries(months).map(([m,v])=>[m,{sunlitFraction:round(v.lit/v.total)}])),
    days:Object.fromEntries(Object.entries(days).map(([date,v])=>[date,{sunlitHours:round(v.lit/receivers.length*.5)}])),
    receivers:receivers.length,totalRays:total};
}
const shortlist=[],seen=new Set();
for(const pool of [...study.candidates.slice(0,8),SUMMER_POOL]){
  const key=[pool.x,pool.y,pool.width,pool.length].join(':');if(seen.has(key))continue;seen.add(key);
  const result=evaluate(pool,settings,shortSuns);delete result.days;shortlist.push(result);
}
shortlist.sort((a,b)=>b.sunlitFraction-a.sunlitFraction);
console.log('Shortlisted horizontal water verification',JSON.stringify(shortlist.map(({x,y,width,length,sunlitFraction})=>({x,y,width,length,sunlitFraction}))));
const dates=[];for(let i=0;i<92;i++)dates.push(new Date(Date.UTC(2026,5,1+i)).toISOString().slice(0,10));
// Half-hour midpoint quadrature over the entire local civil day. Sunrise and
// sunset are not clipped to a preferred bathing schedule.
const suns=dates.flatMap(sunDate=>Array.from({length:48},(_,i)=>sunForSettings({...settings,sunDate,sunMinutes:15+i*30},data))).filter(s=>s.isDaylight);
const poolOld={x:14.52,y:26.3,width:3.5,length:8};
const cases=[['Proposed summer pool and boundary pines',SUMMER_POOL,settings],
  ['Previous pool and Excelsa reference',{...poolOld},{...settings,summerPoolLayout:false,screeningTrees:STERNICZA_EXCELSA_TREES}],
  ['Previous pool with original broad pines',{...poolOld},{...settings,summerPoolLayout:false,screeningTrees:STERNICZA_REFERENCE_POOL_TREES}],
  ['Previous pool with new boundary pines',{...poolOld},{...settings,summerPoolLayout:false}]];
const results=[];
for(const [name,pool,state]of cases){const result={name,...evaluate(pool,state,suns)};results.push(result);console.log(name,result.sunlitFraction,result.sunlitHoursPerDay);}
const output={method:{...evidence,dateRange:['2026-06-01','2026-08-31'],days:92,timeZone:'Europe/Warsaw',timeStepMinutes:30,
  timeSampling:'Half-hour midpoints over all 24 local hours; only sun above geometric horizon enters daylight fraction.',receivers:'32 equal-area cell centres per pool, on the exact horizontal rendered water plane; shared spaLevels and poolEdgeBoxes supply elevations and basin geometry.',
  searchCandidateCount:study.candidateCount,shortlist,objective:'Mean geometric direct-sun area-hours across the full summer.',
  included:'Resolved measured neighbour roofs, house envelope, enabled measured summer foliage, 4 m hedges, shared garden structures, pool coping, local terrain and proposed specimen trees.',
  limits:'Finite candidate grid and simplified dense foliage. Not a continuous global optimum, weather forecast, energy yield or surveyed shade guarantee. Existing tree canopy scan is from October 2024; leaf-on assumes dense summer crowns. Floating-point/grid precision does not imply survey accuracy.'},results};
fs.writeFileSync(resolve(ROOT,'data/summer-pool-verification-1.34.json'),JSON.stringify(output,null,2)+'\n');
