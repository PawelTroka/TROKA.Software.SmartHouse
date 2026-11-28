import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {DESIGN_STYLES,getDesignStyle} from '../src/design-styles.js';
import {getInteriorPlan} from '../src/interior-plan.js';
import {getHouseFloorPlan,sharedHouseFacades} from '../src/house-model.js';
import {applyPlanExterior} from '../src/plan-exterior.js';
import {houseAppearanceLayout,facadePoint} from '../src/house-appearance.js';
import {mappedHouseFacadeLayout} from '../src/mapped-house-facades.js';
import {wallPanels} from '../src/interior-geometry.js';
import {houseRenovationParts} from '../src/house-renovation.js';
import {createPhotoHouseGroup} from '../src/scene-house.js';
import {RENOVATION_ARCHITECTURES,getRenovationArchitecture,renovatePlanOpenings,renovateFacadeOpenings,
  facadeSolidPanels,facadeRoofHeight,minimumFacadeRoof} from '../src/renovation-architecture.js';

const source=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const nadmorska=JSON.parse(readFileSync(new URL('../data/nadmorska-17.json',import.meta.url)));
const styleIds=DESIGN_STYLES.filter(s=>s.renovation).map(s=>s.id);
const settings={floorHeight:1.2,firstFloorRise:3.05,atticRise:5.75,styleHouseFinish:true,
  canopyEnabled:true,terraceCoverType:'balcony',terraceWidth:10.77,terraceDepth:4,canopyWidth:10.77,canopyDepth:4};
const near=(a,b,epsilon=1e-7)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
const rounded=n=>Math.round(n*1e6)/1e6;
const area=polygon=>Math.abs(polygon.reduce((sum,a,i)=>{const b=polygon[(i+1)%polygon.length];return sum+a[0]*b[1]-b[0]*a[1];},0))/2;
const inside=(p,polygon)=>{let found=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[i],b=polygon[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])found=!found;
}return found;};
const physicalSignature=layout=>JSON.stringify(layout.windows.map(w=>{
  const edge=layout.edges[w.edgeIndex],a=facadePoint(edge,w.lo,w.z),b=facadePoint(edge,w.hi,w.z);
  const ends=[a,b].map(p=>p.map(rounded)).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return [...ends.flat(),rounded(w.height),w.kind];
}).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));

test('all renovation styles have distinct actual aperture geometry on shared, photo and mapped houses',()=>{
  assert.deepEqual(Object.keys(RENOVATION_ARCHITECTURES).sort(),styleIds.slice().sort());
  assert.ok(styleIds.length>=34);assert.equal(getRenovationArchitecture('current'),null);
  const signatures=[new Set(),new Set(),new Set()],before=JSON.stringify(source);
  for(const designStyle of styleIds){
    const state={...settings,designStyle},data=applyPlanExterior(source,state);
    const layouts=[houseAppearanceLayout(data,state),houseAppearanceLayout(source,state),mappedHouseFacadeLayout(nadmorska,state)];
    for(const [i,layout]of layouts.entries()){
      assert.equal(layout.architectureProposal.styleId,designStyle);
      assert.equal(layout.architectureProposal.conceptual,true);
      assert.ok(getRenovationArchitecture(designStyle).description.length>50);
      signatures[i].add(physicalSignature(layout));
    }
  }
  assert.deepEqual(signatures.map(s=>s.size),[styleIds.length,styleIds.length,styleIds.length]);
  assert.equal(JSON.stringify(source),before,'Architectural proposals cannot mutate the survey');
});

test('Current is unchanged and repeated style switches restore the source openings without accumulation',()=>{
  const basePlan=getInteriorPlan({floor:'ground',layout:'renovation',styleId:'current'}),before=JSON.stringify(basePlan);
  assert.equal(renovatePlanOpenings(basePlan,{styleId:'current'}),basePlan);
  let changed=basePlan;
  for(const styleId of [...styleIds,'hidden-bali','modern-minimal','hidden-bali']){
    changed=renovatePlanOpenings(changed,{styleId});
    assert.deepEqual(changed.walls,renovatePlanOpenings(basePlan,{styleId}).walls);
    assert.equal(renovatePlanOpenings(changed,{styleId}),changed);
  }
  assert.deepEqual(renovatePlanOpenings(changed,{styleId:'current'}),basePlan);
  assert.equal(JSON.stringify(basePlan),before);
  const layout=houseAppearanceLayout(source,{...settings,designStyle:'current'});
  assert.equal(renovateFacadeOpenings(layout,{styleId:'current'}),layout);
  let transformed=layout;
  for(const styleId of styleIds){
    transformed=renovateFacadeOpenings(transformed,{styleId});
    assert.deepEqual(transformed.windows,renovateFacadeOpenings(layout,{styleId}).windows);
  }
  assert.equal(renovateFacadeOpenings(transformed,{styleId:'current'}),layout);
  assert.deepEqual(houseAppearanceLayout(source,{...settings,designStyle:'current'}),layout);
});

test('all shared exterior records match actual interior holes while retaining walls, floors, stairs and entry datum',()=>{
  for(const designStyle of styleIds){
    const state={...settings,designStyle},data=applyPlanExterior(source,state),facades=sharedHouseFacades(data,state);
    for(const floor of ['ground','first']){
      const plan=getHouseFloorPlan({floor,data,settings:state});
      const original=getInteriorPlan({floor,layout:'renovation',styleId:designStyle});
      near(plan.elevation,original.elevation);near(plan.clearHeight,original.clearHeight);
      assert.deepEqual(plan.envelope,original.envelope);
      assert.deepEqual(plan.walls.map(w=>[w.id,w.a,w.b,w.thickness,w.height]),original.walls.map(w=>[w.id,w.a,w.b,w.thickness,w.height]));
      for(const wall of plan.walls.filter(w=>w.exterior)){
        const length=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]),panels=wallPanels(wall);
        let apertureArea=0;
        for(const o of wall.openings){
          assert.ok(o.offset>=0&&o.offset+o.width<=length+1e-7&&o.width>0,designStyle+':'+wall.id);
          assert.ok((o.sill||0)>=0&&o.sill+o.height<=wall.height+1e-7&&o.height>0);
          assert.ok(panels.every(p=>p.right<=o.offset||p.left>=o.offset+o.width||p.top<=o.sill||p.bottom>=o.sill+o.height),'Opaque wall covers '+wall.id);
          apertureArea+=o.width*o.height;
          if(o.type==='passage')continue;
          const edge=facades.edges.find(e=>e.id===floor+'-'+wall.id);
          const record=[...facades.windows,facades.door].find(w=>w&&w.edgeIndex===edge.index&&Math.abs(w.lo-o.offset)<1e-7);
          assert.ok(record,wall.id+':'+o.type);near(record.width,o.width);near(record.z,edge.baseZ+o.sill);near(record.height,o.height);
          for(const key of ['panes','transoms','frameWidth','glazing','operation','architectureStyle'])assert.equal(record[key],o[key],key);
          if(o.glazing==='reflective-privacy')for(const key of ['privacyCondition','nightPrivacyGuaranteed','outlook'])assert.equal(record[key],o[key],key);
        }
        near(panels.reduce((sum,p)=>sum+(p.right-p.left)*(p.top-p.bottom),0),length*wall.height-apertureArea,1e-6);
      }
      if(floor==='ground'){
        const entry=plan.walls.find(w=>w.id==='street-facade').openings.find(o=>o.type==='door');
        const previous=original.walls.find(w=>w.id==='street-facade').openings.find(o=>o.type==='door');
        near(entry.offset+entry.width/2,previous.offset+previous.width/2);assert.equal(entry.sill,0);
        const hst=plan.walls.find(w=>w.id==='garden-hst');assert.equal(hst.openings.length,1);assert.equal(hst.openings[0].panes,3);near(hst.openings[0].offset,.03);near(hst.openings[0].width,Math.hypot(hst.b[0]-hst.a[0],hst.b[1]-hst.a[1])-.06);
      }
      assert.deepEqual(plan.stairs.map(s=>[s.id,s.from,s.to]),original.stairs.map(s=>[s.id,s.from,s.to]));
    }
  }
});

test('bathroom glazing proposals preserve kitchen worktops, retained partitions and solid furniture bays',()=>{
  for(const designStyle of styleIds){
    const plans=['ground','first'].map(floor=>getHouseFloorPlan({floor,settings:{...settings,designStyle}}));
    for(const plan of plans){
      const bathrooms=plan.walls.flatMap(w=>w.openings).filter(o=>['bathroom','spa-bath'].includes(o.roomId));
      assert.equal(bathrooms.length,plan.floor==='ground'?1:2);
      assert.ok(bathrooms.every(o=>o.sill===.98&&o.height===1.44&&o.width>=1.4&&o.operation==='picture'));
      assert.ok(bathrooms.every(o=>plan.floor==='ground'?o.glazing==='reflective-privacy'&&o.privacy:o.glazing==='clear'&&!o.privacy));
      assert.ok(plan.walls.flatMap(w=>w.openings).filter(o=>o.roomId==='front-kitchen').every(o=>o.sill>=1));
      for(const wall of plan.walls.filter(w=>w.exterior))for(const o of wall.openings.filter(o=>o.roomId)){
        const room=plan.rooms.find(r=>r.id===o.roomId),length=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]),ux=(wall.b[0]-wall.a[0])/length,uy=(wall.b[1]-wall.a[1])/length;
        const projections=room.polygon.map(p=>(p[0]-wall.a[0])*ux+(p[1]-wall.a[1])*uy);
        assert.ok(o.offset>=Math.min(...projections)-1e-6&&o.offset+o.width<=Math.max(...projections)+1e-6,'Opening crosses the retained room boundary');
      }
    }
    const [ground,first]=plans,tv=ground.fixtures.find(f=>f.id==='tv'),wall=ground.walls.find(w=>w.id==='right-facade'),lounge=wall.openings.find(o=>o.roomId==='lounge');
    assert.ok(wall.a[1]+lounge.offset+lounge.width<=tv.z-tv.depth/2-.11,'New glass removed the TV mounting wall');
    const landingWall=ground.walls.find(w=>w.id==='street-bay-screen'),divider=ground.walls.find(w=>w.id==='entrance-landing-divider');
    for(const o of landingWall.openings)assert.ok(landingWall.a[0]+o.offset+o.width<=divider.a[0]-divider.thickness/2||landingWall.a[0]+o.offset>=divider.a[0]+divider.thickness/2,'Window crosses the retained entrance landing divider');
    for(const side of ['bay-left','bay-right']){
      const wall=first.walls.find(w=>w.id===side),o=wall.openings[0];
      assert.ok(wall.a[1]+o.offset>=9.48,'Bay window intersects retained tall wardrobe');
    }
    const bedside=first.walls.find(w=>w.id==='left-facade').openings.find(o=>o.roomId==='guest-2');
    assert.ok(bedside.sill>=.8-1e-7,'Guest headboard needs a solid sill bay');
  }
});

test('photo and mapped proposals remain inside the roof and wall, including extreme edited levels',()=>{
  for(const designStyle of styleIds)for(const [floorHeight,firstFloorRise]of [[0,2.0],[1.2,3.05],[2.8,4.5]]){
    const state={...settings,designStyle,floorHeight,firstFloorRise};
    for(const layout of [houseAppearanceLayout(source,state),mappedHouseFacadeLayout(nadmorska,state)]){
      for(const o of [...layout.windows,layout.door].filter(Boolean)){
        const edge=layout.edges[o.edgeIndex];
        assert.ok(o.lo>=(o.kind==='hst'?.029:.1)&&o.hi<=edge.length-(o.kind==='hst'?.029:.1)&&o.hi>o.lo);
        assert.ok(o.z>=layout.baseZ-1e-7&&o.height>0);
        assert.ok(o.z+o.height<minimumFacadeRoof(edge,o.lo,o.hi)-.08,'Aperture crosses the retained roof');
        for(const other of layout.windows.filter(w=>w!==o&&w.edgeIndex===o.edgeIndex))
          assert.ok(o.hi<=other.lo+1e-7||o.lo>=other.hi-1e-7||o.z+o.height<=other.z+1e-7||o.z>=other.z+other.height-1e-7,'Overlapping aperture records');
      }
    }
  }
});

test('mapped elevation patterns are invariant under winding, cyclic start, and collinear survey subdivisions',()=>{
  const ring=[[0,0],[12,0],[12,9],[0,9]],subdivided=[[0,0],[1.3,0],[7.8,0],[12,0],[12,2.1],[12,9],[6.2,9],[0,9],[0,3.1]];
  const variants=[ring,ring.slice().reverse(),[...ring.slice(2),...ring.slice(0,2)],subdivided,subdivided.slice().reverse()];
  for(const designStyle of ['hidden-bali','modern-minimal','coastal','industrial-loft']){
    const layouts=variants.map(points=>{
      const house={footprint:[...points,points[0]],baseZ:0,roofZ:9,roofPoints:[]};
      return mappedHouseFacadeLayout({site:{id:'synthetic',house,terrace:{x:.4,width:11.2},floorReference:{z:0},rearEdge:[[0,9],[12,9]]}},{...settings,floorHeight:1,designStyle});
    });
    assert.ok(layouts.every(layout=>layout.edges.length===4));
    assert.equal(new Set(layouts.map(physicalSignature)).size,1,designStyle);
    for(const layout of layouts)for(const edge of layout.edges){
      near(Math.hypot(...edge.direction),1);near(Math.hypot(...edge.outward),1);
      const mid=[(edge.a[0]+edge.b[0])/2,(edge.a[1]+edge.b[1])/2];
      assert.ok((mid[0]-6)*edge.outward[0]+(mid[1]-4.5)*edge.outward[1]>0);
    }
  }
});

test('piecewise roof panels preserve exact wall area while cutting every opening, including ordinary mapped windows',()=>{
  const edge={index:0,a:[0,0],b:[10,0],length:10,direction:[1,0],outward:[0,-1],roofEdge:{points:[[0,0,8],[4,0,10],[10,0,8]],fractions:[0,.4,1]}};
  const windows=[{edgeIndex:0,lo:1,hi:3,z:1,height:2,kind:'window'},
    {edgeIndex:0,lo:4.5,hi:8,z:1,height:2.4,kind:'hst'},{edgeIndex:0,lo:2,hi:4,z:5,height:1.4,kind:'window'}];
  const layout={baseZ:0,floorZ:1,edges:[edge],windows},panels=facadeSolidPanels(layout,edge);
  near(panels.reduce((sum,p)=>sum+area(p.vertices),0),90-windows.reduce((sum,w)=>sum+(w.hi-w.lo)*w.height,0));
  for(const panel of panels){
    assert.ok(area(panel.vertices)>0&&panel.vertices.flat().every(Number.isFinite));
    assert.ok(panel.vertices.every(([x,z])=>z<=facadeRoofHeight(edge,x)+1e-7));
  }
  for(const w of windows)for(const x of [.1,.5,.9])for(const y of [.1,.5,.9])
    assert.ok(panels.every(p=>!inside([w.lo+(w.hi-w.lo)*x,w.z+w.height*y],p.vertices)));
  const mapped=mappedHouseFacadeLayout(nadmorska,{...settings,designStyle:'hidden-bali'});
  for(const edge of mapped.edges){
    const panels=facadeSolidPanels(mapped,edge);
    for(const w of mapped.windows.filter(w=>w.edgeIndex===edge.index))
      assert.ok(panels.every(p=>!inside([(w.lo+w.hi)/2,w.z+w.height/2],p.vertices)));
  }
});

test('deep reveals and heads stay inside retained elevations and clear all real apertures',()=>{
  for(const designStyle of styleIds){
    const state={...settings,designStyle},data=applyPlanExterior(source,state),layout=houseAppearanceLayout(data,state);
    const parts=houseRenovationParts(layout,getDesignStyle(designStyle)),deep=parts.filter(p=>p.kind==='architectural-reveal'||p.kind==='solar-header');
    assert.ok(deep.length>20,designStyle);assert.ok(deep.some(p=>p.depth>.14));
    for(const p of parts){
      const edge=layout.edges[p.edgeIndex];assert.ok(p.depth>0&&p.depth<=.40&&p.lo>=0&&p.hi<=edge.length);
      assert.ok(p.bottom>=edge.baseZ&&p.top<minimumFacadeRoof(edge,p.lo,p.hi));
      for(const o of [...layout.windows,layout.door,layout.portal].filter(o=>o?.edgeIndex===edge.index))
        assert.ok(p.hi<=o.lo||p.lo>=o.hi||p.top<=o.z||p.bottom>=o.z+o.height,p.kind+' covers '+o.id);
    }
  }
});

test('rendered photo facade holes and actual mullion/transom meshes follow the proposal records',()=>{
  for(const designStyle of ['modern-minimal','industrial-loft']){
    const model=createPhotoHouseGroup(source,{...settings,designStyle},{groundAt:()=>source.site.house.baseZ}),layout=model.userData.houseAppearance;
    model.updateMatrixWorld(true);
    const walls=model.children.filter(m=>m.name.startsWith('house-wall-'));
    for(const w of layout.windows.filter(w=>w.architectureStyle)){
      const edge=layout.edges[w.edgeIndex],p=facadePoint(edge,(w.lo+w.hi)/2,w.z+w.height*.45,.15);
      const ray=new THREE.Raycaster(new THREE.Vector3(p[0],p[2],p[1]),new THREE.Vector3(-edge.outward[0],0,-edge.outward[1]),0,.2);
      assert.equal(ray.intersectObjects(walls,false).length,0,w.id+' is painted onto an opaque wall');
      assert.equal(model.children.filter(m=>m.name.startsWith(w.id+'-mullion-')).length,w.panes-1);
      assert.equal(model.children.filter(m=>m.name.startsWith(w.id+'-transom-')).length,w.transoms);
    }
    model.traverse(object=>{object.geometry?.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])material?.dispose();});
  }
});
