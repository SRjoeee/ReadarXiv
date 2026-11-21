// D.links replayed against today's own placeUnit (links.mjs, engine 065c1d973) on the laid units of three pairs, at their final
// layouts: each piece drawn as text (a citation's rendering) or as a crop takes a link made over it (its text as PDF.js's
// overlaid text, its crop's rectangle), and both place it alike: every record (page, line, boxes, name) and every link left
// unplaced. The edges and bands are the same functions on both sides (D.display's runs, a run's start and width).
import { describe, expect, it } from 'vitest'
import { lineRuns } from '../../../../packages/typeset/src/emit/display.ts'
import { type Annot, placeUnit, type Target } from '../../../../packages/typeset/src/emit/links.ts'
import { tokenBand } from '../../../../packages/typeset/src/emit/sentences.ts'
import type { LaidLine, Layout } from '../../../../packages/typeset/src/fit/types.ts'
import { pieceCrops } from '../../../../packages/typeset/tests/replay/display.ts'
import { finalLays, PAIRS } from '../../../../packages/typeset/tests/replay/emit-lays.ts'
import { firstDifference, hasDerived, hasTap, hasToday, todayFile } from '../../../../packages/typeset/tests/replay/tap.ts'
import { hasCache } from '../../../../packages/typeset/tests/replay/today.ts'

type Today = { placeUnit(o: unknown): { records: unknown[]; tried: unknown[] } }
const today = hasToday ? ((await import(todayFile('layer-proto/links.mjs'))) as Today) : null
type Tok = { s?: string; ph?: unknown; k?: number; crop?: { k?: number; page: number; crop: number[] } }

describe.skipIf(!hasTap || !hasDerived('rules') || !hasCache || !today)(
  'D.links: placeUnit replayed against today’s',
  () => {
    it('places the links over each unit’s drawn pieces as today does', () => {
      const differ: string[] = []
      let units = 0,
        records = 0
      for (const pair of PAIRS) {
        const lays = finalLays(pair)
        pieceCrops(pair, lays)
        for (const [ord, p] of lays) {
          const L = p.layout as Layout
          const lines = L.lines.map((line) => ({ line, runs: lineRuns(line, L) }))
          // (a run's edge: its start, the share of its text before `at` across its items' slots: the same on both sides)
          const edge = (
            line: LaidLine,
            run: { xs?: number[]; text: string; items: [number, number][] },
            at: number,
          ) => {
            const [n] = run.items[0] ?? [0]
            const it = line.items[n!]!
            return (run.xs?.[0] ?? it.x!) + (at / Math.max(1, run.text.length)) * it.w
          }
          const band = (t: unknown, line: LaidLine) => tokenBand(t as never, L, line.baseline)
          const targets = new Map<number, Target>(),
            annots = new Map<number, Annot[]>()
          let i = 0
          for (const line of L.lines)
            for (const it of line.items) {
              const t = it.t as Tok
              if (t.crop && Number.isInteger(t.crop.k)) {
                const k = t.crop.k!
                if (!targets.has(k)) targets.set(k, { k, draw: 'crop' })
                const c = t.crop.crop
                const a: Annot = {
                  i: i++,
                  dest: `eq.${k}`,
                  rect: [c[0]! + 0.5, c[1]! + 0.5, c[2]! - 0.5, c[3]! - 0.5],
                  g2: { x: [], y: [], ch: [] },
                }
                annots.set(k, [...(annots.get(k) ?? []), a])
              } else if (t.ph !== undefined && typeof t.s === 'string' && t.k !== undefined) {
                if (!targets.has(t.k)) targets.set(t.k, { k: t.k, draw: 'text', single: true })
                const a: Annot = { i: i++, dest: `cite.${t.k}`, ov: t.s, g2: { x: [], y: [], ch: [...t.s] } }
                annots.set(t.k, [...(annots.get(t.k) ?? []), a])
              }
            }
          if (!targets.size) continue
          const q = L.lines[0]!.page
          const groups = [...targets].map(([k, to]) => ({
            to,
            annots: (annots.get(k) ?? []).map((a) => ({
              q:
                to.draw === 'crop'
                  ? (L.lines.flatMap((l) => l.items).find((x) => (x.t as Tok).crop?.k === k)!.t as Tok).crop!.page
                  : q,
              a,
              tier: 'geometry',
            })),
          }))
          units++
          const mine = placeUnit({ groups, lines, edge: edge as never, band, scale: L.scale })
          const theirs = today!.placeUnit({ groups, lines, edge, band, scale: L.scale })
          records += mine.records.length
          const d = firstDifference(mine, theirs, `${pair} ord ${ord}`)
          if (d) differ.push(d)
        }
      }
      expect(differ.slice(0, 5)).toEqual([])
      console.log(`D.links: ${units} units, ${records} records`)
      expect(units).toBeGreaterThan(50)
      expect(records).toBeGreaterThan(100)
    })
  },
)
