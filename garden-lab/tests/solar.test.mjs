import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  epsg2180ToGeographic, siteLocation, solarPosition, localSunDirection,
  resolveWarsawTime, getSolarState, sunlightAtPoint, sunlightSamplePoints,
  analyzeSunlight, dailySunlight,
} from '../src/solar.js';

const data = JSON.parse(fs.readFileSync(new URL('../data/site-data.json', import.meta.url), 'utf8'));
const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) <= tolerance, `${a} differs from ${b} by more than ${tolerance}`);
const defaultDesign = { hedgeRear: 4, hedgeLeft: 4, hedgeRight: 4, hedgeInset: .5, gardenRaise: .5, bedRaise: 0,
  floorHeight: 1.2, terraceDepth: 4.2, raiseNewHedges: true, removeGarage: true, canopyEnabled: false };
const noHedges = { ...defaultDesign, hedgeRear: 0, hedgeLeft: 0, hedgeRight: 0, hedgeInset: 0, gardenRaise: 0, floorHeight: 0 };
const rectangle = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
function fixture() {
  const origin = [476064.831756033, 726902.760579949];
  return {
    coordinates: { localOriginEN: origin, xUnitEN: [1, 0], yUnitEN: [0, 1] },
    site: {
      boundary: rectangle(0, 0, 20, 40), boundaryNames: ['street', 'east-front', 'rear', 'west-front'],
      rearMidpoint: [10, 12], floorReference: { z: 0 }, terrace: { x: 6, y: 12, width: 8, depth: 4.2 },
      pool: { x: 4, y: 25, width: 3, length: 6 },
      house: { id: 'house', label: 'House', footprint: rectangle(8, 8, 12, 12), baseZ: 0, roofZ: 10, roofTopZ: 10 },
      garage: { id: 'garage', label: 'Garage', footprint: rectangle(2, 17, 5, 20), baseZ: 0, roofZ: 5, roofTopZ: 5 },
    },
    buildings: [],
    terrain: { originEN: [origin[0] - 1000, origin[1] - 1000], cellSize: 1000, columns: 3, rows: 3, elevations: Array(9).fill(0) },
  };
}
const artificialSun = (x, y, z) => {
  const length = Math.hypot(x, y, z);
  return { valid: true, daylight: z > 0, elevationDeg: Math.asin(z / length) * 180 / Math.PI,
    directionLocal: { x: x / length, y: y / length, z: z / length } };
};

test('mapped origin matches independent PROJ EPSG:2180 conversion and north convergence', () => {
  // Independently generated with PROJ/pyproj Transformer(always_xy=True) and
  // Proj.get_factors; coordinate axis order is explicitly easting,northing.
  const location = siteLocation(data);
  near(location.latitude, 54.405590901026194, 2e-8);
  near(location.longitude, 18.631148563169617, 2e-8);
  near(location.gridNorthBearingDeg, -0.29993574791101585, 2e-7);
  assert.throws(() => epsg2180ToGeographic(NaN, 1), TypeError);
});

test('solar angles agree with the independent published NREL SPA reference example', () => {
  // NREL spa_tester.c: 2003-10-17 12:30:30 MST, 39.742476N,105.1786W.
  // SPA apparent zenith=50.111622°, azimuth=194.340241°. Our geometric
  // elevation intentionally omits refraction/topocentric corrections (~0.02°).
  // https://midcdmz.nlr.gov/spa/spa_tester.c
  const p = solarPosition('2003-10-17T19:30:30Z', 39.742476, -105.1786);
  near(p.azimuthDeg, 194.340241, .01);
  near(p.elevationDeg, 90 - 50.111622, .04);
});

test('Warsaw civil time applies winter and summer offsets independently of host timezone', () => {
  assert.equal(resolveWarsawTime('2026-01-15', 780).instant, '2026-01-15T12:00:00.000Z');
  assert.equal(resolveWarsawTime('2026-06-21', 780).instant, '2026-06-21T11:00:00.000Z');
  assert.equal(resolveWarsawTime('2026-06-21', 780).timeLabel, '13:00 CEST');
});

test('spring DST gap is rejected and autumn fold deliberately chooses its first occurrence', () => {
  const gap = resolveWarsawTime('2026-03-29', 150);
  assert.equal(gap.valid, false); assert.match(gap.warning, /does not exist/);
  assert.equal(resolveWarsawTime('2026-03-29', 180).instant, '2026-03-29T01:00:00.000Z');
  const fold = resolveWarsawTime('2026-10-25', 150);
  assert.equal(fold.valid, true); assert.equal(fold.ambiguous, true);
  assert.equal(fold.instant, '2026-10-25T00:30:00.000Z');
  assert.match(fold.warning, /first occurrence/);
});

test('invalid dates and nonrepresentable time values never silently roll into another day', () => {
  for (const date of ['2026-02-29', '2026-02-31', '2026-13-01', '2026-6-01', '1999-12-31', '2101-01-01']) {
    assert.equal(resolveWarsawTime(date, 720).valid, false, date);
  }
  assert.equal(resolveWarsawTime('2028-02-29', 720).valid, true);
  for (const minute of [-1, 1440, NaN, Infinity, 720.5, '720']) assert.equal(resolveWarsawTime('2026-06-21', minute).valid, false);
  const gap = getSolarState('2026-03-29', 150, data);
  assert.equal(gap.valid, false); assert.equal(gap.daylight, false); assert.equal(gap.elevationDeg, null);
});

test('solar vector is unit length and transforms true north through projection convergence', () => {
  const loc = siteLocation(data), azimuth = 90, elevation = 30;
  const direction = localSunDirection(azimuth, elevation, data);
  near(Math.hypot(direction.x, direction.y, direction.z), 1);
  near(direction.z, .5);
  const { xUnitEN: ux, yUnitEN: uy } = data.coordinates;
  const gridE = direction.x * ux[0] + direction.y * uy[0], gridN = direction.x * ux[1] + direction.y * uy[1];
  near(Math.atan2(gridE, gridN) * 180 / Math.PI + loc.gridNorthBearingDeg, azimuth);
  // The rear garden faces south-southwest in this mapped site frame.
  assert.ok(localSunDirection(180, 30, data).y > 0);
});

test('Gdansk seasonal elevation and astronomical day length change plausibly', () => {
  const summer = getSolarState('2026-06-21', 780, data), winter = getSolarState('2026-12-21', 720, data);
  assert.ok(summer.elevationDeg > 58 && summer.elevationDeg < 60);
  assert.ok(winter.elevationDeg > 11 && winter.elevationDeg < 13);
  assert.ok(summer.daylightHours > 17 && summer.daylightHours < 17.5);
  assert.ok(winter.daylightHours > 7 && winter.daylightHours < 7.5);
  assert.match(summer.sunrise, /^04:/); assert.match(summer.sunset, /^21:/);
  assert.equal(getSolarState('2026-06-21', 0, data).daylight, false);
});

test('house is an explicit sunlight blocker although privacy rays omit its walls', () => {
  const d = fixture(), sun = artificialSun(0, -1, 1);
  const shade = sunlightAtPoint([10, 18, .02], sun, noHedges, d);
  assert.equal(shade.status, 'shade'); assert.equal(shade.blockedBy, 'House');
  const open = sunlightAtPoint([16, 18, .02], sun, noHedges, d);
  assert.equal(open.sunlit, true);
});

test('maximum roof envelope is distinguished from the original LoD1 prism', () => {
  const d = fixture(); d.site.house.roofZ = 5;
  const result = sunlightAtPoint([10, 18, .02], artificialSun(0, -1, 1), noHedges, d);
  assert.equal(result.status, 'roof-envelope'); assert.equal(result.roofEnvelopeOnly, true);
});

test('a possible near roof edge cannot hide definite shade from a farther building', () => {
  const d = fixture(); d.site.house.roofZ = 5;
  d.buildings.push({ id: 'far-building', label: 'Far building', footprint: rectangle(8, 2, 12, 4), baseZ: 0, roofZ: 20, roofTopZ: 20 });
  const result = sunlightAtPoint([10, 18, .02], artificialSun(0, -1, 1), noHedges, d);
  assert.equal(result.status, 'shade');
  assert.equal(result.roofEnvelopeOnly, false);
  assert.equal(result.blockedBy, 'Far building');
});

test('finite opaque canopy shades its footprint and does not shade outside it', () => {
  const d = fixture(), sun = artificialSun(0, 0, 1), settings = { ...noHedges, canopyEnabled: true, canopyDepth: 4.2, canopyWidth: 8, canopyHeight: 2.7, fasciaDepth: .3 };
  const under = sunlightAtPoint([10, 14, .02], sun, settings, d);
  assert.equal(under.blockerType, 'canopy');
  assert.equal(sunlightAtPoint([10, 18, .02], sun, settings, d).sunlit, true);
  assert.equal(sunlightAtPoint([10, 14, .02], sun, { ...settings, canopyEnabled: false }, d).sunlit, true);
});

test('boundary hedge height changes morning/low-sun shadow without changing sun position', () => {
  const d = fixture(), sun = artificialSun(0, 1, .2), point = [10, 30, .02];
  assert.equal(sunlightAtPoint(point, sun, noHedges, d).sunlit, true);
  const shaded = sunlightAtPoint(point, sun, { ...noHedges, hedgeRear: 4 }, d);
  assert.equal(shaded.status, 'shade'); assert.equal(shaded.blockedBy, 'Rear hedge');
});

test('retained garage casts sunlight shade only when enabled', () => {
  const d = fixture(), sun = artificialSun(0, -1, 1), point = [3, 22, .02];
  assert.equal(sunlightAtPoint(point, sun, noHedges, d).sunlit, true);
  assert.equal(sunlightAtPoint(point, sun, { ...noHedges, removeGarage: false }, d).blockedBy, 'Garage');
});

test('fill lifts lawn and pool receivers but never silently moves terrace or jacuzzi', () => {
  const a = sunlightSamplePoints({ ...defaultDesign, gardenRaise: 0 }, data);
  const b = sunlightSamplePoints({ ...defaultDesign, gardenRaise: .5 }, data);
  for (let i = 0; i < a.length; i++) near(b[i].z - a[i].z, ['garden', 'pool'].includes(a[i].id) ? .5 : 0);
});

test('night is a distinct status and daily samples expose DST gaps instead of inventing sunshine', () => {
  const night = analyzeSunlight(getSolarState('2026-12-21', 0, data), defaultDesign, data);
  assert.equal(night.sunlitCount, 0); assert.ok(night.points.every(p => p.status === 'night'));
  const day = dailySunlight('2026-03-29', defaultDesign, data, 30);
  assert.equal(day.rows.length, 48);
  for (const minute of [120, 150]) assert.equal(day.rows.find(r => r.minutes === minute).valid, false);
  assert.ok(day.rows.find(r => r.minutes === 780).valid);
  assert.match(day.note, /not exact duration/);
});
