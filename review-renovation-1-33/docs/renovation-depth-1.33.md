# Substantial renovation proposals · 1.33.0

The renovation catalogue now changes the architecture and use of the retained house, rather than relying mainly on colours and trim. **Current house** remains the original baseline. Each of the other 22 choices combines a physical window proposal, facade treatment, interior furnishing programme, photographic surface materials and a coordinated garden.

## What changes when a style is selected

| Layer | Renovation behaviour |
| --- | --- |
| Windows and garden doors | Window widths, heights, sills, positions, frame sections, panes and transoms change. Garden glazing uses one, two or three bays with retained piers; broad sliders, divided French windows and workshop grids are different physical assemblies. |
| Facades | Deep jambs, projecting heads, sun shading, cladding and guards follow each architectural recipe. Proposed projections are bounded at 0.40 m. |
| Interiors | Living and dining compositions, furniture forms, joinery, beds, office orientation and three kitchen arrangements change. The kitchen can use a freestanding worktable, an island or a galley while retaining the existing wet-service perimeter. |
| Garden | Six fitted arrangements position the pool, sunken fire lounge, dining, resting groups, paths, planted beds and an outdoor cooking counter. Each style supplies its corresponding furniture and materials. |
| Materials | Separate photographic colour, normal and roughness maps represent the selected material. Natural wood and stone retain their original variation; painted finishes and upholstery take the design palette. |
| Comparison | House details, Garden overview and Daylight give repeatable inspection views. A style change preserves the chosen camera and light. The catalogue and expanded finish panel show small samples from the actual material families. |

## Retained building and shared geometry

The measured footprint, roof envelope, storey levels, structural stair connections and mapped surroundings stay registered. Proposed apertures are real wall voids, shared by the inside and outside views. Sizes are constrained by the existing storey ceilings and roof, adjacent apertures, retained room partitions and nearby fixed joinery. Bathroom and sauna openings use high privacy glazing where the room data supports that choice. The entry stays aligned with its landing.

Sternicza uses the registered drawing model in both viewers. The mapped facades at the other two properties also get style-specific wall openings, with whole elevations reconstructed from collinear survey segments. Their room use remains inferred. Mapped wall and frame surfaces are batched by material to keep the additional architecture from multiplying drawing work.

These are substantial renovation **proposals**. Enlarged openings, supporting structure, replacement glazing, facade build-ups and detailed services need a measured architectural and structural design before procurement. The model does not assert that a particular opening can be built without reinforcement.

## Garden arrangements

The six arrangements serve coherent groups of styles: a sheltered retreat, a dining courtyard, a linear pool gallery, a boardwalk and dune lounge, a social pool court, and a mineral court. All 22 default schemes are checked against the parcel, the house and terrace, stairs, water and spa structures, dining and furniture clearances, and the retained tree centres.

The proposed pools and fire lounges are the same objects used for terrain cut-outs, water levels, viewpoints, shade receivers, plan drawings and budget quantities. Style and layout changes invalidate those calculations. Low ornamental planting is visual landscape detail and does not silently become an opaque privacy barrier.

The coordinated garden applies to Sternicza's spa programmes. **Use this style’s garden layout** can be turned off to retain the independently selected garden programme. Choosing another programme also returns to that manual arrangement. The pavilion alternative continues to control its own pool and furniture positions when enabled.

## Materials and delivery

The expanded material catalogue uses self-hosted, openly licensed photographic PBR sources. `assets/materials/manifest.json` records the source page, author, licence, physical dimensions and hashes of the original channels and processed derivatives. The selection uses distinct surfaces for timber species, mineral finishes, brick and terracotta, roof coverings, floors, and upholstery. Small 256 px catalogue images avoid downloading full-resolution maps just to browse the choices.

Texture channels load when their material is used. Unused decoded images have a bounded cache; disposed texture handles release their image reference. Geometric board or tile joints use matching mortar-free material samples so the photographic seams do not appear twice. Deck texture scale cancels the existing board-module UV normalization and follows physical metres.

The visualisation remains a real-time architectural model. The photographic surfaces represent a material family; they are not product specifications or photographs of the finished property. Existing High detail contact shading, reflected pool surroundings and sun shadows remain available.

## Saved designs and budget scope

State schema 29 stores the garden-layout choice. Existing links and saved designs from schema 28 and earlier keep their previous garden layout. Choosing a different renovation style adopts its coordinated garden; Undo restores the complete previous design. Current restores the original house, while the independently edited garden programme remains available.

Style upgrades remain quote-only. The upgrade scope now explicitly includes replacement and enlarged glazing, supporting work, interior joinery, the outdoor kitchen, utility connections and new planted/resting areas. Existing base allowances are not counted a second time. A style or garden-layout change clears the old upgrade quote; Undo can restore it.

## Verification

The release includes focused checks for all 22 physical window patterns across shared, photo and mapped house models; exact inside/outside aperture agreement; retained envelope and access constraints; garden fit and shared analytical geometry; saved-state migration; furnishing circulation; photographic channel provenance, physical scale and texture disposal.

The browser regression exercises all 23 choices with real WebGL, checks that distinct window patterns and all six garden arrangements render, verifies Current restoration and bounded resources, and retains the existing garage, mobile, lighting, history and shared-link checks. Release evidence records the exact deployed source and build hashes.
