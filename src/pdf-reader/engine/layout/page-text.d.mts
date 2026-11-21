// page-text.mjs's types: a page's text as the delta's proof compares it
/** a page's text record: its view, rotation and user unit, its text items' count and the SHA-256 (hex) of their exact values */
export interface TextRecord { view: number[]; rotate: number; userUnit: number; count: number; items: string }
/** the canonical bytes of a page's text items (the items with a string, in order), with how many items it holds */
export declare function textItemsBytes(items: readonly unknown[]): { bytes: Uint8Array; count: number }
/** a page's text record, of a PDF.js page and its getTextContent's result */
export declare function textRecordOf(page: { view?: readonly number[]; rotate?: number; userUnit?: number }, content: { items?: readonly unknown[] } | null | undefined): Promise<TextRecord>
/** why the record `a` is not `b`'s page ('its box differs', a count, 'its text items differ', 'it was not read'), or null */
export declare function textRecordDiffers(a: TextRecord | null | undefined, b: TextRecord | null | undefined): string | null
