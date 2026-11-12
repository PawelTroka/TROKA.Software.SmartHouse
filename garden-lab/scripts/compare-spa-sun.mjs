/** Reproduce the pool-position sun comparison: node scripts/compare-spa-sun.mjs */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createStateModel} from '../src/state.js';
import {getSiteProfile} from '../src/sites.js';
import {sunForSettings} from '../src/solar.js';
import {analyzeSunlight} from '../src/shade.js';
import {poolBounds} from '../src/garden-program.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url),'utf8'));
const defaults=createStateModel(getSiteProfile('sternicza-11',data)).DEFAULTS;
const eastOnly={...data,site:{...data.site,pool:poolBounds(defaults,data)}};
const metrics=(settings,source=data)=>{
  const sun=sunForSettings(settings,source),shade=analyzeSunlight(settings,source,sun);
  const zones=Object.fromEntries(['pool','terrace','jacuzzi','coldPlunge','firepit'].filter(k=>shade.zones[k]).map(k=>{
    const zone=shade.zones[k];return [k,{percent:zone.percent===null?null:+zone.percent.toFixed(1),sunlit:zone.sunlit,total:zone.total}];
  }));
  const poolBlockers=shade.cells.filter(c=>c.zone==='pool').reduce((out,c)=>{
    const name=c.state==='night'?'night':c.blockedLabel||'direct sun';out[name]=(out[name]||0)+1;return out;
  },{});
  return {zones,poolBlockers};
};
const rows=[];
for(const date of ['2026-03-21','2026-06-21','2026-12-21'])for(const hour of [9,12,15,18]){
  const settings={...defaults,sunDate:date,sunMinutes:hour*60},sun=sunForSettings(settings,data);
  const row={date,time:`${String(hour).padStart(2,'0')}:00`,timezone:sun.timezoneLabel,elevationDegrees:+sun.elevation.toFixed(2)};
  for(const [name,program,screeningTrees,source] of [
    ['oldWestNoTrees','classic',[],data],['eastOnlyNoTrees','classic',[],eastOnly],
    ['newEastSpaNoTrees','spa',[],data],['newEastSpaDefaults','spa',defaults.screeningTrees,data],
  ])row[name]=metrics({...settings,gardenProgram:program,screeningTrees},source);
  rows.push(row);
}
const individualTrees=[];
for(const hour of [12,15])for(const tree of defaults.screeningTrees){
  const settings={...defaults,sunDate:'2026-06-21',sunMinutes:hour*60,screeningTrees:[tree]};
  individualTrees.push({date:settings.sunDate,time:`${hour}:00`,treeId:tree.id,typeId:tree.typeId,x:tree.x,y:tree.y,...metrics(settings)});
}
const eastHedgeSensitivity=[4,3,2.5].map(height=>{
  const settings={...defaults,hedgeLeft:height,sunDate:'2026-06-21',sunMinutes:540};
  return {date:settings.sunDate,time:'09:00',leftHedgeMetres:height,trees:'all spa defaults',...metrics(settings)};
});
const report={
  method:'Direct-sun visibility on a fixed 1 m outdoor sample grid, in Europe/Warsaw local civil time. Spa pool edge rays sample the centre of each clipped water-cell portion, avoiding zero-area coping boundaries. Pool percentages describe sample fractions, not integrated daily solar energy. Whole-grid alignment produces 24 west-pool and 27 east-pool samples for the same 3.5 × 8 m footprint.',
  limits:'Mapped buildings/roofs, ideal opaque hedges, local terrain, spa construction and dense proposed tree crowns are modeled. Existing unmapped trees, weather, diffuse/reflected light and actual foliage permeability are absent. Cold plunge and fire lounge have very few samples. This is a design comparison, not a certified daylight study.',
  settings:Object.fromEntries(['hedgeRear','hedgeLeft','hedgeRight','hedgeInset','gardenRaise','bedRaise','floorHeight','terraceDepth','removeGarage','canopyEnabled'].map(key=>[key,defaults[key]])),
  oldPool:data.site.pool,newPool:poolBounds(defaults,data),defaultTrees:defaults.screeningTrees,
  rows,individualTrees,eastHedgeSensitivity,
};
const output=new URL('../docs/spa-sun-comparison.json',import.meta.url);
mkdirSync(new URL('../docs/',import.meta.url),{recursive:true});
writeFileSync(output,`${JSON.stringify(report,null,2)}\n`);
console.log(`Wrote ${output.pathname}`);
console.table(rows.map(r=>({date:r.date,time:r.time,west:r.oldWestNoTrees.zones.pool.percent,
  east:r.newEastSpaNoTrees.zones.pool.percent,eastWithTrees:r.newEastSpaDefaults.zones.pool.percent})));
console.table(individualTrees.map(r=>({time:r.time,tree:r.treeId,x:r.x,y:r.y,poolSun:r.zones.pool.percent})));
console.table(eastHedgeSensitivity.map(r=>({eastHedge:r.leftHedgeMetres,poolSun:r.zones.pool.percent})));
