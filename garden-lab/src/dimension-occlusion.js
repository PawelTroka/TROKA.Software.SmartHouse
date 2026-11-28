import * as THREE from '../vendor/three.module.js';

// Measurement rays need one blocking surface, not a sorted list of every
// triangle hit. A cached, exact triangle hierarchy also keeps a material batch
// spanning an entire furnished storey from becoming a linear triangle scan.
const geometryTrees=new WeakMap();
const opaque=m=>m&&m.visible!==false&&(!m.transparent||m.opacity>=.85)&&!(m.alphaTest>0);
const visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};

function buildTree(geometry){
  const position=geometry.attributes.position,index=geometry.index;
  const count=Math.floor((index?.count??position.count)/3),ids=new Uint32Array(count),bounds=new Float32Array(count*6),centers=new Float32Array(count*3);
  const rangeStart=geometry.drawRange.start||0,rangeEnd=Math.min(index?.count??position.count,rangeStart+geometry.drawRange.count);
  for(let t=0;t<count;t++){
    ids[t]=t;
    for(let axis=0;axis<3;axis++){
      let lo=Infinity,hi=-Infinity;
      for(let j=0;j<3;j++){const vertex=index?index.getX(t*3+j):t*3+j,value=position.getComponent(vertex,axis);lo=Math.min(lo,value);hi=Math.max(hi,value);}
      bounds[t*6+axis]=lo;bounds[t*6+axis+3]=hi;centers[t*3+axis]=(lo+hi)/2;
    }
  }
  const nodes=[];
  function split(start,end,depth){
    const n={lo:[Infinity,Infinity,Infinity],hi:[-Infinity,-Infinity,-Infinity],start,end,left:-1,right:-1},id=nodes.length;nodes.push(n);
    for(let i=start;i<end;i++)for(let axis=0;axis<3;axis++){n.lo[axis]=Math.min(n.lo[axis],bounds[ids[i]*6+axis]);n.hi[axis]=Math.max(n.hi[axis],bounds[ids[i]*6+axis+3]);}
    if(end-start<=16||depth>=32)return id;
    let axis=0;for(let a=1;a<3;a++)if(n.hi[a]-n.lo[a]>n.hi[axis]-n.lo[axis])axis=a;
    const middle=(n.lo[axis]+n.hi[axis])/2;let left=start,right=end-1;
    while(left<=right){if(centers[ids[left]*3+axis]<middle)left++;else{const v=ids[left];ids[left]=ids[right];ids[right--]=v;}}
    // Degenerate/coplanar clusters are still bounded in size; a balanced index
    // split avoids unbounded recursion without moving any original triangles.
    if(left===start||left===end)left=(start+end)>>1;
    n.left=split(start,left,depth+1);n.right=split(left,end,depth+1);return id;
  }
  if(count)split(0,count,0);
  const tree={nodes,ids,position,index,rangeStart,rangeEnd,groups:geometry.groups};
  geometryTrees.set(geometry,tree);return tree;
}

function overlapsRay(node,origin,direction,far){
  let lo=0,hi=far;
  for(let axis=0;axis<3;axis++){
    const o=origin.getComponent(axis),d=direction.getComponent(axis);
    if(Math.abs(d)<1e-12){if(o<node.lo[axis]-1e-6||o>node.hi[axis]+1e-6)return false;continue;}
    let a=(node.lo[axis]-1e-6-o)/d,b=(node.hi[axis]+1e-6-o)/d;if(a>b){const v=a;a=b;b=v;}
    lo=Math.max(lo,a);hi=Math.min(hi,b);if(hi<lo)return false;
  }
  return true;
}

/** Build once after a model edit; refresh visibility/transforms once per label
 * layout, never mutate the scene's picking methods or render geometry. */
export function createDimensionOcclusionIndex(roots=[]){
  const entries=[],ray=new THREE.Ray(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),hit=new THREE.Vector3(),end=new THREE.Vector3(),stack=[];
  let queries=0,triangleTests=0,boxTests=0;
  for(const root of roots.filter(Boolean)){
    root.updateWorldMatrix(true,true);
    root.traverse(mesh=>{
      if(!mesh.isMesh||mesh.isInstancedMesh||!mesh.geometry?.attributes.position||mesh.userData.dimensionOverlay)return;
      if(!(Array.isArray(mesh.material)?mesh.material:[mesh.material]).some(opaque))return;
      entries.push({mesh,tree:geometryTrees.get(mesh.geometry)||buildTree(mesh.geometry),inverse:mesh.matrixWorld.clone().invert(),active:true});
    });
  }
  function refresh(){for(const root of roots.filter(Boolean))root.updateWorldMatrix(true,true);for(const entry of entries){entry.active=visible(entry.mesh);if(entry.active)entry.inverse.copy(entry.mesh.matrixWorld).invert();}}
  function blocked(origin,direction,far,near=.035){
    queries++;
    end.copy(origin).addScaledVector(direction,far);
    for(const entry of entries){
      const {mesh,tree,inverse}=entry;if(!entry.active||!tree.nodes.length)continue;
      ray.origin.copy(origin).applyMatrix4(inverse);hit.copy(end).applyMatrix4(inverse);ray.direction.copy(hit).sub(ray.origin);
      const localFar=ray.direction.length();ray.direction.multiplyScalar(1/localFar);const localNear=near*localFar/far;
      stack.length=0;stack.push(0);
      while(stack.length){
        const node=tree.nodes[stack.pop()];boxTests++;if(!overlapsRay(node,ray.origin,ray.direction,localFar))continue;
        if(node.left>=0){stack.push(node.right,node.left);continue;}
        for(let i=node.start;i<node.end;i++){
          const t=tree.ids[i],offset=t*3;if(offset<tree.rangeStart||offset+2>=tree.rangeEnd)continue;
          const material=Array.isArray(mesh.material)?mesh.material[tree.groups.find(g=>offset>=g.start&&offset<g.start+g.count)?.materialIndex??0]:mesh.material;
          if(!opaque(material))continue;
          a.fromBufferAttribute(tree.position,tree.index?tree.index.getX(offset):offset);
          b.fromBufferAttribute(tree.position,tree.index?tree.index.getX(offset+1):offset+1);
          c.fromBufferAttribute(tree.position,tree.index?tree.index.getX(offset+2):offset+2);
          triangleTests++;
          const point=material.side===THREE.BackSide?ray.intersectTriangle(c,b,a,true,hit):ray.intersectTriangle(a,b,c,material.side!==THREE.DoubleSide,hit);
          if(point){const distance=point.distanceTo(ray.origin);if(distance>=localNear&&distance<localFar)return true;}
        }
      }
    }
    return false;
  }
  refresh();
  return {refresh,blocked,getDiagnostics:()=>({meshes:entries.length,queries,triangleTests,boxTests,method:'cached-triangle-bvh'})};
}
