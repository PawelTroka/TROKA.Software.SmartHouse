# Interior layout revision — 1.27.0

The revised furnishing plan follows the latest bathroom brief while retaining the archived plans as the existing-layout reference. The original room schedule and printed dimensions remain separate from reconstructed and proposed areas. The marked first-floor drawing originally requested both a whirlpool and a soaking tub; the latest brief supersedes that arrangement.

## Two distinct bathrooms

Dimensions below are actual model footprints, without reducing the fixtures to make the rooms appear more generous.

| Item | Ground bathroom — 11.22 m² | First-floor spa bathroom — 11.83 m² |
|---|---|---|
| Bath | One deep freestanding soaking tub, 1.78 × 0.88 m, 0.68 m high | One two-person hydrotherapy spa, 2.05 × 1.80 m, 0.86 m high; jets, lighting and water details |
| Shower | 1.30 × 1.36 m; west entry, plumbing on the north wall | 1.20 × 1.62 m; two rain heads, south entry |
| Vanity | Two basins on a 1.50 × 0.56 m vanity | One basin on a 1.10 × 0.56 m vanity |
| Toilet | 0.46 × 0.68 m | 0.46 × 0.64 m |
| Bidet | 0.42 × 0.66 m; low enough to sit below the street-window sill | None |
| Spa access | — | Removable two-level step, 0.70 × 0.40 m, 0.32 m high |

The ground vanity and mirror use the solid stair wall. The first-floor vanity and mirror occupy the solid side-wall section after the existing window. The toilets sit outside the street-window openings. The ground shower’s plumbing is on its solid north wall, leaving the side window readable behind the transparent wet-area enclosure.

The first-floor kitchen’s glazed stair partition is replaced with a solid bathroom privacy partition, retaining the entry near the street. The spa’s front equipment panel faces the room; the access step must be removable. Its 0.60 m front-service allowance is a study assumption, to be checked against the selected product and maintenance procedure. Filled loads on the documented timber floor, delivery, ventilation, waterproofing, drainage and equipment access remain design constraints.

## Sauna and circulation

The new sauna/bath partition moves about 0.36 m toward the street. This produces a clear sauna allowance of approximately 1.28 × 1.30 m (1.66 m²), with the spa bathroom reducing from about 12.31 to 11.83 m². A 1.20 × 1.24 m reference footprint fits inside that outline; finished lining, heater separation, ventilation and the exact cabin specification still require coordination.

The sauna door remains outward opening. Its hinge moves to the lower end of the opening so that its open leaf no longer blocks guest bedroom I. The room’s small bedside cabinet moves beside the bed’s headboard rather than standing across the narrow wardrobe aisle.

The geometric circulation checks carry a 0.60 m diameter disc from the landing to each proposed upper room and to each bathroom fixture’s approach point. They account for walls and jambs, open door leaves, retained flues, the stair void, cabinets and sanitaryware. The dining check also includes the chairs outside the tabletop footprint. Separate checks cover furniture intersections and door sweeps. This is a compact single-person circulation allowance; it does not establish accessible layouts, simultaneous use, final construction clearances or approval for a particular product.

## Furniture and window corrections

- The master bed has its headboard toward the street and faces the garden balcony. Its east-wall wardrobe opens into the room; bedside cabinets sit far enough toward the headboard to keep the door route open.
- The office desk faces the room and the chair faces the screen. The bookcase fronts the usable room area.
- Guest bedroom I keeps a single bed and a narrow hanging-storage bank. The two new front guest rooms retain actual single-bed dimensions; the low headboard in guest bedroom II stays below the side-window sill.
- The two front-bay wardrobe banks flank the entry partition. They provide about 2.00 m total cabinet width and leave both side windows and the large front window uncovered.
- The kitchen refrigerator and cabinet runs face the working aisle. The east run and refrigerator clear the retained west flue. The street sink has two basins below the window.
- The U-shaped living-room sofa opens toward the right-wall TV.

Furniture facing and bed-headboard direction are now explicit world-coordinate metadata. The plan symbols use the same footprint and rotation convention as the 3D furniture, so a wide drawn bed, vanity or desk no longer turns differently between views.

## One shared staircase per connection

The whole-house renderer assembles the cellar flight, main flight and attic ladder once, outside the individual floor groups. The interior room context uses those same stairs. A standalone floor view still displays its connecting stair.

The ground-plan main stair footprint is the canonical geometry on both occupied levels. The first-floor drawing's original stair-opening polygon remains unchanged and is retained separately as source evidence. Its different outline is explicitly flagged for a measured alignment and headroom check; the simulator does not silently move the archived opening to make the discrepancy disappear. Door leaves and navigation now use the same 90° open pose.

## Shared garage registration

The cellar plan can accept the exterior ramp’s registered architectural portal bounds. Its aperture, lining walls, car centres and retained-core conflict polygons all move together. The selected portal width is preserved; malformed or out-of-envelope bounds are rejected. This aligns the comparison geometry without concealing the existing stair and flue conflicts or claiming that the conversion is structurally resolved.

## Verification

`tests/interior-layout.test.mjs` covers the exact fixture brief, footprint intersections, door sweeps, 0.60 m routes, symbol orientation, preserved window openings and shared garage bounds. `tests/interior-plan.test.mjs` continues to preserve all original printed room schedules, apertures, core clearances, source attribution and upper-bay dimensions. The style renderer separately checks the physical bounds of its furniture variants.
