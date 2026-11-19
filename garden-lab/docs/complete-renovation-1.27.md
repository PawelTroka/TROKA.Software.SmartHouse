# Garden Lab 1.27 — coordinated house renovations

## What changes for the user

One whole-house style now controls the dwelling, its furniture and fittings, the facade and the garden presentation. **Current house · no renovation** selects the archived original room layout and removes the proposed house finish. Choosing any of the 20 styles selects the user's renovation programme and changes physical furniture forms, fitted joinery, feature walls, ceiling details, lighting, surface textures and outdoor furnishings.

The same style is selected in the garden controls and the interior studio. The original/renovation buttons follow that choice: Original drawings selects Current; Your renovation selects Hidden Bali when no renovation style is active. Save A/B, links, reloads and exports retain the canonical whole-house choice. Older designs with a separate interior style migrate that choice to the whole house.

The first adoption of a renovation installs the marked 10.77 m wide, 4 m deep terrace and shared upper balcony. Deck dimensions remain editable and survive switches between renovation styles. **Restore marked 4 m decks** restores those dimensions in both views. The basement garage remains an explicit, independent engineering study; selecting an interior style does not silently excavate the cellar.

The renovated room divisions and the requested bathroom programme remain consistent across styles. Style changes alter the furnishings and the physical finish renovation within those measured spaces; they do not invent additional floor area or change the structural scheme to make furniture appear to fit.

## Physical style collection

These signatures come from the pure [interior recipes](../src/interior-style-recipes.js) and [exterior recipes](../src/exterior-recipes.js). They are rendered geometry and procedural surfaces. Colour is one part of each choice.

| Style | Furniture and fitted joinery | Interior architecture and surfaces | Exterior signature |
|---|---|---|---|
| Organic Modern | Sculpted pebble seating bases, boulder tables, curved headboards, fluted cabinetry | Travertine feature panels; recessed lighting; wide boards, travertine and boucle | Limewash, mineral base, standing-seam roof, travertine paving, oval dining and clear glass guard |
| Hidden Bali | Open woven seating, cane chairs and cabinet fronts, teak tables, double canopy beds | Timber feature screens and ceiling battens; basket pendants; dark boards and riverstone | Sand render, teak upper cladding and piers, slate roof, resort banquette, vertical timber guard |
| Mediterranean Villa | Built-in plaster seating, iron chairs and bed frames, farmhouse tables, framed cabinets | Arched decorative surrounds, exposed beams, lanterns, terracotta and zellige | Limewash/mineral base, terracotta roof and paving, round dining, steel-picket guard |
| Modern Minimal | Sled seating, cantilever chairs, waterfall tables, floating beds, handleless joinery | Large wall panels, recessed linear light, microcement and large wet-room slabs | Smooth panelled facade, standing-seam roof, porcelain paving, long dining and glass guard |
| Scandinavian | Open slatted seating, spindle chairs, tapered tables, slatted beds and framed cabinetry | Half-height boarding, broad rafters, bell pendants, pale boards and linen | Weatherboard upper storey and piers, ash decking, standing-seam roof, vertical timber guard |
| Japandi | Low timber platforms, spindle chairs, slab tables, shoji cabinet and door panels | Shoji feature walls, paired ceiling battens, paper lanterns, boards and honed stone | Sand render, walnut piers, slate roof, limestone paving, low banquette and timber guard |
| Organic Scandinavian | Curved runner sofas, bentwood chairs, oval trestle tables, curved beds, ribbed cabinetry | Ribbed walls, rafters, saucer lights, herringbone, terrazzo and boucle | Limewash/ash upper finish, ash decking, oval dining and horizontal timber guard |
| Organic Japandi | Low pebble seating, curved chairs, boulder tables, wide platform beds, slatted cabinets | Widely spaced timber screens, paired battens, oval lanterns, clay and honed stone | Clay render, walnut piers, slate roof, travertine, oval dining and timber guard |
| Space Age | Moulded pod seating, tulip pedestal chairs/tables, capsule beds and rounded cabinets | Porthole feature panels, suspended light rings, globe pendants, resin and terrazzo | Smooth facade panels, zinc roof, terrazzo, round dining and clear glass guard |
| Party Club | Channel cushions and headboards, upholstered chairs, chrome tables, glossy cabinetry | Upholstered wall channels, luminous coves, clustered lamps, dark parquet, marble and velvet | Charred-wood upper finish and piers, basalt paving, club banquette and glass guard |
| Baltic Dune | Canvas sling chairs, open timber sofas, trestle tables, woven headboards, slatted storage | Weatherboards, exposed beams, bell lights, weathered boards and riverstone | Sand render and silvered wood, zinc roof, long dining and horizontal timber guard |
| Gdańsk Brick | Leather cushions on metal frames, steel chairs, oak trestles, mission beds, framed cabinets | Clinker walls, steel ceiling channels, lanterns, herringbone and leather | Clinker masonry piers and paving, terracotta roof, long dining and steel-picket guard |
| Danish Midcentury | Tapered teak frames, wishbone chairs, oval tables, raised beds, sliding-panel cabinetry | Teak feature panels, recessed edges, saucer pendants, herringbone and terrazzo | Limewash and teak upper finish, limestone paving, oval dining and vertical timber guard |
| Finnish Sauna | Bench sofas, slatted chairs/tables, low board beds, ventilated storage fronts | Sauna-board walls and ceiling battens, tube pendants, narrow boards and slate | Charred facade with cedar, standing-seam roof, cedar decking, low banquette and timber guard |
| Riviera Deco | Scalloped chairs, stepped stone tables and sofa bases, fan headboards, brass-inlaid cabinets | Stepped wall mouldings and ceiling edges, tiered lights, parquet inlay, marble and velvet | Smooth decorative panels, zinc roof, terrazzo, club banquette and geometric metal guard |
| Arts and Crafts | Mission oak frames, cross-braced tables, framed cabinets and visible bed rails | Wainscoting, coffered ceilings, lanterns, boards and patterned encaustic tiles | Sand render, oak piers, slate roof, clinker paving, long dining and timber guard |
| Palm Springs | Low sling seating, wire chairs, pedestal tables, cane beds, slatted cabinetry | Breeze-block relief, ceiling slats, globe lights, terrazzo and mosaic | Smooth panels, standing-seam roof, terrazzo, round dining and geometric metal guard |
| Desert Modern | Block seating, monolithic tables, deep plinth beds, flush joinery | Layered earth feature walls, recessed light, clay pendants and sandstone surfaces | Clay render/mineral base, zinc roof, sandstone paving, low banquette and glass guard |
| Alpine Lodge | Cross-braced sofas, chairs, tables and beds, substantial framed timber storage | Broad timber linings, exposed beams, lanterns, wide boards, slate and wool | Sand render and cedar upper cladding/piers, slate roof, cedar decking and timber guard |
| Industrial Loft | Steel/leather seating, steel chairs/beds/cabinets, workshop tables | Concrete panels, exposed ceiling girders, cage lights, concrete and slab floors | Board-formed concrete panels/paving, standing-seam roof, reclaimed timber, long dining and steel-picket guard |

Furniture proportions stay tied to the metric footprint. For example, a Bali double bed receives a canopy, but a compact single or a bed under a low window uses a lower woven headboard. Material maps include board joints and grain, herringbone/parquet, tile patterns, stone veins, terrazzo chips and textile texture. Roughness and bump vary with the material. The maps are bounded procedural assets, so switching style does not download large texture collections.

Feature wall treatment is confined to full-height solid wall segments selected from the same window/door geometry used to build the house. Decorative arches, screens and relief do not erase a window or declare a new structural opening. The shared balcony guard recipe supplies the same glass, timber or metal treatment inside and outside; ornamental infill does not gain analytical privacy credit.

## Revised bathrooms

The latest request supersedes the earlier two-tub upstairs markup. The ground bathroom model is approximately **11.22 m²**; the upper spa bathroom is approximately **11.83 m²**. These are reconstructed polygon areas, separate from printed drawing areas.

| Fixture | Ground floor | First floor |
|---|---|---|
| Bath | One freestanding deep soaking tub, **1.78 × 0.88 m**, **0.68 m** high | One two-person hydrotherapy spa, **2.05 × 1.80 m**, **0.86 m** high; no second tub |
| Shower | **1.30 × 1.36 m**; west entry; plumbing on the solid north wall | **1.20 × 1.62 m**; two shower heads |
| Vanity | **1.50 × 0.56 m**, two bowls, on the solid stair wall | **1.10 × 0.56 m**, one bowl, on the solid side-wall bay |
| WC | **0.46 × 0.68 m** | **0.46 × 0.64 m** |
| Bidet | **0.42 × 0.66 m**, **0.44 m** high, below the street-window sill | None |
| Accessory | Wide mirror and towel rail | Mirror, towel rail and removable **0.70 × 0.40 m**, **0.32 m** two-level spa step |

The spa model has an open bathing well, reclined seats, headrests, visible jet nozzles, water, submerged light strips, bubble details and a control pad. It represents the intended equipment class, not a manufacturer's shell, plumbing or structural load calculation. Its front access needs a removable step and a **0.60 m** service zone.

The new sauna partition moves 0.36 m into the bathroom, producing approximately **1.28 × 1.30 m** clear, or **1.66 m²**. A 1.20 × 1.24 m reference cabin footprint fits this allowance. Lining, heater separation, ventilation, electrical and service requirements still depend on the selected installation. The sauna door opens outward; its hinge was moved to clear the adjacent guest-room route. The renovated bathroom closes the old stair-side kitchen glazing for privacy.

## Placement and circulation corrections

Bed headboards, furniture fronts, appliance handles and shower plumbing now use explicit cardinal directions. The SVG plan and Three.js renderer agree on those directions while preserving the same world-space footprint. Open door leaves display at 90°, matching the plan and the circulation model.

- The master bed faces the balcony. Its wardrobe opens into the room; bedside tables leave the route past the wardrobe clear.
- Guest bedrooms II and III use compact single beds. Bedroom II's rendered headboard, including curved tops and rod radii, is limited to 0.72 m beneath the 0.80 m window sill.
- Wardrobe banks flank the bay entrance on its north wall instead of blocking the two side windows. The front bay window also remains clear.
- The office chair faces its workstation; desk, bookcase, refrigerator, counters, basins and WCs face the intended working space.
- The ground shower entrance faces the central bathroom route, while its plumbing uses the north wall instead of crossing the side window. Bathroom mirrors are on solid wall segments.
- A conservative 0.60 m diameter walking disc can reach every proposed upstairs room and the individual bathroom fixture approaches. The test includes furniture, dining chairs beyond the table top, wall ends, open leaves, stair voids and retained flues.

This circulation check establishes modeled routes; it is not an accessibility or building-regulation approval. The two new front guest rooms remain small: approximately **7.39 m²** and **6.36 m²**. The attic ladder deployment still needs checking in the revised hall.

## One building, two viewpoints

The exterior now assembles the same four floor plans, wall apertures, furniture and floor levels used by the interior renderer. The room viewer borrows the actual garden and surrounding site geometry rather than an illustrative outdoor backdrop. The terrace, balcony and three upper garden doors belong to this shared model. Editing balcony width or depth, or an upper-floor level, updates both views and the exported floor plans.

The architectural frame retains the drawing's **10.77 × 9.00 m** main block without scaling. It is registered to the midpoint and direction of the surveyed street wall. The source survey footprint remains attached for comparison. The projecting bay, floor elevations and roof are derived from the architectural model; they are not forced to agree by stretching the photographed plans.

This is a drawing reconstruction. The supplied archive may predate later changes visible in photographs. Printed room areas, reconstructed room polygons and site registration remain distinct evidence. An as-built survey is still needed to resolve exact external registration, altered openings, wall construction, stair geometry and current condition.

The original section shows approximately **1.70 m clear cellar height**. The optional two-car study uses the same lowered floor, ramp, portal and registered vehicle positions in both views. Retained stair and flue conflicts remain displayed; changing a style does not resolve them. Excavation, underpinning, drainage, waterproofing and ramp feasibility need project-specific design.

Likewise, broad garden glazing, removed partitions, the large balcony, spa loading and the existing timber floor structure need structural verification. Material appearances and decorative detailing are design proposals; they do not certify load capacity or authorize demolition.

## Cost and validation scope

The garden estimate does not silently price the new interiors. Furniture, fitted joinery, bathroom equipment, partition work, structural interventions, services and installation require separate quotations. The facade/garden style upgrade remains a separate installed quote; a visual choice is not a contractor price.

Automated coverage added for this release includes geometry-only style signatures with identical material colours, measured furniture bounds and low-headboard clearance, actual dual basin geometry, independent shower entrance/plumbing directions, aperture-safe feature walls, full-building visibility and shared exterior skin. Internal stair geometry can be suppressed independently when the shared context supplies the canonical flight. Layout tests cover the bathroom brief, non-overlapping furniture, access routes, window clearance and registered garage conflicts. Shared-model tests cover registration, floor levels, roof geometry and exterior apertures.

A no-GPU unit test exercises Three.js's actual context-refusal branch and checks that the interior viewer reports its unavailable state without replacing the existing plan host. This verifies the failure contract; it does not claim a browser has rendered the fallback successfully.

**Browser and deployment validation: pending final release run.** The updated browser harness checks all 21 choices, rendered triangle/feature differences, original-state restoration, both floor/layout programmes, actual site context, bathroom exports, automatic and edited balcony synchronization, Save A/B, share/reload, idle rendering and 390 px controls. Final CI counts, screenshots and deployment verification should be filled in after that run; this document does not claim those checks have already passed.
