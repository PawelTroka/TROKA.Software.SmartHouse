/**
 * Reproduce the 1.32 pavilion shell and ideal-envelope sightline comparison.
 * Run from garden-lab: node scripts/analyze-corner-pavilion.mjs [output.json]
 * The default output updates the retained 2026-11-24 study. Use a temporary
 * output path to compare a later model with that snapshot without replacing it.
 * Point-ray counts are not image-area percentages or a legal height envelope.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const outputPath=process.argv[2]
  ?resolve(process.argv[2])
  :resolve(root,'docs/source-evidence/corner-pavilion-2026-11-24/physical-pavilion-comparison.json');
const {DEFAULT_SETTINGS,observerForPreset,privacyStructures,analyzeVisibility}=await import(`${root}/src/geometry.js`);
const {getSiteProfile}=await import(`${root}/src/sites.js`);
const {applyPlanExterior}=await import(`${root}/src/plan-exterior.js`);
const {firstPrivacyIntersection}=await import(`${root}/src/privacy-structures.js`);
const {PAVILION_DEFAULTS,PAVILION_PLACEMENTS,pavilionRoofEnvelopeStudy}=await import(`${root}/src/corner-pavilion.js`);
const data=JSON.parse(fs.readFileSync(resolve(root,'data/site-data.json'),'utf8'));
data.existingVegetation=JSON.parse(fs.readFileSync(resolve(root,'data/sternicza-surrounding-nature.json'),'utf8'));
const target=data.buildings.find(b=>b.id==='building-9');
if(!target?.roofPoints?.length)throw new Error('The study requires the measured PCK3 building-9 roof returns.');
data.buildings=data.buildings.map(b=>b.id!==target.id&&b.kind==='target'?{...b,kind:'context'}:b);
const settingsBase={...DEFAULT_SETTINGS,...getSiteProfile('sternicza-11',data).defaults,...PAVILION_DEFAULTS,
  pavilionEnabled:true,terraceWidth:10.77,canopyWidth:10.77,terraceCoverType:'balcony',eyeHeight:undefined,
  existingVegetation:true,existingCanopyAnalysis:true,existingLeafMode:'summer'};
const round=(v,n=2)=>Number.isFinite(v)?Number(v.toFixed(n)):null;
const output={method:'Same alternative garden programme and same observer in both comparisons. Baseline suppresses only pavilion opaque boxes, not the pool/spa rearrangement. Actual pavilion shell includes blank rear/east walls, transparent front/west windows and ground door, opaque floor slabs/roof, entry steps. Existing trees use summer canopy envelopes; these are modeled screening assumptions. Percentages are unweighted point-ray counts, never projected image area or a whole-garden guarantee. Height datum is the lowest original ground corner; no height credit for proposed fill.',
  target:{id:target.id,roofPoints:target.roofPoints.length},proposals:[]};

for(const proposal of PAVILION_PLACEMENTS){
  const item={id:proposal.id,label:proposal.label,settings:proposal.settings,heights:[]};
  // All compared heights keep the same garden and eye. Cache separately for
  // each placement so a future placement-specific programme cannot reuse a
  // baseline belonging to the other alternative.
  const baselineCache=new Map();
  for(const height of [6.5,8,10,12]){
    const settings={...settingsBase,...proposal.settings,pavilionHeight:height};
    const registered=applyPlanExterior(data,settings);
    const layout=privacyStructures(settings,registered),p=layout.pavilion,views=[];
    for(const name of ['sofa','standing','terrace','garden','pool','jacuzzi','firepit']){
      const eye=observerForPreset(name,settings,registered),origin=[eye.x,eye.y,eye.z];
      let baseline=baselineCache.get(name);
      if(!baseline){
        baseline=analyzeVisibility(eye,settings,registered,{excludePavilion:true});
        baselineCache.set(name,baseline);
      }
      const after=analyzeVisibility(eye,settings,registered);
      const beforeRays=baseline.rays.filter(r=>r.blockId===target.id);
      const afterRays=after.rays.filter(r=>r.blockId===target.id);
      const beforeRoof=beforeRays.filter(r=>r.kind==='roof'),afterRoof=afterRays.filter(r=>r.kind==='roof');
      const envelope=pavilionRoofEnvelopeStudy(eye,target.roofPoints,p);
      views.push({view:name,eye:{x:round(eye.x),y:round(eye.y),z:round(eye.z)},
        sampleTotal:beforeRays.length,visibleBefore:beforeRays.filter(r=>r.visible).length,
        visibleAfter:afterRays.filter(r=>r.visible).length,
        additionalBlocked:afterRays.filter((r,i)=>!r.visible&&beforeRays[i].visible).length,
        roofTotal:beforeRoof.length,roofVisibleBefore:beforeRoof.filter(r=>r.visible).length,
        roofVisibleAfter:afterRoof.filter(r=>r.visible).length,
        shellRoofBlocked:target.roofPoints.filter(point=>firstPrivacyIntersection(origin,point,p.boxes)).length,
        roofEnvelope:{...envelope,requiredHeightForIntercepted:round(envelope.requiredHeightForIntercepted),
          requiredHeightForAll:round(envelope.requiredHeightForAll),planCoveragePercent:round(envelope.planCoveragePercent)}});
    }
    item.heights.push({height,originalBaseZ:round(p.baseZ),floorZ:round(p.floorZ),topZ:round(p.topZ),
      entry:p.entry,warnings:layout.warnings,views});
  }
  output.proposals.push(item);
  for(const h of item.heights){
    console.log(`${proposal.id} ${h.height} m: ${h.views.map(v=>`${v.view} ${v.visibleBefore}→${v.visibleAfter}`).join('; ')}`);
  }
}
fs.mkdirSync(dirname(outputPath),{recursive:true});
fs.writeFileSync(outputPath,`${JSON.stringify(output,null,2)}\n`);
