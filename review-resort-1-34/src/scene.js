import * as THREE from '../vendor/three.module.js';
import { OrbitControls } from '../vendor/OrbitControls.js?v=1.34.0';
import { SVGRenderer } from '../vendor/SVGRenderer.js';
import { pointInPolygon, terrainAt, gardenGroundAt, terraceGroundReference, hedgeSegments, hedgeGroundAt, hedgeTopAt, jacuzziBounds, spaLevels, privacyStructures, terraceCover, frontHedgeLayout } from './geometry.js?v=1.34.0';
import {createSharedHouseModel,cloneOwnedScene} from './scene-house-model.js?v=1.34.0';
import {houseModelFrame} from './house-model.js?v=1.34.0';
import {createWalkNavigation} from './house-walk.js?v=1.34.0';
import { mappedHouseFacadeLayout } from './mapped-house-facades.js?v=1.34.0';
import {createRenovationFacadeGroup} from './scene-renovation-facades.js?v=1.34.0';
import { addHouseRenovation } from './scene-house-renovation.js?v=1.34.0';
import { houseAppearanceLayout } from './house-appearance.js?v=1.34.0';
import { entranceAccessLayout } from './entrance-access.js?v=1.34.0';
import { createTerraceCoverGroup } from './scene-terrace-cover.js?v=1.34.0';
import { sampledRoofFaces } from './roof-mesh.js?v=1.34.0';
import { terrainVertexBuffer, parcelTerrainClip } from './terrain-mesh.js?v=1.34.0';
import { renderBudget } from './render-quality.js?v=1.34.0';
import {latestIntersectionEntry} from './render-visibility.js?v=1.34.0';
import { createArchitecturalRenderer } from './architectural-renderer.js?v=1.34.0';
import { createHedgeVegetation } from './scene-vegetation.js?v=1.34.0';
import { createPoolReflections } from './scene-reflections.js?v=1.34.0';
import { batchGardenBoxes, finishDeckBox, projectWaterUVs, proposedMaterials, disposeProposedMaterials } from './scene-static-details.js?v=1.34.0';
import { getDesignStyle } from './design-styles.js?v=1.34.0';
import { createStyledDeck, createStyledLounger, createStyledSideTable, createStyledDining, createStyledCanopyTrim, createStyledResortPiece } from './scene-style-details.js?v=1.34.0';
import { createRenovationGardenDetails } from './scene-renovation-garden.js?v=1.34.0';
import { resortTerraceLayout } from './resort-garden.js?v=1.34.0';
import { createSurfaceTextures, configureBasePhotographicMaterials } from './scene-materials.js?v=1.34.0';
import { onSurfaceAssetsChanged, projectArchitecturalMaterialUVs, surfaceAssetDiagnostics } from './material-assets.js?v=1.34.0';
import { toWorld, fromWorld, gazeDirection, toWorldTriangle, toWorldRoofTriangle } from './orientation.js?v=1.34.0';
import { getSiteProfile } from './sites.js?v=1.34.0';
import { boundsOf, gardenFurniture, terraceStairs, rectanglesOverlap } from './layout.js?v=1.34.0';
import { localRoofEnvelope, roofEdgeHeight } from './roof-envelope.js?v=1.34.0';
import { screeningTreeVolumes } from './screening-trees.js?v=1.34.0';
import { createScreeningTreeGroup } from './scene-trees.js?v=1.34.0';
import { gardenProgram, poolBounds } from './garden-program.js?v=1.34.0';
import { createSpaAmenityGroup } from './scene-spa.js?v=1.34.0';
import {createJacuzziEffects} from './scene-jacuzzi-effects.js?v=1.34.0';
import { createPrivacyStructureGroup } from './scene-privacy-structures.js?v=1.34.0';
import { PRIVACY_GEOMETRY_KEYS } from './privacy-structures.js?v=1.34.0';
import { gardenDimensions } from './dimensions.js?v=1.34.0';
import { createDimensionOverlay } from './scene-dimensions.js?v=1.34.0';
import { contextTerrainAt, neighborhoodBounds } from './neighborhood.js?v=1.34.0';
import {existingCanopyRecords} from './existing-vegetation.js?v=1.34.0';
import {createExistingVegetationGroup} from './scene-existing-vegetation.js?v=1.34.0';
import {observedBuildingAppearance,observedFacadePlacements} from './neighborhood-appearance.js?v=1.34.0';
import {createNeighborhoodAppearanceGroup} from './scene-neighborhood-appearance.js?v=1.34.0';
import {clipFacadeToVisualRoof} from './observed-neighbor-roofs.js?v=1.34.0';
import {contextBuildingEnvelope} from './context-building-envelope.js?v=1.34.0';
import {createContextRoofFeatures} from './scene-context-roof.js?v=1.34.0';
import {projectContextGroundUVs} from './context-ground.js?v=1.34.0';
import { nightLightingState, isWindowLit } from './night-lighting.js?v=1.34.0';
import { createGardenNightLighting } from './scene-night-lights.js?v=1.34.0';
import { createGardenLightBoundary } from './scene-light-boundary.js?v=1.34.0';
import { garageLayout,garageVehiclePose } from './garage-ramp.js?v=1.34.0';
import { garageTerrainCutouts,subtractGarageOpenings,createGarageAwarePaving,createGarageGroup } from './scene-garage.js?v=1.34.0';

// Site coordinates are x = frontage, y = garden depth, z = absolute elevation.
// The source basis is left-handed. Three uses x, elevation, +gardenDepth.
// A viewer looking into the rear garden therefore has decreasing site x at right.
const point = (x, y, z) => new THREE.Vector3(...toWorld(x, y, z));
const xyz = p => Array.isArray(p) ? p : [p.x, p.y, p.z];
const closeRing = ring => ring.length > 1 && Math.hypot(ring[0][0] - ring.at(-1)[0], ring[0][1] - ring.at(-1)[1]) < 1e-6 ? ring.slice(0, -1) : ring;
const num = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const centroid = ring => {
  const r = closeRing(ring);
  return r.reduce((s, p) => [s[0] + p[0] / r.length, s[1] + p[1] / r.length], [0, 0]);
};

/** Exact openings shared by both rendered terrain layers. */
export function designTerrainCutouts(settings,data){
  const tub=jacuzziBounds(settings,data),program=gardenProgram(settings,data),p=poolBounds(settings,data);
  const rect=r=>({x0:r.x,x1:r.x+r.width,y0:r.y,y1:r.y+r.length});
  return[rect(p),{x0:tub.x0,x1:tub.x1,y0:tub.y0,y1:tub.y1},...(program.active?[rect(program.firepit),rect(program.coldPlunge)]:[]),
    ...garageTerrainCutouts(garageLayout(settings,data,{terrainAt}))];
}

function contains(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function geometryFromTriangles(triangles) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(triangles.flat(2), 3));
  const uv = [];
  for (const triangle of triangles) {
    const a = new THREE.Vector3(...triangle[0]), b = new THREE.Vector3(...triangle[1]), c = new THREE.Vector3(...triangle[2]);
    const normal = b.sub(a).cross(c.sub(a));
    for (const p of triangle) uv.push(Math.abs(normal.x) > Math.abs(normal.z) && Math.abs(normal.x) > Math.abs(normal.y) ? p[2] * .5 : p[0] * .5, Math.abs(normal.y) > Math.max(Math.abs(normal.x), Math.abs(normal.z)) ? p[2] * .5 : p[1] * .5);
  }
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function localTriangle(a, b, c) {
  return toWorldTriangle(a, b, c);
}

/** Rounded slabs are uniform extrusions: rotate and translate to keep their
 * full depth at +world Z and their full height above the local slab base.
 * This uses a proper rotation, retaining the extrusion's outward normals. */
export function orientExtrudedSlab(geometry, height) {
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, height, 0);
  return geometry;
}

function polygonPrism(ring, base, top, material, capTop = true) {
  const r = closeRing(ring), triangles = [];
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length];
    const a0 = [...a, base], b0 = [...b, base], a1 = [...a, top], b1 = [...b, top];
    triangles.push(localTriangle(a0, b0, b1), localTriangle(a0, b1, a1));
  }
  // Ear clipping preserves notches in real concave building footprints.
  const cap=THREE.ShapeUtils.triangulateShape(r.map(p=>new THREE.Vector2(...p)),[]);
  if(capTop)for(const [a,b,c] of cap)triangles.push(toWorldRoofTriangle([...r[a],top],[...r[b],top],[...r[c],top]));
  const mesh = new THREE.Mesh(geometryFromTriangles(triangles), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Match a recorded blank elevation by its two source endpoints, independently
 * of ring winding. Keep observations separate from immutable mapped bodies. */
function isWindowlessFacade(a,b,building,observation){
  if(!observation||observation.officialId!==building.officialId)return false;
  const dx=num(building.adjustment?.dx),dy=num(building.adjustment?.dy);
  const matches=(point,recorded)=>Array.isArray(recorded)&&Math.hypot(point[0]-dx-recorded[0],point[1]-dy-recorded[1])<1e-6;
  return (observation.windowlessEdges||[]).some(edge=>
    (matches(a,edge.a)&&matches(b,edge.b))||(matches(a,edge.b)&&matches(b,edge.a)));
}

/** Illustrative openings follow real wall edges; they are not surveyed window
 * positions and do not alter the analytical building body or its height.
 * A user-recorded blank wall suppresses the shared placements, so panes,
 * frames, mullions and sills all disappear in both WebGL and SVG views. */
export function contextFacadePlacements(building, origin, distanceLimit = 160, observation = null) {
  const observed=observedFacadePlacements(building,origin,distanceLimit,observation);
  if(observed!==null)return observed;
  const ring=closeRing(building.footprint||[]),base=Number(building.baseZ),roof=Number(building.roofZ);
  if(ring.length<3||!Number.isFinite(base)||!Number.isFinite(roof)||roof<=base)return [];
  const c=centroid(ring),distance=Math.hypot(c[0]-origin[0],c[1]-origin[1]);
  if(distance>distanceLimit)return [];
  const scale=Math.max(.2,num(building.adjustment?.scaleZ,1)),windowHeight=1.35*scale;
  const floorCount=Math.min(24,Math.max(0,Math.floor(((roof-base)/scale-2.695)/2.9)+1));
  const winding=Math.sign(ring.reduce((sum,a,i)=>{const b=ring[(i+1)%ring.length];return sum+a[0]*b[1]-b[0]*a[1];},0))||1;
  const result=[];
  for(let side=0;side<ring.length;side++){
    const a=ring[side],b=ring[(side+1)%ring.length],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
    if(length<1.85||isWindowlessFacade(a,b,building,observation))continue;
    const nx=winding*dy/length,ny=-winding*dx/length,count=Math.min(40,Math.max(1,Math.floor(length/3.5)));
    const width=Math.min(1.1,length/count*.52);
    for(let floor=0;floor<floorCount;floor++)for(let column=0;column<count;column++){
      const t=(column+.5)/count,z=base+(1.9+floor*2.9)*scale;
      if(z+windowHeight/2+.12*scale>=roof||z-windowHeight/2-.12*scale<=base)continue;
      result.push({buildingId:building.id??building.officialId??String(building.index??''),side,floor,column,
        x:a[0]+dx*t,y:a[1]+dy*t,z,nx,ny,angle:Math.atan2(nx,ny),width,height:windowHeight,
        detailed:distance<85,shade:Math.abs((building.index||0)*13+floor*7+column+side*3)%7});
    }
  }
  return result;
}

function windowQuadTriangles(items,frame=false,offset=frame?.025:.046){
  return items.flatMap(p=>{
    const width=p.width+(frame?.14:0),height=p.height+(frame?.14:0);
    const x=p.x+p.nx*offset,y=p.y+p.ny*offset,tx=p.ny*width/2,ty=-p.nx*width/2;
    const a=[x-tx,y-ty,p.z-height/2],b=[x+tx,y+ty,p.z-height/2],c=[x+tx,y+ty,p.z+height/2],d=[x-tx,y-ty,p.z+height/2];
    return [localTriangle(a,b,c),localTriangle(a,c,d)];
  });
}

// Rendering and numerical shade use the same measured roof triangulation.
function sampledRoofGeometry(ring, samples, edgeZ, edgePoints=null) {
  const faces=sampledRoofFaces(ring,samples,edgeZ,edgePoints).map(([a,b,c])=>toWorldRoofTriangle(a,b,c));
  return faces.length?geometryFromTriangles(faces):null;
}

/** Fit resolution to site receivers, but depth to every possible context caster.
 * Points are in Three.js world coordinates, not the site's x/y/elevation axes.
 * A distant building capable of shading a receiver projects onto that same
 * light-space x/y, so its distance must enlarge depth, not the map's footprint.
 */
export function fitSunShadowCamera(light,receiverPoints,casterPoints,margin=2.5) {
  if(!receiverPoints.length)return;
  light.updateMatrixWorld(true);light.target.updateMatrixWorld(true);
  const camera=light.shadow.camera;
  camera.position.setFromMatrixPosition(light.matrixWorld);
  camera.lookAt(new THREE.Vector3().setFromMatrixPosition(light.target.matrixWorld));
  camera.updateMatrixWorld(true);
  const projected=new THREE.Vector3();
  let left=Infinity,right=-Infinity,bottom=Infinity,top=-Infinity,near=Infinity,far=-Infinity;
  for(const p of receiverPoints){
    projected.copy(p).applyMatrix4(camera.matrixWorldInverse);
    left=Math.min(left,projected.x);right=Math.max(right,projected.x);
    bottom=Math.min(bottom,projected.y);top=Math.max(top,projected.y);
    near=Math.min(near,-projected.z);far=Math.max(far,-projected.z);
  }
  for(const p of casterPoints){
    projected.copy(p).applyMatrix4(camera.matrixWorldInverse);
    near=Math.min(near,-projected.z);far=Math.max(far,-projected.z);
  }
  Object.assign(camera,{left:left-margin,right:right+margin,bottom:bottom-margin,top:top+margin,near:Math.max(.1,near-5),far:Math.max(10,far+5)});
  camera.updateProjectionMatrix();light.shadow.updateMatrices(light);
  light.shadow.needsUpdate=true;
  return {left:camera.left,right:camera.right,bottom:camera.bottom,top:camera.top,near:camera.near,far:camera.far};
}

function removeGeometry(group) {
  const geometries=new Set(), materials=new Set();
  group.traverse(child=>{
    if(child.geometry)geometries.add(child.geometry);
    if(child.isInstancedMesh)child.dispose();
    for(const m of Array.isArray(child.material)?child.material:[child.material]){
      if(m?.userData.transient)materials.add(m);
    }
  });
  group.clear();
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
}

function fallback(container, error) {
  const element = document.createElement('div');
  element.className = 'scene-fallback';
  element.style.cssText = 'height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:36px;text-align:center;background:#e9e7df;color:#334b45;gap:12px;box-sizing:border-box';
  const heading = document.createElement('strong');
  heading.textContent = 'The 3D view needs WebGL';
  heading.style.fontSize = '20px';
  const text = document.createElement('p');
  text.textContent = 'Your browser cannot start the 3D renderer. The controls, sightline calculations and section view still work. Try a browser with hardware acceleration enabled.';
  text.style.cssText = 'max-width:390px;line-height:1.6;margin:0';
  element.append(heading, text);
  container.append(element);
  return { available: false, reason: String(error?.message || error), update() {}, updateSun() {}, setView() {}, resize() {}, dispose() { element.remove(); } };
}

export function createScene(container, data, callbacks = {}) {
  const profile=getSiteProfile(data.site.id||'sternicza-11',data),plot=boundsOf(data.site.boundary);
  const plotCentre=[(plot.minX+plot.maxX)/2,(plot.minY+plot.maxY)/2];
  const surroundings=neighborhoodBounds(data),contextSpan=Math.max(surroundings.maxX-surroundings.minX,surroundings.maxY-surroundings.minY);
  const contextGrade=(x,y)=>contains(x,y,data.site.boundary)?terrainAt(x,y,data):contextTerrainAt(x,y,data);
  const sceneFar=Math.max(550,contextSpan*2.2+150),lightDistance=Math.max(300,contextSpan*1.6);
  let renderer, rendererType='webgl';
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
  } catch (error) {
    try {
      renderer = new SVGRenderer();
      rendererType='svg';
      renderer.setQuality?.('high');
      renderer.setPrecision?.(2);
    } catch (fallbackError) {
      return fallback(container, fallbackError);
    }
  }
  const svgMode=rendererType==='svg';
  const gardenLightBoundary=svgMode?null:createGardenLightBoundary(data.site.boundary);

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.05;
  if(renderer.shadowMap){renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;}
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none';
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', `Interactive 3D model of ${profile.label}, its garden and surrounding buildings. Drag to rotate.`);
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#dfe8e8');
  scene.fog = new THREE.Fog('#dfe8e8', 145, Math.max(330,contextSpan*1.55));
  const camera = new THREE.PerspectiveCamera(48, 1, 0.08, sceneFar);
  const presentation=svgMode?null:createArchitecturalRenderer(renderer,scene,camera);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.minDistance = 3;
  controls.maxDistance = Math.max(190,contextSpan*1.2);
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.screenSpacePanning = true;
  controls.zoomSpeed = 0.8;
  controls.rotateSpeed = 0.65;

  const ambient = new THREE.HemisphereLight('#e3edff', '#8b8975', svgMode?2.25:.62);
  scene.add(ambient);
  const svgAmbient=svgMode?new THREE.AmbientLight('#ffffff',.88):null;
  if(svgAmbient)scene.add(svgAmbient);
  const sun = new THREE.DirectionalLight('#fff2d4', svgMode?.72:3.1);
  sun.position.copy(point(-30, 4, 70));
  sun.target.position.copy(point(10, 24, 3));
  sun.castShadow = !svgMode;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.autoUpdate=false;
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: .1, far: 550 });
  sun.shadow.normalBias = 0.035;
  sun.shadow.bias = -0.00004;
  scene.add(sun, sun.target);

  // A small procedural sky gives orientation without an unrelated photograph or
  // invented surrounding skyline. All daylight direction comes from solar.js.
  let sky = null;
  if (!svgMode) {
    sky = new THREE.Mesh(new THREE.SphereGeometry(sceneFar*.78, 24, 12), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { horizonColor:{value:scene.background}, sunDirection: { value: new THREE.Vector3(0, 1, 0) }, daylight: { value: 1 }, warmth: { value: 0 } },
      vertexShader: 'varying vec3 vDirection; void main(){vDirection=position;vec4 clip=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_Position=clip.xyww;}',
      fragmentShader: `varying vec3 vDirection; uniform vec3 sunDirection; uniform float daylight; uniform float warmth;
        uniform vec3 horizonColor;
        void main(){
          vec3 d=normalize(vDirection);
          float h=pow(max(d.y,0.0),0.45);
          vec3 zenith=mix(vec3(.002,.005,.014),vec3(.16,.34,.52),daylight);
          vec3 radiance=mix(horizonColor,zenith,h);
          float s=max(dot(d,normalize(sunDirection)),0.0);
          float aboveHorizon=smoothstep(-.002,.004,d.y);
          vec3 sunColor=mix(vec3(1.0,.92,.76),vec3(1.0,.52,.22),warmth);
          radiance+=sunColor*(.18*pow(s,160.0)+4.0*smoothstep(.999980,.999995,s))*daylight*aboveHorizon;
          gl_FragColor=vec4(radiance,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    }));
    sky.frustumCulled = false; sky.renderOrder = 999; scene.add(sky);
  }

  const mat = {};
  const textures = svgMode ? null : createSurfaceTextures(renderer.capabilities.getMaxAnisotropy());
  if(textures)scene.environment=textures.environment;
  const standard = (name, color, options = {}) => mat[name] = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, side: THREE.DoubleSide, ...Object.fromEntries(Object.entries(options).filter(([,value])=>value!==undefined)) });
  standard('stone', textures ? '#fff7e8' : '#d7c9b3', { map: textures?.stone, bumpMap:textures?.microHeight, bumpScale:.0018 });
  standard('stoneLight', textures ? '#fffdf5' : '#e8dfcd', { map: textures?.stone, bumpMap:textures?.microHeight, bumpScale:.0018 });
  standard('wall', '#f2f0e8', { map: textures?.stucco });
  standard('plinth', data.site.id==='nadmorska-17'?'#9b5e4c':'#b5ae9e');
  standard('roof', data.site.id==='nadmorska-17'?'#bd7960':textures?'#b7b9b0':'#3a4544', { roughness: 0.78, map: textures?.roof });
  standard('wood', textures ? '#d4bfa0' : '#9c7957', { map: textures?.wood });
  standard('woodLight', textures ? '#f0ddba' : '#b5926b', { map: textures?.wood });
  standard('metal', '#343f3b', { roughness: 0.6, metalness: 0.3 });
  standard('glass', '#94c6c3', { transparent: true, opacity: 0.13, roughness: 0.15, depthWrite: false });
  const waterOptions={roughness:.14,metalness:0,ior:1.333,
    transparent:!svgMode,depthWrite:svgMode,side:svgMode?THREE.DoubleSide:THREE.FrontSide,envMapIntensity:1.1,
    ...(textures?{normalMap:textures.waterNormal,normalScale:new THREE.Vector2(.72,.72)}:{}),
    forceSinglePass:true,};
  mat.water=new THREE.MeshPhysicalMaterial({color:'#579a91',opacity:svgMode?1:.62,...waterOptions});
  mat.waterLight=new THREE.MeshPhysicalMaterial({color:'#9acfc0',opacity:svgMode?.9:.56,...waterOptions});
  standard('basin', '#81a7a0', { roughness: .45 });
  standard('hedge', '#849671', { map: textures?.foliage, bumpMap:textures?.microHeight,bumpScale:.004 });
  standard('thuja', '#a5b68b', { map: textures?.foliage, bumpMap:textures?.microHeight,bumpScale:.003, roughness: .95 });
  standard('hedgeTop', '#476b4c');
  standard('leaf', '#99ae7e', {map:textures?.foliage,roughness:1});
  // The old lawn combined a tinted map and vertex pigment. Calibrate their
  // measured mean reflectance to the new neutral photographic map.
  standard('grass', textures?'#65763f':'#94a575', { map: textures?.grass });
  standard('context', '#d3d6d0', { map: textures?.stucco });
  standard('target', '#d5d4c7', { map: textures?.stucco });
  standard('contextRoof', '#89918c', { map: textures?.roof });
  standard('contextWindow', '#a4bdbe', { roughness: 0.22, metalness: .15,envMapIntensity:.7 });
  standard('windowFrame', '#d6d9cb', { roughness: .65 });
  standard('road', '#b6b9b0');
  standard('walkway', '#d4d1c2');
  standard('contextGround', '#8b9679');
  if(data.contextGroundColour&&!svgMode){
    const groundMap=new THREE.TextureLoader().load(new URL('../data/sternicza-ground-colour.png',import.meta.url).href,()=>requestRender());
    groundMap.colorSpace=THREE.SRGBColorSpace;groundMap.anisotropy=4;
    mat.contextGroundColour=new THREE.MeshStandardMaterial({color:'#ffffff',map:groundMap,roughness:1,transparent:true,opacity:.8,alphaTest:.03,depthWrite:false});
    mat.contextGroundColour.addEventListener('dispose',()=>groundMap.dispose());
  }
  standard('linen', '#fffaf0', { map: textures?.textiles });
  standard('gold', '#d7a74a', { roughness: 0.55, metalness: 0.15 });
  standard('treeBark', textures?'#b3a38c':'#766049', { map: textures?.bark,bumpMap:textures?.barkHeight,bumpScale:.012,roughness:1 });
  standard('treePine', '#5c7850', { map: textures?.pineNeedles, vertexColors: true,roughness:.95 });
  standard('treeSpruce', '#4d6a53', { map: textures?.foliage, vertexColors: true });
  standard('treeDeciduous', '#718b53', { map: textures?.foliage, vertexColors: true });
  standard('treeGhost', '#a89178', { transparent: true, opacity: .22, depthWrite: false, vertexColors: true });
  if(textures){
    for(const [key,surface,scale] of [['stone','stone',.4],['stoneLight','stone',.4],['wall','stucco',.12],
      ['wood','wood',.4],['woodLight','wood',.4],['grass','grass',.35],['linen','textiles',.25],
      ['context','stucco',.12],['target','stucco',.12]]){
      if(textures[surface+'Normal']){
        mat[key].normalMap=textures[surface+'Normal'];mat[key].normalScale.set(scale,scale);
        mat[key].bumpMap=null;
      }
      if(textures[surface+'Roughness'])mat[key].roughnessMap=textures[surface+'Roughness'];
    }
  }
  standard('spaGlow', '#ffdf9c', {emissive:'#ffb95e',emissiveIntensity:.65,roughness:.8});
  standard('fireGlow', '#aa5230', {emissive:'#c34916',emissiveIntensity:.4,roughness:1});
  // Lit neighbours are illustrative panes on already permitted facade openings.
  // A single instanced overlay avoids thousands of individual lights. It does
  // not create openings on the user-recorded blank faces of building 4h.
  mat.nightWindow=new THREE.MeshBasicMaterial({color:svgMode?'#ffe1a4':'#ffffff',side:THREE.DoubleSide,transparent:true,opacity:0,depthWrite:false,toneMapped:false});
  if(textures)configureBasePhotographicMaterials(mat,textures);

  const staticGroup = new THREE.Group(), buildingGroup = new THREE.Group(), designGroup = new THREE.Group(), markerGroup = new THREE.Group(), rayGroup = new THREE.Group(), sunGuideGroup = new THREE.Group(), sunPathGroup = new THREE.Group();
  const houseGroup = new THREE.Group(), finishesGroup = new THREE.Group(), existingVegetationGroup = new THREE.Group();
  let vegetationSignature='',vegetationSource,vegetationBuildings;
  const reflections=svgMode?null:createPoolReflections(renderer,scene,camera,{sky,
    exclude:[markerGroup,rayGroup,sunGuideGroup],waterMaterials:[mat.water,mat.waterLight]});
  scene.add(staticGroup, buildingGroup, existingVegetationGroup, designGroup, markerGroup, rayGroup, sunGuideGroup);
  const sunMarker=new THREE.Mesh(new THREE.SphereGeometry(.52,svgMode?8:16,svgMode?6:12),new THREE.MeshBasicMaterial({color:'#fff0ad',transparent:true,opacity:.95,depthTest:false,depthWrite:false,fog:false,toneMapped:false}));
  sunGuideGroup.renderOrder=1000;sunPathGroup.renderOrder=1000;sunMarker.renderOrder=1002;
  sunGuideGroup.add(sunPathGroup,sunMarker);sunGuideGroup.visible=false;
  const terrainMeshes = [];
  const labels = [];
  const labelLayer = document.createElement('div');
  labelLayer.className = 'scene-label-layer';
  labelLayer.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none';
  container.append(labelLayer);
  const dimensionOverlay=createDimensionOverlay(container,scene,()=>[staticGroup,buildingGroup,designGroup]);
  let disposed = false, renderPending = false, mode = 'orbit', currentSettings = {}, currentObserver = null, currentAnalysis = null;
  let designSignature = '', observerSignature = '', eyeYaw = 0, eyePitch = 0, eyeFov=65, storedYaw = null, storedPitch = null;
  let lastWidth = 0, lastHeight = 0, lastPixelRatio = 0;
  let quality = 'auto', motion = false, presentationVisible = true, intersecting = true;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let interacting = false, interactionTimer = 0, motionTimer = 0, frameHandle = 0;
  let frameCount = 0, shadowUpdates = 0, motionFps = 24, lastMotionTime = 0, waveTime = 0;
  let lastInfoTime = -Infinity, statusChanged = true, lastSunPose = '', lastVehiclePose = '';
  let designMaterials = mat, dimensionsVisible, solarSignature='', guidePath=null;
  let finishSignature='', houseFinishSignature='', renderedStyle=null;
  let reflectiveMaterials=[], skyRadiance=1;
  let shadowBoundsDirty=true,shadowCameraDirty=true,shadowReceiverPoints=[],shadowCasterPoints=[];
  let sunPathSignature='',previousSunPath=null;
  let gardenNight=null,nightWindowMesh=null,nightWindowPlacements=[],nightWindowSignature='',lastSolar=null;
  let garageScene=null,currentGarageLayout=null,sharedHouseModel=null,contextRevision=0;
  let jacuzziEffects=null;
  let walkModel=null,walkPose=null,lastWalkTime=0,lastWalkNotice=0,walkFast=false;
  const walkKeys=new Set();
  const keyDirections=new Map([['KeyW','forward'],['ArrowUp','forward'],['KeyS','back'],['ArrowDown','back'],['KeyA','left'],['ArrowLeft','left'],['KeyD','right'],['ArrowRight','right']]);
  const walkPad=document.createElement('div');walkPad.className='walk-pad';walkPad.hidden=true;walkPad.setAttribute('aria-label','Walk controls');
  for(const [direction,label,glyph,column,row]of [['forward','Walk forward','↑',2,1],['left','Step left','←',1,2],['back','Step back','↓',2,2],['right','Step right','→',3,2]]){
    const button=document.createElement('button');button.type='button';button.textContent=glyph;button.setAttribute('aria-label',label);
    button.style.gridColumn=column;button.style.gridRow=row;
    button.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();button.setPointerCapture(event.pointerId);walkKeys.add(direction);requestRender();});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>walkKeys.delete(direction));
    button.addEventListener('click',event=>{if(event.detail===0){stepWalk(direction==='right'?1:direction==='left'?-1:0,direction==='forward'?1:direction==='back'?-1:0,.28);requestRender();}});
    walkPad.append(button);
  }
  container.append(walkPad);
  const unsubscribeSurfaceAssets=onSurfaceAssetsChanged(()=>{statusChanged=true;reflections?.invalidate();requestRender();});

  const box = (group, x, y, z, width, depth, height, material, cast = true, svgOrder = 0) => {
    if (width <= 0 || depth <= 0 || height <= 0) return null;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.copy(point(x + width / 2, y + depth / 2, z + height / 2));
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    if(svgMode)mesh.renderOrder=svgOrder;
    group.add(mesh);
    return mesh;
  };

  function roundedPath(width, depth, radius, PathClass = THREE.Shape) {
    const r = Math.min(radius, width / 2, depth / 2), shape = new PathClass();
    shape.moveTo(r, 0); shape.lineTo(width - r, 0); shape.quadraticCurveTo(width, 0, width, r);
    shape.lineTo(width, depth - r); shape.quadraticCurveTo(width, depth, width - r, depth);
    shape.lineTo(r, depth); shape.quadraticCurveTo(0, depth, 0, depth - r);
    shape.lineTo(0, r); shape.quadraticCurveTo(0, 0, r, 0);
    return shape;
  }

  function roundedSlab(group, x, y, z, width, depth, height, radius, material, hole = 0, bevel = true) {
    const shape = roundedPath(width, depth, radius);
    if (hole > 0) {
      const inner = roundedPath(width - 2 * hole, depth - 2 * hole, Math.max(.05, radius - hole), THREE.Path);
      // Shape paths are local; translate the inner path without changing the outer footprint.
      const path = new THREE.Path(inner.getPoints(5).map(p => new THREE.Vector2(p.x + hole, p.y + hole)));
      shape.holes.push(path);
    }
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: bevel && !svgMode, bevelSize: .014, bevelThickness: .012, bevelSegments: 1, curveSegments: svgMode ? 3 : 6, steps: 1 });
    orientExtrudedSlab(geometry, height);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.copy(point(x, y, z));
    mesh.castShadow = false; mesh.receiveShadow = true; group.add(mesh); return mesh;
  }

  const line = (group, vertices, color, opacity = 1) => {
    const geometry = new THREE.BufferGeometry().setFromPoints(vertices.map(p => point(...p)));
    const material = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthTest: true });
    material.userData.transient = true;
    const mesh = new THREE.Line(geometry, material);
    group.add(mesh);
    return mesh;
  };

  const label = (text, position, kind = '', id = '') => {
    const element = document.createElement('div');
    element.textContent = text;
    element.style.cssText = 'position:absolute;left:0;top:0;transform:translate(-50%,-100%);padding:5px 8px;border-radius:5px;background:rgba(247,249,245,.9);border:1px solid rgba(50,80,70,.14);box-shadow:0 2px 10px #2b483514;color:#435950;font:600 10px/1.25 ui-sans-serif,system-ui,sans-serif;white-space:nowrap;letter-spacing:.015em;backdrop-filter:blur(3px)';
    if (kind === 'target') element.style.background = 'rgba(232,240,239,.94)';
    labelLayer.append(element);
    labels.push({ element, position: point(...position), kind, id });
  };

  function makeTerrain(group, bounds, step, heightAt, material, ring = null, vertexColors = false, cutouts = []) {
    const [x0, y0, x1, y1] = bounds, vertices = terrainVertexBuffer(heightAt, vertexColors);
    // Split exactly at each rectangular opening before removing cells. Merely
    // dropping triangles by centroid would leave coarse grass wedges in a pool.
    const axis = (start, end, edges) => {
      const values = [end];
      for(let p=start;p<end;p+=step)values.push(p);
      values.push(...edges.filter(p=>p>start&&p<end));
      return values.sort((a,b)=>a-b).filter((p,i,all)=>i===0||p-all[i-1]>1e-8);
    };
    const xs=axis(x0,x1,cutouts.flatMap(c=>[c.x0,c.x1]));
    const ys=axis(y0,y1,cutouts.flatMap(c=>[c.y0,c.y1]));
    const clipToParcel=ring===data.site.boundary?parcelTerrainClip(ring,pointInPolygon):null;
    const polygonCutouts=cutouts.filter(c=>c.polygon?.length>=3);
    for(let row=0;row<ys.length-1;row++)for(let col=0;col<xs.length-1;col++){
      const x=xs[col],xx=xs[col+1],y=ys[row],yy=ys[row+1];
      if(cutouts.some(c=>!c.polygon&&x>=c.x0-1e-8&&xx<=c.x1+1e-8&&y>=c.y0-1e-8&&yy<=c.y1+1e-8))continue;
      for(const tri of [[[x,y],[xx,y],[xx,yy]],[[x,y],[xx,yy],[x,yy]]]){
        const pieces=polygonCutouts.length?subtractGarageOpenings(tri,polygonCutouts):[tri];
        for(const piece of pieces){
          if(ring&&!clipToParcel&&!contains(...centroid(piece),ring))continue;
          for(const clipped of clipToParcel?clipToParcel(piece):[piece]){
            // Drop collinear fan triangles at exact boundary/cell contacts.
            const [a]=clipped;
            for(let i=1;i<clipped.length-1;i++){
              const b=clipped[i],c=clipped[i+1];
              if(Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))<=1e-10)continue;
              for(const p of [a,c,b])vertices.add(...p);
            }
          }
        }
      }
    }
    const geometry = vertices.finish();
    let m = material;
    if (vertexColors) {
      m = material.clone();
      m.vertexColors = true;
      m.userData.transient = true;
    }
    const mesh = new THREE.Mesh(geometry, m);
    mesh.name=group===staticGroup?'context-terrain':'garden-terrain';
    mesh.receiveShadow = true;
    if(svgMode)mesh.renderOrder=group===staticGroup?-100:-90;
    group.add(mesh);
    return mesh;
  }

  function pitchedRoof(group, ring, eaves, ridge, material, axis = 'x') {
    const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
    const x0 = Math.min(...xs) - 0.12, x1 = Math.max(...xs) + 0.12, y0 = Math.min(...ys) - 0.12, y1 = Math.max(...ys) + 0.12;
    const triangles = [];
    if (axis === 'x') {
      const ym = (y0 + y1) / 2;
      const a = [x0, y0, eaves], b = [x1, y0, eaves], c = [x1, y1, eaves], d = [x0, y1, eaves], e = [x0, ym, ridge], f = [x1, ym, ridge];
      triangles.push(localTriangle(a,b,f),localTriangle(a,f,e),localTriangle(d,e,f),localTriangle(d,f,c),localTriangle(a,e,d),localTriangle(b,c,f));
    } else {
      const xm = (x0 + x1) / 2;
      const a = [x0,y0,eaves], b = [x1,y0,eaves], c = [x1,y1,eaves], d = [x0,y1,eaves], e = [xm,y0,ridge], f = [xm,y1,ridge];
      triangles.push(localTriangle(a,d,f),localTriangle(a,f,e),localTriangle(e,f,c),localTriangle(e,c,b),localTriangle(a,e,b),localTriangle(d,c,f));
    }
    const mesh = new THREE.Mesh(geometryFromTriangles(triangles), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  let contextDetails;
  function addContextBuilding(building) {
    const ring = closeRing(building.footprint || []);
    if (ring.length < 3) return;
    const c = centroid(ring), target = building.kind === 'target';
    const base = num(building.baseZ, contextGrade(...c)), roof = num(building.roofZ, base + 7);
    if(roof<=base)return;
    const roofDetail=contextBuildingEnvelope(building,data);
    if(roofDetail)contextDetails.envelopes[building.id]={
      wallTriangles:roofDetail.wallFaces.length,roofTriangles:roofDetail.roofFaces.length,
      features:(roofDetail.features||[]).reduce((counts,feature)=>{
        counts[feature.kind]=(counts[feature.kind]||0)+1;return counts;
      },{}),
    };
    const roofPts = (roofDetail?.roofPoints||building.roofPoints || []).map(xyz).filter(p => p.length >= 3 && Number.isFinite(p[2]));
    const roofMax = Math.max(roof, ...roofPts.map(p => p[2]));
    const facadeMaterial = (target ? mat.target : mat.context).clone();
    const palette = target ? ['#d3d2c1', '#c5ccc7', '#d4c9b5', '#c4c8bd'] : ['#ddd8ca', '#d2d8d1', '#e4ded0', '#cfc8bb', '#dbdcd2'];
    facadeMaterial.color.set(observedBuildingAppearance(building)?.facadeColor||palette[Math.abs(building.index || 0) % palette.length]);
    facadeMaterial.userData.transient = true;
    const body=roofDetail?new THREE.Mesh(geometryFromTriangles(roofDetail.wallFaces.map(([a,b,c])=>localTriangle(a,b,c))),facadeMaterial):polygonPrism(ring, base, roof, facadeMaterial, false);
    body.castShadow=true;body.receiveShadow=true;
    body.name=`context-building-${building.id}`;
    buildingGroup.add(body);
    if (roofPts.length > 6) {
      const roofGeometry = roofDetail?.roofFaces
        ?geometryFromTriangles((roofDetail.surfaceFaces||roofDetail.roofFaces).map(([a,b,c])=>toWorldRoofTriangle(a,b,c)))
        :sampledRoofGeometry(ring,roofPts.filter((p,i)=>!svgMode||i%3===0),roofDetail?.edgeZ??roof,roofDetail?.edgePoints);
      const roofMaterial=mat.contextRoof.clone();
      roofMaterial.color.set(observedBuildingAppearance(building)?.roofColor||mat.contextRoof.color);
      roofMaterial.userData.transient=true;
      const roofMesh = new THREE.Mesh(roofGeometry || geometryFromTriangles([]), roofMaterial);
      roofMesh.name=`context-building-${building.id}-roof`;
      roofMesh.castShadow = true; roofMesh.receiveShadow = true;
      buildingGroup.add(roofMesh);
      if(roofDetail?.features?.length)buildingGroup.add(createContextRoofFeatures(roofDetail,roofMaterial));
    } else {
      // LoD1 tops remain flat at the source height; an invented pitched roof
      // would change both the visible skyline and the user's privacy judgement.
      const cap=THREE.ShapeUtils.triangulateShape(ring.map(p=>new THREE.Vector2(...p)),[]);
      for(const [a,b,c] of cap)contextDetails.roofs.push(toWorldRoofTriangle([...ring[a],roof],[...ring[b],roof],[...ring[c],roof]));
    }
    contextDetails.windows.push(...clipFacadeToVisualRoof(contextFacadePlacements({...building,baseZ:base,roofZ:roof},plotCentre,svgMode?95:160,data.facadeOverrides?.[building.id]),roofDetail));
    const distance=Math.hypot(c[0]-plotCentre[0],c[1]-plotCentre[1]);
    if(distance<125){
      const winding=Math.sign(ring.reduce((sum,a,i)=>{const b=ring[(i+1)%ring.length];return sum+a[0]*b[1]-b[0]*a[1];},0))||1;
      for(let i=0;i<ring.length;i++){
        const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
        if(length<.2)continue;
        const nx=winding*dy/length,ny=-winding*dx/length,edge={x:(a[0]+b[0])/2,y:(a[1]+b[1])/2,nx,ny,angle:Math.atan2(nx,ny),width:length};
        const trimHeight=Math.min(.14,(roof-base)*.04),plinthHeight=Math.min(.28,(roof-base)*.08);
        if(!roofDetail)contextDetails.roofEdges.push({...edge,z:roof-trimHeight/2,height:trimHeight,depth:.055,offset:.015});
        contextDetails.plinths.push({...edge,z:base+plinthHeight/2,height:plinthHeight,depth:.035,offset:.012});
      }
    }
    if (target&&profile.buildingTargets.slice(0,3).some(b=>b.index===building.index)) label(building.label,[c[0],c[1],roofMax+1.1],'target',building.id);
  }

  function flushContextDetails(){
    if(contextDetails.roofs.length){
      const roofs=new THREE.Mesh(geometryFromTriangles(contextDetails.roofs),mat.contextRoof);
      roofs.name='context-mapped-flat-roofs';roofs.castShadow=true;roofs.receiveShadow=true;buildingGroup.add(roofs);
    }
    const windows=contextDetails.windows;
    for(const pane of windows)if(pane.appearanceEvidence==='user-reference-estimate'){
      const key=`${pane.buildingId}:${pane.facadeDirection}:${pane.floor}`;
      contextDetails.facades[key]=(contextDetails.facades[key]||0)+1;
    }
    if(svgMode){
      // Merge simple fallback apertures, rather than creating thousands of SVG
      // mesh objects. Both panes and pale frames follow the mapped wall normal.
      const subset=windows.filter((pane,i)=>pane.appearanceEvidence==='user-reference-estimate'||i%2===0);
      if(subset.length){buildingGroup.add(new THREE.Mesh(geometryFromTriangles(windowQuadTriangles(subset,true)),mat.windowFrame));buildingGroup.add(new THREE.Mesh(geometryFromTriangles(windowQuadTriangles(subset,false)),mat.contextWindow));}
      nightWindowPlacements=subset;
      nightWindowMesh=new THREE.Mesh(geometryFromTriangles([]),mat.nightWindow);nightWindowMesh.name='context-lit-window-panes';buildingGroup.add(nightWindowMesh);
      return;
    }
    const batch=(items,material,plane,name)=>{
      if(!items.length)return;
      const geometry=plane?new THREE.PlaneGeometry(1,1):new THREE.BoxGeometry(1,1,1);
      const mesh=new THREE.InstancedMesh(geometry,material,items.length),dummy=new THREE.Object3D();
      mesh.name=name;mesh.receiveShadow=true;
      items.forEach((p,i)=>{
        dummy.position.copy(point(p.x+p.nx*(p.offset||0),p.y+p.ny*(p.offset||0),p.z));
        dummy.rotation.set(0,p.angle,0);dummy.scale.set(p.width,p.height,p.depth||1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
        if(p.color)mesh.setColorAt(i,new THREE.Color(p.color));
      });
      // Finishes do not change the source body or acquire analytical shadow credit.
      mesh.castShadow=false;buildingGroup.add(mesh);return mesh;
    };
    const glassColors=['#a4bdba','#799ba1','#c3d0c2','#739198','#a0b8b7','#8ba8aa','#bbc2ae'];
    batch(windows.map(p=>({...p,offset:.046,color:glassColors[p.shade]})),mat.contextWindow,true,'context-window-panes');
    const nightColors=['#ffe0a3','#ffd19b','#ffedc4','#e8edda','#efc784','#ffdcac','#e2e7e3'];
    nightWindowPlacements=windows;
    nightWindowMesh=batch(windows.map(p=>({...p,offset:.052,color:nightColors[p.shade]})),mat.nightWindow,true,'context-lit-window-panes');
    if(nightWindowMesh){nightWindowMesh.receiveShadow=false;nightWindowMesh.frustumCulled=false;}
    batch(windows.map(p=>({...p,width:p.width+.14,height:p.height+.14,offset:.025})),mat.windowFrame,true,'context-window-frames');
    const near=windows.filter(p=>p.detailed);
    batch(near.flatMap(p=>{
      if(Number.isInteger(p.mullions)){
        const count=Math.max(0,Math.min(6,p.mullions));
        return Array.from({length:count},(_,i)=>{
          const shift=p.width*((i+1)/(count+1)-.5);
          return {...p,x:p.x+p.ny*shift,y:p.y-p.nx*shift,width:.035,depth:.035,offset:.067};
        });
      }
      return [
        {...p,width:.035,depth:.035,offset:.067},
        {...p,z:p.z+p.height*.16,height:.032,depth:.035,offset:.067},
      ];
    }),mat.windowFrame,false,'context-window-mullions');
    batch(near.map(p=>({...p,width:p.width+.18,height:.065,depth:.21,z:p.z-p.height/2-.06,offset:.085})),mat.stoneLight,false,'context-window-sills');
    batch(contextDetails.roofEdges,mat.metal,false,'context-roof-edges');
    batch(contextDetails.plinths,mat.plinth,false,'context-foundation-finishes');
  }

  function rebuildContextBuildings() {
    removeGeometry(buildingGroup);
    nightWindowMesh=null;nightWindowPlacements=[];nightWindowSignature='';
    contextDetails={windows:[],roofs:[],roofEdges:[],plinths:[],facades:{},envelopes:{},balconies:{}};
    for (let i = labels.length - 1; i >= 0; i--) {
      if (labels[i].kind === 'target') { labels[i].element.remove(); labels.splice(i, 1); }
    }
    (data.buildings || []).filter(b => b.id !== data.site.house.id && b.id !== data.site.garage?.id && b.kind!=='house' && b.kind!=='garage').forEach(addContextBuilding);
    flushContextDetails();
    const appearance=createNeighborhoodAppearanceGroup(data.buildings,data,{origin:plotCentre,svgMode});
    buildingGroup.add(appearance);contextDetails.balconies=appearance.userData.balconyCounts;
    applyNightLighting(lastSolar,currentSettings);
    shadowBoundsDirty=true;
  }

  // Both terrain meshes use the same real openings: no grass or context slab
  // may cross the swimming water, recessed plunge or the sunken firepit floor.
  const waterCutouts=settings=>designTerrainCutouts(settings,data);
  let contextTerrains=[],contextTerrainCutouts='';
  function syncContextTerrain(settings){
    const cutouts=waterCutouts(settings),signature=JSON.stringify(cutouts);
    if(signature===contextTerrainCutouts)return;
    contextTerrainCutouts=signature;
    for(const mesh of contextTerrains){mesh.geometry.dispose();staticGroup.remove(mesh);}
    const extent=[surroundings.minX,surroundings.minY,surroundings.maxX,surroundings.maxY];
    // A coarse context triangle can bridge above the native front lawn even
    // when its vertices sit below it. Match the lawn's vertices and cutouts
    // inside its frame, then use the coarser grid only outside that frame.
    const localFrame={x0:plot.minX-.1,y0:plot.minY-.1,x1:plot.maxX+.1,y1:plot.maxY+.1};
    contextTerrains=[
      makeTerrain(staticGroup,extent,svgMode?12:4,(x,y)=>contextGrade(x,y)-.015,data.existingVegetation?mat.contextGround:mat.walkway,null,false,[...cutouts,localFrame]),
      makeTerrain(staticGroup,[localFrame.x0,localFrame.y0,localFrame.x1,localFrame.y1],svgMode?2:.65,(x,y)=>terrainAt(x,y,data)-.015,mat.walkway,null,false,cutouts),
    ];
    if(mat.contextGroundColour){
      const overlay=new THREE.Mesh(projectContextGroundUVs(contextTerrains[0].geometry.clone(),data.contextGroundColour),mat.contextGroundColour);
      overlay.position.y=.02;overlay.name='measured-neighborhood-ground-colours';overlay.receiveShadow=true;
      staticGroup.add(overlay);contextTerrains.push(overlay);
    }
  }
  syncContextTerrain({terraceDepth:data.site.terrace.depth});
  const mappedRoads=data.neighborhood?.roads?.filter(r=>r.footprint?.length>=3)||[];
  if(mappedRoads.length){
    for(const source of mappedRoads){
      const b=boundsOf(source.footprint);
      const road=makeTerrain(staticGroup,[b.minX,b.minY,b.maxX,b.maxY],svgMode?3:1.5,(x,y)=>contextGrade(x,y)+.025,mat.road,source.footprint);
      road.name=source.id||'context-road';if(svgMode)road.renderOrder=-95;
      if(source.labelPosition){const [x,y]=source.labelPosition;label(source.label,[x,y,contextGrade(x,y)+.18],'road');}
    }
  }else{
    const road=makeTerrain(staticGroup,[-65,-7.8,115,-2],4,(x,y)=>contextGrade(x,y)+.025,mat.road);
    road.name='context-street';if(svgMode)road.renderOrder=-95;
    const sidewalk=makeTerrain(staticGroup,[-65,-1.9,115,-.1],4,(x,y)=>contextGrade(x,y)+.05,mat.stoneLight);
    sidewalk.name='context-sidewalk';if(svgMode)sidewalk.renderOrder=-95;
    for (let x=-50;x<110;x+=8) box(staticGroup,x,-4.96,contextGrade(x,-5)+.055,3.5,.1,.015,mat.stoneLight,false,-94);
    label(profile.streetLabel, [plotCentre[0],-3.7,terrainAt(plotCentre[0],-3.7,data)+.18], 'road');
  }
  rebuildContextBuildings();

  function syncExistingVegetation(settings){
    const signature=JSON.stringify([settings.existingVegetation,settings.existingCanopyAnalysis,settings.existingLeafMode,settings.sunDate?.slice(5,7)]);
    if(signature===vegetationSignature&&vegetationSource===data.existingVegetation&&vegetationBuildings===data.buildings)return;
    vegetationSignature=signature;vegetationSource=data.existingVegetation;vegetationBuildings=data.buildings;
    removeGeometry(existingVegetationGroup);
    existingVegetationGroup.add(createExistingVegetationGroup(data,settings,{svgMode,origin:plotCentre}));
    contextRevision++;shadowBoundsDirty=true;
    gardenLightBoundary?.install(existingVegetationGroup);
  }

  /** Fit proposed glazing and finishes to each mapped property's wall edges.
   * The mapped footprint and sampled roof remain the existing envelope. */
  function addMappedHouse(group,settings,mat,style) {
    const h=data.site.house,envelope=localRoofEnvelope(h),{ring,samples,base}=envelope;
    const layout=mappedHouseFacadeLayout(data,settings,envelope),floor=layout.floorZ;
    group.userData.facadeSummary={windows:layout.windows};
    const proposedFacade=createRenovationFacadeGroup(layout,mat,settings);if(proposedFacade)group.add(proposedFacade);
    for(const wall of layout.edges){
      const {index:i,length:len,roofEdge:edge,a,b,outward}=wall;
      if(len<.0001)continue;
      const eaves=u=>roofEdgeHeight(edge,u);
      const p=(u,z,offset=0)=>[a[0]+(b[0]-a[0])*u+outward[0]*offset,a[1]+(b[1]-a[1])*u+outward[1]*offset,z];
      const panel=(u0,u1,z0,z1,material,offset=0,shadow=true)=>{
        if(u1-u0<.001)return;
        const top=typeof z1==='function'?z1:()=>z1,triangles=[];
        const cuts=[u0,...edge.points.map((_,j)=>edge.fractions?.[j]??j/(edge.points.length-1)).filter(u=>u>u0&&u<u1),u1];
        for(let j=0;j<cuts.length-1;j++){
          const u=cuts[j],v=cuts[j+1],hu=top(u),hv=top(v);
          if(Math.min(hu,hv)<=z0+.001)continue;
          triangles.push(localTriangle(p(u,z0,offset),p(v,z0,offset),p(v,hv,offset)),localTriangle(p(u,z0,offset),p(v,hv,offset),p(u,hu,offset)));
        }
        if(!triangles.length)return;
        const mesh=new THREE.Mesh(geometryFromTriangles(triangles),material);
        mesh.castShadow=shadow;mesh.receiveShadow=true;group.add(mesh);
      };
      const windows=layout.windows.filter(w=>w.edgeIndex===i);
      const glazing=windows.find(w=>w.kind==='hst');
      if(!proposedFacade){
      if(glazing){
        const lo=glazing.lo/len,hi=glazing.hi/len,top=glazing.z+glazing.height;
        panel(0,1,base,floor,mat.plinth);panel(0,lo,floor,top,mat.wall);panel(hi,1,floor,top,mat.wall);panel(0,1,top,eaves,mat.wall);
        panel(lo,hi,floor+.04,top-.04,mat.glass,.018,false);
        for(const u of [lo,lo+(hi-lo)/3,lo+2*(hi-lo)/3,hi])panel(u-.023/len,u+.023/len,floor,top,mat.metal,.035,false);
        panel(lo,hi,floor,floor+.045,mat.metal,.04,false);panel(lo,hi,top-.045,top,mat.metal,.04,false);
      }else if(data.site.id==='nadmorska-17'){panel(0,1,base,floor,mat.plinth);panel(0,1,floor,eaves,mat.wall);}
      else panel(0,1,base,eaves,mat.wall);
      for(const w of windows.filter(w=>w.kind==='window')){
        panel(w.lo/len,w.hi/len,w.z,w.z+w.height,mat.metal,.03,false);
        panel((w.lo+.06)/len,(w.hi-.06)/len,w.z+.06,w.z+w.height-.06,mat.contextWindow,.05,false);
      }
      }
      line(group,edge.points.map((q,j)=>p(edge.fractions?.[j]??j/(edge.points.length-1),q[2]-.06,.04)),'#4e5751',.9);
    }
    const roof=samples.length>6?sampledRoofGeometry(ring,samples,envelope.fallback,envelope.boundary):null;
    if(roof){const mesh=new THREE.Mesh(roof,mat.roof);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}
    else group.add(polygonPrism(ring,envelope.fallback,num(h.roofTopZ,envelope.fallback),mat.roof));
    group.add(polygonPrism(ring,floor-.12,floor,mat.stoneLight));
    const sofa=data.site.observers?.sofa||data.site.rearMidpoint;
    box(group,sofa[0]-1.4,sofa[1]-.6,floor,2.8,.8,.4,mat.linen,false);
    box(group,sofa[0]-1.4,sofa[1]-.6,floor+.4,2.8,.18,.38,mat.linen,false);
    addHouseRenovation(group,layout,style,{svgMode});
  }

  function addHouse(group, settings, exterior, style) {
    const activeStyle=settings.styleHouseFinish===true&&style.id!=='current'?style:null;
    if(data.site.id&&data.site.id!=='sternicza-11'){addMappedHouse(group,settings,exterior,activeStyle);return;}
    sharedHouseModel=createSharedHouseModel(data,settings,{garageLayout:currentGarageLayout,terrainAt,svgMode});
    group.add(sharedHouseModel.root);
  }

  function addHedges(group,settings) {
    const segments=hedgeSegments(settings,data);
    const analyticalMaterial=svgMode?mat.hedge:mat.hedge.clone();
    if(!svgMode){
      analyticalMaterial.colorWrite=false;analyticalMaterial.depthWrite=false;
      analyticalMaterial.userData.transient=true;
    }
    for(const segment of segments) {
      const a=segment.a,b=segment.b,dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
      const n=Math.max(1,Math.ceil(length/1.2)), triangles=[];
      const inward=[-dy/length*.12,dx/length*.12];
      for(let i=0;i<n;i++){
        const u=i/n,v=(i+1)/n,p=[a[0]+dx*u,a[1]+dy*u],q=[a[0]+dx*v,a[1]+dy*v];
        const groundP=hedgeGroundAt(...p,segment.side,settings,data,segment.groundZone),groundQ=hedgeGroundAt(...q,segment.side,settings,data,segment.groundZone);
        const topP=hedgeTopAt(...p,segment.side,settings,data,segment.groundZone),topQ=hedgeTopAt(...q,segment.side,settings,data,segment.groundZone);
        if(topP<=groundP && topQ<=groundQ)continue;
        triangles.push(localTriangle([...p,groundP],[...q,groundQ],[...q,topQ]),localTriangle([...p,groundP],[...q,topQ],[...p,topP]));
        // The mathematical hedge plane is retained. Thin volume makes it legible in plan.
        const pp=[p[0]+inward[0],p[1]+inward[1]],qq=[q[0]+inward[0],q[1]+inward[1]];
        triangles.push(localTriangle([...p,topP],[...q,topQ],[...qq,topQ]),localTriangle([...p,topP],[...qq,topQ],[...pp,topP]));
        triangles.push(localTriangle([...pp,groundP],[...qq,topQ],[...qq,groundQ]),localTriangle([...pp,groundP],[...pp,topP],[...qq,topQ]));
      }
      const mesh=new THREE.Mesh(geometryFromTriangles(triangles),analyticalMaterial);mesh.castShadow=true;mesh.receiveShadow=svgMode;mesh.userData.contactShading=false;group.add(mesh);
      if(segment.side!=='front'&&segment.groundZone!=='front'&&num(settings.bedRaise)>0){
        const soil=[];
        for(let i=0;i<n;i++){
          const u=i/n,v=(i+1)/n,p=[a[0]+dx*u,a[1]+dy*u],q=[a[0]+dx*v,a[1]+dy*v];
          const pp=[p[0]-dy/length*.85,p[1]+dx/length*.85],qq=[q[0]-dy/length*.85,q[1]+dx/length*.85];
          const pz=gardenGroundAt(...p,settings,data)+num(settings.bedRaise),qz=gardenGroundAt(...q,settings,data)+num(settings.bedRaise);
          const ppz=gardenGroundAt(...pp,settings,data)+.02,qqz=gardenGroundAt(...qq,settings,data)+.02;
          soil.push(localTriangle([...p,pz],[...q,qz],[...qq,qqz]),localTriangle([...p,pz],[...qq,qqz],[...pp,ppz]));
        }
        const bed=new THREE.Mesh(geometryFromTriangles(soil),mat.grass);bed.receiveShadow=true;group.add(bed);
      }
      if(svgMode){const verts=[];for(let i=0;i<=n;i++){const t=i/n,x=a[0]+dx*t,y=a[1]+dy*t;verts.push([x,y,hedgeTopAt(x,y,segment.side,settings,data,segment.groundZone)+.015]);}line(group,verts,'#68815a',.7);}
    }
    if(!svgMode)group.add(createHedgeVegetation(segments,{
      material:mat.thuja,spacing:num(settings.costSpacing,.65),
      groundAt:(x,y,segment)=>hedgeGroundAt(x,y,segment.side,settings,data,segment.groundZone),
      topAt:(x,y,segment)=>hedgeTopAt(x,y,segment.side,settings,data,segment.groundZone),
    }));
  }

  function addShrubs(group,settings) {
    const placements=[];
    const program=gardenProgram(settings,data),pool=poolBounds(settings,data),t=data.site.terrace;
    for(const {a,b} of hedgeSegments(settings,data)){
      const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),n=Math.max(1,Math.floor(len/1.45));
      for(let i=0;i<n;i++){
        const u=(i+.5)/n,x=a[0]+dx*u-dy/len*.85,y=a[1]+dy*u+dx/len*.85;
        if(!contains(x,y,data.site.boundary)||contains(x,y,data.site.house.footprint))continue;
        if(x>pool.x-.75&&x<pool.x+pool.width+.75&&y>pool.y-.75&&y<pool.y+pool.length+.75)continue;
        if(x>t.x-.6&&x<t.x+t.width+.6&&y>t.y-.6&&y<t.y+num(settings.terraceDepth,t.depth)+.6)continue;
        if(program.active&&[program.sauna,program.firepit,program.coldPlunge].some(r=>x>r.x-.8&&x<r.x+r.width+.8&&y>r.y-.8&&y<r.y+r.length+.8))continue;
        placements.push([x,y,.35+(Math.sin(x+y)*.5+.5)*.3]);
      }
    }
    if(svgMode){
      placements.filter((_,i)=>i%3===0).forEach(([x,y,h])=>{const shrub=new THREE.Mesh(new THREE.IcosahedronGeometry(1,0),mat.leaf);shrub.position.copy(point(x,y,gardenGroundAt(x,y,settings,data)+h*.48));shrub.scale.set(.53,h,.53);group.add(shrub);});
      return;
    }
    const geometry=new THREE.IcosahedronGeometry(1,1), instance=new THREE.InstancedMesh(geometry,mat.leaf,placements.length*3),dummy=new THREE.Object3D();
    placements.forEach(([x,y,h],i)=>{
      const ground=gardenGroundAt(x,y,settings,data);
      for(let cluster=0;cluster<3;cluster++){
        const angle=x+y+cluster*Math.PI*2/3;
        dummy.position.copy(point(x+Math.cos(angle)*.17,y+Math.sin(angle)*.17,ground+h*(.45+cluster*.025)));
        dummy.scale.set(.36,h*(.72+cluster*.055),.35);dummy.rotation.y=angle;dummy.updateMatrix();instance.setMatrixAt(i*3+cluster,dummy.matrix);
        instance.setColorAt(i*3+cluster,new THREE.Color(cluster===0?'#d3dfc5':cluster===1?'#bacaab':'#e0e6d2'));
      }
    });
    // These small plants are illustrative; the numerical shade model excludes them.
    instance.castShadow=false;instance.receiveShadow=true;group.add(instance);
  }

  function addGarden(group,settings,mat,style) {
    // Keep the actual deck, tub and terrace furniture together: the ground
    // dollhouse clones this same rendered geometry in drawing coordinates.
    const terraceGroup=new THREE.Group();terraceGroup.name='shared-ground-terrace';
    terraceGroup.userData.sharedOutdoor='terrace';group.add(terraceGroup);
    const styled = style.id !== 'current';
    const program=gardenProgram(settings,data);
    const rear=data.site.rearMidpoint[1],floor=data.site.floorReference.z+num(settings.floorHeight,1.2),terrace=data.site.terrace;
    const depth=num(settings.terraceDepth,terrace.depth),x=terrace.x,width=terrace.width;
    const ground=gardenGroundAt(x+width/2,rear+depth/2,settings,data);
    const deckBase=Math.min(ground,floor-.15);
    const jacuzzi=jacuzziBounds(settings,data),jx=jacuzzi.x0,jy=jacuzzi.y0;
    const deckHeight=Math.max(.15,floor-deckBase);
    // A proposed threshold overlaps the existing floor to bridge the actual
    // stepped/angled facade. It shares its dimensions with the shade engine.
    const threshold=num(terrace.thresholdDepth);
    const deckSlab=(sx,sy,w,l)=>{
      const mesh=box(terraceGroup,sx,sy,deckBase,w,l,deckHeight,mat.stone,true,styled?-77:0);
      if(styled)finishDeckBox(mesh,mat.deck,style,x,rear);
    };
    if(threshold>0)deckSlab(x,rear-threshold,width,threshold);
    // Each slab terminates at a real side of the tub opening.
    deckSlab(x,rear,jx-x,depth);
    deckSlab(jacuzzi.x1,rear,x+width-jacuzzi.x1,depth);
    deckSlab(jx,rear,jacuzzi.width,jy-rear);
    deckSlab(jx,jacuzzi.y1,jacuzzi.width,rear+depth-jacuzzi.y1);
    // Tile joints and a shadow reveal provide scale on the larger terrace.
    if(styled){
      terraceGroup.add(createStyledDeck(style,{x,y:rear,width,length:depth,z:floor+.006,hole:jacuzzi},{svgMode}));
    }else{
      for(let tx=x+1.2;tx<x+width;tx+=1.2){
        if(tx>jx&&tx<jacuzzi.x1){line(terraceGroup,[[tx,rear,floor+.006],[tx,jy,floor+.006]],'#8c816c',.32);line(terraceGroup,[[tx,jacuzzi.y1,floor+.006],[tx,rear+depth,floor+.006]],'#8c816c',.32);}
        else line(terraceGroup,[[tx,rear,floor+.006],[tx,rear+depth,floor+.006]],'#8c816c',.32);
      }
      for(let ty=rear+1.2;ty<rear+depth;ty+=1.2){
        if(ty>jy&&ty<jacuzzi.y1){line(terraceGroup,[[x,ty,floor+.006],[jx,ty,floor+.006]],'#8c816c',.32);line(terraceGroup,[[jacuzzi.x1,ty,floor+.006],[x+width,ty,floor+.006]],'#8c816c',.32);}
        else line(terraceGroup,[[x,ty,floor+.006],[x+width,ty,floor+.006]],'#8c816c',.32);
      }
    }
    let tubWater;
    if(jacuzzi.infinity){
      const waterZ=num(jacuzzi.waterZ,floor-.035);
      const tw=jacuzzi.width,tl=jacuzzi.length,bottom=jacuzzi.bottomZ;
      // Three coping sides and one low spill lip make the garden-facing edge
      // continuous with the water. The dark slot is a proposed catch channel,
      // not a waterfall flowing into the planting or over the terrace stairs.
      box(terraceGroup,jx,jy,bottom-.02,tw,tl,.06,mat.basin);
      box(terraceGroup,jx,jy,bottom,.13,tl,floor+.03-bottom,mat.basin);
      box(terraceGroup,jacuzzi.x1-.13,jy,bottom,.13,tl,floor+.03-bottom,mat.basin);
      box(terraceGroup,jx,jy,bottom,tw,.13,floor+.03-bottom,mat.basin);
      box(terraceGroup,jx,jacuzzi.y1-.09,bottom,tw,.09,waterZ-bottom-.008,mat.stoneLight);
      box(terraceGroup,jx-.025,jy-.025,floor+.015,.18,tl+.025,.06,mat.stoneLight,false);
      box(terraceGroup,jacuzzi.x1-.155,jy-.025,floor+.015,.18,tl+.025,.06,mat.stoneLight,false);
      box(terraceGroup,jx-.025,jy-.025,floor+.015,tw+.05,.18,.06,mat.stoneLight,false);
      const channel=box(terraceGroup,jx+.13,jacuzzi.y1,waterZ-.11,tw-.26,.10,.035,mat.metal,false);
      channel.name='jacuzzi-overflow-channel';
      const spill=box(terraceGroup,jx+.13,jacuzzi.y1-.015,waterZ-.08,tw-.26,.018,.08,mat.waterLight,false);
      spill.name='jacuzzi-overflow-edge';
      const w=jacuzzi.waterBounds;
      tubWater=roundedSlab(terraceGroup,w.x0,w.y0,waterZ-.015,w.x1-w.x0,w.y1-w.y0,.015,.025,mat.waterLight,0,false);
      box(terraceGroup,w.x0,w.y1,waterZ-.012,w.x1-w.x0,jacuzzi.y1-w.y1,.012,mat.waterLight,false);
    }else{
      const tw=jacuzzi.width,tl=jacuzzi.length,h=jacuzzi.externalHeight;
      roundedSlab(terraceGroup,jx,jy,floor+.06-h,tw,tl,h,.26,mat.basin,.13);
      roundedSlab(terraceGroup,jx+.13,jy+.13,jacuzzi.bottomZ-.01,tw-.26,tl-.26,.04,.15,mat.basin);
      roundedSlab(terraceGroup,jx-.015,jy-.015,floor+.015,tw+.03,tl+.03,.075,.26,mat.stoneLight,.17);
      // Sealed factory-style tub: do not imply that its shell can be cut into
      // an infinity basin. The separately priced overflow option is bespoke.
      const w=jacuzzi.waterBounds;
      tubWater=roundedSlab(terraceGroup,w.x0,w.y0,jacuzzi.waterZ-.015,w.x1-w.x0,w.y1-w.y0,.015,.14,mat.waterLight,0,false);
    }
    tubWater.name='jacuzzi-water';
    jacuzziEffects=createJacuzziEffects(jacuzzi,{svgMode,mood:settings.jacuzziMood||'aurora'});
    terraceGroup.add(jacuzziEffects.group);
    if(jacuzzi.seatCentres){
      for(const [i,[sx,sy]] of jacuzzi.seatCentres.entries()){
        const seat=roundedSlab(terraceGroup,sx-.23,sy-.23,floor-.43,.46,.46,.10,.13,mat.stoneLight);
        seat.name=`jacuzzi-seat-${i+1}`;
      }
    }else for(const sx of [jx+.17,jx+1.55])roundedSlab(terraceGroup,sx,jy+.25,floor-.42,.48,1.35,.10,.13,mat.stoneLight);
    if(!svgMode){
      const jets=new THREE.InstancedMesh(new THREE.SphereGeometry(.035,8,5),mat.metal,8),dummy=new THREE.Object3D();
      for(let i=0;i<8;i++){dummy.position.copy(point(i<4?jx+.155:jx+jacuzzi.width-.155,jy+.43+(i%4)*(jacuzzi.length-.88)/3,floor-.28));dummy.updateMatrix();jets.setMatrixAt(i,dummy.matrix);}terraceGroup.add(jets);
    }
    const {groundZ:stepGround,drop}=terraceGroundReference(settings,data);
    const stairs=terraceStairs({...terrace,y:rear},depth,drop,settings,data);
    if(stairs.count){
      for(let i=0;i<stairs.count;i++)box(terraceGroup,stairs.x,stairs.y+i*.29,stepGround,stairs.width,.29,drop*(stairs.count-i)/stairs.count,mat.stone);
    }
    // Low daybed at the terrace's quiet end.
    // The tub occupies physical right (low site x); this seating stays at left.
    if(styled){
      const composition=resortTerraceLayout(data,settings,jacuzzi,stairs);
      terraceGroup.userData.resortLayout=composition;
      for(const piece of composition.items)terraceGroup.add(createStyledResortPiece(style,mat,{...piece,z:floor},{svgMode}));
    }else{
      box(terraceGroup,x+width-1.15,rear+.7,floor,.7,2.1,.26,mat.wood,false);
      roundedSlab(terraceGroup,x+width-1.18,rear+.72,floor+.26,.76,2.0,.12,.07,mat.linen);
      roundedSlab(terraceGroup,x+width-1.12,rear+.78,floor+.39,.64,.38,.10,.07,mat.linen);
      roundedSlab(terraceGroup,x+width-2.10,rear+1.2,floor,.65,.65,.34,.20,mat.woodLight);
    }
    // Preserve the same spatial batching without folding the terrace into
    // distant pool, path or ground-level garden furniture batches.
    if(!svgMode)batchGardenBoxes(terraceGroup);
    const p=poolBounds(settings,data),px=p.x,py=p.y,pw=p.width,pl=p.length,poolLevels=spaLevels(settings,data).pool;
    const copingBase=poolLevels.copingBaseZ,copingHeight=poolLevels.copingTopZ-copingBase;
    for(const [cx,cy,cw,cl] of [[px-.28,py-.28,pw+.56,.28],[px-.28,py+pl,pw+.56,.28],[px-.28,py,.28,pl],[px+pw,py,.28,pl]]){
      const coping=box(group,cx,cy,copingBase,cw,cl,copingHeight,mat.stoneLight,false,-70);
      coping.name=program.active?'pool-coping-and-skirt':'pool-coping';
    }
    // The rim and skirt follow the grade range across the entire coping.
    const waterTop=poolLevels.waterZ;
    {
      const poolBottom=poolLevels.bottomZ;
      box(group,px,py,poolBottom-.08,pw,pl,.08,mat.basin,false);
      box(group,px-.06,py,poolBottom,.06,pl,poolLevels.copingTopZ-poolBottom,mat.basin,false);
      box(group,px+pw,py,poolBottom,.06,pl,poolLevels.copingTopZ-poolBottom,mat.basin,false);
      box(group,px,py-.06,poolBottom,pw,.06,poolLevels.copingTopZ-poolBottom,mat.basin,false);
      box(group,px,py+pl,poolBottom,pw,.06,poolLevels.copingTopZ-poolBottom,mat.basin,false);
      // Entry ledges stay inside the water footprint, away from the garden path.
      if(program.active)for(let i=0;i<3;i++)box(group,px+.10,py+.10+i*.32,waterTop-.28*(i+1),.95,.32,.12,mat.stoneLight,false);
    }
    const poolWater=box(group,px,py,waterTop-.025,pw,pl,.025,mat.water,false,-69);
    poolWater.name='pool-water';
    for(let ty=py+.8;ty<py+pl;ty+=.8){line(group,[[px-.28,ty,poolLevels.copingTopZ+.002],[px,ty,poolLevels.copingTopZ+.002]],'#b1a994',.45);line(group,[[px+pw,ty,poolLevels.copingTopZ+.002],[px+pw+.28,ty,poolLevels.copingTopZ+.002]],'#b1a994',.45);}
    const furniture=gardenFurniture(data,settings);
    if(styled&&furniture.resort?.scheme)group.add(createRenovationGardenDetails(furniture,style,settings,data,mat,{svgMode}));
    if(styled&&furniture.resort){
      for(const piece of furniture.resort.items){
        if(rectanglesOverlap(piece,{x,y:rear,width,length:depth},.15)||(stairs.count&&rectanglesOverlap(piece,stairs,.15)))continue;
        if(data.site.garage&&settings.removeGarage===false&&pointInPolygon([piece.x+piece.width/2,piece.y+piece.length/2],data.site.garage.footprint))continue;
        group.add(createStyledResortPiece(style,mat,{...piece,z:gardenGroundAt(piece.x+piece.width/2,piece.y+piece.length/2,settings,data)},{svgMode}));
      }
    }
    for(const [lx,y] of styled&&furniture.resort?[]:furniture.loungers){
      const lounger={x:lx,y,width:.78,length:2};
      if(rectanglesOverlap(lounger,{x,y:rear,width,length:depth},.15)||(stairs.count&&rectanglesOverlap(lounger,stairs,.15)))continue;
      const lz=gardenGroundAt(lx,y,settings,data);
      if(styled){
        group.add(createStyledLounger(style,mat,{...lounger,z:lz},{svgMode}));
        continue;
      }
      for(const railX of [lx,lx+.725])box(group,railX,y,lz+.16,.055,2,.08,mat.wood,false);
      for(const crossY of [y+.04,y+1.90])box(group,lx,crossY,lz+.16,.78,.055,.08,mat.wood,false);
      for(const footX of [lx+.06,lx+.665])for(const footY of [y+.12,y+1.77])box(group,footX,footY,lz,.05,.05,.19,mat.metal,false);
      roundedSlab(group,lx+.02,y+.03,lz+.24,.74,1.9,.1,.07,mat.linen);
      const back=box(group,lx+.02,y+.03,lz+.37,.74,.6,.09,mat.linen,false);back.rotation.x=-.3;
    }
    // Ground-level circulation and a small dining setting, only when the garage is removed.
    for(const [pathX,pathY] of furniture.path){const z=gardenGroundAt(pathX+.5,pathY,settings,data);box(group,pathX,pathY,z+.018,1.15,.9,.035,mat.stoneLight,false,-80);}
    if((!data.site.garage||settings.removeGarage!==false)&&furniture.diningVisible!==false){
      const dining=furniture.dining,dx=dining.x+(dining.width-1.55)/2,dy=dining.y+(dining.length-.8)/2,dz=gardenGroundAt(dx,dy,settings,data);
      box(group,dining.x,dining.y,dz-.015,dining.width,dining.length,.035,mat.stone,false,-80);
      if(styled){
        group.add(createStyledDining(style,mat,{...dining,z:dz},{svgMode}));
      }else{
        box(group,dx,dy,dz+.65,1.55,.8,.09,mat.woodLight,false);
        [dx+.1,dx+1.3].forEach(tx=>box(group,tx,dy+.1,dz,.12,.6,.65,mat.wood,false));
        for(const cy of [dy-.55,dy+1.0])for(const cx of [dx+.08,dx+.92]){
          box(group,cx,cy,dz+.38,.55,.5,.06,mat.wood,false);
          roundedSlab(group,cx+.015,cy+.015,dz+.44,.52,.47,.06,.04,mat.linen);
          for(const legX of [cx+.045,cx+.455])for(const legY of [cy+.04,cy+.41])box(group,legX,legY,dz,.045,.045,.4,mat.wood,false);
          const backY=cy+(cy<dy?0:.43);
          for(const postX of [cx,cx+.50])box(group,postX,backY,dz+.45,.05,.07,.4,mat.wood,false);
          for(const backZ of [dz+.60,dz+.78])box(group,cx,backY,backZ,.55,.07,.065,mat.wood,false);
        }
      }
    }
    if(program.active)group.add(createSpaAmenityGroup(program,spaLevels(settings,data),mat,svgMode));
    addShrubs(group,settings);
  }

  function addCanopy(group,settings,mat,style) {
    if(!settings.canopyEnabled)return;
    const cover=terraceCover(settings,data),b=cover.bounds;
    if(!cover.enabled||!b)return;
    if(cover.type==='balcony'){group.add(createTerraceCoverGroup(cover,mat,svgMode,style));return;}
    for(const member of cover.boxes){
      const finish=member.part==='roof'?mat.stoneLight:member.part==='post'?mat.metal:mat.wood;
      const m=box(group,member.x0,member.y0,member.z0,member.x1-member.x0,
        member.y1-member.y0,member.z1-member.z0,finish);
      m.name=member.id;
    }
    if(style.id!=='current'){group.add(createStyledCanopyTrim(style,mat,b));return;}
    for(let x=b.x0+.35;x<b.x1;x+=.52)box(group,x,b.y0,b.z-.04,.07,b.y1-b.y0,.04,mat.wood,false);
  }

  function rebuildDesign(settings) {
    terrainMeshes.length=0;
    garageScene=null;currentGarageLayout=garageLayout(settings,data,{terrainAt});
    designGroup.remove(houseGroup,finishesGroup);
    removeGeometry(designGroup);
    lastVehiclePose='';
    syncContextTerrain(settings);
    const boundary=data.site.boundary;
    const ground=makeTerrain(designGroup,[plot.minX-.1,plot.minY-.1,plot.maxX+.1,plot.maxY+.1],svgMode?2:.65,(x,y)=>gardenGroundAt(x,y,settings,data)+.008,mat.grass,boundary,!svgMode,waterCutouts(settings));
    terrainMeshes.push(ground);
    const linePoints=[];
    const ring=closeRing(boundary);
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/1.5));
      for(let j=0;j<n;j++){const t=j/n,x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t;linePoints.push([x,y,gardenGroundAt(x,y,settings,data)+.045]);}
    }
    linePoints.push(linePoints[0]);line(designGroup,linePoints,'#f5f0d2',.95);
    if(num(settings.gardenRaise)>0){
      const faces=[];
      for(let i=0;i<linePoints.length-1;i++){
        const p=linePoints[i],q=linePoints[i+1];
        if(Math.min(p[1],q[1])<data.site.rearMidpoint[1])continue;
        const p0=[p[0],p[1],terrainAt(p[0],p[1],data)],q0=[q[0],q[1],terrainAt(q[0],q[1],data)];
        faces.push(localTriangle(p0,q0,q),localTriangle(p0,q,p));
      }
      const fillEdge=new THREE.Mesh(geometryFromTriangles(faces),mat.plinth);fillEdge.receiveShadow=true;if(svgMode)fillEdge.renderOrder=-89;designGroup.add(fillEdge);
    }
    if(data.site.id==='nadmorska-17'){
      // This corner property has its own entrance and paving proposal.
      for(const pad of data.site.approachPads||[]){
        const z=terrainAt(pad.x+pad.width/2,pad.y+pad.length/2,data);
        box(designGroup,pad.x,pad.y,z+.015,pad.width,pad.length,.035,mat.stone,false,-80);
      }
    }else if(data.site.id==='korzeniowskiego-40'){
      const h=boundsOf(data.site.house.footprint),centre=(h.minX+h.maxX)/2,frontZ=terrainAt(centre,h.minY/2,data);
      box(designGroup,centre-.6,.25,frontZ+.015,1.2,Math.max(.1,h.minY-.25),.035,mat.stone,false,-80);
    }else{
      const gate=frontHedgeLayout({...settings,hedgeFront:Math.max(1,num(settings.hedgeFront))},data).openings.find(g=>g.id==='front-pedestrian-opening');
      const house=houseAppearanceLayout(data,settings,{garageLayout:currentGarageLayout});
      const entrance=entranceAccessLayout(house,{groundAt:(x,y)=>terrainAt(x,y,data),gate});
      // Paving follows the same stair bottom as the house, including floor
      // height edits and the side-return route for an active wider garage.
      for(const pad of entrance.paving){
        if(currentGarageLayout.enabled)designGroup.add(createGarageAwarePaving(pad,pad.z,pad.thickness,mat.stone,currentGarageLayout));
        else box(designGroup,pad.x,pad.y,pad.z,pad.width,pad.length,pad.thickness,mat.stone,false,-80);
      }
    }
    garageScene=createGarageGroup(currentGarageLayout,mat,{svgMode,groundAt:(x,y)=>terrainAt(x,y,data)});
    designGroup.add(garageScene.group);terrainMeshes.push(...garageScene.terrainMeshes);
    updateGaragePreview(settings);
    addHedges(designGroup,settings);
    for (const volume of screeningTreeVolumes(settings, data)) {
      if (volume.enabled === false) continue;
      designGroup.add(createScreeningTreeGroup(volume, {bark: mat.treeBark, pine: mat.treePine, spruce: mat.treeSpruce, deciduous: mat.treeDeciduous, ghost: mat.treeGhost}, svgMode));
    }
    if(settings.includeHighFeatures){
      const returns=(data.buildings||[]).flatMap(b=>b.highFeatures||[]);
      if(returns.length){
        const geometry=new THREE.BufferGeometry().setFromPoints(returns.map(p=>point(...xyz(p))));
        const material=new THREE.PointsMaterial({color:'#b77d38',size:svgMode?.22:.14,sizeAttenuation:true});material.userData.transient=true;
        designGroup.add(new THREE.Points(geometry,material));
      }
    }
    if(settings.removeGarage===false&&data.site.garage){
      const g=data.site.garage,base=num(g.baseZ,2.49),returns=(g.roofPoints||[]).map(xyz).filter(p=>p.length>=3&&Number.isFinite(p[2]));
      const eaves=returns.length>6?Math.min(...returns.map(p=>p[2])):num(g.roofZ,7.72);
      designGroup.add(polygonPrism(g.footprint,base,eaves,mat.plinth));
      const roofGeometry=returns.length>6?sampledRoofGeometry(g.footprint,returns,eaves):null;
      if(roofGeometry){const roofMesh=new THREE.Mesh(roofGeometry,mat.roof);roofMesh.castShadow=true;roofMesh.receiveShadow=true;designGroup.add(roofMesh);}
      else designGroup.add(polygonPrism(g.footprint,eaves,num(g.roofTopZ,eaves),mat.roof));
    }
    designGroup.add(houseGroup,finishesGroup);
    shadowBoundsDirty=true;
  }

  function rebuildFinishes(settings,style,rebuildHouse) {
    gardenNight?.dispose();
    jacuzziEffects=null;
    removeGeometry(finishesGroup);
    if(rebuildHouse){sharedHouseModel?.dispose();sharedHouseModel=null;removeGeometry(houseGroup);}
    disposeProposedMaterials(designMaterials,mat);
    designMaterials=proposedMaterials(mat,style,{svgMode});
    if(rebuildHouse)addHouse(houseGroup,settings,settings.styleHouseFinish===true?designMaterials:mat,style);
    addGarden(finishesGroup,settings,designMaterials,style);
    addCanopy(finishesGroup,settings,designMaterials,style);
    finishesGroup.add(createPrivacyStructureGroup(privacyStructures(settings,data),designMaterials));
    if(!svgMode){
      projectWaterUVs(finishesGroup,mat.water,mat.waterLight);
      batchGardenBoxes(finishesGroup);
    }
    gardenNight=createGardenNightLighting(settings,data,{svgMode,style});
    finishesGroup.add(gardenNight.group);
    applyNightLighting(lastSolar,settings);
    contextRevision++;
    shadowBoundsDirty=true;
  }

  function refreshShadowBounds() {
    shadowReceiverPoints=[];shadowCasterPoints=[];
    const bounds=new THREE.Box3();
    // Cache box corners when geometry changes. Moving only the time slider then
    // transforms these few points, without rebuilding meshes or triangulating roofs.
    const collect=(group,isSite)=>{
      group.updateMatrixWorld(true);
      group.traverse(mesh=>{
        if(!mesh.isMesh||mesh.isInstancedMesh||!mesh.geometry?.attributes.position?.count)return;
        if(!mesh.castShadow&&!(isSite&&mesh.receiveShadow))return;
        if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
        bounds.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
        if(bounds.isEmpty())return;
        for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
          const p=new THREE.Vector3(x,y,z);
          if(mesh.castShadow)shadowCasterPoints.push(p);
          if(isSite&&mesh.receiveShadow)shadowReceiverPoints.push(p);
        }
      });
    };
    collect(buildingGroup,false);collect(designGroup,true);
    // Instanced canopies have measured envelopes. Include their actual extent
    // in the sun's depth range without expanding the plot receiver footprint.
    if(currentSettings.existingVegetation!==false)for(const canopy of existingCanopyRecords(data)){
      const radius=Math.max(canopy.radiusX,canopy.radiusY);
      for(const x of [canopy.x-radius,canopy.x+radius])for(const y of [canopy.y-radius,canopy.y+radius])for(const z of [canopy.baseZ,canopy.topZ])shadowCasterPoints.push(point(x,y,z));
    }
    // Before the first design update, retain a valid plot-sized lighting region.
    if(!shadowReceiverPoints.length)for(const p of data.site.boundary)shadowReceiverPoints.push(point(p[0],p[1],terrainAt(...p,data)));
    shadowBoundsDirty=false;shadowCameraDirty=true;
  }

  function updateSunGuide(solar,settings,enabled,daylight,centre,radius) {
    sunGuideGroup.visible=enabled&&settings.sunPathVisible===true;
    sunMarker.visible=daylight;
    if(!sunGuideGroup.visible)return;
    const signature=`${solar.date||settings.sunDate}:${centre.join(':')}:${radius}`;
    const domePoint=direction=>point(centre[0]+direction[0]*radius,centre[1]+direction[1]*radius,centre[2]+direction[2]*radius);
    if(previousSunPath!==solar.path||signature!==sunPathSignature){
      previousSunPath=solar.path;sunPathSignature=signature;removeGeometry(sunPathGroup);
      // A thin reference horizon and the above-horizon portion of today's path.
      // The dome is a direction guide, never a shade caster or an opaque canopy.
      const horizon=[];
      for(let i=0;i<=72;i++){const a=i*Math.PI*2/72;horizon.push([centre[0]+Math.cos(a)*radius,centre[1]+Math.sin(a)*radius,centre[2]]);}
      const horizonGuide=line(sunPathGroup,horizon,'#bdad76',.24);
      Object.assign(horizonGuide.material,{depthTest:false,depthWrite:false,fog:false,toneMapped:false});horizonGuide.renderOrder=1000;
      const vertices=[],path=solar.path||[];
      for(let i=1;i<path.length;i++){
        let a=path[i-1].direction,b=path[i].direction;
        if(!a||!b||(a[2]<=0&&b[2]<=0))continue;
        if(a[2]<0||b[2]<0){
          const t=a[2]/(a[2]-b[2]),crossing=a.map((v,j)=>v+(b[j]-v)*t),length=Math.hypot(...crossing);
          const horizonDirection=crossing.map(v=>v/length);
          if(a[2]<0)a=horizonDirection;else b=horizonDirection;
        }
        vertices.push(domePoint(a),domePoint(b));
      }
      if(vertices.length){
        const material=new THREE.LineBasicMaterial({color:'#e4b857',transparent:true,opacity:.8,depthTest:false,depthWrite:false,fog:false,toneMapped:false});material.userData.transient=true;
        const pathGuide=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(vertices),material);pathGuide.renderOrder=1001;sunPathGroup.add(pathGuide);
      }
    }
    if(daylight){sunMarker.position.copy(domePoint(solar.direction));sunMarker.material.color.copy(sun.color);}
  }

  function applyNightLighting(solar,settings=currentSettings){
    const night=nightLightingState(solar,settings);
    const changed=gardenNight?.apply(night);
    sharedHouseModel?.updateLighting?.(night.gardenStrength);
    jacuzziEffects?.update(waveTime,night.gardenStrength,motionActive());
    if(changed&&renderer.shadowMap)renderer.shadowMap.needsUpdate=true;
    if(nightWindowMesh){
      const signature=String(night.windowActivity);
      if(signature!==nightWindowSignature){
        nightWindowSignature=signature;
        if(svgMode){
          nightWindowMesh.geometry.dispose();nightWindowMesh.geometry=geometryFromTriangles(windowQuadTriangles(nightWindowPlacements.filter(p=>isWindowLit(p,night.windowActivity)),false,.052));
        }else{
          const dummy=new THREE.Object3D();
          nightWindowPlacements.forEach((p,i)=>{
            dummy.position.copy(point(p.x+p.nx*.052,p.y+p.ny*.052,p.z));dummy.rotation.set(0,p.angle,0);
            dummy.scale.set(p.width,isWindowLit(p,night.windowActivity)?p.height:0,1);dummy.updateMatrix();nightWindowMesh.setMatrixAt(i,dummy.matrix);
          });
          nightWindowMesh.instanceMatrix.needsUpdate=true;
        }
      }
      nightWindowMesh.visible=night.windowStrength>.001&&night.windowActivity>0;
      mat.nightWindow.opacity=Math.min(.98,night.windowStrength*1.35);
    }
    // Shared spa finish materials participate in the same garden-light switch.
    // No permanent daytime emissive glow or lit pool remains when switched off.
    mat.spaGlow.emissiveIntensity=night.gardenStrength*1.6;
    mat.fireGlow.emissiveIntensity=night.gardenStrength*2.0;
    mat.water.emissive.set('#278a83');mat.water.emissiveIntensity=night.gardenStrength*.14;
    mat.waterLight.emissive.set('#3baca0');mat.waterLight.emissiveIntensity=night.gardenStrength*.17;
    return night;
  }

  function updateSun(solar,settings=currentSettings) {
    currentSettings={...currentSettings,...settings};
    const direction=solar?.direction;
    const enabled=settings.sunEnabled!==false&&solar?.enabled!==false&&Array.isArray(direction)&&direction.length===3&&direction.every(Number.isFinite)&&Math.hypot(...direction)>0;
    lastSolar={...solar,enabled};
    const daylight=enabled&&solar.isDaylight===true&&direction[2]>0;
    const c=centroid(data.site.boundary),centre=[c[0],c[1],gardenGroundAt(c[0],c[1],settings,data)+.1];
    const path=settings.sunPathVisible&&enabled?solar.path:null;
    const signature=[enabled,daylight,solar?.elevation,solar?.date,settings.sunPathVisible,
      ...(Array.isArray(direction)?direction:[]),...centre,...Object.values(nightLightingState(lastSolar,settings))].join(',');
    if(signature===solarSignature&&guidePath===path)return {enabled,isDaylight:daylight,rendererType};
    solarSignature=signature;guidePath=path;
    const twilight=enabled?THREE.MathUtils.smoothstep(num(solar.elevation),-6,6):1;
    if(!enabled){
      ambient.color.set('#e3edff');ambient.groundColor.set('#8b8975');ambient.intensity=svgMode?2.25:.62;
      if(svgAmbient){svgAmbient.color.set('#ffffff');svgAmbient.intensity=.88;}
      sun.color.set('#fff2d4');sun.intensity=svgMode?.72:3.1;sun.castShadow=!svgMode;
      sun.target.position.copy(point(...centre));sun.position.copy(sun.target.position).addScaledVector(point(-40,-20,67).normalize(),lightDistance);
      scene.background.set('#dfe8e8');renderer.toneMappingExposure=1.05;
    }else{
      // The ephemeris vector points FROM the plot TO the sun. In Three.js the
      // site's vertical component is Y, and garden depth becomes positive Z.
      const towardSun=point(...direction).normalize();
      sun.target.position.copy(point(...centre));sun.position.copy(sun.target.position).addScaledVector(towardSun,lightDistance);
      sun.castShadow=daylight&&!svgMode;
      const strength=Math.pow(Math.max(0,direction[2]),.4);
      const warmth=THREE.MathUtils.clamp(num(solar.elevation)/35,0,1);
      sun.color.set('#ffc18a').lerp(new THREE.Color('#fff3db'),warmth);
      sun.intensity=daylight?(svgMode?.8:3.3)*strength:0;
      ambient.color.set('#8fa5c0').lerp(new THREE.Color('#f1f2ec'),twilight);
      ambient.groundColor.set('#48585d').lerp(new THREE.Color('#778575'),twilight);
      ambient.intensity=svgMode?THREE.MathUtils.lerp(.52,1.25+.8*strength,twilight):
        THREE.MathUtils.lerp(.16,.38+.3*strength,twilight);
      if(svgAmbient){
        // r160 SVGRenderer reads the ambient colour directly.
        svgAmbient.intensity=THREE.MathUtils.lerp(.32,.78,twilight);
        svgAmbient.color.set('#91a9c5').lerp(new THREE.Color('#edf1ee'),twilight).multiplyScalar(svgAmbient.intensity);
      }
      const dayHorizon=new THREE.Color('#e7d6c0').lerp(new THREE.Color('#dce8eb'),warmth);
      scene.background.set('#182833').lerp(dayHorizon,twilight);
      renderer.toneMappingExposure=THREE.MathUtils.lerp(1.02,1.05,twilight);
    }
    if(sky){
      sky.material.uniforms.sunDirection.value.copy(sun.position).sub(sun.target.position).normalize();
      sky.material.uniforms.daylight.value=twilight;
      sky.material.uniforms.warmth.value=enabled?1-THREE.MathUtils.smoothstep(num(solar.elevation),0,22):0;
    }
    scene.fog.color.copy(scene.background);
    // The r160 environment intensity lives on each standard material. Scale the
    // one prefiltered sky continuously through twilight, including wet surfaces
    // and new style materials. Replacing the environment would switch shaders.
    skyRadiance=THREE.MathUtils.lerp(.025,1,twilight);
    for(const material of reflectiveMaterials)material.envMapIntensity=material.userData.nominalEnvIntensity*skyRadiance;
    applyNightLighting(lastSolar,settings);
    updateSunGuide(solar,settings,enabled,daylight,centre,18);
    const sunPose=[sun.castShadow,...sun.position.toArray(),...sun.target.position.toArray()].join(',');
    if(sunPose!==lastSunPose){shadowCameraDirty=true;lastSunPose=sunPose;}
    requestRender();
    return {enabled,isDaylight:daylight,rendererType};
  }

  function rebuildObserver(observer,analysis,settings) {
    removeGeometry(markerGroup);removeGeometry(rayGroup);
    if(!observer)return;
    const ground=num(observer.groundZ,gardenGroundAt(observer.x,observer.y,settings,data));
    const eye=new THREE.Mesh(new THREE.SphereGeometry(.13,svgMode?6:12,svgMode?4:8),mat.gold);
    eye.position.copy(point(observer.x,observer.y,observer.z));markerGroup.add(eye);
    line(markerGroup,[[observer.x,observer.y,ground+.03],[observer.x,observer.y,observer.z]],'#d4a64e');
    const disc=new THREE.Mesh(new THREE.RingGeometry(.24,.36,32),mat.gold);
    disc.rotation.x=-Math.PI/2;disc.position.copy(point(observer.x,observer.y,ground+.045));markerGroup.add(disc);
    markerGroup.visible=mode!=='eye';
    if(settings.showRays&&analysis?.rays?.length){
      const sample=analysis.rays.filter((_,i)=>i%Math.max(1,Math.ceil(analysis.rays.length/70))===0);
      if(analysis.criticalRay&&!sample.includes(analysis.criticalRay))sample.push(analysis.criticalRay);
      for(const ray of sample){
        const target=xyz(ray.target);
        if(target.length<3)continue;
        const end=!ray.visible&&ray.obstruction?[ray.obstruction.x,ray.obstruction.y,ray.obstruction.z]:target;
        const isCritical=ray===analysis.criticalRay;
        line(rayGroup,[[observer.x,observer.y,observer.z],end],isCritical?'#b58a3a':ray.visible?'#bc684b':'#517e60',isCritical?.85:ray.visible?.55:.38);
      }
    }
  }

  function renderLabels() {
    const projected=new THREE.Vector3(),direction=new THREE.Vector3(),cameraForward=new THREE.Vector3();camera.getWorldDirection(cameraForward);
    for(const l of labels){
      projected.copy(l.position).project(camera);
      direction.copy(l.position).sub(camera.position);
      const hidden=currentSettings.showLabels===false||mode==='eye'||projected.z>1||projected.z< -1||direction.dot(cameraForward)<0||Math.abs(projected.x)>1.2||Math.abs(projected.y)>1.2;
      l.element.hidden=hidden;
      if(!hidden){l.element.style.left=`${(projected.x*.5+.5)*lastWidth}px`;l.element.style.top=`${(-projected.y*.5+.5)*lastHeight}px`;}
    }
  }

  function canDraw() {
    return !disposed && presentationVisible && intersecting && !document.hidden;
  }
  function motionActive() {
    return Boolean(motion && !svgMode && !reducedMotion.matches && mode!=='plan' && canDraw());
  }
  const firstPerson=()=>mode==='eye'||mode==='walk';
  function notifyWalk(force=false){
    if(!walkPose)return;
    const now=performance.now();if(!force&&now-lastWalkNotice<160)return;lastWalkNotice=now;
    const room=walkModel?.plans[walkPose.floor]?.rooms.find(r=>r.id===walkPose.roomId);
    renderer.domElement.dataset.walkFloor=walkPose.floor||'garden';
    renderer.domElement.dataset.walkPosition=walkPose.position.map(v=>v.toFixed(3)).join(',');
    callbacks.onWalkState?.({...walkPose,roomName:room?.name||room?.label||null});
  }
  function applyWalkPose(pose){
    if(!pose)return false;walkPose=pose;
    if(pose.direction){
      const d=pose.direction,l=Math.hypot(...d)||1;
      eyeYaw=Math.atan2(-d[0],d[2])*180/Math.PI;eyePitch=Math.asin(Math.max(-1,Math.min(1,d[1]/l)))*180/Math.PI;
    }
    camera.position.fromArray(pose.position);
    camera.lookAt(camera.position.clone().add(point(...gazeDirection(eyeYaw,eyePitch))));
    notifyWalk(true);requestRender();return true;
  }
  function startWalk({floor,roomId,position}={}){
    walkModel??=createWalkNavigation(data,currentSettings);
    const preferred=position||currentObserver&&toWorld(currentObserver.x,currentObserver.y,currentObserver.z);
    const pose=floor&&floor!=='garden'?walkModel.spawnFloor(floor,roomId):walkModel.spawnGarden(preferred);
    if(!pose)return false;
    mode='walk';walkKeys.clear();lastWalkTime=0;controls.enabled=false;markerGroup.visible=false;walkPad.hidden=false;
    camera.fov=65;camera.near=.035;camera.up.set(0,1,0);camera.updateProjectionMatrix();
    renderer.domElement.setAttribute('aria-label','Walk through the house and garden. Use WASD or arrow keys to move; drag to look.');
    applyWalkPose(pose);renderer.domElement.focus({preventScroll:true});return true;
  }
  function stepWalk(right,forward,distance){
    if(mode!=='walk'||!walkModel||!walkPose||!(distance>0))return;
    const norm=Math.hypot(right,forward);if(!norm)return;
    const yaw=eyeYaw*Math.PI/180;
    const delta=[(-Math.sin(yaw)*forward-Math.cos(yaw)*right)/norm*distance,0,
      (Math.cos(yaw)*forward-Math.sin(yaw)*right)/norm*distance];
    walkPose=walkModel.move(walkPose.position,delta,{eyeHeight:walkPose.eyeHeight});
    camera.position.fromArray(walkPose.position);
    camera.lookAt(camera.position.clone().add(point(...gazeDirection(eyeYaw,eyePitch))));
    cameraInteraction();notifyWalk();
  }
  function getPerformanceInfo(){
    const render=presentation?.sceneInfo||renderer.info?.render, memory=renderer.info?.memory;
    const renovation=houseGroup.getObjectByName('house-renovation')?.userData;
    const openings=(sharedHouseModel?.layout||houseGroup.userData.facadeSummary)?.windows||[];
    const garden=finishesGroup.getObjectByName('renovation-garden-details')?.userData;
    return {rendererType,quality,interacting,pixelRatio:svgMode?1:lastPixelRatio,
      drawEnabled:canDraw(),canvasIntersecting:intersecting,presentationVisible,renderPending,
      bufferWidth:svgMode?lastWidth:renderer.domElement.width,
      bufferHeight:svgMode?lastHeight:renderer.domElement.height,
      shadowSize:svgMode?0:sun.shadow.mapSize.x,frames:frameCount,shadowUpdates,renderedStyle,
      calls:render?.calls??null,triangles:render?.triangles??null,
      houseRenovationParts:renovation?.partCount??0,
      houseRenovationProjection:renovation?.maxProjectionM??0,
      houseOpeningCount:openings.length,
      windowPattern:openings.map(w=>[w.id,Number((w.hi-w.lo).toFixed(3)),Number(w.height.toFixed(3)),w.panes||1,w.transoms||0].join(':')).join('|'),
      gardenScheme:garden?.scheme||null,gardenKitchens:garden?.kitchen?1:0,gardenPlantingBeds:garden?.beds||0,
      garageVehicles:garageScene?.group.children.filter(child=>child.visible&&child.userData.vehicle).length??0,
      contextFacades:contextDetails?.facades||{},contextBalconies:contextDetails?.balconies||{},contextEnvelopes:contextDetails?.envelopes||{},
      geometries:memory?.geometries??null,textures:memory?.textures??null,motionActive:motionActive(),
      walk:mode==='walk'?{...walkPose,...walkModel?.getDiagnostics()}:null,
      ...presentation?.getDiagnostics(),...reflections?.getDiagnostics(),surfaceAssets:surfaceAssetDiagnostics()};
  }
  function renderNow(now) {
    renderPending=false;frameHandle=0;if(!canDraw())return;
    const walking=mode==='walk'&&walkKeys.size>0;
    if(walking){
      const dt=lastWalkTime?Math.min(.06,(now-lastWalkTime)/1000):1/60;
      stepWalk(Number(walkKeys.has('right'))-Number(walkKeys.has('left')),Number(walkKeys.has('forward'))-Number(walkKeys.has('back')),dt*(walkFast?2.7:1.65));
    }
    lastWalkTime=walking?now:0;
    if(!svgMode&&shadowBoundsDirty){
      refreshShadowBounds();renderer.shadowMap.needsUpdate=true;
    }
    if(sun.castShadow&&shadowCameraDirty){
      fitSunShadowCamera(sun,shadowReceiverPoints,shadowCasterPoints);
      if(renderer.shadowMap)renderer.shadowMap.needsUpdate=true;
      shadowCameraDirty=false;shadowUpdates++;
    }
    const animate=motionActive();
    if(animate){
      if(lastMotionTime)waveTime+=Math.min(.12,(now-lastMotionTime)/1000);
      lastMotionTime=now;
      textures.waterNormal.offset.set((waveTime*.033)%1,(waveTime*.017)%1);
    }else lastMotionTime=0;
    jacuzziEffects?.update(waveTime,nightLightingState(lastSolar,currentSettings).gardenStrength,animate);
    if(sky)sky.position.copy(camera.position);
    reflections?.render({quality,width:lastWidth,height:lastHeight,interacting,visible:canDraw(),revision:contextRevision+':'+solarSignature});
    if(presentation)presentation.render();else renderer.render(scene,camera);
    // A rebuild or visibility callback alone does not replace the visible frame.
    renderedStyle=finishSignature||null;frameCount++;
    renderLabels();dimensionOverlay.render(camera,lastWidth,lastHeight,mode);
    if(statusChanged||now-lastInfoTime>=1000){
      lastInfoTime=now;statusChanged=false;callbacks.onPerformanceInfo?.(getPerformanceInfo());
    }
    if(animate&&!motionTimer)motionTimer=setTimeout(()=>{
      motionTimer=0;if(motionActive())requestRender();
    },1000/motionFps);
    if(walking)requestRender();
  }
  function requestRender() {
    if(!renderPending&&canDraw()){renderPending=true;frameHandle=requestAnimationFrame(renderNow);}
  }
  function visibilityChanged(){
    clearTimeout(motionTimer);motionTimer=0;lastMotionTime=0;statusChanged=true;
    if(canDraw())requestRender();
    else {
      walkKeys.clear();lastWalkTime=0;
      cancelAnimationFrame(frameHandle);frameHandle=0;renderPending=false;
      callbacks.onPerformanceInfo?.(getPerformanceInfo());
    }
  }
  function setPresentationVisible(visible){
    if(presentationVisible===Boolean(visible))return;
    presentationVisible=Boolean(visible);visibilityChanged();
    if(presentationVisible)resize();
  }
  function setPresentation(options={}){
    const nextQuality=['auto','high','eco'].includes(options.quality)?options.quality:quality;
    const nextMotion=options.motion===undefined?motion:options.motion===true;
    if(nextQuality===quality&&nextMotion===motion)return;
    quality=nextQuality;motion=nextMotion;
    if(!motion){waveTime=0;textures?.waterNormal.offset.set(0,0);}
    resize();visibilityChanged();
  }
  function cameraInteraction(){
    if(!svgMode&&canDraw()){
      if(!interacting){interacting=true;statusChanged=true;resize();}
      clearTimeout(interactionTimer);
      interactionTimer=setTimeout(()=>{interacting=false;statusChanged=true;resize();requestRender();},180);
    }
    requestRender();
  }
  controls.addEventListener('change',cameraInteraction);
  controls.addEventListener('start',cameraInteraction);
  controls.addEventListener('end',cameraInteraction);

  function orientEye() {
    if(mode==='walk'&&walkPose){camera.position.fromArray(walkPose.position);camera.lookAt(camera.position.clone().add(point(...gazeDirection(eyeYaw,eyePitch))));requestRender();return;}
    if(!currentObserver)return;
    camera.position.copy(point(currentObserver.x,currentObserver.y,currentObserver.z));
    const target=camera.position.clone().add(point(...gazeDirection(eyeYaw,eyePitch)));
    camera.lookAt(target);requestRender();
  }

  function setView(nextMode,observer=currentObserver,settings=currentSettings) {
    const previous=mode;mode=['orbit','eye','walk','plan'].includes(nextMode)?nextMode:'orbit';
    currentObserver=observer||currentObserver;currentSettings=settings||currentSettings;
    walkKeys.clear();lastWalkTime=0;walkPad.hidden=mode!=='walk';
    controls.enabled=!firstPerson();controls.enableRotate=mode==='orbit';controls.enablePan=!firstPerson();
    markerGroup.visible=!firstPerson();camera.up.set(0,1,0);
    if(mode==='walk'){
      if(previous==='walk'&&walkPose){orientEye();return;}
      eyeYaw=num(settings.lookYaw);eyePitch=num(settings.lookPitch);
      startWalk();return;
    }
    if(mode==='eye'){
      eyeFov=num(settings.fov,eyeFov);camera.fov=eyeFov;camera.near=.04;
      if(previous!=='eye'){eyeYaw=num(settings.lookYaw);eyePitch=num(settings.lookPitch);}
      orientEye();
    }else if(mode==='plan'){
      // The tiny rearward bias resolves the vertical lookAt singularity with
      // street at top and increasing site x at screen right, matching the map.
      const cx=plotCentre[0],cy=(data.site.rearMidpoint[1]+plot.maxY)/2,z=data.site.floorReference.z;
      camera.fov=36;camera.near=.1;camera.position.copy(point(cx,cy+.001,z+Math.max(plot.maxY-plot.minY,plot.maxX-plot.minX)*2.1));controls.target.copy(point(cx,cy,z));camera.lookAt(controls.target);controls.minDistance=15;controls.maxPolarAngle=.001;controls.minPolarAngle=.0001;controls.update();
    }else{
      const cy=data.site.rearMidpoint[1]+(plot.maxY-data.site.rearMidpoint[1])*.3,cx=plotCentre[0],span=plot.maxY-plot.minY,z=data.site.floorReference.z;
      camera.fov=48;camera.near=.1;camera.position.copy(point(cx+span*.5,cy+span*.6,z+span*.8));controls.target.copy(point(cx,cy,z+1.5));controls.minDistance=3;controls.minPolarAngle=.08;controls.maxPolarAngle=Math.PI*.49;camera.lookAt(controls.target);controls.update();
    }
    camera.updateProjectionMatrix();requestRender();
  }

  /** Dedicated front view leaves the normal garden orbit and saved eye presets
   * intact. The camera stays on the street side of the proposed entrance. */
  function setGarageView(){
    if(!currentGarageLayout?.enabled)return false;
    setView('orbit');
    const {axis,streetZ}=currentGarageLayout;
    const at=(s,l,z)=>point(axis.start[0]+axis.direction[0]*s+axis.normal[0]*l,axis.start[1]+axis.direction[1]*s+axis.normal[1]*l,z);
    camera.position.copy(at(-6,6,streetZ+11));controls.target.copy(at(axis.frontRun*.65,0,streetZ-.15));
    camera.fov=45;camera.lookAt(controls.target);camera.updateProjectionMatrix();controls.update();requestRender();return true;
  }

  /** A fixed architectural comparison view, independent of the privacy eye.
   * Changing the design does not reset this camera or the selected daylight. */
  function setDesignInspection(kind='house'){
    setView('orbit');
    if(kind==='garden'){callbacks.onPerformanceInfo?.(getPerformanceInfo());return true;}
    const bounds=boundsOf(data.site.house.footprint),width=bounds.maxX-bounds.minX,depth=bounds.maxY-bounds.minY;
    const floor=data.site.floorReference.z+num(currentSettings.floorHeight,1.7);
    const cx=(bounds.minX+bounds.maxX)/2;
    camera.position.copy(point(Math.max(plot.minX+1.2,bounds.minX-width*.48),bounds.maxY+depth*1.25,floor+Math.max(width,depth)*.82));
    controls.target.copy(point(cx,bounds.maxY-depth*.3,floor+3.25));
    camera.fov=44;camera.lookAt(controls.target);camera.updateProjectionMatrix();controls.update();requestRender();
    callbacks.onPerformanceInfo?.(getPerformanceInfo());return true;
  }

  /** Scrubbing the car moves one rigid group, without rebuilding the garden or
   * rerunning the full clearance sweep. The shared model supplies its pose. */
  function updateGaragePreview(settings=currentSettings){
    currentSettings={...currentSettings,garageProgress:settings.garageProgress,garageReverse:settings.garageReverse};
    if(!currentGarageLayout?.enabled||!garageScene)return;
    const progress=Math.max(0,Math.min(1,num(settings.garageProgress,40)/100));
    const nextPose=progress+':'+(settings.garageReverse===true);
    if(nextPose===lastVehiclePose)return;
    lastVehiclePose=nextPose;
    garageScene.setVehiclePose(garageVehiclePose(currentGarageLayout,progress,settings.garageReverse===true));
    contextRevision++;
    shadowBoundsDirty=true;requestRender();
  }

  function update(settings,observer,analysis,activeData=data) {
    if(activeData!==data){
      data=activeData;
      gardenLightBoundary?.setBoundary(data.site.boundary);
      rebuildContextBuildings();
      // Optional high roof returns are part of the design group and must move
      // with their building as well. The camera and terrain renderer persist.
      designSignature='';
    }
    currentSettings={...settings};currentObserver=observer;currentAnalysis=analysis;
    syncExistingVegetation(settings);
    const signature=JSON.stringify([...['summerPoolLayout','poolSunbedSides','jacuzziCentered','jacuzziMood','hstOpen','gardenProgram','designStyle','styleGardenLayout','poolFreeboard','hedgeRear','hedgeLeft','hedgeRight','hedgeFront','hedgeFullPerimeter','hedgeInset','gardenRaise','bedRaise','raiseNewHedges','floorHeight','removeGarage','canopyEnabled','terraceCoverType','firstFloorRise','atticRise','interiorLayout','jacuzziOverflow','canopyDepth','canopyHeight','canopyWidth','fasciaDepth','terraceDepth','terraceWidth','planExteriorApplied','costSpacing','includeHighFeatures','screeningTrees','treeLeafMode',...PRIVACY_GEOMETRY_KEYS,
      'basementGarageEnabled','garageClearHeight','garageSlabThickness','garageExtraDepth','garageSpaces','garageRampWidth','garageInsideRun','garageBottomApron','garageMaxGrade','garageClearanceMm','garageReserveMm'].map(k=>settings[k]), settings.sunDate?.slice(5,7)]);
    const rebuilt=signature!==designSignature;
    if(rebuilt){designSignature=signature;rebuildDesign(settings);}
    else updateGaragePreview(settings);
    const style=getDesignStyle(settings.designStyle);
    const nextHouseFinish=settings.styleHouseFinish===true?style.id:'current';
    const houseChanged=rebuilt||houseFinishSignature!==nextHouseFinish;
    const finishesChanged=rebuilt||finishSignature!==style.id||houseChanged;
    if(finishesChanged){
      statusChanged=true;
      rebuildFinishes(settings,style,houseChanged);
      finishSignature=style.id;houseFinishSignature=nextHouseFinish;
    }
    if(!walkModel||finishesChanged){
      walkModel=createWalkNavigation(data,settings);
      if(mode==='walk'&&walkPose){
        const retained=walkModel.locate(walkPose.position,{eyeHeight:walkPose.eyeHeight,maxDistance:.30});
        applyWalkPose(retained||walkModel.spawnFloor(walkPose.floor,walkPose.roomId)||walkModel.spawnGarden(walkPose.position));
      }
    }
    if(finishesChanged&&!svgMode){projectArchitecturalMaterialUVs(scene);reflections?.setSurface(scene.getObjectByName('pool-water'));}
    if(finishesChanged||dimensionsVisible!==settings.showDimensions){
      dimensionsVisible=settings.showDimensions;
      dimensionOverlay.update(gardenDimensions(settings,data));
    }
    const nextObserverSignature=observer?`${observer.x}:${observer.y}:${observer.z}`:'';
    rebuildObserver(observer,analysis,settings);
    // Includes static streets/buildings, instanced foliage, water and any new
    // transient materials introduced by this design or observer rebuild.
    if(!finishesChanged)gardenLightBoundary?.install(markerGroup);
    if(finishesChanged&&!svgMode){
      gardenLightBoundary.install(scene);
      const found=new Set();
      scene.traverse(object=>{
        for(const m of Array.isArray(object.material)?object.material:[object.material]){
          if(m?.isMeshStandardMaterial){
            m.userData.nominalEnvIntensity??=m.envMapIntensity;
            found.add(m);
          }
        }
      });
      reflectiveMaterials=[...found];
      for(const material of reflectiveMaterials)material.envMapIntensity=material.userData.nominalEnvIntensity*skyRadiance;
    }
    if(mode==='eye'){
      if(settings.lookYaw!==storedYaw||settings.lookPitch!==storedPitch||nextObserverSignature!==observerSignature){eyeYaw=num(settings.lookYaw);eyePitch=num(settings.lookPitch);}
      storedYaw=settings.lookYaw;storedPitch=settings.lookPitch;
      eyeFov=num(settings.fov,eyeFov);camera.fov=eyeFov;camera.updateProjectionMatrix();orientEye();
    }
    observerSignature=nextObserverSignature;
    applyNightLighting(lastSolar,settings);
    for(const l of labels){
      if(l.kind!=='target')continue;
      const result=analysis?.byBlock?.find(b=>b.id===l.id);
      if(result)l.element.style.borderColor=result.visible?'rgba(157,92,63,.3)':'rgba(61,110,78,.32)';
    }
    requestRender();
  }

  function resize() {
    if(disposed||!presentationVisible)return;
    const bounds=container.getBoundingClientRect();
    if(bounds.width<1||bounds.height<1)return;
    const width=Math.round(bounds.width),height=Math.round(bounds.height);
    const budget=renderBudget(quality,width,height,window.devicePixelRatio,{
      memoryGB:globalThis.navigator?.deviceMemory,maxTextureSize:renderer.capabilities?.maxTextureSize,interacting
    });
    motionFps=budget.motionFps;
    if(!svgMode&&sun.shadow.mapSize.x!==budget.shadowSize){
      // r160 only allocates a new shadow target when the old one is null.
      sun.shadow.map?.dispose();sun.shadow.map=null;
      sun.shadow.mapSize.set(budget.shadowSize,budget.shadowSize);shadowCameraDirty=true;
    }
    const ratio=svgMode?1:budget.pixelRatio;
    presentation?.resize(width,height,ratio,quality,{memoryGB:globalThis.navigator?.deviceMemory,interacting});
    if(width===lastWidth&&height===lastHeight&&ratio===lastPixelRatio)return;
    lastWidth=width;lastHeight=height;lastPixelRatio=ratio;statusChanged=true;
    if(svgMode)renderer.setSize(width,height);
    else renderer.setDrawingBufferSize(width,height,ratio);
    camera.aspect=width/height;camera.updateProjectionMatrix();requestRender();
  }

  let pointerStart=null,pointerLast=null,dragged=false,pinchDistance=0,pinchFov=65;
  const eyePointers=new Map();
  function pointerDown(event){
    if(event.button!==0&&event.pointerType!=='touch')return;
    if(firstPerson())renderer.domElement.focus({preventScroll:true});
    if(firstPerson()){
      eyePointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
      renderer.domElement.setPointerCapture(event.pointerId);
      if(eyePointers.size>=2){const p=[...eyePointers.values()];pinchDistance=Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y);pinchFov=eyeFov;dragged=true;return;}
    }
    pointerStart={x:event.clientX,y:event.clientY,id:event.pointerId};pointerLast={x:event.clientX,y:event.clientY};dragged=false;
  }
  function pointerMove(event){
    if(pointerStart||eyePointers.size)cameraInteraction();
    if(firstPerson()&&eyePointers.has(event.pointerId)){
      eyePointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if(eyePointers.size>=2){
        const p=[...eyePointers.values()],distance=Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y);
        if(distance>0&&pinchDistance>0){eyeFov=Math.max(35,Math.min(95,pinchFov*pinchDistance/distance));camera.fov=eyeFov;camera.updateProjectionMatrix();requestRender();}
        dragged=true;return;
      }
    }
    if(!pointerStart||event.pointerId!==pointerStart.id)return;
    if(Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)>5)dragged=true;
    if(firstPerson()&&pointerLast){
      eyeYaw-=(event.clientX-pointerLast.x)*.13;eyePitch=Math.max(-65,Math.min(65,eyePitch+(event.clientY-pointerLast.y)*.13));
      pointerLast={x:event.clientX,y:event.clientY};orientEye();
    }
  }
  function pointerUp(event){
    if(eyePointers.has(event.pointerId)){
      eyePointers.delete(event.pointerId);pinchDistance=0;
      if(eyePointers.size){const [id,p]=eyePointers.entries().next().value;pointerStart={...p,id};pointerLast={...p};dragged=true;return;}
    }
    if(!pointerStart||event.pointerId!==pointerStart.id)return;
    if(mode==='plan'&&!dragged&&callbacks.onPick){
      const rect=renderer.domElement.getBoundingClientRect(),cursor=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),raycaster=new THREE.Raycaster();
      raycaster.setFromCamera(cursor,camera);
      const hit=raycaster.intersectObjects(terrainMeshes,false)[0];
      if(hit){const [x,y]=fromWorld(hit.point.x,hit.point.y,hit.point.z),p={x,y};if(contains(p.x,p.y,data.site.boundary))callbacks.onPick(p);}
    }
    if(firstPerson()&&dragged)callbacks.onCameraChange?.({lookYaw:eyeYaw,lookPitch:eyePitch});
    pointerStart=null;pointerLast=null;
  }
  function keyDown(event){
    if(mode==='walk'){
      if(event.code==='ShiftLeft'||event.code==='ShiftRight'){walkFast=true;return;}
      const direction=keyDirections.get(event.code);
      if(direction){event.preventDefault();walkKeys.add(direction);requestRender();return;}
      if(event.key==='Escape'){event.preventDefault();walkKeys.clear();callbacks.onExitWalk?.();return;}
      return;
    }
    if(mode!=='eye')return;
    const amount=event.shiftKey?8:3;
    if(event.key==='ArrowLeft')eyeYaw-=amount;else if(event.key==='ArrowRight')eyeYaw+=amount;else if(event.key==='ArrowUp')eyePitch=Math.min(65,eyePitch+amount);else if(event.key==='ArrowDown')eyePitch=Math.max(-65,eyePitch-amount);else return;
    event.preventDefault();orientEye();callbacks.onCameraChange?.({lookYaw:eyeYaw,lookPitch:eyePitch});
  }
  function keyUp(event){
    const direction=keyDirections.get(event.code);if(direction)walkKeys.delete(direction);
    if(event.code==='ShiftLeft'||event.code==='ShiftRight')walkFast=false;
    if(mode==='walk'&&!walkKeys.size){lastWalkTime=0;notifyWalk(true);}
  }
  function stopWalking(){walkKeys.clear();lastWalkTime=0;walkFast=false;}
  function wheel(event){
    if(!firstPerson())return;
    event.preventDefault();cameraInteraction();eyeFov=Math.max(35,Math.min(95,eyeFov+event.deltaY*.02));camera.fov=eyeFov;camera.updateProjectionMatrix();requestRender();
  }
  renderer.domElement.addEventListener('pointerdown',pointerDown);
  renderer.domElement.addEventListener('pointermove',pointerMove);
  renderer.domElement.addEventListener('pointerup',pointerUp);
  renderer.domElement.addEventListener('pointercancel',pointerUp);
  renderer.domElement.addEventListener('keydown',keyDown);
  window.addEventListener('keyup',keyUp);
  window.addEventListener('blur',stopWalking);
  renderer.domElement.addEventListener('blur',stopWalking);
  renderer.domElement.addEventListener('wheel',wheel,{passive:false});
  document.addEventListener('visibilitychange',visibilityChanged);
  reducedMotion.addEventListener('change',visibilityChanged);
  const visibilityObserver=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
    const entry=latestIntersectionEntry(entries,container);
    if(entry&&intersecting!==entry.isIntersecting){intersecting=entry.isIntersecting;visibilityChanged();}
  }):null;
  visibilityObserver?.observe(container);
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(container);
  setView('orbit');resize();

  function dispose(){
    if(disposed)return;disposed=true;unsubscribeSurfaceAssets();resizeObserver.disconnect();visibilityObserver?.disconnect();controls.dispose();
    cancelAnimationFrame(frameHandle);clearTimeout(motionTimer);clearTimeout(interactionTimer);
    document.removeEventListener('visibilitychange',visibilityChanged);
    reducedMotion.removeEventListener('change',visibilityChanged);
    window.removeEventListener('keyup',keyUp);window.removeEventListener('blur',stopWalking);renderer.domElement.removeEventListener('blur',stopWalking);walkPad.remove();
    dimensionOverlay.dispose();sharedHouseModel?.dispose();sharedHouseModel=null;
    renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointermove',pointerMove);renderer.domElement.removeEventListener('pointerup',pointerUp);renderer.domElement.removeEventListener('pointercancel',pointerUp);renderer.domElement.removeEventListener('keydown',keyDown);renderer.domElement.removeEventListener('wheel',wheel);
    const geometries=new Set(),materials=new Set([...Object.values(mat),...Object.values(designMaterials)]);
    scene.traverse(o=>{
      if(o.geometry)geometries.add(o.geometry);
      if(o.isInstancedMesh)o.dispose();
      if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);
    });
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
    gardenNight?.dispose();textures?.dispose();sun.shadow.dispose();presentation?.dispose();reflections?.dispose();
    renderer.dispose?.();renderer.domElement.remove();labelLayer.remove();
  }
  function createInteriorContext(floor,view='room'){
    const frame=houseModelFrame(data,currentSettings);if(!frame)return null;
    let owned;
    if(view==='room'){
      owned=cloneOwnedScene([staticGroup,buildingGroup,existingVegetationGroup,designGroup],o=>o.userData.houseFloor!==floor&&!(floor==='attic'&&o.userData.houseRoof));
    }else{
      // Cutaways show only the outdoor space belonging to this storey. Clone
      // the finished site objects, including their actual materials and tub
      // opening; an overhead balcony would hide the ground terrace in this view.
      const terrace=finishesGroup.getObjectByName('shared-ground-terrace');
      const balcony=finishesGroup.getObjectByName('terrace-cover');
      const outdoor=floor==='ground'?terrace:floor==='first'&&balcony?.userData.terraceCoverType==='balcony'?balcony:null;
      owned=cloneOwnedScene(outdoor?[outdoor]:[]);
    }
    const transform=new THREE.Matrix4().compose(new THREE.Vector3(frame.origin[0],frame.floorZ,frame.origin[1]),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),frame.rotationY),new THREE.Vector3(1,1,1)).invert();
    owned.root.applyMatrix4(transform);owned.root.name='actual-site-context';
    const direction=sun.position.clone().sub(sun.target.position).normalize().applyAxisAngle(new THREE.Vector3(0,1,0),-frame.rotationY);
    return{...owned,key:getInteriorContextKey(),source:'shared-site-model',floor,view,
      lighting:{sunDirection:direction.toArray(),sunColor:sun.color.getHex(),sunIntensity:sun.intensity,skyColor:ambient.color.getHex(),groundColor:ambient.groundColor.getHex(),ambientIntensity:ambient.intensity,interiorLightStrength:nightLightingState(lastSolar,currentSettings).gardenStrength,background:scene.background?.isColor?scene.background.getHex():0xb9cdd1}};
  }
  const getInteriorContextKey=()=>`${contextRevision}:${solarSignature}`;
  return {available:true,rendererType,update,updateSun,setView,startWalk,setGarageView,setDesignInspection,updateGaragePreview,resize,dispose,setPresentation,setPresentationVisible,getPerformanceInfo,createInteriorContext,getInteriorContextKey,getWalkState:()=>walkPose&&({...walkPose,position:walkPose.position.slice()}),getCameraState:()=>({mode,lookYaw:eyeYaw,lookPitch:eyePitch,fov:camera.fov}),getRenderInfo:()=>renderer.info?.render||null};
}
