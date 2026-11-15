# Garden Lab 1.18.0 — Nadmorska 17

## Source and scope

Nadmorska 17 in Gdańsk Jelitkowo is a third independent property. Its plot combines the official ULDK polygons for `226101_1.0008.135/8` and `226101_1.0008.136/2`, without resizing to match the advertised area. The official mapped union is 709.29 m²; the 800 m² listing and earlier 809 m² manual outline remain separately labelled.

The dataset contains the irregular 168.85 m² house footprint, 52 surrounding buildings, native 1 m terrain, and class-6 LiDAR roof samples for the house and five privacy targets. Source coordinates, source file hashes, selected roof-return counts and the reproducible generator are included. The temporary LoD1-only construction file is not part of this release.

The model's garden axis is northwest; its main street is to the right/northeast. Ground-level and upstairs street viewpoints use that actual side. Side-entrance gaps are omitted from both rendered and analytical hedge spans. The opposite boundary is labelled as a neighbour boundary rather than a street. Upper tower views are concepts; floor rises and window locations are not surveyed.

## Automated verification

`npm test`: **418 passed, 0 failed** on the final data and release source. This includes 23 new tests for property registration and state isolation, cadastral/building source anchors, fitted pool/terrace/jacuzzi/stairs/furniture, side-facing upstairs observers, clear side gates, numerical dimensions, sunlight and visibility, night fixtures and property-specific budgeting.

`npm run build` succeeds. Source JSON release gates require complete LiDAR evidence. All earlier Sternicza/Korzeniowskiego tests pass, including schema-19 migrations and historic share links. The new property has no copied Sternicza specimen trees, detached-garage demolition, sauna, plunge or sunken-lounge charges.

The initial complete Nadmorska garden planning range is approximately 398,000–734,000 PLN, with the upper uncertainty allowance applied once. It is a planning range with product benchmarks, not a received project quotation. The pool requires services verification; the mapped ks200 route is disclosed, and unpriced utility diversions are not implicitly included.

## Browser verification

The hosted preview was inspected in the supported cloud browser. Nadmorska appears alongside Sternicza and Korzeniowskiego, with its own location, plot-area discrepancy, source information and budget. The mapped house, tower roof, pool, terrace, full-perimeter hedge and surrounding buildings render in the lightweight SVG fallback used by that browser.

Manual interactions confirmed:

- First-floor street standing looks toward Nadmorska, at a 6.15 m eye elevation above the original garden reference. The right-side hedge and two proposed gate openings are described correctly.
- Tower-concept garden seated uses an 8.70 m eye elevation and the northwest garden direction. The assumed floor rises and unsurveyed window positions remain explicit.
- Preview night selects 23:30; neighbouring windows can be switched off while garden lights remain enabled, and restored independently.
- Whole-plot mode displays the actual irregular cadastral boundary, entry-side street, neighbour-side boundary, 3 × 7 m pool and linked dimension schedule. The desktop page fits its viewport.

The CI browser harness exercises the actual WebGL renderer, property switching, Nadmorska day/night views, the side-facing upstairs preset, independent lighting controls, a rendered pool-light pixel comparison, plot dimensions and a 390 px mobile viewport. It saves day, night and plan screenshots as the `garden-lab-browser-evidence` artifact. The hosted cloud inspection uses SVG, so it is not evidence of WebGL surface-light or shadow quality. The browser job is the release gate for those rendering checks.

## Release references

- Source and CI results: [PR #17](https://github.com/PawelTroka/TROKA.Software.SmartHouse/pull/17).
- Property entry point: [Nadmorska 17](https://paweltroka.github.io/TROKA.Software.SmartHouse/?site=nadmorska-17).
- Dataset provenance and limitations: [Nadmorska site model](nadmorska-site-model.md).

The production static build uses coordinated `1.18.0` module cache keys. Saved designs remain isolated by property and schema-19 links remain readable.
