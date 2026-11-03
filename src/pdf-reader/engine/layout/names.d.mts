// names.mjs's types
/** the names babel gives a document's generated headings, by key (\abstractname's `abstract`, \refname's `ref`, …) */
export declare const NAME_KEYS: readonly ['abstract', 'ref', 'bib', 'contents', 'listfigure', 'listtable', 'appendix', 'index', 'proof', 'preface', 'glossary', 'figure', 'table']
export type NameKey = (typeof NAME_KEYS)[number]
/** each name's English value, babel's en [captions] */
export declare const NAME_ENGLISH: Readonly<Record<NameKey, string>>
/** what names a compile's floats and its generated headings, by key: the target's names babel gives (the layout rules'
 *  labels), or the paper's own (live.mjs captionsOf); a key no compile answered for is left out */
export type Captions = Partial<Record<NameKey, 'target' | 'source'>>
/** how far after a name its counter may begin, of the name's size */
export declare const COUNTER_GAP: number
/** the counter TeX set after a babel name on its line where it leads no unit: how many of `next` (the glyphs after the name on
 *  its line, in reading order) it is, 0 for none */
export declare function counterAfter(x1: number, size: number, next: readonly { u?: string; x0: number; x1: number; size?: number }[]): number
