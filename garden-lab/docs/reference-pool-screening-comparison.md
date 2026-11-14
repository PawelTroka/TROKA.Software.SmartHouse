# Reference pines and pool beside the grove — v1.15

The `spa-pool-grove` starting design follows the user's 14 November whole-plot screenshot: **one pine at the left/east boundary and two pines near the rear boundary**. Every tree is **10 m high**. The reference's crown diameters remain 6 m, 6 m and 5 m, respectively. Tree 3 is raised from the screenshot's 9.5 m to the requested 10 m; the other two already showed 10 m.

The screenshot is a visual placement reference, not a coordinate survey. The selected positions reconstruct its arrangement and displayed trunk spacings: tree 1–3 rounds to **5.44 m**, tree 2–3 to **4.66 m**, and tree 1–2 to **7.9 m** at the plan's one-decimal precision. This is a spread group along the rear/east edge, rather than the previous close triangle. No sightline optimizer moved the group into the centre of the garden.

## Configured geometry

Increasing local x moves left/east when looking from the house into the garden; increasing y moves toward the rear. The plan keeps the street at the top, so the physical left/east side appears on its right.

| Tree | Configured x / y | Height | Crown width × depth | Trunk centre to nearest plot line | Trunk centre to full pool coping |
|---|---:|---:|---:|---:|---:|
| 1, east-boundary pine | 19.30 / 30.20 m | 10.00 m | 6.00 × 6.00 m | 1.005 m, east | **1.000 m** |
| 2, rear inner pine | 13.80 / 35.80 m | 10.00 m | 6.00 × 6.00 m | 2.190 m, rear | **1.297 m** |
| 3, rear outer pine | 18.45 / 35.57 m | 10.00 m | 5.00 × 5.00 m | 1.865 m, east | **1.001 m** |

All three trunks remain inside the property and outside modeled hardscape. Crown-base height stays at the existing editable 2.5 m assumption. The nominal crown of tree 3 connects the other two in plan: tree 1–3 centres are 5.437 m apart and tree 2–3 are 4.656 m apart, against their combined radii of 5.5 m. Tree 1 and tree 2 are 7.849 m apart and do not directly overlap each other. The tree 1–3 overlap is narrow; it should not be mistaken for dense real foliage.

### Boundary overhang is part of this reference

The reference places the crowns beyond the parcel. The simulator displays this instead of moving the requested trunks away from their intended positions:

| Crown | Modeled extension past parcel line |
|---|---:|
| Tree 1 | **1.995 m east** |
| Tree 2 | **0.810 m rear** |
| Tree 3 | **0.635 m east** and **0.157 m rear** |

These are circular crown-envelope extensions normal to the mapped parcel segments. Tree-placement warnings remain active. The screening calculation uses the complete configured crowns, including their overhang. It does not certify that these crowns, root balls or future growth can be retained at these locations.

## Pool moved beside the pines and lengthened

| Pool parameter | Previous v1.14 | Reference-pool design |
|---|---:|---:|
| Water x / y | 15.70 / 19.50 m | **14.52 / 26.30 m** |
| Water width × length | 3.50 × 6.00 m | **3.50 × 8.00 m** |
| Water area | 21.00 m² | **28.00 m²** |
| Modeled water depth | 1.40 m | 1.40 m |
| Geometric water volume | 29.40 m³ | **39.20 m³** |
| Coping on each side | 0.28 m | 0.28 m |
| Full outer footprint | 4.06 × 6.56 m | **4.06 × 8.56 m** |

The pool's front edge moves **6.8 m rearward** and **1.18 m inward**, with two extra metres of water length. Moving inward lets it sit beside the nearest east-boundary trunk instead of stopping several metres in front of the rear pair. Its full coping now comes within about 1 m of trees 1 and 3.

This position is near the geometric limit of the selected **1 m trunk-centre to finished-coping concept allowance**: moving it another centimetre east would breach that allowance at tree 1, and another centimetre rear would breach it at tree 3. This is not a claim that a mature pine's root ball, excavation support or maintenance needs fit within 1 m. Those specifications require the actual supplied specimens and pool construction details. The model's crowns overhang the water; the user can inspect that relationship in plan and 3D.

The full coping remains inside the parcel, with **2.003 m to the nearest east parcel line** and **1.360 m to the sunken lounge's outer coping**. The fixed house, terrace, stairs, sauna, cold plunge, jacuzzi service envelope, dining platform and loungers retain their geometry; the new pool stays at least 1 m from their finished envelopes. All named observer coordinates and eye elevations stay fixed.

Four-metre thujas still follow the front, left, right and rear boundaries. The proposed pedestrian and vehicle openings stay clear. The pool change does not alter hedge quantities or gate assumptions.

## PCK3 walls improve from the house, jacuzzi and rear garden

The following checks use the same fixed views, 4 m hedges, +0.5 m garden fill and building models as v1.14. Dense facade samples are spaced at up to 0.25 m horizontally and 0.25 m vertically. Back-facing/self-hidden wall points are excluded. The 365 source roof samples are counted separately. Sample percentages are not visible facade area, window exposure or a guarantee of opaque real foliage.

| Fixed viewpoint | v1.14 facade hidden | New facade exposed / sampled | New facade hidden | v1.14 roof exposed / 365 | New roof exposed / 365 |
|---|---:|---:|---:|---:|---:|
| Living room, seated | 83.53% | 503 / 5,214 | **90.35%** | 61 | **105** |
| Living room, standing | 82.16% | 569 / 5,214 | **89.09%** | 73 | **131** |
| Terrace | 99.37% | 216 / 5,214 | **95.86%** | 6 | **52** |
| Jacuzzi, seated | 72.70% | 322 / 9,702 | **96.68%** | 39 | **51** |
| Named garden point | 97.33% | 2 / 5,214 | **99.96%** | 2 | **0** |
| Sauna | 100.00% | 0 / 9,702 | **100.00%** | 0 | **0** |
| Sunken lounge | 91.71% | 6 / 5,214 | **99.88%** | 21 | **0** |

The reference substantially improves the jacuzzi and lounge wall screening. It also improves the living-room wall check. **PCK3 remains visible**, particularly its upper roof envelope from the house and terrace. The wall gains do not mean the roof is hidden: the wider reference arrangement leaves more roof samples exposed from those views than the previous compact grove.

### Additional occupied positions

Additional points use local proposed garden grade plus the stated eye height. They are specific point checks, not a whole-garden optimization. Pool paths follow the new footprint; the dining and lounger points retain their existing locations.

| Position | x / y | Eye above local grade | Facade exposed / sampled | Facade hidden | Roof exposed / 365 |
|---|---:|---:|---:|---:|---:|
| Dining, standing | 5.50 / 26.10 m | 1.65 m | 2,398 / 9,702 | **75.28%** | 59 |
| Dining, seated | 5.50 / 26.10 m | 1.10 m | 2,148 / 9,702 | **77.86%** | 54 |
| Lounger 1, standing | 12.69 / 23.70 m | 1.65 m | 36 / 5,214 | 99.31% | 5 |
| Lounger 2, standing | 13.79 / 23.70 m | 1.65 m | 40 / 5,214 | 99.23% | 3 |
| Pool near-end path | 16.27 / 25.30 m | 1.65 m | 15 / 5,214 | 99.71% | 0 |
| Pool inner-side path | 13.60 / 30.30 m | 1.65 m | 90 / 5,214 | 98.27% | 0 |
| Pool east-side path | 19.15 / 27.30 m | 1.65 m | 0 / 5,214 | 100.00% | 0 |
| Pool rear path | 16.27 / 35.20 m | 1.65 m | 374 / 5,214 | 92.83% | 30 |

The dining position still has material exposure. The design therefore cannot be described as hiding PCK3 from every view.

## Pool shade changes with the move

June 21, Europe/Warsaw; selected-time direct-sun samples on the new water surface:

| Local time | Pool sunlit / sampled | Terrace sunlit / sampled | Jacuzzi sunlit / sampled |
|---|---:|---:|---:|
| 12:00 | **0 / 24** | 32 / 32 | 4 / 4 |
| 15:00 | **4 / 24** | 32 / 32 | 4 / 4 |
| 17:00 | **19 / 24** | 22 / 32 | 0 / 4 |

The pool is now beneath and alongside the nominal crowns and close to the rear hedge, so its midday shading increases. These checks concern three times on one date, not annual sunlight hours or pool-heating energy.

## Budget and historical designs

All three configured trees remain within the recorded 9–10 m height / 4–6 m crown supplier band. Their catalog plant reference remains **59,900 PLN each / 179,700 PLN total**. The source is the existing [Galeria Ogrodowa Austrian pine listing](https://galeriaogrodowa.pl/produkt/sosna-czarna-pinus-nigra/). Actual specimen dimensions, stock availability, delivery, lifting, planting and establishment remain subject to supplier/contractor confirmation. No new quote was requested or invented for this geometry change.

The pool water area rises by 7 m² and the geometric water volume by 9.8 m³. The live estimator recalculates the area-based pool allowance and the affected paving/fill quantities from the new footprint. Its pool allowance remains a planning amount, not a signed installation quote.

The new programme offers the reference pines and a hedges-only comparison. Earlier planting positions are kept with their historical garden-program choices, rather than placing known colliding old trunks into the moved pool. Selecting the previous rear-left corner programme restores the v1.14 6 m pool and its original planting comparisons. Saved and shared schema-16 designs retain their published geometry.

## Reproduction

`tests/reference-pool-layout.test.mjs` verifies the reference spacings and heights, explicit boundary-overhang warnings, coping-to-trunk limits, clearance from fixed features, unchanged named observers, dense wall and separate roof results, the remaining dining exposure and selected-time pool shade. Historical v1.14 results remain in `tests/rear-corner-screening.test.mjs` under explicit `spa-corner` settings. No position search runs when the page opens.
