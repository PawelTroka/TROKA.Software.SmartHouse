import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {observedBuildingAppearance,observedFacadePlacements,appearanceFacadeEdges,appearanceFacadeElevations,neighborhoodAppearanceLayout} from '../src/neighborhood-appearance.js';
import {createNeighborhoodAppearanceGroup} from '../src/scene-neighborhood-appearance.js';
import {visualNeighborRoof,visualNeighborWallHeightAt} from '../src/observed-neighbor-roofs.js';
import {pointInPolygon} from '../src/geometry.js';

const data=JSON.parse(fs.readFileSync(new URL('../data/site-data.json',import.meta.url)));
const building=id=>data.buildings.find(b=>b.id===id),origin=data.site.rearMidpoint;
const positions=panes=>panes.map(p=>[p.x,p.y,p.z,p.width,p.height,p.nx,p.ny,Boolean(p.balcony),p.mullions??null]
  .map(v=>typeof v==='number'?Math.round(v*1e6)/1e6:v).join(',')).sort();
const near=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-7,message||`${a} != ${b}`);
const subdivide=footprint=>{
  const ring=footprint.slice(0,-1),result=[];
  for(const [i,a] of ring.entries()){
    const b=ring[(i+1)%ring.length];
    result.push(a,[a[0]+(b[0]-a[0])*.37,a[1]+(b[1]-a[1])*.37]);
  }
  return [...result,result[0]];
};

test('a cadastral front split into short segments receives its observed elevation exactly once',()=>{
  const house=building('building-8'),profile=observedBuildingAppearance(house);
  const edges=appearanceFacadeEdges(house).filter(edge=>edge.direction==='front');
  assert.equal(edges.length,3);
  assert.ok(edges.every(edge=>edge.length<5.5),'Regression fixture has no individually eligible old-style edge');
  const elevation=appearanceFacadeElevations(house).find(e=>e.direction==='front');
  assert.ok(elevation.length>10);
  const panes=observedFacadePlacements(house,origin).filter(p=>p.facadeDirection==='front');
  assert.equal(panes.length,profile.floorCount*profile.facades.front.bays.length);
  assert.ok(panes.every(p=>p.appearanceEvidence==='user-reference-estimate'));
  for(let floor=0;floor<profile.floorCount;floor++){
    const row=panes.filter(p=>p.floor===floor).sort((a,b)=>a.column-b.column);
    assert.deepEqual(row.map(p=>p.facadeU),profile.facades.front.bays);
  }
});

test('subdivision, reversed winding and a different first vertex preserve complete facade registration',()=>{
  for(const id of ['building-8','building-3','building-5','building-7','building-9']){
    const house=building(id),expected=positions(observedFacadePlacements(house,origin));
    const split=subdivide(house.footprint),open=split.slice(0,-1),rotated=[...open.slice(3),...open.slice(0,3)];
    for(const footprint of [split,[...split].reverse(),[...rotated,rotated[0]]]){
      const variant={...house,footprint},panes=observedFacadePlacements(variant,origin);
      assert.deepEqual(positions(panes),expected,id);
      for(const pane of panes){
        near(Math.hypot(pane.nx,pane.ny),1);
        assert.equal(pointInPolygon([pane.x+pane.nx*.02,pane.y+pane.ny*.02],variant.footprint),false,
          `${id}: normal must face outside the actual source wall`);
      }
    }
  }
});

test('unobserved elevations keep the observed building storeys and window datum',()=>{
  for(const id of ['building-2','building-3','building-5','building-6','building-7','building-8','building-10','building-19']){
    const house=building(id),profile=observedBuildingAppearance(house),panes=observedFacadePlacements(house,origin);
    const generic=panes.filter(p=>p.appearanceEvidence==='illustrative');
    assert.ok(generic.length>0,id);
    assert.equal(new Set(generic.map(p=>p.floor)).size,profile.floorCount,id);
    for(const pane of generic){
      near(pane.z-house.baseZ,profile.firstWindowHeight+pane.floor*profile.floorRise,`${id}: floor ${pane.floor}`);
      near(pane.height,profile.windowHeight);
    }
  }
});

test('a recorded blank wall remains blank after its footprint edge is subdivided or shifted',()=>{
  const source=building('building-9'),edge=appearanceFacadeEdges(source).find(edge=>edge.direction==='front');
  const observation={officialId:source.officialId,windowlessEdges:[{a:edge.a,b:edge.b}]};
  for(const [dx,dy,scaleZ] of [[0,0,1],[12,-4,1.3]]){
    const variant={...source,footprint:subdivide(source.footprint).map(([x,y])=>[x+dx,y+dy]),
      roofZ:source.baseZ+(source.roofZ-source.baseZ)*scaleZ,adjustment:{dx,dy,scaleZ}};
    const panes=observedFacadePlacements(variant,[origin[0]+dx,origin[1]+dy],160,observation);
    assert.ok(panes.length>0);
    assert.equal(panes.filter(p=>p.facadeDirection==='front').length,0);
    const layout=neighborhoodAppearanceLayout([variant],{...data,facadeOverrides:{[variant.id]:observation}},{origin:[origin[0]+dx,origin[1]+dy]});
    assert.equal(layout.balconies.filter(p=>p.facadeDirection==='front').length,0);
  }
});

test('stepped facade openings stay on their actual wall and do not repeat a profile on each wing',()=>{
  for(const id of ['building-3','building-5','building-7']){
    const house=building(id),profile=observedBuildingAppearance(house);
    const elevation=appearanceFacadeElevations(house).find(e=>e.direction==='rear');
    if(id!=='building-7')assert.ok(elevation.members.length>=2,`${id}: retained physical setback`);
    else assert.ok(appearanceFacadeEdges(house).filter(e=>e.direction==='rear').length>=2,'Near-collinear boundary segments remain one elevation');
    assert.ok(profile.facades.rear,`${id}: the observed rear profile must be registered`);
    const facade=profile.facades.rear,panes=observedFacadePlacements(house,origin).filter(p=>p.facadeDirection==='rear'&&!p.basement);
    const expected=Array.from({length:profile.floorCount},(_,floor)=>facade.rowBays?.[floor]?.length??facade.bays.length).reduce((a,b)=>a+b,0);
    assert.equal(panes.length,expected,id);
    for(const pane of panes){
      const edge=appearanceFacadeEdges(house).find(edge=>edge.side===pane.side);
      const cross=(pane.x-edge.a[0])*(edge.b[1]-edge.a[1])-(pane.y-edge.a[1])*(edge.b[0]-edge.a[0]);
      near(cross,0,`${id}: opening must lie on its mapped wall`);
    }
  }
});

test('the 9a garden face preserves wide three-pane window groups beside its central balcony doors',()=>{
  const house=building('building-2'),panes=observedFacadePlacements(house,origin).filter(p=>p.facadeDirection==='rear');
  assert.equal(panes.length,6);
  for(let floor=0;floor<2;floor++){
    const row=panes.filter(p=>p.floor===floor).sort((a,b)=>a.column-b.column);
    assert.deepEqual(row.map(p=>p.mullions),[2,1,2]);
    assert.deepEqual(row.map(p=>p.balcony===true),[false,true,false]);
    near(row[0].width,2.1);near(row[2].width,2.1);
    near(row[1].width,1.35);
    near(row[1].z-row[1].height/2,row[1].balconyFloorZ+.1);
  }
  const layout=neighborhoodAppearanceLayout([house],data);
  assert.equal(layout.balconies.length,2);
  assert.ok(layout.balconies.every(p=>p.type==='projecting'&&p.width===3.4&&p.depth===.9));
});

test('opposite low wings retain one supported loggia without an invented upper front wall or door',()=>{
  const measured={...data,neighborRoofObservations:JSON.parse(fs.readFileSync(new URL('../data/sternicza-neighbor-roofs.json',import.meta.url)))};
  for(const id of ['building-5','building-7']){
    const house=building(id),panes=observedFacadePlacements(house,origin);
    const wing=panes.filter(p=>p.facadeDirection==='rear'&&p.column===0),roof=visualNeighborRoof(house,measured);
    assert.equal(wing.length,1,id);assert.equal(wing[0].floor,0);
    assert.ok(wing[0].z+wing[0].height/2<visualNeighborWallHeightAt(roof,wing[0].x,wing[0].y));
    const layout=neighborhoodAppearanceLayout([house],measured);
    assert.equal(layout.balconies.length,1,id);
    assert.equal(layout.balconies[0].type,'recessed');
    assert.equal(layout.balconies[0].floor,0);
  }
});

test('grouped openings and explicit balcony types follow translated and vertically scaled houses',()=>{
  for(const id of ['building-2','building-3','building-5','building-7']){
    const source=building(id),dx=7,dy=-5,scaleZ=1.25;
    const shifted={...source,footprint:source.footprint.map(([x,y])=>[x+dx,y+dy]),
      roofZ:source.baseZ+(source.roofZ-source.baseZ)*scaleZ,adjustment:{dx,dy,scaleZ}};
    const original=observedFacadePlacements(source,origin),moved=observedFacadePlacements(shifted,[origin[0]+dx,origin[1]+dy]);
    assert.equal(moved.length,original.length,id);
    for(let i=0;i<original.length;i++){
      near(moved[i].x-original[i].x,dx);near(moved[i].y-original[i].y,dy);
      near(moved[i].z-source.baseZ,(original[i].z-source.baseZ)*scaleZ);
      near(moved[i].height,original[i].height*scaleZ);
      assert.equal(moved[i].mullions,original[i].mullions);
    }
    const a=neighborhoodAppearanceLayout([source],data),b=neighborhoodAppearanceLayout([shifted],data,{origin:[origin[0]+dx,origin[1]+dy]});
    assert.equal(b.balconies.length,a.balconies.length);
    for(let i=0;i<a.balconies.length;i++){
      near(b.balconies[i].slabZ-source.baseZ,(a.balconies[i].slabZ-source.baseZ)*scaleZ);
      near(b.balconies[i].railHeight,a.balconies[i].railHeight*scaleZ);
      assert.equal(b.balconies[i].type,a.balconies[i].type);
    }
  }
});

test('a recessed balcony has a flush guard and shaded aperture without a projecting slab',()=>{
  const candidates=data.buildings.filter(house=>neighborhoodAppearanceLayout([house],data).balconies.some(p=>p.type==='recessed'));
  assert.ok(candidates.length>0,'Reference-backed recessed balconies must reach the renderer');
  for(const house of candidates){
    const layout=neighborhoodAppearanceLayout([house],data),recessed=layout.balconies.filter(p=>p.type==='recessed');
    const group=createNeighborhoodAppearanceGroup([house],data);
    const slabs=group.children.find(child=>child.name==='observed-balcony-slabs');
    const fronts=group.children.find(child=>child.name==='observed-balcony-colour-fronts');
    assert.equal(slabs?.count??0,layout.balconies.length-recessed.length);
    assert.equal(fronts.count,layout.balconies.length);
    assert.ok(layout.panels.filter(p=>p.color==='#41453f').length>=recessed.length);
    const matrices=fronts.instanceMatrix.array;
    for(const [index,balcony] of layout.balconies.entries())if(balcony.type==='recessed'){
      const x=matrices[index*16+12],y=matrices[index*16+14];
      assert.ok(Math.abs((x-balcony.x)*balcony.nx+(y-balcony.y)*balcony.ny-.075)<1e-5);
    }
  }
});
