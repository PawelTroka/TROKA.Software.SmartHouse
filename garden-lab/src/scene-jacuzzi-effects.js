import * as THREE from '../vendor/three.module.js';
import {toWorld} from './orientation.js?v=1.34.0';

export const JACUZZI_MOODS=Object.freeze({lagoon:'#53c9bd',amber:'#f0bb76',aurora:'#7fb9dd'});

/** Subtle underwater LEDs, rising bubbles and expanding jet ripples. All
 * motion uses the scene clock, so tab visibility and reduced motion apply. */
export function createJacuzziEffects(tub,{svgMode=false,mood='aurora'}={}){
  const group=new THREE.Group();group.name='terrace-jacuzzi-atmosphere';
  const finish=new THREE.MeshStandardMaterial({color:'#d8e6dd',emissive:JACUZZI_MOODS[mood]||JACUZZI_MOODS.aurora,
    emissiveIntensity:0,roughness:.24,metalness:.08});finish.userData.transient=true;
  const w=tub.waterBounds,z=tub.waterZ,mid=[(w.x0+w.x1)/2,(w.y0+w.y1)/2];
  for(const [x,y,width,length] of [[w.x0+.06,w.y0+.06,w.x1-w.x0-.12,.016],
    [w.x0+.06,w.y1-.076,w.x1-w.x0-.12,.016],[w.x0+.06,w.y0+.06,.016,w.y1-w.y0-.12],
    [w.x1-.076,w.y0+.06,.016,w.y1-w.y0-.12]]){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,.016,length),finish);
    mesh.position.set(...toWorld(x+width/2,y+length/2,z-.10));mesh.name='recessed-spa-led';group.add(mesh);
  }
  const light=svgMode?null:new THREE.PointLight(finish.emissive,0,2.5,2);
  if(light){light.position.set(...toWorld(...mid,z-.16));group.add(light);}
  let bubbles=null;const ripples=[],dummy=new THREE.Object3D();
  if(!svgMode){
    const bubbleMaterial=new THREE.MeshPhysicalMaterial({color:'#d0ede5',transparent:true,opacity:.30,
      roughness:.12,metalness:0,depthWrite:false});bubbleMaterial.userData.transient=true;
    bubbles=new THREE.InstancedMesh(new THREE.SphereGeometry(1,6,4),bubbleMaterial,32);
    bubbles.name='hydromassage-bubbles';bubbles.frustumCulled=false;group.add(bubbles);
    for(let i=0;i<4;i++){
      const material=new THREE.MeshBasicMaterial({color:'#e3f6ed',transparent:true,opacity:.16,depthWrite:false,
        side:THREE.DoubleSide});material.userData.transient=true;
      const mesh=new THREE.Mesh(new THREE.RingGeometry(.22,.228,36),material);
      mesh.rotation.x=-Math.PI/2;mesh.name='jet-water-ripple';group.add(mesh);ripples.push(mesh);
    }
  }
  function update(time=0,nightStrength=0,animate=false){
    const t=animate?time:0,color=new THREE.Color(JACUZZI_MOODS[mood]||JACUZZI_MOODS.aurora);
    if(mood==='aurora')color.setHSL(.48+.10*(.5+.5*Math.sin(t*.075)),.42,.62);
    finish.emissive.copy(color);finish.emissiveIntensity=nightStrength*(.65+(animate?.08*Math.sin(t*.8):0));
    if(light){light.color.copy(color);light.intensity=nightStrength*2.4;}
    if(bubbles){
      for(let i=0;i<bubbles.count;i++){
        const phase=(t*.38+i*.137)%1,side=i%4,along=.18+((i*7)%17)/17*.64;
        const inset=.16+.07*Math.sin(phase*Math.PI);
        const x=side===0?w.x0+inset:side===1?w.x1-inset:w.x0+along*(w.x1-w.x0);
        const y=side===2?w.y0+inset:side===3?w.y1-inset:w.y0+along*(w.y1-w.y0);
        dummy.position.set(...toWorld(x,y,z-.27+phase*.30));
        dummy.scale.setScalar(.008+.006*phase);dummy.updateMatrix();bubbles.setMatrixAt(i,dummy.matrix);
      }
      bubbles.instanceMatrix.needsUpdate=true;
      ripples.forEach((mesh,i)=>{
        const phase=(t*.32+i*.25)%1;
        mesh.position.set(...toWorld(mid[0]+(i%2?1:-1)*.38,mid[1]+(i<2?1:-1)*.34,z+.004));
        mesh.scale.setScalar(.30+phase*1.45);mesh.material.opacity=.13*(1-phase);
      });
    }
  }
  update();group.userData={purpose:'centerpiece-hydromassage',mood,animated:!svgMode};
  return {group,update};
}
