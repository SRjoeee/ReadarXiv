// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { type LedgerGlyph, ledgerOf, RULES, type RuledLine, type TodayUnit } from '../../packages/engine/src/locate/ledger.ts'
import { ledgerOf as ledgerOfBefore, RULES as RULES_BEFORE } from './helpers/ledger-before.ts'

// The ledger (packages/engine/src/locate/ledger.ts) finds its depth rule, the last `figures` rule of RULES, by ES2022's filter and
// at, where it read RULES.findLast (ES2023's, which the engine's entries are not checked under: tests/pdf-reader/engine-types.test.ts
// compiles them with the ES2022 library). Held here to the ledger before the change (helpers/ledger-before.ts, 18e55a09b verbatim
// but its imports), line for line: the float lines it states and counts, on pages of floats counted and uncounted, a caption's and
// a table's, nested, and a form's line, the other `figures` rule's, beside them.

type Line = { s: string; x?: number; y: number; size?: number; font?: string; form?: boolean }
/** a page of lines of glyphs (a glyph half its size wide), its marks' points by glyph */
function pageOf(lines: Line[], points: [string, number][]) {
  const glyphs: LedgerGlyph[] = []
  for (const l of lines) {
    const size = l.size ?? 10
    let x = l.x ?? 72
    for (const u of l.s) {
      glyphs.push({ u, x0: x, x1: x + 0.5 * size, y: l.y, size, top: l.y + 0.7 * size, bottom: l.y - 0.2 * size, font: l.font ?? 'ABCDEF+CMR10', ...(l.form ? { form: true } : {}), ...(u === ' ' ? { blank: true } : {}) })
      x += 0.5 * size
    }
  }
  return { glyphs, boxes: [], points: points.map(([name, glyph]) => ({ name, glyph, box: 0 })), regions: [], paras: [], view: [0, 0, 612, 792] as const }
}

describe("the ledger's depth rule: the last `figures` rule, as RULES.findLast read it", () => {
  it('is the rule that reads a float line by its depth, the same rule as before', () => {
    expect(RULES.filter((r) => r.cls === 'figures').at(-1)?.test({ depth: 1 } as RuledLine)).toBe(true)
    expect(RULES.map((r) => r.cls)).toEqual(RULES_BEFORE.map((r) => r.cls))
  })

  it('states and counts the same float lines as before, a form line beside them no float line', () => {
    const a = 'A line of the float that no unit owns'
    const b = 'Another line of text inside it here'
    const pages = [
      // (a body; a float holding a caption's start and two lines; a form's line in the body, the other `figures` rule)
      pageOf(
        [
          { s: 'Body text of the page', y: 700 },
          { s: a, y: 650 },
          { s: b, y: 638 },
          { s: 'Accuracy of the model', y: 600, form: true },
        ],
        [['bs1', 0], ['fs1', 21], ['0s', 21], ['0e', 21 + a.length], ['fe1', 21 + a.length + b.length], ['be1', 200]],
      ),
      // (a float of no counter (fn2) around a counted one holding a cell's start, nested; a line in each)
      pageOf(
        [
          { s: 'Notice text inside the uncounted float', y: 700 },
          { s: 'Row label text no cell owns here', y: 650 },
          { s: 'Closing body text of the page', y: 500 },
        ],
        [['bs1', 0], ['fs2', 0], ['fn2', 0], ['fs3', 38], ['1s', 38], ['1e', 40], ['fe3', 70], ['fe2', 70], ['be1', 200]],
      ),
    ]
    const units: TodayUnit[] = [
      { kind: 'caption', pieces: [] },
      { kind: 'cell', pieces: [] },
    ]
    const floats = ['table', null]
    const own = { glyphs: pages.map((pg) => pg.glyphs.map((): string | null => null)) }
    const now = ledgerOf(pages, own, { units, floats })
    expect(now).toEqual(ledgerOfBefore(pages, own, { units, floats }))
    expect(now.floatCount.lines).toBeGreaterThanOrEqual(3)
    expect(now.floatLines.map((l) => l.why).sort()).toEqual(['cells', 'nocells', 'nocells'])
    expect(now.lines.some((l) => l.cls === 'figures' && !now.floatLines.some((f) => f.page === l.page && f.y === l.y))).toBe(true)
  })
})
