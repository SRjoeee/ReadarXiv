// @vitest-environment node
import * as PL from '@cantoo/pdf-lib'
import { deflateSync } from 'node:zlib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
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
  it('keeps two layers of equal dicts two, proves, and renders as the full base', async () => {
    const layers = (doc: PL.PDFDocument) => {
      const ctx = doc.context
      const A = ctx.register(ctx.obj({ Type: 'OCG', Name: PL.PDFString.of('frame') })), B = ctx.register(ctx.obj({ Type: 'OCG', Name: PL.PDFString.of('frame') }))
      doc.catalog.set(PL.PDFName.of('OCProperties'), ctx.obj({ OCGs: [A, B], D: ctx.obj({ BaseState: 'ON', OFF: [B] }) }))
      doc.getPages()[1]!.node.Resources()!.set(PL.PDFName.of('Properties'), ctx.obj({ fa: A, fb: B }))
    }
    const body = (marked: boolean) => (marked ? unit(0, 72, 720, '(Order)') : run(72, 720, '(Order)')) + run(72, 700, '(shown)', { before: '/OC /fa BDC ', after: ' EMC' }) + run(72, 680, '(hidden)', { before: '/OC /fb BDC ', after: ' EMC' })
    const orig = (await markedSample({ pages: [2], edit: only(body(false)), tweak: layers })).bytes
    const ours = (await markedSample({ pages: [2], edit: only(body(true)), tweak: layers })).bytes
    const r = ok(await wrapped(ours, { units: [{ src: 'Order' }] }))
    const d = await deltaOf(orig, r.bytes, { PL: PL as never })
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
    const { OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const { inflate } = await import('./helpers/ocg-pdfs')
    const lossy = (b: Uint8Array) => new Uint8Array(deflateSync(b.subarray(0, Math.floor(b.length * 0.6))))
    const r = ok(await wrapFinal(bytes, { PL: PL as never, getDocument: getDocument as never, documentOptions: DOCUMENT_OPTIONS, OPS, units: null, follows: null, deflate: lossy, inflate } as never))
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
