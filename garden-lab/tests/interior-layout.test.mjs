import test from 'node:test';
import assert from 'node:assert/strict';
import {getInteriorPlan, getInteriorGarageConflicts} from '../src/interior-plan.js';
import {fixturePlanFrame} from '../src/interior-plan-view.js';
import {INTERIOR_COMPOSITIONS} from '../src/interior-curation.js';
import {getHouseFloorPlan} from '../src/house-model.js';

const proposal=floor=>getInteriorPlan({floor,layout:'renovation'});
const near=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<tol,`${a} vs ${b}`);
const solidFixtures=plan=>plan.fixtures.filter(f=>!f.wallMounted&&!f.hostId&&!f.nonBlocking);
const contains=(polygon,x,z)=>{
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const [ax,az]=polygon[i],[bx,bz]=polygon[j];
    if((az>z)!==(bz>z)&&x<(bx-ax)*(z-az)/(bz-az)+ax)inside=!inside;
  }
  return inside;
};
const segmentDistance=(x,z,a,b)=>{
  const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
  return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);
};
const polygonDistance=(x,z,p)=>Math.min(...p.map((a,i)=>segmentDistance(x,z,a,p[(i+1)%p.length])));
const rectDistance=(x,z,left,top,right,bottom)=>Math.hypot(Math.max(left-x,0,x-right),Math.max(top-z,0,z-bottom));

test('every renovated kitchen shares a connected peninsula and a wider refrigerator-side entrance',()=>{
  for(const styleId of Object.keys(INTERIOR_COMPOSITIONS)){
    const plan=getInteriorPlan({floor:'ground',layout:'renovation',styleId});
    const hallWall=plan.walls.find(w=>w.id==='kitchen-hall-enclosure');
    assert.ok(hallWall,styleId);assert.deepEqual(hallWall.openings,[],`${styleId}: kitchen is enclosed from the entry hall`);
    const wall=plan.walls.find(w=>w.id==='kitchen-living-opening'),opening=wall.openings;
    assert.equal(opening.length,1);assert.equal(opening[0].type,'passage');near(opening[0].width,3.65);
    for(const id of ['west-counter','street-counter','east-counter','kitchen-fridge','kitchen-fridge-top','kitchen-wall-storage']){
      assert.ok(plan.fixtures.some(f=>f.id===id),`${styleId}: missing ${id}`);
    }
    const pantry=plan.fixtures.find(f=>f.id==='east-counter');assert.equal(pantry.kind,'storage');assert.ok(pantry.height>=2.4);
    for(const id of ['kitchen-north-storage','kitchen-worktable','dining-console'])assert.ok(!plan.fixtures.some(f=>f.id===id),`${styleId}: ${id} obstructs the open edge`);
    const islands=plan.fixtures.filter(f=>f.id==='kitchen-island');assert.equal(islands.length,1);
    const island=islands[0];assert.equal(island.kind,'counter');assert.ok(island.drawers);
    near(island.width,2.20);near(island.depth,.85);assert.ok(island.height<=.92);
    const start=wall.a[0]+opening[0].offset,end=start+opening[0].width;
    const sinkRun=plan.fixtures.find(f=>f.id==='west-counter'),enclosure=plan.cores.find(c=>c.id==='west-flue').enclosure;
    near(island.x-island.width/2,start);near(sinkRun.x-sinkRun.width/2,start);
    near(sinkRun.z-sinkRun.depth/2,island.z+island.depth/2);
    assert.equal(island.joinedCounter,sinkRun.id);assert.equal(sinkRun.joinedCounter,island.id);
    assert.deepEqual(island.waterfallEnds,[1],'the connected end has no stone divider');
    near(Math.min(...enclosure.polygon.map(p=>p[0]))-(island.x+island.width/2),1.18);
    assert.ok(end-island.x-island.width/2>=1.4,`${styleId}: free end narrows the architectural opening`);
    assert.ok(island.z-island.depth/2<wall.a[1]&&island.z+island.depth/2>wall.a[1],`${styleId}: island belongs at the living edge`);
    const tallAtOpening=plan.fixtures.filter(f=>f.roomId==='front-kitchen'&&!f.wallMounted&&f.height>1.2&&f.z-f.depth/2<5.85);
    assert.deepEqual(tallAtOpening,[],`${styleId}: tall cabinet blocks the living-room connection`);
  }
});

test('all renovation styles keep one side-garden window centered over the sink and preserve the rear HST',()=>{
  for(const styleId of Object.keys(INTERIOR_COMPOSITIONS)){
    const plan=getHouseFloorPlan({settings:{designStyle:styleId}}),sink=plan.fixtures.find(f=>f.id==='kitchen-sink');
    const windows=plan.walls.flatMap(w=>w.openings.filter(o=>o.type==='window'&&o.roomId==='front-kitchen').map(o=>({wall:w,opening:o})));
    assert.equal(windows.length,1,styleId+' has one kitchen window');
    const {wall,opening}=windows[0];assert.equal(wall.id,'left-facade');assert.equal(opening.outlook,'side-garden');
    near(wall.a[1]+opening.offset+opening.width/2,sink.z);near(opening.width,1.42);
    assert.equal(opening.panes,1);assert.equal(opening.transoms,0);assert.ok(opening.sill>1);
    const host=plan.fixtures.find(f=>f.id===sink.hostId);
    assert.ok(sink.x-sink.width/2>=host.x-host.width/2&&sink.x+sink.width/2<=host.x+host.width/2);
    assert.ok(sink.z-sink.depth/2>=host.z-host.depth/2&&sink.z+sink.depth/2<=host.z+host.depth/2);
    const cabinets=plan.fixtures.filter(f=>f.roomId==='front-kitchen'&&(f.wallMounted||f.height>1.2));
    for(const cabinet of cabinets)assert.ok(cabinet.x-cabinet.width/2>1||cabinet.z+cabinet.depth/2<=wall.a[1]+opening.offset||cabinet.z-cabinet.depth/2>=wall.a[1]+opening.offset+opening.width||
      (cabinet.baseHeight||0)>=opening.sill+opening.height||((cabinet.baseHeight||0)+(cabinet.height||0))<=opening.sill,styleId+' cabinet covers the sink window');
    const street=plan.walls.find(w=>w.id==='street-facade');
    assert.ok(street.openings.every(o=>o.type!=='window'||street.a[0]+o.offset>=4.47),styleId+' retains an unwanted street kitchen window');
    const hst=plan.walls.find(w=>w.id==='garden-hst').openings;
    assert.equal(hst.length,1);assert.equal(hst[0].type,'hst');assert.equal(hst[0].panes,3);assert.ok(hst[0].width>10);
  }
  const existing=getInteriorPlan({layout:'existing'});
  const street=existing.walls.find(w=>w.id==='street-facade'),side=existing.walls.find(w=>w.id==='left-facade');
  assert.ok(street.openings.some(o=>o.type==='window'&&Math.abs(street.a[0]+o.offset-1.86)<1e-7),'the archived street kitchen window stays on its drawing');
  assert.ok(side.openings.some(o=>o.type==='window'&&Math.abs(side.a[1]+o.offset-5.65)<1e-7),'the archived side kitchen window stays on its drawing');
});

// A conservative physical walking check: a 0.60 m diameter disc must travel
// around actual fixture footprints, stair voids, retained flues, wall jambs,
// and fully open door leaves. This tests walking with the doors fully open;
// the sweep test below separately keeps furniture out of their swing sectors.
// Wall rectangles have square ends, matching the model's actual door jambs.
function circulation(plan,start,radius=.30){
  const shapes=[],leaves=[];
  for(const w of plan.walls){
    const dx=w.b[0]-w.a[0],dz=w.b[1]-w.a[1],length=Math.hypot(dx,dz),ux=dx/length,uz=dz/length;
    const traversable=w.openings.filter(o=>['door','passage','balcony-door','hst'].includes(o.type));
    let from=0;
    const part=(lo,hi)=>{
      if(hi<=lo)return;
      shapes.push((x,z)=>{
        const rx=x-w.a[0],rz=z-w.a[1],along=rx*ux+rz*uz,normal=-rx*uz+rz*ux;
        return Math.hypot(Math.max(lo-along,0,along-hi),Math.max(Math.abs(normal)-w.thickness/2,0));
      });
    };
    for(const o of traversable){
      part(from,o.offset);from=o.offset+o.width;
      if(o.type==='door'||o.type==='balcony-door'){
        const t=o.offset+(o.hinge==='end'?o.width:0),hinge=[w.a[0]+t*ux,w.a[1]+t*uz];
        const swing=o.swing===-1?-1:1,end=[hinge[0]-uz*o.width*swing,hinge[1]+ux*o.width*swing];
        leaves.push((x,z)=>segmentDistance(x,z,hinge,end)-.02);
      }
    }
    part(from,length);
  }
  for(const f of solidFixtures(plan)){
    // The table footprint describes its top; renderer chairs project .50 m
    // beyond the two long sides and must be included in the walking envelope.
    const chair=f.kind==='diningTable'?.50:0;
    shapes.push((x,z)=>rectDistance(x,z,f.x-f.width/2,f.z-f.depth/2-chair,f.x+f.width/2,f.z+f.depth/2+chair));
  }
  const polygons=[...plan.voids,...plan.cores.map(c=>c.enclosure?.polygon||c.polygon)];
  const blocked=(x,z)=>!contains(plan.envelope.outline,x,z)||polygonDistance(x,z,plan.envelope.outline)<radius-1e-8||
    polygons.some(p=>contains(p,x,z)||polygonDistance(x,z,p)<radius-1e-8)||
    shapes.some(distance=>distance(x,z)<radius-1e-8)||leaves.some(distance=>distance(x,z)<radius-1e-8);
  const step=.03,nx=Math.ceil(plan.envelope.width/step)+1,nz=Math.ceil(10.68/step)+1;
  const state=new Uint8Array(nx*nz),queue=[];
  const first=Math.round(start[1]/step)*nx+Math.round(start[0]/step);
  assert.equal(blocked((first%nx)*step,Math.floor(first/nx)*step),false,'circulation start is obstructed');
  state[first]=2;queue.push(first);
  for(let i=0;i<queue.length;i++){
    const index=queue[i],c=index%nx,r=Math.floor(index/nx);
    for(const [col,row] of [[c-1,r],[c+1,r],[c,r-1],[c,r+1]]){
      if(col<0||row<0||col>=nx||row>=nz)continue;
      const next=row*nx+col;if(state[next])continue;
      if(blocked(col*step,row*step)){state[next]=1;continue;}
      state[next]=2;queue.push(next);
    }
  }
  return point=>{
    const col=Math.round(point[0]/step),row=Math.round(point[1]/step);
    // A target on an exact 0.60 m boundary may fall between grid coordinates.
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
      if(Math.hypot((col+dx)*step-point[0],(row+dz)*step-point[1])<=.045&&state[(row+dz)*nx+col+dx]===2)return true;
    }
    return false;
  };
}

test('bathroom brief is fitted at real fixture dimensions without a duplicate upper bath',()=>{
  const ground=proposal('ground'),first=proposal('first'),byId=(p,id)=>p.fixtures.find(f=>f.id===id);
  const tub=byId(ground,'ground-tub'),spa=byId(first,'spa-jets');
  assert.equal(tub.kind,'tub');assert.equal(tub.variant,'soaking');near(tub.width,.88);near(tub.depth,1.78);near(tub.height,.68);
  assert.equal(byId(ground,'ground-basin').basins,2);assert.equal(ground.fixtures.filter(f=>f.kind==='bidet').length,1);
  assert.equal(first.fixtures.filter(f=>f.kind==='tub').length,1);
  assert.equal(first.fixtures.filter(f=>f.kind==='hotTub'||f.kind==='bidet'||f.kind==='spaStep').length,0);
  near(spa.width,.90);near(spa.depth,1.80);near(spa.height,.62);assert.equal(spa.variant,'whirlpool');
  for(const flag of ['jets','hydromassage'])assert.equal(spa[flag],true);assert.equal(spa.lights,false);
  assert.equal(byId(first,'spa-vanity').basins,1);
  const shower=byId(first,'spa-shower');assert.equal(shower.heads,2);near(shower.width,1.20);near(shower.depth,1.62);
  near(first.rooms.find(r=>r.id==='spa-bath').area,11.83);near(first.rooms.find(r=>r.id==='sauna').area,1.66);
  assert.ok(first.walls.some(w=>w.id==='spa-stair-privacy'&&w.openings.every(o=>o.type!=='window')));
  const original=getInteriorPlan({floor:'first',layout:'existing'});
  assert.equal(original.fixtures.filter(f=>f.kind==='tub').length,1);
  assert.ok(original.walls.find(w=>w.id==='kitchen-stair').openings.some(o=>o.type==='window'));
});

test('physical furniture footprints do not intersect each other after the room rearrangements',()=>{
  for(const floor of ['ground','first']){
    const items=solidFixtures(proposal(floor));
    for(const [i,a] of items.entries())for(const b of items.slice(i+1)){
      const dx=(a.width+b.width)/2-Math.abs(a.x-b.x),dz=(a.depth+b.depth)/2-Math.abs(a.z-b.z);
      assert.ok(dx<=1e-7||dz<=1e-7,`${floor}: ${a.id} intersects ${b.id}`);
    }
  }
});

test('interior doors can open fully without their swept leaf intersecting furniture',()=>{
  for(const floor of ['ground','first']){
    const plan=proposal(floor);
    for(const w of plan.walls)for(const o of w.openings.filter(o=>o.type==='door')){
      const length=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]),ux=(w.b[0]-w.a[0])/length,uz=(w.b[1]-w.a[1])/length;
      const end=o.hinge==='end',t=o.offset+(end?o.width:0),hx=w.a[0]+t*ux,hz=w.a[1]+t*uz;
      const side=end?-1:1,swing=o.swing===-1?-1:1;
      for(let i=0;i<=24;i++){
        const a=i*Math.PI/48;
        for(let j=1;j<=24;j++){
          const r=(o.width-.10)*j/24,x=hx+ux*side*Math.cos(a)*r-uz*swing*Math.sin(a)*r,
            z=hz+uz*side*Math.cos(a)*r+ux*swing*Math.sin(a)*r;
          for(const f of solidFixtures(plan))assert.ok(rectDistance(x,z,f.x-f.width/2,f.z-f.depth/2,f.x+f.width/2,f.z+f.depth/2)>=.018,`${floor}: ${w.id} door strikes ${f.id}`);
        }
      }
    }
  }
});

test('0.60 m routes reach both bathrooms and their individual usable fixture approaches',()=>{
  for(const [floor,start,roomId] of [['ground',[5.3,4.4],'bathroom'],['first',[5.4,4.4],'spa-bath']]){
    const plan=proposal(floor),reached=circulation(plan,start);
    for(const f of plan.fixtures.filter(f=>f.roomId===roomId)){
      for(const point of f.approaches||(f.approach?[f.approach]:[]))assert.ok(reached(point),`${floor}: ${f.id} approach ${point} is disconnected`);
    }
  }
});

test('upper floor furniture leaves a 0.60 m route from the landing to every proposed room',()=>{
  const plan=proposal('first'),reached=circulation(plan,[5.4,4.4]);
  const points={master:[2.10,2.0],office:[6.1,2.8],'guest-1':[9.00,2.20],'guest-2':[2.90,6.50],
    'guest-3':[2.90,8.30],wardrobe:[5.30,9.80],'spa-bath':[8.55,7.40],sauna:[9.60,4.38]};
  const disconnected=[];
  for(const [id,point] of Object.entries(points)){
    assert.ok(contains(plan.rooms.find(r=>r.id===id).polygon,...point));
    if(!reached(point))disconnected.push(id);
  }
  assert.deepEqual(disconnected,[],'rooms cut off by furnishings or open doors');
});

test('plan symbols preserve world footprints and the same facing direction as 3D furniture',()=>{
  for(const p of [proposal('ground'),proposal('first')])for(const f of p.fixtures){
    assert.equal(f.rotation,0,f.id+' must keep an axis-aligned physical footprint');
    const frame=fixturePlanFrame(f),c=Math.cos(frame.rotation),s=Math.sin(frame.rotation);
    near(Math.abs(c)*frame.width+Math.abs(s)*frame.depth,f.width);
    near(Math.abs(s)*frame.width+Math.abs(c)*frame.depth,f.depth);
    const expected=f.headboard?f.headboard.map(n=>-n):f.front;
    if(expected){const actual=f.shape==='U'?[c,-s]:[s,c];near(actual[0],expected[0]);near(actual[1],expected[1]);}
  }
  const p=proposal('first'),desk=p.fixtures.find(f=>f.id==='office-desk'),chair=p.fixtures.find(f=>f.id==='office-chair');
  assert.ok((desk.x-chair.x)*chair.front[0]+(desk.z-chair.z)*chair.front[1]>0,'chair faces the screen');
  assert.deepEqual(p.fixtures.find(f=>f.id==='master-bed').headboard,[0,1]);
  assert.deepEqual(p.fixtures.find(f=>f.id==='master-storage').front,[-1,0]);
});

test('bay wardrobe banks and low bedroom headboard preserve the existing window apertures',()=>{
  const p=proposal('first'),banks=p.fixtures.filter(f=>f.roomId==='wardrobe');
  for(const f of banks){
    assert.ok(f.z+f.depth/2<9.39,'full-height wardrobe does not cover the side glazing');
    assert.ok(f.x+f.width/2<=4.80||f.x-f.width/2>=5.60,'wardrobe does not cover its entry door');
  }
  assert.ok(p.fixtures.find(f=>f.id==='guest2-bed').headboardMaxHeight<.80);
  const mirror=p.fixtures.find(f=>f.id==='spa-mirror');assert.ok(mirror.z-mirror.depth/2>6.85);
  const ground=proposal('ground');assert.ok(ground.fixtures.find(f=>f.id==='ground-wc').x-.23>8.82);
  assert.deepEqual(ground.fixtures.find(f=>f.id==='ground-shower').headWall,[0,-1]);
});

test('registered garage bounds move the portal, lining, cars and core conflicts together',()=>{
  const settings={garageRampWidth:5.8,architecturalGarageBounds:{x0:.60,x1:6.40}};
  const p=getInteriorPlan({floor:'basement',layout:'renovation',garageVariant:'two-car',garageSettings:settings});
  near(p.garage.x0,.60);near(p.garage.x1,6.40);
  const portal=p.walls.find(w=>w.id==='garage-portal'),opening=portal.openings[0];
  near(portal.a[0]+opening.offset,.60);near(opening.width,5.80);
  near(p.walls.find(w=>w.id==='garage-right-lining').a[0],6.50);
  near(p.fixtures.find(f=>f.id==='car-1').x,2.05);near(p.fixtures.find(f=>f.id==='car-2').x,4.95);
  assert.deepEqual(p.conflicts,getInteriorGarageConflicts(settings));
  assert.ok(p.conflicts.some(c=>c.id==='cellar-stair'&&c.polygon[1][0]===6.40));
  assert.throws(()=>getInteriorGarageConflicts({garageRampWidth:5.8,architecturalGarageBounds:{x0:1,x1:6}}),RangeError);
});

test('all resort arrangements retain free floor area, fixture approaches and room access',()=>{
  const targets={ground:[[2.75,3.9],[2.4,6.6],[5.35,2],[8.1,1.1]],
    first:[[2.10,2.0],[6.1,2.8],[9,2.2],[2.9,6.5],[2.9,8.3],[5.3,9.8],[8.55,7.40],[9.6,4.38]]};
  for(const styleId of Object.keys(INTERIOR_COMPOSITIONS))for(const floor of ['ground','first']){
    const plan=getInteriorPlan({floor,styleId}),items=solidFixtures(plan),reached=circulation(plan,floor==='ground'?[5.3,4.4]:[5.4,4.4]);
    for(const [i,a] of items.entries())for(const b of items.slice(i+1)){
      const dx=(a.width+b.width)/2-Math.abs(a.x-b.x),dz=(a.depth+b.depth)/2-Math.abs(a.z-b.z);
      assert.ok(dx<=1e-7||dz<=1e-7,`${styleId} ${floor}: ${a.id} intersects ${b.id}`);
    }
    const roomTargets=targets[floor].map(point=>point.slice());
    if(floor==='ground'){
      const island=plan.fixtures.find(f=>f.id==='kitchen-island');
      roomTargets[1]=[island.x+island.width/2+.45,island.z];
    }else if(plan.furnishingConcept?.office==='floating'){
      const chair=plan.fixtures.find(f=>f.id==='office-chair');roomTargets[1]=[chair.x-chair.width/2-.35,chair.z];
    }
    for(const point of roomTargets)assert.ok(reached(point),`${styleId} ${floor}: room route ${point} disconnected`);
    for(const f of plan.fixtures)for(const point of f.approaches||(f.approach?[f.approach]:[]))assert.ok(reached(point),`${styleId} ${f.id}: fixture approach ${point} disconnected`);
    for(const w of plan.walls)for(const o of w.openings.filter(o=>o.type==='door')){
      const length=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]),ux=(w.b[0]-w.a[0])/length,uz=(w.b[1]-w.a[1])/length;
      const end=o.hinge==='end',t=o.offset+(end?o.width:0),hx=w.a[0]+t*ux,hz=w.a[1]+t*uz,side=end?-1:1,swing=o.swing===-1?-1:1;
      for(let i=0;i<=24;i++)for(let j=1;j<=24;j++){
        const a=i*Math.PI/48,r=(o.width-.10)*j/24,x=hx+ux*side*Math.cos(a)*r-uz*swing*Math.sin(a)*r,z=hz+uz*side*Math.cos(a)*r+ux*swing*Math.sin(a)*r;
        for(const f of items)assert.ok(rectDistance(x,z,f.x-f.width/2,f.z-f.depth/2,f.x+f.width/2,f.z+f.depth/2)>=.018,`${styleId} ${floor}: ${w.id} door strikes ${f.id}`);
      }
    }
  }
});
