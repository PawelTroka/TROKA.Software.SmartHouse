# Rendering and performance study, 1.24

The study used the vendored Three.js **r160** and the three shipped property datasets. Version 1.23.0 already rendered on demand, fitted its directional shadow camera to the property and used GPU instancing for repeated windows and hedge crowns. The largest measured opportunities were duplicated terrain vertices, redundant invalidation, rebuilding the site's geometry while changing finishes, and repeated small opaque garden meshes.

## Measured scene structure

The baseline is commit `5a9d334bb2f4fa3c78ad2e168358459b6c14c57f`. Both snapshots used the default design, a 960 × 540 orbit viewport, one initial update and an immediate repeat of the same solar calculation and viewport size. An instrumented rendering backend traversed the actual Three.js objects, leaving the geometry builders, transforms, materials, shadows and disposal code in operation. The terrain measurements include the two context layers and the parcel terrain. Indexed terrain uses one height sample for each distinct XY coordinate within a mesh. Every retained triangle follows the original winding and positions. Shared vertices also produce continuous normals at cell boundaries.

| Property | Terrain vertices, before → after | Reduction | Terrain triangles in both | Visible renderable objects, before → after |
| --- | ---: | ---: | ---: | ---: |
| Sternicza 11 | 118,893 → 20,448 | 82.8% | 39,631 | 1,238 → 1,161 |
| Korzeniowskiego 40 | 31,848 → 5,668 | 82.2% | 10,616 | 464 → 405 |
| Nadmorska 17 | 67,524 → 11,720 | 82.6% | 22,508 | 616 → 556 |

On every site the repeated input increased both frame and sun-shadow fit counts from 1 to 2 in 1.23.0. Both counters stayed at 1 in 1.24. Small spatial batches combine compatible fixed, opaque garden parts while retaining their triangles, UVs, normals, shadow flags and ray intersections. Named geometry, animated vehicles, transparent layers and fixtures keep individual identities. The object column counts visible scene-graph entries before camera culling. The WebGL renderer reports submitted draw calls separately.

Two complete cycles through the 20 non-default finishes and back to Current retained the same terrain object. The original house object also persisted with exterior renovation off. The instrumentation collected geometry and material instances referenced by the entire scene, registered disposal listeners, and checked the counts after each rebuild. Some fixture geometries are shared between objects.

| Property | Live geometry / material objects at start | After returning to Current | Still tracked after scene disposal |
| --- | ---: | ---: | ---: |
| Sternicza 11 | 1,146 / 273 | 1,146 / 273 | 0 / 0 |
| Korzeniowskiego 40 | 407 / 134 | 407 / 134 | 0 / 0 |
| Nadmorska 17 | 543 / 165 | 543 / 165 | 0 / 0 |

Geometry and material counts describe application-owned objects. GPU frame time requires a browser, driver, device, view, pixel density and lighting scenario. The local Chromium executable could not create its Unix-domain singleton socket in this executor, so this study provides no local GPU timing, FPS or photorealism score. The release browser checks and the live Render diagnostics provide separate WebGL evidence. The image remains a planning illustration with procedural finishes and proposed furniture.

## Quality and lighting

| Setting | Maximum drawing-buffer area | DPR cap | Solar shadow map | Optional movement ceiling |
| --- | ---: | ---: | --- | --- |
| Eco | 720,000 pixels | 1.0 | 1,024² | 15 updates/s |
| Automatic | 2,100,000 at rest, 1,152,000 on devices reporting ≤4 GB, 900,000 during navigation | 1.75 at rest, 1.2 moving | 1,024² on narrow or constrained devices, otherwise 2,048² | 15–24 updates/s |
| High detail | 4,000,000 pixels | 2.0 | 2,048² | 15–24 updates/s |

Hardware limits can reduce both resolution and shadow size. Automatic restores its still-frame budget once navigation settles. The camera projection continues to use the CSS viewport aspect. The sun-shadow target is released and recreated only when its size changes. Each light updates its shadow when its source or casters change. Camera rotation alone can reuse the sun map.

Surface colour textures use sRGB. Water normals, mineral microrelief and the bark height field contain linear numeric data. A two-metre periodic water normal field provides the same wave scale for differently sized pools and tubs. Water uses a single dielectric interface with an index of refraction of 1.333, transparent shading and a bounded prefiltered sky environment. This approximates water appearance without an additional transmission render target. The sky material follows the same tone-mapping and display conversion as the physical materials. The sun follows the ephemeris, diffuse light and reflections vary across civil twilight, and direct sunlight turns off below the horizon.

Water motion translates only the normal field. Basin elevations, water level, shadows, analytical terrain and camera positions stay fixed. Motion starts off, respects reduced-motion preferences and suspends outside the viewport, on diagrams and in hidden documents. Solar playback, garage preview and user input retain independent redraw triggers. The SVG renderer retains geometry and style-specific forms using its established lightweight shading.

## Primary references and verification

- Three.js explains when to annotate colour textures as sRGB, the role of linear numeric maps and the final colour conversion for custom shaders. The vendored r160 chunks are `tonemapping_fragment` and `colorspace_fragment`. [Colour management](https://threejs.org/manual/pages/color-management.html)
- Rendering on demand and a capped drawing-buffer area avoid unnecessary work on static scenes and high-density displays. [On-demand rendering](https://threejs.org/manual/pages/rendering-on-demand.html) · [Responsive drawing buffers](https://threejs.org/manual/pages/responsive.html)
- Directional shadows use a separate render of shadow casters. Three.js documents the impact of shadow-camera coverage and map resolution. [Shadows](https://threejs.org/manual/pages/shadows.html)
- MeshStandardMaterial uses metallic-roughness shading and benefits from an environment map. The vendored r160 material exposes environment intensity per material. [MeshStandardMaterial](https://threejs.org/docs/pages/MeshStandardMaterial.html) · [Vendored r160 implementation](../vendor/three.module.js)
- Geometry, textures, materials and render targets have independent lifetimes. [Three.js disposal guide](https://threejs.org/manual/pages/how-to-dispose-of-objects.html)
- The browser exposes document visibility independently of the scene's selected view. [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)

Run `node --test tests/render-quality.test.mjs` for the caps, terrain topology, linear maps, static batching, metric UVs and finish ownership checks. Browser diagnostics expose backing-buffer width and height, draw calls, triangles, geometry and texture counts, frame count, solar shadow fits and active motion state on `#render-diagnostics`. For repeatable comparisons use the same device, final camera position, viewport dimensions and solar setting, then return to the same finish after cycling. Browser-reported draw-call counts vary with frustum culling and transparent surfaces.
