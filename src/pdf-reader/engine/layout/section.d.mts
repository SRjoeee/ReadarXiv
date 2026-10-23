// section.mjs's types: an incremental-update section, the remover's tails' and the delta's
/** an object written whole, `n g obj … endobj`: its number, generation and bytes */
export type SectionObject = [number: number, generation: number, bytes: Uint8Array]
/** the section appended at `end`: the objects, one cross-reference section of `kind` with /Prev `prev`, the trailer's /Root,
 *  /Info and /ID; `size` the next free number (a stream section's object takes it); `runs` false writes one subsection a
 *  number. Gives the bytes, the section's offset in the document and the /Size written */
export declare function appendSection(o: { end: number; objects: SectionObject[]; kind: 'table' | 'stream'; prev: number; size: number; trailer: { root: unknown; info?: unknown; id?: unknown }; runs?: boolean }): { bytes: Uint8Array; xref: number; size: number }
