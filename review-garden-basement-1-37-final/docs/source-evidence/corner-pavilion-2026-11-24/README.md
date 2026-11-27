# Corner pavilion evidence — 24 November 2026

This bounded bundle supports the [1.32 study](../../corner-pavilion-study-1.32.md). It keeps the final physical analysis, the exact official GIS requests/responses and selected primary-source status fields. It contains no downloaded map imagery or full citywide datasets.

## Files and interpretation

| File | Evidence retained |
|---|---|
| `physical-pavilion-comparison.json` | Final actual-shell analysis with registered house/terrace geometry and the y=24.7 near placement: two placements, four heights, seven eyes. It includes a separate ideal-envelope calculation; do not substitute the latter for shell results. |
| `sternicza-landuse.json` | Combined-plot intersection against current MPZP land-use layer 0: zero features. |
| `sternicza-bounds.json` | Combined-plot intersection against current MPZP boundary layer 1: zero features. |
| `sternicza-app.json` | Combined-plot intersection against the published APP plan layer: zero features. |
| `sternicza-pending.json` | Pending-plans intersection: citywide Plan Ogólny, not an applicable adopted local plan. |
| `sternicza-draft-pog-zone.json` | Revised draft zone attributes. Whole-polygon intersection touches 649SW and 637SW; this alone does not assign the latter's 16 m value to the corner. |
| `sternicza-draft-pog-points.json` | Ten interior/corner point queries: all 649SW, height 12 m, coverage 30%, PBC 50%, intensity 1.5. |
| `sternicza-draft-pog-ouz.json` | Proposed supplementary-development area 138OUZ; draft only. |
| `root-independent-verification.json` | Independent repeat of all three current-plan polygon queries and two draft-zone point queries. |
| `source-snapshot.json` | Retrieval date, model parcel/datum information, selected source status fields, precise official URLs and file hashes. Legal/web fields are a factual research synopsis, not a copy of an enacted decision for this property. |

Every GIS record contains `queryUrl` and the returned `response`; combined-polygon records also retain `input`. Source response fields are preserved. Only public HTTP metadata (date, ETag, content type/length and cache control) is retained where available. Browser/session headers are excluded.

## Exact official services

The [city MPZP dataset](https://ckan.multimediagdansk.pl/dataset/mpzp) and [planning network services page](https://bip.gdansk.pl/zagospodarowanie-przestrzenne/uslugi-sieciowe) identify the official mapping sources.

- Current MPZP land use: `https://geogdansk.pl/server/rest/services/WUiA/MPZP_NA_WMS/MapServer/0/query`
- Current MPZP boundaries: `https://geogdansk.pl/server/rest/services/WUiA/MPZP_NA_WMS/MapServer/1/query`
- Published APP plans: `https://geogdansk.pl/server/rest/services/WUiA/MPZP_APP_GML/MapServer/0/query`
- Revised draft POG zones: `https://brg.geogdansk.pl/server/rest/services/Hosted/AplikacjaPogGdanskProjektDoUzgodnienPoKonsultacjach07102026/FeatureServer/4/query`
- Revised draft OUZ: same feature service, layer `3/query`.

The query is `esriSpatialRelIntersects`, with `inSR=2180`, `returnGeometry=false`, and either the complete recorded polygon or the recorded interior point. The full encoded requests are in the JSON, so the evidence can be replayed without hand-transcribing coordinates.

Combined plot bounds in EPSG:2180 **Easting, Northing**: min `(476049.880342341, 726859.922715501)`, max `(476083.477007224, 726902.760579949)`. These describe the model's combined parcels `.400` and `.401`, not a certified ownership or development-site boundary.

The current official draft app is [Experience e21c8101a4c74ed69065d08644fcd8f0](https://brg.geogdansk.pl/portal/apps/experiencebuilder/experience/?id=e21c8101a4c74ed69065d08644fcd8f0). Its configuration points to webmap `d0cd10214a7343b5b385bc92ee962b2e` and the source labelled `POG_PO_KONSULTACJACH_07102026`. The precise configuration URLs are retained in `source-snapshot.json`. The [BRG publication](https://bip.brg.gda.pl/plan-ogolny-miasta-gdanska) establishes its draft stage.

## Reproduction and limits

Run `node scripts/analyze-corner-pavilion.mjs /tmp/physical-pavilion-comparison.json` from `garden-lab` to reproduce the physical study against the source in the same release. The script calls `applyPlanExterior` before all observer and visibility calculations, matching the registered house and terrace used by the live app. No external query is needed for that calculation. Counts are unweighted target-point sightlines, not image-area fractions or a full privacy assessment. Glass remains transparent; proposed fill does not increase the top height datum.

GIS requests are read-only and date-sensitive. A later response may change as official datasets are revised. Empty spatial results verify what those official layers returned on the check date; they are not a formal municipal certificate. Draft POG parameters and simulator heights do not establish a lawful building envelope. See the study's planning section and linked primary legal texts before reusing a numerical height or setback as a permission claim.
