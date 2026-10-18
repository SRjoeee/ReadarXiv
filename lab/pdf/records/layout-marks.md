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
`--network none`, 2 CPUs, 3 GB, 300 s. The differences: no `-file-line-error`, so that the logs read as the run reads
them, and the date pinned (`SOURCE_DATE_EPOCH` with `FORCE_SOURCE_DATE`), so that a paper's `\today` is the same in v0
and v1 whenever each was compiled. An unpinned v0 from the cache against a v1 made after midnight UTC moved
2608.20159's title page a day. The figures:

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
  (2608.03063, page 7). Each difference is named by the mark nearest it in v1, and every one is counted: no cap a page
  (fix round 1; a cap of 50 had stopped the count of a reflow at 8 lines where 30 were lost). The trace compiles are
  judged only where they are the same documents as the compiles: as many pages, each one shipped out in the log. A
  line TeX set otherwise is mapped to the page's line by the marks set in it, and **all** is the union of the three:
  TeX counts the lines it set otherwise, the items also a line moved down by a change above it, so neither count holds
  the other (the 5 pt plant on 2608.11761: 30 strict, 11 TeX, 30 all).
- **unitMarksMoved** counts MARK_DEF's unit marks (each unit's start and end, `axt-<n>s` and `axt-<n>e`; both
  compiles set them as zero-size FitR) that v1 does not set at the same page and place as v0, to 0.01 pt. A unit mark
  moves where TeX, or pdfTeX's output, puts that unit's first or last character elsewhere. A caption's mark the caption
  gate moves (v1 sets it at the float, v0 first where the list of figures is) is counted apart, as `captions`.
- **Per class**, the *lines carried*: lines not lost that hold a mark of the class. The classes are the nine
  placeholder classes plus the units' own marks: `heading`, `cell`, and `unit` (MARK_DEF's). With `--bisect`, where a
  line is lost, the lines each class loses alone (v1 with that class only, against v1 with none), and the lines the
  units' own marks lose (v1 with no class, against v0). The lines TeX sets otherwise are attributed, besides, to the
  class of the nearest mark (`texLost`). A line lost only in TeX's boxes is not carried.
- The **verdict** (fix round 1: the check can fail):
  - *failing* where a line is lost and not every loss has an accepted cause, or where v1 does not compile;
  - *accepted* where every loss has one, read from the evidence, not the paper: items moved while TeX's boxes are the
    same (a PDF-only offset, ruling 3), or every line TeX set otherwise a heading's lost kern (ruling 2: a kern v0 set
    beside a heading's mark and v1 did not, with nothing in its place in v1 or only a node v0 sets elsewhere in that
    line, never a kern, glue, box, rule or penalty of v1's own (fix round 2); every other difference in the line
    beside a heading's mark, or the same node set again at another stretch);
  - with no line lost, *switched* where TeX's answers took marks off, or a position had no answer (the paper's own
    switch), else *clean*;
  - *passed over* where v0 does not compile.

  A class whose marks lose more of a paper's lines than they carry is to be switched off for that paper
  (`switchOff`), and fails.
- **The check against this record** (the default): a paper whose verdict is worse than its recorded row's, or whose
  lines lost or unit marks moved grow, fails the run. Only `--write` writes the record. The gate's own test,
  `--plant=<pt>`, sets a kern after v1's first closing mark: 0.02 pt and 5 pt on 2608.11761 both fail (exit 1).
  `--plant-at=<mark>` and `--plant-kind=kern|glue` put it elsewhere: a 0.02 pt glue after `h84e`, in 2608.08880's
  accepted heading line, fails too (fix round 2).

The aux, toc, lof, lot and out, and the readings (`readingsOf`, compared byte for byte with the marks in name order),
are still compared. They no longer decide anything, since the layout compile feeds neither.

## The run (fix round 2, 2026-10-06)

- **The marks measured:** fix round 1 with fix round 2: a probe box that errors answers nothing (its register voided
  before it, its error read as its own), no answer is no mark, and the heading-kern rule takes only a kern-class
  difference in the lost kern's place.
- **Wall time:** 2,723 s, every compile made again (the reading code's hash changed): the font probe with the mark
  probe, v0, v1, the two traces, and the bisects. Written in the same run (`--bisect --write`).
- **The figures:** the same as fix round 1, paper by paper. 106 clean, 5 accepted, 2 switched, 0 failing, none passed
  over; lines lost 5 strict, 3 joined, 6 by TeX, 6 all; items moved 13 strict, 6 joined; unit marks moved 5; no
  regression against the record; `switchOff` empty. Every row's verdict, lines lost, items moved, unit marks moved,
  class counts and marks file is unchanged.
- **The marks:** 169,448, the same. No answer now means no mark (the re-review's m4), and its cost on the corpus is
  **0 marks**: every one of the 399 samples (0 to 8 a paper, under `PROBE_MAX` 16; two papers ask none) was answered,
  no asked command went unasked, and none of the 111 probe logs holds an error inside a box. The answers are `00000000` (every mark) for 403 commands, and `22220000`
  (no mark before `.,;:`) for the two achemso papers' `\cite`.
- **The accepted five** stay accepted under the tightened heading-kern rule: in each, the lost kern has nothing in its
  place or (2608.25210) the full stop v0 sets elsewhere in the line.
- **The layout compile's own cost:** median +15.2 %, max +382 % (under a load of 6 to 15; one pair met a peak).

## The run (fix round 1, 2026-10-06)

- **The marks measured:** the merge e833483d with fix round 1 (the mark probe as the paper's own switch, a footnote of
  one letter a call, two calls in a row, `ENDS_IN_NUMBER` gone).
- **Wall time:** 4,081 s, every compile made again: the font probe with the mark probe, v0, v1, the two traces, and
  the bisects. The record was then written from the cache (`--bisect --write`, 16 s) with the heading-kern rule
  refined (below).
- **The figures, fix round 1 (merged):**
  - **106 clean (106), 5 accepted (5), 2 switched (2), 0 failing (0)**, none passed over;
  - lines lost: 5 strict (5), 3 joined (3), 6 by TeX (6), 6 all;
  - items moved: 13 strict, 6 joined; unit marks moved 5;
  - no regression against the merged record; `switchOff` empty.
- **The marks:** 169,448 (169,323). Lines with footnote marks 127 (85): calls of one-letter notes, second calls, and
  closing marks where TeX answered they change nothing. Macro lines 2,340 (2,344): `\footnote{A}` is a call now.
  Lines carried, unit 21,964 and heading 3,301 (one fewer each): 2608.03063's page-7 line, lost only in TeX's boxes,
  is no longer carried.
- **The switch:** TeX's answers take marks off in the two achemso papers alone (`\cite`: no mark before `.,;:`). Every
  sample of every paper was answered (no row missing). The other 111 papers' commands answer every mark.
- **The accepted five, from the evidence:** each of their lines TeX set otherwise holds a kern v0 set beside a
  heading's mark and v1 did not, and every other difference lies beside a heading's mark or sets the same node again
  at another stretch. That last clause was added after the run: 2608.25210's line is re-expanded by microtype
  (glyphs `(+7)` → `(+5)`), four of them beside the next paragraph's start mark, and the first rule (every difference
  beside a heading's mark) failed it.
- **The layout compile's own cost:** median +12.2 %, sum +16.6 %, max +114 % (under a load of 15 to 55).
- **The probe's cost:** the font probe compiled plain and with the mark probe, one after the other, twice each, on 12
  papers of 2 to 8 commands asked: +57 ms median, +163 ms at most, on a compile of 0.5 to 1.4 s. Timing noise is
  about ±130 ms: one paper was faster with the probe.

## The run (2026-10-06, before fix round 1)

- **The corpus:** the 113 pdfLaTeX packages of `out/corpus-meta.json`. TeX image
  `sha256:7334b00bf8e7a0996f7ddd65482363aaf7711d372e569f3ea78509619e3083ff`, the typesetting gate's.
- **The marks measured:** the merge of Task 1's fix round (150faa7b: C1, a paper's macro and a footnote's call get
  their opening mark alone and the piece after them none; I1, the leaders; I2, XeTeX's italic correction; I5, the key
  cut; the depth bound) with this task's f50535b6. The pre-merge figures (d082fc5e + f50535b6) are beside them below.
- **Wall time:** the merged run took 2,523 s for everything: the font probe, v0, v1, the bisects and the traces,
  every compile made again with the date pinned. The pre-merge run took 861 s of compiles and 1,453 s of traces. Each
  ran at most four compiles at a time, while other work kept the machine's load at 10 to 31.
- **The figures, merged (pre-merge):**
  - 198,875 lines in all;
  - **106 clean (105), 5 accepted (6), 2 switched, both clean (2), none failed, none passed over;**
  - lines lost: 5 strict (5), 3 joined (3), 6 by TeX (7);
  - items moved: 13 strict (13), 6 joined (6);
  - 5 unit marks moved (5), each on a lost line;
  - every paper traced; no class loses more lines than it carries (`switchOff` empty).
- **The marks:** 169,323 in the marks files, against 170,258 before. C1 takes the closing mark off every paper's macro
  and footnote call, and every mark off the piece after one. 63 names are dropped as set twice, in 8 papers, as
  before.
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

Before the merge, a sixth paper lost one TeX line. On 2608.10322, `\la {addic}` (a `\label` of the paper's) stood at
a paragraph's end, its closing mark before `\@esphack`, and left a glue of −0.00002 pt. C1 takes that closing mark
off, and the paper is clean now.

The five heading lines are the units' own marks: the bisect shows no class alone loses a line, and v1 with no class
(headings', cells' and MARK_DEF's marks only) loses each one. Ruling 2 accepted acmart's case: no line count, no
page and no reference changed. The same cause is in amsart (2608.00812) and IEEEtran (2608.08880), and the same verdict
applies. Task 1 took those two for pdfTeX's virtual-font drift; TeX's boxes show the lost kern. **No paper in the
corpus shows a PDF-only offset** (ruling 3's category): where items moved, TeX's boxes differ too.

## Lines carried, by class (the corpus)

| Class | Papers | Lines with its marks, merged (pre-merge) | Carried, merged |
|---|---|---|---|
| math | 110 | 29,536 (29,553) | 29,535 |
| unit (MARK_DEF's) | 111 | 21,970 (21,970) | 21,965 |
| cite | 109 | 5,177 (5,192) | 5,177 |
| cell | 69 | 5,106 (5,106) | 5,106 |
| display | 97 | 4,871 (4,875) | 4,871 |
| ref | 108 | 4,695 (4,695) | 4,694 |
| heading | 112 | 3,307 (3,307) | 3,302 |
| macro | 84 | 2,344 (2,381) | 2,344 |
| eqref | 54 | 1,715 (1,715) | 1,715 |
| code | 35 | 355 (355) | 355 |
| footnote | 24 | 85 (105) | 85 |
| url | 28 | 79 (79) | 79 |

**The classes on: all nine** (`LAYOUT_CLASSES` unchanged). **Off: none.** No class alone loses a line of any
paper, and none loses more lines than it carries.

## Found and fixed in this task (layout/marks.mjs)

1. **A closing mark after a number or a dimension** (2608.30640: `.\n\looseness=-1 While`). TeX takes the space
   after a number as the number's end, and reads on for a unit or a `plus`. The closing mark ended the number, so the
   space became a space: one more glue on page 3. Task 1's "PDF.js cuts one line into three items" on this paper was
   that space. Since the merge, C1 gives every paper's macro its opening mark alone, and only a macro's source can end
   in a number (the others end in a closing delimiter). The rule that covered it (`ENDS_IN_NUMBER`) could not be
   reached any more and was deleted in fix round 1; the native case "a number or a dimension set before a word" stays.
2. **The paper's own switch** (next section).
3. **A footnote whose note makes no unit** (fix round 1). The scanner makes a unit only of a note with two letters or
   more, so `\footnote{A}` (or a note that is a link alone) stays a placeholder. It was classed a paper's macro: glued
   to its word, it got no mark, and the paragraph's call could not be placed. It is now a footnote's call (`classOf`),
   marked as one; its note, with nothing to translate, stays as it is. The scanner itself is unchanged: a unit of one
   letter would change the units, and so the bytes, of today's run.
4. **Two calls in a row** (fix round 1). C1 gives no mark to a piece after one that may look ahead, so the second of
   `\footnote{One}\footnote{Two}` had none. Where TeX answers that a mark between two calls changes nothing (the
   probe's `call`), the second is marked too. The committed code marked 4 of the 20 calls in the native case "a
   footnote of one letter, and two calls in a row"; this marks 20 of 20, and under footmisc's `[multiple]` too (its
   separator comes from a flag the first call sets, not from a look ahead), with no line moved in either.

## The paper's own switch: TeX asked (fix round 1)

The first switch read the preamble for a list of packages. The review found what such a list misses:
- biblatex scans for `.,;:!?`, not `.,;:` (53 items moved with `\autocite{a}?`);
- TeX Live's own biblatex styles beyond biblatex's (chem-acs, ext-verbose: 51 and 42 items moved);
- REVTeX 4.2's superscripts, which swap the punctuation themselves;
- cite.sty `super` set by a class.

So the switch now asks TeX, in the paper's own preamble, by the general method the maintainer asks for.

**The probe** rides on the font probe's compile (`probeFiles(paper, { marks: true })`): the layout marks' TeX first,
then, after the width probe, one section per question. Each section writes tagged rows, `LAYOUT-PROBE <schema> <tag>
<fields…>` (`PROBE_SCHEMA` 1), and `readProbe` reads every row; a section added later (a role probe) adds a tag of its
own and changes no other. The punctuation section (`punct`) takes each command of the paper's citations, references,
links and footnote calls once, by its own first source (the keys it cites). For each of the followers `.`, `,`, `;`,
`:`, `!`, `?`, a word, and (for a call) a second call, it sets four boxes after a word:
- the source as the paper sets it;
- with `{}` between the source and the follower (does the command look at what follows?);
- with both layout marks;
- with the opening mark alone.

The boxes are compared by width, height, depth and their last node. The answer is one code a follower:
- 0: every mark;
- 1: no closing mark;
- 2: no mark (for `call`: 0, a mark may stand between the two calls; 2, none may).

Every box starts from the same state (the footnote counter as it was, biblatex's trackers reset) and ends at a space,
where each package's lookahead stops. An empty paragraph after each command starts TeX's error count again.

**A box that errors** (fix round 2, the re-review's I-new): the register is voided before each box, so a box an error
ends early reads as a void box, never as the box before it still in the register. A row `punct-at <i> <j> <box>` goes
before each box, so an error TeX logs is that box's. An error in the box as the paper sets it, or with `{}`, leaves
that follower no answer (`x`); in the box with the opening mark, no mark; in the box with both marks, no closing mark.
REVTeX 4.2 with `citeautoscript` is the case: its swap takes the closing mark into a `\csname`, so before `!`, `?` and
a word the probe now answers the opening mark alone (`22221110`), where it had answered every mark and the full
compile broke every such citation.

**What the switch does** (`layoutMarking`'s `switches`): a placeholder of an answered command gets the marks TeX's
answer for what follows it allows. With no answer (no row, an `x`, or a command of an asked class TeX was not asked
about), it gets no mark (fix round 2, the re-review's m4: the safe direction). With no probe run at all (`switches`
null), the marks are as before. A footnote's call TeX answered for may keep its closing mark, and the piece after it
its marks, where the answer says a mark there changes nothing.
Measured on native documents (all now move 0 items):

| Preamble | Answer before `.` `,` `;` `:` `!` `?` |
|---|---|
| biblatex `autocite=superscript`, `autocite=footnote`, chem-acs, ext-verbose (`\autocite`) | no mark before all six |
| natmove (natbib `super`), cite.sty `[super]` | no mark before `.,;:` |
| fnpct (`\footnote`) | no mark before `.` and `,` (the review's M2: the call's opening mark marked the full stop) |
| a citation macro ending in `\xspace` | no mark before all six |
| natbib `[super]` alone, plain cite.sty, biblatex numeric `\cite`, REVTeX 4.2 `aip,jcp` and `aps` | every mark |
| REVTeX 4.2 `aip,jcp,citeautoscript` (fix round 2) | no mark before `.,;:`; no closing mark before `!`, `?` and a word |

REVTeX 4.2 `aip,jcp` answers every mark: there `\@cite` is `\NAT@citesuper` (checked), yet with the paper's own
`\cite` nothing moves in a preamble-only compile or in the native case (0 items). The review measured 31 items in a
setup not given. A swap that depends on the aux would not show in the probe; the corpus check would still catch it
(no corpus paper uses `aip`).

**The corpus with the switch:** see "The run (fix round 1)" below. Both achemso papers stay clean with the switch:
`\cite` answers no mark before `.,;:`. The pre-merge evidence for "no mark at all" still holds:

| | 2608.23865 (achemso, 520 lines) | 2608.25928 (achemso, 748 lines) |
|---|---|---|
| No switch | 46 lines lost | 96 lines lost |
| No closing mark on any citation (the first ruling) | 12 lost | 9 lost |
| No mark on a citation the punctuation follows | 0 lost | 0 lost |

natmove sets the full stop against the word before the citation. The opening mark stands between them and loses
their kern. That mark also marks the wrong place: where the full stop begins, not where the citation does. Its cost:
in a superscript paper nearly every citation stands before punctuation (18 of 18 and 34 of 41 here), and those get
no mark.

**Limits:**
- The probe asks what the preamble alone makes of a command. A behaviour set by the aux on a later pass, or by
  something in the body, is not seen; the corpus check measures it.
- A command the paper writes only with a source TeX cannot set in a box (a `\verb`, a `%`) is not asked about, and so
  gets no mark.
- The probe cannot see a space factor: `\unskip` takes the follower's space off before the box is measured (the
  re-review's m2). A closing mark that resets biblatex's `!` and `?` space factors reads as no change; the corpus check
  would call such a paper failing.
- A row must fit one log line (79 characters at the default `max_print_line`); today's are at most 32.
- In production the layout compile must be written after the font probe's compile returns: Task 14.

## The compile time, v0 against v1: the layout compile's own cost

v0 and v1 of a paper were compiled at the same time, so each pair met the same load. v1 is now the separate layout
compile, so its time over v0 is that compile's own cost over the readings compile's.

- **Merged run:** median +13.5 %, p10 −0.5 %, p90 +42.6 %, max +87.5 %; summed over the corpus, +17.5 %.
- **Pre-merge run:** median +11.5 %, p90 +35.6 %, max +341 % (2608.08903, under a load near 30); summed, +15.2 %.
- **Sequential check (pre-merge):** the two largest, compiled again one after the other and twice each:
  - 2608.08903, from 2.10 to 2.62 s (+25 %);
  - 2608.12606, from 3.7–4.1 to 4.45 s (+9 to +20 %);
  - each with the same latexmk passes as v0 (2 and 4).

The times include about a second of Docker's start.

## The marks file

The median is 324 KB raw and the largest 1,398 KB (2608.30730), all under `MARKS_CAP`, each parsed by
`parseLayoutMarks`. 63 names are dropped as set twice, in 8 papers.

## Not done here

- **The typesetting gate with `LAYOUT=1`** (the brief's Step 4): obsolete under the change, since the readings and
  final compile carries no layout marks. It is also not runnable on this machine: no `runs/visual-eval`
  translations, and making them needs Microsoft's endpoint.
- **`spikes/layout-same.mjs --pair`** (ruling 4) now reads nothing of the gate's, the corpus' or C0's before it runs.
  It used to throw where `data/runs/gate` was missing. The corpus check does not use it.

## A row of `layout-marks.json`

`{ id, v0, v1, switched?: <commands TeX's answers took marks off>, unanswered?: <asked commands with no answer>, probe: { samples, answered, ms }, ms: [v0, v1],
pages: [v0, v1], items, moved: { strict, joined }, lines, lost: { strict, joined, tex, all }, unitMarksMoved, captions:
[unit, v0Page, v1Page][], readings, files: { aux, toc, lof, lot, out }, errors, marksFile: { kb, dropped, marks },
traced, cause?: 'tex' | 'pdf-only', causes?: { accepted, unexplained }, boxes?: [{ page, near, what }], classes: {
<class>: { lines, carried, lost?, texLost? } }, own?: { lost }, switchOff?, verdict }`. `counts` sums them.
