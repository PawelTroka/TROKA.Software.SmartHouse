# Summer pool and boundary planting — Garden Lab 1.34

The new Sternicza default places the 8 × 3.5 m pool across the western part of
the garden and restores Austrian pines beside the eastern and rear boundaries.
The pool stays in the same position when a finish style changes. One, two, or
three furnished pool sides provide four, six, or seven individual sunbeds.

This is the best result in the tested feasible shortlist, with a separate check
on every day of June–August. It is a bounded design study rather than a proof
that no continuously positioned alternative could receive more sunshine.

## Geometry used by the public scene

All coordinates below are local metres from the mapped site frame. The study
loads the same site, neighbouring roofs, and existing vegetation as the app,
then runs `applyBuildingOverrides` and `applyPlanExterior` in that order.
This registers the drawing-based house and terrace to the mapped site before
calculating obstructions, levels, or access. The fresh 8.5 m terrace and its
8.5 m canopy are used; the full-width 10.77 m renovation terrace also retains
the tested stair-to-pool clearance.

| Feature | Final geometry |
| --- | --- |
| Pool water opening | x = 3.25–11.25; y = 25.00–28.50; 28 m² |
| Finished coping footprint | x = 2.97–11.53; y = 24.72–28.78 |
| Horizontal water elevation | z = 3.0653084486562427 m in the model's vertical datum |
| Coping elevation | z = 3.165308448656243 m |
| Registered terrace rear edge | y = 22.117475217542932 m |
| Bottom of the five-tread terrace run | y = 23.567475217542932 m |
| Straight gap from bottom tread to coping | 1.152524782457068 m |
| Sunken fire lounge | x = 12.65; y = 29.50; 4.4 × 4.4 m before coping |

Pool levels and basin obstruction boxes come directly from the production
`spaLevels` and `poolEdgeBoxes` functions. The water is horizontal, rather than
following the terrain under the proposed excavation. The detailed decimals
identify the computed geometry; they do not imply corresponding survey accuracy.

The one-side option places four sunbeds on the garden-facing long side. The
two-side option adds two at the eastern end; the three-side option adds one at
the western end. Each bed is represented individually with a 0.78 × 2 m
footprint. All three configurations fit within the parcel, clear the pool and
fixed spa structures, and retain the dining area and outdoor kitchen in all
22 renovation styles. A finish-only comparison with garden-layout changes
disabled retains the same furniture and path quantities.

## Sunlight search and summer verification

The candidate search uses 1,073 receiving points on a 0.5 m ground grid. It
samples 1, 15, and the last day of each month from June through August 2026,
at half-hour intervals from 07:00 to 21:00 in Europe/Warsaw. There are 254
above-horizon instants in this preliminary sample.

Both 8 × 3.5 m orientations are searched on a 0.5 m placement grid, with
0.25 m refinement around the leading transverse position. There are 83
accepted candidates after access and furniture constraints. The candidate
envelope reserves 1 m beyond finished coping to fixed objects and the terrace
stairs. The three-side furniture arrangement keeps every sunbed at least
1 m inside the parcel and 0.25 m from the tested fixed structures. Sauna and
cold plunge stay in place; the fire lounge and movable furniture may move.

The ground-grid ranking initially uses the retained 10 m Austrian-pine
reference. Its leading eight feasible candidates are then recalculated on
their exact horizontal water planes with the new boundary pines. The selected
position remains first in that shortlist. The tree-placement study is described
separately below; pool and trees are not claimed to be a single exhaustive
joint optimization.

The final comparison covers all 92 days from 1 June through 31 August 2026.
It samples 32 equal-area cell centres across each pool at half-hour midpoints
through the entire local civil day. Only above-horizon solar positions enter
the daylight fraction. Each comparison uses 93,472 daytime receiving rays.
The model includes the registered house, resolved neighbouring roof envelopes,
terrain, four-metre hedges, current garden structures and coping, enabled
existing foliage, and the specified specimen trees.

| Pool and planting scenario | Mean direct-sun area-hours/day | Fraction of sampled daylight rays |
| --- | ---: | ---: |
| New transverse pool + new boundary pines | 6.9417 | 43.73% |
| Previous east-side pool + previous Excelsa reference | 4.9336 | 31.08% |
| Previous east-side pool + original broad 10 m pines | 1.0550 | 6.65% |
| Previous east-side pool + new boundary pines | 2.5173 | 15.86% |

The previous pool opening is x = 14.52–18.02 and y = 26.30–34.30 m.
Each previous-pool comparison also uses its previous fire-lounge arrangement,
so the relocated lounge cannot artificially obstruct a hypothetical old pool.

The new pool and boundary pines gain approximately **2.01 direct-sun
area-hours per day, or 40.7%**, over the previous pool with Excelsa.

| Month | New pool + boundary pines | Previous pool + Excelsa |
| --- | ---: | ---: |
| June | 7.5344 h/day | 5.9839 h/day |
| July | 7.2596 h/day | 5.5434 h/day |
| August | 6.0504 h/day | 3.3075 h/day |

“Direct-sun area-hours” averages the sunlit proportion of the water over time.
For example, two hours with half the pool sunlit contribute one equivalent
hour. These numbers do not mean that the entire pool is simultaneously in
sun for that duration. They do not predict clouds, water temperature, reflected
light, or energy yield. The finite grid can miss narrow shadows and small
changes between candidate positions. Existing canopy extents derive from the
documented October 2024 scan; the summer calculation treats enabled foliage
as dense leaf-on obstruction volumes.

## Boundary pines and species changes

The fresh default is three `austrian-pine-tall` specimens with the catalogue
midpoint dimensions: 9.5 m high, 5 m crown diameter, and a 2.5 m crown base.
The earlier pictured reference remains available with its literal 10 m heights
and 6 / 6 / 5 m crown diameters. Restoring the pine species does not silently
assert that those larger crowns are the dimensions of the new default stock.

| Specimen | x | y | Nearest east/rear boundary | Modeled crown overhang |
| --- | ---: | ---: | ---: | ---: |
| Pine 1 | 18 | 35 | 2.3137 m | 0.1863 m |
| Pine 2 | 14 | 36 | 1.9864 m | 0.5136 m |
| Pine 3 | 18 | 28 | 2.3034 m | 0.1966 m |

The placement search is independent for all 14 catalogue options, using each
option's own height, crown base, and crown width. It tests stems on a 0.5 m
grid in the eastern/rear boundary band, 1.1–3.7 m from those boundaries and
at least 1 m from pool coping, fixed spa objects, furniture, and kitchen
footprints. It permits up to 1 m of modeled crown overhang and enforces a
species-dependent minimum stem spacing of 1.5–3 m. The chosen default pine
group has a 2.75 m minimum spacing requirement and 79 feasible candidate
stem positions. Crown overhang is visible and recorded; the drawing does not
establish agreement to grow across a boundary or future maintenance clearance.

A beam search retaining 40 combinations at each step maximizes weighted
PCK3 facade-sample screening, with a small penalty for moving stems farther
from the boundary. The objective is coverage minus 0.012 times mean boundary
distance in metres. Sofa, indoor standing, terrace, and jacuzzi views each
have weight two. Pool, fire lounge, sauna, sunbeds, and dining each have
weight one. Facades are sampled on a 1 m grid. This is a finite search with
ideal dense crowns, not a guarantee of visibility after planting.

| Planting comparison in the same new garden | Weighted PCK3 sample screening |
| --- | ---: |
| No specimen trees | 63.09% |
| Previous Excelsa at reference positions | 70.76% |
| Same 9.5 m / 5 m pine stock at old positions | 93.32% |
| New 9.5 m / 5 m boundary pines | 93.78% |
| Original wider 10 m / 6–6–5 m pictured pines | 95.98% |

These percentages include the other modeled blockers. They are not the
percentage hidden by the three trees alone. For the same pine stock, moving
the stems improves the weighted result by 0.46 percentage points. The wider
original stock screens more overall, at the cost of larger assumed crowns.

For the proposed default, the per-view results are: sofa 100%, indoor
standing 100%, terrace 90.59%, jacuzzi 91.76%, pool 79.81%, fire lounge 95%,
sauna 100%, sunbeds 82.19%, and dining 97.46%. Smaller and narrower species
remain valid one-click alternatives, but cannot promise equivalent screening.

Changing the three-tree species dropdown in the summer garden immediately
loads that species' calculated positions and dimensions. No reset is needed.
Manual edits stay in place until another species is selected or the explicit
placement-restoration action is used. A single selected-tree replacement
keeps its manual position. Historical shared layouts retain their literal
coordinates; the new presets do not rewrite them.

## Rendering and optional alternatives

Pine trunks and branches now use metre-based cylindrical texture coordinates.
The trunk silhouette has additional radial/vertical detail, shallow furrows,
and specimen-specific curvature while staying inside its analytical envelope.
The shared bark material loads the vendored photographic Poly Haven
[`pine_bark`](https://polyhaven.com/a/pine_bark) albedo, normal, and roughness
maps at their documented 2 m physical scale. Attribution, hashes, and delivery
details are recorded in the [material manifest](../assets/materials/manifest.json)
and [material notes](../assets/materials/README.md). Branching and foliage
remain modeled geometry, rather than surveyed copies of particular trees.

The optional pavilion has its own pool arrangement. Broad boundary pines
conflict with that building, so the conflict remains visible and an explicit
“Use pavilion planting · Excelsa trio” action installs the checked narrower
reference layout. Enabling a pavilion never silently changes planting.
The earlier optional pergola is off in the fresh garden; applying its old
placement correctly warns that it overlaps the summer pool. That customized
structure must be repositioned before treating it as a compatible alternative.

## Reproduce and inspect

From the `garden-lab` directory, run:

```sh
node scripts/optimize-summer-garden.mjs
node scripts/optimize-boundary-trees.mjs
node scripts/verify-summer-pool.mjs
```

The scripts use `garden-study-support.mjs` to register the same data as the
app and record source-file SHA-256 hashes and the encoded state in each
result. They write:

- [Candidate pool search](../data/summer-pool-search-1.34.json)
- [Species placement search and screening baselines](../data/boundary-tree-search-1.34.json)
- [Horizontal-water shortlist and all 92 daily comparisons](../data/summer-pool-verification-1.34.json)

The runtime coordinates are in `src/summer-garden.js`. The reproducible
search is an audit of those chosen defaults, not an optimizer run in the
browser every time a control changes. Geometry, catalogue, or observation
changes require rerunning the study and reviewing the defaults.
