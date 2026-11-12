// A's geometry of each member, phases 6, 8 and 10 of locate (PHASES, locate.ts).
// Phase 6, lineGeometry: each member's lines on A (its text's, a display's rows, its held lines), its style, its lead, its
// elements' ink, text and copy, its trail's element, its label. Reads the index, the record's `members`, `units`, `claimedA` (a
// held line's glyphs are no member's), `jointPiece` (phase 4's) and `trailSep` (phase 2's); writes the members' lines, line
// glyphs, pages, style, lead, read facts, elements, asInk, smallCaps, label, span fills and faces, plain text and counter.
import type { El, Ink, Label, Line, Piece } from '@readarxiv/format'
import type { DocGlyph } from '../doc.ts'
import { ROLE } from '../instrument.ts'
import {
  bracketsOf,
  elementCase,
  fakedCaps,
  fillRunsOf,
  joinAccents,
  type StyleGlyph,
  sourceText,
  styleOf,
  TRAIL,
  textOf,
  turnedStyleGlyph,
  unitSize,
  urlCopyOf,
} from './facts.ts'
import { groupStyleOf, hasScopes, namesFace } from './group-style.ts'
import { groupStyleOf as commandStyleOf } from './ink.ts'
import { type CutLine, cutLines, isInk, lineSize, r2 } from './lines.ts'
import { type RowBox, rowsOf } from './rows.ts'
import { regionsOf } from './today/today.types.ts'
import { field, INKED_CLASSES, piecesOf, standsOn, type Work } from './work.ts'

/** an element kind whose glyphs are a reading of it: its text is stated */
const TEXT_KINDS = new Set(['cite', 'ref', 'eqref', 'url', 'number', 'footnote', 'macro'])
/** the classes the typesetter draws as the page's text (drawnAs L2:1757: a citation, a reference, a macro) */
const TEXT_CLASSES = new Set(['cite', 'num', 'macro', 'umacro'])
const LABEL_KIND: Record<string, Label['kind']> = {
  caption: 'float',
  heading: 'head',
  theorem: 'head',
  footnote: 'mark',
  // (a babel name's: the number a class set right before a heading it sets itself, the wrap's `n<occ>.l` (own.mjs MR 6c),
  // a heading's number as a section's is: 2610.20967v1's "9. REFERENCES")
  name: 'head',
}

const mostOf = <T>(xs: Iterable<T>): T | undefined => {
  const n = new Map<T, number>()
  let best: T | undefined
  let k = 0
  for (const x of xs) {
    const c = (n.get(x) ?? 0) + 1
    n.set(x, c)
    if (c > k) {
      k = c
      best = x
    }
  }
  return best
}

/** how far apart two baselines are told (PDF units): a line's is stated to a hundredth, its glyphs' on A as the PDF wrote them */
const ON_BASE = 0.05

export function lineGeometry(w: Work): void {
  const { ins, B, inkA, m, pageA, pageB, placeSpan, unitB, roleB, emptyPiece, outsidePiece, gA, atA } = w.ix
  const { members, units, claimedA, jointPiece } = w
  const trailSep = field(w, 'trailSep')
  /** A's boxes ([page, index]) as rows.ts takes them */
  const boxesOf_ = (l: readonly [number, number][]): RowBox[] =>
    l.map(([ap, ai]) => {
      const b = inkA.pages[ap - 1]!.boxes
      return { page: ap, x0: b[4 * ai]!, y0: b[4 * ai + 1]!, x1: b[4 * ai + 2]!, y1: b[4 * ai + 3]! }
    })
  // (each B glyph's region by B's brackets, stream.mjs regionsOf's: a float's depth, a column's body or not; read once a page)
  const regionsB = new Map<number, Int32Array>()
  const regionB = (b: number): number => {
    const p = (pageB[b] as number) - 1
    let r = regionsB.get(p)
    if (!r) {
      const pg = B.pages[p]!
      r = regionsOf({ glyphs: { n: pg.glyphs.length }, boxes: pg.boxes, points: pg.points }).glyph as Int32Array
      regionsB.set(p, r)
    }
    return r[b - (m.offB[p] as number)] as number
  }
  // (each unit's \baselineskip where its paragraph ends, LINES_TEX's AXT-LINES: its members' lead)
  const texSkip = new Map((ins.tex.skips ?? []).map((k) => [k.unit, k.baselineskip]))
  // ---- geometry: lines, columns and measures, elements, labels, style, lead, room
  for (const mem of members) {
    if (!mem.located && !mem.text.length) continue
    const unit = mem.unit >= 0 ? units[mem.unit]! : null
    const pieces = unit ? piecesOf(unit.content) : new Map<string, Piece>()
    const kindOf = (id: string) => (pieces.get(id) as { kind?: string } | undefined)?.kind ?? 'other'
    // (an element whose rows stay where TeX set them: a display, and a group of one pitch TeX set on lines of its own)
    const rowsKept = (id: string) => kindOf(id) === 'display' || !!mem.ownRows?.has(id)
    const classOf = new Map(unit?.classes ?? [])
    // (an element whose ink stands apart from the unit's text lines: outside the unit (B11 OUTSIDE), kept where it stands
    // and no line of the unit's)
    const textCut = cutLines(
      [...mem.text].sort((x, y) => x - y),
      atA,
    )
    const outside = new Set<string>()
    if (textCut.length)
      for (const [id, l] of mem.els)
        if (
          !rowsKept(id) &&
          l.length &&
          // (beside its text lines: within two sizes over their first and under their last on a page, a line of formulas alone at
          // its end or a script between two of them; outside, only ink apart from all of them: a mark set in a margin, a float)
          l.every((a) => {
            const g = gA(a)
            const on = textCut.filter((t) => t.page === pageA[a])
            return (
              !on.length ||
              g.y > Math.max(...on.map((t) => t.top)) + 2 * g.size ||
              g.y < Math.min(...on.map((t) => t.bottom)) - 2 * g.size
            )
          })
        )
          outside.add(id)
    const inline: number[] = [...mem.text]
    for (const [id, l] of mem.els) if (!rowsKept(id) && !outside.has(id)) inline.push(...l)
    inline.sort((x, y) => x - y)
    const cut = cutLines(inline, atA)
    // (the lines whose ink stays, KEPT, in their place in the stream: a display's rows; and a held line, the glyphs inside its
    // span on A that B printed and no unit owns: the lines its source does not write (B17; today's heldOf MAKE:1855 read them
    // by the source's words, under a 0.2 share: ownership says it))
    // (a display's rows by rows.ts: its ink's bands joined where its glyphs interleave in the stream, never the text line rule,
    // which cuts a row's stacked parts apart)
    const kept: CutLine[] = []
    const displayRows = new Map<string, CutLine[]>()
    for (const [id, l] of mem.els)
      if (rowsKept(id)) {
        const rows = rowsOf(l, atA, boxesOf_(mem.elBoxes.get(id) ?? []))
        displayRows.set(id, rows)
        kept.push(...rows)
      }
    if (inline.length && unit) {
      const own = [...inline, ...mem.label].sort((x, y) => x - y)
      // (within its own lines' extent on each page: a page's furniture, a float the stream passes between two of its lines
      // on another part of the page, are none of its)
      const box = new Map<number, [number, number, number, number]>()
      for (const l of cut) {
        const q = box.get(l.page)
        box.set(
          l.page,
          q
            ? [Math.min(q[0], l.x0), Math.min(q[1], l.bottom), Math.max(q[2], l.x1), Math.max(q[3], l.top)]
            : [l.x0, l.bottom, l.x1, l.top],
        )
      }
      const held: number[] = []
      // (a float TeX set inside the paragraph, between two of its lines, is none of its held lines: a glyph in another float depth
      // than the unit's text by B's brackets, or, where B brackets none, drawn inside a form XObject where its text is not (L1's
      // second held-line fault, 2610.10492v1 ord 21: a float's glyphs no unit owns read as the paragraph's KEPT lines))
      const firstText = mem.text.length ? (mem.text[0] as number) : -1
      const textB = firstText >= 0 ? (m.aToB[firstText] as number) : -1
      const depthOf = (b: number) => regionB(b) >> 1
      const textDepth = textB >= 0 ? depthOf(textB) : 0
      const textForm = firstText >= 0 && !!gA(firstText).form
      for (let a = own[0] as number; a <= (own.at(-1) as number); a++) {
        const b = m.aToB[a] as number
        if ((claimedA[a] as number) >= 0 || b < 0 || (unitB[b] as number) >= 0) continue
        if (depthOf(b) !== textDepth || (!textForm && gA(a).form)) continue
        const g = gA(a)
        const q = box.get(pageA[a] as number)
        // (a glyph that stands on one of its own text lines (the line rule's band, within the line's extent) is none of a held
        // line's: ink in no group on the unit's line, never a KEPT line over it)
        const onOwn = cut.some(
          (l) =>
            l.page === pageA[a] &&
            Math.abs(g.y - l.base) < 0.5 * Math.max(l.size, g.size) &&
            g.x1 > l.x0 &&
            g.x0 < l.x1,
        )
        if (q && !onOwn && isInk(g) && g.y >= q[1] && g.y <= q[3] && g.x1 > q[0] && g.x0 < q[2]) held.push(a)
      }
      kept.push(...cutLines(held, atA))
    }
    const all = [...cut.map((l) => ({ l, kept: false })), ...kept.map((l) => ({ l, kept: true }))].sort(
      (x, y) => (x.l.gs[0] as number) - (y.l.gs[0] as number),
    )
    mem.lines = all.map(
      ({ l, kept: k }) =>
        [
          l.page,
          0,
          r2(l.x0),
          r2(l.x1),
          l.base,
          r2(l.top),
          r2(l.bottom),
          r2(l.x0),
          r2(l.x1),
          k ? 1 : 0,
          lineSize(l.gs.map(gA)),
        ] as Line,
    )
    mem.lineGlyphs = all.map(({ l }) => l.gs)
    // (a run set turned: its band's box on the page, from its first glyph's origin to its last one's end, its descent to its
    // ascent across; its baseline the first glyph's origin's height)
    if (mem.turned.length) {
      const byPage = new Map<number, number[]>()
      for (const [ap, aj] of mem.turned) (byPage.get(ap) ?? byPage.set(ap, []).get(ap)!).push(aj)
      for (const [ap, js] of byPage) {
        const T = inkA.pages[ap - 1]!.turned!
        let x0 = Number.POSITIVE_INFINITY
        let x1 = Number.NEGATIVE_INFINITY
        let y0 = Number.POSITIVE_INFINITY
        let y1 = Number.NEGATIVE_INFINITY
        for (const j of js) {
          const t = T[j]!
          for (const [x, y] of [
            [t.ox, t.oy],
            [t.ex, t.ey],
          ] as const)
            for (const e of [t.ascent, t.descent]) {
              const X = x - t.uy * e * t.size
              const Y = y + t.ux * e * t.size
              x0 = Math.min(x0, X)
              x1 = Math.max(x1, X)
              y0 = Math.min(y0, Y)
              y1 = Math.max(y1, Y)
            }
        }
        const first = T[js[0]!]!
        mem.lines.push([ap, 0, r2(x0), r2(x1), r2(first.oy), r2(y1), r2(y0), r2(x0), r2(x1), 0])
      }
    }
    // (the pages it has ink of its own on, which a group of its holds: a KEPT line's page alone is none of them)
    mem.pages = [...new Set(mem.lines.filter((l) => !(l[9] & 1)).map((l) => l[0]))]
    // style: TeX's font state is not stated by today's instrument: read off all of its own glyphs on A, level and turned, as
    // today's reader reads it (facts.ts styleOf: the role, weight and slant of its fonts' names, the size, fill and design; stage
    // 1b states it). A figure text set turned has its glyphs in `turned` alone: their font, size and fill are its style, as
    // today's figure texts take their turned glyphs' font (layout/figure-text.mjs); read off its level glyphs alone, a bold
    // axis title was the default serif (35 lines on 11 pages of the parity's pairs)
    // (its size today's reader's: the median of its text glyphs' sizes, up the line (TeX's, its font expansion aside), math
    // fonts aside, facts.ts unitSize; where it has none, the most common size of its glyphs, `read` 'size:lines': today then
    // reads it off its lines' bands)
    const own: StyleGlyph[] = [
      ...mem.text.map(gA),
      ...mem.turned.map(([ap, aj]) => turnedStyleGlyph(inkA.pages[ap - 1]!.turned![aj]!)),
    ]
    const txt = own.filter((g) => /\S/.test(g.u))
    // (its source's text: a babel name's none, its key (`ref`) being no text of it (\refname's is the class's: IEEEtran's
    // "REFERENCES" in faked small capitals, read against `ref` as capitals at the small capitals' size: 32 names of 14 papers of
    // the corpus))
    const source = unit && unit.name === undefined ? sourceText(unit.content) : null
    // (its faked small capitals aside, as today's originalStyle reads its size: smallCapsOf's, facts.ts fakedCaps; their share
    // Style.sc, and whether its text is set in them, today's vote, Style.caps)
    const caps = fakedCaps(txt, source, mem.kind.startsWith('ink'))
    const read = unitSize(caps.small.size ? txt.filter((g) => !caps.small.has(g)) : txt)
    const size = read ?? mostOf(txt.map((g) => r2(g.size))) ?? 10
    if (read === undefined && mem.lines.length) mem.read.push('size:lines')
    // (in the text's capitals by fakedCaps' `upper`: a faked small capital is no case change; an ink unit's by its capitals' share)
    const { upper: _upper, ...read0 } = styleOf(own, size, source)
    void _upper
    mem.style = {
      ...read0,
      size,
      ...(caps.upper ? { upper: 1 as const } : {}),
      ...(caps.ratio !== undefined ? { sc: caps.ratio } : {}),
      ...(caps.caps ? { caps: 1 as const } : {}),
    }
    // (the fill and the face TeX set its text in, group by group (group-style.ts): a group's fill where it is not the fill
    // around it, a link's that hyperref colours, and the face of a group whose command names none where it is not the face
    // around it, stated for the typesetter to draw its translation in; and where a group or a switch's run is set apart so,
    // the unit's own fill, slant and weight are its own text's, not those most of all its glyphs hold, which a link or an
    // \emph holding most of its letters makes theirs)
    const colourSwitch = (el: Extract<Piece, { t: 'el' }>) => classOf.get(el.id)?.colour !== undefined
    const faceSwitch = (el: Extract<Piece, { t: 'el' }>) => {
      const c = classOf.get(el.id)
      return !!c?.bare && !!c.cmd && namesFace(commandStyleOf(`\\${c.cmd}`))
    }
    const switches = (el: Extract<Piece, { t: 'el' }>) => colourSwitch(el) || faceSwitch(el)
    // (not a figure text's: its groups are its runs of glyphs in another face than its own, which is the face of most of its
    // glyphs by their definition (ink.ts figureRuns), its text in its run's order, not its glyphs' stream order: read again in
    // the stream's, 2610.37668v1's "PSNR 33.42 dB" took its italic run's face for its own)
    if (unit && !mem.figure && !unit.figure && mem.text.length && hasScopes(unit.content, switches)) {
      const g = groupStyleOf(
        unit.content,
        [...mem.text].sort((x, y) => x - y).map(gA),
        (el) => classOf.get(el.id)?.text,
        colourSwitch,
        faceSwitch,
      )
      if (g.fill.groups.length) mem.spanFills = g.fill.groups
      if (g.fill.apart && g.fill.own !== undefined) {
        if (g.fill.own > 0) mem.style.fill = g.fill.own
        else delete mem.style.fill
      }
      if (g.face.groups.length) mem.spanFaces = g.face.groups
      if (g.face.apart && g.face.own) {
        if (g.face.own.bold) mem.style.bold = 1
        else delete mem.style.bold
        if (!g.face.own.italic) delete mem.style.slant
        else mem.style.slant ??= 1
      }
    }
    // (a babel name's own text, its counter aside: S.names leaves it the original's where the target's word is it already, and
    // sets the counter after the target's word)
    if (mem.name !== undefined) {
      const ctr = new Set(mem.counterA ?? [])
      mem.plain = textOf(mem.text.filter((a) => !ctr.has(a)).map(gA))
      const cs = [...ctr].map(gA).filter(isInk)
      if (cs.length && cs.length < mem.text.length)
        mem.counter = [
          textOf(cs),
          [
            pageA[mem.counterA![0] as number] as number,
            r2(Math.min(...cs.map((g) => g.x0))),
            r2(Math.min(...cs.map((g) => g.bottom))),
            r2(Math.max(...cs.map((g) => g.x1))),
            r2(Math.max(...cs.map((g) => g.top))),
            r2(cs[0]!.y),
          ],
        ]
    }
    // the lead: TeX's \baselineskip where its paragraph states it (LINES_TEX's AXT-LINES, as the paragraph ends: the one TeX
    // appended its lines at), the pitch TeX set its lines at, which TeX's \lineskip rule only widens, under a line too tall for
    // it, never narrows; else (read) the pitch of its lines, where it has two on one page, else its size's, today's rule. A gap
    // the \lineskip rule opened is no pitch of the paragraph: read as one (2602.23285v2 p4 t29, gaps 10.96 and 12.24, read
    // 12.24), a translation that set the tall line elsewhere had that gap added to the push its own tall line took. A
    // paragraph whose lines stand nearer than the \baselineskip stated was not set at it (a negative skip after a forced
    // break, a part of it set before a display under another): read
    const pitches: number[] = []
    for (let q = 1; q < cut.length; q++)
      if (cut[q]!.page === cut[q - 1]!.page) {
        const d = cut[q - 1]!.base - cut[q]!.base
        if (d > 0 && d < 3 * size) pitches.push(r2(d))
      }
    const skip = mem.unit >= 0 && mem.name === undefined ? texSkip.get(mem.unit) : undefined
    const stated = skip !== undefined && skip > 0 && pitches.every((d) => d >= skip - ON_BASE)
    if (mem.lines.length) mem.read.push(...(stated ? ['style'] : ['style', 'lead']))
    pitches.sort((x, y) => x - y)
    // (a stated pitch to a thousandth: it is laid line after line, and 12 pt, 11.9552 PDF units, written 11.96 drifts 0.005 a line)
    mem.lead = stated
      ? Math.round(skip * 1000) / 1000
      : pitches.length
        ? (pitches[Math.floor(pitches.length / 2)] as number)
        : r2(1.2 * size)
    // elements: each one's own ink, one box per line of TeX's it stands on (its glyphs and its rules)
    const unitText = unit ? sourceText(unit.content) : ''
    // (the line of the unit's own each of its glyphs was cut into, its KEPT lines aside: the line TeX set it on)
    const lineOfA = new Map<number, number>()
    mem.lineGlyphs.forEach((gs, j) => {
      if (!((mem.lines[j] as Line)[9] & 1)) for (const a of gs) lineOfA.set(a, j)
    })
    for (const [id, p0] of pieces) {
      if (p0.t !== 'el' && p0.t !== 'unit') continue
      const gl = mem.els.get(id) ?? []
      // (a nested unit, a footnote set inside the unit: its mark, the glyphs TeX set for it in the unit's text, an element of
      // the unit's as today's placeholdersOf reads it (L2:1066, a footnote mark); one B gives none an element of no ink, so that
      // the part says which of the unit's pieces are its nested units: the instrument's class `nested`)
      const p = p0.t === 'unit' ? { kind: 'note-mark' } : p0
      const bx = mem.elBoxes.get(id) ?? []
      const bxB = mem.elBoxesB.get(id) ?? []
      // (its glyphs by line of TeX's, each line's box of its own ink: across its glyphs' advances and their outlines (an italic
      // glyph's overhang past its advance is its ink), top to bottom, on that line's baseline. As today's file's segment of a
      // piece (layout/stream.mjs: the piece's own ink, on its line's baseline), which the typesetter crops. An element in the
      // unit's text stands on the unit's lines, each glyph on the line the unit's text was cut into: an overline's nucleus, a
      // fraction's denominator back under its numerator, a big delimiter, a script are their line's whatever their own baselines
      // (today's file: both its points on one line of the unit, the whole piece one segment of that line's, make.mjs), and one
      // TeX broke over lines has a box on each. Cut alone, a fraction's denominator, which runs back left under its numerator,
      // read as a line of its own (2608.06701v1 p8's 2×|LCS(X,Y)| / (|X|+|Y|), set as two crops side by side). One outside the
      // unit's lines (a mark in a margin, kept where it stands) is cut into lines of its own, each on the baseline of the unit's
      // line it stands on where it stands on one, else its own. A display's rows are its own lines)
      const onLine = (page: number, lo: number, hi: number, own: number) => {
        const j = standsOn(mem.lines, page, lo, hi, own)
        return j >= 0 ? (mem.lines[j] as Line)[4] : own
      }
      // (its glyphs that are ink, whatever their Unicode (isInk): a big delimiter PDF.js reads as a blank, 2610.30034v1 p4 t60's
      // \big\} (CMEX10's code 9, U+0009), is the element's ink, its group erases it and its box draws it again)
      const shown = gl.filter((a) => isInk(gA(a)))
      const groups: number[][] = []
      const ink: Ink[] = []
      /** each of the unit's lines its box, by the line's index */
      const byLine = new Map<number, number>()
      const boxOfGlyphs = (gs: readonly number[], base: number): Ink => {
        const g = gs.map(gA)
        const outlined = g.filter((x) => x.ix1 > x.ix0)
        return [
          pageA[gs[0] as number] as number,
          r2(Math.min(...g.map((x) => x.x0), ...outlined.map((x) => x.ix0))),
          r2(Math.min(...g.map((x) => x.bottom))),
          r2(Math.max(...g.map((x) => x.x1), ...outlined.map((x) => x.ix1))),
          r2(Math.max(...g.map((x) => x.top))),
          base,
        ]
      }
      if (rowsKept(id))
        for (const l of displayRows.get(id) ?? []) {
          groups.push(l.gs)
          ink.push([l.page, r2(l.x0), r2(l.bottom), r2(l.x1), r2(l.top), l.base])
        }
      else if (shown.length && shown.every((a) => lineOfA.has(a))) {
        for (const a of shown) {
          const j = lineOfA.get(a) as number
          const q = byLine.get(j)
          if (q === undefined) {
            byLine.set(j, groups.length)
            groups.push([a])
          } else groups[q]!.push(a)
        }
        for (const [j, q] of byLine) ink[q] = boxOfGlyphs(groups[q]!, (mem.lines[j] as Line)[4])
      } else
        for (const l of cutLines(gl, atA)) {
          groups.push(l.gs)
          ink.push(boxOfGlyphs(l.gs, onLine(l.page, l.bottom, l.top, l.base)))
        }
      // (its rules and images: each with the box of the line its neighbour in B's stream stands on, TeX shipping a rule among its
      // nucleus's glyphs (an overline's, a fraction's bar, a radical's), of its two neighbours the one nearer it where they stand on
      // two lines; a display's with the row whose band holds it (rows.ts: a row's band its boxes' too); one of an element with no
      // glyph on its page with the unit's line it stands on, where it stands on one, else a box of its own. Before, a rule joined
      // a line's box only within 0.5 pt of its ink, and an overline's, 1.03 to 1.24 pt over its nucleus, was a box of its own on
      // its own baseline, which the typesetter set after the formula as an underscore: 2610.10069v1 p10's "H = H ▁")
      const inkOfA = new Map<number, number>()
      groups.forEach((gs, q) => {
        for (const a of gs) inkOfA.set(a, q)
      })
      const onB = new Map<number, [number, number][]>()
      for (const a of shown) {
        const b = m.aToB[a] as number
        if (b < 0 || !inkOfA.has(a)) continue
        const pb = (pageB[b] as number) - 1
        ;(onB.get(pb) ?? onB.set(pb, []).get(pb)!).push([b, a])
      }
      for (const l of onB.values()) l.sort((x, y) => x[0] - y[0])
      bx.forEach(([ap, ai], q) => {
        const pg = inkA.pages[ap - 1]!
        const [x0, y0, x1, y1] = [
          pg.boxes[4 * ai]!,
          pg.boxes[4 * ai + 1]!,
          pg.boxes[4 * ai + 2]!,
          pg.boxes[4 * ai + 3]!,
        ]
        const cx = (x0 + x1) / 2
        const cy = (y0 + y1) / 2
        let k = -1
        if (rowsKept(id)) k = ink.findIndex((r) => r[0] === ap && cy >= r[2] && cy <= r[4])
        else {
          const [pb, xb] = bxB[q] ?? [-1, -1]
          const on = onB.get(pb) ?? []
          const at = B.pages[pb]?.boxAt ?? []
          const o = (m.offB[pb] as number) ?? 0
          // (the last of its glyphs TeX shipped before the box, and the first after it)
          let before: number | undefined
          let after: number | undefined
          for (const [b, a] of on) {
            if ((at[b - o] as number) <= xb) before = a
            else {
              after = a
              break
            }
          }
          const near = [before, after].filter((a): a is number => a !== undefined)
          const ks = [...new Set(near.map((a) => inkOfA.get(a) as number))]
          if (ks.length === 1) k = ks[0] as number
          else if (ks.length === 2) {
            const d = (a: number) => {
              const g = gA(a)
              return Math.hypot((g.x0 + g.x1) / 2 - cx, g.y - cy)
            }
            k = inkOfA.get(
              d(near[0] as number) <= d(near[1] as number) ? (near[0] as number) : (near[1] as number),
            ) as number
          } else {
            const j = standsOn(mem.lines, ap, y0, y1, y0)
            if (j >= 0 && byLine.has(j)) k = byLine.get(j) as number
            else if (j >= 0) {
              byLine.set(j, ink.length)
              ink.push([ap, r2(x0), r2(y0), r2(x1), r2(y1), (mem.lines[j] as Line)[4]])
              return
            }
          }
        }
        const hit = k >= 0 ? ink[k] : undefined
        if (hit) {
          hit[1] = r2(Math.min(hit[1], x0))
          hit[2] = r2(Math.min(hit[2], y0))
          hit[3] = r2(Math.max(hit[3], x1))
          hit[4] = r2(Math.max(hit[4], y1))
        } else ink.push([ap, r2(x0), r2(y0), r2(x1), r2(y1), r2(y0)])
      })
      const el: El = { kind: p.kind, ink }
      if (rowsKept(id) || outside.has(id)) el.keep = 1
      // (its text where every glyph's Unicode is a reading of it: none `nu`, A17; else the typesetter crops it, TEX:420. Read
      // as the page's text layer reads it, today's rendering (tex.mjs renderingOf over PDF.js's text content): a space between two
      // glyphs PDF.js's text content sets one between (facts.ts textOf). Stated where the typesetter may draw it as text: a
      // kind of text, a class drawn as the page's text (a citation, a reference, a macro: the instrument's), its own brackets
      // (U.brackets reads the text inside them), ink over lines (a formula broken over lines is drawn as text where its
      // segments make no crops))
      // (a line's end inside a word of its text, facts.ts lineEnd: decided by the source where it states the word, its own TeX
      // and its unit's text; a URL's or a code mark's text TeX sets as written, a hyphen a line of it ends in its own)
      // (a URL: a \url's, or a piece the instrument states sets one, PieceClass.url: a \urldef'd control sequence a macro shows)
      const isUrl = p.kind === 'url' || !!classOf.get(id)?.url
      const literal = !!classOf.get(id)?.literal || isUrl || p.kind === 'code'
      const copy0 = classOf.get(id)?.copy ?? ''
      const lineEnds = {
        literal,
        // (one word as written, its line's ends joins as its copy reads them (facts.ts LineEndOptions.oneWord, lane url-join): a
        // URL (urlCopyOf), or a literal mark whose copy, the source's reading, holds no white space)
        oneWord: isUrl || (literal && copy0 !== '' && !/\s/u.test(copy0)),
        source: [p0.t === 'el' ? p0.src : '', copy0, unitText].join('\n'),
      }
      const asText =
        TEXT_KINDS.has(p.kind) ||
        TEXT_CLASSES.has(classOf.get(id)?.cls ?? '') ||
        ink.length > 1 ||
        !!bracketsOf(gl.map(gA))
      // (and, where the typesetter draws it as the page's text (a citation, a reference, a macro: TEXT_CLASSES; by its kind where
      // the instrument states no class), only where that text is a reading of its ink: its glyphs on each line on one baseline,
      // no rule or image among them. Plain text carries no shift and no size: a script's raise or drop, a fraction's parts, a
      // rule TeX set over or under it are none of it, and such an element is drawn as its ink (the typesetter's crop of El.ink
      // where it has no text). TeX sets one box's glyphs on one baseline, equal on the engine's hundredth of a point: no
      // threshold. 2609.20976v1 p2's `\kmsMpc`, "km s⁻¹ Mpc⁻¹", was drawn as the text "km s−1 Mpc−1"; today's reader crops a
      // text macro raised 0.1 em or more over its baseline (layer2.mjs scriptedOf) and draws a lowered one as text (1810.04805v2's
      // BERT_base, wrong too). A formula's text is no drawing (it is cropped, its text read for its brackets), nor a display's.
      // And each glyph where that text is drawn: on the baseline of the line it stands on (its ink's line, the hundredth most of
      // that line's body glyphs share, lines.ts); a footnote's mark is drawn raised whatever TeX set it as (El.mark: a superior
      // figure on the baseline, newpx's, 2307.16209v1). One box TeX raised or lowered whole has its glyphs on one baseline of
      // their own: 2610.17024v1 p11's `\REPOFOOTNOTE{}`, a
      // paper's macro around a footnote, its "3" 6.58 pt and 3.16 pt over the line's baseline, was read level against its own
      // glyphs alone, stated the text "3" and drawn flat at the line's size; on staging and in today's reader both)
      const cls0 = classOf.get(id)?.cls
      const textClass = cls0 !== undefined ? TEXT_CLASSES.has(cls0) : TEXT_KINDS.has(p.kind)
      const level =
        !textClass ||
        (!bx.length &&
          groups.every(
            (gs) =>
              new Set(
                asRead(gs, gA)
                  .filter((g) => /\S/.test(g.u))
                  .map((g) => r2(g.y)),
              ).size <= 1,
          ) &&
          (!!classOf.get(id)?.mark || standsAsDrawn(groups, ink, false, gA)))
      // (a symbol, drawn as its reading's character (El.sym) on the line's baseline, or raised where its reading raises it: only
      // where TeX's ink is that symbol so drawn, no Latin letter or digit among its glyphs (a symbol's reading holds none, its
      // source's letters and digits once commands are dropped: phClass) and each where the drawing sets it; else drawn as its ink. 2610.10069v1 p20's `$\vs^*$`, the paper's bold s starred, was read
      // as the symbol "*" on the baseline (the reading knows no `\vs`): drawn as a full-size *, the s lost)
      const c0 = classOf.get(id)
      if (
        c0?.cls === 'symbol' &&
        shown.length &&
        (shown.some((a) => /[A-Za-z0-9]/.test(gA(a).u)) || !standsAsDrawn(groups, ink, !!c0.sym?.[1], gA))
      ) {
        mem.asInk ??= new Set()
        mem.asInk.add(id)
      }
      if (asText && level && gl.length && !gl.some((a) => gA(a).nu)) {
        // (a text the typesetter draws as the page's text (a class of text, its glyphs on its line's baseline: `level`) in TeX's
        // case: each faked small capital its source's lowercase letter, read off its own glyphs' sizes (facts.ts elementCase),
        // their share stated with its style, El.style.sc (facts-pass), so that the typesetter draws it in small capitals as TeX
        // set it. A formula's text is no drawing (it is cropped, its text read for its brackets): a capital set smaller there is
        // a script, `\rho_{BDM}`'s BDM, no small capital)
        const cased = textClass ? elementCase(gl.map(gA)) : { glyphs: gl.map(gA) }
        if (cased.ratio !== undefined) {
          mem.smallCaps ??= new Map()
          mem.smallCaps.set(id, cased.ratio)
        }
        const own = cased.glyphs
        el.text = textOf(own, lineEnds)
        // (its runs of one fill, where its glyphs hold more than one: a link's text coloured, its brackets black)
        const runs = fillRunsOf(own, lineEnds)
        if (runs) el.fills = runs
      }
      // (a text macro drawn as its ink for its scripts: its copy text its glyphs', where the source's reading has none (a paper's
      // own macro), so that the crop's selection reads what it shows, as a URL's is its glyphs' (urlCopyOf))
      if (
        !level &&
        asText &&
        (cls0 === 'macro' || cls0 === 'umacro') &&
        !classOf.get(id)?.copy &&
        gl.length &&
        !gl.some((a) => gA(a).nu)
      )
        el.copy = textOf(gl.map(gA), lineEnds)
      // (a URL's copy text, its crop's: its glyphs' text as the page sets it (urlCopyOf), what the crop shows: no space at a line's end
      // inside it, which TeX's url package breaks without one, #633 review. The instrument's copy is the source's reading
      // (texToText2), which reads a URL's "_1" as the subscript "₁" and knows no prefix a macro prints (a DOI's, an eprint's): 30
      // of the corpus's 360 URLs with break points were cut elsewhere than after a break, #630. Where TeX set it on one line,
      // where its url package lets TeX break it, counted in that text (urlBreaks))
      if (isUrl && el.text !== undefined) el.copy = urlCopyOf(gl.map(gA))
      if (isUrl && ink.length === 1) {
        const breaks = urlBreaks(gl.map(gA), el.copy ?? classOf.get(id)?.copy ?? '')
        if (breaks.length) el.breaks = breaks
      }
      // (a text macro none of whose glyphs the instrument gives it, 1810.04805v2's \bert set as "BERT", the unit's text: its
      // text the unit's own text glyphs between its two points on B, as today's reader finds its rendering among the unit's
      // characters (texParts: TEX:487-495); its ink stays the unit's text's)
      const cls = classOf.get(id)?.cls
      const span = placeSpan.get(`${mem.unit}|${id}`)
      if (!gl.length && (cls === 'macro' || cls === 'umacro') && span) {
        const mine = new Set(mem.text)
        const between: number[] = []
        for (let b = span[0]; b < span[1]; b++) {
          const a = m.bToA[b] as number
          if (unitB[b] === mem.unit && roleB[b] === ROLE.text && a >= 0 && mine.has(a)) between.push(a)
        }
        if (between.length && !between.some((a) => gA(a).nu)) el.text = textOf(between.map(gA), lineEnds)
      }
      // (an element of no ink states which of three it is (rootcause/lave.md §2, math.md §4), of a class the reading draws from
      // its ink (INKED_CLASSES): TeX set nothing for it, its text '' — both its places stated and no glyph of B between them,
      // or the instrument's `empty` (its probe said it sets none, or its points prove it set none of its own: 2610.19159v1's
      // `\trajectoryMark{}`, 2402.10294v1's `\url` in `\urldef\tempurl`) —; or TeX set it before the unit's start point,
      // outside the unit's text: El.keep, its ink never erased (the instrument's `outside`); with neither, its ink was not
      // found, and the reading leaves its unit the original's. Before, an empty ink of a visible class read as TeX's nothing:
      // 2608.25210v2 p7's algorithm erased under one line, 2402.10294v1's reference [1] drawn without its year)
      const emptySpan = !!span && span[0] === span[1]
      const stated = cls ?? p.kind
      if (!ink.length && el.text === undefined && INKED_CLASSES.has(stated)) {
        if (emptySpan || emptyPiece.has(`${mem.unit}|${id}`) || jointPiece.has(`${mem.unit}|${id}`)) el.text = ''
        else if (outsidePiece.has(`${mem.unit}|${id}`)) el.keep = 1
      }
      mem.elements.push([id, el])
    }
    // its trail (above): an element of no piece, its ink a crop's, its text its glyphs'
    const tr = mem.els.get(TRAIL)
    if (tr?.length) {
      const L = cutLines(tr, atA)[0]
      if (L)
        mem.elements.push([
          TRAIL,
          {
            kind: 'other',
            copy: tr.map((a) => gA(a).u).join(''),
            ink: [[L.page, r2(L.x0), r2(L.bottom), r2(L.x1), r2(L.top), L.base]],
            trail: 1,
            ...(trailSep.has(mem.ord) ? { sep: trailSep.get(mem.ord) } : {}),
          },
        ])
    }
    // its label: the class's mark before it
    if (mem.label.length) {
      const L = cutLines(mem.label, atA)[0]
      const lg = mem.label.map(gA)
      if (L) {
        // (the line of its own it stands on, by an element's rule: a footnote's mark raised over the row it shares with the note
        // before stands on that row, its first line)
        const on = standsOn(mem.lines, L.page, L.bottom, L.top, L.base)
        mem.labelAt = {
          kind: LABEL_KIND[mem.kind] ?? 'number',
          // (its glyphs' advances, as an element's ink and a line's extent)
          ink: [L.page, r2(L.x0), r2(L.bottom), r2(L.x1), r2(L.top), L.base],
          style: { role: 'serif', size: L.most },
          ...(on >= 0 ? { line: on } : {}),
        }
      }
    }
  }
}

/** the characters after which TeX's url package may break a URL (url.sty's \UrlBreaks and \UrlBigBreaks; a hyphen only under
 *  its `hyphens` option) */
const URL_BREAKS = new Set(".@\\/!_|;>]),?&'+=#:")
/** a glyph's text as a copy text may hold it: as PDF.js gives it, or a ligature as its letters (ﬁ, ﬄ: NFKC) */
const lettersOf = (u: string) => u.replace(/[\uFB00-\uFB06]/g, (c) => c.normalize('NFKC'))
/**
 * Where a URL TeX set on one line may break (El.breaks): after a run of url.sty's break characters, never inside one (a
 * break after "https:" or "https:/" would leave "//…" or "/…" to start a line), at the middle of the paper between the run's
 * last glyph's ink and the next one's (their outlines where read, else their advances), with how much of its copy text `copy`
 * stands before it, in UTF-16 code units, the unit the typesetter slices it in: read off the text itself, each glyph found in
 * it in turn, so that a space it holds between two glyphs (urlCopyOf's, where they stand apart on a line), an astral
 * character's two units and a ligature's letters are counted as the text has them (a count of the glyphs misplaced every cut after any of them,
 * Devin on #630). None where the glyphs are not that text: a cut there would fall elsewhere than after a break. Its glyphs in
 * their order on the line
 */
export function urlBreaks(gs: readonly DocGlyph[], copy: string): [number, number][] {
  const line = gs.filter((g) => /\S/.test(g.u)).sort((a, b) => a.x0 - b.x0)
  // (the copy's code units through each glyph)
  const ends: number[] = []
  let at = 0
  for (const g of line) {
    while (at < copy.length && /\s/.test(copy[at]!)) at++
    const u = copy.startsWith(g.u, at) ? g.u : lettersOf(g.u)
    if (!copy.startsWith(u, at)) return []
    at += u.length
    ends.push(at)
  }
  const out: [number, number][] = []
  for (let k = 1; k < line.length; k++) {
    const a = line[k - 1]!,
      b = line[k]!
    if (!URL_BREAKS.has(a.u) || URL_BREAKS.has(b.u)) continue
    const right = a.ix1 > a.ix0 ? a.ix1 : a.x1,
      left = b.ix1 > b.ix0 ? b.ix0 : b.x0
    out.push([r2((right + left) / 2), ends[k - 1]!])
  }
  return out
}

/** a line's glyphs of an element as its text is read (facts.ts textOf): each spacing accent TeX set over its letter joined to it
 *  (joinAccents), the accent no glyph of its own. TeX's \accent raises the accent over its letter by the letter's height less
 *  the x-height, so `\v{c}`'s caron stands 0.05 pt over the line's baseline (2610.21312v1 p2's "(Marčenko and Pastur, 1967)"):
 *  read glyph by glyph, an element holding one stood on two baselines and stated no text, drawn as one crop no line could break,
 *  where the unit's own text reads the accent as its letter's. A script stays its own glyph: no accent is set over it */
const asRead = (gs: readonly number[], gA: (a: number) => DocGlyph): readonly DocGlyph[] => joinAccents(gs.map(gA))
/** whether an element's glyphs (by line, `groups`, read by `gA`, each line's with its ink's box on the line it stands on, `ink`,
 *  its baseline at 5) stand where its text is drawn: each glyph of a character on its line's baseline, as two baselines are
 *  told (ON_BASE: the line's stated to a hundredth, a glyph's as the PDF wrote it; TeX's positions fall on a half-hundredth
 *  often, 2610.40394v1 p34's line at 476.125, stated 476.12, its glyphs' floats rounding to either side), or, `raised`, over it
 *  (a symbol its reading raises) */
function standsAsDrawn(
  groups: readonly number[][],
  ink: readonly Ink[],
  raised: boolean,
  gA: (a: number) => DocGlyph,
): boolean {
  return groups.every((gs, q) =>
    asRead(gs, gA).every((g) => {
      if (!/\S/.test(g.u)) return true
      const base = (ink[q] as Ink)[5]
      return raised ? g.y > base + ON_BASE : Math.abs(g.y - base) <= ON_BASE
    }),
  )
}
