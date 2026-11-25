# Material reference library

The library contains **32 CC0 source PBR sets** and **nine documented derivatives**: eight mortar-free unit samples and an undyed bouclé study. The original six baseline sets remain byte-for-byte unchanged. These are representative renovation finishes, not photographs or measurements of Sternicza 11.

Sources are [Poly Haven](https://polyhaven.com/license) and [ambientCG](https://docs.ambientcg.com/license/). Both licenses permit redistribution and modification. The application serves its own files and makes no runtime calls to either provider. `manifest.json` records each author, source/download URL, original checksums, delivered checksums, dimensions, physical size, derivation, and measured compression error. Poly Haven API dimensions are millimetres; ambientCG dimensions are centimetres. Marble 012 and Porcelain 001 have explicitly authored repeat sizes because their provider gives no physical dimensions.

## Sources

| Source material | Authors | Source resolution | Physical repeat |
| --- | --- | --- | --- |
| [Fine Grained Wood](https://polyhaven.com/a/fine_grained_wood) | Rob Tuytel | 1K | 0.600 × 0.600 m |
| [Grass Ground](https://polyhaven.com/a/grass_ground) | Charlotte Baglioni | 1K | 2.510 × 2.510 m |
| [Rough Linen](https://polyhaven.com/a/rough_linen) | colormass, Rico Cilliers | 1K | 0.271 × 0.271 m |
| [White Stucco](https://polyhaven.com/a/white_stucco) | Amal Kumar | 1K | 1.998 × 1.998 m |
| [Marble 01](https://polyhaven.com/a/marble_01) | Rob Tuytel | 1K | 1.500 × 1.500 m |
| [Wood Floor Worn](https://polyhaven.com/a/wood_floor_worn) | Dimitrios Savva | 1K | 2.000 × 2.000 m |
| [White Plaster 02](https://polyhaven.com/a/white_plaster_02) | Rob Tuytel | 1K | 1.000 × 1.000 m |
| [Clay Plaster](https://polyhaven.com/a/clay_plaster) | Amal Kumar | 1K | 2.000 × 2.000 m |
| [Oak Veneer 02](https://polyhaven.com/a/oak_veneer_02) | Jenelle van Heerden | 1K | 1.000 × 1.000 m |
| [Natural Walnut Veneer](https://polyhaven.com/a/natural_walnut_veneer) | Jenelle van Heerden | 1K | 1.000 × 1.000 m |
| [Teak Veneer](https://polyhaven.com/a/teak_veneer) | Jenelle van Heerden | 1K | 1.000 × 1.000 m |
| [Ash Veneer](https://polyhaven.com/a/ash_veneer) | Jenelle van Heerden | 1K | 1.000 × 1.000 m |
| [Japanese Cedar Planks](https://polyhaven.com/a/japanese_cedar_planks) | Charlotte Baglioni, Rico Cilliers | 1K | 1.130 × 1.130 m |
| [Wood Planks Grey](https://polyhaven.com/a/wood_planks_grey) | Rob Tuytel | 1K | 1.500 × 1.500 m |
| [Wood Textured Concrete](https://polyhaven.com/a/wood_textured_concrete) | Dimitrios Savva | 1K | 1.800 × 1.800 m |
| [Red Brick 03](https://polyhaven.com/a/red_brick_03) | Rob Tuytel | 1K | 1.000 × 1.000 m |
| [Terracotta Floor Tiles](https://polyhaven.com/a/terracotta_floor_tiles) | Dimitrios Savva | 1K | 2.080 × 2.080 m |
| [Terrazzo Tiles](https://polyhaven.com/a/terrazzo_tiles) | Amal Kumar | 1K | 2.000 × 2.000 m |
| [Roof Slates 03](https://polyhaven.com/a/roof_slates_03) | Rob Tuytel | 1K | 3.000 × 3.000 m |
| [Slate Floor](https://polyhaven.com/a/slate_floor) | Dimitrios Savva | 1K | 2.290 × 2.290 m |
| [Wool Boucle](https://polyhaven.com/a/wool_boucle) | colormass, Rico Cilliers | 1K | 0.315 × 0.390 m |
| [Brown Leather](https://polyhaven.com/a/brown_leather) | Rob Tuytel | 1K | 0.400 × 0.400 m |
| [Oak Wood Planks](https://polyhaven.com/a/oak_wood_planks) | Dimitrios Savva | 1K | 1.200 × 1.200 m |
| [Herringbone Parquet](https://polyhaven.com/a/herringbone_parquet) | Jenelle van Heerden, Sergej Majboroda | 2K | 3.400 × 3.400 m |
| [Clay Roof Tiles 02](https://polyhaven.com/a/clay_roof_tiles_02) | Amal Kumar | 1K | 2.500 × 2.500 m |
| [Red Sandstone Tiles](https://polyhaven.com/a/red_sandstone_tiles) | Amal Kumar | 1K | 2.050 × 2.050 m |
| [Travertine 003](https://ambientcg.com/a/Travertine003) | Lennart Demes / ambientCG | 2K | 1.200 × 1.200 m |
| [Tiles 139](https://ambientcg.com/a/Tiles139) | Lennart Demes / ambientCG | 1K | 2.000 × 2.000 m |
| [Concrete 034](https://ambientcg.com/a/Concrete034) | Lennart Demes / ambientCG | 1K | 1.100 × 0.550 m |
| [Velour Velvet](https://polyhaven.com/a/velour_velvet) | colormass, Rico Cilliers | 1K | 0.284 × 0.273 m |
| [Porcelain 001](https://ambientcg.com/a/Porcelain001) | Lennart Demes / ambientCG | 1K | 1.000 × 1.000 m (authored) |
| [Marble 012](https://ambientcg.com/a/Marble012) | Lennart Demes / ambientCG | 1K | 2.000 × 2.000 m (authored) |

## Delivery and fidelity

The full unique PBR library is approximately **42.6 MB**. New downloads are delivered as quality-94 JPEGs with 4:4:4 colour; roughness stores the green channel as grayscale. The unusually sensitive Concrete 034 normal uses quality 96. Every compressed normal has a measured 95th-percentile angular error below 4 degrees relative to its verified source; every channel's mean error is below 3/255. The original six baseline triplets retain their original bytes and calibration. Colour-calibrated catalogue previews total **1.142 MB** across 118 deduplicated 256 px JPEGs for 184 style/role samples. They are generated from the production material colours and map treatment, so linen, velvet and painted finishes match their selected palettes. Separate source-reference previews total approximately 455 KB. Browsing the cards does not preload full PBR sets.

Most source maps are 1K. The 2K travertine and herringbone parquet preserve the larger vein and parquet fields used on prominent interior surfaces. Non-square provider maps retain their aspect ratios, including linen, wool and concrete. Unit crops retain source texel density and are never enlarged into fake 1K textures.

The sources include photographed/scanned surfaces and authored PBR materials. The ambientCG technique is recorded per set. This collection improves material specificity; it does not claim that the entire garden renderer is photorealistic or that a sample is a specified manufacturer product.

## Rendering decisions

- Albedo is decoded as sRGB. OpenGL tangent normals and roughness remain linear; diffuse colour is never treated as a height map.
- Natural stone, brick, terracotta, leather and most wood retain their native albedo. Paint, cloth, whitewashed/charcoal timber, walnut, sandstone and terrazzo use the selected palette while retaining the photographed variation. Current keeps its existing mean-calibrated treatment.
- Oak, ash, walnut, teak and cedar have independent source grain. Furniture-member UVs follow the long axis of each post or rail. Flooring and facade maps have measured metre scales.
- Deck UVs cancel the model's board-module normalization exactly once. Wood scans whose fibres run along U rotate to follow the actual board direction. Small same-material samples provide pores/grain where geometric paving supplies the joints; they do not paint a second grout grid over that bond.
- Painted weatherboards, penny tiles, zellige, mosaic, encaustic patterns and riverstone retain authored patterns where no matching full photographic bond is supplied. Their independent normal fields retain their respective joints, courses and relief.
- Bouclé uses the measured loop normals and roughness from Wool Boucle. Its black/white yarn dye is normalized locally for a cream-upholstery study; this derivative is disclosed in the manifest. Velvet and leather have separate measured PBR sets. Bedding and lamps remain linen when seating is leather.
- Some named renovation finishes remain material studies: charcoal timber is a palette-treated cedar scan, and the dark-stone/basalt study uses slate detail. They are not presented as surveyed finishes or manufacturer samples.

## Ownership and lazy loading

The scene owns texture handles; decoded source pixels are shared across handles and renderers. Disposal removes a handle and clears its bitmap reference without invalidating live clones. Unused decoded source data is bounded to **48 MiB**, with least-recently-used idle entries released first. Active sources are never evicted. Optional interior slots are deferred until their material is attached to the built model; the existing architectural UV traversal activates only those materials. Replacement maps are disposed with their owning scene/material.

The complete per-style conservative transfer inventory is in [material-transfer-budget.json](../../docs/material-transfer-budget.json). Exterior selections use 3.8–8.3 MB. All optional interior slots together use 9.3–17.4 MB; actual models can use less because unused slots never load. A combined interior/exterior concept adds 7.3–15.3 MB of unique new URLs beyond the shared 8.44 MB baseline garden files. HTTP/browser caching shares downloads between views and revisited styles.

## Reproduce and verify

```sh
python scripts/vendor-renovation-materials.py
python scripts/prepare-material-catalogue.py
node scripts/prepare-style-material-swatches.mjs
node scripts/material-transfer-report.mjs
node --test tests/photographic-materials.test.mjs tests/exterior-materials.test.mjs tests/renovation-materials.test.mjs tests/style-material-swatches.test.mjs
```

The download script uses each provider's documented public API with an identifying User-Agent. The preparation script preserves provenance while generating delivery compression, unit crops, previews and `src/material-asset-data.js`. Tests exercise checksum integrity, finish identity, all style samples, unit selection, physical UV scale/orientation, deferred loading, live-clone ownership, decoded-cache limits and quantified delivery error.
