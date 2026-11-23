// Phase 15 of locate (locate.ts): the links, A's annotations, each owned by the member (and within it the element) that
// owns most of the glyphs under it.
// Reads: the index, the options' annotations; the record's `members` (their lines and elements); the ownership (a glyph's owner).
// Writes: `links` (assigned: read by close).
import type { LinkBorder } from '@readarxiv/format'
import { type Annotation, annotationOf, pointsOf } from './annotations.ts'
import { r2 } from './lines.ts'
import type { Owned } from './ownership.ts'
import { assign, type Located, type LocateOptions, type Member, type Work } from './work.ts'

export function linksOnA(w: Work, owned: Owned, o: LocateOptions, held: readonly { mem: Member }[] = []): void {
  const { inkA, m, pageA } = w.ix
  const { members } = w
  // (the turned glyphs of the units held to be framed (turned-frames.ts holdTurned), by page: each one's member and its piece (an
  // element's id, '' its text, null its label's), which no level glyph point tells: an annotation over a sideways caption's
  // reference holds turned glyphs alone)
  const turnedOwner = new Map<number, Map<number, [Member, string | null]>>()
  for (const { mem } of held) {
    const set = (ap: number, aj: number, piece: string | null) => {
      const on = turnedOwner.get(ap) ?? turnedOwner.set(ap, new Map()).get(ap)!
      on.set(aj, [mem, piece])
    }
    for (const [ap, aj] of mem.turned) set(ap, aj, '')
    for (const [id, l] of mem.turnedEls) for (const [ap, aj] of l) set(ap, aj, id)
    for (const [ap, aj] of mem.turnedLabel) set(ap, aj, null)
  }
  // ---- links: A's annotations, each owned by the member that owns most of the glyphs under it (by exact ownership, the member
  // that owns more than half of its glyph points), and within it by the element that owns more than half of them, else its
  // text; where its label's glyphs are more than
  // half of them, its text's stated as the label's (`label`: the add-on wraps the label in a group of its own, which stays on
  // where the label is not drawn anew, as its link may: the typesetter keeps a link no match took whose glyphs no operation of
  // the page erased). A glyph point is a glyph's advance centre on its baseline strictly inside the annotation's rectangle or one
  // of its quads (PDF.js's overlaidText rule, pointsOf). A link over no glyph: the member one of whose lines or elements
  // holds its rectangle's centre. The annotations of one target a member owns on a page that hold, together, every glyph of its
  // text's and its elements' there are stated so (`whole`: every own character of the unit's
  // the drawing replaces under them, by glyph point; a line's ink is no measure of it, its last glyph's ink past the link's box)
  const links: Located['links'] = new Map()
  ;(o.annotations ?? []).forEach((list, p) => {
    if (!list?.length) return
    const out: NonNullable<ReturnType<typeof links.get>> = []
    const pg = inkA.pages[p]!
    const off = m.offA[p] as number
    // (each annotation's glyph points and the member that owns it, by its place in `out`)
    const under: { pts: number[]; mem: Member | undefined }[] = []
    for (const an of list as Annotation[]) {
      const read = annotationOf(an)
      if (!read) continue
      const { to } = read
      const [x0, y0, x1, y1] = read.rect
      const pts = pointsOf(pg.glyphs, read).map((j) => off + j)
      let owner: [number, string] | undefined
      let label = false
      let owning: Member | undefined
      if (pts.length) {
        const by = new Map<number, number>()
        for (const a of pts) {
          const c = owned.member(a)
          if (c >= 0) by.set(c, (by.get(c) ?? 0) + 1)
        }
        const top = [...by].find(([, n]) => 2 * n > pts.length)
        if (top) {
          const mem = members[top[0]]!
          owning = mem
          const els = [...mem.els].map(([id, l]) => [id, pts.filter((a) => l.includes(a)).length] as const)
          const el = els.find(([, n]) => 2 * n > pts.length)
          owner = [mem.ord, el ? el[0] : '']
          label = !el && 2 * pts.filter((a) => mem.label.includes(a)).length > pts.length
        }
      }
      // (one over turned glyphs alone: the held member that owns more than half of their glyph points (each turned glyph's
      // advance centre on its baseline, white space aside, strictly inside one of its boxes, as pointsOf reads a level glyph's),
      // within it the element that does, else its text (its label's where they are more than half): read by its frame later,
      // and its characters the annotation's own)
      let turnedText = ''
      const T = pg.turned ?? []
      const turnedOn = turnedOwner.get(p + 1)
      if (!pts.length && turnedOn) {
        const inside = (x: number, y: number) => read.boxes.some((b) => x > b[0] && x < b[2] && y > b[1] && y < b[3])
        const tps = [...turnedOn.keys()]
          .sort((a, b) => a - b)
          .filter((j) => /\S/.test(T[j]!.u) && inside((T[j]!.ox + T[j]!.ex) / 2, (T[j]!.oy + T[j]!.ey) / 2))
        const by = new Map<Member, [string | null, number][]>()
        for (const j of tps) {
          const [mem, piece] = turnedOn.get(j)!
          ;(by.get(mem) ?? by.set(mem, []).get(mem)!).push([piece, j])
        }
        const top = [...by].find(([, l]) => 2 * l.length > tps.length)
        if (top) {
          const [mem, l] = top
          const count = new Map<string | null, number>()
          for (const [piece] of l) count.set(piece, (count.get(piece) ?? 0) + 1)
          const el = [...count].find(([piece, n]) => typeof piece === 'string' && piece !== '' && 2 * n > tps.length)
          owner = [mem.ord, el ? (el[0] as string) : '']
          label = !el && 2 * (count.get(null) ?? 0) > tps.length
          owning = mem
          turnedText = tps.map((j) => T[j]!.u).join('')
        }
      }
      if (!pts.length && !owner) {
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
      // (the characters of the glyphs under it, its glyph points' in their order: the annotation's own (Link.text, which the
      // typesetter's placeText finds among a piece's drawn characters where PDF.js's overlaidText is not read: the server reading
      // skips it, compile/pdf-lite.ts's text guard)
      const text = pts.map((a) => pg.glyphs[a - off]!.u).join('') || turnedText
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
 *  [], black where it has none), its style (PDF.js's AnnotationBorderStyleType: 2 dashed, 5 underline, any other solid).
 *  None where the width or the colour is none: PDF.js draws none */
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
