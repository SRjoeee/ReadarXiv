// Page.links (design-a §1.2: the page's links as drawn, moved with their pieces, else at A's boxes; D.links, design-b §1.6 E1):
// A's annotations on the page (Part.links), each with the member and the piece that holds it as the prepare states them
// (locate's ownership: the member that owns more than half of the glyphs under it, within it the element that does, else its
// text), placed as today's linkUnit and freezeLinks place them (RUN:1044-1128, links.mjs placeUnit, freezeLinks):
// - one whose ink stays, at A's box: no owner, its owner not laid on the page (the original's, waiting, a table held), or its
//   piece's ink kept where it stands, whether or not the translation draws it too (a display, an element the part keeps, one
//   the reading keeps in place, the member's elements' group on the annotation's own page: none moved there, or one the add-on
//   could not part, Placed.fixed; the label's group on, for one over the member's label, Link.label: not drawn anew);
// - one over a piece of a laid member, moved with what is drawn of it on the page (placeUnit): over a crop of it by the crop's
//   own map (placeCrop), over the characters it is drawn as (placeText: the whole of them, the part stating no annotation's
//   characters under it; the annotations of one target over it one link); one over the member's text, over the translation of
//   its link group (\href, \url, \hyperlink, \hyperref: placePair) of its target, as matchUnit's url and name tiers pair
//   them (the target each group's source names, SpanAt.to: the annotations of a target with the groups that name it), then,
//   for what no target decides, as its order tier does, by kind first (a footnote's mark's with the member's marks, another
//   destination's with its references and \hyperref groups, each piece that holds none of its kind: a link round a reference's
//   number that takes in the comma after it is the text's by the part, the element owning half of its glyphs), then over the
//   groups that name none (a part made before SpanAt.to) (the k-th annotation the k-th piece where they are as many, else the
//   k-th run of one target's annotations; one piece takes them all where they are of one target; over the member, else by the
//   groups drawn on the page and its own annotations), else, where the member has no link group drawn, over its whole drawing
//   where one target's annotations hold every own glyph of it on the page (matchUnit's whole tier, its every own character
//   under them: as the part states it, Link.whole, by glyph point; a part made before, where each line's ink is inside one of
//   their boxes, its baseline between their edges). A link the part gives to an element
//   that holds on A another of the element's, of another target (a group's link left open round it), is the text's: today's
//   geometry tier gives a piece only a link every character of which is the piece's;
// - one over a member the entry draws whole on lines of its own, no layout of it made (a figure text, a babel name: DrawnWhole),
//   over its whole drawing where one target's annotations hold all of its text (the whole tier, as above): its text's ink is
//   hidden, and at A's box the link would stand over that and miss the translation's ends wherever the translation is longer;
// - any other is dropped (its ink is turned off and nothing of it is drawn on the page: a link left at A's box would open from
//   the translation's text over it, today's freezeLinks drops it alike).
// An annotation of a member's other page (Link.page: the part holds those of its members on every page they have lines on) is
// drawn here only over what of its piece the page draws (a translation sets a member's text on whichever of its pages it falls),
// never at its box, which is its own page's (`away`); a member's link groups are paired with its annotations of all its pages,
// so that each of its pages pairs them alike: an annotation is drawn on the page its group is set on, and on no other.
// A member's annotations are taken in their order on A (inReading), which is the order TeX set them in, never in the part's
// list's, which is the PDF's annotation array's (two groups listed right to left opened each other's address, #626's review).
// Each link drawn names the member that owns it (its third field), so that a reader leaving that member the original's puts its
// links back at A's boxes (composer.ts held()), and carries its own annotation's border on A (its fourth, Link.border: a moved
// link keeps it whatever box it is drawn over; the annotations one record is drawn for share it, placeUnit joining or pairing
// only those of one border, today's sameBorder), which the reader draws as it is stated.
import { LINE_FLAG, type Line, type Link, type LinkBorder, type Part, type Placed } from '@readarxiv/format'
import type { Face } from '../breaker/tokens.ts'
import { lineRuns, runEdge, type TextRun } from '../emit/display.ts'
import { type Annot, type Cand, placeUnit, type Target } from '../emit/links.ts'
import { tokenBand } from '../emit/sentences.ts'
import type { LaidLine, Layout } from '../fit/types.ts'
import type { Page } from '../types.ts'

/** a laid member as its links read it: its layout, its groups off on the page and on any of its pages (`offOn`, the same rule:
 *  where a link of an element the translation moves across the page break stays), the elements its reading keeps in place, and
 *  the element a piece of its reading is (its tokens' `k`, the piece's place in the row's pieces: the element's id, or null
 *  for a piece of no element); or a member drawn whole (DrawnWhole) */
export type LinkOwner =
  | {
      m: Placed
      layout: Layout
      off: number
      offOn: (page: number) => number
      kept: ReadonlySet<string>
      elOf: (k: number) => string | null
    }
  | DrawnWhole
/** a member the entry draws whole on lines of its own, no layout of it made (a figure text, S.figures; a babel name, S.names):
 *  its groups off on the page and the page's boxes its lines are drawn in (a turned one's the page's box of its run's; none for
 *  a name drawn as its member's lead, its word among that member's lines). No piece of it is drawn apart (its row sets an element
 *  as a space) and it draws no link group */
export type DrawnWhole = { m: Placed; off: number; drawn: readonly Page['links'][number][0][] }

/** a link group's command, as the breaker tags its tokens (LINK_OPEN): \url's with \href's */
const LINK_CMD = /^(?:href|hyperref|hyperlink|url)$/
/** an element's command that sets a reference to a destination in the paper, or a group's (links.mjs REF_SRC, by the command
 *  the part states, El.cmd) */
const REF_CMD =
  /^(?:ref|eqref|autoref|Autoref|cref|Cref|crefrange|Crefrange|cpageref|Cpageref|pageref|nameref|Nameref|vref|Vref|labelcref|subref|hyperref|hyperlink)\*?$/
/** the kind of piece a link of a target goes with, as today's order tier tells them apart (links.mjs kindOfAnnot): a citation's
 *  (cite.<key>), a footnote's mark's (Hfootnote.<n>), any other destination's, an address's */
const kindOf = (to: Link['to']): 'cite' | 'note' | 'internal' | 'url' => {
  if ('url' in to) return 'url'
  let d: unknown = to.dest
  try {
    d = JSON.parse(to.dest)
  } catch {
    /* a name as written */
  }
  if (typeof d === 'string' && d.startsWith('cite.')) return 'cite'
  if (typeof d === 'string' && /^Hfootnote\./.test(d)) return 'note'
  return 'internal'
}
/** the kind an element's link is of by its source (links.mjs linkKindOf, by the command and the nested mark the part states): a
 *  footnote's mark, a reference; null for any other (a citation's goes by its key, which the part does not state) */
const elKindOf = (e: { cmd?: string; nested?: 1 }): 'note' | 'internal' | null =>
  e.nested || /^(?:footnote|footnotemark)\*?$/.test(e.cmd ?? '')
    ? 'note'
    : REF_CMD.test(e.cmd ?? '')
      ? 'internal'
      : null
const boxOf = (b: readonly number[]) =>
  [Math.min(b[0]!, b[2]!), Math.min(b[1]!, b[3]!), Math.max(b[0]!, b[2]!), Math.max(b[1]!, b[3]!)] as const
const holds = (a: readonly number[], b: readonly number[]) => {
  const [p, q] = [boxOf(a), boxOf(b)]
  return p[0] <= q[0] && p[1] <= q[1] && p[2] >= q[2] && p[3] >= q[3]
}
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

/** a link as drawn: its box, its target, its owner's ord and its annotation's border where it has them */
const drawnOf = (
  box: Page['links'][number][0],
  to: Link['to'],
  owner: number | undefined,
  border: LinkBorder | undefined,
): Page['links'][number] => (border ? [box, to, owner, border] : owner === undefined ? [box, to] : [box, to, owner])
/** a border as placeUnit compares two (today's record's: its width, its colour's components, its style) */
const borderOf = (b: LinkBorder | undefined): Annot['border'] =>
  b && { width: b[0], rgb: [(b[1] >> 16) & 255, (b[1] >> 8) & 255, b[1] & 255], style: b[2] ?? 'solid' }

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
 * The links of page `page`: `laid` the members laid or drawn whole on it, by ord (a member not among them keeps its links at
 * A's boxes);
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
    const l = list[i]!
    if (here(i)) out.push(drawnOf(l.box, l.to, l.owner?.[0], l.border))
    fate(i, here(i) ? f : 'away')
  }
  const byOwner = new Map<number, number[]>()
  list.forEach((l, i) => {
    const x = l.owner ? laid.get(l.owner[0]) : undefined
    if (!x) atBox(i, l.owner ? 'unlaid' : 'free')
    else byOwner.set(l.owner![0], [...(byOwner.get(l.owner![0]) ?? []), i])
  })
  for (const [ord, owned] of byOwner) {
    const x = laid.get(ord)!
    if ('drawn' in x) {
      // (a member drawn whole: an annotation of another page `away`; one whose ink stays (its group on) at A's box; one over its
      // text over its whole drawing where one target's annotations hold all of it (the whole tier, as a laid member's below), one
      // record a drawn line, joined only where of one border; any other dropped: its ink is off, an element of it is drawn as
      // nothing, and no part of its translation is known to be a link's round part of its text)
      const text: number[] = []
      for (const i of owned) {
        const bit = list[i]!.owner![1] === '' ? 1 : 2
        if (!here(i)) fate(i, 'away')
        else if (!(x.off & bit)) atBox(i, 'kept')
        else if (bit === 1) text.push(i)
        else fate(i, 'off')
      }
      const holding = x.drawn.length ? wholeOf(text, list, x.m, page) : null
      const one = !!holding && new Set(holding.map((i) => JSON.stringify(list[i]!.border ?? null))).size === 1
      for (const i of text) fate(i, holding?.includes(i) ? (one ? 'whole' : 'unplaced') : 'unmatched')
      if (one) {
        const { to, border } = list[holding[0]!]!
        for (const b of x.drawn) out.push(drawnOf(b, to, ord, border))
      }
      continue
    }
    const { m, layout: L, offOn, kept, elOf } = x
    const ids = inReading(owned, list, m.lines, page)
    const rank = new Map(ids.map((i, n) => [i, n]))
    const all = L.lines.map((line) => ({ line, runs: lineRuns(line, L) }))
    const lines = all.filter(({ line }) => line.page === page)
    // (each element drawn as a crop or as text on any page of the member, by its id: the first piece of it drawn, and the pages
    // its crops stand on; the label's crops' pages; the link groups drawn on the page)
    const crops = new Map<string, number>(),
      cropsOn = new Map<string, Set<number>>(),
      labelOn = new Set<number>(),
      texts = new Map<string, number>(),
      pairs = new Set<number>()
    const add = (to: Map<string, number>, k: number | null | undefined) => {
      const id = Number.isInteger(k) ? elOf(k!) : null
      if (id !== null && !to.has(id)) to.set(id, k!)
      return id
    }
    let drawsText = false
    for (const { line } of all)
      for (const it of line.items) {
        const t = it.t as Tok
        if (t.crop) {
          const id = add(crops, t.crop.k)
          if (id !== null) cropsOn.set(id, (cropsOn.get(id) ?? new Set<number>()).add(line.page))
          else if (t.crop.k === undefined) labelOn.add(line.page)
        } else if (typeof t.s === 'string' && !t.space) {
          if (t.ph !== undefined) add(texts, t.k)
          if (line.page !== page) continue
          drawsText = true
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
        ...(l.border ? { border: borderOf(l.border) } : {}),
        g2: { x: [], y: [], ch: [] },
      }
      return { q: l.page ?? page, a }
    }
    const groups: { to: Target; annots: (Cand & { tier: string })[] }[] = []
    // (each element's annotations, and the member's text's in their order on A)
    const byEl = new Map<string, number[]>()
    let text: number[] = []
    for (const i of ids) {
      const piece = list[i]!.owner![1]
      if (piece === '') text.push(i)
      else byEl.set(piece, [...(byEl.get(piece) ?? []), i])
    }
    const pageOf = (i: number) => list[i]!.page ?? page
    // (a link round others of its element on A, of another target: hyperref's link of a group left open over the element, its
    // characters past the element's (today's geometry tier gives a piece only a link every character of which is the piece's),
    // is no link of the element's own, and the text's; searched first among the element's, it took the whole drawing and left
    // the element's own unplaced, 2610.10069v1-zh p10)
    for (const [id, is] of byEl) {
      const other = (i: number, j: number) =>
        j !== i && pageOf(j) === pageOf(i) && key(list[j]!.to) !== key(list[i]!.to)
      const round = is.filter((i) => is.some((j) => other(i, j) && holds(list[i]!.box, list[j]!.box)))
      if (!round.length) continue
      byEl.set(
        id,
        is.filter((i) => !round.includes(i)),
      )
      text.push(...round)
    }
    // (one over the member's label (Link.label): its ink stays where the label is not drawn anew, on the annotation's page, and the
    // link with it, as today's freeze keeps one no tier took whose glyphs are not erased; over the label carried as a crop, moved
    // with the crop; drawn anew, dropped)
    for (const i of text.filter((i) => list[i]!.label)) {
      if (!(offOn(pageOf(i)) & 4)) atBox(i, 'kept')
      else if (labelOn.has(page)) groups.push({ to: { draw: 'crop' }, annots: [{ ...annot(i), tier: 'geometry' }] })
      else fate(i, here(i) && !labelOn.size ? 'off' : 'away')
    }
    text = text.filter((i) => !list[i]!.label).sort((a, b) => rank.get(a)! - rank.get(b)!)
    // (the member's link groups in their source's order, each with the target its source names (SpanAt.to), where it names one;
    // the targets they name, and the annotations of the text no group's target decides)
    const groupsOf = (m.spans ?? [])
      .filter(([, s]) => LINK_CMD.test(s.cmd ?? ''))
      .map(([id, s]) => [Number(id), s.to ? key(s.to) : null, s.cmd ?? ''] as const)
      .sort((a, b) => a[0] - b[0])
    const named = new Set(groupsOf.flatMap(([, x]) => (x === null ? [] : [x])))
    // (today's order tier, by kind: the annotations of the member's text no group's target decides, a footnote's mark's with the
    // member's marks, any other destination's with its references and its \hyperref groups, each piece that holds none of its
    // kind, over the member, in their orders (links.mjs:420): hyperref's link round a reference's number takes in the comma after
    // it by the link's margin, and the part gives it to the text, the element owning one of its two glyphs, 2608.25210v2-zh.
    // Paired as the order rule below pairs (each, each run of one target, or all to one piece), else left to it)
    const byOrder = new Map<number, number>()
    const taken = new Set<number>()
    // (the tier that gave an element each of its annotations: its geometry, the part's owner, else this order; one paired by
    // order alone is never laid over the whole piece where its characters are not found, placeText)
    const tierOf = new Map<number, string>()
    const tier = (i: number) => tierOf.get(i) ?? 'geometry'
    for (const kind of ['note', 'internal'] as const) {
      const as = text.filter((i) => kindOf(list[i]!.to) === kind && !named.has(key(list[i]!.to)))
      if (!as.length) continue
      const pieces = [
        ...[...els]
          .filter(([id, e]) => elKindOf(e) === kind && !(byEl.get(id) ?? []).some((i) => kindOf(list[i]!.to) === kind))
          .map(([id]) => ({ id: Number(id), el: id as string | null })),
        ...(kind === 'internal'
          ? groupsOf.filter(([, x, cmd]) => x === null && REF_CMD.test(cmd)).map(([id]) => ({ id, el: null }))
          : []),
      ].sort((a, b) => a.id - b.id)
      const runs = runsOf(as, list)
      const to = (i: number, p: (typeof pieces)[number]) => {
        tierOf.set(i, 'order')
        if (p.el !== null)
          byEl.set(
            p.el,
            [...(byEl.get(p.el) ?? []), i].sort((a, b) => rank.get(a)! - rank.get(b)!),
          )
        else {
          byOrder.set(i, p.id)
          taken.add(p.id)
        }
      }
      const oneTarget = runs.every((r) => key(list[r[0]!]!.to) === key(list[runs[0]![0]!]!.to))
      if (!pieces.length) continue
      if (pieces.length === as.length) for (const [j, i] of as.entries()) to(i, pieces[j]!)
      else if (pieces.length === runs.length)
        for (const [j, run] of runs.entries()) for (const i of run) to(i, pieces[j]!)
      else if (pieces.length === 1 && oneTarget) for (const i of as) to(i, pieces[0]!)
      else continue
      text = text.filter((i) => !as.includes(i) || byOrder.has(i))
    }
    for (const [id, owns] of byEl) {
      const crop = crops.get(id),
        k = texts.get(id)
      const e = els.get(id)
      // (its ink stays where it stands, however it is drawn: a display, kept by the part or in place by the reading, or the
      // member's elements' group on (none moved, or a group the add-on could not part, Placed.fixed) on the annotation's own page,
      // which the translation may set the element off: the original's anchor stays with it, #626's review)
      const stays = (i: number) => !e || !!e.keep || e.kind === 'display' || kept.has(id) || !(offOn(pageOf(i)) & 2)
      for (const i of owns.filter(stays)) atBox(i, 'kept')
      const is = owns.filter((i) => !stays(i))
      if (!is.length) continue
      if (crop !== undefined) {
        // (over its crop where the page draws one, else another page of the member draws it)
        if (cropsOn.get(id)!.has(page))
          groups.push({ to: { k: crop, draw: 'crop' }, annots: is.map((i) => ({ ...annot(i), tier: tier(i) })) })
        else for (const i of is) fate(i, 'away')
      } else if (k !== undefined) {
        // (over the characters it is drawn as: each annotation over its own characters among them where the part states them
        // (Link.text, PDF.js's overlaidText: today's placeText), the piece's annotations in one group, so that one search, moving
        // forward only, takes them in their order on A whatever their targets (the same text twice, two works: each its own
        // occurrence, #631's review); where it does not (a part made before), the annotations of one target over their whole,
        // those of two or more targets none, not told apart)
        if (is.every((i) => !!list[i]!.text))
          groups.push({
            to: { k, draw: 'text', single: is.length === 1 },
            annots: is.map((i) => ({ ...annot(i), tier: tier(i) })),
          })
        else if (new Set(is.map((i) => key(list[i]!.to))).size === 1) {
          groups.push({ to: { k, draw: 'text', single: true }, annots: [{ ...annot(is[0]!), tier: tier(is[0]!) }] })
          for (const i of is.slice(1)) fate(i, 'text')
        } else for (const i of is) fate(i, 'targets')
      } else for (const i of is) fate(i, here(i) ? 'off' : 'away')
    }
    if (text.length) {
      for (const i of text) fate(i, 'unmatched')
      // (the member's annotations over its text in their order on A (inReading), over all its pages: the part holds them on
      // every page of the member, those of its other pages with their page, and the member's lines run over its pages in order;
      // its link groups in their source's order, `groupsOf`)
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
      for (const x of named) {
        const as = text.filter((i) => addr(i) === x)
        if (as.length)
          inOrder(
            as,
            groupsOf.filter(([, y]) => y === x).map(([id]) => id),
            x[0] === 'u' ? 'url' : 'key',
          )
      }
      // (the order tier by kind's pairs with \hyperref groups, each group with its annotations)
      const byGroup = new Map<number, number[]>()
      for (const [i, id] of byOrder) byGroup.set(id, [...(byGroup.get(id) ?? []), i])
      for (const [id, run] of byGroup) pair(id, run, 'order')
      // (then by order what no target decides: the annotations of a target no group names (none named: a part made before
      // SpanAt.to) with the groups that name none (a \hyperref, whose destination is its label's anchor), over the member, else
      // by those drawn on the page and the page's own annotations)
      const rest = text.filter((i) => !named.has(addr(i)) && !byOrder.has(i))
      const bare = groupsOf.filter(([id, x]) => x === null && !taken.has(id)).map(([id]) => id)
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
        // (matchUnit's whole tier, where no group of the member is drawn on the page: wholeOf)
        const holding = wholeOf(ours, list, m, page)
        if (holding)
          groups.push({
            to: { draw: 'whole', own: [] },
            annots: holding.map((i) => ({ ...annot(i), tier: 'whole' })),
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
      const { to, border } = list[r.sources.annots[0]![1]]!
      const b = r.rec.boxes
      for (let j = 0; j + 3 < b.length; j += 4)
        out.push(drawnOf([b[j]!, b[j + 1]!, b[j + 2]!, b[j + 3]!], to, ord, border))
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
 * nearest its box's middle), then at its box's start along that line in the line's writing direction: its left edge, its right
 * edge on a line the part states set right to left (LINE_FLAG.RTL, the unit's paragraph direction), whose first link is its
 * rightmost (Codex on #634: sorted left to right, an Arabic or Hebrew line's two links of one address paired with its groups the
 * other way round); the PDF's annotation array, whose order the part's list keeps, need not be TeX's (#626's review: two \href
 * groups listed right to left). An annotation of no line of the member (none on its page) comes after those that have one, by its
 * page, then its place in the list.
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
    at.set(i, line < 0 ? [lines.length, 0] : [line, lines[line]![9] & LINE_FLAG.RTL ? -x1 : x0])
  }
  const of = (i: number) => at.get(i)!
  return [...ids].sort((a, b) => of(a)[0] - of(b)[0] || of(a)[1] - of(b)[1] || pageOf(a) - pageOf(b) || a - b)
}

/** matchUnit's whole tier: of annotations `ids` of member `m`'s text, those of the one target that hold every own glyph of it on
 *  page `page`: as the part states it (Link.whole, by glyph point, as today's), else (a part made before) where each of its lines'
 *  ink is inside one of their boxes, its baseline between their edges; null where no target or more than one does */
function wholeOf(ids: readonly number[], list: readonly Link[], m: Placed, page: number): number[] | null {
  const mine = m.lines.filter((l) => l[0] === page && !(l[9] & LINE_FLAG.KEPT))
  const byTarget = new Map<string, number[]>()
  for (const i of ids) byTarget.set(key(list[i]!.to), [...(byTarget.get(key(list[i]!.to)) ?? []), i])
  const holding = [...byTarget.values()].filter(
    (is) =>
      is.some((i) => list[i]!.whole) ||
      (mine.length > 0 &&
        mine.every((l) =>
          is.some((i) => {
            const b = list[i]!.box
            return l[2] >= b[0] && l[3] <= b[2] && l[4] > b[1] && l[4] < b[3]
          }),
        )),
  )
  return holding.length === 1 ? holding[0]! : null
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
