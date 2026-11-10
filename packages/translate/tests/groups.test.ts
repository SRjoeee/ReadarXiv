// A group a reply did not bring back, placed around its own text where the translation holds that text as the source does
// (src/groups.ts placeGroups): the chain's reading of every reply, stored or fresh, whatever the wire. The owner's cases on
// staging (round 8 part A): 2610.17024v1 p9's `\textbf{(B1)}` and `\textbf{(B2)}--\textbf{(B4)}`, drawn plain because the
// markers wire sends a group that is not `must` on no wire (Microsoft moves such markers to the reply's end, empty: today's
// stored replies), and 2608.25210v2's `\textcolor{blue}{…}` placeholders, whose words the translator translates.
import { describe, expect, it } from 'vitest'
import { accept, textOf } from '../src/accept.ts'
import { chainOf } from '../src/chain.ts'
import type { OutPiece, Result } from '../src/contract.ts'
import { microsoft } from '../src/adapters/microsoft.ts'
import { placeGroups } from '../src/groups.ts'
import { scriptedFetch } from '../src/testing/fakes.ts'
import { fakeClock } from '../src/testing/ports.ts'
import { el, span, t, unit } from './pieces.ts'

const tx = (s: string): OutPiece => ({ t: 'text', s })
const sp = (id: string, content: OutPiece[]): OutPiece => ({ t: 'span', id, content })
const all = async (it: AsyncIterable<Result>): Promise<Result[]> => {
  const out: Result[] = []
  for await (const r of it) out.push(r)
  return out
}

// (2610.17024v1 p9, ord 131: three bold groups, none `must`, each a label the translator keeps as written)
const labels = unit('b', [
  t('We distinguish three conditions. Only '),
  span('1', 'bold', [t('(B1)')]),
  t(' is required for the theorem; '),
  span('5', 'bold', [t('(B2)')]),
  t('--'),
  span('9', 'bold', [t('(B4)')]),
  t(' are included to describe the relation.'),
])
// (Microsoft's reply as today's stored row 131 has it: full-width parentheses, the words around them its own)
const REPLY = '我们区分三个条件。结构定理只需 （B1） ;（B2）-（B4）用于描述关系。'

describe('placeGroups: a group the reply did not bring back, around its own text where the translation holds it once', () => {
  it('places each label group around its text in the translation, by Unicode compatibility (full-width parentheses)', () => {
    const got = placeGroups(labels, [tx(REPLY)])
    expect(got).toEqual([
      tx('我们区分三个条件。结构定理只需 '),
      sp('1', [tx('（B1）')]),
      tx(' ;'),
      sp('5', [tx('（B2）')]),
      tx('-'),
      sp('9', [tx('（B4）')]),
      tx('用于描述关系。'),
    ])
    expect(accept(labels, got)).toEqual({ ok: true })
  })
  it('takes out the empty copies a reply moved to its end, as Microsoft moves a marker pair inside a sentence', () => {
    // (today's stored row 131: `"…（B1） ;（B2）-（B4）用于…", 1, 3, 5, 7, 9, 11`: each group's markers at the end, empty)
    const got = placeGroups(labels, [tx(REPLY), sp('1', []), sp('5', []), sp('9', [])])
    expect(got.filter((p) => p.t === 'span').map((p) => (p.t === 'span' ? [p.id, p.content] : null))).toEqual([
      ['1', [tx('（B1）')]],
      ['5', [tx('（B2）')]],
      ['9', [tx('（B4）')]],
    ])
  })
  it("unwraps a copy the reply brought back holding white space, its content kept where it stands: the reply's text the same", () => {
    // (Codex on #634, 4520557057: a span holding white space alone passes as not brought back; taking the copy out took the
    // space with it, "Use valuenow.", after acceptance, and the projection the sentences are counted in moved)
    const u = unit('s', [t('Use '), span('1', 'italic', [t('value')]), t(' now.')])
    const reply = [tx('Use value'), sp('1', [tx(' ')]), tx('now.')]
    const got = placeGroups(u, reply)
    expect(got).toEqual([tx('Use '), sp('1', [tx('value')]), tx(' '), tx('now.')])
    expect(textOf(got)).toBe(textOf(reply))
    expect(accept(u, got)).toEqual({ ok: true })
    // (an empty copy, a moved marker pair, goes: nothing of the reply's text is in it)
    expect(placeGroups(u, [tx('Use value now.'), sp('1', [])])).toEqual([
      tx('Use '),
      sp('1', [tx('value')]),
      tx(' now.'),
    ])
  })
  it('leaves a group whose words the translator translated: no counterpart stated (2608.25210v2 p11)', () => {
    const u = unit('v', [
      t('Note that when '),
      span('3', 'colour', [t('value')]),
      t(' is False, we use '),
      span('7', 'colour', [t('score')]),
      t(' as its likelihood.'),
    ])
    const reply = [tx('注意当值为False时，我们使用分数作为其似然值。')]
    expect(placeGroups(u, reply)).toEqual(reply)
    // (where it keeps the word as written, the word is the group's)
    expect(placeGroups(u, [tx('注意当value为False时，我们使用分数作为其似然值。')])).toEqual([
      tx('注意当'),
      sp('3', [tx('value')]),
      tx('为False时，我们使用分数作为其似然值。'),
    ])
  })
  it('leaves a group whose text the translation holds twice, or inside a word, or the source holds outside it too', () => {
    const one = (s: string) => unit('o', [t('Use '), span('2', 'italic', [t(s)]), t(' here.')])
    expect(placeGroups(one('reg'), [tx('这里用 reg 和 reg。')])).toEqual([tx('这里用 reg 和 reg。')])
    expect(placeGroups(one('reg'), [tx('这里用 regularization。')])).toEqual([tx('这里用 regularization。')])
    const twice = unit('w', [t('Only '), span('1', 'bold', [t('(B1)')]), t(' and the plain (B1) here.')])
    expect(placeGroups(twice, [tx('只有（B1）和这里的（B1）。')])).toEqual([tx('只有（B1）和这里的（B1）。')])
  })
  it('places a group inside the group the reply holds around it, never across into another one', () => {
    const u = unit('n', [
      span('0', 'mono', [t('Score: '), span('2', 'colour', [t('value')]), t(' is true.')], true),
      t(' Then '),
      span('6', 'colour', [t('rank')]),
      t('.'),
    ])
    const got = placeGroups(u, [sp('0', [tx('得分：value为真。')]), tx(' 然后rank。')])
    expect(got).toEqual([
      sp('0', [tx('得分：'), sp('2', [tx('value')]), tx('为真。')]),
      tx(' 然后'),
      sp('6', [tx('rank')]),
      tx('。'),
    ])
    // (its text only in another group the reply holds: not its own)
    const v = unit('x', [span('0', 'mono', [t('A')], true), t(' and '), span('2', 'bold', [t('B1')]), t('.')])
    expect(placeGroups(v, [sp('0', [tx('B1 A')]), tx(' 和。')])).toEqual([sp('0', [tx('B1 A')]), tx(' 和。')])
  })
  it('leaves a group that holds an element or another group, and every group the reply brought back with its text', () => {
    const u = unit('e', [t('Let '), span('1', 'colour', [t('[sentence'), el('2', 'macro'), t('1]')]), t(' be it.')])
    expect(placeGroups(u, [tx('设 [sentence'), { t: 'el', id: '2' }, tx('1] 为它。')])).toEqual([
      tx('设 [sentence'),
      { t: 'el', id: '2' },
      tx('1] 为它。'),
    ])
    const kept = [tx('我们区分三个条件。结构定理只需 '), sp('1', [tx('（B1）')]), tx(' ; (B2)-(B4)用于描述关系。')]
    expect(placeGroups(labels, kept)).toEqual([
      tx('我们区分三个条件。结构定理只需 '),
      sp('1', [tx('（B1）')]),
      tx(' ; '),
      sp('5', [tx('(B2)')]),
      tx('-'),
      sp('9', [tx('(B4)')]),
      tx('用于描述关系。'),
    ])
  })
})

describe('the chain reads every reply so: a Microsoft reply to a unit with label groups on no wire', () => {
  it('sends the groups on no wire, and brings each back around its label in the translation', async () => {
    const f = scriptedFetch(() => ({ status: 200, body: JSON.stringify([{ translations: [{ text: REPLY }] }]) }))
    const [r] = await all(
      chainOf({ clock: fakeClock() }).translate([labels], 'zh-Hans', { translators: [microsoft({ fetch: f.fetch })] }),
    )
    expect(JSON.parse(f.requests[0]?.init.body ?? '[]')).toEqual([
      'We distinguish three conditions. Only (B1) is required for the theorem; (B2)--(B4) are included to describe the relation.',
    ])
    expect(r?.ok && r.content.filter((p) => p.t === 'span').map((p) => (p.t === 'span' ? p.content : null))).toEqual([
      [tx('（B1）')],
      [tx('（B2）')],
      [tx('（B4）')],
    ])
  })
})
