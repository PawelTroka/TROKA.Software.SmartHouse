# Concealed spa covers, clearer glazing and interior dimensions · 1.39

## The current proposal

The jacuzzi and cold-plunge covers retract into concealed side cassettes below the terrace or stone surround. Open covers leave no parked leaves, exposed rails or raised handles on the finished surface. Closed leaves sit at the basin rim, with their finish following the selected renovation palette. The two controls remain independent under **Doors, gates & covers**, including fullscreen.

The cover animation uses the same exposed footprints for the scene and walking support. Hidden leaves do not create invisible floors; the solid coping and surround keep their height during movement. Closed covers also enter the sunlight model. This represents a concealed mechanism concept, not a specified manufactured cover or structural loading design.

## Pool seating and the nearest pine

The **3.20 × 6.50 m** pool remains at its rearward left-edge position. Three slim **0.78 × 2.00 m** chaises form an L: two follow the garden-facing long edge end-to-end, and one follows the near short edge. Their gap retains the illuminated pool approach. The optional third seating side is still available.

Only the nearest pine changes position: **pine-2 moves from (14.20, 32.50) to (19.30, 32.25)**. The other trees remain at **(13.00, 34.10)** and **(17.60, 34.90)**. Stock height, crown size, identity and other properties remain unchanged. The corrected trunk is approximately **1.01 m from the left boundary** and **1.02 m from the pool coping**. The existing crown-overhang indication remains in the plan and design checks.

The reproducible PCK3 study samples its modeled façade on a **0.25 m grid** using the actual public jacuzzi preset and the **4.00 m terrace**. It uses the same dense crown-envelope assumptions as the privacy analysis; it does not imply complete real foliage coverage.

| View | Previous façade samples hidden | Corrected nearest pine |
| --- | ---: | ---: |
| Seated jacuzzi preset, 0.70 m eye above terrace datum | 76.29% | 93.84% |
| Water eye level | 77.52% | 95.01% |
| East jacuzzi seat | 75.28% | 92.52% |
| West jacuzzi seat | 77.43% | 95.42% |

[Complete sightline assumptions and counts](../data/boundary-pine-1.39.json). Reproduce with `node scripts/boundary-pine-study.mjs`.

## Kitchen, bathrooms and indoor sauna

The two upper cabinets flanking the kitchen sink window are removed. The full-height pantry corner, refrigerator storage, cooking-wall storage and connected peninsula remain. The clear kitchen picture window is **2.30 × 1.46 m**, replacing the previous **1.42 × 1.28 m** aperture.

Bathroom windows now use clear glazing with a **0.98 m sill** and **1.44 m height**. Most widths are **1.80–2.30 m**, depending on the style and available room bay. The upper bathroom's side window is **1.46 m wide**, preserving a solid vanity-mirror mounting area. The indoor sauna has a clear **0.96 × 1.30 m** side-garden window with a **1.05 m sill**, above its bench/heater envelope.

These are actual wall apertures shared by the interior and exterior models. **Current house / Original drawings** retains the original glazing arrangement.

## Interior dimensions

The **Dimensions** checkbox controls the garden and interior measurements together. An equivalent **Dimensions · rooms & fittings** switch is available inside the interior workspace.

- Room labels show length × width, modeled floor area and ceiling height.
- Irregular rooms identify their dimensions as maximum extents. Areas exclude actual slab and stair openings.
- Major furnishings, cabinetry, appliances, bathroom fixtures and gym equipment show their modeled footprints. Heights appear only when explicitly defined in the model.
- Window and door labels show the wall aperture width × height. Frames and sliding leaves reduce the usable clear opening.
- Stair labels show the flight envelope width and floor-to-floor rise.

Labels follow the occupied storey and room, hide behind opaque geometry, and avoid overlapping one another. The dollhouse view prioritizes room summaries. Walking closer reveals the useful nearby details. Floor plans also show room dimensions and areas. All measurements remain approximate concept-model dimensions.

## Saved designs

Schema **35** updates only the active earlier session. It adopts the two-side seating arrangement and relocates the nearest pine only when the complete, unedited 1.38 triplet is recognized. Custom planting, missing specimens, manually changed coordinates and other properties remain untouched. Archived comparisons and versioned shared links retain their historical tree and seating settings.

## Verification

Geometry checks cover all 34 renovation styles, actual furnished-mesh window rays, room areas and voids, visible dimension occlusion, cover movement/support/shading, and garden route and furniture clearances. A focused real-WebGL suite captures the garden, seated jacuzzi view, open and closed covers, kitchen, bathrooms, sauna and dimension controls. Existing navigation, fullscreen, style, persistence, garage and mobile checks remain in the release workflow.
