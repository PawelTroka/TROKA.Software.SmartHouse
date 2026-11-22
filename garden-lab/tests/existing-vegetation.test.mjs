import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {existingCanopyRecords,existingCanopyVolumes,existingFoliageActive} from '../src/existing-vegetation.js';
import {treeRayIntersection} from '../src/screening-trees.js';
import {pointInPolygon,observerForPreset,analyzeVisibility} from '../src/geometry.js';
import {prepareSunGeometry} from '../src/shade.js';
import {createStateModel} from '../src/state.js';
import {getSiteProfile} from '../src/sites.js';
import {estimateCosts} from '../src/costs.js';
import {createExistingVegetationGroup} from '../src/scene-existing-vegetation.js';

const read=name=>JSON.parse(readFileSync(new URL(`../data/${name}`,import.meta.url),'utf8'));
const site=read('site-data.json'),nature=read('sternicza-surrounding-nature.json');
const data={...site,existingVegetation:nature};
const model=createStateModel(getSiteProfile('sternicza-11',site));
const sample={site:{id:'sternicza-11'},existingVegetation:{siteId:'sternicza-11',canopies:[
  {id:'test',x:10,y:0,baseZ:2,crownBaseZ:8,topZ:14,radiusX:2,radiusY:4},
]}};

test('existing canopy extraction retains provenance and only mapped external centres',()=>{
  const records=existingCanopyRecords(data);
  assert.equal(records.length,nature.counts.canopyAggregates??nature.canopies.length);
  assert.ok(records.length>=450);
  assert.equal(new Set(records.map(record=>record.id)).size,records.length);
  for(const record of records){
    assert.equal(pointInPolygon([record.x,record.y],site.site.boundary),false,record.id);
    assert.ok(record.pointCount>0&&record.topZ>=record.crownBaseZ&&record.crownBaseZ>=record.baseZ);
    assert.ok(record.radiusX<=12&&record.radiusY<=12,'Crown aggregates remain bounded neighbourhood objects');
    assert.equal(record.species,null,'Unidentified LiDAR clusters must not acquire invented species');
  }
  const source=nature.sources.find(source=>source.id==='gugik-als-2024');
  assert.equal(source.tiles.length,4);
  assert.ok(source.tiles.every(tile=>/^[0-9a-f]{64}$/.test(tile.sha256)));
  assert.ok(nature.inventory,'Keep inventoried trees separate from grouped crowns');
});

test('canopy rays are finite, elevated, and report existing vegetation separately',()=>{
  const [volume]=existingCanopyVolumes({existingLeafMode:'summer'},sample);
  const hit=treeRayIntersection([0,0,11],[20,0,11],volume);
  assert.equal(hit.type,'existing-canopy');
  assert.ok(Math.abs(hit.x-8)<1e-6);
  assert.equal(treeRayIntersection([0,0,11],[7,0,11],volume),null,'Canopies beyond the target cannot screen it');
  assert.equal(treeRayIntersection([0,0,3],[20,0,3],volume),null,'Unmeasured reconstructed trunks get no screening credit');
  assert.equal(treeRayIntersection([0,5,11],[20,5,11],volume),null);
});

test('winter, visibility and analysis controls remove existing opaque crown credit',()=>{
  assert.equal(existingCanopyVolumes({existingVegetation:false},sample).length,0);
  assert.equal(existingCanopyVolumes({existingCanopyAnalysis:false},sample).length,0);
  const [winter]=existingCanopyVolumes({existingLeafMode:'winter'},sample);
  assert.equal(treeRayIntersection([0,0,11],[20,0,11],winter),null);
  assert.equal(existingFoliageActive({sunDate:'2026-12-21'}),false);
  assert.equal(existingFoliageActive({sunDate:'2026-06-21'}),true);
  assert.equal(existingFoliageActive({existingLeafMode:'winter'},{leafType:'evergreen'}),true);
  assert.equal(existingCanopyRecords({...sample,site:{id:'nadmorska-17'}}).length,0);
});

test('saved designs and shared links retain all existing-tree comparison controls',()=>{
  const input=model.sanitizeState({existingVegetation:false,existingCanopyAnalysis:false,existingLeafMode:'winter'});
  const result=model.decodeState(model.encodeState(input));
  for(const key of ['existingVegetation','existingCanopyAnalysis','existingLeafMode'])assert.equal(result[key],input[key]);
  assert.equal(model.sanitizeState({existingLeafMode:'invented'}).existingLeafMode,'auto');
});

test('turning existing trees off restores original privacy and shade geometry without charging for them',()=>{
  const settings={...model.DEFAULTS,existingVegetation:false};
  const observer=observerForPreset(settings.preset,settings,site);
  const original=analyzeVisibility(observer,settings,site),without=analyzeVisibility(observer,settings,data);
  assert.equal(original.visible,without.visible);
  assert.equal(original.total,without.total);
  assert.equal(prepareSunGeometry(settings,data).trees.length,prepareSunGeometry(settings,site).trees.length);
  assert.ok(prepareSunGeometry({...settings,existingVegetation:true},data).trees.length>=nature.canopies.length);
  assert.deepEqual(estimateCosts(settings,data),estimateCosts(settings,site));
});

test('rendered canopy vertices stay within measured extents and leaf-off has no foliage meshes',()=>{
  const group=createExistingVegetationGroup(sample,{existingLeafMode:'summer'},{origin:[0,0]});
  let crowns=0;
  group.traverse(mesh=>{
    if(!mesh.name.startsWith('existing-canopies-'))return;
    crowns++;
    const positions=mesh.geometry.attributes.position;
    for(let i=0;i<positions.count;i++)assert.ok(Math.hypot(positions.getX(i),positions.getY(i),positions.getZ(i))<=1.00001);
  });
  assert.ok(crowns>0);
  const winter=createExistingVegetationGroup(sample,{existingLeafMode:'winter'});
  assert.ok(winter.getObjectByName('reconstructed-existing-tree-branches'));
  assert.equal(winter.children.some(mesh=>mesh.name.startsWith('existing-canopies-')),false);
  for(const root of [group,winter]){const materials=new Set();root.traverse(object=>{object.geometry?.dispose();if(object.material)materials.add(object.material);});materials.forEach(material=>material.dispose());}
});
