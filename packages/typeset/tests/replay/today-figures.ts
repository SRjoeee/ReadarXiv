// S.figures' inputs as today's reader read them off its bundle (the sweep cache, today.ts's CACHE), for the replay: each page's
// figure units (each part's `figures` rows, figure-rows.mjs checkFigures: reader.mjs hiding.figures) and its view (the part's
// `views`), each unit's plain source and echo (the units chunks: rows.mjs unitFrom, sourceOf, plainSource), and each figure
// unit's row as the door gives it (rows.mjs echoRows over the pair's door rows, then unitOf).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { shown } from '../../src/breaker/text.ts'
import type { FigureRow, FigureUnit } from '../../src/shared/figures.ts'
import { doorRows } from './rows.ts'
import { CACHE } from './today.ts'

type Raw = unknown[]
/** a bundle unit's own pieces as today's door holds them (rows.mjs pieceFrom): its kind, text and placeholders */
type Src = { kind: string; pieces: { t: string; s?: string }[]; echo?: number }
export type TodayFigures = {
  /** a page's figure units, in their rows' order */
  figures(page: number): FigureRow[]
  /** a page's view box [x0, y0, x1, y1] */
  view(page: number): number[] | undefined
  /** a unit's plain source (mt.mjs plainSource) */
  src(id: number): string
  /** the depth under its baseline of the stroke under a figure unit's text as today's row states it, null where none: S.figures
   *  reads it no more (its width the fit's only test, the owner's rule of 2026-11-13); the replay names its departures by it */
  under(id: number, page: number): number | null
  /** a figure unit's set as today's row states it (its set's first unit's k), which today's paintFigures fitted by one factor:
   *  S.figures reads it no more (each text at its own size, the owner's ruling of 2026-11-13); the replay names its departures
   *  by it */
  set(id: number, page: number): string
  /** the pages that hold a figure unit */
  pages: number[]
}

const ANCHORS = ['start', 'centre', 'end'] as const
const figureGroupOf = (k: number) => `f${k}`
const papers = new Map<string, { t: TodayFigures; units: (Src | null)[] } | null>()

/** a paper's figure units and units, or null where the cache holds no catalog of it */
export function todayFigures(paper: string): TodayFigures | null {
  return load(paper)?.t ?? null
}
function load(paper: string) {
  if (papers.has(paper)) return papers.get(paper)!
  const cat = join(CACHE, 'papers', paper, 'catalog.json')
  if (!existsSync(cat)) {
    papers.set(paper, null)
    return null
  }
  const c = JSON.parse(readFileSync(cat, 'utf8')) as {
    bundle: string
    parts: { from: number; to: number; sha256: string }[]
    units: { from: number; sha256: string }[]
  }
  const byPage = new Map<number, FigureRow[]>(),
    views = new Map<number, number[]>(),
    unders = new Map<string, number>(),
    sets = new Map<string, string>()
  for (const ref of c.parts) {
    const p = JSON.parse(readFileSync(join(CACHE, 'objects', ref.sha256), 'utf8')) as {
      pages: [number, number]
      views: number[]
      figures?: Raw[] | null
    }
    for (let pg = p.pages[0]; pg <= p.pages[1]; pg++) {
      const o = 4 * (pg - p.pages[0])
      views.set(pg, p.views.slice(o, o + 4))
    }
    for (const r of p.figures ?? []) {
      // (figure-rows.mjs checkFigures' object of a row of FIGURE_ROW's 18 values, the bundle's 16)
      const [
        id,
        group,
        page,
        x,
        y,
        ux,
        uy,
        length,
        size,
        ascent,
        descent,
        anchor,
        fill,
        font,
        set,
        before,
        after,
        under,
      ] = r as [number, number, number, ...number[]]
      const row: FigureRow = {
        id,
        group: figureGroupOf(group),
        page,
        x: x!,
        y: y!,
        ux: ux!,
        uy: uy!,
        length: length!,
        size: size!,
        ascent: ascent!,
        descent: descent!,
        anchor: ANCHORS[anchor as number]!,
        fill: fill as number,
        font: font as unknown as string,
        before: before as number,
        after: after as number,
      }
      if (under !== -1 && under !== undefined) unders.set(`${id}|${page}`, under as number)
      sets.set(`${id}|${page}`, figureGroupOf(set as number))
      const list = byPage.get(page) ?? []
      byPage.set(page, list)
      list.push(row)
    }
  }
  // (the units chunks: each unit's kind, its pieces' text and placeholders, its echo; rows.mjs unitFrom and sourceOf)
  const units: (Src | null)[] = []
  for (const ref of c.units) {
    const ch = JSON.parse(readFileSync(join(CACHE, 'objects', ref.sha256), 'utf8')) as { units: Raw[] }
    ch.units.forEach((b, i) => {
      const at = ref.from + i
      if (!Array.isArray(b) || !(b.length === 6 || b.length === 7)) {
        units[at] = null
        return
      }
      const pieces = (b[5] as Raw[]).map((p) => {
        const q = p as [number, string]
        return q[0] === 0 ? { t: 'text', s: q[1] } : q[0] === 1 ? { t: 'ph', s: undefined } : { t: 'other' }
      })
      const u: Src = { kind: b[0] as string, pieces }
      if (b.length === 7 && b[6] !== null) u.echo = units[b[6] as number]?.echo ?? (b[6] as number)
      if (u.echo !== undefined && units[u.echo]?.kind === 'figure') delete u.echo
      units[at] = u
    })
  }
  const plain = (u: Src | null) =>
    (u?.pieces ?? [])
      .map((p) => (p.t === 'text' ? shown({ t: 'text', s: p.s! }) : ' '))
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
  const t: TodayFigures = {
    figures: (pg) => byPage.get(pg) ?? [],
    view: (pg) => views.get(pg),
    src: (id) => plain(units[id] ?? null),
    under: (id, pg) => unders.get(`${id}|${pg}`) ?? null,
    set: (id, pg) => sets.get(`${id}|${pg}`) ?? figureGroupOf(id),
    pages: [...byPage.keys()].sort((a, b) => a - b),
  }
  const out = { t, units }
  papers.set(paper, out)
  return out
}

/**
 * A pair's figure units' rows as the door gives them (reader.mjs take: each row and the rows of the ink units that echo its
 * unit, rows.mjs echoRows; then unitOf: its state, its pieces, a number the unit's own piece); undefined where none
 */
export function figureUnits(pair: string, paper: string): (id: number) => FigureUnit | undefined {
  const rows = doorRows(pair)
  const units = load(paper)?.units ?? []
  const got = new Map<number, FigureUnit>()
  const echoes = new Map<number, number[]>()
  units.forEach((u, i) => {
    if (u?.echo !== undefined) {
      const l = echoes.get(u.echo) ?? []
      echoes.set(u.echo, l)
      l.push(i)
    }
  })
  const all = [...(rows?.values() ?? [])]
  for (const r of [...all]) for (const id of echoes.get(r[0]) ?? []) all.push([id, ...r.slice(1)] as never)
  const STATES = new Set(['whole', 'partial', 'none', 'lost', 'kept'])
  for (const [id, pieces, state] of all) {
    const src = units[id]
    if (!src || !STATES.has(state)) continue
    if (state !== 'whole' && state !== 'partial') {
      got.set(id, { state })
      continue
    }
    if (!Array.isArray(pieces)) continue
    const out: NonNullable<FigureUnit['pieces']>[number][] = []
    let ok = true
    for (const p of pieces) {
      if (typeof p === 'string') out.push({ t: 'text', tr: true, s: p })
      else if (Number.isInteger(p) && p >= 0 && p < src.pieces.length)
        out.push(src.pieces[p] as { t: string; s?: string })
      else ok = false
    }
    if (ok) got.set(id, { state, pieces: out })
  }
  return (id) => got.get(id)
}
