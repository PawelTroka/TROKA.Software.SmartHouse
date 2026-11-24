# Sternicza neighbouring-building appearance

The 22 November 2026 update adds a separate, evidence-labelled finish layer for twelve identifiable buildings around Sternicza 11. A 23 November review corrects the opening counts and facade patterns against five reattached screenshots, including three complementary oblique views. A 24 November follow-up checks all six original files against their retained hashes, refines the visible house garden elevations and completes PCK 5's side-wall colour fields. The original six source records and the five reattached filenames and SHA-256 hashes are retained in [`data/sternicza-appearance-observations.json`](../data/sternicza-appearance-observations.json); the screenshots are not distributed with the application or baked into facade textures.

## What changes

| Mapped object | Recognisable appearance introduced |
| --- | --- |
| PCK 3, `building-9` | Cream and pale blue fields with a central warm-yellow rectangle; five regular window rows and four principal columns on the plot/street faces; three balcony stacks per side |
| PCK 5, `building-15` | Cream upper, ochre middle and muted-green lower fields; central yellow/salmon rectangles; five regular rows, four principal columns and three salmon balcony stacks per side |
| PCK 1, `building-29` | Cream walls, ochre outer window fields and narrow salmon vertical stripes; five regular rows, four principal columns and three salmon balcony stacks per side |
| Immediate neighbours and three houses opposite, `building-2`, `-3`, `-5`, `-6`, `-7` | Two main-storey rows with grouped openings; 9a's garden balcony/terrace stack, 13a's upper garden loggia, and lower recessed guards on two opposite houses; their upper-terrace arrangement and obscured openings remain unresolved |
| Farther Sternicza houses, `building-8`, `-10`, `-19` | Distinct approximate facade tone and the earlier tentative street-facing bay layout |
| Neighbour 4h, `building-4` | Pale cream/yellow gable and dark slate/blue-grey roof; the recorded blank garden wall remains authoritative |

The three apartment blocks are registered against their official building identifiers and cadastral positions, not just their local integer labels. Facade directions are fixed in the property's existing local frame: `front` points toward negative local y and `rear` toward positive local y. On the PCK blocks and the houses on Sternicza 11's side of the street, `front` faces toward Sternicza. On the houses opposite, `rear` faces the street. The local east/west labels are not the screenshot camera headings. The rendered colours are chosen from the visible broad facade fields; they are not colorimetric measurements.

The previous six-regular-level interpretation on the three PCK blocks was incorrect. The opposite-angle screenshots resolve **five full-size window rows**, with a separate low basement. Their plot-facing and PCK-street-facing walls have **four principal columns**, concentrated near the middle of the wall, with wider inner windows. The street entrance replaces the lowest right-middle opening. It does not have another window painted over its door. Each visible balcony elevation has three stacks across all five raised residential floors. Short basement windows are added only on the east elevations where they are readable; they are not counted as another residential floor.

The three oblique screenshots provide different evidence:

| Reattached screenshot | Displayed viewing heading | Main use |
| --- | --- | --- |
| `Screenshot 2026-11-22 131412.png` | 200.81° | Plot-facing PCK colours/openings and the immediate houses' street fronts |
| `Screenshot 2026-11-22 131553.png` | 26.86° | PCK street elevations, entrances, four-column window groups and opposing street houses |
| `Screenshot 2026-11-22 131737.png` | 289.83° | Three side-balcony stacks, five regular rows and small basement openings |

The headings describe the screenshot cameras, not the simulator's local facade names. Checks transform the actual facade normals through the local coordinate frame to ensure that the four-column plot faces point north and the entrance faces point toward PCK street. The two cadastral screenshots support identification and orientation; they do not establish facade openings.

Window heights, exact bay positions, colour values, entrance recesses, balcony depth and slab thickness remain visual estimates. Changing from six to five regular rows keeps the upper openings near the measured wall top and raises the lowest balcony above the basement. Exact concealed details are not inferred from a repeated pattern. A street house's concealed elevations retain the generic windows and are explicitly labelled `illustrative` in the placement model. On the immediate east neighbour the street front retains only its readable lower pair and upper row; on the immediate west neighbour the street front retains its readable narrow stack. Their separately observed garden-facing openings and guards belong on `rear`, not on those street fronts. No exact opening survey is claimed.

## House groups and balcony placement · 24 November

The original `image(20261122-121609).png` looks from the PCK side toward Sternicza at a displayed heading of 26.86°. It shows the **garden sides of 9a and 13a**, while also showing the **street sides of the opposite houses**. The complementary 200.81° view shows the immediate houses' street fronts. Keeping those identities separate avoids transferring a garden balcony onto the wrong elevation.

| Mapped object and local elevation | Readable evidence retained | Unresolved detail |
| --- | --- | --- |
| 9a / `building-2`, `rear` | Two main rows, wider outer window groups, central access group with pale projecting guards at both raised levels | Exact window divisions, balcony/terrace dimensions, lower basement openings |
| 13a / `building-3`, `rear` | Left window group on each main floor, upper-right shaded loggia with a pale guard | Lower-right opening behind foliage, exact recess depth and hidden construction |
| Direct opposite / `building-5`, `rear` | Supported lower side recess/guard, broad central group, narrower group at the other side | Upper terrace and recessed door relationship, basement/garage openings, exact divisions and dimensions |
| Opposite east / `building-7`, `rear` | Supported lower side recess/guard and a broader central group across two main rows | Upper terrace and recessed door relationship, exact dimensions and foliage-hidden openings |

The grouped windows use their own widths and internal dividers. An opening's width is limited by its actual neighbours and mapped wall, rather than shrinking every opening to a fixed fraction of an equal-width grid. The dividers convey the visible grouped character; their exact number and dimensions remain estimates at this image resolution.

The opposite houses' narrow wings have lower measured tops than their main bodies. The photo is consistent with an open upper terrace above a lower recess, whose door is set back into the main house. Its exact guard/back-wall geometry is unresolved. Only the supported lower loggia is placed on that wing; a second opening is not floated above the measured wall and the wall is not raised to make it fit.

The explicit balcony records distinguish a projecting slab/guard from a recessed-looking loggia. A loggia uses a shaded facade opening and a flush guard; it does not add a projecting slab or cut a surveyed cavity into the analytical building. Its stored depth is an illustrative presentation allowance, not a measured recess. The main floors stay above the lower basement zone. Unreadable basement windows are not invented as another full-height row, and illustrative side elevations use the same main-floor datum.

One directional profile is registered across the whole elevation, including offset wall segments. Each opening is then placed on its actual mapped wall segment. This matters for 13a's two rear wall planes and the narrow loggia wings across the street: a small segment does not repeat a complete window pattern or cause the observed group to disappear.

The original 113.34° and 289.83° views also show PCK 5's balcony elevations. These carry cream upper, ochre middle and muted-green lower horizontal fields, with central yellow-upper and salmon-middle rectangles. The earlier vertical-only strips on these sides are replaced; the corrected five main rows and three balcony stacks remain unchanged.

## Geometry and analysis

Appearance records never overwrite the official footprints, base levels, source heights, roof points or analytical samples. The appearance layer does not modify the obstruction geometry. Facade finish panels, entry details, balcony slabs and rails use shared, bounded batches across the observed buildings and receive no separate analytical obstruction credit. The resolved building roofs and walls described below now supply both the visible body and the local privacy/sunlight obstruction model. Roof-edge coping is contained below each mapped top rather than inventing a higher silhouette.

Observed openings feed the same window batches as the prior renderer, including its night-window behaviour. Nested paint fields use separate shallow depth offsets to avoid flickering, all behind the window frames. A matching explicit blank-wall observation takes precedence over an inferred window or balcony. Official-ID matching prevents a profile from applying to an unrelated building at another property. Reversing footprint winding does not mirror an asymmetric facade pattern; translated and vertically scaled building variants keep their attached facade details.

Measured roof detail is handled separately from this facade interpretation. Nine nearby buildings have a separate compact extract of 2024-10-01 GUGiK class-6 airborne-laser returns in `data/sternicza-neighbor-roofs.json`. Each contains at most 150 roof samples selected from native 1 m cells. `observed-neighbor-roofs.js` filters isolated high/low returns and raised fixtures on predominantly flat roofs, retaining the full raw extract for inspection. It then uses the existing local roof-envelope interpolator to build one shared wall/roof seam. This preserves lower wings and gable profiles without leaving a uniform LoD1-height wall poking through the sloping roof. Windows above a resolved lower roof wing are clipped, and the old flat coping/colour overlays are omitted for these houses.

This is a visual reconstruction from sparse classified returns, not a complete surveyed roof topology. The retained LoD1 source fields remain unchanged. From the 24 November follow-up, local privacy and sunlight rays use the resolved roof and wall geometry also used for rendering, rather than the earlier median-height analytical prism. All nine resulting roof triangulations cover their own exact mapped footprint; the wall and roof reuse identical perimeter vertices. A photograph alone is not used to invent a ridge height or a chimney.

### 4h: separate roof levels and measured gable edges

The 23 November browser review identified a defect in the earlier single-height-field reconstruction of building 4h. It connected the low front and west extensions directly to the main roof with steep dark roof triangles. A watertight mesh could still depict the wrong architectural surface: these changes in building height require walls between separate roofs.

The correction is gated by 4h's official identifier, `ID-2261-26BC7443-6C90-FAF6-E053-CA2BA8C0FAE4`. The 23 November roof correction leaves the general triangulator, the other eight optional roof reconstructions and source extraction unchanged. The 24 November follow-up also uses the resolved stepped body in local privacy and sunlight analysis; it does not overwrite the retained source heights. It uses the existing 149-point extract from 6,317 classified roof returns acquired on 1 October 2024.

| Evidence in the native local coordinate frame | Reconstruction |
| --- | --- |
| A 0.93 m gap separates the lower cluster's highest return at 8.92 m from the main cluster's lowest return at 9.85 m | The midpoint is used only to identify the two spatially separated lower roof clusters |
| West lower-roof returns end at local x = −14.527 m; main-roof returns begin at −14.395 m | Place the west step within this observed gap, at x = −14.461 m |
| Front lower-roof returns end at local y = 28.324 m; main-roof returns begin at 29.054 m | Place the front step within this observed gap, at y = 28.689 m |
| Sixteen west-extension returns fit one plane with 0.029 m RMS error and 0.071 m maximum residual | Use the supported plane for the west extension's boundary |
| Eleven front-extension returns fit a near-flat plane with 0.119 m RMS error and 0.276 m maximum residual | Use the supported plane for the front extension's boundary |
| Near-edge returns describe the main gables and a rear-east eave at elevation 10.52 m | Interpolate the measured edge profile continuously; do not raise the corner to the adjacent higher gable |

The two step positions are estimates inside measurement gaps, **not surveyed wall lines**. The source elevations in this table use the retained vertical datum, not heights above the garden. The lowest retained front-extension return remains at 5.49 m and the highest supported return remains at 16.28 m. Boundary plane extrapolation can differ slightly from those interior sample elevations.

The three patches are triangulated separately. Their internal boundaries share the same horizontal coordinates at two different elevations, joined by vertical faces using the facade material. No roof triangle crosses either lower-to-main step. Exterior walls split their edges at the lower eaves so the complete roof/wall mesh has no T-junctions or unmatched edges above its intentionally open ground perimeter. Main-roof interior samples and supported high returns remain in the roof; the correction does not substitute a guessed flat cap or a generic gable.

This reconstruction retains 148 of the 149 source samples. It restores the coherent west-extension return at `[-14.527, 36.497, 8.92]` and the measured corner eave at `[0.133, 40.072, 10.52]`, both previously rejected by the generic neighbour filter. The isolated interior low return at `[-2.219, 40.001, 10.73]` remains filtered. Source records remain intact for inspection.

Classification, gap detection and plane acceptance run before any exploratory building translation or height scaling. The resulting geometry then follows the same transform as its parent building. Plane-fit metadata is explicitly named `nativePlane` to distinguish its coordinate frame from transformed vertices. Main-roof dormers, cross-gables and raised features still use sparse measured samples; this does not turn the model into a survey of individual roof surfaces or exact decorative details.

## Provenance limits

The source records distinguish the original 22 November supply from the 23 November reattachment/review and the 24 November check of the original files. Their underlying aerial/oblique image acquisition dates are unknown, regardless of the dates in the screenshot filenames. The screenshots cannot establish changes since capture, concealed openings, a species inventory, or a survey-grade facade model. The application retains this distinction in each profile's `confidence`, `windowLayoutConfidence` and source records.

## Maintenance

Edit `data/sternicza-appearance-observations.json`, then run:

```sh
node scripts/generate-neighborhood-appearance.mjs
node --test tests/neighborhood-appearance.test.mjs
```

The generator creates a plain ES module so the static browser build does not require JSON import-attribute support. The test compares it with its source JSON and checks source identities, five regular rows plus separate basement slots, four-column cardinal orientation, doorway clearance, three raised balcony stacks, paint-layer depth order, ring-winding invariance, blank-wall priority, adjusted geometry, bounded draw calls and the SVG fallback.
