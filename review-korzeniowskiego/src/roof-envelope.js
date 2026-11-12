/**
 * A local wall/roof-edge envelope inferred from roof-class LiDAR returns.
 *
 * LoD1 supplies one median roof height, not surveyed eaves. Sampling the mapped
 * boundary every 0.75 m and interpolating nearby returns avoids imposing the
 * lowest porch/projection return on the entire building. Neighbours separated
 * from the nearest return by >1.5 m vertically belong to a different local
 * roof level and do not get averaged into it. This preserves lower projections.
 *
 * These are bounded local estimates, not a fitted architectural/LoD2 model:
 * returns may lie up a roof slope, gaps and isolated returns remain uncertain,
 * and transitions between roof levels are piecewise linear. Raw roof returns
 * remain in the roof mesh. The exact same boundary drives rendering and shade.
 */
const cache=new WeakMap();
const xyz=p=>Array.isArray(p)?p:[p.x,p.y,p.z];
const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
const openRing=ring=>ring?.length>1&&Math.hypot(ring[0][0]-ring.at(-1)[0],ring[0][1]-ring.at(-1)[1])<1e-8?ring.slice(0,-1):ring||[];

/** Piecewise-linear height at a fraction of one original footprint edge. */
export function roofEdgeHeight(edge,fraction){
  const t=Math.max(0,Math.min(1,fraction))*(edge.points.length-1);
  const i=Math.min(edge.points.length-2,Math.floor(t)),weight=t-i;
  return edge.points[i][2]*(1-weight)+edge.points[i+1][2]*weight;
}

/** Source-elevation envelope; independent of the proposed floor or garden fill. */
export function localRoofEnvelope(building){
  const cached=cache.get(building);if(cached)return cached;
  const ring=openRing(building.footprint).map(p=>p.slice(0,2));
  const samples=(building.roofPoints||[]).map(xyz).filter(p=>p.length>=3&&p.slice(0,3).every(Number.isFinite)).map(p=>p.slice(0,3));
  const base=finite(building.baseZ,0),fallback=finite(building.roofZ,base+7);
  const heightAt=(x,y)=>{
    if(!samples.length)return fallback;
    const nearest=samples.map(p=>({p,d:Math.hypot(p[0]-x,p[1]-y)})).sort((a,b)=>a.d-b.d);
    const anchor=nearest[0],radius=anchor.d+.8;
    const local=nearest.filter(q=>q.d<=radius&&Math.abs(q.p[2]-anchor.p[2])<=1.5).slice(0,4);
    let weighted=0,total=0;
    for(const q of local){const w=1/Math.max(.05,q.d)**2;weighted+=w*q.p[2];total+=w;}
    return Math.max(base+.1,weighted/total);
  };
  // Calculate each corner once so adjacent facades and the roof share it exactly.
  const corners=ring.map(p=>[...p,heightAt(...p)]),edges=[],boundary=[],wallFaces=[];
  for(let i=0;i<ring.length;i++){
    const a=corners[i],b=corners[(i+1)%ring.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const count=Math.max(1,Math.ceil(length/.75)),points=[];
    for(let j=0;j<=count;j++){
      const t=j/count,x=a[0]+t*(b[0]-a[0]),y=a[1]+t*(b[1]-a[1]);
      points.push(j===0?a:j===count?b:[x,y,heightAt(x,y)]);
    }
    edges.push({index:i,length,points});boundary.push(...points.slice(0,-1));
    for(let j=0;j<points.length-1;j++){
      const p=points[j],q=points[j+1],p0=[p[0],p[1],base],q0=[q[0],q[1],base];
      wallFaces.push([p0,q0,q],[p0,q,p]);
    }
  }
  const envelope={ring,samples,base,fallback,edges,boundary,wallFaces};
  cache.set(building,envelope);return envelope;
}
