import test from 'node:test';
import assert from 'node:assert/strict';
import {getInteriorPlan} from '../src/interior-plan.js';
import {RENOVATION_ROOM_PROGRAMS} from '../src/interior-curation.js';
import {DESIGN_STYLES} from '../src/design-styles.js';
import {walkGeometry} from '../src/interior-navigation.js';
import {footprintFit} from '../src/footprint-fit.js';

const byId=(plan,id)=>plan.fixtures.find(f=>f.id===id);
const box=f=>({x0:f.x-f.width/2,x1:f.x+f.width/2,z0:f.z-f.depth/2,z1:f.z+f.depth/2});
const ring=f=>{const b=box(f);return [[b.x0,b.z0],[b.x1,b.z0],[b.x1,b.z1],[b.x0,b.z1]];};
const distance=(a,b)=>Math.hypot(Math.max(a.x0-b.x1,b.x0-a.x1,0),Math.max(a.z0-b.z1,b.z0-a.z1,0));
const solid=f=>!f.nonBlocking&&!f.hostId&&!f.wallMounted;
const styles=Object.entries(RENOVATION_ROOM_PROGRAMS);

test('new kitchen and office programmes retain architecture, wet services and physically separate fixtures',()=>{
  assert.deepEqual(styles.map(([id])=>id),DESIGN_STYLES.filter(s=>s.renovation).map(s=>s.id));
  assert.deepEqual([...new Set(styles.map(([,p])=>p[0]))],['island']);
  assert.equal(new Set(styles.map(([,p])=>p[1])).size,2);
  for(const [styleId]of styles)for(const floor of ['ground','first']){
    const plan=getInteriorPlan({floor,styleId}),base=getInteriorPlan({floor,styleId:'current'});
    for(const key of ['walls','rooms','stairs','cores','voids'])assert.deepEqual(plan[key],base[key],styleId+' '+key);
    const services=floor==='ground'?['hob','kitchen-sink','kitchen-fridge']:base.fixtures.filter(f=>['spa-bath','sauna'].includes(f.roomId)).map(f=>f.id);
    for(const id of services)assert.deepEqual(byId(plan,id),byId(base,id),styleId+' fixed '+id);
    const fixtures=plan.fixtures.filter(solid);
    for(let i=0;i<fixtures.length;i++)for(const other of fixtures.slice(i+1)){
      const a=box(fixtures[i]),b=box(other),overlapX=Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0),overlapZ=Math.min(a.z1,b.z1)-Math.max(a.z0,b.z0);
      assert.ok(overlapX<=1e-8||overlapZ<=1e-8,`${styleId} ${floor}: ${fixtures[i].id} overlaps ${other.id}`);
    }
    for(const f of fixtures.filter(f=>['kitchen-island','east-counter','master-bed','master-nightstand-west','master-nightstand-east','office-desk','office-chair'].includes(f.id))){
      const room=plan.rooms.find(r=>r.id===f.roomId);
      assert.equal(footprintFit(ring(f),room.polygon).location,'inside',styleId+' '+f.id+' leaves its room');
    }
  }
});

test('larger master beds preserve a 0.60 m route past the bedside cabinet and wardrobe',()=>{
  const widths=new Set();
  for(const [styleId]of styles){
    const plan=getInteriorPlan({floor:'first',styleId}),bed=box(byId(plan,'master-bed'));
    const west=box(byId(plan,'master-nightstand-west')),east=box(byId(plan,'master-nightstand-east')),wardrobe=box(byId(plan,'master-storage'));
    const room=plan.rooms.find(r=>r.id==='master'),leftWall=Math.min(...room.polygon.map(p=>p[0]));
    widths.add(byId(plan,'master-bed').width);
    assert.ok(bed.x0-leftWall>=.60-1e-8,styleId+' west bed aisle');
    assert.ok(wardrobe.x0-bed.x1>=.60-1e-8,styleId+' east bed aisle');
    assert.ok(distance(east,wardrobe)>=.60-1e-8,styleId+' door-to-wardrobe turning gap');
    assert.ok(west.x1<=bed.x0+1e-8&&east.x0>=bed.x1-1e-8,styleId+' bedside cabinets overlap the bed');
  }
  assert.ok(widths.has(1.8)&&widths.has(2),'Wider proposals remain available where they physically fit');
});

test('kitchen workstations and offices have programme-aware usable approaches',()=>{
  for(const [styleId,[,office]]of styles){
    const ground=getInteriorPlan({floor:'ground',styleId}),first=getInteriorPlan({floor:'first',styleId});
    const centre=byId(ground,'kitchen-island'),c=box(centre),street=box(byId(ground,'street-counter'));
    const wall=ground.walls.find(w=>w.id==='kitchen-living-opening'),opening=wall.openings[0],start=wall.a[0]+opening.offset;
    assert.ok(c.x0-start>=.95-1e-8,styleId+' left opening route');
    assert.ok(start+opening.width-c.x1>=.90-1e-8,styleId+' entrance beside island');
    assert.ok(street.z0-c.z1>=1.20-1e-8,styleId+' cooking work zone');
    const kitchenApproach=[c.x1+.45,centre.z];
    const chair=byId(first,'office-chair');
    const officeApproach=office==='floating'?[chair.x-chair.width/2-.35,chair.z]:[chair.x+chair.width/2+.45,chair.z];
    // The full circulation suite independently traverses these destinations
    // from the hall with a 0.60 m body and checks every door sweep. Here the
    // destinations are tied to usable fixture sides, not their former centres.
    assert.equal(walkGeometry(ground)(...kitchenApproach,true,.30),true,styleId+' preparation position');
    assert.equal(walkGeometry(first)(...officeApproach,true,.30),true,styleId+' desk-chair approach');
  }
});
