import * as THREE from '../vendor/three.module.js';

// Furniture stays anchored to the metric footprint in the shared plan. Local
// +z is the chair/cabinet front. A table footprint describes the top itself.
export function furnishInterior(parent,plan,tools,finishes) {
  const {box,rounded,oval,cyl,rod,group}=tools,{m,style}=finishes;
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
  function chair(g,x,z,angle,w=.47,d=.49) {
    const cg=group(g,x,0,z,angle);legs(cg,w*.73,d*.71,.43,.025);
    rounded(cg,m.wood,0,.427,0,w,.055,d,.018); rounded(cg,m.fabric,0,.465,.015,w*.96,.07,d*.9,.026);
    const back=rounded(cg,form==='shell'?m.ceramic:m.wood,0,.708,-d*.43,w*.93,.31,.06,.027);back.rotation.x=-.095;
    for(const a of [-1,1])rod(cg,m.wood,[a*w*.35,.43,-d*.37],[a*w*.34,.71,-d*.44],.018);
  }
  function sofa(g,w,d,{arms=true,cushions=true}={}) {
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
  function bed(g,w,d) {
    if(w>d){const swap=w;w=d;d=swap;g=group(g,0,0,0,Math.PI/2);}
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
    if(f.kind==='tub') {
      bowl(g,w,d,.55,0);const sign=d>w?1:0;
      const tap=group(g,sign?0:-w*.4,0,sign?-d*.41:0,sign?0:Math.PI/2);faucet(tap,0,.51,0,.16);
      if(f.variant==='whirlpool')for(let i=0;i<8;i++){const a=i*Math.PI/4;oval(g,m.steel,w*.39*Math.sin(a),.43,d*.39*Math.cos(a),.029,.026,.029);}
    }else if(f.kind==='toilet'||f.kind==='wc') {
      if(w>d){g=group(g,0,0,0,Math.PI/2);[w,d]=[d,w];}
      oval(g,m.ceramic,0,.205,-d*.012,w*.72,.41,d*.79);const b=group(g,0,0,d*.08);bowl(b,w,d*.8,.20,.27);rounded(g,m.ceramic,0,.61,-d*.37,w*.9,.42,d*.245,.043);box(g,m.steel,0,.825,-d*.35,.075,.006,.028);
    }else if(f.kind==='basin'||f.kind==='sink') {
      const hosted=Boolean(f.hostId)||f.kind==='sink',h=hosted?.929:.78;
      if(!hosted){rounded(g,m.wood,0,.49,0,w*.96,.48,d*.9,.025);box(g,m.stone,0,h-.035,0,w,.07,d);}
      if(f.kind==='sink'&&!f.hostId)kitchen(g,f,w,d);
      const scale=hosted?.9:.88,b=group(g,0,0,d*.035);bowl(b,w*scale,d*.77,hosted?.095:.15,h);
      faucet(g,0,h,-d*.32,hosted?.25:.21);
    }else if(f.kind==='shower') {
      rounded(g,m.ceramic,0,.039,0,w,.078,d,.02);box(g,m.steel,w*.3,.08,-d*.23,.095,.005,.095);
      // Fixed back and side screen leave the entry open.
      box(g,m.glass,0,.985,-d*.485,w,1.83,.012);box(g,m.glass,-w*.49,.985,-d*.12,.014,1.83,d*.75);
      for(const [x,z] of [[-w*.49,-d*.49],[w*.49,-d*.49],[-w*.49,d*.255]])cyl(g,m.steel,x,.985,z,.013,.013,1.83,10);
      for(let i=0;i<(f.heads||1);i++){const x=f.heads===2?(i-.5)*w*.47:w*.16,z=-d*.435;rod(g,m.steel,[x,.94,z],[x,1.98,z],.012);rod(g,m.steel,[x,1.98,z],[x,1.98,z+d*.23],.016);cyl(g,m.steel,x,1.955,z+d*.23,.088,.093,.028);box(g,m.steel,x,.95,z,.17,.056,.066);}
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
    if(f.kind==='desk'&&d>w){g=group(g,0,0,0,Math.PI/2);[w,d]=[d,w];}
    switch(f.kind){
      case 'sofa': if(f.shape?.toUpperCase()==='U'){rounded(g,m.rug,0,.012,0,w*.99,.022,d*.99,.009);sectional(g,w,d);const openW=w-Math.min(.91,w*.33,d*.29),openD=d-2*Math.min(.91,w*.33,d*.29);if(openW>.85&&openD>.68)table(group(g,w*.14,.015,0),openW*.52,openD*.53,false);}else sofa(g,w,d);break;
      case 'armchair':sofa(g,w,d);break;
      case 'diningTable':table(g,w,d,true);break;
      case 'coffeeTable':table(g,w,d,false);break;
      case 'chair':chair(g,0,0,0,w,d);break;
      case 'bed':bed(g,w,d);break;
      case 'kitchen':case 'counter':kitchen(g,f,w,d);break;
      case 'storage':case 'wardrobe':kitchen(g,f,w,d,true);break;
      case 'basin':case 'tub':case 'shower':case 'wc':case 'toilet':case 'sink':bathroom(g,f,w,d);break;
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
