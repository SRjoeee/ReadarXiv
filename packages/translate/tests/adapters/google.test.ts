import { describe, expect, it } from 'vitest'
import { google, readTagged } from '../../src/adapters/google.ts'
import type { FetchInit, Piece } from '../../src/contract.ts'
import { NEVER, scriptedFetch } from '../../src/testing/fakes.ts'
import { translatorSuite } from '../../src/testing/suite.ts'
import { el, span, t, unit } from '../pieces.ts'
import { GOOGLE_REPLIES, DISPLAY_ENDS, HEAD_STOP, LABEL_AFTER_BREAK, UNITS } from './fixtures.ts'

/** the endpoint giving each item back as its translation */
export const googleEcho = (_url: string, init: FetchInit) => {
  const [[items]] = JSON.parse(init.body) as [[string[], string, string], string]
  return { status: 200, body: JSON.stringify([items]) }
}

translatorSuite('google', {
  make: (fetch) => google({ fetch }),
  target: 'zh-Hans',
  units: [...UNITS, HEAD_STOP, DISPLAY_ENDS],
  echo: googleEcho,
  replies: GOOGLE_REPLIES,
  faults: [
    {
      name: '429',
      answer: { status: 429, body: '', headers: { 'retry-after': '3' } },
      remedy: 'cool',
      code: 'rate',
      retryAfterMs: 3_000,
    },
    { name: '500', answer: { status: 500, body: '' }, remedy: 'again', code: 'network' },
    { name: 'the network', answer: { network: true }, remedy: 'again', code: 'network' },
    { name: '400', answer: { status: 400, body: 'bad' }, remedy: 'halve' },
    { name: '403 of a keyless endpoint', answer: { status: 403, body: '' }, remedy: 'again', code: 'network' },
    { name: 'not JSON', answer: { status: 200, body: 'nope' }, remedy: 'again', code: 'malformed' },
    { name: 'the wrong count', answer: { status: 200, body: '[["one"]]' }, remedy: 'again', code: 'malformed' },
  ],
})

describe('google: the wire, byte for byte (golden)', () => {
  const t = google({ fetch: scriptedFetch(googleEcho).fetch })
  it('writes each fixture unit as tags, with boundary markers where a unit lights by sentence', () => {
    expect(UNITS.map((u) => t.write(u, 'zh-Hans'))).toEqual([
      'We study the problem. <x id="1"/>It is hard.',
      'Let <x id="1"/> be as in <x id="2"/>. <x id="4"/>See Section <x id="3"/> for more.',
      '<t id="1">Bold words</t> and <t id="2">a link <t id="3">inside</t></t> end.',
      'We have<x id="1"/>. <x id="2"/>Then we go on.',
      'Values <x id="1"/> <x id="2"/>, and <x id="3"/><x id="4"/> hold.',
      '<t id="1">Whole bold heading</t>',
      '<t id="1">Setup:</t> we train the model for 3 epochs.',
      'a &lt; b &amp; c &gt; d @ home # 95<x id="1"/> accuracy.',
      'A link around a formula: <x id="1"/> done.',
      'Words<x id="1"/>. <x id="2"/>More words follow here.',
      'It matters on seasonal timescales<x id="1"/>, alters the jet stream<x id="2"/> and the surface<x id="3"/>, as the quasi-biennial oscillation and El Ni<x id="4"/>o southern oscillations do.',
      'We use the 30 km zonal wind threshold:<x id="1"/> thresholds<x id="2"/> hold.',
      'We can quantify the forecast skill of the emulator using the RMSE: <x id="1"/>',
      'The model <x id="1"/> reads.',
      'At each step the model is auto-regressive<x id="1"/>, consuming the previously generated symbols.',
      'We reach 95<x id="1"/> accuracy.',
      'a 3<x id="1"/>10 speed-up',
    ])
  })
  it('asks the endpoint its own shape: [[items, from, to], client], its public key, the target by region', async () => {
    const f = scriptedFetch(googleEcho)
    for await (const _ of google({ fetch: f.fetch }).send(['one'], { target: 'zh-Hans' }, NEVER)) {
      // drained
    }
    expect(JSON.parse(f.requests[0]?.init.body ?? '')).toEqual([[['one'], 'en', 'zh-CN'], 'wt_lib'])
    expect(f.requests[0]?.init.headers['Content-Type']).toBe('application/json+protobuf')
  })
})

describe('google: sentences from boundary markers', () => {
  it("where they came back, once each and in order, are the translation's sentence starts", () => {
    const r = readTagged(UNITS[0] as never, '我们研究这个问题。<x id="1"/>这很难。')
    expect(r).toEqual({ content: [{ t: 'text', s: '我们研究这个问题。这很难。' }], sentences: { src: [22], tr: [9] } })
  })
  it('a marker reordered or doubled gives no sentences, the translation stays', () => {
    const u = UNITS[1] as never
    const r = readTagged(u, '设<x id="1"/>如<x id="2"/>所述。<x id="4"/><x id="4"/>更多内容见第<x id="3"/>节。')
    expect(r?.sentences).toBeUndefined()
    expect(r?.content.filter((p) => p.t === 'el').length).toBe(3)
  })
})

// (the sentences a unit is asked in, as the source reader states them: a tie is an element of kind `other`, `\ref` one of
// kind `ref`, `\cite` one of kind `cite`; the text the source's own, its line ends with it. 1512.03385v1's `Fig.~\ref{…}`
// was translated alone as the fruit by Microsoft, whose own sentences cut there; this wire's cutter is the one asked here)
describe('google: the sentences a unit is asked in, where a reference or a citation follows a full stop', () => {
  const g = google({ fetch: scriptedFetch(googleEcho).fetch })
  /** the wire split at its boundary markers (ids past the unit's own elements and spans), each element `#` */
  const asked = (content: Piece[]): string[] => {
    const u = unit('u', content, true)
    const own = (ps: readonly Piece[]): number =>
      ps.reduce((n, p) => (p.t === 'el' ? n + 1 : p.t === 'span' ? n + 1 + own(p.content) : n), 0)
    const n = own(content)
    return g
      .write(u, 'zh-Hans')
      .replace(/<x id="(\d+)"\/>/g, (_, d: string) => (Number(d) > n ? '‖' : '#'))
      .replace(/<\/?t(?: id="\d+")?>/g, '')
      .split('‖')
      .map((s) => s.trim())
  }
  it('an abbreviation’s stop before a reference ends no sentence', () => {
    expect(
      asked([
        span('h', 'bold', [t('Analysis of Layer Responses.')], true),
        t('\nFig.'),
        el('tie', 'other'),
        el('r', 'ref'),
        t(' shows the standard deviations (std) of the layer responses. The responses are small.'),
      ]),
    ).toEqual([
      'Analysis of Layer Responses.',
      'Fig.## shows the standard deviations (std) of the layer responses.',
      'The responses are small.',
    ])
    expect(
      asked([t('We obtain Eq.'), el('tie', 'other'), t('('), el('r', 'ref'), t(') from the bound. It holds.')]),
    ).toEqual(['We obtain Eq.#(#) from the bound.', 'It holds.'])
    expect(
      asked([t('As discussed in Sec.'), el('tie', 'other'), el('r', 'ref'), t(' below, it holds. The rest follows.')]),
    ).toEqual(['As discussed in Sec.## below, it holds.', 'The rest follows.'])
    expect(asked([t('As listed in Table'), el('tie', 'other'), el('r', 'ref'), t('. The rest follows.')])).toEqual([
      'As listed in Table##.',
      'The rest follows.',
    ])
  })
  it('a citation after an abbreviation’s stop ends no sentence, tied or spaced', () => {
    expect(
      asked([t('Eiras et al.'), el('tie', 'other'), el('c', 'cite'), t(' further extended it. Then more.')]),
    ).toEqual(['Eiras et al.## further extended it.', 'Then more.'])
    expect(asked([t('Pham et al. '), el('c', 'cite'), t(' classify safety examples. Then more.')])).toEqual([
      'Pham et al. # classify safety examples.',
      'Then more.',
    ])
  })
  it('a citation after a sentence’s stop and white space opens the next sentence', () => {
    expect(asked([t('This is as shown. '), el('c', 'cite'), t(' reports that it fails. Then more.')])).toEqual([
      'This is as shown.',
      '# reports that it fails.',
      'Then more.',
    ])
  })
  it('a line end of the source is a space: no sentence ends there', () => {
    expect(asked([t('We show the standard\ndeviations of the layer\nresponses.\nThe rest follows.')])).toEqual([
      'We show the standard deviations of the layer responses.',
      'The rest follows.',
    ])
  })
})

// (2608.25210v2's `\topic{…}`: the stop the paper's macro sets after its argument, which its source does not write)
describe('google: a stop TeX sets at a group’s end', () => {
  it('is written before the group’s close, and read by the cutter as the sentence’s end', () => {
    const t = google({ fetch: scriptedFetch(googleEcho).fetch })
    expect(t.write(HEAD_STOP, 'zh-Hans')).toBe(
      '<t id="1">Current methods are not reliable.</t> <x id="3"/>To infer the source, one could rank sentences. <x id="4"/>We call it <t id="2">verifiable sources.</t> <x id="5"/>Then we go on.',
    )
  })
})

// (a line end an element states is the markers wire's, where Microsoft cuts its sentence: the tags wire, whose sentences our
// cutter reads, writes the unit as it did before the source reader stated it, and reads no mark after it as the element's)
describe('google: a stop that is a line end', () => {
  it('is written by neither the wire nor the cutter: the unit goes as it did with no stop stated', () => {
    const t = google({ fetch: scriptedFetch(googleEcho).fetch })
    const strip = (ps: readonly Piece[]): Piece[] =>
      ps.map((p) =>
        p.t === 'el' ? { t: 'el', id: p.id, kind: p.kind } : p.t === 'span' ? { ...p, content: strip(p.content) } : p,
      )
    expect(t.write(LABEL_AFTER_BREAK, 'zh-Hans')).toBe(
      t.write({ ...LABEL_AFTER_BREAK, content: strip(LABEL_AFTER_BREAK.content) }, 'zh-Hans'),
    )
  })
})

// (a display that states no stop of its own, at its sentence's end: the next sentence begins after it, its first letter upper
// case; the owner's report of 2026-11-09 on 2609.33403v1, one sentence to every translator across both displays)
describe('google: a display that states no stop of its own', () => {
  it('ends its sentence where the text after it begins one: a stop after it, and the cutter cuts there; not where it goes on', () => {
    const g = google({ fetch: scriptedFetch(googleEcho).fetch })
    expect(g.write(DISPLAY_ENDS, 'zh-Hans')).toBe(
      'Each part is formalized as: <x id="1"/>. <x id="3"/>The next field is a list of effects, formalized as a tuple: <x id="2"/> where kind is its kind.',
    )
  })
  it("reads the reply's stop after it as the one the wire wrote, taken back", () => {
    const r = readTagged(
      DISPLAY_ENDS,
      '每个部分形式化为：<x id="1"/>。<x id="3"/>下一个字段是一组效果，形式化为一个元组：<x id="2"/>其中种类是它的种类。',
    )
    expect(r?.content).toEqual([
      { t: 'text', s: '每个部分形式化为：' },
      { t: 'el', id: 'd1' },
      { t: 'text', s: '下一个字段是一组效果，形式化为一个元组：' },
      { t: 'el', id: 'd2' },
      { t: 'text', s: '其中种类是它的种类。' },
    ])
  })
})
