# Release 1.12.0 validation

## Requested correction

The nearest pine must be very close to the centre pine. The v1.11 spacing of 8.52 m was inconsistent with that preference.

The new `spa-grove` default puts the nearest trunk at (14.2, 32.5) m and the centre at (13.0, 34.1) m: exactly 2.00 m apart. The outer tree stays at (17.6, 34.9) m. All three nominal 5 m crowns overlap and fit inside the mapped parcel. The 3.5 × 7 m pool returns to y = 24.5 m; its far water edge is 1.00 m before the nearest trunk, with 1.42 m to the coping.

The independent 4 m street hedge, access openings, compact six-person sauna and seven-seat jacuzzi remain enabled. The planning total remains 785,885.15–1,360,869.33 PLN, including the upper 20% uncertainty allowance once.

## Automated checks

`npm test`: **279 passed, 0 failed**. `npm run build`: successful static build.

The checks include exact trunk spacing, crown connections and parcel containment, trunk-to-hardscape gaps, seven actual PCK3 viewpoint counts, and noon sunlight using the shared geometry. State v14 loads the close grove; sparse v13 links and saved designs retain their published pool and trees. Custom positions and explicit empty tree lists remain intact. The historical v1.11 geometry and study checks still pass.

## Hosted preview

Checked the preview at `review-close-grove-v1-12/?site=sternicza-11#v=14&site=sternicza-11` after GitHub Pages preview run 43446334821 deployed successfully.

- Application version: 1.12.0; selected layout: `spa-grove`; scenario: `default`.
- Garden-detail plan shows the connected crowns and **2.00 m / 4.67 m / 4.16 m** trunk spacings.
- Selecting pine 2 shows x = 14.2 m and y = 32.5 m.
- Front hedge control remains 4.0 m.
- Plan schedule shows a 3.50 × 7.00 m pool, a 3.00 × 2.40 m six-person sauna, and a 2.30 × 2.30 m seven-seat jacuzzi with a 3.50 × 3.50 m service envelope.
- Seated living-room PCK3 result: 248 of 420 points visible, matching the new model.
- Displayed planning budget: approximately 785,900–1,360,900 PLN.

The browser provides the app's lightweight SVG renderer; WebGL shadows were not visually tested. Plan dimensions, analytical visibility and sunlight calculations were checked. The screenshot is [close-pine-grove-plan-1.12.0.jpg](../close-pine-grove-plan-1.12.0.jpg).

The [comparison](tight-grove-screening-comparison.md) records the reduced living-room screening honestly. Close crown overlap is conceptual; actual nursery root balls and branches need confirmation before planting.
