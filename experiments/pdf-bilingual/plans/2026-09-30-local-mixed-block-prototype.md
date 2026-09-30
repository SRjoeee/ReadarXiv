# Local mixed-content blocks: second bounded prototype

DESIGN §16 delegates PDF experiments to these plans and REPORT. Work stays on `exp/geometry-lock`; no production
reader change. Question: can source-native inline citation/reference/simple-math elements survive local translated
prose replacement without a whole-paper compiler, and what coverage and fitting costs follow?

Before implementation:

1. Extend the cached fixture preparation to retain ordered source fragments and opaque atoms, plus translated runs.
   Validate the original/cache opaque sequence before display. Support simple styling, citations/references and
   simple inline math only. Reject displays, nested units, complex math and unknown macros explicitly.
2. Match unique three-word English contexts immediately before and after each atom inside the paragraph's native
   PDF token range. Require whole PDF text-item boundaries, compatible punctuation, one-line geometry and separate
   non-overlapping atoms. Do not infer a TeX citation's visible name from its key. Any uncertainty rejects the unit.
3. Preserve each supported atom as a bounded crop of the already rendered original canvas, cached per page. Insert
   it into translated run order with its original baseline. Local fitting scales prose and atoms together. Pixel
   crops retain appearance only; they are not selectable math, links, vectors or native PDF export.
4. Keep plain-prose mode for control. Add a mixed-only five-language measurement loop, record source/content and
   native-geometry rejection counts, distinct accepted/failed units, atom provenance, creation versus reuse costs,
   PDF work and local layout costs. Cache analyzed pages during a case so revisiting does not remap or reload.
5. Inspect actual citation and simple-formula replacements, preservation on rejected/table-containing pages, two
   regions updated independently, restore and cached-page navigation. Tables stay source-native pending cell
   geometry; this stage does not claim table translation or repair of the owner's FIT flags.

Boundaries: at most eight local font measurements, 6,000 translated characters, 24 native items per atom and a bounded
pixel crop. Reject missing/reordered/duplicated atoms and off-page geometry before showing an overlay. No relaxing
font floors to hide failures. Full network-cold delivery and production peak memory remain separate acceptance work.
The earlier prototype skill applies; this is an experiment, with real cached-paper observations rather than tests
that merely mirror its code. Required repository typecheck/lint/test/build still run before finishing.

Preflight: whole-text-item boundaries recover only one Japanese simple-math unit and no complete mixed units in
the other four papers; most native text items merge citations with prose. Therefore add a bounded glyph-advance
reader of PDF.js's existing operator list (CanvasGraphics `showText`/text-state semantics), only for positive,
axis-aligned horizontal fonts. Compare source contexts using actual glyph positions, not proportional character
widths. Reject unsupported font/state/rotation and verify extracted positions against the native text layer before
using a crop. This changes step 2 from whole-item boundaries to source-matched glyph boundaries; preserve all
rejection reasons. No formula renderer or PDF drawing interpreter beyond supported text-state operators is added.

The second probe is complete: [results and acceptance limits](../local-block-prototype/MIXED-RESULTS.md). Citations
wrap at native word boundaries; simple math stays whole. An indexed glyph verifier and one source-pixel read per
logical atom avoid repeated whole-page scans and per-word GPU readbacks. All 76 pages surveyed, 11/19 admitted mixed
regions fit; production acceptance remains failed on coverage, overflow and unmeasured full-pipeline costs.
