#!/usr/bin/env python3
"""Append verified GUGiK LoD1 buildings around Sternicza, preserving old geometry.

Only Python's standard library is required. The original ZIP and DTM are not
committed. Obtain them from the URLs below, or reuse the downloaded originals.

  python scripts/expand-sternicza-neighborhood.py \
    --source-archive /path/to/gdansk_lod1_2024.zip \
    --source-dtm /path/to/sternicza_dtm_2024.asc

The source extract is retained beside the app dataset so every added footprint
and height can be audited without downloading the county archive. Context
terrain is a separate 4 m rendering grid; the original analytical terrain,
house, existing buildings, roof returns and target samples are never changed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile


ARCHIVE_URL = 'https://opendata.geoportal.gov.pl/InneDane/Budynki3D/LOD1/2024/22/2261.zip'
DTM_URL = 'https://opendata.geoportal.gov.pl/NumDaneWys/NMT/81008/81008_1561323_N-34-50-C-d-1-1.asc'
DOCUMENTATION_URL = 'https://www.geoportal.gov.pl/pl/dane/inne-dane/modele-3d-budynkow/'
TILE = '2261_N-34-50-c-d-1-1.gml'
SOURCE_RETRIEVED = '2026-11-11'
EXPANDED = '2026-11-13'
NS = {'b': 'http://www.opengis.net/citygml/building/2.0',
      'g': 'http://www.opengis.net/gml',
      'a': 'http://www.opengis.net/citygml/generics/2.0'}


def sha256_bytes(value):
    return hashlib.sha256(value).hexdigest()


def centroid(ring):
    vertices = ring[:-1] if ring[0] == ring[-1] else ring
    twice_area = sx = sy = 0.0
    for i, a in enumerate(vertices):
        b = vertices[(i + 1) % len(vertices)]
        cross = a[0] * b[1] - b[0] * a[1]
        twice_area += cross
        sx += (a[0] + b[0]) * cross
        sy += (a[1] + b[1]) * cross
    if abs(twice_area) < 1e-9:
        raise ValueError('Degenerate building footprint')
    return [sx / (3 * twice_area), sy / (3 * twice_area)]


def inside(point, ring):
    result = False
    for a, b in zip(ring, ring[1:]):
        if (a[1] > point[1]) != (b[1] > point[1]):
            result ^= point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]
    return result


def edge_distance(point, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    denominator = dx * dx + dy * dy
    t = max(0, min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / denominator)) if denominator else 0
    return math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy)


def polygon_distance(point, ring):
    return 0 if inside(point, ring) else min(edge_distance(point, a, b) for a, b in zip(ring, ring[1:]))


def parse_lod1(xml_bytes):
    root = ET.fromstring(xml_bytes)
    records = []
    for element in root.findall('.//b:Building', NS):
        floor = element.find('.//g:surfaceMember/g:Polygon', NS)
        if floor is None:
            raise ValueError('Missing solid floor polygon')
        pos = floor.find('./g:exterior/g:LinearRing/g:posList', NS)
        values = list(map(float, pos.text.split())) if pos is not None else []
        if not values or len(values) % 3:
            raise ValueError('Malformed source footprint')
        points = [values[i:i + 3] for i in range(0, len(values), 3)]
        base_z = points[0][2]
        if any(abs(p[2] - base_z) > 1e-7 for p in points):
            raise ValueError('First LoD1 surface is not a horizontal floor')
        if points[0] != points[-1]:
            points.append(points[0])
        height = float(element.find('b:measuredHeight', NS).text)
        attrs = {a.attrib['name']: a.find('a:value', NS).text for a in element.findall('a:stringAttribute', NS)}
        records.append({'officialId': element.attrib['{' + NS['g'] + '}id'],
                        'footprintEN': [p[:2] for p in points], 'baseZ': base_z,
                        'measuredHeight': height, 'attributes': attrs,
                        'interiorRingCount': len(floor.findall('./g:interior', NS))})
    records.sort(key=lambda b: b['officialId'])
    if len({b['officialId'] for b in records}) != len(records):
        raise ValueError('Duplicate official building identifiers')
    return records


def frame_functions(frame):
    origin, ux, uy = (frame[k] for k in ['localOriginEN', 'xUnitEN', 'yUnitEN'])
    def local(p):
        e, n = p[0] - origin[0], p[1] - origin[1]
        return [e * ux[0] + n * ux[1], e * uy[0] + n * uy[1]]
    def native(p):
        return [origin[i] + p[0] * ux[i] + p[1] * uy[i] for i in range(2)]
    return local, native


def context_description(center, reference, native, bounds):
    dx, dy = center[0] - reference[0], center[1] - reference[1]
    e, n = native(center), native(reference)
    compass = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
               'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
    compass_direction = compass[int((math.degrees(math.atan2(e[0] - n[0], e[1] - n[1])) + 360 + 11.25) // 22.5) % 16]
    distance = math.hypot(dx, dy)
    if center[1] < 0:
        side, title = 'across-street', 'Across Sternicza'
    elif center[1] > bounds['maxY'] and abs(dy) >= abs(dx):
        side, title = 'rear', 'Rear neighbourhood'
    elif center[0] >= reference[0]:
        side, title = 'east-side', 'East neighbourhood'
    else:
        side, title = 'west-side', 'West neighbourhood'
    direction = 'front' if abs(dy) >= abs(dx) and dy < 0 else 'rear' if abs(dy) >= abs(dx) else 'east' if dx >= 0 else 'west'
    return {'direction': direction, 'streetSide': side, 'compassDirection': compass_direction,
            'centroidXY': [round(v, 8) for v in center], 'centroidDistanceM': round(distance, 3)}, f'{title} · {compass_direction} · {distance:.0f} m'


def bounds_of(rings):
    points = [p for ring in rings for p in ring]
    return {'minX': min(p[0] for p in points), 'maxX': max(p[0] for p in points),
            'minY': min(p[1] for p in points), 'maxY': max(p[1] for p in points)}


def build_context_terrain(path, points_en, frame):
    cell = 4
    min_e = math.floor((min(p[0] for p in points_en) - 12) / cell) * cell
    max_e = math.ceil((max(p[0] for p in points_en) + 12) / cell) * cell
    min_n = math.floor((min(p[1] for p in points_en) - 12) / cell) * cell
    max_n = math.ceil((max(p[1] for p in points_en) + 12) / cell) * cell
    with path.open() as stream:
        header = {key.lower(): float(value) for key, value in (stream.readline().split() for _ in range(6))}
        if header['cellsize'] != 1 or 'xllcenter' not in header or 'yllcenter' not in header:
            raise ValueError('Expected the recorded native 1 m DTM with centre coordinates')
        if any(header[key] != int(header[key]) for key in ['xllcenter', 'yllcenter']):
            raise ValueError('Context extraction requires the recorded integer-aligned source grid')
        x0, y0 = header['xllcenter'], header['yllcenter']
        wanted_x = [int(e - x0) for e in range(min_e, max_e + 1, cell)]
        wanted_y = {int(n - y0): n for n in range(min_n, max_n + 1, cell)}
        if min(wanted_x) < 0 or max(wanted_x) >= header['ncols'] or min(wanted_y) < 0 or max(wanted_y) >= header['nrows']:
            raise ValueError('Context crop exceeds the source DTM')
        rows = {}
        for file_row, line in enumerate(stream):
            north_increasing_row = int(header['nrows']) - 1 - file_row
            if north_increasing_row not in wanted_y:
                continue
            values = line.split()
            row = [float(values[i]) for i in wanted_x]
            if any(v == header['nodata_value'] or not math.isfinite(v) for v in row):
                raise ValueError('Missing context terrain sample')
            rows[wanted_y[north_increasing_row]] = row
    expected_rows = (max_n - min_n) // cell + 1
    if len(rows) != expected_rows:
        raise ValueError('Incomplete DTM crop')
    local, _ = frame_functions(frame)
    corners = [local([e, n]) for e, n in [[min_e, min_n], [max_e, min_n], [max_e, max_n], [min_e, max_n]]]
    return {'originEN': [min_e, min_n], 'columns': len(wanted_x), 'rows': expected_rows,
            'cellSize': cell, 'rowOrder': 'north-increasing',
            'elevations': [v for n in sorted(rows) for v in rows[n]],
            'outside': 'Rendering only; clamp to context crop edge.', 'purpose': 'rendering-only',
            'sourceUrl': DTM_URL, 'sourceAcquisitionDate': '2024-10-01',
            'resampling': 'Every fourth native 1 m grid centre; no property analytical grid cells are replaced.',
            'bounds': bounds_of([corners])}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-archive', type=Path, required=True)
    parser.add_argument('--source-dtm', type=Path, required=True)
    parser.add_argument('--site', type=Path, default=Path('data/site-data.json'))
    parser.add_argument('--source-snapshot', type=Path, default=Path('data/sternicza-neighborhood-source.json'))
    parser.add_argument('--radius', type=float, default=200)
    args = parser.parse_args()
    if not 0 < args.radius <= 250:
        raise ValueError('Choose a positive radius of at most 250 m within this source tile')
    data = json.loads(args.site.read_text())
    # Remove only records generated by this script before a deterministic rebuild.
    generated_ids = set(data.get('neighborhood', {}).get('addedBuildingIds', []))
    original_buildings = [b for b in data['buildings'] if b['id'] not in generated_ids]
    original_objects = [*original_buildings, data['site']['house']]
    if data['site'].get('garage'):
        original_objects.append(data['site']['garage'])
    original_ids = {b['officialId'] for b in original_objects}
    local, native = frame_functions(data['coordinates'])
    reference = centroid(data['site']['house']['footprint'])
    reference_en = native(reference)
    archive_bytes = args.source_archive.read_bytes()
    with zipfile.ZipFile(args.source_archive) as archive:
        xml_bytes = archive.read(TILE)
    sources = parse_lod1(xml_bytes)
    selected = []
    additions = []
    plot_bounds = bounds_of([data['site']['boundary']])
    source_by_id = {b['officialId']: b for b in sources}
    # Check source/frame identity, not just the source's filename.
    for original in original_objects:
        raw = source_by_id[original['officialId']]
        transformed = [local(p) for p in raw['footprintEN']]
        if len(transformed) != len(original['footprint']) or any(math.dist(a, b) > 2e-7 for a, b in zip(transformed, original['footprint'])):
            raise ValueError(f'Source footprint changed: {original["id"]}')
        if abs(raw['baseZ'] - original['baseZ']) > 1e-7:
            raise ValueError(f'Source base elevation changed: {original["id"]}')
    for source_rank, raw in enumerate(sources):
        footprint = [local(p) for p in raw['footprintEN']]
        distance = polygon_distance(reference, footprint)
        if distance > args.radius:
            continue
        if raw['interiorRingCount']:
            raise ValueError(f'Selected footprint has unsupported courtyard holes: {raw["officialId"]}')
        selected.append(raw)
        if raw['officialId'] in original_ids:
            continue
        if raw['measuredHeight'] <= 0:
            raise ValueError(f'Nonpositive source height: {raw["officialId"]}')
        index = 1000 + source_rank
        context, label = context_description(centroid(footprint), reference, native, plot_bounds)
        attrs = raw['attributes']
        roof_z = round(raw['baseZ'] + raw['measuredHeight'], 8)
        additions.append({'id': f'building-{index}', 'index': index, 'officialId': raw['officialId'],
                          'label': label, 'footprint': [[round(v, 8) for v in p] for p in footprint],
                          'baseZ': raw['baseZ'], 'roofZ': roof_z, 'roofTopZ': roof_z,
                          'kind': 'context', 'roofPoints': [], 'highFeatures': [], 'samples': [], 'roofSampleCount': 0,
                          'source': '2024 GUGiK LoD1; source footprint and ALS median roof, not surveyed ridge height',
                          'sourceDetails': {'dataset': 'GUGiK LoD1 2024', 'tile': TILE,
                                            'heightMethod': 'ALS building-class median',
                                            'sourceMeasuredHeightM': raw['measuredHeight'],
                                            'roofSourceYear': attrs.get('aktZrodla'),
                                            'roofSourceType': attrs.get('zrodloDach'),
                                            'geometryVersion': attrs.get('wersjaId'),
                                            'buildingId': attrs.get('buildingId'),
                                            'namespace': attrs.get('przestNazw')},
                          'context': {**context, 'nearestFootprintDistanceM': round(distance, 3)}})
    additions.sort(key=lambda b: (b['context']['centroidDistanceM'], b['officialId']))
    data['buildings'] = original_buildings + additions
    if len({b['id'] for b in data['buildings']}) != len(data['buildings']):
        raise ValueError('Generated ID collides with an existing record')
    all_rings = [b['footprint'] for b in data['buildings']]
    data['contextTerrain'] = build_context_terrain(args.source_dtm, [p for r in all_rings for p in map(native, r)], data['coordinates'])
    labels = {}
    contexts = {}
    for original in original_buildings:
        if original['kind'] != 'context':
            continue
        context, label = context_description(centroid(original['footprint']), reference, native, plot_bounds)
        labels[original['id']] = label
        contexts[original['id']] = context
    data['neighborhood'] = {
        'expanded': EXPANDED, 'radiusM': args.radius,
        'referenceXY': reference, 'referenceEN': reference_en,
        'bounds': bounds_of(all_rings),
        'originalBuildingCount': len(original_buildings), 'addedBuildingCount': len(additions),
        'totalBuildingCount': len(data['buildings']),
        'acrossStreetCount': sum(centroid(b['footprint'])[1] < 0 for b in data['buildings']),
        'originalBuildingIds': [b['id'] for b in original_buildings],
        'addedBuildingIds': [b['id'] for b in additions],
        'labelsById': labels, 'originalContextById': contexts,
        'sourceUrl': ARCHIVE_URL, 'sourceTile': TILE,
        'sourceArchiveSha256': sha256_bytes(archive_bytes), 'sourceTileSha256': sha256_bytes(xml_bytes),
        'sourceSnapshot': 'data/sternicza-neighborhood-source.json',
        'selectionMethod': f'All source building footprints touching a {args.radius:g} m circle about the mapped house centroid; house and garage excluded from the surrounding list.',
        'labelMethod': 'Descriptive street side, EPSG:2180 compass sector and centroid distance; these are not verified postal addresses.',
        'heightMethod': 'Added bodies retain the official LoD1 base and ALS median height. Flat tops do not represent surveyed roof ridges or complete rooftop objects.',
        'analysisScope': 'Existing five target sample sets stay unchanged. Added context bodies are real blockers and can be selected for a separate dense facade check.',
        'terrainScope': 'Separate 4 m contextTerrain is for rendering only; the original terrain remains the analytical grid.'}
    expansion_source = {
        'title': 'Sternicza neighbourhood expansion', 'url': ARCHIVE_URL,
        'details': f'{len(additions)} additional source footprints within {args.radius:g} m nearest-footprint distance, processed {EXPANDED}; '
                   'official LoD1 ALS median heights, descriptive direction labels, and a retained source extract. '
                   'The original site, buildings and analytical terrain are preserved. See data/sternicza-neighborhood-source.json.'}
    data['sources'] = [s for s in data['sources'] if s.get('title') != expansion_source['title']] + [expansion_source]
    context_limit = ('Expanded neighbourhood context uses 2024 source footprints and approximate LoD1 median roof bodies. '
                     'Labels describe directions and distances, not verified postal addresses or current building condition. '
                     'The separate 4 m surrounding terrain is for rendering only; the original analytical terrain remains unchanged.')
    data['limitations'] = [s for s in data['limitations'] if not s.startswith('Expanded neighbourhood context uses ')] + [context_limit]
    snapshot = {'provider': 'Główny Urząd Geodezji i Kartografii (GUGiK)',
                'dataset': 'Gdańsk 2024 LoD1 buildings', 'sourceUrl': ARCHIVE_URL,
                'documentationUrl': DOCUMENTATION_URL, 'sourceRetrieved': SOURCE_RETRIEVED,
                'expanded': EXPANDED, 'tile': TILE,
                'archiveSha256': sha256_bytes(archive_bytes), 'tileSha256': sha256_bytes(xml_bytes),
                'horizontalCRS': 'EPSG:2180', 'verticalDatum': 'PL-EVRF2007-NH',
                'selection': {'radiusM': args.radius, 'referenceEN': reference_en, 'method': 'Nearest footprint distance'},
                'attribution': 'Derived from GUGiK 2024 LoD1. Original source metadata records CC BY 4.0; public documentation allows free reuse.',
                'heightLimit': 'measuredHeight is an approximate LoD1 ALS median, not an individual ridge or eave survey.',
                'contextTerrainSource': {'url': DTM_URL, 'sourceSha256': sha256_bytes(args.source_dtm.read_bytes()),
                                         'acquisitionDate': '2024-10-01', 'nativeCellSizeM': 1, 'renderedCellSizeM': 4},
                'buildings': selected}
    args.source_snapshot.parent.mkdir(parents=True, exist_ok=True)
    args.source_snapshot.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(',', ':')) + '\n')
    args.site.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(json.dumps({'existing': len(original_buildings), 'added': len(additions),
                      'total': len(data['buildings']), 'acrossStreet': data['neighborhood']['acrossStreetCount'],
                      'bounds': data['neighborhood']['bounds'],
                      'contextTerrain': {'columns': data['contextTerrain']['columns'], 'rows': data['contextTerrain']['rows'], 'cellSize': 4}}, indent=2))


if __name__ == '__main__':
    main()
