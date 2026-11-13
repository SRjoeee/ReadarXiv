// @vitest-environment node
import * as PL from '@cantoo/pdf-lib'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { alignOf, alignReader, lex, openRemover } from '@readarxiv/engine'
import { lexedDiff, outcomeOf, streamsOf, WALK_KEEP } from './helpers/lex-compare'
import { DOCUMENT_OPTIONS } from './helpers/ocg-pdfs'
import {
  alignOf as alignOfBefore,
  alignReader as alignReaderBefore,
  lex as lexBefore,
  openRemover as openRemoverBefore,
} from './helpers/remove-before.mjs'

// The remover's lexer and page walk state their bounds and tell an operand by its kind before they read a property of it
// (packages/engine/src/remove.mjs: an escape at a string's last byte, an octal escape's digits past the end, an inline image's
// `ID` two bytes from the end; a name read of Tf's, gs's and Do's operand, a show's elements, a width no number, a /Contents that
// is no stream), where they read past an end or a property of a number and relied on undefined. Held here to the remover before
// that change (helpers/remove-before.mjs, d42fb8bca verbatim), value for value and error for error: on hand cases at each edge,
// on seeded random streams, and on every stream and every page of the repository's PDFs. And the alignment facts' reader
// (alignReader), which reads PDF.js's operator list and reads each argument through `at` (`x?.[k]` told by its kind before the
// read): held to the one before on every page of the repository's PDFs through PDF.js's own lists, and on seeded synthetic lists
// of every shape an argument may take, whole and in pieces.

const enc = (s: string) => new Uint8Array(Buffer.from(s, 'latin1'))
/** a seeded generator (mulberry32): the same streams on every run */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** where the lexer and the one before first part on `b` (null: nowhere): read whole, as the walk reads it, and under `limits` */
function lexDifference(b: Uint8Array, limits: readonly number[] = []): string | null {
  const cases: [string, number, Set<string> | null][] = [['whole', Infinity, null], ['walk', Infinity, WALK_KEEP]]
  for (const l of limits) cases.push([`limit ${l}`, l, null], [`walk, limit ${l}`, l, WALK_KEEP])
  for (const [name, limit, keep] of cases) {
    const d = lexedDiff(outcomeOf(() => lex(b, limit, keep)), outcomeOf(() => lexBefore(b, limit, keep)))
    if (d) return `${name}${d}`
  }
  return null
}

type Rec = Record<string, unknown>
/** a font as the walk read it, comparable: its fields and its widths of codes 0 to 299 */
const fontOf = (f: unknown) => {
  if (!f) return f
  const r = f as Rec
  const width = r.width as ((code: number) => number) | null
  return { sub: r.sub, type3: r.type3, bytes: r.bytes, ranges: r.ranges, vertical: r.vertical, refused: r.refused, unicode: r.unicode, widths: width ? Array.from({ length: 300 }, (_, c) => width(c)) : null }
}
const keyOf = (c: unknown) => (c ? (c as Rec).key : null)
/** a container as the walk read it, comparable (its objects are another document's: their keys, not themselves) */
const containerOf = (c: Rec) => ({
  kind: c.kind, key: c.key, name: c.name, depth: c.depth, ownRes: c.ownRes, parent: keyOf(c.parent),
  ops: (c.ops as { op: string; args: unknown[]; s: number; e: number }[][]).map(os => os.map(o => [o.op, o.s, o.e, o.args])),
})
/** a page walked, comparable: its problems and counts, its containers, its events with their state, and its forms' uses */
function walkOf(w: unknown) {
  const r = w as Rec
  return {
    problems: r.problems, walked: r.walked, held: r.held, bytes: r.bytes,
    containers: (r.containers as Rec[]).map(containerOf),
    events: (r.events as Rec[]).map(e => {
      const state = e.state as Rec | undefined
      return { kind: e.kind, cont: keyOf(e.cont), pi: e.pi, oi: e.oi, codes: e.codes, sh: e.sh, child: keyOf(e.child), state: state && { size: state.size, Tc: state.Tc, Tw: state.Tw, Tr: state.Tr, font: fontOf(state.font) } }
    }),
    uses: [...(r.uses as Map<unknown, number>).values()],
  }
}
const thrown = (e: unknown) => ({ threw: `${(e as Error)?.constructor?.name}: ${(e as Error)?.message}` })
/** every page of a PDF walked by the remover and by the one before, and each walk's outcome: where they first part */
async function walkDifference(pdf: Uint8Array): Promise<string | null> {
  const now = await openRemover(pdf, { PL: PL as never })
  const before = await openRemoverBefore(pdf, { PL })
  if (now.numPages !== before.numPages) return 'pages'
  for (let p = 0; p < now.numPages; p++) {
    let a: unknown, b: unknown
    try { a = walkOf(now.walkPage(p)) } catch (e) { a = thrown(e) }
    try { b = walkOf(before.walkPage(p)) } catch (e) { b = thrown(e) }
    const d = lexedDiff(a, b)
    if (d) return `page ${p + 1}${d}`
  }
  return null
}

/** a PDF of one page, `content` its stream, with resources (`res`): a Type 1 font whose second width is no number, a graphics
 *  state that sets it, and a form that shows with it; or none */
function pagePdf(content: string, { res = true, contents = '6 0 R' } = {}): Uint8Array {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300]${res ? ' /Resources << /Font << /F1 4 0 R >> /ExtGState << /G1 5 0 R >> /XObject << /X1 7 0 R >> >>' : ''} /Contents ${contents} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /FirstChar 97 /Widths [500 /X 600] >>',
    '<< /Type /ExtGState /Font [4 0 R 9] >>',
    ['', content],
    ['/Type /XObject /Subtype /Form /BBox [0 0 10 10] /Resources << /Font << /F1 4 0 R >> >>', '/F1 1 Tf (b) Tj 5 Tf (c) Tj'],
    '<< /Not /AStream >>',
  ] as (string | [string, string])[]
  let out = '%PDF-1.7\n'
  const offsets: number[] = []
  objects.forEach((o, i) => {
    offsets.push(out.length)
    out += Array.isArray(o) ? `${i + 1} 0 obj\n<< ${o[0]} /Length ${o[1].length} >>\nstream\n${o[1]}\nendstream\nendobj\n` : `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const at = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f\r\n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n\r\n`).join('')}`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${at}\n%%EOF\n`
  return enc(out)
}

describe('the lexer reads every stream as it did before it stated its bounds', () => {
  const EDGES = [
    // a token ending at the stream's last byte
    '/F1', '12', '-.5', 'Tj', '(abc)', '<41>', '<41', '[1 2]', '<< /A 1 >>', 'true', '%c', '(', ')', '\\',
    // an escape at a string's last byte, an octal escape at the end, and its digits up to the end
    '(a\\', '(\\', '(a\\1', '(a\\12', '(a\\123', '(a\\1234)', '(\\7', '(\\77', '(\\777)', '(\\8)', '(\\08)', '(a\\\r', '(a\\\r\n', '(a\\\n', '(\\\\',
    // an inline image's ID at the end, one and two bytes before it, and followed by data
    'BI /W 1 ID', 'BI /W 1 ID ', 'BI /W 1 IDx', 'BI /W 1 ID\n', 'BI /W 1 I', 'BI ID', 'BI ID EI', 'BI /W 1 ID xy EI', 'BI /W 1 ID xy EI Q', 'BI /W 1 IDEI', 'BI ID\0', 'BI',
    // malformed arrays and dictionaries
    '[', ']', '[[[', ']]]', '[ (a) 5 [ (b) ] null true << >> /N ] TJ', '[ (a) TJ', '<< [ >> ]', '[ BI ]', '[ /a Tf ]', '<< /A', '>>',
  ]
  it('at each edge: a token, an escape and an inline image at the stream\'s end, malformed arrays', () => {
    for (const s of EDGES) for (const t of [s, `q ${s}`, `${s} Q`, `(x) Tj\n${s}`]) expect(lexDifference(enc(t), [0, 16, 200]), JSON.stringify(t)).toBeNull()
  })
  it('on 4,000 seeded streams of content-stream tokens cut anywhere, and on 1,500 of random bytes', () => {
    const next = rng(2026)
    const pick = <T>(a: readonly T[]) => a[Math.floor(next() * a.length)] as T
    const TOKENS = [...EDGES, '1', '-2.5', '0', 'q', 'Q', 'BT', 'ET', 'Tf', 'Tj', 'TJ', 'gs', 'Do', 'cm', 're', 'f', '(\\101)', '(\\1)', '(a\\nb)', '/G1', '/X1', 'EI', 'ID', '<<', '>>', '%x\n']
    const WS = [' ', '\n', '\r\n', '\t', '\0', '']
    for (let n = 0; n < 4000; n++) {
      let s = ''
      for (let k = 1 + Math.floor(next() * 40); k > 0; k--) s += pick(TOKENS) + pick(WS)
      const b = enc(s).subarray(0, Math.floor(next() * (s.length + 1)))
      expect(lexDifference(b, [Math.floor(next() * 3000)]), JSON.stringify(Buffer.from(b).toString('latin1'))).toBeNull()
    }
    for (let n = 0; n < 1500; n++) {
      const b = new Uint8Array(Math.floor(next() * 600))
      for (let k = 0; k < b.length; k++) b[k] = next() < 0.3 ? pick([40, 41, 92, 48, 55, 73, 68, 32, 10, 91, 93]) : Math.floor(next() * 256)
      expect(lexDifference(b, [Math.floor(next() * 3000)])).toBeNull()
    }
  })
  it('on every stream of the repository\'s PDFs', async () => {
    const dir = join(process.cwd(), 'tests/fixtures/pdf')
    const pdfs = readdirSync(dir, { recursive: true }).map(String).filter(f => f.endsWith('.pdf'))
    expect(pdfs.length).toBeGreaterThan(3)
    let streams = 0
    for (const f of pdfs) for (const s of await streamsOf(new Uint8Array(readFileSync(join(dir, f))), PL)) {
      streams++
      expect(lexDifference(s.bytes), `${f}: a ${s.kind} stream`).toBeNull()
    }
    expect(streams).toBeGreaterThan(20)
  })
})

describe('the page walk reads every page as it did before it told an operand by its kind', () => {
  const PAGES = [
    '/F1 12 Tf (abc) Tj', 'BT /F1 12 Tf [(a) -20 (bc)] TJ ET', '/F1 12 Tf 1 2 (a) "', '/F1 12 Tf 1 2 3 "', "/F1 12 Tf (a) '", "/F1 12 Tf 5 '",
    // a numeric operand, and every other kind, where a name is read (a resource dictionary to read it in, and none)
    '5 Tf (a) Tj', '(F1) 12 Tf (a) Tj', '<< /A 1 >> 12 Tf', '[/F1] 12 Tf', 'Tf', '12 Tf', 'null Tf', 'true Tf',
    '5 gs (a) Tj', '/G1 gs (a) Tj', '<< >> gs', 'gs', '(G1) gs',
    '5 Do', '/X1 Do', '(X1) Do', '[/X1] Do', 'Do', '<< /X 1 >> Do', '/X1 Do /X1 Do',
    // a show's elements of every kind, and malformed arrays
    '/F1 12 Tf [(a) 5 [(b)] null true << >> /N] TJ', '/F1 12 Tf 5 TJ', '/F1 12 Tf (a) TJ', '/F1 12 Tf [] TJ', '/F1 12 Tf [ (a) TJ', '/F1 12 Tf [<616263> (\\142)] TJ',
    // a width that is no number (the font's /Widths [500 /X 600]: b's)
    '/F1 12 Tf (abcd) Tj', '/G1 gs (bb) Tj',
    // the lexer's edges in a page
    '/F1 12 Tf (a\\', '/F1 12 Tf (a\\12', 'BI /W 1 ID', 'q 0 0 1 1 re f Q BI /W 1 ID x EI sh',
  ]
  it('on hand cases at each edge, with resources to read the name in and with none', async () => {
    for (const c of PAGES) for (const res of [true, false]) expect(await walkDifference(pagePdf(c, { res })), `${c} (resources: ${res})`).toBeNull()
  })
  it('where /Contents is no stream, or an array holding one that is none', async () => {
    for (const contents of ['8 0 R', '[6 0 R 8 0 R]', '[8 0 R 6 0 R 5]', '5', '<< /A 1 >>']) expect(await walkDifference(pagePdf('/F1 12 Tf (a) Tj', { contents })), contents).toBeNull()
    // (the stream read directly, as the wrap reads one: the same error from both where it is no stream)
    const pdf = pagePdf('(a) Tj')
    const now = await openRemover(pdf, { PL: PL as never }), before = await openRemoverBefore(pdf, { PL })
    for (const n of [4, 5, 6, 8]) {
      const at = (r: { decode(st: never): Uint8Array; ctx: { lookup(v: unknown): unknown } }) => { try { return { bytes: [...r.decode(r.ctx.lookup(PL.PDFRef.of(n)) as never)] } } catch (e) { return thrown(e) } }
      expect(at(now as never), `object ${n}`).toEqual(at(before as never))
    }
  })
  it('on 600 seeded pages of operators and operands of every kind', async () => {
    const next = rng(7)
    const pick = <T>(a: readonly T[]) => a[Math.floor(next() * a.length)] as T
    const OPERANDS = ['/F1', '/G1', '/X1', '/Nope', '5', '-1.5', '(abc)', '(b)', '<6162>', '[(a) 3 (b)]', '[]', '<< /A 1 >>', 'null', 'true', '[/F1]', '[[(a)]]']
    const OPS = ['Tf', 'Tf', 'gs', 'Do', 'Tj', 'TJ', "'", '"', 'Tc', 'Tw', 'Tr', 'q', 'Q', 're', 'f', 'S', 'BT', 'ET', 'sh', 'n']
    for (let n = 0; n < 600; n++) {
      let s = ''
      for (let k = 1 + Math.floor(next() * 12); k > 0; k--) {
        for (let m = Math.floor(next() * 3); m > 0; m--) s += `${pick(OPERANDS)} `
        s += `${pick(OPS)}\n`
      }
      expect(await walkDifference(pagePdf(s, { res: next() < 0.8 })), s).toBeNull()
    }
  }, 60_000)
  it('on every page of the repository\'s PDFs', async () => {
    const dir = join(process.cwd(), 'tests/fixtures/pdf')
    const pdfs = readdirSync(dir, { recursive: true }).map(String).filter(f => f.endsWith('.pdf'))
    expect(pdfs.length).toBeGreaterThan(3)
    for (const f of pdfs) expect(await walkDifference(new Uint8Array(readFileSync(join(dir, f)))), f).toBeNull()
  }, 60_000)
})

describe('the alignment facts\' reader reads every list as it did before it told an argument by its kind', () => {
  type List = { fnArray: number[]; argsArray: unknown[] }
  type Reader = { read(fnArray: ArrayLike<number>, argsArray: ArrayLike<unknown>): void; end(): unknown }
  const O = OPS as unknown as Record<string, number>
  const outcome = (f: () => unknown) => { try { return { facts: f() } } catch (e) { return thrown(e) } }
  /** where the reader and the one before first part on `list` (null: nowhere): read whole (alignOf), and in pieces of `sizes` */
  function alignDifference(list: List, sizes: readonly number[] = [1, 3, 1000]): string | null {
    const d = lexedDiff(outcome(() => alignOf(O, list)), outcome(() => alignOfBefore(O, list)))
    if (d) return `whole${d}`
    const pieces = (r: Reader, size: number) => { for (let i = 0; i < list.fnArray.length; i += size) r.read(list.fnArray.slice(i, i + size), list.argsArray.slice(i, i + size)); return r.end() }
    for (const size of sizes) {
      const e = lexedDiff(outcome(() => pieces(alignReader(O), size)), outcome(() => pieces(alignReaderBefore(O), size)))
      if (e) return `pieces of ${size}${e}`
    }
    return null
  }
  it('on 3,000 seeded lists: groups whose first argument is no array, glyph lists with holes, repeats with short arrays', () => {
    const next = rng(19159)
    const pick = <T>(a: readonly T[]) => a[Math.floor(next() * a.length)] as T
    const anyValue = () => pick<unknown>([undefined, null, 0, 7, 'abc', '', true, false, {}, { length: 3 }, { length: '6' }, [], [1, 2, 3], [1, 2, 3, 4, 5], new Float32Array(4), new Uint8Array(3), new DataView(new ArrayBuffer(4))])
    const glyph = (): unknown => {
      if (next() < 0.15) return pick<unknown>([5, -3.5, null, undefined, 'x', true, [], [1]])
      const g: Rec = { unicode: 'a' }
      if (next() < 0.7) g.originalCharCode = pick<unknown>([0, 65, 255, 65535, 2 ** 32 - 1, 2 ** 32, -1, 1.5, Number.NaN, '65', null, undefined, 2 ** 53])
      return g
    }
    const glyphs = () => {
      const a: unknown[] = []
      for (let k = Math.floor(next() * 6); k > 0; k--) if (next() < 0.2) a.length++; else a.push(glyph())
      if (next() < 0.1) a.length += 2
      return a
    }
    const numbers = () => Array.from({ length: Math.floor(next() * 7) }, () => next())
    const FNS = ['beginAnnotation', 'endAnnotation', 'beginGroup', 'endGroup', 'showText', 'showSpacedText', 'constructPath', 'paintImageXObject', 'paintInlineImageXObject', 'paintImageMaskXObject', 'paintSolidColorImageMask', 'paintImageXObjectRepeat', 'paintImageMaskXObjectRepeat', 'paintImageMaskXObjectGroup', 'paintInlineImageXObjectGroup', 'save', 'restore', 'transform'].map(n => O[n]!)
    const argsOf = (fn: number): unknown => {
      // (an entry that is no array of arguments, as no list of PDF.js's holds)
      if (next() < 0.08) return pick<unknown>([null, undefined, 'abc', 5, {}])
      if (fn === O.beginGroup) return [next() < 0.6 ? { smask: pick<unknown>([null, undefined, false, 0, true, {}, 'x', 1]), bbox: [0, 0, 1, 1] } : next() < 0.5 ? { bbox: [] } : anyValue()]
      if (fn === O.showText || fn === O.showSpacedText) return [next() < 0.85 ? glyphs() : anyValue()]
      if (fn === O.paintImageXObjectRepeat || fn === O.paintImageMaskXObjectRepeat) {
        const a: unknown[] = fn === O.paintImageXObjectRepeat ? ['img', 1, 1] : [{}, 1, 0, 0, 1]
        a.push(next() < 0.7 ? numbers() : anyValue())
        return next() < 0.25 ? a.slice(0, Math.floor(next() * a.length)) : a
      }
      if (fn === O.paintImageMaskXObjectGroup) return [next() < 0.7 ? Array.from({ length: Math.floor(next() * 4) }, () => ({})) : anyValue()]
      if (fn === O.paintInlineImageXObjectGroup) return [{}, next() < 0.7 ? Array.from({ length: Math.floor(next() * 4) }, () => ({})) : anyValue()]
      return next() < 0.5 ? [] : [anyValue()]
    }
    let threw = 0
    for (let n = 0; n < 3000; n++) {
      const fnArray: number[] = [], argsArray: unknown[] = []
      for (let k = 1 + Math.floor(next() * 25); k > 0; k--) { const fn = next() < 0.95 ? pick(FNS) : Math.floor(next() * 100); fnArray.push(fn); argsArray.push(argsOf(fn)) }
      const list = { fnArray, argsArray }
      expect(alignDifference(list), JSON.stringify(list)).toBeNull()
      if ('threw' in outcome(() => alignOfBefore(O, list))) threw++
    }
    // (both refuse a shown argument that is no array alike: the generator meets it)
    expect(threw).toBeGreaterThan(0)
  })
  it('on every page of the repository\'s PDFs, through PDF.js\'s own operator lists', async () => {
    const files = [...readdirSync(join(process.cwd(), 'tests/fixtures/pdf'), { recursive: true }).map(f => join('tests/fixtures/pdf', String(f))), ...['s1-columns', 's2-splits', 's3-turned'].map(s => `packages/reader/e2e/fixtures/${s}/arxiv.pdf`)].filter(f => f.endsWith('.pdf'))
    let pages = 0
    for (const f of files) {
      const task = getDocument({ ...DOCUMENT_OPTIONS, data: new Uint8Array(readFileSync(join(process.cwd(), f))) })
      const doc = await task.promise
      for (let p = 1; p <= doc.numPages; p++) {
        const list = (await (await doc.getPage(p)).getOperatorList()) as unknown as List
        expect(alignDifference({ fnArray: [...list.fnArray], argsArray: [...list.argsArray] }), `${f} page ${p}`).toBeNull()
        pages++
      }
      await task.destroy()
    }
    expect(pages).toBeGreaterThan(20)
  }, 120_000)
})
