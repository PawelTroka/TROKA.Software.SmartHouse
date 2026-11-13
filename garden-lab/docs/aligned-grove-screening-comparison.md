# PCK3-aligned pine grove and full-perimeter thujas

The new `spa-aligned` default follows the supplied reference's visible intent: three connected, overlapping crowns spread across PCK3's face. The rear-only close triangle left a large part of the building exposed. This arrangement moves the group forward and fans it across the main sightlines while keeping the forward and centre trees close.

## Geometry

Coordinates use the existing site's local mapped metre frame. Increasing x goes left/east when looking from the house into the rear garden; increasing y goes away from the house. The mapped buildings, property orientation, terrain, observer heights and purchased tree dimensions are unchanged.

| Item | New geometry |
|---|---|
| Forward pine | (17.50, 26.80) m |
| Centre pine | (14.85, 28.40) m |
| Rear pine | (12.05, 32.35) m |
| All three pines | 9.50 m high; nominal 5.00 × 5.00 m crowns; clear stem 2.50 m |
| Forward ↔ centre trunks | 3.096 m |
| Centre ↔ rear trunks | 4.842 m |
| Forward ↔ rear trunks | 7.778 m |
| Pool water | (15.70, 19.50) m; 3.50 × 6.00 m |
| Far pool water edge | y = 25.50 m |
| Forward trunk beyond far water edge | 1.30 m |
| Forward trunk → outer pool coping | 1.020 m |
| Pool coping → mapped house | 1.231 m |
| Pool coping → terrace | 1.561 m |
| Pool coping → left boundary | 0.825 m |

The forward and centre nominal crowns overlap by about 1.90 m along their centre line; the centre crown overlaps the rear crown by about 0.16 m. The crowns form a connected chain. The forward and rear crowns do not overlap directly. Their apparent overlap in a particular eye-level view is a separate projection effect.

All three complete modeled crowns fit inside the parcel. Trunk-centre clearances to the parcel are 2.804 m, 5.453 m and 5.668 m. Their nearest modeled hardscape gaps are 1.020 m to pool coping, 1.970 m to the fire-lounge footprint, and 1.030 m to that footprint respectively. Crowns overhang some hardscape; these are conceptual planting clearances, not confirmed nursery root-ball or fire-clearance specifications.

The six-person sauna, seven-seat jacuzzi, cold plunge, fire lounge and furniture retain their compact geometry. Thujas are 4 m on the full front, left, right and rear edges, excluding the explicit pedestrian and vehicle openings. The front and front-side sections remain on their original ground; the rear-garden raise remains 0.5 m.

## Main views: facade and roof counted separately

The visibility engine samples roofs much more densely than facades. A single combined percentage can therefore conceal a visually significant exposed facade. The new design is checked against both surface types, not just the overall percentage.

| Viewpoint | Previous v1.12: visible / total | New: facade visible / sampled | New: roof visible / sampled | New: total hidden |
|---|---:|---:|---:|---:|
| Living room, seated | 248 / 420 | **0 / 55** | **7 / 365** | 98.33% |
| Living room, standing | 253 / 420 | **0 / 55** | **12 / 365** | 97.14% |
| Terrace | 111 / 420 | **0 / 55** | **0 / 365** | 100.00% |
| Jacuzzi | 69 / 460 | **0 / 95** | **0 / 365** | 100.00% |
| Named garden preset | 1 / 420 | **0 / 55** | **0 / 365** | 100.00% |
| Sauna | 0 / 460 | **0 / 95** | **0 / 365** | 100.00% |
| Sunken lounge | 23 / 420 | **17 / 55** | **183 / 365** | 52.38% |

The living-room result leaves roof samples visible, consistent with a remaining roof strip rather than the previous broad exposed facade. These are finite model samples, not facade-area percentages or guarantees about actual branches. All new tree-screening intersections used in these checks occur inside the mapped parcel.

**The sunken lounge remains materially exposed.** The three trees do not provide the same coverage from every position. Replacing the rear pine with a pine at (16.5, 31.5), (16.8, 31.9) or (17.3, 32.5) was checked with the same two forward trees. Those alternatives exposed 339–363 of 420 lounge samples and also worsened jacuzzi and garden screening, so they were not selected.

## Close-pair and pool alternatives

The previous 7 m pool prevents the most useful forward crown position. With a 7 m pool at y = 19.5 m, a pair exactly 2 m apart at (16.8, 27.8) and (14.88, 28.36), plus the rear pine at (12.05, 32.35), leaves seven facade samples visible from each living-room preset. A 2.48 m pair improves total roof screening slightly but still leaves six or seven facade samples visible. Shortening the pool to 6 m releases the soil needed to bring the forward crown closer to the house and farther across PCK3's exposed edge.

The selected 3.10 m pair keeps substantial crown overlap while removing all sampled facade exposure from the two living-room presets, jacuzzi and named garden position. The 2 m rear-grove layout and all older pool geometries remain explicit historical choices; no existing saved design is silently relocated.

## Sunlight tradeoff

Shared solar model, June 21, Europe/Warsaw:

| Zone | 12:00 sunlit / sampled | 15:00 sunlit / sampled |
|---|---:|---:|
| Pool | 7 / 21 | 5 / 21 |
| Terrace | 31 / 32 | 32 / 32 |
| Jacuzzi | 4 / 4 | 4 / 4 |
| Garden | 180 / 315 | 164 / 315 |
| Sunken lounge | 0 / 9 | 8 / 9 |

The more forward crowns add pool shade. These are selected-time direct-sun samples, not a sunlight-hours study.

## Reproducible checks

`tests/aligned-screening.test.mjs` verifies the selected geometry, preserved historical layouts, shared compact spa capacities, crown-chain connections, complete parcel containment, trunk and coping clearances, seven main viewpoints with facade and roof breakdowns, inside-parcel screening credit, and the selected noon/afternoon sunlight results. No optimization runs on page load.
