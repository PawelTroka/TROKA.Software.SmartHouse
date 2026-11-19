## Why
The newly supplied Sternicza 11 drawings contain interior geometry and structural constraints absent from the garden model. The marked renovation needs a faithful comparison with those drawings, including usable room views and the required two-car conversion study.

## What changes
- Add an Interior studio for basement, ground floor, first floor and attic, with original/renovated plans, cutaway WebGL, room viewpoints, furniture, wall-change overlays and 21 finish choices.
- Reconstruct dimensioned rooms, openings, stairs, flues, floor levels and attic trusses. Preserve the original cellar’s brick corridor and earth store floors. Keep printed areas, polygon areas and uncertain source registration distinct.
- Correct the upper bay to its explicitly printed 3.07 × 1.68 m clear size. The proposed wardrobe partition leaves 3.07 × 1.59 m / 4.88 m²; record the remaining main-width dimension-chain discrepancy.
- Implement the owner's open living/kitchen scheme, combined bathrooms, three guest rooms, office, wardrobe, sauna location, large HST and shared balcony. An explicit action transfers the two 10.77 × 4 m decks and three upper doors to the garden.
- Retain two side-by-side Cyberster envelopes. Show the source cellar stair/flue conflict, 1.70 m historical clear height and 0.60 m proposed lowering. Keep external grade independent of the section datum. At the corrected 0.30 m slab allowance, the front-yard-only ramp reports actual modelled underside contact; the interior continuation still flags retained structural obstructions.
- Save/share/compare the new state under schema 26; preserve older settings. Pause the garden renderer and isolate keyboard focus while the interior workspace is open. Ignore floating-point drift in OrbitControls so stationary cameras finish rendering and both viewers become idle. Keep decorative wall art clear of the TV on the same wall panel.

## Evidence and limits
See [drawing review](garden-lab/docs/interior-plan-review-1.26.0.md). The source sheets may be outdated. The compact sauna corner is shallower than the cited cabin; the two new front guest rooms fit single beds. Bath loads, large wall openings and balcony supports require measured structural design. Interior costs are outside the garden budget, and scenery beyond the interior windows is illustrative.

## Validation
Tested source: `5c03e6a8e22f5e8abcc1923227aee9ba57b0575d`. Merged source: `0f6ac891dbfe5320d9f31c62969a6d374617c5a3`.

- **616 unit, geometry and state tests passed**, with no failures, skips or cancellations.
- **63 browser check groups passed**: interior: 8, studio: 12, garden: 35, refinements: 8.
- [GitHub Actions run 44427544268](https://github.com/PawelTroka/TROKA.Software.SmartHouse/actions/runs/44427544268) supplies the four passing browser reports and actual captures.
- Source and evidence manifests preserve commit identifiers, Git blob hashes and SHA256 file hashes.
- Original and renovated floors, room cameras, 21 finishes, saved designs, garden handoff, narrow screens and the existing garden/two-car workflows are represented in the report check lists.

[Hosted release evidence](https://paweltroka.github.io/TROKA.Software.SmartHouse/release-evidence/1.26.0/validation.html)
