// The names babel gives a document's generated headings (its [captions]: \abstractname, \refname, …), by key: what the
// layout marks wrap (marks.mjs NAMES_TEX), the layout file locates (file.mjs `names`) and the layout rules name in each
// target's words (rules/layout-rules.json `labels`). One list, read by the server's modules and the readers': imports
// nothing.

/** the keys, babel's own (its ini files' [captions]). `chapter` and `part` are not among them: their CJK names are
 *  templates around the number TeX sets after the name */
export const NAME_KEYS = Object.freeze(['abstract', 'ref', 'bib', 'contents', 'listfigure', 'listtable', 'appendix', 'index', 'proof', 'preface', 'glossary', 'figure', 'table'])
/** each name's English value, babel's en [captions] (the layout rules' pinned locale files): what a style that writes a
 *  name literally writes (marks.mjs literalNames), and a head the layer never draws as a theorem's (layer2.mjs
 *  headLabelInTarget: a babel name is the names' own, nameInTarget) */
export const NAME_ENGLISH = Object.freeze({ abstract: 'Abstract', ref: 'References', bib: 'Bibliography', contents: 'Contents', listfigure: 'List of Figures', listtable: 'List of Tables', appendix: 'Appendix', index: 'Index', proof: 'Proof', preface: 'Preface', glossary: 'Glossary', figure: 'Figure', table: 'Table' })
