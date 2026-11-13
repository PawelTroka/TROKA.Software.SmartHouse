import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {footprintCentroid} from '../src/buildings.js';
import {pointInPolygon,observerForPreset} from '../src/geometry.js';
import {analyzeFacadeVisibility} from '../src/facade-visibility.js';
import {DEFAULTS} from '../src/state.js';

const data=JSON.parse(fs.readFileSync(new URL('../data/site-data.json',import.meta.url)));
const source=JSON.parse(fs.readFileSync(new URL('../data/sternicza-neighborhood-source.json',import.meta.url)));
const meta=data.neighborhood;
const oldIds=new Set(meta.originalBuildingIds),newIds=new Set(meta.addedBuildingIds);
const added=data.buildings.filter(b=>newIds.has(b.id));
const rawById=new Map(source.buildings.map(b=>[b.officialId,b]));
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const near=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} should equal ${b} within ${tolerance}`);
const {localOriginEN:origin,xUnitEN:ux,yUnitEN:uy}=data.coordinates;
const local=([e,n])=>[(e-origin[0])*ux[0]+(n-origin[1])*ux[1],(e-origin[0])*uy[0]+(n-origin[1])*uy[1]];
const native=([x,y])=>[origin[0]+x*ux[0]+y*uy[0],origin[1]+x*ux[1]+y*uy[1]];

test('neighbourhood expansion preserves all original buildings and property evidence exactly',()=>{
  assert.equal(digest(data.buildings.filter(b=>oldIds.has(b.id))),'50b2ef83cf7f4d632b763bf536eb0cf26e1e638b18869edff7a01afc9b411bfc');
  assert.equal(digest(data.site),'5824455d7f3c4e6beafa34dccf08c1ae78bea0a97315e04d918b2eb8253f96e9');
  assert.equal(digest(data.coordinates),'22b2f1d73931ab1f9fa16a8c3482a9928d8b317145c6a9fba46d7efe6cb54c81');
  assert.equal(digest(data.terrain),'b5ae3337ac9cd8c2b6a4b775c3f81703ceb6ed7035b98a68d2848b9acd085da5');
  assert.equal(digest(data.benchmark),'83d537aaec17a99974e067e20739246ebf21fdeaa19b9a718f6a785075cd620c');
  assert.equal(data.buildings.filter(b=>b.kind==='target').length,5);
});

test('every added footprint and elevation reconstructs from the retained official CityGML extract',()=>{
  assert.equal(added.length,124);
  for(const b of added){
    const raw=rawById.get(b.officialId);
    assert.ok(raw,`Missing official source for ${b.id}`);
    assert.equal(b.footprint.length,raw.footprintEN.length);
    raw.footprintEN.forEach((p,i)=>local(p).forEach((v,axis)=>near(b.footprint[i][axis],v,6e-9)));
    near(b.baseZ,raw.baseZ);
    near(b.roofZ,raw.baseZ+raw.measuredHeight);
    near(b.roofTopZ,b.roofZ);
    assert.equal(b.sourceDetails.sourceMeasuredHeightM,raw.measuredHeight);
    assert.equal(b.sourceDetails.geometryVersion,raw.attributes.wersjaId);
    assert.equal(b.sourceDetails.roofSourceYear,raw.attributes.aktZrodla);
    assert.equal(b.sourceDetails.heightMethod,'ALS building-class median');
    assert.equal(raw.interiorRingCount,0);
    assert.deepEqual(b.footprint[0],b.footprint.at(-1));
  }
});

test('the complete source selection has unique identities and covers all four viewing directions',()=>{
  const existing=new Set([...data.buildings,data.site.house,data.site.garage].filter(Boolean).map(b=>b.officialId));
  assert.equal(existing.size,data.buildings.length+2);
  assert.equal(new Set(data.buildings.map(b=>b.id)).size,data.buildings.length);
  assert.equal(new Set(data.buildings.map(b=>b.index)).size,data.buildings.length);
  assert.ok(source.buildings.every(b=>existing.has(b.officialId)),'No selected source building is silently omitted');
  assert.equal(source.buildings.length,144);
  assert.equal(meta.originalBuildingCount,18);
  assert.equal(meta.totalBuildingCount,142);
  assert.equal(meta.addedBuildingCount,124);
  const centres=data.buildings.map(b=>footprintCentroid(b.footprint));
  assert.equal(centres.filter(p=>p[1]<0).length,85);
  assert.equal(meta.acrossStreetCount,85);
  for(const direction of ['front','rear','east','west'])assert.ok(added.some(b=>b.context.direction===direction));
  assert.ok(centres.some(p=>p[0]<-100)&&centres.some(p=>p[0]>100));
  assert.ok(centres.some(p=>p[1]<-100)&&centres.some(p=>p[1]>100));
});

test('every addition touches the specified radius and context bounds contain complete footprints',()=>{
  const centre=meta.referenceXY,bounds=meta.bounds;
  const segmentDistance=(p,a,b)=>{
    const dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy;
    const t=length2?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length2)):0;
    return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
  };
  for(const b of added){
    const d=pointInPolygon(centre,b.footprint)?0:Math.min(...b.footprint.slice(1).map((p,i)=>segmentDistance(centre,b.footprint[i],p)));
    assert.ok(d<=200+1e-7,`${b.id} lies outside the selected radius`);
    near(d,b.context.nearestFootprintDistanceM,.00051);
    for(const[x,y]of b.footprint)assert.ok(x>=bounds.minX&&x<=bounds.maxX&&y>=bounds.minY&&y<=bounds.maxY);
  }
  near(meta.radiusM,200);
  native(centre).forEach((v,i)=>near(v,meta.referenceEN[i]));
});

test('new buildings are bounded context blockers with explicit median-height evidence',()=>{
  for(const b of added){
    assert.equal(b.kind,'context');
    assert.deepEqual(b.samples,[]);
    assert.deepEqual(b.roofPoints,[]);
    assert.deepEqual(b.highFeatures,[]);
    assert.equal(b.roofSampleCount,0);
    assert.match(b.source,/median roof/);
    assert.ok(b.roofZ>b.baseZ);
    assert.ok(b.context.centroidDistanceM>0);
  }
  for(const id of ['building-5','building-6','building-7']){
    assert.match(meta.labelsById[id],/^Across Sternicza/);
    assert.equal(meta.originalContextById[id].streetSide,'across-street');
  }
  assert.match(meta.labelMethod,/not verified postal addresses/);
  assert.match(meta.heightMethod,/not represent surveyed roof ridges/);
  assert.equal(meta.sourceArchiveSha256,source.archiveSha256);
  assert.equal(meta.sourceTileSha256,source.tileSha256);
  assert.match(source.archiveSha256,/^[a-f0-9]{64}$/);
});

test('separate context terrain covers surrounding bodies without replacing analytical terrain',()=>{
  const t=data.contextTerrain;
  assert.equal(t.purpose,'rendering-only');
  assert.equal(t.cellSize,4);
  assert.equal(t.columns,107);assert.equal(t.rows,111);
  assert.equal(t.elevations.length,t.columns*t.rows);
  assert.ok(t.elevations.every(Number.isFinite));
  assert.equal(t.rowOrder,'north-increasing');
  assert.ok(t.elevations.every(z=>z>=1&&z<=5));
  for(const b of data.buildings)for(const p of b.footprint){
    const [e,n]=native(p);
    assert.ok(e>=t.originEN[0]&&e<=t.originEN[0]+(t.columns-1)*t.cellSize);
    assert.ok(n>=t.originEN[1]&&n<=t.originEN[1]+(t.rows-1)*t.cellSize);
  }
  assert.equal(data.terrain.cellSize,1);
  assert.equal(source.contextTerrainSource.renderedCellSizeM,4);
  assert.equal(source.contextTerrainSource.nativeCellSizeM,1);
});

test('expanded context leaves the independently audited PCK3 facade result unchanged',()=>{
  const settings={...DEFAULTS,gardenProgram:'spa-aligned',screeningTrees:[[17,26.8],[14.4,28.4],[12.6,32.7]].map(([x,y],i)=>({
    id:`pine-${i+1}`,typeId:'austrian-pine-tall',x,y,height:9.5,crownBase:2.5,crownWidth:5,crownDepth:5,
    rotation:0,enabled:true,unitPrice:0}))};
  const eye=observerForPreset('sofa',settings,data),result=analyzeFacadeVisibility(eye,'building-9',settings,data);
  assert.equal(result.visible,49);assert.equal(result.total,5214);
});

test('a new across-street body can be checked without adding it to the permanent target set',()=>{
  const target=added.find(b=>b.context.streetSide==='across-street');
  const eye=observerForPreset('front',{...DEFAULTS,eyeHeight:undefined},data);
  const result=analyzeFacadeVisibility(eye,target.id,DEFAULTS,data,{spacing:1});
  assert.equal(result.status,'ok');assert.ok(result.total>0);
  assert.ok(result.rays.every(ray=>ray.blockId===target.id));
  assert.equal(data.buildings.find(b=>b.id===target.id).kind,'context');
  assert.equal(data.buildings.filter(b=>b.kind==='target').length,5);
});
