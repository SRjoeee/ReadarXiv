// The shim between the protector's wire and the chain's units (src/core/protector/units.ts, src/core/pipeline/units.ts):
// a wire read as a unit, a result written back as that wire, sentences as wire lengths; and over the fixtures, every block
// through the package's own Microsoft and Google adapters on an echoing endpoint, written back and rehydrated: each
// element in its place (hard rule 1's DOM, the decision's "a Result becomes what the renderer takes today")
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { accept, asOut, chainOf, type Fetch, type FetchInit, type FetchReply, google, microsoft, type Piece, type Result, type UnitIn } from '@readarxiv/translate'
import { describe, expect, it } from 'vitest'
import { extract } from '@/core/extractor'
import type { Segment } from '@/core/pipeline/batches'
import { unitOfSegment } from '@/core/pipeline/units'
import { rehydrate, serialize, type WireFormat } from '@/core/protector'
import { alignmentOf, unitOfWire, wireOfContent } from '@/core/protector/units'
import { el, htmlOf } from './helpers'

const FIXTURES = join(import.meta.dirname, '../fixtures/arxiv')
const none: Fetch = async () => {
  throw new Error('no network')
}

describe('a wire as a unit, and back', () => {
  it('tags: a void is an element, a pair a span that must come back, the escapes read; the content written back is the wire', () => {
    const wire = 'Let <x id="1"/> be <t id="2">a &amp; b</t> &lt;ok&gt;. '
    const r = unitOfWire('u', wire, 'tags', { elementOf: n => ({ kind: n === 1 ? 'math' : 'other' }), sentences: true })
    expect(r.unit).toEqual({
      id: 'u',
      sentences: true,
      content: [
        { t: 'text', s: 'Let ' },
        { t: 'el', id: 'x1', kind: 'math' },
        { t: 'text', s: ' be ' },
        { t: 'span', id: 't2', style: 'other', must: true, content: [{ t: 'text', s: 'a & b' }] },
        { t: 'text', s: ' <ok>. ' },
      ],
    })
    expect(wireOfContent(asOut(r.unit.content), r).wire).toBe(wire)
  })
  it('markers: a marker is an element, an escaped @ a character; written back marker for marker', () => {
    const wire = 'mail @@ host @a# and @b#.'
    const r = unitOfWire('u', wire, 'markers')
    expect(r.unit.content).toEqual([
      { t: 'text', s: 'mail @ host ' },
      { t: 'el', id: 'x1', kind: 'other' },
      { t: 'text', s: ' and ' },
      { t: 'el', id: 'x2', kind: 'other' },
      { t: 'text', s: '.' },
    ])
    expect(wireOfContent(asOut(r.unit.content), r).wire).toBe(wire)
  })
  it("a translation without the source's edge white space gets it back, one with its own keeps that", () => {
    const r = unitOfWire('u', ' Word <x id="1"/> ', 'tags')
    expect(wireOfContent([{ t: 'text', s: 'Wort' }, { t: 'el', id: 'x1' }], r).wire).toBe(' Wort<x id="1"/> ')
    expect(wireOfContent([{ t: 'text', s: ' Wort ' }, { t: 'el', id: 'x1' }], r).wire).toBe(' Wort <x id="1"/> ')
  })
  it("a translator's sentences become wire lengths that tile both wires; a sentence at a pair begins before its tag", () => {
    const wire = 'One &amp; two. <t id="1">Three</t> four.'
    const r = unitOfWire('u', wire, 'tags', { sentences: true })
    const back = wireOfContent([{ t: 'text', s: 'Un. ' }, { t: 'span', id: 't1', content: [{ t: 'text', s: 'Tres' }] }, { t: 'text', s: ' cuatro.' }], r)
    // projection: "One & two. Three four." — the second sentence at 11; the translation's ("Un. Tres cuatro.") at 4
    const a = alignmentOf({ src: [11], tr: [4] }, r, wire, back)
    expect(a).toEqual({ source: [15, wire.length - 15], target: [4, back.wire.length - 4] })
    expect(wire.slice(15)).toBe('<t id="1">Three</t> four.')
    expect(alignmentOf({ src: [11, 3], tr: [4, 3] }, r, wire, back)).toBeUndefined()
  })
})

describe('a segment of the page as a unit (pipeline/units.ts)', () => {
  const segment = (html: string, unit = 'p'): Segment => {
    const target = el(html)
    const p = serialize(target, 'tags')
    return { id: 'b', text: p.text, block: { id: 'b', kind: 'text', el: target, unit } as never, protected: p }
  }
  it("tags: an element's kind is the rule file's — a citation is a word, a footnote's mark an annotation, a formula a formula", () => {
    const s = segment('<p class="ltx_p">See <cite class="ltx_cite">[<a class="ltx_ref" href="#b1">1</a>]</cite> and <math class="ltx_Math"><mi>x</mi></math>.</p>')
    const kinds = unitOfSegment(s, 'tags').unit.content.flatMap(p => (p.t === 'el' ? [p.kind] : []))
    expect(kinds).toEqual(['other', 'math'])
  })
  it('a reference unit is never cut on the tags wire and aligned whole; on the markers wire Microsoft reports its own', () => {
    const bib = segment('<span class="ltx_bibblock">A. Author. Sci. Rep. 14 (2024).</span>', 'bibblock')
    expect(unitOfSegment(bib, 'tags')).toMatchObject({ whole: true, unit: { id: 'b' } })
    expect(unitOfSegment(bib, 'tags').unit.sentences).toBeUndefined()
    const m = serialize(bib.block.el, 'markers')
    expect(unitOfSegment({ ...bib, text: m.text, protected: m }, 'markers')).toMatchObject({ whole: false, unit: { sentences: true } })
  })
  it("on the markers wire every element keeps its own marker: side by side, Microsoft's adapter writes the protector's markers", () => {
    const s = segment('<p class="ltx_p">Pair <math class="ltx_Math"><mi>u</mi></math> <math class="ltx_Math"><mi>v</mi></math> here.</p>')
    const m = serialize(s.block.el, 'markers')
    const unit = unitOfSegment({ ...s, text: m.text, protected: m }, 'markers').unit
    expect(microsoft({ fetch: none }).write(unit, 'zh-Hans')).toBe(m.text)
  })
  it("a page's unit is strict on both wires: Microsoft's marker come back without its `#` refuses the reply, which the PDF call site's unit reads", () => {
    const s = segment('<p class="ltx_p">The norm of <math class="ltx_Math"><mi>u</mi></math> is small.</p>')
    const m = serialize(s.block.el, 'markers')
    const page = unitOfSegment({ ...s, text: m.text, protected: m }, 'markers').unit
    expect(page.strict).toBe(true)
    expect(unitOfSegment(s, 'tags').unit.strict).toBe(true)
    // the reader's call site (pdf-reader/session/translate.mjs) reads its engine's wires with the shim and states nothing
    const pdf = unitOfWire('0', m.text, 'markers', { sentences: true }).unit
    expect(pdf.strict).toBeUndefined()
    const ms = microsoft({ fetch: none })
    const wire = ms.write(page, 'zh-Hans')
    expect(wire).toBe('The norm of @a# is small.')
    expect(ms.write(pdf, 'zh-Hans')).toBe(wire)
    const reply = (text: string) => JSON.stringify({ text })
    expect(ms.read(page, reply('The norm of @a is small.'))).toBeNull()
    expect(ms.read(pdf, reply('The norm of @a is small.'))).not.toBeNull()
    // a doubled `#` is the marker's (#320), on the page as before
    expect(ms.read(page, reply('The norm of @a## is small.'))?.content).toEqual([{ t: 'text', s: 'The norm of ' }, { t: 'el', id: 'x1' }, { t: 'text', s: ' is small.' }])
  })
})

/** the junctions of a number and an inline formula the fixture 2507.00150.html holds on the tags wire (the test's own reading) */
const JUNCTIONS_2507 = 11

// (a number an author sets flush against an inline formula, `32$\times$32`, is held off the wire with the formula and put back
// beside it: packages/translate words.ts, PDF-READER §18.47. The page's tags wire reaches the rule: LaTeXML writes such a number
// as text right beside a `<math>`, which the rule file states `math`, the kind the rule reads. Its markers wire does not: the
// protector sets a space of its own between a marker and a word or a number it touches (serialize.ts makeTracker, DESIGN §6.2,
// taken off again as the translation is filled back), so the unit states "32 ⟦×⟧ 32", no number flush: another shape, which the
// rule is not widened to)
describe('a number set flush against an inline formula goes on no wire and comes back beside it, on the page’s tags wire', () => {
  /** the unit through the chain with one translator over an endpoint that echoes: the units the translator was handed, the
   *  wires, and the row */
  const viaChain = async (unit: UnitIn, format: WireFormat) => {
    const sent: string[] = []
    const fetch = (async (_url: string, init: FetchInit) => {
      const body = format === 'markers'
        ? JSON.stringify((JSON.parse(init.body) as string[]).map(w => (sent.push(w), { translations: [{ text: w, to: 'zh-Hans' }] })))
        : JSON.stringify([(JSON.parse(init.body) as [[string[]]])[0][0].map(w => (sent.push(w), w))])
      return { ok: true, status: 200, headers: { get: () => null }, text: async () => body } satisfies FetchReply
    }) as Fetch
    const t = format === 'markers' ? microsoft({ fetch }) : google({ fetch })
    const handed: UnitIn[] = []
    const translator = { ...t, write: (u: UnitIn, target: string) => (handed.push(u), t.write(u, target)) }
    const results: Result[] = []
    for await (const r of chainOf().translate([unit], 'zh-Hans', { translators: [translator] })) results.push(r)
    return { handed, sent, result: results[0] }
  }
  const plain = (html: string) => html.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')
  it('a block of our own (`32<math>×</math>32`): the tags wire holds the formula alone; the markers wire sends the protector’s spaced number; each row written back is the block', async () => {
    const target = el('<p class="ltx_p">The inputs are 32<math class="ltx_Math"><mo>×</mo></math>32 images.</p>')
    for (const format of ['markers', 'tags'] as const) {
      const p = serialize(target, format)
      const from = unitOfSegment({ id: 'b', text: p.text, block: { id: 'b', kind: 'text', el: target, unit: 'p' } as never, protected: p }, format)
      const { sent, result } = await viaChain(from.unit, format)
      expect(sent).toEqual([format === 'markers' ? 'The inputs are 32 @a# 32 images.' : 'The inputs are <b translate=no>x1</b> images.'])
      if (!result?.ok) throw new Error(`not translated: ${JSON.stringify(result)}`)
      expect(plain(htmlOf(rehydrate(wireOfContent(result.content, from).wire, p, target.ownerDocument)))).toBe(plain(htmlOf(rehydrate(p.text, p, target.ownerDocument))))
    }
  })
  it('2507.00150.html: at every junction of a number and an inline formula the translator is handed no digit beside the formula, and each block comes back whole', async () => {
    const doc = new DOMParser().parseFromString(readFileSync(join(FIXTURES, '2507.00150.html'), 'utf8'), 'text/html')
    /** each formula and side where the text beside it, up to white space, holds a digit and no letter: what the rule holds */
    const junctionsOf = (content: readonly Piece[]) => {
      const out: [string, 'before' | 'after'][] = []
      const run = (s: string) => /\p{N}/u.test(s) && !/[\p{L}\p{M}]/u.test(s)
      const walk = (ps: readonly Piece[]) => {
        for (const [i, q] of ps.entries()) {
          if (q.t === 'span') walk(q.content)
          if (q.t !== 'el' || q.kind !== 'math') continue
          const before = ps[i - 1]
          const after = ps[i + 1]
          if (before?.t === 'text' && run(/\S*$/u.exec(before.s)?.[0] ?? '')) out.push([q.id, 'before'])
          if (after?.t === 'text' && run(/^\S*/u.exec(after.s)?.[0] ?? '')) out.push([q.id, 'after'])
        }
      }
      walk(content)
      return out
    }
    /** what stands right beside element `id` on a side in a unit's content: a text's character, '' at an edge or an element */
    const besideOf = (content: readonly Piece[], id: string, side: 'before' | 'after'): string | null => {
      for (const [i, q] of content.entries()) {
        if (q.t === 'span') {
          const got = besideOf(q.content, id, side)
          if (got !== null) return got
        } else if (q.t === 'el' && q.id === id) {
          const n = content[side === 'before' ? i - 1 : i + 1]
          return n?.t === 'text' ? (side === 'before' ? n.s.slice(-1) : n.s.slice(0, 1)) : ''
        }
      }
      return null
    }
    let junctions = 0
    for (const b of extract(doc)) {
      const targets = b.kind === 'text' ? [b.el] : b.cells.flatMap(c => (c.numeric ? [] : [c.el]))
      for (const target of targets) {
        const p = serialize(target, 'tags')
        const from = unitOfSegment({ id: 'b', text: p.text, block: b, protected: p }, 'tags')
        const held = junctionsOf(from.unit.content)
        if (!held.length) continue
        junctions += held.length
        const { handed, result } = await viaChain(from.unit, 'tags')
        expect(handed.length, target.id).toBeGreaterThan(0)
        for (const u of handed)
          for (const [id, side] of held) {
            const beside = besideOf(u.content, id, side)
            expect(beside, `${target.id} ${id}: handed`).not.toBeNull()
            expect(/\p{N}/u.test(beside ?? ''), `${target.id} ${id} ${side}`).toBe(false)
          }
        if (!result?.ok) throw new Error(`${target.id}: not translated`)
        expect(plain(htmlOf(rehydrate(wireOfContent(result.content, from).wire, p, doc))), target.id).toBe(plain(htmlOf(rehydrate(p.text, p, doc))))
      }
    }
    expect(junctions).toBe(JUNCTIONS_2507)
  })
})

/** a reply the endpoint would give if it translated nothing: the wire back as it was sent */
const echoed = (wire: string, format: WireFormat) => (format === 'markers' ? JSON.stringify({ text: wire }) : wire)

describe('every fixture block through the package adapters on an echo, written back and rehydrated: each element in its place', () => {
  const files = readdirSync(FIXTURES).filter(f => f.endsWith('.html')).sort()
  for (const format of ['markers', 'tags'] as const) {
    for (const f of files) {
      it(`${format}: ${f}`, () => {
        const t = format === 'markers' ? microsoft({ fetch: none }) : google({ fetch: none })
        const doc = new DOMParser().parseFromString(readFileSync(join(FIXTURES, f), 'utf8'), 'text/html')
        let blocks = 0
        for (const b of extract(doc)) {
          const targets = b.kind === 'text' ? [b.el] : b.cells.flatMap(c => (c.numeric ? [] : [c.el]))
          for (const target of targets) {
            const p = serialize(target, format)
            const s: Segment = { id: 'b', text: p.text, block: b, protected: p }
            const from = unitOfSegment(s, format)
            const read = t.read(from.unit, echoed(t.write(from.unit, 'zh-Hans'), format))
            expect(read, `${target.id}: read back`).not.toBeNull()
            expect(accept(from.unit, read?.content ?? []).ok, `${target.id}: accepted`).toBe(true)
            const back = wireOfContent(read?.content ?? [], from).wire
            // the source's non-breaking and typographic spaces go out as one space (the adapters collapse every white
            // space, Unicode's included) and so come back
            const plain = (html: string) => html.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')
            expect(plain(htmlOf(rehydrate(back, p, doc))), target.id).toBe(plain(htmlOf(rehydrate(p.text, p, doc))))
            blocks++
          }
        }
        expect(blocks).toBeGreaterThan(0)
      })
    }
  }
})
