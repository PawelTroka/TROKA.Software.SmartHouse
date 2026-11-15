import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getSiteProfile} from '../src/sites.js';
import {createStateModel} from '../src/state.js';
import {UPPER_FLOOR_PRESETS,upperFloorPreset} from '../src/viewpoints.js';
import {gazeDirection} from '../src/orientation.js';
import {pointInPolygon,terrainAt,gardenGroundAt,floorElevation,terraceGroundReference,spaLevels,
  observerForPreset,jacuzziBounds,canopyBounds,segmentIntersection,buildingIntersection,hedgeSegments,
  boundaryAccessLayout,screenOnRay,analyzeVisibility} from '../src/geometry.js';
import {poolBounds} from '../src/garden-program.js';
import {rectCorners,terraceStairs,gardenFurniture,rectanglesOverlap} from '../src/layout.js';
import {polygonArea,estimateCosts} from '../src/costs.js';
import {gardenDimensions,closestFootprints,nearbyDimensionBuildings} from '../src/dimensions.js';
import {sunForSettings,localSunDirection} from '../src/solar.js';
import {prepareSunGeometry,analyzeSunlight} from '../src/shade.js';
import {createGardenNightLighting} from '../src/scene-night-lights.js';
import {nightLightingState,isWindowLit} from '../src/night-lighting.js';
import {contextFacadePlacements} from '../src/scene.js';
import {isAcrossStreet} from '../src/neighborhood.js';
import {renderPlan,planLayout} from '../src/diagrams.js';
import {renderSunMap,sunMapBounds} from '../src/sun-view.js';

const data=JSON.parse(readFileSync(new URL('../data/nadmorska-17.json',import.meta.url)));
const profile=getSiteProfile(data.site.id,data),model=createStateModel(profile),settings=model.DEFAULTS;
const near=(a,b,tolerance=1e-6,label='')=>assert.ok(Math.abs(a-b)<=tolerance,`${label}: ${a} differs from ${b}`);
const en=([x,y])=>data.coordinates.localOriginEN.map((origin,i)=>origin+x*data.coordinates.xUnitEN[i]+y*data.coordinates.yUnitEN[i]);
const bounds=points=>({minX:Math.min(...points.map(p=>p[0])),maxX:Math.max(...points.map(p=>p[0])),minY:Math.min(...points.map(p=>p[1])),maxY:Math.max(...points.map(p=>p[1]))});
const sourceOrigin=[473943.647708163,728775.125777694];
// Independent raw ULDK responses retrieved before the derived dataset existed.
// https://uldk.gugik.gov.pl/?request=GetParcelById&id=226101_1.0008.136/2&result=geom_wkt&srid=2180
const parcel136=[[473943.647708163,728775.125777694],[473934.134273914,728781.567473587],
  [473924.638062227,728782.182029478],[473923.807502797,728779.295364544],
  [473917.606818816,728756.485590212],[473927.171068031,728750.103141208]];
// https://uldk.gugik.gov.pl/?request=GetParcelById&id=226101_1.0008.135/8&result=geom_wkt&srid=2180
const parcel135=[[473923.807502797,728779.295364544],[473915.879037603,728782.626205216],
  [473906.62424153,728762.228525847],[473910.105280018,728760.320098295],[473917.606818816,728756.485590212]];
const independentArea=ring=>{
  const p=ring.map(q=>q.map((v,i)=>v-sourceOrigin[i]));
  return Math.abs(p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-b[0]*a[1];},0))/2;
};
function assertInside(rect,label){
  const corners=rectCorners(rect);
  // Sample edges as well as vertices: this parcel has a genuine concave notch.
  for(let edge=0;edge<4;edge++)for(let i=0;i<=20;i++){
    const a=corners[edge],b=corners[(edge+1)%4],p=a.map((v,j)=>v+(b[j]-v)*i/20);
    assert.ok(pointInPolygon(p,data.site.boundary),`${label} outside mapped union at ${p}`);
  }
}
function frame(scope='garden'){
  const node={addEventListener(){}};
  return {dataset:{mapScope:scope,sunScope:scope},clientWidth:1100,clientHeight:780,innerHTML:'',
    querySelectorAll(){return [];},querySelector(){return node;}};
}

test('Nadmorska uses the official two-parcel union rather than scaling it to the advertised area',()=>{
  assert.deepEqual(new Set(data.site.parcels),new Set(['226101_1.0008.136/2','226101_1.0008.135/8']));
  const expectedArea=independentArea(parcel136)+independentArea(parcel135);
  near(polygonArea(data.site.boundary),expectedArea,1e-5);
  near(data.site.area,expectedArea,.005);
  near(expectedArea,709.2930417371884,1e-6);
  assert.equal(data.site.advertisedArea,800);
  assert.ok(data.site.area<data.site.advertisedArea);
  assert.match(data.site.areaNote,/709\.29/);
  const sourceVertices=[...parcel136,...parcel135];
  for(const p of data.site.boundary.map(en))assert.ok(sourceVertices.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<1e-5),'Boundary vertex must come from the retrieved parcel geometry');
  const own=data.site.house;
  assert.equal(own.officialId,'ID-2261-26BC7442-F05E-FAF6-E053-CA2BA8C0FAE4');
  // Independent ground-ring anchor from 2261_N-34-50-c-a-4-4.gml.
  assert.ok(own.footprint.map(en).some(p=>Math.hypot(p[0]-473931.93,p[1]-728776.90)<1e-5));
  near(own.baseZ,1.85);near(own.roofZ,11.43);
  assert.ok(own.footprint.every(p=>pointInPolygon(p,data.site.boundary)));
  assert.equal(data.terrain.elevations.length,data.terrain.rows*data.terrain.columns);
  assert.ok(data.terrain.elevations.every(Number.isFinite));
  for(const [e,n] of data.site.boundary.map(en)){
    assert.ok(e>=data.terrain.originEN[0]&&e<=data.terrain.originEN[0]+(data.terrain.columns-1)*data.terrain.cellSize);
    assert.ok(n>=data.terrain.originEN[1]&&n<=data.terrain.originEN[1]+(data.terrain.rows-1)*data.terrain.cellSize);
  }
});

test('release dataset contains actual LiDAR roof evidence rather than the interim median-roof draft',()=>{
  assert.doesNotMatch(data.roofEvidence||'',/INTERIM/i,'Do not publish the temporary median-roof data');
  for(const building of [data.site.house,...data.buildings.filter(b=>b.kind==='target')]){
    assert.ok(building.roofPoints.length>30,`${building.label}: measured roof samples required before release`);
    assert.ok(data.provenance.rawClass6PointCounts[building.officialId]>30,building.label);
    assert.ok(building.roofPoints.every(p=>p.length===3&&p.every(Number.isFinite)),building.label);
    assert.ok(building.roofTopZ>=building.roofZ,building.label);
  }
  for(const pattern of [/uldk\.gugik\.gov\.pl/,/Budynki3D\/LOD1\/2024/,/NumDaneWys\/NMT/,/DanePomiaroweLAZ/])
    assert.ok(data.sources.some(source=>pattern.test(source.url)),`Missing primary source ${pattern}`);
  const all=[data.site.house,...data.buildings];
  assert.equal(new Set(all.map(b=>b.officialId)).size,all.length,'Every physical building has one independent source identity');
  assert.ok(data.buildings.length>=20,'Neighbourhood context must be more than a selector placeholder');
  assert.ok(data.buildings.some(b=>isAcrossStreet(b,data)&&b.kind==='target'),'Actual street-facing neighbours must be available to inspect');
});

test('Nadmorska pool, coping, terrace, tub, stairs and furniture fit its concave boundary',()=>{
  const t=data.site.terrace,p=poolBounds(settings,data),f=gardenFurniture(data,settings);
  const coping={x:p.x-p.coping,y:p.y-p.coping,width:p.width+2*p.coping,length:p.length+2*p.coping};
  assertInside(coping,'Pool coping');
  assert.ok(closestFootprints(rectCorners(coping),data.site.house.footprint).distance>.5);
  for(const depth of [model.FIELDS.terraceDepth.min,settings.terraceDepth,model.FIELDS.terraceDepth.max]){
    const s={...settings,terraceDepth:depth,canopyDepth:depth},deck={...t,length:depth},tub=jacuzziBounds(s,data);
    const stairs=terraceStairs(t,depth,terraceGroundReference(s,data).drop,s,data),canopy=canopyBounds(s,data);
    assertInside(deck,`Terrace ${depth} m`);assertInside(stairs,`Stairs ${depth} m`);
    assertInside({x:tub.x0,y:tub.y0,width:tub.width,length:tub.length},'Jacuzzi');
    assert.ok(tub.x0-.015>=deck.x&&tub.x1+.015<=deck.x+deck.width&&tub.y0-.015>=deck.y&&tub.y1+.015<=deck.y+depth);
    assert.ok(!rectanglesOverlap(deck,coping));assert.ok(!rectanglesOverlap(stairs,coping));
    near(stairs.x,t.x+t.stairOffset);near(stairs.width,t.stairWidth);
    assert.ok(stairs.drop/stairs.count>0&&stairs.drop/stairs.count<=.18);
    near(canopy.x0,t.x);near(canopy.x1,t.x+t.width);
  }
  assertInside(f.dining,'Dining');
  for(const [x,y]of f.loungers)assertInside({x,y,width:.78,length:2},'Lounger');
  const defaultStairs=terraceStairs(t,settings.terraceDepth,terraceGroundReference(settings,data).drop,settings,data);
  assert.ok(!rectanglesOverlap(defaultStairs,f.dining));
  for(const [x,y]of f.loungers)assert.ok(!rectanglesOverlap(defaultStairs,{x,y,width:.78,length:2}));
  const levels=spaLevels(settings,data).pool;
  for(const p of rectCorners(coping))assert.ok(levels.copingTopZ>gardenGroundAt(...p,settings,data),'Pool coping clears measured grade at its corners');
});

test('living-room and upstairs outlooks use the intended garden and actual Nadmorska street facade',()=>{
  const sofa=observerForPreset('sofa',{...settings,eyeHeight:1.2},data),edge=data.site.house.rearEdge;
  const glazingHit=segmentIntersection([sofa.x,sofa.y],[sofa.x,sofa.y+30],...edge);
  assert.ok(glazingHit&&glazingHit.u>.05&&glazingHit.u<.95,'Main sofa ray passes through proposed garden glazing');
  for(const preset of ['sofa','standing','terrace','jacuzzi','garden','front','custom']){
    const eye=observerForPreset(preset,settings,data);
    assert.ok([eye.x,eye.y,eye.z,eye.groundZ].every(Number.isFinite),preset);
    assert.ok(pointInPolygon([eye.x,eye.y],data.site.boundary),preset);
    if(['sofa','standing'].includes(preset))assert.ok(pointInPolygon([eye.x,eye.y],data.site.house.footprint));
  }
  for(const item of UPPER_FLOOR_PRESETS){
    const preset=upperFloorPreset(item.id,data),eye=observerForPreset(preset.id,{...settings,eyeHeight:preset.eyeHeight},data);
    assert.equal(pointInPolygon([eye.x,eye.y],data.site.house.footprint),false);
    assert.equal(pointInPolygon([eye.x,eye.y],data.site.boundary),true);
    near(eye.z-eye.groundZ,preset.eyeHeight);
    near(eye.groundZ,floorElevation(settings,data)+(preset.level==='first'?settings.firstFloorRise:settings.atticRise));
    const direction=gazeDirection(eye.defaultLookYaw,eye.defaultLookPitch);
    const target=[eye.x+direction[0]*30,eye.y+direction[1]*30,eye.z+direction[2]*30];
    assert.equal(buildingIntersection(eye,target,data.site.house),null,preset.id);
    const bearingVector=[0,1].map(i=>direction[0]*data.coordinates.xUnitEN[i]+direction[1]*data.coordinates.yUnitEN[i]);
    assert.ok(bearingVector[1]>0,'Both garden and street face toward the northern half of the compass');
    assert.equal(Math.sign(bearingVector[0]),preset.facing==='street'?1:-1,'Street faces NE; garden faces NW');
    if(preset.facing==='street'){
      near(eye.defaultLookYaw,90);near(eye.x,eye.facadePosition.x-.25);near(eye.y,eye.facadePosition.y);
    }
    const raised=observerForPreset(preset.id,{...settings,eyeHeight:preset.eyeHeight,gardenRaise:1,bedRaise:1},data);
    near(raised.z,eye.z);
  }
  const ux=data.coordinates.xUnitEN,uy=data.coordinates.yUnitEN;
  near(Math.hypot(...ux),1);near(Math.hypot(...uy),1);near(ux[0]*uy[1]-ux[1]*uy[0],-1);
  assert.ok(profile.rearBearing>300&&profile.rearBearing<306);
});

test('full perimeter follows the cadastral notch while real access gaps receive no screening credit',()=>{
  const segments=hedgeSegments(settings,data),openings=boundaryAccessLayout(settings,data);
  assert.deepEqual(new Set(segments.map(s=>s.side)),new Set(['rear','left','right','front']));
  for(const segment of segments)for(let i=0;i<=10;i++){
    const p=segment.a.map((v,j)=>v+(segment.b[j]-v)*i/10);
    assert.ok(pointInPolygon(p,data.site.boundary),'Inset hedge must stay inside the concave parcel');
  }
  assert.equal(openings.length,2);
  near(openings.find(g=>g.id==='entry-pedestrian').width,1.2);
  near(openings.find(g=>g.id==='entry-vehicle').width,4);
  for(const gap of openings){
    const mid=gap.a.map((v,i)=>(v+gap.b[i])/2),dy=gap.b[1]-gap.a[1],dx=gap.b[0]-gap.a[0],len=Math.hypot(dx,dy);
    const normal=[-dy/len,dx/len],z=terrainAt(...mid,data)+1.5;
    const a=[mid[0]+normal[0],mid[1]+normal[1],z],b=[mid[0]-normal[0],mid[1]-normal[1],z];
    assert.equal(screenOnRay(a,b,settings,data,segments),null,gap.id);
  }
  const changed=hedgeSegments({...settings,gardenRaise:.8,bedRaise:.4},data);
  for(let i=0;i<segments.length;i++)if(segments[i].side==='front'||segments[i].groundZone==='front'){
    near(changed[i].baseA,segments[i].baseA);near(changed[i].baseB,segments[i].baseB);
  }
});

test('Nadmorska dimensions and plan render its own measured extents and street-side access',()=>{
  const dimensions=gardenDimensions(settings,data),byId=new Map(dimensions.map(r=>[r.id,r]));
  for(const [id,value] of [['pool-width',3],['pool-length',7],['terrace-width',10],['entry-pedestrian',1.2],['entry-vehicle',4]])near(byId.get(id).value,value);
  near(byId.get('plot-area').value,independentArea(parcel136)+independentArea(parcel135),1e-5);
  for(const record of dimensions){
    assert.ok(Number.isFinite(record.value)&&record.value>=0,record.id);
    for(const key of ['a','b','lineA','lineB','anchor'])assert.ok(record[key].every(Number.isFinite),record.id+'.'+key);
  }
  const eye=observerForPreset('garden',settings,data),container=frame('garden');
  renderPlan(container,data,settings,eye,{rays:[]});
  assert.match(container.innerHTML,/Nadmorska 17/);
  assert.doesNotMatch(container.innerHTML,/NaN|undefined|STERNICZA|PCK3|Korzeniowskiego/);
  for(const scope of ['garden','context']){
    const f=planLayout(scope,data,frame(scope)),sunBounds=sunMapBounds(scope,data);
    const points=scope==='context'?[...data.site.boundary,...nearbyDimensionBuildings(data).flatMap(b=>b.footprint)]:data.site.boundary;
    for(const p of points)for(const b of [f.bounds,sunBounds])assert.ok(p[0]>=b.minX&&p[0]<=b.maxX&&p[1]>=b.minY&&p[1]<=b.maxY);
  }
});

test('solar, visibility and shade computations use Nadmorska coordinates and real surrounding volumes',()=>{
  const daytime={...settings,sunDate:'2026-06-21',sunMinutes:720},sun=sunForSettings(daytime,data);
  near(sun.latitude,data.coordinates.latitude);near(sun.longitude,data.coordinates.longitude);
  const rear=localSunDirection(profile.rearBearing,0,data);near(rear[0],0);near(rear[1],1);
  const shade=analyzeSunlight(daytime,data,sun),geometry=prepareSunGeometry(daytime,data);
  assert.equal(shade.status,'daylight');assert.ok(shade.cells.length>100);
  for(const cell of geometry.cells){
    assert.ok([cell.x,cell.y,cell.z].every(Number.isFinite));
    assert.ok(pointInPolygon([cell.x,cell.y],data.site.boundary));
    assert.equal(pointInPolygon([cell.x,cell.y],data.site.house.footprint),false);
  }
  for(const name of ['garden','terrace','jacuzzi','pool','front']){
    assert.ok(shade.zones[name].total>0,name);
    assert.ok(Number.isFinite(shade.zones[name].percent)&&shade.zones[name].percent>=0&&shade.zones[name].percent<=100,name);
  }
  const analysis=analyzeVisibility(observerForPreset('garden',settings,data),settings,data);
  assert.equal(analysis.byBlock.length,data.buildings.filter(b=>b.kind==='target').length);
  assert.ok(analysis.total>100);assert.ok(analysis.byBlock.every(block=>block.total>0));
  const container=frame('garden');renderSunMap(container,data,daytime,sun,shade);
  assert.doesNotMatch(container.innerHTML,/NaN|undefined|STERNICZA|PCK3/);
});

test('night fixtures and neighbouring-window scenarios work on the new property without moving geometry',()=>{
  const before=JSON.stringify(data),nightSettings={...settings,sunDate:'2026-12-21',sunMinutes:1410};
  const sun=sunForSettings(nightSettings,data),night=nightLightingState(sun,nightSettings);
  assert.ok(sun.elevation<-6);assert.equal(night.activation,1);
  const lighting=createGardenNightLighting(settings,data);
  try{
    assert.ok(lighting.lightCount>=4&&lighting.lightCount<=19);
    for(const fixture of lighting.fixtures){
      assert.ok([fixture.x,fixture.y,fixture.z].every(Number.isFinite));
      assert.ok(pointInPolygon([fixture.x,fixture.y],data.site.boundary),fixture.kind);
    }
    lighting.apply(night);
    const lights=[];lighting.group.traverse(o=>{if(o.isLight)lights.push(o);});
    assert.ok(lights.every(l=>l.visible&&l.intensity>0&&Number.isFinite(l.intensity)));
    lighting.apply(0);assert.ok(lights.every(l=>!l.visible&&l.intensity===0));
  }finally{lighting.dispose();}
  const across=data.buildings.filter(b=>isAcrossStreet(b,data));
  const panes=across.flatMap(building=>contextFacadePlacements(building,data.site.rearMidpoint,160));
  assert.ok(panes.length>10);
  const lit=panes.filter(p=>isWindowLit(p,.35));assert.ok(lit.length>0&&lit.length<panes.length);
  assert.equal(JSON.stringify(data),before,'Lighting scenarios must not mutate mapped buildings or garden geometry');
});

test('default budget covers the new pool and jacuzzi, terrace and perimeter with no unrequested fill',()=>{
  const cost=estimateCosts(settings,data);
  assert.equal(cost.spa.enabled,true);assert.equal(cost.garden.enabled,true);
  assert.deepEqual(cost.spa.rows.map(row=>row.key).sort(),['costSpaJacuzzi','costSpaPool']);
  assert.ok(cost.spa.rows.every(row=>row.priceStatus==='planning-allowance'&&row.quoted===false));
  assert.equal(cost.earthworks.gardenVolume,0);assert.equal(cost.earthworks.looseVolume,0);
  assert.ok(cost.hedges.sides.every(side=>side.length>0&&side.count>0));
  assert.ok(cost.garden.rows.some(row=>row.key==='costGardenTerrace'));
  assert.ok(Number.isFinite(cost.total.low)&&cost.total.low>0&&cost.total.high>cost.total.low);
  assert.equal(cost.garden.quantities.garageArea,0,'Integrated garage is not charged as detached demolition');
});
