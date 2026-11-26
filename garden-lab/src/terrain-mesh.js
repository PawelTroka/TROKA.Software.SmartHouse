import * as THREE from '../vendor/three.module.js';
import { toWorld } from './orientation.js?v=1.34.0';

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
