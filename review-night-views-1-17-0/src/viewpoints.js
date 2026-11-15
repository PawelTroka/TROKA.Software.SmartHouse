/**
 * Upper-room outlooks are concept window-plane viewpoints. The house footprint
 * is mapped; window positions and floor-to-floor rises have not been surveyed.
 * Keep this catalogue shared by state, controls, and the numerical observer.
 */
export const UPPER_FLOOR_PRESETS = Object.freeze([
  ...['first', 'attic'].flatMap(level => ['garden', 'street'].flatMap(facing =>
    ['seated', 'standing'].map(posture => Object.freeze({
      id: `${level}-${facing}-${posture}`,
      label: `${level === 'first' ? 'First floor · bedroom / office' : 'Second floor · strych'} · ${facing} · ${posture}`,
      level,
      floorLevel: level === 'first' ? 1 : 2,
      facing,
      posture,
      eyeHeight: posture === 'seated' ? 1.2 : 1.65,
      defaultLookYaw: facing === 'garden' ? 0 : 180,
      defaultLookPitch: -6,
    }))))
]);

export const upperFloorPreset = id => UPPER_FLOOR_PRESETS.find(preset => preset.id === id);

/**
 * Intersect the centreline with the actual house footprint instead of its
 * bounding rectangle: the second property has a stepped, rotated frontage.
 * A 25 cm outward clearance avoids unmodelled opaque room walls and decorative
 * window panes. Rendering and visibility analysis use this same position.
 */
export function upperFloorWindowPosition(facing, data) {
  const ring = data.site.house.footprint;
  const xs = ring.map(point => point[0]);
  const x = (Math.min(...xs) + Math.max(...xs)) / 2;
  const intersections = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], dx = b[0] - a[0];
    if (Math.abs(dx) < 1e-9) {
      if (Math.abs(x - a[0]) < 1e-9) intersections.push(a[1], b[1]);
      continue;
    }
    const t = (x - a[0]) / dx;
    if (t >= 0 && t <= 1) intersections.push(a[1] + t * (b[1] - a[1]));
  }
  if (!intersections.length) throw new Error('Upper-floor views require a valid mapped house footprint.');
  const facadeY = facing === 'street' ? Math.min(...intersections) : Math.max(...intersections);
  const facadeOffset = .25;
  return {
    x,
    y: facadeY + (facing === 'street' ? -facadeOffset : facadeOffset),
    facadePosition: {x, y: facadeY},
    facadeOffset,
  };
}
