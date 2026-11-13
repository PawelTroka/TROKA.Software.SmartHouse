import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {COST_DEFAULTS, estimateCosts, estimateGardenCosts, estimateSpaCosts} from '../src/costs.js';
import {GARDEN_PRICE_REFERENCES, GARDEN_PLANNING_RATES} from '../src/garden-budget-catalog.js';
import {getTreeType} from '../src/tree-catalog.js';
import {renderBudget} from '../src/budget-view.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const base={...COST_DEFAULTS,gardenProgram:'spa-compact',costUsePlanningAllowances:true,
  hedgeRear:4,hedgeLeft:4,hedgeRight:4,terraceDepth:4.2,floorHeight:1.2,
  gardenRaise:.5,bedRaise:0,removeGarage:true,canopyEnabled:false,costContingency:20,
  screeningTrees:Array.from({length:3},(_,i)=>({id:`pine-${i}`,typeId:'austrian-pine-tall',
    ...getTreeType('austrian-pine-tall').dimensions,x:15+i,y:34,enabled:true,unitPrice:0}))};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('planning mode produces an itemised whole rear-garden subtotal and applies contingency once',()=>{
  const cost=estimateCosts(base,data),withoutContingency=estimateCosts({...base,costContingency:0},data);
  assert.equal(cost.status,'estimate');assert.ok(cost.total);
  assert.equal(cost.spa.rows.length,5);assert.equal(cost.garden.rows.length,10);
  assert.equal(cost.screeningTrees.unquotedServices.length,0);
  assert.equal(cost.screeningTrees.plantsKnown.low,3*59900);
  const branches=[cost.hedges.baseTotal,cost.earthworks.baseTotal,cost.screeningTrees.knownBase,cost.spa.knownBase,cost.garden.knownBase];
  near(cost.total.low,branches.reduce((sum,r)=>sum+r.low,0));
  near(cost.total.high,branches.reduce((sum,r)=>sum+r.high,0)*1.2);
  near(cost.total.low,withoutContingency.total.low);near(cost.total.high,withoutContingency.total.high*1.2);
  for(const row of [...cost.spa.rows,...cost.garden.rows]){
    assert.equal(row.priceStatus,'planning-allowance');assert.ok(row.cost.high>=row.cost.low);
    assert.ok(row.basis.length);assert.ok(row.scope.length);assert.equal(row.quoted,false);
  }
});

test('manual installed quotes replace complete lines, with catalog prices never added a second time',()=>{
  const old=estimateCosts(base,data);
  const settings={...base,costSpaJacuzzi:83000,costGardenTerrace:52000,costScreeningDelivery:2500};
  const cost=estimateCosts(settings,data);
  const oldSpa=old.spa.rows.find(r=>r.key==='costSpaJacuzzi'),oldTerrace=old.garden.rows.find(r=>r.key==='costGardenTerrace');
  const oldDelivery=old.screeningTrees.serviceRows.find(r=>r.id==='delivery');
  near(cost.total.low-old.total.low,83000-oldSpa.cost.low+52000-oldTerrace.cost.low+2500-oldDelivery.cost.low);
  near(cost.total.high-old.total.high,(83000-oldSpa.cost.high+52000-oldTerrace.cost.high+2500-oldDelivery.cost.high)*1.2);
  assert.equal(cost.spa.rows.find(r=>r.key==='costSpaJacuzzi').priceStatus,'user-quote');
  assert.deepEqual(cost.spa.rows.find(r=>r.key==='costSpaJacuzzi').cost,{low:83000,high:83000});
});

test('custom overflow changes the full spa allowance and does not certify a factory conversion',()=>{
  const normal=estimateSpaCosts(base,data),overflow=estimateSpaCosts({...base,jacuzziOverflow:true},data);
  const normalRow=normal.rows.find(r=>r.key==='costSpaJacuzzi'),overflowRow=overflow.rows.find(r=>r.key==='costSpaJacuzzi');
  assert.deepEqual(normalRow.cost,{low:75000,high:105000});
  assert.deepEqual(overflowRow.cost,{low:105000,high:165000});
  near(overflow.knownBase.low-normal.knownBase.low,30000);
  near(overflow.knownBase.high-normal.knownBase.high,60000);
  assert.match(overflowRow.scope,/not a certified modification/);
  assert.equal(estimateSpaCosts({...base,gardenProgram:'spa-edge',jacuzziOverflow:false},data).overflow,true);
});

test('turning planning off requires quotes for compact garden scope and preserves historic scope',()=>{
  const compact=estimateCosts({...base,costUsePlanningAllowances:false},data);
  assert.equal(compact.total,null);assert.equal(compact.garden.unquoted.length,10);
  assert.equal(compact.spa.unquoted.length,5);assert.ok(compact.screeningTrees.unquotedServices.length);
  const legacy=estimateCosts({...base,gardenProgram:'spa-edge',costUsePlanningAllowances:false},data);
  assert.equal(legacy.garden.enabled,false);assert.deepEqual(legacy.garden.knownBase,{low:0,high:0});
});

test('planning services never invent prices for unsupported specimen or hedge sizes',()=>{
  const tree={...base.screeningTrees[0],height:15};
  assert.equal(estimateCosts({...base,screeningTrees:[tree]},data).total,null);
  assert.equal(estimateCosts({...base,hedgeRear:6},data).total,null);
});

test('finish quantities exclude jacuzzi, coping and stairs, while demolition and canopy follow selection',()=>{
  const garden=estimateGardenCosts(base,data),q=garden.quantities;
  near(q.terraceNet,data.site.terrace.width*4.2-2.3*2.3);
  assert.ok(q.additionalHardscape>0);assert.ok(q.garageArea>0);assert.equal(q.canopyArea,0);
  assert.ok(garden.rows.some(r=>r.key==='costGardenDemolition'));
  assert.ok(!garden.rows.some(r=>r.key==='costGardenCanopy'));
  const altered=estimateGardenCosts({...base,removeGarage:false,canopyEnabled:true,canopyWidth:8,canopyDepth:3,terraceDepth:5.2},data);
  assert.ok(!altered.rows.some(r=>r.key==='costGardenDemolition'));
  assert.ok(altered.rows.some(r=>r.key==='costGardenCanopy'));
  near(altered.quantities.canopyArea,24);
  near(altered.quantities.terraceNet-q.terraceNet,data.site.terrace.width);
});

test('published references and documented planning assumptions remain separate and reproducible',()=>{
  const sources=JSON.parse(readFileSync(new URL('../data/garden-budget-sources.json',import.meta.url)));
  assert.equal(sources.reviewedAt,'2026-11-13');
  assert.deepEqual(sources.sources,GARDEN_PRICE_REFERENCES);
  assert.deepEqual(sources.planningRates.rates,GARDEN_PLANNING_RATES);
  assert.equal(sources.sources.find(r=>r.id==='pool').low,78160);
  assert.match(sources.sources.find(r=>r.id==='fire').tax,/NET/);
  assert.ok(sources.sources.every(r=>r.status==='catalog-reference'&&r.url.startsWith('https://')));
});

test('budget UI exposes full ranges, scope and references without calling planning lines supplier quotes',()=>{
  const cost=estimateCosts(base,data),nodes=new Map();
  const element=()=>({textContent:'',innerHTML:'',dataset:{},classList:{toggle(){}}});
  const getElementById=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  const panel=element(),previous=globalThis.document;
  globalThis.document={getElementById,querySelector:()=>panel};
  try{
    renderBudget(cost,base,data);
    assert.equal(nodes.get('garden-cost-card').hidden,false);
    assert.match(nodes.get('garden-quantity').textContent,/10 garden-work lines/);
    assert.match(nodes.get('spa-cost-detail').innerHTML,/Planning allowance · not a supplier quote/);
    assert.match(nodes.get('garden-cost-detail').innerHTML,/Detached garage removal/);
    assert.match(nodes.get('spa-cost-detail').innerHTML,/https:\/\/www.wellispolska.pl/);
    assert.match(nodes.get('cost-status').textContent,/not received supplier quotes/);
    assert.equal(panel.dataset.planningEnabled,'true');
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
