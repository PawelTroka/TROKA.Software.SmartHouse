// Conservative transfer inventory, without loading Three.js or any images.
import {readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {DESIGN_STYLES} from '../src/design-styles.js';
import {MATERIAL_ASSETS,getMaterialForFinish,getInteriorMaterialFinishes,getStyleMaterialSamples} from '../src/material-catalogue.js';
import {getExteriorSurfaceSpec} from '../src/exterior-recipes.js';
const manifest=JSON.parse(await readFile(new URL('../assets/materials/manifest.json',import.meta.url),'utf8'));
const catalogue=JSON.parse(await readFile(new URL('../assets/materials/style-swatches/manifest.json',import.meta.url),'utf8'));
const referenceFiles=(await readdir(new URL('../assets/materials/',import.meta.url))).filter(file=>file.endsWith('_swatch.jpg'));
const referenceBytes=(await Promise.all(referenceFiles.map(file=>stat(new URL('../assets/materials/'+file,import.meta.url))))).reduce((sum,s)=>sum+s.size,0);
const files=new Map(manifest.assets.flatMap(a=>Object.values(a.maps).map(m=>[m.file,m.bytes])));
const paths=spec=>spec?Object.values(spec.files):[];
const size=items=>[...new Set(items)].reduce((n,file)=>n+files.get(file),0);
const finish=(name,seams=true)=>paths(getMaterialForFinish(name,{seams}));
const baseline=['wood','grass','plaster','stone','linen','pine-bark'].flatMap(key=>paths(MATERIAL_ASSETS[key]));
const rows=DESIGN_STYLES.filter(s=>s.id!=='current').map(style=>{
  const e=getExteriorSurfaceSpec(style),i=getInteriorMaterialFinishes(style);
  const exterior=[...finish(e.wall),...finish(e.roof),...finish(e.wood,false),...finish(e.paving,false),...finish(e.fabric),
    ...finish(['teak','ash','cedar','silvered-wood','whitewashed-oak'].includes(e.paving)?'limestone':e.paving)];
  // Includes optional dictionary slots: the runtime now defers unused ones,
  // so an actual model can transfer less, never more for these materials.
  const interior=[...finish(i.wall),...finish(i.wood,false),...finish(i.floor),...finish(i.wetFloor),...finish(i.stone,false),...finish(i.fabric),
    ...['slate-floor','concrete','clinker','clay-render','linen','smooth-render'].flatMap(name=>finish(name,name!=='slate-floor'))];
  return {style:style.id,exteriorBytes:size(exterior),interiorAllSlotsUpperBoundBytes:size(interior),
    combinedNewBytes:size([...exterior,...interior].filter(file=>!baseline.includes(file)))};
});
const report={sourceSets:manifest.assets.filter(a=>!a.derivedFrom).length,registeredSamples:manifest.assets.length,
  uniquePbrBytes:size([...files.keys()]),baselineGardenBytes:size(baseline),
  calibratedCatalogueBytes:catalogue.totalBytes,calibratedCatalogueFiles:catalogue.uniqueFiles,calibratedCatalogueSamples:catalogue.sampleCount,
  sourceReferencePreviewBytes:referenceBytes,
  scope:'JPEG transfer before HTTP compression, unique URLs; interior includes every optional slot, while runtime requests only materials attached to the model. Baseline garden files are shared and cached.',styles:rows};
await writeFile(new URL('../docs/material-transfer-budget.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({sets:report.sourceSets,libraryMB:report.uniquePbrBytes/1e6,baselineMB:report.baselineGardenBytes/1e6,
  exteriorRangeMB:[Math.min(...rows.map(r=>r.exteriorBytes)),Math.max(...rows.map(r=>r.exteriorBytes))].map(n=>n/1e6),
  interiorUpperRangeMB:[Math.min(...rows.map(r=>r.interiorAllSlotsUpperBoundBytes)),Math.max(...rows.map(r=>r.interiorAllSlotsUpperBoundBytes))].map(n=>n/1e6),
  combinedNewRangeMB:[Math.min(...rows.map(r=>r.combinedNewBytes)),Math.max(...rows.map(r=>r.combinedNewBytes))].map(n=>n/1e6)},null,2));
