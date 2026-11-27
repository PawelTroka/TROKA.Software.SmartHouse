import * as THREE from '../vendor/three.module.js';
import { toWorld } from './orientation.js?v=1.39.0';
import {pointInPolygon} from './geometry.js?v=1.39.0';
import {subtractGarageOpenings} from './scene-garage.js?v=1.39.0';

// Terrain is a continuous surface. Share exactly equal plan coordinates whilst
// preserving clipped intersections, triangle winding, physical UVs and heights.
export function terrainVertexBuffer(heightAt, vertexColors = false) {
  const positions = [], uvs = [], colors = [], indices = [], rows = new Map();
  return {
    add(x, y) {
      let row = rows.get(y);
      if (!row) rows.set(y, row = new Map());
      let index = row.get(x);
      if (index === undefined) {
        index = positions.length / 3;
        row.set(x, index);
        positions.push(...toWorld(x, y, heightAt(x, y)));
        uvs.push(x / 2.5, y / 2.5);
        if (vertexColors) {
          // The photographic material owns the actual grass colour. Vertices
          // add only broad, subtle variation across the continuous terrain.
          const variation = .96 + .04 * Math.sin(x * .31 + y * .27) * Math.cos(y * .13);
          colors.push(variation, variation, variation);
        }
      }
      indices.push(index);
    },
    finish() {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      if (vertexColors) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      return geometry;
    }
  };
}

const xyCross = (a,b,p) => (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
const extent = points => ({
  left:Math.min(...points.map(p=>p[0])),right:Math.max(...points.map(p=>p[0])),
  bottom:Math.min(...points.map(p=>p[1])),top:Math.max(...points.map(p=>p[1]))
});
const disjoint = (a,b) => a.right<b.left || a.left>b.right || a.top<b.bottom || a.bottom>b.top;

// Clip a convex grid piece only where a parcel edge actually crosses its cell.
// Triangulating the cadastral ring once also handles Nadmorska's concave notch.
export function parcelTerrainClip(ring, contains) {
  const outline=ring.map(p=>new THREE.Vector2(...p));
  const faces=THREE.ShapeUtils.triangulateShape(outline,[]).map(indices=>{
    const [a,b,c]=indices.map(i=>ring[i]);
    const points=xyCross(a,b,c)>0?[a,b,c]:[a,c,b];
    return {points,bounds:extent(points)};
  });
  const edges=outline.map((v,i)=>{
    const a=ring[i],b=ring[(i+1)%outline.length];
    return {a,b,bounds:extent([a,b])};
  });
  // Segment vs rectangle separating axes. This rejects long, slanted parcel
  // edges that pass beside a cell despite their overlapping bounding boxes.
  const crossesCell=(edge,box)=>{
    if(disjoint(edge.bounds,box))return false;
    const {a,b}=edge, cx=(box.left+box.right)/2,cy=(box.bottom+box.top)/2;
    const radius=Math.abs(b[1]-a[1])*(box.right-box.left)/2+Math.abs(b[0]-a[0])*(box.top-box.bottom)/2;
    return Math.abs(xyCross(a,b,[cx,cy]))<=radius+1e-9;
  };
  return piece=>{
    const bounds=extent(piece);
    if(!edges.some(edge=>crossesCell(edge,bounds)))return contains(piece[0],ring)?[piece]:[];
    const output=[];
    for(const face of faces){
      if(disjoint(face.bounds,bounds))continue;
      let polygon=piece;
      for(let k=0;k<3&&polygon.length;k++){
        const a=face.points[k],b=face.points[(k+1)%3],next=[];
        for(let i=0;i<polygon.length;i++){
          const p=polygon[i],q=polygon[(i+1)%polygon.length],dp=xyCross(a,b,p),dq=xyCross(a,b,q);
          if(dp>=-1e-9)next.push(p);
          if((dp>1e-9&&dq< -1e-9)||(dp< -1e-9&&dq>1e-9)){
            const t=dp/(dp-dq);
            next.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);
          }
        }
        polygon=next;
      }
      if(polygon.length>=3)output.push(polygon);
    }
    return output;
  };
}

/** The shared surface builder for the lawn, local ground and context terrain.
 * Openings are subtracted before triangulation, including skew house walls;
 * sampling a triangle centre would leave ground wedges inside the basement. */
export function terrainSurfaceGeometry(bounds,step,heightAt,{boundary=null,clipBoundary=true,vertexColors=false,cutouts=[]}={}){
  const [x0,y0,x1,y1]=bounds,vertices=terrainVertexBuffer(heightAt,vertexColors);
  const axis=(start,end,edges)=>{
    const values=[end];
    for(let p=start;p<end;p+=step)values.push(p);
    values.push(...edges.filter(p=>p>start&&p<end));
    return values.sort((a,b)=>a-b).filter((p,i,all)=>i===0||p-all[i-1]>1e-8);
  };
  const xs=axis(x0,x1,cutouts.flatMap(c=>[c.x0,c.x1])),ys=axis(y0,y1,cutouts.flatMap(c=>[c.y0,c.y1]));
  const clipToParcel=boundary&&clipBoundary?parcelTerrainClip(boundary,pointInPolygon):null;
  const polygonCutouts=cutouts.filter(c=>c.polygon?.length>=3);
  for(let row=0;row<ys.length-1;row++)for(let col=0;col<xs.length-1;col++){
    const x=xs[col],xx=xs[col+1],y=ys[row],yy=ys[row+1];
    if(cutouts.some(c=>!c.polygon&&x>=c.x0-1e-8&&xx<=c.x1+1e-8&&y>=c.y0-1e-8&&yy<=c.y1+1e-8))continue;
    for(const tri of [[[x,y],[xx,y],[xx,yy]],[[x,y],[xx,yy],[x,yy]]]){
      const pieces=polygonCutouts.length?subtractGarageOpenings(tri,polygonCutouts):[tri];
      for(const piece of pieces){
        if(boundary&&!clipBoundary){
          // Mapped road overlays retain their established centroid inclusion;
          // exact boundary clipping belongs to the parcel terrain only.
          const ring=piece.length>1&&Math.hypot(piece[0][0]-piece.at(-1)[0],piece[0][1]-piece.at(-1)[1])<1e-6?piece.slice(0,-1):piece;
          const center=ring.reduce((s,p)=>[s[0]+p[0]/ring.length,s[1]+p[1]/ring.length],[0,0]);
          if(!pointInPolygon(center,boundary))continue;
        }
        for(const clipped of clipToParcel?clipToParcel(piece):[piece]){
        const [a]=clipped;
        for(let i=1;i<clipped.length-1;i++){
          const b=clipped[i],c=clipped[i+1];
          if(Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))<=1e-10)continue;
          for(const p of [a,c,b])vertices.add(...p);
        }
        }
      }
    }
  }
  return vertices.finish();
}
