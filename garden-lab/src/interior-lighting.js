import * as THREE from '../vendor/three.module.js';

// Keep a fixed, small light budget in both renderers. These nearby emitters
// have a bounded falloff; no extra shadow-map passes are required.
export function createInteriorTaskLights(specs,color,{limit=3}={}){
  const root=new THREE.Group();root.name='interior-task-lighting';
  const lamps=specs.slice(0,Math.max(0,Math.min(3,limit))).map(spec=>{
    const light=new THREE.PointLight(color,0,spec.distance,2);light.name='task-light-'+spec.id;
    light.position.set(spec.x,spec.height+(spec.elevation||0),spec.z);light.castShadow=false;
    light.userData.taskIntensity=spec.intensity;
    light.userData.minStrength=Math.max(0,Math.min(1,Number(spec.minStrength)||0));root.add(light);return light;
  });
  return {root,update(strength){const factor=Math.max(0,Math.min(1,Number.isFinite(strength)?strength:0));
    for(const light of lamps)light.intensity=light.userData.taskIntensity*Math.max(factor,light.userData.minStrength);
    root.visible=lamps.some(light=>light.intensity>.001);
  },get count(){return lamps.length;},dispose(){root.removeFromParent();root.clear();}};
}

export function setInteriorLampMaterials(finishes,strength){
  if(finishes.style?.id==='current')return;
  const factor=Math.max(0,Math.min(1,Number.isFinite(strength)?strength:0));
  if(finishes.m.glow)finishes.m.glow.emissiveIntensity=.025+factor*.90;
  if(finishes.m.lampShade)finishes.m.lampShade.emissiveIntensity=.01+factor*.20;
  if(finishes.m.spaGlow)finishes.m.spaGlow.emissiveIntensity=factor*.70;
}
