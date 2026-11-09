import { describe, expect, it } from 'vitest'
import { accept } from '../../src/accept.ts'
import { microsoft, readMicrosoft } from '../../src/adapters/microsoft.ts'
import type { FetchInit, Piece } from '../../src/contract.ts'
import { NEVER, scriptedFetch } from '../../src/testing/fakes.ts'
import { translatorSuite } from '../../src/testing/suite.ts'
import {
  BERT_ABSTRACT,
  BERT_ABSTRACT_REPLY,
  BERT_STRATEGIES,
  BERT_STRATEGIES_REPLY,
  DISPLAY_ENDS,
  HEAD_STOP,
  INSIDE_WORDS,
  LABEL_AFTER_BREAK,
  MICROSOFT_REPLIES,
  MICROSOFT_UNITS,
  NESTED_DISPLAY,
  SILENT,
  SILENT_AROUND,
  SILENT_LABEL,
  UNITS,
} from './fixtures.ts'
import { el, quiet, t, unit } from '../pieces.ts'

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
      // (a run-in label after a forced break that ends no sentence: the line end the break states, after its stretch's marker)
      'We compare two settings as follows: @a#\n@b# No XYZ @c#: A model trained without the XYZ task. @d#@e# Only XYZ @f#: A model trained with it alone.',
      // (an element between two letters is the word's: no space of ours beside it; a tie, TeX's space, keeps them)
      'The column str@a#s holds Ni@b#B, by Jane @c# Doe.',
      // (elements that set nothing: on no wire, the word a discretionary hyphen stands in whole; one beside a citation in its
      // marker; a span around the rest goes around the translation, the element beside it no matter)
      'We train an example model @a# on every word, then stop.',
      '@a# Setup:@b# we train it.',
      'Method',
      // (a stop TeX sets at a group's end, its source writing none: at the end of a kept span, before its close; after the
      // words of one on no wire)
      '@a# Current methods are not reliable. @b# To infer the source, one could rank sentences. We call it verifiable sources. Then we go on.',
      'Each part is formalized as: @a#. The next field is a list of effects, formalized as a tuple: @b# where kind is its kind.',
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
  it('takes our space beside a marker back where the source set the element glued to its word, whatever the reply sets there', () => {
    // (2610.20967v1 p1 on staging, 2026-11-09: spconf's names, each name's marks `$^{1}$` glued to it, and its places, each
    // place's mark glued before it. A marker touching a word is read as part of it, so a space of ours goes beside it; the
    // reply kept it, and read back beside a CJK name it stood as a space TeX never set, 4.3 pt between the name and its mark
    // where TeX's is 1.35)
    const names = unit('n', [t('Song Yu'), el('1'), t(', Fang Tsai'), el('3'), t(', Yi Yang'), el('5')])
    const m = microsoft({ fetch: scriptedFetch(microsoftEcho).fetch })
    expect(m.write(names, 'zh-Hans')).toBe('Song Yu @a#, Fang Tsai @b#, Yi Yang @c#')
    expect(
      readMicrosoft(names, JSON.stringify({ text: '\u4f59\u5b8b @a#\uff0c\u8521\u65b9 @b#\uff0c\u6768\u6021 @c#' }))
        ?.content,
    ).toEqual([
      { t: 'text', s: '\u4f59\u5b8b' },
      { t: 'el', id: '1' },
      { t: 'text', s: '\uff0c\u8521\u65b9' },
      { t: 'el', id: '3' },
      { t: 'text', s: '\uff0c\u6768\u6021' },
      { t: 'el', id: '5' },
    ])
    // (a mark glued before its place: our space after it taken back; the space the source set before the second mark kept)
    const places = unit('p', [el('1'), t('National University '), el('2'), t('University of California')])
    expect(m.write(places, 'zh-Hans')).toBe('@a# National University @b# University of California')
    expect(
      readMicrosoft(places, JSON.stringify({ text: '@a# \u56fd\u7acb\u5927\u5b66 @b# \u52a0\u5dde\u5927\u5b66' }))
        ?.content,
    ).toEqual([
      { t: 'el', id: '1' },
      { t: 'text', s: '\u56fd\u7acb\u5927\u5b66 ' },
      { t: 'el', id: '2' },
      { t: 'text', s: '\u52a0\u5dde\u5927\u5b66' },
    ])
    // (an element the source set between spaces keeps the reply's spaces, as before)
    const apart = unit('a', [t('Values '), el('1'), t(' hold.')])
    expect(readMicrosoft(apart, JSON.stringify({ text: '\u6570\u503c @a# \u6210\u7acb\u3002' }))?.content).toEqual([
      { t: 'text', s: '\u6570\u503c ' },
      { t: 'el', id: '1' },
      { t: 'text', s: ' \u6210\u7acb\u3002' },
    ])
  })
  it("a display's own stop: written after its marker, the reply's marks after it taken off", () => {
    const r = readMicrosoft(UNITS[3] as never, JSON.stringify({ text: '我们有 @a#。然后我们继续。' }))
    expect(r?.content).toEqual([
      { t: 'text', s: '我们有' },
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

// Elements that set nothing (`silent`): today's wire put them on no wire (mt.mjs INKLESS, TRANSLATE_VERSION 3 and 10:
// 2610.19159's `\textcolor{…}{\bfseries w}` round every word went out as a marker a word, Microsoft's word salad), v2 sent each
// as a marker; read back, each stands at the front of its innermost kept group where nothing went out before it, else at its end
describe('microsoft: an element that sets nothing goes on no wire', () => {
  it("reads each back at its group's front or end, one beside a citation in its marker, a head of them in a copy of its span", () => {
    const r = readMicrosoft(SILENT, JSON.stringify({ text: '我们训练一个示例模型 @a# 在每个词上，然后停止。' }))
    expect(r?.content).toEqual([
      { t: 'el', id: 'lab' },
      { t: 'text', s: '我们训练一个示例模型' },
      { t: 'el', id: 'c' },
      { t: 'el', id: 'k' },
      { t: 'text', s: ' 在每个词上，然后停止。' },
      { t: 'el', id: 'hy' },
      { t: 'span', id: 'g', content: [{ t: 'el', id: 'bf' }] },
      { t: 'el', id: 'n' },
    ])
    expect(accept(SILENT, r?.content ?? [])).toEqual({ ok: true })
  })
  it("a kept span's head that sets nothing comes back after its open", () => {
    const r = readMicrosoft(SILENT_LABEL, JSON.stringify({ text: '@a#设置：@b# 我们训练它。' }))
    expect(r?.content[0]).toEqual({
      t: 'span',
      id: 'h',
      content: [
        { t: 'el', id: 'bm' },
        { t: 'text', s: '设置：' },
      ],
    })
    expect(accept(SILENT_LABEL, r?.content ?? [])).toEqual({ ok: true })
  })
  it('a span around all the rest goes around the translation, the element that sets nothing outside it', () => {
    const r = readMicrosoft(SILENT_AROUND, JSON.stringify({ text: '方法' }))
    expect(r?.content).toEqual([
      { t: 'el', id: 'hl' },
      { t: 'span', id: 'm', content: [{ t: 'text', s: '方法' }] },
    ])
    expect(accept(SILENT_AROUND, r?.content ?? [])).toEqual({ ok: true })
  })
  it("Microsoft's sentence lengths read with them off the wire: the offsets each projection's own", () => {
    const u = unit('two', [quiet('a'), t('One sentence here. Then'), quiet('b'), t(' another one.')], true)
    expect(microsoft({ fetch: scriptedFetch(microsoftEcho).fetch }).write(u, 'zh-Hans')).toBe(
      'One sentence here. Then another one.',
    )
    const r = readMicrosoft(u, JSON.stringify({ text: '这里一句话。然后另一句。', src: [19, 17], tr: [6, 6] }))
    expect(r?.content).toEqual([
      { t: 'el', id: 'a' },
      { t: 'text', s: '这里一句话。然后另一句。' },
      { t: 'el', id: 'b' },
    ])
    expect(r?.sentences).toEqual({ src: [20], tr: [7] })
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
      { t: 'text', s: ' 微调。基于特征的方法，如ELMo' },
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
      { t: 'text', s: '我们有' },
      { t: 'span', id: 's', content: [{ t: 'span', id: 'n', content: [{ t: 'el', id: 'd' }] }] },
      tail,
    ])
    expect(readMicrosoft(ref, JSON.stringify({ text: '我们有 @a#。@b# 然后我们继续。' }))?.content).toEqual([
      { t: 'text', s: '我们有' },
      { t: 'span', id: 's', content: [{ t: 'el', id: 'd' }] },
      { t: 'el', id: 'r' },
      { t: 'text', s: ' 然后我们继续。' },
    ])
    expect(readMicrosoft(must, JSON.stringify({ text: '我们有 @a#。然后我们继续。' }))?.content).toEqual([
      { t: 'text', s: '我们有' },
      { t: 'span', id: 'g', content: [{ t: 'span', id: 'n', content: [{ t: 'el', id: 'd' }] }] },
      tail,
    ])
  })
})

// 1810.04805v2 p8 on staging (2026-11-09): "\\ \noindent \textbf{No NSP}: A bidirectional model ..." came back 「无：」, the term
// lost. Microsoft's sentence ran on from "... as BERT_BASE:" across the forced break's marker (its own lengths: one sentence of
// 348 characters through the label and its body), so the label's words stood between two hard boundaries inside another
// sentence. With a line break after the break's marker Microsoft cut its sentence there and gave 「无 NSP」 (lane must-term)
describe('microsoft: a run-in label after a forced break begins its sentence', () => {
  it("writes the line end the break states after its stretch's marker, and takes it back on reading", () => {
    const r = readMicrosoft(
      LABEL_AFTER_BREAK,
      JSON.stringify({
        text: '我们比较以下两种设置：@a#\n@b# 无 XYZ @c#：一个未经 XYZ 任务训练的模型。@d#@e# 仅 XYZ @f#：一个仅用它训练的模型。',
      }),
    )
    expect(r?.content).toEqual([
      { t: 'text', s: '我们比较以下两种设置：' },
      { t: 'el', id: 'v' },
      { t: 'text', s: '\n' },
      { t: 'el', id: 'b' },
      { t: 'text', s: '\n' },
      { t: 'el', id: 'n' },
      { t: 'span', id: 'h', content: [{ t: 'text', s: '无 XYZ' }] },
      { t: 'text', s: '：一个未经 XYZ 任务训练的模型。' },
      { t: 'el', id: 'b2' },
      { t: 'text', s: '\n' },
      { t: 'el', id: 'n2' },
      { t: 'span', id: 'h2', content: [{ t: 'text', s: '仅 XYZ' }] },
      { t: 'text', s: '：一个仅用它训练的模型。' },
    ])
    expect(accept(LABEL_AFTER_BREAK, r?.content ?? [])).toEqual({ ok: true })
  })
  it('a reply that dropped the line end reads the same', () => {
    const r = readMicrosoft(
      LABEL_AFTER_BREAK,
      JSON.stringify({
        text: '我们比较以下两种设置：@a#@b# 无 XYZ @c#：一个未经 XYZ 任务训练的模型。@d#@e# 仅 XYZ @f#：一个仅用它训练的模型。',
      }),
    )
    expect(r?.content.slice(5, 7)).toEqual([
      { t: 'el', id: 'n' },
      { t: 'span', id: 'h', content: [{ t: 'text', s: '无 XYZ' }] },
    ])
  })
  it("the endpoint's sentences begin at the label, in both projections", () => {
    const u = LABEL_AFTER_BREAK
    const wire = microsoft({ fetch: scriptedFetch(microsoftEcho).fetch }).write(u, 'zh-Hans')
    const text =
      '我们比较以下两种设置：@a#\n@b# 无 XYZ @c#：一个未经 XYZ 任务训练的模型。@d#@e# 仅 XYZ @f#：一个仅用它训练的模型。'
    const at = (s: string, x: string) => s.indexOf(x)
    const src = [at(wire, '@b#'), at(wire, '@d#') - at(wire, '@b#'), wire.length - at(wire, '@d#')]
    const tr = [at(text, '@b#'), at(text, '@d#') - at(text, '@b#'), text.length - at(text, '@d#')]
    const r = readMicrosoft(u, JSON.stringify({ text, src, tr }))
    // (each at the label's first word: the source's "No XYZ", the translation's 「无 XYZ」 right after its marker, our space
    // before it taken back: the source set the label's words glued to the element before them)
    expect(r?.sentences?.src[0]).toBe('We compare two settings as follows:\n￼\n￼\n￼'.length)
    expect(r?.sentences?.tr[0]).toBe('我们比较以下两种设置：￼\n￼\n￼'.length)
  })
})

// 2608.25210v2 p2 on staging (2026-11-09): `\topic{Current approaches to infer provenance are not reliable}`, the paper's
// `\newcommand{\topic}[1]{\vspace{.5pt} \noindent{\bf #1.}}`, its stop the macro's: kept as two markers with no stop between
// them, Microsoft ran the head into the next sentence and wrote none (4 of 4 heads asked); with the stop written before the
// close, the head came back a sentence of its own, its stop inside the group (4 of 4, live-html.ts, lanes/runin-stop.md)
describe('microsoft: a stop TeX sets at a group’s end', () => {
  it('reads the reply’s stop inside the kept group, our space before its close taken back', () => {
    const r = readMicrosoft(
      HEAD_STOP,
      JSON.stringify({
        text: '@a# 目前的方法不可靠。@b# 为了推断来源，可以对句子排序。我们称之为可验证来源。然后我们继续。',
      }),
    )
    expect(r?.content).toEqual([
      { t: 'span', id: 'h', content: [{ t: 'text', s: '目前的方法不可靠。' }] },
      { t: 'text', s: ' 为了推断来源，可以对句子排序。我们称之为可验证来源。然后我们继续。' },
    ])
    expect(accept(HEAD_STOP, r?.content ?? [])).toEqual({ ok: true })
  })
  it("the endpoint's sentence after the head begins at the body's first word: the stop is the group's end", () => {
    const wire = microsoft({ fetch: scriptedFetch(microsoftEcho).fetch }).write(HEAD_STOP, 'zh-Hans')
    const text = '@a# 目前的方法不可靠。@b# 为了推断来源，可以对句子排序。我们称之为可验证来源。然后我们继续。'
    const at = (s: string, x: string) => s.indexOf(x)
    const src = [at(wire, 'To'), wire.length - at(wire, 'To')]
    const tr = [at(text, '为了'), text.length - at(text, '为了')]
    const r = readMicrosoft(HEAD_STOP, JSON.stringify({ text, src, tr }))
    expect(r?.sentences?.src[0]).toBe('Current methods are not reliable  \n'.length)
  })
})

// 2608.25210v2 p5 (the owner's #46, 2026-11-09): the header cells `str\_s` and `llm\_s` came back "STR_" and "LLM _s" on both
// readers. The escaped underscore is an element, and the wire set a space of its own on each side of its marker, so one
// identifier went out as two words: Microsoft gave `str @a# s` back as `STR @a#` and `LLM @a# bottom @b# up` as
// `LLM @a# 底部@b# 向上`; unspaced, `str@a#s`, `llm@a#s`, `LLM@a#bottom@b#up` and `LLM@a#adaptive@b#SEQ` came back as they went
describe('microsoft: an element inside a word', () => {
  it('reads a word that holds an element back whole', () => {
    const r = readMicrosoft(INSIDE_WORDS, JSON.stringify({ text: '列 str@a#s 包含 Ni@b#B，作者 Jane @c# Doe。' }))
    expect(r?.content).toEqual([
      { t: 'text', s: '列 str' },
      { t: 'el', id: 'u' },
      { t: 'text', s: 's 包含 Ni' },
      { t: 'el', id: 'f' },
      { t: 'text', s: 'B，作者 Jane' },
      { t: 'el', id: 'tie' },
      { t: 'text', s: 'Doe。' },
    ])
  })
})

// (a display that states no stop of its own, at its sentence's end: TeX set it there and the next sentence begins after it, its
// first letter upper case; Microsoft cuts at neither a marker nor a colon, so the unit went as one sentence, the translation and
// the highlight with it: the owner's report of 2026-11-09 on 2609.33403v1 §4.2)
describe('microsoft: a display that states no stop of its own', () => {
  const m = microsoft({ fetch: scriptedFetch(microsoftEcho).fetch })
  const src = 'Each part is formalized as: @a#. '
  const wire = `${src}The next field is a list of effects, formalized as a tuple: @b# where kind is its kind.`
  it('ends its sentence where the text after it begins one: a stop after its marker; none where the sentence goes on', () => {
    expect(m.write(DISPLAY_ENDS, 'zh-Hans')).toBe(wire)
  })
  it("takes the reply's stop after its marker back, and reads the endpoint's cut there as the next sentence's start", () => {
    const head = '每个部分形式化为：@a#。'
    const text = `${head}下一个字段是一组效果，形式化为一个元组：@b#其中种类是它的种类。`
    const r = readMicrosoft(
      DISPLAY_ENDS,
      JSON.stringify({
        text,
        src: [src.length, wire.length - src.length],
        tr: [head.length, text.length - head.length],
      }),
    )
    expect(r?.content).toEqual([
      { t: 'text', s: '每个部分形式化为：' },
      { t: 'el', id: 'd1' },
      { t: 'text', s: '下一个字段是一组效果，形式化为一个元组：' },
      { t: 'el', id: 'd2' },
      { t: 'text', s: '其中种类是它的种类。' },
    ])
    // (in the unit's projection, a display one character: "The" at 30; in the translation's, "下一个" at 10)
    expect(r?.sentences).toEqual({ src: [30], tr: [10] })
  })
  it('writes nothing after one whose sentence goes on (lower case), nor before an element, nor at the unit’s end', () => {
    const on = (after: Piece[]) => m.write(unit('u', [t('We set: '), el('d', 'display'), ...after]), 'zh-Hans')
    expect(on([t(' where x is one.')])).toBe('We set: @a# where x is one.')
    expect(on([t(' '), el('x', 'math'), t(' Then y.')])).toBe('We set: @a# @b# Then y.')
    expect(on([])).toBe('We set: @a#')
    // (what sets nothing between them is passed over: the text after it begins the next sentence)
    expect(on([quiet('q'), t(' Then we go on.')])).toBe('We set: @a#. Then we go on.')
  })
})
