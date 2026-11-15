# Garden Lab 1.19.0 — Garden pendant lighting

## Design

Three woven-style pendant shades hang at staggered heights over the outdoor dining area. Each shade has a visible open weave, warm inner diffuser, suspension cord and independent support frame. Small hanging lanterns follow the garden-facing sides of actual planted hedge segments. Their thin posts and arms support the fittings independently of living foliage; cables do not bridge gate openings.

The placement module uses the active property's polygon, ground/floor elevations, dining furniture, hedge spans and obstacles. It skips house/garage footprints, pool coping, jacuzzi and spa structures, stairs, tree trunks and unsuitable low hedges. Fittings do not move planting or garden objects and receive no numerical privacy or solar-screen credit. Current defaults have three garden pendants each and 24 / 7 / 24 hedge lanterns for Sternicza / Korzeniowskiego / Nadmorska respectively.

## Controls and compatibility

Garden pendants default to 65% and Thuja-side lanterns to 55%. They have independent switches and dimmers under the existing Garden lights master switch. Landscape accent brightness remains the existing channel for tree/path/terrace/water lighting; neighbouring windows remain independent. Every group follows the same smooth solar-elevation twilight fade.

Schema 19 stays compatible. Missing optional light fields receive the new defaults, while explicit off states, existing light settings, tree coordinates, terrace/pool geometry, floor levels and viewpoints are retained. New controls survive saves, share links and exports. A switched-off lamp remains an installed fitting, so its cost and support geometry remain present.

The garden-lighting budget adds the illustrated pendant counts to its existing 12-fitting baseline, using the unchanged generic 700–1,500 PLN installed allowance. The scope explicitly says that no pendant or support-frame supplier quotation has been received and requests a complete installed quote; it is not a product-specific price promise. Complete quote overrides still replace the whole line once.

## Verification

`npm test`: **437 passed, 0 failed**. New checks cover all three properties, fixtures and supports inside valid garden geometry, access gaps, raised ground, low/removed hedges, trunk collisions, independent lighting channels, saved-state compatibility, the SVG fallback, bounded GPU lights and budget quantities/quote replacement. Earlier front/perimeter budget tests now include the corresponding additional hedge lanterns while protecting all unrelated budget lines. Keeping Sternicza's garage now hides the dining pendants together with the dining furniture; a regression protects that optional layout while retaining clear hedge lanterns.

`npm run build` succeeds. Module cache keys and application metadata use 1.19.0.

The WebGL browser release gate checks actual warm pixel changes from each new channel with landscape accents off, independent switches, the garden master switch, share/reload of edited brightness and an explicit off state, unchanged non-lighting settings, and daytime deactivation. It captures `nadmorska-pendants-night.png` alongside the existing daylight, night, plan and mobile evidence. The existing browser checks cover all three properties and upstairs views. Cloud-browser review may use the lightweight SVG fallback; surface illumination is checked in the real WebGL CI renderer.

The initial [WebGL CI run](https://github.com/PawelTroka/TROKA.Software.SmartHouse/actions/runs/43738060480) passed all **20 browser checks**, with no console or unhandled JavaScript errors. Its rendered night screenshot was visually reviewed: the three dining shades, illuminated table and inner-hedge lanterns are visible. The final garage-visibility correction adds one automated regression; current CI and publication status are recorded in [PR #18](https://github.com/PawelTroka/TROKA.Software.SmartHouse/pull/18).

Surface-light count remains capped at 19: at most 12 existing lights, three garden pendants and four hedge lights. The other hedge lanterns still show their luminous cores and soft halos. The simulation is an illustrative lighting comparison, not a lux calculation, electrical plan or support-structure design.
