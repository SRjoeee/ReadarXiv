// A style group that cuts a word is offered to no translator (the owner's ruling of 2026-11-12, docs/PDF-READER.md §18.47):
// a group with an edge inside a word of the source (Unicode's word boundaries, UAX #29) describes that word's spelling, an
// acronym's initials or a stressed syllable, which has no counterpart in a translation, so the word travels whole and plain on
// every wire, and the translation carries no style from the group; a group of whole words travels as before. Each case runs
// through the chain with the real adapters (Google's tags wire, Microsoft's markers wire) over a scripted endpoint: what is
// sent, and the unit read back from a reply. Synthetic text only.
import { describe, expect, it } from 'vitest'
import { google, tagsWire } from '../src/adapters/google.ts'
import { microsoft } from '../src/adapters/microsoft.ts'
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
