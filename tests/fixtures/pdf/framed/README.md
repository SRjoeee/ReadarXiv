# framed: a paragraph in a frame painted as one path round it

One page of our own, made as the box's prepare makes a paper's up to the instrument (`docs/PDF-READER.md` §18.112): a paragraph
of four lines in a `tcolorbox` (the frame painted as one closed path in the frame's colour and one in the paper's over it, the
paper's own case of 2601.06943v2's abstract), a paragraph over the frame and one well under it, so that the next ink under the
framed paragraph is the frame's border and, past it, blank paper and then text: a translation that borrowed the room under its
last line would be drawn across the border.

**Licence: CC0 1.0.** The source and everything made from it are ours, dedicated to the public domain
([CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)). No text of any arXiv paper is in them.

| File | What it is |
|---|---|
| `framed.tex` | The page. |
| `arxiv.pdf` | The stand-in for arXiv's PDF: `framed.tex` compiled as it is (prepareBack's A). |
| `final.pdf` | Our final pass of the marked original, as the front half makes it (`layout/paper.mjs` `markedOfPaper`): what the instrument reads (B). |
| `made.json` | What the front half hands the instrument besides it: the marking's options (`options`, the mark probe's answers among them) and the marked compile's log (`log`). |

Made again by `scripts/make-tex-fixture.mjs framed` (the pinned TeX Live in Docker, no network, the date pinned, so the same
source gives the same bytes; `--check` makes them in a scratch folder and exits 1 where they differ): after a change of the front
half's marking or its probe. The test that reads them: `tests/pdf-reader/framed-prepare.test.ts`.
