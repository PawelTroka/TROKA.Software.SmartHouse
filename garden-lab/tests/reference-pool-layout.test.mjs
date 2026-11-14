import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gardenProgram,poolBounds} from '../src/garden-program.js';
import {getScreeningLayouts,STERNICZA_REFERENCE_POOL_TREES,STERNICZA_REAR_CORNER_TREES} from '../src/screening-layouts.js';
import {screeningTreeVolumes} from '../src/screening-trees.js';
import {analyzeVisibility,observerForPreset,pointInPolygon,terraceGroundReference,jacuzziBounds,gardenGroundAt} from '../src/geometry.js';
import {analyzeFacadeVisibility} from '../src/facade-visibility.js';
import {closestFootprints,closestBoundary} from '../src/dimensions.js';
import {rectCorners,terraceStairs} from '../src/layout.js';
import {analyzeSunlight} from '../src/shade.js';
import {sunForSettings} from '../src/solar.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const settings={siteId:'sternicza-11',gardenProgram:'spa-pool-grove',hedgeRear:4,hedgeLeft:4,hedgeRight:4,hedgeFront:4,
 hedgeFullPerimeter:true,hedgeInset:.5,gardenRaise:.5,bedRaise:0,raiseNewHedges:true,terraceDepth:4.2,floorHeight:1.2,
 removeGarage:true,canopyEnabled:false,includeHighFeatures:false,jacuzziOverflow:false,treeLeafMode:'auto',
 sunDate:'2026-06-21',sunMinutes:720,sunEnabled:true,screeningTrees:STERNICZA_REFERENCE_POOL_TREES};
const near=(a,b,message,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<tolerance,`${message}: ${a} versus ${b}`);
const gap=(tree,ring)=>closestFootprints([[tree.x,tree.y]],ring).distance;

test('the screenshot reference keeps three 10 m pines on the rear/east edge and reports its boundary overhang',()=>{
 const layout=getScreeningLayouts('sternicza-11')[0],trees=layout.trees;
 assert.equal(layout.settings.gardenProgram,'spa-pool-grove');
 assert.deepEqual(trees,STERNICZA_REFERENCE_POOL_TREES);
 assert.deepEqual(trees.map(t=>[t.height,t.crownWidth,t.crownDepth]),[[10,6,6],[10,6,6],[10,5,5]]);
 assert.ok(trees[0].x>=19&&trees[0].y>=30,'The closest tree stays at the east boundary');
 assert.ok(trees.slice(1).every(t=>t.y>=35.5),'Both other trunks stay at the rear, not the centre of the garden');
 near(Math.hypot(trees[0].x-trees[2].x,trees[0].y-trees[2].y),5.44,'Reference tree 1–3 dimension',.005);
 near(Math.hypot(trees[1].x-trees[2].x,trees[1].y-trees[2].y),4.66,'Reference tree 2–3 dimension',.005);
 const volumes=screeningTreeVolumes(settings,data);
 for(const v of volumes){assert.ok(v.plantable);assert.equal(v.crownInside,false);assert.ok(v.warnings.some(w=>/beyond the property/.test(w)));}
 near(3-closestBoundary([[trees[0].x,trees[0].y]],data,'left').distance,1.9947063842117916,'Tree 1 east overhang');
 near(3-closestBoundary([[trees[1].x,trees[1].y]],data,'rear').distance,.8103170159587498,'Tree 2 rear overhang');
 near(2.5-closestBoundary([[trees[2].x,trees[2].y]],data,'left').distance,.6353367267852221,'Tree 3 east overhang');
 assert.match(layout.note,/root balls, excavation, crown overhang and stock need confirmation/);
 assert.deepEqual(getScreeningLayouts('sternicza-11').map(l=>l.id),['default','hedges-only'],'Known colliding old trees are not offered on the moved pool');
 assert.deepEqual(getScreeningLayouts('sternicza-11','spa-corner')[0].trees,STERNICZA_REAR_CORNER_TREES);
});

test('the longer pool reaches the reference grove with 1 m full-coping allowances and clear existing features',()=>{
 const proposal=gardenProgram(settings,data),old=gardenProgram({...settings,gardenProgram:'spa-corner'},data),pool=poolBounds(settings,data);
 assert.deepEqual([pool.x,pool.y,pool.width,pool.length],[14.52,26.3,3.5,8]);
 near(pool.y-old.pool.y,6.8,'Rearward move');near(old.pool.x-pool.x,1.18,'Inward move');
 const coping=rectCorners(pool,pool.coping);
 assert.ok(coping.every(p=>pointInPolygon(p,data.site.boundary)));
 assert.ok(closestBoundary(coping,data,'left').distance>2);
 const gaps=settings.screeningTrees.map(t=>gap(t,coping));
 assert.ok(gaps.every(d=>d>=1-1e-8));assert.ok(gaps.every(d=>d<1.3));
 near(gaps[0],1,'Tree 1 sets the side limit');
 assert.ok(gap(settings.screeningTrees[0],rectCorners({...pool,x:pool.x+.01},pool.coping))<1,'Moving farther east exceeds the allowance');
 assert.ok(gap(settings.screeningTrees[2],rectCorners({...pool,y:pool.y+.01},pool.coping))<1,'Moving farther rear exceeds the allowance');
 const t={...data.site.terrace,length:settings.terraceDepth},stairs=terraceStairs(t,settings.terraceDepth,terraceGroundReference(settings,data).drop,settings,data);
 const tub=jacuzziBounds(settings,data),service=tub.serviceAccess;
 const obstacles=[data.site.house.footprint,rectCorners(t),rectCorners(stairs),proposal.sauna.footprint,
  ...proposal.sauna.entrySteps.map(s=>s.footprint),proposal.firepit.outerFootprint,rectCorners(proposal.coldPlunge,proposal.coldPlunge.pad),
  ...proposal.coldPlunge.steps.map(step=>rectCorners(step)),rectCorners(proposal.furniture.dining),
  ...proposal.furniture.loungers.map(([x,y])=>rectCorners({x,y,width:.78,length:2})),
  rectCorners({x:service.x0,y:service.y0,width:service.x1-service.x0,length:service.y1-service.y0})];
 for(const ring of obstacles)assert.ok(closestFootprints(coping,ring).distance>=1,'The pool preserves at least 1 m to existing feature envelopes');
 for(const key of ['sauna','firepit','coldPlunge','furniture'])assert.deepEqual(proposal[key],old[key],`${key} stays fixed`);
 assert.deepEqual(jacuzziBounds(settings,data),jacuzziBounds({...settings,gardenProgram:'spa-corner'},data));
});

test('reference planting improves the main wall views without hiding the separately exposed roof or dining wall',()=>{
 const expected={sofa:[503,5214,105],standing:[569,5214,131],terrace:[216,5214,52],jacuzzi:[322,9702,51],garden:[2,5214,0],sauna:[0,9702,0],firepit:[6,5214,0]};
 for(const[preset,counts]of Object.entries(expected)){
  const observer=observerForPreset(preset,{...settings,eyeHeight:undefined},data);
  assert.deepEqual(observer,observerForPreset(preset,{...settings,gardenProgram:'spa-corner',eyeHeight:undefined},data),'The pool and trees do not move the eye');
  const dense=analyzeFacadeVisibility(observer,'building-9',settings,data);
  const roof=analyzeVisibility(observer,settings,data).rays.filter(r=>r.blockId==='building-9'&&r.kind==='roof');
  assert.deepEqual([dense.visible,dense.total,roof.filter(r=>r.visible).length],counts,preset);
  assert.equal(roof.length,365);
 }
 const observer={x:5.5,y:26.1,z:gardenGroundAt(5.5,26.1,settings,data)+1.65,preset:'custom',eyeHeight:1.65};
 const dining=analyzeFacadeVisibility(observer,'building-9',settings,data);
 assert.deepEqual([dining.visible,dining.total],[2398,9702]);
 assert.ok(dining.visible/dining.total>.24,'Do not claim near-complete screening from every garden point');
});

test('pool shade reflects its move under and alongside the reference crowns',()=>{
 for(const[minutes,lit]of[[720,0],[900,4],[1020,19]]){
  const s={...settings,sunMinutes:minutes},sun=analyzeSunlight(s,data,sunForSettings(s,data));
  assert.deepEqual([sun.zones.pool.sunlit,sun.zones.pool.total],[lit,24]);
 }
});
