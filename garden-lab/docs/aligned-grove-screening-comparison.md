# PCK3-aligned pine grove and full-perimeter thujas

This document records the historical v1.13 `spa-aligned` arrangement. The current default is documented in [Rear-left corner screening comparison](rear-corner-screening-comparison.md).

The `spa-aligned` default follows the supplied reference's visible intent: three connected, overlapping crowns spread across PCK3's face. The previous close rear triangle left a broad part of the building exposed from the house. This arrangement moves the group forward and spreads its screen across the main sightlines while keeping the forward and centre trees close. It substantially improves the living-room view, but does not hide all of PCK3 from every position.

## Geometry

Coordinates use the existing site's local mapped metre frame. Increasing x goes left/east when looking from the house into the rear garden; increasing y goes away from the house. Mapped buildings, property orientation, terrain, observer coordinates and heights, and catalog tree dimensions are unchanged.

| Item | Selected geometry |
|---|---|
| Forward pine | (17.00, 26.80) m |
| Centre pine | (14.40, 28.40) m |
| Rear pine | (12.60, 32.70) m |
| All three pines | 9.50 m high; nominal 5.00 × 5.00 m crowns; clear stem 2.50 m |
| Forward ↔ centre trunks | 3.053 m |
| Centre ↔ rear trunks | 4.662 m |
| Forward ↔ rear trunks | 7.360 m |
| Pool water | (15.70, 19.50) m; 3.50 × 6.00 m |
| Far pool water edge | y = 25.50 m |
| Forward trunk beyond far water edge | 1.30 m |
| Forward trunk → outer pool coping | 1.020 m |
| Pool coping → mapped house | 1.231 m |
| Pool coping → terrace | 1.561 m |
| Pool coping → left boundary | 0.825 m |

The forward and centre nominal crowns overlap by about 1.95 m along their centre line; the centre crown overlaps the rear crown by about 0.34 m. They form a connected chain. The forward and rear crowns do not overlap directly. Their apparent overlap in an eye-level image is a separate projection effect; ellipsoid crowns can still leave a gap between their narrower lower parts.

All three complete modeled crowns fit inside the parcel. Trunk-centre clearances to the boundary are 3.304 m, 5.903 m and 5.309 m. Their nearest modeled hardscape gaps are 1.020 m to pool coping, 1.520 m to the fire-lounge footprint, and 1.380 m to that footprint respectively. Crowns overhang some hardscape. These are conceptual planting clearances, not confirmed nursery root-ball or fire-clearance specifications.

Every named observer is at least 1 m from each trunk. The closest is the fixed garden preset at (11.8, 32.1), exactly 1.00 m from the rear trunk; its screening result includes substantial trunk occlusion and applies only to that position. A preliminary candidate put that trunk only 0.35 m away and produced a misleadingly complete garden screen through the trunk. It was rejected after eye-level visual checks. The observer itself was not moved.

The six-person sauna, seven-seat jacuzzi, cold plunge, fire lounge and furniture retain their compact geometry. Thujas are 4 m on the full front, left, right and rear edges, excluding explicit pedestrian and vehicle openings. The front and front-side sections remain on their original ground; the rear-garden raise remains 0.5 m.

## Dense facade check and separate roof check

The source dataset has only 55 or 95 observer-facing PCK3 facade samples, compared with 365 roof samples. A combined percentage can therefore hide a visually significant wall opening. A preliminary design returned zero exposed coarse facade samples while an actual jacuzzi image showed a window-sized gap. The supplemental check now samples the entire wall at 0.25 m vertical intervals and at most 0.25 m horizontal intervals, using the same tree, hedge, terrain and building intersections. Back-facing and self-hidden wall points are excluded. Roof points remain separate.

The table compares the published v1.12 close-grove geometry and settings against the selected new default. Counts mean visible sample points, not square metres or a guarantee about actual foliage.

| Viewpoint | v1.12 dense facade visible / total | New dense facade visible / total | New facade samples hidden | New roof visible / 365 |
|---|---:|---:|---:|---:|
| Living room, seated | 1,868 / 5,214 | **49 / 5,214** | **99.06%** | **5** |
| Living room, standing | 1,980 / 5,214 | **63 / 5,214** | **98.79%** | **8** |
| Terrace | 1,318 / 5,214 | **0 / 5,214** | **100.00%** | **0** |
| Jacuzzi | 1,290 / 9,702 | **572 / 9,702** | **94.10%** | **4** |
| Named garden preset | 34 / 5,214 | **493 / 5,214** | **90.54%** | **115** |
| Sauna | 0 / 9,702 | **0 / 9,702** | **100.00%** | **0** |
| Sunken lounge | 78 / 5,214 | **1,339 / 5,214** | **74.32%** | **157** |

Some wall and roof areas remain visible from the living room and jacuzzi. The garden preset and sunken lounge remain more exposed, including a substantial roof area. Moving the three crowns forward improves the house screen at the expense of these rear viewpoints. The supplied reference establishes the intended appearance of one view; it does not establish complete screening at every fixed observer.

For reproducing the original source-sample metric, the new visible facade/roof counts are: seated living room 2/5, standing living room 2/8, terrace 0/0, jacuzzi 5/4, garden 9/115, sauna 0/0, and sunken lounge 17/157. The corresponding original combined totals are 7/420, 10/420, 0/420, 9/460, 124/420, 0/460, and 174/420. These combined values should not replace the dense wall result when assessing visible windows. All credited tree intersections are inside the mapped parcel.

## Spacing and pool decision

A 7 m pool at y = 19.5 m occupies the forward planting strip needed for the stronger house screen. Shortening it to 6 m releases that strip and leaves 1.02 m between the forward trunk and outer coping. The selected 3.05 m front-centre pair keeps substantial crown overlap without returning to the rear-only arrangement that exposed much of PCK3 from the house.

Bounded joint position checks found a tradeoff between the three main occupied views and the fixed garden observer once a real 1 m observer-to-trunk separation was enforced. A more house/jacuzzi-focused candidate at (17.3, 26.8), (14.2, 28.6), and (12.3, 33.1) left only 26, 24 and 69 dense facade samples exposed from seated living room, standing living room and jacuzzi, but exposed 1,344 of 5,214 from the garden. Its front-centre pair was also farther apart at 3.58 m. The selected layout retains a closer pair and better garden coverage. These bounded checks are not a proof that no better arrangement exists.

All historical tree arrays and pool geometries remain explicit choices. Existing saved designs retain their stored coordinates; no optimization or silent relocation runs on page load.

## Sunlight tradeoff

Shared solar model, June 21, Europe/Warsaw:

| Zone | 12:00 sunlit / sampled | 15:00 sunlit / sampled |
|---|---:|---:|
| Pool | 11 / 21 | 4 / 21 |
| Terrace | 31 / 32 | 32 / 32 |
| Jacuzzi | 4 / 4 | 4 / 4 |
| Garden | 178 / 315 | 161 / 315 |
| Sunken lounge | 0 / 9 | 9 / 9 |

The forward crowns shade much of the pool at 15:00. These are selected-time direct-sun samples, not a sunlight-hours study.

## Reproducible checks

`tests/aligned-screening.test.mjs` verifies the selected coordinates, preserved historical layouts, shared compact spa capacities, crown-chain connections, complete parcel containment, trunk-to-hardscape and observer clearances, seven original visibility breakdowns, seven dense facade results, inside-parcel screening credit, and selected noon/afternoon sunlight results. `tests/facade-visibility.test.mjs` independently preserves the rejected preliminary candidate as a regression for the gap that sparse samples missed. The source for the additional measurement is `src/facade-visibility.js`.
