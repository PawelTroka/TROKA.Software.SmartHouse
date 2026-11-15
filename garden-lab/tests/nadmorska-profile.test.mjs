import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SITE_OPTIONS,getSiteProfile,resolveSiteId} from '../src/sites.js';
import {createStateModel,STATE_VERSION} from '../src/state.js';
import {UPPER_FLOOR_PRESETS} from '../src/viewpoints.js';

const rect=(x,y,width,depth)=>[[x,y],[x+width,y],[x+width,y+depth],[x,y+depth],[x,y]];
// Deliberately synthetic geometry and unequal hedge heights exercise the data
// contract independently of the real site's current proposal or orientation.
function nadmorskaFixture(){
  return {
    coordinates:{latitude:54.42,longitude:18.6,xUnitEN:[Math.SQRT1_2,Math.SQRT1_2],yUnitEN:[Math.SQRT1_2,-Math.SQRT1_2],gridConvergenceDegrees:-.3},
    site:{id:'nadmorska-17',address:'Nadmorska 17, Gdańsk Jelitkowo',streetLabel:'NADMORSKA',
      boundary:rect(-1,0,29,35),boundaryNames:['street','left','rear','right'],
      house:{footprint:rect(5,3,16,10)},rearMidpoint:[13,13],
      terrace:{x:5,y:13,width:9,depth:3.5},pool:{x:20,y:16,width:3,length:9},
      observers:{garden:[15,23],front:[13,1]},sideLabels:{left:'northeast',right:'southwest'},edgeLabels:{front:'Neighbour boundary'},
      defaultFloorHeight:1.5,defaultGardenRaise:0,defaultHedges:{rear:3,left:4,right:2.5,front:3.5},
      frontHedgeEnabled:true,garage:null},
    buildings:[{id:'nadmorska-test-neighbour',index:203,label:'Street neighbour',kind:'target',
      footprint:rect(4,-15,10,8),baseZ:2,roofZ:11,roofTopZ:11,samples:[[8,-7,11]],roofPoints:[],highFeatures:[],roofSampleCount:1}],
  };
}
const nadmorskaModel=()=>createStateModel(getSiteProfile('nadmorska-17',nadmorskaFixture()));

test('Nadmorska selects its own dataset and shared designs override another property URL',()=>{
  const option=SITE_OPTIONS.find(site=>site.id==='nadmorska-17');
  assert.equal(option.label,'Nadmorska 17');
  assert.equal(option.dataPath,'data/nadmorska-17.json');
  assert.match(option.address,/Gdańsk Jelitkowo/);
  assert.equal(resolveSiteId('?site=nadmorska-17'),'nadmorska-17');
  assert.equal(resolveSiteId('?site=sternicza-11',`#v=${STATE_VERSION}&site=nadmorska-17`),'nadmorska-17');
  assert.equal(resolveSiteId('?site=nadmorska-17',`#v=${STATE_VERSION}&site=korzeniowskiego-40`),'korzeniowskiego-40');
  assert.equal(resolveSiteId('?site=nadmorska-17','#v=5&hedgeRear=8'),'sternicza-11');
});

test('Nadmorska profile uses its coordinates, ground level, building targets and footprint limits',()=>{
  const data=nadmorskaFixture(),profile=getSiteProfile('nadmorska-17',data),model=createStateModel(profile);
  assert.deepEqual(profile.bounds,{minX:-1,maxX:28,minY:0,maxY:35});
  assert.equal(profile.rearBearing,134.7);
  assert.equal(profile.rearBearingLabel,'SE');
  assert.equal(profile.frontBearingLabel,'NW');
  assert.equal(profile.leftBearingLabel,'NE');
  assert.equal(profile.rightBearingLabel,'SW');
  assert.equal(profile.latitude,data.coordinates.latitude);
  assert.equal(profile.longitude,data.coordinates.longitude);
  assert.equal(model.DEFAULTS.floorHeight,1.5);
  assert.equal(model.DEFAULTS.gardenRaise,0);
  assert.equal(model.DEFAULTS.costUsePlanningAllowances,true);
  assert.equal(model.DEFAULTS.canopyWidth,9);
  assert.equal(model.DEFAULTS.terraceDepth,3.5);
  assert.equal(model.DEFAULTS.observerX,15);
  assert.equal(model.DEFAULTS.observerY,23);
  assert.equal(model.FIELDS.hedgeLeft.label,'Left hedge · northeast');
  assert.equal(model.FIELDS.hedgeFront.label,'Front hedge · Neighbour boundary');
  assert.equal(model.FIELDS.costTreePriceFront.label,'Front / Neighbour boundary: custom tree price');
  assert.deepEqual(profile.buildingTargets.map(building=>building.index),[203]);
  assert.equal(Object.hasOwn(model.FIELDS,'b9HeightDelta'),false);
  assert.equal(model.FIELDS.b203HeightDelta.label,'Street neighbour height adjustment');
  const clamped=model.sanitizeState({observerX:100,observerY:-100,canopyWidth:100});
  assert.equal(clamped.observerX,27.95);
  assert.equal(clamped.observerY,.05);
  assert.equal(clamped.canopyWidth,9);
  assert.throws(()=>getSiteProfile('korzeniowskiego-40',data),/does not match/);
});

test('Nadmorska supports front and full-perimeter hedges without inheriting the Sternicza spa layout',()=>{
  const profile=getSiteProfile('nadmorska-17',nadmorskaFixture()),model=createStateModel(profile);
  assert.equal(profile.hasFrontHedge,true);
  assert.equal(profile.hasFullPerimeterHedges,true);
  assert.equal(model.DEFAULTS.hedgeFullPerimeter,true);
  assert.equal(model.DEFAULTS.hedgeFront,3.5);
  assert.equal(model.DEFAULTS.hedgeRear,3);
  assert.equal(model.DEFAULTS.hedgeRight,2.5);
  assert.equal(model.DEFAULTS.gardenProgram,'classic');
  assert.deepEqual(model.DEFAULTS.screeningTrees,[]);
  const front=model.sanitizeState({...model.DEFAULTS,preset:'front',eyeHeight:1.65,hedgeFront:4.7,hedgeFullPerimeter:true,gardenProgram:'spa-pool-grove'});
  assert.equal(front.preset,'front');
  assert.equal(front.hedgeFront,4.7);
  assert.equal(front.hedgeFullPerimeter,true);
  assert.equal(front.gardenProgram,'classic');
  const linked=model.changeHedgeHeight({...front,linkedHedges:true},'hedgeFront',5.2);
  for(const side of ['Rear','Left','Right','Front'])assert.equal(linked[`hedge${side}`],5.2);
  const tall=model.scenarioState('tall',front);
  for(const side of ['Rear','Left','Right','Front'])assert.equal(tall[`hedge${side}`],6);
  const noFront=model.scenarioState('tall',{...front,hedgeFront:0});
  assert.equal(noFront.hedgeFront,0,'A deliberately disabled front hedge stays off when comparing a taller rear screen');
});

test('explicitly disabling a dataset front screen disables unsupported front state',()=>{
  const data=nadmorskaFixture();data.site.frontHedgeEnabled=false;
  const profile=getSiteProfile('nadmorska-17',data),model=createStateModel(profile);
  assert.equal(profile.hasFrontHedge,false);
  assert.equal(profile.hasFullPerimeterHedges,false);
  const state=model.sanitizeState({hedgeFront:8,hedgeFullPerimeter:true,preset:'front'});
  assert.equal(state.hedgeFront,0);
  assert.equal(state.hedgeFullPerimeter,false);
  assert.equal(state.preset,'garden');
});

test('all eight upstairs viewpoints and night controls round-trip in Nadmorska share links',()=>{
  const model=nadmorskaModel();
  for(const preset of UPPER_FLOOR_PRESETS){
    const state=model.sanitizeState({...model.DEFAULTS,preset:preset.id,eyeHeight:preset.eyeHeight,
      firstFloorRise:3.15,atticRise:6.35,mode:'eye',lookYaw:preset.defaultLookYaw,lookPitch:preset.defaultLookPitch,
      sunDate:'2026-12-21',sunMinutes:1320,nightGardenLights:true,nightGardenIntensity:63,
      nightWindowLights:true,nightWindowActivity:42,nightWindowIntensity:58});
    const restored=model.decodeState(model.encodeState(state));
    assert.deepEqual(restored,state,preset.id);
    assert.equal(restored.floorHeight,1.5);
    assert.equal(restored.gardenRaise,0);
  }
});

test('saved and shared Nadmorska designs cannot change either existing property',()=>{
  const model=nadmorskaModel();
  const saved=model.sanitizeState({...model.DEFAULTS,hedgeRear:7.1,hedgeFront:5.3,nightWindowActivity:91,b203HeightDelta:2,preset:'front'});
  const encoded=model.encodeState(saved);
  for(const [id,path] of [['sternicza-11','site-data.json'],['korzeniowskiego-40','korzeniowskiego-40.json']]){
    const data=JSON.parse(readFileSync(new URL(`../data/${path}`,import.meta.url)));
    const other=createStateModel(getSiteProfile(id,data));
    assert.deepEqual(other.decodeState(encoded),other.DEFAULTS,id);
    assert.deepEqual(other.migrateSavedState(saved,STATE_VERSION),other.DEFAULTS,id);
    assert.deepEqual(model.decodeState(other.encodeState({...other.DEFAULTS,hedgeRear:8})),model.DEFAULTS,id);
    assert.deepEqual(model.migrateSavedState({...saved,siteId:id},STATE_VERSION),model.DEFAULTS,id);
    if(id==='korzeniowskiego-40'){
      assert.equal(other.DEFAULTS.floorHeight,1.7);
      assert.equal(other.DEFAULTS.gardenRaise,.5);
      assert.equal(other.DEFAULTS.hedgeFront,0);
      assert.equal(other.DEFAULTS.hedgeFullPerimeter,false);
      assert.equal(other.DEFAULTS.costUsePlanningAllowances,false);
      assert.equal(other.sanitizeState({preset:'front',hedgeFront:6}).preset,'garden');
    }else{
      assert.equal(other.DEFAULTS.floorHeight,1.2);
      assert.equal(other.DEFAULTS.gardenProgram,'spa-pool-grove');
      assert.equal(other.DEFAULTS.screeningTrees.length,3);
    }
  }
  assert.deepEqual(model.migrateSavedState(saved,STATE_VERSION),saved);
});

test('Nadmorska does not guess Korzeniowskiego orientation or fill when data is not supplied',()=>{
  const profile=getSiteProfile('nadmorska-17');
  assert.equal(profile.defaults.floorHeight,1.5);
  assert.equal(profile.defaults.gardenRaise,0);
  assert.equal(profile.rearBearingLabel,'—');
  assert.equal(profile.latitude,undefined);
  assert.equal(profile.longitude,undefined);
});
