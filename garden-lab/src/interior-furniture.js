import * as THREE from '../vendor/three.module.js';
import {getInteriorStyleRecipe} from './interior-style-recipes.js';

// Furniture stays anchored to the metric footprint in the shared plan. Local
// +z is the chair/cabinet front. A table footprint describes the top itself.
export function furnishInterior(parent,plan,tools,finishes) {
  const {box,rounded,oval,cyl,rod,group}=tools,{m,style}=finishes;
  const design=finishes.interiorRecipe||getInteriorStyleRecipe(style.id), renovated=design.id!=='current';
  const form=style.recipe.furniture, platform=['platform','low-pebble','block','pebble','deco'].includes(form), soft=['pebble','low-pebble','shell','runner','deco'].includes(form);
  const family=['trestle','crossbuck','taper','sling'].includes(form)?m.wood:m.frame;
  function legs(g,w,d,h,r=.025,material=family,splay=.025) {
    for(const a of [-1,1])for(const b of [-1,1]) rod(g,material,[a*(w/2+splay),.018,b*(d/2+splay)],[a*w/2,h,b*d/2],r,r*.7);
  }
  function turned(g,mat,x,y,z,profile,width,depth) {
    const geo=new THREE.LatheGeometry(profile.map(([r,h])=>new THREE.Vector2(r,h)),32),obj=new THREE.Mesh(geo,mat);obj.position.set(x,y,z);obj.scale.set(width,1,depth);g.add(obj);return obj;
  }
  function plant(g,x,y,z,size=.23) {
    const s=size; cyl(g,m.pot,x,y+s*.32,z,s*.32,s*.24,s*.64,18);
    for(let i=0;i<7;i++) {
      const ang=i*2.4,dx=Math.sin(ang)*s*(.38+.07*(i%3)),dz=Math.cos(ang)*s*.4,top=y+s*(1.5+.15*(i%4));
      rod(g,m.leaf,[x,y+s*.54,z],[x+dx,top,z+dz],s*.018);
      const leaf=oval(g,i%2?m.leaf:m.leafLight,x+dx,top,z+dz,s*.23,s*.65,s*.09);leaf.rotation.set(Math.cos(ang)*.65,ang,Math.sin(ang)*.65);
    }
  }
  function books(g,x,y,z,w=.31) {
    const stack=group(g,x,y,z,.11);box(stack,m.accent,0,.024,0,w,.048,w*.68);box(stack,m.paper,0,.063,0,w*.9,.031,w*.66).rotation.y=-.18;box(stack,m.wood,0,.087,0,w*.81,.017,w*.65);
  }
  function weavePanel(g,x,y,z,w,h,material=m.cane||m.wood) {
    // Open cane weave is real geometry, bounded to this measured panel.
    const columns=Math.min(12,Math.max(4,Math.round(w/.065))),rows=Math.min(12,Math.max(3,Math.round(h/.065)));
    for(let i=0;i<=columns;i++)box(g,material,x-w/2+i*w/columns,y,z,.012,h,.013);
    for(let i=0;i<=rows;i++)box(g,material,x,y-h/2+i*h/rows,z+.008,w,.01,.011);
  }
  function slatPanel(g,x,y,z,w,h,material=m.wood,spacing=.09) {
    const n=Math.max(3,Math.min(24,Math.round(w/spacing)));
    for(let i=0;i<n;i++)rounded(g,material,x-w/2+(i+.5)*w/n,y,z,w/n*.62,h,.026,.008);
  }
  function arch(g,mat,x,y,z,w,h,th=.025) {
    const base=h-w/2,n=16;rod(g,mat,[x-w/2,y,z],[x-w/2,y+base,z],th);rod(g,mat,[x+w/2,y,z],[x+w/2,y+base,z],th);
    for(let i=0;i<n;i++){const a=i*Math.PI/n,b=(i+1)*Math.PI/n;rod(g,mat,[x+Math.cos(a)*w/2,y+base+Math.sin(a)*w/2,z],[x+Math.cos(b)*w/2,y+base+Math.sin(b)*w/2,z],th);}
  }
  function chair(g,x,z,angle,w=.47,d=.49) {
    if(renovated){
      const cg=group(g,x,0,z,angle),kind=design.chair,seat=.445;
      if(['tulip','shell','block'].includes(kind)){
        if(kind==='block')rounded(cg,m.stone,0,.20,0,w*.70,.40,d*.64,.035);
        else {cyl(cg,m.steel,0,.21,0,.035,.09,.40,18);cyl(cg,m.steel,0,.027,0,w*.36,w*.42,.052,24);}
      }else if(['cantilever','steel','wire','sling'].includes(kind)){
        for(const a of [-1,1]){const xx=a*w*.42;rod(cg,m.frame,[xx,.028,-d*.4],[xx,.028,d*.41],.017);rod(cg,m.frame,[xx,.028,d*.41],[xx,seat,d*.35],.017);rod(cg,m.frame,[xx,seat,d*.35],[xx,seat,-d*.36],.017);}
      }else legs(cg,w*.72,d*.69,seat-.02,.022,m.wood,['wishbone','bentwood'].includes(kind)?.035:.012);
      const hard=['spindle','slatted','mission','crossbuck','wishbone','cane'].includes(kind);
      rounded(cg,hard?m.oak:m.fabric,0,seat,0,w*.97,hard?.055:.10,d*.91,hard?.018:.045);
      if(['tulip','shell','curved','upholstered','block'].includes(kind)){
        const shell=oval(cg,kind==='tulip'?m.ceramic:m.fabric,0,.675,-d*.33,w*.95,.43,.14);shell.rotation.x=-.13;
        if(kind==='shell')for(let i=0;i<5;i++){const t=(i-2)/2;rounded(cg,m.accent,t*w*.19,.685-Math.abs(t)*.045,-d*.285,w*.17,.34,.032,.012);}
      }else if(kind==='iron'){
        arch(cg,m.frame,0,seat,-d*.39,w*.84,.47,.014);for(const a of [-1,1]){const ring=new THREE.Mesh(new THREE.TorusGeometry(w*.16,.011,5,18),m.frame);ring.position.set(a*w*.18,.66,-d*.39);cg.add(ring);}
      }else if(kind==='cane'){
        rounded(cg,m.wood,0,.697,-d*.40,w,.39,.045,.018);weavePanel(cg,0,.695,-d*.37,w*.82,.30);
      }else if(['sling','wire'].includes(kind)){
        for(const a of [-1,1])rod(cg,m.frame,[a*w*.42,.43,-d*.36],[a*w*.42,.88,-d*.46],.017);
        if(kind==='wire'){for(let i=0;i<7;i++){const xx=-w*.38+i*w*.76/6;rod(cg,m.frame,[xx,.49,-d*.37],[xx,.86,-d*.44],.006);}rod(cg,m.frame,[-w*.42,.87,-d*.44],[w*.42,.87,-d*.44],.017);}
        else {const back=box(cg,m.fabric,0,.69,-d*.40,w*.78,.38,.026);back.rotation.x=-.16;}
      }else {
        const h=['mission','crossbuck'].includes(kind)?.44:.33;rounded(cg,m.wood,0,seat+h,-d*.40,w*.96,.07,.052,.02);
        if(kind==='crossbuck'){for(const a of [-1,1])rod(cg,m.wood,[a*w*.39,seat+.03,-d*.40],[-a*w*.39,seat+h-.03,-d*.40],.021);}
        else if(kind==='wishbone'){for(const a of [-1,1])rod(cg,m.wood,[0,seat+.035,-d*.40],[a*w*.35,seat+h-.025,-d*.40],.015);}
        else if(kind==='bentwood'){arch(cg,m.wood,0,seat,-d*.40,w*.88,.42,.018);}
        else slatPanel(cg,0,seat+h*.5,-d*.40,w*.82,h-.035,m.wood,kind==='spindle'?.095:.14);
      }
      return;
    }
    const cg=group(g,x,0,z,angle);legs(cg,w*.73,d*.71,.43,.025);
    rounded(cg,m.wood,0,.427,0,w,.055,d,.018); rounded(cg,m.fabric,0,.465,.015,w*.96,.07,d*.9,.026);
    const back=rounded(cg,form==='shell'?m.ceramic:m.wood,0,.708,-d*.43,w*.93,.31,.06,.027);back.rotation.x=-.095;
    for(const a of [-1,1])rod(cg,m.wood,[a*w*.35,.43,-d*.37],[a*w*.34,.71,-d*.44],.018);
  }
  function sofa(g,w,d,{arms=true,cushions=true}={}) {
    if(renovated){
      const kind=design.seating,low=['platform','pebble-low','sling-low'].includes(kind),seat=low?.33:.43,arm=Math.min(.12,w*.1),back=Math.min(.17,d*.22),side=arms?arm:0,span=w-2*side;
      const stone=['masonry','block','pebble','pebble-low'].includes(kind),pod=kind==='pod',timber=['woven','slatted','bench','crossbuck','mission','taper','runner','sling','sling-low'].includes(kind),open=timber||['sled','steel','leather'].includes(kind);
      if(stone){rounded(g,kind==='masonry'?m.wall:m.stone,0,seat*.36,0,w*.98,seat*.70,d*.98,kind.startsWith('pebble')?.105:.025);}
      else if(pod){oval(g,m.ceramic,0,.24,0,w,.38,d);cyl(g,m.steel,0,.07,0,Math.min(w,d)*.26,Math.min(w,d)*.32,.12,20);}
      else if(kind==='deco'){for(let i=0;i<3;i++)rounded(g,i===1?m.bronze:m.stone,0,.055+i*.055,0,w-i*.045,.055,d-i*.032,.025);}
      else if(['platform','channel'].includes(kind)){rounded(g,kind==='platform'?m.wood:m.frame,0,seat*.32,0,w,.19,d,.025);}
      else if(['sled','steel','leather'].includes(kind))for(const a of [-1,1]){const x=a*w*.43;rod(g,m.frame,[x,.025,-d*.42],[x,.025,d*.42],.024);rod(g,m.frame,[x,.025,d*.42],[x,seat-.07,d*.42],.024);rod(g,m.frame,[x,.025,-d*.42],[x,seat-.07,-d*.42],.024);}
      else if(kind==='runner')for(const a of [-1,1]){const x=a*w*.43,curve=new THREE.CatmullRomCurve3([new THREE.Vector3(x,.23,-d*.40),new THREE.Vector3(x,.035,-d*.42),new THREE.Vector3(x,.025,d*.32),new THREE.Vector3(x,.20,d*.44)]);g.add(new THREE.Mesh(new THREE.TubeGeometry(curve,14,.027,7,false),m.wood));}
      else legs(g,w*.82,d*.74,seat-.08,kind==='taper'?.032:.04,m.wood,kind==='taper'?.035:.008);
      if(open){rounded(g,timber?m.wood:m.frame,0,seat-.10,0,w*.98,.075,d*.96,.019);}
      const n=kind==='pod'?1:Math.max(1,Math.round(span/.83));
      for(let i=0;i<n;i++){
        const x=-span/2+(i+.5)*span/n;
        const organic=kind.startsWith('pebble')||pod;
        if(organic)oval(g,m.fabric,x,seat-.035,back*.23,span/n*.99,.22,d-back*.8);
        else rounded(g,m.fabric,x,seat-.035,back*.25,span/n-.018,.16,d-back-.015,['block','masonry'].includes(kind)?.025:.055);
        if(pod){const shell=oval(g,m.ceramic,x,.63,-d*.30,span*.99,.69,d*.36);shell.rotation.x=-.12;const pad=oval(g,m.fabric,x,.62,-d*.24,span*.88,.51,.17);pad.rotation.x=-.12;}
        else {
          const b=rounded(g,m.fabric,x,seat+.225,-d/2+back*.58,span/n-.014,low?.37:.45,back,organic?.07:.035);b.rotation.x=-.08;
          if(['channel','deco'].includes(kind)){const count=Math.max(3,Math.round((span/n)/.13));for(let j=0;j<count;j++)rounded(g,j%2&&kind==='deco'?m.duvet:m.fabric,x-(span/n)/2+(j+.5)*(span/n)/count,seat+.235,-d/2+back*1.10,(span/n)/count*.91,.39,.036,.015);}
        }
      }
      if(open){
        const backZ=-d/2+.025;for(const a of [-1,1])box(g,timber?m.wood:m.frame,a*(w/2-.03),seat+.08,backZ,.06,.59,.06);
        if(kind==='woven')weavePanel(g,0,seat+.14,backZ,w-.08,.43);
        else if(['slatted','mission','bench','crossbuck','taper'].includes(kind)){
          if(kind==='crossbuck')for(const a of [-1,1])rod(g,m.wood,[a*w*.42,seat-.08,backZ],[-a*w*.42,seat+.35,backZ],.032);
          else slatPanel(g,0,seat+.14,backZ,w-.08,.44,m.wood,kind==='mission'?.17:.10);
        }else box(g,timber?m.wood:m.frame,0,seat+.34,backZ,w,.065,.042);
      }
      if(arms)for(const a of [-1,1]){
        const x=a*(w/2-arm/2);
        if(timber){
          rounded(g,m.wood,x,seat+.22,0,arm,.055,d*.96,.017);
          for(const z of [-d*.4,d*.4])box(g,m.wood,x,seat*.57,z,arm*.48,seat+.13,.045);
          if(kind==='woven')weavePanel(group(g,x,0,0,Math.PI/2),0,seat*.70,0,d*.79,seat*.61);
        }else if(stone)rounded(g,kind==='masonry'?m.wall:m.stone,x,seat*.70,0,arm,seat*1.30,d*.97,kind.startsWith('pebble')?.055:.015);
        else if(['steel','sled','leather'].includes(kind))rod(g,m.frame,[x,seat+.20,-d*.41],[x,seat+.20,d*.41],.027);
        else if(pod)oval(g,m.ceramic,x,seat+.06,0,arm*1.35,.42,d*.91);
        else rounded(g,m.fabric,x,seat+.07,0,arm,.34,d*.96,.052);
      }
      if(cushions&&span>.95)for(const a of [-1,1]){const pillow=rounded(g,a>0?m.accent:m.duvet,a*span*.31,seat+.13,-d*.11,Math.min(.38,span*.3),.31,.13,.061);pillow.rotation.set(-.20,a*.16,a*.12);}
      return;
    }
    const h=platform?.37:.43,arm=Math.min(.14,w*.09),side=arms?arm:0,back=Math.min(.18,d*.25),seatW=w-2*side;
    if(platform) rounded(g,m.wood,0,.115,0,w*.98,.18,d*.95,.035); else legs(g,w*.83,d*.77,.19,.047,m.wood,.015);
    rounded(g,m.fabric,0,.24,0,w,.22,d,soft?.1:.055);
    const n=Math.max(1,Math.round(seatW/.82));
    for(let i=0;i<n;i++) {const x=-seatW/2+(i+.5)*seatW/n;
      rounded(g,m.fabric,x,h-.012,back*.43,seatW/n-.013,.19,d-back-.042,soft?.1:.054);
      const b=rounded(g,m.fabric,x,.64,-d*.5+back*.67,seatW/n-.008,.48,back*1.34,.065);b.rotation.x=-.069;
    }
    if(arms)for(const a of [-1,1]) rounded(g,m.fabric,a*(w/2-arm/2),.466,d*.013,arm,.35,d*.94,.055);
    if(cushions&&seatW>.95)for(const a of [-1,1]) {
      const pillow=rounded(g,a===1?m.accent:m.duvet,a*seatW*.32,.57,-d*.19,Math.min(seatW*.34,.43),.34,.145,.071);pillow.rotation.set(-.22,a*.13,a*.13);
    }
    if(form==='channel') for(let i=1;i<Math.floor(seatW/.11);i++)box(g,m.accent,-seatW/2+i*.11,.68,-d/2+back*1.38,.011,.25,.008);
  }
  function sectional(g,w,d) {
    const depth=Math.min(.91,w*.33,d*.29),rear=group(g,-w/2+depth/2,0,0,Math.PI/2);sofa(rear,d,depth,{arms:false});
    const armW=w-depth-.016;
    for(const a of [-1,1]) {const arm=group(g,depth/2,0,a*(d/2-depth/2),a>0?Math.PI:0);sofa(arm,armW,depth,{arms:false,cushions:false});}
  }
  function table(g,w,d,dining) {
    if(renovated){
      const kind=design.table,h=dining?.755:['low-slab','boulder-low'].includes(kind)?.27:.35,top=kind==='farmhouse'?.075:.05;
      const stone=['boulder','boulder-low','deco','monolith','waterfall'].includes(kind);
      if(kind==='tulip')turned(g,m.steel,0,0,0,[[.001,0],[.34,.014],[.35,.041],[.12,.10],[.048,h*.68],[.08,h*.85],[.20,h-.035]],Math.min(w,d),Math.min(w,d));
      else if(['boulder','boulder-low'].includes(kind))for(const a of [-1,1])oval(g,m.stone,a*w*.23,(h-top)*.48,a*d*.045,w*.29,h-top,d*.62);
      else if(kind==='waterfall')for(const a of [-1,1])rounded(g,m.stone,a*(w/2-.043),(h-top)/2,0,.086,h-top,d,.015);
      else if(kind==='deco')for(let i=0;i<3;i++)rounded(g,i===1?m.bronze:m.stone,0,(i+.5)*(h-top)/3,0,w*(.52-i*.10),(h-top)/3,d*(.72-i*.10),.025);
      else if(kind==='monolith')rounded(g,m.stone,0,(h-top)/2,0,w*.68,h-top,d*.70,.027);
      else if(['trestle','teak','crossbuck','slat-trestle','oval-trestle','workshop','low-slab'].includes(kind)){
        const metal=kind==='workshop',mat=metal?m.frame:m.wood;
        for(const a of [-1,1]){
          const x=a*w*.30;
          if(kind==='crossbuck')for(const b of [-1,1])rod(g,mat,[x,.035,b*d*.38],[x,h-top,-b*d*.29],.04);
          else if(kind==='workshop')for(const b of [-1,1])rod(g,mat,[x,.025,b*d*.40],[x,h-top,b*d*.22],.027);
          else {box(g,mat,x,(h-top)/2,0,Math.min(.11,w*.085),h-top,d*.68);box(g,mat,x,.036,0,.20,.072,d*.82);}
        }
        box(g,mat,0,h*.30,0,w*.61,.065,.068);
      }else if(kind==='farmhouse')for(const a of [-1,1])for(const b of [-1,1])turned(g,m.wood,a*w*.40,0,b*d*.35,[[.04,0],[.046,.06],[.026,h*.50],[.055,h*.66],[.042,h-.07]],1,1);
      else legs(g,w*.76,d*.69,h-top,kind==='chrome'?.025:.037,kind==='chrome'?m.steel:m.wood,kind==='oval-taper'?.055:.012);
      const surface=stone?m.stone:['tulip','chrome'].includes(kind)?m.ceramic:m.oak;
      if(kind.startsWith('oval')||['tulip','boulder','boulder-low'].includes(kind)){const topMesh=cyl(g,surface,0,h-top/2,0,1,1,top,48);topMesh.scale.x=w/2;topMesh.scale.z=d/2;}
      else if(kind==='slat-trestle'){const n=Math.max(3,Math.ceil(d/.09));for(let i=0;i<n;i++)rounded(g,m.oak,0,h-top/2,-d/2+(i+.5)*d/n,w,top,d/n-.007,.012);}
      else rounded(g,surface,0,h-top/2,0,w,top,d,kind==='teak'?.025:.018);
      if(!dining){books(g,-w*.18,h,0,Math.min(.29,w*.28));turned(g,m.ceramic,w*.20,h,-d*.04,[[0,0],[.34,0],[.5,.045],[.49,.055],[.33,.012],[0,.01]],.19,.19);return;}
      const n=Math.max(1,Math.min(4,Math.floor(w/.64)));for(let i=0;i<n;i++)for(const a of [-1,1])chair(g,-w/2+(i+.5)*w/n,a*(d/2+.24),a>0?Math.PI:0);
      plant(g,0,h,0,.15);return;
    }
    const h=dining?.755:.36,th=dining?.059:.05;
    if(form==='shell'||form==='deco') {cyl(g,m.frame,0,h*.48,0,Math.min(w,d)*.15,Math.min(w,d)*.22,h*.91);cyl(g,m.steel,0,.035,0,Math.min(w,d)*.35,Math.min(w,d)*.37,.055);}
    else if(platform&&!dining) rounded(g,m.stone,0,h*.41,0,w*.7,h*.75,d*.61,.055);
    else legs(g,w*.76,d*.7,h-th*.7,dining?.045:.035,m.wood,form==='taper'?.06:.012);
    rounded(g,(soft&&!dining)?m.stone:m.oak,0,h-th/2,0,w,th,d,Math.min(.026,th*.44));
    if(!dining){books(g,-w*.19,h,0,Math.min(.31,w*.3));turned(g,m.ceramic,w*.18,h,-d*.06,[[0,0],[.34,0],[.5,.045],[.49,.055],[.33,.012],[0,.01]],.21,.21);return;}
    const n=Math.max(1,Math.min(4,Math.floor(w/.64)));
    for(let i=0;i<n;i++)for(const a of [-1,1])chair(g,-w/2+(i+.5)*w/n,a*(d/2+.24),a>0?Math.PI:0);
    plant(g,0,h,0,.16);
    if(w>1.65) {for(const a of [-1,1]){cyl(g,m.bronze,a*.34,h+.075,.027,.029,.036,.15);cyl(g,m.linen,a*.34,h+.19,.027,.017,.017,.085);}}
  }
  function bed(g,w,d,f={}) {
    if(f.headboard){const a=Math.atan2(-f.headboard[0],-f.headboard[1]);g=group(g,0,0,0,a);if(Math.abs(f.headboard[0])>.5)[w,d]=[d,w];}
    else if(w>d){const swap=w;w=d;d=swap;g=group(g,0,0,0,Math.PI/2);}
    if(renovated){
      const kind=design.bed==='canopy'&&(w<1.2||f.headboardMaxHeight)?'woven':design.bed,low=['platform','platform-wide','slatted-low','plinth'].includes(kind),mattress=low?.25:.38;
      const wood=['canopy','slatted','slatted-low','platform','platform-wide','mission','crossbuck','taper','woven','cane'].includes(kind);
      if(['steel','iron'].includes(kind)){legs(g,w*.88,d*.83,.24,.024,m.frame,.005);box(g,m.frame,0,.245,0,w,.055,d);}
      else if(kind==='floating'){rounded(g,m.frame,0,.105,0,w*.66,.21,d*.65,.025);rounded(g,m.wood,0,.25,0,w,.085,d,.026);}
      else if(kind==='taper'){legs(g,w*.82,d*.83,.20,.035,m.wood,.025);rounded(g,m.wood,0,.23,0,w,.12,d,.03);}
      else if(kind==='capsule'){rounded(g,m.ceramic,0,.25,0,w,.34,d,.14);}
      else if(kind==='deco'){for(let i=0;i<3;i++)rounded(g,i===1?m.bronze:m.wood,0,.045+i*.065,0,w-i*.025,.065,d-i*.025,.022);}
      else rounded(g,kind==='plinth'?m.stone:m.wood,0,low?.10:.19,0,w,low?.20:.28,d,kind==='sculpted'?.10:.025);
      rounded(g,m.fabric,0,mattress,0,w*.96,low?.19:.24,d*.95,.060);
      rounded(g,m.duvet,0,mattress+.135,d*.13,w*.97,.105,d*.66,.048);
      rounded(g,m.linen,0,mattress+.18,-d*.13,w*.95,.042,d*.13,.02);
      rounded(g,m.accent,0,mattress+.19,d*.33,w*.96,.028,d*.16,.012);
      const back=-d/2+.045,headY=low?.47:.62,headH=low?.69:1.03;
      const bedBase=g;g=group(g);
      if(kind==='canopy'){
        for(const a of [-1,1])for(const b of [-1,1])box(g,m.wood,a*(w/2-.035),1.08,b*(d/2-.035),.07,2.16,.07);
        for(const a of [-1,1]){box(g,m.wood,a*(w/2-.035),2.13,0,.075,.075,d);box(g,m.wood,0,2.13,a*(d/2-.035),w,.075,.075);}
        const n=Math.min(12,Math.round(w/.15));for(let i=0;i<n;i++)box(g,m.wood,-w/2+(i+.5)*w/n,2.115,0,.029,.035,d*.94);
        weavePanel(g,0,.65,back,w-.14,.72);
      }else if(['iron','steel'].includes(kind)){
        if(kind==='iron')arch(g,m.frame,0,.21,back,w*.94,1.02,.021);else{for(const a of [-1,1])rod(g,m.frame,[a*w*.46,.10,back],[a*w*.46,1.02,back],.022);rod(g,m.frame,[-w*.46,1.02,back],[w*.46,1.02,back],.022);}
        for(let i=1;i<Math.max(4,Math.round(w/.17));i++){const xx=-w*.45+i*w*.9/Math.max(4,Math.round(w/.17));rod(g,m.frame,[xx,.33,back],[xx,.89,back],.010);}
      }else if(['cane','woven'].includes(kind)){rounded(g,m.wood,0,headY,back,w,headH,.06,.025);weavePanel(g,0,headY,back+.035,w*.88,headH*.78);}
      else if(['mission','crossbuck','slatted','slatted-low'].includes(kind)){
        for(const a of [-1,1])box(g,m.wood,a*(w/2-.028),headY,back,.056,headH,.065);
        for(const y of [headY-headH/2+.035,headY+headH/2-.035])box(g,m.wood,0,y,back,w,.07,.065);
        if(kind==='crossbuck')for(const a of [-1,1])rod(g,m.wood,[a*w*.44,headY-headH*.41,back],[-a*w*.44,headY+headH*.41,back],.032);
        else slatPanel(g,0,headY,back,w*.91,headH*.88,m.wood,kind==='mission'?.18:.085);
      }else if(kind==='deco'){
        const n=7;for(let i=0;i<n;i++){const t=Math.abs(i-(n-1)/2)/((n-1)/2),height=1.18-.33*t;rounded(g,m.fabric,-w/2+(i+.5)*w/n,.15+height/2,back,w/n-.012,height,.085,.043);box(g,m.bronze,-w/2+(i+.5)*w/n+.012,.15+height/2,back+.045,.009,height*.80,.008);}
      }else if(kind==='channel'){
        const n=Math.max(4,Math.round(w/.18));for(let i=0;i<n;i++)rounded(g,m.fabric,-w/2+(i+.5)*w/n,.68,back,w/n-.008,1.02,.10,.043);
      }else if(['sculpted','curved','capsule'].includes(kind)){
        const shell=oval(g,kind==='capsule'?m.ceramic:m.fabric,0,.65,back,w,1.16,.13);shell.rotation.x=-.035;
        if(kind==='capsule')oval(g,m.fabric,0,.66,back+.042,w*.86,.84,.05);
      }else rounded(g,wood?m.oak:kind==='plinth'?m.stone:m.fabric,0,headY,back,w,headH,.072,low?.018:.045);
      // Scale the completed headboard, including rod radii and curved tops,
      // against the measured sill clearance rather than a nominal design height.
      if(f.headboardMaxHeight){g.updateWorldMatrix(true,true);const origin=new THREE.Vector3();g.getWorldPosition(origin);const actualHeight=new THREE.Box3().setFromObject(g).max.y-origin.y;g.scale.y=Math.min(1,f.headboardMaxHeight/actualHeight);}
      const n=w>1.2?2:1;for(let i=0;i<n;i++){const pillow=rounded(bedBase,m.linen,(i-(n-1)/2)*w*.46,mattress+.15,-d*.32,Math.min(.64,w*.75/n),.135,.38,.06);pillow.rotation.x=.1;}
      return;
    }
    const foot=platform?.12:.18;rounded(g,m.wood,0,foot,0,w,.22,d,.045);
    rounded(g,m.fabric,0,.335,0,w*.97,.265,d*.97,.071);rounded(g,m.duvet,0,.49,d*.135,w*.985,.115,d*.66,.051);
    rounded(g,m.linen,0,.545,-d*.126,w*.96,.052,d*.14,.023);rounded(g,m.accent,0,.554,d*.335,w*.979,.035,d*.16,.014);
    rounded(g,soft?m.fabric:m.oak,0,.56,-d*.485,w,.88,.075,.034);
    const n=w>1.2?2:1;for(let i=0;i<n;i++) {const pillow=rounded(g,m.linen,(i-(n-1)/2)*w*.46,.505,-d*.318,Math.min(.64,w*.75/n),.14,.4,.068);pillow.rotation.x=.1;}
  }
  function faceFront(g,f,w,d) {
    if(!f.front)return [g,w,d];
    const angle=Math.atan2(f.front[0],f.front[1]);return Math.abs(f.front[0])>.5?[group(g,0,0,0,angle),d,w]:[group(g,0,0,0,angle),w,d];
  }
  function kitchen(g,f,w,d,tall=false) {
    [g,w,d]=faceFront(g,f,w,d);const h=tall?1.95:.9;
    if(renovated){
      const kind=design.cabinet,body=['cane','slatted','shoji','midcentury','framed'].includes(kind)?m.wood:kind==='steel'?m.frame:kind==='gloss'?m.lacquer||m.cabinet:m.cabinet;
      box(g,m.frame,0,.06,-.012,w*.94,.12,d*.88);
      if(kind==='capsule')rounded(g,body,0,(h+.09)/2,-.013,w,h-.09,d-.022,.075);else box(g,body,0,(h+.09)/2,-.013,w,h-.09,d-.022);
      const n=Math.max(1,Math.round(w/(tall?.55:.65)));
      for(let i=0;i<n;i++){
        const x=-w/2+(i+.5)*w/n,dw=w/n-.014,dh=h-.15,y=(h+.12)/2,z=d/2;
        if(kind==='capsule')rounded(g,m.ceramic,x,y,z,dw,dh,.03,.014);else box(g,body,x,y,z,dw,dh,.016);
        if(['shaker','framed','cane','shoji','midcentury','steel'].includes(kind)){
          const frame=kind==='steel'?m.frame:m.oak,thin=kind==='shoji'?.025:.043;
          if(kind==='shoji')box(g,m.linen,x,y,z+.014,dw-.04,dh-.04,.008);
          for(const a of [-1,1]){box(g,frame,x+a*(dw/2-thin/2),y,z+.022,thin,dh,.026);box(g,frame,x,y+a*(dh/2-thin/2),z+.022,dw,thin,.026);}
          if(kind==='cane')weavePanel(g,x,y,z+.026,dw-.09,dh-.09);
          if(kind==='shoji'){for(let k=1;k<4;k++)box(g,m.wood,x,y-dh/2+k*dh/4,z+.031,dw,.018,.018);box(g,m.wood,x,y,z+.032,.018,dh,.018);}
          if(kind==='midcentury'){box(g,m.wood,x,y+.17,z+.026,dw,.023,.02);box(g,m.frame,x+dw*.32,y,z+.028,.018,dh*.22,.015);}
          if(kind==='steel')for(const a of [-1,1])for(const b of [-1,1])oval(g,m.steel,x+a*dw*.40,y+b*dh*.43,z+.042,.015,.015,.011);
        }else if(kind==='fluted'){
          const flutes=Math.min(14,Math.max(4,Math.round(dw/.048)));for(let k=0;k<flutes;k++)cyl(g,m.wood,x-dw/2+(k+.5)*dw/flutes,y,z+.024,dw/flutes*.35,dw/flutes*.35,dh-.022,8);
        }else if(kind==='slatted')slatPanel(g,x,y,z+.022,dw-.02,dh-.01,m.wood,.075);
        else if(kind==='deco'){
          for(const a of [-1,1]){box(g,m.bronze,x+a*dw*.39,y,z+.022,.008,dh*.86,.008);box(g,m.bronze,x,y+a*dh*.43,z+.022,dw*.79,.008,.008);}
          box(g,m.bronze,x,y,z+.024,.011,dh*.78,.009);
        }
        if(['flush','capsule','gloss'].includes(kind))box(g,m.frame,x,h-.11,z+.018,dw*.75,.012,.013);
        else if(!['midcentury','shoji'].includes(kind)){
          if(['shaker','framed'].includes(kind))cyl(group(g,x+dw*.30,tall?1.04:h-.14,z+.04,Math.PI/2),m.bronze,0,0,0,.018,.018,.028,12).rotation.x=Math.PI/2;
          else box(g,kind==='steel'?m.steel:m.bronze,x+dw*.30,tall?1.03:h-.14,z+.043,.015,tall?.20:.09,.025);
        }
      }
      if(!tall){rounded(g,m.stone,0,h,0,w+.006,.048,d+.008,.014);if(['flush','gloss','deco'].includes(kind))box(g,m.glow,0,h-.048,d/2-.015,w*.94,.008,.008);}
      return;
    }
    box(g,m.frame,0,.06,-.012,w*.95,.12,d*.91);box(g,tall?m.wood:m.cabinet,0,(h+.09)/2,0,w,h-.09,d-.022);
    const n=Math.max(1,Math.round(w/(tall?.54:.66)));
    for(let i=0;i<n;i++) {
      const x=-w/2+(i+.5)*w/n, dw=w/n-.012;
      box(g,tall?m.wood:m.cabinet,x,(h+.12)/2,d/2, dw,h-.15,.013);
      if(!tall){box(g,m.frame,x,h-.237,d/2+.009,dw*.95,.008,.006);box(g,m.bronze,x,h-.115,d/2+.017,Math.min(.18,dw*.36),.014,.023);}
      else box(g,m.bronze,x+dw*.29,1.08,d/2+.018,.016,.17,.023);
    }
    if(!tall)rounded(g,m.stone,0,h,0,w+.006,.045,d+.008,.012);
  }
  function faucet(g,x,y,z,h=.26) {
    cyl(g,m.steel,x,y+h*.47,z,.012,.016,h*.94,12);
    rod(g,m.steel,[x,y+h*.91,z],[x,y+h,z+.036],.013);rod(g,m.steel,[x,y+h,z+.036],[x,y+h,z+.115],.013);cyl(g,m.steel,x,y+h-.018,z+.115,.013,.013,.036,12);
    box(g,m.steel,x+.025,y+.085,z,.047,.012,.017);
  }
  function bowl(g,w,d,h,bottom,mat=m.ceramic) {
    turned(g,mat,0,bottom,0,[[.001,.01],[.35,.01],[.42,h*.15],[.485,h*.75],[.49,h*.93],[.47,h],[.423,h],[.4,h*.92],[.33,h*.35],[.25,h*.24],[.001,h*.24]],w,d);
    cyl(g,m.steel,0,bottom+h*.251,0,Math.min(.025,w*.06),Math.min(.025,w*.06),.003,12);
  }
  function bathroom(g,f,w,d) {
    if(['basin','sink','toilet','wc','bidet','shower','hotTub','tub'].includes(f.kind))[g,w,d]=faceFront(g,f,w,d);
    if(f.kind==='tub') {
      const height=f.height||.55;bowl(g,w,d,height,0,renovated&&['organic-modern','desert-modern','organic-japandi'].includes(design.id)?m.stone:m.ceramic);const sign=d>w?1:0;
      const tap=group(g,sign?0:-w*.4,0,sign?-d*.41:0,sign?0:Math.PI/2);faucet(tap,0,height-.04,0,.16);
      if(f.variant==='whirlpool')for(let i=0;i<8;i++){const a=i*Math.PI/4;oval(g,m.steel,w*.39*Math.sin(a),.43,d*.39*Math.cos(a),.029,.026,.029);}
    }else if(f.kind==='hotTub') {
      const h=f.height||.86,wall=.12,iw=w-2*wall,id=d-2*wall;
      rounded(g,m.frame,0,.08,0,w*.98,.16,d*.98,.035);
      // Four skirt walls surround a hollow well; a solid body box would hide
      // the seats and make the transparent water appear to rest on timber.
      for(const a of [-1,1]){rounded(g,m.wood,a*(w/2-wall/2),h*.44,0,wall,h*.78,d,.035);rounded(g,m.wood,0,h*.44,a*(d/2-wall/2),iw,h*.78,wall,.035);}
      for(const a of [-1,1]){box(g,m.ceramic,a*(iw/2-.003),.49,0,.012,.40,id);box(g,m.ceramic,0,.49,a*(id/2-.003),iw,.40,.012);}
      // The four independent rim pieces leave a genuinely open bathing well.
      for(const a of [-1,1]){rounded(g,m.ceramic,a*(w/2-wall/2),h-.075,0,wall,.15,d,.040);rounded(g,m.ceramic,0,h-.075,a*(d/2-wall/2),iw+.02,.15,wall,.040);}
      rounded(g,m.ceramic,0,.28,0,iw,.18,id,.045);
      for(const a of [-1,1]){
        rounded(g,m.ceramic,a*iw*.28,.47,-id*.08,iw*.40,.22,id*.73,.08);
        const recline=rounded(g,m.ceramic,a*iw*.28,.60,-id*.35,iw*.40,.39,.17,.065);recline.rotation.x=-.20;
        rounded(g,m.dark,a*iw*.28,h-.06,-id*.44,iw*.28,.075,.13,.03);
      }
      if(['cane','slatted','shoji','framed'].includes(design.cabinet))for(const a of [-1,1])slatPanel(g,0,h*.43,a*(d/2-.013),w*.97,h*.66,m.wood,.085);
      else for(const a of [-1,1])for(let i=0;i<4;i++)box(g,m.frame,0,.17+i*h*.15,a*(d/2-.003),w*.98,.006,.006);
      rounded(g,m.spaWater||m.water,0,h-.17,0,iw-.025,.012,id-.025,.035);
      if(f.jets!==false)for(const a of [-1,1])for(let i=0;i<4;i++){
        const jet=cyl(g,m.steel,a*(iw/2-.015),.52+i%2*.065,-id*.34+i*id*.22,.024,.024,.017,12);jet.rotation.z=Math.PI/2;
        const core=cyl(g,m.dark,a*(iw/2-.026),.52+i%2*.065,-id*.34+i*id*.22,.011,.011,.019,10);core.rotation.z=Math.PI/2;
      }
      if(f.lights!==false){for(const a of [-1,1])box(g,m.spaGlow||m.glow,0,h-.25,a*(id/2-.01),iw*.86,.012,.008);for(const a of [-1,1])box(g,m.spaGlow||m.glow,a*(iw/2-.01),h-.25,0,.008,.012,id*.86);}
      if(f.hydromassage!==false)for(let i=0;i<30;i++){const x=Math.sin(i*2.399)*iw*.39,z=Math.cos(i*1.83)*id*.38,size=.012+(i%4)*.005;oval(g,m.bubbles||m.ceramic,x,h-.161+Math.sin(i)*.006,z,size,.008,size);}
      // Waterproof control pad and two visible massage controls are fixtures,
      // not a claim about a particular manufacturer's plumbing specification.
      const control=rounded(g,m.blackGlass,w*.24,h+.004,d/2-wall*.53,.18,.014,.075,.006);control.rotation.x=.05;
      for(const a of [-1,1])cyl(g,m.steel,a*.15,h-.008,d/2-wall*.51,.022,.022,.025,12);
    }else if(f.kind==='toilet'||f.kind==='wc') {
      if(!f.front&&w>d){g=group(g,0,0,0,Math.PI/2);[w,d]=[d,w];}
      oval(g,m.ceramic,0,.205,-d*.012,w*.72,.41,d*.79);const b=group(g,0,0,d*.08);bowl(b,w,d*.8,.20,.27);rounded(g,m.ceramic,0,.61,-d*.37,w*.9,.42,d*.245,.043);box(g,m.steel,0,.825,-d*.35,.075,.006,.028);
    }else if(f.kind==='bidet'){
      oval(g,m.ceramic,0,.20,-d*.035,w*.70,.40,d*.78);const b=group(g,0,0,d*.08);bowl(b,w,d*.80,.16,.28);faucet(g,0,.43,-d*.32,.115);
    }else if(f.kind==='basin'||f.kind==='sink') {
      const hosted=Boolean(f.hostId)||f.kind==='sink',h=hosted?.929:.78;
      if(!hosted){
        rounded(g,m.wood,0,.49,0,w*.96,.48,d*.9,.025);box(g,m.stone,0,h-.035,0,w,.07,d);
        const n=Math.max(2,Math.round(w/.45));for(let i=0;i<n;i++){const x=-w*.47+(i+.5)*w*.94/n;box(g,m.cabinet,x,.49,d*.46,w*.94/n-.012,.44,.014);if(renovated&&['fluted','slatted'].includes(design.cabinet))slatPanel(g,x,.49,d*.48,w*.94/n-.02,.42,m.wood,.05);else box(g,m.bronze,x,.63,d*.49,Math.min(.16,w/n*.5),.01,.015);}
      }
      if(f.kind==='sink'&&!f.hostId)kitchen(g,{...f,front:null},w,d);
      const count=f.basins===2?2:1,scale=hosted?.9:count===2?.79:.76;
      for(let i=0;i<count;i++){const x=count===2?(i-.5)*w*.50:0,b=group(g,x,0,d*.035);bowl(b,Math.min(.60,w/count*scale),d*.77,hosted?.095:.15,h);faucet(g,x,h,-d*.32,hosted?.25:.21);}
    }else if(f.kind==='shower') {
      rounded(g,m.ceramic,0,.039,0,w,.078,d,.02);box(g,m.steel,w*.3,.08,-d*.23,.095,.005,.095);
      // Fixed back and side screen leave the entry open.
      box(g,m.glass,0,.985,-d*.485,w,1.83,.012);box(g,m.glass,-w*.49,.985,-d*.12,.014,1.83,d*.75);
      for(const [x,z] of [[-w*.49,-d*.49],[w*.49,-d*.49],[-w*.49,d*.255]])cyl(g,m.steel,x,.985,z,.013,.013,1.83,10);
      let plumbing=g,pw=w,pd=d;
      if(f.headWall){const a=f.front?Math.atan2(f.front[0],f.front[1]):0,c=Math.cos(a),s=Math.sin(a),hx=c*f.headWall[0]-s*f.headWall[1],hz=s*f.headWall[0]+c*f.headWall[1];plumbing=group(g,0,0,0,Math.atan2(-hx,-hz));if(Math.abs(hx)>.5)[pw,pd]=[d,w];}
      for(let i=0;i<(f.heads||1);i++){const x=f.heads===2?(i-.5)*pw*.47:pw*.16,z=-pd*.435;rod(plumbing,m.steel,[x,.94,z],[x,1.98,z],.012);rod(plumbing,m.steel,[x,1.98,z],[x,1.98,z+pd*.23],.016);cyl(plumbing,m.steel,x,1.955,z+pd*.23,.088,.093,.028);box(plumbing,m.steel,x,.95,z,.17,.056,.066);}
    }
  }
  function sauna(g,w,d) {
    const slats=Math.max(5,Math.floor(w/.112));for(let i=0;i<slats;i++)box(g,m.oak,-w/2+(i+.5)*w/slats,.845,-d*.48,w/slats-.006,1.69,.034);
    bench(g,w*.93,d*.45,-d*.22);const x=w*.28,z=d*.25;
    rounded(g,m.frame,x,.29,z,w*.23,.52,d*.25,.03);for(let i=0;i<7;i++)oval(g,m.slate,x+Math.sin(i*2.39)*w*.07,.57+(i%2)*.018,z+Math.cos(i*2.39)*d*.073,.09,.07,.08);
  }
  function bench(g,w,d,z=0) {legs(group(g,0,0,z),w*.79,d*.67,.44,.035,m.wood);const n=Math.max(3,Math.round(d/.085));for(let i=0;i<n;i++)rounded(g,m.oak,0,.445,z-d/2+(i+.5)*d/n,w,.055,d/n-.008,.015);}
  function car(g,w,d) {
    if(w>d){g=group(g,0,0,0,Math.PI/2);[w,d]=[d,w];}
    rounded(g,m.frame,0,.50,0,w*.95,.44,d*.99,.16);rounded(g,m.cabinet,0,.73,0,w,.48,d*.93,.20);
    rounded(g,m.blackGlass,0,1.02,-d*.04,w*.88,.61,d*.52,.235);rounded(g,m.cabinet,0,1.30,-d*.07,w*.75,.12,d*.32,.055);
    for(const a of [-1,1])for(const b of [-1,1]){const wheel=cyl(g,m.dark,a*w*.465,.32,b*d*.305,.315,.315,.13,24);wheel.rotation.z=Math.PI/2;const hub=cyl(g,m.steel,a*w*.505,.32,b*d*.305,.186,.186,.024,16);hub.rotation.z=Math.PI/2;}
    for(const a of [-1,1]) {rounded(g,m.glow,a*w*.294,.724,d*.468,w*.215,.089,.035,.015);rounded(g,m.pot,a*w*.3,.747,-d*.468,w*.185,.075,.035,.014);}
  }
  for(const f of plan.fixtures||[]) {
    let w=f.width,d=f.depth;if(!(w>0&&d>0))continue;
    let g=group(parent,f.x,0,f.z,f.rotation||0);
    g.userData.fixtureId=f.id;g.userData.fixtureKind=f.kind;g.userData.interiorRecipe=design.id;
    if(['desk','chair','armchair','fridge','nightstand','mirror','spaStep','bookcase'].includes(f.kind)&&f.front)[g,w,d]=faceFront(g,f,w,d);
    else if(f.kind==='desk'&&d>w){g=group(g,0,0,0,Math.PI/2);[w,d]=[d,w];}
    if(f.kind==='sofa'&&f.front){if(f.shape?.toUpperCase()==='U'){const a=Math.atan2(f.front[0],f.front[1])-Math.PI/2;g=group(g,0,0,0,a);if(Math.abs(f.front[1])>.5)[w,d]=[d,w];}else [g,w,d]=faceFront(g,f,w,d);}
    switch(f.kind){
      case 'sofa': if(f.shape?.toUpperCase()==='U'){rounded(g,m.rug,0,.012,0,w*.99,.022,d*.99,.009);sectional(g,w,d);const openW=w-Math.min(.91,w*.33,d*.29),openD=d-2*Math.min(.91,w*.33,d*.29);if(openW>.85&&openD>.68)table(group(g,w*.14,.015,0),openW*.52,openD*.53,false);}else sofa(g,w,d);break;
      case 'armchair':sofa(g,w,d);break;
      case 'diningTable':table(g,w,d,true);break;
      case 'coffeeTable':table(g,w,d,false);break;
      case 'chair':chair(g,0,0,0,w,d);break;
      case 'bed':bed(g,w,d,f);break;
      case 'kitchen':case 'counter':kitchen(g,f,w,d);break;
      case 'storage':case 'wardrobe':kitchen(g,f,w,d,true);break;
      case 'basin':case 'tub':case 'hotTub':case 'bidet':case 'shower':case 'wc':case 'toilet':case 'sink':bathroom(g,f,w,d);break;
      case 'spaStep':{const h=f.height||.32;box(g,m.wood,0,h*.25,d*.25,w,h*.50,d*.50);box(g,m.wood,0,h*.50,-d*.25,w,h,d*.50);for(const z of [-d*.25,d*.25])for(let i=0;i<4;i++)box(g,m.frame,0,z<0?h+.003:h*.50+.003,z-d*.19+i*d*.12,w*.92,.006,.012);break;}
      case 'nightstand':{const h=f.height||.52;if(renovated&&['taper','woven','slatted','midcentury','cane'].includes(design.cabinet))legs(g,w*.72,d*.68,.18,.022,m.wood,.012);rounded(g,m.wood,0,h*.60,0,w,h*.74,d,.024);rounded(g,m.stone,0,h,0,w,.035,d,.012);box(g,m.cabinet,0,h*.67,d*.51,w*.91,h*.37,.018);if(renovated&&design.cabinet==='cane')weavePanel(g,0,h*.67,d*.525,w*.80,h*.26);else box(g,m.bronze,0,h*.75,d*.54,w*.21,.011,.015);books(g,0,h+.02,0,w*.53);break;}
      case 'sauna':if(f.variant==='heater'){rounded(g,m.frame,0,.30,0,w,.53,d,.035);for(let i=0;i<8;i++)oval(g,m.slate,Math.sin(i*2.4)*w*.29,.57,Math.cos(i*2.4)*d*.29,.079,.056,.082);}else sauna(g,w,d);break;
      case 'bench':bench(g,w,d);break;
      case 'car':car(g,w,d);break;
      case 'mirror':{const y=f.mountHeight??1.52;if(d>w){box(g,m.bronze,0,y,0,w,.77,d);box(g,m.steel,-w*.52,y,0,.006,.73,d-.042);box(g,m.steel,w*.52,y,0,.006,.73,d-.042);}else{box(g,m.bronze,0,y,0,w,.77,d);box(g,m.steel,0,y,d*.52,w-.042,.73,.006);}break;}
      case 'towelRail':{const y=f.mountHeight??1.18;for(const sign of [-1,1])cyl(g,m.steel,sign*w*.455,y,0,.011,.011,.79,12);for(let i=0;i<8;i++)rod(g,m.steel,[-w*.455,y-.32+i*.092,0],[w*.455,y-.32+i*.092,0],.012);box(g,m.linen,-w*.13,y-.11,-d*.3,w*.39,.33,.019);break;}
      case 'plant':plant(g,0,0,0,Math.min(w,d)*.58);break;
      case 'tv':{let front=g,span=w,dep=d;if(d>w){front=group(g,0,0,0,-Math.PI/2);span=d;dep=w;}rounded(front,m.wood,0,.31,0,span,.48,dep,.031);box(front,m.dark,0,1.13,0,span*.91,Math.min(.84,span*.51),.055);box(front,m.blackGlass,0,1.13,.032,span*.884,Math.min(.81,span*.49),.01);break;}
      case 'desk':{rounded(g,m.oak,0,.738,0,w,.055,d,.02);legs(g,w*.84,d*.71,.714,.028);box(g,m.frame,0,.777,-d*.12,.17,.025,.107);box(g,m.steel,0,.88,-d*.14,.032,.20,.04);rounded(g,m.blackGlass,0,1.046,-d*.15,Math.min(w*.55,.59),.32,.031,.012);box(g,m.frame,0,.773,d*.16,Math.min(.33,w*.38),.017,.12);plant(g,-w*.34,.77,-d*.14,.105);break;}
      case 'hob':{if(!f.hostId)kitchen(g,f,w,d);rounded(g,m.blackGlass,0,.937,0,w,.022,d,.008);for(const a of [-1,1])for(const b of [-1,1]){const r=Math.min(w,d)*.14;const ring=new THREE.Mesh(new THREE.TorusGeometry(r,.003,4,20),m.steel);ring.position.set(a*w*.22,.95,b*d*.21);ring.rotation.x=Math.PI/2;g.add(ring);}break;}
      case 'fridge':{rounded(g,m.steel,0,.94,0,w,1.88,d,.037);box(g,m.frame,0,.71,d*.505,w*.94,.012,.012);box(g,m.frame,-w*.33,1.02,d*.515,.022,.31,.031);break;}
      case 'washer':case 'dryer':{rounded(g,m.ceramic,0,.42,0,w,.84,d,.027);const door=cyl(g,m.blackGlass,0,.407,d/2,.205,.205,.042,24);door.rotation.x=Math.PI/2;box(g,m.frame,w*.16,.744,d*.51,w*.27,.056,.016);break;}
      case 'bookcase':{box(g,m.wood,0,.86,-d*.48,w,1.72,.032);for(const a of [-1,1])box(g,m.wood,a*(w/2-.014),.86,0,.028,1.72,d);for(let i=0;i<5;i++){box(g,m.wood,0,.06+i*.4,0,w,.03,d);if(i<4)for(let b=0;b<7;b++)box(g,[m.paper,m.accent,m.fabric][b%3],-w*.38+b*w*.09,.205+i*.4,0,w*.062,.247+(b%3)*.017,d*.73);}break;}
      case 'heater':{rounded(g,m.frame,0,.30,0,w,.53,d,.035);for(let i=0;i<8;i++)oval(g,m.slate,Math.sin(i*2.4)*w*.29,.57,Math.cos(i*2.4)*d*.29,.079,.056,.082);break;}
    }
  }
}
