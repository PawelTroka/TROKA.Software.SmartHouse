#!/usr/bin/env python3
"""Rebuild Korzeniowskiego 40 from official ULDK / GUGiK source files.

Python dependencies: numpy, pyproj, laspy[lazrs].  No files from Sternicza's
derived site dataset are used.  Large upstream downloads remain outside git.

Example (source-dir contains the named downloaded files):
  python scripts/build-korzeniowskiego-data.py --source-dir ../ --output data/korzeniowskiego-40.json

Pass --download to obtain missing files from the recorded official URLs.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import re
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

import numpy as np
from pyproj import Proj, Transformer
import laspy

URLS = {
    'parcel': 'https://uldk.gugik.gov.pl/?request=GetParcelById&id=226101_1.0034.160&result=geom_wkt&srid=2180',
    'buildings': 'https://opendata.geoportal.gov.pl/InneDane/Budynki3D/LOD1/2024/22/2261.zip',
    'terrain': 'https://opendata.geoportal.gov.pl/NumDaneWys/NMT/81008/81008_1561323_N-34-50-C-d-1-1.asc',
    'lidar': 'https://opendata.geoportal.gov.pl/NumDaneWys/DanePomiaroweLAZ/81005/81005_1559924_N-34-50-C-d-1-1-1-3.laz',
}
FILES = {'parcel': 'tmp/korzeniowskiego_uldk160.txt', 'buildings': 'gdansk_lod1_2024.zip',
         'terrain': 'sternicza_dtm_2024.asc', 'lidar': 'korzeniowskiego_lidar_2024.laz'}
TILE = '2261_N-34-50-c-d-1-1.gml'
HOUSE_ID = 'ID-2261-26BC7443-1A46-FAF6-E053-CA2BA8C0FAE4'
TARGETS = {
    'ID-2261-26BC7443-6679-FAF6-E053-CA2BA8C0FAE4': (1, 'Right neighbour · east'),
    'ID-2261-26BC7443-196A-FAF6-E053-CA2BA8C0FAE4': (3, 'Left neighbour · west'),
    'ID-2261-26BC7443-2550-FAF6-E053-CA2BA8C0FAE4': (8, 'Rear neighbour · right'),
    'ID-2261-26BC7443-17D1-FAF6-E053-CA2BA8C0FAE4': (9, 'Rear neighbour · centre'),
    'ID-2261-26BC7443-1B11-FAF6-E053-CA2BA8C0FAE4': (12, 'Rear neighbour · left'),
}


def polygon_area(p):
    return abs(sum(a[0] * b[1] - a[1] * b[0] for a, b in zip(p, p[1:]))) / 2


def inside(x, y, polygon):
    result = np.zeros(np.shape(x), dtype=bool)
    for a, b in zip(polygon, polygon[1:]):
        result ^= ((a[1] > y) != (b[1] > y)) & (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1] + 1e-99) + a[0])
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=Path('data/korzeniowskiego-40.json'))
    parser.add_argument('--download', action='store_true')
    parser.add_argument('--lod1-only', action='store_true', help='Build an explicitly labelled median-roof draft without the large LiDAR download')
    args = parser.parse_args()
    paths = {k: args.source_dir / name for k, name in FILES.items()}
    for key, path in paths.items():
        if key == 'lidar' and args.lod1_only:
            continue
        if not path.exists():
            if not args.download:
                raise FileNotFoundError(f'{path}; download from {URLS[key]} or pass --download')
            path.parent.mkdir(parents=True, exist_ok=True)
            with urllib.request.urlopen(URLS[key], timeout=60) as r, path.open('wb') as f:
                while block := r.read(1024 * 1024):
                    f.write(block)

    text = paths['parcel'].read_text()
    match = re.search(r'POLYGON\s*\(\(([^)]+)\)\)', text)
    if not match:
        raise ValueError('ULDK did not return a polygon')
    parcel = np.array([[float(c) for c in point.split()] for point in match[1].split(',')])
    # Front edge is the southern parcel edge adjoining Korzeniowskiego street.
    # Origin = east/front corner; +x goes WNW (physical left), +y NNE (rear).
    origin = np.array([475998.683007155, 727109.489125105])
    front_left = np.array([475984.796864783, 727116.982309508])
    ux = (front_left - origin) / np.linalg.norm(front_left - origin)
    uy = np.array([ux[1], -ux[0]])
    assert np.linalg.det(np.array([ux, uy])) < 0

    def local(p):
        p = np.asarray(p)
        plan = p[..., :2] - origin
        xy = np.stack([plan @ ux, plan @ uy], axis=-1)
        return np.concatenate([xy, p[..., 2:]], axis=-1) if p.shape[-1] > 2 else xy

    # Reorder from east/front to west/front to rear; local polygon is CCW.
    unique = parcel[:-1]
    start = int(np.argmin(np.linalg.norm(unique - origin, axis=1)))
    nxt = int(np.argmin(np.linalg.norm(unique - front_left, axis=1)))
    step = 1 if (nxt - start) % len(unique) == 1 else -1
    ordered = np.array([unique[(start + step * i) % len(unique)] for i in range(len(unique))] + [unique[start]])
    boundary = local(ordered)
    assert boundary[1, 0] > 15 and abs(boundary[1, 1]) < 1e-6
    area = polygon_area(boundary)
    assert 465 < area < 471

    # Native 1 m DTM: source filename is historical; the complete official tile
    # covers both properties. The crop below uses this property's coordinates.
    with paths['terrain'].open() as f:
        header = {k.lower(): float(v) for k, v in (f.readline().split() for _ in range(6))}
        grid = np.loadtxt(f)
    def terrain_en(e, n):
        gx = (e - header['xllcenter']) / header['cellsize']
        gy = (n - header['yllcenter']) / header['cellsize']
        col, row = int(math.floor(gx)), int(math.floor(gy))
        dx, dy = gx - col, gy - row
        north_up = grid[::-1]
        vals = north_up[row:row + 2, col:col + 2]
        if vals.shape != (2, 2) or np.any(vals == header['nodata_value']):
            raise ValueError('Missing terrain inside property crop')
        return float((1 - dy) * ((1 - dx) * vals[0, 0] + dx * vals[0, 1]) + dy * ((1 - dx) * vals[1, 0] + dx * vals[1, 1]))
    def ground(x, y):
        return terrain_en(*(origin + x * ux + y * uy))

    # Official LoD1 footprints and source median roof/base elevations.
    ns = {'b': 'http://www.opengis.net/citygml/building/2.0', 'g': 'http://www.opengis.net/gml'}
    with zipfile.ZipFile(paths['buildings']) as archive:
        tree = ET.fromstring(archive.read(TILE))
    nearby = []
    reference = np.array([475999.5, 727125.0])
    for element in tree.findall('.//b:Building', ns):
        pos = element.find('.//g:posList', ns)
        if pos is None:
            continue
        xyz = np.array(list(map(float, pos.text.split()))).reshape(-1, 3)
        centroid = xyz[:-1, :2].mean(axis=0)
        distance = float(np.linalg.norm(centroid - reference))
        if distance > 75:
            continue
        height = float(element.find('b:measuredHeight', ns).text)
        nearby.append({'officialId': element.attrib['{' + ns['g'] + '}id'], 'EN': xyz[:, :2], 'baseZ': float(xyz[0, 2]),
                       'height': height, 'distance': distance})
    nearby.sort(key=lambda b: (b['distance'], b['officialId']))
    house_source = next(b for b in nearby if b['officialId'] == HOUSE_ID)
    assert all(inside(np.array([p[0]]), np.array([p[1]]), ordered)[0] for p in house_source['EN'][:-1])

    # Sample class-6 roof returns for the house and selected privacy neighbours.
    roof_sources = [b for b in nearby if b['officialId'] == HOUSE_ID or b['officialId'] in TARGETS]
    clouds = {b['officialId']: [] for b in roof_sources}
    if not args.lod1_only:
      with laspy.open(paths['lidar']) as reader:
        if not (reader.header.mins[0] <= reference[0] <= reader.header.maxs[0] and reader.header.mins[1] <= reference[1] <= reader.header.maxs[1]):
            raise ValueError('Wrong LiDAR tile: property outside header bounds')
        for chunk in reader.chunk_iterator(1_000_000):
            mask = np.asarray(chunk.classification) == 6
            x, y, z = np.asarray(chunk.x)[mask], np.asarray(chunk.y)[mask], np.asarray(chunk.z)[mask]
            for b in roof_sources:
                p = b['EN']
                box = (x >= p[:, 0].min()) & (x <= p[:, 0].max()) & (y >= p[:, 1].min()) & (y <= p[:, 1].max())
                if not box.any():
                    continue
                xx, yy, zz = x[box], y[box], z[box]
                keep = inside(xx, yy, p) & (zz > b['baseZ'] + 2)
                if keep.any():
                    clouds[b['officialId']].append(np.stack([xx[keep], yy[keep], zz[keep]], axis=1))

    def downsample_max(points, cell):
        # Deterministic maximum per plan voxel retains sampled high roof edges.
        buckets = {}
        for p in points:
            key = (math.floor(p[0] / cell), math.floor(p[1] / cell))
            if key not in buckets or p[2] > buckets[key][2]:
                buckets[key] = p
        return np.array([buckets[k] for k in sorted(buckets)])

    buildings = []
    house = None
    reserved = {0, *[n for n, _ in TARGETS.values()]}
    next_index = 100
    point_counts = {}
    for raw in nearby:
        oid = raw['officialId']
        is_house = oid == HOUSE_ID
        target = TARGETS.get(oid)
        if is_house:
            index, label, kind = 0, 'Korzeniowskiego 40', 'house'
        elif target:
            index, label = target
            kind = 'target'
        else:
            index, label, kind = next_index, f'Mapped neighbour {next_index}', 'context'
            next_index += 1
        footprint = local(raw['EN'])
        cloud_parts = clouds.get(oid, [])
        cloud = np.concatenate(cloud_parts) if cloud_parts else np.empty((0, 3))
        point_counts[oid] = len(cloud)
        roof = local(downsample_max(cloud, .65 if is_house else .9)) if len(cloud) else np.empty((0, 3))
        roof_z = raw['baseZ'] + raw['height']
        roof_top = float(cloud[:, 2].max()) if len(cloud) else roof_z
        samples = []
        if target:
            if not len(roof):
                if not args.lod1_only:
                    raise ValueError(f'Missing roof returns for target {oid}')
                lo, hi = footprint.min(axis=0), footprint.max(axis=0)
                roof = np.array([[float(x), float(y), roof_z] for x in np.arange(lo[0], hi[0] + .01, 1.2)
                                 for y in np.arange(lo[1], hi[1] + .01, 1.2)
                                 if inside(np.array([x]), np.array([y]), footprint)[0]])
            samples = roof.tolist()
            for a, b in zip(footprint, footprint[1:]):
                count = max(1, math.ceil(float(np.linalg.norm(b - a)) / 1.5))
                for i in range(count):
                    q = a + (b - a) * ((i + .5) / count)
                    for z in np.arange(raw['baseZ'] + 2, roof_z + .01, 2):
                        samples.append([float(q[0]), float(q[1]), float(z)])
        building = {'id': f'building-{index}', 'index': index, 'officialId': oid, 'label': label,
                    'footprint': np.round(footprint, 8).tolist(), 'baseZ': raw['baseZ'],
                    'roofZ': round(roof_z, 3), 'roofTopZ': round(roof_top, 3), 'kind': kind,
                    'roofPoints': np.round(roof, 8).tolist(), 'highFeatures': [],
                    'samples': np.round(samples, 8).tolist(), 'roofSampleCount': len(roof) if target else 0,
                    'source': '2024 GUGiK LiDAR + LoD1 footprint' if len(cloud) else '2024 GUGiK LoD1 median roof'}
        if is_house:
            house = building
        else:
            buildings.append(building)

    # Longest actual rear facade facet: a 5.26 m edge, without flattening the
    # small mapped rear-wall steps into a claimed measured straight facade.
    hp = np.array(house['footprint'])
    rear_edges = [(a, b) for a, b in zip(hp, hp[1:]) if min(a[1], b[1]) > 16.5]
    rear_edge = max(rear_edges, key=lambda ab: np.linalg.norm(ab[1] - ab[0]))
    rear_edge = sorted([rear_edge[0].tolist(), rear_edge[1].tolist()])
    house['rearEdge'] = rear_edge
    # Reference near the middle of the mapped rear envelope, distinct from the
    # shifted proposed terrace's centre.
    rear_midpoint = [float((hp[:, 0].min() + hp[:, 0].max()) / 2), float(hp[:, 1].max())]
    floor_xy = [rear_midpoint[0], rear_midpoint[1] + 1]
    # Proposed floor-height connector bridges the mapped slanted/stepped rear
    # facade to the rectangular terrace, overlapping the house footprint.
    terrace = {'x': 5.2, 'y': float(hp[:, 1].max()), 'width': 7.5, 'depth': 4.2, 'maxDepth': 6, 'thresholdDepth': .4}
    pool = {'x': 2.6, 'y': 20.1, 'width': 2.2, 'length': 8.5}
    sofa = [9.5, 14.2]
    garden = [10.8, 26.0]
    assert inside(np.array([sofa[0]]), np.array([sofa[1]]), hp)[0]
    for x in [pool['x'] - .28, pool['x'] + pool['width'] + .28]:
        for y in [pool['y'] - .28, pool['y'] + pool['length'] + .28]:
            assert inside(np.array([x]), np.array([y]), boundary)[0], 'Pool coping outside parcel'
    assert pool['x'] + pool['width'] + .28 < terrace['x'], 'Pool coping overlaps terrace'

    # Crop includes the whole parcel and a 10 m rim, in native East/North grid.
    min_e, min_n = np.floor(ordered.min(axis=0) - 10).astype(int)
    max_e, max_n = np.ceil(ordered.max(axis=0) + 10).astype(int)
    terrain_values = [round(terrain_en(e, n), 2) for n in range(min_n, max_n + 1) for e in range(min_e, max_e + 1)]
    longitude, latitude = Transformer.from_crs(2180, 4326, always_xy=True).transform(*house_source['EN'][:-1].mean(axis=0))
    convergence = Proj('EPSG:2180').get_factors(longitude, latitude).meridian_convergence
    y_azimuth = math.degrees(math.atan2(uy[0], uy[1])) % 360
    result = {
        'schemaVersion': 1, 'created': '2026-11-12', 'roofEvidence': 'LoD1 median roofs only' if args.lod1_only else 'LiDAR for house and five privacy neighbours; LoD1 medians for other context',
        'coordinates': {'localOriginEN': origin.tolist(), 'xUnitEN': ux.tolist(), 'yUnitEN': uy.tolist(),
                        'horizontalCRS': 'EPSG:2180', 'verticalDatum': 'PL-EVRF2007-NH',
                        'yGridAzimuth': y_azimuth, 'latitude': latitude, 'longitude': longitude,
                        'meridianConvergence': convergence, 'gridConvergenceDegrees': convergence, 'yTrueAzimuth': y_azimuth + convergence},
        'site': {'id': 'korzeniowskiego-40', 'address': 'Konrada Korzeniowskiego 40, Gdańsk Brzeźno',
                 'streetLabel': 'KORZENIOWSKIEGO', 'sideLabels': {'left': 'west', 'right': 'east'},
                 'boundary': np.round(boundary, 8).tolist(), 'boundaryNames': ['street', 'left', 'rear', 'rear', 'right'],
                 'parcels': ['226101_1.0034.160'], 'area': round(area, 2), 'advertisedArea': 480,
                 'frontage': float(boundary[1, 0]), 'depth': float(boundary[:, 1].max()),
                 'frontSetback': float(hp[:, 1].min()), 'house': house, 'garage': None,
                 'rearMidpoint': rear_midpoint, 'floorReference': {'xy': floor_xy, 'z': ground(*floor_xy)},
                 'observers': {'sofa': sofa, 'standing': sofa, 'garden': garden},
                 'terrace': terrace, 'pool': pool,
                 'jacuzzi': {'x': terrace['x'] + .15, 'y': rear_midpoint[1] + 1.45, 'width': 2.2, 'length': 2.2},
                 'defaultFloorHeight': 1.7, 'defaultGardenRaise': .5,
                 'designNotes': ['The 7.5 m wide terrace is shifted toward the physical left/west side to keep the 8.5 × 2.2 m right/east pool clear of its edge.',
                                 'Terrace, jacuzzi, pool, canopy, assumed living-room position and +1.7 m floor offset are proposals / prior planning assumptions, not measured existing features.',
                                 'The parcel area calculated from official ULDK vertices is 468 m²; the older advert used 480 m². The simulator follows the mapped boundary.',
                                 'No detached garage footprint is present within parcel 160 in the supplied 2024 LoD1 data. This does not establish the absence of small unrecorded sheds.']},
        'buildings': buildings,
        'terrain': {'originEN': [int(min_e), int(min_n)], 'columns': int(max_e - min_e + 1), 'rows': int(max_n - min_n + 1),
                    'cellSize': 1, 'rowOrder': 'north-increasing', 'elevations': terrain_values,
                    'outside': 'Clamp to crop edge; contextual buildings retain their source base elevations.'},
        'sources': [
            {'title': 'GUGiK ULDK — parcel 226101_1.0034.160', 'url': URLS['parcel'], 'details': 'Official cadastral polygon in EPSG:2180, retrieved 2026-11-12. Polygon-derived area 468 m²; no ownership/title verification.'},
            {'title': 'GUGiK 2024 3D buildings (LoD1)', 'url': URLS['buildings'], 'details': 'Official footprint and median ALS roof/base values, tile ' + TILE + '. Context buildings outside the sampled six retain flat median roofs.'},
            {'title': 'GUGiK 1 m digital terrain model', 'url': URLS['terrain'], 'details': 'Acquired 2024-10-01, PL-EVRF2007-NH. Native grid cropped specifically around Korzeniowskiego 40, with bilinear sampling.'},
            *([] if args.lod1_only else [{'title': 'GUGiK 2024 LiDAR roof returns', 'url': URLS['lidar'], 'details': 'Tile N-34-50-C-d-1-1-1-3, acquired 2024-10-01; class 6 inside official house and five neighbour footprints. Maximum return per 0.65 m house / 0.9 m neighbour plan voxel.'}]),
            {'title': 'GUGiK official orthophoto', 'url': 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/HighResolution', 'details': 'Used to cross-check address, street frontage and north-northeast rear-garden orientation.'},
            {'title': 'Prior property listing', 'url': 'https://www.otodom.pl/pl/oferta/brzezno-dom-300-m-od-morza-prywatnie-ID4wArq', 'details': 'Prior user-linked listing associated with this property; 480 m² advertised, not the mapped polygon area used by the simulator.'},
        ],
        'limitations': [
            'Official cadastral geometry is not an ownership, boundary-staking or current land survey.',
            'The prior +1.7 m living floor assumption is editable and unmeasured; existing ground follows 2024 DTM.',
            ('All roofs are LoD1 medians and omit ridges and roof fixtures.' if args.lod1_only else 'House and five neighbour roofs use reduced class-6 LiDAR samples; unsampled details, roof fixtures and later alterations can differ. Other context roofs are LoD1 medians.'),
            'Five nearby house volumes are sampled for privacy. Coverage is blocked sample rays from one observer, not whole-garden privacy or visual-field area.',
            'New thujas are opaque comparison screens; existing trees, gaps and small sheds are not surveyed occluders.',
            'The terrace, pool, jacuzzi, canopy, openings, furniture and finishes are design proposals. Their fit does not establish engineering or planning approval.',
        ],
        'provenance': {'generator': 'scripts/build-korzeniowskiego-data.py', 'houseEwidencyjnyId': '226101_1.0034.287_BUD',
                       'sourceTile': TILE, 'rawClass6PointCounts': point_counts,
                       'frameDefinition': 'Origin at east/front parcel corner, +x toward WNW along street = physical left; +y perpendicular into NNE rear garden. East/North basis determinant -1.'},
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(json.dumps({'output': str(args.output), 'area': result['site']['area'], 'frontage': result['site']['frontage'],
                      'depth': result['site']['depth'], 'rearTrueAzimuth': result['coordinates']['yTrueAzimuth'],
                      'houseRoofTop': house['roofTopZ'], 'targets': [(b['index'], b['label'], len(b['samples'])) for b in buildings if b['kind'] == 'target'],
                      'terrainRange': [min(terrain_values), max(terrain_values)], 'sourceRoofCounts': point_counts}, ensure_ascii=False))


if __name__ == '__main__':
    main()
