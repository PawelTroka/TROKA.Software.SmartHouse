# Garden Lab 1.15.0 validation

Validated on 14 November 2026. The release implements the user's reference pine positions, all three trees at 10 m, a pool moved alongside the grove and lengthened to 8 m, and the blank garden-facing wall of building 4h.

## Automated and source checks

- `npm test`: **348 passed, 0 failed**.
- `npm run build`: succeeds; **46 public assets**.
- Every built public asset's Git blob SHA matches the corresponding reviewed source file. The release changes no vendor dependency.
- New layout tests reproduce the screenshot's approximate tree spacings, all three 10 m heights, 6 / 6 / 5 m crowns, explicit crown-overhang warnings and the roughly 1 m trunk-centre to full-coping concept allowance.
- Pool water, basin, coping, terrain openings, dimensions, shade receivers and quantity-based garden costs use the same 8 × 3.5 m footprint at local (14.52, 26.30) m.
- Dense PCK3 wall results and the separate 365-point roof result are checked from every named view. Additional dining exposure and the June 21 pool-shade tradeoff are recorded in the geometry study.
- Schema 17 gives new designs the reference arrangement. Schema 16 and earlier links and stored designs retain their historical geometry, custom tree arrays, hedge settings, viewpoints and entered prices.
- Original mapped building records, plot geometry and analytical terrain retain their audited hashes. Building 4h's window observation is separate metadata.
- Building 4h tests remove the nine previously invented panes and associated finish placements from its two garden-facing wall segments, preserve other elevations, work with either footprint winding and cannot suppress another official building.
- Live tree labels use the configured height. Catalog stock descriptions retain their documented midpoint and size band.

## Hosted browser verification

Preview: `review-reference-pool-1-15/`, version **1.15.0**, schema **17**. Pages workflow **43538888111** completed successfully for preview commit `586c37d7ae4a3775030c2da21a311ebbc4590deb`.

Verified in the connected Brave browser using the rendered WebGL application:

1. Fresh schema 17 opens **Reference pines + longer pool · latest**, with three **10 m** tree labels and the reference default scenario.
2. The whole-plot plan shows the **3.50 × 8.00 m** pool, three 10 m trees at the rear/east edge, all four perimeter hedges, clear front openings and updated distances. Coping gaps to trunks read about **1.00, 1.30 and 1.00 m**; the east plot gap is **2.00 m**, and the lounge gap **1.36 m**.
3. The terrace view shows the pool beside the forward pine and close to the rear pair. Tree crowns, boundary overhang and the remaining PCK3 roof exposure are visible.
4. The living-room readout reports **503 / 5,214** exposed façade points and **105 / 365** exposed roof points. The terrace reports **216 / 5,214**, roof **52 / 365**. The jacuzzi reports **322 / 9,702**, roof **51 / 365**.
5. Selecting **Building 4h · right/west neighbour · garden wall without windows** and looking at it shows a blank garden-facing elevation. The inspector explains that its **1,672 / 3,239** visible points measure exposed wall surface, not windows. Other elevations remain illustrative.
6. The budget displays approximately **802,900–1,382,100 PLN** after UI rounding. The underlying range is **802,926.00–1,382,131.24 PLN**. The whole-pool installed allowance is still **150,000–230,000 PLN**, with a revised project quote required.
7. Browser error and warning logs are empty during the preview checks.

## Captured evidence

- [Whole-plot plan](../reference-pool-plan-1.15.0.png)
- [Terrace view](../reference-pines-terrace-1.15.0.png)
- [Jacuzzi looking toward PCK3](../reference-pines-jacuzzi-1.15.0.png)
- [Building 4h's blank garden wall](../building-4h-blank-wall-1.15.0.png)

## Limits kept visible

The screenshot establishes the intended arrangement, not surveyed planting coordinates. Crown overhang is approximately 2.00 m east for Tree 1, 0.81 m rear for Tree 2 and 0.64 m east / 0.16 m rear for Tree 3. The 1 m trunk-centre to coping allowance is conceptual; actual root balls, excavation and supplied crown shapes require project confirmation. Screening assumes dense configured crown envelopes. PCK3 roof areas and dining views remain exposed, and the pool is much more shaded at midday. No new supplier or contractor quotation was obtained for this geometry revision.

Full results: [Reference layout, clearances, PCK3 views and sunlight](reference-pool-screening-comparison.md).
