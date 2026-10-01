# Local mixed-content replacement: second probe

2026-09-30. Experimental viewer only. **Supported citations, references and simple inline math can accompany a local
prose update without a paper compiler. Coverage and overflowing translations still prevent production acceptance.**
The existing FIT/H-rule comparison and production reader are unchanged. The first probe is in [RESULTS.md](RESULTS.md).

Run from the worktree root:

```bash
pnpm exec tsx experiments/pdf-bilingual/spikes/local-block-prototype.mjs
```

Open `http://localhost:8091/`. Use Replace block, Measure mixed blocks, Measure prose control, or Survey mixed coverage.
The last action is an offline experiment over all five PDFs, not a runtime prerequisite for viewing/translating a
block. The reader path analyzes a requested page, with our analysis cache capped at three pages.

## What changed

- Fixture preparation retains original opaque atoms and translated run order. It compares every opaque source/cache
  entry before rendering. Missing, duplicated and reordered citation controls from RT-1 unit 5 were rejected; the
  unchanged cached translation passed. Complex math, displays, unknown macros and nested units remain unsupported.
- Whole native PDF text-item boundaries were inadequate: citations usually share a text item with surrounding prose.
  The new reader uses PDF.js 6.3.289's glyph advances and supported horizontal text state, then verifies glyph text,
  font, baseline and positions against the native text layer. Unique three-word contexts bracket an element; ambiguous,
  short, cross-line and colliding elements reject the whole translated region. Unsupported states/fonts are rejected.
- A verified native element is cropped from the original canvas once per page and reused. Citations have word-boundary
  fragments so the browser can wrap them while keeping their logical atom and fragment order. Math stays indivisible.
  Spaces use the already loaded source PDF face; glyphs retain their source appearance as pixels. There is no TeX math
  renderer, new translation request or PDF recompilation. Native vectors, selectable math and working citation links
  are not implemented by these pixel crops.
- Source pixels are read once per logical atom, not for every word. Fragment crops and source pixels are cached;
  ordinary updates reuse both. Empty crops reject replacement. Bounds are eight font measurements, 6,000 translated
  characters, 160 glyphs per atom and 100,000 pixels per source crop. Pixels/font metrics do not establish complete
  vector-ink or non-text collision safety in every PDF; that remains an acceptance limitation.
- Updates preserve untouched region node identity/text. Selected regions reappear on return to a page; restore removes
  only the selected region. Navigation still renders the original page, but cached-page text/glyph analysis is reused.

Two visual bugs were caught and repaired before the final evidence: the generic canvas display rule made inline atoms
block-level, reducing successful mixed regions from 11 to 7; an unbreakable long citation also created wide justified
Chinese spacing. Inline canvases plus citation word wrapping resolve those particular defects. A local variable shadowed
the replacement function during page restore; the corrected navigation/restore sequence was verified in the browser.

## Coverage and failure evidence

Same five source PDFs and cached translations as the first probe; all **76 pages** were examined in the offline survey.
The content policy admits 173 of 333 body-classified units before geometry, including 101 mixed candidates. These
counts are parser classifications (some front matter is classified as a paragraph), not accepted whole-paper coverage.

| Target / paper | Pages | Content-admissible mixed units | Geometry-admitted mixed regions | Fits at the 0.90 floor | Failed unit IDs |
|---|---:|---:|---:|---:|---|
| zh / 2212.06817 | 31 | 35 | 3 | 3 | none |
| ja / 2608.05876 | 13 | 24 | 4 | 2 | 30,170 |
| ko / 2608.21180 | 13 | 18 | 6 | 6 | none |
| de / 2608.06701 | 12 | 5 | 1 | 0 | 10 |
| ru / 2608.24839 | 7 | 19 | 5 | 0 | 16,26,30,140,142 |

**11 of 19** geometry-admitted mixed regions fit, preserving 19 logical elements (11 citations, 7 references and one
simple inline-math atom, `$kappa$`). Both logical-atom and word-fragment order passed for all 19 candidates, including
failed fits. That is not comprehensive mathematical integrity or language acceptance. Japanese `$q$` at unit 30 still
does not fit its region; it stays original. The reader does not shrink past the experimental 0.90 floor to hide failures.
Chinese success on three regions does not fix the many other regions still unsupported in RT-1.

Among matched units over all pages, atom rejection reasons include 34 short contexts, 14 cross-line cases, 11 ambiguous
contexts and 4 punctuation-boundary failures. There are also 15 uncertain-geometry and 5 overlap/wide-region cases,
107 unsupported source-structure cases and 5 opaque cache-integrity failures. Non-body counts (407) and unlocated
units are separate; no denominator treats them as translated. The raw survey lists each page's exact rejection counts.

The pure-prose control retained exactly the first probe's candidates and outcomes: zh 89,92 and ko 12 fit; de 61,64
fit and 65 fails; ja 2 and ru 3,7 fail. Five successes on nine candidates remain; the new mixed survey is a separate
subset and cannot be reported as 11/19 replacing the original 5/9 result.

## Performance boundary

Three final rounds in Chrome 154, local HTTP, reused browser context and cached translations, after tests/build had
finished. Per target: locate the first mixed candidate page, measure its distinct region once, then alternate 30
fitted and 30 native-size overlay updates. These are 90 repeated checks per target across three rounds on just five
distinct regions; failures are included. The control is local overlay work, not the current BusyTeX pipeline.

| Target | First mixed page | Local fit p50, ms | Local fit p95, ms | First local fit including crop/font use, ms | Candidate page ready, ms |
|---|---:|---:|---:|---:|---:|
| zh | 1 | 0.5–0.7 | 0.7–0.9 | 18.9–20.1 | 144–167 |
| ja | 2 | 0.9–1.0 | 1.1–1.3 | 8.4 | 348–364 |
| ko | 1 | 0.3 | 0.4–0.5 | 5.5–5.8 | 130–147 |
| de | 2 | 0.3–0.4 | 0.6 | 6.4–9.0, failed fit | 278–281 |
| ru | 2 | 0.4–0.5 | 0.7–0.8 | 7.6–7.9, failed fit | 285–293 |

Every measured translation update added **zero PDF loads, page renders, operator-list reads and TeX compiles**. First
updates create source/fragment crops; repeated updates reuse them. Those costs are inside local fitting time. The
no-compiler property follows from no compiler call path. Page readiness excludes server-side fixture preparation and
does not promise a successfully translated region for German/Russian. Two animation frames indicate a paint opportunity,
not actual compositor presentation; JSON diagnostics and live service latency are not a production pipeline benchmark.

A row/font index replaced full-page glyph rescans for each text item. Sequential before/after observations on the
same candidate pages showed median glyph-preparation reductions: zh about 30→11 ms, ja 28→8 ms, de 53→22 ms and
ru 26→14 ms. Candidate IDs and coverage stayed the same. This is not a randomized cold-cache comparison; the verified
implementation difference is removal of the full-page nested scan. Glyph/font/operator preparation is a first-page
cost, never silently included in the warm-update number. Cached return to ko page 4 reported zero extraction, anchoring
and glyph preparation, with both overlays restored.

Source/cache preparation remains a separate single server observation (approximately 30–148 ms per paper). Raw CJK
fonts remain 4.9–7.8 MB. Internet-cold font delivery is unmeasured. JavaScript heap endpoint samples were approximately
12–27 MB; they exclude process/native/GPU memory and peaks. Maximum observed cached source-plus-fragment canvas area
was 28,680 pixels per displayed page in the survey; the retained source RGBA buffer is additional. These bounds are
not a total-memory acceptance result.

## Reproducible local evidence and verdict

The raw files below were deleted on 2026-10-01 in the data clean-up, by mistake; the tables in this file are what remains. They cost no model call and no compile to make again: run the prototype and use the viewer's measure buttons, then Export. They were, under `../data/runs/local-block-prototype/` (ignored scratch): `mixed-run-{1,2,3}.json`,
`mixed-survey.json`, `prose-v2-control.json`, `opaque-integrity-controls.json`, `mixed-zh-{view.png,evidence.json}`,
`mixed-inline-math{.png,-evidence.json}`, `mixed-two-region{.png,-evidence.json}`, `mixed-navigation-evidence.json`
and `mixed-restore-evidence.json`. Earlier faulty-display and pre-index measurements live in labelled subdirectories;
they are not the final timings. Images are human inspection evidence, not a visual equivalence test over all papers.

The prototype merits continued work but **must not replace FIT or the production reader yet**. Next priorities:
paragraph-end/cross-line provenance, non-text collision checks, independently fitted table cells, readable overflow
policy for Japanese/German/Russian and role-specific typography. Font packaging, cold end-to-end latency, worker/main
thread contention, total memory, zoom, selection/accessibility and a native PDF writer need separate acceptance.
The owner's earlier FIT table/title flags remain pending; preserving one displayed Korean table is not fixing them.
No extra TeX server resource or paid API was needed. Repository typecheck/lint/test/build passed; 2,442 tests passed,
3 skipped. Final native-glyph, cache-integrity, visual and navigation observations are this experiment's evidence.
