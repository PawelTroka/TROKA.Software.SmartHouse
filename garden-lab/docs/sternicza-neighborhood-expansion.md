# Sternicza neighbourhood coverage

## Added source geometry

The surrounding model now contains **142 buildings**, up from 18: **124 additional official GUGiK footprints and LoD1 heights**. The own house and garage remain separate site objects. The selection contains every building footprint in the source tile that touches a **200 m radius around the mapped house centroid**, with complete footprints retained at the edge of the circle.

The additional buildings are distributed as follows. These are descriptive site-side groups, not cadastral classifications or postal addresses.

| Site-side group | Added buildings |
|---|---:|
| Across Sternicza / front neighbourhood | 82 |
| West neighbourhood | 10 |
| East neighbourhood | 14 |
| Rear neighbourhood | 18 |
| **Total additions** | **124** |

There are **85 surrounding buildings across the street** when including the three already present. Those existing buildings are `building-5`, `building-6` and `building-7`, approximately 39, 38 and 41 m from the house centroid respectively. Their original records remain unchanged; friendly aliases live in `neighborhood.labelsById`.

The resulting local footprint bounds are **x = −190.6238 to 215.8386 m** and **y = −209.2098 to 236.2967 m**. A long building can extend beyond the nominal radius when its nearest edge touches the circle. Positive local y points into the rear garden; negative y is across Sternicza. The native coordinate transform is the existing EPSG:2180 frame.

## Source and height meaning

The additions come from the same original official source archive used for the existing model:

- [GUGiK Gdańsk 2024 LoD1 archive](https://opendata.geoportal.gov.pl/InneDane/Budynki3D/LOD1/2024/22/2261.zip), originally retrieved on 11 November 2026.
- CityGML tile `2261_N-34-50-c-d-1-1.gml`.
- [GUGiK documentation](https://www.geoportal.gov.pl/pl/dane/inne-dane/modele-3d-budynkow/), checked on 13 November 2026.

GUGiK describes LoD1 as flat-roof prisms based on BDOT10k building outlines, with a base derived from the lowest footprint/terrain intersection and a height derived from the median airborne laser building-class returns. Its `measuredHeight` attribute is an approximate model height. Each added building retains the actual source outline, base elevation, height, official identifier, roof-source year and geometry version.

**A LoD1 flat top does not describe an individual roof ridge, eave, chimney or detailed silhouette.** No higher ridge, roof pitch or postal address has been invented. Added height values range from 2.00 to 34.53 m above their source base. Those heights have the same median-roof limitation throughout the expanded context. Existing PCK3 and other detailed LiDAR roof returns are preserved exactly.

The model is based on the available 2024 source snapshot. It does not establish changes made after that acquisition, the current condition of individual buildings, or the identity of small rooftop features. Descriptive labels use the building's source-derived direction and rounded centroid distance; they are not verified street addresses.

The compact retained extract is [`data/sternicza-neighborhood-source.json`](../data/sternicza-neighborhood-source.json). It contains the selected native East/North footprints, source base and height, original CityGML attributes, source URLs and archive hashes. The original source metadata recorded CC BY 4.0; GUGiK's public documentation states that these building models may be reused freely. Attribution remains GUGiK.

### Source checksums

| Original source | SHA-256 |
|---|---|
| Gdańsk LoD1 ZIP | `1d4b108e07ed44ed630f493bceec9452ebbd6a2fe6cb44a88032281ccd0a0da2` |
| Selected CityGML tile | `8c43daa9e63bf22906cafa0ebcbedbc7b4f4005a7baa7f8487ef4325425fb9bd` |
| Original 1 m DTM | `0d3aa514dffbd5339efb041f0b0b087ceefac348d589f3e6b7dd7db54e2a6f4a` |

## Surrounding ground

The separate `contextTerrain` grid uses the original [2024 GUGiK terrain tile](https://opendata.geoportal.gov.pl/NumDaneWys/NMT/81008/81008_1561323_N-34-50-C-d-1-1.asc). It is sampled at every fourth native 1 m grid centre, yielding **107 × 111 samples at 4 m spacing**. Its East/North origin is **(475872, 726684) m** and elevations span **1.02–4.73 m** in PL-EVRF2007-NH.

This grid is explicitly **for rendering the wider neighbourhood**. The original property `terrain` array, cell spacing, terrain interpolation, parcel, floor reference, house, garage, sampled roofs and benchmark ray remain unchanged. Physical calculations continue to use the original analytical grid and buildings' own recorded base elevations.

## Analysis and performance

All additions use `kind: "context"`, with empty target-sample arrays. They participate as finite mapped blockers. The original five permanent target buildings and their roof/facade samples remain unchanged, so selecting additional buildings should use a separate, single-building dense facade check rather than multiplying every default analysis by 124 targets.

The dataset contains about **347 kB** of JSON, including the separate ground grid, versus 143 kB before expansion. The source evidence extract is about **71 kB** and does not have to be fetched for rendering.

An initial Node comparison before intersection optimisation measured approximately **61 → 93 ms** for the standard seated analysis and **187 → 249 ms** for the dense PCK3 facade check. These are local observations, not browser performance guarantees. Footprint-bound rejection and reduced distant visual decoration are appropriate ways to keep the expanded model responsive without changing its geometry.

The frozen **v1.13 `spa-aligned` fixture**, using its original 9.5 m high trees and 5 m crowns, retains **49 / 5,214 visible PCK3 facade samples** from the seated living room with the expanded context. This matches its prior independently audited result. The new corner arrangement is a different planting design: its current default leaves **859 / 5,214** seated living-room facade samples visible. Adding more surroundings does not artificially erase PCK3 or transfer the older arrangement's result to the new default.

## Reproduction

Use the original source files from the URLs above. The generator needs only Python's standard library:

```bash
python scripts/expand-sternicza-neighborhood.py \
  --source-archive /path/to/gdansk_lod1_2024.zip \
  --source-dtm /path/to/sternicza_dtm_2024.asc
```

The script checks each original footprint and base against the source before appending anything. Existing building identifiers and records remain intact. New integer identifiers are based on a deterministic sorted source rank, and repeated generation produces byte-identical dataset and evidence files.

Validation in `tests/neighborhood-data.test.mjs` checks exact preservation of the 18 original records and all property evidence; reconstruction of every new footprint and height from the official extract; unique identities; four-direction coverage; radius selection and bounds; explicit height provenance; separate terrain coverage; unchanged PCK3 screening; and a selectable new across-street building. Together with the building, geometry, dense-facade and shade suites, **54 focused tests passed** at the data integration checkpoint.
