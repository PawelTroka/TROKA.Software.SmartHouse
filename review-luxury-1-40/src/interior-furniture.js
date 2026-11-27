import * as THREE from '../vendor/three.module.js';
import {getInteriorStyleRecipe} from './interior-style-recipes.js?v=1.40.0';
import {beveledBoxGeometry,cushionGeometry,cushionPipingGeometry,wovenPanelGeometry} from './detailed-geometry.js?v=1.40.0';
import {furnishCinemaFixture} from './living-cinema-furniture.js?v=1.40.0';
import {furnishKitchenAppliance} from './luxury-kitchen-furniture.js?v=1.40.0';
import {batchGroup} from './interior-geometry.js?v=1.40.0';

// Furniture stays anchored to the metric footprint in the shared plan. Local
// +z is the chair/cabinet front. A table footprint describes the top itself.
export function furnishInterior(parent,plan,tools,finishes) {
  const {oval,cyl,rod,group}=tools,{m,style}=finishes;
  const cloth=new Set([m.fabric,m.linen,m.duvet,m.accent]),hard=new Set([m.wood,m.oak,m.frame,m.steel,m.bronze,m.stone,m.ceramic,m.cabinet,m.painted,m.trim]);
  const detailCache=new Map();
  const cached=(key,create)=>{if(!detailCache.has(key))detailCache.set(key,create());return detailCache.get(key);};
  const detailMesh=(parent,geometry,material,x,y,z)=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;};
  function box(g,material,x,y,z,w,h,d){
    if(!hard.has(material)||Math.min(w,h,d)<.016||Math.max(w,h,d)<.10)return tools.box(g,material,x,y,z,w,h,d);
    return detailMesh(g,cached(`edge:${w}:${h}:${d}`,()=>beveledBoxGeometry(w,h,d,{radius:Math.min(.003,Math.min(w,h,d)*.10),segments:1})),material,x,y,z);
  }
  function rounded(g,material,x,y,z,w,h,d,r=.045){
    if(cloth.has(material)&&Math.min(w,h,d)>=.055){
      const axis=h<=Math.min(w,d)?'y':d<=w?'z':'x',roundness=Math.max(3.1,Math.min(7,2+Math.min(w,h,d)/(Math.max(.001,r))));
      const key=`cloth:${w}:${h}:${d}:${axis}:${roundness}`;
      const mesh=detailMesh(g,cached(key,()=>cushionGeometry(w,h,d,{axis,roundness})),material,x,y,z);
      const welt=detailMesh(mesh,cached(key+':welt',()=>cushionPipingGeometry(w,h,d,{axis,roundness})),material,0,0,0);
      welt.name='sewn-upholstery-edge';return mesh;
    }
    return tools.rounded(g,material,x,y,z,w,h,d,r);
  }
  const design=finishes.interiorRecipe||getInteriorStyleRecipe(style.id), renovated=design.id!=='current';
  const painted=m.painted||m.trim;
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
    detailMesh(g,cached(`weave:${w}:${h}`,()=>wovenPanelGeometry(w,h)),material,x,y,z);
  }
  function slatPanel(g,x,y,z,w,h,material=m.wood,spacing=.09) {
    const n=Math.max(3,Math.min(24,Math.round(w/spacing)));
    for(let i=0;i<n;i++)rounded(g,material,x-w/2+(i+.5)*w/n,y,z,w/n*.62,h,.026,.008);
  }
  function louvrePanel(g,x,y,z,w,h,material=painted) {
    const n=Math.max(3,Math.min(25,Math.round(h/.073)));
    for(let i=0;i<n;i++){
      const blade=box(g,material,x,y-h/2+(i+.5)*h/n,z,w,h/n*.86,.013);
      blade.rotation.x=-.34;
    }
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
      }else legs(cg,w*.72,d*.69,seat-.02,.022,kind==='crossback-cane'?painted:m.wood,['wishbone','bentwood'].includes(kind)?.035:.012);
      const hard=['spindle','slatted','mission','crossbuck','wishbone','cane','crossback-cane'].includes(kind);
      rounded(cg,kind==='crossback-cane'?painted:hard?m.oak:m.fabric,0,seat,0,w*.97,hard?.055:.10,d*.91,hard?.018:.045);
      if(['tulip','shell','curved','upholstered','block'].includes(kind)){
        const shell=oval(cg,kind==='tulip'?m.ceramic:m.fabric,0,.675,-d*.33,w*.95,.43,.14);shell.rotation.x=-.13;
        if(kind==='shell')for(let i=0;i<5;i++){const t=(i-2)/2;rounded(cg,m.accent,t*w*.19,.685-Math.abs(t)*.045,-d*.285,w*.17,.34,.032,.012);}
      }else if(kind==='iron'){
        arch(cg,m.frame,0,seat,-d*.39,w*.84,.47,.014);for(const a of [-1,1]){const ring=new THREE.Mesh(new THREE.TorusGeometry(w*.16,.011,5,18),m.frame);ring.position.set(a*w*.18,.66,-d*.39);cg.add(ring);}
      }else if(kind==='crossback-cane'){
        const seatWeave=group(cg,0,seat+.031,0);seatWeave.rotation.x=-Math.PI/2;
        weavePanel(seatWeave,0,0,0,w*.80,d*.72);
        for(const a of [-1,1]){
          rod(cg,painted,[a*w*.42,seat-.045,-d*.34],[a*w*.42,.925,-d*.43],.018);
          rod(cg,painted,[a*w*.35,seat+.09,-d*.36],[-a*w*.35,.84,-d*.415],.014);
        }
        rounded(cg,painted,0,.91,-d*.42,w*.96,.065,.060,.019);
      }else if(kind==='rope'){
        // A light, open rope back with a solid timber rim, unlike the painted
        // cross-back and beadboard construction of the Coastal scheme.
        for(const a of [-1,1])rod(cg,m.wood,[a*w*.42,.43,-d*.36],[a*w*.42,.88,-d*.43],.022);
        rounded(cg,m.wood,0,.88,-d*.43,w*.94,.055,.05,.018);
        for(let i=0;i<9;i++){const x=-w*.36+i*w*.72/8;rod(cg,m.cane,[x,.49,-d*.36],[x,.85,-d*.42],.009);}
        for(const y of [.55,.66,.77])rod(cg,m.cane,[-w*.38,y,-d*.39],[w*.38,y,-d*.39],.005);
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
      const kind=design.seating,low=['platform','pebble-low','sling-low','linen-platform'].includes(kind),seat=low?.36:.43,arm=Math.min(kind==='slipcover'?.18:kind==='linen-platform'?.15:.12,w*.1),back=Math.min(.17,d*.22),side=arms?arm:0,span=w-2*side;
      const stone=['masonry','block','pebble','pebble-low'].includes(kind),pod=kind==='pod',timber=['woven','slatted','bench','crossbuck','mission','taper','runner','sling','sling-low'].includes(kind),open=timber||['sled','steel','leather'].includes(kind);
      if(kind==='slipcover'){
        rounded(g,m.fabric,0,.235,0,w,.32,d*.98,.062);
        // Separate skirt panels and folded corner returns, with a clear hem.
        const panels=Math.max(2,Math.ceil(w/.66));
        for(const a of [-1,1])for(let i=0;i<panels;i++)rounded(g,m.linen,-w/2+(i+.5)*w/panels,.17,a*(d/2-.012),w/panels-.009,.255,.019,.006);
        for(const a of [-1,1])box(g,m.linen,a*(w/2-.012),.17,0,.019,.255,d-.035);
      }else if(kind==='linen-platform'){
        rounded(g,m.wood,0,.11,0,w,.19,d,.037);
        rounded(g,m.linen,0,.235,0,w*.98,.16,d*.95,.066);
        for(const a of [-1,1])box(g,m.wood,0,.062,a*d*.46,w*.96,.035,.055);
      }else if(stone){rounded(g,kind==='masonry'?m.wall:m.stone,0,seat*.36,0,w*.98,seat*.70,d*.98,kind.startsWith('pebble')?.105:.025);}
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
        if(kind==='slipcover'){
          rounded(g,m.fabric,x,seat-.015,0,arm,.30,d*.94,.047);
          oval(g,m.fabric,x,seat+.15,0,arm,.19,d*.94);
          rod(g,m.linen,[x,seat+.245,-d*.40],[x,seat+.245,d*.40],.004);
        }else if(timber){
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
    if(renovated&&design.seating==='slipcover')for(const a of [-1,1]){
      const end=.17;oval(g,m.fabric,w/2-end/2,.58,a*(d/2-depth/2),end,.22,depth*.94);
      rod(g,m.linen,[w/2-end/2,.687,a*(d/2-depth/2)-depth*.39],[w/2-end/2,.687,a*(d/2-depth/2)+depth*.39],.004);
    }
  }
  function table(g,w,d,dining,options={}) {
    if(renovated){
      const kind=design.table,h=dining?.755:['low-slab','boulder-low'].includes(kind)?.27:.35,top=kind==='farmhouse'?.075:.05;
      const stone=['boulder','boulder-low','deco','monolith','waterfall','limestone-oval'].includes(kind);
      if(kind==='twin-pedestal'){
        for(const a of dining?[-1,1]:[0]){
          const x=a*w*.27;
          turned(g,painted,x,0,0,[[.10,.055],[.12,.10],[.062,h*.32],[.095,h*.50],[.053,h*.70],[.09,h-.065]],1,1);
          rounded(g,painted,x,.055,0,Math.min(.28,w*.28),.075,d*.78,.025);
          rounded(g,painted,x,h-.074,0,Math.min(.28,w*.28),.055,d*.67,.012);
        }
      }else if(kind==='limestone-oval'){
        for(const a of [-1,1])rounded(g,m.stone,a*w*.25,(h-top)/2,0,w*.15,h-top,d*.64,.06);
      }else if(kind==='tulip')turned(g,m.steel,0,0,0,[[.001,0],[.34,.014],[.35,.041],[.12,.10],[.048,h*.68],[.08,h*.85],[.20,h-.035]],Math.min(w,d),Math.min(w,d));
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
      if(kind==='twin-pedestal'){
        const cap=Math.min(.085,w*.08),n=Math.max(3,Math.ceil(d/.20));
        for(let i=0;i<n;i++)rounded(g,m.oak,0,h-top/2,-d/2+(i+.5)*d/n,w-2*cap,top,d/n-.004,.010);
        for(const a of [-1,1])rounded(g,m.oak,a*(w/2-cap/2),h-top/2,0,cap,top,d,.009);
      }else if(kind.startsWith('oval')||['tulip','boulder','boulder-low','limestone-oval'].includes(kind)){const topMesh=cyl(g,surface,0,h-top/2,0,1,1,top,48);topMesh.scale.x=w/2;topMesh.scale.z=d/2;}
      else if(kind==='slat-trestle'){const n=Math.max(3,Math.ceil(d/.09));for(let i=0;i<n;i++)rounded(g,m.oak,0,h-top/2,-d/2+(i+.5)*d/n,w,top,d/n-.007,.012);}
      else rounded(g,surface,0,h-top/2,0,w,top,d,kind==='teak'?.025:.018);
      if(!dining){books(g,-w*.18,h,0,Math.min(.29,w*.28));turned(g,m.ceramic,w*.20,h,-d*.04,[[0,0],[.34,0],[.5,.045],[.49,.055],[.33,.012],[0,.01]],.19,.19);return;}
      const n=Math.max(1,Math.min(4,options.seats?Math.ceil(options.seats/2):Math.floor(w/.64)));for(let i=0;i<n;i++)for(const a of [-1,1])chair(g,-w/2+(i+.5)*w/n,a*(d/2+.24),a>0?Math.PI:0);
      plant(g,0,h,0,.15);return;
    }
    const h=dining?.755:.36,th=dining?.059:.05;
    if(form==='shell'||form==='deco') {cyl(g,m.frame,0,h*.48,0,Math.min(w,d)*.15,Math.min(w,d)*.22,h*.91);cyl(g,m.steel,0,.035,0,Math.min(w,d)*.35,Math.min(w,d)*.37,.055);}
    else if(platform&&!dining) rounded(g,m.stone,0,h*.41,0,w*.7,h*.75,d*.61,.055);
    else legs(g,w*.76,d*.7,h-th*.7,dining?.045:.035,m.wood,form==='taper'?.06:.012);
    rounded(g,(soft&&!dining)?m.stone:m.oak,0,h-th/2,0,w,th,d,Math.min(.026,th*.44));
    if(!dining){books(g,-w*.19,h,0,Math.min(.31,w*.3));turned(g,m.ceramic,w*.18,h,-d*.06,[[0,0],[.34,0],[.5,.045],[.49,.055],[.33,.012],[0,.01]],.21,.21);return;}
    const n=Math.max(1,Math.min(4,options.seats?Math.ceil(options.seats/2):Math.floor(w/.64)));
    for(let i=0;i<n;i++)for(const a of [-1,1])chair(g,-w/2+(i+.5)*w/n,a*(d/2+.24),a>0?Math.PI:0);
    plant(g,0,h,0,.16);
    if(w>1.65) {for(const a of [-1,1]){cyl(g,m.bronze,a*.34,h+.075,.027,.029,.036,.15);cyl(g,m.linen,a*.34,h+.19,.027,.017,.017,.085);}}
  }
  function bed(g,w,d,f={}) {
    if(f.headboard){const a=Math.atan2(-f.headboard[0],-f.headboard[1]);g=group(g,0,0,0,a);if(Math.abs(f.headboard[0])>.5)[w,d]=[d,w];}
    else if(w>d){const swap=w;w=d;d=swap;g=group(g,0,0,0,Math.PI/2);}
    const mattressWidth=f.mattressWidth??w*.96,mattressLength=f.mattressLength??d*.95;
    if(f.underBedStorage){
      // Lift-up access avoids a drawer sweep into a guest desk or office
      // bookcase. A recessed foot pull makes that storage provision visible.
      if(f.storageAccess==='lift-up'){
        box(g,m.dark,0,.16,d/2+.003,Math.min(.22,w*.24),.027,.008);
        box(g,m.bronze,0,.165,d/2+.010,Math.min(.17,w*.18),.008,.010);
      }else for(const side of [-1,1]){
          box(g,m.wood,side*w*.245,.125,d/2-.003,w*.475,.17,.012);
          box(g,m.bronze,side*w*.245,.155,d/2+.007,w*.16,.009,.012);
        }
    }
    if(renovated){
      const kind=design.bed==='canopy'&&(w<1.2||f.headboardMaxHeight)?'woven':design.bed,low=['platform','platform-wide','slatted-low','plinth','linen-wide'].includes(kind),mattress=low?.25:.38;
      const wood=['canopy','slatted','slatted-low','platform','platform-wide','mission','crossbuck','taper','woven','cane'].includes(kind);
      if(kind==='beadboard'){legs(g,w*.85,d*.86,.18,.031,painted,.005);rounded(g,painted,0,.235,0,w,.18,d,.018);}
      else if(['steel','iron'].includes(kind)){legs(g,w*.88,d*.83,.24,.024,m.frame,.005);box(g,m.frame,0,.245,0,w,.055,d);}
      else if(kind==='floating'){rounded(g,m.frame,0,.105,0,w*.66,.21,d*.65,.025);rounded(g,m.wood,0,.25,0,w,.085,d,.026);}
      else if(kind==='taper'){legs(g,w*.82,d*.83,.20,.035,m.wood,.025);rounded(g,m.wood,0,.23,0,w,.12,d,.03);}
      else if(kind==='capsule'){rounded(g,m.ceramic,0,.25,0,w,.34,d,.14);}
      else if(kind==='deco'){for(let i=0;i<3;i++)rounded(g,i===1?m.bronze:m.wood,0,.045+i*.065,0,w-i*.025,.065,d-i*.025,.022);}
      else rounded(g,kind==='plinth'?m.stone:m.wood,0,low?.10:.19,0,w,low?.20:.28,d,kind==='sculpted'?.10:.025);
      const pad=rounded(g,m.fabric,0,mattress,0,mattressWidth,low?.19:.24,mattressLength,.060);
      pad.name=f.id?f.id+'-mattress':'bed-mattress';pad.userData.role='mattress';
      pad.userData.sleepingDimensions={width:mattressWidth,length:mattressLength,capacity:f.sleepingCapacity??(w>1.2?2:1)};
      rounded(g,m.duvet,0,mattress+.135,d*.13,w*.97,.105,d*.66,.048);
      rounded(g,m.linen,0,mattress+.18,-d*.13,w*.95,.042,d*.13,.02);
      rounded(g,m.accent,0,mattress+.19,d*.33,w*.96,.028,d*.16,.012);
      const back=-d/2+.045,headY=low?.47:.62,headH=low?.69:1.03;
      const bedBase=g;g=group(g);
      if(kind==='linen-wide'){
        rounded(g,m.wood,0,headY,back,w,.69,.085,.033);
        for(const a of [-1,1])rounded(g,m.linen,a*w*.245,headY+.015,back+.039,w*.475,.62,.065,.068);
        rod(g,m.cane,[-w*.46,headY+.31,back+.077],[w*.46,headY+.31,back+.077],.006);
      }else if(kind==='beadboard'){
        const inner=w-.12,n=Math.max(4,Math.ceil(inner/.10));
        for(const a of [-1,1])rounded(g,painted,a*(w/2-.027),headY,back,.054,headH,.067,.012);
        for(let i=0;i<n;i++)box(g,painted,-inner/2+(i+.5)*inner/n,headY,back,inner/n-.004,headH-.09,.038);
        for(const yy of [headY-headH/2+.03,headY+headH/2-.03])rounded(g,painted,0,yy,back,w,.06,.078,.012);
        rounded(g,painted,0,.265,d/2-.028,w,.22,.056,.012);
      }else if(kind==='canopy'){
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
    const pad=rounded(g,m.fabric,0,.335,0,f.mattressWidth??w*.97,.265,f.mattressLength??d*.97,.071);
    pad.name=f.id?f.id+'-mattress':'bed-mattress';pad.userData.role='mattress';
    pad.userData.sleepingDimensions={width:f.mattressWidth??w*.97,length:f.mattressLength??d*.97,capacity:f.sleepingCapacity??(w>1.2?2:1)};
    rounded(g,m.duvet,0,.49,d*.135,w*.985,.115,d*.66,.051);
    rounded(g,m.linen,0,.545,-d*.126,w*.96,.052,d*.14,.023);rounded(g,m.accent,0,.554,d*.335,w*.979,.035,d*.16,.014);
    rounded(g,soft?m.fabric:m.oak,0,.56,-d*.485,w,.88,.075,.034);
    const n=w>1.2?2:1;for(let i=0;i<n;i++) {const pillow=rounded(g,m.linen,(i-(n-1)/2)*w*.46,.505,-d*.318,Math.min(.64,w*.75/n),.14,.4,.068);pillow.rotation.x=.1;}
  }
  function faceFront(g,f,w,d) {
    if(!f.front)return [g,w,d];
    const angle=Math.atan2(f.front[0],f.front[1]);return Math.abs(f.front[0])>.5?[group(g,0,0,0,angle),d,w]:[group(g,0,0,0,angle),w,d];
  }
  const kitchenSinkSize=(w,d)=>[Math.min(.66,w*.78),Math.min(.42,d*.78)];
  function kitchen(g,f,w,d,tall=false) {
    [g,w,d]=faceFront(g,f,w,d);const h=tall?(f.height||1.95):(f.height||.9),wallUnit=f.kind==='wallCabinet'&&!f.panelOnly;
    if(renovated||f.panelOnly){
      const kind=design.cabinet,body=kind==='louvred'?painted:['cane','slatted','shoji','midcentury','framed'].includes(kind)?m.wood:kind==='steel'?m.frame:kind==='gloss'?m.lacquer||m.cabinet:m.cabinet;
      const sink=!tall&&(plan.fixtures||[]).find(item=>item.kind==='sink'&&item.hostId===f.id);
      if(f.panelOnly){
        // Removable cabinet-front panels conceal the retained masonry flue.
        // They are thin, backed faces, not a solid cupboard occupying it.
        box(g,body,0,h/2,d/2-.012,w,h,.018);
        if(f.plainPanel)return;
      }else if(!wallUnit)box(g,m.frame,0,.06,f.modules?d/2-.06:-.012,w*.94,.12,f.modules?.035:d*.88);
      if(!f.panelOnly&&f.modules){
        // Module widths include their own carcass sides. Clear appliance
        // niches have no inset side panels or false drawer fronts that would
        // turn a nominal 600 mm unit into an unusable 564 mm opening.
        const underside=tall?h:h-.019,bottom=wallUnit?0:.09;
        for(const module of f.modules){
          const x=module.x,mw=module.width,lo=x-mw/2,hi=x+mw/2;
          if(module.appliance){
            box(g,body,x,underside/2,-d/2+.009,mw,underside,.018);
          }else if(module.applianceTower){
            box(g,body,x,underside/2,-d/2+.009,mw,underside,.018);
            for(const side of [-1,1])box(g,body,x+side*(mw/2-.009),underside/2,-.013,.018,underside,d-.022);
            for(const y of [.571,1.1815,1.211,1.680])box(g,body,x,y,0,mw-.036,.018,d-.04);
          }else if(sink){
            box(g,body,x,.114,-.013,mw,.032,d-.022);
            box(g,body,x,(underside+.13)/2,-d/2+.009,mw,underside-.13,.018);
            for(const side of [-1,1])box(g,body,x+side*(mw/2-.009),(underside+.13)/2,-.013,.018,underside-.13,d-.022);
          }else box(g,body,x,(underside+bottom)/2,-.013,mw,underside-bottom,d-.022);
          const previousEnd=Math.max(-w/2,...f.modules.filter(m=>m.x+m.width/2<=lo+1e-7&&m!==module).map(m=>m.x+m.width/2));
          if(lo-previousEnd>1e-6)box(g,body,(lo+previousEnd)/2,underside/2,-.013,lo-previousEnd,underside,d-.022);
          if(hi===Math.max(...f.modules.map(m=>m.x+m.width/2))&&w/2-hi>1e-6)box(g,body,(hi+w/2)/2,underside/2,-.013,w/2-hi,underside,d-.022);
        }
      }else if(!f.panelOnly&&sink){
        // A real cabinet shell leaves room for the recessed bowl. A solid
        // carcass would otherwise fill the worktop aperture just below its rim.
        box(g,body,0,.114,-.013,w,.032,d-.022);
        box(g,body,0,(h+.13)/2,-d/2+.009,w,h-.13,.018);
        for(const side of [-1,1])box(g,body,side*(w/2-.009),(h+.13)/2,-.013,.018,h-.13,d-.022);
      }else if(!f.panelOnly){const bottom=wallUnit?0:.09;if(kind==='capsule')rounded(g,body,0,(h+bottom)/2,-.013,w,h-bottom,d-.022,Math.min(.075,h*.16));else box(g,body,0,(h+bottom)/2,-.013,w,h-bottom,d-.022);}
      const n=Math.max(1,Math.round(w/(tall?.55:.65)));
      const fronts=f.modules?f.modules.flatMap(module=>{
        if(module.appliance)return [];
        if(module.applianceTower)return [{x:module.x,width:module.width,bottom:.13,top:.568},{x:module.x,width:module.width,bottom:1.179,top:1.217,plain:true},
          {x:module.x,width:module.width,bottom:1.697,top:h-.015}].filter(p=>p.top>p.bottom+.02);
        if(module.backAccess){
          kitchen(group(g,module.x,0,0,Math.PI),{...f,modules:null,front:null,panelOnly:true,plainPanel:false,handleless:true,ceilingScribe:0,height:h-.035},module.width,d,true);
          return [];
        }
        const count=module.doors||1,span=module.width-(module.frontInset||0),cx=module.x-(module.frontInset||0)/2;
        return Array.from({length:count},(_,i)=>({x:cx-span/2+(i+.5)*span/count,width:span/count,drawers:module.drawers===true}));
      }):Array.from({length:n},(_,i)=>({x:-w/2+(i+.5)*w/n,width:w/n,drawers:f.drawers}));
      for(const front of fronts){
        const x=front.x,dw=front.width-.014,low=front.bottom??((f.panelOnly||wallUnit)?0:.13),high=front.top??h-.02,
          dh=high-low-.01,y=(low+high)/2,z=d/2;
        if(front.plain){box(g,body,x,y,z,dw,dh,.016);continue;}
        if(front.drawers&&!tall){
          // Separate fronts give the working runs and island real drawer
          // reveals. The recessed rail/handle follows the selected finish.
          const levels=[.135,.39,.65,h-.035];
          for(let j=0;j<levels.length-1;j++){
            const lo=levels[j]+.006,hi=levels[j+1]-.006,cy=(lo+hi)/2;
            rounded(g,body,x,cy,z,dw,hi-lo,.022,kind==='capsule'?.012:.004);
            if(['flush','capsule','gloss','shoji'].includes(kind))box(g,m.frame,x,hi-.021,z+.013,dw*.84,.012,.014);
            else box(g,kind==='steel'?m.steel:m.bronze,x,hi-.041,z+.026,Math.min(.20,dw*.38),.012,.026);
          }
          continue;
        }
        if(kind==='capsule')rounded(g,m.ceramic,x,y,z,dw,dh,.03,.014);else box(g,body,x,y,z,dw,dh,.016);
        if(['shaker','framed','cane','shoji','midcentury','steel','louvred'].includes(kind)){
          const frame=kind==='louvred'?painted:kind==='steel'?m.frame:m.oak,thin=kind==='shoji'?.025:.043;
          if(kind==='shoji')box(g,m.linen,x,y,z+.014,dw-.04,dh-.04,.008);
          for(const a of [-1,1]){box(g,frame,x+a*(dw/2-thin/2),y,z+.022,thin,dh,.026);box(g,frame,x,y+a*(dh/2-thin/2),z+.022,dw,thin,.026);}
          if(kind==='cane')weavePanel(g,x,y,z+.026,dw-.09,dh-.09);
          if(kind==='louvred'){
            if(tall){for(const a of [-1,1])louvrePanel(g,x,y+a*dh*.25,z+.026,dw-.09,dh*.50-.08);box(g,painted,x,y,z+.023,dw,.045,.024);}
            else louvrePanel(g,x,y,z+.026,dw-.09,dh-.09);
          }
          if(kind==='shoji'){for(let k=1;k<4;k++)box(g,m.wood,x,y-dh/2+k*dh/4,z+.031,dw,.018,.018);box(g,m.wood,x,y,z+.032,.018,dh,.018);}
          if(kind==='midcentury'){box(g,m.wood,x,y+Math.min(.17,dh*.20),z+.026,dw,.023,.02);box(g,m.frame,x+dw*.32,y,z+.028,.018,dh*.22,.015);}
          if(kind==='steel')for(const a of [-1,1])for(const b of [-1,1])oval(g,m.steel,x+a*dw*.40,y+b*dh*.43,z+.042,.015,.015,.011);
        }else if(kind==='fluted'){
          const flutes=Math.min(14,Math.max(4,Math.round(dw/.048)));for(let k=0;k<flutes;k++)cyl(g,m.wood,x-dw/2+(k+.5)*dw/flutes,y,z+.024,dw/flutes*.35,dw/flutes*.35,dh-.022,8);
        }else if(kind==='slatted')slatPanel(g,x,y,z+.022,dw-.02,dh-.01,m.wood,.075);
        else if(kind==='deco'){
          for(const a of [-1,1]){box(g,m.bronze,x+a*dw*.39,y,z+.022,.008,dh*.86,.008);box(g,m.bronze,x,y+a*dh*.43,z+.022,dw*.79,.008,.008);}
          box(g,m.bronze,x,y,z+.024,.011,dh*.78,.009);
        }
        if(!f.handleless&&['flush','capsule','gloss'].includes(kind))box(g,m.frame,x,high-.09,z+.018,dw*.75,.012,.013);
        else if(!f.handleless&&!['midcentury','shoji'].includes(kind)){
          const handleY=Math.max(low+.07,Math.min(high-.07,tall?(wallUnit?Math.min(.16,h*.5):Math.min(1.04,h-.10)):h-.14));
          if(['shaker','framed','louvred'].includes(kind))cyl(group(g,x+dw*.30,handleY,z+.04,Math.PI/2),m.bronze,0,0,0,.018,.018,.028,12).rotation.x=Math.PI/2;
          else box(g,kind==='steel'?m.steel:m.bronze,x+dw*.30,handleY,z+.043,.015,tall?Math.min(.20,h*.40):.09,.025);
        }
      }
      if(f.ceilingScribe>0)box(g,body,0,h+f.ceilingScribe/2,-.006,w,f.ceilingScribe,d-.010);
      if(!tall){
        const island=['social-island','social-peninsula'].includes(f.variant),top=island&&!f.joinedCounter ? .028 : .038;
        if(sink){
          const angle=(f.rotation||0)+Math.atan2(f.front?.[0]||0,f.front?.[1]??1),c=Math.cos(angle),s=Math.sin(angle),dx=sink.x-f.x,dz=sink.z-f.z;
          const cx=c*dx-s*dz,cz=s*dx+c*dz,sideways=Math.abs(sink.front?.[0]||0)>.5;
          const [bw,bd]=kitchenSinkSize(sideways?sink.depth:sink.width,sideways?sink.width:sink.depth),cw=sink.worktopOpening?.width??bw-.014,cd=sink.worktopOpening?.depth??bd-.014;
          const geo=cached(`sink-top:${w}:${d}:${top}:${cx}:${cz}:${cw}:${cd}:${!!f.joinedCounter}`,()=>{
            const shape=new THREE.Shape(),hole=new THREE.Path(),W=w+.006,D=d+.008,right=W/2-(f.joinedCounter?.007:0);
            // The connected peninsula owns the small overhang at this joint.
            // Trim this end to meet it instead of stacking coplanar worktops.
            shape.moveTo(-W/2,-D/2);shape.lineTo(right,-D/2);shape.lineTo(right,D/2);shape.lineTo(-W/2,D/2);shape.closePath();
            hole.moveTo(cx-cw/2,-cz-cd/2);hole.lineTo(cx-cw/2,-cz+cd/2);hole.lineTo(cx+cw/2,-cz+cd/2);hole.lineTo(cx+cw/2,-cz-cd/2);hole.closePath();shape.holes.push(hole);
            const geometry=new THREE.ExtrudeGeometry(shape,{depth:top-.002,steps:1,bevelEnabled:true,bevelThickness:.001,bevelSize:.001,bevelSegments:1});
            geometry.rotateX(-Math.PI/2);geometry.translate(0,-top/2+.001,0);return geometry;
          });
          detailMesh(g,geo,m.stone,0,h,0).name='sink-cutout-worktop';
        }else rounded(g,m.stone,0,h,0,w+.006,top,d+.008,island?.009:.012);
        if(island)for(const side of f.waterfallEnds||[-1,1])rounded(g,m.stone,side*(w/2-.016),(h+.10)/2,0,.032,h-.10,d+.008,.006);
        if(['flush','gloss','deco'].includes(kind))box(g,m.glow,0,h-top,d/2-.015,w*.94,.008,.008);
      }
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
      if(f.variant==='whirlpool'){
        for(let i=0;i<6;i++){const a=i*Math.PI/3;oval(g,m.steel,w*.36*Math.sin(a),height*.59,d*.36*Math.cos(a),.019,.017,.019);}
        oval(g,m.spaWater||m.water,0,height*.69,0,w*.72,.008,d*.72);
        for(const x of [-.045,.045])cyl(g,m.steel,x,height-.015,-d*.42,.017,.017,.012,12);
      }
    }else if(f.kind==='hotTub') {
      const h=f.height||.86,wall=.12,iw=w-2*wall,id=d-2*wall;
      rounded(g,m.frame,0,.08,0,w*.98,.16,d*.98,.035);
      // Four skirt walls surround a hollow well; a solid body box would hide
      // the seats and make the transparent water appear to rest on timber.
      for(const a of [-1,1]){rounded(g,design.cabinet==='louvred'?painted:m.wood,a*(w/2-wall/2),h*.44,0,wall,h*.78,d,.035);rounded(g,design.cabinet==='louvred'?painted:m.wood,0,h*.44,a*(d/2-wall/2),iw,h*.78,wall,.035);}
      for(const a of [-1,1]){box(g,m.ceramic,a*(iw/2-.003),.49,0,.012,.40,id);box(g,m.ceramic,0,.49,a*(id/2-.003),iw,.40,.012);}
      // The four independent rim pieces leave a genuinely open bathing well.
      for(const a of [-1,1]){rounded(g,m.ceramic,a*(w/2-wall/2),h-.075,0,wall,.15,d,.040);rounded(g,m.ceramic,0,h-.075,a*(d/2-wall/2),iw+.02,.15,wall,.040);}
      rounded(g,m.ceramic,0,.28,0,iw,.18,id,.045);
      for(const a of [-1,1]){
        rounded(g,m.ceramic,a*iw*.28,.47,-id*.08,iw*.40,.22,id*.73,.08);
        const recline=rounded(g,m.ceramic,a*iw*.28,.60,-id*.35,iw*.40,.39,.17,.065);recline.rotation.x=-.20;
        rounded(g,m.dark,a*iw*.28,h-.06,-id*.44,iw*.28,.075,.13,.03);
      }
      if(design.cabinet==='louvred')for(const a of [-1,1])louvrePanel(g,0,h*.43,a*(d/2-.018),w*.94,h*.65);
      else if(['cane','slatted','shoji','framed'].includes(design.cabinet))for(const a of [-1,1])slatPanel(g,0,h*.43,a*(d/2-.013),w*.97,h*.66,m.wood,.085);
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
      if(renovated&&f.kind==='sink'&&f.hostId){
        const host=(plan.fixtures||[]).find(item=>item.id===f.hostId),top=(host?.height||.9)+.019;
        if(f.workstation){
          const iw=f.bowlWidths.reduce((sum,width)=>sum+width,0)+.014,id=f.bowlDepth,bottom=top-f.bowlHeight;
          rounded(g,m.steel,0,bottom,0,iw+.012,.008,id+.012,.004);
          for(const side of [-1,1]){
            box(g,m.steel,side*(iw/2+.003),(top+bottom)/2,0,.006,top-bottom,id+.012);
            box(g,m.steel,0,(top+bottom)/2,side*(id/2+.003),iw,.200,.006);
            // The four narrow rim rails leave both bowls open and match the
            // actual 860 × 510 mm workstation outline, not an oversized tub.
            box(g,m.steel,side*(w+iw)/4,top+.003,0,(w-iw)/2,.006,d);
            box(g,m.steel,0,top+.003,side*(d+id)/4,iw,.006,(d-id)/2);
          }
          const divider=-iw/2+f.bowlWidths[0]+.007;
          box(g,m.steel,divider,(top+bottom)/2,0,.014,top-bottom,id);
          const centres=[-iw/2+f.bowlWidths[0]/2,iw/2-f.bowlWidths[1]/2];
          for(const x of centres)cyl(g,m.frame,x,bottom+.005,0,.025,.025,.002,16);
          // One parked cutting-board accessory keeps the small bowl useful.
          rounded(g,m.wood,centres[1],top+.012,-id*.46,f.bowlWidths[1]-.030,.018,.095,.004);
          faucet(g,0,top,-(host?.width||.65)/2+.033,.25);return;
        }
        const [bw,bd]=kitchenSinkSize(w,d),bottom=top-.18,depth=top-bottom;
        rounded(g,m.steel,0,bottom,0,bw-.014,.012,bd-.014,.006);
        for(const side of [-1,1]){
          rounded(g,m.steel,side*(bw/2-.007),(top+bottom)/2,0,.014,depth,bd,.005);
          rounded(g,m.steel,0,(top+bottom)/2,side*(bd/2-.007),bw,depth,.014,.005);
          rounded(g,m.steel,side*bw/2,top+.002,0,.014,.006,bd+.014,.002);
          rounded(g,m.steel,0,top+.002,side*bd/2,bw+.014,.006,.014,.002);
        }
        cyl(g,m.frame,0,bottom+.007,0,.026,.026,.002,20);
        faucet(g,0,top,-d*.42,.25);return;
      }
      if(!hosted){
        rounded(g,design.cabinet==='louvred'?painted:m.wood,0,.49,0,w*.96,.48,d*.9,.025);box(g,m.stone,0,h-.035,0,w,.07,d);
        const n=Math.max(2,Math.round(w/.45));for(let i=0;i<n;i++){const x=-w*.47+(i+.5)*w*.94/n;box(g,design.cabinet==='louvred'?painted:m.cabinet,x,.49,d*.46,w*.94/n-.012,.44,.014);if(renovated&&design.cabinet==='louvred')louvrePanel(g,x,.49,d*.48,w*.94/n-.04,.36);else if(renovated&&['fluted','slatted'].includes(design.cabinet))slatPanel(g,x,.49,d*.48,w*.94/n-.02,.42,m.wood,.05);else box(g,m.bronze,x,.63,d*.49,Math.min(.16,w/n*.5),.01,.015);}
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
  function shadedLamp(g,f,w,d){
    const h=f.height||(f.kind==='floorLamp'?1.38:.46),base=f.baseHeight||0,kind=f.lamp||'linen';
    const node=group(g,0,base,0),r=Math.min(w,d)*.46,shadeHeight=Math.min(.23,h*.40),top=h-shadeHeight/2;
    cyl(node,kind==='stone'?m.stone:m.wood,0,.025,0,r*.65,r*.80,.05,24);
    if(kind==='stone'&&h<.8)turned(node,m.ceramic,0,.03,0,[[.05,0],[.10,h*.13],[.09,h*.37],[.035,h*.54]],1,1);
    else rod(node,['woven','rope','paper','linen'].includes(kind)?m.wood:m.bronze,[0,.04,0],[0,top,0],h>.8?.012:.009);
    if(kind==='orb'||kind==='paper'){
      oval(node,m.lampShade||m.linen,0,top,0,r*1.9,shadeHeight*1.25,r*1.9);
      oval(node,m.glow,0,top,0,r*.75,shadeHeight*.65,r*.75);
      if(kind==='paper')for(let i=1;i<6;i++){const t=i/6-.5,rr=r*.95*Math.sqrt(1-4*t*t),ring=new THREE.Mesh(new THREE.TorusGeometry(rr,.0025,4,24),m.wood);ring.rotation.x=Math.PI/2;ring.position.set(0,top+t*shadeHeight*1.25,0);node.add(ring);}
    }else if(kind==='woven'||kind==='rope'){
      for(let i=0;i<24;i++){
        const a=i*Math.PI/12,x=Math.cos(a),z=Math.sin(a);
        rod(node,m.cane||m.wood,[x*r*.70,top+shadeHeight/2,z*r*.70],[x*r,top-shadeHeight/2,z*r],.0045);
      }
      for(const [yy,rr]of [[top-shadeHeight/2,r],[top+shadeHeight/2,r*.70]]){const ring=new THREE.Mesh(new THREE.TorusGeometry(rr,.005,5,24),m.wood);ring.rotation.x=Math.PI/2;ring.position.set(0,yy,0);node.add(ring);}
      oval(node,m.glow,0,top,0,r*.55,shadeHeight*.75,r*.55);
    }else if(kind==='tube'||kind==='saucer'){
      cyl(node,m.frame,0,top,0,kind==='tube'?r*.48:r*.42,kind==='tube'?r*.48:r,kind==='tube'?shadeHeight:.07,28);
      cyl(node,m.glow,0,top-(kind==='tube'?shadeHeight/2:.04),0,kind==='tube'?r*.43:r*.86,kind==='tube'?r*.43:r*.86,.008,24);
    }else{
      const shade=new THREE.Mesh(new THREE.CylinderGeometry(r*.70,r,shadeHeight,32,1,true),m.lampShade||m.linen);shade.position.set(0,top,0);node.add(shade);
      cyl(node,m.glow,0,top-shadeHeight/2+.008,0,r*.86,r*.86,.006,24);
      if(kind==='lantern')for(const a of [-1,1])for(const b of [-1,1])rod(node,m.frame,[a*r*.65,top-shadeHeight/2,b*r*.65],[a*r*.65,top+shadeHeight/2,b*r*.65],.006);
    }
  }
  function car(g,w,d) {
    if(w>d){g=group(g,0,0,0,Math.PI/2);[w,d]=[d,w];}
    rounded(g,m.frame,0,.50,0,w*.95,.44,d*.99,.16);rounded(g,m.cabinet,0,.73,0,w,.48,d*.93,.20);
    rounded(g,m.blackGlass,0,1.02,-d*.04,w*.88,.61,d*.52,.235);rounded(g,m.cabinet,0,1.30,-d*.07,w*.75,.12,d*.32,.055);
    for(const a of [-1,1])for(const b of [-1,1]){const wheel=cyl(g,m.dark,a*w*.465,.32,b*d*.305,.315,.315,.13,24);wheel.rotation.z=Math.PI/2;const hub=cyl(g,m.steel,a*w*.505,.32,b*d*.305,.186,.186,.024,16);hub.rotation.z=Math.PI/2;}
    for(const a of [-1,1]) {rounded(g,m.glow,a*w*.294,.724,d*.468,w*.215,.089,.035,.015);rounded(g,m.pot,a*w*.3,.747,-d*.468,w*.185,.075,.035,.014);}
  }
  function exerciseBike(g,w,d,f={}){
    const rubber=m.rubber||m.dark;
    for(const z of [-d*.36,d*.36]){rod(g,m.steel,[-w*.43,.085,z],[w*.43,.085,z],.026);for(const side of [-1,1])cyl(g,rubber,side*w*.43,.045,z,.044,.044,.065,12);}
    rod(g,m.frame,[0,.14,-d*.32],[0,.14,d*.34],.038);
    const wheel=cyl(g,rubber,0,.34,d*.15,.225,.225,.10,28);wheel.rotation.z=Math.PI/2;
    for(const side of [-1,1]){const hub=cyl(g,m.steel,side*.055,.34,d*.15,.17,.17,.012,24);hub.rotation.z=Math.PI/2;}
    rod(g,m.frame,[0,.18,d*.28],[0,.67,-d*.18],.043);rod(g,m.frame,[0,.18,-d*.30],[0,.67,-d*.18],.035);
    rod(g,m.steel,[0,.61,-d*.18],[0,.98,-d*.25],.022);rounded(g,rubber,0,1.00,-d*.25,.26,.075,.24,.025);
    rod(g,m.frame,[0,.17,d*.34],[0,1.15,d*.30],.027);
    for(const side of [-1,1])rod(g,rubber,[0,1.14,d*.28],[side*w*.34,1.19,d*.16],.020);
    const console=rounded(g,m.blackGlass,0,1.15,d*.29,.20,.09,.025,.009);console.rotation.x=-.25;
    for(const side of [-1,1]){rod(g,m.steel,[0,.40,0],[side*w*.35,.40,side*.06],.015);box(g,rubber,side*w*.38,.40,side*.06,.14,.035,.085);}
    if(f.premium){
      // Drop bars, independent fit adjustments and a central smart resistance
      // unit distinguish the training bike from the former generic spinner.
      for(const side of [-1,1]){
        rod(g,rubber,[side*w*.32,1.17,d*.18],[side*w*.34,1.04,d*.34],.019);
        rod(g,rubber,[side*w*.34,1.04,d*.34],[side*w*.28,1.01,d*.39],.019);
        box(g,m.steel,side*.045,.82,d*.30,.027,.11,.025);
      }
      rounded(g,m.frame,0,.37,-d*.07,.17,.24,.28,.035);
      box(g,m.steel,0,.69,-d*.18,.12,.035,.16);
      cyl(g,m.bronze,.072,.69,-d*.18,.021,.021,.025,12).rotation.z=Math.PI/2;
    }
  }
  function exerciseBench(g,w,d,f={}){
    const rubber=m.rubber||m.dark;
    const top=f.height||.52,padY=top-.05;
    for(const z of [-d*.34,d*.34]){rod(g,m.frame,[0,.09,z],[0,padY-.07,z],.027);rod(g,m.frame,[-w*.43,.07,z],[w*.43,.07,z],.028);}
    rod(g,m.steel,[0,.25,-d*.39],[0,.25,d*.39],.025);
    rounded(g,rubber,0,padY,-d*.16,Math.min(.30,w*.74),.10,d*.61,.035);
    rounded(g,rubber,0,padY,d*.31,Math.min(.30,w*.74),.10,d*.27,.035);
    rod(g,m.steel,[0,.27,-d*.20],[0,padY-.04,d*.12],.018);
    for(const side of [-1,1])rod(g,m.frame,[side*w*.36,.12,-d*.39],[side*w*.36,.12,d*.39],.012);
    if(f.adjustable){
      for(let i=0;i<6;i++)box(g,m.steel,0,.27,-d*.31+i*d*.065,.12,.035,.024);
      for(const side of [-1,1])cyl(g,rubber,side*w*.40,.065,-d*.39,.055,.055,.045,16).rotation.z=Math.PI/2;
      rod(g,m.steel,[-.12,.16,d*.46],[.12,.16,d*.46],.018);
      cyl(g,m.bronze,.067,.28,-d*.16,.025,.025,.034,12).rotation.z=Math.PI/2;
    }
  }
  function cableTrainer(g,w,d,f){
    const rubber=m.rubber||m.dark,h=f.height||2.10,back=-d/2+.045,front=d/2-.11;
    // The shallow frame, dual real stacks, travelling pulley trolleys and
    // independent handles all stay inside the reserved wall-mounted envelope.
    for(const side of [-1,1]){
      const x=side*w*.39;
      box(g,m.frame,x,.055,0,.20,.11,d);
      box(g,m.frame,x,h/2,front,.075,h,.075);
      box(g,m.frame,x,h/2,back,.065,h,.065);
      for(const yy of [.12,h-.04])box(g,m.frame,x,yy,0,.065,.065,d);
      for(const xx of [x-.10,x+.10])rod(g,m.steel,[xx,.16,-d*.14],[xx,h-.12,-d*.14],.012);
      for(let i=0;i<13;i++)box(g,rubber,x,.20+i*.040,-d*.14,.29,.032,.22);
      box(g,m.steel,x,.76,-d*.14,.27,.055,.21);
      box(g,m.frame,x,1.17,front+.008,.125,.25,.12);
      for(const yy of [1.11,1.24,h-.13,.19]){
        const wheel=cyl(g,m.dark,x,yy,yy>1.3?back+.08:front,.058,.058,.028,16);wheel.rotation.x=Math.PI/2;
        cyl(g,m.steel,x,yy,yy>1.3?back+.065:front+.018,.018,.018,.035,12).rotation.x=Math.PI/2;
      }
      rod(g,m.steel,[x,.78,-d*.14],[x,h-.13,-d*.14],.004);
      rod(g,m.steel,[x,h-.13,-d*.14],[x,h-.13,front],.004);
      rod(g,m.steel,[x,h-.13,front],[x,1.12,front],.004);
      rod(g,m.dark,[x,1.12,front+.035],[x,1.00,front+.075],.008);
      rod(g,rubber,[x-.075,.97,front+.085],[x+.075,.97,front+.085],.015);
      for(const yy of [.20,.55,.90,1.35,1.70,h-.10])box(g,m.steel,x,yy,front+.039,.018,.012,.006);
    }
    for(const yy of [.12,h-.04])box(g,m.frame,0,yy,back,w,.075,.075);
    box(g,m.steel,0,h-.035,back+.041,.23,.035,.008);
  }
  function adjustableDumbbells(g,w,d){
    const rubber=m.rubber||m.dark;
    for(const side of [-1,1]){
      const x=side*w*.27;
      for(const z of [-d*.33,d*.33])rod(g,m.frame,[x,.06,z],[x,.50,z*.60],.026);
      box(g,m.frame,x,.51,0,w*.43,.035,d*.90);
      box(g,rubber,x,.54,0,w*.40,.025,d*.87);
      rod(g,m.steel,[x,.64,-d*.19],[x,.64,d*.19],.018);
      for(const end of [-1,1])for(let i=0;i<5;i++)box(g,rubber,x,.65,end*(d*.17+i*.027),w*.32,.22,.022);
      box(g,m.steel,x,.76,0,w*.20,.025,.035);
    }
    box(g,m.frame,0,.15,-d*.32,w,.045,.05);
  }
  function gymStorage(g,w,d,f){
    const rubber=m.rubber||m.dark,h=f.height||1.36;
    box(g,m.wood,0,h/2,-d/2+.018,w,h,.035);
    for(const yy of [.10,.47])box(g,m.wood,0,yy,0,w,.035,d);
    for(let i=0;i<3;i++){
      const x=(i-1)*w*.29,r=.066+i*.005;
      oval(g,rubber,x,.19,0,r*2,.16,r*1.7);
      const grip=new THREE.Mesh(new THREE.TorusGeometry(.049,.011,6,14),m.frame);grip.position.set(x,.30,0);g.add(grip);
    }
    for(const side of [-1,1]){
      const x=side*w*.31;
      rod(g,m.steel,[x,h-.13,-d*.41],[x,h-.13,-d*.22],.011);
      const band=new THREE.Mesh(new THREE.TorusGeometry(.092,.009,5,18),side<0?m.accent:rubber);band.position.set(x,h-.26,-d*.22);band.scale.y=1.7;g.add(band);
    }
    cyl(g,rubber,-w*.23,.72,-d*.10,.07,.07,.42,16);
    cyl(g,m.accent,w*.23,.71,-d*.10,.055,.055,.40,16);
  }
  function wallTV(g,f){
    const facing=f.screenFront||[0,1],length=Math.hypot(...facing),normal=facing.map(v=>v/length),angle=Math.atan2(normal[0],normal[1]);
    const y=f.mountHeight||1.40,span=f.screenWidth||.84,screenH=f.screenHeight||span*.5625;
    const anchor=f.wallAnchor||[f.x-normal[0]*.06,f.z-normal[1]*.06],ax=anchor[0]-f.x,az=anchor[1]-f.z;
    const rear=[-normal[0]*.035,y,-normal[1]*.035],hinge=[ax*.5+rear[0]*.5,y,az*.5+rear[2]*.5];
    const wallPlate=group(g,ax,y,az,Math.atan2(-ax,-az));box(wallPlate,m.frame,0,0,0,.09,.14,.025);
    rod(g,m.frame,[ax,y,az],hinge,.014);rod(g,m.frame,hinge,rear,.014);
    const screen=group(g,0,y,0,angle);screen.name=f.id+'-screen';screen.userData.role='wall-mounted-screen';screen.userData.viewingDirection=normal;
    rounded(screen,m.frame,0,0,0,span,screenH,.035,.010);
    box(screen,m.blackGlass,0,0,.021,span-.020,screenH-.020,.006);
    box(screen,m.steel,0,-screenH/2+.008,.021,.022,.003,.006);
  }
  function workDesk(g,w,d,f){
    rounded(g,m.oak,0,.738,0,w,.055,d,.02);legs(g,w*.84,d*.71,.714,.028);
    const count=f.workstations===2?2:1;
    for(let i=0;i<count;i++){
      const x=(i-(count-1)/2)*(w/2),computer=group(g,x,0,0);computer.userData.role='computer-station';computer.userData.station=i+1;
      if(f.computer==='laptop'){
        box(computer,m.steel,0,.779,.035,.36,.014,.24);
        const screen=group(computer,0,.89,-.071,-0);screen.rotation.x=-.15;
        rounded(screen,m.blackGlass,0,0,0,.36,.22,.016,.008);screen.userData.role='computer-monitor';
        box(computer,m.frame,0,.788,.028,.30,.004,.12);
      }else{
        box(computer,m.frame,0,.777,-d*.12,.17,.025,.107);box(computer,m.steel,0,.88,-d*.14,.032,.20,.04);
        const screen=rounded(computer,m.blackGlass,0,1.046,-d*.15,Math.min(w/count*.55,.61),.34,.031,.012);screen.userData.role='computer-monitor';
        box(computer,m.frame,0,.773,d*.16,Math.min(.36,w/count*.38),.017,.12);
        oval(computer,m.steel,.25,.779,d*.16,.047,.025,.073);
        rounded(computer,m.frame,.23,.19,-d*.22,.11,.28,.20,.012);
      }
    }
    if(f.drawer){
      box(g,m.wood,w*.35,.64,0,w*.22,.15,d*.82);
      box(g,m.bronze,w*.35,.65,d*.42,w*.09,.009,.014);
    }else plant(g,-w*.43,.77,-d*.17,.085);
  }
  function weightRack(g,w,d){
    const rubber=m.rubber||m.dark;
    for(const side of [-1,1]){rod(g,m.frame,[side*w*.41,.04,-d*.35],[side*w*.41,.63,d*.10],.023);rod(g,m.frame,[side*w*.41,.04,d*.36],[side*w*.41,.63,d*.10],.023);}
    for(const y of [.32,.63]){
      box(g,m.frame,0,y,0,w,.035,d*.79);
      for(let i=0;i<3;i++){
        const x=(i-1)*w*.29;rod(g,m.steel,[x-.095,y+.075,0],[x+.095,y+.075,0],.018);
        for(const side of [-1,1]){const head=cyl(g,rubber,x+side*.10,y+.075,0,.068,.068,.055,8);head.rotation.z=Math.PI/2;}
      }
    }
  }
  function plantUnit(g,w,d,h){
    const tankX=w*.23,tankR=Math.min(d*.41,w*.22),tankH=h-.18;
    cyl(g,m.frame,tankX,.05,0,tankR*.88,tankR*.88,.10,24);
    cyl(g,m.painted||m.ceramic,tankX,.10+tankH/2,0,tankR,tankR,tankH,32);
    cyl(g,m.steel,tankX,.10+tankH,0,tankR*.96,tankR*.96,.035,28);
    const unitX=-w*.29,unitW=w*.38,unitH=h*.63;
    rounded(g,m.painted||m.ceramic,unitX,.13+unitH/2,0,unitW,unitH,d*.87,.026);
    box(g,m.blackGlass,unitX,.13+unitH*.76,d*.442,unitW*.54,.11,.016);
    for(let i=0;i<5;i++)box(g,m.frame,unitX,.22+i*.032,d*.444,unitW*.68,.009,.015);
    for(const offset of [-.08,.08]){
      rod(g,m.bronze,[unitX+offset,.13+unitH,-d*.30],[unitX+offset,h-.02,-d*.30],.012);
      rod(g,m.bronze,[unitX+offset,h-.02,-d*.30],[tankX+offset,h-.02,-d*.30],.012);
    }
    box(g,m.frame,unitX,h-.02,-d*.30,unitW*.90,.035,.035);
  }
  for(const f of plan.fixtures||[]) {
    let w=f.width,d=f.depth;if(!(w>0&&d>0))continue;
    let g=group(parent,f.x,f.kind==='wallCabinet'?(f.baseHeight||0):0,f.z,f.rotation||0);const fixtureRoot=g;
    g.userData.fixtureId=f.id;g.userData.fixtureKind=f.kind;g.userData.interiorRecipe=design.id;
    if(['desk','chair','armchair','fridge','dishwasher','steamOven','speedOven','wineCooler','nightstand','mirror','spaStep','bookcase','washer','dryer','exerciseBike','exerciseBench','weightRack','plantUnit','cableTrainer','adjustableDumbbells','gymStorage'].includes(f.kind)&&f.front)[g,w,d]=faceFront(g,f,w,d);
    else if(f.kind==='desk'&&d>w){g=group(g,0,0,0,Math.PI/2);[w,d]=[d,w];}
    if(f.kind==='sofa'&&f.front){if(f.shape?.toUpperCase()==='U'){const a=Math.atan2(f.front[0],f.front[1])-Math.PI/2;g=group(g,0,0,0,a);if(Math.abs(f.front[1])>.5)[w,d]=[d,w];}else [g,w,d]=faceFront(g,f,w,d);}
    switch(f.kind){
      case 'sofa': if(f.shape?.toUpperCase()==='U'){rounded(g,m.rug,0,.012,0,w*.99,.022,d*.99,.009);sectional(g,w,d);const openW=w-Math.min(.91,w*.33,d*.29),openD=d-2*Math.min(.91,w*.33,d*.29);if(openW>.85&&openD>.68)table(group(g,w*.14,.015,0),openW*.52,openD*.53,false);}else sofa(g,w,d);break;
      case 'armchair':sofa(g,w,d);break;
      case 'diningTable':table(g,w,d,true,f);break;
      case 'coffeeTable':table(g,w,d,false);break;
      case 'rug':rounded(g,m.rug,0,.021,0,w,.018,d,.008);break;
      case 'exerciseMat':{rounded(g,m.rubber||m.dark,0,.018,0,w,.018,d,.012);for(const side of [-1,1])box(g,m.slate,side*(w/2-.025),.028,0,.012,.002,d-.05);break;}
      case 'exerciseBike':exerciseBike(g,w,d,f);break;
      case 'exerciseBench':exerciseBench(g,w,d,f);break;
      case 'weightRack':weightRack(g,w,d);break;
      case 'cableTrainer':cableTrainer(g,w,d,f);break;
      case 'adjustableDumbbells':adjustableDumbbells(g,w,d);break;
      case 'gymStorage':gymStorage(g,w,d,f);break;
      case 'plantUnit':plantUnit(g,w,d,f.height||1.95);break;
      case 'worktop':rounded(g,m.stone,0,(f.baseHeight||.88)+(f.height||.038)/2,0,w,f.height||.038,d,.009);break;
      case 'ottoman':{const h=f.height||.36;rounded(g,m.wood,0,.085,0,w*.88,.15,d*.88,.025);rounded(g,m.fabric,0,h-.105,0,w,.21,d,.070);break;}
      case 'sideTable':{const h=f.height||.42;turned(g,m.wood,0,0,0,[[.13,.02],[.15,.05],[.065,h-.07]],1,1);cyl(g,m.stone,0,h-.022,0,w*.5,w*.5,.044,32);books(g,0,h+.004,0,w*.50);break;}
      case 'floorLamp':case 'tableLamp':shadedLamp(g,f,w,d);break;
      case 'chair':chair(g,0,0,0,w,d);break;
      case 'bed':bed(g,w,d,f);break;
      case 'sofaBed':if(f.open)bed(g,w,d,f);else {const frame=faceFront(g,f,w,d);sofa(frame[0],frame[1],frame[2]);}break;
      case 'kitchen':case 'counter':kitchen(g,f,w,d);break;
      case 'console':{if(f.variant==='worktable'){const h=f.height||.89;rounded(g,m.stone,0,h,0,w,.055,d,.018);legs(g,w*.83,d*.73,h-.04,.035,m.wood,.012);box(g,m.wood,0,.16,0,w*.83,.048,d*.72);}else{kitchen(g,f,w,d);books(g,w*.25,(f.height||.72)+.03,0,.27);plant(g,w*.05,(f.height||.72)+.03,0,.12);}break;}
      case 'wallCabinet':case 'storage':case 'wardrobe':kitchen(g,f,w,d,true);break;
      case 'basin':case 'tub':case 'hotTub':case 'bidet':case 'shower':case 'wc':case 'toilet':case 'sink':bathroom(g,f,w,d);break;
      case 'spaStep':{const h=f.height||.32;box(g,m.wood,0,h*.25,d*.25,w,h*.50,d*.50);box(g,m.wood,0,h*.50,-d*.25,w,h,d*.50);for(const z of [-d*.25,d*.25])for(let i=0;i<4;i++)box(g,m.frame,0,z<0?h+.003:h*.50+.003,z-d*.19+i*d*.12,w*.92,.006,.012);break;}
      case 'nightstand':{const h=f.height||.52;if(renovated&&['taper','woven','slatted','midcentury','cane'].includes(design.cabinet))legs(g,w*.72,d*.68,.18,.022,m.wood,.012);rounded(g,design.cabinet==='louvred'?painted:m.wood,0,h*.60,0,w,h*.74,d,.024);rounded(g,m.stone,0,h,0,w,.035,d,.012);box(g,design.cabinet==='louvred'?painted:m.cabinet,0,h*.67,d*.51,w*.91,h*.37,.018);if(renovated&&design.cabinet==='cane')weavePanel(g,0,h*.67,d*.525,w*.80,h*.26);else if(renovated&&design.cabinet==='louvred')louvrePanel(g,0,h*.66,d*.525,w*.80,h*.26);else box(g,m.bronze,0,h*.75,d*.54,w*.21,.011,.015);books(g,0,h+.02,0,w*.53);break;}
      case 'sauna':if(f.variant==='heater'){rounded(g,m.frame,0,.30,0,w,.53,d,.035);for(let i=0;i<8;i++)oval(g,m.slate,Math.sin(i*2.4)*w*.29,.57,Math.cos(i*2.4)*d*.29,.079,.056,.082);}else sauna(g,w,d);break;
      case 'bench':bench(g,w,d);break;
      case 'car':car(g,w,d);break;
      case 'mirror':{const y=f.mountHeight??1.52,h=f.height||.77;if(f.heroMirror){
        box(g,m.frame,0,y,0,w,h,d);
        // Register the fallback with the floor finishes, which also own it
        // when this model is used without the optional reflection renderer.
        const material=m.heroMirror||(m.heroMirror=new THREE.MeshStandardMaterial({color:0xffffff,metalness:1,roughness:.06,envMapIntensity:1}));
        const surface=new THREE.Mesh(new THREE.PlaneGeometry(w-.012,h-.012),material);surface.position.set(0,y,d/2+.001);
        surface.name='kitchen-hall-selfie-mirror-surface';surface.userData.heroMirror=true;surface.userData.preserveTransform=true;surface.userData.mirrorLocalNormal=[0,0,1];g.add(surface);
      }else if(d>w){box(g,m.bronze,0,y,0,w,h,d);box(g,m.steel,-w*.52,y,0,.006,h-.04,d-.042);box(g,m.steel,w*.52,y,0,.006,h-.04,d-.042);}else{box(g,m.bronze,0,y,0,w,h,d);box(g,m.steel,0,y,d*.52,w-.042,h-.04,.006);}break;}
      case 'towelRail':{const y=f.mountHeight??1.18;for(const sign of [-1,1])cyl(g,m.steel,sign*w*.455,y,0,.011,.011,.79,12);for(let i=0;i<8;i++)rod(g,m.steel,[-w*.455,y-.32+i*.092,0],[w*.455,y-.32+i*.092,0],.012);box(g,m.linen,-w*.13,y-.11,-d*.3,w*.39,.33,.019);break;}
      case 'plant':plant(g,0,0,0,Math.min(w,d)*.58);break;
      case 'tv':{let front=g,span=w,dep=d;if(d>w){front=group(g,0,0,0,-Math.PI/2);span=d;dep=w;}rounded(front,m.wood,0,.31,0,span,.48,dep,.031);box(front,m.dark,0,1.13,0,span*.91,Math.min(.84,span*.51),.055);box(front,m.blackGlass,0,1.13,.032,span*.884,Math.min(.81,span*.49),.01);break;}
      case 'wallTv':wallTV(g,f);break;
      case 'cinemaSpeaker':case 'cinemaSub':case 'cinemaConsole':case 'cinemaPanel':furnishCinemaFixture(g,f,{...tools,box,rounded},m);break;
      case 'desk':workDesk(g,w,d,f);break;
      case 'hob':{if(!f.hostId)kitchen(g,f,w,d);const top=f.induction?.920:.937;rounded(g,m.blackGlass,0,top,0,w,f.induction?.008:.022,d,.008);for(const a of [-1,1])for(const b of [-1,1]){const r=Math.min(w,d)*.14;const ring=new THREE.Mesh(new THREE.TorusGeometry(r,.002,4,20),m.steel);ring.position.set(a*w*.22,top+(f.induction?.005:.013),b*d*.21);ring.rotation.x=Math.PI/2;g.add(ring);}if(f.induction)box(g,m.frame,0,top+.005,-d*.37,.25,.002,.025);break;}
      case 'fridge':{if(furnishKitchenAppliance(g,f,w,d,{...tools,box,rounded},m))break;rounded(g,m.steel,0,.94,0,w,1.88,d,.037);box(g,m.frame,0,.71,d*.505,w*.94,.012,.012);box(g,m.frame,-w*.33,1.02,d*.515,.022,.31,.031);break;}
      case 'steamOven':case 'speedOven':case 'wineCooler':case 'dishwasher':{
        furnishKitchenAppliance(g,f,w,d,{...tools,box,rounded},m);
        if(f.kind==='dishwasher')kitchen(group(g,0,f.frontBase||.135,0),{kind:'wallCabinet',height:f.frontHeight||.72,panelOnly:true,handleless:true},w-.004,d,true);
        if(f.kind==='wineCooler')kitchen(group(g,0,(f.height||.816)+.006,0),{kind:'wallCabinet',height:.900-.019-(f.height||.816)-.006,panelOnly:true,plainPanel:true},w-.006,d,true);
        break;
      }
      case 'washer':case 'dryer':{rounded(g,m.ceramic,0,.42,0,w,.84,d,.027);const door=cyl(g,m.blackGlass,0,.407,d/2,.205,.205,.042,24);door.rotation.x=Math.PI/2;box(g,m.frame,w*.16,.744,d*.51,w*.27,.056,.016);break;}
      case 'bookcase':{box(g,m.wood,0,.86,-d*.48,w,1.72,.032);for(const a of [-1,1])box(g,m.wood,a*(w/2-.014),.86,0,.028,1.72,d);for(let i=0;i<5;i++){box(g,m.wood,0,.06+i*.4,0,w,.03,d);if(i<4)for(let b=0;b<7;b++)box(g,[m.paper,m.accent,m.fabric][b%3],-w*.38+b*w*.09,.205+i*.4,0,w*.062,.247+(b%3)*.017,d*.73);}break;}
      case 'heater':{rounded(g,m.frame,0,.30,0,w,.53,d,.035);for(let i=0;i<8;i++)oval(g,m.slate,Math.sin(i*2.4)*w*.29,.57,Math.cos(i*2.4)*d*.29,.079,.056,.082);break;}
    }
    if(f.modules||f.doorCount===4||['steamOven','speedOven','dishwasher','wineCooler'].includes(f.kind))batchGroup(fixtureRoot);
  }
}
