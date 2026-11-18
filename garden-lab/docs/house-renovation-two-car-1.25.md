# House renovation styles and required two-car garage

Release 1.25.0 · 18 November 2026

## Requested behavior

Styles should transform the house through a reasonable renovation. The default
Current design should add no house work. The Sternicza basement must accommodate
two cars; a saved earlier layout must not turn it back into a single-car garage.

## House treatments

Choosing a proposed style now enables its house treatment immediately. Each of
the 20 concepts supplies a palette and a physical façade recipe. Examples include
timber battens and casings for Hidden Bali, ashlar accents and window caps for
Organic Modern, terracotta panels with olive shutters for Mediterranean Villa,
paired timber battens for Japandi, and fine panels and surrounds for Modern
Minimalism. The catalogue describes the house work alongside the garden palette.

The same façade geometry supplies the openings for both the original renderer
and the renovation model. Detail is confined to solid wall bays and the outside
of existing apertures. The mapped footprint, storeys and roof envelope are kept.
Sternicza retains the photo-informed window and entrance arrangement; the other
two houses retain their existing inferred openings. Added façades are proposals,
not a claim that a measured construction survey exists.

The three default site models each admit three accent bays, with a maximum
panel width of 2.45 m and height of 2.50 m. The model checks each bay against
the actual openings and the roof seam as floor levels change. The deepest
added fitting is a window sill projecting 140 mm from the wall. Doorways keep
their thresholds clear.

All of a house’s added facade parts share one opaque mesh and one disposable
material. Across the 60 default site and style combinations, the mesh contains
58 to 802 parts. The vector renderer simplifies the side faces of small masonry
and shutter details.

Current design removes every style-added house detail and restores its original
materials. It does not undo independently selected garage, HST glazing, canopy or
balcony proposals. A house-renovation switch allows the same garden style to be
compared with the original house. Version 25 saves that choice explicitly.

Small ornamental projections are rendered visually. They do not create extra
privacy credit or new analytical sunlight obstruction volumes. Façade recipes do
not claim engineering feasibility, insulation performance or installed cost.

## Two-car regression and correction

The fresh default already had two spaces and a 5.8 m clear entrance. The defect
was the compatibility path: versions before 23 deliberately restored the old
single-car setting, and saving that restored design carried it into version 24.

Two spaces are now the required capacity. Restoring an older single-car design
upgrades the ramp and entrance to at least 5.8 m clear, preserving any wider saved
width. The enabled state and unrelated garden settings are preserved. The same
normalization covers shared links, local saves, comparison A and direct garage
geometry. An explicitly two-car experiment with insufficient width retains that
width and fails the clearance check; the model must not turn a failing comparison
into an apparent pass.

Capacity is displayed as a read-only two-car requirement. Ramp width remains
editable so physical fit can be explored. The plan and model use the same two
vehicle envelopes and clear width. An earlier single-car project quote is cleared
when the layout changes; it is not presented as the price for the larger scope.

## Saved designs and budgeting

- Versions 1–23 retain their earlier neutral style and unrelated design settings.
- Version 24 non-default styles migrate to the expanded garden-and-house scope.
  Their previous style-upgrade quote is cleared because the work has changed.
- Version 25 preserves an explicit house-renovation opt-out and current quotes.
- Current design always uses the original house exterior, even if malformed
  saved input tries to enable its renovation switch.
- Style and house-scope changes clear their incremental quote. Undo restores the
  preceding design and quote together.
- Base garden allowances and the additional renovation quote remain separate;
  no arbitrary installed house-renovation premium is added.

## Verification

Unit regressions cover legacy and current state restoration, two-car capacity,
insufficient-width failures, style selection, quote scope and undo. Geometry
checks inspect actual façade parts against openings and the unchanged envelope.
Browser checks exercise the attached WebGL renovation geometry, original-exterior
restoration, saved scope, all styles, resource disposal, mobile controls, migrated
garage capacity and rendered two-car plans. Release evidence accompanies the
deployment.

## Implementation references

- `src/design-styles.js`: stable style IDs and individual façade recipes.
- `src/house-renovation.js`: façade parts and export summary.
- `src/mapped-house-facades.js`: shared mapped-house openings.
- `src/scene-house-renovation.js`: rendered renovation geometry.
- `src/state.js`: schema 25 and saved-design migration.
- `src/garage-options.js`, `src/garage-ramp.js`: required capacity and shared fit.
- `src/studio-state.js`: automatic house inclusion and quote invalidation.
