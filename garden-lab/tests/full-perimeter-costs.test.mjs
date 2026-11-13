import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {COST_DEFAULTS,estimateCosts,gardenQuantities} from '../src/costs.js';
import {hedgeSegments} from '../src/geometry.js';
import {renderBudget} from '../src/budget-view.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const other=JSON.parse(readFileSync(new URL('../data/korzeniowskiego-40.json',import.meta.url)));
const base={...COST_DEFAULTS,gardenProgram:'spa-screened',costUsePlanningAllowances:true,
  hedgeRear:4,hedgeLeft:4,hedgeRight:4,hedgeFront:4,hedgeInset:.5,
  terraceDepth:4.2,floorHeight:1.2,gardenRaise:.5,bedRaise:0,
  removeGarage:true,canopyEnabled:false,screeningTrees:[],costContingency:20};
const full={...base,hedgeFullPerimeter:true};
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
const irrigation=cost=>cost.garden.rows.find(row=>row.key==='costGardenIrrigation');

test('full mapped perimeter orders 137 thujas with one shared delivery allowance',()=>{
  const cost=estimateCosts(full,data),old=estimateCosts(base,data);
  assert.equal(cost.hedges.fullPerimeter,true);
  assert.deepEqual(cost.hedges.sides.map(side=>[side.side,side.count]),[['rear',24],['left',47],['right',47],['front',19]]);
  assert.equal(cost.hedges.count,137);assert.equal(old.hedges.count,93);
  near(cost.hedges.length,107.271328);
  assert.equal(cost.hedges.lines.plants.low,137*300);
  assert.equal(cost.hedges.lines.planting,137*75);
  assert.equal(cost.hedges.lines.delivery,1000);
  assert.deepEqual(cost.hedges.baseTotal,{low:52375,high:52375});
  near(cost.hedges.baseTotal.low-old.hedges.baseTotal.low,44*(300+75));
});

test('front-side extensions add only their declared drip allowance to garden finishes',()=>{
  const cost=estimateCosts(full,data),old=estimateCosts(base,data);
  const extension=hedgeSegments(full,data).filter(s=>s.groundZone==='front'&&s.side!=='front')
    .reduce((sum,s)=>sum+Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1]),0);
  near(extension,35.030949697598004);
  near(cost.garden.quantities.frontSideIrrigationArea,extension);
  near(cost.garden.quantities.irrigatedArea-old.garden.quantities.irrigatedArea,extension);
  near(irrigation(cost).cost.low-irrigation(old).cost.low,extension*35);
  near(irrigation(cost).cost.high-irrigation(old).cost.high,extension*65);
  assert.match(irrigation(cost).basis,/front-side hedge strips/);
  assert.match(irrigation(cost).scope,/1 m planted-strip width/);
  for(const row of cost.garden.rows.filter(row=>row.key!=='costGardenIrrigation')){
    assert.deepEqual(row.cost,old.garden.rows.find(previous=>previous.key===row.key).cost,row.key);
  }
  near(cost.total.low-old.total.low,16500+extension*35);
  near(cost.total.high-old.total.high,(16500+extension*65)*1.2);
});

test('front-side planting creates no front fill or raised-bed volume, including after cache toggles',()=>{
  const old=gardenQuantities(base,data),extended=gardenQuantities(full,data),restored=gardenQuantities(base,data);
  assert.deepEqual(restored,old);
  assert.ok(extended.lengths.left>old.lengths.left&&extended.lengths.right>old.lengths.right);
  assert.equal(old.frontSideHedgeLength,0);
  for(const key of ['automaticArea','bedArea','rearGrossArea','excludedArea'])near(extended[key],old[key]);
  const raised={...full,gardenRaise:1,bedRaise:.5};
  const cost=estimateCosts(raised,data),without=estimateCosts({...raised,hedgeFullPerimeter:false},data);
  for(const key of ['gardenVolume','bedVolume','topsoilVolume','compactedVolume','looseVolume'])near(cost.earthworks[key],without.earthworks[key]);
  assert.deepEqual(cost.earthworks.baseTotal,without.earthworks.baseTotal);
});

test('disabled side hedges do not add front-side irrigation strips',()=>{
  const settings={...full,hedgeLeft:0},cost=estimateCosts(settings,data);
  const extension=hedgeSegments(settings,data).filter(s=>s.groundZone==='front'&&s.side!=='front'&&s.height>0)
    .reduce((sum,s)=>sum+Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1]),0);
  near(cost.garden.quantities.frontSideIrrigationArea,extension);
  assert.ok(extension>0&&extension<20);
  assert.equal(cost.hedges.sides.find(s=>s.side==='left').count,0);
  const noSides=estimateCosts({...full,hedgeLeft:0,hedgeRight:0},data);
  assert.equal(noSides.garden.quantities.frontSideIrrigationArea,0);
});

test('full-perimeter custom prices and irrigation quote replace their lines once',()=>{
  const settings={...full,costTreePriceLeft:420,costPriceFactor:200,costHedgeDelivery:1234,costGardenIrrigation:23000};
  const cost=estimateCosts(settings,data),left=cost.hedges.sides.find(side=>side.side==='left');
  assert.equal(left.unit.low,420);assert.equal(left.plants.low,47*420);
  assert.equal(cost.hedges.sides.find(side=>side.side==='right').unit.low,600);
  assert.equal(cost.hedges.lines.delivery,1234);
  assert.deepEqual(irrigation(cost).cost,{low:23000,high:23000});
  assert.equal(irrigation(cost).priceStatus,'user-quote');
  const unknown=estimateCosts({...full,hedgeLeft:6},data);
  assert.equal(unknown.hedges.status,'quote-required');assert.equal(unknown.total,null);
  const quoted=estimateCosts({...full,hedgeLeft:6,costTreePriceLeft:3500},data);
  assert.equal(quoted.hedges.sides.find(side=>side.side==='left').plants.low,47*3500);
  assert.ok(quoted.total);
});

test('omitted or disabled full-perimeter mode preserves older budgets and the other property',()=>{
  assert.deepEqual(estimateCosts(base,data),estimateCosts({...base,hedgeFullPerimeter:false},data));
  const otherBase={...base,gardenProgram:'classic'};
  assert.deepEqual(estimateCosts({...otherBase,hedgeFullPerimeter:true},other),estimateCosts(otherBase,other));
  assert.equal(estimateCosts(otherBase,other).hedges.fullPerimeter,false);
});

test('budget labels distinguish full perimeter hedges from rear-only earthworks',()=>{
  const cost=estimateCosts(full,data),nodes=new Map();
  const element=()=>({textContent:'',innerHTML:'',dataset:{},classList:{toggle(){}}});
  const getElementById=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  const previous=globalThis.document;
  globalThis.document={getElementById,querySelector:()=>element()};
  try{
    renderBudget(cost,full,data);
    assert.match(nodes.get('cost-status').textContent,/rear garden \+ full perimeter hedges/);
    assert.match(nodes.get('cost-detail-content').innerHTML,/Rear-garden earthworks/);
    assert.match(nodes.get('cost-detail-content').innerHTML,/no front-side garden fill/);
    assert.match(nodes.get('garden-cost-detail').innerHTML,/front-side hedge strips/);
    assert.match(nodes.get('hedge-quantity').textContent,/137 trees/);
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
