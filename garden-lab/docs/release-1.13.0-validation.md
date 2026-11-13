# Release 1.13.0 validation

Checked on 13 November 2026. This release implements the user's reference-directed pine screen and extends thujas along the complete plot perimeter. The final arrangement improves the living-room and jacuzzi views; it does not promise that PCK3 disappears from every garden position.

## Automated and independent checks

- `npm test`: **307 passed, 0 failed**.
- `npm run build`: successful; **44 static assets**.
- Final pines: **(17.00, 26.80), (14.40, 28.40), (12.60, 32.70) m**; all retain the catalog 9.5 m height and modeled 5 × 5 m crown.
- The nearest/centre trunks are **3.053 m** apart; the second crown link is **4.662 m**. Every complete modeled crown stays inside the parcel.
- Nearest hardscape gaps are **1.02 / 1.52 / 1.38 m**. All named observers stay at least 1 m from trunk centres.
- The 6 × 3.5 m pool retains **1.231 m** from outer coping to house and **1.02 m** from far coping to the forward pine.
- The full planted hedge length is **107.271328 m**, requiring **137 thujas** at 0.8 m centres with per-span rounding. Front-side extensions remain at original grade; all four default heights are 4 m. The proposed pedestrian and vehicle openings stay clear.
- Historical state versions, pool geometries and tree arrays remain explicit. Schema v15 records the full-perimeter flag; existing v14 designs retain their prior planting.

The dense façade audit was independently generated and then compared with `analyzeFacadeVisibility`; every selected-view result matched. The new regression suite freezes the rejected preliminary layout that returned zero coarse façade samples while exposing a visible window gap. It also checks the upper wall band, retained blockers, building adjustments and unavailable-result handling.

## Hosted WebGL review

Final code preview: `review-aligned-perimeter-v1-13b/`, Pages commit **90cd25040dde46aff1ae0fceea2d771c746f8896**, [successful Pages run 43457849425](https://github.com/PawelTroka/TROKA.Software.SmartHouse/actions/runs/43457849425).

The connected Brave browser loaded version **1.13.0**, programme `spa-aligned`, the enabled full-perimeter switch, **137 trees / 107.3 m**, and a displayed budget of **804,300–1,384,700 PLN**. The scene used the actual Three.js WebGL canvas, not the SVG fallback. The hosted dense façade readout matched the independent results when switching between the living-room, jacuzzi, garden and sunken-lounge presets. The front preset correctly replaced the rear-building comparison with its street-screen explanation.

| Fixed viewpoint | Visible dense façade points | Visible roof samples |
|---|---:|---:|
| Living room seated | 49 / 5,214 | 5 / 365 |
| Living room standing | 63 / 5,214 | 8 / 365 |
| Jacuzzi seated | 572 / 9,702 | 4 / 365 |
| Garden standing | 493 / 5,214 | 115 / 365 |
| Sunken lounge seated | 1,339 / 5,214 | 157 / 365 |

The living-room and seated jacuzzi images were visually inspected. The connected crowns now cover most of PCK3's face, with small gaps and roof/edge slivers still visible. The rear garden viewpoint remains exposed and sits close to the rear trunk; that result is position-sensitive and includes trunk screening. The sunken-lounge readout also retains significant exposure. The scene, labels and documentation do not call these views completely screened.

The dimensioned Whole plot plan was inspected for hedge continuity beside the house, front access gaps, pool dimensions, tree arrangement and full boundary measurements. Its lengths are front **14.12 m**, left **36.89 m**, right **37.21 m**, rear **19.06 m**.

## Recorded renderings

- [Seated jacuzzi view toward PCK3](../aligned-pck3-jacuzzi-1.13.0.png): same final tree coordinates and geometry, actual 0.70 m seated eye height, yaw −25° to face PCK3, dimension overlay hidden for clarity.
- [Dimensioned Whole plot plan](../full-perimeter-plan-1.13.0.png): the same final geometry, including front and complete side hedges.

These are direct browser viewport captures. The candidate geometry was first visually checked on the earlier hosted preview via its ordinary share-state URL, then the identical final defaults and updated dense readout were verified on the final-code preview above. Observer coordinates, building heights and tree stock sizes were not changed to improve a screenshot.

## Budget and limits

The complete planning range is **804,296.46–1,384,672.24 PLN**, with the 20% uncertainty allowance applied once to the upper total. Hedge supply, planting and shared delivery total **52,375 PLN** before contingency. The price catalog and itemised planning allowances remain visible; no new site-specific supplier quotation was received in this release.

Façade and roof samples are deliberately separate because their densities differ. Counts are not visible-area percentages or guarantees about branch gaps. The named garden and sunken-lounge positions are more exposed than the former rear cluster; this is documented in the [full comparison](aligned-grove-screening-comparison.md), rather than hidden by a combined roof-heavy percentage.
