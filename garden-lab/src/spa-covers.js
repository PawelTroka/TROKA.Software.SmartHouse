/** Side-sliding spa decks in mapped metres. A pair of overlapping half panels
 * telescopes into one compact parking bay; the water opening is wholly clear
 * when parked. These rectangles are shared by meshes, walking and sun rays. */
const finite=(v,fallback)=>Number.isFinite(v)?v:fallback;
const clamp=v=>Math.max(0,Math.min(1,finite(v,0)));
const ring=r=>[[r.x,r.y],[r.x+r.width,r.y],[r.x+r.width,r.y+r.length],[r.x,r.y+r.length]];
const union=rects=>{
  const x=Math.min(...rects.map(r=>r.x)),y=Math.min(...rects.map(r=>r.y));
  return {x,y,width:Math.max(...rects.map(r=>r.x+r.width))-x,length:Math.max(...rects.map(r=>r.y+r.length))-y};
};

export function slidingSpaCoverLayout({id,basin,rimZ,closed=false,progress=closed?1:0}){
  if(!basin||![basin.x,basin.y,basin.width,basin.length,rimZ].every(Number.isFinite)||basin.width<=0||basin.length<=0)return null;
  const overhang=.035,overlap=.025,gap=.085,thickness=.032,stackStep=.041;
  const closedBounds={x:basin.x-overhang,y:basin.y-overhang,width:basin.width+2*overhang,length:basin.length+2*overhang};
  const half=(closedBounds.width+overlap)/2,parkX=closedBounds.x+closedBounds.width+gap;
  const panels=[0,1].map(i=>({id:`${id}-panel-${i+1}`,
    closedX:closedBounds.x+i*(half-overlap),parkedX:parkX+i*.012,
    y:closedBounds.y,width:half,length:closedBounds.length,
    baseZ:rimZ+.012+(1-i)*stackStep,topZ:rimZ+.012+(1-i)*stackStep+thickness,
  }));
  const parkedBounds=union(panels.map(p=>({...p,x:p.parkedX})));
  const sweptBounds=union([closedBounds,parkedBounds]);
  const rails=[0,1].map(i=>({id:`${id}-rail-${i+1}`,x:sweptBounds.x,y:closedBounds.y+(i?closedBounds.length+.015:-.045),
    width:sweptBounds.width,length:.03,baseZ:rimZ+.003,topZ:rimZ+.018}));
  return spaCoverAtProgress({id,closed:closed===true,basin:{...basin},rimZ,closedBounds,parkedBounds,sweptBounds,
    panelThickness:thickness,panels,rails},progress);
}

export function spaCoverAtProgress(layout,progress){
  if(!layout)return null;
  const value=clamp(progress);
  return {...layout,progress:value,panels:layout.panels.map(p=>{
    const x=p.parkedX+(p.closedX-p.parkedX)*value;
    return {...p,x,footprint:ring({...p,x})};
  })};
}

export function jacuzziCoverLayout(tub,settings={}){
  if(!tub||settings.summerPoolLayout!==true)return null;
  return slidingSpaCoverLayout({id:'jacuzzi-cover',basin:{x:tub.x0,y:tub.y0,width:tub.width,length:tub.length},
    rimZ:tub.z+.09,closed:settings.jacuzziCoverClosed===true});
}

export function coldPlungeCoverLayout(plunge,levels,settings={}){
  if(!plunge?.sunken||!levels)return null;
  return slidingSpaCoverLayout({id:'cold-plunge-cover',basin:plunge,rimZ:levels.rimZ,closed:settings.coldPlungeCoverClosed===true});
}

export function spaCoverSurfaceAt(x,y,cover){
  if(!cover)return null;
  const panels=cover.panels.filter(p=>x>=p.x&&x<=p.x+p.width&&y>=p.y&&y<=p.y+p.length);
  if(!panels.length)return null;
  const panel=panels.reduce((a,b)=>a.topZ>b.topZ?a:b);
  return {surface:cover.id,groundZ:panel.topZ,panelId:panel.id};
}
