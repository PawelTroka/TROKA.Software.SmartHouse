# Garden Studio · 1.24.0

This release reviews all three property simulators: Sternicza 11, Konrada Korzeniowskiego 40 and Nadmorska 17. It adds a coordinated design catalogue, improves the rendering pipeline and makes physical conflicts and evidence easier to inspect. The original mapped plots and neighbourhood data remain the reference for each property.

## What a style changes

Twenty concepts sit beside **Current design**. Each recipe coordinates colour, paving bond and module, lounge furniture, dining details, canopy trim and pendant form. These are original procedural models, not downloaded product models or photographs of a proposed building.

| Family of concepts | Available designs |
|---|---|
| Natural and restrained | Organic Modern; Contemporary Modern Minimalism; Scandinavian; Organic Scandinavian |
| Japanese and Nordic hybrids | Japandi; Organic Japandi; Danish Mid-century; Finnish Sauna Terrace |
| Sheltered retreats and courtyards | Luxury Hidden Bali Resort; Mediterranean Villa; Baltic Dune House; Gdańsk Brick Courtyard |
| Sculptural and social | Space Age; Luxury Contemporary Party Club; Riviera Art Deco; Palm Springs Poolside |
| Further interpretations | Arts and Crafts Garden; Desert Modern; Alpine Lodge; Industrial Loft Terrace |

The **Preview house exterior finishes** switch is separate from the garden recipe. It previews the main house's wall, roof and frame colours. It does not restyle neighbouring buildings or change the mapped house geometry. All style choices preserve the selected planting, plot, pool, levels, gates and structural dimensions.

The [design research record](design-style-research.md) connects each interpretation with primary architectural or design sources and records Gdańsk climate, exterior material and lighting considerations. Regional character comes from the selected finish and form; choosing Bali does not plant a tropical species or create extra screening credit.

## Editing and comparison

- A searchable, filterable native dialog presents the complete catalogue. Material boards communicate the palette; selecting a board applies the recipe to the actual site model.
- A bounded history supports Undo and Redo, including keyboard shortcuts outside editable fields. History preserves the current camera, time and rendering preference. An unrelated viewpoint change does not erase the redo branch.
- Saved designs, A/B comparisons, share links and JSON exports include the chosen recipe and house preview. Schema 24 accepts the older supported schemas. Earlier designs start with Current design and motion off; their prior physical assumptions remain preserved by the existing migrations.
- Quick light comparisons resolve to 45 minutes after sunrise, local solar noon, 45 minutes before sunset and 20 minutes after sunset. These are convenient clock positions, not a guarantee of a particular sky condition or solar-elevation band.
- Mobile navigation links jump to the viewer, design controls and checks without overwriting a shared design's URL hash. The smaller-screen layout has larger controls and a taller scene.

The modal uses the browser's focus containment, Escape dismissal and inert background. Focus returns to its opener. See [W3C technique H102](https://www.w3.org/WAI/WCAG22/Techniques/html/H102) and [WCAG target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum). These implementation choices do not constitute a complete accessibility certification.

## A style is not an installation quote

Existing base finish, furniture and lighting allowances remain in the budget. The selected style adds a separate **incremental installed upgrade** field. A zero value means that style-specific work is unquoted and excluded from the known subtotal, even when planning allowances are on. A supplier's full package must be reconciled against the existing base lines before entering only its additional cost.

If house exterior finishes are previewed, that scope must also be included in the additional quote. Style switching does not invent a percentage premium, reuse a catalogue furniture price for bespoke geometry, or change the installed fixture count. The uncertainty allowance remains applied once to the upper combined amount. Changing the style or house-finish scope clears the prior incremental quote; Undo restores it with the prior design. The selected style, scope and separate quote are exported.

## Physical review

The live **Design checks** panel compares represented finished footprints with the mapped boundary, house and retained structures. It includes coping and other finish extents, not just object centres. It also surfaces maintenance-space intrusions, relevant stair-foot grade variation, parcel-area discrepancies, utility-location gaps and the modeled garage checks.

The revised boundary fit distinguishes inside, intersecting and wholly outside footprints. Edge crossings are included, so a rectangle spanning a concave notch cannot pass merely because its corners lie inside. Negative or intersecting fit is not reported as a positive boundary clearance.

Classic pools now use the same complete-footprint grade treatment as the Sternicza spa programme. Ground is sampled over the coping bands; the finished coping is level above their high side, the water remains level below it, and the exterior skirt reaches the lower ground. The pool camera, rendering and sunlight calculations share these levels. A separate editable water-below-coping assumption starts at 0.10 m for new designs. Older designs retain their former illustrative 0.02 m high waterline. The chosen skimmer or overflow system must establish the eventual operating level; the jacuzzi overflow switch remains independent.

The physical audit also corrected missing classic-pool coping and terrace-stair occluders in sunlight calculations. The current canopy support detail clears the jacuzzi service area while remaining a proposal requiring structural design. Retaining the detached garage continues to be a user choice; any resulting pool or terrace intersections appear as conflicts rather than disappearing from the model.

See [the physical audit](design-checks-1.24.md) for calculations, measurements, source distinctions and tests. A clear plan-intersection result covers only the represented objects. It does not verify underground services, excavation stability, boundary ownership, access rights, mature root systems or construction feasibility.

## Rendering and resource use

The rendering audit keeps the pinned Three.js version and improves its existing material, geometry and lifecycle paths. Indexed terrain reuses vertices on the existing tessellation. This changes storage and adjoining surface normals while preserving the original triangle coordinates and mapped terrain shape.

| Site | Previous terrain vertex entries | Indexed entries | Terrain triangles retained |
|---|---:|---:|---:|
| Sternicza 11 | 118,893 | 20,448 | 39,631 |
| Korzeniowskiego 40 | 31,848 | 5,668 | 10,616 |
| Nadmorska 17 | 67,524 | 11,720 | 22,508 |

These are structural scene measurements, not an FPS benchmark. They represent roughly 82% fewer terrain vertex entries across the three generated layers. Static detail batching, explicit texture disposal, unchanged-size resize checks and solar-shadow invalidation are reviewed separately in the [rendering study](rendering-1.24.md).

**Automatic**, **Eco** and **High detail** bound the drawing-buffer scale and shadow resolution. Automatic reduces its pixel budget during interaction and accounts for a constrained device where that browser signal is available. Eco caps pixel work more aggressively. High detail retains the larger shadow setting, subject to hardware limits. Geometry and analytical results do not change with quality.

Water uses a periodic linear normal map rather than interpreting a colour image as physical height. Material relief and albedo use separate colour-space roles. The custom sky receives the renderer's output conversion. Night environment illumination retains a small bounded contribution instead of dropping abruptly to zero.

Optional gentle water motion changes the water's surface detail, not its physical elevation or the pool-eye datum. It is bounded in frame rate and pauses in diagrams, when the viewer is offscreen, when the document is hidden and when reduced motion is requested. Motion is off by default. The scene otherwise rests between interactions.

The public diagnostics panel reports the actual renderer, drawing-buffer size, draw calls, rendered triangles and resource counts. It supports verification on a particular device; it does not promise a universal frame rate.

## Representation limits

This remains an interactive planning model. The improved materials, fixture forms, furniture and water are procedural visualisations. The available street photograph informs parts of Sternicza's facade, and the other sites retain their mapped evidence and explicit assumptions. No facade survey, laser scan, new terrain survey or calibrated light measurement was obtained for this release.

The renderer does not perform path-traced global illumination, fluid dynamics, wave-force calculation or photometric lux design. Screening remains a sampled geometric model. A garden style does not change its density assumptions. The garage retains its straight quasi-static vehicle envelope and existing limits concerning street turning, actual threshold/drainage details, open scissor doors and the existing structure.

## Verification record

Unit tests cover schema migration, style-specific geometry bounds, fixture circuits, bounded history, incremental quote accounting, footprint containment and terrain/level consistency. The CI browser suites exercise the public controls and actual WebGL, record resource counts and screenshots, and cover mobile layouts and existing night-light, balcony and garage behaviour. The release validation record records the exact results and deployed commit after those gates complete.
