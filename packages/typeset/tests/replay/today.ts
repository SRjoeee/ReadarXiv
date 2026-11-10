// What today's reader read off a paper's bundle that the tap does not record: the bundle the baseline's reader opened
// (baseline/tools/reader.mjs: the sweep cache's catalog and objects, release bundle 16, pipeline 76, layout 39), read here
// for two facts only. A page's rules (each part's `rules`, reader.mjs `hiding.rules`: the add-on manifest's x0, y0, x1, y1
// stride 4), which a CJK cell's bands between the rules over and under its lines read (U.params' cellBands; lane L1 states
// them as Room.band). A unit's first line in the file (the layout file's `lines`, tex.index.unit(id).lines: page, x0, x1,
// baseline, top, bottom, size, frame a line), which S.overFollower reads of the follower's (lane L1 states it as the
// follower's first Line). Skipped where the cache is absent, as the tap is.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const CACHE =
  process.env.AXT_SWEEP_CACHE ?? '/Users/cheongzhiyan/Developer/readarxiv-web-wt/sweep/sweep-data/cache'
export const hasCache = existsSync(join(CACHE, 'papers'))

export type TodayBundle = {
  /** a page's rules, or undefined where its part names none (today's rulesOf) */
  rules(page: number): number[] | undefined
  /** a unit's lines in the file, flat (page, x0, x1, baseline, top, bottom, size, frame a line), from the first part that
   *  holds it; undefined where none does */
  lines(id: number): number[] | undefined
}

/** a pair's paper with its version, as the cache names it (`2610.21377v1-zh`, `1512.03385v1-ja.pack`) */
export const paperOf = (pair: string): string => pair.replace(/-[a-z]{2,3}(\.pack)?$/, '')

type PartRef = { from: number; to: number; sha256: string }
const bundles = new Map<string, TodayBundle | null>()

/** a paper's bundle as today's reader read it, or null where the cache holds no catalog of it */
export function todayBundle(paper: string): TodayBundle | null {
  if (bundles.has(paper)) return bundles.get(paper)!
  const cat = join(CACHE, 'papers', paper, 'catalog.json')
  let out: TodayBundle | null = null
  if (existsSync(cat)) {
    const parts = (JSON.parse(readFileSync(cat, 'utf8')).parts ?? []) as PartRef[]
    const rules = new Map<number, number[]>(),
      lines = new Map<number, number[]>()
    for (const ref of [...parts].sort((a, b) => a.from - b.from)) {
      const f = join(CACHE, 'objects', ref.sha256)
      if (!existsSync(f)) continue
      const part = JSON.parse(readFileSync(f, 'utf8')) as {
        rules?: Record<string, number[]> | null
        layout?: { lines?: [number, number[]][] } | null
      }
      for (const [pg, r] of Object.entries(part.rules ?? {})) if (r?.length) rules.set(Number(pg), r)
      for (const [id, l] of part.layout?.lines ?? []) if (!lines.has(id)) lines.set(id, l)
    }
    out = { rules: (page) => rules.get(page), lines: (id) => lines.get(id) }
  }
  bundles.set(paper, out)
  return out
}
