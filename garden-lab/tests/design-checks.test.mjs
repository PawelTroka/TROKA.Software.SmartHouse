import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {SITE_OPTIONS,getSiteProfile} from '../src/sites.js';
import {createStateModel} from '../src/state.js';
import {gardenDimensions,dimensionScheduleMarkup} from '../src/dimensions.js';
import {evaluateDesignChecks} from '../src/design-checks.js';
import {footprintArea,footprintFit,overlapArea} from '../src/footprint-fit.js';
import {analyzeVisibility,canopyIntersection,canopySupportBounds,gardenGroundAt,jacuzziBounds,observerForPreset,spaLayoutWarnings,spaLevels,terraceCover} from '../src/geometry.js';
import {rectCorners} from '../src/layout.js';
import {poolBounds} from '../src/garden-program.js';
import {prepareSunGeometry} from '../src/shade.js';
import {terraceCoverPlanMarkup} from '../src/diagrams.js';
import {createTerraceCoverGroup} from '../src/scene-terrace-cover.js';
import {toWorld} from '../src/orientation.js';

const sites=SITE_OPTIONS.map(option=>{
  const data=JSON.parse(readFileSync(new URL('../'+option.dataPath,import.meta.url)));
  return {id:option.id,data,s:createStateModel(getSiteProfile(option.id,data)).DEFAULTS};
});
const [sternicza,korzeniowskiego,nadmorska]=sites;
const ids=(s,d)=>evaluateDesignChecks(s,d).checks.map(c=>c.id);
const rect=(x,y,width,length)=>rectCorners({x,y,width,length});
const near=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<tol,`${a} vs ${b}`);
const ringOf=b=>rect(b.x0,b.y0,b.x1-b.x0,b.y1-b.y0);

test('entire edges crossing a concave cadastral notch are counted with all footprint corners inside',()=>{
  const notch=[[0,0],[8,0],[8,8],[5,8],[5,3],[3,3],[3,8],[0,8],[0,0]];
  const bridge=rect(1,5,6,1);
  const fit=footprintFit(bridge,notch);
  assert.equal(fit.location,'crossing');
  near(fit.areaM2,6);near(fit.insideM2,4);near(fit.outsideM2,2);
  assert.equal(footprintFit(rect(3.5,4,1,1),notch).location,'outside');
  assert.equal(footprintFit(rect(0,0,2,2),notch).location,'inside');
  assert.equal(footprintFit(rect(8,0,2,2),notch).location,'outside');
  near(overlapArea(bridge,notch),overlapArea(notch.slice().reverse(),bridge));
  // Rotated crossings introduce new heights between all four diamond vertices.
  const diamond=[[0,2],[2,0],[4,2],[2,4]];
  near(overlapArea(diamond,rect(1,1,3,2)),5);
  near(overlapArea(diamond,[...diamond,diamond[0]].reverse()),footprintArea(diamond));
  near(overlapArea(rect(0,0,2,2),rect(2,0,1,2)),0);
});

test('fresh garden envelopes are contained and the retained garage exposes its structural conflict',()=>{
  const expected=[1.03967,.84501,.85196];
  for(const [i,{data,s}] of sites.entries()){
    const report=evaluateDesignChecks(s,data);
    const expectedConflicts=s.siteId==='sternicza-11'?['garage-existing-structure']:[];
    assert.equal(report.conflictCount,expectedConflicts.length);
    assert.deepEqual(report.checks.filter(c=>c.severity==='conflict').map(c=>c.id),expectedConflicts);
    near(report.closestBoundary.distanceM,expected[i],.00001);
    assert.ok(report.checks.every(c=>c.title&&c.detail&&c.action&&c.evidence));
    assert.deepEqual(evaluateDesignChecks({...s,showDimensions:false,mode:'sun',designStyle:'test'},data),report);
  }
  const a=evaluateDesignChecks(nadmorska.s,nadmorska.data);
  assert.match(a.checks.find(c=>c.id==='parcel-record').detail,/709.29.*800.*90.71.*809/);
  assert.ok(a.checks.find(c=>c.id==='sewer-route'));
  assert.match(a.checks.find(c=>c.id==='stair-foot-grade').detail,/137–182 mm/);
  assert.match(evaluateDesignChecks(korzeniowskiego.s,korzeniowskiego.data).checks.find(c=>c.id==='parcel-record').detail,/467.72.*480.*12.28/);
  assert.ok(!ids(sternicza.s,sternicza.data).includes('sewer-route'));
});

test('finished footprints identify true obstacles and preserve intended joins',()=>{
  const {data,s}=sternicza;
  const retained=evaluateDesignChecks({...s,summerPoolLayout:false,jacuzziCentered:false,removeGarage:false},data);
  assert.match(retained.checks.find(c=>c.id==='pool-garage').detail,/9.76 m²/);
  assert.match(retained.checks.find(c=>c.id==='terrace-garage').detail,/0.58 m²/);
  // The garage existing elsewhere must not trigger the old blanket warning.
  const moved={...data,site:{...data.site,garage:{...data.site.garage,footprint:rect(1,2,2,2)}}};
  assert.ok(!spaLayoutWarnings({...s,removeGarage:false},moved).some(w=>w.includes('garage')));
  assert.ok(!ids({...s,removeGarage:false},moved).some(id=>id.endsWith('-garage')));
  assert.ok(ids({...s,spaScreensEnabled:true,spaScreenGap:.1},data).includes('spa-service'));
  const clipped=ids({...s,privacyPergolaEnabled:true,privacyPergolaX:19.5,privacyPergolaY:36},data);
  assert.ok(clipped.includes('privacy-frame-boundary'));
  const beyond={...korzeniowskiego.data,site:{...korzeniowskiego.data.site,pool:{x:60,y:50,width:3,length:6}}};
  const outside=evaluateDesignChecks(korzeniowskiego.s,beyond).checks.find(c=>c.id==='pool-boundary');
  assert.match(outside.detail,/wholly outside/);
  const dimensions=gardenDimensions(korzeniowskiego.s,beyond);
  assert.equal(dimensions.find(r=>r.id==='pool-boundary').placementStatus,'outside');
  assert.match(dimensionScheduleMarkup(dimensions),/outside parcel/);
});

test('the column-free canopy keeps its roof extent without invisible posts in any output',()=>{
  const {data,s}=sternicza,layout=terraceCover(s,data);
  const posts=canopySupportBounds(s,data),shadows=prepareSunGeometry(s,data).occluders;
  const plan=terraceCoverPlanMarkup(layout,{X:x=>x,Y:y=>y,scale:1});
  const material=new THREE.MeshBasicMaterial(),mesh=createTerraceCoverGroup(layout,{wood:material,metal:material,stone:material});
  near(layout.width,8.5);near(layout.depth,4);near(layout.undersideZ-layout.floorZ,3);near(layout.deckArea,34);
  assert.equal(layout.supportSystem,'cantilever');assert.deepEqual(posts,[]);
  assert.ok(!shadows.some(o=>o.id==='canopy-post'||o.id.includes('outrigger')));
  assert.doesNotMatch(plan,/data-terrace-cover-part="post"/);
  for(const b of layout.boxes){
    const m=mesh.getObjectByName(b.id);assert.ok(m);
    const bounds=new THREE.Box3().setFromObject(m);
    near(bounds.min.x,b.x0,1e-6);near(bounds.max.x,b.x1,1e-6);
    near(bounds.min.y,b.z0,1e-6);near(bounds.max.y,b.z1,1e-6);
    near(bounds.min.z,b.y0,1e-6);near(bounds.max.z,b.y1,1e-6);
  }
  assert.ok(!ids(s,data).includes('canopy-support'));
  for(const child of mesh.children)child.geometry.dispose();material.dispose();
});

test('all pool options use the true coping grade envelope, depth, swimmer eye and sun receiver',()=>{
  for(const {data,s} of [...sites,{data:sternicza.data,s:{...sternicza.s,gardenProgram:'classic'}}]){
    const pool=poolBounds(s,data),z=spaLevels(s,data).pool,shade=prepareSunGeometry(s,data);
    for(const [x,y] of rectCorners(pool,pool.coping)){
      const ground=gardenGroundAt(x,y,s,data);assert.ok(z.copingTopZ>=ground);assert.ok(z.copingBaseZ<ground);
    }
    near(z.waterZ-z.bottomZ,1.4);near(z.copingTopZ-z.waterZ,.10);
    near(observerForPreset('pool',s,data).z,z.waterZ+s.poolEyeAboveWater);
    assert.ok(shade.occluders.some(o=>o.id==='pool-coping'));
    assert.ok(shade.occluders.some(o=>o.id==='terrace-step'));
    const water=shade.cells.filter(c=>c.zone==='pool');
    assert.ok(water.length>0);
    for(const c of water){
      near(c.z,z.waterZ);
      assert.ok(c.sampleX>pool.x&&c.sampleX<pool.x+pool.width);
      assert.ok(c.sampleY>pool.y&&c.sampleY<pool.y+pool.length);
    }
  }
});

test('whole-drive clearance is conditional and becomes a conflict below its chosen reserve',()=>{
  const {data,s}=sternicza;
  const state={...s,basementGarageEnabled:true};
  const review=evaluateDesignChecks(state,data).checks.find(c=>c.id==='garage-drive');
  assert.equal(review.severity,'verify');assert.match(review.detail,/39 mm.*30 mm/);
  const lowered=evaluateDesignChecks({...state,garageExtraDepth:.6},data).checks.find(c=>c.id==='garage-drive');
  assert.equal(lowered.severity,'conflict');
  assert.match(lowered.detail,/underbody reserve/);
  assert.ok(!ids({...nadmorska.s,basementGarageEnabled:true},nadmorska.data).includes('garage-drive'));
});

test('changing pool freeboard moves water, swimmer, and sun receivers while the coping and jacuzzi stay fixed',()=>{
  const {data,s}=sternicza;
  const high={...s,poolFreeboard:.02,poolEyeAboveWater:.05},low={...high,poolFreeboard:.25};
  const upper=spaLevels(high,data).pool,lower=spaLevels(low,data).pool;
  near(upper.copingTopZ,lower.copingTopZ);near(upper.waterZ-lower.waterZ,.23);
  near(upper.bottomZ-lower.bottomZ,.23);
  near(observerForPreset('pool',high,data).z-observerForPreset('pool',low,data).z,.23);
  near(jacuzziBounds(high,data).waterZ,jacuzziBounds(low,data).waterZ);
  const sunHigh=prepareSunGeometry(high,data),sunLow=prepareSunGeometry(low,data);
  assert.notEqual(sunHigh,sunLow);
  near(sunHigh.cells.find(c=>c.zone==='pool').z-sunLow.cells.find(c=>c.zone==='pool').z,.23);
  // Horizontal/steep upward rays from the same low swimmer to a synthetic
  // far-side target. Neither lies on a mapped hedge or context obstruction.
  const eye=observerForPreset('pool',low,data),p=poolBounds(low,data);
  const atY=p.y+p.length+1,targets=[[eye.x,atY,eye.z],[eye.x,atY,lower.copingTopZ+1]];
  const fixture={...data,buildings:[{id:'target',kind:'target',samples:targets,highFeatures:[],roofSampleCount:2}]};
  const rays=analyzeVisibility(eye,{...low,hedgeRear:0,hedgeLeft:0,hedgeRight:0,screeningTrees:[]},fixture).rays;
  assert.equal(rays[0].blockedBy,'pool-rim');assert.equal(rays[1].poolRim,null);
  assert.equal(evaluateDesignChecks(high,data).checks.find(c=>c.id==='pool-level').severity,'verify');
});
