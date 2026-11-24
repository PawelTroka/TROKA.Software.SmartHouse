import {closestBoundary} from './dimensions.js?v=1.31.1';
import {footprintFit, overlapArea} from './footprint-fit.js?v=1.31.1';
import {gardenProgram} from './garden-program.js?v=1.31.1';
import {garageLayout} from './garage-ramp.js?v=1.31.1';
import {gardenGroundAt, jacuzziBounds, privacyStructures, spaLevels, terraceCover, terraceGroundReference, terrainAt} from './geometry.js?v=1.31.1';
import {rectCorners, terraceStairs} from './layout.js?v=1.31.1';

const boxRing = b => [[b.x0,b.y0],[b.x1,b.y0],[b.x1,b.y1],[b.x0,b.y1]];
const areaLabel = v => v < .01 ? 'less than 0.01 m²' : `${v.toFixed(2)} m²`;
const evidence = 'Proposed finished footprints compared with mapped site geometry.';
const order = {conflict:0, verify:1, info:2};

function siteFeatures(settings, data, program, stairs, tub, cover, structures) {
  const site=data.site, deck={...site.terrace,length:settings.terraceDepth??site.terrace.depth};
  const feature=(id,label,rings) => ({id,label,rings});
  const items=[feature('terrace','Terrace deck',[rectCorners(deck)])];
  if(stairs.count)items.push(feature('stairs','Terrace steps',[rectCorners(stairs)]));
  if(program.pool)items.push(feature('pool','Pool coping',[rectCorners(program.pool,program.pool.coping)]));
  if(program.active){
    const {sauna,firepit,coldPlunge}=program;
    items.push(feature('sauna','Sauna and entrance steps',[sauna.footprint,...(sauna.entrySteps||[]).map(s=>s.footprint)]),
      feature('lounge','Sunken lounge',[firepit.outerFootprint||firepit.footprint]),
      feature('plunge','Cold-plunge pad and steps',[rectCorners(coldPlunge,coldPlunge.pad),...coldPlunge.steps.map(s=>rectCorners(s))]));
  }
  const posts=(cover.supports||[]).map(boxRing);
  if(posts.length)items.push(feature('cover-posts',cover.type==='balcony'?'Balcony columns':'Canopy posts',posts));
  for(const [group,label] of [['pergola','Pergola posts'],['spa-screen','Spa screen posts and panels']]){
    const rings=structures.boxes.filter(b=>b.group===group&&(b.part==='post'||b.part==='screen')).map(boxRing);
    if(rings.length)items.push(feature(group,label,rings));
  }
  items.push(feature('tub','Jacuzzi shell',[boxRing(tub)]));
  return items;
}

// A deck carries the tub and may carry posts. The terrace intentionally joins
// the rear house wall, including threshold bridges over a stepped facade.
function intendedContact(a,b){
  const either=(first,second)=>(a===first&&b===second)||(a===second&&b===first);
  return either('terrace','house')||either('terrace','tub')||either('terrace','cover-posts')||
    either('terrace','spa-screen')||either('terrace','pergola');
}

function largestOverlap(first,second) {
  let largest=0;
  for(const a of first)for(const b of second)largest=Math.max(largest,overlapArea(a,b));
  return largest;
}

export function evaluateDesignChecks(settings,data) {
  const checks=[];
  const add=(id,severity,title,detail,action,basis=evidence)=>checks.push({id,severity,title,detail,action,evidence:basis});
  const site=data.site, siteId=site.id||settings.siteId||'sternicza-11';
  const program=gardenProgram(settings,data),tub=jacuzziBounds(settings,data),ref=terraceGroundReference(settings,data);
  const depth=settings.terraceDepth??site.terrace.depth,stairs=terraceStairs(site.terrace,depth,ref.drop,settings,data);
  const cover=terraceCover(settings,data),structures=privacyStructures(settings,data);
  const items=siteFeatures(settings,data,program,stairs,tub,cover,structures);
  const boundaryItems=[...items];
  if(site.terrace.thresholdDepth>0){
    boundaryItems.push({id:'threshold',label:'Threshold connector',rings:[rectCorners({...site.terrace,y:site.terrace.y-site.terrace.thresholdDepth,length:site.terrace.thresholdDepth})]});
  }
  if(cover.enabled)boundaryItems.push({id:'cover',label:cover.type==='balcony'?'Balcony structure':'Canopy structure',rings:cover.boxes.map(boxRing)});
  if(structures.enabled)boundaryItems.push({id:'privacy-frame',label:'Privacy structure',rings:structures.boxes.map(boxRing)});
  const garage=settings.basementGarageEnabled?garageLayout(settings,data,{terrainAt}):null;
  if(garage?.enabled)boundaryItems.push({id:'ramp',label:'Ramp retaining walls',rings:[garage.outerFootprint]});
  let closestBoundaryResult=null;
  for(const item of boundaryItems){
    const fits=item.rings.map(r=>footprintFit(r,site.boundary));
    const worst=fits.reduce((a,b)=>a.outsideM2>b.outsideM2?a:b);
    if(worst.location!=='inside'){
      const relation=worst.location==='outside'?'lies wholly outside':'crosses';
      add(item.id+'-boundary','conflict',item.label+' extends outside the parcel',
        `A finished footprint ${relation} the mapped boundary. Its area outside is ${areaLabel(worst.outsideM2)}.`,
        'Inspect the footprint in Plan and revise its position or size.');
      continue;
    }
    // The garage ramp deliberately begins on the frontage. Compare the
    // nearest freestanding garden feature separately from this intended join.
    if(item.id==='ramp')continue;
    for(const ring of item.rings){
      const distanceM=closestBoundary(ring,data)?.distance;
      if(Number.isFinite(distanceM)&&(!closestBoundaryResult||distanceM<closestBoundaryResult.distanceM)){
        closestBoundaryResult={label:item.label,distanceM};
      }
    }
  }

  const obstacles=[...items,{id:'house',label:'Mapped house',rings:[site.house.footprint]}];
  if(settings.removeGarage===false&&site.garage)obstacles.push({id:'garage',label:'Retained detached garage',rings:[site.garage.footprint]});
  for(let i=0;i<items.length;i++)for(let j=i+1;j<obstacles.length;j++){
    const a=items[i],b=obstacles[j];
    if(intendedContact(a.id,b.id))continue;
    const overlap=largestOverlap(a.rings,b.rings);
    if(overlap>1e-7)add(a.id+'-'+b.id,'conflict',a.label+' overlaps '+b.label.toLowerCase(),
      `The overlapping plan area of the two components is ${areaLabel(overlap)}.`,
      'Inspect the two outlines in Plan and revise the layout.');
  }

  const deck=items.find(f=>f.id==='terrace').rings[0],tubFit=footprintFit(boxRing(tub),deck);
  if(tubFit.location!=='inside')add('tub-deck','conflict','Jacuzzi extends beyond its host deck',
    `${areaLabel(tubFit.outsideM2)} of the tub shell projects beyond the terrace.`,'Increase the terrace depth or revise the tub position.');
  if(tub.serviceAccess){
    const service=boxRing(tub.serviceAccess);
    const intrusions=items.filter(item=>['cover-posts','spa-screen','pergola'].includes(item.id)&&largestOverlap(item.rings,[service])>1e-7);
    if(intrusions.length)add('spa-service','conflict','Jacuzzi service access is obstructed',
      `The proposed ${tub.serviceAccess.clearance.toFixed(2)} m maintenance zone overlaps ${intrusions.map(i=>i.label.toLowerCase()).join(', ')}.`,
      'Revise the support positions or detail removable access with the spa supplier.');
  }
  if(stairs.count){
    const lastTreadZ=ref.groundZ+stairs.drop/stairs.count, y=stairs.y+stairs.length;
    const rises=Array.from({length:9},(_,i)=>lastTreadZ-gardenGroundAt(stairs.x+i*stairs.width/8,y,settings,data));
    const low=Math.min(...rises),high=Math.max(...rises);
    if(low<0||high>.18+1e-7)add('stair-foot-grade','verify','Ground varies at the foot of the terrace steps',
      `The final tread is ${Math.round(low*1000)}–${Math.round(high*1000)} mm above sampled ground across the stair width. The stair layout targets rises up to 180 mm.`,
      'Survey the landing across its width and set its finished level before choosing the riser count.', 'Nine samples on the final riser edge, interpolated from the terrain grid plus selected garden fill.');
  }

  if(cover.relocatedSupport){
    add('canopy-support','verify','Design the offset canopy support',
      `The post clears the jacuzzi service band. The proposed front beam extends ${cover.relocatedSupport.extensionM.toFixed(2)} m beyond the roof edge to reach it.`,
      'Have the beam, connections and foundation sized for this support arrangement.', 'Proposed support position, existing ground model and finite beam extension.');
  }
  if(garage?.assessment){
    const bayFit=footprintFit(garage.roomFootprint,site.house.footprint);
    if(bayFit.location!=='inside')add('garage-house','conflict','Basement bay extends beyond the mapped house',
      `${areaLabel(bayFit.outsideM2)} of the proposed room and retaining walls lies beyond the mapped house outline.`,
      'Recheck the bay width and depth against a measured basement plan.', 'Proposed garage envelope compared with the mapped above-ground footprint.');
    const recorded=garage.documentedInterior;
    if(recorded?.conflicts?.length)add('garage-existing-structure','conflict','Two-car approach crosses the documented existing structure',
      'The basement drawing places retained stair / chimney elements in the straight route. Two parking spaces remain shown, but the approach is obstructed.',
      'Compare the original and proposed basement in Interiors; resolve the structural route before relying on the car clearance result.', 'Historical basement plan IMG_8721.jpeg, approximately registered to the mapped house.');
    if(recorded?.additionalLowering>0)add('garage-cellar-lowering','verify','Garage needs a lower floor than the documented cellar',
      `The section shows 1.70 m clear height and a floor at −2.00 m. This proposal puts the floor another ${recorded.additionalLowering.toFixed(2)} m lower.`,
      'Survey the foundations and slab before designing excavation, underpinning or drainage.', 'Historical section IMG_8724.jpeg; proposed garage dimensions.');
    const a=garage.assessment,mm=v=>Math.round(v*1000);
    const failures=[];
    if(!a.clearancePass)failures.push('underbody reserve');
    if(!a.gradeWithinLimit)failures.push('peak gradient');
    if(!a.parkingFits||!a.parkingWidthPass)failures.push('parking length or width');
    if(!a.structuralHeadroomPass||!a.doorBenchmarkPass||a.minimumOverheadClearance<a.requiredMargin+a.numericalAllowance)failures.push('overhead space');
    if(!a.widthBenchmarkPass)failures.push('approach width');
    if(garage.drop<=0)failures.push('basement floor level');
    add('garage-drive',a.passes?'verify':'conflict',a.passes?'Garage clearance depends on the site survey':'Garage misses a modeled clearance or fit check',
      `The full forward and reverse drives leave ${mm(a.conservativeClearance)} mm guarded underside clearance against ${mm(a.requiredMargin)} mm selected reserve.${failures.length?' Check '+failures.join(', ')+'.':''}`,
      'Inspect the ramp profile, then measure the street turn, threshold, drain, open scissor doors and existing structure.', 'Closed Cyberster, straight quasi-static drive, laden clearance and selected ramp profile.');
  }
  if(site.advertisedArea&&Math.abs(site.advertisedArea-site.area)>.01){
    add('parcel-record','verify','Mapped and advertised plot areas differ',
      `Mapped parcel ${site.area.toFixed(2)} m², advert ${site.advertisedArea} m². Difference ${(site.advertisedArea-site.area).toFixed(2)} m².${site.priorManualOutlineArea?' The earlier manual outline was '+site.priorManualOutlineArea+' m².':''}`,
      'Check the parcels included in the title and sale documents before sizing the garden.', 'ULDK parcel geometry and the property listing.');
  }
  if(siteId==='nadmorska-17')add('sewer-route','verify','Locate the ks200 sewer before placing the pool',
    'The utility map shows a sewer through the garden. Its line and depth are unavailable in the model coordinate frame.',
    'Locate the service on site and compare it with the pool excavation.', 'Recovered utility map, with no registered utility geometry in this dataset.');
  if(closestBoundaryResult)add('nearest-boundary','info','Nearest finished footprint to the parcel',
    `The minimum gap between the ${closestBoundaryResult.label.toLowerCase()} and the mapped edge is ${closestBoundaryResult.distanceM.toFixed(2)} m.`,
    'Inspect the parcel in Plan and verify the boundary on site.', garage?.enabled?'Shortest horizontal distance among contained garden features. The ramp intentionally meets the frontage.':'Shortest horizontal distance from contained garden features to all mapped parcel segments.');
  if(program.pool){
    const levels=spaLevels(settings,data).pool;
    const nearFlush=levels.freeboard<.04;
    add('pool-level',nearFlush?'verify':'info','Pool waterline and coping levels',
      `Sampled ground varies by ${(levels.gradeHighZ-levels.gradeLowZ).toFixed(2)} m. Level water stands ${(levels.copingTopZ-levels.waterZ).toFixed(2)} m below the coping in this proposal.`,
      nearFlush?'Specify a high-water skimmer or overflow detail and verify its operating waterline.':'Choose the pool circulation system and survey the coping perimeter to set the finished levels.', 'Selected pool freeboard, independent of jacuzzi overflow. Coping follows proposed grade sampled at up to 0.25 m spacing.');
  }
  checks.sort((a,b)=>order[a.severity]-order[b.severity]);
  return {checks,conflictCount:checks.filter(c=>c.severity==='conflict').length,verifyCount:checks.filter(c=>c.severity==='verify').length,closestBoundary:closestBoundaryResult};
}
