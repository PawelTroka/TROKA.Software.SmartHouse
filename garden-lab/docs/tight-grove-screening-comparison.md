# Close pine grove — v1.12 default

The nearest pine now sits **2.00 m from the centre pine**, following the requested close grouping. Three 9.5 m Austrian pines use the unchanged nominal 5 m crowns. This is the `spa-grove` programme; the previous `spa-screened` programme and its tree positions remain available for saved designs and comparison.

## Geometry

Coordinates are the site's local mapped metres. Increasing y runs away from the house; the left side when looking into the garden is the east side of the plan.

| Object | Position or size |
|---|---|
| Centre pine | (13.0, 34.1) m |
| Nearest pine | (14.2, 32.5) m |
| Outer pine | (17.6, 34.9) m |
| Pool water | (15.7, 24.5) m; 3.5 × 7.0 m |
| Far water edge | y = 31.5 m |
| Nearest trunk beyond far water edge | 1.00 m |
| Nearest trunk to coping | 1.42 m |
| Nearest trunk to fire-lounge footprint | 1.77 m |

The trunk spacings are **2.00 m**, 4.67 m and 4.16 m. Every nominal crown pair overlaps. The trunk envelope is 4.6 × 2.4 m and the nominal crown envelope is 9.6 × 7.4 m. All three crowns fit inside the mapped parcel. Each trunk retains more than 1 m to the modeled fixed hardscape. The nearest crown overhangs hardscape.

The shortened pool returns to y = 24.5 m, 5 m farther from the house than the v1.11 pool. Its coping has approximately 6.20 m to the mapped house, 2.54 m to the terrace and 0.82 m to the left boundary. The compact sauna, seven-seat jacuzzi, plunge, fire lounge and furniture remain unchanged. The 4 m front hedge remains enabled, with the existing access openings.

These are conceptual geometry checks. A nursery must confirm whether the actual root balls and future growth permit 2 m trunk centres. Nominal crown overlap does not guarantee continuous foliage.

## PCK3 coverage

The shared visibility engine samples PCK3 (`building-9`) using the same seven main presets in each layout. Hedges are 4 m, garden raise is 0.5 m and terrace depth is 4.2 m. This close grouping leaves substantially more of PCK3 visible from the living room than the earlier forward-tree arrangement; the default prioritises the requested placement and reports that tradeoff.

| Viewpoint | v1.11 spaced layout: hidden | Close grove: hidden | Close grove: visible / total |
|---|---:|---:|---:|
| Living room seated | 90.24% | 40.95% | 248 / 420 |
| Living room standing | 90.00% | 39.76% | 253 / 420 |
| Terrace | 96.90% | 73.57% | 111 / 420 |
| Jacuzzi | 91.96% | 85.00% | 69 / 460 |
| Named garden preset | 99.76% | 99.76% | 1 / 420 |
| Sauna | 100.00% | 100.00% | 0 / 460 |
| Fire lounge | 94.52% | 94.52% | 23 / 420 |

These percentages describe the model's target samples at fixed viewpoints, not guaranteed real-world concealment. The tests also confirm that the close grove's screening credit comes from crown intersections inside the parcel.

## Sunlight

June 21 at 12:00, Europe/Warsaw, using the shared solar and shadow model:

| Zone | v1.11 spaced layout: sunlit samples | Close grove: sunlit samples |
|---|---:|---:|
| Pool | 16 / 24 | 14 / 24 |
| Terrace | 25 / 32 | 32 / 32 |
| Jacuzzi | 4 / 4 | 4 / 4 |
| Garden | 163 / 312 | 186 / 312 |

A 7 m pool at y = 25.5 m and an 8 m pool at y = 24.5 m were also checked with the exact same close grove. They gave the same seven PCK3 results but less noon pool sunlight (11/24 and 13/27 samples). Both reduced the outer trunk-to-coping distance to 2.12 m and placed its nominal crown over the coping. The selected 7 m pool at y = 24.5 m leaves 3.12 m there.

`tests/tight-grove-screening.test.mjs` verifies the default and preserved old geometry, the 2.00 m spacing, crown connections, parcel and hardscape clearances, seven viewpoint counts and selected noon sunlight results. No new optimisation is applied on page load.
