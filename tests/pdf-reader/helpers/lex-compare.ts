import { inflateSync } from 'node:zlib'
import { lex, type PdfLib } from '@/pdf-reader/engine/layout/remove.mjs'
import { lexReference } from './lex-reference.mjs'

// The lexer held to the reference (lex-reference.mjs, the lexer of 42bf0cf7): where the two first part on a stream, and every
// stream of a PDF decoded, the content streams told from the rest (tests/pdf-reader/layout-lex.test.ts).

/** a lexer's operators and `bytes` */
type Lexed = { op: string; args: unknown[]; s: number; e: number }[] & { bytes: number }

/** where two lexed values first differ (a path into them), or null where they are the same: numbers by Object.is (-0 is not 0),
 *  bytes byte for byte, arrays and objects by their entries in order, each entry's key and value */
export function lexedDiff(a: unknown, b: unknown, at = ''): string | null {
  if (typeof a === 'number' || typeof b === 'number') return typeof a === 'number' && typeof b === 'number' && Object.is(a, b) ? null : `${at}: ${String(a)} against ${String(b)}`
  if (a === b) return null
  if (a instanceof Uint8Array || b instanceof Uint8Array) {
    if (!(a instanceof Uint8Array && b instanceof Uint8Array) || a.length !== b.length) return `${at}: bytes of another length`
    for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return `${at}[${k}]: byte ${a[k]} against ${b[k]}`
    return null
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!(Array.isArray(a) && Array.isArray(b)) || a.length !== b.length) return `${at}: arrays of another length`
    for (let k = 0; k < a.length; k++) { const d = lexedDiff(a[k], b[k], `${at}[${k}]`); if (d) return d }
    return null
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b)
    if (ka.join() !== kb.join()) return `${at}: keys ${ka.join()} against ${kb.join()}`
    for (const k of ka) { const d = lexedDiff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${at}.${k}`); if (d) return d }
    return null
  }
  return `${at}: ${String(a)} against ${String(b)}`
}

/** the outcome of a lexer on a stream, comparable: its operators and `bytes`, or what it threw (its class and message) */
export function outcomeOf(f: () => Lexed): { ops: Lexed[number][]; bytes: number } | { threw: string } {
  try { const ops = f(); return { ops: [...ops], bytes: ops.bytes } } catch (e) { return { threw: `${(e as Error)?.constructor?.name}: ${(e as Error)?.message}` } }
}

/** the operators the remover's walk keeps (remove.mjs WALK_OPS) */
export const WALK_KEEP = new Set(['q', 'Q', 'Tf', 'Tc', 'Tw', 'Tr', 'gs', 'Do', 'Tj', 'TJ', "'", '"', 'BI', 'sh', 'S', 's', 'f', 'F', 'f*', 'B', 'B*', 'b', 'b*', 'n'])

/**
 * Every stream of a PDF decoded, each with its kind: `content` (a page's /Contents, a form XObject, a tiling pattern, a Type 3
 * glyph's procedure: what the remover lexes) or `other` (a font, an image, anything else: bytes no content stream holds, lexed
 * as fuzz), the decoded bytes at most `max`. `PL` @cantoo/pdf-lib's exports. A stream its filters cannot decode is passed over
 */
export async function streamsOf(bytes: Uint8Array, PL: PdfLib, max = 32 * 2 ** 20): Promise<{ kind: 'content' | 'other'; bytes: Uint8Array }[]> {
  const { PDFDocument, PDFName, PDFRef, PDFArray, PDFDict, PDFRawStream, decodePDFRawStream, ParseSpeeds } = PL
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false, parseSpeed: ParseSpeeds.Fastest })
  const ctx = doc.context
  const look = (v: unknown) => (v instanceof PDFRef ? ctx.lookup(v) : v)
  const contents = new Set<unknown>()
  for (const page of doc.getPages()) {
    const c = page.node.get(PDFName.of('Contents'))
    for (const r of look(c) instanceof PDFArray ? (look(c) as { asArray(): unknown[] }).asArray() : [c]) contents.add(look(r))
  }
  const procs = new Set<unknown>()
  const out: { kind: 'content' | 'other'; bytes: Uint8Array }[] = []
  const all = ctx.enumerateIndirectObjects() as [unknown, unknown][]
  for (const [, o] of all) {
    const d = o instanceof PDFDict ? (o as { get(k: unknown): unknown }) : null
    const cp = d ? look(d.get(PDFName.of('CharProcs'))) : null
    if (cp instanceof PDFDict) for (const [, v] of (cp as { entries(): [unknown, unknown][] }).entries()) procs.add(look(v))
  }
  for (const [, o] of all) {
    if (!(o instanceof PDFRawStream)) continue
    const dict = (o as { dict: { get(n: unknown): unknown } }).dict
    const name = (k: string) => String(look(dict.get(PDFName.of(k))) ?? '')
    const content = contents.has(o) || procs.has(o) || name('Subtype') === '/Form' || name('PatternType') === '1'
    let data: Uint8Array | null = null
    try { data = decodePDFRawStream(o).decode() } catch {
      try { data = new Uint8Array(inflateSync((o as { contents: Uint8Array }).contents, { maxOutputLength: max + 1 })) } catch { data = null }
    }
    if (data && data.length <= max) out.push({ kind: content ? 'content' : 'other', bytes: data })
  }
  return out
}

/**
 * Where the lexer and the reference first part on stream `b` (null: nowhere): every operator and operand, `bytes`, and the
 * refusal, read whole (no limit, every operator), as the walk reads it (WALK_KEEP) and the proof does (every operator), and under
 * each of `limits` (LexLimit thrown at the same token or by neither)
 */
export function lexDifference(b: Uint8Array, limits: readonly number[] = []): string | null {
  const cases: [string, number, Set<string> | null][] = [['whole', Infinity, null], ['walk', Infinity, WALK_KEEP]]
  for (const l of limits) cases.push([`limit ${l}`, l, null], [`walk, limit ${l}`, l, WALK_KEEP])
  for (const [name, limit, keep] of cases) {
    const d = lexedDiff(outcomeOf(() => lex(b, limit, keep)), outcomeOf(() => lexReference(b, limit, keep)))
    if (d) return `${name}${d}`
  }
  return null
}
