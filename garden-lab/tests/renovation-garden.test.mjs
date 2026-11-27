import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DESIGN_STYLES} from '../src/design-styles.js';
import {RENOVATION_GARDEN_SCHEMES,RENOVATION_GARDEN_RECIPES,getRenovationGardenRecipe} from '../src/renovation-garden.js';
import {createStateModel} from '../src/state.js';
import {getSiteProfile} from '../src/sites.js';
import {changePresentationSettings} from '../src/studio-state.js';
import {applyPlanExterior} from '../src/plan-exterior.js';
import {gardenProgram,poolBounds} from '../src/garden-program.js';
import {gardenFurniture,rectCorners,terraceStairs} from '../src/layout.js';
import {footprintFit,overlapArea} from '../src/footprint-fit.js';
import {closestFootprints} from '../src/dimensions.js';
import {observerForPreset,spaLevels,terraceGroundReference} from '../src/geometry.js';
import {prepareSunGeometry} from '../src/shade.js';
import {gardenQuantities} from '../src/costs.js';
import {designTerrainCutouts} from '../src/scene.js';

const source=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const sourceSnapshot=structuredClone(source);
const model=createStateModel(getSiteProfile('sternicza-11',source));
// v1.33 style-specific garden layouts remain an explicit historical comparison.
const legacyDefaults=model.decodeState('v=29&site=sternicza-11');
const registeredHouse=applyPlanExterior(source,legacyDefaults).site.house.footprint;
const styles=DESIGN_STYLES.filter(s=>s.id!=='current');
const programs=['classic','spa','spa-edge','spa-compact','spa-screened','spa-grove','spa-aligned','spa-corner','spa-pool-grove'];
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-7,`${label}: ${a} versus ${b}`);
const bounds=r=>({x0:r.x,x1:r.x+r.width,y0:r.y,y1:r.y+r.length});
const sameBounds=(a,b)=>['x0','x1','y0','y1'].every(k=>Math.abs(a[k]-b[k])<1e-8);
const fixture=(id,patch={})=>{
  const settings=model.sanitizeState(changePresentationSettings(legacyDefaults,{designStyle:id,...patch}));
  const data=applyPlanExterior(source,settings);
  return {settings,data,program:gardenProgram(settings,data),furniture:gardenFurniture(data,settings)};
};
const fixedObstacles=(settings,data)=>{
  const t=data.site.terrace,rear=data.site.rearMidpoint[1];
  const stairs=terraceStairs({...t,y:rear},settings.terraceDepth,terraceGroundReference(settings,data).drop,settings,data);
  return [['house',data.site.house.footprint],['terrace',rectCorners({x:t.x,y:rear,width:t.width,length:settings.terraceDepth})],
    ...(stairs.count?[['terrace stairs',rectCorners(stairs)]]:[])];
};
const physicalFeatures=program=>[
  {id:'pool coping',owner:'pool',ring:rectCorners(program.pool,program.pool.coping)},
  {id:'sauna',owner:'sauna',ring:program.sauna.footprint},
  {id:'fire lounge coping',owner:'firepit',ring:program.firepit.outerFootprint},
  {id:'plunge pad',owner:'plunge',ring:rectCorners(program.coldPlunge,program.coldPlunge.pad)},
  ...program.sauna.entrySteps.map((s,i)=>({id:`sauna step ${i}`,owner:'sauna',ring:s.footprint})),
  ...program.coldPlunge.steps.map((s,i)=>({id:`plunge step ${i}`,owner:'plunge',ring:rectCorners(s)})),
];

test('all renovation styles select six real garden topologies without changing measured source geometry or tree centres',()=>{
  assert.equal(styles.length,34);
  assert.deepEqual(Object.keys(RENOVATION_GARDEN_RECIPES).sort(),styles.map(s=>s.id).sort());
  assert.equal(Object.keys(RENOVATION_GARDEN_SCHEMES).length,6);
  const custom=model.sanitizeState({...legacyDefaults,screeningTrees:legacyDefaults.screeningTrees.map((t,i)=>({...t,x:t.x-.1*(i+1),y:t.y-.1}))});
  const topologies=new Set();
  for(const style of styles){
    const {settings,data,program}=fixture(style.id);
    assert.ok(program.renovation,style.id);
    topologies.add(JSON.stringify([program.pool,program.firepit.x,program.firepit.y,program.furniture]));
    assert.deepEqual(settings.screeningTrees,legacyDefaults.screeningTrees,style.id+' preserves chosen trees');
    assert.deepEqual(changePresentationSettings(custom,{designStyle:style.id}).screeningTrees,custom.screeningTrees,style.id+' preserves custom tree centres');
    assert.deepEqual(data.site.boundary,source.site.boundary,style.id+' boundary');
    assert.deepEqual(data.site.house.footprint,registeredHouse,style.id+' registered drawing model');
    assert.deepEqual(data.site.house.sourceFootprint,source.site.house.footprint,style.id+' surveyed house provenance');
    assert.deepEqual(data.site.garage.footprint,source.site.garage.footprint,style.id+' mapped garage');
    assert.deepEqual(data.buildings,source.buildings,style.id+' neighbours');
    assert.deepEqual(data.terrain,source.terrain,style.id+' terrain');
  }
  assert.equal(topologies.size,6,'Pool/fire/lounge/dining/path arrangements change structurally');
  assert.deepEqual(source,sourceSnapshot,'Building and terrain provenance remains immutable');
});

test('all style pools, fire rooms and spa approaches fit the parcel and clear mapped obstacles and retained trunks',()=>{
  for(const style of styles){
    const {settings,data,program}=fixture(style.id),features=physicalFeatures(program);
    for(const feature of features){
      const label=style.id+' '+feature.id;
      assert.equal(footprintFit(feature.ring,data.site.boundary).location,'inside',label);
      for(const [name,ring]of fixedObstacles(settings,data))assert.ok(overlapArea(feature.ring,ring)<1e-7,label+' intersects '+name);
      for(const tree of settings.screeningTrees.filter(t=>t.enabled!==false)){
        const gap=closestFootprints([[tree.x,tree.y]],feature.ring).distance;
        assert.ok(gap>=(feature.owner==='pool'?1:.5)-1e-7,label+' crowds '+tree.id);
      }
    }
    for(let i=0;i<features.length;i++)for(const other of features.slice(i+1)){
      const feature=features[i];
      // An access tread meets its own destination pad by design.
      if(feature.owner===other.owner)continue;
      assert.ok(overlapArea(feature.ring,other.ring)<1e-7,style.id+' '+feature.id+' intersects '+other.id);
    }
  }
});

test('each historical style retains resting groups and clear dining, paths and planting without outdoor kitchens',()=>{
  for(const style of styles){
    const {settings,data,program,furniture:f}=fixture(style.id),r=f.resort;
    assert.ok(r.items.some(p=>['daybed','lounger','sofa'].includes(p.kind)),style.id+' has a resting group');
    assert.equal(f.diningVisible,true,style.id+' has its dining court');
    assert.equal(r.kitchen,null,style.id+' has no outdoor kitchen');
    assert.equal(program.renovation.kitchen,undefined,style.id+' has no hidden kitchen recipe');
    const pieces=[...r.items,{...f.dining,id:'dining'},...f.path.map(([x,y],i)=>({id:'path '+i,x,y,width:1.15,length:.9})),
      ...(r.beds||[])];
    const obstacles=[...fixedObstacles(settings,data),...physicalFeatures(program).map(p=>[p.id,p.ring])];
    for(const piece of pieces){
      const ring=rectCorners(piece),label=style.id+' '+piece.id;
      assert.equal(footprintFit(ring,data.site.boundary).location,'inside',label);
      for(const [name,other]of obstacles)assert.ok(overlapArea(ring,other)<1e-7,label+' intersects '+name);
      for(const tree of settings.screeningTrees.filter(t=>t.enabled!==false))assert.ok(closestFootprints([[tree.x,tree.y]],ring).distance>=.5-1e-7,label+' crowds '+tree.id);
    }
    for(let i=0;i<pieces.length;i++)for(const other of pieces.slice(i+1))assert.ok(overlapArea(rectCorners(pieces[i]),rectCorners(other))<1e-7,style.id+' '+pieces[i].id+' intersects '+other.id);
    // Resting platforms intentionally support their furniture, but cannot
    // bridge water, excavation, a spa entrance or the mapped parcel boundary.
    for(const pad of r.pads||[]){
      assert.equal(footprintFit(rectCorners(pad),data.site.boundary).location,'inside',style.id+' '+pad.id);
      for(const [name,ring]of obstacles)assert.ok(overlapArea(rectCorners(pad),ring)<1e-7,style.id+' '+pad.id+' intersects '+name);
    }
  }
});

test('Current, explicit manual programmes and pavilion alternatives retain the chosen underlying garden',()=>{
  for(const gardenProgramId of programs){
    const base=model.sanitizeState({...legacyDefaults,gardenProgram:gardenProgramId,designStyle:'current',styleGardenLayout:false});
    const original=gardenProgram(base,source);
    assert.deepEqual(gardenProgram({...base,styleGardenLayout:true},source),original,'Current '+gardenProgramId);
    for(const style of styles){
      const manual={...base,designStyle:style.id,styleGardenLayout:false};
      assert.equal(getRenovationGardenRecipe(manual,source),null);
      assert.deepEqual(gardenProgram(manual,source),original,style.id+' manual '+gardenProgramId);
      const pavilion={...manual,pavilionEnabled:true,styleGardenLayout:true};
      assert.equal(getRenovationGardenRecipe(pavilion,source),null);
      assert.deepEqual(gardenProgram(pavilion,source),gardenProgram({...pavilion,styleGardenLayout:false},source),style.id+' pavilion');
    }
  }
  for(const siteId of ['korzeniowskiego-40','nadmorska-17']){
    const data=JSON.parse(readFileSync(new URL(`../data/${siteId}.json`,import.meta.url)));
    for(const style of styles)assert.equal(getRenovationGardenRecipe({siteId,gardenProgram:'spa',designStyle:style.id,styleGardenLayout:true},data),null);
  }
});

test('v28 saved and shared geometry stays explicit while v29 layout choices round-trip and style adoption is deliberate',()=>{
  assert.ok(model.STATE_VERSION>=29);
  for(const style of styles){
    const previous={...legacyDefaults,siteId:'sternicza-11',designStyle:style.id,gardenProgram:'spa-pool-grove'};
    delete previous.styleGardenLayout;
    for(const restored of [model.decodeState(`v=28&site=sternicza-11&designStyle=${style.id}&gardenProgram=spa-pool-grove`),model.migrateSavedState(previous,28)]){
      assert.equal(restored.styleGardenLayout,false,style.id+' historical state');
      assert.deepEqual(poolBounds(restored,source),poolBounds({...restored,designStyle:'current'},source));
    }
    for(const enabled of [false,true]){
      const settings=model.sanitizeState({...legacyDefaults,designStyle:style.id,styleGardenLayout:enabled});
      const restored=model.decodeState(model.encodeState(settings));
      assert.equal(restored.styleGardenLayout,enabled,style.id+' share');
      assert.deepEqual(poolBounds(restored,source),poolBounds(settings,source),style.id+' shared pool');
      assert.deepEqual(restored.screeningTrees,settings.screeningTrees,style.id+' shared trees');
      assert.equal(model.migrateSavedState(settings,model.STATE_VERSION).styleGardenLayout,enabled,style.id+' saved state');
    }
  }
  assert.equal(model.decodeState('v=28&site=sternicza-11&styleGardenLayout=true').styleGardenLayout,false,'An unknown legacy field cannot relocate a saved pool');
  const manual=model.sanitizeState({...legacyDefaults,designStyle:'hidden-bali',styleGardenLayout:false,gardenProgram:'spa-corner'});
  assert.equal(changePresentationSettings(manual,{designStyle:'hidden-bali'}).styleGardenLayout,false,'Reapplying the current style preserves manual intent');
  const adopted=changePresentationSettings(manual,{designStyle:'modern-minimal'});
  assert.equal(adopted.styleGardenLayout,true,'Choosing a different renovation adopts its garden');
  const cleared=changePresentationSettings(adopted,{styleGardenLayout:false});
  assert.deepEqual(gardenProgram(cleared,source),gardenProgram({...cleared,designStyle:'current'},source),'Clearing the layout restores the chosen programme');
  assert.equal(changePresentationSettings(manual,{designStyle:'modern-minimal',styleGardenLayout:false}).styleGardenLayout,false,'An explicit patch wins');
  const current=changePresentationSettings(adopted,{designStyle:'current'});
  assert.equal(getRenovationGardenRecipe(current,source),null);
  assert.deepEqual(poolBounds(current,source),poolBounds({...manual,designStyle:'current'},source));
  assert.deepEqual(current.screeningTrees,manual.screeningTrees);
});

test('relocated water and fire rooms share exact terrain holes, sun receivers and viewpoint levels',()=>{
  // Deliberately reuse one data object: switching a style must invalidate every
  // physical cache, even when the measured property data is unchanged.
  const data=structuredClone(source);
  for(const style of styles){
    const settings=model.sanitizeState({...legacyDefaults,designStyle:style.id,styleGardenLayout:true});
    const program=gardenProgram(settings,data),pool=poolBounds(settings,data),levels=spaLevels(settings,data);
    const sun=prepareSunGeometry(settings,data),holes=designTerrainCutouts(settings,data);
    for(const room of [pool,program.firepit,program.coldPlunge]){
      assert.ok(holes.some(h=>sameBounds(h,bounds(room))),style.id+' renderer opening');
      assert.ok(sun.terrain.cutouts.some(h=>sameBounds(h,bounds(room))),style.id+' sunlight opening');
    }
    const water=sun.cells.filter(c=>c.zone==='pool');assert.ok(water.length>0,style.id+' pool zone');
    for(const cell of water){
      const x=cell.sampleX??cell.x,y=cell.sampleY??cell.y;
      assert.ok(x>pool.x&&x<pool.x+pool.width&&y>pool.y&&y<pool.y+pool.length,style.id+' water sample inside current pool');
      near(cell.z,levels.pool.waterZ,style.id+' receiver waterline');
    }
    const eye=observerForPreset('pool',settings,data);
    near(eye.x,pool.x+pool.width/2,style.id+' swimming eye x');
    near(eye.y,pool.y+Math.min(1.1,pool.length/3),style.id+' swimming eye y');
    near(eye.waterZ,levels.pool.waterZ,style.id+' swimming waterline');
    const fireEye=observerForPreset('firepit',{...settings,eyeHeight:undefined},data);
    near(fireEye.x,program.firepit.viewpoint.x,style.id+' fire eye x');
    near(fireEye.y,program.firepit.viewpoint.y,style.id+' fire eye y');
    near(fireEye.groundZ,levels.firepit.floorZ,style.id+' fire floor');
  }
});

test('sun and budget caches invalidate on both style switches and the manual-layout flag',()=>{
  const data=structuredClone(source),base={...legacyDefaults,designStyle:'hidden-bali',styleGardenLayout:true};
  const a=prepareSunGeometry(base,data),qa=gardenQuantities(base,data);
  const shortPool={...base,designStyle:'mediterranean-villa'};
  const b=prepareSunGeometry(shortPool,data),qb=gardenQuantities(shortPool,data);
  assert.notEqual(a,b,'Style change invalidates solar geometry');
  assert.notEqual(qa,qb,'Style change invalidates cost quantities');
  near(qb.automaticArea-qa.automaticArea,3.5*.5,'The shorter pool leaves 1.75 m² more fill area');
  const restored={...shortPool,styleGardenLayout:false};
  const c=prepareSunGeometry(restored,data),qc=gardenQuantities(restored,data);
  assert.notEqual(b,c,'Manual flag invalidates solar geometry');
  assert.notEqual(qb,qc,'Manual flag invalidates cost quantities');
  near(qc.automaticArea,qa.automaticArea,'Restoring the original programme restores its area');
  assert.deepEqual(c.terrain.cutouts[0],bounds(poolBounds(restored,data)));
});
