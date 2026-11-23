# Sternicza neighbouring-building appearance

The 22 November 2026 update adds a separate, evidence-labelled finish layer for twelve identifiable buildings around Sternicza 11. A 23 November review corrects the opening counts and facade patterns against five reattached screenshots, including three complementary oblique views. The original six source records and the five reattached filenames and SHA-256 hashes are retained in [`data/sternicza-appearance-observations.json`](../data/sternicza-appearance-observations.json); the screenshots are not distributed with the application or baked into facade textures.

## What changes

| Mapped object | Recognisable appearance introduced |
| --- | --- |
| PCK 3, `building-9` | Cream and pale blue fields with a central warm-yellow rectangle; five regular window rows and four principal columns on the plot/street faces; three balcony stacks per side |
| PCK 5, `building-15` | Cream upper, ochre middle and muted-green lower fields; central yellow/salmon rectangles; five regular rows, four principal columns and three salmon balcony stacks per side |
| PCK 1, `building-29` | Cream walls, ochre outer window fields and narrow salmon vertical stripes; five regular rows, four principal columns and three salmon balcony stacks per side |
| Immediate neighbours and three houses opposite, `building-2`, `-3`, `-5`, `-6`, `-7` | Two resolved main-storey window rows, varied opening widths and sparse placement where foliage hides the remainder; readable balcony stacks on two opposite houses |
| Farther Sternicza houses, `building-8`, `-10`, `-19` | Distinct approximate facade tone and the earlier tentative street-facing bay layout |
| Neighbour 4h, `building-4` | Neutral facade finish; the already-recorded blank garden wall remains authoritative |

The three apartment blocks are registered against their official building identifiers and cadastral positions, not just their local integer labels. Facade directions are defined in the property's existing local frame: `front` faces toward Sternicza, `rear` away from it, with local east and west sides. The rendered colours are chosen from the visible broad facade fields; they are not colorimetric measurements.

The previous six-regular-level interpretation on the three PCK blocks was incorrect. The opposite-angle screenshots resolve **five full-size window rows**, with a separate low basement. Their plot-facing and PCK-street-facing walls have **four principal columns**, concentrated near the middle of the wall, with wider inner windows. The street entrance replaces the lowest right-middle opening. It does not have another window painted over its door. Each visible balcony elevation has three stacks across all five raised residential floors. Short basement windows are added only on the east elevations where they are readable; they are not counted as another residential floor.

The three oblique screenshots provide different evidence:

| Reattached screenshot | Displayed viewing heading | Main use |
| --- | --- | --- |
| `Screenshot 2026-11-22 131412.png` | 200.81° | Plot-facing PCK colours/openings and the immediate houses' street fronts |
| `Screenshot 2026-11-22 131553.png` | 26.86° | PCK street elevations, entrances, four-column window groups and opposing street houses |
| `Screenshot 2026-11-22 131737.png` | 289.83° | Three side-balcony stacks, five regular rows and small basement openings |

The headings describe the screenshot cameras, not the simulator's local facade names. Checks transform the actual facade normals through the local coordinate frame to ensure that the four-column plot faces point north and the entrance faces point toward PCK street. The two cadastral screenshots support identification and orientation; they do not establish facade openings.

Window heights, exact bay positions, colour values, entrance recesses, balcony depth and slab thickness remain visual estimates. Changing from six to five regular rows keeps the upper openings near the measured wall top and raises the lowest balcony above the basement. Exact concealed details are not inferred from a repeated pattern. A street house's concealed elevations retain the generic windows and are explicitly labelled `illustrative` in the placement model. On the immediate east neighbour only its readable lower pair and upper row are supplied, and on the immediate west neighbour only the readable narrow stack is asserted. No exact opening survey is claimed.

## Geometry and analysis

Appearance records never overwrite the official footprints, base levels, source heights, roof points or analytical samples. The source mass continues to drive the existing privacy analysis. Facade finish panels, entry details, balcony slabs and rails are rendered in eight or fewer batches across all observed buildings. They do not receive separate analytical obstruction credit, and they do not change the existing shadow model. Roof-edge coping is contained below each mapped top rather than inventing a higher silhouette.

Observed openings feed the same window batches as the prior renderer, including its night-window behaviour. Nested paint fields use separate shallow depth offsets to avoid flickering, all behind the window frames. A matching explicit blank-wall observation takes precedence over an inferred window or balcony. Official-ID matching prevents a profile from applying to an unrelated building at another property. Reversing footprint winding does not mirror an asymmetric facade pattern; translated and vertically scaled building variants keep their attached facade details.

Measured roof detail is handled separately from this facade interpretation. Nine nearby buildings have a separate compact extract of 2024-10-01 GUGiK class-6 airborne-laser returns in `data/sternicza-neighbor-roofs.json`. Each contains at most 150 roof samples selected from native 1 m cells. `observed-neighbor-roofs.js` filters isolated high/low returns and raised fixtures on predominantly flat roofs, retaining the full raw extract for inspection. It then uses the existing local roof-envelope interpolator to build one shared wall/roof seam. This preserves lower wings and gable profiles without leaving a uniform LoD1-height wall poking through the sloping roof. Windows above a resolved lower roof wing are clipped, and the old flat coping/colour overlays are omitted for these houses.

This is a visual reconstruction from sparse classified returns, not a complete surveyed roof topology. The analytical LoD1 fields remain unchanged. All nine resulting roof triangulations cover their own exact mapped footprint; the wall and roof reuse identical perimeter vertices. A photograph alone is not used to invent a ridge height or a chimney.

## Provenance limits

The source records distinguish the original 22 November supply from the 23 November reattachment/review. Their underlying aerial/oblique image acquisition dates are unknown, regardless of the dates in the screenshot filenames. The screenshots cannot establish changes since capture, concealed openings, a species inventory, or a survey-grade facade model. The application retains this distinction in each profile's `confidence`, `windowLayoutConfidence` and source records.

## Maintenance

Edit `data/sternicza-appearance-observations.json`, then run:

```sh
node scripts/generate-neighborhood-appearance.mjs
node --test tests/neighborhood-appearance.test.mjs
```

The generator creates a plain ES module so the static browser build does not require JSON import-attribute support. The test compares it with its source JSON and checks source identities, five regular rows plus separate basement slots, four-column cardinal orientation, doorway clearance, three raised balcony stacks, paint-layer depth order, ring-winding invariance, blank-wall priority, adjusted geometry, bounded draw calls and the SVG fallback.
