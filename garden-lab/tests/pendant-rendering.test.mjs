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
      assert.ok(lamps.length<=19);
      assert.equal(lamps.filter(object=>object.userData.nightChannel==='pendant').length,layout.garden.length);
      assert.ok(lamps.filter(object=>object.userData.nightChannel==='hedge').length<=4);
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
