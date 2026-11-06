// The facts today's reader works out from the page's characters before it typesets (most of prepareUnit, and the readers the
// run calls around a lay: interfaces/typeset-inputs.md §1B-§1F), read once by the prepare on arXiv's page with exact ownership
// (stage 1a-2, contract stage1a2-facts.md). Each reading is pure, over a member's own glyphs and lines and the page's other
// ink; where today's rule had a threshold that only guarded its re-derivation of ownership, ownership answers instead and the
// threshold is gone; a threshold that is a typographic fact stays, named, with its source. File:line: today's engine at
// 065c1d973 (`L2` layer-proto/layer2.mjs, `RUN` run.mjs, `TEX` tex.mjs, `MAKE` layout/make.mjs).
import type { Ink, Line, Piece, Style } from '@readarxiv/format'
import type { DocGlyph } from '../doc.ts'
import { r2 } from './lines.ts'

// ---------------------------------------------------------------- fonts (today's fonts.mjs classifyFont, ported as it is)
/** the PostScript name without its subset tag */
const bare = (name: string) => String(name ?? '').replace(/^[A-Z]{6}\+/, '')
export interface FontClass {
  fam: 'serif' | 'sans' | 'mono' | 'math'
  bold: boolean
  italic: boolean
  caps: boolean
}
/** a PDF font's class, weight, slant and small capitals from its PostScript name: today's classifyFont
 *  (layer-proto/fonts.mjs:42 at 065c1d973), its `design` and PDF.js's fallback guess left out (no rule of the part reads them) */
export function classifyFont(name: string): FontClass {
  const n = bare(name)
  let fam: FontClass['fam'] = 'serif'
  if (
    /^(cmmi|cmsy|cmex|msam|msbm|eufm|eufb|eusm|eu(ex|rm|rb)\d|mt(mi|sy|ex|mib|syb)|rsfs|cmbsy|cmmib|stmary|wasy|txsy|txex|txmi|pxsy|pxex|pxmi|lmmath|latinmodern-math|stixmath|stixtwomath|xitsmath|cambria-?math|esint|bbold|bbm|dsrom|ntxmi|ntxsy|ntxexx|ntxbmi|newtxmi|newtxbmi|newpxmi|newpxbmi|newtxsy|newpxsy|zxmi|zplmi|mathdesign|mdbch|symbol|euler|lasy|line10|lcircle|futs|futm|mnsymbol|esstix|txmia|pxmia)/i.test(
      n,
    ) ||
    /math|symbol/i.test(n)
  )
    fam = 'math'
  else if (
    /mono|courier|typewriter|inconsolata|consol|menlo|^(cm|lm|ec|tc)tt|^sftt|^txtt|^pcr|beramono|sourcecode|firamono|cmvtt|^zi4|nimbusmon|letter ?gothic/i.test(
      n,
    )
  )
    fam = 'mono'
  else if (
    /sans|helvetica|arial|^(cm|lm)ss|^sfs[sxi]|^cmssbx|nimbussan|biolinum|grotesk|verdana|roboto|^lato|opensans|sourcesans|firasans|calibri|avant|futura|frutiger|myriad|segoe|tahoma|gillsans|optima|cabin|raleway|montserrat|^inter|heros|^phv|^uhvr|^qhv|arimo|dejavusans/i.test(
      n,
    )
  )
    fam = 'sans'
  const bold =
    /bold|black|heavy|semibold|demibold|demi\b|-medi(?:ital)?$|-medi\b|^(cm|lm|ec)bx|^cmb\d|^sfbx|^sfsx|^cmssbx|^cmbxti|^cmmib|^cmbsy|-bd\b|^ptmb|^phvb|^linlibertinet?b|linlibertinetbi?$|libertinetb|-bol$|extrabold|ultrabold|-sb$/i.test(
      n,
    )
  const italic =
    /italic|ital\b|ital$|oblique|slant|kursiv|inclined|^(cm|lm)ti|^cmsl|^sfti|^sfsl|^sfsi|^sfbi|^cmbxti|^cmbxsl|^cmssi|^cmitt|^cmsltt|^cmmi|-it$|-bi$|linlibertineti|linlibertinetbi|linbiolinumti|-ita?$|italicmt|obliquemt/i.test(
      n,
    )
  const caps = /caps|^cmcsc|^sfcc|^sfxc|smallcap|-sc$|sc\d*$|^cmtcsc|^lmromancaps/i.test(n) && !/^cmsc/i.test(n)
  return { fam, bold, italic, caps }
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
const real = (g: DocGlyph) => /\S/.test(g.u)

/**
 * The style a run of glyphs is set in, as today's reader reads it off the page (C5 `originalStyle` L2:765: the majority font
 * class by character, math glyphs aside, its size the most common one; C5's `upper` L2:1099: most letters that can tell are
 * capitals): role, bold, slant from the fonts' names, size, fill (0xRRGGBB where not black), the design (the dominant font's
 * base name). TeX's own font state is stage 1b's: this is the value read, not stated
 */
export function styleOf(gs: readonly DocGlyph[], fallbackSize = 10): Style {
  const txt = gs.filter(real)
  const text = txt.filter((g) => classifyFont(g.base).fam !== 'math')
  const by = text.length ? text : txt
  const key = mostOf(
    by.map((g) => {
      const c = classifyFont(g.base)
      return `${c.fam === 'math' ? 'serif' : c.fam}|${c.bold ? 'b' : ''}|${c.italic ? 'i' : ''}`
    }),
  )
  const [role, b, i] = (key ?? 'serif||').split('|') as [Style['role'], string, string]
  const size = mostOf(by.map((g) => r2(g.size))) ?? fallbackSize
  const fill = mostOf(by.map((g) => g.fill))
  const design = mostOf(by.map((g) => g.base))
  const letters = text.filter((g) => g.u.toLowerCase() !== g.u.toUpperCase())
  const upper = letters.length > 1 && letters.filter((g) => g.u === g.u.toUpperCase()).length > letters.length / 2
  return {
    role,
    size,
    ...(b ? { bold: 1 as const } : {}),
    ...(i ? { slant: 1 as const } : {}),
    ...(upper ? { upper: 1 as const } : {}),
    ...(fill !== undefined && fill > 0 ? { fill } : {}),
    ...(design ? { design } : {}),
  }
}

/**
 * A unit's size as today's reader reads it (C5, E6: layer2.mjs originalStyle L2:765 and unitSizeOf L2:796, its characters'
 * sizes by pageChars2 L2:188): the median (the upper one of an even count) of its own text glyphs' sizes along the line, the
 * size PDF.js's text content gives their items (an expanded font's wider than its size up the line), its math fonts' glyphs
 * aside; undefined where it has none (today then reads the size off its lines' bands). Faked small capitals, which today
 * leaves out by its votes over the source's words (smallCapsOf), are not told here (stage 1b: TeX's font state)
 */
export function unitSize(gs: readonly DocGlyph[]): number | undefined {
  const sizes = gs
    .filter((g) => real(g) && classifyFont(g.base).fam !== 'math')
    .map((g) => g.along ?? g.size)
    .sort((a, b) => a - b)
  return sizes.length ? r2(sizes[sizes.length >> 1] as number) : undefined
}

/** an element's fill (B14, maker `fillOfGlyphs` MAKE:1123): the colour more than half its glyphs are filled with, where it is
 *  not black; undefined else */
export function fillOfGlyphs(gs: readonly DocGlyph[]): number | undefined {
  const t = gs.filter(real)
  const f = mostOf(t.map((g) => g.fill))
  if (f === undefined || f <= 0) return undefined
  return t.filter((g) => g.fill === f).length * 2 > t.length ? f : undefined
}

// ---------------------------------------------------------------- the class's tail (C20)
/** the most marks a class sets after a unit's text (amsthm's note ")."; a run-in head's "."; a style's stop after an entry):
 *  today's TAIL_MAX (L2:1577), a fact of the classes */
export const TAIL_MAX = 3
const SENTENCE_KINDS = new Set(['stop', 'comma', 'semi', 'colon', 'excl', 'quest'])
/** a mark's kind (today's markKind L2:2363) */
export function markKind(ch: string): string {
  if (/^[.\u3002\uFF0E\uFF61]$/u.test(ch)) return 'stop'
  if (/^[,\u3001\uFF0C\uFF64]$/u.test(ch)) return 'comma'
  if (/^[;\uFF1B]$/u.test(ch)) return 'semi'
  if (/^[:\uFF1A]$/u.test(ch)) return 'colon'
  if (/^[!\uFF01]$/u.test(ch)) return 'excl'
  if (/^[?\uFF1F]$/u.test(ch)) return 'quest'
  if (/^[)\]}\uFF09\uFF3D\uFF5D\u3009\u300B\u300D\u300F\u3011\u3015\u3017\u3019\u301B’”]$/u.test(ch)) return 'close'
  return ch
}
const TEX_TOKEN = /\\[A-Za-z@]+\*?|\\[\s\S]|---|--|''|``|[\s\S]/gu
const NO_INK = new Set(['\\@', '\\,', '\\;', '\\:', '\\!', '\\/', '\\ ', '\\-', '~', '{', '}'])
const TEX_LIGATURE: Record<string, string> = {
  '---': '—',
  '--': '–',
  "''": '”',
  '``': '“',
  '`': '‘',
  "'": '’',
  '"': '”',
}
/** the marks a source text ends with after its last letter or digit, as TeX prints them, and whether that content was
 *  reached (today's textEndMarks L2:1587; a command but a symbol's is a word: its text unknown here, it stops the marks) */
function textEndMarks(s: string): { marks: string[]; stopped: boolean } {
  const toks = String(s).match(TEX_TOKEN) ?? []
  const marks: string[] = []
  for (let i = toks.length - 1; i >= 0; i--) {
    const t = toks[i] as string
    if (/^\s$/u.test(t) || NO_INK.has(t)) continue
    if (t.length > 1 && t[0] === '\\' && /^\\[A-Za-z]/.test(t)) return { marks, stopped: true }
    const ch = t.length > 1 && t[0] === '\\' ? t.slice(1) : (TEX_LIGATURE[t] ?? t)
    if (/[\p{L}\p{N}]/u.test(ch)) return { marks, stopped: true }
    marks.unshift(...ch)
  }
  return { marks, stopped: false }
}
/** the element kinds that set no ink (today's phClass `zero`, `space`): passed over at a unit's end */
const INKLESS_KINDS = new Set(['zero', 'space', 'other'])
/** the marks a unit's source writes at its end, after its last letter, digit or element (today's sourceEndMarks L2:1608):
 *  null where a symbol element stands among them (its ink is among the page's marks there, as many as its source does not
 *  tell) */
export function sourceEndMarks(content: readonly Piece[]): string[] | null {
  const flat: Piece[] = []
  const walk = (ps: readonly Piece[]) => {
    for (const p of ps) {
      if (p.t === 'span') walk(p.content)
      else flat.push(p)
    }
  }
  walk(content)
  const out: string[] = []
  for (let k = flat.length - 1; k >= 0; k--) {
    const p = flat[k] as Piece
    if (p.t === 'el') {
      if (INKLESS_KINDS.has(p.kind)) continue
      // (a symbol, today's phClass `symbol`: an escaped character, \\%)
      if (p.kind === 'symbol' || /^\\[^A-Za-z\s]$/.test(p.src.trim())) return null
      break
    }
    if (p.t !== 'text') break
    const r = textEndMarks(p.s)
    out.unshift(...r.marks)
    if (r.stopped) break
  }
  return out
}
/** a glyph a text font sets as punctuation (not a formula's: a math font's glyph is the formula's; not one whose Unicode is no
 *  reading of it, `nu`: today's L2:1666) */
const isMark = (g: DocGlyph) => /^\p{P}$/u.test(g.u) && !g.nu && classifyFont(g.base).fam !== 'math'
/**
 * The class's own marks after a unit's text (C20, today's tailOf L2:1638): its own glyphs on its last line after its last
 * letter, digit or element glyph (`after`, in stream order), less the marks its source writes there itself (`ends`, as many,
 * a sentence mark of the source's kind matched with the page's), each a punctuation mark in a text font, TAIL_MAX at most;
 * with its style. Today's test that the marks are "the unit's, erased as text" is ownership itself: `after` are the unit's
 * own text glyphs
 */
export function tailOf(after: readonly DocGlyph[], ends: readonly string[] | null): [string, Style][] | null {
  if (ends === null) return null
  const a = after.filter(real)
  const n = ends.length
  if (a.length <= n) return null
  let from = n
  const lastEnd = ends[n - 1]
  while (
    n > 0 &&
    lastEnd !== undefined &&
    from < a.length &&
    SENTENCE_KINDS.has(markKind(lastEnd)) &&
    markKind((a[from] as DocGlyph).u) === markKind(lastEnd)
  )
    from++
  const rest = a.slice(from)
  if (!rest.length || rest.length > TAIL_MAX || rest.some((g) => !isMark(g))) return null
  return rest.map((g) => [g.u, styleOf([g], g.size)])
}

// ---------------------------------------------------------------- a label's parts (B16, C10, E3)
/** a label's parts by its glyphs' classes: the name (its letters before the number: "Figure", "Theorem"), the number (digits
 *  with the dots, letters and dashes between them: "3", "2.1", "A.4"), the punctuation after it (":", "."), each with its
 *  ink on `page`; today's head/float label readings (L2:1184-1195, L2:1245-1259) read the same three off the label's text */
export function labelParts(
  gs: readonly DocGlyph[],
  page: number,
): { name?: [string, Ink]; num?: [string, Ink]; punct?: [string, Ink] } {
  const t = gs.filter(real)
  const inkOf = (xs: DocGlyph[]): Ink => [
    page,
    r2(Math.min(...xs.map((g) => g.ix0))),
    r2(Math.min(...xs.map((g) => g.bottom))),
    r2(Math.max(...xs.map((g) => g.ix1))),
    r2(Math.max(...xs.map((g) => g.top))),
    r2(mostOf(xs.map((g) => r2(g.y))) ?? (xs[0] as DocGlyph).y),
  ]
  const out: { name?: [string, Ink]; num?: [string, Ink]; punct?: [string, Ink] } = {}
  let e = t.length
  while (e > 0 && /^\p{P}$/u.test((t[e - 1] as DocGlyph).u)) e--
  if (e < t.length)
    out.punct = [
      t
        .slice(e)
        .map((g) => g.u)
        .join(''),
      inkOf(t.slice(e)),
    ]
  let s = e
  while (s > 0 && /[\p{N}.\-–]/u.test((t[s - 1] as DocGlyph).u)) s--
  // (a letter of the number: "A.4", "S1" — a letter with a digit or a dot after it in the number)
  while (
    s > 0 &&
    /\p{Lu}/u.test((t[s - 1] as DocGlyph).u) &&
    /[\p{N}.]/u.test((t[s] as DocGlyph | undefined)?.u ?? '')
  ) {
    const prev = t[s - 2]
    if (prev && /\p{L}/u.test(prev.u) && Math.abs((t[s - 1] as DocGlyph).x0 - prev.x1) < 0.2 * prev.size) break
    s--
  }
  if (s < e && t.slice(s, e).some((g) => /\p{N}/u.test(g.u)))
    out.num = [
      t
        .slice(s, e)
        .map((g) => g.u)
        .join(''),
      inkOf(t.slice(s, e)),
    ]
  else s = e
  const name = t.slice(0, s).filter((g) => /\p{L}/u.test(g.u))
  if (name.length) out.name = [name.map((g) => g.u).join(''), inkOf(name)]
  return out
}

// ---------------------------------------------------------------- forced breaks and their room (C14, D9)
/** a forced break's source (today's FORCED_BREAK TEX:84) */
export const FORCED_BREAK = /^\\\\\*?(?:\[[^\]]*\])?$|^\\newline$/
/** the pitch of a run of baseline gaps: their median (today's break-room.mjs pitchOf) */
export function pitchOf(gaps: readonly number[]): number | null {
  const g = gaps.filter((v) => v > 0).sort((a, b) => a - b)
  return g.length ? ((g[(g.length - 1) >> 1] as number) + (g[g.length >> 1] as number)) / 2 : null
}
/** the distance TeX puts between two lines with no room between them: the pitch, or TeX's \lineskip rule's where the next
 *  line is too tall (break-room.mjs naturalOf) */
export function naturalOf(pitch: number, depth: number, height: number, lineskip?: [number, number]): number {
  return lineskip && pitch - depth - height < lineskip[1] ? Math.max(pitch, depth + height + lineskip[0]) : pitch
}
/** the room after a break in pitches: the gap less the natural distance (break-room.mjs roomOf) */
export function roomOf(gap: number, pitch: number, natural: number): number {
  return Math.max(0, Math.round(((gap - natural) / pitch) * 1000) / 1000)
}
/**
 * A forced break's line and room (El.ends): `line` the index of the line TeX ended at it (the line of the last glyph before its
 * point in B's stream, carried to A); its room after, in pitches, by the member's lines: the gap from that line's baseline to
 * the next one's against the pitch of its other consecutive lines on that page and column (today's forcedBreaks TEX:120's
 * geometry, which found the line by its short end: SHORT; ownership and TeX's point find it instead). Null room where no
 * pitch is known (one line, or a page change)
 */
export function breakEnd(
  lines: readonly Line[],
  line: number,
  breaks: ReadonlySet<number>,
  lineskip?: [number, number],
): [number, number] | null {
  const L = lines[line]
  const N = lines[line + 1]
  if (!L || !N) return null
  if (N[0] !== L[0] || N[1] !== L[1]) return [line, 0]
  const gaps: number[] = []
  for (let j = 0; j + 1 < lines.length; j++) {
    const a = lines[j] as Line
    const b = lines[j + 1] as Line
    if (breaks.has(j) || a[0] !== b[0] || a[1] !== b[1] || a[9] & 1 || b[9] & 1) continue
    gaps.push(a[4] - b[4])
  }
  const pitch = pitchOf(gaps)
  if (pitch === null) return [line, 0]
  const gap = L[4] - N[4]
  return [line, roomOf(gap, pitch, naturalOf(pitch, L[4] - L[6], N[5] - N[4], lineskip))]
}

// ---------------------------------------------------------------- short skips (E15)
/** TeX's \abovedisplayshortskip: a display set under a line that ends \predisplaysize (2 em) or more before it, its top less
 *  than SHORT_SKIP of a size under that line's baseline (today's shortSkipsOf TEX:328, SHORT_SKIP and PREDISPLAY L2:3155,
 *  3158: TeX's rule read off the page, the display's size \predisplaysize's 2 em; TeX's own skip is stage 1b's) */
export const SHORT_SKIP = 0.3
export const PREDISPLAY = 2
/** the lines (indices) a display of the member stands under with TeX's short skip */
export function shortSkipLines(
  lines: readonly Line[],
  displays: readonly Ink[],
  sizeOf: (j: number) => number,
): Set<number> {
  const out = new Set<number>()
  for (const d of displays)
    lines.forEach((l, j) => {
      if (l[9] & 1 || l[0] !== d[0]) return
      const size = sizeOf(j)
      if (d[4] < l[4] && d[4] > l[4] - SHORT_SKIP * size && l[3] + PREDISPLAY * size <= d[1]) out.add(j)
    })
  return out
}

// ---------------------------------------------------------------- room beside, a cell's band (E13, E27, E24)
/** a piece of the page's ink: its box and its baseline (a glyph's; a box's bottom) */
export interface InkBox {
  x0: number
  x1: number
  y0: number
  y1: number
}
/**
 * The free paper beside a member's lines on their baselines (Room.side): from the nearest ink not its own on each line's band
 * (its fonts' box, top to bottom) to the left and to the right, within the text block `block` (its column's extent on the
 * page), the narrowest over its lines. Today's widenings read it with clearances of their own (RUN:1557-1587, 6 pt clear,
 * half an em; RUN:1689-1753, a quarter em): those are the typesetter's choices, the paper is the part's
 */
export function sideOf(
  lines: readonly Line[],
  foreign: (page: number) => readonly InkBox[],
  block: (l: Line) => [number, number],
): [number, number] | undefined {
  let lo = Number.NEGATIVE_INFINITY
  let hi = Number.POSITIVE_INFINITY
  for (const l of lines) {
    if (l[9] & 1) continue
    const [b0, b1] = block(l)
    let left = Math.min(b0, l[2])
    let right = Math.max(b1, l[3])
    for (const k of foreign(l[0])) {
      if (k.y1 <= l[6] || k.y0 >= l[5]) continue
      if (k.x1 <= l[2] + 0.01 && k.x1 > left) left = k.x1
      else if (k.x0 >= l[3] - 0.01 && k.x0 < right) right = k.x0
    }
    lo = Math.max(lo, left)
    hi = Math.min(hi, right)
  }
  return Number.isFinite(lo) && Number.isFinite(hi) && hi > lo ? [r2(lo), r2(hi)] : undefined
}
/**
 * A cell's clear band between the rules over and under its lines (Room.band; today's cellBands L2:352): over, the lowest
 * rule at or above its first line's baseline, under, the highest at or below its last line's, each across its lines by more
 * than half a point; undefined where no rule stands over or under it. `rules` the page's painted boxes
 */
export function bandOf(
  lines: readonly Line[],
  rules: (page: number) => readonly InkBox[],
): [number, number] | undefined {
  const own = lines.filter((l) => !(l[9] & 1))
  const first = own[0]
  const last = own.at(-1)
  if (!first || !last) return undefined
  const x0 = Math.min(...own.map((l) => l[2]))
  const x1 = Math.max(...own.map((l) => l[3]))
  let over = Number.POSITIVE_INFINITY
  let under = Number.NEGATIVE_INFINITY
  for (const R of rules(first[0])) {
    if (Math.min(R.x1, x1) - Math.max(R.x0, x0) <= 0.5) continue
    if (R.y0 >= first[4]) over = Math.min(over, R.y0)
  }
  for (const R of rules(last[0])) {
    if (Math.min(R.x1, x1) - Math.max(R.x0, x0) <= 0.5) continue
    if (R.y1 <= last[4]) under = Math.max(under, R.y1)
  }
  if (over === Number.POSITIVE_INFINITY && under === Number.NEGATIVE_INFINITY) return undefined
  return [
    r2(under === Number.NEGATIVE_INFINITY ? last[6] : under),
    r2(over === Number.POSITIVE_INFINITY ? first[5] : over),
  ]
}

/** whether a line shares its baseline with ink that stays (Line PINNED; today's edgesOf `alone` RUN:1638, its baseline band
 *  0.4 of a size): ink on that band, across its column, outside the line's own extent by half a point */
export function pinnedOf(
  l: Line,
  size: number,
  stays: readonly { x0: number; x1: number; y: number }[],
  col: [number, number],
): boolean {
  return stays.some(
    (c) =>
      Math.abs(c.y - l[4]) < 0.4 * size && c.x1 > col[0] && c.x0 < col[1] && (c.x1 < l[2] - 0.5 || c.x0 > l[3] + 0.5),
  )
}

// ---------------------------------------------------------------- alignment read off the page (B3, E8)
/** a line's centre off its column's centre by at most CENTRE points (the maker's CENTRE MAKE:96) and the inset off both edges
 *  of a one-line paragraph centred by its own glue (INSET ems, MAKE:98): the maker's reading where TeX does not tell */
export const CENTRE = 2
export const INSET = 2
/** a unit's alignment as the maker reads it where TeX did not state it (MAKE:2121-2135): centred where every line's centre is
 *  its column's (`edges`) and one line at least is short of it by an em; else justified. With TeX's 'j' (a one-line
 *  paragraph centred by its own \hfill), centred where its line also stands INSET ems off both edges */
export function alignOf(
  lines: readonly Line[],
  sizeOf: (j: number) => number,
  edges: (l: Line) => [number, number] | null,
  told?: 'j' | 'l' | 'c' | 'r',
  labelX0?: number,
): 'j' | 'l' | 'c' | 'r' {
  if (told && told !== 'j') return told
  const own = lines.filter((l) => !(l[9] & 1))
  let centred = own.length > 0
  let short = false
  let inset = own.length === 1
  own.forEach((l, j) => {
    if (!centred) return
    const x0 = j === 0 && labelX0 !== undefined ? Math.min(l[2], labelX0) : l[2]
    const em = sizeOf(j) > 0 ? sizeOf(j) : 10
    const e = edges(l)
    if (!e || Math.abs((x0 + l[3]) / 2 - (e[0] + e[1]) / 2) > CENTRE) {
      centred = false
      return
    }
    if (e[1] - e[0] - (l[3] - x0) > em) short = true
    if (!(x0 - e[0] > INSET * em && e[1] - l[3] > INSET * em)) inset = false
  })
  if (told === 'j') return centred && inset ? 'c' : 'j'
  return centred && short ? 'c' : 'j'
}
/** a single-line cell's centring by its table column's cells on its page (E8, today's cellCentred RUN:1508, its column by
 *  table, column and span; the tabular preamble's l/c/r is stage 1b's): every middle
 *  within 2 of every other and the widths spread by more than 4 (a column whose cells share a start or an end has its middles
 *  half the widths' spread apart); false where the middles spread; null where nothing tells */
export function cellCentred(spans: readonly [number, number][]): boolean | null {
  if (spans.length < 2) return null
  const mids = spans.map(([a, z]) => (a + z) / 2).sort((a, b) => a - b)
  const widths = spans.map(([a, z]) => z - a)
  if ((mids.at(-1) as number) - (mids[0] as number) > 2) return false
  return Math.max(...widths) - Math.min(...widths) > 4 ? true : null
}
