# Garden Lab 1.20.1 — light from every inner-thuja lantern

## Request and cause

The user clarified that the very dim fittings were the hanging lanterns on the garden-facing sides of the thuja hedges. The previous release increased their dimmer and shade glow, but only four selected hedge fittings had real point lights. Most of the installed lanterns could not illuminate nearby foliage or ground.

## Correction

Each installed hedge lantern now has its own warm, shadowless local point light. Nominal output is 72 instead of 18, and the falloff range is 6 m instead of 4.2 m. This is a rendering correction, not a claim of measured lumens or illuminance. Every light follows the existing hedge dimmer, group switch, garden master and solar activation.

The layout continues to cap hedge fittings at 24. With the existing maximum 12 landscape lights and three dining pendants, the full scene contains at most 39 local lights. No new hedge shadow maps are allocated. The SVG fallback retains its lightweight visible fixtures and channel glow; it does not simulate surface illumination.

Dining-pendant output, neighbouring-window settings, landscape lighting, fixture placement and cost quantities are unchanged. Schema 20 and all saved percentages remain intact. The correction therefore reaches existing shared layouts without resetting the garden or raising unrelated dimmers.

## Verification gate

- Geometry, layout, saved-state and lighting tests cover all three properties. Rendering checks require a real local light for every hedge fitting, independent channel control, bounded light counts and complete extinction with daylight or the appropriate switches.
- The WebGL browser gate isolates hedge lanterns from landscape, dining and window lighting, compares the rendered ground and foliage at fixed cameras, exercises the hedge dimmer and saves screenshots. Mobile night rendering is checked as well as the existing property, sharing and mobile-layout scenarios.
- The static build and every runtime cache key use version 1.20.1. Publication uses the tested source assets. Executed test counts, screenshot evidence and deployment results are recorded in the pull request and release evidence.
