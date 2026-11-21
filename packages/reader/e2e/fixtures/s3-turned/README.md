# s3-turned

A paper of our own (CC0 1.0), made by `lab/pdf/reader-fixtures/make.mjs`: `arxiv.pdf` the stand-in of arXiv's PDF,
`bundle/` lane L1's back half over it (head, units, parts, add-on), `de.rows.json` its translation (its words written
backwards), `de.reader.json` that translation laid, in the baseline's reader-dump format. Remake: `node --import tsx
lab/pdf/reader-fixtures/make.mjs`.

Its pages are turned a quarter by /Rotate (90, then 270), their content set upright in their own space. Lane L1's
reading lays over no turned page, so the maker states its reading: A read with the turn not seen (`upright` in make.mjs),
its bytes keeping their /Rotate; the bundle is `prepareBack` over that reading.
