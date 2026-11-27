/** Four physical living/dining alternatives in the retained ground-floor shell.
 * Local x/z metres are shared by the drawings, furniture and facade apertures.
 * Speaker angles are measured from the nominated seated listening position;
 * this is a spatial installation concept, not a room-acoustics prediction. */
const rad=d=>d*Math.PI/180,deg=r=>r*180/Math.PI;
const round=n=>Math.round(n*1e6)/1e6;
const diagonal=85*.0254;
export const LIVING_CINEMA_SCREEN=Object.freeze({diagonalInches:85,width:round(diagonal*16/Math.sqrt(337)),height:round(diagonal*9/Math.sqrt(337)),
  planningEnvelope:true,technology:'OLED design envelope',pictureTarget:'Dolby Vision 2 Max',
  productNote:'85-inch space reservation. Philips 83OLED811 is an 83-inch OLED / Dolby Vision 2 Max candidate; confirm the final release and installation sheet.'});
export const LIVING_CINEMA_REFERENCE='https://www.dolby.com/about/support/guide/speaker-setup-guides/7.1.4-overhead-speaker-setup-guide';
export const LIVING_CINEMA_LAYOUTS=Object.freeze([
  {id:'right-media',letter:'A',label:'Cinema right · dining left',summary:'Side-wall OLED and 7.2.4 cinema on the right; a large picture window lights dining on the left.',recommended:false,hasCinema:true},
  {id:'left-media',letter:'B',label:'Cinema left · dining right',summary:'The cinema and dining genuinely swap sides. The left media bay is solid; the right dining window opens up.',recommended:false,hasCinema:true},
  {id:'garden-salon',letter:'C',label:'Garden salon · no screens',summary:'Conversation seating, no television or audio equipment, and large clear windows on both sides.',recommended:false,hasCinema:false},
  {id:'crosswall-media',letter:'D',label:'Crosswall cinema · both windows',summary:'OLED on the existing inner crosswall, a sofa facing it, and large windows on both sides. The terrace and central passage stay open.',recommended:true,hasCinema:true},
].map(Object.freeze));
export function getLivingCinemaLayout(id){return LIVING_CINEMA_LAYOUTS.find(item=>item.id===id)||null;}
const fixture=(id,kind,label,x,z,width,depth,extra={})=>({id,kind,label,roomId:'lounge',x:round(x),z:round(z),width:round(width),depth:round(depth),rotation:0,fixedLayout:true,...extra});
const directions={FL:'Front left',FR:'Front right',C:'Center',SL:'Side surround left',SR:'Side surround right',SBL:'Rear surround left',SBR:'Rear surround right',TFL:'Top front left',TFR:'Top front right',TRL:'Top rear left',TRR:'Top rear right'};
const polygons={left:[[.35,.35],[5.89,.35],[5.89,4.85],[.35,4.85]],right:[[5.89,.35],[10.42,.35],[10.42,4.85],[5.89,4.85]]};
function speakerAngles(listener,x,z,height){
  const dx=x-listener.x,dz=z-listener.z,[fx,fz]=listener.forward,forward=dx*fx+dz*fz,right=-dx*fz+dz*fx;
  return {azimuthDegrees:round(deg(Math.atan2(right,forward))),elevationDegrees:round(deg(Math.atan2(height-listener.earHeight,Math.hypot(dx,dz)))),
    sagittalDegrees:round(deg(Math.atan2(height-listener.earHeight,forward))),distance:round(Math.hypot(dx,dz,height-listener.earHeight))};
}
function at(listener,forward,right){const [fx,fz]=listener.forward;return [listener.x+fx*forward-fz*right,listener.z+fz*forward+fx*right];}
function device(listener,channel,x,z,{height=listener.earHeight,wall=false,ceiling=false,normal=null}={}){
  const dx=listener.x-x,dz=listener.z-z,len=Math.hypot(dx,dz)||1,aimDirection=[dx/len,dz/len],mountNormal=normal||aimDirection;
  const wide=channel==='C'?.64:.20,thin=.075;
  const width=wall?Math.abs(mountNormal[1])*wide+Math.abs(mountNormal[0])*thin:ceiling?.24:.22;
  const depth=wall?Math.abs(mountNormal[0])*wide+Math.abs(mountNormal[1])*thin:ceiling?.24:.22;
  return fixture('cinema-'+channel.toLowerCase(),'cinemaSpeaker',channel+' · '+directions[channel],x,z,width,depth,{
    channel,layer:ceiling?'overhead':'ear-level',mountHeight:height,height:ceiling?.035:channel==='C'?.16:.34,
    mounting:ceiling?'flush-ceiling':wall?'wall':'slim-stand',wallMounted:wall||ceiling,ceilingMounted:ceiling,
    mountNormal,aimDirection,aimAt:[listener.x,listener.earHeight,listener.z],...speakerAngles(listener,x,z,height),
  });
}
function table(swapped){return fixture('table','diningTable','Eight-seat dining table',swapped?8.15:2.98,2.65,2.70,1.04,{roomId:'dining',seats:8});}
function ordinaryFurniture(id,listener){
  if(id==='garden-salon')return [table(false),
    fixture('sofa','sofa','Garden-facing conversation sofa',8.12,4.02,2.50,.96,{front:[0,-1]}),
    fixture('lounge-chair-west','armchair','Conversation chair',6.65,2.17,.84,.88,{front:[1,0]}),
    fixture('lounge-chair-east','armchair','Window-side reading chair',9.48,2.12,.84,.88,{front:[-1,0]}),
    fixture('lounge-table','coffeeTable','Low conversation table',8.14,2.92,1.12,.60),
    fixture('lounge-rug','rug','Woven conversation rug',8.13,3.12,3.90,2.94,{nonBlocking:true}),
    fixture('lounge-reading-light','floorLamp','Soft reading light',9.92,4.62,.36,.36,{height:1.38,lamp:'linen'})];
  const cross=id==='crosswall-media',swapped=id==='left-media',front=listener.forward;
  const sofa=cross?[8.62,2.40,2.20,.94]:[listener.x-front[0]*.10,2.75,.96,2.20];
  return [table(swapped),fixture('sofa','sofa','Cinema sofa facing the OLED',...sofa,{front,approach:cross?[7.05,2.45]:[listener.x+front[0]*.9,2.75]}),
    fixture('lounge-table','coffeeTable','Low cinema table',cross?8.62:listener.x+front[0]*1.30,cross?3.55:2.75,cross?1.18:.70,cross?.58:1.05),
    fixture('lounge-rug','rug','Quiet woven cinema rug',cross?8.60:listener.x+front[0]*.65,cross?3.15:2.75,cross?3.10:2.65,cross?2.55:3.15,{nonBlocking:true})];
}

/** Undefined/legacy is deliberately not coerced: archived proposals retain
 * their original composition. The active-state default is chosen by state.js. */
export function livingCinemaLayout({layout='right-media',clearHeight=2.75}={}){
  const option=getLivingCinemaLayout(layout);if(!option)return null;
  const id=option.id,cross=id==='crosswall-media',swapped=id==='left-media',hasCinema=option.hasCinema;
  const listener=hasCinema?{x:cross?8.62:swapped?3.22:7.58,z:cross?2.55:2.75,earHeight:1.05,forward:cross?[0,1]:swapped?[-1,0]:[1,0]}:null;
  const fixtures=ordinaryFurniture(id,listener),sideWindows={left:id!=='left-media',right:id!=='right-media'};
  if(!hasCinema)return {...option,fixtures,sideWindows,listener:null,screen:null,audio:null,clearHeight,clearances:{rearGlazingStrip:1,centralPassage:.9}};
  const [fx,fz]=listener.forward,normal=[-fx,-fz],tv=[cross?8.62:swapped?.43:10.34,cross?4.79:2.75];
  const frontRun=(tv[0]-listener.x)*fx+(tv[1]-listener.z)*fz;
  const panelCentre=cross?[8.62,4.823]:swapped?[.375,2.75]:[10.395,2.75];
  const panelHeight=Math.max(.20,Math.min(2.50,clearHeight-.25));
  fixtures.push(fixture('cinema-acoustic-panel','cinemaPanel','Integrated fabric and timber media wall',...panelCentre,cross?3.02:.040,cross?.040:3.02,{
    wallMounted:true,mountHeight:.15+panelHeight/2,height:panelHeight,front:normal}),
  fixture('cinema-console','cinemaConsole','Ventilated AV cabinet · open receiver bay',cross?8.62:swapped?.66:10.11,cross?4.53:2.75,cross?2.34:.60,cross?.60:2.34,{
    front:normal,height:.54,receiver:{width:.434,depth:.482,height:.195,requiredAmplifiedChannels:11,referenceAmplifiedChannels:13,ventilated:true,reference:'Denon AVC-A10H envelope',
      referenceUrl:'https://www.denon.com/en/product/av-receivers/avc-a10h/AVCA10HBKE2.html'},
    equipmentLabel:{title:'7.2.4 Atmos · ventilated AV bay',detail:'7 ear-level + 4 overhead speakers · 2 independent subs',anchorHeight:.60}}),
  fixture('tv','wallTv','85-inch OLED design envelope · Dolby Vision 2 target',...tv,cross?LIVING_CINEMA_SCREEN.width:.10,cross?.10:LIVING_CINEMA_SCREEN.width,{
    wallMounted:true,screenFront:normal,wallAnchor:panelCentre,screenWidth:LIVING_CINEMA_SCREEN.width,screenHeight:LIVING_CINEMA_SCREEN.height,
    mountHeight:1.28,height:LIVING_CINEMA_SCREEN.height,screenDiagonalInches:85,planningEnvelope:true,cinema:true,pictureTarget:LIVING_CINEMA_SCREEN.pictureTarget,
    equipmentLabel:{title:'85″ OLED design envelope',detail:'Dolby Vision 2 Max target · final 83″ model to verify',anchorHeight:1.92,
      anchor:[tv[0]+normal[0]*.09,1.92,tv[1]+normal[1]*.09]}}));
  for(const [channel,angle] of [['FL',-25],['FR',25]]){
    const p=at(listener,frontRun,frontRun*Math.tan(rad(angle)));fixtures.push(device(listener,channel,...p,{wall:true,normal}));
  }
  fixtures.push(device(listener,'C',...tv,{height:.64,wall:true,normal}));
  const sideDistances=cross?[1.57,2.08]:swapped?[1.80,1.29]:[1.29,1.80];
  for(const [index,channel]of ['SL','SR'].entries()){
    const side=index===0?-1:1,p=at(listener,-sideDistances[index]*Math.tan(rad(10)),side*sideDistances[index]);
    fixtures.push(device(listener,channel,...p));
  }
  const backRun=cross?1.08:swapped?1.35:1.32;
  for(const [channel,side]of [['SBL',-1],['SBR',1]]){
    const p=at(listener,-backRun,side*backRun*Math.tan(rad(40)));fixtures.push(device(listener,channel,...p));
  }
  // Four distinct, flush ceiling devices. Longitudinal angles remain inside
  // Dolby's 30–55° / 125–150° ranges at the default retained ceiling height.
  const ceiling=clearHeight-.022,ceilingRise=Math.max(.50,ceiling-listener.earHeight),topRun=Math.min(1.50,ceilingRise/Math.tan(rad(48))),topSide=.88;
  for(const [channel,forward,side]of [['TFL',1,-1],['TFR',1,1],['TRL',-1,-1],['TRR',-1,1]]){
    const p=at(listener,forward*topRun,side*topSide);fixtures.push(device(listener,channel,...p,{height:ceiling,ceiling:true}));
  }
  const subs=cross?[[10.15,4.55],[6.26,1.58]]:swapped?[[1.25,1.58],[4.70,4.55]]:[[9.50,1.58],[6.26,4.55]];
  for(const [i,p]of subs.entries())fixtures.push(fixture('cinema-sw'+(i+1),'cinemaSub','SW'+(i+1)+' · independent subwoofer',...p,.44,.44,{
    channel:'SW'+(i+1),layer:'subwoofer',height:.46,mountHeight:.23,aimAt:[listener.x,listener.earHeight,listener.z],calibrationRequired:true}));
  return {...option,fixtures,sideWindows,listener,clearHeight,screen:{...LIVING_CINEMA_SCREEN,x:tv[0],z:tv[1],mountHeight:1.28,
    viewingDistance:round(frontRun),horizontalViewAngle:round(deg(2*Math.atan(LIVING_CINEMA_SCREEN.width/(2*frontRun))))},
    audio:{bedChannels:7,subwoofers:2,overheadChannels:4,amplifiedChannels:11,channelLayout:'7.2.4',reference:LIVING_CINEMA_REFERENCE,
      note:'Seat-based placement with independent subwoofers. Final aiming, bass positions and delays are calibrated in the completed room.'},
    clearances:{rearGlazingStrip:1,centralPassage:.9},
  };
}

function livingWindows(wall,enabled,roomId,clearHeight){
  const source=wall.architectureSourceOpenings||wall.openings;
  const retained=source.filter(o=>wall.a[1]+o.offset+o.width/2>=4.85);
  if(enabled)retained.unshift({type:'window',offset:round(1.15-wall.a[1]),width:3.10,sill:.40,height:Math.min(2.10,clearHeight-.58),
    panes:1,transoms:0,glazing:'clear',privacy:false,operation:'picture',service:'living-picture',roomId,outlook:'side-garden',source:'living-cinema-side-window-proposal'});
  const {architectureSourceOpenings,...clean}=wall;
  return {...clean,openings:retained};
}
export function applyLivingCinema(plan,id){
  if(plan.floor!=='ground'||plan.layout!=='renovation'||!getLivingCinemaLayout(id))return plan;
  const cinema=livingCinemaLayout({layout:id,clearHeight:plan.clearHeight});if(!cinema)return plan;
  const swap=id==='left-media',loungePoly=swap?polygons.left:polygons.right,diningPoly=swap?polygons.right:polygons.left;
  const rooms=plan.rooms.map(room=>{
    const p=room.id==='lounge'?loungePoly:room.id==='dining'?diningPoly:null;
    return p?{...room,polygon:p.map(v=>v.slice()),area:round((p[1][0]-p[0][0])*4.5),fitOutNote:room.id==='lounge'?cinema.summary:'Eight seats beside the clear side-garden picture window.'}:room;
  });
  const fixtures=[...cinema.fixtures,...plan.fixtures.filter(f=>!['lounge','dining'].includes(f.roomId))];
  const walls=plan.walls.map(w=>w.id==='left-facade'?livingWindows(w,cinema.sideWindows.left,swap?'lounge':'dining',plan.clearHeight):
    w.id==='right-facade'?livingWindows(w,cinema.sideWindows.right,swap?'dining':'lounge',plan.clearHeight):w);
  const dining=fixtures.find(f=>f.id==='table'),interiorLights=(plan.interiorLights||[]).filter(light=>!['lounge','dining'].includes(light.roomId));
  interiorLights.unshift({id:'dining-pendant',roomId:'dining',x:dining.x,z:dining.z,height:2.15,intensity:3,distance:3.2});
  const reading=fixtures.find(f=>f.id==='lounge-reading-light');if(reading)interiorLights.push({id:reading.id,roomId:'lounge',x:reading.x,z:reading.z,height:1.26,intensity:2.2,distance:2.8});
  return {...plan,rooms,fixtures,walls,interiorLights,livingCinema:cinema,
    furnishingConcept:{...plan.furnishingConcept,layout:id,name:cinema.label,glazingClearance:1,description:cinema.summary},
    issues:[...plan.issues.filter(s=>!['The right-wall TV is','The selected cinema reserves','The garden salon removes'].some(prefix=>s.startsWith(prefix))),cinema.hasCinema?
      'The selected cinema reserves an 85-inch OLED envelope with a seat-based 7.2.4 layout. Four flush ceiling speakers and seven ear-level speakers need eleven amplified channels plus two independent powered subwoofer outputs. The cabinet has an open receiver bay and rear ventilation; installation and room calibration follow the chosen equipment.':
      'The garden salon removes the display, speakers, subwoofers and AV cabinet. Both side-garden picture windows remain open.'],
  };
}
export function livingCinemaDiagnostics(plan){
  const c=plan.livingCinema;if(!c)return null;
  return {id:c.id,label:c.label,recommended:c.recommended,hasCinema:c.hasCinema,sideWindows:c.sideWindows,listener:c.listener,screen:c.screen,
    audio:c.audio,clearances:c.clearances,channels:c.fixtures.filter(f=>f.channel).map(f=>({id:f.id,channel:f.channel,layer:f.layer,x:f.x,z:f.z,
      mountHeight:f.mountHeight,mounting:f.mounting||'floor',azimuthDegrees:f.azimuthDegrees,elevationDegrees:f.elevationDegrees,sagittalDegrees:f.sagittalDegrees})),
    furniture:c.fixtures.filter(f=>!f.channel).map(({id,kind,x,z,width,depth,front})=>({id,kind,x,z,width,depth,front}))};
}
