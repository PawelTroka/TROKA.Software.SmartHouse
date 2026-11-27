# Interactive living, fitted guest rooms and the close grove · 1.38

The model now includes independent opening controls, side-sliding spa covers, a more complete basement gym, and revised guest/office furniture. The latest requested arrangement keeps the kitchen window clear and restores the compact rear-left tree group.

## Using the new controls

Open **Doors, gates & covers** beside the main viewer. This panel remains available in fullscreen and during a walk.

| Control | Starting state | Effect |
| --- | --- | --- |
| Pedestrian gate | Closed | Opens only the pedestrian entrance |
| Garage gate | Closed | Opens only the garage-ramp entrance |
| Terrace doors | Open | Three leaves; two stack onto the left leaf, leaving up to two-thirds clear |
| Upper terrace doors | Open | Moves the three rear upstairs door sets together, independently of the ground floor |
| Cover the jacuzzi | Off | Two telescoping panels slide from the side over the terrace spa |
| Cover the cold plunge | Off | A separate pair slides over the recessed garden plunge |
| Two workstations | On | Places two computers and chairs at the long office desk |
| Unfold the guest bed | Off | Converts the office daybed into an emergency single bed |
| Park the gym bench | On | Parks the wheeled bench beside the wall; switch off for its strength-station position |

The interior inspector also exposes the relevant floor's doors and office/gym options. Changes persist in saved designs, shared links and exports. The gates and fence retain the selected renovation finish. The standard free-exploration controls and fullscreen handoff remain available.

## Kitchen and stairs

The cupboard crossing above the sink window has been removed. The cooking-run/pantry junction now contains fitted corner storage, with the worktop and overhead cabinets terminating against that return. The connected right-hand peninsula and widened refrigerator-side entrance remain.

Renovation styles conceal each retained chimney core behind a separate wall-finish skin. The core remains present in the model and collision geometry. The original-drawing comparison retains its original materials.

Exposed floor-opening edges receive 1.10 m timber guards, coordinated with the selected interior finish. Stair entry and arrival openings remain open. Both sides of the internal flights have railings; guards beneath a rising flight follow its soffit instead of passing through a tread.

## Garden arrangement and levels

The current pool is **3.20 × 6.50 m**, with its near-left mapped corner at **(15.50, 24.50)**. Its long edge follows the left/east side when looking from the house into the garden. Sunbeds remain parallel to their adjacent pool edges.

The default Austrian-pine group returns to the earlier close-grove arrangement:

| Trunk | Local x | Local y |
| --- | ---: | ---: |
| Rear inner | 13.00 m | 34.10 m |
| Nearest | 14.20 m | 32.50 m |
| Rear outer | 17.60 m | 34.90 m |

The nearest and rear-inner trunks are exactly **2.00 m apart**. These are restored design coordinates from the earlier v1.12 proposal, not a new survey. Specimen size assumptions remain 9.5 m height and 5 m crown width/depth.

The cold plunge's rim now meets the original garden-facing approach level. The previous treatment selected the highest nearby grade, which raised the approach by roughly 24 cm. The new treatment cuts and blends the uphill ground into the basin instead. The rim has no 2 cm upstand; water is 8 cm below it and the modeled water depth remains 1.10 m.

Both spa covers park beside their basin in compact telescoping bays. The adjacent terrace furniture leaves the jacuzzi bay clear. Their visible panels, supporting surfaces and sunlight occluders share the same bounds. A moving cover updates the support under a stationary walker using the existing smooth elevation transition. Reduced-motion mode shows the requested end position immediately.

The central fire lounge, warm destination-path lighting and technical/laundry room remain. The garden contains no outdoor kitchen.

## Guest rooms and office

Each of the three guest rooms contains a **1.40 × 2.00 m mattress**, a compact work desk, a wall-mounted articulated TV aimed toward the bed, and under-bed storage. Bed frames reserve **1.48 × 2.10 m**. The two shallow front rooms use access from the foot of the bed; they do not offer side aisles around the mattress. The short room captions make this constraint visible in the interior viewer.

The office uses a **2.60 × 0.70 m desk**, with one or two computer stations. A separate daybed unfolds into a **0.90 × 2.00 m single sleeping place**. Both arrangements use the same room envelope and remain configurable rather than changing with each finish style.

## Premium compact gym

The fit-out uses the existing **3.87 × 4.40 m room (17.03 m²)** and the proposed **2.30 m clear headroom**. It preserves the technical/laundry room, both garage spaces, and the 0.90 m room openings.

Equipment geometry uses the following manufacturer references, checked on 27 November 2026. The model reserves rounded envelopes slightly larger than the products; it is a furniture and circulation study rather than a manufacturer installation drawing.

| Modeled item | Reference dimensions | Reserved model envelope |
| --- | --- | --- |
| Short wall-mounted cable strength station | REP Ares 2.0 80-inch base: 57.6 in wide; 33 in to front of trolley; 82.1 in total height | 1.50 × 0.88 m, 2.10 m high |
| Wheeled adjustable bench | REP Nighthawk: 25.9 × 51 in; 16.7 in high | 0.70 × 1.34 m |
| Adjustable dumbbells on stand | REP × PÉPIN-compatible stand: 31 × 22.3 in | 0.80 × 0.58 m, rotated beside the wall |
| Premium smart training bike | Wahoo KICKR BIKE PRO: 153 × 76 × 117 cm | 1.56 × 0.80 m, 1.22 m high |

The room also has a training display, full-length mirror, accessory storage and shared mobility/cable-work floor. The bench moves between a wall parking position and the station. This is a one-active-user compact layout. The 2.30 m ceiling does not establish clearance for pull-ups or standing overhead lifting; those movements are not represented as usable activities.

Primary references:

- [REP Ares 2.0 wall-mounted base specifications](https://repfitness.com/products/ares-2-0-wall-mounted-builder)
- [REP Nighthawk adjustable bench specifications](https://repfitness.com/products/rep-nighthawk-adjustable-bench)
- [REP adjustable dumbbell stand specifications](https://repfitness.com/products/rep-adjustable-dumbbell-stand)
- [Wahoo KICKR BIKE PRO specifications](https://eu.wahoofitness.com/devices/indoor-cycling/smart-bikes/kickr-bike-pro-buy)

No equipment was ordered and no product price is included in the garden budget.

## Saved-design compatibility

Schema **34** starts with closed gates and the restored close-grove proposal. An active older saved session adopts the new rearward pool and closed gate defaults once. Only a complete recognized automatic v1.36/v1.37 pine triplet is eligible for restoration; specimen identities, dimensions, prices and other attributes remain unchanged. A manual coordinate edit prevents automatic tree replacement.

Archived comparisons and old shared links retain their stored tree and gate choices. The internal `rearCornerPool` compatibility flag preserves the previous 1.37 pool position for those designs. Opening the current site without an old comparison hash loads the active saved session and applies the one-time update. Fresh defaults use the new arrangement.

## Verification scope

Automated checks exercise state migrations, independent controls, shared opening geometry, physical and free navigation, cover motion bounds and support heights, sunlight blockers, room circulation, furniture facing, mattress dimensions, and retained structural cores. The browser checks use public controls and exports and capture the real WebGL garden, kitchen, stair landing, chimney, guest rooms, office and gym for visual review. Geometry checks cannot establish as-built measurements, structural capacity or a device-specific frame rate.
