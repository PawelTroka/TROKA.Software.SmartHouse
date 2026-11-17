import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {frontHedgeLayout} from '../src/geometry.js';
import {garagePlanFrame} from '../src/garage-ramp.js';
import {basementGaragePlanMarkup} from '../src/diagrams.js';
import {gardenQuantities} from '../src/costs.js';
const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const base={siteId:'sternicza-11',hedgeFront:4,hedgeInset:.5,hedgeFullPerimeter:true,garageRampWidth:3.2};
test('basement option aligns the proposed gate and leaves pedestrian access clear',()=>{
 const off=frontHedgeLayout(base,data),settings={...base,basementGarageEnabled:true};
 const on=frontHedgeLayout(settings,data),frame=garagePlanFrame(settings,data);
 const gate=on.openings.find(g=>g.id==='front-vehicle-opening'),old=off.openings.find(g=>g.id==='front-vehicle-opening');
 assert.ok(Math.abs((gate.a[0]+gate.b[0])/2-(frame.gate.a[0]+frame.gate.b[0])/2)<.02);
 assert.ok(Math.abs((old.a[0]+old.b[0])/2-(gate.a[0]+gate.b[0])/2)>4);
 assert.ok(gate.width>=4);assert.deepEqual(on.openings[0],off.openings[0]);
 assert.ok(on.segments.every(span=>span.b[0]<=gate.a[0]+1e-7||span.a[0]>=gate.b[0]-1e-7));
 assert.match(on.assumption,/relocated into line/);
 assert.deepEqual(frontHedgeLayout({...settings,basementGarageEnabled:false},data),off);
});
test('changing ramp width invalidates cached frontage quantities',()=>{
 const narrow={...base,basementGarageEnabled:true,garageRampWidth:3.2};
 const wide={...narrow,garageRampWidth:4};
 const a=gardenQuantities(narrow,data),b=gardenQuantities(wide,data);
 assert.ok(b.lengths.front<a.lengths.front-.3);
 assert.deepEqual(gardenQuantities(narrow,data),a);
});
test('basement plan includes ramp and underground bay only for the enabled site',()=>{
 const transform={X:x=>x*10,Y:y=>y*10,scale:10};
 assert.equal(basementGaragePlanMarkup(garagePlanFrame(base,data),transform),'');
 const markup=basementGaragePlanMarkup(garagePlanFrame({...base,basementGarageEnabled:true},data),transform);
 assert.match(markup,/data-basement-garage-plan="true"/);assert.match(markup,/BASEMENT BAY/);
 assert.ok(!/NaN|undefined/.test(markup));
 for(const id of ['nadmorska-17','korzeniowskiego-40'])
  assert.equal(basementGaragePlanMarkup(garagePlanFrame({...base,siteId:id,basementGarageEnabled:true},data),transform),'');
});
