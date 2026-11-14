# Pictured tree placement: verification and explicit application

Verified on 14 November 2026 for Garden Lab 1.15.1, state schema 17.

## What the attachment establishes

The latest attachment, `image(20261114-205953).png`, and the earlier
`image(20261114-005857).png` are both 2048 × 1346 pixels. Their decoded RGB pixels
are identical: the pixel difference has no nonzero bounding box. The decoded
RGB SHA-256 is
`4fc6470366ff099d114fb1f5dd4aa685ed7318065fbabfe6d119f1e66705181a`.
The PNG file hashes differ, so the comparison uses decoded pixels rather than
file bytes.

The picture is a whole-plot plan with the street at the top and the rear garden
at the bottom. Physical left when looking from the house into the garden is
east, on the **right of this plan**. The picture places one pine near that east
edge, forward of a pair along the rear edge. It does not place all three trunks
in a line or in the middle of the lawn.

The calibration uses the mapped parcel outline (20.3209 m street frontage,
38.2141 m maximum depth) and the circular crown outlines. At the attachment's
resolution these establish a scale of approximately **14.38 pixels per metre**.
The crown outline centres coincide with the trunk positions in the SVG source;
the displaced dimension labels are not planting points. Robust circle fits to
the visible outline pixels give the following approximate image centres:

| Tree | Image centre, pixels | Retained local x, m | Retained local y, m | Applied height, m | Crown diameter, m |
| --- | --- | ---: | ---: | ---: | ---: |
| T1 | 1200.48, 995.07 | 19.30 | 30.20 | 10.00 | 6.00 |
| T2 | 1120.83, 1075.85 | 13.80 | 35.80 | 10.00 | 6.00 |
| T3 | 1187.74, 1072.43 | 18.45 | 35.57 | 10.00 | 5.00 |

The retained coordinates agree with the image to about one screenshot pixel,
roughly 0.07 m. They are concept coordinates reconstructed from the picture,
not a survey. There is no evidence for a further displacement of the three
reference trunk centres, so this release does **not** invent a geometry change.

The picture labels T3 as 9.5 m; the user's subsequent explicit instruction that
all three trees be 10 m is retained. The picture also shows an earlier 6 m pool
near the house. The latest 8 × 3.5 m pool beside the trees remains the default,
as requested separately. Applying the tree reference preserves whichever pool
layout the user currently has selected.

## Why the displayed design can differ

The application intentionally preserves valid saved and shared custom designs.
In particular:

- A versioned URL hash takes precedence over local saved state on opening.
- Changing the garden layout preserves custom tree arrays.
- Previous normal edits saved local state but left an existing shared hash in
  the address bar. Reloading that URL could therefore restore the linked tree
  positions, rather than the newer locally saved positions.

These are verified application behaviours. They are possible explanations for
a repeated mismatch; they do not establish which state the user was viewing.

## New explicit action

The screening controls now place **Apply pictured tree positions** directly
under the garden layout selector. The action:

1. Replaces the current tree array with exactly the three reference pines above.
2. Preserves the selected pool, hedge heights and perimeter options, viewpoint
   values and entered garden budget amounts. Per-tree prices are retained when
   their nursery type still matches the reference tree.
3. Opens the dimensioned whole-plot plan, so the resulting positions are visible
   in the same orientation as the supplied picture.
4. Saves the corrected state locally **and replaces the current URL hash** with
   its encoded state, preventing an older shared hash from restoring previous
   positions on the next reload.

A live status distinguishes a picture match from custom positions or sizes;
when different, it identifies whether the design was opened from saved state or
a shared link. An expandable coordinate table makes the three reference
positions and 10 m heights inspectable. The action is available for every
Sternicza garden programme, including historical and custom designs. Other
properties and saved comparison scenario A are not overwritten.

No state-schema change or automatic reset is required: the existing reference
geometry and schema 17 remain unchanged. All historical scenarios are retained.

## Targeted verification

`node --test tests/reference-planting-action.test.mjs tests/reference-pool-layout.test.mjs tests/state.test.mjs`
passes **33 tests, 0 failures**. The new behaviour checks cover preservation of
pool/hedge/viewpoint/budget fields, immutable reference records, custom and
historical states, geometry-based match status and corrected shared-link round
trips. Browser validation should additionally exercise the visible action from
an old shared URL, reload it, and confirm the dimensioned whole-plot result.

Screening percentages, crown-overhang and pool-clearance assumptions are
unchanged; see [the existing reference-layout study](reference-pool-screening-comparison.md).
