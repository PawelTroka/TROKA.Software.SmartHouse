import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {DEFAULTS} from '../src/state.js';
import {applyPlanExterior} from '../src/plan-exterior.js';
import {gardenProgram} from '../src/garden-program.js';
import {gardenGroundAt,terrainAt,spaLevels,jacuzziBounds,terraceGroundReference,observerForPreset} from '../src/geometry.js';
import {UPPER_FLOOR_PRESETS} from '../src/viewpoints.js';
import {jacuzziCoverLayout,coldPlungeCoverLayout,spaCoverAtProgress,spaCoverSurfaceAt} from '../src/spa-covers.js';
import {createSpaCoverGroup,setSpaCoverProgress} from '../src/scene-spa-covers.js';
import {createWalkNavigation} from '../src/house-walk.js';
import {prepareSunGeometry,sunlightAtPoint} from '../src/shade.js';
import {resortTerraceLayout} from '../src/resort-garden.js';
import {terraceStairs,rectCorners} from '../src/layout.js';
import {overlapArea,footprintFit} from '../src/footprint-fit.js';
import {DESIGN_STYLES} from '../src/design-styles.js';

const source=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const settings={...DEFAULTS,summerPoolLayout:true,jacuzziCoverClosed:false,coldPlungeCoverClosed:false};
const data=applyPlanExterior(source,settings);
const near=(a,b,tolerance=1e-5)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const covers=s=>{const levels=spaLevels(s,data);return [jacuzziCoverLayout(jacuzziBounds(s,data),s),coldPlungeCoverLayout(gardenProgram(s,data).coldPlunge,levels.coldPlunge,s)];};

test('both covers park completely beside the water and close without a gap or furniture collision',()=>{
  const tub=jacuzziBounds(settings,data),stairs=terraceStairs(data.site.terrace,settings.terraceDepth,terraceGroundReference(settings,data).drop,settings,data);
  for(const cover of covers(settings)){
    assert.equal(cover.progress,0);
    for(const panel of cover.panels)assert.equal(overlapArea(rectCorners(panel),rectCorners(cover.basin)),0);
    assert.equal(footprintFit(rectCorners(cover.parkedBounds),data.site.boundary).location,'inside');
    const closed=spaCoverAtProgress(cover,1),r=cover.basin;
    for(let x=r.x+.01;x<r.x+r.width;x+=.11)for(let y=r.y+.01;y<r.y+r.length;y+=.13)
      assert.ok(spaCoverSurfaceAt(x,y,closed),'The closed deck covers every sample of the full basin');
    assert.ok(cover.parkedBounds.width<cover.closedBounds.width*.55,'Only a half-width parking bay is needed');
  }
  for(const style of DESIGN_STYLES.filter(s=>s.id!=='current')){
    const layout=resortTerraceLayout(data,{...settings,designStyle:style.id},tub,stairs),cover=covers(settings)[0];
    for(const item of layout.items)assert.equal(overlapArea(rectCorners(item),rectCorners(cover.parkedBounds)),0,`${style.id}: cover remains clear of furniture`);
  }
});

test('telescoping meshes follow their actual swept footprints and retain a small draw-call budget',()=>{
  const deck=new THREE.MeshStandardMaterial(),metal=new THREE.MeshStandardMaterial(),materials={deck,metal};
  for(const layout of covers(settings))for(const svgMode of [false,true]){
    const group=createSpaCoverGroup(layout,materials,{svgMode});
    try{
      let meshes=0;group.traverse(o=>{if(o.isMesh)meshes++;});assert.equal(meshes,5,'Two meshes per movable panel plus one rail batch');
      for(const progress of [0,.25,.5,.75,1,0]){
        const current=setSpaCoverProgress(group,progress);
        for(const panel of current.panels){
          const mesh=group.getObjectByName(panel.id),b=new THREE.Box3().setFromObject(mesh);
          near(b.min.x,panel.x);near(b.max.x,panel.x+panel.width);
          near(b.min.z,panel.y);near(b.max.z,panel.y+panel.length);
          near(b.min.y,panel.baseZ);near(b.max.y,panel.topZ+.0025);
          mesh.traverse(o=>{if(o.geometry)for(const attr of Object.values(o.geometry.attributes))assert.ok([...attr.array].every(Number.isFinite));});
        }
      }
    }finally{group.traverse(o=>o.geometry?.dispose());}
  }
  deck.dispose();metal.dispose();
});

test('the plunge rim meets its original approach grade instead of sitting on a raised mound',()=>{
  for(const gardenRaise of [0,.5,1]){
    const s={...settings,gardenRaise},c=gardenProgram(s,data).coldPlunge,z=spaLevels(s,data).coldPlunge;
    near(z.rimZ,terrainAt(c.anchor[0],c.y-c.pad,data)+gardenRaise);
    near(z.rimZ,gardenGroundAt(c.anchor[0],c.y-c.pad,s,data));
    near(z.rimZ-z.waterZ,.08);near(z.waterZ-z.bottomZ,1.1);assert.equal(z.steps.length,0);
    assert.ok(z.grading.naturalHighZ-z.rimZ>.15,'Uphill soil is cut into the apron rather than lifting the basin to that corner');
    for(const p of rectCorners(z.cover.parkedBounds))near(gardenGroundAt(...p,s,data),z.rimZ);
  }
});

test('independent cover updates keep covered walking dry and retain swimming in the open basin',()=>{
  const walk=createWalkNavigation(data,settings),t=jacuzziBounds(settings,data),c=gardenProgram(settings,data).coldPlunge;
  const centres=[[t.x0+t.width/2,t.y0+t.length/2,'ground'],[c.anchor[0],c.anchor[1],'garden']];
  for(const jacuzziCoverClosed of [false,true])for(const coldPlungeCoverClosed of [false,true]){
    const next={...settings,jacuzziCoverClosed,coldPlungeCoverClosed};walk.updateCovers(next);
    centres.forEach(([x,y,floorHint],i)=>{
      const cover=covers(next)[i],pose=walk.locateFree([x,cover.rimZ+1.57,y],{floorHint});
      assert.equal(pose.swimming,![jacuzziCoverClosed,coldPlungeCoverClosed][i]);
      if(!pose.swimming)near(pose.position[1]-pose.eyeHeight,spaCoverSurfaceAt(x,y,cover).groundZ);
    });
  }
  const mid=spaCoverAtProgress(covers(settings)[1],.5),p=mid.panels[0];
  const x=p.x+.1,y=p.y+p.length/2;walk.updateCovers(settings,{coldPlunge:.5,jacuzzi:0});
  const pose=walk.locateFree([x,p.topZ+1.57,y],{floorHint:'garden'});
  assert.equal(pose.swimming,false);near(pose.position[1]-pose.eyeHeight,spaCoverSurfaceAt(x,y,mid).groundZ);
});

test('closed cover panels block sunlight at the real water level and invalidate both cached states',()=>{
  const open=prepareSunGeometry(settings,data),next={...settings,jacuzziCoverClosed:true,coldPlungeCoverClosed:true};
  const closed=prepareSunGeometry(next,data);assert.notEqual(open,closed);
  const t=jacuzziBounds(next,data),c=gardenProgram(next,data).coldPlunge,z=spaLevels(next,data).coldPlunge;
  const day={direction:[0,0,1],isDaylight:true};
  for(const [x,y,height,prefix]of [[t.x0+t.width/2,t.y0+t.length/2,t.waterZ,'jacuzzi-cover'],[c.anchor[0],c.anchor[1],z.waterZ,'cold-plunge-cover']]){
    assert.ok(closed.occluders.some(o=>o.id.startsWith(prefix)));
    const result=sunlightAtPoint([x,y,height],next,data,day,closed);
    assert.ok(result.blocker?.id.startsWith(prefix),JSON.stringify(result));
  }
  assert.notEqual(prepareSunGeometry(settings,data),closed);
});

test('custom viewpoint eye heights follow closed and parked lid panels rather than the terrace or soil underneath',()=>{
  for(const jacuzziCoverClosed of [false,true])for(const coldPlungeCoverClosed of [false,true]){
    const s={...settings,jacuzziCoverClosed,coldPlungeCoverClosed};
    for(const cover of covers(s))for(const panel of cover.panels)for(const fraction of [.25,.75]){
      const x=panel.x+panel.width*fraction,y=panel.y+panel.length/2,support=spaCoverSurfaceAt(x,y,cover);
      const observer=observerForPreset('custom',{...s,observerX:x,observerY:y,eyeHeight:1.2},data);
      assert.equal(observer.surface,cover.id);
      near(observer.groundZ,support.groundZ);near(observer.z,support.groundZ+1.2);
    }
  }
  const open=covers(settings),tub=open[0].basin,plunge=open[1].basin;
  for(const basin of [tub,plunge]){
    const observer=observerForPreset('custom',{...settings,observerX:basin.x+basin.width/2,observerY:basin.y+basin.length/2},data);
    assert.ok(!observer.surface.endsWith('-cover'),'An open basin must not retain the lid support');
  }
});

test('cover switches leave upper-floor and named seated viewpoints independent from garden supports',()=>{
  const closed={...settings,jacuzziCoverClosed:true,coldPlungeCoverClosed:true};
  for(const preset of [...UPPER_FLOOR_PRESETS.map(p=>p.id),'jacuzzi','sauna','firepit']){
    assert.deepEqual(observerForPreset(preset,closed,data),observerForPreset(preset,settings,data),preset);
  }
  for(const [x,y]of [[data.site.terrace.x+.3,data.site.rearMidpoint[1]+.3],[3,26]]){
    const extra={observerX:x,observerY:y,eyeHeight:1.65};
    assert.deepEqual(observerForPreset('custom',{...closed,...extra},data),observerForPreset('custom',{...settings,...extra},data));
  }
});
