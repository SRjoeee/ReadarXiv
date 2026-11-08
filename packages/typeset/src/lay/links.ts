// Page.links (design-a §1.2: the page's links as drawn, moved with their pieces, else at A's boxes; D.links, design-b §1.6 E1):
// A's annotations on the page (Part.links), each with the member and the piece that holds it as the prepare states them
// (locate's ownership: the member that owns more than half of the glyphs under it, within it the element that does, else its
// text), placed as today's linkUnit and freezeLinks place them (RUN:1044-1128, links.mjs placeUnit, freezeLinks):
// - one whose ink stays, at A's box: no owner, its owner not laid on the page (the original's, waiting, a table held), or its
//   piece's ink kept where it stands, whether or not the translation draws it too (a display, an element the part keeps, one
//   the reading keeps in place, the member's elements' group on: none moved, or one the add-on could not part, Placed.fixed);
// - one over a piece of a laid member, moved with what is drawn of it on the page (placeUnit): over a crop of it by the crop's
//   own map (placeCrop), over the characters it is drawn as (placeText: the whole of them, the part stating no annotation's
//   characters under it; the annotations of one target over it one link); one over the member's text, over the translation of
//   its link group (\href, \url, \hyperlink, \hyperref: placePair) of its target, as matchUnit's url and name tiers pair
//   them (the target each group's source names, SpanAt.to: the annotations of a target with the groups that name it), then,
//   for what no target decides (a group that names none, a part made before SpanAt.to), as its order tier does (the k-th
//   annotation the k-th group where they are as many, else the k-th run of one target's annotations; one group takes them all
//   where they are of one target; over the member, else by the groups drawn on the page and its own annotations), else, where
//   the member has no link group drawn, over its whole drawing where one target's annotations hold every line of it on the
//   page (matchUnit's whole tier, its every own character under them: each line's ink inside one of their boxes, its baseline
//   between their edges);
// - any other is dropped (its ink is turned off and nothing of it is drawn on the page: a link left at A's box would open from
//   the translation's text over it, today's freezeLinks drops it alike).
// An annotation of a member's other page (Link.page: the part holds those of its members on every page they have lines on) is
// drawn here only over what of its piece the page draws (a translation sets a member's text on whichever of its pages it falls),
// never at its box, which is its own page's (`away`); a member's link groups are paired with its annotations of all its pages,
// so that each of its pages pairs them alike: an annotation is drawn on the page its group is set on, and on no other.
// A member's annotations are taken in their order on A (inReading), which is the order TeX set them in, never in the part's
// list's, which is the PDF's annotation array's (two groups listed right to left opened each other's address, #626's review).
// Each link drawn names the member that owns it (its third field), so that a reader leaving that member the original's puts its
// links back at A's boxes (composer.ts held()).
import type { Line, Link, Part, Placed } from '@readarxiv/format'
import type { Face } from '../breaker/tokens.ts'
import { lineRuns, runEdge, type TextRun } from '../emit/display.ts'
import { type Annot, type Cand, placeUnit, type Target } from '../emit/links.ts'
import { tokenBand } from '../emit/sentences.ts'
import type { LaidLine, Layout } from '../fit/types.ts'
import type { Page } from '../types.ts'

/** a laid member as its links read it: its layout, its groups off on the page, the elements its reading keeps in place, and
 *  the element a piece of its reading is (its tokens' `k`, the piece's place in the row's pieces: the element's id, or null
 *  for a piece of no element) */
export type LinkOwner = {
  m: Placed
  layout: Layout
  off: number
  kept: ReadonlySet<string>
  elOf: (k: number) => string | null
}

/** a link group's command, as the breaker tags its tokens (LINK_OPEN): \url's with \href's */
const LINK_CMD = /^(?:href|hyperref|hyperlink|url)$/
type Tok = {
  s?: string
  space?: boolean
  crop?: { k?: number | null }
  k?: number
  ph?: unknown
  st?: { link?: unknown }
}
/** a target as two are compared: an address in the WHATWG URL parser's form (today's urlOf; as written where it parses as none),
 *  a destination as stated */
const key = (to: Link['to']): string => {
  if (!('url' in to)) return `d${to.dest}`
  try {
    return `u${new URL(to.url).href}`
  } catch {
    return `u${to.url}`
  }
}

/** what became of each of a part's links (the gate's count; `away` one of another page not drawn here, or one a translation
 *  draws on another page of its member alone): at A's box with no owner, its owner not laid or its piece kept
 *  there; moved over a crop, a piece's drawn text, an \href's group or the whole drawing; dropped where its ink is off and
 *  nothing of it is drawn, where several targets share a piece drawn as text, where the member's text holds it and no group
 *  or whole drawing takes it, or where placeUnit could not place it */
export type LinkFate =
  | 'free'
  | 'unlaid'
  | 'kept'
  | 'crop'
  | 'text'
  | 'pair'
  | 'whole'
  | 'off'
  | 'targets'
  | 'unmatched'
  | 'unplaced'
  | 'away'

/**
 * The links of page `page`: `laid` the members laid on it, by ord (a member not among them keeps its links at A's boxes);
 * `w100` a run's width at 100 px in its face (Metrics', as the drawing measures it); `fates`, where given, each link's fate by
 * its index in the part's
 */
export function linksOf(
  part: Part,
  page: number,
  laid: ReadonlyMap<number, LinkOwner>,
  w100: (s: string, face: Face) => number,
  fates?: LinkFate[],
): Page['links'] {
  const list = part.links ?? []
  const out: Page['links'] = []
  const fate = (i: number, f: LinkFate) => {
    if (fates) fates[i] = f
  }
  // (an annotation of another page, a member's of the page there (Link.page): drawn here only over what of its piece the page
  // draws, never at its box, which is that page's)
  const here = (i: number) => (list[i]!.page ?? page) === page
  const atBox = (i: number, f: LinkFate) => {
    const owner = list[i]!.owner
    if (here(i)) out.push([list[i]!.box, list[i]!.to, ...(owner ? [owner[0]] : [])] as Page['links'][number])
    fate(i, here(i) ? f : 'away')
  }
  const byOwner = new Map<number, number[]>()
  list.forEach((l, i) => {
    const x = l.owner ? laid.get(l.owner[0]) : undefined
    if (!x) atBox(i, l.owner ? 'unlaid' : 'free')
    else byOwner.set(l.owner![0], [...(byOwner.get(l.owner![0]) ?? []), i])
  })
  for (const [ord, owned] of byOwner) {
    const { m, layout: L, off, kept, elOf } = laid.get(ord)!
    const ids = inReading(owned, list, m.lines, page)
    const rank = new Map(ids.map((i, n) => [i, n]))
    const lines = L.lines.filter((line) => line.page === page).map((line) => ({ line, runs: lineRuns(line, L) }))
    // (each element drawn on the page as a crop or as text, by its id: the first piece of its drawn there)
    const crops = new Map<string, number>(),
      texts = new Map<string, number>(),
      pairs = new Set<number>()
    const add = (to: Map<string, number>, k: number | null | undefined) => {
      const id = Number.isInteger(k) ? elOf(k!) : null
      if (id !== null && !to.has(id)) to.set(id, k!)
    }
    let drawsText = false
    for (const { line } of lines)
      for (const it of line.items) {
        const t = it.t as Tok
        if (t.crop) add(crops, t.crop.k)
        else if (typeof t.s === 'string' && !t.space) {
          drawsText = true
          if (t.ph !== undefined) add(texts, t.k)
          if (typeof t.st?.link === 'number') pairs.add(t.st.link)
        }
      }
    const els = new Map(m.els ?? [])
    const annot = (i: number): Cand => {
      const l = list[i]!
      const a: Annot = {
        i,
        at: rank.get(i)!,
        ...('url' in l.to ? { url: l.to.url } : { dest: l.to.dest }),
        rect: [...l.box],
        ...(l.text ? { ov: l.text } : {}),
        g2: { x: [], y: [], ch: [] },
      }
      return { q: l.page ?? page, a }
    }
    const groups: { to: Target; annots: (Cand & { tier: string })[] }[] = []
    // (each element's annotations, and the member's text's in their order on the page)
    const byEl = new Map<string, number[]>()
    const text: number[] = []
    for (const i of ids) {
      const piece = list[i]!.owner![1]
      if (piece === '') text.push(i)
      else byEl.set(piece, [...(byEl.get(piece) ?? []), i])
    }
    for (const [id, is] of byEl) {
      const crop = crops.get(id),
        k = texts.get(id)
      const e = els.get(id)
      // (its ink stays where it stands, however it is drawn: a display, kept by the part or in place by the reading, or the
      // member's elements' group on (none moved, or a group the add-on could not part, Placed.fixed): the original's anchor
      // stays with it, #626's review)
      const stays = !e || e.keep || e.kind === 'display' || kept.has(id) || !(off & 2)
      if (stays) for (const i of is) atBox(i, 'kept')
      else if (crop !== undefined)
        groups.push({ to: { k: crop, draw: 'crop' }, annots: is.map((i) => ({ ...annot(i), tier: 'geometry' })) })
      else if (k !== undefined) {
        // (over the characters it is drawn as: each annotation over its own characters among them where the part states them
        // (Link.text, PDF.js's overlaidText: today's placeText), the piece's annotations in one group, so that one search, moving
        // forward only, takes them in their order on A whatever their targets (the same text twice, two works: each its own
        // occurrence, #631's review); where it does not (a part made before), the annotations of one target over their whole,
        // those of two or more targets none, not told apart)
        if (is.every((i) => !!list[i]!.text))
          groups.push({
            to: { k, draw: 'text', single: is.length === 1 },
            annots: is.map((i) => ({ ...annot(i), tier: 'geometry' })),
          })
        else if (new Set(is.map((i) => key(list[i]!.to))).size === 1) {
          groups.push({ to: { k, draw: 'text', single: true }, annots: [{ ...annot(is[0]!), tier: 'geometry' }] })
          for (const i of is.slice(1)) fate(i, 'text')
        } else for (const i of is) fate(i, 'targets')
      } else for (const i of is) fate(i, here(i) ? 'off' : 'away')
    }
    if (text.length) {
      for (const i of text) fate(i, 'unmatched')
      // (the member's annotations over its text in their order on A (inReading), over all its pages: the part holds them on
      // every page of the member, those of its other pages with their page, and the member's lines run over its pages in order;
      // its link groups in their source's order, each with the target its source names (SpanAt.to), where it names one)
      const groupsOf = (m.spans ?? [])
        .filter(([, s]) => LINK_CMD.test(s.cmd ?? ''))
        .map(([id, s]) => [Number(id), s.to ? key(s.to) : null] as const)
        .sort((a, b) => a[0] - b[0])
      const pair = (id: number, run: number[], tier: string) => {
        if (pairs.has(id))
          groups.push({ to: { pair: id, draw: 'pair' }, annots: run.map((i) => ({ ...annot(i), tier })) })
        else for (const i of run) if (!here(i)) fate(i, 'away')
      }
      const oneTarget = (rs: number[][]) =>
        rs.length > 0 && rs.every((r) => key(list[r[0]!]!.to) === key(list[rs[0]![0]!]!.to))
      // (annotations with groups in their orders: each annotation an occurrence where they are as many as the groups (two links
      // to one address one after the other are one run of one target, #626's review), else each run of one target a group (a
      // link TeX broke over lines is one run), else one group takes all of one target; placed where the group is drawn, on
      // whichever page of the member that is)
      const inOrder = (as: number[], gs: readonly number[], tier: string): boolean => {
        const runs = runsOf(as, list)
        if (gs.length && gs.length === as.length) as.forEach((i, j) => void pair(gs[j]!, [i], tier))
        else if (gs.length && gs.length === runs.length) runs.forEach((run, j) => void pair(gs[j]!, run, tier))
        else if (gs.length === 1 && oneTarget(runs)) pair(gs[0]!, runs.flat(), tier)
        else return false
        return true
      }
      // (by target first, as today's url and name tiers pair them (matchUnit): the annotations of each target a group names
      // with the groups that name it, whatever the member's other links and wherever each falls, so that every page of the
      // member pairs them alike; where they are not told apart so, none of them)
      const addr = (i: number) => key(list[i]!.to)
      const named = new Set(groupsOf.flatMap(([, x]) => (x === null ? [] : [x])))
      for (const x of named) {
        const as = text.filter((i) => addr(i) === x)
        if (as.length)
          inOrder(
            as,
            groupsOf.filter(([, y]) => y === x).map(([id]) => id),
            x[0] === 'u' ? 'url' : 'key',
          )
      }
      // (then by order what no target decides: the annotations of a target no group names (none named: a part made before
      // SpanAt.to) with the groups that name none (a \hyperref, whose destination is its label's anchor), over the member, else
      // by those drawn on the page and the page's own annotations)
      const rest = text.filter((i) => !named.has(addr(i)))
      const bare = groupsOf.filter(([, x]) => x === null).map(([id]) => id)
      const ours = rest.filter(here)
      if (
        rest.length &&
        !inOrder(rest, bare, 'order') &&
        !inOrder(
          ours,
          bare.filter((id) => pairs.has(id)),
          'order',
        ) &&
        !groupsOf.some(([id]) => pairs.has(id)) &&
        drawsText
      ) {
        // (matchUnit's whole tier: one target's annotations over every line of the member on the page, where no group of it is
        // drawn there)
        const mine = m.lines.filter((l) => l[0] === page && !(l[9] & 1))
        const byTarget = new Map<string, number[]>()
        for (const i of ours) byTarget.set(key(list[i]!.to), [...(byTarget.get(key(list[i]!.to)) ?? []), i])
        const holding = [...byTarget.values()].filter(
          (is) =>
            mine.length > 0 &&
            mine.every((l) =>
              is.some((i) => {
                const b = list[i]!.box
                return l[2] >= b[0] && l[3] <= b[2] && l[4] > b[1] && l[4] < b[3]
              }),
            ),
        )
        if (holding.length === 1)
          groups.push({
            to: { draw: 'whole', own: [] },
            annots: holding[0]!.map((i) => ({ ...annot(i), tier: 'whole' })),
          })
      }
    }
    if (!groups.length) continue
    const edge = (line: LaidLine, run: TextRun, at: number) => runEdge(run, at, line, L, w100)
    const band = (t: unknown, line: LaidLine) =>
      tokenBand(t as never, (line.seg as { f: number } | undefined) ?? L, line.baseline)
    // (a piece drawn as text is searched over the member's laid lines on all its pages, its annotations of all its pages in
    // their order on A, one search moving forward only: each takes its own occurrence wherever the translation sets it, and
    // every page of the member finds the same; searched among what one page draws alone, a page's occurrence took the
    // annotation of an occurrence another page draws, #631's review. A crop, a pair and a whole drawing are placed over what
    // the page draws of them. The records of this page are kept, in the groups' order)
    const asText = groups.filter((g) => g.to.draw === 'text')
    const placed = [
      placeUnit({ groups: groups.filter((g) => g.to.draw !== 'text'), lines, edge, band, scale: L.scale }),
      ...(asText.length
        ? [
            placeUnit({
              groups: asText,
              lines: L.lines.map((line) => ({ line, runs: lineRuns(line, L) })),
              edge,
              band,
              scale: L.scale,
            }),
          ]
        : []),
    ]
    const drawOf = new Map(groups.flatMap((g) => g.annots.map((c) => [c.a.i, g.to.draw as LinkFate] as const)))
    const groupOf = new Map(groups.flatMap((g, n) => g.annots.map((c) => [c.a.i, n] as const)))
    for (const t of placed.flatMap((x) => x.tried)) fate(t.i, 'unplaced')
    const records = placed
      .flatMap((x) => x.records)
      .map((r, n) => ({ r, n }))
      .sort((x, y) => groupOf.get(x.r.sources.annots[0]![1])! - groupOf.get(y.r.sources.annots[0]![1])! || x.n - y.n)
      .map(({ r }) => r)
    const drawn = new Set<number>()
    for (const r of records) {
      if (r.page !== page) continue
      for (const [, i] of r.sources.annots) {
        fate(i, drawOf.get(i) ?? 'unplaced')
        drawn.add(i)
      }
      const to = list[r.sources.annots[0]![1]]!.to
      const b = r.rec.boxes
      for (let j = 0; j + 3 < b.length; j += 4) out.push([[b[j]!, b[j + 1]!, b[j + 2]!, b[j + 3]!], to, ord])
    }
    // (one drawn on another page of the member alone: that page's)
    for (const r of records)
      if (r.page !== page) for (const [, i] of r.sources.annots) if (!drawn.has(i)) fate(i, 'away')
  }
  return out
}

/**
 * A member's annotations in their order on A, the order TeX set them in: a paragraph's characters are set in the source's order
 * along its lines, its lines in the member's order over its pages (`lines`, Placed.lines). Each is at the member's line it lies
 * on (of those on its own page, Link.page or the part's, one its box overlaps across where any does, the one whose baseline is
 * nearest its box's middle), then at its box's start along that line; the PDF's annotation array, whose order the part's list
 * keeps, need not be TeX's (#626's review: two \href groups listed right to left). An annotation of no line of the member (none
 * on its page) comes after those that have one, by its page, then its place in the list.
 */
function inReading(ids: readonly number[], list: readonly Link[], lines: readonly Line[], page: number): number[] {
  const at = new Map<number, [number, number]>()
  const pageOf = (i: number) => list[i]!.page ?? page
  for (const i of ids) {
    const b = list[i]!.box,
      q = pageOf(i)
    const x0 = Math.min(b[0], b[2]),
      x1 = Math.max(b[0], b[2]),
      mid = (b[1] + b[3]) / 2
    let line = -1,
      best: [number, number] = [2, 0]
    lines.forEach((l, j) => {
      if (l[0] !== q) return
      const d: [number, number] = [l[3] > x0 && l[2] < x1 ? 0 : 1, Math.abs(l[4] - mid)]
      if (d[0] < best[0] || (d[0] === best[0] && d[1] < best[1])) {
        best = d
        line = j
      }
    })
    at.set(i, line < 0 ? [lines.length, 0] : [line, x0])
  }
  const of = (i: number) => at.get(i)!
  return [...ids].sort((a, b) => of(a)[0] - of(b)[0] || of(a)[1] - of(b)[1] || pageOf(a) - pageOf(b) || a - b)
}

/** annotations in their order, cut into runs of one target (a link TeX broke over lines is one annotation a line) */
function runsOf(ids: readonly number[], list: readonly Link[]): number[][] {
  const out: number[][] = []
  for (const i of ids) {
    const last = out.at(-1)
    if (last && key(list[last[0]!]!.to) === key(list[i]!.to)) last.push(i)
    else out.push([i])
  }
  return out
}
