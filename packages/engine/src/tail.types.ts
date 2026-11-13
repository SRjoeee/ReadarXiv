// The types of tail.mjs (today's module, moved as it is into the engine package, JavaScript until its port): what
// its declarations stated, now a TypeScript module of the package (which holds no declaration file), each value of the
// JavaScript re-exported with its type.
// @ts-ignore: JavaScript moved as it is, typed by this file alone
import * as tail_js from './tail.mjs'
/** an object number at most (ISO 32000-1, annex C: 8,388,607) */
export const OBJECT_MAX = tail_js.OBJECT_MAX as number
/** the `startxref` of a PDF (the last 1024 bytes); null where there is none */
export const startxrefOf = tail_js.startxrefOf as (pdf: Uint8Array) => number | null
/** bytes as a string, one character a byte (ISO 8859-1) */
export const latin1 = tail_js.latin1 as (b: Uint8Array) => string
