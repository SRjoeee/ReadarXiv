# sample-1: a paper of our own, and its layer bundle

A four-page LaTeX paper written for this repository, and what the server's preparation makes of it: a stand-in for arXiv's
PDF and the layer bundle that goes with it. The reader's browser checks (`tests/e2e/reader.mjs`) open it as if it were
an arXiv paper, so that nothing they run depends on a paper that is not ours, or on the network.

**Licence: CC0 1.0.** The text, the TeX, the bibliography and everything made from them are dedicated to the public domain
([CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)), whatever the licence of the rest of the
repository. No text of any arXiv paper, or of any other work, is in them; the three references name published books, which
are facts about them and not their words.

## What is in it

| File | What it is |
|---|---|
| `main.tex` | The paper: title, abstract, seven sections and a subsection; inline and display mathematics (numbered, and an `align`); a lemma, a theorem and their proofs, and a definition; a footnote; a TikZ figure (vector, no image file); a table (`booktabs`); a list; citations from `refs.bib`; an external link (to `example.invalid`, which resolves nowhere). Its table's numbers are right: the two methods the paper describes agree on every blocked set of at most three cells on grids of up to six columns and rows (84,854 cases, checked when it was written). |
| `refs.bib`, `main.bbl` | The bibliography and what BibTeX made of it, as an arXiv source carries both. |
| `sample-1.pdf` | The stand-in for arXiv's PDF: `main.tex` compiled, with no mark in it. Four pages, US letter, 212,737 bytes. |
| `bundle.json` | The layer bundle (`src/pdf-reader/engine/layer-proto/bundle.mjs`): the paper's 45 units, the original's side (41 of them located), the layout file (43 located, and four babel names: the abstract's, two proofs' leading their text and the references') and the add-on, under the engine's versions. 33,795 bytes. |

The paper is `2600.00001` version 1: an identifier no arXiv paper has (there is no month 00), so that a request that
escapes a test cannot meet a real one. The bundle's `base.url` is `/api/v1/original/2600.00001v1`, where the stand-in of
the layer API (`tests/e2e/lib/layer-api.mjs`) serves `sample-1.pdf`.

## Making the outputs again

`sample-1.pdf` and `bundle.json` are made by `scripts/make-sample-bundle.mjs` through the engine's modules, with native
TeX Live in Docker (`texlive/texlive:latest`, the image the lab's gates run; it is never pulled, so have it already) and
the date pinned, so that the same source and the same engine give the same bytes:

```
pnpm exec tsx scripts/make-sample-bundle.mjs            # writes sample-1.pdf and bundle.json here
pnpm exec tsx scripts/make-sample-bundle.mjs --check    # makes them again; exits 1 if they differ from these files
```

Remake them when the engine's contract moves (`BUNDLE`, `PDFJS`, `PIPELINE_VERSION`, `LAYOUT` or `REMOVAL`, which the
bundle's versions name, and which `tests/e2e/lib/layer-api.test.ts` reads it against), when the source is edited, or when
TeX Live changes. `main.bbl` is BibTeX's output over `main.tex` and `refs.bib`, made once in the same image:

```
docker run --rm --network none -v "$PWD":/work -w /work texlive/texlive:latest sh -c 'pdflatex -interaction=nonstopmode main && bibtex main'
```

(and then only `main.bbl` kept; every other file that run writes is a build product).
