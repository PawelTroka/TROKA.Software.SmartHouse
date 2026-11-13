import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {contextTerrainAt,neighborhoodBounds,buildingCenter,surroundingBuildings,buildingViewLabel,isAcrossStreet,defaultViewBuilding,gazeAtBuilding} from '../src/neighborhood.js';
import {terrainAt,gardenGroundAt,observerForPreset,analyzeVisibility,buildingIntersection,segmentIntersection,pointInPolygon} from '../src/geometry.js';
import {gazeDirection} from '../src/orientation.js';
import {planLayout,renderPlan} from '../src/diagrams.js';
import {DEFAULTS} from '../src/state.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const near=(a,b,epsilon=1e-7)=>assert.ok(Math.abs(a-b)<=epsilon,`${a} should equal ${b}`);
const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]];
const local=([e,n])=>{
  const {localOriginEN:o,xUnitEN:ux,yUnitEN:uy}=data.coordinates;
  return [(e-o[0])*ux[0]+(n-o[1])*ux[1],(e-o[0])*uy[0]+(n-o[1])*uy[1]];
};

test('context terrain samples the wider measured grid with north-increasing rows and bilinear interpolation',()=>{
  const t=data.contextTerrain,col=31,row=92;
  const at=(i,j)=>t.elevations[j*t.columns+i];
  const xy=local([t.originEN[0]+col*t.cellSize,t.originEN[1]+row*t.cellSize]);
  near(contextTerrainAt(...xy,data),at(col,row));
  const middle=local([t.originEN[0]+(col+.5)*t.cellSize,t.originEN[1]+(row+.5)*t.cellSize]);
  near(contextTerrainAt(...middle,data),(at(col,row)+at(col+1,row)+at(col,row+1)+at(col+1,row+1))/4);
  const beyond=local([t.originEN[0]-200,t.originEN[1]-200]);
  near(contextTerrainAt(...beyond,data),at(0,0));
  assert.notEqual(contextTerrainAt(...xy,data),terrainAt(...xy,data),'Wider rendering ground must not repeat the clamped plot-edge height');
});

test('context terrain cannot change physical property levels and absent context keeps the legacy fallback',()=>{
  const changed={...data,contextTerrain:{...data.contextTerrain,elevations:data.contextTerrain.elevations.map(()=>99)}};
  for(const[x,y]of [[10,4],[10,30],[18,35],[-40,-80]]){
    near(terrainAt(x,y,changed),terrainAt(x,y,data));
    near(gardenGroundAt(x,y,DEFAULTS,changed),gardenGroundAt(x,y,DEFAULTS,data));
  }
  assert.deepEqual(observerForPreset('sofa',DEFAULTS,changed),observerForPreset('sofa',DEFAULTS,data));
  near(contextTerrainAt(10,30,changed),99);
  const legacy={...data};delete legacy.contextTerrain;
  near(contextTerrainAt(-40,-80,legacy),terrainAt(-40,-80,legacy));
});

test('all 142 mapped surroundings are selectable, with descriptive front labels and correct default targets',()=>{
  const available=surroundingBuildings(data);
  assert.equal(available.length,142);
  assert.equal(available.filter(b=>isAcrossStreet(b,data)).length,85);
  assert.equal(defaultViewBuilding(data,false).id,'building-9');
  assert.equal(defaultViewBuilding(data,true).id,'building-6','The nearest front-side source building is the default street target');
  assert.match(buildingViewLabel(defaultViewBuilding(data,true),data),/^Across Sternicza/);
  assert.equal(buildingViewLabel(data.buildings.find(b=>b.id==='building-9'),data),'PCK 3');
  const withHouse={...data,buildings:[...data.buildings,data.site.house,data.site.garage]};
  assert.equal(surroundingBuildings(withHouse).length,142,'House/garage are not duplicated as surrounding targets');
  const fallback={...data};delete fallback.neighborhood;
  for(const id of ['building-5','building-6','building-7'])assert.ok(isAcrossStreet(data.buildings.find(b=>b.id===id),fallback));
});

test('gaze turns toward all four site directions without moving the observer or model geometry',()=>{
  const eye=Object.freeze({x:10,y:20,z:5}),before=JSON.stringify(eye);
  for(const [name,dx,dy,expectedYaw]of [['rear',0,15,0],['front',0,-15,180],['east',15,0,-90],['west',-15,0,90]]){
    const target={footprint:rect(eye.x+dx-1,eye.y+dy-1,2,2),baseZ:0,roofZ:10};
    const snapshot=JSON.stringify(target),gaze=gazeAtBuilding(eye,target);
    near(Math.abs(gaze.lookYaw),Math.abs(expectedYaw));
    if(expectedYaw!==180)near(gaze.lookYaw,expectedYaw);
    const direction=gazeDirection(gaze.lookYaw);
    near(direction[0],dx/15);near(direction[1],dy/15);
    assert.ok(Number.isFinite(gaze.lookPitch)&&gaze.lookPitch>=-60&&gaze.lookPitch<=60,name);
    assert.deepEqual(Object.keys(gaze).sort(),['lookPitch','lookYaw']);
    assert.equal(JSON.stringify(target),snapshot);
    assert.equal(JSON.stringify(eye),before);
    assert.deepEqual(gazeAtBuilding([eye.x,eye.y,eye.z],target),gaze);
  }
  const elevated={footprint:rect(9.99,19.99,.02,.02),baseZ:50,roofZ:60};
  assert.equal(gazeAtBuilding(eye,elevated).lookPitch,60);
});

test('building centres preserve actual polygon centroids and never expose a mutable source coordinate',()=>{
  const shape={footprint:[[0,0],[6,0],[6,2],[2,2],[2,6],[0,6],[0,0]]};
  near(buildingCenter(shape)[0],2.2);near(buildingCenter(shape)[1],2.2);
  const b=data.buildings.find(b=>b.context),before=[...b.context.centroidXY],center=buildingCenter(b);
  assert.deepEqual(center,before);center[0]+=100;
  assert.deepEqual(b.context.centroidXY,before);
});

test('the context plan contains all 142 buildings and its screen coordinates round-trip to world metres',()=>{
  const container={dataset:{mapScope:'context'},clientWidth:900,clientHeight:700,innerHTML:'',
    querySelectorAll(){return [];},querySelector(){return {addEventListener(){}};}};
  const frame=planLayout('context',data,container,true);
  assert.deepEqual(frame.bounds,neighborhoodBounds(data));
  assert.ok(frame.bounds.minY<-200&&frame.bounds.maxY>236);
  for(const b of data.buildings)for(const[x,y]of b.footprint){
    assert.ok(x>=frame.bounds.minX&&x<=frame.bounds.maxX&&y>=frame.bounds.minY&&y<=frame.bounds.maxY,b.id);
    assert.ok(frame.X(x)>0&&frame.X(x)<frame.W&&frame.Y(y)>0&&frame.Y(y)<frame.H,b.id);
    const restored=frame.world(frame.X(x),frame.Y(y));near(restored[0],x);near(restored[1],y);
  }
  near(frame.X(1)-frame.X(0),frame.Y(1)-frame.Y(0));
  renderPlan(container,data,{...DEFAULTS,showDimensions:false},observerForPreset('front',DEFAULTS,data),{rays:[]},()=>{},{},container);
  for(const b of data.buildings){
    const points=b.footprint.map(([x,y])=>`${frame.X(x).toFixed(2)},${frame.Y(y).toFixed(2)}`).join(' ');
    assert.ok(container.innerHTML.includes(`points="${points}"`),`${b.id} is present in the actual neighbourhood SVG`);
  }
  assert.doesNotMatch(container.innerHTML,/NaN|Infinity/);
});

function houseFixture(targetY){
  const house={id:'own-house',kind:'house',baseZ:10,roofZ:18,footprint:rect(0,0,4,4)};
  const target={id:'target',kind:'target',label:'Neighbour',baseZ:10,roofZ:16,roofSampleCount:0,highFeatures:[],
    footprint:rect(1,targetY,2,2),samples:[[2,targetY<0?targetY+2:targetY,12]]};
  return {...data,site:{...data.site,house,garage:null},buildings:[target]};
}
const noScreens={...DEFAULTS,gardenProgram:'classic',screeningTrees:[],hedgeRear:0,hedgeLeft:0,hedgeRight:0,hedgeFront:0,
  gardenRaise:0,bedRaise:0,canopyEnabled:false,removeGarage:true};

test('the own house screens outdoor garden-to-street and street-to-rear rays, but not unrelated high rays',()=>{
  for(const [observer,targetY]of [[{x:2,y:12,z:12},-8],[{x:2,y:-4,z:12},8]]){
    const d=houseFixture(targetY),result=analyzeVisibility(observer,noScreens,d);
    assert.equal(result.total,1);assert.equal(result.visible,0);
    assert.equal(result.rays[0].blockedBy,'building');assert.equal(result.rays[0].obstruction.buildingId,'own-house');
  }
  const d=houseFixture(8),elevated={...d,buildings:d.buildings.map(b=>({...b,baseZ:20,roofZ:24,samples:[[2,8,22]]}))};
  assert.equal(analyzeVisibility({x:2,y:-4,z:22},noScreens,elevated).visible,1,'Finite roof height cannot block a ray entirely above it');
});

test('an indoor viewpoint retains the aperture convention and does not treat its own enclosing house as opaque',()=>{
  const d=houseFixture(8),eye={x:2,y:2,z:12},before=JSON.stringify(d);
  const result=analyzeVisibility(eye,noScreens,d);
  assert.equal(result.total,1);assert.equal(result.visible,1);
  assert.equal(result.rays[0].blockedBy,null);
  assert.equal(JSON.stringify(d),before,'The outside-only house blocker must not mutate shared building arrays');
});

// Reference to the pre-optimisation exact polygon/roof intersections. Comparing
// against it verifies the new bounds rejection rather than just testing AABBs.
function exactIntersection(a,b,building){
  const hits=[];
  for(let i=0;i<building.footprint.length-1;i++){
    const hit=segmentIntersection(a,b,building.footprint[i],building.footprint[i+1]);
    if(!hit||hit.t<=1e-5||hit.t>=1-1e-5)continue;
    const z=a[2]+hit.t*(b[2]-a[2]);
    if(z>=building.baseZ-1e-8&&z<=building.roofZ+1e-8)hits.push({...hit,z,buildingId:building.id});
  }
  const dz=b[2]-a[2];
  if(Math.abs(dz)>1e-8){
    const t=(building.roofZ-a[2])/dz,x=a[0]+t*(b[0]-a[0]),y=a[1]+t*(b[1]-a[1]);
    if(t>1e-5&&t<1-1e-5&&pointInPolygon([x,y],building.footprint))hits.push({t,x,y,z:building.roofZ,buildingId:building.id});
  }
  return hits.sort((x,y)=>x.t-y.t)[0]||null;
}

test('cached bounds rejection preserves exact polygon intersections across every expanded source building',()=>{
  let checked=0,hits=0,misses=0;
  for(const building of data.buildings){
    const [x,y]=buildingCenter(building),z=(building.baseZ+building.roofZ)/2;
    const vertex=building.footprint[0];
    const rays=[
      [[x-80,y-80,z],[x+80,y+80,z]],
      [[x,y,building.roofZ+3],[x,y,building.baseZ-3]],
      [[x-80,y,building.roofZ+1],[x+80,y,building.roofZ+1]],
      [[9.6,5,4],[vertex[0],vertex[1],z]],
      [[x-80,y-80,z],[x-70,y-70,z]],
      [[x-80,vertex[1],building.roofZ],[x+80,vertex[1],building.roofZ]],
    ];
    for(const[a,b]of rays){
      const expected=exactIntersection(a,b,building),actual=buildingIntersection(a,b,building);
      assert.equal(Boolean(actual),Boolean(expected),`${building.id}: ${JSON.stringify([a,b])}`);
      if(expected){hits++;for(const key of ['t','x','y','z'])near(actual[key],expected[key]);assert.equal(actual.buildingId,building.id);}
      else misses++;
      checked++;
    }
  }
  assert.equal(checked,852);assert.ok(hits>150&&misses>150);
});
