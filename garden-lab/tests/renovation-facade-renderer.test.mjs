import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {DESIGN_STYLES} from '../src/design-styles.js';
import {mappedHouseFacadeLayout} from '../src/mapped-house-facades.js';
import {facadePoint} from '../src/house-appearance.js';
import {createRenovationFacadeGroup} from '../src/scene-renovation-facades.js';

const data=JSON.parse(readFileSync(new URL('../data/nadmorska-17.json',import.meta.url)));
const palette=()=>Object.fromEntries(['wall','plinth','metal','glass'].map(key=>[key,new THREE.MeshStandardMaterial({color:'#d8dbd7',side:THREE.FrontSide,
  ...(key==='glass'?{transparent:true,opacity:.13,depthWrite:false}:{})})]));
const dispose=(group,materials)=>{const all=new Set(Object.values(materials));group?.traverse(o=>{o.geometry?.dispose();if(o.material)all.add(o.material);});all.forEach(m=>m.dispose());};
const ray=(edge,x,z,meshes)=>{
  const p=facadePoint(edge,x,z,.25);
  return new THREE.Raycaster(new THREE.Vector3(p[0],p[2],p[1]),new THREE.Vector3(-edge.outward[0],0,-edge.outward[1]),0,.35).intersectObjects(meshes,false);
};

test('all mapped renovations batch real cut walls and frames into four meshes, with actual opening metadata',()=>{
  for(const style of DESIGN_STYLES.filter(s=>s.renovation)){
    const layout=mappedHouseFacadeLayout(data,{designStyle:style.id,floorHeight:1.7}),materials=palette(),group=createRenovationFacadeGroup(layout,materials);
    try{
      group.updateMatrixWorld(true);
      assert.equal(group.children.length,4,'Opaque wall cells and bars must not each add a draw call');
      assert.equal(group.userData.openingCount,layout.windows.length);
      assert.equal(group.userData.paneCount,layout.windows.reduce((n,w)=>n+w.panes,0));
      assert.equal(group.userData.transomCount,layout.windows.reduce((n,w)=>n+w.transoms,0));
      const walls=group.children.filter(m=>['wall','plinth'].includes(m.userData.renovationFacadeRole));
      for(const w of layout.windows){
        const edge=layout.edges[w.edgeIndex];
        for(const u of [.18,.47,.82])assert.equal(ray(edge,w.lo+(w.hi-w.lo)*u,w.z+w.height*.43,walls).length,0,style.id+': opaque wall seals '+w.id);
      }
      for(const mesh of group.children)for(const attribute of ['position','normal','uv'])
        assert.ok(mesh.geometry.attributes[attribute].array.every(Number.isFinite));
    }finally{dispose(group,materials);}
  }
});

function example(reverse=false){
  const edge={index:0,a:reverse?[6,0]:[0,0],b:reverse?[0,0]:[6,0],length:6,direction:reverse?[-1,0]:[1,0],outward:[0,-1],
    roofEdge:{points:reverse?[[6,0,6],[0,0,6]]:[[0,0,6],[6,0,6]],fractions:[0,1]}};
  const windows=[{id:'workshop',kind:'window',edgeIndex:0,lo:.7,hi:2.7,z:.8,height:2.2,panes:3,transoms:2,frameWidth:.08,glazing:'clear'},
    {id:'bath',kind:'window',edgeIndex:0,lo:3.4,hi:5.3,z:1.5,height:.7,panes:1,transoms:0,frameWidth:.07,glazing:'privacy'}];
  return {baseZ:0,floorZ:.4,edges:[edge],windows:windows.map(w=>reverse?{...w,lo:6-w.hi,hi:6-w.lo}:w),architectureProposal:{styleId:'industrial-loft'}};
}

test('real jambs meet the glass without open strips, divisions are physical, and private glazing stays frosted',()=>{
  const layout=example(),materials=palette(),group=createRenovationFacadeGroup(layout,materials),edge=layout.edges[0],opening=layout.windows[0];
  try{
    group.updateMatrixWorld(true);
    const frame=group.children.find(m=>m.userData.renovationFacadeRole==='frame'),glazing=group.children.filter(m=>m.userData.renovationFacadeRole.includes('glass'));
    const width=opening.hi-opening.lo,f=opening.frameWidth,z=opening.z+opening.height*.2;
    // This includes the strip formerly left between a half-width outer jamb
    // and a pane inset by the full specified frame width.
    for(const x of [f*.25,f*.75,f*1.25,width/2,width-f*1.25,width-f*.75,width-f*.25])
      assert.ok(ray(edge,opening.lo+x,z,[frame,...glazing]).length>0,'Uncovered window perimeter at '+x);
    const runs=[];let active=false;
    for(let i=0;i<=500;i++){
      const x=opening.lo+width*i/500,hit=ray(edge,x,z,[frame]).length>0;
      if(hit&&!active)runs.push([]);if(hit)runs.at(-1).push(x);active=hit;
    }
    assert.equal(runs.length,opening.panes+1,'Two jambs plus exactly two interior mullions');
    const centres=runs.slice(1,-1).map(run=>(run[0]+run.at(-1))/2);
    centres.forEach((x,i)=>assert.ok(Math.abs(x-(opening.lo+width*(i+1)/opening.panes))<.01));
    for(let row=1;row<=opening.transoms;row++)
      assert.ok(ray(edge,opening.lo+width*.13,opening.z+opening.height*row/(opening.transoms+1),[frame]).length>0,'Missing physical transom');
    assert.equal(group.userData.paneCount,4);assert.equal(group.userData.mullionCount,2);assert.equal(group.userData.transomCount,2);
    const privacy=group.children.find(m=>m.userData.renovationFacadeRole==='privacy-glass');
    assert.notEqual(privacy.material,materials.glass);assert.ok(privacy.material.opacity>=.8&&privacy.material.roughness>=.7);
    assert.equal(privacy.material.userData.transient,true);assert.equal(materials.glass.opacity,.13,'Frosting cannot mutate clear glazing');
  }finally{dispose(group,materials);}
});

test('mapped wall, glass and frame faces keep outward normals under reversed winding; Current creates nothing',()=>{
  const signatures=[];
  for(const reverse of [false,true]){
    const layout=example(reverse),materials=palette(),group=createRenovationFacadeGroup(layout,materials),edge=layout.edges[0];
    try{
      group.updateMatrixWorld(true);
      for(const mesh of group.children){
        const normal=mesh.geometry.attributes.normal;
        for(let i=0;i<normal.count;i++){assert.ok(Math.abs(normal.getX(i))<1e-6&&Math.abs(normal.getY(i))<1e-6);assert.ok(normal.getZ(i)<-.999);}
      }
      assert.ok(ray(edge,.4,.2,group.children).length>0,'The exterior side must be visible with FrontSide materials');
      const vertices=group.children.flatMap(m=>{
        const p=m.geometry.attributes.position,result=[];
        for(let i=0;i<p.count;i++)result.push([p.getX(i),p.getY(i),p.getZ(i)].map(n=>Math.round(n*1e5)).join(','));return result;
      });
      signatures.push([...new Set(vertices)].sort());
    }finally{dispose(group,materials);}
  }
  assert.deepEqual(signatures[0],signatures[1]);
  const materials=palette(),original=mappedHouseFacadeLayout(data,{designStyle:'current',floorHeight:1.7}),before=JSON.stringify(original);
  assert.equal(createRenovationFacadeGroup(original,materials),null);assert.equal(JSON.stringify(original),before);dispose(null,materials);
});
