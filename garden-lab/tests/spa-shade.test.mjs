import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareSunGeometry,analyzeSunlight,sunlightAtPoint,firstSunBlocker} from '../src/shade.js';
import {gardenProgram,poolBounds} from '../src/garden-program.js';
import {spaLevels,pointInPolygon,jacuzziBounds,observerForPreset,analyzeVisibility,DEFAULT_SETTINGS,terraceGroundReference,floorElevation} from '../src/geometry.js';
import {terraceStairs} from '../src/layout.js';
import {renderPlan,renderSection,spaSectionCuts} from '../src/diagrams.js';
import {renderSunMap,renderSunReadouts} from '../src/sun-view.js';
import {sunForSettings} from '../src/solar.js';

const source=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const other=JSON.parse(readFileSync(new URL('../data/korzeniowskiego-40.json',import.meta.url)));
const settings={...DEFAULT_SETTINGS,gardenProgram:'spa',hedgeRear:0,hedgeLeft:0,hedgeRight:0,
  gardenRaise:.5,bedRaise:0,floorHeight:1.2,terraceDepth:4.2,removeGarage:true,sunEnabled:true,screeningTrees:[]};
const day=direction=>({isDaylight:true,direction});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function flatSite(){
  return {...source,coordinates:{...source.coordinates,localOriginEN:[0,0],xUnitEN:[1,0],yUnitEN:[0,1]},
    terrain:{originEN:[-10,-10],cellSize:1,columns:64,rows:64,elevations:Array(4096).fill(0)},
    buildings:[],site:{...source.site,house:null,garage:null,floorReference:{z:0},
      boundary:[[0,0],[20,0],[20,38],[0,38],[0,0]]}};
}
function frame(){
  return {dataset:{mapScope:'garden',sunScope:'garden'},clientWidth:900,clientHeight:760,innerHTML:'',
    querySelectorAll(){return [];},querySelector(){return {addEventListener(){}};}};
}

test('spa receivers follow the east pool and exclude sauna interiors without altering legacy or Korzeniowskiego zones',()=>{
  const old=prepareSunGeometry({...settings,gardenProgram:'classic'},source),spa=prepareSunGeometry(settings,source),p=gardenProgram(settings,source);
  assert.notEqual(old,spa,'Programme edits must invalidate the geometry cache');
  assert.ok(old.cells.filter(c=>c.zone==='pool').every(c=>c.x<10));
  assert.ok(spa.cells.filter(c=>c.zone==='pool').every(c=>c.x>14.7));
  assert.ok(!spa.cells.some(c=>pointInPolygon([c.x,c.y],p.sauna.footprint)));
  for(const name of ['coldPlunge','firepit'])assert.ok(spa.cells.some(c=>c.zone===name),name);
  const a=analyzeSunlight({...settings,gardenProgram:'classic'},other,day([0,0,1]));
  const b=analyzeSunlight(settings,other,day([0,0,1]));
  assert.deepEqual(b.cells,a.cells);assert.deepEqual(b.zones,a.zones);
  assert.ok(!Object.hasOwn(b.zones,'firepit'));
  assert.ok(!Object.hasOwn(b.zones,'coldPlunge'));
});

test('sauna sun rays pass through panoramic glass but intersect finite walls, floor and roof',()=>{
  const data=flatSite(),geometry=prepareSunGeometry(settings,data),z=spaLevels(settings,data).sauna;
  const sauna=geometry.occluders.filter(o=>o.id.startsWith('sauna'));
  const eye=[4.5,32,z.floorZ+1.3];
  assert.equal(firstSunBlocker(eye,[0,-1,.02],sauna),null,'Front glazing must not be an opaque box');
  assert.equal(firstSunBlocker(eye,[-1,0,.02],sauna)?.label,'Sauna wall');
  assert.match(firstSunBlocker(eye,[0,0,1],sauna)?.id||'',/^sauna-roof/);
  assert.equal(firstSunBlocker([9,32,z.floorZ+1.3],[0,0,1],sauna),null,'Roof footprint must stay finite');
  assert.ok(firstSunBlocker(eye,[0,0,-1],sauna),'Floor remains solid below the glass pavilion');
});

test('sunken lounge receivers use lowered floor and entry treads with a real terrain excavation',()=>{
  const data=flatSite(),g=prepareSunGeometry(settings,data),p=gardenProgram(settings,data),levels=spaLevels(settings,data);
  const floor=g.cells.find(c=>c.zone==='firepit'&&c.x===10.5&&c.y===28.5);
  assert.ok(floor);near(floor.z,levels.firepit.groundZ-.6);
  const step=g.cells.find(c=>c.zone==='firepit'&&c.x===10.5&&c.y===27.5);
  assert.ok(step);near(step.z,levels.firepit.groundZ-.45);
  for(const cell of g.cells.filter(c=>c.zone==='firepit'))assert.equal(sunlightAtPoint(cell,settings,data,day([0,0,1]),g).sunlit,true,'No original terrain or full pit box above the floor');
  const receiver=[9.9,28.5,levels.firepit.floorZ];
  const blocked=sunlightAtPoint(receiver,settings,data,day([-1,0,.1]),g);
  assert.ok(blocked.blocker?.id.startsWith('firepit-'),'A low ray still meets real retaining construction');
  assert.ok(!g.cells.some(c=>c.zone==='garden'&&pointInPolygon([c.x,c.y],p.firepit.footprint)));
  const raised=prepareSunGeometry({...settings,gardenRaise:.8},data);
  for(const cell of g.cells.filter(c=>['firepit','coldPlunge'].includes(c.zone)))near(raised.cells.find(c=>c.x===cell.x&&c.y===cell.y).z-cell.z,.3);
});

test('cold plunge and infinity jacuzzi are distinct, open water surfaces at the shared elevations',()=>{
  const data=flatSite(),g=prepareSunGeometry(settings,data),levels=spaLevels(settings,data),tub=jacuzziBounds(settings,data);
  const shade=analyzeSunlight(settings,data,day([0,0,1]));
  for(const [zone,z] of [['coldPlunge',levels.coldPlunge.waterZ],['jacuzzi',tub.waterZ]]){
    const cells=g.cells.filter(c=>c.zone===zone);assert.ok(cells.length>0);
    for(const cell of cells){near(cell.z,z);assert.equal(sunlightAtPoint(cell,settings,data,day([0,0,1]),g).sunlit,true);}
    assert.equal(shade.zones[zone].percent,100);
  }
  const c=gardenProgram(settings,data).coldPlunge;
  assert.equal(sunlightAtPoint([c.x+c.width/2,c.y+c.length/2,levels.coldPlunge.waterZ],settings,data,day([1,0,.01]),g).blocker?.id,'cold-plunge-rim');
  assert.equal(Object.values(shade.zones).reduce((n,z)=>n+z.total,0),shade.cells.length);
  near(tub.y1,data.site.rearMidpoint[1]+settings.terraceDepth);
  const pool=poolBounds(settings,data);
  for(const cell of g.cells.filter(c=>c.zone==='pool')){
    near(cell.z,levels.pool.waterZ);
    assert.ok(cell.sampleX>pool.x&&cell.sampleX<pool.x+pool.width&&cell.sampleY>pool.y&&cell.sampleY<pool.y+pool.length,'Water rays must not start on the zero-area coping boundary');
    assert.equal(sunlightAtPoint(cell,settings,data,day([0,0,1]),g).sunlit,true,'An edge grid cell samples actual water, not the coping lip');
  }
});

test('terrace sun receivers and opaque treads follow the rendered stair levels without losing the bottom riser',()=>{
  const data=flatSite(),g=prepareSunGeometry(settings,data),floor=floorElevation(settings,data);
  const stairs=terraceStairs(data.site.terrace,settings.terraceDepth,terraceGroundReference(settings,data).drop,settings,data);
  const bodies=g.occluders.filter(o=>o.id==='terrace-step');
  assert.equal(bodies.length,stairs.count);
  for(const [i,body] of bodies.entries()){
    near(body.top,floor-stairs.drop*i/stairs.count);
    assert.ok(body.top>body.base,'Every illustrated tread has a real riser');
  }
  const cells=g.cells.filter(c=>c.x>=stairs.x&&c.x<=stairs.x+stairs.width&&c.y>=stairs.y&&c.y<stairs.y+stairs.length);
  assert.ok(cells.length>0);
  for(const cell of cells){
    const i=Math.floor((cell.y-stairs.y)/.29);near(cell.z,bodies[i].top);
    assert.equal(sunlightAtPoint(cell,settings,data,day([0,0,1]),g).sunlit,true);
  }
});

test('plan and shade maps share spa footprints while sections show only finite intersections and actual excavation depths',()=>{
  const observer=observerForPreset('sofa',settings,source),sun=sunForSettings({...settings,sunDate:'2026-06-21',sunMinutes:720},source);
  const plan=frame(),map=frame();
  renderPlan(plan,source,settings,observer,{rays:[]});
  renderSunMap(map,source,settings,sun,analyzeSunlight(settings,source,sun));
  for(const html of [plan.innerHTML,map.innerHTML])for(const id of ['sauna','firepit','cold-plunge'])assert.ok(html.includes(`data-spa-object="${id}"`));
  const cuts=spaSectionCuts(settings,source,[10.5,24],[0,1]);
  const pit=cuts.find(c=>c.kind==='firepit');assert.ok(pit);near(pit.groundZ-pit.floorZ,.6);
  assert.ok(!cuts.some(c=>c.kind==='sauna'||c.kind==='pool'),'Off-ray objects cannot project into the section');
  assert.equal(spaSectionCuts({...settings,gardenProgram:'classic'},source,[10.5,24],[0,1]).length,0);
  const section=frame(),eye=observerForPreset('firepit',settings,source);
  renderSection(section,source,settings,eye,analyzeVisibility(eye,settings,source));
  assert.ok(section.innerHTML.includes('data-spa-section="firepit"'));
  for(const html of [plan.innerHTML,map.innerHTML,section.innerHTML])assert.ok(!/NaN|undefined/.test(html));
});

test('summer and winter shade is recalculated for the moved pool and never assumes that east is sunnier',()=>{
  const s={...settings,hedgeRear:4,hedgeLeft:4,hedgeRight:4,hedgeInset:.5};
  const morning={...s,sunDate:'2026-06-21',sunMinutes:540};
  const summer=analyzeSunlight(morning,source,sunForSettings(morning,source));
  const winterSettings={...s,sunDate:'2026-12-21',sunMinutes:720};
  const winter=analyzeSunlight(winterSettings,source,sunForSettings(winterSettings,source));
  const noon={...s,sunDate:'2026-06-21',sunMinutes:720};
  const midday=analyzeSunlight(noon,source,sunForSettings(noon,source));
  assert.ok(summer.cells.filter(c=>c.zone==='pool').every(c=>c.blockedBy==='hedge-left'));
  assert.ok(midday.zones.pool.percent>winter.zones.pool.percent);
  assert.ok(midday.zones.pool.percent>summer.zones.pool.percent);
  const classic={...morning,gardenProgram:'classic'},old=analyzeSunlight(classic,source,sunForSettings(classic,source));
  assert.ok(old.zones.pool.percent>summer.zones.pool.percent,'A layout request must not predetermine its sun score');
  assert.notDeepEqual(poolBounds(settings,source),source.site.pool);
});

test('spa-only sunlight cards reveal sample counts and hide again when switching to classic',()=>{
  const before=globalThis.document,nodes=new Map();
  const get=id=>{
    if(!nodes.has(id))nodes.set(id,{style:{setProperty(){}},dataset:{},parentElement:{hidden:true},closest(){return null;},setAttribute(){}});
    return nodes.get(id);
  };
  globalThis.document={getElementById:get,querySelectorAll(){return [];}};
  try{
    const s={...settings,sunDate:'2026-06-21',sunMinutes:720,sunPathVisible:false},sun=sunForSettings(s,source);
    const spa=analyzeSunlight(s,source,sun);renderSunReadouts(sun,spa,s);
    for(const zone of ['coldPlunge','firepit']){
      assert.equal(get(`sunlit-${zone}`).parentElement.hidden,false);
      assert.ok(get(`sunlit-${zone}-count`).textContent.includes(`${spa.zones[zone].total} points`));
    }
    const classic={...s,gardenProgram:'classic'};renderSunReadouts(sun,analyzeSunlight(classic,source,sun),classic);
    for(const zone of ['coldPlunge','firepit'])assert.equal(get(`sunlit-${zone}`).parentElement.hidden,true);
  }finally{if(before===undefined)delete globalThis.document;else globalThis.document=before;}
});
