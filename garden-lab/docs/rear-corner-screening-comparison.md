# Rear-left corner grove: placement first, measured PCK3 screening

The v1.14 `spa-corner` default keeps **every pine trunk in the rear-left/east part of the plot**. There is no separate forward tree in the central garden. The close pair is 2.50 m apart; the third tree is part of the same overlapping group. The 6 × 3.5 m pool and all spa features retain their v1.13 geometry. Four-metre thujas still follow the full front, left, right and rear edges, with the defined access openings.

The default explicitly assumes specimens at the upper end of the existing supplier band: **10 m total height and 6 m crown diameter**, instead of its 9.5 m / 5 m midpoint. Actual stock, crown shape and the availability of three matching specimens at both upper endpoints are unconfirmed. This improves the corner screen but **does not fully conceal PCK3**, particularly from the living room and jacuzzi.

## Position, size and clearances

Coordinates use the mapped local metre frame. Increasing x goes left/east when looking from the house into the rear garden; increasing y goes toward the rear boundary. No mapped building, observer coordinate or observer height was changed.

| Tree | x / y | Height / crown diameter | Nearest boundary | Nearest hardscape |
|---|---:|---:|---:|---:|
| 1, outer close-pair pine | 17.30 / 31.00 m | 10.00 / 6.00 m | 3.007 m | 4.420 m |
| 2, inner close-pair pine | 14.80 / 31.10 m | 10.00 / 6.00 m | 5.507 m | 1.920 m |
| 3, rear pine | 14.50 / 34.90 m | 10.00 / 6.00 m | 3.078 m | 3.929 m |

All trunks lie within x = 14.5–17.3 m and y = 31.0–34.9 m: a **2.8 × 3.9 m trunk envelope** in the rear-left zone. The complete nominal canopy envelope is approximately 8.8 × 9.9 m. Clear-stem height remains the editable 2.5 m modeling assumption; crown depth equals diameter.

Tree 1 ↔ 2 spacing is **2.502 m**, tree 2 ↔ 3 is **3.812 m**, and tree 1 ↔ 3 is **4.801 m**. All three 6 m crown pairs overlap in plan. Every trunk is in modeled soil and at least 1 m from hardscape; the minimum actual gap is 1.92 m. The nearest named observer is 3.16 m from a trunk, so the selected garden result does not depend on a camera almost inside a stem.

All nominal circular crowns fit inside the mapped parcel. This is a tight geometric fit: tree 1's crown almost touches the east boundary, with only about 0.007 m nominal model clearance, and tree 3's rear clearance is about 0.078 m. These figures are not surveyed planting tolerances or growth allowances. Actual crown form and set-out require checking. Some crown area overhangs the fire-lounge footprint; the model does not certify root-ball, maintenance or fire clearances.

## Supplier band and budget meaning

The existing `austrian-pine-tall` entry in `src/tree-catalog.js` records Galeria Ogrodowa's **9–10 m height / 4–6 m diameter band**, observed on 12 November 2026, at **59,900 PLN per plant**. The new default uses the upper endpoints of that recorded band. The catalog entry's midpoint dimensions remain unchanged for the comparison and for manually added trees.

The three-plant reference subtotal therefore remains **179,700 PLN**. This is a catalog budget reference, **not a supplier quote, reservation, availability confirmation or installed price**. Delivery, lifting, planting, anchoring and establishment remain separate. The source is [Galeria Ogrodowa — Austrian pine](https://galeriaogrodowa.pl/produkt/sosna-czarna-pinus-nigra/); actual specimens and the offer must be confirmed. Dimensions above the recorded band continue to require an individual price in the estimator; no price is extrapolated from this reference.

## Fixed-view screening: walls and roof kept separate

Dense facade checks sample PCK3's walls at 0.25 m vertical intervals and at most 0.25 m horizontally. The shared engine excludes back-facing/self-hidden points and uses the same hedge, crown, terrain and building intersections as the scene. The 365 source roof points are counted separately. These are sample fractions, not visible square metres or guarantees of opaque real foliage.

| Fixed viewpoint | Dense facade exposed / sampled | Facade samples hidden | Roof exposed / 365 |
|---|---:|---:|---:|
| Living room, seated | **859 / 5,214** | **83.53%** | **61** |
| Living room, standing | **930 / 5,214** | **82.16%** | **73** |
| Terrace | 33 / 5,214 | 99.37% | 6 |
| Jacuzzi, seated | **2,649 / 9,702** | **72.70%** | **39** |
| Named garden point | 139 / 5,214 | 97.33% | 2 |
| Sauna | 0 / 9,702 | 100.00% | 0 |
| Sunken lounge | 432 / 5,214 | 91.71% | 21 |

PCK3 remains visibly exposed from the house and jacuzzi. The new arrangement prioritizes the requested corner placement. The v1.13 forward arrangement offered stronger house screening, but its central-garden tree positions were explicitly rejected and are retained only as a comparison.

For reproduction of the older source-sample metric, exposed facade/roof counts are 11/61 seated living room, 11/73 standing, 2/6 terrace, 26/39 jacuzzi, 2/2 garden, 0/0 sauna and 8/21 lounge. Combined totals are respectively 72/420, 84/420, 8/420, 65/460, 4/420, 0/460 and 29/420. These totals can obscure wall exposure because they contain many more roof points, so they should not replace the dense facade table.

## Available comparisons

| Scenario | Grouping / assumed size | Main consequence |
|---|---|---|
| **Rear-left corner grove · default** | Selected contained fan; 10 m high / 6 m crowns | Upper supplier-band assumption; 2.50 m close pair |
| **Same corner grove · 9.5 m / 5 m stock** | Identical trunk positions; catalog midpoint sizes | Living-room facade screening 78.42% seated / 76.10% standing; jacuzzi 70.89%; garden 94.65% |
| **Tight rear-left triangle · 9.5 m stock** | (15.4,33.4), (17.7,33.4), (16.6,35.3); all pairs 2.20–2.30 m | Smaller 2.3 × 1.9 m trunk group farther back; all crowns inside, but living screening 66.28% / 64.06%, jacuzzi 62.19% |
| **Farther-left corner · boundary overhang** | Whole tight triangle translated to (16.7,32.0), (19.0,32.0), (17.9,33.9); 9.5 m / 5 m | Every trunk inside, but two crowns cross the east boundary by about 1.19 m and 0.09 m; full-crown screening is an assumption |
| **Previous v1.13 · forward screening arrangement** | Exact preserved v1.13 positions and midpoint dimensions | Stronger house screen, but trees spread forward into the central garden |

Moving a compact group farther left/east does not automatically hide PCK3. The farther-left comparison hides 69.29% / 67.11% of living-room wall samples, 60.85% at the jacuzzi and 67.34% at the garden point. No single screening percentage was used to override the required corner placement. Earlier program arrays and saved-design coordinates remain preserved.

## Separate feasibility study: larger crowns are not the default

A bounded sensitivity study asked what would be needed to hide **at least 90% of dense facade samples from both living-room presets and the jacuzzi simultaneously**, with the selected corner trunks fixed. This threshold concerns walls; roofs remain a separate result.

Height alone cannot meet it within the selected 6 m footprints. Replacing each crown with an infinitely tall opaque cylinder of the same plan footprint gives an optimistic horizontal-coverage bound: 85.50% seated living room, 84.73% standing and **73.95% jacuzzi**. Actual crowns cannot screen a ray that misses their horizontal footprint. The corresponding absolute horizontal lower bound on a common circular diameter for the three fixed positions is approximately **7.46 m**, even before finite crown height and shape are considered.

The finite ellipsoid study kept the 2.5 m clear stem, made width and depth equal, and varied all three trees together. Diameters below are the smallest found at each listed height, rounded upward to 0.1 m; this is a bounded model sensitivity result, not a botanical stock specification or a global optimum.

| Total tree height | Approximate diameter needed for the 90% threshold | Seated / standing / jacuzzi facade samples hidden |
|---|---:|---|
| 9.5 m | 8.5 m | 91.37% / 90.18% / 98.72% |
| 10.0 m | 8.2 m | 91.00% / 90.14% / 98.23% |
| 11.0 m | 8.0 m | 90.81% / 90.10% / 96.90% |
| 12.0 m | 8.0 m | 90.76% / 90.20% / 95.58% |

These widths exceed the documented 6 m supplier band and are **not offered as a default or priced stock**. For example, an 8.2 m crown at the selected positions would overhang the east boundary by about 1.09 m and the rear boundary by about 1.02 m. The 10 m / 8.2 m check still reaches the threshold when credit is limited to ray intersections inside the parcel, but the physical crown would extend beyond it and into more of the garden. Real branching, availability and cost are unconfirmed. Changing height also changes the ellipsoid's lower-crown profile, so “taller” does not monotonically improve every low sightline.

## Sunlight

June 21, Europe/Warsaw; selected-time direct-sun samples:

| Zone | 12:00 sunlit / sampled | 15:00 sunlit / sampled |
|---|---:|---:|
| Pool | 14 / 21 | 12 / 21 |
| Terrace | 32 / 32 | 32 / 32 |
| Jacuzzi | 4 / 4 | 4 / 4 |
| Garden | 166 / 315 | 145 / 315 |
| Sunken lounge | 0 / 9 | 9 / 9 |

These are point samples at two times, not a sunlight-hours study.

## Reproduction

`tests/rear-corner-screening.test.mjs` verifies the rear-left bounds, close spacing, crown connections and containment, observer/hardscape clearances, unchanged spa geometry, explicit historical and midpoint comparisons, upper-band catalog pricing without an installed quote, seven dense wall/roof results, the horizontal coverage bound, and selected-time sunlight. The v1.13 checks remain in `tests/aligned-screening.test.mjs`. No optimization runs on page load.
