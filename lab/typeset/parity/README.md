# Display ≥ today: the parity check

The display part of the refactor's cut-over gate. The maintainer's base threshold: v2's display is equal to or better than
the production site's. So every page of a set of corpus papers is drawn three ways at one scale, side by side: arXiv's
page, today's translated page (the v1 path, what the production site shows) and v2's (the reader package drawing
`layPage`'s Page), with the same translated rows on both sides, so that every difference comes from layout and drawing,
never from the translator. **The verdict is per page: v2 is never worse than today.** Each measure is a distance from
arXiv's page itself (the original's anchoring, alignment, separation, size, style, spacing, room, ink and links), taken for
today's side and for v2's; where the two differ by more than the measure's noise floor, the difference passes only when v2
is the nearer. A unit today shows translated that v2 leaves English is a translation missing and fails whatever its
nearness.

It exists because the maintainer found on staging what the numeric gates never showed (a lighter text weight, a title
anchored at its last line, centred lines set left, bold and italic spreading, an over-stretched line, missing links, a
broken highlight, a cell across a column rule, a wide gap after a run-in head). On its own sheet he then found what it
never flagged (2026-11-08: symbols and formulas wrong or lost, text drawn over ink that stayed, an original not erased
cleanly, a line past its column, figure-text and caption weight, a table's cells translated one by one), because some
measures judged v2 against v2's own facts: since then every measure reads the original off arXiv's page (its pixels, its
glyphs as PDF.js's text content gives them, their PDF fonts) and the original's own facts (TeX's grid, TeX's points as
today's prepare dump states them), never off v2's part where the two can differ (`fidelity.mjs`).

```
node lab/typeset/parity/run.mjs [--work=<dir>] [--out=<dir>] [--pages=<n>,…] [--toggles=on] [--fresh=off] [<pair>…]
```

`--toggles=on` lays and draws both readers with every switch of "What to translate" on (figure and table text, headers and
footers, references, the author block: docs/PDF-READER.md §15; today's `openLayer` `classes`, v2's `typesetLay` `classes` and
the reader's prefs), its sheet and work in `parity/toggles-on/`: what a reader turns on is judged too (the maintainer's
staging review, 2026-11-08: today translates the references with the switch on, v2 left them English on 2010.11929). The
default run judges the defaults (references and the author block the original's). A pair's v2 file names the toggles it was
laid under, and the drawing refuses one laid under others.

Defaults: the sheet and `parity.json` in `$AXT_LAB_DATA/refactor-2026-11/parity/`, the work files in its `work/`. Exit 1
when a page is worse than today's, or when the run is not judged whole: the gate passes only over every page the run asked
(see "The run judged whole"). The three steps can be run alone (heavy ones through `heavy-slot.sh`):

| Step | Command | What it does |
|---|---|---|
| v2's lay | `heavy-slot.sh test -- node lab/typeset/parity/v2.mjs --out=<work>/v2 <pair>…` | each page laid by the reader's own lay (`packages/reader/src/compose/typeset.ts` `typesetLay`: `layPage` under the rules, toggles and options the reader passes, nothing more) over the paper's part and the pair's door rows, the layered metrics and the served hyphenation patterns, driven page by page as `lab/typeset/checkpoint/laid.mjs --entry` drives the checkpoint's (gate-l1.ts; `hook.mjs` puts the reader's lay in place of gate-l1's own entry call) |
| the drawing | `heavy-slot.sh e2e -- node lab/typeset/parity/render.mjs --work=<work> --out=<out> [--pages=<n>,…] <pair>…` | arXiv's page (PDF.js) and its glyphs' runs (its text content: each run's box, baseline, size and PDF font), today's (`today/entry.mjs`) and v2's (`v2page/main.ts`) drawn in one Chromium at PDF.js's scale 1, device scale 2; each side shot whole, with its translated text alone (its figure texts with it) and without its text (its copy, the original's ink it keeps, its crops); what each drew read back (`measure-dom.mjs`: each crop with its piece and its source on A) and its pixels read (`analyse.mjs` with `pixels.mjs`); the run's manifest `<work>/raw/run.json` |
| the fresh rows' fill (its own step, never a gate's) | `heavy-slot.sh test -- node lab/typeset/parity/v2.mjs --fresh=fill --out=<scratch> <pair>…` | the replies the cache lacks asked of Microsoft's keyless endpoint through the translate package's adapter, one request at a time, each recorded in `$AXT_LAB_DATA/refactor-2026-11/parity/fresh-rows/` (`AXT_PARITY_FRESH_ROWS`) under the chain's key; no page laid (below, "Fresh rows") |
| the verdict | `AXT_L1_BUNDLES=<the bundles v2.mjs laid> node lab/typeset/parity/measure.mjs --work=<work> --out=<out> [<pair>…]` | the measures below (`verdict.mjs`, `fidelity.mjs`) over the run's own drawing, `parity.json` and `index.html`; it reads the part's joins and page numbers from the bundles, so it is told the same ones v2.mjs laid |

On the maintainer's machine (shared with other lanes' jobs, 2026-11-08) the 22 pairs took 15 s to lay and 954 s to draw
(344 pages, about 3 s a page), the verdict 10 s. The images are WebP at 1.33 px a point (about 100 KB a pane, 160 MB in
all); the drawing stops when the volume of `--work` or of `--out` has under 12 GiB free (`statfs`, on any platform), and the
pairs it did not draw make the run incomplete.

## The bundles a page was laid over (the guard, 2026-11-11)

A v2 file names the bundles it was laid over (`bundle`: the SHA-256 of the paper's head.json and the folder; the head names the
paper and every part and unit chunk by its own content digest, so two folders' heads are one digest only where they hold the same
bundle). render.mjs and measure.mjs compare it with the bundles they serve (AXT_L1_BUNDLES) before anything is drawn or measured
and stop, naming both, where they differ (inputs.mjs bundleCheck): drawn against another bundle's composed document, the reader
unwraps every member whose wrap group that document does not hold, half a page shown as the original's (2026-11-11, a
toggles-on drawing run without the bundles named), and a re-measure over the default bundles read 63 pages worse. A file of
before the guard names none: it is drawn and measured with a warning in the log and in parity.json (`warnings`), so old sheets
can still be re-measured. The field changes every v2 file's bytes: the flag-off byte identity with the sheets drawn before it
ends here; from it on, two lays of the same inputs are byte-identical, and a file equals its predecessor's but for the field.

The variable itself is read one way (packages/typeset/tests/replay/bundles.ts): unset, the default (`lanes/L7`); set, it must
name a bundles folder (one holding a paper's head.json) and hold a head of every pair the tool is asked, else the tool stops
naming the value, never laying, drawing or measuring over the default instead (a clobbered shell variable did so twice). Each
tool (run.mjs, v2.mjs, render.mjs, measure.mjs, gate-l1.mjs, entry-reader.mjs) prints one line of the folder it serves,
`bundles: <path> (default)` or `(from AXT_L1_BUNDLES)`, so a gate's log names them. gate-l1.mjs run over the tap's every ledger
(no pair named) names the pairs a set folder lacks and stops each, as before.

## The run judged whole

render.mjs writes the run's manifest before it draws anything (`<work>/raw/run.json`: its id, the pairs and pages asked, not
done), the pairs it cannot draw and why as it finds them, and `done` at the end (with the reason it stopped, if it did); each
pair's raw file names the run and the digest of the v2.mjs file it drew from, and the pages it was to draw. measure.mjs
measures the manifest's pairs alone, each from this run's raw file and the v2.mjs file it was drawn from (a raw file of an
earlier run, or one whose v2 pages were laid again since, is never measured), and the pairs it is told (run.mjs and the
release check tell them) must be the manifest's. The gate fails, whatever the pages measured, where: there is no manifest or
the drawing did not finish; an asked pair was not drawn (no inputs, the disk) or has no raw file of this run; a page it was
to draw is not there; a page failed (a screenshot, today's lay, either side not drawn); or no page at all was measured. The
first pair the maintainer reads, 2303.11366v4, is not asked (`FIRST` beside `PAIRS`): the sheet names it, not the gate.

## Inputs (lab-data, never committed: licensed papers)

- **The pairs** (`pairs.mjs`): 1706.03762v7-zh and 1810.04805v2-zh, then twenty papers of `lanes/L1-papers87.tsv` chosen
  so that two columns, tables, theorem and proof, figures, footnotes, CJK targets (zh, ja) and a Latin one (de) are all
  drawn (the file lists what each brings). 2303.11366v4, the maintainer's title on staging, is asked first and has no
  inputs in lab-data (no compile, bundle or rows): the sheet names it missing, nothing stands in for it.
- **Today's side**: today's engine at `065c1d973` (`AXT_TODAY`, the worktree `refactor-read`), the website's tree of the
  same release (`AXT_WEB`, else the tree the face tables are in: its `web/src/layer/faces.ts` and static index), the
  release's server-made bundle of the paper (the release sweep's cache, `AXT_SWEEP_CACHE`: catalog, head, unit chunks,
  parts, the delta), arXiv's PDF (`lanes/L1-papers87.tsv`). Drawn as the reading view draws a laid page
  (`view/layer-side.mjs` `drawingOf`): the door's copy (render A, the drawn units' groups hidden, its crops and pastes), its
  SVG, its links, under `view/engine.css` and the text-rendering decision, its faces the web's face sources; a page the
  layer draws nothing of its own on is arXiv's (`shownOriginal`). Two choices are the baseline's, not the product's
  (`baseline/NOTES.md` §4): no 16 ms live-fills clock, and the run kept with `records`.
- **v2's side**: the paper's L1 bundle (`AXT_L1_BUNDLES`, default `lanes/L7/prepare/bundles`; the release check passes its
  own prepare's), the tap's ledgers and metrics (`baseline/tap/`), the served faces (`AXT_FACE_TABLES`, `AXT_FACE_SLICES`).
  The reader is opened with no engine of the host's, so that it composes and draws with its own served faces and sheet as
  the website's reader does; the one seam replaced is the lay (`compose/typeset.ts`'s `typesetLay` returns the Page v2.mjs
  laid in Node through that same `typesetLay`; a Page whose faces are not loaded is answered with `wait.faces`, so the
  composer loads them and lays again). What the reader passes to `layPage` the parity passes: no option the reader does not
  give (the theorem heads' and the paper's own names, `EntryOptions`, are passed only once the reader passes them).
  The page's left margin in the pane is fixed (`v2page/index.html`): centred, an A4 page stands at a fraction of a pixel
  and the compositor resamples it, which is the screenshot's, not the drawing's.
- **The page boxes**: every side's page stands in a box of whole CSS px, its canvas that box at the device ratio, drawn at the
  page's exact scale from its top-left corner (PDF.js's page view: the box floored, the canvas cut): arXiv's page and
  today's copy as `today/entry.mjs` draws them (today's place is PDF.js's page box, its copy `round(box × ratio)`), v2's page
  view and crops as the reader draws them. A canvas shown in a box of a fraction of a CSS px (the page's own 793.7 px of an
  A4 page) is resampled by the compositor to the whole px it snaps the box to: before 2026-11-08 arXiv's page and today's
  were drawn so, 1587 device px shown in 1588 (+0.063 % across, +0.045 % down), which put every rule of a page's lower right
  a device px off v2's (the first run's `pixels`, triage-1 P1).
- **The rows**: the pair's door rows (`packages/typeset/tests/replay/rows.ts`: the release's stored rows), taken whole by
  today's door and handed to the entry as its Rows (gate-l1.ts `outOfDoor`): the same translation of every unit on both
  sides. v2's side reads each as the translate package's chain reads a reply (`rows.mjs` readAsChain: a group the reply did
  not bring back placed where the translation states it, `packages/translate/src/groups.ts`), as the reader is given its
  rows; today's side draws today's reading of the same reply. A unit whose kept runs v2's part holds as elements where today's held them otherwise (its addresses, today's text; an
  ink unit's scripts TeX set in a text face, today's text or text and a placeholder: joined by its glyphs, below) is handed
  today's row said in v2's unit (`l1.ts` `keptRow`): the same text, each element where the translator kept what today's held
  for it, in their order and at one way of placing them alone, the groups today's unit had round them gone, the sentences
  counted in v2's projection; where the row cannot be said so exactly, none (the unit stays the original's, and `shown`
  counts it). Both lay under the default toggles
  (references and the author block the original's). Where no stored row serves v2's unit, v2's side is laid with a fresh row,
  the one a reader gets ("Fresh rows" below), and the sheet says so on every unit it touches.
- **The original**: arXiv's PDF (its Info `/Author`, arXiv's metadata; its `cite.*` destinations, hyperref's: read by PDF.js in
  measure.mjs), arXiv's page (its pixels, its vertical rules read off them, its link annotations), the part's members
  (their lines on A, TeX's alignment, font state, labels and measure; `dir` for a turned text), else today's prepare dump
  (`baseline/prepare/<paper>.prepare.json`).

What each side drew is read back from the browser, never from the layout's numbers: each character's advance box where the
browser placed it, through its `<text>`'s own transform (a turned text is one line of its own, measured by its box alone; a
level character across on its baseline, where an oblique run's skew moves nothing: a line's width is its advances', as TeX's
and the lay's are and as the part states the original's, a slanted glyph's lean its own overhang), in the face weight, style
and size it was drawn in (computed style), drawn or a crop's transparent stand-in; a line's size is the size it was set at,
read as the original's is: its largest letter's (any script's: faked small capitals set the capitals at it and the rest
smaller, a CJK character is a letter at its line's size), else its median character's; a line's extent takes in the crops
standing on it, and a smaller run raised or lowered off a line (a footnote mark) is part of it, in that line's column of the
paper's frame (a line of the other column on about the same baseline is a line of its own, whatever its size). These
readings are taken in the browser as the page is drawn (`measure-dom.mjs`), and a raw file keeps each line's aggregates
alone: no change to them can be re-applied to old raw files by `measure.mjs`; a change to a drawn line's reading means the
pages are drawn again (lane el-facts, 2026-11-11: B6's sheet under the new readings is that lane's redraw, 46 worse by
default and 56 every toggle on, not a re-measure).
A unit is joined across the sides by today's ord (`join.mjs`, written by v2.mjs): every member of the entry's Pages, laid or
not, joined to today's unit by its unit's id and its rank among the part's members of that id (the baseline's rule), never by
what gate-l1's runner adapted (its stops record no join, so a member the entry lays and the runner stops, an element that
ends or opens a line, was read as no member joined). A member's unit id is its text, but an ink unit's whose text the part
names as the source unit it echoes (a contents line its heading's, a note set as its source footnote, an author block's names:
`bundle.ts` placedOf): the ink unit's own, the format's `unitId` over its kind and the echoed content, today's id of that ink
unit. A member no id joins whose unit holds as elements kept runs today's prepare held otherwise — its e-mail or web addresses
(`\url{…}`, kept as A's ink), today's text; an ink unit's scripts TeX set in a text face (`$…$`), today's text or text and a
placeholder —, so that the two contents and ids differ, is then joined to today's unit of the same glyphs: the one no member
joined whose pieces read as the member's unit's, each element as today's placeholder of its source or as atoms whose characters
are its own, set on the same lines of A (as many, each on its page at the same baseline), whatever kind each reading gave them
(`l1.ts` `keptJoin`, over today's prepare dump; gate-l1.ts joins by it too). A member neither joins is joined, last, to the unit
of today's that stage 1a states its unit holds whole (`join.mjs` `heldJoin`: the candidate's prepare dump, `AXT_L1_DUMPS`,
default the `prepare` folder beside the bundles; the statement's causes held whole (f), by the author block (b′) and by the
block's units on its line (f′), a source unit written as the holder with a group of it an element kept for its pitch (k by
group, PDF-READER §18.22), one written as the holder writes today's TeX, its escaped characters text and the groups that
carry nothing their content ((o), §18.30-18.33), and an ink unit a source unit holds read as arXiv prints it ((l′)), each naming
the holder; the causes are stage 1a's own table, `lab/pdf/prepare-back/stated.mjs` HOLDER_JOIN, which declares each cause a
statement names a holder by as held whole or an element of the holder, and a run refuses a statement whose cause it does not
declare): an ink unit whose
kind moved, its id with it (rebuild/author-toggle's AND, today's inkorphan, v2's inknames), a unit whose content moved with a
group (1810.04805v2's `{\tt [CLS]}`) or with its characters (1810.04805v2's `\%`), one of today's for one member, several of one
id by their order. The lay is given today's row of it where the two units' contents are one (gate-l1's `held`), so that with
every toggle on it is drawn translated as today's was, not the original's for want of a row under its new id (the
coordinator's ruling of 2026-11-10); v2.mjs's file counts them (`held`: joined, given today's row).

## The measures: each a distance from the original, and when v2 is nearer

| Measure | Distance from the original (each side's) | Same within (the noise floor) | Why this floor |
|---|---|---|---|
| `shown` | a unit today lays on the page that v2 leaves the original's (its state named: unproven, none, unfit, …; or no member of v2's part joined to it), but one today draws in its source's own words, letters and digits, case aside (the state `groups` reads a drawn cell in: an address alone, a reply that came back as it went), whose original's ink v2 shows: no translation is missing, the unit named apart (`measures.echoed`); and, per unit both translate, its label (a name word TeX set on its first line: "Proposition 1", "Fig. 2") that today draws in the target and v2 keeps as the original's ink or draws in the original's words (reason `label`): read from the drawn text: a side draws the label anew where its first line opens with a word and the label's number (the part's `num`, the punctuation about it aside), wherever the line stands (a centred head relabelled starts past the name's end as often as not), in the target where that word is not the name word, and keeps it where the line opens otherwise (the unit's text alone) or with a crop's stand-in; a label that states no number is read by its place, kept where the line's ink starts at the name's end or after it | none: always worse; but a member of the author block's (its kind the names class: author, affiliation, inknames) under the default toggles, which the names toggle, off, keeps the original's whole whatever today translated of it, the ruling's (the owner's rulings of 2026-10-25 and 2026-11-09, PDF-READER §19.13) | a reader sees English where production shows the translation; no nearness can stand for a missing translation, and a kept English label is never nearer (v2 relabelling a label today keeps is no fault) |
| `weight` | the translated text's mean darkness (1 − luminance over its glyph pixels, darkness ≥ 0.1; each side shot with its copy, crops and links hidden; the page's body text read outside the figure texts' drawn boxes) against the original text's (arXiv's page over the original lines of the units laid); and each class of the figure texts, the captions and the cells both sides draw, its darkness against the same texts' on arXiv's page (a figure text set bold drawn regular is lighter: 2608.04322 p8, 2610.21313 p4) | 5 % of the original's darkness; 3,000 glyph pixels a side at least on the page, 500 for a class | the same faces at the same size give the same mean: measured on the first run, v2 against today on one page p5 −1.3 %, p95 +1.7 % (today's own pages of one paper, other text, p95 4.3 %); a face a weight lighter, a lighter fill or another antialiasing moves it by more; a class's mean over 500 pixels spreads by under a third of the floor |
| `anchor` | the smaller of the first line's baseline offset and its em top's offset (baseline + 0.8 size) from the original's first line, where the unit starts on the page; a section heading a side sets in fewer lines than the original's (the part's heading, not its title nor front matter, `Placed.title`/`front`, wholly on the page, its label not kept as the original's ink) stands on the original's last lines (X.lastLines, the owner's ruling of 2026-10-19): its last line's baseline off the original's last | a tenth of the size, 1 pt at least | a point is a visible step at reading size (1.33 CSS px at 100 %) and above what drawing the same line twice moves (0.01 pt); a unit anchored at its last line is a whole line pitch off |
| `align` | TeX's alignment (the part's `align`), a drawn line read by its ink as the original's glyphs are: centred, a line's midpoint off the original lines' (a first line's with its label, drawn anew or kept); left or justified, a first line's start off the original's (or its label's), every other line's off the nearest original line start (its column, a float's margin, after a display; a CJK opening mark's blank half allowed where the mark opens the line); right, a line's end. A line's ink: its drawn characters' boxes, but a CJK closing mark's that ends its text the first half of its em and an opening mark's that starts it the second (the blank half a reader sees as space: a centred cell's line ending with U+FF09 stands on the original's middle by its ink, 2608.25210 p13), then the crops and the raised marks standing on the line, whose edges are their own (a mark before a crop or under a footnote mark is no line's edge: 2610.20484 p10, 2608.25210 p13 t320). A line of TeX's several members share whole and TeX set centred or flush right (the typesetter's own `rowLinesOf` over the part's flows, the lay's facts: the lay sets it as one run) is judged by the line, its members' own alignment not at all: the run's midpoint (its members' drawn lines on the row, by their ink, from the first's start to the last's end; a member a side leaves the original's where TeX set it) off TeX's line's middle, or its end off the line's end; its separations are `gap`'s (the coordinator's ruling of 2026-11-09: TeX placed the whole line, so a member's place follows from the run, and judged by its own original's middle each name of a line laid as one run was off by however much the others' translations are shorter, the per-member centring that left the holes the nearer, 2610.21106 p1) | as `anchor` | as `anchor` |
| `gap` | a run-in the part states (a follower it joins to the member before it in its flow, `Placed.join`: a run-in head and its paragraph on the head's last line; the member a bound name leads), the follower's start after the head's end off the original's separation; two units set on one line otherwise (authors' addresses in columns of their own, cells, figure texts) are judged by `anchor` and `align`, each where TeX set it; a head v2 lays with no line of its own (a name set as its follower's lead) is in its follower's line, no separation to read on v2's side | as `anchor` | as `anchor` |
| `cross` | the lines of a unit, each by its ink as `align` reads it (a CJK mark's blank half at its edge none of it: 2608.06701 p1 t351, a figure text set by its ink, its opening U+201C's blank half before a box's rule its ink stands past), across a vertical rule of arXiv's page (a dark run 12 pt long, 1.5 pt wide at most, light on both sides) or over another unit's box by more than 1 pt both ways (its drawn lines where the side lays it, else its original lines); the original has none (a rule or box its own lines cross is not counted) | any: one more crossing is worse | the room between the rules and the neighbours' ink is the original's |
| `turn` | a unit TeX set turned (a figure's rotated text) drawn upright | none: always worse | the original's words, and today's, stand turned in their columns; upright they run into each other |
| `stretch` | a line's overshoot past 1 em of word space or 0.25 em of letter gap (the original's TeX spaces stay near a third of an em, its letters unspaced); a gap before a space character, or before a run the drawing places at its own x (the typesetter's glue: a lead's word, its label, the text after them), is a word space | 0.1 em | below a tenth of an em two spacings look alike |
| `style` | a unit's share of bold (weight 600 or more) and of slanted characters off the original's: the share of its characters arXiv's page sets in a bold and in a slanted face (the glyphs' runs in the unit's lines, their PDF fonts by the engine's `classifyFont`, math fonts aside; a drawing of before the runs, the part's font state); the figure texts and the names both sides draw judged too (today's own groups joined to v2's members by their drawn boxes). A label a side draws anew (a word and the label's number, its punctuation with them, at its first line's opening) is no character of its share, as the original's lines begin after the label's ink: a relabelled head's bold label is no bold text (each drawn character's face, measure-dom's `st`) | 15 % of its characters, 3 characters at least | a translator's reordering moves a styled word by a few characters; spreading is a whole phrase or unit |
| `pixels` | device pixels off arXiv's page outside every unit's box (its original lines and its label's ink, where a label drawn anew stands, either side's drawn lines, figure texts, names and crops, padded 1 pt; `analyse.mjs` boxesOf), luminance by 0.25 or more where no pixel within one device pixel matches (ink, not a sub-pixel phase) | 150 device pixels | about one glyph of 10 pt type at 2.67 pixels a point: an erased or a stray piece of ink |
| `figures` | the figure texts drawn translated (each side's drawn groups: today's `g[data-f]`, v2's `g[data-axt-ord]` of the part's figure members, a character drawn): fewer than today's | none: always worse | as `shown` |
| `size` | a unit's median drawn size off the original's (a share of it), each drawn line's and the original's alike the size it was set at: its largest letter's (faked small capitals set the capitals at it, the rest smaller; a script is smaller, never larger; a CJK character a letter at its line's size), else its median character's (read the median, a CJK line holding a paper's macro in faked small capitals read their size, 2608.06701v1 p4 t59 on el-facts' tree); the figure texts and the names both sides draw judged too (joined by their drawn boxes: 2610.21880 p5's REFERENCES, set by IEEE's faked small capitals); a size tie of v2's (the part's `ties`, rule `size`: the owner's ruling that one paragraph's text is even, so v2 lays a run-in head with its paragraph, or a paragraph a display splits, at one scale) judged as one paragraph: its size its smallest member's share, against today's smallest over the same members (today lays them one by one), so a tie at today's smallest is equal and a tie under it worse. A body grown over the original's is judged as any other size (the owner's ruling 2, below) | half of the fit's step (0.025 of the size, `data/rules/scripts.ts`) | a size is drawn exactly (its computed style), so one step is a difference a reader sees; the floor of two steps before 2026-11-08 hid a body grown two steps where today kept the original's (2610.10069 p5) |
| `links` | the links a reader can follow missing against the original's link annotations: the anchors each side drew (the overlay's; on a page shown as arXiv's, its page view's annotation layer, today's by `shownOriginal`'s rule the original's), counted per target per drawn line (`linksOf`): TeX writes an annotation a line for a link it breaks over lines, the foot of a column and the head of the next included, one right after the other, so A's annotations of one target one right after the other are one link (also a page a side shows as arXiv's, its annotation layer's); a side, which may set that link on one line under one anchor (2610.22065 p7 t126, its s41928-018-0092-2 broken across the columns), counts one target's anchors on one line, or on lines one under the other where no line of theirs fits between, as one link (lenient: a target cited twice with no link between counts once on A, on lines one under the other once on a side; a side's count above A's is no link missing); the layouts' own counts kept beside; a drawing of before the boxes were read, its anchors | half a link: any | every link of the original is one a reader follows |
| `borders` | the links drawn with a border missing against the original's link annotations PDF.js draws a border round (a width above 0 and a colour, as its annotation layer draws one): the anchors each side drew with one (the overlay's that its link states a border for; on a page shown as arXiv's, its annotation layer's sections drawn with a border width, today's by `shownOriginal`'s rule the original's); a drawing of before they were read judges none | half a link: any | a moved link keeps its own annotation's border (the owner on staging, 2026-11-08: the translated pane's citations and references drew none) |
| `highlight` | (a crop stands on one drawn line, the one of its unit whose band holds most of its height: a formula dipping into the next line's band, or a raised script reaching into the line above, widens its own line alone; the full-width colon and question mark are closing marks, set in the em's first half by the SC faces) the highlight is a feature of today's for the units today highlights, and elsewhere v2 is judged only on not drawing a wrong one. (1) A unit both sides draw that today highlights (today's laid words' spans): each side's sentence boxes judged by the lines they leave uncovered, its drawn lines on the right and its original's lines on arXiv's page on the left (covering as below): v2 worse where it leaves more of them than today does, nearer where fewer (today's own misses are not held against v2; a unit v2 lays no boxes for leaves them all). The highlight is judged as the reader sees it (the coordinator's ruling, 2026-11-08): ink is ink, so a drawn line is its ink (a CJK opening mark's blank first half and a closing mark's blank second half, the full stop's, the comma's, a closing bracket's, are none of it: a box that stops at the mark's ink covers the line); and each side's boxes are what its reader paints: today's its own shapes' (`today/entry.mjs` litBoxes, read once every page is drawn: the reading view's `createShapes`/`layerShapes` over the parts, every page's left part and laid words, and its rows' sentences; every sentence's rectangles where it lights by sentence, `view/lighting.mjs` startsOf, else its runs' blocks; padded 3 CSS px beside as `lighting.mjs` paints them), v2's `Laid.lit` and its kept ink's boxes padded as `packages/reader` `compose/highlight.ts` paints them, 3 CSS px beside (2.25 pt at the parity's scale) and half the page's leading above and below. Why: the boxes the layouts state are not what is shown; judged bare, v2's boxes, which stop at a closing mark's ink and at the line's band, missed lines its painted highlight covers, and today's, a run's whole block, covered lines its own sentences do not (the parity of 9 pairs, 2026-11-08: 129 pages worse with today's blocks, 78 with both bare). (2) A unit both sides draw that today does not highlight, and a figure text both translate (today's own group, `g[data-f]`, joined to v2's figure member by the original's box: the group's drawn box to today's prepare unit, that unit's box to the part's, each a mutual best overlap), which today never highlights: v2 without boxes is equal, v2's boxes covering it better, boxes that miss it worse. (3) A unit only v2 translates (today left it English): no boxes or covering ones pass, boxes that miss it worse. Covering: its boxes (with its kept ink's, `own`, as the reader lights them; a turned member's from its run's frame, Laid.lit's `dir`, the page's box each stands in, before the paint) over each of its drawn lines on the right (the line's box, baseline − 0.2 to + 0.8 of its size; a turned line's the same band turned with it, never the browser's box across its characters, its first face's ascent and descent rounded to the pixel) and each of its original's lines on arXiv's page on the left (the part's line boxes), every edge within a point. (4) What a shape fills that is no ink of its unit's text, apart from what it covers: each shape as its reader paints it as the pointer lights it (a sentence, or a unit lit whole), over another block, a display (the part's El of kind `display` on the page, its own unit's too: the original's ink, kept, the same on both panes and in both drawings) and on arXiv's page another unit's line (as drawn the neighbours each drawing sets differ, and a pad over a small one, a figure's tick label, is no fill), counted where the shape holds the block's middle, or bridges its row: a room its outline paints between two of its rows that stand room for a line apart (the reader's own condition, `apartRows`) stands across the block's middle, the block in the column the member spans (the reader's `columnOf`), though the room holds none of its ink (the owner's report of 2026-11-10 on 2610.17024v1 p9: a strip down the column's edge from a short row over display (43)'s row to the short row after it); v2 worse where it fills or bridges more blocks than today. Today's shapes are its rectangles (its runs, cut at a display, tile their rows: `view/lighting.mjs` paints one outline a run); v2's are `paint.mjs` `paintedEntries`: the reader's rows (`compose/highlight.ts` rowsOf) and the room its outline paints between two rows it joins (shapePath: from the upper row's left to the lower one's right), the cut read from the reader's own `apartRows`, its displays never with its member. Why: the owner's reports of 2026-11-09 (2602.23285v2 p15, one shape over display (11) across the column on both panes; 2609.33403v1, a paragraph over both of its displays), which (1) to (3) judged nearer: they judge the boxes, and the room an outline fills is in no box | any | the original's every unit has its sentences on the left; a highlight that marks the wrong place misleads where none does not |
| `line-count` | a unit's drawn lines on the page off the original's count there | half a line: any | another line count is a reflow; nearer the original's is better |
| `over` | a side's text drawn over ink that stays: the device pixels that are ink (darkness 0.5 or more) both in its translated text alone and in its drawing without its text (its copy, the original's ink it keeps, its crops), per drawn unit inside its lines' bands; the figure texts and the names each judged as the page's whole; the original's none (2608.06701 p8, 2609.36054 p13, 2610.20967 p4, 2610.21312 p2: a continuation line laid over the original's glyphs no unit owned) | 20 device px | three crossings of two strokes at reading size (a stroke of 10 pt type is 1.6–2.7 device px wide at 2.67 px a point); the antialiased edges of two inks that only touch are under the 0.5 darkness on one side |
| `frame` | a laid line past the frame it stands in, by its advances (a CJK mark's blank half aside; a slanted run's lean past its last advance is its glyph's overhang, as an italic's in the original: the coordinator's ruling of 2026-11-11), in points: its column, or the text block where its original's lines span more (the paper's paragraphs' edges, `frameOf`: where a fifth of them start or end, paired into columns, until the engine states TeX's \textwidth and \columnwidth), widened to its own original's extent; a cell's own room, its original's extent (the owner's ruling 3); the original's 0 (2610.22065 p1: today's line 16.4 pt into the gutter; 2610.20967 p4 t60) | as `anchor` | as `anchor` |
| `block` | the lines a side borrows past TeX's room (the owner's ruling 1): each drawn line under a run's last original line on the page (the original's line of its unit nearest over it whose column, TeX's measure, it meets), the part's room under that run (`Room.runs`: the depth of the next ink's baseline, a box's top, and of TeX's text block bottom; `Room.sep`: TeX's paragraph separation, `\baselineskip` and `\parskip` as the marked compile states them): a line lower than the run's last baseline less the smaller of its bottom's depth and its next ink's less the separation; a run the part states no room under is not judged, one with no separation stated by its bottom alone | 0.05 pt (`NEAR.room`): a bound, judged to the precision it and the baselines are stated at (the hundredth; the lay's own test at its foot; the stated bottom sits on the lines TeX set on it within it, 1,751 of s88's 1,987 paragraph runs ending within 3 pt of it), not a step two layouts are compared by; one more line is worse | TeX's text block bottom and its paragraph separation are where the original itself could set a line; past them a borrowed line crowds the page's foot or the next ink |
| `elements` | an element drawn otherwise than the original sets it, counted per unit: two crops of one element whose sources stand on one of its unit's original lines on A (TeX set them on one line) drawn otherwise placed to each other than on A (an overline's rule or a fraction's denominator set after it: 2610.10069 p10, p24, 2610.40645 p34, p36, 2608.06701 p8); an element drawn as text (no crop cut from its ink, its ink not kept) whose glyphs on arXiv's page stand on two baselines or at two sizes, its scripts set flat (2609.20976 p2's km s⁻¹), but a literal one (El.literal, today's `url` and `code`: a URL, a code mark, whose characters TeX sets as written: no scripts), which TeX broke over lines and both sides draw as its text by design, its two baselines its lines' (2608.16117 p34 t202, 2610.22065 p7 t126); an element v2 draws as nothing (no crop, no text, its ink not kept) where TeX set ink: today's prepare dump finds its ink on the page, or TeX's points hold ink its reading lost (2610.21312 p2's d/n = 0.191; 2608.25210 p7's algorithm). Today never draws an element as nothing (an element whose ink it does not find leaves its unit the original's: tex.mjs cropsOf), so that count is v2's alone | any: one more element drawn otherwise is worse | the original's every element is drawn as TeX set it |
| `erased` | the original's glyphs a side shows in part inside its translated units' original lines (its figure texts aside): each connected stroke of arXiv's ink there, how much of it the side's drawing without its text shows in place (its ink there or within a device pixel; the places it draws a moved crop aside, a crop moved where any edge of it stands more than that device pixel from its source's: `fidelity.mjs` `inPlace`, one bound with the comparison's. Within half a point, 2608.25210v2 p3's `[sentence_2]` crop drawn 0.43 pt right of its source read its whole "[" as shown in part): shown on 6 device px or more and on 5 % to 75 % of the stroke, a sliver an erasure or a crop's margin leaves (2610.21312 p5's dots over "det M = 1") | any: one more glyph shown in part is worse | a glyph kept is shown whole (its edge a sub-pixel phase off), one erased not at all; a neighbour's edge within a device pixel shows a few pixels of it |
| `groups` | a table's grid groups (TeX's grid as today's front end reads it, its ledger's `tables`: the header, each column, the cells spanning the same columns) with two cells or more on the page, each side's state from its drawing: a cell in the target where it is drawn and its drawn text is not its source's (letters and digits, case aside), else the original's; a group in one state is whole, else mixed. v2's state other than today's is worse (the owner's ruling 3: translated or kept by group as today decides). A group both sides draw the same (kept on both, or translated on both) is no difference. A group today's decision kept whole (its door rows `kept` with a translation of their own) reaches v2 as no rows, so v2 draws today's decision, not one of its own: recorded apart as `not exercised` (like the ruling's: never worse, never nearer), since the stored rows hold no translation of its cells to exercise v2's decision with (a run over rows holding the translator's answers for those cells would) | none | the owner's ruling |
| `labels` | over the paper's pages, each side's labels (a name word TeX set on a unit's first line, read as `shown`'s label is): a side that draws one translated and another kept or in the original's words mixes them, a fault; v2 mixing where today does not is worse on each page v2 keeps one, today mixing where v2 does not nearer; v2 relabelling a label today keeps is nearer (the owner's ruling 4) | none | the owner's ruling |
| `folio` | a page number (a running head or foot whose text holds the page's number, or a note that does on the page's first or last row: a first page's folio is read as a note): its drawn size's shrink against arXiv's glyphs' and its end off the original's end (the owner's ruling 6: its size kept, right-aligned) | half the fit's step; as `anchor` | as `size`, `anchor` |
| `lead` | a text's leading tighter than the original's while its block has room: its drawn pitch over its size (the median of its consecutive baselines' gaps under 2.5 sizes) against the original's lines', the tightening as a share of it, counted where its last drawn line stands a pitch or more over the original's last (a block it fills may be tightened to fit); the original's 0 (1810.04805 p8's "We first examine…", 2010.11929 p5) | a twentieth of it | 0.6 pt of a 12 pt pitch, a step a reader sees between neighbouring paragraphs |
| `ink` | the units both draw whose original ink is black (arXiv's page reaches luminance 0.05 or less in their lines) and whose drawn fill is not black (the owner's ruling 7: the PDF's own black) | any | the owner's ruling |
| `scripts` | the original's scripts a side draws flat or loses, in characters (`blind.mjs`): a run of arXiv's glyphs (PDF.js's runs) in a unit's lines set smaller than its line's text (under 0.85 of its size, half of it at the least: LaTeX's least size beside a text) and off its baseline (0.075 of its size or more, half of TeX's least script shift, cmsy10's sub1 of 0.15 em; within 0.6 of it, as a side's drawn script is read), touching its nucleus or another script (no wider apart than a word space at its widest, 0.5 em: TeX sets no glue between them); the line's text TeX's line, its size the part's (today's prepare dump's) and its baseline the one A's characters at that size stand on. A side carries a script where it keeps its ink in place (an element whose ink its drawing shows there, a display inside a theorem; or ink outside its own lines of the unit it never took), where a crop of the unit cut from it sets it off the baseline of the drawn line it stands on as on A (on that page or another: a translation flows its crops over a page break, 2608.16117v1 p3's "(·)′" set on page 4), or where its text draws one raised or lowered and smaller (on the page first, then over the unit's other pages, the paper's pass `scriptsPass`); a page whose lines of the unit a side does not lay keeps the original's. 2610.20967v1 p1's "Song-Ze Yu¹": the marks on the baseline at the line's size on both sides; `size`, a unit's median, and `elements`, an element's own baselines, never read them | any: one more character is worse | the original's every mark stands raised or lowered where TeX set it |
| `toggles` | a unit the toggles keep the original's drawn translated (its drawn text holds letters or digits other than its original's, in its original's order: drawn in its own words, elements cut as crops, it is no translation), its class read off the original, never off either reader's classification (`blind.mjs`): under the defaults the author block and the references (the reader's `CLASS_DEFAULTS`; every switch on keeps none, so the toggles-on run judges nothing here). An author block's unit holds an author's name where arXiv's metadata states it (the PDF's Info `/Author`, which arXiv's GenPDF writes from the submission's metadata, names "; " apart; empty on a PDF of before it stamped them: 1706.03762, 1810.04805, 1512.03385), at its first occurrence in A's text (its letters and digits, case and diacritics aside), the unit whose line holds its middle character (placed by its share of the run's advance); a reference is the unit whose line starts nearest below and right of an anchor `cite.<key>` (hyperref's `\bibitem`, an XYZ destination raised a `\baselineskip` over its entry's first line, which so stands half its size or more under it, the entry before's last line at its height: 1512.03385v1 p9; a PDF with none, 7 of the 22, names no reference). Each reader's own lines of its units place a fact, never their kinds. 2610.20967v1 p1's names, translated by both with the author toggle off (neither classed them as the author block: the class's own `\name` was in no role table), and 2608.25210v2 p17's reference [64], an ink unit both translate. Where today translates a unit a fact names and v2 keeps it, v2 is nearer, and `shown` counts no translation missing there. A place, an e-mail, a unit of a paper without either fact is not judged | none: always worse | what the toggles keep is the original's on the page |

Where both sides depart from the original alike on `scripts` or `toggles`, the page lists it apart (`both`: the original's
value, each side's and its distance), with no verdict: a defect today and v2 share, which a verdict of v2 against today cannot
see (the maintainer found these by eye, 2026-11-09). The sheet counts the pages and units of each (`bothPages`, `bothUnits`).

The highlight's granularity is judged apart from its coverage (`sentences.mjs`, under the `highlight` flag), since boxes
that cover a unit's lines tell nothing of whether they are the unit's or a sentence's (the maintainer found on staging,
2026-11-08, v2 lighting every unit whole where today pairs sentence by sentence: coverage passed it). A unit today lights by
sentence, of two sentences or more (today's `litBoxes` kept per sentence, `leftBy`/`rightBy`), is worse where v2 lights it
whole or in fewer sentences (finer is allowed: v2 also ends a sentence at a forced break), where on arXiv's page a sentence
of v2's meets most one of today's out of today's order or a sentence today lights there is met by none of v2's, or where
v2 lights nothing of it as drawn on a page today lights it (which sentences a page's translation holds is the layout's). A
unit of one sentence is lit as that sentence's shape, the unit whole, alike on both; a drawing of before the per-sentence
boxes is not judged by it (`measures.sentences.unread`).

## The maintainer's rulings (2026-11-08)

The gate judges by them where they and today's output differ.
1. **Borrowing bounded by TeX's facts** (2026-11-08, replacing the same day's "no borrowing"). A paragraph may take lines in
   the empty space under a run of its lines, before it shrinks (a page's body keeps one size), never past TeX's text block
   bottom in its column, nor bringing the next ink under it nearer than TeX's paragraph separation (`\baselineskip` and
   `\parskip` where the paragraph ends, as the marked compile states them): a line past either is a fault (`block`). Its
   size and its line count are judged against today's as any unit's (`size`, `line-count`, and their knock-ons, `anchor`,
   `gap`, the highlight's placement), but where today bought them with a line past TeX's room (a `block` fault of today's on
   the unit, or on a member of its size tie) and v2 breaks none: then v2's smaller size or fewer lines inside the room is
   nearer, not worse, and the size or line count today's fault (the coordinator's call of 2026-11-09: today's last line on
   the page number, 2608.16117v1 p23 t86). The ruling it replaced recorded v2's line-budget differences on a unit today laid
   with a borrowed line as `ruling`; a sheet measured before it may show them. A known limit: a heading states no separation
   (the marked compile's line probe, `AXT-LINES`, is not set at a heading's marks, nor at the front matter's or a caption
   measured in a box alone), so v2 never borrows for one and shrinks it to its lines where today borrows (2608.16117v1 p4
   t12); stating it is new TeX and a recompile of the corpus, not done for one case.
   Which of its sentences a page holds is no finding anywhere (the highlight's granularity, below the measures).
2. **Body growth** (corrected the same day): body text may grow as today grows it (up to about 1.1×); the effect, by a simpler
   method. A size above the original's is no fault: `size` judges it against the original's as before, v2 nearer today's
   grown size or the original's passing.
3. **Table cells**: translated or kept by group as today decides (`groups`); each cell's size as today's, each cell in its own
   room (`frame`: a cell's frame is its own original's extent).
4. **Labels**: the target word everywhere, one form within a paper; a paper mixing translated and kept labels is a fault on
   either side (`labels`).
5. **Pseudocode** kept as the original by default. Not judged yet: neither the part nor today's prepare dump states that a
   unit is pseudocode (2608.25210 p7's algorithm is a `para` in both); `elements` catches what v2 drew of it as nothing.
   Judged once a stated fact names it.
6. **Page numbers** keep their size, right-aligned (`folio`).
7. **Ink**: the PDF's own black (`ink`).
8. **A paragraph's leading spans its frames** (2026-11-09, the owner: "as you recommend", on 2610.20967v1-zh p4). Where a
   paragraph ends in one line alone at the top of a column or a page (TeX's widow: its only original line there, its other
   lines in a frame before), that line cannot rise, and the gap under it follows the paragraph's leading as v2 laid its frame
   before (and the original's skip there past its pitch): the paragraph under it starts lower by what TeX's gap lacks, its
   first line off TeX's baseline. Its `anchor` difference within that (0.1 pt the drawing's rounding) is the ruling's
   (`nearer` "the ruling's"): never worse, and no fault of v2's; one lower than that is judged as any.
9. **The references' leading** (2026-11-10, the owner: "on the references' leading, go ahead as you recommend"): a paragraph
   that borrows room spreads into it (option (i)), each frame of a paragraph keeps TeX's share of its lines where that holds
   within its page's band, and the paragraphs that borrow vote in the page's target. Two `line-count` differences are the
   ruling's (`verdict.mjs` leadRuling): (a) a paragraph over pages whose lines v2 splits as TeX's share of them on the page
   (each frame's first line at its share, nearest, ties later, as `pageCutsOf`), each side setting as many of its lines over
   the pages both drew (`sharePass`, the paper's pass: a count of fewer or more lines than today's is the fit's, judged as
   any), 1512.03385v1-zh p7 t153; (b) a paragraph that does not borrow, set at its page's band over a target the borrowing
   paragraphs moved by voting the leadings option (i) gave them, its line count on the page other than where the pair is
   laid without (i) (`v2.mjs` lays each pair first with option (i)'s line of `slots.mjs` skipped, `hook.mjs`, and records
   each pass's target and each member's line count of that lay, `before`, beside this lay's targets, `fills`, through a call
   `hook.mjs` puts in `fill-pass.ts`), 2610.20484v1-zh p8 t85.

The coordinator's ruling of 2026-11-10 (lane cjk-space): B.tokens sets no space beside a full-width mark's blank side (xeCJK's
rule, PDF-READER §18.18); where that saves a unit a line, the line it saves held a lone fragment (one character on
2610.30034v1-zh p3 t36 and on 2610.10069v1-zh p27 t227, a lone year in 2608.04322v1-zh p12's references), and the line count is
an instrument. A `line-count` difference is the ruling's (`nearer` "ruling", never worse) only where the pair laid with those
spaces put back sets today's count on the page: `v2.mjs` lays each pair first with B.tokens' mark-space line skipped (`hook.mjs`,
a lab global, its pages not kept) and records each member's line count on each page of that lay (`spaced`); `verdict.mjs`
markSpaceRuling. A count those spaces do not explain is judged as any.

The coordinator's ruling of 2026-11-10 (rebuild/mail-group), on the owner's principle that translating or keeping are both
fine and a garbled translation never: an e-mail address is a literal, never sent, and a line of addresses alone that the
candidate's prepare keeps whole (a kept block of addresses and their separators alone: the engine's `address`, the dump's
`keptBy: 'address'`, `join.mjs` candidateAddress, `v2.mjs`'s `address` by member ord) is the original's text: a `shown`
difference whose today's unit is joined to such a member, or, joined to none (the block is a unit of its own), lies with every
line on one of its lines, is the ruling's (`nearer` "ruling", never worse). No other kind is ruled so.

The coordinator's ruling of 2026-11-10 (lane url-join): a line's end inside one word TeX set as written is a join (a URL, or a
literal mark whose copy holds no white space; PDF-READER §18.20); where that sets a unit in fewer lines than today's
(1810.04805v2-zh p14 t237, two broken URLs drawn whole: 5 lines for today's 6, the original's 7), the line count is an
instrument. A `line-count` difference is the ruling's (`nearer` "ruling", never worse) only where the pair laid with those line
ends read as spaces again sets today's count on the page: `v2.mjs` lays each pair once more with each such element's text (and
its runs) as a stage 1a run without the rule read it, where the two differ by white space alone (`unjoin.mjs`; that run's
bundles `AXT_PARITY_UNJOINED`, by default round 8 B1's in lab-data, `lanes/converge-7/r8b/bundles`), and records the line count
on each page of each member that holds one (`unjoined`); `verdict.mjs` urlJoinRuling. A count those joins do not explain is
judged as any. Where no unjoined bundle stands for a paper that holds such a word over lines, the ruling is not applied, and
the log and the sheet say "url-join ruling not applied: no unjoined bundles" (v2.mjs's `notes`, the sheet's `notes`).

The owner's ruling of 2026-11-10 (option C, PDF-READER §18.22): text set wholly in a face of one pitch, read off the PDF's
glyphs (code, a prompt, JSON, an OCR card), is kept as the original's; translating or keeping are both fine, a garbled
translation never. Such a unit is the original's text, no translation missing: a `shown` difference whose v2 member the
candidate's prepare kept so, and a `figures` count fewer than today's by no more than today's groups joined (figuresMatched,
by the original's box) to v2's figure members kept so, are the ruling's (`nearer` "ruling", never worse). The members are
the ones the candidate's dump marks `keptBy: 'pitch'` (`lab/pdf/prepare-back/run.mjs`, the engine's `pitch`), joined to
their ords by the run's `located/<paper>.json` `dumpOrds` (`join.mjs` candidatePitch; `v2.mjs` writes them, `pitch`); any
other unit v2 leaves the original's is judged as before.

The coordinator's rulings of 2026-11-10 (lane literal-fixes), so that no page is ruled one by one. First, every unit the
candidate's prepare keeps by a rule's mark is the original's text, never a translation missing: the dump's `keptBy` 'pitch',
'address' or 'identifier' (an identifier, a token holding an underscore between two word characters, is never sent,
PDF-READER §18.25: a figure text kept for one), joined to member ords as above (`join.mjs` candidateKept; `v2.mjs` writes
`pitch`, `address`, `identifier`), and today's units its prepare states kept by a mark (a cell of identifiers alone, no unit
of v2's: a statement carrying `keptBy`, `join.mjs` candidateKeptToday, `v2.mjs`'s `keptToday` by today's ord). Such a unit's
`shown` difference and a `figures` count fewer by no more than such figure texts are the ruling's (`nearer` "ruling"), and a
table's grid group is judged on its other cells (`groups`). Second, a unit no row of the pair's fixed rows serves (its text
changed by a rule, an identifier now an element, so that today's stored replies cannot say it: `v2.mjs` records the members
whose rows hold none, nor keep them, `noRow`), which v2 then leaves the original's (`none`), is unmeasured: its `shown`
difference, a run-in's `gap` beside it and its cell's place in a grid group are listed as such (`nearer` "unmeasured"), never
worse; the sheet lists every page with its unmeasured units and their count, and its summary states the whole count
(`verdict.mjs` unmeasuredOf, the result's `unmeasured`).

The coordinator's ruling 1 on F0 (rebuild/fig-text, 2026-11-10) extends both rules to F0's elements, no page ruled one by one.
An element of a figure text the dump marks `keptBy` 'pitch' (its run of one pitch) or 'decoration' (a stretch a frame, an
underline or a tone holds) is the original's ink: `join.mjs` candidateKeptElements gives its segments by member, `v2.mjs`
writes them, `keptEls`, and the original's bold and slanted shares (`style`) are read without their glyphs, as the drawn
text's share leaves the element's ink uncounted (`fidelity.mjs` originalOf's `except`). And a figure text no row of the
pair's serves, left the original's (its stretch now an element, today's row having translated it: `noRow`), is unmeasured in
`figures` as in `shown`: a count fewer by no more than the texts the rulings keep and those is "unmeasured", never worse (the
measure's `unmeasured` count).

## Fresh rows: what a reader gets where no stored row serves v2's unit (lane parity-fresh, 2026-11-11)

The stored rows are today's replies to today's units; they serve v2 only where v2 cuts a unit as today did. Where it does not
(an identifier now an element, a bold run stated as a group, several of today's units joined, a unit today never had), the
sheet drew v2 as the original's there, which no reader of the site sees: the owner read it as v2 forgetting to translate, and a
real defect (arXiv's stamp sent for translation) stayed invisible. So v2.mjs lays such a member with a fresh row (`fresh.mjs`):
the translate package's own chain (`chainOf`: the wire, the read, `accept`, the groups placed, the runs floor) over Microsoft's
keyless adapter, production's default lane, through a cache in lab-data keyed by the chain's own key (`keyOf`: the translator's
identity, the target, the wire's digest), every reply recorded, accepted or refused, so that each wire is asked once ever and
every later sheet is drawn offline. Today's side keeps its stored rows. A member gets one where (the entry's rows, gate-l1.ts):
no stored row serves its unit (`no-row`); its stored row is today's row of another unit said in v2's (`unit`: gate-l1's `said`,
today's flat text of a figure text v2 holds a group in, a unit whose kept runs v2 holds as elements); or its cell's door row is
today's group decision `kept` (`group`: today's layerRows stores such a cell with no pieces, so the stored rows hold no reply of
it, and v2's own group decision runs on the fresh ones, the coordinator's ruling of 2026-11-11; a sweep keeping those pieces
would make it like-for-like). A member the prepare gives a reason (`why`) or the paper keeps is sent nothing, as the reader
sends it nothing.

`--fresh=cache` (the default) reads the cache alone: a wire it lacks is never fetched, the unit left as before (no row, or its
stored row), and the log names how many (`freshMissing`) and what a fill would ask, counted to the end of each unit (fresh.mjs
needOf: its first wire, which a fill asks whatever comes back, and up to its runs floor's stretches, which it asks only where the
reply is refused; the requests as the chain cuts them), so that the fill asks between the two counts; `--fresh=fill` fills it, slowly, and lays nothing, writing what it did beside the cache (`fills.jsonl`, one entry a run: wires
asked, requests made, refused, still missing, 429s, the pairs touched, start and end; printed at its end); `--fresh=off`
withholds every fresh row, which gives the sheet byte for byte as before this lane. v2.mjs's file records `fresh` (the
members laid with a fresh translation) with `freshCause`, `freshRefused` (the translator refused it: left as before),
`freshMissing`, and `freshNew` (sent, but today had no unit of it: nothing of today's to compare, each v2's own decision to
translate). `unmeasured` (`noRow`) then means only that neither a stored row nor a fresh one serves the unit.

On the sheet a fresh unit is tinted on v2's pane and listed on its page with v2's size and line count against the original's,
and the run lists every page with its fresh units and, apart, what v2 sends that today never had. Its measures, the
coordinator's ruling of 2026-11-11: today and v2 draw two translations there, so a measure whose two distances follow from the
length of the text drawn (`line-count`; `size`, a unit's, a size tie holding one, a figure text's or a name's; `stretch`; the
highlight's sentence granularity: `verdict.mjs` FRESH_UNJUDGED) is listed `fresh`, never worse nor nearer, and so are the size
and line count of a unit the part lays at one size with a fresh one (its size tie: a figure's set, a run-in head and its
paragraph), whose size the fit set from the fresh text's length (1706.03762v7 p13: a figure's 60 labels set at 86 % for
"<pad>" translated into a wider word); every other measure
(anchor, align, gap, cross, turn, over, frame, block, elements, erased, pixels, weight, links, borders, ink, folio, lead,
scripts, toggles, shown, labels, figures, groups, the highlight's coverage, and `style`, each side's share against the
original's own) is judged as anywhere, and each difference that touches a fresh unit is tagged (`fresh`, its words saying the
two sides drew different translations: `tagFresh`). A page worse through a judged measure of a fresh unit is v2's finding.

The owner's ruling of 2026-11-11 on the figure texts today keeps by its name/code test (today's figureUnits: mt.mjs isName or
isCode, a label of names or a markup token: "<pad>", "MedQA", "ResNet-32"), which v2 sends: "never garble" is about format,
not words; how a word is translated belongs to the translator, and no hard rule guesses from a word's shape. Such a text's
fresh row is named so (`today-kept`) and listed apart on its page ("kept by today's name/code rule, sent by v2"), as
information; a difference of its words alone (`shown`, `figures`, `groups`, `labels`, `toggles`, `style`, `weight`) is the
ruling's (`nearer` "ruling", never worse: `verdict.mjs` NAME_CODE_RULING); its geometry is judged as any fresh unit's (a longer
reply that overflows its room or collides counts).

The review mode (`--fresh=all`, the coordinator's of 2026-11-11), never mixed with the gate in one sheet: every unit v2 sends is
laid with its own fresh row, not only those no stored row serves, since a stored row is production's reply to production's
wire, and shows production's faults on v2's pane (a marker spaced inside "R&D", a style group a reply never carried). The
owner judges v2 against the original on this sheet; the gate stays the stored-row sheet, on which "pages worse" is counted.
Its fill (`--fresh=fill-all`, about 690 requests over the 22 pairs) sends only under the keyless lock every lane honours
(`refactor-2026-11/locks/ms-keyless.lock`, fresh.mjs keylessLock: an atomic mkdir, its owner the lane, the PID and the start; a
dead owner's taken and said), one request at a time, and stops at the endpoint's first 429 (a rerun resumes from the cache).
Its sheet tints nothing; FRESH_UNJUDGED are unjudged for every unit; its worse count is information. Each page lists the units
off the original's size by more than the measure's floor, smaller or larger, or taking more lines than the original, the
farthest size first (verdict.mjs offOriginalOf; a unit that only takes fewer lines is what a CJK translation does and is not
listed: the coordinator's ruling of 2026-11-11), the totals at the top, and, given the gate sheet
at the same head (`measure.mjs --gate=<its parity.json>`), the units whose fresh text changed a judged measure (judgedChanged:
a unit's judged differences on the two sheets, the measures it does not judge aside), with the text each side drew.

Beside the verdict each side's faults against absolute bounds are measured (and for the measures above each side's own
count: text over ink, lines past the frame or the block, elements drawn otherwise, glyphs shown in part, groups mixed, a
paper's labels mixed, a page number off, ink not black) (a first line off both ways by 0.25 of the
size, a line off its alignment by 0.25 of the size, a crossing, a follower past its separation by half the size, an
over-stretched line, 150 pixels off arXiv's page): the sheet shows them, and a fault both sides share is no verdict of this
gate. All floors and bounds were set before the first run from what a reader sees, and none is moved to let a page pass.

## Output

- `index.html`: the summary by measure (pages v2 makes worse, differences, pages where v2 is nearer, each side's faults),
  the pairs not drawn and why, then every page, the worse ones first (1706.03762v7 p10 at the top: the maintainer's Table
  4 and acknowledgement): each difference with the original's value, today's and v2's with their distance from it ("off")
  and which is nearer; the faults; the original, today's and v2's panes; the difference of the two panes (v2's ink alone
  red, today's alone blue, the original faint).
- `parity.json`: whether the gate passes (`pass`), the run, what keeps it from being judged whole (`incomplete`), the floors
  and bounds, the summary, the ten worst pages, the pages where both sides depart alike (`pagesBoth`), each paper's facts of the
  classes the toggles keep (`facts`: the authors arXiv's metadata names and how many A sets, the `cite.*` anchors, the units
  each places), and every page's differences, its shared departures (`both`), faults, page measures (links, sentence boxes,
  darkness, pixels off the original, the rules found) and per unit both sides' measures.

Pages are ordered by a score: each measure's worse differences (8 at most) times its weight (`shown`, `weight`, `anchor`,
`align`, `cross`, `gap`, `turn`, `toggles` 3; `stretch`, `style`, `pixels`, `figures`, `scripts` 2; `size`, `links`, `borders`,
`highlight` 1; `line-count` 0.5).

## The release check

`pnpm release-check --tier full` runs it as the gate `display` ("display ≥ today: no page worse than today's, a difference
only where nearer the original"; stage reader, after `prepare`, over that run's bundles): the three steps, judged by
measure.mjs's exit code (no page worse, and the run judged whole). It is a cut-over blocker: the report's cut-over verdict
stays NO-GO until it passes (`lab/release-check/CI.md`).
