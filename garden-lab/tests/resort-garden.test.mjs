import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {DESIGN_STYLES,getDesignStyle} from '../src/design-styles.js';
import {getSiteProfile} from '../src/sites.js';
import {createStateModel} from '../src/state.js';
import {gardenProgram,poolBounds} from '../src/garden-program.js';
import {gardenFurniture,terraceStairs,rectCorners,rectanglesOverlap} from '../src/layout.js';
import {jacuzziBounds,terraceGroundReference,canopySupportBounds} from '../src/geometry.js';
import {footprintFit,overlapArea} from '../src/footprint-fit.js';
import {RESORT_GARDEN_RECIPES,resortTerraceLayout,resortBalconyLayout} from '../src/resort-garden.js';
import {createStyledResortPiece} from '../src/scene-style-details.js';
import {createGardenNightLighting} from '../src/scene-night-lights.js';
import {applyPlanExterior} from '../src/plan-exterior.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const defaults=createStateModel(getSiteProfile('sternicza-11',data)).DEFAULTS;
const proposals=DESIGN_STYLES.filter(s=>s.id!=='current');
const terrace=(d,s)=>resortTerraceLayout(d,s,jacuzziBounds(s,d),terraceStairs({...d.site.terrace,y:d.site.rearMidpoint[1]},s.terraceDepth,terraceGroundReference(s,d).drop,s,d));

test('every renovation has an intentional garden composition; Current preserves its furniture',()=>{
  assert.deepEqual(Object.keys(RESORT_GARDEN_RECIPES).sort(),proposals.map(s=>s.id).sort());
  assert.deepEqual(gardenFurniture(data,defaults),gardenProgram(defaults,data).furniture);
  assert.deepEqual(terrace(data,defaults).items,[]);
  const signatures=proposals.map(style=>JSON.stringify(gardenFurniture(data,{...defaults,designStyle:style.id})));
  assert.equal(new Set(signatures).size,proposals.length,'The complete garden arrangements differ, not just their colours');
});

test('all terrace compositions fit the selected deck and keep threshold, stair route and spa access open',()=>{
  for(const style of proposals)for(const terraceWidth of [4,8.5,10.77])for(const terraceDepth of [3,4,6]){
    const s={...defaults,designStyle:style.id,terraceWidth,terraceDepth},d=applyPlanExterior(data,s),layout=terrace(d,s);
    const t=d.site.terrace,deck=rectCorners({x:t.x,y:d.site.rearMidpoint[1],width:t.width,length:terraceDepth});
    assert.equal(layout.centerpiece,true);for(const id of ['spa-right-route','spa-left-route'])assert.ok(layout.clearances.find(c=>c.id===id).width>=.8);
    for(const [i,piece]of layout.items.entries()){
      assert.equal(footprintFit(rectCorners(piece),deck).location,'inside',style.id+' '+piece.id);
      for(const clear of layout.clearances)assert.equal(overlapArea(rectCorners(piece),rectCorners(clear)),0,style.id+' '+clear.id);
      for(const other of layout.items.slice(i+1))assert.ok(!rectanglesOverlap(piece,other,.079),style.id+' overlapping furniture');
    }
    if(terraceWidth===8.5&&terraceDepth===4)assert.ok(layout.items.length>=2,style.id+' has a usable furnished group');
  }
});

test('poolside pieces fit real obstacle envelopes and are omitted consistently when the garage is retained',()=>{
  for(const style of proposals)for(const terraceDepth of [3,4,6])for(const removeGarage of [true,false]){
    const s={...defaults,designStyle:style.id,terraceDepth,removeGarage},f=gardenFurniture(data,s),p=poolBounds(s,data),program=gardenProgram(s,data);
    const obstacles=[rectCorners(p,p.coping+.12),program.firepit.outerFootprint,program.sauna.footprint,program.coldPlunge.footprint];
    if(!removeGarage)obstacles.push(data.site.garage.footprint);
    for(const piece of f.resort.items){
      const ring=rectCorners(piece);
      assert.equal(footprintFit(ring,data.site.boundary).location,'inside');
      for(const obstacle of obstacles)assert.ok(overlapArea(ring,obstacle)<1e-7,style.id+' furniture inside an obstacle');
    }
    if(!removeGarage)assert.equal(f.diningVisible,false);
  }
});

test('resizing a canopy or balcony never places its real support through the terrace furniture',()=>{
  for(const designStyle of ['hidden-bali','beach-house','modern-minimal'])for(const terraceDepth of [3,4,6])
    for(const canopyWidth of [4,8.5,11])for(const canopyDepth of [1,2,3,4,6])for(const terraceCoverType of ['canopy','balcony']){
      const s={...defaults,designStyle,terraceDepth,canopyWidth,canopyDepth,terraceCoverType,canopyEnabled:true};
      const d=applyPlanExterior(data,s),pieces=terrace(d,s).items;
      for(const post of canopySupportBounds(s,d))for(const p of pieces){
        const box={x:post.x0,y:post.y0,width:post.x1-post.x0,length:post.y1-post.y0};
        assert.ok(!rectanglesOverlap(p,box,.079),`${designStyle} ${terraceDepth}/${canopyWidth}/${canopyDepth} ${terraceCoverType} ${p.id}`);
      }
    }
});

test('balcony sitting bays keep all door landings and the central garden view clear',()=>{
  const layout={enabled:true,type:'balcony',accessFits:true,bounds:{x0:2,x1:12.77,y0:18,y1:22},deckTopZ:6.5};
  for(const style of proposals){
    const pieces=resortBalconyLayout(layout,style);assert.ok(pieces.length>=5);
    for(const p of pieces){
      assert.ok(p.x>=2.5&&p.x+p.width<=12.27);
      assert.ok(p.y>=19.4&&p.y+p.length<=21.5);
      assert.ok(p.x+p.width<6||p.x>9,'The central standing/view route stays empty');
    }
    assert.deepEqual(resortBalconyLayout({...layout,accessFits:false},style),[]);
  }
});

test('new furniture has finite batched geometry inside its declared plan rectangle',()=>{
  const materials=Object.fromEntries(['metal','wood','woodLight','stone','stoneLight','linen','styleAccent','hedge'].map(k=>[k,new THREE.MeshStandardMaterial()]));
  for(const id of ['hidden-bali','beach-house','organic-modern','modern-minimal','space-age']){
    const style=getDesignStyle(id),s={...defaults,designStyle:id};
    for(const p of terrace(data,s).items){
      const g=createStyledResortPiece(style,materials,{...p,z:3});
      const b=new THREE.Box3().setFromObject(g);
      assert.ok(b.min.x>=p.x-.001&&b.max.x<=p.x+p.width+.001,id+' '+p.kind+' x');
      assert.ok(b.min.z>=p.y-.001&&b.max.z<=p.y+p.length+.001,id+' '+p.kind+' y');
      assert.ok(b.min.y>=2.999&&b.max.y<4.1);
      assert.ok(g.children.length<=6,'Each piece batches its finishes');
      g.traverse(o=>{if(o.geometry){assert.ok([...o.geometry.attributes.position.array].every(Number.isFinite));o.geometry.dispose();}});
    }
  }
  Object.values(materials).forEach(m=>m.dispose());
});

test('resort lights form a restrained bounded hierarchy and retain all independent switches',()=>{
  const original=createGardenNightLighting(defaults,data);const originalPower=original.group.children.filter(o=>o.isLight).reduce((v,l)=>v+l.userData.nominalIntensity,0);
  try{for(const style of proposals){
    const s={...defaults,designStyle:style.id},lighting=createGardenNightLighting(s,data,{style});
    try{
      const lights=lighting.group.children.filter(o=>o.isLight),r=RESORT_GARDEN_RECIPES[style.id];
      assert.ok(lighting.lightCount<=27&&lighting.lightCount===lights.length);
      assert.ok(lights.filter(l=>l.userData.nightChannel==='hedge').length<=r.hedgeCount);
      assert.ok(lights.filter(l=>l.castShadow).length<=r.treeCount);
      const nominalPower=lights.reduce((v,l)=>v+l.userData.nominalIntensity,0);
      assert.ok(nominalPower<350&&nominalPower<originalPower*.75,'Additional path pendants stay within the reduced whole-garden light budget');
      assert.ok(lights.filter(l=>l.userData.nightChannel==='hedge').every(l=>l.userData.nominalIntensity<=14&&l.distance<=3.8));
      assert.equal(lighting.fixtures.some(f=>f.id==='terrace-pendant-1'),terrace(data,s).items.some(f=>f.kind==='table'),
        'A sheltered coffee table has its own light; compact spa-only compositions do not create a pendant over the water');
      for(const channel of ['garden','pendant','hedge']){
        lighting.apply({gardenStrength:channel==='garden'?.5:0,pendantStrength:channel==='pendant'?.5:0,hedgeStrength:channel==='hedge'?.5:0});
        assert.ok(lights.every(l=>l.visible===(l.userData.nightChannel===channel)));
      }
      lighting.apply(0);assert.ok(lights.every(l=>l.intensity===0&&!l.visible));
    }finally{lighting.dispose();}
  }}finally{original.dispose();}
});
