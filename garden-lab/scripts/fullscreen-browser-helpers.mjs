import assert from 'node:assert/strict';

const poseKeys=['walkPosition','walkAltitude','walkYaw','walkPitch','walkFov','walkFloor','walkNavigation','walkFloating'];
const inspect=(page,{target,surface})=>page.evaluate(({target,surface,poseKeys})=>{
  const node=document.querySelector(target),model=document.querySelector(surface),rect=node.getBoundingClientRect(),bounds=model.getBoundingClientRect();
  return {mode:document.body.dataset.modelFullscreen||null,target:document.body.dataset.fullscreenTarget||null,
    native:document.fullscreenElement===document.documentElement,viewport:{width:innerWidth,height:innerHeight},
    bounds:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},surface:{x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height},
    workspaceInert:document.querySelector('#workspace')?.inert,
    frames:Number(document.querySelector('#render-diagnostics')?.dataset.frames)||0,
    pose:Object.fromEntries(poseKeys.filter(key=>key in model.dataset).map(key=>[key,model.dataset[key]])),
    focusInModel:node.contains(document.activeElement)};
},{target,surface,poseKeys});
const samePose=(before,after)=>{
  for(const [key,value] of Object.entries(before)){
    if(['walkAltitude','walkYaw','walkPitch'].includes(key))assert.ok(Math.abs(Number(after[key])-Number(value))<=.002,`${key} must not jump during fullscreen`);
    else assert.equal(after[key],value,`${key} must survive fullscreen`);
  }
};

// Call at an already-settled model checkpoint; the caller's existing readiness
// gate waits for the real renderer after each resize instead of using a sleep.
export async function checkFullscreenRoundtrip(page,{target='#viewer',button='#viewer-fullscreen',surface='#scene-host canvas',settle=async()=>{},onExpanded=async()=>{},timeout=120000,expectedMode}={}){
  const before=await inspect(page,{target,surface}),model=await page.locator(surface).elementHandle();
  await page.locator(button).click({timeout});
  await page.waitForFunction(({target})=>{
    const body=document.body,node=document.querySelector(target),rect=node?.getBoundingClientRect();
    return ['native','expanded'].includes(body.dataset.modelFullscreen)&&body.dataset.fullscreenTarget===node?.id&&body.dataset.fullscreenPending!=='true'&&body.dataset.fullscreenResizePending!=='true'&&
      Math.abs(rect.x)<=2&&Math.abs(rect.y)<=2&&Math.abs(rect.width-innerWidth)<=2&&Math.abs(rect.height-innerHeight)<=2;
  },{target},{timeout});
  await settle({afterFrame:before.frames});
  const expanded=await inspect(page,{target,surface});
  if(expectedMode)assert.equal(expanded.mode,expectedMode);
  assert.equal(expanded.native,expanded.mode==='native');
  assert.equal(await page.locator(button).getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator(button).getAttribute('aria-label'),'Exit fullscreen');
  assert.equal(await model.evaluate((node,selector)=>node.isConnected&&node===document.querySelector(selector),surface),true,'Fullscreen retains the same model element');
  assert.ok(expanded.surface.width>100&&expanded.surface.height>80,'Fullscreen retains a usable drawing area');
  assert.ok(expanded.surface.x>=-2&&expanded.surface.y>=-2&&expanded.surface.x+expanded.surface.width<=expanded.viewport.width+2&&expanded.surface.y+expanded.surface.height<=expanded.viewport.height+2,'Model fits inside the fullscreen viewport');
  assert.equal(expanded.workspaceInert,before.workspaceInert,'Fullscreen must not change independent workspace ownership');
  samePose(before.pose,expanded.pose);
  await onExpanded(expanded);
  const beforeExitFrame=await page.locator('#render-diagnostics').getAttribute('data-frames');
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!document.body.dataset.modelFullscreen&&!document.fullscreenElement&&document.body.dataset.fullscreenResizePending!=='true',undefined,{timeout});
  await settle({afterFrame:Number(beforeExitFrame)});
  const restored=await inspect(page,{target,surface});
  assert.equal(await page.locator(button).getAttribute('aria-pressed'),'false');
  assert.equal(restored.workspaceInert,before.workspaceInert);
  assert.equal(await model.evaluate((node,selector)=>node.isConnected&&node===document.querySelector(selector),surface),true);
  for(const key of ['width','height'])assert.ok(Math.abs(restored.surface[key]-before.surface[key])<=2,`Model ${key} restores after fullscreen`);
  samePose(before.pose,restored.pose);
  if(before.pose.walkPosition){
    assert.equal(await page.locator('#viewport').getAttribute('data-mode'),'walk','Escape exits fullscreen without leaving walking');
    assert.equal(await model.evaluate(node=>document.activeElement===node),true,'Walking keyboard focus is restored');
  }
  await model.dispose();
  return {before,expanded,restored};
}

// Exercise the unsupported-API branch in the same loaded model, without another
// style sweep, renderer startup or permanent change to the browser environment.
export async function checkFullscreenFallback(page,options={}){
  await page.evaluate(()=>{
    if(Object.hasOwn(document.documentElement,'requestFullscreen'))throw new Error('Fullscreen test needs the unmodified inherited native API');
    Object.defineProperty(document.documentElement,'requestFullscreen',{configurable:true,value:undefined});
  });
  try{return await checkFullscreenRoundtrip(page,{...options,expectedMode:'expanded'});}
  finally{await page.evaluate(()=>delete document.documentElement.requestFullscreen);}
}

export async function checkFullscreenHandoff(page,{fromButton,nextTarget,action,settle=async()=>{},timeout=120000}){
  await page.locator(fromButton).click({timeout});
  await page.waitForFunction(()=>Boolean(document.body.dataset.modelFullscreen)&&document.body.dataset.fullscreenPending!=='true'&&document.body.dataset.fullscreenResizePending!=='true',undefined,{timeout});
  const before=await page.evaluate(()=>({mode:document.body.dataset.modelFullscreen,native:document.fullscreenElement===document.documentElement}));
  await action();
  await page.waitForFunction(target=>document.body.dataset.fullscreenTarget===document.querySelector(target)?.id&&document.body.dataset.fullscreenResizePending!=='true',nextTarget,{timeout});
  await settle();
  const after=await page.evaluate(()=>({mode:document.body.dataset.modelFullscreen,native:document.fullscreenElement===document.documentElement}));
  assert.deepEqual(after,before,'Switching between interiors and walking retains the fullscreen session');
  assert.equal(await page.locator(`${nextTarget} .model-fullscreen-button`).getAttribute('aria-pressed'),'true');
  const beforeExitFrame=await page.locator('#render-diagnostics').getAttribute('data-frames');
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!document.body.dataset.modelFullscreen&&!document.fullscreenElement&&document.body.dataset.fullscreenResizePending!=='true',undefined,{timeout});
  await settle({afterFrame:Number(beforeExitFrame)});
  return {before,after};
}
