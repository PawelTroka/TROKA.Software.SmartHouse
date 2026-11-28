import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pendantLightingLayout} from '../src/pendant-layout.js';
import {getSiteProfile} from '../src/sites.js';
import {createStateModel} from '../src/state.js';
import {pointInPolygon,hedgeSegments,frontHedgeLayout,boundaryAccessLayout,jacuzziBounds,terraceGroundReference} from '../src/geometry.js';
import {gardenFurniture,terraceStairs,rectCorners} from '../src/layout.js';
import {gardenProgram,poolBounds} from '../src/garden-program.js';

const sites=['site-data.json','korzeniowskiego-40.json','nadmorska-17.json'].map(file=>{
  const data=JSON.parse(readFileSync(new URL('../data/'+file,import.meta.url)));
  return {data,settings:createStateModel(getSiteProfile(data.site.id,data)).DEFAULTS};
});
const d=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const distanceToLine=(p,a,b)=>{
  const length=d(a,b),projection=((p[0]-a[0])*(b[0]-a[0])+(p[1]-a[1])*(b[1]-a[1]))/(length*length);
  const t=Math.max(0,Math.min(1,projection));
  return d(p,[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);
};

for(const {data,settings} of sites)test(`${data.site.id||'sternicza-11'}: pendants fit the real garden and active hedge sides`,()=>{
  const before=JSON.stringify({data,settings}),layout=pendantLightingLayout(settings,data);
  assert.equal(layout.garden.filter(f=>f.zone==='garden').length,(data.site.id||settings.siteId)==='sternicza-11'?0:3);
  assert.ok(layout.garden.length<=12);
  assert.ok(layout.hedge.length>=5&&layout.hedge.length<=24);
  assert.equal(new Set([...layout.garden,...layout.hedge].map(f=>f.id)).size,layout.garden.length+layout.hedge.length);
  const supported=new Map(layout.supports.map(s=>[s.id,s]));
  const program=gardenProgram(settings,data),pool=poolBounds(settings,data),tub=jacuzziBounds(settings,data);
  const {drop}=terraceGroundReference(settings,data);
  const stairs=terraceStairs({...data.site.terrace,y:data.site.rearMidpoint[1]},settings.terraceDepth,drop,settings,data);
  const blocked=[data.site.house.footprint,rectCorners(pool,pool.coping),
    rectCorners({x:tub.x0,y:tub.y0,width:tub.width,length:tub.length}),...(stairs.count?[rectCorners(stairs)]:[])];
  if(program.active)blocked.push(program.sauna.footprint,program.firepit.outerFootprint,program.coldPlunge.footprint);
  if(data.site.garage&&!settings.removeGarage)blocked.push(data.site.garage.footprint);
  for(const fixture of [...layout.garden,...layout.hedge]){
    for(const key of ['x','y','z','groundZ','hangZ','radius','height'])assert.ok(Number.isFinite(fixture[key]),fixture.id+' '+key);
    assert.ok(pointInPolygon([fixture.x,fixture.y],data.site.boundary),fixture.id);
    assert.ok(!blocked.some(ring=>pointInPolygon([fixture.x,fixture.y],ring)),fixture.id+' obstructs an existing object');
    assert.ok(fixture.hangZ>fixture.z+fixture.height/2,fixture.id+' needs a positive hanging cord');
    assert.ok(fixture.supportIds.every(id=>supported.has(id)));
    if(fixture.zone==='garden'||fixture.zone==='path')assert.ok(fixture.z-fixture.height/2-fixture.groundZ>=2.1,fixture.id+' head clearance');
    else assert.ok(fixture.z-fixture.groundZ>=2.0&&fixture.z-fixture.groundZ<2.8,fixture.id+' inner hedge mounting height');
  }
  for(const support of layout.supports){
    assert.ok(pointInPolygon([support.x,support.y],data.site.boundary),support.id);
    assert.ok(!blocked.some(ring=>pointInPolygon([support.x,support.y],ring)),support.id+' foot obstructs an existing object');
    assert.ok(support.topZ>support.baseZ);
  }
  for(const cable of layout.cables){
    for(const p of cable.points)assert.ok(p.every(Number.isFinite)&&pointInPolygon(p,data.site.boundary),cable.id);
    assert.ok(cable.supportIds.every(id=>supported.has(id)));
  }
  assert.deepEqual([...new Set(layout.hedge.map(f=>f.side))].sort(),data.site.id==='korzeniowskiego-40'?['left','rear','right']:['front','left','rear','right']);
  assert.equal(JSON.stringify({data,settings}),before,'A lighting proposal must not mutate the property or saved design');
});

test('hedge lanterns stay on the interior of planted spans and leave every mapped access opening clear',()=>{
  for(const {data,settings} of sites){
    const layout=pendantLightingLayout(settings,data),segments=hedgeSegments(settings,data);
    const openings=[...frontHedgeLayout(settings,data).openings,...boundaryAccessLayout(settings,data)];
    for(const fixture of layout.hedge){
      const segment=segments[fixture.segmentIndex],p=[fixture.x,fixture.y],q=fixture.boundaryPoint;
      assert.ok(distanceToLine(q,segment.a,segment.b)<1e-7);
      assert.ok(d(q,segment.a)>.7&&d(q,segment.b)>.7);
      assert.ok((segment.b[0]-segment.a[0])*(p[1]-q[1])-(segment.b[1]-segment.a[1])*(p[0]-q[0])>0,'Fixture lies toward the garden, not outside the hedge');
      for(const opening of openings)assert.ok(distanceToLine(q,opening.a,opening.b)>.65,fixture.id+' strays into an access opening');
    }
    for(const cable of layout.cables.filter(c=>c.zone==='hedge')){
      assert.equal(cable.kind,'arm');
      assert.ok(d(cable.points[0],cable.points.at(-1))<.6,'No festoon may bridge a pedestrian or vehicle opening');
    }
  }
});

test('disabled or very low hedges remove their own lanterns without removing dining pendants',()=>{
  const {data,settings}=sites[2];
  const none=pendantLightingLayout({...settings,hedgeFront:0,hedgeRear:0,hedgeLeft:0,hedgeRight:0},data);
  assert.equal(none.hedge.length,0);assert.equal(none.garden.length,3);
  const low=pendantLightingLayout({...settings,hedgeFront:1,hedgeRear:1,hedgeLeft:1,hedgeRight:1},data);
  assert.equal(low.hedge.length,0);
  const noRear=pendantLightingLayout({...settings,hedgeRear:0},data);
  assert.ok(noRear.hedge.length>0);assert.ok(noRear.hedge.every(f=>f.side!=='rear'));
});

test('the dining frame follows raised ground but does not inherit an unrelated house-floor change',()=>{
  const {data,settings}=sites[2],initial=pendantLightingLayout(settings,data);
  const raised=pendantLightingLayout({...settings,gardenRaise:.8},data);
  assert.equal(raised.garden.length,initial.garden.length);
  for(let i=0;i<initial.garden.length;i++){
    assert.ok(Math.abs(raised.garden[i].groundZ-initial.garden[i].groundZ-.8)<1e-8);
    assert.ok(Math.abs(raised.garden[i].z-initial.garden[i].z-.8)<1e-8);
  }
  const higherHouse=pendantLightingLayout({...settings,floorHeight:settings.floorHeight+1},data);
  assert.deepEqual(higherHouse.garden,initial.garden,'Dining in the lawn stays tied to lawn grade');
});

test('turning lights off retains the installed fixtures, while an obstructed dining location omits its frame',()=>{
  const {data,settings}=sites[2];
  assert.deepEqual(pendantLightingLayout({...settings,nightGardenLights:false,nightPendantLights:false,nightHedgeLights:false},data),pendantLightingLayout(settings,data));
  const copy=structuredClone(data),pool=poolBounds(settings,data);
  copy.site.furniture={...gardenFurniture(data,settings),dining:{x:pool.x+.4,y:pool.y+1,width:1.2,length:2}};
  const obstructed=pendantLightingLayout(settings,copy);
  assert.equal(obstructed.garden.length,0,'No supporting pole or hanging frame is placed inside the pool');
  assert.ok(obstructed.hedge.length>0);
  const current=pendantLightingLayout(settings,data),post=current.supports.find(s=>s.zone==='garden');
  const withTree=pendantLightingLayout({...settings,screeningTrees:[{id:'tree-at-post',x:post.x,y:post.y,enabled:true}]},data);
  assert.ok(withTree.supports.every(s=>d([s.x,s.y],[post.x,post.y])>.44),'An added specimen trunk cannot contain a lighting support');
});

test('retaining the garage omits dining pendants with the dining furniture and keeps valid hedge lanterns',()=>{
  const {data,settings}=sites[0],layout=pendantLightingLayout({...settings,removeGarage:false},data);
  assert.equal(layout.garden.filter(f=>f.zone==='garden').length,0);
  assert.ok(layout.supports.every(s=>s.zone!=='garden'),'The hidden dining setting has no pendant supports');
  assert.ok(layout.cables.every(c=>c.zone!=='garden'),'The hidden dining setting has no hanging frame');
  assert.ok(layout.hedge.length>0);
  for(const fixture of [...layout.hedge,...layout.supports]){
    assert.ok(pointInPolygon([fixture.x,fixture.y],data.site.boundary),fixture.id);
    assert.ok(!pointInPolygon([fixture.x,fixture.y],data.site.garage.footprint),fixture.id+' must clear the retained garage');
  }
});
