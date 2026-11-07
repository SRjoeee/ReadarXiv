// Page.links (design-a §1.2: the page's links as drawn, moved with their pieces, else at A's boxes; D.links, design-b §1.6 E1):
// A's annotations on the page (Part.links), each with the member and the piece that holds it as the prepare states them
// (locate's ownership: the member that owns more than half of the glyphs under it, within it the element that does, else its
// text), placed as today's linkUnit and freezeLinks place them (RUN:1044-1128, links.mjs placeUnit, freezeLinks):
// - one whose ink stays, at A's box: no owner, its owner not laid on the page (the original's, waiting, a table held), or its
//   piece kept where it stands (a display, an element the part keeps, one the reading keeps in place, the member's elements'
//   group on);
// - one over a piece of a laid member, moved with what is drawn of it on the page (placeUnit): over a crop of it by the crop's
//   own map (placeCrop), over the characters it is drawn as (placeText: the whole of them, the part stating no annotation's
//   characters under it; the annotations of one target over it one link); one over the member's text, over the translation of
//   its \href's group (placePair: the k-th run of one target's annotations the k-th group of the member's drawn on the page,
//   as matchUnit's order tier pairs them; one group takes them all where they are of one target), else, where the member has
//   no such group drawn, over its whole drawing where one target's annotations hold every line of it on the page (matchUnit's
//   whole tier, its every own character under them: each line's ink inside one of their boxes, its baseline between their
//   edges);
// - any other is dropped (its ink is turned off and nothing of it is drawn on the page: a link left at A's box would open from
//   the translation's text over it, today's freezeLinks drops it alike).
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

const LINK_CMD = /^(?:href|hyperref|hyperlink)$/
type Tok = {
  s?: string
  space?: boolean
  crop?: { k?: number | null }
  k?: number
  ph?: unknown
  st?: { link?: unknown }
}
const key = (to: Link['to']) => ('url' in to ? `u${to.url}` : `d${to.dest}`)

/** what became of each of a part's links (the gate's count): at A's box with no owner, its owner not laid or its piece kept
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
  const byOwner = new Map<number, number[]>()
  list.forEach((l, i) => {
    const x = l.owner ? laid.get(l.owner[0]) : undefined
    if (!x) {
      out.push([l.box, l.to])
      fate(i, l.owner ? 'unlaid' : 'free')
    } else byOwner.set(l.owner![0], [...(byOwner.get(l.owner![0]) ?? []), i])
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
      return { q: page, a }
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
      if (crop !== undefined)
        groups.push({ to: { k: crop, draw: 'crop' }, annots: is.map((i) => ({ ...annot(i), tier: 'geometry' })) })
      else if (k !== undefined) {
        // (over the characters it is drawn as: each annotation over its own characters among them where the part states them
        // (Link.text, PDF.js's overlaidText: today's placeText); where it does not (a part made before), the annotations of one
        // target over their whole, those of two or more targets none, not told apart)
        if (is.every((i) => !!list[i]!.text))
          groups.push({
            to: { k, draw: 'text', single: is.length === 1 },
            annots: is.map((i) => ({ ...annot(i), tier: 'geometry' })),
          })
        else if (new Set(is.map((i) => key(list[i]!.to))).size === 1) {
          groups.push({ to: { k, draw: 'text', single: true }, annots: [{ ...annot(is[0]!), tier: 'geometry' }] })
          for (const i of is.slice(1)) fate(i, 'text')
        } else for (const i of is) fate(i, 'targets')
      } else {
        const e = els.get(id)
        // (its ink stays: a display, kept by the part or in place by the reading, or the member's elements' group on)
        const stays = !e || e.keep || e.kind === 'display' || kept.has(id) || !(off & 2)
        for (const i of is) {
          if (stays) out.push([list[i]!.box, list[i]!.to])
          fate(i, stays ? 'kept' : 'off')
        }
      }
    }
    if (text.length) {
      for (const i of text) fate(i, 'unmatched')
      const runs = runsOf(text, list)
      const drawn = (m.spans ?? [])
        .filter(([, s]) => LINK_CMD.test(s.cmd ?? ''))
        .map(([id]) => Number(id))
        .filter((id) => pairs.has(id))
        .sort((a, b) => a - b)
      const pair = (id: number, run: number[]) =>
        groups.push({ to: { pair: id, draw: 'pair' }, annots: run.map((i) => ({ ...annot(i), tier: 'order' })) })
      if (drawn.length && drawn.length === runs.length) runs.forEach((run, j) => void pair(drawn[j]!, run))
      else if (
        drawn.length === 1 &&
        runs.length &&
        runs.every((r) => key(list[r[0]!]!.to) === key(list[runs[0]![0]!]!.to))
      )
        pair(drawn[0]!, runs.flat())
      else if (!drawn.length && drawsText) {
        // (matchUnit's whole tier: one target's annotations over every line of the member on the page)
        const mine = m.lines.filter((l) => l[0] === page && !(l[9] & 1))
        const byTarget = new Map<string, number[]>()
        for (const i of text) byTarget.set(key(list[i]!.to), [...(byTarget.get(key(list[i]!.to)) ?? []), i])
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
