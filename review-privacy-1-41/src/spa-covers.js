/** Concealed side-sliding spa decks in mapped metres. Two leaves telescope
 * below a continuous deck/apron into a dry side cassette. Only their exposed
 * portion inside the basin aperture is rendered or treated as walking support.
 * The final lift seats the closed leaves flush with the basin rim. */
const finite=(v,fallback)=>Number.isFinite(v)?v:fallback;
const clamp=v=>Math.max(0,Math.min(1,finite(v,0)));
const ring=r=>[[r.x,r.y],[r.x+r.width,r.y],[r.x+r.width,r.y+r.length],[r.x,r.y+r.length]];
const union=rects=>{
  const x=Math.min(...rects.map(r=>r.x)),y=Math.min(...rects.map(r=>r.y));
  return {x,y,width:Math.max(...rects.map(r=>r.x+r.width))-x,length:Math.max(...rects.map(r=>r.y+r.length))-y};
};
const intersection=(a,b)=>{
  const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y),right=Math.min(a.x+a.width,b.x+b.width),back=Math.min(a.y+a.length,b.y+b.length);
  return right-x>1e-6&&back-y>1e-6?{x,y,width:right-x,length:back-y}:null;
};

export function slidingSpaCoverLayout({id,basin,apertureBounds=basin,rimZ,surroundZ=rimZ,closed=false,progress=closed?1:0}){
  if(!basin||![basin.x,basin.y,basin.width,basin.length,rimZ].every(Number.isFinite)||basin.width<=0||basin.length<=0)return null;
  const overhang=.035,overlap=.006,gap=.085,thickness=.032,stackStep=.041;
  const closedBounds={x:basin.x-overhang,y:basin.y-overhang,width:basin.width+2*overhang,length:basin.length+2*overhang};
  const half=(closedBounds.width+overlap)/2,parkX=closedBounds.x+closedBounds.width+gap;
  const panels=[0,1].map(i=>({id:`${id}-panel-${i+1}`,
    closedX:closedBounds.x+i*(half-overlap),parkedX:parkX+i*.012,
    y:closedBounds.y,width:half,length:closedBounds.length,
    closedTopZ:rimZ+(1-i)*.001,parkedTopZ:surroundZ-.12-(1-i)*stackStep,
  }));
  const parkedBounds=union(panels.map(p=>({...p,x:p.parkedX})));
  const sweptBounds=union([closedBounds,parkedBounds]);
  const rails=[0,1].map(i=>({id:`${id}-rail-${i+1}`,x:sweptBounds.x,y:closedBounds.y+(i?closedBounds.length+.015:-.045),
    width:sweptBounds.width,length:.03,baseZ:surroundZ-.21,topZ:surroundZ-.19}));
  const pocket={...parkedBounds,baseZ:surroundZ-.26,topZ:surroundZ-.06,roofZ:surroundZ,concealed:true};
  return spaCoverAtProgress({id,closed:closed===true,basin:{...basin},apertureBounds:{...apertureBounds},rimZ,surroundZ,closedBounds,parkedBounds,sweptBounds,
    storage:'concealed-side-cassette',pocket,panelThickness:thickness,panels,rails},progress);
}

export function spaCoverAtProgress(layout,progress){
  if(!layout)return null;
  const value=clamp(progress);
  const slide=clamp(value/.84),lift=clamp((value-.84)/.16);
  return {...layout,progress:value,closed:value===1,panels:layout.panels.map(p=>{
    const x=p.parkedX+(p.closedX-p.parkedX)*slide;
    const topZ=p.parkedTopZ+(p.closedTopZ-p.parkedTopZ)*lift;
    // Below the rim, the fixed coping and terrace remain the actual surface.
    // The moving leaf can only emerge within the inner water aperture.
    const exposedBounds=intersection({...p,x},topZ<layout.rimZ-1e-6?layout.apertureBounds:layout.closedBounds);
    return {...p,x,topZ,baseZ:topZ-layout.panelThickness,exposedBounds,
      visible:Boolean(exposedBounds),footprint:exposedBounds?ring(exposedBounds):[],fullFootprint:ring({...p,x})};
  })};
}

export function jacuzziCoverLayout(tub,settings={}){
  if(!tub||settings.summerPoolLayout!==true)return null;
  return slidingSpaCoverLayout({id:'jacuzzi-cover',basin:{x:tub.x0,y:tub.y0,width:tub.width,length:tub.length},
    apertureBounds:{x:tub.waterBounds.x0,y:tub.waterBounds.y0,width:tub.waterBounds.x1-tub.waterBounds.x0,length:tub.waterBounds.y1-tub.waterBounds.y0},
    rimZ:tub.z+.09,surroundZ:tub.z,closed:settings.jacuzziCoverClosed===true});
}

export function coldPlungeCoverLayout(plunge,levels,settings={}){
  if(!plunge?.sunken||!levels)return null;
  return slidingSpaCoverLayout({id:'cold-plunge-cover',basin:plunge,apertureBounds:plunge.waterBounds||plunge,rimZ:levels.rimZ,closed:settings.coldPlungeCoverClosed===true});
}

export function spaCoverSurfaceAt(x,y,cover){
  if(!cover)return null;
  const panels=cover.panels.filter(p=>{const r=p.exposedBounds;return r&&x>=r.x&&x<=r.x+r.width&&y>=r.y&&y<=r.y+r.length;});
  if(!panels.length)return null;
  const panel=panels.reduce((a,b)=>a.topZ>b.topZ?a:b);
  return {surface:cover.id,groundZ:panel.topZ,panelId:panel.id};
}
