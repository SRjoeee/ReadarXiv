// The page's composition (layPagePrepared: L8 layFlow, L9, L10, L11, E1) replayed against the baseline's reader dumps on three
// pairs: every page laid from its own part, each laid unit's size, leading, lines with their text and crops equal to the dump's,
// and each member on two pages laid alike from each page's part (risk 1 of the page decision); but one whose frames the port
// fills each at its own leading (pass.ts framed), and one on a page where today's held a paragraph's gap to the next one's
// leading (tap.ts flooredIn: the gap ruling of 2026-11-08). The corpus: lab/typeset/gate.mjs.
import { describe, expect, it } from 'vitest'
import { readerDump } from './display.ts'
import { framed, laysOf, trackedCells } from './pass.ts'
import { gatePair } from './gate.ts'
import { firstDifference, flooredIn, hasDerived, hasTap, roomUnderIn } from './tap.ts'
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
        // (a unit whose frames the port fills each at its own leading: pass.ts framed)
        const { lays } = laysOf(pair)
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
            return d && (gap.units.has(u.ord) || room.units.has(u.ord) || framed(lays.get(u.ord))) ? null : d
          })
          .filter((d) => d !== null)
        expect(differ).toEqual([])
        expect(want.filter((u) => !mine.has(u.ord))).toEqual([])
        expect(got.selfDiffer).toEqual([])
        expect(got.twoPages).toBeGreaterThan(0)
      })
  },
)
