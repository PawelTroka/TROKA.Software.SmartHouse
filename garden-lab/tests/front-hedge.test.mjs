import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {frontHedgeLayout,hedgeSegments,hedgeGroundAt,hedgeTopAt,terrainAt,screenOnRay,observerForPreset,analyzeVisibility} from '../src/geometry.js';
import {prepareSunGeometry,firstSunBlocker} from '../src/shade.js';
import {gardenDimensions,dimensionsForScope,dimensionScheduleMarkup} from '../src/dimensions.js';

const data=JSON.parse(fs.readFileSync(new URL('../data/site-data.json',import.meta.url),'utf8'));
const settings={siteId:'sternicza-11',gardenProgram:'spa-compact',hedgeRear:4,hedgeLeft:4,hedgeRight:4,hedgeFront:4,
  hedgeInset:.5,gardenRaise:.5,bedRaise:0,raiseNewHedges:true,removeGarage:true,showDimensions:true};
const near=(actual,expected,tolerance=1e-8)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} ≠ ${expected}`);
const mid=(a,b)=>a.map((v,i)=>(v+b[i])/2);

test('front thujas preserve explicit pedestrian and vehicle openings and charge only planted spans',()=>{
  const front=frontHedgeLayout(settings,data),segments=hedgeSegments(settings,data).filter(s=>s.side==='front');
  assert.equal(segments.length,2);assert.equal(front.openings.length,2);
  near(front.length,14.11584721979941);
  near(front.segments.reduce((sum,s)=>sum+s.length,0),front.length);
  near(front.openings[0].width,1.2);near(front.openings[1].width,4);
  near(mid(front.openings[0].a,front.openings[0].b)[0],2.3);
  assert.equal(front.segments.reduce((sum,s)=>sum+Math.ceil(s.length/.8),0),19);
  assert.match(front.assumption,/not surveyed/);
  for(const s of segments){near(s.a[1],.5);near(s.b[1],.5);near(s.topA-s.baseA,4);near(s.topB-s.baseB,4);}
});

test('front hedge and observer follow existing front grade, independent of rear soil settings',()=>{
  const front=frontHedgeLayout(settings,data),xy=mid(front.segments[1].a,front.segments[1].b),original=terrainAt(...xy,data);
  for(const raiseNewHedges of [true,false]){
    const raised={...settings,gardenRaise:1,bedRaise:1,raiseNewHedges};
    near(hedgeGroundAt(...xy,'front',raised,data),original);
    near(hedgeTopAt(...xy,'front',raised,data),original+4);
    const eye=observerForPreset('front',raised,data);
    near(eye.groundZ,terrainAt(eye.x,eye.y,data));near(eye.eyeHeight,1.65);near(eye.defaultLookYaw,180);
    near(eye.y,5.0027367665);
  }
});

test('street-level rays meet the planted front screen but pass through both access openings',()=>{
  const front=frontHedgeLayout(settings,data);
  const trace=xy=>{
    const z=terrainAt(...xy,data)+1.65;
    return screenOnRay([xy[0],5,z],[xy[0],-2,z],settings,data);
  };
  for(const span of front.segments){
    const hit=trace(mid(span.a,span.b));assert.equal(hit?.side,'front');assert.equal(hit.blocked,true);assert.equal(hit.blockMaterial,'foliage');
  }
  for(const gap of front.openings)assert.equal(trace(mid(gap.a,gap.b)),null);
  const xy=mid(front.segments[1].a,front.segments[1].b),z=terrainAt(...xy,data)+6;
  assert.equal(screenOnRay([xy[0],5,z],[xy[0],-2,z],settings,data).blocked,false,'The finite front hedge cannot screen upper rays above its top');
  assert.equal(screenOnRay([xy[0],5,z-4],[xy[0],-2,z-4],{...settings,hedgeFront:0},data),null);
});

test('front shade geometry uses the same gaps and invalidates the cache when height changes',()=>{
  const geometry=prepareSunGeometry(settings,data),front=frontHedgeLayout(settings,data);
  const screens=geometry.occluders.filter(o=>o.id==='hedge-front');assert.equal(screens.length,2);
  const ray=xy=>firstSunBlocker([xy[0],2,terrainAt(xy[0],2,data)+.1],[0,-1,1],screens);
  assert.equal(ray(mid(front.segments[1].a,front.segments[1].b))?.id,'hedge-front');
  for(const gap of front.openings)assert.equal(ray(mid(gap.a,gap.b)),null);
  const taller=prepareSunGeometry({...settings,hedgeFront:5},data);assert.notEqual(taller,geometry);
  const raised=prepareSunGeometry({...settings,gardenRaise:1,bedRaise:1},data);
  for(const before of geometry.cells.filter(c=>c.zone==='front')){
    const after=raised.cells.find(c=>c.x===before.x&&c.y===before.y);near(after.z,before.z);
  }
  assert.equal(prepareSunGeometry({...settings,hedgeFront:0},data).occluders.some(o=>o.id==='hedge-front'),false);
});

test('whole-plot dimensions show exact front spans and proposed access widths, outside the rear detail',()=>{
  const records=gardenDimensions(settings,data),byId=new Map(records.map(r=>[r.id,r]));
  near(byId.get('hedge-front-height').value,4);
  near(byId.get('front-hedge-span-1').value,1.1952583027689543);
  near(byId.get('front-hedge-span-2').value,12.920588917030454);
  near(byId.get('front-pedestrian-opening').value,1.2);near(byId.get('front-vehicle-opening').value,4);
  for(const id of ['hedge-front-height','front-hedge-span-1','front-hedge-span-2','front-pedestrian-opening','front-vehicle-opening']){
    assert.ok(dimensionsForScope(records,'garden').some(r=>r.id===id));
    assert.equal(dimensionsForScope(records,'detail').some(r=>r.id===id),false);
  }
  const markup=dimensionScheduleMarkup(dimensionsForScope(records,'garden'));
  assert.match(markup,/Front thuja/);assert.match(markup,/Vehicle opening · proposed/);assert.match(markup,/Pedestrian opening · proposed/);
});

test('front proposal is opt-in for legacy geometry and restricted to the supported property',()=>{
  assert.equal(frontHedgeLayout({},data).segments.length,0);
  assert.equal(frontHedgeLayout({...settings,hedgeFront:0},data).segments.length,0);
  assert.equal(frontHedgeLayout({...settings,siteId:'korzeniowskiego-40'},data).segments.length,0);
  assert.equal(hedgeSegments({},data).some(s=>s.side==='front'),false);
  const snapshot=JSON.stringify(data),stateSnapshot=JSON.stringify(settings);
  frontHedgeLayout(settings,data);hedgeSegments(settings,data);
  assert.equal(JSON.stringify(data),snapshot);assert.equal(JSON.stringify(settings),stateSnapshot);
});

test('front intersections report finite aggregate hedge requirements for a street-side target',()=>{
  const model={...data,buildings:[{id:'street-test',kind:'target',label:'Street-side test target',
    footprint:[[8,-6],[12,-6],[12,-4],[8,-4],[8,-6]],baseZ:2,roofZ:4.1,roofTopZ:4.1,
    samples:[[10,-4,4.1]],roofSampleCount:1,highFeatures:[]}]};
  const analysis=analyzeVisibility(observerForPreset('front',settings,model),settings,model);
  assert.equal(analysis.rays[0].screen.side,'front');
  assert.ok(analysis.worstRequiredHedge.front>0);assert.ok(Number.isFinite(analysis.worstRequiredHedge.front));
  assert.ok(analysis.remainingRequiredHedge.front>0);assert.ok(Number.isFinite(analysis.remainingRequiredHedge.front));
  assert.equal(analysis.rays[0].blockedBy,'hedge-front');
});
