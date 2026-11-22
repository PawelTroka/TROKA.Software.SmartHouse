# Sternicza 11: measured sea-view height simulation

## What this feature answers

The sea-view panel raises an observer above four fixed positions on the
property and tests the **complete land corridor to the shore**, including
buildings and tree canopy beyond the former 200 m context model. It shows a
north-up map, the measured vertical skyline, an interactive eye-height
slider, the controlling obstruction and the best of the tested bearings.

Two different questions have separate answers:

- **Water 1 km beyond the shore:** a finite water-surface target. This is a
  downward sightline, so obstacles closer to the beach can require a higher
  observer than their own top elevation.
- **Distant sea / geometric horizon:** the first distant water near the
  tangent to an assumed spherical sea surface. This can become visible at a
  lower height, often as a narrow strip. It is not a claim that nearby water
  or the beach is visible.

The shipped panel uses an interactive profile and map. An optional developer
camera callback can preview the near neighbourhood, but it is not wired into
the shipped panel. No infinite sea plane is used to imply visibility through
unrendered distant buildings. The full measured profile is the analytical result.

## Source evidence

The original surface and ground rasters share the same acquisition date and
vertical datum:

| Source | Retained facts |
|---|---|
| [GUGiK NMPT source tile](https://opendata.geoportal.gov.pl/NumDaneWys/NMPT/81007/81007_1561149_N-34-50-C-d-1-1.asc) | Original 0.50 m surface grid; acquired 1 October 2024; PL-1992 / EPSG:2180 and PL-EVRF2007-NH; source laser scanning. |
| [GUGiK NMT source tile](https://opendata.geoportal.gov.pl/NumDaneWys/NMT/81008/81008_1561323_N-34-50-C-d-1-1.asc) | Original 1 m bare-ground raster; acquired 1 October 2024; same horizontal and vertical systems. |
| [GUGiK PRG maritime shoreline API](https://ogcapi.geoportal.gov.pl/res/ims/maps/PRG/apiFeatures/collections/MorskaLiniaBrzegowa/items?bbox=18.0,54.30,19.4,54.95&f=json&limit=1000) | Official maritime boundary, feature `ID-9296AE19-94D8-F4FF-286C-91537018BCA5`, version `20180627T144649`; fetched 22 November 2026. This is a legal boundary, not today's instantaneous waterline. |
| [GUGiK Gdańsk LoD1 2024 archive](https://opendata.geoportal.gov.pl/InneDane/Budynki3D/LOD1/2024/22/2261.zip) | Actual footprint geometry for the map and building-area identification. DSM values, not median LoD1 heights, supply the skyline. |

GUGiK describes NMPT as the ground surface together with buildings, trees and
other objects. Its [NMPT documentation](https://www.geoportal.gov.pl/pl/dane/numeryczny-model-pokrycia-terenu-nmpt/)
also states that these datasets are free to reuse. The downloadable source was
resolved through the official
[NMPT EVRF2007 WFS](https://mapy.geoportal.gov.pl/wss/service/PZGIK/NumerycznyModelPokryciaTerenuEVRF2007/WFS/Skorowidze),
layer `gugik:SkorowidzNMPT2024`, feature `SkorowidzNMPT2024.1561149`.
The source index records horizontal RMSE 0.09 m and vertical RMSE 0.07 m;
**these source metrics are not a bound on the sea-view estimate**, tree growth,
canopy porosity, all raster interpolation errors, or acquisition-age changes.

The compact extract contains SHA-256 checksums, complete source URLs, source
dates, the original building IDs, the coordinate frame, shoreline segments and
the actual sampled profile arrays. It is independent of mutable user planting
settings.

| File | SHA-256 |
|---|---|
| Original NMPT | `e603d5b1862ff7d2df736e980f63273d125bfef3eec486a8f5f4dc8d90af5a8a` |
| Original NMT | `0d3aa514dffbd5339efb041f0b0b087ceefac348d589f3e6b7dd7db54e2a6f4a` |
| Retrieved PRG GeoJSON | `b77eabbcd1cf3ab25f255e2560ecddab724080320e4637d3762a6652248a8e63` |
| Gdańsk LoD1 archive | `1d4b108e07ed44ed630f493bceec9452ebbd6a2fe6cb44a88032281ccd0a0da2` |

## Coverage and sampling

The generator tests grid bearings from −20° through 80° in 2° steps. It retains
bearings intersecting the official shoreline between 300 and 1,800 m from the
observer. This produces **197 profiles**: 49 above the house, 50 from the front
garden, 49 from the terrace and 49 from the rear garden. All retained profiles
have valid land DSM samples through the first shoreline intersection.

Each 1 m longitudinal bin spans a 1 m wide corridor. The generator retains
**every native 0.5 m raster cell touching that bin's East/North bounding
rectangle**, including cells touched only near a corner. This deliberately
adds a small conservative spatial allowance; an elevated cell cannot fall
between discrete sampling points. Any missing touched cell makes that bin
missing. The far edge of the bin is used for the threshold test, which is
conservative for an obstacle above the sea target. The three optional Python
source tests include a 0.181 m long corner intersection that the original
quarter-metre point-sampling approach could miss.

The first coastline intersection alone does **not** prove that a target is
water. The generator also checks further intersections with **all ten maritime
coastline features returned for the wider Gulf**, including coast beyond
the immediate neighbourhood. Water targets with another land crossing before their target are
marked incomplete, leaving 46 verified offshore-water corridors per observer.
The horizon calculation additionally rejects a further land crossing before
the horizon distance at the calculated threshold. It separately checks the
current observer height: raising the eye can move the horizon beyond a further
coast, in which case the lower threshold remains valid but the current horizon
view becomes unverified. The UI reports the number
of complete corridors for the selected mode.

Missing raster samples are encoded as `null`, never as zero height. A missing
sample, truncated land profile, unverified water segment or intervening coast
prevents a `clear` result. A known lower bound can still be reported; it is not
presented as a completed threshold.

## Geometry and units

All observer, obstacle and sea heights use PL-EVRF2007-NH. The user-facing eye
height is the absolute observer elevation minus the original local ground
elevation. It is **eye height**, not the floor level or height of a proposed
building. Standing on a future floor would place the eye approximately the
person's standing eye height above that floor.

For a finite target at distance `D`, an obstacle at distance `d` and absolute
top height `z`, the required observer elevation is:

```text
(z + clearance − seaZ × d/D + d × (D−d)/(2R)) / (1−d/D)
```

`R = 6,371,000 m`; no atmospheric-refraction coefficient is applied. The finite
water target must itself be within the geometric horizon, imposing the
additional minimum eye elevation `seaZ + D²/(2R)`. For the
geometric horizon, the equivalent requirement is:

```text
seaZ + (sqrt(max(0, z + clearance − seaZ)) + d/sqrt(2R))²
```

The required height is the maximum over the complete recorded profile. Sea
level is assumed to be 0 m in the shared datum. The default 1 m clearance is a
user-adjustable planning allowance, not a confidence interval. The discrete
bearing minimum is explicitly labelled as the best of the sampled directions.

## Recorded result at this implementation checkpoint

With the **1 m allowance** and historical recorded surroundings:

| Observer axis | First distant sea near the geometric horizon | Water 1 km beyond shore |
|---|---:|---:|
| Above the house | approximately 16 m above ground | approximately 23 m above ground |
| Front garden | approximately 17 m above ground | approximately 23 m above ground |
| Rear terrace | approximately 16 m above ground | approximately 25 m above ground |
| Rear garden | approximately 17 m above ground | approximately 24 m above ground |

The house-axis best tested direction is approximately **351.7° true**, with the
shoreline 741 m away in that direction. Both house-axis thresholds are
controlled by a recorded non-building surface 579 m away, with top elevation
15.86 m in the source datum. Its canopy-like character does not establish a
species. Those controlling surfaces were outside the previous 200 m model;
using only nearby buildings would miss them.

These are geometric estimates from a dated dataset. Atmospheric visibility,
refraction, waves, seasonal foliage gaps, post-acquisition works and proposed
renovations/planting are not included. A legal shore line and 0.5 m surface grid
cannot establish a guaranteed present-day view from a future construction.

## Implementation and reproduction

- `data/sternicza-sea-corridor.json`: 1.88 MB retained source-derived extract.
- `src/sea-visibility.js`: pure analytic functions and coverage guards.
- `src/sea-view.js` and `src/sea.css`: standalone interactive panel, source
  details, map, profile, height presets and persistence of the panel's settings.
  `exportSummary()` returns a compact provenance-bearing report without
  repeating source arrays; another selected property returns no sea result.
- `tests/sea-visibility.test.mjs`: 14 tests for the triangle, curvature,
  reversibility, height datum, missing/truncated data, intervening coastline,
  monotonicity, bearing selection, compact exports and the beyond-200 m regression.
- `tests/sea-view-state.test.mjs`: persisted settings, invalid stored bearings,
  clearing stale results on another property, and restoring Sternicza settings.
- `tests/sea-corridor-source.test.py`: three source-extraction checks for a
  narrow high corner cell, missing corner cell and outside-raster coverage.

Run from `garden-lab`, with Python packages `numpy` and `pyproj`:

```bash
python scripts/build-sea-corridor.py \
  --dsm /path/to/sternicza-dsm-2024.asc \
  --dtm /path/to/sternicza_dtm_2024.asc \
  --coastline /path/to/coastline.geojson \
  --lod1 /path/to/gdansk_lod1_2024.zip
node --test tests/sea-visibility.test.mjs tests/sea-view-state.test.mjs
python tests/sea-corridor-source.test.py
```

The generator leaves the property dataset, analytical terrain and original
building records untouched. Runtime code does not fetch remote GIS services;
the retained profiles make the result reproducible and avoid service outages.
