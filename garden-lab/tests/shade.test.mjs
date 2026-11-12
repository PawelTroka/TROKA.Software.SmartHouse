import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {analyzeSunlight,prepareSunGeometry,firstSunBlocker,sunPrism,sunlightAtPoint,sampledRoofFaces} from '../src/shade.js';
import {applyBuildingOverrides} from '../src/buildings.js';
import {jacuzziBounds,gardenGroundAt} from '../src/geometry.js';

const settings={hedgeRear:0,hedgeLeft:0,hedgeRight:0,hedgeInset:0,gardenRaise:0,bedRaise:0,raiseNewHedges:true,floorHeight:1.2,removeGarage:true,terraceDepth:4,canopyEnabled:false,canopyDepth:4,canopyHeight:2.7,canopyWidth:8,fasciaDepth:.3,sunEnabled:true};
const daytime=direction=>({direction,isDaylight:true,elevation:45});
function fixture(){
  return {
    coordinates:{localOriginEN:[0,0],xUnitEN:[1,0],yUnitEN:[0,1]},
    terrain:{originEN:[-10,-10],cellSize:1,columns:64,rows:64,elevations:Array(4096).fill(0)},
    site:{boundary:[[0,0],[20,0],[20,38],[0,38],[0,0]],boundaryNames:['street','east-rear','rear','west-rear'],rearMidpoint:[10,10],floorReference:{z:0},house:null,garage:null,terrace:{x:6,y:10,width:8,depth:4},pool:{x:5,y:20,width:4,length:6}},
    buildings:[],
  };
}
const realData=JSON.parse(fs.readFileSync(new URL('../data/site-data.json',import.meta.url),'utf8'));

test('sun rays cast box shadows away from the sun with the expected H / tan(elevation) length',()=>{
  const b=sunPrism('box',[[0,0],[2,0],[2,2],[0,2]],0,5);
  for(const altitude of [15,30,45,60]){
    const a=altitude*Math.PI/180,length=5/Math.tan(a),direction=[0,Math.cos(a),Math.sin(a)];
    assert.equal(firstSunBlocker([1,-length+.01,0],direction,[b])?.id,'box',`Inside ${altitude}° shadow`);
    assert.equal(firstSunBlocker([1,-length-.01,0],direction,[b]),null,`Outside ${altitude}° shadow`);
  }
  assert.equal(firstSunBlocker([1,-4,0],[0,-1,1],[b]),null,'Reversing the sun must reverse the shadow');
  assert.equal(firstSunBlocker([3,-4,0],[0,1,1],[b]),null,'Finite width must not become an infinite wall');
});

test('closed and open footprints, vertical rays and raised receivers remain geometric',()=>{
  const ring=[[0,0],[2,0],[2,2],[0,2]],open=sunPrism('box',ring,0,5),closed=sunPrism('box',[...ring,ring[0]],0,5);
  assert.deepEqual(firstSunBlocker([1,-4,0],[0,1,1],[open]),firstSunBlocker([1,-4,0],[0,1,1],[closed]));
  assert.equal(firstSunBlocker([1,1,6],[0,0,1],[open]),null,'A receiver above the roof cannot shade itself');
  assert.equal(firstSunBlocker([1,-4,2],[0,1,1],[open]),null,'A higher receiver shortens the shadow');
  assert.equal(firstSunBlocker([1,1,2],[0,0,1],[open])?.id,'box','A hypothetical moved opaque building encloses its receiver');
});

test('a finite canopy shades its terrace footprint and does not become an infinite roof',()=>{
  const data=fixture(),s={...settings,canopyEnabled:true};
  assert.equal(sunlightAtPoint([10,12,1.2],s,data,daytime([0,0,1])).blocker?.id,'canopy-roof');
  assert.equal(sunlightAtPoint([2,12,0],s,data,daytime([0,0,1])).sunlit,true);
  assert.equal(sunlightAtPoint([10,12,1.2],settings,data,daytime([0,0,1])).sunlit,true);
  const shaded=analyzeSunlight(s,data,daytime([0,0,1])),open=analyzeSunlight(settings,data,daytime([0,0,1]));
  assert.equal(shaded.zones.terrace.percent,0);
  assert.equal(open.zones.terrace.percent,100);
});

test('rear and side hedges shade finite rays independently',()=>{
  const data=fixture(),sun=daytime([0,1,1]),receiver=[10,35,0];
  assert.equal(sunlightAtPoint(receiver,{...settings,hedgeRear:2.5},data,sun).sunlit,true);
  assert.equal(sunlightAtPoint(receiver,{...settings,hedgeRear:4},data,sun).blocker?.id,'hedge-rear');
  assert.equal(sunlightAtPoint(receiver,{...settings,hedgeRight:6},data,sun).sunlit,true,'Right hedge is not crossed by a ray toward the rear boundary');
  assert.equal(sunlightAtPoint([18,24,0],{...settings,hedgeLeft:4},data,daytime([1,0,1])).blocker?.id,'hedge-left');
  assert.equal(sunlightAtPoint([2,24,0],{...settings,hedgeRight:4},data,daytime([-1,0,1])).blocker?.id,'hedge-right');
});

test('raising only hedge beds and lifting the whole garden are distinct sunlight scenarios',()=>{
  const data=fixture(),sun=daytime([0,1,1]),s={...settings,hedgeRear:2.5};
  assert.equal(sunlightAtPoint([10,35,0],s,data,sun).sunlit,true);
  assert.equal(sunlightAtPoint([10,35,0],{...s,bedRaise:.6},data,sun).sunlit,false,'Only the hedge is raised across this ray');
  assert.equal(sunlightAtPoint([10,35,.6],{...s,gardenRaise:.6},data,sun).sunlit,true,'Moving both hedge and receiver preserves their relative height on flat land');
  assert.equal(sunlightAtPoint([10,35,0],{...s,bedRaise:.6,raiseNewHedges:false},data,sun).sunlit,true,'Soil must not lift retained foliage');
});

test('receiver levels follow garden and pool fill while the terrace stays at its floor',()=>{
  const data=fixture(),base=prepareSunGeometry(settings,data),raised=prepareSunGeometry({...settings,gardenRaise:.5},data);
  for(const zone of ['garden','pool','terrace','jacuzzi','front']){
    const before=base.cells.find(c=>c.zone===zone),after=raised.cells.find(c=>c.x===before.x&&c.y===before.y);
    assert.ok(Math.abs(after.z-before.z-(['garden','pool'].includes(zone)?.5:0))<1e-10,zone);
  }
  assert.equal(raised.cells.find(c=>c.zone==='pool').z,.555);
  assert.equal(raised.cells.find(c=>c.zone==='terrace').z,1.2);
  assert.equal(raised.cells.find(c=>c.zone==='jacuzzi').z,1.085);
});

test('retaining the garage adds its walls and pitched roof and removes its ground receivers',()=>{
  const data=fixture();data.site.garage={id:'garage-site',footprint:[[14,18],[18,18],[18,24],[14,24],[14,18]],baseZ:0,roofZ:5.7,roofTopZ:7};
  const sun=daytime([1,0,1]),retained={...settings,removeGarage:false};
  assert.equal(sunlightAtPoint([12,20,0],settings,data,sun).sunlit,true);
  assert.equal(sunlightAtPoint([12,20,0],retained,data,sun).sunlit,false);
  assert.ok(prepareSunGeometry(settings,data).cells.some(c=>c.x===15.5&&c.y===20.5));
  assert.ok(!prepareSunGeometry(retained,data).cells.some(c=>c.x===15.5&&c.y===20.5));
});

test('night is no direct sunlight, rather than 100 percent architectural shade',()=>{
  const data=fixture(),result=analyzeSunlight(settings,data,{isDaylight:false,elevation:-10,direction:[0,1,-.1]});
  assert.equal(result.status,'night');assert.equal(result.isDaylight,false);
  assert.ok(result.cells.length>0&&result.cells.every(c=>c.state==='night'&&!c.sunlit));
  for(const zone of Object.values(result.zones)){assert.equal(zone.percent,null);assert.equal(zone.sunlit,0);assert.equal(zone.shaded,0);}
  assert.equal(analyzeSunlight({...settings,sunEnabled:false},data,daytime([0,0,1])).status,'disabled');
});

test('design geometry is reused across time changes and rebuilt for building overrides',()=>{
  const a=prepareSunGeometry(settings,realData),same=prepareSunGeometry({...settings,sunMinutes:900},realData);
  assert.equal(a,same);
  assert.notEqual(prepareSunGeometry({...settings,hedgeRear:6},realData),a);
  const adjusted=applyBuildingOverrides(realData,{b9HeightDelta:3,b9DistanceDelta:5});
  const changed=prepareSunGeometry(settings,adjusted),oldBlock=a.occluders.find(o=>o.id==='building-9'),newBlock=changed.occluders.find(o=>o.id==='building-9');
  assert.notEqual(changed,a);assert.ok(newBlock.top>oldBlock.top);assert.notDeepEqual(newBlock.footprint,oldBlock.footprint);
});

test('sampled roof triangulation retains elevations above the body and outdoor counts reconcile',()=>{
  const b=realData.buildings.find(b=>b.index===9),faces=sampledRoofFaces(b.footprint,b.roofPoints,b.roofZ);
  assert.ok(faces.length>20);assert.ok(faces.flat().some(p=>p[2]>b.roofZ+1));
  const result=analyzeSunlight({...settings,hedgeRear:4,hedgeLeft:4,hedgeRight:4},realData,daytime([0,1,1]));
  assert.equal(Object.values(result.zones).reduce((s,z)=>s+z.total,0),result.cells.length);
  for(const zone of Object.values(result.zones)){assert.equal(zone.sunlit+zone.shaded,zone.total);assert.ok(zone.percent===null||zone.percent>=0&&zone.percent<=100);}
  assert.ok(!result.cells.some(c=>c.zone==='terrace'&&c.z!==realData.site.floorReference.z+settings.floorHeight));
});

test('house and retained garage use fixed measured roofs when the proposed floor changes',()=>{
  const before=prepareSunGeometry({...settings,removeGarage:false,floorHeight:0},realData);
  const after=prepareSunGeometry({...settings,removeGarage:false,floorHeight:2.5},realData);
  const existing=geometry=>geometry.occluders.filter(o=>/^house(?:-|$)|^garage(?:-|$)/.test(o.id));
  assert.deepEqual(existing(before),existing(after),'Changing an interior floor cannot move surveyed exterior roof geometry');
  assert.ok(before.occluders.find(o=>o.id==='house-roof').triangles.length>50,'Measured house roof is not a schematic two-plane gable');
  assert.ok(before.occluders.find(o=>o.id==='garage-roof').triangles.length>20,'Measured garage roof is shared with the renderer');
  assert.ok(!before.occluders.some(o=>o.id==='house-chimney'||o.id==='house-front-gable'),'Unverified decorative roof structures must not cast numerical shadows');
});

test('pool surface and ray origin match the rendered water at every garden level',()=>{
  const data=fixture();
  for(const gardenRaise of [0,.5,1]){
    const s={...settings,gardenRaise},g=prepareSunGeometry(s,data),cell=g.cells.find(c=>c.zone==='pool');
    assert.ok(Math.abs(cell.z-gardenGroundAt(7,23,s,data)-.055)<1e-10);
    const overhead=sunPrism('height-check',[[cell.x-.1,cell.y-.1],[cell.x+.1,cell.y-.1],[cell.x+.1,cell.y+.1],[cell.x-.1,cell.y+.1]],gardenRaise+1,gardenRaise+2);
    const result=sunlightAtPoint(cell,s,data,daytime([0,0,1]),{...g,occluders:[overhead]});
    assert.ok(Math.abs(result.blocker.distance-.94)<1e-10,'Actual ray starts at centre ground +0.060 m');
  }
});

test('the recessed jacuzzi is an exclusive water zone with an open terrace hole',()=>{
  const data=fixture(),g=prepareSunGeometry(settings,data),tub=jacuzziBounds(settings,data);
  const receiver=[(tub.x0+tub.x1)/2,(tub.y0+tub.y1)/2,settings.floorHeight-.115];
  assert.equal(sunlightAtPoint(receiver,settings,data,daytime([0,0,1]),g).sunlit,true,'Overhead sun reaches the water through the deck opening');
  assert.equal(sunlightAtPoint(receiver,settings,data,daytime([-1,0,.01]),g).blocker?.id,'terrace-edge','A low ray meets the finite deck edge beside the opening');
  const shade=analyzeSunlight(settings,data,daytime([0,0,1]));
  assert.ok(shade.zones.jacuzzi.total>0);assert.equal(shade.zones.jacuzzi.percent,100);
  assert.equal(Object.values(shade.zones).reduce((n,z)=>n+z.total,0),shade.cells.length,'Water cells are not double-counted as terrace');
  assert.ok(g.cells.filter(c=>c.zone==='jacuzzi').every(c=>Math.abs(c.z-1.085)<1e-10));
  assert.equal(g.cells.find(c=>c.x===12.5&&c.y===11.5).zone,'terrace','A sample on coping is not water');
});

test('jacuzzi water samples follow the rendered inset and rounded corners',()=>{
  const g=prepareSunGeometry(settings,realData),tub=jacuzziBounds(settings,realData);
  const water=g.cells.filter(c=>c.zone==='jacuzzi');
  assert.ok(water.length>0);
  for(const c of water){
    assert.ok(c.x>=tub.x0+.16&&c.x<=tub.x1-.16&&c.y>=tub.y0+.16&&c.y<=tub.y1-.16);
  }
  assert.equal(g.cells.find(c=>c.x===7.5&&c.y===21.5).zone,'terrace','The clipped rounded water corner cannot count as a water sample');
  assert.equal(g.cells.find(c=>c.x===6.5&&c.y===20.5).zone,'jacuzzi');
});

test('excavated pool terrain cannot self-shadow water but the same retained hill casts shade',()=>{
  const data=fixture();
  // Centre water is level; the original DTM ridge lies east of its centre and
  // completely inside the proposed pool excavation [5,9] × [20,26].
  data.terrain={originEN:[0,0],cellSize:.25,columns:81,rows:161,elevations:Array.from({length:81*161},(_,i)=>{
    const x=(i%81)*.25,y=Math.floor(i/81)*.25;
    return x>=7.5&&x<=8.5&&y>=20&&y<=26?.8:0;
  })};
  const receiver=[7,23,.055],sun=daytime([1,0,.1]);
  assert.equal(sunlightAtPoint(receiver,settings,data,sun).sunlit,true);
  const unexcavated={...data,site:{...data.site,pool:{x:1,y:30,width:3,length:6}}};
  assert.equal(sunlightAtPoint(receiver,settings,unexcavated,sun).blocker?.id,'terrain');
});

test('raised soil beneath a low recessed tub is excavated rather than filling its water',()=>{
  const data=fixture(),s={...settings,floorHeight:.2,gardenRaise:.5},tub=jacuzziBounds(s,data);
  const receiver=[(tub.x0+tub.x1)/2,(tub.y0+tub.y1)/2,s.floorHeight-.115];
  assert.equal(sunlightAtPoint(receiver,s,data,daytime([0,0,1])).sunlit,true);
  assert.equal(sunlightAtPoint(receiver,s,data,daytime([0,1,.05])).sunlit,false,'Soil or terrace beyond the excavation still shades low sunlight');
});
