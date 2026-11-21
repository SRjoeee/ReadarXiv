// The reader gate's spacing lines (tests/replay/spacing-gate.ts, docs/PDF-READER.md §18.90) over a hand-made page: line (i)
// reads a float's members alone (the unit's own kind, `caption`); a note is the page fill's, read as a body member by line (ii)'s
// invariant (laid at or under its page's target and band), as a paragraph is (the coordinator's ruling of 2026-11-17: a run of
// sibling blocks in a column shares its page's rhythm). The members are the runner's: the page's own lay (layPagePrepared, read
// as layPage calls it) with its rule set. Parts made by hand, a Chinese target (its pitch 1.3 of the original's, its fill on):
// lines at 10 pt on a pitch of 12, a measure of 228 pt, a character half a size wide (45 a line). Then each line over a member
// of two runs (a display splitting it, laid a run at a time: fit/runs.ts), made of a laid member, its second run failing each
// line in turn: the gate reads every run (PR #649's review), each named in its line.
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
/** 80 characters of Chinese text (U+6C49), two lines of 45 at the original's size */
const row = (id: string): Row => ({
  id,
  ok: true,
  by: 'test',
  content: [{ t: 'text', s: String.fromCodePoint(0x6c49).repeat(80) }],
})
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

type Member = Prepared['members'][number]
type Lay = NonNullable<Member['lay']>
/**
 * Member `m` as a unit its display splits into two runs, laid a run at a time and joined (fit/runs.ts joinRuns): its lines
 * twice, the first time its own run's (its own state and size, `seg`), the second a run laid at `second` (its leading or its
 * size over the first's), each run its lay's own (FillLaid.runs: the same state, its fill leading). No evening and no tie
 * stated: a step of the second run's size has no cause
 */
function twoRuns(m: Member, second: { lead?: number; scale?: number; fillLead?: number | null }): Member {
  const u = m.lay!,
    L = u.layout
  const st2 = { ...L.state, ...(second.lead === undefined ? {} : { lead: second.lead, leads: undefined }) }
  const scale2 = second.scale ?? L.scale
  const seg1 = { f: L.f, scale: L.scale, state: L.state },
    seg2 = { f: L.f, scale: scale2, state: st2 }
  const runs: Lay[] = [
    { ...u, run: 0, layout: { ...L } },
    {
      ...u,
      run: 1,
      layout: { ...L, state: st2, scale: scale2 },
      fillLead: 'fillLead' in second ? second.fillLead : u.fillLead,
    },
  ]
  const lines = [...L.lines.map((l) => ({ ...l, seg: seg1 })), ...L.lines.map((l) => ({ ...l, seg: seg2 }))]
  return { ...m, evened: undefined, tie: undefined, lay: { ...u, layout: { ...L, lines }, runs } }
}

describe('the reader gate’s spacing lines read every run of a member a display splits (PR #649’s review, §18.90)', () => {
  /** the page laid on its own target, the member of ord `ord` made two runs (twoRuns), the gate over it alone */
  function split(ord: number, second: Parameters<typeof twoRuns>[1]) {
    const { out } = gate()
    const { R } = seen.calls.at(-1) as { R: RuleParams }
    const own = (p: number) => out.passes.find((q) => q.page === p)?.target?.target ?? null
    const m = out.members.find((x) => x.ord === ord)!
    const g = newSpacingGate()
    const told: string[] = []
    spacingGate(
      1,
      [twoRuns(m, second)],
      R,
      g,
      own,
      () => '',
      (x) => told.push(x),
    )
    const lines = { i: g.floatSpread, ii: g.takenSpread, unfilled: g.unfilled, iii: g.underFloor, iv: g.stepped }
    return { g, R, lines, told, target: own(1)!, m }
  }
  /** every line but `fails` empty; `fails` names the member once and its second run alone */
  const onlyRun2 = (lines: Record<string, string[]>, fails: string, at: string) => {
    for (const [k, v] of Object.entries(lines)) {
      if (k !== fails) expect(v, k).toEqual([])
      else {
        expect(v).toHaveLength(1)
        expect(v[0]!.startsWith(`${at}: run 2 of 2: `)).toBe(true)
        expect(v[0]).not.toContain('run 1 of 2')
      }
    }
  }
  it('reads both runs, each once, and records each with its run', () => {
    const { g, told, m } = split(1, {})
    expect(m.lay!.layout.scale).toBe(1)
    expect(Object.fromEntries(g.runs)).toEqual({ 'body footnote': 1 })
    expect(g.runsRead).toBe(2)
    expect(g.unmatched).toEqual([])
    expect(told.map((x) => x.split('\t').at(-1))).toEqual(['1/2', '2/2'])
    expect([g.floatSpread, g.takenSpread, g.unfilled, g.underFloor, g.stepped]).toEqual([[], [], [], [], []])
  })
  it('(i): a caption whose second run stands above its rule-1 pitch', () => {
    const { lines } = split(0, { lead: 1.45 })
    onlyRun2(lines, 'i', 'p1 ord 0 caption')
  })
  it('(ii): a note whose second run the fill lays above its page’s target and band', () => {
    const { target } = split(1, {})
    const { lines } = split(1, { lead: target + 0.2, fillLead: target + 0.2 })
    onlyRun2(lines, 'ii', 'p1 ord 1 footnote')
  })
  it('(ii), beside: a note whose second run the fill lays not (its fill leading null) is counted beside, not failed', () => {
    const { target } = split(1, {})
    const { lines } = split(1, { lead: target + 0.2, fillLead: null })
    onlyRun2(lines, 'unfilled', 'p1 ord 1 footnote')
  })
  it('(iii): a note whose second run stands under its script’s floor', () => {
    const { R } = split(1, {})
    const floor = Number((R as unknown as { leadFloor: number }).leadFloor)
    const { lines } = split(1, { lead: floor - 0.1 })
    onlyRun2(lines, 'iii', 'p1 ord 1 footnote')
  })
  it('(iv): a note whose second run is a step smaller though it sets whole at its size, no cause stated', () => {
    const { lines } = split(1, { scale: 0.9 })
    onlyRun2(lines, 'iv', 'p1 ord 1 footnote')
    expect(lines.iv[0]).toMatch(/run 2 of 2: .*scale 0\.9.*sets whole at 1 \(knob /)
  })
})
