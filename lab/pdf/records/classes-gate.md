# The content classes' stage 4: references and names (lab/pdf/spikes/classes-gate.mjs)

Stage 4 of `docs/route/orphan-text.md` (`docs/PDF-READER.md` §19.12): a bibliography's entries units of their own, marked in the
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
