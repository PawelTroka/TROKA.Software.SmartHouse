// Local architectural coordinates, metres: x increases across the drawing,
// z runs from the garden (0) to the street (9), y=0 at ground finished floor.
import {INTERIOR_CHANGES, INTERIOR_SOURCES} from './interior-sources.js?v=1.41.0';
import {GARAGE_DEFAULTS, GARAGE_FIELDS, upgradeSingleCarGarage} from './garage-options.js?v=1.41.0';
import {CYBERSTER_AWD} from './garage-vehicle.js?v=1.41.0';
import {curateInteriorPlan,INTERIOR_COMPOSITIONS} from './interior-curation.js?v=1.41.0';
import {guestAndOfficeFixtures,compactGymFixtures,LIVING_FIT_OUT_NOTES,GYM_EQUIPMENT_REFERENCES} from './living-fitouts.js?v=1.41.0';
import {applyLivingCinema} from './living-cinema.js?v=1.41.0';
import {luxuryKitchenFixtures,luxuryKitchenSummary} from './luxury-kitchen.js?v=1.41.0';
export {INTERIOR_CHANGES, INTERIOR_SOURCES};

export const INTERIOR_FLOORS = ['basement','ground','first','attic'];
export const INTERIOR_LAYOUTS = ['existing','renovation'];
export const INTERIOR_DIMENSIONS = {
  width:10.77, depth:9, bay:{x:3.61,width:3.55,depth:1.68}, terraceDepth:4, balconyDepth:4,
  // The upper sheet's 355 cm chain is outside the 24 cm masonry, with
  // 10 cm insulation separately dimensioned on each side: 307 cm clear.
  firstBay:{x:3.51,width:3.75,depth:1.68,clearWidth:3.07,clearDepth:1.68,masonryThickness:.24,externalInsulation:.10},
  slabThickness:.30, foundationElevation:-2.50, ridgeElevation:8.75, chimneyElevation:9.60,
  roof:{pitchDeg:30,ridgeAxis:'x',ridgeZ:4.5,ridgeElevation:8.75,chimneyElevation:9.60},
  levels:{basement:{elevation:-2,clearHeight:1.70},ground:{elevation:0,clearHeight:2.75},
    first:{elevation:3.05,clearHeight:2.70},attic:{elevation:5.75,clearHeight:3}},
};
const WIDTH=INTERIOR_DIMENSIONS.width, DEPTH=INTERIOR_DIMENSIONS.depth;
const rect=(l,t,r,b)=>[[l,t],[r,t],[r,b],[l,b]];
const round=n=>Math.round(n*1000)/1000;
const room=(id,label,kind,polygon,sourceId=null,sourceArea=null,finish=null)=>({
  id,label,kind,polygon,sourceId,sourceArea,finish,
  area:Math.round(Math.abs(polygon.reduce((sum,[x,z],i)=>{
    const [nextX,nextZ]=polygon[(i+1)%polygon.length];
    return sum+x*nextZ-nextX*z;
  },0))*50)/100,
});
const door=(start,width=.8,hinge='start',swing=1)=>({start,width,hinge,swing,type:'door',sill:0,height:2});
const passage=(start,width,height=2.1)=>({start,width,height,type:'passage',sill:0});
const windowAt=(start,width=1.2,sill=.8,height=1.5)=>({start,width,sill,height,type:'window'});
const balconyDoor=start=>({...door(start,1.20),height:2.25,type:'balcony-door'});
const opening=(type,start,width,height)=>({type,start,width,height,sill:0});
function wall(id,a,b,thickness,apertures=[],options={}){
  const origin=a[0]===b[0]?a[1]:a[0];
  const openings=apertures.map(({start,...geometry})=>({...geometry,offset:round(start-origin)}));
  return {id,a,b,thickness,status:'retained',exterior:false,openings,...options};
}
const h=(id,x0,x1,z,t,ops=[],opt)=>wall(id,[x0,z],[x1,z],t,ops,opt);
const v=(id,x,z0,z1,t,ops=[],opt)=>wall(id,[x,z0],[x,z1],t,ops,opt);
const exterior={exterior:true};
const added={status:'new'};
const fixture=(id,kind,label,roomId,x,z,width,depth,extra={})=>({id,kind,label,roomId,x,z,width,depth,rotation:0,...extra});
const stair=(id,label,kind,from,to,polygon,direction,steps,rise)=>({id,label,kind,from,to,polygon,direction,steps,rise});
const platform=(id,label,kind,polygon,depth)=>({id,label,kind,polygon,depth});
function flueCores(){
  return [
    {id:'west-flue',label:'Three-flue stack',polygon:rect(4.18,4.91,4.57,5.85),flues:3},
    {id:'east-flue',label:'Four-flue stack',polygon:rect(6.86,4.89,8.08,5.23),flues:4},
  ];
}
const mainOpening=(proposed=false)=>proposed?rect(5.88,6.00,7.00,8.60):rect(5.88,4.98,6.89,7.81);
const hatch=()=>rect(4.87,6.71,5.78,7.76);
const mainFlight=(proposed=false)=>stair('main-stair',proposed?'Aligned stair to first floor':'Timber stair to first floor',proposed?'flight':'winder','ground','first',proposed?rect(5.88,6.00,7,8.60):rect(5.91,6.06,7,8.62),[0,-1],17,3.05);
const foldStair=(proposed=false)=>proposed?stair('attic-stair','Compact stair through enlarged attic opening','flight','first','attic',rect(5.20,5.95,6.10,8.50),[0,-1],15,2.7):stair('attic-hatch','Folding attic stair','hatch','first','attic',hatch(),[0,-1],0,2.7);
const interiorStair=()=>stair('cellar-stair','Timber stair from cellar','flight','basement','ground',rect(5.88,6.00,7.00,8.60),[0,-1],12,2);
function exteriorStairs(){
  return [
    stair('front-stair-left','Left approach · eight risers','exterior','street','ground',rect(1.25,9,3.28,10.2),[1,0],8,1.4),
    stair('front-stair-right','Right approach · eight risers','exterior','street','ground',rect(7.49,9,9.52,10.2),[-1,0],8,1.4),
  ];
}
function sources(...ids){return INTERIOR_SOURCES.filter(s=>ids.includes(s.id)).map(s=>s.title+' · '+s.file);}
const mainSides=(t,lights)=>[
  v('left-facade',t/2,t/2,DEPTH-t/2,t,lights,exterior),
  v('right-facade',WIDTH-t/2,t/2,DEPTH-t/2,t,lights,exterior),
];
const roomLights=()=>[windowAt(2.2),windowAt(5.65)];
const rearLights=()=>[windowAt(2.96),windowAt(6.54)];

function groundPlan(proposed,fitOut={}){
  const bathroomPrivacyGlazing=proposed&&fitOut.bathroomPrivacyGlazing!==false;
  const shell=[
    ...mainSides(.35,roomLights()).map(w=>proposed&&w.id==='left-facade'?{
      ...w,openings:[w.openings[0],{...windowAt(5.79,2.30,1.04,1.46),offset:5.79-w.a[1],
        service:'kitchen-sink',roomId:'front-kitchen',outlook:'side-garden'}].map(({start,...o})=>o),
    }:w),
    h('street-facade',.175,10.595,8.825,.35,[
      ...(!proposed?[windowAt(1.86)]:[]),passage(4.59,proposed?1.38:1.20),door(5.97,.95,'start',1),...(!bathroomPrivacyGlazing?[windowAt(7.62)]:[]),
    ],exterior),
    h('street-bay-screen',3.61,7.16,10.45,.38,[windowAt(4.335,.5,1.1,1.15),windowAt(5.935,.5,1.1,1.15)],exterior),
    v('entrance-landing-divider',5.85,8.82,10.45,.12),
  ];
  const oldRear=h('garden-facade',.175,10.595,.175,.35,rearLights(),exterior);
  const old=[
    v('rear-room-divider',5.89,.175,5.04,.12),
    h('rear-west-crosswall',.175,5.89,5.04,.38,[door(3.03,.84,'end',-1),door(4.70,.87,'end',-1)]),
    h('rear-east-crosswall',5.89,10.595,5.04,.38,[door(6.03,.80,'start',-1)]),
    v('kitchen-hall',4.53,5.04,8.825,.12,[door(6.99,.88,'end',1)]),
    v('wet-room-divider',8.98,5.23,8.825,.10,[door(5.25,.85,'start',-1)]),
  ];
  const stairWest=v('stair-west',5.85,proposed?6.00:6.08,8.825,proposed?.07:.12,
    proposed?[passage(7.60,1.13,1.10)]:[],proposed?{...added,form:'timber-screen',height:1.10,
      label:'Open timber stair guard',slatWidth:.035,slatPitch:.12}:undefined);
  const stairEast=v('stair-and-bath-access',7.04,5.23,8.825,.12,[door(5.25,.82,'start',-1)]);
  const originalRooms=[
    room('rear-left','Garden room I','living',rect(.35,.35,5.83,4.85),'1/1',24.57,'Boards'),
    room('rear-right','Garden room II','living',rect(5.95,.35,10.42,4.85),'2/1',19.80,'Boards'),
    room('front-kitchen','Kitchen I','kitchen',rect(.35,5.23,4.47,8.65),'3/1',14.10,'PVC'),
    room('hall','Hall','hall',[[4.59,5.23],[6.80,5.23],[6.80,6.02],[5.79,6.02],[5.79,8.65],[4.59,8.65]],'4/1',7.60,'PVC'),
    room('east-kitchen','Kitchen II','kitchen',rect(7.10,5.27,8.93,8.65),'5/1',6.0,'PVC'),
    room('bathroom','Bathroom','bathroom',rect(9.03,5.27,10.42,8.65),'6/1',4.50,'PVC'),
  ];
  const newRooms=[
    room('dining','Dining','dining',rect(.35,.35,5.89,4.85)),
    room('lounge','Living room','living',rect(5.89,.35,10.42,4.85)),
    room('front-kitchen','Open kitchen · connected peninsula and side-garden sink','kitchen',rect(.35,4.85,4.47,8.65)),
    room('hall','Entry and circulation','hall',[[4.47,4.85],[6.86,4.85],[6.86,6.02],[5.79,6.02],[5.79,8.65],[4.47,8.65]]),
    room('bathroom','Combined bathroom','bathroom',rect(7.10,5.27,10.42,8.65)),
  ];
  const modifiedRear=h('garden-hst',.175,10.595,.175,.35,[opening('hst',.40,9.97,2.35)],{...exterior,...added});
  const fitted=[
    fixture('table','diningTable','Large dining table','dining',3.02,2.75,3.18,1.04,{seats:8}),
    fixture('sofa','sofa','U-shaped sectional facing the TV','lounge',8.13,3.30,2.60,2.70,{shape:'U',openTo:'right',front:[1,0]}),
    fixture('tv','tv','TV on solid right-wall bay','lounge',10.34,4.14,.11,1.34),
    ...luxuryKitchenFixtures(fitOut),
    fixture('ground-tub','tub','Deep freestanding soaking tub','bathroom',9.91,7.66,.88,1.78,{variant:'soaking',height:.68,front:[-1,0],approach:[9.12,7.13]}),
    fixture('ground-shower','shower','Walk-in shower with north-wall fittings','bathroom',9.71,6.02,1.30,1.36,{front:[-1,0],headWall:[0,-1],approach:[8.73,6.02]}),
    fixture('ground-basin','basin','Dual vanity on the solid stair wall','bathroom',7.42,7.00,.56,1.50,{front:[1,0],basins:2,approaches:[[8.02,6.625],[8.02,7.375]]}),
    fixture('ground-wc','toilet','WC','bathroom',9.06,8.27,.46,.68,{front:[0,-1],approach:[9.06,7.60]}),
    fixture('ground-bidet','bidet',bathroomPrivacyGlazing?'Bidet beside the solid street wall':'Bidet below the street window','bathroom',8.36,8.28,.42,.66,{front:[0,-1],height:.44,approach:[8.36,7.60]}),
    fixture('ground-mirror','mirror','Dual vanity mirror','bathroom',7.125,7.00,.04,1.40,{front:[1,0],wallMounted:true,mountHeight:1.56}),
    fixture('ground-towels','towelRail','Heated towel rail','bathroom',7.36,8.62,.40,.04,{front:[0,-1],wallMounted:true,mountHeight:1.18}),
  ];
  const landing=platform('entry-landing','Twin entry landings','landing',rect(3.28,9,7.49,10.40),1.4);
  return {
    bathroomPrivacyGlazing,
    rooms:proposed?newRooms:originalRooms,
    walls:[...shell,stairWest,stairEast,...(proposed?[modifiedRear,h('right-wet-crosswall',6.86,10.595,5.04,.38),
      v('kitchen-hall-enclosure',4.53,5.04,8.825,.12,[],added),
      h('kitchen-living-opening',.175,4.53,5.04,.12,[passage(.35,3.65,2.60)],added)]:[oldRear,...old])],
    removedWalls:proposed?[oldRear,old[0],old[1],old[3],old[4]]:[],
    outdoor:proposed?[landing,platform('terrace','Garden terrace · 4 m','terrace',rect(0,-4,WIDTH,0),4)]:[landing],
    fixtures:proposed?fitted:[],...(proposed?{kitchenFitOut:luxuryKitchenSummary(fitOut)}:{}),cores:flueCores().map(c=>proposed&&c.id==='west-flue'?{...c,
      enclosure:{kind:'cabinet-panels',label:'Retained flue behind matching removable cabinet panels',
        polygon:rect(3.73,4.83,4.67,5.93),front:[-1,0],panels:[
          {id:'flue-kitchen-face',x:3.795,z:5.39,width:.035,depth:1.04,front:[-1,0]},
          {id:'flue-living-return',x:4.18,z:4.90,width:.82,depth:.035,front:[0,-1]},
          {id:'flue-hall-return',x:4.60,z:5.39,width:.035,depth:1.04,front:[1,0],plainPanel:true},
          {id:'flue-appliance-return',x:4.18,z:5.875,width:.82,depth:.035,front:[0,1],plainPanel:true},
        ]}}:c),
    stairs:[mainFlight(proposed),interiorStair(),...exteriorStairs()],voids:[mainOpening(true)],
    sources:sources('ground','front','side','structure','section',...(proposed?['ground-markup']:[])),
    issues:proposed?[
      'Opening the transverse wall below existing timber floors and making a 9.97 m glazing aperture need a load-path design, verified supports and flue survey.',
      'The right-wall TV is on the short solid panel in front of the side window. The 4 m terrace crosses the rear cellar areaway; provide retained access and drainage.',
      'The kitchen opens through a 3.65 m span to living/dining. A 2.20 × 0.85 m peninsula joins the side-garden sink run, with its free end pulled back 0.55 m to give about 1.18 m beside the concealed chimney and refrigerator. The chimney remains intact behind matching removable cabinet panels; flue clearances, ventilation and inspection access need a coordinated detail.',
      'The hall-side stair partition becomes a 1.10 m timber slat guard. Additional guards close the exposed slab edges and the space below the rising flight, while both flight sides have handrails and the actual stair entry and arrival ends stay open. The bathroom-side privacy wall remains solid. Guard fixings and the stair edge need a measured construction detail.',
      'One 2.30 × 1.46 m picture window is centered over the sink and looks into the side garden. Both former window-side upper cabinets are removed, leaving a clean reveal and a clear wall above. The kitchen street window stays closed for cabinetry. The kitchen does not touch the rear façade; its open connection to living/dining retains the rear-garden outlook.',
      'Fitted kitchen storage follows a 2.70 m cabinet line with a 50 mm ceiling scribe. The 2.25 m wet run includes two clear 600 mm dishwasher niches, a 1010 mm sink cabinet and two 20 mm end panels. A 600 mm stacked oven tower, 550 mm hidden nutrition pantry and filled tall corner use the opposite wall. The four-door refrigerator has a wider bay, rear allowance and 100 mm top reveal; final product drawings govern hinge, ventilation and service clearances.',
      'A continuous 2.55 × 2.34 m mirror fills the hall-facing kitchen wall beyond the concealed chimney. The workstation sink, waste pull-out, wine-cooler ventilation, drawer assignments and corner access are included in the fitted-kitchen schedule.',
      'The ground bathroom has one 1.78 × 0.88 m deep soaking tub, a 1.30 × 1.36 m shower, a 1.50 m dual vanity, WC and bidet. The vanity and mirror use the solid stair wall; '+(bathroomPrivacyGlazing?'the street-facing window is closed with a continuous finished wall beside the bidet.':'the low bidet stays below the street-window sill.'),
      bathroomPrivacyGlazing?'The remaining side-garden bathroom window uses Venetian / reflective privacy glass with a 0.98 m sill and 1.44 m height. It has a tinted view out and a reflective exterior when outside is brighter. A lit bathroom still needs a blind for night-time privacy; the final exterior glazing assembly needs a supplier specification.':'Both bathroom windows use clear picture glass with a 0.98 m sill and 1.44 m height. Their wider openings remain within the retained room boundaries and keep the vanity, mirror and towel-rail mounting bays solid.',
      'The shower opens toward the central aisle and its fittings use the solid north wall. Wet-area glazing, ventilation, waterproofing, tub support and exact plumbing need a coordinated design.',
    ]:['The historical twin approach differs from the photo-informed present-day exterior. Door leaves, front screen details and the exact stair turn need a measured survey.'],
  };
}

function firstPlan(proposed,fitOut={}){
  const t=.34, shell=[
    ...mainSides(t,roomLights()).map(w=>proposed&&w.id==='right-facade'?{
      ...w,openings:[w.openings[0],{...windowAt(4.13,.96,1.05,1.30),offset:4.13-w.a[1],
        service:'indoor-sauna',roomId:'sauna',outlook:'side-garden'},w.openings[1]].map(({start,...o})=>o),
    }:w),
    h('street-left',.17,3.68,8.83,t,[windowAt(1.84)],exterior),
    h('street-right',7.09,10.60,8.83,t,[windowAt(7.68)],exterior),
    v('bay-left',3.68,8.83,10.51,t,[windowAt(9.39,.60)],exterior),
    v('bay-right',7.09,8.83,10.51,t,[windowAt(9.39,.60)],exterior),
    h('bay-front',3.68,7.09,10.51,t,[windowAt(4.485,1.80)],exterior),
  ];
  const oldRear=h('garden-facade',.17,10.60,.17,t,rearLights(),exterior);
  const newRear=h('balcony-facade',.17,10.60,.17,t,[2.96,6.54,8.68].map(balconyDoor),{...exterior,...added});
  const oldStairWall=v('kitchen-stair',6.95,4.925,8.83,.12,[windowAt(5.68,1.57,.88,1.15),door(7.80,.80,'start',-1)]);
  const fixed=[
    v('master-office',4.575,.17,3.895,.075),
    v('office-guest',8.07,.17,3.895,.075),
    h('office-hall',4.575,8.07,3.895,.075,[door(5.17,.80,'start',-1)]),
    v('master-door',4.575,3.895,4.925,.075,[door(3.995,.80,'end',1)]),
    proposed?v('spa-stair-privacy',6.95,4.925,8.83,.12,[door(5.25,.75,'start',-1)],added):oldStairWall,
    h('east-flue-wall',6.86,proposed?9.10:8.96,4.925,.12),
  ];
  const guestWall=h('guest-hall',8.07,10.60,3.895,.075,[door(8.68,.80,'start',-1)]);
  const steps=[
    h('master-step-rear',.17,2.985,3.915,.075),
    v('master-step-return',2.985,3.915,4.925,.075),
    h('master-step-front',2.985,4.575,4.925,.075),
  ];
  const wet=[
    v('kitchen-bath',8.96,4.925,8.83,.10),
    h('bath-hall',8.96,10.60,4.925,.10,[door(9.25,.8,'end',1)]),
  ];
  const spaWalls=[
    h('master-straight',.17,2.985,4.925,.075,[],added),steps[2],
    h('guest-divider',.17,4.22,6.94,.10,[],added),
    v('guest-corridor',4.22,5.84,8.70,.10,[door(5.92,.8,'start',1),door(7.53,.80,'start',1)],added),
    h('wardrobe-front',3.68,6.95,8.70,.10,[door(4.80,.80,'start',1)],added),
    h('guest-door-shift',8.07,10.60,3.895,.075,[door(8.18,.80,'start',-1)],added),
    v('sauna-side',9.10,3.895,5.28,.10,[door(4.05,.68,'end',1)],added),
    h('sauna-bath',9.10,10.60,5.28,.10,[],added),
  ];
  const rearRooms=[
    room('master',proposed?'Master bedroom':'Garden room I','bedroom',
      proposed?rect(.34,.34,4.5375,4.8875):[[.34,.34],[4.5375,.34],[4.5375,4.8875],[3.0225,4.8875],[3.0225,3.8775],[.34,3.8775]],
      '1/2',proposed?null:16.18,'Floor panels'),
    room('office',proposed?'Main office':'Garden room II',proposed?'office':'bedroom',rect(4.6125,.34,8.0325,3.8575),'2/2',12.0,'Floor panels'),
    room('guest-1',proposed?'Guest bedroom I':'Garden room III',proposed?'guest':'bedroom',rect(8.1075,.34,10.43,3.8575),'3/2',8.42,'Floor panels'),
  ];
  const hallOutline=[[4.6125,3.9325],[9.05,3.9325],[9.05,4.865],[6.86,4.865],[6.86,4.98],[5.88,4.98],[5.88,7.81],[6.89,7.81],[6.89,8.65],[4.27,8.65],[4.27,5.85],[4.57,5.85],[4.57,4.96],[4.6125,4.96]];
  const originalFront=[[.34,3.9525],[2.9475,3.9525],[2.9475,4.9625],[4.18,4.9625],[4.18,5.85],[4.57,5.85],[4.57,4.98],[5.88,4.98],[5.88,7.81],[6.89,7.81],[6.89,8.66],[6.92,8.66],[6.92,10.34],[3.85,10.34],[3.85,8.66],[.34,8.66]];
  const original=[
    room('hall','Hall','hall',rect(4.6125,3.9325,10.43,4.865),'4/2',5.60,'Floor panels'),
    room('front-room','Front room and bay','living',originalFront,'5/2',28.08,'Floor panels'),
    room('east-kitchen','Kitchen','kitchen',rect(7.01,4.985,8.91,8.66),'6/2',7.18,'Porcelain tile'),
    room('bathroom','Bathroom','bathroom',rect(9.01,4.985,10.43,8.66),'7/2',5.36,'Porcelain tile'),
  ];
  const renovated=[
    room('hall','Hall and landing','hall',hallOutline),
    room('guest-2','Guest bedroom II','guest',[[.34,4.9625],[4.18,4.9625],[4.18,5.85],[4.17,5.85],[4.17,6.89],[.34,6.89]]),
    room('guest-3','Guest bedroom III','guest',rect(.34,6.99,4.17,8.65)),
    room('wardrobe','Front-bay wardrobe','wardrobe',rect(3.85,8.75,6.92,10.34)),
    room('spa-bath','Spa bathroom','bathroom',[[7.01,5.23],[8.08,5.23],[8.08,4.985],[9.05,4.985],[9.05,5.33],[10.43,5.33],[10.43,8.66],[7.01,8.66]]),
    room('sauna','Two-person sauna allowance','sauna',rect(9.15,3.9325,10.43,5.23)),
  ];
  const originalFittings=[
    fixture('kitchen-hob','hob','Four-ring hob','east-kitchen',7.46,5.57,.57,.54),
    fixture('kitchen-bowl','sink','Double sink','east-kitchen',8.72,6.75,.52,1.08,{basins:2,front:[-1,0]}),
    fixture('historic-tub','tub','Bath','bathroom',9.48,7.71,.69,1.55),
    fixture('historic-wc','toilet','WC','bathroom',10.12,8.19,.48,.66,{front:[0,-1]}),
    fixture('historic-basin','basin','Washbasin','bathroom',9.46,6.68,.51,.62,{front:[1,0]}),
  ];
  const furnished=[
    fixture('master-bed','bed','King bed facing the balcony','master',2.10,3.76,1.80,2.10,{headboard:[0,1]}),
    fixture('master-nightstand-west','nightstand','Bedside cabinet','master',.94,4.43,.40,.40,{front:[0,-1],height:.52}),
    fixture('master-nightstand-east','nightstand','Bedside cabinet','master',3.26,4.43,.40,.40,{front:[0,-1],height:.52}),
    fixture('master-storage','wardrobe','East-wall fitted wardrobe','master',4.20,2.67,.55,2.20,{front:[-1,0]}),
    ...guestAndOfficeFixtures(fitOut),
    fixture('bay-storage','wardrobe','Hanging storage beside the door','wardrobe',4.30,9.07,.82,.60,{front:[0,1]}),
    fixture('bay-storage-east','wardrobe','Wide hanging storage beside the door','wardrobe',6.29,9.07,1.18,.60,{front:[0,1]}),
    fixture('spa-jets','tub','Compact hydromassage bath','spa-bath',7.70,7.40,.90,1.80,{front:[1,0],variant:'whirlpool',height:.62,occupants:1,jets:true,lights:false,hydromassage:true,serviceSide:'front',serviceClearance:.60,approach:[8.55,7.40]}),
    fixture('spa-shower','shower','Two-person shower','spa-bath',9.79,6.17,1.20,1.62,{heads:2,front:[0,1],approach:[9.49,7.28]}),
    fixture('spa-vanity','basin','Single vanity on the solid side wall','spa-bath',10.10,7.63,.56,1.10,{front:[-1,0],basins:1,approach:[9.49,7.63]}),
    fixture('spa-wc','toilet','WC','spa-bath',9.47,8.29,.46,.64,{front:[0,-1],approach:[9.47,7.64]}),
    fixture('spa-mirror','mirror','Vanity mirror','spa-bath',10.405,7.63,.04,1.00,{front:[-1,0],wallMounted:true,mountHeight:1.54}),
    fixture('spa-towels','towelRail','Heated towel rail','spa-bath',7.36,8.63,.50,.04,{front:[0,-1],wallMounted:true,mountHeight:1.18}),
    fixture('sauna-bench','bench','Two-person sauna bench allowance','sauna',9.79,4.985,1.08,.45),
    fixture('sauna-heater','sauna','Heater allowance','sauna',10.16,4.14,.30,.32,{variant:'heater'}),
  ];
  return {
    rooms:[...rearRooms,...(proposed?renovated:original)].map(r=>proposed&&LIVING_FIT_OUT_NOTES[r.id]?{...r,fitOutNote:LIVING_FIT_OUT_NOTES[r.id]}:r),
    walls:[...shell,...fixed,...(proposed?[newRear,...spaWalls]:[oldRear,guestWall,...steps,...wet])],
    removedWalls:proposed?[oldRear,guestWall,oldStairWall,...steps.slice(0,2),...wet]:[],
    outdoor:proposed?[platform('balcony','Shared garden balcony · 4 m','balcony',rect(0,-4,WIDTH,0),4)]:[],
    fixtures:proposed?furnished:originalFittings,cores:flueCores(),
    stairs:[{...mainFlight(proposed),polygon:mainOpening(proposed)},foldStair(proposed)],voids:[mainOpening(proposed)],
    sources:sources('first','front','side','section','structure',...(proposed?['first-markup']:[])),
    issues:proposed?[
      'Each guest room has a real 1.40 × 2.00 m double mattress, a compact laptop desk and an articulated wall TV facing the pillows. The two shallow front rooms are occasional couple rooms with foot access only; their 1.93 / 1.66 m depths do not provide side aisles. Lift-up under-bed storage replaces floor-standing wardrobes without a drawer opening into the desk, and guest III’s door hinge keeps the foot approach clear.',
      'The office keeps a 2.60 × 0.70 m desk with one or two complete computer stations. Its daybed converts to a 0.90 × 2.00 m emergency single while retaining the central route to the balcony. Desk, chairs and sleeper positions are fixed across finishes so the selected configuration stays usable.',
      'A compact stair replaces the folding attic ladder in the renovation, with an enlarged opening beside the main stair. Its top reaches the central roof zone; structure, headroom and stair pitch require a measured design.',
      'The bay is printed 3.07 × 1.68 m inside. The proposed 10 cm wardrobe partition leaves about 3.07 × 1.59 m clear; retaining the full depth would move it about 9 cm toward the hall and require the adjoining door routes to be checked.',
      'Moving the new sauna partition 0.36 m into the bath gives approximately 1.28 × 1.30 m clear. A 1.20 × 1.24 m cabin footprint fits that allowance, but lining, heater separation, ventilation, service access and the selected product still need checking.',
      'A 0.96 × 1.30 m clear picture window opens the indoor sauna to the side-garden view. Its 1.05 m sill stays above the bench and heater envelope; the final sauna glazing, edge detail and heater separation follow the selected cabin system.',
      'The bathroom has a 1.80 × 0.90 m hydromassage bath, 0.62 m high, with discreet jets instead of an outdoor-spa shell. The 1.20 × 1.62 m two-person shower, vanity and WC remain; the smaller bath opens a wider central route and needs no entry step.',
      'The upper bathroom has larger clear picture windows with a 0.98 m sill and 1.44 m height. The side window stays beside the vanity mirror, and the new sauna window occupies its own separate wall bay.',
      'The old glazed kitchen/stair partition is closed for bathroom privacy. Verify filled spa loads on the historic timber floor, delivery access, equipment maintenance, waterproofing, humidity control and the exact product before installation.',
      'Tall bay wardrobes flank the new door instead of covering the side windows. The main bed faces the balcony, and guest room II keeps a low headboard below the side-window sill.',
      'The third rear door is new. Verify structure, independent support, waterproofing, guards and thresholds for the 4 m balcony.',
    ]:['The front room extends around the stair opening into the bay. The bay is printed 3.07 × 1.68 m inside, with 24 cm masonry and 10 cm external insulation. The drawing shows a folding attic stair separately from the main timber stair. Furniture outside the printed wet-room fittings is undocumented.'],
  };
}

function cellarPlan(){
  const rearAccess=stair('garden-cellar-steps','Rear areaway · three steps','exterior','basement','areaway',rect(4.10,-1.1,5.06,0),[1,0],3,.45);
  const rightCell=rect(5.95,.4,10.37,4.8);
  return {
    rooms:[
      room('cellar-hall','Cellar corridor','hall',[[2.80,.4],[5.83,.4],[5.83,4.8],[6.86,4.8],[6.86,6],[5.88,6],[5.88,8.6],[4.61,8.6],[4.61,4.80],[3.91,4.80],[3.91,3.25],[2.8,3.25]],'1/0',19.3,'Brick'),
      room('cellar-west','Rear-left cellar','cellar',[[.4,.4],[2.68,.4],[2.68,3.37],[3.79,3.37],[3.79,4.8],[.4,4.8]],'2/0',11.2,'Earth'),
      room('cellar-front-west','Front-left cellar','cellar',[[.40,5.20],[4.18,5.20],[4.18,5.85],[4.49,5.85],[4.49,8.6],[.40,8.6]],'3/0',13.5,'Earth'),
      room('cellar-east','Rear-right cellar','cellar',rightCell,'4/0',19.3,'Earth'),
      room('cellar-front-east','Front-right cellar','cellar',rect(7.08,5.20,10.37,8.60),'5/0',10.8,'Earth'),
    ],
    walls:[
      ...mainSides(.40,[windowAt(2.38,.92,.91,.51),windowAt(5.87,.92,.91,.51)]),
      h('garden-facade',.2,10.57,.2,.4,[{...door(3.04,1.0,'start',1),height:1.65}],exterior),
      h('street-facade',.2,10.57,8.8,.4,[],exterior),
      v('west-cellar-corridor',2.74,.20,3.31,.12,[passage(2.29,.90,1.65)]),
      h('west-cellar-step',2.74,3.85,3.31,.12),
      v('west-cellar-step-return',3.85,3.31,5,.12),
      v('east-cellar-corridor',5.89,.2,5,.12,[passage(2.28,.91,1.65)]),
      h('west-cellar-crosswall',.2,4.55,5,.4,[passage(2.85,.89,1.65)]),
      h('east-cellar-crosswall',5.89,10.57,5,.40,[passage(5.99,.87,1.65)]),
      v('west-front-cellar',4.55,5,8.8,.12,[passage(6.15,.91,1.65)]),
      v('stair-east',7.02,6.0,8.8,.12),
    ],
    removedWalls:[],fixtures:[],cores:flueCores(),stairs:[interiorStair(),rearAccess],voids:[],
    outdoor:[platform('rear-areaway','Rear cellar areaway','landing',rect(2.64,-1.35,5.25,0),1.35)],
    issues:['The section gives 1.70 m clear height at −2.00 m. The −2.50 m line is a foundation reference. Door and window heights in this reconstruction are fitting allowances.',
      'The detached two-portal outbuilding is documented on a separate sheet; the drawn house cellar has four stores and a corridor.'],
    sources:sources('cellar','section','side','detached'),
  };
}

const settingsNumber=(settings,key)=>{
  const field=GARAGE_FIELDS[key];
  return Number.isFinite(settings[key])?Math.min(field.max,Math.max(field.min,settings[key])):GARAGE_DEFAULTS[key];
};
// Project the existing ramp's clamped portal centre from its mapped street
// edge onto the centred paper plan. Paper right points to decreasing site x.
// Preserve metres along the facade; the measured paper width and mapped width differ.
function garageFrame(settings){
  const width=settingsNumber(upgradeSingleCarGarage(settings),'garageRampWidth');
  const bounds=settings.architecturalGarageBounds;
  if(bounds){
    const {x0,x1}=bounds;
    if(!Number.isFinite(x0)||!Number.isFinite(x1)||x0<0||x1>WIDTH||x1<=x0||Math.abs(x1-x0-width)>1e-5)
      throw new RangeError('Architectural garage bounds must preserve the selected portal width inside the house');
    return {x0,x1,width:x1-x0};
  }
  const a=[4.13622220,9.09588503], b=[15.15178498,9.13920459];
  const centreX=Math.min(b[0]-.50-width/2,Math.max(a[0]+.50+width/2,12));
  const alongX=(centreX-(a[0]+b[0])/2)*Math.hypot(b[0]-a[0],b[1]-a[1])/(b[0]-a[0]);
  const centre=WIDTH/2-alongX;
  return {x0:centre-width/2,x1:centre+width/2,width};
}
function intersectionWithLane(polygon,frame){
  const left=Math.max(frame.x0,Math.min(...polygon.map(p=>p[0])));
  const right=Math.min(frame.x1,Math.max(...polygon.map(p=>p[0])));
  if(right<=left)return null;
  return rect(left,polygon[0][1],right,polygon[2][1]);
}
export function getInteriorGarageConflicts(settings={}){
  const frame=garageFrame(settings);
  const obstacles=[{...interiorStair(),kind:'stair'},...flueCores().map(core=>({...core,kind:'flue'}))];
  return obstacles.flatMap(({id,kind,label,polygon})=>{
    const overlap=intersectionWithLane(polygon,frame);
    return overlap?[{id,kind,label,polygon:overlap,severity:'blocked'}]:[];
  });
}
// Preserve original pieces outside the proposed lane. Clip apertures in the
// same local axis, so cut wall ends cannot accidentally acquire whole doors.
function sliceWall(w,lo,hi,suffix,status){
  const axis=w.a[0]===w.b[0]?1:0;
  const a=[...w.a],b=[...w.b];a[axis]=lo;b[axis]=hi;
  const openings=w.openings.flatMap(o=>{
    const start=w.a[axis]+o.offset,end=start+o.width,left=Math.max(start,lo),right=Math.min(end,hi);
    return right>left?[{...o,offset:round(left-lo),width:round(right-left)}]:[];
  });
  return {...w,id:w.id+suffix,a,b,openings,status};
}
function conversionWalls(existing,frame){
  const walls=[],removedWalls=[];
  for(const w of existing.walls){
    if(w.id==='street-facade'){removedWalls.push(w);continue;}
    if(w.exterior){walls.push(w);continue;}
    const left=frame.x0-.1,right=frame.x1+.1;
    if(w.a[0]===w.b[0]){
      (w.a[0]>left&&w.a[0]<right?removedWalls:walls).push(w);
      continue;
    }
    const lo=w.a[0],hi=w.b[0];
    const cut0=Math.max(left,lo),cut1=Math.min(right,hi);
    if(cut0>=cut1){walls.push(w);continue;}
    if(lo<cut0)walls.push(sliceWall(w,lo,cut0,'-left','retained'));
    removedWalls.push(sliceWall(w,cut0,cut1,'-cut','removed'));
    if(cut1<hi)walls.push(sliceWall(w,cut1,hi,'-right','retained'));
  }
  walls.push(h('garage-portal',.20,10.57,8.80,.40,[opening('garage-door',frame.x0,frame.width,2.10)],{...exterior,...added}));
  // A new garage lining cannot pass through the retained stair. Keep the
  // rear compartment door, and leave the stair-side approach physically open.
  walls.push(v('garage-right-lining',frame.x1+.10,.4,6.0,.2,[door(3.05,.8,'start',-1)],added));
  if(frame.x0>.60)walls.push(v('garage-left-lining',frame.x0-.10,.4,8.8,.2,[],added));
  return {walls,removedWalls};
}
function garagePlan(settings){
  const original=cellarPlan(),frame=garageFrame(settings),conflicts=getInteriorGarageConflicts(settings);
  const insideRun=settingsNumber(settings,'garageInsideRun'), bottomApron=settingsNumber(settings,'garageBottomApron');
  const extra=settingsNumber(settings,'garageExtraDepth'),clearHeight=settingsNumber(settings,'garageClearHeight')+extra;
  const elevation=-settingsNumber(settings,'garageSlabThickness')-clearHeight;
  const laneWidth=frame.width/2,mirrorClearance=(laneWidth-CYBERSTER_AWD.mirrorWidth)/2;
  const parkingFlatLength=DEPTH-.40-Math.max(0,insideRun-bottomApron);
  const garage={x0:frame.x0,x1:frame.x1,clearWidth:frame.width,laneWidth,insideRun,mirrorClearance,
    betweenMirrors:2*mirrorClearance,widthPass:mirrorClearance>=.30-1e-8,parkingFlatLength,
    parkingLengthPass:parkingFlatLength>=CYBERSTER_AWD.length+.60,lowering:round(-2-elevation),spaces:2};
  const space=room('garage','Two-car conversion study','garage',rect(frame.x0,.40,frame.x1,8.80));
  const fixtures=[0,1].map(i=>fixture('car-'+(i+1),'car','Cyberster '+(i+1),'garage',
    frame.x0+(i+.5)*laneWidth,.40+.30+CYBERSTER_AWD.length/2,CYBERSTER_AWD.width,CYBERSTER_AWD.length,
    {mirrorWidth:CYBERSTER_AWD.mirrorWidth,height:CYBERSTER_AWD.height}));
  return {
    ...original,...conversionWalls(original,frame),elevation,clearHeight,garage,conflicts,fixtures,
    rooms:[space,
      room('residual-rear','Rear cellar remainder','cellar',rect(frame.x1+.20,.4,10.37,4.8)),
      room('residual-front','Front cellar remainder','cellar',rect(Math.max(frame.x1+.20,7.08),5.2,10.37,8.6))],
    sources:sources('cellar','section','structure','detached'),
    issues:[
      'Two straight parking lanes project across the historical cellar. The drawing and mapped perimeter are centred without rescaling. Check registration on site.',
      ...conflicts.map(c=>'The proposed lanes intersect the retained '+c.label.toLowerCase()+'. Structural resolution is required.'),
      'The rear cellar entrance needs a safe route. The proposed cellar flight follows the lowered floor and its side approach stays open; its reconstruction and steep pitch need measured design. The exterior ramp study compares gradients, overhead clearance and vehicle underside separately.',
      'The proposed floor is '+Math.abs(elevation).toFixed(2)+' m below ground-floor datum; the drawing marks a foundation line at −2.50 m. Establish actual footing depths and design any required underpinning, water control and load transfers.',
      'Mirror clearances assume closed doors. '+(garage.widthPass?'The selected width meets the study allowances.':'The selected width fails the two-car lateral allowance.'),
    ],
  };
}

/** Furnish only the measured cellar remainder, never a parking lane. The
 * shared conversion already lowers the complete basement display floor; this
 * fit-out makes that assumption explicit for the two occupied side rooms. */
function basementServiceFitOut(plan,{gymBenchParked=true}={}){
  const left=Math.max(plan.garage.x1+.20,5.95),right=10.37,frontLeft=Math.max(plan.garage.x1+.20,7.08);
  const gymWidth=right-left,technicalWidth=right-frontLeft;
  if(gymWidth<3.60||technicalWidth<2.80||plan.clearHeight<2.20)return {...plan,issues:[...plan.issues,
    'The edited garage geometry leaves insufficient width or height for the illustrated premium gym and plant/laundry fit-out. It needs at least 3.60 m gym width and 2.20 m modeled clear height; fittings are omitted rather than squeezed into the parking lanes.']};
  const doorHeight=Math.min(2.05,plan.clearHeight-.04),walls=plan.walls.map(w=>{
    if(w.id==='garage-right-lining')return {...w,openings:[...w.openings,
      {...door(5.10,.90,'end',-1),offset:5.10-w.a[1],height:doorHeight,roomId:'basement-technical'}].map(({start,...o})=>o)};
    if(/^east-cellar-crosswall(?:-right)?$/.test(w.id))return {...w,openings:[...w.openings,
      {...door(8.55,.90,'end',1),offset:8.55-w.a[0],height:doorHeight,roomId:'basement-gym',alteration:'new-opening'}].map(({start,...o})=>o)};
    return w;
  });
  const crosswall=plan.walls.find(w=>/^east-cellar-crosswall(?:-right)?$/.test(w.id));
  const gym={...room('basement-gym','Compact gym · cable strength and smart bike','gym',rect(left,.40,right,4.80),null,null,'Rubber exercise flooring'),
    fitOutNote:gymBenchParked?'Bench parked · open floor / cable work / cycling':'Bench in strength position · shared floor for one user'};
  const technical=room('basement-technical','Technical room · plant and laundry','utility',rect(frontLeft,5.20,right,8.60),null,null,'Utility tile');
  const gymCentre=(left+right)/2,plantX=frontLeft+.37;
  const fittings=[
    ...compactGymFixtures({left,right,clearHeight:plan.clearHeight,gymBenchParked}),
    fixture('technical-plant','plantUnit','Hydraulic plant and hot-water cylinder allowance','basement-technical',plantX,7.08,.66,1.30,{front:[1,0],height:Math.min(1.95,plan.clearHeight-.12),approach:[plantX+1.05,7.08],serviceDepth:.90}),
    fixture('technical-washer','washer','Front-loading washing machine','basement-technical',8.22,8.25,.60,.65,{front:[0,-1],height:.84,approach:[8.22,7.20]}),
    fixture('technical-dryer','dryer','Side-by-side heat-pump dryer allowance','basement-technical',8.86,8.25,.60,.65,{front:[0,-1],height:.84,approach:[8.86,7.20]}),
    fixture('technical-laundry-top','worktop','Continuous counter over the laundry pair','basement-technical',8.54,8.25,1.28,.65,{baseHeight:.88,height:.038,wallMounted:true}),
    fixture('technical-sink-base','counter','Utility sink and cleaning cupboard','basement-technical',9.68,8.25,1.00,.65,{front:[0,-1],height:.90,drawers:true}),
    fixture('technical-sink','sink','Deep utility sink','basement-technical',9.75,8.25,.62,.48,{front:[0,-1],hostId:'technical-sink-base',basins:1,approach:[9.68,7.20]}),
    fixture('technical-wall-storage','wallCabinet','Closed laundry and cleaning storage','basement-technical',9.00,8.43,2.55,.32,{front:[0,-1],baseHeight:1.50,height:Math.min(.65,plan.clearHeight-1.60),wallMounted:true}),
    fixture('technical-cleaning-storage','storage','Tall broom and cleaning cupboard','basement-technical',10.04,5.51,.58,.50,{front:[0,1],height:Math.min(2.12,plan.clearHeight-.12),approach:[10.04,6.45]}),
  ];
  const lighting=[gym,technical].map(r=>{const xs=r.polygon.map(p=>p[0]),zs=r.polygon.map(p=>p[1]);return{
    id:r.id+'-ceiling',roomId:r.id,x:(Math.min(...xs)+Math.max(...xs))/2,z:(Math.min(...zs)+Math.max(...zs))/2,
    height:plan.clearHeight-.13,intensity:5.5,distance:4.6,minStrength:.55,
  };});
  return {...plan,walls,rooms:[plan.rooms[0],gym,technical],fixtures:[...plan.fixtures,...fittings],interiorLights:lighting,
    removedWalls:[...plan.removedWalls,...(crosswall?[sliceWall(crosswall,8.55,9.45,'-gym-opening','removed')]:[])],
    basementFitOut:{kind:'plant-laundry-and-compact-gym',gymArea:gym.area,technicalArea:technical.area,
      originalElevation:-2,originalClearHeight:1.70,proposedElevation:plan.elevation,proposedClearHeight:plan.clearHeight,
      loweringBeyondGarage:true,garageLanesUnchanged:true,gymBenchParked,equipmentReferences:GYM_EQUIPMENT_REFERENCES,
      exercise:'Dual cable strength station, adjustable bench and dumbbells, permanent smart bike, kettlebells and mobility. One active user shares the central floor.'},
    issues:[...plan.issues,
      `The non-garage cellar remainder provides a ${gymWidth.toFixed(2)} × 4.40 m gym (${gym.area.toFixed(2)} m²) and ${technicalWidth.toFixed(2)} × 3.40 m technical/laundry room (${technical.area.toFixed(2)} m²). Neither room occupies the two-car parking strip.`,
      `These occupied rooms share the conversion floor at ${plan.elevation.toFixed(2)} m and ${plan.clearHeight.toFixed(2)} m modeled clear height. The original cellar has only 1.70 m at −2.00 m. Extending excavation and a new slab beneath the side rooms is an explicit proposal, not established structural feasibility; verify foundations, groundwater, ventilation and damp protection.`,
      'A new 0.90 m door in the proposed garage lining links the stair-side approach, and a separate 0.90 m opening connects the technical room to the gym through the retained east crosswall, beyond the flue. The crosswall opening needs a designed lintel and load-path check. Stair and chimney footprints are retained, including their existing garage conflicts.',
      'The premium gym uses a short wall-mounted dual-stack cable station, wheeled adjustable bench, adjustable dumbbells, a permanent smart training bike, kettlebells and wall storage for handles and mobility kit. Park the bench beside the west wall for floor and cable work, or move it into the strength position. This is a one-user shared exercise area; the bike and room door remain accessible in both positions.',
      'Equipment envelopes are rounded up from REP Ares 2.0 wall-mount 80-inch, Nighthawk bench, REP adjustable dumbbell stand and Wahoo KICKR BIKE PRO dimensions. The Ares reference reaches 2.085 m before any additional floor build-up; the model reserves 2.10 m. Pull-up extensions, standing overhead lifting, jumping and treadmills are not included beneath the proposed 2.30 m ceiling. Verify anchoring, floor build-up, the rider’s fitted height and installation/service clearances before selecting products.',
      'Plant/laundry service spaces remain fit-out allowances; final products, drainage, electrical supply, ventilation and maintenance access must be coordinated.',
    ]};
}

// Gross pitched envelope relative to the chord datum, before roof build-up or trusses.
export function atticHeadroomAt(z){
  if(!Number.isFinite(z)||z<0||z>DEPTH)return 0;
  return 3-Math.abs(z-4.50)*Math.tan(Math.PI/6);
}
function atticPlan(proposed=false){
  const headroomBands=[1.4,1.9,2.2].map(minimum=>{
    const halfDepth=(3-minimum)/Math.tan(Math.PI/6);
    const polygon=rect(.34,4.5-halfDepth,10.43,4.5+halfDepth);
    return {minimum,depth:round(2*halfDepth),area:round(2*halfDepth*10.09),polygon};
  });
  return {
    rooms:[room('attic','Unpartitioned roof space','attic',rect(.34,.34,10.43,8.66))],
    walls:[...mainSides(.34,[]).map(w=>({...w,height:.40})),h('garden-eave',.17,10.60,.17,.34,[],{...exterior,height:.40}),
      h('street-eave',.17,10.60,8.83,.34,[],{...exterior,height:.40})],
    removedWalls:[],fixtures:[],stairs:[foldStair(proposed)],voids:[proposed?foldStair(true).polygon:hatch()],cores:flueCores(),outdoor:[],headroomBands,
    sources:sources('first','section','front','side','structure'),
    issues:['The +5.75 m datum marks the upper ceiling or truss chord. The 3.00 m ridge height and headroom bands are gross envelope dimensions. Actual deck, insulation, truss webs and available clear floor area need inspection.',
      'A folding stair is drawn on the floor below. No attic room partitions or habitable area are documented. The front bay roof detail and exact truss spacing are inferred.'],
  };
}
export function getInteriorPlan({floor='ground',layout='renovation',styleId='current',garageVariant='cellar',garageSettings={},officeCoworking=true,officeGuestBedOpen=false,gymBenchParked=true,livingCinemaLayout='legacy',secondaryDishwasherWidth=.60,bathroomPrivacyGlazing=true}={}){
  if(!INTERIOR_FLOORS.includes(floor))throw new RangeError('Unknown interior floor: '+floor);
  if(!INTERIOR_LAYOUTS.includes(layout))throw new RangeError('Unknown interior layout: '+layout);
  const proposed=layout==='renovation';
  const converted=floor==='basement'&&proposed&&garageVariant==='two-car';
  const builders={basement:()=>converted?garagePlan(garageSettings):cellarPlan(),ground:()=>groundPlan(proposed,{secondaryDishwasherWidth,bathroomPrivacyGlazing}),
    first:()=>firstPlan(proposed,{officeCoworking,officeGuestBedOpen}),attic:()=>atticPlan(proposed)};
  const built=builders[floor]();
  const detail=converted&&INTERIOR_COMPOSITIONS[styleId]?basementServiceFitOut(built,{gymBenchParked}):built;
  const {roof}=INTERIOR_DIMENSIONS,bay=floor==='first'?INTERIOR_DIMENSIONS.firstBay:INTERIOR_DIMENSIONS.bay;
  const bayRight=round(bay.x+bay.width),bayFront=round(DEPTH+bay.depth);
  const outline=floor==='ground'||floor==='first'?[[0,0],[WIDTH,0],[WIDTH,9],[bayRight,9],[bayRight,bayFront],[bay.x,bayFront],[bay.x,9],[0,9]]:rect(0,0,WIDTH,9);
  const plan={floor,layout,garageVariant:converted?'two-car':'cellar',envelope:{width:WIDTH,depth:DEPTH,bay:{...bay},outline},
    roof:{...roof},...INTERIOR_DIMENSIONS.levels[floor],conflicts:[],...detail};
  plan.walls=plan.walls.map(w=>({...w,height:w.height??plan.clearHeight}));
  plan.removedWalls=plan.removedWalls.map(w=>({...w,height:w.height??INTERIOR_DIMENSIONS.levels[floor].clearHeight,status:'removed'}));
  return applyLivingCinema(curateInteriorPlan(plan,styleId),livingCinemaLayout);
}
