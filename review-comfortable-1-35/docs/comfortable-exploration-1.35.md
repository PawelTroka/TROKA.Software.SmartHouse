# SmartHouse 1.35 — comfortable exploration, open kitchen and minimal design families

## One comfortable walking controller

The full house-and-garden view now shares the original interior controller's parameters and input math: a fixed 70° field of view, 1.68 m/s normal speed, 2.7 m/s with Shift, 0.0043 rad/pixel look sensitivity, and a maximum 56 ms movement interval after a slow frame. Dragging right looks right; dragging up looks up. There is no camera roll or head bob. Scroll and pinch do not change the walking lens.

Camera height follows floor, stair and terrain changes through a speed-limited exponential approach. This removes the immediate per-tread jumps and eases movement off terrace edges and across changes in ground height. The same integration produces the same settled height across ordinary frame rates. Long pauses cannot produce one large movement leap.

The lightweight interaction render profile remains active while a movement key, touch direction or look drag is held. High detail returns after movement settles. Free movement bypasses the physical collision search entirely. These changes address identified sources of uneven movement; actual frame rate still depends on the device, viewport and scene. They do not establish a measured frame-rate or comfort guarantee on the user's device.

## Free exploration is the default

**Movement → Free exploration** permits travel across terrace edges, uneven front and rear ground, pool coping, the jacuzzi, walls, glazing and furniture. The pool, jacuzzi and plunge basin have water-level viewpoints. Vertical exploration is unrestricted, including above and below the house. Ground following selects the nearby level without jumping to a floor above the camera.

| Control | Action |
|---|---|
| WASD / arrows | Move horizontally |
| Drag the view | Look around |
| Shift | Move faster |
| E / Page Up | Rise and hold free height |
| Q / Page Down | Lower and hold free height |
| R | Return to following the local floor or ground |
| Direction pad | Move on a touchscreen |
| Rise / Lower / Follow ground | Touch controls for height |
| Start walking from | Begin at the garden, living floor, first floor, basement or attic |

**Movement → Respect walls & steps** retains the physical circulation model as an optional check. The setting survives saved designs and shared links. Undo/Redo and A/B comparison retain the current movement preference. Schema 31 adds the preference without changing existing garden or building dimensions; older designs start in free exploration.

## Kitchen opened toward the living room

All 34 renovation styles share the revised physical kitchen:

- A **3.65 m clear architectural opening** toward living/dining.
- One **1.80 × 0.85 m island**, placed at the living edge.
- Approximately **0.95 m access on the left and 0.90 m on the right** of that island.
- The intrusive living-side tall unit, second central preparation block and obstructing dining console removed.
- Pantry, refrigerator and fitted cabinet storage retained on the enclosed sides.
- One **1.42 m sink window on the side-garden elevation**; the street-facing kitchen window is closed.
- The existing full-width rear living-room HST remains in place, with an open sightline from kitchen through living toward the rear garden.

The kitchen occupies the front-left of the retained footprint. The living room occupies the true rear elevation, so a literal rear-facing kitchen window would require relocating the kitchen or changing that room arrangement. This iteration gives the sink a side-garden outlook and keeps the rear opening through the living room.

The island has a thin stone top with waterfall ends. Cabinetry uses recessed toe-kicks, separate fronts and appropriately scaled finger rails or handles. Timber fronts use calibrated photographic grain; painted, metal and gloss cabinetry have distinct surface responses. Current continues to show the archived original house layout.

## Twelve additional physical renovations

The catalogue now contains **35 choices: Current and 34 renovations**. The new styles use distinct openings, facade depth, furniture and room compositions as well as different materials.

| Style | Design direction |
|---|---|
| Nordic Minimal | Pale ash boarding, light spindle furniture, slim openings and floating beds |
| Nordic Blackwood | Charcoal timber, warm cedar reveals, low platforms and limestone |
| Warm Minimalism | Cream plaster, flush oak, linen and wide limestone paving |
| Soft Minimalism | Rounded seating, oval stone tables, pale floors and diffuse coves |
| Belgian Minimalism | Deep limestone openings, substantial stone and relaxed linen |
| Monolithic White | Broad white mineral planes, recessed glazing and low block furniture |
| Glass & Stone Modern | Fine charcoal framing, open metal furniture and walnut joinery |
| Sculptural Concrete | Board-formed concrete, deep shadows and warm walnut platforms |
| Organic Limestone | Honed limestone, rounded low seating and fluted oak |
| Japanese Minimalism | Low platforms, shoji details, fine screens and open room compositions |
| Bali Stone Sanctuary | Limestone, teak, canopy beds, woven fronts and shaded spa courts |
| Tropical Minimal Resort | Pale stone, sparse teak screens, linen and open rope furniture |

The existing six garden recipe families coordinate the larger style catalogue around the shared pool proposal. The photographic sample catalogue includes eight material roles for each choice, with deduplication keeping its image transfer below 2 MB. Existing licensed material provenance is retained.

## Verification

Geometry and state tests cover free traversal, water levels, multi-floor support selection, physical-mode preservation, frame timing, height easing, all-style kitchen circulation, distinct architectural/furniture recipes, material identity and persistence. Browser acceptance checks cover real WebGL rendering, the expanded catalogue, room handoff, keyboard/drag/touch movement, elevation controls, floor starts, saved designs and mobile layout. The existing-style and new-style exterior sweeps run independently so each has a bounded execution window.

Release-specific results, commit identity and browser evidence are recorded in the pull request. Photographic materials and finer construction details improve this real-time model; the geometry remains an architectural design proposal.
