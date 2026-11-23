import * as THREE from '../vendor/three.module.js';
import {toWorld} from './orientation.js?v=1.31.0';
import {beveledBoxGeometry,cushionGeometry,cushionPipingGeometry,wovenPanelGeometry} from './detailed-geometry.js?v=1.31.0';

// Clip joints in local metres against both the terrace perimeter and the actual
// tub opening. A joint that crosses an opening becomes two independent strokes.
function intersectRect(ax, ay, bx, by, rect) {
  let lo = 0, hi = 1;
  for (const [start, delta, min, max] of [[ax,bx-ax,rect.x0,rect.x1],[ay,by-ay,rect.y0,rect.y1]]) {
    if (Math.abs(delta) < 1e-10) {
      if (start < min || start > max) return null;
    } else {
      const first = (min-start)/delta, second = (max-start)/delta;
      lo = Math.max(lo, Math.min(first,second));
      hi = Math.min(hi, Math.max(first,second));
    }
  }
  return hi-lo > 1e-8 ? [lo,hi] : null;
}

export function createStyledDeck(style, {x,y,width,length,z,hole}, {svgMode=false}={}) {
  const group = new THREE.Group();
  group.name = 'styled-terrace-joints';
  if (!(width > 0 && length > 0)) return group;
  const {paving, module:[moduleW,moduleD]} = style.recipe;
  const outer = {x0:0,x1:width,y0:0,y1:length};
  const opening = hole && {x0:hole.x0-x,x1:hole.x1-x,y0:hole.y0-y,y1:hole.y1-y};
  const points = [];
  const draw = (ax,ay,bx,by) => {
    const interval = intersectRect(ax,ay,bx,by,outer);
    if (!interval) return;
    const [lo,hi] = interval;
    const cut = opening && intersectRect(ax,ay,bx,by,opening);
    const stroke = (from,to) => {
      if (to-from < 1e-7) return;
      for (const t of [from,to]) points.push(ax+t*(bx-ax),0,ay+t*(by-ay));
    };
    if (!cut) stroke(lo,hi);
    else {
      stroke(lo,Math.min(hi,cut[0]));
      stroke(Math.max(lo,cut[1]),hi);
    }
  };

  // Reduce the number of individual SVG paths for the finest brick bonds.
  const lod = svgMode && width*length/(moduleW*moduleD)>700 ? 2 : 1;
  const w = moduleW*lod, d = moduleD*lod;
  if (paving === 'diamond') {
    for (let i=-Math.ceil(length/w); i<Math.ceil((width+length)/w); i++) {
      draw(i*w,0,i*w+length,length);
      draw(i*w,0,i*w-length,length);
    }
  } else if (paving === 'basket') {
    for (let row=0; row*w<length; row++) for (let col=0; col*w<width; col++) {
      const left=col*w, top=row*w;
      if (row>0) draw(left,top,left+w,top);
      if (col>0) draw(left,top,left,top+w);
      if ((col+row)%2) draw(left+w/2,top,left+w/2,top+w);
      else draw(left,top+w/2,left+w,top+w/2);
    }
  } else {
    const cross = paving === 'cross-boards';
    const extent = cross ? length : width, across = cross ? width : length;
    const seam = (a,b,c,e) => cross ? draw(b,a,e,c) : draw(a,b,c,e);
    for (let row=0; row*d<across; row++) {
      const start=row*d,end=Math.min(across,start+d);
      if (row>0) seam(0,start,extent,start);
      let offset=0,step=w;
      if (paving==='running') offset=(row%2)*w/2;
      if (paving==='ashlar') {offset=[.0,.41,.14][row%3]*w;step=[1.0,.72,1.22][row%3]*w;}
      if (paving==='boards'||cross) offset=[0,.37,.72][row%3]*w;
      for (let mark=offset||step;mark<extent;mark+=step) seam(mark,start,mark,end);
      if (paving==='banded' && row%3===2) seam(0,start+.045,extent,start+.045);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  const color = new THREE.Color(style.palette.surface).lerp(new THREE.Color(style.palette.frame),.74);
  const material = new THREE.LineBasicMaterial({color,transparent:true,opacity:.58,depthWrite:false});
  material.userData.transient=true;
  const joints = new THREE.LineSegments(geometry,material);
  joints.name=style.recipe.paving;
  if(svgMode)joints.renderOrder=-76;
  group.add(joints);
  group.position.set(...toWorld(x,y,z+.005));
  return group;
}

// Each small assembly batches parts by finish. Geometry is in local coordinates,
// leaving the mapped origin and the garden's existing furniture footprint intact.
function assembly(name, origin, {svgMode=false,upholsteryMaterials=[]} = {}) {
  const group = new THREE.Group(), batches = new Map();
  group.name=name;
  group.position.set(...toWorld(origin.x,origin.y,origin.z));
  const add = (geometry,material,x,y,z,quaternion) => {
    const buffer = batches.get(material) || {positions:[],normals:[],uvs:[]};
    batches.set(material,buffer);
    if (quaternion) geometry.applyQuaternion(quaternion);
    geometry.translate(...toWorld(x,y,z));
    const {position,normal,uv}=geometry.attributes;
    const indices=geometry.index;
    for (let i=0;i<(indices?.count??position.count);i++){
      const ix=indices?indices.getX(i):i;
      buffer.positions.push(position.getX(ix),position.getY(ix),position.getZ(ix));
      buffer.normals.push(normal.getX(ix),normal.getY(ix),normal.getZ(ix));
      buffer.uvs.push(uv?.getX(ix)??0,uv?.getY(ix)??0);
    }
    geometry.dispose();
  };
  const box = (x,y,z,w,l,h,m) => add(!svgMode&&Math.min(w,h,l)>.024?
    beveledBoxGeometry(w,h,l,{radius:Math.min(.004,Math.min(w,h,l)*.10),segments:1}):
    new THREE.BoxGeometry(w,h,l,svgMode?Math.ceil(w/.26):1,1,svgMode?Math.ceil(l/.26):1),m,x,y,z);
  const drum = (x,y,z,w,l,h,m,sides=20) => {
    const geometry=new THREE.CylinderGeometry(.5,.5,h,sides);
    geometry.scale(w,1,l);add(geometry,m,x,y,z);
  };
  const bar = (a,b,r,m,taper=1) => {
    const start=new THREE.Vector3(...toWorld(...a)), end=new THREE.Vector3(...toWorld(...b));
    const direction=end.clone().sub(start), distance=direction.length();
    if (distance < 1e-6) return;
    const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
    add(new THREE.CylinderGeometry(r,r*taper,distance,8),m,(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,q);
  };
  const weave=(x,y,z,w,h,m,angle=0)=>{
    if(svgMode){
      const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),angle);
      add(new THREE.BoxGeometry(w,h,.008),m,x,y,z,q);return;
    }
    add(wovenPanelGeometry(w,h),m,x,y,z,new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),angle));
  };
  // Gently rounded vertical edges and a crowned top, with a true cushion seam
  // silhouette at normal eye height. The ring exponent controls the plan shape.
  const cushion = (x,y,z,w,l,h,m,roundness=4) => {
    if(!svgMode&&upholsteryMaterials.includes(m)){
      const axis=h<=Math.min(w,l)?'y':l<=w?'z':'x';
      add(cushionGeometry(w,h,l,{axis,roundness}),m,x,y,z+h/2);
      add(cushionPipingGeometry(w,h,l,{axis,roundness}),m,x,y,z+h/2);
      return;
    }
    const shape=new THREE.Shape(), sides=32;
    for(let i=0;i<=sides;i++){
      const a=2*Math.PI*i/sides, c=Math.cos(a),s=Math.sin(a);
      const px=Math.sign(c)*Math.abs(c)**(2/roundness)*(w/2-.013);
      const py=Math.sign(s)*Math.abs(s)**(2/roundness)*(l/2-.013);
      if (i===0) shape.moveTo(px,py); else shape.lineTo(px,py);
    }
    const geometry = new THREE.ExtrudeGeometry(shape,{depth:Math.max(.005,h-.026),bevelEnabled:true,
      bevelThickness:.013,bevelSize:.013,bevelSegments:1,steps:1,curveSegments:1});
    geometry.rotateX(-Math.PI/2);
    // SVG's painter sorts faces by mean depth. Triangulating a wide cushion
    // cap as long slivers lets the plinth show through its top at eye level.
    // Give only those flat fallback cap faces a local grid, keeping WebGL lean.
    if(svgMode){
      const cap=geometry.groups.find(g=>g.materialIndex===0);
      if(cap&&cap.count>0){
        const {position,normal}=geometry.attributes;
        const capY=position.getY(cap.start+cap.count-1);
        const lowY=position.getY(cap.start);
        const top=Math.max(capY,lowY);
        const cols=Math.ceil(w/.19),rows=Math.ceil(l/.19),verts=[],normals=[],uvs=[];
        // Subdivide the filled round-rectangle by projecting a regular square
        // grid onto the specified superellipse, retaining a genuinely curved edge.
        const at=(i,j)=>{
          const a=2*i/cols-1,b=2*j/rows-1,mag=(Math.abs(a)**roundness+Math.abs(b)**roundness)**(1/roundness);
          const k=mag?Math.max(Math.abs(a),Math.abs(b))/mag:0;
          return [a*k*(w/2-.013),top,-b*k*(l/2-.013)];
        };
        for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
          for(const [di,dj] of [[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]]){
            verts.push(...at(i+di,j+dj));normals.push(0,1,0);uvs.push((i+di)/cols,(j+dj)/rows);
          }
        }
        const topCap=new THREE.BufferGeometry();
        topCap.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
        topCap.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
        topCap.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
        add(topCap,m,x,y,z+.013);
        // The top was replaced. Keep the original lower cap and bevel sides.
        const remaining=[];
        for(let i=0;i<position.count;i+=3){
          if(i<cap.start+cap.count && normal.getY(i)>.99)continue;
          remaining.push(i,i+1,i+2);
        }
        geometry.setIndex(remaining);
      }
    }
    add(geometry,m,x,y,z+.013);
  };
  const finish = () => {
    for (const [material,data] of batches) {
      const g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));
      g.setAttribute('normal',new THREE.Float32BufferAttribute(data.normals,3));
      g.setAttribute('uv',new THREE.Float32BufferAttribute(data.uvs,2));
      const mesh=new THREE.Mesh(g,material);mesh.receiveShadow=true;
      // The assembled chairs, daybeds and tables need their own real sun
      // shadows as well as contact shading. These are visual casters only;
      // the independent analytical shade calculation keeps its existing scope.
      mesh.castShadow=!svgMode&&!material.transparent;
      group.add(mesh);
    }
    return group;
  };
  return {box,drum,bar,cushion,weave,finish};
}

function base(kit, form, m, w,l,h,x=0,y=0) {
  const {box,drum,bar,cushion}=kit;
  const cx=x+w/2,cy=y+l/2;
  if (form==='shell') {
    drum(cx,cy,h*.12,w*.63,l*.52,h*.24,m.metal);
    drum(cx,cy,h*.59,w*.34,l*.30,h*.75,m.metal);
  } else if (form==='beach-platform') {
    for(const fx of [.08,.92])for(const fy of [.10,.90])box(x+fx*w,y+fy*l,h*.38,.055,.055,h*.76,m.wood);
    box(cx,cy,h*.78,w*.96,l*.96,h*.30,m.woodLight);
    for(const fy of [.08,.92])box(cx,y+fy*l,h*.60,w*.88,.045,.035,m.wood);
  } else if (form==='coastal-crossback') {
    // An open oak frame, with visible stretchers and crossed end braces, is
    // shared by the daybed, occasional table and six individual dining chairs.
    for(const fx of [.11,.89])for(const fy of [.12,.88])
      box(x+fx*w,y+fy*l,h/2,Math.min(.055,w*.10),Math.min(.055,l*.10),h,m.wood);
    for(const fy of [.12,.88]){
      box(cx,y+fy*l,h*.86,w*.82,Math.min(.045,l*.09),h*.15,m.woodLight);
      bar([x+w*.15,y+fy*l,h*.16],[x+w*.85,y+fy*l,h*.72],.016,m.woodLight);
      bar([x+w*.85,y+fy*l,h*.16],[x+w*.15,y+fy*l,h*.72],.016,m.woodLight);
    }
    for(const fx of [.11,.89])box(x+fx*w,cy,h*.80,Math.min(.045,w*.09),l*.80,h*.13,m.wood);
  } else if (['pebble','low-pebble','deco','block','platform','channel','bench','weave'].includes(form)) {
    if (form==='pebble'||form==='low-pebble') {
      cushion(cx,cy,0,w*.79,l*.84,h,m.stoneLight,form==='pebble'?2.3:3.2);
    } else if (form==='deco') {
      for(let k=0;k<3;k++) cushion(cx,cy,k*h/3,w*(.76+k*.08),l*(.82+k*.065),h/3,k===1?m.styleAccent:m.woodLight,4);
    } else if(form==='weave'){
      // Teak rails and legs remain visible behind an open woven apron. A
      // textured solid block cannot produce the same silhouette or parallax.
      const frame=.045;
      for(const fx of [.065,.935])for(const fy of [.065,.935])
        box(x+w*fx,y+l*fy,h/2,frame,frame,h,m.wood);
      for(const dz of [.055,h-.025]){
        for(const fy of [.065,.935])box(cx,y+l*fy,dz,w*.90,frame,.035,m.wood);
        for(const fx of [.065,.935])box(x+w*fx,cy,dz,frame,l*.90,.035,m.wood);
      }
      const panelH=Math.max(.04,h-.11),panelZ=.055+panelH/2;
      for(const fy of [.065,.935])kit.weave(cx,y+l*fy,panelZ,w*.84,panelH,m.woodLight);
      for(const fx of [.065,.935])kit.weave(x+w*fx,cy,panelZ,l*.84,panelH,m.woodLight,Math.PI/2);
    } else {
      const timber=form==='platform'||form==='bench'||form==='weave';
      box(cx,cy,h/2,w*.90,l*.93,h,timber?m.wood:form==='block'?m.stone:m.metal);
      if (form==='bench') for(const side of [-1,1]){
        const faceX=cx+side*w*.455;
        const n=Math.max(4,Math.round(l/.085));
        for(let i=0;i<n;i++) box(faceX,y+l*(.05+.90*(i+.5)/n),h/2,.012,.035,h*.95,m.woodLight);
      }
    }
    return;
  } else if (form==='sled'||form==='runner') {
    for(const side of [.10,.90]) {
      const xx=x+side*w, ends=form==='runner'?[.08,.16,.84,.92]:[.08,.08,.92,.92];
      const points=[[xx,y+l*ends[0],h],[xx,y+l*ends[1],.035],[xx,y+l*ends[2],.035],[xx,y+l*ends[3],h]];
      for(let i=0;i<3;i++)bar(points[i],points[i+1],form==='runner'?.035:.022,form==='runner'?m.wood:m.metal);
    }
  } else {
    const timber=['slat','taper','trestle','crossbuck','sling'].includes(form);
    for(const fy of [.12,.88]) for(const fx of [.10,.90]){
      const legTop = form==='taper'||form==='trestle'||form==='crossbuck' ? .5+(fx-.5)*.68 : fx;
      bar([x+fx*w,y+fy*l,.01],[x+legTop*w,y+(.5+(fy-.5)*.9)*l,h],form==='scroll'?.019:.034,timber?m.wood:m.metal,form==='taper'?.56:1);
    }
    if (form==='crossbuck'||form==='trestle') for(const fy of [.15,.85]){
      bar([x+w*.12,y+fy*l,.03],[x+w*.82,y+fy*l,h*.92],.026,m.wood);
      if(form==='crossbuck')bar([x+w*.88,y+fy*l,.03],[x+w*.18,y+fy*l,h*.92],.026,m.wood);
    }
    if (form==='trestle')bar([cx,y+l*.12,h*.36],[cx,y+l*.88,h*.36],.028,m.woodLight);
  }
}

export function createStyledLounger(style,m,r,options) {
  const kit=assembly('styled-lounger-'+style.recipe.furniture,r,{...options,upholsteryMaterials:[m.linen,m.fabricAccent??m.styleAccent]});
  const {box,bar,cushion}=kit, {width:w,length:l}=r, form=style.recipe.furniture;
  const accent=m.fabricAccent??m.styleAccent??m.woodLight;
  const seatH=['platform','low-pebble'].includes(form)?.18:form==='channel'?.27:.245;
  base(kit,form,m,w,l,seatH);
  const rounded=['pebble','low-pebble','runner','shell','deco'].includes(form);
  const roundness=form==='shell'?2:rounded?3:7;
  const slatted=form==='slat'||form==='bench';
  if (slatted) {
    const count=12;
    for(let i=0;i<count;i++)box(w/2,l*(.05+.90*(i+.5)/count),seatH+.035,w*.96,l*.90/count-.018,.07,m.woodLight);
    cushion(w/2,l*.28,seatH+.07,w*.87,l*.43,.07,m.linen,5);
  } else if(form==='sling'){
    for(const dx of [.06,.94])bar([w*dx,l*.04,seatH+.18],[w*dx,l*.95,seatH+.06],.026,m.metal);
    // Three panels form a shallow sag, visible in profile without geometry
    // crossing the frame's feet or overhanging a circulation path.
    const curve=[[.04,.18],[.31,.045],[.67,.015],[.95,.06]];
    for(let i=1;i<curve.length;i++){
      const [y0,h0]=curve[i-1],[y1,h1]=curve[i];
      for(let strip=0;strip<4;strip++){
        const t=(strip+.5)/4;
        box(w/2,l*(y0+(y1-y0)*t),seatH+h0+(h1-h0)*t,w*.83,(y1-y0)*l/4+.005,.028,m.linen);
      }
    }
  } else {
    if (form==='platform'||form==='low-pebble')box(w/2,l/2,seatH+.026,w,l,.052,m.woodLight);
    if(form==='coastal-crossback')for(let i=0;i<11;i++)
      box(w/2,l*(.06+.88*(i+.5)/11),seatH+.025,w*.90,l*.88/11-.015,.05,m.woodLight);
    const seatWidth=form==='weave'||form==='coastal-crossback'?.80:form==='platform'?.85:form==='shell'?.84:.96;
    cushion(w/2,l/2,seatH+.055,w*seatWidth,l*.96,.115,m.linen,roundness);
    if(form==='channel'){
      for(let i=0;i<6;i++)cushion(w*(.105+.158*i),l/2,seatH+.12,w*.145,l*.93,.066,m.linen,5);
    }
    if(form==='shell')cushion(w/2,l*.25,seatH+.125,w*.965,l*.44,.14,m.stoneLight,2);
    cushion(w/2,l*.23,seatH+(form==='shell'?.245:.172),w*(form==='shell'?.69:form==='coastal-crossback'?.68:.79),l*.275,.09,['shell','deco','coastal-crossback'].includes(form)?accent:m.linen,roundness);
    if(form==='weave'||form==='coastal-crossback')for(const side of [.055,.945]){
      box(w*side,l*.38,seatH+.20,w*.055,l*.65,.085,m.woodLight);
      for(const fy of [.09,.64])box(w*side,l*fy,seatH+.09,w*.047,.04,.24,m.wood);
    }
    if(form==='channel')for(const side of [.07,.93])cushion(w*side,l*.35,seatH+.11,w*.11,l*.61,.18,accent,5);
  }
  if (form==='scroll') for(const dx of [.047,.953]) {
    const edge=[[.11,.26],[.08,.41],[.13,.49],[.25,.47],[.34,.41],[.41,.43],[.44,.48]];
    for(let i=1;i<edge.length;i++)bar([w*dx,l*edge[i-1][0],edge[i-1][1]],[w*dx,l*edge[i][0],edge[i][1]],.017,m.metal);
  }
  return kit.finish();
}

export function createStyledSideTable(style,m,r,options) {
  const kit=assembly('styled-side-table',r,options);
  const {width:w,length:l}=r, form=style.recipe.furniture;
  base(kit,form,m,w,l,.28);
  if(['shell','pebble','low-pebble','deco','runner','scroll','coastal-crossback'].includes(form))kit.drum(w/2,l/2,.315,w,l,.065,form==='shell'?m.styleAccent:form==='coastal-crossback'?m.woodLight:m.stoneLight);
  else kit.box(w/2,l/2,.315,w,l,.065,m.woodLight);
  return kit.finish();
}

export function createStyledDining(style,m,r,options) {
  if(r.rotation){
    const rotated=createStyledDining(style,m,{...r,x:0,y:0,z:0,width:r.length,length:r.width,rotation:0},options);
    rotated.rotation.y=Math.PI/2;rotated.position.set(...toWorld(r.x,r.y+r.length,r.z));
    rotated.userData.rotation=Math.PI/2;return rotated;
  }
  const kit=assembly('styled-dining-'+style.recipe.furniture,r,{...options,upholsteryMaterials:[m.linen,m.fabricAccent??m.styleAccent]});
  const {width:w,length:l}=r,form=style.recipe.furniture;
  const composition=style.construction?.dining??'long-six',round=composition==='round-four';
  const tw=round?Math.min(1.05,w*.38,l*.42):Math.min(composition==='club-banquette'?1.55:composition==='crossback-six'?1.90:2.08,w*(composition==='crossback-six'?.54:.62));
  const tl=round?tw:Math.min(.84,l*.31),tableHeight=composition==='low-banquette'?.65:.70;
  base(kit,form,m,tw,tl,tableHeight,(w-tw)/2,(l-tl)/2);
  if(round)kit.drum(w/2,l/2,tableHeight+.035,tw,tl,.07,form==='shell'?m.stoneLight:m.woodLight,32);
  else if(composition==='oval-six')kit.cushion(w/2,l/2,tableHeight,tw,tl,.075,m.woodLight,2.5);
  else if(composition==='crossback-six')for(let i=0;i<5;i++)
    kit.box(w/2,(l-tl)/2+tl*(i+.5)/5,tableHeight+.035,tw,tl/5-.008,.07,m.woodLight);
  else kit.box(w/2,l/2,tableHeight+.035,tw,tl,.07,['block','deco','channel'].includes(form)?m.stoneLight:m.woodLight);

  const cw=Math.min(.50,tw*.38),cl=Math.min(.45,l*.17);
  const chair=(cx,cy,fx,fy)=>{
    const alongX=fx!==0,ew=alongX?cl:cw,el=alongX?cw:cl;
    base(kit,form,m,ew,el,.38,cx-ew/2,cy-el/2);
    kit.cushion(cx,cy,.38,ew,el,.08,m.linen,form==='shell'||form==='pebble'?2.2:5);
    const bx=cx-fx*cl*.43,by=cy-fy*cl*.43;
    if(['shell','channel','deco','block'].includes(form)){
      kit.cushion(bx,by,.45,alongX?.09:cw*.94,alongX?cw*.94:.09,.31,form==='shell'?(m.fabricAccent??m.styleAccent):m.linen,4);
    }else{
      for(const side of [-1,1])kit.bar([bx+(alongX?0:side*cw*.40),by+(alongX?side*cw*.40:0),.41],
        [bx+(alongX?0:side*cw*.40),by+(alongX?side*cw*.40:0),.77],.021,m.wood);
      if(form==='coastal-crossback'){
        kit.box(bx,by,.76,alongX?.045:cw*.92,alongX?cw*.92:.045,.04,m.woodLight);
        for(const sign of [-1,1])kit.bar([bx+(alongX?0:sign*cw*.35),by+(alongX?sign*cw*.35:0),.49],
          [bx-(alongX?0:sign*cw*.35),by-(alongX?sign*cw*.35:0),.72],.016,m.woodLight);
      }else if(form==='slat'||form==='bench')for(const dz of [.56,.66,.76])kit.box(bx,by,dz,alongX?.04:cw*.92,alongX?cw*.92:.04,.043,m.woodLight);
      else kit.box(bx,by,.70,alongX?.045:cw*.92,alongX?cw*.92:.045,form==='sling'?.21:.12,form==='sling'?m.linen:m.woodLight);
    }
  };
  const bench=(cx,cy,bw,bd,backX,backY)=>{
    const seatHeight=composition==='low-banquette'?.32:.38;
    base(kit,form,m,bw,bd,seatHeight,cx-bw/2,cy-bd/2);
    const count=composition==='club-banquette'?3:2;
    for(let i=0;i<count;i++)kit.cushion(cx-bw/2+bw*(i+.5)/count,cy,seatHeight+.012,bw/count-.025,bd,.09,m.linen,5);
    if(composition!=='low-banquette'){
      kit.cushion(cx+backX*bw*.44,cy+backY*bd*.44,seatHeight+.10,backX?.09:bw,backX?bd:.09,.29,m.linen,5);
      if(form==='weave')for(const side of [-1,1])kit.box(cx+side*bw*.48,cy,seatHeight+.15,.055,bd,.21,m.wood);
    }
  };
  let seats;
  if(round){
    for(const [fx,fy]of [[1,0],[-1,0],[0,1],[0,-1]])chair(w/2-fx*(tw/2+cl*.67),l/2-fy*(tl/2+cl*.67),fx,fy);
    seats=4;
  }else if(composition==='crossback-six'){
    // Two at each long side and one at each end; every chair faces the table.
    for(const sign of [-1,1]){
      for(const fraction of [-.25,.25])chair(w/2+tw*fraction,l/2+sign*(tl/2+cl*.67),0,-sign);
      chair(w/2+sign*(tw/2+cl*.67),l/2,-sign,0);
    }
    seats=6;
  }else if(composition.endsWith('banquette')){
    const bw=Math.min(w*.76,2.35),bd=Math.min(.53,l*.19);
    for(const sign of [-1,1])bench(w/2,l/2+sign*(tl/2+bd*.66),bw,bd,0,sign);
    seats=6;
    if(composition==='club-banquette'){
      const endX=Math.max(bd/2+.03,w/2-tw/2-.42);
      // A third return creates an actual U-shaped banquette; it fits inside
      // the existing dining footprint rather than moving the seating zone.
      base(kit,form,m,bd,tl*.95,.38,endX-bd/2,l/2-tl*.475);
      kit.cushion(endX,l/2,.39,bd,tl*.95,.09,m.linen,5);
      kit.cushion(endX-bd*.44,l/2,.48,.09,tl*.95,.29,m.linen,5);
    }
  }else{
    for(const sign of [-1,1])for(const fraction of [-.34,0,.34])chair(w/2+tw*fraction,l/2+sign*(tl/2+cl*.67),0,-sign);
    seats=6;
  }
  const group=kit.finish();group.userData={composition,seats,furnitureForm:form};return group;
}

export function createStyledCanopyTrim(style,m,b) {
  const kit=assembly('styled-canopy-'+style.recipe.canopy,{x:b.x0,y:b.y0,z:b.z});
  const {box,bar}=kit, w=b.x1-b.x0,l=b.y1-b.y0;
  const h=Math.max(0,b.z-(b.fasciaBottomZ??b.z-.3));
  const form=style.recipe.canopy;
  const detailMat=m.styleAccent??m.metal;
  if (['battens','paired','rafters','verandah','beach-linen'].includes(form)){
    const spacing=form==='battens'?.18:form==='paired'?.53:form==='verandah'?.59:form==='beach-linen'?.86:.67;
    for(let xx=.10;xx<w-.07;xx+=spacing){
      box(xx,l/2,-.022,form==='rafters'||form==='verandah'?.087:.043,l,.043,m.woodLight);
      if(form==='paired'&&xx+.12<w-.03)box(xx+.12,l/2,-.022,.043,l,.043,m.woodLight);
    }
    if(form==='beach-linen')for(let yy=.14;yy<l-.08;yy+=.16)box(w/2,yy,-.047,w-.05,.11,.009,m.linen);
  }
  if(h<.001)return kit.finish();
  const band=(dz,thickness,material)=>{
    // Fascia facings are flush inside the dimensions of the existing front strip.
    box(w/2,l+.0755,dz,w,.002,Math.min(thickness,h),material);
    for(const xx of [-.0005,w+.0005])box(xx,l/2,dz,.002,l,Math.min(thickness,h),material);
  };
  if(['cornice','bands','chrome','stripe','reveal'].includes(form)){
    if(form==='cornice')for(const fraction of [.14,.46,.81])band(-h*fraction,.022,m.stoneLight);
    else if(form==='bands'||form==='chrome')for(const fraction of [.21,.79])band(-h*fraction,form==='chrome'?.047:.034,form==='chrome'?m.metal:m.woodLight);
    else if(form==='stripe'){band(-h*.32,.04,detailMat);band(-h*.69,.018,detailMat);}
    else band(-h*.65,.029,m.metal);
  }else if(form==='verandah'){
    band(-h*.14,.025,m.woodLight);band(-h*.86,.025,m.woodLight);
    const n=Math.max(1,Math.floor(w/.70)),pitch=w/n,r=Math.min(.014,h*.08);
    for(let i=0;i<n;i++){
      const left=i*pitch+.06,right=(i+1)*pitch-.06;
      for(const sign of [-1,1])bar([left,l+.052,-h*(sign===1?.25:.75)],
        [right,l+.052,-h*(sign===1?.75:.25)],r,m.woodLight);
    }
  }else if(form==='pegs'||form==='girder'){
    band(-h*.52,.042,form==='girder'?m.metal:m.woodLight);
    for(let xx=.14;xx<w-.12;xx+=.53)for(const fraction of [.24,.79]){
      bar([xx,l+.073,-h*fraction],[xx,l+.079,-h*fraction],.015,form==='girder'?m.stoneLight:m.wood);
    }
  }
  return kit.finish();
}

/** Furnished terrace modules share the same measured rectangles as the plan.
 * Low planted vessels and table details carry no analytical screening credit. */
export function createStyledResortPiece(style,m,r,options={}){
  if(r.kind==='lounger')return createStyledLounger(style,m,r,options);
  const kit=assembly('resort-'+r.id,r,{...options,upholsteryMaterials:[m.linen,m.fabricAccent??m.styleAccent]});
  const {box,cushion,drum,bar}=kit,{width:w,length:l}=r,form=style.recipe.furniture;
  const accent=m.fabricAccent??m.styleAccent??m.linen;
  if(r.kind==='planter'){
    const wide=Math.min(w,l),h=.44,leaf=m.hedge??m.wood;
    drum(w/2,l/2,h/2,wide*.88,wide*.88,h,m.stoneLight,24);
    drum(w/2,l/2,h-.012,wide*.76,wide*.76,.018,m.wood,24);
    const grass=r.plant==='grass',n=options.svgMode?9:grass?27:15;
    for(let i=0;i<n;i++){
      const a=i*2.39996,rr=wide*(.08+.11*(i%3)/2),cx=w/2+Math.cos(a)*rr,cy=l/2+Math.sin(a)*rr;
      const height=grass?.35+.20*(.5+.5*Math.sin(i*2.1)):.29+.18*(.5+.5*Math.sin(i*1.6));
      const lean=grass?.085:.10;
      bar([cx,cy,h],[cx+Math.cos(a)*lean,cy+Math.sin(a)*lean,h+height],grass?.006:.008,leaf);
      if(!grass)for(const t of [.45,.70,.95]){
        const px=cx+Math.cos(a)*lean*t,py=cy+Math.sin(a)*lean*t;
        cushion(px,py,h+height*t,.085,.055,.018,leaf,2);
      }
    }
  }else if(r.kind==='table'){
    base(kit,form,m,w,l,.29);
    if(['pebble','low-pebble','shell','runner','beach-platform'].includes(form))drum(w/2,l/2,.325,w,l,.07,m.stoneLight,28);
    else box(w/2,l/2,.325,w,l,.07,m.woodLight);
    // A small ceramic tray and cup make each resting place usable and legible.
    drum(w*.49,l*.48,.368,Math.min(.23,w*.52),Math.min(.23,l*.52),.018,m.stoneLight,20);
    drum(w*.47,l*.47,.401,.058,.058,.055,m.styleAccent??m.stoneLight,14);
  }else{
    const daybed=r.kind==='daybed',ottoman=r.kind==='ottoman',seatH=daybed?.28:form==='platform'||form==='low-pebble'?.31:.38;
    base(kit,form,m,w,l,seatH);
    const alongY=['east','west'].includes(r.back),count=(alongY?l:w)>1.35?2:1;
    for(let i=0;i<count;i++)cushion(w*(alongY?.5:(i+.5)/count),l*(alongY?(i+.5)/count:.5),seatH+.015,
      alongY?w*.91:w/count-.025,alongY?l/count-.025:l*.91,daybed?.14:.12,m.linen,form==='shell'?2.2:5);
    if(!ottoman){
      const bx=r.back==='east'?w-.065:r.back==='west'?.065:w/2;
      const by=r.back==='south'?l-.065:r.back==='north'?.065:l/2;
      const bw=alongY?.115:w*.96,bl=alongY?l*.96:.115;
      const backH=daybed?.27:.34;
      if(['weave','beach-platform','slat','bench','coastal-crossback'].includes(form)){
        box(bx,by,seatH+backH*.52,bw*.55,bl*.97,backH,m.woodLight);
        for(let i=0;i<count;i++)cushion(alongY?bx-(r.back==='east'?1:-1)*.08:w*(i+.5)/count,
          alongY?l*(i+.5)/count:by+(r.back==='north'?1:-1)*.08,seatH+.12,
          alongY?.17:w/count*.85,alongY?l/count*.85:.17,backH*.78,i%2?accent:m.linen,5);
      }else cushion(bx,by,seatH+.09,bw,bl,backH,m.linen,form==='pebble'?2.7:5);
      if(daybed){
        const px=alongY?w*.65:w*.24,py=alongY?l*.24:l*.23;
        cushion(px,py,seatH+.18,Math.min(.43,w*.34),Math.min(.40,l*.25),.08,accent,4);
      }
    }
  }
  const group=kit.finish();group.userData.resortPiece={id:r.id,kind:r.kind,back:r.back};return group;
}
