/** Small material-sharing cinema devices. All coordinates stay inside the
 * metric fixture envelopes; the finish palette supplies timber/fabric/metal. */
export function furnishCinemaFixture(parent,f,tools,m){
  const {box,rounded,cyl,rod,group}=tools;
  parent.userData.cinema={channel:f.channel||null,layer:f.layer||null,mounting:f.mounting||null,
    azimuthDegrees:f.azimuthDegrees,elevationDegrees:f.elevationDegrees,aimAt:f.aimAt||null};
  const front=f.front||f.mountNormal||[0,1],angle=Math.atan2(front[0],front[1]);
  const oriented=()=>group(parent,0,0,0,angle);
  const span=Math.abs(front[0])>.5?f.depth:f.width,depth=Math.abs(front[0])>.5?f.width:f.depth;
  if(f.kind==='cinemaPanel'){
    const g=oriented(),h=f.height,y=f.mountHeight;
    box(g,m.fabric,0,y,0,span,h,.020);
    for(const side of [-1,1]){
      box(g,m.wood,0,y+side*(h/2-.008),.012,span,.016,.018);
      for(let i=0;i<3;i++)box(g,m.wood,side*(span/2-.035-i*.048),y,.013,.021,h,.020);
    }
    return;
  }
  if(f.kind==='cinemaConsole'){
    const g=oriented(),h=f.height||.54,bay=.66,side=(span-bay)/2;
    box(g,m.dark,0,.08,0,span-.14,.08,depth-.10);
    box(g,m.wood,0,.12,0,span,.028,depth);
    rounded(g,m.stone,0,h-.018,0,span,.036,depth,.009);
    for(const sign of [-1,1]){
      const x=sign*(bay/2+side/2);
      rounded(g,m.cabinet||m.wood,x,(h+.12)/2,0,side-.007,h-.16,depth-.014,.010);
      box(g,m.wood,x,h-.065,depth/2+.001,side-.04,.007,.006);
    }
    // The receiver bay has no back or cabinet door. The 482 mm case leaves
    // rear access, 113 mm to either side, and 180 mm above in this envelope.
    const receiver=f.receiver||{width:.434,depth:.482,height:.195},rx=receiver.width,rh=receiver.height,rd=receiver.depth,ry=.135+rh/2,rz=.026;
    const av=rounded(g,m.frame,0,ry,rz,rx,rh,rd,.009);av.name='cinema-av-receiver';
    av.userData.role='ventilated-av-receiver';av.userData.requiredAmplifiedChannels=11;av.userData.referenceAmplifiedChannels=f.receiver?.referenceAmplifiedChannels||null;
    box(g,m.blackGlass,0,ry+.015,rz+rd/2+.002,rx*.42,.052,.003);
    for(const sign of [-1,1]){const knob=cyl(g,m.steel,sign*rx*.37,ry,rz+rd/2+.006,.022,.022,.012,16);knob.rotation.x=Math.PI/2;}
    for(let i=0;i<5;i++)box(g,m.dark,0,ry+rh/2+.001,rz-.12+i*.045,rx*.69,.002,.009);
    return;
  }
  if(f.kind==='cinemaSub'){
    const aim=f.aimAt||[f.x,1,f.z+1],rotation=Math.round(Math.atan2(aim[0]-f.x,aim[2]-f.z)/(Math.PI/2))*(Math.PI/2),g=group(parent,0,0,0,rotation);
    for(const sign of [-1,1])box(g,m.dark,sign*.14,.025,0,.052,.05,.32);
    rounded(g,m.frame,0,.255,0,.44,.41,.44,.018);
    rounded(g,m.fabric,0,.26,.222,.405,.365,.006,.012);
    return;
  }
  if(f.kind!=='cinemaSpeaker')return;
  if(f.ceilingMounted){
    const rim=cyl(parent,m.painted||m.trim,0,f.mountHeight,0,.12,.12,.020,24);rim.name=f.id+'-flush-rim';
    const grille=cyl(parent,m.fabric,0,f.mountHeight-.011,0,.106,.106,.003,24);grille.name=f.id+'-grille';
    grille.userData.role='flush-overhead-speaker';return;
  }
  const direction=f.wallMounted?f.mountNormal:f.aimDirection,g=group(parent,0,0,0,Math.atan2(direction[0],direction[1]));
  const wide=f.channel==='C'?.64:f.wallMounted?.20:.18,dep=f.wallMounted?.075:.11,h=f.height;
  if(!f.wallMounted){
    cyl(g,m.frame,0,.020,0,.11,.11,.025,20);
    rod(g,m.frame,[0,.03,0],[0,f.mountHeight-h/2,0],.012);
  }
  rounded(g,m.frame,0,f.mountHeight,0,wide,h,dep,.012);
  rounded(g,m.fabric,0,f.mountHeight,dep/2+.001,wide-.013,h-.013,.003,.008);
}
