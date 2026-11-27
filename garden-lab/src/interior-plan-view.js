// Plan coordinates are metres, with the garden at z = 0 and the street at z = 9.
// The SVG uses the same polygons, openings and furniture footprints as the 3D scene.
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n = value => Number(value.toFixed(3));
const pts = polygon => polygon.map(([x,z]) => `${n(x)},${n(z)}`).join(' ');
const line = (x1,y1,x2,y2,cls,extra = '') => `<line class="${cls}" x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" ${extra}/>`;

function bounds(polygon) {
  const x = polygon.map(p => p[0]), z = polygon.map(p => p[1]);
  return {left:Math.min(...x), right:Math.max(...x), top:Math.min(...z), bottom:Math.max(...z)};
}

function signedDistance(x, z, polygon) {
  let inside = false, distance = Infinity;
  for (let i = 0, j = polygon.length-1; i < polygon.length; j = i++) {
    const [ax,az] = polygon[i], [bx,bz] = polygon[j];
    if ((az > z) !== (bz > z) && x < (bx-ax)*(z-az)/(bz-az) + ax) inside = !inside;
    const dx = bx-ax, dz = bz-az;
    const t = Math.max(0, Math.min(1, ((x-ax)*dx + (z-az)*dz)/(dx*dx+dz*dz || 1)));
    distance = Math.min(distance, Math.hypot(x-ax-t*dx, z-az-t*dz));
  }
  return inside ? distance : -distance;
}

// Concave rooms can have their bounding-box centre outside their outline.
function labelAnchor(polygon) {
  const {left,right,top,bottom} = bounds(polygon), cx = (left+right)/2, cz = (top+bottom)/2;
  let best = [cx,cz], score = signedDistance(cx,cz,polygon);
  for (let row = 1; row < 16; row++) for (let col = 1; col < 16; col++) {
    const x = left + (right-left)*col/16, z = top + (bottom-top)*row/16;
    const d = signedDistance(x,z,polygon) - .14*Math.hypot(x-cx,z-cz);
    if (d > score) {best = [x,z]; score = d;}
  }
  return best;
}

// Keep the same physical location when a renovation merges or divides a room.
export function correspondingRoom(room, rooms) {
  const same = rooms.find(r => r.id === room?.id);
  if (same || !room) return same || rooms[0];
  const [x,z] = labelAnchor(room.polygon);
  return rooms.reduce((best,r) => signedDistance(x,z,r.polygon) > signedDistance(x,z,best.polygon) ? r : best,rooms[0]);
}

function openingSymbol(o, start, end) {
  const type = o.type;
  if (type === 'passage') return '';
  const width = end-start;
  if (type === 'window' || type === 'hst' || type === 'garage-door') {
    return `<g class="iw-glazing"><path d="M${n(start)},-.042 H${n(end)} V.042 H${n(start)} Z"/>${line((start+end)/2,-.065,(start+end)/2,.065,'iw-mullion')}</g>`;
  }
  const hingeEnd = o.hinge === 'end', hinge = hingeEnd ? end : start;
  const swing = o.swing === -1 ? -1 : 1, y = swing*width;
  const leaf = hingeEnd ? start : end, clockwise = (hingeEnd ? -1 : 1)*swing > 0 ? 1 : 0;
  return `<g class="iw-door"><path class="iw-swing" d="M${n(leaf)},0 A${n(width)},${n(width)} 0 0 ${clockwise} ${n(hinge)},${n(y)}"/>${line(hinge,0,hinge,y,'iw-leaf')}</g>`;
}

function wallDrawing(wall, changes) {
  const [x,z] = wall.a, dx = wall.b[0]-x, dz = wall.b[1]-z, len = Math.hypot(dx,dz);
  const transform = `translate(${n(x)} ${n(z)}) rotate(${n(Math.atan2(dz,dx)*180/Math.PI)})`;
  const status = changes ? wall.status : 'retained';
  const cls = `iw-wall iw-wall-${esc(status)}`;
  const width = `stroke-width="${n(wall.thickness || .16)}"`;
  const openings = [...(wall.openings || [])].sort((a,b) => a.offset-b.offset);
  let from = 0, solids = '', symbols = '';
  const segment=(left,right)=>{
    if(wall.form!=='timber-screen'||status==='removed')return line(left,0,right,0,cls,width);
    const span=right-left,slat=Math.min(wall.slatWidth||.035,span),count=Math.max(1,Math.ceil((span-slat)/(wall.slatPitch||.12)));
    return `<g class="iw-fixture"><title>${esc(wall.label)} · ${n(wall.height)} m</title>${line(left,0,right,0,'','stroke-width=".012"')}${Array.from({length:count+1},(_,i)=>`<rect x="${n(left+(span-slat)*i/count)}" y="${n(-wall.thickness/2)}" width="${n(slat)}" height="${n(wall.thickness)}"/>`).join('')}</g>`;
  };
  for (const o of openings) {
    const start = Math.max(from, Math.min(len, o.offset)), end = Math.max(start,Math.min(len,o.offset+o.width));
    if (start > from) solids += segment(from,start);
    if (end > start && status !== 'removed') symbols += openingSymbol(o,start,end);
    from = end;
  }
  if (from < len) solids += segment(from,len);
  return `<g transform="${transform}">${solids}${symbols}</g>`;
}

// Front/headboard vectors describe world-space facing while width/depth remain
// world-axis footprint dimensions. Three's positive Y rotation becomes a
// negative SVG rotation because the paper's z axis runs down the page.
export function fixturePlanFrame(f) {
  let width=f.width,depth=f.depth,rotation=f.rotation||0;
  const kind=String(f.kind||'').toLowerCase();
  const front=kind==='bed'&&f.headboard?f.headboard.map(v=>-v):f.front;
  if(front) {
    const angle=Math.atan2(front[0],front[1]);
    if(kind==='sofa'&&f.shape?.toUpperCase()==='U') {
      if(Math.abs(front[1])>.5)[width,depth]=[depth,width];
      rotation+=angle-Math.PI/2;
    } else {
      if(Math.abs(front[0])>.5)[width,depth]=[depth,width];
      rotation+=angle;
    }
  } else if(((kind==='bed'||kind==='toilet'||kind==='wc'||kind==='car')&&width>depth) || (kind==='desk'&&depth>width)) {
    [width,depth]=[depth,width];rotation+=Math.PI/2;
  } else if(kind==='tv'&&depth>width) {
    [width,depth]=[depth,width];rotation-=Math.PI/2;
  }
  return {width,depth,rotation};
}

function fixtureDrawing(f) {
  const {width:w,depth:d,rotation}=fixturePlanFrame(f);
  if (!(w > 0 && d > 0)) return '';
  const kind = String(f.kind).toLowerCase(), x = -w/2, y = -d/2;
  const rect = (a,b,width,height,r = .035) => `<rect x="${n(a)}" y="${n(b)}" width="${n(width)}" height="${n(height)}" rx="${n(r)}"/>`;
  let shape = rect(x,y,w,d);
  if(kind==='exercisebike'){
    shape=rect(-w*.13,-d*.42,w*.26,d*.84,.045)+rect(-w*.25,-d*.25,w*.5,d*.19,.055)+line(-w*.42,d*.32,w*.42,d*.32,'')+line(0,d*.20,0,d*.41,'');
  }else if(kind==='exercisebench'){
    shape=rect(-w*.40,-d*.45,w*.80,d*.63,.06)+rect(-w*.40,d*.22,w*.80,d*.24,.045)+line(-w*.46,-d*.34,w*.46,-d*.34,'')+line(-w*.46,d*.34,w*.46,d*.34,'');
  }else if(kind==='weightrack'){
    for(let i=0;i<3;i++)shape+=`<circle cx="${n((i-1)*w*.29)}" cy="0" r="${n(Math.min(d*.27,.10))}"/>`;
  }else if(kind==='plantunit'){
    shape=rect(-w*.48,-d*.42,w*.39,d*.84)+`<circle cx="${n(w*.23)}" cy="0" r="${n(Math.min(d*.41,w*.22))}"/>`;
  }else if(kind==='washer'||kind==='dryer'){
    shape+=rect(-w*.37,-d*.34,w*.74,d*.67,.06)+line(-w*.35,d*.37,w*.35,d*.37,'');
  }else if(kind==='exercisemat'){
    shape=rect(x,y,w,d,.05)+`<rect x="${n(x+.06)}" y="${n(y+.06)}" width="${n(w-.12)}" height="${n(d-.12)}" fill="none" stroke-dasharray=".06 .04"/>`;
  }else if (/bed/.test(kind)) {
    shape += rect(x+.07,y+.08,w-.14,Math.min(d*.23,.42),.065) + line(x,y+d*.35,-x,y+d*.35,'');
  } else if (f.shape === 'U') {
    shape = rect(x,y,w,d*.25) + rect(x,-y-d*.25,w,d*.25) + rect(x,y+d*.25,w*.32,d*.5);
  } else if (/sofa|couch|bench|armchair/.test(kind)) {
    shape += rect(x+w*.08,y+d*.19,w*.84,d*.7,.07);
  } else if (kind==='rug') {
    shape=rect(x,y,w,d,.09)+`<rect x="${n(x+.08)}" y="${n(y+.08)}" width="${n(w-.16)}" height="${n(d-.16)}" rx=".05" fill="none" stroke-dasharray=".04 .05"/>`;
  } else if (kind==='floorlamp'||kind==='tablelamp') {
    shape=`<circle cx="0" cy="0" r="${n(Math.min(w,d)*.46)}"/>`+line(-w*.18,-d*.18,w*.18,d*.18,'')+line(-w*.18,d*.18,w*.18,-d*.18,'');
  } else if (/dining|table/.test(kind)) {
    shape = rect(x,y,w,d,.12);
  } else if (kind==='hottub') {
    shape=rect(x,y,w,d,.12)+rect(x+.15,y+.15,w-.30,d-.30,.17);
    for(let i=0;i<10;i++) {
      const angle=i*Math.PI/5;
      shape+=`<circle cx="${n(Math.cos(angle)*(w/2-.21))}" cy="${n(Math.sin(angle)*(d/2-.21))}" r=".024"/>`;
    }
  } else if (/sink|basin/.test(kind)) {
    const count=f.basins===2?2:1;
    for(let i=0;i<count;i++) {
      const cx=(i-(count-1)/2)*w/count;
      shape+=`<ellipse cx="${n(cx)}" cy="${n(d*.025)}" rx="${n(w/count*.37)}" ry="${n(d*.34)}"/>`;
      shape+=line(cx,-d*.41,cx,-d*.22,'');
    }
  } else if (/bath|tub/.test(kind)) {
    shape += rect(x+w*.1,y+d*.12,w*.8,d*.76,Math.min(w,d)*.23);
  } else if (/shower/.test(kind)) {
    // The open front and rain-head positions follow the same fixture frame as
    // the 3D shower, including a side-wall mixer beside an existing window.
    shape += line(x,y,-x,y,'')+line(x,y,x,d*.25,'');
    const headWall=f.headWall;
    const local=headWall?[Math.cos(rotation)*headWall[0]-Math.sin(rotation)*headWall[1],Math.sin(rotation)*headWall[0]+Math.cos(rotation)*headWall[1]]:[0,-1];
    for(let i=0;i<(f.heads||1);i++) {
      const t=(i-((f.heads||1)-1)/2)*.46;
      const hx=Math.abs(local[0])>.5?Math.sign(local[0])*w*.32:t*w;
      const hz=Math.abs(local[0])>.5?t*d:Math.sign(local[1])*d*.32;
      shape+=`<circle cx="${n(hx)}" cy="${n(hz)}" r=".075"/>`;
    }
  } else if (/toilet|wc/.test(kind)) {
    shape = rect(x,y,w,d*.23) + `<ellipse cx="0" cy="${n(y+d*.59)}" rx="${n(w*.44)}" ry="${n(d*.37)}"/>`;
  } else if(kind==='bidet') {
    shape=`<ellipse cx="0" cy="0" rx="${n(w*.47)}" ry="${n(d*.47)}"/>`+rect(-w*.27,-d*.20,w*.54,d*.49,Math.min(w,d)*.15)+line(0,-d*.40,0,-d*.24,'');
  } else if(kind==='desk') {
    shape+=rect(-w*.28,-d*.27,w*.56,.035,.008)+rect(-w*.19,d*.10,w*.38,d*.17,.01);
  } else if(kind==='chair') {
    shape+=rect(x,y,w,d*.15,.025);
  } else if(kind==='spastep') {
    shape+=line(x,0,-x,0,'');
  } else if (/wardrobe|cabinet|counter|shelf|kitchen|closet|console/.test(kind)) {
    shape += line(x+w/2,y,x+w/2,-y,'');
    shape += line(-w*.30,d*.40,w*.30,d*.40,'');
  } else if (/car/.test(kind)) {
    shape += rect(x+w*.1,y+d*.24,w*.8,d*.48,.11);
  }
  return `<g class="iw-fixture${kind==='rug'?' iw-rug':''}"${kind==='rug'?' opacity=".38"':kind==='wallcabinet'?' stroke-dasharray=".035 .025"':''} data-iw-fixture="${esc(f.id)}" transform="translate(${n(f.x)} ${n(f.z)}) rotate(${n(-rotation*180/Math.PI)})"><title>${esc(f.label || kind)}</title>${shape}</g>`;
}

function stairDrawing(stair, idx) {
  const p = stair.polygon;
  if (!p?.length) return '';
  const {left,right,top,bottom} = bounds(p), w = right-left, d = bottom-top;
  const isAlongX = Array.isArray(stair.direction) ? Math.abs(stair.direction[0]) > Math.abs(stair.direction[1]) : w > d;
  const count = Math.max(2, Math.min(24, Number(stair.steps) || 10));
  let treads = '';
  for (let i = 1; i < count; i++) {
    const t = i/count;
    treads += isAlongX ? line(left+w*t,top,left+w*t,bottom,'') : line(left,top+d*t,right,top+d*t,'');
  }
  return `<g class="iw-stair"><title>${esc(stair.label)}</title><defs><clipPath id="iw-stair-${idx}"><polygon points="${pts(p)}"/></clipPath></defs><polygon points="${pts(p)}"/><g clip-path="url(#iw-stair-${idx})">${treads}</g></g>`;
}

function roofBands(plan) {
  return (plan.headroomBands || []).map(band => {
    const b = bounds(band.polygon);
    return `<g class="iw-headroom">${line(b.left,b.top,b.right,b.top,'')}${line(b.left,b.bottom,b.right,b.bottom,'')}<text x="${n(b.left+.18)}" y="${n(b.top-.06)}">${band.minimum.toFixed(1)} m</text></g>`;
  }).join('');
}
function dimensions(w, d, b) {
  const y = b.bottom+.48, x = b.left-.49;
  const hTick = value => line(value-.075,y+.075,value+.075,y-.075,'iw-tick');
  const vTick = value => line(x-.075,value+.075,x+.075,value-.075,'iw-tick');
  return `<g class="iw-dimension">${line(0,y,w,y,'')}${hTick(0)}${hTick(w)}${line(x,0,x,d,'')}${vTick(0)}${vTick(d)}
    <text x="${n(w/2)}" y="${n(y+.01)}">${w.toFixed(2)} m</text><text transform="translate(${n(x)},${n(d/2)}) rotate(-90)">${d.toFixed(2)} m</text></g>`;
}

function roomLabel(room, i, pos) {
  const [x,z] = pos, number = String(i+1).padStart(2,'0');
  const short = room.label.split(' · ')[0].replace(/\s*\([^)]*\)/g,'').trim();
  const half = short.length*.066;
  const fits = short.length <= 28 && signedDistance(x-half,z+.22,room.polygon) > .09 && signedDistance(x+half,z+.22,room.polygon) > .09;
  return `<g class="iw-zone-label" transform="translate(${n(x)} ${n(z)})"><circle r=".215"/><text class="iw-zone-number" y=".004">${number}</text>${fits ? `<text class="iw-zone-name" y=".47">${esc(short)}</text>` : ''}</g>`;
}

export function drawInteriorPlan(host, plan, { roomId, showFurniture = true, showChanges = false, palette = {} } = {}) {
  const {width,depth,outline} = plan.envelope, outdoor = plan.outdoor || [], rooms = plan.rooms;
  const b = bounds([...outline,...outdoor.flatMap(o => o.polygon || []),...(plan.stairs||[]).flatMap(s => s.polygon || [])]);
  const vb = [b.left-1,b.top-.88,b.right-b.left+1.62,b.bottom-b.top+2.12];
  const centerX = (b.left+b.right)/2;
  const anchors = rooms.map(r => labelAnchor(r.polygon));
  const roomMarkup = rooms.map((r,i) => `<g class="iw-zone${r.id===roomId?' is-selected':''}" data-iw-room="${esc(r.id)}" role="button" tabindex="0" aria-label="${esc(r.label)}, ${r.area.toFixed(1)} square metres modelled" aria-pressed="${r.id===roomId}"><title>${esc(r.label)}</title><polygon points="${pts(r.polygon)}" fill="${esc({bathroom:'url(#iw-tile)',utility:'url(#iw-tile)',gym:'#c0c5bf',sauna:'url(#iw-boards)',garage:'url(#iw-stone)',cellar:'url(#iw-stone)',hall:'#efeadf',wardrobe:'#eee7d8'}[r.kind] || 'url(#iw-boards)')}"/></g>`).join('');
  const decks = outdoor.map(o => {
    const p = o.polygon;
    if (!p?.length) return '';
    const [x,z] = labelAnchor(p);
    return `<g class="iw-deck"><polygon points="${pts(p)}"/><text x="${n(x)}" y="${n(z)}">${esc(o.label)}</text></g>`;
  }).join('');
  host.innerHTML = `<svg class="iw-plan-svg" xmlns="http://www.w3.org/2000/svg" viewBox="${vb.map(n).join(' ')}" role="group" aria-label="Interactive ${esc(plan.floor)} floor plan. Select a numbered room.">
    <defs><pattern id="iw-boards" width=".85" height=".16" patternUnits="userSpaceOnUse"><rect width=".85" height=".16" fill="#f1eadb"/><path d="M0 .16H.85 M.42 0V.16" fill="none" stroke="${esc(palette.wood || '#a18c68')}" stroke-opacity=".17" stroke-width=".012"/></pattern>
    <pattern id="iw-tile" width=".36" height=".36" patternUnits="userSpaceOnUse"><rect width=".36" height=".36" fill="#e4e9e4"/><path d="M0 .36H.36V0" fill="none" stroke="#c1ccc3" stroke-width=".018"/></pattern>
    <pattern id="iw-stone" width=".16" height=".16" patternUnits="userSpaceOnUse"><rect width=".16" height=".16" fill="#e9e7de"/><circle cx=".04" cy=".07" r=".011" fill="#b1aea0"/></pattern></defs>
    <text class="iw-plan-side" x="${n(centerX)}" y="${n(b.top-.42)}">GARDEN SIDE</text><text class="iw-plan-side" x="${n(centerX)}" y="${n(b.bottom+1.02)}">STREET SIDE</text>
    ${decks}<polygon class="iw-outline" points="${pts(outline)}"/>${roomMarkup}
    <g class="iw-drafting">${roofBands(plan)}${(plan.voids||[]).map(p => `<polygon class="iw-void" points="${pts(p)}"/>`).join('')}${(plan.stairs||[]).map(stairDrawing).join('')}${(plan.cores||[]).filter(c => c.polygon?.length).map(c => `${c.enclosure?`<polygon class="iw-fixture" points="${pts(c.enclosure.polygon)}"><title>${esc(c.enclosure.label)}</title></polygon>`:''}<polygon class="iw-core" points="${pts(c.polygon)}"${c.enclosure?' opacity=".35"':''}><title>${esc(c.label)}</title></polygon>`).join('')}
    ${showFurniture ? (plan.fixtures||[]).map(fixtureDrawing).join('') : ''}${plan.walls.map(w => wallDrawing(w,showChanges)).join('')}${showChanges ? (plan.removedWalls||[]).map(w => wallDrawing(w,true)).join('') : ''}
    ${(plan.conflicts||[]).map(c => `<polygon class="iw-conflict" points="${pts(c.polygon)}"><title>${esc(c.label)} crosses the proposed lanes</title></polygon>`).join('')}
    ${rooms.map((r,i) => roomLabel(r,i,anchors[i])).join('')}${dimensions(width,depth,b)}</g></svg>`;
  return vb;
}
