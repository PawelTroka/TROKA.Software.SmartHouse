import * as THREE from '../vendor/three.module.js';
import {buildArchitecture,addFlight} from './interior-architecture.js?v=1.39.0';
import {interiorMaterials} from './interior-materials.js?v=1.39.0';
import {modelTools,batchGroup} from './interior-geometry.js?v=1.39.0';
import {houseModelFrame,getHouseFloorPlan} from './house-model.js?v=1.39.0';
import {houseAppearanceLayout} from './house-appearance.js?v=1.39.0';
import {addHouseRenovation,addRenovationGableCladding} from './scene-house-renovation.js?v=1.39.0';
import {addHouseRoof,addHouseEntry} from './scene-house.js?v=1.39.0';
import {applyExteriorSurface} from './exterior-materials.js?v=1.39.0';
import {getDesignStyle} from './design-styles.js?v=1.39.0';
import {toWorldTriangle} from './orientation.js?v=1.39.0';
import {createInteriorTaskLights,setInteriorLampMaterials} from './interior-lighting.js?v=1.39.0';

/** Same architecture/furniture builder as the interior viewer, with all four
 * floors assembled in the site frame. No placeholder furniture or facade holes. */
export function createSharedHouseModel(data,settings,{garageLayout,terrainAt,svgMode=false}={}){
  const root=new THREE.Group();root.name='sternicza-shared-house';
  const frame=houseModelFrame(data,settings),style=getDesignStyle(settings.designStyle),finishes=interiorMaterials(style.id,{svgMode}),tools=modelTools(),models=[];
  const exteriorStyle=settings.styleHouseFinish===false?getDesignStyle('current'):style;
  const material=(color,role,extra={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.85,side:THREE.DoubleSide,...extra});m.userData.transient=true;applyExteriorSurface(m,exteriorStyle,role,{svgMode});return m;};
  const palette={plaster:material(exteriorStyle.palette.houseWall||'#eee9dc','wall'),roof:material(exteriorStyle.palette.houseRoof||'#965c48','roof'),
    brick:material('#87513d','stone'),fascia:material(exteriorStyle.palette.houseFrame||'#654331','frame'),rail:material(exteriorStyle.palette.houseFrame||'#303834','frame'),
    entrance:material('#463226','wood'),frame:material(exteriorStyle.palette.houseFrame||'#f6f3e8','frame')};
  finishes.exteriorWall=palette.plaster;
  const local=new THREE.Group();local.name='registered-house-floors';local.position.set(frame.origin[0],frame.floorZ,frame.origin[1]);local.rotation.y=frame.rotationY;root.add(local);
  // Connections belong to the building, not either adjacent floor. The room
  // context can omit one storey without duplicating or losing its shared stair.
  const stairs=new THREE.Group();stairs.name='shared-house-stairs';stairs.userData.houseStairs=true;local.add(stairs);
  const taskSpecs=[],basementTaskSpecs=[];
  for(const floor of ['basement','ground','first','attic']){
    const plan=getHouseFloorPlan({floor,settings,data});
    // Two main-floor sources and one upstairs reading light serve the entire
    // building. A light is never duplicated per window or furniture piece.
    for(const source of (plan.interiorLights||[]).filter(s=>floor==='ground'?['dining-pendant','lounge-reading-light'].includes(s.id):s.id==='master-reading-light'))taskSpecs.push({...source,elevation:plan.elevation});
    if(floor==='basement')for(const source of plan.interiorLights||[])basementTaskSpecs.push({...source,elevation:plan.elevation});
    // Exterior's engineering garage owns its ramp and vehicles. Retained cellar
    // partitions/cores remain visible because their conflicts are real.
    if(floor==='basement'&&settings.basementGarageEnabled)plan.fixtures=plan.fixtures.filter(f=>f.kind!=='car');
    plan.outdoor=plan.outdoor.filter(p=>p.kind==='landing'&&!settings.basementGarageEnabled);
    const model=buildArchitecture(plan,{showFurniture:true,showCeiling:true,showStairs:false,showOutdoor:true,showExterior:!settings.basementGarageEnabled,hstOpen:settings.hstOpen,balconyOpen:settings.balconyOpen},tools,finishes);
    model.root.name=`shared-house-floor-${floor}`;model.root.userData.houseFloor=floor;
    model.updateVisibility('building',new THREE.Vector3(),{showFurniture:true,showCeiling:true,showStairs:false});
    if(floor==='attic')model.groups.ceiling.visible=false; // Exact shared roof below owns its skin.
    // Outside never needs cutaway alternatives. Remove hidden alternatives,
    // then batch each storey by material while retaining its shared floor tag.
    const hidden=[];model.root.traverse(o=>{if(o!==model.root&&!o.visible)hidden.push(o);});
    for(const o of hidden){o.traverse(child=>child.geometry?.dispose());o.removeFromParent();}
    batchGroup(model.root);
    local.add(model.root);models.push(model);
    for(const flight of plan.stairs.filter(s=>s.kind!=='exterior'&&(s.kind==='hatch'?s.to===floor:s.from===floor))){
      const connection=new THREE.Group();connection.name='shared-stair-'+flight.id;connection.position.y=plan.elevation;
      connection.userData.houseStairConnection={id:flight.id,from:flight.from,to:flight.to,owner:floor,polygon:flight.polygon.map(p=>p.slice())};
      addFlight(connection,flight,plan,tools,finishes.m);batchGroup(connection);stairs.add(connection);
    }
  }
  const taskLighting=createInteriorTaskLights(taskSpecs,style.palette.light,{limit:svgMode?0:3});local.add(taskLighting.root);
  // The occupied basement rooms get two bounded, unshadowed task sources.
  // They retain a daytime minimum because their small cellar windows alone
  // do not illuminate a technical workspace; the upstairs budget is unchanged.
  const basementLighting=createInteriorTaskLights(basementTaskSpecs,style.palette.light,{limit:svgMode?0:2});
  basementLighting.root.name='basement-task-lighting';local.add(basementLighting.root);
  taskLighting.update(0);basementLighting.update(0);setInteriorLampMaterials(finishes,0);
  const layout=houseAppearanceLayout(data,settings,{garageLayout}),roof=layout.roof.envelope;
  const roofGroup=new THREE.Group();roofGroup.name='shared-house-roof';roofGroup.userData.houseRoof=true;root.add(roofGroup);
  const roofEdges=roof.edges.map((edge,i)=>{const a=roof.ring[i],b=roof.ring[(i+1)%roof.ring.length],length=edge.length,direction=[(b[0]-a[0])/length,(b[1]-a[1])/length];
    const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2],center=frame.toSite(5.385,4.5);let outward=[direction[1],-direction[0]];
    if(outward[0]*(mid[0]-center[0])+outward[1]*(mid[1]-center[1])<0)outward=outward.map(v=>-v);
    return{index:i,a,b,length,direction,outward,roofEdge:edge};});
  addHouseRoof(roofGroup,{...layout,edges:roofEdges},palette,svgMode);
  if(roof.gableFaces?.length){
    const skin=roof.gableFaces.map(face=>{const a=face[0],b=face[1],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1;
      return face.map(p=>[p[0]+dy/len*.004,p[1]-dx/len*.004,p[2]]);});
    const g=new THREE.BufferGeometry(),pos=skin.flatMap(face=>toWorldTriangle(...face)).flat();
    g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));const uv=[];for(let i=0;i<pos.length;i+=3)uv.push(pos[i]*.5,pos[i+1]*.5);
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();
    const m=new THREE.Mesh(g,palette.plaster);m.name='shared-house-gables';m.castShadow=true;m.receiveShadow=true;roofGroup.add(m);
  }
  addRenovationGableCladding(roofGroup,roof,layout,exteriorStyle,{svgMode});
  if(settings.basementGarageEnabled)addHouseEntry(root,layout,palette,(x,y)=>terrainAt(x,y,data),{drawDoor:false});
  addHouseRenovation(root,layout,exteriorStyle,{svgMode});
  root.userData.sharedHouse={source:'archived-and-marked-plans',floors:models.length,styleId:style.id,layout:settings.interiorLayout,registration:'street-wall-midpoint-no-scaling'};
  let disposed=false;
  return{root,frame,layout,updateLighting(strength){taskLighting.update(strength);basementLighting.update(strength);setInteriorLampMaterials(finishes,strength);},dispose(){if(disposed)return;disposed=true;taskLighting.dispose();basementLighting.dispose();for(const m of models)m.dispose();
    stairs.traverse(o=>o.geometry?.dispose());stairs.removeFromParent();finishes.dispose();tools.dispose();
    const geometry=new Set(),materials=new Set(Object.values(palette));root.traverse(o=>{if(o.geometry)geometry.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});
    geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());root.removeFromParent();}};
}

/** A separate renderer needs separate GPU resources. Images can be shared;
 * geometry/material/texture objects and shader hooks must not be shared. */
export function cloneOwnedScene(objects,accept=()=>true){
  const geometries=new Map(),materials=new Map(),textures=new Map(),root=new THREE.Group();
  const copyMaterial=m=>{if(materials.has(m))return materials.get(m);const copy=m.clone();materials.set(m,copy);
    // Site-space clipping hooks cannot be reused after the coordinate transform.
    // The interior has its own room lighting; surface/emissive maps are retained.
    for(const key of Object.keys(copy))if(copy[key]?.isTexture){const t=copy[key];if(!textures.has(t)){const c=t.clone();c.needsUpdate=true;textures.set(t,c);}copy[key]=textures.get(t);}
    return copy;};
  const copyObject=o=>{if(!accept(o)||o.isLight||o.isCamera)return null;const copy=o.clone(false);copy.userData={...o.userData};
    if(o.geometry){if(!geometries.has(o.geometry))geometries.set(o.geometry,o.geometry.clone());copy.geometry=geometries.get(o.geometry);}
    if(o.material)copy.material=Array.isArray(o.material)?o.material.map(copyMaterial):copyMaterial(o.material);
    for(const child of o.children){const c=copyObject(child);if(c)copy.add(c);}return copy;};
  for(const o of objects){const c=copyObject(o);if(c)root.add(c);}
  return{root,dispose(){root.removeFromParent();root.traverse(o=>{if(o.isInstancedMesh)o.dispose();});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}};
}
