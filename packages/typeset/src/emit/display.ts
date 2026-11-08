// D.display (design-b §1.6 E1, design-a §1.2 Laid.lines): a laid unit's lines on a page as it is drawn, each line's runs of one
// face and its crops, in the line's order. Ported from engine 065c1d973 layer2.mjs lineRuns L2:4633-4688 (the runs a line is
// drawn in, COPY_SPACE_EM L2:4632), runEdge L2:4695-4709, svgOfUnit L2:4579-4619 (what each run draws: its size, its raise, its
// fill, its slant; a crop's copy text over it) and hideOps L2:4452-4469 (where a crop is laid: its ink's top on the line, its
// width the item's, scaled by the line's scale). The SVG markup and the device pixels are the painter's (lane L4's); this is
// what they draw, in PDF units on A.
import type { Face, Token } from '../breaker/tokens.ts'
import { fontString } from '../breaker/measure.ts'
import type { FitState, LaidItem, LaidLine, Layout } from '../fit/types.ts'
import type { FaceId, Item } from '../types.ts'

/** the least kern after a word that copies as a space, em of the line's size (L2:4632 COPY_SPACE_EM) */
export const COPY_SPACE_EM = 0.25

/** a line's own fit where the unit's runs were laid apart (X.runs: `seg`), else the unit's */
type Seg = { f: number; scale: number; state: FitState }
const segOf = (line: LaidLine, L: Layout): Seg => (line.seg as Seg | undefined) ?? L

/** a run of lineRuns: one face, its text, where it starts (or each character's place, `chars`), its tracking, its items */
export type TextRun = {
  face: Face
  chars: boolean
  sup: boolean
  color: string | undefined
  text: string
  xs: number[]
  track?: number
  /** each item drawn in it: its index on the line and the UTF-16 offset of its text in the run's */
  items: [number, number][]
  sc?: number
}
export type LineRun = TextRun | { crop: number }

/** a face as the drawing tells two apart (L2:4627 faceKey) */
const faceKey = (face: Face) => `${face.family}|${face.weight}|${face.style}|${face.caps ? 1 : 0}`
type T = Token & { hyphenated?: boolean }

/**
 * A laid line's runs in order (L2:4633 lineRuns): single CJK characters of one face share a run, each at its own place; a word
 * flows in its face from its own place with the words glued to it; a space is copied with the text before it; the line's last
 * Latin word, and a word explicit glue of a space's width or more follows, copy a space after them; a crop is a run of its own
 */
export function lineRuns(line: LaidLine, L: Layout): LineRun[] {
  const out: LineRun[] = []
  const LS = segOf(line, L)
  let run: TextRun | null = null
  const flush = () => {
    if (run) {
      out.push(run)
      run = null
    }
  }
  const items = line.items as (LaidItem & { kern?: number })[]
  items.forEach((it, n) => {
    const t = it.t as T
    if (t.crop) {
      flush()
      out.push({ crop: n })
      return
    }
    if (t.space) {
      const r = run as TextRun | null
      if (r) {
        r.items.push([n, r.text.length])
        r.text += ' '
        if (r.chars) r.xs.push(it.x!)
      }
      return
    }
    const s = t.s ?? ''
    const single = t.cls === 'cjk' && [...s].length === 1 && !t.sup
    const cur = run as TextRun | null
    const sameFace =
      !!cur &&
      faceKey(cur.face) === faceKey(t.face!) &&
      cur.face.oblique === t.face!.oblique &&
      cur.sup === !!t.sup &&
      cur.color === t.st?.color &&
      cur.sc === t.sc
    if (single) {
      if (!sameFace || !cur!.chars) {
        flush()
        run = { face: t.face!, chars: true, sup: false, color: t.st?.color, text: '', xs: [], items: [] }
      }
      const r = run as unknown as TextRun
      r.items.push([n, r.text.length])
      r.text += s
      r.xs.push(it.x!)
    } else {
      const prev = items[n - 1] as (LaidItem & { kern?: number }) | undefined
      const glued =
        !!cur &&
        !cur.chars &&
        sameFace &&
        !prev?.t.space &&
        !prev?.t.kern &&
        !prev?.kern &&
        prev?.t.cls === t.cls &&
        !t.brk
      if (!glued) {
        flush()
        run = {
          face: t.face!,
          chars: false,
          sup: !!t.sup,
          color: t.st?.color,
          text: '',
          xs: [it.x!],
          track: t.sup ? 0 : t.cls === 'cjk' ? LS.state.track : LS.state.trackLatin,
          items: [],
        }
        if (t.sc) run.sc = t.sc
      }
      const r = run as unknown as TextRun
      r.items.push([n, r.text.length])
      r.text += s
    }
    const r = run as unknown as TextRun
    if (n === items.length - 1 && t.cls === 'latin' && !t.hyphenated) r.text += ' '
    else if (n < items.length - 1 && !r.chars && (it.kern ?? 0) >= COPY_SPACE_EM * LS.f) r.text += ' '
  })
  flush()
  return out
}

/**
 * Where a run draws its text (L2:4695 runEdge): the x of the edge before its UTF-16 offset `at`, from its start, the width of
 * the text before it in its face at the size it is drawn (`w100`, a run's width at 100 px) and its tracking after each
 * character; a run of single characters has each at its own place, after its last the item's slot's end
 */
export function runEdge(
  run: TextRun,
  at: number,
  line: LaidLine,
  L: Layout,
  w100: (s: string, face: Face) => number,
): number {
  if (run.chars) {
    const cps = [...run.text.slice(0, at)].length
    if (cps < run.xs.length) return run.xs[cps]!
    const [n] = run.items.at(-1)!
    const it = line.items[n]!
    return it.x! + it.w
  }
  const before = run.text.slice(0, at)
  const LF = segOf(line, L).f,
    f = LF * (run.sup ? 0.62 : 1) * (run.sc ?? 1)
  return run.xs[0]! + (w100(before, run.face) * f) / 100 + (run.track ? run.track * LF * [...before].length : 0)
}

/** a run of text as it is drawn: design-a's Item, with what the drawing sets beside it (its raise, tracking, slant) */
export type TextItem = Extract<Item, { face: FaceId }> & {
  /** a superscript's raise over the baseline (svgOfUnit: 0.36 of the line's size) */
  rise?: number
  /** the tracking after each character, PDF units (a word laid out with tracking) */
  track?: number
  /** an oblique face's slant, degrees (its points skewed about the baseline) */
  slant?: number
}
/** a crop as it is drawn: design-a's Item, with its width on the line (the item's) */
export type CropItem = Extract<Item, { src: unknown }> & { w: number }
export type DisplayItem = TextItem | CropItem
export type DisplayLine = [y: number, x0: number, x1: number, items: DisplayItem[]]

/** a run's own fill as the drawing writes it (svgOfUnit fillAttr: a fill as it is); a colour that is no fill names none, so the run
 *  takes the layer's ink: the reader's sheet's, the PDF's own black (the owner's ruling of 2026-11-08), or CJK_INK for a CJK run */
const fillOf = (c: string | undefined) =>
  c !== undefined && /^#[0-9a-f]{6}$/.test(c) ? Number.parseInt(c.slice(1), 16) : undefined

/** the ink of a CJK run that names no fill of its own: today's layer ink (layer-proto/run.mjs SVG_RULES), 92 % of black at full
 *  coverage. The owner's exception of 2026-11-08 to the PDF's black: the translation's CJK text at today's weight, its Latin,
 *  digits and formulas in the PDF's black (lanes/cjk-weight.md: the one difference between today's CJK and v2's was this ink) */
export const CJK_INK = 0x141414

/**
 * A page's laid lines inked: a run of the CJK class (`cjk`, the breaker's class of a character, script.ts cjkClassRe under the
 * rules' cjkQuotes: every character of the run but white space is Han, kana, Hangul, Bopomofo, a CJK mark or a full-width form,
 * or a curly quote, dash, ellipsis or middle dot where the rules set those as CJK's: the characters the breaker sets in the
 * target's CJK face) that names no fill of its own takes CJK_INK; every other run and every crop as it is. Each line's runs are
 * of one class already (lineRuns, a name's and a figure text's runs by script), so the class of its characters is the class it
 * was set in
 */
export function inkLines<L extends readonly [number, number, number, readonly Item[]]>(
  lines: readonly L[],
  cjk: RegExp,
): L[] {
  const isCjk = (s: string) => {
    let any = false
    for (const ch of s) {
      if (/\s/u.test(ch)) continue
      if (!cjk.test(ch)) return false
      any = true
    }
    return any
  }
  return lines.map((l) => {
    const items = l[3]
    if (!items.some((it) => !('src' in it) && it.fill === undefined && isCjk(it.s))) return l
    return [
      l[0],
      l[1],
      l[2],
      items.map((it) => (!('src' in it) && it.fill === undefined && isCjk(it.s) ? { ...it, fill: CJK_INK } : it)),
    ] as unknown as L
  })
}

/**
 * D.display: the unit's laid lines on page `page`, in its layout's order: each line's baseline, its extent (x0 to x0 + used, as
 * today's record reads it) and its items. A text run's `size` is the size its face is measured at (Metrics: the FaceId is the
 * face at 100 px with its size correction), a superscript's 0.62 of the line's and small capitals' their share; a crop's
 * `src` its ink on its page with its baseline, `k` the line's scale, `piece` its element (`label` for a label's)
 */
export function displayLines(L: Layout, page: number): DisplayLine[] {
  const out: DisplayLine[] = []
  for (const line of L.lines) {
    if (line.page !== page) continue
    const seg = segOf(line, L),
      LF = seg.f
    const items: DisplayItem[] = []
    for (const run of lineRuns(line, L)) {
      if ('crop' in run) {
        const it = line.items[run.crop]!
        const c = it.t.crop as {
          page: number
          crop: number[]
          baseline: number
          text?: string
          k?: number
          cut?: 1 | 2 | 3
        }
        items.push({
          s: c.text ?? '',
          x: it.x!,
          src: [c.page, c.crop[0]!, c.crop[1]!, c.crop[2]!, c.crop[3]!, c.baseline],
          k: seg.scale,
          piece: c.k !== undefined ? String(c.k) : 'label',
          ...(c.cut ? { cut: c.cut } : {}),
          w: it.w,
        })
        continue
      }
      const item: TextItem = {
        s: run.text,
        x: run.xs[0]!,
        face: fontString(run.face, 100),
        size: LF * (run.sup ? 0.62 : 1) * (run.sc ?? 1),
      }
      const fill = fillOf(run.color)
      if (fill !== undefined) item.fill = fill
      if (run.chars && run.xs.length > 1) item.dx = run.xs.map((x) => x - run.xs[0]!)
      if (run.sup) item.rise = LF * 0.36
      if (!run.chars && run.track) item.track = run.track * LF
      if (run.face.oblique) {
        item.skew = 1
        item.slant = run.face.oblique
      }
      items.push(item)
    }
    out.push([line.baseline, line.x0, line.x0 + (line.used ?? 0), items])
  }
  return out
}
