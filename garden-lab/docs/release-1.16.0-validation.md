# Garden Lab 1.16.0 validation

Checked 14 November 2026. State schema **18**. Scope: seven priced screening-tree alternatives, species comparison at existing positions, the new three-tree Excelsa default, realistic conifer silhouettes and safe migration of earlier designs.

## Source and automated checks

- Full `npm test`: **370 passed, 0 failed**.
- `npm run build`: successful; **48 public assets**. All runtime cache keys and package metadata use **1.16.0**.
- `git diff --check`: clean.
- Catalogue tests cover all seven new unit prices, VAT metadata, fixed EUR conversion, published versus assumed widths, quote-required dimensions and separate service costs. The existing seven catalogue IDs and prices remain available.
- Species-edit tests verify immutable position/ID/rotation/inclusion preservation, independent selected-tree replacement, all-tree replacement, clearing an old species quote and clearing a custom quote after resizing.
- Renderer tests verify contained conifer vertices under rotation and asymmetric dimensions, distinct thuja/fir/spruce forms, deterministic specimens, isolated colour materials, shadow envelopes, disabled/invalid handling and lightweight SVG complexity. Existing pine rendering tests still pass.
- State/layout tests cover literal v17 pine restoration, v1–v16 migration, the schema18 defaults, explicit empty planting, all new IDs, custom prices, other properties and share-state round trips.
- Explicit planting-action tests verify both Excelsa and original-pine actions, preserving other design settings and dropping incompatible species quotes.
- The historical perimeter-analysis script now explicitly selects the original pictured pines rather than inheriting the new fresh default.

## Hosted preview verification

Preview path: `review-tree-alternatives-1-16/`. Its storage namespace is isolated from production. The preview commit was `05e493a629f932c86648b3f4989e9ab67a313947`; the [Pages build](https://github.com/PawelTroka/TROKA.Software.SmartHouse/actions/runs/43647690672) served the updated interface.

1. Opened a fresh schema18 link. Version metadata is **1.16.0**; the UI identifies three **9 m Excelsa / 2 m crowns**. The selected third tree is at **18.45, 35.57 m**. Plant supply reads **28,500 PLN** and the per-tree price shows VAT confirmation is needed. The full tree-service planning range remains separate from the plant subtotal.
2. Checked all seven new choices through the live controls. Three-plant supply displayed **28,500; 67,500; 39,603; 8,400 net; 24,900; approximately 79,645; and 84,000 PLN**, with the expected heights and crown widths. The 7 m Nordmann crowns trigger the existing boundary/hardscape warnings.
3. Saved Excelsa as A, replaced all trees with white fir and toggled A/B. A restored Excelsa; B restored white fir. Replacement retained the pictured positions and showed 9 m height, 4.5 m width and **67,500 PLN** in plant supply.
4. Entered a **50,000 PLN** custom quote, then enlarged that white fir's width to **6 m**. The old quote cleared to zero and the UI displayed **Custom size · plant quote needed**.
5. Replaced only the selected third tree with Norway spruce. The first two remained white firs, the third adopted 9.5 m / 3 m defaults, and its coordinates stayed **18.45, 35.57 m**. The price note explicitly identified the assumed crown and **€3,070 × 4.30** conversion. Reload preserved this mixed planting without requiring another Share click.
6. Restored the original pine reference. The UI showed three 10 m pines and **179,700 PLN** plant supply. Opening a sparse **v17** link also restored that original reference.
7. Clicked **Apply 9 m Excelsa** from the legacy planting, then reloaded. The three new trees, matching status and **28,500 PLN** supply persisted.
8. Switched to **Korzeniowskiego 40**. It still had **0 / 12 trees**, no screening-tree cost and no Sternicza-only planting actions.
9. Visually inspected the terrace eye-level view and new price/replacement controls. [Screenshot](../tree-alternatives-1.16.0.jpg). The displayed Excelsa PCK3 result was **2,908 / 5,214 facade samples visible** and **348 / 365 roof samples visible**, matching the independent analysis.

### Rendering coverage

This hosted browser reports WebGL as disabled. The app correctly selected its existing SVG fallback and rendered the new conifers. Browser console errors inspected were the expected WebGL-context creation failures preceding fallback. Live WebGL and mobile viewport rendering were **not** verified in this environment. WebGL geometry, analytical containment, material cleanup and shadow-envelope behavior were reviewed in code and covered by the mesh tests; this is distinct from a live GPU visual check.

## Reproducible screening comparison

The [comparison script](../scripts/compare-tree-alternatives.mjs) ran successfully. All **nine cases × seven fixed viewpoints** were checked against the documented facade and roof tables, and the literal case geometry was checked against current application presets. Price references and tax bases are recorded separately from unquoted installation.

The [comparison report](tree-alternatives-2026-11-14.md) records the much weaker Excelsa screening and the space implications of wider alternatives. No result is presented as complete real-world concealment, and no future growth or unmeasured supplier crown is credited as verified stock.

## Publishing procedure

Merge the reviewed source PR to `main`, build the merged source, and publish its `public/` assets to the `gh-pages` root while preserving existing review directories. Verify the resulting Pages workflow and the live schema18 default after deployment. The main publication and its final browser check are performed after this source validation record is committed.
