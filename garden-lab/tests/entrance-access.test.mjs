import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {entranceAccessLayout} from '../src/entrance-access.js';
import {houseAppearanceLayout} from '../src/house-appearance.js';
import {createPhotoHouseGroup} from '../src/scene-house.js';
import {terrainAt,frontHedgeLayout} from '../src/geometry.js';
import {garageLayout} from '../src/garage-ramp.js';
import {GARAGE_DEFAULTS} from '../src/garage-options.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const base={...GARAGE_DEFAULTS,siteId:'sternicza-11',firstFloorRise:3,hedgeFront:4,hedgeInset:.5};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
const bounds=ring=>({x:Math.min(...ring.map(p=>p[0])),y:Math.min(...ring.map(p=>p[1])),
  width:Math.max(...ring.map(p=>p[0]))-Math.min(...ring.map(p=>p[0])),length:Math.max(...ring.map(p=>p[1]))-Math.min(...ring.map(p=>p[1]))});
const overlaps=(a,b,margin=0)=>a.x+a.width>b.x+margin&&b.x+b.width>a.x+margin&&a.y+a.length>b.y+margin&&b.y+b.length>a.y+margin;
const contains=(r,p)=>p[0]>=r.x-1e-7&&p[0]<=r.x+r.width+1e-7&&p[1]>=r.y-1e-7&&p[1]<=r.y+r.length+1e-7;
const evaluate=(floorHeight,enabled)=>{
  const settings={...base,floorHeight,basementGarageEnabled:enabled},garage=garageLayout(settings,data,{terrainAt});
  const house=houseAppearanceLayout(data,settings,{garageLayout:garage}),gate=frontHedgeLayout(settings,data).openings.find(g=>g.id==='front-pedestrian-opening');
  return {settings,garage,house,gate,access:entranceAccessLayout(house,{groundAt:(x,y)=>terrainAt(x,y,data),gate})};
};

for(const floorHeight of [.6,1.2,2.2])test(`gate approach reaches the actual stair bottom at ${floorHeight.toFixed(1)} m living-floor rise`,()=>{
  for(const enabled of [false,true]){
    const {access,house,gate}=evaluate(floorHeight,enabled),{stairs,paving}=access;
    assert.equal(stairs.type,enabled?'return':'front');assert.deepEqual(access.route.at(-1),stairs.bottom);
    near(stairs.topZ,house.floorZ);assert.ok(stairs.riser<=.18+1e-7);
    assert.ok(paving.some(pad=>contains(pad,stairs.bottom)));assert.ok(paving.some(pad=>contains(pad,access.gateCentre)));
    near(access.pathWidth,gate.width);
    const seen=new Set([0]);
    for(let changed=true;changed;){changed=false;for(let i=0;i<paving.length;i++)if(!seen.has(i)&&[...seen].some(j=>overlaps(paving[i],paving[j],-1e-7))){seen.add(i);changed=true;}}
    assert.equal(seen.size,paving.length,'Every paved piece connects to the gate approach');
    if(enabled)for(const pad of paving)for(const step of stairs.steps)assert.equal(overlaps(pad,bounds(step.footprint),1e-7),false,'The approach must end at the foot instead of entering a higher tread');
  }
});

test('an inactive wide-garage frame never selects its proposed side-return entrance',()=>{
  const {garage,house,access}=evaluate(1.2,false);
  assert.ok(garage.entryAccess,'The inactive wide frame still carries a proposal');
  assert.equal(house.entryAccess,null);assert.equal(access.stairs.type,'front');
  near(access.gateCentre[0],9.16);
});

test('rendered stair solids use the same footprints and elevations as the paved approach',()=>{
  for(const floorHeight of [.6,1.2,2.2])for(const enabled of [false,true]){
    const {settings,garage,access}=evaluate(floorHeight,enabled),group=createPhotoHouseGroup(data,settings,{terrainAt,garageLayout:garage});
    for(const step of access.stairs.steps){
      const mesh=group.getObjectByName(step.id);assert.ok(mesh,step.id);
      const box=new THREE.Box3().setFromObject(mesh),r=bounds(step.footprint);
      near(box.min.x,r.x);near(box.max.x,r.x+r.width);near(box.min.z,r.y);near(box.max.z,r.y+r.length);
      near(box.min.y,step.baseZ);near(box.max.y,step.topZ);
    }
    assert.deepEqual(group.userData.entranceAccess.stairs,access.stairs);
  }
});
