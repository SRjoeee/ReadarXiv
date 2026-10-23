# Read arXiv: architecture audit against "fundamental, general, simple" (2026-10-23)

Read-only. Engine: public repo `origin/next` at `c9c5576e` (#432). Web: readarxiv-web `origin/main` at `883473d3` (#70).
Every `file:line` below is at those refs (`git show <ref>:<path>`). Engine paths are relative to `src/pdf-reader/engine/`
unless they start with `src/`. Inputs: the lane notes `route/design.md`, `route/delta.md`, `route/delta-measure.md`,
`route/layer-side.md`, `route/host-side.md`, `route/p8b-brief.md`, `c299-lookahead.md`, `residuals/*.md`, and the in-flight
branches `fix/zero-ink-symbols` (6ba26083) and the `wt-jstretch` worktree (uncommitted diagnostics).

The test used for each finding: is there a definition (TeX's, Unicode's, the PDF's, arXiv's) or an exact measurement that
could decide this instead of a name list, a tuned constant, a heuristic or a guard-and-retry? If yes, the finding gives that
alternative.

Status: **In progress** means a lane is replacing it with the fundamental form, so it is only listed. **Partial** means a fix
landed or is under way but is itself table-, threshold- or heuristic-based. **Open** means nothing is under way.

Ranking: reader impact first (prose left in English or wrong on the page, then whole papers or parts refused, then visible
defects, then latency), then the complexity removed.

## Ranked summary

| # | Finding | Reader impact (measured) | Fundamental alternative | Cost | Status |
|---|---|---|---|---|---|
| 1 | Marks are tokens in the paper's source. Their safety comes from name lists, guards catch failures and retry, and their side effects reach the reader's page | 941 of 116,679 pieces (0.8 %) get no marks, in 72 of 177 papers. 154 LOST rows. Revtex4 headings lose their marks. On B vs C, 40 of 368 pages differ (one paper prints a mark) | The page the reader sees is the unmarked compile. Marks are only a measuring instrument, accepted per line by exact glyph equality. Where a mark may go is decided by TeX's own answer (probe), and every mark is `\protected` with a name `\uppercase` cannot change | L | Partial |
| 2 | One placeholder is classified by at least seven independent tables, and they disagree | `\@` leaves 6 units in English. `{\bf81}` leaves an abstract in English. 30 rows are "no row" | One command model per paper, measured by TeX and our compile and written once into the layout file. Every stage reads only that | M–L | Partial |
| 3 | The compile's engine, driver and main file are guessed, while arXiv's PDF states them | Whole papers refused (latex 96 rows, toplevels 39). The 0.5 pt line tolerance and the `-p` page size are workarounds for using a different driver | Read the producer chain from arXiv's PDF and compile with arXiv's own chain. Choose the main file by exact page-1 text | S–M | Partial |
| 4 | Style and colour are inferred from font names, command names and majorities | 995 rows lose link colour, 350 lose colour in prose. The sweep's own regexes cause 500+ false rows | TeX logs its font state and colour at each group (the same channel as AXT-COLOUR). Each glyph keeps its own fill | M | Open |
| 5 | Erasing composites two renderings by rectangles with pads. Ownership is geometric. "The old way" is a second mechanism | Gate: 1–84 glyphs erased but not accounted for per output, up to 12 lines a drawn unit leaves intact. Residue possible wherever glyphs come within 0.6 pt | Ownership by content-stream order, as placeholders already have it. One optional-content group per unit, so PDF.js renders the page with the drawn units hidden | L | Open |
| 6 | The left pane is anchored by matching text. Our base is admitted by a fuzzy line carry and a 90 % share | Parts refused when under 0.9 (2307.16209: 15 pages). Sentence starts can land up to 2 words late | Exact glyph-line identity between our page and arXiv's. On identical lines the left's positions are our marks. Decide per unit, not by a share | M | Partial |
| 7 | Lines, scripts and labels are found by geometry windows and an English word regex | Revtex4 section numbers are stranded on their own line. Subscripts get assigned to the wrong line | Lines by content-stream order. Labels are the glyphs before the unit's start mark | M | Open |
| 8 | The translator contract uses markers with repair regexes and a "runs" fallback that drops context | 106 colour rows (the engine flattens style). Units come back as disjoint runs. The highlight is lost when alignment fails | Typed inline elements echoed by id, sentence (and word) alignment, verified by reconstruction, failures re-asked element by element | M–L | Open |
| 9 | The front end is a regex scanner over about 30 name sets plus a curated role table | Junk units (`\foreach`), merged paragraphs (CRLF), missed text | Arity and argument specs read from TeX in the existing probe. Unit boundaries checked against TeX's own paragraphs | L | Partial |
| 10 | Typesetting fits in fixed steps, and typographic tables are kept twice | 378 review rows and 13 violations for letter-spaced lines | An exact monotone solve. Kinsoku from UAX 14 alone. Glue widths read from our page | M | Partial |
| 11 | Gates compare with the last build, tolerate known rows and need rulings. The checker re-derives facts its own way | Indirect: defects pass, and true fixes need rulings | Absolute invariants against the original page. The checker reads the engine's file | M | Open |
| 12 | Reader host: two documents, a timer-based stall, columns guessed again, polling gates | 20–28 s stalls on heavy pages (p8) | The delta (one document). Progress-based stalls. Columns from the file. A queued gate | S each | In progress (delta, p8b), the rest Open |
| 13 | The title stamp is matched by two different regexes. The extension trusts the PDF's title first | The stamp shows as the title on old PDFs in the extension | arXiv's metadata is authoritative in both hosts | S | Open (engine) |
| 14 | About 12 hand-bumped version numbers | Stale caches and branch collisions (recorded in versions.mjs) | Identities derived from code digests | M | Open |
| 15 | The parked compiled-translation path is still tangled with the live one | None directly. Several thousand lines | Move the 6 live helpers out, then delete the parked path | S–M | Deferred (#299) |
| 16 | HTML extension: one site's selectors are the whole model, and the paper is segmented twice | Low on arXiv. Matters for v2 | An adapter of roles with an HTML-semantics default. Rows shared by text identity | M | Open (v2) |

The same three fixes recur in every row: TeX's own measurements written once into the layout file, arXiv's PDF as the
source of compile and page identity, and one document (the delta) carrying optional content for display. Findings 1, 2, 4,
6 and 7 all come down to "TeX already knows this, so ask TeX once". Findings 3 and 6 come down to "arXiv's PDF already
says this".

## Already being replaced (listed, not re-reported)

- **One document**: our base as an incremental update over arXiv's original (`route/delta.md`). It replaces two
  documents for two panes, the alias table, the `/base/` store for most papers, and the p8 double download.
- **p8b**: base reads wait behind the original's reads (`route/p8b-brief.md`). An interim measure until the delta lands.
- **`\@` and similar control symbols**: `fix/zero-ink-symbols` (6ba26083, `rules/tex-kernel.mjs`). It joins the maker's and
  the layer's ink-free tables. Note that it is itself a new, hand-written table (see 2).
- **LOOKS_AHEAD arity follow-up** (`c299-lookahead.md`). The plan is to scan macro bodies for `\xspace`, `\@ifnextchar` and
  `\futurelet`. That is a heuristic over definitions (see 1 for the measured form).
- **Letter-spaced lines** (invariant j): diagnostics in `wt-jstretch` (`line.endBy`, `line.jd`), with 378 review rows and
  13 violations (`residuals/j-rows-route-20261023.json`).
- **Highlight word-table order** (`residuals/highlight-report.md` §4.1).
- **Landed**: the TeX Live year from `PTEX.Fullbanner` (#433 and the web), guessed toplevel count (#427), the latex page
  size (#70), image-mask rules painted over (#428/#429), deletion of v0 and the proof (#430). Findings 3 and 5 explain why
  the last three treat symptoms.

---

## 1. Marks are tokens in the paper's source

**What it is.** The marked original writes `\axtpma{…}`, `\axtpm{…}`, `\axthmark{…}` and similar into the paper's own
tokens. Whether a mark may stand next to a piece is decided by name lists. Failures are caught by guards that unmark units
and compile again. The final pass of that marked source is the page the reader sees.

**Where.**
- `layout/marks.mjs:832-835` LOOKS_AHEAD: after any paper macro, footnote call, or source ending in
  `\protect|\noexpand|\expandafter|…`, the next piece gets no mark at all.
- `:826` ENDS_IN_CS.
- `:40-44` INVISIBLE (INVISIBLE_WORDS plus latex-front's NO_ARGS).
- `:94` ASKED: only 5 classes are probed.
- `:96` PROBE_MAX = 16 and `:163` INK_MAX = 64: the TeX probe is capped.
- Measured: 941 of 116,679 pieces (0.8 %) are withheld in 72 of 177 papers (`c299-lookahead.md`). LOST is 154 rows: 49 are
  paper macros that get only an opening mark, 36 are superscript citations that packages move past the punctuation
  (`residuals/unproven-report.md` C1).
- **Marks destroyed by expansion.**
  - `\axthmark` is a `\def` with a `\protect` test (`marks.mjs:716`). Under revtex4's `\protected@edef` and `\uppercase` it
    takes its `\@gobble` branch and its name is uppercased. The heading then has no start mark and no label
    (`residuals/1007-report.md` §2). This is not fixed on next.
  - A mark inside `\url` is printed as text (2610.19860, design §2.1).
- **Safety nets.**
  - `layout/guard.mjs:29` braceBalance, `:131` marksOutOfPlace, `:182` auxUnits, `:249` errorUnits.
  - `layout/base.mjs:105,122` MARK_TEXT and markTextOf grep our PDF's text for `axt@`.
  - `layout/paper.mjs:32` GUARD_EXTRA = 2 extra compiles.
- **Side effects on the reader's page.** The base page is the marked final pass (design §3.1). Against the paper's own
  compile it differs on 40 of 368 pages: 5 papers with a paragraph re-broken, 5 with first lines shifted, 1 with a mark
  printed (design §2.1).

**Why it is not fundamental.**
- Whether a mark changes what TeX sets is a fact TeX can answer. It is not a property of a command's name.
- A measuring instrument should not be part of the product page.

**Fundamental alternative.**
- **(a) The page the reader sees is the paper's own unmarked final compile C. The marked compile B is only an instrument.**
  - A unit's positions are taken from B only on lines whose glyph sequence (character, font, x and y to 0.01 pt) is
    identical in B and in C. That test is exact and has no threshold.
  - A mark that disturbs TeX then costs only its own unit, reported by name. It never changes the page.
  - Cost: one more final pass. Phase 1 measured 6–7 s, and 99 s on the figure-heavy 2608.16117.
  - Side benefit: C matches arXiv's PDF on 192 of 244 pages, B only on 168 of 244 (design §2.2). So the delta reuses more
    of arXiv's streams.
- **(b) TeX decides where a mark may go.**
  - The probe already answers this for punctuation followers (`punctuationSection`) and for ink (`inkSection`). Extend it
    to every distinct (command, follower) pair the paper writes, with the rule: a mark is allowed iff TeX sets the same box
    with and without it.
  - Bound the probe by measured time, not by 16 and 64.
  - Make every mark `\protected`, with a name of digits only, so that no `\edef`, `\write` or `\uppercase` can change it.
  - Measure, as an option, marks emitted by the commands themselves through LaTeX's generic command hooks
    (`cmd/<name>/before` and `cmd/<name>/after`). They would travel with the command's ink after its look-ahead, which
    covers superscript citations. Where LaTeX cannot hook a command it says so, which is TeX's answer, not a list.

**What it removes.** LOOKS_AHEAD, ENDS_IN_CS, INVISIBLE_WORDS, ASKED, the probe caps, markTextOf and MARK_TEXT, most of
the guard's remedy branches (keep "ran through" and "page count"), the c299 arity scan, and the fallbacks of finding 7.

**Cost.** L. **Status.** Partial: the kernel table and the c299 plan narrow this class but keep it.

## 2. One placeholder, seven classifiers

**What it is.** "Does this placeholder set ink? Is it a citation, a reference, a display?" is answered from LaTeX source
names by several independent tables.

**Where.**
- **Maker**: `layout/marks.mjs:63` classOf, plus the regexes at `:40-58`.
- **Layer**:
  - `layer-proto/layer1.mjs:85-92` ZERO, SPACE, CITE, DISPLAY, and `:127` phClass;
  - `layer-proto/layer2.mjs:284` phClass2 and `:317` phClassProven, which decide "needs a proof" from MORE_SYMBOLS (`:260`)
    and STRUCTURAL (`:281`).
- **Wire**: `translate/mt.mjs:93` INKLESS, `:425` DISPLAY, `:970-972` CITE, CITET, REF.
- **Links**: `layer-proto/links.mjs:295-296` CITE_SRC and REF_SRC.
- **Front end**: `source/latex-front.mjs:69` NO_ARGS, `:73` MATH_ENVS, `:101` DISPLAY_NAMES.
- **Parked**: `pipeline/typeset/density.mjs:119-122`.
- **Style**: `layer/pieces.mjs:17` FLAGS and `layer2.mjs:1678` STYLE_CMDS.
- **In flight**: `rules/tex-kernel.mjs`.

**They disagree.**
- links.mjs knows `\vref`, `\subref` and `\labelcref`; marks.mjs's REF does not.
- marks.mjs's CITE takes any `[cC]ite*`; layer1's CITE takes a fixed set of 10.
- `\@`: six units in English on 2602.23285 (`residuals/p8-stall-report.md` §2).
- `{\bf81}`: the abstract in English on 1007.0072 (`residuals/1007-report.md` §4).
- `\bfseries 100` and `\noindent 38`: 30 "no row" rows (`residuals/unproven-report.md` C2).
- Some pairs are kept equal only by tests: `layer/pieces.mjs` header; INLINE in `marks.mjs:819` against latex-front's.

**Why it is not fundamental.** The layer guesses from source text what the maker already measured on our own page (EMPTY,
TEXT, segments, LOST). Two readers of one fact will drift.

**Fundamental alternative.** One command model per paper, made once at prepare from the probe and the marked compile. The
probe runs before translation starts, so the wire can read the model too. For each distinct placeholder source it records:
- what TeX set: no ink, text (with its Unicode), or other ink;
- whether it is a link, and the kind of its destination, from our compile's own annotations (the base is ours);
- whether it is math or a display, by TeX's mode at the mark.

The layout file carries this per placeholder: the existing EMPTY, TEXT and segment flags become the only "zero" and "text"
signals. The layer, the wire, links and the gate all read it, and no stage parses command names to classify.

**What it removes.** Classification in phClass, phClass2, phClassProven and texToText2; INKLESS, CITE and REF in mt.mjs;
CITE_SRC and REF_SRC; density's tables; tex-kernel.

**Cost.** M–L. **Status.** Partial: tex-kernel unifies one of the seven tables.

## 3. Compile identity is guessed while arXiv's PDF states it

**Where.**
- `source/paper-meta.mjs:92` compilerGuessed: fontspec means xelatex, EPS only means latex, otherwise pdflatex.
- `:61` main file by preferred names (`main|ms|paper|manuscript|arxiv`), then by longest body. `:65`: with several
  sources, by code-unit order.
- `container/src/sandbox.ts:48-51`: dvipdfmx gets `-p` from arXiv's page 1 (#70). arXiv makes latex papers with dvips and
  ps2pdf; we use dvipdfmx.
- `layout/carry.mjs:31-36` LINE_PLACE = 0.5 is justified by "dvipdfmx's DVI against arXiv's dvips and ps2pdf sets words up
  to 0.42 pt apart (2608.22687: 70.7 % whole lines)".
- Refusals: latex 96 rows and toplevels 39 rows (`residuals/unproven-report.md` A3, A4); 1008.0072 (`residuals/1008-report.md`).

**Why it is not fundamental.** arXiv's PDF is fetched before any compile; the prepare already reads its date, banner and
page size from it. Its Producer and Creator name the chain: pdfTeX, XeTeX (xdvipdfmx), LuaTeX, or dvips with GPL
Ghostscript. Its page-1 text names the main file.

**Fundamental alternative.**
- **(a) Same toolchain.** Take the engine and driver from arXiv's producer chain, and compile latex papers with arXiv's own
  chain (dvips and ps2pdf, on the banner's TeX Live year). Pages are then equal by construction: the page size follows,
  and the 0.42 pt drift that LINE_PLACE absorbs goes away. Marks would use pdfmark `/DEST`, which needs a measurement.
  Ghostscript's image-mask rules are then owned by stream order (5).
- **(b) Main file and order by evidence.** Match each candidate's `\title` or first paragraph against arXiv's page-1 tokens
  exactly; with no title, compare each candidate's draft page 1. The same test orders several toplevels.

**What it removes.** The preferred-name list, the longest-body and code-unit-order rules, `paperSizeOf` with `-p`, and the
driver-drift justification for LINE_PLACE.

**Cost.** S–M. **Status.** Partial: the TeX Live year, the toplevel count and the page size have landed.

## 4. Style and colour are inferred, not read

**Where.**
- `layer-proto/fonts.mjs:39` classifyFont works from font-name regexes; so do `rules/font-roles.mjs:233-239` (BOLD,
  ITALIC, CAPS, MONO_WORD, SANS_WORD).
- `layer/pieces.mjs:14` LAYER_COLOURS is a closed list of 19 xcolor names; any `\definecolor` or model colour becomes "none".
  `:17` FLAGS.
- `layer2.mjs:1678` STYLE_CMDS, `:1760` measuredStyle (majority votes), baseOf.
- `layout/make.mjs:934` fillOfGlyphs: the majority over 50 %, else MIXED_FILL.
- Measured (`residuals/attributes-report.md`): 995 rows of link colour lost and 350 rows of prose colour lost are layer
  defects. 201 + 152 weight and slant rows "invented" and 168 alignment rows are defects of the check: the sweep reads with
  its own regexes.

**Why it is not fundamental.** The base page is our compile. TeX knows its font state and colour in every group, and our
page's operator list holds each glyph's exact fill.

**Fundamental alternative.**
- The marked compile logs TeX's NFSS state (`\f@encoding`, `\f@family`, `\f@series`, `\f@shape`) and `\current@color` at
  each unit start and each group's open and close. This is the same channel AXT-COLOUR (`marks.mjs` readColours) and
  AXT-ALIGN already use. The file carries the result per piece.
- A placeholder drawn as text keeps runs of each glyph's own fill, not one majority.
- The face comes from the NFSS family, through the font probe's family table.

**What it removes.** classifyFont's use for style on our base, STYLE_CMDS, FLAGS, LAYER_COLOURS, MIXED_FILL and the majority
votes. The checker then reads the same rows, which removes its 500+ false rows.

**Cost.** M. **Status.** Open: only colour pieces are read from TeX today.

## 5. Erasing composites two renderings by rectangles, with geometric ownership

**Where.**
- `layer-proto/removal.mjs:175` fileOwnership: a glyph belongs to a line when its baseline is within
  SCRIPT = 0.6·size + 1.5 (`:27`), with pads of 0.05, 0.3 and 0.1, and rules "wholly inside" within ±0.3.
- `:514` RULE_THIN = 1 marks image-mask rules. `:424` RULE_THICK and RULE_LONG. `:385` pageDirty, `:466` protection,
  `:515` fileSwap.
- `layer/swap.mjs:21` swapRects and `:56` SWAP_PAD = 0.6: the swap is "exact but where two glyphs come within pad".
- `view/drawn.mjs` re-implements PDF.js's canvas flooring (ROUND_MAX, a calcRound probe). `view/layer-side.mjs:47-49` K_SLACK,
  and RECOPY_MS = 600 because "PDF.js draws its own pages 400 ms after".
- A second mechanism, "the old way" (erase and put back), runs where the remover refuses a page: `layer-proto/run.mjs:639`,
  `layer-proto/cut.mjs:17`, `removal.mjs:12-14`.
- Gate (`lab/pdf/records/layer-gate.md`, recorded 2026-10-15, before the route): erased glyphs not accounted for, 1–84 per
  output; a drawn unit's own lines left intact, up to 12.

**Why it is not fundamental.** The content stream already holds each unit's start and end points (`/axt-<n>s ri` …
`<n>e`), and `layout/stream.mjs` already derives each placeholder's own ink exactly by stream order. A unit's ink can be
derived the same way. Geometry is guessing what the order states.

**Fundamental alternative.**
- **(a) Ownership by stream order.** Every glyph, rule and image belongs to the unit whose points enclose it, with
  stream.mjs's region rules for floats and footnotes. The file stores operator index ranges.
- **(b) One optional-content group per unit.** The remover wraps each unit's owned operators in `/OC /u<i> BDC … EMC`,
  splitting a TJ at ownership boundaries as it already splits for removal. The group can live in the delta. The layer
  renders the composed page with PDF.js's optionalContentConfig, hiding the units it draws, and lays its SVG on top.
  - One rendering: no swap between two renderings, no paper fills, no canvas copies, no scale capture.
  - Residue is impossible by construction.
  - The add-on stays one per paper; each target only chooses visibility.

**What it removes.** swap.mjs; most of removal.mjs (about 630 lines); drawn.mjs's scale capture; layer-side's copy path; the
old way; the R pages; RULE_THIN and the image-mask special case.

**Measure first.** PDF.js render time with thousands of optional-content groups, and how often visibility changes per page.

**Cost.** L. **Status.** Open. It fits the delta, which writes this section anyway.

## 6. The left pane is anchored by text, and the base is admitted by a fuzzy share

**Where.**
- `pipeline/anchors.mjs`: 3-gram text anchors (`:19` K), FIRST, GAP, SMALL, BODY, ACROSS, FLOAT_SKIP, AHEAD, OWN (`:527-538`),
  minCoverage 0.6 (`:805`), TEXT_ONLY 0.8 (`:1184`), and a Times width table (`:243`).
- `layout/carry.mjs:21-56`: CLUSTER, LEFT, SIG_BASE, SIG_FLOOR, WHOLE, SAME, LINE_PLACE, FUZZY, WINDOW, FUZZY_WORDS, NEAR,
  PAGE_WORK.
- `layout/make.mjs:48` CARRY_MIN = 0.9, applied at `pipeline/page-pass.mjs:130,350`. Design §3.3.5 says "The thresholds are
  today's".
- Sentence starts are found late by up to two words (`anchors.mjs:1153-1164`).

**Why it is not fundamental.** "Is our line arXiv's line?" is an equality with an exact answer at TeX's quantum. The delta
builder already proves whole pages identical at the stream level (`route/delta-measure.md`).

**Fundamental alternative.**
- For each line, test glyph-sequence equality (character, font, x and y within 0.01 pt) between our page and arXiv's.
  Pages whose streams are byte-identical (the complement of the delta's `replaced`) need no test.
- On identical lines, the left's unit geometry and sentence starts are our marks' positions, exactly.
- A unit is drawn iff all its lines are identical. Otherwise it stays the original's, decided per unit rather than by 90 %
  of a part.
- With finding 3's toolchain, identity becomes the norm.

**What it removes.** carry.mjs, the text-only path of anchors.mjs and group B (about 344 lines), CARRY_MIN and LINE_PLACE.

**Cost.** M. **Status.** Partial: the delta computes stream identity but nothing uses it for this.

## 7. Lines, scripts and labels by geometry and English words

**Where.**
- `layout/make.mjs:55-100`: BODY 0.15, the SCRIPT window, GLUE 0.2, LABEL_EM 2, BAND_DOWN and BAND_UP, SCRIPT_SIZE 0.85,
  SHIFT, CENTRE and SHORT (used where TeX's alignment is missing), BREAK_X, BREAK_Y, BREAK_UP, BREAK_FAR, INK_OFF,
  WRAP 2.5, TEXT_SPACE 0.102.
- The LABEL regex (`Figure|Table|Algorithm|Theorem|Lemma|…`) is at `make.mjs:86`, with a second copy at `layer2.mjs:985`.
  headLabel is at `make.mjs:1625`.
- The revtex4 section number stays on line 1 while the translation drops to line 2 (`residuals/1007-report.md` §2).

**Why it is not fundamental.**
- pdfTeX ships each line's list contiguously, raised boxes and scripts included. So stream order between a line's base
  glyphs states exactly which glyphs belong to that line.
- A label is the glyphs before the unit's start mark on its first line. That is exact once the mark survives (1(b)).

**Fundamental alternative.**
- Lines by stream-order containment: a glyph off the baseline belongs to the line whose base glyphs enclose it in the
  stream. Inserts, footnotes and floats are already regions in stream.mjs.
- Labels by the start mark.
- Remove the English regex.

**What it removes.** About 15 constants, both LABEL regexes, headLabel, and the `toLastLines` guard that report 1007
proposes.

**Cost.** M. **Status.** Open.

## 8. The translator contract: markers with repairs, and a fallback that drops context

**Where.**
- `translate/mt.mjs:20`: markers of the form `@a#`.
- `:658-660`: the STRAY and STRAY_PAIR repairs in tolerant rehydrate.
- `:1024,1063-1095`: the "runs" fallback, which translates each stretch between placeholders on its own.
- Web `worker/src/mt/chain.ts`: markersIntact, else the next engine.
- Sentence alignment comes from Microsoft's `sentLen` only; Google's comes from injected markers (`src/providers/alignment.ts`).
- A second Microsoft client, `mt.mjs:906` translateMicrosoft, exists beside `src/providers/microsoft.ts`.
- 106 colour rows are a "Microsoft limit": the engine flattens style groups (`residuals/attributes-report.md`).

**Why it is not fundamental.** The engine is asked to preserve tokens it does not know are opaque. When it fails, the
fallback throws away context instead of verifying and retrying precisely.

**Fundamental alternative.** One contract for every provider, native for an LLM through structured output:
- **Request**: segments of text with typed inline elements (void elements with an id; paired elements with an id and
  attributes), plus the source's sentence cuts.
- **Response**: every id exactly once, pairs nested, plus sentence alignment, and word alignment where the engine has it
  (Microsoft v3's `includeAlignment` and `includeSentenceLength`; whether the free endpoint honours them is unverified).
- **Acceptance**: by reconstruction.
- **On failure**: re-ask with the failing element pinned, never "runs".
- Paired elements carry style, so colour and weight survive (the 106 rows), and word alignment would make the highlight's
  word table exact.
- One client per engine: delete mt.mjs's.

**Cost.** M–L. **Status.** Open.

## 9. The front end is a scanner of name sets

**Where.**
- `source/latex-front.mjs:40-86`: HEADINGS, OWN_UNIT_ARG, CAPTIONS, FRONT_MATTER, FRONT_PROSE, FRONT_LINES, INLINE_TEXT,
  CONTENT_BOX, NO_ARGS, MATH_ENVS, SKIP_ENVS, LINE_ENVS.
- `:263-280` TABLE_ENVS, FLOAT_ENVS, FULL_RULE, NOT_CONTENT; `:818` TEX_IFS; `:925` RUNNING_HEADS.
- `rules/arg-roles.mjs:49` DELIMITED: `\foreach` and `\etocdepthtag` were added after 2610.21377 and 2610.21201. `:53` CURATED.
- The CRLF paragraph bug (`residuals/10069-report.md`, fixed by #417) is an example of the class.

**Why it is not fundamental.**
- The arity and argument shape of every command a paper uses are TeX's definitions. They are readable after the preamble,
  in the probe compile that already runs (`\meaning`; xparse's `\GetDocumentCommandArgSpec`).
- Units are TeX paragraphs, which the marks can check.

**Fundamental alternative.**
- One probe row per distinct control sequence, giving its arity and argument spec. LaTeXML's prototypes stay only for
  argument roles.
- Check that each unit's start and end marks fall in one TeX paragraph; split or merge on that evidence.

**What it removes.** Further growth of DELIMITED and CURATED, and most of the name sets.

**Cost.** L. **Status.** Partial: CRLF is fixed; other cases are fixed by adding table entries per paper.

## 10. Typesetting by fixed steps, and typographic tables kept twice

**Where.**
- `rules/layout-rules.json`, per script: step 0.025, floor 0.8, floorMin 0.6, trackMin -0.03, borrowGap 0.35, and
  adaptiveFill band, track and size.
- Hand-written noStart and noEnd lists sit beside `layer-proto/no-start.mjs`'s UAX 14 table.
- `layer2.mjs:1894-1895` KERNS and SKIPS give TeX's spaces as fractions of an em, although our page holds the actual glue.
- 378 review rows and 13 violations for letter-spaced lines.

**Fundamental alternative.**
- Fit is monotone in size and tracking, so solve it exactly: bisection, or total-fit over the paragraph.
- Kinsoku from UAX 14 alone: CL, CP, NS, EX and IS for line starts, OP for line ends, strict mode CJ→NS for ja and zh. The
  rules keep only genuine preferences of the target language.
- Glue widths read from our page.

**Cost.** M. **Status.** Partial: the jstretch investigation is under way.

## 11. Gates measured against the last build, with known rows and rulings

**Where.**
- `lab/pdf/records/layer-gate.md`: a table titled "held to the run before, not yet at 0".
- `lab/pdf/rulings/` holds 17 rulings; `2026-10-22-route-base-page.json` itself says "the gate's 0-worse-than-the-merge-base
  rule is a safety net".
- `route/route-pr.md`: layer-fonts 33/40 ("the same known rows 3 and 4"), states 399/400.
- The sweep's checks use their own font regexes, columns and line reading (`residuals/attributes-report.md`).

**Fundamental alternative.**
- Every measure is an absolute invariant against the original page, with target 0.
- Each non-zero row is typed by its root cause and owned by an issue.
- The checker reads the engine's file instead of deriving attributes again.
- No merge-base comparison; rulings only for questions of taste.

**Cost.** M. **Status.** Open.

## 12. The reader host, beyond the delta

- **Two documents**: in progress (the delta).
- **PAGE_MS** = 30 s (`view/layer-side.mjs:43`) decides when a page shows the original. It fires on heavy pages that are only
  downloading (`residuals/p8-stall-report.md` §5, D). Make it progress-based, as STALL_MS already is for ranges.
- **Columns guessed again**: `view/highlight.mjs:34` (LONG 0.25, COLUMN_LINES 4, EDGE_LINES 3, EDGE_SHARE 0.05). The marks
  file holds TeX's column points (stream.mjs `bs`/`be`, MARK_NAME `c1`/`c2`); read those.
- **Borrowed pages**: before laying, the right pane borrows the left's document (`view/places.mjs`). With the delta,
  unreplaced pages are the same bytes, so this comes free.
- **MT gate**: per isolate, polling every 50 ms (`worker/src/mt/gate.ts:34`). The Durable Object queue planned as B7 would
  wake waiters instead.

**Cost.** S each. **Status.** The delta and p8b are in progress; the rest are open.

## 13. The title stamp, matched twice

**Where.** `view/reader-view.mjs:26` ARXIV_STAMP and web `web/src/reader/controller.ts:79` STAMP are different patterns.
The extension still takes the PDF's Info Title first (`reader-view.mjs:433`).

**Fundamental alternative.** arXiv's metadata (the relay, or the abstract page) is authoritative in both hosts. The PDF's
title is used only when the metadata has none, and no regex is needed. Our base carries no stamp anyway.

**Cost.** S. **Status.** Open in the engine; the web already does this.

## 14. Hand-bumped versions

**Where.**
- PIPELINE (`pipeline/versions.mjs`), LAYOUT and LAYOUT_SCHEMA (`layout/file.mjs:43,47`), REMOVAL (`layout/addon-manifest.mjs:25`),
  BUNDLE5 (`layer-proto/format.mjs:45`).
- MARKS_SCHEMA, PROBE_SCHEMA, TRANSLATE_VERSION, RULES_VERSION (`src/core/rules/latexml.ts:14`), the layout-rules version, the
  box image version, and the web's GEOMETRY_SCHEMA.
- versions.mjs records collisions: "two branches each raised it twice, and their 3s and 4s are other pipelines".

**Fundamental alternative.** Derive each identity at build time from the digest of the module graph that produces the
artefact, plus its schema. Then a behaviour change can never go unkeyed or collide. Schema checks stay structural.

**Trade-off.** Refactors cause more re-prepares, which is acceptable while there are no users.

**Cost.** M. **Status.** Open.

## 15. The parked compiled-translation path, tangled with the live one

**Where.**
- `pipeline/live.mjs` (1,259 lines) imports typeset/*, scripts, kept, groups and cache, yet still exports six live helpers
  that `layout/paper.mjs:25` imports: `DRAFT_OPTION`, `listsMissing`, `notFound`, `originalFiles`, `probeFiles`, `ranThrough`.
- latex-front.mjs carries compiled-path TeX: FIT_DEF `:1980`, BALANCE_DEF `:1978`, NO_OVERFLOW `:1943`, XETEX_SHIM `:2153`.
- Web: `worker/src/jobs/translation-compiled.ts`, `container/src/run/job.ts`, `container/src/run/geometry.ts` (392 lines),
  the translation half of `worker/src/wake.ts`, and the typesetting and geometry entries in the run versions.

**Fundamental alternative.** Move the six live helpers to `layout/` and delete the parked path; git keeps it.

**Cost.** S–M. **Status.** Deferred to the debt pass (#299).

## 16. HTML extension: one site's selectors are the model

**Where.**
- `src/core/rules/latexml.ts`: `:53` UNIT_RULES, `:144` SKIP_RULES, `:196` PROTECT_RULES, `:392` FIGURE_SELECTORS (42
  selectors in all).
- The renderer's layout knowledge lives in SIDE_LAYOUT selector lists.
- `src/core/sentences/index.ts:46-58`: English abbreviation lists (ABBR, NUMBERED_PART, MONTH) serve both paths whenever the
  engine gives no `sentLen`.
- The same paper is segmented twice, once for HTML and once for the PDF, so its translations are not shared.

**Fundamental alternative.**
- An adapter of roles: unit, protected, table, figure, note.
- A default adapter from HTML semantics: block formatting context by computed display, `translate="no"`, MathML, `code`,
  `pre`, `figure`/`figcaption`, `table`. LaTeXML's rules become overrides only.
- The renderer reads roles, not selectors.
- Rows are shared by normalised-text identity.

**Cost.** M. **Status.** Open (the v2 plan).

## Not verified in this audit (measure before building)

- Whether LaTeX's generic command hooks are safe for marks: the `after` hook on commands that end in a look-ahead, and
  whether the `before` hook runs after the arguments are read (1(b)).
- PDF.js render cost with one optional-content group per unit (5).
- Marks through dvips with pdfmark `/DEST`, and how closely dvips and ps2pdf on our tree reproduce arXiv's latex PDFs (3).
- The cost of C's extra final pass on staging under load (1(a)).
- Whether Microsoft's free endpoint honours `includeAlignment` and `includeSentenceLength` (8).
