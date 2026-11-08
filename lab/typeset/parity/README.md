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
broken highlight, a cell across a column rule, a wide gap after a run-in head).

```
node lab/typeset/parity/run.mjs [--work=<dir>] [--out=<dir>] [--pages=<n>,…] [<pair>…]
```

Defaults: the sheet and `parity.json` in `$AXT_LAB_DATA/refactor-2026-11/parity/`, the work files in its `work/`. Exit 1
when a page is worse than today's, or when the run is not judged whole: the gate passes only over every page the run asked
(see "The run judged whole"). The three steps can be run alone (heavy ones through `heavy-slot.sh`):

| Step | Command | What it does |
|---|---|---|
| v2's lay | `heavy-slot.sh test -- node lab/typeset/parity/v2.mjs --out=<work>/v2 <pair>…` | each page laid by the reader's own lay (`packages/reader/src/compose/typeset.ts` `typesetLay`: `layPage` under the rules, toggles and options the reader passes, nothing more) over the paper's part and the pair's door rows, the layered metrics and the served hyphenation patterns, driven page by page as `lab/typeset/checkpoint/laid.mjs --entry` drives the checkpoint's (gate-l1.ts; `hook.mjs` puts the reader's lay in place of gate-l1's own entry call) |
| the drawing | `heavy-slot.sh e2e -- node lab/typeset/parity/render.mjs --work=<work> --out=<out> [--pages=<n>,…] <pair>…` | arXiv's page (PDF.js), today's (`today/entry.mjs`) and v2's (`v2page/main.ts`) drawn in one Chromium at PDF.js's scale 1, device scale 2; each side shot whole and with its translated text alone; what each drew read back (`measure-dom.mjs`) and its pixels read (`analyse.mjs`); the run's manifest `<work>/raw/run.json` |
| the verdict | `node lab/typeset/parity/measure.mjs --work=<work> --out=<out> [<pair>…]` | the measures below (`verdict.mjs`) over the run's own drawing, `parity.json` and `index.html` |

On the maintainer's machine (shared with other lanes' jobs, 2026-11-08) the 22 pairs took 15 s to lay and 954 s to draw
(344 pages, about 3 s a page), the verdict 10 s. The images are WebP at 1.33 px a point (about 100 KB a pane, 160 MB in
all); the drawing stops when the volume of `--work` or of `--out` has under 12 GiB free (`statfs`, on any platform), and the
pairs it did not draw make the run incomplete.

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
  sides. Both lay under the default toggles (references and the author block the original's).
- **The original**: arXiv's page (its pixels, its vertical rules read off them, its link annotations), the part's members
  (their lines on A, TeX's alignment, font state, labels and measure; `dir` for a turned text), else today's prepare dump
  (`baseline/prepare/<paper>.prepare.json`).

What each side drew is read back from the browser, never from the layout's numbers: each character's advance box where the
browser placed it, through its `<text>`'s own transform (a turned text is one line of its own, measured by its box alone),
in the face weight, style and size it was drawn in (computed style), drawn or a crop's transparent stand-in; a line's
extent takes in the crops standing on it, and a smaller run raised or lowered off a line (a footnote mark) is part of it.
A unit is joined across the sides by today's ord (`join.mjs`, written by v2.mjs): every member of the entry's Pages, laid or
not, joined to today's unit by its unit's id and its rank among the part's members of that id (the baseline's rule), never by
what gate-l1's runner adapted (its stops record no join, so a member the entry lays and the runner stops, an element that
ends or opens a line, was read as no member joined). A member's unit id is its text, but an ink unit's whose text the part
names as the source unit it echoes (a contents line its heading's, a note set as its source footnote, an author block's names:
`bundle.ts` placedOf): the ink unit's own, the format's `unitId` over its kind and the echoed content, today's id of that ink
unit.

## The measures: each a distance from the original, and when v2 is nearer

| Measure | Distance from the original (each side's) | Same within (the noise floor) | Why this floor |
|---|---|---|---|
| `shown` | a unit today lays on the page that v2 leaves the original's (its state named: unproven, none, unfit, …; or no member of v2's part joined to it); and, per unit both translate, its label (a name word TeX set on its first line: "Proposition 1", "Fig. 2") that today draws in the target and v2 keeps as the original's ink or draws in the original's words (reason `label`): read from the drawn text: a side draws the label anew where its first line opens with a word and the label's number (the part's `num`, the punctuation about it aside), wherever the line stands (a centred head relabelled starts past the name's end as often as not), in the target where that word is not the name word, and keeps it where the line opens otherwise (the unit's text alone) or with a crop's stand-in; a label that states no number is read by its place, kept where the line's ink starts at the name's end or after it | none: always worse | a reader sees English where production shows the translation; no nearness can stand for a missing translation, and a kept English label is never nearer (v2 relabelling a label today keeps is no fault) |
| `weight` | the translated text's mean darkness (1 − luminance over its glyph pixels, darkness ≥ 0.1; each side shot with its copy, crops, links and figure texts hidden) against the original text's (arXiv's page over the original lines of the units laid) | 5 % of the original's darkness, 3,000 glyph pixels a side at least | the same faces at the same size give the same mean: measured on the first run, v2 against today on one page p5 −1.3 %, p95 +1.7 % (today's own pages of one paper, other text, p95 4.3 %); a face a weight lighter, a lighter fill or another antialiasing moves it by more |
| `anchor` | the smaller of the first line's baseline offset and its em top's offset (baseline + 0.8 size) from the original's first line, where the unit starts on the page | a tenth of the size, 1 pt at least | a point is a visible step at reading size (1.33 CSS px at 100 %) and above what drawing the same line twice moves (0.01 pt); a unit anchored at its last line is a whole line pitch off |
| `align` | TeX's alignment (the part's `align`): centred, a line's midpoint off the original lines' (a first line's with its label, drawn anew or kept); left or justified, a first line's start off the original's (or its label's), every other line's off the nearest original line start (its column, a float's margin, after a display; a CJK opening mark's blank half allowed); right, a line's end | as `anchor` | as `anchor` |
| `gap` | a run-in the part states (a follower it joins to the member before it in its flow, `Placed.join`: a run-in head and its paragraph on the head's last line; the member a bound name leads), the follower's start after the head's end off the original's separation; two units set on one line otherwise (authors' addresses in columns of their own, cells, figure texts) are judged by `anchor` and `align`, each where TeX set it; a head v2 lays with no line of its own (a name set as its follower's lead) is in its follower's line, no separation to read on v2's side | as `anchor` | as `anchor` |
| `cross` | the lines of a unit across a vertical rule of arXiv's page (a dark run 12 pt long, 1.5 pt wide at most, light on both sides) or over another unit's box by more than 1 pt both ways (its drawn lines where the side lays it, else its original lines); the original has none (a rule or box its own lines cross is not counted) | any: one more crossing is worse | the room between the rules and the neighbours' ink is the original's |
| `turn` | a unit TeX set turned (a figure's rotated text) drawn upright | none: always worse | the original's words, and today's, stand turned in their columns; upright they run into each other |
| `stretch` | a line's overshoot past 1 em of word space or 0.25 em of letter gap (the original's TeX spaces stay near a third of an em, its letters unspaced); a gap before a space character, or before a run the drawing places at its own x (the typesetter's glue: a lead's word, its label, the text after them), is a word space | 0.1 em | below a tenth of an em two spacings look alike |
| `style` | a unit's share of bold (weight 600 or more) and of slanted characters off the original's font state (1 where TeX set the unit bold or slanted, else 0) | 15 % of its characters, 3 characters at least | a translator's reordering moves a styled word by a few characters; spreading is a whole phrase or unit |
| `pixels` | device pixels off arXiv's page outside every unit's box (its original lines, either side's drawn lines, figure texts, names and crops, padded 1 pt), luminance by 0.25 or more where no pixel within one device pixel matches (ink, not a sub-pixel phase) | 150 device pixels | about one glyph of 10 pt type at 2.67 pixels a point: an erased or a stray piece of ink |
| `figures` | the figure texts drawn translated (each side's drawn groups: today's `g[data-f]`, v2's `g[data-axt-ord]` of the part's figure members, a character drawn): fewer than today's | none: always worse | as `shown` |
| `size` | a unit's median drawn size off the original's (a share of it); a size tie of v2's (the part's `ties`, rule `size`: the owner's ruling that one paragraph's text is even, so v2 lays a run-in head with its paragraph, or a paragraph a display splits, at one scale) judged as one paragraph: its size its smallest member's share, against today's smallest over the same members (today lays them one by one), so a tie at today's smallest is equal and a tie under it worse | 5 % | two of the fit's steps (0.025 of the size each, `data/rules/scripts.ts`) |
| `links` | the links a reader can follow missing against the original's link annotations: the anchors each side drew (the overlay's; on a page shown as arXiv's, its page view's annotation layer, today's by `shownOriginal`'s rule the original's), the layouts' own counts kept beside | half a link: any | every link of the original is one a reader follows |
| `highlight` | the highlight is a feature of today's for the units today highlights, and elsewhere v2 is judged only on not drawing a wrong one. (1) A unit both sides draw that today highlights (today's laid words' spans): each side's sentence boxes judged by the lines they leave uncovered, its drawn lines on the right and its original's lines on arXiv's page on the left (covering as below): v2 worse where it leaves more of them than today does, nearer where fewer (today's own misses are not held against v2; a unit v2 lays no boxes for leaves them all). The highlight is judged as the reader sees it (the coordinator's ruling, 2026-11-08): ink is ink, so a drawn line is its ink (a CJK opening mark's blank first half and a closing mark's blank second half, the full stop's, the comma's, a closing bracket's, are none of it: a box that stops at the mark's ink covers the line); and each side's boxes are what its reader paints: today's its own shapes' (`today/entry.mjs` litBoxes, read once every page is drawn: the reading view's `createShapes`/`layerShapes` over the parts, every page's left part and laid words, and its rows' sentences; every sentence's rectangles where it lights by sentence, `view/lighting.mjs` startsOf, else its runs' blocks; padded 3 CSS px beside as `lighting.mjs` paints them), v2's `Laid.lit` and its kept ink's boxes padded as `packages/reader` `compose/highlight.ts` paints them, 3 CSS px beside (2.25 pt at the parity's scale) and half the page's leading above and below. Why: the boxes the layouts state are not what is shown; judged bare, v2's boxes, which stop at a closing mark's ink and at the line's band, missed lines its painted highlight covers, and today's, a run's whole block, covered lines its own sentences do not (the parity of 9 pairs, 2026-11-08: 129 pages worse with today's blocks, 78 with both bare). (2) A unit both sides draw that today does not highlight, and a figure text both translate (today's own group, `g[data-f]`, joined to v2's figure member by the original's box: the group's drawn box to today's prepare unit, that unit's box to the part's, each a mutual best overlap), which today never highlights: v2 without boxes is equal, v2's boxes covering it better, boxes that miss it worse. (3) A unit only v2 translates (today left it English): no boxes or covering ones pass, boxes that miss it worse. Covering: its boxes over each of its drawn lines on the right (the line's box, baseline − 0.2 to + 0.8 of its size) and each of its original's lines on arXiv's page on the left (the part's line boxes), every edge within a point | any | the original's every unit has its sentences on the left; a highlight that marks the wrong place misleads where none does not |
| `line-count` | a unit's drawn lines on the page off the original's count there | half a line: any | another line count is a reflow; nearer the original's is better |

Beside the verdict each side's faults against absolute bounds are measured (a first line off both ways by 0.25 of the
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
  and bounds, the summary, the ten worst pages, and every page's differences, faults, page measures (links, sentence boxes,
  darkness, pixels off the original, the rules found) and per unit both sides' measures.

Pages are ordered by a score: each measure's worse differences (8 at most) times its weight (`shown`, `weight`, `anchor`,
`align`, `cross`, `gap`, `turn` 3; `stretch`, `style`, `pixels`, `figures` 2; `size`, `links`, `highlight` 1;
`line-count` 0.5).

## The release check

`pnpm release-check --tier full` runs it as the gate `display` ("display ≥ today: no page worse than today's, a difference
only where nearer the original"; stage reader, after `prepare`, over that run's bundles): the three steps, judged by
measure.mjs's exit code (no page worse, and the run judged whole). It is a cut-over blocker: the report's cut-over verdict
stays NO-GO until it passes (`lab/release-check/CI.md`).
