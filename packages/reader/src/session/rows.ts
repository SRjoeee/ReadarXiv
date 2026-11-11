// The rows made here, as today's run makes them (R session/run.ts §6, `rank`, `contextOf`; docs/PDF-READER.md §11.10): the paper's
// own names first (§19.14), then the units nearest the page in view (the units that page and the next wait on), then ahead before
// behind, a unit behind the reading place counted twice as far; the paper's title and abstract as an LLM's context; a retry
// asking for the units with no row alone (those translated are held). Pure: the reader gives it the units, the rows held and the
// reading place.
import type { Row, Unit } from '@readarxiv/format'
import { kindShown } from '../compose/classes.ts'
import { committed, type Page } from '../compose/page.ts'
import type { Prefs } from '../prefs.ts'
import { plainOf } from './contents.ts'
import { againOf, type RowsStop, type State } from './machine.ts'

/** the paper's context, as a translator whose replies depend on it reads it (packages/translate's PaperContext) */
export interface PaperContext {
  title?: string
  abstract?: string
}
/** where the abstract is cut: it travels with every batch, and a long one is wasted tokens (R core/extractor/context.ts) */
export const ABSTRACT_MAX_CHARS = 1200

/** the paper's title (as the reader knows it) and abstract (its units of kind `abstract`, joined, cut at a word) for an LLM */
export function contextOf(units: readonly Unit[], title: string): PaperContext {
  const a = units
    .filter((u) => u.kind === 'abstract')
    .map((u) => plainOf(u.content))
    .filter(Boolean)
    .join(' ')
  const clip = (s: string) =>
    s.length <= ABSTRACT_MAX_CHARS ? s : `${s.slice(0, ABSTRACT_MAX_CHARS).replace(/\s+\S*$/, '')}...`
  return { ...(title ? { title } : {}), ...(a ? { abstract: clip(a) } : {}) }
}

/**
 * The units in the order they are asked for (R run.ts `rank`): the paper's own names (units of kind `name`, which no page waits
 * on and every theorem head of their name reads: today's namesFirst, rows.mjs, PDF-READER §19.14) first, so that the first
 * batch carries them; then those `near` names (the units the page in view and the next wait on), in their own order; then by
 * their distance from the reading place (`anchor`, an index into `units`: the first near unit's, else the page's share of the
 * paper), ahead before behind, a unit behind counted twice as far
 */
export function ranked<U extends { id: string; kind?: string }>(
  units: readonly U[],
  near: ReadonlySet<string>,
  anchor: number,
): U[] {
  const rank = (i: number, u: U) => {
    if (u.kind === 'name') return -1
    if (near.has(u.id)) return 0
    const d = i - anchor
    return d >= 0 ? 1 + d : 1 - 2 * d
  }
  return units
    .map((u, i) => [rank(i, u), i, u] as const)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .map((x) => x[2])
}
/** the reading place as an index into `units`: the first unit near names, else page `page`'s share of `pages` */
export function anchorOf(
  units: readonly { id: string }[],
  near: ReadonlySet<string>,
  page: number,
  pages: number,
): number {
  let at = -1
  if (near.size) at = units.findIndex((u) => near.has(u.id))
  return at >= 0 ? at : Math.floor(((Math.max(1, page) - 1) / Math.max(1, pages)) * units.length)
}

/** the units still to ask for: those with no row, or a row that is not a translation (a retry asks again for the rest only) */
export const missingOf = <U extends { id: string }>(units: readonly U[], held: ReadonlyMap<string, Row>): U[] =>
  units.filter((u) => !held.get(u.id)?.ok)

/** a row taken into those held: a translation is never replaced by a failure (a near call's and the first call's of one unit) */
export function keep(held: Map<string, Row>, r: Row): boolean {
  const had = held.get(r.id)
  if (had?.ok && !r.ok) return false
  held.set(r.id, r)
  return true
}
/** why the units held with no translation got none (the run stopped short): the service's word, the most telling of them
 *  (unconfigured, then unavailable, then refused; an abort is no word), null where none was lost */
export function stopOf(units: readonly { id: string }[], held: ReadonlyMap<string, Row>): RowsStop | null {
  const RANK = { unconfigured: 3, unavailable: 2, refused: 1, aborted: 0 } as const
  let best: RowsStop | null = null
  for (const u of units) {
    const r = held.get(u.id)
    if (!r || r.ok || r.why.kind === 'aborted') continue
    if (!best || RANK[r.why.kind] > RANK[best.kind]) best = r.why
  }
  return best
}
/** whether a page asked near the view is shown as arXiv's by the rule, settled and never laid (PDF-READER §11.8, the `layer`
 *  events' `original`): no part lays a line on it (the head names none), or it was laid with nothing of its own */
export function shownAsOriginal(part: string | null | undefined, page: Page | null): boolean {
  if (part === null) return true
  return !!page && committed(page) && !page.members.some((m) => m.state === 'laid')
}
/** the run the view's rows come from, as the session states it: `run`, one that may bring rows is under way (the host's
 *  translate; our server's run of the target running or to start, as the document read for it says; or one that failed and is
 *  asked again now, its open under way or due at once: `asking`); `failed`, it ended failed and nothing asks it again now (a
 *  unit shown with no translation then is a passage that failed, whether a row says so or none came). A failure the session
 *  asks again at once is no failure to tell: the reader waits for the run it asks (PDF-READER §8.1) */
export function runOf(s: State): { run: boolean; failed: boolean; asking: boolean } {
  const r = s.rows
  const tg = s.docFor === r.target ? s.doc?.targets[r.target] : null
  const asking = r.s === 'failed' && againOf(s).rows === 'now'
  return {
    run:
      asking ||
      (r.s === 'arriving' && (s.here || (tg !== null && (!tg || tg.state === 'running' || tg.state === 'none')))),
    failed: r.s === 'failed' && !asking,
    asking,
  }
}
/** what the view shown has of the translation, and whether it waits for more (PDF-READER §6.6, §8) */
export interface ViewRows {
  /** some unit of the layer shown has no translation held while a run that may bring it is under way */
  waits: boolean
  /** the units of the layer shown translated under the toggles (`total`), those of them with a translation held (`got`) and those
   *  that failed (`lost`: a row that is none, or, the run ended failed, no translation at all): one statement over one set, so
   *  got + lost <= total, and got never falls while the layer shown and the toggles stay (rows held are only added to, a
   *  translation never replaced by a failure: `keep`) */
  got: number
  total: number
  lost: number
}
/**
 * The translation as the view shown waits for it: the units of the layer it shows that the paper does not keep and the toggles
 * show translated (`kindShown`: a toggle shows or hides what was made, so its units count where it shows them), counted by the
 * rows held for them. It waits while one of them has no translation and a run that may bring it is under way (`run`: our
 * server's target running or to start, the host's translate); the layer's units not read yet, it waits while nothing of the
 * translation is laid (a first open's run: the units come with the head). Rows read of a run done (a stored translation),
 * and a run that restates rows the view holds or works on units of a layer it does not show yet, leave it waiting for none
 */
export function viewOf(o: {
  /** the units of the layer shown, once read; null before, or no layer shown */
  units: readonly { id: string; kind: string; kept?: boolean }[] | null
  classes: Prefs['classes'] | null
  held: ReadonlyMap<string, Row>
  /** a layer is shown (the session's ready) */
  shown: boolean
  /** a page of the layer laid */
  laid: boolean
  /** a run that may bring rows is under way */
  run: boolean
  /** the run ended failed (runOf) */
  failed?: boolean
}): ViewRows {
  if (!o.shown) return { waits: false, got: 0, total: 0, lost: 0 }
  if (!o.units) return { waits: o.run && !o.laid, got: 0, total: 0, lost: 0 }
  let got = 0,
    lost = 0,
    total = 0
  for (const u of o.units) {
    if (u.kept || !kindShown(u.kind, o.classes)) continue
    total++
    const r = o.held.get(u.id)
    if (r?.ok) got++
    else if (r || o.failed) lost++
  }
  return { waits: o.run && got < total, got, total, lost }
}
