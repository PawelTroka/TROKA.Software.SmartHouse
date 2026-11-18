import * as THREE from '../vendor/three.module.js';
import {batchGroup,containsPoint,floorMesh,ringBounds,wallPanels} from './interior-geometry.js?v=1.26.0';
import {furnishInterior} from './interior-furniture.js?v=1.26.0';

function edges(ring,fn){for(let i=0;i<ring.length;i++)fn(ring[i],ring[(i+1)%ring.length]);}
function rail(tools,parent,mat,a,b,bottom,height=.94) {
  const {rod}=tools, n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/1.05));
  for(let i=0;i<=n;i++){const t=i/n,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;rod(parent,mat,[x,bottom,z],[x,bottom+height,z],.021);}
  for(const h of [height*.31,height*.62,height])rod(parent,mat,[a[0],bottom+h,a[1]],[b[0],bottom+h,b[1]],h===height?.027:.009);
}
export function roofClearance(plan,z){return plan.floor==='attic'?Math.max(.05,(plan.roof?.ridgeElevation??8.75)-plan.elevation-Math.abs(z-(plan.roof?.ridgeZ??4.5))*Math.tan((plan.roof?.pitchDeg??30)*Math.PI/180)):plan.clearHeight;}

function makeWall(parent,wall,height,state,tools,m,cut) {
  const dx=wall.b[0]-wall.a[0],dz=wall.b[1]-wall.a[1],len=Math.hypot(dx,dz);if(len<.01||height<=0)return;
  const {box,group,cyl,rounded}=tools, g=group(parent,wall.a[0],0,wall.a[1],-Math.atan2(dz,dx)),th=wall.thickness;
  const changed=state.showChanges&&wall.status==='new', paint=changed?m.addition:m.wall;
  for(const s of wallPanels(wall,height)) {
    const x=(s.left+s.right)/2,w=s.right-s.left,h=s.top-s.bottom;if(w<.001||h<.001)continue;
    box(g,paint,x,s.bottom+h/2,0,w,h,th);
    if(cut&&Math.abs(s.top-height)<.01)box(g,changed?m.addition:m.cut,x,height+.006,0,w,.012,th+.003);
    if(s.bottom<.01){const trimH=Math.min(h,.081);box(g,changed?m.addition:m.trim,x,trimH/2,0,w,trimH,th+.026);}
  }
  for(const o of wall.openings||[]) {
    const left=o.offset,right=Math.min(len,o.offset+o.width),bottom=o.sill||0,top=Math.min(bottom+o.height,height),w=right-left,h=top-bottom;
    if(w<.04||h<.04||o.type==='passage')continue;
    const full=bottom+o.height<=height+.001, glazed=['window','hst','balcony-door'].includes(o.type),frame=glazed?m.frame:m.oak;
    for(const x of [left+.021,right-.021])box(g,frame,x,bottom+h/2,0,.042,h,glazed?.087:th+.027);
    if(full)box(g,frame,left+w/2,top-.023,0,w,.046,glazed?.088:th+.028);
    if(glazed){
      box(g,frame,left+w/2,bottom+.025,0,w,.05,.098);
      if(o.type==='window')box(g,m.stone,left+w/2,bottom-.014,0,w+.072,.039,th+.127);
      const panels=o.type==='hst'?Math.max(2,Math.round(w/1.66)):(w>1.05?2:1),module=w/panels;
      for(let i=0;i<panels;i++){
        if(i>0)box(g,frame,left+module*i,bottom+h/2,0,.045,h,.081);
        if(o.type==='hst' && i===Math.floor(panels/2)-1)continue;
        box(g,m.glass,left+(i+.5)*module,bottom+h/2,0,Math.max(.01,module-.042),h-.035,.009);
      }
      if(o.type==='window'&&h>1.04)box(g,frame,left+w/2,bottom+h*.71,0,w,.029,.062);
    }else if(o.type==='garage-door'){
      // Draw the raised door overhead, keeping the entry and sightline open.
      if(full){box(g,m.steel,left+w/2,top-.07,-.35,w,.095,.65);}
    }else{
      const end=o.hinge==='end',side=end?-1:1,door=group(g,end?right-.047:left+.047,0,0,-side*(o.swing||1)*1.38),leafW=w-.10,leafH=h-(full?.057:.01);
      rounded(door,m.wood,side*leafW/2,bottom+leafH/2+.014,0,leafW,leafH,.036,.011);
      if(leafH>1.07){const handle=cyl(door,m.bronze,side*(leafW-.077),1.00,.027,.026,.026,.019,12);handle.rotation.x=Math.PI/2;box(door,m.bronze,side*(leafW-.113),1.00,.041,.086,.014,.022);}
    }
  }
}
function addFlight(parent,s,plan,tools,m) {
  const {box,rod,group}=tools,b=ringBounds(s.polygon);
  if(s.kind==='hatch') {
    if(plan.floor===s.from)return; // Ceiling hatch on the lower storey is added to its ceiling group.
    for(const a of [-1,1])rod(parent,m.wood,[b.x+a*b.width*.33,-1.5,b.z1],[b.x+a*b.width*.33,.02,b.z0],.022);
    for(let i=0;i<7;i++) {const t=i/7;rod(parent,m.steel,[b.x-b.width*.33,-1.45+t*1.45,b.z1-t*b.depth],[b.x+b.width*.33,-1.45+t*1.45,b.z1-t*b.depth],.018);}return;
  }
  const dir=s.direction||[0,-1],alongX=Math.abs(dir[0])>.5,length=alongX?b.width:b.depth,w=alongX?b.depth:b.width,steps=s.steps||12,rise=s.rise||2,up=plan.floor===s.from;
  // A single local axis follows the surveyed direction of ascent. On the
  // receiving floor the same flight finishes flush with the landing.
  const offset=plan.garage&&s.id==='cellar-stair'?-2-plan.elevation:0;
  const g=group(parent,b.x,(up?0:-rise)+offset,b.z,Math.atan2(dir[0],dir[1]));
  const winders=s.kind==='winder'?4:0, straight=steps-winders, corner=winders?Math.min(w,length*.4):0,run=(length-corner)/straight,riser=rise/steps;
  const wood=s.kind==='exterior'?m.concrete:m.oak;
  for(let i=0;i<straight;i++){
    const z=-length/2+(i+.5)*run,y=(i+1)*riser;
    box(g,wood,0,y-.024,z,w,.048,run+.015);box(g,s.kind==='exterior'?m.concrete:m.wood,0,y-riser*.5,z-run*.5,w,riser,.024);
  }
  if(winders){
    const pivot=[w/2,length/2-corner];
    function rim(angle){const dx=-Math.cos(angle),dz=Math.sin(angle),distance=Math.min(w/Math.max(.00001,-dx),corner/Math.max(.00001,dz));return [pivot[0]+distance*dx,pivot[1]+distance*dz];}
    for(let i=0;i<winders;i++){
      const a=i*Math.PI/(2*winders),b=(i+1)*Math.PI/(2*winders),cornerAngle=Math.atan2(corner,w),start=rim(a),end=rim(b),y=(straight+i+1)*riser;
      const tread=[pivot,start,...(a<cornerAngle&&b>cornerAngle?[[-w/2,length/2]]:[]),end];floorMesh(g,tread,wood,y);
      const dx=start[0]-pivot[0],dz=start[1]-pivot[1];const face=box(g,m.wood,(pivot[0]+start[0])/2,y-riser/2,(pivot[1]+start[1])/2,Math.hypot(dx,dz),riser,.018);face.rotation.y=-Math.atan2(dz,dx);
    }
  }
  for(const a of [-1,1]){
    const x=a*(w/2-.018);rod(g,wood,[x,.01,-length/2],[x,straight*riser-.11,length/2-corner],.047);
    if(a===1&&s.kind!=='exterior')continue;
    const railH=s.kind==='exterior'?.86:.81;
    rod(g,m.wood,[x,railH+riser,-length/2],[x,railH+straight*riser,length/2-corner],.028);
    for(let i=0;i<straight;i+=2){const y=(i+1)*riser,z=-length/2+(i+.5)*run;rod(g,m.frame,[x,y,z],[x,y+railH,z],.012);}
  }
}
function makePendant(g,x,z,y,tools,m,kind) {
  const {rod,cyl,oval}=tools,h=Math.min(.53,y*.21),lampY=y-h-.09;
  cyl(g,m.frame,x,y-.024,z,.05,.05,.04);rod(g,m.frame,[x,y-.045,z],[x,lampY+.09,z],.0045);
  if(['orb','oval'].includes(kind))oval(g,m.glow,x,lampY,z,.25,.22,.25);
  else if(['lantern','woven'].includes(kind)){
    cyl(g,m.glow,x,lampY,z,.048,.04,.083);for(let i=0;i<16;i++){const a=i*Math.PI/8;
      rod(g,m.oak,[x+Math.cos(a)*.039,lampY+.12,z+Math.sin(a)*.039],[x+Math.cos(a)*.14,lampY-.032,z+Math.sin(a)*.14],.006);
      rod(g,m.oak,[x+Math.cos(a)*.14,lampY-.032,z+Math.sin(a)*.14],[x+Math.cos(a)*.10,lampY-.089,z+Math.sin(a)*.10],.006);}
  }else{cyl(g,m.frame,x,lampY,z,.035,.157,.095,28);cyl(g,m.glow,x,lampY-.049,z,.142,.142,.006,28);}
}
export function buildArchitecture(plan,state,tools,finishes) {
  const {m,architecturalFloor,style}=finishes,{group,box,rod}=tools,root=new THREE.Group(),base=group(root),ceiling=group(root),props=group(root),decor=group(root),changes=group(root);
  const outline=plan.envelope.outline,holes=plan.voids||[],floor=plan.floor,attic=floor==='attic',outlineBox=ringBounds(outline),h=plan.clearHeight,slab=.20;
  const sides=new Map();
  function wallPair(key){if(!sides.has(key))sides.set(key,{full:group(root),cut:group(root)});return sides.get(key);}
  function edgeBox(parent,material,a,b,height,bottom,width){const dx=b[0]-a[0],dz=b[1]-a[1];const mesh=box(parent,material,(a[0]+b[0])/2,bottom+height/2,(a[1]+b[1])/2,Math.hypot(dx,dz),height,width);mesh.rotation.y=-Math.atan2(dz,dx);}
  floorMesh(base,outline,floor==='basement'?m.concrete:architecturalFloor,.002,holes);
  edges(outline,(a,b)=>edgeBox(base,m.plinth,a,b,slab,-slab,.009));
  for(const hole of holes)edges(hole,(a,b)=>edgeBox(base,m.wood,a,b,slab,-slab,.026));
  // Finish patches follow the room polygons, with a continuous structural floor beneath.
  for(const r of plan.rooms){
    const wet=['bathroom','bath','kitchen','sauna','utility','garage'].includes(r.kind),finish=(r.finish||'').toLowerCase();
    const mat=floor==='basement'?m.concrete:r.kind==='sauna'?m.boards:wet||finish.includes('tile')?m.tiles:architecturalFloor;
    floorMesh(base,r.polygon,mat,.008,holes);
    if(r.kind==='sauna'&&plan.layout==='renovation'){
      const b=ringBounds(r.polygon),n=Math.ceil(b.width/.086);for(let i=0;i<n;i++)box(base,m.oak,b.x0+(i+.5)*b.width/n,.75,b.z1-.012,b.width/n-.005,1.5,.024);
    }
  }
  for(const w of plan.walls) {
    const dx=w.b[0]-w.a[0],dz=w.b[1]-w.a[1],x=(w.a[0]+w.b[0])/2,z=(w.a[1]+w.b[1])/2;
    const dir=!w.exterior?'partition':Math.abs(dx)>Math.abs(dz)?(z<outlineBox.z?'rear':'front'):(x<outlineBox.x?'left':'right');
    const pair=wallPair(dir), full=attic?Math.min(w.height??h,roofClearance(plan,z)):w.height??h;
    makeWall(pair.full,w,full,state,tools,m,false);makeWall(pair.cut,w,Math.min(full,w.exterior?.56:.70),state,tools,m,true);
    if(attic&&w.exterior&&Math.abs(dz)>.1) {
      const z0=Math.min(w.a[1],w.b[1]),z1=Math.max(w.a[1],w.b[1]),ridge=plan.roof?.ridgeZ??4.5;
      if(z0<ridge&&z1>ridge){
        const shape=new THREE.Shape();shape.moveTo(z0,full);shape.lineTo(z1,full);shape.lineTo(z1,roofClearance(plan,z1));shape.lineTo(ridge,roofClearance(plan,ridge));shape.lineTo(z0,roofClearance(plan,z0));shape.closePath();
        const cap=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:w.thickness,bevelEnabled:false}),m.wall);cap.rotation.y=-Math.PI/2;cap.position.x=x+w.thickness/2;pair.full.add(cap);
      }
    }
    if(plan.layout==='renovation'&&floor!=='basement'&&w.exterior&&dir!=='rear') {
      // Place art only where a dwelling room adjoins a long solid piece of wall.
      const panels=wallPanels(w,full).filter(p=>p.bottom<.01&&p.top>1.98&&p.right-p.left>1.28);
      const panel=panels.sort((a,b)=>(b.right-b.left)-(a.right-a.left))[0];
      if(panel){const offset=(panel.left+panel.right)/2,len=Math.hypot(dx,dz),px=w.a[0]+dx/len*offset,pz=w.a[1]+dz/len*offset;
        const toward=dir==='left'?[1,0]:dir==='right'?[-1,0]:[0,-1];const room=plan.rooms.find(r=>containsPoint(r.polygon,px+toward[0]*.45,pz+toward[1]*.45));
        if(room&&['living','bedroom','guest','dining','office'].includes(room.kind)){
          const trim=group(pair.full,px+toward[0]*(w.thickness/2+.018),1.58,pz+toward[1]*(w.thickness/2+.018),Math.atan2(toward[0],toward[1]));
          box(trim,m.wood,0,0,0,.70,.83,.031);box(trim,m.paper,0,0,.017,.653,.783,.007);const art=new THREE.Mesh(new THREE.PlaneGeometry(.505,.631),m.art);art.position.z=.022;trim.add(art);
        }
      }
    }
  }
  for(const c of plan.cores||[]) {const b=ringBounds(c.polygon),pair=wallPair('partition'),top=attic?roofClearance(plan,b.z):h;
    for(const [node,height] of [[pair.full,top],[pair.cut,Math.min(.79,top)]]){
      box(node,m.brick,b.x,height/2,b.z,b.width,height,b.depth);box(node,m.stone,b.x,height+.013,b.z,b.width+.022,.026,b.depth+.022);
      const n=c.flues||2,along=b.width>b.depth;for(let i=0;i<n;i++){const t=(i+.5)/n-.5;box(node,m.dark,b.x+(along?t*b.width:0),height+.029,b.z+(along?0:t*b.depth),along?b.width/n*.56:b.width*.48,.008,along?b.depth*.51:b.depth/n*.54);}
    }
  }
  for(const s of plan.stairs||[]){addFlight(base,s,plan,tools,m);if(s.kind==='hatch'&&s.from===floor){const b=ringBounds(s.polygon);box(ceiling,m.wood,b.x,h-.052,b.z,b.width,.05,b.depth);box(ceiling,m.trim,b.x,h-.082,b.z,b.width-.075,.018,b.depth-.075);}}
  for(const surface of plan.outdoor||[]) {
    const b=ringBounds(surface.polygon),mat=surface.kind==='landing'?m.concrete:m.boards;
    floorMesh(base,surface.polygon,mat,.005);
    edges(surface.polygon,(a,b)=>{edgeBox(base,m.plinth,a,b,.16,-.16,.012);
      if(surface.kind==='balcony'&&!(Math.abs(a[1])<.01&&Math.abs(b[1])<.01))rail(tools,base,m.frame,a,b,0,1.09);});
    if(surface.kind==='terrace'&&plan.layout==='renovation') { // Deck perimeter only; furnishing is covered by the garden workspace.
      edgeBox(base,m.wood,[b.x0,b.z0],[b.x1,b.z0],.12,-.12,.04);
    }
  }
  if(state.showChanges)for(const w of plan.removedWalls||[]){
    const length=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]),n=Math.ceil(length/.26),g=group(changes,w.a[0],0,w.a[1],-Math.atan2(w.b[1]-w.a[1],w.b[0]-w.a[0]));
    for(let i=0;i<n;i++){const step=length/n;box(g,m.removed,(i+.5)*step,.027,0,step*.56,.023,Math.min(.095,w.thickness));}
  }
  if(attic){
    const ridge=plan.roof?.ridgeZ??4.5;
    for(const [z0,z1] of [[0,ridge],[ridge,plan.envelope.depth]])floorMesh(ceiling,[[0,z0],[plan.envelope.width,z0],[plan.envelope.width,z1],[0,z1]],m.ceiling,(x,z)=>roofClearance(plan,z));
    for(let x=.25;x<plan.envelope.width;x+=1.08){
      for(const z of [0,plan.envelope.depth]){
        rod(base,m.wood,[x,roofClearance(plan,z)-.04,z],[x,roofClearance(plan,ridge)-.085,ridge],.061);
        const mid=(z+ridge)/2;rod(base,m.wood,[x,.11,ridge],[x,roofClearance(plan,mid)-.075,mid],.043);
      }
      rod(base,m.wood,[x,.09,0],[x,.09,plan.envelope.depth],.054);
    }
    rod(base,m.wood,[0,roofClearance(plan,ridge)-.095,ridge],[plan.envelope.width,roofClearance(plan,ridge)-.095,ridge],.084);
  }else floorMesh(ceiling,outline,m.ceiling,h,plan.stairs?.filter(s=>s.from===floor&&s.kind!=='hatch').map(s=>s.polygon)||[]);
  furnishInterior(props,plan,tools,finishes);
  for(const r of plan.rooms) {
    if(attic||floor==='basement'||plan.layout!=='renovation')continue;
    const table=plan.fixtures?.find(f=>f.roomId===r.id&&f.kind==='diningTable'),b=ringBounds(r.polygon);
    if(table){for(const t of [-.25,.25])makePendant(decor,table.x+t*table.width,table.z,h,tools,m,style.recipe.fixture);}
    else if(r.area>3&&containsPoint(r.polygon,b.x,b.z)){tools.cyl(ceiling,m.frame,b.x,h-.027,b.z,.108,.12,.048);tools.cyl(ceiling,m.glow,b.x,h-.054,b.z,.105,.106,.009);}
  }
  for(const node of [base,ceiling,props,decor,changes,...[...sides.values()].flatMap(s=>[s.full,s.cut])])batchGroup(node);
  root.position.y=plan.elevation;
  return {root, updateVisibility(view,camera,opts){let changed=false;const room=view==='room';ceiling.visible=room&&opts.showCeiling!==false;props.visible=opts.showFurniture!==false;decor.visible=props.visible;
    for(const [direction,s] of sides){const far=direction==='left'?camera.x>outlineBox.x:direction==='right'?camera.x<outlineBox.x:direction==='rear'?camera.z>outlineBox.z:direction==='front'?camera.z<outlineBox.z:false;
      if(s.full.visible!==(room||far))changed=true;s.full.visible=room||far;s.cut.visible=!s.full.visible;}return changed;
  },dispose(){root.traverse(obj=>obj.geometry?.dispose());root.removeFromParent();}};
}
