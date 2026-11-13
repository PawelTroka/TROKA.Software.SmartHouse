# Sternicza 11: three tall pines in the rear-left corner

Date: **13 November 2026**. Garden programme: **spa-edge**. This is the compact planting arrangement requested after version 1.8, using the same pool, sauna, plunge, terrace, terrain and neighbouring buildings. Left means **physical east when looking from the house into the rear garden**. On the street-at-top plan, this is the right-hand side of the drawing.

## Selected corner group

Three **9.5 m Austrian pines** form an overlapping group behind and along the far end of the pool. Their trunk centres occupy a **4.50 × 3.50 m** bounding rectangle, with pairwise distances **3.67, 4.50 and 4.78 m**. Each modeled crown is 5 m wide/deep, so the complete canopy envelope occupies approximately **9.50 × 8.50 m**. This distinguishes close trunk spacing from the actual space taken by large crowns.

| Pine | X (m) | Y (m) | Height (m) | Crown base (m) | Crown width × depth (m) | Minimum centre-to-ground-feature gap (m) |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 13.10 | 34.45 | 9.50 | 2.50 | 5.00 × 5.00 | 2.86 |
| 2 | 14.35 | 31.00 | 9.50 | 2.50 | 5.00 × 5.00 | 1.07 |
| 3 | 17.60 | 34.50 | 9.50 | 2.50 | 5.00 × 5.00 | 1.72 |

All three trunks pass the concept placement rules. Their complete modeled crowns remain inside the mapped parcel with at least a 0.15 m crown allowance. A minimum 1 m centre-to-hardscape/furniture/path allowance is used; the tightest is pine 2 beside the pool, at **1.07 m**. The crowns overlap one another and parts of the pool/spa hardscape. Actual root-ball dimensions, pool foundations, transport access, pruning and future growth still need to fit. These are layout allowances, not arboricultural approval or supplier measurements.

The catalog reference remains **59,900 PLN per plant**, **179,700 PLN for three**. Moving the group changes no plant quantity or stock size. Delivery, crane/unloading, planting, anchoring and establishment remain separate. These are the simulator's existing catalog references, not a new nursery availability or installed-price quotation.

## Screening result and tradeoff

The corner group hides **92.6% of sampled PCK3 points from the jacuzzi** and **99.8% from the named garden viewpoint**. However, it hides only **49.3% from the seated living room** and **46.4% standing**. Therefore this planting arrangement **does not hide PCK3 completely from all three requested places**.

Moving the former forward pine back toward the corner opens the central garden and removes a prominent crown beside the nearer pool edge. From the raised living room, the same-height crowns then subtend less of the sky and no longer intercept many upper-roof and oblique rays. Some rays leave the left/east plot boundary before reaching the rear planting band. Closer crown overlap within the corner cannot intercept those earlier sightlines.

The previous balanced arrangement is retained as a comparison. It gives materially stronger living-room screening. The existing living-room-priority arrangement is another comparison at the same plant cost, with more exposure around the garden paths.

Counts below are **visible PCK3 sample points / sampled target points**. They are roof/façade sampling fractions, not visible façade area, image pixels, or a whole-property privacy guarantee. All layouts use identical spa-edge geometry and baseline settings.

| View | Previous balanced | Requested corner group | Living-room priority |
|---|---:|---:|---:|
| Living room seated | 41/420 | **213/420** | 0/420 |
| Living room standing | 44/420 | **225/420** | 2/420 |
| Terrace standing | 20/420 | **83/420** | 2/420 |
| Jacuzzi seated | 44/460 | **34/460** | 3/460 |
| Garden preset | 2/420 | **1/420** | 95/420 |
| Sauna seat | 0/460 | **0/460** | 0/460 |
| Sunken fire lounge | 17/420 | **27/420** | 153/420 |
| Terrace left seated | 33/420 | **172/420** | 1/420 |
| Terrace left standing | 7/420 | **161/420** | 0/420 |
| Terrace right standing | 48/420 | **44/420** | 1/420 |
| Loungers seated | 10/420 | **95/420** | 117/420 |
| Dining seated | 95/460 | **95/460** | 118/460 |
| Right garden path | 146/460 | **153/460** | 171/460 |
| Path between pool and lounge | 24/420 | **12/420** | 369/420 |
| Path beyond pool | 26/420 | **53/420** | 244/420 |
| Rear centre path | 56/460 | **56/460** | 56/460 |
| Cold plunge seated | 13/460 | **13/460** | 13/460 |

The sauna already blocks PCK3 with its modeled opaque walls even without trees. Its zero count is not credited to the pines. The garden preset is one particular eye position; other paths have different residuals, as shown above.

## Sunlight comparison

The same dense crown volumes cast shade. Values are **instantaneous sunlit grid points / outdoor sample points**, at Europe/Warsaw local time. Each cell is approximately 1 m; these are not daily solar hours or energy. Columns show **previous balanced → corner group**.

| Date | Local time | Pool | Terrace | Jacuzzi |
|---|---|---:|---:|---:|
| 2026-03-21 | 12:00 | 0/27 → **0/27** | 14/32 → **21/32** | 4/4 → **4/4** |
| 2026-06-21 | 09:00 | 0/27 → **0/27** | 23/32 → **23/32** | 4/4 → **4/4** |
| 2026-06-21 | 12:00 | 13/27 → **13/27** | 25/32 → **32/32** | 4/4 → **4/4** |
| 2026-06-21 | 15:00 | 9/27 → **0/27** | 32/32 → **32/32** | 4/4 → **4/4** |
| 2026-09-21 | 12:00 | 0/27 → **0/27** | 10/32 → **29/32** | 4/4 → **0/4** |

For example, at June 21 noon the pool remains at **13/27 sunlit points**, while the terrace changes from **25/32 to 32/32**. At 15:00 that day the pool changes from **9/27 to 0/27** in this model. The cluster improves terrace sun in some snapshots while increasing afternoon pool shade. Compare the date/time controls before choosing the final planting position.

## Search and checks

Reproduce the machine-readable comparison with:

```sh
node scripts/search-corner-pck3-layouts.mjs
```

The source data is [site-data.json](../data/site-data.json). The proposal uses 4 m hedges, a 0.5 m uniform garden raise over the mapped slope, a 0.5 m hedge inset, no additional raised hedge bed, a 4.2 m terrace depth, the existing 1.2 m living-floor assumption, no canopy and removal of the detached garage. Unverified high rooftop returns remain excluded, matching the established baseline. Tree dimensions were not enlarged and building geometry was not reduced to improve the result.

Candidate centres lie in local **x 11.5–18.5 m / y 31–36 m**, subject to the polygon, crown, ground-feature and occupied-viewpoint constraints. The script examines a **0.25 m grid**, uses a beam of 64 groups with three coordinate-descent passes, and refines at 0.1 m offsets. The objective emphasizes the seated and standing living room, jacuzzi and garden. Pairwise trunk spacing is at least 3 m and group diameter at most 6 m. A separate 2.5 m spacing sensitivity returned the same chosen arrangement. The search is bounded and is **not proof of a continuous global optimum**.

Every reported count is independently rerun through the full visibility engine and checked against the search bitsets. The previous balanced and living-priority coordinates are explicit literals in the study, so changing the application's current default does not silently change the reference comparison. Full settings, observer coordinates, 17-view counts, placement flags and 20 sunlight snapshots are in [corner-screening-comparison.json](corner-screening-comparison.json).

As a diagnostic, the script unions every accepted grid crown plus the final refined corner positions, ignoring the three-tree and spacing limits. Even this impossible overlapping collection of **228 crown positions** leaves **208/420 seated living-room**, **221/420 standing**, and **21/460 jacuzzi** sample points visible. This only diagnoses the sampled candidate region; it is not a continuous upper bound or a feasible planting design.

A literal triangle farther back—(12.2,34.0), (14.9,35.5), (17.6,34.0)—is also recorded for transparency. It is not selected: the middle crown crosses the mapped boundary and the last tree conflicts with the checked occupied-path allowance. Its numerical screening counts must not be presented as a feasible alternative.

All crowns are ideal opaque envelopes. Real branch structure, clear stems, foliage gaps and establishment can expose more of PCK3. The purpose of the new default is to show the requested compact-corner composition and its consequences faithfully, with the previous arrangements available for comparison.
