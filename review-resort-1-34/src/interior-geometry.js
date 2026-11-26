import * as THREE from '../vendor/three.module.js';
import {projectArchitecturalMaterialUVs} from './material-assets.js?v=1.34.0';

const EPS = 1e-7;
const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
export function containsPoint(ring, x, z) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export function ringBounds(ring) {
  const xs = ring.map(p => p[0]), zs = ring.map(p => p[1]);
  const x0 = Math.min(...xs), z0 = Math.min(...zs), x1 = Math.max(...xs), z1 = Math.max(...zs);
  return {x0, x1, z0, z1, width: x1 - x0, depth: z1 - z0, x: (x1+x0)/2, z: (z1+z0)/2};
}
function splitAtEdge(poly, a, b, sign) {
  const inner = [], outer = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i+1) % poly.length], dp = sign*cross(a,b,p), dq = sign*cross(a,b,q);
    if (dp >= -EPS) inner.push(p);
    if (dp <= EPS) outer.push(p);
    if ((dp > EPS && dq < -EPS) || (dp < -EPS && dq > EPS)) {
      const t = dp/(dp-dq), hit = [p[0]+t*(q[0]-p[0]), p[1]+t*(q[1]-p[1])];
      inner.push(hit); outer.push(hit);
    }
  }
  return [inner, outer];
}
function triangles(ring) {
  return THREE.ShapeUtils.triangulateShape(ring.map(p => new THREE.Vector2(...p)), []).map(ids => ids.map(i => ring[i]));
}
/** Clip every floor triangle, including voids that intersect room boundaries. */
export function floorTriangles(ring, voids = []) {
  let parts = triangles(ring);
  for (const hole of voids) {
    for (const cutter of triangles(hole)) {
      const sign = Math.sign(cross(...cutter));
      if (!sign) continue;
      const result = [];
      for (let piece of parts) {
        for(let i = 0; i < 3 && piece.length >= 3; i++) {
          const [inside, outside] = splitAtEdge(piece, cutter[i], cutter[(i+1)%3], sign);
          if (outside.length > 2) result.push(outside);
          piece = inside;
        }
      }
      parts = result;
    }
  }
  return parts.flatMap(piece => piece.slice(1,-1).map((p,i) => [piece[0],p,piece[i+2]]))
    .filter(tri => Math.abs(cross(...tri)) > EPS).map(t => cross(...t) > 0 ? [t[0],t[2],t[1]] : t);
}
export function floorMesh(group, polygon, material, height=0, voids=[]) {
  const points = [], uv = [];
  for (const tri of floorTriangles(polygon, voids)) for (const [x,z] of tri) {
    points.push(x,typeof height === 'function' ? height(x,z) : height,z); uv.push(x,z);
  }
  if (!points.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo,material); mesh.receiveShadow=true; group.add(mesh); return mesh;
}
export function wallPanels(wall, height=wall.height) {
  const length = Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]);
  const openings=(wall.openings||[]).map(o => ({left:Math.max(0,o.offset),right:Math.min(length,o.offset+o.width),low:Math.max(0,o.sill||0),high:Math.min(height,(o.sill||0)+o.height)})).filter(o=>o.right>o.left&&o.high>o.low);
  const cuts = [...new Set([0,length,...openings.flatMap(o=>[o.left,o.right])])].sort((a,b)=>a-b);
  const result=[];
  for(let i=1;i<cuts.length;i++) {
    const left=cuts[i-1], right=cuts[i], x=(left+right)/2;
    let y=0;
    for(const o of openings.filter(o=>o.left<x&&o.right>x).sort((a,b)=>a.low-b.low)) {
      if(o.low>y+EPS) result.push({left,right,bottom:y,top:o.low});
      y=Math.max(y,o.high);
    }
    if(height>y+EPS) result.push({left,right,bottom:y,top:height});
  }
  return result;
}

// The furniture and architecture are static between edits. Combine compatible
// surfaces, keeping wall cutaways and transparent panes independently switchable.
export function batchGroup(group) {
  group.updateWorldMatrix(true,true);
  // Resolve timber fibres while each leg, rail and board still has its own
  // axis. The combined furniture bounds cannot recover those directions.
  let memberGrain=false;
  group.traverse(mesh=>{if(mesh.isMesh&&mesh.material?.userData.woodGrainAxis)memberGrain=true;});
  if(memberGrain)projectArchitecturalMaterialUVs(group);
  const inverse = group.matrixWorld.clone().invert(), batches = new Map(), geometries = new Set();
  // Operable assemblies keep their own transform through both wall and whole
  // storey batching. Their small child batches can then move without rebuilding
  // the static furnished house or reallocating any geometry.
  const movable=[];
  group.traverse(node=>{if(node!==group&&node.userData.preserveTransform)movable.push(node);});
  for(const node of movable){
    const local=new THREE.Matrix4().multiplyMatrices(inverse,node.matrixWorld);
    node.removeFromParent();local.decompose(node.position,node.quaternion,node.scale);
  }
  const normalMatrix=new THREE.Matrix3(), v = new THREE.Vector3();
  group.traverse(mesh => {
    if (!mesh.isMesh) return;
    const geo=mesh.geometry, mat=mesh.material, key=mat.uuid;
    if (!batches.has(key)) batches.set(key,{mat,pos:[],norm:[],uv:[],ids:[],metric:true});
    const batch=batches.get(key), matrix=new THREE.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld);
    batch.metric=batch.metric&&geo.userData.architecturalMetricUVs===true;
    normalMatrix.getNormalMatrix(matrix);
    const count=geo.attributes.position.count, offset=batch.pos.length/3;
    for(let i=0;i<count;i++) {
      v.fromBufferAttribute(geo.attributes.position,i).applyMatrix4(matrix); batch.pos.push(v.x,v.y,v.z);
      v.fromBufferAttribute(geo.attributes.normal,i).applyNormalMatrix(normalMatrix); batch.norm.push(v.x,v.y,v.z);
      const uv=geo.attributes.uv; batch.uv.push(uv?.getX(i)??0,uv?.getY(i)??0);
    }
    for(let i=0;i<(geo.index?.count??count);i++) batch.ids.push(offset+(geo.index?.getX(i)??i));
    geometries.add(geo);
  });
  group.clear();
  for(const {mat,pos,norm,uv,ids,metric} of batches.values()) {
    const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    geo.setAttribute('normal',new THREE.Float32BufferAttribute(norm,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(ids);geo.computeBoundingSphere();
    if(metric)geo.userData.architecturalMetricUVs=true;
    const mesh=new THREE.Mesh(geo,mat);mesh.castShadow=!mat.transparent;mesh.receiveShadow=true; group.add(mesh);
  }
  for(const geo of geometries) if(!geo.userData.sharedPrimitive) geo.dispose();
  for(const node of movable)group.add(node);
}

export function modelTools() {
  const cache=new Map();
  function geometry(key,create) {
    if(!cache.has(key)) {const g=create();g.userData.sharedPrimitive=true;cache.set(key,g);}
    return cache.get(key);
  }
  function mesh(parent,geo,mat,x,y,z,w=1,h=1,d=1) {
    const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z);m.scale.set(w,h,d);parent.add(m);return m;
  }
  function box(p,m,x,y,z,w,h,d) {return mesh(p,geometry('box',()=>new THREE.BoxGeometry()),m,x,y,z,w,h,d);}
  function rounded(p,m,x,y,z,w,h,d,r=.045) {
    r=Math.max(.001,Math.min(r,w*.49,h*.49,d*.49));
    const key=`r:${[w,h,d,r].map(n=>n.toFixed(4)).join(',')}`;
    const geo=geometry(key,()=>{
      // A beveled plan perimeter and rolled top and bottom, with stable UVs.
      const hw=w/2-r,hd=d/2-r,shape=new THREE.Shape();
      const cr=Math.min(r*.7,hw*.8,hd*.8), x0=-hw,x1=hw,z0=-hd,z1=hd;
      shape.moveTo(x0+cr,z0);shape.lineTo(x1-cr,z0);shape.quadraticCurveTo(x1,z0,x1,z0+cr);
      shape.lineTo(x1,z1-cr);shape.quadraticCurveTo(x1,z1,x1-cr,z1);shape.lineTo(x0+cr,z1);shape.quadraticCurveTo(x0,z1,x0,z1-cr);shape.lineTo(x0,z0+cr);shape.quadraticCurveTo(x0,z0,x0+cr,z0);
      const g=new THREE.ExtrudeGeometry(shape,{depth:h-2*r,bevelEnabled:true,bevelSegments:3,bevelThickness:r,bevelSize:r,curveSegments:3,steps:1});g.rotateX(-Math.PI/2); g.translate(0,-h/2+r,0);return g;
    });
    return mesh(p,geo,m,x,y,z);
  }
  function oval(p,m,x,y,z,w,h,d) {return mesh(p,geometry('oval',()=>new THREE.SphereGeometry(.5,20,12)),m,x,y,z,w,h,d);}
  function cyl(p,m,x,y,z,rt,rb,h,n=20) {
    return mesh(p,geometry(`c${rt}/${rb}/${n}`,()=>new THREE.CylinderGeometry(rt,rb,1,n)),m,x,y,z,1,h,1);
  }
  function rod(p,m,a,b,r=.02,rb=r) {
    const delta=new THREE.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
    const mesh=cyl(p,m,(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,r,rb,delta.length(),10);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return mesh;
  }
  function group(p,x=0,y=0,z=0,angle=0) {const g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=angle;p.add(g);return g;}
  return {box,rounded,oval,cyl,rod,group,dispose(){for(const g of cache.values())g.dispose(); cache.clear();}};
}
