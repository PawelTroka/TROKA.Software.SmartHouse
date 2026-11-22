#!/usr/bin/env python3
"""Create a georeferenced visual ground-colour raster from class-2 ALS RGB.

Requires numpy, scipy, Pillow and laspy[lazrs]. The image is a sampled colour
approximation, not an orthophoto or a land-cover classification. All building
and property footprints are excluded. Vegetation and roof returns are never
projected onto the ground. Original aerial-photo shadows remain in source RGB;
the display image uses a disclosed modest brightening for scene rendering.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import laspy
import numpy as np
from scipy import ndimage
from PIL import Image


def inside(x, y, polygon):
    result = np.zeros(np.shape(x), dtype=bool)
    for a, b in zip(polygon, polygon[1:]):
        result ^= ((a[1] > y) != (b[1] > y)) & (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1] + 1e-99) + a[0])
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site-data', type=Path, required=True)
    parser.add_argument('--nature-data', type=Path, required=True)
    parser.add_argument('--laz', type=Path, nargs='+', required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    site = json.loads(args.site_data.read_text())
    nature = json.loads(args.nature_data.read_text())
    frame = site['coordinates']
    origin = np.array(frame['localOriginEN'])
    axes = np.array([frame['xUnitEN'], frame['yUnitEN']])
    center_xy = np.array(nature['selection']['centreXY'])
    center_en = origin + center_xy @ axes
    size, pixels = 2, 256
    min_en = np.floor(center_en / size) * size - pixels * size / 2
    max_en = min_en + pixels * size
    count = np.zeros((pixels, pixels), dtype=np.int32)
    occlusion_count = np.zeros((pixels, pixels), dtype=np.int32)
    channels = np.zeros((pixels, pixels, 3), dtype=np.float64)
    ground_count = 0
    for path in sorted(args.laz):
        selected = 0
        with laspy.open(path) as r:
            for c in r.chunk_iterator(1_000_000):
                cls = np.array(c.classification)
                upper = ((cls == 5) | (cls == 6)) & ~np.asarray(c.withheld, dtype=bool)
                if upper.any():
                    ue, un = np.asarray(c.x)[upper], np.asarray(c.y)[upper]
                    uk = (ue >= min_en[0]) & (ue < max_en[0]) & (un >= min_en[1]) & (un < max_en[1])
                    ux = np.floor((ue[uk] - min_en[0]) / size).astype(int)
                    uy = np.clip(np.floor((max_en[1] - un[uk]) / size).astype(int), 0, pixels - 1)
                    np.add.at(occlusion_count, (uy, ux), 1)
                use = (cls == 2) & ~np.asarray(c.withheld, dtype=bool)
                if not use.any():
                    continue
                e, n = np.asarray(c.x)[use], np.asarray(c.y)[use]
                keep = (e >= min_en[0]) & (e < max_en[0]) & (n >= min_en[1]) & (n < max_en[1])
                if not keep.any():
                    continue
                e, n = e[keep], n[keep]
                rgb = np.stack([np.asarray(c.red)[use][keep], np.asarray(c.green)[use][keep], np.asarray(c.blue)[use][keep]], axis=1)
                x = np.floor((e - min_en[0]) / size).astype(int)
                y = np.floor((max_en[1] - n) / size).astype(int)
                y = np.clip(y, 0, pixels - 1)
                np.add.at(count, (y, x), 1)
                for k in range(3):
                    np.add.at(channels[:, :, k], (y, x), rgb[:, k])
                selected += len(x)
        ground_count += selected
        print(path.name, selected, flush=True)
    observed = np.divide(channels, count[:, :, None], out=np.zeros_like(channels), where=count[:, :, None] > 0)
    if observed.max() > 255:
        observed /= 256
    # The absence of ground returns under buildings must not be filled from
    # aerial roof/leaf colours. Use only nearby measured class-2 cell colours.
    valid = count >= 3
    distance, indices = ndimage.distance_transform_edt(~valid, return_indices=True)
    filled = observed[tuple(indices)]
    alpha = np.where(valid, 255, np.where(distance <= 1, 220, np.where(distance <= 2, 160, 0))).astype(np.uint8)
    e = min_en[0] + (np.arange(pixels) + .5) * size
    n = max_en[1] - (np.arange(pixels) + .5) * size
    ee, nn = np.meshgrid(e, n)
    xy = (np.stack([ee, nn], axis=-1) - origin) @ axes.T
    excluded = inside(xy[:, :, 0], xy[:, :, 1], site['site']['boundary'])
    for b in [site['site']['house'], site['site']['garage'], *site['buildings']]:
        excluded |= inside(xy[:, :, 0], xy[:, :, 1], b['footprint'])
    # Ground-point RGB can still inherit photo canopy/roof occlusion at the
    # same horizontal position. Exclude their measured return footprints too,
    # including objects beyond the smaller neighbourhood building selection.
    excluded |= occlusion_count >= 3
    # Expand the excluded mask by one cell to avoid tint bleeding into the
    # editable garden or building edges under bilinear texture filtering.
    excluded = ndimage.binary_dilation(excluded, iterations=1)
    alpha[excluded] = 0
    display = np.clip(filled * 1.10 + 12, 0, 255).round().astype(np.uint8)
    rgba = np.dstack([display, alpha])
    args.output_dir.mkdir(parents=True, exist_ok=True)
    filename = 'sternicza-ground-colour.png'
    Image.fromarray(rgba).save(args.output_dir / filename, optimize=True)
    corners_en = np.array([[min_en[0], max_en[1]], [max_en[0], max_en[1]], [max_en[0], min_en[1]], [min_en[0], min_en[1]]])
    meta = {'schemaVersion': 1, 'siteId': 'sternicza-11', 'generated': '2026-11-22',
            'image': filename, 'widthPixels': pixels, 'heightPixels': pixels, 'pixelSizeM': size,
            'boundsEN': [min_en.tolist(), max_en.tolist()], 'coordinates': frame,
            'cornersXY': np.round((corners_en - origin) @ axes.T, 6).tolist(),
            'cornerOrder': ['northwest', 'northeast', 'southeast', 'southwest'],
            'rowOrder': 'north-to-south', 'uvFormula': 'u=(E-minE)/512; v=(N-minN)/512 (Three.js Texture.flipY=true)',
            'sourceId': 'gugik-als-2024', 'acquired': '2024-10-01', 'sourceClass': 2,
            'groundReturnCount': ground_count, 'measuredCellCount': int(valid.sum()),
            'visibleMeasuredCells': int((valid & (alpha > 0)).sum()),
            'visibleNearestFilledCells': int((~valid & (alpha > 0)).sum()),
            'minimumGroundReturnsPerCell': 3, 'maximumNearestFillDistanceM': 4,
            'excluded': 'Property, mapped buildings and cells with >=3 high-vegetation/class-6 returns, expanded by one 2m cell',
            'upperReturnMaskedCells': int((occlusion_count >= 3).sum()),
            'displayTransfer': '8-bit sRGB = clamp(mean(class-2 source RGB / 256) * 1.10 + 12, 0, 255)',
            'alphaMeaning': {'255': 'measured cell', '220': 'nearest measured cell within 2m', '160': 'nearest measured cell within 4m', '0': 'excluded or unobserved'},
            'sha256': hashlib.sha256((args.output_dir / filename).read_bytes()).hexdigest(),
            'sources': nature['sources'][:1],
            'limitations': ['Visual surface-colour approximation at 2m resolution; not a true orthophoto or a material classification.',
                            'Photo colours include baked acquisition lighting and shadows; the display brightening is a rendering choice.',
                            'Only class-2 ground returns contribute; upper-vegetation/building return footprints are also masked to avoid RGB photo occlusions.',
                            'Nearest filling uses at most 4m and does not establish actual land-cover boundaries.',
                            'Ground colours do not participate in privacy, shade or sea-visibility calculations.']}
    (args.output_dir / 'sternicza-ground-colour.json').write_text(json.dumps(meta, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(json.dumps({k: meta[k] for k in ['groundReturnCount', 'measuredCellCount', 'visibleMeasuredCells', 'visibleNearestFilledCells', 'boundsEN', 'cornersXY']}), flush=True)


if __name__ == '__main__':
    main()
