import * as THREE from '../vendor/three.module.js';
import {toWorld} from './orientation.js?v=1.32.0';
import {gardenGroundAt,terraceGroundReference,jacuzziBounds,spaLevels,pointInPolygon} from './geometry.js?v=1.32.0';
import {gardenFurniture,terraceStairs,boundsOf} from './layout.js?v=1.32.0';
import {gardenProgram,poolBounds} from './garden-program.js?v=1.32.0';
import {pendantLightingLayout} from './pendant-layout.js?v=1.32.0';
import {getResortGardenRecipe} from './resort-garden.js?v=1.32.0';

const point=(x,y,z)=>new THREE.Vector3(...toWorld(x,y,z));
const rectContains=(x,y,r,pad=0)=>r&&x>=r.x-pad&&x<=r.x+r.width+pad&&y>=r.y-pad&&y<=r.y+r.length+pad;

/** A small, bounded collection of proposed fixtures. The shared landscape
 * geometry supplies every position and level; the lights do not move trees,
 * change mapped buildings, or receive geometric screening credit. */
export function createGardenNightLighting(settings,data,{svgMode=false,style=null}={}){
  settings=style?{...settings,designStyle:style.id}:settings;
  const resort=getResortGardenRecipe(settings);
  const group=new THREE.Group();group.name='proposed-garden-night-lighting';
  const fixtures=[],lights=[],emitters=[],haloMaterials=[];
  const materials=new Set(),geometries=new Set();
  const palette=style && style.id!=='current' ? style.palette : null;
  const fixtureForm=palette ? style.recipe.fixture : 'woven';
  const warm=palette?.light??'#ffce86',water='#73d6d0';
  const makeMaterial=(params)=>{const m=new THREE.MeshStandardMaterial(params);m.userData.transient=true;materials.add(m);return m;};
  const body=makeMaterial({color:palette?.frame??'#343d38',roughness:.72,metalness:.3});
  const warmGlow=new THREE.MeshBasicMaterial({color:warm,transparent:true,opacity:0,depthWrite:false,toneMapped:false});
  const waterGlow=new THREE.MeshBasicMaterial({color:water,transparent:true,opacity:0,depthWrite:false,toneMapped:false});
  const pendantGlow=new THREE.MeshBasicMaterial({color:palette?.light??'#ffdb9b',transparent:true,opacity:0,depthWrite:false,toneMapped:false});
  const hedgeGlow=new THREE.MeshBasicMaterial({color:palette?.light??'#ffcd87',transparent:true,opacity:0,depthWrite:false,toneMapped:false});
  const glowChannels=[[warmGlow,'garden'],[waterGlow,'garden'],[pendantGlow,'pendant'],[hedgeGlow,'hedge']];
  for(const [m] of glowChannels){m.userData.transient=true;materials.add(m);}
  const mesh=(geometry,material,name,x,y,z)=>{
    geometries.add(geometry);
    const m=new THREE.Mesh(geometry,material);m.name=name;m.position.copy(point(x,y,z));
    m.receiveShadow=material===body;m.castShadow=false;group.add(m);return m;
  };
  const emitter=(x,y,z,r=.045,color=warmGlow,channel='garden')=>{
    const m=mesh(new THREE.SphereGeometry(r,svgMode?6:10,svgMode?4:6),color,'garden-luminaire-lens',x,y,z);
    emitters.push({mesh:m,channel});return m;
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
  const halo=(x,y,z,color=warm,size=.35,channel='garden')=>{
    if(!haloTexture)return;
    const material=new THREE.SpriteMaterial({map:haloTexture,color,transparent:true,opacity:0,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending});
    material.userData.transient=true;materials.add(material);haloMaterials.push({material,channel});
    const sprite=new THREE.Sprite(material);sprite.name='garden-luminaire-soft-glow';sprite.position.copy(point(x,y,z));sprite.scale.set(size,size,1);group.add(sprite);
  };
  const light=(kind,name,x,y,z,color,intensity,distance,target=null,shadows=false,channel='garden')=>{
    if(svgMode)return;
    const l=kind==='spot'?new THREE.SpotLight(color,intensity,distance,.56,.65,2):new THREE.PointLight(color,intensity,distance,2);
    l.name=name;l.position.copy(point(x,y,z));l.userData.nominalIntensity=intensity;l.userData.nightChannel=channel;l.visible=false;
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
    light('point',`${name}-light`,x,y,z+.43,warm,8.5*(resort?.light[0]??1),resort?3.2:4.6);
    fixtures.push({kind:'shielded-path-light',x,y,z:z+.47});
  };
  const bounds=boundsOf(data.site.boundary),centre=[(bounds.minX+bounds.maxX)/2,(bounds.minY+bounds.maxY)/2];
  const program=gardenProgram(settings,data),pool=poolBounds(settings,data),levels=spaLevels(settings,data),tub=jacuzziBounds(settings,data);
  const obstructed=(x,y)=>!pointInPolygon([x,y],data.site.boundary)||pointInPolygon([x,y],data.site.house.footprint)||
    rectContains(x,y,pool,.32)||rectContains(x,y,program.firepit,.18)||rectContains(x,y,program.coldPlunge,.22)||
    (program.sauna&&pointInPolygon([x,y],program.sauna.footprint));
  // Keep the GPU light budget bounded when experimenting with many specimens.
  // The first three enabled trees receive a real, narrow uplight each.
  for(const [i,tree] of (settings.screeningTrees||[]).filter(t=>t.enabled!==false).slice(0,resort?.treeCount??3).entries()){
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
    light('spot',`tree-uplight-beam-${i+1}`,x,y,z+.21,warm,200*(resort?.light[0]??1),Math.max(12,tree.height+3),target,true);
    fixtures.push({kind:'tree-uplight',treeId:tree.id,x,y,z:z+.21});
  }
  const furniture=gardenFurniture(data,settings);
  for(const [i,[x,y]] of furniture.path.slice(0,3).entries())bollard(`path-bollard-${i+1}`,x-.22,y+.45);
  // Recessed terrace/step strip: it sits below the leading nosing and projects
  // a restrained warm pool onto the first step rather than flooding the plot.
  const terrace=data.site.terrace,rear=data.site.rearMidpoint[1],depth=Number(settings.terraceDepth)||terrace.depth||4.2;
  const {floorZ,drop}=terraceGroundReference(settings,data),stairs=terraceStairs({...terrace,y:rear},depth,drop,settings,data);
  const stripX=stairs.count?stairs.x+stairs.width/2:terrace.x+terrace.width/2,stripWidth=stairs.count?stairs.width*.82:Math.min(3,terrace.width*.6),stripY=rear+depth+.035;
  const strip=mesh(new THREE.BoxGeometry(stripWidth,.025,.035),warmGlow,'terrace-step-led',stripX,stripY,floorZ-.065);emitters.push({mesh:strip,channel:'garden'});
  light('point','terrace-step-light',stripX,stripY+.08,floorZ-.07,warm,17*(resort?.light[0]??1),resort?3.8:5.5);
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
  // The decorative fittings have real frames, cords and open woven shades.
  // Merge each shade's ribs into one mesh rather than multiplying draw calls.
  // Every shade also shows warm transmitted light. Separate materials retain
  // independent dimmers, including in the simplified SVG renderer.
  const shadeEmission=new THREE.Color(palette?.light??'#ffc781');
  const shadeColor=['orb','linen'].includes(fixtureForm) ? palette.fabric : palette?.accent??'#b59969';
  const shadeMaterials=Object.fromEntries(['pendant','hedge'].map(channel=>[channel,
    makeMaterial({color:shadeColor,roughness:palette ? .86 : .92,metalness:0,side:THREE.DoubleSide,emissiveIntensity:0})]));
  const cordMaterial=makeMaterial({color:palette?.frame??'#3d4034',roughness:.9,metalness:.1});
  const join=(a,b,radius,material,name)=>{
    const start=point(...a),end=point(...b),length=start.distanceTo(end);
    if(length<.002)return;
    const cylinder=mesh(new THREE.CylinderGeometry(radius,radius,length,svgMode?5:8),material,name,0,0,0);
    cylinder.position.copy(start).add(end).multiplyScalar(.5);
    cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.sub(start).normalize());
    return cylinder;
  };
  const wovenShade=(radius,height)=>{
    const pieces=[],positions=[],normals=[];
    const outline=t=>radius*(.43+.57*Math.sin(Math.PI*(.17+.83*t)));
    const ribs=svgMode?8:12;
    for(let i=0;i<ribs;i++){
      const angle=i*Math.PI*2/ribs,points=[];
      for(let k=0;k<=8;k++){
        const t=k/8,r=outline(t);
        points.push(new THREE.Vector3(r*Math.cos(angle),height*(.5-t),r*Math.sin(angle)));
      }
      pieces.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),svgMode?6:10,.009,svgMode?3:4,false));
    }
    for(let k=0;k<=5;k++){
      const t=k/5,ring=new THREE.TorusGeometry(outline(t),.007,3,svgMode?12:20);
      ring.rotateX(Math.PI/2);ring.translate(0,height*(.5-t),0);pieces.push(ring);
    }
    for(const part of pieces){
      const geometry=part.index?part.toNonIndexed():part;
      positions.push(...geometry.attributes.position.array);normals.push(...geometry.attributes.normal.array);
      if(geometry!==part)geometry.dispose();part.dispose();
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    return geometry;
  };
  // All fittings share the existing mount, drop limits and electrical channels.
  // Cache per group so equal hedge lights share a finished geometry, including
  // the more detailed open weave. No fixture dimensions leak across properties.
  const shadeCache=new Map();
  const shadeGeometry=(radius,height)=>{
    const key=radius+'/'+height;
    if(shadeCache.has(key))return shadeCache.get(key);
    const geometry=fixtureForm==='woven' ? wovenShade(radius,height)
      : createFormedShade(fixtureForm,radius,height,svgMode);
    shadeCache.set(key,geometry);
    return geometry;
  };
  const pendantLayout=pendantLightingLayout(settings,data);
  for(const support of pendantLayout.supports){
    join([support.x,support.y,support.baseZ],[support.x,support.y,support.topZ],support.zone==='garden'?.026:.018,body,`${support.id}-post`);
    mesh(new THREE.CylinderGeometry(.075,.085,.045,8),body,`${support.id}-foot`,support.x,support.y,support.baseZ+.0225);
  }
  for(const cable of pendantLayout.cables){
    for(let i=1;i<cable.points.length;i++)join(cable.points[i-1],cable.points[i],cable.kind==='arm'?.012:.006,cordMaterial,cable.id);
  }
  // Every inner-hedge lantern must illuminate nearby foliage and ground, not
  // just its own lens. Layout caps the hedge at 24 fixtures: with three dining
  // and at most twelve landscape lights, the scene remains bounded at 39.
  // These short-range hedge sources do not add shadow maps.
  for(const [channel,lanterns,glow,color] of [['pendant',pendantLayout.garden,pendantGlow,palette?.light??'#ffda9b'],['hedge',pendantLayout.hedge,hedgeGlow,palette?.light??'#ffcb84']]){
    for(const fixture of lanterns){
      const {x,y,z,radius,height,hangZ}=fixture;
      join([x,y,hangZ],[x,y,z+height*.5],.006,cordMaterial,`${fixture.id}-drop`);
      const shade=mesh(shadeGeometry(radius,height),shadeMaterials[channel],`${fixture.id}-${fixtureForm}-shade`,x,y,z);
      shade.userData.fixtureForm=fixtureForm;
      mesh(new THREE.CylinderGeometry(.035,.045,.055,8),body,`${fixture.id}-socket`,x,y,z+height*.35);
      const diffuser=emitter(x,y,z-height*.1,radius*.61,glow,channel);
      diffuser.name=`${fixture.id}-glowing-core`;diffuser.scale.y=height/(radius*1.8);
      halo(x,y,z-height*.1,color,channel==='pendant'?radius*2.5:resort?.42:.60,channel);
      if(channel==='pendant'){
        const pendantLight=light('spot',`${fixture.id}-light`,x,y,z-height*.2,color,40*(resort?.light[1]??1),resort?4.4:5.5,[x,y,fixture.groundZ],false,channel);
        if(pendantLight){pendantLight.angle=resort?.86:1.02;pendantLight.penumbra=.75;}
      }else light('point',`${fixture.id}-light`,x,y,z-height*.1,color,72*(resort?.light[2]??1),resort?3.8:6,null,false,channel);
      fixtures.push({...fixture,kind:channel==='pendant'?'garden-pendant':'hedge-pendant',channel});
    }
  }
  group.userData.fixtureSchedule=fixtures;
  group.userData.pendantLayout=pendantLayout;
  group.userData.resortLightRecipe=resort;
  let applied={garden:-1,pendant:-1,hedge:-1};
  const bounded=value=>Math.max(0,Math.min(1,Number.isFinite(value)?value:0));
  const apply=(strength)=>{
    const values=typeof strength==='number'?{garden:bounded(strength),pendant:bounded(strength),hedge:bounded(strength)}:
      {garden:bounded(strength?.gardenStrength),pendant:bounded(strength?.pendantStrength),hedge:bounded(strength?.hedgeStrength)};
    const changed=Object.keys(values).some(key=>Math.abs(values[key]-applied[key])>.0001);applied=values;
    for(const l of lights){const value=values[l.userData.nightChannel];l.visible=value>.001;l.intensity=l.userData.nominalIntensity*value;}
    for(const [m,channel] of glowChannels)m.opacity=Math.min(1,values[channel]*1.5);
    for(const {material,channel} of haloMaterials)material.opacity=values[channel]*(channel==='hedge'?.85:.65);
    for(const [channel,material] of Object.entries(shadeMaterials)){
      material.emissiveIntensity=values[channel]*.45;
      // SVGRenderer adds emissive directly and does not apply its intensity.
      material.emissive.copy(shadeEmission).multiplyScalar(svgMode?material.emissiveIntensity:1);
    }
    for(const {mesh,channel} of emitters)mesh.visible=values[channel]>.001;
    return changed;
  };
  apply(0);
  // Called before the parent rebuild clears this group. Scene final teardown
  // also calls it, so shadow targets and procedural textures never accumulate.
  const dispose=()=>{for(const l of lights)l.shadow?.dispose();haloTexture?.dispose();};
  return {group,apply,dispose,fixtures,lightCount:lights.length};
}


// Radial profile coordinates are fractions of each existing lantern's radius
// and height. Open lower rims expose the original dimmable lens. The angular
// lantern uses four sides; the other fittings read as spun or moulded forms.
function createFormedShade(form,radius,height,svgMode){
  const profiles={
    linen:[[.84,.49],[.86,.45],[.90,-.41],[.88,-.46]],
    saucer:[[.15,.49],[.32,.27],[1,.08],[.97,.01],[.34,.08]],
    tube:[[.22,.49],[.44,.43],[.44,-.29],[.40,-.33]],
    lantern:[[.10,.49],[.88,.30],[.87,.21],[.72,-.33],[.54,-.45]],
    oval:[[.13,.49],[.50,.42],[.82,.21],[.91,0],[.80,-.22],[.49,-.41],[.30,-.44]],
    orb:[[.18,.49],[.57,.40],[.86,.23],[.96,0],[.83,-.25],[.53,-.42],[.27,-.48]],
    bell:[[.15,.49],[.39,.40],[.60,.21],[.73,-.06],[.91,-.22],[.97,-.24]],
    tiered:[[.12,.49],[.43,.37],[.49,.32],[.30,.28],[.68,.18],[.69,.13],[.40,.10],[.92,-.04],[.95,-.10]],
  };
  const profile=(profiles[form]??profiles.bell).map(([r,z])=>new THREE.Vector2(r*radius,z*height));
  const radialSegments=form==='lantern'?4:svgMode?12:24;
  const shape=new THREE.LatheGeometry(profile,radialSegments);
  if(form!=='lantern'&&form!=='oval')return shape;
  // Leave the lantern panels and alternate oval flutes open. The remaining
  // ribs and closed top/bottom bands can transmit the independently dimmed core.
  const original=shape.index.array,indices=[];
  for(let side=0;side<radialSegments;side++)for(let row=0;row<profile.length-1;row++){
    if(row===0||row===profile.length-2||form==='oval'&&side%2===0){
      const i=(side*(profile.length-1)+row)*6;
      for(let k=0;k<6;k++)indices.push(original[i+k]);
    }
  }
  if(form==='lantern'){
    // Keep four slender corner stiles linking cap and lower rim.
    const lo=profile[profile.length-2],hi=profile[2];
    const positions=[],normals=[];
    shape.setIndex(indices);
    const bands=shape.toNonIndexed();shape.dispose();
    positions.push(...bands.attributes.position.array);normals.push(...bands.attributes.normal.array);bands.dispose();
    for(let i=0;i<4;i++){
      const a=i*Math.PI/2,lower=new THREE.Vector3(Math.sin(a)*lo.x,lo.y,Math.cos(a)*lo.x);
      const upper=new THREE.Vector3(Math.sin(a)*hi.x,hi.y,Math.cos(a)*hi.x);
      const direction=upper.clone().sub(lower),length=direction.length();
      const rail=new THREE.CylinderGeometry(.009,.009,length,4);
      rail.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize()));
      const midpoint=lower.add(upper).multiplyScalar(.5);
      rail.translate(midpoint.x,midpoint.y,midpoint.z);
      const flat=rail.toNonIndexed();rail.dispose();
      positions.push(...flat.attributes.position.array);normals.push(...flat.attributes.normal.array);flat.dispose();
    }
    const frame=new THREE.BufferGeometry();
    frame.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    frame.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    return frame;
  }
  shape.setIndex(indices);
  return shape;
}
