import * as THREE from '../vendor/three.module.js';
import {gardenGroundAt} from './geometry.js?v=1.41.0';
import {pathStrip} from './garden-paths.js?v=1.41.0';
import {toWorldRoofTriangle} from './orientation.js?v=1.41.0';

/** Four batched, grade-following meshes, irrespective of the number of stones.
 * Small open joints expose the compact mineral base; no floating flat slabs
 * or new shadow-casting lights are needed for this route. */
export function createGardenPathGroup(network,settings,data,materials,{svgMode=false,style=null}={}){
  const group=new THREE.Group();group.name='landscaped-garden-paths';if(!network)return group;
  const grade=(x,y)=>gardenGroundAt(x,y,settings,data);
  const triangles={base:[],stone:[],border:[],soil:[]};
  const surface=(ring,height,destination)=>{
    const centre=ring.reduce((a,p)=>[a[0]+p[0]/ring.length,a[1]+p[1]/ring.length],[0,0]);
    const c=[...centre,grade(...centre)+height];
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length];
      destination.push(toWorldRoofTriangle(c,[...a,grade(...a)+height],[...b,grade(...b)+height]));
    }
  };
  for(const s of network.segments){
    const count=Math.ceil(s.length/.35);
    for(let i=0;i<count;i++)surface(pathStrip(s.a,s.b,s.outerWidth,i/count,(i+1)/count),.018,triangles.base);
  }
  for(const p of network.pavers)surface(p.footprint,.037,triangles.stone);
  for(const p of network.borders){
    const [a,b,c,d]=p.footprint,length=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.ceil(length/.35);
    const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
    for(let i=0;i<n;i++)surface([mix(a,b,i/n),mix(a,b,(i+1)/n),mix(d,c,(i+1)/n),mix(d,c,i/n)],.028,triangles.border);
  }
  for(const p of network.planting)surface([[p.x,p.y],[p.x+p.width,p.y],[p.x+p.width,p.y+p.length],[p.x,p.y+p.length]],.019,triangles.soil);
  const gravel=materials.stone.clone();gravel.userData.transient=true;gravel.color.multiplyScalar(.78);gravel.roughness=1;
  const soil=materials.grass.clone();soil.userData.transient=true;soil.color.multiplyScalar(.57);
  for(const [name,material]of [['base',gravel],['stone',materials.stoneLight],['border',materials.stone],['soil',soil]]){
    if(!triangles[name].length)continue;
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(triangles[name].flat(2),3));geometry.computeVertexNormals();
    const positions=geometry.attributes.position,uv=[];
    for(let i=0;i<positions.count;i++)uv.push(positions.getX(i)*.5,positions.getZ(i)*.5);
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    const mesh=new THREE.Mesh(geometry,material);mesh.name='garden-path-'+name;mesh.receiveShadow=true;mesh.castShadow=false;if(svgMode)mesh.renderOrder=-79;group.add(mesh);
  }
  const blades=[],colours=[],tint=new THREE.Color(style?.palette?.accent||'#7b8662').lerp(new THREE.Color('#6b8055'),.77);
  for(const bed of network.planting)for(let i=0;i<(svgMode?7:22);i++){
    const x=bed.x+.06+(i*.618%1)*(bed.width-.12),y=bed.y+.06+(i*.414%1)*(bed.length-.12),z=grade(x,y)+.025;
    for(let j=0;j<5;j++){
      const angle=i*.9+j*2.399,dx=Math.cos(angle),dy=Math.sin(angle),h=.24+(i%4)*.045,r=.10;
      const triangle=toWorldRoofTriangle([x-dy*.012,y+dx*.012,z],[x+dy*.012,y-dx*.012,z],[x+dx*r,y+dy*r,z+h]);
      blades.push(triangle);const c=tint.clone().multiplyScalar(.82+j*.04).toArray();colours.push(...c,...c,...c);
    }
  }
  if(blades.length){
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(blades.flat(2),3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));geometry.computeVertexNormals();
    const material=new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.96});material.userData.transient=true;
    const grass=new THREE.Mesh(geometry,material);grass.name='garden-path-ornamental-grasses';grass.receiveShadow=true;grass.castShadow=false;group.add(grass);
  }
  group.userData={layout:network.id,pathSegments:network.segments.length,paverCount:network.pavers.length,routeFixtures:network.fixtureCount,
    pathLength:network.pathLength,pavedArea:network.pavedArea,surfaceArea:network.surfaceArea,
    connectedDestinations:network.connections.filter(c=>c.connected).map(c=>c.id),blockedRoutes:network.blocked};
  return group;
}
