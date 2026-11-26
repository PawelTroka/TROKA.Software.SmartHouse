# SmartHouse 1.34 — continuous walking and the summer garden

This release implements the requested connected house-and-garden experience and revised renovation proposals for Sternicza 11. The archived **Current design** remains the original drawing comparison; choose a renovation style to use the connected four-level proposal.

## Walking and access

**Walk** uses one scene and one movement model indoors and outdoors. WASD or arrow keys move, dragging looks around, Shift increases speed, and four on-screen direction buttons support touch. **Start walking from** offers the garden, living floor, first floor, basement and attic. **Eye level** and **Enter room** within Interiors enter the same full-scene walker.

Walls, door leaves, glass, furnishings, floor openings, stair undersides, roof headroom, tree trunks, water bodies and the moving garage cars constrain the walker. Each stair uses the same tread surfaces in the visual model and movement calculations. Renovation openings align with the main stair; a compact attic flight replaces the folding-hatch access; the cellar flight follows the lowered garage floor. Terrace steps connect to the actual garden grade.

The connected routes are design proposals. The old drawing comparison retains its original openings and folding hatch. The attic stair's structural opening, pitch and measured headroom still need project design.

## Living room, kitchen and bathroom

Every renovation has a continuous garden-facing HST aperture with slim end jambs and three panels. The left panel is fixed; the other two stack over it on separate tracks. **Open the terrace doors** controls the opening from closed to approximately two thirds of the clear span. The visual panes and walk collision intervals agree.

The kitchen is enclosed from the hall, with one connection toward living/dining. Pantry and appliance cabinets, drawer runs, wall cupboards, refrigerator storage and closed island/worktable storage remain across the renovation styles.

The upstairs bathroom uses a **0.90 × 1.80 × 0.62 m hydromassage bathtub** with discreet jets and controls. The larger terrace spa remains outside.

## Terrace and atmosphere

The jacuzzi is centered in both terrace axes. Seating occupies the side bays and clear circulation surrounds the spa. **Aurora**, **Lagoon** and **Warm amber** choose the water-light mood; restrained bubble and ripple animation uses the existing Scene motion control and respects reduced-motion preferences.

Canopies and balcony proposals have **no freestanding structural columns or downstand front beam**. They are shown as concealed cantilever concepts; clear glass guards retain their finite rail members. The illustrated slab is not an engineered cantilever specification. House connections and structure, including the full-width HST opening, require project-specific design.

Sagging strings of warm shaded pendant bulbs follow the garden paths and dining area. Their supports sit beside the route. Lower landscape, tree, hedge and step lighting creates a softer evening scene. Initial landscape/pendant/hedge dimmers are **45 / 65 / 30%**, with independent switches and controls retained.

## Distinct renovation styles

The style differences extend into physical cladding, depth, gables and furniture. Examples include continuous teak screens in Hidden Bali, paired walnut screens in Japandi, broad horizontal bleached-oak boards in Beach House, finer painted lap siding and shutters in Coastal, and broad travertine ground volumes in Organic Modern.

Photographic materials use normal and roughness maps, metric grain/board direction, small physical bevels and varied source-photo offsets. Roof UVs follow the sloped surface in metres. These changes improve the real-time rendering; it remains an interactive planning model rather than a surveyed digital twin or an offline photographic render.

Pines use genuine **Poly Haven pine_bark** photographs and surface maps, credited to Dimitrios Savva under CC0, with metric cylindrical UVs. Source and delivered hashes are recorded in the material manifests.

## Pool and planting

The new **8 × 3.5 m** pool is at **x = 3.25, y = 25.00**, leaving approximately **1.15 m** from its coping to the bottom terrace tread in the registered default geometry. One, two or three sunbed sides provide four, six or seven beds. Finish styles retain this pool location.

The final model averages **6.94 equivalent direct-sun hours per day over the water surface**, compared with **4.93** for the previous pool and Excelsa layout: approximately **41% more**. This is a water-area average across all 92 June–August days, not a promise of whole-pool sun or actual cloud-free weather. The chosen position leads the verified feasible shortlist, subject to circulation and planting constraints.

The default three Austrian pines are 9.5 m high with 5 m crowns, at **(18,35), (14,36), (18,28)**. All 14 species options have calculated boundary placements. Changing the trio's species applies its preset automatically; replacing an individual tree retains its manual position.

Weighted PCK3 screening across nine sampled views is **93.78%** with the new pines, versus **70.76%** with the previous Excelsa. For the same pine stock, repositioning changes coverage from **93.32% to 93.78%**; the original larger crowns screened more. The plot edge and crown overhang remain visible, and the results include other modeled blockers.

See [the summer garden study](./summer-garden-1.34.md) for sampling, geometric constraints, all baselines and reproducibility commands.

## Saved designs and optional alternatives

State schema 30 serializes walking mode, HST opening, spa mood, centered spa, summer layout and sunbed sides. Earlier shared links and saved comparison A retain their historical design assumptions. An active earlier session adopts the requested resort changes once; manually edited trees and custom light settings are retained. The unchanged previous automatic Excelsa trio becomes the new default pines.

The optional pavilion keeps its genuine broad-pine conflict visible and offers **Use pavilion planting · Excelsa trio**. The old optional pergola location is unchanged and reports its actual collision with the new pool. These alternatives are off in the default garden.

## Verification

The automated geometry/state/material suite covers the four-level movement round trip, all 22 renovation entry routes, kitchen and bathroom circulation, exact stair treads, open/closed glazing collision, centered spa, absence of structural cover columns, species switching, historical state migration and material provenance. Browser checks cover rendered room handoff, keyboard and on-screen walking controls, floor starts and existing design/property workflows. Release-specific results are recorded in the pull request.
