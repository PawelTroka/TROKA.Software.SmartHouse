# Sternicza 11: three-pine screening in the edge-packed spa

Date: 12 November 2026. Programme: **spa-edge**. This study updates tree placement for the pool, sauna and cold plunge moved toward the plot edges. It preserves the historic classic and spa designs and the earlier [west-pool study](pck3-layout-comparison.md).

## Selected starting point

Use **three catalog-sized 9.5 m Austrian pines**, with the third tree restored to a forward position beside the pool. The selected layout substantially improves the main living-room, terrace and jacuzzi sightlines while retaining much stronger coverage around the pool than the alternative optimized only for the house.

The result is **not 100% screening from every view**. In this finite opaque-crown model, PCK3 has 41/420 visible samples from the seated living room, 44/420 standing, 20/420 from the terrace and 44/460 from the jacuzzi. The garden preset has 2/420 remaining. The side paths and dining area have larger residuals. These are sampled roof/facade sightlines, not visible-facade area percentages and not a promise about the density of delivered trees.

The simulator also includes a **Living-room priority** preset, with centres at (13.9,27.3), (12.5,33.4) and (15.2,23.2). It hides all sampled PCK3 points from the seated living-room eye, with 2/420 visible standing, 2/420 from the terrace and 3/460 from the jacuzzi. That arrangement leaves considerably more visible from the fire lounge and pool paths. It is a deliberate tradeoff, not a stronger whole-garden solution.

## Fixed geometry and assumptions

The source is the existing mapped site and terrain in [site-data.json](../data/site-data.json), with the explicit proposed [spa-edge garden programme](../src/garden-program.js). X increases toward the physical left/east side when looking from the house into the garden; Y increases from the road toward the rear. All coordinates below are local mapped metres.

- Pool water: x15.7, y24.5; 3.5 × 8.0 m. Coping outside bounds x15.42–19.48 and y24.22–32.78.
- Sauna: x1.35, y32.95; 4.2 × 4.1 m, with the 1.8 m front/inner chamfer.
- Cold plunge: x6.6, y35.55; 2.2 × 1.3 m, plus its modeled perimeter pad and entry steps.
- Fire lounge: x8.4, y26.8; 4.4 × 4.4 m, 0.6 m sunken.
- All three hedges: 4 m, inset 0.5 m. Garden fill: +0.5 m, while retaining mapped terrain variation. No separate raised hedge bed.
- Living terrace: 4.2 m deep. Living floor: 1.2 m above its original mapped local reference. Garage removed, canopy off. High unverified rooftop features excluded, as in the established baseline.
- Observer heights use the intended support surface: living seated 1.2 m, standing 1.65 m, jacuzzi seated 0.7 m, sauna 1.6 m, fire lounge 1.1 m. Extra occupied positions are listed below.

## Default trees and cost

| Tree | X (m) | Y (m) | Height (m) | Crown base (m) | Crown width × depth (m) |
|---|---:|---:|---:|---:|---:|
| pine-1 | 17.6 | 34.9 | 9.5 | 2.5 | 5.0 × 5.0 |
| pine-2 | 12.9 | 34.3 | 9.5 | 2.5 | 5.0 × 5.0 |
| pine-3 | 14.4 | 25.7 | 9.5 | 2.5 | 5.0 × 5.0 |

The catalog snapshot uses **59,900 PLN per tall pine**, so the three plants total **179,700 PLN**. This is a plant-only reference amount including the supplier catalog's VAT basis. Delivery, unloading/crane access, planting, anchoring and establishment remain separately quoted. It is not an installed-price estimate or reserved stock.

The listed purchased-stock range is 9–10 m tall and 4–6 m crown diameter. The model uses the midpoint, with an editable **2.5 m clear stem** and crown depth equal to width. Clear stem and crown depth are assumptions, not measurements of three identified nursery specimens. No tree height or diameter was enlarged to reach the reported screening results. See the existing [tree catalog](../src/tree-catalog.js) and its linked [Galeria Ogrodowa source](https://galeriaogrodowa.pl/produkt/sosna-czarna-pinus-nigra/).

## Complete viewpoint comparison

The comparison holds the new spa-edge geometry fixed. “Previous tree positions” means the v1.7 two-tall-plus-one-small arrangement applied to this new geometry, isolating the planting change. Counts are **visible PCK3 sample points / target sample points**. Different denominators reflect facade self-occlusion from different directions.

| View | Previous tree positions | Balanced default | Living-room priority | Two tall + one large |
|---|---:|---:|---:|---:|
| Living room seated | 291/420 | 41/420 | 0/420 | 64/420 |
| Living room standing | 304/420 | 44/420 | 2/420 | 67/420 |
| Terrace standing | 188/420 | 20/420 | 2/420 | 1/420 |
| Jacuzzi seated | 135/460 | 44/460 | 3/460 | 81/460 |
| Garden preset | 0/420 | 2/420 | 95/420 | 2/420 |
| Sauna seat | 0/460 | 0/460 | 0/460 | 0/460 |
| Sunken fire lounge | 0/420 | 17/420 | 153/420 | 52/420 |
| Terrace left seated | 230/420 | 33/420 | 1/420 | 72/420 |
| Terrace left standing | 243/420 | 7/420 | 0/420 | 21/420 |
| Terrace right standing | 167/420 | 48/420 | 1/420 | 53/420 |
| Loungers seated | 145/420 | 10/420 | 117/420 | 56/420 |
| Dining seated | 101/460 | 95/460 | 118/460 | 129/460 |
| Right garden path | 127/460 | 146/460 | 171/460 | 174/460 |
| Path between pool and fire lounge | 57/420 | 24/420 | 369/420 | 66/420 |
| Path beyond pool | 96/420 | 26/420 | 244/420 | 0/420 |
| Rear centre path | 17/460 | 56/460 | 56/460 | 56/460 |
| Cold plunge seated | 8/460 | 13/460 | 13/460 | 13/460 |

The sauna has zero visible PCK3 samples even before adding trees: its modeled opaque rear/side walls already block this particular building. Glazing receives no opaque-screen credit. The result must not be attributed to the pines or generalized to views through every wall of the sauna.

The weighted mean screening of the 17 checked positions changes from **64.4%** for the previous tree positions to **91.9%** for the balanced default. This is only a comparison score; a single weighted number cannot establish complete garden privacy.

## Cost and placement comparisons

| Arrangement | Catalog plant sum | Weighted hidden samples | Lowest named-view screening | Lowest extra-view screening |
|---|---:|---:|---:|---:|
| Balanced three tall pines | 179,700 PLN | 91.9% | 89.5% | 68.3% |
| Living-room priority | 179,700 PLN | 87.0% | 63.6% | 12.1% |
| Two tall + one large | 136,700 PLN | 88.3% | 82.4% | 62.2% |
| One tall + two large | 93,700 PLN | 82.2% | 86.2% | 21.2% |
| Three tall, no crown overhang | 179,700 PLN | 52.9% | 35.0% | 16.7% |

The lower-cost two-tall-plus-one-large preset uses separately optimized positions: tall pines at (14.4,26.4) and (13.0,33.8), and a 5.5 m pine at (16.8,33.8). It saves **43,000 PLN** in catalog plant cost. The default is not declared the best purchase: the smaller mix remains a useful cost/coverage comparison, while three tall trees satisfy the requested restored full-height planting.

A controlled size comparison keeps all balanced positions fixed:

- Reducing only the forward pine at (14.4,25.7) from 9.5 to 5.5 m increases visible samples from **41 to 282** in the seated living room and **44 to 304** standing. This is why returning a full-height crown forward matters.
- Reducing only the rear/east pine at (17.6,34.9) keeps those living-room counts at 41 and 44, but increases jacuzzi exposure from **44 to 145/460** and the path between pool and lounge from **24 to 216/420**.

Moving the original west-pool tree coordinates literally into the new design puts one tall trunk inside the relocated pool. That historic arrangement is therefore recorded as an invalid direct transplant, not presented as an equivalent buildable option.

## Ground clearance and intentional overhang

Every proposed trunk is on modeled soil. The bounded search reserves at least **1 m from the tree centre to fixed hardscape (including actual fire-lounge coping, sauna entry steps, plunge pad and all five plunge steps), dining/lounger footprints and stepping stones**, and keeps each complete modeled crown plus 0.15 m inside the plot. It also excludes trees that place a trunk within 1 m of a checked observer or engulf that observer in opaque foliage. Tree centres remain at least max(2 m, 0.6 times the smaller crown width) apart.

For the default, the minimum centre-to-ground-feature distances are approximately **2.12 m** for pine-1, **2.94 m** for pine-2 and **1.02 m** for the forward pine-3. The narrowest case is pine-3 beside the pool coping; its modeled trunk radius is about 0.24 m, leaving about 0.78 m from trunk surface to the coping. These are concept-layout allowances, not confirmation that the delivered root ball, construction protection or machinery access will fit. Actual nursery root-ball dimensions and pool foundations need checking together before specifying the tree.

Some **crowns overhang pool/spa edges**. The forward crown clips the northeast edge of the fire-lounge footprint, while every modeled crown footprint remains clear of the fire bowl itself. This calculation is a geometric separation check, not a fire-safety or tree-clearance certification. The rear pair also have a small crown overlap; overlapping ideal envelopes do not guarantee dense real foliage. Crown overhang of water implies a leaf/needle-maintenance tradeoff.

The separate no-overhang search produced substantially weaker screening: only 52.9% weighted hidden samples, with 273/420 visible from the seated living room and 271/420 standing. With this crowded layout, keeping every full crown clear of all hardscape prevents using much of the useful screening diagonal. The default makes that design compromise explicit.

## Sunlight tradeoff

The same crowns that screen PCK3 also cast shade. The following are **instantaneous direct-sun grid counts** at Europe/Warsaw local time, not daily sun hours or energy. Small sampled zones such as the jacuzzi have coarse percentages. Existing buildings and hedges already shade some of the pool even in the tree-free comparison.

| Date | Time | Planting | Pool sunlit cells | Terrace sunlit cells | Jacuzzi sunlit cells |
|---|---|---|---:|---:|---:|
| 2026-03-21 | 12:00 | Hedges and spa only | 0/27 (0.0%) | 32/32 (100.0%) | 4/4 (100.0%) |
| 2026-06-21 | 09:00 | Hedges and spa only | 0/27 (0.0%) | 23/32 (71.9%) | 4/4 (100.0%) |
| 2026-06-21 | 12:00 | Hedges and spa only | 18/27 (66.7%) | 32/32 (100.0%) | 4/4 (100.0%) |
| 2026-06-21 | 15:00 | Hedges and spa only | 27/27 (100.0%) | 32/32 (100.0%) | 4/4 (100.0%) |
| 2026-09-21 | 12:00 | Hedges and spa only | 0/27 (0.0%) | 32/32 (100.0%) | 4/4 (100.0%) |
| 2026-03-21 | 12:00 | v1.7 trees on new layout | 0/27 (0.0%) | 31/32 (96.9%) | 4/4 (100.0%) |
| 2026-06-21 | 09:00 | v1.7 trees on new layout | 0/27 (0.0%) | 20/32 (62.5%) | 4/4 (100.0%) |
| 2026-06-21 | 12:00 | v1.7 trees on new layout | 16/27 (59.3%) | 31/32 (96.9%) | 4/4 (100.0%) |
| 2026-06-21 | 15:00 | v1.7 trees on new layout | 12/27 (44.4%) | 32/32 (100.0%) | 4/4 (100.0%) |
| 2026-09-21 | 12:00 | v1.7 trees on new layout | 0/27 (0.0%) | 28/32 (87.5%) | 4/4 (100.0%) |
| 2026-03-21 | 12:00 | Balanced three tall | 0/27 (0.0%) | 14/32 (43.8%) | 4/4 (100.0%) |
| 2026-06-21 | 09:00 | Balanced three tall | 0/27 (0.0%) | 23/32 (71.9%) | 4/4 (100.0%) |
| 2026-06-21 | 12:00 | Balanced three tall | 13/27 (48.1%) | 25/32 (78.1%) | 4/4 (100.0%) |
| 2026-06-21 | 15:00 | Balanced three tall | 9/27 (33.3%) | 32/32 (100.0%) | 4/4 (100.0%) |
| 2026-09-21 | 12:00 | Balanced three tall | 0/27 (0.0%) | 10/32 (31.3%) | 4/4 (100.0%) |
| 2026-03-21 | 12:00 | Living-room priority | 0/27 (0.0%) | 9/32 (28.1%) | 3/4 (75.0%) |
| 2026-06-21 | 09:00 | Living-room priority | 0/27 (0.0%) | 23/32 (71.9%) | 4/4 (100.0%) |
| 2026-06-21 | 12:00 | Living-room priority | 18/27 (66.7%) | 16/32 (50.0%) | 4/4 (100.0%) |
| 2026-06-21 | 15:00 | Living-room priority | 16/27 (59.3%) | 32/32 (100.0%) | 4/4 (100.0%) |
| 2026-09-21 | 12:00 | Living-room priority | 0/27 (0.0%) | 4/32 (12.5%) | 1/4 (25.0%) |

At June-noon the default leaves 13/27 pool cells and 25/32 terrace cells sunlit, versus 16/27 and 31/32 with the previous trees at the same new pool position. The living-priority arrangement leaves more pool cells sunlit at that instant but fewer terrace cells. The simulator's date and time controls remain the appropriate way to compare these competing goals across the day.

## Reproducible method and limits

Run:

```sh
node scripts/search-edge-pck3-layouts.mjs
node --test tests/edge-screening.test.mjs
```

The script searches a 0.5 m grid, uses a beam of 24 groups with up to three coordinate-descent passes, then refines positions at 0.1 m. Four main living/terrace/jacuzzi views have weight 3, the named garden view weight 2, and the remaining named/extra viewpoints weight 1. The balanced objective adds a small penalty for the worst named and extra viewpoint. The living-priority comparison puts substantially more weight on the four main views. This bounded numerical search is **not proof of a global optimum**.

Every reported visible-sample count is independently recomputed with the full visibility engine and checked against the search bitsets. The [machine-readable record](edge-screening-comparison.json) includes exact settings, all trees, placement warnings, observer elevations, residual counts and solar comparisons. The implementation is in [screening-layouts.js](../src/screening-layouts.js); existing classic/spa arrays are unchanged.

The crowns are ideal opaque ellipsoids; real branches, clear stems and foliage gaps can weaken screening. The comparison does not model future growth, root systems, transplant establishment or every possible eye position. Site geometry remains the simulator's source geometry, not a new survey. The appropriate next design step is to compare measured individual nursery crowns with these exact sightlines and confirm a real planting detail, especially beside the pool. None of the tested three-pine arrangements establishes 100% whole-garden screening.

## Checked observer positions

Eye Z uses the source's elevation datum. Eye height is relative to the modeled supporting surface.

| View | X (m) | Y (m) | Eye Z (m) | Eye above support (m) |
|---|---:|---:|---:|---:|
| Living room seated | 9.609 | 15.515 | 4.838 | 1.20 |
| Living room standing | 9.609 | 15.515 | 5.288 | 1.65 |
| Terrace standing | 9.609 | 21.215 | 5.288 | 1.65 |
| Jacuzzi seated | 6.609 | 21.115 | 4.338 | 0.70 |
| Garden preset | 11.800 | 32.100 | 4.709 | 1.65 |
| Sauna seat | 3.550 | 36.400 | 5.031 | 1.60 |
| Sunken fire lounge | 10.600 | 30.680 | 3.579 | 1.10 |
| Terrace left seated | 12.800 | 20.400 | 4.838 | 1.20 |
| Terrace left standing | 12.800 | 21.300 | 5.288 | 1.65 |
| Terrace right standing | 8.000 | 21.300 | 5.288 | 1.65 |
| Loungers seated | 12.700 | 23.700 | 4.013 | 1.00 |
| Dining seated | 5.400 | 25.500 | 4.099 | 1.20 |
| Right garden path | 6.600 | 30.000 | 4.559 | 1.65 |
| Path between pool and fire lounge | 14.100 | 29.000 | 4.714 | 1.65 |
| Path beyond pool | 17.800 | 33.500 | 5.097 | 1.65 |
| Rear centre path | 10.600 | 36.000 | 5.031 | 1.65 |
| Cold plunge seated | 7.700 | 36.200 | 4.442 | 1.10 |
