/**
 * Same-position specimen comparison, frozen to the 14 November 2026 design.
 * Run: node scripts/compare-tree-alternatives.mjs [output.json]
 * Without a filename, writes the full JSON to stdout. No site files are changed.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {decodeState} from '../src/state.js';
import {observerForPreset,analyzeVisibility} from '../src/geometry.js';
import {analyzeFacadeVisibility} from '../src/facade-visibility.js';
import {screeningTreeVolumes} from '../src/screening-trees.js';
import {getTreeType} from '../src/tree-catalog.js';
import {estimateScreeningTreeCosts} from '../src/costs.js';
import {gardenProgram} from '../src/garden-program.js';
import {closestFootprints,closestBoundary} from '../src/dimensions.js';
import {rectCorners} from '../src/layout.js';

const source=readFileSync(new URL('../data/site-data.json',import.meta.url));
const data=JSON.parse(source),targetId='building-9',spacing=.25;
// Versioned migration plus literal geometry prevents a future fresh default,
// selected UI viewpoint or entered quote from rewriting this dated comparison.
const settings={...decodeState('v=18&site=sternicza-11'),
  siteId:'sternicza-11',gardenProgram:'spa-pool-grove',screeningTrees:[],
  hedgeRear:4,hedgeLeft:4,hedgeRight:4,hedgeFront:4,hedgeFullPerimeter:true,hedgeInset:.5,
  gardenRaise:.5,bedRaise:0,raiseNewHedges:true,terraceDepth:4.2,floorHeight:1.2,
  canopyEnabled:false,canopyDepth:4.2,canopyHeight:2.7,canopyWidth:8.5,fasciaDepth:.3,
  removeGarage:true,jacuzziOverflow:false,includeHighFeatures:false,eyeHeight:undefined,
  b9HeightDelta:0,b9DistanceDelta:0,b15HeightDelta:0,b15DistanceDelta:0,
  b29HeightDelta:0,b29DistanceDelta:0,b31HeightDelta:0,b31DistanceDelta:0,
  b53HeightDelta:0,b53DistanceDelta:0,
  treeLeafMode:'auto',sunDate:'2026-06-21',sunMinutes:720,
  costUsePlanningAllowances:false,costContingency:0,
  costScreeningPlanting:0,costScreeningAnchoring:0,costScreeningDelivery:0,
  costScreeningCrane:0,costScreeningEstablishment:0,
};
const positions=[[19.3,30.2],[13.8,35.8],[18.45,35.57]];
// Explicit heights, crown bases, widths and depths are the dated model inputs.
// Price/shape checks fail clearly if the live catalogue later changes meaning.
const specimens=[
  {id:'default',label:'Excelsa 9 m',typeId:'thuja-excelsa-9m',form:'cone',height:9,crownBase:.3,widths:[2,2,2],unitPLN:9500},
  {id:'reference-pines',label:'Original pictured pines 10 m',typeId:'austrian-pine-tall',form:'ellipsoid',height:10,crownBase:2.5,widths:[6,6,5],unitPLN:59900},
  {id:'white-fir-9m',label:'White fir 9 m',typeId:'white-fir-9m',form:'cone',height:9,crownBase:.4,widths:[4.5,4.5,4.5],unitPLN:22500},
  {id:'norway-spruce-9-10m',label:'Norway spruce 9–10 m',typeId:'norway-spruce-9-10m',form:'cone',height:9.5,crownBase:.4,widths:[3,3,3],unitPLN:13201},
  {id:'thuja-brabant-6-7m',label:'Brabant 6–7 m',typeId:'thuja-brabant-6-7m',form:'cone',height:6.5,crownBase:.3,widths:[1.5,1.5,1.5],unitPLN:2800},
  {id:'serbian-spruce-7m',label:'Serbian spruce 7 m',typeId:'serbian-spruce-7m',form:'cone',height:7,crownBase:.4,widths:[3,3,3],unitPLN:8300},
  {id:'austrian-pine-debruyn-8-9m',label:'De Bruyn pine 8–9 m',typeId:'austrian-pine-debruyn-8-9m',form:'ellipsoid',height:8.5,crownBase:2,widths:[3,3,3],unitPLN:26548.2},
  {id:'nordmann-fir-11m',label:'Nordmann fir 11 m',typeId:'nordmann-fir-11m',form:'cone',height:11,crownBase:.4,widths:[7,7,7],unitPLN:28000},
  {id:'hedges-only',label:'Hedges only',typeId:null,unitPLN:0},
];
const presets=['sofa','standing','terrace','jacuzzi','garden','sauna','firepit'];
const observers=presets.map(id=>({id,observer:observerForPreset(id,settings,data)}));
const pool=gardenProgram(settings,data).pool;
const treesFor=specimen=>specimen.typeId?positions.map(([x,y],index)=>({
  id:`tree-${index+1}`,typeId:specimen.typeId,x,y,height:specimen.height,crownBase:specimen.crownBase,
  crownWidth:specimen.widths[index],crownDepth:specimen.widths[index],rotation:0,enabled:true,unitPrice:0,
})):[];
const cases=specimens.map(specimen=>{
  const type=specimen.typeId?getTreeType(specimen.typeId):null;
  if(specimen.typeId&&(!type||type.form!==specimen.form||Math.abs(type.pricePLN-specimen.unitPLN)>1e-6))
    throw new Error(`Catalogue changed for ${specimen.typeId}; review this dated study before rerunning.`);
  const trees=treesFor(specimen),actual={...settings,screeningTrees:trees};
  const budget=estimateScreeningTreeCosts(actual),volumes=screeningTreeVolumes(actual,data);
  if(budget.plantQuoteCount||Math.abs(budget.plantsKnown.low-specimen.unitPLN*trees.length)>1e-6)
    throw new Error(`Price reference no longer supports the frozen ${specimen.id} dimensions.`);
  if(trees.length&&budget.total!==null)throw new Error('Unquoted installation must remain separate from the plant subtotal.');
  const results=observers.map(({id,observer})=>{
    const facade=analyzeFacadeVisibility(observer,targetId,actual,data,{spacing});
    if(facade.status!=='ok')throw new Error(`Facade check unavailable for ${specimen.id}/${id}.`);
    const roof=analyzeVisibility(observer,actual,data).rays.filter(ray=>ray.blockId===targetId&&ray.kind==='roof');
    const roofVisible=roof.filter(ray=>ray.visible).length;
    return {view:id,facade:{visible:facade.visible,total:facade.total,hidden:facade.total-facade.visible,
      hiddenPercent:100*(1-facade.visible/facade.total)},
      roof:{visible:roofVisible,total:roof.length,hidden:roof.length-roofVisible,
        hiddenPercent:roof.length?100*(1-roofVisible/roof.length):null}};
  });
  return {id:specimen.id,label:specimen.label,typeId:specimen.typeId,trees,results,
    price:{plantSubtotalPLN:budget.plantsKnown.low,unitPLN:specimen.unitPLN,
      taxBasis:type?.taxBasis||'not-applicable',taxNote:type?.taxNote||'No added specimen-tree cost; existing hedge cost is unchanged.',
      sourceUrl:type?.sourceUrl||null,sourceTitle:type?.sourceTitle||null,priceNote:type?.priceNote||null,
      sourcePriceEUR:type?.sourcePriceEUR||null,exchangeRatePLNPerEUR:type?.exchangeRatePLNPerEUR||null,
      installationQuoted:false,installedTotalPLN:null},
    assumptions:type?{form:type.form,stock:type.stock,stockNote:type.stockNote,dimensionNote:type.dimensionNote,
      suitabilityNote:type.suitabilityNote,foliage:type.seasonNote}:null,
    placement:volumes.map(volume=>({id:volume.id,plantable:volume.plantable,crownInside:volume.crownInside,
      groundZ:volume.groundZ,crownBottomZ:volume.crownBottomZ,crownTopZ:volume.crownTopZ,
      boundaryCentreDistance:closestBoundary([[volume.x,volume.y]],data).distance,
      trunkToPoolCoping:closestFootprints([[volume.x,volume.y]],rectCorners(pool,pool.coping)).distance,
      warnings:volume.warnings})),
  };
});
const control=cases.find(item=>item.id==='hedges-only');
for(const item of cases)for(const result of item.results){
  const baseline=control.results.find(other=>other.view===result.view);
  if(result.facade.total!==baseline.facade.total||result.roof.total!==baseline.roof.total)
    throw new Error(`Target sample denominators changed between cases at ${result.view}.`);
  result.facade.extraHiddenOverHedges=result.facade.hidden-baseline.facade.hidden;
  result.roof.extraHiddenOverHedges=result.roof.hidden-baseline.roof.hidden;
}
const output={analysisDate:'2026-11-14',baselineSchema:18,site:'sternicza-11',target:{id:targetId,label:'PCK3'},
  sourceDataSha256:createHash('sha256').update(source).digest('hex'),settings,positions,pool,observers,
  method:{facadeSpacingM:spacing,views:'The seven original preset eyes, resolved once before any species changes. Each preset keeps its own eye height.',
    facade:'Dense wall-only 0.25 m grid; back-facing and self-hidden samples excluded. Full opaque analytic crown volumes and existing mapped blockers.',
    roof:'Original target roof samples, reported separately from dense facade samples.',
    comparison:'Three specimens at identical reference coordinates, fixed pool, hedges, levels and buildings. No growth, position optimisation or one-year height uplift.',
    budget:'Plant-only catalogue references. VAT bases remain distinct; EUR uses the fixed 4.30 PLN/EUR planning assumption. Installation is unquoted.'},
  limitations:['Sample fractions are not facade area and do not establish complete concealment between tested rays or from other viewpoints.',
    'Conical and ellipsoidal envelopes are fully opaque in the model. Real branch gaps, asymmetric crowns and establishment changes are not simulated.',
    'Full crown volumes outside the parcel are credited. Crown overhang and the model\'s trunk-placement check are not planting, excavation or neighbour-consent approval.',
    'Catalogued individual specimens do not establish stock for three matching trees. Actual foliage profiles, root balls, lifting access and final installed prices require confirmation.'],
  cases};
const json=JSON.stringify(output,null,2)+'\n';
if(process.argv[2]){const file=resolve(process.argv[2]);writeFileSync(file,json);console.log(`Wrote ${file}`);}
else process.stdout.write(json);
