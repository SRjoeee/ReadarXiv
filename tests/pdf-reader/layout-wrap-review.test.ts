// @vitest-environment node
import * as PL from '@cantoo/pdf-lib'
import { deflateSync } from 'node:zlib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { deltaOf, proveDelta } from '@/pdf-reader/engine/layout/delta.mjs'
import { DOCUMENT_OPTIONS, markedSample, pixelsApart, renderPage, wrapped } from './helpers/ocg-pdfs'

// The adversarial review of the wrap and its proof (2026-10-23, at 651bef45): each finding's case, failing before its fix.
// B1 a page's reads bounded; B2 optional content matched by identity in the delta; B3 a page's own /Properties kept; S1 a
// page's own unbalanced marked content refusing nothing; S2 the lists past the document's groups; S3 malformed units; S4 a
// placeholder whose ink is lost; S5 a rule above a title; S6 a number cell before a cell; S7 the written bytes read back; S8 a
// merged label; S9 (the page pass's: layer-format and page-pass tests) a delta that leaves a wrapped page arXiv's

const run = (x: number, y: number, text: string, o: { before?: string; after?: string } = {}) => `${o.before ?? ''}BT /F32 10.9091 Tf 1 0 0 1 ${x} ${y} Tm [${text}] TJ ET${o.after ?? ''}\n`
const unit = (id: number, x: number, y: number, text: string) => run(x, y, text, { before: `/axt-${id}s ri `, after: ` /axt-${id}e ri` })
const only = (text: string) => (_: string, p: number) => (p === 2 ? text : _)
const ok = <T extends object>(r: T): Exclude<T, { refused: string }> => { if ('refused' in r) { const x = r as unknown as { refused: string; why: string }; throw new Error(`${x.refused}: ${x.why}`) } return r as Exclude<T, { refused: string }> }
const tail = (r: { bytes: Uint8Array }, from: number) => new TextDecoder('latin1').decode(r.bytes.subarray(from))

describe('B1: a page past the wrap\'s bounds is refused, never the process', () => {
  it('refuses a plot of 400,000 path operators, its unit the original\'s', async () => {
    const path = `q 0.5 w 72 100 m\n${Array.from({ length: 400_000 }, (_, i) => `${72 + (i % 4000) * 0.1} ${100 + (i % 977) * 0.5} l`).join('\n')}\nS Q\n`
    const { bytes } = await markedSample({ pages: [2], edit: only(unit(0, 72, 700, '(Order)') + path) })
    const r = ok(await wrapped(bytes, { units: [{ src: 'Order' }] }))
    expect(r.stats.refusedPages).toBe(1)
    expect(r.stats.unhidden.page).toBe(1)
  })
})

describe('B2: the delta matches optional content by identity, never by content', () => {
  /** arXiv's and our compile's layers: two OCGs, A then B in arXiv's /OCGs, as `oursOrder` in ours; names and default states given */
  const layered = (names: [string, string], states: { orig: [boolean, boolean]; ours: [boolean, boolean] }, swap = false) => (which: 'orig' | 'ours') => (doc: PL.PDFDocument) => {
    const ctx = doc.context
    const A = ctx.register(ctx.obj({ Type: 'OCG', Name: PL.PDFString.of(names[0]) })), B = ctx.register(ctx.obj({ Type: 'OCG', Name: PL.PDFString.of(names[1]) }))
    const st = states[which], list = which === 'ours' && swap ? [B, A] : [A, B]
    doc.catalog.set(PL.PDFName.of('OCProperties'), ctx.obj({ OCGs: list, D: ctx.obj({ BaseState: 'ON', OFF: [A, B].filter((_, i) => !st[i]) }) }))
    doc.getPages()[1]!.node.Resources()!.set(PL.PDFName.of('Properties'), ctx.obj({ fa: A, fb: B }))
  }
  const body = (marked: boolean) => (marked ? unit(0, 72, 720, '(Order)') : run(72, 720, '(Order)')) + run(72, 700, '(shown)', { before: '/OC /fa BDC ', after: ' EMC' }) + run(72, 680, '(hidden)', { before: '/OC /fb BDC ', after: ' EMC' })
  async function pair(tweak: ReturnType<typeof layered>) {
    const orig = (await markedSample({ pages: [2], edit: only(body(false)), tweak: tweak('orig') })).bytes
    const ours = (await markedSample({ pages: [2], edit: only(body(true)), tweak: tweak('ours') })).bytes
    const r = ok(await wrapped(ours, { units: [{ src: 'Order' }] }))
    return { orig, r, d: await deltaOf(orig, r.bytes, { PL: PL as never }) }
  }
  it('pairs the paper\'s own layers by place where each pair is one name, state, intent and usage: the delta renders as the full base', async () => {
    const { orig, r, d } = await pair(layered(['frame', 'caption'], { orig: [true, false], ours: [true, false] }))
    if ('refused' in d) throw new Error(d.why)
    const prove = (delta: Uint8Array) => proveDelta(orig, delta, r.bytes, { PL: PL as never, getDocument: getDocument as never, documentOptions: DOCUMENT_OPTIONS, replaced: d.replaced })
    expect((await prove(d.delta)).ok).toBe(true)
    const composed = new Uint8Array(orig.length + d.delta.length)
    composed.set(orig)
    composed.set(d.delta, orig.length)
    expect(pixelsApart(await renderPage(r.bytes, 2), await renderPage(composed, 2))).toBe(0)
    // (a delta that merges them is refused by the proof: /fb named by /fa's object)
    const text = new TextDecoder('latin1').decode(d.delta)
    const m = /\/fa (\d+) 0 R \/fb (\d+) 0 R/.exec(text)!
    expect(m[1]!.length).toBe(m[2]!.length)
    const merged = Uint8Array.from(text.replace(`/fb ${m[2]} 0 R`, `/fb ${m[1]} 0 R`), c => c.charCodeAt(0))
    expect((await prove(merged)).ok).toBe(false)
  })
  it('refuses the delta where the layers do not pair: two of one name (in either order), or one name at another state (r18)', async () => {
    for (const [names, states, swap] of [[['frame', 'frame'], { orig: [true, false], ours: [true, false] }, false], [['frame', 'frame'], { orig: [true, false], ours: [false, true] }, true], [['frame', 'caption'], { orig: [true, false], ours: [false, false] }, false]] as const) {
      const { d } = await pair(layered([...names] as [string, string], { orig: [...states.orig] as [boolean, boolean], ours: [...states.ours] as [boolean, boolean] }, swap))
      expect(d, JSON.stringify(names)).toMatchObject({ refused: 'delta-proof' })
    }
  })
})

describe('B3 and S1: the page\'s own marked content and /Properties', () => {
  it('keeps a page\'s own entry named like a group of ours: its hidden layer stays hidden (G1)', async () => {
    const text = run(72, 700, '(Order)', { before: '/axt-0s ri /OC /u0 BDC ', after: ' EMC /axt-0e ri' }) + unit(1, 72, 680, '(the)') + run(72, 640, '(hidden)', { before: '/OC /u0 BDC ', after: ' EMC' })
    const { bytes } = await markedSample({ pages: [2], edit: only(text), tweak: doc => {
      const ctx = doc.context, L = ctx.register(ctx.obj({ Type: 'OCG', Name: PL.PDFString.of('paper layer') }))
      doc.catalog.set(PL.PDFName.of('OCProperties'), ctx.obj({ OCGs: [L], D: ctx.obj({ BaseState: 'ON', OFF: [L] }) }))
      doc.getPages()[1]!.node.Resources()!.set(PL.PDFName.of('Properties'), ctx.obj({ u0: L }))
    } })
    const r = ok(await wrapped(bytes, { units: [{ src: 'Order' }, { src: 'the' }] }))
    expect(tail(r, bytes.length)).toMatch(/\/Properties << \/u0 \d+ 0 R \/axtu0/)
    expect(pixelsApart(await renderPage(bytes, 2), await renderPage(r.bytes, 2))).toBe(0)
  })
  it('wraps a page whose own marked content does not balance, and refuses no other page', async () => {
    for (const extra of ['/Span <</MCID 3>> BDC ', 'EMC ']) {
      const { bytes } = await markedSample({ pages: [2, 3], edit: (t, p) => (p === 2 ? unit(0, 72, 700, '(Order)') + extra : p === 3 ? unit(1, 72, 700, '(the)') : t) })
      const r = ok(await wrapped(bytes, { units: [{ src: 'Order' }, { src: 'the' }] }))
      expect(r.stats.wrapped, extra).toBe(2)
    }
  })
})

describe('S2, S3: the lists past the document\'s groups, and the units', () => {
  it('lists only the units with a group in the document: a long paper\'s cut costs no base', async () => {
    const two = (await markedSample({ pages: [2, 3] })).bytes
    const all = ok(await wrapped(two)).stats.groups
    const r = ok(await wrapped(two, { units: null, bounds: { groupsDoc: all - 1 } }))
    expect(r.stats.refusedPages).toBe(1)
    expect(r.stats.unhidden.page).toBeGreaterThan(r.unhidden.length)
  })
  it('refuses units with a hole or no text, and leaves a marked unit the units lack the original\'s', async () => {
    const { bytes } = await markedSample({ pages: [2], edit: only(unit(0, 72, 700, '(Order)')) })
    await expect(wrapped(bytes, { units: [{}] })).rejects.toThrow(TypeError)
    await expect(wrapped(bytes, { units: [{ pieces: 'x' }] })).rejects.toThrow(TypeError)
    expect(ok(await wrapped(bytes, { units: [] })).unhidden).toEqual([[0, 'marks']])
  })
})

describe('S4, S5, S6, S8: what a unit owns', () => {
  it('makes a unit whose placeholder\'s ink is lost the original\'s (a symbol the spell check cannot read)', async () => {
    const page = '/axt-0s ri BT /F32 10.9091 Tf 1 0 0 1 72 700 Tm [(Order)] TJ /axt-p0.1b ri /axt-p0.1a ri [( = )] TJ [(the)] TJ ET /axt-0e ri\n'
    const { bytes } = await markedSample({ pages: [2], edit: only(page) })
    expect(ok(await wrapped(bytes, { units: [{ src: 'Order the' }] })).unhidden).toEqual([[0, 'marks']])
  })
  it('gives a title with an end mark alone no rule above it', async () => {
    const rule = 'q 72 735 468 4 re f Q\n'
    const page = (title: boolean) => `/axt-bs1 ri ${rule}${title ? run(72, 710, '(Title)') : ''}/axt-0e ri\n/axt-1s ri ${run(72, 680, '(Body)')} /axt-1e ri /axt-be1 ri\n`
    const { bytes } = await markedSample({ pages: [2], edit: only(page(true)) })
    const r = ok(await wrapped(bytes, { units: [{ src: 'Title' }, { src: 'Body' }] }))
    const want = (await markedSample({ pages: [2], edit: only(page(false)) })).bytes
    expect(pixelsApart(await renderPage(r.bytes, 2, { off: n => n === 'axt:u0' }), await renderPage(want, 2))).toBe(0)
  })
  it('takes no label for a table cell: an unmarked number before it stays the page\'s', async () => {
    const row = `/axt-t0s ri ${run(72, 700, '(Ours)')} /axt-t0e ri ${run(160, 700, '(0.52)')}/axt-t1s ri ${run(240, 700, '(better)')} /axt-t1e ri\n`
    const { bytes } = await markedSample({ pages: [2], edit: only(row) })
    const r = ok(await wrapped(bytes, { units: [{ src: 'Ours' }, { src: 'better' }] }))
    expect(tail(r, bytes.length)).not.toMatch(/axt:u1\.l/)
  })
  it('makes a unit whose label a merged page folds into its text the original\'s (bounds)', async () => {
    const text = `/axt-5e ri BT /F32 10.9091 Tf 1 0 0 1 72 700 Tm [(1.)] TJ /axt-0s ri [(Order)] TJ ET /axt-0e ri\n${unit(1, 72, 680, '(points)')}`
    const { bytes } = await markedSample({ pages: [2], edit: only(text) })
    const r = ok(await wrapped(bytes, { units: [{ src: 'Order' }, { src: 'points' }], bounds: { groupsPage: 2 } }))
    expect(r.unhidden).toEqual([[0, 'bounds']])
  })
})

describe('S7: the bytes written are the bytes proved', () => {
  it('refuses a page whose deflated stream does not inflate to the stream it proved', async () => {
    const { bytes } = await markedSample({ pages: [2] })
    const { wrapFinal } = await import('@/pdf-reader/engine/layout/wrap.mjs')

    const { inflate } = await import('./helpers/ocg-pdfs')
    const lossy = (b: Uint8Array) => new Uint8Array(deflateSync(b.subarray(0, Math.floor(b.length * 0.6))))
    const r = ok(await wrapFinal(bytes, { PL: PL as never, getDocument: getDocument as never, documentOptions: DOCUMENT_OPTIONS, OPS, units: null, follows: null, texts: null, inkless: null, deflate: lossy, inflate } as never))
    expect(r.stats.wrapped).toBe(0)
    expect(r.stats.refusedPages).toBe(1)
  })
})

describe('the proof of a split " show (review debt)', () => {
  it('splits a " show with its own word and character spacing, and proves it', async () => {
    const page = `/axt-0s ri BT /F32 10.9091 Tf 1 0 0 1 72 700 Tm 12 TL [(Order)] TJ /axt-p0.1a ri 1.5 0.25 (pointsthe) " ET /axt-0e ri\n`
    const { bytes } = await markedSample({ pages: [2], edit: only(page) })
    const follows = (name: string) => (name === 'p0.1a' ? { closing: false, want: 'the', ends: ['0e'], blocked: false, group: [] } : null)
    const r = ok(await wrapped(bytes, { units: [{ src: 'Order the' }], follows }))
    expect(r.stats.split).toBe(1)
    expect(r.stats.wrapped).toBe(1)
    expect(pixelsApart(await renderPage(bytes, 2), await renderPage(r.bytes, 2))).toBeLessThan(200)
  })
})

// ---- the re-review (at 09c0c45e)
describe('re-review B1, S4: a dense page is the page\'s, within the documented bounds', () => {
  const plot = (n: number) => `q 0.5 w 72 100 m\n${Array.from({ length: n }, (_, i) => `${72 + (i % 4000) * 0.1} ${100 + (i % 977) * 0.5} l`).join('\n')}\nS Q\n`
  it('wraps a page of 160,000 operators in one stream (no spread of its operators, the proof\'s reads each under its own budget)', async () => {
    const { bytes } = await markedSample({ pages: [2], edit: only(unit(0, 72, 700, '(Order)') + plot(160_000)) })
    const r = ok(await wrapped(bytes, { units: [{ src: 'Order' }] }))
    expect(r.stats.wrapped).toBe(1)
    expect(r.unhidden).toEqual([])
  })
})

describe('re-review B2: arXiv\'s own layers stay listed in the composed document', () => {
  it('keeps arXiv\'s /OCGs and default, ours appended: an unreplaced page\'s hidden layer stays hidden', async () => {
    const body = (p: number, marked: boolean) => (p === 2 && marked ? unit(0, 72, 720, '(Order)') : run(72, 720, '(Order)')) + run(72, 700, '(shown)', { before: '/OC /fA BDC ', after: ' EMC' }) + run(72, 680, '(hidden)', { before: '/OC /fB BDC ', after: ' EMC' })
    const orig = (await markedSample({ pages: [1, 2], edit: (_, p) => body(p, false), foreignOC: true })).bytes
    const ours = (await markedSample({ pages: [1, 2], edit: (_, p) => body(p, true), foreignOC: true })).bytes
    const r = ok(await wrapped(ours, { units: [{ src: 'Order' }] }))
    const d = await deltaOf(orig, r.bytes, { PL: PL as never, replacedPages: [2] })
    if ('refused' in d) throw new Error(d.why)
    const proof = await proveDelta(orig, d.delta, r.bytes, { PL: PL as never, getDocument: getDocument as never, documentOptions: DOCUMENT_OPTIONS, replaced: d.replaced })
    expect(proof.ok).toBe(true)
    const composed = new Uint8Array(orig.length + d.delta.length)
    composed.set(orig)
    composed.set(d.delta, orig.length)
    expect(pixelsApart(await renderPage(composed, 1), await renderPage(orig, 1))).toBe(0)
    expect(pixelsApart(await renderPage(composed, 2), await renderPage(r.bytes, 2))).toBe(0)
  })
})

describe('re-review S1, S2, S3: the wrap\'s inputs and the delta\'s pages', () => {
  it('requires units (null said for none), deflate and inflate', async () => {
    const { bytes } = await markedSample({ pages: [2], edit: only(unit(0, 72, 700, '(Order)')) })
    const { wrapFinal } = await import('@/pdf-reader/engine/layout/wrap.mjs')

    const { deflate, inflate } = await import('./helpers/ocg-pdfs')
    const base = { PL: PL as never, getDocument: getDocument as never, documentOptions: DOCUMENT_OPTIONS, OPS }
    await expect(wrapFinal(bytes, { ...base, deflate, inflate } as never)).rejects.toThrow(/units/)
    await expect(wrapFinal(bytes, { ...base, units: null, deflate } as never)).rejects.toThrow(/inflate/)
    // (texts required too, null said where the marks are not in hand: a caller that drops them is told)
    await expect(wrapFinal(bytes, { ...base, units: null, deflate, inflate } as never)).rejects.toThrow(/texts/)
    // (and inkless, as texts are: the macros TeX said set no ink, which a unit may open with, 2609.20976v1's title)
    await expect(wrapFinal(bytes, { ...base, units: null, texts: null, deflate, inflate } as never)).rejects.toThrow(/inkless/)
    expect('refused' in (await wrapFinal(bytes, { ...base, units: null, follows: null, texts: null, inkless: null, deflate, inflate } as never))).toBe(false)
  })
  it('refuses a delta that leaves a page of ours naming a group of ours arXiv\'s (delta-pages), and the proof one that does', async () => {
    const { bytes: orig } = await markedSample({ pages: [2, 3], edit: (_, p) => run(72, 700, p === 2 ? '(Order)' : '(the)') })
    const { bytes: ours } = await markedSample({ pages: [2, 3], edit: (_, p) => unit(p - 2, 72, 700, p === 2 ? '(Order)' : '(the)') })
    const r = ok(await wrapped(ours, { units: [{ src: 'Order' }, { src: 'the' }] }))
    expect(r.pages).toEqual([[2, 3]])
    expect(await deltaOf(orig, r.bytes, { PL: PL as never, replacedPages: [2] })).toMatchObject({ refused: 'delta-pages' })
    const whole = await deltaOf(orig, r.bytes, { PL: PL as never })
    if ('refused' in whole) throw new Error(whole.why)
    const prove = (replaced: [number, number][]) => proveDelta(orig, whole.delta, r.bytes, { PL: PL as never, getDocument: getDocument as never, documentOptions: DOCUMENT_OPTIONS, replaced })
    expect((await prove(whole.replaced)).ok).toBe(true)
  })
})

// ---- owner 2's pixel tier (1810.04805v2 p7 and p4)
describe('the pixel tier: a cell that opens with an unmarked macro, a footnote\'s rule', () => {
  it('leaves a cell whose macro is set before its start mark, with no mark of its own, the original\'s (counted in leaks)', async () => {
    const row = `/axt-t0s ri ${run(72, 700, '(Ours)')} /axt-t0e ri ${run(160, 700, '(80.8)')}${run(240, 700, '(BERTLARGE)')}/axt-t1s ri ${run(320, 700, '(\\(Single\\))')} /axt-t1e ri\n`
    const { bytes } = await markedSample({ pages: [2], edit: only(row) })
    const units = [{ kind: 'cell', pieces: [{ t: 'text', s: 'Ours' }] }, { kind: 'cell', pieces: [{ t: 'ph', src: '\\bertlarge' }, { t: 'text', s: ' (Single)' }] }]
    const r = ok(await wrapped(bytes, { units }))
    expect(r.unhidden).toEqual([[1, 'marks']])
    expect(r.own.leaks).toEqual({ count: 1, units: [1] })
  })
  it('leaves a footnote\'s rule standing when the footnote is hidden', async () => {
    const note = (text: boolean) => `/axt-0s ri q 72 120 144 0.4 re f Q ${text ? run(72, 100, '(note)') : ''}/axt-0e ri\n`
    const { bytes } = await markedSample({ pages: [2], edit: only(note(true)) })
    const r = ok(await wrapped(bytes, { units: [{ src: 'note' }] }))
    const want = (await markedSample({ pages: [2], edit: only(note(false)) })).bytes
    expect(pixelsApart(await renderPage(r.bytes, 2, { off: n => n === 'axt:u0' }), await renderPage(want, 2))).toBe(0)
  })
})

// ---- the pixel tier, second round: a unit's lead after its label, a name inside a placeholder
describe('the pixel tier: a lead macro after a label, a babel name inside a \\cref', () => {
  const groups = (r: { bytes: Uint8Array }, from: number) => new Set([...new TextDecoder('latin1').decode(r.bytes.subarray(from)).matchAll(/\(axt:([^)]+)\)/g)].map(m => m[1]))
  it('owns a heading\'s lead macro set before its start mark as its placeholder, its number as its label (2609.26457v1 p25)', async () => {
    const page = `/axt-5e ri BT /F32 10.9091 Tf 1 0 0 1 72 700 Tm [(B.)] TJ 1 0 0 1 92 700 Tm [(AIDE)] TJ 1 0 0 1 120 698 Tm /F32 7 Tf [(human)] TJ /F32 10.9091 Tf 1 0 0 1 150 700 Tm /axt-h0s ri [(is)-300(a)-300(baseline)] TJ ET /axt-h0e ri\n`
    const { bytes } = await markedSample({ pages: [2], edit: only(page) })
    const units = [{ kind: 'heading', pieces: [{ t: 'open', src: '\\texorpdfstring{' }, { t: 'ph', src: '\\boldmath' }, { t: 'ph', src: '\\aidehuman{}' }, { t: 'text', s: ' is a baseline' }] }]
    const r = ok(await wrapped(bytes, { units }))
    expect(r.unhidden).toEqual([])
    expect(groups(r, bytes.length)).toEqual(new Set(['u0', 'u0.l', 'u0.p']))
    // (the text and the macro hidden, the number kept: the page with "B." alone)
    const want = (await markedSample({ pages: [2], edit: only('BT /F32 10.9091 Tf 1 0 0 1 72 700 Tm [(B.)] TJ ET\n') })).bytes
    expect(pixelsApart(await renderPage(r.bytes, 2, { off: n => n === 'axt:u0' || n === 'axt:u0.p' }), await renderPage(want, 2))).toBe(0)
  })
  it('gives the name cleveref sets inside a \\cref to the placeholder, never the name\'s group (2608.16117v1 p16)', async () => {
    const page = `/axt-0s ri BT /F32 10.9091 Tf 1 0 0 1 72 700 Tm [(see)] TJ /axt-p0.1a ri /axt-n1.appendix.s ri [(Appendix)] TJ /axt-n1.appendix.e ri [(A)] TJ /axt-p0.1b ri [(.)] TJ ET /axt-0e ri\n`
    const { bytes } = await markedSample({ pages: [2], edit: only(page) })
    const r = ok(await wrapped(bytes, { units: [{ pieces: [{ t: 'text', s: 'see ' }, { t: 'ph', src: '\\cref{app}' }, { t: 'text', s: '.' }] }] }))
    expect(groups(r, bytes.length)).toEqual(new Set(['u0', 'u0.p']))
  })
})

// ---- the sweep of 2026-10-24: a page refused for a soft mask's paths (2610.19159v1 p3, its figure's ExtGState /SMask)
describe('coverage: a soft mask\'s content is no painted ink of the page', () => {
  /** an ExtGState /GS1 whose soft mask is a luminosity group of two filled paths, on page 2 */
  const softMask = (doc: PL.PDFDocument) => {
    const ctx = doc.context, res = doc.getPages()[1]!.node.Resources()!
    const g = ctx.register(ctx.flateStream(Uint8Array.from('0 0 100 100 re f 100 100 50 50 re f', c => c.charCodeAt(0)), { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 612, 792], Group: ctx.obj({ S: 'Transparency', CS: 'DeviceGray' }), Resources: ctx.obj({}) }))
    res.set(PL.PDFName.of('ExtGState'), ctx.obj({ GS1: ctx.obj({ Type: 'ExtGState', SMask: ctx.obj({ Type: 'Mask', S: 'Luminosity', G: g }) }) }))
  }
  const page = `q /GS1 gs 0 0 0 rg 300 300 80 80 re f Q /axt-0s ri ${run(72, 700, '(see)')}/axt-p0.1a ri q 110 698 30 0.6 re f Q /axt-p0.1b ri ${run(150, 700, '(more)')}/axt-0e ri\n`
  const units = [{ pieces: [{ t: 'text', s: 'see' }, { t: 'ph', src: '\\rule{1em}{0.6pt}' }, { t: 'text', s: 'more' }] }]
  it('lists no path of a soft mask among the page\'s own (alignOf), as the remover\'s walk reads none', async () => {
    const { bytes } = await markedSample({ pages: [2], edit: only(page), tweak: softMask })
    const task = getDocument({ ...DOCUMENT_OPTIONS, data: bytes.slice() } as never)
    const ops = await (await (await task.promise).getPage(2)).getOperatorList()
    const { alignOf } = await import('@/pdf-reader/engine/layout/wrap.mjs')
    expect(ops.fnArray.filter((f: number) => f === OPS.constructPath).length).toBe(4)
    expect(alignOf(OPS, ops).paths).toBe(2)
    await task.destroy()
  })
  it('wraps a page whose placeholder owns a rule beside a soft mask: its unit hidden, its rule kept with it', async () => {
    const { bytes } = await markedSample({ pages: [2], edit: only(page), tweak: softMask })
    const r = ok(await wrapped(bytes, { units }))
    expect(r.stats.refusedPages).toBe(0)
    expect(r.unhidden).toEqual([])
    expect(r.stats.groups).toBe(2)
    // (by pixels: the unit's text and its placeholder's rule OFF is the page with the masked square alone)
    const want = (await markedSample({ pages: [2], edit: only('q /GS1 gs 0 0 0 rg 300 300 80 80 re f Q\n'), tweak: softMask })).bytes
    expect(pixelsApart(await renderPage(r.bytes, 2, { off: n => n === 'axt:u0' || n === 'axt:u0.p' }), await renderPage(want, 2))).toBe(0)
    // (and all ON, our page)
    expect(pixelsApart(await renderPage(r.bytes, 2), await renderPage(bytes, 2))).toBe(0)
  })
})

// ---- the sweep of 2026-10-24: a title a class sets in capitals by \uppercase, its mark's name in capitals with it
// (2610.20967v1 spconf's \section and \title, 2610.20581v1 amsart's \title: `/axt-H0E ri`)
describe('coverage: a mark \\uppercase set in capitals', () => {
  it('reads a point\'s name whatever case TeX set it in: the title owned and hidden', async () => {
    const page = `/axt-bs1 ri ${run(72, 700, '(ALL SERRIN BANDS)')}/axt-H0E ri /axt-1s ri ${run(72, 680, '(Text)')}/axt-1e ri\n`
    const { bytes } = await markedSample({ pages: [2], edit: only(page) })
    const r = ok(await wrapped(bytes, { units: [{ kind: 'heading', src: 'All Serrin bands' }, { src: 'Text' }] }))
    expect(r.unhidden).toEqual([])
    expect(r.stats.groups).toBe(2)
  })
})
