// The names babel gives a document's generated headings (its [captions]: \abstractname, \refname, …), by key: what the
// layout marks wrap (marks.mjs NAMES_TEX), the layout file locates (file.mjs `names`) and the layout rules name in each
// target's words (rules/layout-rules.json `labels`). One list, read by the server's modules and the readers': imports
// nothing.

/** the keys, babel's own (its ini files' [captions]). `chapter` and `part` are not among them: their CJK names are
 *  templates around the number TeX sets after the name */
export const NAME_KEYS = Object.freeze(['abstract', 'ref', 'bib', 'contents', 'listfigure', 'listtable', 'appendix', 'index', 'proof', 'preface', 'glossary', 'figure', 'table'])
