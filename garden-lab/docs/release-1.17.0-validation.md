# Garden Lab 1.17.0 — night lighting and upper-floor views

## Scope

- Add a solar-elevation-driven evening garden-lighting scenario and deterministic neighbouring-window activity, including across the street.
- Preserve the observed windowless garden elevations of building 4h.
- Add eight first-floor/strych garden/street seated/standing observer presets.
- Make the assumed upper floor rises editable and preserve schema 18 layouts in schema 19.
- Keep the current tree placement, 9 m Excelsa defaults, pool, hedge geometry and costs.

## Model assumptions

First-floor and attic floor rises are initially 3 m and 6 m above the living floor. Window viewpoints use the mapped front/rear façade plus 0.25 m outward clearance, before actual glazing, frame or dormer restrictions. Sitting and standing eye offsets are 1.20 m and 1.65 m. These are editable design assumptions, not a measured room survey.

Artificial-light controls represent relative visual brightness. Occupancy is a stable illustrative subset of procedural window placements; it is not observed occupancy. Lights fade with solar elevation from +1° to −6°. No artificial lights receive analytical screening credit. The bounded light budget is at most 12 actual lights and 3 spotlight shadow maps in the current Sternicza layout.

## Observed verification — 15 November 2026

- Full Node test suite: **395 tests passed, 0 failed, 0 skipped** (approximately 5.2 seconds).
- Static build: **53 assets**, successful.
- All new UI hosts/controls exist in the HTML; no duplicate static IDs.
- New test coverage includes all eight upper viewpoints, posture/level geometry, both properties, correct direction and house obstruction, floor independence from garden fill, schema 19 round trips, preserved v18 trees/quotes, solar-elevation activation in summer/winter, independent switches/dimmers, deterministic and monotonic window selection, the two blank 4h façades, and finite bounded fixture construction.
- Changed JavaScript source was syntax-checked; repository imports consistently use the 1.17.0 cache version.
- Files recovered after a workspace outage were checked against their exact Git blob hashes before local verification.

The first full run found one stale test expectation for schema 18 in front-state.test.mjs. Updating that expectation to the intended schema 19 produced the clean 395-test result.

## Browser and publication limitations

The local browser regression could not launch Chromium. The process reported a socket operation denied by the execution environment before any page opened. The connected Browser tool also timed out. No browser security or execution restrictions were bypassed.

The read-only GitHub PR workflow runs the complete test suite and build, then a real Chromium WebGL regression with screenshots. Its script exercises the eight presets, floor calibration, independent lighting controls, actual window-activity render differences, night/day restoration, reload/share persistence and mobile overflow. At handover, GitHub had not begun the queued jobs, so this planned browser coverage is **not a passed result**.

No successful visual night-scene review or live deployment result is claimed in this record. The code and static build are ready; consult the current [PR #16 checks](https://github.com/PawelTroka/TROKA.Software.SmartHouse/pull/16/checks) and [Pages deployments](https://github.com/PawelTroka/TROKA.Software.SmartHouse/actions) for subsequent execution/publication status.
