# Garden seating and bathroom privacy · 1.41

This update applies the owner's feedback to the Sternicza proposal after release 1.40.

## Garden

Left and right are named looking from the house into the rear garden. The free-standing dining area on the right/west side is removed because it faces the PCK building even with the pines. Its table, chairs, paved pad and dedicated connecting path are removed together. The garden model, plan, dimensions, lighting routes and budget use the same absence of a dining area.

The pool sunbeds form one parallel row, with aligned headrests, equal spacing and no end-to-end arrangement. The default three beds are each 0.78 × 2.00 m, separated by 0.32 m. Their mapped origins are (11.95, 24.00), (13.05, 24.00) and (14.15, 24.00) m. All face the same direction. Selecting two or four beds keeps the same spacing and pool-side edge. The pool remains at (15.50, 24.50) m with its 3.20 × 6.50 m water footprint. The pines, central fire lounge and terrace arrangement retain their positions.

## Ground-floor bathroom

The proposed street-facing bathroom opening is removed from the shared wall geometry. There is no remaining pane, frame or aperture on that wall in the proposed 2D and 3D views.

The side bathroom window keeps its opening and frame, with a reflective privacy-glass specification. The visualization uses a reflective exterior surface and a tinted, transparent view from the room. It reuses the scene's environment reflection rather than adding another continually rendered mirror.

### What reflective privacy glass provides

One-way mirror glazing depends on the relative light levels on its two sides. The intended effect is a reflective exterior when outdoors is brighter, while someone in the darker bathroom can look out. A lit bathroom at night needs a blind or other opaque closure for privacy. The rendering is a design illustration, not a photometric guarantee of concealment.

Pilkington's [Mirropane manufacturer guidance](https://www.pilkington.com/en/gbl/architectural-and-technical-glass/product-categories/special-applications/pilkington-mirropane) explains this lighting dependence. Its specified minimum 8:1 illumination ratio belongs to that particular product, which is normally used internally; an exterior installation requires manufacturer consultation. This project does not yet select that product or assume the same numerical threshold for every reflective glazing system.

The measured original house remains unchanged in **Current**. The upstairs bathroom and indoor sauna windows retain their existing specification.

## Saved designs

State schema 37 records `privateGardenSeating` and `bathroomPrivacyGlazing`. Fresh Sternicza designs enable both. The active saved design from an earlier version adopts them once; shared historical links and saved comparison A retain the prior geometry. Explicit choices already saved in schema 37 remain authoritative. The other properties retain their own layouts.

The internal `poolSunbedSides` values remain compatible with older links. In the revised arrangement they select two, three or four aligned sunbeds; the current control describes that count. Older arrangements retain their original side-based option labels.
