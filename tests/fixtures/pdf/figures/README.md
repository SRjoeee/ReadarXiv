# figures: the text inside vector figures

One page of vector figures in each shape the engine cuts into figure units (the content class `figures`, `docs/PDF-READER.md`
§19.12), compiled as our final pass compiles a paper's: the layout compile's points (`layout/marks.mjs` `POINTS_TEX`, a TikZ
picture's `zs` and `ze` among them) before `\documentclass`.

**Licence: CC0 1.0.** The sources and everything made from them are ours, dedicated to the public domain
([CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)). No text of any arXiv paper is in them.

| File | What it is |
|---|---|
| `figures.tex` | The page: a pgfplots axis (its title, its x label, its y label turned, a legend of four entries close together), a TikZ diagram (two boxed nodes and a label beside an arrow), and the two included figures below. |
| `inc-tounicode.tex`, `inc-tounicode.pdf` | An included figure whose fonts carry a `/ToUnicode` (pdfTeX's `\pdfgentounicode`): its two words become figure units inside its form. |
| `inc-codes.pdf` | An included figure written by the maker: one Type 3 font whose glyphs are named by codes (`/g41` to `/g44`), no `/ToUnicode`. Its word is no text a reader can trust, and stays the original's. |
| `figures.pdf` | `figures.tex` compiled over the points, including both. |

Made again by `scripts/make-figure-fixture.mjs` (the pinned TeX Live in Docker, no network, the date pinned, so the same sources
give the same bytes; `--check` makes them in a scratch folder and exits 1 where they differ). The tests that read them:
`tests/pdf-reader/figure-text.test.ts`.
