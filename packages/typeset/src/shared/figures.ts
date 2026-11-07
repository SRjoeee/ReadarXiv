// S.figures (design-b §1.6 L4, T10, G16, A26): a page's figure texts (the content class `figures`, docs/route/orphan-text.md
// stage 5), each drawn in its translation where it says something its source does not, in the faces of its font's family and
// weight (its CJK characters in the target's CJK face, the rest in the Latin one), each set fitted at one size (figure-fit.ts);
// else left the original's, why told: `no row`, `kept`, `untranslated`, `same` as its source, `unhidden` where the document
// holds no group of it, a face's refusal (`served`), `unfit`, `crowded`. Ported from engine 065c1d973 run.mjs paintFigures
// RUN:1441-1496 without its paint (the hidden box, the SVG, the text layer: the reader's and D.*'s), layer2.mjs figureRuns,
// figureRunsWidth, figureRunsDepth L2:4824-4839 and fonts.mjs classifyFont's family, weight and slant (fonts.mjs:42-52). A face
// not loaded yet is waited for (B.cover: `waiting`, its faces in `wait`), where today's run awaited it.
import { cover } from '../breaker/cover.ts'
import { type FitMeasure, fitMeasure } from '../breaker/measure.ts'
import { cjkClassRe } from '../breaker/script.ts'
import { shown, type TextPiece } from '../breaker/text.ts'
import type { Face, Token, TStyle } from '../breaker/tokens.ts'
import type { FaceId, Metrics } from '../types.ts'
import { CJK_FOOT, type FitFigure, fitFigureSet, sameAsSource } from './figure-fit.ts'

/** a figure unit on its page (figure-rows.mjs checkFigures): its run's first glyph's origin, its direction, its box's length
 *  along it, its size and band, its anchor, its fill (-1 none), its font's name, its set, its room, the stroke under its text */
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
  set: string
}
/** a figure unit's row as the door gives it (rows.mjs unitOf): its state and its pieces */
export type FigureUnit = { state: string; pieces?: readonly ({ t: string; s?: string; tr?: boolean } | TextPiece)[] }
/** a run of a figure's translation in one face (figureRuns) */
export type FigureRun = { s: string; face: Face; cls: 'cjk' | 'latin' }
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
  /** the rules' cjkQuotes and the last floor (P.floorMin) */
  rules: { cjkQuotes?: boolean; floorMin: number }
  metrics: Metrics
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

/** a figure's translation in its runs by script, each in its face (L2:4825 figureRuns) */
export function figureRuns(text: string, faceOf: (cls: 'cjk' | 'latin') => Face, quotes: boolean): FigureRun[] {
  const cjkRe = cjkClassRe(quotes),
    runs: { cls: 'cjk' | 'latin'; s: string }[] = []
  for (const ch of text) {
    const cls = cjkRe.test(ch) ? 'cjk' : 'latin',
      last = runs.at(-1)
    if (last?.cls === cls) last.s += ch
    else runs.push({ cls, s: ch })
  }
  return runs.map((r) => ({ s: r.s, face: faceOf(r.cls), cls: r.cls }))
}
/** figureRuns' width at size 1, each run's in its face (L2:4836 figureRunsWidth, widthOf L2:1322) */
export const figureRunsWidth = (runs: readonly FigureRun[], m: FitMeasure): number =>
  runs.reduce((a, r) => a + m.w100(r.s, r.face) / 100, 0)
/** how far under its baseline figureRuns reach at size 1, a CJK run's held to its face's em box (L2:4839 figureRunsDepth) */
export const figureRunsDepth = (runs: readonly FigureRun[], m: FitMeasure): number =>
  runs.reduce(
    (d, r) =>
      Math.max(
        d,
        r.cls === 'cjk'
          ? Math.min(m.ink100(r.s, r.face).d / 100, CJK_FOOT * (r.face.size ?? 1))
          : m.ink100(r.s, r.face).d / 100,
      ),
    0,
  )

/** a row a translation (rows.mjs: whole or partial, with its pieces) */
const translated = (u: FigureUnit | undefined): u is FigureUnit & { pieces: NonNullable<FigureUnit['pieces']> } =>
  !!u?.pieces && (u.state === 'whole' || u.state === 'partial')

/** S.figures on one page (RUN:1441 paintFigures): each figure unit's outcome, in its rows' order; the faces to wait for */
export function figures(i: FiguresInput): { figures: Figure[]; wait: [FaceId, string][] } {
  const m = fitMeasure(i.metrics)
  const out: Figure[] = [],
    wait: [FaceId, string][] = []
  const ready: { f: FigureRow; rec: Figure; text: string; runs: FigureRun[]; width1: number; depth1: number }[] = []
  for (const f of i.figures) {
    const rec: Figure = { id: f.id, group: f.group, page: f.page, drawn: false, why: null }
    out.push(rec)
    const u = i.unit(f.id)
    if (!translated(u)) {
      rec.why = !u ? 'no row' : u.state === 'kept' ? 'kept' : 'untranslated'
      continue
    }
    const text = u.pieces
      .map((p) => (p.t === 'text' ? shown(p as TextPiece) : ' '))
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
    if (!text || sameAsSource(text, i.src(f.id))) {
      Object.assign(rec, { why: 'same', text })
      continue
    }
    if (!i.grouped(f.group)) {
      Object.assign(rec, { why: 'unhidden', text })
      continue
    }
    const cf = fontClassOf(f.font)
    const fam = cf.fam === 'math' ? 'serif' : cf.fam
    const st: TStyle = { fam, bold: cf.bold, italic: cf.italic, caps: false, design: i.designs[fam] ?? i.designs.serif }
    const runs = figureRuns(text, (cls) => i.faceOf(st, cls), !!i.rules.cjkQuotes)
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
    ready.push({ f, rec, text, runs, width1: figureRunsWidth(runs, m), depth1: figureRunsDepth(runs, m) })
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
  for (const list of bySet.values())
    fitFigureSet(list, i.rules.floorMin).forEach((fit, k) => {
      fits.set(list[k]!, fit)
    })
  for (const c of ready) {
    const { f, rec, text, runs } = c,
      fit = fits.get(c)
    if (!fit) {
      Object.assign(rec, { why: fit === false ? 'crowded' : 'unfit', text })
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
