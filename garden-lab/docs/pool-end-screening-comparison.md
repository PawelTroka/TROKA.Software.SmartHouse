# Pool-end pine screen and moved pool

Checked 13 November 2026. Reproduce with `node scripts/compare-pool-end-screening.mjs`. The complete machine-readable record is [pool-end-screening-comparison.json](pool-end-screening-comparison.json).

## Selected geometry

The new `spa-screened` proposal moves the pool 5.00 m toward the house and shortens its water length from 8.00 m to 7.00 m. Its width remains 3.50 m, so the water area changes from 28.00 m² to 24.50 m² (12.5% smaller). The full outer coping footprint is 4.06 × 7.56 m. Previous `spa-compact` designs keep the original pool and tree defaults.

| Feature | Local position / measurement |
|---|---|
| Pool water | x = 15.70 m, y = 19.50 m; 3.50 × 7.00 m |
| Pine 1 — rear inner | (13.00, 34.10) m |
| Pine 2 — nearest / pool end | (14.40, 25.70) m |
| Pine 3 — rear outer | (17.60, 34.90) m |
| Pool coping to mapped house footprint | 1.2313 m shortest horizontal gap |
| Pool coping to terrace edge | 1.5608 m lateral gap |
| Pool coping to left/east parcel edge | 0.8242 m shortest gap |
| Nearest pine trunk centre to coping | 1.0200 m |
| Nearest pine before far water end | 0.8000 m toward the house |

All three trees retain the same 9.50 m height, 5.00 × 5.00 m nominal crown and 2.50 m crown-base height. Their complete modeled crowns now fit inside the parcel. The outer tree moves 0.50 m inward and 0.40 m rearward compared with the v1.10 grove, removing its previous crown overhang. The nearest tree moves 5.30 m toward the house; the rear inner tree moves 0.30 m inward and 0.40 m toward the house.

This is a staggered group with two overlapping rear crowns and a forward screening crown beside the pool end. It is no longer a compact connected three-crown triangle: trunk distances are 8.52 m, 4.67 m and 9.74 m. The group spans 4.60 × 9.20 m between trunk centres. The forward crown overhangs part of the pool; maintenance and individual stock shape still need to be checked.

Every selected trunk has at least a 1 m illustrative clearance to the parcel, modeled ground obstacles, furniture and stepping stones. This is a concept-model allowance, not a measured nursery root-ball or construction requirement. The closest pine also clears the illustrated lounger footprint by approximately 1.024 m. The six-place sauna remains 3.00 × 2.40 m, and the sealed seven-seat jacuzzi remains 2.30 × 2.30 m.

## PCK3 screening from occupied places

The table reports the percentage of sampled PCK3 target points hidden by the complete model. It does not measure facade area or guarantee real foliage density. The previous and selected cases use the same 17 fixed-world observation positions; two additional paths are checked beside the moved pool.

| Viewpoint | Previous v1.10 hidden | New pool-end screen hidden | New visible / sampled |
|---|---:|---:|---:|
| Living room — seated | 51.9% | 90.2% | 41 / 420 |
| Living room — standing | 48.6% | 90.0% | 42 / 420 |
| Terrace — standing | 81.9% | 96.9% | 13 / 420 |
| Jacuzzi — seated | 90.0% | 92.0% | 37 / 460 |
| Garden preset — standing | 99.8% | 99.8% | 1 / 420 |
| Sauna — seated | 100.0% | 100.0% | 0 / 460 |
| Sunken lounge — seated | 94.3% | 94.5% | 23 / 420 |
| Left terrace — seated | 63.6% | 92.1% | 33 / 420 |
| Left terrace — standing | 65.5% | 98.3% | 7 / 420 |
| Right terrace — standing | 89.5% | 89.3% | 45 / 420 |
| Loungers — seated | 82.9% | 97.9% | 9 / 420 |
| Dining — seated | 77.4% | 78.0% | 101 / 460 |
| Right garden path | 65.2% | 64.6% | 163 / 460 |
| Former pool-side path | 98.6% | 95.0% | 21 / 420 |
| Rear-left garden path | 100.0% | 93.8% | 26 / 420 |
| Rear-centre path | 87.8% | 87.8% | 56 / 460 |
| Cold plunge — seated | 97.2% | 97.2% | 13 / 460 |
| New pool west-side path | — | 59.8% | 169 / 420 |
| New pool far-end path | — | 76.4% | 99 / 420 |

The principal living-room, terrace, jacuzzi and garden presets improve or hold their previous coverage. Remaining exposure is significant on parts of the paths: the new pool-side path hides 59.8% of sampled PCK3 points, the right garden path 64.6%, and the new far-end path 76.4%. The design therefore gives strong coverage from the main seated areas, without claiming near-total concealment everywhere.

## Why the pine sits beside the far end

A crown directly behind the far end remains too far from the raised living-room observer to intercept as much of the high PCK3 target. The selected trunk sits alongside the far corner, 0.80 m before the water end. This is the user-requested “at the end, or slightly closer” placement, while keeping a 1.02 m soil gap to coping.

| Arrangement on moved 7 m pool | Seated living visible | Standing living visible | Jacuzzi visible | Garden visible | Sunken lounge visible |
|---|---:|---:|---:|---:|
| Moved 7 m pool and front hedge; previous pine positions | 202 / 420 | 216 / 420 | 46 / 460 | 1 / 420 | 24 / 420 |
| Move nearest pine only; two rear pines unchanged | 41 / 420 | 45 / 420 | 64 / 460 | 1 / 420 | 24 / 420 |
| Closest pine directly beyond far end | 81 / 420 | 91 / 420 | 60 / 460 | 1 / 420 | 24 / 420 |
| Historical balanced trees on moved pool | 41 / 420 | 44 / 420 | 43 / 460 | 2 / 420 | 17 / 420 |
| Selected pool-end screen | 41 / 420 | 42 / 420 | 37 / 460 | 1 / 420 | 23 / 420 |

The pool-and-front-only control retains exactly the previous 17 PCK3 visibility counts. The rear screening improvement comes from moving the pines. Adjusting the rear pair keeps the named garden view while improving the jacuzzi compared with moving only the closest pine. Every listed count is recomputed with the shared full visibility engine; all selected tree intersections occur inside the parcel.

## Sunlight tradeoff

Pool receiver counts change with its area; compare percentages as well as raw counts. Times are Warsaw civil time on 21 June. These are direct-sun geometry samples, without cloud or weather assumptions.

| Zone / time | Previous layout sunlit | New layout sunlit |
|---|---:|---:|
| Pool at 09:00 | 0/27 (0.0%) | 0/24 (0.0%) |
| Terrace at 09:00 | 23/32 (71.9%) | 23/32 (71.9%) |
| Pool at 12:00 | 11/27 (40.7%) | 16/24 (66.7%) |
| Terrace at 12:00 | 32/32 (100.0%) | 25/32 (78.1%) |
| Pool at 15:00 | 1/27 (3.7%) | 8/24 (33.3%) |
| Terrace at 15:00 | 32/32 (100.0%) | 32/32 (100.0%) |

The forward pine adds terrace shade: at noon on 21 September the terrace changes from 29/32 to 10/32 sunlit sample points. At noon on 21 June it changes from 32/32 to 25/32. The moved pool gains direct sunlight at the checked midday and afternoon times; at 15:00 on 21 June it rises from 1/27 to 8/24 sunlit points.

## Prices and saved designs

The three pine plants still total 179,700 PLN at the existing published 59,900 PLN reference price per tree; transport, crane work, planting and establishment remain separately budgeted. A smaller water footprint does not establish a proportional installed-pool saving, so the 150,000–230,000 PLN planning allowance remains until a contractor prices this exact layout. Surface and earthwork quantities use the revised geometry.

The new default uses the separate `spa-screened` program. Historical `spa-compact`, `spa-edge`, `spa` and classic coordinates remain unchanged, and old saved designs retain their prior pool and tree geometry. The front hedge is a separate modeled screen with explicit proposed access openings; it receives no credit for the rear PCK3 gains reported here.
