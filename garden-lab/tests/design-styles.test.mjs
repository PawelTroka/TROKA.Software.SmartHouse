import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {DEFAULT_DESIGN_STYLE, DESIGN_STYLES, getDesignStyle, designStyleSearchText} from '../src/design-styles.js';
import {pendantLightingLayout} from '../src/pendant-layout.js';
import {createStyledDeck,createStyledLounger,createStyledSideTable,createStyledDining,createStyledCanopyTrim} from '../src/scene-style-details.js';
import {createGardenNightLighting} from '../src/scene-night-lights.js';
import {createStateModel} from '../src/state.js';
import {getSiteProfile} from '../src/sites.js';

const proposals=DESIGN_STYLES.filter(item=>item.id!==DEFAULT_DESIGN_STYLE);
const roles=['metal','wood','woodLight','stone','stoneLight','linen','styleAccent'];
const materials=Object.fromEntries(roles.map(role=>[role,new THREE.MeshStandardMaterial()]));
const sites=['site-data.json','korzeniowskiego-40.json','nadmorska-17.json'].map(file=>
  JSON.parse(readFileSync(new URL('../data/'+file,import.meta.url))));
const bounds=group=>new THREE.Box3().setFromObject(group);
const fits=(lo,hi,lower,upper)=>lo>=lower-1e-5&&hi<=upper+1e-5;
const snapshot=group=>group.children.map(item=>Array.from(item.geometry.attributes.position.array));
const rect={x:4.1,y:8.5,z:2.4,width:.78,length:2};

test('style IDs are stable, unique and all proposals have different architectural recipes',()=>{
  assert.equal(getDesignStyle('__proto__').id,DEFAULT_DESIGN_STYLE);
  assert.equal(getDesignStyle(null).id,DEFAULT_DESIGN_STYLE);
  assert.equal(new Set(DESIGN_STYLES.map(s=>s.id)).size,23);
  assert.equal(new Set(proposals.map(s=>JSON.stringify(s.recipe))).size,22);
  for(const style of DESIGN_STYLES){
    assert.equal(getDesignStyle(style.id),style);
    assert.ok(Object.isFrozen(style.recipe.module)&&Object.isFrozen(style.palette));
    for(const value of Object.values(style.palette))assert.match(value,/^#[0-9a-f]{6}$/i);
    assert.deepEqual(Object.keys(style.finishes),['surface','furniture','canopy','lighting']);
  }
});

test('Coastal is an explicit searchable choice with a different physical scheme from Baltic Dune',()=>{
  const coastal=getDesignStyle('coastal'),dune=getDesignStyle('baltic-dune');
  assert.equal(coastal.id,'coastal');assert.equal(coastal.label,'Coastal');
  for(const query of ['coastal','seaside','hamptons','new england','cape cod'])
    assert.ok(DESIGN_STYLES.filter(style=>designStyleSearchText(style).includes(query)).includes(coastal),query);
  assert.ok(Object.isFrozen(coastal.aliases));
  for(const key of ['paving','furniture','canopy'])assert.notEqual(coastal.recipe[key],dune.recipe[key]);
  for(const key of ['field','pitch','trim'])assert.notEqual(coastal.renovation[key],dune.renovation[key]);
  for(const [make,r]of [[createStyledLounger,rect],[createStyledSideTable,{...rect,width:.65,length:.65}],
    [createStyledDining,{...rect,width:3.5,length:2.8}]]){
    const coast=make(coastal,materials,r),baltic=make(dune,materials,r);
    assert.notDeepEqual(snapshot(coast),snapshot(baltic),'Furniture vertices change with identical materials');
    for(const group of [coast,baltic])group.traverse(mesh=>mesh.geometry?.dispose());
  }
});

test('every bond clips diagonal and horizontal joints to the physical terrace and tub cutout',()=>{
  const hole={x0:4.59,x1:6.3,y0:9.1,y1:11.37};
  const area={x:2.1,y:8.5,width:8.4,length:4,z:2.4,hole};
  for(const svgMode of [false,true])for(const style of proposals){
    const group=createStyledDeck(style,area,{svgMode});
    assert.equal(group.children.length,1,'A single draw for the complete bond');
    assert.equal(group.children[0].renderOrder,svgMode?-76:0);
    const p=group.children[0].geometry.attributes.position;
    for(let i=0;i<p.count;i+=2){
      // Sample each joint at interior fractions as well as its clipped ends.
      for(const t of [0,.025,.1,.25,.5,.75,.9,.975,1]){
        const x=area.x+p.getX(i)+(p.getX(i+1)-p.getX(i))*t;
        const y=area.y+p.getZ(i)+(p.getZ(i+1)-p.getZ(i))*t;
        assert.ok(fits(x,x,area.x,area.x+area.width)&&fits(y,y,area.y,area.y+area.length),style.id);
        assert.ok(!(x>hole.x0+1e-5&&x<hole.x1-1e-5&&y>hole.y0+1e-5&&y<hole.y1-1e-5),style.id);
      }
    }
  }
});

test('furniture stays inside the corresponding existing footprint and casts visible sun shadows',()=>{
  for(const style of proposals){
    for(const [make,r] of [[createStyledLounger,rect],[createStyledSideTable,{...rect,width:.65,length:.65}],
      [createStyledDining,{...rect,width:3.5,length:2.8}]]){
      const group=make(style,materials,r),b=bounds(group);
      assert.ok(group.children.length>0&&group.children.length<=6,style.id);
      assert.ok(fits(b.min.x,b.max.x,r.x,r.x+r.width)&&fits(b.min.z,b.max.z,r.y,r.y+r.length),style.id);
      assert.ok(group.children.every(mesh=>mesh.castShadow===!mesh.material.transparent&&Object.values(materials).includes(mesh.material)),style.id);
      assert.ok(b.max.y<r.z+.85);
    }
  }
  const scandi=createStyledLounger(getDesignStyle('scandinavian'),materials,rect);
  const japandi=createStyledLounger(getDesignStyle('japandi'),materials,rect);
  assert.notDeepEqual(snapshot(scandi),snapshot(japandi));
  assert.deepEqual(snapshot(scandi),snapshot(createStyledLounger(getDesignStyle('scandinavian'),materials,rect)));
});

test('canopy details fit the selected roof, fascia and existing 75 mm front overhang',()=>{
  const b={x0:3,x1:10,y0:12.1,y1:15.1,z:4,fasciaBottomZ:3.45};
  for(const style of proposals){
    const trim=createStyledCanopyTrim(style,materials,b),box=bounds(trim);
    assert.ok(trim.children.length>0&&trim.children.length<=3,style.id);
    assert.ok(fits(box.min.x,box.max.x,b.x0-.002,b.x1+.002),style.id);
    assert.ok(fits(box.min.z,box.max.z,b.y0,b.y1+.08),style.id);
    assert.ok(fits(box.min.y,box.max.y,b.fasciaBottomZ,b.z),style.id);
  }
});

test('SVG furniture has finite local cap triangles and zero fascia depth adds no front accent',()=>{
  for(const style of proposals){
    const group=createStyledLounger(style,materials,rect,{svgMode:true});
    assert.ok(group.children.every(mesh=>Array.from(mesh.geometry.attributes.position.array).every(Number.isFinite)));
    assert.ok(group.children.every(mesh=>mesh.castShadow===false),'The diagram fallback has no WebGL shadow pass');
    assert.ok(fits(bounds(group).min.x,bounds(group).max.x,rect.x,rect.x+rect.width));
  }
  const flat={x0:0,x1:8,y0:0,y1:4,z:3,fasciaBottomZ:3};
  assert.equal(createStyledCanopyTrim(getDesignStyle('space-age'),materials,flat).children.length,0);
  assert.ok(createStyledCanopyTrim(getDesignStyle('hidden-bali'),materials,flat).children.length>0);
});

test('styled luminaires follow each composition and retain independent dimmers',()=>{
  for(const data of sites){
    const settings=createStateModel(getSiteProfile(data.site.id,data)).DEFAULTS;
    const original=createGardenNightLighting(settings,data);
    try{
      for(const id of ['hidden-bali','space-age','organic-japandi','mediterranean-villa','party-club','coastal']){
        const style=getDesignStyle(id),lighting=createGardenNightLighting(settings,data,{style});
        try{
          const expected=pendantLightingLayout({...settings,designStyle:id},data);
          assert.deepEqual(lighting.fixtures.filter(f=>f.channel).map(f=>f.id),[...expected.garden,...expected.hedge].map(f=>f.id));
          assert.ok(lighting.lightCount<=original.lightCount,'Selective resort lighting stays below the original GPU budget');
          assert.ok(expected.hedge.length<=9);
          lighting.apply({gardenStrength:0,pendantStrength:.8,hedgeStrength:0});
          for(const f of lighting.fixtures.filter(f=>f.channel)){
            const shade=lighting.group.getObjectByName(f.id+'-'+style.recipe.fixture+'-shade');
            assert.ok(shade,style.id);
            assert.ok(shade.geometry.attributes.position.count>0);
            assert.equal(shade.material.emissiveIntensity>0,f.channel==='pendant');
          }
          const hedge=lighting.fixtures.filter(f=>f.channel==='hedge');
          const sameSize=hedge.filter(f=>f.radius===hedge[0]?.radius&&f.height===hedge[0]?.height);
          if(sameSize.length>1){
            const geos=sameSize.map(f=>lighting.group.getObjectByName(f.id+'-'+style.recipe.fixture+'-shade').geometry);
            assert.equal(new Set(geos).size,1,'identical shades share geometry');
          }
          lighting.apply(0);
          assert.ok(lighting.group.children.filter(m=>m.isLight).every(m=>!m.visible));
        }finally{lighting.dispose();}
      }
    }finally{original.dispose();}
  }
});

test('Beach House is a separate contemporary resort scheme, not a Coastal search alias',()=>{
  const beach=getDesignStyle('beach-house');
  assert.equal(beach.label,'Beach House');
  assert.ok(designStyleSearchText(beach).includes('beach house'));
  assert.ok(!getDesignStyle('coastal').aliases.includes('beach house'));
  for(const other of ['coastal','baltic-dune']){
    assert.notEqual(beach.recipe.furniture,getDesignStyle(other).recipe.furniture);
    assert.notEqual(beach.recipe.canopy,getDesignStyle(other).recipe.canopy);
    assert.notEqual(beach.recipe.fixture,getDesignStyle(other).recipe.fixture);
  }
});
