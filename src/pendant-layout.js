/** Decorative hanging lights use the garden's metric geometry and absolute
 * height datum. They are proposals, excluded from privacy and sunlight rays.
 * Posts support the lights independently of living thuja branches. */
import {gardenGroundAt,terraceGroundReference,hedgeSegments,hedgeTopAt,jacuzziBounds,pointInPolygon} from './geometry.js?v=1.32.1';
import {gardenFurniture,terraceStairs,rectCorners} from './layout.js?v=1.32.1';
import {gardenProgram,poolBounds} from './garden-program.js?v=1.32.1';
import {getResortGardenRecipe,resortTerraceLayout} from './resort-garden.js?v=1.32.1';

const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const mix=(a,b,t)=>a+(b-a)*t;
const segmentDistance=(p,a,b)=>{
  const dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy;
  const t=length2?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length2)):0;
  return distance(p,[a[0]+dx*t,a[1]+dy*t]);
};
const edgeDistance=(p,ring)=>Math.min(...ring.map((a,i)=>segmentDistance(p,a,ring[(i+1)%ring.length])));
const rectangle=(x,y,width,length)=>rectCorners({x,y,width,length});

/**
 * Fixtures: {id,zone,x,y,z,groundZ,hangZ,radius,height,supportIds}.
 * z is shade centre; the final cord drops from hangZ to z+height/2.
 * Supports: {id,zone,x,y,baseZ,topZ}; cables: {id,zone,kind,points,supportIds}.
 * Switches dim the installed proposal without moving or removing its supports.
 */
export function pendantLightingLayout(settings={},data){
  const result={garden:[],hedge:[],supports:[],cables:[]};
  const resort=getResortGardenRecipe(settings);
  const boundary=data.site.boundary,terrace=data.site.terrace,rear=data.site.rearMidpoint[1];
  const depth=Number.isFinite(settings.terraceDepth)?settings.terraceDepth:terrace.depth;
  const {floorZ,drop}=terraceGroundReference(settings,data);
  const terraceRing=rectangle(terrace.x,rear,terrace.width,depth);
  const surfaceAt=(p)=>pointInPolygon(p,terraceRing)?floorZ:gardenGroundAt(p[0],p[1],settings,data);
  const program=gardenProgram(settings,data),pool=poolBounds(settings,data),tub=jacuzziBounds(settings,data);
  const stairs=terraceStairs({...terrace,y:rear},depth,drop,settings,data);
  const obstacles=[data.site.house.footprint,rectangle(tub.x0,tub.y0,tub.x1-tub.x0,tub.y1-tub.y0)];
  if(data.site.garage&&!settings.removeGarage)obstacles.push(data.site.garage.footprint);
  if(pool)obstacles.push(rectCorners(pool,pool.coping+.12));
  if(stairs.count)obstacles.push(rectCorners(stairs,.12));
  if(program.sauna){
    obstacles.push(program.sauna.footprint,...(program.sauna.entrySteps||[]).map(s=>s.footprint));
    obstacles.push(program.firepit.outerFootprint||program.firepit.footprint);
    obstacles.push(rectCorners(program.coldPlunge,program.coldPlunge.pad??.18));
    for(const step of program.coldPlunge.steps||[])obstacles.push(rectCorners(step));
  }
  const trunks=(settings.screeningTrees||[]).filter(t=>t.enabled!==false&&Number.isFinite(t.x)&&Number.isFinite(t.y));
  const clear=(p,radius=.15)=>pointInPolygon(p,boundary)&&edgeDistance(p,boundary)>=radius
    &&!obstacles.some(ring=>pointInPolygon(p,ring)||edgeDistance(p,ring)<radius)
    &&!trunks.some(t=>distance(p,[t.x,t.y])<.32+radius);
  const clearLine=(a,b,radius=.08)=>{
    const steps=Math.max(1,Math.ceil(distance(a,b)/.2));
    for(let i=0;i<=steps;i++)if(!clear([mix(a[0],b[0],i/steps),mix(a[1],b[1],i/steps)],radius))return false;
    return true;
  };

  // A short, freestanding frame over the dining setting. Try the longer axis
  // first, then the other axis; a collision omits the frame instead of shifting
  // the garden's pool, furniture, stairs or mapped house.
  const furniture=gardenFurniture(data,settings),dining=furniture.dining;
  if(dining&&furniture.diningVisible!==false&&(!data.site.garage||settings.removeGarage!==false)){
    const centre=[dining.x+dining.width/2,dining.y+dining.length/2];
    const axes=dining.rotation?[1,0]:dining.width>=dining.length?[0,1]:[1,0];
    for(const axis of axes){
      const span=(axis===0?dining.width:dining.length)+.32;
      const a=[...centre],b=[...centre];a[axis]-=span/2;b[axis]+=span/2;
      const offsets=resort?.pendantCount===2?[-.50,.50]:[-.72,0,.72];
      const shadePoints=offsets.map(offset=>{const p=[...centre];p[axis]+=offset;return p;});
      if(!clear(a,.16)||!clear(b,.16)||!clearLine(a,b,.08)
        ||shadePoints.some((p,i)=>!clear(p,[.25,.30,.22][i]+.06)))continue;
      const surfaceSamples=Array.from({length:11},(_,i)=>surfaceAt([mix(a[0],b[0],i/10),mix(a[1],b[1],i/10)]));
      const frameZ=Math.max(...surfaceSamples)+3.12;
      const supportIds=['garden-pendant-post-1','garden-pendant-post-2'];
      for(const [i,p] of [a,b].entries())result.supports.push({id:supportIds[i],zone:'garden',x:p[0],y:p[1],baseZ:surfaceAt(p),topZ:frameZ});
      const points=Array.from({length:9},(_,i)=>{
        const t=i/8;return [mix(a[0],b[0],t),mix(a[1],b[1],t),frameZ-.045*Math.sin(Math.PI*t)];
      });
      result.cables.push({id:'garden-pendant-frame',zone:'garden',kind:'span',points,supportIds});
      for(const [i,offset] of offsets.entries()){
        const p=[...centre];p[axis]+=offset;
        const radius=[.25,.30,.22][i],height=[.36,.42,.33][i],groundZ=surfaceAt(p);
        const z=Math.max(...surfaceSamples)+[2.50,2.64,2.48][i];
        const t=(offset+span/2)/span,hangZ=frameZ-.045*Math.sin(Math.PI*t);
        result.garden.push({id:`garden-pendant-${i+1}`,zone:'garden',x:p[0],y:p[1],z,groundZ,hangZ,radius,height,supportIds});
      }
      break;
    }
  }

  // A small sheltered fitting gives the terrace's coffee table its own pool
  // of light. It hangs from an enabled canopy, never from an unsupported wire.
  if(resort&&settings.canopyEnabled===true){
    const composition=resortTerraceLayout(data,settings,tub,stairs);
    const table=composition.items.find(f=>f.kind==='table');
    if(table){
      const x=table.x+table.width/2,y=table.y+table.length/2;
      const ceiling=floorZ+(settings.terraceCoverType==='balcony'?(settings.firstFloorRise??3)-.25:(settings.canopyHeight??3));
      const coverDepth=Number(settings.canopyDepth)||depth,coverWidth=Number(settings.canopyWidth)||terrace.width;
      const coverX=terrace.x+(terrace.width-coverWidth)/2;
      if(x>coverX+.15&&x<coverX+coverWidth-.15&&y<rear+coverDepth-.20&&ceiling-floorZ>=2.42){
        const height=.27,z=ceiling-.23,heightBottom=z-height/2-floorZ;
        if(heightBottom>=2.1){
          const id='terrace-pendant-1';
          result.garden.push({id,zone:'terrace',x,y,z,groundZ:floorZ,hangZ:ceiling-.02,radius:.17,height,supportIds:[],mountedTo:'terrace-cover'});
        }
      }
    }
  }

  // The actual planted spans already exclude pedestrian/vehicle openings and
  // include each concave cadastral kink. A separate short post/arm per lantern
  // never carries a string across an entrance or around an unseen corner.
  let signedArea=0;
  for(let i=0;i<boundary.length;i++){const a=boundary[i],b=boundary[(i+1)%boundary.length];signedArea+=a[0]*b[1]-b[0]*a[1];}
  const winding=signedArea>=0?1:-1,candidates=[];
  for(const [segmentIndex,segment] of hedgeSegments(settings,data).entries()){
    const {a,b,height,side,groundZone}=segment,length=distance(a,b);
    if(height<2.4||length<1.8)continue;
    const inward=[-(b[1]-a[1])/length*winding,(b[0]-a[0])/length*winding];
    const count=Math.max(1,Math.floor(length/3)),endClearance=.7;
    for(let i=0;i<count;i++){
      const along=endClearance+(length-endClearance*2)*(i+.5)/count;
      const t=along/length,boundaryPoint=[mix(a[0],b[0],t),mix(a[1],b[1],t)];
      const post=boundaryPoint.map((v,j)=>v+inward[j]*.55),p=boundaryPoint.map((v,j)=>v+inward[j]*1.0);
      const radius=.145+(i%3)*.012,height=.29+(i%2)*.025;
      if(!clear(post,.12)||!clear(p,radius+.1)||!clearLine(post,p,.1))continue;
      if(candidates.some(f=>distance([f.x,f.y],p)<1.75))continue;
      const groundZ=surfaceAt(p),baseZ=surfaceAt(post);
      const hedgeTop=hedgeTopAt(...boundaryPoint,side,settings,data,groundZone);
      const hangZ=Math.min(Math.max(groundZ,baseZ)+2.57,hedgeTop-.12),z=hangZ-.16-height/2;
      if(z-groundZ<2.0||hangZ-baseZ<2.2)continue;
      candidates.push({id:`hedge-pendant-${segmentIndex+1}-${i+1}`,zone:'hedge',side,segmentIndex,boundaryPoint,inward,
        x:p[0],y:p[1],z,groundZ,hangZ,radius,height,post,baseZ});
    }
  }
  // If a long perimeter has more than 24 candidates, sample the whole circuit
  // evenly so the cap does not leave one physical side permanently unlit.
  const cap=resort?.hedgeCount??24;
  const selected=candidates.length<=cap?candidates:Array.from({length:cap},(_,i)=>candidates[Math.floor((i+.5)*candidates.length/cap)]);
  for(const candidate of selected){
    const {post,baseZ,...fixture}=candidate,supportId=`${fixture.id}-post`;
    fixture.supportIds=[supportId];result.hedge.push(fixture);
    result.supports.push({id:supportId,zone:'hedge',x:post[0],y:post[1],baseZ,topZ:fixture.hangZ});
    result.cables.push({id:`${fixture.id}-arm`,zone:'hedge',kind:'arm',supportIds:[supportId],
      points:[[post[0],post[1],fixture.hangZ],[fixture.x,fixture.y,fixture.hangZ]]});
  }
  return result;
}
