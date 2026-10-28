// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { DOCUMENT_OPTIONS, markedSample, pixelsApart, renderPage, SAMPLE_1, wrapped } from './helpers/ocg-pdfs'

// Our final pass wrapped by optional content (layout/wrap.mjs, layout/own.mjs; design docs/route/ocg-erasure.md §2, §3, §7):
// sample-1's pages with points written in, wrapped, proved, and rendered by PDF.js in Node

describe('wrapFinal on sample-1 marked by its shows', () => {
  it('wraps every page, and with every group ON renders our page exactly (G1)', async () => {
    const { bytes, units } = await markedSample()
    const r = await wrapped(bytes)
    if ('refused' in r) throw new Error(`${r.refused}: ${r.why}`)
    expect(r.stats.wrapped).toBe(4)
    expect(r.stats.refusedPages).toBe(0)
    expect(r.stats.groups).toBe(units)
    expect(r.unhidden).toEqual([])
    for (const p of [1, 2]) expect(pixelsApart(await renderPage(bytes, p), await renderPage(r.bytes, p))).toBe(0)
  })
  it('hides a unit\'s ink with its group OFF, and nothing else of the page (G2, against the page without it)', async () => {
    const { bytes } = await markedSample({ pages: [2] })
    const r = await wrapped(bytes)
    if ('refused' in r) throw new Error(r.why)
    const all = await renderPage(r.bytes, 2), none = await renderPage(r.bytes, 2, { off: n => /^axt:u\d+$/.test(n) })
    expect(pixelsApart(all, none)).toBeGreaterThan(10_000)
    const one = await renderPage(r.bytes, 2, { off: n => n === 'axt:u0' }), rest = await renderPage(r.bytes, 2, { off: n => /^axt:u\d+$/.test(n) && n !== 'axt:u0' })
    // (u0's ink is what one-OFF loses, and all-but-u0 OFF keeps: the two changes add up to all-OFF's)
    expect(pixelsApart(all, one) + pixelsApart(all, rest)).toBe(pixelsApart(all, none))
  })
  it('gives the same bytes for the same inputs (T2.3)', async () => {
    const { bytes } = await markedSample({ pages: [3] })
    const a = await wrapped(bytes), b = await wrapped(bytes)
    if ('refused' in a || 'refused' in b) throw new Error('refused')
    expect(a.sha256).toBe(b.sha256)
  })
})

// ---- hand-written streams on sample-1's page 2 (its CMR font /F32 and math italic /F35), each run placed by an absolute Tm
/** a run: its text in /F32 at (x, y), maybe wrapped by points; `hide` written in 3 Tr (the oracle of hiding it) */
const run = (x: number, y: number, text: string, o: { before?: string; after?: string; hide?: boolean; font?: string } = {}) =>
  `${o.before ?? ''}BT /${o.font ?? 'F32'} 10.9091 Tf 1 0 0 1 ${x} ${y} Tm ${o.hide ? '3 Tr ' : ''}[${text}] TJ ${o.hide ? '0 Tr ' : ''}ET${o.after ?? ''}\n`
const unit = (id: number, x: number, y: number, text: string, hide = false) => run(x, y, text, { before: `/axt-${id}s ri `, after: ` /axt-${id}e ri`, hide })
const S1 = (hide = -1) => [unit(0, 72, 700, '(Order)-290(the)', hide === 0), unit(1, 72, 680, '(points)-290(b)27(y)', hide === 1), run(72, 660, '(and)'), unit(2, 72, 640, '(their)', hide === 2)].join('')
const only = (text: string) => (_: string, p: number) => (p === 2 ? text : _)
const S1_UNITS = [{ src: 'Order the' }, { src: 'points by' }, { src: 'their' }]
const off = (re: RegExp) => (n: string) => re.test(n)
const ok = <T extends object>(r: T): Exclude<T, { refused: string }> => { if ('refused' in r) { const x = r as unknown as { refused: string; why: string }; throw new Error(`${x.refused}: ${x.why}`) } return r as Exclude<T, { refused: string }> }

describe('the wrap on hand-written pages (S1, S6, S9–S12; G1, G2)', () => {
  it('hides exactly a unit: its group OFF is the page with its runs in 3 Tr (G2), and every group ON our page (G1)', async () => {
    const { bytes } = await markedSample({ pages: [2], edit: only(S1()) })
    const r = ok(await wrapped(bytes, { units: S1_UNITS }))
    expect(r.unhidden).toEqual([])
    // (on page 2 the units' three, and the ink unit of the run between them no unit owns, `and`: layout/ink-units.mjs; the
    // sample's other pages' text no unit of these three owns is ink units of its own)
    expect(r.ink.units.filter(u => u.rows.lines[0] === 2).map(u => [u.kind, u.pieces])).toEqual([['inkorphan', [{ t: 'text', s: 'and' }]]])
    expect(pixelsApart(await renderPage(bytes, 2), await renderPage(r.bytes, 2))).toBe(0)
    for (const u of [0, 1, 2]) {
      const { bytes: oracle } = await markedSample({ pages: [2], edit: only(S1(u)) })
      expect(pixelsApart(await renderPage(r.bytes, 2, { off: off(new RegExp(`^axt:u${u}$`)) }), await renderPage(oracle, 2)), `u${u}`).toBe(0)
    }
  })
  it('spells each unit: one whose source differs is the original\'s (spell), listed in the head\'s fields', async () => {
    const { bytes } = await markedSample({ pages: [2], edit: only(S1()) })
    const r = ok(await wrapped(bytes, { units: S1_UNITS.map((u, i) => (i === 1 ? { src: 'points' } : u)) }))
    expect(r.unhidden).toEqual([[1, 'spell']])
    expect(r.stats.unhidden.spell).toBe(1)
  })
  it('reads a placeholder after a paper\'s macro that no mark may stand before as the maker parts it, by the macro\'s text (an elsarticle .bbl\'s `\\DOIprefix\\doi{…}.`)', async () => {
    // (the macro's opening point alone, the \\doi after it unmarked, a full stop to the unit's end: with the text the probe showed
    // \\DOIprefix sets, the two's ink to where the full stop begins is the unit's; with none, no point ends it, and the unit is the
    // original's, as on next)
    const page = [run(72, 700, '(Tools)-290(of)-290(Radio.)', { before: '/axt-0s ri ' }), run(160, 700, '(doi:)', { before: '/axt-p0.3a ri ' }), run(185, 700, '(10.1007/978)'), run(250, 700, '(.)', { after: ' /axt-0e ri' })].join('')
    const { bytes } = await markedSample({ pages: [2], edit: only(page) })
    const units = [{ kind: 'reference', src: 'Tools of Radio. .', pieces: [{ t: 'text', s: 'Tools of Radio. ' }, { t: 'ph', src: '\\newblock' }, { t: 'text', s: ' ' }, { t: 'ph', src: '\\DOIprefix' }, { t: 'ph', src: '\\doi{10.1007/978}' }, { t: 'text', s: '.' }] }]
    const told = ok(await wrapped(bytes, { units, follows: undefined, texts: ['\\DOIprefix', 'doi:'] }))
    expect(told.unhidden).toEqual([])
    expect(pixelsApart(await renderPage(bytes, 2), await renderPage(told.bytes, 2))).toBe(0)
    const { bytes: oracle } = await markedSample({ pages: [2], edit: only(page.replace(/\[/g, '3 Tr [').replace(/\] TJ /g, '] TJ 0 Tr ')) })
    expect(pixelsApart(await renderPage(told.bytes, 2, { off: off(/^axt:u0(?:\.p)?$/) }), await renderPage(oracle, 2))).toBe(0)
    const none = ok(await wrapped(bytes, { units, follows: undefined, texts: null }))
    expect(none.unhidden).toEqual([[0, 'marks']])
  })
  it('closes a run at a foreign marked-content sequence and at q/Q, and keeps the foreign ones (S6, S12)', async () => {
    const text = [run(72, 700, '(Order)', { before: '/axt-0s ri /Span <</MCID 0>> BDC ', after: ' EMC' }), run(72, 680, '(the)', { before: 'q ', after: ' Q /axt-0e ri' })].join('')
    const { bytes } = await markedSample({ pages: [2], edit: only(text) })
    const r = ok(await wrapped(bytes, { units: [{ src: 'Order the' }] }))
    expect(r.stats.wrapped).toBe(1)
    expect(pixelsApart(await renderPage(bytes, 2), await renderPage(r.bytes, 2))).toBe(0)
    expect(pixelsApart(await renderPage(r.bytes, 2, { off: off(/^axt:u0$/) }), await renderPage((await markedSample({ pages: [2], edit: only('') })).bytes, 2))).toBe(0)
  })
  it('wraps a page whose /Contents is an array, a unit over its two streams (S12)', async () => {
    const text = `${run(72, 700, '(Order)', { before: '/axt-0s ri ' })}%SPLIT%${run(72, 680, '(the)', { after: ' /axt-0e ri' })}`
    const { bytes } = await markedSample({ pages: [2], edit: only(text) })
    const r = ok(await wrapped(bytes, { units: [{ src: 'Order the' }] }))
    expect(pixelsApart(await renderPage(r.bytes, 2, { off: off(/^axt:u0$/) }), await renderPage((await markedSample({ pages: [2], edit: only('') })).bytes, 2))).toBe(0)
  })
  it('leaves a painted rule in a unit\'s range standing with the unit hidden (S11; a footnote\'s rule, the pixel tier)', async () => {
    const text = `/axt-0s ri ${run(72, 700, '(Order)')}q 72 690 100 0.5 re f Q /axt-0e ri\nq 72 600 100 0.5 re f Q\n`
    const { bytes } = await markedSample({ pages: [2], edit: only(text) })
    const r = ok(await wrapped(bytes, { units: [{ src: 'Order' }] }))
    const without = (await markedSample({ pages: [2], edit: only('q 72 690 100 0.5 re f Q\nq 72 600 100 0.5 re f Q\n') })).bytes
    expect(pixelsApart(await renderPage(r.bytes, 2, { off: off(/^axt:u0$/) }), await renderPage(without, 2))).toBe(0)
  })
  it('refuses a page with an owned run in a clipping text mode, writing nothing of ours on it (S9)', async () => {
    const text = `/axt-0s ri BT /F32 10.9091 Tf 1 0 0 1 72 700 Tm 4 Tr [(Order)] TJ ET /axt-0e ri\n0 0 612 792 re f\n`
    const { bytes } = await markedSample({ pages: [2], edit: only(text) })
    const r = ok(await wrapped(bytes, { units: [{ src: 'Order' }] }))
    expect(r.stats.refusedPages).toBe(1)
    expect(r.stats.unhidden.page).toBe(1)
    expect(r.unhidden).toEqual([])
    expect(r.bytes).toEqual(bytes)
  })
  it('keeps a foreign /OCProperties and lists ours ON beside it (S10)', async () => {
    const text = run(72, 700, '(Order)', { before: '/axt-0s ri /OC /fB BDC ', after: ' EMC /axt-0e ri' }) + unit(1, 72, 680, '(the)')
    const { bytes } = await markedSample({ pages: [2], edit: only(text), foreignOC: true })
    const r = ok(await wrapped(bytes, { units: [{ src: 'Order' }, { src: 'the' }] }))
    expect(pixelsApart(await renderPage(bytes, 2), await renderPage(r.bytes, 2))).toBe(0)
    // (u0 lies inside the paper's own OFF layer: hiding it changes nothing; u1's hiding is exact)
    expect(pixelsApart(await renderPage(r.bytes, 2), await renderPage(r.bytes, 2, { off: off(/^axt:u0$/) }))).toBe(0)
    expect(pixelsApart(await renderPage(r.bytes, 2), await renderPage(r.bytes, 2, { off: off(/^axt:u1$/) }))).toBeGreaterThan(0)
  })
  it('splits a show two groups share, as the remover\'s chunks, its glyphs and numbers kept (S7)', async () => {
    const text = `/axt-0s ri ${run(72, 700, '(Order)-290(points)-290(the)-200(blo)', { before: '/axt-p0.1a ri ' })} /axt-0e ri\n`.replace('/axt-0s ri /axt-p0.1a ri BT /F32 10.9091 Tf 1 0 0 1 72 700 Tm [(Order)', '/axt-0s ri BT /F32 10.9091 Tf 1 0 0 1 72 700 Tm [(Order)] TJ /axt-p0.1a ri [')
    const { bytes } = await markedSample({ pages: [2], edit: only(text) })
    const follows = (name: string) => (name === 'p0.1a' ? { closing: false, want: 'the', ends: ['0e'], blocked: false, group: [] } : null)
    const r = ok(await wrapped(bytes, { units: [{ src: 'Order theblo' }], follows }))
    expect(r.stats.split).toBe(1)
    expect(r.unhidden).toEqual([])
    const a = await renderPage(bytes, 2), b = await renderPage(r.bytes, 2)
    // (E4 variant (a): 0 px outside the split glyphs, few inside them)
    expect(pixelsApart(a, b)).toBeLessThan(0.001 * a.width * a.height)
  })
  it('climbs the bounds\' ladder: placeholders merged into the text past GROUPS_PAGE, the page refused past it still (S3, S4)', async () => {
    const text = unit(0, 72, 700, '(Order)').replace('[(Order)] TJ', '[(Order)] TJ /axt-p0.1a ri [(the)] TJ /axt-p0.1b ri') + unit(1, 72, 680, '(points)')
    const { bytes } = await markedSample({ pages: [2], edit: only(text) })
    const units = [{ src: 'Order' }, { src: 'points' }]
    const merged = ok(await wrapped(bytes, { units, bounds: { groupsPage: 2 } }))
    expect(merged.unhidden).toEqual([[0, 'bounds']])
    expect(merged.stats.groups).toBe(2)
    const refused = ok(await wrapped(bytes, { units, bounds: { groupsPage: 1 } }))
    expect(refused.stats.refusedPages).toBe(1)
    const two = (await markedSample({ pages: [2, 3] })).bytes
    const first = ok(await wrapped(two)).stats
    const doc = ok(await wrapped(two, { bounds: { groupsDoc: first.groups - 1 } }))
    expect(doc.stats.wrapped).toBe(1)
    expect(doc.stats.refusedPages).toBe(1)
    expect(doc.stats.groups).toBeLessThan(first.groups)
  })
})

describe('both forms of the base from one wrapped pass (§2.1, T2.5)', () => {
  it('the delta over the original carries our /OCProperties alone, proves, and renders as the full base with groups OFF', async () => {
    const PL = await import('@cantoo/pdf-lib')
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const { deltaOf, proveDelta } = await import('@/pdf-reader/engine/layout/delta.mjs')
    const { readFileSync } = await import('node:fs')
    const orig = new Uint8Array(readFileSync(SAMPLE_1))
    const { bytes } = await markedSample()
    const r = ok(await wrapped(bytes))
    const d = await deltaOf(orig, r.bytes, { PL: PL as never })
    if ('refused' in d) throw new Error(d.why)
    const proof = await proveDelta(orig, d.delta, r.bytes, { PL: PL as never, getDocument: getDocument as never, documentOptions: DOCUMENT_OPTIONS, replaced: d.replaced })
    expect(proof.ok).toBe(true)
    const composed = new Uint8Array(orig.length + d.delta.length)
    composed.set(orig)
    composed.set(d.delta, orig.length)
    for (const p of [1, 2]) {
      const o = { off: off(/^axt:u[0-9]*[02468]$/) }
      expect(pixelsApart(await renderPage(composed, p, o), await renderPage(r.bytes, p, o)), `page ${p}`).toBe(0)
    }
    // (the proof refuses a delta whose catalog is not the original's but for /OCProperties: a key changed)
    const text = Array.from(d.delta, c => String.fromCharCode(c)).join('')
    const forged = Uint8Array.from(text.replace('/OCProperties', '/OCPropertiez'), c => c.charCodeAt(0))
    const bad = await proveDelta(orig, forged, r.bytes, { PL: PL as never, getDocument: getDocument as never, documentOptions: DOCUMENT_OPTIONS, replaced: d.replaced })
    expect(bad.ok).toBe(false)
  })

  it('proves a delta over an original whose catalog holds a direct value naming a replaced page (2610.20030\'s /Names)', async () => {
    // (arXiv's catalog of 2610.20030 holds its name tree directly: /Names << /Dests << /Kids [...] >> >>, whose destinations name
    // its pages. The delta writes the catalog again to carry our /OCProperties, every other key as the original's text; the
    // proof compared a direct value by what its references name, and a replaced page's object is ours: refused, so the paper
    // of two toplevel sources, whose base of 8 pages of 12 only a delta holds, lost its layout)
    const PL = await import('@cantoo/pdf-lib')
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const { deltaOf, proveDelta } = await import('@/pdf-reader/engine/layout/delta.mjs')
    const { appendSection } = await import('@/pdf-reader/engine/layout/section.mjs')
    const { startxrefOf } = await import('@/pdf-reader/engine/layout/tail.mjs')
    const { readFileSync } = await import('node:fs')
    const sample = new Uint8Array(readFileSync(SAMPLE_1))
    // (sample-1 with its catalog written again by an update, a direct /Names whose destination names its page 1)
    const doc = await PL.PDFDocument.load(sample, { updateMetadata: false })
    type Ref = { objectNumber: number; generationNumber: number }
    const [first, second] = doc.getPages()
    if (!first || !second) throw new Error('sample-1 has two pages at least')
    const root = doc.context.trailerInfo.Root as unknown as Ref, page1 = first.ref
    const ref = (r: Ref) => `${r.objectNumber} ${r.generationNumber} R`
    const ents = doc.catalog.entries().filter(([k]) => k.asString() !== '/Names').map(([k, v]) => ` ${k.toString()} ${v.toString()}`).join('')
    const cat = `${root.objectNumber} ${root.generationNumber} obj\n<<${ents} /Names << /Dests << /Names [(axt.first) [${ref(page1)} /Fit]] >> >> >>\nendobj\n`
    const prev = startxrefOf(sample) as number
    const kind = Array.from(sample.subarray(prev, prev + 4), c => String.fromCharCode(c)).join('') === 'xref' ? 'table' : 'stream'
    const { Info, ID } = doc.context.trailerInfo
    const section = appendSection({ end: sample.length, objects: [[root.objectNumber, root.generationNumber, Uint8Array.from(cat, c => c.charCodeAt(0))]], kind, prev, size: doc.context.largestObjectNumber + 1, trailer: { root: ref(root), info: Info ? String(Info) : undefined, id: ID ? String(ID) : undefined } })
    const orig = new Uint8Array(sample.length + section.bytes.length)
    orig.set(sample)
    orig.set(section.bytes, sample.length)
    const { bytes } = await markedSample()
    const r = ok(await wrapped(bytes))
    const d = await deltaOf(orig, r.bytes, { PL: PL as never })
    if ('refused' in d) throw new Error(d.why)
    expect(d.replaced[0]?.[0]).toBe(1)
    const prove = (delta: Uint8Array) => proveDelta(orig, delta, r.bytes, { PL: PL as never, getDocument: getDocument as never, documentOptions: DOCUMENT_OPTIONS, replaced: d.replaced })
    const proof = await prove(d.delta)
    expect(proof.ok, proof.ok ? '' : proof.why).toBe(true)
    // (and a direct value of the catalog written otherwise still fails it: the destination's name changed)
    const text = Array.from(d.delta, c => String.fromCharCode(c)).join('')
    expect(text).toContain('(axt.first)')
    expect((await prove(Uint8Array.from(text.replace('(axt.first)', '(axt.other)'), c => c.charCodeAt(0)))).ok).toBe(false)
    // (or one of its references renumbered: the destination naming another page)
    const page2 = second.ref
    expect((await prove(Uint8Array.from(text.replace(`[${ref(page1)} /Fit]`, `[${ref(page2)} /Fit]`), c => c.charCodeAt(0)))).ok).toBe(false)
  })
})
