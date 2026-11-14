import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gardenProgram,poolBounds} from '../src/garden-program.js';
import {getScreeningLayouts,STERNICZA_REAR_CORNER_TREES,STERNICZA_CORNER_MIDPOINT_TREES,STERNICZA_ALIGNED_TREES} from '../src/screening-layouts.js';
import {getTreeType} from '../src/tree-catalog.js';
import {screeningTreeVolumes} from '../src/screening-trees.js';
import {analyzeVisibility,observerForPreset,pointInPolygon,terraceGroundReference,jacuzziBounds} from '../src/geometry.js';
import {analyzeFacadeVisibility} from '../src/facade-visibility.js';
import {closestFootprints,closestBoundary} from '../src/dimensions.js';
import {rectCorners,terraceStairs} from '../src/layout.js';
import {screeningTreeUnitPrice,estimateScreeningTreeCosts,COST_DEFAULTS} from '../src/costs.js';
import {analyzeSunlight} from '../src/shade.js';
import {sunForSettings} from '../src/solar.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const settings={siteId:'sternicza-11',gardenProgram:'spa-corner',hedgeRear:4,hedgeLeft:4,hedgeRight:4,hedgeFront:4,
 hedgeFullPerimeter:true,hedgeInset:.5,gardenRaise:.5,bedRaise:0,raiseNewHedges:true,terraceDepth:4.2,floorHeight:1.2,
 removeGarage:true,canopyEnabled:false,includeHighFeatures:false,jacuzziOverflow:false,treeLeafMode:'auto',
 sunDate:'2026-06-21',sunMinutes:720,sunEnabled:true,screeningTrees:STERNICZA_REAR_CORNER_TREES};
const presets=['sofa','standing','terrace','jacuzzi','garden','sauna','firepit'];
const near=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-8,`${message}: ${a} versus ${b}`);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

function obstacles(){
 const p=gardenProgram(settings,data),terrace={...data.site.terrace,length:settings.terraceDepth};
 const stairs=terraceStairs(terrace,settings.terraceDepth,terraceGroundReference(settings,data).drop,settings,data);
 return [data.site.house.footprint,rectCorners(terrace),rectCorners(stairs),rectCorners(p.pool,p.pool.coping),p.sauna.footprint,
  ...p.sauna.entrySteps.map(step=>step.footprint),p.firepit.outerFootprint,rectCorners(p.coldPlunge,p.coldPlunge.pad),
  ...p.coldPlunge.steps.map(step=>rectCorners(step)),rectCorners(p.furniture.dining),
  ...p.furniture.loungers.map(([x,y])=>rectCorners({x,y,width:.78,length:2})),
  ...p.furniture.path.map(([x,y])=>rectCorners({x,y,width:1.15,length:.9}))];
}

test('the v1.14 corner layout keeps every trunk in the rear-left zone with a close pair and contained overlapping crowns',()=>{
 const layout=getScreeningLayouts('sternicza-11','spa-corner')[0],trees=layout.trees;
 assert.equal(layout.label,'Rear-left corner grove · default');
 assert.equal(layout.settings.gardenProgram,'spa-corner');assert.equal(layout.settings.hedgeFullPerimeter,true);
 assert.deepEqual(trees,STERNICZA_REAR_CORNER_TREES);
 assert.deepEqual(trees.map(t=>[t.x,t.y]),[[17.3,31],[14.8,31.1],[14.5,34.9]]);
 assert.ok(trees.every(t=>t.x>=14.5&&t.x<=18.5&&t.y>=31&&t.y<=35.3),'No central-garden or isolated forward trunk');
 near(distance(trees[0],trees[1]),Math.hypot(2.5,.1),'Nearest pair');
 assert.ok(distance(trees[0],trees[1])<=2.6);
 for(let i=0;i<trees.length;i++)for(let j=i+1;j<trees.length;j++)assert.ok(distance(trees[i],trees[j])<6,'Every 6 m crown pair overlaps');
 const volumes=screeningTreeVolumes(settings,data),rings=obstacles();
 const observers=presets.map(preset=>observerForPreset(preset,{...settings,eyeHeight:undefined},data));
 for(const v of volumes){
  assert.ok(v.plantable&&v.crownInside);
  assert.ok(closestBoundary([[v.x,v.y]],data).distance>=3,'The complete circular crown fits in the parcel');
  for(const ring of rings)assert.ok(!pointInPolygon([v.x,v.y],ring)&&closestFootprints([[v.x,v.y]],ring).distance>=1-1e-8);
  for(const o of observers)assert.ok(Math.hypot(v.x-o.x,v.y-o.y)>=3,'No named view is screened by a near-camera trunk');
 }
});

test('the corner programme preserves spa geometry and exposes the midpoint and historical planting comparisons',()=>{
 const proposal=gardenProgram(settings,data),old=gardenProgram({...settings,gardenProgram:'spa-aligned'},data);
 assert.equal(proposal.id,'spa-corner');assert.equal(old.id,'spa-aligned');
 for(const key of ['pool','sauna','firepit','coldPlunge','furniture'])assert.deepEqual(proposal[key],old[key],key);
 assert.deepEqual(jacuzziBounds(settings,data),jacuzziBounds({...settings,gardenProgram:'spa-aligned'},data));
 const pool=poolBounds(settings,data);assert.deepEqual([pool.x,pool.y,pool.width,pool.length],[15.7,19.5,3.5,6]);
 const layouts=getScreeningLayouts('sternicza-11','spa-corner');
 assert.deepEqual(layouts.find(l=>l.id==='catalog-midpoint-corner').trees,STERNICZA_CORNER_MIDPOINT_TREES);
 assert.deepEqual(STERNICZA_CORNER_MIDPOINT_TREES.map(t=>[t.x,t.y]),STERNICZA_REAR_CORNER_TREES.map(t=>[t.x,t.y]));
 assert.deepEqual(layouts.find(l=>l.id==='previous-aligned-grove').trees,STERNICZA_ALIGNED_TREES);
 assert.deepEqual(getScreeningLayouts('sternicza-11','spa-aligned')[0].trees.map(t=>[t.x,t.y]),[[17,26.8],[14.4,28.4],[12.6,32.7]]);
 const farther=layouts.find(l=>l.id==='farther-left-corner');
 assert.match(farther.note,/1\.19 m/);assert.ok(screeningTreeVolumes({...settings,screeningTrees:farther.trees},data).some(v=>!v.crownInside));
 assert.deepEqual(getScreeningLayouts('korzeniowskiego-40','spa-corner'),[]);
});

test('upper-end stock dimensions retain only the recorded catalog plant reference and never manufacture a supplier quote',()=>{
 const type=getTreeType('austrian-pine-tall');
 assert.deepEqual(type.stock.height,[9,10]);assert.deepEqual(type.stock.width,[4,6]);
 assert.deepEqual([type.dimensions.height,type.dimensions.crownWidth],[9.5,5],'Catalog midpoint remains unchanged');
 for(const tree of STERNICZA_REAR_CORNER_TREES){
  assert.deepEqual([tree.height,tree.crownWidth,tree.crownDepth,tree.crownBase],[10,6,6,2.5]);
  const price=screeningTreeUnitPrice(tree);
  assert.equal(price.stockMatch,true);assert.equal(price.source,'published-stock');assert.equal(price.status,'estimate');
  assert.deepEqual([price.low,price.high],[59900,59900]);
  assert.equal(screeningTreeUnitPrice({...tree,crownWidth:6.01}).status,'quote-required','Do not extrapolate prices beyond the supplier band');
 }
 const estimate=estimateScreeningTreeCosts({...COST_DEFAULTS,screeningTrees:STERNICZA_REAR_CORNER_TREES,costUsePlanningAllowances:false});
 assert.deepEqual(estimate.plantsKnown,{low:179700,high:179700});
 assert.equal(estimate.plantQuoteCount,0);assert.ok(estimate.unquotedServices.length>0);
 assert.equal(estimate.total,null,'A plant catalog reference is not an installed quote');
 const note=getScreeningLayouts('sternicza-11','spa-corner')[0].note;
 assert.match(note,/Actual stock and crown shape are unconfirmed/);assert.match(note,/catalog reference, not a supplier quote/);
});

test('corner placement reports real dense facade and separate roof exposure from every fixed view',()=>{
 const expected={sofa:[859,5214,61],standing:[930,5214,73],terrace:[33,5214,6],jacuzzi:[2649,9702,39],garden:[139,5214,2],sauna:[0,9702,0],firepit:[432,5214,21]};
 for(const[preset,counts]of Object.entries(expected)){
  const observer=observerForPreset(preset,{...settings,eyeHeight:undefined},data);
  const dense=analyzeFacadeVisibility(observer,'building-9',settings,data);
  const roof=analyzeVisibility(observer,settings,data).rays.filter(r=>r.blockId==='building-9'&&r.kind==='roof');
  assert.deepEqual([dense.visible,dense.total,roof.filter(r=>r.visible).length],counts,preset);
  assert.equal(roof.length,365);assert.equal(dense.spacing,.25);
 }
});

test('corner-only crowns retain the measured selected-time sunlight result',()=>{
 for(const[minutes,poolSun,gardenSun]of[[720,14,166],[900,12,145]]){
  const s={...settings,sunMinutes:minutes},sun=analyzeSunlight(s,data,sunForSettings(s,data));
  assert.deepEqual([sun.zones.pool.sunlit,sun.zones.pool.total],[poolSun,21]);
  assert.deepEqual([sun.zones.terrace.sunlit,sun.zones.terrace.total],[32,32]);
  assert.deepEqual([sun.zones.jacuzzi.sunlit,sun.zones.jacuzzi.total],[4,4]);
  assert.deepEqual([sun.zones.garden.sunlit,sun.zones.garden.total],[gardenSun,315]);
 }
});

test('the fixed 6 m crown footprints cannot reach 90 percent in all main views through height alone',()=>{
 // An infinitely tall opaque cylinder is an optimistic superset of each crown.
 // A ray missing every cylinder cannot be intercepted by adding tree height.
 function intersectsPlanFootprint(ray,tree){
  const [ox,oy]=ray.origin,[tx,ty]=ray.target,dx=tx-ox,dy=ty-oy,rx=ox-tree.x,ry=oy-tree.y;
  const a=dx*dx+dy*dy,b=2*(rx*dx+ry*dy),c=rx*rx+ry*ry-tree.crownWidth**2/4,disc=b*b-4*a*c;
  if(disc<0)return false;
  const enter=(-b-Math.sqrt(disc))/(2*a),exit=(-b+Math.sqrt(disc))/(2*a);
  return exit>=0&&enter<=1;
 }
 for(const[preset,minimumVisible]of[['sofa',756],['standing',796],['jacuzzi',2527]]){
  const observer=observerForPreset(preset,{...settings,eyeHeight:undefined},data);
  const baseline=analyzeFacadeVisibility(observer,'building-9',{...settings,screeningTrees:[]},data);
  const misses=baseline.rays.filter(ray=>ray.visible&&!STERNICZA_REAR_CORNER_TREES.some(tree=>intersectsPlanFootprint(ray,tree)));
  assert.equal(misses.length,minimumVisible,preset);
  assert.ok(misses.length/baseline.total>.1,'Even unlimited height leaves over 10 percent exposed at these fixed footprints');
 }
});
