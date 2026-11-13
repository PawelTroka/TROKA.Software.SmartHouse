import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planLayout,renderPlan} from '../src/diagrams.js';
import {sunMapBounds,renderSunMap} from '../src/sun-view.js';
import {budgetSideLabels} from '../src/budget-view.js';
import {sunForSettings} from '../src/solar.js';
import {DEFAULT_SETTINGS} from '../src/geometry.js';

const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]];
const sternicza=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));

// A smaller independent north-facing site exercises the display contract without
// importing dimensions, indices or a detached garage from the original property.
function fixture(){
  const angle=28*Math.PI/180;
  const house={id:'house-40',index:0,label:'Korzeniowskiego 40',kind:'house',footprint:rect(2,4,10,8),baseZ:2,roofZ:12};
  return {
    coordinates:{localOriginEN:[0,0],xUnitEN:[-Math.cos(angle),Math.sin(angle)],yUnitEN:[Math.sin(angle),Math.cos(angle)],
      yGridAzimuth:28,latitude:54.40753,longitude:18.63009,horizontalCRS:'EPSG:2180'},
    terrain:{originEN:[-100,-100],cellSize:200,columns:2,rows:2,elevations:[2,2,2,2]},
    site:{id:'korzeniowskiego-40',address:'Korzeniowskiego 40, Gdańsk',streetLabel:'KORZENIOWSKIEGO',
      boundary:rect(0,0,16,30),boundaryNames:['street','left','rear','right'],frontage:16,depth:30,frontSetback:4,
      sideLabels:{left:'west',right:'east'},house,garage:null,rearMidpoint:[7,12],floorReference:{xy:[7,13],z:2},
      terrace:{x:3,y:12,width:8,depth:4},pool:{x:4,y:19,width:3,length:7}},
    buildings:[house,
      {id:'side-neighbour',index:9,label:'Side neighbour',kind:'target',footprint:rect(20,15,8,7),baseZ:2,roofZ:12},
      {id:'front-neighbour',index:2,label:'Front neighbour',kind:'target',footprint:rect(4,-20,8,7),baseZ:2,roofZ:15}],
  };
}
function container(scope){
  const node={addEventListener(){}};
  return {dataset:{mapScope:scope,sunScope:scope},clientWidth:900,clientHeight:760,innerHTML:'',
    querySelectorAll(){return [];},querySelector(){return node;}};
}
const settings={...DEFAULT_SETTINGS,terraceDepth:4,floorHeight:1.7,removeGarage:false};
const observer={x:7,y:14,z:5.35,label:'Terrace',eyeHeight:1.65};
const assertDimension=(html,id,value)=>{
  const match=html.match(new RegExp(`data-dimension-record="${id}"[^>]*>([^<]+)</span>`));
  assert.ok(match,`${id} appears in the selected extent's dimension schedule`);
  assert.equal(Number.parseFloat(match[1].replace('≈ ','')),value,`${id} reports this property's geometry`);
};

test('plan and shade-map extents fit the selected plot and include streetward context',()=>{
  const data=fixture(),frame=container();
  for(const scope of ['garden','context']){
    const plan=planLayout(scope,data,frame),shade=sunMapBounds(scope,data);
    for(const p of data.site.boundary){
      for(const bounds of [plan.bounds,shade])assert.ok(p[0]>=bounds.minX&&p[0]<=bounds.maxX&&p[1]>=bounds.minY&&p[1]<=bounds.maxY);
      const restored=plan.world(plan.X(p[0]),plan.Y(p[1]));
      assert.ok(Math.hypot(restored[0]-p[0],restored[1]-p[1])<1e-9);
    }
    assert.ok(Math.abs((plan.X(2)-plan.X(1))-(plan.Y(2)-plan.Y(1)))<1e-9,'Plan uses equal metre scales');
    if(scope==='context')for(const bounds of [plan.bounds,shade]){
      assert.ok(bounds.minY<-20,'Streetward neighbour must remain visible');
      assert.ok(bounds.maxX>28,'Side neighbour must remain visible');
    }
  }
  assert.ok(planLayout('garden',data,frame).bounds.maxY<35,'No inherited 38 m property extent');
});

test('second-site plan reports actual dimensions, north-facing sides and no inherited garage',()=>{
  const data=fixture(),frame=container('garden');
  renderPlan(frame,data,settings,observer,{rays:[]});
  for(const text of ['Korzeniowskiego 40','4.0 metres from the street',
    'REAR GARDEN / NNE','RIGHT · EAST','LEFT · WEST'])assert.ok(frame.innerHTML.includes(text),text);
  for(const [id,value] of [['plot-width',16],['plot-depth',30],['house-front-boundary',4],
    ['terrace-width',8],['terrace-length',4],['pool-width',3],['pool-length',7]])assertDimension(frame.innerHTML,id,value);
  for(const text of ['STERNICZA','20.32','38.21','EXISTING GARAGE','NaN','undefined'])assert.ok(!frame.innerHTML.includes(text),text);
});

test('a reused numeric building index never gives the second site a PCK 3 sightline preference',()=>{
  const data=fixture(),frame=container('context');
  const ray=(id,height)=>({blockId:id,kind:'roof',target:[22,18,12],visible:true,
    screen:{x:15.5,y:18,requiredHeight:height}});
  const rays=[ray('side-neighbour',3),ray('front-neighbour',8)];
  assert.equal(renderPlan(frame,data,settings,observer,{rays}).ray.blockId,'front-neighbour');
});

test('second-site shade map accepts no detached garage and labels its real physical sides',()=>{
  const data=fixture(),frame=container('garden'),sun=sunForSettings({sunDate:'2026-06-21',sunMinutes:720},data);
  renderSunMap(frame,data,settings,sun,{status:'daylight',cells:[]});
  for(const text of ['Korzeniowskiego 40','KORZENIOWSKIEGO','RIGHT · EAST','LEFT · WEST'])assert.ok(frame.innerHTML.includes(text),text);
  for(const [id,value] of [['plot-width',16],['plot-depth',30],['house-front-boundary',4]])assertDimension(frame.innerHTML,id,value);
  for(const text of ['STERNICZA','NaN','undefined'])assert.ok(!frame.innerHTML.includes(text),text);
});

test('the original plan and budget preserve Sternicza labels while costs name the new site correctly',()=>{
  const frame=container('garden');
  renderPlan(frame,sternicza,{...settings,floorHeight:1.2},observer,{rays:[]});
  for(const text of ['Sternicza 11','REAR GARDEN / SSW','LEFT · EAST','RIGHT · WEST'])assert.ok(frame.innerHTML.includes(text),text);
  for(const [id,value] of [['plot-width',20.32],['plot-depth',38.21],['house-front-boundary',9.10]])assertDimension(frame.innerHTML,id,value);
  assert.deepEqual(budgetSideLabels(sternicza),{rear:'Rear',left:'Left / east',right:'Right / west'});
  assert.deepEqual(budgetSideLabels(fixture()),{rear:'Rear',left:'Left / west',right:'Right / east'});
  assert.deepEqual(budgetSideLabels(),budgetSideLabels(sternicza));
});
