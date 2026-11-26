/** Match the public app's data registration and retain inputs for reproduction. */
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {DEFAULTS,encodeState} from '../src/state.js';
import {applyBuildingOverrides} from '../src/buildings.js';
import {applyPlanExterior} from '../src/plan-exterior.js';
export const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export function studyInput(patch={}){
  const sourceData={};
  function read(name){
    const bytes=fs.readFileSync(resolve(ROOT,'data',name));
    sourceData[name]={sha256:createHash('sha256').update(bytes).digest('hex')};
    return JSON.parse(bytes);
  }
  const raw=read('site-data.json');
  raw.existingVegetation=read('sternicza-surrounding-nature.json');
  raw.neighborRoofObservations=read('sternicza-neighbor-roofs.json');
  const settings={...DEFAULTS,summerPoolLayout:true,designStyle:'current',
    terraceWidth:8.5,canopyWidth:8.5,terraceDepth:4,canopyDepth:4,canopyEnabled:true,
    existingVegetation:true,existingCanopyAnalysis:true,existingLeafMode:'summer',treeLeafMode:'leaf-on',...patch};
  const data=applyPlanExterior(applyBuildingOverrides(raw,settings),settings);
  return {data,settings,evidence:{sourceData,state:encodeState(settings),
    registration:'applyBuildingOverrides followed by applyPlanExterior, matching the public app',
    terrace:{...data.site.terrace,depth:settings.terraceDepth},rearMidpoint:data.site.rearMidpoint}};
}
