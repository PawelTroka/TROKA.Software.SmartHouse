# Garden Lab 1.31 — a private resort at home

## Purpose

The previous catalogue changed construction and finishes but reused almost all furniture and light positions. This revision composes the spaces around everyday life: a place to stretch out, a comfortable conversation group, practical dining, a bedroom reading corner, usable access to the garden and a quiet evening scene.

These are design proposals fitted to the simulator’s architectural plan. They do not replace a measured architectural or electrical design, or quote an increase in the property’s resale value.

## What changes

- **22 coordinated renovations plus Current.** Every renovation has its own furnishing composition and outdoor lighting recipe. Physical seating, table, cabinetry, facade and luminaire forms continue to vary with the style.
- **A separate Beach House.** Sand-coloured mineral walls, paired pale timber screens, deep timber window casings, bleached decking, a low linen daybed, relaxed dining and muted sea-glass accents. Its soft canopy details and shaded fixtures differ from Coastal’s painted weatherboards/crossed guards and Baltic Dune’s weathered boards/canvas.
- **Living and dining.** Conversation, opposing-platform, daybed, linear, social and sculptural seating arrangements replace the repeated large U-sofa. Dining size, arrangement and service furniture are coordinated with the lounge.
- **Bedrooms.** Reading furniture and small shaded lamps add a usable resting area. Rug and hosted table-lamp footprints do not block the walking model.
- **Terrace and balcony.** Quiet seating groups and drink tables sit beside reserved circulation. The garden plan uses the same movable-pieces source as the 3D view. Small balcony groups keep the door landing strip open.
- **Night lighting.** Fewer perimeter fittings, lower source strengths, selected planting accents and focused pendant light separate the paths from places to sit. Existing independent switches and dimmers still control the circuits. Interior lamps provide local illumination with a bounded renderer light count.
- **Comparison.** Each style has a short living guide. Golden hour and Garden evening are directly available beside the style selector.

## Scope and continuity

Movable furnishing is composed within the established property and architectural geometry. The selected pool, spa, screening-tree and hedge configuration, mapped neighbouring buildings and measured vegetation remain the foundation for the design. Decorative furnishings do not claim additional analytical privacy or sunlight screening. A retained outdoor garage, resized terrace or constrained layout can suppress a furnishing that cannot fit.

Current retains its original arrangement and light layout. Existing style IDs, saved designs and schema 28 remain supported. Beach House has a new stable `beach-house` ID; the former informal Beach House search alias for Coastal is removed. Base planning allowances remain estimates; bespoke furnishing and renovation scope use the existing additional style quote.

## Design references

The compositions are original Garden Lab proposals. The following primary references informed the approach; their photographs and models are not copied into the simulator.

- [Norm Architects — Sjöparken](https://normcph.com/project/sjoparken/): timber separation, continuity between inside and outside, tactile surfaces and restrained artificial light. These inform the quieter spa styles and the deliberate spacing between lit areas.
- [Norm Architects — Guest House No. 16](https://normcph.com/project/guest-house-no-16/): a coordinated coastal renovation, with detailed joinery and natural material character. This informs the contemporary Beach House rather than a decorative nautical theme.
- [Amankila — Garden Pool Pavilion](https://www.aman.com/resorts/amankila/accommodation/pavilion/garden-pool-pavilion): a private garden, pool and resting places. This informs the sheltered Bali lounge and courtyard sequence.
- [DarkSky and IES — Five Principles for Responsible Outdoor Lighting](https://darksky.org/resources/guides-and-how-tos/lighting-principles/): useful, targeted, low-level, controlled and warm light. Renderer intensities remain visual parameters, not a lux study or fixture specification.

## Validation

The integrated source passes 750 automated tests and the static production build. An independent geometry review checked 44 ground/first-floor layouts against 528 circulation targets with the original 0.60 m walking disc, with no disconnected targets or furniture intersections. Exterior review covered 1,980 combinations of style, terrace dimensions and cover geometry without furniture/support intersections.

The browser checks cover the 23 catalogue choices, distinct facade and furniture geometry, Beach House versus the two existing coastal styles, evening controls, shared interior/exterior models, state restoration and mobile layouts. Actual rendering evidence is recorded with the review pull request after the browser jobs complete.
