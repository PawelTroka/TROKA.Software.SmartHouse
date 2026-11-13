import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStateModel} from '../src/state.js';
import {getSiteProfile} from '../src/sites.js';
import {estimateCosts,estimateSpaCosts,gardenQuantities} from '../src/costs.js';
import {renderBudget} from '../src/budget-view.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const korz=JSON.parse(readFileSync(new URL('../data/korzeniowskiego-40.json',import.meta.url)));
const model=createStateModel(getSiteProfile('sternicza-11',data));
const base={...model.DEFAULTS,gardenProgram:'spa',screeningTrees:[],costContingency:25,costUsePlanningAllowances:false};
// Arbitrary contractor quotes test accounting; these are not supplier estimates.
const quotes={costSpaPool:243000,costSpaJacuzzi:71600,costSpaSauna:85400,costSpaColdPlunge:22300,costSpaFirepit:52000};
const sumQuotes=Object.values(quotes).reduce((sum,value)=>sum+value,0);
const near=(a,b,eps=1e-7)=>assert.ok(Math.abs(a-b)<eps,`${a} ≠ ${b}`);

test('spa fill excludes the chamfered sauna, sunken lounge and cold plunge without changing the rear plot',()=>{
  const classic=gardenQuantities({...base,gardenProgram:'classic'},data);
  const spa=gardenQuantities(base,data);
  // Both programmes have a 3.5 × 8 m pool. The added foundations/excavations
  // occupy a 4.2 × 4.1 m sauna minus its triangular corner, a 4.4 m lounge,
  // and a 2.2 × 1.3 m plunge. The jacuzzi is already inside the terrace.
  const addedExclusions=4.2*4.1-1.8*1.8/2+4.4*4.4+2.2*1.3;
  near(addedExclusions,37.82);
  near(classic.automaticArea,338.6942927042236);
  near(spa.automaticArea,classic.automaticArea-addedExclusions);
  near(spa.excludedArea-classic.excludedArea,addedExclusions);
  near(spa.rearGrossArea,classic.rearGrossArea);
  near(spa.bedArea,classic.bedArea); // Hedge beds are clear of the added foundations.
  assert.deepEqual(gardenQuantities({...base,gardenProgram:'classic'},data),classic,'Switching programme must invalidate the shared geometry cache');
  assert.deepEqual(gardenQuantities(base,data),spa);
});

test('half-metre spa fill avoids filling the new excavations and keeps topsoil within the selected raise',()=>{
  const old=estimateCosts({...base,gardenProgram:'classic',gardenRaise:.5,bedRaise:0},data).earthworks;
  const spa=estimateCosts({...base,gardenRaise:.5,bedRaise:0,costTopsoilDepth:.15,costLooseFactor:1.2},data).earthworks;
  near(old.gardenVolume-spa.gardenVolume,18.91);
  near(spa.compactedVolume,spa.area*.5);
  near(spa.topsoilVolume,spa.area*.15);
  near(spa.bulkFillVolume,spa.area*.35);
  near(spa.topsoilVolume+spa.bulkFillVolume,spa.compactedVolume);
  near(spa.looseVolume,spa.compactedVolume*1.2);
  const override=estimateCosts({...base,costAreaOverride:100,gardenRaise:.5},data).earthworks;
  near(override.automaticArea,spa.automaticArea);
  near(override.gardenVolume,50);
});

test('zero spa allowances are five missing installed quotes, never a free or complete project',()=>{
  const e=estimateCosts(base,data);
  assert.equal(e.spa.enabled,true);assert.equal(e.spa.status,'quote-required');
  assert.equal(e.spa.rows.length,5);assert.equal(e.spa.unquoted.length,5);
  assert.equal(e.spa.total,null);assert.equal(e.total,null);assert.equal(e.status,'quote-required');
  assert.deepEqual(e.spa.knownBase,{low:0,high:0});
  near(e.knownSubtotal.low,e.hedges.knownSubtotal.low+e.earthworks.total.low);
  assert.ok(e.notes.some(note=>note.includes('Zero is not a free installation')));
});

test('all installed quotes add once to the existing garden budget and receive one upper contingency',()=>{
  const unquoted=estimateCosts(base,data);
  const settings={...base,...quotes,costPriceFactor:300};
  const quoted=estimateCosts(settings,data);
  const withoutSpa=estimateCosts({...settings,...Object.fromEntries(Object.keys(quotes).map(key=>[key,0]))},data);
  assert.equal(quoted.spa.status,'estimate');assert.equal(quoted.spa.unquoted.length,0);
  assert.equal(quoted.status,'estimate');assert.ok(quoted.total);
  near(quoted.spa.knownBase.low,sumQuotes);
  near(quoted.spa.total.low,sumQuotes);near(quoted.spa.total.high,sumQuotes*1.25);
  near(quoted.total.low-withoutSpa.knownSubtotal.low,sumQuotes);
  near(quoted.total.high-withoutSpa.knownSubtotal.high,sumQuotes*1.25);
  near(quoted.total.low,quoted.hedges.total.low+quoted.earthworks.total.low+quoted.spa.total.low);
  near(quoted.total.high,quoted.hedges.total.high+quoted.earthworks.total.high+quoted.spa.total.high);
  assert.equal(unquoted.total,null,'Calculating another scenario cannot mutate the unknown-price scenario');
  for(const row of quoted.spa.rows)assert.equal(row.amount,quotes[row.key],'Tree-price multipliers do not alter installed contractor quotes');
});

test('a missing installed quote leaves a visible incomplete subtotal while preserving every entered amount',()=>{
  const e=estimateCosts({...base,...quotes,costSpaSauna:0},data);
  assert.equal(e.total,null);assert.equal(e.spa.total,null);assert.equal(e.status,'quote-required');
  assert.deepEqual(e.spa.unquoted.map(row=>row.key),['costSpaSauna']);
  near(e.spa.knownSubtotal.low,sumQuotes-quotes.costSpaSauna);
  near(e.spa.knownSubtotal.high,(sumQuotes-quotes.costSpaSauna)*1.25);
  near(e.knownSubtotal.low,e.hedges.knownSubtotal.low+e.earthworks.total.low+e.spa.knownSubtotal.low);
});

test('a fully quoted spa-only project is an estimate even without hedge, tree or fill costs',()=>{
  const e=estimateCosts({...base,...quotes,hedgeRear:0,hedgeLeft:0,hedgeRight:0,gardenRaise:0,bedRaise:0},data);
  assert.equal(e.hedges.status,'none');assert.equal(e.earthworks.status,'none');assert.equal(e.screeningTrees.count,0);
  assert.equal(e.status,'estimate');
  near(e.total.low,sumQuotes);near(e.total.high,sumQuotes*1.25);
});

test('classic Sternicza and Korzeniowskiego budgets ignore inactive spa allowances',()=>{
  for(const [site,settings] of [[data,{...base,gardenProgram:'classic'}],[korz,{...base,siteId:'korzeniowskiego-40',gardenProgram:'spa'}]]){
    const withQuotes=estimateCosts({...settings,...quotes},site),withoutQuotes=estimateCosts(settings,site);
    assert.equal(withQuotes.spa.enabled,false);assert.equal(withQuotes.spa.status,'none');
    assert.deepEqual(withQuotes.spa.rows,[]);assert.deepEqual(withQuotes.spa.unquoted,[]);
    assert.deepEqual(withQuotes.spa.total,{low:0,high:0});
    assert.deepEqual(withQuotes.total,withoutQuotes.total);
    assert.deepEqual(withQuotes.earthworks,withoutQuotes.earthworks);
  }
  assert.equal(estimateSpaCosts({...base,gardenProgram:'classic'},data).status,'none');
});

test('budget presentation distinguishes entered spa allowances from missing quotes and the incomplete total',()=>{
  const settings={...base,costSpaSauna:85400};
  const cost=estimateCosts(settings,data),nodes=new Map();
  const element=()=>({textContent:'',innerHTML:'',dataset:{},classList:{toggle(){}}});
  const getElementById=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  const panel=element(),previous=globalThis.document;
  globalThis.document={getElementById,querySelector:()=>panel};
  try{
    renderBudget(cost,settings,data);
    assert.match(nodes.get('spa-cost').textContent,/\+ quotes$/);
    assert.equal(nodes.get('spa-quantity').textContent,'1 of 5 installed allowances entered');
    assert.equal(nodes.get('combined-cost').textContent,'Quote needed');
    assert.match(nodes.get('cost-status').textContent,/incomplete subtotal/);
    assert.match(nodes.get('spa-cost-detail').innerHTML,/Six-person sauna/);
    assert.equal((nodes.get('spa-cost-detail').innerHTML.match(/Quote needed/g)||[]).length,4);
    assert.equal(panel.dataset.status,'quote-required');assert.equal(panel.dataset.totalLow,'');
  }finally{
    if(previous===undefined)delete globalThis.document;else globalThis.document=previous;
  }
});
