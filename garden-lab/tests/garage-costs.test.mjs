import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {COST_DEFAULTS,estimateCosts,estimateBasementGarageCosts} from '../src/costs.js';
import {renderBudget} from '../src/budget-view.js';
const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const base={...COST_DEFAULTS,siteId:'sternicza-11',costUsePlanningAllowances:true,gardenProgram:'classic',
  hedgeFront:0,hedgeRear:4,hedgeLeft:4,hedgeRight:4,floorHeight:1.2,terraceDepth:4.2,gardenRaise:.5,removeGarage:true,screeningTrees:[]};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6);
test('unquoted basement project stays incomplete with garden allowances on or off',()=>{
 for(const costUsePlanningAllowances of [true,false]){
  const before=estimateCosts({...base,costUsePlanningAllowances},data);
  const result=estimateCosts({...base,costUsePlanningAllowances,basementGarageEnabled:true},data);
  assert.equal(result.basementGarage.quoteOnly,true);assert.equal(result.basementGarage.planningEnabled,false);
  assert.equal(result.basementGarage.rows.length,1);assert.equal(result.basementGarage.rows[0].cost,null);
  assert.equal(result.status,'quote-required');assert.equal(result.total,null);
  assert.deepEqual(result.knownSubtotal,before.knownSubtotal);
 }
});
test('a full basement quote is counted once and disappears when switched off',()=>{
 const before=estimateCosts(base,data);
 const result=estimateCosts({...base,basementGarageEnabled:true,costBasementGarageQuote:300000},data);
 near(result.knownSubtotal.low-before.knownSubtotal.low,300000);
 near(result.knownSubtotal.high-before.knownSubtotal.high,360000);
 assert.deepEqual(result.garden,before.garden);assert.deepEqual(result.earthworks,before.earthworks);
 assert.deepEqual(estimateCosts({...base,costBasementGarageQuote:300000},data).knownSubtotal,before.knownSubtotal);
});
test('direct cost calculation clears a single-car quote when capacity must be upgraded',()=>{
 const settings={...base,basementGarageEnabled:true,garageSpaces:1,garageRampWidth:3.2,costBasementGarageQuote:300000};
 const direct=estimateBasementGarageCosts(settings,data);
 assert.equal(direct.status,'quote-required');assert.equal(direct.knownBase.low,0);
 assert.equal(estimateCosts(settings,data).basementGarage.status,'quote-required');
 assert.equal(settings.costBasementGarageQuote,300000,'The caller state remains immutable');
 assert.equal(estimateBasementGarageCosts({...settings,garageSpaces:2},data).knownBase.low,300000);
});
test('other sites and invalid quote values cannot acquire a free basement conversion',()=>{
 for(const id of ['nadmorska-17','korzeniowskiego-40']){
  assert.equal(estimateBasementGarageCosts({...base,siteId:id,basementGarageEnabled:true},data).enabled,false);
  assert.equal(estimateBasementGarageCosts({...base,basementGarageEnabled:true},{...data,site:{...data.site,id}}).enabled,false);
 }
 for(const costBasementGarageQuote of [-1,NaN,Infinity,'300000'])
  assert.equal(estimateBasementGarageCosts({...base,basementGarageEnabled:true,costBasementGarageQuote},data).status,'quote-required');
});
test('budget readout identifies the missing basement project quote',()=>{
 const settings={...base,basementGarageEnabled:true},cost=estimateCosts(settings,data),nodes=new Map();
 const element=()=>({textContent:'',innerHTML:'',dataset:{},classList:{toggle(){}}});
 const getElementById=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
 const panel=element(),previous=globalThis.document;globalThis.document={getElementById,querySelector:()=>panel};
 try{
  renderBudget(cost,settings,data);
  assert.match(nodes.get('cost-status').textContent,/basement garage and ramp need a complete project quote/i);
  assert.match(nodes.get('cost-detail-content').innerHTML,/Basement garage and ramp · separate project quote/);
  assert.equal(panel.dataset.basementGarageUnquotedCount,1);
 }finally{globalThis.document=previous;}
});
