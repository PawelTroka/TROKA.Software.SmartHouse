import * as THREE from '../vendor/three.module.js';
import {toWorld, toWorldRoofTriangle, toWorldTriangle} from './orientation.js?v=1.13.0';

const point=(x,y,z)=>new THREE.Vector3(...toWorld(x,y,z));
const ringOpen=ring=>ring.length>1&&Math.hypot(ring[0][0]-ring.at(-1)[0],ring[0][1]-ring.at(-1)[1])<1e-8?ring.slice(0,-1):ring;

/** Pure Three.js meshes for the proposed spa objects. All heights are supplied
 * by the shared landscape geometry, keeping pad and sunken-floor levels fixed
 * across the model, shade rays and observer views. */
export function createSpaAmenityGroup(program, levels, materials, svgMode=false) {
  const group=new THREE.Group();group.name='spa-amenities';
  if(!program?.active)return group;
  const mat=materials;
  const box=(parent,name,x,y,z,width,length,height,material,cast=true)=>{
    if(!(width>0&&length>0&&height>0))return null;
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,length),material);
    mesh.name=name;mesh.position.copy(point(x+width/2,y+length/2,z+height/2));
    mesh.castShadow=cast;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  };
  const prism=(parent,name,footprint,base,top,material,cast=true)=>{
    const r=ringOpen(footprint),triangles=[];
    for(let i=0;i<r.length;i++){
      const a=r[i],b=r[(i+1)%r.length];
      triangles.push(toWorldTriangle([...a,base],[...b,base],[...b,top]),toWorldTriangle([...a,base],[...b,top],[...a,top]));
    }
    for(const [a,b,c] of THREE.ShapeUtils.triangulateShape(r.map(p=>new THREE.Vector2(...p)),[]))triangles.push(toWorldRoofTriangle([...r[a],top],[...r[b],top],[...r[c],top]));
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(triangles.flat(2),3));geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.castShadow=cast;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  };
  const panel=(parent,name,a,b,base,height,thickness,material,cast=true)=>{
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(!(length>0&&height>0))return null;
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(length,height,thickness),material);
    mesh.position.copy(point((a[0]+b[0])/2,(a[1]+b[1])/2,base+height/2));
    mesh.rotation.y=-Math.atan2(b[1]-a[1],b[0]-a[0]);mesh.name=name;mesh.castShadow=cast;mesh.receiveShadow=cast;parent.add(mesh);return mesh;
  };

  const sauna=program.sauna;
  if(sauna){
    const g=new THREE.Group();g.name='six-person-corner-sauna';group.add(g);
    const floor=levels.sauna.floorZ,roof=levels.sauna.roofZ;
    // In the edge layout the mapped footprint is the outer envelope. Put
    // panel thickness and glazing frames inside it, so measured boundary
    // clearances agree with the actual rendered wall faces.
    const edgePanel=(a,b,trim=0)=>{
      if(!['spa-edge','spa-compact','spa-screened','spa-grove','spa-aligned'].includes(program.id))return [a,b];
      const len=Math.hypot(b[0]-a[0],b[1]-a[1]),dx=(b[0]-a[0])/len,dy=(b[1]-a[1])/len;
      return [[a[0]-dy*.07+dx*trim,a[1]+dx*.07+dy*trim],
        [b[0]-dy*.07-dx*trim,b[1]+dx*.07-dy*trim]];
    };
    prism(g,'sauna-pad',sauna.footprint,levels.sauna.padBaseZ??levels.sauna.groundZ-.6,floor,mat.stone);
    for(const [i,step] of (levels.sauna.entrySteps||[]).entries())prism(g,`sauna-entry-step-${i}`,step.footprint,step.baseZ,step.topZ,mat.stoneLight);
    prism(g,'sauna-warm-floor',sauna.footprint,floor,floor+.025,mat.woodLight,false);
    for(const [i,wall] of sauna.walls.entries()){
      const [a,b]=edgePanel(...(wall.points||[wall.a,wall.b]));
      const base=floor+wall.bottom,height=wall.top-wall.bottom;
      panel(g,`sauna-wall-${i}`,a,b,base,height,.14,mat.wood);
      const len=Math.hypot(b[0]-a[0],b[1]-a[1]),dx=(b[0]-a[0])/len,dy=(b[1]-a[1])/len;
      const nx=-dy*.085,ny=dx*.085;
      if(!svgMode)for(let s=.05;s<len-.04;s+=.14){
        const p=[a[0]+dx*s+nx,a[1]+dy*s+ny],q=[a[0]+dx*Math.min(s+.047,len)+nx,a[1]+dy*Math.min(s+.047,len)+ny];
        panel(g,'sauna-timber-fin',p,q,base+.005,Math.max(.01,height-.01),.035,mat.woodLight,false);
      }
    }
    for(const [i,glass] of sauna.glazing.entries()){
      const [a,b]=edgePanel(...(glass.points||[glass.a,glass.b]),.07);
      const base=floor+glass.bottom,height=glass.top-glass.bottom;
      panel(g,`sauna-glazing-${i}`,a,b,base,height,.022,mat.glass,false);
      panel(g,'sauna-glazing-sill',a,b,base,.045,.065,mat.metal,false);
      panel(g,'sauna-glazing-head',a,b,floor+glass.top-.045,.045,.065,mat.metal,false);
      for(const p of [a,b])box(g,'sauna-glazing-mullion',p[0]-.026,p[1]-.026,base,.052,.052,height,mat.metal,false);
      const len=Math.hypot(b[0]-a[0],b[1]-a[1]);
      if(len>2.1){const p=[(a[0]+b[0])/2,(a[1]+b[1])/2];box(g,'sauna-glazing-mullion',p[0]-.022,p[1]-.022,base,.044,.044,height,mat.metal,false);}
    }
    for(const [i,bench] of [...sauna.benches,...(sauna.lowerBenches||[])].entries()){
      const z=floor+(bench.height??.83)-.085,depth=bench.length??bench.depth;
      box(g,`sauna-bench-${i}`,bench.x,bench.y,z,bench.width,depth,.085,mat.woodLight,false);
      box(g,'sauna-bench-base',bench.x+.06,bench.y+.05,floor,bench.width-.12,depth-.1,z-floor-.04,mat.wood,false);
      if(!svgMode)for(let sx=bench.x+.08;sx<bench.x+bench.width-.08;sx+=.11)box(g,'sauna-bench-slat',sx,bench.y+.015,z+.086,.055,depth-.03,.012,mat.wood,false);
    }
    if(sauna.heater){
      const h=sauna.heater;
      box(g,'sauna-electric-heater',h.x,h.y,floor+.10,h.width,h.length,.70,mat.metal);
      for(let ix=0;ix<3;ix++)for(let iy=0;iy<3;iy++){
        const rock=new THREE.Mesh(new THREE.IcosahedronGeometry(.085,0),mat.plinth);
        rock.name='sauna-heater-stone';rock.position.copy(point(h.x+.12+ix*.13,h.y+.12+iy*.13,floor+.83));rock.scale.y=.7;g.add(rock);
      }
    }
    if(sauna.door){
      const {a,b}=sauna.door,dx=b[0]-a[0],dy=b[1]-a[1],p=[a[0]+dx*.8,a[1]+dy*.8];
      box(g,'sauna-door-handle',p[0]-.025,p[1]-.025,floor+.90,.05,.05,.38,mat.woodLight,false);
    }
    prism(g,'sauna-roof',sauna.footprint,roof-.10,roof,mat.metal);
    // A recessed warm line makes the glazed corner legible without pretending
    // the interior light contributes to the analytical daylight calculation.
    if(mat.spaGlow)for(const glazing of sauna.glazing){const [a,b]=edgePanel(...(glazing.points||[glazing.a,glazing.b]),.07);panel(g,'sauna-warm-light',a,b,roof-.17,.025,.035,mat.spaGlow,false);}
  }

  const plunge=program.coldPlunge;
  if(plunge){
    const g=new THREE.Group();g.name='cold-plunge';group.add(g);
    const z=levels.coldPlunge.baseZ,bottom=levels.coldPlunge.bottomZ,h=levels.coldPlunge.rimZ-bottom,t=plunge.rim??.12;
    const pad=plunge.pad??.18,padBase=levels.coldPlunge.padBaseZ??z-.10,padTop=z+.02;
    for(const [x,y,w,l] of [[plunge.x-pad,plunge.y-pad,plunge.width+2*pad,pad],[plunge.x-pad,plunge.y+plunge.length,plunge.width+2*pad,pad],[plunge.x-pad,plunge.y,pad,plunge.length],[plunge.x+plunge.width,plunge.y,pad,plunge.length]])box(g,'plunge-pad',x,y,padBase,w,l,padTop-padBase,mat.stone);
    box(g,'plunge-basin-floor',plunge.x,plunge.y,bottom-.10,plunge.width,plunge.length,.10,mat.basin);
    box(g,'plunge-long-side',plunge.x,plunge.y,bottom,plunge.width,t,h,mat.stone);
    box(g,'plunge-long-side',plunge.x,plunge.y+plunge.length-t,bottom,plunge.width,t,h,mat.stone);
    box(g,'plunge-end',plunge.x,plunge.y,bottom,t,plunge.length,h,mat.stone);
    box(g,'plunge-end',plunge.x+plunge.width-t,plunge.y,bottom,t,plunge.length,h,mat.stone);
    box(g,'cold-plunge-water',plunge.x+t,plunge.y+t,levels.coldPlunge.waterZ-.018,plunge.width-2*t,plunge.length-2*t,.018,mat.waterLight,false);
    for(const [i,step] of levels.coldPlunge.steps.entries()){
      const base=step.baseZ??z;
      box(g,`plunge-access-step-${i}`,step.x,step.y,base,step.width,step.length,step.topZ-base,mat.woodLight,false);
    }
  }

  const pit=program.firepit;
  if(pit){
    const g=new THREE.Group();g.name='sunken-firepit';group.add(g);
    const rim=levels.firepit.rimZ,floor=levels.firepit.floorZ,t=pit.wallThickness??.18;
    box(g,'firepit-sunken-floor',pit.x,pit.y,floor-.10,pit.width,pit.length,.10,mat.stoneLight);
    box(g,'firepit-back-retaining-wall',pit.x,pit.y+pit.length-t,floor,pit.width,t,rim-floor,mat.stone);
    box(g,'firepit-west-retaining-wall',pit.x,pit.y,floor,t,pit.length,rim-floor,mat.stone);
    box(g,'firepit-east-retaining-wall',pit.x+pit.width-t,pit.y,floor,t,pit.length,rim-floor,mat.stone);
    const steps=levels.firepit.steps,entryX=steps[0].x,entryW=steps[0].width;
    box(g,'firepit-front-wall-left',pit.x,pit.y,floor,entryX-pit.x,t,rim-floor,mat.stone);
    box(g,'firepit-front-wall-right',entryX+entryW,pit.y,floor,pit.x+pit.width-entryX-entryW,t,rim-floor,mat.stone);
    for(const [wx,wy,ww,wl] of [[pit.x-.08,pit.y+pit.length-.08,pit.width+.16,.20],[pit.x-.08,pit.y-.08,.20,pit.length+.16],[pit.x+pit.width-.12,pit.y-.08,.20,pit.length+.16]])box(g,'firepit-coping',wx,wy,rim-.03,ww,wl,.08,mat.stoneLight,false);
    for(const [i,step] of steps.entries())box(g,`firepit-entry-step-${i}`,step.x,step.y,floor-.02,step.width,step.length,step.topZ-floor+.02,mat.stoneLight,false);
    const seat=levels.firepit.seatZ-floor;
    for(const [i,b] of pit.seats.entries()){
      const {x,y,width:w,length:l}=b;if(l<=0)continue;
      box(g,`firepit-seat-base-${i}`,x,y,floor,w,l,seat,mat.wood,false);
      box(g,`firepit-seat-cushion-${i}`,x+.025,y+.025,floor+seat,w-.05,l-.05,.10,mat.linen,false);
    }
    const cx=pit.x+pit.width/2,cy=pit.y+pit.length*.57;
    const bowl=new THREE.Mesh(new THREE.CylinderGeometry(.48,.35,.20,svgMode?12:32),mat.metal);
    bowl.name='firepit-bowl';bowl.position.copy(point(cx,cy,floor+.29));bowl.castShadow=true;bowl.receiveShadow=true;g.add(bowl);
    const embers=new THREE.Mesh(new THREE.CircleGeometry(.37,svgMode?12:24),mat.fireGlow||mat.gold);embers.name='firepit-embers';embers.rotation.x=-Math.PI/2;embers.position.copy(point(cx,cy,floor+.395));g.add(embers);
    for(let i=0;i<3;i++){
      const log=new THREE.Mesh(new THREE.CylinderGeometry(.05,.065,.57,6),mat.treeBark||mat.wood);
      log.name='firepit-log';log.position.copy(point(cx+.10*Math.cos(i*2.1),cy+.10*Math.sin(i*2.1),floor+.43));log.rotation.set(.15+i*.1,i*1.1,Math.PI/2);g.add(log);
    }
  }
  return group;
}
