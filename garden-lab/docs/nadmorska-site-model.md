# Nadmorska 17 — site model evidence

Prepared 15 November 2026 for Garden Lab. This model has its own cadastral geometry, building footprints, terrain and geographic frame. No Sternicza or Korzeniowskiego coordinates are reused.

## Plot area and boundary

The model follows the union of the official GUGiK ULDK polygons for **226101_1.0008.136/2** and **226101_1.0008.135/8**. The union has an area of **709.293 m²**. The two mapped areas are approximately **469.475 m²** and **239.818 m²**.

This differs from **800 m² in the Dom & House advert** and **809 m² in an earlier manual outline**. The simulator retains those numbers separately and displays the discrepancy. It does not enlarge the legal-looking cadastral polygon to make the numbers agree. Boundary geometry alone does not verify ownership, title, access rights or surveyed staking.

The recovered owner-shared cadastral/orthophoto screenshot shows the same two parcel identifiers and the characteristic notch at the northeast end. Vegetation extends outside the drawn boundary at the road corner; whether this explains the area discrepancy is unverified.

## Orientation

The broad garden lies **northwest** of the house. The local +y axis points 303.037° true; +x points southwest, to the viewer's left when looking into this garden.

The opposite southeast edge is a **neighbour boundary**, not a street. The main Nadmorska entry street is northeast, at local −x. Street views use **yaw +90°** in the simulator's convention. Nadmorska also passes the northwest garden edge. The paved southwest access is drawn separately from an approximate 3.8 m strip observed on the official orthophoto; no separate public-road boundary or access right is asserted.

The reproducible EPSG:2180 frame uses:

- Origin: (473943.647708163 E, 728775.125777694 N).
- +x unit: (−0.5499514225004076, −0.8351966432462348).
- +y unit: (−0.8351966432462348, +0.5499514225004076).
- GUGiK house ID: ID-2261-26BC7442-F05E-FAF6-E053-CA2BA8C0FAE4.
- Mapped house footprint: approximately 168.85 m².
- Geographic position: approximately 54.4222533° N, 18.5980656° E.

## Buildings, terrain and source limits

The context includes **52 surrounding building volumes** whose official LoD1 footprints are within 145 m of the mapped plot union. Descriptive labels identify direction and distance; they are not invented postal addresses. The immediately adjacent southeast house is labelled Nadmorska 15 based on the recovered address map.

The existing house and five privacy targets use class-6 roof returns from the **30 September 2024 LiDAR acquisition**. Maximum returns per plan voxel preserve local upper roof samples: 0.6 m for the house, 0.9 m for ordinary targets and 1.4 m for the large northwest building. Reduced samples do not reconstruct every chimney, ridge detail or later alteration. Other buildings keep the official LoD1 ALS median roof height, which is not a measured ridge.

Analytical terrain uses a native **1 m DTM** acquired 30 September 2024, bilinearly sampled in EPSG:2180 / PL-EVRF2007-NH. A separate 4 m grid supplies the surrounding rendered terrain. The property crop spans approximately 1.62–3.17 m above the vertical datum, including the context margin. It is not a detailed survey of steps, curbs or retaining walls.

The source snapshot retains original East/North building footprints, source attributes, the original parcel WKT and SHA-256 digests for the upstream archive, tile, terrain and LiDAR.

## Existing house and proposed garden

The **1.50 m lounge-to-original-garden offset is owner measured**, recovered from Nadmorska17_R4_Original_Plans_Reconciled.pdf. Its registration to the DTM point remains approximate. The house has an integrated garage and a small tower/strych; the upper viewpoints are editable comparison positions, not a claim that a complete second storey exists.

The default concept contains:

- A **7 × 3 m pool**, with its coping checked against the mapped boundary.
- A **10 × 3.8 m raised terrace** and a **1.3 m threshold connector** across the stepped facade.
- An integrated **2.2 × 2.2 m jacuzzi**.
- Stairs, two loungers, a dining area and small stepping stones.
- Four-metre comparison hedges on all property edges, with two proposed access openings on the actual northeast entry edge.

The original lounge is at the southwest short end of the house. The default view looks through proposed northwest side/wraparound glazing into the broad garden. Window positions, finishes, terrace and pool placement, lighting, gates and planting are proposals rather than surveyed existing features.

The recovered utility map shows a **ks200 service through the garden**. The pool concept needs utility-location and clearance confirmation. The model's geometric fit is not construction approval.

## Rebuilding

The generator requires Python with numpy, pyproj, shapely and laspy[lazrs]:

~~~sh
python scripts/build-nadmorska-data.py \
  --source-dir /tmp/nadmorska-sources \
  --building-archive /tmp/gdansk_lod1_2024.zip \
  --download
~~~

This downloads the official originals when absent. Large upstream files are kept outside the repository. The generator checks the parcel area, house containment, complete LiDAR coverage of its targets, presence of roof returns, pool coping, terrace/stairs and observer placement before writing the final JSON.

## Primary sources

- [ULDK parcel 136/2](https://uldk.gugik.gov.pl/?request=GetParcelById&id=226101_1.0008.136/2&result=geom_wkt&srid=2180).
- [ULDK parcel 135/8](https://uldk.gugik.gov.pl/?request=GetParcelById&id=226101_1.0008.135/8&result=geom_wkt&srid=2180).
- [GUGiK Gdańsk LoD1 2024 archive](https://opendata.geoportal.gov.pl/InneDane/Budynki3D/LOD1/2024/22/2261.zip), tile 2261_N-34-50-c-a-4-4.gml.
- [GUGiK 1 m DTM](https://opendata.geoportal.gov.pl/NumDaneWys/NMT/81008/81008_1561305_N-34-50-C-a-4-4.asc).
- [GUGiK LiDAR tile](https://opendata.geoportal.gov.pl/NumDaneWys/DanePomiaroweLAZ/81005/81005_1559704_N-34-50-C-a-4-4-3-1.laz).
- [GUGiK high-resolution orthophoto service](https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/HighResolution).
- [Dom & House DH292716 advert](https://www.domhouse.pl/property/dom-sprzedaz-267m2-jelitkowo-gdansk-pomorskie-dh292716/) for the advertised area and general house description.
