import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStateModel,STATE_VERSION} from '../src/state.js';
import {getSiteProfile,resolveSiteId} from '../src/sites.js';
import {gardenProgram,poolBounds} from '../src/garden-program.js';
import {frontHedgeLayout,hedgeSegments,observerForPreset} from '../src/geometry.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const model=createStateModel(getSiteProfile('sternicza-11',data));
const oldCoordinates=[[13.3,34.5],[14.35,31],[18.1,34.5]];

test('fresh street screening shares its independent height, quote and street-facing viewpoint',()=>{
  assert.equal(STATE_VERSION,13);
  assert.equal(model.DEFAULTS.gardenProgram,'spa-screened');
  assert.equal(model.DEFAULTS.hedgeFront,4);
  assert.equal(model.DEFAULTS.linkedHedges,false);
  const design={...model.DEFAULTS,hedgeFront:3.2,costTreePriceFront:325,preset:'front',eyeHeight:1.65,lookYaw:180,mode:'eye'};
  assert.deepEqual(model.decodeState(model.encodeState(design)),design);
  assert.deepEqual(model.migrateSavedState(design,13),design);
  assert.equal(resolveSiteId('?site=korzeniowskiego-40',`#${model.encodeState(design)}`),'sternicza-11');
  const observer=observerForPreset('front',design,data);
  assert.equal(observer.defaultLookYaw,180);
  assert.ok(observer.y<data.site.frontSetback,'Street view is in the front garden');
  const edited=model.changeHedgeHeight(design,'hedgeFront',2.7);
  assert.equal(edited.hedgeFront,2.7);
  for(const key of ['hedgeRear','hedgeLeft','hedgeRight'])assert.equal(edited[key],design[key]);
  const linked=model.changeHedgeHeight({...design,linkedHedges:true},'hedgeLeft',3.4);
  for(const key of ['hedgeRear','hedgeLeft','hedgeRight','hedgeFront'])assert.equal(linked[key],3.4);
});

test('every published pre-v13 design keeps its original unplanted frontage',()=>{
  for(let version=1;version<=12;version++){
    const restored=model.decodeState(`v=${version}${version>=6?'&site=sternicza-11':''}`);
    assert.equal(restored.hedgeFront,0,`v${version}`);
    assert.equal(frontHedgeLayout(restored,data).length,0);
    assert.equal(hedgeSegments(restored,data).filter(h=>h.side==='front').length,0);
    const saved=model.migrateSavedState({siteId:'sternicza-11',hedgeLeft:3.1,costTreePriceLeft:370},version);
    assert.equal(saved.hedgeFront,0,`saved v${version}`);
  }
});

test('sparse v12 links preserve pool, trees, compact sauna and complete budget after the new default',()=>{
  for(const old of [model.decodeState('v=12&site=sternicza-11'),model.migrateSavedState({siteId:'sternicza-11'},12)]){
    assert.equal(old.gardenProgram,'spa-compact');
    assert.equal(old.hedgeFront,0);
    assert.equal(old.costUsePlanningAllowances,true);
    assert.equal(old.jacuzziOverflow,false);
    assert.equal(old.showDimensions,true);
    assert.deepEqual(old.screeningTrees.map(t=>[t.x,t.y]),oldCoordinates);
    const pool=poolBounds(old,data),program=gardenProgram(old,data);
    assert.deepEqual([pool.x,pool.y,pool.width,pool.length],[15.7,24.5,3.5,8]);
    assert.deepEqual([program.sauna.width,program.sauna.length],[3,2.4]);
    assert.deepEqual(model.decodeState(model.encodeState(old)),old);
  }
});

test('the new frontage does not leak into the other property or require planting when switched off',()=>{
  const otherData=JSON.parse(readFileSync(new URL('../data/korzeniowskiego-40.json',import.meta.url)));
  const other=createStateModel(getSiteProfile('korzeniowskiego-40',otherData));
  const sanitized=other.sanitizeState({hedgeFront:4,preset:'front',gardenProgram:'spa-screened'});
  assert.equal(sanitized.hedgeFront,0);assert.equal(sanitized.preset,'garden');assert.equal(sanitized.gardenProgram,'classic');
  assert.equal(other.changeHedgeHeight({...other.DEFAULTS,linkedHedges:true},'hedgeRear',5).hedgeFront,0);
  const noFront=model.sanitizeState({...model.DEFAULTS,hedgeFront:0});
  assert.equal(frontHedgeLayout(noFront,data).length,0);
  assert.equal(model.decodeState(model.encodeState(noFront)).hedgeFront,0);
});
