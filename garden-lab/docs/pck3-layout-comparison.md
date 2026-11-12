# Sternicza PCK 3 screening-tree comparison

Date: 12 November 2026. The supplied mapped source geometry and existing app numerical model were used. This is a bounded numerical design search, not a global optimum or a real-foliage guarantee.

## Fixed assumptions

All three hedges 4 m; garden fill 0.5 m; hedge-only raised bed 0; terrace depth 4.2 m; living floor 1.2 m above original local reference; garage removed; canopy off; high unverified rooftop returns excluded. Each preset uses its intended eye height: seated living 1.2 m, jacuzzi 0.7 m, standing 1.65 m. Initial crowns use catalog midpoint dimensions, with unmeasured editable crown bases.

## Search

Full mapped PCK 3 samples were evaluated from 13 distinct observers. Named five views had weight 2 each and the eight additional views weight 1. Candidate tree centres were searched at 0.5 m spacing and final coordinates refined at 0.1 m. A beam of 20 combinations and coordinate-descent refinement were used for one to three trees and selected mixed groups. This is not proof of a global optimum. Candidate sets depend on the modeled hardscape and the stated furniture clearances.

Final constraints: whole modeled crown plus 0.15 m clearance to pool, terrace, house, stairs and parcel boundary; stems outside dining platform and lounge furniture by trunk radius +0.2 m; no observer placed inside a crown; group stem distance at least max(1.4 m, 0.6 times smaller crown width). These are concept-design clearances, not certified root-ball or structural engineering requirements. Crowns may overlap one another.

The final reported counts were independently rerun through analyzeVisibility, matching the optimization bitsets for every view.

## Layouts

### default

Plant-only reference sum: **136,700 PLN**.

| Type | X (m) | Y (m) | Height | Crown base | Crown width/depth |
|---|---:|---:|---:|---:|---:|
| austrian-pine-tall | 16.1 | 29.6 | 9.5 | 2.5 | 5.0 / 5.0 |
| austrian-pine-tall | 12.2 | 32.6 | 9.5 | 2.5 | 5.0 / 5.0 |
| austrian-pine-large | 15.7 | 22.8 | 5.5 | 1.3 | 3.5 / 3.5 |

Mean of five named-view hidden sample fractions: 90.4%; mean of eight additional fractions: 80.7%.

### premium

Plant-only reference sum: **179,700 PLN**.

| Type | X (m) | Y (m) | Height | Crown base | Crown width/depth |
|---|---:|---:|---:|---:|---:|
| austrian-pine-tall | 16.0 | 30.3 | 9.5 | 2.5 | 5.0 / 5.0 |
| austrian-pine-tall | 12.2 | 32.6 | 9.5 | 2.5 | 5.0 / 5.0 |
| austrian-pine-tall | 16.0 | 24.0 | 9.5 | 2.5 | 5.0 / 5.0 |

Mean of five named-view hidden sample fractions: 95.6%; mean of eight additional fractions: 81.6%.

### budget

Plant-only reference sum: **93,700 PLN**.

| Type | X (m) | Y (m) | Height | Crown base | Crown width/depth |
|---|---:|---:|---:|---:|---:|
| austrian-pine-tall | 13.6 | 24.9 | 9.5 | 2.5 | 5.0 / 5.0 |
| austrian-pine-large | 11.3 | 32.9 | 5.5 | 1.3 | 3.5 / 3.5 |
| austrian-pine-large | 11.3 | 26.8 | 5.5 | 1.3 | 3.5 / 3.5 |

Mean of five named-view hidden sample fractions: 90.0%; mean of eight additional fractions: 62.2%.

## PCK 3 visible sample counts

These are **visible points / target sample points** after existing obstructions and planting, not visible facade-area percentages. Different views have different sample denominators because self-hidden facades are excluded.

| View | Baseline | Mixed default | Three tall | Lower-cost mix |
|---|---:|---:|---:|---:|
| Living room seated | 399/420 | 59/420 | 25/420 | 40/420 |
| Living room standing | 403/420 | 103/420 | 37/420 | 38/420 |
| Terrace standing | 398/420 | 10/420 | 4/420 | 1/420 |
| Jacuzzi seated | 419/460 | 6/460 | 3/460 | 128/460 |
| Garden preset | 410/460 | 27/460 | 27/460 | 15/460 |
| Terrace left seated | 396/420 | 0/420 | 0/420 | 88/420 |
| Terrace left standing | 398/420 | 0/420 | 0/420 | 13/420 |
| Terrace right standing | 398/420 | 19/420 | 6/420 | 74/420 |
| Garden west of pool | 414/460 | 230/460 | 230/460 | 365/460 |
| Garden west rear | 93/460 | 93/460 | 93/460 | 93/460 |
| Garden east middle | 391/420 | 49/420 | 32/420 | 391/420 |
| Garden east rear | 187/420 | 187/420 | 187/420 | 187/420 |
| Garden rear centre | 108/460 | 108/460 | 108/460 | 108/460 |

## Observer positions

X increases toward the physical left/east side when looking from house to rear garden; Y is distance from front street boundary. Z is absolute source elevation.

| View | X | Y | Eye Z | Eye above support |
|---|---:|---:|---:|---:|
| Living room seated | 9.609 | 15.515 | 4.838 | 1.20 |
| Living room standing | 9.609 | 15.515 | 5.288 | 1.65 |
| Terrace standing | 9.609 | 21.215 | 5.288 | 1.65 |
| Jacuzzi seated | 6.609 | 20.565 | 4.338 | 0.70 |
| Garden preset | 9.609 | 30.000 | 4.624 | 1.65 |
| Terrace left seated | 12.800 | 20.400 | 4.838 | 1.20 |
| Terrace left standing | 12.800 | 21.300 | 5.288 | 1.65 |
| Terrace right standing | 8.000 | 21.300 | 5.288 | 1.65 |
| Garden west of pool | 3.200 | 27.000 | 4.608 | 1.65 |
| Garden west rear | 3.200 | 35.500 | 4.744 | 1.65 |
| Garden east middle | 15.500 | 28.500 | 4.824 | 1.65 |
| Garden east rear | 16.800 | 35.000 | 5.079 | 1.65 |
| Garden rear centre | 10.500 | 35.500 | 4.952 | 1.65 |

## Instantaneous sunlight at 12:00 Europe/Warsaw

1 m grid samples; direct sun only. These fractions are not daily solar hours or irradiance. Existing buildings and hedges already shade the plot. The Jacuzzi has only three sampled cells, so its percentage is coarse.

| Date | Layout | Garden sunlit | Terrace sunlit | Pool sunlit | Jacuzzi sunlit |
|---|---|---:|---:|---:|---:|
| 2026-03-21 | baseline | 98/340 (28.8%) | 33/33 (100.0%) | 12/24 (50.0%) | 3/3 (100.0%) |
| 2026-03-21 | default | 75/340 (22.1%) | 15/33 (45.5%) | 12/24 (50.0%) | 2/3 (66.7%) |
| 2026-03-21 | premium | 76/340 (22.4%) | 14/33 (42.4%) | 12/24 (50.0%) | 2/3 (66.7%) |
| 2026-03-21 | budget | 91/340 (26.8%) | 10/33 (30.3%) | 12/24 (50.0%) | 3/3 (100.0%) |
| 2026-06-21 | baseline | 247/340 (72.7%) | 33/33 (100.0%) | 24/24 (100.0%) | 3/3 (100.0%) |
| 2026-06-21 | default | 196/340 (57.6%) | 31/33 (93.9%) | 15/24 (62.5%) | 3/3 (100.0%) |
| 2026-06-21 | premium | 192/340 (56.5%) | 24/33 (72.7%) | 15/24 (62.5%) | 3/3 (100.0%) |
| 2026-06-21 | budget | 214/340 (62.9%) | 22/33 (66.7%) | 20/24 (83.3%) | 3/3 (100.0%) |

## Recommendation and limits

The mixed default is a defensible comparison starting point, not the established best purchase: two 9.5 m specimens and one 5.5 m specimen save 43,000 PLN of plant reference cost versus three 9.5 m specimens. It keeps significantly more June-noon terrace sun (31/33 versus 24/33 cells), but standing living-room screening is weaker (103/420 visible versus 37/420). The lower-cost one-tall/two-large mix is 93,700 PLN and prioritizes the living room, but it leaves more Jacuzzi and side-garden exposure. Three very tall trees cannot justify a 100% whole-garden promise: 230/460 sampled PCK3 points remain visible from west of the pool and 187/420 from the east-rear point even in the premium final layout.

The requirement is highly viewpoint-dependent. A near tree can cover one eye while failing from another. Broad crown diameter and actual foliage distribution matter as much as advertised tree height. All nursery prices exclude unquoted site delivery, unloading/crane access, planting, anchoring and establishment. Crown bases/depth and dense opacity are model assumptions; actual individual specimen measurements and a local sightline mock-up are needed before an expensive order.

## Actual crown dimensions change the outcome

The premium layout was rerun at the same tree positions with different crown widths and crown bases. These are optimistic opaque envelopes. This sensitivity comparison does not reserve actual stock or authorize overhangs caused by a wider crown.

| Crown assumption | Sofa hidden samples | Standing living | Terrace | Jacuzzi | Garden preset |
| --- | ---: | ---: | ---: | ---: | ---: |
| 5 m crowns | 94% | 91.2% | 99% | 99.3% | 94.1% |
| 4 m crowns | 87.9% | 85% | 83.6% | 87.6% | 85% |
| 6 m crowns | 97.6% | 94.8% | 100% | 100% | 97.6% |
| 4 m clear stems | 96% | 90.7% | 97.4% | 96.1% | 45.2% |

The nursery lists 4–6 m crown diameter for both 6–7 m and 9–10 m stock. A 5 m diameter and 2.5 m crown base are editable drawing assumptions, not measurements of the three trees that would be delivered. A 4 m clear stem leaves much more open below the crown at the garden observer. The same taller crown base shifts the ellipsoid vertically, so some high sightlines can improve while lower ones worsen. See [complete sensitivity records and warnings](pck3-crown-sensitivity.json).

## Sources and reproduction

The plant prices and purchased crown ranges are from [Galeria Ogrodowa, Pinus nigra](https://galeriaogrodowa.pl/produkt/sosna-czarna-pinus-nigra/), reviewed 12 November 2026. [RHS specimen-tree guidance](https://www.rhs.org.uk/plants/types/trees/buying-planting-specimens) describes selecting actual stock, access, root preparation and establishment. Crown bases are drawing assumptions, not nursery measurements.

Run `node scripts/search-pck3-layouts.mjs` from the project to repeat the bounded final search. The optional first argument selects an output path; the default is `/tmp/sternicza-screening-search.json`. This is an offline analysis tool, not code executed when the page opens. [Recorded results](pck3-layout-comparison.json) preserve the selected states, observer positions and all reported counts. [The deployed layouts](../src/screening-layouts.js) use these coordinates. The broader exploratory search was used to compare sizes; the checked final furniture-clear layouts are the published design starting points.
