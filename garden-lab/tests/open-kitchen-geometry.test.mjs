import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {getDesignStyle} from '../src/design-styles.js';
import {getInteriorStyleRecipe} from '../src/interior-style-recipes.js';
import {INTERIOR_COMPOSITIONS} from '../src/interior-curation.js';
import {getInteriorPlan} from '../src/interior-plan.js';
import {furnishInterior} from '../src/interior-furniture.js';
import {modelTools} from '../src/interior-geometry.js';

test('rendered kitchens have a real recessed sink, aligned tap and bounded island construction detail',()=>{
  const roles='wood oak frame steel bronze stone ceramic cabinet painted trim fabric linen duvet accent lacquer glow blackGlass'.split(' ');
  for(const styleId of Object.keys(INTERIOR_COMPOSITIONS)){
    const plan=getInteriorPlan({styleId}),fixtures=plan.fixtures.filter(f=>['west-counter','kitchen-sink','kitchen-island'].includes(f.id));
    const m=Object.fromEntries(roles.map(key=>[key,new THREE.MeshStandardMaterial()])),root=new THREE.Group(),tools=modelTools();
    furnishInterior(root,{...plan,fixtures},tools,{m,style:getDesignStyle(styleId),interiorRecipe:getInteriorStyleRecipe(styleId)});
    root.updateMatrixWorld(true);
    const object=id=>root.children.find(g=>g.userData.fixtureId===id),sink=fixtures.find(f=>f.id==='kitchen-sink'),island=fixtures.find(f=>f.id==='kitchen-island');
    const down=(x,z,group)=>new THREE.Raycaster(new THREE.Vector3(x,2,z),new THREE.Vector3(0,-1,0)).intersectObject(group,true);
    // A downwards ray through the bowl must pass through the host worktop and
    // reach the basin floor, rather than hit an uncut slab or solid carcass.
    const hostHits=down(sink.x,sink.z,object('west-counter'));
    assert.ok(hostHits.every(hit=>hit.point.y<.20),styleId+' sink cutout is filled by cabinetry');
    const bowlHits=down(sink.x,sink.z,object('kitchen-sink'));
    assert.ok(bowlHits.length&&bowlHits[0].point.y>.65&&bowlHits[0].point.y<.85,styleId+' bowl is not recessed below the worktop');
    const solidTop=down(sink.x,7.72,object('west-counter'));
    assert.ok(solidTop.length&&solidTop[0].point.y>.90&&solidTop[0].point.y<.94,styleId+' worktop is missing beside the sink');
    const peninsulaTop=down(sink.x,5.72,root),joinedSinkTop=down(sink.x,5.78,root);
    assert.ok(peninsulaTop.length&&joinedSinkTop.length,styleId+' has a gap at the peninsula/sink-run connection');
    assert.ok(Math.abs(peninsulaTop[0].point.y-joinedSinkTop[0].point.y)<.001,styleId+' connected worktops have a height step');
    const tap=[];
    object('kitchen-sink').traverse(n=>{if(n.isMesh){const p=n.getWorldPosition(new THREE.Vector3());if(p.y>1.10)tap.push(p);}});
    assert.ok(tap.length>=2&&tap.every(p=>Math.abs(p.z-sink.z)<.015),styleId+' high tap fittings drift off the sink/window centre');

    const islandGroup=object('kitchen-island'),bounds=new THREE.Box3().setFromObject(islandGroup);
    assert.ok(bounds.max.y<=.92,styleId+' island became a tall obstruction');
    assert.ok(bounds.min.x>=island.x-island.width/2-.01&&bounds.max.x<=island.x+island.width/2+.01,styleId+' detail consumes the entrance clearances');
    const frontAt=y=>new THREE.Raycaster(new THREE.Vector3(island.x,y,island.z+2),new THREE.Vector3(0,0,-1)).intersectObject(islandGroup,true)[0].point.z;
    assert.ok(frontAt(.27)-frontAt(.06)>.05,styleId+' island lacks a recessed toe-kick');
    assert.ok(frontAt(.27)-frontAt(.39)>.02,styleId+' drawer reveal is filled flush');
    let meshes=0;
    root.traverse(n=>{if(n.isMesh){meshes++;for(const attribute of Object.values(n.geometry.attributes))assert.ok(Array.from(attribute.array).every(Number.isFinite),styleId+' non-finite furniture geometry');}});
    assert.ok(meshes<85,styleId+' kitchen detail exceeds its bounded mesh budget');
    root.traverse(n=>{if(n.geometry&&!n.geometry.userData.sharedPrimitive)n.geometry.dispose();});
    tools.dispose();Object.values(m).forEach(material=>material.dispose());
  }
});
