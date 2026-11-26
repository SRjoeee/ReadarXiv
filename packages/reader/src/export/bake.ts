// The bake: a page's content (the add-on's, each unit's ink in `/OC /<name> BDC … EMC`) with the ink of the groups the reader
// turns off taken out of the stream itself, so that no viewer shows it and none reads it: a group turned off in the default
// view hides its ink and PDF.js and poppler still read its text (lab measure, 1706.03762v7-zh: 1,408 of 1,408 words of the
// units laid). Read on the engine's walk (the remover's `walkPage`: each show's codes and text state, its font's widths as
// the wrap read them), so that a show's advance is the one the engine computes. What sets state stays where it was (a group
// off hides painting, never state: ISO 32000-1 §8.11.3.1); a show becomes the advance it made (a TJ of one number: its codes'
// widths at the text state of the moment, so what follows on its line stands where it stood; the horizontal scaling cancels,
// the number scaled by it as the show was); a show whose widths the walk cannot read stays, drawn invisibly (render mode 3:
// its text still read, its place kept, counted); a path painted is dropped, a clipping path kept as a clip; an image, a form
// or a shading dropped. Our own marks go, on or off; the page's own marked content stays. The page's content alone is
// baked: a form the add-on wrapped inside keeps its groups, which the default view turns off (counted as `forms`).
import {
  type Container,
  type LexOp,
  lex,
  type Operand,
  type PdfObject,
  type ShowEvent,
  type Walker,
} from '@readarxiv/engine'

export interface BakeStats {
  pages: number
  /** pages the walk refused (left unbaked) */
  refused: number
  shows: number
  showsUnknown: number
  paints: number
  images: number
  clipsKept: number
  /** forms a crop's source bakes a copy of: its own groups' ink inside them */
  formsBaked: number
  /** a crop's own groups' ink cut by place (Within): codes kept by their advance, codes kept by their font's box (or for want
   *  of one), codes left out as advances; shows kept whole for want of their widths or their place; paths, images and forms
   *  left out */
  codesKept: number
  codesByBox: number
  codesOut: number
  showsWhole: number
  inkOut: number
}
export const newBakeStats = (): BakeStats => ({
  pages: 0,
  refused: 0,
  shows: 0,
  showsUnknown: 0,
  paints: 0,
  images: 0,
  clipsKept: 0,
  formsBaked: 0,
  codesKept: 0,
  codesByBox: 0,
  codesOut: 0,
  showsWhole: 0,
  inkOut: 0,
})

const PAINT = new Set(['S', 's', 'f', 'F', 'f*', 'B', 'B*', 'b', 'b*', 'n'])
const PATH = new Set(['m', 'l', 'c', 'v', 'y', 'h', 're'])
const SHOW = new Set(['Tj', 'TJ', "'", '"'])
/** the text state's operators, and the text matrices' (ISO 32000-1 §9.3, §9.4.2) */
const TEXT_STATE = new Set(['Tf', 'Tc', 'Tw', 'Tz', 'TL', 'Ts', 'Tr'])
const TEXT_LINE = new Set(['Td', 'TD', 'T*', 'Tm'])
const enc = (s: string) => {
  const b = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255
  return b
}
const nameOf = (a: Operand | undefined) =>
  a && typeof a === 'object' && !Array.isArray(a) && a.t === 'name' ? a.v : null
/** a number of the content's state written again, to a millionth (a size of 9.9626 stays 9.9626) */
const num = (v: number) => {
  const r = Math.round(v * 1e6) / 1e6
  return Object.is(r, -0) ? '0' : String(r)
}
const fmt = (v: number) => {
  const r = Math.round(v * 1000) / 1000
  return Object.is(r, -0) ? '0' : String(r)
}

/** a show's advance in unscaled text space (its codes' widths at its size, the character and word spacing, the array's
 *  numbers), or null where its font's widths are not read, or it is set top to bottom */
function advanceOf(e: ShowEvent, items: Operand[]): number | null {
  const { font, size, Tc, Tw } = e.state
  if (!font.width || font.vertical || font.refused) return null
  let tx = 0
  for (const it of items) if (typeof it === 'number') tx -= (it / 1000) * size
  for (const c of e.codes) tx += font.width(c.v) * size + Tc + (c.ce - c.cs === 1 && c.v === 32 ? Tw : 0)
  return tx
}

/** a rectangle of page space [x0, y0, x1, y1] */
export type Box = [number, number, number, number]
type M = [number, number, number, number, number, number]
const I: M = [1, 0, 0, 1, 0, 0]
/** a × b, PDF's row-vector order: a's transform, then b's */
const mul = (a: M, b: M): M => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4],
  a[4] * b[1] + a[5] * b[3] + b[5],
]
/** the box round points (x, y, …) under m */
const boxOf = (m: M, pts: number[]): Box => {
  const b: Box = [Infinity, Infinity, -Infinity, -Infinity]
  for (let i = 0; i + 1 < pts.length; i += 2) {
    const x = pts[i]! * m[0] + pts[i + 1]! * m[2] + m[4],
      y = pts[i]! * m[1] + pts[i + 1]! * m[3] + m[5]
    b[0] = Math.min(b[0], x)
    b[1] = Math.min(b[1], y)
    b[2] = Math.max(b[2], x)
    b[3] = Math.max(b[3], y)
  }
  return b
}
/** whether box a meets box b: an overlap of some area, or, for an a of no width or no height (a glyph of no advance, a level
 *  baseline), a point or a segment of it inside b */
const meets = (a: Box, b: Box) => {
  const ax = a[2] > a[0] ? a[0] < b[2] && a[2] > b[0] : a[0] >= b[0] && a[0] <= b[2]
  const ay = a[3] > a[1] ? a[1] < b[3] && a[3] > b[1] : a[1] >= b[1] && a[1] <= b[3]
  return ax && ay
}
const meetsAny = (a: Box, bs: readonly Box[]) => bs.some((b) => meets(a, b))

/**
 * Where a crop's source is cut, page space: `own`, the crop's own region (the part of the page its draw shows); `all`, every
 * crop's region of the same member on the page. A member's elements and its label share one group of the add-on's, so a crop
 * cut by group alone holds every element's ink, and each draw of it, clipped to one element, still holds every element's text,
 * which viewers select and copy where the draw stands. Cut by place: a character is where its advance stands on its baseline
 * (its origin to the next one's, as every text reader places it); one standing in some crop of its member belongs to the crops
 * it stands in, and one standing in none (a glyph of no advance, \not's slash, whose ink lies past its origin; a glyph whose
 * ink lies wholly off its baseline, a prime) to every crop its font's box (FontBBox: every glyph's ink, ISO 32000-1 §9.8.1)
 * meets there, or to every crop where the font gives no box, so that no ink of the crop's is lost. A path, an image, a form is
 * the crop's where its own box meets the crop's region.
 */
export interface Within {
  own: Box[]
  all: Box[]
}

/** the place state a content's operators set (ISO 32000-1 §8.4.4, §9.3, §9.4), read where a crop is cut by place: the CTM
 *  and the text matrices, the text state the walk's show events do not carry (horizontal scaling, rise, leading, the font's
 *  resource name), the line width and miter limit; `lost`, the text matrix unknown since a show whose widths are not read,
 *  until the next matrix set (a line's move is from the line matrix, which no show moves) */
interface Geo {
  ctm: M
  tm: M
  tlm: M
  th: number
  rise: number
  tl: number
  /** the font's resource name where a Tf chose it; null where a graphics state's /Font did (or none is set) */
  font: string | null
  size: number
  tc: number
  tw: number
  tr: number
  lw: number
  ml: number
  lost: boolean
  /** the resources the font's name was chosen in (a form that inherits its caller's font names it in its caller's) */
  fontRes: PdfObject | undefined
  stack: Pick<Geo, 'ctm' | 'th' | 'rise' | 'tl' | 'font' | 'fontRes' | 'size' | 'tc' | 'tw' | 'tr' | 'lw' | 'ml'>[]
}
/** a form's place state where it is painted: its matrix after the painter's CTM, the graphics state's text state inherited */
const geoIn = (ctm: M, from?: Geo): Geo => ({
  ctm,
  tm: I,
  tlm: I,
  th: from?.th ?? 1,
  rise: from?.rise ?? 0,
  tl: from?.tl ?? 0,
  font: from?.font ?? null,
  fontRes: from?.fontRes,
  size: from?.size ?? 0,
  tc: from?.tc ?? 0,
  tw: from?.tw ?? 0,
  tr: from?.tr ?? 0,
  lw: from?.lw ?? 1,
  ml: from?.ml ?? 10,
  lost: false,
  stack: [],
})
const six = (a: Operand[]): M | null =>
  a.length >= 6 && a.slice(0, 6).every((x) => typeof x === 'number') ? (a.slice(0, 6) as M) : null
/** a state operator's effect on the place state (a show's own move is codesAt's) */
const argN = (o: LexOp, i: number) => {
  const v = o.args[i]
  return typeof v === 'number' ? v : 0
}
/** a line's move from the line matrix (Td, TD, T*) */
const lineTo = (g: Geo, tx: number, ty: number) => {
  g.tlm = g.tm = mul([1, 0, 0, 1, tx, ty], g.tlm)
  g.lost = false
}
function track(g: Geo, o: LexOp): void {
  const a = o.args
  switch (o.op) {
    case 'q':
      g.stack.push({
        ctm: g.ctm,
        th: g.th,
        rise: g.rise,
        tl: g.tl,
        font: g.font,
        fontRes: g.fontRes,
        size: g.size,
        tc: g.tc,
        tw: g.tw,
        tr: g.tr,
        lw: g.lw,
        ml: g.ml,
      })
      break
    case 'Q':
      Object.assign(g, g.stack.pop() ?? {})
      break
    case 'cm': {
      const m = six(a)
      if (m) g.ctm = mul(m, g.ctm)
      break
    }
    case 'w':
      g.lw = argN(o, 0)
      break
    case 'M':
      g.ml = argN(o, 0)
      break
    case 'BT':
      g.tm = g.tlm = I
      g.lost = false
      break
    case 'Tm': {
      const m = six(a)
      if (m) {
        g.tm = g.tlm = m
        g.lost = false
      }
      break
    }
    case 'TD':
      g.tl = -argN(o, 1)
      lineTo(g, argN(o, 0), argN(o, 1))
      break
    case 'Td':
      lineTo(g, argN(o, 0), argN(o, 1))
      break
    case '"':
      g.tw = argN(o, 0)
      g.tc = argN(o, 1)
      lineTo(g, 0, -g.tl)
      break
    case 'T*':
    case "'":
      lineTo(g, 0, -g.tl)
      break
    case 'Tc':
      g.tc = argN(o, 0)
      break
    case 'Tw':
      g.tw = argN(o, 0)
      break
    case 'Tr':
      g.tr = argN(o, 0)
      break
    case 'TL':
      g.tl = argN(o, 0)
      break
    case 'Tz':
      g.th = argN(o, 0) / 100
      break
    case 'Ts':
      g.rise = argN(o, 0)
      break
    case 'Tf':
      g.font = nameOf(a[0])
      g.size = argN(o, 1)
      break
  }
}
/** a show's array of strings and numbers as its operator holds it */
const arrayOf = (o: LexOp): Operand[] =>
  o.op === 'TJ' ? (Array.isArray(o.args[0]) ? o.args[0] : []) : [o.args[o.op === '"' ? 2 : 0] ?? null]
/** each code of a show where it stands: its advance on its baseline (`seg`) and its font's box (`box`, `fbox` in text space
 *  at size 1: none where the font gives none), page space; the text matrix moved past the show. Null where its widths or its
 *  place are not known (the matrix lost after it). `want` false: the move alone */
function codesAt(
  g: Geo,
  e: ShowEvent | undefined,
  arr: Operand[],
  fbox: Box | null,
  want: boolean,
): { seg: Box; box: Box | null }[] | null {
  if (!e || g.lost || !e.state.font.width || e.state.font.vertical || e.state.font.refused) {
    g.lost = true
    return null
  }
  const { size, Tc, Tw } = e.state
  const width = e.state.font.width
  const m = want ? mul(g.tm, g.ctm) : I
  const out: { seg: Box; box: Box | null }[] = []
  let x = 0
  let k = 0
  arr.forEach((el, ei) => {
    if (typeof el === 'number') {
      x -= (el / 1000) * size * g.th
      return
    }
    for (; k < e.codes.length && e.codes[k]!.ei === ei; k++) {
      const c = e.codes[k]!
      const w = width(c.v) * size
      if (want) {
        const [a, b, cc, d] = fbox ?? [0, 0, 0, 0]
        out.push({
          seg: boxOf(m, [x, g.rise, x + w * g.th, g.rise]),
          box: fbox
            ? boxOf(m, [
                x + a * size * g.th,
                g.rise + b * size,
                x + cc * size * g.th,
                g.rise + d * size,
                x + a * size * g.th,
                g.rise + d * size,
                x + cc * size * g.th,
                g.rise + b * size,
              ])
            : null,
        })
      }
      x += (w + Tc + (c.ce - c.cs === 1 && c.v === 32 ? Tw : 0)) * g.th
    }
  })
  g.tm = mul([1, 0, 0, 1, x, 0], g.tm)
  return out
}
/** a rectangle's four corners (x0, y0, x1, y1 given): under a turn or a shear its box needs all four (#690, 4712006434) */
const corners = (r: readonly number[]) => [r[0]!, r[1]!, r[2]!, r[1]!, r[0]!, r[3]!, r[2]!, r[3]!]
/** the points a path's construction names (a rectangle by its four corners), user space */
const pointsOf = (path: LexOp[]): number[] =>
  path.flatMap((p) => {
    const a = p.args.filter((x): x is number => typeof x === 'number')
    return p.op === 're' && a.length >= 4 ? corners([a[0]!, a[1]!, a[0]! + a[2]!, a[1]! + a[3]!]) : a
  })
/** a name as a content stream writes it: a byte outside '!' to '~', a delimiter or '#' as #xx (ISO 32000-1 §7.3.5) */
const nameTok = (s: string) =>
  `/${[...new TextEncoder().encode(s)].map((b) => (b < 0x21 || b > 0x7e || '()<>[]{}/%#'.includes(String.fromCharCode(b)) ? `#${b.toString(16).toUpperCase().padStart(2, '0')}` : String.fromCharCode(b))).join('')}`
const hexOf = (b: Uint8Array) => [...b].map((x) => x.toString(16).toUpperCase().padStart(2, '0')).join('')

/** a form a crop's source draws, baked as the source is: its content with its groups' ink alone, and the forms it draws so */
export interface BakedForm {
  /** its name where the content that draws it draws it (AXTB<n>) */
  name: string
  /** the form it is a copy of: its dictionary, its own content baked */
  st: PdfObject
  /** the resources its content names: the form's own, or those it takes from what draws it */
  res: PdfObject | undefined
  bytes: Uint8Array
  /** the baked forms it draws in turn */
  forms: BakedForm[]
}
/** `ours(prop, res)`: true for a group of ours turned off, false for one of ours left on, null for a name that is none of ours;
 *  `res` the resources the name is read in (the page's, or a form's own) */
export type Ours = (prop: string, res: PdfObject | undefined) => boolean | null

export interface Baker {
  /** page `pageIndex`'s content baked (`ours` over its groups); `dropFree`, the ink in none of our groups dropped too. Null where
   *  the walk refuses the page */
  bake(pageIndex: number, ours: Ours, stats: BakeStats, dropFree?: boolean): Uint8Array | null
  /**
   * A crop's source: page `pageIndex`'s content with the ink of the groups `ours` leaves on alone (every other ink dropped, as
   * `bake`'s dropFree), and each form it draws whose content (or a form within it, to the walk's own depth) marks one of
   * those groups drawn as a baked copy of it, its ink of those groups alone (the paper's figure a form whose text the add-on
   * wrapped inside it: the crop's ink is there, never in the page's own content). Null where the walk refuses
   */
  bakeCrop(
    pageIndex: number,
    ours: Ours,
    stats: BakeStats,
    within?: Within,
  ): { bytes: Uint8Array; forms: BakedForm[] } | null
}

type Piece = { bytes: Uint8Array; ops: LexOp[] }
/** a page read once for every bake of it (the page's own, and each crop's source on it): its walk's refusal, or what the walk
 *  read: each container's shows and the forms it draws (by piece and operator end), the page's own pieces. `full`: its forms'
 *  shows and the forms they draw kept, which its crops read; for the page read last alone (a figure's walk can hold megabytes
 *  of operators), the others keep their page's own shows, which its bake reads */
type Read =
  | { refused: true }
  | {
      pc: Container
      shows: Map<Container, Map<string, ShowEvent>>
      forms: Map<Container, Map<string, Container>>
      pieces: Piece[]
      full: boolean
    }

export function makeBaker(R: Walker): Baker {
  const read = new Map<number, Read>()
  let fullPage = -1
  /** page `pageIndex` read (`full`: its forms too, a crop's source reads them: walked again where they were let go) */
  const readPage = (pageIndex: number, full = false): Read => {
    const had = read.get(pageIndex)
    if (had && ('refused' in had || had.full || !full)) return had
    const w = R.walkPage(pageIndex)
    let got: Read
    if (w.problems.length) got = { refused: true }
    else {
      const shows = new Map<Container, Map<string, ShowEvent>>()
      const forms = new Map<Container, Map<string, Container>>()
      const at = (c: Container, pi: number, oi: number) => `${pi}:${c.ops[pi]![oi]!.e}`
      for (const e of w.events) {
        if (e.kind === 'show') {
          const m = shows.get(e.cont) ?? new Map<string, ShowEvent>()
          shows.set(e.cont, m)
          m.set(at(e.cont, e.pi, e.oi), e)
        } else if (e.kind === 'form') {
          const m = forms.get(e.cont) ?? new Map<string, Container>()
          forms.set(e.cont, m)
          m.set(at(e.cont, e.pi, e.oi), e.child)
        }
      }
      const pieces = w.pc.pieces.map((p) => {
        const bytes = p.st ? R.decode(p.st) : new Uint8Array(0)
        return { bytes, ops: lex(bytes) as LexOp[] }
      })
      got = { pc: w.pc, shows, forms, pieces, full: true }
      // (the page read before keeps its own shows alone, its forms let go)
      const before = read.get(fullPage)
      if (fullPage !== pageIndex && before && !('refused' in before))
        read.set(fullPage, {
          pc: before.pc,
          shows: new Map([[before.pc, before.shows.get(before.pc) ?? new Map<string, ShowEvent>()]]),
          forms: new Map(),
          pieces: before.pieces,
          full: false,
        })
      fullPage = pageIndex
    }
    read.set(pageIndex, got)
    return got
  }
  /** a form's own content: its bytes decoded and every operator of them (the walk keeps the operators it reads alone: no
   *  marked content, no text object; a show's and a form's place, the end of its operator in the bytes, is the same in both).
   *  Kept for one page's crops at a time: a form's container is its page's walk's, and a figure's form can be megabytes */
  const lexed = new Map<Container, Piece[]>()
  let lexedPage = -1
  /** each show's place in a container (codesAt's) and the state before it, by its piece and its operator's end: one page's at
   *  a time, as `lexed` (the text matrix is then moved by no later pass: what reads it reads these) */
  const places = new Map<Container, Map<string, { pre: Geo; at: { seg: Box; box: Box | null }[] | null }>>()
  const placesOf = (c: Container) => {
    let m = places.get(c)
    if (!m) {
      m = new Map()
      places.set(c, m)
    }
    return m
  }
  const piecesOf = (c: Container): Piece[] => {
    const had = lexed.get(c)
    if (had) return had
    const bytes = c.st ? R.decode(c.st) : new Uint8Array(0)
    const got = [{ bytes, ops: lex(bytes) as LexOp[] }]
    lexed.set(c, got)
    return got
  }

  /** an array's numbers (null where it is none, or holds anything else) */
  const numsOf = (v: PdfObject | undefined): number[] | null => {
    const a = R.look(v)
    if (!(a instanceof R.PL.PDFArray)) return null
    const out = a.asArray().map((x) => {
      const n = R.look(x)
      return n instanceof R.PL.PDFNumber ? n.asNumber() : Number.NaN
    })
    return out.every(Number.isFinite) ? out : null
  }
  /** a font's box, text space at size 1, by its name in the resources `res`: its FontBBox (a Type 3 font's under its
   *  FontMatrix, any other's in thousandths), a Type0 font's its descendant's; null where it gives none, or one of no area */
  const boxes = new Map<PdfObject | undefined, Map<string, Box | null>>()
  const fontBox = (name: string | null, res: PdfObject | undefined): Box | null => {
    if (name === null) return null
    const byName = boxes.get(res) ?? new Map<string, Box | null>()
    boxes.set(res, byName)
    if (byName.has(name)) return byName.get(name)!
    const f = R.get(R.get(R.look(res), 'Font'), name)
    let b: Box | null = null
    if (R.nameOf(R.get(f, 'Subtype')) === 'Type3') {
      const bb = numsOf(R.get(f, 'FontBBox'))
      const fm = six(numsOf(R.get(f, 'FontMatrix')) ?? [])
      if (bb?.length === 4 && fm) b = boxOf(fm, [bb[0]!, bb[1]!, bb[2]!, bb[3]!, bb[0]!, bb[3]!, bb[2]!, bb[1]!])
    } else {
      const d = R.look(R.get(f, 'DescendantFonts'))
      const cid = d instanceof R.PL.PDFArray ? R.look(d.get(0)) : f
      const bb = numsOf(R.get(R.get(cid, 'FontDescriptor'), 'FontBBox'))
      if (bb?.length === 4)
        b = [
          Math.min(bb[0]!, bb[2]!) / 1000,
          Math.min(bb[1]!, bb[3]!) / 1000,
          Math.max(bb[0]!, bb[2]!) / 1000,
          Math.max(bb[1]!, bb[3]!) / 1000,
        ]
    }
    if (b && !(b[2] > b[0] && b[3] > b[1])) b = null
    byName.set(name, b)
    return b
  }

  /** one container's content baked: `mc0` its starting frame (the free ink's rule); `sink`, a crop's, the forms of its groups
   *  baked as copies into it (null: every form drawn as it is or dropped, as the bake has always done); `within`, a crop's
   *  own groups' ink cut by place (Within), `geo` the place state the content starts in */
  const run = (
    page: Exclude<Read, { refused: true }>,
    cont: Container,
    pieces: Piece[],
    ours: Ours,
    st: BakeStats,
    dropFree: boolean,
    sink: BakedForm[] | null,
    names: { n: number },
    holds: (c: Container) => boolean,
    within: Within | null = null,
    geo: Geo = geoIn(I),
    dirty0 = false,
  ): Uint8Array => {
    const shows = page.shows.get(cont) ?? new Map<string, ShowEvent>()
    const forms = page.forms.get(cont)
    const res = cont.res
    const out: Uint8Array[] = []
    const NL = enc('\n')
    /** the marked-content frames: ours, and whether its content is dropped */
    const mc: { ours: boolean; drop: boolean }[] = [{ ours: false, drop: dropFree }]
    const dropping = () => mc[mc.length - 1]!.drop
    let path: LexOp[] = []
    let clip = false
    /** a crop's form, the lean form: out of its own groups it writes no show and no text state or text position at all, so
     *  that what it writes stands apart from the content's own state; `state`, the text state written differs from the
     *  content's (a Tf, Tc, Tw, Tz, TL, Ts or Tr left out), `pos`, the text matrices do (a show or a line's move left out) */
    const dirty = { state: dirty0, pos: false }
    const saved: boolean[] = []
    /** before a show or a line's move is written: the content's own text state and line set again where they were left out
     *  (its line matrix, and the way along the line to its text matrix as a TJ's number) */
    const sync = (p: Geo, stateAlone = false) => {
      if (dirty.state) {
        // (a font's name is written in the resources it was chosen in alone: a font a form inherits from its caller is
        // written by its caller, before the form is drawn; #690, 4712232449)
        const f = p.font !== null && p.fontRes === res ? `${nameTok(p.font)} ${num(p.size)} Tf ` : ''
        out.push(
          enc(
            `${f}${num(p.tc)} Tc ${num(p.tw)} Tw ${num(p.th * 100)} Tz ${num(p.tl)} TL ${num(p.rise)} Ts ${p.tr} Tr\n`,
          ),
        )
        dirty.state = false
      }
      if (dirty.pos && !stateAlone) {
        out.push(enc(`${p.tlm.map(num).join(' ')} Tm\n`))
        const l = p.tlm,
          m = p.tm
        const dx = Math.abs(l[0]) >= Math.abs(l[1]) ? (l[0] ? (m[4] - l[4]) / l[0] : 0) : (m[5] - l[5]) / l[1]
        const k = p.size * p.th
        if (Math.abs(dx) > 1e-9 && k) out.push(enc(`[${num((-dx * 1000) / k)}] TJ\n`))
        dirty.pos = false
      }
    }
    /** a box of the page that is the crop's: meeting its own region */
    const mine = (b: Box) => !!within && meetsAny(b, within.own)
    /** a form's box where it is painted: its /BBox under its /Matrix and the CTM */
    const formBox = (c: Container, ctm: M): Box | null => {
      const bb = numsOf(R.get(c.st ?? undefined, 'BBox'))
      return bb && bb.length === 4
        ? boxOf(mul(six(numsOf(R.get(c.st ?? undefined, 'Matrix')) ?? []) ?? I, ctm), corners(bb))
        : null
    }
    for (let pi = 0; pi < pieces.length; pi++) {
      const { bytes, ops } = pieces[pi]!
      const copy = (o: LexOp) => out.push(bytes.subarray(o.s, o.e), NL)
      /** an operator of the crop's own groups, cut by place: a show's codes kept where they are the crop's, the others an
       *  advance in their place; a path painted, an image or a form kept where its box meets the crop's region; a clip kept */
      const bakeCut = (o: LexOp, at: { seg: Box; box: Box | null }[] | null, pre: Geo) => {
        const op = o.op
        if (SHOW.has(op)) {
          const e = shows.get(`${pi}:${o.e}`)
          if (!e || e.state.Tr >= 4 || !e.state.size) {
            sync(pre)
            copy(o)
            return
          }
          if (!at) {
            st.showsWhole++
            sync(pre)
            copy(o)
            return
          }
          // (a code of no advance has no place on its line of its own: its ink, past its origin, goes by its font's box;
          // #690, 4712014293)
          const keep = at.map(({ seg, box }) => {
            if ((seg[2] > seg[0] || seg[3] > seg[1]) && meetsAny(seg, within!.all)) return mine(seg)
            st.codesByBox++
            return !box || mine(box)
          })
          const kept = keep.filter(Boolean).length
          st.codesKept += kept
          st.codesOut += keep.length - kept
          if (!kept) {
            // (none of its codes the crop's: written as nothing, as a show out of its groups)
            dirty.pos = true
            if (op === '"') dirty.state = true
            return
          }
          sync(pre)
          if (kept === keep.length) {
            copy(o)
            return
          }
          // (the show again: its codes kept as they were, each other an advance of its own width, so that every code after it
          // stands where it stood)
          const { size, Tc, Tw } = e.state
          const width = e.state.font.width!
          const toks: (number | string)[] = []
          const add = (t: number | string) => {
            const last = toks[toks.length - 1]
            if (typeof t === 'number' && typeof last === 'number') toks[toks.length - 1] = last + t
            else if (typeof t === 'string' && typeof last === 'string') toks[toks.length - 1] = last + t
            else toks.push(t)
          }
          let k = 0
          arrayOf(o).forEach((el, ei) => {
            if (typeof el === 'number') add(el)
            else
              for (; k < e.codes.length && e.codes[k]!.ei === ei; k++) {
                const c = e.codes[k]!
                if (keep[k] && el && typeof el === 'object' && !Array.isArray(el) && el.t === 'str')
                  add(hexOf(el.b.subarray(c.cs, c.ce)))
                else add((-(width(c.v) * size + Tc + (c.ce - c.cs === 1 && c.v === 32 ? Tw : 0)) * 1000) / size)
              }
          })
          if (op === "'") out.push(enc('T*\n'))
          if (op === '"') out.push(enc(`${fmt(o.args[0] as number)} Tw ${fmt(o.args[1] as number)} Tc T*\n`))
          out.push(enc(`[${toks.map((t) => (typeof t === 'number' ? fmt(t) : `<${t}>`)).join(' ')}] TJ\n`))
          return
        }
        if (PATH.has(op) || op === 'W' || op === 'W*') {
          path.push(o)
          if (op === 'W' || op === 'W*') clip = true
          return
        }
        if (PAINT.has(op)) {
          // (a stroke reaches half its width past its path, a miter join its miter limit times that)
          const scale = Math.max(Math.hypot(geo.ctm[0], geo.ctm[1]), Math.hypot(geo.ctm[2], geo.ctm[3]))
          const reach = 'SsBb'.includes(op[0]!) ? ((Math.max(geo.lw, 0) * Math.max(geo.ml, 1)) / 2) * scale : 0
          const b = boxOf(geo.ctm, pointsOf(path))
          if (op !== 'n' && mine([b[0] - reach, b[1] - reach, b[2] + reach, b[3] + reach])) {
            for (const p of path) copy(p)
            copy(o)
          } else if (clip) {
            for (const p of path) copy(p)
            out.push(enc('n\n'))
            st.clipsKept++
          } else if (op !== 'n') st.inkOut++
          path = []
          clip = false
          return
        }
        if (op === 'Do' || op === 'BI') {
          const child = op === 'Do' ? forms?.get(`${pi}:${o.e}`) : undefined
          const b = child ? formBox(child, geo.ctm) : boxOf(geo.ctm, [0, 0, 1, 1, 0, 1, 1, 0])
          if (!b || mine(b)) {
            // (a form kept draws its text in the text state it inherits: written here first; #690, 4712685183)
            if (child) sync(geo, true)
            copy(o)
          } else st.inkOut++
          return
        }
        copy(o)
      }
      for (const o of ops) {
        const op = o.op
        // (the place state, where a crop is cut by place: every operator's, whatever group it stands in)
        let at: { seg: Box; box: Box | null }[] | null = null
        const cut = !!within && !dropping() && op !== 'BDC' && op !== 'BMC' && op !== 'EMC'
        // (a show's place, and the state before it, which a left-out state is written again from: read by the page's first
        // crop's pass, every show's, and kept for its other crops' (a page of 2,195 crops walked each show's codes 2,195 times))
        const placed = within && SHOW.has(op) ? placesOf(cont) : null
        const key = placed ? `${pi}:${o.e}` : ''
        let had = placed?.get(key)
        let pre: Geo = within && SHOW.has(op) && !had ? { ...geo } : geo
        if (within) {
          if (!SHOW.has(op) || op === "'" || op === '"') track(geo, o)
          if (op === 'Tf') geo.fontRes = res
          // (the lean form writes no text state and no line of the content's own: each show it writes is preceded by them, as
          // they stand there)
          if (TEXT_STATE.has(op)) {
            dirty.state = true
            continue
          }
          if (TEXT_LINE.has(op)) {
            // (TD sets the leading too)
            dirty.pos = true
            if (op === 'TD') dirty.state = true
            continue
          }
          // (a graphics state saved and restored holds its text state: what was written, and so whether it differs, with it;
          // a text object begun sets both matrices, the written one and the content's, alike)
          if (op === 'q') saved.push(dirty.state)
          if (op === 'Q') dirty.state = saved.pop() ?? dirty.state
          if (op === 'BT') dirty.pos = false
          // (a graphics state that chooses a font, /Font [font size] (ISO 32000-1 §8.4.5), is written as it stands, and so
          // is the font it chooses: no Tf of the content's is written over it, its size the line's way is measured at;
          // #690, 4712006427)
          // (and its line width and miter limit, /LW and /ML, a stroke's reach; #690, 4712232455)
          if (op === 'gs') {
            const d = R.get(R.get(R.look(res), 'ExtGState'), nameOf(o.args[0]) ?? '')
            const f = R.look(R.get(d, 'Font'))
            const size = f instanceof R.PL.PDFArray ? R.look(f.get(1)) : undefined
            if (size instanceof R.PL.PDFNumber) {
              geo.font = null
              geo.size = size.asNumber()
            }
            const lw = R.look(R.get(d, 'LW')),
              ml = R.look(R.get(d, 'ML'))
            if (lw instanceof R.PL.PDFNumber) geo.lw = lw.asNumber()
            if (ml instanceof R.PL.PDFNumber) geo.ml = ml.asNumber()
          }
          if (placed) {
            if (!had) {
              had = { pre, at: codesAt(geo, shows.get(key), arrayOf(o), fontBox(geo.font, geo.fontRes ?? res), true) }
              placed.set(key, had)
            }
            pre = had.pre
            at = had.at
          }
        }
        if (cut) {
          bakeCut(o, at, pre)
          continue
        }
        if (op === 'BDC' || op === 'BMC') {
          const prop = op === 'BDC' && nameOf(o.args[0]) === 'OC' ? nameOf(o.args[1]) : null
          const mine = prop !== null ? ours(prop, res) : null
          // (a group of ours drops what an enclosing group of ours drops, never what the free ink's rule drops: a crop's
          // own group stands in ink dropped as free)
          if (mine !== null) mc.push({ ours: true, drop: (mc.some((f) => f.ours) && dropping()) || mine })
          else {
            if (!dropping()) copy(o)
            mc.push({ ours: false, drop: dropping() })
          }
          continue
        }
        if (op === 'EMC') {
          const f = mc.length > 1 ? mc.pop() : undefined
          if (!f || (!f.ours && !f.drop)) copy(o)
          continue
        }
        if (!dropping()) {
          copy(o)
          continue
        }
        // ---- inside a group turned off
        if (SHOW.has(op)) {
          st.shows++
          const e = shows.get(`${pi}:${o.e}`)
          // (a show that clips, render modes 4 to 7: its outlines added to the clip, nothing painted, its mode restored after
          // it: a clip stays a clip)
          const tr = e?.state.Tr ?? 0
          if (tr >= 4) {
            st.clipsKept++
            if (within) sync(pre)
            out.push(enc('7 Tr\n'))
            copy(o)
            out.push(enc(`${tr} Tr\n`))
            continue
          }
          // (a crop's form: a show out of its own groups written as nothing at all, nor its advance)
          if (within && at && e) {
            dirty.pos = true
            if (op === '"') dirty.state = true
            continue
          }
          if (within) sync(pre)
          const items = op === 'TJ' ? ((o.args[0] as Operand[]) ?? []) : []
          const tx = e ? advanceOf(e, items) : null
          if (tx === null) {
            // (drawn invisibly where it stands: its place, and all after it, kept)
            st.showsUnknown++
            out.push(enc('3 Tr\n'))
            copy(o)
            out.push(enc(`${e?.state.Tr ?? 0} Tr\n`))
            continue
          }
          if (op === "'") out.push(enc('T*\n'))
          if (op === '"') out.push(enc(`${fmt(o.args[0] as number)} Tw ${fmt(o.args[1] as number)} Tc T*\n`))
          const size = e!.state.size
          if (size) out.push(enc(`[${fmt((-tx * 1000) / size)}] TJ\n`))
          continue
        }
        if (PATH.has(op) || op === 'W' || op === 'W*') {
          path.push(o)
          if (op === 'W' || op === 'W*') clip = true
          continue
        }
        if (PAINT.has(op)) {
          if (clip) {
            for (const p of path) copy(p)
            out.push(enc('n\n'))
            st.clipsKept++
          } else st.paints++
          path = []
          clip = false
          continue
        }
        if (op === 'Do' || op === 'BI' || op === 'sh') {
          // (a crop's: a form dropped as free ink, in no group of ours, whose content marks one of the crop's own groups, drawn
          // as a copy baked as this content is, under a name of its own; to the walk's depth, each form as the walk met it)
          const child = op === 'Do' && sink && !mc.some((f) => f.ours) ? forms?.get(`${pi}:${o.e}`) : undefined
          if (child?.st && holds(child)) {
            // (the text state the form inherits, written here, in the resources its names were chosen in)
            if (within) sync(geo, true)
            const inner: BakedForm[] = []
            const baked = run(
              page,
              child,
              piecesOf(child),
              ours,
              st,
              true,
              inner,
              names,
              holds,
              within,
              within ? geoIn(mul(six(numsOf(R.get(child.st, 'Matrix')) ?? []) ?? I, geo.ctm), geo) : undefined,
              false,
            )
            const name = `AXTB${names.n++}`
            sink!.push({ name, st: child.st, res: child.res, bytes: baked, forms: inner })
            st.formsBaked++
            out.push(enc(`/${name} Do\n`))
            continue
          }
          st.images++
          continue
        }
        copy(o)
      }
    }
    let n = 0
    for (const p of out) n += p.length
    const b = new Uint8Array(n)
    let at = 0
    for (const p of out) {
      b.set(p, at)
      at += p.length
    }
    return b
  }
  /** whether a container (or a form it draws, to the walk's depth) marks a group `ours` leaves on: a crop's own */
  const holdsOf = (page: Exclude<Read, { refused: true }>, ours: Ours) => {
    const memo = new Map<Container, boolean>()
    const marks = (c: Container): boolean => {
      for (const { ops } of c === page.pc ? page.pieces : piecesOf(c))
        for (const o of ops) {
          if (o.op !== 'BDC' || nameOf(o.args[0]) !== 'OC') continue
          const p = nameOf(o.args[1])
          if (p !== null && ours(p, c.res) === false) return true
        }
      return false
    }
    const holds = (c: Container): boolean => {
      const had = memo.get(c)
      if (had !== undefined) return had
      memo.set(c, false)
      const h = marks(c) || [...(page.forms.get(c)?.values() ?? [])].some(holds)
      memo.set(c, h)
      return h
    }
    return holds
  }
  return {
    bake(pageIndex, ours, st, dropFree = false) {
      const page = readPage(pageIndex)
      if ('refused' in page) {
        st.refused++
        return null
      }
      st.pages++
      return run(page, page.pc, page.pieces, ours, st, dropFree, null, { n: 0 }, () => false)
    },
    bakeCrop(pageIndex, ours, st, within) {
      const page = readPage(pageIndex, true)
      if ('refused' in page) {
        st.refused++
        return null
      }
      st.pages++
      if (pageIndex !== lexedPage) {
        lexed.clear()
        places.clear()
        lexedPage = pageIndex
      }
      const forms: BakedForm[] = []
      const bytes = run(
        page,
        page.pc,
        page.pieces,
        ours,
        st,
        true,
        forms,
        { n: 0 },
        holdsOf(page, ours),
        within ?? null,
        geoIn(I),
      )
      return { bytes, forms }
    },
  }
}
