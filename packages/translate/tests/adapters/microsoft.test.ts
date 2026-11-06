import { describe, expect, it } from 'vitest'
import { accept } from '../../src/accept.ts'
import { microsoft, readMicrosoft } from '../../src/adapters/microsoft.ts'
import type { FetchInit } from '../../src/contract.ts'
import { NEVER, scriptedFetch } from '../../src/testing/fakes.ts'
import { translatorSuite } from '../../src/testing/suite.ts'
import { MICROSOFT_REPLIES, UNITS } from './fixtures.ts'

/** the endpoint giving each text back as its translation, with sentence lengths cut after each full stop and a space */
export const microsoftEcho = (_url: string, init: FetchInit) => {
  const texts = JSON.parse(init.body) as string[]
  const lengths = (s: string) => {
    const parts = s.split(/(?<=\.\s)/)
    return parts.map((p) => p.length)
  }
  return {
    status: 200,
    body: JSON.stringify(
      texts.map((text) => ({
        translations: [{ text, to: 'zh-Hans', sentLen: { srcSentLen: lengths(text), transSentLen: lengths(text) } }],
      })),
    ),
  }
}

translatorSuite('microsoft', {
  make: (fetch) => microsoft({ fetch }),
  target: 'zh-Hans',
  units: UNITS,
  echo: microsoftEcho,
  replies: MICROSOFT_REPLIES,
  faults: [
    {
      name: '429 with Retry-After',
      answer: { status: 429, body: 'slow down', headers: { 'retry-after': '2' } },
      remedy: 'cool',
      code: 'rate',
      retryAfterMs: 2_000,
    },
    { name: '429 with none', answer: { status: 429, body: '' }, remedy: 'cool', code: 'rate' },
    { name: '500', answer: { status: 500, body: 'oops' }, remedy: 'again', code: 'network' },
    { name: '503', answer: { status: 503, body: 'busy' }, remedy: 'again', code: 'overload' },
    { name: 'the network', answer: { network: true }, remedy: 'again', code: 'network' },
    {
      name: 'its stated cap (a plain-text 400)',
      answer: { status: 400, body: 'Request exceeds the maximum allowed translation size.' },
      remedy: 'halve',
      code: 'overload',
    },
    { name: 'another 400', answer: { status: 400, body: 'Bad request' }, remedy: 'halve', code: 'malformed' },
    { name: '403 of a keyless endpoint', answer: { status: 403, body: 'forbidden' }, remedy: 'again', code: 'network' },
    { name: '404', answer: { status: 404, body: '' }, remedy: 'pass' },
    { name: 'not JSON', answer: { status: 200, body: '<html>gateway</html>' }, remedy: 'again', code: 'malformed' },
    { name: 'the wrong count', answer: { status: 200, body: '[]' }, remedy: 'again', code: 'malformed' },
  ],
})

describe('microsoft: the wire, byte for byte (golden)', () => {
  const t = microsoft({ fetch: scriptedFetch(microsoftEcho).fetch })
  it('writes each fixture unit as the measured facts ask', () => {
    expect(UNITS.map((u) => t.write(u, 'zh-Hans'))).toEqual([
      'We study the problem. It is hard.',
      'Let @a# be as in @b#. See Section @c# for more.',
      'Bold words and @a# a link inside @b# end.',
      'We have @a#. Then we go on.',
      'Values @a#, and @b# hold.',
      'Whole bold heading',
      '@a# Setup:@b# we train the model for 3 epochs.',
      'a &lt; b &amp; c &gt; d @@ home # 95 @a# accuracy.',
      'A link around a formula: @a# done.',
      'Words @a#. More words follow here.',
      'It matters on seasonal timescales @a#, alters the jet stream @b# and the surface @c#, as the quasi-biennial oscillation and El Ni @d# o southern oscillations do.',
      'We use the 30 km zonal wind threshold:@a# thresholds @b# hold.',
      'We can quantify the forecast skill of the emulator using the RMSE: @a#',
      'The model @a# reads.',
      'At each step the model is auto-regressive @a#, consuming the previously generated symbols.',
      'We reach 95 @a# accuracy.',
      'a 3 @a# 10 speed-up',
    ])
  })
  it('asks the endpoint as it is measured to answer: zh-Hans, a bare array, JSON', async () => {
    const f = scriptedFetch(microsoftEcho)
    const m = microsoft({ fetch: f.fetch })
    for await (const _ of m.send(['one', 'two'], { target: 'zh' }, NEVER)) {
      // drained
    }
    expect(f.requests[0]?.url).toBe(
      'https://edge.microsoft.com/translate/translatetext?from=en&to=zh-Hans&isEnterpriseClient=false',
    )
    expect(JSON.parse(f.requests[0]?.init.body ?? '')).toEqual(['one', 'two'])
    expect(f.requests[0]?.init.headers).toEqual({ 'Content-Type': 'application/json' })
  })
  it('serves the targets its table holds, by the script the language means', async () => {
    const m = microsoft({ fetch: scriptedFetch(microsoftEcho).fetch })
    expect(
      await Promise.all(['zh-Hans', 'zh', 'zh-TW', 'sr', 'sr-Cyrl', 'ny', 'ja', 'ar'].map((x) => m.supports(x))),
    ).toEqual([true, true, true, true, true, true, true, true])
    expect(await Promise.all(['bs-Cyrl', 'uz-Cyrl', 'az-Cyrl', 'ms-Arab', 'xx'].map((x) => m.supports(x)))).toEqual([
      false,
      false,
      false,
      false,
      false,
    ])
  })
})

describe('microsoft: reading', () => {
  it("a display's own stop: written after its marker, the reply's marks after it taken off", () => {
    const r = readMicrosoft(UNITS[3] as never, JSON.stringify({ text: '我们有 @a#。然后我们继续。' }))
    expect(r?.content).toEqual([
      { t: 'text', s: '我们有 ' },
      { t: 'el', id: 'd1' },
      { t: 'text', s: '然后我们继续。' },
    ])
  })
  it('a stretch of side-by-side elements one marker, read back as all of them in order', () => {
    const r = readMicrosoft(UNITS[4] as never, JSON.stringify({ text: '数值 @a#，以及 @b# 成立。' }))
    expect(r?.content).toEqual([
      { t: 'text', s: '数值 ' },
      { t: 'el', id: 'a' },
      { t: 'text', s: ' ' },
      { t: 'el', id: 'b' },
      { t: 'text', s: '，以及 ' },
      { t: 'el', id: 'c' },
      { t: 'el', id: 'd' },
      { t: 'text', s: ' 成立。' },
    ])
  })
  it("a kept span that came back empty takes the words after it, to its sentence's end", () => {
    const r = readMicrosoft(UNITS[6] as never, JSON.stringify({ text: '@a#@b#设置：我们训练模型。' }))
    expect(r?.content).toEqual([
      { t: 'span', id: 'lab', content: [{ t: 'text', s: '设置：我们训练模型' }] },
      { t: 'text', s: '。' },
    ])
  })
  it("the endpoint's sentence lengths as sentence starts in both projections, where they partition both texts", () => {
    const u = UNITS[0] as never
    const r = readMicrosoft(u, JSON.stringify({ text: '我们研究这个问题。这很难。', src: [22, 11], tr: [9, 4] }))
    expect(r?.sentences).toEqual({ src: [22], tr: [9] })
    const off = readMicrosoft(u, JSON.stringify({ text: '我们研究这个问题。这很难。', src: [22, 10], tr: [9, 4] }))
    expect(off?.sentences).toBeUndefined()
    expect(accept(u, off?.content ?? []).ok).toBe(true)
  })
  it("boundaries a character off their sentence's end are snapped onto it", () => {
    const r = readMicrosoft(
      UNITS[0] as never,
      JSON.stringify({ text: '我们研究这个问题。这很难。', src: [22, 11], tr: [10, 3] }),
    )
    expect(r?.sentences).toEqual({ src: [22], tr: [9] })
  })
})
