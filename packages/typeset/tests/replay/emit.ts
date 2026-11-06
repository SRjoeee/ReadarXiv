// D.text's segments, D.sentences' table and D.links' placement replayed on one pair against today's own functions
// (textlayer.mjs segsOfUnit, words.mjs addUnitWords, links.mjs placeUnit, engine 065c1d973) over every laid unit's every page at
// its final layout (emit-lays.ts): the corpus's run is lab/typeset/replay-emit.mjs; the tests hold three pairs.
import { lineRuns } from '../../src/emit/display.ts'
import { type Annot, placeUnit, type Target } from '../../src/emit/links.ts'
import { addUnitWords, newWords, tokenBand } from '../../src/emit/sentences.ts'
import { segsOfUnit } from '../../src/emit/text.ts'
import type { LaidLine, Layout } from '../../src/fit/types.ts'
import { pieceCrops } from './display.ts'
import { finalLays, unitPages } from './emit-lays.ts'
import { firstDifference, todayFile } from './tap.ts'

type W = Record<string, unknown> & { n: number }
type Today = {
  segsOfUnit(L: unknown, page: number): unknown[]
  newWords(): W
  addUnitWords(...a: unknown[]): void
  placeUnit(o: unknown): { records: unknown[]; tried: unknown[] }
}
let today: Today | null = null
const cols = (w: W) =>
  Object.fromEntries(
    ['l', 'r', 'y', 'h', 'top', 'bottom', 'word', 'at'].map((k) => [
      k,
      Array.from(w[k] as ArrayLike<number>).slice(0, w.n),
    ]),
  )
type Tok = { s?: string; ph?: unknown; k?: number; crop?: { k?: number; page: number; crop: number[] } }
export type EmitResult = {
  pages: number
  segs: number
  tokens: number
  linkUnits: number
  records: number
  differ: string[]
}

/** the three replays over one pair */
export async function emitReplay(pair: string): Promise<EmitResult> {
  today ??= {
    ...(await import(todayFile('layer-proto/textlayer.mjs'))),
    ...(await import(todayFile('layer-proto/words.mjs'))),
    ...(await import(todayFile('layer-proto/links.mjs'))),
  } as Today
  const out: EmitResult = { pages: 0, segs: 0, tokens: 0, linkUnits: 0, records: 0, differ: [] }
  const lays = finalLays(pair)
  pieceCrops(pair, lays)
  for (const [ord, p, pg] of unitPages(pair)) {
    out.pages++
    const mine = segsOfUnit(p.layout, pg)
    out.segs += mine.length
    const d1 = firstDifference(mine, today.segsOfUnit(p.layout, pg), `D.text ord ${ord} p${pg}`)
    if (d1) out.differ.push(d1)
    const tw = today.newWords(),
      mw = newWords()
    today.addUnitWords(tw, p.layout, pg, ord, null)
    addUnitWords(mw, p.layout, pg, ord, null)
    out.tokens += mw.n
    const d2 =
      firstDifference(cols(mw as unknown as W), cols(tw), `D.sentences ord ${ord} p${pg}`) ??
      firstDifference(mw.spans, tw.spans, `D.sentences ord ${ord} p${pg} spans`)
    if (d2) out.differ.push(d2)
  }
  for (const [ord, p] of lays) {
    const L = p.layout as Layout
    const lines = L.lines.map((line) => ({ line, runs: lineRuns(line, L) }))
    const edge = (line: LaidLine, run: { xs?: number[]; text: string; items: [number, number][] }, at: number) => {
      const [n] = run.items[0] ?? [0]
      const it = line.items[n!]!
      return (run.xs?.[0] ?? it.x!) + (at / Math.max(1, run.text.length)) * it.w
    }
    const band = (t: unknown, line: LaidLine) => tokenBand(t as never, L, line.baseline)
    const targets = new Map<number, Target>(),
      annots = new Map<number, { q: number; a: Annot; tier: string }[]>()
    let i = 0
    for (const line of L.lines)
      for (const it of line.items) {
        const t = it.t as Tok
        if (t.crop && Number.isInteger(t.crop.k)) {
          const k = t.crop.k!,
            c = t.crop.crop
          if (!targets.has(k)) targets.set(k, { k, draw: 'crop' })
          const a: Annot = {
            i: i++,
            dest: `eq.${k}`,
            rect: [c[0]! + 0.5, c[1]! + 0.5, c[2]! - 0.5, c[3]! - 0.5],
            g2: { x: [], y: [], ch: [] },
          }
          annots.set(k, [...(annots.get(k) ?? []), { q: t.crop.page, a, tier: 'geometry' }])
        } else if (t.ph !== undefined && typeof t.s === 'string' && t.k !== undefined) {
          if (!targets.has(t.k)) targets.set(t.k, { k: t.k, draw: 'text', single: true })
          const a: Annot = { i: i++, dest: `cite.${t.k}`, ov: t.s, g2: { x: [], y: [], ch: [...t.s] } }
          annots.set(t.k, [...(annots.get(t.k) ?? []), { q: line.page, a, tier: 'geometry' }])
        }
      }
    if (!targets.size) continue
    out.linkUnits++
    const groups = [...targets].map(([k, to]) => ({ to, annots: annots.get(k) ?? [] }))
    const mine = placeUnit({ groups, lines, edge: edge as never, band, scale: L.scale })
    out.records += mine.records.length
    const d = firstDifference(
      mine,
      today.placeUnit({ groups, lines, edge, band, scale: L.scale }),
      `D.links ord ${ord}`,
    )
    if (d) out.differ.push(d)
  }
  return out
}
