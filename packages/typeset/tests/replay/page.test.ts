// The page's composition (layPagePrepared: L8 layFlow, L9, L10, L11, E1) replayed against the baseline's reader dumps on three
// pairs: every page laid from its own part, each laid unit's size, leading, lines with their text and crops equal to the dump's,
// and each member on two pages laid alike from each page's part (risk 1 of the page decision); but one whose frames the port
// fills each at its own leading or holds TeX's share (pass.ts framed), one on a page where today's held a paragraph's gap to the
// next one's leading (tap.ts flooredIn: the gap ruling of 2026-11-08), and one on a page of a unit whose fill leadings option (i)
// moves (pass.ts laysOf `lead`: the owner's of 2026-11-10). The corpus: lab/typeset/gate.mjs.
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type MeasureTable, MissingMeasure, tableMetrics } from '../../src/metrics/table.ts'
import type { Metrics } from '../../src/types.ts'
import { readerDump } from './display.ts'
import { framed, laysOf, trackedCells } from './pass.ts'
import { gatePair } from './gate.ts'
import { firstDifference, flooredIn, hasDerived, hasTap, readGz, roomUnderIn, TAP } from './tap.ts'
import { hasCache } from './today.ts'

const PAIRS = ['2610.21377v1-zh', '1512.03385v1-ja.pack', '1706.03762v7-de.pack']

describe.skipIf(!hasTap || !hasDerived('rules') || !hasCache)(
  'layPagePrepared: replayed against the reader dumps',
  () => {
    for (const pair of PAIRS)
      it(`lays every page of ${pair} as today drew it`, { timeout: 120_000 }, () => {
        const got = gatePair(pair)
        // (a unit on a page whose fill today held a paragraph's gap to the next one's leading: tap.ts flooredIn)
        const gap = flooredIn(pair)
        // (a unit on a page of one a run of which the room ruling lays otherwise: tap.ts roomUnderIn)
        const room = roomUnderIn(pair)
        // (a unit whose frames the port fills each at its own leading or hold TeX's share: pass.ts framed; a unit on a page of
        // one whose fill leadings option (i) moves: pass.ts laysOf `lead`)
        const { lays, lead } = laysOf(pair)
        // (a cell today's fill letter-spaced, untracked by the ruling of 2026-11-08: its size and its lines' text today's)
        const untracked = trackedCells(pair)
        const want = readerDump(pair).units
        const mine = new Map(got.units.map((u) => [u.ord, u]))
        const differ = want
          .map((u) => {
            const m = mine.get(u.ord)
            const d = !m
              ? `ord ${u.ord}: not laid`
              : untracked.has(u.ord)
                ? firstDifference(
                    { size: m.size, texts: m.lines.map((l) => l.text) },
                    { size: u.size, texts: u.lines.map((l) => l.text) },
                    `ord ${u.ord}`,
                  )
                : firstDifference(
                    { size: m.size, leading: m.leading, lines: m.lines, elements: m.elements ?? [] },
                    { size: u.size, leading: u.leading, lines: u.lines, elements: u.elements ?? [] },
                    `ord ${u.ord}`,
                  )
            return d &&
              (gap.units.has(u.ord) || room.units.has(u.ord) || lead.units.has(u.ord) || framed(lays.get(u.ord)))
              ? null
              : d
          })
          .filter((d) => d !== null)
        expect(differ).toEqual([])
        expect(want.filter((u) => !mine.has(u.ord))).toEqual([])
        expect(got.selfDiffer).toEqual([])
        expect(got.twoPages).toBeGreaterThan(0)
      })
  },
)

// The runner measures with the Metrics it is given (lab/typeset/gate.mjs: the tap's table, then the reader's served faces, as
// gate-l1.mjs). 2608.25210v2-zh's ord 425: the port's breaker cuts "Comput-" where today's walk never cut (round 8 B5's
// literal-fixes), so the tap's table, today's measures alone, holds no width of it and the unit is left unfit; given a
// measurer of what the table lacks, it is laid.
describe.skipIf(!hasTap || !hasDerived('rules') || !hasCache)('the runner: the Metrics its lays measure with', () => {
  const PAIR = '2608.25210v2-zh'
  const ORD = 425
  // (the test's own measurer of a text the table lacks: half an em a character, an ink 0.7 em over and 0.2 under)
  const halfEm = (size: number, text: string) => (size * [...text].length) / 2
  const lacking =
    <A extends unknown[], R>(f: (...a: A) => R, g: (...a: A) => R) =>
    (...a: A): R => {
      try {
        return f(...a)
      } catch (e) {
        if (!(e instanceof MissingMeasure)) throw e
        return g(...a)
      }
    }

  it(`leaves ${PAIR} ord ${ORD} unfit on the tap's table alone, and lays it on a Metrics that measures what the table lacks`, {
    timeout: 180_000,
  }, () => {
    // (the tap's table read here, not in the describe's body: vitest runs the body to collect even a skipped suite, and a
    // machine without the lab's data has no table to read)
    const table = tableMetrics(readGz(join(TAP, 'metrics', `${PAIR}.metrics.json.gz`)) as MeasureTable)
    const layered: Metrics = {
      ready: table.ready,
      advance: lacking(table.advance, (_f, size, text) => halfEm(size, text)),
      ink: lacking(
        table.ink,
        (_f, size, text) => [size * 0.7, size * 0.2, halfEm(size, text)] as [number, number, number],
      ),
    }
    expect(gatePair(PAIR).units.some((u) => u.ord === ORD)).toBe(false)
    expect(gatePair(PAIR, { metricsOf: () => layered }).units.some((u) => u.ord === ORD)).toBe(true)
  })
})
