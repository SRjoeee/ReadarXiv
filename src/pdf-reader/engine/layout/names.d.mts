// names.mjs's types
/** the names babel gives a document's generated headings, by key (\abstractname's `abstract`, \refname's `ref`, …) */
export declare const NAME_KEYS: readonly ['abstract', 'ref', 'bib', 'contents', 'listfigure', 'listtable', 'appendix', 'index', 'proof', 'preface', 'glossary', 'figure', 'table']
export type NameKey = (typeof NAME_KEYS)[number]
/** each name's English value, babel's en [captions] */
export declare const NAME_ENGLISH: Readonly<Record<NameKey, string>>
/** what names a compile's floats and its generated headings, by key: the target's names babel gives (the layout rules'
 *  labels), or the paper's own (as a compile of the translation once read them; the reader's are layer-proto/reader.mjs
 *  CAPTIONS); a key no compile answered for is left out */
export type Captions = Partial<Record<NameKey, 'target' | 'source'>>
/** how far after a name its counter may begin, of the name's size */
export declare const COUNTER_GAP: number
/** the counter TeX set after a babel name on its line where it leads no unit: how many of `next` (the glyphs after the name on
 *  its line, in reading order) it is, 0 for none */
export declare function counterAfter(x1: number, size: number, next: readonly { u?: string; x0: number; x1: number; size?: number }[]): number
/** the number TeX set right before a babel name at its line's start (a heading its class numbers itself): how many of `before`
 *  (every glyph before the name on its line, in reading order) it is, all of them or 0 for none */
export declare function counterBefore(x0: number, size: number, before: readonly { u?: string; x0: number; x1: number; size?: number }[]): number
