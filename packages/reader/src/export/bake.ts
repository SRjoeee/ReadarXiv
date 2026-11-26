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
import { type LexOp, lex, type Operand, type ShowEvent, type Walker } from '@readarxiv/engine'

export interface BakeStats {
  pages: number
  /** pages the walk refused (left unbaked) */
  refused: number
  shows: number
  showsUnknown: number
  paints: number
  images: number
  clipsKept: number
}
export const newBakeStats = (): BakeStats => ({
  pages: 0,
  refused: 0,
  shows: 0,
  showsUnknown: 0,
  paints: 0,
  images: 0,
  clipsKept: 0,
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

export interface Baker {
  /** page `pageIndex`'s content baked: `ours(prop)` true for a group of ours turned off, false for one of ours left on, null
   *  for a name that is none of ours; `dropFree`, the ink in none of our groups dropped too (a crop's source: its own groups'
   *  ink alone). Null where the walk refuses the page */
  bake(
    pageIndex: number,
    ours: (prop: string) => boolean | null,
    stats: BakeStats,
    dropFree?: boolean,
  ): Uint8Array | null
}

export function makeBaker(R: Walker): Baker {
  /** a page read once for every bake of it (the page's own, and each crop's source on it): its walk's refusal, or its
   *  shows by their piece and the operator's end, and each piece's bytes and operators */
  const read = new Map<
    number,
    { refused: true } | { shows: Map<string, ShowEvent>; pieces: { bytes: Uint8Array; ops: LexOp[] }[] }
  >()
  const readPage = (pageIndex: number) => {
    let got = read.get(pageIndex)
    if (got) return got
    const w = R.walkPage(pageIndex)
    if (w.problems.length) got = { refused: true }
    else {
      const shows = new Map<string, ShowEvent>()
      for (const e of w.events)
        if (e.kind === 'show' && e.cont === w.pc) shows.set(`${e.pi}:${e.cont.ops[e.pi]![e.oi]!.e}`, e)
      const pieces = w.pc.pieces.map((p) => {
        const bytes = p.st ? R.decode(p.st) : new Uint8Array(0)
        return { bytes, ops: lex(bytes) as LexOp[] }
      })
      got = { shows, pieces }
    }
    read.set(pageIndex, got)
    return got
  }
  return {
    bake(pageIndex, ours, st, dropFree = false) {
      const page = readPage(pageIndex)
      if ('refused' in page) {
        st.refused++
        return null
      }
      st.pages++
      const { shows } = page
      const out: Uint8Array[] = []
      const NL = enc('\n')
      /** the marked-content frames: ours, and whether its content is dropped */
      const mc: { ours: boolean; drop: boolean }[] = [{ ours: false, drop: dropFree }]
      const dropping = () => mc[mc.length - 1]!.drop
      let path: LexOp[] = []
      let clip = false
      for (let pi = 0; pi < page.pieces.length; pi++) {
        const { bytes, ops } = page.pieces[pi]!
        const copy = (o: LexOp) => out.push(bytes.subarray(o.s, o.e), NL)
        for (const o of ops) {
          const op = o.op
          if (op === 'BDC' || op === 'BMC') {
            const prop = op === 'BDC' && nameOf(o.args[0]) === 'OC' ? nameOf(o.args[1]) : null
            const mine = prop !== null ? ours(prop) : null
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
    },
  }
}
