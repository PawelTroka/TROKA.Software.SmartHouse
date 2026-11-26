import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStateModel} from '../src/state.js';
import {getSiteProfile} from '../src/sites.js';
import {changePresentationSettings} from '../src/studio-state.js';
import {DESIGN_STYLES} from '../src/design-styles.js';
import {PAVILION_DEFAULTS,PAVILION_PLACEMENTS} from '../src/corner-pavilion.js';
import {pavilionStudy} from '../src/pavilion-study.js';
import {applyPlanExterior} from '../src/plan-exterior.js';
import {gardenProgram,poolBounds} from '../src/garden-program.js';
import {gardenFurniture,rectCorners,terraceStairs} from '../src/layout.js';
import {footprintFit,overlapArea} from '../src/footprint-fit.js';
import {analyzeVisibility,observerForPreset,privacyStructures,pointInPolygon,terraceGroundReference} from '../src/geometry.js';
import {firstPrivacyIntersection} from '../src/privacy-structures.js';
import {prepareSunGeometry,firstSunBlocker} from '../src/shade.js';
import {gardenQuantities,estimateGardenCosts,estimatePrivacyCosts} from '../src/costs.js';

const source=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
// Retain every physical context building; sample only PCK3 for these checks.
source.buildings=source.buildings.map(b=>b.id!=='building-9'&&b.kind==='target'?{...b,kind:'context'}:b);
const model=createStateModel(getSiteProfile('sternicza-11',source));
// This published pavilion comparison used its narrower compatible planting.
// The new broad-pine garden is tested separately below, including its repair.
const defaults=model.decodeState('v=29&site=sternicza-11');
const emptyAnalysis={byBlock:[],rays:[]};
const close=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-7,`${label}: ${a} vs ${b}`);
const fixture=(placement=PAVILION_PLACEMENTS[0],patch={})=>{
  const settings=model.sanitizeState({...defaults,...placement.settings,pavilionEnabled:true,...patch});
  return {settings,data:applyPlanExterior(source,settings)};
};
const obstacles=(settings,data)=>{
  const p=gardenProgram(settings,data),t=data.site.terrace;
  const steps=terraceStairs({...t,y:data.site.rearMidpoint[1]},settings.terraceDepth,terraceGroundReference(settings,data).drop,settings,data);
  return [data.site.house.footprint,rectCorners({...t,y:data.site.rearMidpoint[1],length:settings.terraceDepth}),
    ...(steps.count?[rectCorners(steps)]:[]),rectCorners(p.pool,p.pool.coping),p.sauna.footprint,p.firepit.outerFootprint,
    rectCorners(p.coldPlunge,p.coldPlunge.pad),...p.sauna.entrySteps.map(s=>s.footprint),...p.coldPlunge.steps.map(s=>rectCorners(s))];
};

test('new broad-pine garden reports pavilion collisions and the explicit Excelsa prescription resolves them',()=>{
  for(const placement of PAVILION_PLACEMENTS){
    const s={...model.DEFAULTS,...placement.settings,pavilionEnabled:true},data=applyPlanExterior(source,s);
    const report=pavilionStudy(observerForPreset('terrace',s,data),s,data,emptyAnalysis);
    assert.equal(report.valid,false,'Broad crowns are never silently shrunk or ignored');
    assert.ok(report.treeConflicts.some(t=>t.crown==='overlap'||t.trunk));
    const fixed={...s,screeningTrees:defaults.screeningTrees};
    assert.equal(pavilionStudy(observerForPreset('terrace',fixed,data),fixed,data,emptyAnalysis).valid,true);
  }
});

test('pavilion opt-in derives its garden without overwriting any saved garden programme or tree layout',()=>{
  assert.equal(defaults.pavilionEnabled,false);
  for(const garden of ['classic','spa','spa-edge','spa-compact','spa-screened','spa-grove','spa-aligned','spa-corner','spa-pool-grove']){
    const original=model.sanitizeState({...defaults,gardenProgram:garden,pavilionEnabled:false});
    const on=model.sanitizeState({...original,pavilionEnabled:true});
    const off=model.sanitizeState({...on,pavilionEnabled:false});
    assert.equal(on.gardenProgram,garden);
    assert.equal(gardenProgram(on,source).id,'spa-pavilion');
    assert.deepEqual(poolBounds(on,source),poolBounds({...on,gardenProgram:'classic'},source));
    assert.deepEqual(gardenProgram(off,source),gardenProgram(original,source),garden);
    assert.deepEqual(gardenFurniture(source,off),gardenFurniture(source,original),garden);
    assert.deepEqual(on.screeningTrees,original.screeningTrees);
    assert.deepEqual(off.screeningTrees,original.screeningTrees);
    assert.equal(privacyStructures(off,source).pavilion.enabled,false);
  }
  for(const preset of ['sauna','firepit'])assert.equal(model.sanitizeState({...defaults,gardenProgram:'classic',pavilionEnabled:true,preset}).preset,preset);
});

test('pavilion choices survive a save and share round-trip, while older and other-site designs remain off',()=>{
  const s=model.sanitizeState({...defaults,pavilionEnabled:true,...PAVILION_PLACEMENTS[1].settings,pavilionHeight:8.4,costPavilionQuote:840000,gardenProgram:'spa-grove'});
  for(const restored of [model.decodeState(model.encodeState(s)),model.migrateSavedState(s,model.STATE_VERSION)]){
    for(const key of [...Object.keys(PAVILION_DEFAULTS),'costPavilionQuote','gardenProgram'])assert.deepEqual(restored[key],s[key],key);
    assert.equal(restored.removeGarage,true);
  }
  for(const v of [20,23,27,28])assert.equal(model.decodeState(`v=${v}&site=sternicza-11`).pavilionEnabled,false);
  for(const siteId of ['korzeniowskiego-40','nadmorska-17']){
    const data=JSON.parse(readFileSync(new URL(`../data/${siteId}.json`,import.meta.url)));
    const other=createStateModel(getSiteProfile(siteId,data));
    const cross=other.sanitizeState({...other.DEFAULTS,...s,siteId});
    assert.equal(cross.pavilionEnabled,false);
    assert.equal(Boolean(privacyStructures(cross,data).pavilion?.enabled),false);
    assert.equal(estimatePrivacyCosts(cross,data).rows.some(r=>r.key==='costPavilionQuote'),false);
    assert.equal(other.decodeState(model.encodeState(s)).pavilionEnabled,false);
  }
});

test('all 34 renovation styles and Current retain usable furniture and both pavilion entrances clear fixed spa objects and the parcel',()=>{
  assert.equal(DESIGN_STYLES.filter(s=>s.id!=='current').length,34);
  for(const style of DESIGN_STYLES)for(const placement of PAVILION_PLACEMENTS){
    const settings=model.sanitizeState(changePresentationSettings({...defaults,...placement.settings,pavilionEnabled:true},{designStyle:style.id}));
    const data=applyPlanExterior(source,settings),p=privacyStructures(settings,data).pavilion;
    const fixed=obstacles(settings,data),furniture=gardenFurniture(data,settings);
    const items=furniture.resort?.items||furniture.loungers.map(([x,y])=>({id:'lounger',x,y,width:.78,length:2}));
    assert.ok(items.length>0,style.id+' retains an outdoor resting place');
    assert.notEqual(furniture.diningVisible,false,style.id+' retains outdoor dining');
    const placed=[...items,{...furniture.dining,id:'dining'}];
    for(const foot of p.footprints){
      const ring=rectCorners(foot);
      assert.equal(footprintFit(ring,data.site.boundary).location,'inside',placement.id+' '+foot.id);
      for(const obstacle of fixed)assert.ok(overlapArea(ring,obstacle)<1e-7,placement.id+' '+foot.id+' conflicts with spa/terrace');
    }
    for(const [i,item] of placed.entries()){
      const ring=rectCorners(item);
      assert.equal(footprintFit(ring,data.site.boundary).location,'inside',style.id+' '+item.id);
      for(const obstacle of [...fixed,...p.footprints.map(f=>rectCorners(f))])assert.ok(overlapArea(ring,obstacle)<1e-7,style.id+' '+item.id+' conflicts with construction');
      for(const other of placed.slice(i+1))assert.ok(overlapArea(ring,rectCorners(other))<1e-7,style.id+' furniture clashes');
    }
    const study=pavilionStudy(observerForPreset('terrace',settings,data),settings,data,emptyAnalysis);
    assert.equal(study.valid,true,placement.id+' '+study.warnings.join(' '));
    assert.equal(study.entryApproachClear,true,placement.id+' needs a 1 m entry approach');
    assert.equal(study.treeConflicts.some(t=>t.trunk||t.crown==='overlap'),false);
  }
});

test('tree crown contact stays explicit while positive crown or trunk overlap invalidates a pavilion comparison',()=>{
  const {settings,data}=fixture(),eye=observerForPreset('terrace',settings,data);
  const original=pavilionStudy(eye,settings,data,emptyAnalysis);
  assert.equal(original.valid,true);
  assert.ok(original.treeConflicts.some(t=>t.id==='tree-2'&&t.crown==='contact'&&!t.trunk));
  assert.ok(original.warnings.some(w=>/growth, pruning and building maintenance/.test(w)));
  for(const [label,patch] of [['crown',{y:35.5}],['trunk',{x:13.1,y:30.5}]]){
    const changed={...settings,screeningTrees:settings.screeningTrees.map(t=>t.id==='tree-2'?{...t,...patch}:t)};
    const study=pavilionStudy(eye,changed,data);
    assert.equal(study.valid,false,label);
    assert.equal(study.comparison,null,label+' must not yield a reassuring screen percentage');
    assert.equal(study.envelope,null,label);
    assert.ok(study.conflicts.some(c=>c.id.startsWith(label+'-')));
  }
});

test('out-of-plot construction, entry/terrace clashes and enclosed eyes cannot produce screening results',()=>{
  for(const [label,patch] of [['parcel',{pavilionX:19}],['terrace',{pavilionX:7,pavilionY:20}],['pool',{pavilionX:2,pavilionY:25}]]){
    const {settings,data}=fixture(undefined,patch),eye=observerForPreset('terrace',settings,data),study=pavilionStudy(eye,settings,data);
    assert.equal(study.valid,false,label);
    assert.equal(study.comparison,null,label);
    assert.equal(study.envelope,null,label);
    assert.ok(study.conflicts.some(c=>c.id===label),label);
  }
  const {settings,data}=fixture(),p=privacyStructures(settings,data).pavilion;
  const study=pavilionStudy({x:p.x+1,y:p.y+1,z:p.floorZ+1.65,label:'Inside'},settings,data);
  assert.equal(study.valid,false);assert.equal(study.comparison,null);
  assert.match(study.warnings.join(' '),/inside the pavilion/);
});

test('PCK3 before/after keeps the alternative garden and all non-pavilion blockers',()=>{
  const {settings,data}=fixture(undefined,{privacyPergolaEnabled:true,privacyPergolaFoliage:true,spaScreensEnabled:true});
  const eye=observerForPreset('pool',settings,data),before=analyzeVisibility(eye,settings,data,{excludePavilion:true});
  const after=analyzeVisibility(eye,settings,data),study=pavilionStudy(eye,settings,data,after);
  assert.deepEqual(before.observer,after.observer);
  assert.equal(study.valid,true);
  assert.equal(study.comparison.before.blocked,before.blocked);
  assert.equal(study.comparison.after.blocked,after.blocked);
  assert.equal(study.comparison.roofBefore.total,before.rays.filter(r=>r.kind==='roof'||r.kind==='high-feature').length);
  const otherBoxes=privacyStructures(settings,data).boxes.filter(b=>b.group!=='pavilion');
  assert.ok(otherBoxes.length>0);
  for(const [i,ray] of before.rays.entries()){
    assert.deepEqual(ray.origin,after.rays[i].origin);
    assert.deepEqual(ray.target,after.rays[i].target);
    assert.deepEqual(ray.privacyStructure,firstPrivacyIntersection(eye,ray.target,otherBoxes));
  }
  assert.notDeepEqual(observerForPreset('pool',{...settings,pavilionEnabled:false},data),eye,'Disabling the entire alternative would move the pool eye and is not the baseline');
});

test('sun receivers omit enclosed pavilion floors and sit on actual entry tops without zenith self-shade',()=>{
  for(const placement of PAVILION_PLACEMENTS){
    const {settings,data}=fixture(placement),p=privacyStructures(settings,data).pavilion,geometry=prepareSunGeometry(settings,data);
    const entry=p.boxes.filter(b=>b.part==='entry');
    const cells=geometry.cells.filter(c=>entry.some(b=>c.x>=b.x0&&c.x<=b.x1&&c.y>=b.y0&&c.y<=b.y1));
    assert.ok(cells.length>0,placement.id+' must sample its entry');
    assert.equal(geometry.cells.some(c=>pointInPolygon([c.x,c.y],p.footprint)),false);
    for(const cell of cells){
      const top=Math.max(...entry.filter(b=>cell.x>=b.x0&&cell.x<=b.x1&&cell.y>=b.y0&&cell.y<=b.y1).map(b=>b.z1));
      close(cell.z,top,placement.id+' entry receiver');
      assert.equal(firstSunBlocker(cell,[0,0,1],geometry.occluders),null,placement.id+' entry must not shade itself');
    }
    for(const box of p.boxes){
      const sun=geometry.occluders.find(o=>o.id===box.id);
      assert.ok(sun,box.id+' must be a sunlight blocker');close(sun.base,box.z0,box.id);close(sun.top,box.z1,box.id);
    }
    const taller=prepareSunGeometry({...settings,pavilionHeight:settings.pavilionHeight+1},data);
    assert.notEqual(taller,geometry,'Roof-height edits invalidate sunlight geometry');
    close(taller.occluders.find(o=>o.id==='pavilion-roof').top,p.topZ+1,'Updated roof');
  }
});

test('pavilion area leaves fill and planting quantities, with entry construction counted once',()=>{
  const reports=PAVILION_PLACEMENTS.map(placement=>{
    const {settings,data}=fixture(placement,{hedgeRear:0,hedgeLeft:0,hedgeRight:0,hedgeFront:0});
    const pavilion=privacyStructures(settings,data).pavilion,q=gardenQuantities(settings,data),garden=estimateGardenCosts(settings,data,q);
    const entryArea=pavilion.footprints.filter(f=>f.id!=='corner-pavilion').reduce((n,f)=>n+f.width*f.length,0);
    return {settings,data,pavilion,q,garden,entryArea};
  });
  const [rear,near]=reports;
  close(rear.q.automaticArea-near.q.automaticArea,near.pavilion.width*near.pavilion.length-rear.pavilion.width*rear.pavilion.length,'Main building area excluded from fill');
  close(rear.garden.quantities.additionalHardscape-near.garden.quantities.additionalHardscape,rear.entryArea-near.entryArea,'Entry slabs excluded once from landscape');
  const smaller=gardenQuantities({...rear.settings,pavilionWidth:rear.settings.pavilionWidth-1},rear.data);
  close(smaller.automaticArea-rear.q.automaticArea,rear.pavilion.length,'Resized footprint updates cost quantity cache');
});

test('pavilion has one explicit whole-project quote and no invented allowance when unquoted or disabled',()=>{
  const {settings,data}=fixture();
  const unknown=estimatePrivacyCosts({...settings,costPavilionQuote:0,costUsePlanningAllowances:true},data);
  assert.equal(unknown.rows.filter(r=>r.key==='costPavilionQuote').length,1);
  assert.equal(unknown.rows.find(r=>r.key==='costPavilionQuote').cost,null);
  assert.equal(unknown.total,null);
  const priced=estimatePrivacyCosts({...settings,costPavilionQuote:840000,costContingency:0},data);
  assert.deepEqual(priced.knownSubtotal,{low:840000,high:840000});
  assert.equal(estimatePrivacyCosts({...settings,pavilionEnabled:false,costPavilionQuote:840000},data).rows.some(r=>r.key==='costPavilionQuote'),false);
});
