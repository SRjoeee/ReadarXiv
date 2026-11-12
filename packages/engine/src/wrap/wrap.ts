// wrap(bytesA, located, pagesA): arXiv's own runs wrapped in optional content, as an incremental update over arXiv's exact
// bytes (design §4.1 "the add-on, exactly"; spike S1c's wrapA.mjs). Today's wrapOf and planOf as they are (wrap.mjs), each page
// planned from the groups locate carried onto A: `<ord>.<page>.t` a member's text, `.e` its travelling elements, `.l` its
// label (design §4.5). wrapOf refuses what it cannot prove (an encrypted file, a page past its bounds, a form partly owned, a
// split it cannot make, …): a page it refuses keeps every unit on it the original's. Its own proofs run inside it (each page's
// new stream lexed again and its operators, ours taken out, A's; the section read back over A's bytes; the document's object
// graph A's but for the catalog's optional content, the pages' contents and properties). The add-on is the section alone.
import type { AlignFacts, PdfLib } from '../remove.types.ts'
import { planOf, type Wrap, type WrapPage, type WrapPlan, wrapOf } from '../wrap.types.ts'
import type { Located } from '../locate/locate.ts'
import type { ReadPage } from '../read.ts'

export interface AddOn {
  /** the incremental update over A's bytes (A followed by it is the composed document) */
  bytes: Uint8Array
  /** each page wrapOf was asked to wrap: ok, or why not; merged where its elements' and labels' groups folded into the text's */
  pages: Map<number, WrapPage>
  /** every group the document holds, by name (`<ord>.<page>.<t|e|l>`), and each one's object number */
  groups: Set<string>
  ocgs: Map<string, number>
  /** the groups that owned an image the wrap could not tell apart (planOf's `lost`: the page's images painted are not as many
   *  as PDF.js's reading of them), none of which is wrapped: their members stay the original's (today's wrapFinal, `unhidden`) */
  lost: Set<string>
  stats: Wrap['stats']
}

export interface WrapDeps {
  PL: PdfLib
  deflate: (b: Uint8Array) => Uint8Array
  inflate: (b: Uint8Array, limit: number) => Uint8Array
}

/** a group's text group: its element's or label's folded into its text's (`.e`, `.l` -> `.t`) */
export const textGroupOf = (g: string): string => g.replace(/\.[el]$/, '.t')

/** a page of A as the wrap reads it, made at the read (wrapPageOf), so that the read's pages are let go before it: its alignment
 *  facts, each glyph's show and place in it (pageInk's (n, k), in pairs; -1 for none), each box's path or kind (pageInk's
 *  `paths`), and each turned glyph's (n, k); null for a page not read */
export interface WrapPageA {
  extra: AlignFacts
  nk: Int32Array
  paths: ArrayLike<number>
  turnedNK: Int32Array
}
const nkOf = (list: readonly { n?: number; k?: number }[]): Int32Array => {
  const nk = new Int32Array(2 * list.length)
  list.forEach((x, i) => {
    nk[2 * i] = Number.isInteger(x.n) ? (x.n as number) : -1
    nk[2 * i + 1] = Number.isInteger(x.k) ? (x.k as number) : -1
  })
  return nk
}
/** a read page as the wrap reads it: its glyphs' (its Doc's, which pageInk's raw ones are the same of: the read may let those go)
 *  and turned glyphs' (n, k), its boxes' kinds and its facts, none of its ink */
export function wrapPageOf(pg: ReadPage<AlignFacts>): WrapPageA | null {
  if (!pg.raw || !pg.extra) return null
  return { extra: pg.extra, nk: nkOf(pg.page.glyphs), paths: pg.raw.paths ?? [], turnedNK: nkOf(pg.raw.turned ?? []) }
}

export async function wrap(
  bytesA: Uint8Array,
  located: Located,
  pagesA: readonly (WrapPageA | null)[],
  deps: WrapDeps,
): Promise<AddOn | { refused: string; why: string }> {
  const plans = new Map<number, WrapPlan>()
  const lost = new Set<string>()
  const isFigure = (g: string) => located.figureGroups.has(g)
  pagesA.forEach((pg, i) => {
    const groups = located.groups[i]
    if (!pg || !groups) return
    if (![groups.glyphs, groups.boxes, groups.turned].some((l) => l.some((g) => g !== null))) return
    // (each glyph as planOf reads one, its (n, k) alone, made for the page and let go with it)
    const glyphs = Array.from({ length: pg.nk.length / 2 }, (_, j) => ({
      n: pg.nk[2 * j] as number,
      k: pg.nk[2 * j + 1] as number,
    }))
    const plan = planOf(glyphs, groups.glyphs, pg.paths, groups.boxes, pg.extra)
    for (const g of plan.lost) lost.add(g)
    // (a turned glyph's group by its place in its show, as a level one's (wrapFinal's way); and one of no group is read as
    // its own, none, so that a show it shares with a group's glyphs is split at it rather than giving it their group: the
    // proof that each group encloses exactly its ink found 3 such glyphs on 2 papers of the corpus)
    const turned = pg.turnedNK.length / 2
    for (const grouped of [true, false])
      groups.turned.forEach((g, k) => {
        if (k >= turned) return
        const n = pg.turnedNK[2 * k] as number
        if (!(n >= 0) || (g !== null) !== grouped || (g === null && !plan.shows.has(n))) return
        const row = plan.shows.get(n) ?? []
        plan.shows.set(n, row)
        row[pg.turnedNK[2 * k + 1] as number] = g
      })
    plans.set(i + 1, { facts: pg.extra, ...plan, isFigure, textOf: textGroupOf })
  })
  // (the section alone: A and it never composed, nor the whole hashed, which no step of the prepare reads)
  const made = await wrapOf(bytesA, plans, { ...deps, compose: false })
  if ('refused' in made) return made
  return {
    bytes: made.section,
    pages: made.pages,
    groups: new Set(made.groups.keys()),
    ocgs: made.groups,
    lost,
    stats: made.stats,
  }
}
