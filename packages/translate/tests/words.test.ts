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
    const { sent, result } = await viaGoogle(u, () => '然后<t id="1">归纳步骤</t>运行。')
    expect(sent).toEqual(['Then <t id="1">the Induce step</t> runs.'])
    expect(ok(result).content).toEqual([tx('然后'), sp('1', [tx('归纳步骤')]), tx('运行。')])
  })
  it('a group whose head is a declaration keeps its head in a copy of itself; its words go plain', async () => {
    // (`{\bf B}olt-on`: the declaration, loose, would hold past the group, so it comes back in a copy holding it alone)
    const u = unit('h', [t('Short for '), span('1', 'other', [quiet('2'), t('B')]), t('olt-on parts.')])
    const { sent, result } = await viaGoogle(u, (w) =>
      w.replace('Short for ', '简称').replace('Bolt-on parts.', '螺栓部件。'),
    )
    expect(sent).toEqual(['Short for <x id="1"/>Bolt-on parts.'])
    expect(ok(result).content).toEqual([tx('简称'), sp('1', [{ t: 'el', id: '2' }]), tx('螺栓部件。')])
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
    expect((await viaGoogle(one, () => '这是<t id="1">关键</t>步骤。')).sent).toEqual([
      'This is the <t id="1">key</t> step.',
    ])
    const several = unit('v', [span('1', 'italic', [t('Whole words here')]), t(' stay styled.')])
    const { sent, result } = await viaGoogle(several, () => '<t id="1">这里的整词</t>保持样式。')
    expect(sent).toEqual(['<t id="1">Whole words here</t> stay styled.'])
    expect(ok(result).content).toEqual([sp('1', [tx('这里的整词')]), tx('保持样式。')])
  })
  it('a letter before a hyphen: `\\textit{n}-gram` (the hyphen is a word boundary)', async () => {
    const u = unit('g', [t('An '), span('1', 'italic', [t('n')]), t('-gram model.')])
    expect((await viaGoogle(u, () => '一个<t id="1">n</t>-gram 模型。')).sent).toEqual([
      'An <t id="1">n</t>-gram model.',
    ])
  })
  it('a group next to punctuation: `\\textbf{RQ1}:`, `\\textbf{Step 1}.`', async () => {
    const u = unit('q', [
      span('1', 'bold', [t('RQ1')]),
      t(': does it hold? See '),
      span('2', 'bold', [t('Step 1')]),
      t('.'),
    ])
    const { sent, result } = await viaGoogle(u, () => '<t id="1">RQ1</t>：成立吗？见<t id="2">步骤 1</t>。')
    expect(sent).toEqual(['<t id="1">RQ1</t>: does it hold? See <t id="2">Step 1</t>.'])
    expect(ok(result).content).toEqual([sp('1', [tx('RQ1')]), tx('：成立吗？见'), sp('2', [tx('步骤 1')]), tx('。')])
  })
  it('a CJK sentence with a group of a whole word (ICU’s dictionary words)', async () => {
    const u = unit('c', [t('我们提出了'), span('1', 'bold', [t('一种')]), t('新方法。')])
    const { sent, result } = await viaGoogle(u, () => 'We propose <t id="1">a</t> new method.')
    expect(sent).toEqual(['我们提出了<t id="1">一种</t>新方法。'])
    expect(ok(result).content).toEqual([tx('We propose '), sp('1', [tx('a')]), tx(' new method.')])
  })
  it('a group beside an element: an element is no letter of a word', async () => {
    const u = unit('x', [span('1', 'bold', [t('RQ')]), el('2'), t(' holds.')])
    expect((await viaGoogle(u, () => '<t id="1">RQ</t><x id="2"/> 成立。')).sent).toEqual([
      '<t id="1">RQ</t><x id="2"/> holds.',
    ])
  })
})

describe('what the rule leaves as it is', () => {
  it('a `must` group (a link, a run-in label, every pair of the HTML page) comes back as the host states, wherever its edges stand', async () => {
    // (a label glued to the next word by a colon: UAX #29 reads "Keywords:Linear" as one word)
    const u = unit('k', [span('1', 'bold', [t('Keywords')], true), t(':Linear maps, groups.')])
    expect((await viaGoogle(u, () => '<t id="1">关键词</t>：线性映射、群。')).sent).toEqual([
      '<t id="1">Keywords</t>:Linear maps, groups.',
    ])
    const link = unit('l', [span('1', 'link', [t('Git')], true), t('Hub hosts it.')])
    expect((await viaGoogle(link, () => '<t id="1">Git</t>Hub 托管它。')).sent).toEqual([
      '<t id="1">Git</t>Hub hosts it.',
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
