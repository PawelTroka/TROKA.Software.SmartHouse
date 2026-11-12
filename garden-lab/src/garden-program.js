/** Proposed garden objects, in the mapped local metre frame. No height model. */
const rectRing=r=>[[r.x,r.y],[r.x+r.width,r.y],[r.x+r.width,r.y+r.length],[r.x,r.y+r.length],[r.x,r.y]];
const centre=r=>[r.x+r.width/2,r.y+r.length/2];
export function spaEnabled(settings={},data){
  return settings.gardenProgram==='spa'&&(data.site.id||settings.siteId||'sternicza-11')==='sternicza-11';
}

export function poolBounds(settings={},data){
  const pool=spaEnabled(settings,data)?{x:14.7,y:24.5,width:3.5,length:8}:data.site.pool;
  if(!pool)return null;
  return {...pool,
    waterDepth:1.4,waterOffset:.055,coping:.28};
}

/** A full proposal is explicit; older states retain their previous geometry. */
export function gardenProgram(settings={},data){
  const active=spaEnabled(settings,data),pool=poolBounds(settings,data);
  if(!active)return {active:false,id:'classic',pool,sauna:null,firepit:null,coldPlunge:null,furniture:null};
  const sauna={id:'sauna',label:'Six-person corner sauna',x:3.3,y:30.5,width:4.2,length:4.1,
    height:2.65,floorOffset:.12,chamfer:1.8,seats:6};
  const {x,y,width:w,length:l,chamfer:c}=sauna;
  sauna.anchor=centre(sauna);
  sauna.footprint=[[x,y],[x+w-c,y],[x+w,y+c],[x+w,y+l],[x,y+l],[x,y]];
  // The front and diagonal corner face the house and the garden centre. Glass
  // is visible in the drawing but receives no opaque sightline/shade credit.
  sauna.glazing=[
    {a:[x,y],b:[x+w-c,y],bottom:.45,top:2.25},
    {a:[x+w-c,y],b:[x+w,y+c],bottom:.12,top:2.25},
    {a:[x+w,y+c],b:[x+w,y+c+1.3],bottom:.45,top:2.25},
  ];
  sauna.walls=[
    {a:[x,y],b:[x+w-c,y],bottom:0,top:.45},
    {a:[x,y],b:[x+w-c,y],bottom:2.25,top:2.55},
    {a:[x+w-c,y],b:[x+w,y+c],bottom:0,top:.12},
    {a:[x+w-c,y],b:[x+w,y+c],bottom:2.25,top:2.55},
    {a:[x+w,y+c],b:[x+w,y+c+1.3],bottom:0,top:.45},
    {a:[x+w,y+c],b:[x+w,y+c+1.3],bottom:2.25,top:2.55},
    {a:[x+w,y+c+1.3],b:[x+w,y+l],bottom:0,top:2.55},
    {a:[x+w,y+l],b:[x,y+l],bottom:0,top:2.55},
    {a:[x,y+l],b:[x,y],bottom:0,top:2.55},
  ];
  sauna.benches=[{x:x+.25,y:y+1.05,width:.65,length:2.8,height:.85},
    {x:x+.9,y:y+l-.9,width:2.85,length:.65,height:.85}];
  sauna.lowerBenches=[{x:x+.9,y:y+1.05,width:.45,length:2.35,height:.43},
    {x:x+1.35,y:y+l-1.35,width:2.4,length:.45,height:.43}];
  sauna.door={a:[x+w-c+.8,y+.8],b:[x+w-c+1.45,y+1.45],bottom:.12,top:2.15};
  sauna.heater={x:x+1.1,y:y+.65,width:.65,length:.65,height:.85};
  sauna.viewpoint={x:x+2.2,y:y+3.45,eyeHeight:1.6,lookAt:[10.2,24.3]};

  const firepit={id:'firepit',label:'Sunken fire lounge',x:8.4,y:26.8,width:4.4,length:4.4,
    depth:.6,floorDepth:.6,wallThickness:.18,seatHeight:.43};
  firepit.anchor=centre(firepit);firepit.footprint=rectRing(firepit);
  firepit.steps=Array.from({length:4},(_,i)=>({x:firepit.x+1.6,y:firepit.y+i*.3,width:1.2,length:.3,depth:(i+1)*.15}));
  firepit.seats=[{x:firepit.x+.18,y:firepit.y+1.25,width:.67,length:2.97},
    {x:firepit.x+3.55,y:firepit.y+1.25,width:.67,length:2.97},
    {x:firepit.x+.85,y:firepit.y+3.55,width:2.7,length:.67}];
  firepit.table={x:firepit.x+1.6,y:firepit.y+2.05,width:1.2,length:.7,height:.38};
  firepit.viewpoint={x:firepit.x+2.2,y:firepit.y+3.88,eyeHeight:1.1,lookAt:[10.5,21]};

  const coldPlunge={id:'coldPlunge',label:'Cold plunge',x:8.3,y:33.2,width:2.2,length:1.3,
    height:.75,waterOffset:.68,waterDepth:1.1,rim:.12};
  coldPlunge.anchor=centre(coldPlunge);coldPlunge.footprint=rectRing(coldPlunge);
  coldPlunge.steps=[{x:8.3,y:32.6,width:1,length:.3,height:.25},
    {x:8.3,y:32.9,width:1,length:.3,height:.5}];
  const furniture={loungers:[[12.3,22.7],[13.4,22.7]],
    dining:{x:3.6,y:24.4,width:3.8,length:3.4},
    path:[[7.1,29.5],[8.1,31.5],[11.3,32.6],[11.5,34.3]]};
  return {active:true,id:'spa',pool,sauna,firepit,coldPlunge,furniture};
}
