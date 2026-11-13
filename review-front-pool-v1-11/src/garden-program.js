/** Proposed garden objects, in the mapped local metre frame. No height model. */
const rectRing=r=>[[r.x,r.y],[r.x+r.width,r.y],[r.x+r.width,r.y+r.length],[r.x,r.y+r.length],[r.x,r.y]];
const centre=r=>[r.x+r.width/2,r.y+r.length/2];
export function spaEnabled(settings={},data){
  return ['spa','spa-edge','spa-compact','spa-screened'].includes(settings.gardenProgram)&&(data.site.id||settings.siteId||'sternicza-11')==='sternicza-11';
}

export function poolBounds(settings={},data){
  const screened=settings.gardenProgram==='spa-screened';
  // The pool-end screening option reserves soil beside its far corner for the
  // forward pine. Older programmes retain their exact published pool geometry.
  const pool=spaEnabled(settings,data)?{x:['spa-edge','spa-compact','spa-screened'].includes(settings.gardenProgram)?15.7:14.7,
    y:screened?19.5:24.5,width:3.5,length:screened?7:8}:data.site.pool;
  if(!pool)return null;
  return {...pool,
    waterDepth:1.4,waterOffset:.055,coping:.28};
}

/** A full proposal is explicit; older states retain their previous geometry. */
export function gardenProgram(settings={},data){
  const active=spaEnabled(settings,data),pool=poolBounds(settings,data);
  if(!active)return {active:false,id:'classic',pool,sauna:null,firepit:null,coldPlunge:null,furniture:null};
  const screened=settings.gardenProgram==='spa-screened',compact=screened||settings.gardenProgram==='spa-compact',edge=compact||settings.gardenProgram==='spa-edge';
  // These are geometric maintenance gaps to the mapped parcel, not certified
  // planning setbacks. The rear band east of the plunge remains available for
  // screening trees; pool coping retains a narrow east-side maintenance route.
  const sauna={id:'sauna',label:'Six-person corner sauna',x:edge?1.35:3.3,y:compact?34.65:edge?32.95:30.5,width:compact?3:4.2,length:compact?2.4:4.1,
    height:compact?2.3:2.65,floorOffset:.12,chamfer:compact?.9:1.8,seats:6};
  const {x,y,width:w,length:l,chamfer:c}=sauna;
  const glassTop=compact?2.05:2.25,wallTop=compact?2.2:2.55,sideGlass=compact?.9:1.3;
  sauna.anchor=centre(sauna);
  sauna.footprint=[[x,y],[x+w-c,y],[x+w,y+c],[x+w,y+l],[x,y+l],[x,y]];
  // The front and diagonal corner face the house and the garden centre. Glass
  // is visible in the drawing but receives no opaque sightline/shade credit.
  sauna.glazing=[
    {a:[x,y],b:[x+w-c,y],bottom:.45,top:glassTop},
    {a:[x+w-c,y],b:[x+w,y+c],bottom:.12,top:glassTop},
    {a:[x+w,y+c],b:[x+w,y+c+sideGlass],bottom:.45,top:glassTop},
  ];
  sauna.walls=[
    {a:[x,y],b:[x+w-c,y],bottom:0,top:.45},
    {a:[x,y],b:[x+w-c,y],bottom:glassTop,top:wallTop},
    {a:[x+w-c,y],b:[x+w,y+c],bottom:0,top:.12},
    {a:[x+w-c,y],b:[x+w,y+c],bottom:glassTop,top:wallTop},
    {a:[x+w,y+c],b:[x+w,y+c+sideGlass],bottom:0,top:.45},
    {a:[x+w,y+c],b:[x+w,y+c+sideGlass],bottom:glassTop,top:wallTop},
    {a:[x+w,y+c+sideGlass],b:[x+w,y+l],bottom:0,top:wallTop},
    {a:[x+w,y+l],b:[x,y+l],bottom:0,top:wallTop},
    {a:[x,y+l],b:[x,y],bottom:0,top:wallTop},
  ];
  sauna.benches=compact?[{x:x+.15,y:y+.35,width:.6,length:1.3,height:.85},
    {x:x+.15,y:y+1.65,width:2.7,length:.6,height:.85}]:[{x:x+.25,y:y+1.05,width:.65,length:2.8,height:.85},
    {x:x+.9,y:y+l-.9,width:2.85,length:.65,height:.85}];
  sauna.lowerBenches=compact?[{x:x+.75,y:y+.35,width:.35,length:1.3,height:.43},
    {x:x+1.1,y:y+1.3,width:1.75,length:.35,height:.43}]:[{x:x+.9,y:y+1.05,width:.45,length:2.35,height:.43},
    {x:x+1.35,y:y+l-1.35,width:2.4,length:.45,height:.43}];
  sauna.door=compact?{a:[x+w-c+.15,y+.15],b:[x+w-c+.75,y+.75],bottom:.12,top:2.05}:
    {a:[x+w-c+.8,y+.8],b:[x+w-c+1.45,y+1.45],bottom:.12,top:2.15};
  if(compact){
    // Six separate seated places, without counting the L corner twice. This
    // is a spatial concept, not the supplier's proprietary bench construction.
    sauna.seatCentres=[[.45,.65],[.45,1.3],[.45,1.95],[1.1,1.95],[1.75,1.95],[2.4,1.95]].map(([sx,sy])=>[x+sx,y+sy]);
    sauna.capacityBasis='Six seated places; no separate changing room. 3.0 × 2.4 m supplier-size reference, custom corner glazing.';
  }
  if(edge){
    // The corner pad sits above the falling approach grade. Two diagonal
    // treads share the door alignment; their heights are derived in spaLevels.
    const q=[(sauna.door.a[0]+sauna.door.b[0])/2,(sauna.door.a[1]+sauna.door.b[1])/2],s=Math.SQRT1_2;
    const point=(along,outward)=>[q[0]+s*(along+outward),q[1]+s*(along-outward)];
    sauna.entrySteps=Array.from({length:2},(_,i)=>{
      const near=(1-i)*.3,far=(2-i)*.3;
      return {footprint:[point(-.55,far),point(.55,far),point(.55,near),point(-.55,near),point(-.55,far)]};
    });
  }
  sauna.heater=compact?{x:x+1.4,y:y+.3,width:.55,length:.55,height:.85}:{x:x+1.1,y:y+.65,width:.65,length:.65,height:.85};
  sauna.viewpoint={x:x+(compact?1.75:2.2),y:y+(compact?1.95:3.45),eyeHeight:1.6,lookAt:[10.2,24.3]};

  const firepit={id:'firepit',label:'Sunken fire lounge',x:8.4,y:26.8,width:4.4,length:4.4,
    depth:.6,floorDepth:.6,wallThickness:.18,seatHeight:.43,copingOverhang:.08};
  firepit.anchor=centre(firepit);firepit.footprint=rectRing(firepit);
  // Union envelope of the excavated room and the rendered U-shaped coping.
  // The side strips project 0.08m; the rear strip projects 0.12m.
  const fx=firepit.x,fy=firepit.y,fw=firepit.width,fl=firepit.length;
  firepit.outerBounds={x:fx-.08,y:fy-.08,width:fw+.16,length:fl+.20};
  firepit.outerFootprint=[[fx-.08,fy-.08],[fx+.12,fy-.08],[fx+.12,fy],
    [fx+fw-.12,fy],[fx+fw-.12,fy-.08],[fx+fw+.08,fy-.08],
    [fx+fw+.08,fy+fl+.12],[fx-.08,fy+fl+.12],[fx-.08,fy-.08]];
  firepit.steps=Array.from({length:4},(_,i)=>({x:firepit.x+1.6,y:firepit.y+i*.3,width:1.2,length:.3,depth:(i+1)*.15}));
  firepit.seats=[{x:firepit.x+.18,y:firepit.y+1.25,width:.67,length:2.97},
    {x:firepit.x+3.55,y:firepit.y+1.25,width:.67,length:2.97},
    {x:firepit.x+.85,y:firepit.y+3.55,width:2.7,length:.67}];
  firepit.table={x:firepit.x+1.6,y:firepit.y+2.05,width:1.2,length:.7,height:.38};
  firepit.viewpoint={x:firepit.x+2.2,y:firepit.y+3.88,eyeHeight:1.1,lookAt:[10.5,21]};

  const coldPlunge={id:'coldPlunge',label:'Cold plunge',x:edge?6.6:8.3,y:edge?35.55:33.2,width:2.2,length:1.3,
    height:.75,waterOffset:.68,waterDepth:1.1,rim:.12,pad:.18};
  coldPlunge.anchor=centre(coldPlunge);coldPlunge.footprint=rectRing(coldPlunge);
  coldPlunge.steps=edge?Array.from({length:5},(_,i)=>({x:coldPlunge.x,y:coldPlunge.y-(5-i)*.3,width:1,length:.3})):
    [{x:8.3,y:32.6,width:1,length:.3,height:.25},
      {x:8.3,y:32.9,width:1,length:.3,height:.5}];
  const furniture={loungers:[[12.3,22.7],[13.4,22.7]],
    dining:{x:3.6,y:24.4,width:3.8,length:3.4},
    path:edge?[[6.7,29.5],[6.4,31.2],[5.8,32.8]]:
      [[7.1,29.5],[8.1,31.5],[11.3,32.6],[11.5,34.3]]};
  return {active:true,id:screened?'spa-screened':compact?'spa-compact':edge?'spa-edge':'spa',pool,sauna,firepit,coldPlunge,furniture};
}
