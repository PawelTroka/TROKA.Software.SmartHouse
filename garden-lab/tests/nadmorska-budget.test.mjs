import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStateModel} from '../src/state.js';
import {getSiteProfile} from '../src/sites.js';
import {estimateCosts,estimateSpaCosts} from '../src/costs.js';
import {budgetSideLabels,renderBudget} from '../src/budget-view.js';
import {GARDEN_PLANNING_RATES as RATES} from '../src/garden-budget-catalog.js';

const readSite=name=>JSON.parse(readFileSync(new URL('../data/'+name+'.json',import.meta.url)));
const data=readSite('nadmorska-17');
const model=createStateModel(getSiteProfile('nadmorska-17',data));
const settings={...model.DEFAULTS,costUsePlanningAllowances:true,canopyEnabled:false};
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-6,actual+' != '+expected);

test('Nadmorska prices its actual pool and compact jacuzzi without adding the Sternicza spa programme',()=>{
  const spa=estimateSpaCosts(settings,data);
  assert.equal(spa.enabled,true);
  assert.deepEqual(spa.rows.map(row=>row.key),['costSpaPool','costSpaJacuzzi']);
  assert.equal(spa.scopeId,'pool-and-jacuzzi');
  assert.equal(spa.overflow,false);
  assert.equal(spa.rows[0].priceStatus,'planning-allowance');
  assert.deepEqual(spa.rows[0].cost,{low:RATES.pool[0],high:RATES.pool[1]});
  assert.match(spa.rows[0].basis,new RegExp((data.site.pool.width*data.site.pool.length).toFixed(1).replace('.','\\.')+' m²'));
  assert.match(spa.rows[0].scope,/ks200/);
  assert.match(spa.rows[0].scope,/not a quotation or a price scaled/);
  assert.match(spa.rows[1].basis,/2\.20 × 2\.20 m/);
  assert.match(spa.rows[1].basis,/seating capacity unverified/);
  assert.deepEqual(spa.rows[1].cost,{low:RATES.jacuzzi[0],high:RATES.jacuzzi[1]});
  assert.ok(spa.rows.every(row=>!row.quoted));
});

test('Nadmorska quote overrides replace two complete installations and ignore absent spa objects',()=>{
  const base=estimateSpaCosts(settings,data);
  const quoted=estimateSpaCosts({...settings,costSpaPool:211000,costSpaJacuzzi:84000,
    costSpaSauna:999999,costSpaColdPlunge:999999,costSpaFirepit:999999,jacuzziOverflow:true},data);
  assert.equal(quoted.rows.length,2);
  assert.deepEqual(quoted.knownBase,{low:295000,high:295000});
  assert.ok(quoted.rows.every(row=>row.priceStatus==='user-quote'));
  close(quoted.total.high,295000*(1+settings.costContingency/100));
  const withUnused=estimateCosts({...settings,costSpaSauna:999999,costSpaColdPlunge:999999,costSpaFirepit:999999},data);
  assert.deepEqual(withUnused.total,estimateCosts(settings,data).total);
  assert.deepEqual(base.rows[0].cost,{low:RATES.pool[0],high:RATES.pool[1]});
});

test('changed pool dimensions keep the stated benchmark until an installed quote is entered',()=>{
  const changed=structuredClone(data);
  changed.site.pool.length+=2;
  const before=estimateSpaCosts(settings,data).rows[0],after=estimateSpaCosts(settings,changed).rows[0];
  assert.notEqual(before.basis,after.basis);
  assert.deepEqual(before.cost,after.cost);
  assert.match(after.scope,/price scaled/);
});

test('turning planning off leaves pool, jacuzzi and garden work as missing quotes',()=>{
  const cost=estimateCosts({...settings,costUsePlanningAllowances:false},data);
  assert.equal(cost.spa.status,'quote-required');
  assert.deepEqual(cost.spa.unquoted.map(row=>row.key),['costSpaPool','costSpaJacuzzi']);
  assert.equal(cost.garden.enabled,true);
  assert.ok(cost.garden.unquoted.length>0);
  assert.equal(cost.total,null);
  const justSpaQuotes=estimateCosts({...settings,costUsePlanningAllowances:false,costSpaPool:211000,costSpaJacuzzi:84000},data);
  assert.equal(justSpaQuotes.spa.status,'estimate');
  assert.equal(justSpaQuotes.garden.status,'quote-required');
  assert.equal(justSpaQuotes.total,null,'Unpriced terrace and finishes cannot become a complete total');
});

test('Nadmorska whole-garden total counts finishes and applies uncertainty once',()=>{
  const cost=estimateCosts(settings,data),q=cost.garden.quantities;
  assert.equal(cost.status,'estimate');
  assert.ok(cost.garden.enabled);
  assert.ok(cost.garden.rows.some(row=>row.key==='costGardenTerrace'));
  assert.ok(cost.garden.rows.some(row=>row.key==='costGardenLighting'));
  assert.ok(!cost.garden.rows.some(row=>row.key==='costGardenDemolition'));
  assert.ok(!cost.garden.rows.some(row=>row.key==='costGardenCanopy'));
  close(q.terraceNet,q.terraceGross-2.2*2.2);
  for(const [key,value] of Object.entries(q))assert.ok(Number.isFinite(value)&&value>=0,key);
  const branches=[cost.hedges.baseTotal,cost.earthworks.baseTotal,cost.screeningTrees.knownBase,cost.spa.knownBase,cost.garden.knownBase];
  close(cost.total.low,branches.reduce((sum,line)=>sum+line.low,0));
  close(cost.total.high,branches.reduce((sum,line)=>sum+line.high,0)*(1+settings.costContingency/100));
});

test('Nadmorska budget labels the neighbour edge and does not claim seven seats or absent spa features',()=>{
  const cost=estimateCosts(settings,data),nodes=new Map();
  const element=()=>({textContent:'',innerHTML:'',dataset:{},classList:{toggle(){}}});
  const getElementById=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  const panel=element(),previous=globalThis.document;
  globalThis.document={getElementById,querySelector:()=>panel};
  try{
    renderBudget(cost,settings,data);
    assert.equal(budgetSideLabels(data).front,data.site.edgeLabels.front);
    assert.match(nodes.get('spa-quantity').textContent,/2 installed items/);
    const spa=nodes.get('spa-cost-detail').innerHTML;
    assert.match(spa,/Pool and jacuzzi/);
    assert.match(spa,/seating capacity unverified/);
    assert.match(spa,/comparison product, different footprint/);
    assert.match(spa,/ks200/);
    assert.doesNotMatch(spa,/seven-seat|7-seat|six-person|sauna|plunge|sunken|fire lounge/i);
    assert.doesNotMatch(nodes.get('cost-detail-content').innerHTML,/Front \/ street|sauna|sunken lounge|cold plunge/i);
    assert.doesNotMatch(nodes.get('garden-cost-detail').innerHTML,/fire-lounge/);
    assert.equal(nodes.get('garden-cost-card').hidden,false);
    assert.match(nodes.get('cost-status').textContent,/not received supplier quotes/);
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

test('adding Nadmorska pool pricing preserves the existing property budget scopes',()=>{
  const stern=readSite('site-data'),korz=readSite('korzeniowskiego-40');
  const sternDefaults=createStateModel(getSiteProfile('sternicza-11',stern)).DEFAULTS;
  const korzDefaults=createStateModel(getSiteProfile('korzeniowskiego-40',korz)).DEFAULTS;
  assert.equal(estimateSpaCosts(sternDefaults,stern).rows.length,5);
  assert.equal(estimateSpaCosts({...sternDefaults,gardenProgram:'classic'},stern).enabled,false);
  assert.equal(estimateSpaCosts(korzDefaults,korz).enabled,false);
  assert.equal(estimateCosts(korzDefaults,korz).garden.enabled,false);
});
