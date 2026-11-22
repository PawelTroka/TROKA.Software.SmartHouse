import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {neighborhoodAppearanceData,observedBuildingAppearance,observedFacadePlacements,neighborhoodAppearanceLayout} from '../src/neighborhood-appearance.js';
import {createNeighborhoodAppearanceGroup} from '../src/scene-neighborhood-appearance.js';
import {pointInPolygon} from '../src/geometry.js';

const data=JSON.parse(fs.readFileSync(new URL('../data/site-data.json',import.meta.url)));
const building=id=>data.buildings.find(b=>b.id===id),origin=data.site.rearMidpoint;
const positions=panes=>panes.map(p=>[p.x,p.y,p.z,p.width,p.height,Boolean(p.balcony)].map(v=>typeof v==='number'?Math.round(v*1e6)/1e6:v).join(',')).sort();

test('observation source and generated browser data stay identical and record image uncertainty',()=>{
  const source=JSON.parse(fs.readFileSync(new URL('../data/sternicza-appearance-observations.json',import.meta.url)));
  assert.deepEqual(neighborhoodAppearanceData,source);
  assert.equal(source.profiles.length,12);
  assert.equal(source.sources.length,6);
  for(const reference of source.sources){
    assert.match(reference.sha256,/^[0-9a-f]{64}$/);
    assert.equal(reference.acquisitionDate,null,'A screenshot supply date is not its aerial acquisition date');
  }
  for(const profile of source.profiles){
    assert.equal(profile.officialId,building(profile.buildingId).officialId);
    assert.equal(profile.confidence,'visual estimate');
    assert.match(profile.windowLayoutConfidence,/not surveyed/);
  }
  assert.equal(new Set(source.profiles.map(profile=>profile.officialId)).size,source.profiles.length);
});

test('Sternicza observation profiles cannot leak into another site with the same local building IDs',()=>{
  const pck=building('building-9');
  assert.equal(observedBuildingAppearance({...pck,officialId:'different-official-id'}),null);
  assert.equal(observedFacadePlacements({...pck,officialId:'different-official-id'},origin),null);
  assert.equal(neighborhoodAppearanceLayout([{...pck,officialId:'different-official-id'}],data).profiles.length,0);
});

test('three observed PCK blocks use six opening levels, measured wall alignment and distinct palettes',()=>{
  const colors=new Set();
  for(const id of ['building-9','building-15','building-29']){
    const source=building(id),before=structuredClone(source),profile=observedBuildingAppearance(source);
    const panes=observedFacadePlacements(source,origin);
    assert.equal(new Set(panes.map(p=>p.floor)).size,6);
    assert.ok(panes.some(p=>p.balcony));
    colors.add(profile.facadeColor);
    for(const pane of panes){
      assert.ok(pane.z-pane.height/2>source.baseZ);
      assert.ok(pane.z+pane.height/2<source.roofZ);
      assert.equal(pointInPolygon([pane.x+pane.nx*.1,pane.y+pane.ny*.1],source.footprint),false);
      if(pane.balcony)assert.ok(Math.abs(pane.z-pane.height/2-pane.balconyFloorZ-.1)<1e-8,'Balcony doors reach the actual floor rather than floating above it');
    }
    assert.deepEqual(source,before,'Visual evidence never rewrites the original mass or samples');
  }
  assert.equal(colors.size,3);
});

test('reversing a mapped footprint does not mirror asymmetric observed balcony patterns',()=>{
  for(const id of ['building-9','building-15','building-29','building-5']){
    const source=building(id);
    assert.deepEqual(positions(observedFacadePlacements(source,origin)),
      positions(observedFacadePlacements({...source,footprint:[...source.footprint].reverse()},origin)));
  }
});

test('observed openings follow shifted and vertically scaled measured bodies',()=>{
  const source=building('building-9'),dx=12,dy=-4,scaleZ=1.35;
  const adjusted={...source,footprint:source.footprint.map(([x,y])=>[x+dx,y+dy]),
    roofZ:source.baseZ+(source.roofZ-source.baseZ)*scaleZ,adjustment:{dx,dy,scaleZ}};
  const original=observedFacadePlacements(source,origin),moved=observedFacadePlacements(adjusted,[origin[0]+dx,origin[1]+dy]);
  assert.equal(moved.length,original.length);
  for(let i=0;i<moved.length;i++){
    assert.ok(Math.abs(moved[i].x-original[i].x-dx)<1e-8);
    assert.ok(Math.abs(moved[i].y-original[i].y-dy)<1e-8);
    assert.ok(Math.abs(moved[i].z-source.baseZ-(original[i].z-source.baseZ)*scaleZ)<1e-8);
  }
});

test('explicit blank facade evidence suppresses observed panes and balcony/entry details',()=>{
  const pck=building('building-9'),a=pck.footprint[2],b=pck.footprint[3];
  const observation={officialId:pck.officialId,windowlessEdges:[{a,b}]};
  const panes=observedFacadePlacements(pck,origin,160,observation);
  assert.ok(panes.length>0);
  assert.equal(panes.filter(p=>p.ny>.8).length,0);
  const layout=neighborhoodAppearanceLayout([pck],{...data,facadeOverrides:{[pck.id]:observation}});
  assert.equal(layout.doors.length,0);
  assert.equal(layout.balconies.filter(p=>p.ny>.8).length,0);
  const four=building('building-4');
  assert.equal(observedFacadePlacements(four,origin,160,data.facadeOverrides[four.id]),null,
    'The existing exact 4h blank-wall handling remains authoritative');
});

test('partially observed street houses retain explicit generic status on unseen elevations',()=>{
  const panes=observedFacadePlacements(building('building-2'),origin);
  assert.ok(panes.some(p=>p.appearanceEvidence==='user-reference-estimate'));
  assert.ok(panes.some(p=>p.appearanceEvidence==='illustrative'));
  assert.equal(observedFacadePlacements(building('building-9'),[1000,1000]).length,0);
});

test('appearance renderer bounds draw calls and supports the SVG fallback without instancing',()=>{
  const before=JSON.stringify(data.buildings);
  for(const svgMode of [false,true]){
    const group=createNeighborhoodAppearanceGroup(data.buildings,data,{origin,svgMode});
    assert.equal(group.userData.appearanceProfiles.length,12);
    assert.ok(group.children.length>=6&&group.children.length<=8,'One batch per finish type, not one draw call per balcony');
    group.traverse(object=>{
      if(!object.isMesh)return;
      assert.equal(object.isInstancedMesh===true,!svgMode);
      assert.equal(object.castShadow,false);
      const positions=object.geometry.getAttribute('position');
      for(let i=0;i<positions.array.length;i++)assert.ok(Number.isFinite(positions.array[i]));
    });
  }
  assert.equal(JSON.stringify(data.buildings),before);
});
