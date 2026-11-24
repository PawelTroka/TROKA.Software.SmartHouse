# Garden Lab 1.30 — Sternicza surroundings and sea-view height

This update makes the neighbourhood around Sternicza 11 substantially more
recognisable by adding measured surrounding vegetation, sampled ground
colours, distinct neighbouring façades and improved roof shapes. A separate
sea-view tool examines the full measured land corridor to the coast, including
obstructions beyond the existing 200 m neighbourhood model.

The release combines geospatial measurements with explicitly labelled visual
interpretation. It does not claim a complete current-day photogrammetric
replica or a surveyed record of every tree, window and building detail.

## What is included

| Addition | Evidence and meaning | Effect on analysis |
|---|---|---|
| **490 surrounding vegetation groups** | **440 canopy and 50 shrub-sized aggregates**, derived from 1,268,778 classified GUGiK returns within 200 m. These are groups of sampled vegetation, not 490 individually located trunks. | Dense leaf-on crown envelopes can participate in the optional existing-canopy screening scenario. Reconstructed stems receive no analytical screening credit. |
| **20 municipal tree inventory records** | Actual public Gdańsk records with position, species, status and supplied circumference/planting dates. Heights and crown widths are absent from this inventory. | Kept separate from LiDAR crowns; proximity alone does not transfer a species or a recent planting to an older measured canopy. |
| **Sampled ground colours** | A 256 × 256 RGBA image at 2 m resolution, derived from 3,791,876 class-2 ground returns. Upper vegetation, buildings and the editable property are masked. | Visual only. It does not affect terrain levels or sightline calculations. |
| **Nine measured neighbour roof extracts** | At most 150 class-6 roof samples per building, with filtered sparse surface reconstruction for sloping roofs, lower wings and the wall/roof seam. | The resolved envelope is shared by the renderer, local privacy rays and sunlight calculations. Original source records and LoD1 values remain intact as provenance. |
| **Three PCK roof assemblies** | Flat decks, a central pyramidal skylight and six separate chimney stacks per block, reconstructed from measured return clusters and the supplied oblique views. Fixture plan extents and framing remain estimates. | The same resolved deck and fixture surfaces obstruct local privacy and sunlight rays. Separate optional high-feature samples retain their existing sensitivity control. |
| **Twelve building appearance profiles** | Distinct broad colour fields, opening rhythms, stairwell windows, balconies and entrance details interpreted from the supplied reference views. | Visual only. Profiles are estimates, not an exact opening survey; the recorded blank garden wall has priority. |
| **Sea-view height tool** | A complete historical surface/terrain profile to an official shoreline, with separate finite-water and distant-horizon questions. | A separate geometric calculation with explicit coverage checks, a shared height datum and a user-adjustable clearance allowance. |

## Source dates and accuracy

The vegetation, roof samples and terrain/surface rasters were acquired on
**1 October 2024**. Three additional LiDAR tiles were retrieved on
**22 November 2026** to complete the local surrounding coverage. Their
retrieval date does not make the scan a 2026 survey. Growth, removals,
replanting and subsequent building changes may differ from the recorded scene.

The municipal tree inventory was queried on **22 November 2026**. Its exact
public response and code-domain metadata are retained alongside the provenance
documentation, because the live inventory can change. Some planting records
postdate the LiDAR acquisition and are therefore not merged into the older
canopy reconstruction.

The six visual reference screenshots were supplied on **22 November 2026**;
the acquisition dates of their underlying aerial and oblique views are not
established. Façade colours, repeated window configurations and balcony
dimensions remain visual estimates. Concealed elevations retain illustrative
details, and official building identities keep the observed profiles attached
to the correct mapped objects.

The source coordinate frame is unchanged: EPSG:2180 for the geographic
geometry and PL-EVRF2007-NH for elevations. The recorded source hashes,
acquisition dates, bounded derived geometry and separate appearance records
make the distinctions reviewable.

## Appearance and seasonal behaviour

Surrounding crowns now occupy positions and height envelopes supported by
classified laser returns, including the prominent street-side canopy in front
of the house. Instanced foliage and branch geometry provide visual detail;
branch topology and trunk positions are reconstructed. The original scan does
not identify deciduous or evergreen species for these groups. Summer/winter
canopy modes are exploratory appearance and screening choices.

Leaf colour blends use photographic RGB as a modest source hint. Those colours
contain acquisition lighting, shadows and October foliage, so they are not
treated as measured leaf albedo. The ground image likewise remains a sampled
colour approximation rather than a full orthophoto or a grass/paving survey.
It preserves 17,000 measured surface-colour cells and six nearby inferred
cells after masking; unobserved regions use the context material.

Neighbouring façades now distinguish the cream/blue, ochre and muted green
fields visible on the PCK blocks, with their apparent opening levels and
balcony stacks. Nearby houses have separate observed tones and approximate
street- and garden-facing bay arrangements. The nine measured roof reconstructions add
height variation without inventing roof ridge heights from photographs.

The 23 November screenshot comparison corrects the three PCK blocks to five
residential window rows, with small basement openings recorded separately.
The garden/street elevations use four principal opening columns; the observed
side elevations use three balcony stacks. Face-specific colour fields and
entrance positions follow the visible references. These corrections change
the finish and opening layer, not measured building heights or footprints.

The visual review also identified a roof reconstruction error at the west
neighbour, building 4h: a single continuous surface joined the main roof to
separate lower extensions with steep dark triangles. Separate measured roof
patches now meet vertical wall transitions. Supported ridge and eave samples
remain in the reconstruction, while the positions of the level changes are
estimated between neighbouring samples. The 24 November follow-up makes the
resolved roofs and walls the common local obstruction geometry for rendering,
privacy and sunlight. A second median-height prism is no longer retained under
a measured lower wing. Buildings without a supported reconstruction keep their
existing LoD1 fallback; the editable house and garage retain their dedicated
geometry. The separate sea-corridor calculation continues to use its measured
surface raster.

The same follow-up registers a façade profile across its complete facing
elevation, including cadastral subdivisions and parallel walls at setbacks.
Short mapped edges no longer discard the observed openings or restart the bay
pattern. Generic and observed sides share the same house floor datum. Broad
grouped windows, the garden balconies at 9a, the recessed garden loggia at 13a,
and PCK 5's horizontal side colour fields follow the supplied views. The upper
terrace/back-wall arrangement at opposite 5/7 remains unresolved; a door is not
drawn floating above its measured low wing.

On PCK 1, 3 and 5, a continuous triangulation through rooftop returns previously
joined separate chimneys and the central skylight into broad dark mounds. Each
roof now has a flat deck and separate reconstructed features. Their top heights
are bounded by the corresponding source clusters. Small unclassified returns
already present in the roof samples are represented separately with an explicit
estimated thickness, rather than widening the roof surface around them. These
are distinct from the optional, higher PCK 3 feature samples, which remain off
by default. Neither raw roof returns nor source target samples are rewritten.

Ten measured canopy centres fall inside mapped building footprints. Their
foliage remains present, but reconstructed trunks and branches are omitted at
those centres: an overhanging crown does not establish a trunk growing through
a roof. The exclusion follows the current building footprints when a building
position is adjusted. The measured vegetation and numerical screening model
remain unchanged.

## Sea-view interpretation

The sea panel reports **eye height above the original local ground**, not the
height of a proposed floor or building. It distinguishes a finite patch of
water beyond the shore from the first distant sea near a geometric horizon.
Its best bearing is the best of the sampled directions, not a proof of a
continuous global optimum.

The full corridor calculation uses the historical surface model, including
tree canopy and buildings outside the rendered near scene. Missing source
coverage or an unverified water segment cannot produce a confirmed clear
result. The neighbourhood camera remains a preview; an infinite decorative
sea plane does not establish visibility. Current results, source versions,
geometry and limitations are documented in the
[sea-view implementation notes](sea-visibility-1.30.md).

## Reproduction and review

- [Nature and ground provenance](sternicza-nature-provenance.md) records the
  four LiDAR sources, extraction parameters, public municipal snapshots and
  exact reproduction commands.
- [Neighbouring-building appearance](sternicza-appearance-observations.md)
  records the twelve visual profiles and nine measured roof extracts.
- [Sea visibility](sea-visibility-1.30.md) records the surface, terrain,
  shoreline, corridor selection and calculation.

The application uses compact local JSON/PNG assets; rendering does not depend
on live municipal or national GIS service availability. Original LAZ/ASC
downloads and intermediate point arrays remain outside the application.
Intermediate NPY output is opt-in, and Python bytecode caches are ignored.
No uploaded screenshot is redistributed as an application texture or source
asset.

Data checks cover stable identities, finite and bounded geometry, valid crown
height ordering, preservation of the property frame, and separate measured
versus interpreted fields. The implementation's functional and browser
validation should be reviewed with the release evidence; these provenance
notes do not substitute for those checks.
