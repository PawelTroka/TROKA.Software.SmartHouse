import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {createStateModel} from '../src/state.js';
import {getSiteProfile} from '../src/sites.js';
import {getDesignStyle} from '../src/design-styles.js';
import {houseAppearanceLayout} from '../src/house-appearance.js';
import {houseRenovationParts,houseGableRenovation} from '../src/house-renovation.js';
import {addHouseRenovation,addRenovationGableCladding} from '../src/scene-house-renovation.js';
import {pendantLightingLayout} from '../src/pendant-layout.js';
import {createGardenNightLighting} from '../src/scene-night-lights.js';
import {nightLightingState,NIGHT_DEFAULTS} from '../src/night-lighting.js';
import {gardenFurniture} from '../src/layout.js';
import {MATERIAL_ASSETS,projectArchitecturalMaterialUVs} from '../src/material-assets.js';
import {applyPlanExterior} from '../src/plan-exterior.js';
import {photoRoofEdgeHeight} from '../src/house-roof.js';
import {getMaterialForFinish} from '../src/material-catalogue.js';
import {exteriorFinishForRole} from '../src/exterior-materials.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const defaults=createStateModel(getSiteProfile('sternicza-11',data)).DEFAULTS;
const segmentDistance=(p,a,b)=>{
  const dx=b[0]-a[0],dy=b[1]-a[1],len=dx*dx+dy*dy;
  const t=len?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/len)):0;
  return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dy*t);
};

test('historical non-summer garden pendant strings sag between real supports, clear the walking corridor and retain headroom',()=>{
  for(const designStyle of ['current','hidden-bali','beach-house','organic-modern']){
    const settings={...defaults,designStyle,summerPoolLayout:false},layout=pendantLightingLayout(settings,data);
    const strings=layout.cables.filter(c=>c.kind==='festoon'),path=gardenFurniture(data,settings).path;
    assert.ok(strings.length>=1&&strings.length<=2,designStyle+' receives a bounded path-lighting proposal');
    const supports=new Map(layout.supports.map(s=>[s.id,s]));
    for(const cable of strings){
      assert.equal(cable.supportIds.length,2);
      const [a,b]=cable.supportIds.map(id=>supports.get(id));
      assert.ok(a&&b);
      assert.deepEqual(cable.points[0],[a.x,a.y,a.topZ]);
      assert.deepEqual(cable.points.at(-1),[b.x,b.y,b.topZ]);
      assert.ok(cable.points[Math.floor(cable.points.length/2)][2]<Math.min(a.topZ,b.topZ)-.15,'Suspension has visible natural sag');
      for(const support of [a,b])for(let i=1;i<path.length;i++)assert.ok(segmentDistance([support.x,support.y],path[i-1],path[i])>=.62-1e-8,'Support stands outside the walking corridor');
    }
    for(const f of layout.garden.filter(f=>f.zone==='path')){
      assert.ok(f.z-f.height/2-f.groundZ>2.25,'Pendant keeps comfortable walking headroom');
      assert.ok(f.hangZ>f.z+f.height/2,'Visible positive pendant cord');
    }
    assert.ok(layout.hedge.length<=8,'A quiet edge replaces a row of bright perimeter lamps');
  }
});

test('warm shaded route lamps and lower perimeter lighting preserve independent dimmers',()=>{
  for(const summerPoolLayout of [false,true]){
  const settings={...defaults,designStyle:'hidden-bali',summerPoolLayout};
  const lighting=createGardenNightLighting(settings,data,{style:getDesignStyle('hidden-bali')});
  try{
    assert.equal(lighting.group.userData.lightingIntent.temperatureK,2400);
    lighting.apply(nightLightingState({enabled:true,elevation:-12},{...defaults,...NIGHT_DEFAULTS}));
    const lights=[];lighting.group.traverse(o=>{if(o.isLight)lights.push(o);});
    assert.ok(lights.length<=(summerPoolLayout?31:39));
    for(const light of lights.filter(l=>l.userData.nightChannel==='hedge'))assert.ok(light.intensity<=14*.3);
    for(const f of lighting.fixtures.filter(f=>f.zone==='path')){
      const light=lighting.group.getObjectByName(f.id+'-light');
      assert.ok(light.isSpotLight&&light.penumbra>=.9,'Shaded source gives a soft transition');
      assert.ok(light.color.r>light.color.g&&light.color.g>light.color.b);
      const bulb=lighting.group.getObjectByName(f.id+'-glowing-core');
      assert.ok(bulb.geometry.parameters.radius<=.042,'Small bulb, not a shade-sized luminous sphere');
    }
    const route=lighting.fixtures.filter(f=>f.id?.startsWith('garden-route-light-'));
    if(summerPoolLayout){
      const network=gardenFurniture(data,settings).pathNetwork;
      assert.equal(route.length,6);assert.equal(new Set(route.map(f=>f.destination)).size,6);
      assert.ok(route.every(f=>f.destination!=='dining'),'No route fixture remains at the removed dining area');
      assert.deepEqual(route.map(f=>f.id),network.lights.map(f=>f.id));
      assert.equal(lighting.fixtures.filter(f=>f.zone==='path').length,0,'The connected route uses shielded downlights');
      for(const f of route){
        const light=lighting.group.getObjectByName(f.id+'-downlight'),lens=lighting.group.getObjectByName(f.id+'-recessed-lens');
        assert.ok(light.isSpotLight&&light.penumbra>=.9);assert.equal(light.castShadow,false);
        assert.equal(light.userData.nightChannel,'garden');assert.ok(lens.geometry.parameters.radiusTop<=.07);
      }
    }else assert.ok(lighting.fixtures.some(f=>f.zone==='path'),'Historical pendant lighting is still exercised');
    lighting.apply({gardenStrength:0,pendantStrength:.5,hedgeStrength:0});
    assert.ok(lights.every(l=>l.visible===(l.userData.nightChannel==='pendant')));
    lighting.apply({gardenStrength:.5,pendantStrength:0,hedgeStrength:0});
    assert.ok(lights.every(l=>l.visible===(l.userData.nightChannel==='garden')));
  }finally{lighting.dispose();}}
});

test('natural facade photographs are tinted once, cast relief shadows and keep vertical member grain',()=>{
  const style=getDesignStyle('hidden-bali'),layout=houseAppearanceLayout(data,defaults);
  const parts=houseRenovationParts(layout,style),mesh=addHouseRenovation(new THREE.Group(),layout,style);
  try{
    assert.ok(mesh.castShadow&&mesh.receiveShadow);
    assert.equal(mesh.geometry.userData.architecturalMetricUVs,true);
    const color=mesh.geometry.attributes.color;
    for(let i=0;i<color.count;i++){
      assert.equal(color.getX(i),color.getY(i));assert.equal(color.getY(i),color.getZ(i));
      assert.ok(color.getX(i)>.85,'Vertex colours contain only unit variation, never another brown/blue pigment');
    }
    const finishes=[...new Set(parts.map(p=>p.finish))],ordered=finishes.flatMap(finish=>parts.filter(p=>p.finish===finish));
    const i=ordered.findIndex(p=>p.kind==='battens'),part=ordered[i],uv=mesh.geometry.attributes.uv,pos=mesh.geometry.attributes.position;
    assert.ok(i>=0&&part.depth>=.13,'Bali battens have a pronounced physical relief');
    for(let k=i*54;k<i*54+6;k++)assert.ok(Math.abs(uv.getX(k)-pos.getY(k)-part.uvOffset[0])<1e-5,'Teak U grain follows the vertical batten');
    const phases=new Set(parts.filter(p=>p.kind==='battens').map(p=>p.uvOffset.join(',')));
    assert.ok(phases.size>20,'Adjacent physical timbers do not repeat the same photograph crop');
  }finally{mesh.geometry.dispose();mesh.material.forEach(m=>m.dispose());}
});

test('Nordic Blackwood carries charcoal boards over the eaves and gables while retaining cedar reveals',()=>{
  const style=getDesignStyle('nordic-blackwood'),settings={...defaults,designStyle:style.id,styleHouseFinish:true};
  const layout=houseAppearanceLayout(applyPlanExterior(data,settings),settings),roof=layout.roof.envelope;
  const parts=houseRenovationParts(layout,style),gable=houseGableRenovation(roof,layout,style);
  for(const [label,selection]of [
    ['wall boards',parts.filter(p=>p.kind==='boards')],
    ['eaves',parts.filter(p=>p.kind==='eaves-finish')],
    ['gable boards',gable.parts.filter(p=>p.kind==='boards')],
  ]){
    assert.ok(selection.length>0,label);
    assert.ok(selection.every(p=>p.finish==='houseWall'),label+' must use the charcoal wall finish');
  }
  const reveals=parts.filter(p=>p.kind==='architectural-reveal');
  assert.ok(reveals.length>0&&reveals.every(p=>p.finish==='wood'));
  assert.equal(exteriorFinishForRole(style,'houseWall'),'charred-wood');
  assert.equal(exteriorFinishForRole(style,'wood'),'cedar','Reveals and furniture keep natural warm cedar');
  for(const [mesh,source,edges]of [
    [addHouseRenovation(new THREE.Group(),layout,style),parts,layout.edges],
    [addRenovationGableCladding(new THREE.Group(),roof,layout,style),gable.parts,gable.edges],
  ])try{
    const charred=mesh.material.find(m=>m.userData.exteriorRole==='houseWall');
    assert.equal(charred.userData.exteriorFinish,'charred-wood');
    assert.equal(charred.color.getHex(),new THREE.Color(style.palette.houseWall).getHex());
    assert.equal(charred.userData.woodGrainAxis,'v');
    const ordered=[...new Set(source.map(p=>p.finish))].flatMap(finish=>source.filter(p=>p.finish===finish));
    const {position,uv}=mesh.geometry.attributes;
    for(const kind of ['boards','eaves-finish']){
      const i=ordered.findIndex(p=>p.kind===kind);if(i<0)continue;
      const part=ordered[i],edge=edges[part.edgeIndex];
      for(let k=i*54;k<i*54+6;k++){
        const along=(position.getX(k)-edge.a[0])*edge.direction[0]+(position.getZ(k)-edge.a[1])*edge.direction[1];
        const grain=kind==='boards'?position.getY(k):along;
        assert.ok(Math.abs(uv.getY(k)-grain-(part.uvOffset?.[1]??0))<1e-5,kind+' grain follows the physical member');
      }
    }
  }finally{mesh.geometry.dispose();mesh.material.forEach(m=>m.dispose());}
});

test('large gable treatments distinguish teak screens, broad beach boards and fine Coastal siding without changing the roof',()=>{
  const d=applyPlanExterior(data,defaults),layout=houseAppearanceLayout(d,defaults),roof=layout.roof.envelope;
  const original=JSON.stringify(roof.surfaceFaces),signatures=new Set();
  for(const [id,kind]of [['hidden-bali','battens'],['japandi','paired-batten'],['beach-house','lap-board'],['coastal','weatherboard-course']]){
    const style=getDesignStyle(id),proposal=houseGableRenovation(roof,layout,style),root=new THREE.Group();
    assert.ok(proposal.parts.some(p=>p.kind===kind),id);
    assert.ok(proposal.parts.length<1600,'Whole gables use full-height members and a bounded solid count');
    const backing=proposal.parts.filter(p=>p.kind==='cladding-backing');
    assert.ok(backing.reduce((sum,p)=>sum+(p.hi-p.lo)*(p.top-p.bottom),0)>20,id+' changes a visible architectural area');
    signatures.add(JSON.stringify(proposal.parts.map(p=>[p.lo,p.hi,p.top,p.bottom,p.depth])));
    for(const p of proposal.parts){
      const edge=proposal.edges[p.edgeIndex];
      assert.ok(p.bottom>=edge.baseZ&&p.lo>=0&&p.hi<=edge.length&&p.depth<=.14);
      for(const x of [p.lo,p.hi])assert.ok(p.top<=photoRoofEdgeHeight(edge.roofEdge,x)-.09);
    }
    const mesh=addRenovationGableCladding(root,roof,layout,style);
    assert.equal(root.children.length,1,'A whole gable treatment is one batched mesh');
    assert.equal(mesh.userData.houseRoof,true,'Roof cutaway hides its cladding with the structural gables');
    assert.ok(mesh.geometry.groups.length<=3&&mesh.castShadow&&mesh.receiveShadow);
    assert.ok([...mesh.geometry.attributes.position.array].every(Number.isFinite));
    mesh.geometry.dispose();mesh.material.forEach(m=>m.dispose());
  }
  assert.equal(signatures.size,4);
  assert.equal(JSON.stringify(roof.surfaceFaces),original);
  assert.equal(addRenovationGableCladding(new THREE.Group(),roof,layout,getDesignStyle('current')),null);
  assert.equal(addRenovationGableCladding(new THREE.Group(),roof,layout,getDesignStyle('modern-minimal')),null,'Minimal keeps a quiet mineral gable');
});

test('roof material metres follow the pitched surface rather than a shortened horizontal projection',()=>{
  for(const slope of [-1,1]){
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,.5,Math.sqrt(.75)*slope],3));g.computeVertexNormals();
    const m=new THREE.MeshStandardMaterial();m.userData={metricTexture:true,exteriorRole:'roof'};
    const mesh=new THREE.Mesh(g,m);projectArchitecturalMaterialUVs(mesh);
    const uv=g.attributes.uv;
    assert.ok(Math.abs(Math.hypot(uv.getX(2)-uv.getX(0),uv.getY(2)-uv.getY(0))-1)<1e-6,'One metre up the roof stays one texture metre');
    assert.ok(Math.abs(uv.getX(1)-uv.getX(0)-1)<1e-6,'Standing seams retain their cross-slope spacing');
    g.dispose();m.dispose();
  }
});

test('Beach House gets its specified bleached timber deck and bark is a genuine natural-colour pine scan',()=>{
  assert.equal(exteriorFinishForRole('beach-house','deck'),'whitewashed-oak');
  assert.equal(getMaterialForFinish('whitewashed-oak').id,'oak_veneer_02');
  const bark=MATERIAL_ASSETS['pine-bark'];
  assert.equal(bark.id,'pine_bark');assert.equal(bark.colorMode,'natural');
  assert.equal(bark.license,'CC0-1.0');assert.deepEqual(bark.meters,[2,2]);
  assert.ok(bark.files.diffuse!==bark.files.nor_gl&&bark.files.nor_gl!==bark.files.rough);
});
