#!/usr/bin/env python3
"""Derive bounded surrounding vegetation aggregates from classified GUGiK ALS.

Requires numpy, scipy and laspy[lazrs]. Inputs are original LAZ tiles, the
matching 1 m EVRF2007 terrain ASC and the application's georeferenced dataset.
Outputs are derived canopy aggregates, not an inventory of individual trees.
The original source files are deliberately not copied into the application.

python extract-sternicza-nature.py --site-data data/site-data.json \
  --dtm sternicza_dtm_2024.asc --laz tile1.laz tile2.laz tile3.laz tile4.laz \
  --output-dir extracted --municipal-records municipal-tree-records.json \
  --municipal-meta municipal-tree-layer.json
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

import laspy
import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree

SOURCE_DATE = '2024-10-01'
RETRIEVED_DATE = '2026-11-22'
LAZ_URL = 'https://opendata.geoportal.gov.pl/NumDaneWys/DanePomiaroweLAZ/81005/'
DTM_URL = 'https://opendata.geoportal.gov.pl/NumDaneWys/NMT/81008/81008_1561323_N-34-50-C-d-1-1.asc'
ORIGINAL_LAZ_NAME = '81005_1559930_N-34-50-C-d-1-1-3-1.laz'
MUNICIPAL_URL = 'https://geogdansk.pl/server/rest/services/GZDiZ/Gdanska_Zielen_WFS/MapServer/0'
SOURCE_TILE_ORDER = [
    '81005_1559924_N-34-50-C-d-1-1-1-3.laz',  # northwest
    '81005_1559925_N-34-50-C-d-1-1-1-4.laz',  # northeast
    '81005_1559931_N-34-50-C-d-1-1-3-2.laz',  # southeast
    ORIGINAL_LAZ_NAME,                         # southwest
]


def canonical_laz_name(path):
    return ORIGINAL_LAZ_NAME if path.name == 'sternicza_lidar_2024.laz' else path.name


def source_tile_key(path):
    name = canonical_laz_name(path)
    return (SOURCE_TILE_ORDER.index(name) if name in SOURCE_TILE_ORDER else len(SOURCE_TILE_ORDER), name)


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        while b := f.read(1024 * 1024):
            h.update(b)
    return h.hexdigest()


def inside(x, y, polygon):
    result = np.zeros(np.shape(x), dtype=bool)
    for a, b in zip(polygon, polygon[1:]):
        result ^= ((a[1] > y) != (b[1] > y)) & (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1] + 1e-99) + a[0])
    return result


def read_terrain(path):
    with path.open() as f:
        header = dict(f.readline().lower().split() for _ in range(6))
        data = np.flipud(np.loadtxt(f))
    cols, rows = int(header['ncols']), int(header['nrows'])
    size = float(header['cellsize'])
    x0 = float(header.get('xllcenter', header.get('xllcorner', 0))) + (size / 2 if 'xllcorner' in header else 0)
    y0 = float(header.get('yllcenter', header.get('yllcorner', 0))) + (size / 2 if 'yllcorner' in header else 0)
    assert data.shape == (rows, cols)
    def sample(e, n):
        fx, fy = (np.asarray(e) - x0) / size, (np.asarray(n) - y0) / size
        if np.any((fx < 0) | (fy < 0) | (fx >= cols - 1) | (fy >= rows - 1)):
            raise ValueError('Terrain coverage does not cover a requested point')
        x, y = np.floor(fx).astype(int), np.floor(fy).astype(int)
        tx, ty = fx - x, fy - y
        return ((1 - tx) * (1 - ty) * data[y, x] + tx * (1 - ty) * data[y, x + 1]
                + (1 - tx) * ty * data[y + 1, x] + tx * ty * data[y + 1, x + 1])
    return sample


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site-data', type=Path, required=True)
    parser.add_argument('--dtm', type=Path, required=True)
    parser.add_argument('--laz', type=Path, nargs='+', required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--debug-points', action='store_true',
                        help='Also write large intermediate NPY point arrays outside the application')
    parser.add_argument('--municipal-records', type=Path)
    parser.add_argument('--municipal-meta', type=Path)
    parser.add_argument('--radius', type=float, default=200)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    site = json.loads(args.site_data.read_text())
    frame = site['coordinates']
    origin = np.array(frame['localOriginEN'])
    axes = np.array([frame['xUnitEN'], frame['yUnitEN']])
    boundary = np.array(site['site']['boundary'])
    house = np.array(site['site']['house']['footprint'])[:-1]
    center = house.mean(axis=0)
    terrain = read_terrain(args.dtm)
    vegetation, roofs, tile_meta = [], [], []
    for path in sorted(args.laz, key=source_tile_key):
        with laspy.open(path) as reader:
            name = canonical_laz_name(path)
            tile_meta.append({'file': name, 'url': LAZ_URL + name, 'sha256': digest(path),
                              'pointCount': reader.header.point_count,
                              'boundsEN': [reader.header.mins[:2].tolist(), reader.header.maxs[:2].tolist()],
                              'acquired': SOURCE_DATE, 'verticalDatum': 'PL-EVRF2007-NH'})
            nveg = nroofs = 0
            for c in reader.chunk_iterator(1_000_000):
                classes = np.array(c.classification)
                use = ((classes >= 3) & (classes <= 6)) & ~np.asarray(c.withheld, dtype=bool)
                if not use.any():
                    continue
                en = np.stack([np.asarray(c.x)[use], np.asarray(c.y)[use]], axis=1)
                xy = (en - origin) @ axes.T
                z = np.asarray(c.z)[use]
                cl = classes[use]
                keep = ((xy - center) ** 2).sum(axis=1) <= (args.radius + 3) ** 2
                if not keep.any():
                    continue
                en, xy, z, cl = en[keep], xy[keep], z[keep], cl[keep]
                base = terrain(en[:, 0], en[:, 1])
                h = z - base
                veg = (cl <= 5) & (h >= 1) & (h <= 45) & ~inside(xy[:, 0], xy[:, 1], boundary)
                if veg.any():
                    rgb = np.stack([np.asarray(c.red)[use][keep], np.asarray(c.green)[use][keep], np.asarray(c.blue)[use][keep]], axis=1)
                    vegetation.append(np.column_stack([xy[veg], z[veg], h[veg], rgb[veg], en[veg]]))
                    nveg += int(veg.sum())
                roof = cl == 6
                if roof.any():
                    roofs.append(np.column_stack([xy[roof], z[roof], en[roof]]))
                    nroofs += int(roof.sum())
            print(path.name, 'vegetation', nveg, 'building', nroofs, flush=True)
    points = np.concatenate(vegetation)
    roof_points = np.concatenate(roofs)
    if args.debug_points:
        np.save(args.output_dir / 'vegetation-points.npy', points)
        np.save(args.output_dir / 'roof-points.npy', roof_points)

    # One-metre maximum-normalized-height raster, aligned to the established
    # local site frame. Missing cells remain absent: no invented background.
    grid_origin = np.floor(points[:, :2].min(axis=0)) - 1
    shape = np.ceil(points[:, :2].max(axis=0) - grid_origin + 2).astype(int)
    ix = np.floor(points[:, 0] - grid_origin[0]).astype(int)
    iy = np.floor(points[:, 1] - grid_origin[1]).astype(int)
    top = np.zeros((shape[1], shape[0]))
    count = np.zeros_like(top, dtype=np.int32)
    np.maximum.at(top, (iy, ix), points[:, 3])
    np.add.at(count, (iy, ix), 1)
    occupied = (top >= 2.5) & (count >= 3)
    components, n = ndimage.label(occupied, structure=np.ones((3, 3)))
    smooth = ndimage.gaussian_filter(top, .65)
    local_max = (smooth == ndimage.maximum_filter(smooth, size=5)) & occupied
    assignments = np.zeros_like(components)
    seed_cells = []
    label = 0
    for comp in range(1, n + 1):
        cells = np.argwhere(components == comp)
        if len(cells) < 4:
            continue
        candidates = [tuple(c) for c in cells if local_max[tuple(c)]]
        candidates.sort(key=lambda c: (-float(smooth[c]), c[0], c[1]))
        if not candidates:
            candidates = [tuple(cells[np.argmax(top[tuple(cells.T)])])]
        seeds = []
        for c in candidates:
            if not seeds or all((c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 >= 25 for p in seeds):
                seeds.append(c)
        nearest = cKDTree(np.array(seeds)).query(cells)[1]
        for i, peak in enumerate(seeds):
            members = cells[nearest == i]
            if len(members) < 4:
                continue
            label += 1
            assignments[tuple(members.T)] = label
            seed_cells.append((label, peak, len(members)))
    point_labels = assignments[iy, ix]
    crowns = []
    for cluster, peak, cells in seed_cells:
        p = points[point_labels == cluster]
        if len(p) < 35:
            continue
        lo, hi = np.quantile(p[:, :2], [.01, .99], axis=0)
        xy = (lo + hi) / 2
        if inside(xy[0], xy[1], boundary):
            xy = p[np.argmin(((p[:, :2] - xy) ** 2).sum(axis=1)), :2]
        if np.linalg.norm(xy - center) > args.radius:
            continue
        en = origin + xy @ axes
        base = float(terrain(en[0], en[1]))
        q10, q99, maximum = float(np.quantile(p[:, 2], .1)), float(np.quantile(p[:, 2], .995)), float(p[:, 2].max())
        if q99 < base + 2.8:
            continue
        # Bounded aggregate canopy; this is not an asserted stem position.
        radii = np.maximum(.65, (hi - lo) / 2 + .35)
        rgb = np.median(p[:, 4:7], axis=0)
        if rgb.max() > 255:
            rgb /= 256
        color = '#' + ''.join(f'{int(np.clip(v, 0, 255)):02x}' for v in rgb)
        peak_xy = grid_origin + np.array([peak[1] + .5, peak[0] + .5])
        peak_en = origin + peak_xy @ axes
        stable_id = f'als-canopy-{round(peak_en[0] * 10)}-{round(peak_en[1] * 10)}'
        crowns.append({'id': stable_id, 'x': round(float(xy[0]), 3), 'y': round(float(xy[1]), 3),
                       'baseZ': round(base, 3), 'topZ': round(q99, 3), 'observedMaxZ': round(maximum, 3),
                       'crownBaseZ': round(max(base + .6, min(q10, q99 - .8)), 3),
                       'radiusX': round(float(radii[0]), 3), 'radiusY': round(float(radii[1]), 3),
                       'pointCount': len(p), 'occupiedAreaM2': cells, 'sourceColor': color,
                       'kind': 'canopy' if q99 - base >= 4 else 'shrub', 'species': None,
                       'positionMeaning': 'ALS canopy aggregate centre; not surveyed trunk',
                       'heightMethod': '99.5th percentile vegetation return above interpolated DTM',
                       'sourceId': 'gugik-als-2024', 'acquired': SOURCE_DATE})
    crowns.sort(key=lambda t: t['id'])

    # Source-backed roof samples for neighbours where the app currently only
    # knows the ALS-median LoD1 top. Keep analytical source geometry unchanged.
    requested = {'building-' + str(i) for i in [2, 3, 4, 5, 6, 7, 8, 10, 19]}
    roof_output = []
    for b in site['buildings']:
        if b['id'] not in requested:
            continue
        ring = b['footprint']
        mask = inside(roof_points[:, 0], roof_points[:, 1], ring)
        p = roof_points[mask]
        if not len(p):
            continue
        cell = np.floor(p[:, 3:5]).astype(int)
        order = np.lexsort((-p[:, 2], cell[:, 1], cell[:, 0]))
        ordered_cells = cell[order]
        unique = np.r_[True, np.any(ordered_cells[1:] != ordered_cells[:-1], axis=1)]
        samples = p[order[unique], :3]
        if len(samples) > 150:
            indices = np.unique(np.r_[np.linspace(0, len(samples) - 1, 149).round().astype(int), np.argmax(samples[:, 2])])
            samples = samples[indices]
        roof_output.append({'buildingId': b['id'], 'officialId': b['officialId'], 'sourceId': 'gugik-als-2024',
                            'acquired': SOURCE_DATE, 'pointCount': len(p), 'observedMaxZ': round(float(p[:, 2].max()), 3),
                            'roofPoints': np.round(samples, 3).tolist(),
                            'meaning': 'Class-6 ALS maxima in 1 m native cells; sparse measured roof samples, not complete surveyed roof topology'})

    inventory = []
    if args.municipal_records and args.municipal_meta:
        records = json.loads(args.municipal_records.read_text())
        meta = json.loads(args.municipal_meta.read_text())
        domains = {f['name']: {c['code']: c['name'] for c in f['domain']['codedValues']}
                   for f in meta['fields'] if f.get('domain') and 'codedValues' in f['domain']}
        for f in records.get('features', []):
            a, g = f['attributes'], f['geometry']
            en = np.array([g['x'], g['y']])
            xy = (en - origin) @ axes.T
            if np.linalg.norm(xy - center) > args.radius or inside(xy[0], xy[1], boundary):
                continue
            inventory.append({'id': 'gzz-' + str(a['id_globalny']), 'globalId': a['id_globalny'],
                              'x': round(float(xy[0]), 3), 'y': round(float(xy[1]), 3),
                              'baseZ': round(float(terrain(en[0], en[1])), 3),
                              'species': domains['nazwa_lc'].get(a['nazwa_lc']),
                              'polishName': domains['nazwa_pl'].get(a['nazwa_pl']),
                              'status': a['status_drz'], 'plantedTimestamp': a['data_sadz'],
                              'circumference130Cm': a['najnowszy_obwod_130'], 'circumference100Cm': a['obwod_100'],
                              'heightM': None, 'crownRadiusM': None, 'sourceId': 'gdansk-tree-inventory-2026',
                              'geometryMeaning': 'Municipal inventoried tree location; height and crown not provided'})
        inventory.sort(key=lambda t: t['id'])
    result = {
        'schemaVersion': 1, 'generated': RETRIEVED_DATE, 'siteId': 'sternicza-11',
        'coordinates': frame, 'selection': {'centreXY': np.round(center, 6).tolist(), 'radiusM': args.radius,
                                            'excludeProperty': True, 'acquired': SOURCE_DATE},
        'sources': [
            {'id': 'gugik-als-2024', 'provider': 'GUGiK', 'title': 'Classified airborne LiDAR, 2024-10-01',
             'url': 'https://www.geoportal.gov.pl/pl/dane/dane-pomiarowe-lidar-lidar/',
             'retrieved': RETRIEVED_DATE, 'acquired': SOURCE_DATE, 'classes': [3, 4, 5],
             'nominalDensityPerM2': 12, 'tiles': tile_meta,
             'terrain': {'url': DTM_URL, 'sha256': digest(args.dtm), 'spacingM': 1, 'datum': 'PL-EVRF2007-NH'}},
            {'id': 'gdansk-tree-inventory-2026', 'provider': 'Gdański Zarząd Zieleni',
             'url': 'https://ckan.multimediagdansk.pl/dataset/drzewa-w-gdansku',
             'service': MUNICIPAL_URL, 'retrieved': RETRIEVED_DATE,
             'catalogueUpdated': '2026-10-22', 'catalogueLicense': 'No License Provided',
             'recordCountInQuery': 31, 'queryBoundsEN': [475840, 726660, 476290, 727130]}],
        'derivation': {'rasterM': 1, 'minimumPointsPerCell': 3, 'minimumCanopyCellHeightM': 2.5,
                       'localMaximumFilterCells': 5, 'minimumPeakSpacingM': 5, 'minimumClusterPoints': 35,
                       'minimumClusterAreaM2': 4, 'topPercentile': 99.5, 'crownExtentPercentiles': [1, 99],
                       'crownExtentPaddingM': .35, 'method': 'Connected occupied 1m vegetation cells; local height maxima; nearest-maximum partition within each component'},
        'counts': {'vegetationReturnsSelected': len(points), 'canopyAggregates': len(crowns),
                   'municipalInventoryRecords': len(inventory)},
        'limitations': [
            'A canopy aggregate may represent part of one crown or overlapping crowns from multiple trees; count is not a tree census.',
            'Canopy centres are not surveyed trunk positions; generated trunks and leaf forms are visual approximations.',
            'Species and deciduous/evergreen identity cannot be established from these LiDAR classifications.',
            'LiDAR acquisition was 2024-10-01; growth, removals and planting since then may change the real scene.',
            'Crown bounds and top are robust sampled envelopes; foliage gaps and seasonal opacity are not measured.',
            'The municipal inventory is incomplete in this neighbourhood and provides neither tree height nor crown width.',
            'Recent municipal plantings must not be matched to older LiDAR crowns without independent confirmation.'
        ],
        'canopies': crowns, 'inventory': inventory,
    }
    (args.output_dir / 'sternicza-surrounding-nature.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    (args.output_dir / 'sternicza-neighbor-roofs.json').write_text(json.dumps({'schemaVersion': 1, 'sourceId': 'gugik-als-2024', 'buildings': roof_output}, separators=(',', ':')) + '\n')
    print(json.dumps(result['counts']), 'roofBuildings', len(roof_output), flush=True)


if __name__ == '__main__':
    main()
