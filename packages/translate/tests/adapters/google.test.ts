import { describe, expect, it } from 'vitest'
import { CHROME_DIGEST, chrome } from '../../src/adapters/chrome.ts'
import { google, readTagged, tagsWire } from '../../src/adapters/google.ts'
import { GLUED_LEAD, GLUED_SPACE, SENTINEL } from '../../src/wire/text.ts'
import { chainOf } from '../../src/chain.ts'
import type { FetchInit, Piece, Result } from '../../src/contract.ts'
import { echo, NEVER, scriptedFetch } from '../../src/testing/fakes.ts'
import { fakeClock } from '../../src/testing/ports.ts'
import { translatorSuite } from '../../src/testing/suite.ts'
import { el, span, t, unit } from '../pieces.ts'
import {
  DISPLAY_ENDS,
  GOOGLE_REPLIES,
  HEAD_STOP,
  LABEL_AFTER_BREAK,
  GLUED_PAST,
  OWN_GLUED,
  SOURCE_LINES,
  GLUED_STOP,
  STYLED_OBJECT,
  UNITS,
} from './fixtures.ts'

/** the endpoint giving each item back as its translation */
export const googleEcho = (_url: string, init: FetchInit) => {
  const [[items]] = JSON.parse(init.body) as [[string[], string, string], string]
  return { status: 200, body: JSON.stringify([items]) }
}

translatorSuite('google', {
  make: (fetch) => google({ fetch }),
  target: 'zh-Hans',
  units: [...UNITS, HEAD_STOP, DISPLAY_ENDS, SOURCE_LINES, GLUED_PAST, OWN_GLUED, STYLED_OBJECT, GLUED_STOP],
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
      '<span id="1">Bold words</span> and <span id="2">a link <span id="3">inside</span></span> end.',
      'We have<span id="1" translate="no">x1</span>. <x id="2"/>Then we go on.',
      'Values <span id="1" translate="no">x1</span> <span id="2" translate="no">x2</span>, and <span id="3" translate="no">x3</span><span id="4" translate="no">x4</span> hold.',
      '<span id="1">Whole bold heading</span>',
      '<span id="1">Setup:</span> we train the model for 3 epochs.',
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
    // (Chrome's codec, so Chrome's behaviour digest: the LLM services' identity moves with it)
    expect(tagsWire.digest).toBe(CHROME_DIGEST)
  })
})

// (Google's translateHtml takes a styled group written as an element HTML does not know, `<t id="n">…</t>`, as a break: it
// translated the text before it alone, wrote "……" where the group's words belong and set the group after ("so the experts act
// as <t>parameter priors</t> without…" -> "因此专家可以作为……<t>参数先验</t>而不…"), and translated the group's words out of their
// sentence ("the {order} we take…" -> 命令); as HTML's own inline element the sentence came back whole, "因此专家充当<span>参数先验
// </span>，而不…". Lane reply-dots' probes, 2026-11-13: dots gone in 61 of 61 units, DESIGN §6.2)
describe('google: a styled group is a span of its sentence', () => {
  const g = google({ fetch: scriptedFetch(googleEcho).fetch })
  const reply = (group: string, el2 = '<span id="2" translate="no">x2</span>') =>
    `该方法使权重保持可训练，因此专家充当${group}，而不将其限制在这个范围内。<x id="5"/>它达到 81%，而基线为 70% ${el2}代码可在<span id="3" translate="no">x3</span>处获取<span id="4" translate="no">x4</span>`
  const read = [
    { t: 'text', s: '该方法使权重保持可训练，因此专家充当' },
    { t: 'span', id: 'p', content: [{ t: 'text', s: '学习到的先验' }] },
    { t: 'text', s: '，而不将其限制在这个范围内。它达到 81%，而基线为 70%' },
    { t: 'el', id: 'i' },
    { t: 'text', s: '代码可在' },
    { t: 'el', id: 'u' },
    { t: 'text', s: '处获取' },
    { t: 'el', id: 'f' },
  ]
  it('is written as HTML’s inline element holding its words; an element as one holding its token, not to be translated', () => {
    expect(g.write(STYLED_OBJECT, 'zh-Hans')).toBe(
      'The method keeps the weights trainable, so the experts serve as <span id="1">learned priors</span> without tying it to this range. <x id="5"/>It reaches 81% against 70% for the baseline.<span id="2" translate="no">x2</span> Code is available at <span id="3" translate="no">x3</span>.<span id="4" translate="no">x4</span>',
    )
  })
  it('a returned span is a group or an element by its id, as the unit’s content knows it', () => {
    const r = readTagged(STYLED_OBJECT, reply('<span id="1">学习到的先验</span>'))
    expect(r?.content).toEqual(read)
    expect(r?.sentences).toEqual({ src: [111], tr: [38] })
  })
  it('an element’s span is the element whether or not `translate` came back', () => {
    expect(
      readTagged(STYLED_OBJECT, reply('<span id="1">学习到的先验</span>', '<span id="2">x2</span>'))?.content,
    ).toEqual(read)
  })
  it('a group’s span holding a token-shaped text is still the group', () => {
    const u = unit('v', [t('The variable '), span('v', 'italic', [t('x2')]), t(' is set by '), el('m', 'math'), t('.')])
    expect(g.write(u, 'zh-Hans')).toBe(
      'The variable <span id="1">x2</span> is set by <span id="2" translate="no">x2</span>.',
    )
    expect(readTagged(u, '变量<span id="1">x2</span>由<span id="2" translate="no">x2</span>设定。')?.content).toEqual([
      { t: 'text', s: '变量' },
      { t: 'span', id: 'v', content: [{ t: 'text', s: 'x2' }] },
      { t: 'text', s: '由' },
      { t: 'el', id: 'm' },
      { t: 'text', s: '设定。' },
    ])
  })
  it('a reply to the wire before it, its group a `<t>`, still reads (stored replies are read again)', () => {
    expect(readTagged(STYLED_OBJECT, reply('<t id="1">学习到的先验</t>'))?.content).toEqual(read)
  })
  it('a group’s span closed by another tag’s close, or never closed, is unread', () => {
    expect(readTagged(STYLED_OBJECT, reply('<span id="1">学习到的先验</t>'))).toBeNull()
    expect(readTagged(STYLED_OBJECT, reply('<span id="1">学习到的先验'))).toBeNull()
    expect(readTagged(STYLED_OBJECT, reply('<t id="1">学习到的先验</span>'))).toBeNull()
  })
})

// (Google kept no stop before an element written as a word that the source glues after its sentence's stop: "…to its
// left.<x1>" -> "…上下文<x1>", 0 of 80 such places of the lab's Google store kept it, Microsoft 0 of 75 note marks, footnotes
// and breaks lost; with the boundary marker right after the stop, 77 of 80 came back, no stray stop added. Lane reply-dots'
// probe, 2026-11-13, DESIGN §6.2. The sentence stays the source's: its stop and the element glued after it)
describe('google: on the wire a sentence ends at its stop', () => {
  const g = google({ fetch: scriptedFetch(googleEcho).fetch })
  const w = (n: number) => `<span id="${n}" translate="no">x${n}</span>`
  it('the boundary marker stands right after the stop, before an element the source glues after it; at the unit’s end too', () => {
    expect(g.write(GLUED_STOP, 'zh-Hans')).toBe(
      `Every token attends to its left.<x id="3"/>${w(1)} We report two sizes.<x id="4"/>${w(2)}`,
    )
    const one = unit('o', [t('We used other seeds.'), el('n', 'note-mark')], true)
    expect(g.write(one, 'zh-Hans')).toBe(`We used other seeds.<x id="2"/>${w(1)}`)
  })
  it('only where the cutter ends a sentence: an abbreviation’s dot is none', () => {
    const abbr = unit('a', [t('As shown in Prop.'), el('t', 'other'), el('r', 'ref')], true)
    expect(g.write(abbr, 'zh-Hans')).toBe(`As shown in Prop.${w(1)}${w(2)}`)
    const mid = unit('m', [t('See Fig.'), el('t', 'other'), el('r', 'ref'), t(' for the layout. It ends.')], true)
    expect(g.write(mid, 'zh-Hans')).toBe(`See Fig.${w(1)}${w(2)} for the layout. <x id="3"/>It ends.`)
  })
  it('a reply keeping stop, marker and element in order reads today’s pairs: the boundary after the element on both sides', () => {
    const r = readTagged(GLUED_STOP, `每个标记都关注其左侧。<x id="3"/>${w(1)}我们报告两种规模。<x id="4"/>${w(2)}`)
    expect(r?.content).toEqual([
      { t: 'text', s: '每个标记都关注其左侧。' },
      { t: 'el', id: 'f' },
      { t: 'text', s: '我们报告两种规模。' },
      { t: 'el', id: 'g' },
    ])
    // (the source's boundary at "We", after the mark; the translation's at 我, after the mark: as a reply with the marker
    // after the element reads, today's wire; no sentence of the end's mark alone)
    expect(r?.sentences).toEqual({ src: [34], tr: [12] })
    expect(
      readTagged(GLUED_STOP, `每个标记都关注其左侧。${w(1)}<x id="3"/>我们报告两种规模。<x id="4"/>${w(2)}`)?.sentences,
    ).toEqual({ src: [34], tr: [12] })
  })
  it('the end’s marker is the wire’s alone: missing, or after the element, the sentences read the same', () => {
    expect(
      readTagged(GLUED_STOP, `每个标记都关注其左侧。<x id="3"/>${w(1)}我们报告两种规模。${w(2)}`)?.sentences,
    ).toEqual({
      src: [34],
      tr: [12],
    })
    expect(
      readTagged(GLUED_STOP, `每个标记都关注其左侧。<x id="3"/>${w(1)}我们报告两种规模${w(2)}<x id="4"/>`)?.sentences,
    ).toEqual({
      src: [34],
      tr: [12],
    })
  })
  it('a reply that moved the element past a word reads as a moved element reads: where the reply set it, the boundary at the marker', () => {
    const r = readTagged(GLUED_STOP, `每个标记都关注其左侧。<x id="3"/>我们${w(1)}报告两种规模。<x id="4"/>${w(2)}`)
    expect(r?.content).toEqual([
      { t: 'text', s: '每个标记都关注其左侧。我们' },
      { t: 'el', id: 'f' },
      { t: 'text', s: '报告两种规模。' },
      { t: 'el', id: 'g' },
    ])
    expect(r?.sentences).toEqual({ src: [34], tr: [11] })
  })
})

// (TeX set no space between a word and the mark, the script or the accent it carries: where the source glued an element to
// the text beside it, the white space a reply sets there is taken back, as the markers reading takes it; text.ts glueOf, one
// definition for both wires. A space the source has stays; a stop of the text after an element is no glue)
describe('google: an element the source glued to its word comes back glued', () => {
  const u = unit('g', [t('The name Smith'), el('n', 'math'), t(' and a size of 3'), el('k', 'math'), t('k units.')])
  it('the space before a glued element, and after one, taken back; the source’s own spaces kept', () => {
    const r = readTagged(u, '名字史密斯 <x id="1"/> 和 3 <x id="2"/> k 单位的大小。')
    expect(r?.content).toEqual([
      { t: 'text', s: '名字史密斯' },
      { t: 'el', id: 'n' },
      { t: 'text', s: ' 和 3' },
      { t: 'el', id: 'k' },
      { t: 'text', s: 'k 单位的大小。' },
    ])
  })
  it('read the same from the words Google is sent', () => {
    const r = readTagged(
      u,
      '名字史密斯 <span id="1" translate="no">x1</span> 和 3 <span id="2" translate="no">x2</span> k 单位的大小。',
    )
    expect(r?.content.map((p) => (p.t === 'text' ? p.s : `#${p.id}`)).join('')).toBe(
      '名字史密斯#n 和 3#kk 单位的大小。',
    )
  })
  it('a stop of the text right after an element is no glue: the space before it stays', () => {
    const q = unit('q', [t('Packed into a matrix '), el('m', 'math'), t('.')])
    expect(readTagged(q, '打包成一个矩阵<x id="1"/> 。')?.content).toEqual([
      { t: 'text', s: '打包成一个矩阵' },
      { t: 'el', id: 'm' },
      { t: 'text', s: ' 。' },
    ])
  })
})

// (the wire's contract: an element written as a word comes back as itself holding its own token and nothing else, once, and
// no token stands outside its element beyond what the unit's own text holds of it. Google moved one to another word and left
// its token behind as text (1706.03762v7's Table 1 caption, lane stray-stop's fill): a reader would have seen "x1")
describe('google: a reply that leaves an element’s token as text is unread, as a lost element is', () => {
  const u = unit('c', [
    t('Costs for different layer types. '),
    el('n', 'math'),
    t(' is the length, '),
    el('d', 'math'),
    t(' the width.'),
  ])
  const w = (n: number, s = `x${n}`) => `<span id="${n}" translate="no">${s}</span>`
  it('moved to another word, its token left behind', () => {
    expect(readTagged(u, `不同${w(1)}类型的成本。x1 为长度，${w(2)}为宽度。`)).toBeNull()
  })
  it('emptied, its token left behind; doubled; another element’s token', () => {
    expect(readTagged(u, `不同类型的成本。${w(1, '')}x1 为长度，${w(2)}为宽度。`)).toBeNull()
    expect(readTagged(u, `不同类型的成本。${w(1)}为长度 x1，${w(2)}为宽度。`)).toBeNull()
    expect(readTagged(u, `不同类型的成本。${w(1, 'x2')}为长度，${w(2)}为宽度。`)).toBeNull()
  })
  it('read where each element holds its own token and no token is left; the paper’s own `x1` is its text', () => {
    expect(readTagged(u, `不同类型的成本。${w(1)}为长度，${w(2)}为宽度。`)?.content).toEqual([
      { t: 'text', s: '不同类型的成本。' },
      { t: 'el', id: 'n' },
      { t: 'text', s: '为长度，' },
      { t: 'el', id: 'd' },
      { t: 'text', s: '为宽度。' },
    ])
    const own = unit('o', [t('The value x1 is set by '), el('n', 'math'), t('.')])
    expect(readTagged(own, `值 x1 由${w(1)}设定。`)?.content).toEqual([
      { t: 'text', s: '值 x1 由' },
      { t: 'el', id: 'n' },
      { t: 'text', s: '设定。' },
    ])
  })
})

// (the contract counts the tokens' form, not only the plan's own tokens: Google wrote a number of the text in the tokens' form,
// "increasing <x4> to 50" -> "将<x4>升级到 x50" (2610.40576v1, lane stray-stop's fill); a paper's own string of that form reads)
describe('google: a reply that writes a string of the tokens’ form the text does not hold is unread', () => {
  const w = (n: number) => `<span id="${n}" translate="no">x${n}</span>`
  it('a number of the text written as a token', () => {
    const u = unit('n', [t('Raising '), el('k', 'math'), t(' to 50 brings no benefit.')])
    expect(readTagged(u, `将${w(1)}提高到 x50 没有带来好处。`)).toBeNull()
    expect(readTagged(u, `将${w(1)}提高到 50 没有带来好处。`)?.content).toEqual([
      { t: 'text', s: '将' },
      { t: 'el', id: 'k' },
      { t: 'text', s: '提高到 50 没有带来好处。' },
    ])
  })
  it('the paper’s own string of that form reads, as often as it writes it', () => {
    const u = unit('o', [t('The x50 dose and '), el('k', 'math'), t(' differ.')])
    expect(readTagged(u, `x50 剂量与${w(1)}不同。`)?.content).toEqual([
      { t: 'text', s: 'x50 剂量与' },
      { t: 'el', id: 'k' },
      { t: 'text', s: '不同。' },
    ])
    expect(readTagged(u, `x50 剂量与${w(1)}不同（x50）。`)).toBeNull()
  })
})

// (the contract counts in the text as the reading keeps it: its entities decoded, its invisible code points out, on both
// sides. A character reference is one character, never a token: `&#x42;` is "B", though its spelling holds `x42` (a reply the
// equivalence gate's capture holds, tests/protector/rehydrate.test.ts, read today, refused by the count on the raw reply); and
// `&#120;1` is "x1", a string of the tokens' form a reader would see)
describe('google: the tokens’ form is counted in the text as the reading keeps it, not in the wire’s spelling', () => {
  const g = google({ fetch: scriptedFetch(googleEcho).fetch })
  const w = (n: number, s = `x${n}`) => `<span id="${n}" translate="no">${s}</span>`
  const u = unit('h', [t('Letters A and B, then '), el('k', 'math'), t('.')])
  it('a hex character reference is its character: read', () => {
    expect(readTagged(u, `字母 &#65; 和 &#x42;，然后${w(1)}。`)?.content).toEqual([
      { t: 'text', s: '字母 A 和 B，然后' },
      { t: 'el', id: 'k' },
      { t: 'text', s: '。' },
    ])
    expect(readTagged(u, `字母 A 和 &#X42;&#x5bb6;，然后${w(1)}。`)?.content[0]).toEqual({
      t: 'text',
      s: '字母 A 和 B家，然后',
    })
  })
  it('a reference that spells the tokens’ form is that string: unread where the text does not hold it, read where it does', () => {
    expect(readTagged(u, `字母 A 和 B，然后${w(1)}（&#120;1）。`)).toBeNull()
    expect(readTagged(u, `字母 A 和 B，然后${w(1)}（&#x78;&#49;）。`)).toBeNull()
    // (an invisible code point the reading drops does not hide one either)
    expect(readTagged(u, `字母 A 和 B，然后${w(1)}（x​1）。`)).toBeNull()
    const own = unit('o', [t('The value x1 is set by '), el('n', 'math'), t('.')])
    expect(readTagged(own, `值 &#120;1 由${w(1)}设定。`)?.content[0]).toEqual({ t: 'text', s: '值 x1 由' })
  })
  it('an element holding its own token spelled with a reference holds its token', () => {
    expect(readTagged(u, `字母 A 和 B，然后${w(1, '&#120;1')}。`)?.content[1]).toEqual({ t: 'el', id: 'k' })
    expect(readTagged(u, `字母 A 和 B，然后${w(1, 'x&#x31;')}。`)?.content[1]).toEqual({ t: 'el', id: 'k' })
    expect(readTagged(u, `字母 A 和 B，然后${w(1, '&#120;2')}。`)).toBeNull()
  })
  it('the wire’s own escaping counts alike on both sides: a paper’s literal `&#x42;` is its text, as often as it writes it', () => {
    const lit = unit('l', [t('Write B as &#x42; in HTML, as '), el('k', 'math'), t(' shows.')])
    expect(g.write(lit, 'zh-Hans')).toBe(
      'Write B as &amp;#x42; in HTML, as <span id="1" translate="no">x1</span> shows.',
    )
    expect(readTagged(lit, `在 HTML 中把 B 写成 &amp;#x42;，如${w(1)}所示。`)?.content[0]).toEqual({
      t: 'text',
      s: '在 HTML 中把 B 写成 &#x42;，如',
    })
    expect(readTagged(lit, `在 HTML 中把 B 写成 &amp;#x42;，如${w(1)}所示（&amp;#x42;）。`)).toBeNull()
  })
})

describe('google: a glued element’s white space taken back past the wire’s own pair tags and sentence marks', () => {
  it('into a pair after the element, and from a pair before it; a space the source has kept', () => {
    const r = readTagged(GLUED_PAST, '设为（<x id="1"/><t id="2"> A34</t>）和<t id="3">单词 </t><x id="4"/> 其余。')
    expect(r?.content).toEqual([
      { t: 'text', s: '设为（' },
      { t: 'el', id: 'a' },
      { t: 'span', id: 's', content: [{ t: 'text', s: 'A34' }] },
      { t: 'text', s: '）和' },
      { t: 'span', id: 'w', content: [{ t: 'text', s: '单词' }] },
      { t: 'el', id: 'b' },
      { t: 'text', s: ' 其余。' },
    ])
  })
  it('an element glued after another’s own stop: the reply’s space before that stop is no glue’s either', () => {
    const u = unit('o', [t('Values '), el('a', 'math', '.'), el('b', 'math'), t(' hold.')])
    expect(readTagged(u, '数值<x id="1"/> 。<x id="2"/> 成立。')?.content).toEqual([
      { t: 'text', s: '数值' },
      { t: 'el', id: 'a' },
      { t: 'el', id: 'b' },
      { t: 'text', s: ' 成立。' },
    ])
  })
  it('past a sentence start a reading marks there, the mark kept', () => {
    expect(`word ${SENTINEL} `.replace(GLUED_SPACE, '')).toBe(`word${SENTINEL}`)
    expect(` ${SENTINEL} G`.replace(GLUED_LEAD, '')).toBe(`${SENTINEL}G`)
    expect(`${SENTINEL} G`.replace(GLUED_LEAD, '')).toBe(`${SENTINEL}G`)
    expect(`word ${SENTINEL}`.replace(GLUED_SPACE, '')).toBe(`word${SENTINEL}`)
    expect('word '.replace(GLUED_SPACE, '')).toBe('word')
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
      .replace(/<span id="\d+">|<\/span>/g, '')
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
      '<span id="1">Current methods are not reliable.</span> <x id="3"/>To infer the source, one could rank sentences. <x id="4"/>We call it <span id="2">verifiable sources.</span> <x id="5"/>Then we go on.',
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
