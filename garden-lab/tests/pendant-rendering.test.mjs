import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGardenNightLighting} from '../src/scene-night-lights.js';
import {nightLightingState} from '../src/night-lighting.js';
import {pendantLightingLayout} from '../src/pendant-layout.js';
import {createStateModel} from '../src/state.js';
import {getSiteProfile} from '../src/sites.js';
import {estimateGardenCosts} from '../src/costs.js';

const properties=['site-data.json','korzeniowskiego-40.json','nadmorska-17.json'].map(file=>{
  const data=JSON.parse(readFileSync(new URL('../data/'+file,import.meta.url)));
  return {data,settings:createStateModel(getSiteProfile(data.site.id,data)).DEFAULTS};
});

test('every property renders hanging shades, supports and independent bounded light channels',()=>{
  for(const {data,settings} of properties){
    const lighting=createGardenNightLighting(settings,data),objects=[];
    lighting.group.traverse(object=>objects.push(object));
    const lamps=objects.filter(object=>object.isLight),shades=objects.filter(object=>object.name.endsWith('-woven-shade'));
    const layout=pendantLightingLayout(settings,data);
    try{
      assert.equal(shades.length,layout.garden.length+layout.hedge.length);
      assert.ok(lamps.length<=39);
      assert.equal(lamps.filter(object=>object.userData.nightChannel==='pendant').length,layout.garden.length);
      assert.equal(lamps.filter(object=>object.userData.nightChannel==='hedge').length,layout.hedge.length);
      for(const shade of shades){
        assert.ok(shade.geometry.attributes.position.count>0);
        assert.ok(Array.from(shade.geometry.attributes.position.array).every(Number.isFinite));
        assert.equal(shade.castShadow,false,'Decorative shades do not claim new opaque-screen credit');
      }
      lighting.apply({gardenStrength:0,pendantStrength:.65,hedgeStrength:0});
      assert.ok(lamps.every(lamp=>lamp.visible===(lamp.userData.nightChannel==='pendant')));
      lighting.apply({gardenStrength:0,pendantStrength:0,hedgeStrength:.55});
      assert.ok(lamps.every(lamp=>lamp.visible===(lamp.userData.nightChannel==='hedge')));
      lighting.apply(nightLightingState({enabled:true,elevation:-15},{...settings,nightGardenLights:false}));
      assert.ok(lamps.every(lamp=>!lamp.visible&&lamp.intensity===0));
      assert.ok(objects.filter(object=>object.name.endsWith('-glowing-core')).every(object=>!object.visible));
      assert.ok(shades.every(shade=>shade.visible),'Switching lights off keeps installed shades visible in daylight');
    }finally{lighting.dispose();}
  }
});

test('SVG keeps the same hanging fixture layout and switches without adding unsupported lights',()=>{
  const {data,settings}=properties[2],lighting=createGardenNightLighting(settings,data,{svgMode:true});
  try{
    assert.equal(lighting.lightCount,0);
    const cores=[];lighting.group.traverse(object=>{if(object.name.endsWith('-glowing-core'))cores.push(object);});
    assert.ok(cores.length>3);
    lighting.apply({gardenStrength:0,pendantStrength:.6,hedgeStrength:0});
    assert.equal(cores.filter(object=>object.visible).length,3);
    lighting.apply({gardenStrength:0,pendantStrength:0,hedgeStrength:.5});
    assert.equal(cores.filter(object=>object.visible).length,lighting.fixtures.filter(f=>f.kind==='hedge-pendant').length);
  }finally{lighting.dispose();}
});

test('every hanging shade glows with its own channel in WebGL and SVG and goes dark in daylight',()=>{
  for(const {data,settings} of properties)for(const svgMode of [false,true]){
    const lighting=createGardenNightLighting(settings,data,{svgMode});
    try{
      const hanging=lighting.fixtures.filter(f=>f.channel==='pendant'||f.channel==='hedge');
      const emitted=fixture=>{
        const {material}=lighting.group.getObjectByName(`${fixture.id}-woven-shade`);
        const components=[material.emissive.r,material.emissive.g,material.emissive.b,material.emissiveIntensity];
        assert.ok(components.every(value=>Number.isFinite(value)&&value>=0),fixture.id+' has finite emission');
        return (material.emissive.r+material.emissive.g+material.emissive.b)*(svgMode?1:material.emissiveIntensity);
      };
      const hedgeFixtures=hanging.filter(f=>f.channel==='hedge');
      assert.ok(hedgeFixtures.length>4,'Exercise the full inner-hedge lighting circuit');
      for(const channel of ['pendant','hedge']){
        lighting.apply({gardenStrength:0,pendantStrength:channel==='pendant'?.8:0,hedgeStrength:channel==='hedge'?.85:0});
        for(const fixture of hanging)assert.equal(emitted(fixture)>0,fixture.channel===channel,fixture.id+' follows only its own channel');
      }
      const bright=hedgeFixtures.map(emitted);
      lighting.apply({gardenStrength:0,pendantStrength:0,hedgeStrength:.2});
      hedgeFixtures.forEach((fixture,i)=>assert.ok(emitted(fixture)>0&&emitted(fixture)<bright[i],fixture.id+' shade dims with its own channel'));
      for(const [solar,state] of [
        [{enabled:true,elevation:20},settings],
        [{enabled:true,elevation:-15},{...settings,nightGardenLights:false}],
      ]){
        lighting.apply(nightLightingState(solar,state));
        for(const fixture of hanging)assert.equal(emitted(fixture),0,fixture.id+' extinguishes in daylight and under the garden master');
      }
      assert.ok(lighting.lightCount<=39,'The complete lighting circuit stays bounded');
    }finally{lighting.dispose();}
  }
});

test('every inner-hedge lantern casts stronger local light onto foliage and ground without adding shadows',()=>{
  for(const {data,settings} of properties){
    const lighting=createGardenNightLighting(settings,data);
    try{
      const hedgeFixtures=lighting.fixtures.filter(f=>f.channel==='hedge');
      assert.ok(hedgeFixtures.length>4&&hedgeFixtures.length<=24);
      lighting.apply({gardenStrength:0,pendantStrength:.8,hedgeStrength:.85});
      for(const fixture of hedgeFixtures){
        const lamp=lighting.group.getObjectByName(`${fixture.id}-light`);
        assert.ok(lamp?.isPointLight,fixture.id+' must illuminate surfaces as well as its shade');
        assert.equal(lamp.visible,true);
        assert.equal(lamp.castShadow,false,'Local illumination does not allocate a shadow map per lantern');
        assert.ok(Number.isFinite(lamp.intensity)&&lamp.intensity>=18*.85*3,fixture.id+' must exceed the previous weak surface light');
        assert.ok(lamp.color.r>lamp.color.g&&lamp.color.g>lamp.color.b,fixture.id+' retains warm light');
        const groundDistance=Math.hypot(lamp.position.x-fixture.x,lamp.position.y-fixture.groundZ,lamp.position.z-fixture.y);
        const foliageDistance=Math.hypot(lamp.position.x-fixture.boundaryPoint[0],lamp.position.z-fixture.boundaryPoint[1]);
        assert.ok(lamp.distance>Math.max(groundDistance,foliageDistance)+1,fixture.id+' reaches nearby ground and foliage before its cutoff');
      }
      const dining=lighting.fixtures.filter(f=>f.channel==='pendant').map(f=>lighting.group.getObjectByName(`${f.id}-light`));
      assert.ok(dining.every(lamp=>lamp.userData.nominalIntensity===40),'Dining light power remains unchanged');
      lighting.apply({gardenStrength:0,pendantStrength:.8,hedgeStrength:0});
      for(const fixture of hedgeFixtures){
        const lamp=lighting.group.getObjectByName(`${fixture.id}-light`);
        assert.equal(lamp.visible,false);assert.equal(lamp.intensity,0);
      }
      assert.ok(dining.every(lamp=>lamp.visible&&lamp.intensity===32),'Switching the hedge off leaves dining lighting alone');
      assert.ok(lighting.lightCount<=39);
    }finally{lighting.dispose();}
  }
});

test('lighting budget counts installed pendants once, retains them when unlit and accepts a complete quote',()=>{
  for(const {data,settings} of properties){
    const state={...settings,costUsePlanningAllowances:true},layout=pendantLightingLayout(state,data);
    const cost=estimateGardenCosts(state,data),row=cost.rows.find(row=>row.key==='costGardenLighting');
    const count=12+layout.garden.length+layout.hedge.length;
    assert.equal(cost.quantities.lightingFittings,count);
    assert.deepEqual(row.cost,{low:count*700,high:count*1500});
    assert.match(row.scope,/no pendant product or support-frame quotation/);
    const off=estimateGardenCosts({...state,nightGardenLights:false,nightPendantLights:false,nightHedgeLights:false},data);
    assert.deepEqual(off.rows.find(row=>row.key==='costGardenLighting').cost,row.cost);
    const quoted=estimateGardenCosts({...state,costGardenLighting:24600},data).rows.find(row=>row.key==='costGardenLighting');
    assert.deepEqual(quoted.cost,{low:24600,high:24600});
    assert.equal(quoted.priceStatus,'user-quote');
  }
});
