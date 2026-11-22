import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {requiredEyeForWater,requiredEyeForHorizon,seaRayHeight,evaluateSeaProfile,evaluateSeaView,seaCameraPose,seaViewSummary,EARTH_RADIUS_M} from '../src/sea-visibility.js';

const close=(actual,expected,tolerance=1e-8)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);
const corridor={seaLevelZ:0,model:{earthRadiusM:EARTH_RADIUS_M},coordinates:{gridConvergenceDegrees:-.3},buildings:[]};
const observer={id:'test',xy:[10,20],groundZ:2};
const profile={id:'b0',bearingGrid:0,directionXY:[0,1],shoreDistanceM:50,waterDistanceM:100,stepM:25,
  surfaceZ:[4,10],groundZ:[2,2],surfaceKind:'21',buildingRuns:[],waterSegmentVerified:true};

test('finite sea target uses the full observer-obstacle-water triangle',()=>{
  close(requiredEyeForWater(10,50,100,0,Infinity),20);
  close(requiredEyeForWater(10,25,100,0,Infinity),40/3);
  close(requiredEyeForWater(12,50,100,2,Infinity),22);
  assert.equal(requiredEyeForWater(10,100,100),Infinity);
});

test('curvature raises the required height and reverses to a tangent ray',()=>{
  const top=15,d=500,D=1600;
  const eye=requiredEyeForWater(top,d,D);
  assert.ok(eye>requiredEyeForWater(top,d,D,0,Infinity));
  close(seaRayHeight(eye,d,{targetDistance:D}),top);
  const horizon=requiredEyeForHorizon(top,d);
  close(seaRayHeight(horizon,d,{mode:'horizon'}),top);
  assert.ok(horizon>top);
  assert.ok(horizon<eye);
});

test('absolute datum and above-ground eye height remain separate',()=>{
  const r=evaluateSeaProfile(corridor,observer,profile,{heightAboveGround:18.5,clearanceM:0});
  close(r.eyeZ,20.5);
  close(r.requiredAbsoluteZ-r.requiredHeightM,observer.groundZ);
  close(r.requiredHeightM,requiredEyeForWater(10,50,100)-2);
  assert.equal(r.control.distanceM,50);
  assert.equal(r.status,'clear');
});

test('finite water must lie within the geometric horizon even when land is flat',()=>{
  const p={...profile,waterDistanceM:1000,surfaceZ:[0,0],groundZ:[0,0]};
  const r=evaluateSeaProfile(corridor,{...observer,groundZ:0},p,{heightAboveGround:.02,clearanceM:0});
  close(r.requiredHeightM,1000**2/(2*EARTH_RADIUS_M));
  assert.equal(r.status,'blocked');assert.equal(r.control,null);
});

test('missing DSM data cannot become an optimistic sea view',()=>{
  const r=evaluateSeaProfile(corridor,observer,{...profile,surfaceZ:[4,null]},{heightAboveGround:200,clearanceM:0});
  assert.equal(r.status,'incomplete');assert.equal(r.visible,false);
  assert.equal(r.requiredHeightM,null);assert.equal(r.missingCount,1);
  assert.ok(Number.isFinite(r.knownLowerBoundM));
});

test('a truncated profile and a water target crossing further land are incomplete',()=>{
  for(const p of [{...profile,surfaceZ:[4]},{...profile,waterSegmentVerified:false}]){
    const r=evaluateSeaProfile(corridor,observer,p,{heightAboveGround:200});
    assert.equal(r.status,'incomplete');assert.equal(r.visible,false);
  }
});

test('a distant horizon cannot be asserted through an intervening coast',()=>{
  const r=evaluateSeaProfile(corridor,observer,{...profile,nextLandDistanceM:1200},{mode:'horizon',heightAboveGround:50});
  assert.equal(r.horizonCovered,false);assert.equal(r.visible,false);assert.equal(r.requiredHeightM,null);
});

test('raising the observer past a further coast invalidates the current horizon, not a lower verified threshold',()=>{
  const p={...profile,surfaceZ:[1,1],nextLandDistanceM:8000};
  const r=evaluateSeaProfile(corridor,observer,p,{mode:'horizon',heightAboveGround:80,clearanceM:0});
  assert.equal(r.coverageComplete,true);assert.ok(Number.isFinite(r.requiredHeightM));
  assert.ok(r.horizonDistanceM>8000);assert.equal(r.currentViewComplete,false);
  assert.equal(r.visible,false);assert.equal(r.status,'incomplete');
});

test('raising the eye and increasing top clearance have their physical monotonic effects',()=>{
  const low=evaluateSeaProfile(corridor,observer,profile,{heightAboveGround:10,clearanceM:0});
  const high=evaluateSeaProfile(corridor,observer,profile,{heightAboveGround:30,clearanceM:0});
  const allowance=evaluateSeaProfile(corridor,observer,profile,{heightAboveGround:30,clearanceM:1});
  assert.equal(low.status,'blocked');assert.equal(high.status,'clear');
  assert.ok(allowance.requiredHeightM>high.requiredHeightM);
  close(low.requiredHeightM,high.requiredHeightM);
});

test('best-bearing selection excludes an incomplete apparently low skyline',()=>{
  const unknown={...profile,id:'unknown',surfaceZ:[null,0]},known={...profile,id:'known'};
  const c={...corridor,observers:[{...observer,profiles:[unknown,known]}]};
  const r=evaluateSeaView(c,{profileId:'best',heightAboveGround:10});
  assert.equal(r.profile.id,'known');assert.equal(r.completeBearingCount,1);
});

test('camera preview preserves the selected observer height and direction',()=>{
  const r=evaluateSeaProfile(corridor,observer,profile,{heightAboveGround:30});
  const pose=seaCameraPose(r);
  assert.deepEqual(pose.eye,[10,20,32]);close(pose.target[0],10);close(pose.target[1],140);
  assert.match(pose.note,/complete measured profile/);
});

const measured=JSON.parse(readFileSync(new URL('../data/sternicza-sea-corridor.json',import.meta.url),'utf8'));
test('retained sea profiles have source provenance, consistent datum and explicit completeness',()=>{
  assert.equal(measured.verticalDatum,'PL-EVRF2007-NH');
  assert.equal(measured.surfaceDate,'2024-10-01');
  assert.equal(measured.model.sourceResolutionM,.5);
  assert.equal(measured.observers.length,4);
  for(const source of measured.sources){assert.match(source.url,/^https:\/\//);assert.match(source.sha256,/^[a-f0-9]{64}$/);}
  for(const observer of measured.observers){
    assert.ok(observer.profiles.length>=40);
    for(const p of observer.profiles){
      assert.equal(p.surfaceZ.length,p.groundZ.length);assert.equal(p.surfaceZ.length,p.surfaceKind.length);
      assert.ok(p.surfaceZ.length*p.stepM>=p.shoreDistanceM);
      close(p.waterDistanceM-p.shoreDistanceM,1000,.002);
      close(Math.hypot(...p.directionXY),1,1e-8);
      assert.equal(p.missingCount,p.surfaceZ.filter(z=>z===null).length);
    }
  }
});

test('Sternicza result uses obstructions beyond the old 200 m context',()=>{
  const water=evaluateSeaView(measured,{observerId:'house',profileId:'best',mode:'water',heightAboveGround:12,clearanceM:1});
  const horizon=evaluateSeaView(measured,{observerId:'house',profileId:'best',mode:'horizon',heightAboveGround:12,clearanceM:1});
  assert.equal(water.status,'blocked');assert.equal(horizon.status,'blocked');
  assert.ok(water.control.distanceM>200);assert.ok(horizon.control.distanceM>200);
  assert.ok(water.requiredHeightM>20&&water.requiredHeightM<30);
  assert.ok(horizon.requiredHeightM>14&&horizon.requiredHeightM<20);
  assert.ok(horizon.requiredHeightM<water.requiredHeightM);
  assert.ok(water.completeBearingCount>=40);
});

test('sea export is a compact summary with provenance and no repeated source arrays',()=>{
  const state={observerId:'house',profileId:'best',mode:'water',heightAboveGround:12,clearanceM:1};
  const result=evaluateSeaView(measured,state),summary=seaViewSummary(measured,result,state);
  assert.equal(summary.siteId,'sternicza-11');assert.equal(summary.current.status,'blocked');
  close(summary.threshold.eyeHeightAboveOriginalGroundM,result.requiredHeightM);
  assert.equal(summary.sources.length,4);assert.ok(JSON.stringify(summary).length<8000);
  assert.ok(!JSON.stringify(summary).includes('surfaceZ'));
  summary.observer.xy[0]=-999;assert.notEqual(result.observer.xy[0],-999);
  summary.settings.heightAboveGround=77;assert.equal(state.heightAboveGround,12);
  assert.equal(seaViewSummary(measured,null,state),null);
});
