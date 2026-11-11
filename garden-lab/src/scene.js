import * as THREE from '../vendor/three.module.js';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { SVGRenderer } from '../vendor/SVGRenderer.js';
import { terrainAt, gardenGroundAt, hedgeSegments, hedgeTopAt, canopyBounds, jacuzziBounds } from './geometry.js';
import { createSurfaceTextures } from './scene-materials.js';
import { getSolarState } from './solar.js';

// Site coordinates are x = frontage, y = garden depth, z = absolute elevation.
// Three.js coordinates are x, elevation, -gardenDepth. No vertical exaggeration.
const point = (x, y, z) => new THREE.Vector3(x, z, -y);
const xyz = p => Array.isArray(p) ? p : [p.x, p.y, p.z];
const closeRing = ring => ring.length > 1 && Math.hypot(ring[0][0] - ring.at(-1)[0], ring[0][1] - ring.at(-1)[1]) < 1e-6 ? ring.slice(0, -1) : ring;
const num = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const centroid = ring => {
  const r = closeRing(ring);
  return r.reduce((s, p) => [s[0] + p[0] / r.length, s[1] + p[1] / r.length], [0, 0]);
};

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
  return [[a[0], a[2], -a[1]], [b[0], b[2], -b[1]], [c[0], c[2], -c[1]]];
}

function polygonPrism(ring, base, top, material) {
  const r = closeRing(ring), triangles = [];
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length];
    const a0 = [...a, base], b0 = [...b, base], a1 = [...a, top], b1 = [...b, top];
    triangles.push(localTriangle(a0, b0, b1), localTriangle(a0, b1, a1));
  }
  for (let i = 1; i < r.length - 1; i++) triangles.push(localTriangle([...r[0], top], [...r[i], top], [...r[i + 1], top]));
  const mesh = new THREE.Mesh(geometryFromTriangles(triangles), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Triangulate the actual downsampled roof returns in plan. This preserves their
// measured elevations instead of presenting a made-up pyramid as the survey.
function sampledRoofGeometry(ring, samples, edgeZ) {
  const unique=new Map();
  [...samples,...closeRing(ring).map(p=>[...p,edgeZ])].forEach(p=>{
    const key=`${p[0].toFixed(3)}:${p[1].toFixed(3)}`;
    if(!unique.has(key)||unique.get(key)[2]<p[2])unique.set(key,p);
  });
  const points=[...unique.values()],count=points.length;
  if(count<3)return null;
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys),span=Math.max(x1-x0,y1-y0)*8,cx=(x0+x1)/2,cy=(y0+y1)/2;
  points.push([cx-span,cy-span,edgeZ],[cx,cy+span,edgeZ],[cx+span,cy-span,edgeZ]);
  const triangle=(a,b,c)=>{
    const p=points[a],q=points[b],r=points[c],d=2*(p[0]*(q[1]-r[1])+q[0]*(r[1]-p[1])+r[0]*(p[1]-q[1]));
    if(Math.abs(d)<1e-10)return null;
    const p2=p[0]**2+p[1]**2,q2=q[0]**2+q[1]**2,r2=r[0]**2+r[1]**2;
    const x=(p2*(q[1]-r[1])+q2*(r[1]-p[1])+r2*(p[1]-q[1]))/d;
    const y=(p2*(r[0]-q[0])+q2*(p[0]-r[0])+r2*(q[0]-p[0]))/d;
    return {a,b,c,x,y,r2:(x-p[0])**2+(y-p[1])**2};
  };
  let triangles=[triangle(count,count+1,count+2)];
  for(let i=0;i<count;i++){
    const p=points[i],edges=new Map(),kept=[];
    for(const t of triangles){
      if((p[0]-t.x)**2+(p[1]-t.y)**2<=t.r2+1e-8){
        for(const [a,b]of[[t.a,t.b],[t.b,t.c],[t.c,t.a]]){const key=a<b?`${a}:${b}`:`${b}:${a}`;if(edges.has(key))edges.delete(key);else edges.set(key,[a,b]);}
      }else kept.push(t);
    }
    for(const [a,b]of edges.values()){const t=triangle(a,b,i);if(t)kept.push(t);}
    triangles=kept;
  }
  const faces=triangles.filter(t=>t.a<count&&t.b<count&&t.c<count&&contains((points[t.a][0]+points[t.b][0]+points[t.c][0])/3,(points[t.a][1]+points[t.b][1]+points[t.c][1])/3,ring)).map(t=>localTriangle(points[t.a],points[t.b],points[t.c]));
  return faces.length?geometryFromTriangles(faces):null;
}

function removeGeometry(group) {
  group.traverse(child => {
    child.geometry?.dispose();
    if (child.isInstancedMesh) child.dispose?.();
    if (child.material?.userData?.transient) child.material.dispose();
  });
  group.clear();
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
  return { available: false, reason: String(error?.message || error), update() {}, updateSolar() {}, setView() {}, resize() {}, dispose() { element.remove(); } };
}

export function createScene(container, data, callbacks = {}) {
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
  renderer.setPixelRatio?.(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  if(renderer.shadowMap){renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;}
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none';
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', 'Interactive 3D model of the Sternicza house, garden and surrounding apartment blocks. Drag to rotate.');
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#dce7e8');
  scene.fog = new THREE.Fog('#dce7e8', 155, 330);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.08, 550);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.minDistance = 3;
  controls.maxDistance = 190;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.screenSpacePanning = true;
  controls.zoomSpeed = 0.8;
  controls.rotateSpeed = 0.65;

  const ambient = new THREE.HemisphereLight('#eaf3fa', '#77705e', 1.7);
  scene.add(ambient);
  if(svgMode)scene.add(new THREE.AmbientLight('#ffffff',.88));
  const sun = new THREE.DirectionalLight('#fff2d4', svgMode?.72:3.1);
  sun.position.copy(point(-30, 4, 70));
  sun.target.position.copy(point(10, 24, 3));
  sun.castShadow = !svgMode;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 600 });
  sun.shadow.normalBias = 0.025;
  sun.shadow.bias = -0.00008;
  scene.add(sun, sun.target);

  // A small procedural sky gives orientation without an unrelated photograph or
  // invented surrounding skyline. All daylight direction comes from solar.js.
  let sky = null;
  if (!svgMode) {
    sky = new THREE.Mesh(new THREE.SphereGeometry(410, 24, 12), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { sunDirection: { value: new THREE.Vector3(0, 1, 0) }, daylight: { value: 1 }, warmth: { value: 0 } },
      vertexShader: 'varying vec3 vDirection; void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `varying vec3 vDirection; uniform vec3 sunDirection; uniform float daylight; uniform float warmth;
        void main(){vec3 d=normalize(vDirection);float h=pow(max(d.y,0.0),0.5);
        vec3 horizon=mix(vec3(.71,.80,.84),vec3(.91,.64,.40),warmth*.55);
        vec3 day=mix(horizon,vec3(.30,.51,.68),h);
        vec3 night=mix(vec3(.07,.10,.15),vec3(.012,.025,.055),h);
        vec3 color=mix(night,day,daylight);
        float s=max(dot(d,normalize(sunDirection)),0.0);
        color+=vec3(1.0,.80,.48)*(pow(s,700.0)*.12+pow(s,24000.0)*1.4)*daylight;
        gl_FragColor=vec4(color,1.0);}`
    }));
    sky.frustumCulled = false; sky.renderOrder = -1000; scene.add(sky);
  }
  const sunPathGroup = new THREE.Group(), sunMarkerGroup = new THREE.Group();
  scene.add(sunPathGroup, sunMarkerGroup);
  let solarPathSignature = '';

  const mat = {};
  const textures = svgMode ? null : createSurfaceTextures();
  const standard = (name, color, options = {}) => mat[name] = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, side: THREE.DoubleSide, ...Object.fromEntries(Object.entries(options).filter(([,value])=>value!==undefined)) });
  standard('stone', textures ? '#fff7e8' : '#d7c9b3', { map: textures?.stone });
  standard('stoneLight', textures ? '#fffdf5' : '#e8dfcd', { map: textures?.stone });
  standard('wall', '#f2f0e8', { map: textures?.stucco });
  standard('plinth', '#b5ae9e');
  standard('roof', textures ? '#b7b9b0' : '#3a4544', { roughness: 0.78, map: textures?.roof });
  standard('wood', textures ? '#d4bfa0' : '#9c7957', { map: textures?.wood });
  standard('woodLight', textures ? '#f0ddba' : '#b5926b', { map: textures?.wood });
  standard('metal', '#343f3b', { roughness: 0.6, metalness: 0.3 });
  standard('glass', '#94c6c3', { transparent: true, opacity: 0.13, roughness: 0.15, depthWrite: false });
  standard('water', '#4d9d9b', { roughness: 0.16, metalness: 0.22, map: textures?.water, bumpMap: textures?.water, bumpScale: .025 });
  standard('waterLight', '#a0d1c5', { roughness: 0.18, metalness: 0.12, transparent: !svgMode, opacity: .82, map: textures?.water });
  standard('basin', '#81a7a0', { roughness: .45 });
  standard('hedge', '#496242', { map: textures?.foliage });
  standard('thuja', '#668253', { map: textures?.foliage, roughness: .92 });
  standard('hedgeTop', '#476b4c');
  standard('leaf', '#637e51');
  standard('grass', '#94a575', { map: textures?.grass });
  standard('context', '#d3d6d0', { map: textures?.stucco });
  standard('target', '#d5d4c7', { map: textures?.stucco });
  standard('contextRoof', '#89918c', { map: textures?.roof });
  standard('contextWindow', '#65888e', { roughness: 0.3, metalness: .18 });
  standard('windowFrame', '#d6d9cb', { roughness: .65 });
  standard('road', '#b6b9b0');
  standard('walkway', '#d4d1c2');
  standard('linen', '#fffaf0', { map: textures?.textiles });
  standard('gold', '#d7a74a', { roughness: 0.55, metalness: 0.15 });

  const staticGroup = new THREE.Group(), buildingGroup = new THREE.Group(), designGroup = new THREE.Group(), markerGroup = new THREE.Group(), rayGroup = new THREE.Group();
  scene.add(staticGroup, buildingGroup, designGroup, markerGroup, rayGroup);
  const terrainMeshes = [];
  const labels = [];
  const labelLayer = document.createElement('div');
  labelLayer.className = 'scene-label-layer';
  labelLayer.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none';
  container.append(labelLayer);
  let disposed = false, renderPending = false, mode = 'orbit', currentSettings = {}, currentObserver = null, currentAnalysis = null;
  let designSignature = '', observerSignature = '', eyeYaw = 0, eyePitch = 0, eyeFov=65, storedYaw = null, storedPitch = null;
  let lastWidth = 1, lastHeight = 1;

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

  function roundedSlab(group, x, y, z, width, depth, height, radius, material, hole = 0) {
    const shape = roundedPath(width, depth, radius);
    if (hole > 0) {
      const inner = roundedPath(width - 2 * hole, depth - 2 * hole, Math.max(.05, radius - hole), THREE.Path);
      // Shape paths are local; translate the inner path without changing the outer footprint.
      const path = new THREE.Path(inner.getPoints(5).map(p => new THREE.Vector2(p.x + hole, p.y + hole)));
      shape.holes.push(path);
    }
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: !svgMode, bevelSize: .014, bevelThickness: .012, bevelSegments: 1, curveSegments: svgMode ? 3 : 6, steps: 1 });
    geometry.rotateX(-Math.PI / 2);
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

  function makeTerrain(group, bounds, step, heightAt, material, ring = null, vertexColors = false) {
    const [x0, y0, x1, y1] = bounds, positions = [], colors = [], uv = [];
    const baseColor = new THREE.Color('#91a36c');
    for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) {
      const xx = Math.min(x + step, x1), yy = Math.min(y + step, y1);
      for (const tri of [[[x, y], [xx, y], [xx, yy]], [[x, y], [xx, yy], [x, yy]]]) {
        const c = centroid(tri);
        if (ring && !contains(...c, ring)) continue;
        for (const p of tri) {
          positions.push(p[0], heightAt(...p), -p[1]);
          uv.push(p[0] / 2.5, p[1] / 2.5);
          if (vertexColors) {
            const variation = 0.92 + 0.08 * Math.sin(p[0] * 2.31 + p[1] * 1.27) * Math.cos(p[1] * 0.63);
            colors.push(baseColor.r * variation, baseColor.g * variation, baseColor.b * variation);
          }
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (vertexColors) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    let m = material;
    if (vertexColors) {
      m = material.clone();
      m.color.set('#ffffff');
      m.vertexColors = true;
      m.userData.transient = true;
    }
    const mesh = new THREE.Mesh(geometry, m);
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

  function addContextBuilding(building) {
    const ring = closeRing(building.footprint || []);
    if (ring.length < 3) return;
    const c = centroid(ring), target = building.kind === 'target';
    const base = num(building.baseZ, terrainAt(...c, data));
    const roof = Math.max(base + 2, num(building.roofZ, base + 7));
    const roofPts = (building.roofPoints || []).map(xyz).filter(p => p.length >= 3 && Number.isFinite(p[2]));
    const roofMax = Math.max(roof, ...roofPts.map(p => p[2]));
    const facadeMaterial = (target ? mat.target : mat.context).clone();
    const palette = target ? ['#d3d2c1', '#c5ccc7', '#d4c9b5', '#c4c8bd'] : ['#d9d5cb', '#d2d8d1', '#dfd9cd'];
    facadeMaterial.color.set(palette[Math.abs(building.index || 0) % palette.length]);
    facadeMaterial.userData.transient = true;
    buildingGroup.add(polygonPrism(ring, base, roof, facadeMaterial));
    if (target && roofPts.length > 6) {
      const roofGeometry = sampledRoofGeometry(ring,roofPts.filter((p,i)=>!svgMode||i%3===0),roof);
      const roofMesh = new THREE.Mesh(roofGeometry || geometryFromTriangles([]), mat.contextRoof);
      roofMesh.castShadow = true;
      roofMesh.receiveShadow = true;
      buildingGroup.add(roofMesh);
    } else {
      const outline = [...ring, ring[0]].map(p => [...p, roof + 0.03]);
      line(buildingGroup, outline, '#8b9a98', 0.6);
    }
    if (target && Math.hypot(c[0] - 10, c[1] - 25) < 120) {
      const heightScale = num(building.adjustment?.scaleZ, 1);
      const windowGeometry = new THREE.PlaneGeometry(1.05, 1.35 * heightScale);
      const frameGeometry = new THREE.PlaneGeometry(1.19, 1.49 * heightScale);
      const positions = [];
      for (let side = 0; side < ring.length; side++) {
        const a = ring[side], b = ring[(side + 1) % ring.length], dx = b[0]-a[0], dy=b[1]-a[1], length=Math.hypot(dx,dy);
        const count = Math.max(1, Math.floor(length / 3.5));
        const floors = Math.max(1, Math.floor((roof - base - 1) / (2.9 * heightScale)));
        for (let floor = 0; floor < floors; floor++) for (let n = 0; n < count; n++) {
          const t = (n + 0.5) / count, x = a[0]+dx*t, y = a[1]+dy*t;
          const nx = x - c[0], ny = y - c[1], l = Math.hypot(nx,ny);
          positions.push({x:x+nx/l*.045,y:y+ny/l*.045,z:base+(1.9+floor*2.9)*heightScale,angle:Math.atan2(dy,dx),nx:nx/l,ny:ny/l});
        }
      }
      if(svgMode){
        positions.filter((_,i)=>i%2===0).forEach(p=>{const window=new THREE.Mesh(windowGeometry,mat.contextWindow);window.position.copy(point(p.x,p.y,p.z));window.rotation.set(0,p.angle,0);buildingGroup.add(window);});
      }else{
        const windows = new THREE.InstancedMesh(windowGeometry, mat.contextWindow, positions.length);
        const frames = new THREE.InstancedMesh(frameGeometry, mat.windowFrame, positions.length);
        const dummy = new THREE.Object3D();
        positions.forEach((p,i)=>{
          dummy.position.copy(point(p.x,p.y,p.z));dummy.rotation.set(0,p.angle,0);dummy.updateMatrix();windows.setMatrixAt(i,dummy.matrix);
          windows.setColorAt(i, new THREE.Color(i % 7 === 0 ? '#b3c0ad' : i % 5 === 0 ? '#7f9695' : '#b3d0d0'));
          dummy.position.copy(point(p.x - p.nx * .012,p.y - p.ny * .012,p.z));dummy.updateMatrix();frames.setMatrixAt(i,dummy.matrix);
        });
        windows.receiveShadow = true; frames.receiveShadow = true;
        buildingGroup.add(frames, windows);
      }
      if ([9,15,29].includes(building.index)) label(building.label, [c[0],c[1],roofMax+1.1], 'target', building.id);
    }
  }

  function rebuildContextBuildings() {
    removeGeometry(buildingGroup);
    for (let i = labels.length - 1; i >= 0; i--) {
      if (labels[i].kind === 'target') { labels[i].element.remove(); labels.splice(i, 1); }
    }
    (data.buildings || []).filter(b => b.index !== 0 && b.index !== 1 && b.id !== data.site.house.id && b.id !== data.site.garage?.id).forEach(addContextBuilding);
  }

  makeTerrain(staticGroup, [-65,-28,115,150], svgMode?12:3, (x,y)=>terrainAt(x,y,data)-.015, mat.walkway);
  box(staticGroup, -65, -7.8, terrainAt(10,-4,data)-.02, 180, 5.8, .05, mat.road, false,-95);
  box(staticGroup, -65, -1.9, terrainAt(10,-1,data), 180, 1.8, .05, mat.stoneLight, false,-95);
  for (let x=-50;x<110;x+=8) box(staticGroup,x,-4.96,terrainAt(x,-5,data)+.03,3.5,.1,.015,mat.stoneLight,false,-94);
  rebuildContextBuildings();
  label('STERNICZA', [10,-3.7,terrainAt(10,-3.7,data)+.18], 'road');

  function addHouse(group, settings) {
    const house = data.site.house, ring=closeRing(house.footprint);
    const xs=ring.map(p=>p[0]), ys=ring.map(p=>p[1]), x0=Math.min(...xs), x1=Math.max(...xs), y0=Math.min(...ys), rear=data.site.rearMidpoint[1];
    const roofPoints=(house.roofPoints||[]).map(xyz).filter(p=>p.length>=3&&Number.isFinite(p[2]));
    const floor=data.site.floorReference.z+num(settings.floorHeight,1.2), base=num(house.baseZ,2.37);
    // The house envelope stays at its source elevation when the assumed living
    // floor changes. Detailed finishes and apertures below remain a design proposal.
    const eaves=roofPoints.length?Math.min(...roofPoints.map(p=>p[2])):num(house.roofZ,11.33);
    const ridge=num(house.roofTopZ,eaves);
    // Three closed elevations; the fourth is an actual glazed opening at the living level.
    for (let i=0;i<ring.length;i++) {
      const a=ring[i],b=ring[(i+1)%ring.length];
      if ((a[1]+b[1])/2>rear-.15) continue;
      const triangles=[localTriangle([...a,base],[...b,base],[...b,eaves]),localTriangle([...a,base],[...b,eaves],[...a,eaves])];
      const mesh=new THREE.Mesh(geometryFromTriangles(triangles),mat.wall);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
    }
    box(group,x0,rear-.14,base,x1-x0,.28,Math.max(.08,floor-base),mat.plinth);
    const openingX=data.site.terrace.x,openingW=data.site.terrace.width,openingTop=floor+2.7;
    box(group,x0,rear-.14,floor,openingX-x0,.28,2.7,mat.wall);
    box(group,openingX+openingW,rear-.14,floor,x1-openingX-openingW,.28,2.7,mat.wall);
    box(group,openingX+openingW/2-.17,rear-.14,floor,.34,.28,2.7,mat.wall);
    box(group,x0,rear-.14,openingTop,x1-x0,.28,Math.max(.15,eaves-openingTop),mat.wall);
    box(group,x0+.1,y0+.1,floor-.14,x1-x0-.2,rear-y0-.1,.14,mat.stoneLight,false);
    const bayWidth=(openingW-.34)/2;
    [openingX,openingX+openingW/2+.17].forEach(x=>{
      box(group,x,rear-.025,floor+.025,bayWidth,.04,2.63,mat.glass,false);
      box(group,x,rear+.008,floor,.045,.06,2.7,mat.metal,false);
      box(group,x+bayWidth-.045,rear+.008,floor,.045,.06,2.7,mat.metal,false);
      box(group,x,rear+.008,floor+2.655,bayWidth,.06,.045,mat.metal,false);
    });
    [x0+2.5,x0+7.1].forEach(x=>{
      box(group,x,rear+.016,floor+3.5,1.5,.04,1.65,mat.metal,false);
      box(group,x+.06,rear+.042,floor+3.56,1.38,.035,1.53,mat.contextWindow,false);
    });
    // Subtle front window rhythm and recessed timber entrance.
    [x0+1.35,x0+7.2].forEach(x=>[floor+.5,floor+3.55].forEach(z=>{
      box(group,x,y0-.045,z,1.5,.05,1.7,mat.metal,false);
      box(group,x+.07,y0-.073,z+.07,1.36,.035,1.56,mat.contextWindow,false);
    }));
    box(group,x0+4.5,y0-.06,floor,1.05,.09,2.4,mat.wood,false);
    box(group,x0+4.28,y0-.7,floor+2.5,1.48,.8,.11,mat.metal);
    const frontGround=terrainAt(x0+4.7,y0-1,data);
    const frontSteps=Math.max(1,Math.ceil((floor-frontGround)/.18));
    for(let i=0;i<frontSteps;i++)box(group,x0+4.0,y0-.35*(frontSteps-i),frontGround,2.0,.35,Math.max(.1,(floor-frontGround)*(i+1)/frontSteps),mat.stone);
    const measuredRoof=roofPoints.length>6?sampledRoofGeometry(ring,roofPoints,eaves):null;
    if(measuredRoof){const roofMesh=new THREE.Mesh(measuredRoof,mat.roof);roofMesh.castShadow=true;roofMesh.receiveShadow=true;group.add(roofMesh);}
    else group.add(polygonPrism(ring,eaves,ridge,mat.roof));
    // Architectural finishes are illustrative and do not change the measured mass.
    box(group,x0-.025,rear-.07,eaves-.09,x1-x0+.05,.1,.1,mat.metal,false);
    box(group,x0-.025,y0-.065,eaves-.09,x1-x0+.05,.1,.1,mat.metal,false);
    for(let x=x0+.12;x<openingX-.08;x+=.13)box(group,x,rear+.015,floor,.052,.055,2.7,mat.wood,false);
    for(let x=openingX+openingW+.08;x<x1-.08;x+=.13)box(group,x,rear+.015,floor,.052,.055,2.7,mat.wood,false);
    for(let z=base+.35;z<floor-.1;z+=.35)line(group,[[x0,rear+.012,z],[x1,rear+.012,z]],'#8e887b',.22);
    // Low furnishings add scale without adding unsimulated tall sightline obstacles.
    box(group,6.2,13.5,floor,3.1,1.0,.4,mat.linen);
    box(group,6.2,13.5,floor+.4,3.1,.27,.42,mat.linen);
    box(group,7,15.0,floor,.95,.65,.32,mat.woodLight);
  }

  function addHedges(group,settings) {
    const crowns = [];
    for(const segment of hedgeSegments(settings,data)) {
      const a=segment.a,b=segment.b,dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
      const n=Math.max(1,Math.ceil(length/1.2)), triangles=[];
      const inward=[-dy/length*.12,dx/length*.12];
      for(let i=0;i<n;i++){
        const u=i/n,v=(i+1)/n,p=[a[0]+dx*u,a[1]+dy*u],q=[a[0]+dx*v,a[1]+dy*v];
        const groundP=gardenGroundAt(...p,settings,data)+num(settings.bedRaise),groundQ=gardenGroundAt(...q,settings,data)+num(settings.bedRaise);
        const topP=hedgeTopAt(...p,segment.side,settings,data),topQ=hedgeTopAt(...q,segment.side,settings,data);
        if(topP<=groundP && topQ<=groundQ)continue;
        triangles.push(localTriangle([...p,groundP],[...q,groundQ],[...q,topQ]),localTriangle([...p,groundP],[...q,topQ],[...p,topP]));
        // The mathematical hedge plane is retained. Thin volume makes it legible in plan.
        const pp=[p[0]+inward[0],p[1]+inward[1]],qq=[q[0]+inward[0],q[1]+inward[1]];
        triangles.push(localTriangle([...p,topP],[...q,topQ],[...qq,topQ]),localTriangle([...p,topP],[...qq,topQ],[...pp,topP]));
        triangles.push(localTriangle([...pp,groundP],[...qq,topQ],[...qq,groundQ]),localTriangle([...pp,groundP],[...pp,topP],[...qq,topQ]));
      }
      const mesh=new THREE.Mesh(geometryFromTriangles(triangles),mat.hedge);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
      // Instanced crown clusters supply volume and individual plant character.
      // The continuous plane above remains the ideal analytical screen and the
      // shadow caster; crown porosity is intentionally not a privacy guarantee.
      if (!svgMode) {
        const spacing=Math.max(.45,Math.min(1.2,num(settings.costSpacing,.65)));
        const count=Math.max(1,Math.ceil(length/spacing));
        for(let j=0;j<count;j++){
          const t=(j+.5)/count,px=a[0]+dx*t-dy/length*.14,py=a[1]+dy*t+dx/length*.14;
          const ground=gardenGroundAt(px,py,settings,data)+num(settings.bedRaise);
          const top=hedgeTopAt(px,py,segment.side,settings,data),h=Math.max(0,top-ground);
          if(h<.12)continue;
          const radius=Math.min(.65,.36+h*.045),phase=px*2.31+py*1.79;
          for(let k=0;k<7;k++){
            const q=k/6,scale=(1-q*.76),z=ground+h*(.12+q*.77);
            crowns.push({x:px+Math.sin(phase+k)*radius*.10,y:py+Math.cos(phase+k*.7)*radius*.10,z,
              rx:radius*scale,ry:radius*scale*.88,rz:h*(.15-q*.055),rotation:phase+k,color:k%3});
            if(k>0&&k<5)for(const side of [-1,1])crowns.push({
              x:px+Math.cos(phase+k*2.4)*radius*scale*.57*side,
              y:py+Math.sin(phase+k*2.4)*radius*scale*.57*side,z:z-h*.018,
              rx:radius*scale*.59,ry:radius*scale*.56,rz:h*.11,rotation:phase+k*.6,color:(k+j)%3});
          }
        }
      }
      if(num(settings.bedRaise)>0){
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
      if(svgMode){const verts=[];for(let i=0;i<=n;i++){const t=i/n,x=a[0]+dx*t,y=a[1]+dy*t;verts.push([x,y,hedgeTopAt(x,y,segment.side,settings,data)+.015]);}line(group,verts,'#68815a',.7);}
    }
    if(crowns.length){
      const geometry=new THREE.IcosahedronGeometry(1,1),foliage=new THREE.InstancedMesh(geometry,mat.thuja,crowns.length),dummy=new THREE.Object3D();
      const colors=['#a2b78e','#819f6c','#b0bf97'].map(c=>new THREE.Color(c));
      crowns.forEach((p,i)=>{dummy.position.copy(point(p.x,p.y,p.z));dummy.scale.set(p.rx,p.rz,p.ry);dummy.rotation.set(.08*Math.sin(p.rotation),p.rotation,.06*Math.cos(p.rotation));dummy.updateMatrix();foliage.setMatrixAt(i,dummy.matrix);foliage.setColorAt(i,colors[p.color]);});
      foliage.castShadow=false;foliage.receiveShadow=true;group.add(foliage);
    }
  }

  function addShrubs(group,settings) {
    const placements=[];
    for(let y=20;y<37;y+=1.45){placements.push([1.05,y,.35+(Math.sin(y)*.5+.5)*.3]);placements.push([19.25,y,.35+(Math.cos(y)*.5+.5)*.3]);}
    for(let x=2;x<19;x+=1.3)placements.push([x,36.8,.4+(Math.sin(x*3)*.5+.5)*.18]);
    if(svgMode){
      placements.filter((_,i)=>i%3===0).forEach(([x,y,h])=>{const shrub=new THREE.Mesh(new THREE.IcosahedronGeometry(1,0),mat.leaf);shrub.position.copy(point(x,y,gardenGroundAt(x,y,settings,data)+h*.48));shrub.scale.set(.53,h,.53);group.add(shrub);});
      return;
    }
    const geometry=new THREE.IcosahedronGeometry(1,1), instance=new THREE.InstancedMesh(geometry,mat.leaf,placements.length),dummy=new THREE.Object3D();
    placements.forEach(([x,y,h],i)=>{dummy.position.copy(point(x,y,gardenGroundAt(x,y,settings,data)+h*.48));dummy.scale.set(.53,h,.53);dummy.rotation.y=x+y;dummy.updateMatrix();instance.setMatrixAt(i,dummy.matrix);});
    instance.castShadow=false;instance.receiveShadow=true;group.add(instance);
  }

  function addGarden(group,settings) {
    const rear=data.site.rearMidpoint[1],floor=data.site.floorReference.z+num(settings.floorHeight,1.2),terrace=data.site.terrace;
    const depth=num(settings.terraceDepth,terrace.depth),x=terrace.x,width=terrace.width;
    const ground=gardenGroundAt(x+width/2,rear+depth/2,settings,data);
    const deckBase=Math.min(ground,floor-.15);
    const jacuzzi=jacuzziBounds(settings,data),jx=jacuzzi.x0,jy=jacuzzi.y0;
    const deckHeight=Math.max(.15,floor-deckBase);
    // Four deck slabs leave an actual opening for the integrated tub. The water
    // and seats sit below deck level instead of a blue plate over a solid terrace.
    box(group,x,rear,deckBase,jx-x,depth,deckHeight,mat.stone);
    box(group,jacuzzi.x1,rear,deckBase,x+width-jacuzzi.x1,depth,deckHeight,mat.stone);
    box(group,jx,rear,deckBase,2.2,jy-rear,deckHeight,mat.stone);
    box(group,jx,jacuzzi.y1,deckBase,2.2,rear+depth-jacuzzi.y1,deckHeight,mat.stone);
    // Tile joints and a shadow reveal provide scale on the larger terrace.
    for(let tx=x+1.2;tx<x+width;tx+=1.2){
      if(tx>jx&&tx<jacuzzi.x1){line(group,[[tx,rear,floor+.006],[tx,jy,floor+.006]],'#8c816c',.32);line(group,[[tx,jacuzzi.y1,floor+.006],[tx,rear+depth,floor+.006]],'#8c816c',.32);}
      else line(group,[[tx,rear,floor+.006],[tx,rear+depth,floor+.006]],'#8c816c',.32);
    }
    for(let ty=rear+1.2;ty<rear+depth;ty+=1.2){
      if(ty>jy&&ty<jacuzzi.y1){line(group,[[x,ty,floor+.006],[jx,ty,floor+.006]],'#8c816c',.32);line(group,[[jacuzzi.x1,ty,floor+.006],[x+width,ty,floor+.006]],'#8c816c',.32);}
      else line(group,[[x,ty,floor+.006],[x+width,ty,floor+.006]],'#8c816c',.32);
    }
    roundedSlab(group,jx,jy,floor-.68,2.2,2.2,.74,.26,mat.basin,.13);
    roundedSlab(group,jx+.13,jy+.13,floor-.69,1.94,1.94,.04,.15,mat.basin);
    roundedSlab(group,jx-.015,jy-.015,floor+.015,2.23,2.23,.075,.26,mat.stoneLight,.17);
    roundedSlab(group,jx+.16,jy+.16,floor-.13,1.88,1.88,.015,.14,mat.waterLight);
    for(const sx of [jx+.17,jx+1.55])roundedSlab(group,sx,jy+.25,floor-.42,.48,1.35,.10,.13,mat.stoneLight);
    if(!svgMode){
      const jets=new THREE.InstancedMesh(new THREE.SphereGeometry(.035,8,5),mat.metal,8),dummy=new THREE.Object3D();
      for(let i=0;i<8;i++){dummy.position.copy(point(i<4?jx+.155:jx+2.045,jy+.43+(i%4)*.44,floor-.28));dummy.updateMatrix();jets.setMatrixAt(i,dummy.matrix);}group.add(jets);
    }
    const stepGround=gardenGroundAt(x+width/2,rear+depth+.6,settings,data),drop=floor-stepGround;
    if(drop>.1){
      const n=Math.max(1,Math.ceil(drop/.18)),stepW=3.0;
      for(let i=0;i<n;i++)box(group,x+1.0,rear+depth+i*.29,stepGround,stepW,.29,drop*(n-i)/n,mat.stone);
    }
    // Low daybed at the terrace's quiet end.
    box(group,x+.45,rear+.7,floor,.7,2.1,.26,mat.wood);
    roundedSlab(group,x+.42,rear+.72,floor+.26,.76,2.0,.12,.07,mat.linen);
    roundedSlab(group,x+.48,rear+.78,floor+.39,.64,.38,.10,.07,mat.linen);
    roundedSlab(group,x+1.45,rear+1.2,floor,.65,.65,.34,.20,mat.woodLight);
    const p=data.site.pool,px=p.x,py=p.y,pw=p.width,pl=p.length,pz=gardenGroundAt(px+pw/2,py+pl/2,settings,data)+.015;
    box(group,px-.28,py-.28,pz-.06,pw+.56,.28,.12,mat.stoneLight,false,-70);
    box(group,px-.28,py+pl,pz-.06,pw+.56,.28,.12,mat.stoneLight,false,-70);
    box(group,px-.28,py,pz-.06,.28,pl,.12,mat.stoneLight,false,-70);
    box(group,px+pw,py,pz-.06,.28,pl,.12,mat.stoneLight,false,-70);
    box(group,px,py,pz+.015,pw,pl,.025,mat.water,false,-69);
    for(let ty=py+.8;ty<py+pl;ty+=.8){line(group,[[px-.28,ty,pz+.067],[px,ty,pz+.067]],'#b1a994',.45);line(group,[[px+pw,ty,pz+.067],[px+pw+.28,ty,pz+.067]],'#b1a994',.45);}
    for(let n=0;n<4;n++)line(group,[[px+.12,py+1+n*1.9,pz+.095],[px+pw-.12,py+1+n*1.9,pz+.095]],'#79a5a0',.21);
    for(let y=28;y<32;y+=2.5){
      const lx=10.8,lz=gardenGroundAt(lx,y,settings,data);
      box(group,lx,y,lz,.78,2.0,.24,mat.wood);
      roundedSlab(group,lx+.02,y+.03,lz+.24,.74,1.9,.1,.07,mat.linen);
      const back=box(group,lx+.02,y+.03,lz+.37,.74,.6,.09,mat.linen);back.rotation.x=.3;
    }
    // Ground-level circulation and a small dining setting, only when the garage is removed.
    for(let y=23;y<35;y+=1.45){const z=gardenGroundAt(3.8,y,settings,data);box(group,3.2,y,z+.018,1.15,.9,.035,mat.stoneLight,false,-80);}
    if(settings.removeGarage!==false){
      const dx=15.3,dy=26.4,dz=gardenGroundAt(dx,dy,settings,data);
      box(group,14.1,24.5,dz-.015,3.8,4.6,.035,mat.stone,false,-80);
      box(group,dx,dy,dz+.65,1.55,.8,.09,mat.woodLight);
      [dx+.1,dx+1.3].forEach(tx=>box(group,tx,dy+.1,dz,.12,.6,.65,mat.wood));
      for(const cy of [dy-.55,dy+1.0])for(const cx of [dx+.08,dx+.92]){
        box(group,cx,cy,dz+.42,.55,.5,.08,mat.linen);
        box(group,cx,cy+(cy<dy?0:.43),dz+.5,.55,.07,.35,mat.wood);
      }
    }
    addShrubs(group,settings);
  }

  function addCanopy(group,settings) {
    if(!settings.canopyEnabled)return;
    const b=canopyBounds(settings,data);if(!b)return;
    const floor=data.site.floorReference.z+num(settings.floorHeight,1.2);
    box(group,b.x0,b.y0,b.z,b.x1-b.x0,b.y1-b.y0,.15,mat.stoneLight);
    const bottom=num(b.fasciaBottomZ,b.z-num(settings.fasciaDepth,.3)),height=Math.max(.04,b.z-bottom);
    box(group,b.x0,b.y1-.075,bottom,b.x1-b.x0,.15,height,mat.wood);
    box(group,b.x0,b.y0,bottom,.13,b.y1-b.y0,height,mat.wood);
    box(group,b.x1-.13,b.y0,bottom,.13,b.y1-b.y0,height,mat.wood);
    for(const x of [b.x0+.08,b.x1-.18])box(group,x,b.y1-.18,floor,.1,.1,Math.max(.1,bottom-floor),mat.metal);
    for(let x=b.x0+.35;x<b.x1;x+=.52)box(group,x,b.y0,b.z-.04,.07,b.y1-b.y0,.04,mat.wood,false);
  }

  function rebuildDesign(settings) {
    terrainMeshes.length=0;
    removeGeometry(designGroup);
    const boundary=data.site.boundary;
    const ground=makeTerrain(designGroup,[-.1,0,20.45,38.3],svgMode?2:.65,(x,y)=>gardenGroundAt(x,y,settings,data)+.008,mat.grass,boundary,!svgMode);
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
    const frontZ=terrainAt(5,5,data);
    box(designGroup,1.0,.4,frontZ+.01,2.6,9.1,.04,mat.stone,false,-80);
    box(designGroup,4.1,1.7,frontZ+.01,10.9,1.1,.04,mat.stone,false,-80);
    addHouse(designGroup,settings);
    addGarden(designGroup,settings);
    addHedges(designGroup,settings);
    addCanopy(designGroup,settings);
    if(settings.includeHighFeatures){
      const returns=(data.buildings||[]).flatMap(b=>b.highFeatures||[]);
      if(returns.length){
        const geometry=new THREE.BufferGeometry().setFromPoints(returns.map(p=>point(...xyz(p))));
        const material=new THREE.PointsMaterial({color:'#b77d38',size:svgMode?.22:.14,sizeAttenuation:true});material.userData.transient=true;
        designGroup.add(new THREE.Points(geometry,material));
      }
    }
    if(settings.removeGarage===false&&data.site.garage){
      const g=data.site.garage,base=num(g.baseZ,2.49),eaves=num(g.roofZ,7.72)-.7;
      designGroup.add(polygonPrism(g.footprint,base,eaves,mat.plinth));
      pitchedRoof(designGroup,g.footprint,eaves,num(g.roofTopZ,8.69),mat.roof,'y');
    }
  }

  function rebuildObserver(observer,analysis,settings) {
    removeGeometry(markerGroup);removeGeometry(rayGroup);
    if(!observer)return;
    const ground=gardenGroundAt(observer.x,observer.y,settings,data);
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

  function renderNow() {
    renderPending=false;if(disposed)return;
    if(sky)sky.position.copy(camera.position);
    renderer.render(scene,camera);renderLabels();
  }
  function requestRender() {if(!renderPending&&!disposed){renderPending=true;requestAnimationFrame(renderNow);}}
  controls.addEventListener('change',requestRender);

  function fitSunShadow() {
    if(svgMode)return;
    const shadowCamera=sun.shadow.camera;
    shadowCamera.position.copy(sun.position);shadowCamera.lookAt(sun.target.position);shadowCamera.updateMatrixWorld(true);
    const view=shadowCamera.matrixWorldInverse;
    const localPoint=new THREE.Vector3();
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
    // Focus shadow texels on the house and garden receivers, but retain enough
    // depth for every mapped neighbouring blocker, including low winter sun.
    for(const x of [-3,24])for(const y of [-3,43])for(const z of [0,15]){
      localPoint.copy(point(x,y,z)).applyMatrix4(view);
      minX=Math.min(minX,localPoint.x);maxX=Math.max(maxX,localPoint.x);minY=Math.min(minY,localPoint.y);maxY=Math.max(maxY,localPoint.y);
      minZ=Math.min(minZ,localPoint.z);maxZ=Math.max(maxZ,localPoint.z);
    }
    for(const building of [data.site.house,data.site.garage,...(data.buildings||[])].filter(Boolean)){
      const top=Math.max(num(building.roofTopZ),num(building.roofZ),...(building.roofPoints||[]).map(p=>num(xyz(p)[2])));
      for(const p of closeRing(building.footprint))for(const z of [num(building.baseZ),top+1]){
        localPoint.copy(point(p[0],p[1],z)).applyMatrix4(view);minZ=Math.min(minZ,localPoint.z);maxZ=Math.max(maxZ,localPoint.z);
      }
    }
    Object.assign(shadowCamera,{left:minX-3,right:maxX+3,bottom:minY-3,top:maxY+3,near:Math.max(.5,-maxZ-12),far:Math.max(50,-minZ+12)});
    shadowCamera.updateProjectionMatrix();sun.shadow.needsUpdate=true;
  }

  function updateSolar(settings=currentSettings,solar=null) {
    currentSettings={...currentSettings,...settings};
    const valid=solar?.valid!==false&&solar?.directionLocal&&Number.isFinite(solar.elevationDeg);
    // A rejected DST clock must not silently display an arbitrary sunny noon.
    const elevation=valid?solar.elevationDeg:solar?-90:38;
    const direction=valid?solar.directionLocal:{x:-.4,y:-.45,z:.8};
    const vector=new THREE.Vector3(direction.x,direction.z,-direction.y).normalize();
    const day=THREE.MathUtils.smoothstep(elevation,-8,5),warmth=1-THREE.MathUtils.smoothstep(elevation,0,22);
    const center=point(10,23,data.site.floorReference.z+1);
    sun.position.copy(center).addScaledVector(vector,350);sun.target.position.copy(center);
    sun.intensity=elevation>0?(svgMode?.7:3.0)*Math.max(.12,Math.sqrt(Math.max(0,Math.sin(elevation*Math.PI/180)))):0;
    sun.color.copy(new THREE.Color('#ffbd78')).lerp(new THREE.Color('#fff7e4'),1-warmth);
    ambient.intensity=.10+day*(svgMode?1.0:1.65);
    ambient.color.copy(new THREE.Color('#748ba9')).lerp(new THREE.Color('#eaf3fa'),day);
    sun.castShadow=!svgMode&&settings.shadowsEnabled!==false&&elevation>0;
    if(renderer.shadowMap)renderer.shadowMap.enabled=settings.shadowsEnabled!==false;
    const horizon=new THREE.Color('#182333').lerp(new THREE.Color('#d5e2e5'),day);
    if(day>.5&&warmth>.2)horizon.lerp(new THREE.Color('#dfc5ab'),warmth*.35);
    scene.background.copy(horizon);scene.fog.color.copy(horizon);
    if(sky){sky.material.uniforms.sunDirection.value.copy(vector);sky.material.uniforms.daylight.value=day;sky.material.uniforms.warmth.value=warmth;}
    fitSunShadow();
    const showPath=settings.showSunPath===true&&valid;
    sunPathGroup.visible=showPath;sunMarkerGroup.visible=showPath&&elevation>0;
    const signature=valid?`${solar.date}:${JSON.stringify(solar.location||{})}`:'';
    if(showPath&&signature!==solarPathSignature){
      solarPathSignature=signature;removeGeometry(sunPathGroup);
      const vertices=[];
      for(let minutes=0;minutes<1440;minutes+=20){
        const state=getSolarState(solar.date,minutes,data);
        if(!state.valid||state.elevationDeg<=0)continue;
        const d=state.directionLocal;vertices.push([10+d.x*46,23+d.y*46,data.site.floorReference.z+1+d.z*46]);
      }
      if(vertices.length>1)line(sunPathGroup,vertices,'#d39f45',.75);
    }
    removeGeometry(sunMarkerGroup);
    if(showPath&&elevation>0){
      const position=center.clone().addScaledVector(vector,46),material=new THREE.MeshBasicMaterial({color:'#ffd280'});material.userData.transient=true;
      const marker=new THREE.Mesh(new THREE.SphereGeometry(.65,svgMode?6:12,svgMode?4:8),material);marker.position.copy(position);sunMarkerGroup.add(marker);
      line(sunMarkerGroup,[[10,23,data.site.floorReference.z+1],[position.x,-position.z,position.y]],'#d39f45',.28);
    }
    container.dataset.solarElevation=String(Math.round(elevation*100)/100);
    container.dataset.shadowRenderer=svgMode?'unavailable':settings.shadowsEnabled===false?'off':'on';
    requestRender();
  }

  function orientEye() {
    if(!currentObserver)return;
    const yaw=THREE.MathUtils.degToRad(eyeYaw),pitch=THREE.MathUtils.degToRad(eyePitch);
    camera.position.copy(point(currentObserver.x,currentObserver.y,currentObserver.z));
    const target=camera.position.clone().add(new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)));
    camera.lookAt(target);requestRender();
  }

  function setView(nextMode,observer=currentObserver,settings=currentSettings) {
    const previous=mode;mode=['orbit','eye','plan'].includes(nextMode)?nextMode:'orbit';
    currentObserver=observer||currentObserver;currentSettings=settings||currentSettings;
    controls.enabled=mode!=='eye';controls.enableRotate=mode==='orbit';controls.enablePan=mode!=='eye';
    markerGroup.visible=mode!=='eye';camera.up.set(0,1,0);
    if(mode==='eye'){
      eyeFov=num(settings.fov,eyeFov);camera.fov=eyeFov;camera.near=.04;
      if(previous!=='eye'){eyeYaw=num(settings.lookYaw);eyePitch=num(settings.lookPitch);}
      orientEye();
    }else if(mode==='plan'){
      camera.fov=36;camera.near=.1;camera.position.copy(point(10,23.999,83));controls.target.copy(point(10,24,2.5));camera.lookAt(controls.target);controls.minDistance=15;controls.maxPolarAngle=.001;controls.minPolarAngle=.0001;controls.update();
    }else{
      camera.fov=48;camera.near=.1;camera.position.copy(point(29,46,33));controls.target.copy(point(10,23,4));controls.minDistance=3;controls.minPolarAngle=.08;controls.maxPolarAngle=Math.PI*.49;camera.lookAt(controls.target);controls.update();
    }
    camera.updateProjectionMatrix();requestRender();
  }

  function update(settings,observer,analysis,activeData=data,solar=null) {
    if(activeData!==data){
      data=activeData;
      rebuildContextBuildings();
      // Optional high roof returns are part of the design group and must move
      // with their building as well. The camera and terrain renderer persist.
      designSignature='';
    }
    currentSettings={...settings};currentObserver=observer;currentAnalysis=analysis;
    const signature=JSON.stringify(['hedgeRear','hedgeLeft','hedgeRight','hedgeInset','gardenRaise','bedRaise','raiseNewHedges','floorHeight','removeGarage','canopyEnabled','canopyDepth','canopyHeight','canopyWidth','fasciaDepth','terraceDepth','includeHighFeatures'].map(k=>settings[k]));
    if(signature!==designSignature){designSignature=signature;rebuildDesign(settings);}
    const nextObserverSignature=observer?`${observer.x}:${observer.y}:${observer.z}`:'';
    rebuildObserver(observer,analysis,settings);
    if(mode==='eye'){
      if(settings.lookYaw!==storedYaw||settings.lookPitch!==storedPitch||nextObserverSignature!==observerSignature){eyeYaw=num(settings.lookYaw);eyePitch=num(settings.lookPitch);}
      storedYaw=settings.lookYaw;storedPitch=settings.lookPitch;
      eyeFov=num(settings.fov,eyeFov);camera.fov=eyeFov;camera.updateProjectionMatrix();orientEye();
    }
    observerSignature=nextObserverSignature;
    for(const l of labels){
      if(l.kind!=='target')continue;
      const result=analysis?.byBlock?.find(b=>b.id===l.id);
      if(result)l.element.style.borderColor=result.visible?'rgba(157,92,63,.3)':'rgba(61,110,78,.32)';
    }
    updateSolar(settings,solar);
    requestRender();
  }

  function resize() {
    const bounds=container.getBoundingClientRect();lastWidth=Math.max(1,bounds.width);lastHeight=Math.max(1,bounds.height);
    renderer.setSize(lastWidth,lastHeight,false);camera.aspect=lastWidth/lastHeight;camera.updateProjectionMatrix();requestRender();
  }

  let pointerStart=null,pointerLast=null,dragged=false,pinchDistance=0,pinchFov=65;
  const eyePointers=new Map();
  function pointerDown(event){
    if(event.button!==0&&event.pointerType!=='touch')return;
    if(mode==='eye'){
      eyePointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
      renderer.domElement.setPointerCapture(event.pointerId);
      if(eyePointers.size>=2){const p=[...eyePointers.values()];pinchDistance=Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y);pinchFov=eyeFov;dragged=true;return;}
    }
    pointerStart={x:event.clientX,y:event.clientY,id:event.pointerId};pointerLast={x:event.clientX,y:event.clientY};dragged=false;
  }
  function pointerMove(event){
    if(mode==='eye'&&eyePointers.has(event.pointerId)){
      eyePointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if(eyePointers.size>=2){
        const p=[...eyePointers.values()],distance=Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y);
        if(distance>0&&pinchDistance>0){eyeFov=Math.max(35,Math.min(95,pinchFov*pinchDistance/distance));camera.fov=eyeFov;camera.updateProjectionMatrix();requestRender();}
        dragged=true;return;
      }
    }
    if(!pointerStart||event.pointerId!==pointerStart.id)return;
    if(Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)>5)dragged=true;
    if(mode==='eye'&&pointerLast){
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
      if(hit){const p={x:hit.point.x,y:-hit.point.z};if(contains(p.x,p.y,data.site.boundary))callbacks.onPick(p);}
    }
    if(mode==='eye'&&dragged)callbacks.onCameraChange?.({lookYaw:eyeYaw,lookPitch:eyePitch});
    pointerStart=null;pointerLast=null;
  }
  function keyDown(event){
    if(mode!=='eye')return;
    const amount=event.shiftKey?8:3;
    if(event.key==='ArrowLeft')eyeYaw-=amount;else if(event.key==='ArrowRight')eyeYaw+=amount;else if(event.key==='ArrowUp')eyePitch=Math.min(65,eyePitch+amount);else if(event.key==='ArrowDown')eyePitch=Math.max(-65,eyePitch-amount);else return;
    event.preventDefault();orientEye();callbacks.onCameraChange?.({lookYaw:eyeYaw,lookPitch:eyePitch});
  }
  function wheel(event){
    if(mode!=='eye')return;
    event.preventDefault();eyeFov=Math.max(35,Math.min(95,eyeFov+event.deltaY*.02));camera.fov=eyeFov;camera.updateProjectionMatrix();requestRender();
  }
  renderer.domElement.addEventListener('pointerdown',pointerDown);
  renderer.domElement.addEventListener('pointermove',pointerMove);
  renderer.domElement.addEventListener('pointerup',pointerUp);
  renderer.domElement.addEventListener('pointercancel',pointerUp);
  renderer.domElement.addEventListener('keydown',keyDown);
  renderer.domElement.addEventListener('wheel',wheel,{passive:false});
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(container);
  setView('orbit');resize();

  function dispose(){
    if(disposed)return;disposed=true;resizeObserver.disconnect();controls.dispose();
    renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointermove',pointerMove);renderer.domElement.removeEventListener('pointerup',pointerUp);renderer.domElement.removeEventListener('pointercancel',pointerUp);renderer.domElement.removeEventListener('keydown',keyDown);renderer.domElement.removeEventListener('wheel',wheel);
    const materials=new Set();scene.traverse(o=>{o.geometry?.dispose();if(o.isInstancedMesh)o.dispose?.();if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));});materials.forEach(m=>m.dispose());
    textures?.dispose();renderer.dispose?.();renderer.domElement.remove();labelLayer.remove();
  }
  return {available:true,rendererType,update,updateSolar,setView,resize,dispose,getCameraState:()=>({mode,lookYaw:eyeYaw,lookPitch:eyePitch,fov:camera.fov}),getRenderInfo:()=>renderer.info?.render||null};
}
