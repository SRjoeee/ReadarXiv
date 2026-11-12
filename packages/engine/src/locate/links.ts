// Phase 15 of locate (PHASES, locate.ts): the links, A's annotations, each owned by the member (and within it the element) that
// owns most of the glyphs under it.
// Reads: the index, the options' annotations; the record's `members` (their lines and elements) and `claimedA` (a glyph's owner).
// Writes: `links` (assigned: read by close).
import type { LinkBorder } from '@readarxiv/format'
import { r2 } from './lines.ts'
import { assign, type Located, type LocateOptions, type Member, type Work } from './work.ts'

export function linksOnA(w: Work, o: LocateOptions): void {
  const { inkA, m, pageA } = w.ix
  const { members, claimedA } = w
  // ---- links: A's annotations, each owned by the member that owns most of the glyphs under it (today's links.mjs ownersOf: the
  // unit whose rectangles hold more than half of its glyph points; by exact ownership, the member that owns more than half of
  // them), and within it by the element that owns more than half of them, else its text; where its label's glyphs are more than
  // half of them, its text's stated as the label's (`label`: the add-on wraps the label in a group of its own, which stays on
  // where the label is not drawn anew, as its link may: today's freeze keeps a link no match took whose glyphs no operation of
  // the page erased). A glyph point is a glyph's advance centre on its baseline strictly inside the annotation's rectangle or one
  // of its quads (PDF.js's overlaidText rule, today's pointsOf). A link over no glyph: the member one of whose lines or elements
  // holds its rectangle's centre. The annotations of one target a member owns on a page that hold, together, every glyph of its
  // text's and its elements' there are stated so (`whole`: today's whole tier, links.mjs:426, every own character of the unit's
  // the drawing replaces under them, by glyph point; a line's ink is no measure of it, its last glyph's ink past the link's box)
  const links: Located['links'] = new Map()
  ;(o.annotations ?? []).forEach((list, p) => {
    if (!list?.length) return
    const out: NonNullable<ReturnType<typeof links.get>> = []
    const pg = inkA.pages[p]!
    const off = m.offA[p] as number
    // (each annotation's glyph points and the member that owns it, by its place in `out`)
    const under: { pts: number[]; mem: Member | undefined }[] = []
    for (const an of list as {
      annotationType?: number
      rect?: number[]
      quadPoints?: ArrayLike<number> | null
      url?: string
      unsafeUrl?: string
      dest?: unknown
      borderStyle?: { width?: number; style?: number }
      borderColor?: ArrayLike<number> | null
    }[]) {
      if (an.annotationType !== 2 || !Array.isArray(an.rect) || an.rect.length !== 4) continue
      const to =
        (an.url ?? an.unsafeUrl)
          ? { url: String(an.url ?? an.unsafeUrl) }
          : an.dest !== undefined
            ? { dest: JSON.stringify(an.dest) }
            : null
      if (!to) continue
      const [x0, y0, x1, y1] = an.rect.map(r2) as [number, number, number, number]
      const boxes = quadBoxesOf(an.quadPoints) ?? [
        [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)],
      ]
      const inside = (x: number, y: number) => boxes.some((b) => x > b[0] && x < b[2] && y > b[1] && y < b[3])
      const pts: number[] = []
      pg.glyphs.forEach((g, j) => {
        if (/\S/.test(g.u) && inside((g.x0 + g.x1) / 2, g.y)) pts.push(off + j)
      })
      let owner: [number, string] | undefined
      let label = false
      let owning: Member | undefined
      if (pts.length) {
        const by = new Map<number, number>()
        for (const a of pts)
          if ((claimedA[a] as number) >= 0) by.set(claimedA[a] as number, (by.get(claimedA[a] as number) ?? 0) + 1)
        const top = [...by].find(([, n]) => 2 * n > pts.length)
        if (top) {
          const mem = members[top[0]]!
          owning = mem
          const els = [...mem.els].map(([id, l]) => [id, pts.filter((a) => l.includes(a)).length] as const)
          const el = els.find(([, n]) => 2 * n > pts.length)
          owner = [mem.ord, el ? el[0] : '']
          label = !el && 2 * pts.filter((a) => mem.label.includes(a)).length > pts.length
        }
      } else {
        const cx = (x0 + x1) / 2
        const cy = (y0 + y1) / 2
        const holds = (a: number, b: number, c: number, d: number) => cx >= a && cx <= c && cy >= b && cy <= d
        for (const mem of members) {
          if (!mem.pages.includes(p + 1)) continue
          const el = mem.elements.find(([, e]) => e.ink.some((k) => k[0] === p + 1 && holds(k[1], k[2], k[3], k[4])))
          if (el) owner = [mem.ord, el[0]]
          else if (mem.lines.some((l) => l[0] === p + 1 && holds(l[2], l[6], l[3], l[5]))) owner = [mem.ord, '']
          if (owner) {
            owning = mem
            break
          }
        }
      }
      // (the characters of the glyphs under it, its glyph points' in their order: today's annotation's own (links.mjs g2.ch, which
      // its placeText finds among a piece's drawn characters where PDF.js's overlaidText is not read: the server's reading
      // skips it, pdf-lite.mjs's text guard)
      const text = pts.map((a) => pg.glyphs[a - off]!.u).join('')
      const border = borderOf(an)
      out.push({
        box: [x0, y0, x1, y1],
        to,
        ...(owner ? { owner } : {}),
        ...(text ? { text } : {}),
        ...(label ? { label: 1 as const } : {}),
        ...(border ? { border } : {}),
      })
      under.push({ pts, mem: owning })
    }
    const byTarget = new Map<string, number[]>()
    out.forEach((l, k) => {
      if (!l.owner) return
      const key = `${l.owner[0]}|${JSON.stringify(l.to)}`
      byTarget.set(key, [...(byTarget.get(key) ?? []), k])
    })
    for (const ks of byTarget.values()) {
      const mem = under[ks[0]!]!.mem
      if (!mem) continue
      const held = new Set(ks.flatMap((k) => under[k]!.pts))
      const own = [...mem.text, ...[...mem.els.values()].flat()].filter(
        (a) => pageA[a] === p + 1 && /\S/.test(pg.glyphs[a - off]!.u),
      )
      if (own.length && own.every((a) => held.has(a))) for (const k of ks) out[k]!.whole = 1
    }
    if (out.length) links.set(p + 1, out)
  })
  assign(w, 'links', links)
}

/** a link annotation's border as PDF.js's annotation layer draws it (the original's pane): its width where above 0 (its /BS /W,
 *  else its /Border's, as PDF.js reads them: none where neither is), its colour (PDF.js's borderColor: a link's /C, null for /C
 *  [], black where it has none), its style (PDF.js's AnnotationBorderStyleType: 2 dashed, 5 underline, any other solid, today's
 *  layer-proto/links.mjs annotsOf). None where the width or the colour is none: PDF.js draws none */
function borderOf(an: {
  borderStyle?: { width?: number; style?: number }
  borderColor?: ArrayLike<number> | null
}): LinkBorder | undefined {
  const w = r2(Number(an.borderStyle?.width))
  const c = an.borderColor
  if (!(w > 0) || !Number.isFinite(w) || !c || c.length !== 3) return undefined
  const rgb = ((c[0]! & 255) << 16) | ((c[1]! & 255) << 8) | (c[2]! & 255)
  const style = an.borderStyle?.style
  return style === 2 ? [w, rgb, 'dashed'] : style === 5 ? [w, rgb, 'underline'] : [w, rgb]
}
/** an annotation's quads (PDF.js's quadPoints, eight numbers a quad) as boxes, null where it has none or they are ill formed
 *  (today's links.mjs quadBoxes) */
function quadBoxesOf(q: ArrayLike<number> | null | undefined): [number, number, number, number][] | null {
  if (!q || typeof q.length !== 'number' || !q.length) return null
  const flat = Array.from(q)
  if (flat.length % 8 || !flat.every(Number.isFinite)) return null
  const out: [number, number, number, number][] = []
  for (let i = 0; i < flat.length; i += 8) {
    const xs = [flat[i]!, flat[i + 2]!, flat[i + 4]!, flat[i + 6]!]
    const ys = [flat[i + 1]!, flat[i + 3]!, flat[i + 5]!, flat[i + 7]!]
    out.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)])
  }
  return out
}
