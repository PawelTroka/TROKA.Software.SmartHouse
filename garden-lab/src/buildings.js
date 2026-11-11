/**
 * Optional sensitivity scenarios for the surrounding apartment blocks.
 * The mapped data remains the immutable reference. Distances use the house's
 * rear-wall midpoint and the footprint area centroid, never the movable eye.
 */
export const BUILDING_TARGETS = Object.freeze([
  { index: 9, label: 'PCK 3' },
  { index: 15, label: 'West apartment block' },
  { index: 29, label: 'East apartment block' },
  { index: 31, label: 'Farther central block' },
  { index: 53, label: 'Central block continuation' },
].map(b => Object.freeze({ ...b, id: `building-${b.index}`,
  heightKey: `b${b.index}HeightDelta`, distanceKey: `b${b.index}DistanceDelta` })));

export const BUILDING_FIELDS = Object.freeze(Object.fromEntries(BUILDING_TARGETS.flatMap(b => [
  [b.heightKey, Object.freeze({ label: `${b.label} height adjustment`, min: -10, max: 15, step: .1, value: 0, group: 'building', unit: 'm' })],
  [b.distanceKey, Object.freeze({ label: `${b.label} distance adjustment`, min: -15, max: 40, step: .1, value: 0, group: 'building', unit: 'm' })],
])));

const finite = (value, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const sourceFor = new WeakMap();
const cache = new WeakMap();

/** Area-weighted plan centroid. A closed final vertex is optional. */
export function footprintCentroid(polygon) {
  if (!polygon?.length) return [0, 0];
  let sum = 0, x = 0, y = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const cross = a[0] * b[1] - b[0] * a[1];
    sum += cross; x += (a[0] + b[0]) * cross; y += (a[1] + b[1]) * cross;
  }
  if (Math.abs(sum) > 1e-9) return [x / (3 * sum), y / (3 * sum)];
  const open = polygon.length > 1 && polygon[0][0] === polygon.at(-1)[0] && polygon[0][1] === polygon.at(-1)[1]
    ? polygon.slice(0, -1) : polygon;
  return open.reduce((s, p) => [s[0] + p[0] / open.length, s[1] + p[1] / open.length], [0, 0]);
}

function baselineOf(data) { return sourceFor.get(data) || data; }

/** Values ready for a compact UI readout, all heights above the fixed block base. */
export function buildingAssumptions(input, settings = {}) {
  const data = baselineOf(input), reference = data.site.rearMidpoint;
  return BUILDING_TARGETS.map(target => {
    const block = data.buildings.find(b => b.id === target.id);
    if (!block) return null;
    const center = footprintCentroid(block.footprint);
    const baselineHeight = finite(block.roofTopZ, block.roofZ) - block.baseZ;
    const baselineDistance = Math.hypot(center[0] - reference[0], center[1] - reference[1]);
    const heightDelta = clamp(finite(settings[target.heightKey]),
      Math.max(BUILDING_FIELDS[target.heightKey].min, 2 - baselineHeight), BUILDING_FIELDS[target.heightKey].max);
    const distanceDelta = clamp(finite(settings[target.distanceKey]),
      Math.max(BUILDING_FIELDS[target.distanceKey].min, 5 - baselineDistance), BUILDING_FIELDS[target.distanceKey].max);
    return { ...target, baseZ: block.baseZ, center, reference: [...reference],
      baselineHeight, height: baselineHeight + heightDelta, heightDelta,
      baselineDistance, distance: baselineDistance + distanceDelta, distanceDelta,
      scaleZ: (baselineHeight + heightDelta) / baselineHeight,
      active: heightDelta !== 0 || distanceDelta !== 0 };
  }).filter(Boolean);
}

/**
 * Height changes scale every elevation above the fixed building base, including
 * facade samples and optional tall features. Plan changes translate the complete
 * building along a fixed radial bearing; the footprint shape never changes.
 * Zero adjustments return the original object, including its exact coordinates.
 */
export function applyBuildingOverrides(input, settings = {}) {
  const data = baselineOf(input), assumptions = buildingAssumptions(data, settings);
  const signature = assumptions.map(b => `${b.index}:${b.heightDelta}:${b.distanceDelta}`).join('|');
  if (!assumptions.some(b => b.active)) return data;
  const previous = cache.get(data);
  if (previous?.signature === signature) return previous.result;
  const byId = new Map(assumptions.map(b => [b.id, b]));
  const buildings = data.buildings.map(block => {
    const adjustment = byId.get(block.id);
    if (!adjustment?.active) return block;
    const { center, reference, baselineDistance, distanceDelta, scaleZ } = adjustment;
    const dx = baselineDistance > 0 ? (center[0] - reference[0]) / baselineDistance * distanceDelta : 0;
    const dy = baselineDistance > 0 ? (center[1] - reference[1]) / baselineDistance * distanceDelta : 0;
    const z = value => block.baseZ + (value - block.baseZ) * scaleZ;
    const transform = p => [p[0] + dx, p[1] + dy, z(p[2])];
    return { ...block,
      footprint: block.footprint.map(p => [p[0] + dx, p[1] + dy]),
      roofZ: z(block.roofZ), roofTopZ: z(block.roofTopZ ?? block.roofZ),
      samples: (block.samples || []).map(transform),
      roofPoints: (block.roofPoints || []).map(transform),
      highFeatures: (block.highFeatures || []).map(transform),
      adjustment: { heightDelta: adjustment.heightDelta, distanceDelta, scaleZ, dx, dy },
    };
  });
  const result = { ...data, buildings, buildingOverrides: assumptions.filter(b => b.active), buildingOverrideSignature: signature };
  sourceFor.set(result, data);
  cache.set(data, { signature, result });
  return result;
}
