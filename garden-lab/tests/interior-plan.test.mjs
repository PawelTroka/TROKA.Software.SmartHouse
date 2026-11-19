import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  atticHeadroomAt, getInteriorGarageConflicts, getInteriorPlan, INTERIOR_DIMENSIONS,
  INTERIOR_FLOORS, INTERIOR_LAYOUTS, INTERIOR_SOURCES,
} from '../src/interior-plan.js';
import {CYBERSTER_AWD, garagePlanFrame} from '../src/garage-ramp.js';
const baseline=floor=>getInteriorPlan({floor,layout:'existing'});
const proposal=floor=>getInteriorPlan({floor,layout:'renovation'});
const near=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<tol,`${a} vs ${b}`);
const contains=(polygon,x,z)=>{
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const [ax,az]=polygon[i],[bx,bz]=polygon[j];
    if((az>z)!==(bz>z)&&x<(bx-ax)*(z-az)/(bz-az)+ax)inside=!inside;
  }
  return inside;
};
const corners=f=>[[-1,-1],[-1,1],[1,1],[1,-1]].map(([a,b])=>[f.x+a*(f.width/2-.001),f.z+b*(f.depth/2-.001)]);

test('all ten private sheets have distinct transcriptions and the correct building attribution',()=>{
  assert.equal(INTERIOR_SOURCES.length,10);
  assert.equal(new Set(INTERIOR_SOURCES.map(s=>s.file)).size,10);
  assert.match(INTERIOR_SOURCES.find(s=>s.id==='detached').reading,/two portals/);
  assert.match(INTERIOR_SOURCES.find(s=>s.id==='structure').reading,/timber floors/);
  const {levels}=INTERIOR_DIMENSIONS;
  near(levels.basement.elevation+levels.basement.clearHeight+.30,levels.ground.elevation);
  near(levels.ground.elevation+levels.ground.clearHeight+.30,levels.first.elevation);
  near(levels.first.elevation+levels.first.clearHeight,levels.attic.elevation);
});
test('printed room areas are preserved independently from reconstructed polygons',()=>{
  const schedules={
    ground:[24.57,19.80,14.10,7.60,6.0,4.50],
    first:[16.18,12.0,8.42,5.60,28.08,7.18,5.36],
    basement:[19.3,11.2,13.5,19.3,10.8],
  };
  for(const [floor,schedule] of Object.entries(schedules)){
    const rooms=baseline(floor).rooms;
    assert.deepEqual(rooms.map(r=>r.sourceArea),schedule);
    assert.equal(new Set(rooms.map(r=>r.sourceId)).size,schedule.length);
    assert.ok(rooms.every(r=>r.area>0));
    assert.ok(rooms.some(r=>Math.abs(r.area-r.sourceArea)>.05));
  }
  assert.equal(proposal('first').rooms.find(r=>r.id==='master').sourceArea,null);
  assert.throws(()=>getInteriorPlan({floor:'roof'}),RangeError);
});
test('upper bay preserves the printed 307 by 168 cm clear dimensions and accounts for the wardrobe partition',()=>{
  for(const plan of [baseline('first'),proposal('first')]){
    const left=plan.walls.find(w=>w.id==='bay-left'),right=plan.walls.find(w=>w.id==='bay-right');
    const front=plan.walls.find(w=>w.id==='bay-front'),street=plan.walls.find(w=>w.id==='street-left');
    const innerLeft=left.a[0]+left.thickness/2,innerRight=right.a[0]-right.thickness/2;
    near(innerRight-innerLeft,3.07);
    near(front.a[1]-front.thickness/2-(street.a[1]-street.thickness/2),1.68);
    near(plan.envelope.bay.width,3.55+2*.10);
    near(plan.envelope.bay.masonryThickness,.24);
    near(plan.envelope.bay.x,3.51);
  }
  const plan=proposal('first'),wardrobe=plan.rooms.find(r=>r.id==='wardrobe');
  const partition=plan.walls.find(w=>w.id==='wardrobe-front');
  const [a,,b]=wardrobe.polygon;
  near(b[0]-a[0],3.07);near(b[1]-a[1],1.59);
  near(a[1],partition.a[1]+partition.thickness/2);
  near(wardrobe.area,4.88);
  assert.match(plan.issues.find(note=>note.includes('wardrobe partition')),/3\.07 × 1\.59/);
  near(baseline('ground').envelope.bay.width,3.55);
});
test('all apertures fit their wall segment and level, including narrow garage experiments',()=>{
  const plans=INTERIOR_FLOORS.flatMap(floor=>INTERIOR_LAYOUTS.map(layout=>getInteriorPlan({floor,layout})));
  for(const width of [2.8,4.5,5.8,6.4])plans.push(getInteriorPlan({floor:'basement',garageVariant:'two-car',garageSettings:{garageRampWidth:width}}));
  for(const p of plans){
    assert.equal(new Set(p.walls.map(w=>w.id)).size,p.walls.length);
    for(const w of [...p.walls,...p.removedWalls]){
      const len=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]);
      assert.ok(len>0&&w.thickness>0,w.id);
      let end=0;
      for(const o of w.openings){
        const context=p.floor+' / '+w.id+' / '+o.type;
        assert.ok(o.width>0&&o.height>0&&o.sill>=0,context);
        assert.ok(o.height+o.sill<=w.height+.001,context);
        assert.ok(o.offset>=end-.001&&o.offset+o.width<=len+.001,context);
        end=o.offset+o.width;
      }
    }
  }
});
test('three historic rear rooms each receive a distinct balcony door and the ground gets one HST',()=>{
  const first=proposal('first'),ground=proposal('ground');
  const doors=first.walls.find(w=>w.id==='balcony-facade');
  assert.deepEqual(doors.openings.map(o=>o.type),Array(3).fill('balcony-door'));
  for(const [i,key] of ['master','office','guest-1'].entries()){
    const opening=doors.openings[i],x=doors.a[0]+opening.offset+opening.width/2;
    assert.ok(contains(first.rooms.find(r=>r.id===key).polygon,x,.6));
    assert.equal(opening.sill,0);
  }
  const hst=ground.walls.find(w=>w.id==='garden-hst').openings[0];
  near(hst.width,9.97);assert.equal(hst.type,'hst');assert.equal(hst.sill,0);
  for(const [p,key] of [[ground,'terrace'],[first,'balcony']]){
    const d=p.outdoor.find(s=>s.id===key);
    near(d.depth,4);near(d.polygon[1][0]-d.polygon[0][0],10.77);
    assert.equal(baseline(p.floor).outdoor.some(s=>s.id===key),false);
    assert.ok(p.removedWalls.length>0);
  }
});
test('renovated fittings stay in their assigned room and clear the flue cores',()=>{
  for(const plan of [proposal('ground'),proposal('first')]){
    for(const f of plan.fixtures){
      const r=plan.rooms.find(r=>r.id===f.roomId);
      assert.ok(r,f.id);
      for(const [x,z] of corners(f))assert.ok(contains(r.polygon,x,z),f.id+' crosses '+r.id);
      for(const core of plan.cores){
        const [a,,b]=core.polygon;
        const overlap=Math.min(b[0],f.x+f.width/2)-Math.max(a[0],f.x-f.width/2)>0 &&
          Math.min(b[1],f.z+f.depth/2)-Math.max(a[1],f.z-f.depth/2)>0;
        assert.equal(overlap,false,f.id+' overlaps '+core.id);
      }
      if(f.hostId)assert.ok(plan.fixtures.some(host=>host.id===f.hostId));
    }
  }
  const first=proposal('first');
  const wet=first.fixtures.filter(f=>f.roomId==='spa-bath');
  for(const [i,a] of wet.entries())for(const b of wet.slice(i+1)){
    const xOverlap=(a.width+b.width)/2-Math.abs(a.x-b.x);
    const zOverlap=(a.depth+b.depth)/2-Math.abs(a.z-b.z);
    assert.ok(xOverlap<=0||zOverlap<=0,a.id+' overlaps '+b.id);
  }
  assert.deepEqual(first.fixtures.filter(f=>f.kind==='tub').map(f=>f.variant).sort(),['soaking','whirlpool']);
  assert.equal(first.fixtures.find(f=>f.kind==='shower').heads,2);
  assert.match(first.issues.find(x=>x.includes('sauna')),/extra depth/);
});
test('every proposed upper room connects to the landing through real doorway gaps',()=>{
  const plan=proposal('first');
  const blocked=(x,z)=>plan.walls.some(w=>{
    const horizontal=w.a[1]===w.b[1],t=horizontal?x-w.a[0]:z-w.a[1],l=horizontal?w.b[0]-w.a[0]:w.b[1]-w.a[1];
    const offset=horizontal?z-w.a[1]:x-w.a[0];
    if(t<0||t>l||Math.abs(offset)>w.thickness/2+.04)return false;
    return !w.openings.some(o=>['door','passage'].includes(o.type)&&t>o.offset+.04&&t<o.offset+o.width-.04);
  })||[...plan.voids,...plan.cores.map(c=>c.polygon)].some(p=>contains(p,x,z));
  const step=.065,nx=Math.ceil(10.77/step),nz=Math.ceil(10.68/step);
  const start=[Math.round(5.40/step),Math.round(4.40/step)];
  const queue=[start],seen=new Set([start[1]*nx+start[0]]),reached=new Set();
  for(let i=0;i<queue.length;i++){
    const [col,row]=queue[i],x=col*step,z=row*step;
    for(const r of plan.rooms)if(contains(r.polygon,x,z))reached.add(r.id);
    for(const [c,r] of [[col-1,row],[col+1,row],[col,row-1],[col,row+1]]){
      const index=r*nx+c;
      if(c<0||r<0||c>=nx||r>=nz||seen.has(index))continue;
      seen.add(index);
      if(!contains(plan.envelope.outline,c*step,r*step)||blocked(c*step,r*step))continue;
      queue.push([c,r]);
    }
  }
  assert.deepEqual([...reached].sort(),plan.rooms.map(r=>r.id).sort());
});
test('optional garage mirrors the live site ramp onto the drawing at the actual clear width',()=>{
  const data=JSON.parse(fs.readFileSync(new URL('../data/site-data.json',import.meta.url)));
  const [a,b]=data.site.house.footprint,midX=(a[0]+b[0])/2;
  for(const width of [2.8,4.1,5.8,6.4]){
    const settings={basementGarageEnabled:true,garageRampWidth:width,garageSlabThickness:.30,garageClearHeight:2.30};
    const live=garagePlanFrame(settings,data),paper=getInteriorPlan({floor:'basement',garageVariant:'two-car',garageSettings:settings});
    const facadeLen=Math.hypot(b[0]-a[0],b[1]-a[1]),projected=5.385-(live.centerX-midX)*facadeLen/(b[0]-a[0]);
    near((paper.garage.x0+paper.garage.x1)/2,projected);
    near(paper.garage.clearWidth,live.clearWidth);
    assert.equal(paper.fixtures.filter(f=>f.kind==='car').length,2);
    for(const car of paper.fixtures){
      near(car.depth,CYBERSTER_AWD.length);near(car.width,CYBERSTER_AWD.width);near(car.mirrorWidth,CYBERSTER_AWD.mirrorWidth);
    }
    assert.equal(paper.garage.widthPass,live.parking.widthPass);
    near(paper.elevation,-2.60);near(paper.garage.lowering,.60);
  }
  assert.deepEqual(getInteriorGarageConflicts().map(c=>c.id).sort(),['cellar-stair','west-flue']);
  assert.ok(getInteriorGarageConflicts().every(c=>c.severity==='blocked'));
  assert.equal(baseline('basement').rooms.length,5);
  assert.equal(getInteriorPlan({floor:'basement',layout:'existing',garageVariant:'two-car'}).elevation,-2);
});
test('attic maximum follows the section and lower roof areas have less gross headroom',()=>{
  const attic=proposal('attic');
  assert.equal(attic.rooms.length,1);assert.equal(attic.fixtures.length,0);
  near(attic.elevation+atticHeadroomAt(attic.roof.ridgeZ),8.75);
  near(atticHeadroomAt(0),atticHeadroomAt(9));
  assert.ok(atticHeadroomAt(0)<.5);
  for(const b of attic.headroomBands)near(atticHeadroomAt(b.polygon[0][1]),b.minimum);
  assert.ok(attic.headroomBands[0].area>attic.headroomBands.at(-1).area);
  assert.deepEqual(attic.voids[0],proposal('first').stairs.find(s=>s.kind==='hatch').polygon);
});
