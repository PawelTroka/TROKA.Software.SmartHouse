import * as THREE from '../vendor/three.module.js';
import {toWorld} from './orientation.js?v=1.37.0';
import {facadeSolidPanels} from './renovation-architecture.js?v=1.37.0';
import {hstPanelLayout} from './hst-system.js?v=1.37.0';

/** Proposed mapped-house walls and apertures. Current uses its original path.
 * Geometry is batched across the house by finish, rather than by wall cell or
 * window bar. The renderer owns no DOM, making actual aperture rays testable.
 */
export function createRenovationFacadeGroup(layout,materials,settings={}){
  if(!layout?.architectureProposal)return null;
  const group=new THREE.Group();group.name='renovated-mapped-facades';
  const batches=new Map(),apertures=[];
  let privacyMaterial=materials.privacyGlass;
  const materialFor=role=>{
    if(role==='privacy-glass'&&!privacyMaterial){
      privacyMaterial=materials.glass.clone();privacyMaterial.color.set('#d4dedb');
      privacyMaterial.roughness=.78;privacyMaterial.metalness=0;privacyMaterial.opacity=.86;
      privacyMaterial.transparent=true;privacyMaterial.depthWrite=false;privacyMaterial.userData.transient=true;
    }
    return role==='frame'?materials.metal:role==='glass'?materials.glass:role==='privacy-glass'?privacyMaterial:materials[role];
  };
  const polygon=(edge,vertices,role,offset=0)=>{
    if(vertices.length<3)return;
    if(!batches.has(role))batches.set(role,{positions:[],uv:[],material:materialFor(role)});
    const batch=batches.get(role),flip=-edge.direction[1]*edge.outward[0]+edge.direction[0]*edge.outward[1]<0;
    const push=([x,z])=>{
      batch.positions.push(...toWorld(edge.a[0]+edge.direction[0]*x+edge.outward[0]*offset,
        edge.a[1]+edge.direction[1]*x+edge.outward[1]*offset,z));
      batch.uv.push(x*.5,z*.5);
    };
    for(let i=1;i<vertices.length-1;i++)for(const point of flip?[vertices[0],vertices[i+1],vertices[i]]:[vertices[0],vertices[i],vertices[i+1]])push(point);
  };
  const rectangle=(edge,lo,hi,bottom,top,role,offset)=>{
    if(hi-lo<=.001||top-bottom<=.001)return;
    polygon(edge,[[lo,bottom],[hi,bottom],[hi,top],[lo,top]],role,offset);
  };
  for(const edge of layout.edges){
    if(edge.length<.001)continue;
    for(const cell of facadeSolidPanels(layout,edge))polygon(edge,cell.vertices,cell.kind);
    for(const w of layout.windows.filter(w=>w.edgeIndex===edge.index)){
      const width=w.hi-w.lo;if(width<=.05||w.height<=.05)continue;
      const frame=Math.min(.12,Math.max(.022,w.frameWidth||.05),width/4,w.height/4),top=w.z+w.height;
      const panes=Math.max(1,Math.min(10,Math.round(w.panes||1))),transoms=Math.max(0,Math.min(6,Math.round(w.transoms||0)));
      const glassRole=w.glazing==='privacy'?'privacy-glass':'glass';
      const slider=w.kind==='hst'?hstPanelLayout({...w,offset:w.lo},settings):null;
      if(slider){
        for(const panel of slider.panels){
          const f=panel.frameWidth,track=.012+panel.track;
          rectangle(edge,panel.lo+f,panel.hi-f,w.z+frame,top-frame,glassRole,track);
          for(const x of [panel.lo,panel.hi-f])rectangle(edge,x,x+f,w.z+frame,top-frame,'frame',track+.014);
          for(const y of [w.z+frame,top-2*frame])rectangle(edge,panel.lo,panel.hi,y,y+frame,'frame',track+.014);
        }
      }else rectangle(edge,w.lo+frame,w.hi-frame,w.z+frame,top-frame,glassRole,.012);
      // Outer jambs use a full frame width. They meet the glass exactly; half
      // bars clipped at the edge would leave uncovered strips around the pane.
      rectangle(edge,w.lo,w.lo+frame,w.z,top,'frame',.035);
      rectangle(edge,w.hi-frame,w.hi,w.z,top,'frame',.035);
      rectangle(edge,w.lo+frame,w.hi-frame,w.z,w.z+frame,'frame',.035);
      rectangle(edge,w.lo+frame,w.hi-frame,top-frame,top,'frame',.035);
      for(let k=1;!slider&&k<panes;k++){
        const x=w.lo+width*k/panes;
        rectangle(edge,x-frame/2,x+frame/2,w.z+frame,top-frame,'frame',.035);
      }
      for(let k=1;k<=transoms;k++){
        const z=w.z+w.height*k/(transoms+1);
        rectangle(edge,w.lo+frame,w.hi-frame,z-frame*.36,z+frame*.36,'frame',.037);
      }
      apertures.push({id:w.id,edgeIndex:edge.index,lo:w.lo,hi:w.hi,bottom:w.z,top,panes,transoms,frameWidth:frame,
        glazing:w.glazing||'clear',mullions:panes-1,...(slider?{openFraction:slider.open,clearWidth:slider.clear.width,stackSide:'left'}:{})});
    }
  }
  for(const [role,{positions,uv,material}]of batches){
    if(!positions.length)continue;
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,material);mesh.name='mapped-renovation-'+role;
    mesh.userData.renovationFacadeRole=role;mesh.castShadow=!role.includes('glass');mesh.receiveShadow=true;group.add(mesh);
  }
  group.userData={architectureStyle:layout.architectureProposal.styleId,apertures,
    openingCount:apertures.length,paneCount:apertures.reduce((n,w)=>n+w.panes,0),
    mullionCount:apertures.reduce((n,w)=>n+w.mullions,0),transomCount:apertures.reduce((n,w)=>n+w.transoms,0)};
  return group;
}
