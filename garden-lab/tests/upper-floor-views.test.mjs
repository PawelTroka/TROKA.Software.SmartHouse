import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {UPPER_FLOOR_PRESETS,upperFloorPreset,upperFloorWindowPosition} from '../src/viewpoints.js';
import {observerForPreset,floorElevation,pointInPolygon,buildingIntersection} from '../src/geometry.js';
import {gazeDirection} from '../src/orientation.js';

const sites = ['site-data','korzeniowskiego-40'].map(name =>
  JSON.parse(fs.readFileSync(new URL(`../data/${name}.json`,import.meta.url),'utf8')));
const near = (actual,expected) => assert.ok(Math.abs(actual-expected)<1e-8,`${actual} ≠ ${expected}`);

test('upper outlooks cover all eight level, direction, and posture combinations',()=>{
  assert.equal(UPPER_FLOOR_PRESETS.length,8);
  const combinations = new Set(UPPER_FLOOR_PRESETS.map(p=>`${p.level}/${p.facing}/${p.posture}`));
  assert.equal(combinations.size,8);
  for (const level of ['first','attic']) for (const facing of ['garden','street']) for (const posture of ['seated','standing']) {
    const preset = upperFloorPreset(`${level}-${facing}-${posture}`);
    assert.ok(preset);
    assert.equal(preset.floorLevel,level==='first'?1:2);
    assert.equal(preset.eyeHeight,posture==='seated'?1.2:1.65);
  }
  assert.equal(upperFloorPreset('sofa'),undefined);
});

for (const data of sites) {
  const site = data.site.address;
  test(`${site}: upper eyes follow their own floor levels, independently of raised soil`,()=>{
    for (const preset of UPPER_FLOOR_PRESETS) {
      const state = {floorHeight:1.4,firstFloorRise:3.15,atticRise:6.35};
      const eye = observerForPreset(preset.id,state,data);
      const expectedRise = preset.level==='first'?3.15:6.35;
      near(eye.groundZ,floorElevation(state,data)+expectedRise);
      near(eye.z,eye.groundZ+preset.eyeHeight);
      assert.equal(eye.surface,'upper-floor');
      assert.equal(eye.level,preset.level);
      assert.equal(eye.floorLevel,preset.floorLevel);
      assert.equal(eye.facing,preset.facing);
      assert.equal(eye.posture,preset.posture);
      assert.equal(eye.windowAssumed,true);
      near(eye.floorRise,expectedRise);
      const filled = observerForPreset(preset.id,{...state,gardenRaise:1,bedRaise:1},data);
      near(filled.z,eye.z);
      const tallerFloor = observerForPreset(preset.id,{...state,floorHeight:1.9},data);
      near(tallerFloor.z-eye.z,.5);
    }
  });

  test(`${site}: concept window eyes clear the mapped house and stay on the plot`,()=>{
    for (const preset of UPPER_FLOOR_PRESETS) {
      const eye = observerForPreset(preset.id,{},data);
      assert.equal(pointInPolygon([eye.x,eye.y],data.site.house.footprint),false);
      assert.equal(pointInPolygon([eye.x,eye.y],data.site.boundary),true);
      assert.equal(pointInPolygon([eye.facadePosition.x,eye.facadePosition.y],data.site.house.footprint),true);
      near(Math.hypot(eye.x-eye.facadePosition.x,eye.y-eye.facadePosition.y),.25);
      near(eye.facadeOffset,.25);
    }
  });

  test(`${site}: front and rear outlooks face outwards without removing the own-house blocker`,()=>{
    for (const preset of UPPER_FLOOR_PRESETS) {
      const eye = observerForPreset(preset.id,{},data);
      const direction = gazeDirection(eye.defaultLookYaw,eye.defaultLookPitch);
      assert.equal(Math.sign(direction[1]),preset.facing==='garden'?1:-1);
      assert.ok(direction[2]<0,'A small downward pitch includes the garden or street');
      const target = [eye.x+direction[0]*30,eye.y+direction[1]*30,eye.z+direction[2]*30];
      assert.equal(buildingIntersection(eye,target,data.site.house),null);
    }
    for (const facing of ['garden','street']) {
      const eye = observerForPreset(`first-${facing}-seated`,{},data);
      const target = [eye.x,eye.y+(facing==='garden'?-30:30),eye.z];
      assert.ok(buildingIntersection(eye,target,data.site.house),'Turning back through the house still hits the house');
    }
  });

  test(`${site}: posture and explicit eye-height adjustments preserve the assumed window position`,()=>{
    for (const level of ['first','attic']) for (const facing of ['garden','street']) {
      const seated = observerForPreset(`${level}-${facing}-seated`,{},data);
      const standing = observerForPreset(`${level}-${facing}-standing`,{},data);
      near(standing.z-seated.z,.45);
      near(standing.x,seated.x);near(standing.y,seated.y);near(standing.groundZ,seated.groundZ);
      const customEye = observerForPreset(`${level}-${facing}-standing`,{eyeHeight:1.75},data);
      near(customEye.z-standing.z,.10);
    }
  });
}

test('front window placement follows a stepped mapped facade instead of a bounding-box edge',()=>{
  const data = {site:{house:{footprint:[[0,0],[2,0],[2,2],[10,2],[10,12],[0,12],[0,0]]}}};
  const front = upperFloorWindowPosition('street',data),rear = upperFloorWindowPosition('garden',data);
  near(front.x,5);near(front.facadePosition.y,2);near(front.y,1.75);
  near(rear.x,5);near(rear.facadePosition.y,12);near(rear.y,12.25);
});

test('new floor settings do not move any existing ground-floor or garden viewpoint',()=>{
  for (const data of sites) for (const preset of ['sofa','standing','terrace','jacuzzi','garden','custom']) {
    const before = observerForPreset(preset,{},data);
    const after = observerForPreset(preset,{firstFloorRise:4.2,atticRise:7.6},data);
    assert.deepEqual(after,before);
  }
});
