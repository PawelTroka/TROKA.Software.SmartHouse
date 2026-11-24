import test from 'node:test';
import assert from 'node:assert/strict';
import {cornerPavilionLayout,PAVILION_DEFAULTS,PAVILION_PLACEMENTS} from '../src/corner-pavilion.js';
import {firstPrivacyIntersection,privacyStructureLayout} from '../src/privacy-structures.js';
const data={site:{id:'sternicza-11'}};
const context={terrainAt:()=>2.5,groundAt:()=>3,floorZ:3.6};
const enabled={...PAVILION_DEFAULTS,pavilionEnabled:true};

test('corner pavilion is opt-in and only available on Sternicza',()=>{
  assert.equal(cornerPavilionLayout(PAVILION_DEFAULTS,data,context).enabled,false);
  assert.equal(cornerPavilionLayout(enabled,{site:{id:'nadmorska-17'}},context).enabled,false);
  assert.equal(cornerPavilionLayout(enabled,data,{groundAt:()=>3}).enabled,false,'Original terrain cannot be replaced by raised fill');
});

test('pavilion roof uses original grade while the pad follows proposed fill',()=>{
  const a=cornerPavilionLayout(enabled,data,{...context,groundAt:()=>2.5});
  const b=cornerPavilionLayout(enabled,data,context);
  assert.equal(a.topZ,9);assert.equal(b.topZ,9);
  assert.equal(b.floorZ-a.floorZ,.5);
  assert.equal(b.baseZ,2.5);assert.equal(b.height,6.5);
  const sloping=cornerPavilionLayout(enabled,data,{terrainAt:x=>2.5+(x-12.2)*.1,groundAt:x=>3+(x-12.2)*.1});
  assert.equal(sloping.baseZ,2.5);assert.equal(sloping.topZ,9);assert.equal(sloping.floorZ,3.62);
});

test('garden glazing remains transparent while rear walls and floors block rays',()=>{
  const p=cornerPavilionLayout(enabled,data,context),floor=p.storeys[0],z=floor.floorZ+1.2;
  const x=p.x+p.width/2,y=p.y+p.length/2,wy=y-.4;
  assert.equal(firstPrivacyIntersection([x,p.y-1,z],[x,p.y+1,z],p.boxes),null,'Front glass cannot count as an opaque wall');
  assert.equal(firstPrivacyIntersection([p.x-1,wy,z],[p.x+1,wy,z],p.boxes),null,'West glass cannot count as an opaque wall');
  assert.match(firstPrivacyIntersection([x,p.y-1,z],[x,p.y+p.length+1,z],p.boxes).id,/rear-wall/);
  assert.match(firstPrivacyIntersection([p.x-1,wy,z],[p.x+p.width+1,wy,z],p.boxes).id,/east-wall/);
  assert.equal(p.storeys.length,2);
  const upper=p.storeys[1];
  assert.match(firstPrivacyIntersection([x,y,upper.floorZ-.3],[x,y,upper.floorZ+.3],p.boxes).id,/slab/);
  assert.ok(p.glazing.length>=5);
  const door=p.glazing.find(g=>g.kind==='door');
  assert.ok(door);assert.equal(door.bottomZ,p.floorZ);
  const doorX=(p.entry.doorX0+p.entry.doorX1)/2;
  assert.equal(firstPrivacyIntersection([doorX,p.y-.1,p.floorZ+.05],[doorX,p.y+.3,p.floorZ+.05],p.boxes),null,'Door has no opaque sill');
  assert.ok(p.entry.doorWidth>=1);assert.ok(p.entry.riserHeight<=.18+1e-8);
  assert.ok(p.boxes.some(b=>b.id==='pavilion-entry-landing'));
  assert.ok(p.glazing.every(g=>g.opaque===false));
});

test('all opaque pavilion boxes are shared with privacy layout and remain within its footprint',()=>{
  const p=cornerPavilionLayout(enabled,data,context);
  const q=privacyStructureLayout(enabled,data,context);
  assert.deepEqual(q.pavilion,p);
  assert.deepEqual(q.boxes,p.boxes);
  assert.deepEqual(q.footprints,p.footprints);
  assert.ok(q.enabled);
  for(const b of p.boxes){
    assert.equal(b.group,'pavilion');assert.equal(b.opaque,true);
    assert.ok(b.x0>=p.x-1e-9&&b.x1<=p.x+p.width+1e-9);
    assert.ok(b.y0>=(b.part==='entry'?p.entry.outerY:p.y)-1e-9&&b.y1<=p.y+p.length+1e-9);
    assert.ok(b.z1<=p.topZ+1e-9);
  }
});

test('pavilion study dimensions clamp nonfinite values and reject a pad at the roof',()=>{
  const p=cornerPavilionLayout({...enabled,pavilionHeight:Infinity,pavilionWidth:100},data,context);
  assert.equal(p.height,6.5);assert.equal(p.width,8);
  const buried=cornerPavilionLayout(enabled,data,{...context,groundAt:()=>9});
  assert.equal(buried.enabled,false);assert.equal(buried.boxes.length,0);
  assert.match(buried.warnings[0],/pad reaches/);
});

test('the two placements express separate corner and nearer-house comparisons',()=>{
  assert.equal(PAVILION_PLACEMENTS.length,2);
  const rear=cornerPavilionLayout({...enabled,...PAVILION_PLACEMENTS[0].settings},data,context);
  const near=cornerPavilionLayout({...enabled,...PAVILION_PLACEMENTS[1].settings},data,context);
  assert.equal(rear.width*rear.length,29);
  assert.ok(Math.abs(near.width*near.length-30.16)<1e-9);
  assert.ok(near.y<rear.y);
  assert.equal(near.topZ,rear.topZ,'Placement does not invent a different height policy');
});

test('roof envelope diagnostic separates height from rays missing the footprint',async()=>{
  const {pavilionRoofEnvelopeStudy}=await import('../src/corner-pavilion.js');
  const p=cornerPavilionLayout({...enabled,pavilionX:10,pavilionY:20,pavilionWidth:5,pavilionDepth:5},data,context);
  const observer=[0,0,2];
  const result=pavilionRoofEnvelopeStudy(observer,[[20,40,22],[1,40,22]],p);
  assert.equal(result.total,2);assert.equal(result.intercepted,1);assert.equal(result.missed,1);
  assert.equal(result.planCoveragePercent,50);
  assert.equal(result.requiredHeightForIntercepted,9.5);
  assert.equal(result.requiredHeightForAll,null,'No finite height can catch a plan ray that misses the building');
  assert.equal(pavilionRoofEnvelopeStudy([12,22,5],[[20,40,22]],p).status,'inside-footprint');
});

test('both reference placements and their entrance pads clear the fixed alternative spa and 4m terrace',async()=>{
  const fs=await import('node:fs');
  const {getSiteProfile}=await import('../src/sites.js');
  const {DEFAULT_SETTINGS,privacyStructures}=await import('../src/geometry.js');
  const {gardenProgram}=await import('../src/garden-program.js');
  const {overlapArea}=await import('../src/footprint-fit.js');
  const mapped=JSON.parse(fs.readFileSync(new URL('../data/site-data.json',import.meta.url)));
  const rect=r=>[[r.x,r.y],[r.x+r.width,r.y],[r.x+r.width,r.y+r.length],[r.x,r.y+r.length],[r.x,r.y]];
  for(const placement of PAVILION_PLACEMENTS){
    const s={...DEFAULT_SETTINGS,...getSiteProfile('sternicza-11',mapped).defaults,...enabled,...placement.settings,terraceWidth:10.77,terraceDepth:4};
    const layout=privacyStructures(s,mapped),program=gardenProgram(s,mapped),pool=program.pool;
    const obstacles=[
      ['terrace',rect({x:mapped.site.rearMidpoint[0]-s.terraceWidth/2,y:mapped.site.rearMidpoint[1],width:s.terraceWidth,length:s.terraceDepth})],
      ['pool coping',rect({x:pool.x-pool.coping,y:pool.y-pool.coping,width:pool.width+2*pool.coping,length:pool.length+2*pool.coping})],
      ['firepit coping',program.firepit.outerFootprint],['sauna',program.sauna.footprint],
      ['cold plunge',program.coldPlunge.footprint],
    ];
    for(const foot of layout.pavilion.footprints)for(const [name,obstacle] of obstacles){
      assert.ok(overlapArea(rect(foot),obstacle)<1e-8,placement.id+' '+foot.label+' overlaps '+name);
    }
    assert.ok(layout.pavilion.entry.riserHeight<=.18+1e-8);
  }
});
