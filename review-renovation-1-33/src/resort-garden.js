/** Movable furnishings and decorative light compositions. These are design
 * proposals, never replacements for surveyed geometry or screening volumes. */
import {canopySupportBounds} from './geometry.js?v=1.33.0';
const recipe=(terrace,garden,diningTurn,shift,hedgeCount,pendantCount,treeCount,light,plant)=>Object.freeze({
  terrace,garden,diningTurn,shift:Object.freeze(shift),hedgeCount,pendantCount,treeCount,
  light:Object.freeze(light),plant,
});
export const RESORT_GARDEN_RECIPES=Object.freeze({
  'organic-modern':recipe('conversation','offset',0,[.12,.12],7,2,2,[.65,.70,.28],'soft'),
  'hidden-bali':recipe('daybed','daybed',1,[-.10,.18],8,3,3,[.64,.68,.30],'lush'),
  'mediterranean-villa':recipe('conversation','paired',0,[-.18,.14],7,2,2,[.72,.72,.34],'herb'),
  'modern-minimal':recipe('linear','paired',1,[.14,0],5,2,2,[.58,.62,.22],'grass'),
  scandinavian:recipe('paired','offset',0,[0,-.12],6,2,2,[.70,.76,.30],'grass'),
  japandi:recipe('low-lounge','daybed',1,[.08,.22],5,2,1,[.52,.60,.22],'soft'),
  'organic-scandinavian':recipe('conversation','reader',0,[.20,.18],7,2,2,[.67,.72,.28],'soft'),
  'organic-japandi':recipe('low-lounge','offset',0,[-.12,.24],5,2,2,[.52,.58,.24],'grass'),
  'space-age':recipe('paired','reader',1,[.20,.04],6,2,2,[.62,.70,.28],'sculptural'),
  'party-club':recipe('conversation','daybed',1,[-.16,.20],9,3,3,[.76,.82,.36],'lush'),
  'baltic-dune':recipe('paired','offset',1,[.10,-.10],6,2,2,[.60,.66,.25],'grass'),
  coastal:recipe('conversation','paired',0,[-.12,.02],8,3,2,[.72,.78,.34],'herb'),
  'beach-house':recipe('daybed','reader',0,[.12,.20],6,2,2,[.59,.66,.24],'grass'),
  'gdansk-brick':recipe('linear','offset',1,[-.20,.10],8,3,2,[.70,.78,.32],'herb'),
  'danish-midcentury':recipe('conversation','reader',1,[.16,-.08],7,2,2,[.66,.74,.28],'soft'),
  'finnish-sauna':recipe('low-lounge','paired',0,[-.08,.26],5,2,2,[.50,.56,.22],'grass'),
  'riviera-deco':recipe('conversation','daybed',0,[.22,.08],8,3,2,[.73,.79,.32],'sculptural'),
  'arts-and-crafts':recipe('paired','reader',0,[-.18,-.08],7,3,2,[.68,.75,.30],'herb'),
  'palm-springs':recipe('paired','paired',1,[.18,.16],7,2,2,[.66,.76,.28],'sculptural'),
  'desert-modern':recipe('low-lounge','daybed',1,[-.14,.12],5,2,1,[.53,.60,.23],'grass'),
  'alpine-lodge':recipe('conversation','offset',0,[.06,.24],7,3,3,[.62,.68,.27],'soft'),
  'industrial-loft':recipe('linear','reader',1,[-.10,-.06],7,3,2,[.63,.73,.28],'grass'),
});
export const getResortGardenRecipe=id=>RESORT_GARDEN_RECIPES[typeof id==='string'?id:id?.designStyle]??null;

const overlaps=(a,b,gap=0)=>a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.length+gap&&a.y+a.length+gap>b.y;
const item=(id,kind,x,y,width,length,back='north')=>({id,kind,x,y,width,length,back});

/** A continuous threshold strip and a 1.2 m route to the stair centre are kept
 * empty. Furnish the larger quiet bay, reducing the composition on small decks. */
export function resortTerraceLayout(data,settings,tub,stairs){
  const r=getResortGardenRecipe(settings),t=data.site.terrace;
  if(!r)return {items:[],clearances:[],recipe:null};
  const x=t.x,y=data.site.rearMidpoint[1],width=t.width,depth=Number(settings.terraceDepth)||t.depth;
  const edge=.16,threshold=.95,routeW=1.20;
  const routeX=Math.max(tub.x1+.60,Math.min(x+width-routeW-.30,stairs.x+stairs.width/2-routeW/2));
  const route={id:'terrace-route',x:routeX,y,width:routeW,length:depth};
  const clearances=[{id:'threshold-route',x,y,width,length:threshold},route,
    {id:'spa-access',x:tub.x0-.60,y:tub.y0-.60,width:tub.width+1.20,length:tub.length+1.20}];
  for(const support of canopySupportBounds(settings,data))clearances.push({id:support.id,
    x:support.x0-.08,y:support.y0-.08,width:support.x1-support.x0+.16,length:support.y1-support.y0+.16});
  const bay={x:routeX+routeW+.12,y:y+threshold+.12,width:x+width-edge-(routeX+routeW+.12),length:depth-threshold-edge-.12};
  const items=[];
  const add=o=>{
    if(o.width<=.25||o.length<=.25)return;
    // Try modest insets around an actual support before omitting furniture.
    // These offsets are explicit geometry, shared by both plans and renderers.
    for(const [dx,dy]of [[0,0],[-.16,0],[-.32,0],[0,.16],[0,-.16],[0,.32],[0,-.32],[-.32,.16],[-.32,-.16]]){
      const p={...o,x:o.x+dx,y:o.y+dy};
      if(p.x<bay.x||p.y<bay.y||p.x+p.width>bay.x+bay.width+.00001||p.y+p.length>bay.y+bay.length+.00001)continue;
      if(!clearances.some(c=>overlaps(p,c))&&!items.some(c=>overlaps(p,c,.08))){items.push(p);return;}
    }
  };
  if(bay.width<.68||bay.length<1.35)return {items,clearances,recipe:r.terrace,bay};
  const bx=bay.x,by=bay.y,bw=bay.width,bl=bay.length;
  if(r.terrace==='daybed'&&bw>=1.60&&bl>=2.20){
    const dw=Math.min(1.66,bw-.18),dl=Math.min(2.12,bl-.12);
    add(item('terrace-daybed','daybed',bx+bw-dw,by,dw,dl));
    if(bw-dw>.52)add(item('terrace-drinks','table',bx+.04,by+.80,.40,.48));
    if(bl-dl>.60)add(item('terrace-ottoman','ottoman',bx+bw-.62,by+dl+.12,.56,.50));
  }else if(r.terrace==='paired'&&bw>=1.78&&bl>=2.06){
    const sw=Math.min(.78,(bw-.26)/2),sl=Math.min(2.00,bl-.08);
    add(item('terrace-chaise-a','lounger',bx+.02,by,sw,sl));
    add(item('terrace-chaise-b','lounger',bx+bw-sw,by,sw,sl));
    const gap=bw-2*sw-.18;
    if(gap>=.30)add(item('terrace-drinks','table',bx+sw+.10,by+sl*.43,Math.min(.42,gap),.42));
  }else if(bw>=1.65&&bl>=2.00){
    const sofaLength=Math.min(2.35,bl-.07),sofaWidth=r.terrace==='low-lounge'?.92:.86;
    add(item('terrace-sofa','sofa',bx+bw-sofaWidth,by,sofaWidth,sofaLength,'east'));
    const tw=Math.min(.62,bw-sofaWidth-.32),tl=r.terrace==='linear'?1.12:.91;
    if(tw>=.30)add(item('terrace-coffee','table',bx+.03,by+.61,tw,Math.min(tl,bl-1.0)));
    if(bl>2.52&&bw>2.04)add(item('terrace-reading-chair','chair',bx+.01,by+bl-.70,.65,.64,'south'));
  }else{
    add(item('terrace-chaise','lounger',bx+Math.max(0,bw-.78),by,Math.min(.78,bw),Math.min(2.0,bl)));
  }
  // A single planted vessel anchors the group without filling the circulation.
  const plant=item('terrace-planter','planter',bx+.02,by+.02,.44,.44);
  if(bw>2.02&&r.terrace!=='paired')add({...plant,plant:r.plant});
  return {items,clearances,recipe:r.terrace,bay};
}

/** Existing low furniture zones remain the envelope. Position changes are
 * deliberately modest around the shared pool, stairs and excavated fire room. */
export function resortGardenFurniture(base,settings,data){
  const r=getResortGardenRecipe(settings);if(!r)return base;
  const dining={...base.dining,x:base.dining.x+r.shift[0],y:base.dining.y+r.shift[1],rotation:r.diningTurn?Math.PI/2:0};
  const points=base.loungers||[],items=[];
  if(points.length){
    const minX=Math.min(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1]));
    const spanX=Math.max(...points.map(p=>p[0]))-minX,spanY=Math.max(...points.map(p=>p[1]))-minY;
    if(spanX>.85&&spanY<.65&&['daybed','reader'].includes(r.garden)){
      const w=Math.min(1.7,spanX+.70);
      items.push(item('pool-double-daybed','daybed',minX+.04,minY+.10,w,1.98));
      // Reading styles turn the end of the double daybed into a generous,
      // upright upholstered back; there is no third chair in the access route.
      if(r.garden==='reader')items[0].back='east';
    }else{
      for(const [i,[px,py]]of points.entries())items.push(item('pool-chaise-'+(i+1),'lounger',px,py+(r.garden==='offset'&&i%2?.28:0),.78,2));
    }
  }
  return {...base,dining,resort: {recipe:r.garden,items,plant:r.plant},loungers:points.map(p=>[...p])};
}

/** The entire doorway landing remains open before the two outer sitting bays.
 * A shallow or inaccessible balcony receives no implied usable furniture. */
export function resortBalconyLayout(layout,style){
  const r=getResortGardenRecipe(style?.id),b=layout?.bounds;
  if(!r||layout?.type!=='balcony'||!layout.enabled||!b||layout.accessFits===false)return [];
  const w=b.x1-b.x0,d=b.y1-b.y0;
  if(w<5.4||d<2.8)return [];
  const y=b.y0+1.40,available=d-1.95,items=[];
  if(r.terrace==='daybed'||r.terrace==='low-lounge'){
    items.push(item('balcony-daybed','daybed',b.x0+.55,y,1.55,Math.min(2.0,available)));
    items.push(item('balcony-daybed-table','table',b.x0+2.25,y+.30,.48,.50));
  }else{
    items.push(item('balcony-chair-a','chair',b.x0+.55,y,.72,.76,'west'));
    items.push(item('balcony-chair-b','chair',b.x0+2.05,y,.72,.76,'east'));
    items.push(item('balcony-coffee','table',b.x0+1.40,y+.10,.43,.46));
  }
  if(w>=8.0){
    items.push(item('balcony-reading-chaise','lounger',b.x1-1.37,y,.78,Math.min(2,available)));
    items.push(item('balcony-reading-table','table',b.x1-2.02,y+.58,.46,.46));
    items.push({...item('balcony-planter','planter',b.x1-2.06,y+.04,.43,.43),plant:r.plant});
  }
  return items;
}
