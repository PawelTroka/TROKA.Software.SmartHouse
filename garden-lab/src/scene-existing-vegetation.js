import * as THREE from '../vendor/three.module.js';
import {toWorld} from './orientation.js?v=1.32.1';
import {existingCanopyRecords, existingFoliageActive} from './existing-vegetation.js?v=1.32.1';
import {pointInPolygon} from './geometry.js?v=1.32.1';

const TAU = Math.PI * 2;
function randomFor(id) {
  let seed = 2166136261;
  for (const c of String(id)) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619) >>> 0;
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** Original compound broadleaf spray. Each leaf has its own cut-out edge and
 * vein; the scan-derived crown is never rendered as a smooth opaque sphere. */
function leafTexture() {
  const size = 128, pixels = new Uint8Array(size * size * 4);
  const leaves = [[.50,.16,.09,.16,-.10],[.33,.31,.10,.17,-.62],[.68,.35,.10,.17,.61],
    [.24,.50,.11,.17,-.85],[.76,.55,.11,.17,.87],[.34,.68,.12,.18,-.65],[.66,.77,.12,.18,.65]];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + .5) / size, v = (y + .5) / size;
    let shade = 0, alpha = 0;
    for (const [cx, cy, rx, ry, angle] of leaves) {
      const a = (u-cx)*Math.cos(angle)+(v-cy)*Math.sin(angle);
      const b = -(u-cx)*Math.sin(angle)+(v-cy)*Math.cos(angle);
      const shape = (a/rx)**2+(b/ry)**2;
      if (shape <= 1) {
        alpha = Math.max(alpha, Math.min(1, (1-shape)*15));
        shade = 210 + 24*(1-shape) + (Math.abs(a)<.006 ? 15 : 0) + Math.sin(b*180+a*45)*4;
      }
    }
    if (v > .14 && v < .97 && Math.abs(u-(.49+.025*v)) < .009) { alpha = 1; shade = 180; }
    const p = (y*size+x)*4;
    pixels.set([shade*.96,shade,shade*.88,alpha*255],p);
  }
  const texture = new THREE.DataTexture(pixels,size,size,THREE.RGBAFormat);
  texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=true;
  texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
  texture.needsUpdate=true;texture.name='reconstructed-broadleaf-spray';
  return texture;
}

function crownGeometry(variant, near) {
  const random=randomFor(`canopy-${variant}-${near}`),positions=[],normals=[],uvs=[],colors=[];
  const count=near?620:210;
  for(let i=0;i<count;i++){
    const y=random()*1.90-.95,a=random()*TAU;
    const r=Math.sqrt(Math.max(0,1-y*y))*(.60+random()*.37);
    const lobe=.90+.07*Math.sin(a*5+variant+y*4)+.03*Math.cos(a*9-y*7);
    const center=new THREE.Vector3(Math.cos(a)*r*lobe,y,Math.sin(a)*r*lobe);
    const normal=new THREE.Vector3(Math.cos(a)*(.7+random()*.6),y*.6+(random()-.5)*.8,Math.sin(a)*(.7+random()*.6)).normalize();
    const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),normal).normalize();
    const up=new THREE.Vector3().crossVectors(normal,right).normalize();
    const width=(near?.19:.32)*(0.70+random()*.65),height=width*(1.0+random()*.35);
    const shade=.65+random()*.35;
    const points=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([u,v])=>{
      const p=center.clone().addScaledVector(right,u*width).addScaledVector(up,v*height);
      // Keep all visible foliage inside the measured envelope.
      if(p.length()>1)p.normalize();
      return p;
    });
    const tex=[[0,1],[1,1],[1,0],[0,0]];
    for(const j of [0,1,2,0,2,3]){positions.push(...points[j].toArray());normals.push(...normal.toArray());uvs.push(...tex[j]);colors.push(shade*.97,shade,shade*.93);}
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return geometry;
}

/** All trees share a handful of instanced foliage and wood meshes. Positions,
 * crown extents and elevations come from the scan; branch topology is visual. */
export function createExistingVegetationGroup(data,settings={}, {svgMode=false,origin=[10,20]}={}) {
  const root=new THREE.Group();root.name='existing-neighborhood-vegetation';
  root.userData.source='GUGiK classified vegetation returns';
  if(settings.existingVegetation===false)return root;
  const records=existingCanopyRecords(data);
  root.userData.canopyCount=records.length;
  if(!records.length)return root;
  const buildingFootprints=(data.buildings||[]).map(building=>building.footprint).filter(ring=>ring?.length>=3);
  root.userData.suppressedStemCanopyIds=[];
  const foliageMap=svgMode?null:leafTexture();
  const foliage=new THREE.MeshStandardMaterial({color:'#ffffff',map:foliageMap,alphaTest:.42,
    alphaToCoverage:true,side:THREE.DoubleSide,roughness:.96,vertexColors:!svgMode});
  foliage.userData.transient=true;foliage.userData.existingCanopy=true;
  foliage.addEventListener('dispose',()=>foliageMap?.dispose());
  const bark=new THREE.MeshStandardMaterial({color:'#716b5a',roughness:1});bark.userData.transient=true;
  const batches=new Map(),branches=[];
  const palette=['#567444','#607b47','#6b814c','#4d714c','#708451','#526d45'];
  for(const [index,record] of records.entries()){
    const random=randomFor(record.id),distance=Math.hypot(record.x-origin[0],record.y-origin[1]);
    const near=distance<75,variant=index%4,key=`${near}:${variant}`;
    const leafOn=existingFoliageActive(settings,record),height=record.topZ-record.baseZ;
    if(leafOn){
      if(!batches.has(key))batches.set(key,{near,variant,records:[]});
      const color=new THREE.Color(palette[index%palette.length]);
      // ALS RGB includes October foliage and photographic shadows, so it is a
      // modest hue hint rather than an unlit material albedo.
      if(/^#[0-9a-f]{6}$/i.test(record.sourceColor||''))color.lerp(new THREE.Color(record.sourceColor),.18);
      batches.get(key).records.push({record,color});
    }
    // A real crown can overhang a building, placing its aggregate centre above
    // a roof. Keep that observation, but do not invent wood growing through
    // the mapped building. The current (possibly adjusted) footprints apply.
    if(buildingFootprints.some(ring=>pointInPolygon([record.x,record.y],ring))){
      root.userData.suppressedStemCanopyIds.push(record.id);
      continue;
    }
    // Centres derived from canopy segmentation are not surveyed stem points.
    const c=[record.x,record.y,record.baseZ],fork=record.crownBaseZ+(record.topZ-record.crownBaseZ)*.38;
    const rotation=(record.rotation||0)*Math.PI/180,cos=Math.cos(rotation),sin=Math.sin(rotation);
    const crownOffset=(angle,scale)=>{
      const x=Math.cos(angle)*record.radiusX*scale,y=Math.sin(angle)*record.radiusY*scale;
      return [cos*x-sin*y,sin*x+cos*y];
    };
    const trunkRadius=Math.max(.075,Math.min(.38,height*.014));
    branches.push({a:c,b:[record.x,record.y,fork],radius:trunkRadius});
    for(let limb=0;limb<(near?7:4);limb++){
      const angle=limb*2.399963+random()*.4;
      const [dx,dy]=crownOffset(angle,.75);
      const end=[record.x+dx,record.y+dy,
        record.crownBaseZ+(record.topZ-record.crownBaseZ)*(.45+random()*.42)];
      const start=[record.x,record.y,fork-(record.topZ-record.crownBaseZ)*random()*.28];
      branches.push({a:start,b:end,radius:trunkRadius*.38});
      if(near)for(const side of [-1,1]){
        const [tx,ty]=crownOffset(angle+side*.65,.14);
        branches.push({a:end,b:[end[0]+tx,end[1]+ty,Math.min(record.topZ,end[2]+(record.topZ-fork)*.15)],radius:trunkRadius*.12});
      }
    }
  }
  const dummy=new THREE.Object3D();
  if(svgMode){
    const geometry=new THREE.IcosahedronGeometry(1,1);
    for(const {records:items}of batches.values())for(const {record,color}of items){
      const material=foliage.clone();material.color.set(color);material.userData.transient=true;
      const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...toWorld(record.x,record.y,(record.crownBaseZ+record.topZ)/2));
      mesh.scale.set(record.radiusX,(record.topZ-record.crownBaseZ)/2,record.radiusY);
      mesh.rotation.y=-(record.rotation||0)*Math.PI/180;root.add(mesh);
    }
    foliage.dispose();bark.dispose();return root;
  }
  for(const {near,variant,records:items}of batches.values()){
    const mesh=new THREE.InstancedMesh(crownGeometry(variant,near),foliage,items.length);
    mesh.name=`existing-canopies-${near?'near':'far'}-${variant}`;mesh.castShadow=settings.existingCanopyAnalysis!==false;mesh.receiveShadow=true;
    items.forEach(({record,color},i)=>{
      dummy.position.set(...toWorld(record.x,record.y,(record.crownBaseZ+record.topZ)/2));
      dummy.rotation.set(0,-(record.rotation||0)*Math.PI/180,0);
      dummy.scale.set(record.radiusX,(record.topZ-record.crownBaseZ)/2,record.radiusY);dummy.updateMatrix();
      mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,new THREE.Color(color));
    });
    mesh.computeBoundingBox();mesh.computeBoundingSphere();root.add(mesh);
  }
  if(!batches.size)foliage.dispose();
  if(!branches.length){bark.dispose();return root;}
  const wood=new THREE.InstancedMesh(new THREE.CylinderGeometry(.55,1,1,6,1),bark,branches.length);
  wood.name='reconstructed-existing-tree-branches';wood.castShadow=true;wood.receiveShadow=true;
  const up=new THREE.Vector3(0,1,0),a=new THREE.Vector3(),b=new THREE.Vector3();
  branches.forEach((branch,i)=>{
    a.set(...toWorld(...branch.a));b.set(...toWorld(...branch.b));
    dummy.position.copy(a).add(b).multiplyScalar(.5);const delta=b.sub(a);
    dummy.quaternion.setFromUnitVectors(up,delta.clone().normalize());
    dummy.scale.set(branch.radius,delta.length(),branch.radius);dummy.updateMatrix();wood.setMatrixAt(i,dummy.matrix);
  });
  wood.computeBoundingBox();wood.computeBoundingSphere();root.add(wood);
  return root;
}
