# Garden Lab 1.20.0 — Brighter pendants and a busier evening

## Requested effect

The default night scene now shows more neighbouring windows illuminated and brighter hanging garden lights. The illustrative neighbouring-window activity increases from **35% to 70%**, dining pendants from **65% to 80%**, and inner-thuja lanterns from **55% to 85%**. The existing independent switches and dimmers remain available. Window brightness stays at 60% and landscape accents at 75%.

The occupancy threshold remains deterministic: raising activity adds lit windows without reshuffling those already lit. It uses the same mapped buildings and proposed facade openings, including the recorded blank 4h elevations. This is a visual evening scenario, not measured resident activity.

## Consistent lantern visibility

Previously all woven shades relied on external illumination, although only four hedge lanterns have real surface lights. Every shade now has a warm transmitted-light component controlled by its own lighting channel. Separate pendant and hedge materials use warm `#ffc781` emission at `0.45 × channel strength`. The hedge halo diameter increases from 0.48 to 0.60 m, with opacity scaled by 0.85 instead of 0.65. Dining halo size and nominal spot/point-light power stay unchanged.

The same correction reaches lanterns outside the bounded real-light selection. All shade emission and halos extinguish with their dimmer, group/master switch or daylight. The SVG renderer receives scaled emissive colour because it does not apply emissive intensity. The GPU budget stays capped at 19 real local lights; positions, fixtures, geometry and budget quantities are unchanged.

## Saved designs

Schema **20** records the new starting atmosphere. Versions 19 and earlier retain omitted historical lighting values of 35% window activity, 65% dining pendants and 55% hedge lanterns. Explicit percentages, zero values and switched-off groups survive migration, sharing and reload. Property resolution accepts version 20, and existing non-lighting settings retain their previous migration paths.

For an existing design, its lighting sliders apply the brighter settings without resetting the garden. The direct new-version night links select the new atmosphere explicitly.

## Verification

- **448 automated tests passed**, including all three properties, historical defaults, explicit off/zero settings, future shares, property identity, every shade's independent emission and daylight extinction in both renderers, and the unchanged fixture/light budget.
- The static build succeeds. All module cache keys and application metadata use 1.20.0.
- The browser gate retains the earlier 20 checks and adds a fixed-camera WebGL comparison of 35% versus 70% window activity. It requires more than 50 actual warm pixels to brighten, records the measured change, retains the 70% setting through sharing and captures a busier street view.
- Publication follows the browser gate and a live scene review. The pull request records the executed CI and deployment results.
