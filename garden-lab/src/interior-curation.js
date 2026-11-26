// Movable furniture and light positions, in the same measured local metres as
// the architectural plan. These arrangements never move walls or wet fittings.
import {MINIMAL_STYLE_DEFINITIONS} from './minimal-style-definitions.js?v=1.35.0';
const intent=(name,layout,tableWidth,tableDepth,tableX,tableZ,seatSpan,readingX,lamp)=>Object.freeze({
  name,layout,tableWidth,tableDepth,tableX,tableZ,seatSpan,readingX,lamp,
});
export const INTERIOR_COMPOSITIONS=Object.freeze({
  'organic-modern':intent('Sculpted conversation room','conversation',2.34,1.06,2.70,2.48,2.48,1.02,'stone'),
  'hidden-bali':intent('Sheltered teak salon','daybed',2.46,1.02,2.78,2.54,2.54,1.08,'woven'),
  'mediterranean-villa':intent('Villa salon and generous supper table','garden',2.52,1.10,2.72,2.53,2.56,.98,'lantern'),
  'modern-minimal':intent('Open gallery living','linear',2.58,.96,2.76,2.42,2.58,1.04,'tube'),
  scandinavian:intent('Summer-house conversation','conversation',2.26,1.00,2.68,2.57,2.40,.96,'linen'),
  japandi:intent('Facing low platforms','paired',2.16,.98,2.70,2.48,2.20,1.02,'paper'),
  'organic-scandinavian':intent('Soft curved gathering','garden',2.30,1.08,2.74,2.45,2.42,1.10,'linen'),
  'organic-japandi':intent('Asymmetric quiet salon','daybed',2.18,1.10,2.66,2.54,2.38,1.06,'paper'),
  'space-age':intent('Sculptural island seating','islands',2.12,1.18,2.72,2.51,2.18,1.00,'orb'),
  'party-club':intent('Conversation before dinner','social',2.78,1.04,2.68,2.55,2.66,1.12,'orb'),
  'baltic-dune':intent('Quiet timber-and-canvas lounge','linear',2.28,.99,2.73,2.50,2.42,1.06,'linen'),
  coastal:intent('Tailored seaside drawing room','conversation',2.48,1.04,2.70,2.60,2.54,.98,'linen'),
  'beach-house':intent('Barefoot linen lounge','daybed',2.38,1.08,2.76,2.44,2.62,1.10,'rope'),
  'gdansk-brick':intent('Warm courtyard sitting room','paired',2.44,1.02,2.67,2.56,2.30,1.00,'lantern'),
  'danish-midcentury':intent('Teak conversation salon','conversation',2.42,1.06,2.78,2.46,2.46,1.08,'saucer'),
  'finnish-sauna':intent('Resting salon beside the garden','paired',2.20,.96,2.65,2.49,2.36,1.04,'tube'),
  'riviera-deco':intent('A composed evening salon','social',2.60,1.08,2.73,2.52,2.58,1.10,'orb'),
  'arts-and-crafts':intent('Oak hearth-like gathering','garden',2.50,1.02,2.68,2.47,2.52,.96,'lantern'),
  'palm-springs':intent('Pool-facing social islands','islands',2.08,1.16,2.69,2.44,2.28,1.12,'orb'),
  'desert-modern':intent('Low mineral retreat','linear',2.32,1.10,2.78,2.57,2.50,1.08,'stone'),
  'alpine-lodge':intent('Deep timber lounge','social',2.54,1.00,2.72,2.49,2.62,.98,'lantern'),
  'industrial-loft':intent('Open workshop salon','garden',2.62,.98,2.69,2.58,2.60,1.04,'tube'),
  ...Object.fromEntries(MINIMAL_STYLE_DEFINITIONS.map(s=>[s.id,intent(...s.composition)])),
});
export const RENOVATION_ROOM_PROGRAMS=Object.freeze({
  'organic-modern':['island','floating',1.95], 'hidden-bali':['island','wall',2.0],
  'mediterranean-villa':['island','wall',1.90], 'modern-minimal':['island','floating',1.90],
  scandinavian:['island','wall',1.80], japandi:['island','wall',1.90],
  'organic-scandinavian':['island','floating',1.95], 'organic-japandi':['island','wall',2.0],
  'space-age':['island','floating',1.90], 'party-club':['island','floating',2.0],
  'baltic-dune':['island','wall',1.90], coastal:['island','wall',1.90],
  'beach-house':['island','floating',2.0], 'gdansk-brick':['island','wall',1.80],
  'danish-midcentury':['island','floating',1.90], 'finnish-sauna':['island','wall',1.80],
  'riviera-deco':['island','floating',2.0], 'arts-and-crafts':['island','wall',1.90],
  'palm-springs':['island','floating',1.90], 'desert-modern':['island','wall',2.0],
  'alpine-lodge':['island','wall',2.0], 'industrial-loft':['island','floating',1.90],
  ...Object.fromEntries(MINIMAL_STYLE_DEFINITIONS.map(s=>[s.id,s.roomProgram])),
});

const f=(id,kind,label,roomId,x,z,width,depth,extra={})=>({id,kind,label,roomId,x,z,width,depth,rotation:0,...extra});
const seat=(id,x,z,w,d,front,label='Lounge chair')=>f(id,id==='sofa'?'sofa':'armchair',label,'lounge',x,z,w,d,{front});
const rug=(id,roomId,x,z,w,d)=>f(id,'rug','Handwoven area rug',roomId,x,z,w,d,{nonBlocking:true});
const lamp=(id,roomId,x,z,kind,extra={})=>f(id,'floorLamp','Shaded reading light',roomId,x,z,.36,.36,{height:1.38,lamp:kind,...extra});

function groundFixtures(plan,c){
  const fixed=plan.fixtures.filter(item=>!['table','sofa'].includes(item.id)).map(item=>({...item}));
  // The living-edge island and perimeter kitchen are shared architectural
  // choices. A finish style never adds the former block in the working aisle.
  const living=[];
  const coffee=(x,z,w=1.12,d=.60)=>f('lounge-table','coffeeTable','Low conversation table','lounge',x,z,w,d);
  if(c.layout==='conversation'){
    living.push(seat('sofa',6.62,3.10,.94,c.seatSpan,[1,0],'Garden-view conversation sofa'),
      seat('lounge-chair-north',9.30,2.03,.84,.88,[0,1]),seat('lounge-chair-south',8.56,4.20,.84,.82,[0,-1]),coffee(8.24,3.13));
  }else if(c.layout==='paired'){
    living.push(seat('sofa',6.64,3.16,.88,c.seatSpan,[1,0],'Low conversation platform'),
      seat('facing-sofa',9.56,2.94,.88,c.seatSpan-.18,[-1,0],'Facing two-seat platform'),coffee(8.12,3.13,1.10,.72));
  }else if(c.layout==='daybed'){
    living.push(seat('sofa',6.64,3.10,1.02,c.seatSpan,[1,0],'Deep linen daybed sofa'),
      f('lounge-chaise','ottoman','Movable daybed extension','lounge',7.56,4.04,.76,.88,{height:.36}),
      seat('lounge-chair-north',9.37,2.12,.88,.92,[-1,0]),coffee(8.33,3.13,1.02,.62));
  }else if(c.layout==='linear'){
    living.push(seat('sofa',8.06,4.14,c.seatSpan,.94,[0,-1],'Low sofa opening toward the garden'),
      seat('lounge-chair-east',9.42,1.93,.82,.92,[-1,0]),coffee(8.12,2.92,1.28,.64),
      f('lounge-ottoman','ottoman','Occasional upholstered seat','lounge',6.63,2.34,.66,.70,{height:.36}));
  }else if(c.layout==='islands'){
    living.push(seat('sofa',8.10,4.12,c.seatSpan,.94,[0,-1],'Sculptural garden-facing sofa'),
      seat('lounge-chair-west',6.68,2.08,.86,.86,[1,0]),seat('lounge-chair-east',9.39,2.01,.86,.86,[-1,0]),
      coffee(8.12,2.90,1.02,.80));
  }else if(c.layout==='social'){
    living.push(seat('sofa',8.05,4.16,c.seatSpan,.96,[0,-1],'Evening salon sofa'),
      seat('lounge-chair-west',6.65,2.38,.90,1.18,[1,0]),seat('lounge-chair-east',9.44,2.26,.86,1.00,[-1,0]),
      coffee(8.13,3.05,1.16,.64));
  }else{
    living.push(seat('sofa',8.03,4.16,c.seatSpan,.94,[0,-1],'Sofa facing the terrace and garden'),
      seat('lounge-chair-west',6.64,2.15,.84,.88,[1,0]),seat('lounge-chair-east',9.42,2.32,.84,.88,[-1,0]),
      coffee(8.10,3.04,1.16,.62));
  }
  // The full-width glazing keeps a 1.0 m clear strip. The central entry route
  // is deliberately left unoccupied instead of filling it with another chair.
  const furnishings=[
    rug('lounge-rug','lounge',8.13,3.12,3.90,2.94),
    f('table','diningTable',c.tableWidth>=2.7?'Eight-seat supper table':'Six-seat dining table','dining',c.tableX,c.tableZ,c.tableWidth,c.tableDepth,{seats:c.tableWidth>=2.7?8:6}),
    ...living,
    lamp('lounge-reading-light','lounge',9.92,4.62,c.lamp),
    f('dining-plant','plant','Sculptural indoor foliage','dining',.80,1.62,.48,.48),
  ];
  return [...furnishings,...fixed];
}
function firstFixtures(plan,c){
  const items=plan.fixtures.map(item=>({...item}));
  const byId=id=>items.find(item=>item.id===id);
  // The east nightstand defines the narrow door-to-wardrobe turning route.
  // Wider beds borrow from the clear west side; their east edge and the east
  // nightstand stay fixed so the existing 0.60 m passage remains usable.
  const bed=byId('master-bed'),addedWidth=Math.max(0,c.bedWidth-bed.width),shift=-addedWidth/2;
  if(c.bedWidth>1.80){
    bed.width=c.bedWidth;bed.x+=shift;
    byId('master-nightstand-west').x-=addedWidth;
  }
  if(c.office==='floating'){
    Object.assign(byId('office-desk'),{x:6.27,z:1.97,width:1.72,depth:.74,front:[0,1],label:'Freestanding desk facing the room'});
    Object.assign(byId('office-chair'),{x:6.27,z:2.88,front:[0,-1]});
  }
  const deskShift=c.office==='floating'?0:(c.tableZ-2.5)*.5;
  byId('office-desk').z+=deskShift;byId('office-chair').z+=deskShift;
  items.unshift(rug('master-rug','master',2.18+shift,3.35,3.02,2.80));
  items.push(
    f('master-reading-chair','armchair','Quiet bedroom reading chair','master',c.readingX,1.50,.82,.86,{front:[0,1]}),
    f('master-reading-table','sideTable','Bedside reading and tea table','master',1.98,1.25,.40,.40,{height:.42}),
    lamp('master-reading-light','master',.69,.76,c.lamp),
    f('master-bedside-light','tableLamp','Soft bedside lamp','master',byId('master-nightstand-east').x,byId('master-nightstand-east').z,.25,.25,{hostId:'master-nightstand-east',baseHeight:.55,height:.40,lamp:c.lamp}),
    f('office-task-light','tableLamp','Focused desk light','office',c.office==='floating'?6.84:4.99,c.office==='floating'?1.86:1.58+deskShift,.22,.22,{hostId:'office-desk',baseHeight:.78,height:.42,lamp:c.lamp}),
  );
  return items;
}

export function curateInteriorPlan(plan,styleId='current'){
  const composition=INTERIOR_COMPOSITIONS[styleId],program=RENOVATION_ROOM_PROGRAMS[styleId];
  const c=composition?{...composition,kitchen:'island',office:program[1],bedWidth:program[2]}:null;
  if(!c||plan.layout!=='renovation'||!['ground','first'].includes(plan.floor))return plan;
  const fixtures=plan.floor==='ground'?groundFixtures(plan,c):firstFixtures(plan,c);
  const lamps=fixtures.filter(item=>['floorLamp','tableLamp'].includes(item.kind)).map(item=>({
    id:item.id,roomId:item.roomId,x:item.x,z:item.z,height:(item.baseHeight||0)+(item.height||1.38)-.12,
    intensity:item.kind==='floorLamp'?2.2:1.3,distance:item.kind==='floorLamp'?2.8:2.1,
  }));
  const dining=fixtures.find(item=>item.kind==='diningTable');
  if(dining)lamps.unshift({id:'dining-pendant',roomId:dining.roomId,x:dining.x,z:dining.z,height:2.15,intensity:3.0,distance:3.2});
  return {...plan,fixtures,interiorLights:lamps,furnishingConcept:{id:styleId,name:c.name,layout:c.layout,lamp:c.lamp,kitchen:c.kitchen,office:c.office,bedWidth:c.bedWidth,
    glazingClearance:1,description:'A composed lounge, a clear route to the garden, practical dining and a quiet bedroom reading corner.'}};
}
