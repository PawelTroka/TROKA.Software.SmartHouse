import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStateModel,STATE_VERSION} from '../src/state.js';
import {SITE_OPTIONS,getSiteProfile} from '../src/sites.js';
import {DESIGN_STYLES} from '../src/design-styles.js';
import {createDesignHistory} from '../src/design-history.js';
import {estimateStyleCosts,estimateCosts} from '../src/costs.js';
import {changePresentationSettings} from '../src/studio-state.js';

const models=SITE_OPTIONS.map(site=>{
  const data=JSON.parse(readFileSync(new URL('../'+site.dataPath,import.meta.url)));
  return {data,model:createStateModel(getSiteProfile(site.id,data))};
});

test('all style recipes, house scope and quality survive shared links on all three properties',()=>{
  assert.equal(STATE_VERSION,35);
  for(const {model} of models)for(const style of DESIGN_STYLES){
    const original=model.sanitizeState({...changePresentationSettings(model.DEFAULTS,{designStyle:style.id}),
      renderQuality:'eco',sceneMotion:true,costStyleUpgradeQuote:24900,poolFreeboard:.12});
    assert.deepEqual(model.decodeState(model.encodeState(original)),original);
    assert.deepEqual(model.migrateSavedState(original,STATE_VERSION),original);
  }
});

test('old links keep their design and adopt neutral presentation without a renovation premium',()=>{
  for(const {model} of models){
    const old=model.decodeState(`v=23&site=${model.DEFAULTS.siteId}&terraceDepth=3.8&hedgeRear=3&designStyle=party-club&sceneMotion=true&renderQuality=high`);
    assert.equal(old.terraceDepth,3.8);assert.equal(old.hedgeRear,3);
    assert.equal(old.designStyle,'current');assert.equal(old.styleHouseFinish,false);
    assert.equal(old.renderQuality,'auto');assert.equal(old.sceneMotion,false);
    assert.equal(old.costStyleUpgradeQuote,0);
    assert.equal(old.poolFreeboard,.02);assert.equal(model.DEFAULTS.poolFreeboard,.10);
    assert.equal(model.migrateSavedState({...model.DEFAULTS},23).poolFreeboard,.02);
    assert.equal(model.decodeState(`v=24&site=${model.DEFAULTS.siteId}`).poolFreeboard,.10);
    const corrupt=model.decodeState(`v=24&site=${model.DEFAULTS.siteId}&designStyle=%3Cscript%3E&renderQuality=unlimited&sceneMotion=yes`);
    assert.equal(corrupt.designStyle,'current');assert.equal(corrupt.renderQuality,'auto');assert.equal(corrupt.sceneMotion,false);
  }
});

test('a renovation quote is invalidated when its style or house scope changes, and undo restores it',()=>{
  const original={...models[0].model.DEFAULTS,designStyle:'organic-modern',styleHouseFinish:true,costStyleUpgradeQuote:20000};
  for(const patch of [{designStyle:'hidden-bali'},{styleHouseFinish:false},{designStyle:'current'}]){
    const history=createDesignHistory(original),changed=changePresentationSettings(original,patch);
    assert.equal(changed.costStyleUpgradeQuote,0);history.record(changed);
    assert.equal(history.undo(changed).costStyleUpgradeQuote,20000);
  }
  for(const patch of [{designStyle:'organic-modern'},{renderQuality:'eco'},{sceneMotion:true}])
    assert.equal(changePresentationSettings(original,patch).costStyleUpgradeQuote,20000);
});

test('choosing a style renovates the entire house, links the decks once, and Current restores the original layout',()=>{
  for(const {model} of models){
    const original={...model.DEFAULTS,costStyleUpgradeQuote:24000};
    for(const style of DESIGN_STYLES.filter(style=>style.id!=='current')){
      const selected=changePresentationSettings(original,{designStyle:style.id});
      assert.equal(selected.styleHouseFinish,true,style.id);
      assert.equal(selected.costStyleUpgradeQuote,0);
      for(const key of ['garageSpaces','garageRampWidth','basementGarageEnabled','screeningTrees'])assert.deepEqual(selected[key],original[key]);
      assert.equal(selected.interiorLayout,'renovation');assert.equal(selected.interiorStyle,'follow');
      if(original.siteId==='sternicza-11'){
        assert.equal(selected.terraceCoverType,'balcony');assert.equal(selected.canopyWidth,10.77);assert.equal(selected.canopyDepth,4);
        assert.equal(selected.planExteriorApplied,true);
        const edited={...selected,canopyWidth:7.5,canopyDepth:3};
        const restyled=changePresentationSettings(edited,{designStyle:style.id==='japandi'?'hidden-bali':'japandi'});
        assert.equal(restyled.canopyWidth,7.5);assert.equal(restyled.canopyDepth,3);
      }else for(const key of ['terraceDepth','canopyEnabled','terraceCoverType'])assert.equal(selected[key],original[key]);
      const gardenOnly=changePresentationSettings(selected,{styleHouseFinish:false});
      assert.equal(gardenOnly.styleHouseFinish,false);
      assert.equal(gardenOnly.designStyle,'current');assert.equal(gardenOnly.interiorLayout,'existing');
      assert.equal(changePresentationSettings(gardenOnly,{renderQuality:'eco'}).styleHouseFinish,false);
      const neutral=changePresentationSettings(selected,{designStyle:'current',styleHouseFinish:true});
      assert.equal(neutral.styleHouseFinish,false);
      assert.equal(neutral.designStyle,'current');
    }
    const optedOut={...original,designStyle:'hidden-bali',styleHouseFinish:false};
    assert.equal(changePresentationSettings(optedOut,{designStyle:'japandi'}).styleHouseFinish,true);
    assert.equal(changePresentationSettings(optedOut,{designStyle:'japandi',styleHouseFinish:false}).styleHouseFinish,false);
  }
});

test('undo stores independent designs while preserving current camera, local time and quality',()=>{
  const initial={...models[0].model.DEFAULTS},history=createDesignHistory(initial);
  const changed={...initial,designStyle:'hidden-bali',hedgeRear:5,screeningTrees:structuredClone(initial.screeningTrees)};
  history.record(changed);changed.screeningTrees[0].height=500;
  const live={...changed,preset:'pool',mode:'eye',lookYaw:34,sunMinutes:900,renderQuality:'eco',walkNavigation:'physical'};
  const restored=history.undo(live);
  assert.equal(restored.designStyle,'current');assert.equal(restored.hedgeRear,initial.hedgeRear);
  for(const key of ['preset','mode','lookYaw','sunMinutes','renderQuality','walkNavigation'])assert.equal(restored[key],live[key]);
  restored.screeningTrees[0].height=100;
  const redone=history.redo(live);
  assert.equal(redone.designStyle,'hidden-bali');assert.notEqual(redone.screeningTrees[0].height,500);
  assert.notEqual(history.undo(live).screeningTrees[0].height,100);
});

test('view changes do not erase redo; a new design branches and history has a hard bound',()=>{
  const initial={siteId:'sternicza-11',depth:4,mode:'orbit'},history=createDesignHistory(initial,{limit:3});
  for(let depth=5;depth<=10;depth++)history.record({...initial,depth});
  assert.equal(history.length,4);
  const undone=history.undo(initial);assert.equal(undone.depth,9);
  assert.equal(history.record({...undone,mode:'plan',sunMinutes:900,walkNavigation:'free'}),false);assert.equal(history.canRedo,true);
  history.record({...undone,depth:8.5});assert.equal(history.canRedo,false);assert.equal(history.length,4);
  assert.throws(()=>history.record({...initial,siteId:'nadmorska-17'}),/cross properties/);
});

test('styles never invent an installed premium or double-count base finishes',()=>{
  for(const {data,model} of models){
    const base=model.sanitizeState({...model.DEFAULTS,costUsePlanningAllowances:true,styleGardenLayout:false});
    const plain=estimateCosts(base,data);
    const themed=estimateCosts({...base,designStyle:'hidden-bali'},data);
    assert.equal(themed.style.status,'quote-required');assert.equal(themed.total,null);
    for(const group of ['hedges','earthworks','screeningTrees','spa','privacy','basementGarage','balcony'])
      assert.deepEqual(themed[group],plain[group],group+' keeps its quantities when style garden layout is disabled');
    const withoutLighting=result=>result.garden.rows.filter(row=>row.key!=='costGardenLighting');
    assert.deepEqual(withoutLighting(themed),withoutLighting(plain),'Existing non-lighting allowances are not silently repriced');
    const lightDelta=themed.garden.quantities.lightingFittings-plain.garden.quantities.lightingFittings;
    assert.ok(Math.abs(themed.knownSubtotal.low-plain.knownSubtotal.low-lightDelta*700)<1e-7);
    assert.ok(Math.abs(themed.knownSubtotal.high-plain.knownSubtotal.high-lightDelta*1500*(1+base.costContingency/100))<1e-7);
    const quoted=estimateCosts({...base,designStyle:'hidden-bali',costStyleUpgradeQuote:25000},data);
    assert.equal(quoted.style.knownBase.low,25000);
    assert.ok(Math.abs(quoted.knownSubtotal.low-themed.knownSubtotal.low-25000)<1e-7);
    assert.ok(Math.abs(quoted.knownSubtotal.high-themed.knownSubtotal.high-25000*(1+base.costContingency/100))<1e-7);
    assert.equal(estimateStyleCosts({...base,designStyle:'current',costStyleUpgradeQuote:25000}).knownBase.low,0);
    assert.equal(estimateStyleCosts({...base,designStyle:'japandi',styleHouseFinish:true}).houseFinishPreview,true);
  }
});
