# sample-1: a paper of our own

A four-page LaTeX paper written for this repository, and its PDF: a stand-in for arXiv's PDF that the engine's tests compile
and read (`tests/pdf-reader/helpers/ocg-pdfs.ts` SAMPLE_1, the prepare's tests), so that nothing they run depends on a paper
that is not ours, or on the network. Its layer bundle, which today's reader's browser checks opened it with, went with today's
engine at the cut-over.

**Licence: CC0 1.0.** The text, the TeX, the bibliography and everything made from them are dedicated to the public domain
([CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)), whatever the licence of the rest of the
repository. No text of any arXiv paper, or of any other work, is in them; the three references name published books, which
are facts about them and not their words.

## What is in it

| File | What it is |
|---|---|
| `main.tex` | The paper: title, abstract, seven sections and a subsection; inline and display mathematics (numbered, and an `align`); a lemma, a theorem and their proofs, and a definition; a footnote; a TikZ figure (vector, no image file); a table (`booktabs`); a list; citations from `refs.bib`; an external link (to `example.invalid`, which resolves nowhere). Its table's numbers are right: the two methods the paper describes agree on every blocked set of at most three cells on grids of up to six columns and rows (84,854 cases, checked when it was written). |
| `refs.bib`, `main.bbl` | The bibliography and what BibTeX made of it, as an arXiv source carries both. |
| `sample-1.pdf` | The stand-in for arXiv's PDF: `main.tex` compiled, with no mark in it. Four pages, US letter, 212,047 bytes. |

The paper is `2600.00001` version 1: an identifier no arXiv paper has (there is no month 00), so that a request that
escapes a test cannot meet a real one.

## Making the outputs again

`sample-1.pdf` was made by `scripts/make-sample-bundle.mjs` through today's engine, with native TeX Live in Docker and the
date pinned; the script went with that engine at the cut-over, and the PDF is kept as it made it. `main.bbl` is BibTeX's output over `main.tex` and `refs.bib`, made once in the same image:

```
docker run --rm --network none -v "$PWD":/work -w /work texlive/texlive:latest sh -c 'pdflatex -interaction=nonstopmode main && bibtex main'
```

(and then only `main.bbl` kept; every other file that run writes is a build product).
