import * as THREE from '../vendor/three.module.js';
import {batchGroup,containsPoint,floorMesh,ringBounds,wallPanels} from './interior-geometry.js?v=1.41.0';
import {furnishInterior} from './interior-furniture.js?v=1.41.0';
import {getInteriorStyleRecipe} from './interior-style-recipes.js?v=1.41.0';
import {getBalconyGuardRecipe} from './exterior-recipes.js?v=1.41.0';
import {stairTreads} from './stair-surfaces.js?v=1.41.0';
import {slidingPanelLayout} from './hst-system.js?v=1.41.0';
import {stairLandingGuards,landingGuardTop} from './stair-guards.js?v=1.41.0';

function edges(ring,fn){for(let i=0;i<ring.length;i++)fn(ring[i],ring[(i+1)%ring.length]);}
function rail(tools,parent,mat,a,b,bottom,height=.94,style=null,m=null) {
  const {rod,box}=tools,length=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(length/1.05)),recipe=getBalconyGuardRecipe(style);
  for(let i=0;i<=n;i++){const t=i/n,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;rod(parent,mat,[x,bottom,z],[x,bottom+height,z],.021);}
  if(recipe.form!=='original'&&m){
    const angle=-Math.atan2(b[1]-a[1],b[0]-a[0]),g=tools.group(parent,(a[0]+b[0])/2,bottom,(a[1]+b[1])/2,angle),wood=recipe.form.includes('timber'),finish=wood?m.wood:mat;
    box(g,finish,0,height,0,length,recipe.railWidth,.045);
    if(recipe.form==='glass'||recipe.keepClearGlass)box(g,m.glass,0,height*.50,0,length-.036,height-.12,.014);
    if(recipe.form==='vertical-timber'||recipe.form==='steel-pickets'){
      const count=Math.ceil(length/recipe.spacing),width=recipe.form==='vertical-timber'?.038:.014;
      for(let i=1;i<count;i++)box(g,finish,-length/2+i*length/count,height*.50,0,width,height-.10,.027);
    }else if(recipe.form==='horizontal-timber'){for(let i=1;i<5;i++)box(g,finish,0,height*i/5,0,length,.045,.032);}
    else if(recipe.form==='cross-timber'){
      for(let i=0;i<n;i++){
        const x0=-length/2+i*length/n+.065,x1=-length/2+(i+1)*length/n-.065,low=.075,high=height-.075;
        if(x1-x0<.04)continue;
        for(const direction of [-1,1]){
          const beam=box(g,finish,(x0+x1)/2,(low+high)/2,0,Math.hypot(x1-x0,high-low),.052,.032);
          beam.rotation.z=direction*Math.atan2(high-low,x1-x0);
        }
      }
    }
    else if(recipe.form==='deco-metal'){
      const count=Math.max(1,Math.floor(length/recipe.spacing));for(let i=0;i<count;i++){const x=-length/2+(i+.5)*length/count,w=length/count*.68;rod(g,m.bronze,[x-w/2,.20,0],[x,height-.18,0],.009);rod(g,m.bronze,[x,height-.18,0],[x+w/2,.20,0],.009);rod(g,m.bronze,[x-w/2,.20,0],[x+w/2,.20,0],.009);}
    }
    return;
  }
  for(const h of [height*.31,height*.62,height])rod(parent,mat,[a[0],bottom+h,a[1]],[b[0],bottom+h,b[1]],h===height?.027:.009);
}
export function roofClearance(plan,z){return plan.floor==='attic'?Math.max(.05,(plan.roof?.ridgeElevation??8.75)-plan.elevation-Math.abs(z-(plan.roof?.ridgeZ??4.5))*Math.tan((plan.roof?.pitchDeg??30)*Math.PI/180)):plan.clearHeight;}

/** Translate existing operable leaves; static tracks, geometry and materials
 * stay allocated. Leaf-local X survives wall and whole-house batching. */
export function updateHstOpening(root,settings={}){
  let updated=0;
  root?.traverse(node=>{
    const leaf=node.userData.hstLeaf;if(!leaf)return;
    const system=slidingPanelLayout({...leaf.opening,openFraction:leaf.open},settings),panel=system.panels[leaf.index];
    const delta=panel.centre-leaf.centre;
    if(Math.abs(delta)>1e-10){node.translateX(delta);updated++;}
    node.userData.hstLeaf={...leaf,open:system.open,centre:panel.centre,lo:panel.lo,hi:panel.hi};
  });
  return updated;
}

function makeWall(parent,wall,height,state,tools,m,cut,exterior=null,design=null) {
  const dx=wall.b[0]-wall.a[0],dz=wall.b[1]-wall.a[1],len=Math.hypot(dx,dz);if(len<.01||height<=0)return;
  const {box,group,cyl,rounded}=tools, g=group(parent,wall.a[0],0,wall.a[1],-Math.atan2(dz,dx)),th=wall.thickness;
  const changed=state.showChanges&&wall.status==='new', paint=changed?m.addition:m.wall;
  if(wall.form==='timber-screen'){
    const wood=changed?m.addition:m.oak;
    // A low, visually open guard follows the old stair-side partition. Its
    // opening remains a real entrance; no rail or slat bridges that route.
    for(const p of wallPanels(wall,height)){
      const width=p.right-p.left,top=p.top,bottom=p.bottom;if(width<.01||top-bottom<.08)continue;
      const rail=Math.min(.045,(top-bottom)/4),slat=Math.min(wall.slatWidth||.035,width),span=width-slat;
      rounded(g,wood,(p.left+p.right)/2,top-rail/2,0,width,rail,th,.008);
      box(g,wood,(p.left+p.right)/2,bottom+rail,0,width,rail,th*.64);
      const count=Math.max(1,Math.ceil(span/(wall.slatPitch||.12))),lo=bottom+rail*1.5,hi=top-rail;
      for(let i=0;i<=count;i++)box(g,wood,p.left+slat/2+span*i/count,(lo+hi)/2,0,slat,hi-lo,th*.50);
    }
    return;
  }
  for(const s of wallPanels(wall,height)) {
    const x=(s.left+s.right)/2,w=s.right-s.left,h=s.top-s.bottom;if(w<.001||h<.001)continue;
    box(g,paint,x,s.bottom+h/2,0,w,h,th);
    if(exterior?.material)box(g,exterior.material,x,s.bottom+h/2,exterior.sign*(th/2+.0025),w,h,.004);
    if(cut&&Math.abs(s.top-height)<.01)box(g,changed?m.addition:m.cut,x,height+.006,0,w,.012,th+.003);
    if(s.bottom<.01){const trimH=Math.min(h,.081);box(g,changed?m.addition:m.trim,x,trimH/2,0,w,trimH,th+.026);}
  }
  for(const o of wall.openings||[]) {
    const left=o.offset,right=Math.min(len,o.offset+o.width),bottom=o.sill||0,top=Math.min(bottom+o.height,height),w=right-left,h=top-bottom;
    if(w<.04||h<.04||o.type==='passage')continue;
    const full=bottom+o.height<=height+.001, glazed=['window','hst','balcony-door'].includes(o.type),frame=glazed?m.frame:design?.cabinet==='louvred'?(m.painted||m.trim):m.oak;
    const frameWidth=glazed?Math.max(.022,Math.min(.12,o.frameWidth??.042)):.042;
    const headWidth=o.architectureStyle?frameWidth:.046,sillWidth=o.architectureStyle?frameWidth:.05;
    for(const x of [left+frameWidth/2,right-frameWidth/2])box(g,frame,x,bottom+h/2,0,frameWidth,h,glazed?.087:th+.027);
    if(full)box(g,frame,left+w/2,top-headWidth/2,0,w,headWidth,glazed?.088:th+.028);
    if(glazed){
      box(g,frame,left+w/2,bottom+sillWidth/2,0,w,sillWidth,.098);
      if(o.type==='window')box(g,m.stone,left+w/2,bottom-.014,0,w+.072,.039,th+.127);
      if(['hst','balcony-door'].includes(o.type)){
        const system=slidingPanelLayout({...o,width:w},state);
        for(const panel of system.panels){
          const z=panel.track-.047,fw=panel.frameWidth;
          const leaf=group(g,panel.centre,0,z);
          for(const px of [-panel.width/2+fw/2,panel.width/2-fw/2])box(leaf,frame,px,bottom+h/2,0,fw,h-2*frameWidth,.042);
          for(const yy of [bottom+frameWidth*1.5,top-frameWidth*1.5])box(leaf,frame,0,yy,0,panel.width,frameWidth,.042);
          box(leaf,m.glass,0,bottom+h/2,0,panel.width-2*fw,h-4*frameWidth,.009);
          if(!panel.fixed)box(leaf,frame,panel.width/2-fw*2,bottom+Math.min(1.05,h*.48),.032,.014,.22,.025);
          batchGroup(leaf);leaf.name=(o.type==='hst'?'hst':'balcony')+'-leaf-'+panel.index;leaf.userData.preserveTransform=true;
          leaf.userData.hstLeaf={opening:{type:o.type,offset:left,width:w},control:system.control,open:system.open,index:panel.index,centre:panel.centre,lo:panel.lo,hi:panel.hi};
          box(g,m.dark,left+w/2,bottom+.006,z,w,.012,.012);
        }
        g.userData.hst={...system,openingWidth:w};
        continue;
      }
      const originalPanels=o.type==='hst'?Math.max(2,Math.round(w/1.66)):(w>1.05?2:1);
      const panels=o.architectureStyle?Math.max(1,Math.min(10,o.panes??originalPanels)):originalPanels,module=w/panels;
      const glass=o.glazing==='privacy'?(m.privacyGlass||m.glass):m.glass;
      for(let i=0;i<panels;i++){
        if(i>0)box(g,frame,left+module*i,bottom+h/2,0,o.architectureStyle?frameWidth:.045,h,.081);
        if(!o.architectureStyle&&o.type==='hst'&&i===Math.floor(panels/2)-1)continue;
        const paneWidth=Math.max(.01,module-frameWidth),paneHeight=h-(o.architectureStyle?frameWidth:.035),paneX=left+(i+.5)*module;
        if(o.glazing==='reflective-privacy'){
          // Opposite front-facing planes keep the exterior reflection from
          // blocking the view out. The reflection stays semi-transparent and
          // follows the existing environment's day/night brightness.
          const outward=exterior?.sign??1;
          for(const [material,sign]of [[m.reflectivePrivacyExterior,outward],[m.reflectivePrivacyInterior,-outward]]){
            const pane=new THREE.Mesh(new THREE.PlaneGeometry(paneWidth,paneHeight),material);
            pane.position.set(paneX,bottom+h/2,sign*.005);pane.rotation.y=sign<0?Math.PI:0;g.add(pane);
          }
        }else box(g,glass,paneX,bottom+h/2,0,paneWidth,paneHeight,.009);
      }
      if(Number.isInteger(o.transoms)){
        for(let row=1;row<=o.transoms;row++)box(g,frame,left+w/2,bottom+h*row/(o.transoms+1),0,w,Math.max(.022,frameWidth*.72),.062);
      }else if(o.type==='window'&&h>1.04)box(g,frame,left+w/2,bottom+h*.71,0,w,.029,.062);
      if(o.architectureStyle&&['hst','balcony-door'].includes(o.type)){
        // Properly sized pull handles and a flush track make the selected
        // sliding/French door construction legible from either viewer.
        box(g,m.dark,left+w/2,bottom+.010,0,w,.018,.12);
        const handleX=left+module-frameWidth*1.5;
        box(g,frame,handleX,bottom+Math.min(1.05,h*.48),.065,.018,.22,.022);
      }
    }else if(o.type==='garage-door'){
      // Draw the raised door overhead, keeping the entry and sightline open.
      if(full){box(g,m.steel,left+w/2,top-.07,-.35,w,.095,.65);}
    }else{
      const end=o.hinge==='end',side=end?-1:1,door=group(g,end?right-.047:left+.047,0,0,-side*(o.swing||1)*Math.PI/2),leafW=w-.10,leafH=h-(full?.057:.01);
      rounded(door,design?.cabinet==='louvred'?(m.painted||m.trim):m.wood,side*leafW/2,bottom+leafH/2+.014,0,leafW,leafH,.036,.011);
      if(design&&design.id!=='current'&&leafH>.3){
        const kind=design.cabinet,cx=side*leafW/2,cy=bottom+leafH/2+.014,pw=leafW-.10,ph=leafH-.15;
        for(const face of [-1,1]){
          const z=face*.021;
          if(['flush','gloss','capsule'].includes(kind))rounded(door,kind==='gloss'?m.lacquer:m.cabinet,cx,cy,z,pw,ph,.009,.004);
          else if(kind==='shoji'){
            box(door,m.linen,cx,cy,z,pw,ph,.008);box(door,m.wood,cx,cy,z+face*.007,.022,ph,.012);
            for(let i=1;i<5;i++)box(door,m.wood,cx,cy-ph/2+i*ph/5,z+face*.007,pw,.02,.012);
          }else if(kind==='louvred'){
            const painted=m.painted||m.trim,n=Math.max(3,Math.ceil(ph/.09));
            for(let i=0;i<n;i++){const blade=box(door,painted,cx,cy-ph/2+(i+.5)*ph/n,z+face*.006,pw-.045,ph/n*.83,.006);blade.rotation.x=-face*.13;}
            for(const a of [-1,1])box(door,painted,cx+a*pw/2,cy,z+face*.007,.028,ph,.012);
            for(const yy of [cy-ph/2,cy,cy+ph/2])box(door,painted,cx,yy,z+face*.008,pw,.030,.013);
          }else if(['cane','slatted','fluted'].includes(kind)){
            const n=kind==='fluted'?Math.ceil(pw/.045):Math.ceil(pw/.085);for(let i=0;i<n;i++)box(door,m.oak,cx-pw/2+(i+.5)*pw/n,cy,z+face*.006,pw/n*.55,ph,.014);
            if(kind==='cane')for(let i=1;i<Math.ceil(ph/.09);i++)box(door,m.cane||m.wood,cx,cy-ph/2+i*.09,z+face*.013,pw,.012,.008);
          }else {
            const material=kind==='deco'?m.bronze:kind==='steel'?m.frame:m.oak;
            for(const a of [-1,1]){box(door,material,cx+a*pw/2,cy,z+face*.006,kind==='deco'?.012:.025,ph,.016);box(door,material,cx,cy+a*ph/2,z+face*.006,pw,.025,.016);}
            if(kind==='framed'||kind==='shaker')box(door,material,cx,cy,z+face*.006,pw,.032,.016);
          }
        }
      }
      if(leafH>1.07){const handle=cyl(door,m.bronze,side*(leafW-.077),1.00,.027,.026,.026,.019,12);handle.rotation.x=Math.PI/2;box(door,m.bronze,side*(leafW-.113),1.00,.041,.086,.014,.022);}
    }
  }
}
export function addFlight(parent,s,plan,tools,m) {
  const {box,rod,group}=tools,b=ringBounds(s.polygon);
  if(s.kind==='hatch') {
    if(plan.floor===s.from)return; // Ceiling hatch on the lower storey is added to its ceiling group.
    const rise=s.rise||2.7;
    for(const a of [-1,1])rod(parent,m.wood,[b.x+a*b.width*.33,-rise,b.z1],[b.x+a*b.width*.33,.02,b.z0],.022);
    for(const tread of stairTreads(s,plan))floorMesh(parent,tread.polygon,m.oak,tread.top);
    return;
  }
  const dir=s.direction||[0,-1],alongX=Math.abs(dir[0])>.5,length=alongX?b.width:b.depth,w=alongX?b.depth:b.width,steps=s.steps||12,rise=s.rise||2,up=plan.floor===s.from;
  // A single local axis follows the surveyed direction of ascent. On the
  // receiving floor the same flight finishes flush with the landing.
  const offset=plan.garage&&s.id==='cellar-stair'&&plan.layout!=='renovation'?-2-plan.elevation:0;
  const g=group(parent,b.x,(up?0:-rise)+offset,b.z,Math.atan2(dir[0],dir[1]));
  const winders=s.kind==='winder'?4:0, straight=steps-winders, corner=winders?Math.min(w,length*.4):0,run=(length-corner)/straight,riser=rise/steps;
  const wood=s.kind==='exterior'?m.concrete:m.oak;
  for(const tread of stairTreads(s,plan))floorMesh(parent,tread.polygon,wood,tread.top);
  for(let i=0;i<straight;i++){
    const z=-length/2+(i+.5)*run,y=(i+1)*riser;
    box(g,s.kind==='exterior'?m.concrete:m.wood,0,y-riser*.5,z-run*.5,w,riser,.024);
  }
  if(winders){
    const pivot=[w/2,length/2-corner];
    function rim(angle){const dx=-Math.cos(angle),dz=Math.sin(angle),distance=Math.min(w/Math.max(.00001,-dx),corner/Math.max(.00001,dz));return [pivot[0]+distance*dx,pivot[1]+distance*dz];}
    for(let i=0;i<winders;i++){
      const a=i*Math.PI/(2*winders),b=(i+1)*Math.PI/(2*winders),cornerAngle=Math.atan2(corner,w),start=rim(a),end=rim(b),y=(straight+i+1)*riser;
      const tread=[pivot,start,...(a<cornerAngle&&b>cornerAngle?[[-w/2,length/2]]:[]),end];
      const dx=start[0]-pivot[0],dz=start[1]-pivot[1];const face=box(g,m.wood,(pivot[0]+start[0])/2,y-riser/2,(pivot[1]+start[1])/2,Math.hypot(dx,dz),riser,.018);face.rotation.y=-Math.atan2(dz,dx);
    }
  }
  for(const a of [-1,1]){
    const x=a*(w/2-.018);rod(g,wood,[x,.01,-length/2],[x,straight*riser-.11,length/2-corner],.047);
    if(a===1&&s.kind!=='exterior'&&plan.layout!=='renovation')continue;
    const renovated=s.kind!=='exterior'&&plan.layout==='renovation',railH=s.kind==='exterior'?.86:renovated?1.05:.81;
    rod(g,renovated?m.oak:m.wood,[x,railH+riser,-length/2],[x,railH+straight*riser,length/2-corner],.028);
    if(renovated){
      const count=Math.max(1,Math.ceil(straight*run/.105));
      for(let i=0;i<=count;i++){
        const t=i/count,z=-length/2+t*straight*run,y=(Math.min(straight-1,Math.floor(t*straight))+1)*riser;
        rod(g,m.oak,[x,y,z],[x,railH+riser+t*(straight-1)*riser,z],.017);
      }
    }else for(let i=0;i<straight;i+=2){const y=(i+1)*riser,z=-length/2+(i+.5)*run;rod(g,m.frame,[x,y,z],[x,y+railH,z],.012);}
  }
}

function addLandingGuards(parent,plan,tools,m){
  const guards=stairLandingGuards(plan),{group,box,rod}=tools;
  for(const guard of guards){
    const dx=guard.b[0]-guard.a[0],dz=guard.b[1]-guard.a[1],length=Math.hypot(dx,dz),count=Math.max(1,Math.ceil(length/.11));
    const g=group(parent,guard.a[0],0,guard.a[1],-Math.atan2(dz,dx));g.name=guard.id;
    const top=t=>landingGuardTop(plan,guard.a[0]+dx*t,guard.a[1]+dz*t,guard.height),width=Math.min(.032,length/3);
    for(let i=0;i<=count;i++){
      const t=i/count,height=top(t);if(height<.07)continue;
      box(g,m.oak,t*length,(height-.025)/2,0,width,Math.max(.035,height-.025),.032);
    }
    for(let i=0;i<count;i++){
      const t0=i/count,t1=(i+1)/count,h0=top(t0),h1=top(t1);if(Math.max(h0,h1)<.07)continue;
      rod(g,m.oak,[t0*length,Math.max(.025,h0-.025),0],[t1*length,Math.max(.025,h1-.025),0],.025);
      if(Math.min(h0,h1)>.14)box(g,m.oak,(t0+t1)*length/2,.065,0,length/count+.002,.035,.032);
    }
  }
  return guards;
}
function makePendant(g,x,z,y,tools,m,kind) {
  const {rod,cyl,oval,box,group}=tools,h=Math.min(.53,y*.21),lampY=y-h-.09;
  cyl(g,m.frame,x,y-.024,z,.05,.05,.04);rod(g,m.frame,[x,y-.045,z],[x,lampY+.09,z],.0045);
  if(kind==='rope-drum'){
    const radius=.23,depth=.28;
    for(let i=0;i<32;i++){const a=i*Math.PI/16;rod(g,m.cane||m.wood,[x+Math.cos(a)*radius,lampY-depth/2,z+Math.sin(a)*radius],[x+Math.cos(a)*radius*.91,lampY+depth/2,z+Math.sin(a)*radius*.91],.0045);}
    for(const [yy,r]of [[lampY-depth/2,radius],[lampY+depth/2,radius*.91]]){const ring=new THREE.Mesh(new THREE.TorusGeometry(r,.006,5,32),m.wood);ring.rotation.x=Math.PI/2;ring.position.set(x,yy,z);g.add(ring);}
    const inner=new THREE.Mesh(new THREE.CylinderGeometry(.13,.14,.22,32,1,true),m.lampShade||m.linen);inner.position.set(x,lampY,z);g.add(inner);
    oval(g,m.glow,x,lampY,z,.12,.16,.12);return;
  }
  if(kind==='linen-drum'){
    const shade=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,.24,40,1,true),m.lampShade||m.linen);shade.position.set(x,lampY,z);g.add(shade);
    for(const yy of [lampY-.12,lampY+.12]){const ring=new THREE.Mesh(new THREE.TorusGeometry(.22,.007,6,40),m.oak);ring.rotation.x=Math.PI/2;ring.position.set(x,yy,z);g.add(ring);}
    for(let i=0;i<3;i++){const a=i*Math.PI*2/3;rod(g,m.bronze,[x,lampY+.12,z],[x+Math.cos(a)*.215,lampY+.12,z+Math.sin(a)*.215],.0035);}
    oval(g,m.glow,x,lampY-.015,z,.12,.15,.12);cyl(g,m.linen,x,lampY-.119,z,.211,.211,.006,40);return;
  }
  if(kind==='linear'){box(g,m.frame,x,lampY,z,1.06,.045,.055);box(g,m.glow,x,lampY-.025,z,1.02,.007,.040);return;}
  if(kind==='cluster'){for(let i=0;i<3;i++){const dx=(i-1)*.16,yy=lampY+(i%2)*.15;rod(g,m.bronze,[x,y-.03,z],[x+dx,yy+.08,z],.005);oval(g,m.glow,x+dx,yy,z,.17,.17,.17);}return;}
  if(kind==='tiered'){for(let i=0;i<3;i++){const r=.21-i*.04;cyl(g,i===1?m.bronze:m.frame,x,lampY+i*.065,z,r,r,.036,28);}cyl(g,m.glow,x,lampY-.022,z,.14,.14,.008,28);return;}
  if(kind==='paper'||kind==='oval'){
    const w=kind==='paper'?.34:.42,hh=kind==='paper'?.35:.26;oval(g,m.glow,x,lampY,z,w,hh,w*.81);
    for(let i=1;i<8;i++){const t=i/8-.5,r=w*.51*Math.sqrt(Math.max(.02,1-4*t*t)),ring=new THREE.Mesh(new THREE.TorusGeometry(r,.003,4,24),m.wood);ring.rotation.x=Math.PI/2;ring.scale.y=.81;ring.position.set(x,lampY+t*hh,z);g.add(ring);}return;
  }
  if(kind==='cage'||kind==='lantern'){
    const w=kind==='lantern'?.25:.22,hh=.32;oval(g,m.glow,x,lampY,z,.09,.13,.09);
    for(const a of [-1,1])for(const b of [-1,1])rod(g,m.frame,[x+a*w/2,lampY-hh/2,z+b*w/2],[x+a*w/2,lampY+hh/2,z+b*w/2],.009);
    for(const yy of [lampY-hh/2,lampY+hh/2]){box(g,m.frame,x,yy,z,w,.015,w);}
    if(kind==='lantern'){box(g,m.glass,x,lampY,z-w*.48,w*.91,hh*.90,.006);box(g,m.glass,x,lampY,z+w*.48,w*.91,hh*.90,.006);}return;
  }
  if(kind==='tube'){cyl(g,m.bronze,x,lampY,z,.055,.055,.22,20);cyl(g,m.glow,x,lampY-.114,z,.05,.05,.008,20);return;}
  if(kind==='clay'){cyl(g,m.pot,x,lampY,z,.065,.18,.21,28);cyl(g,m.glow,x,lampY-.108,z,.155,.155,.008,28);return;}
  if(kind==='orb')oval(g,m.glow,x,lampY,z,.25,.25,.25);
  else if(kind==='basket'){
    oval(g,m.glow,x,lampY,z,.13,.18,.13);for(let i=0;i<24;i++){const a=i*Math.PI/12;rod(g,m.cane||m.oak,[x+Math.cos(a)*.055,lampY+.18,z+Math.sin(a)*.055],[x+Math.cos(a)*.22,lampY-.04,z+Math.sin(a)*.22],.005);rod(g,m.cane||m.oak,[x+Math.cos(a)*.22,lampY-.04,z+Math.sin(a)*.22],[x+Math.cos(a)*.16,lampY-.15,z+Math.sin(a)*.16],.005);}
    for(const [yy,r] of [[lampY+.09,.125],[lampY-.04,.22],[lampY-.12,.176]]){const ring=new THREE.Mesh(new THREE.TorusGeometry(r,.005,5,32),m.oak);ring.rotation.x=Math.PI/2;ring.position.set(x,yy,z);g.add(ring);}
  }
  else if(['lantern','woven'].includes(kind)){
    cyl(g,m.glow,x,lampY,z,.048,.04,.083);for(let i=0;i<16;i++){const a=i*Math.PI/8;
      rod(g,m.oak,[x+Math.cos(a)*.039,lampY+.12,z+Math.sin(a)*.039],[x+Math.cos(a)*.14,lampY-.032,z+Math.sin(a)*.14],.006);
      rod(g,m.oak,[x+Math.cos(a)*.14,lampY-.032,z+Math.sin(a)*.14],[x+Math.cos(a)*.10,lampY-.089,z+Math.sin(a)*.10],.006);}
  }else if(kind==='saucer'){cyl(g,m.frame,x,lampY,z,.065,.24,.045,32);cyl(g,m.glow,x,lampY-.025,z,.21,.21,.006,32);}
  else{cyl(g,m.frame,x,lampY,z,.045,.16,.15,28);cyl(g,m.glow,x,lampY-.077,z,.142,.142,.006,28);}
}

/** Pick one solid feature-wall bay per room. The selected interval is a subset
 * of wallPanels, so decorative work cannot cover a window or doorway. */
export function interiorWallFeatures(plan) {
  const result=new Map(),eligible=['living','bedroom','guest','dining','office','bathroom','bath','kitchen'];
  for(const room of plan.rooms){
    if(!eligible.includes(room.kind))continue;
    if(room.id==='lounge'&&plan.livingCinema?.hasCinema)continue;
    const fixtures=(plan.fixtures||[]).filter(f=>f.roomId===room.id),bed=fixtures.find(f=>f.kind==='bed'),anchor=bed||fixtures.find(f=>f.kind==='tv')||fixtures.find(f=>f.kind==='desk')||fixtures.find(f=>f.kind==='basin'),rb=ringBounds(room.polygon);
    const head=bed?.headboard||[0,-1],target=bed?[bed.x+head[0]*(Math.abs(head[0])>.5?bed.width:bed.depth)/2,bed.z+head[1]*(Math.abs(head[1])>.5?bed.depth:bed.width)/2]:anchor?[anchor.x,anchor.z]:[rb.x,rb.z];
    let chosen=null;
    for(const wall of plan.walls){
      const dx=wall.b[0]-wall.a[0],dz=wall.b[1]-wall.a[1],length=Math.hypot(dx,dz),nx=-dz/length,nz=dx/length;
      if(length<1.1)continue;
      for(const p of wallPanels(wall,wall.height??plan.clearHeight)){
        if(p.bottom>.01||p.top<1.85||p.right-p.left<1.1)continue;
        const mid=(p.left+p.right)/2,x=wall.a[0]+dx/length*mid,z=wall.a[1]+dz/length*mid;
        for(const sign of [-1,1]){
          if(!containsPoint(room.polygon,x+nx*sign*(wall.thickness/2+.08),z+nz*sign*(wall.thickness/2+.08)))continue;
          const along=((target[0]-wall.a[0])*dx+(target[1]-wall.a[1])*dz)/length,near=Math.max(p.left,Math.min(p.right,along));
          const px=wall.a[0]+dx/length*near,pz=wall.a[1]+dz/length*near,score=Math.hypot(target[0]-px,target[1]-pz)-Math.min(3,p.right-p.left)*.12;
          if(!chosen||score<chosen.score)chosen={wallId:wall.id,roomId:room.id,left:p.left+.024,right:p.right-.024,sign,height:p.top,wet:['bathroom','bath','kitchen'].includes(room.kind),score};
        }
      }
    }
    if(chosen){if(!result.has(chosen.wallId))result.set(chosen.wallId,[]);result.get(chosen.wallId).push(chosen);}
  }
  return result;
}

function finishFeatureWall(parent,wall,feature,height,tools,m,design) {
  const {box,cyl,rod,group}=tools,dx=wall.b[0]-wall.a[0],dz=wall.b[1]-wall.a[1],length=Math.hypot(dx,dz),centre=(feature.left+feature.right)/2,w=feature.right-feature.left;
  const g=group(parent,wall.a[0]+dx/length*centre,0,wall.a[1]+dz/length*centre,-Math.atan2(dz,dx));
  const depth=feature.sign*(wall.thickness/2+.014),kind=feature.wet?'wet':design.wall,h=Math.min(height-.014,feature.height-.07,kind==='beadboard'?1.24:['wainscot','half-boards'].includes(kind)?1.07:2.54);
  if(h<.12||w<.2||kind==='none')return;
  if(kind==='wet'){box(g,m.tiles,0,h/2,depth,w,h,.018);box(g,m.bronze,0,h-.017,depth+feature.sign*.012,w,.012,.012);return;}
  const y=h/2;
  if(kind==='lime-niche'){
    box(g,m.wall,0,y,depth,w,h,.024);
    const span=Math.min(1.16,w*.76),centreY=Math.min(1.39,h*.57),nicheHeight=Math.min(1.16,h*.68),front=depth+feature.sign*.027;
    tools.rounded(g,m.stone,0,centreY,front,span,nicheHeight,.035,.10);
    tools.rounded(g,m.wall,0,centreY+.018,front+feature.sign*.021,span-.095,nicheHeight-.095,.016,.082);
    box(g,m.stone,0,centreY-nicheHeight*.23,front+feature.sign*.055,span-.08,.042,.105);
    const vase=cyl(g,m.ceramic,-span*.20,centreY-nicheHeight*.23+.12,front+feature.sign*.06,.042,.065,.20,24);
    vase.userData.decorative=true;
  }else if(kind==='beadboard'){
    const painted=m.painted||m.trim,n=Math.max(3,Math.ceil(w/.105));
    for(let i=0;i<n;i++){
      const x=-w/2+(i+.5)*w/n;box(g,painted,x,y,depth,w/n-.004,h,.022);
      if(i>0)cyl(g,painted,x-w/n/2+.008,y,depth+feature.sign*.014,.0035,.0035,h-.02,7);
    }
    if(h>1.1){box(g,painted,0,h-.028,depth+feature.sign*.008,w,.056,.038);box(g,painted,0,h-.069,depth+feature.sign*.010,w,.014,.031);}
  }else if(['battens','battens-wide','ribs','sauna-boards','timber','half-boards','weatherboards'].includes(kind)){
    const horizontal=['timber','weatherboards'].includes(kind),spacing=kind==='battens-wide'?.28:kind==='sauna-boards'?.105:kind==='ribs'?.075:horizontal?.19:.13;
    box(g,m.wall,0,y,depth,w,h,.012);
    if(horizontal){const n=Math.ceil(h/spacing);for(let i=0;i<n;i++)box(g,m.wood,0,(i+.5)*h/n,depth+feature.sign*.012,w,h/n-.009,.025);}
    else {const n=Math.min(38,Math.ceil(w/spacing));for(let i=0;i<n;i++){const x=-w/2+(i+.5)*w/n;if(kind==='ribs')cyl(g,m.oak,x,y,depth+feature.sign*.013,w/n*.32,w/n*.32,h,8);else box(g,m.wood,x,y,depth+feature.sign*.013,w/n*(kind==='sauna-boards'?.94:.46),h,.028);}}
  }else if(['shoji','wainscot','deco-panels','teak-panels','panels','concrete'].includes(kind)){
    const material=kind==='shoji'?m.linen:kind==='teak-panels'?m.wood:kind==='concrete'?m.concrete:kind==='wainscot'?m.cabinet:m.wall;
    box(g,material,0,y,depth,w,h,.020);const n=Math.max(1,Math.ceil(w/(kind==='shoji'?.47:kind==='deco-panels'?.74:.9)));
    for(let i=0;i<=n;i++)box(g,kind==='deco-panels'?m.bronze:m.wood,-w/2+i*w/n,y,depth+feature.sign*.015,kind==='deco-panels'?.009:.022,h,.021);
    const rows=kind==='shoji'?Math.ceil(h/.44):kind==='wainscot'?1:kind==='concrete'?2:0;
    for(let i=0;i<=rows&&rows;i++)box(g,kind==='concrete'?m.frame:m.wood,0,i*h/rows,depth+feature.sign*.014,w,.018,.020);
    if(kind==='deco-panels')for(const side of [-1,1])box(g,m.bronze,0,y+side*h*.44,depth+feature.sign*.014,w,.009,.012);
    if(kind==='concrete')for(let i=0;i<n;i++)for(const yy of [.12,h-.12]){const bolt=cyl(g,m.steel,-w/2+(i+.5)*w/n,yy,depth+feature.sign*.015,.012,.012,.012,8);bolt.rotation.x=Math.PI/2;}
  }else if(['travertine','brick','rammed'].includes(kind)){
    const rows=kind==='brick'?Math.min(14,Math.ceil(h/.13)):kind==='rammed'?Math.ceil(h/.14):Math.ceil(h/.42),columns=kind==='brick'?Math.min(10,Math.ceil(w/.28)):kind==='rammed'?1:Math.max(1,Math.ceil(w/.82));
    for(let row=0;row<rows;row++)for(let col=0;col<columns;col++)box(g,kind==='brick'?m.brick:kind==='rammed'&&row%3===0?m.wall:m.stone,-w/2+(col+.5)*w/columns,(row+.5)*h/rows,depth,w/columns-.006,h/rows-.006,.024);
  }else if(kind==='channels'){
    const n=Math.max(4,Math.ceil(w/.18));for(let i=0;i<n;i++)tools.rounded(g,i%3===1?m.accent:m.fabric,-w/2+(i+.5)*w/n,y,depth,w/n-.012,h,.042,.018);
  }else if(kind==='portholes'){
    box(g,m.ceramic,0,y,depth,w,h,.018);if(h>1.2)for(const x of w>2?[-w*.24,w*.24]:[0]){const ring=new THREE.Mesh(new THREE.TorusGeometry(Math.min(w*.21,.35),.026,7,32),m.steel);ring.position.set(x,Math.min(1.57,h*.62),depth+feature.sign*.018);g.add(ring);}
  }else if(kind==='breeze'){
    const n=Math.max(3,Math.ceil(w/.28)),rows=Math.min(9,Math.ceil(h/.27));for(let i=0;i<=n;i++)box(g,m.stone,-w/2+i*w/n,y,depth,.033,h,.036);for(let j=0;j<=rows;j++)box(g,m.stone,0,j*h/rows,depth,w,.033,.036);
  }else if(kind==='arches'){
    box(g,m.wall,0,y,depth,w,h,.018);if(h>1.5){const aw=Math.min(w*.72,1.08),radius=aw/2,bottom=.22,shoulder=Math.min(h-.14-radius,1.62);for(const side of [-1,1])box(g,m.stone,side*radius,(bottom+shoulder)/2,depth+feature.sign*.016,.052,shoulder-bottom,.042);for(let i=0;i<18;i++){const a=i*Math.PI/18,b=(i+1)*Math.PI/18;rod(g,m.stone,[Math.cos(a)*radius,shoulder+Math.sin(a)*radius,depth+feature.sign*.016],[Math.cos(b)*radius,shoulder+Math.sin(b)*radius,depth+feature.sign*.016],.026);}}
  }
}

// Leave small clear apertures through decorative boards and battens for the
// four actual flush ceiling speakers; the retained ceiling itself stays whole.
export function ceilingPanelsAroundDevices(panels,plan){
  const devices=(plan.fixtures||[]).filter(f=>f.ceilingMounted);
  if(!devices.length)return panels;
  let pieces=panels;
  for(const f of devices){
    const r=.145,left=f.x-r,right=f.x+r,top=f.z-r,bottom=f.z+r;
    pieces=pieces.flatMap(p=>{
      const x0=p.x-p.width/2,x1=p.x+p.width/2,z0=p.z-p.depth/2,z1=p.z+p.depth/2;
      const a=Math.max(x0,left),b=Math.min(x1,right),c=Math.max(z0,top),d=Math.min(z1,bottom);
      if(a>=b||c>=d)return [p];
      return [[x0,z0,a,z1],[b,z0,x1,z1],[a,z0,b,c],[a,d,b,z1]].filter(([l,t,r,b])=>r-l>.008&&b-t>.008)
        .map(([l,t,r,b])=>({...p,x:(l+r)/2,z:(t+b)/2,width:r-l,depth:b-t}));
    });
  }
  return pieces;
}
export function coastalCeilingPanels(room,plan) {
  // Board runs also respect the room outline and actual stair openings.
  const b=ringBounds(room.polygon),holes=(plan.stairs||[]).filter(s=>s.from===plan.floor&&s.kind!=='hatch').map(s=>ringBounds(s.polygon));
  if(b.width<.18||b.depth<.18)return [];
  const zMin=b.z0+.035,zMax=b.z1-.035,zCuts=new Set([zMin,zMax]);
  for(const [,z] of room.polygon)for(const delta of [-.025,.025])if(z+delta>zMin&&z+delta<zMax)zCuts.add(z+delta);
  for(const hole of holes)for(const z of [hole.z0-.025,hole.z1+.025])if(z>zMin&&z<zMax)zCuts.add(z);
  const zs=[...zCuts].sort((a,c)=>a-c),n=Math.min(64,Math.max(1,Math.ceil((b.width-.07)/.16))),step=(b.width-.07)/n,result=[];
  for(let i=0;i<n;i++){
    const x0=b.x0+.035+i*step+.003,x1=b.x0+.035+(i+1)*step-.003,xs=[x0,(x0+x1)/2,x1];
    for(const [x] of room.polygon)if(x>x0&&x<x1)xs.push(Math.max(x0,x-.001),Math.min(x1,x+.001));
    let start=null,end=null;
    const flush=()=>{if(start!==null&&end-start>.025)result.push({x:(x0+x1)/2,z:(start+end)/2,width:x1-x0,depth:end-start-.004});start=null;end=null;};
    for(let j=0;j<zs.length-1;j++){
      const z0=zs[j],z1=zs[j+1],safe=xs.every(x=>[z0+.001,(z0+z1)/2,z1-.001].every(z=>containsPoint(room.polygon,x,z)))&&!holes.some(h=>x1>h.x0-.025&&x0<h.x1+.025&&z1>h.z0-.024&&z0<h.z1+.024);
      if(safe){if(start===null)start=z0;end=z1;}else flush();
    }
    flush();
  }
  return ceilingPanelsAroundDevices(result,plan);
}

function finishCeiling(parent,room,plan,tools,m,design){
  const {box,rod}=tools,b=ringBounds(room.polygon),h=plan.clearHeight,kind=design.ceiling;if(room.area<3||kind==='none')return;
  const holes=(plan.stairs||[]).filter(s=>s.from===plan.floor&&s.kind!=='hatch').map(s=>s.polygon);
  const safe=(x,z)=>containsPoint(room.polygon,x,z)&&!holes.some(r=>containsPoint(r,x,z));
  if(kind==='v-groove'){
    for(const panel of coastalCeilingPanels(room,plan))box(parent,m.painted||m.trim,panel.x,h-.027,panel.z,panel.width,.026,panel.depth);
  }else if(['beams','rafters','battens','paired','slats','girder','coffers'].includes(kind)){
    const spacing=kind==='battens'?.25:kind==='paired'?.58:kind==='slats'?.40:kind==='rafters'?.85:1.12,depth=kind==='beams'?.13:kind==='girder'?.11:.055,width=kind==='beams'?.10:kind==='girder'?.07:kind==='coffers'?.065:.029;
    const n=Math.max(1,Math.min(20,Math.floor(b.width/spacing)));
    for(let i=0;i<n;i++)for(const offset of kind==='paired'?[-.045,.045]:[0]){
      const x=b.x0+(i+.5)*b.width/n+offset,z0=b.z0+.055,z1=b.z1-.055;
      if(![z0,(z0+z1)/2,z1].every(z=>safe(x,z)))continue;
      for(const p of ceilingPanelsAroundDevices([{x,z:(z0+z1)/2,width,depth:z1-z0}],plan))box(parent,kind==='girder'?m.frame:m.wood,p.x,h-depth/2-.009,p.z,p.width,depth,p.depth);
      if(kind==='girder')for(const y of [h-.12,h-.015])for(const p of ceilingPanelsAroundDevices([{x,z:(z0+z1)/2,width:.14,depth:z1-z0}],plan))box(parent,m.frame,p.x,y,p.z,p.width,.015,p.depth);
    }
    if(kind==='coffers')for(let z=b.z0+.55;z<b.z1-.1;z+=1.10)if([b.x0+.05,b.x,b.x1-.05].every(x=>safe(x,z)))for(const p of ceilingPanelsAroundDevices([{x:b.x,z,width:b.width-.10,depth:.065}],plan))box(parent,m.wood,p.x,h-.04,p.z,p.width,.07,p.depth);
  }else if(kind==='rings'){
    if(!safe(b.x,b.z))return;
    for(const r of [.42,.65]){const ring=new THREE.Mesh(new THREE.TorusGeometry(r,.018,7,40),m.glow);ring.rotation.x=Math.PI/2;ring.position.set(b.x,h-.18,b.z);parent.add(ring);}
  }else if(['recess','cove','stepped'].includes(kind)){
    edges(room.polygon,(a,c)=>{const len=Math.hypot(c[0]-a[0],c[1]-a[1]);if(len<.4)return;const layers=kind==='stepped'?3:1;
      for(let i=0;i<layers;i++){const beam=box(parent,kind==='cove'?m.frame:m.trim,(a[0]+c[0])/2,h-.024-i*.035,(a[1]+c[1])/2,len,.026,.055+i*.035);beam.rotation.y=-Math.atan2(c[1]-a[1],c[0]-a[0]);}
      if(kind!=='stepped')rod(parent,m.glow,[a[0],h-.056,a[1]],[c[0],h-.056,c[1]],.006);
    });
  }
}
export function buildArchitecture(plan,state,tools,finishes) {
  const {m,architecturalFloor,style}=finishes,{group,box,rod}=tools,root=new THREE.Group(),base=group(root),ceiling=group(root),props=group(root),decor=group(root),changes=group(root),stairs=group(root),design=finishes.interiorRecipe||getInteriorStyleRecipe(style.id);
  const outline=plan.envelope.outline,holes=plan.voids||[],floor=plan.floor,attic=floor==='attic',outlineBox=ringBounds(outline),h=plan.clearHeight,slab=plan.slabThickness??.30;
  const originalCellar=floor==='basement'&&plan.layout==='existing';
  const renovating=design.id!=='current'&&plan.layout==='renovation'&&!attic&&floor!=='basement',features=renovating?interiorWallFeatures(plan):new Map();
  const sides=new Map();
  function wallPair(key){if(!sides.has(key))sides.set(key,{full:group(root),cut:group(root)});return sides.get(key);}
  function edgeBox(parent,material,a,b,height,bottom,width){const dx=b[0]-a[0],dz=b[1]-a[1];const mesh=box(parent,material,(a[0]+b[0])/2,bottom+height/2,(a[1]+b[1])/2,Math.hypot(dx,dz),height,width);mesh.rotation.y=-Math.atan2(dz,dx);}
  floorMesh(base,outline,floor==='basement'?(originalCellar?m.earth:m.concrete):architecturalFloor,.002,holes);
  edges(outline,(a,b)=>edgeBox(base,m.plinth,a,b,slab,-slab,.009));
  for(const hole of holes)edges(hole,(a,b)=>edgeBox(base,m.wood,a,b,slab,-slab,.026));
  // Finish patches follow the room polygons over a continuous display base.
  for(const r of plan.rooms){
    const wet=['bathroom','bath','kitchen','sauna','utility','garage'].includes(r.kind),finish=(r.finish||'').toLowerCase();
    const cellarFinish=originalCellar?(finish==='brick'?m.brickFloor:m.earth):r.kind==='gym'?(m.rubber||m.concrete):r.kind==='utility'?m.tiles:m.concrete;
    const mat=floor==='basement'?cellarFinish:r.kind==='sauna'?m.boards:wet||finish.includes('tile')?m.tiles:architecturalFloor;
    floorMesh(base,r.polygon,mat,.008,holes);
    if(r.kind==='sauna'&&plan.layout==='renovation'){
      const b=ringBounds(r.polygon),n=Math.ceil(b.width/.086);for(let i=0;i<n;i++)box(base,m.oak,b.x0+(i+.5)*b.width/n,.75,b.z1-.012,b.width/n-.005,1.5,.024);
    }
  }
  for(const w of plan.walls) {
    const dx=w.b[0]-w.a[0],dz=w.b[1]-w.a[1],x=(w.a[0]+w.b[0])/2,z=(w.a[1]+w.b[1])/2;
    const dir=!w.exterior?'partition':Math.abs(dx)>Math.abs(dz)?(z<outlineBox.z?'rear':'front'):(x<outlineBox.x?'left':'right');
    const pair=wallPair(dir), full=attic?Math.min(w.height??h,roofClearance(plan,z)):w.height??h;
    const length=Math.hypot(dx,dz),nx=-dz/length,nz=dx/length,outwardSign=containsPoint(outline,x+nx*.45,z+nz*.45)?-1:1;
    const outside=w.exterior?{material:finishes.exteriorWall,sign:outwardSign}:null;
    makeWall(pair.full,w,full,state,tools,m,false,outside,renovating?design:null);makeWall(pair.cut,w,Math.min(full,w.exterior?.56:.70),state,tools,m,true,outside,renovating?design:null);
    for(const feature of features.get(w.id)||[]){finishFeatureWall(pair.full,w,feature,full,tools,m,design);finishFeatureWall(pair.cut,w,feature,Math.min(full,w.exterior?.56:.70),tools,m,design);}
    if(attic&&w.exterior&&Math.abs(dz)>.1) {
      const z0=Math.min(w.a[1],w.b[1]),z1=Math.max(w.a[1],w.b[1]),ridge=plan.roof?.ridgeZ??4.5;
      if(z0<ridge&&z1>ridge){
        const shape=new THREE.Shape();shape.moveTo(z0,full);shape.lineTo(z1,full);shape.lineTo(z1,roofClearance(plan,z1));shape.lineTo(ridge,roofClearance(plan,ridge));shape.lineTo(z0,roofClearance(plan,z0));shape.closePath();
        const cap=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:w.thickness,bevelEnabled:false}),m.wall);cap.rotation.y=-Math.PI/2;cap.position.x=x+w.thickness/2;pair.full.add(cap);
      }
    }
    if(plan.layout==='renovation'&&floor!=='basement'&&w.exterior&&dir!=='rear'&&!features.has(w.id)) {
      // Place art only where a dwelling room adjoins a long solid piece of wall.
      const panels=wallPanels(w,full).filter(p=>p.bottom<.01&&p.top>1.98&&p.right-p.left>1.28);
      const panel=panels.sort((a,b)=>(b.right-b.left)-(a.right-a.left))[0];
      if(panel){const offset=(panel.left+panel.right)/2,len=Math.hypot(dx,dz),px=w.a[0]+dx/len*offset,pz=w.a[1]+dz/len*offset;
        const toward=dir==='left'?[1,0]:dir==='right'?[-1,0]:[0,-1];const room=plan.rooms.find(r=>containsPoint(r.polygon,px+toward[0]*.45,pz+toward[1]*.45));
        // Keep the picture's 70 cm span clear of the TV on the same solid bay.
        const tvOverlap=room&&(plan.fixtures||[]).some(f=>{
          if(!['tv','wallTv','cinemaPanel'].includes(f.kind)||f.roomId!==room.id)return false;
          const x=px+toward[0]*(w.thickness/2+.018)-f.x,z=pz+toward[1]*(w.thickness/2+.018)-f.z,a=f.rotation||0,c=Math.cos(a),s=Math.sin(a);
          return Math.abs(x*c-z*s)<f.width/2+.38&&Math.abs(x*s+z*c)<f.depth/2+.38;
        });
        if(room&&!tvOverlap&&['living','bedroom','guest','dining','office'].includes(room.kind)){
          const trim=group(pair.full,px+toward[0]*(w.thickness/2+.018),1.58,pz+toward[1]*(w.thickness/2+.018),Math.atan2(toward[0],toward[1]));
          box(trim,m.wood,0,0,0,.70,.83,.031);box(trim,m.paper,0,0,.017,.653,.783,.007);const art=new THREE.Mesh(new THREE.PlaneGeometry(.505,.631),m.art);art.position.z=.022;trim.add(art);
        }
      }
    }
  }
  const integratedFlues=plan.layout==='renovation'&&design.id!=='current';
  for(const c of plan.cores||[]) {const b=ringBounds(c.polygon),pair=wallPair('partition'),top=attic?roofClearance(plan,b.z):h;
    for(const [node,height] of [[pair.full,top],[pair.cut,Math.min(.79,top)]]){
      box(node,m.brick,b.x,height/2,b.z,b.width,height,b.depth);box(node,m.stone,b.x,height+.013,b.z,b.width+.022,.026,b.depth+.022);
      const n=c.flues||2,along=b.width>b.depth;for(let i=0;i<n;i++){const t=(i+.5)/n-.5;box(node,m.dark,b.x+(along?t*b.width:0),height+.029,b.z+(along?0:t*b.depth),along?b.width/n*.56:b.width*.48,.008,along?b.depth*.51:b.depth/n*.54);}
      if(integratedFlues){
        // Retain the surveyed masonry inside a separate mineral finish skin.
        // Every side follows the selected wall finish, including bathroom,
        // landing and attic faces outside the ground-floor cabinet enclosure.
        const skin=.016;
        for(const side of [-1,1]){
          box(node,m.wall,b.x+side*(b.width+skin)/2,height/2,b.z,skin,height,b.depth+2*skin);
          box(node,m.wall,b.x,height/2,b.z+side*(b.depth+skin)/2,b.width,height,skin);
        }
        box(node,m.wall,b.x,height+.018,b.z,b.width+2*skin,.036,b.depth+2*skin);
        const trimHeight=Math.min(.081,height);
        for(const side of [-1,1]){
          box(node,m.trim,b.x+side*(b.width+2*skin+.008)/2,trimHeight/2,b.z,.008,trimHeight,b.depth+2*skin+.016);
          box(node,m.trim,b.x,trimHeight/2,b.z+side*(b.depth+2*skin+.008)/2,b.width+2*skin,trimHeight,.008);
        }
      }
      if(c.enclosure?.kind==='cabinet-panels'){
        // Continue the refrigerator wall's cabinetry around the intact stack.
        // Thin removable faces leave the flue volume untouched; their full
        // outer envelope is also used by physical circulation and the plan.
        const panels=c.enclosure.panels.map(f=>({...f,kind:'wallCabinet',height,panelOnly:true,handleless:true}));
        furnishInterior(node,{...plan,fixtures:panels},tools,finishes);
      }
    }
  }
  for(const s of plan.stairs||[]){if(s.kind==='exterior'&&state.showExterior===false)continue;addFlight(s.kind==='exterior'?base:stairs,s,plan,tools,m);if(s.kind==='hatch'&&s.from===floor){const b=ringBounds(s.polygon);for(const side of [-1,1]){box(ceiling,m.trim,b.x+side*b.width/2,h-.052,b.z,.035,.05,b.depth);box(ceiling,m.trim,b.x,h-.052,b.z+side*b.depth/2,b.width,.05,.035);}}}
  const landingGuards=addLandingGuards(base,plan,tools,m);
  for(const surface of plan.outdoor||[]) {
    if(state.showOutdoor===false||state.showExterior===false&&surface.kind==='landing')continue;
    const b=ringBounds(surface.polygon),mat=surface.kind==='landing'?m.concrete:m.boards;
    floorMesh(base,surface.polygon,mat,.005);
    edges(surface.polygon,(a,b)=>{edgeBox(base,m.plinth,a,b,.16,-.16,.012);
      if(surface.kind==='balcony'&&!(Math.abs(a[1])<.01&&Math.abs(b[1])<.01))rail(tools,base,m.frame,a,b,0,1.09,style,m);});
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
  }else floorMesh(ceiling,outline,m.ceiling,h,plan.stairs?.filter(s=>s.from===floor).map(s=>s.polygon)||[]);
  const fixtures=plan.fixtures||[],overheads=fixtures.filter(f=>f.ceilingMounted);
  furnishInterior(props,{...plan,fixtures:fixtures.filter(f=>!f.ceilingMounted)},tools,finishes);
  if(overheads.length)furnishInterior(ceiling,{...plan,fixtures:overheads},tools,finishes);
  for(const r of plan.rooms) {
    if(attic||plan.layout!=='renovation')continue;
    if(floor==='basement'){
      if(plan.basementFitOut&&['utility','gym'].includes(r.kind)){
        const b=ringBounds(r.polygon);
        box(ceiling,m.frame,b.x,h-.027,b.z,1.0,.045,.24);
        box(ceiling,m.glow,b.x,h-.053,b.z,.95,.008,.20);
      }
      continue;
    }
    if(renovating)finishCeiling(ceiling,r,plan,tools,m,design);
    const table=plan.fixtures?.find(f=>f.roomId===r.id&&f.kind==='diningTable'),b=ringBounds(r.polygon);
    if(table){for(const t of [-.25,.25])makePendant(decor,table.x+t*table.width,table.z,h,tools,m,design.id==='current'?style.recipe.fixture:design.pendant);}
    else if(r.area>3&&containsPoint(r.polygon,b.x,b.z)){tools.cyl(ceiling,m.frame,b.x,h-.027,b.z,.108,.12,.048);tools.cyl(ceiling,m.glow,b.x,h-.054,b.z,.105,.106,.009);}
  }
  for(const node of [base,ceiling,props,decor,changes,stairs,...[...sides.values()].flatMap(s=>[s.full,s.cut])])batchGroup(node);
  stairs.visible=state.showStairs!==false;
  root.position.y=plan.elevation;root.userData.interiorRecipe=design.id;
  root.userData.stairLandingGuards=landingGuards;root.userData.integratedFlues=integratedFlues;
  return {root,groups:{base,ceiling,props,decor,changes,stairs,sides}, updateVisibility(view,camera,opts={}){let changed=false;const room=view==='room'||view==='building';ceiling.visible=room&&opts.showCeiling!==false;props.visible=opts.showFurniture!==false;decor.visible=props.visible;const stairsVisible=(opts.showStairs??state.showStairs)!==false;if(stairs.visible!==stairsVisible)changed=true;stairs.visible=stairsVisible;
    for(const [direction,s] of sides){const far=direction==='left'?camera.x>outlineBox.x:direction==='right'?camera.x<outlineBox.x:direction==='rear'?camera.z>outlineBox.z:direction==='front'?camera.z<outlineBox.z:false;
      if(s.full.visible!==(room||far))changed=true;s.full.visible=room||far;s.cut.visible=!s.full.visible;}return changed;
  },dispose(){root.traverse(obj=>obj.geometry?.dispose());root.removeFromParent();}};
}
