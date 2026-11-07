// The translations the baseline's reader laid (baseline/tools/reader.mjs rowsOf): a pair's door rows, by today's unit ord. A
// staging pair's are the release's stored rows (the sweep cache's `papers/<paper>-<target>/open.json` manifest, its row
// objects in order, a later row of an id replacing an earlier); a pack pair's the gate pack's carried rows
// (baseline/pack-rows/<paper>-<target>.rows.json). A door row is today's: [ord, pieces (a string a translated text, a number
// k the source's own piece k), state ('whole' | 'partial' | 'kept' | 'none' | …), by, sentences, …].
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LAB } from './tap.ts'
import { CACHE, paperOf } from './today.ts'

export type DoorRow = [ord: number, pieces: (string | number)[], state: string, by: string, ...more: unknown[]]

const cache = new Map<string, Map<number, DoorRow> | null>()

/** a pair's door rows by ord, or null where neither the cache nor the pack holds them */
export function doorRows(pair: string): Map<number, DoorRow> | null {
  if (cache.has(pair)) return cache.get(pair)!
  let out: Map<number, DoorRow> | null = null
  const paper = paperOf(pair)
  const target = /-([a-z]{2,3})(\.pack)?$/.exec(pair)?.[1]
  if (pair.endsWith('.pack')) {
    const f = join(LAB, 'refactor-2026-11', 'baseline', 'pack-rows', `${paper}-${target}.rows.json`)
    if (existsSync(f)) out = new Map((JSON.parse(readFileSync(f, 'utf8')).rows as DoorRow[]).map((r) => [r[0], r]))
  } else {
    const o = join(CACHE, 'papers', `${paper}-${target}`, 'open.json')
    if (existsSync(o)) {
      out = new Map()
      const refs = (JSON.parse(readFileSync(o, 'utf8')).body?.manifest?.rows ?? []) as { sha256: string }[]
      for (const ref of refs) {
        const v = JSON.parse(readFileSync(join(CACHE, 'objects', ref.sha256), 'utf8')) as { rows: DoorRow[] }
        for (const r of v.rows) out.set(r[0], r)
      }
    }
  }
  cache.set(pair, out)
  return out
}
