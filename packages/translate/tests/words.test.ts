// A style group that cuts a word is offered to no translator (the owner's ruling of 2026-11-12, docs/PDF-READER.md §18.47):
// a group with an edge inside a word of the source (Unicode's word boundaries, UAX #29) describes that word's spelling, an
// acronym's initials or a stressed syllable, which has no counterpart in a translation, so the word travels whole and plain on
// every wire, and the translation carries no style from the group; a group of whole words travels as before. Each case runs
// through the chain with the real adapters (Google's tags wire, Microsoft's markers wire) over a scripted endpoint: what is
// sent, and the unit read back from a reply. Synthetic text only.
import { describe, expect, it } from 'vitest'
import { google, tagsWire } from '../src/adapters/google.ts'
import { microsoft } from '../src/adapters/microsoft.ts'
import { accept } from '../src/accept.ts'
import { chainOf, rowContextOf } from '../src/chain.ts'
import type { FetchInit, Glossary, OutPiece, Piece, Result, UnitIn } from '../src/contract.ts'
import { fakeTranslator, scriptedFetch } from '../src/testing/fakes.ts'
import { fakeClock } from '../src/testing/ports.ts'
import { el, quiet, span, t, unit } from './pieces.ts'

const tx = (s: string): OutPiece => ({ t: 'text', s })
const sp = (id: string, content: OutPiece[]): OutPiece => ({ t: 'span', id, content })
const all = async (it: AsyncIterable<Result>): Promise<Result[]> => {
  const out: Result[] = []
  for await (const r of it) out.push(r)
  return out
}
const ok = (r: Result | undefined) => {
  if (!r?.ok) throw new Error(`not translated: ${JSON.stringify(r)}`)
  return r
}

/** the unit through the chain with Google alone: the wires sent, and the result of the reply `reply` gives each */
async function viaGoogle(u: UnitIn, reply: (wire: string) => string) {
  const f = scriptedFetch((_url: string, init: FetchInit) => {
    const [[items]] = JSON.parse(init.body) as [[string[]]]
    return { status: 200, body: JSON.stringify([items.map(reply)]) }
  })
  const rs = await all(
    chainOf({ clock: fakeClock() }).translate([u], 'zh-Hans', { translators: [google({ fetch: f.fetch })] }),
  )
  return { sent: f.requests.flatMap((r) => (JSON.parse(r.init.body) as [[string[]]])[0][0]), result: rs[0] }
}
/** … with Microsoft alone */
async function viaMicrosoft(u: UnitIn, reply: (wire: string) => string) {
  const f = scriptedFetch((_url: string, init: FetchInit) => {
    const texts = JSON.parse(init.body) as string[]
    return {
      status: 200,
      body: JSON.stringify(texts.map((s) => ({ translations: [{ text: reply(s), to: 'zh-Hans' }] }))),
    }
  })
  const rs = await all(
    chainOf({ clock: fakeClock() }).translate([u], 'zh-Hans', { translators: [microsoft({ fetch: f.fetch })] }),
  )
  return { sent: f.requests.flatMap((r) => JSON.parse(r.init.body) as string[]), result: rs[0] }
}

// (an acronym's initials set bold inside their words, the IER shape: `called \textbf{S}ample, \textbf{F}ilter, …`)
const initials = unit('i', [
  t('We call the method '),
  span('1', 'bold', [t('S')]),
  t('ample, '),
  span('3', 'bold', [t('F')]),
  t('ilter, '),
  span('5', 'bold', [t('R')]),
  t('ank (SFR).'),
])

describe('a group with an edge inside a word goes on no wire: the word travels whole and plain', () => {
  it("initials inside their words: Google is sent the words whole, and the reply's words carry no style", async () => {
    const { sent, result } = await viaGoogle(initials, () => '我们称该方法为采样、过滤、排序（SFR）。')
    expect(sent).toEqual(['We call the method Sample, Filter, Rank (SFR).'])
    expect(ok(result).content).toEqual([tx('我们称该方法为采样、过滤、排序（SFR）。')])
  })
  it('initials: Microsoft is sent the same words, and the put-back places no group around a letter the reply holds', async () => {
    // (the reply holds "F" once as a word: the literal put-back would have set the bold "F" around it)
    const { sent, result } = await viaMicrosoft(initials, () => '我们称该方法为采样、F 过滤、排序（SFR）。')
    expect(sent).toEqual(['We call the method Sample, Filter, Rank (SFR).'])
    expect(ok(result).content).toEqual([tx('我们称该方法为采样、F 过滤、排序（SFR）。')])
  })
  it('a group inside a word, both edges in it (a stressed syllable)', async () => {
    const u = unit('m', [t('The re'), span('1', 'italic', [t('con')]), t('struction loss falls.')])
    const { sent, result } = await viaGoogle(u, () => '重构损失下降。')
    expect(sent).toEqual(['The reconstruction loss falls.'])
    expect(ok(result).content).toEqual([tx('重构损失下降。')])
  })
  it('a group that ends inside a word, its start on a boundary', async () => {
    const u = unit('e', [t('We use '), span('1', 'bold', [t('pre')]), t('training on the data.')])
    const { sent, result } = await viaGoogle(u, () => '我们在数据上使用预训练。')
    expect(sent).toEqual(['We use pretraining on the data.'])
    expect(ok(result).content).toEqual([tx('我们在数据上使用预训练。')])
  })
  it('a group that starts inside a word, its end on a boundary', async () => {
    const u = unit('s', [t('The sub'), span('1', 'italic', [t('space')]), t(' is small.')])
    const { sent } = await viaGoogle(u, () => '子空间很小。')
    expect(sent).toEqual(['The subspace is small.'])
  })
  it('nested: the inner group cuts a word and goes, the outer one of whole words stays around them', async () => {
    const u = unit('n', [
      t('Then '),
      span('1', 'italic', [t('the '), span('2', 'bold', [t('I')]), t('nduce step')]),
      t(' runs.'),
    ])
    const { sent, result } = await viaGoogle(u, () => '然后<span id="1">归纳步骤</span>运行。')
    expect(sent).toEqual(['Then <span id="1">the Induce step</span> runs.'])
    expect(ok(result).content).toEqual([tx('然后'), sp('1', [tx('归纳步骤')]), tx('运行。')])
  })
  it('a group whose head is a declaration keeps its head in a copy of itself; its words go plain', async () => {
    // (`{\bf B}olt-on`: the declaration, loose, would hold past the group, so it comes back in a copy holding it alone; it sets
    // nothing, so the copy goes on no wire and comes back at the unit's end, as the markers wire puts it)
    const u = unit('h', [t('Short for '), span('1', 'other', [quiet('2'), t('B')]), t('olt-on parts.')])
    const { sent, result } = await viaGoogle(u, (w) =>
      w.replace('Short for ', '简称').replace('Bolt-on parts.', '螺栓部件。'),
    )
    expect(sent).toEqual(['Short for Bolt-on parts.'])
    expect(ok(result).content).toEqual([tx('简称螺栓部件。'), sp('1', [{ t: 'el', id: '2' }])])
  })
  it('a group that cuts a word with a stop TeX set at its end: the stop after the words, the sentences in the unit’s own projection', async () => {
    // (projection "PreStep Then it ends." with TeX's "." after "Step"; sent "PreStep. Then it ends.")
    const stepped: Piece = { t: 'span', id: '1', style: 'bold', stop: '.', content: [t('Step')] }
    const u = unit('p', [t('Pre'), stepped, t(' Then it ends.')], true)
    const { sent, result } = await viaGoogle(u, () => '预步骤。<x id="1"/>然后结束。')
    expect(sent).toEqual(['PreStep. <x id="1"/>Then it ends.'])
    const r = ok(result)
    expect(r.content).toEqual([tx('预步骤。然后结束。')])
    expect(r.sentences).toEqual({ src: [8], tr: [4] })
  })
})

describe('a group of whole words travels as before', () => {
  it('one whole word, and several', async () => {
    const one = unit('w', [t('This is the '), span('1', 'bold', [t('key')]), t(' step.')])
    expect((await viaGoogle(one, () => '这是<span id="1">关键</span>步骤。')).sent).toEqual([
      'This is the <span id="1">key</span> step.',
    ])
    const several = unit('v', [span('1', 'italic', [t('Whole words here')]), t(' stay styled.')])
    const { sent, result } = await viaGoogle(several, () => '<span id="1">这里的整词</span>保持样式。')
    expect(sent).toEqual(['<span id="1">Whole words here</span> stay styled.'])
    expect(ok(result).content).toEqual([sp('1', [tx('这里的整词')]), tx('保持样式。')])
  })
  it('a letter before a hyphen: `\\textit{n}-gram` (the hyphen is a word boundary)', async () => {
    const u = unit('g', [t('An '), span('1', 'italic', [t('n')]), t('-gram model.')])
    expect((await viaGoogle(u, () => '一个<span id="1">n</span>-gram 模型。')).sent).toEqual([
      'An <span id="1">n</span>-gram model.',
    ])
  })
  it('a group next to punctuation: `\\textbf{RQ1}:`, `\\textbf{Step 1}.`', async () => {
    const u = unit('q', [
      span('1', 'bold', [t('RQ1')]),
      t(': does it hold? See '),
      span('2', 'bold', [t('Step 1')]),
      t('.'),
    ])
    const { sent, result } = await viaGoogle(u, () => '<span id="1">RQ1</span>：成立吗？见<span id="2">步骤 1</span>。')
    expect(sent).toEqual(['<span id="1">RQ1</span>: does it hold? See <span id="2">Step 1</span>.'])
    expect(ok(result).content).toEqual([sp('1', [tx('RQ1')]), tx('：成立吗？见'), sp('2', [tx('步骤 1')]), tx('。')])
  })
  it('a CJK sentence with a group of a whole word (ICU’s dictionary words)', async () => {
    const u = unit('c', [t('我们提出了'), span('1', 'bold', [t('一种')]), t('新方法。')])
    const { sent, result } = await viaGoogle(u, () => 'We propose <span id="1">a</span> new method.')
    expect(sent).toEqual(['我们提出了<span id="1">一种</span>新方法。'])
    expect(ok(result).content).toEqual([tx('We propose '), sp('1', [tx('a')]), tx(' new method.')])
  })
  it('a group beside an element: an element is no letter of a word', async () => {
    const u = unit('x', [span('1', 'bold', [t('RQ')]), el('2'), t(' holds.')])
    expect((await viaGoogle(u, () => '<span id="1">RQ</span><x id="2"/> 成立。')).sent).toEqual([
      '<span id="1">RQ</span><b translate=no>x2</b> holds.',
    ])
  })
})

describe('what the rule leaves as it is', () => {
  it('a `must` group (a link, a run-in label, every pair of the HTML page) comes back as the host states, wherever its edges stand', async () => {
    // (a label glued to the next word by a colon: UAX #29 reads "Keywords:Linear" as one word)
    const u = unit('k', [span('1', 'bold', [t('Keywords')], true), t(':Linear maps, groups.')])
    expect((await viaGoogle(u, () => '<span id="1">关键词</span>：线性映射、群。')).sent).toEqual([
      '<span id="1">Keywords</span>:Linear maps, groups.',
    ])
    const link = unit('l', [span('1', 'link', [t('Git')], true), t('Hub hosts it.')])
    expect((await viaGoogle(link, () => '<span id="1">Git</span>Hub 托管它。')).sent).toEqual([
      '<span id="1">Git</span>Hub hosts it.',
    ])
  })
  it('a unit with no letter is sent nothing and keeps its groups', async () => {
    const u = unit('d', [t('12'), span('1', 'bold', [t('3')]), t('4')])
    const { sent, result } = await viaGoogle(u, (w) => w)
    expect(sent).toEqual([])
    expect(ok(result).content).toEqual([tx('12'), sp('1', [tx('3')]), tx('4')])
  })
  it("a row's context is keyed by the unit as it is sent: the glossary's entries its words use, whole", () => {
    // (a translator reading the context on the tags wire, as the extension's LLM services do, using the entries its wire holds)
    const llm = {
      ...fakeTranslator({ identity: 'llm:0', context: true }),
      write: tagsWire.write,
      read: tagsWire.read,
      glossaryOf: (wire: string, g: Glossary) => g.filter((e) => wire.includes(e.term)),
    }
    const context = {
      title: 'T',
      glossary: [
        { term: 'Sample', translation: '样本' },
        { term: 'Other', translation: '其他' },
      ],
    }
    expect(rowContextOf([llm], initials, 'zh-Hans', context)).toEqual({
      title: 'T',
      glossary: [{ term: 'Sample', translation: '样本' }],
    })
  })
})

// (F10 of the display design: the letters and marks glued to the text TeX set for an element, on its line's baseline
// at its text's size (the element's `text`, the prepare's), are its word's, never a word of their own. 2111.09276v1's
// Table 1 on staging, Google: `\hlyellow{guitar}s.` went out as an element and "s.", and "s" came back as 秒, seconds. The rule
// is by the text alone: the letters and marks that touch it, on a side it begins or ends with a letter, a mark or a digit; the
// kind is not
// asked)
describe('the letters and marks that touch an element’s text are its word’s', () => {
  const mac = (id: string, text?: string): Piece =>
    text === undefined ? { t: 'el', id, kind: 'macro' } : { t: 'el', id, kind: 'macro', text }
  const guitar = unit('g', [t('Polish the '), mac('h', 'guitar'), t('s. Then tune them.')], true)
  it('"guitar" + "s": Google is sent the element alone, and the row puts the letter back beside it', async () => {
    const { sent, result } = await viaGoogle(guitar, () => '擦亮<b translate=no>x1</b>。<x id="2"/>然后给它们调音。')
    expect(sent).toEqual(['Polish the <b translate=no>x1</b>. <x id="2"/>Then tune them.'])
    const r = ok(result)
    expect(r.content).toEqual([tx('擦亮'), { t: 'el', id: 'h' }, tx('s。然后给它们调音。')])
    // (the sentences in the unit's own projection, and in the row as it is drawn)
    expect(r.sentences).toEqual({ src: [15], tr: [5] })
  })
  it('a character outside the BMP before held letters: the later sentence starts where it stands (offsets in UTF-16 code units)', async () => {
    // ("𝒜" two code units; own projection "𝒜 We use ￼s. Then it ends.", "Then" at 14 there and in the row)
    const u = unit('a', [t('𝒜 We use '), mac('h', 'guitar'), t('s. Then it ends.')], true)
    const { sent, result } = await viaGoogle(u, (w) => w)
    expect(sent).toEqual(['𝒜 We use <b translate=no>x1</b>. <x id="2"/>Then it ends.'])
    const r = ok(result)
    expect(r.content).toEqual([tx('𝒜 We use '), { t: 'el', id: 'h' }, tx('s. Then it ends.')])
    expect(r.sentences).toEqual({ src: [14], tr: [14] })
  })
  it('a sentence that opens with letters held before an element (`It ends. M\\k{a}dry works.`): both starts before the name', async () => {
    // (own projection "It ends. M￼dry works.": the second sentence starts at "M", 9, in the unit and in the row)
    const u = unit('b', [t('It ends. M'), mac('k', 'ą'), t('dry works.')], true)
    const { sent, result } = await viaGoogle(u, (w) => w)
    expect(sent).toEqual(['It ends. <x id="2"/><b translate=no>x1</b> works.'])
    const r = ok(result)
    expect(r.content).toEqual([tx('It ends. M'), { t: 'el', id: 'k' }, tx('dry works.')])
    expect(r.sentences).toEqual({ src: [9], tr: [9] })
  })
  it('Microsoft is sent the element alone too', async () => {
    const { sent, result } = await viaMicrosoft(guitar, () => '擦亮@a#。然后给它们调音。')
    expect(sent).toEqual(['Polish the @a#. Then tune them.'])
    expect(ok(result).content).toEqual([tx('擦亮'), { t: 'el', id: 'h' }, tx('s。然后给它们调音。')])
  })
  it('an accent set inside a name (`M\\k{a}dry`): the name stays as written, the element and its letters together', async () => {
    const u = unit('k', [t('Work by M'), mac('k', 'ą'), t('dry and others.')])
    const { sent, result } = await viaGoogle(u, () => '作者<b translate=no>x1</b>等人。')
    expect(sent).toEqual(['Work by <b translate=no>x1</b> and others.'])
    expect(ok(result).content).toEqual([tx('作者M'), { t: 'el', id: 'k' }, tx('dry等人。')])
  })
  it('several elements in one word (`Y\\i ld\\i r\\i m`): each one’s letters come back beside it', async () => {
    const u = unit('y', [t('Y'), mac('a', 'ı'), t('ld'), mac('b', 'ı'), t('r'), mac('c', 'ı'), t('m is a name.')])
    const { sent, result } = await viaGoogle(
      u,
      () => '<b translate=no>x1</b><b translate=no>x2</b><b translate=no>x3</b>是一个名字。',
    )
    expect(sent).toEqual(['<b translate=no>x1</b><b translate=no>x2</b><b translate=no>x3</b> is a name.'])
    expect(ok(result).content).toEqual([
      tx('Y'),
      { t: 'el', id: 'a' },
      tx('ld'),
      { t: 'el', id: 'b' },
      tx('r'),
      { t: 'el', id: 'c' },
      tx('m是一个名字。'),
    ])
  })
  it('an element inside a group, its letter outside the group: the letter comes back after the group', async () => {
    const u = unit('c', [t('Polish the '), span('1', 'colour', [mac('h', 'guitar')]), t('s now.')])
    const { sent, result } = await viaGoogle(u, () => '现在擦亮<b translate=no>x1</b>。')
    expect(sent).toEqual(['Polish the <b translate=no>x1</b> now.'])
    expect(ok(result).content).toEqual([tx('现在擦亮'), sp('1', [{ t: 'el', id: 'h' }]), tx('s。')])
  })
  it('letters in a group that does not hold the element (a link whose text is "M" before `\\k{a}dry`) stay in it, on the wire', async () => {
    // (held, they left the link empty, a `must` group the original states with its text: accept refused the row)
    const u = unit('l', [t('Work by '), span('1', 'link', [t('M')], true), mac('k', 'ą'), t('dry.')])
    for (const via of [viaGoogle, viaMicrosoft]) {
      const { result } = await via(u, (w) => w)
      const r = ok(result)
      expect(r.content).toEqual([tx('Work by '), sp('1', [tx('M')]), { t: 'el', id: 'k' }, tx('dry.')])
      expect(accept(u, r.content)).toEqual({ ok: true })
    }
    expect((await viaGoogle(u, (w) => w)).sent).toEqual(['Work by <span id="1">M</span><b translate=no>x2</b>.'])
  })
  it('letters after the element, past the edge of a group that holds them and not it: up to the edge alone', async () => {
    // ("ab" in the element's group, "cd" in a link after it: "cd" goes on the wire in its link)
    const u = unit('e', [t('See '), mac('g', 'guitar'), t('ab'), span('2', 'link', [t('cd')], true), t(' now.')])
    const { sent, result } = await viaGoogle(u, (w) => w)
    expect(sent).toEqual(['See <b translate=no>x1</b><span id="2">cd</span> now.'])
    expect(ok(result).content).toEqual([tx('See '), { t: 'el', id: 'g' }, tx('ab'), sp('2', [tx('cd')]), tx(' now.')])
  })
  it('letters after an element of no text (a tie) and before one of their word: back before that one, not after the tie', async () => {
    const u = unit('t', [t('Work by'), el('s', 'space'), t('M'), mac('k', 'ą'), t('dry.')])
    const { sent, result } = await viaGoogle(u, () => '由<b translate=no>x1</b>作者<b translate=no>x2</b>。')
    expect(sent).toEqual(['Work by<b translate=no>x1</b><b translate=no>x2</b>.'])
    expect(ok(result).content).toEqual([tx('由'), { t: 'el', id: 's' }, tx('作者M'), { t: 'el', id: 'k' }, tx('dry。')])
  })
  it('an element TeX sets after the unit’s text (`after`, a backref’s pages) is no word of it: its text holds none of the unit’s letters', async () => {
    const back: Piece = { t: 'el', id: 'b', kind: 'macro', text: '8', after: ' ' }
    const u = unit('r', [t('A. Author. A title. arXiv:2309.08471.'), back])
    const { sent } = await viaGoogle(u, (w) => w)
    expect(sent).toEqual(['A. Author. A title. arXiv:2309.08471.'])
  })
  it('an element that states no text (a raised mark, `\\textsuperscript{1}Carnegie`) is offered with its letters, as before', async () => {
    const u = unit('a', [mac('s'), t('Carnegie Mellon University')])
    const { sent } = await viaGoogle(u, () => '<b translate=no>x1</b>卡内基梅隆大学')
    expect(sent).toEqual(['<b translate=no>x1</b>Carnegie Mellon University'])
  })
  it('an element whose text makes no word with what is beside it: the unit goes as it is', async () => {
    const spaced = unit('s', [t('The '), mac('h', 'guitar'), t(' sounds. A '), mac('d', '–'), t('dash.')])
    const { sent } = await viaGoogle(spaced, (w) => w)
    expect(sent).toEqual(['The <b translate=no>x1</b> sounds. A <b translate=no>x2</b>dash.'])
  })
  // (the coordinator's ruling of 2026-11-15: what is held back is glued in the strict sense, letters and marks touching
  // the text, never across an apostrophe, a hyphen, a comma or a full stop: a possessive is a word of the sentence)
  it('a name and its possessive: the possessive stays on the wire, a word the translator translates', async () => {
    const u = unit('p', [t('We use '), mac('n', 'TensorCast'), t("'s model here.")])
    const { sent } = await viaGoogle(u, (w) => w)
    expect(sent).toEqual(["We use <b translate=no>x1</b>'s model here."])
  })
  // (the coordinator's second ruling: a digit is never held back; a number goes through a translator as written, and held back
  // it would be cut at its decimal point or its comma)
  it('a quantity before an element whose text is letters (`0.2\\pp`): nothing held, the number whole on the wire', async () => {
    const u = unit('q', [t('The rate falls by 0.2'), mac('p', 'pp'), t(' here.')])
    const { sent } = await viaGoogle(u, (w) => w)
    expect(sent).toEqual(['The rate falls by 0.2<b translate=no>x1</b> here.'])
  })
  it('an identifier’s digits against an element’s text (an id before a prefix): nothing held', async () => {
    const u = unit('d', [t('See arXiv:1701.01467'), mac('d', 'doi:10.48550/x'), t(' now.')])
    const { sent } = await viaGoogle(u, (w) => w)
    expect(sent).toEqual(['See arXiv:1701.01467<b translate=no>x1</b> now.'])
  })
  it('letters then digits after an element (`s2`): the letters held, the digits on the wire', async () => {
    const u = unit('s', [t('Two '), mac('g', 'guitar'), t('s2 sound.')])
    const { sent, result } = await viaGoogle(u, () => '两把<b translate=no>x1</b>2 响。')
    expect(sent).toEqual(['Two <b translate=no>x1</b>2 sound.'])
    expect(ok(result).content).toEqual([tx('两把'), { t: 'el', id: 'g' }, tx('s2 响。')])
  })
  it('an amount and the rest of its number after a comma: the rest stays on the wire', async () => {
    const u = unit('y', [t('A stake of '), mac('m', '¥100'), t(',000 was paid.')])
    const { sent } = await viaGoogle(u, (w) => w)
    expect(sent).toEqual(['A stake of <b translate=no>x1</b>,000 was paid.'])
  })
  it('a formula’s glued letters are not held: the formula states no text (`$i$-th`, `$d$-dimensional`)', async () => {
    const u = unit('i', [t('The '), el('f'), t('-th row and the '), el('g'), t('th one.')])
    const { sent } = await viaGoogle(u, (w) => w)
    expect(sent).toEqual(['The <b translate=no>x1</b>-th row and the <b translate=no>x2</b>th one.'])
  })
  it('a text that ends with a stop or a bracket holds back no letter after it; one that ends with a digit holds the letter it touches', async () => {
    const u = unit('e', [
      t('Made in the '),
      mac('u', 'U.S.'),
      t('A now, see '),
      mac('r', '(a)'),
      t('bc and '),
      mac('f', 'Figure 2'),
      t('a.'),
    ])
    const { sent, result } = await viaGoogle(
      u,
      () => '现在<b translate=no>x1</b>A 制造，见<b translate=no>x2</b>bc 和<b translate=no>x3</b>。',
    )
    expect(sent).toEqual([
      'Made in the <b translate=no>x1</b>A now, see <b translate=no>x2</b>bc and <b translate=no>x3</b>.',
    ])
    expect(ok(result).content.at(-1)).toEqual(tx('a。'))
  })
})

// (the same rule's second arm, lane flush-hold of 2026-11-18, docs/PDF-READER.md §18.47: an author types `32$\times$32`,
// `$-$0.016`, `6$n$+2`, the number outside the math and flush against it. Sent beside the formula's tag, the number came back
// broken: a counter or a noun put between the digits and the formula, digits lost (staging, 1512.03385v1 in Korean, Google:
// both 32s of "32×32" gone, a verb drawn beside the ×). The run of the unit's text that touches an inline formula (kind `math`),
// up to white space, in its own text piece and in no group that does not hold the formula, less the sentence punctuation,
// quotes and unpaired bracket at its far edge (@readarxiv/text, the identifier's edge), is held where it holds a digit and no
// letter, and put back literally beside the formula, wherever the reply set it. Text of our own)
describe('a number set flush against an inline formula is held with it', () => {
  const E = (id: string): OutPiece => ({ t: 'el', id })
  // (1512.03385v1's unit on staging, its shape in sentences of our own: `32$\times$32`, `3$\times$3`, `2$n$`, `6$n$+2`)
  const grid = unit('r', [
    t('The inputs are 32'),
    el('a'),
    t('32 images. The first layer is 3'),
    el('b'),
    t('3 filters. We stack '),
    el('c'),
    t(' layers with 2'),
    el('d'),
    t(' layers a size, and 6'),
    el('e'),
    t('+2 layers in all.'),
  ])
  const gridBack = [
    tx('Die Eingaben sind Bilder von 32'),
    E('a'),
    tx('32. Die erste Schicht hat 3'),
    E('b'),
    tx('3 Filter. Wir stapeln '),
    E('c'),
    tx(' Schichten mit 2'),
    E('d'),
    tx(' Schichten je Größe, insgesamt 6'),
    E('e'),
    tx('+2 Schichten.'),
  ]
  it('Google is sent the formulas alone; the row has every number back flush beside its formula, where the reply moved it', async () => {
    const { sent, result } = await viaGoogle(
      grid,
      () =>
        'Die Eingaben sind Bilder von <b translate=no>x1</b>. Die erste Schicht hat <b translate=no>x2</b> Filter. Wir stapeln <b translate=no>x3</b> Schichten mit <b translate=no>x4</b> Schichten je Größe, insgesamt <b translate=no>x5</b> Schichten.',
    )
    expect(sent).toEqual([
      'The inputs are <b translate=no>x1</b> images. The first layer is <b translate=no>x2</b> filters. We stack <b translate=no>x3</b> layers with <b translate=no>x4</b> layers a size, and <b translate=no>x5</b> layers in all.',
    ])
    expect(ok(result).content).toEqual(gridBack)
  })
  it('Microsoft is sent the formulas alone too, and its row has the numbers back the same way', async () => {
    const { sent, result } = await viaMicrosoft(
      grid,
      () =>
        'Die Eingaben sind Bilder von @a#. Die erste Schicht hat @b# Filter. Wir stapeln @c# Schichten mit @d# Schichten je Größe, insgesamt @e# Schichten.',
    )
    expect(sent).toEqual([
      'The inputs are @a# images. The first layer is @b# filters. We stack @c# layers with @d# layers a size, and @e# layers in all.',
    ])
    expect(ok(result).content).toEqual(gridBack)
  })
  it('the glue: a reply’s space beside the formula stays outside the number, which comes back flush (`6$n$+2`, not "6n + 2")', async () => {
    // (sent "6<x1>+2", the reply's " + 2" stood: the glue takes a space back only before a letter, a digit or a mark)
    const u = unit('g', [t('There are 6'), el('n'), t('+2 layers.')])
    const { sent, result } = await viaGoogle(u, () => 'Es gibt <b translate=no>x1</b> Schichten.')
    expect(sent).toEqual(['There are <b translate=no>x1</b> layers.'])
    expect(ok(result).content).toEqual([tx('Es gibt 6'), E('n'), tx('+2 Schichten.')])
  })
  it('a sentence that opens with a number held before a formula starts before the number, in the unit and in the row', async () => {
    // (a formula whose reading the host states, `×`, as the page does; the cutter's sentence at the formula, the unit's at "32",
    // 9, and the row's: the number put back before the formula is the later sentence's)
    const u = unit('s', [t('It ends. 32'), { t: 'el', id: 'f', kind: 'math', reads: '×' }, t('32 Tiles work.')], true)
    const { sent, result } = await viaGoogle(u, (w) => w)
    expect(sent).toEqual(['It ends. <x id="2"/><b translate=no>x1</b> Tiles work.'])
    const r = ok(result)
    expect(r.content).toEqual([tx('It ends. 32'), E('f'), tx('32 Tiles work.')])
    expect(r.sentences).toEqual({ src: [9], tr: [9] })
  })
  it('a run between two formulas is the first’s (`$\\sim$15$\\%$`): back after the first, wherever the reply set the second', async () => {
    const u = unit('b', [t('An error of '), el('s'), t('15'), el('p'), t(' is seen.')])
    const g = await viaGoogle(u, () => 'Ein Fehler von <b translate=no>x1</b><b translate=no>x2</b> ist da.')
    expect(g.sent).toEqual(['An error of <b translate=no>x1</b><b translate=no>x2</b> is seen.'])
    expect(ok(g.result).content).toEqual([tx('Ein Fehler von '), E('s'), tx('15'), E('p'), tx(' ist da.')])
    // (side by side once the number is held, Microsoft's wire joins the two in one marker, as any two touching elements)
    const m = await viaMicrosoft(u, () => 'Ein Fehler von @a# ist da.')
    expect(m.sent).toEqual(['An error of @a# is seen.'])
    expect(ok(m.result).content).toEqual([tx('Ein Fehler von '), E('s'), tx('15'), E('p'), tx(' ist da.')])
  })
  // (each case: the unit, and the wire Google is sent; the probe's samples by kind, in lane flush-digits' record)
  const CASES: [string, Piece[], string][] = [
    [
      'digits on both sides (`256$\\times$256`)',
      [t('Images of 256'), el('f'), t('256 pixels.')],
      'Images of X pixels.',
    ],
    [
      'a decimal set with a formula’s point (`0$.$5`)',
      [t('A rate of 0'), el('f'), t('5 is used.')],
      'A rate of X is used.',
    ],
    [
      'digits after a sign the formula sets (`$-$0.016`)',
      [t('It moves by '), el('f'), t('0.016 here.')],
      'It moves by X here.',
    ],
    ['a sign and digits after a formula (`$p$=20`)', [el('f'), t('=20 runs were made.')], 'X runs were made.'],
    ['a range (`1260$-$1460 MHz`)', [t('Band 5 (1260'), el('f'), t('1460 MHz) is used.')], 'Band 5 (X MHz) is used.'],
    [
      'a per cent sign in the run (`$>$99%`)',
      [t('It holds '), el('f'), t('99% of the time.')],
      'It holds X of the time.',
    ],
    [
      'a comma at the far edge stays text (`$\\times$2.5,`)',
      [t('Scaled by '), el('f'), t('2.5, then cut.')],
      'Scaled by X, then cut.',
    ],
    [
      'a stop at the far edge stays text',
      [t('It falls by '), el('f'), t('0.003. Then it rises.')],
      'It falls by X. Then it rises.',
    ],
    [
      'a stop and a bracket at the far edge (`$\\ell$1).`)',
      [t('A loss (smoothed '), el('f'), t('1). Then more.')],
      'A loss (smoothed X). Then more.',
    ],
    [
      'unpaired brackets at both far edges (`(16$\\times$16)`)',
      [t('Use tokens (16'), el('f'), t('16) here.')],
      'Use tokens (X) here.',
    ],
    [
      'a bracket its pair answers inside the run is the run’s (`$\\zeta$(9)`)',
      [t('Only '), el('f'), t('(9) remains.')],
      'Only X remains.',
    ],
    ['quotes at the far edges stay text', [t('The "3'), el('f'), t('3" grid.')], 'The "X" grid.'],
    [
      'a run holding a letter is not held; the other side is (`J1744$-$1134`)',
      [t('Pulsar J1744'), el('f'), t('1134 is seen.')],
      'Pulsar J1744X is seen.',
    ],
    [
      'a number before a unit’s letter (`2.5$\\mu$m`): the number held, the letter sent',
      [t('A 2.5'), el('f'), t('m film.')],
      'A Xm film.',
    ],
    ['a note mark on a count (`$^{a}$13 runs`)', [el('f'), t('13 runs failed.')], 'X runs failed.'],
    ['marks alone touching a formula: nothing held', [t('For '), el('f'), t(', it holds.')], 'For X, it holds.'],
    [
      'a number apart from the formula (a space between): nothing held',
      [t('About 32 '), el('f'), t(' 32 tiles.')],
      'About 32 X 32 tiles.',
    ],
  ]
  for (const [name, content, wire] of CASES)
    it(name, async () => {
      const { sent } = await viaGoogle(unit('c', content), (w) => w)
      expect(sent).toEqual([wire.replace('X', '<b translate=no>x1</b>')])
    })
  it('a number in a group that does not hold the formula stays in it, on the wire; one outside a group that holds it comes back outside', async () => {
    const inBold = unit('i', [t('A '), span('1', 'bold', [t('3')]), el('f'), t('3 grid.')])
    expect((await viaGoogle(inBold, (w) => w)).sent).toEqual(['A <span id="1">3</span><b translate=no>x2</b> grid.'])
    const outside = unit('o', [t('Take 3'), span('1', 'italic', [el('f'), t(' cells')]), t(' now.')])
    const { sent, result } = await viaGoogle(
      outside,
      () => 'Nimm <span id="1"><b translate=no>x2</b> Zellen</span> jetzt.',
    )
    expect(sent).toEqual(['Take <span id="1"><b translate=no>x2</b> cells</span> now.'])
    expect(ok(result).content).toEqual([tx('Nimm 3'), sp('1', [E('f'), tx(' Zellen')]), tx(' jetzt.')])
  })
  it('formulas apart by white space alone once their numbers are held (`$p$=5 $n$=20`): Microsoft joins them in one marker, and each number comes back beside its own', async () => {
    const u = unit('j', [el('p'), t('=5 '), el('n'), t('=20 runs, seed 50.')])
    const { sent, result } = await viaMicrosoft(u, () => '@a# Läufe, Seed 50.')
    expect(sent).toEqual(['@a# runs, seed 50.'])
    expect(ok(result).content).toEqual([E('p'), tx('=5 '), E('n'), tx('=20 Läufe, Seed 50.')])
  })
  it('a group of a number and its formula alone (`\\textbf{1.35$\\times$}`): it goes on no wire, and comes back around them', async () => {
    const u = unit('h', [t('It reaches '), span('2', 'bold', [t('1.35'), el('f')]), t(' speedups.')])
    const { sent, result } = await viaGoogle(u, () => 'Es erreicht <b translate=no>x1</b> Beschleunigung.')
    expect(sent).toEqual(['It reaches <b translate=no>x1</b> speedups.'])
    expect(ok(result).content).toEqual([tx('Es erreicht '), sp('2', [tx('1.35'), E('f')]), tx(' Beschleunigung.')])
  })
  it('a number against an element of another kind goes through as written (`0.58\\pp`, a reference, a display)', async () => {
    const u = unit('k', [
      t('It rose by 0.58'),
      { t: 'el', id: 'p', kind: 'macro' },
      t(' points, see Table 1'),
      el('r', 'ref'),
      t('2 and the rest.'),
    ])
    expect((await viaGoogle(u, (w) => w)).sent).toEqual([
      'It rose by 0.58<b translate=no>x1</b> points, see Table 1<b translate=no>x2</b>2 and the rest.',
    ])
  })
  it('a unit of numbers and a formula alone (a cell `32$\\times$32`) has no letter: sent nothing, as before', async () => {
    const u = unit('n', [t('32'), el('f'), t('32')])
    const { sent, result } = await viaGoogle(u, (w) => w)
    expect(sent).toEqual([])
    expect(ok(result).content).toEqual([tx('32'), E('f'), tx('32')])
  })
})
