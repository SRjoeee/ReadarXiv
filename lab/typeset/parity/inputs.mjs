// lab/typeset/parity/inputs.mjs: what the parity check needs of a pair, and why a pair cannot be drawn (render.mjs draws only
// the pairs whose inputs are all in lab-data; measure.mjs names the others on the sheet). Nothing is fetched or made here.
import { createHash } from 'node:crypto'
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

/**
 * The bundles a paper is laid over, as v2.mjs records them and render.mjs and measure.mjs check them: `head`, the SHA-256 of the
 * paper's head.json in the bundles folder `dir` (the head names the paper and every part and unit chunk by its own content
 * digest, so two folders' heads are one digest only where they hold the same bundle), and `dir`, the folder, to say which;
 * null where the folder holds no head of the paper
 */
export function bundleOf(paper, dir = L1_BUNDLES) {
  const f = join(dir, paper, 'head.json')
  return existsSync(f) ? { head: createHash('sha256').update(readFileSync(f)).digest('hex'), dir } : null
}
/**
 * Whether a v2 file (`v2`, v2.mjs's: its `bundle`) may be drawn or measured against the bundles `served` (bundleOf's): `{ ok: true }`
 * where it was laid over them; `{ ok: false, why }`, naming both, where over others (a page laid over one bundle and drawn
 * against another's composed document is unwrapped wherever the two differ: 2026-11-11, the toggles-on review drawing; a
 * re-measure over the default bundles read 63 pages worse); `{ ok: true, warning }` for a file of before this guard, which
 * names none
 */
export function bundleCheck(v2, served) {
  const pair = v2.pair ?? '?'
  if (!v2.bundle) return { ok: true, warning: `${pair}: its v2 file names no bundles (laid before the bundles guard): drawn against ${served?.dir ?? 'none'} unchecked` }
  if (served && v2.bundle.head === served.head) return { ok: true }
  return {
    ok: false,
    why: `${pair}: laid over the bundles of ${v2.bundle.dir} (head ${v2.bundle.head.slice(0, 12)}), served ${served ? `${served.dir} (head ${served.head.slice(0, 12)})` : 'none'}`,
  }
}

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

/**
 * Whether the reader puts page `members` (v2.mjs's Page of a page: each with its state and `off`, whether it hides the original's
 * ink) in place over arXiv's page: a member laid that hides something. The reader's own rule (packages/reader compose/composer.ts:
 * "a page that hides nothing is never put in place: arXiv's page stays"): a page of none, its members left the original's or laid
 * with nothing to hide (2608.06701v1 p12 under the default toggles: a page of references, the switch off, one member laid with no
 * line there), is drawn as arXiv's, no overlay to wait for
 */
export const putsInPlace = (members) => (members ?? []).some((m) => m.state === 'laid' && m.off)

