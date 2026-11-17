import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PRIVACY_DEFAULTS,PRIVACY_GEOMETRY_KEYS,privacyBoxIntersection,firstPrivacyIntersection} from '../src/privacy-structures.js';
import {privacyStructures,analyzeVisibility,observerForPreset,jacuzziBounds,floorElevation,DEFAULT_SETTINGS} from '../src/geometry.js';
import {prepareSunGeometry,firstSunBlocker} from '../src/shade.js';
import {getSiteProfile} from '../src/sites.js';
import {createStateModel} from '../src/state.js';
import {privacyPresetState} from '../src/privacy-options.js';

const source=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const other=JSON.parse(readFileSync(new URL('../data/korzeniowskiego-40.json',import.meta.url)));
const settings={...DEFAULT_SETTINGS,...PRIVACY_DEFAULTS,siteId:'sternicza-11',gardenProgram:'spa-pool-grove',
  hedgeRear:0,hedgeLeft:0,hedgeRight:0,gardenRaise:0,bedRaise:0,screeningTrees:[]};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function flatSite(){
  return {...source,coordinates:{...source.coordinates,localOriginEN:[0,0],xUnitEN:[1,0],yUnitEN:[0,1]},
    terrain:{originEN:[-10,-10],cellSize:1,columns:64,rows:64,elevations:Array(4096).fill(0)},
    buildings:[],site:{...source.site,house:null,garage:null,floorReference:{z:0},boundary:[[0,0],[20,0],[20,38],[0,38],[0,0]]}};
}

test('disabled alternatives add no obstructions and cannot alter existing privacy or sunlight',()=>{
  const base={...settings},off={...base,privacyPergolaEnabled:false,privacyPergolaFoliage:true,privacyPergolaHeight:6,
    spaScreensEnabled:false,spaScreenWidth:5,spaScreenHeight:3};
  assert.deepEqual(privacyStructures(off,source).boxes,[]);
  const eye=observerForPreset('jacuzzi',base,source);
  assert.deepEqual(analyzeVisibility(eye,off,source),analyzeVisibility(eye,base,source));
  assert.deepEqual(prepareSunGeometry(off,source).occluders,prepareSunGeometry(base,source).occluders);
  const enabled={...base,privacyPergolaEnabled:true,spaScreensEnabled:true,privacyPergolaFoliage:true};
  assert.equal(privacyStructures(enabled,other).boxes.length,0,'Sternicza structures do not leak into other properties');
});

test('finite privacy slabs miss rays above, beside and beyond the target and avoid origin-surface self-blocking',()=>{
  const box={id:'panel',group:'spa-screen',part:'screen',label:'Test screen',x0:1,x1:2,y0:3,y1:3.1,z0:0,z1:2,opaque:true};
  assert.ok(privacyBoxIntersection([1.5,0,1],[1.5,10,1],box));
  assert.equal(privacyBoxIntersection([2.1,0,1],[2.1,10,1],box),null);
  assert.equal(privacyBoxIntersection([1.5,0,2.1],[1.5,10,2.1],box),null);
  assert.equal(privacyBoxIntersection([1.5,0,1],[1.5,2.9,1],box),null);
  assert.equal(privacyBoxIntersection([1.5,3,1],[1.5,0,1],box),null);
  assert.ok(privacyBoxIntersection([1.5,3.05,1],[1.5,10,1],box),'An impossible eye inside solid material is blocked at the exit');
  assert.equal(firstPrivacyIntersection([1.5,0,1],[1.5,10,1],[{...box,opaque:false}]),null);
});

test('bare pergola lattice gaps stay open; explicit dense planting blocks only its finite rear and east faces',()=>{
  const data=flatSite(),open={...settings,privacyPergolaEnabled:true,privacyPergolaX:10,privacyPergolaY:23,
    privacyPergolaWidth:4,privacyPergolaDepth:2,privacyPergolaHeight:4.5,privacyPergolaFoliage:false};
  const bare=privacyStructures(open,data),planted=privacyStructures({...open,privacyPergolaFoliage:true},data);
  assert.ok(bare.boxes.some(box=>box.part==='lattice'));
  assert.equal(bare.boxes.some(box=>box.part==='foliage'),false);
  const eye=[10.22,24,1.13],target=[10.22,30,1.13];
  assert.equal(firstPrivacyIntersection(eye,target,bare.boxes),null,'No imaginary wall between timber slats');
  assert.equal(firstPrivacyIntersection(eye,target,planted.boxes)?.part,'foliage');
  assert.equal(firstPrivacyIntersection([10.22,24,4.8],[10.22,30,4.8],planted.boxes),null,'Planting cannot extend above its frame');
  assert.equal(firstPrivacyIntersection([10.22,24,1.13],[10.22,24,10],planted.boxes),null,'A planted side trellis does not become a solid roof');
  const sunBare=prepareSunGeometry(open,data).occluders.filter(o=>o.id.startsWith('privacy-'));
  const sunPlanted=prepareSunGeometry({...open,privacyPergolaFoliage:true},data).occluders.filter(o=>o.id.startsWith('privacy-'));
  assert.equal(firstSunBlocker(eye,[0,1,0],sunBare),null);
  assert.equal(firstSunBlocker(eye,[0,1,0],sunPlanted)?.id,'privacy-pergola-rear-foliage');
});

test('privacy and sunlight use identical boxes and changes to every structure field invalidate sunlight geometry',()=>{
  const data=flatSite(),s={...settings,privacyPergolaEnabled:true,privacyPergolaFoliage:true,spaScreensEnabled:true};
  const boxes=privacyStructures(s,data).boxes,geometry=prepareSunGeometry(s,data);
  const bodies=geometry.occluders.filter(o=>o.id.startsWith('privacy-'));
  assert.equal(bodies.length,boxes.length);
  for(const box of boxes){
    const body=bodies.find(o=>o.id===box.id);assert.ok(body,box.id);
    near(body.base,box.z0);near(body.top,box.z1);
    const ring=body.ring||body.footprint||body.polygon;
    assert.ok(ring,`${box.id} has a finite polygon`);
    near(Math.min(...ring.map(p=>p[0])),box.x0);near(Math.max(...ring.map(p=>p[0])),box.x1);
    near(Math.min(...ring.map(p=>p[1])),box.y0);near(Math.max(...ring.map(p=>p[1])),box.y1);
  }
  for(const key of PRIVACY_GEOMETRY_KEYS){
    const original=prepareSunGeometry(s,data),value=typeof s[key]==='boolean'?!s[key]:s[key]+.1;
    assert.notEqual(prepareSunGeometry({...s,[key]:value},data),original,`${key} invalidates the shade cache`);
  }
});

test('pergola follows raised garden while spa panels keep terrace datum, and unsafe footprint changes are visible',()=>{
  const data=flatSite(),s={...settings,privacyPergolaEnabled:true,privacyPergolaFoliage:true,spaScreensEnabled:true,
    spaScreenWidth:3.6,spaScreenGap:.65};
  const original=privacyStructures(s,data),raised=privacyStructures({...s,gardenRaise:.5},data);
  const frame=original.footprints.find(p=>p.id==='privacy-pergola'),up=raised.footprints.find(p=>p.id==='privacy-pergola');
  near(up.baseZ-frame.baseZ,.5);near(up.topZ-frame.topZ,.5);
  const panel=original.boxes.find(p=>p.id==='privacy-spa-rear-screen'),same=raised.boxes.find(p=>p.id===panel.id);
  near(panel.z0,floorElevation(s,data));near(same.z0,panel.z0);near(same.z1,panel.z1);
  assert.ok(!original.warnings.some(w=>/service zone/.test(w)));
  assert.ok(privacyStructures({...s,spaScreenGap:.6},data).warnings.some(w=>/service zone/.test(w)),
    'The service clearance measures the support face, not its centreline');
  const outside=privacyStructures({...s,privacyPergolaX:19,privacyPergolaWidth:5},data);
  assert.ok(outside.warnings.some(w=>/beyond the mapped plot/.test(w)));
  const collision=privacyStructures({...s,privacyPergolaX:14.5,privacyPergolaY:27},data);
  assert.ok(collision.warnings.some(w=>/overlaps the pool/.test(w)));
  const spaCollision=privacyStructures({...s,spaScreenWidth:1,spaScreenReturn:3},data);
  assert.ok(spaCollision.warnings.some(w=>/overlaps the jacuzzi/.test(w)));
  const tooTall=privacyStructures({...s,privacyPergolaHeight:99},data).footprints.find(p=>p.id==='privacy-pergola');
  near(tooTall.topZ-tooTall.baseZ,6);
});

test('spa screens improve PCK3 rays at jacuzzi without claiming whole-garden coverage or changing hedge-only requirement',()=>{
  const base={...createStateModel(getSiteProfile('sternicza-11')).DEFAULTS,privacyPergolaEnabled:false,spaScreensEnabled:false};
  const s={...base,spaScreensEnabled:true,spaScreenWidth:3.6,spaScreenGap:.65};
  const eye=observerForPreset('jacuzzi',{...base,eyeHeight:.7},source),before=analyzeVisibility(eye,base,source),after=analyzeVisibility(eye,s,source);
  assert.ok(after.byBlock.find(b=>b.id==='building-9').blockedPercent>before.byBlock.find(b=>b.id==='building-9').blockedPercent);
  assert.ok(after.reasons['privacy-structure']>0);
  assert.ok(after.rays.some(ray=>ray.blockedBy==='privacy-structure'&&ray.privacyStructure?.label));
  assert.deepEqual(after.worstRequiredHedge,before.worstRequiredHedge,'Hedge-only benchmark remains independent of added structures');
  const garden=observerForPreset('garden',{...base,eyeHeight:1.65},source);
  assert.equal(analyzeVisibility(garden,s,source).byBlock.find(b=>b.id==='building-9').blockedPercent,
    analyzeVisibility(garden,base,source).byBlock.find(b=>b.id==='building-9').blockedPercent);
  const tub=jacuzziBounds(s,source),panel=privacyStructures(s,source).boxes.find(box=>box.id==='privacy-spa-rear-screen');
  near(panel.y0+.035-tub.y1,.65);
});

test('recommended presets screen their intended occupied areas while leaving the distant garden result honest',()=>{
  const base=createStateModel(getSiteProfile('sternicza-11')).DEFAULTS;
  const eyeHeights={sofa:1.2,terrace:1.65,jacuzzi:.7,garden:1.65};
  const results=state=>Object.fromEntries(Object.entries(eyeHeights).map(([place,eyeHeight])=>[
    place,analyzeVisibility(observerForPreset(place,{...state,eyeHeight},source),state,source)
      .byBlock.find(block=>block.id==='building-9').blockedPercent,
  ]));
  const baseline=results(privacyPresetState('none',base));
  for(const id of ['spa','pergola','layered']){
    const candidate=privacyPresetState(id,base),coverage=results(candidate);
    assert.deepEqual(privacyStructures(candidate,source).warnings,[],`${id} preserves mapped water, buildings and maintenance access`);
    assert.equal(coverage.garden,baseline.garden,`${id} cannot screen a viewpoint beyond its finite structures`);
    assert.ok(coverage.terrace>90,`${id} improves the living terrace toward PCK3`);
    if(id==='pergola'){
      assert.ok(coverage.sofa>baseline.sofa,'Established planting helps the indoor seated view');
      assert.ok(coverage.jacuzzi>baseline.jacuzzi,'Established planting helps the central spa viewpoint');
      assert.ok(coverage.jacuzzi<90,'A remote planted pergola is not complete spa privacy');
    }else{
      assert.ok(coverage.sofa>99&&coverage.jacuzzi>99,'Opaque canopy and nearby screens protect the central occupied views');
      const tub=jacuzziBounds(candidate,source),groundZ=floorElevation(candidate,source);
      for(const [x,y]of tub.seatCentres){
        const covered=analyzeVisibility({x,y,z:groundZ+.7,groundZ,eyeHeight:.7,surface:'floor'},candidate,source)
          .byBlock.find(block=>block.id==='building-9').blockedPercent;
        assert.ok(covered>99,`${id}: finite screen and extended roof protect every sampled spa seat (${covered.toFixed(1)}%)`);
      }
    }
  }
});
