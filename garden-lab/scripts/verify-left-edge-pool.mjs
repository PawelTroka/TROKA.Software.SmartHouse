/** Compare the requested left-edge garden with an optional 1.35 checkout.
 * node scripts/verify-left-edge-pool.mjs /path/to/previous/garden-lab
 * This is a bounded shade comparison, not a search for an optimum.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dates=['2026-06-01','2026-06-15','2026-06-30','2026-07-01','2026-07-15','2026-07-31','2026-08-01','2026-08-15','2026-08-31'];
const times=Array.from({length:48},(_,i)=>15+i*30);
const round=n=>Math.round(n*10000)/10000;
const load=(dir,name)=>import(pathToFileURL(path.join(dir,name)).href);

async function evaluate(dir,label){
  const [support,shade,solar,geometry,garden,summer]=await Promise.all([
    load(dir,'scripts/garden-study-support.mjs'),load(dir,'src/shade.js'),load(dir,'src/solar.js'),
    load(dir,'src/geometry.js'),load(dir,'src/garden-program.js'),load(dir,'src/summer-garden.js'),
  ]);
  const {data,settings,evidence}=support.studyInput({screeningTrees:summer.optimizedScreeningTrees('austrian-pine-tall')});
  const pool=garden.poolBounds(settings,data),waterZ=geometry.spaLevels(settings,data).pool.waterZ;
  const prepared=shade.prepareSunGeometry(settings,data),receivers=[];
  for(let ix=0;ix<8;ix++)for(let iy=0;iy<4;iy++)receivers.push([
    pool.x+(ix+.5)*pool.width/8,pool.y+(iy+.5)*pool.length/4,waterZ,
  ]);
  const days=[],months={};let lit=0,total=0;
  for(const sunDate of dates){
    let dayLit=0,dayTotal=0;
    for(const sunMinutes of times){
      const sun=solar.sunForSettings({...settings,sunDate,sunMinutes},data);
      if(!sun.isDaylight)continue;
      for(const p of receivers){dayLit+=Number(shade.sunlightAtPoint(p,settings,data,sun,prepared).sunlit);dayTotal++;}
    }
    const hours=dayLit/receivers.length*.5;
    days.push({date:sunDate,equivalentDirectSunHours:round(hours),daylightFraction:round(dayLit/dayTotal)});
    const key=sunDate.slice(0,7);months[key]??={hours:0,days:0};months[key].hours+=hours;months[key].days++;
    lit+=dayLit;total+=dayTotal;
  }
  const sourceFiles={};
  for(const name of ['src/summer-garden.js','src/garden-program.js','src/shade.js','src/geometry.js','src/plan-exterior.js'])
    sourceFiles[name]=createHash('sha256').update(fs.readFileSync(path.join(dir,name))).digest('hex');
  const result={label,version:JSON.parse(fs.readFileSync(path.join(dir,'package.json'))).version,
    pool:{x:pool.x,y:pool.y,width:pool.width,length:pool.length,waterZ},
    specimenTrees:settings.screeningTrees,meanEquivalentDirectSunHours:round(lit/receivers.length*.5/dates.length),
    daylightFraction:round(lit/total),receivers:receivers.length,totalRays:total,
    months:Object.fromEntries(Object.entries(months).map(([key,v])=>[key,{meanEquivalentDirectSunHours:round(v.hours/v.days),sampledDays:v.days}])),
    days,evidence:{...evidence,sourceFiles}};
  console.log(JSON.stringify({label,pool:result.pool,hours:result.meanEquivalentDirectSunHours,daylightFraction:result.daylightFraction}));
  return result;
}

const results=[await evaluate(root,'Requested left-edge pool and adjusted boundary pines')];
if(process.argv[2])results.push(await evaluate(path.resolve(process.argv[2]),'Released 1.35 transverse pool and boundary pines'));
const output={method:{dates,timeZone:'Europe/Warsaw',timeStepMinutes:30,
  sampling:'32 equal-area horizontal water receivers; half-hour midpoints over all 24 local hours on nine dates; only above-horizon instants enter daylight fraction.',
  interpretation:'Equivalent direct-sun hours average the lit proportion of the water over time. They do not mean the entire pool is sunlit simultaneously.',
  included:'Production registered house, mapped neighbouring roofs, measured summer vegetation, four-metre hedges, specimen trees, pool coping, terrain and garden structures for each version.',
  objective:'Document the sunlight tradeoff of the requested left-edge composition; no search or optimality claim.',
  limits:'Nine representative dates rather than every summer day; finite receiver/time sampling and simplified dense foliage. No weather, water-temperature, energy-yield or survey-accuracy prediction.'},results};
fs.writeFileSync(path.join(root,'data/left-edge-pool-verification-1.36.json'),JSON.stringify(output,null,2)+'\n');
