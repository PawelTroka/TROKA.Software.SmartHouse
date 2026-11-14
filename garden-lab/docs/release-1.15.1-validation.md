# Garden Lab 1.15.1 validation

Checked 14 November 2026. State schema remains 17. Reference tree geometry, current 8 m pool, full-perimeter hedge, surveyed-source buildings and the user-observed blank 4h elevation are unchanged.

## Why this release exists

The supplied tree-reference image matches the source's reference coordinates. The UI previously allowed custom planting to remain when changing garden programmes, and an earlier versioned URL hash could supersede newer locally saved planting on reload. The new explicit reference action updates both saved state and the URL, displays matching status and coordinates, and opens the dimensioned whole-plot plan.

The attachment comparison is recorded in [the reference audit](reference-placement-verification-2026-11-14.md). This identifies a real possible stale-link mechanism without claiming that we observed the user's specific prior state.

## Automated and source checks

- Full `npm test`: **351 tests passed, 0 failed**.
- `npm run build`: completed successfully; **47 public assets**.
- The three new tests verify geometry application, preservation of compatible custom specimen prices and other settings, immutable reference records, match-status semantics, historical programmes and the shared-state round trip.
- The reproducible [15-case analysis](edge-screening-analysis-2026-11-14.json) verifies the raised-ground height datum, complete extra-tree envelope checks, ideal-screen residuals and comparison results.
- The 13.2 m opaque-boundary case is explicitly hypothetical; the conifer row is explicitly schematic. Neither is a supplier-verified plant model or an applied default.

## Hosted browser verification

Preview: `review-reference-apply-1-15-1/`, with storage isolated from production.

1. Opened a v16 shared link selecting `spa-corner`, 3.7 m rear hedge and a 190,000 PLN pool amount. UI correctly identified a linked design whose trees differ from the picture.
2. Clicked **Apply pictured tree positions**. The UI displayed the exact three coordinate pairs and 10 m height for all trees, a whole-plot plan and dimensions. The historical **3.5 × 6.0 m pool**, 3.7 m hedge and 190,000 PLN amount remained selected.
3. Reloaded the corrected link. Matching status, the six-metre pool and those entered amounts persisted. A brief initial navigation delay was resolved by reading the completed page; no repeat action was needed.
4. Opened the current v17 default with the **3.5 × 8.0 m pool**. Changed one tree's height to 9 m and its price to 42,000 PLN. The status correctly identified a custom difference.
5. Applied the reference, then reloaded. All three pines returned to the pictured geometry at 10 m; the eight-metre pool and compatible 42,000 PLN specimen price persisted.
6. Returned to the current catalogue-based reference. The model showed the full-perimeter hedge and budget approximately **802,900–1,382,100 PLN**. The new action and coordinate table were visually reviewed in the [plan screenshot](../reference-placement-1.15.1.jpg).
7. Checked the terrace eye-level WebGL view. The displayed PCK3 result remained **216 / 5,214 façade samples exposed** and **52 / 365 roof samples exposed**, confirming that the reference action does not fabricate complete screening. The [terrace image](../reference-terrace-1.15.1.jpg) also shows the retained blank 4h wall. The browser reported no console errors.

## Research deliverables

- [Geometry, conclusions and 15-case comparison](perimeter-screening-study-2026-11-14.md).
- [Trees, immediate screening alternatives, nursery prices and procurement requirements](research-edge-screening-trees-2026-11-14.md).
- [Blank 4h wall treatments, costs and ownership considerations](research-4h-wall-options-2026-11-14.md).

No suppliers were contacted or orders placed. Published prices are not presented as received site-specific quotes. New stock leads are not silently added to the reference budget.
