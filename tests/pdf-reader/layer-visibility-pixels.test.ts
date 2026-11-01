// @vitest-environment node
import * as PL from '@cantoo/pdf-lib'
import { readFileSync } from 'node:fs'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { beforeAll, describe, expect, it } from 'vitest'
import { pageInk } from '@/pdf-reader/engine/layout/ink.mjs'
import { wrapFinal } from '@/pdf-reader/engine/layout/wrap.mjs'
import { openPaper } from '@/pdf-reader/engine/pipeline/live.mjs'
import { visibilityOf } from '@/pdf-reader/engine/layer-proto/visibility.mjs'
import { DOCUMENT_OPTIONS, deflate, inflate, renderPage } from './helpers/ocg-pdfs'

// T4.2 of the per-unit erasure (docs/route/ocg-erasure.md §4.5, docs/PDF-READER.md §11.8): render A as the reader draws it,
// through visibilityOf's one configuration a document and its queue of renders (layer-proto/visibility.mjs), over sample-1's own
// final pass wrapped from its source units (tests/fixtures/pdf/ocg/sample-1-final.pdf, CC0), rendered by PDF.js in Node:
//   - against a per-unit oracle: hiding unit u's groups changes pixels only inside u's own glyphs as ownership reads them (the
//     glyphs of the page's ink whose group is u's, `owned`), and inside every one of them that is inked; with every group shown
//     the page is our unwrapped page (G1);
//   - against PDF.js's own path: each render of the queue equals a render with a fresh configuration and the same groups hidden,
//     whatever the renders before it hid (only the groups that change are set again);
//   - a change of the groups hidden asks no operator list again (visibility is read at paint time).

const OCG = new URL('../fixtures/pdf/ocg/', import.meta.url), SAMPLE = new URL('../fixtures/pdf/sample-1/', import.meta.url)
const SCALE = 2
type Img = { data: Uint8ClampedArray; width: number; height: number }
type Owned = { glyphs: (string | null)[][] }
let wrapped: Uint8Array, base: Uint8Array, owned: Owned

beforeAll(async () => {
  base = new Uint8Array(readFileSync(new URL('sample-1-final.pdf', OCG)))
  const units = openPaper(new Map(['main.tex', 'refs.bib', 'main.bbl'].map(f => [f, new Uint8Array(readFileSync(new URL(f, SAMPLE)))]))).units
  const r = await wrapFinal(base, { PL: PL as never, getDocument: getDocument as never, documentOptions: DOCUMENT_OPTIONS, OPS, units: units as never, texts: null, inkless: null, names: null, deflate, inflate, keepOwned: true } as never) as unknown as { bytes: Uint8Array; owned: Owned; refused?: string }
  if (r.refused) throw new Error(r.refused)
  wrapped = r.bytes
  owned = r.owned
}, 60_000)

/** the document opened as a reader opens it (Node's PDF.js), its operator-list asks counted, and a page rendered through the
 *  document's visibility (visibilityOf) with the groups `off` hidden */
async function reader(bytes: Uint8Array) {
  const task = getDocument({ ...DOCUMENT_OPTIONS, data: bytes.slice(), isImageDecoderSupported: false } as never)
  const doc = await task.promise
  const V = visibilityOf(doc)
  await V.ready
  const pages = new Map<number, Awaited<ReturnType<typeof doc.getPage>>>()
  let lists = 0
  const handler = (doc as unknown as { _transport: { messageHandler: { sendWithStream: (...a: unknown[]) => unknown } } })._transport.messageHandler
  const send = handler.sendWithStream.bind(handler)
  handler.sendWithStream = (name: unknown, ...rest: unknown[]) => { if (name === 'GetOperatorList') lists++; return send(name, ...rest) }
  const render = async (p: number, off: Iterable<string> | ((g: string) => boolean)): Promise<Img> => {
    if (!pages.has(p)) pages.set(p, await doc.getPage(p))
    const page = pages.get(p)!, vp = page.getViewport({ scale: SCALE })
    const { canvas, context } = (doc as unknown as { canvasFactory: { create(w: number, h: number): { canvas: { width: number; height: number }; context: CanvasRenderingContext2D } } }).canvasFactory.create(Math.ceil(vp.width), Math.ceil(vp.height))
    await V.render(page, { canvasContext: context, viewport: vp, canvas } as never, off)
    return { data: context.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height }
  }
  return { doc, V, render, lists: () => lists, close: () => task.destroy() }
}

/** each glyph of page p's ink (its unwrapped page's, as ownership read it) with its group, in device pixels at SCALE, y down */
async function glyphsOf(p: number) {
  const task = getDocument({ ...DOCUMENT_OPTIONS, data: base.slice() } as never)
  const doc = await task.promise
  try {
    const page = await doc.getPage(p), vp = page.getViewport({ scale: SCALE })
    const ink = pageInk(OPS, await page.getOperatorList(), page.commonObjs, { rotate: page.rotate, indices: true }) as { glyphs: { x0: number; x1: number; ix0: number; ix1: number; top: number; bottom: number }[] }
    const G = owned.glyphs[p - 1] ?? []
    return ink.glyphs.map((g, i) => {
      const [a, b] = vp.convertToViewportPoint(Math.min(g.x0, g.ix0), g.bottom), [c, d] = vp.convertToViewportPoint(Math.max(g.x1, g.ix1), g.top)
      return { group: G[i] ?? null, box: [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)] }
    })
  } finally { await task.destroy() }
}
const changed = (a: Img, b: Img) => { const out: number[] = []; for (let i = 0; i < a.data.length; i += 4) if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2] || a.data[i + 3] !== b.data[i + 3]) out.push(i / 4); return out }
const within = (px: number, w: number, boxes: number[][], pad: number) => { const x = px % w, y = Math.floor(px / w); return boxes.some(b => x >= b[0]! - pad && x < b[2]! + pad && y >= b[1]! - pad && y < b[3]! + pad) }

describe('render A over sample-1 wrapped (T4.2)', () => {
  it('with every group shown is our unwrapped page; each unit hidden alone changes its own glyphs and nothing else', async () => {
    const R = await reader(wrapped), U = await reader(base)
    try {
      for (const p of [1, 2, 3, 4]) {
        const on = await R.render(p, []), plain = await U.render(p, [])
        expect(changed(on, plain).length, `page ${p}: all shown`).toBe(0)
        const glyphs = await glyphsOf(p)
        const units = [...new Set(glyphs.map(g => g.group).filter((g): g is string => !!g && /^u\d+$/.test(g)))]
        expect(units.length, `page ${p}: units owning glyphs`).toBeGreaterThan(0)
        for (const u of units) {
          const mine = glyphs.filter(g => g.group === u).map(g => g.box)
          const A = await R.render(p, [u])
          const diff = changed(on, A)
          // (inside its own glyphs, an antialiased edge's pixel apart; and something of it hidden)
          expect(diff.filter(px => !within(px, on.width, mine, 1.5)).length, `page ${p}, ${u}: pixels changed outside its glyphs`).toBe(0)
          expect(diff.length, `page ${p}, ${u}: its ink hidden`).toBeGreaterThan(0)
        }
      }
    } finally { await R.close(); await U.close() }
  }, 120_000)

  it('each render of the queue equals PDF.js\'s render with a fresh configuration, whatever was hidden before; no operator list asked again', async () => {
    const R = await reader(wrapped)
    try {
      const p = 2
      const all = (g: string) => /^u\d+$/.test(g)
      const sets: (string[] | ((g: string) => boolean))[] = [['u10', 'u11.p'], all, [], ['u12', 'u12.l', 'u10'], ['u10', 'u11.p']]
      const first = await R.render(p, [])
      const asked = R.lists()
      expect(asked).toBeGreaterThan(0)
      const got: Img[] = [first]
      for (const off of sets) got.push(await R.render(p, off))
      // (the page's operator list read once, at its first render; every later render a change of visibility alone)
      expect(R.lists()).toBe(asked)
      for (const [i, off] of sets.entries()) {
        const fresh = await renderPage(wrapped, p, { off: typeof off === 'function' ? n => off(n.slice(4)) : n => off.includes(n.slice(4)), scale: SCALE })
        expect(changed(got[i + 1]!, fresh).length, `render ${i + 1}`).toBe(0)
      }
      // (the same groups hidden twice, other renders between: the same pixels)
      expect(changed(got[1]!, got[5]!).length).toBe(0)
      expect(changed(first, got[3]!).length).toBe(0)
    } finally { await R.close() }
  }, 120_000)
})
