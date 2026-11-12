import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {closestSegments,closestFootprints,closestBoundary,gardenDimensions,dimensionPlanMarkup,dimensionScheduleMarkup,dimensionScheduleGroups} from '../src/dimensions.js';
import {createDimensionGroup,createDimensionOverlay} from '../src/scene-dimensions.js';
import * as THREE from '../vendor/three.module.js';
import {gardenProgram,poolBounds} from '../src/garden-program.js';
import {spaLevels,terraceGroundReference} from '../src/geometry.js';
import {spaSectionCuts,spaSectionDimensionMarkup,planLayout,renderPlan} from '../src/diagrams.js';
import {sunMapBounds} from '../src/sun-view.js';
import {createScreeningTree} from '../src/screening-trees.js';
import {toWorld} from '../src/orientation.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const other=JSON.parse(readFileSync(new URL('../data/korzeniowskiego-40.json',import.meta.url)));
const settings={siteId:'sternicza-11',gardenProgram:'spa-edge',gardenRaise:.5,floorHeight:1.2,terraceDepth:4.2,
  hedgeRear:2.5,hedgeLeft:3,hedgeRight:4,removeGarage:true,showDimensions:true};
const near=(actual,expected,epsilon=1e-8)=>assert.ok(Math.abs(actual-expected)<epsilon,`${actual} != ${expected}`);
const rect=(x,y,width,length)=>[[x,y],[x+width,y],[x+width,y+length],[x,y+length],[x,y]];
const records=s=>new Map(gardenDimensions(s,data).map(r=>[r.id,r]));

test('closest finite segments handle crossing, parallel and endpoint cases exactly',()=>{
  near(closestSegments([0,0],[2,2],[0,2],[2,0]).distance,0);
  near(closestSegments([0,0],[2,0],[1,1],[3,1]).distance,1);
  near(closestSegments([0,0],[1,0],[2,1],[2,3]).distance,Math.sqrt(2));
  near(closestFootprints(rect(0,0,2,2),rect(4,1,2,2)).distance,2);
});

test('boundary clearance follows a rotated parcel, not its axis-aligned bounds',()=>{
  const fixture={site:{boundary:[[0,10],[10,0],[20,10],[10,20],[0,10]],boundaryNames:['front','left','rear','right']}};
  const gap=closestBoundary(rect(8,8,4,4),fixture);
  near(gap.distance,6/Math.SQRT2);
  assert.notEqual(gap.distance,8,'Bounding-box clearance would incorrectly report 8 m');
  const rear=closestBoundary(rect(8,8,4,4),fixture,'rear');
  assert.equal(rear.edge,2);near(rear.distance,6/Math.SQRT2);
});

test('edge proposal measures the finished coping, chamfered sauna and plunge pad',()=>{
  const r=records(settings),program=gardenProgram(settings,data),p=poolBounds(settings,data);
  near(r.get('pool-boundary').value,.8228992160547257);
  near(r.get('sauna-right-boundary').value,1.0919262422537939);
  near(r.get('sauna-rear-boundary').value,1.0764704450293614);
  near(r.get('cold-plunge-boundary').value,1.0396685394531313);
  near(r.get('pool-lounge').value,2.54);
  near(r.get('firepit-width').value,4.56);near(r.get('firepit-length').value,4.60);
  assert.match(r.get('firepit-width').planText,/outer/);
  near(r.get('sauna-plunge').value,.87);
  // The boundary's inward kink is closer than any of the pool coping corners.
  near(r.get('pool-boundary').b[1],data.site.boundary[2][1]);
  near(r.get('pool-boundary').a[0],p.x+p.width+p.coping);
  near(r.get('sauna-width').value,program.sauna.width);
  near(r.get('cold-plunge-width').value,program.coldPlunge.width);
  assert.match(r.get('cold-plunge-boundary').description,/outer pad/);
});

test('vertical annotations use shared floor, grade and water levels after fill changes',()=>{
  const low=records(settings),raised=records({...settings,gardenRaise:.8}),levels=spaLevels(settings,data);
  near(low.get('terrace-drop').value,terraceGroundReference(settings,data).drop);
  near(low.get('terrace-drop').value-raised.get('terrace-drop').value,.3);
  near(low.get('jacuzzi-width').a[2],raised.get('jacuzzi-width').a[2]);
  near(raised.get('sauna-height').a[2]-low.get('sauna-height').a[2],.3);
  near(low.get('sauna-height').value,levels.sauna.roofZ-levels.sauna.floorZ);
  near(low.get('pool-water-depth').value,1.4);
  near(low.get('cold-plunge-water-depth').value,1.1);
  near(low.get('firepit-drop').value,.6);
  near(low.get('sauna-entry-rise').value,levels.sauna.floorZ-levels.sauna.entryGroundZ);
  near(low.get('cold-plunge-entry-rise').value,levels.coldPlunge.rimZ-levels.coldPlunge.entryGroundZ);
  assert.match(low.get('terrace-drop').datum,/0.60 m beyond deck/);
  for(const id of ['pool-boundary','sauna-rear-boundary','sauna-plunge'])near(low.get(id).value,raised.get(id).value);
});

test('independent hedge heights and rotated tree crown axes retain their own metres',()=>{
  const tree={...createScreeningTree('austrian-pine-tall',{id:'test-pine',x:12,y:35}),height:9.5,crownWidth:6,crownDepth:4,rotation:37};
  const r=records({...settings,screeningTrees:[tree]});
  near(r.get('hedge-rear-height').value,2.5);near(r.get('hedge-left-height').value,3);near(r.get('hedge-right-height').value,4);
  near(r.get('test-pine-crown-width').value,6);near(r.get('test-pine-crown-depth').value,4);near(r.get('test-pine-height').value,9.5);
  assert.ok(r.get('test-pine-crown-width').a[1]!==r.get('test-pine-crown-width').b[1]);
});

test('toggle and old/site-specific programs do not introduce phantom spa dimensions',()=>{
  assert.deepEqual(gardenDimensions({...settings,showDimensions:false},data),[]);
  for(const s of [{...settings,gardenProgram:'classic'}, {...settings,siteId:'korzeniowskiego-40'}]){
    const d=s.siteId==='korzeniowskiego-40'?other:data,result=gardenDimensions(s,d);
    assert.ok(result.some(r=>r.id==='terrace-width'));
    assert.equal(result.some(r=>r.id==='sauna-height'||r.id==='cold-plunge-height'),false);
  }
  const snapshot=JSON.stringify(data),state=JSON.stringify(settings);
  gardenDimensions(settings,data);assert.equal(JSON.stringify(data),snapshot);assert.equal(JSON.stringify(settings),state);
});

test('plan has every numeric dimension while 3D uses depth-tested coordinate-correct lines',()=>{
  const dimensions=gardenDimensions(settings,data),markup=dimensionPlanMarkup(dimensions,{X:x=>x*10,Y:y=>y*10,scale:10});
  assert.equal((markup.match(/data-dimension-label=/g)||[]).length,dimensions.length);
  assert.match(markup,/pointer-events="none"/);assert.match(markup,/≈ 0.82 m/);
  assert.equal(dimensionPlanMarkup([],{X:x=>x,Y:y=>y,scale:1}),'');
  const group=createDimensionGroup(dimensions);
  assert.equal(group.children.length,dimensions.length);
  for(const [i,line] of group.children.entries()){
    assert.equal(line.material.depthTest,true);assert.equal(line.material.depthWrite,false);
    assert.ok(line.material.opacity<=.55);assert.equal(line.castShadow,false);
    const coordinates=line.geometry.attributes.position.array,wanted=toWorld(...dimensions[i].lineA);
    wanted.forEach((v,j)=>near(coordinates[j],v,2e-6));
  }
});

test('section dimensions show only cut objects at the same water and floor levels',()=>{
  const p=gardenProgram(settings,data),cuts=spaSectionCuts(settings,data,[p.sauna.x+1,p.sauna.y-3],[0,1]);
  assert.ok(cuts.some(c=>c.kind==='sauna'));assert.equal(cuts.some(c=>c.kind==='pool'),false);
  const markup=spaSectionDimensionMarkup(cuts,{X:x=>x*10,Y:z=>100-z*10,minS:0,maxS:20});
  assert.match(markup,/data-section-dimension="sauna"/);assert.match(markup,/h 2.65 m/);
  assert.doesNotMatch(markup,/data-section-dimension="pool"/);
});

test('label occlusion excludes instanced decorations and caches a stationary camera',()=>{
  const previous=globalThis.document;
  const node=()=>({style:{},dataset:{},classList:{toggle(){}},attributes:{},append(){},remove(){},
    setAttribute(k,v){this.attributes[k]=v;},getAttribute(k){return this.attributes[k];}});
  globalThis.document={createElement:node};
  try{
    let decoratedRays=0,solidRays=0;
    const scene=new THREE.Scene(),root=new THREE.Group(),material=new THREE.MeshBasicMaterial();
    const decorated=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material,1500);
    decorated.raycast=()=>{decoratedRays++;};
    const wall=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material);wall.raycast=()=>{solidRays++;};
    root.add(decorated,wall);scene.add(root);
    const overlay=createDimensionOverlay(node(),scene,()=>[root]);
    const record={id:'test',kind:'width',feature:'test',value:2,text:'2.00 m',sceneText:'2.00 m',priority:1,
      a:[-1,0,1],b:[1,0,1],lineA:[-1,0,1],lineB:[1,0,1],anchor:[0,0,1]};
    overlay.update([record]);
    const camera=new THREE.PerspectiveCamera(50,1,.1,100);camera.position.set(0,4,-8);camera.lookAt(0,1,0);camera.updateMatrixWorld();
    overlay.render(camera,600,600);assert.equal(solidRays,1);assert.equal(decoratedRays,0);
    overlay.render(camera,600,600);assert.equal(solidRays,1,'A stationary camera must reuse label occlusion');
    camera.position.x=.2;camera.updateMatrixWorld();overlay.render(camera,600,600);assert.equal(solidRays,2);
    overlay.dispose();
  }finally{globalThis.document=previous;}
});

test('keyed plans retain every metric exactly once in the expanded schedule',()=>{
  const trees=[12,15,17].map((x,i)=>({...createScreeningTree('austrian-pine-tall',{id:`test-${i}`,x,y:34}),height:9.5}));
  const dimensions=gardenDimensions({...settings,screeningTrees:trees},data),schedule=dimensionScheduleMarkup(dimensions);
  for(const record of dimensions)assert.equal((schedule.match(new RegExp(`data-dimension-record="${record.id}"`,'g'))||[]).length,1,record.id);
  assert.match(schedule,/Pool coping → plot boundary/);assert.doesNotMatch(schedule,/Pool coping → left boundary/);
  for(const width of [340,600]){
    const frame=planLayout('detail',data,{clientWidth:width,clientHeight:500},true);
    const markup=dimensionPlanMarkup(dimensions,{...frame,keyed:true});
    assert.doesNotMatch(markup,/data-dimension-label=/,'The crowded numeric cloud is not used');
    const keys=[...markup.matchAll(/data-dimension-key="([^"]+)" transform="translate\(([-.\d]+),([-.\d]+)\)"/g)].map(m=>({key:m[1],x:Number(m[2]),y:Number(m[3]),width:m[1].length>1?25:20}));
    assert.equal(keys.length,dimensionScheduleGroups(dimensions).filter(g=>g.type!=='hedge').length);
    for(let i=0;i<keys.length;i++)for(let j=i+1;j<keys.length;j++)assert.ok(Math.abs(keys[i].x-keys[j].x)>=(keys[i].width+keys[j].width)/2||Math.abs(keys[i].y-keys[j].y)>=19,`${width}px: ${keys[i].key} overlaps ${keys[j].key}`);
  }
});

test('garden detail enlarges the rear garden while full-plot and neighbourhood remain available',()=>{
  const frame={clientWidth:600,clientHeight:560},detail=planLayout('detail',data,frame,true),whole=planLayout('garden',data,frame,true);
  assert.ok(detail.scale>whole.scale*1.65);assert.ok(detail.bounds.minY>16);
  assert.ok(sunMapBounds('detail',data).minY>16);
  assert.ok(whole.bounds.minY<0);assert.ok(whole.bounds.maxY>38);
  const container={dataset:{},...frame,innerHTML:'',querySelectorAll(){return [];},querySelector(){return {addEventListener(){}};}};
  renderPlan(container,data,settings,{x:10,y:21,z:5,label:'Terrace'}, {rays:[]});
  assert.match(container.innerHTML,/data-map-scope="detail" aria-pressed="true"/);
  assert.match(container.innerHTML,/Whole plot/);assert.match(container.innerHTML,/Neighbourhood/);
  assert.match(container.innerHTML,/plan-workspace--stacked/);assert.match(container.innerHTML,/dimension-schedule/);
});

test('measurement schedule names the correct direction when garden is above the terrace',()=>{
  const dimensions=gardenDimensions({...settings,floorHeight:.2,gardenRaise:.8},data),drop=dimensions.find(r=>r.id==='terrace-drop');
  assert.ok(drop.b[2]<drop.a[2]);
  const html=dimensionScheduleMarkup(dimensions);
  assert.match(html,/garden above deck <span data-dimension-record="terrace-drop"/);
  assert.doesNotMatch(html,/drop <span data-dimension-record="terrace-drop"/);
  assert.match(dimensionScheduleMarkup(gardenDimensions(settings,data)),/drop <span data-dimension-record="terrace-drop"/);
});

test('disabling a specimen preserves the numbering used by its tree controls and map description',()=>{
  const trees=[12,15,17].map((x,i)=>({...createScreeningTree('austrian-pine-tall',{id:`pine-${i+1}`,x,y:34}),enabled:i!==0}));
  const dimensions=gardenDimensions({...settings,screeningTrees:trees},data);
  assert.equal(dimensions.some(r=>r.feature==='pine-1'),false);
  const groups=dimensionScheduleGroups(dimensions).filter(g=>g.type==='tree');
  assert.deepEqual(groups.map(g=>[g.feature,g.key]),[['pine-2','T2'],['pine-3','T3']]);
  assert.equal(dimensions.find(r=>r.id==='pine-2-height').description,'Tree 2 height');
});

test('buried retained hedges never acquire a positive exposed-height dimension',()=>{
  const s={...settings,hedgeRear:.2,hedgeLeft:.2,hedgeRight:.2,gardenRaise:1,raiseNewHedges:false};
  const buried=gardenDimensions(s,data);
  assert.equal(buried.some(r=>r.feature.startsWith('hedge-')),false);
  const visible=gardenDimensions({...s,hedgeRear:1.3},data);
  near(visible.find(r=>r.id==='hedge-rear-height').value,.3);
  assert.equal(visible.some(r=>r.id==='hedge-left-height'||r.id==='hedge-right-height'),false);
});
