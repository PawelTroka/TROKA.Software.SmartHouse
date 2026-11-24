# Renovation materials implementation

The shared resolver is `src/material-catalogue.js`. It is DOM-free and used by both rendering and the style catalogue:

- `getMaterialForFinish(name, {seams})` returns the exact registered source, files, physical size, treatment and sample URL.
- `getInteriorMaterialFinishes(styleId)` maps each interior construction role to its finish.
- `getStyleMaterialSamples(styleId, {interior})` returns wall, wood, floor and fabric preview records in that order.

The **Current** baseline retains its six asset aliases, original files, original calibration, and eager loading behavior. Renovations select genuine material families rather than mapping all minerals to marble or all wood to one grain. Geometry and room dimensions are unchanged by these material changes.

See the [source library and provenance](../assets/materials/README.md) and [delivered material board](material-reference-board.jpg).

## Conservative per-style transfer

These are unique JPEG URL bytes, in decimal MB. Interior numbers include all optional material dictionary slots; runtime deferral excludes slots absent from the model. New combined bytes exclude the shared 8.44 MB baseline garden cache. Catalogue swatches together are under 0.46 MB.

| Style | Exterior MB | Interior upper bound MB | New combined MB |
| --- | ---: | ---: | ---: |
| organic-modern | 6.33 | 13.38 | 10.55 |
| hidden-bali | 7.19 | 9.39 | 8.15 |
| mediterranean-villa | 7.37 | 12.93 | 9.57 |
| modern-minimal | 5.35 | 10.39 | 7.56 |
| scandinavian | 5.34 | 11.27 | 9.98 |
| japandi | 7.12 | 10.07 | 8.06 |
| organic-scandinavian | 5.32 | 17.36 | 15.29 |
| organic-japandi | 6.43 | 14.13 | 12.12 |
| space-age | 4.66 | 10.35 | 9.70 |
| party-club | 3.96 | 13.62 | 13.28 |
| baltic-dune | 5.56 | 10.19 | 8.12 |
| coastal | 4.46 | 9.32 | 7.25 |
| beach-house | 6.31 | 10.09 | 7.25 |
| gdansk-brick | 6.87 | 16.09 | 14.58 |
| danish-midcentury | 5.95 | 15.14 | 13.08 |
| finnish-sauna | 4.88 | 11.88 | 9.81 |
| riviera-deco | 4.76 | 14.37 | 12.70 |
| arts-and-crafts | 8.23 | 13.02 | 9.18 |
| palm-springs | 6.36 | 11.18 | 8.57 |
| desert-modern | 5.26 | 11.35 | 8.51 |
| alpine-lodge | 6.36 | 15.29 | 14.05 |
| industrial-loft | 3.78 | 11.53 | 9.53 |

## Verification scope

The focused tests check actual material records and texture lifecycle behavior, not source-code text matching. Deferred-load tests build a real Three mesh and run the production UV traversal. They verify that absent finishes request nothing, used finishes activate, a second renderer's live clone survives disposal, and idle source storage remains bounded. UV tests verify actual metre spans for horizontal/vertical wood members and module-normalized deck surfaces. The provenance test verifies every shipped channel's hashes and sizes. Compression tests check measured source-to-delivery normal-angle and byte errors.

The low-resolution reference board is an inspection aid made from the delivered PBR assets, not a render or a photograph of the house. In-app scenes remain the appropriate place to compare colour, sheen and construction at scale.
