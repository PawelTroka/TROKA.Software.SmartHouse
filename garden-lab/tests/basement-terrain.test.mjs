import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {designTerrainCutouts} from '../src/scene.js';
import {terrainSurfaceGeometry} from '../src/terrain-mesh.js';
import {garageTerrainCutouts} from '../src/scene-garage.js';
import {garageLayout} from '../src/garage-ramp.js';
import {houseModelFrame,getHouseFloorPlan} from '../src/house-model.js';
import {createStateModel} from '../src/state.js';
import {getSiteProfile} from '../src/sites.js';
import {applyPlanExterior} from '../src/plan-exterior.js';
import {gardenGroundAt,terrainAt,pointInPolygon} from '../src/geometry.js';

const source=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const defaults=createStateModel(getSiteProfile(source.site.id,source)).DEFAULTS;
const setup=extra=>{
  const settings={...defaults,designStyle:'warm-minimal',basementGarageEnabled:true,...extra};
  const data=applyPlanExterior(source,settings),frame=houseModelFrame(data,settings);
  return {settings,data,frame,plan:getHouseFloorPlan({floor:'basement',settings,data}),cuts:designTerrainCutouts(settings,data)};
};
const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
const hit=(mesh,p)=>new THREE.Raycaster(new THREE.Vector3(p[0],20,p[1]),new THREE.Vector3(0,-1,0),0,40).intersectObject(mesh);
const area=p=>Math.abs(p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-a[1]*b[0];},0)/2);

test('the terrain opening follows the complete registered cellar and leaves the original ramp openings unchanged',()=>{
  for(const extra of [{},{garageRampWidth:6.4,garageClearHeight:2.45},{designStyle:'current',basementGarageEnabled:false}]){
    const {settings,data,frame,plan,cuts}=setup(extra),house=cuts.find(c=>c.id==='shared-house-basement-opening');
    assert.ok(house,'Every rendered Sternicza cellar needs a terrain opening');
    assert.deepEqual(house.polygon,plan.envelope.outline.map(([x,z])=>frame.toSite(x,z).slice(0,2)));
    assert.ok(Math.abs(area(house.polygon)-10.77*9)<1e-8,'Use the registered main house envelope, not an axis-aligned bounding box');
    const ramps=garageTerrainCutouts(garageLayout(settings,data,{terrainAt}));
    for(const ramp of ramps)assert.deepEqual(cuts.find(c=>c.id===ramp.id),ramp);
    if(!settings.basementGarageEnabled)assert.equal(ramps.length,0,'Original cellar access does not enable an exterior garage excavation');
  }
  for(const file of ['korzeniowskiego-40.json','nadmorska-17.json']){
    const data=JSON.parse(readFileSync(new URL('../data/'+file,import.meta.url))),settings=createStateModel(getSiteProfile(data.site.id,data)).DEFAULTS;
    assert.ok(designTerrainCutouts(settings,data).every(c=>c.id!=='shared-house-basement-opening'),'Other properties retain their existing terrain treatment');
  }
});

test('the actual lawn and context geometry contain no triangles above the basement while outdoor ground remains',()=>{
  for(const extra of [{},{garageRampWidth:6.4,garageClearHeight:2.45},{designStyle:'current',basementGarageEnabled:false}]){
    const {settings,data,frame,cuts}=setup(extra),house=cuts.find(c=>c.id==='shared-house-basement-opening');
    const bounds=[house.x0-.6,house.y0-1,house.x1+.6,house.y1+.6];
    for(const step of [.65,2])for(const layer of ['lawn','context']){
      const options={cutouts:cuts,boundary:layer==='lawn'?data.site.boundary:null,vertexColors:layer==='lawn'};
      const heightAt=layer==='lawn'?(x,y)=>gardenGroundAt(x,y,settings,data)+.008:(x,y)=>terrainAt(x,y,data)-.015;
      const geometry=terrainSurfaceGeometry(bounds,step,heightAt,options),mesh=new THREE.Mesh(geometry,material);
      try{
        // Sample the whole cellar, including both formerly grass-filled rooms,
        // all four inner edges and the gap alongside the parked cars.
        for(let x=.08;x<10.77;x+=.67)for(let z=.08;z<9;z+=.63){
          assert.equal(hit(mesh,frame.toSite(x,z)).length,0,`${layer} ${step} m grid crosses cellar at ${x},${z}`);
        }
        for(const [x,z]of [[10.07975,4.47],[10.12325,7.665],[6.5,5.60],[.02,4.5],[10.75,4.5],[5.385,.02],[5.385,8.98]]){
          assert.equal(hit(mesh,frame.toSite(x,z)).length,0,'No terrain may cross a real room view or retained stair approach');
        }
        for(const [x,z]of [[-.30,1.2],[-.30,4.5],[-.30,7.8],[11.07,1.2],[11.07,4.5],[11.07,7.8],[8.8,9.35]]){
          const p=frame.toSite(x,z);
          assert.ok(pointInPolygon(p,data.site.boundary));
          assert.ok(hit(mesh,p).length>0,`${layer}: cutting the cellar must retain adjacent outdoor terrain at ${x},${z}`);
        }
        assert.ok([...geometry.attributes.position.array].every(Number.isFinite));
      }finally{geometry.dispose();}
    }
  }
});

test('removing the house cut reproduces the captured grass obstruction in both occupied basement rooms',()=>{
  const {settings,data,frame,cuts}=setup({}),house=cuts.find(c=>c.id==='shared-house-basement-opening');
  const geometry=terrainSurfaceGeometry([house.x0,house.y0,house.x1,house.y1],.65,
    (x,y)=>gardenGroundAt(x,y,settings,data)+.008,{cutouts:cuts.filter(c=>c!==house),boundary:data.site.boundary});
  try{
    const mesh=new THREE.Mesh(geometry,material);
    for(const point of [[10.07975,4.47],[10.12325,7.665]])assert.ok(hit(mesh,frame.toSite(...point)).length>0,
      'Regression control must detect the terrain surface that hid the gym and laundry in actual WebGL captures');
  }finally{geometry.dispose();}
});
