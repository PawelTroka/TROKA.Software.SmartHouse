import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {gardenProgram,poolBounds} from '../src/garden-program.js';
import {spaLevels,gardenGroundAt} from '../src/geometry.js';
import {rectanglesOverlap} from '../src/layout.js';
import {createSpaAmenityGroup} from '../src/scene-spa.js';
import {designTerrainCutouts} from '../src/scene.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const settings={gardenProgram:'spa',gardenRaise:.5,terraceDepth:4.2,floorHeight:1.2};
const program=gardenProgram(settings,data),levels=spaLevels(settings,data);
const material=new THREE.MeshBasicMaterial(),glass=new THREE.MeshBasicMaterial({transparent:true,opacity:.13});
const materials=Object.fromEntries(['stone','stoneLight','wood','woodLight','metal','basin','linen','waterLight','plinth','treeBark','gold','spaGlow','fireGlow'].map(k=>[k,material]));
materials.glass=glass;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const bounds=object=>{object.updateWorldMatrix(true,true);return new THREE.Box3().setFromObject(object);};

test('spa rendering preserves the shared sauna roof and opaque/glass openings in both renderers',()=>{
  for(const svg of [false,true]){
    const group=createSpaAmenityGroup(program,levels,materials,svg);
    near(bounds(group.getObjectByName('sauna-roof')).max.y,levels.sauna.roofZ);
    for(const [i,wall] of program.sauna.walls.entries()){
      const mesh=group.getObjectByName(`sauna-wall-${i}`),b=bounds(mesh);
      near(b.min.y,levels.sauna.floorZ+wall.bottom);near(b.max.y,levels.sauna.floorZ+wall.top);
    }
    for(const [i,pane] of program.sauna.glazing.entries()){
      const mesh=group.getObjectByName(`sauna-glazing-${i}`),b=bounds(mesh);
      near(b.min.y,levels.sauna.floorZ+pane.bottom);near(b.max.y,levels.sauna.floorZ+pane.top);
      assert.equal(mesh.castShadow,false,'The viewing glass cannot become an opaque shadow caster');
      assert.equal(mesh.material,glass);
    }
  }
});

test('sunken floor and access treads use the same absolute levels as the observer model',()=>{
  const group=createSpaAmenityGroup(program,levels,materials);
  near(bounds(group.getObjectByName('firepit-sunken-floor')).max.y,levels.firepit.floorZ);
  near(levels.firepit.rimZ-levels.firepit.floorZ,.6);
  for(const [i,step] of levels.firepit.steps.entries())near(bounds(group.getObjectByName(`firepit-entry-step-${i}`)).max.y,step.topZ);
  assert.ok(levels.firepit.steps.every((step,i)=>!i||step.topZ<levels.firepit.steps[i-1].topZ));
});

test('cold plunge has the specified water depth without a false pad across its basin',()=>{
  const group=createSpaAmenityGroup(program,levels,materials);
  const floor=bounds(group.getObjectByName('plunge-basin-floor')).max.y;
  const water=bounds(group.getObjectByName('cold-plunge-water')).max.y;
  near(floor,levels.coldPlunge.bottomZ);near(water,levels.coldPlunge.waterZ);near(water-floor,1.1);
  const center=[program.coldPlunge.x+program.coldPlunge.width/2,program.coldPlunge.y+program.coldPlunge.length/2];
  group.traverse(object=>{if(object.name==='plunge-pad'){const b=bounds(object);assert.ok(center[0]<b.min.x||center[0]>b.max.x||center[1]<b.min.z||center[1]>b.max.z);}});
});

test('spa terrain opens the pool, edge tub, firepit and plunge while classic stays unchanged',()=>{
  const holes=designTerrainCutouts(settings,data);
  assert.equal(holes.length,4);
  for(const rect of [program.pool,program.firepit,program.coldPlunge])assert.ok(holes.some(h=>Math.abs(h.x0-rect.x)<1e-8&&Math.abs(h.x1-rect.x-rect.width)<1e-8&&Math.abs(h.y0-rect.y)<1e-8&&Math.abs(h.y1-rect.y-rect.length)<1e-8));
  const legacy=designTerrainCutouts({...settings,gardenProgram:'classic'},data);assert.equal(legacy.length,2);
  near(legacy[0].x0,data.site.pool.x);
  assert.equal(createSpaAmenityGroup(gardenProgram({...settings,gardenProgram:'classic'},data),{},materials).children.length,0);
});

test('moved pool coping clears the uneven terrain and its skirt reaches grade without moving classic water',()=>{
  const p=program.pool,z=levels.pool;
  near(z.copingTopZ-z.waterZ,.02);
  // An independent, denser check includes the mid-edge terrain high point
  // missed by the original centre/four-corner pool reference.
  const x0=p.x-p.coping,y0=p.y-p.coping,w=p.width+2*p.coping,l=p.length+2*p.coping;
  for(let ix=0;ix<=42;ix++)for(let iy=0;iy<=86;iy++){
    const ground=gardenGroundAt(x0+w*ix/42,y0+l*iy/86,settings,data);
    assert.ok(z.copingTopZ-ground>.05,'Coping must stay clear of uphill grass');
    assert.ok(z.copingBaseZ<ground-.05,'Coping skirt must extend below downhill grade');
  }
  const classic={...settings,gardenProgram:'classic'},oldPool=poolBounds(classic,data),old=spaLevels(classic,data).pool;
  near(old.waterZ,gardenGroundAt(oldPool.x+oldPool.width/2,oldPool.y+oldPool.length/2,classic,data)+.055);
  for(const [x,y] of program.furniture.path)assert.equal(rectanglesOverlap({x,y,width:1.15,length:.9},program.firepit,.08),false,'A stepping stone must not bridge the excavated lounge or coping');
});
