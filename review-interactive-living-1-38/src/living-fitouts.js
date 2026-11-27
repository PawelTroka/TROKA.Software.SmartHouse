// Measured room fit-outs shared by the plan, walk collisions and furniture.
// Dimensions below are design envelopes in metres, not an installation order.
const item=(id,kind,label,roomId,x,z,width,depth,extra={})=>({id,kind,label,roomId,x,z,width,depth,rotation:0,...extra});
const bedroom=(n,x,z,width,depth,extra={})=>item(`guest${n}-bed`,'bed','140 × 200 cm double bed with storage',`guest-${n}`,x,z,width,depth,
  {mattressWidth:1.40,mattressLength:2.00,sleepingCapacity:2,underBedStorage:true,storageAccess:'lift-up',...extra});
const guestDesk=(n,x,z,width,depth,front,approach)=>item(`guest${n}-desk`,'desk','Compact guest work desk',`guest-${n}`,x,z,width,depth,
  {front,computer:'laptop',workstations:1,drawer:true,fixedLayout:true,approach});
const guestChair=(n,x,z,front)=>item(`guest${n}-chair`,'chair','Compact desk chair',`guest-${n}`,x,z,.42,.42,{front});
const guestTV=(n,x,z,width,depth,front,wallAnchor,extra={})=>item(`guest${n}-tv`,'wallTv','Articulated wall TV facing the bed',`guest-${n}`,x,z,width,depth,
  {screenFront:front,wallAnchor,wallMounted:true,screenWidth:.84,screenHeight:.473,mountHeight:1.40,viewFromId:`guest${n}-bed`,...extra});

export const LIVING_FIT_OUT_NOTES=Object.freeze({
  'guest-1':'140 × 200 cm double · side access · desk + bed-facing TV · under-bed storage',
  'guest-2':'140 × 200 cm double · foot access only · compact desk + articulated TV',
  'guest-3':'140 × 200 cm double · foot access only · compact desk + articulated TV',
  office:'260 cm desk · one or two workstations · convertible 90 × 200 cm single',
});

export function guestAndOfficeFixtures({officeCoworking=true,officeGuestBedOpen=false}={}){
  const office=[
    item('office-desk','desk','260 cm shared work desk','office',4.99,1.85,.70,2.60,
      {front:[1,0],workstations:officeCoworking?2:1,computer:'desktop',fixedLayout:true,approach:[6.48,2.85]}),
    item('office-chair','chair','Main office chair','office',5.81,officeCoworking?1.20:1.85,.56,.56,{front:[-1,0]}),
    ...(officeCoworking?[item('office-chair-coworker','chair','Coworking chair','office',5.81,2.50,.56,.56,{front:[-1,0]})]:[]),
    item('office-bookcase','bookcase','Shallow office library','office',7.84,.85,.30,.90,{front:[-1,0]}),
    item('office-guest-bed','sofaBed',officeGuestBedOpen?'Emergency single bed · 90 × 200 cm':'Daybed sofa · converts to a single','office',7.46,2.58,.98,2.10,
      {front:[-1,0],...(officeGuestBedOpen?{headboard:[0,1]}:{}),open:officeGuestBedOpen,mattressWidth:.90,mattressLength:2,sleepingCapacity:1,underBedStorage:true,storageAccess:'lift-up',approach:[6.48,2.58]}),
  ];
  return [...office,
    // The garden guest room keeps a continuous west-side entry route and its
    // rear balcony approach. The TV swings from the east wall over the desk.
    bedroom(1,9.65,2.75,1.48,2.10,{headboard:[0,1],approach:[8.56,2.75]}),
    guestDesk(1,10.16,1.15,.48,1.00,[-1,0],[8.94,1.22]),
    guestChair(1,9.61,1.26,[1,0]),
    guestTV(1,9.87,1.22,1.08,.60,[-.10,.995],[10.405,1.00],{screenWidth:.90,screenHeight:.506}),
    // Front rooms are only 1.93/1.66m deep. The bed length runs across the
    // room, leaving the east end for the desk and access to the mattress foot.
    // These are occasional couple rooms, not layouts with two side aisles.
    bedroom(2,1.47,5.99,2.10,1.48,{headboard:[-1,0],headboardMaxHeight:.72,approach:[2.86,6.48],access:'foot-only'}),
    guestDesk(2,3.22,5.235,1.00,.48,[0,1],[3.22,6.48]),
    guestChair(2,3.22,5.79,[0,-1]),
    guestTV(2,3.70,5.49,.42,1.02,[-.988,.154],[3.72,4.98]),
    bedroom(3,1.47,7.82,2.10,1.48,{headboard:[-1,0],approach:[2.86,8.31],access:'foot-only'}),
    guestDesk(3,3.22,7.255,1.00,.46,[0,1],[3.22,8.31]),
    guestChair(3,3.22,7.75,[0,-1]),
    guestTV(3,3.70,7.475,.42,.94,[-.994,.108],[3.72,7.005]),
  ];
}

// Manufacturer references checked 2026-11-27. Rounded planning envelopes are
// deliberately larger than the cited product, and exclude optional wings and
// overhead pull-up extensions. Installed suitability still requires a survey.
export const GYM_EQUIPMENT_REFERENCES=Object.freeze({
  trainer:{name:'REP Ares 2.0 wall-mounted, 80-inch',url:'https://repfitness.com/products/ares-2-0-wall-mounted-builder',
    width:57.6*.0254,depth:33*.0254,height:82.1*.0254},
  bench:{name:'REP Nighthawk adjustable bench',url:'https://repfitness.com/products/rep-nighthawk-adjustable-bench',
    width:25.9*.0254,depth:51*.0254,height:16.7*.0254},
  dumbbells:{name:'REP adjustable dumbbell stand with REP × PÉPIN pair',url:'https://repfitness.com/products/rep-adjustable-dumbbell-stand',
    width:31*.0254,depth:22.3*.0254,standHeight:21*.0254},
  bike:{name:'Wahoo KICKR BIKE PRO',url:'https://www.wahoofitness.com/devices/indoor-cycling/smart-bikes/kickr-bike-pro-buy',
    width:.76,depth:1.53,height:1.17},
});

export function compactGymFixtures({left,right,clearHeight,gymBenchParked=true}){
  const roomId='basement-gym',centre=(left+right)/2,trainerX=left+1.20;
  const reference=key=>({referenceEquipment:GYM_EQUIPMENT_REFERENCES[key].name,referenceUrl:GYM_EQUIPMENT_REFERENCES[key].url});
  const benchX=gymBenchParked?left+.40:trainerX,benchZ=gymBenchParked?2.35:2.18;
  return [
    item('gym-trainer','cableTrainer','Compact dual-stack cable strength station',roomId,trainerX,.87,1.50,.88,
      {front:[0,1],height:2.10,approach:[trainerX+.73,1.65],useArea:{x:trainerX,z:2.48,width:2.20,depth:2.20},...reference('trainer')}),
    item('gym-bike','exerciseBike','Premium smart training bike',roomId,right-.62,1.46,.80,1.56,
      {front:[0,-1],height:1.22,premium:true,approach:[right-1.40,1.60],...reference('bike')}),
    item('gym-bench','exerciseBench',gymBenchParked?'Wheeled adjustable bench · parked':'Adjustable bench · strength position',roomId,benchX,benchZ,.70,1.34,
      {front:[0,1],height:.44,parked:gymBenchParked,adjustable:true,approach:[benchX+.72,benchZ],...reference('bench')}),
    item('gym-weights','adjustableDumbbells','Premium adjustable dumbbell pair and stand',roomId,right-.37,3.20,.58,.80,
      {front:[-1,0],height:.78,approach:[right-1.30,3.20],...reference('dumbbells')}),
    item('gym-accessories','gymStorage','Kettlebells, cable handles, bands and mobility kit',roomId,left+.27,4.34,.46,.76,
      {front:[1,0],height:1.36,approach:[left+.96,4.34]}),
    item('gym-mobility-mat','exerciseMat',gymBenchParked?'Open mobility and cable-work floor':'Shared strength and mobility floor',roomId,centre,3.65,1.80,1.90,
      {height:.03,nonBlocking:true,activityZone:true}),
    item('gym-mirror','mirror','Full-length training mirror on the solid garage lining',roomId,left+.025,1.75,.035,2.20,
      {front:[1,0],height:1.54,mountHeight:1.10,wallMounted:true}),
    item('gym-training-screen','wallTv','Wall-mounted cycling and training display',roomId,right-.63,.47,.86,.12,
      {screenFront:[0,1],wallAnchor:[right-.63,.415],wallMounted:true,screenWidth:.80,screenHeight:.45,mountHeight:Math.min(1.60,clearHeight-.35)}),
  ];
}
