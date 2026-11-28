import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdaptiveMotionQuality} from '../src/frame-performance.js';

test('observed severe queue pressure advances only existing scales with the same cooldown and floor',()=>{
  const quality=createAdaptiveMotionQuality();
  for(const age of [0,16,249,250,NaN,Infinity])assert.equal(quality.pressure(100,age),false);
  assert.equal(quality.scale,1);assert.equal(quality.pressure(100,251),true);assert.equal(quality.scale,.84);
  assert.equal(quality.pressure(999,1000),false,'Pressure does not bypass the existing900ms cooldown');
  assert.equal(quality.pressure(1000,1100),true);assert.equal(quality.scale,.68);
  assert.equal(quality.pressure(1900,2000),true);assert.equal(quality.scale,.54);
  for(let i=0;i<100;i++)assert.equal(quality.pressure(3000+i*1000,60000),false);
  const diagnostics=quality.getDiagnostics();assert.equal(diagnostics.changes,3);assert.equal(diagnostics.pressureChanges,3);
  assert.equal(diagnostics.minimumScale,.54);assert.equal(diagnostics.lastP75Ms,0,'Queue age is not reported as a delivered-frame percentile');
});

test('sample-driven and pressure-driven reductions share cooldown and clear stale sample windows',()=>{
  const quality=createAdaptiveMotionQuality();quality.pressure(0,300);
  for(let i=1;i<=8;i++)assert.equal(quality.sample(i*100,34,true),false);
  assert.equal(quality.sample(900,34,true),true);assert.equal(quality.scale,.68);
  assert.equal(quality.pressure(1799,2000),false);assert.equal(quality.pressure(1800,2000),true);assert.equal(quality.scale,.54);
  const diagnostics=quality.getDiagnostics();assert.equal(diagnostics.changes,3);assert.equal(diagnostics.pressureChanges,2);assert.equal(diagnostics.lastP75Ms,34);
  quality.reset();assert.equal(quality.scale,1);assert.equal(quality.getDiagnostics().pressureChanges,0);assert.equal(quality.getDiagnostics().lastPressureAgeMs,0);
  for(let i=1;i<=7;i++)assert.equal(quality.sample(i*100,34,true),false,'Reset and pressure cannot leave an old slow sample window');
});

test('fast delivery and shallow queues keep full quality while resting retains the learned motion scale',()=>{
  const quality=createAdaptiveMotionQuality();
  for(let i=1;i<=180;i++){assert.equal(quality.sample(i*16,16,true),false);assert.equal(quality.pressure(i*16,32),false);}
  assert.equal(quality.scale,1);assert.equal(quality.pressure(3000,300),true);
  quality.sample(3100,100,false);assert.equal(quality.scale,.84,'The existing between-gesture learned scale remains stable');
  assert.equal(quality.getDiagnostics().pressureChanges,1);
});
