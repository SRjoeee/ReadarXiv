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
})

const PAINT = new Set(['S', 's', 'f', 'F', 'f*', 'B', 'B*', 'b', 'b*', 'n'])
const PATH = new Set(['m', 'l', 'c', 'v', 'y', 'h', 're'])
const SHOW = new Set(['Tj', 'TJ', "'", '"'])
const enc = (s: string) => {
  const b = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255
  return b
}
const nameOf = (a: Operand | undefined) =>
  a && typeof a === 'object' && !Array.isArray(a) && a.t === 'name' ? a.v : null
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
  bakeCrop(pageIndex: number, ours: Ours, stats: BakeStats): { bytes: Uint8Array; forms: BakedForm[] } | null
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
  const piecesOf = (c: Container): Piece[] => {
    const had = lexed.get(c)
    if (had) return had
    const bytes = c.st ? R.decode(c.st) : new Uint8Array(0)
    const got = [{ bytes, ops: lex(bytes) as LexOp[] }]
    lexed.set(c, got)
    return got
  }

  /** one container's content baked: `mc0` its starting frame (the free ink's rule); `sink`, a crop's, the forms of its groups
   *  baked as copies into it (null: every form drawn as it is or dropped, as the bake has always done) */
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
    for (let pi = 0; pi < pieces.length; pi++) {
      const { bytes, ops } = pieces[pi]!
      const copy = (o: LexOp) => out.push(bytes.subarray(o.s, o.e), NL)
      for (const o of ops) {
        const op = o.op
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
            out.push(enc('7 Tr\n'))
            copy(o)
            out.push(enc(`${tr} Tr\n`))
            continue
          }
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
            const inner: BakedForm[] = []
            const baked = run(page, child, piecesOf(child), ours, st, true, inner, names, holds)
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
    bakeCrop(pageIndex, ours, st) {
      const page = readPage(pageIndex, true)
      if ('refused' in page) {
        st.refused++
        return null
      }
      st.pages++
      if (pageIndex !== lexedPage) {
        lexed.clear()
        lexedPage = pageIndex
      }
      const forms: BakedForm[] = []
      const bytes = run(page, page.pc, page.pieces, ours, st, true, forms, { n: 0 }, holdsOf(page, ours))
      return { bytes, forms }
    },
  }
}
