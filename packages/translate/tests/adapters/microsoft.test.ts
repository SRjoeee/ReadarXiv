import { describe, expect, it } from 'vitest'
import { accept } from '../../src/accept.ts'
import { microsoft, readMicrosoft } from '../../src/adapters/microsoft.ts'
import type { FetchInit } from '../../src/contract.ts'
import { NEVER, scriptedFetch } from '../../src/testing/fakes.ts'
import { translatorSuite } from '../../src/testing/suite.ts'
import {
  BERT_ABSTRACT,
  BERT_ABSTRACT_REPLY,
  BERT_STRATEGIES,
  BERT_STRATEGIES_REPLY,
  MICROSOFT_REPLIES,
  MICROSOFT_UNITS,
  NESTED_DISPLAY,
  UNITS,
} from './fixtures.ts'

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
  units: MICROSOFT_UNITS,
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
    expect(MICROSOFT_UNITS.map((u) => t.write(u, 'zh-Hans'))).toEqual([
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
      // (1810.04805v2's: the bytes Microsoft was sent, so the replies stored under them are read again, not asked again)
      'We introduce a new language representation model called @a#, which stands for Bidirectional Encoder Representations from Transformers. Unlike recent language representation models @b#, @c# is designed to pre-train deep bidirectional representations from unlabeled text by jointly conditioning on both left and right context in all layers. As a result, the pre-trained BERT model can be fine-tuned with just one additional output layer to create state-of-the-art models for a wide range of tasks, such as question answering and language inference, without substantial task-specific architecture modifications.',
      'There are two existing strategies for applying pre-trained language representations to downstream tasks: @a# feature-based and @b# fine-tuning. The feature-based approach, such as ELMo @c#, uses task-specific architectures that include the pre-trained representations as additional features. The fine-tuning approach, such as the Generative Pre-trained Transformer (OpenAI GPT)@d#, introduces minimal task-specific parameters, and is trained on the downstream tasks by simply fine-tuning @e# all pre-trained parameters. The two approaches share the same objective function during pre-training, where they use unidirectional language models to learn general language representations.',
      // (a display inside a group inside a span's head, and inside a `must` span of no text: its own stop after the marker,
      // its boundary ending the stretch of elements)
      'We have @a#. Then we go on.',
      'We have @a# @b# that holds.',
      'We have @a#. Then we go on.',
      // (a display then a reference in a head: each its own marker, the display's own stop after its, as on the base's wire)
      'We have @a#. @b# Then we go on.',
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

// 1810.04805v2 on staging (2026-11-08): `{\em all}` came back as `\em` loose before "所有预训练参数…", and the typesetter held
// it to the unit's end (everything after it italic); `{\bf \bert}` came back as `\bf` loose, everything after BERT bold. A span
// that is not `must` goes on no wire, but the elements it holds did, and came back out of it
describe('microsoft: a span on no wire keeps its head (1810.04805v2, as staging stored it)', () => {
  it("a declaration at a group's head comes back in a copy of the group that holds it alone; the words come back unstyled", () => {
    const r = readMicrosoft(BERT_STRATEGIES, BERT_STRATEGIES_REPLY)
    expect(r?.content).toEqual([
      { t: 'text', s: '目前已有两种策略将预训练语言表示应用于下游任务：' },
      { t: 'span', id: '1', content: [{ t: 'el', id: '2' }] },
      { t: 'text', s: ' 基于特征和 ' },
      { t: 'span', id: '6', content: [{ t: 'el', id: '7' }] },
      { t: 'text', s: ' 微调。基于特征的方法，如ELMo ' },
      { t: 'el', id: '11' },
      { t: 'el', id: '12' },
      { t: 'text', s: '，使用任务专用架构，将预训练表示作为附加功能。微调方法，如生成预训练变换器（OpenAI GPT）' },
      { t: 'el', id: '14' },
      { t: 'el', id: '15' },
      { t: 'text', s: '，引入任务特定参数极少，下游任务则通过微调' },
      { t: 'span', id: '17', content: [{ t: 'el', id: '18' }] },
      {
        t: 'text',
        s: '所有预训练参数进行训练。这两种方法在预训练阶段共享相同的目标函数，即使用单向语言模型学习一般语言表示。',
      },
    ])
    expect(accept(BERT_STRATEGIES, r?.content ?? [])).toEqual({ ok: true })
  })
  it('a group of no word comes back whole, one marker as before', () => {
    const r = readMicrosoft(BERT_ABSTRACT, BERT_ABSTRACT_REPLY)
    expect(r?.content.slice(0, 3)).toEqual([
      { t: 'text', s: '我们引入了一个名为' },
      {
        t: 'span',
        id: '1',
        content: [
          { t: 'el', id: '2' },
          { t: 'text', s: ' ' },
          { t: 'el', id: '4' },
        ],
      },
      { t: 'text', s: '的新语言表示模型，代表Transformers的双向编码器表示。与近期的语言表示模型' },
    ])
    expect(accept(BERT_ABSTRACT, r?.content ?? [])).toEqual({ ok: true })
  })
})

describe("microsoft: a head's last element found through its groups (a display inside a group)", () => {
  it("reads the reply's stop after a head whose display stands inside a group, as after any display's own", () => {
    const [stop, , must, ref] = NESTED_DISPLAY as [never, never, never, never]
    const tail = { t: 'text', s: '然后我们继续。' }
    expect(readMicrosoft(stop, JSON.stringify({ text: '我们有 @a#。然后我们继续。' }))?.content).toEqual([
      { t: 'text', s: '我们有 ' },
      { t: 'span', id: 's', content: [{ t: 'span', id: 'n', content: [{ t: 'el', id: 'd' }] }] },
      tail,
    ])
    expect(readMicrosoft(ref, JSON.stringify({ text: '我们有 @a#。@b# 然后我们继续。' }))?.content).toEqual([
      { t: 'text', s: '我们有 ' },
      { t: 'span', id: 's', content: [{ t: 'el', id: 'd' }] },
      { t: 'el', id: 'r' },
      { t: 'text', s: ' 然后我们继续。' },
    ])
    expect(readMicrosoft(must, JSON.stringify({ text: '我们有 @a#。然后我们继续。' }))?.content).toEqual([
      { t: 'text', s: '我们有 ' },
      { t: 'span', id: 'g', content: [{ t: 'span', id: 'n', content: [{ t: 'el', id: 'd' }] }] },
      tail,
    ])
  })
})
