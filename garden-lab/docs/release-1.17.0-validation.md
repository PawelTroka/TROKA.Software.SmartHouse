# Garden Lab 1.17.0 — night lighting and upper-floor views

## Scope

- Add a solar-elevation-driven evening garden-lighting scenario and deterministic neighbouring-window activity, including across the street.
- Preserve the observed windowless garden elevations of building 4h.
- Add eight first-floor/strych garden/street seated/standing observer presets.
- Make the assumed upper floor rises editable and preserve schema18 layouts in schema19.
- Keep current tree placement, 9m Excelsa defaults, pool, hedge geometry and costs.

## Model assumptions

First-floor and attic floor rises are initially3m and6m above the living floor. Window viewpoints use the mapped front/rear facade plus0.25m outward clearance, before actual glazing/frame/dormer restrictions. Sitting/standing eye offsets are1.2m/1.65m. These are editable design assumptions, not a measured room survey.

Artificial-light controls represent relative visual brightness. Occupancy is a stable illustrative subset of procedural window placements; it is not observed occupancy. Lights fade with solar elevation from+1° to−6°. No artificial lights receive analytical screening credit. The finite light budget is at most12 actual lights and3 spotlight shadow maps on the current Sternicza layout.

## Verification status

Focused upper-view geometry/orientation checks (36), upper-floor state checks (6), and the first7 lighting tests passed locally before the execution environment disconnected. A final fixture-budget test was added, but its final local result and full-suite completion were not observed. Files were reconstructed from their exact applied patches against main1970bf9 after the outage.

The release is undergoing repository CI validation, including the full Node test suite, the static build and Chromium WebGL interaction/screenshots. The final observed results will replace this provisional status before publication.
