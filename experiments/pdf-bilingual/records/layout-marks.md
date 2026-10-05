# The layout marks on the corpus: the lines they carry and lose (Plan 8b, Task 2)

The record of `spikes/layout-marks-gate.mjs` on the corpus, for whoever changes the layout marks
(`src/pdf-reader/engine/layout/marks.mjs`) next. The rows, paper by paper, are in `layout-marks.json` (ids, counts, page
numbers and class names; no paper's content); the details of each run are in `data/runs/layout-marks-gate/` (outside
git).

## What is measured, and why

The layout marks have a compile of their own (the controller's change of 2026-10-06): the **layout compile** carries
them and feeds only the layout file; the readings and the final come from a compile with none. A line the marks move
therefore costs that paper's layout lines alone. Their marks stand where the layout compile set them, not where
arXiv's PDF has the text (the readings compile is arXiv's PDF's twin). It never costs the readings or the final. The
corpus check is the layout marks' quality measure, not a gate on the final.

For each paper, **v0** is the marked original as the run makes it today (`originalFiles` with its line probes), with
its destinations set as v1 sets its own: LAYOUT_TEX's zero-size FitR in place of MARK_DEF's XYZ, so that a unit mark
compares with a unit mark. **v1** is the same with the layout marks: `LAYOUT_CLASSES`, and the paper's own switch
(below). Each is compiled natively, as `spikes/gt-orig.mjs` compiles: latexmk, Docker `texlive/texlive:latest`,
`--network none`, 2 CPUs, 3 GB, 300 s. The difference is no `-file-line-error`, so that the logs read as the run reads
them. The figures:

- **Items moved**, two ways. *Strict* is the brief's measure: every PDF.js text item of v0 with no item of the same
  string at the same page, place and width in v1, to 0.01 pt. The width is compared too: a kern lost inside an item
  moves the glyphs after it, not its start. *Joined* first joins the items that abut on one baseline into runs
  (across the spaces PDF.js gives as items of their own), because how a line is cut into items is no place of a glyph.
  Both are given, because the joined figure hides real moves. 2608.00812's and 2608.08880's lost lines are 1 strict
  and 0 joined: the heading and the words after it make one run, and the run's start did not move.
- **Lines** are v0's lines as the layout maker reads them (Task 5's `linesOf`: one baseline within half the smaller
  height, not more than 30 pt left of the line's start). A line is **lost**, *strict* or *joined*, when one of its
  items or runs moved. A line is also lost by *TeX* when TeX's own page boxes differ in it. Those boxes come from a
  third and fourth compile of every paper with `\tracingoutput`, with the marks' own nodes taken out: their
  destinations, the empty `\vadjust` of the italic-correction handoff, an empty box around a mark, kerns and math nodes
  of no width, and discretionaries (one left in a shipped box is a break not taken). This catches what items cannot
  show: PDF.js gives a justified line in one font as one item, and the line's glue makes up a kern lost in it. The
  item keeps its start and its width while its words move, and the layout maker reads its words off that item
  (2608.03063, page 7). Each difference is named by the mark nearest it in v1. The trace compiles are judged only
  where they are the same documents as the compiles: as many pages, each one shipped out in the log.
- **unitMarksMoved** counts MARK_DEF's unit marks (each unit's start and end, `axt-<n>s` and `axt-<n>e`; both
  compiles set them as zero-size FitR) that v1 does not set at the same page and place as v0, to 0.01 pt. A unit mark
  moves where TeX, or pdfTeX's output, puts that unit's first or last character elsewhere. A caption's mark the caption
  gate moves (v1 sets it at the float, v0 first where the list of figures is) is counted apart, as `captions`.
- **Per class**, the *lines carried*: lines not lost that hold a mark of the class. The classes are the nine
  placeholder classes plus the units' own marks: `heading`, `cell`, and `unit` (MARK_DEF's). With `--bisect`, where a
  line is lost, the lines each class loses alone (v1 with that class only, against v1 with none), and the lines the
  units' own marks lose (v1 with no class, against v0). The lines TeX sets otherwise are attributed, besides, to the
  class of the nearest mark (`texLost`).
- The **verdict**: *clean* (no line lost: no item moved and no line TeX set otherwise); *accepted* (moved, with N
  layout lines lost); *switched* (the paper's own switch is on); *failed* (v1 does not compile); *passed over* (v0 does
  not compile). A class whose marks lose more of a paper's lines than they carry is to be switched off for that paper
  (`switchOff`), and the check fails until it is.

The aux, toc, lof, lot and out, and the readings (`readingsOf`, compared byte for byte with the marks in name order),
are still compared. They no longer decide anything, since the layout compile feeds neither.

## The run (2026-10-06)

- **The corpus:** the 113 pdfLaTeX packages of `out/corpus-meta.json`. TeX image
  `sha256:7334b00bf8e7a0996f7ddd65482363aaf7711d372e569f3ea78509619e3083ff`, the typesetting gate's.
- **The marks measured:** Task 1's d082fc5e with this task's f50535b6 (the paper's own switch and the number rule,
  below). Task 1's fix round (ae88a616 to 150faa7b) is not in this branch. Once it is merged,
  `layout-marks-gate.mjs --bisect` measures it again: v0's compiles are kept, and v1's are made again.
- **Wall time:** 861 s for the compiles (113 papers: the font probe, v0 and v1, a bisect where a line was lost), then
  1,453 s for the trace pass (226 compiles with `\tracingoutput`). The pairs ran at most four compiles at a time,
  while other work kept the machine's load at 10 to 31.
- **The figures:** 198,875 lines. 105 papers clean, 6 accepted, 2 switched (both clean), none failed, none passed
  over. Lines lost: 5 strict, 3 joined, 7 by TeX. Items moved: 13 strict, 6 joined. 5 unit marks moved, each on a
  lost line. Every paper was traced. No class loses more lines than it carries (`switchOff` empty).
- **What does not decide any more:** aux, toc, lof, lot and out are the same on every paper. The readings are the
  same on 108 papers; on the other 5, a unit mark moved along its lost line. No paper has a new TeX error.
- **The caption gate:** no corpus paper writes a list of figures or of tables (no `.lof` or `.lot`; 10 write a
  `.toc`), so none has a caption the gate moves. The gate's case is Task 1's native "a caption in the list of figures
  makes no mark there", and 2307.16209's fixture outside the corpus.

| Paper | Class | Lines lost (strict / joined / TeX) | Cause, from TeX's boxes |
|---|---|---|---|
| 2608.00812 | amsart | 1 / 0 / 1 | page 7: a run-in heading's end mark parts its last letter from the full stop the class appends; the font kern (−0.55 pt, Palatino bold) is lost. The line's unit mark moves 0.43 pt along it |
| 2608.08880 | IEEEtran | 1 / 0 / 1 | page 6: the same, −0.55 pt; the unit mark 0.47 pt |
| 2608.03063 | acmart | 1 / 1 / 2 | pages 7 and 10: the same, −1.22 and −0.13 pt. Page 7's line is one PDF.js item that keeps its start and width, so only TeX's boxes show it |
| 2608.09189 | acmart | 1 / 1 / 1 | page 13: the same, −0.09 pt |
| 2608.25210 | acmart | 1 / 1 / 1 | page 9: the same; microtype's font expansion then re-expands the whole line (+7 → +5) |
| 2608.10322 | article | 0 / 0 / 1 | page 12: `\la {addic}` (a `\label` of the paper's) at a paragraph's end, its closing mark before `\@esphack`; a glue of −0.00002 pt (about 1 sp) is left, which moves nothing. Task 1's 4d6595ab (no closing mark after a paper's macro) takes it out |

The five heading lines are the units' own marks: the bisect shows no class alone loses a line, and v1 with no class
(headings', cells' and MARK_DEF's marks only) loses each one. Ruling 2 accepted acmart's case: no line count, no
page and no reference changed. The same cause is in amsart (2608.00812) and IEEEtran (2608.08880), and the same verdict
applies. Task 1 took those two for pdfTeX's virtual-font drift; TeX's boxes show the lost kern. **No paper in the
corpus shows a PDF-only offset** (ruling 3's category): where items moved, TeX's boxes differ too.

## Lines carried, by class (the corpus)

| Class | Papers | Lines with its marks | Carried |
|---|---|---|---|
| math | 110 | 29,553 | 29,552 |
| unit (MARK_DEF's) | 111 | 21,970 | 21,965 |
| cite | 109 | 5,192 | 5,192 |
| cell | 69 | 5,106 | 5,106 |
| display | 97 | 4,875 | 4,875 |
| ref | 108 | 4,695 | 4,694 |
| heading | 112 | 3,307 | 3,302 |
| macro | 84 | 2,381 | 2,381 |
| eqref | 54 | 1,715 | 1,715 |
| code | 35 | 355 | 355 |
| footnote | 25 | 105 | 105 |
| url | 28 | 79 | 79 |

**The classes on: all nine** (`LAYOUT_CLASSES` unchanged). **Off: none.** No class alone loses a line of any
paper, and none loses more lines than it carries.

## Found and fixed in this task (layout/marks.mjs)

1. **A closing mark after a number or a dimension** (2608.30640: `.\n\looseness=-1 While`). TeX takes the space
   after a number as the number's end, and reads on for a unit or a `plus`. The closing mark ended the number, so the
   space became a space: one more glue on page 3. A source that ends in a number or a dimension (`ENDS_IN_NUMBER`) now
   gets its opening mark alone, as one that ends in a control word does. Task 1's "PDF.js cuts one line into three
   items" on this paper was that space. Native case: "a number or a dimension set before a word" (`\looseness=-1`,
   `\linepenalty=100`, `\spaceskip=3pt plus 1pt`, `\hyphenpenalty 50`). Task 1's 4d6595ab gives a paper's macro its
   opening mark alone anyway; the rule also covers any other class.
2. **The paper's own switch** (next section).

## The paper's own switch (rulings 1 and 3 of the controller's change)

The switch is decided per paper, by `punctuationMovers(paper, log)`, over `LAYOUT_CLASSES` as the global default:

- **`cite`** where the paper's citations take the punctuation after them before them (`superCitations`). That is:
  cite.sty's `super`/`superscript`, or overcite, unless `nomove`; natmove, which acts on natbib's `super` (achemso loads
  both); natbib with `super` asked any way (its option, `\setcitestyle`, `\bibpunct`'s fourth argument); biblatex's
  `autocite=footnote` or `superscript`, or a TeX Live style whose `\autocite` is a footnote (authortitle, -comp, -ibid,
  -icomp, verbose and verbose-…);
- **`footnote`** where fnpct is loaded. It swaps a footnote's call with the full stop or comma after it.

It is read from the preamble the engine reads (the main file up to `\begin{document}`, the files it inputs there, the
paper's own classes and packages; not a copy of natbib, cite, overcite, natmove, biblatex or fnpct in the package,
which is the package's source, not the paper's choice: 2608.30640 ships natbib.sty, whose `\bibstyle@nature` would
read as `super`). It is also read from a log of the paper's preamble, the font probe's, for what a class of TeX
Live's loads: natmove, overcite or fnpct by name (no option is in a log). The class's own options count as every
package's.

**What the switch does:** a placeholder of a switched class **that the punctuation follows gets no mark at all**.
Every other placeholder keeps both marks. The first ruling said "no cite closing mark"; the corpus says that is not
enough:

| | 2608.23865 (achemso, 520 lines) | 2608.25928 (achemso, 748 lines) |
|---|---|---|
| No switch | 46 lines lost | 96 lines lost |
| No closing mark on any citation (the first ruling, `--literal`) | 12 lost | 9 lost |
| No mark on a citation the punctuation follows (committed) | 0 lost | 0 lost |

natmove sets the full stop against the word before the citation. The opening mark stands between them and loses
their kern: the 12 and 9 lines, each beside a citation's opening mark in TeX's boxes. That mark also marks the wrong
place: where the full stop begins, not where the citation does. Its cost: in a superscript paper nearly every
citation stands before punctuation, 18 of 18 and 34 of 41 here, and those get no mark. The 7 others keep both marks
and carry all 7 of their lines. The native cases hold the switch under TeX: "cite.sty [super]", "natbib [super] with
natmove" and "fnpct", each a citation or a call before a full stop or a comma (the switch). Without the switch the
same documents move 44, 53 and 35 items (the notes).

**Limits:**

- cite.sty with `super` from a class of TeX Live's is beyond the preamble and the log.
- biblatex styles outside TeX Live's standard ones are not read.
- natbib with `super` alone moves nothing: natbib.sty has no lookahead, natmove does. It is still switched, as the
  ruling asks.
- In production, the switch needs the font probe's log before the layout compile is written (achemso's natmove is
  in no preamble): Task 14.

## The compile time, v0 against v1

v0 and v1 of a paper were compiled at the same time, so each pair met the same load. v1 over v0: median +11.5 %, p10
+0.1 %, p90 +35.6 %, max +341 % (2608.08903, under a load near 30). Over the corpus, the sum is +15.2 %. The two
largest, compiled again one after the other and twice each: 2608.08903 from 2.10 to 2.62 s (+25 %), 2608.12606 from
3.7–4.1 to 4.45 s (+9 to +20 %), each with the same latexmk passes as v0 (2 and 4). The times include about a second
of Docker's start.

## The marks file

The median is 324 KB raw and the largest 1,399 KB (2608.30730), all under `MARKS_CAP`, each parsed by
`parseLayoutMarks`. 63 names are dropped as set twice, in 8 papers.

## Not done here

- **The typesetting gate with `LAYOUT=1`** (the brief's Step 4): obsolete under the change, since the readings and
  final compile carries no layout marks. It is also not runnable on this machine: no `runs/visual-eval`
  translations, and making them needs Microsoft's endpoint.
- **`spikes/layout-same.mjs --pair`** (ruling 4) now reads nothing of the gate's, the corpus' or C0's before it runs.
  It used to throw where `data/runs/gate` was missing. The corpus check does not use it.

## A row of `layout-marks.json`

`{ id, v0, v1, switched?, ms: [v0, v1], pages: [v0, v1], items, moved: { strict, joined }, lines, lost: { strict,
joined, tex }, unitMarksMoved, captions: [unit, v0Page, v1Page][], readings, files: { aux, toc, lof, lot, out },
errors, classes: { <class>: { lines, carried, lost?, texLost? } }, marksFile: { kb, dropped, marks }, traced, cause?:
'tex' | 'pdf-only', boxes?: [{ page, near, what }], own?: { lost }, switchOff?, verdict }`. `counts` sums them.
