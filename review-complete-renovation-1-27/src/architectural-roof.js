/** The archived 30° roof, in the same registered frame as the floor plans.
 * Main ridge/ceiling are documented. The short bay gable is reconstructed
 * from the front elevation and remains an explicit survey item. */
const EPS=1e-8,value=(plane,p)=>plane[0]*p[0]+plane[1]*p[1]+plane[2];
function clip(poly,line,positive){
  const out=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],da=value(line,a)*(positive?1:-1),db=value(line,b)*(positive?1:-1);
    if(da>=-EPS)out.push(a);
    if(da*db<-EPS){const t=da/(da-db);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
  }
  return out;
}
const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0))/2;
export function architecturalRoofEnvelope(house){
  const model=house.architecturalModel,{origin,ex,ey,floorZ,atticRise=5.75}=model;
  const toSite=(x,z,h)=>[origin[0]-ex[0]*x-ey[0]*z,origin[1]-ex[1]*x-ey[1]*z,floorZ+h];
  const local=(x,y)=>{const dx=x-origin[0],dy=y-origin[1];return[-dx*ex[0]-dy*ex[1],-dx*ey[0]-dy*ey[1]];};
  const slope=Math.tan(Math.PI/6),ridge=atticRise+3,crossRidge=atticRise+1.5;
  const planes=[[0,slope,ridge-4.5*slope],[0,-slope,ridge+4.5*slope],[.8,0,crossRidge-.8*5.385],[-.8,0,crossRidge+.8*5.385]];
  const choose=p=>{const main=value(planes[0],p)<value(planes[1],p)?planes[0]:planes[1];
    const cross=[planes[0],planes[2],planes[3]].reduce((a,b)=>value(a,p)<value(b,p)?a:b);return value(main,p)>value(cross,p)?main:cross;};
  const heightLocal=(x,z)=>value(choose([x,z]),[x,z]);
  const lines=[];for(let i=0;i<planes.length;i++)for(let j=i+1;j<planes.length;j++)lines.push(planes[i].map((v,k)=>v-planes[j][k]));
  let pieces=[[[0,0],[10.77,0],[10.77,9],[0,9]],[[3.51,9],[7.26,9],[7.26,10.68],[3.51,10.68]]];
  for(const line of lines)pieces=pieces.flatMap(p=>[clip(p,line,true),clip(p,line,false)].filter(p=>p.length>=3&&area(p)>EPS));
  const surfaceFaces=[];
  for(const p of pieces){const mid=p.reduce((s,v)=>[s[0]+v[0]/p.length,s[1]+v[1]/p.length],[0,0]),plane=choose(mid),v=p.map(p=>toSite(...p,value(plane,p)));
    for(let i=1;i<v.length-1;i++)surfaceFaces.push([v[0],v[i],v[i+1]]);}
  const localRing=[[0,0],[10.77,0],[10.77,9],[7.26,9],[7.26,10.68],[3.51,10.68],[3.51,9],[0,9]];
  const ring=localRing.map(p=>toSite(...p,0).slice(0,2)),boundary=[],wallFaces=[],gableFaces=[],edges=[];
  for(let i=0;i<ring.length;i++){
    const a=localRing[i],b=localRing[(i+1)%ring.length],fractions=[0,1],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    for(const line of lines){const da=value(line,a),db=value(line,b);if(da*db<-EPS)fractions.push(da/(da-db));}
    const unique=[...new Set(fractions.map(t=>t.toFixed(10)))].map(Number).sort((a,b)=>a-b);
    const points=unique.map(t=>{const x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;return toSite(x,z,heightLocal(x,z));});
    edges.push({index:i,length,fractions:unique,points});boundary.push(...points.slice(0,-1));
    for(let j=0;j<points.length-1;j++){
      const p=points[j],q=points[j+1],p0=[p[0],p[1],house.baseZ],q0=[q[0],q[1],house.baseZ];wallFaces.push([p0,q0,q],[p0,q,p]);
      const low=floorZ+atticRise,pa=[p[0],p[1],low],qa=[q[0],q[1],low];gableFaces.push([pa,qa,q],[pa,q,p]);
    }
  }
  const chimneys=[{id:'west',x0:4.18,z0:4.91,width:.39,depth:.94},{id:'east',x0:6.86,z0:4.89,width:1.22,depth:.34}].map(c=>{
    const localFoot=[[c.x0,c.z0],[c.x0+c.width,c.z0],[c.x0+c.width,c.z0+c.depth],[c.x0,c.z0+c.depth]],footprint=localFoot.map(p=>toSite(...p,0).slice(0,2));
    const baseZ=floorZ+Math.min(...localFoot.map(p=>heightLocal(...p)))-.03,topZ=floorZ+atticRise+3.85,faces=[];
    for(let i=0;i<4;i++){const a=footprint[i],b=footprint[(i+1)%4];faces.push([[...a,baseZ],[...b,baseZ],[...b,topZ]],[[...a,baseZ],[...b,topZ],[...a,topZ]]);}
    faces.push([[...footprint[0],topZ],[...footprint[1],topZ],[...footprint[2],topZ]],[[...footprint[0],topZ],[...footprint[2],topZ],[...footprint[3],topZ]]);
    return{...c,footprint,baseZ,topZ,faces};
  });
  const heightAt=(x,y)=>floorZ+heightLocal(...local(x,y));
  return{ring,planes,edges,boundary,wallFaces,gableFaces,surfaceFaces,chimneys,roofFaces:[...surfaceFaces,...chimneys.flatMap(c=>c.faces)],
    heightAt,sourceHeightAt:heightAt,heightLocal,eavesZ:Math.min(...boundary.map(p=>p[2])),ridgeZ:floorZ+ridge,topZ:floorZ+atticRise+3.85,
    provenance:{main:'Archived section: 30° main roof, 3.00 m above the attic datum. Registered to the shared floor plans without scaling.',
      crossGable:'Front bay roof reconstructed from the archived elevation; the current photograph differs and requires an as-built survey.',
      chimneys:'Positions follow the two retained flue cores through all floors; top level follows the archived section.'}};
}
