import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {requiredEyeForWater,requiredEyeForHorizon,EARTH_RADIUS_M} from '../src/sea-visibility.js';

const data=JSON.parse(fs.readFileSync(new URL('../data/sternicza-sea-corridor.json',import.meta.url)));

test('short-distance curvature approximation agrees with independent spherical line geometry',()=>{
  const R=EARTH_RADIUS_M;
  // Observer and sea target lie on radial axes. Solve the line through a
  // spherical obstacle and water target for its observer-axis intercept.
  for(const [top,d,D,sea] of [[20,600,1800,0],[35,1000,2200,0],[10,300,1400,.3]]){
    const a=d/R,b=D/R,p=[(R+top)*Math.cos(a),(R+top)*Math.sin(a)];
    const t=[(R+sea)*Math.cos(b),(R+sea)*Math.sin(b)];
    const exact=(p[0]*t[1]-t[0]*p[1])/(t[1]-p[1])-R;
    assert.ok(Math.abs(requiredEyeForWater(top,d,D,sea)-exact)<.001);
    const tangentAngle=d/R+Math.acos(R/(R+top));
    const exactHorizon=R/Math.cos(tangentAngle)-R;
    assert.ok(Math.abs(requiredEyeForHorizon(top,d)-exactHorizon)<.001);
  }
});

test('retained sea-bearing vectors and shoreline endpoints reconstruct the native north/east frame',()=>{
  const {xUnitEN:ux,yUnitEN:uy}=data.coordinates;
  for(const observer of data.observers)for(const profile of observer.profiles){
    const [dx,dy]=profile.directionXY,theta=profile.bearingGrid*Math.PI/180;
    const e=dx*ux[0]+dy*uy[0],n=dx*ux[1]+dy*uy[1];
    assert.ok(Math.abs(e-Math.sin(theta))<1e-8,'Grid bearing must use east=sin, north=cos');
    assert.ok(Math.abs(n-Math.cos(theta))<1e-8);
    for(let i=0;i<2;i++)assert.ok(Math.abs(observer.xy[i]+profile.directionXY[i]*profile.shoreDistanceM-profile.shoreXY[i])<.002,
      'Local-frame shoreline endpoint must be on its stated ray; no mirroring or swapped axes');
    assert.ok(profile.directionXY[1]<0,'The sampled sea fan is beyond the front of Sternicza, not behind its garden');
  }
});

test('full sea profiles retain local obstructions before the distant skyline',()=>{
  for(const observer of data.observers){
    assert.ok(Number.isFinite(observer.groundZ)&&observer.groundZ>1&&observer.groundZ<4);
    for(const profile of observer.profiles){
      assert.ok(profile.surfaceZ.length>500);
      assert.ok(profile.surfaceZ.slice(0,100).some(z=>Number.isFinite(z)&&z>observer.groundZ+5),
        'A distant sea profile must also retain the nearby house/building/tree obstruction corridor');
      assert.ok(profile.surfaceZ.slice(250).some(z=>Number.isFinite(z)&&z>15),
        'The old 200 m neighbourhood does not cover the controlling coastal skyline');
    }
  }
});
