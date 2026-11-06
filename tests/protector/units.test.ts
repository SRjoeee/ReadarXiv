// The shim between the protector's wire and the chain's units (src/core/protector/units.ts, src/core/pipeline/units.ts):
// a wire read as a unit, a result written back as that wire, sentences as wire lengths; and over the fixtures, every block
// through the package's own Microsoft and Google adapters on an echoing endpoint, written back and rehydrated: each
// element in its place (hard rule 1's DOM, the decision's "a Result becomes what the renderer takes today")
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { accept, asOut, type Fetch, google, microsoft } from '@readarxiv/translate'
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
    const r = unitOfWire('u', wire, 'tags', { kindOf: n => (n === 1 ? 'math' : 'other'), sentences: true })
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
