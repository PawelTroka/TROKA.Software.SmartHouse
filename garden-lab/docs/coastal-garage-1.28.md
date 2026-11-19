# Coastal renovation and persistent two-car garage · 1.28.0

## The reported garage loss

Two application behaviours hid the requested proposal: Sternicza inherited the generic garage-off starting state, and clicking **Original drawings** while viewing the basement explicitly wrote `basementGarageEnabled: false`. A later style change preserved that false value, so the two-car model appeared to have been removed.

Sternicza now starts with its two-car basement proposal enabled. The house style and drawing-layout controls leave that choice alone. The interior garage switch remains accessible on every floor; use it explicitly to compare the original cellar. The layout buttons describe the dwelling layout, even when the independently selected basement proposal is visible.

Both actual vehicle groups remain in the exterior model through every style, including Current. The interior plan and JSON export contain the corresponding two car envelopes. The garage still uses the existing shared excavation, entry, ramp, parking and structural-conflict model.

## Saved designs and links

Schema **28** provides a bounded repair for the last-used Sternicza design stored by versions 22–27. Opening that active legacy save restores the requested two-car proposal and saves it under the new version. It is not repeatedly enabled: an explicit off choice made in version 28 survives normal reload, style changes, sharing and export.

Saved comparison A is preserved exactly, including an original-cellar/off choice. An explicit `basementGarageEnabled=false` in an older shared link is also respected. Sparse garage-era links adopt the new requested proposal. Designs predating the garage feature retain their historical original-cellar state. Other properties keep their own defaults. Every new shared link serializes the garage choice explicitly.

## Coastal is a separate physical renovation

**Coastal** is an explicitly named choice in the main catalogue and interior selector. Search also recognizes Hamptons, seaside, beach house, New England and Cape Cod. It is separate from Baltic Dune, bringing the catalogue to **21 renovations plus Current house**.

| Area | Coastal treatment |
|---|---|
| Exterior | Horizontal weatherboards, projecting white window casings and louvred shutters fitted around the actual openings |
| Terrace and balcony | Pale timber decking, cross-braced timber guards and coordinated coastal outdoor furniture |
| Living and dining | Slipcovered seating, timber/cane dining chairs and a distinct coastal furniture construction |
| Bedrooms and fitted furniture | Boarded headboards and louvred joinery with pale timber and linen finishes |
| Interior architecture | Boarded surface treatments and ceiling detailing, with linen drum lighting |
| Materials | Timber grain, woven linen and ceramic surface textures, with coordinated roughness and bump |

Style changes retain the measured room programme, shared doors and windows, synchronized terrace/balcony dimensions, and the revised bathroom equipment. The ground floor retains its deep soaking tub, shower, dual vanity, WC and bidet. Upstairs retains one hydrotherapy spa, two-person shower, single vanity and WC.

## Verification scope

Automated model and state tests cover physical Coastal geometry, clipped facade apertures, furnishing bounds, style selection/search, garage migration, explicit off persistence and the preserved archived comparison. Browser coverage exercises the same visible controls and actual WebGL renderers as the application. It counts the two rendered vehicle groups through all styles, opens the original basement without losing the proposal, compares Coastal with Baltic Dune, exercises normal/share reload and tests narrow-screen controls.

The versioned public release page records the exact tested source commit, CI results and screenshots. The existing cellar, retained stair/flue and ramp feasibility annotations remain visible; enabling the simulator proposal does not resolve those construction constraints.
