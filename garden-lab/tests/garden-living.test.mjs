import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {DEFAULTS} from '../src/state.js';
import {DESIGN_STYLES} from '../src/design-styles.js';
import {applyPlanExterior} from '../src/plan-exterior.js';
import {gardenProgram} from '../src/garden-program.js';
import {gardenFurniture,rectCorners} from '../src/layout.js';
import {footprintFit,overlapArea} from '../src/footprint-fit.js';
import {closestFootprints,gardenDimensions} from '../src/dimensions.js';
import {renderGardenLayoutWarning} from '../src/garden-warnings.js';
import {pathUnionArea} from '../src/garden-paths.js';
import {gardenGroundAt,terrainAt,spaLevels,spaSurfaceAt} from '../src/geometry.js';
import {createGardenPathGroup} from '../src/scene-garden-paths.js';
import {createSpaAmenityGroup} from '../src/scene-spa.js';
import {createGardenNightLighting} from '../src/scene-night-lights.js';
import {designTerrainCutouts} from '../src/scene.js';
import {prepareSunGeometry} from '../src/shade.js';
import {gardenPathPlanMarkup} from '../src/diagrams.js';
import {createWalkNavigation} from '../src/house-walk.js';

const source=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const settings={...DEFAULTS,terraceWidth:10.77,designStyle:'warm-minimal'};
const data=applyPlanExterior(source,settings);
const near=(a,b,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<tolerance,`${a} differs from ${b}`);
const material=new THREE.MeshStandardMaterial({color:'#d8ccb6'});
const materials=Object.fromEntries(['stone','stoneLight','wood','woodLight','metal','basin','linen','waterLight','plinth','treeBark','gold','spaGlow','fireGlow','glass','grass'].map(k=>[k,material]));
const disposeGroup=group=>{const materials=new Set();group.traverse(o=>{o.geometry?.dispose();if(o.material?.userData?.transient)materials.add(o.material);});for(const m of materials)m.dispose();};

test('all styles connect the six actual destinations without touching water, restored trunks or sunbeds',()=>{
  for(const style of DESIGN_STYLES)for(const sides of [1,2,3]){
    const s={...settings,designStyle:style.id,poolSunbedSides:sides},d=applyPlanExterior(source,s),f=gardenFurniture(d,s),n=f.pathNetwork,p=gardenProgram(s,d);
    assert.deepEqual(n.blocked,[],style.id);
    assert.ok(n.connections.every(c=>c.connected),`${style.id} has one connected path network from the terrace`);
    assert.deepEqual(n.connections.map(c=>c.id),['terrace','pool','firepit','sauna','plunge','dining']);
    assert.equal(n.fixtureCount,7);
    for(const segment of n.segments){
      assert.equal(footprintFit(segment.footprint,d.site.boundary).location,'inside');
      assert.ok(overlapArea(segment.footprint,rectCorners(p.pool))<1e-8,'The route never runs through pool water');
      assert.ok(overlapArea(segment.footprint,rectCorners(p.coldPlunge.waterBounds))<1e-8,'The route meets the plunge apron, not its water');
      for(const tree of s.screeningTrees)assert.ok(closestFootprints([[tree.x,tree.y]],segment.footprint).distance>.70,'Original trunks retain soil clearance');
      for(const bed of f.sunbeds)assert.ok(overlapArea(segment.footprint,rectCorners(bed,.08))<1e-8,'Furniture stays outside the path and border');
    }
    for(const stone of n.pavers)assert.ok(n.segments.some(segment=>footprintFit(stone.footprint,segment.footprint).location==='inside'));
    assert.ok(n.surfaceArea>n.pavedArea&&n.pavedArea>0);
  }
});

test('connected paths report real union area and do not count crossing segments twice',()=>{
  near(pathUnionArea([[[0,0],[2,0],[2,1],[0,1]],[[1,0],[3,0],[3,1],[1,1]]]),3);
  near(pathUnionArea([[[0,0],[3,0],[3,1],[0,1]],[[1,-1],[2,-1],[2,2],[1,2]]]),5);
  const n=gardenFurniture(data,settings).pathNetwork;
  assert.ok(n.surfaceArea<n.segments.reduce((sum,s)=>sum+s.length*s.outerWidth,0));
  assert.ok(n.pathLength>28&&n.pathLength<38);
  assert.ok(n.surfaceArea>24&&n.surfaceArea<32);
  assert.equal(gardenPathPlanMarkup(data,settings,{X:x=>x,Y:y=>y,scale:1}).match(/data-garden-path-network=/g).length,1);
});

test('a custom tree stays fixed and either gets a clear path detour or an explicit blocked connection',()=>{
  const custom={...settings,screeningTrees:[...settings.screeningTrees,{...settings.screeningTrees[0],id:'custom-route-tree',x:6.65,y:30.9}]},snapshot=structuredClone(custom.screeningTrees);
  const n=gardenFurniture(data,custom).pathNetwork;
  assert.deepEqual(custom.screeningTrees,snapshot);
  for(const s of n.segments)assert.ok(closestFootprints([[6.65,30.9]],s.footprint).distance>.70);
  assert.ok(n.blocked.length||n.connections.every(c=>c.connected));
  if(n.blocked.length)assert.ok(n.connections.some(c=>!c.connected),'An isolated spa branch cannot be reported as connected');
});

test('older spa programmes remain finite when the current pool toggle is adopted',()=>{
  for(const gardenProgram of ['spa','spa-edge','spa-compact','spa-screened','spa-grove','spa-aligned','spa-corner','spa-pool-grove']){
    const s={...DEFAULTS,gardenProgram},d=applyPlanExterior(source,s),f=gardenFurniture(d,s),z=spaLevels(s,d).coldPlunge;
    assert.ok(Number.isFinite(z.rimZ)&&Number.isFinite(z.waterZ));
    assert.ok(f.pathNetwork.connections.every(c=>c.connected)||f.pathNetwork.blocked.length>0,'A retained historical obstruction is reported explicitly');
  }
  for(const designStyle of ['current','warm-minimal','current']){
    const s={...DEFAULTS,gardenProgram:'spa',designStyle},c=gardenProgram(s,data).coldPlunge,z=spaLevels(s,data).coldPlunge;
    assert.deepEqual(z.grading.bounds,c.surroundBounds,'Local grading follows a changed spa footprint on the same site data');
  }
});

test('the public garden warning preserves spa notices and names routes interrupted by retained custom trees',()=>{
  const clear=gardenFurniture(data,settings).pathNetwork,element={hidden:false,textContent:''};
  renderGardenLayoutWarning(element,[],clear);
  assert.equal(element.hidden,true);assert.equal(element.textContent,'');
  const [x,y]=clear.connections.find(c=>c.id==='plunge').point;
  const custom={...settings,screeningTrees:[...settings.screeningTrees,{...settings.screeningTrees[0],id:'retained-plunge-approach',x,y}]};
  const before=structuredClone(custom.screeningTrees),blocked=gardenFurniture(data,custom).pathNetwork;
  assert.ok(blocked.blocked.some(segment=>segment.reason==='retained-tree'));
  assert.equal(blocked.connections.find(c=>c.id==='plunge').connected,false);
  renderGardenLayoutWarning(element,['Existing spa clearance needs review.'],blocked);
  assert.equal(element.hidden,false);
  assert.ok(element.textContent.startsWith('Existing spa clearance needs review.'));
  assert.match(element.textContent,/retained trees/);
  assert.match(element.textContent,/No continuous landscaped path from the terrace to:.*cold plunge/);
  assert.match(element.textContent,/tree positions are unchanged/);
  assert.deepEqual(custom.screeningTrees,before);
  renderGardenLayoutWarning(element,['Existing spa clearance needs review.'],undefined);
  assert.equal(element.hidden,false);assert.equal(element.textContent,'Existing spa clearance needs review.');
});

test('plunge dimensions retain water depth without inventing external steps for the flush basin',()=>{
  const current=gardenDimensions({...settings,showDimensions:true},data);
  near(current.find(r=>r.id==='cold-plunge-water-depth').value,1.1);
  assert.ok(current.some(r=>r.id==='cold-plunge-width'));
  assert.equal(current.some(r=>r.id==='cold-plunge-entry-rise'),false);
  const raised={...settings,designStyle:'current',summerPoolLayout:false,gardenProgram:'spa-edge',showDimensions:true};
  const historical=gardenDimensions(raised,data),levels=spaLevels(raised,data).coldPlunge;
  assert.ok(levels.steps.length>0);
  near(historical.find(r=>r.id==='cold-plunge-entry-rise').value,levels.rimZ-levels.entryGroundZ);
});

test('the path mesh follows finished grade through every paver and stays within five batched meshes',()=>{
  const n=gardenFurniture(data,settings).pathNetwork,g=createGardenPathGroup(n,settings,data,materials);
  try{
    assert.equal(g.name,'landscaped-garden-paths');assert.ok(g.children.length<=5);
    assert.equal(g.userData.routeFixtures,7);assert.equal(g.userData.connectedDestinations.length,6);
    for(const [name,offset]of [['garden-path-base',.018],['garden-path-stone',.037],['garden-path-border',.028]]){
      const mesh=g.getObjectByName(name);assert.ok(mesh);assert.equal(mesh.castShadow,false);
      const p=mesh.geometry.attributes.position;
      for(let i=0;i<p.count;i++)near(p.getY(i),gardenGroundAt(p.getX(i),p.getZ(i),settings,data)+offset,4e-6);
    }
  }finally{disposeGroup(g);}
});

test('sunken plunge shares flush rim, grade, render, excavation and water receiver levels',()=>{
  const p=gardenProgram(settings,data),c=p.coldPlunge,l=spaLevels(settings,data),z=l.coldPlunge;
  assert.equal(c.sunken,true);assert.equal(c.steps.length,0);assert.equal(z.steps.length,0);
  near(z.rimZ,z.padTopZ);near(z.rimZ-z.waterZ,.08);near(z.waterZ-z.bottomZ,1.1);
  const approach=[c.anchor[0],c.y-c.pad];near(z.rimZ-gardenGroundAt(...approach,settings,data),.02);
  near(spaSurfaceAt(...approach,settings,data).groundZ,z.rimZ);
  // The local fill is feathered continuously rather than creating a hidden
  // stair at the new flush apron, and ends outside that bounded area.
  for(let y=approach[1]-1.4;y<=approach[1];y+=.01)assert.ok(Math.abs(gardenGroundAt(approach[0],y+.01,settings,data)-gardenGroundAt(approach[0],y,settings,data))<.008);
  const outside=[c.x-2,c.y];near(gardenGroundAt(...outside,settings,data),terrainAt(...outside,data)+settings.gardenRaise);
  assert.ok(designTerrainCutouts(settings,data).some(h=>h.x0===c.x&&h.x1===c.x+c.width&&h.y0===c.y&&h.y1===c.y+c.length));
  const group=createSpaAmenityGroup(p,l,materials);
  try{
    const plunge=group.getObjectByName('cold-plunge');assert.equal(plunge.userData.sunken,true);near(plunge.userData.finishedLevels.rimZ,z.rimZ);
    const water=new THREE.Box3().setFromObject(group.getObjectByName('cold-plunge-water'));
    near(water.max.y,z.waterZ);near(water.min.x,c.waterBounds.x);near(water.max.z,c.waterBounds.y+c.waterBounds.length);
    group.traverse(o=>{if(o.name==='plunge-pad')near(new THREE.Box3().setFromObject(o).max.y,z.rimZ);});
    assert.equal(group.getObjectByName('plunge-access-step-0'),undefined);
  }finally{disposeGroup(group);}
  const sun=prepareSunGeometry(settings,data),receivers=sun.cells.filter(cell=>cell.zone==='coldPlunge');
  assert.ok(receivers.length>0);for(const cell of receivers)near(cell.z,z.waterZ);
});

test('seven low-glare route lights and two gate downlights retain a bounded, unshadowed budget',()=>{
  const l=createGardenNightLighting(settings,data,{style:DESIGN_STYLES.find(s=>s.id===settings.designStyle)});
  try{
    const route=l.group.children.filter(o=>o.isLight&&o.userData.routeLight),gate=l.group.children.filter(o=>o.isLight&&o.name.includes('gate-entry-light-downlight'));
    assert.equal(route.length,7);assert.equal(gate.length,2);assert.ok(l.lightCount<=30);
    for(const light of [...route,...gate]){assert.equal(light.castShadow,false);assert.equal(light.userData.nightChannel,'garden');assert.ok(light.isSpotLight);assert.ok(light.target.position.y<light.position.y);}
    assert.equal(l.fixtures.filter(f=>f.kind==='shielded-path-light').length,7);
    assert.equal(l.fixtures.filter(f=>f.kind==='gate-pier-light').length,2);
    assert.equal(l.group.getObjectByName('path-bollard-1'),undefined,'The former three route bollards are replaced');
    l.apply({gardenStrength:.7,pendantStrength:0,hedgeStrength:0});assert.ok([...route,...gate].every(light=>light.visible&&light.intensity>0));
    l.apply(0);assert.ok([...route,...gate].every(light=>!light.visible));
  }finally{l.dispose();}
});

test('plunge walking follows the flush apron and swimming starts only within the shared inner water opening',()=>{
  const walk=createWalkNavigation(data,settings),c=gardenProgram(settings,data).coldPlunge,z=spaLevels(settings,data).coldPlunge;
  for(const x of [c.x-c.pad/2,c.x+c.rim/2]){
    const pose=walk.locateFree([x,z.rimZ+1.57,c.anchor[1]],{floorHint:'garden'});
    assert.equal(pose.swimming,false);near(pose.position[1],z.rimZ+pose.eyeHeight);
  }
  const pose=walk.locateFree([c.anchor[0],z.rimZ+1.57,c.anchor[1]],{floorHint:'garden'});
  assert.equal(pose.swimming,true);assert.equal(pose.surface,'cold-plunge-water');near(pose.position[1],z.waterZ+.32);
});
