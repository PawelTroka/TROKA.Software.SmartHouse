import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {visualNeighborRoof,filterNeighborRoofSamples,visualNeighborWallHeightAt,clipFacadeToVisualRoof} from '../src/observed-neighbor-roofs.js';
import {sampledRoofFaces} from '../src/shade.js';
import {observedFacadePlacements,neighborhoodAppearanceLayout} from '../src/neighborhood-appearance.js';

const data=JSON.parse(fs.readFileSync(new URL('../data/site-data.json',import.meta.url)));
data.neighborRoofObservations=JSON.parse(fs.readFileSync(new URL('../data/sternicza-neighbor-roofs.json',import.meta.url)));
const building=id=>data.buildings.find(b=>b.id===id);
const area=ring=>Math.abs(ring.reduce((sum,a,i)=>{const b=ring[(i+1)%ring.length];return sum+a[0]*b[1]-a[1]*b[0];},0))/2;
const vertexKey=p=>p.map(v=>v.toFixed(6)).join(',');
const edgeKey=(a,b)=>[vertexKey(a),vertexKey(b)].sort().join('|');

test('roof observations require matching official building identity and sufficient finite data',()=>{
  const source=building('building-2');
  assert.equal(visualNeighborRoof({...source,officialId:'other-site-building'},data),null);
  assert.equal(visualNeighborRoof(source,{}),null);
  assert.equal(visualNeighborRoof(source,{neighborRoofObservations:{buildings:[{officialId:source.officialId,roofPoints:[[1,2,NaN]]}]}}),null);
  assert.equal(visualNeighborRoof(building('building-9'),data),null,'Existing detailed PCK roofs are not replaced by a generic extract');
});

test('all nine optional neighbor roofs close exactly against their own wall and concave footprint',()=>{
  const original=JSON.stringify(data.buildings);
  for(const record of data.neighborRoofObservations.buildings){
    const source=building(record.buildingId),roof=visualNeighborRoof(source,data);
    assert.ok(roof.roofPoints.length>=12&&roof.roofPoints.length<=150);
    assert.equal(roof.acquired,'2024-10-01');
    assert.equal(roof.officialId,source.officialId);
    assert.ok(roof.wallTopZ>source.baseZ);
    const faces=sampledRoofFaces(source.footprint,roof.roofPoints,roof.edgeZ,roof.edgePoints);
    assert.ok(Math.abs(faces.reduce((sum,face)=>sum+area(face),0)-area(source.footprint))<1e-6,
      `${source.id}: all roof triangles must cover exactly the mapped footprint, including notches`);
    const edges=new Map();
    for(const face of faces)for(let i=0;i<3;i++){const key=edgeKey(face[i],face[(i+1)%3]);edges.set(key,(edges.get(key)||0)+1);}
    for(let i=0;i<roof.edgePoints.length;i++){
      const p=roof.edgePoints[i],q=roof.edgePoints[(i+1)%roof.edgePoints.length];
      assert.equal(edges.get(edgeKey(p,q)),1,`${source.id}: wall/roof boundary shares identical vertices`);
      assert.ok(roof.wallFaces.some(face=>face.some(v=>vertexKey(v)===vertexKey(p))));
    }
  }
  assert.equal(JSON.stringify(data.buildings),original,'Measured source bodies and all analytical samples remain byte-identical');
});

test('isolated tall returns do not create invented antennas, while supported lower wings and gables remain',()=>{
  const flat=building('building-6'),flatRoof=visualNeighborRoof(flat,data);
  assert.ok(flatRoof.excludedCount>0);
  assert.ok(flatRoof.maxZ<12,'The isolated 16.76 m return is not interpreted as a roof peak');
  assert.ok(flatRoof.minZ<8,'The supported lower roof wing is preserved');
  const pitched=visualNeighborRoof(building('building-4'),data);
  assert.ok(pitched.maxZ>16,'Supported measured high roof planes remain');
  assert.ok(pitched.wallTopZ<6,'The lower extension is not raised to the whole-building median');
  assert.ok(pitched.edges.some(edge=>Math.max(...edge.points.map(p=>p[2]))-Math.min(...edge.points.map(p=>p[2]))>2));
  const points=Array.from({length:25},(_,i)=>[i%5,Math.floor(i/5),10]);
  points.push([2.2,2.2,25],[1,1,NaN]);
  assert.equal(filterNeighborRoofSamples(points,2).points.length,25);
});

test('rendering-only roof reconstruction follows translated and scaled body variants',()=>{
  const source=building('building-8'),dx=6,dy=-7,scaleZ=1.3;
  const shifted={...source,footprint:source.footprint.map(([x,y])=>[x+dx,y+dy]),
    roofZ:source.baseZ+(source.roofZ-source.baseZ)*scaleZ,adjustment:{dx,dy,scaleZ}};
  const before=visualNeighborRoof(source,data),after=visualNeighborRoof(shifted,data);
  assert.equal(before.sampleCount,after.sampleCount,'Height changes cannot reclassify source roof returns');
  for(let i=0;i<before.roofPoints.length;i++){
    assert.ok(Math.abs(after.roofPoints[i][0]-before.roofPoints[i][0]-dx)<1e-8);
    assert.ok(Math.abs(after.roofPoints[i][1]-before.roofPoints[i][1]-dy)<1e-8);
    assert.ok(Math.abs(after.roofPoints[i][2]-source.baseZ-(before.roofPoints[i][2]-source.baseZ)*scaleZ)<1e-8);
  }
});

test('windows and finish overlays cannot protrude through measured lower roof wings',()=>{
  const source=building('building-5'),roof=visualNeighborRoof(source,data);
  const original=observedFacadePlacements(source,data.site.rearMidpoint),clipped=clipFacadeToVisualRoof(original,roof);
  assert.ok(clipped.length<original.length);
  assert.ok(clipped.length>0);
  for(const pane of clipped)for(const u of [-.5,0,.5]){
    assert.ok(pane.z+pane.height/2+.08<visualNeighborWallHeightAt(roof,pane.x+pane.ny*pane.width*u,pane.y-pane.nx*pane.width*u));
  }
  const finishes=neighborhoodAppearanceLayout([source],data);
  assert.equal(finishes.parapets.length,0,'No uniform old LoD1 roof coping floats through the new roof');
  assert.ok(finishes.panels.every(panel=>panel.height<=.38),'The actual wall mesh supplies colour; only the low plinth overlay remains');
});
