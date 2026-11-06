// Lane L1's bundles of the corpus, as the converge lane's last run made them with the code of this tree (readarxiv-lab-data
// refactor-2026-11/lanes/L7/prepare/bundles/<paper>/, lanes/L7-converge.md; lane L1's own runs: lanes/L1-out9):
// a paper's head (`head.json`), its parts by page (`<digest>.part`: design-a's Part, flows of Placed members) and its Units
// objects (`<digest>.units`). Read as JSON, every field as the bundle holds it (packages/format's schema on L1's branch:
// `read` names the facts carried as read on A). Lab-data only: the bundles hold licensed papers' text.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Part, Placed, Unit } from '@readarxiv/format'
import { LAB } from './tap.ts'

export const L1_BUNDLES =
  process.env.AXT_L1_BUNDLES ?? join(LAB, 'refactor-2026-11', 'lanes', 'L7', 'prepare', 'bundles')
export const hasL1 = existsSync(L1_BUNDLES)

/** a member as L1's part holds it: Placed and the fields L1's later schema adds */
export type L1Placed = Placed & { read?: string[] }
export type L1Paper = {
  paper: string
  pages: number
  /** each page's part, or undefined where the page has none (it is A) */
  parts: Map<number, Part & { flows: L1Placed[][] }>
  /** each unit by its id */
  units: Map<string, Unit>
}

const papers = new Map<string, L1Paper | null>()
/** a paper's L1 bundle, or null where the run made none */
export function l1Paper(paper: string): L1Paper | null {
  if (papers.has(paper)) return papers.get(paper)!
  const dir = join(L1_BUNDLES, paper)
  let out: L1Paper | null = null
  if (existsSync(join(dir, 'head.json'))) {
    const head = JSON.parse(readFileSync(join(dir, 'head.json'), 'utf8')) as {
      paper: { pages: number }
      parts: (string | null)[]
      units: string[]
    }
    const parts = new Map<number, L1Paper['parts'] extends Map<number, infer P> ? P : never>()
    head.parts.forEach((d, i) => {
      if (d) parts.set(i + 1, JSON.parse(readFileSync(join(dir, `${d}.part`), 'utf8')))
    })
    const units = new Map<string, Unit>()
    for (const d of head.units)
      for (const u of (JSON.parse(readFileSync(join(dir, `${d}.units`), 'utf8')) as { units: Unit[] }).units)
        units.set(u.id, u)
    out = { paper, pages: head.paper.pages, parts, units }
  }
  papers.set(paper, out)
  return out
}
