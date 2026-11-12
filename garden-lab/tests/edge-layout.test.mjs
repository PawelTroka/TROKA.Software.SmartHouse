import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {gardenProgram,poolBounds,spaEnabled} from '../src/garden-program.js';
import {gardenGroundAt,pointInPolygon,spaLevels,spaSurfaceAt,spaLayoutWarnings,jacuzziBounds,
  observerForPreset,saunaIntersection,segmentIntersection} from '../src/geometry.js';
import {rectCorners,rectanglesOverlap} from '../src/layout.js';
import {createSpaAmenityGroup} from '../src/scene-spa.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const other=JSON.parse(readFileSync(new URL('../data/korzeniowskiego-40.json',import.meta.url)));
const settings={siteId:'sternicza-11',gardenProgram:'spa-edge',gardenRaise:.5,floorHeight:1.2,
  terraceDepth:4.2,removeGarage:true};
const near=(a,b,epsilon=1e-7)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
const pointDistance=(p,a,b)=>{
  const dx=b[0]-a[0],dy=b[1]-a[1];
  const u=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));
  return Math.hypot(p[0]-a[0]-dx*u,p[1]-a[1]-dy*u);
};
// Check whole segments in both directions: the plot's inward east-side kink
// sits between pool corners, so a corner-only distance misses the closest gap.
const segmentDistance=(a,b,c,d)=>segmentIntersection(a,b,c,d)?0:Math.min(
  pointDistance(a,c,d),pointDistance(b,c,d),pointDistance(c,a,b),pointDistance(d,a,b));
const boundaryGap=(ring,side)=>{
  const footprint=ring.length>1&&Math.hypot(ring[0][0]-ring.at(-1)[0],ring[0][1]-ring.at(-1)[1])<1e-8?ring.slice(0,-1):ring;
  const distances=[];
  for(let i=0;i<footprint.length;i++)for(let j=0;j<data.site.boundary.length-1;j++){
    if(data.site.boundaryNames[j].startsWith(side))distances.push(segmentDistance(
      footprint[i],footprint[(i+1)%footprint.length],data.site.boundary[j],data.site.boundary[j+1]));
  }
  return Math.min(...distances);
};
const meshBounds=object=>{object.updateWorldMatrix(true,true);return new THREE.Box3().setFromObject(object);};
const material=new THREE.MeshBasicMaterial();
const materials=Object.fromEntries(['stone','stoneLight','wood','woodLight','metal','basin','linen','waterLight',
  'plinth','treeBark','gold','spaGlow','fireGlow','glass'].map(k=>[k,material]));

test('edge arrangement is explicit and does not rewrite saved spa or other-property geometry',()=>{
  const old={...settings,gardenProgram:'spa'},classic={...settings,gardenProgram:'classic'};
  assert.ok(spaEnabled(settings,data));assert.ok(spaEnabled(old,data));
  assert.equal(gardenProgram(settings,data).id,'spa-edge');
  const previous=gardenProgram(old,data);
  assert.equal(previous.id,'spa');
  assert.deepEqual([previous.pool.x,previous.pool.y,previous.sauna.x,previous.sauna.y,
    previous.coldPlunge.x,previous.coldPlunge.y],[14.7,24.5,3.3,30.5,8.3,33.2]);
  assert.deepEqual(previous.coldPlunge.steps,[{x:8.3,y:32.6,width:1,length:.3,height:.25},
    {x:8.3,y:32.9,width:1,length:.3,height:.5}]);
  assert.deepEqual(previous.furniture.path,[[7.1,29.5],[8.1,31.5],[11.3,32.6],[11.5,34.3]]);
  assert.equal(previous.sauna.entrySteps,undefined);
  assert.equal(gardenProgram(classic,data).active,false);
  for(const key of ['x','y','width','length'])assert.equal(poolBounds(classic,data)[key],data.site.pool[key]);
  assert.equal(gardenProgram(settings,other).active,false);
  for(const key of ['x','y','width','length'])assert.equal(poolBounds(settings,other)[key],other.site.pool[key]);
});

test('edge objects stay inside the mapped polygon with measured outer-edge gaps',()=>{
  const p=gardenProgram(settings,data),pool=rectCorners(p.pool,p.pool.coping),plunge=rectCorners(p.coldPlunge,p.coldPlunge.pad);
  for(const ring of [pool,plunge,p.sauna.footprint,...p.sauna.entrySteps.map(s=>s.footprint)]){
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length];
      for(let t=0;t<=1;t+=.1)assert.ok(pointInPolygon([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])],data.site.boundary));
    }
  }
  near(boundaryGap(pool,'east'),.8228989108411519,1e-6);
  near(boundaryGap(p.sauna.footprint,'west'),1.0919262422537939);
  near(boundaryGap(p.sauna.footprint,'rear'),1.0764704450293583);
  near(boundaryGap(plunge,'rear'),1.039668539453122);
  assert.ok(boundaryGap(p.sauna.footprint,'rear')<1.1,'Sauna is now tucked into the rear corner');
  assert.ok(spaLayoutWarnings(settings,data).some(w=>w.includes('conceptual clearances')&&w.includes('sauna')));
});

test('raised hedge-bed conflicts are reported only where the bed reaches a nearby finished surface',()=>{
  const matching=state=>spaLayoutWarnings(state,data).filter(w=>w.startsWith('Raised hedge beds'));
  assert.deepEqual(matching({...settings,hedgeInset:.5,bedRaise:0}),[]);
  const raised={...settings,gardenRaise:0,hedgeInset:.5,bedRaise:.5};
  const warnings=matching(raised);
  assert.equal(warnings.length,1);
  for(const object of ['pool coping','sauna floor','cold-plunge pad'])assert.ok(warnings[0].includes(object),object);
  // Moving the narrow bed back to the actual boundary leaves these pads clear;
  // it should not produce an unconditional warning for every nonzero bed.
  assert.deepEqual(matching({...raised,hedgeInset:0}),[]);
  assert.deepEqual(matching({...raised,gardenProgram:'spa'}),[],'Historical spa layout remains unchanged');
});

test('the expanded inner route stays clear of pool coping, sunken lounge and amenity access',()=>{
  const p=gardenProgram(settings,data),objects=[p.pool,p.sauna,p.firepit,p.coldPlunge,p.furniture.dining];
  for(let i=0;i<objects.length;i++)for(let j=i+1;j<objects.length;j++)assert.equal(rectanglesOverlap(objects[i],objects[j]),false);
  near(p.pool.x-p.pool.coping-(p.firepit.x+p.firepit.width+p.firepit.copingOverhang),2.54);
  for(const [x,y] of p.furniture.path){
    const stone={x,y,width:1.15,length:.9};
    for(const obstacle of [p.sauna,p.firepit,p.coldPlunge,...p.coldPlunge.steps])assert.equal(rectanglesOverlap(stone,obstacle,.02),false,'A path stone must not bridge an object or its access steps');
  }
  for(const step of p.coldPlunge.steps){
    for(const object of [p.pool,p.sauna,p.firepit])assert.equal(rectanglesOverlap(step,object,.02),false);
    for(const corner of rectCorners(step))assert.ok(pointInPolygon(corner,data.site.boundary));
  }
  // Explicitly retain the existing walkable garden preset between the lounge
  // and the reserved rear screening-tree band.
  const eye=observerForPreset('garden',settings,data);
  for(const object of objects)assert.equal(pointInPolygon([eye.x,eye.y],object.footprint||rectCorners(object)),false);
});

test('rear corner pads clear the actual uneven grade and keep their skirts grounded',()=>{
  const p=gardenProgram(settings,data),levels=spaLevels(settings,data);
  for(const [object,z,padding,top] of [[p.sauna,levels.sauna,0,levels.sauna.floorZ],
    [p.coldPlunge,levels.coldPlunge,p.coldPlunge.pad,levels.coldPlunge.baseZ+.02],
    [p.pool,levels.pool,p.pool.coping,levels.pool.copingTopZ]]){
    const x0=object.x-padding,y0=object.y-padding,w=object.width+2*padding,l=object.length+2*padding;
    for(let ix=0;ix<=57;ix++)for(let iy=0;iy<=63;iy++){
      const x=x0+w*ix/57,y=y0+l*iy/63;
      if(object===p.sauna&&!pointInPolygon([x,y],object.footprint))continue;
      const grade=gardenGroundAt(x,y,settings,data);
      assert.ok(top>grade+.015,'A level pad must not disappear into uphill soil');
      assert.ok((z.padBaseZ??z.copingBaseZ)<grade-.05,'Its skirt must meet the downhill grade');
    }
  }
  const raised=spaLevels({...settings,gardenRaise:.8},data);
  for(const object of ['sauna','coldPlunge']){
    near(raised[object].groundZ-levels[object].groundZ,.3);
    near(raised[object].entryGroundZ-levels[object].entryGroundZ,.3);
    near(raised[object].entryRiser,levels[object].entryRiser);
  }
});

test('sauna and plunge access treads use measured approach heights in model and rendering',()=>{
  const p=gardenProgram(settings,data),levels=spaLevels(settings,data);
  assert.equal(levels.sauna.entrySteps.length,2);assert.equal(levels.coldPlunge.steps.length,5);
  for(const [name,steps,level,finish] of [
    ['sauna',levels.sauna.entrySteps,levels.sauna,levels.sauna.floorZ],
    ['plunge',levels.coldPlunge.steps,levels.coldPlunge,levels.coldPlunge.rimZ]]){
    assert.ok(level.entryRiser>.1&&level.entryRiser<=.18,'Grade changes need plausible illustrated risers');
    let previous=level.entryGroundZ;
    for(const step of steps){near(step.topZ-previous,level.entryRiser);previous=step.topZ;assert.ok(step.topZ>step.baseZ);}
    near(finish-previous,level.entryRiser);
    for(const step of steps){
      const ring=step.footprint?.slice(0,-1)||rectCorners(step),x=ring.reduce((s,q)=>s+q[0],0)/ring.length,y=ring.reduce((s,q)=>s+q[1],0)/ring.length;
      near(spaSurfaceAt(x,y,settings,data).groundZ,step.topZ);
      const observer=observerForPreset('custom',{...settings,observerX:x,observerY:y,eyeHeight:1.65},data);
      near(observer.z,step.topZ+1.65);
      assert.equal(observer.surface,`${name}-entry`);
    }
  }
  for(const svg of [false,true]){
    const group=createSpaAmenityGroup(p,levels,materials,svg);
    for(const [i,step] of levels.sauna.entrySteps.entries()){
      const b=meshBounds(group.getObjectByName(`sauna-entry-step-${i}`));near(b.max.y,step.topZ,1e-6);near(b.min.y,step.baseZ,1e-6);
    }
    for(const [i,step] of levels.coldPlunge.steps.entries()){
      const b=meshBounds(group.getObjectByName(`plunge-access-step-${i}`));near(b.max.y,step.topZ,1e-6);near(b.min.y,step.baseZ,1e-6);
    }
    group.getObjectByName('six-person-corner-sauna').traverse(object=>{
      if(!object.isMesh||object.name.startsWith('sauna-entry-step'))return;
      const b=meshBounds(object);
      assert.ok(b.min.x>=p.sauna.x-1e-6&&b.max.x<=p.sauna.x+p.sauna.width+1e-6,`${object.name} protrudes beyond nominal width`);
      assert.ok(b.min.z>=p.sauna.y-1e-6&&b.max.z<=p.sauna.y+p.sauna.length+1e-6,`${object.name} protrudes beyond nominal depth`);
    });
  }
});

test('the relocated sauna still looks through glass toward the pool, terrace and edge jacuzzi',()=>{
  const p=gardenProgram(settings,data),levels=spaLevels(settings,data),eye=observerForPreset('sauna',settings,data),t=jacuzziBounds(settings,data);
  near(eye.x,3.55);near(eye.y,36.4);near(eye.z,levels.sauna.floorZ+1.6);
  for(const target of [[p.pool.x+p.pool.width/2,p.pool.y+p.pool.length/2,levels.pool.waterZ],
    [9.6,21,t.z],[(t.x0+t.x1)/2,(t.y0+t.y1)/2,t.waterZ]])assert.equal(saunaIntersection(eye,target,settings,data),null);
  assert.equal(saunaIntersection(eye,[0,eye.y,eye.z],settings,data)?.part,'wall');
  assert.equal(saunaIntersection(eye,[eye.x,eye.y,eye.z+8],settings,data)?.part,'roof');
  assert.ok(eye.defaultLookYaw<-90,'Seated sauna view faces the garden interior');
});
