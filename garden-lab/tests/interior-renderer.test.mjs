import test from 'node:test';
import assert from 'node:assert/strict';
import {getInteriorPlan} from '../src/interior-plan.js';
import {floorTriangles,containsPoint,wallPanels} from '../src/interior-geometry.js';
import {walkGeometry,roomPose} from '../src/interior-navigation.js';

const rect=(x0,z0,x1,z1)=>[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
const meshArea=triangles=>triangles.reduce((sum,[a,b,c])=>sum+Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2,0);
test('the structural slab and finish patches both subtract complete and boundary-crossing stair openings',()=>{
  const ring=rect(0,0,4,4),hole=rect(1,1,3,3);
  assert.ok(Math.abs(meshArea(floorTriangles(ring,[hole]))-12)<1e-7);
  assert.ok(Math.abs(meshArea(floorTriangles(rect(0,0,2,4),[hole]))-6)<1e-7);
  const p=getInteriorPlan({floor:'first'}),shell=meshArea(floorTriangles(p.envelope.outline));
  assert.ok(Math.abs(shell-meshArea(floorTriangles(p.envelope.outline,p.voids))-meshArea(floorTriangles(p.voids[0])))<1e-6);
});
test('wall openings survive both the full-height shell and the dollhouse cut',()=>{
  const w={a:[0,0],b:[5,0],height:2.7,openings:[{offset:.4,width:1.2,sill:.8,height:1.4},{offset:2.5,width:1,sill:0,height:2.1}]};
  const panels=wallPanels(w),solid=(parts,x,y)=>parts.some(p=>p.left<x&&p.right>x&&p.bottom<=y&&p.top>=y);
  assert.equal(solid(panels,1,1.1),false);assert.equal(solid(panels,1,.4),true);assert.equal(solid(panels,3,.45),false);assert.equal(solid(panels,3,2.4),true);
  const cut=wallPanels(w,.7);assert.equal(solid(cut,1,.6),true);assert.equal(solid(cut,3,.6),false);
});
test('eye-level cameras begin in their own room clear of walls, furniture, stairs and low attic eaves',()=>{
  for(const floor of ['ground','first','attic','basement'])for(const layout of ['existing','renovation']){
    const p=getInteriorPlan({floor,layout,garageVariant:'two-car'}),clear=walkGeometry(p);
    for(const r of p.rooms){const pose=roomPose(p,r,clear,true);assert.ok(containsPoint(r.polygon,pose.x,pose.z),`${floor} ${r.id} outside room`);assert.ok(clear(pose.x,pose.z,true),`${floor} ${layout} ${r.id} starts on obstruction`);assert.ok(pose.eye>1.3&&pose.eye<p.clearHeight);}
  }
});
test('an open doorway permits walking while the adjacent window, wall and upper-floor void block it',()=>{
  const p=getInteriorPlan({floor:'first'}),clear=walkGeometry(p);
  const wall=p.walls.find(w=>w.id==='office-hall'),door=wall.openings[0];
  assert.equal(clear(wall.a[0]+door.offset+door.width/2,wall.a[1],false),true);
  assert.equal(clear(wall.a[0]+.1,wall.a[1],false),false);
  assert.equal(clear(6.44,6.43,false),false);
  assert.equal(clear(0,2.6,false),false);
});
