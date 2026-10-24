# Closed-world coverage on our own compile: orphan text — design note (phase 1)

Status: proposal, 2026-10-25, for the owner's decisions in §5. Nothing is built. Engine at `next` 37d84180. Measurement
scripts and raw rows (not in the tree): the session scratchpad's `orphans/measure.mjs`, `agg.py`, `pack.jsonl`, `wide.jsonl`,
`staging.jsonl`, `agg.txt`.

## 1. The rule

Every text glyph TeX sets on a page of our final pass is accounted for, and nothing else is possible: it is **owned** by a
source unit (its text `u<id>`, placeholder `u<id>.p`, label `u<id>.l`, a babel name `n<occ>`: `layout/own.mjs`), or it falls in
a **declared exclusion class** (§3), or it is an **orphan**. An orphan becomes an **ink unit** made from our own glyphs, is
translated, and is hidden by its own optional-content group like any unit. Source units stay primary: they segment by the
author's structure and carry placeholders. The ink path only fills what they leave, and every orphan of the prose kind is also
a front-end defect to fix at the source (it is counted, §4.4).

## 2. Measured today (ownOf over our final pass, letters only: a glyph with a Unicode letter)

| Set | Papers / pages | Letters owned by units |
|---|---:|---:|
| Gate pack (fx-next bases, current units, the marking's texts) | 7 / 271 | **81.8 %** (per paper 61.4 to 88.6) |
| Wide (`bt-wide` bases of 2026-10-24, current units) | 116 / 2,415 | **85.5 %** (p10 73.7, median 86.8, p90 94.4) |
| Staging (the 53-paper corpus's bases; units not local, so no spell or follows) | 50 / 1,367 | **80.8 %** (min 49.3, median 86.8) |

Where the rest is, as a share of all letters (classes read by region brackets, babel-name points, fonts and line shape; the
lexical classes are approximate, and part of "prose" and "short lines" in two-column REVTeX is bibliography the classifier
missed):

| Class | Pack | Wide | Staging | Examples |
|---|---:|---:|---:|---|
| Bibliography | 14.0 % | 10.3 % | 10.1 % | "[1] Y. Bengio, P. Simard, and P. Frasconi. Learning long-term …" |
| Figure and table internals (in a float, not a caption or cell) | 0.9 | 1.4 | 1.1 | "iter. (1e4)", "Outer loop", plot labels |
| Code, verbatim, prompts (tt fonts) | 0.2 | 1.0 | 3.6 | 2610.19159's shell logs, 2608.02163's prompts |
| Math (display, math-font lines) | 0.3 | 0.3 | 0.5 | "Attention(Q,K,V) = softmax(…)V" |
| **Running heads and feet** | 1.0 | 0.4 | 0.4 | "JOURNAL NAME, VOL. XX", "1.1. HISTORICAL OVERVIEW", "page 2 of 52" |
| **Contents, LoF, LoT** | 1.7 | 0.1 | 0.2 | 2610.18513 p2 (48 lines), 2307.16209 pp 9–15 |
| **Notes and margins outside the body** | 0.0 | 0.6 | 0.3 | funding notes, "Corresponding author.", 2610.21377's margin heads |
| **Front matter not cut** | 0.2 | 0.1 | 0.3 | affiliations (CMTI9 in REVTeX), thesis title pages |
| **Generated headings and theorem heads** | 0.0 | 0.3 | 1.2 | "ACKNOWLEDGMENTS", "Appendices", "Theorem 2.1 (" |
| **Prose with no unit** | 0.0 | 0.1 | 1.5 | 2610.21377 pp 34–43 (proofs), 2610.19159's agent trajectories |

The bold rows are what the ink path would translate: **2.9 % / 1.6 % / 3.8 %** of letters. The sweep owner's count on the same
53 papers agrees in kind (439 rows in 18 papers: 77 contents entries, 386 running-head rows, 51 running feet in 2610.21377).

**Ink units added** (blocks: lines of one class, near in y, overlapping in x; a contents entry or a head line is one): pack 421
(60 a paper, of which 229 are one thesis's contents), wide 1,989 (17 a paper, against 204 source units a paper), staging 2,407
(48 a paper). Running heads repeat, so the distinct texts sent to MT are far fewer than the head blocks.

**Reuse** (an orphan whose letters, its number, leaders and page number aside, equal an owned unit's): contents lines 140 of
151 equal in wide, 77 equal and 63 inside one in staging (multi-line entries are cut by line here; §4.2 makes them whole);
running heads 105 of 152 in the pack, 279 of 624 in wide (the rest are author lists, journal lines and dates, which no unit holds).

## 3. Exclusion classes (declared, each from a TeX fact where one exists)

1. Math: glyphs of a math font (one font-class table in `rules/`, beside font-roles), and a display between units.
2. Float internals that are no caption and no cell: an included graphic's text (its form XObject, Type 3 fonts), TikZ, plots.
3. Code: SKIP_ENVS' and the paper's code environments, tt-font runs; URLs, e-mail addresses and DOIs inside any ink unit stay as
   kept runs.
4. Lines with no letter (numbers, folios, symbols).
5. **Bibliography: the owner's choice (§5.1).** Its zone is exact: points at `\thebibliography`/biblatex's `\printbibliography`
   begin and end, not a heading guess.
6. **Author names: the owner's choice (§5.2).**

## 4. How an ink unit is made, drawn and kept exact

1. **Where: the maker child, after `ownOf`** (the one place our final pass is read whole). Its text is our glyphs' Unicode in
   stream order (our fonts' ToUnicode; a line-end hyphen joined as the text layer joins it); its lines are its glyphs' baselines
   and extents. Nothing is read from arXiv's PDF, and no position is estimated: every coordinate is a glyph TeX set.
2. **Blocks by TeX, not by geometry:** LAYOUT_TEX adds a point at LaTeX's `para/begin` and `para/end` hooks (`q<k>s`, `q<k>e`), so
   every paragraph TeX makes is bracketed in the stream, the unmarked ones too. A contents entry is a paragraph
   (`\@dottedtocline`), so each entry is one block, whole across its lines. A running head or foot is one `\hbox` in the output
   routine (outside the body bracket): one block per line. Until the points land (stage 2), blocks are lines.
3. **Kept runs:** inside an ink unit, the leader dots, a leading section number, a trailing page number, math-font runs and
   URLs are kept runs (`o<id>.p`): their ink stays, and the layer crops them from render B as it does a placeholder. So a
   contents entry's dots, number and page stay the original's ink; only the title is drawn, in the box from the title's first
   glyph to the leaders' first.
4. **Reuse:** an ink unit whose text (letters and digits, case aside: `spellOf`) equals an owned unit's source text takes that
   unit's row: no MT, the same words as the heading or title it repeats. A head set in capitals keeps the row's text, put in
   capitals for a cased target. One with no translated row stays the original's (never a fresh MT of a heading's copy).
5. **Others are translated** in one batch a paper, short ones with the paper's title as context, as plain text with ⟦n⟧ for
   kept runs. Cache key: the text and `INK_VERSION`, no `rules` slot (as a PDF text today).
6. **Ownership and erasure:** groups `o<id>` and `o<id>.p` in the same wrap section, the same spell check (its glyphs are its
   text by construction, so it checks the kept runs), the same "a unit that cannot be delimited shows the original".
7. **Counting what is left:** each paper's record carries the ledger (owned, excluded by class, ink units, orphans left), and the
   sweep gets an invariant: orphan letters outside every class = 0, prose orphans listed as front-end defects.

## 5. Owner decisions

1. **Bibliography (10–14 % of letters, the largest class):** (a) excluded, as today; (b) the entries' titles alone (needs each
   `\bibitem`'s fields: the .bbl is ours, so they are exact); (c) whole entries by MT, names and venues mangled. Recommended (a)
   now, (b) as its own later stage.
2. **Author names** (front matter, running heads "D.D. NOVAES AND P.C.C.R. PEREIRA"): (a) kept as ink; (b) transliterated by MT.
   Recommended (a); affiliations and notes are translated either way.

## 6. Risks and the gates that hold them

| Risk | Gate |
|---|---|
| Fragment quality (heads, labels, "Theorem 2.1 (") | reuse first; context batch; the placeholder survival suite gets ink-unit shapes; the sweep's (a) review rows |
| Double ink (orphan ink left under the translation) | `ocg-gate.mjs` G1 (all groups ON equals the unwrapped page, 0 px outside split glyphs) and the pixel tier |
| Positions | none estimated: glyph boxes of our pass only; layout-make tests that an ink unit's lines are its glyphs' |
| The para points move a line | B vs C pixel test (§3.8 of `design.md`), 0 new differing pages on the pack and the sweep |
| A class misread as translatable (a plot label, code) | exclusion before the ink path; the sweep's (a) and crops |

## 7. Versions, stages, hours

Versions: LAYOUT (para points, ink rows), REMOVAL (new groups), BUNDLE (ink units in the units part), a new `INK_VERSION` in the
translate key; PIPELINE stays (source units unchanged). Gate pack: every fixture remade (bases, layouts, records, refs).

| Stage | Scope | Agent-days |
|---|---|---:|
| 1 | Ledger and exclusion classes in the maker child, the record's counts and the sweep invariant; no drawing | 1 |
| 2 | Ink units for heads, feet, notes and contents by line; reuse; groups; layer draws them; tests per shape | 3 |
| 3 | Para points; whole blocks; prose and generated headings; B vs C pixel check | 2 |
| 4 | Owner's §5 choices; gate pack remade; release sweep as acceptance | 1.5 |

The heading-argument PR touches `latex-front.mjs`; this design does not (stage 3 touches `layout/marks.mjs` LAYOUT_TEX only).
