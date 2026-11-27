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
import {spaCoverPlanMarkup} from '../src/diagrams.js';

const source=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const settings={...DEFAULTS,summerPoolLayout:true,jacuzziCoverClosed:false,coldPlungeCoverClosed:false};
const data=applyPlanExterior(source,settings);
const near=(a,b,tolerance=1e-5)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const covers=s=>{const levels=spaLevels(s,data);return [jacuzziCoverLayout(jacuzziBounds(s,data),s),coldPlungeCoverLayout(gardenProgram(s,data).coldPlunge,levels.coldPlunge,s)];};

test('both covers stow entirely below their surrounds and close without a water gap',()=>{
  const tub=jacuzziBounds(settings,data),stairs=terraceStairs(data.site.terrace,settings.terraceDepth,terraceGroundReference(settings,data).drop,settings,data);
  for(const cover of covers(settings)){
    assert.equal(cover.progress,0);
    assert.equal(cover.storage,'concealed-side-cassette');
    for(const panel of cover.panels){
      assert.equal(overlapArea(rectCorners(panel),rectCorners(cover.basin)),0);
      assert.equal(panel.visible,false);assert.equal(panel.exposedBounds,null);assert.deepEqual(panel.footprint,[]);
      assert.ok(panel.topZ<cover.surroundZ-.10,'No parked leaf remains on the terrace or apron');
      assert.equal(spaCoverSurfaceAt(panel.x+panel.width/2,panel.y+panel.length/2,cover),null,'The hidden cassette is not a phantom walking deck');
    }
    assert.ok(cover.rails.every(r=>r.topZ<cover.surroundZ-.15),'Tracks are hidden below the finished surface');
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

test('moving meshes expose only the aperture portion and fully disappear inside the cassette',()=>{
  const deck=new THREE.MeshStandardMaterial(),metal=new THREE.MeshStandardMaterial(),materials={deck,metal};
  for(const layout of covers(settings))for(const svgMode of [false,true]){
    const group=createSpaCoverGroup(layout,materials,{svgMode});
    try{
      let meshes=0;group.traverse(o=>{if(o.isMesh)meshes++;});assert.equal(meshes,4,'Two material batches per leaf, no exposed track meshes');
      for(const progress of [0,.25,.5,.75,1,0]){
        const current=setSpaCoverProgress(group,progress);
        for(const panel of current.panels){
          const mesh=group.getObjectByName(panel.id),b=new THREE.Box3().setFromObject(mesh);
          assert.equal(mesh.visible,panel.visible);
          if(!panel.visible)continue;
          near(b.min.x,panel.exposedBounds.x);near(b.max.x,panel.exposedBounds.x+panel.exposedBounds.width);
          near(b.min.z,panel.exposedBounds.y);near(b.max.z,panel.exposedBounds.y+panel.exposedBounds.length);
          near(b.min.y,panel.baseZ);near(b.max.y,panel.topZ);
          mesh.traverse(o=>{if(o.geometry)for(const attr of Object.values(o.geometry.attributes))assert.ok([...attr.array].every(Number.isFinite));});
        }
      }
    }finally{group.traverse(o=>o.geometry?.dispose());}
  }
  deck.dispose();metal.dispose();
});

test('retracting below the coping never pulls a walker down through solid terrace or apron',()=>{
  const walk=createWalkNavigation(data,settings);
  for(const cover of covers(settings)){
    const x=cover.basin.x+cover.basin.width+.02,y=cover.basin.y+cover.basin.length/2;
    const floorHint=cover.id==='jacuzzi-cover'?'ground':'garden',position=[x,cover.rimZ+1.57,y];
    walk.updateCovers(settings,{jacuzzi:0,coldPlunge:0});
    const before=walk.locateFree(position,{floorHint});
    for(const progress of [.25,.5,.75,.9,.99]){
      walk.updateCovers(settings,{jacuzzi:progress,coldPlunge:progress});
      const next=walk.locateFree(position,{floorHint});
      near(next.position[1],before.position[1]);assert.equal(next.swimming,false);
      const moving=spaCoverAtProgress(cover,progress);
      assert.equal(spaCoverSurfaceAt(x,y,moving),null);
    }
    assert.equal(spaCoverAtProgress(cover,1).closed,true);
    assert.equal(spaCoverAtProgress(cover,0).closed,false);
  }
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
  const x=p.exposedBounds.x+p.exposedBounds.width/2,y=p.y+p.length/2;walk.updateCovers(settings,{coldPlunge:.5,jacuzzi:0});
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

test('custom viewpoint eye heights follow exposed covers while concealed leaves leave the surround unchanged',()=>{
  for(const jacuzziCoverClosed of [false,true])for(const coldPlungeCoverClosed of [false,true]){
    const s={...settings,jacuzziCoverClosed,coldPlungeCoverClosed};
    for(const cover of covers(s))for(const panel of cover.panels)for(const fraction of [.25,.75]){
      const x=panel.x+panel.width*fraction,y=panel.y+panel.length/2,support=spaCoverSurfaceAt(x,y,cover);
      const observer=observerForPreset('custom',{...s,observerX:x,observerY:y,eyeHeight:1.2},data);
      if(!panel.visible){assert.notEqual(observer.surface,cover.id);assert.equal(support,null);continue;}
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

test('open covers leave no parked rectangles in either plan drawing',()=>{
  const viewport={X:x=>x,Y:y=>y,scale:10};
  const open=spaCoverPlanMarkup(settings,data,viewport);
  assert.equal((open.match(/<rect /g)||[]).length,0);
  assert.equal((open.match(/data-cover-storage="concealed"/g)||[]).length,2);
  const closed=spaCoverPlanMarkup({...settings,jacuzziCoverClosed:true,coldPlungeCoverClosed:true},data,viewport);
  assert.equal((closed.match(/<rect /g)||[]).length,4);
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
