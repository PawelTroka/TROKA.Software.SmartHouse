/**
 * Deterministic solar geometry for Sternicza Garden Lab. Angles use true north;
 * civil times always use Europe/Warsaw, independently of the browser timezone.
 *
 * Solar terms follow the Meeus/NOAA formulation (implemented here without a
 * runtime service): https://gml.noaa.gov/grad/solcalc/calcdetails.html
 * Projection: inverse transverse Mercator, GRS80 / EPSG:2180, near its central
 * meridian. https://proj.org/en/stable/operations/projections/tmerc.html
 *
 * Direction is the geometric solar centre, without weather/refraction. Sunrise
 * and sunset use -0.833 degrees (upper limb / standard refraction), a flat
 * astronomical horizon, and do not include buildings. Direct-sun samples use
 * ideal opaque hedges and conservative mapped maximum-roof building prisms.
 * Isolated unverified high returns have no measured footprint and are excluded
 * from sun/shade even when the separate privacy sensitivity toggle is enabled.
 * Detailed rendered roof shadows can differ near roof edges. No irradiance,
 * cloud, unmeasured trees, reflections or translucent glazing are simulated.
 */
import {
  terrainAt, gardenGroundAt, floorElevation, jacuzziBounds,
  hedgeSegments, screenOnRay, canopyIntersection, buildingIntersection,
} from './geometry.js';

export const SOLAR_TIME_ZONE = 'Europe/Warsaw';
export const SOLAR_METHOD = 'Clear-sky geometric direct sun at sample surfaces; ideal opaque hedges; mapped maximum-roof envelopes. Roof-envelope-only shade is uncertain. Isolated unverified high returns are excluded even when the privacy sensitivity toggle is enabled because their footprints are unknown. Buildings and terrain beyond the supplied data, unmeasured vegetation, weather and reflections are excluded.';
const RAD = Math.PI / 180, DEG = 180 / Math.PI, DAY = 86400000, MINUTE = 60000;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (v, n) => ((v % n) + n) % n;
const pad = n => String(n).padStart(2, '0');
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: SOLAR_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const locationCache = new WeakMap();
const eventsCache = new Map();

function partsAt(ms) {
  return Object.fromEntries(dateFormatter.formatToParts(new Date(ms))
    .filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
}
function dateParts(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [year, month, day] = date.split('-').map(Number);
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day
    ? { year, month, day } : null;
}
const dateOf = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const clockAt = ms => { const p = partsAt(Math.round(ms / MINUTE) * MINUTE); return `${pad(p.hour)}:${pad(p.minute)}`; };

/** Invalid spring-gap times are rejected; a repeated autumn time means the first occurrence. */
export function resolveWarsawTime(date, minutes) {
  const p = dateParts(date);
  if (!p || !Number.isInteger(minutes) || minutes < 0 || minutes > 1439) {
    return { valid: false, date, minutes, timeZone: SOLAR_TIME_ZONE, warning: 'Choose a valid date (2000–2100) and a time from 00:00 to 23:59.' };
  }
  const h = Math.floor(minutes / 60), m = minutes % 60;
  const naive = Date.UTC(p.year, p.month - 1, p.day, h, m);
  // Read actual IANA offsets on both sides of a possible DST transition. No
  // host-local Date constructor or hard-coded last-Sunday rule is involved.
  const offsets = new Set([-DAY * 1.5, 0, DAY * 1.5].map(delta => {
    const instant = naive + delta, q = partsAt(instant);
    return (Date.UTC(q.year, q.month - 1, q.day, q.hour, q.minute, q.second) - instant) / MINUTE;
  }));
  const candidates = [...offsets].map(offsetMinutes => ({ offsetMinutes, ms: naive - offsetMinutes * MINUTE }))
    .filter(c => { const q = partsAt(c.ms); return q.year === p.year && q.month === p.month && q.day === p.day && q.hour === h && q.minute === m; })
    .sort((a, b) => a.ms - b.ms);
  if (!candidates.length) return { valid: false, date, minutes, timeZone: SOLAR_TIME_ZONE, warning: 'This local time does not exist when Poland moves clocks forward. Choose 03:00 or later.' };
  const first = candidates[0], ambiguous = candidates.length > 1;
  return {
    valid: true, date, minutes, timeZone: SOLAR_TIME_ZONE,
    instant: new Date(first.ms).toISOString(), timestamp: first.ms,
    offsetMinutes: first.offsetMinutes, ambiguous,
    timeLabel: `${pad(h)}:${pad(m)} ${first.offsetMinutes === 120 ? 'CEST' : first.offsetMinutes === 60 ? 'CET' : 'Warsaw'}`,
    warning: ambiguous ? 'This time occurs twice when Poland moves clocks back; the first occurrence (summer time) is shown.' : null,
  };
}

/** Inverse EPSG:2180; inputs here are explicitly easting,northing, not EPSG axis order. */
export function epsg2180ToGeographic(easting, northing) {
  if (!Number.isFinite(easting) || !Number.isFinite(northing)) throw new TypeError('Finite EPSG:2180 coordinates are required.');
  const a = 6378137, f = 1 / 298.257222101, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const k = 0.9993, x = (easting - 500000) / k, meridian = (northing + 5300000) / k;
  const mu = meridian / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + 151 * e1 ** 3 / 96 * Math.sin(6 * mu) + 1097 * e1 ** 4 / 512 * Math.sin(8 * mu);
  const s = Math.sin(phi1), c = Math.cos(phi1), t = Math.tan(phi1), n = a / Math.sqrt(1 - e2 * s * s);
  const r = a * (1 - e2) / (1 - e2 * s * s) ** 1.5, T = t * t, C = ep2 * c * c, D = x / n;
  const latitude = phi1 - n * t / r * (D * D / 2 - (5 + 3 * T + 10 * C - 4 * C * C - 9 * ep2) * D ** 4 / 24
    + (61 + 90 * T + 298 * C + 45 * T * T - 252 * ep2 - 3 * C * C) * D ** 6 / 720);
  const longitude = 19 * RAD + (D - (1 + 2 * T + C) * D ** 3 / 6
    + (5 - 2 * C + 28 * T - 3 * C * C + 8 * ep2 + 24 * T * T) * D ** 5 / 120) / c;
  return { latitude: latitude * DEG, longitude: longitude * DEG };
}

/** Derives geographic site position and grid-north true bearing from the mapped origin. */
export function siteLocation(data) {
  if (locationCache.has(data.coordinates)) return locationCache.get(data.coordinates);
  const [e, n] = data.coordinates.localOriginEN;
  const location = epsg2180ToGeographic(e, n);
  const south = epsg2180ToGeographic(e, n - 10), north = epsg2180ToGeographic(e, n + 10);
  // Ellipsoidal east/north differential corrects the simple cos(latitude) form.
  const f = 1 / 298.257222101, e2 = f * (2 - f), s = Math.sin(location.latitude * RAD);
  const eastScale = Math.cos(location.latitude * RAD);
  const northScale = (1 - e2) / (1 - e2 * s * s);
  const gridNorthBearingDeg = Math.atan2((north.longitude - south.longitude) * eastScale,
    (north.latitude - south.latitude) * northScale) * DEG;
  const result = Object.freeze({ ...location, gridNorthBearingDeg, source: 'EPSG:2180 mapped local origin; GRS80 inverse projection' });
  locationCache.set(data.coordinates, result);
  return result;
}

/** Solar centre, geometric elevation, north-clockwise azimuth. No atmospheric correction. */
export function solarPosition(instant, latitude, longitude) {
  const ms = instant instanceof Date ? instant.getTime() : typeof instant === 'number' ? instant : Date.parse(instant);
  if (!Number.isFinite(ms) || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new TypeError('A valid instant and geographic latitude/longitude are required.');
  const T = (ms / DAY + 2440587.5 - 2451545) / 36525;
  const L = wrap(280.46646 + T * (36000.76983 + 0.0003032 * T), 360) * RAD;
  const M = (357.52911 + T * (35999.05029 - 0.0001537 * T)) * RAD;
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const centre = Math.sin(M) * (1.914602 - T * (0.004817 + 0.000014 * T))
    + Math.sin(2 * M) * (0.019993 - 0.000101 * T) + 0.000289 * Math.sin(3 * M);
  const omega = (125.04 - 1934.136 * T) * RAD;
  const lambda = L + (centre - 0.00569 - 0.00478 * Math.sin(omega)) * RAD;
  const epsilon0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - 0.001813 * T))) / 60) / 60;
  const epsilon = (epsilon0 + 0.00256 * Math.cos(omega)) * RAD;
  const declination = Math.asin(Math.sin(epsilon) * Math.sin(lambda));
  const y = Math.tan(epsilon / 2) ** 2;
  const equationOfTime = 4 * DEG * (y * Math.sin(2 * L) - 2 * e * Math.sin(M)
    + 4 * e * y * Math.sin(M) * Math.cos(2 * L) - y * y * Math.sin(4 * L) / 2 - 1.25 * e * e * Math.sin(2 * M));
  const utcMinutes = wrap(ms, DAY) / MINUTE;
  const hourAngle = (wrap(utcMinutes + equationOfTime + 4 * longitude, 1440) / 4 - 180) * RAD;
  const phi = latitude * RAD;
  const elevation = Math.asin(clamp(Math.sin(phi) * Math.sin(declination) + Math.cos(phi) * Math.cos(declination) * Math.cos(hourAngle), -1, 1));
  const azimuth = wrap(Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(phi) - Math.tan(declination) * Math.cos(phi)) * DEG + 180, 360);
  return { azimuthDeg: azimuth, elevationDeg: elevation * DEG, declinationDeg: declination * DEG, equationOfTimeMinutes: equationOfTime };
}

/** True geographic sun direction -> mapped grid east/north -> local plot axes. */
export function localSunDirection(azimuthDeg, elevationDeg, data) {
  const azimuthGrid = (azimuthDeg - siteLocation(data).gridNorthBearingDeg) * RAD, elevation = elevationDeg * RAD;
  const east = Math.sin(azimuthGrid) * Math.cos(elevation), north = Math.cos(azimuthGrid) * Math.cos(elevation);
  const ux = data.coordinates.xUnitEN, uy = data.coordinates.yUnitEN;
  return { x: east * ux[0] + north * ux[1], y: east * uy[0] + north * uy[1], z: Math.sin(elevation) };
}

function solarEvents(date, location) {
  const key = `${date}:${location.latitude}:${location.longitude}`;
  if (eventsCache.has(key)) return eventsCache.get(key);
  const p = dateParts(date);
  if (!p) return { sunrise: null, sunset: null, daylightHours: null };
  const start = resolveWarsawTime(date, 0).timestamp;
  const nextDate = dateOf(new Date(Date.UTC(p.year, p.month - 1, p.day + 1)));
  // The final supported day needs an end instant without requiring a UI date in 2101.
  const end = nextDate.startsWith('2101') ? start + DAY : resolveWarsawTime(nextDate, 0).timestamp;
  const elevation = ms => solarPosition(ms, location.latitude, location.longitude).elevationDeg + 0.833;
  let sunriseMs = null, sunsetMs = null, previous = start, a = elevation(start);
  for (let t = start + 10 * MINUTE; t <= end + 1; t += 10 * MINUTE) {
    const current = Math.min(t, end), b = elevation(current);
    if ((a < 0 && b >= 0) || (a >= 0 && b < 0)) {
      let lo = previous, hi = current, rising = b > a;
      for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if ((elevation(mid) >= 0) === rising) hi = mid; else lo = mid; }
      if (rising) sunriseMs = (lo + hi) / 2; else sunsetMs = (lo + hi) / 2;
    }
    previous = current; a = b;
  }
  const result = Object.freeze({
    sunrise: sunriseMs === null ? null : clockAt(sunriseMs), sunset: sunsetMs === null ? null : clockAt(sunsetMs),
    sunriseInstant: sunriseMs === null ? null : new Date(sunriseMs).toISOString(), sunsetInstant: sunsetMs === null ? null : new Date(sunsetMs).toISOString(),
    daylightHours: sunriseMs !== null && sunsetMs !== null ? (sunsetMs - sunriseMs) / 3600000 : elevation((start + end) / 2) > 0 ? (end - start) / 3600000 : 0,
  });
  if (eventsCache.size > 400) eventsCache.delete(eventsCache.keys().next().value);
  eventsCache.set(key, result);
  return result;
}

export function getSolarState(date, minutes, data) {
  const time = resolveWarsawTime(date, minutes), location = siteLocation(data), events = solarEvents(date, location);
  if (!time.valid) return { ...time, location, ...events, daylight: false, directionLocal: { x: 0, y: 0, z: -1 }, elevationDeg: null, azimuthDeg: null };
  const position = solarPosition(time.timestamp, location.latitude, location.longitude);
  return { ...time, location, ...events, ...position, daylight: position.elevationDeg > 0,
    directionLocal: localSunDirection(position.azimuthDeg, position.elevationDeg, data) };
}

function sunlightContext(settings, data) {
  const buildings = new Map();
  for (const b of [data.site.house, ...(data.buildings || []), ...(settings.removeGarage === false ? [data.site.garage] : [])]) {
    if (!b || b.id === data.site.garage?.id && settings.removeGarage !== false) continue;
    const roofPoints = (b.roofPoints || []).map(p => Array.isArray(p) ? p[2] : p.z).filter(Number.isFinite);
    const roofMax = Math.max(finite(b.roofZ), finite(b.roofTopZ), ...roofPoints);
    buildings.set(b.id, { original: b, envelope: { ...b, roofZ: roofMax } });
  }
  return { buildings: [...buildings.values()], segments: hedgeSegments(settings, data),
    terrainMax: Math.max(...data.terrain.elevations) + Math.max(0, finite(settings.gardenRaise)) };
}

/** One sample at a receiving surface; buildings include the house for sunlight. */
export function sunlightAtPoint(point, solar, settings, data, prepared = null) {
  const origin = Array.isArray(point) ? point : [point.x, point.y, point.z];
  const base = { x: origin[0], y: origin[1], z: origin[2] };
  if (!solar.valid) return { ...base, sunlit: false, status: 'invalid', blockedBy: 'Invalid civil time', blockerType: 'invalid', roofEnvelopeOnly: false };
  if (!solar.daylight || solar.elevationDeg <= 0) return { ...base, sunlit: false, status: 'night', blockedBy: 'Sun below horizon', blockerType: 'horizon', roofEnvelopeOnly: false };
  const direction = solar.directionLocal, distance = 1000;
  const target = [origin[0] + direction.x * distance, origin[1] + direction.y * distance, origin[2] + direction.z * distance];
  const context = prepared || sunlightContext(settings, data), hits = [];
  const canopy = canopyIntersection(origin, target, settings, data);
  if (canopy) hits.push({ t: canopy.t, blockedBy: 'Terrace canopy', blockerType: 'canopy', hit: canopy, roofEnvelopeOnly: false });
  for (const segment of context.segments) {
    const hit = screenOnRay(origin, target, settings, data, [segment]);
    if (hit?.blocked) hits.push({ t: hit.t, blockedBy: `${segment.side[0].toUpperCase()}${segment.side.slice(1)} ${hit.blockMaterial === 'raised-soil' ? 'raised soil' : 'hedge'}`, blockerType: 'hedge', hit, roofEnvelopeOnly: false });
  }
  for (const { original, envelope } of context.buildings) {
    const hit = buildingIntersection(origin, target, envelope);
    if (!hit) continue;
    const low = buildingIntersection(origin, target, original);
    hits.push({ t: hit.t, blockedBy: original.id === data.site.house.id ? 'House' : original.label || 'Mapped building', blockerType: 'building', hit, roofEnvelopeOnly: !low });
  }
  // Sample the supplied terrain, including proposed rear fill, at 0.75 m
  // horizontal intervals. Never extrapolate a clamped crop into a distant hill.
  const horizontal = Math.hypot(direction.x, direction.y);
  if (horizontal > 1e-6) {
    const terrain = data.terrain, c = data.coordinates;
    for (let h = 0.75; h <= 180; h += 0.75) {
      const t = h / (horizontal * distance), x = origin[0] + direction.x * distance * t, y = origin[1] + direction.y * distance * t;
      const e = c.localOriginEN[0] + x * c.xUnitEN[0] + y * c.yUnitEN[0], n = c.localOriginEN[1] + x * c.xUnitEN[1] + y * c.yUnitEN[1];
      const gx = (e - terrain.originEN[0]) / terrain.cellSize, gy = (n - terrain.originEN[1]) / terrain.cellSize;
      if (gx < 0 || gy < 0 || gx > terrain.columns - 1 || gy > terrain.rows - 1) break;
      const z = origin[2] + direction.z * distance * t, ground = gardenGroundAt(x, y, settings, data);
      if (z < ground - 0.01) { hits.push({ t, blockedBy: 'Terrain / raised garden', blockerType: 'terrain', hit: { x, y, z }, roofEnvelopeOnly: false }); break; }
      if (z > context.terrainMax + 0.02) break; // The ray only rises from here; buildings are checked separately.
    }
  }
  const ordered = hits.sort((a, b) => a.t - b.t);
  // A possible roof-edge interception does not make a subsequent definite hedge
  // or wall shade uncertain: report the first definite blocker when one exists.
  const hit = ordered.find(h => !h.roofEnvelopeOnly) || ordered[0];
  return hit ? { ...base, sunlit: false, status: hit.roofEnvelopeOnly ? 'roof-envelope' : 'shade', ...hit }
    : { ...base, sunlit: true, status: 'sun', blockedBy: null, blockerType: null, roofEnvelopeOnly: false };
}

export function sunlightSamplePoints(settings, data) {
  const [mx, rear] = data.site.rearMidpoint, floor = floorElevation(settings, data), tub = jacuzziBounds(settings, data), pool = data.site.pool;
  const tx = mx, ty = rear + Math.max(0.5, finite(settings.terraceDepth, 4.2) - 1);
  const px = pool.x + pool.width / 2, py = pool.y + pool.length / 2;
  return [
    { id: 'terrace', label: 'Terrace', x: tx, y: ty, z: floor + 0.02 },
    { id: 'jacuzzi', label: 'Jacuzzi water', x: (tub.x0 + tub.x1) / 2, y: (tub.y0 + tub.y1) / 2, z: floor + 0.15 },
    { id: 'pool', label: 'Pool water', x: px, y: py, z: gardenGroundAt(px, py, settings, data) + 0.11 },
    { id: 'garden', label: 'Main lawn', x: mx, y: 30, z: gardenGroundAt(mx, 30, settings, data) + 0.02 },
  ];
}

export function analyzeSunlight(solar, settings, data, prepared = null) {
  const context = prepared || sunlightContext(settings, data);
  const points = sunlightSamplePoints(settings, data).map(p => ({ ...p, ...sunlightAtPoint(p, solar, settings, data, context) }));
  return { points, sunlitCount: points.filter(p => p.sunlit).length, total: points.length,
    uncertainCount: points.filter(p => p.roofEnvelopeOnly).length, daylight: solar.daylight, valid: solar.valid, method: SOLAR_METHOD };
}

/** Sampled status over a civil day, not an integrated energy or exact sun-hours estimate. */
export function dailySunlight(date, settings, data, stepMinutes = 60) {
  const step = Number.isInteger(stepMinutes) && stepMinutes >= 10 && stepMinutes <= 240 ? stepMinutes : 60;
  const context = sunlightContext(settings, data), rows = [];
  for (let minutes = 0; minutes < 1440; minutes += step) {
    const solar = getSolarState(date, minutes, data);
    rows.push({ minutes, timeLabel: solar.timeLabel || `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`,
      elevationDeg: solar.elevationDeg, ...analyzeSunlight(solar, settings, data, context) });
  }
  return { date, stepMinutes: step, timeZone: SOLAR_TIME_ZONE, rows, method: SOLAR_METHOD,
    note: 'Status at sampled local times, not exact duration. Spring-gap times are unavailable; autumn repeated times use their first occurrence.' };
}
