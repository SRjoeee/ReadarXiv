// @vitest-environment node
import * as PL from '@cantoo/pdf-lib'
import { readFileSync } from 'node:fs'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { deltaOf, proveDelta } from '@/pdf-reader/engine/layout/delta.mjs'
import { pageInk } from '@/pdf-reader/engine/layout/ink.mjs'
import { alignOf, wrapOf } from '@/pdf-reader/engine/layout/wrap.mjs'
import { openPaper } from '@/pdf-reader/engine/pipeline/live.mjs'
import { deflate, DOCUMENT_OPTIONS, inflate, markedSample, pixelsApart, renderPage, SAMPLE_1, wrapped } from './helpers/ocg-pdfs'

// The erasure's remaining synthetic cases and gates (design docs/route/ocg-erasure.md §7): S2 (300 groups), S5 (forms), S8
// (Type 3), the refused splits (a vertical font, a Type 3 font without widths), G3 (containment), G4 (a toggle on a kept
// config), G5 (the crop source: text and labels OFF, placeholders ON), and sample-1 end to end from its real marked compile
// (tests/fixtures/pdf/ocg/sample-1-final.pdf, made by scripts/make-sample-bundle.mjs --final)

const run = (x: number, y: number, text: string, o: { before?: string; after?: string; hide?: boolean; font?: string } = {}) =>
  `${o.before ?? ''}BT /${o.font ?? 'F32'} 10.9091 Tf 1 0 0 1 ${x} ${y} Tm ${o.hide ? '3 Tr ' : ''}[${text}] TJ ${o.hide ? '0 Tr ' : ''}ET${o.after ?? ''}\n`
const unit = (id: number, x: number, y: number, text: string, o: { hide?: boolean; font?: string } = {}) => run(x, y, text, { before: `/axt-${id}s ri `, after: ` /axt-${id}e ri`, ...o })
const only = (text: string) => (_: string, p: number) => (p === 2 ? text : _)
const ok = <T extends object>(r: T): Exclude<T, { refused: string }> => { if ('refused' in r) { const x = r as unknown as { refused: string; why: string }; throw new Error(`${x.refused}: ${x.why}`) } return r as Exclude<T, { refused: string }> }
const is = (name: string) => (n: string) => n === name
type Img = Awaited<ReturnType<typeof renderPage>>
/** the pixels of `a` and `b` apart outside `mask`'s changed pixels (the ink mask: where `m1` and `m0` differ) */
function apartOutside(a: Img, b: Img, m1: Img, m0: Img) {
  let n = 0
  for (let i = 0; i < a.data.length; i += 4) {
    const inMask = m1.data[i] !== m0.data[i] || m1.data[i + 1] !== m0.data[i + 1] || m1.data[i + 2] !== m0.data[i + 2] || m1.data[i + 3] !== m0.data[i + 3]
    if (!inMask && (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2])) n++
  }
  return n
}

describe('S2: 300 groups on a page (G1, G2, G3)', () => {
  const at = (u: number) => [72 + 50 * (u % 10), 740 - 22 * Math.floor(u / 10)] as const
  const page = (hide = -1) => Array.from({ length: 300 }, (_, u) => unit(u, ...at(u), '(the)', { hide: u === hide })).join('')
  it('wraps them, all ON our page; one OFF the page with it in 3 Tr; what changes lies in its ink alone', async () => {
    const { bytes } = await markedSample({ pages: [2], edit: only(page()) })
    const r = ok(await wrapped(bytes, { units: Array.from({ length: 300 }, () => ({ src: 'the' })) }))
    expect(r.stats.groups).toBe(300)
    expect(r.unhidden).toEqual([])
    const all = await renderPage(r.bytes, 2)
    expect(pixelsApart(await renderPage(bytes, 2), all)).toBe(0)
    const none = await renderPage(r.bytes, 2, { off: n => /^axt:u\d+$/.test(n) })
    for (const u of [0, 137, 299]) {
      const off = await renderPage(r.bytes, 2, { off: is(`axt:u${u}`) })
      const { bytes: oracle } = await markedSample({ pages: [2], edit: only(page(u)) })
      expect(pixelsApart(off, await renderPage(oracle, 2)), `G2 u${u}`).toBe(0)
      // (G3: its ink mask, the unit alone ON against every unit OFF)
      const alone = await renderPage(r.bytes, 2, { off: n => /^axt:u\d+$/.test(n) && n !== `axt:u${u}` })
      expect(pixelsApart(all, off), `u${u} hides something`).toBeGreaterThan(0)
      expect(apartOutside(all, off, alone, none), `G3 u${u}`).toBe(0)
    }
  })
})

describe('S5: a form XObject', () => {
  const FORM = 'BT /F32 10.9091 Tf 1 0 0 1 72 700 Tm [(Order)] TJ ET'
  it('inside a unit\'s range is wrapped whole: its Do hidden with the unit', async () => {
    const { bytes } = await markedSample({ pages: [2], edit: only('/axt-0s ri q /Fx1 Do Q /axt-0e ri\n'), form: FORM })
    const r = ok(await wrapped(bytes, { units: [{ src: 'Order' }] }))
    expect(r.stats.wrapped).toBe(1)
    expect(pixelsApart(await renderPage(bytes, 2), await renderPage(r.bytes, 2))).toBe(0)
    const empty = (await markedSample({ pages: [2], edit: only('q Q\n'), form: FORM })).bytes
    expect(pixelsApart(await renderPage(r.bytes, 2, { off: is('axt:u0') }), await renderPage(empty, 2))).toBe(0)
  })
  it('partly owned refuses its page: the unit in it is the original\'s (page), no section written', async () => {
    const form = `/axt-1s ri ${FORM} /axt-1e ri BT /F32 10.9091 Tf 1 0 0 1 72 680 Tm [(the)] TJ ET`
    const { bytes } = await markedSample({ pages: [2], edit: only('q /Fx1 Do Q\n'), form })
    const r = ok(await wrapped(bytes, { units: [{ src: 'x' }, { src: 'Order' }] }))
    expect(r.stats.refusedPages).toBe(1)
    expect(r.unhidden).toContainEqual([1, 'page'])
    expect(r.bytes).toEqual(bytes)
  })
})

describe('S8: Type 3 text, and the splits refused', () => {
  it('hides a Type 3 unit exactly (whole shows) and splits one where a placeholder ends mid-show', async () => {
    const text = (hide: boolean) => unit(0, 72, 700, '(abcde)', { font: 'T3', hide }) + unit(1, 72, 600, '(ab)', { font: 'T3' })
    const { bytes } = await markedSample({ pages: [2], edit: only(text(false)), type3: true })
    const r = ok(await wrapped(bytes, { units: [{ src: 'abcde' }, { src: 'ab' }] }))
    const { bytes: oracle } = await markedSample({ pages: [2], edit: only(text(true)), type3: true })
    expect(pixelsApart(await renderPage(r.bytes, 2, { off: is('axt:u0') }), await renderPage(oracle, 2))).toBe(0)
    const split = `/axt-0s ri BT /T3 10.9091 Tf 1 0 0 1 72 700 Tm [(ab)] TJ /axt-p0.1a ri [(cd)-100(e)] TJ ET /axt-0e ri\n`
    const s = await markedSample({ pages: [2], edit: only(split), type3: true })
    const follows = (name: string) => (name === 'p0.1a' ? { closing: false, want: 'e', ends: ['0e'], blocked: false, group: [] } : null)
    const w = ok(await wrapped(s.bytes, { units: [{ src: 'abe' }], follows }))
    expect(w.stats.split).toBe(1)
    const a = await renderPage(s.bytes, 2)
    expect(pixelsApart(a, await renderPage(w.bytes, 2))).toBeLessThan(0.001 * a.width * a.height)
  })
  /** wrapOf over page 2 with a plan that makes its first show two groups' */
  async function splitPlan(bytes: Uint8Array) {
    const task = getDocument({ ...DOCUMENT_OPTIONS, data: bytes.slice() } as never), doc = await task.promise
    const ops = await (await doc.getPage(2)).getOperatorList()
    await task.destroy()
    const facts = alignOf(OPS, ops)
    return wrapOf(bytes, new Map([[2, { facts, shows: new Map([[0, ['u0', 'u1', 'u1']]]), paths: new Map() }]]), { PL: PL as never, deflate, inflate })
  }
  it('refuses a split in a Type 3 font without widths, and one in a vertical font', async () => {
    const t3 = await markedSample({ pages: [2], edit: only('BT /T3 10 Tf 1 0 0 1 72 700 Tm [(abc)] TJ ET\n'), type3: 'noWidths' })
    const r1 = ok(await splitPlan(t3.bytes))
    expect(r1.pages.get(2)).toMatchObject({ ok: false, why: 'a split in a Type 3 font without widths' })
    const vertical = (ctx: PL.PDFContext) => ({
      V0: ctx.register(ctx.obj({ Type: 'Font', Subtype: 'Type0', BaseFont: 'Helvetica', Encoding: 'Identity-V', DescendantFonts: [ctx.obj({ Type: 'Font', Subtype: 'CIDFontType2', BaseFont: 'Helvetica', CIDSystemInfo: ctx.obj({ Registry: PL.PDFString.of('Adobe'), Ordering: PL.PDFString.of('Identity'), Supplement: 0 }), FontDescriptor: ctx.obj({ Type: 'FontDescriptor', FontName: 'Helvetica', Flags: 32, FontBBox: [0, 0, 1000, 1000], ItalicAngle: 0, Ascent: 800, Descent: -200, CapHeight: 700, StemV: 80 }), DW: 1000 })] })),
    })
    const v = await markedSample({ pages: [2], edit: only('BT /V0 10 Tf 1 0 0 1 300 700 Tm [<002400250026>] TJ ET\n'), fonts: vertical })
    const r2 = ok(await splitPlan(v.bytes))
    expect(r2.pages.get(2)).toMatchObject({ ok: false, why: 'a split in a vertical font' })
  })
})

describe('G4 and G5: a toggle on a kept config, the crop source', () => {
  const TEXT = unit(0, 72, 700, '(Order)') + unit(1, 72, 680, '(points)') + run(72, 660, '(x)', { before: '/axt-2s ri ', font: 'F35' }).replace('[(x)] TJ', '[(the)] TJ /axt-p2.1a ri /F35 10.9091 Tf [(x)] TJ /axt-p2.1b ri') + ' /axt-2e ri\n'
  it('a config toggled between renders draws as a fresh config does (G4)', async () => {
    const { bytes } = await markedSample({ pages: [2], edit: only(TEXT) })
    const r = ok(await wrapped(bytes, { units: [{ src: 'Order' }, { src: 'points' }, { src: 'the' }] }))
    const task = getDocument({ ...DOCUMENT_OPTIONS, data: r.bytes.slice(), isImageDecoderSupported: false } as never), doc = await task.promise
    try {
      const page = await doc.getPage(2), vp = page.getViewport({ scale: 2 })
      const cfg = await doc.getOptionalContentConfig({ intent: 'display' })
      const idOf = (name: string) => [...(cfg as unknown as Iterable<[string, { name: string }]>)].find(([, g]) => g.name === name)![0]
      const draw = async () => {
        const { canvas, context } = (doc as unknown as { canvasFactory: { create(w: number, h: number): { canvas: { width: number; height: number }; context: CanvasRenderingContext2D } } }).canvasFactory.create(Math.ceil(vp.width), Math.ceil(vp.height))
        await page.render({ canvasContext: context, viewport: vp, canvas, optionalContentConfigPromise: Promise.resolve(cfg) } as never).promise
        return { data: context.getImageData(0, 0, canvas.width, canvas.height).data }
      }
      cfg.setVisibility(idOf('axt:u1'), false)
      await draw()
      cfg.setVisibility(idOf('axt:u1'), true)
      cfg.setVisibility(idOf('axt:u0'), false)
      const toggled = await draw()
      expect(pixelsApart(toggled, await renderPage(r.bytes, 2, { off: is('axt:u0') }))).toBe(0)
    } finally { await task.destroy() }
  })
  it('text and labels OFF, placeholders ON, is the placeholders and the page\'s other ink alone (G5)', async () => {
    const { bytes } = await markedSample({ pages: [2], edit: only(TEXT) })
    const r = ok(await wrapped(bytes, { units: [{ src: 'Order' }, { src: 'points' }, { src: 'the' }] }))
    const B = await renderPage(r.bytes, 2, { off: n => /^axt:u\d+(\.l)?$/.test(n) })
    const oracle = (await markedSample({ pages: [2], edit: only(TEXT.replace(/\[\((Order|points|the)\)\] TJ/g, '3 Tr [($1)] TJ 0 Tr')) })).bytes
    expect(pixelsApart(B, await renderPage(oracle, 2))).toBe(0)
    expect(pixelsApart(B, await renderPage(r.bytes, 2, { off: n => n.startsWith('axt:') }))).toBeGreaterThan(0)
  })
})

describe('sample-1 end to end from its marked compile (T1.2, T2.4)', () => {
  const FINAL = new URL('../fixtures/pdf/ocg/sample-1-final.pdf', import.meta.url)
  const SOURCE = ['main.tex', 'refs.bib', 'main.bbl'].map(f => [f, new Uint8Array(readFileSync(new URL(`../fixtures/pdf/sample-1/${f}`, import.meta.url)))] as const)
  it('owns, spells and wraps its units; the delta over the stand-in proves; all ON is our page; the page pass\'s numbering holds', async () => {
    const final = new Uint8Array(readFileSync(FINAL))
    const units = openPaper(new Map(SOURCE)).units
    const r = ok(await wrapped(final, { units, follows: undefined }))
    expect(r.stats.wrapped).toBe(4)
    expect(r.stats.refusedPages).toBe(0)
    // (I1: the groups are the units' by their ids, every unit with marks drawable but the ones listed)
    expect(r.stats.unhidden.spell).toBe(0)
    // (the original's only where the marker sets no marks: the title block's author and date, the figure's TikZ labels)
    expect(r.unhidden.map(([id, why]) => `${units[id]!.kind}:${why}`)).toEqual(['author:marks', 'para:marks', 'figure:marks', 'figure:marks'])
    for (const p of [1, 2, 3, 4]) expect(pixelsApart(await renderPage(final, p), await renderPage(r.bytes, p)), `page ${p}`).toBe(0)
    // (the page pass reads the wrapped pages: their glyphs the unwrapped pass's, one more show for each split)
    const inkOf = async (b: Uint8Array) => {
      const task = getDocument({ ...DOCUMENT_OPTIONS, data: b.slice() } as never), doc = await task.promise
      const out: { glyphs: number; shows: number }[] = []
      for (let p = 1; p <= doc.numPages; p++) { const page = await doc.getPage(p); const ink = pageInk(OPS, await page.getOperatorList(), page.commonObjs, { rotate: 0, indices: true }); out.push({ glyphs: ink.glyphs.length, shows: ink.shows }) }
      await task.destroy()
      return out
    }
    const [a, b] = [await inkOf(final), await inkOf(r.bytes)]
    expect(b.map(x => x.glyphs)).toEqual(a.map(x => x.glyphs))
    expect(b.reduce((n, x) => n + x.shows, 0) - a.reduce((n, x) => n + x.shows, 0)).toBeGreaterThanOrEqual(r.stats.split)
    const orig = new Uint8Array(readFileSync(SAMPLE_1))
    const d = await deltaOf(orig, r.bytes, { PL: PL as never })
    if ('refused' in d) throw new Error(d.why)
    const proof = await proveDelta(orig, d.delta, r.bytes, { PL: PL as never, getDocument: getDocument as never, documentOptions: DOCUMENT_OPTIONS, replaced: d.replaced })
    expect(proof.ok).toBe(true)
  })
})
