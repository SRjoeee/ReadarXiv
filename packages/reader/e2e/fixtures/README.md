# The reader's fixtures

Papers of our own, **CC0 1.0** ([CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)): no text of any
arXiv paper or other work is in them. Each was written by `lab/pdf/reader-fixtures/make.mjs` with pdf-lib in the standard
fonts and taken through lane L1's back half (`prepareBack`) with an instrument the maker states, so that each holds the
stand-in of arXiv's PDF (`arxiv.pdf`), the bundle the prepare makes of it (`bundle/`: head, units, parts, add-on, by digest),
a translation (`de.rows.json`, the translate package's Result shape, by unit id) and that translation laid
(`de.reader.json`, in the baseline's reader-dump format), which the harness's converter (`../page/convert.ts`) makes into the
`Page`s the reader paints. `make.mjs --check` makes them again and exits 1 where the bytes differ.

| Fixture | What it holds |
|---|---|
| `s1-columns` | two pages, a letter page in two columns and a landscape page; headings with labels, a footnote, a caption, elements that move (a formula in Times-Italic), run-in heads sharing a line with their paragraph; links as hyperref sets them: a URI link over an `\href` group's word, a link inside the paper over the number a `\ref` sets, a URI link round a figure's frame that no unit owns |
| `s2-splits` | one page whose every paragraph shares its first show with a run-in head (a TJ cut by a unit's edge), with kerns of many decimals: the split residue's case (lane L1's finding 2) |
| `s3-turned` | two pages turned by `/Rotate` (90, then 270), their content set upright in their own space: a heading with a label, paragraphs with an element and a run-in head, a caption, a URI link over an `\href` group's word; the bundle made over A read with the turn not seen (lane L1's reading lays over no turned page; the maker states it): the maintainer's B-408, a laid page drawn turned with its page |
| `s4-author` | one page whose author block's note its source ties to it, ICML's shape: a place an author command's argument stores (a unit of the block, held, set nowhere of its own) and the footnote the class sets of it at the page's foot, naming the author too, no unit's: locate makes it an ink unit of the names (`inknames`, the stored rule) and the bundle its variant with the author's name an element (PDF-READER §18.71, §19.15) |

Licensed corpus papers are never copied here: the harness reads them in place from lab-data (`AXT_LAB_FIXTURES=<id>,…`), each
laid with a bundle and the rows that belong to it: a corpus run's bundles and that run's rows of them (`AXT_L1_BUNDLES` and
`AXT_LAB_ROWS`, never one without the other: the release check's `harness-lab` gives its prepare's bundles and its reader
gate's rows), else, the harness run by hand with neither, lane L1's bundles and the baseline's dumps of today's reader over
them. A run's rows that hold no file of a paper ("no rows of this run for <id>: expected <file>"), or that leave a unit of its
bundle without a row or name units it does not hold ("rows do not belong to these bundles"), stop the harness before any
check: a paper is never laid from another run's data in their place.
