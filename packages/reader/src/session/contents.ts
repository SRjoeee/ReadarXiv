// The contents and the heading being read (today's R engine/view/contents.mjs and outline.ts; docs/PDF-READER.md §6.3, §11.8):
// the paper's headings as its units name them (kind `heading`, their `depth` the sectioning command's), the title left out, a
// tree of three levels at most ranked among the depths the paper uses (an article's sections are 1, a thesis's chapters 1 and
// its sections 2); a heading with no depth (a \paragraph) is not in the contents once any has one. Each is at its member's first
// line once a part places it, else at the page the head's outline gives it (the located headings, by member), else at the page
// the original's own outline gives a heading of its title (matched in order), else at none; titled by its row once taken, else by
// its source; in either, each element as its copy text (the part's), never its TeX source. The heading read is the last of them
// at or above the reading line of the pane read. Pure: the reader tells it what comes and asks it what to show.
import type { El, Head, OutPiece, Piece, Placed, Row, Unit } from '@readarxiv/format'

/** a contents entry: `id` its place in the contents (stable for a layer), `title` its row's text once taken else `original`, the
 *  source's, each element in both as its copy text (copyTextOf); `level` 1 to 3; `page` the page it is on, null where none is
 *  known */
export interface OutlineEntry {
  id: number
  title: string
  original: string
  level: 1 | 2 | 3
  page: number | null
}
/** a rectangle on a page: [page, x0, y0, x1, y1] (PDF units, y up) */
export type Rect = [number, number, number, number, number]

interface Heading {
  id: number
  unit: Unit
  src: string
  depth?: number
  /** the member's ord and page where the head's outline locates it */
  ord: number | null
  page: number | null
}

/** a title as the outline and a heading are compared: its section number, case, marks and spaces aside */
const normal = (s: unknown) =>
  String(s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/^\s*(?:\d+(?:\.\d+)*|[ivxlcdm]+|[a-z])[.)]?\s+(?=\S)/, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')

/** a unit's plain source: its text, an element by its source, a nested unit by what is around it (what a heading is matched to
 *  the original's own outline by; never shown) */
export function plainOf(pieces: readonly Piece[]): string {
  let out = ''
  for (const p of pieces)
    out += p.t === 'text' ? p.s : p.t === 'el' ? p.src : p.t === 'span' ? plainOf(p.content) : `${p.pre}${p.post}`
  return out.replace(/\s+/g, ' ').trim()
}
/**
 * An element's copy text in a title, as its part states it (format's El): `text`, its glyphs' text on A ('' where TeX set nothing
 * for it), else `copy`, its source's plain text (a formula's as linear text: "τ_V"); a forced break a space. An element no part has
 * stated yet, or one that states neither (its ink not found: 2608.06701v1's `\sage`), is nothing, as today's reader drops every
 * element (R engine/translate/mt.mjs plainTranslated): never its TeX source, which the contents showed as "\sys" and the translated
 * words for "Overview of BLIP" (2608.25210v2; 177 entries of 38 papers at B15)
 */
function copyTextOf(kind: string | undefined, el: El | undefined): string {
  if (kind === 'break' || el?.brk) return ' '
  return el?.text !== undefined ? el.text : (el?.copy ?? '')
}
/** a unit's text as a title: its text, each element as its copy text, a nested unit nothing (its mark) */
function titleOf(pieces: readonly Piece[], copyOf: (id: string) => string): string {
  let out = ''
  for (const p of pieces)
    out += p.t === 'text' ? p.s : p.t === 'el' ? copyOf(p.id) : p.t === 'span' ? titleOf(p.content, copyOf) : ''
  return out
}
/** a row's text as a title: its text, each element as its copy text */
function titleOfRow(content: readonly OutPiece[], copyOf: (id: string) => string): string {
  let out = ''
  for (const p of content) out += p.t === 'text' ? p.s : p.t === 'el' ? copyOf(p.id) : titleOfRow(p.content, copyOf)
  return out
}
/** a unit's elements' kinds, by id */
function kindsOf(pieces: readonly Piece[], into = new Map<string, string>()): Map<string, string> {
  for (const p of pieces) {
    if (p.t === 'el') into.set(p.id, p.kind)
    else if (p.t === 'span') kindsOf(p.content, into)
  }
  return into
}
const spaced = (s: string) => s.replace(/\s+/g, ' ').trim()

/** the three depths a paper's contents show: the smallest it uses */
const depthsOf = (hs: readonly { depth?: number }[]) =>
  [...new Set(hs.map((h) => h.depth).filter((d): d is number => d !== undefined))].sort((a, b) => a - b).slice(0, 3)

/**
 * The headings the contents list, among which the heading being read is found: the title left out (the front matter's headings,
 * those before the abstract, or before the first paragraph where there is none: the units carry no title mark); once any has a
 * depth, those with none and those below the third depth used
 */
export function listedOf(units: readonly Unit[]): Unit[] {
  const firstBody = units.findIndex((u) => u.kind === 'abstract')
  const front = firstBody >= 0 ? firstBody : units.findIndex((u) => u.kind === 'para')
  const kept = units.filter((u, i) => u.kind === 'heading' && !(u.depth === undefined && front >= 0 && i < front))
  const depths = depthsOf(kept)
  return depths.length ? kept.filter((h) => h.depth !== undefined && depths.includes(h.depth)) : kept
}

export interface Contents {
  /** the entries now */
  entries(): OutlineEntry[]
  /** members placed (a part read): whether a heading gained its first rectangle */
  place(members: Iterable<Placed>): boolean
  /** rows taken: whether a heading's title changed */
  take(rows: Iterable<Row>): boolean
  /** the rows' titles let go (another target's rows to come): whether a heading had one */
  clearTexts(): boolean
  /** the original's own outline, its entries matched to the headings in order by their titles: whether a heading not located
   *  gained a page */
  outline(doc: OutlineDoc): Promise<boolean>
  /** an entry's first rectangle, where a part has placed it */
  firstRect(id: number): Rect | null
  /** the page the contents give an entry: its first rectangle's, else the head's outline's, else the original's outline's */
  pageOf(id: number): number | null
  /**
   * The heading being read at a place: page `page`, `at` how far down it the reading line is (a share of its height), and
   * `topOf(rect)` how far down its page a rectangle's top is (null where it cannot be told): the last entry at or above it (one
   * with a page and no rectangle is at its page's top); null before the first
   */
  headingAt(page: number, at: number | null, topOf: (r: Rect) => number | null): number | null
}
/** what of PDF.js's document the original's outline is read through */
export interface OutlineDoc {
  getOutline(): Promise<readonly { title: string; dest: unknown; items?: readonly unknown[] }[] | null>
  getDestination(name: string): Promise<unknown[] | null>
  getPageIndex(ref: unknown): Promise<number>
}

/** the contents of a layer's paper, from its units (in their objects' order) and its head */
export function createContents(units: readonly Unit[], head: Pick<Head, 'outline'>): Contents {
  const at = new Map<string, [number, number][]>()
  for (const [ord, page, id] of head.outline ?? []) (at.get(id) ?? at.set(id, []).get(id))?.push([ord, page])
  for (const l of at.values()) l.sort((a, b) => a[0] - b[0])
  const headings: Heading[] = []
  for (const u of listedOf(units)) {
    const src = plainOf(u.content)
    const occurs = at.get(u.id) ?? []
    const base = { unit: u, src, ...(u.depth === undefined ? {} : { depth: u.depth }) }
    if (!occurs.length) headings.push({ id: headings.length, ...base, ord: null, page: null })
    for (const [ord, page] of occurs) headings.push({ id: headings.length, ...base, ord, page })
  }
  const depths = depthsOf(headings)
  const byOrd = new Map<number, Heading>()
  for (const h of headings) if (h.ord !== null) byOrd.set(h.ord, h)
  const byUnit = new Map<string, Heading[]>()
  for (const h of headings) (byUnit.get(h.unit.id) ?? byUnit.set(h.unit.id, []).get(h.unit.id))?.push(h)
  /** each entry's first rectangle once a part places it; the pages the original's outline gives; by unit, the rows taken, its
   *  elements' kinds and the copy texts its members' parts state (Placed.els) */
  const first = new Map<number, Rect>()
  const outlined = new Map<number, number>()
  const rowOf = new Map<string, readonly OutPiece[]>()
  const kinds = new Map<string, Map<string, string>>()
  const copies = new Map<string, Map<string, El>>()
  const pageOf = (id: number) => first.get(id)?.[0] ?? headings[id]?.page ?? outlined.get(id) ?? null
  const copyOf = (unit: Unit) => {
    const k = kinds.get(unit.id) ?? kinds.set(unit.id, kindsOf(unit.content)).get(unit.id)
    const c = copies.get(unit.id)
    return (id: string) => copyTextOf(k?.get(id), c?.get(id))
  }
  /** a heading's source as a title, and its title: its row's text once taken (a row of no text, the source), each element as its
   *  copy text */
  const sourceTitle = (unit: Unit) => spaced(titleOf(unit.content, copyOf(unit)))
  const title = (unit: Unit) => {
    const row = rowOf.get(unit.id)
    return (row && spaced(titleOfRow(row, copyOf(unit)))) || sourceTitle(unit)
  }

  return {
    entries: () =>
      headings.map((h) => ({
        id: h.id,
        title: title(h.unit),
        original: sourceTitle(h.unit),
        level: (h.depth === undefined ? 1 : depths.indexOf(h.depth) + 1) as 1 | 2 | 3,
        page: pageOf(h.id),
      })),
    place(members) {
      let moved = false
      for (const m of members) {
        const h = byOrd.get(m.ord)
        if (!h) continue
        const l = m.lines[0]
        if (!first.has(h.id) && l) {
          // (a line: page, column, x0, x1, baseline, top, bottom, …)
          first.set(h.id, [l[0], l[2], l[6], l[3], l[5]])
          moved = true
        }
        // (its elements' copy texts, the first a part states for each: a title that gains one is told as moved)
        if (!m.els?.length) continue
        const was = [title(h.unit), sourceTitle(h.unit)]
        const c = copies.get(h.unit.id) ?? copies.set(h.unit.id, new Map()).get(h.unit.id)
        for (const [id, el] of m.els) if (!c?.has(id)) c?.set(id, el)
        if (title(h.unit) !== was[0] || sourceTitle(h.unit) !== was[1]) moved = true
      }
      return moved
    },
    take(rows) {
      let moved = false
      for (const r of rows) {
        const hs = byUnit.get(r.id)
        if (!hs) continue
        const unit = (hs[0] as Heading).unit
        const was = title(unit)
        if (r.ok) rowOf.set(r.id, r.content)
        else rowOf.delete(r.id)
        if (title(unit) !== was) moved = true
      }
      return moved
    },
    clearTexts() {
      const had = rowOf.size > 0
      rowOf.clear()
      return had
    },
    async outline(doc) {
      const items: { title: string; dest: unknown }[] = []
      const walk = (list: readonly unknown[] | null | undefined) => {
        for (const it of (list ?? []) as { title: string; dest: unknown; items?: readonly unknown[] }[]) {
          items.push(it)
          walk(it.items)
        }
      }
      walk(await doc.getOutline().catch(() => null))
      if (!items.length) return false
      const pageAt = async (dest: unknown): Promise<number | null> => {
        try {
          const d = typeof dest === 'string' ? await doc.getDestination(dest) : dest
          const ref = Array.isArray(d) ? d[0] : null
          if (ref == null) return null
          return Number.isInteger(ref) ? (ref as number) + 1 : (await doc.getPageIndex(ref)) + 1
        } catch {
          return null
        }
      }
      let moved = false,
        from = 0
      for (const h of headings) {
        const want = normal(h.src)
        if (!want) continue
        for (let i = from; i < items.length; i++) {
          if (normal(items[i]?.title) !== want) continue
          from = i + 1
          const page = await pageAt(items[i]?.dest)
          if (page && outlined.get(h.id) !== page) {
            outlined.set(h.id, page)
            if (!first.has(h.id) && h.page === null) moved = true
          }
          break
        }
      }
      return moved
    },
    firstRect: (id) => first.get(id) ?? null,
    pageOf,
    headingAt(page, at, topOf) {
      let id: number | null = null
      for (const h of headings) {
        const r = first.get(h.id) ?? null
        const p = pageOf(h.id)
        if (!p) continue
        if (p < page) id = h.id
        else if (p === page) {
          const top = r ? topOf(r) : null
          if (at === null || top === null || top <= at) id = h.id
        }
      }
      return id
    },
  }
}
