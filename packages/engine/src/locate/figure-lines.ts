// A figure's texts as its printed lines tell them (the owner's ruling of 2026-11-10, PDF-READER §18.26): the runs today's figure
// reading cuts (figure-text.mjs figureUnitsOf, its atoms, read as they are) gathered into the lines they stand on, a line that
// holds a run set in a face of one pitch and words of another one figure text whose runs of one pitch are its elements (F0:
// "Project Page:" and its address, a title and its path), a line whose every word stands between glyphs of one pitch kept whole
// (code: Rule 1's inside-a-line, read on the line); and each crowded text's ink (roomOf's `met`) judged by its relation to the
// text, the owner's reformulation of the no-touch rule: its own, a decoration of a stretch of its glyphs (a frame, a fill, a rule;
// a doubled copy), a container round all of it, or other ink: another text's glyph keeps the text the original's, ink that is no
// text never does (step 2, the owner's ruling, PDF-READER §18.36). Pure arithmetic over a page's glyphs and boxes;
// every measure the figure reading's, in its size: RUN_DY, RUN_GAP, SPACE_GAP, DRAW_BAND.
import {
  ANCHOR_REACH,
  DRAW_BAND,
  RUN_DY,
  RUN_GAP,
  SPACE_GAP,
  type TodayFigures,
  type TodayMet,
  type TodayPage,
  type TodayShape,
  interiorOf,
} from './today/today.types.ts'
import type { DocGlyph } from '../doc.ts'
import { glyphWith } from '../glyph.ts'
import { classifyFont, lineEnd, TRACKING_SPACE_FACTOR } from './facts.ts'
import { ledApart, PARA_ALIGN_TOL, type ParaLine, parasOf, sameFace } from './figure-paras.ts'

/** a glyph as the figure reading reads one (pageInk's, a page of today's makers) */
interface G {
  u: string
  font: string
  size: number
  x0: number
  x1: number
  y: number
  top: number
  bottom: number
  ix0?: number
  ix1?: number
  form?: boolean
  fid?: number
  pid?: number
  blank?: boolean
  unseen?: boolean
  fill?: number
}

/** a figure text this reading makes or judges anew */
export interface FigureText {
  /** its runs (figureUnitsOf's units by k), in their line's order: the first its figure group's */
  ks: number[]
  page: number
  /** its pieces in its lines' order: text (its glyphs on its page, by index), an element (`els`' index), or a line's end inside
   *  a paragraph (F3): a space, a word's own hyphen kept and nothing more (`join`), or TeX's hyphen dropped (`drop`) */
  order: ({ t: 'text'; glyphs: number[] } | { t: 'el'; i: number } | { t: 'br'; end: 'space' | 'join' | 'drop' })[]
  /** its elements: `code` (a run of one pitch), `math` (a formula, F1), `cite` (a stretch a decoration holds, a letter in it),
   *  `ref` (one with none); each its glyphs and its boxes (a decoration's, a ground's) on its page */
  els: { kind: 'code' | 'math' | 'cite' | 'ref'; glyphs: number[]; boxes: number[] }[]
  /** an item's marker at its start (a dash, a bullet, "(b)", "1.", "A."): its label, the original's ink where it stands, no
   *  text of it (F3) */
  label: number[]
  /** a paragraph of two lines or more (F3): whether its block is justified, and the evidence its lines are joined by, `strong`
   *  (a join at TeX's hyphen or a justified line's); null a line alone */
  para: { justified: boolean; by: 'strong' | 'container'; align?: 'l' | 'c' | 'r' } | null
  /** glyphs no run held that it takes (a comma between two addresses, a digit): its text's */
  claimed: number[]
  /** a doubled copy of its glyphs (a glyph of one of its characters over one of them): hidden with its text */
  copies: number[]
  /** boxes decorating the whole of it (a rule under all of it): hidden with its text */
  textBoxes: number[]
  /** why its ink stays: crowded (another text's glyph its band meets, or F1's torn formula), code (a line of code, kept whole), formula (a line no word of
   *  which stands outside its formulas, kept whole, F1), or null */
  why: 'crowded' | 'code' | 'formula' | null
  /** a closed shape round all of it: its room's edges over and under its baseline (PDF units up and down from it) */
  container: { over: number; under: number } | null
  /** the depth under its baseline of the stroke under its text (roomOf's `under`) */
  under: number | null
}

const WORD = /\p{L}{2}/u
const LETTER = /\p{L}/u
const bare = (name: string) => String(name ?? '').replace(/^[A-Z]{6}\+/, '')
const real = (g: G | undefined): g is G => !!g && !g.blank && !g.unseen && /\S/u.test(g.u ?? '')
/** the band a translation is drawn in, DRAW_BAND's em: two of it is a line with its leading at most (a ground one line tall) */
const BAND_EM = DRAW_BAND[1] - DRAW_BAND[0]

/** a printed line: its runs and the glyphs no run holds on it, in its order along x */
interface Line {
  ks: number[]
  gs: number[]
  free: Set<number>
  y: number
  size: number
  x0: number
  x1: number
  fig: string
}

/**
 * The figure texts of a document's pages that its printed lines make anew (F0's lines, the lines of code) or whose crowding the
 * relation reading judges otherwise than today's reading: each with its runs (`ks`); a run of no such text stays as today's
 * reading made it. `owned(p, g)`: whether a glyph is a unit's or a block's (no figure's text). `fixed`: the faces the document
 * sets at one pitch where Rule 1 keeps such text (none: no line is read for F0). `textFaces`: the faces the document's source
 * units set their text in (none read: no face is a formula's own by them, F1)
 */
export function figureLinesOf(
  pages: readonly TodayPage[],
  fig: TodayFigures,
  owned: (p: number, g: number) => boolean,
  fixed: ReadonlySet<string> | null,
  textFaces: ReadonlySet<string> | null = null,
  work: LinesWork | null = null,
): FigureText[] {
  W = work
  try {
    const out = linesOf(pages, fig, owned, fixed, textFaces)
    for (const t of out) countKept(t)
    // (step 2 over the turned units the line reading, which reads level lines, never takes: a turned run crowded by ink that is no
    // text alone (an axis's title by its axis) is today's unit laid as it is; one another text's glyph crowds stays the original's)
    for (const u of fig.units)
      if (u.why === 'crowded' && (Math.abs((u.ux ?? 1) - 1) > 1e-6 || Math.abs(u.uy ?? 0) > 1e-6)) {
        if ((fig.met.get(u.k)?.items ?? []).some((it) => 'g' in it)) count('glyph')
        else {
          u.why = null
          count('inked')
        }
      }
    return out
  } finally {
    W = null
  }
}

/**
 * The figure reading's work, counted (deterministic: what the input asks, no clock): `rounds` the line reading's passes (a pass
 * ends at a join and starts again), `pairs` the pairs of lines it tests, `scripts` the pairs the script join tests (F1's, inside
 * each pass that joins nothing), `votes` the glyphs a line's size and baseline are voted over, `faces` the glyphs read for a
 * formula's (mathGlyph: a face's name and a character), `ends` a paragraph's line ends in a hyphen read against the document's
 * text (F3), `boxed` the closed paths whose box holds two units or more (figure-text.mjs containersOf, F3's container step) and
 * `interior` the points read against a closed path's inside, there and in the relation reading. The speed of the prepare's locate where figures are many: 2609.19644v1's
 * included pages
 */
export type LinesWork = {
  rounds: number
  pairs: number
  scripts: number
  votes: number
  faces: number
  ends: number
  boxed: number
  interior: number
  /** the figure texts kept as the original's, by why: another text's glyph met (`glyph`), F1's torn formula (`torn`), a run
   *  crowded by today's reading with no ink met (`today`), a line of code or of formulas kept whole (`code`, `formula`); and
   *  `inked`, the texts laid over ink that is no text their room met (step 2: such ink keeps none) */
  kept?: Record<'glyph' | 'torn' | 'today' | 'code' | 'formula' | 'inked', number>
}
let W: LinesWork | null = null
/** the texts the judge kept for another text's glyph, and those whose room met ink that is no text */
const keptBy = new WeakMap<FigureText, 'glyph'>()
const inkedTexts = new WeakSet<FigureText>()
const count = (k: keyof NonNullable<LinesWork['kept']>) => {
  if (W?.kept) W.kept[k]++
}
const countKept = (t: FigureText) => {
  if (t.why === 'code' || t.why === 'formula') count(t.why)
  else if (t.why === 'crowded') count(keptBy.get(t) ?? 'torn')
  else if (!t.why && inkedTexts.has(t)) count('inked')
}

function linesOf(
  pages: readonly TodayPage[],
  fig: TodayFigures,
  owned: (p: number, g: number) => boolean,
  fixed: ReadonlySet<string> | null,
  textFaces: ReadonlySet<string> | null,
): FigureText[] {
  const out: FigureText[] = []
  const pitch = (g: G) => !!fixed && fixed.has(bare(g.font))
  const built: {
    p: number
    glyphs: G[]
    boxes: number[]
    runOf: Map<number, number[]>
    lines: Line[]
    loose: number[]
  }[] = []
  pages.forEach((pg, pi) => {
    const p = pi + 1
    const glyphs = (pg.glyphs ?? []) as G[]
    const boxes = (pg.boxes ?? []) as number[]
    const map = fig.glyphs[pi]
    if (!map?.size) return
    // ---- the page's level runs, each its glyphs (in their order along x), its baseline, size, extent and figure
    const runOf = new Map<number, number[]>()
    for (const [g, k] of map) (runOf.get(k) ?? runOf.set(k, []).get(k)!).push(g)
    const figOf = (g: G) => `${g.form ? 'f' : 'p'}${g.fid ?? 0}:${g.pid ?? 0}`
    const lines: Line[] = []
    for (const [k, gs0] of runOf) {
      const u = fig.units[k]!
      if (Math.abs((u.ux ?? 1) - 1) > 1e-6 || Math.abs(u.uy ?? 0) > 1e-6) continue
      const gs = gs0.filter((g) => real(glyphs[g])).sort((a, b) => glyphs[a]!.x0 - glyphs[b]!.x0)
      if (!gs.length) continue
      lines.push(lineOf([k], gs, new Set(), glyphs, figOf(glyphs[gs[0]!]!)))
    }
    if (!lines.length) return
    // (a run of one pitch's extent with its ground's: the narrowest box holding its end glyph's band, a line tall at most; a
    // chip's fill where it holds nothing of the words it faces: a ground under the facing glyph's centre as well is one both
    // stand on, a row's band, and the glyphs' own gap decides)
    const groundOf = (g: G, size: number, facing: G): { x0: number; x1: number; id: number } | null => {
      let best: { x0: number; x1: number; id: number } | null = null
      for (let b = 0; b + 3 < boxes.length; b += 4) {
        const bx0 = Math.min(boxes[b]!, boxes[b + 2]!),
          bx1 = Math.max(boxes[b]!, boxes[b + 2]!)
        const by0 = Math.min(boxes[b + 1]!, boxes[b + 3]!),
          by1 = Math.max(boxes[b + 1]!, boxes[b + 3]!)
        if (by1 - by0 <= 0 || by1 - by0 > 2 * BAND_EM * size) continue
        if (!(bx0 <= g.x0 && bx1 >= g.x1 && by0 <= g.bottom && by1 >= g.top)) continue
        if (!best || bx1 - bx0 < best.x1 - best.x0) best = { x0: bx0, x1: bx1, id: b / 4 }
      }
      const c = (facing.x0 + facing.x1) / 2
      return best && (c < best.x0 || c > best.x1) ? best : null
    }
    // ---- lines: runs of one figure on one baseline, consecutive within the run gap (a run's ground's edges counting where the
    // other stands on none: two boxed labels are two), and the glyphs no run holds on the line nearest them within it
    const free: number[] = []
    for (let g = 0; g < glyphs.length; g++) {
      const x = glyphs[g]!
      if (map.has(g) || owned(p, g) || !real(x) || !(x.form || (x.pid ?? 0) > 0)) continue
      free.push(g)
    }
    for (let again = true; again; ) {
      again = false
      if (W) W.rounds++
      lines.sort((a, b) => b.y - a.y || a.x0 - b.x0)
      for (let i = 0; i < lines.length && !again; i++)
        for (let j = i + 1; j < lines.length && !again; j++) {
          if (W) W.pairs++
          const a = lines[i]!,
            b = lines[j]!
          const size = Math.max(a.size, b.size)
          if (a.fig !== b.fig || Math.abs(a.y - b.y) > RUN_DY * size) continue
          let gap = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1)
          if (gap > RUN_GAP * size) {
            // (a chip's fill bridges its run of one pitch to the words beside it: the facing edges, each extended to the ground
            // that holds its end glyph where that glyph is of one pitch; two edges on grounds of their own, two boxed labels; a
            // label on a badge of its own is no chip)
            const [l, r] = a.x0 <= b.x0 ? [a, b] : [b, a]
            const le = glyphs[l.gs.at(-1)!]!,
              re = glyphs[r.gs[0]!]!
            const gl = pitch(le) ? groundOf(le, l.size, re) : null,
              gr = pitch(re) ? groundOf(re, r.size, le) : null
            if (gl && gr && gl.id !== gr.id) continue
            gap = (gr ? gr.x0 : r.x0) - (gl ? gl.x1 : l.x1)
          }
          if (gap > RUN_GAP * size) continue
          lines[i] = lineOf([...a.ks, ...b.ks], [...a.gs, ...b.gs], new Set([...a.free, ...b.free]), glyphs, a.fig)
          lines.splice(j, 1)
          again = true
        }
      for (let q = free.length - 1; q >= 0; q--) {
        const g = glyphs[free[q]!]!
        let best: Line | null = null
        for (const l of lines) {
          if (l.fig !== figOf(g) || Math.abs(g.y - l.y) > 0.5 * Math.max(g.size, l.size)) continue
          if (g.x0 > l.x1 + RUN_GAP * l.size || g.x1 < l.x0 - RUN_GAP * l.size) continue
          if (!best || Math.abs(g.y - l.y) < Math.abs(g.y - best.y)) best = l
        }
        if (!best) continue
        const at = lines.indexOf(best)
        lines[at] = lineOf(best.ks, [...best.gs, free[q]!], new Set([...best.free, free[q]!]), glyphs, best.fig)
        free.splice(q, 1)
        again = true
      }
      // (F1: a script set beside a formula's glyph is its formula's line; the lines and the glyphs no run holds read again after
      // each such join, so that a glyph under the joined line (a sum's lower limit) goes to it and the line closes the gap it
      // spans: 2609.19644v1 p60, whose main line's math glyphs had gone to its superscript runs)
      if (!again && scriptsJoined(lines, glyphs)) again = true
    }
    // (the glyphs no line took: a formula's ink the reading leaves where it is, F1's torn formula)
    built.push({ p, glyphs, boxes, runOf, lines, loose: free })
  })
  // ---- F1: the faces that are a formula's own (fact 3)
  const math: Formulas = { faces: formulaFacesOf(built, textFaces, pitch), pitch }
  // ---- F3: the document's own text, each page's glyphs in their order, a space where two stand apart or a line changes: the
  // source a paragraph's line-end hyphen is read by, as a body unit's is by its own (facts.ts lineEnd: a word the source writes
  // with its hyphen keeps it, one it writes whole drops it, TeX's rules where it writes neither)
  let source: string | null = null
  const sourceOf = () => (source ??= documentText(pages))
  for (const { p, glyphs, boxes, runOf, lines, loose } of built) {
    // ---- each line read: its glyphs' roles, M (a formula's), F (a face of one pitch) or T, in its order
    const reads = lines.map((l) => lineRead(l, glyphs, pitch, math))
    listed(lines, reads, glyphs)
    // (the ink its runs met, each item once: a frame or a tone two runs of one text met is one, judged once)
    const itemsOf = (ks: readonly number[]) => {
      const seen = new Set<string>()
      return ks
        .flatMap((k) => fig.met.get(k)?.items ?? [])
        .filter((it) => {
          const key = 'g' in it ? `g${it.g}` : `b${it.b}${it.ground ? 't' : ''}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
    }
    const underOf = (ks: readonly number[]) =>
      ks.reduce<number | null>((u, k) => {
        const x = fig.met.get(k)?.under ?? fig.units[k]!.under ?? null
        return x === null ? u : u === null ? x : Math.min(u, x)
      }, null)
    const taken = new Set<number>()
    // ---- F3's container step: the lines a closed path holds alone (figure-text.mjs containersOf), two or more, a node's label
    // (below), every one a line of words: one text, its lines top to bottom, centred, its room the path's inside (roomIn)
    for (const h of fig.holds ?? []) {
      if (h.p !== p) continue
      const ks = new Set(h.ks)
      const idx = lines.flatMap((l, i) => (l.ks.length && l.ks.every((k) => ks.has(k)) ? [i] : []))
      if (idx.length < 2 || new Set(idx.flatMap((i) => lines[i]!.ks)).size !== ks.size) continue
      if (
        idx.some(
          (i) => taken.has(i) || !(reads[i]!.kind === 'plain' || reads[i]!.kind === 'mixed') || reads[i]!.marker.length,
        )
      )
        continue
      idx.sort((a, b) => lines[b]!.y - lines[a]!.y || lines[a]!.x0 - lines[b]!.x0)
      // (the runs it holds on one baseline are one line, however far apart their words stand: the path is the fact that holds
      // them together, no wider run gap (the coordinator's (c), 2026-11-11))
      const rows: { l: Line; read: Read }[] = []
      for (const i of idx) {
        const l = lines[i]!
        const r = rows.find((q) => Math.abs(q.l.y - l.y) <= RUN_DY * Math.max(q.l.size, l.size))
        if (!r) rows.push({ l, read: reads[i]! })
        else {
          r.l = lineOf([...r.l.ks, ...l.ks], [...r.l.gs, ...l.gs], new Set([...r.l.free, ...l.free]), glyphs, r.l.fig)
          r.read = lineRead(r.l, glyphs, pitch, math)
        }
      }
      if (rows.length < 2 || rows.some((r) => !(r.read.kind === 'plain' || r.read.kind === 'mixed'))) continue
      const L = rows.map((r) => r.l)
      const F = rows.map((r) => proseFacts(r, glyphs, boxes))
      const tol = PARA_ALIGN_TOL * Math.max(...L.map((l) => l.size))
      const spread = (f: (l: Line) => number) => Math.max(...L.map(f)) - Math.min(...L.map(f))
      // (a node's label as its path sets it: its lines one under the other with no blank line between, in one face, size, weight
      // and fill (a title over a subtitle in another is two texts), no line an item's (a list in a node, 2608.06007v1 p1's "KV
      // Lifecycle - identify - place"), no legend's entries (legendOf: its rows each beside ink of its own inside the path; a
      // leader outside it, a neighbouring node's edge, is none: 2609.26457v1 p6, 2610.22195v1 p9), and centred, as a node sets its
      // label: lines set flush in a path are its rows (a value over a value, 2610.37668v1's PSNR / LPIPS / FPS over each image),
      // and rows of one length show no centring ("plain-18" over "plain-34", 1512.03385v1 p5; "56-layer" over "20-layer", two
      // curves' labels, p1))
      const stacked = F.every(
        (f, n) => !n || (F[n - 1]!.y - f.y > 0.5 * f.size && F[n - 1]!.y - f.y - F[n - 1]!.band < F[n - 1]!.band),
      )
      const legend = legendOf(h.shape, F, boxes)
      // (one text of the rows `sub` of the hold, set as `align`, its room the path's inside; the lines they hold taken)
      const textOfRows = (sub: number[], align: 'l' | 'c' | 'r') => {
        const rs = sub.map((n) => rows[n]!)
        const ft: FigureText = {
          ks: rs.flatMap((r) => r.l.ks),
          page: p,
          order: [],
          els: [],
          label: [],
          para: { justified: false, by: 'container', align },
          claimed: rs.flatMap((r) => r.read.gs.filter((g) => r.l.free.has(g))),
          copies: [],
          textBoxes: [],
          why: null,
          container: null,
          under: null,
        }
        rs.forEach((r, n) => {
          if (n) ft.order.push({ t: 'br', end: endOf(glyphs, rs[n - 1]!.read.gs, r.read.gs, sourceOf, true) })
          piecesInto(ft, r.read, false)
        })
        const items = itemsOf(ft.ks)
        if (items.length) judge(ft, items, glyphs)
        // (torn reads the lines as the text reads them: its rows in place of the runs they merged)
        const mine = idx.filter((i) => lines[i]!.ks.every((k) => ft.ks.includes(k)))
        const others = [...lines.filter((_, i) => !mine.includes(i)), ...rs.map((r) => r.l)]
        if (!ft.why && rs.some((r) => torn(ft, r.l, glyphs, loose, others))) ft.why = 'crowded'
        if (!ft.container)
          ft.container = roomIn(
            h.shape,
            ft.order.flatMap((o) => (o.t === 'text' ? o.glyphs : [])),
            glyphs,
          )
        out.push(ft)
        for (const i of mine) taken.add(i)
      }
      // (centred: the rows' centres one and their left edges not: rows of one length show no alignment, centred or flush)
      const centred = spread((l) => (l.x0 + l.x1) / 2) <= tol && spread((l) => l.x0) > tol
      if (stacked && F.every((f) => sameFace(F[0]!, f)) && !legend && centred) {
        textOfRows(
          rows.map((_, n) => n),
          'c',
        )
        continue
      }
      // (rows set flush in the path (option 3, the coordinator's ruling of 2026-11-11, taken to the owner): a row joins the row
      // above where the break between them is one a wrap made and the sentence goes on. A wrap: the two rows one under the other
      // with no blank line, in one face, not each led by ink of its own, and the break forced, the next row's first word unable to
      // stand on the row above within the measure the path's inside gives it at that row's height, its inset on the flush side
      // mirrored on the other (2608.06701v1 p2's bubbles; no geometric fact tells a box hugging its rows from one text was wrapped
      // into, 99 of 2610.37668v1's 103 value overlays read forced too). The sentence goes on: the row above ends in TeX's or a
      // word's hyphen (lineEnd), or this row's first letter, after any punctuation it opens with, is lower case ("… to inspect
      // the"); a capital, a digit or a symbol begins a row of its own, a value under a value, a list's next statement, as today,
      // and a script without case never joins. A box may so hold several paragraphs; a row alone stays its own text)
      const side = spread((l) => l.x0) <= tol ? 'l' : spread((l) => l.x1) <= tol ? 'r' : null
      if (!side || legend) continue
      const segs = h.shape.segs as ArrayLike<number>
      const firstWord = (r: { read: Read }) => {
        const gs = r.read.gs.filter((g) => real(glyphs[g]!))
        let x1 = glyphs[gs[0]!]!.x1
        for (let i = 1; i < gs.length; i++) {
          const g = glyphs[gs[i]!]!
          if (g.x0 - x1 > SPACE_GAP * g.size) break
          x1 = g.x1
        }
        return x1 - glyphs[gs[0]!]!.x0
      }
      const joins = rows.slice(1).map((r, k) => {
        const a = F[k]!,
          b = F[k + 1]!,
          al = rows[k]!.l
        if (!(a.y - b.y > 0.5 * b.size && a.y - b.y - a.band < a.band) || !sameFace(a, b) || ledApart(a, b))
          return false
        const y = al.y + 0.35 * al.size
        const xs: number[] = []
        for (let i = 0; i + 3 < segs.length; i += 4) {
          const ay = segs[i + 1]!,
            by = segs[i + 3]!
          if (ay > y !== by > y) xs.push(segs[i]! + ((y - ay) * (segs[i + 2]! - segs[i]!)) / (by - ay))
        }
        const right = Math.min(...xs.filter((x) => x >= al.x1 - 0.5)),
          left = Math.max(...xs.filter((x) => x <= al.x0 + 0.5))
        if (!Number.isFinite(right) || !Number.isFinite(left)) return false
        const inset = side === 'l' ? al.x0 - left : right - al.x1
        const space = a.wordSpace ?? b.wordSpace ?? SPACE_GAP * al.size
        if (!(al.x1 - al.x0 + space + firstWord(r) > right - left - 2 * inset)) return false
        if (endOf(glyphs, rows[k]!.read.gs, r.read.gs, sourceOf, true) !== 'space') return true
        return /^\p{Ll}/u.test(textOf(r.read.gs, glyphs).replace(/^[\p{P}\p{Z}]+/u, ''))
      })
      const groups: number[][] = [[0]]
      joins.forEach((j, k) => {
        if (j) groups.at(-1)!.push(k + 1)
        else groups.push([k + 1])
      })
      for (const g of groups) if (g.length > 1) textOfRows(g, side)
    }
    // ---- F3: the lines of prose that are a paragraph's, one text; a line across a justified line's stretched space read whole
    // where the paragraph takes it
    for (const para of figureParas(lines, reads, glyphs, boxes, pitch, math, sourceOf, taken)) {
      const ks = para.lines.flatMap((x) => x.l.ks)
      const ft: FigureText = {
        ks,
        page: p,
        order: [],
        els: [],
        label: para.lines[0]!.read.marker,
        para: { justified: para.justified, by: para.by },
        claimed: para.lines.flatMap((x) => x.read.gs.filter((g) => x.l.free.has(g))),
        copies: [],
        textBoxes: [],
        why: null,
        container: null,
        under: null,
      }
      para.lines.forEach((x, k) => {
        if (k) ft.order.push({ t: 'br', end: para.ends[k - 1]! })
        piecesInto(ft, x.read, k === 0)
      })
      const items = itemsOf(ks)
      if (items.length) judge(ft, items, glyphs)
      // (a formula of a line of it torn from ink no line took: the paragraph the original's, F1's)
      if (!ft.why && para.lines.some((x) => torn(ft, x.l, glyphs, loose, lines))) ft.why = 'crowded'
      out.push(ft)
      for (const i of para.of) taken.add(i)
    }
    // ---- each other line: F0's, F1's or an item's text; a line of code or of formulas kept whole; else its runs as they were
    lines.forEach((l, i) => {
      if (taken.has(i)) return
      const ft = textOfRead(l, reads[i]!)
      // (a tone under a text kept whole, a line of code or a run wholly of one pitch (Rule 1), is nothing to it: the text is the
      // original's, its tones with it)
      const tones = (keep: boolean) => (it: TodayMet) => !(keep && 'ground' in it && it.ground)
      const items = itemsOf(l.ks).filter(tones(ft?.why === 'code'))
      if (ft) {
        ft.page = p
        ft.under = underOf(l.ks)
        if (items.length) judge(ft, items, glyphs)
        if (!ft.why && torn(ft, l, glyphs, loose, lines)) ft.why = 'crowded'
        out.push(ft)
        return
      }
      // (a run alone, as today's reading made it, judged anew where it was crowded or stands in part on a tone)
      if (!items.length) {
        for (const k of l.ks) if (fig.units[k]!.why === 'crowded') count('today')
        return
      }
      for (const k of l.ks) {
        const m = fig.met.get(k)
        if (!m) continue
        const gs = runOf.get(k)!.filter((g) => real(glyphs[g]))
        const its = m.items.filter(tones(gs.every((g) => pitch(glyphs[g]!))))
        if (!its.length) continue
        const one: FigureText = {
          ks: [k],
          page: p,
          order: [{ t: 'text', glyphs: [...gs].sort((a, b) => glyphs[a]!.x0 - glyphs[b]!.x0) }],
          els: [],
          label: [],
          para: null,
          claimed: [],
          copies: [],
          textBoxes: [],
          why: null,
          container: null,
          under: m.under,
        }
        judge(one, its, glyphs)
        if (one.els.length || (fig.units[k]!.why === 'crowded' && one.why !== 'crowded')) out.push(one)
        else if (one.why === 'crowded') countKept(one)
      }
    })
  }
  return out
}

/** (1) a mathematical character outside ASCII (a math symbol, Sm; a Greek letter; a mathematical alphanumeric, U+1D400-1D7FF; a
 *  letter of the letterlike block, U+2100-214F); ASCII's + < = > | ~ count only in a math face (2) */
const MATH_CHAR = /[\p{Sm}\p{Script=Greek}\u{1D400}-\u{1D7FF}]/u
const isMathChar = (u: string) =>
  ![...u].every((c) => c.codePointAt(0)! < 0x80) &&
  (MATH_CHAR.test(u) ||
    [...u].some((c) => c.codePointAt(0)! >= 0x2100 && c.codePointAt(0)! <= 0x214f && LETTER.test(c)))
/** a glyph of a formula by facts (1) and (2): its character a mathematical one, or its face a math face by its name
 *  (classifyFont's `math`: CMMI, CMSY, KaTeX_Math …; a math italic letter's Unicode is the plain letter, so the name is read) */
function mathGlyph(g: G): boolean {
  if (W) W.faces++
  return classifyFont(g.font).fam === 'math' || isMathChar(g.u)
}

/** F1: a line's scripts. A line smaller than another (its size 0.9 of it at most), off its baseline by less than half its size
 *  but more than a baseline's tolerance (RUN_DY), within the run gap of its extent, one of the two holding a formula's glyph by
 *  facts (1) and (2): a script, a subscript word (\text{base}, "Mah" under KaTeX's P), joined to that line. Whether it joined
 *  any */
function scriptsJoined(lines: Line[], glyphs: readonly G[]): boolean {
  let joined = false
  for (let again = true; again; ) {
    again = false
    for (let i = 0; i < lines.length && !again; i++)
      for (let j = 0; j < lines.length && !again; j++) {
        if (W) W.scripts++
        const a = lines[i]!,
          b = lines[j]!
        if (i === j || a.fig !== b.fig || b.size > 0.9 * a.size) continue
        const dy = Math.abs(b.y - a.y)
        if (dy > 0.5 * a.size || dy <= RUN_DY * a.size) continue
        if (b.x0 > a.x1 + RUN_GAP * a.size || b.x1 < a.x0 - RUN_GAP * a.size) continue
        if (![...a.gs, ...b.gs].some((g) => mathGlyph(glyphs[g]!))) continue
        // (its runs in the line's order: the one nearer its start first)
        const [l, r] = a.x0 <= b.x0 ? [a, b] : [b, a]
        lines[i] = lineOf([...l.ks, ...r.ks], [...a.gs, ...b.gs], new Set([...a.free, ...b.free]), glyphs, a.fig)
        lines.splice(j, 1)
        again = true
        joined = true
      }
  }
  return joined
}

/** what the formula reading reads beside a glyph's own facts: the faces that are a formula's own (3), and a face of one pitch */
interface Formulas {
  faces: ReadonlySet<string>
  pitch: (g: G) => boolean
}

/** a sign − ± ∓ right before a digit, no word space between: a number's, no formula's ("−1.04") */
function signed(gs: readonly number[], i: number, glyphs: readonly G[]): boolean {
  const g = glyphs[gs[i]!]!,
    h = glyphs[gs[i + 1]!]
  return /^[−±∓]$/u.test(g.u) && !!h && /\p{N}/u.test(h.u) && h.x0 - g.x1 < SPACE_GAP * g.size
}

/** a mark of fact (1) alone, in no math face, set between two words inside its cluster (no word space either side): the words'
 *  (a plot's hyphen set with the minus sign, "Near−monopoly", 2610.11256v1 p17; an arrow joining two words), no formula's. A word
 *  here is two letters or more, none a formula's glyph: between a formula's letters ("x−y") the mark stays the formula's */
function joining(gs: readonly number[], is: readonly number[], at: number, glyphs: readonly G[]): boolean {
  if (classifyFont(glyphs[gs[is[at]!]!]!.font).fam === 'math') return false
  const word = (step: 1 | -1) => {
    let n = 0
    for (let k = at + step; k >= 0 && k < is.length; k += step) {
      const x = glyphs[gs[is[k]!]!]!
      if (!LETTER.test(x.u) || mathGlyph(x)) break
      n++
    }
    return n >= 2
  }
  return word(-1) && word(1)
}

/** a line's clusters: its glyphs (places in `gs`, its order) no word space apart (SPACE_GAP); each whether it holds a formula's
 *  glyph by facts (1) and (2), a number's sign and a mark joining two words none; whether every glyph of it is of one pitch;
 *  and the faces of its letters */
interface Cluster {
  is: number[]
  x0: number
  x1: number
  size: number
  math: boolean
  fixed: boolean
  letters: boolean
  faces: Set<string>
}
function clustersOf(gs: readonly number[], glyphs: readonly G[], pitch: (g: G) => boolean): Cluster[] {
  const out: Cluster[] = []
  gs.forEach((g, i) => {
    const x = glyphs[g]!
    const c = out.at(-1)
    if (c && x.x0 - c.x1 < SPACE_GAP * x.size) {
      c.is.push(i)
      c.x1 = Math.max(c.x1, x.x1)
      c.size = Math.max(c.size, x.size)
    } else
      out.push({
        is: [i],
        x0: x.x0,
        x1: x.x1,
        size: x.size,
        math: false,
        fixed: false,
        letters: false,
        faces: new Set(),
      })
  })
  for (const c of out) {
    c.math = c.is.some(
      (i, at) => mathGlyph(glyphs[gs[i]!]!) && !signed(gs, i, glyphs) && !joining(gs, c.is, at, glyphs),
    )
    c.fixed = c.is.every((i) => pitch(glyphs[gs[i]!]!))
    for (const i of c.is) {
      const g = glyphs[gs[i]!]!
      if (!LETTER.test(g.u)) continue
      c.letters = true
      c.faces.add(bare(g.font))
    }
  }
  return out
}
/** a line's phrases: its consecutive clusters that hold no formula's glyph and are not of one pitch whole, white space alone
 *  between them within the run gap; each whether it touches a formula, a cluster holding a formula's glyph right before it or
 *  right after it within the run gap */
function phrasesOf(cl: readonly Cluster[]): { idx: number[]; touches: boolean }[] {
  const out: { idx: number[]; touches: boolean }[] = []
  let cur: { idx: number[]; touches: boolean } | null = null
  cl.forEach((c, i) => {
    const text = !c.math && !c.fixed
    const prev = cl[i - 1]
    if (text && cur && prev && c.x0 - prev.x1 <= RUN_GAP * Math.max(c.size, prev.size)) cur.idx.push(i)
    else if (text) {
      cur = { idx: [i], touches: false }
      out.push(cur)
    } else cur = null
  })
  for (const ph of out) {
    const first = cl[ph.idx[0]!]!,
      last = cl[ph.idx.at(-1)!]!
    const a = cl[ph.idx[0]! - 1],
      b = cl[ph.idx.at(-1)! + 1]
    ph.touches =
      (!!a && a.math && first.x0 - a.x1 <= RUN_GAP * Math.max(a.size, first.size)) ||
      (!!b && b.math && b.x0 - last.x1 <= RUN_GAP * Math.max(b.size, last.size))
  }
  return out
}

/** (3) the faces that are a formula's own upright face: a face a letter of which stands in a formula's cluster, no word space
 *  from a formula's glyph by facts (1) and (2) ("Tr(" before KaTeX's Σ, "Mah" under its P), that is no math face by its name
 *  nor of one pitch, that the document's source units set no text in (`textFaces`), and that no figure line sets a phrase in
 *  apart from a formula (one touching none): a fact over the document. A label's face beside a formula ("jury, α = 8") sets no
 *  letter inside one and is the label's */
function formulaFacesOf(
  built: readonly { glyphs: G[]; lines: Line[] }[],
  textFaces: ReadonlySet<string> | null,
  pitch: (g: G) => boolean,
): Set<string> {
  const inside = new Set<string>()
  const apart = new Set<string>()
  for (const { glyphs, lines } of built)
    for (const l of lines) {
      const gs = l.gs.filter((g) => real(glyphs[g]))
      const cl = clustersOf(gs, glyphs, pitch)
      for (const c of cl)
        if (c.math)
          for (const i of c.is) {
            const g = glyphs[gs[i]!]!
            if (LETTER.test(g.u) && !mathGlyph(g) && !pitch(g)) inside.add(bare(g.font))
          }
      for (const ph of phrasesOf(cl))
        if (!ph.touches) for (const i of ph.idx) for (const f of cl[i]!.faces) apart.add(f)
    }
  return new Set([...inside].filter((f) => !apart.has(f) && !textFaces?.has(f)))
}

/** F1: which of a line's glyphs (in its order) are a formula's. A cluster holding a formula's glyph (facts (1), (2)) is a formula
 *  whole; it takes the clusters beside it within the run gap that hold no letter and no glyph of one pitch (an operator, a number,
 *  a bracket: "x = 3"), and so on from them; and a phrase that touches a formula, every letter of which is in a formula's own face
 *  (3), is the formula's ("log det" between KaTeX's formulas). A word in any other face is never one ("x and y" two formulas) */
function formulaOf(gs: readonly number[], glyphs: readonly G[], f: Formulas): boolean[] {
  const cl = clustersOf(gs, glyphs, f.pitch)
  const inF = cl.map((c) => c.math)
  for (let again = true; again; ) {
    again = false
    cl.forEach((c, i) => {
      if (inF[i] || c.letters || c.is.some((k) => f.pitch(glyphs[gs[k]!]!))) return
      const a = cl[i - 1],
        b = cl[i + 1]
      if (
        (a && inF[i - 1] && c.x0 - a.x1 <= RUN_GAP * Math.max(a.size, c.size)) ||
        (b && inF[i + 1] && b.x0 - c.x1 <= RUN_GAP * Math.max(b.size, c.size))
      ) {
        inF[i] = true
        again = true
      }
    })
  }
  for (const ph of phrasesOf(cl)) {
    if (!ph.touches) continue
    const faces = new Set(ph.idx.flatMap((i) => [...cl[i]!.faces]))
    if (faces.size && [...faces].every((x) => f.faces.has(x))) for (const i of ph.idx) inF[i] = true
  }
  const out = new Array<boolean>(gs.length).fill(false)
  cl.forEach((c, k) => {
    if (inF[k]) for (const i of c.is) out[i] = true
  })
  return out
}

function lineOf(ks: number[], gs0: number[], free: Set<number>, glyphs: readonly G[], fig: string): Line {
  const gs = [...new Set(gs0)].sort((a, b) => glyphs[a]!.x0 - glyphs[b]!.x0 || a - b)
  if (W) W.votes += gs.length
  // (its size the size most of its glyphs stand at, those no run holds too; its baseline theirs: a display's math glyphs are no
  // run's, and its runs may be its scripts alone, "final", "base", "low" (2609.19644v1 p59), whose size and baseline are not
  // the line's)
  const n = new Map<number, number>()
  for (const g of gs) n.set(glyphs[g]!.size, (n.get(glyphs[g]!.size) ?? 0) + 1)
  const size = [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? glyphs[gs[0]!]!.size
  const main = gs.filter((g) => Math.abs(glyphs[g]!.size - size) <= 0.01 * size)
  const ys = main.map((g) => glyphs[g]!.y).sort((a, b) => a - b)
  return {
    ks,
    gs,
    free,
    y: ys[ys.length >> 1] ?? glyphs[gs[0]!]!.y,
    size,
    x0: Math.min(...gs.map((g) => glyphs[g]!.x0)),
    x1: Math.max(...gs.map((g) => glyphs[g]!.x1)),
    fig,
  }
}

/** a line as read: its glyphs in its order (an icon before its first word none of it), its pieces by role (T text, F a run of one
 *  pitch, M a formula), and what it is: a line of `code` (every word between glyphs of one pitch, Rule 1's inside-a-line), a
 *  `formula` (no word outside its formulas), `mixed` (words and a run of one pitch or a formula: F0's and F1's text), `plain`
 *  (words alone) or `none` (no word, no formula); `marker`, the glyphs of the marker it opens with where it is an item's */
interface Read {
  gs: number[]
  pieces: { r: 'T' | 'F' | 'M'; gs: number[] }[]
  kind: 'code' | 'formula' | 'mixed' | 'plain' | 'none'
  marker: number[]
}

/** an item's marker, a cluster the enumerators LaTeX's list counters print: \arabic's number, \alph's or \Alph's letter,
 *  \roman's or \Roman's numeral, a bracket before it or not, then a full stop or a closing bracket ("1.", "c)", "(b)", "iv)");
 *  or itemize's bullet or dash, as other producers set them too. A list (`listed`) decides it is one */
const MARKER = /^(?:[\p{Pd}•◦‣⁃∙▪▫●○*·∗]|\(?(?:\p{N}+|\p{L}|[ivxlcdm]+|[IVXLCDM]+)[.)])$/u
/** a roman numeral as \roman prints one (lower case), and its value */
const ROMAN = /^m{0,4}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})$/
const ROMAN_DIGIT: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 }
const romanValue = (s: string) =>
  [...s].reduce((t, ch, k) => {
    const v = ROMAN_DIGIT[ch]!,
      next = ROMAN_DIGIT[s[k + 1] ?? ''] ?? 0
    return t + (v < next ? -v : v)
  }, 0)

/**
 * A line read (F0, F1): its glyphs' roles in its order. A stretch of T that spells a word is the line's text; one standing between
 * F glyphs right before and right after it, every one of them, makes the line code, kept whole (Rule 1's inside-a-line:
 * 2411.13093v4 p19's Georgia word inside a Consolas line). The glyphs no run holds before its first run's (an icon TeX set before
 * the first word) are none of it, as today's reading leaves them
 */
function lineRead(l: Line, glyphs: readonly G[], pitch: (g: G) => boolean, math: Formulas): Read {
  // (the glyphs no run holds before its first run's: the text's where each abuts the glyph after it, no word space between (an
  // opening bracket, a code line's opening quote), or is a formula's; from one standing a word space apart back, an icon TeX
  // set before the first word, none of it)
  let first = l.gs.findIndex((g) => !l.free.has(g))
  while (first > 0) {
    const a = glyphs[l.gs[first - 1]!]!,
      b = glyphs[l.gs[first]!]!
    if (b.x0 - a.x1 >= SPACE_GAP * Math.min(a.size, b.size) && !mathGlyph(a)) break
    first--
  }
  const gs = l.gs.slice(first)
  const formula = formulaOf(gs, glyphs, math)
  const role = gs.map((g, i) => (formula[i] ? 'M' : pitch(glyphs[g]!) ? 'F' : 'T'))
  const stretches: Read['pieces'] = []
  gs.forEach((g, i) => {
    const s = stretches.at(-1)
    if (s && s.r === role[i]) s.gs.push(g)
    else stretches.push({ r: role[i]!, gs: [g] })
  })
  const words = stretches.filter((s) => s.r === 'T' && WORD.test(textOf(s.gs, glyphs).normalize('NFKC')))
  // (F1: a line no word of which stands outside its formulas is kept whole, as today's runs of a math face are)
  if (!words.length) return { gs, pieces: stretches, kind: role.includes('M') ? 'formula' : 'none', marker: [] }
  const code =
    role.includes('F') &&
    words.every((s) => {
      const i = stretches.indexOf(s)
      return stretches[i - 1]?.r === 'F' && stretches[i + 1]?.r === 'F'
    })
  if (code) return { gs, pieces: stretches, kind: 'code', marker: [] }
  // (outside a line of code, a stretch of one pitch with no letter or digit, a mark alone ("behavior." its period set in the
  // face of one pitch), is the text's, no element, the stretches beside it one)
  const pieces: Read['pieces'] = []
  for (const st of stretches) {
    const r = st.r === 'F' && !st.gs.some((g) => /[\p{L}\p{N}]/u.test(glyphs[g]!.u)) ? 'T' : st.r
    const last = pieces.at(-1)
    if (last && last.r === r) last.gs.push(...st.gs)
    else pieces.push({ r, gs: [...st.gs] })
  }
  // (an item's marker: its first cluster, text, spelling no word, a word space before the rest of the line, which holds a word)
  let marker: number[] = []
  const end = gs.findIndex((g, i) => i > 0 && glyphs[g]!.x0 - glyphs[gs[i - 1]!]!.x1 >= SPACE_GAP * glyphs[g]!.size)
  if (end > 0 && pieces[0]?.r === 'T' && end <= pieces[0].gs.length) {
    const head = gs.slice(0, end)
    const rest = pieces[0].gs.slice(end)
    const m = head.map((g) => glyphs[g]!.u).join('')
    const worded =
      WORD.test(textOf(rest, glyphs).normalize('NFKC')) ||
      pieces.slice(1).some((x) => x.r === 'T' && WORD.test(textOf(x.gs, glyphs).normalize('NFKC')))
    if (MARKER.test(m) && worded) marker = head
  }
  return { gs, pieces, kind: pieces.some((st) => st.r !== 'T') ? 'mixed' : 'plain', marker }
}

/**
 * F3: an item's marker is one of a list: another line of its figure opens with a marker of its form at its left edge
 * (PARA_ALIGN_TOL of the size), a column, or on its baseline (RUN_DY), a row, the next one or the one before ("A." and "B.",
 * "(a)" and "(b)", "1." and "2.", "ii." and "iii."; a bullet or a dash the same): options set as a grid, A and B a row, C and D
 * under them (2411.13093v4 p19). A letter that is a roman numeral too ("i.", "v)") is read both ways. Where no line does, the line
 * opens with no marker and its mark goes with its text: a name's initial opening a reference's wrapped line ("S. Smith",
 * 2609.19644v1 p66), a bracket's end a line before opened ("64)", p70), and a figure's one enumerated line alike
 */
function listed(lines: readonly Line[], reads: Read[], glyphs: readonly G[]): void {
  /** the forms a marker is of, each with its value in its sequence (none for a bullet or a dash) */
  const formsOf = (s: string): { form: string; v: number | null }[] => {
    const m = /^(\(?)(.+)([.)])$/u.exec(s)
    if (!m) return [{ form: s, v: null }]
    const [, open, body, close] = m as unknown as [string, string, string, string]
    if (/^\p{N}+$/u.test(body)) return [{ form: `${open}1${close}`, v: Number(body) }]
    const out: { form: string; v: number | null }[] = []
    const upper = body === body.toUpperCase()
    if (/^\p{L}$/u.test(body)) out.push({ form: `${open}${upper ? 'A' : 'a'}${close}`, v: body.codePointAt(0)! })
    const low = body.toLowerCase()
    if ((upper || body === low) && ROMAN.test(low))
      out.push({ form: `${open}${upper ? 'I' : 'i'}${close}`, v: romanValue(low) })
    return out
  }
  const ms = reads.map((r, i) =>
    r.marker.length
      ? { i, forms: formsOf(r.marker.map((g) => glyphs[g]!.u).join('')), x: glyphs[r.marker[0]!]!.x0 }
      : null,
  )
  for (const a of ms) {
    if (!a) continue
    const l = lines[a.i]!
    const list = ms.some(
      (b) =>
        !!b &&
        b !== a &&
        lines[b.i]!.fig === l.fig &&
        (Math.abs(b.x - a.x) <= PARA_ALIGN_TOL * l.size || Math.abs(lines[b.i]!.y - l.y) <= RUN_DY * l.size) &&
        a.forms.some((fa) =>
          b.forms.some(
            (fb) => fb.form === fa.form && (fa.v === null || (fb.v !== null && Math.abs(fb.v - fa.v) === 1)),
          ),
        ),
    )
    if (!list) reads[a.i]!.marker = []
  }
}

/** a read line's pieces into a text's order and elements: its text stretches, each run of one pitch an element `code`, each
 *  formula an element `math`; its marker (`label`) left out where the text takes it as its label */
function piecesInto(ft: FigureText, read: Read, label: boolean): void {
  const skip = new Set(label ? read.marker : [])
  for (const s of read.pieces) {
    const gs = s.gs.filter((g) => !skip.has(g))
    if (!gs.length) continue
    if (s.r === 'T') ft.order.push({ t: 'text', glyphs: gs })
    else {
      ft.els.push({ kind: s.r === 'M' ? 'math' : 'code', glyphs: gs, boxes: [] })
      ft.order.push({ t: 'el', i: ft.els.length - 1 })
    }
  }
}

/**
 * A line's figure text where it is one this reading makes: a line of code or of formulas, kept whole; a line of words with a run
 * of one pitch or a formula in it (F0, F1: each an element); an item, its marker its label (F3). Else null: one run alone with
 * nothing to join, or runs of words alone, as today's reading made them
 */
function textOfRead(l: Line, read: Read): FigureText | null {
  const base = {
    ks: [...l.ks],
    page: 0,
    els: [],
    label: [],
    para: null,
    claimed: read.gs.filter((g) => l.free.has(g)),
    copies: [],
    textBoxes: [],
    container: null,
    under: null,
  }
  if (read.kind === 'none') return null
  if (read.kind === 'formula' || read.kind === 'code')
    return { ...base, order: [{ t: 'text', glyphs: read.gs }], why: read.kind }
  if (read.kind === 'plain' && !read.marker.length) return null
  const ft: FigureText = { ...base, order: [], label: read.marker, why: null }
  piecesInto(ft, read, true)
  return ft
}

/** a printed line of prose with its reading, as the paragraph reading takes it */
interface ProseLine {
  l: Line
  read: Read
}
/**
 * F3: whether a path's rows are a legend's entries: two rows or more each with ink of its own beside its words inside the path,
 * within its band (one band's height over and under its baseline) and on no other row's, before or after them at any distance (a
 * sample, a marker). Entries of one length stand centred as a node's label does ("plain-18" over "plain-34", their samples after
 * them, 1512.03385v1 p5; markers 1.5 em before, past a leader's reach, 2610.21085v1 p31; circles beside a frame's side both rows
 * meet, 2010.11929v2 p7). Ink under its words is a decoration, and one row beside an icon is a node's still
 */
function legendOf(shape: TodayShape, F: readonly ParaLine[], boxes: readonly number[]): boolean {
  const segs = shape.segs as ArrayLike<number>
  let hx0 = Infinity,
    hy0 = Infinity,
    hx1 = -Infinity,
    hy1 = -Infinity
  for (let i = 0; i + 1 < segs.length; i += 2) {
    hx0 = Math.min(hx0, segs[i]!)
    hx1 = Math.max(hx1, segs[i]!)
    hy0 = Math.min(hy0, segs[i + 1]!)
    hy1 = Math.max(hy1, segs[i + 1]!)
  }
  let sampled = 0
  F.forEach((f, n) => {
    const reach = BAND_EM * f.size
    for (let b = 0; b + 3 < boxes.length; b += 4) {
      const bx0 = Math.min(boxes[b]!, boxes[b + 2]!),
        bx1 = Math.max(boxes[b]!, boxes[b + 2]!),
        by0 = Math.min(boxes[b + 1]!, boxes[b + 3]!),
        by1 = Math.max(boxes[b + 1]!, boxes[b + 3]!)
      if (bx0 < hx0 || bx1 > hx1 || by0 < hy0 || by1 > hy1) continue
      if (by0 < f.y - reach || by1 > f.y + reach || (bx1 > f.x0 && bx0 < f.x1)) continue
      if (F.some((g, k) => k !== n && by1 > g.bottom && by0 < g.top)) continue
      sampled++
      return
    }
  })
  return sampled >= 2
}

/** the hyphens a line may end in (facts.ts HYPHENS) */
const HYPHENS_AT_END = /^[-\u2010\u00ad]$/u
/** what a line's end before the next line is (facts.ts lineEnd): a space, a word's hyphen joined, TeX's break dropped; a hyphen
 *  read against the document's text. A page's glyph is made by glyphWith: its coordinates are getters over its page's array,
 *  which a spread does not copy, and lineEnd read every gap as none, no word's start, every TeX break a word's hyphen
 *  ("con-text", 2609.19644v1 p60) */
function endOf(
  glyphs: readonly G[],
  A: readonly number[],
  B: readonly number[],
  source: () => string,
  token = false,
): 'space' | 'join' | 'drop' {
  const docGlyph = (g: number) => glyphWith(glyphs[g]! as unknown as DocGlyph, { base: bare(glyphs[g]!.font) })
  const hyphen = HYPHENS_AT_END.test(glyphs[A.at(-1)!]?.u ?? '')
  if (W && hyphen) W.ends++
  const r = lineEnd([...A, ...B].map(docGlyph), A.length, hyphen ? { source: source() } : {})
  if (r !== 'space' || !token) return r
  // (a node's label broken inside a word with no hyphen, set at its path's width ("test_password|_lookup.py", 2608.06701v1 p9):
  // joined where the document writes the word whole elsewhere, as a source tells a word)
  const run = (gs: readonly number[], end: boolean) => {
    const xs = end ? [...gs].reverse() : [...gs]
    let out = ''
    for (let i = 0; i < xs.length; i++) {
      const g = glyphs[xs[i]!]!
      if (i) {
        const p = glyphs[xs[i - 1]!]!
        const gap = end ? p.x0 - g.x1 : g.x0 - p.x1
        if (gap > TRACKING_SPACE_FACTOR * g.size) break
      }
      out = end ? g.u + out : out + g.u
    }
    return out
  }
  const a = run(A, true),
    b = run(B, false)
  if (!a || !b || /\s/u.test(a + b)) return r
  if (W) W.ends++
  const count = (w: string) => (source().match(new RegExp(`(?<!\\S)${escapeRe(w)}(?!\\S)`, 'giu')) ?? []).length
  return count(a + b) > 0 ? 'join' : r
}
const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** a document's text off its pages' glyphs, in their order: a space where two stand apart (TRACKING_SPACE_FACTOR of the size,
 *  PDF.js's reading of a space), where a line changes or goes back, and between pages */
function documentText(pages: readonly TodayPage[]): string {
  let out = ''
  for (const pg of pages) {
    let prev: G | null = null
    for (const g of (pg.glyphs ?? []) as G[]) {
      if (!real(g)) continue
      if (
        prev &&
        (Math.abs(g.y - prev.y) > 0.5 * Math.max(g.size, prev.size) ||
          g.x0 < prev.x0 ||
          g.x0 - prev.x1 > TRACKING_SPACE_FACTOR * prev.size)
      )
        out += ' '
      out += g.u
      prev = g
    }
    out += ' '
  }
  return out
}

/**
 * F3: the page's paragraphs (figure-paras.ts) over its lines of prose (`mixed` and `plain`), each with its lines top to bottom,
 * their ends, and the lines of the page it is made of (`of`). Two fragments of one baseline farther apart than the run gap (a
 * justified line's stretched space after a sentence) are read as one line where a line of prose right over or under them has ink
 * across the gap, and stand so only where a paragraph takes that line; else they stay the fragments they were
 */
function figureParas(
  lines: readonly Line[],
  reads: readonly Read[],
  glyphs: readonly G[],
  boxes: readonly number[],
  pitch: (g: G) => boolean,
  math: Formulas,
  source: () => string,
  skip: ReadonlySet<number> = new Set(),
): {
  lines: ProseLine[]
  ends: ('space' | 'join' | 'drop')[]
  justified: boolean
  by: 'strong'
  of: number[]
}[] {
  const prose = (r: Read) => r.kind === 'mixed' || r.kind === 'plain'
  // (the fragments bridged: two lines of prose on one baseline, the second right of the first; a row of prose within two bands
  // over or under them has ink across the gap between them, and none has a gap of its own there, ink on both sides and none
  // across: a gutter between two columns under a title is no stretched space)
  const entries: { x: ProseLine; of: number[] }[] = []
  const used = new Set<number>()
  // (the page's lines of prose by figure, top to bottom: a line's rows near it are found from its place there)
  const byFig = new Map<string, number[]>()
  lines.forEach((l, i) => {
    if (skip.has(i) || !prose(reads[i]!)) return
    const at = byFig.get(l.fig)
    if (at) at.push(i)
    else byFig.set(l.fig, [i])
  })
  for (const idx of byFig.values()) {
    idx.sort((p, q) => lines[q]!.y - lines[p]!.y || lines[p]!.x0 - lines[q]!.x0)
    /** the lines of the figure within `d` of baseline y, but those of `skip` */
    const near = (at: number, y: number, d: number, skip: readonly number[]) => {
      const out: number[] = []
      for (let k = at - 1; k >= 0 && Math.abs(lines[idx[k]!]!.y - y) < d; k--)
        if (!skip.includes(idx[k]!)) out.push(idx[k]!)
      for (let k = at + 1; k < idx.length && Math.abs(lines[idx[k]!]!.y - y) < d; k++)
        if (!skip.includes(idx[k]!)) out.push(idx[k]!)
      return out
    }
    idx.forEach((i, at) => {
      if (used.has(i)) return
      let cur = lines[i]!
      const of = [i]
      for (let again = true; again; ) {
        again = false
        const rows = near(at, cur.y, 2 * BAND_EM * cur.size, of).map((k) => lines[k]!)
        for (const j of near(at, cur.y, RUN_DY * cur.size + 1e-9, of)) {
          const b = lines[j]!
          if (used.has(j) || b.x0 <= cur.x1 || Math.abs(b.y - cur.y) > RUN_DY * Math.max(cur.size, b.size)) continue
          const others = rows.filter((c) => c !== b && Math.abs(c.y - cur.y) > 0.5 * cur.size)
          const across = others.some((c) => c.x0 <= cur.x1 && c.x1 >= b.x0)
          const gapped = others.some(
            (c1) =>
              c1.x1 < b.x0 &&
              others.some(
                (c2) => c2 !== c1 && Math.abs(c2.y - c1.y) <= RUN_DY * cur.size && c2.x0 > cur.x1 && c2.x0 > c1.x1,
              ),
          )
          if (!across || gapped) continue
          cur = lineOf([...cur.ks, ...b.ks], [...cur.gs, ...b.gs], new Set([...cur.free, ...b.free]), glyphs, cur.fig)
          of.push(j)
          again = true
          break
        }
      }
      for (const j of of) used.add(j)
      entries.push({ x: { l: cur, read: of.length > 1 ? lineRead(cur, glyphs, pitch, math) : reads[i]! }, of })
    })
  }
  const live = entries.filter((e) => prose(e.x.read))
  const facts = live.map((e) => proseFacts(e.x, glyphs, boxes))
  const end = (a: number, b: number) => endOf(glyphs, live[a]!.x.read.gs, live[b]!.x.read.gs, source)
  return parasOf(facts, end).map((para) => ({
    lines: para.lines.map((k) => live[k]!.x),
    ends: para.ev.map((e) => (e === 'hyphen-drop' ? 'drop' : e === 'hyphen-join' ? 'join' : 'space')),
    justified: para.justified,
    by: 'strong' as const,
    of: para.lines.flatMap((k) => live[k]!.of),
  }))
}

/** a line of prose's facts as the paragraph reading reads them (figure-paras.ts ParaLine), off its text glyphs */
function proseFacts(x: ProseLine, glyphs: readonly G[], boxes: readonly number[]): ParaLine {
  const { l, read } = x
  const text = read.pieces.filter((s) => s.r === 'T').flatMap((s) => s.gs)
  const letters = text.filter((g) => LETTER.test(glyphs[g]!.u))
  const most = <T>(f: (g: G) => T): T | null => {
    const n = new Map<T, number>()
    for (const g of letters) n.set(f(glyphs[g]!), (n.get(f(glyphs[g]!)) ?? 0) + 1)
    return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  }
  const sizes = letters.map((g) => glyphs[g]!.size).sort((a, b) => a - b)
  const size = sizes[sizes.length >> 1] ?? l.size
  const main = read.gs.map((g) => glyphs[g]!).filter((g) => Math.abs(g.size - size) <= 0.01 * size)
  const heights = main.map((g) => g.top - g.bottom).sort((a, b) => a - b)
  // (its clusters, each text or not by its first glyph's piece)
  const roleOf = new Map<number, string>()
  for (const s of read.pieces) for (const g of s.gs) roleOf.set(g, s.r)
  const cl: { gs: number[]; x0: number; x1: number; text: boolean; s: string }[] = []
  for (const g of read.gs) {
    const y = glyphs[g]!
    const c = cl.at(-1)
    if (c && y.x0 - c.x1 < SPACE_GAP * y.size) {
      c.gs.push(g)
      c.x1 = Math.max(c.x1, y.x1)
      c.s += y.u
    } else cl.push({ gs: [g], x0: y.x0, x1: y.x1, text: roleOf.get(g) === 'T', s: y.u })
  }
  // (its word spaces: between two clusters of text, the first ending in no punctuation (TeX widens a space after one); a line
  // shows justification only where two of them or more are one (TeX stretches a line's spaces alike), never a tab's gap. A
  // formula's space to the words beside it, read as a word space, was tried and withdrawn (2026-11-11): a math cluster beside a
  // text-role digit or bracket put a math space among them, the line read uneven, and 2609.19644v1 lost 3 joins for none gained)
  const gaps: number[] = []
  for (let i = 1; i < cl.length; i++)
    if (cl[i]!.text && cl[i - 1]!.text && !/[.!?:;,]["')\]”’]*$/u.test(cl[i - 1]!.s))
      gaps.push(cl[i]!.x0 - cl[i - 1]!.x1)
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  const bottom = Math.min(...main.map((g) => g.bottom)),
    top = Math.max(...main.map((g) => g.top))
  // (the ink that ends right before its start, within the anchor's reach, across its band: a legend's sample, a frame's side)
  const leaders = new Set<number>()
  for (let b = 0; b + 3 < boxes.length; b += 4) {
    const bx1 = Math.max(boxes[b]!, boxes[b + 2]!)
    const by0 = Math.min(boxes[b + 1]!, boxes[b + 3]!),
      by1 = Math.max(boxes[b + 1]!, boxes[b + 3]!)
    if (bx1 > l.x0 || bx1 < l.x0 - ANCHOR_REACH * size || by1 <= bottom || by0 >= top) continue
    leaders.add(b / 4)
  }
  // (its face the font most of its letters are set in, compared by family: facts.ts oneFamily)
  const face = most((g) => bare(g.font))
  return {
    fig: l.fig,
    y: l.y,
    x0: l.x0,
    x1: l.x1,
    size,
    band: Math.max(heights[heights.length >> 1] ?? 0, BAND_EM * size),
    top: Math.max(...read.gs.map((g) => glyphs[g]!.top)),
    bottom: Math.min(...read.gs.map((g) => glyphs[g]!.bottom)),
    face,
    bold: letters.length > 0 && letters.every((g) => classifyFont(glyphs[g]!.font).bold),
    fill: most((g) => g.fill ?? 0),
    uniform: gaps.length >= 2 && Math.max(...gaps) - Math.min(...gaps) <= PARA_ALIGN_TOL * size,
    wordSpace: mean(gaps),
    marker: read.marker.length > 0,
    leaders,
  }
}

/** a stretch's text: its glyphs' Unicode (NFKC), a space where two stand SPACE_GAP of their size apart */
export function textOf(gs: readonly number[], glyphs: readonly G[]): string {
  let s = ''
  let end: number | null = null
  for (const j of gs) {
    const x = glyphs[j]!
    if (end !== null && x.x0 - end >= SPACE_GAP * x.size && !s.endsWith(' ')) s += ' '
    s += (x.u ?? '').normalize('NFKC')
    end = x.x1
  }
  return s.replace(/\s+/gu, ' ').trim()
}

/**
 * F1: whether a text's formula element has ink of its own the text does not hold: a glyph no line took standing over or under
 * the element (its extent across, within its line's band of either side of the baseline: a sum's limits set past half the
 * size, a fraction's other line). The element moves with the translation and that ink would stay where it is, a torn formula:
 * the text stays the original's, the fallback of the relation reading (no fact tells the ink is the element's). A glyph that
 * stands on another line's baseline (RUN_DY) is that line's, taken or not: a torn piece stands on no line's (a table's number
 * cells under a group header's formula, no unit, stand on their row's; a caption's last mark past its line's run gap on the
 * caption's: 2609.19644v1 p11). The reach is one band's height over and under the baseline, and no further: a formula's stacked
 * parts (a limit, a denominator, a script) stand in the band directly over or under its line. Tried 2026-11-11 and withdrawn: no
 * reach, the line nearest by baseline among the lines across the glyph (e32819331). A display forms no line (no unit takes a
 * formula's run), so a display, its equation number or a folio 3 to 27 sizes below stood nearest a paragraph's last line
 * (2609.19644v1: 33 of F1's 47 lines drawn there against 39)
 */
function torn(
  ft: FigureText,
  l: Line,
  glyphs: readonly G[],
  loose: readonly number[],
  lines: readonly Line[],
): boolean {
  if (!loose.length) return false
  const reach = BAND_EM * l.size
  return ft.els.some((e) => {
    if (e.kind !== 'math') return false
    const x0 = Math.min(...e.glyphs.map((g) => glyphs[g]!.ix0 ?? glyphs[g]!.x0)),
      x1 = Math.max(...e.glyphs.map((g) => glyphs[g]!.ix1 ?? glyphs[g]!.x1))
    return loose.some((g) => {
      const x = glyphs[g]!
      if (!real(x) || (x.ix1 ?? x.x1) <= x0 || (x.ix0 ?? x.x0) >= x1) return false
      if (!(x.bottom < l.y + reach && x.top > l.y - reach)) return false
      return !lines.some((m) => m !== l && Math.abs(m.y - x.y) <= RUN_DY * Math.max(m.size, x.size))
    })
  })
}

/**
 * A crowded figure text's met ink judged by its relation to the text (the owner's reformulation of 2026-11-10): own (its glyphs,
 * a rule inside one of its elements' extent: a fraction's bar, a chip's rule), a decoration (a shape holding the ink centres of a
 * contiguous stretch of its glyphs and of no other glyph: a frame round a citation, a chip's fill; a rule of horizontal segments
 * alone under or through such a stretch; a doubled copy, a glyph of the same character over one of its own within half its size
 * across), a container (a closed shape, every segment's end met by another, holding every glyph of it, their ink strictly
 * inside), or other ink. Another text's glyph keeps the text the original's, `crowded`; ink that is no text keeps none (step
 * 2, the owner's ruling: a translation in its right place is the goal, ordinary text with ink about it is translated). A
 * decoration of a stretch is that stretch's element, carrying it (a framed citation an element, never translated); of all of
 * it, hidden with its text; a copy hidden with its text
 */
function judge(ft: FigureText, items: readonly TodayMet[], glyphs: readonly G[]): void {
  const textGs = ft.order.flatMap((o) => (o.t === 'text' ? o.glyphs : o.t === 'el' ? ft.els[o.i]!.glyphs : []))
  // (its own: its text's and its elements' glyphs, and its label's, an item's marker, which no decoration is told by)
  const label = new Set(ft.label)
  const own = new Set([...textGs, ...ft.label])
  const at = new Map(textGs.map((g, i) => [g, i]))
  let unrelated = false,
    inked = false
  for (const it of fillsJoined(items, textGs, glyphs)) {
    if ('g' in it) {
      if (own.has(it.g)) continue
      const x = glyphs[it.g]!
      const twin = textGs.some((j) => {
        const y = glyphs[j]!
        return (
          y.u === x.u &&
          (y.ix1 ?? y.x1) > (x.ix0 ?? x.x0) &&
          (y.ix0 ?? y.x0) < (x.ix1 ?? x.x1) &&
          Math.abs(y.y - x.y) <= 0.5 * y.size
        )
      })
      if (twin) ft.copies.push(it.g)
      else {
        unrelated = true
        keptBy.set(ft, 'glyph')
      }
      continue
    }
    const [x0, y0, x1, y1] = [
      Math.min(it.box[0]!, it.box[2]!),
      Math.min(it.box[1]!, it.box[3]!),
      Math.max(it.box[0]!, it.box[2]!),
      Math.max(it.box[1]!, it.box[3]!),
    ]
    const hw = it.shape?.hw ?? 0
    // (a rule inside an element's extent: the element's; across it, and its middle on the element's line, inside the band its
    // glyphs and DRAW_BAND about their baseline span: a paragraph's frame on another line is no rule of an element its x extent
    // falls in (2609.19644v1 p58, the same author cited on four lines, every frame taken as the first citation's: its crops drawn
    // empty in the translation), even where the lines stand so close that the frame reaches into this line's band (p3, 1.6 pt))
    const el = ft.els.find((e) => {
      const ex0 = Math.min(...e.glyphs.map((g) => glyphs[g]!.x0)),
        ex1 = Math.max(...e.glyphs.map((g) => glyphs[g]!.x1))
      const ey0 = Math.min(
          ...e.glyphs.map((g) => Math.min(glyphs[g]!.bottom, glyphs[g]!.y + DRAW_BAND[0] * glyphs[g]!.size)),
        ),
        ey1 = Math.max(...e.glyphs.map((g) => Math.max(glyphs[g]!.top, glyphs[g]!.y + DRAW_BAND[1] * glyphs[g]!.size)))
      const cy = (y0 + y1) / 2
      return x0 >= ex0 - hw && x1 <= ex1 + hw && cy >= ey0 - hw && cy <= ey1 + hw
    })
    if (el) {
      el.boxes.push(...it.bs)
      continue
    }
    // (the glyphs whose ink centre it holds: its own and any other; a closed path's by its interior, its box the cheap test
    // first (F3's container step: a diamond's corners are no inside of it, 2608.06701v1 p2's "yes" beside its node))
    const held: number[] = []
    let others = false
    let labelled = 0
    const shut = !!it.shape && closed(it.shape)
    for (let j = 0; j < glyphs.length; j++) {
      const g = glyphs[j]!
      if (!real(g)) continue
      const cx = ((g.ix0 ?? g.x0) + (g.ix1 ?? g.x1)) / 2,
        cy = (g.top + g.bottom) / 2
      if (
        cx > x0 &&
        cx < x1 &&
        cy > y0 &&
        cy < y1 &&
        (!shut || (W ? W.interior++ : 0, interiorOf(it.shape!.segs, cx, cy)))
      ) {
        if (label.has(j)) labelled++
        else if (own.has(j)) held.push(j)
        else others = true
      }
    }
    const idx = held.map((g) => at.get(g)!).sort((a, b) => a - b)
    const contiguous = idx.length > 0 && idx.at(-1)! - idx[0]! + 1 === idx.length
    // (a decoration holds whole words: its stretch's letters' and digits' ink inside it (a bracket or a comma at its edge may
    // cross it by its side bearing: Preview's link frames are tight on the words, 2609.19644v1 p58), and the stretch from a word's
    // start to a word's end, a word space or a mark that is no letter or digit beside it, its line's end; never a letter of a
    // word, a plot's marker over it. A tone under the stretch is a line tall at most (as a chip's fill, BAND_EM twice), a
    // highlight's: a plot's shaded column under a label's end is the plot's (2610.21547v1 p14's "bound m = 1"))
    if (
      held.length &&
      !others &&
      contiguous &&
      held.length < textGs.length &&
      (!it.ground || y1 - y0 <= 2 * BAND_EM * glyphs[held[0]!]!.size) &&
      held.every((j) => !/[\p{L}\p{N}]/u.test(glyphs[j]!.u) || inside(glyphs[j]!, x0, y0, x1, y1)) &&
      wordBounded(textGs, idx, glyphs)
    ) {
      decorate(
        ft,
        idx.map((i) => textGs[i]!),
        it.bs,
        glyphs,
      )
      continue
    }
    // (a tone under part of the text that holds no stretch of its words whole: its ground, crowding nothing, as before)
    if (it.ground) continue
    if (
      held.length === textGs.length &&
      labelled === label.size &&
      !others &&
      closed(it.shape) &&
      [...own].every((j) => inside(glyphs[j]!, x0, y0, x1, y1))
    ) {
      ft.container = roomIn(it.shape!, textGs, glyphs)
      continue
    }
    // (a rule of horizontal segments alone, its extent inside a stretch of its glyphs': an underline, a strike)
    if (it.shape?.stroke && !it.shape.fill && flat(it.shape)) {
      const over = textGs.filter((j) => glyphs[j]!.x1 > x0 + hw && glyphs[j]!.x0 < x1 - hw)
      const span = over.map((g) => at.get(g)!).sort((a, b) => a - b)
      const starts = over.some((j) => glyphs[j]!.x0 <= x0 + hw),
        ends = over.some((j) => glyphs[j]!.x1 >= x1 - hw)
      if (
        span.length >= 2 &&
        starts &&
        ends &&
        span.at(-1)! - span[0]! + 1 === span.length &&
        wordBounded(textGs, span, glyphs)
      ) {
        if (span.length === textGs.length) ft.textBoxes.push(...it.bs)
        else
          decorate(
            ft,
            span.map((i) => textGs[i]!),
            it.bs,
            glyphs,
          )
        continue
      }
    }
    // (step 2, the owner's ruling: ink that is no text never keeps a figure text: a line or a shape about it, an arrow across it, a
    // legend's sample beside it, an icon in its node; the translation is laid in the text's own place, inside its container where
    // the reading found one, within its own room otherwise. Another text's glyph alone keeps it (above))
    inked = true
  }
  ft.why = unrelated ? 'crowded' : ft.why === 'crowded' ? null : ft.why
  if (inked) inkedTexts.add(ft)
}

type Met =
  | { g: number }
  | { bs: number[]; box: number[]; shape: TodayShape | null; kind: number | undefined; ground: boolean }
/** a text's met ink with the pieces of one fill as one: boxes of fill alone (no stroke) each holding a stretch of the text's
 *  glyphs, the stretches consecutive in its order, no glyph of it between them, are one tone under the stretches joined, judged
 *  whole: a highlight a package sets word by word, the pieces touching (2610.40576v1 p17) or a word space apart and each as
 *  tall as its word (2411.13093v4 p19's option D), is the text's ground, not each word's decoration. Pieces joined are of one
 *  kind, a tone under the text (`ground`) or ink over it */
function fillsJoined(items: readonly TodayMet[], textGs: readonly number[], glyphs: readonly G[]): Met[] {
  const at = new Map(textGs.map((g, i) => [g, i]))
  const out: Met[] = []
  const pieces: {
    bs: number[]
    box: number[]
    shape: TodayShape
    kind: number | undefined
    ground: boolean
    lo: number
    hi: number
  }[] = []
  for (const it of items) {
    if ('g' in it) {
      out.push(it)
      continue
    }
    const box = [
      Math.min(it.box[0]!, it.box[2]!),
      Math.min(it.box[1]!, it.box[3]!),
      Math.max(it.box[0]!, it.box[2]!),
      Math.max(it.box[1]!, it.box[3]!),
    ]
    const ground = !!it.ground
    // (the places in the text's order of the glyphs whose ink centre it holds: a stretch where they are consecutive)
    const idx: number[] = []
    if (it.shape?.fill && !it.shape.stroke)
      for (const [j, i] of at) {
        const g = glyphs[j]!
        const cx = ((g.ix0 ?? g.x0) + (g.ix1 ?? g.x1)) / 2,
          cy = (g.top + g.bottom) / 2
        if (cx > box[0]! && cx < box[2]! && cy > box[1]! && cy < box[3]!) idx.push(i)
      }
    idx.sort((x, y) => x - y)
    if (idx.length && idx.at(-1)! - idx[0]! + 1 === idx.length)
      pieces.push({ bs: [it.b], box, shape: it.shape!, kind: it.kind, ground, lo: idx[0]!, hi: idx.at(-1)! })
    else out.push({ bs: [it.b], box, shape: it.shape, kind: it.kind, ground })
  }
  pieces.sort((x, y) => x.lo - y.lo || x.hi - y.hi)
  const joined: typeof pieces = []
  for (const p of pieces) {
    const q = joined.find((j) => j.ground === p.ground && j.hi + 1 === p.lo)
    if (!q) {
      joined.push({ ...p, shape: { ...p.shape, segs: Array.from(p.shape.segs) } })
      continue
    }
    q.bs.push(...p.bs)
    q.hi = p.hi
    q.box = [
      Math.min(q.box[0]!, p.box[0]!),
      Math.min(q.box[1]!, p.box[1]!),
      Math.max(q.box[2]!, p.box[2]!),
      Math.max(q.box[3]!, p.box[3]!),
    ]
    q.shape = {
      ...q.shape,
      segs: [...Array.from(q.shape.segs), ...Array.from(p.shape.segs)],
      hw: Math.max(q.shape.hw, p.shape.hw),
    }
  }
  return [...out, ...joined.map(({ lo: _lo, hi: _hi, ...m }) => m)]
}

/** whether a stretch of a text's glyphs (`idx`, contiguous places in `gs`, its lines' order) is words whole: it holds a letter
 *  or a digit, and the glyph before it and the glyph after it stand a word space apart from it (SPACE_GAP of their size), or on
 *  another line (a paragraph's line break, F3: a baseline half a size away or more, past any script's), or are no letter or
 *  digit, or are none */
function wordBounded(gs: readonly number[], idx: readonly number[], glyphs: readonly G[]): boolean {
  const word = /[\p{L}\p{N}]/u
  const side = (a: number | undefined, b: number | undefined, after: boolean) => {
    if (a === undefined || b === undefined) return true
    const x = glyphs[a]!,
      y = glyphs[b]!
    const [l, r] = after ? [y, x] : [x, y]
    return (
      Math.abs(x.y - y.y) >= 0.5 * Math.max(x.size, y.size) ||
      r.x0 - l.x1 >= SPACE_GAP * Math.min(l.size, r.size) ||
      !word.test(x.u)
    )
  }
  return (
    idx.some((i) => word.test(glyphs[gs[i]!]!.u)) &&
    side(gs[idx[0]! - 1], gs[idx[0]!], false) &&
    side(gs[idx.at(-1)! + 1], gs[idx.at(-1)!], true)
  )
}

/** a stretch of a figure text's glyphs its decoration holds: its element, the decoration its box (an element it is inside or
 *  that is inside it, a code run's, takes the box; else the stretch of its text becomes an element of its own) */
function decorate(ft: FigureText, stretch: number[], bs: number[], glyphs: readonly G[]): void {
  const s = new Set(stretch)
  const hit = ft.els.find((e) => e.glyphs.every((g) => s.has(g)) || stretch.every((g) => e.glyphs.includes(g)))
  if (hit) {
    hit.boxes.push(...bs)
    return
  }
  // (cut out of the text pieces it lies in: an element of its own, `cite` where it holds a letter, `ref` where it holds none)
  const kind = stretch.some((g) => LETTER.test(glyphs[g]!.u)) ? 'cite' : 'ref'
  const order: FigureText['order'] = []
  const i = ft.els.length
  ft.els.push({ kind, glyphs: [...stretch], boxes: [...bs] })
  let placed = false
  for (const o of ft.order) {
    if (o.t !== 'text') {
      order.push(o)
      continue
    }
    let cur: number[] = []
    for (const g of o.glyphs) {
      if (s.has(g)) {
        if (cur.length) order.push({ t: 'text', glyphs: cur })
        cur = []
        if (!placed) order.push({ t: 'el', i })
        placed = true
      } else cur.push(g)
    }
    if (cur.length) order.push({ t: 'text', glyphs: cur })
  }
  ft.order = order
}

/** whether a path's segments close: every segment's end met by another's (to the hundredth of a unit) */
function closed(shape: { segs: ArrayLike<number> } | null): boolean {
  if (!shape || shape.segs.length < 12) return false
  const deg = new Map<string, number>()
  for (let i = 0; i + 3 < shape.segs.length; i += 4)
    for (const [x, y] of [
      [shape.segs[i]!, shape.segs[i + 1]!] as const,
      [shape.segs[i + 2]!, shape.segs[i + 3]!] as const,
    ]) {
      const k = `${Math.round(x * 100)}|${Math.round(y * 100)}`
      deg.set(k, (deg.get(k) ?? 0) + 1)
    }
  return [...deg.values()].every((d) => d % 2 === 0)
}
const flat = (shape: { segs: ArrayLike<number> }) => {
  for (let i = 0; i + 3 < shape.segs.length; i += 4)
    if (Math.abs(shape.segs[i + 1]! - shape.segs[i + 3]!) > 1e-3) return false
  return shape.segs.length >= 4
}
const inside = (g: G, x0: number, y0: number, x1: number, y1: number) =>
  (g.ix0 ?? g.x0) > x0 && (g.ix1 ?? g.x1) < x1 && g.bottom > y0 && g.top < y1

/**
 * A container's room about a text: the nearest of its edges over its baseline and under it across the text's extent, each
 * segment read where it stands over that extent (a rectangle's top and bottom; a diamond's slanted sides at the extent's ends),
 * its half line width in: up and down from the baseline, PDF units
 */
function roomIn(
  shape: { segs: ArrayLike<number>; hw: number; stroke: boolean },
  gs: readonly number[],
  glyphs: readonly G[],
) {
  const x0 = Math.min(...gs.map((g) => glyphs[g]!.x0)),
    x1 = Math.max(...gs.map((g) => glyphs[g]!.x1))
  const ys = gs.map((g) => glyphs[g]!.y).sort((a, b) => a - b)
  const base = ys[ys.length >> 1]!
  const w = shape.stroke ? shape.hw : 0
  let over = Infinity,
    under = Infinity
  const S = shape.segs
  for (let i = 0; i + 3 < S.length; i += 4) {
    const [ax, ay, bx, by] = [S[i]!, S[i + 1]!, S[i + 2]!, S[i + 3]!]
    const lo = Math.max(Math.min(ax, bx), x0),
      hi = Math.min(Math.max(ax, bx), x1)
    if (lo > hi) continue
    for (const x of [lo, hi]) {
      const y = Math.abs(bx - ax) < 1e-9 ? Math.max(ay, by) : ay + ((x - ax) * (by - ay)) / (bx - ax)
      const ylo = Math.abs(bx - ax) < 1e-9 ? Math.min(ay, by) : y
      if (y > base) over = Math.min(over, y - w - base)
      if (ylo < base) under = Math.min(under, base - (ylo + w))
    }
  }
  return { over: Number.isFinite(over) ? over : 0, under: Number.isFinite(under) ? under : 0 }
}
