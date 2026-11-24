import * as THREE from '../vendor/three.module.js';
import {toWorld,toWorldTriangle,toWorldRoofTriangle} from './orientation.js?v=1.31.0';
import {houseAppearanceLayout,facadePoint} from './house-appearance.js?v=1.31.0';
import {photoRoofEdgeHeight} from './house-roof.js?v=1.31.0';
import {addHouseRenovation} from './scene-house-renovation.js?v=1.31.0';
import {getDesignStyle} from './design-styles.js?v=1.31.0';
import {entranceAccessLayout} from './entrance-access.js?v=1.31.0';

const num=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
const quad=(a,b,c,d)=>[toWorldTriangle(a,b,c),toWorldTriangle(a,c,d)];
const world=p=>new THREE.Vector3(...toWorld(...p));

function geometry(triangles){
  const geometry=new THREE.BufferGeometry(),uv=[];
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(triangles.flat(2),3));
  for(const triangle of triangles){
    const [a,b,c]=triangle,normal=new THREE.Vector3().subVectors(new THREE.Vector3(...b),new THREE.Vector3(...a))
      .cross(new THREE.Vector3().subVectors(new THREE.Vector3(...c),new THREE.Vector3(...a)));
    for(const p of triangle)uv.push(Math.abs(normal.y)>Math.abs(normal.x)+Math.abs(normal.z)?p[0]/2:(Math.abs(normal.x)>Math.abs(normal.z)?p[2]/2:p[0]/2),Math.abs(normal.y)>Math.abs(normal.x)+Math.abs(normal.z)?p[2]/2:p[1]/2);
  }
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();return geometry;
}
function mesh(group,name,triangles,material,shadow=true){
  if(!triangles.length)return null;
  const object=new THREE.Mesh(geometry(triangles),material);object.name=name;
  object.castShadow=shadow;object.receiveShadow=true;group.add(object);return object;
}
function material(color,source,options={}){
  const m=new THREE.MeshStandardMaterial({color,map:source?.map||null,roughness:.86,side:THREE.DoubleSide,...options});
  m.userData.transient=true;return m;
}
function box(group,name,x,y,z,width,depth,height,mat,shadow=true){
  if(Math.min(width,depth,height)<=0)return null;
  const object=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),mat);
  object.name=name;object.position.set(...toWorld(x+width/2,y+depth/2,z+height/2));
  object.castShadow=shadow;object.receiveShadow=true;group.add(object);return object;
}
function slab(group,name,ring,bottom,top,mat,shadow=true){
  const triangles=[];
  for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length];triangles.push(...quad([...a,bottom],[...b,bottom],[...b,top],[...a,top]));
  }
  for(let i=1;i<ring.length-1;i++)triangles.push(toWorldRoofTriangle([...ring[0],top],[...ring[i],top],[...ring[i+1],top]),
    toWorldRoofTriangle([...ring[0],bottom],[...ring[i+1],bottom],[...ring[i],bottom]));
  return mesh(group,name,triangles,mat,shadow);
}
function beam(group,name,a,b,radius,mat,shadow=false){
  const start=world(a),end=world(b),direction=end.clone().sub(start),length=direction.length();
  if(length<1e-7)return;
  const object=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,length,8),mat);
  object.name=name;object.position.copy(start).add(end).multiplyScalar(.5);
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
  object.castShadow=shadow;object.receiveShadow=true;group.add(object);return object;
}
function panel(group,name,edge,lo,hi,bottom,top,offset,mat,shadow=false){
  return mesh(group,name,quad(facadePoint(edge,lo,bottom,offset),facadePoint(edge,hi,bottom,offset),
    facadePoint(edge,hi,top,offset),facadePoint(edge,lo,top,offset)),mat,shadow);
}
const inside=(x,z,aperture)=>x>aperture.lo-1e-7&&x<aperture.hi+1e-7&&z>aperture.z-1e-7&&z<aperture.z+aperture.height+1e-7;

/** Split a wall at actual apertures, including the two-car basement portal. */
function facade(group,edge,layout,palette){
  const apertures=layout.windows.filter(w=>w.edgeIndex===edge.index);
  if(layout.door.edgeIndex===edge.index)apertures.push(layout.door);
  if(layout.portal?.edgeIndex===edge.index)apertures.push(layout.portal);
  const xs=[0,edge.length,...edge.roofEdge.fractions.map(t=>t*edge.length),...apertures.flatMap(a=>[a.lo,a.hi])].filter(x=>x>=0&&x<=edge.length).sort((a,b)=>a-b);
  const edgeTop=Math.max(...edge.roofEdge.points.map(p=>p[2]));
  for(const [kind,bottom,top]of [['brick',layout.baseZ,layout.plinthTopZ],['plaster',layout.plinthTopZ,edgeTop]]){
    if(top<=bottom)continue;
    const zs=[bottom,top,...apertures.flatMap(a=>[a.z,a.z+a.height]).filter(z=>z>bottom&&z<top)].sort((a,b)=>a-b),triangles=[];
    for(let i=0;i<xs.length-1;i++)for(let j=0;j<zs.length-1;j++){
      if(xs[i+1]-xs[i]<1e-7||zs[j+1]-zs[j]<1e-7||apertures.some(a=>inside((xs[i]+xs[i+1])/2,(zs[j]+zs[j+1])/2,a)))continue;
      const h0=photoRoofEdgeHeight(edge.roofEdge,xs[i]),h1=photoRoofEdgeHeight(edge.roofEdge,xs[i+1]);
      const roofZ=x=>h0+(h1-h0)*(x-xs[i])/(xs[i+1]-xs[i]);
      const polygon=[[xs[i],zs[j]],[xs[i+1],zs[j]],[xs[i+1],zs[j+1]],[xs[i],zs[j+1]]],clipped=[];
      for(let k=0;k<polygon.length;k++){
        const a=polygon[k],b=polygon[(k+1)%polygon.length],da=roofZ(a[0])-a[1],db=roofZ(b[0])-b[1];
        if(da>=-1e-8)clipped.push(a);
        if(da*db<-1e-12){const t=da/(da-db);clipped.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
      }
      for(let k=1;k<clipped.length-1;k++)triangles.push(toWorldTriangle(facadePoint(edge,...clipped[0]),facadePoint(edge,...clipped[k]),facadePoint(edge,...clipped[k+1])));
    }
    mesh(group,`house-wall-${edge.index}-${kind}`,triangles,palette[kind]);
  }
  // Thin brick mortar courses are cut at the same apertures as the wall.
  const courses=[];
  for(let z=layout.baseZ+.085;z<layout.plinthTopZ-.03;z+=.085)for(let i=0;i<xs.length-1;i++){
    const mid=(xs[i]+xs[i+1])/2;if(xs[i+1]-xs[i]<1e-6||apertures.some(a=>inside(mid,z,a)))continue;
    courses.push(...quad(facadePoint(edge,xs[i],z,.006),facadePoint(edge,xs[i+1],z,.006),facadePoint(edge,xs[i+1],z+.007,.006),facadePoint(edge,xs[i],z+.007,.006)));
  }
  mesh(group,`house-brick-courses-${edge.index}`,courses,palette.mortar,false);
}

function window(group,edge,w,palette){
  const frame=w.kind==='hst'?palette.hstFrame:palette.frame,thickness=w.kind==='hst'?.045:.07;
  const offset=.034,z0=w.z,z1=w.z+w.height;
  panel(group,`${w.id}-glass`,edge,w.lo+thickness,w.hi-thickness,z0+thickness,z1-thickness,offset,w.kind==='hst'?palette.hstGlass:palette.glass);
  for(const [lo,hi]of [[w.lo,w.lo+thickness],[w.hi-thickness,w.hi]])panel(group,`${w.id}-jamb`,edge,lo,hi,z0,z1,.058,frame);
  for(const [bottom,top]of [[z0,z0+thickness],[z1-thickness,z1]])panel(group,`${w.id}-head-sill`,edge,w.lo,w.hi,bottom,top,.058,frame);
  for(let i=1;i<w.panes;i++){
    const x=w.lo+w.width*i/w.panes;panel(group,`${w.id}-mullion-${i}`,edge,x-thickness*.4,x+thickness*.4,z0,z1,.061,frame);
  }
  if(w.kind!=='hst'){
    // Projecting pale sill and shadowed reveal make the photographed white
    // paired frames readable without painting another opaque wall over them.
    panel(group,`${w.id}-reveal-top`,edge,w.lo-.055,w.hi+.055,z1,z1+.065,.012,palette.reveal);
    panel(group,`${w.id}-sill`,edge,w.lo-.075,w.hi+.075,z0-.05,z0+.015,.105,palette.frame);
  }
}

export function addHouseEntry(group,layout,palette,groundAt,{drawDoor=true}={}){
  const {door,front,floorZ}=layout;
  if(drawDoor){
  panel(group,'house-entrance-recess',front,door.lo-.14,door.hi+.14,floorZ-.01,floorZ+door.height+.08,-.035,palette.entrance);
  panel(group,'house-entrance-door',front,door.lo+.05,door.hi-.05,floorZ+.04,floorZ+door.height-.06,.012,palette.door);
  panel(group,'house-entrance-side-glass',front,door.hi-.29,door.hi-.1,floorZ+.25,floorZ+door.height-.16,.018,palette.glass);
  const handleA=facadePoint(front,door.hi-.37,floorZ+1,.05),handleB=facadePoint(front,door.hi-.37,floorZ+1.19,.05);
  beam(group,'house-entrance-handle',handleA,handleB,.012,palette.rail);
  }
  const access=layout.entryAccess,railHeight=.95;
  const entrance=entranceAccessLayout(layout,{groundAt}),stairs=entrance.stairs;
  group.userData.entranceAccess=entrance;
  for(const step of stairs.steps)slab(group,step.id,step.footprint,step.baseZ,step.topZ,palette.brick);
  for(const [index,edge]of stairs.railEdges.entries()){
    beam(group,`house-${stairs.type}-stair-handrail-${index}`,[...edge.a,stairs.groundZ+railHeight],[...edge.b,stairs.topZ+railHeight],.022,palette.rail);
    for(let i=0;i<=4;i++){
      const t=i/4,p=[edge.a[0]+(edge.b[0]-edge.a[0])*t,edge.a[1]+(edge.b[1]-edge.a[1])*t,stairs.groundZ+(stairs.topZ-stairs.groundZ)*t];
      beam(group,`house-${stairs.type}-stair-baluster-${index}-${i}`,p,[p[0],p[1],p[2]+railHeight],.015,palette.rail);
    }
  }
  if(access?.landing){
    const landing=access.landing,ring=landing.footprint.map(p=>p.slice(0,2)),top=num(landing.topZ,floorZ),bottom=num(landing.soffitZ,top-num(landing.thickness,.18));
    const m=slab(group,'house-entry-cantilever-landing',ring,bottom,top,palette.brick);m.userData.proposed=true;
    const y0=Math.min(...ring.map(p=>p[1]));
    // The cantilever has no posts or walls below its soffit inside the ramp.
    const frontPoints=ring.filter(p=>p[1]<y0+.08).sort((a,b)=>a[0]-b[0]);
    const a=frontPoints[0]||ring[0],b=frontPoints.at(-1)||ring[1];
    beam(group,'house-entry-landing-rail',[...a,top+railHeight],[...b,top+railHeight],.022,palette.rail);
    for(let i=0;i<=4;i++){const t=i/4,p=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];beam(group,'house-entry-landing-baluster',[...p,top],[...p,top+railHeight],.015,palette.rail);}
  }
}

export function addHouseRoof(group,layout,palette,svgMode){
  const {roof,ring,edges}=layout;
  const faces=roof.envelope.surfaceFaces;
  if(faces.length){
    const object=mesh(group,'house-measured-terracotta-roof',faces.map(face=>toWorldRoofTriangle(...face)),palette.roof);
    object.userData.source=roof.envelope.provenance.main;
    if(!svgMode&&!palette.roof.map){
      const tileJoints=[];
      // Elevation contours follow the exact shared roof slopes.
      for(const face of faces){
        const lo=Math.min(...face.map(p=>p[2])),hi=Math.max(...face.map(p=>p[2]));
        for(let z=Math.ceil(lo/.17)*.17;z<hi-.001;z+=.17){
          const ends=[];
          for(let i=0;i<3;i++){const a=face[i],b=face[(i+1)%3];if((a[2]<=z&&b[2]>z)||(b[2]<=z&&a[2]>z)){const t=(z-a[2])/(b[2]-a[2]);ends.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,z+.014]);}}
          if(ends.length===2)tileJoints.push(...ends.map(toSite=>toWorld(...toSite)));
        }
      }
      const g=new THREE.BufferGeometry().setFromPoints(tileJoints.map(p=>new THREE.Vector3(...p)));
      const m=new THREE.LineBasicMaterial({color:'#693d31',transparent:true,opacity:.32});m.userData.transient=true;
      const lines=new THREE.LineSegments(g,m);lines.name='house-roof-tile-courses';group.add(lines);
    }
  }else slab(group,'house-roof-fallback',ring,roof.eavesZ,Math.max(roof.eavesZ+.08,roof.ridgeZ),palette.roof);
  for(const edge of edges){
    for(let i=0;i<edge.roofEdge.points.length-1;i++){
      const a=facadePoint(edge,edge.roofEdge.fractions[i]*edge.length,edge.roofEdge.points[i][2]-.05,.08);
      const b=facadePoint(edge,edge.roofEdge.fractions[i+1]*edge.length,edge.roofEdge.points[i+1][2]-.05,.08);
      beam(group,`house-brown-eaves-${edge.index}-${i}`,a,b,.07,palette.fascia);
    }
    const a=facadePoint(edge,.1,layout.baseZ+.05,.11),b=facadePoint(edge,.1,photoRoofEdgeHeight(edge.roofEdge,.1)-.07,.11);
    beam(group,`house-brown-downpipe-${edge.index}`,a,b,.035,palette.fascia);
  }
  for(const chimney of roof.envelope.chimneys){
    mesh(group,`house-brick-chimney-${chimney.id}`,chimney.faces.map(face=>toWorldTriangle(...face)),palette.brick);
    slab(group,`house-chimney-cap-${chimney.id}`,chimney.footprint,chimney.topZ-.065,chimney.topZ,palette.fascia);
    const a=chimney.footprint[0],b=chimney.footprint[1],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const edge={a,b,length,direction:[(b[0]-a[0])/length,(b[1]-a[1])/length],outward:[(b[1]-a[1])/length,-(b[0]-a[0])/length]};
    for(let i=0;i<3;i++)panel(group,`house-chimney-vent-${chimney.id}-${i}`,edge,length*(i+.3)/3,length*(i+.8)/3,chimney.topZ-.23,chimney.topZ-.11,.007,palette.entrance,false);
  }
  // The photograph shows a triangular attic aperture in a side gable. Its
  // approximate detail stays below the unchanged measured roof envelope.
  if(layout.atticWindow){
    const {edgeIndex,centre,z}=layout.atticWindow,side=edges[edgeIndex];
    const frame=[facadePoint(side,centre-.42,z,.026),facadePoint(side,centre+.42,z,.026),facadePoint(side,centre,z+.78,.026)];
    mesh(group,'house-side-attic-white-frame',[toWorldTriangle(...frame)],palette.frame,false);
    const glass=[facadePoint(side,centre-.31,z+.07,.036),facadePoint(side,centre+.31,z+.07,.036),facadePoint(side,centre,z+.65,.036)];
    mesh(group,'house-side-attic-triangle',[toWorldTriangle(...glass)],palette.glass,false);
  }
}

/** House-only materials avoid recolouring the neighbours or other properties. */
export function createPhotoHouseGroup(data,settings={},options={}){
  const group=new THREE.Group();group.name='sternicza-photo-house';
  const layout=houseAppearanceLayout(data,settings,{garageLayout:options.garageLayout});
  group.userData.houseAppearance=layout;
  if(!layout.supported)return group;
  const shared=options.materials||{},palette={
    plaster:material('#eee9dc',shared.wall),brick:material('#87513d',shared.stone),mortar:material('#b79879',null,{roughness:1}),
    roof:material('#965c48',null,{roughness:.9}),fascia:material('#654331',null),frame:material('#f6f3e8',null),
    reveal:material('#d6cfbe',null),glass:material('#6d9094',null,{roughness:.22,metalness:.12}),
    hstGlass:material('#a4c8c4',null,{transparent:true,opacity:.13,depthWrite:false,roughness:.12}),
    hstFrame:material('#343d39',null),entrance:material('#463226',null),door:material('#694533',shared.wood),
    rail:material('#303834',null,{roughness:.55,metalness:.35}),floor:material('#c9c2b0',shared.stone),
    linen:material('#e8dfcd',shared.linen),timber:material('#b58a60',shared.woodLight),
  };
  const style=Object.hasOwn(options,'style')?options.style:(settings.styleHouseFinish?getDesignStyle(settings.designStyle):null);
  if(style?.renovation){
    const {houseWall,houseRoof,houseFrame}=style.palette;
    palette.plaster.color.set(houseWall);palette.roof.color.set(houseRoof);
    for(const key of ['frame','hstFrame','fascia','rail'])palette[key].color.set(houseFrame);
  }
  for(const edge of layout.edges)facade(group,edge,layout,palette);
  for(const w of layout.windows)window(group,layout.edges[w.edgeIndex],w,palette);
  const groundAt=options.groundAt||((x,y)=>options.terrainAt?options.terrainAt(x,y,data):layout.baseZ);
  addHouseEntry(group,layout,palette,groundAt);
  // A thin full living slab is compatible with the garage's own soffit below.
  slab(group,'house-living-floor-slab',layout.ring,layout.floorZ-.14,layout.floorZ,palette.floor,false);
  addHouseRoof(group,layout,palette,Boolean(options.svgMode));
  // Retain useful scale and a visible living area behind the proposed HST.
  box(group,'house-living-sofa-base',6.2,13.5,layout.floorZ,3.1,1,.4,palette.linen,false);
  box(group,'house-living-sofa-back',6.2,13.5,layout.floorZ+.4,3.1,.27,.42,palette.linen,false);
  box(group,'house-living-table',7,15,layout.floorZ,.95,.65,.32,palette.timber,false);
  addHouseRenovation(group,layout,style,{svgMode:options.svgMode});
  return group;
}
