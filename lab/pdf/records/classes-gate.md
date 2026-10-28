# The content classes' stage 4: references and names (lab/pdf/spikes/classes-gate.mjs)

Stage 4 of `docs/route/orphan-text.md` (`docs/PDF-READER.md` §19.13): a bibliography's entries units of their own, marked in the
bibliography's TeX, and the author block sent for every target. Counts and ids only.

## Run of 2026-10-25 (engine `feat/references-names` at 064ad3eb, against `next` 499d1dfb)

Each paper's layout marks, base page, layout file and wrap made by each engine over its own compiles (latexmk in the year's pinned
image of `lab/pdf/compile-images.json`, no network, arXiv's day); `next`'s dumped, and this branch's held to it unit by unit
(`--dump`, `--against`): the gate pack's 7 papers and the 25 of `lab/pdf/data/layout`, 32 papers. On every paper `next`'s units are
this branch's with the entries taken out, in order, and so are the marked original's files outside every bibliography (ids written as
`next`'s).

```
pnpm exec tsx lab/pdf/spikes/classes-gate.mjs --base=<next's tree> --engine=<next's tree> --compile --dump=<next's dump> <id>=<dir>@<year> …
pnpm exec tsx lab/pdf/spikes/classes-gate.mjs --base=<next's tree> --compile --dump=<this dump> --against=<next's dump> <id>=<dir>@<year> …
```

| Paper | Units (next → this) | Names units located | Entry units located | Body lost / gained / moved vs next | Placeholders moved | Entries left the original's by the wrap | G1 px on the entries' pages | Orphan letters (next → this) |
|---|---:|---:|---:|---|---:|---|---:|---:|
| 1512.03385v1 | 320 → 420 | 50 / 50 | 50 / 50 | 0 / 0 / 0 | 0 | 0 | 0 (1 page) | 0 → 0 |
| 1706.03762v7 | 176 → 256 | 40 / 40 | 40 / 40 | 0 / 0 / 0 | 0 | 0 | 0 (3 pages) | 0 → 0 |
| 1810.04805v2 | 282 → 394 | 56 / 56 | 56 / 56 | 0 / 0 / 0 | 0 | 0 | 0 (3 pages) | 0 → 0 |
| 2307.16209v1 | 466 → 784 | 167 / 167 | 151 / 151 | 0 / 0 / 0 | 0 | 0 | 0 (10 pages) | 883 → 883 |
| 2608.04322v1 | 312 → 418 | 48 / 48 | 58 / 58 | 0 / 0 / 0 | 0 | 0 | 0 (3 pages) | 0 → 0 |
| 2608.16117v1 | 123 → 123 | 0 / 0 | 0 / 0 | 0 / 0 / 0 | 0 | 0 | none | 196 → 196 |
| 2609.26457v1 | 134 → 378 | 122 / 122 | 122 / 122 | 0 / 0 / 0 | 0 | 0 | 0 (10 pages) | 7 → 7 |
| 2602.23285v2 | 181 → 181 | 0 / 0 | 0 / 0 | 0 / 0 / 0 | 0 | 0 | none | 24 → 24 |
| 2610.10069v1 | 193 → 239 | 0 / 0 | 46 / 46 | 0 / 0 / 0 | 0 | 0 | 0 (4 pages) | 10 → 10 |
| 2610.11256v1 | 406 → 406 | 0 / 0 | 0 / 0 | 0 / 0 / 0 | 0 | 0 | none | 549 → 549 |
| 2610.16663v1 | 320 → 351 | 31 / 31 | 0 / 0 | 0 / 0 / 0 | 0 | 0 | 0 (4 pages) | 71 → 71 |
| 2610.20266v1 | 175 → 175 | 0 / 0 | 0 / 0 | 0 / 0 / 0 | 0 | 0 | none | 3,157 → 3,157 |
| 2610.20285v1 | 285 → 285 | 0 / 0 | 0 / 0 | 0 / 0 / 0 | 0 | 0 | none | 1,405 → 1,405 |
| 2610.20484v1 | 115 → 155 | 20 / 20 | 20 / 20 | 0 / 0 / 0 | 0 | 0 | 0 (2 pages) | 60 → 60 |
| 2610.20581v1 | 219 → 265 | 0 / 0 | 46 / 46 | 0 / 0 / 0 | 0 | 0 | 0 (2 pages) | 37 → 37 |
| 2610.20595v1 | 159 → 159 | refused on both: `texlive` | | | | | | |
| 2610.20716v1 | 208 → 294 | 40 / 40 | 46 / 46 | 0 / 0 / 0 | 0 | 5 rest, 1 names (`spell`) | 0 (5 pages) | 19,377 → 128 |
| 2610.20848v1 | 125 → 125 | 0 / 0 | 0 / 0 | 0 / 0 / 0 | 0 | 0 | none | 83 → 83 |
| 2610.21037v1 | 149 → 168 | 0 / 0 | 19 / 19 | 0 / 0 / 0 | 0 | 0 | 0 (1 page) | 56 → 56 |
| 2610.21085v1 | 449 → 557 | 54 / 54 | 54 / 54 | 0 / 0 / 0 | 0 | 0 | 0 (7 pages) | 33 → 33 |
| 2610.21098v1 | 579 → 697 | 59 / 59 | 59 / 59 | 0 / 0 / 0 | 0 | 0 | 0 (4 pages) | 26 → 26 |
| 2610.21176v1 | 222 → 320 | 49 / 49 | 49 / 49 | 0 / 0 / 0 | 0 | 0 | 0 (3 pages) | 62 → 62 |
| 2610.21288v1 | 150 → 236 | 0 / 0 | 86 / 86 | 0 / 0 / 0 | 0 | 0 | 0 (3 pages) | 8,250 → 88 |
| 2610.21376v1 | 312 → 312 | 0 / 0 | 0 / 0 | 0 / 0 / 0 | 0 | 0 | none | 455 → 455 |
| 2610.21491v1 | 266 → 294 | 0 / 0 | 28 / 28 | 0 / 0 / 0 | 0 | 0 | 0 (2 pages) | 73 → 73 |
| 2610.21765v1 | 175 → 323 | refused on both: `final` | | | | | | |
| 2610.21827v1 | 47 → 47 | 0 / 0 | 0 / 0 | 0 / 0 / 0 | 0 | 0 | none | 73 → 73 |
| 2610.21880v1 | 140 → 140 | 0 / 0 | 0 / 0 | 0 / 0 / 0 | 0 | 0 | none | 0 → 0 |
| 2610.21924v1 | 620 → 620 | 0 / 0 | 0 / 0 | 0 / 0 / 0 | 0 | 0 | none | 0 → 0 |
| 2610.22065v1 | 117 → 117 | 0 / 0 | 0 / 0 | 0 / 0 / 0 | 0 | 0 | none | 231 → 231 |
| 2610.22195v1 | 338 → 338 | 0 / 0 | 0 / 0 | 0 / 0 / 0 | 0 | 0 | none | 0 → 0 |
| 2610.22214v1 | 267 → 267 | 0 / 0 | 0 / 0 | 0 / 0 / 0 | 0 | 0 | none | 0 → 0 |

- **Entries:** 930 rest units and 736 names units in 17 papers, every one located by the layout file; 6 the wrap leaves the
  original's (2610.20716v1's spell check: an accent, `\natexlab`, a journal macro), which no reader draws. The 14 papers that make
  none compile their bibliography with BibTeX in the prepare (a `.bib` and no `.bbl` where TeX reads it: the units are written
  before any compile); 2610.21765v1's (148 entry units, a bibliography written in the paper) is refused with its final pass on
  both engines. A names unit with no rest is an entry whose rest is its style's macros alone (apacite, 2610.16663v1); a rest with
  no names unit, a style with no first block (the entry one unit).
- **Every other unit** is `next`'s: none lost, gained or moved in the layout file, no placeholder's row moved.
- **No double ink:** G1, the wrap with every group ON against the unwrapped base page, 0 pixels apart on the 67 pages the entries
  are on (PDF.js in Node, scale 2, a channel past 24). The base pages against `next`'s, every page: 813 pages, 4 apart by 2 pixels
  each (2609.26457v1 p15 and p21, 2610.16663v1 p41 and p42), their text items in the same places to 0.005 pt: the marks in the
  bibliography move no glyph.
- **Orphans:** 35,118 letters → 7,707 (2610.20716v1 and 2610.21288v1, REVTeX's bibliographies, which no babel name opens: the
  entries' units, and the references' zone their starts open); the references' class 169,964 → 153,883 letters, names 4,544 →
  48,076 (an entry's first block).
- On the way, at the first run: plainnat's `410\penalty0 (19):\penalty0` before a line break gave the penalty the next line's pages
  for its number (arg-roles.mjs's value reader), so 42 entries' ink spelled no source (2609.26457v1 15, 2610.21176v1 15,
  2610.21085v1 12): fixed, a number TeX reads ends where TeX ends it; no body unit of the 32 papers moved with it.

## Again after the review round (20d6bcd4, merged with `next` 9f94ae09)

This branch alone, held to the same dumps of `next` 499d1dfb: the units the same on all 32 papers (an entry with no author is no
names unit, an accented piece keeps its numbers: neither shape in these sources), every entry located (930 and 736), no body unit
or placeholder lost, gained or moved, G1 0 pixels on the 67 pages, the same 6 entries left the original's. Orphan letters 7,293:
#468's label groups (theorem heads, a proof's joint) take more of the pages' letters, on papers with no entry too.

## Run of 2026-10-28 (engine `feat/refs-merged` at 55911b41, `next` 2346530d merged, against `next` 2346530d)

Each entry is one unit, the author block's places are units of their own, and a paper that ships no `.bbl` makes one (§19.13,
PIPELINE 30, LAYOUT 24). Each engine compiles its own copy of 35 papers: the 3 of 2026-10-28 (2609.20976v1, 2610.34042v1 and
2608.12606v1, 2025's tree), the gate pack's 7 and the 25 of `lab/pdf/data/layout`. The tree: latexmk in the year's pinned
image, no network. This branch is held to `next`'s dump unit by unit: `next`'s ids, its entries and the units this branch
numbers later taken out (`keptIds`). `--made` is this branch's `.bbl` pass (`layout/paper.mjs madeBibliography`, one draft
of the unmarked original with BibTeX). Where a pack holds the paper, the base pages are held to the pack's too.

```
pnpm exec tsx lab/pdf/spikes/classes-gate.mjs --base=<next's tree> --compile --dump=<next's dump> <id>=<dir>@<year> …
pnpm exec tsx lab/pdf/spikes/classes-gate.mjs --base=<next's tree> --made --compile --dump=<this dump> --against=<next's dump> --which [--pack=<690d0e19>] <id>=<dir>@<year> …
```

| Paper | Units (next → this) | .bbl | Entries located | Places located | Names located | Body lost / gained / moved | Placeholders moved | Author block rows moved | Unhidden | G1 px (entries' pages) | Base pages apart (px) |
|---|---:|---|---:|---:|---:|---|---:|---:|---|---:|---|
| 2609.20976v1 | 73 → 70 | made, 39 entries, 1.7 s | 39 / 39 | 4 / 4 | 3 / 3 | 0 / 4 / 0 | 0 | 0 | abstract:marks 1, para:marks 4 | 0 (3 pages) | 0 of 14 (0) |
| 2610.34042v1 | 83 → 80 | made, 56 entries, 1.4 s | 56 / 56 | 4 / 4 | 5 / 5 | 0 / 0 / 0 | 0 | 0 | reference:marks 2 | 0 (4 pages) | 0 of 17 (0) |
| 2608.12606v1 | 122 → 122 | made, 94 entries, 1.9 s | 94 / 94 | 9 / 12 | 10 / 10 | 0 / 0 / 0 | 0 | 0 | para:marks 1, para:page 2, reference:marks 3 | 0 (4 pages) | 1 of 20 (1) |
| 1512.03385v1 | 420 → 372 | shipped | 50 / 50 | 2 / 2 | 1 / 1 | 0 / 0 / 0 | 0 | 1 | 0 | 0 (1 pages) | 0 of 12 (0) |
| 1706.03762v7 | 256 → 228 | none | 40 / 40 | 7 / 7 | 8 / 8 | 0 / 0 / 0 | 0 | 2 | 0 | 0 (3 pages) | 0 of 15 (0) |
| 1810.04805v2 | 394 → 339 | shipped | 56 / 56 | 1 / 1 | 1 / 1 | 0 / 0 / 0 | 0 | 1 | 0 | 0 (3 pages) | 0 of 16 (0) |
| 2307.16209v1 | 784 → 634 | shipped | 168 / 168 | — | — | 0 / 0 / 0 | 0 | 0 | 0 | 0 (10 pages) | 0 of 147 (0) |
| 2608.04322v1 | 418 → 371 | shipped | 58 / 58 | — | 2 / 2 | 0 / 0 / 0 | 0 | 1 | 0 | 0 (3 pages) | 0 of 13 (0) |
| 2608.16117v1 | 123 → 132 | made, 81 entries, 2.5 s | 81 / 81 | 9 / 9 | 3 / 3 | 0 / 0 / 0 | 0 | 0 | reference:marks 5 | 0 (6 pages) | 0 of 40 (0) |
| 2609.26457v1 | 378 → 256 | shipped | 122 / 122 | 1 / 1 | 5 / 5 | 0 / 0 / 0 | 0 | 0 | 0 | 2 (10 pages) | 1 of 28 (2) |
| 2602.23285v2 | 181 → 187 | made, 57 entries, 2.2 s | 57 / 57 | 5 / 5 | 2 / 2 | 0 / 0 / 0 | 0 | 1 | 0 | 0 (4 pages) | 0 of 19 (0) |
| 2610.10069v1 | 239 → 239 | none | 46 / 46 | — | 3 / 3 | 0 / 0 / 0 | 0 | 0 | 0 | 0 (4 pages) | 0 of 27 (0) |
| 2610.11256v1 | 406 → 406 | made, 40 entries, 1.4 s | 40 / 40 | 1 / 1 | 1 / 1 | 0 / 0 / 0 | 1 | 0 | 0 | 0 (4 pages) | 0 of 42 (0) |
| 2610.16663v1 | 351 → 353 | shipped | 31 / 31 | 2 / 2 | 1 / 1 | 0 / 0 / 0 | 0 | 1 | affiliation:marks 1 | 0 (4 pages) | 0 of 67 (0) |
| 2610.20266v1 | 175 → 176 | made, 32 entries, 3.7 s | 32 / 32 | — | 3 / 3 | 0 / 0 / 0 | 0 | 1 | theorem:marks 1 | 0 (2 pages) | 0 of 30 (0) |
| 2610.20285v1 | 285 → 285 | made, 15 entries, 4.0 s | 15 / 15 | — | 0 / 1 | 0 / 0 / 0 | 0 | 0 | para:marks 1 | 0 (2 pages) | 0 of 36 (0) |
| 2610.20484v1 | 155 → 135 | shipped | 20 / 20 | — | 1 / 1 | 0 / 0 / 0 | 0 | 0 | 0 | 0 (2 pages) | 0 of 11 (0) |
| 2610.20581v1 | 265 → 265 | none | 46 / 46 | 2 / 2 | 2 / 2 | 0 / 0 / 0 | 0 | 0 | 0 | 0 (2 pages) | 0 of 33 (0) |
| 2610.20595v1 | 159 → 160 | compile | refused `texlive` (next `texlive`) | | | | | | | | |
| 2610.20716v1 | 294 → 254 | none | 46 / 46 | 0 / 2 | 2 / 2 | 0 / 0 / 0 | 0 | 0 | para:marks 1, cell:spell 4, reference:spell 6 | 0 (5 pages) | 0 of 25 (0) |
| 2610.20848v1 | 125 → 125 | made, 36 entries, 2.3 s | 36 / 36 | 17 / 17 | 18 / 18 | 0 / 0 / 0 | 0 | 0 | reference:marks 35 | 0 (3 pages) | 0 of 12 (0) |
| 2610.21037v1 | 168 → 168 | none | 19 / 19 | 3 / 3 | 3 / 3 | 0 / 0 / 0 | 0 | 0 | 0 | 0 (1 pages) | 0 of 19 (0) |
| 2610.21085v1 | 557 → 505 | shipped | 54 / 54 | 1 / 1 | 4 / 4 | 0 / 0 / 0 | 0 | 1 | 0 | 0 (7 pages) | 0 of 35 (0) |
| 2610.21098v1 | 697 → 639 | shipped | 59 / 59 | 1 / 1 | 1 / 1 | 0 / 1 / 0 | 0 | 0 | abstract:marks 1 | 0 (4 pages) | 0 of 26 (0) |
| 2610.21176v1 | 320 → 272 | shipped | 49 / 49 | 1 / 1 | 1 / 1 | 0 / 0 / 0 | 0 | 1 | 0 | 0 (3 pages) | 0 of 18 (0) |
| 2610.21288v1 | 236 → 236 | none | 86 / 86 | 1 / 2 | 2 / 2 | 0 / 0 / 0 | 0 | 0 | para:marks 1 | 0 (3 pages) | 0 of 21 (0) |
| 2610.21376v1 | 312 → 319 | made, 45 entries, 1.4 s | 45 / 45 | 6 / 6 | 3 / 3 | 0 / 0 / 0 | 0 | 2 | author:spell 1, author:marks 2, para:spell 2, para:marks 3 | 0 (4 pages) | 0 of 23 (0) |
| 2610.21491v1 | 294 → 306 | shipped | 28 / 28 | 6 / 6 | 8 / 8 | 0 / 0 / 0 | 0 | 2 | affiliation:marks 1 | 0 (2 pages) | 0 of 20 (0) |
| 2610.21765v1 | 323 → 250 | none | refused `final` (next `final`) | | | | | | | | |
| 2610.21827v1 | 47 → 47 | made, 95 entries, 1.8 s | 95 / 95 | — | — | 0 / 0 / 0 | 0 | 0 | para:marks 1 | 0 (2 pages) | 0 of 10 (0) |
| 2610.21880v1 | 140 → 141 | made, 15 entries, 3.4 s | 15 / 15 | 1 / 1 | 1 / 1 | 0 / 0 / 0 | 0 | 1 | 0 | 0 (1 pages) | 0 of 5 (0) |
| 2610.21924v1 | 620 → 620 | made, 32 entries, 1.9 s | 32 / 32 | — | — | 0 / 0 / 0 | 0 | 0 | para:spell 1, cell:marks 30 | 0 (3 pages) | 0 of 27 (0) |
| 2610.22065v1 | 117 → 117 | made, 27 entries, 1.9 s | 27 / 27 | 4 / 10 | 8 / 8 | 0 / 4 / 0 | 0 | 0 | 0 | 0 (1 pages) | 0 of 7 (0) |
| 2610.22195v1 | 338 → 338 | made, 59 entries, 1.7 s | 59 / 59 | — | 9 / 9 | 0 / 0 / 0 | 0 | 0 | 0 | 0 (4 pages) | 0 of 20 (0) |
| 2610.22214v1 | 267 → 267 | made, 20 entries, 2.4 s | 20 / 20 | — | — | 0 / 0 / 0 | 0 | 0 | 0 | 0 (1 pages) | 0 of 9 (0) |

- **The `.bbl`:** 16 papers make theirs: 743 entries, 1.4 to 4.0 s a pass. 11 ship one and 7 name no `\bibliography`
  (their entries are a `thebibliography` the paper writes); 2610.20595v1's pass does not run through, the paper refused on both
  engines; none of the 35 loads biblatex. In every paper of the 16, the units before the entries and the names after them are
  the bundle's byte for byte, with the `.bbl` and without.
- **Entries:** every one of the 1,721 entries is located by the layout file. The wrap leaves 51 of them the original's
  (`reference:marks` and `reference:spell` in the table):
  - 2610.20848v1's 35 (elsarticle-harv): each ends `\newblock \DOIprefix\doi{…}.`. `\DOIprefix` is a macro ending in a
    control word, so it gets its opening mark alone, and `\doi{…}` after it gets no mark (`marks.mjs layoutMarking`). That
    placeholder's ink has no closing point before the unit's end mark, and `own.mjs` leaves such a unit the original's. The
    paper's one entry with no DOI is laid.
  - 10 in 3 papers, not looked into here: 2608.16117v1 5, 2608.12606v1 3, 2610.34042v1 2. Among them are names with an accent
    (`Viñas`, `Völk`, `Böhringer`).
  - 2610.20716v1's 6 by the spell check, as before.
- **Places:** 88 of 100 are located. The 12 others are equal `\affiliation{…}`s that REVTeX and acmart set once:
  2608.12606v1 3, 2610.22065v1 6, 2610.20716v1 2 and 2610.21288v1 1, unmarked as `next` leaves them.
- **Every other unit** is `next`'s at its number:
  - none is lost and none moved;
  - 9 are laid that `next` left the original's: 2609.20976v1's four places its macros hold (`once`), 2610.22065v1 4 and
    2610.21098v1 1;
  - one placeholder moved: 2610.11256v1's ORCID, written out in a note, is now a placeholder;
  - the author block's rows of 12 papers moved: their units are cut apart.
- **No double ink:** G1, the wrap with every group ON against the unwrapped base page, is 2 pixels apart on the 115 pages the
  entries are on (2609.26457v1).
- **The base pages against `next`'s,** every page: 864 pages, 2 of them apart.
  - 2608.12606v1 p17 differs by 1 pixel, at the end of its "Bell, A. R. 1978" entry's line. 2609.26457v1 p21 differs by 2
    pixels, at the top of the "c" of "coding" (grey 173 → 144 and 166 → 138): an anti-aliased edge.
  - On both pages, PDF.js's operators are the same, op by op, once the marks (`ri /axt-…`) are set aside and the text runs a
    mark split are joined again: the same glyphs, widths, matrices, fonts and colours.
  - What changed is only where a mark splits a line's run. On 2609.26457v1 p21, next's mark between an entry's names and its
    rest (`ri /axt-336e`, `ri /axt-337s`) split "huber." from " Huxley-Gödel Machine: Human-level coding …"; here it is one
    run. On 2608.12606v1 p17 the marks of its made `.bbl` split more runs.
  - PDF.js's text items are in the same places to the last digit: the pixels are its canvas drawing a glyph inside a run
    instead of at a run's start. No glyph moves in the PDF.
- **The pack's base pages** (`--pack`, 690d0e19's) are the same pixels on 6 papers and those 2 pixels on 2609.26457v1.
- **A real prepare through the web's image** (2609.20976v1, `--network none`, the container as production starts it): the
  `bib` stage 4.0 s of a 40.7 s prepare (compiles 24.2 s); 109 source units and 29 ink units; the 39 entries announced in the
  first units chunk, each sent for every target (`toTranslate`) and laid; the 4 places laid; the 3 names laid.

## Again after the review round (the engine at #485's review fixes, `next` 757695fe merged in)

The review round added three rules. A row of names that sets its marks after a name, or opens with "and", is names
(2608.14893, 2608.30730, 2610.21880v1). An e-mail whose local part TeX escapes is one placeholder (2608.04322v1, 2608.09812,
2608.11884, 2608.29778). An author block's blocks are compared as TeX reads them (2610.21770v1's third equal REVTeX
affiliation, broken over two lines). The two gate papers these reach were run again against the same dumps of `next` 2346530d:

- 2610.21880v1: entries 15/15, names 2/2 (its "and Rafael F. Schaefer" row now a name, no place); no body unit lost; the
  wrap leaves none of its units the original's; G1 0, base pages 0 of 5 apart.
- 2608.04322v1: entries 58/58, names 2/2; no body unit lost; one placeholder's rows moved, the note's e-mail now one
  placeholder; base pages 0 of 13 apart, against `next`'s and against the pack's.

The brief's three papers, at the head with `next` 757695fe merged in and before these rules, were run again too.
2609.20976v1, 2610.34042v1 and 2608.12606v1 locate every entry (39, 56, 94) and lose no body unit. 2609.20976v1's abstract
and 6 of its placeholders moved: that is #483's fix, its target paper, and the wrap now leaves none of its units the
original's.
