import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {createStateModel} from '../src/state.js';
import {getSiteProfile} from '../src/sites.js';
import {DESIGN_STYLES} from '../src/design-styles.js';
import {applyPlanExterior,planRegistrationSummary} from '../src/plan-exterior.js';
import {houseModelFrame,getHouseFloorPlan,sharedHouseFacades} from '../src/house-model.js';
import {architecturalRoofEnvelope} from '../src/architectural-roof.js';
import {houseAppearanceLayout,facadePoint} from '../src/house-appearance.js';
import {houseRenovationParts} from '../src/house-renovation.js';
import {garagePlanFrame,garageLayout} from '../src/garage-ramp.js';
import {terraceCoverLayout} from '../src/terrace-cover.js';
import {terrainAt} from '../src/geometry.js';
import {createSharedHouseModel} from '../src/scene-house-model.js';

const source=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const state=createStateModel(getSiteProfile(source.site.id,source));
const base={...state.DEFAULTS,designStyle:'hidden-bali',styleHouseFinish:true,interiorLayout:'renovation',firstFloorRise:3.05,atticRise:5.75,
  terraceWidth:10.77,terraceDepth:4,canopyEnabled:true,terraceCoverType:'balcony',canopyWidth:10.77,canopyDepth:4,planExteriorApplied:true};
const near=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<tolerance,`${a} differs from ${b}`);
const area=t=>Math.abs((t[1][0]-t[0][0])*(t[2][1]-t[0][1])-(t[1][1]-t[0][1])*(t[2][0]-t[0][0]))/2;

test('the drawing is rigidly registered without mutating or rescaling the source survey',()=>{
  const before=JSON.stringify(source),data=applyPlanExterior(source,base),frame=houseModelFrame(data,base);
  assert.equal(data.site.house.sourceFootprint,source.site.house.footprint);
  assert.equal(JSON.stringify(source),before);
  assert.equal(applyPlanExterior(source,base),data);
  near(Math.hypot(...frame.ex),1);near(Math.hypot(...frame.ey),1);
  near(frame.ex[0]*frame.ey[0]+frame.ex[1]*frame.ey[1],0);
  const a=frame.toSite(0,0),b=frame.toSite(10.77,0),c=frame.toSite(0,9);
  near(Math.hypot(b[0]-a[0],b[1]-a[1]),10.77);near(Math.hypot(c[0]-a[0],c[1]-a[1]),9);
  const ring=source.site.house.footprint.slice(0,-1),front=ring.map((p,i)=>[p,ring[(i+1)%ring.length]])
    .sort((a,b)=>a[0][1]+a[1][1]-b[0][1]-b[1][1])[0];
  const street=frame.toSite(5.385,9);near(street[0],(front[0][0]+front[1][0])/2);near(street[1],(front[0][1]+front[1][1])/2);
  const model=new THREE.Group();model.position.set(frame.origin[0],frame.floorZ,frame.origin[1]);model.rotation.y=frame.rotationY;model.updateMatrixWorld(true);
  for(const [x,z,y]of [[0,0,0],[10.77,9,3.05],[3.51,10.68,5.75],[5.1,4.6,-2.6]]){
    const site=frame.toSite(x,z,y),inverse=frame.toLocal(...site),world=new THREE.Vector3(x,y,z).applyMatrix4(model.matrixWorld);
    near(inverse[0],x);near(inverse[1],z);near(inverse[2],y);
    near(world.x,site[0]);near(world.y,site[2]);near(world.z,site[1]);
  }
  const raised=applyPlanExterior(source,{...base,floorHeight:base.floorHeight+.3});
  near(raised.site.house.architecturalModel.floorZ,data.site.house.architecturalModel.floorZ+.3);
  assert.deepEqual(raised.site.house.footprint,data.site.house.footprint);
  assert.equal(planRegistrationSummary(data).registered,true);
  for(const id of ['korzeniowskiego-40','nadmorska-17']){
    const other=JSON.parse(readFileSync(new URL('../data/'+id+'.json',import.meta.url)));
    assert.equal(applyPlanExterior(other,base),other);
  }
});

test('facade records use the exact floor-plan wall thicknesses and apertures in both layouts',()=>{
  for(const designStyle of ['current','hidden-bali']){
    const settings={...base,designStyle},data=applyPlanExterior(source,settings),facades=sharedHouseFacades(data,settings),frame=facades.frame;
    const plans=Object.fromEntries(['basement','ground','first'].map(floor=>[floor,getHouseFloorPlan({floor,settings,data})]));
    assert.ok(facades.edges.length>12);
    for(const edge of facades.edges){
      const plan=plans[edge.floor],wall=plan.walls.find(w=>edge.id===edge.floor+'-'+w.id);
      assert.ok(wall?.exterior);near(edge.length,Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]));
      near(edge.baseZ,frame.floorZ+plan.elevation);near(edge.topZ,edge.baseZ+wall.height);
      const mid=frame.toSite((wall.a[0]+wall.b[0])/2,(wall.a[1]+wall.b[1])/2);
      const faceMid=[(edge.a[0]+edge.b[0])/2,(edge.a[1]+edge.b[1])/2];
      near(Math.hypot(faceMid[0]-mid[0],faceMid[1]-mid[1]),wall.thickness/2);
      near((faceMid[0]-mid[0])*edge.outward[0]+(faceMid[1]-mid[1])*edge.outward[1],wall.thickness/2);
      for(const record of [...facades.windows,facades.door,facades.portal].filter(w=>w?.edgeIndex===edge.index)){
        const opening=wall.openings.find(o=>Math.abs(o.offset-record.lo)<1e-6&&Math.abs(o.width-record.width)<1e-6);
        assert.ok(opening,record.id);near(record.z,edge.baseZ+(opening.sill||0));near(record.height,opening.height);
        assert.ok(record.lo>=0&&record.hi<=edge.length+1e-6);
        const point=facadePoint(edge,opening.offset+opening.width/2,record.z);
        point.forEach((v,i)=>near(v,record.position[i]));
      }
    }
    assert.equal(facades.windows.filter(w=>w.kind==='balcony-door').length,designStyle==='current'?0:3);
    assert.equal(plans.ground.layout,designStyle==='current'?'existing':'renovation');
  }
});

test('all three real balcony doors meet the same deck in drawing and site coordinates',()=>{
  const data=applyPlanExterior(source,base),frame=houseModelFrame(data,base),plan=getHouseFloorPlan({floor:'first',settings:base,data});
  const cover=terraceCoverLayout(base,data,{floorZ:frame.floorZ});
  assert.equal(cover.accesses.length,3);assert.equal(cover.accessFits,true);
  assert.deepEqual(cover.accesses.map(a=>a.label),['Master bedroom','Main office','Guest bedroom I']);
  for(const door of cover.accesses){near(door.z,cover.deckTopZ);for(const [x,y]of [door.a,door.b]){
    assert.ok(x>=cover.bounds.x0&&x<=cover.bounds.x1);assert.ok(Math.abs(y-cover.bounds.y0)<.05);
  }}
  const balcony=plan.outdoor.find(p=>p.kind==='balcony'),corners=balcony.polygon.map(p=>frame.toSite(...p));
  near(Math.min(...corners.map(p=>p[0])),cover.bounds.x0);near(Math.max(...corners.map(p=>p[0])),cover.bounds.x1);
  near(Math.min(...corners.map(p=>p[1])),cover.bounds.y0);near(Math.max(...corners.map(p=>p[1])),cover.bounds.y1);
  const narrow=terraceCoverLayout({...base,canopyWidth:4},data,{floorZ:frame.floorZ});
  assert.equal(narrow.accessFits,false);assert.ok(narrow.accesses.some(a=>!a.fitsDeck));
});

test('the registered roof covers the exact main and projecting bay footprint with continuous heights',()=>{
  for(const atticRise of [5.75,7.1]){
    const data=applyPlanExterior(source,{...base,atticRise}),roof=architecturalRoofEnvelope(data.site.house);
    near(roof.surfaceFaces.reduce((sum,t)=>sum+area(t),0),10.77*9+3.75*1.68,1e-6);
    for(const triangle of roof.surfaceFaces){
      assert.ok(area(triangle)>1e-8);
      for(const p of triangle){assert.ok(p.every(Number.isFinite));near(p[2],roof.heightAt(p[0],p[1]));}
      const p=triangle.reduce((sum,v)=>sum.map((n,i)=>n+v[i]/3),[0,0,0]);near(p[2],roof.heightAt(p[0],p[1]));
    }
    near(roof.heightLocal(0,4.5),atticRise+3);
    near(roof.heightLocal(0,0),atticRise+3-4.5*Math.tan(Math.PI/6));
    near(roof.heightLocal(5.385,10.68),atticRise+1.5);
    for(const edge of roof.edges){
      for(const [i,p]of edge.points.entries()){
        near(p[2],roof.heightAt(p[0],p[1]));assert.ok(edge.fractions[i]>=0&&edge.fractions[i]<=1);
      }
    }
    for(const chimney of roof.chimneys){
      near(chimney.topZ,data.site.house.architecturalModel.floorZ+atticRise+3.85);
      assert.ok(chimney.faces.flat(2).every(Number.isFinite));
    }
  }
});

test('every facade renovation remains clipped to the registered storeys and exact openings',()=>{
  const data=applyPlanExterior(source,base),layout=houseAppearanceLayout(data,base),fingerprints=new Set();
  for(const style of DESIGN_STYLES.filter(s=>s.renovation)){
    const parts=houseRenovationParts(layout,style);assert.ok(parts.length>100,style.id);
    fingerprints.add(JSON.stringify(parts.map(p=>[p.edgeIndex,p.lo,p.hi,p.bottom,p.top,p.depth])));
    for(const p of parts){
      const edge=layout.edges[p.edgeIndex];assert.ok(p.bottom>=edge.baseZ&&p.top<=edge.topZ);
      assert.ok(p.lo>=0&&p.hi<=edge.length&&p.hi>p.lo&&p.top>p.bottom);
      for(const o of [...layout.windows,layout.door,layout.portal].filter(o=>o?.edgeIndex===p.edgeIndex))
        assert.ok(p.hi<=o.lo||p.lo>=o.hi||p.top<=o.z||p.bottom>=o.z+o.height,p.kind+' overlaps '+o.id);
    }
  }
  assert.equal(fingerprints.size,DESIGN_STYLES.filter(s=>s.renovation).length);
});

test('the garage ramp and converted cellar use the same registered portal jambs and vertical aperture',()=>{
  for(const garageRampWidth of [2.8,5.8,6.4]){
    const settings={...base,basementGarageEnabled:true,garageRampWidth},data=applyPlanExterior(source,settings),frame=houseModelFrame(data,settings);
    const plan=getHouseFloorPlan({floor:'basement',settings,data}),ramp=garagePlanFrame(settings,data),facade=sharedHouseFacades(data,settings),portal=facade.portal;
    near(ramp.houseDepth,9);near(plan.garage.clearWidth,ramp.clearWidth);
    const endpoints=[-1,1].map(sign=>frame.toLocal(...ramp.at(ramp.frontRun,sign*ramp.clearWidth/2))).sort((a,b)=>a[0]-b[0]);
    near(plan.garage.x0,endpoints[0][0]);near(plan.garage.x1,endpoints[1][0]);
    near(portal.position[0],ramp.axis.end[0],.001);near(portal.position[1],ramp.axis.end[1],.001);
    near(portal.width,garageRampWidth);
    const full=garageLayout(settings,data,{terrainAt});
    assert.ok(portal.z<=full.portal.bottomZ+1e-6);
    assert.ok(portal.z+portal.height>=full.portal.topZ-1e-6,'The house aperture cannot mask the authoritative ramp door opening');
    near(frame.floorZ+plan.elevation,full.floorZ);
    if(garageRampWidth>=5.8){
      assert.ok(full.entryAccess?.landing);
      const landing=full.entryAccess.landing.footprint.map(p=>frame.toLocal(...p));
      const door=facade.door,wall=facade.edges[door.edgeIndex],jambs=[door.lo,door.hi].map(x=>frame.toLocal(...facadePoint(wall,x,door.z)));
      for(const jamb of jambs)assert.ok(jamb[0]>=Math.min(...landing.map(p=>p[0]))&&jamb[0]<=Math.max(...landing.map(p=>p[0])),'Both actual door jambs land on the shared entry platform');
    }
    assert.equal(full.parking.spaces,2);
  }
});

test('valid compressed floor levels do not create wall height through the attic or first-floor slab',()=>{
  for(const [firstFloorRise,atticRise]of [[2,4.5],[4.5,5],[3.05,5.75]]){
    const settings={...base,firstFloorRise,atticRise},data=applyPlanExterior(source,settings);
    const ground=getHouseFloorPlan({floor:'ground',settings,data}),first=getHouseFloorPlan({floor:'first',settings,data});
    assert.ok(ground.clearHeight<=firstFloorRise-.30+1e-7,'Ground walls fit under the real first-floor slab');
    assert.ok(first.elevation+first.clearHeight<=atticRise+1e-7,'First-floor walls stop at the attic datum');
  }
});

// These tests inspect geometry only. A no-op 2D context supplies canvases for
// material construction without pretending to test their raster appearance.
function geometryCanvasDocument(){
  const context=new Proxy({},{get:()=>()=>{}});
  return {createElement(tag){assert.equal(tag,'canvas');return{width:0,height:0,getContext:()=>context};}};
}
test('assembled house meshes are finite and exterior skins leave real window apertures open',()=>{
  const previous=globalThis.document;globalThis.document=geometryCanvasDocument();let model;
  try{
    const data=applyPlanExterior(source,base);model=createSharedHouseModel(data,base,{terrainAt});model.root.updateMatrixWorld(true);
    const skins=[];
    model.root.traverse(o=>{
      assert.ok(o.position.toArray().every(Number.isFinite),'Non-finite position on '+o.name);
      assert.ok(o.matrixWorld.elements.every(Number.isFinite),'Non-finite transform on '+o.name);
      if(o.geometry){for(const key of ['position','normal'])if(o.geometry.attributes[key])assert.ok(o.geometry.attributes[key].array.every(Number.isFinite),'Non-finite '+key+' on '+o.name);}
      if(o.material?.userData?.exteriorRole==='wall'&&o.parent.visible)skins.push(o);
    });
    assert.ok(skins.length>3);
    const layout=model.layout;
    for(const opening of layout.windows.filter(w=>w.kind!=='garage-door')){
      const edge=layout.edges[opening.edgeIndex],p=facadePoint(edge,opening.lo+opening.width*.25,opening.z+opening.height*.45,.20);
      const ray=new THREE.Raycaster(new THREE.Vector3(p[0],p[2],p[1]),new THREE.Vector3(-edge.outward[0],0,-edge.outward[1]),0,.60);
      assert.equal(ray.intersectObjects(skins,false).length,0,'The exterior finish seals '+opening.id);
    }
  }finally{model?.dispose();if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
