/**
 * Solar geometry for Sternicza. NOAA/Meeus Julian-century equations, evaluated
 * at a real UTC instant. Elevation and shading use the geometric sun centre;
 * sunrise/sunset alone use the conventional -0.833° apparent-horizon threshold.
 * This predicts solar direction, not weather, irradiance or surveyed horizons.
 */
const RAD = Math.PI / 180, DEG = 180 / Math.PI, MINUTE = 60000, DAY = 86400000;
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const wrap = (n, period = 360) => ((n % period) + period) % period;
export const SOLAR_DEFAULTS = Object.freeze({ sunEnabled: true, sunDate: '2026-06-21', sunMinutes: 720 });
export const SOLAR_SITE = Object.freeze({
  latitude: 54.405452, longitude: 18.6312142, timeZone: 'Europe/Warsaw',
  centralMeridian: 19,
  // atan(tan(longitude-lon0)*sin(latitude)); the ellipsoidal correction is
  // negligible at this site's 0.37° separation from the central meridian.
  gridConvergenceDegrees: Math.atan(Math.tan((18.6312142 - 19) * RAD) * Math.sin(54.405452 * RAD)) * DEG,
});
const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: SOLAR_SITE.timeZone, calendar: 'iso8601', numberingSystem: 'latn',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const offsetCache = new Map(), dailyCache = new Map();
function remember(cache, key, value) {
  if (cache.size >= 24) cache.delete(cache.keys().next().value);
  cache.set(key, value); return value;
}
function dateParts(date) { return date.split('-').map(Number); }
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = dateParts(value);
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}
export function sanitizeSolarDate(value, fallback = SOLAR_DEFAULTS.sunDate) {
  return validDate(value) ? value : validDate(fallback) ? fallback : SOLAR_DEFAULTS.sunDate;
}
export function formatSolarTime(minutes) {
  if (!Number.isFinite(minutes)) return '—';
  const m = wrap(Math.round(minutes), 1440);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
export const formatClock = formatSolarTime;
function wallParts(instant) {
  const p = Object.fromEntries(clock.formatToParts(new Date(instant)).filter(x => x.type !== 'literal').map(x => [x.type, Number(x.value)]));
  return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, second: p.second };
}
function wallEpoch(instant) {
  const p = wallParts(instant);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}
export function warsawOffsetMinutes(instant) {
  const time = instant instanceof Date ? instant.getTime() : typeof instant === 'number' ? instant : Date.parse(instant);
  if (!Number.isFinite(time)) throw new RangeError('A valid UTC instant is required');
  const wholeSecond = Math.floor(time / 1000) * 1000;
  return (wallEpoch(wholeSecond) - wholeSecond) / MINUTE;
}
function zoneLabel(offset) {
  const name = offset === 120 ? 'CEST' : offset === 60 ? 'CET' : 'Europe/Warsaw';
  const sign = offset >= 0 ? '+' : '−', n = Math.abs(offset);
  return `${name} · UTC${sign}${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}
function possibleOffsets(date) {
  if (offsetCache.has(date)) return offsetCache.get(date);
  const [y, m, d] = dateParts(date), midday = Date.UTC(y, m - 1, d, 12);
  return remember(offsetCache, date, [...new Set([-DAY, 0, DAY].map(delta => warsawOffsetMinutes(midday + delta)))]);
}
/**
 * Resolve wall-clock input using the browser's IANA Europe/Warsaw timezone.
 * A repeated autumn hour uses its first occurrence; a missing spring hour is
 * advanced by the gap. Both cases expose a readable timeNote rather than hiding
 * an ambiguous/nonexistent local time. No host-machine timezone is consulted.
 */
export function warsawInstant(dateInput, minutesInput) {
  const date = sanitizeSolarDate(dateInput), [year, month, day] = dateParts(date);
  const minutes = clamp(Math.round(Number.isFinite(Number(minutesInput)) ? Number(minutesInput) : 720), 0, 1439);
  const requestedWall = Date.UTC(year, month - 1, day) + minutes * MINUTE;
  const candidates = possibleOffsets(date).map(offset => {
    const utc = requestedWall - offset * MINUTE;
    return { utc, wall: wallEpoch(utc) };
  });
  const matches = candidates.filter(x => x.wall === requestedWall).sort((a, b) => a.utc - b.utc);
  let selected, resolution = 'exact';
  if (matches.length) { selected = matches[0]; if (matches.length > 1) resolution = 'ambiguous-first'; }
  else {
    selected = candidates.filter(x => x.wall > requestedWall).sort((a, b) => a.wall - b.wall)[0] || candidates.sort((a, b) => Math.abs(a.wall - requestedWall) - Math.abs(b.wall - requestedWall))[0];
    resolution = 'shifted-forward';
  }
  const offsetMinutes = warsawOffsetMinutes(selected.utc), resolvedMinutes = minutes + (selected.wall - requestedWall) / MINUTE;
  const timezoneLabel = zoneLabel(offsetMinutes);
  const timeNote = resolution === 'ambiguous-first'
    ? `${formatSolarTime(minutes)} occurs twice on this date. Using the first occurrence (${timezoneLabel}).`
    : resolution === 'shifted-forward'
      ? `${formatSolarTime(minutes)} does not occur when the clocks advance. Using ${formatSolarTime(resolvedMinutes)} (${timezoneLabel}).`
      : '';
  return { date, minutes, resolvedMinutes, utc: selected.utc, utcISO: new Date(selected.utc).toISOString(), offsetMinutes, timezoneLabel, resolution, timeNote };
}

/** Azimuth is degrees clockwise from true north; elevation is geometric. */
export function solarPosition(instant, latitude = SOLAR_SITE.latitude, longitude = SOLAR_SITE.longitude) {
  const ms = instant instanceof Date ? instant.getTime() : typeof instant === 'number' ? instant : Date.parse(instant);
  if (!Number.isFinite(ms) || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new RangeError('A valid instant, latitude and longitude are required');
  const julianDay = ms / DAY + 2440587.5, t = (julianDay - 2451545) / 36525;
  const meanLongitude = wrap(280.46646 + t * (36000.76983 + 0.0003032 * t)) * RAD;
  const meanAnomaly = (357.52911 + t * (35999.05029 - 0.0001537 * t)) * RAD;
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const equationOfCentre = Math.sin(meanAnomaly) * (1.914602 - t * (0.004817 + 0.000014 * t))
    + Math.sin(2 * meanAnomaly) * (0.019993 - 0.000101 * t) + 0.000289 * Math.sin(3 * meanAnomaly);
  const omega = (125.04 - 1934.136 * t) * RAD;
  const apparentLongitude = meanLongitude + (equationOfCentre - 0.00569 - 0.00478 * Math.sin(omega)) * RAD;
  const meanObliquity = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliquity = (meanObliquity + 0.00256 * Math.cos(omega)) * RAD;
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(apparentLongitude));
  const y = Math.tan(obliquity / 2) ** 2;
  const equationOfTime = 4 * DEG * (y * Math.sin(2 * meanLongitude) - 2 * eccentricity * Math.sin(meanAnomaly)
    + 4 * eccentricity * y * Math.sin(meanAnomaly) * Math.cos(2 * meanLongitude)
    - 0.5 * y * y * Math.sin(4 * meanLongitude) - 1.25 * eccentricity * eccentricity * Math.sin(2 * meanAnomaly));
  const utcMinutes = wrap(ms, DAY) / MINUTE;
  const trueSolarMinutes = wrap(utcMinutes + equationOfTime + 4 * longitude, 1440);
  const hourAngle = (trueSolarMinutes / 4 - 180) * RAD, lat = latitude * RAD;
  const east = -Math.cos(declination) * Math.sin(hourAngle);
  const north = Math.sin(declination) * Math.cos(lat) - Math.cos(declination) * Math.sin(lat) * Math.cos(hourAngle);
  const up = Math.sin(declination) * Math.sin(lat) + Math.cos(declination) * Math.cos(lat) * Math.cos(hourAngle);
  return {
    azimuth: wrap(Math.atan2(east, north) * DEG), elevation: Math.asin(clamp(up, -1, 1)) * DEG,
    directionENU: [east, north, up], declination: declination * DEG, equationOfTime,
    hourAngle: hourAngle * DEG, isDaylight: up > 0,
  };
}

/** Transform true-north solar direction into this mapped local frame. */
export function localSunDirection(azimuth, elevation, data) {
  const c = data?.coordinates || {}, ux = c.xUnitEN || [1, 0], uy = c.yUnitEN || [0, 1];
  const convergence = Number.isFinite(c.gridConvergenceDegrees) ? c.gridConvergenceDegrees
    : c.horizontalCRS === 'EPSG:2180' ? SOLAR_SITE.gridConvergenceDegrees : 0;
  // GeographicLib/PROJ sign convention: grid azimuth = true azimuth - gamma.
  const a = (azimuth - convergence) * RAD, e = elevation * RAD;
  const gridEast = Math.cos(e) * Math.sin(a), gridNorth = Math.cos(e) * Math.cos(a);
  return [gridEast * ux[0] + gridNorth * ux[1], gridEast * uy[0] + gridNorth * uy[1], Math.sin(e)];
}

function localMinuteOf(utc, date) {
  const [y, m, d] = dateParts(date);
  return (wallEpoch(utc) - Date.UTC(y, m - 1, d)) / MINUTE;
}
function crossing(a, b, threshold) {
  const sign = solarPosition(a).elevation >= threshold;
  for (let i = 0; i < 24 && b - a > 500; i++) {
    const middle = (a + b) / 2;
    if ((solarPosition(middle).elevation >= threshold) === sign) a = middle; else b = middle;
  }
  return (a + b) / 2;
}
function dailySolar(date) {
  if (dailyCache.has(date)) return dailyCache.get(date);
  const [y, m, d] = dateParts(date), nextDate = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  const start = warsawInstant(date, 0).utc;
  // Resolve the next midnight directly for 2100-12-31, whose next date is outside
  // the UI's supported input range but still a valid endpoint for this day.
  const nextWall = Date.UTC(y, m - 1, d + 1);
  let end = nextWall - warsawOffsetMinutes(nextWall) * MINUTE;
  if (validDate(nextDate)) end = warsawInstant(nextDate, 0).utc;
  let sunriseUTC = null, sunsetUTC = null, previous = start, previousElevation = solarPosition(start).elevation;
  const horizon = -0.833;
  for (let current = start + 10 * MINUTE; current <= end + 10 * MINUTE; current += 10 * MINUTE) {
    const next = Math.min(current, end), nextElevation = solarPosition(next).elevation;
    if (previousElevation < horizon && nextElevation >= horizon) sunriseUTC = crossing(previous, next, horizon);
    if (previousElevation >= horizon && nextElevation < horizon) sunsetUTC = crossing(previous, next, horizon);
    previous = next; previousElevation = nextElevation;
    if (next === end) break;
  }
  let noonUTC = Date.UTC(y, m - 1, d, 12) - 4 * SOLAR_SITE.longitude * MINUTE;
  for (let i = 0; i < 3; i++) noonUTC = Date.UTC(y, m - 1, d, 12) - (4 * SOLAR_SITE.longitude + solarPosition(noonUTC).equationOfTime) * MINUTE;
  const path = [];
  for (let minutes = 0; minutes < 1440; minutes += 15) {
    const time = warsawInstant(date, minutes);
    if (time.resolution === 'shifted-forward') continue;
    path.push({ minutes, utcISO: time.utcISO, ...solarPosition(time.utc) });
  }
  path.push({ minutes: 1440, utcISO: new Date(end).toISOString(), ...solarPosition(end) });
  return remember(dailyCache, date, {
    sunriseMinutes: sunriseUTC === null ? null : localMinuteOf(sunriseUTC, date),
    sunsetMinutes: sunsetUTC === null ? null : localMinuteOf(sunsetUTC, date),
    sunriseUTC: sunriseUTC === null ? null : new Date(sunriseUTC).toISOString(),
    sunsetUTC: sunsetUTC === null ? null : new Date(sunsetUTC).toISOString(),
    daylightMinutes: sunriseUTC !== null && sunsetUTC !== null ? (sunsetUTC - sunriseUTC) / MINUTE : previousElevation >= horizon ? (end - start) / MINUTE : 0,
    noonMinutes: localMinuteOf(noonUTC, date), noonElevation: solarPosition(noonUTC).elevation,
    path,
  });
}
const pathCache = new WeakMap();
export function sunForSettings(settings = {}, data) {
  const time = warsawInstant(settings.sunDate ?? SOLAR_DEFAULTS.sunDate, settings.sunMinutes ?? SOLAR_DEFAULTS.sunMinutes);
  const position = solarPosition(time.utc), day = dailySolar(time.date);
  const coordinateObject = data?.coordinates;
  let cached = coordinateObject && pathCache.get(coordinateObject);
  if (!cached || cached.date !== time.date) {
    cached = { date: time.date, path: day.path.map(p => ({ ...p, direction: localSunDirection(p.azimuth, p.elevation, data) })) };
    if (coordinateObject) pathCache.set(coordinateObject, cached);
  }
  return {
    ...time, ...position, ...day, path: cached.path,
    enabled: settings.sunEnabled !== false, direction: localSunDirection(position.azimuth, position.elevation, data),
    latitude: SOLAR_SITE.latitude, longitude: SOLAR_SITE.longitude, timeZone: SOLAR_SITE.timeZone,
    gridConvergenceDegrees: SOLAR_SITE.gridConvergenceDegrees,
    horizonBasis: 'Geometric sun centre for shade; apparent sunrise/sunset use −0.833° over a level, unobstructed horizon.',
  };
}
