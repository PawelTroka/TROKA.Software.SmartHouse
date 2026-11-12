import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SITE_OPTIONS,resolveSiteId,getSiteProfile} from '../src/sites.js';
import {createStateModel,DEFAULTS,decodeState} from '../src/state.js';
import {getBuildingTargets,buildingFields,buildingAssumptions,applyBuildingOverrides} from '../src/buildings.js';
import {sunForSettings,solarPosition,localSunDirection} from '../src/solar.js';

const sternicza=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]];
function otherSite(){
  const radians=28.4*Math.PI/180;
  return {coordinates:{horizontalCRS:'EPSG:2180',latitude:54.41,longitude:18.63,
    xUnitEN:[-Math.cos(radians),Math.sin(radians)],yUnitEN:[Math.sin(radians),Math.cos(radians)],yGridAzimuth:28.4},
    site:{id:'korzeniowskiego-40',address:'Korzeniowskiego 40, Gdańsk',boundary:rect(0,0,15.8,29.6),
      rearMidpoint:[7.9,14],terrace:{x:4.3,y:14,width:7.2,depth:4},pool:{x:5,y:22,width:3,length:5},
      observers:{garden:[11,24]},sideLabels:{left:'west',right:'east'},garage:null},
    buildings:[{id:'new-70',index:70,label:'Rear neighbour',kind:'target',baseZ:2,roofZ:12,roofTopZ:12,
      footprint:rect(1,40,8,6),samples:[[5,40,12]],roofPoints:[],highFeatures:[],roofSampleCount:1},
      {id:'new-80',index:80,label:'West neighbour',kind:'target',baseZ:2,roofZ:10,roofTopZ:10,
      footprint:rect(20,20,8,6),samples:[[20,23,10]],roofPoints:[],highFeatures:[],roofSampleCount:1}]};
}

test('explicit property identity survives share links and legacy links select only Sternicza',()=>{
  assert.equal(SITE_OPTIONS.length,2);
  assert.equal(resolveSiteId('?site=korzeniowskiego-40'),'korzeniowskiego-40');
  assert.equal(resolveSiteId('?site=korzeniowskiego-40','#v=3&hedgeRear=8'),'sternicza-11');
  assert.equal(resolveSiteId('?site=sternicza-11','#v=6&site=korzeniowskiego-40'),'korzeniowskiego-40');
  assert.equal(resolveSiteId('?site=unknown'),'sternicza-11');
  assert.equal(resolveSiteId('?site=korzeniowskiego-40','#v=6&site=unknown'),'sternicza-11');
  const active=createStateModel(getSiteProfile('korzeniowskiego-40',otherSite()));
  const scenario={...active.DEFAULTS,hedgeLeft:2,hedgeRight:6,lookYaw:35,costTreePriceLeft:120,costTreePriceRight:980,b70HeightDelta:2,sunDate:'2026-12-21'};
  const link=active.encodeState(scenario),restored=active.decodeState(link);
  assert.match(link,/^v=8&site=korzeniowskiego-40&/);
  for(const key of ['siteId','hedgeLeft','hedgeRight','lookYaw','costTreePriceLeft','costTreePriceRight','b70HeightDelta','sunDate'])assert.equal(restored[key],scenario[key],key);
  assert.deepEqual(decodeState(link),DEFAULTS,'The same controls cannot be applied to another property');
  assert.deepEqual(active.decodeState('v=6&site=sternicza-11&hedgeRear=12'),active.DEFAULTS);
  assert.deepEqual(active.decodeState('v=5&hedgeRear=12'),active.DEFAULTS);
});

test('stored designs, comparisons and fresh defaults remain isolated by property',()=>{
  const model=createStateModel(getSiteProfile('korzeniowskiego-40',otherSite()));
  const saved={...model.DEFAULTS,hedgeRear:5.7,hedgeLeft:3,hedgeRight:6,gardenRaise:.3};
  assert.deepEqual(model.migrateSavedState(saved,6),saved);
  assert.deepEqual(model.migrateSavedState({...saved,siteId:'sternicza-11'},6),model.DEFAULTS);
  assert.deepEqual(model.migrateSavedState({hedgeRear:14,linkedHedges:true},5),model.DEFAULTS);
  assert.deepEqual(model.migrateSavedState({...saved,siteId:undefined},6),model.DEFAULTS);
  assert.equal(model.DEFAULTS.floorHeight,1.7);assert.equal(DEFAULTS.floorHeight,1.2);
  assert.equal(model.DEFAULTS.observerX,11);assert.equal(model.DEFAULTS.observerY,24);
  assert.equal(model.FIELDS.hedgeLeft.label,'Left hedge · west');
  assert.equal(model.FIELDS.costTreePriceRight.label,'Right / east: custom tree price');
  assert.equal(Object.hasOwn(model.FIELDS,'b9HeightDelta'),false);
  assert.equal(model.FIELDS.b70HeightDelta.label,'Rear neighbour height adjustment');
  const next=model.changeHedgeHeight(saved,'hedgeLeft',4.2);
  assert.equal(next.hedgeRight,6);assert.equal(next.hedgeRear,5.7);assert.equal(saved.hedgeLeft,3);
});

test('site-sized terrace, canopy and observer controls do not inherit the larger plot ranges',()=>{
  const data=otherSite();
  data.site.pool.y=18.8;
  const profile=getSiteProfile('korzeniowskiego-40',data),model=createStateModel(profile);
  assert.deepEqual(profile.bounds,{minX:0,maxX:15.8,minY:0,maxY:29.6});
  assert.equal(profile.rearBearingLabel,'NNE');assert.equal(profile.frontBearingLabel,'SSW');
  assert.equal(profile.leftBearingLabel,'WNW');assert.equal(profile.rightBearingLabel,'ESE');
  const max=model.sanitizeState({canopyWidth:50,terraceDepth:20,observerX:100,observerY:100});
  assert.equal(max.canopyWidth,7.2);assert.equal(max.terraceDepth,4.3);
  assert.ok(max.observerX<15.8&&max.observerY<29.6);
  const canopy=model.scenarioState('canopy',{...model.DEFAULTS,floorHeight:1.9,sunMinutes:960});
  assert.equal(canopy.canopyWidth,7.2);assert.equal(canopy.canopyDepth,4);
  assert.equal(canopy.floorHeight,1.9);assert.equal(canopy.sunMinutes,960);
  assert.throws(()=>getSiteProfile('sternicza-11',data),/does not match/);
});

test('building adjustment fields and transforms use actual selected-site target identities',()=>{
  const data=otherSite(),targets=getBuildingTargets(data),fields=buildingFields(data);
  assert.deepEqual(targets.map(b=>b.index),[70,80]);
  assert.equal(Object.keys(fields).length,4);
  assert.equal(targets[0].id,'new-70');
  const changed=applyBuildingOverrides(data,{b70HeightDelta:3,b80DistanceDelta:5,b9HeightDelta:10});
  assert.equal(changed.buildings[0].roofTopZ,15);
  assert.equal(changed.buildings[1].roofTopZ,10);
  const baseline=buildingAssumptions(data),adjusted=buildingAssumptions(data,{b80DistanceDelta:5});
  assert.equal(adjusted[1].distance-baseline[1].distance,5);
  assert.strictEqual(applyBuildingOverrides(changed,{}),data);
  assert.equal(getBuildingTargets({buildings:[]}).length,0);
});

test('solar position, day events and daily path use active coordinates without cross-site cache reuse',()=>{
  const settings={sunDate:'2026-06-21',sunMinutes:720},data=otherSite();
  // A deliberately distant synthetic location makes a stale global cache observable.
  data.coordinates.latitude=40;data.coordinates.longitude=5;
  const baseline=sunForSettings(settings,sternicza),other=sunForSettings(settings,data);
  const expected=solarPosition(other.utc,40,5);
  assert.equal(other.latitude,40);assert.equal(other.longitude,5);
  assert.equal(other.elevation,expected.elevation);assert.equal(other.azimuth,expected.azimuth);
  assert.ok(Math.abs(other.noonMinutes-baseline.noonMinutes)>40);
  assert.ok(Math.abs(other.daylightMinutes-baseline.daylightMinutes)>60);
  assert.equal(other.path.find(p=>p.minutes===720).elevation,other.elevation);
  assert.equal(sunForSettings(settings,sternicza).noonMinutes,baseline.noonMinutes);
  const oldPath=other.path;
  data.coordinates.longitude=10;
  const moved=sunForSettings(settings,data);
  assert.notStrictEqual(moved.path,oldPath);
  assert.ok(Math.abs(moved.noonMinutes-other.noonMinutes)>19);
  assert.equal(moved.path.find(p=>p.minutes===720).azimuth,moved.azimuth);
});

test('the second canonical frame is left-handed and its compass and sun use its north-facing rear axis',()=>{
  const data=otherSite(),{xUnitEN:x,yUnitEN:y}=data.coordinates;
  assert.ok(Math.abs(x[0]*y[1]-x[1]*y[0]+1)<1e-12);
  const sun=sunForSettings({sunDate:'2026-03-20',sunMinutes:720},data);
  const rear=localSunDirection(28.4+sun.gridConvergenceDegrees,0,data);
  assert.ok(Math.abs(rear[0])<1e-12&&Math.abs(rear[1]-1)<1e-12);
  assert.ok(localSunDirection(0,0,data)[1]>0,'True north points into the Korzeniowskiego garden');
  assert.ok(localSunDirection(0,0,sternicza)[1]<0,'True north points toward Sternicza frontage');
});

test('the actual Korzeniowskiego profile exposes its own mapped dimensions, targets and constrained design',()=>{
  const data=JSON.parse(readFileSync(new URL('../data/korzeniowskiego-40.json',import.meta.url)));
  const profile=getSiteProfile('korzeniowskiego-40',data),model=createStateModel(profile);
  assert.equal(profile.id,data.site.id);
  assert.ok(data.site.area>460&&data.site.area<475);
  assert.ok(data.site.frontage>15&&data.site.frontage<16);
  assert.ok(data.site.depth>29&&data.site.depth<31);
  assert.equal(profile.rearBearingLabel,'NNE');
  assert.equal(profile.hasGarage,false);
  assert.deepEqual(profile.buildingTargets.map(b=>b.index),[1,3,8,9,12]);
  assert.equal(model.DEFAULTS.floorHeight,1.7);
  assert.equal(model.DEFAULTS.canopyWidth,7.5);
  assert.equal(model.FIELDS.canopyWidth.max,7.5);
  assert.equal(model.DEFAULTS.terraceDepth,4.2);
  assert.equal(model.DEFAULTS.observerX,10.8);
  assert.equal(model.DEFAULTS.observerY,26);
  assert.equal(model.FIELDS.b9HeightDelta.label,'Rear neighbour · centre height adjustment');
  const sunlight=sunForSettings(model.DEFAULTS,data);
  assert.equal(sunlight.latitude,data.coordinates.latitude);
  assert.equal(sunlight.longitude,data.coordinates.longitude);
  assert.notEqual(sunlight.latitude,sunForSettings(DEFAULTS,sternicza).latitude);
});
