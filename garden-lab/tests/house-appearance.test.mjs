import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {toWorld} from '../src/orientation.js';
import {terrainAt} from '../src/geometry.js';
import {garageLayout} from '../src/garage-ramp.js';
import {GARAGE_DEFAULTS} from '../src/garage-options.js';
import {sterniczaRoofEnvelope,photoRoofEdgeHeight} from '../src/house-roof.js';
import {houseAppearanceLayout,houseWindowAnchor,facadePoint} from '../src/house-appearance.js';
import {createPhotoHouseGroup} from '../src/scene-house.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const settings={...GARAGE_DEFAULTS,floorHeight:1.2,firstFloorRise:3,canopyEnabled:true,terraceCoverType:'canopy',gardenProgram:'spa-pool-grove'};
const near=(a,b,tolerance=1e-5)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} differs from ${b}`);
const point=p=>new THREE.Vector3(...toWorld(...p));
const area=ring=>Math.abs(ring.reduce((sum,p,i)=>sum+p[0]*ring[(i+1)%ring.length][1]-ring[(i+1)%ring.length][0]*p[1],0))/2;

test('pitched roof spans the exact footprint, retains fitted reference planes and measured chimney heights',()=>{
  const roof=sterniczaRoofEnvelope(data.site.house),ring=data.site.house.footprint.slice(0,-1);
  assert.deepEqual(roof.ring,ring);
  near(roof.surfaceFaces.reduce((sum,face)=>sum+area(face),0),area(ring),1e-6);
  const samples=data.site.house.roofPoints;
  for(const [label,points,maxRms]of [
    ['front',samples.filter(p=>p[1]<12&&p[2]<12.95),.038],
    ['rear',samples.filter(p=>p[1]>12.5),.023],
  ]){
    const rms=Math.sqrt(points.reduce((sum,p)=>sum+(roof.sourceHeightAt(p[0],p[1])-p[2])**2,0)/points.length);
    assert.ok(rms<maxRms,`${label} reference plane must follow source returns; RMS ${rms}`);
  }
  assert.deepEqual(roof.chimneys.map(c=>c.topZ),[13.34,13.13]);
  near(Math.max(...roof.roofFaces.flat().map(p=>p[2])),data.site.house.roofTopZ);
  assert.ok(roof.ridgeZ-roof.eavesZ>3,'The house must have a visibly pitched roof, not a lowest-return flat cap');
  for(const edge of roof.edges)for(let i=0;i<edge.points.length;i++)near(photoRoofEdgeHeight(edge,edge.fractions[i]*edge.length),edge.points[i][2]);
  for(const face of roof.surfaceFaces)for(const p of face)near(p[2],roof.heightAt(p[0],p[1]),1e-6);
});

test('photo gable sits on the street-facing viewer-right side and explicitly reports its conflict with source returns',()=>{
  const roof=sterniczaRoofEnvelope(data.site.house),front=data.site.house.footprint[0][1],rear=data.site.rearMidpoint[1];
  near(roof.heightAt(6.7,front),12.62);
  assert.ok(roof.heightAt(6.7,front)>roof.sourceHeightAt(6.7,front)+1.5,'The photographed front gable must be visible above the original front eave');
  near(roof.heightAt(12.35,front),roof.sourceHeightAt(12.35,front));
  for(const x of [5,6.7,9.5,12.35,14.5])near(roof.heightAt(x,rear),roof.sourceHeightAt(x,rear));
  const override=roof.provenance.photoOverride;
  assert.equal(override.facade,'street-front');assert.equal(override.viewerSide,'right');
  assert.equal(override.affectedSourceSampleCount,6);
  assert.ok(override.maximumSourceSampleRaiseM>1.18&&override.maximumSourceSampleRaiseM<1.21);
  assert.ok(override.renderedFrontSampleRmsM>.29&&override.renderedFrontSampleRmsM<.31,
    'The changed roof must not claim the reference plane\'s smaller fit error');
  assert.ok(override.renderedRearSampleRmsM<.023);
  const layout=houseAppearanceLayout(data,settings);
  assert.ok(layout.windows.find(w=>w.id==='front-first-west').width>layout.windows.find(w=>w.id==='front-first-east').width,
    'The photo\'s broad viewer-right window is on the lower-x side in the mapped frame');
});

test('photo window viewpoints sit outside real rendered openings, including balcony access',()=>{
  for(const terraceCoverType of ['canopy','balcony'])for(const facing of ['street','garden']){
    const state={...settings,terraceCoverType},layout=houseAppearanceLayout(data,state),anchor=houseWindowAnchor(facing,data,state);
    const w=layout.windows.find(w=>w.id===anchor.windowId),edge=layout.edges[w.edgeIndex];
    assert.ok(w,'A first-floor camera must name an actual aperture');
    const midpoint=facadePoint(edge,w.centre,w.z+w.height/2);
    near(anchor.facadePosition.x,midpoint[0]);near(anchor.facadePosition.y,midpoint[1]);
    const group=createPhotoHouseGroup(data,state,{terrainAt});group.updateWorldMatrix(true,true);
    const origin=point([anchor.x,anchor.y,w.z+w.height*.38]);
    const direction=new THREE.Vector3(-edge.outward[0],0,-edge.outward[1]);
    const ray=new THREE.Raycaster(origin,direction,0,.5);
    const walls=group.children.filter(child=>child.name.startsWith('house-wall-'));
    assert.equal(ray.intersectObjects(walls).length,0,'The chosen view cannot be painted on an opaque wall');
    const glass=group.getObjectByName(`${w.id}-glass`);assert.ok(ray.intersectObject(glass).length>0,'The camera corresponds to the actual glazed aperture');
  }
  assert.equal(houseWindowAnchor('street',data,settings,'attic'),null,'The side-only attic photograph cannot establish a front attic window');
});

test('new facade, brickwork and front steps leave the full enabled two-car portal open',()=>{
  const state={...settings,basementGarageEnabled:true},layout=garageLayout(state,data,{terrainAt}),group=createPhotoHouseGroup(data,state,{terrainAt,garageLayout:layout});
  group.updateWorldMatrix(true,true);
  const direction=new THREE.Vector3(layout.axis.direction[0],0,layout.axis.direction[1]);
  for(const lateral of [-layout.clearWidth*.43,0,layout.clearWidth*.43])for(const z of [data.site.house.baseZ+.15,layout.portal.topZ-.12]){
    const origin=point([...layout.at(layout.axis.frontRun-.5,lateral),z]);
    const hits=new THREE.Raycaster(origin,direction,0,.65).intersectObject(group,true);
    assert.equal(hits.length,0,`Portal at lateral ${lateral} and height ${z} must stay open through all architectural detail`);
  }
  const appearance=group.userData.houseAppearance;
  near(appearance.door.position[0],9.16);
  assert.ok(appearance.entryAccess.proposed);
  const landing=group.getObjectByName('house-entry-cantilever-landing');
  const box=new THREE.Box3().setFromObject(landing);
  near(box.min.y,layout.entryAccess.landing.soffitZ);near(box.max.y,layout.livingFloorZ);
  for(const step of group.children.filter(c=>c.name.startsWith('house-return-step-'))){
    const bounds=new THREE.Box3().setFromObject(step);assert.ok(bounds.max.x<=7.4+1e-5,'Side-return stair must stay west of the widened drive');
  }
});

test('rendered roof and cream gable wall seams use the analytical envelope',()=>{
  const group=createPhotoHouseGroup(data,settings,{terrainAt}),envelope=sterniczaRoofEnvelope(data.site.house);
  const roof=group.getObjectByName('house-measured-terracotta-roof'),position=roof.geometry.getAttribute('position');
  assert.equal(position.count,envelope.surfaceFaces.length*3);
  for(let i=0;i<position.count;i++)near(position.getY(i),envelope.heightAt(position.getX(i),position.getZ(i)),2e-5);
  for(const edge of envelope.edges){
    const wall=group.getObjectByName(`house-wall-${edge.index}-plaster`),points=wall.geometry.getAttribute('position');
    const maximum=Math.max(...Array.from({length:points.count},(_,i)=>points.getY(i)));
    near(maximum,Math.max(...edge.points.map(p=>p[2])),2e-5);
  }
});

test('floor changes move the openings while source roof and other properties remain independent',()=>{
  const low=houseAppearanceLayout(data,settings),high=houseAppearanceLayout(data,{...settings,floorHeight:1.5,firstFloorRise:3.2});
  near(high.door.z-low.door.z,.3);near(high.firstFloorZ-low.firstFloorZ,.5);
  assert.deepEqual(low.roof.envelope.roofFaces,high.roof.envelope.roofFaces);
  for(const id of ['nadmorska-17','korzeniowskiego-40']){
    const other={...data,site:{...data.site,id}};
    assert.equal(houseAppearanceLayout(other,settings).supported,false);
    assert.equal(createPhotoHouseGroup(other,settings).children.length,0);
  }
});
