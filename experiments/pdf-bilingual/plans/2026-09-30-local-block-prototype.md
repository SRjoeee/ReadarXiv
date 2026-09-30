# Local block replacement: bounded prototype

2026-09-30. Experiment only, on `exp/geometry-lock`. DESIGN §16 delegates the reader experiments here; the production
reader and its TeX path are unchanged. Question: can a cached translation update only its original PDF region,
without whole-document TeX, and what are the startup, local fitting and painting costs?

## Implementation before measurement

1. Reuse the existing TeX front end and cached translations to prepare five source/text fixtures, one per language.
   Record preparation time separately; do not compile a marked original to obtain geometry.
2. Load the actual original PDF through PDF.js. Reuse `anchors.mjs` to map source prose to its native text, lazily
   per viewed page. Record extraction and mapping times and coverage. Reject uncertain, overlapping, cross-column
   or mixed/protected units; simple bold/italic/code groups may be retained as local styled spans rather than hiding their content. Such rejection counts against usable coverage.
3. In a throwaway browser page, preserve the original canvas. Fit eligible prose in a fixed native rectangle with
   browser typography and a bounded search over font size; language font assets come from the existing TeX tree.
   Each replacement owns only its region. Restore removes that region. No TeX or PDF reload on updates.
4. Measure actual font loading, PDF startup/render, native extraction, anchoring, first local replacement and repeated
   replacements. Count the PDF renders and compile requests. Capture images for overflow and geometry inspection.
   Compare a plain local overlay to bounded local fitting with identical cached text; do not equate this baseline
   to the current BusyTeX pipeline or claim a whole-pipeline speedup without that measurement.

## Scope and acceptance

- Five cases: zh RT-1, ja 2608.05876, ko 2608.21180, de 2608.06701, ru 2608.24839. Also inspect a protected-content page.
- Include the source/content coverage denominator and all rejection reasons with the timing table. Fast updates on
  a small subset cannot establish whole-paper suitability.
- Prototype display only, not a native PDF writer: source graphics/equations remain in the original PDF and are
  painted once per displayed page; mixed-content paragraph replacement, complex style fidelity and export remain
  explicit limitations. A new drawing on zoom is separate from a translation update.
- No full-document trial, no update of untouched regions, no hidden overflow. If readable text will not fit, keep
  the original and record failure. Initial policy is experimental and must not be described as language-validated.
- Produce a runnable local demo, measurements and an engineering verdict before proposing production integration.

The prototype skill's single-file/no-server default is adapted here: native PDF.js module, worker and real cached PDF
fixtures require an HTTP origin. Reuse localhost tooling and offer one command; no framework or external API calls.

The first probe is complete; see [measurements and verdict](../local-block-prototype/RESULTS.md). Local updates avoid
document compilation, but only five of nine sampled regions fit. Production acceptance remains failed on coverage,
overflow and unmeasured cold-delivery costs. The protected-content inspection used RT-1 page 3.
