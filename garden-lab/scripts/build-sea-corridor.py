#!/usr/bin/env python3
"""Retain measured Sternicza-to-sea profiles from original GUGiK/PRG sources.

Requires numpy and pyproj. Source files stay outside the repository. Every
height uses PL-EVRF2007-NH; horizontal coordinates use EPSG:2180. Nothing is
inferred from a rendered map, an absent building, or an unfilled raster cell.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import zipfile

import numpy as np
from pyproj import Transformer

DSM_URL = 'https://opendata.geoportal.gov.pl/NumDaneWys/NMPT/81007/81007_1561149_N-34-50-C-d-1-1.asc'
DTM_URL = 'https://opendata.geoportal.gov.pl/NumDaneWys/NMT/81008/81008_1561323_N-34-50-C-d-1-1.asc'
COAST_URL = 'https://ogcapi.geoportal.gov.pl/res/ims/maps/PRG/apiFeatures/collections/MorskaLiniaBrzegowa/items?bbox=18.0,54.30,19.4,54.95&f=json&limit=1000'
LOD_URL = 'https://opendata.geoportal.gov.pl/InneDane/Budynki3D/LOD1/2024/22/2261.zip'
TILE = '2261_N-34-50-c-d-1-1.gml'
ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def read_grid(path):
    with path.open() as stream:
        head = dict((k.lower(), float(v)) for k, v in (stream.readline().split() for _ in range(6)))
        values = np.loadtxt(stream, dtype=np.float32)
    if values.shape != (int(head['nrows']), int(head['ncols'])):
        raise ValueError('Source raster shape does not match its header')
    values[values == head['nodata_value']] = np.nan
    return head, values[::-1]


def sample_grid(grid, e, n):
    h, values = grid
    ix = np.floor((np.asarray(e) - h['xllcenter']) / h['cellsize'] + .5).astype(int)
    iy = np.floor((np.asarray(n) - h['yllcenter']) / h['cellsize'] + .5).astype(int)
    valid = (ix >= 0) & (iy >= 0) & (ix < values.shape[1]) & (iy < values.shape[0])
    z = np.full(ix.shape, np.nan)
    z[valid] = values[iy[valid], ix[valid]]
    return z


def conservative_bins(grid, origin, direction, distances, shore_distance):
    """Max every native cell touching a bin's axis-aligned bounding rectangle.

    A bin is 1 m long and 1 m wide, in the ray basis. Its EN bounding rectangle
    contains every cell the actual corridor could touch. Retaining complete
    touching cells adds a small conservative lateral/longitudinal allowance;
    it cannot miss a high cell merely because the ray clips a raster corner.
    """
    h, values = grid
    cell = h['cellsize']
    lateral = np.array([direction[1], -direction[0]])
    ends = np.minimum(distances + 1, shore_distance)
    corners = np.array([origin + d[:, None] * direction + side * lateral
                        for d in [distances, ends] for side in [-.5, .5]])
    lo, hi = corners.min(axis=0), corners.max(axis=0)
    grid_origin = np.array([h['xllcenter'], h['yllcenter']])
    first = np.ceil((lo - grid_origin - cell / 2) / cell).astype(int)
    last = np.floor((hi - grid_origin + cell / 2) / cell).astype(int)
    width = int(np.max(last[:, 0] - first[:, 0])) + 1
    height = int(np.max(last[:, 1] - first[:, 1])) + 1
    candidates, positions = [], []
    for dx in range(width):
        for dy in range(height):
            indices = first + [dx, dy]
            in_bin = np.all(indices <= last, axis=1)
            in_grid = ((indices[:, 0] >= 0) & (indices[:, 1] >= 0) &
                       (indices[:, 0] < values.shape[1]) & (indices[:, 1] < values.shape[0]))
            heights = np.full(len(distances), -np.inf)
            heights[in_bin & ~in_grid] = np.nan
            use = in_bin & in_grid
            heights[use] = values[indices[use, 1], indices[use, 0]]
            candidates.append(heights)
            positions.append(grid_origin + indices * cell)
    samples = np.array(candidates)
    missing = np.any(np.isnan(samples), axis=0)
    filled = np.where(np.isnan(samples), -np.inf, samples)
    maxima = np.argmax(filled, axis=0)
    return np.max(filled, axis=0), np.array(positions)[maxima, np.arange(len(distances))], missing


def intersect_coast(origin, direction, parts):
    hits = []
    cross = lambda a, b: a[0] * b[1] - a[1] * b[0]
    for part in parts:
        for a, b in zip(part[:-1], part[1:]):
            delta, offset = b - a, a - origin
            denominator = cross(direction, delta)
            if abs(denominator) < 1e-9:
                continue
            distance, fraction = cross(offset, delta) / denominator, cross(offset, direction) / denominator
            if distance > 0 and 0 <= fraction <= 1:
                hits.append(distance)
    unique = []
    for distance in sorted(hits):
        if not unique or distance - unique[-1] > .0001:
            unique.append(distance)
    return unique


def point_inside(point, ring):
    inside = False
    for a, b in zip(ring, ring[1:]):
        if (a[1] > point[1]) != (b[1] > point[1]):
            inside ^= point[0] < a[0] + (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1])
    return inside


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--dsm', type=Path, required=True)
    ap.add_argument('--dtm', type=Path, required=True)
    ap.add_argument('--coastline', type=Path, required=True)
    ap.add_argument('--lod1', type=Path, required=True)
    ap.add_argument('--output', type=Path, default=ROOT / 'data/sternicza-sea-corridor.json')
    args = ap.parse_args()
    site_data = json.loads((ROOT / 'data/site-data.json').read_text())
    coordinates = site_data['coordinates']
    origin = np.array(coordinates['localOriginEN'])
    basis = np.array([coordinates['xUnitEN'], coordinates['yUnitEN']])
    local = lambda p: (np.asarray(p) - origin) @ basis.T
    native = lambda p: origin + np.asarray(p) @ basis
    longitude, latitude = Transformer.from_crs(2180, 4326, always_xy=True).transform(*origin)
    convergence = math.degrees(math.atan(math.tan(math.radians(longitude - 19)) * math.sin(math.radians(latitude))))
    coordinates = {**coordinates, 'gridConvergenceDegrees': convergence}
    dsm, dtm = read_grid(args.dsm), read_grid(args.dtm)
    if dsm[0]['cellsize'] != .5 or dtm[0]['cellsize'] != 1:
        raise ValueError('Expected original 0.5 m DSM and 1 m DTM; no silent resampling')
    coast = json.loads(args.coastline.read_text())
    if any(link.get('rel') == 'next' for link in coast.get('links', [])):
        raise ValueError('Paginated coastline response must be retrieved completely')
    transform = Transformer.from_crs(4326, 2180, always_xy=True)
    parts, coast_ids = [], []
    for feature in coast['features']:
        geometry = feature['geometry']
        if geometry['type'] not in ['LineString', 'MultiLineString']:
            raise ValueError('Unexpected coastline geometry')
        lines = geometry['coordinates'] if geometry['type'] == 'MultiLineString' else [geometry['coordinates']]
        for line in lines:
            a = np.array(line)
            e, n = transform.transform(a[:, 0], a[:, 1])
            parts.append(np.column_stack((e, n)))
        coast_ids.append({'id': feature['id'], 'version': feature['properties'].get('idWersja')})
    spec = importlib.util.spec_from_file_location('lod_parser', ROOT / 'scripts/expand-sternicza-neighborhood.py')
    parser = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(parser)
    with zipfile.ZipFile(args.lod1) as archive:
        tile_path = next(n for n in archive.namelist() if n.endswith(TILE))
        tile_bytes = archive.read(tile_path)
    all_buildings = parser.parse_lod1(tile_bytes)
    buildings = []
    known = {b['officialId']: b for b in site_data['buildings']}
    for building in all_buildings:
        p = np.array(building['footprintEN'])
        lo, hi = p.min(axis=0), p.max(axis=0)
        if hi[0] < 475680 or lo[0] > 477420 or hi[1] < 726820 or lo[1] > 727850:
            continue
        label = known.get(building['officialId'], {}).get('label') or 'Mapped building'
        buildings.append({'id': building['officialId'], 'label': label,
                          'footprint': np.round(local(p), 3).tolist(),
                          'baseZ': building['baseZ'], 'roofZ': round(building['baseZ'] + building['measuredHeight'], 2),
                          '_en': p, '_lo': lo, '_hi': hi})
    rear = site_data['site']['rearMidpoint']
    origin_specs = [('house', 'Above the house', [9.63, 13.56]),
                    ('front', 'Front garden', [10.16, 4]),
                    ('terrace', 'Rear terrace', [rear[0], rear[1] + 2]),
                    ('garden', 'Rear garden', [10.16, 30])]
    observers = []
    for identifier, label, xy in origin_specs:
        en = native(xy)
        ground = float(sample_grid(dtm, [en[0]], [en[1]])[0])
        observer = {'id': identifier, 'label': label, 'xy': xy,
                    'groundZ': round(ground, 2), 'profiles': []}
        for bearing in range(-20, 81, 2):
            theta = math.radians(bearing)
            direction = np.array([math.sin(theta), math.cos(theta)])
            intersections = intersect_coast(en, direction, parts)
            if not intersections or not 300 < intersections[0] < 1800:
                continue
            shore_distance = intersections[0]
            target_distance = shore_distance + 1000
            sea_clear = not any(d < target_distance for d in intersections[1:])
            # Every native cell touching the bounding rectangle is retained;
            # a grid-corner obstacle cannot fall between sampling locations.
            distances = np.arange(0, math.ceil(shore_distance), 1, dtype=float)
            tops, top_pts, missing = conservative_bins(dsm, en, direction, distances, shore_distance)
            center_pts = en + distances[:, None] * direction
            grounds = sample_grid(dtm, center_pts[:, 0], center_pts[:, 1])
            # Assign only footprint-backed building classifications. A tall
            # non-building surface may be a tree, but no species is invented.
            building_indices = np.full(len(distances), -1, dtype=int)
            for b_index, b in enumerate(buildings):
                candidates = np.flatnonzero(np.all(top_pts >= b['_lo'], axis=1) & np.all(top_pts <= b['_hi'], axis=1))
                for j in candidates:
                    if point_inside(top_pts[j], b['_en']):
                        building_indices[j] = b_index
            kinds = []
            building_intervals = []
            for j, p in enumerate(top_pts):
                if building_indices[j] >= 0:
                    kinds.append(1)
                    building_intervals.append([j, int(building_indices[j])])
                elif np.isfinite(grounds[j]) and tops[j] - grounds[j] < 1.8:
                    kinds.append(0)
                else:
                    kinds.append(2)
            runs = []
            for j, b in building_intervals:
                if runs and runs[-1][2] == b and runs[-1][1] == j - 1:
                    runs[-1][1] = j
                else:
                    runs.append([j, j, b])
            # null explicitly encodes missing native DSM coverage.
            observer['profiles'].append({
                'id': f'b{bearing}', 'bearingGrid': bearing % 360,
                'directionXY': np.round(direction @ basis.T, 10).tolist(),
                'shoreDistanceM': round(shore_distance, 3), 'waterDistanceM': round(target_distance, 3),
                'nextLandDistanceM': round(intersections[1], 3) if len(intersections) > 1 else None,
                'waterSegmentVerified': sea_clear, 'shoreXY': np.round(local(en + direction * shore_distance), 3).tolist(),
                'stepM': 1, 'surfaceZ': [None if missing[i] or not np.isfinite(v) else round(float(v), 2) for i, v in enumerate(tops)],
                'groundZ': [None if not np.isfinite(v) else round(float(v), 2) for v in grounds],
                'surfaceKind': ''.join(str(v) for v in kinds), 'buildingRuns': runs,
                'missingCount': int(missing.sum())})
        observers.append(observer)
        print(label, len(observer['profiles']), 'profiles; missing', sum(p['missingCount'] for p in observer['profiles']), flush=True)
    coast_local = []
    for part in parts:
        # Keep consecutive coastline sections covering the sampled fan only.
        keep = (part[:, 0] > 475500) & (part[:, 0] < 477600) & (part[:, 1] > 726850) & (part[:, 1] < 728100)
        segment = []
        for i, yes in enumerate(keep):
            if yes:
                segment.append(np.round(local(part[i]), 3).tolist())
            elif segment:
                if len(segment) > 1:
                    coast_local.append(segment)
                segment = []
        if len(segment) > 1:
            coast_local.append(segment)
    public_buildings = [{k: v for k, v in b.items() if not k.startswith('_')} for b in buildings]
    result = {
        'schemaVersion': 1, 'siteId': 'sternicza-11', 'title': 'Sternicza 11 → Gulf of Gdańsk',
        'horizontalCRS': 'EPSG:2180', 'verticalDatum': 'PL-EVRF2007-NH',
        'coordinates': coordinates, 'surfaceDate': '2024-10-01', 'retrievedDate': '2026-11-22',
        'seaLevelZ': 0, 'seaLevelNote': 'Assumed 0 m in PL-EVRF2007-NH; no tide, waves or storm surge forecast.',
        'model': {'sourceResolutionM': .5, 'profileStepM': 1, 'corridorWidthM': 1,
                  'aggregation': 'Maximum of every native 0.5 m DSM cell touching the EN bounding rectangle of each 1 m long × 1 m wide ray bin; missing touched cells remain missing.',
                  'earthRadiusM': 6371000, 'refractionCoefficient': 0,
                  'bearingStepDegrees': 2, 'bearingRangeGrid': [-20, 80],
                  'foliage': 'Recorded October 2024 surface; opaque canopy, no assumed winter transparency.',
                  'designChanges': 'Existing recorded landscape only; proposed trees and building edits are not in this historical DSM.'},
        'sources': [
            {'id': 'gugik-dsm', 'label': 'GUGiK NMPT · 0.5 m surface · 1 October 2024', 'url': DSM_URL, 'sha256': digest(args.dsm),
             'documentation': 'https://www.geoportal.gov.pl/pl/dane/numeryczny-model-pokrycia-terenu-nmpt/', 'verticalDatum': 'PL-EVRF2007-NH'},
            {'id': 'gugik-dtm', 'label': 'GUGiK NMT · 1 m ground · 1 October 2024', 'url': DTM_URL, 'sha256': digest(args.dtm)},
            {'id': 'prg-shore', 'label': 'GUGiK PRG maritime shoreline · legal boundary', 'url': COAST_URL, 'sha256': digest(args.coastline), 'features': coast_ids},
            {'id': 'gugik-buildings', 'label': 'GUGiK LoD1 2024 · footprints for map and blocker identification', 'url': LOD_URL, 'sha256': digest(args.lod1), 'tile': TILE,
             'tileSha256': hashlib.sha256(tile_bytes).hexdigest()}],
        'observers': observers, 'shoreline': coast_local, 'buildings': public_buildings,
        'plotBoundary': site_data['site']['boundary'],
        'limitations': ['Historical acquisition, not a present-day survey.',
                       'A discrete 2° bearing search is not a proof of the global minimum height.',
                       'Narrow sampled corridors and opaque tops do not resolve gaps through foliage or windows.',
                       'Atmospheric visibility, refraction, wave height and post-acquisition changes are not modeled.',
                       'PRG is the legal maritime boundary, not a real-time waterline.']}
    args.output.write_text(json.dumps(result, separators=(',', ':'), ensure_ascii=False) + '\n')
    print('Wrote', args.output, args.output.stat().st_size, 'bytes', flush=True)


if __name__ == '__main__':
    main()
