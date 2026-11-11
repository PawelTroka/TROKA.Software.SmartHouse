import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  solarPosition, sunForSettings, localSunDirection, warsawInstant,
  sanitizeSolarDate, SOLAR_DEFAULTS, SOLAR_SITE,
} from '../src/solar.js';

const data = JSON.parse(readFileSync(new URL('../data/site-data.json', import.meta.url)));
const near = (actual, expected, tolerance, label = '') => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} ≠ ${expected} ±${tolerance}`);

test('solar direction agrees with the independent published NREL SPA example', () => {
  // Reda/Andreas, NREL/TP-560-34302, Appendix A example: 17 Oct 2003,
  // 12:30:30 MST, lat 39.742476, lon -105.1786. NREL geometric elevation e0
  // 39.872046°; apparent zenith 50.111622° includes refraction, unlike our basis.
  // https://docs.nrel.gov/docs/fy08osti/34302.pdf
  const s = solarPosition('2003-10-17T19:30:30Z', 39.742476, -105.1786);
  near(s.azimuth, 194.340241, .01, 'azimuth');
  near(s.elevation, 39.872046, .01, 'geometric elevation');
  near(Math.hypot(...s.directionENU), 1, 1e-12, 'unit direction');
});

test('site seasonal directions match independently calculated topocentric SPA reference values', () => {
  // Reference: pvlib's independent full NREL SPA implementation, zero pressure,
  // site elevation 2.5 m, algorithmic delta-T; tolerances allow the simpler
  // NOAA orbital series and omitted topocentric parallax in this implementation.
  // https://github.com/pvlib/pvlib-python/blob/main/pvlib/spa.py
  const samples = [
    ['2026-03-20', 480, 17.727213, 116.787135], ['2026-03-20', 720, 35.511161, 182.173401],
    ['2026-03-20', 960, 15.975829, 246.428028], ['2026-03-20', 1200, -17.800426, 296.788605],
    ['2026-06-21', 480, 29.348108, 90.091480], ['2026-06-21', 720, 57.792837, 159.354374],
    ['2026-06-21', 960, 42.808392, 248.737644], ['2026-06-21', 1200, 9.028246, 298.027699],
    ['2026-09-22', 480, 11.962196, 106.682550], ['2026-09-22', 720, 35.251996, 168.268592],
    ['2026-09-22', 960, 21.891055, 236.210389], ['2026-09-22', 1200, -11.666284, 286.943029],
    ['2026-12-21', 480, -1.360626, 130.571434], ['2026-12-21', 720, 12.074449, 183.865393],
    ['2026-12-21', 960, -5.175334, 235.966743], ['2026-12-21', 1200, -38.512744, 283.791632],
  ];
  for (const [date, minutes, elevation, azimuth] of samples) {
    const solar = sunForSettings({ sunDate: date, sunMinutes: minutes }, data);
    near(solar.elevation, elevation, .02, `${date}/${minutes} elevation`);
    near(solar.azimuth, azimuth, .02, `${date}/${minutes} azimuth`);
  }
  near(SOLAR_SITE.gridConvergenceDegrees, -0.29988185370627357, .000001, 'independent pyproj meridian convergence');
});

test('Warsaw local summer/winter clocks resolve to UTC without host timezone dependence', () => {
  const summer = warsawInstant('2026-06-21', 720), winter = warsawInstant('2026-12-21', 720);
  assert.equal(summer.utcISO, '2026-06-21T10:00:00.000Z');
  assert.equal(winter.utcISO, '2026-12-21T11:00:00.000Z');
  assert.equal(summer.offsetMinutes, 120); assert.equal(winter.offsetMinutes, 60);
  assert.match(summer.timezoneLabel, /^CEST/); assert.match(winter.timezoneLabel, /^CET/);
  const justBefore = warsawInstant('2026-06-21', 0);
  assert.equal(justBefore.utcISO, '2026-06-20T22:00:00.000Z');
});

test('the spring missing hour and autumn repeated hour are handled and explicitly labelled', () => {
  const gap = warsawInstant('2026-03-29', 150), fold = warsawInstant('2026-10-25', 150);
  assert.equal(gap.utcISO, '2026-03-29T01:30:00.000Z');
  assert.equal(gap.resolvedMinutes, 210); assert.equal(gap.resolution, 'shifted-forward');
  assert.match(gap.timeNote, /03:30/);
  assert.equal(fold.utcISO, '2026-10-25T00:30:00.000Z');
  assert.equal(fold.resolution, 'ambiguous-first'); assert.match(fold.timeNote, /first occurrence/);
  const before = warsawInstant('2026-03-29', 119), after = warsawInstant('2026-03-29', 180);
  assert.equal(after.utc - before.utc, 60000, 'one real minute elapses across the missing wall-clock hour');
});

test('true cardinal directions map consistently into the rotated site and preserve elevation', () => {
  const EN = { coordinates: { xUnitEN: [1, 0], yUnitEN: [0, 1], horizontalCRS: 'ENU' } };
  const east = localSunDirection(90, 0, EN), north = localSunDirection(0, 0, EN);
  near(east[0], 1, 1e-12); near(east[1], 0, 1e-12);
  near(north[0], 0, 1e-12); near(north[1], 1, 1e-12);
  const trueRearBearing = data.coordinates.yGridAzimuth + SOLAR_SITE.gridConvergenceDegrees;
  const rear = localSunDirection(trueRearBearing, 0, data);
  near(rear[0], 0, 1e-12); near(rear[1], 1, 1e-12);
  const raised = localSunDirection(trueRearBearing, 30, data);
  near(raised[2], .5, 1e-12); near(Math.hypot(...raised), 1, 1e-12);
  const trueNorth = localSunDirection(0, 0, data);
  assert.ok(trueNorth[0] < 0 && trueNorth[1] < 0, 'true north points toward the frontage, not into the rear garden');
});

test('Gdansk seasonal noon heights and day lengths follow latitude and solstice declination', () => {
  const summer = sunForSettings({ sunDate: '2026-06-21', sunMinutes: 720 }, data);
  const winter = sunForSettings({ sunDate: '2026-12-21', sunMinutes: 720 }, data);
  const spring = sunForSettings({ sunDate: '2026-03-20', sunMinutes: 720 }, data);
  near(summer.noonElevation, 90 - SOLAR_SITE.latitude + 23.44, .05, 'summer noon');
  near(winter.noonElevation, 90 - SOLAR_SITE.latitude - 23.44, .05, 'winter noon');
  near(spring.noonElevation, 90 - SOLAR_SITE.latitude, .1, 'equinox noon');
  assert.ok(summer.daylightMinutes > 17 * 60 && summer.daylightMinutes < 17.5 * 60);
  assert.ok(winter.daylightMinutes > 7 * 60 && winter.daylightMinutes < 7.5 * 60);
  assert.ok(summer.sunriseMinutes < 5 * 60 && summer.sunsetMinutes > 21 * 60);
  assert.ok(winter.sunriseMinutes > 8 * 60 && winter.sunsetMinutes < 16 * 60);
  assert.ok(summer.noonMinutes > 12.5 * 60 && summer.noonMinutes < 13 * 60, 'civil noon is not solar noon in CEST');
});

test('sunrise and sunset use the apparent horizon while shade rays use geometric daylight', () => {
  const sun = sunForSettings(SOLAR_DEFAULTS, data);
  near(solarPosition(sun.sunriseUTC).elevation, -.833, .002);
  near(solarPosition(sun.sunsetUTC).elevation, -.833, .002);
  const dawn = sunForSettings({ sunDate: '2026-06-21', sunMinutes: Math.round(sun.sunriseMinutes) }, data);
  assert.equal(dawn.isDaylight, false, 'the sun centre is still below the geometric horizon at apparent sunrise');
  const night = sunForSettings({ sunDate: '2026-12-21', sunMinutes: 1200 }, data);
  assert.equal(night.isDaylight, false); assert.ok(night.direction[2] < 0);
  assert.ok(night.direction.every(Number.isFinite));
});

test('morning and evening reverse east/west and the path uses the same astronomical model', () => {
  const morning = sunForSettings({ sunDate: '2026-06-21', sunMinutes: 480 }, data);
  const evening = sunForSettings({ sunDate: '2026-06-21', sunMinutes: 1200 }, data);
  assert.ok(morning.azimuth < 180 && morning.directionENU[0] > 0);
  assert.ok(evening.azimuth > 180 && evening.directionENU[0] < 0);
  const currentPathPoint = morning.path.find(p => p.minutes === 480);
  near(currentPathPoint.elevation, morning.elevation, 1e-12);
  currentPathPoint.direction.forEach((v, i) => near(v, morning.direction[i], 1e-12));
  assert.equal(morning.path.at(-1).minutes, 1440);
});

test('invalid dates cannot overflow silently into a different month and leap rules are Gregorian', () => {
  for (const input of ['2026-02-29', '2100-02-29', '2026-04-31', '2026-13-01', '26-06-21', '<script>', '1999-12-31', null]) {
    assert.equal(sanitizeSolarDate(input), SOLAR_DEFAULTS.sunDate, String(input));
  }
  assert.equal(sanitizeSolarDate('2000-02-29'), '2000-02-29');
  assert.equal(sanitizeSolarDate('2028-02-29'), '2028-02-29');
  assert.equal(sanitizeSolarDate('2100-12-31'), '2100-12-31');
  const last = sunForSettings({ sunDate: '2100-12-31', sunMinutes: 1439 }, data);
  assert.equal(last.path.at(-1).utcISO, '2100-12-31T23:00:00.000Z');
  assert.throws(() => solarPosition('invalid'), RangeError);
});
