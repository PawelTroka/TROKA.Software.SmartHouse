# SmartHouse 1.36 — fullscreen, connected kitchen and a more open garden

This update develops the Sternicza renovation around the requested layout: a connected kitchen peninsula, a lighter stair enclosure, a pool along the left garden boundary and a central fire lounge. All **34 renovation styles** use the revised kitchen and stair arrangement with their own finishes. **Current** continues to show the original interior. Fullscreen is available in both model workspaces.

## Fullscreen controls

Choose **Fullscreen** in the main model toolbar or the interior studio header. The selected workspace expands to fill the display using the browser's native Fullscreen API when available. If that API is unavailable, restricted or rejected, the same control provides an expanded view that fills the browser window.

Choose **Exit fullscreen** or press **Esc** to return. Exiting fullscreen preserves the active model and walking session; it does not also leave the walker. The main view, interior floor plan, dollhouse and eye-level handoff use the existing canvases and resize them for the available space. Moving between the interior studio and the shared house-and-garden walker keeps the expanded presentation.

The exit control remains available in the expanded workspace. Keyboard focus stays within that workspace while it is expanded, and the view restores its normal layout when closed. The existing walking, touch and height controls remain available; the comfortable movement settings and free exploration introduced in [1.35](comfortable-exploration-1.35.md) continue unchanged.

## Connected kitchen and a wider entrance

The right side means the sink-side run when looking into the kitchen from living/dining. The peninsula now joins that run, closing the former gap between the two pieces of furniture. The free end beside the refrigerator retracts to open the entrance.

| Element | Revised model |
|---|---|
| Peninsula | **2.20 × 0.85 m**, including the span connected to the side run |
| Refrigerator-side free end | Retracted **0.55 m** from its previous position |
| Entrance beside the concealed chimney | **1.18 m** clear between the peninsula tip and the modeled enclosure envelope |
| Living/dining opening | Existing **3.65 m** architectural opening retained |
| Sink window | One **1.42 m** window on the side-garden elevation |

The 2.20 m overall span includes the new connection; it is the refrigerator-side free end that becomes shorter. The sink run meets the peninsula at a continuous stone worktop level. The exposed end retains its waterfall stone detail, with no stone divider at the attached end.

Fitted storage, the refrigerator and the retained flue remain. Matching full-height cabinet panels now continue across the visible chimney faces, aligning the kitchen-facing panel with the tall-unit frontage and concealing the exposed stack from living/dining. The masonry behind these thin panels is still present in the model. The panels are treated as fitted architecture, so they remain visible when movable furniture is hidden.

The original flue footprint is unchanged. Flue clearances, ventilation and inspection access still require construction detailing; the visual enclosure is not a construction specification. The single side-garden sink window, closed street-facing kitchen window and full rear living-room HST retain the arrangement established in 1.35.

## Open timber guard beside the stairs

The hall-side solid stair partition becomes a **1.10 m high timber guard**. A continuous handrail and low rail tie together **35 mm slats at approximately 120 mm centres**, allowing views and light between the hall and stair. The existing **1.13 m access opening** remains clear, with no rail or slat across the entrance. The bathroom side remains enclosed.

The plan, dollhouse and full-house views use the same guard geometry. Physical walking respects the barrier and its opening, while Free exploration retains unrestricted movement. The guard expresses the requested visual openness; its final fixing and stair-safety details remain part of architectural design.

## Pool at the left edge and a central fire lounge

With the coordinated summer garden enabled, the pool runs along the **left/east boundary when looking out from the house**. Its modeled water footprint is **3.5 × 8 m**, starting at **x = 15.10 m, y = 23.50 m** in the site's local coordinates. These are local model coordinates, not geographic coordinates.

The default row contains **three sunbeds along the edge facing the open garden**. Their headrests sit beside the pool and the seats face into the rest of the plot. The existing side-count control adds a front pair and then a rear pair, giving **three, five or seven beds**. The open garden-facing side remains the principal row in each arrangement.

The fire lounge moves into the middle of the garden, aligned with the centered terrace jacuzzi as the next focal point along the garden view. Outdoor kitchens are removed from the renovation garden recipes and their rendered furnishings. Dining furniture remains.

The shared pool and fire-lounge positions carry across all 34 renovation styles while furniture, planting borders and finishes retain their style character. The separate pavilion study and explicitly selected historical garden layouts retain their own arrangements.

## Sunlight tradeoff of the requested position

The left-edge position follows the requested garden composition. A new [bounded comparison](../data/left-edge-pool-verification-1.36.json) measures its sunlight alongside the released 1.35 transverse pool and planting arrangement. It does **not** establish a new sunlight optimum.

| Sample | Requested left-edge pool | Released 1.35 arrangement |
|---|---:|---:|
| June 2026, three dates | 4.7083 h/day | 7.5000 h/day |
| July 2026, three dates | 4.0417 h/day | 7.2552 h/day |
| August 2026, three dates | 2.1042 h/day | 5.9167 h/day |
| Mean across all nine dates | **3.6181 h/day** | **6.8906 h/day** |

These values are **equivalent direct-sun hours averaged over the water area**. For example, half the pool receiving direct sun for one hour contributes 0.5 equivalent hours. They do not mean that the whole pool is sunlit for the stated duration. The comparison shows a meaningful loss of modeled direct sun in exchange for the preferred left-edge layout; that placement remains the design choice.

The calculation uses **32 equal-area receivers** on each water surface and **30-minute midpoint samples** through the local day in **Europe/Warsaw**. The nine dates are 1, 15 and 30 June; 1, 15 and 31 July; and 1, 15 and 31 August 2026. Only above-horizon sun positions contribute direct-sun rays. Each arrangement uses the production registered house, mapped neighbouring roofs, measured summer vegetation, four-metre hedges, its specimen trees, pool coping, terrain and garden structures. The comparison includes the revised tree placements as well as the changed pool location.

Nine sampled dates and finite area/time sampling are a limited summer comparison, not a calculation for every summer day. Foliage is simplified. Weather, water temperature, heating demand and survey accuracy are outside this result. The earlier 1.34 sunlight study used a different comparison scope and should not be substituted for these matched figures.

To reproduce the report from the current `garden-lab` directory with a separate released 1.35 checkout:

```sh
node scripts/verify-left-edge-pool.mjs /path/to/released-1.35/garden-lab
```

The JSON records the dates, receiver count, states, geometry, source-data hashes and relevant source-file hashes for both arrangements.

## Saved designs and schema 32

Schema **32** introduces the revised starting garden while retaining explicit saved choices:

- Fresh Sternicza designs start with the inward-facing row of three sunbeds. An active older session with the previous three-side default adopts this one-row starting arrangement once.
- Imported links and saved comparison A retain their explicit sunbed-side choices. A deliberate two-side selection remains two-sided, and current schema-32 saves remain authoritative.
- Complete, recognized automatic tree presets from schemas 30 and 31 relocate to the new species-specific boundary positions when the coordinated summer layout is enabled. Tree identities, dimensions, rotation, enabled state and price fields are preserved.
- Custom positions, mixed-species groups, partial groups, removed trees and layouts with the summer arrangement disabled are not replaced by preset migration. The other two property models are unaffected by the Sternicza garden migration.

## Verification scope

Geometry coverage checks the connected countertop surfaces, concealed but retained flue, all-style kitchen circulation, open guard and clear stair entrance. Walking checks retain the physical stair connections and free movement. Garden coverage checks the pool, inward-facing bed orientation and counts, central fire lounge, removal of outdoor kitchens and preset migration. Fullscreen coverage exercises native and expanded-window behavior, view handoffs, resize and exit handling.

Release acceptance results and browser evidence are recorded with the release review.
