import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gardenProgram,poolBounds} from '../src/garden-program.js';
import {gardenGroundAt,pointInPolygon,spaLevels,spaSurfaceAt,spaLayoutWarnings,jacuzziBounds,
  observerForPreset,terraceGroundReference,saunaIntersection,saunaOpaqueFaces} from '../src/geometry.js';
import {terraceStairs,rectCorners,rectanglesOverlap,gardenFurniture} from '../src/layout.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const other=JSON.parse(readFileSync(new URL('../data/korzeniowskiego-40.json',import.meta.url)));
const settings={siteId:'sternicza-11',gardenProgram:'spa',gardenRaise:.5,floorHeight:1.2,terraceDepth:4.2,removeGarage:true};
const near=(actual,expected,epsilon=1e-8)=>assert.ok(Math.abs(actual-expected)<epsilon,`${actual} != ${expected}`);

test('spa proposal is explicitly Sternicza-only while historical pool and furniture remain available',()=>{
  const classic=poolBounds({},data);
  for(const key of ['x','y','width','length'])assert.equal(classic[key],data.site.pool[key]);
  assert.equal(gardenProgram({},data).active,false);
  assert.equal(gardenProgram({...settings,siteId:'korzeniowskiego-40'},other).active,false);
  for(const key of ['x','y','width','length'])assert.equal(poolBounds(settings,other)[key],other.site.pool[key]);
  assert.equal(poolBounds({}, {...data,site:{...data.site,pool:null}}),null);
  assert.equal(spaLevels({}, {...data,site:{...data.site,pool:null}}).pool,null);
  assert.notDeepEqual(gardenFurniture(data,settings),gardenFurniture(data));
});

test('spa pool lies on physical left/east, and proposed objects fit the mapped parcel without collisions',()=>{
  const p=gardenProgram(settings,data),objects=[p.pool,p.sauna,p.firepit,p.coldPlunge,p.furniture.dining];
  assert.ok(p.pool.x>data.site.terrace.x+data.site.terrace.width);
  assert.ok(p.sauna.x+p.sauna.width<data.site.terrace.x+data.site.terrace.width/2);
  assert.ok(p.sauna.y>p.firepit.y);
  for(const object of objects)for(const point of object.footprint||rectCorners(object))assert.ok(pointInPolygon(point,data.site.boundary),`${object.id||'Pool/dining'} outside parcel`);
  for(let i=0;i<objects.length;i++)for(let j=i+1;j<objects.length;j++)assert.equal(rectanglesOverlap(objects[i],objects[j]),false,`${objects[i].id} overlaps ${objects[j].id}`);
  // Real circulation gap between lounge and pool coping, not a ray-only fit.
  assert.ok(p.pool.x-p.pool.coping-(p.firepit.x+p.firepit.width)>=1.5);
  for(const depth of [3,4.2,6])assert.equal(rectanglesOverlap({...data.site.terrace,length:depth},p.pool,.28),false);
});

test('infinity-style tub follows the outer terrace edge while the separate stair route clears it',()=>{
  for(const depth of [3,4.2,6]){
    const s={...settings,terraceDepth:depth},t=jacuzziBounds(s,data),deck=data.site.terrace;
    near(t.y1,deck.y+depth);assert.ok(t.infinity);
    near(t.waterZ,t.z-.035);near(t.waterBounds.y1,t.y1-.07);
    assert.ok(t.x0>=deck.x&&t.x1<=deck.x+deck.width&&t.y0>=deck.y);
    const stairs=terraceStairs(deck,depth,terraceGroundReference(s,data).drop,s,data);
    assert.ok(stairs.x>=t.x1+.8,'Independent dry route beside the edge tub');
    assert.ok(stairs.x+stairs.width<=deck.x+deck.width);
  }
  const classic=jacuzziBounds({...settings,gardenProgram:'classic'},data);
  near(classic.waterZ,classic.z-.115);assert.equal(classic.infinity,false);
});

test('sauna uses a level raised pad, six seating places and transparent inward-facing glazing',()=>{
  const p=gardenProgram(settings,data),levels=spaLevels(settings,data),s=p.sauna;
  for(const point of s.footprint)assert.ok(levels.sauna.floorZ>gardenGroundAt(...point,settings,data));
  assert.equal(s.seats,6);
  assert.ok(s.benches.reduce((sum,b)=>sum+Math.max(b.width,b.length),0)>=6*.6);
  const eye=observerForPreset('sauna',settings,data);
  assert.equal(eye.surface,'sauna');near(eye.eyeHeight,1.6);
  const t=jacuzziBounds(settings,data);
  for(const target of [[p.pool.x+p.pool.width/2,p.pool.y+4,levels.pool.waterZ],
    [9.6,21,t.z],[(t.x0+t.x1)/2,(t.y0+t.y1)/2,t.waterZ]]){
    assert.equal(saunaIntersection(eye,target,settings,data),null,'Glazing must retain the intended garden view');
  }
  const above=saunaIntersection(eye,[eye.x,eye.y,eye.z+8],settings,data);
  assert.equal(above?.part,'roof');
  assert.equal(saunaIntersection(eye,[0,eye.y,eye.z],settings,data)?.part,'wall');
  assert.equal(saunaOpaqueFaces({...settings,gardenProgram:'classic'},data).length,0);
  assert.ok(eye.defaultLookYaw<-90,'Sauna looks inward toward the house and pool');
});

test('sunken lounge, steps, cold plunge and custom eyes use the same absolute levels',()=>{
  const p=gardenProgram(settings,data),levels=spaLevels(settings,data),f=p.firepit;
  near(levels.firepit.groundZ-levels.firepit.floorZ,.6);
  near(levels.coldPlunge.waterZ-levels.coldPlunge.bottomZ,1.1);
  assert.ok(levels.coldPlunge.bottomZ<levels.coldPlunge.groundZ);
  const seated=observerForPreset('firepit',settings,data);
  near(seated.z,levels.firepit.floorZ+1.1);
  assert.ok(Math.abs(seated.defaultLookYaw)>170);
  for(const step of levels.firepit.steps){
    const x=step.x+step.width/2,y=step.y+step.length/2;
    near(spaSurfaceAt(x,y,settings,data).groundZ,step.topZ);
    const custom=observerForPreset('custom',{...settings,observerX:x,observerY:y,eyeHeight:1.65},data);
    near(custom.z,step.topZ+1.65);
  }
  const centre=spaSurfaceAt(f.x+f.width/2,f.y+f.length/2,settings,data);
  near(centre.groundZ,levels.firepit.floorZ);
  const raised=spaLevels({...settings,gardenRaise:.8},data);
  near(raised.firepit.floorZ-levels.firepit.floorZ,.3);
  near(raised.sauna.floorZ-levels.sauna.floorZ,.3);
  // Raising garden soil does not move the terrace / built-in jacuzzi.
  near(jacuzziBounds({...settings,gardenRaise:.8},data).z,jacuzziBounds(settings,data).z);
});

test('extreme stairs and retained garage produce explicit design conflicts',()=>{
  assert.deepEqual(spaLayoutWarnings(settings,data),[]);
  assert.ok(spaLayoutWarnings({...settings,terraceDepth:6,floorHeight:2.5,gardenRaise:0},data).some(w=>w.includes('stair run')));
  assert.ok(spaLayoutWarnings({...settings,removeGarage:false},data).some(w=>w.includes('garage')));
  assert.deepEqual(spaLayoutWarnings({...settings,gardenProgram:'classic',removeGarage:false},data),[]);
  assert.deepEqual(spaLayoutWarnings({...settings,siteId:'korzeniowskiego-40'},other),[]);
});
