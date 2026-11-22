/** Existing canopy observations are independent of the user's planting design.
 * The scan locates crowns, not stems or species. Its grouped envelopes provide
 * an optional dense-canopy comparison, never a guaranteed privacy screen. */
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

export function existingFoliageActive(settings = {}, record = {}) {
  if (record.leafType === 'evergreen') return true;
  const mode = settings.existingLeafMode || 'auto';
  if (mode === 'summer') return true;
  if (mode === 'winter') return false;
  const month = Number(String(settings.sunDate || '2026-06-21').slice(5, 7));
  return month >= 5 && month <= 10;
}

export function existingCanopyRecords(data) {
  const source = data?.existingVegetation;
  if (!source || source.siteId !== (data?.site?.id || 'sternicza-11')) return [];
  return (source.canopies || []).filter(record =>
    ['x', 'y', 'baseZ', 'topZ', 'crownBaseZ', 'radiusX', 'radiusY'].every(key => Number.isFinite(record[key])) &&
    record.radiusX > 0 && record.radiusY > 0 && record.topZ > record.crownBaseZ && record.crownBaseZ >= record.baseZ);
}

export function existingCanopyVolumes(settings = {}, data) {
  if (settings.existingVegetation === false || settings.existingCanopyAnalysis === false) return [];
  return existingCanopyRecords(data).map(record => {
    const angle = finite(record.rotation) * Math.PI / 180;
    return {
      id: record.id, sourceKind: 'existing-canopy', typeId: 'lidar-canopy',
      label: record.species ? `Existing ${record.species} canopy` : 'Existing canopy · laser scan',
      x: record.x, y: record.y, groundZ: record.baseZ,
      height: record.topZ-record.baseZ, crownWidth: record.radiusX*2, crownDepth: record.radiusY*2,
      rotation: finite(record.rotation),
      enabled: true, plantable: true, form: 'ellipsoid',
      foliageActive: existingFoliageActive(settings, record),
      crownCenter: [record.x, record.y, (record.crownBaseZ + record.topZ) / 2],
      crownRadii: [record.radiusX, record.radiusY, (record.topZ - record.crownBaseZ) / 2],
      crownBottomZ: record.crownBaseZ, crownTopZ: record.topZ,
      rotationCos: Math.cos(angle), rotationSin: Math.sin(angle), rotationRadians: angle,
      // A canopy centre is not a measured trunk location. Do not award the
      // reconstructed visual stems any screening or winter shade credit.
      trunkRadius: 0, trunkTopZ: record.baseZ,
    };
  });
}

export function existingVegetationSummary(data, settings = {}) {
  const source = data?.existingVegetation, records = existingCanopyRecords(data);
  return {
    available: records.length > 0, count: records.length,
    shown: settings.existingVegetation !== false,
    includedInAnalysis: settings.existingVegetation !== false && settings.existingCanopyAnalysis !== false,
    leafOnCount: records.filter(record => existingFoliageActive(settings, record)).length,
    acquisition: source?.selection?.acquired || source?.sources?.[0]?.acquired || '2024 scan',
    maxHeight: records.length ? Math.max(...records.map(record => record.topZ - record.baseZ)) : 0,
    note: 'Measured canopy locations and heights; grouped crowns can contain more than one tree. Branches and stems are reconstructed. Species are unknown unless linked to a municipal inventory record. Dense leaf-on envelopes approximate shade and screening; leaf-off envelopes receive no opaque-foliage credit.',
  };
}
