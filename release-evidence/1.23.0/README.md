# Garden Lab 1.23.0
Released for Sternicza 11 on 18 November 2026.

## Requested changes
- Terrace depth starts at 4.0 m.
- Jacuzzi infinity/overflow is enabled.
- Canopy is enabled, with a 3.0 m underside height and 4.0 m projection.
- Pool eye-level viewpoint starts 0.15 m above the rendered water; the offset is editable.
- The optional basement garage uses two 2.90 m lanes, a 5.80 m clear entrance, and a 6.60 m vehicle gate.
- The supplied street photograph informs the front cross-gable, finishes, raised brick basement, windows and entrance.
- The front thuja planting has only pedestrian and vehicle access openings.
- A 34 m² first-floor balcony can replace the canopy and adds its own standing viewpoint.

## Model assumptions
The canopy is the default. The basement remains optional. Balcony construction, its access door, the widened basement opening and revised entrance stairs are proposed changes.

The garage uses the full 9.13 m mapped front approach plus a 2.00 m continuation inside the house. The default street-to-basement drop is 1.40 m with a maximum ramp gradient of 25%. The two closed-car envelopes have 395 mm between mirrors and outside walls and 790 mm between mirror envelopes. The complete forward and reverse sweep gives about 41.25 mm minimum underside clearance after a 1 mm numerical allowance; the selected planning reserve is 30 mm. Actual basement structure and levels, the street turn, drainage thresholds and scissor-door motion are not verified by this model.

The balcony deck is 3.0 m above the terrace at the default first-floor setting; clear heights are 2.75 m below the slab and 2.51 m below the front beam. Its guards are 1.10 m high. A separate installed-quote field replaces the canopy allowance. Zero is unquoted, not free.

The photographed front gable is an explicit local override of conflicting roof samples. Its dimensions and window positions are estimates; the corrected visible roof and shade geometry agree.

Older saved designs retain their old defaults. Use the fresh v23 links or reset Sternicza to see the revised defaults.

## Evidence
- PR: https://github.com/PawelTroka/TROKA.Software.SmartHouse/pull/23
- Reproducible dimensions: ../../data/sternicza-refinements-1.23.0.json
- House evidence: ../../data/house-appearance.json
- Browser and test results: verification.json
- Hosted WebGL images: balcony-garden-1.23.0.jpg and two-car-frontage-1.23.0.jpg
