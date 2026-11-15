import * as THREE from '../vendor/three.module.js';
import {toWorld} from './orientation.js?v=1.17.0';
import {gardenGroundAt,terraceGroundReference,jacuzziBounds,spaLevels,pointInPolygon} from './geometry.js?v=1.17.0';
import {gardenFurniture,terraceStairs,boundsOf} from './layout.js?v=1.17.0';
import {gardenProgram,poolBounds} from './garden-program.js?v=1.17.0';

const point=(x,y,z)=>new THREE.Vector3(...toWorld(x,y,z));
const rectContains=(x,y,r,pad=0)=>r&&x>=r.x-pad&&x<=r.x+r.width+pad&&y>=r.y-pad&&y<=r.y+r.length+pad;

/** A small, bounded collection of proposed fixtures. The shared landscape
 * geometry supplies every position and level; the lights do not move trees,
 * change mapped buildings, or receive geometric screening credit. */
export function createGardenNightLighting(settings,data,{svgMode=false}={}){
  const group=new THREE.Group();group.name='proposed-garden-night-lighting';
  const fixtures=[],lights=[],emitters=[],haloMaterials=[];
  const materials=new Set(),geometries=new Set();
  const warm='#ffce86',water='#73d6d0';
  const makeMaterial=(params)=>{const m=new THREE.MeshStandardMaterial(params);m.userData.transient=true;materials.add(m);return m;};
  const body=makeMaterial({color:'#343d38',roughness:.72,metalness:.3});
  const warmGlow=new THREE.MeshBasicMaterial({color:warm,transparent:true,opacity:0,depthWrite:false,toneMapped:false});
  const waterGlow=new THREE.MeshBasicMaterial({color:water,transparent:true,opacity:0,depthWrite:false,toneMapped:false});
  for(const m of [warmGlow,waterGlow]){m.userData.transient=true;materials.add(m);}
  const mesh=(geometry,material,name,x,y,z)=>{
    geometries.add(geometry);
    const m=new THREE.Mesh(geometry,material);m.name=name;m.position.copy(point(x,y,z));
    m.receiveShadow=material===body;m.castShadow=false;group.add(m);return m;
  };
  const emitter=(x,y,z,r=.045,color=warmGlow)=>{
    const m=mesh(new THREE.SphereGeometry(r,svgMode?6:10,svgMode?4:6),color,'garden-luminaire-lens',x,y,z);
    emitters.push(m);return m;
  };
  // Small soft lens halos give legible luminaires without a full-screen bloom
  // pass. Surface illumination still comes from the finite real Three lights.
  let haloTexture=null;
  if(!svgMode){
    const size=32,pixels=new Uint8Array(size*size*4);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const r=Math.hypot((x+.5-size/2)/(size/2),(y+.5-size/2)/(size/2));
      const i=(y*size+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=255;pixels[i+3]=Math.round(255*Math.max(0,1-r)**3);
    }
    haloTexture=new THREE.DataTexture(pixels,size,size,THREE.RGBAFormat);haloTexture.needsUpdate=true;
  }
  const halo=(x,y,z,color=warm,size=.35)=>{
    if(!haloTexture)return;
    const material=new THREE.SpriteMaterial({map:haloTexture,color,transparent:true,opacity:0,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending});
    material.userData.transient=true;materials.add(material);haloMaterials.push(material);
    const sprite=new THREE.Sprite(material);sprite.name='garden-luminaire-soft-glow';sprite.position.copy(point(x,y,z));sprite.scale.set(size,size,1);group.add(sprite);
  };
  const light=(kind,name,x,y,z,color,intensity,distance,target=null,shadows=false)=>{
    if(svgMode)return;
    const l=kind==='spot'?new THREE.SpotLight(color,intensity,distance,.56,.65,2):new THREE.PointLight(color,intensity,distance,2);
    l.name=name;l.position.copy(point(x,y,z));l.userData.nominalIntensity=intensity;l.visible=false;
    if(target){l.target.position.copy(point(...target));group.add(l.target);}
    if(shadows){l.castShadow=true;l.shadow.mapSize.set(512,512);l.shadow.camera.near=.12;l.shadow.camera.far=distance;l.shadow.bias=-.0001;l.shadow.normalBias=.045;}
    lights.push(l);group.add(l);return l;
  };
  const bollard=(name,x,y)=>{
    if(!pointInPolygon([x,y],data.site.boundary))return;
    const z=gardenGroundAt(x,y,settings,data);
    mesh(new THREE.CylinderGeometry(.055,.065,.47,8),body,name,x,y,z+.235);
    mesh(new THREE.CylinderGeometry(.12,.12,.045,12),body,`${name}-shield`,x,y,z+.48);
    emitter(x,y,z+.435,.055);halo(x,y,z+.435,warm,.28);
    light('point',`${name}-light`,x,y,z+.43,warm,8.5,4.6);
    fixtures.push({kind:'shielded-path-light',x,y,z:z+.47});
  };
  const bounds=boundsOf(data.site.boundary),centre=[(bounds.minX+bounds.maxX)/2,(bounds.minY+bounds.maxY)/2];
  const program=gardenProgram(settings,data),pool=poolBounds(settings,data),levels=spaLevels(settings,data),tub=jacuzziBounds(settings,data);
  const obstructed=(x,y)=>!pointInPolygon([x,y],data.site.boundary)||pointInPolygon([x,y],data.site.house.footprint)||
    rectContains(x,y,pool,.32)||rectContains(x,y,program.firepit,.18)||rectContains(x,y,program.coldPlunge,.22)||
    (program.sauna&&pointInPolygon([x,y],program.sauna.footprint));
  // Keep the GPU light budget bounded when experimenting with many specimens.
  // The first three enabled trees receive a real, narrow uplight each.
  for(const [i,tree] of (settings.screeningTrees||[]).filter(t=>t.enabled!==false).slice(0,3).entries()){
    const angle=Math.atan2(centre[1]-tree.y,centre[0]-tree.x),distance=Math.min(1.5,Math.max(.8,tree.crownWidth*.35));
    let position=null;
    for(const turn of [0,.5,-.5,1,-1,Math.PI]){
      const x=tree.x+Math.cos(angle+turn)*distance,y=tree.y+Math.sin(angle+turn)*distance;
      if(!obstructed(x,y)){position=[x,y];break;}
    }
    if(!position)continue;
    const [x,y]=position,z=gardenGroundAt(x,y,settings,data),treeZ=gardenGroundAt(tree.x,tree.y,settings,data);
    const fixture=mesh(new THREE.CylinderGeometry(.085,.085,.15,12),body,`tree-uplight-${i+1}`,x,y,z+.13);
    const target=[tree.x,tree.y,treeZ+Math.max(2,tree.height*.63)];
    fixture.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),point(...target).sub(fixture.position).normalize());
    emitter(x,y,z+.205,.065);halo(x,y,z+.205,warm,.32);
    light('spot',`tree-uplight-beam-${i+1}`,x,y,z+.21,warm,200,Math.max(12,tree.height+3),target,true);
    fixtures.push({kind:'tree-uplight',treeId:tree.id,x,y,z:z+.21});
  }
  const furniture=gardenFurniture(data,settings);
  for(const [i,[x,y]] of furniture.path.slice(0,3).entries())bollard(`path-bollard-${i+1}`,x-.22,y+.45);
  // Recessed terrace/step strip: it sits below the leading nosing and projects
  // a restrained warm pool onto the first step rather than flooding the plot.
  const terrace=data.site.terrace,rear=data.site.rearMidpoint[1],depth=Number(settings.terraceDepth)||terrace.depth||4.2;
  const {floorZ,drop}=terraceGroundReference(settings,data),stairs=terraceStairs({...terrace,y:rear},depth,drop,settings,data);
  const stripX=stairs.count?stairs.x+stairs.width/2:terrace.x+terrace.width/2,stripWidth=stairs.count?stairs.width*.82:Math.min(3,terrace.width*.6),stripY=rear+depth+.035;
  const strip=mesh(new THREE.BoxGeometry(stripWidth,.025,.035),warmGlow,'terrace-step-led',stripX,stripY,floorZ-.065);emitters.push(strip);
  light('point','terrace-step-light',stripX,stripY+.08,floorZ-.07,warm,17,5.5);
  fixtures.push({kind:'terrace-step-strip',x:stripX,y:stripY,z:floorZ-.065});
  // Wall-mounted submerged pool points. Their colour washes the basin and
  // water materials; they are visual proposals, not product photometry.
  if(pool){
    for(const fraction of [.25,.75]){
      const x=pool.x+.08,y=pool.y+pool.length*fraction,z=levels.pool.waterZ-.22;
      emitter(x,y,z,.065,waterGlow);halo(x,y,z,water,.4);light('point','pool-underwater-light',x+.12,y,z,water,12,4.1);
      fixtures.push({kind:'pool-light',x,y,z});
    }
  }
  const tubX=(tub.x0+tub.x1)/2,tubY=(tub.y0+tub.y1)/2;
  light('point','jacuzzi-underwater-light',tubX,tubY,tub.waterZ-.2,water,5.5,2.7);
  emitter(tub.x0+.15,tubY,tub.waterZ-.12,.05,waterGlow);
  fixtures.push({kind:'jacuzzi-light',x:tubX,y:tubY,z:tub.waterZ-.2});
  if(program.active){
    const sauna=program.sauna;
    light('point','sauna-interior-light',sauna.x+sauna.width*.45,sauna.y+sauna.length*.48,levels.sauna.floorZ+1.35,'#ffbb6b',12,4.2);
    fixtures.push({kind:'sauna-light',x:sauna.x+sauna.width*.45,y:sauna.y+sauna.length*.48,z:levels.sauna.floorZ+1.35});
    // A steady ember glow, without inventing an animated fire or smoke model.
    const pit=program.firepit;
    light('point','fire-lounge-ember-glow',pit.x+pit.width/2,pit.y+pit.length*.57,levels.firepit.floorZ+.49,'#ff943f',8,3.4);
    fixtures.push({kind:'fire-lounge-glow',x:pit.x+pit.width/2,y:pit.y+pit.length*.57,z:levels.firepit.floorZ+.49});
  }
  group.userData.fixtureSchedule=fixtures;
  let applied=-1;
  const apply=(strength)=>{
    const value=Math.max(0,Math.min(1,Number.isFinite(strength)?strength:0)),changed=Math.abs(value-applied)>.0001;applied=value;
    for(const l of lights){l.visible=value>.001;l.intensity=l.userData.nominalIntensity*value;}
    for(const m of [warmGlow,waterGlow])m.opacity=Math.min(1,value*1.5);
    for(const m of haloMaterials)m.opacity=value*.65;
    for(const m of emitters)m.visible=value>.001;
    return changed;
  };
  apply(0);
  // Called before the parent rebuild clears this group. Scene final teardown
  // also calls it, so shadow targets and procedural textures never accumulate.
  const dispose=()=>{for(const l of lights)l.shadow?.dispose();haloTexture?.dispose();};
  return {group,apply,dispose,fixtures,lightCount:lights.length};
}
