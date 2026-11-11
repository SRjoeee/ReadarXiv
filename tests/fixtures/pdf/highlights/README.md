# highlights: soul's highlights, found where TeX set them

One page of our own whose words carry soul's highlights, made as the box's prepare makes a paper's up to the instrument
(`docs/PDF-READER.md` §18.48): two highlights of two colours glued inside one word, the second right after a closed one (a
paragraph) and right after one of its opening point alone (a caption); one at a word's start, in its middle and at its end; one
run across a line's end; `\hl` itself. The paper's own macros (`\hlsun`, `\hlsky`) are `\hl` under a colour, as arXiv papers write
them.

**Licence: CC0 1.0.** The source and everything made from it are ours, dedicated to the public domain
([CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)). No text of any arXiv paper is in them.

| File | What it is |
|---|---|
| `highlights.tex` | The page. |
| `arxiv.pdf` | The stand-in for arXiv's PDF: `highlights.tex` compiled as it is (prepareBack's A). |
| `final.pdf` | Our final pass of the marked original, as the front half makes it (`layout/paper.mjs` `markedOfPaper`): what the instrument reads (B). |
| `made.json` | What the front half hands the instrument besides it: the marking's options (`options`, the mark probe's answers among them: `texts`, `decorated`) and the marked compile's log (`log`). |

Made again by `scripts/make-highlight-fixture.mjs` (the pinned TeX Live in Docker, no network, the date pinned, so the same source
gives the same bytes; `--check` makes them in a scratch folder and exits 1 where they differ): after a change of the front half's
marking or its probe. The test that reads them: `tests/pdf-reader/highlights.test.ts`.
