# s5-links

A paper of our own (CC0 1.0), made by `lab/pdf/reader-fixtures/make.mjs`: `arxiv.pdf` the stand-in of arXiv's PDF,
`bundle/` lane L1's back half over it (head, units, parts, add-on), `de.rows.json` its translation (its words written
backwards), `de.reader.json` that translation laid, in the baseline's reader-dump format. Remake: `node --import tsx
lab/pdf/reader-fixtures/make.mjs`.

Its links inside the paper name destinations the head states as targets (link previews: a citation, a figure, a table, a section, a display, a note), one to a theorem it states none of, and one out of the paper. Six pages: the table and the theorem on the second, a second figure on the fifth, the bibliography on the last (entry [3] long enough that its card scrolls). Links to each kind stand on the page of their target, on the page next to it and several pages from it (page 1, page 2, page 5 and the last), so that a preview is shown with its target in view, near and far (its drawing parked off the view, or never drawn).