import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {COST_DEFAULTS,COST_FIELDS,estimateCosts,estimateGardenCosts,estimateBalconyCosts} from '../src/costs.js';
import {renderBudget} from '../src/budget-view.js';
import {terraceCover} from '../src/geometry.js';
import {gardenDimensions,dimensionScheduleMarkup} from '../src/dimensions.js';
import {terraceCoverPlanMarkup,terraceCoverSectionCuts,terraceCoverSectionMarkup,renderPlan,renderSection} from '../src/diagrams.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const base={...COST_DEFAULTS,siteId:'sternicza-11',gardenProgram:'spa-pool-grove',floorHeight:1.2,firstFloorRise:3,
  terraceDepth:4,gardenRaise:.5,bedRaise:0,canopyEnabled:true,terraceCoverType:'balcony',canopyDepth:4,canopyWidth:8.5,canopyHeight:3,
  hedgeFront:4,hedgeRear:4,hedgeLeft:4,hedgeRight:4,hedgeInset:0,removeGarage:true,screeningTrees:[],costUsePlanningAllowances:true,costContingency:20};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const diagramFrame=()=>({dataset:{},clientWidth:960,clientHeight:620,innerHTML:'',querySelectorAll:()=>[],querySelector:()=>({addEventListener(){}})});

test('balcony has a separate quote-only scope and never inherits the canopy square-metre rate',()=>{
  assert.equal(COST_FIELDS.costBalconyQuote.group,'cost-garden');
  for(const costUsePlanningAllowances of [false,true]){
    const settings={...base,costUsePlanningAllowances,costGardenCanopy:48000};
    const balcony=estimateBalconyCosts(settings,data),garden=estimateGardenCosts(settings,data),total=estimateCosts(settings,data);
    assert.equal(balcony.quoteOnly,true);assert.equal(balcony.planningEnabled,false);
    assert.equal(balcony.status,'quote-required');assert.equal(balcony.total,null);
    assert.deepEqual(balcony.knownBase,{low:0,high:0});
    assert.deepEqual(balcony.rows.map(row=>row.key),['costBalconyQuote']);
    assert.equal(balcony.rows[0].cost,null);assert.match(balcony.rows[0].basis,/34.0 m² deck/);
    assert.match(balcony.rows[0].scope,/proposed garden-facing first-floor access door/);
    assert.equal(garden.quantities.canopyArea,0);assert.ok(!garden.rows.some(row=>row.key==='costGardenCanopy'));
    assert.equal(total.status,'quote-required');assert.equal(total.total,null);
    assert.match(total.notes.join(' '),/first-floor balcony needs a complete installed project quote/i);
  }
});

test('one complete balcony quote replaces the canopy cost and receives the upper contingency only once',()=>{
  const unquoted=estimateCosts(base,data),quoted=estimateCosts({...base,costBalconyQuote:180000,costGardenCanopy:48000},data);
  near(quoted.knownSubtotal.low-unquoted.knownSubtotal.low,180000);
  near(quoted.knownSubtotal.high-unquoted.knownSubtotal.high,216000);
  assert.deepEqual(quoted.balcony.knownBase,{low:180000,high:180000});
  assert.equal(quoted.balcony.rows[0].priceStatus,'user-quote');assert.equal(quoted.status,'estimate');
  const canopy=estimateCosts({...base,terraceCoverType:'canopy',costBalconyQuote:180000,costGardenCanopy:48000},data);
  assert.equal(canopy.balcony.enabled,false);
  assert.deepEqual(canopy.garden.rows.find(row=>row.key==='costGardenCanopy').cost,{low:48000,high:48000});
  near(quoted.total.low-canopy.total.low,180000-48000);
  near(quoted.total.high-canopy.total.high,(180000-48000)*1.2);
});

test('inactive, unsupported and invalid balcony quotes do not create hidden charges or a free project',()=>{
  const off={...base,gardenProgram:'classic',canopyEnabled:false,costUsePlanningAllowances:false,costGardenCanopy:0};
  const before=estimateCosts(off,data),after=estimateCosts({...off,costBalconyQuote:180000},data);
  assert.deepEqual(after.knownSubtotal,before.knownSubtotal);assert.deepEqual(after.garden,before.garden);
  assert.equal(after.balcony.enabled,false);
  for(const id of ['nadmorska-17','korzeniowskiego-40']){
    assert.equal(estimateBalconyCosts({...base,siteId:id,costBalconyQuote:180000},data).enabled,false);
    assert.equal(estimateBalconyCosts({...base,costBalconyQuote:180000},{...data,site:{...data.site,id}}).enabled,false);
  }
  for(const costBalconyQuote of [-1,NaN,Infinity,'180000'])assert.equal(estimateBalconyCosts({...base,costBalconyQuote},data).status,'quote-required');
});

test('the visible budget identifies missing balcony work alongside an unquoted basement project',()=>{
  const nodes=new Map(),element=()=>({textContent:'',innerHTML:'',dataset:{},classList:{toggle(){}}});
  const panel=element(),previous=globalThis.document;
  globalThis.document={getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},querySelector:()=>panel};
  try{
    for(const basementGarageEnabled of [false,true]){
      const settings={...base,basementGarageEnabled};renderBudget(estimateCosts(settings,data),settings,data);
      assert.equal(nodes.get('combined-cost').textContent,'Quote needed');
      assert.match(nodes.get('cost-status').textContent,/first-floor balcony/i);assert.match(nodes.get('cost-status').textContent,/incomplete subtotal/);
      assert.match(nodes.get('cost-detail-content').innerHTML,/First-floor balcony · separate installed project quote/);
      assert.match(nodes.get('cost-detail-content').innerHTML,/no canopy rate is added/);
      assert.equal(panel.dataset.balconyUnquotedCount,1);assert.equal(panel.dataset.balconyKnownLow,0);
    }
    const quoted={...base,costBalconyQuote:180000};renderBudget(estimateCosts(quoted,data),quoted,data);
    assert.equal(panel.dataset.balconyKnownLow,180000);assert.equal(panel.dataset.balconyUnquotedCount,0);
    assert.match(nodes.get('balcony-cost-summary').textContent,/Replaces the canopy cost/);
    const off={...quoted,canopyEnabled:false};renderBudget(estimateCosts(off,data),off,data);
    assert.doesNotMatch(nodes.get('cost-detail-content').innerHTML,/First-floor balcony · separate installed project quote/);
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

test('balcony dimensions follow its first floor, deck, guard and actual support spans',()=>{
  const cover=terraceCover(base,data),records=gardenDimensions(base,data),get=id=>records.find(record=>record.id===id);
  near(get('balcony-width').value,8.5);near(get('balcony-length').value,4);near(get('balcony-area').value,34);
  near(get('balcony-floor-level').value,3);near(get('balcony-clear-below').value,2.75);
  near(get('balcony-beam-clearance').value,2.51);near(get('balcony-deck-thickness').value,.25);near(get('balcony-guard-height').value,1.1);
  for(let i=1;i<cover.supports.length;i++){
    const a=cover.supports[i-1],b=cover.supports[i];
    near(get(`balcony-support-span-${i}`).value,Math.abs((b.x0+b.x1-a.x0-a.x1)/2));
  }
  const schedule=dimensionScheduleMarkup(records);assert.match(schedule,/First-floor balcony · proposal/);assert.match(schedule,/under beam/);
  for(const record of records.filter(record=>record.feature==='balcony'))assert.equal((schedule.match(new RegExp(`data-dimension-record="${record.id}"`,'g'))||[]).length,1);
  const higher=gardenDimensions({...base,firstFloorRise:3.5,canopyHeight:5},data);
  near(higher.find(record=>record.id==='balcony-floor-level').value,3.5);
  near(higher.find(record=>record.id==='balcony-beam-clearance').value,3.01);
  for(const settings of [{...base,canopyEnabled:false},{...base,terraceCoverType:'canopy'},{...base,siteId:'nadmorska-17'}])assert.ok(!gardenDimensions(settings,data).some(record=>record.feature==='balcony'));
});

test('plan and sections show finite balcony members, proposed access and transparent guards',()=>{
  const cover=terraceCover(base,data),X=v=>v*10,Y=v=>100-v*10,scale=10;
  const markup=terraceCoverPlanMarkup(cover,{X,Y,scale});
  assert.match(markup,/data-terrace-cover-plan="balcony"/);assert.match(markup,/BALCONY · FIRST FLOOR/);
  assert.match(markup,/data-terrace-cover-access="proposed"/);
  assert.equal((markup.match(/data-terrace-cover-part="post"/g)||[]).length,3);
  const x=(cover.bounds.x0+cover.bounds.x1)/2+.2,origin=[x,cover.bounds.y0],direction=[0,1];
  const cuts=terraceCoverSectionCuts(cover,origin,direction),slab=cuts.find(cut=>cut.part==='slab');
  near(slab.interval[0],0);near(slab.interval[1],4);near(slab.z0,cover.deckTopZ-.25);
  assert.ok(cuts.some(cut=>cut.part==='glass'));assert.ok(!cuts.some(cut=>cut.part==='post'));
  const section=terraceCoverSectionMarkup(cuts,{X,Y,scale,minS:-1,maxS:6});
  assert.match(section,/data-opaque="false"/);assert.match(section,/Clear balcony guard glazing · transparent/);
  const clipped=terraceCoverSectionMarkup(cuts,{X,Y,scale,minS:1,maxS:2});
  assert.match(clipped,/width="10"/);assert.doesNotMatch(clipped,/data-terrace-cover-part="glass"/);
  assert.deepEqual(terraceCoverSectionCuts(cover,[cover.bounds.x1+2,cover.bounds.y0],direction),[]);
  const off=terraceCover({...base,canopyEnabled:false},data);
  assert.equal(terraceCoverPlanMarkup(off,{X,Y,scale}),'');assert.deepEqual(terraceCoverSectionCuts(off,origin,direction),[]);
});

test('full plan and sightline section label the selected balcony without drawing a second canopy',()=>{
  const cover=terraceCover(base,data),observer={x:(cover.bounds.x0+cover.bounds.x1)/2+.2,y:cover.bounds.y0-.5,z:cover.floorZ+1.65,eyeHeight:1.65,label:'Terrace sightline'};
  const plan=diagramFrame();renderPlan(plan,data,base,observer,{rays:[]});
  assert.match(plan.innerHTML,/data-terrace-cover-plan="balcony"/);assert.match(plan.innerHTML,/data-dimension-group="BK"/);
  assert.match(plan.innerHTML,/first-floor deck \+3.00 m above terrace/);
  const ray={target:[observer.x,cover.bounds.y1+10,cover.deckTopZ+6],blockId:data.buildings.find(b=>/PCK\s*3/i.test(b.label)).id,blockedBy:'canopy',visible:false,kind:'roof',screen:null};
  const section=diagramFrame();renderSection(section,data,base,observer,{criticalRay:ray,rays:[]});
  assert.match(section.innerHTML,/data-terrace-cover-section="balcony"/);assert.match(section.innerHTML,/hidden by the balcony/);
  assert.doesNotMatch(section.innerHTML,/canopy on this ray/);assert.doesNotMatch(plan.innerHTML+section.innerHTML,/NaN|undefined/);
});
