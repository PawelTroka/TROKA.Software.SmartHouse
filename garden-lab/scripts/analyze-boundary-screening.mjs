/** Reproducible concept comparisons; not surveyed specimens or construction designs.
 * Run: node scripts/analyze-boundary-screening.mjs [output.json]
 * Without a filename, writes the full JSON to stdout.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {DEFAULTS} from '../src/state.js';
import {PICTURED_TREES} from '../src/reference-planting.js';
import {observerForPreset,analyzeVisibility,gardenGroundAt,terraceGroundReference,jacuzziBounds} from '../src/geometry.js';
import {analyzeFacadeVisibility} from '../src/facade-visibility.js';
import {screeningTreeVolumes,treeRayIntersection} from '../src/screening-trees.js';
import {closestFootprints,closestBoundary} from '../src/dimensions.js';
import {gardenProgram} from '../src/garden-program.js';
import {rectCorners,terraceStairs} from '../src/layout.js';

const source=readFileSync(new URL('../data/site-data.json',import.meta.url));
const data=JSON.parse(source);
// Freeze the historical pine study independently of the current species default.
const settings={...DEFAULTS,screeningTrees:PICTURED_TREES.map(tree=>({...tree})),gardenProgram:'spa-pool-grove',canopyEnabled:false,eyeHeight:undefined,
  hedgeRear:4,hedgeLeft:4,hedgeRight:4,hedgeFront:4,hedgeInset:.5,hedgeFullPerimeter:true,
  gardenRaise:.5,bedRaise:0,raiseNewHedges:true,includeHighFeatures:false};
const MIN_CLEARANCE=1.5,MIN_SPACING=2.8,EPS=1e-8;
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
const summarize=s=>views.map(view=>{
  const {facade,roof}=check(s,view),roofExposed=roof.filter(r=>r.visible).length;
  return {view:view.id,exposed:facade.visible,total:facade.total,hiddenPercent:100*(1-facade.visible/facade.total),
    roofExposed,roofTotal:roof.length,combinedExposed:facade.visible+roofExposed,
    combinedTotal:facade.total+roof.length};
});

// The baseline includes the 4 m perimeter hedge and fixed buildings, but no
// specimen trees. Required height is measured at the ray's hedge-line crossing
// above the NEW planting soil, because raiseNewHedges=true and bedRaise=0.
const unscreened=views.map(view=>({...view,...check({...settings,screeningTrees:[]},view)}));
const witness=ray=>ray?{target:ray.target,kind:ray.kind,crossing:[ray.screen.x,ray.screen.y,ray.screen.z],
  requiredHeight:ray.screen.requiredHeight,requiredExposedHeight:ray.screen.requiredExposedHeight,
  referenceGroundZ:ray.screen.referenceGroundZ,originalGroundZ:ray.screen.originalGroundZ,
  proposedGroundZ:ray.screen.groundZ,side:ray.screen.side}:null;
const maxRay=rays=>rays.reduce((best,r)=>!best||r.screen.requiredHeight>best.screen.requiredHeight?r:best,null);
const range=(rays,key)=>rays.length?[Math.min(...rays.map(r=>r.screen[key])),Math.max(...rays.map(r=>r.screen[key]))]:null;
const boundary=unscreened.map(view=>{
  const visible=[...view.facade.rays,...view.roof].filter(r=>r.visible),exposed=visible.filter(r=>r.screen);
  const left=exposed.filter(r=>r.screen.side==='left'),rear=exposed.filter(r=>r.screen.side==='rear');
  return {view:view.id,observer:view.observer,unblockedRays:visible.length,
    withoutHedgeLineIntersection:visible.filter(r=>!r.screen).length,
    otherHedgeSides:exposed.filter(r=>!['left','rear'].includes(r.screen.side)).length,
    leftRequired:maxRay(left)?.screen.requiredHeight||0,rearRequired:maxRay(rear)?.screen.requiredHeight||0,
    eastExitY:range(left,'y'),rearExitX:range(rear,'x'),leftCritical:witness(maxRay(left)),rearCritical:witness(maxRay(rear))};
});

// Finished envelopes, including all modelled external steps, pads and coping.
// Movable furniture and stepping stones are also kept clear so a technically
// plantable trunk cannot occupy the intended route or a lounger/dining place.
const program=gardenProgram(settings,data),hardscape=[];
const add=(id,footprint,kind='hardscape')=>{if(footprint?.length>=3)hardscape.push({id,kind,footprint});};
add('house',data.site.house.footprint);
if(settings.removeGarage===false)add('retained-garage',data.site.garage?.footprint);
add('pool-full-coping',rectCorners(program.pool,program.pool.coping));
const terrace={...data.site.terrace,depth:settings.terraceDepth};
add('terrace',rectCorners(terrace));
if(terrace.thresholdDepth)add('terrace-threshold',rectCorners({...terrace,y:terrace.y-terrace.thresholdDepth,depth:terrace.thresholdDepth}));
const terraceSteps=terraceStairs(terrace,settings.terraceDepth,terraceGroundReference(settings,data).drop,settings,data);
if(terraceSteps.count)add('terrace-stairs',rectCorners(terraceSteps));
const jacuzzi=jacuzziBounds(settings,data);
if(jacuzzi){
  add('jacuzzi-rim',rectCorners({x:jacuzzi.x0,y:jacuzzi.y0,width:jacuzzi.width,length:jacuzzi.length}));
  const service=jacuzzi.serviceAccess;
  if(service)add('jacuzzi-service-access',rectCorners({x:service.x0,y:service.y0,width:service.x1-service.x0,length:service.y1-service.y0}),'reserved-access');
}
add('sauna-wall',program.sauna.footprint);
(program.sauna.entrySteps||[]).forEach((step,i)=>add(`sauna-entry-step-${i+1}`,step.footprint));
add('fire-lounge-outer-coping',program.firepit.outerFootprint||program.firepit.footprint);
program.firepit.steps.forEach((step,i)=>add(`fire-lounge-step-${i+1}`,rectCorners(step)));
add('cold-plunge-pad',rectCorners(program.coldPlunge,program.coldPlunge.pad??.18));
program.coldPlunge.steps.forEach((step,i)=>add(`cold-plunge-step-${i+1}`,rectCorners(step)));
if(program.furniture.dining)add('dining-platform',rectCorners(program.furniture.dining));
program.furniture.loungers.forEach(([x,y],i)=>add(`lounger-${i+1}`,rectCorners({x,y,width:.78,length:2}),'movable-furniture'));
program.furniture.path.forEach(([x,y],i)=>add(`stepping-stone-${i+1}`,rectCorners({x,y,width:1.15,length:.9})));

const placement=tree=>{
  const point=[[tree.x,tree.y]],volume=screeningTreeVolumes({...settings,screeningTrees:[tree]},data)[0];
  const distances=hardscape.map(item=>({id:item.id,kind:item.kind,distance:closestFootprints(point,item.footprint).distance}));
  const nearest=distances.reduce((best,item)=>item.distance<best.distance?item:best);
  const boundaryGap=closestBoundary(point,data).distance;
  return {plantable:Boolean(volume?.plantable),boundaryClearance:boundaryGap,
    minimumHardscapeCentreDistance:nearest.distance,nearestGroundEnvelope:nearest.id,
    accepted:Boolean(volume?.plantable)&&boundaryGap+EPS>=MIN_CLEARANCE&&nearest.distance+EPS>=MIN_CLEARANCE,
    allEnvelopeClearances:distances,crownInside:Boolean(volume?.crownInside),warnings:volume?.warnings||[]};
};
const spacing=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const current=views.map(view=>({...view,...check(settings,view)}));
const rays=current.map(view=>[...view.facade.rays,...view.roof].filter(r=>r.visible));
const candidates=[],candidatePositions=[];
// Additional trees are confined to TWO strips. Existing pictured pines are
// retained, even where their earlier concept clearances are under this study's
// 1.5 m rule; every NEW candidate must pass the stricter complete-envelope check.
for(let x=17;x<=18.8+EPS;x+=.3)for(let y=20.5;y<=26+EPS;y+=.3)candidatePositions.push({x,y,strip:'east-before-pool'});
for(let x=9.8;x<=18.8+EPS;x+=.3)for(let y=35.2;y<=36.5+EPS;y+=.3)candidatePositions.push({x,y,strip:'rear'});
const rejected={groundOrBoundary:0,referenceTreeSpacing:0};
for(const pos of candidatePositions){
  const tree={...reference[0],id:'edge-extra',x:Number(pos.x.toFixed(2)),y:Number(pos.y.toFixed(2))};
  const clearances=placement(tree);
  if(!clearances.accepted){rejected.groundOrBoundary++;continue;}
  if(reference.some(t=>spacing(t,tree)+EPS<MIN_SPACING)){rejected.referenceTreeSpacing++;continue;}
  const volume=screeningTreeVolumes({...settings,screeningTrees:[tree]},data)[0];
  candidates.push({tree,strip:pos.strip,clearances,
    hits:rays.map(rs=>rs.map(ray=>Boolean(treeRayIntersection(ray.origin,ray.target,volume))))});
}
function score(items){
  const fractions=rays.map((rs,i)=>rs.filter((_,j)=>!items.some(item=>item.hits[i][j])).length/(current[i].facade.total+current[i].roof.length));
  return {worstRemainingFraction:Math.max(...fractions),sumRemainingFractions:fractions.reduce((a,b)=>a+b,0)};
}
const compare=(a,b)=>Math.abs(a.worstRemainingFraction-b.worstRemainingFraction)>1e-12
  ?a.worstRemainingFraction-b.worstRemainingFraction:a.sumRemainingFractions-b.sumRemainingFractions;
candidates.forEach(candidate=>{candidate.score=score([candidate]);});
candidates.sort((a,b)=>compare(a.score,b.score));
const bestOne=candidates[0];let bestPair=null,pairScore=null;
for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){
  const a=candidates[i],b=candidates[j];if(spacing(a.tree,b.tree)+EPS<MIN_SPACING)continue;
  const next=score([a,b]);if(!pairScore||compare(next,pairScore)<0){pairScore=next;bestPair=[a,b];}
}

const cases=[];
const addCase=(id,state,note,extra={})=>cases.push({id,state,note,...extra});
addCase('reference',settings,'Pictured three 10 m Austrian pines; 6 / 6 / 5 m opaque ellipsoidal crowns. Existing reference positions are not re-approved by this stricter planting-clearance study.');
addCase('reference-plus-terrace-roof',{...settings,canopyEnabled:true},'Finite terrace canopy at the existing height/depth; local eye-position test, not a whole-garden screen.');
addCase('reference-plus-roof-0.6m-fascia',{...settings,canopyEnabled:true,fasciaDepth:.6},'Finite terrace canopy with 0.6 m fascia; structural feasibility and daylight tradeoff not assessed.');
for(const height of [11,12])addCase(`reference-height-${height}m-only`,{...settings,screeningTrees:reference.map(t=>({...t,height}))},
  'Height-only sensitivity with the pictured 6 / 6 / 5 m crown diameters and 2.5 m crown base. No matching specimen or installed quotation is assumed.');
for(const width of [7,8])for(const height of [10,11])addCase(`same-positions-${height}m-by-${width}m-crowns`,
  {...settings,screeningTrees:reference.map(t=>({...t,height,crownWidth:width,crownDepth:width}))},
  width===7?'All three crowns use the upper 7 m end of a researched 10–11 m tall / 6–7 m diameter supplier size band. Circular, fully opaque ellipsoids and 2.5 m clear stems are modelling assumptions; actual crown profiles and boundary overhang need confirmation.'
    :'Explicitly hypothetical 8 m crown sensitivity. This is outside the currently verified supplier size band and is not advertised as available stock.',
  {stockBasis:width===7?'supplier-band-upper-bound':'hypothetical-not-verified-stock'});
const candidateDescription=item=>({x:item.tree.x,y:item.tree.y,strip:item.strip,clearances:item.clearances});
if(bestOne)addCase('reference-plus-one-east-or-rear-strip-pine',
  {...settings,screeningTrees:[...reference,{...bestOne.tree,id:'edge-extra-1'}]},
  'Best single extra 10 m pine from the bounded east-before-pool / rear-strip grid; all new trunk-to-envelope/boundary gaps ≥1.5 m and existing trunk spacing ≥2.8 m.',
  {addedTrees:[candidateDescription(bestOne)],searchScore:bestOne.score});
if(bestPair)addCase('reference-plus-two-east-and-rear-strip-pines',
  {...settings,screeningTrees:[...reference,...bestPair.map((c,i)=>({...c.tree,id:`edge-extra-${i+1}`}))]},
  'Best compatible pair from the same two-strip search. Broad crowns may overhang boundaries or hardscape despite clear trunk/root-ball concept space.',
  {addedTrees:bestPair.map(candidateDescription),searchScore:pairScore});

// Targeted hybrids keep the three pictured centres and the open central lawn.
// The extra trunk is the already-checked best rear-strip point, not a new search.
const bestRear=candidates.find(candidate=>candidate.strip==='rear');
if(bestRear){
  const hybrid={...settings,screeningTrees:[...reference.map(tree=>({...tree,height:11,crownWidth:7,crownDepth:7})),
    {...bestRear.tree,id:'hybrid-rear-extra'}]};
  const note='Three pictured centres with hypothetical fully opaque 11 m × 7 m ellipsoidal pine crowns, plus the best checked rear-strip extra pine at 10 m × 6 m. The broad size band has a supplier lead; actual crown shape, branch density, clear stem, root balls, transport, installed cost and boundary overhang are unconfirmed. Centre clearances do not certify the larger specimens.';
  addCase('hybrid-11m-by-7m-reference-pines-plus-rear-extra',hybrid,note,
    {stockBasis:'supplier-band-upper-bound-plus-current-pine-size',addedTrees:[candidateDescription(bestRear)]});
  addCase('hybrid-11m-by-7m-reference-pines-plus-rear-extra-and-canopy',
    {...hybrid,canopyEnabled:true,fasciaDepth:.6},note+' Adds the finite terrace canopy with 0.6 m fascia; no structural, consent or daylight assessment.',
    {stockBasis:'supplier-band-upper-bound-plus-current-pine-size',addedTrees:[candidateDescription(bestRear)]});
}

const idealHeight=13.2;
addCase('ideal-continuous-left-and-rear-screen-13.2m',
  {...settings,screeningTrees:[],hedgeLeft:idealHeight,hedgeRear:idealHeight},
  'HYPOTHETICAL OPTICAL ENVELOPE: continuous opaque surfaces on the left/east and rear hedge lines, 13.2 m above local new planting soil, with no specimen trees. It verifies the ray-height inference. It is not a plant shape, purchasable hedge, consented structure or construction proposal.',
  {idealized:true,screenHeightAboveNewSoil:idealHeight});

// One illustrative discontinuous L, not an optimiser or a species simulation.
// The pool leaves no root-ball-sized strip beside its east coping, so the row
// occupies only the soil before the pool and behind it. Cone tips taper to zero.
const conePositions=[[18.5,21.3],[18.5,24.2],[12.8,36.25],[15.65,36.25],[18.5,36.25]];
const coneTrees=conePositions.map(([x,y],i)=>({...reference[0],id:`schematic-conifer-${i+1}`,typeId:'serbian-spruce',
  x,y,height:13,crownBase:.3,crownWidth:3.5,crownDepth:3.5,unitPrice:0}));
const coneClearances=coneTrees.map(tree=>({id:tree.id,x:tree.x,y:tree.y,...placement(tree)}));
const coneSpacing=Math.min(...coneTrees.flatMap((tree,i)=>coneTrees.slice(i+1).map(other=>spacing(tree,other))));
const coneAccepted=coneClearances.every(item=>item.accepted)&&coneSpacing+EPS>=MIN_SPACING;
if(coneAccepted)addCase('schematic-13m-by-3.5m-conifer-discontinuous-boundary-row',
  {...settings,screeningTrees:coneTrees},
  'Five schematic opaque right-conical crowns replace all three pictured pines, with the existing 4 m perimeter hedge below. Uses the engine\'s Serbian-spruce cone only as a geometry primitive: it is not a botanical, price or availability model for Thuja plicata Excelsa. Full lower foliage beginning at 0.3 m is optimistic; upper crown width is unmeasured and real crowns have gaps. The east side beside the pool remains unplanted. Two rear crowns slightly overhang the parcel and/or coping, although the illustrative root-ball discs remain clear.',
  {schematic:true,clearances:coneClearances,minimumTreeSpacing:coneSpacing,
    maximumNominalCrownBoundaryOverhang:Math.max(0,...coneClearances.map(item=>1.75-item.boundaryClearance)),
    maximumNominalCrownGroundEnvelopeOverlap:Math.max(0,...coneClearances.map(item=>1.75-item.minimumHardscapeCentreDistance))});

const summaries=cases.map(({state,...item})=>({...item,
  trees:state.screeningTrees.map(t=>({x:t.x,y:t.y,height:t.height,width:t.crownWidth,depth:t.crownDepth,crownBase:t.crownBase})),
  canopy:state.canopyEnabled,fasciaDepth:state.fasciaDepth,
  hedgeHeights:{front:state.hedgeFront,left:state.hedgeLeft,right:state.hedgeRight,rear:state.hedgeRear},results:summarize(state)}));
const ideal=summaries.find(item=>item.idealized),requiredHeight=Math.max(...boundary.flatMap(item=>[item.leftRequired,item.rearRequired]));
const idealResidual=ideal.results.reduce((sum,view)=>sum+view.combinedExposed,0);
const output={analysisDate:'2026-11-14',site:'sternicza-11',target:'building-9',sourceDataSha256:createHash('sha256').update(source).digest('hex'),
  method:'Existing mapped geometry; 4 m full-perimeter hedge, 0.5 m inset, +0.5 m rear garden fill and no extra bed raise. Nine fixed viewpoints. Analytic opaque crown envelopes; dense 0.25 m facade grid and original roof samples kept separate. Additional trees searched only in east-before-pool and rear strips. Lexicographic ranking: worst remaining wall+roof sample fraction first, then sum of fractions. No real-foliage or all-viewpoint guarantee.',
  limitations:[
    'Sample percentages are fractions of tested points, not facade area or proof of complete concealment between samples. Only the nine listed eyes are tested; arbitrary garden positions, upstairs eyes and every possible roof point are not covered.',
    'A root-ball-sized horizontal disc is not an excavation, utilities, foundation, access, crane, drainage, stability or transplant feasibility check. All actual specimen/root-ball dimensions and works need supplier and project confirmation.',
    'Existing reference trees have approximately 1 m trunk-to-pool gaps and crown overhang; they are kept as the requested baseline and do not pass every new-tree clearance constraint.',
    'The ideal 13.2 m screen follows local proposed grade and has constant full opacity. Its small height margin is a numerical model result, not a tolerance suitable for procurement or construction.',
    'A 13 m conifer apex does not provide 13 m of continuous visual screening between trees. The schematic cone row cannot establish performance of an actual Excelsa specimen or hedge.',
  ],
  heightDatum:{raiseNewHedges:settings.raiseNewHedges,gardenRaise:settings.gardenRaise,bedRaise:settings.bedRaise,
    definition:'screen.requiredHeight = ray elevation at hedge-line crossing minus referenceGroundZ. Here referenceGroundZ is local original terrain + 0.5 m in the rear garden; it equals proposed hedge soil because raiseNewHedges=true. Front planting follows original terrain.',
    maximumRequiredAboveNewSoil:requiredHeight,idealScreenHeight:idealHeight,modelHeightMargin:idealHeight-requiredHeight,
    idealResidualSamples:idealResidual,idealCoversAllTestedSamples:idealResidual===0,
    unhandledBoundaryRays:boundary.reduce((sum,item)=>sum+item.withoutHedgeLineIntersection+item.otherHedgeSides,0)},
  researchedSizeLeads:[
    {label:'Austrian pine: researched 10–11 m height / 6–7 m crown diameter band',url:'https://www.von-falkenhayn.de/sortiment/detail/solitaerbaeume-von-pinus-nigra-ssp-nigra-oesterreichische-schwarzkiefer',
      use:'The 7 m sensitivity uses the upper listed width, but neither shape, clear stem nor full opacity is verified.'},
    {label:'Thuja plicata Excelsa: researched 12–13 m height / 3–3.5 m width / 2.7 m root-ball diameter / about 12 t lead',url:'https://www.von-falkenhayn.de/sortiment/detail/solitaerbaeume-von-thuja-plicata-excelsa-grosser-lebensbaum-2',
      use:'Dimensional/logistics lead only; actual stock, price, transport mass and crown profile require supplier confirmation. No width-at-upper-height measurement was supplied.'},
    {label:'Polish Nurserymen Association Excelsa description',url:'https://e-katalogroslin.pl/plants/7201,zywotnik-olbrzymi-excelsa_thuja-plicata-excelsa',
      use:'The research describes loose branching and sparse lower growth that densifies with age. The schematic fully opaque cone with foliage from 0.3 m is optimistic, not a validated botanical shape.'},
  ],
  boundary,hardscapeEnvelopes:hardscape,
  search:{strips:[{id:'east-before-pool',x:[17,18.8],y:[20.5,26]},{id:'rear',x:[9.8,18.8],y:[35.2,36.5]}],gridStep:.3,
    proposedGridCount:candidatePositions.length,candidateCount:candidates.length,rejected,
    minimumTrunkToAllGroundEnvelopesAndBoundary:MIN_CLEARANCE,minimumTreeSpacing:MIN_SPACING,
    rootBallIllustration:{diameter:2.7,radius:1.35,minimumNominalDiscEdgeToEnvelope:MIN_CLEARANCE-1.35,
      note:'Only 0.15 m nominal clearance beyond that root-ball radius; not adequate evidence of working/excavation clearance.'},
    poolEastCopingToBoundary:closestBoundary(rectCorners(program.pool,program.pool.coping),data,'left').distance,
    rowProposal:{included:coneAccepted,minimumTreeSpacing:coneSpacing,clearances:coneClearances}},
  cases:summaries};
const json=JSON.stringify(output,null,2)+'\n';
if(process.argv[2]){writeFileSync(resolve(process.argv[2]),json);console.log(JSON.stringify({output:resolve(process.argv[2]),candidates:candidates.length,cases:summaries.length,idealResidualSamples:idealResidual,schematicRowIncluded:coneAccepted}));}
else console.log(json);
