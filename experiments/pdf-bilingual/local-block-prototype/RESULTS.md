# Local PDF block replacement: first performance probe

2026-09-30. Experimental viewer, not integrated into the extension. The question was whether cached translated prose
can update locally without recompiling the paper. **Yes for the supported subset; production acceptance fails on
coverage and fitting quality.** This does not establish an end-to-end speedup or solve the owner's FIT flags.

Run from the geometry-lock worktree:

```bash
pnpm exec tsx experiments/pdf-bilingual/spikes/local-block-prototype.mjs
```

Open `http://localhost:8091/`. The server needs the existing five corpus PDFs, source archives, translation caches and
TeX font tree. `AXT_PROTOTYPE_FONT_ROOT` overrides its font directory; `PORT` overrides 8091. No paid API, translator,
TeX compilation or new dependency is used. Font assets were present locally; this probe needs no TeX server addition.

## Method and evidence

Original, unmarked arXiv PDFs are loaded through PDF.js. The existing source front end and translation cache prepare
source/text fixtures once on the server. Native PDF text is extracted and matched page by page through `anchors.mjs`.
Conservative geometry checks reject unsafe bounding rectangles. Each accepted candidate owns a DOM region above the
unchanged source canvas. Local font size is tested at 1.0, then at the 0.90 floor, then at most five binary-search
steps plus a final measurement: at most eight layout measurements per update. Text over 6,000 characters is rejected.
No larger-font, tracking or leading search is implemented. Browser emergency wrapping is enabled; natural typography
and full source style fidelity have not been accepted.

Three standalone rounds used Chrome 154 on this machine (14 logical processors reported, device pixel ratio 2),
cached translations, local HTTP with no-cache responses, and a reused browser context. Each round searched from page
1 to the first page with an eligible candidate, tried each distinct candidate once, then alternated 30 fitted
updates and 30 native-size overlay controls per language. Those are repeated checks on nine distinct regions, not
90 distinct paragraphs per language. Failures are included in timing samples. The control is a local overlay, not
the production BusyTeX pipeline. No network-cold, live translation, concurrent-reader or process-memory benchmark
was performed. Two requestAnimationFrame callbacks mark a paint opportunity, not verified compositor presentation.

Raw local evidence (ignored scratch data, preserved on this machine):

- `../data/runs/local-block-prototype/run-{1,2,3}.json`: final five-case rounds, all failures and page rejection reasons.
- `../data/runs/local-block-prototype/two-block-evidence.json`: the second update retained the first region's node
  identity and text; no PDF render/load was added.
- `../data/runs/local-block-prototype/restore-evidence.json`: restoring the selected region left one other region.
- `../data/runs/local-block-prototype/two-block-view.png`: the RT-1 viewer after two replacements.
- `../data/runs/local-block-prototype/protected-page-evidence.json` and `protected-page.png`: RT-1 page 3 retained its
  four matched, protected-content units and created no overlay.

These paths are relative to this directory. Raw files contain cached public-paper text and measurements, no keys.

## Results

| Target / paper | First candidate page | Distinct candidates / accepted | Local fit p50, ms | Local fit p95, ms | Original first view ready, ms | Candidate view ready, ms |
|---|---:|---:|---:|---:|---:|---:|
| zh / 2212.06817 | 8 | 2 / 2 | 0.1 | 0.3–0.6 | 140–283 | 273–415 |
| ja / 2608.05876 | 1 | 1 / 0 | 0.4–0.5 | 0.6–1.0 | 185–196 | 185–196 |
| ko / 2608.21180 | 3 | 1 / 1 | 0.1–0.2 | 0.3–0.5 | 122–129 | 156–165 |
| de / 2608.06701 | 4 | 3 / 2 | 0.4–0.5 | 1.6–2.0 | 153–161 | 251–265 |
| ru / 2608.24839 | 1 | 2 / 0 | 0.7–0.8 | 0.9–1.0 | 122–125 | 122–125 |

All three rounds had the same outcomes. Accepted unit IDs: zh 89,92; ko 12; de 61,64. Failed at the 0.90 font floor:
ja 2; de 65; ru 3,7. Failure leaves original text visible. Candidate-ready time in the table means the source page
and mapping are ready, not that a translation succeeded. First accepted update paint-opportunity timings were
7.8–9.7 ms for zh, 8.5–10.9 ms for ko, 11.3–14.6 ms for de; ja and ru had no accepted update in this sample.

Each local update added **zero PDF loads, zero PDF page renders and zero TeX compiles**. PDF counters are measured;
the zero-compile property follows from the prototype having no compiler call path. Page navigation still renders a
new page. Whole-reader performance is not measured by these update counters.

| Target | Source body units | Content-supported candidates before geometry, whole paper | Rejected on searched pages: non-body / protected / uncertain | Raw font size, MB | Source/cache preparation, ms |
|---|---:|---:|---:|---:|---:|
| zh | 128 | 25 | 29 / 36 / 1 | 4.95 | 147 |
| ja | 72 | 13 | 1 / 3 / 0 | 7.84 | 54 |
| ko | 32 | 12 | 5 / 6 / 0 | 6.16 | 108 |
| de | 59 | 6 | 24 / 16 / 0 | 0.14 | 32 |
| ru | 42 | 16 | 4 / 4 / 0 | 0.34 | 31 |

Only 72 of 333 body units qualify under the content policy before geometry checks. The search analyzed 17 of the
76 pages across the five papers; unlocated units are not included in the searched-page rejection counts. Neither
the nine candidates nor the five successes are a whole-paper coverage estimate. Startup and successful-first-block
latency remain a concern: zh's first usable sampled region is on page 8.

Source/cache preparation is a single server-side observation, separate from browser timings. Measured local font
loads were 20–52 ms and PDF document startup 58–220 ms. Raw CJK fonts are 4.9–7.8 MB; localhost delivery cannot
establish acceptable internet-cold startup. Endpoint JavaScript heap samples were approximately 14–20 MB, excluding
native PDF/font/GPU memory and peak memory. These are not a total-memory result.

## Engineering verdict

The local update primitive merits further work. The current prototype must not replace the production reader:

1. Add safe mixed-content handling for formulas, citations, links and tables, with native glyph/element provenance
   and integrity checks. Keeping an entire mixed paragraph original prevents damage but provides too little coverage.
2. Improve geometry and overflow policy before language tuning. The sampled ja and ru prose still does not fit;
   do not make the 0.90 floor arbitrarily smaller to hide failures. Page-wide averages are insufficient.
3. Separate common fitting logic from validated language typography and semantic roles. These five small samples
   establish no per-language profile. Keep the existing German FIT as a regression control.
4. Reuse parsed native pages and font data; measure cold delivery, font packaging, main-thread contention, total
   memory and first translated block latency before integration. Avoid whole-document trial compilation entirely
   in this path. The original-PDF preservation model keeps graphics intact, but translating their labels is pending.
5. Validate selection/accessibility, zoom, navigation persistence and PDF export. This DOM-over-canvas viewer does
   not yet write a translated native PDF or retain overlays through page navigation.

Verification: typecheck, lint, full tests and production build passed (2,442 tests passed, 3 skipped). The final
prototype script parses; final browser rounds and the two-region/restore checks ran after the last UI refinements.
No production integration, paid translation or external publication was performed.
