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
    const faces=roof.roofFaces||sampledRoofFaces(source.footprint,roof.roofPoints,roof.edgeZ,roof.edgePoints);
    assert.ok(Math.abs(faces.reduce((sum,face)=>sum+area(face),0)-area(source.footprint))<1e-6,
      `${source.id}: all roof triangles must cover exactly the mapped footprint, including notches`);
    const edges=new Map();
    for(const face of faces)for(let i=0;i<3;i++){const key=edgeKey(face[i],face[(i+1)%3]);edges.set(key,(edges.get(key)||0)+1);}
    const boundaries=roof.patches?roof.patches.map(patch=>patch.edgePoints):[roof.edgePoints];
    for(const boundary of boundaries)for(let i=0;i<boundary.length;i++){
      const p=boundary[i],q=boundary[(i+1)%boundary.length];
      assert.equal(edges.get(edgeKey(p,q)),1,`${source.id}: wall/roof boundary shares identical vertices`);
      assert.ok(roof.wallFaces.some(face=>face.some(v=>vertexKey(v)===vertexKey(p))));
    }
  }
  assert.equal(JSON.stringify(data.buildings),original,'Measured source bodies and all analytical samples remain byte-identical');
});

test('4h keeps two measured lower roofs separate from the main roof with vertical facade steps',()=>{
  const source=building('building-4'),before=structuredClone(source),roof=visualNeighborRoof(source,data);
  assert.deepEqual(roof.patches.map(patch=>patch.id),['west-lower','front-lower','main']);
  assert.equal(roof.steps.length,2);
  assert.deepEqual(roof.nativeSplitEvidence.westBracket,[-14.527,-14.395]);
  assert.deepEqual(roof.nativeSplitEvidence.frontBracket,[28.324,29.054]);
  const {westStepX,frontStepY}=roof.splitEvidence;
  for(const face of roof.roofFaces){
    for(const [axis,split] of [[0,westStepX],[1,frontStepY]]){
      const signed=face.map(p=>p[axis]-split);
      assert.ok(!(Math.min(...signed)<-1e-6&&Math.max(...signed)>1e-6),
        'No dark roof triangle may bridge a measured low-to-high roof step');
    }
  }
  for(const step of roof.steps){
    assert.equal(step.higherPatch,'main');
    for(let i=0;i<step.upper.length;i++){
      assert.ok(Math.hypot(step.upper[i][0]-step.lower[i][0],step.upper[i][1]-step.lower[i][1])<1e-8);
      assert.ok(step.upper[i][2]-step.lower[i][2]>1,'Supported building-height change remains a vertical wall');
    }
    assert.ok(step.faces.every(face=>area(face)<1e-10),'Step faces have zero projected roof area');
    assert.ok(step.faces.every(face=>roof.wallFaces.includes(face)||roof.wallFaces.some(wall=>JSON.stringify(wall)===JSON.stringify(face))));
  }
  for(const patch of roof.patches){
    assert.ok(Math.abs(patch.roofFaces.reduce((sum,face)=>sum+area(face),0)-area(patch.ring))<1e-6);
    if(patch.nativePlane){assert.ok(patch.nativePlane.rmse<.15);assert.ok(patch.nativePlane.maxResidual<.3);}
  }
  assert.deepEqual(source,before,'Patch reconstruction does not change the measured analytical body');
});

test('4h stepped roof and walls share every non-ground edge without T-junctions',()=>{
  const source=building('building-4'),roof=visualNeighborRoof(source,data),edges=new Map();
  for(const face of [...roof.roofFaces,...roof.wallFaces])for(let i=0;i<3;i++){
    const a=face[i],b=face[(i+1)%3],key=edgeKey(a,b);
    if(!edges.has(key))edges.set(key,{a,b,count:0});edges.get(key).count++;
  }
  for(const {a,b,count} of edges.values()){
    const onGround=Math.abs(a[2]-source.baseZ)<1e-8&&Math.abs(b[2]-source.baseZ)<1e-8;
    assert.equal(count,onGround?1:2,'Only the intentionally open base perimeter may have an unmatched edge');
  }
});

test('4h retains supported lower-extension and ridge returns and the measured rear-east eave',()=>{
  const roof=visualNeighborRoof(building('building-4'),data);
  const retained=p=>roof.roofPoints.some(q=>q.every((v,i)=>Math.abs(v-p[i])<1e-8));
  assert.ok(retained([-14.527,36.497,8.92]),'The coherent west plane supports this previously rejected low return');
  assert.ok(retained([0.133,40.072,10.52]),'The measured footprint-corner eave is retained instead of extending a higher gable');
  assert.ok(retained([0.202,34.974,16.28]),'Measured upper roof/gable height is not flattened');
  assert.ok(retained([-5.378,27.104,5.49]),'The low front extension remains');
  assert.equal(roof.sampleCount,148);
  assert.equal(roof.excludedCount,1,'The unsupported interior low return remains filtered');
  assert.ok(Math.abs(roof.maxZ-16.28)<1e-8);
  assert.ok(visualNeighborWallHeightAt(roof,.47359613,40.07698363)<10.6,
    'The east-rear seam follows its 10.52 m eave, not the earlier invented 12.7 m tail');
});

test('4h roof-patch classification and wall steps are invariant under supported building transforms',()=>{
  const source=building('building-4'),dx=6,dy=-7,scaleZ=1.3;
  const adjusted={...source,footprint:source.footprint.map(([x,y])=>[x+dx,y+dy]),
    roofZ:source.baseZ+(source.roofZ-source.baseZ)*scaleZ,adjustment:{dx,dy,scaleZ}};
  const before=visualNeighborRoof(source,data),after=visualNeighborRoof(adjusted,data);
  assert.equal(after.patches.length,3);assert.equal(after.steps.length,2);
  assert.equal(after.sampleCount,before.sampleCount);
  for(const kind of ['roofPoints','edgePoints']){
    assert.equal(after[kind].length,before[kind].length);
    for(let i=0;i<before[kind].length;i++){
      const a=before[kind][i],b=after[kind][i];
      assert.ok(Math.abs(b[0]-a[0]-dx)<1e-8);
      assert.ok(Math.abs(b[1]-a[1]-dy)<1e-8);
      assert.ok(Math.abs(b[2]-source.baseZ-(a[2]-source.baseZ)*scaleZ)<1e-8);
    }
  }
  assert.equal(after.roofFaces.length,before.roofFaces.length);
  assert.equal(after.stepFaces.length,before.stepFaces.length);
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
