// Front-facing local appliance geometry. Module envelopes are supplied by the
// shared measured plan; the visible appliance bodies use their product sizes.
export function furnishKitchenAppliance(g,f,w,d,tools,m){
  const {box,rounded,cyl}=tools;
  if(f.kind==='steamOven'||f.kind==='speedOven'){
    const p=f.productDimensions,base=f.baseHeight||0,h=p.height,span=p.width,front=d/2+.013;
    const bodyHeight=(p.nicheHeight[0]+p.nicheHeight[1])/2,bodyWidth=(p.nicheWidth[0]+p.nicheWidth[1])/2;
    rounded(g,m.frame,0,base+bodyHeight/2,front-.017-p.nicheDepth/2,bodyWidth,bodyHeight,p.nicheDepth,.004).name=f.id+'-body';
    box(g,m.frame,0,base+h/2,front-.009,span,h,.018);
    box(g,m.blackGlass,0,base+h/2,front+.002,span-.012,h-.012,.010);
    box(g,m.frame,0,base+h-.050,front+.009,span-.025,.085,.008);
    box(g,m.glow,0,base+h-.046,front+.015,.105,.027,.004);
    for(const x of [-.103,.103])box(g,m.steel,x,base+h-.046,front+.015,.008,.008,.005);
    const glassH=h-.175;
    rounded(g,m.blackGlass,0,base+glassH/2+.025,front+.012,span-.073,glassH,.008,.011);
    for(const x of [-.204,.204])box(g,m.steel,x,base+h-.121,front+.030,.022,.019,.042);
    box(g,m.steel,0,base+h-.121,front+.051,.438,.018,.018);
    box(g,m.frame,0,base+.015,front+.011,span-.030,.012,.009);
    return true;
  }
  if(f.kind==='dishwasher'){
    const height=f.height||.845,span=f.productDimensions?.width||w-.002,front=d/2;
    // The matching joinery front is created by the common cabinet renderer.
    // A foot recess leaves the clear niche usable all the way to the floor.
    box(g,m.frame,0,(height+.13)/2,front-.55/2,span,height-.13,.55);
    for(const x of [-span*.38,span*.38])box(g,m.frame,x,.065,front-.46,.035,.13,.035);
    return true;
  }
  if(f.kind==='wineCooler'){
    const span=f.productDimensions?.width||w-.004,h=f.height||.816,front=d/2+.008,depth=f.actualDepth||.570;
    box(g,m.frame,0,h/2,front-depth+.009,span,h,.018).name=f.id+'-body';
    for(const side of [-1,1]){
      box(g,m.frame,side*(span/2-.010),h/2,front-depth/2,.020,h,depth);
      box(g,m.frame,0,side<0?.009:h-.009,front-depth/2,span,.018,depth);
    }
    // Dark glass is the door, while timber bottle racks and the two zones
    // stay legible with restrained shallow detail rather than extra lights.
    rounded(g,m.glass||m.blackGlass,0,.470,front+.006,span-.054,.642,.014,.006);
    for(const side of [-1,1])box(g,m.steel,side*(span/2-.013),.470,front+.018,.018,.654,.014);
    for(const y of [.145,.795])box(g,m.steel,0,y,front+.018,span-.008,.018,.014);
    for(const y of [.238,.350,.462,.605]){
      box(g,m.wood,0,y,front-.22,span-.105,.012,.42);
      for(let i=0;i<4;i++){
        const x=(i-1.5)*.108,bottle=cyl(g,m.dark||m.frame,x,y+.039,front-.18,.026,.026,.27,10);
        bottle.rotation.x=Math.PI/2;
        box(g,m.paper||m.linen,x,y+.039,front-.042,.021,.019,.003);
      }
    }
    box(g,m.frame,0,.526,front+.025,span-.062,.047,.010);
    box(g,m.glow,0,.526,front+.031,.082,.018,.003);
    // 560 × 90 mm grille less four 3 mm bars = 436.8 cm² free area.
    box(g,m.dark||m.frame,0,.075,front+.009,.560,.090,.010);
    for(let i=0;i<4;i++)box(g,m.steel,0,.044+i*.021,front+.017,.560,.003,.010);
    return true;
  }
  if(f.kind==='fridge'&&f.doorCount===4){
    const span=f.actualWidth||w,h=f.height||1.83,depth=f.actualDepth||d,front=d/2;
    rounded(g,m.frame,0,h/2,front-depth/2,span,h,depth,.019).name=f.id+'-body';
    const lower=.685,gap=.009,doorW=(span-gap)/2-.006;
    for(const side of [-1,1]){
      const x=side*(span+gap)/4;
      rounded(g,m.steel,x,(lower+.05)/2,front+.009,doorW,lower-.05,.025,.009);
      rounded(g,m.steel,x,(h+lower+.013)/2,front+.009,doorW,h-lower-.013,.025,.009);
      // Recessed central grips and separate freezer leaves keep the four-door
      // arrangement readable without a projecting handle in the work aisle.
      box(g,m.frame,side*.038,lower+.235,front+.026,.016,.32,.007);
      box(g,m.frame,x,lower-.032,front+.026,doorW*.75,.015,.008);
    }
    box(g,m.frame,0,.025,front-.014,span*.94,.04,.03);
    return true;
  }
  return false;
}
