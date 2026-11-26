import * as THREE from '../vendor/three.module.js';

// Metric, original furniture geometry. These meshes describe surface details,
// not a new furniture footprint or a change to the analytical site geometry.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const signPow=(v,p)=>Math.sign(v)*Math.abs(v)**p;

/** A small real edge radius catches highlights without expanding the solid.
 * Unlike a scaled unit bevel, its radius is in metres on every axis. */
export function beveledBoxGeometry(width,height,depth,{radius=.004,segments=2}={}) {
  const half=[width/2,height/2,depth/2],r=clamp(radius,.00001,Math.min(...half)*.9);
  const steps=clamp(Math.round(segments),1,4),positions=[],normals=[],uvs=[],indices=[];
  const samples=h=>{
    const low=Array.from({length:steps+1},(_,i)=>-h+r*i/steps);
    return [...low,...low.map(n=>-n).reverse()];
  };
  // cross(local-u,local-v) points out of each face.
  for(const [fixed,side,u,us,v,vs]of [[0,1,1,1,2,1],[0,-1,1,1,2,-1],
    [1,1,0,1,2,-1],[1,-1,0,1,2,1],[2,1,0,1,1,1],[2,-1,0,-1,1,1]]){
    const a=samples(half[u]),b=samples(half[v]),start=positions.length/3;
    for(const bv of b)for(const av of a){
      const p=[0,0,0];p[fixed]=side*half[fixed];p[u]=av*us;p[v]=bv*vs;
      const core=p.map((n,i)=>clamp(n,-half[i]+r,half[i]-r));
      const normal=new THREE.Vector3(...p.map((n,i)=>n-core[i])).normalize();
      positions.push(...core.map((n,i)=>n+normal.getComponent(i)*r));
      normals.push(normal.x,normal.y,normal.z);
      // Metre UVs keep grain and weave from stretching on longer members.
      uvs.push(av+half[u],bv+half[v]);
    }
    for(let row=0;row<b.length-1;row++)for(let col=0;col<a.length-1;col++){
      const i=start+row*a.length+col;
      indices.push(i,i+1,i+a.length,i+1,i+a.length+1,i+a.length);
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);
  g.userData.detail='metric-edge-radius';return g;
}

function dimensions(w,h,d,axis){return axis==='z'?[w,d,h]:axis==='x'?[h,w,d]:[w,h,d];}
function orient(g,axis){if(axis==='z')g.rotateX(Math.PI/2);else if(axis==='x')g.rotateZ(-Math.PI/2);return g;}
function cushionPoint(width,height,depth,u,v,roundness,crease) {
  const ring=Math.max(0,Math.cos(u))**.48,exponent=2/roundness;
  const x=width/2*ring*signPow(Math.cos(v),exponent),z=depth/2*ring*signPow(Math.sin(v),exponent);
  let y=height/2*signPow(Math.sin(u),.48);
  // A few shallow compression folds converge on the sewn edge. Nothing grows
  // outside the specified envelope, and identical parts remain deterministic.
  const shoulder=Math.exp(-(((Math.abs(Math.sin(u))-.48)/.24)**2));
  const fold=(.5+.5*Math.sin(v*12+.65*Math.sin(v*3)))**8;
  y*=1-Math.min(.11,crease/Math.max(.001,height/2))*shoulder*fold;
  return [x,y,z];
}

/** A closed, inflated cushion with curved faces rather than a flat extrusion.
 * axis is the thin axis of a seat, back cushion, arm pad or pillow. */
export function cushionGeometry(width,height,depth,{axis='y',roundness=5,segments=40,rings=12,crease=.0025}={}) {
  const [w,h,d]=dimensions(width,height,depth,axis),n=Math.max(16,Math.round(segments/4)*4),rows=Math.max(8,Math.round(rings/2)*2);
  const positions=[0,-h/2,0],uvs=[w/2,d/2],indices=[];
  for(let j=1;j<rows;j++)for(let i=0;i<=n;i++){
    const p=cushionPoint(w,h,d,-Math.PI/2+j*Math.PI/rows,i*2*Math.PI/n,roundness,crease);
    positions.push(...p);uvs.push(p[0]+w/2,p[2]+d/2);
  }
  const top=positions.length/3;positions.push(0,h/2,0);uvs.push(w/2,d/2);
  for(let i=0;i<n;i++)indices.push(0,1+i,2+i);
  for(let j=0;j<rows-2;j++)for(let i=0;i<n;i++){
    const a=1+j*(n+1)+i,b=a+n+1;
    indices.push(a,b,a+1,b,b+1,a+1);
  }
  for(let i=0;i<n;i++)indices.push(top,1+(rows-2)*(n+1)+i+1,1+(rows-2)*(n+1)+i);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();
  // The UV seam duplicates a vertex. Share its normal so the seam does not
  // appear as an unintentional lighting crease on the fabric.
  const normal=g.attributes.normal;
  for(let j=0;j<rows-1;j++){
    const a=1+j*(n+1),b=a+n,v=new THREE.Vector3().fromBufferAttribute(normal,a).add(new THREE.Vector3().fromBufferAttribute(normal,b)).normalize();
    normal.setXYZ(a,v.x,v.y,v.z);normal.setXYZ(b,v.x,v.y,v.z);
  }
  g.userData.detail='inflated-upholstery';return orient(g,axis);
}

/** A sewn welt follows the cushion's upper shoulder and is inset so its tube
 * remains within the same measured envelope. It can share the fabric finish. */
export function cushionPipingGeometry(width,height,depth,{axis='y',roundness=5,radius=.0022,segments=56,level=.31}={}) {
  const [w,h,d]=dimensions(width,height,depth,axis),r=Math.min(radius,w*.015,h*.025,d*.015);
  const u=Math.asin(Math.abs(level*2)**(1/.48))*Math.sign(level),points=[];
  for(let i=0;i<segments;i++)points.push(new THREE.Vector3(...cushionPoint(w-2*r,h-2*r,d-2*r,u,i*2*Math.PI/segments,roundness,0)));
  const path=new THREE.CatmullRomCurve3(points,true,'centripetal');
  const g=new THREE.TubeGeometry(path,segments,r,4,true);
  g.userData.detail='sewn-welt';return orient(g,axis);
}

/** Open interlaced reeds, with a real over/under at every crossing. The ribbon
 * surfaces include their back faces; no alpha blending or extra draw is used. */
export function wovenPanelGeometry(width,height,{pitch=.034,strip=.008,relief=.0025}={}) {
  const nx=clamp(Math.round(width/pitch),3,48),ny=clamp(Math.round(height/pitch),3,36);
  const sx=width/nx,sy=height/ny,ribbon=Math.min(strip,sx*.35,sy*.35),thickness=.001;
  const positions=[],uvs=[],indices=[];
  function band(vertical,n,count,along,crossStep){
    const coord=-along/2+(n+.5)*crossStep,steps=(vertical?ny:nx)*2;
    const span=vertical?height:width,crosses=vertical?ny:nx;
    for(let face=0;face<2;face++){
      const start=positions.length/3;
      for(let j=0;j<=steps;j++)for(const edge of [-1,1]){
        const a=-span/2+span*j/steps,b=coord+edge*ribbon/2;
        const z=(vertical?1:-1)*relief*Math.cos(Math.PI*(j/steps*crosses-.5+n))+(face?-.5:.5)*thickness;
        const x=vertical?b:a,y=vertical?a:b;positions.push(x,y,z);uvs.push(x+width/2,y+height/2);
      }
      for(let j=0;j<steps;j++){
        const a=start+j*2,quad=vertical?[a,a+1,a+2,a+1,a+3,a+2]:[a,a+2,a+1,a+1,a+2,a+3];
        if(face)for(let k=0;k<quad.length;k+=3)indices.push(quad[k],quad[k+2],quad[k+1]);else indices.push(...quad);
      }
    }
  }
  for(let i=0;i<nx;i++)band(true,i,nx,width,sx);
  for(let i=0;i<ny;i++)band(false,i,ny,height,sy);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();
  g.userData.detail='interlaced-open-reeds';return g;
}
