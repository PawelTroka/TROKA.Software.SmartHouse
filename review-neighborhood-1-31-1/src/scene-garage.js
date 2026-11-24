import * as THREE from '../vendor/three.module.js';
import {toWorld,toWorldTriangle,toWorldRoofTriangle} from './orientation.js?v=1.31.1';
import {CYBERSTER_AWD,garageProfileAt,garageVehiclePose} from './garage-ramp.js?v=1.31.1';

const EPS=1e-9;
const openRing=ring=>ring?.length>1&&Math.hypot(ring[0][0]-ring.at(-1)[0],ring[0][1]-ring.at(-1)[1])<EPS?ring.slice(0,-1):ring||[];
const area=ring=>ring.reduce((sum,a,i)=>{const b=ring[(i+1)%ring.length];return sum+a[0]*b[1]-b[0]*a[1];},0)/2;
const bounds=ring=>({x0:Math.min(...ring.map(p=>p[0])),x1:Math.max(...ring.map(p=>p[0])),y0:Math.min(...ring.map(p=>p[1])),y1:Math.max(...ring.map(p=>p[1]))});
const active=layout=>layout?.supported&&layout.enabled;

/** A convex excavation is subtracted geometrically, not by triangle centres.
 * Each returned polygon remains convex and can be triangulated as a fan. */
export function subtractConvexOpening(polygon,opening){
  let remaining=openRing(polygon),clip=openRing(opening);
  if(remaining.length<3||clip.length<3)return [remaining];
  if(area(clip)<0)clip=[...clip].reverse();
  const a=bounds(remaining),b=bounds(clip);
  if(a.x1<=b.x0+EPS||a.x0>=b.x1-EPS||a.y1<=b.y0+EPS||a.y0>=b.y1-EPS)return [remaining];
  const result=[];
  for(let i=0;i<clip.length&&remaining.length>=3;i++){
    const a=clip[i],b=clip[(i+1)%clip.length],distance=p=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
    const inside=[],outside=[];
    for(let j=0;j<remaining.length;j++){
      const p=remaining[j],q=remaining[(j+1)%remaining.length],dp=distance(p),dq=distance(q);
      (dp>=0?inside:outside).push(p);
      if((dp>EPS&&dq<-EPS)||(dp<-EPS&&dq>EPS)){
        const t=dp/(dp-dq),hit=[p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t];
        inside.push(hit);outside.push(hit);
      }else if(Math.abs(dp)<=EPS){
        if(dq<0)outside.push(p);
      }else if(Math.abs(dq)<=EPS){
        if(dp<0)outside.push(q);
      }
    }
    const clean=ring=>ring.filter((p,j)=>!j||Math.hypot(p[0]-ring[j-1][0],p[1]-ring[j-1][1])>EPS);
    const piece=clean(outside);
    if(piece.length>=3&&Math.abs(area(piece))>EPS)result.push(piece);
    remaining=clean(inside);
  }
  return result;
}

export function subtractGarageOpenings(polygon,cutouts=[]){
  let pieces=[polygon];
  for(const cutout of cutouts){
    const ring=cutout.polygon||cutout;
    pieces=pieces.flatMap(piece=>subtractConvexOpening(piece,ring));
  }
  return pieces;
}

/** Cut the ramp AND the ground beneath the proposed basement bay. Otherwise
 * the original context terrain would seal the opening just behind the portal. */
export function garageTerrainCutouts(layout){
  if(!active(layout))return [];
  return [layout.outerFootprint,layout.roomFootprint].filter(r=>r?.length>=3)
    .map((ring,i)=>({id:i?'basement-room-opening':'basement-ramp-opening',...bounds(ring),polygon:openRing(ring)}));
}

/** Finite panels of an existing wall after cutting the proposed entrance.
 * All inputs/outputs are site x,y,elevation, including a slightly skew facade. */
export function garageFacadePanels(a,b,base,top,layout){
  const panel=(u0,u1,z0,z1)=>[[a[0]+(b[0]-a[0])*u0,a[1]+(b[1]-a[1])*u0,z0],
    [a[0]+(b[0]-a[0])*u1,a[1]+(b[1]-a[1])*u1,z0],
    [a[0]+(b[0]-a[0])*u1,a[1]+(b[1]-a[1])*u1,z1],
    [a[0]+(b[0]-a[0])*u0,a[1]+(b[1]-a[1])*u0,z1]];
  if(!active(layout))return [panel(0,1,base,top)];
  const [cx,cy]=layout.portal.center,dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
  const u=((cx-a[0])*dx+(cy-a[1])*dy)/(length*length);
  const offset=Math.abs((cx-a[0])*dy-(cy-a[1])*dx)/length;
  if(offset>.03||u<0||u>1||layout.portal.topZ<=base||layout.portal.bottomZ>=top)return [panel(0,1,base,top)];
  const lo=Math.max(0,u-layout.portal.width/(2*length)),hi=Math.min(1,u+layout.portal.width/(2*length));
  return [[0,lo,base,top],[hi,1,base,top],[lo,hi,base,Math.min(top,layout.portal.bottomZ)],
    [lo,hi,Math.max(base,layout.portal.topZ),top]].filter(([u0,u1,z0,z1])=>u1-u0>EPS&&z1-z0>EPS)
    .map(values=>panel(...values));
}

function geometry(triangles){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(triangles.flat(2),3));
  const uv=[];for(const tri of triangles)for(const p of tri)uv.push(p[0]/2,p[2]/2);
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;
}
const quad=(a,b,c,d)=>[toWorldTriangle(a,b,c),toWorldTriangle(a,c,d)];
function mesh(group,name,triangles,material,shadow=true){
  if(!triangles.length)return null;
  const object=new THREE.Mesh(geometry(triangles),material);object.name=name;
  object.castShadow=shadow;object.receiveShadow=true;group.add(object);return object;
}
function slab(group,name,ring,bottom,top,material){
  ring=openRing(ring);const triangles=[];
  for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length];
    triangles.push(...quad([...a,bottom],[...b,bottom],[...b,top],[...a,top]));
  }
  for(let i=1;i<ring.length-1;i++)triangles.push(toWorldRoofTriangle([...ring[0],top],[...ring[i],top],[...ring[i+1],top]),
    toWorldRoofTriangle([...ring[0],bottom],[...ring[i],bottom],[...ring[i+1],bottom]).reverse());
  return mesh(group,name,triangles,material);
}

export function createGarageAwarePaving(rect,z,height,material,layout){
  const group=new THREE.Group();group.name='front-paving-around-garage';
  const ring=[[rect.x,rect.y],[rect.x+rect.width,rect.y],[rect.x+rect.width,rect.y+rect.length],[rect.x,rect.y+rect.length]];
  subtractGarageOpenings(ring,garageTerrainCutouts(layout)).forEach((piece,i)=>slab(group,`front-paving-piece-${i}`,piece,z,z+height,material));
  return group;
}

function transient(color,options={}){
  const material=new THREE.MeshStandardMaterial({color,roughness:.8,side:THREE.DoubleSide,...options});
  material.userData.transient=true;return material;
}
function localBox(group,name,x,y,z,width,height,length,material){
  const m=new THREE.Mesh(new THREE.BoxGeometry(width,height,length),material);
  m.name=name;m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;group.add(m);return m;
}

/** A dimensioned concept shell, not a manufacturer CAD body. Its flat lower
 * face matches the shared conservative underside; roof/mirrors keep their
 * published envelope. Wheels use the same axle spacing and radii as the model. */
function createVehicle(vehicle,svgMode,prefix='garage-cyberster',paintColor='#a31e24'){
  const group=new THREE.Group();group.name=prefix;group.matrixAutoUpdate=false;
  const v={...CYBERSTER_AWD,...vehicle},clearance=v.clearance??.1056,r=v.rearRadius;
  const paint=new THREE.MeshPhysicalMaterial({color:paintColor,roughness:.27,metalness:.38,
    clearcoat:svgMode?0:1,clearcoatRoughness:.13,side:THREE.DoubleSide});paint.userData.transient=true;
  const dark=transient('#18201f',{roughness:.86}),
    tyre=transient('#1b1d1c',{roughness:.96}),rim=transient('#a9b3ae',{metalness:.8,roughness:.3}),
    glass=transient('#263a40',{roughness:.085,metalness:.25}),caliper=transient('#c13425'),
    light=transient('#ece8d8',{emissive:'#d9ddcc',emissiveIntensity:.12}),tailLight=transient('#bb191d',{emissive:'#9d1319',emissiveIntensity:.2});
  const tail=-v.rearOverhang,nose=v.wheelbase+v.frontOverhang,bottom=clearance-r;
  // Recess the end caps behind their exterior lenses and bumper inlays. The
  // inlays reach the published end planes without lengthening the vehicle.
  const endInset=svgMode?0:.055;
  const sections=[{u:tail+endInset,w:.72,h:.59},{u:tail+.25,w:.89,h:.75},{u:0,w:v.width/2,h:.87},
    {u:.65,w:.91,h:.82},{u:1.7,w:.88,h:.76},{u:v.wheelbase,w:v.width/2,h:svgMode?.75:.86},{u:nose-.24,w:.88,h:.57},{u:nose-endInset,w:.69,h:.40}];
  const add=(name,g,material,parent=group)=>{
    const m=new THREE.Mesh(g,material);m.name=name;m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
  };
  const tube=(name,points,material=dark,radius=.008)=>add(name,new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),false,'centripetal'),Math.max(12,points.length*4),radius,6,false),material);
  if(svgMode){
    const vertices=s=>[[-s.w,bottom,s.u],[s.w,bottom,s.u],[s.w*.96,s.h-r,s.u],[-s.w*.96,s.h-r,s.u]],triangles=[];
    for(let i=0;i<sections.length-1;i++){
      const a=vertices(sections[i]),b=vertices(sections[i+1]);
      for(let k=0;k<4;k++){const n=(k+1)%4;triangles.push([a[k],b[k],b[n]],[a[k],b[n],a[n]]);}
    }
    for(const i of [0,sections.length-1]){const a=vertices(sections[i]);triangles.push([a[0],a[1],a[2]],[a[0],a[2],a[3]]);}
    add(`${prefix}-body`,geometry(triangles),paint);
    const cabin=[[-.72,.77-r,.15],[.72,.77-r,.15],[.65,v.height-r,.49],[-.65,v.height-r,.49],
      [-.70,.77-r,1.9],[.70,.77-r,1.9],[.64,v.height-r,1.28],[-.64,v.height-r,1.28]];
    for(const [name,indices,material] of [['soft-roof',[3,2,6,7],dark],['windscreen',[7,6,5,4],glass],['rear-glass',[0,1,2,3],glass],
      ['side-window-left',[0,3,7,4],glass],['side-window-right',[1,5,6,2],glass]]){
      const [a,b,c,d]=indices.map(i=>cabin[i]);add(`${prefix}-${name}`,geometry([[a,b,c],[a,c,d]]),material);
    }
  }else{
    // Smooth, dimension-bounded original coachwork. The recessed lower side
    // rises around each physical wheel; the central underside remains flat.
    const curve=new THREE.CatmullRomCurve3(sections.map(s=>new THREE.Vector3(s.u,s.w,s.h)),false,'centripetal');
    const positions=[],indices=[],rings=112,crossSteps=18;
    for(let i=0;i<=rings;i++){
      const s=curve.getPoint(i/rings),u=s.x,w=Math.min(v.width/2,s.y),top=s.z-r;
      let lower=bottom+.055;
      for(const [axle,radius] of [[0,v.rearRadius],[v.wheelbase,v.frontRadius]]){
        const dz=u-axle,arch=radius+.035;
        if(Math.abs(dz)<arch)lower=Math.max(lower,radius-r+Math.sqrt(arch*arch-dz*dz));
      }
      lower=Math.min(lower,top-.095);
      const ring=[[-w*.70,bottom,u],[w*.70,bottom,u],[w*.86,Math.max(bottom,lower-.035),u],[w*.985,lower,u]];
      for(let j=0;j<=crossSteps;j++){
        const a=j/crossSteps*Math.PI;ring.push([w*Math.cos(a),top-.09+.09*Math.sin(a),u]);
      }
      ring.push([-w*.985,lower,u],[-w*.86,Math.max(bottom,lower-.035),u]);
      positions.push(...ring.flat());
    }
    const row=crossSteps+7;
    for(let i=0;i<rings;i++)for(let j=0;j<row;j++){
      const a=i*row+j,b=i*row+(j+1)%row,c=a+row,d=b+row;indices.push(a,b,d,a,d,c);
    }
    for(const i of [0,rings])for(let j=1;j<row-1;j++){
      const a=i*row;indices.push(...(i===0?[a,a+j+1,a+j]:[a,a+j,a+j+1]));
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();
    g.userData.detail='smooth-dimensioned-coachwork';add(`${prefix}-body`,g,paint);
    const surface=(name,n,m,point,material)=>{
      const p=[],uv=[],ix=[];
      for(let y=0;y<=m;y++)for(let x=0;x<=n;x++){p.push(...point(x/n,y/m));uv.push(x/n,y/m);}
      for(let y=0;y<m;y++)for(let x=0;x<n;x++){const a=y*(n+1)+x,b=a+n+1;ix.push(a,b,a+1,a+1,b,b+1);}
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
      geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(ix);geo.computeVertexNormals();return add(name,geo,material);
    };
    const roof=(q,t)=>[q*(.64+.015*Math.sin(Math.PI*t)),v.height-r-.034*(2*t-1)**2-.052*q*q,.43+.95*t];
    const glazing=(q,t,front)=>{
      const a=roof(q,front?1:0),b=[q*.72,(front?.76:.79)-r,front?1.94:.13];
      return a.map((value,k)=>value*(1-t)+b[k]*t+(k===2?(front?1:-1)*.026*Math.sin(Math.PI*t)*(1-q*q):0));
    };
    surface(`${prefix}-soft-roof`,20,16,(x,y)=>roof(2*x-1,y),dark);
    surface(`${prefix}-windscreen`,20,10,(x,y)=>glazing(2*x-1,y,true),glass);
    surface(`${prefix}-rear-glass`,20,8,(x,y)=>glazing(2*x-1,y,false),glass);
    for(const side of [-1,1]){
      surface(`${prefix}-side-window-${side<0?'left':'right'}`,16,6,(x,y)=>{
        const top=roof(side,x),base=[side*.72,(.79-.03*x)-r,.13+1.81*x];return base.map((v,k)=>v*(1-y)+top[k]*y);
      },glass);
      tube(`${prefix}-roof-edge-${side}`,Array.from({length:13},(_,i)=>roof(side,i/12)),dark,.010);
      for(const front of [false,true])tube(`${prefix}-${front?'front':'rear'}-pillar-${side}`,
        Array.from({length:9},(_,i)=>glazing(side,i/8,front)),paint,.018);
      tube(`${prefix}-window-sill-${side}`,[[side*.723,.79-r,.13],[side*.723,.775-r,1.035],[side*.723,.76-r,1.94]],dark,.012);
    }
    for(const t of [0,1])tube(`${prefix}-roof-header-${t}`,Array.from({length:13},(_,i)=>roof(2*i/12-1,t)),dark,.010);
    localBox(group,`${prefix}-front-intake`,0,.27-r,nose-.04,.86,.105,.08,dark);
    localBox(group,`${prefix}-rear-diffuser`,0,.25-r,tail+.04,.95,.13,.08,dark);
  }
  for(const side of [-1,1]){
    if(svgMode){
      localBox(group,`${prefix}-mirror-${side}`,side*(v.mirrorWidth/2-.055),.91-r,1.58,.11,.065,.18,paint);
      localBox(group,`${prefix}-headlamp-${side}`,side*.57,.47-r,nose-.18,.38,.035,.065,light);
      localBox(group,`${prefix}-tail-lamp-${side}`,side*.55,.56-r,tail+.035,.32,.045,.035,tailLight);
    }else{
      const mirror=add(`${prefix}-mirror-${side}`,new THREE.SphereGeometry(1,20,12),paint);
      mirror.scale.set(.055,.0325,.09);mirror.position.set(side*(v.mirrorWidth/2-.055),.91-r,1.58);
      tube(`${prefix}-mirror-stalk-${side}`,[[side*.73,.84-r,1.58],[side*.91,.88-r,1.58],[side*.99,.91-r,1.58]],dark,.012);
      const headlampHousing=add(`${prefix}-headlamp-housing-${side}`,new THREE.SphereGeometry(1,20,10),dark);
      headlampHousing.scale.set(.18,.038,.034);headlampHousing.position.set(side*.47,.335-r,nose-.044);
      const headlamp=add(`${prefix}-headlamp-${side}`,new THREE.SphereGeometry(1,20,10),light);
      headlamp.scale.set(.16,.026,.022);headlamp.position.set(side*.47,.335-r,nose-.023);
      const rearLens=[[side*.31,.51-r,tail+.018],[side*.52,.535-r,tail+.018],[side*.66,.515-r,tail+.018]];
      tube(`${prefix}-tail-lamp-housing-${side}`,rearLens.map(([x,y,z])=>[x,y,z+.019]),dark,.029);
      tube(`${prefix}-tail-lamp-${side}`,rearLens,tailLight,.017);
    }
    for(const [axle,u,radius,track,width] of [['rear',0,v.rearRadius,v.rearTrack,.275],['front',v.wheelbase,v.frontRadius,v.frontTrack,.245]]){
      const wheel=new THREE.Group();wheel.name=`${prefix}-wheel-${axle}-${side}`;
      wheel.position.set(side*track/2,radius-r,u);group.add(wheel);
      const rubber=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,width,svgMode?12:48,svgMode?1:8,!svgMode),tyre);
      if(!svgMode){
        const p=rubber.geometry.attributes.position;
        for(let i=0;i<p.count;i++){
          const shoulder=Math.max(0,(Math.abs(p.getY(i))/(width/2)-.62)/.38),scale=1-.055*shoulder*shoulder;
          p.setXYZ(i,p.getX(i)*scale,p.getY(i),p.getZ(i)*scale);
        }
        rubber.geometry.computeVertexNormals();
      }
      rubber.rotation.z=Math.PI/2;rubber.castShadow=true;rubber.receiveShadow=true;wheel.add(rubber);
      if(svgMode){
        const hub=new THREE.Mesh(new THREE.CylinderGeometry(.228,.228,width+.002,10),dark);hub.rotation.z=Math.PI/2;wheel.add(hub);
        for(let spoke=0;spoke<5;spoke++){
          const sp=new THREE.Mesh(new THREE.BoxGeometry(.018,.38,.027),rim);sp.position.x=side*(width/2+.003);sp.rotation.x=spoke*Math.PI*2/5;wheel.add(sp);
        }
      }else{
        for(const face of [-1,1]){
          const wall=add('tyre-sidewall',new THREE.RingGeometry(.232,radius*.946,48,3),tyre,wheel);
          wall.rotation.y=Math.PI/2;wall.position.x=face*width/2;
        }
        const disk=add('brake-disc',new THREE.CylinderGeometry(.192,.192,.014,40),rim,wheel);
        disk.rotation.z=Math.PI/2;disk.position.x=side*(width/2-.024);
        const lip=add('alloy-rim-lip',new THREE.TorusGeometry(.229,.012,8,48),rim,wheel);
        lip.rotation.y=Math.PI/2;lip.position.x=side*(width/2-.013);
        for(let spoke=0;spoke<10;spoke++){
          const angle=spoke*Math.PI*2/10+(spoke%2?.055:-.055),length=.177,centre=.130;
          const sp=add('alloy-spoke',new THREE.BoxGeometry(.014,length,.022),rim,wheel);
          sp.position.set(side*(width/2-.010),Math.cos(angle)*centre,Math.sin(angle)*centre);sp.rotation.x=angle;
        }
        const hub=add('alloy-centre',new THREE.CylinderGeometry(.054,.054,.020,24),rim,wheel);
        hub.rotation.z=Math.PI/2;hub.position.x=side*(width/2-.012);
        // One rim draw per wheel keeps the added spokes, lips and brake disc
        // inexpensive. The first child remains the dimensioned physical tyre.
        const positions=[],normals=[],indices=[];
        for(const part of wheel.children.filter(o=>o.material===rim)){
          part.updateMatrix();part.geometry.applyMatrix4(part.matrix);
          const g=part.geometry,offset=positions.length/3;
          positions.push(...g.attributes.position.array);normals.push(...g.attributes.normal.array);
          for(const i of g.index.array)indices.push(i+offset);
          wheel.remove(part);g.dispose();
        }
        const alloy=new THREE.BufferGeometry();alloy.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
        alloy.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));alloy.setIndex(indices);add('alloy-wheel',alloy,rim,wheel);
      }
      localBox(wheel,'brake-caliper',side*(width/2-.03),.04,.13,.025,.15,.08,caliper);
    }
  }
  localBox(group,`${prefix}-lower-sill`,0,bottom+.018,(tail+nose)/2,v.width*.92,.036,v.length-.18,dark);
  group.userData.vehicle={...v,conceptShell:true};return group;
}

export function createGarageGroup(layout,materials,{svgMode=false,groundAt=()=>layout?.streetZ??0}={}){
  const group=new THREE.Group();group.name='basement-garage';
  if(!active(layout))return {group,terrainMeshes:[],setVehiclePose(){}};
  const concrete=transient('#b6b6a9',{map:materials.stone?.map,roughness:.93}),
    paving=transient('#747c78',{map:materials.stone?.map,roughness:.94}),
    interior=transient('#777e77',{roughness:.88}),metal=materials.metal||transient('#35403c');
  const {axis,clearWidth:width,wallThickness:thickness,profile,portal}=layout;
  const station=(s,lateral,z)=>[axis.start[0]+axis.direction[0]*s+axis.normal[0]*lateral,
    axis.start[1]+axis.direction[1]*s+axis.normal[1]*lateral,z];
  const profileZ=s=>garageProfileAt(layout,s).z;
  const rampTriangles=[],leftWall=[],rightWall=[],curbTop=[];
  for(let i=0;i<profile.length-1;i++){
    const a=profile[i],b=profile[i+1];
    rampTriangles.push(...quad(station(a.s,-width/2,a.z),station(b.s,-width/2,b.z),station(b.s,width/2,b.z),station(a.s,width/2,a.z)));
    if(a.s>=axis.frontRun-EPS)continue;
    const s1=Math.min(axis.frontRun,b.s),z1=profileZ(s1);
    for(const [side,faces] of [[-1,leftWall],[1,rightWall]]){
      const li=side*width/2,lo=side*(width/2+thickness);
      const ao=station(a.s,lo,0),bo=station(s1,lo,0);
      const za=Math.max(a.z+.12,groundAt(ao[0],ao[1])+.12),zb=Math.max(z1+.12,groundAt(bo[0],bo[1])+.12);
      const ai0=station(a.s,li,a.z-.15),bi0=station(s1,li,z1-.15),ai1=station(a.s,li,za),bi1=station(s1,li,zb);
      const ao0=station(a.s,lo,a.z-.15),bo0=station(s1,lo,z1-.15),ao1=station(a.s,lo,za),bo1=station(s1,lo,zb);
      faces.push(...quad(ai0,bi0,bi1,ai1),...quad(bo0,ao0,ao1,bo1));
      curbTop.push(...quad(ai1,bi1,bo1,ao1));
      if(i===0)faces.push(...quad(ao0,ai0,ai1,ao1));
      if(s1===axis.frontRun)faces.push(...quad(bi0,bo0,bo1,bi1));
    }
  }
  const floor=mesh(group,'garage-ramp-surface',rampTriangles,paving,false);
  mesh(group,'garage-retaining-wall-left',leftWall,concrete);
  mesh(group,'garage-retaining-wall-right',rightWall,concrete);
  mesh(group,'garage-retaining-wall-caps',curbTop,concrete);
  const rearS=layout.roomRearS,inner=width/2,outer=inner+thickness;
  const roomStart=axis.frontRun;
  for(const side of [-1,1])slab(group,`garage-basement-wall-${side}`,
    [station(roomStart,side*inner,0),station(rearS,side*inner,0),station(rearS,side*outer,0),station(roomStart,side*outer,0)].map(p=>p.slice(0,2)),
    layout.floorZ-.16,portal.ceilingZ,interior);
  slab(group,'garage-basement-back-wall',[station(rearS,-outer,0),station(rearS+.18,-outer,0),station(rearS+.18,outer,0),station(rearS,outer,0)].map(p=>p.slice(0,2)),layout.floorZ-.16,portal.ceilingZ,interior);
  const flatStart=Math.min(rearS,axis.totalRun);
  const flat=slab(group,'garage-basement-parking-floor',[station(flatStart,-inner,0),station(rearS,-inner,0),station(rearS,inner,0),station(flatStart,inner,0)].map(p=>p.slice(0,2)),layout.floorZ-.16,layout.floorZ,paving);
  // A true opaque ceiling; viewing the open entrance does not rely on a black
  // facade decal or a transparent house. It follows the proposed slab underside.
  slab(group,'garage-basement-ceiling',layout.roomFootprint,portal.ceilingZ,layout.livingFloorZ,concrete);
  for(const side of [-1,1])slab(group,`garage-portal-jamb-${side}`,
    [station(roomStart-.12,side*inner,0),station(roomStart+.08,side*inner,0),station(roomStart+.08,side*outer,0),station(roomStart-.12,side*outer,0)].map(p=>p.slice(0,2)),
    portal.bottomZ-.10,portal.topZ,concrete);
  slab(group,'garage-portal-lintel',[station(roomStart-.12,-outer,0),station(roomStart+.08,-outer,0),station(roomStart+.08,outer,0),station(roomStart-.12,outer,0)].map(p=>p.slice(0,2)),portal.topZ,layout.livingFloorZ,concrete);
  // The trench drains are drawn flush with the analytic surface, never speed
  // bumps. Positions and construction are an illustrative drainage proposal.
  const drainMaterial=metal.clone();drainMaterial.userData={...drainMaterial.userData,transient:true};
  drainMaterial.polygonOffset=true;drainMaterial.polygonOffsetFactor=-2;drainMaterial.polygonOffsetUnits=-2;
  for(const [name,s] of [['entry',Math.max(.1,axis.frontRun-.25)],['lower',Math.max(.1,axis.totalRun-.20)]]){
    const a=s-.055,b=s+.055;
    mesh(group,`garage-${name}-drain`,quad(station(a,-inner,profileZ(a)),station(b,-inner,profileZ(b)),
      station(b,inner,profileZ(b)),station(a,inner,profileZ(a))),drainMaterial,false);
  }
  if(layout.parking?.spaces===2){
    const stripe=transient('#deded0',{roughness:.95});
    mesh(group,'garage-bay-divider',quad(station(flatStart+.12,-.025,layout.floorZ+.006),station(rearS-.15,-.025,layout.floorZ+.006),
      station(rearS-.15,.025,layout.floorZ+.006),station(flatStart+.12,.025,layout.floorZ+.006)),stripe,false);
  }
  const car=createVehicle(layout.vehicle,svgMode);group.add(car);
  const placeVehicle=(vehicle,pose)=>{
    if(!pose?.localToWorld){vehicle.visible=false;return;}
    vehicle.visible=true;
    const origin=new THREE.Vector3(...toWorld(...pose.localToWorld(0,0,0)));
    const v=(u,l,h)=>new THREE.Vector3(...toWorld(...pose.localToWorld(u,l,h))).sub(origin);
    vehicle.matrix.makeBasis(v(0,1,0),v(0,0,1),v(1,0,0));vehicle.matrix.setPosition(origin);vehicle.matrixWorldNeedsUpdate=true;
    vehicle.userData.minimumClearance=pose.minimumClearance;vehicle.userData.flags=pose.flags;vehicle.userData.laneOffset=pose.laneOffset;
  };
  const setVehiclePose=pose=>placeVehicle(car,pose);
  if(layout.parking?.spaces===2){
    const parked=createVehicle(layout.vehicle,svgMode,'garage-second-car','#a8b5ad');parked.userData.parked=true;group.add(parked);
    placeVehicle(parked,garageVehiclePose(layout,1,false,layout.parking.parkedLaneOffset));
  }
  group.userData.garage={enabled:true,proposed:true,portal:{...portal},floorZ:layout.floorZ,parking:{...layout.parking}};
  return {group,terrainMeshes:[floor,flat].filter(Boolean),setVehiclePose};
}
