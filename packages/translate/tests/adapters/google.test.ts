import { describe, expect, it } from 'vitest'
import { google, readTagged } from '../../src/adapters/google.ts'
import type { FetchInit } from '../../src/contract.ts'
import { NEVER, scriptedFetch } from '../../src/testing/fakes.ts'
import { translatorSuite } from '../../src/testing/suite.ts'
import { GOOGLE_REPLIES, UNITS } from './fixtures.ts'

/** the endpoint giving each item back as its translation */
export const googleEcho = (_url: string, init: FetchInit) => {
  const [[items]] = JSON.parse(init.body) as [[string[], string, string], string]
  return { status: 200, body: JSON.stringify([items]) }
}

translatorSuite('google', {
  make: (fetch) => google({ fetch }),
  target: 'zh-Hans',
  units: UNITS,
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
