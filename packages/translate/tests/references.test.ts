// A phrase group the markers wire sends on no wire, placed where the reply states its reference translation, the group's
// own text translated alone by the same translator (src/groups.ts placeReferences, src/chain.ts): once in the group's place,
// both ends on the reply's word boundaries in the target language. The owner's two bold leads of the 88 papers (lane
// style-wire, 2026-11-11): one placed, one honestly not, its reply's word not the reference's.
import { describe, expect, it } from 'vitest'
import { microsoft } from '../src/adapters/microsoft.ts'
import { chainOf, keyOf } from '../src/chain.ts'
import type { FetchInit, OutPiece, Result, Translator } from '../src/contract.ts'
import { placeReferences, referencesOf } from '../src/groups.ts'
import { scriptedFetch } from '../src/testing/fakes.ts'
import { fakeClock, memoryStore } from '../src/testing/ports.ts'
import { el, span, t, unit } from './pieces.ts'

const tx = (s: string): OutPiece => ({ t: 'text', s })
const sp = (id: string, content: OutPiece[]): OutPiece => ({ t: 'span', id, content })
const refs = (o: Record<string, string>) => new Map(Object.entries(o))
const all = async (it: AsyncIterable<Result>): Promise<Result[]> => {
  const out: Result[] = []
  for await (const r of it) out.push(r)
  return out
}

const lead = unit('u', [t('First, '), span('3', 'bold', [t('the hierarchical structure')]), t(' keeps the order.')])

describe('placeReferences: a phrase group placed where the reply states its reference once', () => {
  it('places it once, the reply its own', () => {
    expect(placeReferences(lead, [tx('首先，层级结构保留了顺序。')], refs({ 3: '层级结构' }), 'zh-Hans')).toEqual([
      tx('首先，'),
      sp('3', [tx('层级结构')]),
      tx('保留了顺序。'),
    ])
  })
  it("reads the reply as defined: NFKC, no white space beside a CJK character, runs of white space one, the reference's ends trimmed of punctuation", () => {
    expect(
      placeReferences(lead, [tx('首先， 层级 结构 保留了顺序。')], refs({ 3: '「层级结构。」' }), 'zh-Hans'),
    ).toEqual([tx('首先， '), sp('3', [tx('层级 结构')]), tx(' 保留了顺序。')])
  })
  it('does not place it where the reply states the reference twice, or not at all', () => {
    const twice = [tx('层级结构很重要，层级结构保留了顺序。')]
    expect(placeReferences(lead, twice, refs({ 3: '层级结构' }), 'zh-Hans')).toEqual(twice)
    const none = [tx('首先，等级制度保留了顺序。')]
    expect(placeReferences(lead, none, refs({ 3: '层级结构' }), 'zh-Hans')).toEqual(none)
  })
  it('refuses a place one of whose ends falls inside a word of the reply (ICU, the target language)', () => {
    const u = unit('d', [t('The '), span('2', 'italic', [t('dynamic degree')]), t(' count rises.')])
    const zh = [tx('动态度数增加。')]
    expect(placeReferences(u, zh, refs({ 2: '动态度' }), 'zh-Hans')).toEqual(zh)
    const v = unit('l', [t('We use '), span('2', 'italic', [t('the learning rate')]), t(' here.')])
    const de = [tx('Wir verwenden die Lernrate hier.')]
    expect(placeReferences(v, de, refs({ 2: 'die Lern' }), 'de')).toEqual(de)
    expect(placeReferences(v, de, refs({ 2: 'die Lernrate' }), 'de')).toEqual([
      tx('Wir verwenden '),
      sp('2', [tx('die Lernrate')]),
      tx(' hier.'),
    ])
  })
  it('gives the span back the opening and closing marks the reference was trimmed of, where the reply sets them right beside it', () => {
    // (synthetic stand-ins of Microsoft's Chinese, 2026-11-11: 2608.06701v1's "(1) Correcting behavioral drift." placed as
    // "（⟦1）…⟧", its bracket pair split, and 2610.19159v1's coloured "(Lenient Self-verification)" placed without its brackets)
    const item = unit('i', [t('As found: '), span('2', 'bold', [t('(1) Correcting the drift.')]), t(' Then more.')])
    expect(
      placeReferences(item, [tx('如下：（1）纠正漂移。然后更多。')], refs({ 2: '(1) 纠正漂移。' }), 'zh-Hans'),
    ).toEqual([tx('如下：'), sp('2', [tx('（1）纠正漂移')]), tx('。然后更多。')])
    const quote = unit('q', [t('He said: '), span('2', 'italic', [t('"I really see the value"')]), t('.')])
    expect(
      placeReferences(quote, [tx('他说：“我真的看到了价值”。')], refs({ 2: '“我真的看到了价值”' }), 'zh-Hans'),
    ).toEqual([tx('他说：'), sp('2', [tx('“我真的看到了价值”')]), tx('。')])
    // (its marks alone, in their order from the words outward: the reference's stop inside its closing quote, the reply's after it)
    expect(
      placeReferences(quote, [tx('他说：“我真的看到了价值”。')], refs({ 2: '“我真的看到了价值。”' }), 'zh-Hans'),
    ).toEqual([tx('他说：'), sp('2', [tx('“我真的看到了价值”')]), tx('。')])
    // (none where the reply sets no such mark there, or sets it apart from the words)
    expect(
      placeReferences(quote, [tx('他说：我真的看到了价值。')], refs({ 2: '“我真的看到了价值”' }), 'zh-Hans'),
    ).toEqual([tx('他说：'), sp('2', [tx('我真的看到了价值')]), tx('。')])
    const tag = unit('t', [t('Step 9 '), span('2', 'colour', [t('(Lenient check)')])])
    expect(placeReferences(tag, [tx('第9步 （ 宽容检查）')], refs({ 2: '（宽容检查）' }), 'zh-Hans')).toEqual([
      tx('第9步 （ '),
      sp('2', [tx('宽容检查')]),
      tx('）'),
    ])
    // (and never half a pair: a reply that sets its stop before the closing quote gives back neither quote)
    expect(
      placeReferences(quote, [tx('他说：“我真的看到了价值。”')], refs({ 2: '“我真的看到了价值”' }), 'zh-Hans'),
    ).toEqual([tx('他说：“'), sp('2', [tx('我真的看到了价值')]), tx('。”')])
  })
  it("the owner's two bold leads: the first placed, the second not (its reply's word is not its reference's)", () => {
    // (the replies are synthetic stand-ins of Microsoft's Chinese, 2026-11-11, with the property that decides each: the first
    // states the lead's reference translation once, at a word's ends; the second translates "failure" otherwise in context
    // than alone, 失败 against 失效, so its reference is nowhere in it)
    const proof = unit('p', [
      span('1', 'bold', [t('A proof that half the preconditioner is data-free by nature')]),
      t(' (Section 3). The rest follows.'),
    ])
    expect(
      placeReferences(
        proof,
        [tx('证明一半预条件器本质上是无数据的（第3节）。其余随后给出。')],
        refs({ 1: '证明一半预条件器本质上是无数据的' }),
        'zh-Hans',
      ),
    ).toEqual([sp('1', [tx('证明一半预条件器本质上是无数据的')]), tx('（第3节）。其余随后给出。')])
    const boundary = unit('f', [span('1', 'bold', [t('A falsifiable failure boundary')]), t(' (Section 4). It holds.')])
    const reply = [tx('一个可证伪的失败边界（第4节）。它成立。')]
    expect(placeReferences(boundary, reply, refs({ 1: '可证伪的失效边界' }), 'zh-Hans')).toEqual(reply)
  })
})

describe('referencesOf: the groups a reference is asked for', () => {
  it('a phrase group alone: not one that is `must`, the whole unit, holds an element, or is one word', () => {
    const u = unit('r', [
      span('1', 'bold', [t('a phrase of words')]),
      t(' and '),
      span('2', 'bold', [t('Kept')]),
      t(' and '),
      span('3', 'italic', [t('with '), el('e'), t(' inside')]),
      t(' and '),
      span('4', 'bold', [t('must words here')], true),
      t('.'),
    ])
    expect(referencesOf(u).map((g) => g.id)).toEqual(['1'])
    expect(referencesOf(unit('w', [span('1', 'bold', [t('Whole bold heading')])]))).toEqual([])
  })
  it("none for a bibliography's entry, under the References toggle: its groups a venue's italics and BibTeX's braces", () => {
    const entry = (kind: string) => ({
      ...unit('e', [t('A. Author. '), span('1', 'italic', [t('Advances in Neural Systems')]), t(', 2020.')]),
      kind,
    })
    expect(referencesOf(entry('para')).map((g) => g.id)).toEqual(['1'])
    for (const kind of ['reference', 'refnames', 'inkreferences']) expect(referencesOf(entry(kind)), kind).toEqual([])
  })
})

/** Microsoft's endpoint answering each text from a table, else with the text itself */
const table = (o: Record<string, string>) => (_url: string, init: FetchInit) => {
  const texts = JSON.parse(init.body) as string[]
  return {
    status: 200,
    body: JSON.stringify(texts.map((s) => ({ translations: [{ text: o[s] ?? s, to: 'zh-Hans' }] }))),
  }
}
const REPLIES = {
  'First, the hierarchical structure keeps the order.': '首先，层级结构保留了顺序。',
  'the hierarchical structure': '层级结构',
}

describe("the chain: a reference asked of a markers-wire translator alone, in the unit's batch", () => {
  it("asks the reference in the unit's request and places the group by it", async () => {
    const f = scriptedFetch(table(REPLIES))
    const [r] = await all(
      chainOf({ clock: fakeClock() }).translate([lead], 'zh-Hans', { translators: [microsoft({ fetch: f.fetch })] }),
    )
    expect(f.requests).toHaveLength(1)
    expect(JSON.parse(f.requests[0]?.init.body ?? '[]')).toEqual([
      'First, the hierarchical structure keeps the order.',
      'the hierarchical structure',
    ])
    expect(r?.ok && r.content).toEqual([tx('首先，'), sp('3', [tx('层级结构')]), tx('保留了顺序。')])
  })
  it("asks none of a translator whose declared wire is the tags'", async () => {
    const f = scriptedFetch(table(REPLIES))
    const tags: Translator = { ...microsoft({ fetch: f.fetch }), wire: 'tags' }
    await all(chainOf({ clock: fakeClock() }).translate([lead], 'zh-Hans', { translators: [tags] }))
    expect(f.requests.flatMap((q) => JSON.parse(q.init.body))).toEqual([
      'First, the hierarchical structure keeps the order.',
    ])
  })
  it("stores the unit's reply byte for byte as without references, the reference under its own key", async () => {
    const run = async (t: Translator) => {
      const store = memoryStore()
      await all(chainOf({ clock: fakeClock(), store }).translate([lead], 'zh-Hans', { translators: [t] }))
      return store
    }
    const m = microsoft({ fetch: scriptedFetch(table(REPLIES)).fetch })
    const withRefs = await run(m)
    const without = await run({ ...microsoft({ fetch: scriptedFetch(table(REPLIES)).fetch }), wire: 'tags' })
    const key = keyOf(m, 'zh-Hans', m.write(lead, 'zh-Hans'))
    expect(withRefs.entries.get(key)).toBe(without.entries.get(key))
    expect(typeof withRefs.entries.get(key)).toBe('string')
    expect(withRefs.entries.size).toBe(2)
    expect(without.entries.size).toBe(1)
  })
})
