// The types of section.mjs (today's module, moved as it is into the engine package, JavaScript until its port): what
// its declarations stated, now a TypeScript module of the package (which holds no declaration file), each value of the
// JavaScript re-exported with its type.
// @ts-ignore: JavaScript moved as it is, typed by this file alone
import * as section_js from './section.mjs'
/** an object written whole, `n g obj … endobj`: its number, generation and bytes */
export type SectionObject = [number: number, generation: number, bytes: Uint8Array]
/** the section appended at `end`: the objects, one cross-reference section of `kind` with /Prev `prev`, the trailer's /Root,
 *  /Info and /ID; `size` the next free number (a stream section's object takes it); `runs` false writes one subsection a
 *  number. Gives the bytes, the section's offset in the document and the /Size written */
export const appendSection = section_js.appendSection as (o: {
  end: number
  objects: SectionObject[]
  kind: 'table' | 'stream'
  prev: number
  size: number
  trailer: { root: unknown; info?: unknown; id?: unknown }
  runs?: boolean
}) => { bytes: Uint8Array; xref: number; size: number }
