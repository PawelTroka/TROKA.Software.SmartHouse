import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {frontHedgeLayout,hedgeSegments,hedgeGroundAt,hedgeTopAt,terrainAt,screenOnRay,pointInPolygon} from '../src/geometry.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const other=JSON.parse(readFileSync(new URL('../data/korzeniowskiego-40.json',import.meta.url)));
const settings={siteId:'sternicza-11',hedgeFullPerimeter:true,hedgeRear:4,hedgeLeft:4,hedgeRight:4,hedgeFront:4,
  hedgeInset:.5,gardenRaise:.5,bedRaise:0,raiseNewHedges:true};
const close=(a,b,label='')=>assert.ok(Math.abs(a-b)<1e-8,`${label}: ${a} versus ${b}`);
const same=(a,b)=>{close(a[0],b[0]);close(a[1],b[1]);};
const length=s=>Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1]);
const mid=s=>[(s.a[0]+s.b[0])/2,(s.a[1]+s.b[1])/2];

test('full-perimeter thujas join every side edge from the street to the rear, preserving both access openings',()=>{
  const spans=hedgeSegments(settings,data),side=k=>spans.filter(s=>s.side===k);
  const left=side('left'),right=side('right'),rear=side('rear'),front=frontHedgeLayout(settings,data);
  assert.equal(left.length,3);assert.equal(right.length,4);assert.equal(rear.length,1);
  for(const path of [left,right])for(let i=1;i<path.length;i++)same(path[i-1].b,path[i].a);
  same(left.at(-1).b,rear[0].a);same(rear[0].b,right[0].a);
  same(right.at(-1).b,front.segments[0].a);
  same(left[0].a,front.openings.find(g=>g.id==='front-vehicle-opening').b);
  close(left[0].a[1],.5);close(right.at(-1).b[1],.5);
  assert.ok(spans.every(s=>pointInPolygon(s.a,data.site.boundary)&&pointInPolygon(s.b,data.site.boundary)));
  const expected={left:36.890267009460416,right:37.207341952230735,rear:19.057871814047626,front:14.115847219799406};
  for(const [name,value] of Object.entries(expected))close(side(name).reduce((sum,s)=>sum+length(s),0),value,name);
  close(spans.reduce((sum,s)=>sum+length(s),0),107.27132799553818,'Total planted perimeter');
  close(front.openings.reduce((sum,g)=>sum+g.width,0),5.2,'Unplanted entry widths');
  assert.deepEqual(front,frontHedgeLayout({...settings,hedgeFullPerimeter:false},data),'Extending side hedges must not close the gates');
});

test('front-side hedges keep original grade and rear segments have a sharp fill transition at the house',()=>{
  const raised={...settings,gardenRaise:1,bedRaise:.4},spans=hedgeSegments(raised,data);
  for(const span of spans){
    const original=span.side==='front'||span.groundZone==='front',rise=original?0:1.4;
    for(const [p,base,top] of [[span.a,span.baseA,span.topA],[span.b,span.baseB,span.topB]]){
      close(base,terrainAt(...p,data)+rise);
      close(top,base+4);
      close(hedgeGroundAt(...p,span.side,raised,data,span.groundZone),base);
      close(hedgeTopAt(...p,span.side,raised,data,span.groundZone),top);
    }
    const p=mid(span);
    close(hedgeGroundAt(...p,span.side,raised,data),terrainAt(...p,data)+rise,'Coordinate-based ray ground agrees inside each span');
  }
  for(const side of ['left','right']){
    const front=spans.find(s=>s.side===side&&s.groundZone==='front');
    const rear=spans.find(s=>s.side===side&&s.groundZone==='rear'&&[s.a,s.b].some(p=>Math.abs(p[1]-data.site.rearMidpoint[1])<1e-8));
    const p=[front.a,front.b].find(p=>Math.abs(p[1]-data.site.rearMidpoint[1])<1e-8);
    assert.ok([rear.a,rear.b].some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<1e-8));
    close(hedgeGroundAt(...p,side,raised,data,'rear')-hedgeGroundAt(...p,side,raised,data,'front'),1.4,'Fill stops at the join');
  }
});

test('new side screens block street-side lateral sightlines while gates remain see-through',()=>{
  for(const y of [3,9,15])for(const [side,x,targetX] of [['left',18,23],['right',2,-3]]){
    const z=terrainAt(x,y,data)+1.65;
    const hit=screenOnRay([x,y,z],[targetX,y,z],settings,data);
    assert.equal(hit?.side,side);assert.equal(hit.blocked,true);assert.equal(hit.blockMaterial,'foliage');
    close(hit.groundZ,terrainAt(hit.x,hit.y,data),'No raised front-side bed');
    assert.equal(screenOnRay([x,y,z],[targetX,y,z],{...settings,hedgeFullPerimeter:false},data),null,'The former rear-only side screen left this sightline open');
  }
  for(const opening of frontHedgeLayout(settings,data).openings){
    const xy=mid(opening),z=terrainAt(...xy,data)+1.65;
    assert.equal(screenOnRay([xy[0],5,z],[xy[0],-2,z],settings,data),null);
  }
  const independent=hedgeSegments({...settings,hedgeLeft:6,hedgeRight:2.5},data);
  assert.ok(independent.filter(s=>s.side==='left').every(s=>s.height===6));
  assert.ok(independent.filter(s=>s.side==='right').every(s=>s.height===2.5));
});

test('historical side lengths, rear grades and the second property retain their previous meaning',()=>{
  const legacy=hedgeSegments({...settings,hedgeFullPerimeter:false},data);
  const omitted={...settings};delete omitted.hedgeFullPerimeter;
  assert.deepEqual(hedgeSegments(omitted,data),legacy);
  close(legacy.filter(s=>s.side==='left').reduce((sum,s)=>sum+length(s),0),19.37518055725318);
  close(legacy.filter(s=>s.side==='right').reduce((sum,s)=>sum+length(s),0),19.69147870683997);
  const full=hedgeSegments(settings,data).filter(s=>s.side!=='front'&&s.groundZone==='rear').map(({groundZone,...s})=>s);
  assert.deepEqual(full,legacy.filter(s=>s.side!=='front'));
  const foreign={...settings,siteId:'korzeniowskiego-40'};
  assert.deepEqual(hedgeSegments(foreign,other),hedgeSegments({...foreign,hedgeFullPerimeter:false},other));
  const before=JSON.stringify(data),stateBefore=JSON.stringify(settings);
  hedgeSegments(settings,data);hedgeSegments(settings,data);
  assert.equal(JSON.stringify(data),before);assert.equal(JSON.stringify(settings),stateBefore);
});
