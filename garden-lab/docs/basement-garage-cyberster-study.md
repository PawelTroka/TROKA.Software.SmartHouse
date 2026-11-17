# Sternicza 11: basement garage and Cyberster clearance

Reviewed **17 November 2026**. This study accompanies the optional basement garage in Garden Lab. It combines mapped site geometry, published vehicle dimensions and explicitly adjustable design assumptions. No measured basement section, structural opening survey, car underside scan or construction quotation was supplied.

## The useful concept

The candidate is a partly buried garage beneath the raised living floor. It uses the full approximately 9.1 m front-yard approach, then continues the gentle lower transition **2.0 m inside the house** before the flat parking area. That continuation consumes basement length and reduces headroom near the entrance; it is not hidden outside the plotted dimensions.

Two comparisons expose the constraint: **Front yard only** finishes the entire descent before the facade; **0.6 m deeper** retains the approach while lowering the floor. A positive static gap below the selected clearance reserve remains an insufficient-margin result.

A simple calculation of 9.1 m times a gradient cannot establish whether a low car fits. The crest can contact the underside between the axles, while the lower transition can contact the front bumper or rear overhang. Both full traversals are checked.

## Evidence and candidate assumptions

The [source record](../data/garage-sources.json) contains the full provenance and primary links.

| Input | Basis |
|---|---|
| Minimum mapped front setback, 9.0959 m | Existing parcel and house footprint; the perpendicular ramp alignment has its own slightly different length |
| Street-entry elevation | Existing terrain-grid interpolation, not a kerb or footway survey |
| Living floor, +1.20 m above garden reference | Existing adjustable assumption, not measured |
| Basement floor to slab underside, 2.30 m | Candidate design assumption |
| Living-floor/slab allowance, 0.25 m | Candidate assumption; actual floor build-up and structure unknown |
| Indoor continuation, 2.00 m | Proposed lower transition consuming real basement length |
| Ramp clear width, 3.20 m | Proposed width between retaining walls |
| Extra underside reserve, 30 mm | Editable planning allowance, not an MG requirement |

The basement floor is the living-floor elevation minus slab allowance and clear height, minus any extra lowering. Changing the living-floor assumption therefore changes the descent. Rear-garden fill does not move the garage floor or street entry.

The ramp is aligned with a new opening in the front facade. The proposed vehicle opening in the front hedge moves into line with it, while pedestrian access stays clear. Neither gate nor structural opening is an existing surveyed feature. Internal walls, foundation configuration and availability of the illustrated basement bay remain unverified.

## Manufacturer vehicle data

[MG Poland's specification](https://cdn.mgmotor.eu/files/Cennik_Cyberster_R25_02_04_2026_2026-04-20-111244_gwfd.pdf), effective 1 April 2026 and covering cars produced in 2024–2025, gives:

| Parameter | Model value |
|---|---:|
| Overall length | 4.535 m |
| Wheelbase | 2.690 m |
| Body width / width with mirrors | 1.913 / 2.110 m |
| Closed-car height | 1.329 m |
| Unladen / laden ground clearance | 115.5 / **105.6 mm** |
| AWD front / rear tyres | 245/40 R20 / 275/35 R20 |

The 955 mm front and 890 mm rear overhangs are corroborated by the [MG Finland diagram](https://cdn.mgmotor.eu/files/Nro6a_Cyberster_HinnastoTeknisetTiedot_2025-01-01_2025-01-22-123214_oxlg.pdf), PDF page 6, and the [MG manufacturer manual](https://mgmotor.scene7.com/is/content/mgmotor/mgselect/en/global/documents/mg-cyberster-manual.pdf), printed page 5-34. Their sum with the Polish wheelbase reproduces the published length. The Finnish diagram gives a wheelbase 1 mm longer; this model consistently uses Poland's 2.690 m. Another-market manual gives 106.7 mm minimum clearance without specifying its load condition, so it does not replace the explicitly laden Polish figure.

Actual bumper, diffuser and battery protection profiles are not published in the retrieved dimensions. The model therefore uses a **conservative flat lower envelope at the selected ground clearance over the complete car length**. It does not assume raised bumpers to obtain a passing result.

Nominal tyre radii calculated from size markings are 352.0 mm front and 350.25 mm rear. These are not measured loaded radii. The underside is calibrated to the chosen ground clearance on level pavement.

## Method and limits

The pavement has continuous grade through parabolic upper and lower transitions, with a constant-gradient middle where space allows and a short flat apron within the available run. Transition lengths are selected to improve the worst whole-car clearance while respecting the chosen peak-gradient comparison limit.

The car is a rigid two-axle body supported by circular tyres. The solver retains tyre contact, wheelbase, unequal wheel radii and both overhangs. It sweeps the full lower envelope through both orientations. Fixed-pose clearance includes extrema within the continuous curve rather than testing only pavement vertices. The displayed positive gap is a conservative separation bound derived from vertical separation and the maximum profile slope. Numerical sampling and convergence checks remain documented in the source/tests.

The car-position slider is a preview of the same profile and pose model; moving it cannot change the worst full-drive assessment. Roof and doorway passage, covered ramp headroom, mirror-inclusive width and remaining parking length are checked separately. The visual vehicle is a dimensioned concept shell, not manufacturer CAD.

The calculation is quasi-static and straight. It does not model braking pitch, suspension motion, crossfall, steering from the street, tyre-pressure differences, grip, ice, construction tolerances or road defects. The 30 mm reserve is a planning allowance, not a guarantee against all those effects.

## Drainage, threshold and everyday use

The illustrated drain grates follow the pavement surface. The main sweep assumes a **flush crossing without an unmodeled raised threshold**. A real kerb, gate track, drain frame or containment edge must be included in the measured detailed profile. A 30 mm clearance reserve does not authorize an arbitrary 30 mm step at the critical point.

Former Technical Conditions §102 called for drainage before underground entry, while §107 described floor falls and a 30 mm containment edge. Water disposal, waterproofing, backup against flooding and the actual containment detail need project design. The terrain mesh cannot establish groundwater or excavation stability.

MG's manual describes scissor-door restrictions around walls, columns, narrow spaces and steep slopes, but does not provide a verified full opening envelope for this study. Roof operation needs suitable space and a level position. Closed-car passage does not verify occupant access or door/roof operation. MG Poland also states that AWD operates only in forward travel; the simulator's reverse comparison is geometric, not a traction assessment.

## Polish benchmarks and transitional status

[ELI](https://eli.gov.pl/eli/DU/2002/690/ogl) records the former 2002 Technical Conditions regulation as repealed from 21 September 2026. The [31 July 2026 Act, Dz.U. 2026/1161](https://eli.gov.pl/api/acts/DU/2026/1161/text/T/D20261161L.pdf) introduced Building Law Article 102a, allowing specified submissions to use earlier provisions through an 18-month route from 20 September 2026 following an investor declaration. This model labels the figures **former WT benchmarks; transitional applicability to confirm**.

| Former provision | Benchmark and scope |
|---|---|
| §70 | 25% for individual-garage ramps, covered or uncovered; not a vehicle-clearance approval |
| §14(1) | 3.0 m access roadway |
| §102 | 2.2 m below structure; 2.0 m below services; opening at least 2.3 m wide × 2.0 m high; drainage before underground entry |
| §107 | Floor drainage and 30 mm containment edge |
| §12 as amended in 2023 | 1.5 m boundary setback includes open ramps, with specified exceptions; adjacent road plots have separate treatment |

The [former consolidated text](https://eli.gov.pl/api/acts/DU/2022/1225/text.html) and [2023 amendment](https://eli.gov.pl/api/acts/DU/2023/2442/text.html) are linked for review. The 2.7 m ramp clause in §103(2) expressly addresses garages above 25 cars per level; it is not treated here as the universal single-house access width. Accessibility-platform provisions are not substituted for vehicle transition design.

[Ministry WR-D-33 v01.5](https://www.gov.pl/attachment/4878ff2d-ab22-4adc-b22d-6e149fd0810c), dated 31 March 2026, is voluntary road-connection guidance. Its §8.3 covers approaches near pedestrian/cycle routes, rounded changes of grade, passability and visibility. It does not justify automatically subtracting a universal 5 m landing from this private front yard. Survey the street, boundary and footway and design the connection.

No parcel-specific MPZP permission, structural feasibility or construction consent is established. See the [Gdańsk plan finder](https://www.brg.gda.pl/planowanie-przestrzenne/miejscowe-plany) and [geotechnical conditions regulation](https://eli.gov.pl/api/acts/DU/2012/463/text.html).

## Budget and continuity

Basement conversion and ramp works have a separate complete project quote. Zero remains **unquoted and excluded** even with garden planning allowances enabled, making the overall budget an incomplete known subtotal. Garden retaining walls, drainage and excavation allowances are not prices for altering the house. A supplied project quote is counted once, with the existing upper-budget uncertainty allowance applied once.

The garage starts off in fresh designs and remains off in schema 1–21 links and saves. Schema 22 retains its dimensions, car assumptions, position, orientation and quote for Sternicza. The other properties do not inherit this site-specific option. Lighting, planting and privacy comparisons remain independently adjustable.
