import * as THREE from '../vendor/three.module.js';

/** Index only the static foliage builders' exact repeated vertex tuples.
 * No tolerance, averaging, triangle reordering or material change is involved.
 * Return a separate geometry: hedge clipping still needs its original expanded
 * triangle stream to construct other variants of the same specimen.
 */
export function indexExactFoliageGeometry(geometry){
  const sizes={position:3,normal:3,uv:2,color:3},names=Object.keys(sizes);
  if(!geometry?.isBufferGeometry||geometry.index||geometry.isInstancedBufferGeometry||
    geometry.userData.requiresStableVertexId||Object.keys(geometry.morphAttributes).length||
    Object.keys(geometry.attributes).length!==names.length)return geometry;
  const count=geometry.attributes.position?.count;
  if(!count||count%3||names.some(name=>{
    const a=geometry.attributes[name];
    return !a?.isBufferAttribute||a.isInterleavedBufferAttribute||a.isInstancedBufferAttribute||
      !(a.array instanceof Float32Array)||a.itemSize!==sizes[name]||a.count!==count;
  }))return geometry;
  const streams=names.map(name=>{
    const attribute=geometry.attributes[name],array=attribute.array;
    return {name,attribute,bytes:new Uint8Array(array.buffer,array.byteOffset,array.byteLength),stride:attribute.itemSize*4};
  });
  const buckets=new Map(),sources=[],indices=new Uint32Array(count);
  const equal=(a,b)=>streams.every(({bytes,stride})=>{
    const x=a*stride,y=b*stride;
    for(let j=0;j<stride;j++)if(bytes[x+j]!==bytes[y+j])return false;
    return true;
  });
  for(let i=0;i<count;i++){
    let hash=2166136261;
    for(const {bytes,stride} of streams){
      const start=i*stride;
      for(let j=0;j<stride;j++)hash=Math.imul(hash^bytes[start+j],16777619);
    }
    const bucket=buckets.get(hash)||[];
    let index=bucket.find(index=>equal(i,sources[index]));
    if(index===undefined){index=sources.length;sources.push(i);bucket.push(index);buckets.set(hash,bucket);}
    indices[i]=index;
  }
  if(sources.length===count)return geometry;
  const result=geometry.clone();
  for(const {name,attribute,bytes,stride} of streams){
    const array=new Float32Array(sources.length*attribute.itemSize),target=new Uint8Array(array.buffer);
    for(let i=0;i<sources.length;i++)target.set(bytes.subarray(sources[i]*stride,(sources[i]+1)*stride),i*stride);
    // clone retains normalization, usage, GPU type and attribute metadata;
    // byte copies retain signed zero and even distinct NaN payloads exactly.
    const copy=attribute.clone();copy.array=array;copy.count=sources.length;
    result.setAttribute(name,copy);
  }
  // 65535 is the fixed primitive-restart index in WebGL2, so it requires a
  // 32-bit element array, as in Three's arrayNeedsUint32 helper.
  result.setIndex(new THREE.BufferAttribute(sources.length>65535?indices:new Uint16Array(indices),1));
  return result;
}
