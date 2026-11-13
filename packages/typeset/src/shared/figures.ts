// S.figures (design-b §1.6 L4, T10, G16, A26): a page's figure texts (the content class `figures`, docs/route/orphan-text.md
// stage 5), each drawn in its translation where it says something its source does not, in the faces of its font's family and
// weight (its CJK characters in the target's CJK face, the rest in the Latin one), each set fitted at one size (figure-fit.ts),
// each translation's line by its ink as the breaker sets every line (the blank halves of the marks at its edges, blanksOf);
// else left the original's, why told: `no row`, `kept`, `untranslated`, `same` as its source, `unhidden` where the document
// holds no group of it, a face's refusal (`served`), `unfit` (its width needs more than the floor). Width is the fit's only test
// (figure-fit.ts, the owner's rule of 2026-11-13): a translation's height is not measured. Ported from engine 065c1d973 run.mjs
// paintFigures RUN:1441-1496 without its paint (the hidden box, the SVG, the text layer: the reader's and D.*'s), layer2.mjs
// figureRuns, figureRunsWidth L2:4824-4836 and fonts.mjs classifyFont's family, weight and slant (fonts.mjs:42-52). A face not
// loaded yet is waited for (B.cover: `waiting`, its faces in `wait`), where today's run awaited it.
import { hangOf, leadOf } from '../breaker/break.ts'
import { cover } from '../breaker/cover.ts'
import { type FitMeasure, fitMeasure } from '../breaker/measure.ts'
import { cjkClassRe, markOf } from '../breaker/script.ts'
import { shown, type TextPiece } from '../breaker/text.ts'
import type { Face, Token, TStyle } from '../breaker/tokens.ts'
import { firstCompress } from '../fit/walk.ts'
import type { FaceId, Metrics } from '../types.ts'
import { type FitFigure, fitFigureSet, sameAsSource } from './figure-fit.ts'

/** a figure unit on its page (figure-rows.mjs checkFigures): its run's first glyph's origin, its direction, its box's length
 *  along it, its size and band, its anchor, its fill (-1 none), its font's name, its set, its room */
export type FigureRow = FitFigure & {
  id: number
  group: string
  page: number
  x: number
  y: number
  ux: number
  uy: number
  ascent: number
  descent: number
  fill: number
  font: string
  /** its family, weight and slant where they are stated (a part's Style), else read off its font's name (`font`); its small
   *  capitals and its design where its style reads them (lay/read.ts tstyleOf: a face of small capitals, the design of its
   *  family), so that its runs are drawn in its face as a body unit's are (Codex on #634, ec222ba69) */
  cls?: {
    fam: 'serif' | 'sans' | 'mono' | 'math'
    bold: boolean
    italic: boolean
    caps?: true
    design?: string
    /** a group's fill where its style states one (0xRRGGBB, 0 black): TeX's line in a picture over two colours (2611.03178v1's
     *  label and the address after it in the link's colour); none: the figure text's own */
    fill?: number
  }
  set: string
}
/** a figure text's family, weight and slant (FigureRow.cls) */
export type FigureClass = NonNullable<FigureRow['cls']>
/** a figure unit's row as the door gives it (rows.mjs unitOf): its state and its pieces, each in the style of its group's run on
 *  A where it stands in one (`cls`: a figure text's run of glyphs in another face, the part's SpanAt.style), else the unit's */
export type FigureUnit = {
  state: string
  pieces?: readonly (({ t: string; s?: string; tr?: boolean } | TextPiece) & { cls?: FigureClass })[]
}
/** a run of a figure's translation in one face (figureRuns), and its fill where its group states one (FigureClass.fill) */
export type FigureRun = { s: string; face: Face; cls: 'cjk' | 'latin'; fill?: number }
/** a figure text's outcome: drawn (its text, runs, size, where its anchor keeps it, its width, its turn in degrees
 *  anticlockwise, its fill) or why not */
export type Figure = {
  id: number
  group: string
  page: number
  drawn: boolean
  why: string | null
  text?: string
  runs?: FigureRun[]
  size?: number
  x?: number
  y?: number
  width?: number
  angle?: number
  fill?: number
  set?: string
}

export type FiguresInput = {
  /** the page's figure units, in their rows' order */
  figures: readonly FigureRow[]
  /** a figure unit's row, undefined where the door has none */
  unit: (id: number) => FigureUnit | undefined
  /** a figure unit's plain source (mt.mjs plainSource) */
  src: (id: number) => string
  /** whether the document holds a group of a figure unit (the add-on's: VIS) */
  grouped: (group: string) => boolean
  /** the paper's designs of each family (A3) */
  designs: Readonly<Record<string, string>>
  /** a style's face in a script class (B.faces) */
  faceOf: (st: TStyle, cls: 'cjk' | 'latin') => Face
  /** the rules' cjkQuotes, the last floor (P.floorMin), and how far the marks are compressed (compressMax: blanksOf) */
  rules: { cjkQuotes?: boolean; floorMin: number; compressMax: number }
  metrics: Metrics
  /** the most of their sizes a set's units are drawn at (fitFigureSet's `cap`): a figure text of its size tie another path laid
   *  smaller; none, their own fit's */
  caps?: (set: string) => number | undefined
}

// ---- fonts.mjs classifyFont: the family, weight and slant a font's name tells (what figures read of it)
const bare = (name: string) => String(name ?? '').replace(/^[A-Z]{6}\+/, '')
const MATH =
  /^(cmmi|cmsy|cmex|msam|msbm|eufm|eufb|eusm|eu(ex|rm|rb)\d|mt(mi|sy|ex|mib|syb)|rsfs|cmbsy|cmmib|stmary|wasy|txsy|txex|txmi|pxsy|pxex|pxmi|lmmath|latinmodern-math|stixmath|stixtwomath|xitsmath|cambria-?math|esint|bbold|bbm|dsrom|ntxmi|ntxsy|ntxexx|ntxbmi|newtxmi|newtxbmi|newpxmi|newpxbmi|newtxsy|newpxsy|zxmi|zplmi|mathdesign|mdbch|symbol|euler|lasy|line10|lcircle|futs|futm|mnsymbol|esstix|txmia|pxmia)/i
const MONO =
  /mono|courier|typewriter|inconsolata|consol|menlo|^(cm|lm|ec|tc)tt|^sftt|^txtt|^pcr|beramono|sourcecode|firamono|cmvtt|^zi4|nimbusmon|letter ?gothic/i
const SANS =
  /sans|helvetica|arial|^(cm|lm)ss|^sfs[sxi]|^cmssbx|nimbussan|biolinum|grotesk|verdana|roboto|^lato|opensans|sourcesans|firasans|calibri|avant|futura|frutiger|myriad|segoe|tahoma|gillsans|optima|cabin|raleway|montserrat|^inter|heros|^phv|^uhvr|^qhv|arimo|dejavusans/i
const BOLD =
  /bold|black|heavy|semibold|demibold|demi\b|-medi(?:ital)?$|-medi\b|^(cm|lm|ec)bx|^cmb\d|^sfbx|^sfsx|^cmssbx|^cmbxti|^cmmib|^cmbsy|-bd\b|^ptmb|^phvb|^linlibertinet?b|linlibertinetbi?$|libertinetb|-bol$|extrabold|ultrabold|-sb$/i
const ITALIC =
  /italic|ital\b|ital$|oblique|slant|kursiv|inclined|^(cm|lm)ti|^cmsl|^sfti|^sfsl|^sfsi|^sfbi|^cmbxti|^cmbxsl|^cmssi|^cmitt|^cmsltt|^cmmi|-it$|-bi$|linlibertineti|linlibertinetbi|linbiolinumti|-ita?$|italicmt|obliquemt/i
/** a font's family (serif, sans, mono, math), weight and slant by its name (fonts.mjs:42 classifyFont, no PDF.js guess) */
export function fontClassOf(name: string): { fam: 'serif' | 'sans' | 'mono' | 'math'; bold: boolean; italic: boolean } {
  const n = bare(name)
  const fam = MATH.test(n) || /math|symbol/i.test(n) ? 'math' : MONO.test(n) ? 'mono' : SANS.test(n) ? 'sans' : 'serif'
  return { fam, bold: BOLD.test(n), italic: ITALIC.test(n) }
}

/** a figure's translation in its runs by script, each in its face (L2:4825 figureRuns); and by style, where its characters
 *  (`at`, by code point) hold their own (a group's run on A), each run in its style's face */
export function figureRuns(
  text: string,
  faceOf: (cls: 'cjk' | 'latin', st?: TStyle) => Face,
  quotes: boolean,
  at: readonly (TStyle | undefined)[] = [],
): FigureRun[] {
  const cjkRe = cjkClassRe(quotes),
    runs: { cls: 'cjk' | 'latin'; s: string; st: TStyle | undefined }[] = []
  let k = 0
  for (const ch of text) {
    const cls = cjkRe.test(ch) ? 'cjk' : 'latin',
      st = at[k++],
      last = runs.at(-1)
    if (last?.cls === cls && last.st === st) last.s += ch
    else runs.push({ cls, s: ch, st })
  }
  return runs.map((r) => {
    const face = r.st ? faceOf(r.cls, r.st) : faceOf(r.cls)
    return { s: r.s, face, cls: r.cls, ...(typeof r.st?.fill === 'number' ? { fill: r.st.fill } : {}) }
  })
}
/** a translation's pieces as one text, as the figure is drawn (a piece that is no text a space, white space one space, trimmed),
 *  and each of its characters' own style (by code point: its piece's, where it holds one; a space its white space's first) */
function textOfPieces(pieces: NonNullable<FigureUnit['pieces']>): { text: string; at: (FigureClass | undefined)[] } {
  const out: { c: string; cls: FigureClass | undefined }[] = []
  let space = false
  for (const p of pieces)
    for (const c of p.t === 'text' ? shown(p as TextPiece) : ' ') {
      if (/\s/.test(c)) {
        if (!space) out.push({ c: ' ', cls: p.cls })
        space = true
        continue
      }
      out.push({ c, cls: p.cls })
      space = false
    }
  while (out[0]?.c === ' ') out.shift()
  while (out.at(-1)?.c === ' ') out.pop()
  return { text: out.map((x) => x.c).join(''), at: out.map((x) => x.cls) }
}
/** figureRuns' width at size 1, each run's in its face (L2:4836 figureRunsWidth, widthOf L2:1322) */
export const figureRunsWidth = (runs: readonly FigureRun[], m: FitMeasure): number =>
  runs.reduce((a, r) => a + m.w100(r.s, r.face) / 100, 0)

/** the blank halves at the edges of a figure text's line, before its ink and after it, em of its size: its line set as the
 *  breaker sets every line (B.break leadOf, hangOf) at its target's first state (firstCompress), its first and last characters
 *  marks as the tokens class them (script.ts markOf: a mark's blank half as its run's face draws it; none where its ink crosses
 *  its em's middle, nor for a curly quote in an alphabet's Latin face, Codex on #634) */
function blanksOf(runs: readonly FigureRun[], rules: FiguresInput['rules']): [number, number] {
  const compress = firstCompress(rules)
  const edge = (r: FigureRun | undefined, ch: string | undefined) => ({
    t: { punct: r?.cls === 'cjk' && ch ? markOf(ch, r.face.ids) : null },
  })
  const a = runs[0],
    z = runs.at(-1)
  return [leadOf(edge(a, a && [...a.s][0]), compress), hangOf(edge(z, z && [...z.s].at(-1)), compress)]
}

/** a row a translation (rows.mjs: whole or partial, with its pieces) */
const translated = (u: FigureUnit | undefined): u is FigureUnit & { pieces: NonNullable<FigureUnit['pieces']> } =>
  !!u?.pieces && (u.state === 'whole' || u.state === 'partial')

/** S.figures on one page (RUN:1441 paintFigures): each figure unit's outcome, in its rows' order; the faces to wait for */
export function figures(i: FiguresInput): { figures: Figure[]; wait: [FaceId, string][] } {
  const m = fitMeasure(i.metrics)
  const out: Figure[] = [],
    wait: [FaceId, string][] = []
  const ready: {
    f: FigureRow
    rec: Figure
    text: string
    runs: FigureRun[]
    width1: number
    blank1: [number, number]
  }[] = []
  for (const f of i.figures) {
    const rec: Figure = { id: f.id, group: f.group, page: f.page, drawn: false, why: null }
    out.push(rec)
    const u = i.unit(f.id)
    if (!translated(u)) {
      rec.why = !u ? 'no row' : u.state === 'kept' ? 'kept' : 'untranslated'
      continue
    }
    const { text, at } = textOfPieces(u.pieces)
    if (!text || sameAsSource(text, i.src(f.id))) {
      Object.assign(rec, { why: 'same', text })
      continue
    }
    if (!i.grouped(f.group)) {
      Object.assign(rec, { why: 'unhidden', text })
      continue
    }
    // (its style, and each of its groups' runs' where its translation holds them: a style a class, its faces the paper's design)
    const styleOf = (cf: FigureClass): TStyle => {
      const fam = cf.fam === 'math' ? 'serif' : cf.fam
      return {
        fam,
        bold: cf.bold,
        italic: cf.italic,
        caps: !!cf.caps,
        design: cf.design ?? i.designs[fam] ?? i.designs.serif,
        ...(cf.fill !== undefined ? { fill: cf.fill } : {}),
      }
    }
    const st = styleOf(f.cls ?? fontClassOf(f.font))
    const own = new Map<FigureClass, TStyle>()
    const stAt = at.map((c) => (c ? (own.get(c) ?? own.set(c, styleOf(c)).get(c)!) : undefined))
    // (a CJK run in the face the fitter gave it before a label's small capitals and design were carried: the paper's design, no
    // small capitals, which are no CJK face's; its fallbacks as they were)
    const cjkOf = (c: TStyle): TStyle => ({
      ...c,
      caps: false,
      design: i.designs[!c.fam || c.fam === 'math' ? 'serif' : c.fam] ?? i.designs.serif,
    })
    const runs = figureRuns(
      text,
      (cls, s) => i.faceOf(cls === 'cjk' ? cjkOf(s ?? st) : (s ?? st), cls),
      !!i.rules.cjkQuotes,
      stAt,
    )
    const covered = cover(
      runs.map((r) => ({ s: r.s, face: r.face }) as Token),
      i.metrics,
    )
    if ('wait' in covered) {
      wait.push(...covered.wait)
      Object.assign(rec, { why: 'waiting', text })
      continue
    }
    if (!covered.ok) {
      Object.assign(rec, { why: covered.why, text })
      continue
    }
    ready.push({
      f,
      rec,
      text,
      runs,
      width1: figureRunsWidth(runs, m),
      blank1: blanksOf(runs, i.rules),
    })
  }
  // (each set fitted at one size, its units in their rows' order)
  const bySet = new Map<string, typeof ready>()
  for (const c of ready) {
    const key = c.f.set ?? c.f.group
    const list = bySet.get(key) ?? []
    bySet.set(key, list)
    list.push(c)
  }
  const fits = new Map<(typeof ready)[number], ReturnType<typeof fitFigureSet>[number]>()
  for (const [key, list] of bySet)
    fitFigureSet(list, i.rules.floorMin, i.caps?.(key) ?? 1).forEach((fit, k) => {
      fits.set(list[k]!, fit)
    })
  for (const c of ready) {
    const { f, rec, text, runs } = c,
      fit = fits.get(c)
    if (!fit) {
      Object.assign(rec, { why: 'unfit', text })
      continue
    }
    const x = f.x + f.ux * fit.offset,
      y = f.y + f.uy * fit.offset,
      angle = (Math.atan2(f.uy, f.ux) * 180) / Math.PI
    Object.assign(rec, {
      drawn: true,
      text,
      runs,
      size: fit.size,
      x,
      y,
      width: fit.width,
      angle,
      ...(f.fill > 0 ? { fill: f.fill } : {}),
      set: f.set ?? f.group,
    })
  }
  return { figures: out, wait }
}
