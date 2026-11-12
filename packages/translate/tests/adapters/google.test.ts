import { describe, expect, it } from 'vitest'
import { chrome } from '../../src/adapters/chrome.ts'
import { google, readTagged, tagsWire } from '../../src/adapters/google.ts'
import { chainOf } from '../../src/chain.ts'
import type { FetchInit, Piece, Result } from '../../src/contract.ts'
import { echo, NEVER, scriptedFetch } from '../../src/testing/fakes.ts'
import { fakeClock } from '../../src/testing/ports.ts'
import { translatorSuite } from '../../src/testing/suite.ts'
import { el, span, t, unit } from '../pieces.ts'
import { DISPLAY_ENDS, GOOGLE_REPLIES, HEAD_STOP, LABEL_AFTER_BREAK, SOURCE_LINES, UNITS } from './fixtures.ts'

/** the endpoint giving each item back as its translation */
export const googleEcho = (_url: string, init: FetchInit) => {
  const [[items]] = JSON.parse(init.body) as [[string[], string, string], string]
  return { status: 200, body: JSON.stringify([items]) }
}

translatorSuite('google', {
  make: (fetch) => google({ fetch }),
  target: 'zh-Hans',
  units: [...UNITS, HEAD_STOP, DISPLAY_ENDS, SOURCE_LINES],
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
    // a 400 that names no size, whatever it says ("API key not valid" included): the request handed on whole (#636)
    { name: '400', answer: { status: 400, body: 'bad' }, remedy: 'pass', code: 'malformed' },
    {
      name: 'its key refused, a 400',
      answer: { status: 400, body: 'API key not valid. Please pass a valid API key.' },
      remedy: 'pass',
      code: 'malformed',
    },
    { name: '413', answer: { status: 413, body: 'Request Entity Too Large' }, remedy: 'pass', code: 'too-large' },
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
      'Let <span id="1" translate="no">x1</span> be as in <span id="2" translate="no">x2</span>. <x id="4"/>See Section <span id="3" translate="no">x3</span> for more.',
      '<t id="1">Bold words</t> and <t id="2">a link <t id="3">inside</t></t> end.',
      'We have<span id="1" translate="no">x1</span>. <x id="2"/>Then we go on.',
      'Values <span id="1" translate="no">x1</span> <span id="2" translate="no">x2</span>, and <span id="3" translate="no">x3</span><span id="4" translate="no">x4</span> hold.',
      '<t id="1">Whole bold heading</t>',
      '<t id="1">Setup:</t> we train the model for 3 epochs.',
      'a &lt; b &amp; c &gt; d @ home # 95<span id="1" translate="no">x1</span> accuracy.',
      'A link around a formula: <span id="1" translate="no">x1</span> done.',
      'Words<span id="1" translate="no">x1</span>. <x id="2"/>More words follow here.',
      'It matters on seasonal timescales<span id="1" translate="no">x1</span>, alters the jet stream<span id="2" translate="no">x2</span> and the surface<span id="3" translate="no">x3</span>, as the quasi-biennial oscillation and El Ni<span id="4" translate="no">x4</span>o southern oscillations do.',
      'We use the 30 km zonal wind threshold:<span id="1" translate="no">x1</span> thresholds<span id="2" translate="no">x2</span> hold.',
      'We can quantify the forecast skill of the emulator using the RMSE: <span id="1" translate="no">x1</span>',
      'The model <span id="1" translate="no">x1</span> reads.',
      'At each step the model is auto-regressive<span id="1" translate="no">x1</span>, consuming the previously generated symbols.',
      'We reach 95<span id="1" translate="no">x1</span> accuracy.',
      'a 3<span id="1" translate="no">x1</span>10 speed-up',
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

// (Google's translateHtml takes an element that holds no text of its own, or one HTML does not know, as a break between two
// texts it translates apart, each closed with a full stop of its own: "… into a matrix <x/>. The keys …" came back
// "…矩阵中。<x/> 。键和值…", the owner's report of 2026-11-12 on 1706.03762v7; as HTML's inline element holding a token that
// HTML's `translate` attribute keeps, the element is a word of its sentence. Lane stray-stop's probe, DESIGN §6.2)
describe('google: an element is a word of its sentence', () => {
  const g = google({ fetch: scriptedFetch(googleEcho).fetch })
  const u = unit(
    'u',
    [
      t('The values are stored in a table '),
      el('m', 'math'),
      t('. The rows and columns are kept in '),
      el('a', 'math'),
      t(' and '),
      el('b', 'math'),
      t('.'),
    ],
    true,
  )
  it('is written as an inline element holding its number, not to be translated; a boundary marker stays a void', () => {
    expect(g.write(u, 'zh-Hans')).toBe(
      'The values are stored in a table <span id="1" translate="no">x1</span>. <x id="4"/>The rows and columns are kept in <span id="2" translate="no">x2</span> and <span id="3" translate="no">x3</span>.',
    )
  })
  it('is read back where the reply sets it, its token not read as text', () => {
    const r = readTagged(
      u,
      '这些值存储在表<span id="1" translate="no">x1</span>中。<x id="4"/>行和列保存在<span id="2" translate="no">x2</span>和<span id="3" translate="no">x3</span>中。',
    )
    expect(r?.content).toEqual([
      { t: 'text', s: '这些值存储在表' },
      { t: 'el', id: 'm' },
      { t: 'text', s: '中。行和列保存在' },
      { t: 'el', id: 'a' },
      { t: 'text', s: '和' },
      { t: 'el', id: 'b' },
      { t: 'text', s: '中。' },
    ])
    expect(r?.sentences).toEqual({ src: [36], tr: [10] })
  })
  it('a reply to the wire before it, its elements voids, still reads (stored replies are read again)', () => {
    const r = readTagged(u, '这些值存储在表<x id="1"/>中。<x id="4"/>行和列保存在<x id="2"/>和<x id="3"/>中。')
    expect(r?.content.filter((p) => p.t === 'el').map((p) => (p as { id: string }).id)).toEqual(['m', 'a', 'b'])
  })
  it('an element twice, or lost, refuses the reply as a void does', () => {
    expect(
      readTagged(
        u,
        '表<span id="1" translate="no">x1</span><span id="1" translate="no">x1</span>。<x id="4"/>行<span id="2" translate="no">x2</span>和<span id="3" translate="no">x3</span>。',
      ),
    ).toBeNull()
    expect(
      readTagged(u, '表。<x id="4"/>行<span id="2" translate="no">x2</span>和<span id="3" translate="no">x3</span>。'),
    ).toBeNull()
  })
  it('the tags wire an LLM is sent, and Chrome’s, keep the void', () => {
    expect(tagsWire.write(u)).toBe(
      'The values are stored in a table <x id="1"/>. <x id="4"/>The rows and columns are kept in <x id="2"/> and <x id="3"/>.',
    )
    expect(chrome({ api: null }).write(u, 'zh-Hans')).toBe(tagsWire.write(u))
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
      .replace(/<span id="\d+" translate="no">x\d+<\/span>/g, '#')
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
  it('the fixture unit the digest holds it by: boundary markers before the citation and before the next sentence alone', () => {
    expect(g.write(SOURCE_LINES, 'zh-Hans')).toBe(
      'Sampling remains computationally expensive. <x id="2"/><span id="1" translate="no">x1</span> proposes a one-step sampler. <x id="3"/>Then we go on.',
    )
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
      'Each part is formalized as: <span id="1" translate="no">x1</span>. <x id="3"/>The next field is a list of effects, formalized as a tuple: <span id="2" translate="no">x2</span> where kind is its kind.',
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

// (a character TeX writes escaped, `\&`, `\textless`, `\textgreater`, is a character of the text since the source reader sends
// it as one: on the tags wire it travels as an entity, a bare one fusing with the tags around it (text.ts), and is read back as
// the character, beside a tag on either side)
describe('google: a character TeX writes escaped, sent as text', () => {
  const g = google({ fetch: scriptedFetch(googleEcho).fetch })
  it('"&", "<" and ">" travel as entities and come back as the characters, beside a tag on either side', () => {
    const u = unit('u', [t('R&D <'), el('1'), t('> 5% of A&B'), el('2'), t('&.')])
    const wire = g.write(u, 'zh-Hans')
    expect(wire).toBe(
      'R&amp;D &lt;<span id="1" translate="no">x1</span>&gt; 5% of A&amp;B<span id="2" translate="no">x2</span>&amp;.',
    )
    expect(readTagged(u, wire)?.content).toEqual([
      { t: 'text', s: 'R&D <' },
      { t: 'el', id: '1' },
      { t: 'text', s: '> 5% of A&B' },
      { t: 'el', id: '2' },
      { t: 'text', s: '&.' },
    ])
  })
})

describe('google: a 400 to every request through the chain (#636)', () => {
  it('100 units are one request, handed on whole to the next translator (199 requests when every 400 was halved)', async () => {
    const f = scriptedFetch(() => ({ status: 400, body: 'API key not valid. Please pass a valid API key.' }))
    const units = Array.from({ length: 100 }, (_, i) => unit(`u${i}`, [t(`Word ${i}.`)]))
    const rs: Result[] = []
    for await (const r of chainOf({ clock: fakeClock() }).translate(units, 'zh-Hans', {
      translators: [google({ fetch: f.fetch }), echo('fallback:0')],
    }))
      rs.push(r)
    expect(f.requests.length).toBe(1)
    expect(rs.every((r) => r.ok && r.by === 'fallback:0')).toBe(true)
  })
})
