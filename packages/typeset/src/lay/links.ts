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
//   its \href's or \url's group (placePair, as matchUnit's order tier pairs them: the k-th annotation the k-th group of the
//   member's drawn on the page where they are as many, else the k-th run of one target's annotations; one group takes them all
//   where they are of one target), else, where the member has no such group drawn, over its whole drawing where one target's
//   annotations hold every line of it on the page (matchUnit's whole tier, its every own character under them: each line's ink
//   inside one of their boxes, its baseline between their edges);
// - any other is dropped (its ink is turned off and nothing of it is drawn on the page: a link left at A's box would open from
//   the translation's text over it, today's freezeLinks drops it alike).
// An annotation of a member's other page (Link.page: the part holds those of its members on every page they have lines on) is
// drawn here only over what of its piece the page draws (a translation sets a member's text on whichever of its pages it falls),
// never at its box, which is its own page's (`away`); a member's \href groups are paired with its annotations of all its pages.
import type { Link, Part, Placed } from '@readarxiv/format'
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
const key = (to: Link['to']) => ('url' in to ? `u${to.url}` : `d${to.dest}`)

/** what became of each of a part's links (the gate's count; `away` one of another page not drawn here): at A's box with no owner, its owner not laid or its piece kept
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
    if (here(i)) out.push([list[i]!.box, list[i]!.to])
    fate(i, here(i) ? f : 'away')
  }
  const byOwner = new Map<number, number[]>()
  list.forEach((l, i) => {
    const x = l.owner ? laid.get(l.owner[0]) : undefined
    if (!x) atBox(i, l.owner ? 'unlaid' : 'free')
    else byOwner.set(l.owner![0], [...(byOwner.get(l.owner![0]) ?? []), i])
  })
  for (const [ord, ids] of byOwner) {
    const { m, layout: L, off, kept, elOf } = laid.get(ord)!
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
      // (the member's annotations over its text in their order, its pages' order first: the part holds them on every page of
      // the member, those of its other pages with their page)
      text.sort((x, y) => (list[x]!.page ?? page) - (list[y]!.page ?? page) || x - y)
      const runs = runsOf(text, list)
      const groupsOf = (m.spans ?? [])
        .filter(([, s]) => LINK_CMD.test(s.cmd ?? ''))
        .map(([id]) => Number(id))
        .sort((a, b) => a - b)
      const drawn = groupsOf.filter((id) => pairs.has(id))
      const ours = text.filter(here)
      const pair = (id: number, run: number[]) => {
        if (pairs.has(id))
          groups.push({ to: { pair: id, draw: 'pair' }, annots: run.map((i) => ({ ...annot(i), tier: 'order' })) })
        else for (const i of run) if (!here(i)) fate(i, 'away')
      }
      const oneTarget = (rs: number[][]) =>
        rs.length > 0 && rs.every((r) => key(list[r[0]!]!.to) === key(list[rs[0]![0]!]!.to))
      // (each \href group of the member's, in its source's order, with its occurrence among its annotations: each annotation an
      // occurrence where they are as many as its groups (two links to one address one after the other are one run of one
      // target, #626's review), else each run of one target a group (a link TeX broke over lines is one run), else one group
      // takes all of one target; placed where the group is drawn on the page)
      if (groupsOf.length && groupsOf.length === text.length) text.forEach((i, j) => void pair(groupsOf[j]!, [i]))
      else if (groupsOf.length && groupsOf.length === runs.length)
        runs.forEach((run, j) => void pair(groupsOf[j]!, run))
      else if (groupsOf.length === 1 && oneTarget(runs)) pair(groupsOf[0]!, runs.flat())
      // (else by the groups drawn on the page and the page's own annotations, as before the part held the others)
      else if (drawn.length && drawn.length === ours.length) ours.forEach((i, j) => void pair(drawn[j]!, [i]))
      else if (drawn.length && drawn.length === runsOf(ours, list).length)
        runsOf(ours, list).forEach((run, j) => void pair(drawn[j]!, run))
      else if (drawn.length === 1 && oneTarget(runsOf(ours, list))) pair(drawn[0]!, ours)
      else if (!drawn.length && drawsText) {
        // (matchUnit's whole tier: one target's annotations over every line of the member on the page)
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
    const placed = placeUnit({
      groups,
      lines,
      edge: (line: LaidLine, run: TextRun, at: number) => runEdge(run, at, line, L, w100),
      band: (t: unknown, line: LaidLine) =>
        tokenBand(t as never, (line.seg as { f: number } | undefined) ?? L, line.baseline),
      scale: L.scale,
    })
    const drawOf = new Map(groups.flatMap((g) => g.annots.map((c) => [c.a.i, g.to.draw as LinkFate] as const)))
    for (const t of placed.tried) fate(t.i, 'unplaced')
    for (const r of placed.records) {
      for (const [, i] of r.sources.annots) fate(i, drawOf.get(i) ?? 'unplaced')
      const to = list[r.sources.annots[0]![1]]!.to
      const b = r.rec.boxes
      for (let j = 0; j + 3 < b.length; j += 4) out.push([[b[j]!, b[j + 1]!, b[j + 2]!, b[j + 3]!], to])
    }
  }
  return out
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
