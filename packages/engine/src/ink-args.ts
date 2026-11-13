// PDF.js's values as the ink walk reads them (ink.ts). Two kinds, and nothing else: readers, each giving a typed value, or none (null) where the value is not of that shape, exactly as the read it replaced
// gave it; and the library's contract, the types PDF.js writes its values in, each stated once here with the line of pdfjs-dist
// 6.3.289 that writes it and received as that type where it enters, with no check (a value PDF.js never writes is no input the
// walk models). Lines: legacy/build/pdf.mjs (the display side: Node's, and the browser's build/pdf.mjs from the same source) and
// legacy/build/pdf.worker.mjs. Pure, and imports only the engine's shared reads (bounded-reads.ts, a leaf): the maker runs the
// walk in a Worker or in Node alike, and the reader's view bundles it.

import { at } from './bounded-reads.ts'

/** a value as a property key, as a read by it takes it (ToPropertyKey: a symbol as it is, anything else its string) */
const keyOf = (k: unknown): PropertyKey => (typeof k === 'symbol' ? k : String(k))

/** a value's length as a comparison of it with a number reads it (`v.length >= n`: the number it holds, NaN for none) */
export const lengthOf = (v: unknown): number => Number(at(v, 'length'))

/** a value's own list, where it is an array (Array.isArray's, as a list of values of any kind rather than the lib's any[]);
 *  else null */
export const listOf = (v: unknown): readonly unknown[] | null => (Array.isArray(v) ? v : null)

/** a matrix's six numbers */
export type Matrix = readonly [number, number, number, number, number, number]
/** the six numbers of an argument that is an object holding six or more (an array, a typed array: `v.length >= 6`), each a
 *  number; else null */
export function sixOf(v: unknown): Matrix | null {
  if (!v || typeof v !== 'object' || !(lengthOf(v) >= 6)) return null
  const a = at(v, 0),
    b = at(v, 1),
    c = at(v, 2),
    d = at(v, 3),
    e = at(v, 4),
    f = at(v, 5)
  return typeof a === 'number' &&
    typeof b === 'number' &&
    typeof c === 'number' &&
    typeof d === 'number' &&
    typeof e === 'number' &&
    typeof f === 'number'
    ? [a, b, c, d, e, f]
    : null
}

/** the first four entries of an argument that holds four or more (`v && v.length >= 4`: a form's bbox, an annotation's rect, a
 *  group's bbox), each as it stands (its reader takes it by num); else null */
export function fourOf(v: unknown): readonly [unknown, unknown, unknown, unknown] | null {
  return v && lengthOf(v) >= 4 ? [at(v, 0), at(v, 1), at(v, 2), at(v, 3)] : null
}

/** a box's four numbers, x0, y0, x1, y1 (a figure's extent grows in place: pageInk's `figures`) */
export type Box4 = [number, number, number, number]
/** a path's box as constructPath gives it (its minMax), where the argument holds four finite numbers (`mm && mm.length >= 4`,
 *  each finite); else null */
export function minMaxOf(v: unknown): Box4 | null {
  if (!(v && lengthOf(v) >= 4)) return null
  const a = at(v, 0),
    b = at(v, 1),
    c = at(v, 2),
    d = at(v, 3)
  return typeof a === 'number' &&
    Number.isFinite(a) &&
    typeof b === 'number' &&
    Number.isFinite(b) &&
    typeof c === 'number' &&
    Number.isFinite(c) &&
    typeof d === 'number' &&
    Number.isFinite(d)
    ? [a, b, c, d]
    : null
}

/** a path's data (PDF.js's DrawOPS: an operation's code, then its points' numbers), read entry by entry */
export interface PathData {
  /** its length, as `typeof data.length === 'number'` held it */
  readonly length: number
  /** its entry at `i`: a number, as PDF.js writes each (the library's contract: constructPath's data a Float32Array,
   *  pdf.worker.mjs:41738; a Type 3 bitmap's path, 23516; a glyph's outline a Float16Array or a Float32Array, pdf.mjs:15044-15049);
   *  past its end NaN, where its reader read undefined (each read past the end is a coordinate, which the reader takes by
   *  arithmetic or Number.isFinite alone: NaN and undefined alike not finite) */
  at(i: number): number
}
/** a path's data where the argument is one: a value with a length that is a number; else null */
export function pathOf(v: unknown): PathData | null {
  if (!v) return null
  const n = at(v, 'length')
  if (typeof n !== 'number') return null
  return { length: n, at: (i) => (i < n ? (at(v, i) as number) : Number.NaN) }
}

/** an operator's arguments as PDF.js writes them: OperatorList.addOp pushes its `args` as given (NullOptimizer.push,
 *  pdf.worker.mjs:11590-11594), an array, or none for an operator of none (`addOp(OPS.save)`, 11711), read as []. The library's
 *  contract */
export const argsOf = (v: unknown): readonly unknown[] => (v ?? []) as readonly unknown[]

/** a font's id as setFont's argument gives it: its loadedName, a string (the operator, pdf.worker.mjs:41394; an ExtGState's
 *  Font, 40901). The library's contract */
export const fontIdOf = (v: unknown): string => v as string

/** an ExtGState's entries as setGState's argument gives them: each its key and its value (gStateObj, pdf.worker.mjs:40874-40927);
 *  [] where the argument is no array, as its reader read it. The library's contract */
export const gstateOf = (v: unknown): readonly [string, unknown][] => (listOf(v) ?? []) as readonly [string, unknown][]

/** a font as a page's common objects give it: a FontFaceObject (pdf.mjs:14538; resolved under its id, 23246-23253), whose getters
 *  give its FontInfo's fields (14809-14920). The library's contract, field by field */
export interface PdfFont {
  /** its PostScript name: FontInfo#readString(3) (pdf.mjs:14916; the FontFaceObject's getter, 14663) */
  readonly name: string
  /** its id among the common objects: FontInfo#readString(1) (14910; 14657) */
  readonly loadedName: string
  /** FontInfo#readBoolean(5), undefined where the worker set none (14844, 14822-14828; 14624) */
  readonly isType3Font: boolean | undefined
  /** FontInfo#readBoolean(9) (14856; 14636) */
  readonly vertical: boolean | undefined
  /** FontInfo#readBoolean(4) (14841; 14621) */
  readonly isInvalidPDFjsFont: boolean | undefined
  /** FontInfo#readNumber(0), a float64 (14863, 14859-14862; 14639) */
  readonly ascent: number
  /** FontInfo#readNumber(2), a float64 (14869; 14645) */
  readonly descent: number
  /** FontInfo#readArray: six float64s, undefined for none (14889, 14872-14885; 14651) */
  readonly fontMatrix: readonly number[] | undefined
  /** FontInfo#readArray: three int16s, undefined for none (14892; 14678) */
  readonly defaultVMetrics: readonly number[] | undefined
  /** a Type 3 font's procedures (the FontFaceObject's own, 14544-14546): read by procOf alone */
  readonly charProcOperatorList?: unknown
}
/** a font among a page's common objects: an object there is a font (an error font is resolved as its message, a string:
 *  pdf.mjs:23239-23242). The library's contract */
export const fontView = (f: object): PdfFont => f as PdfFont

/** a glyph of a shown array as PDF.js writes it: the worker's Glyph (pdf.worker.mjs:32428-32439), made by Font._charToGlyph
 *  (34818-34882). The library's contract, field by field */
export interface PdfGlyph {
  /** a string: the font's ToUnicode of the code, else the code's character (34838-34841) */
  readonly unicode: string
  /** a string: the code's character in the font's own encoding, '' where it maps to none, as a Type 3 glyph's name (34868-34874) */
  readonly fontChar: string
  /** a number: the font's width of the code, else its default width (34828-34831) */
  readonly width: number
  /** its vertical metrics, the font's of the code or its default, undefined for none (34835) */
  readonly vmetric: readonly number[] | undefined
  /** a Type 3 glyph's procedure's id, its name or else its code; undefined for any other font's (34853-34855) */
  readonly operatorListId: string | number | undefined
  /** whether it is shown as a word space: handleText's (40841) charsToGlyphs, the constructor's argument (32437) */
  readonly isSpace: boolean
}
/** a shown array as showText's argument gives it: handleText's glyphs (pdf.worker.mjs:40839-40850) and, from TJ, the numbers
 *  between them (41424-41439); null where the argument is no array. The library's contract */
export const shownOf = (v: unknown): readonly (number | PdfGlyph)[] | null =>
  listOf(v) as readonly (number | PdfGlyph)[] | null

/** a Type 3 glyph's procedure: its operator list as OperatorList.getIR gives it (pdf.worker.mjs:11749-11754) */
export interface PdfProc {
  readonly fnArray: readonly number[]
  readonly argsArray: readonly unknown[]
}
/** a Type 3 glyph's procedure by its font's table and the glyph's id: the table's entry where it is a Map (the worker's,
 *  pdf.worker.mjs:43609-43641), else its property of that name; none where it holds none. The library's contract */
export function procOf(font: PdfFont, id: unknown): PdfProc | undefined {
  const procs = font.charProcOperatorList
  return (procs instanceof Map ? procs.get(id) : at(procs, keyOf(id))) as PdfProc | undefined
}
