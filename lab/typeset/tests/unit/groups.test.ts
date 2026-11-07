// D.groups on hand-made members, each held to today's unitHiding (hide.mjs, engine 065c1d973, imported where today's tree is
// at hand) on the same case: its groups off as bits, its shown ink.
import { describe, expect, it } from 'vitest'
import { type GroupEl, type GroupsInput, groupsOff } from '../../../../packages/typeset/src/emit/groups.ts'
import { hasToday, todayFile } from '../../../../packages/typeset/tests/replay/tap.ts'

type Today = { unitHiding(o: Record<string, unknown>): { off: string[]; shown: Record<string, unknown>[] } }
const today = hasToday ? ((await import(todayFile('layer-proto/hide.mjs'))) as Today) : null

/** today's unitHiding on the same case: the layout file's rows (segs [page, x0, base, x1, top, bottom]), the resolutions */
function theirs(i: GroupsInput, has: (g: string) => boolean = () => true) {
  const id = i.ord
  const ph = new Map(
    i.els.map((e) => [
      e.k,
      {
        kind: e.display ? 'display' : 'math',
        flags: e.ink.length ? 0 : 16,
        segs: e.ink.flatMap((s) => [s[0], s[1], s[5], s[3], s[4], s[2]]),
      },
    ]),
  )
  const labels = (i.label?.ink ?? []).flatMap((s) => [0, s[0], s[1], s[5], s[3], s[4], s[2]])
  const prep = new Map(i.els.map((e) => [e.k, { k: e.k, mode: e.kept ? 'kept' : 'crop' }])) as Map<number, unknown> &
    Record<string, unknown>
  prep.keep = []
  prep.label = i.label ? { drawn: i.label.drawn ? 'Fig.' : undefined, chars: [] } : undefined
  const kOf = Array.from({ length: 32 }, (_, k) => k)
  const r = today!.unitHiding({
    page: i.page,
    id,
    lu: { ph, labels, erase: [] },
    kOf,
    lines: { rects: [], jOf: [] },
    prep,
    has,
  })
  const bit = (g: string) => (g === `u${id}` ? 1 : g === `u${id}.p` ? 2 : g === `u${id}.l` ? 4 : 0)
  return { off: r.off.reduce((a, g) => a | bit(g), 0), shown: r.shown }
}
const ink = (page: number, x0: number, x1: number, base = 100): number[] => [page, x0, base - 2, x1, base + 7, base]
const el = (k: number, o: Partial<GroupEl> = {}): GroupEl => ({
  k,
  display: false,
  ink: [ink(1, 10, 30)],
  kept: false,
  ...o,
})

const CASES: Record<string, GroupsInput> = {
  'a crop moved: elements off, nothing shown': { page: 1, ord: 5, els: [el(1)], label: null },
  'every element kept where it stands: elements on, each shown': {
    page: 1,
    ord: 5,
    els: [el(1, { kept: true }), el(3, { kept: true, ink: [ink(1, 40, 60), ink(2, 10, 20)] })],
    label: null,
  },
  'a display shown under its hover id, a kept piece beside a moved one': {
    page: 1,
    ord: 7,
    els: [el(1), el(2, { kept: true }), el(4, { display: true, ink: [ink(1, 50, 200, 80), ink(1, 60, 190, 70)] })],
    label: null,
  },
  'an element with ink on another page only, an empty one': {
    page: 2,
    ord: 5,
    els: [el(1), el(2, { ink: [] }), el(3, { ink: [ink(2, 5, 9)], kept: true })],
    label: null,
  },
  'a label drawn anew goes off; one left stays shown': {
    page: 1,
    ord: 9,
    els: [],
    label: { ink: [ink(1, 72, 90)], drawn: true },
  },
  'a label left in place': {
    page: 1,
    ord: 9,
    els: [el(1, { kept: true })],
    label: { ink: [ink(1, 72, 90)], drawn: false },
  },
  'a label on another page': { page: 2, ord: 9, els: [], label: { ink: [ink(1, 72, 90)], drawn: true } },
}

describe('D.groups', () => {
  for (const [name, c] of Object.entries(CASES))
    it.skipIf(!today)(`${name}, as today`, () => {
      const mine = groupsOff(c)
      expect(mine).toEqual(theirs(c))
    })
  it.skipIf(!today)('keeps a piece of a group the add-on could not part shown, and never turns that group off', () => {
    const c: GroupsInput = { page: 1, ord: 5, els: [el(1), el(2, { kept: true })], label: null, fixed: 2 }
    const t = theirs(c, (g) => g !== 'u5.p')
    expect(groupsOff(c).shown).toEqual(t.shown)
    // (today names the group in `off` all the same: the document holds no such group, so nothing goes off)
    expect(t.off & 2).toBe(2)
    expect(groupsOff(c).off).toBe(1)
  })
  it('shows the characters the reading leaves in place', () => {
    const got = groupsOff({ page: 1, ord: 1, els: [], label: null, chars: [{ box: [1, 2, 3, 4], base: 2.5 }] })
    expect(got).toEqual({ off: 1, shown: [{ kind: 'char', box: [1, 2, 3, 4], base: 2.5 }] })
  })
})
