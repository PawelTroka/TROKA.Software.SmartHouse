import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {COST_DEFAULTS,estimateCosts,gardenQuantities} from '../src/costs.js';
import {frontHedgeLayout} from '../src/geometry.js';
import {renderBudget} from '../src/budget-view.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const other=JSON.parse(readFileSync(new URL('../data/korzeniowskiego-40.json',import.meta.url)));
const base={...COST_DEFAULTS,gardenProgram:'spa-compact',costUsePlanningAllowances:true,
  hedgeRear:4,hedgeLeft:4,hedgeRight:4,hedgeFront:4,hedgeInset:.5,
  terraceDepth:4.2,floorHeight:1.2,gardenRaise:.5,bedRaise:0,
  removeGarage:true,canopyEnabled:false,screeningTrees:[],costContingency:20};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('front budget excludes the access openings and rounds each planted span independently',()=>{
  const layout=frontHedgeLayout(base,data),cost=estimateCosts(base,data),front=cost.hedges.sides.find(s=>s.side==='front');
  assert.ok(layout.segments.length>1);
  near(layout.openings.reduce((n,opening)=>n+opening.width,0),5.2);
  near(front.length,layout.length);
  assert.equal(front.count,layout.segments.reduce((n,segment)=>n+Math.ceil(Math.hypot(segment.b[0]-segment.a[0],segment.b[1]-segment.a[1])/.8),0));
  assert.equal(front.plants.low,front.count*300);
  assert.equal(front.planting,front.count*75);
  assert.equal(cost.hedges.lines.delivery,1000);
});

test('adding front thujas changes only front planting and its declared drip-irrigation allowance',()=>{
  const old=estimateCosts({...base,hedgeFront:0},data),cost=estimateCosts(base,data);
  const front=cost.hedges.sides.find(s=>s.side==='front'),frontInstalled=front.plants.low+front.planting;
  assert.deepEqual(cost.hedges.sides.filter(s=>s.side!=='front'),old.hedges.sides);
  near(cost.hedges.baseTotal.low-old.hedges.baseTotal.low,frontInstalled);
  near(cost.earthworks.compactedVolume,old.earthworks.compactedVolume);
  near(cost.earthworks.baseTotal.low,old.earthworks.baseTotal.low);
  near(cost.garden.quantities.frontIrrigationArea,front.length);
  near(cost.garden.quantities.irrigatedArea-old.garden.quantities.irrigatedArea,front.length);
  near(cost.total.low-old.total.low,frontInstalled+front.length*35);
  near(cost.total.high-old.total.high,(frontInstalled+front.length*65)*1.2);
  for(const row of cost.garden.rows.filter(row=>row.key!=='costGardenIrrigation')){
    assert.deepEqual(row.cost,old.garden.rows.find(oldRow=>oldRow.key===row.key).cost);
  }
});

test('front planting never adds front fill or hedge-bed soil when rear raises change',()=>{
  const noFront=gardenQuantities({...base,hedgeFront:0},data),front=gardenQuantities(base,data);
  near(front.automaticArea,noFront.automaticArea);near(front.bedArea,noFront.bedArea);
  const settings={...base,gardenRaise:1,bedRaise:.5};
  const raised=estimateCosts(settings,data),withoutFront=estimateCosts({...settings,hedgeFront:0},data);
  near(raised.earthworks.gardenVolume,withoutFront.earthworks.gardenVolume);
  near(raised.earthworks.bedVolume,withoutFront.earthworks.bedVolume);
  near(raised.earthworks.topsoilVolume,withoutFront.earthworks.topsoilVolume);
});

test('front custom price is independent, replaces supply once and restores unquoted tall stock',()=>{
  const unknown=estimateCosts({...base,hedgeFront:6},data);
  assert.equal(unknown.hedges.status,'quote-required');assert.equal(unknown.total,null);
  const cost=estimateCosts({...base,hedgeFront:6,costTreePriceFront:3500,costPriceFactor:200},data);
  const front=cost.hedges.sides.find(s=>s.side==='front');
  assert.equal(front.unit.low,3500);assert.equal(front.plants.low,front.count*3500);
  assert.equal(cost.hedges.sides.find(s=>s.side==='rear').unit.low,600);
  assert.ok(cost.total);
  const noProcurement=estimateCosts({...base,buyNewThujas:false},data);
  assert.equal(noProcurement.hedges.count,0);assert.equal(noProcurement.hedges.lines.delivery,0);
});

test('legacy and other-property designs never acquire a front hedge order',()=>{
  assert.ok(!estimateCosts({...base,hedgeFront:0},data).hedges.sides.some(s=>s.side==='front'));
  const cost=estimateCosts({...base,gardenProgram:'classic'},other);
  assert.ok(!cost.hedges.sides.some(s=>s.side==='front'));
  assert.equal(cost.garden.quantities.frontIrrigationArea,0);
});

test('moved shorter pool updates mapped quantities while retaining compact spa pricing and quote scope',()=>{
  const previous=estimateCosts(base,data),screened=estimateCosts({...base,gardenProgram:'spa-screened'},data);
  near(screened.earthworks.automaticArea-previous.earthworks.automaticArea,3.5);
  near(screened.earthworks.gardenVolume-previous.earthworks.gardenVolume,1.75);
  assert.deepEqual(screened.spa.knownBase,previous.spa.knownBase);
  assert.deepEqual(screened.spa.rows.find(row=>row.key==='costSpaSauna').cost,{low:65000,high:95000});
  assert.match(screened.spa.rows.find(row=>row.key==='costSpaPool').basis,/3.5 × 7.0 m/);
  const incomplete=estimateCosts({...base,gardenProgram:'spa-screened',costUsePlanningAllowances:false},data);
  assert.equal(incomplete.total,null);assert.equal(incomplete.garden.unquoted.length,10);
  assert.equal(incomplete.spa.unquoted.length,5);
});

test('budget presentation names the front hedge and preserves the rear-only earthworks scope',()=>{
  const cost=estimateCosts(base,data),nodes=new Map();
  const element=()=>({textContent:'',innerHTML:'',dataset:{},classList:{toggle(){}}});
  const getElementById=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  const previous=globalThis.document;
  globalThis.document={getElementById,querySelector:()=>element()};
  try{
    renderBudget(cost,base,data);
    assert.match(nodes.get('cost-status').textContent,/rear garden \+ front hedge/);
    assert.match(nodes.get('cost-detail-content').innerHTML,/Front \/ street/);
    assert.match(nodes.get('cost-detail-content').innerHTML,/Rear-garden earthworks/);
    assert.match(nodes.get('garden-cost-detail').innerHTML,/front-hedge strip/);
    assert.match(nodes.get('cost-detail-content').innerHTML,/pedestrian and vehicle openings are excluded/);
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
