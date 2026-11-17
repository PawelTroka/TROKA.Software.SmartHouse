import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {COST_DEFAULTS,estimateCosts,estimatePrivacyCosts} from '../src/costs.js';
import {renderBudget} from '../src/budget-view.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const base={...COST_DEFAULTS,gardenProgram:'spa-compact',costUsePlanningAllowances:true,
  hedgeRear:4,hedgeLeft:4,hedgeRight:4,terraceDepth:4.2,floorHeight:1.2,
  gardenRaise:.5,bedRaise:0,removeGarage:true,canopyEnabled:true,canopyWidth:8,canopyDepth:3,
  costGardenCanopy:48000,costContingency:20,screeningTrees:[],
  privacyPergolaEnabled:false,spaScreensEnabled:false};
const both={...base,privacyPergolaEnabled:true,spaScreensEnabled:true};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('retained privacy quotes do not change the budget while the structures are off',()=>{
  const before=estimateCosts(base,data);
  const after=estimateCosts({...base,costPrivacyPergolaQuote:36000,costSpaScreenQuote:14000},data);
  assert.ok(before.total);
  assert.deepEqual(after.total,before.total);
  assert.equal(after.privacy.enabled,false);
  assert.deepEqual(after.privacy.rows,[]);
  assert.deepEqual(after.privacy.knownBase,{low:0,high:0});
});

test('unquoted custom structures remain excluded and incomplete with planning allowances on or off',()=>{
  for(const costUsePlanningAllowances of [true,false]){
    const settings={...both,costUsePlanningAllowances};
    const before=estimateCosts({...settings,privacyPergolaEnabled:false,spaScreensEnabled:false},data);
    const cost=estimateCosts(settings,data);
    assert.equal(cost.status,'quote-required');
    assert.equal(cost.total,null);
    assert.deepEqual(cost.knownSubtotal,before.knownSubtotal);
    assert.equal(cost.privacy.unquoted.length,2);
    assert.ok(cost.privacy.rows.every(row=>row.cost===null&&row.priceStatus==='quote-required'));
    assert.equal(cost.privacy.planningEnabled,false);
    assert.match(cost.notes.join(' '),/zero means unquoted and excluded from the known subtotal/);
  }
});

test('received privacy quotes enter once and preserve the separate terrace-canopy price',()=>{
  const before=estimateCosts(base,data);
  const partial=estimateCosts({...both,costPrivacyPergolaQuote:36000},data);
  assert.equal(partial.total,null);
  assert.equal(partial.privacy.unquoted.length,1);
  near(partial.knownSubtotal.low-before.knownSubtotal.low,36000);
  near(partial.knownSubtotal.high-before.knownSubtotal.high,36000*1.2);
  const complete=estimateCosts({...both,costPrivacyPergolaQuote:36000,costSpaScreenQuote:14000},data);
  assert.equal(complete.status,'estimate');
  assert.ok(complete.total);
  assert.deepEqual(complete.privacy.knownBase,{low:50000,high:50000});
  near(complete.total.low-before.total.low,50000);
  near(complete.total.high-before.total.high,50000*1.2);
  assert.deepEqual(complete.garden,before.garden);
  const canopy=complete.garden.rows.filter(row=>row.key==='costGardenCanopy');
  assert.equal(canopy.length,1);
  assert.deepEqual(canopy[0].cost,{low:48000,high:48000});
  assert.ok(complete.privacy.rows.every(row=>row.priceStatus==='user-quote'));
});

test('turning one structure off removes only its quote and keeps the other selected cost',()=>{
  const settings={...both,costPrivacyPergolaQuote:36000,costSpaScreenQuote:14000};
  for(const [flag,key,expected] of [
    ['privacyPergolaEnabled','costSpaScreenQuote',14000],
    ['spaScreensEnabled','costPrivacyPergolaQuote',36000],
  ]){
    const privacy=estimatePrivacyCosts({...settings,[flag]:false},data);
    assert.deepEqual(privacy.rows.map(row=>row.key),[key]);
    assert.deepEqual(privacy.knownBase,{low:expected,high:expected});
    assert.equal(privacy.status,'estimate');
  }
});

test('invalid privacy prices stay unquoted and oversized prices use the supported cap',()=>{
  for(const quote of [-1,NaN,Infinity,'36000']){
    const privacy=estimatePrivacyCosts({...both,costPrivacyPergolaQuote:quote,costSpaScreenQuote:quote},data);
    assert.equal(privacy.status,'quote-required');
    assert.equal(privacy.unquoted.length,2);
    assert.deepEqual(privacy.knownBase,{low:0,high:0});
  }
  const capped=estimatePrivacyCosts({...both,costPrivacyPergolaQuote:3000000,costSpaScreenQuote:3000000},data);
  assert.deepEqual(capped.knownBase,{low:4000000,high:4000000});
});

test('Sternicza privacy options never add costs to another site',()=>{
  for(const id of ['korzeniowskiego-40','nadmorska-17']){
    const other={...data,site:{...data.site,id}};
    const privacy=estimatePrivacyCosts({...both,costPrivacyPergolaQuote:36000,costSpaScreenQuote:14000},other);
    assert.equal(privacy.enabled,false);
    assert.equal(privacy.status,'none');
    assert.deepEqual(privacy.rows,[]);
    assert.deepEqual(privacy.knownBase,{low:0,high:0});
    assert.equal(estimatePrivacyCosts({...both,siteId:id},data).enabled,false);
  }
});

test('budget UI shows unknown privacy costs in the option section and expanded budget',()=>{
  const settings={...both,costPrivacyPergolaQuote:36000};
  const cost=estimateCosts(settings,data),nodes=new Map();
  const element=()=>({textContent:'',innerHTML:'',dataset:{},classList:{toggle(){}}});
  const getElementById=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  const panel=element(),previous=globalThis.document;
  globalThis.document={getElementById,querySelector:()=>panel};
  try{
    renderBudget(cost,settings,data);
    assert.match(nodes.get('privacy-cost-summary').textContent,/1 privacy structure needs an installed quote/);
    assert.match(nodes.get('privacy-cost-summary').textContent,/Unquoted work is excluded/);
    assert.match(nodes.get('cost-status').textContent,/incomplete subtotal/);
    assert.match(nodes.get('cost-status').textContent,/Planning allowances do not price these custom structures/);
    assert.match(nodes.get('cost-detail-content').innerHTML,/Privacy structures · installed quotes/);
    assert.match(nodes.get('cost-detail-content').innerHTML,/Garden pergola · full installed price/);
    assert.match(nodes.get('cost-detail-content').innerHTML,/Spa side screens · full installed price/);
    assert.match(nodes.get('cost-detail-content').innerHTML,/Quote needed/);
    assert.equal(panel.dataset.privacyKnownLow,36000);
    assert.equal(panel.dataset.privacyUnquotedCount,1);
    renderBudget(estimateCosts(base,data),base,data);
    assert.match(nodes.get('privacy-cost-summary').textContent,/only while the corresponding structure is selected/);
    assert.doesNotMatch(nodes.get('cost-detail-content').innerHTML,/Privacy structures · installed quotes/);
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
