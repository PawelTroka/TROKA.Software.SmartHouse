# Pavilion height and direct sunlight · 1.32.0

This is a comparison of the same alternative garden at 6.5 m and 8 m pavilion heights, using source commit `5ca6301ce7181fe4eda66564828fc576b89fce63`. It follows the live registered Beach House model, with a 4 m balcony, 4 m hedges, three proposed 9 m Excelsa trees and all 490 measured canopy groups. Times below are local Gdańsk time.

Each entry gives sunlit sample counts at **6.5 m → 8 m**. These are snapshots on the simulator's 1 m outdoor grid, not measured area, irradiance, daily sunshine hours, indoor daylight or a regulatory assessment.

| Placement | Moment | Garden | Terrace | Pool |
|---|---|---|---|---|
| Rear/east | 21 June, 09:00 | 89/266 → 84/266 | 14/40 → 14/40 | 29/32 → 24/32 |
| Rear/east | 21 June, 12:00 | 134/266 → 131/266 | 11/40 → 11/40 | 32/32 → 32/32 |
| Rear/east | 21 June, 18:00 | 13/266 → 13/266 | 13/40 → 13/40 | 0/32 → 0/32 |
| Rear/east | 21 December, 12:00 | 1/266 → 1/266 | 2/40 → 2/40 | 0/32 → 0/32 |
| Near former garage | 21 June, 09:00 | 80/266 → 79/266 | 14/40 → 14/40 | **22/32 → 8/32** |
| Near former garage | 21 June, 12:00 | 125/266 → 120/266 | 11/40 → 11/40 | 32/32 → 32/32 |
| Near former garage | 21 June, 18:00 | 10/266 → 10/266 | 13/40 → 13/40 | 0/32 → 0/32 |
| Near former garage | 21 December, 12:00 | 1/266 → 1/266 | 2/40 → 2/40 | 0/32 → 0/32 |

The strongest height trade-off is morning pool sun. At the near placement, the extra 1.5 m shades 14 additional pool samples at 09:00, reducing their sunlit fraction from 68.8% to 25.0%. The rear placement loses five pool samples at that moment. Every newly shaded sample is traced to pavilion construction. Terrace sample counts are unchanged between these two heights at the four tested moments.

**Design interpretation:** start the near-house architectural study at 6.5 m if morning swimming and sunlit water matter. The increase to 8 m has a specific terrace-screening benefit, which can be weighed against this additional morning shade. Both heights remain unapproved studies.

Receiver coordinates and zone assignments are identical between heights within each placement. The placements have different garden receiver locations; their garden totals do not measure precisely the same ground points. Pool edge cells use points within the clipped water portion and are counted equally; 32 sample cells do not mean 32 m² of water.

June uses the model's leafy canopy envelopes. December removes opaque credit from the existing deciduous crowns; bare branches are not modelled. Evergreen proposed trees and hedges remain. Cloud, diffuse/reflected light, glazing transmission losses and unrecorded vegetation are excluded.

[Complete settings, input hashes, solar angles and blocker evidence](daylight-comparison.json) · [Reproducible script](analyze-daylight.mjs)

To reproduce, check out the pinned source commit and run `node analyze-daylight.mjs /absolute/path/to/checkout/garden-lab`. The script verifies the source head and clean inputs before calculating.
