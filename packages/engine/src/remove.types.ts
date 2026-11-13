// The types of remove.mjs (today's module, moved as it is into the engine package, JavaScript until its port): what
// its declarations stated, now a TypeScript module of the package (which holds no declaration file), each value of the
// JavaScript re-exported with its type.
// @ts-ignore: JavaScript moved as it is, typed by this file alone
import * as remove_js from './remove.mjs'
import type { OpsReader } from './opstream.ts'

/** a content stream's operators (those of `keep`, null: every one), holding at most `limit` bytes by COST (past it LexLimit), with what they hold */
export const lex = remove_js.lex as (
  bytes: Uint8Array,
  limit?: number,
  keep?: ReadonlySet<string> | null,
) => { op: string; args: unknown[]; s: number; e: number }[] & { bytes: number }
/** lex's refusal of a stream holding more than it was allowed */
export interface LexLimit extends Error {
  limit: number
}
export const LexLimit = remove_js.LexLimit as { new (...args: unknown[]): LexLimit }
/** decode's refusal of a stream decoding to more than it was allowed */
export interface DecodeLimit extends Error {
  limit: number
}
export const DecodeLimit = remove_js.DecodeLimit as { new (...args: unknown[]): DecodeLimit }
/** a decoding stream's bytes (PDF.js's DecodeStream, as the object layer ports it) no further than `limit`, as bytes of their own */
export const readAtMost = remove_js.readAtMost as (
  stream: { getBytes(n?: number): Uint8Array; reset(): void },
  limit: number,
) => Uint8Array
/** the heap a lexed token, and a recorded event, is held in, by its kind */
export const COST = remove_js.COST as Readonly<
  Record<'op' | 'num' | 'name' | 'str' | 'mark' | 'kw' | 'atom' | 'event' | 'code', number>
>
/** what a page's walk may hold: its streams' operators and its events by COST, each stream lexed once, and their decoded bytes */
export const HELD_MAX = remove_js.HELD_MAX as number
export const BYTES_MAX = remove_js.BYTES_MAX as number
/** a PDF object as the object layer (@cantoo/pdf-lib) holds one, as the engine reads it: a dictionary's or an array's entry
 *  read through `get`, where it has one */
export interface PdfObject {
  toString(): string
  get?(key: PdfName | number): PdfObject | undefined
}
/** a name (`/Name`): its text with the slash (`asString`), its characters decoded (`decodeText`, where the layer has it) */
export interface PdfName extends PdfObject {
  asString(): string
  decodeText?(): string
}
export interface PdfNumber extends PdfObject {
  asNumber(): number
}
/** an indirect reference (`n g R`) */
export interface PdfRef extends PdfObject {
  readonly objectNumber: number
  readonly generationNumber: number
}
export interface PdfArray extends PdfObject {
  size(): number
  get(index: number): PdfObject
  asArray(): PdfObject[]
}
export interface PdfDict extends PdfObject {
  get(key: PdfName): PdfObject | undefined
  entries(): [PdfName, PdfObject][]
}
/** a stream as the layer holds one: its dictionary and its contents decoded (`getContents`) */
export interface PdfStream extends PdfObject {
  readonly dict: PdfDict
  getContents(): Uint8Array
}
/** a stream as it stands in the file: its dictionary and its bytes, not decoded */
export interface PdfRawStream extends PdfObject {
  readonly dict: PdfDict
  readonly contents: Uint8Array
}
/** a page's dictionary in the layer's page tree: its own entries, its resources inherited or its own */
export interface PdfPageLeaf extends PdfDict {
  Resources(): PdfDict | undefined
}
export interface PdfPage {
  readonly node: PdfPageLeaf
  readonly ref: PdfRef
}
/** a document's objects as the layer holds them: its trailer's entries, any object by reference, its largest object number */
export interface PdfContext {
  readonly trailerInfo: { Root?: PdfObject; Encrypt?: PdfObject; Info?: PdfObject; ID?: PdfObject }
  readonly largestObjectNumber: number
  lookup(ref: PdfObject | undefined): PdfObject | undefined
  /** every indirect object, by its ref (a test's reading of the whole document: tests/pdf-reader/helpers/lex-compare.ts) */
  enumerateIndirectObjects(): [PdfRef, PdfObject][]
}
export interface PdfDocument {
  readonly context: PdfContext
  getPages(): PdfPage[]
}
/** the layer's parser of one object's syntax: its public reading (xref.mjs reaches three protected members of it, by a cast
 *  that names each) */
export interface PdfObjectParser {
  parseObject(): PdfObject
}
/** a stream's filters run by the layer (PDF.js's DecodeStream, ported): its bytes a chunk at a time, read again from the start */
export interface PdfDecodeStream {
  getBytes(length?: number): Uint8Array | Uint8ClampedArray
  reset(): void
  /** its bytes decoded whole (a test's reading: tests/pdf-reader/helpers/lex-compare.ts) */
  decode(): Uint8Array
}
/** a class of the layer as the engine meets it: its instances told by `instanceof`, narrowed by its prototype (the layer's
 *  constructors are private, so no construct signature describes them; a function is what `instanceof` takes on its right) */
// biome-ignore lint/complexity/noBannedTypes: a class of the layer is a Function, and instanceof takes nothing narrower
export interface PdfClass<T> extends Function {
  readonly prototype: T
}
/** the PDF object layer's exports the engine reads (@cantoo/pdf-lib, given by the host), and its tests: its public surface,
 *  so that the module itself is one */
export interface PdfLib {
  PDFName: PdfClass<PdfName> & { of(name: string): PdfName }
  PDFNumber: PdfClass<PdfNumber>
  PDFRef: PdfClass<PdfRef> & { of(objectNumber: number, generationNumber?: number): PdfRef }
  PDFArray: PdfClass<PdfArray>
  PDFDict: PdfClass<PdfDict>
  PDFStream: PdfClass<PdfStream>
  PDFRawStream: PdfClass<PdfRawStream> & { of(dict: PdfDict, contents: Uint8Array): PdfRawStream }
  PDFBool: { readonly False: PdfObject }
  PDFContext: { create(): PdfContext }
  PDFObjectParser: { forBytes(bytes: Uint8Array, context: PdfContext): PdfObjectParser }
  PDFDocument: {
    load(
      bytes: Uint8Array,
      options: {
        ignoreEncryption?: boolean
        updateMetadata?: boolean
        throwOnInvalidObject?: boolean
        parseSpeed?: number
      },
    ): Promise<PdfDocument>
  }
  ParseSpeeds: { readonly Fastest: number }
  decodePDFRawStream(stream: PdfRawStream): PdfDecodeStream
}
/** the operators a page's walk may visit, its forms' as often as they are painted; past it the page is refused */
export const WALK_MAX = remove_js.WALK_MAX as number
/** PDF.js's operator list of a page, as the remover reads it */
export interface OpList {
  fnArray: ArrayLike<number>
  argsArray: ArrayLike<unknown>
}
/** what alignPage reads of a page's operator list (alignOf): each text-showing operation's glyph codes outside an annotation
 *  (null: a glyph with no code, not compared; -1: one that is not a code, equal to none), and the paths it constructs */
export interface AlignFacts {
  codes: (number | null)[][]
  paths: number
  /** the images the page paints (PDF.js's image operations, their repeats and groups counted one an image) */
  images: number
}
/** a page's alignment facts from PDF.js's operator list (pure): the page aligns by them exactly as by the list */
export const alignOf = remove_js.alignOf as (OPS: Record<string, number>, opList: OpList) => AlignFacts
/** alignOf as a reader of the list in pieces, each after the one before, then alignOf's facts (`end`) */
export const alignReader = remove_js.alignReader as (OPS: Record<string, number>) => OpsReader<AlignFacts>
export interface Remover {
  numPages: number
  encrypted: boolean
  /** a page against PDF.js's reading of it: its alignment facts, or (OPS, opList) the list itself; any difference refuses the page */
  alignPage(pageIndex: number, facts: AlignFacts): { ok: boolean; why: string[] }
  alignPage(pageIndex: number, OPS: Record<string, number>, opList: OpList): { ok: boolean; why: string[] }
  /** a page walked: what could not be walked (`problems`, any one refuses the page) and the operators visited */
  walkPage(pageIndex: number): {
    problems: string[]
    walked: number
    held: number
    bytes: number
    events: { kind: string; codes?: unknown[] }[]
  }
  /** the decoded streams and the fonts read let go (a remover kept across asks holds the object layer's parse alone) */
  release(): void
}
export const openRemover = remove_js.openRemover as (
  bytes: Uint8Array,
  o: {
    PL: PdfLib
    inflate?: ((bytes: Uint8Array, limit: number) => Uint8Array) | null
    walkMax?: number
    heldMax?: number
    bytesMax?: number
  },
) => Promise<Remover>
