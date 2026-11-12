/**
 * The mapped site frame is left-handed: +x runs ESE along the frontage,
 * +y runs SSW into the rear garden, and +z is elevation. Three's world frame
 * is right-handed, so exchanging depth/elevation is required; negating depth
 * as well would mirror the neighbourhood. Source map coordinates stay intact.
 */
export const toWorld = (x, y, z) => [x, z, y];
export const fromWorld = (x, y, z) => [x, z, y];

/** Positive yaw turns right from the house-facing rear-garden direction. */
export function gazeDirection(yawDegrees, pitchDegrees = 0) {
  const yaw = yawDegrees * Math.PI / 180, pitch = pitchDegrees * Math.PI / 180;
  return [-Math.sin(yaw) * Math.cos(pitch), Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch)];
}

/** Preserve outward/upward normals when converting a local triangle. */
export const toWorldTriangle = (a, b, c) => [toWorld(...a), toWorld(...c), toWorld(...b)];

/** Delaunay roof sources may use either winding; their exposed face is up. */
export function toWorldRoofTriangle(a, b, c) {
  const signedArea = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return signedArea < 0 ? toWorldTriangle(a, c, b) : toWorldTriangle(a, b, c);
}
