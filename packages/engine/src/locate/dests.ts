// Every destination A's links name, resolved on A at the prepare (link previews, docs/PDF-READER.md §20.1): each key as
// Link.to.dest writes it (annotations.ts annotationOf: PDF.js's dest as JSON, a name or an explicit array) to the page it names
// and the point there. A destination is a point (`XYZ`) or a fit, never a box: what it lands on is the unit at that point
// (targets.ts). Read through A's own document, opened once for this alone and let go: its names tree and the pages' references,
// no page parsed. Declared here, not in read.ts, which the compile side's bundle reads (the instrument's key: a change there
// would compile every paper again).
import type { PdfJs } from '../read.ts'
import { annotationOf } from './annotations.ts'

/** a destination resolved on A: its page (1-based) and the point it names, PDF units, y up (null where its fit names none:
 *  Fit and FitB name neither; FitH and FitBH a top alone; FitV and FitBV a left alone; FitR its left and top) */
export interface DestPoint {
  page: number
  x: number | null
  y: number | null
}
/** what this module reads of a PDF.js document beyond read.ts's PdfDocument */
export interface DestDocument {
  getDestination(id: string): Promise<unknown[] | null>
  getPageIndex(ref: unknown): Promise<number>
  destroy?(): Promise<void>
}

/** a document that reads destinations (PDF.js's PDFDocumentProxy does) */
function isDestDocument(d: unknown): d is DestDocument {
  const o = d as Partial<DestDocument> | null
  return typeof o?.getDestination === 'function' && typeof o.getPageIndex === 'function'
}

/** the keys of A's link annotations (annotationOf's `to.dest`), every page's, each once */
export function destKeysOf(annotations: readonly (readonly unknown[] | null)[]): Set<string> {
  const keys = new Set<string>()
  for (const page of annotations)
    for (const an of page ?? []) {
      const a = annotationOf(an as Parameters<typeof annotationOf>[0])
      if (a && 'dest' in a.to) keys.add(a.to.dest)
    }
  return keys
}

/** a number of a destination's array, null where it is none (PDF's null: that side kept as it is) */
const numOf = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** the point an explicit destination's fit names (PDF 32000-1:2008 12.3.2.2, Table 151), undefined for no fit of the table */
function pointOf(fit: unknown, args: readonly unknown[]): { x: number | null; y: number | null } | undefined {
  const name = typeof fit === 'object' && fit !== null && 'name' in fit ? (fit as { name: unknown }).name : null
  switch (name) {
    case 'XYZ':
      return { x: numOf(args[0]), y: numOf(args[1]) }
    case 'Fit':
    case 'FitB':
      return { x: null, y: null }
    case 'FitH':
    case 'FitBH':
      return { x: null, y: numOf(args[0]) }
    case 'FitV':
    case 'FitBV':
      return { x: numOf(args[0]), y: null }
    case 'FitR':
      // ([left bottom right top]: its top-left corner)
      return { x: numOf(args[0]), y: numOf(args[3]) }
    default:
      return undefined
  }
}

/** one key resolved: its explicit array (the key's own, or the named destination's), its page by its reference (or a page index,
 *  as some writers give one), its point; null where any of it is not there */
async function resolve(doc: DestDocument, key: string): Promise<DestPoint | null> {
  let dest: unknown
  try {
    dest = JSON.parse(key)
  } catch {
    return null
  }
  if (typeof dest === 'string') dest = await doc.getDestination(dest).catch(() => null)
  if (!Array.isArray(dest)) return null
  const [at, fit, ...args] = dest as unknown[]
  const point = pointOf(fit, args)
  if (!point) return null
  const index =
    typeof at === 'number'
      ? at
      : typeof at === 'object' && at !== null
        ? await doc.getPageIndex(at).catch(() => null)
        : null
  if (index === null || !Number.isInteger(index) || index < 0) return null
  return { page: index + 1, ...point }
}

/** each key (Link.to.dest as the engine writes it) resolved through A's own document, opened once for this alone and let go;
 *  null where it resolves to nothing (a name A lacks, a page that is not A's, a fit the table does not name). No key, no open */
export async function destinationsOf(
  pdfjs: PdfJs,
  bytes: Uint8Array,
  keys: ReadonlySet<string>,
  options: Record<string, unknown> = {},
): Promise<Map<string, DestPoint | null>> {
  const out = new Map<string, DestPoint | null>()
  if (!keys.size) return out
  const task = pdfjs.getDocument({ ...options, data: bytes.slice() })
  try {
    const doc: unknown = await task.promise
    // (a key PDF.js cannot answer is none: a destination is never the paper's failure; a document that reads no destination
    // answers none)
    for (const key of keys) out.set(key, isDestDocument(doc) ? await resolve(doc, key).catch(() => null) : null)
  } finally {
    await task.destroy().catch(() => {})
  }
  return out
}
