import * as PL from '@cantoo/pdf-lib'
import { readFileSync } from 'node:fs'
import { deflateSync, inflateSync } from 'node:zlib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { lex } from '@/pdf-reader/engine/layout/remove.mjs'
import { wrapFinal } from '@/pdf-reader/engine/layout/wrap.mjs'

// The synthetic marked compiles of the per-unit erasure's tests (layout/own.mjs, layout/wrap.mjs; design docs/route/
// ocg-erasure.md §7.2): sample-1's own pages (tests/fixtures/pdf/sample-1, CC0) with points written into their content streams
// as a marked compile writes them, `/axt-<name> ri` between whole operators, so that ownership and the wrap run on real Type 1
// text. Every `every` consecutive text-showing operators of a text object are a unit (its start point before the first, its end
// point after the last); a case may write its own points into a stream instead (`edit`).

export const SAMPLE_1 = new URL('../../fixtures/pdf/sample-1/sample-1.pdf', import.meta.url)
const enc = (s: string) => Uint8Array.from(s, c => c.charCodeAt(0) & 255)
const latin = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192)); return s }
const SHOWS = new Set(['Tj', 'TJ', "'", '"'])

/** a page's decoded content (its streams joined) */
async function contentOf(doc: PL.PDFDocument, i: number) {
  const node = doc.getPages()[i]!.node
  const c = node.get(PL.PDFName.of('Contents'))
  const look = (v: unknown) => (v instanceof PL.PDFRef ? doc.context.lookup(v) : v)
  const list = look(c) instanceof PL.PDFArray ? (look(c) as PL.PDFArray).asArray() : [c]
  return list.map(r => { const st = look(r) as PL.PDFRawStream; return latin(PL.decodePDFRawStream(st).decode()) }).join('\n')
}

/** a stream with points: `every` consecutive shows of one text object a unit (ids from `first`), each its `s` and `e` point */
export function markShows(text: string, { every = 3, first = 0 } = {}) {
  const ops = lex(enc(text)) as { op: string; s: number; e: number }[]
  const inserts: [number, string][] = []
  let id = first, run: { s: number; e: number; n: number } | null = null
  const close = () => { if (run) { inserts.push([run.s, ` /axt-${id}s ri `], [run.e, ` /axt-${id}e ri `]); id++; run = null } }
  for (const o of ops) {
    if (o.op === 'ET' || o.op === 'BT') { close(); continue }
    if (!SHOWS.has(o.op)) continue
    if (!run) run = { s: o.s, e: o.e, n: 0 }
    run.e = o.e
    if (++run.n >= every) close()
  }
  close()
  inserts.sort((a, b) => a[0] - b[0])
  let out = '', at = 0
  for (const [pos, t] of inserts) { out += text.slice(at, pos) + t; at = pos }
  return { text: out + text.slice(at), units: id - first }
}

/** sample-1 with its pages' streams replaced: `edit(text, page)` the page's new content (markShows by default) */
export async function markedSample({ pages = [1, 2, 3, 4], edit = null as null | ((text: string, page: number) => string), every = 3, foreignOC = false, form = null as string | null, type3 = false as boolean | 'noWidths', fonts = null as null | ((ctx: PL.PDFContext) => Record<string, PL.PDFRef>), tweak = null as null | ((doc: PL.PDFDocument) => void | Promise<void>) } = {}) {
  const doc = await PL.PDFDocument.load(readFileSync(SAMPLE_1), { updateMetadata: false })
  let first = 0
  for (const p of pages) {
    const text = await contentOf(doc, p - 1)
    let out: string
    if (edit) out = edit(text, p)
    else { const m = markShows(text, { every, first }); out = m.text; first += m.units }
    // (a stream split at `%SPLIT%` is a /Contents array of its pieces)
    const refs = out.split('%SPLIT%').map(t => doc.context.register(doc.context.flateStream(enc(t))))
    const node = doc.getPages()[p - 1]!.node
    node.set(PL.PDFName.of('Contents'), refs.length === 1 ? refs[0]! : doc.context.obj(refs))
    // (a form XObject /Fx1 of `form`'s content, the page's fonts its resources; a Type 3 font /T3 of rectangle glyphs a..f)
    if (form !== null || type3 || fonts) {
      const ctx = doc.context, res = node.Resources()!
      const fontDict = res.lookup(PL.PDFName.of('Font'), PL.PDFDict)
      if (type3) fontDict.set(PL.PDFName.of('T3'), type3Font(ctx, type3 === 'noWidths'))
      if (fonts) for (const [k, v] of Object.entries(fonts(ctx))) fontDict.set(PL.PDFName.of(k), v)
      if (form !== null) {
        const fx = ctx.register(ctx.flateStream(enc(form), { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 612, 792], Resources: ctx.obj({ Font: fontDict }) }))
        res.set(PL.PDFName.of('XObject'), ctx.obj({ Fx1: fx }))
      }
    }
  }
  if (foreignOC) {
    // a foreign /OCProperties (the paper's own layers): fA ON, fB OFF, named /fA and /fB on every page edited
    const ctx = doc.context, fA = ctx.register(ctx.obj({ Type: 'OCG', Name: PL.PDFString.of('fA') })), fB = ctx.register(ctx.obj({ Type: 'OCG', Name: PL.PDFString.of('fB') }))
    doc.catalog.set(PL.PDFName.of('OCProperties'), ctx.obj({ OCGs: [fA, fB], D: ctx.obj({ BaseState: 'OFF', ON: [fA], OFF: [fB], Order: [fA, fB] }) }))
    for (const p of pages) {
      const node = doc.getPages()[p - 1]!.node, res = node.Resources()!
      res.set(PL.PDFName.of('Properties'), ctx.obj({ fA, fB }))
    }
  }
  // (`tweak`: the document changed by the case before it is written: its own layers, a page's /Properties)
  if (tweak) await tweak(doc)
  return { bytes: new Uint8Array(await doc.save({ useObjectStreams: false })), units: first }
}

export const DOCUMENT_OPTIONS = { verbosity: 0, useSystemFonts: false, isEvalSupported: false, fontExtraProperties: true }
export const deflate = (b: Uint8Array) => new Uint8Array(deflateSync(b, { level: 6 }))
export const inflate = (b: Uint8Array, limit: number) => new Uint8Array(inflateSync(b, { maxOutputLength: limit + 1 }))
/** wrapFinal over bytes, the test's way: no marking's `follows` unless given (`follows: undefined` asks wrapFinal to make it of the units) */
export const wrapped = (bytes: Uint8Array, o: { units?: unknown[] | null; follows?: unknown; texts?: readonly string[] | null; inkless?: readonly string[] | null; names?: readonly string[] | null; bounds?: { groupsPage?: number; sequencesPage?: number; groupsDoc?: number } } = {}) => wrapFinal(bytes, { PL: PL as never, getDocument: getDocument as never, documentOptions: DOCUMENT_OPTIONS, OPS, units: (o.units ?? null) as never, texts: o.texts ?? null, inkless: o.inkless ?? null, names: o.names ?? null, ...('follows' in o ? { follows: o.follows as never } : { follows: null }), deflate, inflate, ...(o.bounds ? { bounds: o.bounds } : {}) } as never)

/** a page rendered by PDF.js in Node at `scale`, groups `off(name)` hidden: its RGBA pixels */
export async function renderPage(bytes: Uint8Array, p: number, { off = null as null | ((name: string) => boolean), scale = 2 } = {}) {
  const task = getDocument({ ...DOCUMENT_OPTIONS, data: bytes.slice(), isImageDecoderSupported: false } as never)
  const doc = await task.promise
  try {
    const page = await doc.getPage(p)
    const vp = page.getViewport({ scale })
    const { canvas, context } = (doc as unknown as { canvasFactory: { create(w: number, h: number): { canvas: { width: number; height: number }; context: CanvasRenderingContext2D } } }).canvasFactory.create(Math.ceil(vp.width), Math.ceil(vp.height))
    const cfg = await doc.getOptionalContentConfig({ intent: 'display' })
    if (off) for (const [id, g] of cfg as unknown as Iterable<[string, { name: string }]>) if (off(g.name)) cfg.setVisibility(id, false)
    await page.render({ canvasContext: context, viewport: vp, canvas, optionalContentConfigPromise: Promise.resolve(cfg) } as never).promise
    return { data: context.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height }
  } finally { await task.destroy() }
}
/** the pixels two renders differ at */
export function pixelsApart(a: { data: Uint8ClampedArray }, b: { data: Uint8ClampedArray }) {
  let n = 0
  for (let i = 0; i < a.data.length; i += 4) if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2] || a.data[i + 3] !== b.data[i + 3]) n++
  return n
}

/** a Type 3 font of rectangle glyphs: codes a to e (d1), f (d0, its own colour), 600 wide */
function type3Font(ctx: PL.PDFContext, noWidths = false) {
  const procs = ctx.obj({})
  const shapes: Record<string, string> = { a: '50 0 400 700 re f', b: '50 0 200 500 re f 300 0 200 700 re f', c: '0 0 500 300 re f', d: '100 100 300 300 re f', e: '0 600 550 80 re f 0 0 80 680 re f' }
  for (const [n, sh] of Object.entries(shapes)) procs.set(PL.PDFName.of(n), ctx.register(ctx.stream(`600 0 0 0 600 700 d1 ${sh}`)))
  procs.set(PL.PDFName.of('f'), ctx.register(ctx.stream('600 0 d0 0.8 0 0 rg 50 0 400 700 re f')))
  return ctx.register(ctx.obj({ Type: 'Font', Subtype: 'Type3', FontBBox: [0, 0, 600, 700], FontMatrix: [0.001, 0, 0, 0.001, 0, 0], CharProcs: procs, Encoding: ctx.obj({ Type: 'Encoding', Differences: [97, 'a', 'b', 'c', 'd', 'e', 'f'] }), ...(noWidths ? {} : { FirstChar: 97, LastChar: 102, Widths: [600, 600, 600, 600, 600, 600] }), Resources: ctx.obj({}) }))
}
