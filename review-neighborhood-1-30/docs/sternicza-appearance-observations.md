# Sternicza neighbouring-building appearance

The 22 November 2026 update adds a separate, evidence-labelled finish layer for twelve identifiable buildings around Sternicza 11. The source is the user's six supplied cadastral, orthophoto and oblique-view screenshots. The source filenames and SHA-256 hashes are retained in [`data/sternicza-appearance-observations.json`](../data/sternicza-appearance-observations.json); the screenshots are not distributed with the application or baked into facade textures.

## What changes

| Mapped object | Recognisable appearance introduced |
| --- | --- |
| PCK 3, `building-9` | Cream and pale blue wall fields, six apparent opening levels, narrower stairwell openings, projecting side balconies and pale frames |
| PCK 5, `building-15` | Cream, warm ochre/orange and muted green facade fields; repeated salmon balcony panels; six apparent opening levels |
| PCK 1, `building-29` | Cream walls, ochre/yellow vertical fields and salmon balcony stacks; six apparent opening levels |
| Nearby Sternicza houses, `building-2`, `-3`, `-5`, `-6`, `-7`, `-8`, `-10`, `-19` | Distinct observed facade tone and an approximate street-facing bay layout |
| Neighbour 4h, `building-4` | Neutral facade finish; the already-recorded blank garden wall remains authoritative |

The three apartment blocks are registered against their official building identifiers and cadastral positions, not just their local integer labels. Facade directions are defined in the property's existing local frame: `front` faces toward Sternicza, `rear` away from it, with local east and west sides. The rendered colours are chosen from the visible broad facade fields; they are not colorimetric measurements.

The repeated window and balcony arrangements are visual estimates from oblique imagery. Six apparent stacked opening levels replace the old five-level generic approximation on the three PCK blocks. Balcony depth, slab thickness, exact window widths and exact bay coordinates remain illustrative. A street house's concealed elevations retain the old generic windows and are explicitly labelled `illustrative` in the placement model. No exact opening survey is claimed.

## Geometry and analysis

Appearance records never overwrite the official footprints, base levels, source heights, roof points or analytical samples. The source mass continues to drive the existing privacy analysis. Facade finish panels, entry details, balcony slabs and rails are rendered in eight or fewer batches across all observed buildings. They do not receive separate analytical obstruction credit, and they do not change the existing shadow model. Roof-edge coping is contained below each mapped top rather than inventing a higher silhouette.

Observed openings feed the same window batches as the prior renderer, including its night-window behaviour. A matching explicit blank-wall observation takes precedence over an inferred window or balcony. Official-ID matching prevents a profile from applying to an unrelated building at another property. Reversing footprint winding does not mirror an asymmetric facade pattern; translated and vertically scaled building variants keep their attached facade details.

Measured roof detail is handled separately from this facade interpretation. Nine nearby buildings have a separate compact extract of 2024-10-01 GUGiK class-6 airborne-laser returns in `data/sternicza-neighbor-roofs.json`. Each contains at most 150 roof samples selected from native 1 m cells. `observed-neighbor-roofs.js` filters isolated high/low returns and raised fixtures on predominantly flat roofs, retaining the full raw extract for inspection. It then uses the existing local roof-envelope interpolator to build one shared wall/roof seam. This preserves lower wings and gable profiles without leaving a uniform LoD1-height wall poking through the sloping roof. Windows above a resolved lower roof wing are clipped, and the old flat coping/colour overlays are omitted for these houses.

This is a visual reconstruction from sparse classified returns, not a complete surveyed roof topology. The analytical LoD1 fields remain unchanged. All nine resulting roof triangulations cover their own exact mapped footprint; the wall and roof reuse identical perimeter vertices. A photograph alone is not used to invent a ridge height or a chimney.

## Provenance limits

22 November 2026 is the date the user supplied the screenshots. Their underlying aerial/oblique image acquisition dates are unknown. The screenshots cannot establish changes since capture, concealed openings, a species inventory, or a survey-grade facade model. The application retains this distinction in each profile's `confidence`, `windowLayoutConfidence` and source records.

## Maintenance

Edit `data/sternicza-appearance-observations.json`, then run:

```sh
node scripts/generate-neighborhood-appearance.mjs
node --test tests/neighborhood-appearance.test.mjs
```

The generator creates a plain ES module so the static browser build does not require JSON import-attribute support. The test compares it with its source JSON and checks source identities, six-level placement, ring-winding invariance, blank-wall priority, adjusted geometry, bounded draw calls and the SVG fallback.
