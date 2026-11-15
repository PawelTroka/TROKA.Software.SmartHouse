# Garden Lab 1.18.0 — Nadmorska 17

## Source and scope

Nadmorska 17 in Gdańsk Jelitkowo is a third independent property. Its plot combines the official ULDK polygons for `226101_1.0008.135/8` and `226101_1.0008.136/2`, without resizing to match the advertised area. The official mapped union is 709.29 m²; the 800 m² listing and earlier 809 m² manual outline remain separately labelled.

The dataset contains the irregular 168.85 m² house footprint, 52 surrounding buildings, native 1 m terrain, and class-6 LiDAR roof samples for the house and five privacy targets. Source coordinates, source file hashes, selected roof-return counts and the reproducible generator are included. The temporary LoD1-only construction file is not part of this release.

The model's garden axis is northwest; its main street is to the right/northeast. Ground-level and upstairs street viewpoints use that actual side. Side-entrance gaps are omitted from both rendered and analytical hedge spans. The opposite boundary is labelled as a neighbour boundary rather than a street. Upper tower views are concepts; floor rises and window locations are not surveyed.

## Automated verification

`npm test`: **418 passed, 0 failed** on the final data and release source. This includes 23 new tests for property registration and state isolation, cadastral/building source anchors, fitted pool/terrace/jacuzzi/stairs/furniture, side-facing upstairs observers, clear side gates, numerical dimensions, sunlight and visibility, night fixtures and property-specific budgeting.

`npm run build` succeeds. Source JSON release gates require complete LiDAR evidence. All earlier Sternicza/Korzeniowskiego tests pass, including schema-19 migrations and historic share links. The new property has no copied Sternicza specimen trees, detached-garage demolition, sauna, plunge or sunken-lounge charges.

The initial complete Nadmorska garden planning range is approximately 398,000–734,000 PLN, with the upper uncertainty allowance applied once. It is a planning range with product benchmarks, not a received project quotation. The pool requires services verification; the mapped ks200 route is disclosed, and unpriced utility diversions are not implicitly included.

## Visual review and publication

Hosted preview review and production publication are being completed. This record will be updated with observed results before release handover.

The local browser was not used for visual evidence. The connected Browser extension was unavailable in this session; the supported cloud-browser fallback is used for the hosted review. No browser security restrictions were changed.
