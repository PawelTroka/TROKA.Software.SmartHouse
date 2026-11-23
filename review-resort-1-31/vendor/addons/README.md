# Three.js postprocessing

Pinned to **Three.js r160**, matching `../three.module.js`.

Source: https://github.com/mrdoob/three.js/tree/r160/examples/jsm

The MIT license is retained at `../THREE-LICENSE.txt`. The only vendor-source
change is rewriting bare `three` imports to the existing local module. The
application wrapper in `src/architectural-renderer.js` filters transparent
surfaces from the normal pass and completes disposal of two r160 materials.

These modules implement linear HDR composition, ground-truth ambient occlusion
(GTAO), edge-aware Poisson denoising and final display tone mapping. GTAO is a
screen-space approximation; it is not path tracing or global illumination.
