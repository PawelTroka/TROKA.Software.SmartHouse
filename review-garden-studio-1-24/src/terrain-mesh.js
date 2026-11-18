import * as THREE from '../vendor/three.module.js';
import { toWorld } from './orientation.js?v=1.24.0';

// Terrain is a continuous surface. Share exactly equal plan coordinates whilst
// preserving clipped intersections, triangle winding, physical UVs and heights.
export function terrainVertexBuffer(heightAt, vertexColors = false) {
  const positions = [], uvs = [], colors = [], indices = [], rows = new Map();
  const baseColor = new THREE.Color('#91a36c');
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
          const variation = .92 + .08 * Math.sin(x * 2.31 + y * 1.27) * Math.cos(y * .63);
          colors.push(baseColor.r * variation, baseColor.g * variation, baseColor.b * variation);
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
