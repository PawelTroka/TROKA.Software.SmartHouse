# Architectural rendering · 1.29.0

This update improves the actual interactive house and garden models. It addresses
the flat hedge surfaces, primitive furniture, uniform materials and washed-out
lighting visible in the supplied Bali and Modern screenshots.

## What changes

| Area | Implementation |
| --- | --- |
| Materials | Six Poly Haven CC0 photographic PBR sets: fine wood, wooden floorboards, grass, linen, stucco and marble tile. Eighteen local diffuse/normal/roughness files total 9,997,745 bytes. |
| Material scale | Physical source dimensions drive the UV scale. Separate normal and roughness channels replace diffuse-colour-as-height shortcuts. Style colours use bounded linear-light calibration. |
| Furniture | Rounded solid edges, inflated upholstery, deterministic compression folds and sewn piping. Bali timber frames and cane panels contain actual openings and interlaced reeds. The sunken lounge has shaped and piped cushions, beveled bench edges, an open rolled-rim bowl and individual charcoal/ember pieces. |
| Cars | Curved body lofts, glazing, wheel arches, clearcoat paint, tapered tyre shoulders and ten-spoke alloy rims retain the checked vehicle bounds and both parking positions. |
| Hedges | Four instanced, irregular conifer specimens with fine cutout foliage replace the visible rectangular screen and repeated ball clusters. The ideal analytical screen remains an invisible shadow proxy. |
| Trees | Fine foliage sprays on pine and conifer branch pads retain the configured crown envelopes, clear stems and locations. |
| Lighting | Lower ambient fill, AgX tone mapping, linear HDR composition and denoised GTAO contact shading. High detail permits 4096² sun shadows when supported. |
| Pool | High detail reflects the actual scene across the measured water surface. The reflection retains the existing ripple normals, transparency and direct highlights. |
| Navigation | Expensive contact shading pauses during navigation and settles afterward. Eco, small screens, constrained devices and unsupported WebGL use the direct renderer. Hidden views do not continuously render. |

Material sources, authors, source dimensions and byte-level integrity hashes are
recorded in [the asset manifest](../assets/materials/manifest.json) and
[asset attribution](../assets/materials/README.md). Assets are served by the
application itself; the browser does not contact Poly Haven.

## Geometry and saved designs

The upgrade changes render geometry and material response. It retains the
existing plot, floor elevations, openings, pool footprint, selected tree sizes,
hedge heights, sightline calculations and garage arrangement. Coastal, Modern,
Bali and the other existing style IDs keep their individual renovation recipes.
Both Cyberster-sized vehicle envelopes remain present in the selected two-car
proposal.

The saved-state schema remains **28**. Version **1.29.0** cache-busts the module
graph without migrating, resetting or replacing a saved design.

## Rendering limits

This remains a real-time WebGL architectural model. GTAO approximates local
occlusion in screen space; it does not calculate multiple diffuse light bounces.
The pool reflection is a single horizontal planar reflection. Vegetation is
procedurally modelled with original cutout foliage, rather than scanned plants.
The photographed finishes are representative samples, not measured site or
manufacturer materials. These changes do not establish that the entire model
is indistinguishable from a photograph.

The existing analytical hedge assumption remains ideal dense screening. Visible
foliage detail is not a botanical guarantee of opacity or future growth. All
existing architectural feasibility notes, including the basement garage
conflicts, remain applicable.

## Budgets and ownership

- A representative 100 m, 4 m hedge uses 155 plants, four instanced draw calls
  and 367,392 triangles. Dense folded branchlets surround a recessed core.
- Contact shading uses a reduced resolution and bounded sample count. Colour
  composition uses multisampling; tone mapping and display conversion occur once.
- Pool reflection is limited to 1024 pixels on its longest edge and 650,000
  pixels overall. It updates when camera, design, materials or lighting change;
  water-only animation reuses the capture.
- Decoded material images are shared, but each renderer owns its geometry,
  material and texture handles. Clones receive late asset uploads and dispose
  independently.
- Three.js postprocessing is pinned to the existing **r160** runtime with its
  MIT license retained. No second Three.js engine or runtime CDN is introduced.

## Verification

The complete local geometry/state suite passes **686 tests**. The static build
and renderer-module import checks pass. Targeted checks cover measured bounds,
foliage clearance, material ownership, asset hashes, UV invariants, the reflected
camera/clip plane, shader-hook composition and rendering budgets.

The browser suites include an explicit asset-ready and navigation-settled gate
before image comparisons. A two-context GPU readback additionally uploads the
placeholder first, then checks that real photographic variation reaches both the
original texture and an early clone after loading. Initial texture dimensions
match the photographic files, including the non-square linen maps, so immutable
WebGL2 storage cannot retain a flat placeholder. A geometry regression checks
that folded hedge spray winding and normals agree after nonuniform instancing.

`scripts/realism-browser-check.mjs` captures matching
before/after views plus Bali, Coastal, Modern, interior and mobile scenes. The
CI job retains its screenshots and JSON report as an artifact for visual review.

Browser results must be assessed before publication; unit tests alone do not
establish visual quality or successful GPU shader compilation.
