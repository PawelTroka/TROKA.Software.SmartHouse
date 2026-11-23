import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {neighborhoodAppearanceData,observedBuildingAppearance,observedFacadePlacements,neighborhoodAppearanceLayout,appearanceFacadeEdges} from '../src/neighborhood-appearance.js';
import {createNeighborhoodAppearanceGroup} from '../src/scene-neighborhood-appearance.js';
import {pointInPolygon} from '../src/geometry.js';

const data=JSON.parse(fs.readFileSync(new URL('../data/site-data.json',import.meta.url)));
const building=id=>data.buildings.find(b=>b.id===id),origin=data.site.rearMidpoint;
const positions=panes=>panes.map(p=>[p.x,p.y,p.z,p.width,p.height,Boolean(p.balcony)].map(v=>typeof v==='number'?Math.round(v*1e6)/1e6:v).join(',')).sort();

test('observation source and generated browser data stay identical and record image uncertainty',()=>{
  const source=JSON.parse(fs.readFileSync(new URL('../data/sternicza-appearance-observations.json',import.meta.url)));
  assert.deepEqual(neighborhoodAppearanceData,source);
  assert.equal(source.profiles.length,12);
  assert.equal(source.sources.length,11);
  assert.equal(source.reviewed,'2026-11-23');
  assert.equal(source.sources.filter(reference=>reference.filename.startsWith('Screenshot 2026-11-22')).length,5);
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

test('three observed PCK blocks use five regular opening levels with separate basement slots',()=>{
  const colors=new Set();
  for(const id of ['building-9','building-15','building-29']){
    const source=building(id),before=structuredClone(source),profile=observedBuildingAppearance(source);
    const panes=observedFacadePlacements(source,origin);
    assert.equal(new Set(panes.filter(p=>!p.basement).map(p=>p.floor)).size,5);
    assert.equal(panes.filter(p=>p.basement).length,3);
    assert.ok(panes.filter(p=>p.basement).every(p=>p.floor===-1&&p.height<.6&&p.z-source.baseZ<1));
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

test('opposite PCK faces reproduce four principal columns and leave the street doorway clear',()=>{
  for(const id of ['building-9','building-15','building-29']){
    const source=building(id),panes=observedFacadePlacements(source,origin);
    const plotSide=panes.filter(p=>p.ny<-.8),streetSide=panes.filter(p=>p.ny>.8);
    assert.equal(plotSide.length,20,'Five rows by four columns are visible toward Sternicza');
    assert.equal(streetSide.length,19,'The street entrance replaces one opening in the lowest row');
    const front=appearanceFacadeEdges(source).find(edge=>edge.direction==='front');
    const north=front.nx*data.coordinates.xUnitEN[1]+front.ny*data.coordinates.yUnitEN[1];
    assert.ok(north>.95,'The four-column plot face points north in the actual map, not to a balcony side');
    for(let floor=0;floor<5;floor++){
      const row=plotSide.filter(p=>p.floor===floor).sort((a,b)=>a.column-b.column);
      assert.equal(row.length,4);
      assert.ok(row[1].width>row[0].width&&row[2].width>row[3].width,'Inner openings are wider than outer openings');
      assert.ok(row.every(p=>!p.balcony));
    }
    const layout=neighborhoodAppearanceLayout([source],data),door=layout.doors[0];
    assert.equal(layout.doors.length,1);
    assert.ok(door.ny>.8,'Entrance belongs to the PCK street elevation');
    for(const pane of streetSide){
      const along=Math.abs((pane.x-door.x)*door.ny-(pane.y-door.y)*door.nx);
      const vertical=Math.abs(pane.z-door.z);
      assert.ok(along>(pane.width+door.width)/2||vertical>(pane.height+door.height)/2,
        'No window is painted over the entrance');
    }
  }
});

test('each PCK balcony side has three stacks over all five raised residential floors',()=>{
  for(const id of ['building-9','building-15','building-29']){
    const source=building(id),layout=neighborhoodAppearanceLayout([source],data);
    for(const sign of [-1,1]){
      const side=layout.balconies.filter(p=>p.nx*sign>.8);
      assert.equal(side.length,15);
      assert.equal(new Set(side.map(p=>p.column)).size,3);
      assert.equal(new Set(side.map(p=>p.floor)).size,5);
      assert.ok(side.every(p=>p.slabZ-source.baseZ>1.5),'Lowest balcony remains above the basement');
    }
  }
});

test('overlapping PCK paint fields have stable depth order behind window frames',()=>{
  const pck=building('building-9'),layout=neighborhoodAppearanceLayout([pck],data);
  for(const edge of appearanceFacadeEdges(pck)){
    const fields=layout.panels.filter(p=>Math.abs(p.nx-edge.nx)<1e-8&&Math.abs(p.ny-edge.ny)<1e-8&&p.height>1);
    assert.ok(fields.every(p=>p.offset<.025),'Paint stays behind the existing window-frame plane');
    assert.equal(new Set(fields.map(p=>p.offset)).size,fields.length,'Nested colour fields must not z-fight');
  }
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

test('resolved nearby street-house elevations use two main rows without manufacturing a third storey',()=>{
  for(const id of ['building-2','building-3','building-5','building-6','building-7']){
    const panes=observedFacadePlacements(building(id),origin).filter(p=>p.appearanceEvidence==='user-reference-estimate');
    assert.equal(new Set(panes.map(p=>p.floor)).size,2);
    assert.ok(panes.every(p=>p.z-building(id).baseZ>2));
  }
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
