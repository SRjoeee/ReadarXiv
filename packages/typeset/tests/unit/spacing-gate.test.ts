// The reader gate's spacing lines (tests/replay/spacing-gate.ts, docs/PDF-READER.md §18.90) over a hand-made page: line (i)
// reads a float's members alone (the unit's own kind, `caption`); a note is the page fill's, read as a body member by line (ii)'s
// invariant (laid at or under its page's target and band), as a paragraph is (the coordinator's ruling of 2026-11-17: a run of
// sibling blocks in a column shares its page's rhythm). The members are the runner's: the page's own lay (layPagePrepared, read
// as layPage calls it) with its rule set. Parts made by hand, a Chinese target (its pitch 1.3 of the original's, its fill on):
// lines at 10 pt on a pitch of 12, a measure of 228 pt, a character half a size wide (45 a line).
import type { Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it, vi } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import type { layPagePrepared } from '../../src/lay/page.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Metrics, RuleParams, Rows } from '../../src/types.ts'
import { newSpacingGate, spacingGate } from '../replay/spacing-gate.ts'

type Prepared = ReturnType<typeof layPagePrepared>
/** each page the entry laid: its rule set and the page as layPagePrepared returned it (the members the runner reads) */
const seen = vi.hoisted(() => ({ calls: [] as { R: unknown; out: unknown }[] }))
vi.mock('../../src/lay/page.ts', async (importOriginal) => {
  const m = await importOriginal<typeof import('../../src/lay/page.ts')>()
  return {
    ...m,
    layPagePrepared: (...a: Parameters<typeof m.layPagePrepared>) => {
      const out = m.layPagePrepared(...a)
      seen.calls.push({ R: a[3], out })
      return out
    },
  }
})

const metrics: Metrics = {
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: (_f, size) => [0.7 * size, 0.2 * size, 0],
}
const line = (y: number): Placed['lines'][number] => [1, 0, 72, 300, y, y + 7, y - 2, 72, 300, 0, 10]
const CAPTION = 'b'.repeat(64),
  NOTE = 'c'.repeat(64)
/** a member of three lines from `top` at the original's pitch, 30 pt of room under its last line down to the next ink */
const member = (ord: number, kind: string, text: string, top: number): Placed => ({
  ord,
  kind,
  text,
  lead: 12,
  style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
  align: 'j',
  lines: [line(top), line(top - 12), line(top - 24)],
  room: { below: 0, next: 30, runs: [[2, 30, 200]], sep: 12 },
})
/** a page of a caption (700 down) and a note (400 down), each translated in two lines' text: shorter than its three */
const part: Part = {
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] }, lineskip: [1, 0] },
  flows: [[member(0, 'caption', CAPTION, 700)], [member(1, 'footnote', NOTE, 400)]],
}
const row = (id: string): Row => ({ id, ok: true, by: 'test', content: [{ t: 'text', s: '汉'.repeat(80) }] })
const rows: Rows = { get: (k) => (k === CAPTION ? row(CAPTION) : k === NOTE ? row(NOTE) : undefined), done: true }

/** the page laid by the entry, and the gate's lines over its members; `target` in place of the page fill's own where given */
function gate(target?: number) {
  seen.calls.length = 0
  layPage(part, rows, rulesFor('zh'), metrics)
  const { R, out } = seen.calls.at(-1) as { R: RuleParams; out: Prepared }
  const g = newSpacingGate()
  const own = (p: number) => out.passes.find((q) => q.page === p)?.target?.target ?? null
  spacingGate(1, out.members, R, g, target === undefined ? own : () => target)
  return { g, out }
}

describe('the reader gate’s spacing lines: (i) a float’s members alone, a note line (ii)’s as a body member (§18.90)', () => {
  it('reads the caption as a float’s member and the note as a body member', () => {
    expect(Object.fromEntries(gate().g.read)).toEqual({ float: 1, body: 1 })
  })
  it('on the page fill’s own target: no line fails', () => {
    const { g } = gate()
    expect([g.floatSpread, g.takenSpread, g.underFloor, g.stepped]).toEqual([[], [], [], []])
  })
  it('a note above its page’s target and band is line (ii)’s, never line (i)’s', () => {
    // (a target of 1.2, the band 0.05: the note's leading, its fit's 1.3 or the fill's over it, stands above 1.25)
    const { g, out } = gate(1.2)
    const note = out.members.find((m) => m.ord === 1)!
    expect(note.lay!.layout.state.lead).toBeGreaterThan(1.25)
    expect(g.takenSpread.map((x) => x.split(':')[0])).toEqual(['p1 ord 1 footnote'])
    expect(g.floatSpread).toEqual([])
  })
})
