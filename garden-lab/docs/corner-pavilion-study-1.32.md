# Garden Lab 1.32 — a pavilion to screen PCK3

**Checked 24 November 2026.** A pavilion can substantially reduce the PCK3 background from selected places, but its position matters as much as its height. The nearer-house alternative screens the living terrace most effectively; the rear/east alternative protects a nearby garden viewpoint. Neither hides PCK3 throughout the garden. **No height tested here has been established as legally permitted.**

The screening results below come from the [retained physical-shell analysis](source-evidence/corner-pavilion-2026-11-24/physical-pavilion-comparison.json), not the earlier solid-block exploration. The separate planning findings use official city spatial queries and primary legal sources recorded in the [evidence bundle](source-evidence/corner-pavilion-2026-11-24/README.md).

## Two optional placements

Both use the same alternative garden: a 3.5 × 8 m pool at local x=2.0, y=25.0, sunken lounge at x=6.8, y=29.4 and dining at x=6.5, y=24.2. The 4 m house terrace, compact sauna and plunge remain reference geometry. Local coordinates follow the simulator's property axes; a corner's apparent left/right position changes with the camera.

| Placement | Local footprint | Gross area | Initial study height |
|---|---|---:|---:|
| Rear/east, nearer PCK3 | x=12.2–17.2, y=29.0–34.8 | 29.00 m² | 6.5 m |
| Near the former outdoor garage | x=11.4–17.2, y=24.7–29.9 | 30.16 m² | 6.5 m |

Both footprints fit inside the mapped plot and clear the fixed alternative spa footprints, pool coping, fire-lounge coping and terrace. The near body starts at y=24.7 so its bottom step has over 1 m of clear approach beyond the registered terrace edge at y=22.1175. Both ground-floor entries sit 0.5 m east of their earlier positions, with a glass sidelight, to clear the terrace staircase. The [integration check](../tests/pavilion-integration.test.mjs) verifies a clear 1 m approach strip across Current and all 22 renovation styles.

| Placement | Entry starts at y | Entry-to-terrace gap | Body-to-house gap | East boundary | Rear boundary |
|---|---:|---:|---:|---:|---:|
| Rear/east | 27.16 m | 5.043 m | 10.861 m | 3.103 m | 3.133 m |
| Near garage | 23.18 m | 1.063 m | 6.561 m | 3.103 m | 8.033 m |

Each landing is 1.4 m wide. The rear entry has three approximately 0.146 m risers; the near entry has two approximately 0.148 m risers. These are modelled geometric clearances, not boundary, fire-separation, accessibility or planning approval.

The shell has opaque rear/east walls, transparent garden-facing windows and entrance door, opaque floor slabs, roof, piers, landing and finite steps. The 6.5 m variants contain two modelled floor levels. Internal stairs, room arrangements, structure, services and a complete accessible approach have not been designed.

## What the actual shell screens

The calculation uses the same registered architectural house and terrace geometry as the live app. The comparison keeps the **same alternative garden, eye position, balcony and summer vegetation**. Its baseline removes only pavilion construction. Values are visible PCK3 sample rays **before → after** adding the pavilion, including facing facade samples and measured roof returns. They are not percentages of image area, measured window privacy or a whole-garden guarantee.

| Placement / height | Terrace | Garden standing | Pool eye | Jacuzzi |
|---|---:|---:|---:|---:|
| Rear/east / 6.5 m | 375 → 243 | 256 → 0 | 379 → 271 | 400 → 289 |
| Rear/east / 8 m | 375 → 36 | 256 → 0 | 379 → 238 | 400 → 139 |
| Rear/east / 10 m | 375 → 20 | 256 → 0 | 379 → 236 | 400 → 108 |
| Near garage / 6.5 m | 375 → 14 | 256 → 256 | 379 → 373 | 400 → 220 |
| Near garage / 8 m | 375 → 0 | 256 → 256 | 379 → 373 | 400 → 189 |
| Near garage / 10 m | 375 → 0 | 256 → 256 | 379 → 373 | 400 → 189 |

At 12 m the results are unchanged from 10 m for these fixed footprints. Remaining rays pass beside the building: additional height cannot fix that. The rear-garden eye is only 0.4 m west of the rear pavilion wall, so its complete screening is highly local. The fire-lounge eye has a different bearing: the rear pavilion reduces visible samples only from 147 to 137; the near pavilion provides no improvement there.

### Pavilion alone, without credit for existing cover

This second metric counts the fraction of **365 measured PCK3 roof-point rays** blocked by the actual opaque pavilion shell alone. Glass stays transparent. Trees, hedges, the balcony and neighboring buildings receive no credit in this metric.

| Placement / height | Living seated | Living standing | Terrace | Garden standing |
|---|---:|---:|---:|---:|
| Rear/east / 6.5 m | 0.0% | 0.0% | 35.9% | 100.0% |
| Rear/east / 8 m | 35.3% | 28.8% | 90.7% | 100.0% |
| Rear/east / 10 m | 64.4% | 64.4% | 94.5% | 100.0% |
| Near garage / 6.5 m | 58.6% | 41.1% | 96.7% | 0.0% |
| Near garage / 8 m | 97.0% | 97.0% | 100.0% | 0.0% |
| Near garage / 10 m | 97.0% | 97.0% | 100.0% | 0.0% |

The current balcony already leaves only two visible PCK3 samples from the original seated living-room eye and five from the standing eye. Pavilion-only roof fractions therefore do not imply an equally large additional benefit over that existing cover.

### Ideal envelope is a separate geometric limit

The envelope calculation replaces the shell with a completely solid flat-top volume. It explains which rays cross the footprint and the height needed to intercept those rays. It does **not** account for the shell's transparent openings and is neither a building specification nor a planning maximum.

| Placement / eye | Roof rays crossing footprint | Ideal height for all intercepted roof rays | Can height alone block every sampled roof ray? |
|---|---:|---:|---|
| Rear/east / living seated | 235/365 | 9.60 m | No |
| Rear/east / living standing | 235/365 | 9.84 m | No |
| Rear/east / terrace | 345/365 | 9.84 m | No |
| Rear/east / garden | 365/365 | 4.09 m | At this fixed eye only |
| Rear/east / pool | 153/365 | 8.28 m | No |
| Near garage / living seated | 354/365 | 7.50 m | No |
| Near garage / living standing | 354/365 | 7.81 m | No |
| Near garage / terrace | 365/365 | 7.76 m | At this fixed eye only |
| Near garage / garden | 0/365 | — | No |
| Near garage / pool | 0/365 | — | No |

The selected height is measured from the **lowest original terrain corner**, with top elevation equal to that datum plus study height. Proposed fill changes pad elevation and headroom; it never adds screening height. This simulator datum is not a determination of the legal height-measurement method. Summer canopy envelopes are also modelling assumptions, not guaranteed real foliage screening. See [nature provenance](sternicza-nature-provenance.md) and [neighborhood realism](sternicza-realism-1-30.md) for the mapped inputs.

## How high could legally be built here?

### Current local-plan coverage: none found in the official queries

The model combines parcels **226101_1.0034.400 and 226101_1.0034.401**, with a mapped area of 766.86 m². Intersecting their complete combined polygon with the city's current MPZP land-use layer, current plan-boundary layer and published APP plan layer returned **zero features in all three**. An independent repeat returned the same results. The exact EPSG:2180 polygon, query URLs, responses and checks are [retained](source-evidence/corner-pavilion-2026-11-24/README.md); the service is identified by the [official city MPZP dataset](https://ckan.multimediagdansk.pl/dataset/mpzp).

This establishes the result of the city-layer check, not a formal planning certificate. No current MPZP height, roof form, coverage percentage or building line can responsibly be assigned from a neighboring plan. Cadastral geometry alone also does not establish ownership or the legal development-site boundary.

### Draft general plan: 12 m is context, not entitlement

The [official revised POG map](https://brg.geogdansk.pl/portal/apps/experiencebuilder/experience/?id=e21c8101a4c74ed69065d08644fcd8f0), published on 7 October 2026, places all ten tested interior points, including the proposed rear corner, in **649SW**:

| Draft urban standard | Proposed value |
|---|---:|
| Maximum height | 12 m |
| Maximum building coverage | 30% |
| Minimum biologically active area | 50% |
| Maximum above-ground intensity | 1.5 |

The [BRG status page](https://bip.brg.gda.pl/plan-ogolny-miasta-gdanska), updated 16 November 2026, still shows statutory agreement after consultations, not adoption or entry into force. BRG also explains that even POG parameters do not authorize every included form on every parcel: detailed development conditions belong in MPZP/WZ. **The 12 m figure is not a confirmed limit or permission for a detached sauna, gym, spa or auxiliary building.** The whole-polygon query additionally intersects 637SW, whose draft height is 16 m; all tested interior/corner points are in 649SW, so that neighboring value is not used.

### WZ and technical rules are in transition

For this proposal, a valid property-specific WZ decision and its exact scope must be checked. The [Ministry's current planning FAQ](https://www.gov.pl/web/rozwoj-technologia/reforma-planowania-przestrzennego-2) says that, after 1 September 2026, where no POG has entered into force, issuing WZ generally depends on proceedings begun before that date, subject to statutory exceptions. Existing valid decisions remain relevant. The enacted deadline amendment is [Dz.U. 2026 poz. 781](https://eli.gov.pl/api/acts/DU/2026/781/text.pdf); the older June deadline still present in BRG's introductory text should not be used. An existing house or garage decision does not automatically authorize this new pavilion. Proposed changes in [bill 3175](https://www.sejm.gov.pl/Sejm10.nsf/PrzebiegProc.xsp?nr=3175) were not enacted in the checked record.

ELI marks the previous [building technical-conditions text](https://eli.gov.pl/eli/DU/2022/1225/ogl) repealed on 21 September 2026. On 24 November the [Ministry announced replacement building regulations had been signed](https://www.gov.pl/web/rozwoj-technologia/nowe-rozporzadzenie-w-sprawie-warunkow-technicznych-dla-budynkow), with entry into force the day after Gazette publication. Publication and the complete new enacted text were not verified here; signature alone does not establish that they are in force. [Dz.U. 2026 poz. 1161](https://eli.gov.pl/api/acts/DU/2026/1161/text.pdf), inserting Building Law arts. 102a–102c, provides a conditional choice of the former technical regime, described by the Ministry as available through 20 March 2028.

Accordingly, **3 m for a blank boundary-facing wall and 4 m for a wall with openings are concept assumptions based on the former regime**, not approval of either placement. Under its [§12](https://eli.gov.pl/api/acts/DU/2022/1225/text.html), the special boundary/1.5 m exception for qualifying garages/outbuildings is limited, among other conditions, to 6.5 m length and 3 m height. That 3 m figure limits an exception; it is not a universal garden-building height cap. The separate narrow-plot exception cannot simply be assumed for this approximately 20.32 m-wide site.

A wellness pavilion is not automatically a storage/workshop-type *budynek gospodarczy* or an individual recreation building. Actual use, neighboring openings, fire separation, daylight/insolation, roof form, access, services and retained trees require project review. PCK3's height is not automatic precedent: the [current WZ urban-analysis regulation](https://eli.gov.pl/api/acts/DU/2024/1116/text.html) relates proposed development to function and the relevant surrounding plots.

The next decisive evidence is the existing WZ with annexes, any relevant pre-cutoff application, and the approved house/garage site plan. A local architect and the city should confirm the applicable route and a viable use/height envelope before developing the shell into a building design.

## Reproduce the screening study

From `garden-lab`:

```sh
node scripts/analyze-corner-pavilion.mjs /tmp/physical-pavilion-comparison.json
```

The script applies `applyPlanExterior` before obtaining any observer or running either analysis, matching the live app’s architectural registration. It uses the same pavilion geometry as the simulator, both placement presets, heights 6.5/8/10/12 m and seven fixed observer presets. It writes actual-shell before/after counts, pavilion-only roof counts, ideal-envelope limits, height datums, entry geometry and warnings. The [dated JSON](source-evidence/corner-pavilion-2026-11-24/physical-pavilion-comparison.json) is the release snapshot; later source/default changes can intentionally produce different results. Omitting the output argument explicitly regenerates that retained snapshot.
