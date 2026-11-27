# SmartHouse 1.37 — retained trees, garden routes and fitted rooms

This update corrects the unrequested planting relocation introduced in 1.36 and fits the revised garden around the earlier trees. It also adds a recessed cold plunge, connected landscaped paths, ceiling-height kitchen storage, a compact basement gym and technical room, and a coordinated 2.2 m boundary with separate pedestrian and garage gates.

## The trees stay in place

The default pine trunk positions return to **(18, 35), (14, 36) and (18, 28) metres** in the local site coordinates used by 1.35. Their species, height and crown dimensions remain the same. Changing the pool layout, loungers, renovation style or gates never relocates them.

Saved-state schema **33** reverses only a complete, recognized automatic 1.36 tree triplet. IDs, ordering, stock dimensions, enabled states and custom prices are retained. Custom coordinates, incomplete groups and mixed-species groups are preserved. Earlier original positions do not move again. An explicit species-preset selection may adopt that species' earlier positions when the current group is still an unedited recognized preset; it preserves manually positioned groups.

The original-reference and Excelsa planting buttons remain explicit owner actions. If a custom or alternative species arrangement conflicts with the pool or paths, the design reports the conflict instead of silently moving the trees. Measured surrounding trees remain separate and unchanged.

## A smaller pool and parallel loungers

Here, **left** means the east boundary when looking from the house into the rear garden. **Upper-left** is interpreted as the left corner nearer the house.

| Element | Current coordinated garden |
|---|---|
| Pool water footprint | **3.20 × 6.50 m** |
| Pool origin | **x = 15.50 m, y = 19.80 m** |
| Change along the plot | **3.70 m nearer the house** than 1.36 |
| Default sunbeds | **Two 0.78 × 2.00 m chaises**, parallel to the long garden-facing pool edge |
| Optional sunbeds | One at the front short edge, then one at the rear short edge; **2 / 3 / 4** beds in total |
| Fire lounge | Central garden position, aligned with the terrace jacuzzi |

The modest width reduction from 3.50 m also preserves visible clearance between the enlarged terrace and the left hedge. The pool and optional rear chaise fit around the retained pine trunk at (18, 28). The selected layout is a spatial preference, not a new sunlight optimum. The Sun & shade view calculates the updated geometry; the historical 1.36 sunlight report describes its older pool and planting and should not be applied to this layout.

## Recessed cold plunge and connected paths

The cold plunge now has a **flush rim and surrounding apron**, with the water **80 mm below the rim** and **1.10 m water depth**. The outer shell remains **2.20 × 1.30 m**. The former external entry steps are removed. A bounded blend in the adjacent finished ground meets the apron smoothly; the general garden level remains unchanged.

The renderer, terrain opening, plan, water receiver, shade geometry and walking surfaces share these levels. Physical mode respects the basin walls; Free exploration can enter the plunge just as it can enter the pool and jacuzzi.

A connected route links the **terrace, pool, central fire lounge, sauna, cold plunge and dining area**. Inset stone slabs, mineral joints, narrow stone borders and low planting follow the selected material palette. The walking strip is 0.82 m wide, with 60 mm borders on each side. The default network is approximately **32.3 m long** and **27.9 m² including borders**, with shared junctions counted once. Style-dependent dining placement can make small changes to these quantities.

**Seven shielded warm path lights** illuminate the route, with two additional downward lights at the front gate piers. Their output follows the existing garden-light controls and time-of-day settings. The new path and gate fixtures add no shadow maps. Decorative furniture, planting and route meshes are batched to limit rendering overhead.

## Kitchen storage uses the available envelope

Every renovation style now brings the fitted cabinetry to the **2.70 m cabinet line**, with a small ceiling scribe. Storage continues above the refrigerator, across the cooking run, into the corner returns, along the side of the sink window and above that window. The shallow header starts above the window frame, retaining the single **1.42 m sink window** and its view.

The right-hand connection between the peninsula and sink run, concealed retained chimney and **1.18 m refrigerator-side entrance** from 1.36 remain. The open timber stair guard also remains. Appliance ventilation and flue access are represented as service allowances rather than filling every clearance with a solid block. **Current** still restores the original drawing-based kitchen.

## The rest of the basement

At the default two-car garage width, the remaining space contains:

| Room | Approximate clear footprint | Model contents |
|---|---|---|
| Compact gym | **3.87 × 4.40 m / 17.03 m²** | Exercise bike, low adjustable bench, dumbbell rack and clear mobility mat |
| Technical / laundry room | **3.29 × 3.40 m / 11.19 m²** | Plant and service equipment, laundry appliances, worktop and fitted storage |

Both parking lanes and the actual cars retain their geometry. Two **0.90 m internal openings** provide access from the retained stair side. The furnishings and their use areas remain outside the car lanes, retained cores and circulation route. The plan, interior studio and shared house-and-garden walker display the same fit-out. Two bounded unshadowed task lights make the new rooms usable in the interior view.

The proposal extends the existing lowered-basement assumption across these rooms: **floor −2.60 m with 2.30 m clear headroom**. The original cellar comparison remains at **−2.00 m / 1.70 m clear**. These are proposal levels, not confirmation of existing headroom or structural feasibility. If an edited garage position leaves insufficient room width, the fit-out is omitted with a visible explanation instead of occupying a parking lane.

## Matching fence and front gates

Open **Fence & entrances** to enable the boundary and independently open or close each gate. Use the **Front garden** viewpoint to inspect them.

- The fence follows all mapped parcel edges at **2.20 m above local finished ground**, including the front-to-rear level change.
- The pedestrian opening is **1.20 m clear**, with an inward-opening leaf.
- The garage opening is **6.60 m clear** in the default two-car proposal. Telescoping leaves park beside the opening, inside the parcel.
- Each of the **34 renovation styles** coordinates fence and gate materials, infill direction, spacing and piers. The Current comparison uses slim charcoal bars.
- Open infill leaves views between its members; the separate hedge supplies the planting screen. The fence is a modeled design proposal, not a statement of planning approval.

Plans, the actual mesh, physical walking, sunlight and sightline analysis share the same boundary geometry and gate states. Analytical rays can pass through the real infill gaps; physical walking treats the fence as a continuous body barrier. Free exploration remains unrestricted. These controls are enabled for Sternicza without changing the other properties.

## Budget and verification scope

The new fence and both gates use **one separate installed quote**. Zero means unquoted and is excluded from the known subtotal. New gate supply and mechanisms are excluded from the basement package; any older combined quote should be reconciled once. Gate light fittings remain in landscape lighting. Basement lowering belongs to the basement construction quote, while technical-room fit-out and gym equipment belong to the house renovation package.

Paths use the actual union of the drawn route and dining polygons, including stone, joints and borders. The plunge surround is assigned to its spa installation. Updated counts cover route and gate light fixtures without charging the same work again as hedge supply or general bulk fill. Existing generic rates remain editable planning allowances.

Regression checks cover saved-tree migration, all styles and sunbed choices, route connectivity and obstacle clearance, consistent plunge levels, kitchen openings, basement equipment approaches with both cars present, gate passage, real fence gaps in rays, quote counting and other-property isolation. Browser acceptance captures the new garden by day and at blue hour, the plunge approach, coordinated closed gates, kitchen storage and both basement rooms through the public controls and actual WebGL scenes.

Fullscreen and the comfortable shared walking controller from 1.35–1.36 remain available throughout.
