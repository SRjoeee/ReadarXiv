// names.mjs's types
/** the names babel gives a document's generated headings, by key (\abstractname's `abstract`, \refname's `ref`, …) */
export declare const NAME_KEYS: readonly ['abstract', 'ref', 'bib', 'contents', 'listfigure', 'listtable', 'appendix', 'index', 'proof', 'preface', 'glossary', 'figure', 'table']
export type NameKey = (typeof NAME_KEYS)[number]
/** what names a compile's floats and its generated headings, by key: the target's names babel gives (the layout rules'
 *  labels), or the paper's own (live.mjs captionsOf); a key no compile answered for is left out */
export type Captions = Partial<Record<NameKey, 'target' | 'source'>>
