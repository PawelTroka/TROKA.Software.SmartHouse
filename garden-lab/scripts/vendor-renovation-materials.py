#!/usr/bin/env python3
"""Reproduce the curated CC0 renovation PBR download and provenance manifest.

Uses documented provider APIs; never scrapes preview renders or website HTML.
Original albedo, OpenGL normal and roughness files are retained byte for byte.
Run from any directory. Requires Pillow and numpy only for measured metadata.
"""
import concurrent.futures
import hashlib
import io
import json
from pathlib import Path
import urllib.request
import zipfile

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'assets/materials'
USER_AGENT = 'SmartHouseGardenLab-MaterialCuration/1.0 (self-hosted CC0 architectural material comparison)'
POLY = {
    'pine_bark': '1k',
    'white_plaster_02': '1k',
    'clay_plaster': '1k',
    'oak_veneer_02': '1k',
    'natural_walnut_veneer': '1k',
    'teak_veneer': '1k',
    'ash_veneer': '1k',
    'japanese_cedar_planks': '1k',
    'wood_planks_grey': '1k',
    'wood_textured_concrete': '1k',
    'red_brick_03': '1k',
    'terracotta_floor_tiles': '1k',
    'terrazzo_tiles': '1k',
    'roof_slates_03': '1k',
    'slate_floor': '1k',
    'wool_boucle': '1k',
    'brown_leather': '1k',
    'oak_wood_planks': '1k',
    'herringbone_parquet': '2k',
    'clay_roof_tiles_02': '1k',
    'red_sandstone_tiles': '1k',
    'velour_velvet': '1k',
}
AMBIENT = {'Travertine003': '2K-JPG', 'Tiles139': '1K-JPG', 'Concrete034': '1K-JPG',
           'Porcelain001': '1K-JPG', 'Marble012': '1K-JPG'}
AUTHORED_SCALE = {'Porcelain001': [1.0, 1.0], 'Marble012': [2.0, 2.0]}
CHANNELS = {'Diffuse': 'diffuse', 'nor_gl': 'nor_gl', 'Rough': 'rough'}


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=55) as response:
        return response.read()


def api(url):
    return json.loads(fetch(url))


def channel_entry(asset_id, channel, raw, url, resolution, **extra):
    filename = f'{asset_id}_{CHANNELS[channel]}.jpg'
    (TARGET / filename).write_bytes(raw)
    with Image.open(io.BytesIO(raw)) as image:
        width, height = image.size
    return dict(file=filename, sourceUrl=url, md5=hashlib.md5(raw).hexdigest(),
                sha256=hashlib.sha256(raw).hexdigest(), bytes=len(raw),
                sourceResolution=resolution, colorSpace='sRGB' if channel == 'Diffuse' else 'linear',
                width=width, height=height, **extra)


def finalize(record):
    with Image.open(TARGET / record['maps']['Diffuse']['file']) as image:
        rgb = np.asarray(image.convert('RGB'), dtype=np.float64) / 255
    linear = np.where(rgb <= .04045, rgb / 12.92, ((rgb + .055) / 1.055) ** 2.4)
    record['linearAlbedoMean'] = np.mean(linear, axis=(0, 1)).round(9).tolist()
    record['linearAlbedoStd'] = np.std(linear, axis=(0, 1)).round(9).tolist()
    print(record['id'], sum(c['bytes'] for c in record['maps'].values()), flush=True)
    return record


def poly_asset(item):
    asset_id, resolution = item
    info = api('https://api.polyhaven.com/info/' + asset_id)
    files = api('https://api.polyhaven.com/files/' + asset_id)
    record = dict(id=asset_id, name=info['name'], provider='Poly Haven',
                  source='https://polyhaven.com/a/' + asset_id, license='CC0-1.0',
                  licenseUrl='https://polyhaven.com/license', authors=info['authors'],
                  physicalSizeMeters=[n / 1000 for n in info['dimensions']], maps={})
    for channel in CHANNELS:
        source = files[channel][resolution]['jpg']
        filename = TARGET / f'{asset_id}_{CHANNELS[channel]}.jpg'
        raw = filename.read_bytes() if filename.exists() else b''
        if hashlib.md5(raw).hexdigest() != source['md5']:
            raw = fetch(source['url'])
        assert hashlib.md5(raw).hexdigest() == source['md5'], f'{asset_id}: provider checksum mismatch'
        record['maps'][channel] = channel_entry(asset_id, channel, raw, source['url'], resolution.upper(), providerMd5=source['md5'])
    return finalize(record)


def ambient_asset(item):
    asset_id, resolution = item
    info = api('https://ambientcg.com/api/v3/assets?id=' + asset_id + '&include=downloads,dimensions,technique,title,url')['assets'][0]
    download = next(d for d in info['downloads'] if d['attributes'] == resolution)
    raw_zip = fetch(download['url'])
    assert len(raw_zip) == download['size'], f'{asset_id}: provider archive size mismatch'
    width = info['dimensions']['width'] / 100
    height = (info['dimensions']['height'] or info['dimensions']['width']) / 100
    if not width:
        width, height = AUTHORED_SCALE[asset_id]
    record = dict(id=asset_id, name=info['title'], provider='ambientCG', source=info['url'],
                  license='CC0-1.0', licenseUrl='https://docs.ambientcg.com/license/',
                  authors={'Lennart Demes / ambientCG': 'All'}, technique=info['technique'],
                  physicalSizeMeters=[width, height], maps={},
                  archive=dict(url=download['url'], bytes=len(raw_zip), sha256=hashlib.sha256(raw_zip).hexdigest()))
    record['scaleBasis'] = 'authored representative scale; provider does not specify dimensions' if asset_id in AUTHORED_SCALE else 'provider dimensions'
    with zipfile.ZipFile(io.BytesIO(raw_zip)) as archive:
        for channel, suffix in [('Diffuse', 'Color'), ('nor_gl', 'NormalGL'), ('Rough', 'Roughness')]:
            name = next(n for n in archive.namelist() if n.endswith('_' + suffix + '.jpg'))
            record['maps'][channel] = channel_entry(asset_id, channel, archive.read(name), download['url'], resolution.split('-')[0], archiveMember=name)
    return finalize(record)


if __name__ == '__main__':
    manifest_file = TARGET / 'manifest.json'
    manifest = json.loads(manifest_file.read_text())
    existing = {a['id']: a for a in manifest['assets']}
    jobs = [(poly_asset, item) for item in POLY.items()] + [(ambient_asset, item) for item in AMBIENT.items()]
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        for result in pool.map(lambda job: job[0](job[1]), jobs):
            existing[result['id']] = result
    manifest.update(provider='Poly Haven and ambientCG', updated='2026-11-24',
                    assets=list(existing.values()),
                    provenance='Original provider albedo, OpenGL normal and roughness maps. Source archives/checksums and measured physical dimensions retained; see renovation-materials.md for finish selection and in-renderer tinting.')
    manifest_file.write_text(json.dumps(manifest, indent=2) + '\n')
