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
  stats: Wrap['stats']
}

export interface WrapDeps {
  PL: PdfLib
  deflate: (b: Uint8Array) => Uint8Array
  inflate: (b: Uint8Array, limit: number) => Uint8Array
}

/** a group's text group: its element's or label's folded into its text's (`.e`, `.l` -> `.t`) */
export const textGroupOf = (g: string): string => g.replace(/\.[el]$/, '.t')

export async function wrap(
  bytesA: Uint8Array,
  located: Located,
  pagesA: readonly ReadPage<AlignFacts>[],
  deps: WrapDeps,
): Promise<AddOn | { refused: string; why: string }> {
  const plans = new Map<number, WrapPlan>()
  const isFigure = (g: string) => located.figureGroups.has(g)
  pagesA.forEach((pg, i) => {
    const groups = located.groups[i]
    if (!pg.raw || !pg.extra || !groups) return
    if (![groups.glyphs, groups.boxes, groups.turned].some((l) => l.some((g) => g !== null))) return
    const plan = planOf(pg.raw.glyphs, groups.glyphs, pg.raw.paths ?? [], groups.boxes, pg.extra)
    // (a turned glyph's group by its place in its show, as a level one's (wrapFinal's way); and one of no group is read as
    // its own, none, so that a show it shares with a group's glyphs is split at it rather than giving it their group: the
    // proof that each group encloses exactly its ink found 3 such glyphs on 2 papers of the corpus)
    groups.turned.forEach((g, k) => {
      const t = pg.raw?.turned?.[k]
      if (!t || !(t.n >= 0) || (g === null && !plan.shows.has(t.n))) return
      const row = plan.shows.get(t.n) ?? []
      plan.shows.set(t.n, row)
      row[t.k] = g
    })
    plans.set(i + 1, { facts: pg.extra, ...plan, isFigure, textOf: textGroupOf })
  })
  const made = await wrapOf(bytesA, plans, deps)
  if ('refused' in made) return made
  return {
    bytes: made.bytes.slice(bytesA.length),
    pages: made.pages,
    groups: new Set(made.groups.keys()),
    ocgs: made.groups,
    stats: made.stats,
  }
}
