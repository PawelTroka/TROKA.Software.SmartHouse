/** Reproducible bounded summer sunlight and PCK3 boundary-planting study.
 * Run from garden-lab: node scripts/optimize-summer-garden.mjs
 * The search ranks geometric direct-sun availability, not weather or energy.
 */
import fs from 'node:fs';
import {resolve} from 'node:path';
import {ROOT,studyInput} from './garden-study-support.mjs';
import {prepareSunGeometry,sunlightAtPoint} from '../src/shade.js';
import {sunForSettings} from '../src/solar.js';
import {gardenGroundAt,pointInPolygon,terraceGroundReference} from '../src/geometry.js';
import {gardenProgram} from '../src/garden-program.js';
import {rectCorners,terraceStairs} from '../src/layout.js';
import {summerGardenFurniture} from '../src/summer-garden.js';
import {footprintFit,overlapArea} from '../src/footprint-fit.js';
import {STERNICZA_REFERENCE_POOL_TREES} from '../src/screening-layouts.js';
const {data,settings,evidence}=studyInput({summerPoolLayout:false,screeningTrees:STERNICZA_REFERENCE_POOL_TREES});
const program=gardenProgram(settings,data),round=n=>Math.round(n*10000)/10000;
const dates=[...['06','07','08'].flatMap(month=>['01','15',month==='06'?'30':'31'].map(day=>`2026-${month}-${day}`))];
const times=Array.from({length:29},(_,i)=>420+i*30);
const suns=dates.flatMap(sunDate=>times.map(sunMinutes=>sunForSettings({...settings,sunDate,sunMinutes},data))).filter(s=>s.isDaylight);
let geometry=prepareSunGeometry(settings,data);
// The fire lounge and movable furniture are arranged after pool placement.
geometry={...geometry,occluders:geometry.occluders.filter(o=>!/^pool-|^firepit-/.test(o.id)),
  terrain:{...geometry.terrain,cutouts:[{x0:0,y0:22,x1:21,y1:39}]}};
const samples=[];
for(let y=23.25;y<37.5;y+=.5)for(let x=1.25;x<19.5;x+=.5){
  if(!pointInPolygon([x,y],data.site.boundary))continue;
  const z=gardenGroundAt(x,y,settings,data)+.05;
  let count=0;for(const sun of suns)if(sunlightAtPoint([x,y,z],settings,data,sun,geometry).sunlit)count++;
  samples.push({x,y,z,count,total:suns.length});
}
console.log('Summer map',samples.length,'receivers ×',suns.length,'daylight instants');
const stairs=terraceStairs(data.site.terrace,settings.terraceDepth,terraceGroundReference(settings,data).drop,{...settings,jacuzziCentered:true},data);
const obstacles=[rectCorners({...data.site.terrace,length:settings.terraceDepth},1),rectCorners(stairs),program.sauna.footprint,
  ...program.sauna.entrySteps.map(s=>s.footprint),rectCorners(program.coldPlunge,.5),...program.coldPlunge.steps.map(s=>rectCorners(s,.4))];
const candidates=[],seen=new Set();
function addCandidate(x,y,width,length){
  const key=[x,y,width,length].join(':');if(seen.has(key))return;seen.add(key);
  const pool={x,y,width,length},footprint=rectCorners(pool,1.28);
  if(footprintFit(footprint,data.site.boundary).location!=='inside'||obstacles.some(o=>overlapArea(footprint,o)>1e-8))return;
  if(settings.screeningTrees.some(t=>t.x>x-1.28&&t.x<x+width+1.28&&t.y>y-1.28&&t.y<y+length+1.28))return;
  const beds=summerGardenFurniture({poolSunbedSides:3},pool).loungers.map(([x,y])=>({x,y,width:.78,length:2}));
  if(beds.some(b=>footprintFit(rectCorners(b,1),data.site.boundary).location!=='inside'||obstacles.some(o=>overlapArea(rectCorners(b,.25),o)>1e-8)))return;
  const inside=samples.filter(p=>p.x>x&&p.x<x+width&&p.y>y&&p.y<y+length);
  const score=inside.reduce((sum,p)=>sum+p.count,0)/(inside.length*suns.length);
  candidates.push({...pool,score:round(score),samples:inside.length});
}
for(const [width,length]of[[3.5,8],[8,3.5]])for(let y=23.5;y<=34;y+=.5)for(let x=1.25;x<=17;x+=.5)addCandidate(x,y,width,length);
// Refine the leading transverse pool around the minimum one-metre stair exit.
for(let y=24.5;y<=25.5;y+=.25)for(let x=2.75;x<=4.25;x+=.25)addCandidate(x,y,8,3.5);
candidates.sort((a,b)=>b.score-a.score);
const output={method:{...evidence,dates,times,timezone:'Europe/Warsaw',mapGrid:.5,poolGrid:.5,clearanceBeyondWater:1.28,
  refinement:{step:.25,x:[2.75,4.25],y:[24.5,25.5]},
  sunbedConstraint:'Three furnished sides with bed rectangles at least 1 m inside the parcel and 0.25 m from fixed structures; 1 m coping-to-stair walking route.',
  source:'Shared buildings, measured neighbouring roof envelopes, enabled measured existing summer canopies, 4 m hedges and original 10 m Austrian pine reference.',
  limitations:'Initial ground-grid approximation; final chosen candidates require horizontal water-plane verification. Fire lounge and movable furniture are repositioned, sauna and cold plunge retained. Not weather, irradiance, continuous/global optimality or surveyed planting clearance.'},candidates:candidates.slice(0,50),candidateCount:candidates.length};
fs.writeFileSync(resolve(ROOT,'data/summer-pool-search-1.34.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({candidateCount:candidates.length,best:candidates.slice(0,15)},null,2));
