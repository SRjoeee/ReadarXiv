// Each marked placeholder's own ink in B's stream, by its points (today's layout/stream.mjs ownedOf, the erasure's reading,
// ported; contract stage 1c-2, item 4). A piece's ink is what the content stream shows between its two points in its opening
// point's region (a column's body or not, a depth of floats: what TeX ships between that is not the piece's — a page's
// footnotes, its running foot, a float — lies in another region and is cut); its bodies run on across pages. An opening point
// alone owns what its region holds up to where the text after the piece begins (Follow `want`), else to the next mark of its
// unit, else to a later unit's start (that unit's label on its line left out), else to its column's end. What the marking
// wrote is the plan's (follows.ts): no name is parsed for a piece, no class decided again.
//
// Not ported: headsOf/headInk (a display a unit opens with, which no point brackets: today's reading of it fed the ledger
// alone, never a unit's owners), `jumps` (a range outside the bodies that jumps from low on a page to high and right on it by a
// quarter of the page: a threshold of today's, its cases counted in the lane file).
import { charOf, type PageGlyph, type PageRead } from './page.ts'
import { type Follow, spellOf } from './follows.ts'

/** how a piece's ink was read, or why none was (stream.mjs OWNED_HOW, the readings this port makes): the first OWNED own it */
export const HOW = Object.freeze({
  closed: 0,
  text: 1,
  next: 2,
  column: 3,
  pastColumn: 4,
  displays: 5,
  /** not owned */
  order: 7,
  twice: 8,
  regions: 9,
  page: 10,
  closingNotRead: 12,
  nextOnPage: 13,
  blocked: 14,
  notUnits: 15,
  notFound: 16,
  nothingBefore: 17,
})
export const OWNED = 6
/** a reading's [page, index] pairs */
export interface Ink {
  how: number
  glyphs: [number, number][]
  boxes: [number, number][]
}
export interface Regions {
  glyph: Int32Array
  box: Int32Array
  at: Int32Array
}

const BRACKET = /^[bf][se]\d+$/
const NAME_POINT = /^n\d+\.[^.]+\.[se]$/
const BIB_ITEM = /^b[iz]\d+$/
const FRAME = /^g(\d+)[abt]$/
const BEGINS_KEY = /^n\d+\.(abstract|ref|bib|contents|listfigure|listtable|appendix|index|proof|preface|glossary)\.s$/i
const BIB_START = /^bi\d+$/
/** a draft image frame's glyphs and boxes (g<n>a to g<n>b on a page): graphicx's draft, no reading's */
function framedOf(pg: PageRead): { glyph: Uint8Array; box: Uint8Array } | null {
  let out: { glyph: Uint8Array; box: Uint8Array } | null = null
  const open = new Map<string, { glyph: number; box: number }>()
  const nBoxes = Math.floor(pg.boxes.length / 4)
  for (const pt of pg.points) {
    const m = /^g(\d+)([ab])$/.exec(pt.name)
    if (!m) continue
    if (m[2] === 'a') {
      open.set(m[1] as string, pt)
      continue
    }
    const from = open.get(m[1] as string)
    if (!from) continue
    out ??= { glyph: new Uint8Array(pg.glyphs.length), box: new Uint8Array(nBoxes) }
    out.glyph.fill(1, from.glyph, Math.min(pt.glyph, pg.glyphs.length))
    out.box.fill(1, from.box, Math.min(pt.box, nBoxes))
  }
  return out
}

/** the same baseline: within half the larger size */
const onLine = (a: PageGlyph, b: PageGlyph) => Math.abs(a.y - b.y) < 0.5 * Math.max(a.size, b.size)

/**
 * Each opening point's reading, by its name. `follows` the plan's Follow of each opening mark; `units` which unit each start
 * and end name is (`startUnit`, `endNames`): a later unit's start bounds a piece alone, the unit's end names say a piece
 * stands past its unit's end
 */
export function piecesInk(
  pages: readonly PageRead[],
  regions: readonly Regions[],
  follows: ReadonlyMap<string, Follow>,
  o: {
    startUnit: ReadonlyMap<string, number>
    endName: (unit: number) => string | null
    startName: (unit: number) => string | null
  },
): Map<string, Ink> {
  const framed = pages.map(framedOf)
  const where = new Map<string, [number, number][]>()
  const seq: [number, number][] = []
  pages.forEach((pg, p) => {
    pg.points.forEach((pt, q) => {
      const l = where.get(pt.name)
      if (l) l.push([p, q])
      else where.set(pt.name, [[p, q]])
      if (!BRACKET.test(pt.name) && !NAME_POINT.test(pt.name) && !BIB_ITEM.test(pt.name) && !FRAME.test(pt.name))
        seq.push([p, q])
    })
  })
  const rank = new Map<string, number>()
  seq.forEach(([p, q], r) => {
    rank.set(`${p}|${q}`, r)
  })
  const nBoxes = (p: number) => Math.floor((pages[p] as PageRead).boxes.length / 4)
  const boxAt = (p: number, g: number) => (pages[p] as PageRead).boxAt?.[g] ?? 0
  const pointAt = ([p, q]: [number, number]) => (pages[p] as PageRead).points[q] as PageRead['points'][number]
  const out = new Map<string, Ink>()
  const none = (how: number): Ink => ({ how, glyphs: [], boxes: [] })
  const cut = (how: number, glyphs: [number, number][], boxes: [number, number][], end: number): Ink => {
    if (end >= glyphs.length) return { how, glyphs, boxes }
    const [p, g] = glyphs[end] as [number, number]
    const upTo = boxAt(p, g)
    return { how, glyphs: glyphs.slice(0, end), boxes: boxes.filter(([q, b]) => q < p || (q === p && b < upTo)) }
  }
  for (const [name, f] of follows) {
    const list = where.get(name)
    if (!list) continue
    const close = `${name.slice(0, -1)}b`
    const closes = where.get(close) ?? []
    if (list.length > 1 || closes.length > 1) {
      out.set(name, none(HOW.twice))
      continue
    }
    const [pa, qa] = list[0] as [number, number]
    const A = pointAt([pa, qa])
    const rA = (regions[pa] as Regions).at[qa] as number
    const take = (
      glyphs: [number, number][],
      boxes: [number, number][],
      p: number,
      g0: number,
      g1: number,
      b0: number,
      b1: number,
    ) => {
      const R = regions[p] as Regions
      const F = framed[p]?.glyph
      for (let g = g0; g < g1; g++) if (R.glyph[g] === rA && !F?.[g]) glyphs.push([p, g])
      for (let b = b0; b < b1; b++) if (R.box[b] === rA) boxes.push([p, b])
    }
    /** what A's region holds from A to the point `to` (null: the document's end) */
    const takeTo = (to: [number, number] | null) => {
      const glyphs: [number, number][] = []
      const boxes: [number, number][] = []
      const last = to ? to[0] : pages.length - 1
      for (let p = pa; p <= last; p++) {
        const P = pages[p] as PageRead
        const T = to && p === to[0] ? pointAt(to) : null
        take(
          glyphs,
          boxes,
          p,
          p === pa ? A.glyph : 0,
          T ? T.glyph : P.glyphs.length,
          p === pa ? A.box : 0,
          T ? T.box : nBoxes(p),
        )
      }
      return { glyphs, boxes }
    }
    const textEnd = (glyphs: [number, number][], to: string | null) =>
      to !== null && f.ends.includes(to) ? textTo(pages, glyphs, f.want, f.rest) : textAt(pages, glyphs, f.want)
    if (closes.length) {
      const [pb, qb] = closes[0] as [number, number]
      if (pb < pa || (pb === pa && qb < qa)) {
        out.set(name, none(HOW.order))
        continue
      }
      if ((regions[pb] as Regions).at[qb] !== rA) {
        out.set(name, none(HOW.regions))
        continue
      }
      if (pb !== pa && rA % 2 === 0) {
        out.set(name, none(HOW.page))
        continue
      }
      let { glyphs, boxes } = takeTo([pb, qb])
      // (a punctuation mark its command set before its own ink, the closing mark written after it (the plan's `moved`): the
      // text's, not the piece's, where it is the first glyph and no such mark stands right after the closing point)
      if (f.moved && glyphs.length > 1) {
        const [p0, g0] = glyphs[0] as [number, number]
        const B = pages[pb] as PageRead
        let next = pointAt([pb, qb]).glyph
        while (next < B.glyphs.length && !setAs(B.glyphs[next]?.u ?? '')) next++
        if (
          (pages[p0] as PageRead).glyphs[g0]?.u === f.moved &&
          !(next < B.glyphs.length && B.glyphs[next]?.u === f.moved)
        ) {
          const [p1, g1] = glyphs[1] as [number, number]
          const from = boxAt(p1, g1)
          glyphs = glyphs.slice(1)
          boxes = boxes.filter(([q, b]) => q > p1 || (q === p1 && b >= from))
        }
      }
      out.set(name, { how: HOW.closed, glyphs, boxes })
      continue
    }
    if (f.closing) {
      out.set(name, none(HOW.closingNotRead))
      continue
    }
    const pastEnd = (() => {
      const e = o.endName(f.unit)
      return !f.want && !!e && (where.get(e) ?? []).some(([p, q]) => p < pa || (p === pa && q < qa))
    })()
    const nextOf = () => seq[(rank.get(`${pa}|${qa}`) ?? -2) + 1]
    /** the ink up to N, a later unit's start: the glyphs on N's line before it that unit's label, not the piece's */
    const toStart = (glyphs: [number, number][], boxes: [number, number][], N: { glyph: number; box: number }): Ink => {
      const P = pages[pa] as PageRead
      const G = P.glyphs
      let end = glyphs.length
      const at = G[N.glyph]
      while (at && end > 0 && onLine(G[(glyphs[end - 1] as [number, number])[1]] as PageGlyph, at)) end--
      const upTo = end < glyphs.length ? boxAt(pa, (glyphs[end] as [number, number])[1]) : N.box
      return { how: HOW.next, glyphs: glyphs.slice(0, end), boxes: boxes.filter(([, b]) => b < upTo) }
    }
    const alone = (): Ink => {
      // (past its unit's end mark, the end mark set before a display that ends the unit: a block's babel name or a biblatex
      // entry after it on its page begins text no unit of the source holds, none of it the piece's)
      if (pastEnd) {
        const pts = (pages[pa] as PageRead).points
        const next = nextOf()
        for (let q = qa + 1; q < pts.length && !(next && next[0] === pa && q >= next[1]); q++) {
          const nm = (pts[q] as { name: string }).name
          if (!BEGINS_KEY.test(nm) && !BIB_START.test(nm)) continue
          const { glyphs, boxes } = takeTo([pa, q])
          if (f.blocked && (glyphs.length || boxes.length)) return none(HOW.blocked)
          return toStart(glyphs, boxes, pts[q] as { glyph: number; box: number })
        }
      }
      const next = nextOf()
      if (!next || next[0] !== pa) return none(HOW.nextOnPage)
      const P = pages[pa] as PageRead
      const N = pointAt(next)
      // (nothing after it in its unit, its next mark outside the bodies: the piece ends with its column's body)
      if (!f.want && rA % 2 === 1 && ((regions[pa] as Regions).at[next[1]] as number) % 2 === 0) {
        let E: number | null = null
        for (let q = qa + 1; q < next[1]; q++) {
          const n = (P.points[q] as { name: string }).name
          if (/^be\d+$/.test(n)) E = q
          else if (/^bs\d+$/.test(n)) E = null
        }
        if (E !== null) {
          const { glyphs, boxes } = takeTo([pa, E])
          return f.blocked && (glyphs.length || boxes.length) ? none(HOW.blocked) : { how: HOW.column, glyphs, boxes }
        }
      }
      const { glyphs, boxes } = takeTo(next)
      if (!glyphs.length && !boxes.length && f.want && (regions[pa] as Regions).at[next[1]] !== rA)
        return none(HOW.notFound)
      if (!glyphs.length && !boxes.length) return { how: f.want ? HOW.text : HOW.next, glyphs, boxes }
      if (!f.want) {
        // (a later unit's opening as its start mark where that unit's start mark follows it on the page)
        const opening = /^[pn](\d+)\.\d+a$/.exec(N.name)
        const laterOf = (): number | null => {
          const s = o.startUnit.get(N.name)
          if (s !== undefined) return s
          if (!opening) return null
          const u = Number(opening[1])
          const sn = o.startName(u)
          return sn && (where.get(sn) ?? []).some(([p, q]) => p === pa && q > next[1]) ? u : null
        }
        const S = f.blocked ? (f.split ?? null) : null
        if (S && (S.ends ? S.ends.includes(N.name) : f.through && N.name === f.through)) {
          const end = textedTo(pages, glyphs, S.text)
          const stop =
            end > 0 && end < glyphs.length && !runsOn(pages, glyphs, end)
              ? S.ends
                ? afterText(pages, glyphs, end, S)
                : glyphs.length
              : -1
          if (stop > end) return cut(S.ends ? HOW.text : HOW.next, glyphs, boxes, stop)
        }
        if (f.blocked) return f.through && N.name === f.through ? { how: HOW.next, glyphs, boxes } : none(HOW.blocked)
        if (f.ends.includes(N.name)) return { how: HOW.next, glyphs, boxes }
        const later = laterOf()
        if (later !== null && later > f.unit) return toStart(glyphs, boxes, N)
        return none(HOW.notUnits)
      }
      const end = textEnd(glyphs, N.name)
      if (end < 0) return none(HOW.notFound)
      if (end === 0) {
        // (rules alone before the text after it are the piece's (\_ before \allowbreak), but a rule under or over the text after
        // it (ulem's \uline, soul's \hl paint theirs before the word) is that text's)
        const [p0, g0] = glyphs[0] as [number, number]
        const P0 = pages[p0] as PageRead
        const G0 = P0.glyphs[g0] as PageGlyph
        const ruled = boxes.filter(([q, b]) => q < p0 || (q === p0 && b < boxAt(p0, g0)))
        const under = ([q, b]: [number, number]) =>
          q === p0 &&
          (P0.boxes[4 * b + 2] as number) > G0.x0 + 0.1 * G0.size &&
          (P0.boxes[4 * b + 1] as number) < G0.y + G0.size &&
          (P0.boxes[4 * b + 3] as number) > G0.y - 0.5 * G0.size
        if (ruled.length && !ruled.some(under)) return { how: HOW.text, glyphs: [], boxes: ruled }
        if (ruled.length && ruled.every(([q, b]) => framed[q]?.box[b]))
          return { how: HOW.text, glyphs: [], boxes: ruled }
        return none(HOW.nothingBefore)
      }
      return cut(HOW.text, glyphs, boxes, end)
    }
    /** an opening point alone in a column's body whose next mark lies past that body's end: what its region holds on, through
     *  the bodies' breaks, up to the text after it, or with none to its body's end (or to its unit's next mark there) */
    const pastColumn = (): Ink | null => {
      if (rA % 2 !== 1) return null
      let stop: [number, number] | null = null
      for (let r = (rank.get(`${pa}|${qa}`) ?? -2) + 1; r >= 1 && r < seq.length && !stop; r++) {
        const s = seq[r] as [number, number]
        if ((regions[s[0]] as Regions).at[s[1]] === rA) stop = s
      }
      let E: [number, number] | null = null
      for (let p = pa; p <= (stop ? stop[0] : pages.length - 1) && !E; p++) {
        const pts = (pages[p] as PageRead).points
        for (let q = p === pa ? qa + 1 : 0; q < (stop && p === stop[0] ? stop[1] : pts.length); q++)
          if (/^be\d+$/.test((pts[q] as { name: string }).name)) {
            E = [p, q]
            break
          }
      }
      if (!E) return null
      if (f.want) {
        const { glyphs, boxes } = takeTo(stop)
        const end = textEnd(glyphs, stop ? pointAt(stop).name : null)
        return end > 0 ? cut(HOW.pastColumn, glyphs, boxes, end) : null
      }
      if (f.blocked) return null
      const through = stop !== null && f.ends.includes(pointAt(stop).name)
      const { glyphs, boxes } = takeTo(through ? stop : E)
      return { how: through ? HOW.pastColumn : HOW.column, glyphs, boxes }
    }
    /** an opening point alone whose next mark is another region's (a float shipped after it): its own region's ink to the next
     *  mark there on its page, up to the text after it */
    const pastOther = (): Ink | null => {
      if (!f.want) return null
      const next = nextOf()
      if (!next || next[0] !== pa || (regions[pa] as Regions).at[next[1]] === rA) return null
      let stop: [number, number] | null = null
      for (let r = (rank.get(`${pa}|${qa}`) ?? -2) + 1; r >= 1 && r < seq.length && !stop; r++) {
        const s = seq[r] as [number, number]
        if ((regions[s[0]] as Regions).at[s[1]] === rA) stop = s
      }
      if (!stop || stop[0] !== pa) return null
      const { glyphs, boxes } = takeTo(stop)
      const end = textEnd(glyphs, pointAt(stop).name)
      return end > 0 ? cut(HOW.text, glyphs, boxes, end) : null
    }
    let e = alone()
    if (e.how === HOW.notFound) e = pastOther() ?? e
    if (e.how === HOW.nextOnPage || e.how === HOW.notFound) e = pastColumn() ?? e
    // (a reading past a draft image frame that the text after it does not end: what TeX set between is not told)
    if (e.how < OWNED && e.how !== HOW.text && e.boxes.some(([q, b]) => framed[q]?.box[b])) e = none(HOW.notUnits)
    if (f.group.length && e.how < OWNED) e = { ...e, how: HOW.displays }
    out.set(name, e)
  }
  return out
}

const setAs = (s: string) => s.normalize('NFKC').replace(/\s/g, '')
/** one glyph of any text but none in a text the probe showed (marks.mjs INK_ANY: a formula's glyph no character spells) */
export const INK_ANY = '￼'
/** each place the text `want` begins among the glyphs (a hyphen the text has not passed over; a ligature's characters past
 *  its end; a run to the last glyph that spells its start), TeX's quotes as one */
function* textStarts(pages: readonly PageRead[], glyphs: [number, number][], want0: string): Generator<number> {
  const fold = (c: string) => c.replace(/[“”„‟″"]/g, '"').replace(/[‘’‚‛′']/g, "'")
  const want = fold(want0)
  const chars = glyphs.map(([p, g]) => fold(charOf((pages[p] as PageRead).glyphs[g]?.u ?? '')))
  for (let e = 0; e < chars.length; e++) {
    if (!chars[e]) continue
    let w = 0
    let h = e
    for (; h < chars.length && w < want.length; h++) {
      const c = chars[h] as string
      if (!c) continue
      if (want.startsWith(c, w) || (w + c.length > want.length && c.startsWith(want.slice(w)))) {
        w += c.length
        continue
      }
      if ((c === '-' || c === '‐') && h > e) continue
      break
    }
    if (w >= want.length || (h === chars.length && w > 0)) yield e
  }
}
function textAt(pages: readonly PageRead[], glyphs: [number, number][], want: string): number {
  for (const e of textStarts(pages, glyphs, want)) return e
  return -1
}
/** textAt where the text after a piece runs to the point its glyphs end at: the first start from which the glyphs to their
 *  end spell `rest` exactly, else textAt's */
function textTo(pages: readonly PageRead[], glyphs: [number, number][], want: string, rest: string): number {
  const spelled = glyphs.map(([p, g]) => spellOf((pages[p] as PageRead).glyphs[g]?.u ?? ''))
  const at: number[] = []
  let n = 0
  for (const s of spelled) {
    at.push(n)
    n += s.length
  }
  const all = spelled.join('')
  let first = -1
  for (const e of textStarts(pages, glyphs, want)) {
    if (first < 0) first = e
    if (n - (at[e] as number) === rest.length && all.endsWith(rest)) return e
  }
  return first
}
/** the glyph after the first of `glyphs` that set `text` whole, character for character (INK_ANY one glyph of any text) */
function textedTo(pages: readonly PageRead[], glyphs: [number, number][], text: string): number {
  const want = setAs(text)
  let n = 0
  for (let j = 0; j < glyphs.length && n < want.length; j++) {
    const [p, g] = glyphs[j] as [number, number]
    const t = setAs((pages[p] as PageRead).glyphs[g]?.u ?? '')
    if (want[n] === INK_ANY) {
      if (!t) return -1
      n++
    } else if (!t) continue
    else if (want.startsWith(t, n) && !want.slice(n, n + t.length).includes(INK_ANY)) n += t.length
    else return -1
    if (n === want.length) return j + 1
  }
  return -1
}
function afterText(
  pages: readonly PageRead[],
  glyphs: [number, number][],
  end: number,
  S: { want?: string; rest?: string },
): number {
  const e = textTo(pages, glyphs.slice(end), S.want ?? '', S.rest ?? '')
  return e > 0 ? end + e : -1
}
/** whether the glyph at `end` runs on as the word the glyph before it ends: both a letter or a digit, on one page, one
 *  baseline and one size (TeX sets a word's letters on one baseline at one size: they are equal, not near) */
function runsOn(pages: readonly PageRead[], glyphs: [number, number][], end: number): boolean {
  const word = /[\p{L}\p{N}]/u
  const [p0, g0] = glyphs[end - 1] as [number, number]
  let j = end
  while (
    j < glyphs.length &&
    !setAs((pages[(glyphs[j] as [number, number])[0]] as PageRead).glyphs[(glyphs[j] as [number, number])[1]]?.u ?? '')
  )
    j++
  if (j >= glyphs.length) return false
  const [p1, g1] = glyphs[j] as [number, number]
  const A = (pages[p0] as PageRead).glyphs[g0] as PageGlyph
  const B = (pages[p1] as PageRead).glyphs[g1] as PageGlyph
  const a = setAs(A.u ?? '')
  const b = setAs(B.u ?? '')
  return (
    p0 === p1 &&
    word.test(a.at(-1) ?? '') &&
    word.test(b[0] ?? '') &&
    Math.abs(A.y - B.y) < 0.05 * A.size &&
    Math.abs(A.size - B.size) < 0.05 * A.size
  )
}
