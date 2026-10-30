# Closed-world coverage on our own compile: content classes and orphan text — design note

Status: stage 1 built (2026-10-25: `rules/content-classes.mjs`, `layout/ledger.mjs`, `lab/pdf/spikes/ledger.mjs`); stages 2 and 3
built (`layout/ink-units.mjs`, `pipeline/ink-pass.mjs`, paragraph points, the toggles at the layer's open); stage 4 built, a
bibliography BibTeX makes in the prepare's first pass with the ones the source holds, each entry one unit, and stage 7's names apart
from places (settled in `docs/PDF-READER.md` §19.13, measured by `lab/pdf/spikes/classes-gate.mjs`); stage 5, the vector figures' text, built (2026-10-25: `layout/figure-text.mjs`, its groups in
`layout/wrap.mjs`, ink units of kind `inkfigures` and BUNDLE 10's figure rows, `run.mjs paintFigures` under the toggle `figures`;
settled in `docs/PDF-READER.md` §19.12, its gate `lab/pdf/spikes/figure-gate.mjs`); stage 8, the reader toggles in both hosts, built
(the website's reading options in its batch 1; the extension's reading options and settings page at configuration v21, 2026-10-29:
settled in `docs/PDF-READER.md` §9.1); stages 6 and 7's rest are the plan of §7. Engine at
`next` 37d84180. The phase 1 measurement's scripts and raw rows are not
in the tree (the session scratchpad's `orphans/`); stage 1's gate reproduces the pack's numbers from the engine itself.

## 1. The rule

Every text glyph TeX sets on a page of our final pass belongs to **exactly one content class**. Each class has one translation
path, run once on the server into the shared cache, and one reader toggle; turning a toggle shows or hides what was made, with
no new prepare and no new MT. The owner's rulings of 2026-10-25 bind it:
1. **We own format correctness, not MT quality**: where a translation sits, that its original's ink is owned and erased, that
   it fits its lines, no double ink, structure kept. A name translated is a short unit like any other; how well it is
   translated is the provider's, and a reader can change provider.
2. **OCR positions are approved for bitmap figure text**, following the extension's recogniser (DESIGN §15.3, PP-OCR).
3. **Settings are a few items** (§5). Internal classes map onto them in one table.

Source units stay primary: they segment by the author's structure and carry placeholders. Glyphs no unit owns get a class by
TeX's facts; what no class explains is an **orphan**, counted and gated (§4), and later an ink unit made from our own glyphs.

## 2. Measured (letters only)

| Set | Papers / pages | Letters in units today |
|---|---:|---:|
| Gate pack (fx-next bases, current units; stage 1's gate) | 7 / 271 | **81.8 %** (per paper 61.4 to 88.6) |
| Wide (`bt-wide` bases of 2026-10-24, current units) | 116 / 2,415 | **85.5 %** (p10 73.7, median 86.8, p90 94.4) |
| Staging (the 53-paper corpus's bases, no units local) | 50 / 1,367 | **80.8 %** (min 49.3, median 86.8) |

The rest, as a share of all letters (phase 1's line classifier; its lexical classes are approximate, and part of "prose" in
two-column REVTeX is bibliography it missed):

| Class | Pack | Wide | Staging | Examples |
|---|---:|---:|---:|---|
| References | 14.0 % | 10.3 % | 10.1 % | "[1] Y. Bengio, P. Simard, and P. Frasconi. Learning long-term …" |
| Figure text (floats, included PDFs) | 0.9 | 1.4 | 1.1 | "iter. (1e4)", "Outer loop", plot labels |
| Code, verbatim, prompts | 0.2 | 1.0 | 3.6 | 2610.19159's shell logs, 2608.02163's prompts |
| Math | 0.3 | 0.3 | 0.5 | "Attention(Q,K,V) = softmax(…)V" |
| Running heads and feet | 1.0 | 0.4 | 0.4 | "JOURNAL NAME, VOL. XX", "1.1. HISTORICAL OVERVIEW", "page 2 of 52" |
| Contents, LoF, LoT | 1.7 | 0.1 | 0.2 | 2610.18513 p2 (48 lines), 2307.16209 pp 9–15 |
| Notes and margins | 0.0 | 0.6 | 0.3 | funding notes, "Corresponding author.", 2610.21377's margin heads |
| Front matter not cut | 0.2 | 0.1 | 0.3 | affiliations (CMTI9 in REVTeX), a thesis's title pages |
| Generated headings, theorem heads | 0.0 | 0.3 | 1.2 | "ACKNOWLEDGMENTS", "Appendices", "Theorem 2.1 (" |
| Prose with no unit | 0.0 | 0.1 | 1.5 | 2610.21377 pp 34–43 (proofs), 2610.19159's agent trajectories, the 2610.31660 shape |

Ink units the later stages add (blocks: a contents entry or a head line one): 17 a paper in wide (against 204 source units a
paper), 48 in staging, 60 in the pack (229 of them one thesis's contents). Running heads repeat, so the distinct texts sent to
MT are far fewer. **Reuse** (an orphan's letters, its number, leaders and page number aside, equal to an owned unit's): contents
lines 140 of 151 equal in wide; running heads 105 of 152 in the pack, 279 of 624 in wide (the rest are author lists, journal
lines and dates, which no unit holds). The sweep owner's count on the 53 papers agrees in kind (439 rows in 18 papers).

## 3. The class model (stage 1, built)

`rules/content-classes.mjs` holds the one table: each class's toggle, its state (`built`, `planned`, `never`), whether a glyph
can hold it, and its ground truth. A unit's class is a pure function of its kind (`UNIT_CLASS`: cell → tables, author → names,
figure → figures, every other kind → body), which the bundle's units already carry, so the server and every reader tell it
alike with no new field on the wire. An ink unit (stage 2 on) carries its class when it is made.

`layout/ledger.mjs` gives every glyph of our final pass its class in the maker child (`wrapFinal`'s `ledger`, integers for the
record), by these facts, in order: an owned glyph is its owner's (a unit's by kind, a babel name's `generated`); the other glyphs,
cut into lines by stream order and baseline, by the first rule that holds — no two letters together (`symbols`); an included
PDF's glyphs, inside a form XObject (`figures`); outside the column bodies, before the page's first mark or the foot after its
last (`heads`), else `notes`; between a list's or the bibliography's babel name and the next unit (`contents`, `references`,
`index`); a math face's line (`math`); a typewriter face's (`code`); a float's remaining text (`figures`); else `orphan`. The
sweep's invariant **(o)** is "no orphan letters" (`orphanRows`, rows in the sweep's shape); `lab/pdf/spikes/ledger.mjs` runs it.

Stage 1's gate (`lab/pdf/records/ledger.md`): on the pack, body 59.7–88.5 % of letters, references 4.7–33.7 %, tables 0–5.1 %,
figures 0–2.8 %, contents 4.3 % (the thesis), heads 0–1.7 %, and orphans 1,086 letters (0.22 %) in 3 papers: the thesis's title
pages and its "ABSTRACT" and "RESUMO", 2608.16117's affiliations, an "and" between authors. Wider, the orphans are 2.31 % of
the letters of 116 papers and 3.91 % of staging's 50, most of them REVTeX's: a bibliography no babel name opens (stage 4's
`\bibitem` points end that), and affiliations and dates the front end cuts but the marks do not own, a coverage defect the
invariant now names; then prose no unit holds (2610.21377, 2610.19159). The ledger costs 39–79 ms on a 147-page paper, beside
`ownOf`'s 180 ms.

## 4. How an ink unit is made, drawn and kept exact (stages 2–3)

1. **Where:** the maker child, after the ledger. Its text is our glyphs' Unicode in stream order; its lines are its glyphs'
   baselines and extents. Nothing is read from arXiv's PDF and no position is estimated.
2. **Blocks by TeX:** points at LaTeX's `para/begin` and `para/end` bracket every paragraph TeX makes, so a contents entry is one
   block across its lines; points around `\@thehead` and `\@thefoot` make the head and the foot exact (stage 1 reads them by
   stream order and one baseline, as `folioOf` reads a folio).
3. **Kept runs:** leader dots, a section number, a page number, math-face runs and URLs inside an ink unit stay the original's
   ink (`o<id>.p`, cropped from render B like a placeholder). A contents entry's title is drawn in the box from its first glyph
   to the leaders' first.
4. **Reuse:** an ink unit whose letters equal an owned unit's source text takes that unit's row: the contents and the heads read
   as the headings and the title they repeat. A heading with no translated row leaves its copy the original's.
5. **Ownership and erasure:** groups `o<id>`, `o<id>.p` in the same wrap section, the same spell check, the same "a unit that
   cannot be delimited shows the original".

## 5. The reader's settings and each class's path

The owner's map (2026-10-25; the settings' own words are the locale packs', these are their English). "Always" is no toggle; every class is translated once on the server whatever the toggles.

| Setting | Internal classes | How it is translated correctly; its ground truth | State | Agent-days |
|---|---|---|---|---:|
| Always | body (prose, headings, captions, footnotes, abstract, title) | source units placed by TeX's marks | built | — |
| Always | generated: babel names, theorem heads, generated headings | babel names are built; a theorem head's name is `\newtheorem`'s argument, marked where TeX sets it, as a babel name is | names built; heads planned | 1 |
| Always | contents (TOC, LoF, LoT) | ink units from our glyphs, whole by para points; each title takes its heading's or caption's row | planned | 1.5 |
| Always | notes (footnotes and margin notes no unit owns) | ink units by block | planned | 1 |
| Always | orphan (prose with no unit) | an ink unit at once; the front-end cause fixed at the source as found | planned | 1 + fixes |
| "Heads and feet" | heads (running heads and feet) | ink units by line, exact by head and foot points; a head equal to the title's or a heading's text takes its row, set in capitals for a cased target where the head is | planned | 1.5 |
| "Tables" | tables (cells) | today's cell units; tables no unit cuts (inside a float) become ink units by row | cells built; uncut planned | 0.5 + 1 |
| "Figure text" | figures (vector) | the glyphs of an included PDF (form XObjects) and of a TikZ or pgfplots picture (between its points), set by our compile: exact text from their fonts, exact places; ink units of kind inkfigures, each its own group, inside a form by the form written again once; a font with no usable Unicode, a form shared, a crowded band left the original's (PDF-READER §19.12); a float's other text no unit owns stays counted, not drawn | built | — |
| "Figure text" | ocr (bitmap) | PP-OCR as the extension runs it (DESIGN §15.3), once on the server over each figure's image; places from OCR (approved); erasure by a patch of the background under each line, as the extension's image translation does | planned | 3.5 |
| "References" | references, index (proposed) | each `\bibitem` one unit, whole, its names its own, from the bibliography's TeX the compile reads (thebibliography, a shipped .bbl, or the one BibTeX makes in the prepare's first pass, a shipped one from then on), marked like the body (PDF-READER §19.13); biblatex's `\printbibliography` no TeX to mark | built (biblatex a known gap) | — |
| "Names" ("Authors and affiliations") | names: the whole author block under the title | author units and its places (kind affiliation: affiliations, institutions, addresses, e-mail line), translated for every target (TRANSLATE 6), one toggle (the owner's ruling of 2026-10-30); whatever environment sets the block (a tabular in `\author`: its units the block's, never cells, PIPELINE 39); an affiliation line no source unit owns is an ink unit still always translated (ink-units.mjs rule 8: the maker's, next), and a title block a paper's own style sets from macros of its own (2610.30854v1) no unit at all (next) | built | — |
| Never | math, code and verbatim, symbols | kept as the original's ink | never | — |
| — | reader toggles in both hosts | a class's units drawn or not (and its groups ON or OFF) by the settings: the door's and the layer side's `classes`, the side's `setClasses`, the hosts' settings (the extension's `pdfReader.classes`, `docs/PDF-READER.md` §9.1) | built | — |

**Names, plainly** (the owner's ruling of 2026-10-28: the two toggles decoupled; and of 2026-10-30: the whole block). "Names" is an
author block under the title, its names and its places, the affiliations, institutions, addresses and e-mail line (their own
units, by TeX's marks), translated together or the original's together; an author's note at the page's foot (`\thanks`) is a
footnote, always translated. The names inside a bibliography's entry are the entry's, under "References". Names written inside body
prose ("as Smith showed") are part of that unit; an author-year citation's names are its placeholder's ink, kept as the original's
either way; a running head typed by the author with the names follows "Heads and feet" (and "Names" too where it equals the author
units' text and takes their row).

**Classes missing from the owner's map, proposed:**
- Algorithms and pseudocode: under "Figure text" (they sit in a float like a figure): steps and comments translated, keywords and
  math kept. Stage 1 counts them as figures; telling them apart needs the float's type at its point (`\@captype` at
  `\@endfloatbox`).
- Dates, keywords, acknowledgements, a thesis's title page, an epigraph: always (body). Affiliations, addresses and the e-mail
  line (built: kind affiliation, PDF-READER §19.13) are "Names" since the owner's ruling of 2026-10-30 (always, from 2026-10-28).
- Index and glossary: under "References", as back matter (the ledger's `index` class).
- URLs, e-mail addresses, DOIs, ORCIDs: never (kept runs wherever they stand).
- Equation tags, folios, numbers: never (`symbols`).
- Copyright and licence lines in the foot: with the foot, under "Heads and feet".

A float's other text no unit owns (an algorithm's steps, a subfigure's letter) is still the ledger's `figures` and drawn
nowhere. (A TikZ picture's texts, which the front end cuts into units of kind `figure`, are sent no more: settled in
`docs/PDF-READER.md` §19.12, "One owner a glyph".)

## 6. Risks and the gates that hold them

| Risk | Gate |
|---|---|
| A glyph in the wrong class | the ledger's unit tests per rule; `lab/pdf/spikes/ledger.mjs` over the pack and the sweep; invariant (o) |
| Double ink (orphan ink left under a translation) | `ocg-gate.mjs` G1 (all groups ON equals the unwrapped page) and the pixel tier |
| Positions | none estimated: our glyphs' boxes (OCR's alone for bitmaps, by the ruling); layout-make tests per shape |
| New points move a line (stages 2–3) | the B vs C pixel test of `design.md` §3.8: no new differing page on the pack and the sweep |
| A toggle that re-prepares | every class made once; a test that the rows of every class exist whatever the settings |

## 7. Versions, stages

| Stage | Scope | Versions | Agent-days |
|---|---|---|---:|
| 1 (built) | class table, ledger in `wrapFinal`, invariant (o) rows, the lab gate | none (no wire, no compile change; the web stores the ledger later) | 1 |
| 2 (built) | ink units: heads and feet, notes, contents, orphans; echo rows; their groups; the ink chunk; the toggles at the open | LAYOUT 21, REMOVAL 11, BUNDLE5 10, an INK_UNITS_FORMAT chunk (the source chunks unchanged); no translate key moves | 4 |
| 3 (built) | paragraph points (q<n> at para/begin); a contents entry and a block one paragraph of TeX's | in LAYOUT 21; base pages pixel-identical on the pack | 3 |
| 4 (built) | references (.bbl units, the source's or the one BibTeX makes, each entry one unit); the author block for every target | PIPELINE 29 and 30, LAYOUT 22, MARKS_SCHEMA 11, TRANSLATE 6 | 4.5 |
| 5 (built) | vector figure text: ink units of kind inkfigures, their groups, the parts' figure rows, under the toggle `figures` | in LAYOUT 21, REMOVAL 11 and BUNDLE5 10 (the key `figures` of a part, there only where it has one) | — |
| 6 | OCR on the server | a new OCR version in the key | 3.5 |
| 7 | names split from places (built: PIPELINE 30, LAYOUT 23); tables no unit cuts | PIPELINE | 1 |
| 8 (built) | reader toggles in the web and the extension | the extension's configuration v21 (no engine version: no toggle is a translation's input) | 2 |

About 23 agent-days in all. The web sweep reads invariant (o) once the engine is pinned (`scripts/sweep/invariants.mjs`), and the
container stores `wrapFinal`'s `ledger` in the record (a web change). This design touches `latex-front.mjs` only in stages 4 and
7; the heading-argument PR's owner is told first.

## 8. The web contract for stages 2–3 (2026-10-25; the engine and the web land for one pin)

The engine makes ink units in the maker child and carries them through the page pass; the web passes them through, announces
one more units chunk, stores the ledger, reads invariant (o) and offers the toggles. Every name below is the engine's export.

1. **`ours.ink`.** `wrapFinal` returns `ink` beside `ledger` (an opaque value: the ink units, their glyphs, rows and groups). The
   container passes it on unchanged: `ourWrap` returns it, and the maker gives `layerOfPaper({ ours: { …, wrap: { stats,
   unhidden, labelKept, pages, ledger }, ink } })`. `ledger` is `wrapFinal`'s `ledger`, now inside `wrap`. `ink.off` (added 2026-10-25) lists the ink units the wrap could not
   hide alone (a page it did not wrap, a placeholder on a page whose groups it merged): the pass keeps them, their ids naming
   their groups, and lays none of them, as it lays none on a page not drawable; the host passes `ink` whole. With no `ours.ink`
   (an older wrap, a refused one) the pass makes no ink unit and everything else is as before.
2. **The ink chunk.** Ink units are units with ids after the source units' (N to N + K − 1), in one more units chunk (`kind:
   'units'`, `from: N`, `to: N + K`), which the engine writes. `onHead(head, units)` then gets the prepare child's chunks
   followed by the maker's: `units.slice(announced.length)` are new. The maker writes and announces each new chunk (role
   `units`, as the prepare child announces its own) before the head. `layerSink`'s check becomes: the first `announced.length`
   chunks equal the prepare child's, the rest are the maker's own. The Worker accepts a head whose units list is longer than
   the prepare's announcement by chunks the maker announced. The catalog's `units` lists every chunk.
3. **The bundle unit of an ink unit.** It is today's tuple with a seventh element: `[kind, flags, depth, null, null, pieces,
   echo]`. `kind` names its class (`inkheads`, `inkcontents`, `inknotes`, `inkgenerated`, `inkorphan`, `inknames`: a block of
   notes or orphans most of whose letters are an author unit's words, of the names toggle as the author block is; added
   2026-10-25), and `unitClass(kind)` gives it. `echo` is the id of the source unit it repeats, or of an earlier ink unit (a running head on every page: added
   2026-10-25), its row that unit's, with no translation of its own; or
   null. Pieces are text, with ⟦n⟧ placeholders for kept runs (leader dots, numbers, math, URLs), whose ink stays.
   BUNDLE is raised.
4. **Translation.** The rows path translates the ink units like any unit, once on the server, whatever the toggles
   (`layer-proto/rows.mjs` `toTranslate`). An echo unit is never sent: its row is its echo's (`unitOf` takes the echo's row).
   The translation client needs no change beyond translating every chunk the head lists.
5. **The record's ledger.** The head's base carries `ledger: { classes: [class, glyphs, letters, …], letters, orphanLetters,
   orphans: [page, letters, text, …] }`, flat (a head nests four deep at most), with at most 64 orphans and their text cut at 120
   code units, written by the engine from `ours.wrap.ledger`. The web stores it with the head; nothing else reads it.
6. **Invariant (o).** The sweep calls `orphanRowsOfHead(head, { paper })` (`layout/ledger.mjs`). That gives one row per listed
   orphan `{ inv: 'o', sev: 'violation', paper, page, unit: null, what: 'orphan text', text, detail: { letters } }`, plus one
   row `{ what: 'orphans not listed', detail: { letters } }` where `orphanLetters` passes the listed ones. A head without a
   ledger (an older engine's) gives no row.
7. **The toggles.** The reader's option is `classes: { heads, tables, figures, references, names }`, booleans, defaulting to
   `TOGGLE_DEFAULTS` (`rules/content-classes.mjs`: heads true, tables true, figures true, names false, references false). Each host stores it with its other reader settings and gives it to the layer at its open (`openLayer({ classes })`);
   a change of it is an open again, as a change of language is (a laid page never changes: run.mjs), through the reading view's
   `setClasses(classes)` (view/layer-side.mjs): the same documents, parts and rows, each laid page kept until the new door's
   commits. A unit whose class is not shown is drawn as the original's (its groups ON, no row drawn); nothing is fetched,
   prepared or translated. Measured (the layer gate's jump, `--perf`): the open again and the two pages in view at 1× laid in
   81 to 384 ms over 14 page pairs of 6 papers (2026-10-25). The labels are the owner's words, in the locale packs
   (one key a toggle). "Always" and "never" are no setting.
