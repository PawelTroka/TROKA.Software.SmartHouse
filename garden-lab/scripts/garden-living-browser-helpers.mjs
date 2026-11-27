import assert from 'node:assert/strict';

/** Acceptance through public controls, design downloads and the diagnostics
 * emitted by the actual drawn scene. No app state or private renderer hooks. */
export async function verifyGardenLiving({page,el,sceneVisible,style,shot,exportDesign,check,report,details,settledInfo,ready}){
  const timeout=120000,trees=s=>s.settings.screeningTrees.map(t=>[t.x,t.y]);
  const expectedTrees=[[18,35],[14,36],[18,28]];
  const sceneInfo=async()=>{
    const info=await settledInfo();
    for(const key of ['boundaryFence','gardenPaths','coldPlunge','gardenLighting'])info[key]=JSON.parse(info[key]);
    return info;
  };
  const gates=(info)=>Object.fromEntries(info.boundaryFence.gates.map(g=>[g.id,g.open]));
  const baseline=await exportDesign();assert.deepEqual(trees(baseline),expectedTrees);
  assert.equal(baseline.schemaVersion,33);assert.equal(baseline.settings.perimeterFenceEnabled,true);
  assert.equal(baseline.gardenLayout.pool.length,6.5);assert.equal(baseline.gardenLayout.pool.width,3.2);
  assert.equal(baseline.gardenLayout.pool.x,15.5);assert.equal(baseline.gardenLayout.pool.y,19.8);
  assert.equal(baseline.gardenLayout.sunbeds.length,2);
  await details();await style('warm-minimal');
  await el('[data-studio-moment="noon"]').first().click({timeout});
  await el('button[data-mode="orbit"]').click({timeout});await el('#reset-camera').click({timeout});
  const first=await sceneInfo();
  assert.equal(first.boundaryFence.enabled,true);assert.equal(first.boundaryFence.height,2.2);
  assert.equal(first.boundaryFence.styleId,'warm-minimal');assert.ok(first.boundaryFence.members>100);
  assert.ok(first.boundaryFence.meshes>0&&first.boundaryFence.meshes<=6);
  assert.equal(first.gardenPaths.fixtures,7);assert.equal(first.gardenPaths.connections.length,6);
  assert.deepEqual(first.gardenPaths.blockedRoutes,[]);assert.ok(first.gardenPaths.segments>=12);
  assert.equal(first.coldPlunge.sunken,true);assert.equal(first.coldPlunge.padTopZ,first.coldPlunge.rimZ);
  assert.ok(Math.abs(first.coldPlunge.rimZ-first.coldPlunge.waterZ-.08)<1e-8);
  assert.equal(first.gardenLighting.routeFixtures,7);assert.equal(first.gardenLighting.gateFixtures,2);
  assert.equal(first.gardenLighting.routeShadowMaps,0);assert.ok(first.gardenLighting.lights<=30);
  await shot('garden-living-day-overview','#scene-host canvas');
  check('The actual WebGL scene contains restored planting, the compact pool, a connected six-destination route, recessed plunge and a batched 2.2 m boundary');

  for(const sides of [2,3,1]){
    await el('#poolSunbedSides').selectOption(String(sides));
    const design=await exportDesign();assert.deepEqual(trees(design),expectedTrees);
    assert.equal(design.gardenLayout.sunbeds.length,sides+1);
    for(const bed of design.gardenLayout.sunbeds.slice(0,2))assert.ok(bed.length>bed.width,'Garden-side sunbeds run along the long pool edge');
    for(const bed of design.gardenLayout.sunbeds.slice(2))assert.ok(bed.width>bed.length,'End sunbeds run along the short pool edge');
  }
  await el('#summerPoolLayout').uncheck();assert.deepEqual(trees(await exportDesign()),expectedTrees);
  await el('#summerPoolLayout').check();assert.deepEqual(trees(await exportDesign()),expectedTrees);
  check('All three sunbed options keep their long axes parallel to the adjacent pool edge; layout switches leave the trees fixed');

  await el('#pedestrianGateOpen').uncheck();
  let info=await sceneInfo();assert.equal(gates(info)['front-pedestrian-opening'],false);assert.equal(gates(info)['front-vehicle-opening'],true);
  await el('#garageGateOpen').uncheck();info=await sceneInfo();
  assert.equal(gates(info)['front-pedestrian-opening'],false);assert.equal(gates(info)['front-vehicle-opening'],false);
  await el('[data-preset="front"]').click({timeout});await sceneVisible(timeout);
  await shot('front-gates-warm-minimal-closed','#scene-host canvas');
  const fenceStyles=[];
  for(const id of ['nordic-blackwood','bali-stone']){
    await style(id);info=await sceneInfo();const design=await exportDesign();
    assert.equal(info.boundaryFence.styleId,id);assert.equal(design.boundaryFence.style.id,id);
    assert.deepEqual(trees(design),expectedTrees);assert.equal(design.settings.pedestrianGateOpen,false);assert.equal(design.settings.garageGateOpen,false);
    fenceStyles.push({id,pattern:design.boundaryFence.style.pattern,material:design.boundaryFence.style.material});
    await shot('front-gates-'+id+'-closed','#scene-host canvas');
  }
  assert.equal(new Set(fenceStyles.map(s=>s.pattern)).size,2);
  await el('#perimeterFenceEnabled').uncheck();assert.equal((await sceneInfo()).boundaryFence.enabled,false);
  await el('#perimeterFenceEnabled').check();assert.equal((await sceneInfo()).boundaryFence.enabled,true);
  await el('#pedestrianGateOpen').check();
  await page.reload({waitUntil:'domcontentloaded'});await ready();
  const restored=await exportDesign();assert.deepEqual(trees(restored),expectedTrees);
  assert.equal(restored.settings.pedestrianGateOpen,true);assert.equal(restored.settings.garageGateOpen,false);
  assert.equal(restored.settings.designStyle,'bali-stone');
  check('Gate controls act independently, persist after reload, and follow the selected fence style without moving the planting');

  await style('warm-minimal');await details();
  await el('[data-preset="terrace"]').click({timeout});await el('[data-look-yaw="0"]').click({timeout});
  await el('[data-studio-moment="blue"]').first().click({timeout});await sceneVisible(timeout);
  await page.waitForFunction(()=>Number(document.querySelector('#viewport').dataset.nightActivation)>0,null,{timeout});
  info=await sceneInfo();assert.equal(info.gardenLighting.activeRouteLights,7);
  await shot('garden-living-blue-hour-paths','#scene-host canvas');
  check('Blue hour activates all seven real route downlights without adding route shadow maps');

  // Walk up to the plunge using the same observer and drag controls available
  // to the owner. A shallow downward look makes the flush rim and water clear.
  await el('[data-studio-moment="noon"]').first().click({timeout});
  const assumptions=el('#assumption-controls').locator('..');
  if(await assumptions.getAttribute('open')===null)await assumptions.locator(':scope > summary').click();
  for(const [id,value]of [['observerX',7.7],['observerY',33.6],['eyeHeight',1.25]]){
    await el('#'+id+'-value').fill(String(value));await el('#'+id+'-value').press('Enter');
  }
  await el('button[data-mode="eye"]').click({timeout});await el('[data-look-yaw="0"]').click({timeout});
  await sceneVisible(timeout);
  const bounds=await el('#scene-host canvas').boundingBox();
  await page.mouse.move(bounds.x+bounds.width*.52,bounds.y+bounds.height*.74);await page.mouse.down();
  await page.mouse.move(bounds.x+bounds.width*.52,bounds.y+bounds.height*.36,{steps:12});await page.mouse.up();
  await shot('garden-living-sunken-plunge','#scene-host canvas');
  const plungeView=await exportDesign();assert.equal(plungeView.settings.preset,'custom');
  assert.equal(plungeView.settings.observerX,7.7);assert.equal(plungeView.settings.observerY,33.6);

  await page.setViewportSize({width:390,height:844});await el('#boundary-fence-controls').scrollIntoViewIfNeeded({timeout});
  for(const id of ['perimeterFenceEnabled','pedestrianGateOpen','garageGateOpen']){
    const box=await el('#'+id).boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=390,id+' fits the mobile viewport');
  }
  await shot('garden-boundary-mobile-controls','#boundary-fence-controls');
  await page.setViewportSize({width:1280,height:900});
  report.gardenLiving={baselineTrees:expectedTrees,pool:baseline.gardenLayout.pool,fenceStyles,scene:first,night:info.gardenLighting,
    persistedGates:{pedestrian:restored.settings.pedestrianGateOpen,garage:restored.settings.garageGateOpen}};
  check('The recessed plunge is captured from its approach and all boundary controls fit a 390 px screen');
}
