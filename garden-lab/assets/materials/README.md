# Photographic PBR material assets

These are original 1K albedo, OpenGL tangent normal and roughness files from [Poly Haven](https://polyhaven.com/), under [CC0 1.0](https://polyhaven.com/license). They are self-hosted; the application never calls the Poly Haven API. The images are representative finish samples, not photographs or measurements of Sternicza 11.

The source files are unmodified. `manifest.json` records each download URL, author, dimensions, bytes and verified MD5/SHA-256 hash. Asset dimensions come from the Poly Haven API in millimetres and are converted to metres.

| Material | Source | Author | Repeat size |
| --- | --- | --- | --- |
| Fine Grained Wood | [fine_grained_wood](https://polyhaven.com/a/fine_grained_wood) | Rob Tuytel | 0.600 × 0.600 m |
| Grass Ground | [grass_ground](https://polyhaven.com/a/grass_ground) | Charlotte Baglioni | 2.510 × 2.510 m |
| Rough Linen | [rough_linen](https://polyhaven.com/a/rough_linen) | colormass, Rico Cilliers | 0.271 × 0.271 m |
| White Stucco | [white_stucco](https://polyhaven.com/a/white_stucco) | Amal Kumar | 1.998 × 1.998 m |
| Marble 01 | [marble_01](https://polyhaven.com/a/marble_01) | Rob Tuytel | 1.500 × 1.500 m |
| Wood Floor Worn | [wood_floor_worn](https://polyhaven.com/a/wood_floor_worn) | Dimitrios Savva | 2.000 × 2.000 m |

## Rendering

Albedo uses sRGB decoding. Normal and roughness maps remain linear; albedo is never used as a height map. At load time, diffuse samples are normalized in linear light against their measured channel means and smoothly bounded before applying the selected style palette. Diffuse reflectance is capped below 1, preventing bright outliers on pale timber or linen. This runtime treatment preserves photographed surface variation without multiplying two brown colours. Source JPEGs are unchanged. Surface geometry receives metre-scaled UVs. Plank and tile recipes retain their own physical bond; their joints are never replaced with a contradictory photographic grid. Source image data is shared, while texture handles are owned and disposed by each scene. The six source triplets total 10.00 MB.

Photographic surfaces are used where the sample is appropriate: fine wood grain, linen, grass, white stucco, marble tiles and selected worn plank floors. Other construction finishes retain their designed procedural material patterns and independent linear roughness/normal maps. These assets improve material fidelity; they do not establish photorealism for the complete renderer.
