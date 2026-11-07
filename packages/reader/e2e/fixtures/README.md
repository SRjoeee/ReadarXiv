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
| `s1-columns` | two pages, a letter page in two columns and a landscape page; headings with labels, a footnote, a caption, elements that move (a formula in Times-Italic), run-in heads sharing a line with their paragraph, a URI link and a link inside the paper |
| `s2-splits` | one page whose every paragraph shares its first show with a run-in head (a TJ cut by a unit's edge), with kerns of many decimals: the split residue's case (lane L1's finding 2) |
| `s3-turned` | two pages turned by `/Rotate` (90, then 270), their content set upright in their own space: a heading with a label, paragraphs with an element and a run-in head, a caption, a URI link; the bundle made over A read with the turn not seen (lane L1's reading lays over no turned page; the maker states it): the maintainer's B-408, a laid page drawn turned with its page |

Licensed corpus papers are never copied here: the harness reads lane L1's bundles and the baseline's dumps of them in place
from lab-data (`AXT_LAB_FIXTURES=<id>,…`).
