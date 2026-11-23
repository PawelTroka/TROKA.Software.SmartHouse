# Sternicza 11 — measured surrounding vegetation and ground colours

## What the new data represents

The surrounding nature extract contains **490 canopy and shrub aggregates**
(440 taller aggregates and 50 lower shrub-sized aggregates) derived from
**1,268,778 classified vegetation returns** in four official GUGiK airborne
LiDAR tiles. The selection is the 200 m radius around the mapped house centre;
the editable property's interior is excluded. An aggregate can represent part
of a crown or several overlapping crowns. These numbers are not a count of
individually identified trees.

All four tiles were acquired on **1 October 2024**, in horizontal coordinates
EPSG:2180 and the PL-EVRF2007-NH vertical datum. The source's nominal density
is 12 points/m². The first tile was already used by the simulator's building
and terrain analysis; three adjoining official tiles were downloaded on
22 November 2026 to complete the surrounding coverage to the north and east.

The existing site origin and orthonormal axes are retained exactly. Every
output `x` and `y` is in that local frame; `baseZ`, `topZ`, `crownBaseZ` and
`observedMaxZ` are absolute heights in the same vertical datum as existing
terrain and buildings. Crown radii align with the local x/y axes.

The resulting approximate canopy heights above local ground range from
**2.818 to 31.035 m**. Crowns are bounded aggregates rather than a continuous
opaque forest plane. They include the substantial street-side canopy in
front of Sternicza 11 and vegetation in surrounding gardens and communal
spaces.

## Original sources and reproducibility

- [GUGiK classified LiDAR documentation](https://www.geoportal.gov.pl/pl/dane/dane-pomiarowe-lidar-lidar/)
- [GUGiK 1 m terrain documentation](https://www.geoportal.gov.pl/pl/dane/numeryczny-model-terenu-nmt/)
- [Original terrain grid](https://opendata.geoportal.gov.pl/NumDaneWys/NMT/81008/81008_1561323_N-34-50-C-d-1-1.asc)
- [Original south-west LiDAR tile](https://opendata.geoportal.gov.pl/NumDaneWys/DanePomiaroweLAZ/81005/81005_1559930_N-34-50-C-d-1-1-3-1.laz)
- [North-west LiDAR tile](https://opendata.geoportal.gov.pl/NumDaneWys/DanePomiaroweLAZ/81005/81005_1559924_N-34-50-C-d-1-1-1-3.laz)
- [North-east LiDAR tile](https://opendata.geoportal.gov.pl/NumDaneWys/DanePomiaroweLAZ/81005/81005_1559925_N-34-50-C-d-1-1-1-4.laz)
- [South-east LiDAR tile](https://opendata.geoportal.gov.pl/NumDaneWys/DanePomiaroweLAZ/81005/81005_1559931_N-34-50-C-d-1-1-3-2.laz)

GUGiK's source documentation states that these LiDAR and terrain data are
available free of charge for reuse. Source URLs, source file SHA-256 values,
point counts, acquisition date and native bounds are preserved in the derived
JSON. Raw source clouds remain external to the static application.

The extractor needs Python with `numpy`, `scipy` and `laspy[lazrs]`:

```bash
python scripts/extract-sternicza-nature.py \
  --site-data data/site-data.json \
  --dtm /sources/sternicza_dtm_2024.asc \
  --laz /sources/81005_1559930_N-34-50-C-d-1-1-3-1.laz \
        /sources/81005_1559924_N-34-50-C-d-1-1-1-3.laz \
        /sources/81005_1559925_N-34-50-C-d-1-1-1-4.laz \
        /sources/81005_1559931_N-34-50-C-d-1-1-3-2.laz \
  --municipal-records docs/source-evidence/gdansk-tree-records-2026-11-22.json \
  --municipal-meta docs/source-evidence/gdansk-tree-domains-2026-11-22.json \
  --output-dir /derived
```

The renderer uses only the compact derived JSON, so these Python dependencies
are not needed in the browser or production build.
The script accepts the original published tile filenames and the historical
`sternicza_lidar_2024.laz` local alias for the south-west tile. It processes
the four tiles in a fixed geographic order, so a renamed cache file does not
change the output. Large intermediate point arrays are written only when
`--debug-points` is explicitly requested; use an output directory outside the
repository for that diagnostic option.

## Canopy derivation

1. Read only non-withheld vegetation-class returns (classes 3, 4 and 5).
2. Normalize heights against bilinear interpolation of the matching 1 m DTM.
3. Exclude points inside the property boundary; retain the surrounding radius.
4. Create a 1 m local raster of maximum vegetation height. Require at least
   three returns per occupied cell and a maximum height of at least 2.5 m.
5. Separate connected occupied regions, identify deterministic local height
   maxima at least 5 m apart, and partition each region by its nearest maximum.
6. Retain aggregates with at least four occupied cells and 35 returns. The
   robust crown top is the 99.5th percentile absolute return height; the
   observed maximum remains available separately. The crown's bottom comes
   from the lower sampled height envelope. Horizontal radii use the 1st–99th
   percentile envelope with 0.35 m padding.

Identifiers come from source-frame peak positions and remain deterministic
for the same sources and extraction parameters. No random planting locations
or individual tree species are introduced by this process.

The median RGB per aggregate is a source colour hint derived from aerial
photograph colours attached to LiDAR returns. It is not a measured physical
leaf material: source lighting, shadows and the October acquisition affect
it. The renderer can blend it with an explicit seasonal appearance.

## Municipal species inventory

The official [Gdańsk tree dataset](https://ckan.multimediagdansk.pl/dataset/drzewa-w-gdansku)
publishes a continuously updated, incomplete inventory. Its ArcGIS REST
representation is at:

`https://geogdansk.pl/server/rest/services/GZDiZ/Gdanska_Zielen_WFS/MapServer/0`

A spatial query in EPSG:2180 for E 475840–476290 / N 726660–727130 returned
31 records on 22 November 2026. **20 records** fall inside the selected 200 m
radius. Species codes were resolved using the service's published coded-value
domains. The retained records include actual locations, global identifiers,
Polish/Latin names, status, planting dates and the provided stem circumference.
The exact public inventory response and its code-domain metadata are retained
in [`source-evidence`](source-evidence/) for reproducibility after the online
inventory changes. Their SHA-256 values are:

| Snapshot | SHA-256 |
|---|---|
| `gdansk-tree-records-2026-11-22.json` | `7436e2727c1e320ad8e91b9e2a138ec322ab038127ad61580c3f322b25150c12` |
| `gdansk-tree-domains-2026-11-22.json` | `489790edddbd8eda311df5daafe504fe613fec7504e75556a36fd6e185b2865d` |

This inventory does not publish tree heights or crown widths. It includes
plantings newer than the 2024 LiDAR scan. Consequently, municipal points are
kept separate from derived crowns, and species are not assigned to a nearby
LiDAR aggregate merely because it is close. The catalogue currently gives
"No License Provided" as its licence field; this exact metadata value is
retained rather than replaced by an assumed licence.

## Ground appearance

The companion ground-colour raster uses **3,791,876 class-2 ground returns**
from the same four source clouds. It is a 256 × 256 RGBA image at **2 m per pixel**,
covering a 512 × 512 m square in the native EPSG:2180 frame. Pixel rows run from
north to south. JSON metadata records the native bounds, local corners, UV
transform, source hashes, measured-cell coverage and exact colour transfer.

Cells require three ground returns. Missing cells can borrow the nearest
measured class-2 colour within a maximum of 4 m, with lower alpha for inferred
cells. The property and building footprints are transparent, including a
one-cell padding to prevent filtering from tinting the designed garden.
Cells with high-vegetation or class-6 returns are also masked: aerial-photo
colours attached to a ground return can otherwise inherit an overhead crown
or roof's image. No roof or canopy returns are flattened into the ground
texture. The final mask leaves 17,000 measured surface-colour cells and just
six cells inferred from a nearby measured ground cell. Unobserved ground
should use a neutral context material, not an inferred photographic surface.

This is a visual sampled-colour approximation, not a full orthophoto or an
assertion that each pixel is grass, paving, soil or another material. Source
photo shadows remain, and a disclosed modest brightening is applied for scene
rendering. The texture has no effect on physical sightline calculations.

To rebuild it from the same source files, additionally install `Pillow` and run:

```bash
python scripts/extract-sternicza-ground.py \
  --site-data data/site-data.json \
  --nature-data /derived/sternicza-surrounding-nature.json \
  --laz /sources/81005_1559930_N-34-50-C-d-1-1-3-1.laz \
        /sources/81005_1559924_N-34-50-C-d-1-1-1-3.laz \
        /sources/81005_1559925_N-34-50-C-d-1-1-1-4.laz \
        /sources/81005_1559931_N-34-50-C-d-1-1-3-2.laz \
  --output-dir /derived
```

The compact source-generated JSON extracts and PNG are the reusable artifacts.
The original LAZ/ASC files and optional NPY arrays are excluded from the
application deliverable.

## Validation and limits

The extraction checks unique IDs, finite coordinates and heights, positive
radii, correctly ordered vertical bounds, centres outside the property,
selection-radius bounds and preserved source hashes. A visual check compares
the sampled point cloud with the derived crown envelopes at the same mapped
positions.

The measurements establish real vegetation locations and sampled height
envelopes in the 2024 acquisition. They do not establish today's individual
trunk positions, species, seasonal transparency, growth, removals or newly
planted trees. A drawn trunk is a visual approximation. An optional dense
canopy screening scenario should therefore remain distinct from guaranteed
physical screening.

### Review of reconstructed stems · 23 November 2026

Ten aggregate centres fall inside mapped building footprints. A crown can
overhang a roof, so its centre is not a valid place to infer a ground-rooted
trunk. The renderer now omits the invented wood at those centres while
retaining all 490 measured crown envelopes, their source records and their
analytical contribution. Building boundaries count as occupied, and the
current adjusted footprints determine the exclusion.

For example, `als-canopy-4761509-7267581` has only 36 classified returns and a
crown interval of 24.400–25.801 m ASL above `building-1698`, whose mapped top
is 19.840 m ASL. Previously the renderer invented a trunk from 3.176 m ASL
through that building. Removing the invented wood does not assert that the
small recorded cluster is a verified individual tree, or discard a possible
overhanging canopy. The retained measurements cannot settle that distinction.

The same automatic exclusion is not applied to the illustrative street strip:
its edges are not a surveyed road boundary. Street-canopy centres also need
not coincide with real stems, and precise trunk locations still require a
ground-level observation or a verified tree inventory match.
