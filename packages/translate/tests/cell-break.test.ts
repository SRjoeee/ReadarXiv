// A table cell set on several lines is one unit, its lines apart by a forced break element (docs/PDF-READER.md §18.75, the owner's
// decision of 2026-11-15). Where a translator's reply loses or doubles that element, the reply is refused like any reply that
// loses an element, and the chain's existing runs floor translates each line alone and joins them round the break: the cell
// falls back to today's line-by-line translation, still one unit. No chain rule is added: this holds the existing path for a
// cell's unit (not a case of the chain's digest table, whose outcomes stay as they are).
import { describe, expect, it } from 'vitest'
import { chainOf } from '../src/chain.ts'
import type { OutPiece, Result } from '../src/contract.ts'
import { fakeTranslator } from '../src/testing/fakes.ts'
import { fakeClock } from '../src/testing/ports.ts'
import { el, span, t, unit } from './pieces.ts'

const all = async (it: AsyncIterable<Result>): Promise<Result[]> => {
  const out: Result[] = []
  for await (const r of it) out.push(r)
  return out
}
/** a cell of two lines: "Jahn", a forced break, "symbol", in its \makecell's group */
const cell = () => unit('c', [span('1', 'other', [t('Jahn'), el('2', 'break'), t('symbol')])])
const upperText = (out: OutPiece[]): OutPiece[] =>
  out.map((p) =>
    p.t === 'text' ? { t: 'text', s: p.s.toUpperCase() } : p.t === 'span' ? { ...p, content: upperText(p.content) } : p,
  )
const dropBreak = (out: OutPiece[]): OutPiece[] =>
  out.flatMap((p): OutPiece[] =>
    p.t === 'el' && p.id === '2' ? [] : p.t === 'span' ? [{ ...p, content: dropBreak(p.content) }] : [p],
  )

describe('a cell of two lines whose reply loses its forced break', () => {
  it('falls back to its lines translated alone, joined round the break, in one unit: the runs floor', async () => {
    const tr = fakeTranslator({ identity: 'upper:0', reply: (out) => upperText(dropBreak(out)) })
    const rs = await all(chainOf({ clock: fakeClock() }).translate([cell()], 'zh-Hans', { translators: [tr] }))
    expect(rs[0]).toEqual({
      id: 'c',
      ok: true,
      by: 'runs:upper:0',
      // (its group, no edge of a stretch and holding no style the lay needs, comes back unstyled, as any such group on the floor)
      content: [
        { t: 'text', s: 'JAHN' },
        { t: 'el', id: '2' },
        { t: 'text', s: 'SYMBOL' },
      ],
    })
    // (the whole cell asked once; its two lines then asked together: no request of their own each)
    expect(tr.calls.map((ws) => ws.length)).toEqual([1, 2])
  })
  it('is translated whole where the reply keeps its break', async () => {
    const tr = fakeTranslator({ identity: 'upper:0', reply: (out) => upperText(out) })
    const rs = await all(chainOf({ clock: fakeClock() }).translate([cell()], 'zh-Hans', { translators: [tr] }))
    expect(rs[0]).toMatchObject({ ok: true, by: 'upper:0' })
    expect(tr.calls.map((ws) => ws.length)).toEqual([1])
  })
})
