// lab/typeset/parity/inputs.mjs: what the parity check needs of a pair, and why a pair cannot be drawn (render.mjs draws only
// the pairs whose inputs are all in lab-data; measure.mjs names the others on the sheet). Nothing is fetched or made here.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { L1_BUNDLES } from '../../../packages/typeset/tests/replay/l1.ts'
import { doorRows } from '../../../packages/typeset/tests/replay/rows.ts'
import { LAB } from '../../../packages/typeset/tests/replay/tap.ts'
import { CACHE, paperOf } from '../../../packages/typeset/tests/replay/today.ts'

const PAPERS = join(LAB, 'refactor-2026-11', 'lanes', 'L1-papers87.tsv')
/** arXiv's PDF of each corpus paper, by its id with version */
export const pdfOf = new Map(
  (existsSync(PAPERS) ? readFileSync(PAPERS, 'utf8') : '')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('\t'))
    .map(([id, dir]) => [id, join(dir, 'arxiv.pdf')]),
)

/** the hyphenation patterns the reader is served (GET /hyph/<lang>.json, `{ patterns, exceptions }`): the release sweep's
 *  static files, else the baseline's copy */
export const HYPH = [join(CACHE, 'static/hyph'), join(LAB, 'refactor-2026-11', 'baseline', 'static', 'hyph')]
/** a language's served patterns file, or null where none is served */
export const hyphFileOf = (lang) => HYPH.map((d) => join(d, `${lang}.json`)).find((f) => existsSync(f)) ?? null

/** why a pair cannot be drawn from lab-data, or null: arXiv's PDF, today's server-made bundle, the door rows, the L1 bundle,
 *  and v2.mjs's pages (`work`, where v2.mjs wrote them) */
export function whyNot(pair, work) {
  const paper = paperOf(pair)
  if (!pdfOf.has(paper)) return 'not in the corpus (lanes/L1-papers87.tsv): no compile, bundle or rows in lab-data'
  if (!existsSync(join(CACHE, 'papers', paper, 'catalog.json'))) return "no server-made bundle of this release (the sweep cache's catalog)"
  if (!doorRows(pair)) return 'no door rows of the pair'
  if (!existsSync(join(L1_BUNDLES, paper, 'head.json'))) return 'no L1 bundle'
  if (work && !existsSync(join(work, 'v2', `${pair}.json`))) return 'v2.mjs has not laid it'
  return null
}
